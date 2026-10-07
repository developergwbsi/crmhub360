"""Cliente mínimo de Twilio (SMS, WhatsApp y llamadas con la misma cuenta)."""
import httpx

from . import config


def creds(tenant: dict) -> tuple[str, str]:
    st = tenant.get("settings") or {}
    sid, tok = (st.get("twilio_account_sid") or "").strip(), (st.get("twilio_auth_token") or "").strip()
    if not (sid and tok):
        raise ValueError("Twilio no está configurado (Integraciones → Twilio).")
    return sid, tok


async def post(tenant: dict, path: str, data: dict) -> dict:
    sid, tok = creds(tenant)
    async with httpx.AsyncClient(timeout=25) as c:
        r = await c.post(f"{config.TWILIO_BASE}/2010-04-01/Accounts/{sid}/{path}", data=data, auth=(sid, tok))
    if r.status_code >= 400:
        try:
            msg = r.json().get("message") or r.text
        except Exception:
            msg = r.text
        raise ValueError(f"Twilio rechazó la solicitud ({r.status_code}): {str(msg)[:240]}")
    return r.json()


async def account(tenant: dict) -> dict:
    sid, tok = creds(tenant)
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f"{config.TWILIO_BASE}/2010-04-01/Accounts/{sid}.json", auth=(sid, tok))
    if r.status_code >= 400:
        raise ValueError(f"Twilio rechazó las credenciales ({r.status_code})")
    return r.json()


def sender(tenant: dict, key: str) -> dict:
    """Remitente: número/código corto/ID alfanumérico, o un Messaging Service (MG…)."""
    v = ((tenant.get("settings") or {}).get(key) or "").strip()
    if not v:
        raise ValueError("Falta el remitente en la configuración de Twilio.")
    return {"MessagingServiceSid": v} if v.startswith("MG") else {"From": v}
