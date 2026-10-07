"""Proveedor genérico por API HTTP: sirve para cualquier BSP, proveedor de SMS o central telefónica que exponga una API REST.
La empresa define URL, autenticación y una plantilla del cuerpo con variables {{to}}, {{text}}, {{from}}…"""
import ipaddress
import json
import re
import socket
from urllib.parse import quote, urlparse

import httpx

from . import config

VARS = {"to": "Número del destinatario con + (+573001234567)", "to_plain": "Número sin + (573001234567)", "text": "Texto del mensaje",
        "from": "Remitente configurado", "name": "Nombre del lead", "lead_id": "ID del lead", "agent": "Nombre del asesor",
        "agent_phone": "Teléfono/extensión del asesor (llamadas)"}
SECRET = "auth_secret"
_BLOCKED = [ipaddress.ip_network(n) for n in ("172.28.0.0/24", "172.17.0.0/16")]


def check_url(url: str) -> None:
    """Rechaza direcciones internas del servidor (loopback, enlace local, red de contenedores)."""
    p = urlparse(url)
    if p.scheme not in ("http", "https") or not p.hostname:
        raise ValueError("La URL debe empezar por http:// o https://")
    if config.ALLOW_LOOPBACK_URLS:
        return
    try:
        infos = socket.getaddrinfo(p.hostname, p.port or (443 if p.scheme == "https" else 80), proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise ValueError(f"No se pudo resolver «{p.hostname}»")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_loopback or ip.is_link_local or ip.is_unspecified or ip.is_multicast or any(ip in n for n in _BLOCKED):
            raise ValueError("Esa dirección apunta al propio servidor y no está permitida.")


def validate(cfg: dict) -> dict:
    """Limpia y valida la configuración (sin resolver DNS: eso se hace al usarla)."""
    url = str(cfg.get("url", "")).strip()[:500]
    if url and urlparse(url.replace("{{", "x").replace("}}", "x")).scheme not in ("http", "https"):
        raise ValueError("La URL debe empezar por http:// o https://")
    hdr = str(cfg.get("headers", "")).strip()
    if hdr:
        try:
            h = json.loads(hdr)
            if not isinstance(h, dict) or not all(isinstance(k, str) and isinstance(v, (str, int, float)) for k, v in h.items()):
                raise ValueError
        except ValueError:
            raise ValueError("Las cabeceras deben ser un JSON de pares clave/valor, p. ej. {\"X-Api-Version\": \"2\"}")
    method = str(cfg.get("method", "POST")).upper()
    btype = str(cfg.get("body_type", "json")).lower()
    auth = str(cfg.get("auth_type", "none")).lower()
    return {"url": url, "method": method if method in ("POST", "GET", "PUT") else "POST", "body_type": btype if btype in ("json", "form", "query") else "json",
            "body": str(cfg.get("body", ""))[:4000], "auth_type": auth if auth in ("none", "basic", "bearer", "header") else "none",
            "auth_user": str(cfg.get("auth_user", ""))[:200], "auth_header": str(cfg.get("auth_header", ""))[:80], SECRET: str(cfg.get(SECRET, ""))[:500],
            "headers": hdr[:1500], "sender": str(cfg.get("sender", ""))[:80], "inbound_phone": str(cfg.get("inbound_phone", ""))[:120],
            "inbound_text": str(cfg.get("inbound_text", ""))[:120], "inbound_name": str(cfg.get("inbound_name", ""))[:120]}


def merge(old: dict | None, new: dict) -> dict:
    """Si la clave llega vacía se conserva la anterior (la interfaz nunca recibe los secretos)."""
    out = validate(new)
    if not out[SECRET] and old:
        out[SECRET] = old.get(SECRET, "")
    return out


def public(cfg: dict | None) -> dict:
    c = dict(cfg or {})
    s = c.pop(SECRET, "")
    c["secretSet"] = bool(s)
    c["secretHint"] = ("…" + s[-4:]) if s else ""
    return c


def _sub(template: str, values: dict, mode: str) -> str:
    def rep(m):
        v = str(values.get(m.group(1), ""))
        return json.dumps(v)[1:-1] if mode == "json" else quote(v, safe="") if mode == "url" else v
    return re.sub(r"\{\{\s*(\w+)\s*\}\}", rep, template)


def build(cfg: dict, values: dict) -> tuple[str, str, dict, dict]:
    """Devuelve (método, url, kwargs de httpx, cabeceras) con las variables ya sustituidas."""
    if not cfg or not cfg.get("url"):
        raise ValueError("El proveedor HTTP no está configurado.")
    values = {**values, "to_plain": str(values.get("to", "")).lstrip("+"), "from": values.get("from") or cfg.get("sender", "")}
    url = _sub(cfg["url"], values, "url")
    headers = json.loads(cfg["headers"]) if cfg.get("headers") else {}
    auth = None
    t = cfg.get("auth_type")
    if t == "basic":
        auth = (cfg.get("auth_user", ""), cfg.get(SECRET, ""))
    elif t == "bearer":
        headers["Authorization"] = f"Bearer {cfg.get(SECRET, '')}"
    elif t == "header" and cfg.get("auth_header"):
        headers[cfg["auth_header"]] = cfg.get(SECRET, "")
    kw: dict = {}
    body_t = cfg.get("body_type", "json")
    body = cfg.get("body", "")
    if body_t == "json" and body:
        txt = _sub(body, values, "json")
        try:
            kw["json"] = json.loads(txt)
        except ValueError:
            raise ValueError("La plantilla del cuerpo no produce un JSON válido. Revisa comillas y comas.")
    elif body_t == "form" and body:
        kw["data"] = {k: v[0] for k, v in __import__("urllib.parse", fromlist=["parse_qs"]).parse_qs(_sub(body, values, "raw"), keep_blank_values=True).items()}
    elif body_t == "query" and body:
        url += ("&" if "?" in url else "?") + _sub(body, values, "url")  # solo los valores se codifican; & y = de la plantilla quedan como separadores
    return cfg.get("method", "POST"), url, kw, {"headers": headers, "auth": auth}


async def call(cfg: dict, values: dict, timeout: float = 25) -> str:
    """Hace la petición. Devuelve el texto de la respuesta; lanza ValueError con el motivo si el proveedor la rechaza."""
    method, url, kw, extra = build(cfg, values)
    check_url(url)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as c:
        r = await c.request(method, url, headers=extra["headers"], auth=extra["auth"], **kw)
    if r.status_code >= 400:
        raise ValueError(f"El proveedor respondió {r.status_code}: {r.text[:240]}")
    return r.text


def dig(obj, path: str):
    """Valor en una ruta con puntos, p. ej. «messages.0.from»."""
    for part in (path or "").split("."):
        if part == "":
            continue
        try:
            obj = obj[int(part)] if isinstance(obj, list) else obj[part]
        except (KeyError, IndexError, ValueError, TypeError):
            return None
    return obj
