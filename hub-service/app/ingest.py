import logging

import httpx

from .espo import Espo


def _split_name(full: str) -> tuple[str, str]:
    parts = (full or "").strip().split(" ", 1)
    return parts[0], (parts[1] if len(parts) > 1 else "")


def normalize_phone(raw: str | None) -> str | None:
    """E.164 (EspoCRM lo exige). Sin prefijo internacional se asume Colombia (+57)."""
    digits = "".join(ch for ch in (raw or "") if ch.isdigit())
    if not digits:
        return None
    if len(digits) == 10:
        digits = "57" + digits
    return "+" + digits


async def upsert_lead(tenant: dict, *, name: str, phone: str | None, email: str | None, source: str,
                      extra: dict | None = None) -> str:
    espo = Espo(tenant)
    first, last = _split_name(name)
    data = {"firstName": first, "lastName": last or first or "Sin nombre", "phoneNumber": normalize_phone(phone),
            "emailAddress": email, "source": source, "status": "Nuevo Lead", **(extra or {})}
    return (await espo.post("Lead", data))["id"]


async def find_lead_by_phone(tenant: dict, phone: str) -> str | None:
    espo = Espo(tenant)
    phone = normalize_phone(phone)
    r = await espo.get("Lead", **{"where[0][type]": "equals", "where[0][attribute]": "phoneNumber",
                                  "where[0][value]": phone, "maxSize": 1, "select": "id"})
    return r["list"][0]["id"] if r.get("list") else None


async def facebook_lead(tenant: dict, leadgen_id: str) -> dict:
    token = (tenant.get("settings") or {}).get("fb_page_token")
    if not token:
        raise ValueError("Falta settings.fb_page_token para consultar el lead en Graph API")
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"https://graph.facebook.com/v21.0/{leadgen_id}", params={"access_token": token})
        r.raise_for_status()
    fields = {f["name"]: (f.get("values") or [""])[0] for f in r.json().get("field_data", [])}
    return fields


async def from_facebook(tenant: dict, payload: dict) -> list[str]:
    ids = []
    for entry in payload.get("entry", []):
        for ch in entry.get("changes", []):
            v = ch.get("value", {})
            f = v.get("field_data_flat") or (await facebook_lead(tenant, v["leadgen_id"]))
            name = f.get("full_name") or f.get("nombre_completo") or f.get("name") or ""
            platform = "Instagram Ads" if v.get("platform") == "ig" else "Facebook Ads"
            ids.append(await upsert_lead(tenant, name=name, phone=f.get("phone_number") or f.get("telefono"),
                                         email=f.get("email"), source=platform))
    return ids


async def fetch_avatar(payload: dict, phone: str) -> str | None:
    """Foto de perfil de WhatsApp vía Evolution API (best-effort; el webhook trae server_url, apikey e instance)."""
    server, key, inst = payload.get("server_url"), payload.get("apikey"), payload.get("instance")
    if not (server and key and inst):
        return None
    try:
        async with httpx.AsyncClient(timeout=6) as c:
            r = await c.post(f"{server.rstrip('/')}/chat/fetchProfilePictureUrl/{inst}", headers={"apikey": key},
                             json={"number": phone.lstrip("+")})
            r.raise_for_status()
            return r.json().get("profilePictureUrl") or None
    except Exception as e:  # no es crítico: la tarjeta usa iniciales
        logging.getLogger("crmhub").info("sin avatar para %s: %s", phone, e)
        return None


async def from_evolution(tenant: dict, payload: dict) -> str | None:
    if payload.get("event", "").lower().replace("_", ".") != "messages.upsert":
        return None
    d = payload.get("data", {})
    key = d.get("key", {})
    if key.get("remoteJid", "").endswith("@g.us"):
        return None  # ignorar grupos
    phone = key.get("remoteJid", "").split("@")[0]
    msg = d.get("message", {})
    text = msg.get("conversation") or (msg.get("extendedTextMessage") or {}).get("text")
    if not phone or not text:
        return None
    lead_id = await find_lead_by_phone(tenant, phone)
    if not lead_id:
        avatar = await fetch_avatar(payload, phone)
        lead_id = await upsert_lead(tenant, name=d.get("pushName") or phone, phone=phone, email=None,
                                    source="WhatsApp", extra={"avatarUrl": avatar} if avatar else None)
    who = "Asesor" if key.get("fromMe") else (d.get("pushName") or "Cliente")
    await Espo(tenant).note(lead_id, f"[WhatsApp] {who}: {text}")
    return lead_id
