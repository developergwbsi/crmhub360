"""Mensajes predefinidos de WhatsApp: lo que el sistema contesta solo, sin IA, cuando una línea tiene «mensajes predefinidos» como quien responde.
Cuatro piezas, todas opcionales: saludo (la primera vez que escribe en un tiempo), fuera de horario, menú de opciones (el cliente responde con un número o una palabra)
y palabras clave; cada opción o palabra puede, además de responder, avisar a una persona o crear una tarea de llamada. Lo que no encaja queda para los asesores.
Dos formas de usarlos: como quien responde en la línea (responder = «preset») o como **respaldo**: solo cuando nadie puede atender (fuera del horario de los asesores y sin comercial virtual en línea).
Nunca contesta si el lead ya lo atiende un comercial virtual. Configuración: settings.presets."""
import json
import logging
import re
import unicodedata
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from . import db

log = logging.getLogger("hub.presets")
SCHEMA = "CREATE TABLE IF NOT EXISTS preset_log (tenant TEXT NOT NULL, lead_id TEXT NOT NULL, kind TEXT NOT NULL, at TIMESTAMPTZ NOT NULL DEFAULT now());\nCREATE INDEX IF NOT EXISTS preset_log_lead ON preset_log (tenant, lead_id, at DESC);"
ACTIONS = {"reply": "Solo responder", "human": "Avisar a una persona del equipo", "callback": "Crear una tarea para que lo llamen"}
DEFAULT = {"enabled": False, "fallback": False,
           "greeting": {"enabled": True, "text": "¡Hola! Gracias por escribirnos. En un momento te atiende una persona de nuestro equipo.", "cooldown_hours": 12},
           "off_hours": {"enabled": False, "text": "Ahora estamos fuera de horario. Te respondemos apenas abramos.", "tz": "America/Bogota", "days": [1, 2, 3, 4, 5], "start": "08:00", "end": "18:00"},
           "menu": {"enabled": False, "intro": "¿Qué necesitas? Responde con el número:", "options": []},
           "keywords": []}


def ensure_schema() -> None:
    with db.pool.connection() as c:
        c.execute(SCHEMA)


def _act(v) -> str:
    return v if v in ACTIONS else "reply"


def _t(v, n=700) -> str:
    return str(v or "").strip()[:n]


def config(tenant: dict) -> dict:
    raw = ((tenant.get("settings") or {}).get("presets") or {})
    out = json.loads(json.dumps(DEFAULT))
    out["enabled"] = bool(raw.get("enabled"))
    out["fallback"] = bool(raw.get("fallback"))
    g, o, m = raw.get("greeting") or {}, raw.get("off_hours") or {}, raw.get("menu") or {}
    out["greeting"].update({"enabled": g.get("enabled", True) is not False, "text": _t(g.get("text")) or out["greeting"]["text"], "cooldown_hours": max(1, min(168, int(g.get("cooldown_hours") or 12)))})
    out["off_hours"].update({"enabled": bool(o.get("enabled")), "text": _t(o.get("text")) or out["off_hours"]["text"], "tz": _t(o.get("tz"), 40) or "America/Bogota",
                             "days": sorted({int(d) for d in (o.get("days") or out["off_hours"]["days"]) if str(d).isdigit() and 1 <= int(d) <= 7}) or [1, 2, 3, 4, 5],
                             "start": _t(o.get("start"), 5) or "08:00", "end": _t(o.get("end"), 5) or "18:00"})
    out["menu"].update({"enabled": bool(m.get("enabled")), "intro": _t(m.get("intro"), 300) or out["menu"]["intro"],
                        "options": [{"key": _t(x.get("key"), 20) or str(i + 1), "label": _t(x.get("label"), 60), "reply": _t(x.get("reply")), "action": _act(x.get("action"))} for i, x in enumerate(m.get("options") or []) if _t(x.get("label")) and _t(x.get("reply"))][:9]})
    out["keywords"] = [{"words": [w for w in (_t(x, 40).lower() for x in (k.get("words") if isinstance(k.get("words"), list) else str(k.get("words") or "").split(","))) if w][:8], "reply": _t(k.get("reply")), "action": _act(k.get("action"))}
                       for k in (raw.get("keywords") or []) if _t(k.get("reply"))][:20]
    out["keywords"] = [k for k in out["keywords"] if k["words"]]
    return out


def save(slug: str, body: dict) -> dict:
    clean = config({"settings": {"presets": body}})
    with db.pool.connection() as c:
        c.execute("UPDATE tenants SET settings = jsonb_set(COALESCE(settings,'{}'::jsonb), '{presets}', %s::jsonb, true) WHERE slug=%s", (json.dumps(clean), slug))
    return clean


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()).strip(" .,!?¡¿")


def in_hours(cfg: dict, now: datetime | None = None) -> bool:
    o = cfg["off_hours"]
    loc = (now or datetime.now(ZoneInfo(o["tz"]))).astimezone(ZoneInfo(o["tz"]))
    hm = lambda s: datetime.strptime(s, "%H:%M").time()
    return loc.isoweekday() in o["days"] and hm(o["start"]) <= loc.time() < hm(o["end"])


def agent_online(tenant: dict) -> bool:
    """¿Hay un comercial virtual encendido y en modo automático que atienda solo?"""
    from . import agent
    try:
        if not agent.licensed(tenant) or agent.engine_paused(tenant):
            return False
        return any(a.get("enabled", True) and (a.get("config") or {}).get("mode") == "auto" for a in agent.agents(tenant))
    except Exception:
        return False


def nobody_available(tenant: dict, cfg: dict | None = None) -> bool:
    """Nadie puede atender ahora: los asesores están fuera de su horario y no hay comercial virtual en línea. Sin horario configurado se supone que los asesores atienden."""
    cfg = cfg or config(tenant)
    return bool(cfg["off_hours"]["enabled"]) and not in_hours(cfg) and not agent_online(tenant)


def menu_text(cfg: dict) -> str:
    m = cfg["menu"]
    return (m["intro"] + "\n" + "\n".join(f"{o['key']}. {o['label']}" for o in m["options"])) if m["enabled"] and m["options"] else ""


def reply_for(cfg: dict, text: str, recent: dict, now: datetime | None = None) -> tuple[str, str, str] | None:
    """(clase, texto, acción) de lo que se contesta, o None si lo atienden los asesores. `recent` indica qué se envió en la ventana: {'greeting': bool, 'hour': n}."""
    if not cfg["enabled"] or recent.get("hour", 0) >= 3:
        return None
    n = _norm(text)
    for o in cfg["menu"]["options"] if cfg["menu"]["enabled"] else []:
        if n and (n == _norm(o["key"]) or n == _norm(o["label"])):
            return "menu", o["reply"], o.get("action", "reply")
    if cfg["menu"]["enabled"] and cfg["menu"]["options"] and n in ("menu", "opciones", "ayuda", "inicio"):
        return "menu", menu_text(cfg), "reply"
    for k in cfg["keywords"]:
        if any(re.search(rf"(?<!\w){re.escape(_norm(w))}(?!\w)", n) for w in k["words"]):
            return "keyword", k["reply"], k.get("action", "reply")
    if recent.get("greeting"):
        return None
    off = cfg["off_hours"]["enabled"] and not in_hours(cfg, now)
    base = cfg["off_hours"]["text"] if off else (cfg["greeting"]["text"] if cfg["greeting"]["enabled"] else "")
    if not base and not menu_text(cfg):
        return None
    menu = menu_text(cfg)
    return ("off_hours" if off else "greeting"), (base + ("\n\n" + menu if menu else "")).strip(), "reply"


def _recent(slug: str, lead_id: str, hours: int) -> dict:
    with db.pool.connection() as c:
        g = c.execute("SELECT 1 FROM preset_log WHERE tenant=%s AND lead_id=%s AND kind IN ('greeting','off_hours') AND at > now() - make_interval(hours => %s) LIMIT 1", (slug, lead_id, hours)).fetchone()
        n = c.execute("SELECT count(*) n FROM preset_log WHERE tenant=%s AND lead_id=%s AND at > now() - interval '1 hour'", (slug, lead_id)).fetchone()["n"]
    return {"greeting": bool(g), "hour": n}


async def handle(tenant: dict, lead_id: str, phone: str | None, text: str) -> str | None:
    """Contesta con un mensaje predefinido si corresponde; devuelve el texto enviado (o None)."""
    from . import whatsapp
    cfg, slug = config(tenant), tenant["slug"]
    if not cfg["enabled"] or not phone:
        return None
    with db.pool.connection() as c:   # si lo atiende un comercial virtual, no se mete
        busy = c.execute("SELECT 1 FROM agent_leads WHERE tenant=%s AND lead_id=%s AND state IN ('active','waiting_reply','awaiting_approval') LIMIT 1", (slug, lead_id)).fetchone()
    if busy:
        return None
    r = reply_for(cfg, text, _recent(slug, lead_id, cfg["greeting"]["cooldown_hours"]))
    if not r:
        return None
    kind, msg, action = r
    try:
        await whatsapp.send(tenant, lead_id, msg, "Respuesta automática", None, phone)
    except Exception as e:
        log.warning("mensaje predefinido: %s", str(e)[:120])
        return None
    with db.pool.connection() as c:
        c.execute("INSERT INTO preset_log (tenant, lead_id, kind) VALUES (%s,%s,%s)", (slug, lead_id, kind))
    if action != "reply":
        await _do_action(tenant, lead_id, action, text)
    return msg


async def _do_action(tenant: dict, lead_id: str, action: str, text: str) -> None:
    """Además de responder: avisa a una persona del equipo o le deja una tarea de llamada. Nunca rompe la respuesta ya enviada."""
    from . import ingest, push
    from .espo import Espo
    espo = Espo(tenant)
    try:
        lead = await espo.get(f"Lead/{lead_id}", select="assignedUserId,name")
        why = "pidió hablar con una persona" if action == "human" else "pidió que lo llamen"
        await espo.note(lead_id, f"[Respuesta automática] El cliente {why}. Escribió: «{(text or '')[:200]}»")
        owner = lead.get("assignedUserId")
        if action == "callback":
            task = {"name": f"Llamar a {lead.get('name') or 'el cliente'} (lo pidió por WhatsApp)", "status": "Not Started", "priority": "High", "parentType": "Lead", "parentId": lead_id,
                    "description": f"El cliente pidió que lo llamen. Mensaje: {(text or '')[:300]}"}
            if owner:
                task["assignedUserId"] = owner
            await espo.post("Task", task)
        await ingest.notify_owner(tenant, lead_id, lead.get("name"), f"Cliente que {why}: {(text or '')[:100]}")
    except Exception as e:
        log.warning("acción del mensaje predefinido: %s", str(e)[:120])
