"""Adjuntos que envía el cliente por WhatsApp (imagen, video, audio, documento, sticker): se descargan del proveedor y se guardan como archivos del CRM
(adjuntos de la nota del chat) para mostrarlos con vista previa. Si la descarga falla el mensaje se registra igual, solo con la etiqueta («[Imagen]»)."""
import base64
import logging
import mimetypes

import httpx

from . import config

log = logging.getLogger("hub.media")
MAX_BYTES = 15 * 1024 * 1024
EXT = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "video/mp4": ".mp4", "audio/ogg": ".ogg", "audio/mpeg": ".mp3", "audio/mp4": ".m4a", "application/pdf": ".pdf"}
LABEL = {"imageMessage": "imagen", "videoMessage": "video", "audioMessage": "audio", "documentMessage": "documento", "stickerMessage": "sticker"}


def _name(kind: str, mime: str, given: str = "") -> str:
    if given:
        return given[:120]
    mime = (mime or "").split(";")[0].strip()
    return f"{LABEL.get(kind, kind or 'archivo')}{EXT.get(mime) or mimetypes.guess_extension(mime) or ''}"


async def from_evolution(tenant: dict, instance: str, key: dict, kind: str, meta: dict) -> tuple[bytes, str, str] | None:
    """(contenido, tipo, nombre) del adjunto de un mensaje de Evolution, pidiéndoselo a la propia instancia (guarda el mensaje cifrado y lo descifra)."""
    from . import lines
    card = next((c for c in lines.raw_cards(tenant, "whatsapp") if c["type"] == "evolution" and (c["fields"].get("evolution_instance") or "") == (instance or "")), None)
    if not card:
        return None
    f = card["fields"]
    try:
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(f"{(f.get('evolution_url') or '').rstrip('/')}/chat/getBase64FromMediaMessage/{instance}", headers={"apikey": f.get("evolution_apikey") or ""},
                             json={"message": {"key": key}, "convertToMp4": False})
        r.raise_for_status()
        d = r.json()
        raw = base64.b64decode((d.get("base64") or "").split(",")[-1])
        if not raw or len(raw) > MAX_BYTES:
            return None
        mime = d.get("mimetype") or (meta or {}).get("mimetype") or "application/octet-stream"
        return raw, mime.split(";")[0], _name(kind, mime, d.get("fileName") or (meta or {}).get("fileName") or "")
    except Exception as e:
        log.warning("adjunto de Evolution (%s): %s", kind, str(e)[:120])
        return None


async def from_meta(tenant: dict, kind: str, media: dict) -> tuple[bytes, str, str] | None:
    """(contenido, tipo, nombre) de un adjunto de WhatsApp Cloud API: primero se pide su dirección temporal y luego el archivo, con el token de la línea."""
    from . import whatsapp
    try:
        _, tok = whatsapp._need(tenant, "meta_phone_number_id", "meta_access_token")
        async with httpx.AsyncClient(timeout=60, headers={"Authorization": f"Bearer {tok}"}) as c:
            i = await c.get(f"{config.META_GRAPH_BASE}/{media['id']}")
            i.raise_for_status()
            info = i.json()
            r = await c.get(info["url"])
            r.raise_for_status()
        if not r.content or len(r.content) > MAX_BYTES:
            return None
        mime = (info.get("mime_type") or media.get("mime_type") or "application/octet-stream").split(";")[0]
        return r.content, mime, _name(kind, mime, media.get("filename") or "")
    except Exception as e:
        log.warning("adjunto de Meta (%s): %s", kind, str(e)[:120])
        return None
