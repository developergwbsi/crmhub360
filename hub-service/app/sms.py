"""SMS: Twilio o cualquier proveedor por API HTTP. El remitente puede ser un número largo, un código corto o un ID alfanumérico
(lo que tu proveedor haya habilitado para tu cuenta)."""
from . import httpgen, twilio
from .espo import Espo
from .ingest import normalize_phone

PROVIDERS = {"twilio": "Twilio", "generic": "Otro proveedor (API HTTP)"}


def provider(tenant: dict) -> str:
    p = (tenant.get("settings") or {}).get("sms_provider")
    return p if p in PROVIDERS else ""


def info(text: str) -> dict:
    """Cuántos SMS consume un texto: 160 caracteres (GSM) o 70 si lleva tildes/emoji no-GSM; concatenados bajan a 153/67."""
    gsm = set("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà^{}\\[~]|€")
    uni = any(ch not in gsm for ch in text)
    single, multi = (70, 67) if uni else (160, 153)
    n = len(text)
    return {"chars": n, "unicode": uni, "segments": 1 if n <= single else -(-n // multi)}


async def send_text(tenant: dict, phone: str, text: str, lead: dict | None = None, agent: str = "") -> None:
    p = provider(tenant)
    if p == "twilio":
        await twilio.post(tenant, "Messages.json", {**twilio.sender(tenant, "twilio_sms_from"), "To": phone, "Body": text})
    elif p == "generic":
        cfg = (tenant.get("settings") or {}).get("generic_sms")
        await httpgen.call(cfg, {"to": phone, "text": text, "name": (lead or {}).get("name", ""), "lead_id": (lead or {}).get("id", ""), "agent": agent})
    else:
        raise ValueError("SMS no está configurado (Integraciones → SMS).")


async def send(tenant: dict, lead_id: str, text: str, agent: str) -> dict:
    espo = Espo(tenant)
    lead = await espo.get(f"Lead/{lead_id}")
    phone = normalize_phone(lead.get("phoneNumber"))
    if not phone:
        raise ValueError("El lead no tiene teléfono.")
    await send_text(tenant, phone, text, lead, agent)
    i = info(text)
    await espo.note(lead_id, f"[SMS] {agent}: {text}")
    return {"ok": True, **i}


async def test(tenant: dict, to: str) -> dict:
    phone = normalize_phone(to)
    if not phone:
        raise ValueError("Escribe un número de celular válido.")
    await send_text(tenant, phone, "Prueba de Crm Hub 360: tu configuración de SMS funciona.")
    return {"ok": True, "to": phone}
