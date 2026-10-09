"""WhatsApp con varios proveedores: Evolution API, Meta WhatsApp Cloud API y Gupshup.
Cada empresa elige uno (tenants.settings.wa_provider). Las credenciales viven en tenants.settings y nunca se devuelven a la interfaz."""
import json
import time

import httpx

from . import config, httpgen, routing, twilio
from .espo import Espo
from .ingest import normalize_phone

PROVIDERS = {"evolution": "Evolution API", "meta": "Meta WhatsApp Cloud API", "gupshup": "Gupshup", "twilio": "Twilio",
             "generic": "Otro proveedor (API HTTP)"}
_sent: dict[tuple[str, str], float] = {}  # (lead_id, texto) -> instante: evita duplicar la nota cuando llega el eco del webhook


def recently_sent(lead_id: str, text: str, window: float = 180.0) -> bool:
    now = time.time()
    for k in [k for k, t in _sent.items() if now - t > window]:
        _sent.pop(k, None)
    return (lead_id, text) in _sent


def _st(tenant: dict) -> dict:
    return tenant.get("settings") or {}


def provider(tenant: dict) -> str:
    st = _st(tenant)
    p = st.get("wa_provider")
    if p in PROVIDERS:
        return p
    return "evolution" if st.get("evolution_url") else ""


def _need(tenant: dict, *keys: str) -> list[str]:
    st = _st(tenant)
    vals = [(st.get(k) or "").strip() for k in keys]
    if not all(vals):
        raise ValueError("WhatsApp no está configurado (Integraciones → Mensajería).")
    return vals


# ---------------- prueba de conexión ----------------
async def test(tenant: dict) -> dict:
    p = provider(tenant)
    async with httpx.AsyncClient(timeout=12) as c:
        if p == "evolution":
            url, key, inst = _need(tenant, "evolution_url", "evolution_apikey", "evolution_instance")
            r = await c.get(f"{url.rstrip('/')}/instance/connectionState/{inst}", headers={"apikey": key}); r.raise_for_status()
            data = r.json(); state = (data.get("instance") or data).get("state")
            return {"provider": p, "state": state, "connected": state == "open"}
        if p == "meta":
            pid, tok = _need(tenant, "meta_phone_number_id", "meta_access_token")
            r = await c.get(f"{config.META_GRAPH_BASE}/{pid}", params={"fields": "display_phone_number,verified_name"}, headers={"Authorization": f"Bearer {tok}"})
            if r.status_code >= 400:
                raise ValueError(f"Meta rechazó las credenciales: {_err(r)}")
            d = r.json()
            return {"provider": p, "state": f"{d.get('verified_name', '')} {d.get('display_phone_number', '')}".strip() or "ok", "connected": True}
        if p == "gupshup":
            key, src = _need(tenant, "gupshup_api_key", "gupshup_source")
            return {"provider": p, "state": f"guardado para {src}", "connected": True,
                    "note": "Gupshup no ofrece una prueba de conexión sin enviar un mensaje; envía uno a un lead de prueba."}
        if p == "twilio":
            acc = await twilio.account(tenant)
            return {"provider": p, "state": acc.get("friendly_name", "cuenta válida"), "connected": True}
        if p == "generic":
            cfg = (tenant.get("settings") or {}).get("generic_whatsapp") or {}
            if not cfg.get("url"):
                raise ValueError("Falta la URL del proveedor.")
            return {"provider": p, "state": "configuración guardada", "connected": True,
                    "note": "No hay una prueba automática para un proveedor genérico; envía un mensaje a un lead de prueba."}
    raise ValueError("Elige un proveedor de WhatsApp y guarda sus credenciales.")


async def qr(tenant: dict) -> dict:
    """Vinculación por QR (solo Evolution): devuelve el estado y, si aún no está conectado, el código QR actual."""
    if provider(tenant) != "evolution":
        raise ValueError("La vinculación por QR solo aplica a Evolution API.")
    url, key, inst = _need(tenant, "evolution_url", "evolution_apikey", "evolution_instance")
    base, h = url.rstrip("/"), {"apikey": key}
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(f"{base}/instance/connectionState/{inst}", headers=h)
        if r.status_code == 404:   # la instancia no existe todavía: se crea
            cr = await c.post(f"{base}/instance/create", headers=h, json={"instanceName": inst, "integration": "WHATSAPP-BAILEYS", "qrcode": True})
            cr.raise_for_status()
            r = await c.get(f"{base}/instance/connectionState/{inst}", headers=h)
        r.raise_for_status()
        data = r.json(); state = (data.get("instance") or data).get("state")
        if state == "open":
            return {"connected": True, "state": state}
        q = await c.get(f"{base}/instance/connect/{inst}", headers=h)
        q.raise_for_status()
        d = q.json()
        return {"connected": False, "state": state, "qr": d.get("base64") or "", "pairingCode": d.get("pairingCode") or ""}


def _err(r: httpx.Response) -> str:
    try:
        j = r.json()
        e = j.get("error") or j
        return (e.get("message") if isinstance(e, dict) else str(e))[:240]
    except Exception:
        return r.text[:240]


# ---------------- envío ----------------
async def send_text(tenant: dict, phone: str, text: str) -> None:
    p = provider(tenant)
    number = phone.lstrip("+")
    async with httpx.AsyncClient(timeout=25) as c:
        if p == "evolution":
            url, key, inst = _need(tenant, "evolution_url", "evolution_apikey", "evolution_instance")
            r = await c.post(f"{url.rstrip('/')}/message/sendText/{inst}", headers={"apikey": key}, json={"number": number, "text": text})
        elif p == "meta":
            pid, tok = _need(tenant, "meta_phone_number_id", "meta_access_token")
            r = await c.post(f"{config.META_GRAPH_BASE}/{pid}/messages", headers={"Authorization": f"Bearer {tok}"},
                             json={"messaging_product": "whatsapp", "to": number, "type": "text", "text": {"body": text, "preview_url": False}})
        elif p == "gupshup":
            key, src, app = _need(tenant, "gupshup_api_key", "gupshup_source", "gupshup_app_name")
            r = await c.post(f"{config.GUPSHUP_BASE}/wa/api/v1/msg", headers={"apikey": key},
                             data={"channel": "whatsapp", "source": src.lstrip("+"), "destination": number, "src.name": app,
                                   "message": json.dumps({"type": "text", "text": text})})
        elif p == "twilio":
            frm = twilio.sender(tenant, "twilio_wa_from")
            await twilio.post(tenant, "Messages.json", {**({"MessagingServiceSid": frm["MessagingServiceSid"]} if "MessagingServiceSid" in frm else {"From": "whatsapp:" + frm["From"].replace("whatsapp:", "")}),
                                                        "To": "whatsapp:" + phone, "Body": text})
            return
        elif p == "generic":
            await httpgen.call((tenant.get("settings") or {}).get("generic_whatsapp"), {"to": phone, "text": text})
            return
        else:
            raise ValueError("WhatsApp no está configurado (Integraciones → Mensajería).")
    if r.status_code >= 400:
        raise ValueError(f"{PROVIDERS[p]} rechazó el mensaje ({r.status_code}): {_err(r)}")


def lead_numbers(lead: dict) -> list[str]:
    """Todos los números del lead (principal primero), normalizados."""
    out = []
    for x in sorted(lead.get("phoneNumberData") or [], key=lambda d: not d.get("primary")):
        n = normalize_phone(x.get("phoneNumber"))
        if n and not x.get("invalid") and n not in out:
            out.append(n)
    main = normalize_phone(lead.get("phoneNumber"))
    if main and main not in out:
        out.insert(0, main)
    return out


def pick_number(lead: dict, wanted: str | None) -> str:
    nums = lead_numbers(lead)
    if not nums:
        raise ValueError("El lead no tiene teléfono.")
    if wanted:
        w = normalize_phone(wanted)
        if w not in nums:
            raise ValueError("Ese número no pertenece a este cliente.")
        return w
    return nums[0]


async def send(tenant: dict, lead_id: str, text: str, agent: str, user_id: str | None = None, phone: str | None = None) -> dict:
    espo = Espo(tenant)
    lead = await espo.get(f"Lead/{lead_id}")
    number = pick_number(lead, phone)
    await send_text(tenant, number, text)
    _sent[(lead_id, text)] = time.time()
    await espo.note(lead_id, f"[WhatsApp] → {agent}: {text}")
    routing.note_out(tenant["slug"], lead_id, user_id, number)   # la respuesta del cliente le llega a quien le escribió
    if user_id:   # una persona escribió: el comercial virtual se hace a un lado un rato
        from . import agent
        agent.note_human(tenant["slug"], lead_id, agent.config(tenant)["cadence"]["human_hold_minutes"])
    return {"ok": True, "phone": number}
