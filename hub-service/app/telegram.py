"""Telegram (Bot API): el cliente puede escribir al bot de la empresa o abrir el enlace de invitación que recibe del formulario/asesor;
los mensajes se registran en el flujo del lead y los asesores responden desde el CRM."""
import json
import secrets

import httpx

from . import config, db
from .espo import Espo


def _tok(tenant: dict) -> str:
    t = ((tenant.get("settings") or {}).get("telegram_bot_token") or "").strip()
    if not t:
        raise ValueError("Telegram no está configurado (Integraciones → Mensajería → Telegram).")
    return t


async def _call(tenant: dict, method: str, payload: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(f"{config.TELEGRAM_API_BASE}/bot{_tok(tenant)}/{method}", json=payload or {})
    j = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    if r.status_code >= 400 or not j.get("ok"):
        raise ValueError(f"Telegram: {j.get('description') or r.text[:200]}")
    return j["result"]


def _save(slug: str, patch: dict) -> None:
    with db.pool.connection() as c:
        c.execute("UPDATE tenants SET settings = settings || %s::jsonb WHERE slug = %s", (json.dumps(patch), slug))


async def setup(tenant: dict) -> dict:
    """Comprueba el token, registra el webhook con un secreto propio y guarda el usuario del bot."""
    me = await _call(tenant, "getMe")
    secret = (tenant.get("settings") or {}).get("telegram_secret") or secrets.token_urlsafe(24)
    url = f"https://{tenant['host']}/hub/telegram"
    await _call(tenant, "setWebhook", {"url": url, "secret_token": secret, "allowed_updates": ["message"], "drop_pending_updates": False})
    _save(tenant["slug"], {"telegram_secret": secret, "telegram_bot_username": me.get("username", "")})
    return {"bot": me.get("username"), "name": me.get("first_name"), "webhook": url}


async def test(tenant: dict) -> dict:
    me = await _call(tenant, "getMe")
    info = await _call(tenant, "getWebhookInfo")
    return {"bot": me.get("username"), "webhook": info.get("url") or "", "pending": info.get("pending_update_count", 0),
            "lastError": info.get("last_error_message") or ""}


def tg_html(text: str) -> str:
    """Texto con formato sencillo (*negrita*, _cursiva_, ~tachado~, `código`, [texto](https://enlace)) → HTML de Telegram; todo lo demás se escapa."""
    import html as _h, re as _re
    t = _h.escape(text, quote=False)
    t = _re.sub(r"\[([^\]\n]{1,200})\]\((https?://[^\s)]{3,500})\)", lambda m: f'<a href="{m.group(2)}">{m.group(1)}</a>', t)
    t = _re.sub(r"`([^`\n]+)`", r"<code>\1</code>", t)
    for mark, tag in (("*", "b"), ("_", "i"), ("~", "s")):
        t = _re.sub(rf"(?<![\w{_re.escape(mark)}]){_re.escape(mark)}(?=\S)([^\n{_re.escape(mark)}]*?\S){_re.escape(mark)}(?![\w{_re.escape(mark)}])", rf"<{tag}>\1</{tag}>", t)
    return t


async def send_text(tenant: dict, chat_id: str, text: str, markup: dict | None = None, html: bool = False) -> None:
    body = {"chat_id": chat_id, "text": tg_html(text) if html else text}
    if html:
        body["parse_mode"] = "HTML"
    if markup:
        body["reply_markup"] = markup
    await _call(tenant, "sendMessage", body)


async def send(tenant: dict, lead_id: str, text: str, agent: str) -> dict:
    espo = Espo(tenant)
    lead = await espo.get(f"Lead/{lead_id}")
    chat = lead.get("telegramChatId")
    if not chat:
        raise ValueError("Este lead aún no ha abierto el chat con el bot. Envíale el enlace de invitación (botón «Invitar por Telegram»).")
    try:
        await send_text(tenant, chat, text, html=True)
    except ValueError:   # Telegram rechazó el formato: se reenvía como texto plano
        await send_text(tenant, chat, text)
    await espo.note(lead_id, f"[Telegram] → {agent}: {text}")
    return {"ok": True}


async def invite(tenant: dict, lead_id: str) -> dict:
    """Enlace t.me con un código de un solo uso: al abrirlo, el chat queda ligado a este lead."""
    bot = (tenant.get("settings") or {}).get("telegram_bot_username")
    if not bot:
        raise ValueError("Primero registra el bot en Integraciones → Telegram.")
    token = secrets.token_urlsafe(9)
    await Espo(tenant).put(f"Lead/{lead_id}", {"telegramStartToken": token})
    return {"link": f"https://t.me/{bot}?start={token}", "bot": bot}
