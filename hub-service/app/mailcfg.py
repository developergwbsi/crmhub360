"""Correo propio de cada empresa: SMTP de salida y buzón IMAP de entrada, para dos funciones: «main» (correo normal del CRM y del comercial virtual) y «cold»
(correo en frío del buscador y de la prospección: remitente aparte, en otro dominio). Cada función puede ser **del sistema** (prestado desde el Centro de control) o **propia**
(la empresa pone su proveedor y su buzón aquí). Solo se edita aquí cuando el Centro de control dejó esa función en «Propio».
Se guarda en settings.mailout / settings.mailbox (main) y settings.mailout_cold / settings.mailbox_cold (cold)."""
import asyncio
import imaplib
import ipaddress
import json
import re
import smtplib
import socket
import ssl
import time

from . import db

ROLES = {"main": ("mailout", "mailbox", "mail"), "cold": ("mailout_cold", "mailbox_cold", "mail_cold")}
ADDR = re.compile(r"^[^@\s,;<>]{1,64}@[^@\s,;<>]{1,190}\.[A-Za-z]{2,}$")
PLUS_HOSTS = ("gmail", "google", "zoho")   # proveedores que aceptan «buzón+idUsuario@» (alias del mismo buzón)


def mode_of(slug: str, role: str) -> str:
    """Cómo está esta función según el Centro de control: 'own' (la empresa lo configura), 'off' (no incluida) o 'p<id>'/'shared' (prestado por el sistema)."""
    try:
        with db.pool.connection() as c:
            r = c.execute("SELECT value FROM control_settings WHERE key=%s", (f"services:{slug}",)).fetchone()
        sv = (r["value"] if r else {}) or {}
    except Exception:
        sv = {}
    return sv.get(ROLES[role][2]) or ("own" if role == "main" else "off")


def check_public_host(host: str) -> None:
    """La empresa escribe el servidor: no puede apuntar a direcciones internas del servidor (SMTP/IMAP hacia dentro)."""
    host = (host or "").strip().lower()
    if not re.match(r"^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$", host):
        raise ValueError("El nombre del servidor no es válido.")
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        raise ValueError(f"No se encontró el servidor «{host}».")
    for i in infos:
        if not ipaddress.ip_address(i[4][0]).is_global:
            raise ValueError("Ese servidor apunta a una dirección interna; usa el de tu proveedor de correo.")


def _view(cfg: dict, box: dict) -> dict:
    return {"configured": bool(cfg.get("host") and cfg.get("from_address")), "source": cfg.get("source") or ("loaned" if cfg.get("host") else ""),
            "smtp": {"host": cfg.get("host") or "", "port": cfg.get("port") or 587, "security": cfg.get("security") or "", "user": cfg.get("user") or "", "from_address": cfg.get("from_address") or "", "hasPassword": bool(cfg.get("password"))},
            "imap": {"host": box.get("host") or "", "port": box.get("port") or 993, "user": box.get("user") or "", "hasPassword": bool(box.get("password")), "enabled": bool(box.get("enabled"))},
            "inbound": bool(cfg.get("inbound_secret"))}


def get(tenant: dict) -> dict:
    st, out = tenant.get("settings") or {}, {}
    for role, (ko, kb, _) in ROLES.items():
        m = mode_of(tenant["slug"], role)
        out[role] = {"mode": "own" if m == "own" else ("off" if m == "off" else "loaned"), "editable": m == "own", **_view(st.get(ko) or {}, st.get(kb) or {})}
    return out


def _save_keys(slug: str, ko: str, kb: str, mailout: dict | None, mailbox: dict | None) -> None:
    with db.pool.connection() as c:
        for key, val in ((ko, mailout), (kb, mailbox)):
            if val is None:
                c.execute("UPDATE tenants SET settings = settings - %s WHERE slug=%s", (key, slug))
            else:
                c.execute("UPDATE tenants SET settings = jsonb_set(COALESCE(settings,'{}'::jsonb), %s, %s::jsonb, true) WHERE slug=%s", ("{" + key + "}", json.dumps(val), slug))


def save(tenant: dict, role: str, body: dict) -> dict:
    ko, kb, _ = ROLES[role]
    if mode_of(tenant["slug"], role) != "own":
        raise PermissionError("Esta función de correo la provee el sistema. Pide al administrador del servicio que la deje como «Propio» para configurarla tú.")
    st = tenant.get("settings") or {}
    old, oldbox = st.get(ko) or {}, st.get(kb) or {}
    sm, im = body.get("smtp") or {}, body.get("imap") or {}
    host, frm = str(sm.get("host") or "").strip().lower(), str(sm.get("from_address") or "").strip()
    if not host or not ADDR.match(frm):
        raise ValueError("Escribe el servidor SMTP y un correo remitente válido.")
    check_public_host(host)
    try:
        port = int(sm.get("port") or 587)
    except Exception:
        raise ValueError("El puerto SMTP no es válido.")
    password = str(sm.get("password") or "").strip() or (old.get("password") if old.get("host") == host and old.get("user") == str(sm.get("user") or "").strip() else "")
    if sm.get("user") and not password:
        raise ValueError("Falta la contraseña del correo de salida.")
    sec = sm.get("security") if sm.get("security") in ("TLS", "SSL", "") else "TLS"
    mailout = {"host": host, "port": port, "security": sec, "user": str(sm.get("user") or "").strip(), "password": password, "from_address": frm, "plus": False, "source": "own"}
    mailbox = None
    ihost, iuser = str(im.get("host") or "").strip().lower(), str(im.get("user") or "").strip()
    if ihost and iuser:
        check_public_host(ihost)
        ipass = str(im.get("password") or "").strip() or (oldbox.get("password") if oldbox.get("host") == ihost and oldbox.get("user") == iuser else "")
        if not ipass:
            raise ValueError("Falta la contraseña del buzón de entrada.")
        same = oldbox.get("user") == iuser and oldbox.get("host") == ihost
        mailbox = {"enabled": True, "host": ihost, "port": int(im.get("port") or 993), "user": iuser, "password": ipass, "folder": "INBOX",
                   "since": oldbox.get("since") if same else time.strftime("%Y-%m-%d", time.gmtime()), "last_uid": oldbox.get("last_uid", 0) if same else 0, "source": "own"}
        mailout["plus"] = any(k in ihost + iuser for k in PLUS_HOSTS)
        if iuser.lower() != frm.lower():
            mailout["reply_address"] = iuser   # las respuestas llegan a otro buzón real (el remitente solo envía)
    _save_keys(tenant["slug"], ko, kb, mailout, mailbox)
    return get({**tenant, "settings": {**st, ko: mailout, **({kb: mailbox} if mailbox else {})}})[role]


def clear(tenant: dict, role: str) -> None:
    if mode_of(tenant["slug"], role) != "own":
        raise PermissionError("Esta función de correo la provee el sistema.")
    ko, kb, _ = ROLES[role]
    _save_keys(tenant["slug"], ko, kb, None, None)


def _test_sync(cfg: dict, box: dict) -> dict:
    res = {"smtp": "", "imap": ""}
    try:
        check_public_host(cfg["host"])
        port, sec = int(cfg.get("port") or 587), cfg.get("security") or ""
        s = smtplib.SMTP_SSL(cfg["host"], port, timeout=20, context=ssl.create_default_context()) if sec == "SSL" else smtplib.SMTP(cfg["host"], port, timeout=20)
        try:
            if sec == "TLS":
                s.starttls(context=ssl.create_default_context())
            if cfg.get("user"):
                s.login(cfg["user"], cfg.get("password") or "")
            res["smtp"] = "ok"
        finally:
            try:
                s.quit()
            except Exception:
                pass
    except Exception as e:
        res["smtp"] = "error: " + str(e)[:140]
    if box.get("host"):
        try:
            check_public_host(box["host"])
            i = imaplib.IMAP4_SSL(box["host"], int(box.get("port") or 993), timeout=20)
            try:
                i.login(box["user"], box.get("password") or "")
                i.select("INBOX", readonly=True)
                res["imap"] = "ok"
            finally:
                try:
                    i.logout()
                except Exception:
                    pass
        except Exception as e:
            res["imap"] = "error: " + str(e)[:140]
    return res


async def test(tenant: dict, role: str) -> dict:
    """Comprueba el usuario y la contraseña de salida (SMTP) y de entrada (IMAP) sin enviar ni leer ningún correo."""
    ko, kb, _ = ROLES[role]
    st = tenant.get("settings") or {}
    cfg, box = st.get(ko) or {}, st.get(kb) or {}
    if not cfg.get("host"):
        raise ValueError("Primero guarda la configuración.")
    return await asyncio.to_thread(_test_sync, cfg, box)
