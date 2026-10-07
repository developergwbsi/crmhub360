"""Web Push con VAPID: el servidor envía notificaciones aunque la app esté cerrada (la reciben los navegadores suscritos)."""
import asyncio
import base64
import json
import logging

from pywebpush import WebPushException, webpush
from py_vapid import Vapid02
from cryptography.hazmat.primitives import serialization

from . import config, db

log = logging.getLogger("crmhub.push")
_vapid: dict | None = None


def _b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def keys() -> dict:
    """Par VAPID persistente (se crea la primera vez). Devuelve {'private_pem', 'public'}."""
    global _vapid
    if _vapid:
        return _vapid
    with db.pool.connection() as c:
        row = c.execute("SELECT value FROM kv WHERE key = 'vapid_private_pem'").fetchone()
        if not row:
            v = Vapid02()
            v.generate_keys()
            pem = v.private_pem().decode()
            c.execute("INSERT INTO kv (key, value) VALUES ('vapid_private_pem', %s) ON CONFLICT (key) DO NOTHING", (pem,))
            row = c.execute("SELECT value FROM kv WHERE key = 'vapid_private_pem'").fetchone()
    pem = row["value"]
    v = Vapid02.from_pem(pem.encode())
    pub = v.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    _vapid = {"private_pem": pem, "public": _b64u(pub)}
    return _vapid


def save(tenant: str, user_id: str, sub: dict, ua: str | None) -> None:
    k = sub.get("keys") or {}
    if not (sub.get("endpoint") and k.get("p256dh") and k.get("auth")):
        raise ValueError("Suscripción incompleta")
    with db.pool.connection() as c:
        c.execute(
            """INSERT INTO push_subscriptions (tenant, user_id, endpoint, p256dh, auth, user_agent)
               VALUES (%s,%s,%s,%s,%s,%s)
               ON CONFLICT (endpoint) DO UPDATE SET tenant = EXCLUDED.tenant, user_id = EXCLUDED.user_id,
                   p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent""",
            (tenant, user_id, sub["endpoint"], k["p256dh"], k["auth"], (ua or "")[:300]))


def remove(endpoint: str) -> None:
    with db.pool.connection() as c:
        c.execute("DELETE FROM push_subscriptions WHERE endpoint = %s", (endpoint,))


def count(tenant: str) -> int:
    with db.pool.connection() as c:
        return c.execute("SELECT count(*) n FROM push_subscriptions WHERE tenant = %s", (tenant,)).fetchone()["n"]


def _send_one(sub: dict, payload: str) -> int:
    try:
        webpush(subscription_info={"endpoint": sub["endpoint"], "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]}},
                data=payload, vapid_private_key=Vapid02.from_pem(keys()["private_pem"].encode()),
                vapid_claims={"sub": config.VAPID_SUBJECT}, ttl=86400)
        return 201
    except WebPushException as e:
        return e.response.status_code if e.response is not None else 0
    except Exception as e:  # red caída, endpoint inválido…
        log.warning("push falló: %s", e)
        return 0


async def send(tenant: str, *, title: str, body: str, url: str = "/", tag: str = "crmhub", kind: str = "info",
               user_id: str | None = None) -> dict:
    with db.pool.connection() as c:
        q = "SELECT * FROM push_subscriptions WHERE tenant = %s" + (" AND user_id = %s" if user_id else "")
        subs = c.execute(q, (tenant, user_id) if user_id else (tenant,)).fetchall()
    payload = json.dumps({"title": title, "body": body, "url": url, "tag": tag, "type": kind})
    results = await asyncio.gather(*[asyncio.to_thread(_send_one, s, payload) for s in subs])
    sent = dead = 0
    for s, code in zip(subs, results):
        if code in (200, 201, 202):
            sent += 1
            with db.pool.connection() as c:
                c.execute("UPDATE push_subscriptions SET last_ok = now() WHERE id = %s", (s["id"],))
        elif code in (404, 410):  # el navegador canceló la suscripción
            dead += 1
            remove(s["endpoint"])
    return {"devices": len(subs), "sent": sent, "removed": dead}
