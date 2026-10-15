"""Resumen de las videollamadas: guarda el texto de los subtítulos (nunca el audio), detecta que la llamada terminó (la sala queda vacía) y, con la IA local (Ollama),
escribe un resumen —puntos clave, acuerdos y pendientes— en el lead (y en el contacto y la cuenta si ya fue convertido) y en la reunión programada.
Sin subtítulos igual deja el registro de la llamada (duración y participantes). El texto de la conversación se conserva 7 días; el resumen queda en el CRM."""
import asyncio
import json
import logging
import re
import time

import httpx

from . import config, db, meet

log = logging.getLogger("hub.meetsum")
SCHEMA = """
CREATE TABLE IF NOT EXISTS meet_lines (id BIGSERIAL PRIMARY KEY, code TEXT NOT NULL, ident TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', lang TEXT NOT NULL DEFAULT 'es', text TEXT NOT NULL, tr JSONB, at TIMESTAMPTZ NOT NULL DEFAULT now(), sid BIGINT);
CREATE INDEX IF NOT EXISTS meet_lines_code ON meet_lines (code, sid, at);
CREATE TABLE IF NOT EXISTS meet_sessions (code TEXT PRIMARY KEY, tenant TEXT NOT NULL, started_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_seen TIMESTAMPTZ NOT NULL DEFAULT now(), names JSONB NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS meet_summaries (id BIGSERIAL PRIMARY KEY, code TEXT NOT NULL, tenant TEXT NOT NULL, lead_id TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), started_at TIMESTAMPTZ, ended_at TIMESTAMPTZ,
    duration_s INT NOT NULL DEFAULT 0, participants JSONB NOT NULL DEFAULT '[]', summary JSONB NOT NULL DEFAULT '{}', has_text BOOLEAN NOT NULL DEFAULT false);
CREATE INDEX IF NOT EXISTS meet_summaries_code ON meet_summaries (code, created_at DESC);
"""
EMPTY_GRACE = 45          # segundos con la sala vacía antes de dar la llamada por terminada
KEEP_DAYS = 7
MODEL = lambda: __import__("os").environ.get("MEET_SUMMARY_MODEL", config.OLLAMA_MODEL)


def ensure_schema() -> None:
    with db.pool.connection() as c:
        c.execute(SCHEMA)


def store_line(code: str, ident: str, name: str, lang: str, text: str, tr: dict | None) -> None:
    """Guarda una frase de la conversación (para el resumen); nunca el audio."""
    try:
        with db.pool.connection() as c:
            c.execute("INSERT INTO meet_lines (code, ident, name, lang, text, tr) VALUES (%s,%s,%s,%s,%s,%s)", (code, ident, (name or "")[:60], lang, text[:2000], json.dumps(tr or {})))
    except Exception as e:
        log.warning("guardar frase: %s", str(e)[:100])


SCHEMA_OUT = {"type": "object", "properties": {
    "resumen": {"type": "string"}, "puntos_clave": {"type": "array", "items": {"type": "string"}}, "acuerdos": {"type": "array", "items": {"type": "string"}},
    "pendientes": {"type": "array", "items": {"type": "string"}}, "sentimiento": {"type": "string"}, "interes": {"type": "string"}},
    "required": ["resumen", "puntos_clave", "acuerdos", "pendientes"]}


async def _llm(tenant: dict, transcript: str, who: list[str]) -> dict:
    """Resumen estructurado de la transcripción con el motor de IA de la empresa (el que le asigna el Centro de control: Claude, OpenAI, Ollama…)."""
    from . import llm
    system = ("Eres un asistente de ventas. Recibes la transcripción automática de una videollamada entre un asesor y uno o más clientes (puede mezclar idiomas y tener errores de reconocimiento). "
              "Escribe en ESPAÑOL un resumen útil para el CRM. No inventes nada que no esté en la conversación. Responde solo con JSON con las claves: resumen (3 a 6 frases), puntos_clave (lista corta), "
              "acuerdos (lo que quedó acordado), pendientes (acciones por hacer; indica quién si se menciona), sentimiento (positivo, neutral o negativo) e interes (alto, medio, bajo o desconocido). Usa listas vacías si no hay.")
    return await llm.chat_json(tenant, system, f"Participantes: {', '.join(who)}.\n\nTranscripción:\n{transcript}", SCHEMA_OUT, max_tokens=900)


def _text(s: dict, mins: int, who: list[str], has_text: bool) -> str:
    """Texto de la nota que queda en el CRM."""
    head = f"[Videollamada] Resumen de la reunión — {mins} min · Participantes: {', '.join(who) or '—'}"
    if not has_text:
        return head + "\nNo hubo subtítulos, así que no hay transcripción: solo queda el registro de la llamada."
    out = [head, "Resumen: " + (s.get("resumen") or "—")]
    for k, t in (("puntos_clave", "Puntos clave"), ("acuerdos", "Acuerdos"), ("pendientes", "Pendientes y siguientes pasos")):
        if s.get(k):
            out.append(t + ":\n" + "\n".join("• " + str(x) for x in s[k]))
    if s.get("sentimiento") or s.get("interes"):
        out.append(f"Percepción: {s.get('sentimiento') or '—'} · interés {s.get('interes') or 'desconocido'}")
    out.append("(Resumen generado con IA a partir de los subtítulos; revísalo antes de usarlo.)")
    return "\n".join(out)


async def _write_crm(tenant: dict, room: dict, text: str) -> None:
    """Deja el resumen en el lead, en el contacto y la cuenta si ya es cliente, y en la reunión programada (que pasa a «Realizada»)."""
    from .espo import Espo
    e = Espo(tenant)
    lead = room.get("lead_id") or ""
    parents = []
    if lead:
        parents.append(("Lead", lead))
        try:
            d = await e.get(f"Lead/{lead}", select="status,createdContactId,createdAccountId")
            if d.get("createdContactId"):
                parents.append(("Contact", d["createdContactId"]))
            if d.get("createdAccountId"):
                parents.append(("Account", d["createdAccountId"]))
        except Exception as ex:
            log.warning("datos del lead: %s", str(ex)[:100])
    for t, i in parents:
        try:
            await e.post("Note", {"type": "Post", "parentType": t, "parentId": i, "post": text})
        except Exception as ex:
            log.warning("nota en %s: %s", t, str(ex)[:100])
    try:   # la reunión programada con esta sala queda como realizada y con el resumen en su descripción
        ms = await e.get("Meeting", select="id,description,status", **{"where[0][type]": "equals", "where[0][attribute]": "videoCode", "where[0][value]": room["code"], "maxSize": 1})
        for m in ms.get("list", []):
            body = {"description": ((m.get("description") or "") + "\n\n" + text).strip()}
            if m.get("status") == "Planned":
                body["status"] = "Held"
            await e.put(f"Meeting/{m['id']}", body)
    except Exception as ex:
        log.warning("reunión: %s", str(ex)[:100])


async def finalize(code: str, session: dict | None = None) -> dict | None:
    """Cierra la llamada de una sala: arma el resumen con lo conversado (si hubo subtítulos), lo guarda y lo escribe en el CRM."""
    with db.pool.connection() as c:
        r = c.execute("SELECT * FROM meet_rooms WHERE code = %s", (code,)).fetchone()
        lines = c.execute("SELECT id, name, lang, text, at FROM meet_lines WHERE code = %s AND sid IS NULL ORDER BY at", (code,)).fetchall()
    if not r:
        return None
    tenant = db.get_tenant(r["tenant"])
    names = list(dict.fromkeys(([r["host_name"]] if r["host_name"] else []) + [x["name"] for x in lines if x["name"]] + list((session or {}).get("names") or []) + ([r["guest_name"]] if r["guest_name"] else [])))
    sess_start = (session or {}).get("started_at")
    first = lines[0]["at"] if lines else None
    started = min([t for t in (sess_start, first) if t], default=None)
    t1 = max([t for t in ((session or {}).get("last_seen"), lines[-1]["at"] if lines else None) if t], default=None)
    dur = int(max(60, (t1.timestamp() - started.timestamp()) if started and t1 else 60))
    summary, has_text = {}, bool(lines)
    if lines:
        tr = "\n".join(f"[{int((x['at'].timestamp() - lines[0]['at'].timestamp()) // 60):02d}:{int((x['at'].timestamp() - lines[0]['at'].timestamp()) % 60):02d}] {x['name'] or 'Participante'}: {x['text']}" for x in lines)
        if len(tr) > 14000:
            tr = tr[:7000] + "\n[…]\n" + tr[-7000:]
        try:
            summary = await _llm(tenant, tr, names)
        except Exception as e:
            log.warning("resumen con IA: %s", str(e)[:150])
            summary = {"resumen": "No se pudo generar el resumen automático (el motor de IA no respondió). La conversación quedó transcrita " + f"({len(lines)} frases).", "puntos_clave": [], "acuerdos": [], "pendientes": []}
    mins = max(1, round(dur / 60))
    text = _text(summary, mins, names, has_text)
    with db.pool.connection() as c:
        sid = c.execute("INSERT INTO meet_summaries (code, tenant, lead_id, started_at, ended_at, duration_s, participants, summary, has_text) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
                        (code, r["tenant"], r["lead_id"] or "", started, t1, dur, json.dumps(names), json.dumps(summary), has_text)).fetchone()["id"]
        if lines:
            c.execute("UPDATE meet_lines SET sid = %s WHERE code = %s AND sid IS NULL", (sid, code))
        c.execute("DELETE FROM meet_lines WHERE at < now() - make_interval(days => %s)", (KEEP_DAYS,))
        c.execute("DELETE FROM meet_sessions WHERE code = %s", (code,))
    try:
        await _write_crm(tenant, r, text)
    except Exception as e:
        log.warning("escribir el resumen en el CRM: %s", str(e)[:120])
    return {"id": sid}


def latest(tenant_slug: str, code: str, since_ms: int = 0) -> dict | None:
    """Último resumen de la sala posterior a `since_ms` (para mostrarlo al asesor al terminar la llamada)."""
    with db.pool.connection() as c:
        r = c.execute("SELECT * FROM meet_summaries WHERE tenant = %s AND code = %s AND created_at > to_timestamp(%s) ORDER BY created_at DESC LIMIT 1", (tenant_slug, code, since_ms / 1000)).fetchone()
    if not r:
        return None
    return {"id": r["id"], "leadId": r["lead_id"], "minutes": max(1, round(r["duration_s"] / 60)), "participants": r["participants"], "summary": r["summary"], "hasText": r["has_text"], "at": r["created_at"].isoformat()}


ROOM_RE = re.compile(r"^(.*)-([a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3})$")


async def loop() -> None:
    """Cada 20 s: registra quién está en cada sala y, cuando una sala queda vacía unos segundos, da la llamada por terminada y genera su resumen."""
    await asyncio.sleep(20)
    while True:
        try:
            live = await asyncio.to_thread(meet.live_all)
            live_codes = set()   # salas con el anfitrión (el asesor) dentro: la llamada sigue; sin él unos segundos, la llamada terminó aunque el cliente siga conectado
            with db.pool.connection() as c:
                for name, v in live.items():
                    m = ROOM_RE.match(name)
                    if not m or not (v["guests"] or v["hosts"]):
                        continue
                    tenant, code = m.group(1), m.group(2)
                    row = c.execute("SELECT names FROM meet_sessions WHERE code = %s", (code,)).fetchone()
                    names = list(dict.fromkeys((row["names"] if row else []) + list(v["guests"])))
                    if v["hosts"]:
                        live_codes.add(code)
                        if row:
                            c.execute("UPDATE meet_sessions SET last_seen = now(), names = %s WHERE code = %s", (json.dumps(names), code))
                        else:
                            c.execute("INSERT INTO meet_sessions (code, tenant, names) VALUES (%s,%s,%s)", (code, tenant, json.dumps(names)))
                    elif row:
                        c.execute("UPDATE meet_sessions SET names = %s WHERE code = %s", (json.dumps(names), code))
                done = c.execute("SELECT * FROM meet_sessions WHERE last_seen < now() - make_interval(secs => %s)", (EMPTY_GRACE,)).fetchall()
                pend = c.execute("SELECT DISTINCT code FROM meet_lines WHERE sid IS NULL AND at < now() - make_interval(secs => %s)", (EMPTY_GRACE,)).fetchall()
            todo = {d["code"]: d for d in done if d["code"] not in live_codes}
            for p in pend:
                if p["code"] not in live_codes:
                    todo.setdefault(p["code"], None)
            for code, s_ in todo.items():
                await finalize(code, s_)
        except Exception as e:
            log.warning("ciclo de resúmenes: %s", str(e)[:150])
        await asyncio.sleep(20)
