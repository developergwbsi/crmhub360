"""Presentadora virtual de las videollamadas de demostración. El servicio `presenter-service` (voz local, avatar, pantalla compartida) entra a la sala de LiveKit;
este módulo le da el cerebro: arma el plan (persona, diapositivas), contesta cada turno con el modelo de la empresa, avisa al anfitrión humano y deja la conversación
anotada en el lead. Se activa por empresa con settings.presenter.enabled: solo atiende las demos que agendó el comercial virtual, y cede la palabra si entra una persona."""
import asyncio
import base64
import hashlib
import hmac
import json
import logging
import os
from datetime import datetime, timedelta, timezone

import httpx

from . import agent, db, llm, meet, proposals, push
from .espo import Espo

log = logging.getLogger("hub.presenter")
URL = os.environ.get("PRESENTER_URL", "http://127.0.0.1:8196")
LIVEKIT_WS = os.environ.get("PRESENTER_LIVEKIT", "ws://127.0.0.1:7880")
SCHEMA = """
CREATE TABLE IF NOT EXISTS presenter_runs (
    code TEXT PRIMARY KEY, tenant TEXT NOT NULL, started_at TIMESTAMPTZ, reminded_at TIMESTAMPTZ, handoff BOOLEAN NOT NULL DEFAULT false, ended_at TIMESTAMPTZ);
"""
_log: dict[str, list[str]] = {}   # transcripción de cada sala mientras dura la sesión


def ensure_schema() -> None:
    with db.pool.connection() as c:
        c.execute(SCHEMA)


def _svc_token() -> str:
    return hmac.new(os.environ["LIVEKIT_API_SECRET"].encode(), b"presenter-service", hashlib.sha256).hexdigest()


def key(code: str) -> str:
    return hmac.new(os.environ["LIVEKIT_API_SECRET"].encode(), f"presenter|{code}".encode(), hashlib.sha256).hexdigest()[:32]


def key_ok(code: str, k: str) -> bool:
    return bool(k) and hmac.compare_digest(key(code), k)


def cfg(tenant: dict) -> dict:
    p = (tenant.get("settings") or {}).get("presenter") or {}
    return {"enabled": bool(p.get("enabled")), "remind_min": int(p.get("remind_min") or 10)}


def _room(code: str) -> dict | None:
    with db.pool.connection() as c:
        return c.execute("SELECT * FROM meet_rooms WHERE code=%s", (code,)).fetchone()


def _slug_for(title: str) -> str:
    t = (title or "").lower()
    for k, s in (("gestor", "gestor360"), ("listo", "listo360"), ("core", "core360")):
        if k in t:
            return s
    return "crm-hub-360"


def _persona(tenant: dict) -> dict:
    a = agent.get_agent(tenant)
    return (((a or {}).get("config") or {}).get("persona")) or {"name": "Valeria", "role": "asesora virtual"}


def plan(code: str) -> dict:
    r = _room(code)
    if not r:
        raise LookupError("sala desconocida")
    tenant = db.get_tenant(r["tenant"])
    pdf, texts = proposals.slides_pdf(r["tenant"], _slug_for(r["title"]))
    p = _persona(tenant)
    return {"persona": {"name": p.get("name") or "Valeria", "role": "Asistente virtual"}, "company": tenant.get("name") or "", "guest": r.get("guest_name") or "",
            "slides": [{"n": i, "text": t} for i, t in enumerate(texts)], "pdf_b64": base64.b64encode(pdf).decode() if pdf else ""}


TURN_SCHEMA = {"type": "object", "properties": {"say": {"type": "string"}, "slide": {"type": ["integer", "null"]}, "handoff": {"type": "boolean"}, "advisor": {"type": "boolean"}}, "required": ["say", "handoff"]}


def _speakable(t: str) -> str:
    return " ".join((t or "").replace("*", "").replace("#", "").replace("_", " ").split())


async def turn(code: str, b: dict) -> dict:
    r = _room(code)
    if not r:
        raise LookupError("sala desconocida")
    tenant = db.get_tenant(r["tenant"])
    slug, kind = r["tenant"], b.get("kind")
    lead_id = r.get("lead_id") or ""
    if kind == "end":
        await _finish(tenant, r, code)
        return {"say": "", "slide": None, "handoff": False}
    p = _persona(tenant)
    pdf, texts = proposals.slides_pdf(slug, _slug_for(r["title"]))
    ag = ((agent.get_agent(tenant) or {}).get("config")) or {}
    co = ag.get("company") or {}
    idx = max(0, min(int(b.get("slide") or 0), max(0, len(texts) - 1)))
    titles = "\n".join(f"{i}: {(t[:70])}" for i, t in enumerate(texts))
    guest = (b.get("guest") or r.get("guest_name") or "").strip()
    system = (f"Eres {p.get('name') or 'Valeria'}, asistente virtual de {tenant.get('name') or 'la empresa'}. Estás en una videollamada de demostración EN VIVO con {guest or 'un posible cliente'} y hablas por voz: "
              "frases cortas y naturales, cálidas y profesionales, en español, sin listas, sin símbolos, sin viñetas ni markdown, y sin leer textualmente. Escribe las siglas y números como se pronuncian "
              "(por ejemplo «veinticuatro siete», «ce erre eme»). Eres una asistente virtual y lo dices con honestidad si te lo preguntan.\n\n"
              f"SOBRE LA EMPRESA:\n{co.get('about', '')}\n\nSERVICIOS:\n{co.get('services', '')}\n\nPOLÍTICAS:\n{co.get('policies', '')}\n\n"
              f"DIAPOSITIVAS (número: inicio):\n{titles}\n\nDIAPOSITIVA ACTUAL ({idx}):\n{texts[idx][:2500] if texts else '(sin diapositivas)'}\n\n"
              "REGLAS: usa SOLO la información de arriba; no inventes precios, plazos, cifras ni funciones. Si preguntan por precios, contratos, condiciones o algo que no esté arriba, di que un asesor lo confirmará "
              "y pon advisor=true (sigues con la demo; el anfitrión recibe un aviso). Si el cliente pide hablar con una persona o está molesto, pon handoff=true (cedes la palabra). Si pide ver otra parte, pon en `slide` el número de la diapositiva que corresponde (si no, null). "
              "Responde SOLO con el JSON pedido: {say, slide, handoff, advisor}.")
    hist = "\n".join(f"{'Cliente' if h.get('who') == 'cliente' else 'Tú'}: {h.get('text', '')}" for h in (b.get("history") or [])[-8:])
    task = {"greet": f"Saluda a {guest or 'tu cliente'} en máximo dos frases, preséntate como asistente virtual de {tenant.get('name') or 'la empresa'} y di que lo acompañarás en esta demostración; pregunta si empiezan.",
            "narrate": "Explica esta diapositiva al cliente en 2 a 4 frases habladas (máximo 60 palabras): qué es y para qué le sirve a su negocio. No leas el texto; cuéntalo. No saludes de nuevo.",
            "answer": f"El cliente dijo: «{b.get('heard', '')}». Respóndele de forma directa en máximo 50 palabras y, si corresponde, invítalo a seguir.",
            "close": "Cierra la demostración: resume en una frase lo visto y di que un asesor lo contactará para los siguientes pasos; pregunta si le queda alguna duda."}.get(kind, "Continúa.")
    try:
        d = await llm.chat_json(tenant, system, f"CONVERSACIÓN HASTA AHORA:\n{hist or '(inicio)'}\n\nTAREA: {task}", TURN_SCHEMA, 500)
    except Exception as e:
        log.warning("turno de la presentadora: %s", str(e)[:150])
        d = {"say": "", "slide": None, "handoff": False}
    say, handoff = _speakable(d.get("say") or ""), bool(d.get("handoff"))
    t = _log.setdefault(code, [])
    if kind == "answer":
        t.append(f"Cliente: {b.get('heard', '')}")
    if say:
        t.append(f"{p.get('name') or 'Valeria'} (asistente virtual): {say}")
    if handoff or d.get("advisor"):
        await _handoff(tenant, r, code, b.get("heard") or "", standby=handoff)
    return {"say": say, "slide": d.get("slide") if isinstance(d.get("slide"), int) else None, "handoff": handoff}


def _host_id(tenant: dict, lead_id: str = "") -> str:
    ag = ((agent.get_agent(tenant) or {}).get("config")) or {}
    return ((ag.get("closer") or {}).get("host_user_id")) or ag.get("handoff_user_id") or ""


async def _handoff(tenant: dict, r: dict, code: str, why: str, standby: bool = True) -> None:
    with db.pool.connection() as c:
        row = c.execute("UPDATE presenter_runs SET handoff=true WHERE code=%s AND NOT handoff RETURNING code", (code,)).fetchone() if standby else c.execute("SELECT code FROM presenter_runs WHERE code=%s", (code,)).fetchone()
    if not row:
        return
    slug, lead_id = r["tenant"], r.get("lead_id") or ""
    try:
        agent.log_event(slug, lead_id, "escalate", channel="video", title="La presentadora virtual pasa la demo a una persona" if standby else "El cliente preguntó algo para un asesor (la demo sigue)", detail=why[:300])
        await push.send(slug, title="Un cliente espera a una persona en la demo" if standby else "Pregunta para un asesor en la demo", body=(why or "Pidió hablar con un asesor")[:140], url=f"/#Lead/view/{lead_id}" if lead_id else "/", tag=f"crmhub-demo-{code}", kind="agent", user_id=_host_id(tenant))
    except Exception as e:
        log.warning("aviso de traspaso: %s", str(e)[:120])


async def _finish(tenant: dict, r: dict, code: str) -> None:
    with db.pool.connection() as c:
        c.execute("UPDATE presenter_runs SET ended_at=now() WHERE code=%s", (code,))
    lines = _log.pop(code, [])
    lead_id = r.get("lead_id") or ""
    if lead_id and lines:
        try:
            await Espo(tenant).note(lead_id, "[Presentadora virtual] Resumen de la demostración en vivo:\n" + "\n".join(lines)[:6000])
            agent.log_event(r["tenant"], lead_id, "demo", channel="video", title="Demostración en vivo con la presentadora virtual", detail=f"{len(lines)} intervenciones")
        except Exception as e:
            log.warning("nota de la demostración: %s", str(e)[:120])


async def start(tenant: dict, code: str) -> dict:
    """Manda a la presentadora a la sala `code` (de este tenant)."""
    r = _room(code)
    if not r or r["tenant"] != tenant["slug"] or r.get("ended_at"):
        raise LookupError("La sala no existe o ya terminó.")
    p = _persona(tenant)
    ident = f"ai-{code}"
    token = meet.sign(ident, f"{p.get('name') or 'Valeria'} · asistente virtual", f"{r['tenant']}-{code}", False, ttl=3 * 3600, meta=json.dumps({"ai": True}))
    with db.pool.connection() as c:
        c.execute("INSERT INTO presenter_runs (code, tenant, started_at) VALUES (%s,%s,now()) ON CONFLICT (code) DO UPDATE SET started_at=now(), ended_at=NULL, handoff=false", (code, r["tenant"]))
    async with httpx.AsyncClient(timeout=30) as c:
        resp = await c.post(f"{URL}/session", headers={"Authorization": f"Bearer {_svc_token()}"}, json={"code": code, "url": LIVEKIT_WS, "token": token, "key": key(code), "name": p.get("name") or "Valeria", "role": "Asistente virtual"})
    resp.raise_for_status()
    return resp.json()


async def _tick(tenant: dict) -> None:
    c = cfg(tenant)
    if not c["enabled"]:
        return
    now = datetime.now(timezone.utc)
    f = lambda d: d.strftime("%Y-%m-%d %H:%M:%S")
    r = await Espo(tenant).get("Meeting", **{"where[0][type]": "between", "where[0][attribute]": "dateStart", "where[0][value][0]": f(now - timedelta(minutes=10)), "where[0][value][1]": f(now + timedelta(minutes=c["remind_min"] + 1)),
                                           "where[1][type]": "equals", "where[1][attribute]": "status", "where[1][value]": "Planned", "select": "name,dateStart,videoLink,description,assignedUserId,parentId", "maxSize": 20})
    for m in r.get("list", []):
        link, desc = m.get("videoLink") or "", m.get("description") or ""
        code = link.rstrip("/").rsplit("/", 1)[-1]
        if not code or "(comercial virtual)" not in desc or not _room(code):   # solo las demos que agendó el comercial virtual
            continue
        start_at = datetime.strptime(m["dateStart"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        with db.pool.connection() as cn:
            run = cn.execute("SELECT started_at, reminded_at FROM presenter_runs WHERE code=%s", (code,)).fetchone()
            if not run:
                cn.execute("INSERT INTO presenter_runs (code, tenant) VALUES (%s,%s) ON CONFLICT DO NOTHING", (code, tenant["slug"]))
                run = {"started_at": None, "reminded_at": None}
            if not run["reminded_at"] and start_at - now <= timedelta(minutes=c["remind_min"]):
                cn.execute("UPDATE presenter_runs SET reminded_at=now() WHERE code=%s", (code,))
                try:
                    await push.send(tenant["slug"], title="Demo en unos minutos", body=f"{m.get('name', '')}. La presentadora virtual entrará a la sala; tú puedes entrar para tomar la palabra.", url=link, tag=f"crmhub-remind-{code}", kind="agent", user_id=m.get("assignedUserId") or _host_id(tenant))
                except Exception as e:
                    log.warning("recordatorio de la demo: %s", str(e)[:100])
        if not run["started_at"] and start_at - now <= timedelta(minutes=1):
            try:
                await start(tenant, code)
                log.info("%s: presentadora en la sala %s", tenant["slug"], code)
            except Exception as e:
                log.warning("%s: no pudo entrar a la sala %s: %s", tenant["slug"], code, str(e)[:150])


async def worker() -> None:
    await asyncio.sleep(20)
    while True:
        try:
            with db.pool.connection() as c:
                slugs = [x["slug"] for x in c.execute("SELECT slug FROM tenants WHERE status='active'").fetchall()]
            for s in slugs:
                t = db.get_tenant(s)
                if t:
                    await _tick(t)
        except Exception:
            log.exception("presentadora: ciclo")
        await asyncio.sleep(30)
