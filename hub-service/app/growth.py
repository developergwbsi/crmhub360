"""Optimización diaria de la prospección (Growth loop). Una vez al día lee los resultados del comercial virtual saliente —por canal, por variante de cada paso y por nicho— y ajusta:
- Variantes: la que responde mucho peor que la mejor (con muestra suficiente) se reescribe con IA tomando como modelo a la ganadora; la anterior queda pausada (historial intacto).
- Estilo por canal: WhatsApp por debajo del umbral → mensajes más cortos y ganchos nuevos; correo por debajo del umbral → asuntos nuevos sin palabras de spam. Se guarda como «guía de estilo aprendida».
- Nichos: sin respuestas tras N intentos se pausan y el volumen diario de prospectos se reparte hacia los nichos que mejor responden.
Todo cambio queda en el historial (growth_log) y se puede revertir. Modo «auto» aplica solo; «propose» deja propuestas para aplicar con un clic."""
import asyncio
import json
import logging
import re
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from . import agent, db, llm, prospects

log = logging.getLogger("hub.growth")
SCHEMA = """
CREATE TABLE IF NOT EXISTS growth_log (id SERIAL PRIMARY KEY, tenant TEXT NOT NULL, agent_id TEXT NOT NULL DEFAULT '', at TIMESTAMPTZ NOT NULL DEFAULT now(), kind TEXT NOT NULL, title TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '', payload JSONB NOT NULL DEFAULT '{}', applied BOOLEAN NOT NULL DEFAULT false, reverted BOOLEAN NOT NULL DEFAULT false, by TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS growth_log_tenant ON growth_log (tenant, id DESC);
"""
MIN_CHANNEL_SENDS = {"whatsapp": 50, "email": 100}
STYLE_COOLDOWN_DAYS = 7


def ensure_schema() -> None:
    with db.pool.connection() as c:
        c.execute(SCHEMA)


# ---------------- atribución de resultados
def attribution(slug: str, agent_id: str, days: int = 30, include_dry: bool = False) -> tuple[list[dict], dict]:
    """Un registro por cada envío proactivo: canal, paso, variante, nicho, si falló la entrega y si el cliente respondió después (a la última variante enviada antes de su mensaje)."""
    with db.pool.connection() as c:
        sends = c.execute("SELECT e.id, e.lead_id, e.at, e.channel, e.title, e.data, e.detail FROM agent_events e JOIN agent_leads l ON l.tenant=e.tenant AND l.lead_id=e.lead_id AND COALESCE(l.agent_id,'main')=%s "
                          "WHERE e.tenant=%s AND e.kind='send' AND e.at > now() - make_interval(days => %s) " + ("" if include_dry else "AND e.dry=false AND e.sent=true ") + "ORDER BY e.at", (agent_id, slug, days)).fetchall()
        sends = [r for r in sends if (r["data"] or {}).get("kind") in ("first", "followup") or (not (r["data"] or {}).get("kind") and re.match(r"^(Primer contacto|Seguimiento)", r["title"] or ""))]
        ids = sorted({r["lead_id"] for r in sends})
        inb = c.execute("SELECT lead_id, at FROM agent_events WHERE tenant=%s AND kind='inbound' AND lead_id = ANY(%s) AND at > now() - make_interval(days => %s) ORDER BY at", (slug, ids, days)).fetchall() if ids else []
        errs = c.execute("SELECT channel, count(*) n FROM agent_events WHERE tenant=%s AND kind='error' AND title LIKE 'No se pudo enviar%%' AND at > now() - make_interval(days => %s) GROUP BY channel", (slug, days)).fetchall()
        niche = {r["lead_id"]: r["niche"] for r in c.execute("SELECT lead_id, niche FROM prospects WHERE tenant=%s AND lead_id = ANY(%s)", (slug, ids)).fetchall()} if ids else {}
    recs = []
    for r in sends:
        d = r["data"] or {}
        recs.append({"lead": r["lead_id"], "at": r["at"], "channel": (r["channel"] or "").lower(), "step": int(d.get("step") or 0), "variant": str(d.get("variant") or ""), "niche": niche.get(r["lead_id"]) or "directo",
                     "text": r["detail"] or "", "subject": d.get("subject") or "", "replied": False})
    by_lead: dict = {}
    for x in recs:
        by_lead.setdefault(x["lead"], []).append(x)
    done = set()
    for i in inb:
        prev = [x for x in by_lead.get(i["lead_id"], []) if x["at"] <= i["at"]]
        if prev and id(prev[-1]) not in done:
            prev[-1]["replied"] = True
            done.add(id(prev[-1]))
    # la respuesta también cuenta para el nicho y el canal del primer envío de ese lead (un lead que responde es un lead que respondió)
    return recs, {r["channel"]: r["n"] for r in errs}


def aggregate(recs: list[dict], key) -> dict:
    out: dict = {}
    for x in recs:
        k = key(x)
        o = out.setdefault(k, {"sends": 0, "replies": 0})
        o["sends"] += 1
        o["replies"] += 1 if x["replied"] else 0
    for o in out.values():
        o["rate"] = round(o["replies"] * 100 / o["sends"], 1) if o["sends"] else 0.0
    return out


def niche_leads(recs: list[dict]) -> dict:
    """Por nicho: leads contactados y leads que respondieron (cada lead cuenta una vez)."""
    by: dict = {}
    for x in recs:
        d = by.setdefault(x["niche"], {})
        d[x["lead"]] = d.get(x["lead"], False) or x["replied"]
    return {n: {"leads": len(v), "replied": sum(1 for r in v.values() if r)} for n, v in by.items()}


# ---------------- propuestas
VARIANT_SCHEMA = {"type": "object", "properties": {"angle": {"type": "string", "description": "nuevo enfoque (gancho) para el mensaje, en 1 o 2 frases, distinto del que falló"}}, "required": ["angle"]}
STYLE_SCHEMA = {"type": "object", "properties": {"guidelines": {"type": "string", "description": "reglas de estilo concretas y breves, en viñetas separadas por saltos de línea"}}, "required": ["guidelines"]}


async def _rewrite_variant(tenant: dict, cfg: dict, step: int, best: dict, worst: dict, stats: dict) -> str:
    c = cfg["company"]
    sysm = "Eres un experto en prospección comercial en frío. Mejoras los enfoques (ganchos) de los mensajes según datos reales de respuesta. Responde SOLO con el JSON pedido."
    user = (f"EMPRESA: {c['about'] or '(sin descripción)'}\nSERVICIOS: {c['services'] or '(sin descripción)'}\nPASO DE LA SECUENCIA: {step + 1} de 3\n\n"
            f"ENFOQUE GANADOR ({stats[best['id']]['replies']}/{stats[best['id']]['sends']} respuestas, {stats[best['id']]['rate']}%): {best['angle']}\n"
            f"ENFOQUE PERDEDOR ({stats[worst['id']]['replies']}/{stats[worst['id']]['sends']} respuestas, {stats[worst['id']]['rate']}%): {worst['angle']}\n\n"
            "Escribe un enfoque NUEVO que reemplace al perdedor: aprende de por qué el ganador funciona (más concreto, más cercano, una pregunta más fácil) pero no lo copies. No prometas resultados ni inventes datos.")
    d = await llm.chat_json(tenant, sysm, user, VARIANT_SCHEMA, 250)
    return str(d.get("angle") or "").strip()[:400]


async def _style_guide(tenant: dict, cfg: dict, channel: str, recs: list[dict], rate: float, threshold: int) -> str:
    good = [x for x in recs if x["channel"] == channel and x["replied"]][:5]
    bad = [x for x in recs if x["channel"] == channel and not x["replied"]][-8:]
    show = lambda xs: "\n---\n".join((f"Asunto: {x['subject']}\n" if channel == "email" else "") + x["text"][:500] for x in xs) or "(ninguno)"
    sysm = "Eres un experto en prospección comercial en frío. Analizas qué mensajes obtienen respuesta y escribes reglas de estilo para mejorar. Responde SOLO con el JSON pedido."
    extra = ("Mensajes de WhatsApp: más cortos (máx. 2 párrafos), el gancho en la primera línea, pregunta cerrada y fácil de responder." if channel == "whatsapp" else
             f"Correos: asuntos de 2 a 4 palabras como una nota interna, sin palabras de spam ({', '.join(agent.SPAM_WORDS[:8])}), una sola idea y un solo llamado.")
    user = (f"Canal: {channel}. La tasa de respuesta es {rate}% y el objetivo mínimo es {threshold}%.\n{extra}\n\nMENSAJES QUE SÍ OBTUVIERON RESPUESTA:\n{show(good)}\n\nMENSAJES SIN RESPUESTA:\n{show(bad)}\n\n"
            "Escribe de 3 a 5 reglas de estilo concretas (viñetas) para los próximos mensajes de este canal. No incluyas datos del cliente.")
    d = await llm.chat_json(tenant, sysm, user, STYLE_SCHEMA, 350)
    return str(d.get("guidelines") or "").strip()[:700]


def _log(slug: str, agent_id: str, kind: str, title: str, reason: str, payload: dict, applied: bool, by: str) -> int:
    with db.pool.connection() as c:
        return c.execute("INSERT INTO growth_log (tenant, agent_id, kind, title, reason, payload, applied, by) VALUES (%s,%s,%s,%s,%s,%s::jsonb,%s,%s) RETURNING id",
                         (slug, agent_id, kind, title, reason, json.dumps(payload, ensure_ascii=False), applied, by)).fetchone()["id"]


def _last_style_change(slug: str, agent_id: str, channel: str) -> datetime | None:
    with db.pool.connection() as c:
        r = c.execute("SELECT max(at) a FROM growth_log WHERE tenant=%s AND agent_id=%s AND kind='style' AND payload->>'channel'=%s AND reverted=false", (slug, agent_id, channel)).fetchone()
    return r["a"] if r else None


def recently_reverted(slug: str, agent_id: str, kind: str, payload: dict, days: int = 14) -> bool:
    """Si una persona revirtió hace poco un ajuste igual, no se vuelve a proponer (decidió que no)."""
    key, val = {"variant": ("old", payload.get("old", {}).get("id")), "style": ("channel", payload.get("channel")), "niche_pause": ("niche", payload.get("niche"))}[kind]
    with db.pool.connection() as c:
        if kind == "variant":
            return bool(c.execute("SELECT 1 FROM growth_log WHERE tenant=%s AND agent_id=%s AND kind='variant' AND reverted=true AND payload->'old'->>'id'=%s AND payload->>'step'=%s AND at > now() - make_interval(days => %s) LIMIT 1",
                                  (slug, agent_id, val, str(payload.get("step")), days)).fetchone())
        return bool(c.execute("SELECT 1 FROM growth_log WHERE tenant=%s AND agent_id=%s AND kind=%s AND reverted=true AND payload->>%s=%s AND at > now() - make_interval(days => %s) LIMIT 1", (slug, agent_id, kind, key, val, days)).fetchone())


def pending(slug: str, agent_id: str, kind: str, key: str, val: str) -> bool:
    with db.pool.connection() as c:
        return bool(c.execute("SELECT 1 FROM growth_log WHERE tenant=%s AND agent_id=%s AND kind=%s AND applied=false AND reverted=false AND payload->>%s=%s LIMIT 1", (slug, agent_id, kind, key, val)).fetchone())


# ---------------- aplicar y revertir
def _mutate_agent(slug: str, agent_id: str, fn) -> None:
    t = db.get_tenant(slug)
    lst = agent._raw_agents(t)
    cur = next((a for a in lst if a["id"] == agent_id), lst[0])
    cfg = agent._merge(agent.DEFAULTS, cur.get("config") or {})
    fn(cfg)
    cur["config"] = agent.clean_config(cfg)
    agent.save_agents(slug, lst)


def _set_paused(slug: str, niche: str, paused: bool) -> None:
    t = db.get_tenant(slug)
    cur = (t.get("settings") or {}).get("prospecting") or {}
    lst = [n for n in (cur.get("paused_niches") or []) if n != niche] + ([niche] if paused else [])
    with db.pool.connection() as c:
        c.execute("UPDATE tenants SET settings = jsonb_set(COALESCE(settings,'{}'::jsonb), '{prospecting}', COALESCE(settings->'prospecting','{}'::jsonb) || %s::jsonb, true) WHERE slug=%s", (json.dumps({"paused_niches": lst}), slug))


def apply_entry(slug: str, entry_id: int, by: str = "manual") -> dict:
    with db.pool.connection() as c:
        e = c.execute("SELECT * FROM growth_log WHERE tenant=%s AND id=%s", (slug, entry_id)).fetchone()
    if not e or e["applied"] or e["reverted"]:
        raise ValueError("Ese cambio ya se aplicó o se descartó.")
    p, aid = e["payload"], e["agent_id"]
    if e["kind"] == "variant":
        def f(cfg):
            vs = cfg["outbound"]["steps"][p["step"]]["variants"]
            for v in vs:
                if v["id"] == p["old"]["id"]:
                    v["active"] = False
            vs.append({"id": p["new"]["id"], "angle": p["new"]["angle"], "active": True})
            while len(vs) > 6:   # se conserva el historial hasta 6; salen primero las pausadas más antiguas
                idx = next((i for i, v in enumerate(vs) if v.get("active") is False), None)
                if idx is None:
                    break
                vs.pop(idx)
        _mutate_agent(slug, aid, f)
    elif e["kind"] == "style":
        _mutate_agent(slug, aid, lambda cfg: cfg["outbound"]["style"].__setitem__(p["channel"], p["after"]))
    elif e["kind"] == "niche_pause":
        _set_paused(slug, p["niche"], True)
    with db.pool.connection() as c:
        c.execute("UPDATE growth_log SET applied=true, by=%s WHERE id=%s", (by, entry_id))
    return {"ok": True}


def revert_entry(slug: str, entry_id: int, by: str = "manual") -> dict:
    with db.pool.connection() as c:
        e = c.execute("SELECT * FROM growth_log WHERE tenant=%s AND id=%s", (slug, entry_id)).fetchone()
    if not e or e["reverted"]:
        raise ValueError("Ese cambio ya estaba revertido.")
    p, aid = e["payload"], e["agent_id"]
    if e["applied"]:
        if e["kind"] == "variant":
            def f(cfg):
                vs = cfg["outbound"]["steps"][p["step"]]["variants"]
                cfg["outbound"]["steps"][p["step"]]["variants"] = [v for v in vs if v["id"] != p["new"]["id"]]
                for v in cfg["outbound"]["steps"][p["step"]]["variants"]:
                    if v["id"] == p["old"]["id"]:
                        v["active"] = True
            _mutate_agent(slug, aid, f)
        elif e["kind"] == "style":
            _mutate_agent(slug, aid, lambda cfg: cfg["outbound"]["style"].__setitem__(p["channel"], p["before"]))
        elif e["kind"] == "niche_pause":
            _set_paused(slug, p["niche"], False)
    with db.pool.connection() as c:
        c.execute("UPDATE growth_log SET reverted=true, by=%s WHERE id=%s", (by, entry_id))
    return {"ok": True}


# ---------------- el análisis diario
async def analyze(tenant: dict, agent_id: str, apply: bool | None = None, force: bool = False) -> dict:
    """Lee los resultados y propone (y, en modo auto o con apply=True, aplica) cambios. Con el comercial en modo prueba no optimiza (no hay respuestas reales) salvo force."""
    t = agent.for_agent(tenant, agent_id)
    cfg, slug = agent.config(t), tenant["slug"]
    g, ob = cfg["growth"], cfg["outbound"]
    out = {"agent": agent_id, "changes": [], "skipped": [], "stats": {}}
    if cfg["dry_run"] and not force:
        out["skipped"].append("El comercial virtual está en modo prueba: no hay respuestas reales que analizar.")
        return out
    do_apply = (g["mode"] == "auto") if apply is None else apply
    recs, errs = attribution(slug, agent_id, 30, include_dry=force and cfg["dry_run"])
    by_ch, by_var, by_niche = aggregate(recs, lambda x: x["channel"]), aggregate([x for x in recs if x["variant"]], lambda x: (x["step"], x["variant"])), niche_leads(recs)
    out["stats"] = {"channels": by_ch, "niches": by_niche, "total": len(recs)}

    async def add(kind, title, reason, payload):
        key = {"variant": "step", "style": "channel", "niche_pause": "niche"}[kind]
        if pending(slug, agent_id, kind, key, str(payload.get(key) if kind != "variant" else payload["old"]["id"])) and kind != "variant":
            return
        if recently_reverted(slug, agent_id, kind, payload):
            out["skipped"].append(f"{title}: se omite porque ese ajuste se revirtió hace poco.")
            return
        eid = _log(slug, agent_id, kind, title, reason, payload, False, "auto")
        if do_apply:
            apply_entry(slug, eid, "auto")
        out["changes"].append({"id": eid, "kind": kind, "title": title, "reason": reason, "applied": do_apply})

    # 1) variantes: una reescritura por paso y por día
    for si, st in enumerate(ob["steps"][:3]):
        act = [v for v in st["variants"] if v.get("active", True) and (si, v["id"]) in by_var and by_var[(si, v["id"])]["sends"] >= g["min_sends"]]
        if len(act) < 2:
            continue
        best = max(act, key=lambda v: by_var[(si, v["id"])]["rate"])
        worst = min(act, key=lambda v: by_var[(si, v["id"])]["rate"])
        sb, sw = by_var[(si, best["id"])], by_var[(si, worst["id"])]
        if best["id"] == worst["id"] or not (sw["rate"] < sb["rate"] * 0.5 or (sw["replies"] == 0 and sw["sends"] >= g["min_sends"] * 2)) or pending(slug, agent_id, "variant", "step", str(si)):
            continue
        try:
            angle = await _rewrite_variant(t, cfg, si, best, worst, {best["id"]: sb, worst["id"]: sw})
        except Exception as e:
            out["skipped"].append(f"No pude reescribir la variante {worst['id']}: {str(e)[:80]}"); continue
        if angle:
            base = re.sub(r"r\d+$", "", worst["id"])
            n = 1 + max([int(m.group(1)) for v in st["variants"] for m in [re.match(rf"^{re.escape(base)}r(\d+)$", v["id"])] if m] + [0])
            await add("variant", f"Paso {si + 1}: se reescribe la variante {worst['id']} ({sw['rate']}% de respuesta) tomando como modelo a {best['id']} ({sb['rate']}%)",
                      f"{sw['replies']}/{sw['sends']} respuestas frente a {sb['replies']}/{sb['sends']}", {"step": si, "old": {"id": worst["id"], "angle": worst["angle"]}, "new": {"id": f"{base}r{n}", "angle": angle}})
    # 2) estilo por canal
    for ch, thr, label in (("whatsapp", g["wa_min_rate"], "WhatsApp"), ("email", g["email_min_rate"], "correo")):
        s = by_ch.get(ch)
        if not s or s["sends"] < MIN_CHANNEL_SENDS[ch] or s["rate"] >= thr:
            continue
        last = _last_style_change(slug, agent_id, ch)
        if last and datetime.now(timezone.utc) - last < timedelta(days=STYLE_COOLDOWN_DAYS):
            out["skipped"].append(f"{label}: ya se ajustó el estilo hace menos de {STYLE_COOLDOWN_DAYS} días; se espera para medir el efecto.")
            continue
        try:
            guide = await _style_guide(t, cfg, ch, recs, s["rate"], thr)
        except Exception as e:
            out["skipped"].append(f"No pude ajustar el estilo de {label}: {str(e)[:80]}"); continue
        if guide:
            await add("style", f"{label.capitalize()}: respuesta de {s['rate']}% (mínimo {thr}%); se ajusta la guía de estilo", f"{s['replies']}/{s['sends']} respuestas", {"channel": ch, "before": ob["style"].get(ch, ""), "after": guide})
    # 3) nichos sin respuesta
    paused = set(((tenant.get("settings") or {}).get("prospecting") or {}).get("paused_niches") or [])
    for n, v in by_niche.items():
        if n in paused or n == "directo":
            continue
        att = sum(1 for x in recs if x["niche"] == n)
        if att >= g["niche_pause_after"] and v["replied"] == 0:
            await add("niche_pause", f"Nicho «{n}» en pausa: {att} intentos sin ninguna respuesta; el volumen pasa a los nichos que mejor responden", f"{att} envíos, 0 respuestas", {"niche": n, "attempts": att})
    return out


async def run_daily(tenant: dict, force: bool = False) -> list[dict]:
    res = []
    for a in agent.agents(tenant):
        c = a["config"]
        if c["outbound"]["enabled"] and c["growth"]["enabled"]:
            try:
                res.append(await analyze(tenant, a["id"], force=force))
            except Exception:
                log.exception("optimización de %s/%s", tenant["slug"], a["id"])
    return res


# ---------------- panorama para la interfaz
def overview(tenant: dict, agent_id: str) -> dict:
    t = agent.for_agent(tenant, agent_id)
    cfg, slug = agent.config(t), tenant["slug"]
    recs, errs = attribution(slug, t["_agent"]["id"], 30, include_dry=cfg["dry_run"])
    ch = aggregate(recs, lambda x: x["channel"])
    g = cfg["growth"]
    chans = [{"channel": k, "sends": v["sends"], "replies": v["replies"], "rate": v["rate"], "target": g["wa_min_rate"] if k == "whatsapp" else g["email_min_rate"] if k == "email" else None,
              "delivery": round(v["sends"] * 100 / (v["sends"] + errs.get(k, 0)), 1) if v["sends"] else None} for k, v in sorted(ch.items())]
    nl = niche_leads(recs)
    paused = set(((tenant.get("settings") or {}).get("prospecting") or {}).get("paused_niches") or [])
    niches = [{"niche": n, "leads": v["leads"], "replied": v["replied"], "rate": round(v["replied"] * 100 / v["leads"], 1) if v["leads"] else 0, "paused": n in paused} for n, v in sorted(nl.items(), key=lambda x: -x[1]["leads"])]
    for n in paused:
        if n not in nl:
            niches.append({"niche": n, "leads": 0, "replied": 0, "rate": 0, "paused": True})
    with db.pool.connection() as c:
        logr = c.execute("SELECT id, at, kind, title, reason, payload, applied, reverted, by FROM growth_log WHERE tenant=%s ORDER BY id DESC LIMIT 30", (slug,)).fetchall()
        last = c.execute("SELECT value FROM kv WHERE key=%s", (f"growth_last:{slug}:{t['_agent']['id']}",)).fetchone()
    return {"channels": chans, "niches": niches, "log": [{**dict(r), "at": r["at"].isoformat()} for r in logr], "lastRun": last["value"] if last else None, "dry_run": cfg["dry_run"], "config": g}


def niche_weights(slug: str, tenant: dict) -> dict:
    """Peso de cada nicho para repartir el cupo diario de prospectos: (respuestas+1)/(contactados+3); los pausados no entran."""
    agents_ = [a["id"] for a in agent.agents(tenant) if a["config"]["outbound"]["enabled"]] or ["main"]
    w: dict = {}
    for aid in agents_:
        recs, _ = attribution(slug, aid, 60, include_dry=False)
        for n, v in niche_leads(recs).items():
            cur = w.setdefault(n, [0, 0]); cur[0] += v["replied"]; cur[1] += v["leads"]
    return {n: (a + 1) / (b + 3) for n, (a, b) in w.items()}


# ---------------- tarea diaria
async def loop() -> None:
    """Cada 10 minutos revisa si a alguna empresa le toca la optimización de hoy (a la hora que configuró, en su zona horaria)."""
    await asyncio.sleep(40)
    while True:
        try:
            with db.pool.connection() as c:
                tenants = [dict(r) for r in c.execute("SELECT * FROM tenants WHERE status='active'").fetchall()]
            for t in tenants:
                if not agent.licensed(t) or agent.engine_paused(t):
                    continue
                for a in agent.agents(t):
                    cfg = a["config"]
                    if not (cfg["outbound"]["enabled"] and cfg["growth"]["enabled"]):
                        continue
                    now = datetime.now(ZoneInfo(cfg["schedule"]["tz"]))
                    key = f"growth_last:{t['slug']}:{a['id']}"
                    with db.pool.connection() as c:
                        last = c.execute("SELECT value FROM kv WHERE key=%s", (key,)).fetchone()
                    if now.hour >= cfg["growth"]["hour"] and (not last or last["value"][:10] != now.strftime("%Y-%m-%d")):
                        with db.pool.connection() as c:
                            c.execute("INSERT INTO kv (key, value) VALUES (%s,%s) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value", (key, now.strftime("%Y-%m-%d %H:%M")))
                        try:
                            await analyze(t, a["id"])
                        except Exception:
                            log.exception("optimización diaria %s/%s", t["slug"], a["id"])
        except Exception:
            log.exception("ciclo de optimización")
        await asyncio.sleep(600)
