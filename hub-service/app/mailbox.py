"""Buzón de entrada: trae a la bandeja de EspoCRM los correos que llegan a la cuenta de correo de la empresa (IMAP).
Corre en el Hub (red del servidor) porque el cortafuegos redirige IMAP (143/993) del tráfico de los contenedores a otro servidor.
Configuración por empresa en tenants.settings.mailbox = {enabled, host, port, user, password, since, last_uid}."""
import asyncio, email, html as _html, imaplib, json, logging, re
from datetime import datetime, timezone
from email.header import decode_header, make_header
from email.utils import getaddresses, parseaddr, parsedate_to_datetime

from . import db
from .espo import Espo

log = logging.getLogger("mailbox")
INTERVAL = 60
MAX_PER_CYCLE = 25
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _h(v) -> str:
    try:
        return str(make_header(decode_header(v or ""))).strip()
    except Exception:
        return str(v or "").strip()


def _parts(msg) -> tuple[str, str]:
    html, text = "", ""
    for part in msg.walk() if msg.is_multipart() else [msg]:
        if part.get_content_maintype() != "text" or part.get_filename():
            continue
        try:
            payload = part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", "replace")
        except Exception:
            continue
        if part.get_content_subtype() == "html" and not html:
            html = payload
        elif part.get_content_subtype() == "plain" and not text:
            text = payload
    return html, text


def fetch_new(cfg: dict) -> tuple[list[dict], int]:
    """Bloqueante: devuelve (mensajes nuevos, mayor UID visto). La primera vez solo trae lo recibido desde `since`."""
    last = int(cfg.get("last_uid") or 0)
    imap = imaplib.IMAP4_SSL(cfg["host"], int(cfg.get("port") or 993), timeout=25)
    try:
        imap.login(cfg["user"], cfg["password"])
        imap.select(cfg.get("folder") or "INBOX", readonly=True)
        if last:
            typ, data = imap.uid("SEARCH", None, f"UID {last + 1}:*")
        else:
            d = datetime.fromisoformat(cfg.get("since") or datetime.now(timezone.utc).date().isoformat())
            typ, data = imap.uid("SEARCH", None, "SINCE", f"{d.day:02d}-{MONTHS[d.month - 1]}-{d.year}")
        uids = sorted(int(x) for x in (data[0] or b"").split() if int(x) > last)[:MAX_PER_CYCLE]
        out = []
        for uid in uids:
            typ, parts = imap.uid("FETCH", str(uid), "(RFC822)")
            raw = next((p[1] for p in parts if isinstance(p, tuple)), None)
            if not raw:
                continue
            msg = email.message_from_bytes(raw)
            name, addr = parseaddr(_h(msg.get("From")))
            html, text = _parts(msg)
            try:
                when = parsedate_to_datetime(msg.get("Date")).astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
            except Exception:
                when = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
            out.append({"uid": uid, "subject": _h(msg.get("Subject")) or "(sin asunto)", "from": addr.lower(), "fromName": name,
                        "to": [a.lower() for _, a in getaddresses([_h(msg.get("To"))]) if a], "cc": [a.lower() for _, a in getaddresses([_h(msg.get("Cc"))]) if a],
                        "html": html, "text": text, "date": when, "messageId": (msg.get("Message-ID") or "").strip()})
        return out, (uids[-1] if uids else last)
    finally:
        try:
            imap.logout()
        except Exception:
            pass


async def _owner(tenant: dict, espo: Espo, addr: str) -> tuple[str | None, str | None, str | None]:
    """(parentType, parentId, asesor) del lead o contacto con ese correo; si no existe, ninguno."""
    for scope in ("Lead", "Contact"):
        try:
            r = await espo.get(scope, **{"where[0][type]": "equals", "where[0][attribute]": "emailAddress", "where[0][value]": addr, "maxSize": 1, "select": "id,assignedUserId"})
        except Exception:
            continue
        if r.get("list"):
            return scope, r["list"][0]["id"], r["list"][0].get("assignedUserId")
    return None, None, None


async def _admin_id(espo: Espo) -> str | None:
    try:
        r = await espo.get("User", **{"where[0][type]": "equals", "where[0][attribute]": "type", "where[0][value]": "admin", "maxSize": 1, "select": "id"})
        return r["list"][0]["id"] if r.get("list") else None
    except Exception:
        return None


async def import_message(tenant: dict, espo: Espo, m: dict, own_address: str) -> bool:
    if m["messageId"]:   # no repetir un correo ya importado (p. ej. si se reinicia el avance del buzón)
        try:
            dup = await espo.get("Email", **{"where[0][type]": "equals", "where[0][attribute]": "messageId", "where[0][value]": m["messageId"][:255], "maxSize": 1, "select": "id"})
            if dup.get("list"):
                return False
        except Exception:
            pass
    ptype, pid, assignee = await _owner(tenant, espo, m["from"])
    owner = assignee or await _admin_id(espo)
    body = m["html"] or "<br>".join(_html.escape(m["text"]).splitlines())
    data = {"name": m["subject"][:250], "from": m["from"], "to": ";".join(m["to"]), "cc": ";".join(m["cc"]), "isHtml": bool(m["html"]), "body": body,
            "bodyPlain": m["text"] or re.sub(r"<[^>]+>", "", m["html"]), "status": "Archived", "dateSent": m["date"], "messageId": m["messageId"][:255], "isRead": False}
    if m["fromName"]:
        data["fromName"] = m["fromName"][:120]
    if owner:
        data["assignedUserId"] = owner
        data["usersIds"] = [owner]
    if ptype:
        data.update({"parentType": ptype, "parentId": pid})
    await espo.post("Email", data)
    return True


async def poll(tenant: dict) -> int:
    cfg = (tenant.get("settings") or {}).get("mailbox") or {}
    if not cfg.get("enabled") or not cfg.get("host") or not cfg.get("user"):
        return 0
    msgs, top = await asyncio.to_thread(fetch_new, cfg)
    espo, n = Espo(tenant), 0
    own = cfg.get("user", "")
    for m in msgs:
        try:
            n += 1 if await import_message(tenant, espo, m, own) else 0
        except Exception as e:  # un correo problemático no debe frenar los demás
            log.warning("no se pudo importar el correo %s de %s: %s", m["uid"], tenant["slug"], str(e)[:160])
    if top != int(cfg.get("last_uid") or 0):
        with db.pool.connection() as c:
            c.execute("UPDATE tenants SET settings = jsonb_set(settings, '{mailbox,last_uid}', to_jsonb(%s::bigint)) WHERE slug = %s", (top, tenant["slug"]))
    return n


async def worker():
    await asyncio.sleep(20)
    while True:
        try:
            with db.pool.connection() as c:
                rows = c.execute("SELECT * FROM tenants WHERE status = 'active' AND settings ? 'mailbox'").fetchall()
            for t in rows:
                try:
                    n = await poll(t)
                    if n:
                        log.info("%s: %s correos nuevos", t["slug"], n)
                except Exception as e:
                    log.warning("buzón %s: %s", t["slug"], str(e)[:160])
        except Exception:
            log.exception("ciclo del buzón")
        await asyncio.sleep(INTERVAL)
