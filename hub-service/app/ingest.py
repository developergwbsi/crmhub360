import logging

import httpx

from . import config, qualify
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
                      extra: dict | None = None, campaign: str | None = None) -> str:
    espo = Espo(tenant)
    first, last = _split_name(name)
    data = {"firstName": first, "lastName": last or first or "Sin nombre", "phoneNumber": normalize_phone(phone),
            "emailAddress": email, "source": source, "status": (await qualify.pipeline(espo))["new"], **(extra or {})}
    if camp_id := await find_campaign_id(tenant, campaign):
        data["campaignId"] = camp_id
    try:
        return (await espo.post("Lead", data))["id"]
    except httpx.HTTPStatusError as e:
        if e.response.status_code != 409:  # 409 = ya existe un lead con ese teléfono/correo: se reutiliza
            raise
        found = (await find_lead_by_phone(tenant, data["phoneNumber"]) if data.get("phoneNumber") else None) or \
                (await find_lead(tenant, "emailAddress", email) if email else None)
        if not found:
            raise
        await espo.note(found, f"[{source}] El mismo contacto volvió a escribir.")
        return found


async def find_campaign_id(tenant: dict, name: str | None) -> str | None:
    if not name:
        return None
    try:
        r = await Espo(tenant).get("Campaign", **{"where[0][type]": "equals", "where[0][attribute]": "name",
                                                  "where[0][value]": name.strip(), "maxSize": 1, "select": "id"})
        return r["list"][0]["id"] if r.get("list") else None
    except Exception:
        return None


async def find_lead(tenant: dict, attr: str, value: str) -> str | None:
    r = await Espo(tenant).get("Lead", **{"where[0][type]": "equals", "where[0][attribute]": attr, "where[0][value]": value,
                                          "maxSize": 1, "select": "id"})
    return r["list"][0]["id"] if r.get("list") else None


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
        r = await c.get(f"{config.META_GRAPH_BASE}/{leadgen_id}", params={"access_token": token})
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
                                         email=f.get("email"), source=platform,
                                         campaign=f.get("campaign_name") or v.get("campaign_name")))
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


async def whatsapp_inbound(tenant: dict, *, phone: str, name: str | None, text: str, from_me: bool = False,
                           avatar_payload: dict | None = None) -> str:
    """Mensaje de WhatsApp (de cualquier proveedor): busca/crea el lead por teléfono y lo registra en su flujo."""
    from . import whatsapp  # import tardío: whatsapp importa este módulo
    lead_id = await find_lead_by_phone(tenant, phone)
    if not lead_id:
        avatar = await fetch_avatar(avatar_payload, phone) if avatar_payload else None
        lead_id = await upsert_lead(tenant, name=name or phone, phone=phone, email=None, source="WhatsApp",
                                    extra={"avatarUrl": avatar, "preferredChannel": "WhatsApp"} if avatar else {"preferredChannel": "WhatsApp"})
    if from_me and whatsapp.recently_sent(lead_id, text):
        return lead_id  # eco del mensaje enviado desde el CRM; ya tiene su nota
    await Espo(tenant).note(lead_id, f"[WhatsApp] {'Asesor' if from_me else (name or 'Cliente')}: {text}")
    if not from_me and is_optout(text):
        await apply_optout(tenant, lead_id, "WhatsApp")
        try:
            await whatsapp.send_text(tenant, normalize_phone(phone), "Listo, no volverás a recibir mensajes masivos de nuestra parte.")
        except Exception:
            pass
    return lead_id


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
    return await whatsapp_inbound(tenant, phone=phone, name=d.get("pushName"), text=text, from_me=bool(key.get("fromMe")), avatar_payload=payload)


OPTOUT = {"baja", "stop", "alto", "cancelar", "no mas", "no mas mensajes", "no quiero mas mensajes", "unsubscribe", "salir"}


def is_optout(text: str) -> bool:
    import unicodedata
    t = "".join(c for c in unicodedata.normalize("NFD", (text or "").lower().strip().strip(".!¡")) if unicodedata.category(c) != "Mn")
    return t in OPTOUT


async def apply_optout(tenant: dict, lead_id: str, channel: str) -> None:
    """El cliente pidió no recibir más mensajes: se marca el lead y las campañas masivas lo excluyen."""
    espo = Espo(tenant)
    await espo.put(f"Lead/{lead_id}", {"doNotContact": True})
    await espo.note(lead_id, f"[{channel}] El cliente pidió no recibir más mensajes (BAJA). Se excluyó de las campañas masivas.")


def _media_label(kind: str) -> str:
    return {"image": "imagen", "audio": "audio", "voice": "nota de voz", "video": "video", "document": "documento", "sticker": "sticker",
            "location": "ubicación", "file": "archivo"}.get(kind, kind or "mensaje")


async def from_meta_whatsapp(tenant: dict, payload: dict) -> list[str]:
    """WhatsApp Cloud API (Meta): entry[].changes[].value.messages[]"""
    ids = []
    for entry in payload.get("entry", []):
        for ch in entry.get("changes", []):
            v = ch.get("value") or {}
            names = {c.get("wa_id"): (c.get("profile") or {}).get("name") for c in v.get("contacts", [])}
            for m in v.get("messages", []):
                kind = m.get("type")
                text = (m.get("text") or {}).get("body") if kind == "text" else \
                    ((m.get("button") or {}).get("text") or ((m.get("interactive") or {}).get("button_reply") or {}).get("title")
                     or ((m.get("interactive") or {}).get("list_reply") or {}).get("title") or f"[{_media_label(kind)}]")
                if m.get("from") and text:
                    ids.append(await whatsapp_inbound(tenant, phone=m["from"], name=names.get(m["from"]), text=text))
    return ids


async def from_gupshup(tenant: dict, payload: dict) -> str | None:
    """Gupshup: {"type":"message","payload":{"source":"57…","type":"text","payload":{"text":"…"},"sender":{"name":"…"}}}"""
    if payload.get("type") != "message":
        return None
    m = payload.get("payload") or {}
    kind = m.get("type")
    text = (m.get("payload") or {}).get("text") if kind == "text" else f"[{_media_label(kind)}]"
    phone = m.get("source") or (m.get("sender") or {}).get("phone")
    if not (phone and text):
        return None
    return await whatsapp_inbound(tenant, phone=phone, name=(m.get("sender") or {}).get("name"), text=text)


async def from_telegram(tenant: dict, update: dict) -> str | None:
    """Telegram: el cliente escribe al bot (o abre el enlace de invitación) y queda ligado a un lead."""
    from . import telegram
    m = update.get("message") or {}
    chat = m.get("chat") or {}
    if chat.get("type") != "private" or not chat.get("id"):
        return None
    st = tenant.get("settings") or {}
    espo = Espo(tenant)
    chat_id = str(chat["id"])
    frm = m.get("from") or {}
    username = frm.get("username") or ""
    name = " ".join(x for x in (frm.get("first_name"), frm.get("last_name")) if x) or username or f"Telegram {chat_id}"
    text = (m.get("text") or "").strip()
    token = text.split(" ", 1)[1].strip() if text.startswith("/start ") else None

    lead_id = await find_lead(tenant, "telegramChatId", chat_id)
    created = linked = False
    if not lead_id and token:
        lead_id = await find_lead(tenant, "telegramStartToken", token)
        if lead_id:
            await espo.put(f"Lead/{lead_id}", {"telegramChatId": chat_id, "telegramUsername": username, "telegramStartToken": None})
            linked = True
    if not lead_id:
        lead_id = await upsert_lead(tenant, name=name, phone=None, email=None, source="Telegram",
                                    extra={"telegramChatId": chat_id, "telegramUsername": username, "preferredChannel": "Telegram"})
        created = True
    lead = await espo.get(f"Lead/{lead_id}")

    contact = m.get("contact")
    if contact and contact.get("phone_number"):
        phone = normalize_phone(contact["phone_number"])
        if phone and not lead.get("phoneNumber"):
            await espo.put(f"Lead/{lead_id}", {"phoneNumber": phone}); lead["phoneNumber"] = phone
        text = f"[compartió su teléfono: {phone}]"
    if text.startswith("/start"):
        text = "abrió el chat con el bot" + (" (desde su enlace de invitación)" if linked else "")
    elif not text:
        text = f"[{_media_label(next((k for k in ('photo', 'voice', 'audio', 'video', 'document', 'sticker', 'location') if k in m), 'mensaje'))}]"
    await espo.note(lead_id, f"[Telegram] {name}: {text}")
    if is_optout(m.get("text") or ""):
        await apply_optout(tenant, lead_id, "Telegram")
        try:
            await telegram.send_text(tenant, chat_id, "Listo, no volverás a recibir mensajes masivos de nuestra parte.")
        except Exception:
            pass
        return lead_id

    if created or linked or (m.get("text") or "").startswith("/start") or contact:
        welcome = st.get("telegram_welcome") or "¡Hola! Recibimos tu mensaje. Un asesor te escribirá por aquí en breve."
        markup = None if lead.get("phoneNumber") else {"keyboard": [[{"text": "📱 Compartir mi teléfono", "request_contact": True}]],
                                                        "resize_keyboard": True, "one_time_keyboard": True}
        try:
            await telegram.send_text(tenant, chat_id, "¡Gracias! Ya tenemos tu teléfono." if contact else welcome, markup)
        except Exception as e:
            logging.getLogger("crmhub").info("no se pudo responder en Telegram: %s", e)
    return lead_id


async def sms_inbound(tenant: dict, *, phone: str, text: str, name: str | None = None) -> str:
    from . import sms
    lead_id = await find_lead_by_phone(tenant, phone) or await upsert_lead(
        tenant, name=name or phone, phone=phone, email=None, source="SMS", extra={"preferredChannel": "Teléfono"})
    await Espo(tenant).note(lead_id, f"[SMS] {name or 'Cliente'}: {text}")
    if is_optout(text):
        await apply_optout(tenant, lead_id, "SMS")
        try:
            await sms.send_text(tenant, normalize_phone(phone), "Listo, no volverás a recibir mensajes masivos de nuestra parte.")
        except Exception:
            pass
    return lead_id


async def from_twilio(tenant: dict, form: dict) -> str | None:
    """Webhook de Twilio (SMS y WhatsApp): campos From, Body, ProfileName."""
    frm, body = form.get("From", ""), (form.get("Body") or "").strip()
    if not frm or not body:
        return None
    if frm.startswith("whatsapp:"):
        return await whatsapp_inbound(tenant, phone=frm[9:], name=form.get("ProfileName"), text=body)
    return await sms_inbound(tenant, phone=frm, text=body)


async def from_generic(tenant: dict, channel: str, payload: dict) -> str | None:
    """Entrante de un proveedor HTTP genérico: las rutas del JSON (p. ej. «messages.0.from») se definen en la configuración."""
    from . import httpgen
    cfg = (tenant.get("settings") or {}).get("generic_" + channel) or {}
    phone, text = httpgen.dig(payload, cfg.get("inbound_phone")), httpgen.dig(payload, cfg.get("inbound_text"))
    name = httpgen.dig(payload, cfg.get("inbound_name")) if cfg.get("inbound_name") else None
    if not phone or not text:
        return None
    if channel == "whatsapp":
        return await whatsapp_inbound(tenant, phone=str(phone), name=name, text=str(text))
    return await sms_inbound(tenant, phone=str(phone), text=str(text), name=name)
