"""Llamadas desde el CRM (click-to-call): el proveedor/central llama PRIMERO al teléfono o extensión del asesor y, al contestar,
lo conecta con el cliente. La troncal SIP vive en el proveedor (Twilio, Telnyx…) o en tu central (Asterisk/FreePBX, 3CX…)."""
from . import config, httpgen, lines, twilio
from .espo import Espo
from .ingest import normalize_phone

PROVIDERS = {"twilio": "Twilio Voice", "generic": "Otra central / proveedor (API HTTP)"}


def provider(tenant: dict) -> str:
    p = (lines.effective(tenant, "voice").get("settings") or {}).get("voice_provider")
    return p if p in PROVIDERS else ""


def bridge_twiml(tenant: dict, customer: str) -> str:
    st = tenant.get("settings") or {}
    caller = (st.get("twilio_voice_from") or "").strip()
    rec = ' record="record-from-answer-dual"' if st.get("voice_record") else ""
    from xml.sax.saxutils import escape
    return ('<?xml version="1.0" encoding="UTF-8"?><Response><Say language="es-MX">Conectando con el cliente.</Say>'
            f'<Dial{f" callerId={chr(34)}{escape(caller)}{chr(34)}" if caller else ""}{rec}><Number>{escape(customer)}</Number></Dial></Response>')


async def test_call(tenant: dict, to: str) -> None:
    """Llamada de prueba: el proveedor llama a `to` y le dice una frase."""
    tenant = lines.effective(tenant, "voice")
    p = provider(tenant)
    if p == "twilio":
        data = {**{"To": to}, **{k: v for k, v in twilio.sender(tenant, "twilio_voice_from").items() if k == "From"},
                "Twiml": '<Response><Say language="es-MX">Esta es una llamada de prueba de Crm Hub 360. Tu línea de llamadas funciona correctamente.</Say></Response>'}
        await twilio.post(tenant, "Calls.json", data)
    elif p == "generic":
        await httpgen.call((tenant.get("settings") or {}).get("generic_voice"), {"to": to, "agent_phone": to, "lead_id": "", "name": "Prueba", "agent": "Prueba"})
    else:
        raise ValueError("Las llamadas no están configuradas (Integraciones).")


async def call(tenant: dict, lead_id: str, agent_phone: str, agent: str, agent_id: str = "", line_id: str | None = None) -> dict:
    tenant = lines.effective(tenant, "voice", line_id)
    p = provider(tenant)
    if not p:
        raise ValueError("Las llamadas desde el CRM no están configuradas (Integraciones → Telefonía).")
    espo = Espo(tenant)
    lead = await espo.get(f"Lead/{lead_id}")
    customer = normalize_phone(lead.get("phoneNumber"))
    me = normalize_phone(agent_phone) if agent_phone.strip().lstrip("+").isdigit() and len(agent_phone.strip().lstrip("+")) >= 10 else agent_phone.strip()
    if not customer:
        raise ValueError("El lead no tiene teléfono.")
    if not me:
        raise ValueError("Escribe tu teléfono o extensión: es donde te llamamos primero.")
    import time
    now = time.time()
    rec = await espo.post("Call", {"name": f"Llamada a {lead.get('name') or 'lead'}", "status": "Planned", "direction": "Outbound",
                                   "dateStart": time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(now)), "dateEnd": time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(now + 300)),
                                   "parentType": "Lead", "parentId": lead_id, "assignedUserId": agent_id or None,
                                   "description": f"Click-to-call iniciado por {agent}"})
    token = tenant["hub_token"]
    host = tenant["host"]
    if p == "twilio":
        data = {**{"To": me}, **{k: v for k, v in twilio.sender(tenant, "twilio_voice_from").items() if k == "From"},
                "Url": f"https://{host}/hub/voice-bridge?token={token}&to={customer.lstrip('+')}",
                "StatusCallback": f"https://{host}/hub/voice-status?token={token}&call={rec['id']}", "StatusCallbackEvent": "completed"}
        res = await twilio.post(tenant, "Calls.json", data)
        return {"ok": True, "callId": rec["id"], "provider": p, "sid": res.get("sid")}
    cfg = (tenant.get("settings") or {}).get("generic_voice")
    await httpgen.call(cfg, {"to": customer, "agent_phone": me, "lead_id": lead_id, "name": lead.get("name", ""), "agent": agent})
    return {"ok": True, "callId": rec["id"], "provider": p}
