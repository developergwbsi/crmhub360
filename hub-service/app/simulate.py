"""Simulador del proceso comercial: recorre con un lead de prueba todo lo que la empresa tiene configurado (registro, correo de bienvenida,
mensajes, respuesta del cliente, llamada, tareas, cambios de estado y conversión a cliente) y deja una línea de tiempo con cada paso."""
import asyncio, html as _html, json, logging, time
from datetime import datetime, timedelta, timezone

from . import db, mailout, qualify, sms, whatsapp, ingest
from .espo import Espo

log = logging.getLogger("hub.sim")
SCHEMA = """
CREATE TABLE IF NOT EXISTS sim_runs (
    id SERIAL PRIMARY KEY, tenant TEXT NOT NULL, user_id TEXT NOT NULL, user_name TEXT NOT NULL DEFAULT '', lead_id TEXT, status TEXT NOT NULL DEFAULT 'running',
    params JSONB NOT NULL DEFAULT '{}', refs JSONB NOT NULL DEFAULT '[]', started_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS sim_events (
    id SERIAL PRIMARY KEY, run_id INT NOT NULL REFERENCES sim_runs(id) ON DELETE CASCADE, at TIMESTAMPTZ NOT NULL DEFAULT now(),
    step TEXT NOT NULL, status TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', data JSONB NOT NULL DEFAULT '{}');
CREATE INDEX IF NOT EXISTS sim_runs_tenant ON sim_runs (tenant, started_at DESC);
CREATE INDEX IF NOT EXISTS sim_events_run ON sim_events (run_id, id);
CREATE TABLE IF NOT EXISTS kb_notes (
    id SERIAL PRIMARY KEY, tenant TEXT NOT NULL, user_id TEXT NOT NULL, user_name TEXT NOT NULL DEFAULT '', text TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS kb_insights (
    tenant TEXT PRIMARY KEY, generated_at TIMESTAMPTZ NOT NULL DEFAULT now(), stats JSONB NOT NULL DEFAULT '{}', summary TEXT NOT NULL DEFAULT '');
"""
STEPS = [("register", "Registro del lead"), ("welcome", "Correo de bienvenida"), ("message", "Mensaje por WhatsApp / SMS"), ("reply", "Respuesta del cliente"),
         ("call", "Llamada del asesor"), ("tasks", "Reunión y tarea de seguimiento"), ("pipeline", "Avance por los estados del pipeline"), ("convert", "Conversión a cliente")]


def ensure_schema() -> None:
    with db.pool.connection() as c:
        c.execute(SCHEMA)


def config_probe(tenant: dict) -> dict:
    st = tenant.get("settings") or {}
    wa, sm = whatsapp.provider(tenant), sms.provider(tenant)
    return {"correo": bool((st.get("mailout") or {}).get("host")), "whatsapp": wa or None, "sms": sm or None, "buzon": bool((st.get("mailbox") or {}).get("enabled")),
            "managed": st.get("managed") or {}}


def _ev(run: int, step: str, status: str, title: str, detail: str = "", data: dict | None = None) -> None:
    with db.pool.connection() as c:
        c.execute("INSERT INTO sim_events (run_id, step, status, title, detail, data) VALUES (%s,%s,%s,%s,%s,%s)", (run, step, status, title, detail, json.dumps(data or {})))


def _ref(run: int, scope: str, rid: str) -> None:
    with db.pool.connection() as c:
        c.execute("UPDATE sim_runs SET refs = refs || %s::jsonb WHERE id = %s", (json.dumps([{"scope": scope, "id": rid}]), run))


def _page(company: str, user: str, body: str) -> str:
    e = _html.escape
    return (f'<div style="background:#eef1f7;padding:20px 8px;font-family:Arial,Helvetica,sans-serif"><div style="max-width:560px;margin:auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #dfe4f3">'
            f'<div style="background:#2f43c4;background-image:linear-gradient(135deg,#2f43c4,#8b5cf6);padding:18px 24px;color:#fff;font:700 18px Arial">{e(company)}</div>'
            f'<div style="padding:24px;font-size:15px;line-height:1.6;color:#161b2e">{body}</div>'
            f'<div style="padding:0 24px 22px"><div style="border-top:2px solid #4f63e8;padding-top:10px;font-size:13px"><b>{e(user)}</b><br><span style="color:#5d6678">{e(company)}</span></div></div></div></div>')


async def start(tenant: dict, p: dict) -> int:
    ensure_schema()
    with db.pool.connection() as c:
        rid = c.execute("INSERT INTO sim_runs (tenant, user_id, user_name, params) VALUES (%s,%s,%s,%s) RETURNING id",
                        (tenant["slug"], p["userId"], p.get("userName", ""), json.dumps({k: v for k, v in p.items() if k not in ("userId", "userName")}))).fetchone()["id"]
    asyncio.create_task(_run(tenant, rid, p))
    return rid


async def _run(tenant: dict, run: int, p: dict) -> None:
    espo, steps, pace = Espo(tenant), set(p.get("steps") or [s for s, _ in STEPS]), 1.0
    uid, uname, company = p["userId"], p.get("userName") or "Asesor", tenant.get("name") or "la empresa"
    email, phone = (p.get("email") or "").strip(), (p.get("phone") or "").strip()
    real, t0, lead_id = bool(p.get("real", True)), time.time(), None
    cfg = config_probe(tenant)
    status = "done"
    try:
        pipe = await qualify.pipeline(espo)
        _ev(run, "config", "info", "Configuración de la empresa", "Lo que el simulador va a usar según cómo está configurada la empresa.",
            {"Correo de salida": "configurado" if cfg["correo"] else "sin configurar", "WhatsApp": cfg["whatsapp"] or "sin configurar", "SMS": cfg["sms"] or "sin configurar",
             "Buzón de entrada": "activo" if cfg["buzon"] else "sin configurar", "Estados": f'{pipe["new"]} → {pipe["review"]} → {pipe["qualified"]} → Cierre Exitoso → Converted',
             "Envíos": "reales a la dirección/número de prueba" if real else "simulados (no sale nada al exterior)"})
        await asyncio.sleep(pace)
        name = (p.get("name") or "Cliente de prueba").strip()
        # 1. registro
        if "register" in steps:
            data = {"firstName": "[Simulación]", "lastName": name, "emailAddress": email or None, "phoneNumber": ingest.normalize_phone(phone) if phone else None, "source": "Formulario Web",
                    "status": pipe["new"], "assignedUserId": uid, "isSimulation": True, "description": "Lead creado por el simulador del proceso comercial."}
            lead_id = (await espo.post("Lead", data))["id"]
            with db.pool.connection() as c:
                c.execute("UPDATE sim_runs SET lead_id=%s WHERE id=%s", (lead_id, run))
            _ref(run, "Lead", lead_id)
            _ev(run, "register", "ok", "Registro del lead", f"Se creó «{name}» (fuente: Formulario Web), asignado a {uname}.", {"leadId": lead_id})
            await asyncio.sleep(pace)
        else:
            _ev(run, "register", "error", "Sin lead", "El simulador necesita el paso de registro."); raise RuntimeError("sin registro")
        L = {"parentType": "Lead", "parentId": lead_id, "assignedUserId": uid}
        # 2. correo de bienvenida
        if "welcome" in steps:
            if not email:
                _ev(run, "welcome", "skip", "Correo de bienvenida", "Omitido: no indicaste un correo de prueba.")
            elif not cfg["correo"]:
                _ev(run, "welcome", "skip", "Correo de bienvenida", "Omitido: la empresa no tiene configurado el correo de salida (Centro de control → Servicios).")
            elif not real:
                _ev(run, "welcome", "ok", "Correo de bienvenida (simulado)", f"Se habría enviado a {email} con tu nombre y firma.")
            else:
                try:
                    body = f"<p>Hola {_html.escape(name)},</p><p>Gracias por tu interés en <b>{_html.escape(company)}</b>. Recibimos tu registro y {_html.escape(uname)} será tu asesor. En breve te contactará.</p><p><i>Este mensaje es parte de una simulación.</i></p>"
                    r = await mailout.send(tenant, {"userId": uid, "userName": uname, "to": [email], "subject": "[Simulación] ¡Gracias por registrarte!", "html": _page(company, uname, body), **{k: L[k] for k in ("parentType", "parentId")}})
                    if r.get("id"):
                        _ref(run, "Email", r["id"])
                    _ev(run, "welcome", "ok", "Correo de bienvenida enviado", f"Enviado a {email} como {uname}; las respuestas llegan solo a ti (alias personal).", {"replyTo": r.get("replyTo")})
                except Exception as e:
                    _ev(run, "welcome", "error", "Correo de bienvenida", str(e)[:300])
            await asyncio.sleep(pace)
        # 3. mensaje por whatsapp / sms
        if "message" in steps:
            text = f"Hola {name}, soy {uname} de {company}. Gracias por registrarte. ¿Cuándo te viene bien que hablemos? (simulación)"
            if not phone:
                _ev(run, "message", "skip", "Mensaje al cliente", "Omitido: no indicaste un número de prueba.")
            elif not (cfg["whatsapp"] or cfg["sms"]):
                _ev(run, "message", "skip", "Mensaje al cliente", "Omitido: la empresa no tiene WhatsApp ni SMS configurado (Centro de control → Servicios).")
            elif not real:
                _ev(run, "message", "ok", "Mensaje al cliente (simulado)", f"Se habría enviado por {'WhatsApp' if cfg['whatsapp'] else 'SMS'} a {phone}.")
            else:
                try:
                    await (whatsapp.send(tenant, lead_id, text, uname) if cfg["whatsapp"] else sms.send(tenant, lead_id, text, uname))
                    _ev(run, "message", "ok", "Mensaje enviado", f"Por {'WhatsApp' if cfg['whatsapp'] else 'SMS'} a {phone}: «{text}»")
                except Exception as e:
                    _ev(run, "message", "error", "Mensaje al cliente", str(e)[:300])
            await asyncio.sleep(pace)
        # 4. respuesta del cliente (simulada: no puede responder solo)
        if "reply" in steps:
            reply = "Hola, sí me interesa. ¿Me pueden dar más información y precios?"
            try:
                if cfg["whatsapp"] and phone:
                    await ingest.whatsapp_inbound(tenant, phone=ingest.normalize_phone(phone) or phone, name=name, text=reply)
                    _ev(run, "reply", "ok", "El cliente responde (simulado)", f"Entró como mensaje de WhatsApp: «{reply}»")
                else:
                    await espo.note(lead_id, f"[Simulación] El cliente respondió: «{reply}»")
                    _ev(run, "reply", "ok", "El cliente responde (simulado)", f"Quedó como nota en el lead: «{reply}»")
            except Exception as e:
                _ev(run, "reply", "error", "Respuesta del cliente", str(e)[:300])
            await asyncio.sleep(pace)
        now = datetime.now(timezone.utc)
        iso = lambda d: d.strftime("%Y-%m-%d %H:%M:%S")
        # 5. llamada
        if "call" in steps:
            try:
                r = await espo.post("Call", {**L, "name": "[Simulación] Llamada de calificación", "status": "Held", "direction": "Outbound", "dateStart": iso(now), "dateEnd": iso(now + timedelta(minutes=6)),
                                             "description": "El cliente confirma interés y pide una propuesta."})
                _ref(run, "Call", r["id"]); _ev(run, "call", "ok", "Llamada del asesor", "Se registró una llamada saliente de 6 minutos (interés confirmado).")
            except Exception as e:
                _ev(run, "call", "error", "Llamada del asesor", str(e)[:300])
            await asyncio.sleep(pace)
        # 6. reunión y tarea
        if "tasks" in steps:
            try:
                m = await espo.post("Meeting", {**L, "name": "[Simulación] Reunión de presentación", "status": "Held", "dateStart": iso(now + timedelta(minutes=30)), "dateEnd": iso(now + timedelta(minutes=60))})
                t = await espo.post("Task", {**L, "name": "[Simulación] Enviar propuesta comercial", "status": "Completed", "dateEnd": iso(now + timedelta(hours=1))})
                _ref(run, "Meeting", m["id"]); _ref(run, "Task", t["id"])
                _ev(run, "tasks", "ok", "Reunión y tarea", "Reunión de presentación realizada y tarea «Enviar propuesta comercial» completada.")
            except Exception as e:
                _ev(run, "tasks", "error", "Reunión y tarea", str(e)[:300])
            await asyncio.sleep(pace)
        # 7. pipeline
        if "pipeline" in steps:
            path = [(pipe["review"], "Primer contacto realizado, se evalúa si califica."), (pipe["qualified"], "Cumple los criterios: interés y capacidad confirmados."), ("Cierre Exitoso", "El cliente aceptó la propuesta.")]
            for to, why in path:
                try:
                    await espo.put(f"Lead/{lead_id}", {"status": to, "statusComment": f"[Simulación] {why}"})
                    _ev(run, "pipeline", "ok", f"Estado → {to}", why)
                except Exception as e:
                    _ev(run, "pipeline", "error", f"Estado → {to}", str(e)[:300]); break
                await asyncio.sleep(pace)
        # 8. conversión
        if "convert" in steps:
            try:
                recs = {"Account": {"name": f"[Simulación] {name}"}, "Contact": {"firstName": "[Simulación]", "lastName": name, "emailAddress": email or None},
                        "Opportunity": {"name": f"[Simulación] {name}", "stage": "Closed Won", "amount": 1000, "closeDate": now.strftime("%Y-%m-%d")}}
                r = await espo._req("POST", "Lead/action/convert", json={"id": lead_id, "records": recs, "skipDuplicateCheck": True})
                out = r.json() if r.content else {}
                lead = await espo.get(f"Lead/{lead_id}")
                made = {"Account": lead.get("createdAccountId") or (out.get("Account") or {}).get("id"), "Contact": lead.get("createdContactId") or (out.get("Contact") or {}).get("id"),
                        "Opportunity": lead.get("createdOpportunityId") or (out.get("Opportunity") or {}).get("id")}
                for sc, rid_ in made.items():
                    if rid_:
                        _ref(run, sc, rid_)
                _ev(run, "convert", "ok", "Convertido en cliente", "Se crearon la cuenta, el contacto y una oportunidad ganada; el lead quedó como convertido.", {k: v for k, v in made.items() if v})
            except Exception as e:
                _ev(run, "convert", "error", "Conversión a cliente", str(e)[:300]); status = "partial"
    except Exception as e:
        log.exception("simulación %s", run)
        status = "error"
        _ev(run, "end", "error", "La simulación se detuvo", str(e)[:300])
    with db.pool.connection() as c:
        errs = c.execute("SELECT count(*) n FROM sim_events WHERE run_id=%s AND status='error'", (run,)).fetchone()["n"]
        skips = c.execute("SELECT count(*) n FROM sim_events WHERE run_id=%s AND status='skip'", (run,)).fetchone()["n"]
        c.execute("UPDATE sim_runs SET status=%s, finished_at=now() WHERE id=%s", ("error" if status == "error" else ("partial" if errs or status == "partial" else "done"), run))
    _ev(run, "end", "info", "Simulación terminada", f"{round(time.time() - t0)} s · {errs} paso(s) con error · {skips} omitido(s) por falta de configuración.")


def list_runs(tenant: str, user_id: str | None) -> list[dict]:
    ensure_schema()
    with db.pool.connection() as c:
        q = "SELECT id, user_id, user_name, lead_id, status, params, started_at, finished_at FROM sim_runs WHERE tenant=%s" + (" AND user_id=%s" if user_id else "") + " ORDER BY id DESC LIMIT 40"
        return [dict(r) for r in c.execute(q, (tenant, user_id) if user_id else (tenant,)).fetchall()]


def get_run(tenant: str, run: int, user_id: str | None) -> dict | None:
    with db.pool.connection() as c:
        r = c.execute("SELECT id, user_id, user_name, lead_id, status, params, refs, started_at, finished_at FROM sim_runs WHERE id=%s AND tenant=%s", (run, tenant)).fetchone()
        if not r or (user_id and r["user_id"] != user_id):
            return None
        ev = c.execute("SELECT id, at, step, status, title, detail, data FROM sim_events WHERE run_id=%s ORDER BY id", (run,)).fetchall()
    return {**dict(r), "events": [dict(e) for e in ev]}


async def delete_run(tenant: dict, run: int, user_id: str | None) -> bool:
    """Quita el registro de la simulación. Los datos que creó en el CRM los elimina el propio CRM (el usuario de integración no tiene permiso de borrar)."""
    with db.pool.connection() as c:
        r = c.execute("SELECT user_id FROM sim_runs WHERE id=%s AND tenant=%s", (run, tenant["slug"])).fetchone()
        if not r or (user_id and r["user_id"] != user_id):
            return False
        c.execute("DELETE FROM sim_runs WHERE id=%s", (run,))
    return True
