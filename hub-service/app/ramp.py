"""Escalado de la prospección: sube (o baja) solo el ritmo de búsqueda, calificación y correos en frío según los resultados reales.

Un «nivel» fija tres topes a la vez, para que nunca queden descuadrados:
  · empresas por día que busca el buscador (settings.finder.daily_limit)
  · prospectos que pasan por día a Valeria (settings.qualifier.daily_pass y settings.prospecting.daily_limit)
  · correos en frío por día (outbound.max_email_per_day de cada comercial virtual)

Modo «auto»: cada noche mide los últimos días y decide subir un nivel, mantener o bajar. Modo «manual»: solo recomienda; la persona elige el nivel y,
si salta por encima de lo recomendado, ve lo que eso acarrea y debe confirmarlo. En ambos modos la pantalla muestra siempre la recomendación y sus consecuencias.
Configuración en settings.ramp = {enabled, mode, max_level, level, level_since, frozen_until, last_eval, history[]}."""
import json
import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from . import agent, compliance, db, finder, qualifier, wallet

log = logging.getLogger("hub.ramp")

# nivel → topes (correos/día, pasan/día, empresas/día), nombre y lo que acarrea
LEVELS = {
    1: {"name": "Arranque", "email": 5, "pass": 5, "finder": 15,
        "implies": ["Muy poco riesgo para la reputación del remitente: ideal con un dominio o Gmail nuevo.",
                    "Sirve para validar el mensaje y los filtros; verás pocas respuestas por día.",
                    "Gasto mínimo de búsqueda e IA."]},
    2: {"name": "Calentamiento", "email": 10, "pass": 10, "finder": 30,
        "implies": ["Se duplican los correos: si el remitente aún es nuevo, los rebotes o las quejas pesan más.",
                    "Esperable: ~5-6 prospectos aprobados al día y más respuestas que atender.",
                    "La búsqueda y la IA gastan el doble de créditos que en Arranque."]},
    3: {"name": "Crecimiento", "email": 20, "pass": 15, "finder": 45,
        "implies": ["20 correos al día en frío exigen lista limpia: un 5 % de rebotes ya daña la reputación del dominio.",
                    "Más respuestas y demos: alguien del equipo debe revisar la bandeja y la agenda a diario.",
                    "Más gasto de créditos; revisa el saldo (o el motor propio) antes de subir."]},
    4: {"name": "Alto ritmo", "email": 35, "pass": 25, "finder": 60,
        "implies": ["Volumen alto para correo en frío desde un solo remitente: vigila bajas y rebotes cada día.",
                    "Valeria puede abrir muchas conversaciones a la vez: sin un humano atento se enfrían los interesados.",
                    "El buscador tiende a repetir empresas o traer más candidatas dudosas; el filtro rechazará más."]},
    5: {"name": "Máximo recomendado", "email": 50, "pass": 35, "finder": 80,
        "implies": ["Es el límite razonable para un solo remitente; por encima suele haber bloqueos de proveedores de correo.",
                    "Las bajas y marcas de spam se acumulan rápido; una racha mala puede dejar el dominio en lista negra.",
                    "Consumo de créditos de búsqueda e IA alto: confirma que el saldo o el motor propio lo cubren."]},
    6: {"name": "Extremo (solo manual)", "email": 80, "pass": 50, "finder": 100,
        "implies": ["Riesgo alto de que Gmail/Outlook manden los correos a spam o bloqueen el remitente, y eso se arrastra semanas.",
                    "Solo con varios remitentes o dominios calentados; con uno solo no se recomienda.",
                    "La calidad de prospectos baja: se agotan las empresas buenas y se llenan las dudosas.",
                    "El escalado automático nunca llega aquí; solo se llega eligiéndolo a mano."]},
}
MIN_DAYS = 3          # días con envíos en el nivel actual antes de poder subir
MIN_SENDS = 10        # envíos mínimos para que los porcentajes signifiquen algo
UP_BOUNCE, UP_OPTOUT = 0.02, 0.02          # para subir: rebotes y bajas por debajo de 2 %
DOWN_BOUNCE, DOWN_OPTOUT = 0.05, 0.03      # para bajar: rebotes ≥ 5 % o bajas ≥ 3 %
FREEZE_DAYS = 7       # tras bajar por una alerta, no se sube durante 7 días


def _now() -> datetime:
    return datetime.now(timezone.utc)


def config(tenant: dict) -> dict:
    r = ((tenant.get("settings") or {}).get("ramp") or {})
    return {"enabled": bool(r.get("enabled")), "mode": "manual" if r.get("mode") == "manual" else "auto", "max_level": max(1, min(5, int(r.get("max_level") or 4))),
            "level": r.get("level") if r.get("level") in LEVELS else None, "level_since": r.get("level_since"), "frozen_until": r.get("frozen_until"),
            "last_eval": r.get("last_eval"), "history": list(r.get("history") or [])[-30:]}


def _save(slug: str, patch: dict) -> None:
    with db.pool.connection() as c:
        c.execute("UPDATE tenants SET settings = jsonb_set(COALESCE(settings,'{}'::jsonb), '{ramp}', COALESCE(settings->'ramp','{}'::jsonb) || %s::jsonb, true) WHERE slug=%s", (json.dumps(patch), slug))


def actual(tenant: dict) -> dict:
    """Los tres topes que están vigentes ahora mismo (leídos de donde de verdad se aplican)."""
    ag = agent.config(agent.for_agent(tenant))
    return {"email": int((ag.get("outbound") or {}).get("max_email_per_day") or 40), "pass": qualifier.config(tenant)["daily_pass"], "finder": finder.config(tenant)["daily_limit"]}


def level_of(values: dict) -> int | None:
    return next((n for n, L in LEVELS.items() if L["email"] == values["email"] and L["pass"] == values["pass"] and L["finder"] == values["finder"]), None)


def apply_level(slug: str, level: int) -> dict:
    """Escribe los tres topes del nivel en su sitio (finder, calificador, ICP y cada comercial virtual)."""
    L = LEVELS[level]
    t = db.get_tenant(slug)
    finder._save(slug, {"daily_limit": L["finder"]})
    with db.pool.connection() as c:
        c.execute("UPDATE tenants SET settings = jsonb_set(COALESCE(settings,'{}'::jsonb), '{qualifier}', COALESCE(settings->'qualifier','{}'::jsonb) || %s::jsonb, true) WHERE slug=%s", (json.dumps({"daily_pass": L["pass"]}), slug))
        c.execute("UPDATE tenants SET settings = jsonb_set(COALESCE(settings,'{}'::jsonb), '{prospecting,daily_limit}', %s::jsonb, true) WHERE slug=%s", (json.dumps(L["pass"]), slug))
    lst = agent._raw_agents(t)
    for a in lst:
        a["config"] = {**(a.get("config") or {}), "outbound": {**((a.get("config") or {}).get("outbound") or {}), "max_email_per_day": L["email"]}}
    agent.save_agents(slug, lst)
    return actual(db.get_tenant(slug))


def metrics(tenant: dict, since: datetime | None = None) -> dict:
    """Resultados reales desde `since` (por defecto, el inicio del nivel actual; máximo 14 días atrás)."""
    slug = tenant["slug"]
    floor = _now() - timedelta(days=14)
    since = max(since or floor, floor)
    with db.pool.connection() as c:
        sends = c.execute("SELECT count(*) n, count(DISTINCT at::date) d FROM agent_events WHERE tenant=%s AND kind='send' AND channel='email' AND NOT dry AND at >= %s", (slug, since)).fetchone()
        bounces = c.execute("SELECT count(*) n FROM dnc WHERE tenant=%s AND reason ILIKE 'rebote%%' AND at >= %s", (slug, since)).fetchone()["n"]
        optouts = c.execute("SELECT count(*) n FROM dnc WHERE tenant=%s AND kind='email' AND reason NOT ILIKE 'rebote%%' AND source NOT IN ('csv','import','manual','auto','verificacion') AND at >= %s", (slug, since)).fetchone()["n"]
        replies = c.execute("SELECT count(DISTINCT lead_id) n FROM agent_events WHERE tenant=%s AND kind='inbound' AND at >= %s", (slug, since)).fetchone()["n"]
    n = sends["n"]
    return {"since": since.isoformat(), "sends": n, "days_with_sends": sends["d"], "bounces": bounces, "optouts": optouts, "replies": replies,
            "bounce_rate": round(bounces / n, 4) if n else 0, "optout_rate": round(optouts / n, 4) if n else 0, "reply_rate": round(replies / n, 4) if n else 0}


def assess(tenant: dict) -> dict:
    """Evalúa sin cambiar nada: qué haría la regla (subir/mantener/bajar), con la lista de condiciones y lo que acarrea el siguiente nivel."""
    cfg, vals = config(tenant), actual(tenant)
    lvl = level_of(vals)
    out = {"values": vals, "level": lvl, "custom": lvl is None, "checks": [], "action": "hold", "to_level": lvl, "reason": "", "next": None}
    if lvl is None:
        out["reason"] = "Los topes se cambiaron a mano y no coinciden con ningún nivel. Elige un nivel para que la regla vuelva a administrarlos."
        return out
    since = datetime.fromisoformat(cfg["level_since"]) if cfg.get("level_since") else _now() - timedelta(days=7)
    m = metrics(tenant, since)
    out["metrics"] = m
    health = compliance.cold_unhealthy(tenant["slug"])
    # --- bajar (alertas)
    if lvl > 1 and (health or (m["sends"] >= MIN_SENDS and (m["bounce_rate"] >= DOWN_BOUNCE or m["optout_rate"] >= DOWN_OPTOUT))):
        why = health or (f"{m['bounces']} rebotes en {m['sends']} envíos ({m['bounce_rate']:.1%})" if m["bounce_rate"] >= DOWN_BOUNCE else f"{m['optouts']} bajas en {m['sends']} envíos ({m['optout_rate']:.1%})")
        out.update(action="down", to_level=lvl - 1, reason=f"Alerta: {why}. Se recomienda bajar a «{LEVELS[lvl - 1]['name']}» y limpiar la lista antes de volver a subir.")
        return out
    nxt = lvl + 1 if lvl < 6 else None
    if nxt:
        out["next"] = {"level": nxt, **LEVELS[nxt]}
    cap = LEVELS[lvl]["email"]
    checks = [
        ("Días con envíos en este nivel", m["days_with_sends"] >= MIN_DAYS, f"{m['days_with_sends']} de {MIN_DAYS} necesarios"),
        ("Envíos suficientes para medir", m["sends"] >= MIN_SENDS, f"{m['sends']} de {MIN_SENDS} necesarios"),
        ("Uso del tope de correos", m["days_with_sends"] > 0 and m["sends"] / max(1, m["days_with_sends"]) >= 0.6 * cap, f"{(m['sends'] / max(1, m['days_with_sends'])):.1f} por día de {cap} permitidos (mínimo 60 %)"),
        ("Rebotes bajo 2 %", m["sends"] >= MIN_SENDS and m["bounce_rate"] < UP_BOUNCE, f"{m['bounces']} de {m['sends']} envíos ({m['bounce_rate']:.1%})" + ("" if m["sends"] >= MIN_SENDS else " · faltan envíos para medir")),
        ("Bajas bajo 2 %", m["sends"] >= MIN_SENDS and m["optout_rate"] < UP_OPTOUT, f"{m['optouts']} de {m['sends']} envíos ({m['optout_rate']:.1%})" + ("" if m["sends"] >= MIN_SENDS else " · faltan envíos para medir")),
        ("Hay respuestas (si ya van 20 envíos)", m["sends"] < 20 or m["replies"] > 0, f"{m['replies']} respuestas"),
        ("Sin alertas de reputación", not health, health or "todo en orden"),
        ("Con créditos o motor propio", wallet.has_funds(tenant), "saldo disponible" if wallet.has_funds(tenant) else "sin saldo"),
    ]
    fz = cfg.get("frozen_until")
    if fz and datetime.fromisoformat(fz) > _now():
        checks.append(("Sin pausa por alerta reciente", False, f"en pausa hasta {datetime.fromisoformat(fz).astimezone(ZoneInfo('America/Bogota')):%d/%m}"))
    out["checks"] = [{"name": a, "ok": bool(b), "detail": d} for a, b, d in checks]
    top = min(cfg["max_level"], 5)
    if lvl >= top:
        out["reason"] = f"Ya está en el techo que fijaste ({LEVELS[top]['name']}). Para pasar de ahí, súbelo a mano o amplía el techo."
    elif all(b for _, b, _ in checks):
        out.update(action="up", to_level=lvl + 1, reason=f"Todo en orden: se recomienda subir a «{LEVELS[lvl + 1]['name']}».")
    else:
        falta = [a for a, b, _ in checks if not b]
        out["reason"] = "Todavía no se cumple: " + "; ".join(falta).lower() + ". Se mantiene el nivel."
    return out


def _log(slug: str, entry: dict) -> None:
    cfg = config(db.get_tenant(slug))
    _save(slug, {"history": (cfg["history"] + [entry])[-30:]})


async def evaluate(tenant: dict, force_apply: bool = False) -> dict:
    """Evaluación nocturna: en modo auto aplica la decisión; en manual solo la registra como recomendación."""
    slug, cfg = tenant["slug"], config(tenant)
    a = assess(tenant)
    at = _now().isoformat()
    _save(slug, {"last_eval": at})
    applied = False
    if cfg["enabled"] and a["level"] and a["action"] in ("up", "down") and (cfg["mode"] == "auto" or force_apply):
        apply_level(slug, a["to_level"])
        _save(slug, {"level": a["to_level"], "level_since": at, **({"frozen_until": (_now() + timedelta(days=FREEZE_DAYS)).isoformat()} if a["action"] == "down" else {})})
        applied = True
        log.info("%s: escalado %s → nivel %s (%s)", slug, a["action"], a["to_level"], a["reason"])
    if a["action"] != "hold":
        _log(slug, {"at": at, "action": a["action"], "applied": applied, "from": a["level"], "to": a["to_level"], "reason": a["reason"],
                "mode": cfg["mode"], "metrics": {k: a.get("metrics", {}).get(k) for k in ("sends", "bounces", "optouts", "replies")}})
    return {**a, "applied": applied}


def warnings_for(tenant: dict, level: int) -> list[str]:
    """Lo que hay que saber antes de poner un nivel a mano: lo que acarrea y por qué sobrepasa lo recomendado."""
    a = assess(tenant)
    cur = a["level"] or 0
    out = []
    if level <= cur:
        return out
    if level >= 6:
        out.append("Es el nivel extremo: el escalado automático nunca lo usa por el riesgo para la reputación del remitente.")
    if level - cur > 1:
        out.append(f"Saltas {level - cur} niveles de una vez; lo prudente es subir de uno en uno y medir rebotes, bajas y respuestas entre cada paso.")
    if a.get("metrics") and a["metrics"]["sends"] < MIN_SENDS:
        out.append("Aún hay muy pocos envíos reales para saber si el remitente aguanta más volumen.")
    if a["action"] != "up" and a.get("checks"):
        falta = [c["name"] for c in a["checks"] if not c["ok"]]
        if falta:
            out.append("La regla todavía no recomienda subir; no se cumple: " + "; ".join(falta).lower() + ".")
    if a["action"] == "down":
        out.append("Hay una alerta de reputación activa: subir ahora agrava rebotes o bajas.")
    out += LEVELS[level]["implies"]
    return out


def view(tenant: dict) -> dict:
    cfg = config(tenant)
    a = assess(tenant)
    return {**cfg, "levels": [{"level": n, **{k: v for k, v in L.items()}} for n, L in LEVELS.items()], "assessment": a,
            "rules": {"min_days": MIN_DAYS, "min_sends": MIN_SENDS, "up_bounce": UP_BOUNCE, "up_optout": UP_OPTOUT, "down_bounce": DOWN_BOUNCE, "down_optout": DOWN_OPTOUT, "freeze_days": FREEZE_DAYS}}


def due(tenant: dict) -> bool:
    """Se evalúa una vez al día, de noche (20:00 hora local), para contar el día completo de envíos."""
    cfg = config(tenant)
    if not cfg["enabled"]:
        return False
    tz = ZoneInfo(((tenant.get("settings") or {}).get("agent") or {}).get("schedule", {}).get("tz") or "America/Bogota")
    now = datetime.now(tz)
    last = cfg.get("last_eval")
    if last and datetime.fromisoformat(last).astimezone(tz).date() == now.date():
        return False
    return now.hour >= 20
