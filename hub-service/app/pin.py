"""PIN de reingreso: cada persona puede crear un PIN de 4 a 6 dígitos para volver a entrar sin escribir la contraseña, SOLO desde los equipos donde ya entró con contraseña y lo activó.
El PIN no sirve solo: va unido a un «equipo» (un código largo al azar guardado en ese navegador). Se guarda con hash (scrypt con sal propia); tras 5 intentos fallidos se bloquea
15 minutos y los equipos dejan de valer (hay que entrar con contraseña). Tablas: user_pin, pin_device. La contraseña la valida el CRM (PHP); aquí no se maneja."""
import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta, timezone

from . import db

SCHEMA = """
CREATE TABLE IF NOT EXISTS user_pin (tenant TEXT NOT NULL, user_id TEXT NOT NULL, pin_hash TEXT NOT NULL, salt TEXT NOT NULL, failed INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (tenant, user_id));
CREATE TABLE IF NOT EXISTS pin_device (tenant TEXT NOT NULL, id SERIAL PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL, label TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_used TIMESTAMPTZ, revoked BOOLEAN NOT NULL DEFAULT false);
CREATE INDEX IF NOT EXISTS pin_device_user ON pin_device (tenant, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS pin_device_tok ON pin_device (tenant, token_hash);
"""
MAX_FAILS = 5
LOCK_MIN = 15
DEVICE_DAYS = 90
WEAK = {"0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999", "1234", "4321", "1212", "2580", "0852", "000000", "111111", "123456", "654321", "121212", "123123"}


def ensure_schema() -> None:
    with db.pool.connection() as c:
        c.execute(SCHEMA)


def _hash(pin: str, salt: str) -> str:
    return hashlib.scrypt(pin.encode(), salt=bytes.fromhex(salt), n=2 ** 14, r=8, p=1, dklen=32).hex()


def _tok(t: str) -> str:
    return hashlib.sha256(t.encode()).hexdigest()


def check_format(pin: str) -> str:
    """Valida el PIN: 4 a 6 dígitos, sin ser obvio (0000, 1234, repetidos, secuencias)."""
    pin = (pin or "").strip()
    if not re.fullmatch(r"\d{4,6}", pin):
        raise ValueError("El PIN debe tener de 4 a 6 números.")
    if pin in WEAK or len(set(pin)) == 1:
        raise ValueError("Ese PIN es muy fácil de adivinar. Elige otro que no sea una secuencia ni números repetidos.")
    return pin


def _new_device(c, tenant: str, user: str, label: str) -> str:
    token = secrets.token_urlsafe(32)
    c.execute("INSERT INTO pin_device (tenant, user_id, token_hash, label) VALUES (%s,%s,%s,%s)", (tenant, user, _tok(token), (label or "")[:80]))
    return token


def set_pin(tenant: str, user: str, pin: str, label: str) -> dict:
    """Crea o cambia el PIN (el CRM ya validó la contraseña). Los equipos anteriores dejan de valer y este queda activado."""
    pin = check_format(pin)
    salt = secrets.token_hex(16)
    with db.pool.connection() as c:
        c.execute("INSERT INTO user_pin (tenant, user_id, pin_hash, salt) VALUES (%s,%s,%s,%s) ON CONFLICT (tenant, user_id) DO UPDATE SET pin_hash=EXCLUDED.pin_hash, salt=EXCLUDED.salt, failed=0, locked_until=NULL, updated_at=now()",
                  (tenant, user, _hash(pin, salt), salt))
        c.execute("UPDATE pin_device SET revoked=true WHERE tenant=%s AND user_id=%s", (tenant, user))
        return {"device": _new_device(c, tenant, user, label)}


def add_device(tenant: str, user: str, label: str) -> dict:
    """Activa el PIN en este equipo (el CRM ya validó la contraseña). Requiere que ya exista un PIN."""
    with db.pool.connection() as c:
        if not c.execute("SELECT 1 FROM user_pin WHERE tenant=%s AND user_id=%s", (tenant, user)).fetchone():
            raise ValueError("Aún no tienes un PIN.")
        return {"device": _new_device(c, tenant, user, label)}


def remove(tenant: str, user: str) -> None:
    with db.pool.connection() as c:
        c.execute("DELETE FROM user_pin WHERE tenant=%s AND user_id=%s", (tenant, user))
        c.execute("DELETE FROM pin_device WHERE tenant=%s AND user_id=%s", (tenant, user))


def forget_device(tenant: str, user: str, device: str) -> None:
    with db.pool.connection() as c:
        c.execute("UPDATE pin_device SET revoked=true WHERE tenant=%s AND user_id=%s AND token_hash=%s", (tenant, user, _tok(device or "-")))


def _device_ok(c, tenant: str, user: str, device: str):
    if not device:
        return None
    r = c.execute("SELECT id, created_at, last_used FROM pin_device WHERE tenant=%s AND user_id=%s AND token_hash=%s AND NOT revoked", (tenant, user, _tok(device))).fetchone()
    if not r:
        return None
    last = r["last_used"] or r["created_at"]
    return r if datetime.now(timezone.utc) - last <= timedelta(days=DEVICE_DAYS) else None


def status(tenant: str, user: str, device: str = "") -> dict:
    with db.pool.connection() as c:
        p = c.execute("SELECT updated_at FROM user_pin WHERE tenant=%s AND user_id=%s", (tenant, user)).fetchone()
        n = c.execute("SELECT count(*) AS n FROM pin_device WHERE tenant=%s AND user_id=%s AND NOT revoked", (tenant, user)).fetchone()["n"] if p else 0
        return {"hasPin": bool(p), "deviceOk": bool(p and _device_ok(c, tenant, user, device)), "devices": n, "updated": p["updated_at"].isoformat() if p else ""}


def verify(tenant: str, user: str, device: str, pin: str) -> dict:
    """Comprueba equipo + PIN. {ok} o {ok:false, left, locked, reason}. Los fallos suman; al quinto se bloquea y se revocan los equipos."""
    pin = (pin or "").strip()
    now = datetime.now(timezone.utc)
    with db.pool.connection() as c:
        p = c.execute("SELECT pin_hash, salt, failed, locked_until FROM user_pin WHERE tenant=%s AND user_id=%s FOR UPDATE", (tenant, user)).fetchone()
        dev = _device_ok(c, tenant, user, device) if p else None
        if not p or not dev:
            return {"ok": False, "reason": "device"}   # sin PIN o equipo no autorizado: se entra con contraseña
        if p["locked_until"] and p["locked_until"] > now:
            return {"ok": False, "reason": "locked", "locked": True, "minutes": max(1, int((p["locked_until"] - now).total_seconds() // 60) + 1)}
        if re.fullmatch(r"\d{4,6}", pin) and hmac.compare_digest(_hash(pin, p["salt"]), p["pin_hash"]):
            c.execute("UPDATE user_pin SET failed=0, locked_until=NULL WHERE tenant=%s AND user_id=%s", (tenant, user))
            c.execute("UPDATE pin_device SET last_used=now() WHERE id=%s", (dev["id"],))
            return {"ok": True}
        fails = p["failed"] + 1
        if fails >= MAX_FAILS:
            c.execute("UPDATE user_pin SET failed=0, locked_until=%s WHERE tenant=%s AND user_id=%s", (now + timedelta(minutes=LOCK_MIN), tenant, user))
            c.execute("UPDATE pin_device SET revoked=true WHERE tenant=%s AND user_id=%s", (tenant, user))
            return {"ok": False, "reason": "locked", "locked": True, "minutes": LOCK_MIN}
        c.execute("UPDATE user_pin SET failed=%s WHERE tenant=%s AND user_id=%s", (fails, tenant, user))
        return {"ok": False, "reason": "wrong", "left": MAX_FAILS - fails}
