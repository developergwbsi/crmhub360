"""Envío de WhatsApp vía Evolution API (instancia propia de cada empresa; credenciales en tenants.settings)."""
import time

import httpx

from .espo import Espo
from .ingest import normalize_phone

_sent: dict[tuple[str, str], float] = {}  # (lead_id, texto) -> instante de envío: evita duplicar la nota al llegar el eco del webhook


def recently_sent(lead_id: str, text: str, window: float = 180.0) -> bool:
    now = time.time()
    for k in [k for k, t in _sent.items() if now - t > window]:
        _sent.pop(k, None)
    return (lead_id, text) in _sent


def config(tenant: dict) -> tuple[str, str, str]:
    st = tenant.get("settings") or {}
    url, key, inst = (st.get("evolution_url") or "").rstrip("/"), st.get("evolution_apikey") or "", st.get("evolution_instance") or ""
    if not (url and key and inst):
        raise ValueError("WhatsApp no está configurado (Integraciones → WhatsApp).")
    return url, key, inst


async def test(tenant: dict) -> dict:
    url, key, inst = config(tenant)
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(f"{url}/instance/connectionState/{inst}", headers={"apikey": key})
        r.raise_for_status()
    data = r.json()
    state = (data.get("instance") or data).get("state")
    return {"state": state, "connected": state == "open"}


async def send(tenant: dict, lead_id: str, text: str, agent: str) -> dict:
    url, key, inst = config(tenant)
    espo = Espo(tenant)
    lead = await espo.get(f"Lead/{lead_id}")
    phone = normalize_phone(lead.get("phoneNumber"))
    if not phone:
        raise ValueError("El lead no tiene teléfono.")
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(f"{url}/message/sendText/{inst}", headers={"apikey": key}, json={"number": phone.lstrip("+"), "text": text})
    if r.status_code >= 400:
        raise ValueError(f"WhatsApp rechazó el mensaje ({r.status_code}): {r.text[:200]}")
    _sent[(lead_id, text)] = time.time()
    await espo.note(lead_id, f"[WhatsApp] {agent}: {text}")
    return {"ok": True}
