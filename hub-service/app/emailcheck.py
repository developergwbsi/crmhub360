"""Validación de correos antes de escribir: comprueba que la dirección exista SIN enviarle nada. Pasos: sintaxis → el dominio tiene servidor de correo (MX) → el servidor del destinatario
acepta o rechaza el buzón (SMTP RCPT, sin llegar a enviar el mensaje) → detección de dominios que aceptan todo («catch-all», no verificable). Resultados:
  valid · catch_all (acepta todo: no se puede saber) · unknown (el servidor no deja verificar o respondió con un error temporal) · invalid (el buzón no existe) · no_mx (el dominio no recibe correo).
Solo `invalid` y `no_mx` bloquean el envío. Guarda el resultado en caché (tabla email_checks). Funciona desde el contenedor del Hub (puerto 25 de salida libre)."""
import asyncio
import logging
import os
import random
import re
import smtplib
import string

from . import compliance, db

log = logging.getLogger("hub.emailcheck")
SCHEMA = "CREATE TABLE IF NOT EXISTS email_checks (email TEXT PRIMARY KEY, status TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', checked_at TIMESTAMPTZ NOT NULL DEFAULT now());"
TTL_DAYS = {"valid": 14, "catch_all": 14, "invalid": 60, "no_mx": 30, "unknown": 2}
GONE = re.compile(r"(user unknown|no such user|unknown user|does not exist|doesn't exist|not exist|not found|mailbox (unavailable|not found|does not exist)|invalid (recipient|mailbox|address)|recipient (rejected|address rejected)|address rejected|5\.1\.1|5\.1\.10|no mailbox)", re.I)
_sem = asyncio.Semaphore(3)


def ensure_schema() -> None:
    with db.pool.connection() as c:
        c.execute(SCHEMA)


def _helo() -> str:
    return os.environ.get("MAIL_PROBE_HELO") or os.environ.get("MEET_HOST") or "localhost.localdomain"


def _mx_hosts(domain: str) -> list[str]:
    import dns.resolver
    try:
        ans = dns.resolver.resolve(domain, "MX", lifetime=6)
        return [str(r.exchange).rstrip(".") for r in sorted(ans, key=lambda r: r.preference)][:3]
    except Exception:
        try:   # sin MX, el correo va al servidor del propio dominio (A/AAAA)
            dns.resolver.resolve(domain, "A", lifetime=5)
            return [domain]
        except Exception:
            return []


def _rcpt(host: str, addr: str) -> tuple[int | None, str]:
    helo = _helo()
    try:
        s = smtplib.SMTP(host, 25, timeout=12)
        try:
            s.ehlo(helo)
            s.mail("verificacion@" + helo)
            code, msg = s.rcpt(addr)
            return code, msg.decode("utf-8", "replace")[:160]
        finally:
            try:
                s.quit()
            except Exception:
                pass
    except Exception as e:
        return None, repr(e)[:120]


def _check_sync(email: str) -> tuple[str, str]:
    ok, why = compliance.email_ok(email)
    if not ok:
        return "invalid", why or "Correo mal escrito"
    domain = email.rpartition("@")[2]
    hosts = _mx_hosts(domain)
    if not hosts:
        return "no_mx", f"El dominio «{domain}» no tiene servidor de correo: no puede recibir mensajes"
    code, msg = None, ""
    for h in hosts[:2]:
        code, msg = _rcpt(h, email)
        if code is not None:
            break
    if code is None:
        return "unknown", "No se pudo conectar con el servidor de correo del destinatario para verificarlo"
    if code in (250, 251):
        rnd = "zz" + "".join(random.choices(string.ascii_lowercase + string.digits, k=14)) + "@" + domain
        c2, _ = _rcpt(h, rnd)
        return ("catch_all", "El servidor acepta cualquier dirección: no se puede confirmar que el buzón exista") if c2 in (250, 251) else ("valid", "El servidor confirmó que el buzón existe")
    if code in (550, 551, 553, 554) and GONE.search(msg):
        return "invalid", f"El servidor de «{domain}» respondió que el buzón no existe"
    return "unknown", f"El servidor no permitió verificarlo ({code})" if code else "Sin respuesta del servidor"


def _cached(email: str) -> tuple[str, str] | None:
    try:
        with db.pool.connection() as c:
            r = c.execute("SELECT status, reason, checked_at FROM email_checks WHERE email=%s", (email,)).fetchone()
        if r:
            from datetime import datetime, timezone, timedelta
            if datetime.now(timezone.utc) - r["checked_at"] < timedelta(days=TTL_DAYS.get(r["status"], 2)):
                return r["status"], r["reason"]
    except Exception:
        pass
    return None


async def verify(email: str, use_cache: bool = True) -> tuple[str, str]:
    """(estado, motivo) de un correo; usa la caché y solo bloquea (invalid / no_mx) cuando está seguro."""
    email = compliance.norm_email(email)
    if not email:
        return "invalid", "Sin correo"
    if use_cache:
        hit = _cached(email)
        if hit:
            return hit
    async with _sem:
        try:
            st, why = await asyncio.to_thread(_check_sync, email)
        except Exception as e:
            log.warning("verificar %s: %s", email, str(e)[:100])
            return "unknown", "No se pudo verificar"
    try:
        with db.pool.connection() as c:
            c.execute("INSERT INTO email_checks (email, status, reason, checked_at) VALUES (%s,%s,%s,now()) ON CONFLICT (email) DO UPDATE SET status=EXCLUDED.status, reason=EXCLUDED.reason, checked_at=now()", (email, st, why))
    except Exception:
        pass
    return st, why


def blocks(status: str) -> bool:
    """¿Esta verificación impide escribirle? (solo cuando se sabe que no llegará)."""
    return status in ("invalid", "no_mx")
