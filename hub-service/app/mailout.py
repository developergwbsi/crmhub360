"""Envío de correos como el usuario: remitente con su nombre, firma propia y Reply-To personal sobre una cuenta compartida.
Las respuestas llegan a «cuenta+<idUsuario>@dominio» (alias del mismo buzón) y el lector de buzón (mailbox.py) las entrega solo a ese usuario.
Configuración por empresa en tenants.settings.mailout = {host, port, security, user, password, from_address, plus}."""
import asyncio, html as _html, re, smtplib, ssl
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

from .espo import Espo

ADDR = re.compile(r"^[^@\s,;<>]{1,64}@[^@\s,;<>]{1,190}\.[A-Za-z]{2,}$")


def plus_alias(cfg: dict, user_id: str) -> str:
    """Alias del buzón para las respuestas de este usuario (solo proveedores que lo permiten, p. ej. Gmail)."""
    addr = cfg["from_address"]
    if not cfg.get("plus"):
        return addr
    local, _, domain = addr.partition("@")
    return f"{local.split('+')[0]}+{user_id}@{domain}"


def _addrs(v) -> list[str]:
    if isinstance(v, str):
        v = re.split(r"[;,]", v)
    out = []
    for a in v or []:
        a = str(a).strip()
        if a and not ADDR.match(a):
            raise ValueError(f"Correo inválido: {a}")
        if a:
            out.append(a)
    return out


def _smtp_send(cfg: dict, msg: EmailMessage, rcpts: list[str]) -> None:
    ctx, port, sec = ssl.create_default_context(), int(cfg.get("port") or 587), cfg.get("security") or "TLS"
    srv = smtplib.SMTP_SSL(cfg["host"], port, timeout=25, context=ctx) if sec == "SSL" else smtplib.SMTP(cfg["host"], port, timeout=25)
    try:
        if sec == "TLS":
            srv.starttls(context=ctx)
        if cfg.get("user"):
            srv.login(cfg["user"], cfg.get("password") or "")
        srv.send_message(msg, to_addrs=rcpts)
    finally:
        try:
            srv.quit()
        except Exception:
            pass


def plain_of(html: str) -> str:
    t = re.sub(r"(?is)<(style|script|head).*?</\1>", "", html)
    t = re.sub(r"(?i)<br\s*/?>|</(p|div|tr|li|h\d)>", "\n", t)
    return re.sub(r"\n{3,}", "\n\n", _html.unescape(re.sub(r"<[^>]+>", "", t))).strip()


async def send(tenant: dict, req: dict) -> dict:
    cfg = (tenant.get("settings") or {}).get("mailout") or {}
    if not cfg.get("host") or not cfg.get("from_address"):
        raise LookupError("Esta empresa no tiene el correo del Centro de control configurado.")
    to, cc = _addrs(req.get("to")), _addrs(req.get("cc"))
    if not to:
        raise ValueError("Escribe al menos un destinatario.")
    uid, uname = str(req["userId"]), str(req.get("userName") or "")[:80]
    domain = cfg["from_address"].partition("@")[2]
    mid = make_msgid(domain=domain)
    msg = EmailMessage()
    msg["Subject"] = (req.get("subject") or "(sin asunto)")[:250]
    msg["From"] = formataddr((uname, cfg["from_address"])) if uname else cfg["from_address"]
    msg["To"] = ", ".join(to)
    if cc:
        msg["Cc"] = ", ".join(cc)
    reply_to = plus_alias(cfg, uid)
    msg["Reply-To"] = formataddr((uname, reply_to)) if uname else reply_to
    msg["Message-ID"] = mid
    if req.get("inReplyTo"):
        msg["In-Reply-To"] = req["inReplyTo"]
        msg["References"] = " ".join([*(req.get("references") or []), req["inReplyTo"]][-10:])
    msg["X-Crm-User"] = uid
    html = req.get("html") or ""
    msg.set_content(plain_of(html))
    msg.add_alternative(html, subtype="html")
    await asyncio.to_thread(_smtp_send, cfg, msg, to + cc)
    espo = Espo(tenant)
    data = {"name": msg["Subject"], "from": cfg["from_address"], "fromName": uname, "to": ";".join(to), "cc": ";".join(cc), "replyTo": reply_to, "body": html, "bodyPlain": plain_of(html),
            "isHtml": True, "status": "Sent", "dateSent": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"), "messageId": mid, "assignedUserId": uid, "usersIds": [uid]}
    if req.get("parentType") and req.get("parentId"):
        data.update({"parentType": req["parentType"], "parentId": req["parentId"]})
    saved = await espo.post("Email", data)
    return {"id": saved.get("id"), "messageId": mid, "replyTo": reply_to}
