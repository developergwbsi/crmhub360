"""Respuestas de clientes por Resend (correo entrante): Resend recibe el correo en el dominio y avisa por webhook (firmado con Svix); aquí se
verifica la firma, se pide el correo completo a la API de Resend y se importa al CRM igual que uno leído por IMAP (mailbox.import_message).
Configuración por empresa en tenants.settings.mailout: inbound_secret (whsec_…), password (API key de Resend), reply_address (dirección del dominio que recibe)."""
import base64, hashlib, hmac, json, re, time
from datetime import datetime, timezone
from email.utils import getaddresses, parseaddr

import httpx

from . import mailbox
from .espo import Espo

TOLERANCE = 300   # segundos de diferencia admitida entre la marca de tiempo de la firma y la hora del servidor


def verify(secret: str, body: bytes, headers) -> bool:
    """Firma Svix: HMAC-SHA256 de «id.timestamp.cuerpo» con la clave (base64 tras «whsec_»); acepta cualquiera de las firmas v1 de la cabecera."""
    mid, ts, sig = headers.get("svix-id", ""), headers.get("svix-timestamp", ""), headers.get("svix-signature", "")
    if not (secret and mid and ts and sig):
        return False
    try:
        if abs(time.time() - int(ts)) > TOLERANCE:
            return False
        key = base64.b64decode(secret.split("_", 1)[1] if secret.startswith("whsec_") else secret)
    except Exception:
        return False
    want = base64.b64encode(hmac.new(key, f"{mid}.{ts}.".encode() + body, hashlib.sha256).digest()).decode()
    return any(hmac.compare_digest(want, p.split(",", 1)[1]) for p in sig.split() if p.startswith("v1,"))


def _addr_list(v) -> list[str]:
    return [a.lower() for _, a in getaddresses([", ".join(v) if isinstance(v, list) else str(v or "")], strict=False) if a]


def build_message(ev: dict, full: dict) -> dict:
    """Pasa el correo de Resend al mismo formato que usa el lector IMAP."""
    hdr = {str(k).lower(): v for k, v in (full.get("headers") or {}).items()}
    name, addr = parseaddr(str(hdr.get("from") or full.get("from") or ev.get("from") or ""))
    to, cc = _addr_list(full.get("to") or ev.get("to")), _addr_list(full.get("cc") or ev.get("cc"))
    rec = [*to, *cc, *_addr_list(full.get("received_for") or ev.get("received_for")), *_addr_list(hdr.get("delivered-to")), *_addr_list(hdr.get("x-original-to"))]
    refs = re.findall(r"<[^>]+>", " ".join(str(hdr.get(h) or "") for h in ("in-reply-to", "references")))
    try:
        when = datetime.fromisoformat(str(full.get("created_at") or ev.get("created_at")).replace("Z", "+00:00")).astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        when = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    return {"uid": ev.get("email_id"), "recipients": list(dict.fromkeys(rec)), "refs": refs, "subject": full.get("subject") or ev.get("subject") or "(sin asunto)",
            "from": (addr or ev.get("from") or "").lower(), "fromName": name, "to": to, "cc": cc, "html": full.get("html") or "", "text": full.get("text") or "",
            "date": when, "messageId": str(full.get("message_id") or ev.get("message_id") or "").strip()}


async def handle(tenant: dict, event: dict) -> bool:
    """Procesa un evento email.received: True si el correo se importó al CRM."""
    if event.get("type") != "email.received":
        return False
    ev = event.get("data") or {}
    cfg = (tenant.get("settings") or {}).get("mailout") or {}
    if not ev.get("email_id") or not cfg.get("password"):
        return False
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"https://api.resend.com/emails/receiving/{ev['email_id']}", params={"html_format": "cid"}, headers={"Authorization": f"Bearer {cfg['password']}"})
    r.raise_for_status()
    m = build_message(ev, r.json())
    own = cfg.get("reply_address") or cfg.get("from_address") or ""
    return await mailbox.import_message(tenant, Espo(tenant), m, own)
