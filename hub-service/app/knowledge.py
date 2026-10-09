"""Banco de conocimiento: aprende del historial real de leads (nunca de las simulaciones) qué fuentes, servicios, campañas y asesores convierten mejor,
en qué horas llegan los mejores clientes y cuánto tardan en cerrar; la IA local redacta recomendaciones a partir de esos datos."""
import json, logging, statistics
from datetime import datetime, timedelta, timezone

from . import db, simulate
from .espo import Espo

log = logging.getLogger("hub.kb")
WON = ("Cierre Exitoso", "Converted")
DAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]


async def _leads(espo: Espo) -> list[dict]:
    out, off = [], 0
    while off < 6000:
        r = await espo.get("Lead", maxSize=200, offset=off, orderBy="createdAt", order="desc",
                           select="status,source,createdAt,modifiedAt,assignedUserName,campaignName,suggestedService,isSimulation")
        out += r.get("list", [])
        off += 200
        if off >= r.get("total", 0):
            break
    return [l for l in out if not l.get("isSimulation")]


def _group(leads: list[dict], key) -> list[dict]:
    g: dict[str, list[int]] = {}
    for l in leads:
        k = key(l) or "Sin dato"
        a = g.setdefault(k, [0, 0])
        a[0] += 1
        a[1] += 1 if l["status"] in WON else 0
    rows = [{"name": k, "n": v[0], "won": v[1], "rate": round(100 * v[1] / v[0], 1)} for k, v in g.items()]
    return sorted(rows, key=lambda r: (-r["n"], r["name"]))[:10]


def _dt(s: str | None) -> datetime | None:
    try:
        return datetime.strptime(s[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    except Exception:
        return None


def compute(leads: list[dict]) -> dict:
    total, won = len(leads), [l for l in leads if l["status"] in WON]
    dead = [l for l in leads if l["status"] == "Dead"]
    days = []
    for l in won:
        a, b = _dt(l.get("createdAt")), _dt(l.get("modifiedAt"))
        if a and b and b >= a:
            days.append((b - a).total_seconds() / 86400)
    now = datetime.now(timezone.utc)
    def win(d0, d1):
        sub = [l for l in leads if (c := _dt(l.get("createdAt"))) and now - timedelta(days=d1) <= c < now - timedelta(days=d0)]
        return {"leads": len(sub), "won": sum(1 for l in sub if l["status"] in WON)}
    wd, hr = [[0, 0] for _ in range(7)], [[0, 0] for _ in range(24)]
    for l in leads:
        c = _dt(l.get("createdAt"))
        if c:
            wd[c.weekday()][0] += 1; hr[c.hour][0] += 1
            if l["status"] in WON:
                wd[c.weekday()][1] += 1; hr[c.hour][1] += 1
    return {"total": total, "won": len(won), "dead": len(dead), "open": total - len(won) - len(dead), "rate": round(100 * len(won) / total, 1) if total else 0,
            "daysToWinAvg": round(statistics.mean(days), 1) if days else None, "daysToWinMedian": round(statistics.median(days), 1) if days else None,
            "bySource": _group(leads, lambda l: l.get("source")), "byService": _group(leads, lambda l: l.get("suggestedService")),
            "byCampaign": _group(leads, lambda l: l.get("campaignName")), "byAdvisor": _group(leads, lambda l: l.get("assignedUserName")),
            "byStatus": _group(leads, lambda l: l.get("status")),
            "byWeekday": [{"name": DAYS[i], "n": a, "won": w} for i, (a, w) in enumerate(wd)], "byHour": [{"name": f"{h:02d}h", "n": a, "won": w} for h, (a, w) in enumerate(hr) if a],
            "last30": win(0, 30), "prev30": win(30, 60)}


def findings(s: dict) -> list[str]:
    """Hallazgos calculados (sin IA): siempre disponibles aunque el modelo no responda."""
    out, MIN = [], 5
    if s["total"] < 10:
        return [f"Aún hay pocos leads reales ({s['total']}): las conclusiones serán más confiables a partir de unas decenas de leads."]
    out.append(f"De {s['total']} leads, {s['won']} cerraron ({s['rate']}%).")
    for key, label in (("bySource", "fuente"), ("byService", "servicio"), ("byCampaign", "campaña"), ("byAdvisor", "asesor")):
        rows = [r for r in s[key] if r["n"] >= MIN and r["name"] != "Sin dato"]
        if len(rows) >= 2:
            best, worst = max(rows, key=lambda r: r["rate"]), min(rows, key=lambda r: r["rate"])
            if best["rate"] > worst["rate"]:
                out.append(f"Mejor {label}: «{best['name']}» convierte {best['rate']}% ({best['won']}/{best['n']}); la más baja es «{worst['name']}» con {worst['rate']}%.")
    hrs = [r for r in s["byHour"] if r["n"] >= MIN]
    if hrs:
        b = max(hrs, key=lambda r: r["won"] / r["n"]); out.append(f"Los leads que llegan hacia las {b['name']} son los que más cierran ({round(100 * b['won'] / b['n'])}%).")
    if s["daysToWinMedian"] is not None:
        out.append(f"Un cierre tarda en mediana {s['daysToWinMedian']} días (promedio {s['daysToWinAvg']}): hacer seguimiento antes de ese plazo evita que se enfríen.")
    a, b = s["last30"], s["prev30"]
    if a["leads"] and b["leads"]:
        out.append(f"Últimos 30 días: {a['leads']} leads y {a['won']} cierres, frente a {b['leads']} y {b['won']} en los 30 anteriores.")
    return out


async def refresh(tenant: dict, llm) -> dict:
    simulate.ensure_schema()
    leads = await _leads(Espo(tenant))
    stats = compute(leads)
    stats["findings"] = findings(stats)
    summary = ""
    if stats["total"] >= 10:
        brief = {k: stats[k] for k in ("total", "won", "rate", "daysToWinMedian", "bySource", "byService", "byCampaign", "byAdvisor", "byWeekday", "byHour", "last30", "prev30")}
        try:
            summary = await llm("Eres un analista comercial. Con los datos JSON de un CRM de leads escribe en español, de forma clara y breve, 5 recomendaciones concretas y accionables "
                                "para captar mejores clientes (dónde invertir, a quién priorizar, cuándo contactar, qué corregir). Usa SOLO los datos dados; no inventes cifras. Formato: lista numerada.",
                                json.dumps(brief, ensure_ascii=False))
        except Exception as e:
            log.warning("resumen IA no disponible: %s", str(e)[:120])
    with db.pool.connection() as c:
        c.execute("INSERT INTO kb_insights (tenant, generated_at, stats, summary) VALUES (%s, now(), %s, %s) ON CONFLICT (tenant) DO UPDATE SET generated_at=now(), stats=EXCLUDED.stats, summary=EXCLUDED.summary",
                  (tenant["slug"], json.dumps(stats), summary))
    return get(tenant["slug"])


def get(tenant: str) -> dict:
    simulate.ensure_schema()
    with db.pool.connection() as c:
        r = c.execute("SELECT generated_at, stats, summary FROM kb_insights WHERE tenant=%s", (tenant,)).fetchone()
        notes = c.execute("SELECT id, user_id, user_name, text, created_at FROM kb_notes WHERE tenant=%s ORDER BY id DESC LIMIT 100", (tenant,)).fetchall()
        sim = c.execute("SELECT step, count(*) n FROM sim_events e JOIN sim_runs r ON r.id=e.run_id WHERE r.tenant=%s AND e.status IN ('skip','error') GROUP BY step ORDER BY n DESC", (tenant,)).fetchall()
    return {"generatedAt": r["generated_at"] if r else None, "stats": r["stats"] if r else None, "summary": r["summary"] if r else "", "notes": [dict(n) for n in notes],
            "simGaps": [dict(s) for s in sim]}


def add_note(tenant: str, user_id: str, user_name: str, text: str) -> None:
    with db.pool.connection() as c:
        c.execute("INSERT INTO kb_notes (tenant, user_id, user_name, text) VALUES (%s,%s,%s,%s)", (tenant, user_id, user_name, text[:2000]))


def delete_note(tenant: str, note_id: int, user_id: str | None) -> bool:
    with db.pool.connection() as c:
        r = c.execute("DELETE FROM kb_notes WHERE id=%s AND tenant=%s" + (" AND user_id=%s" if user_id else "") + " RETURNING id", (note_id, tenant, user_id) if user_id else (note_id, tenant)).fetchone()
    return bool(r)
