"""Cumplimiento de la prospección: lista de «no contactar» (correo y teléfono), detección de bajas en cualquier canal, horarios legales por país,
enlace de baja de los correos en frío (con cabecera List-Unsubscribe de un clic) y cuotas de envío por dominio.
Nada se envía por iniciativa propia a quien esté en la lista; la baja se respeta siempre, en todos los canales y para todos los comerciales virtuales de la empresa."""
import base64
import hashlib
import hmac
import os
import re
import unicodedata
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from . import db

SCHEMA = """
CREATE TABLE IF NOT EXISTS dnc (tenant TEXT NOT NULL, kind TEXT NOT NULL, value TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (tenant, kind, value));
CREATE TABLE IF NOT EXISTS consents (tenant TEXT NOT NULL, kind TEXT NOT NULL, value TEXT NOT NULL, channel TEXT NOT NULL DEFAULT 'whatsapp', source TEXT NOT NULL DEFAULT '', at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (tenant, kind, value, channel));
CREATE TABLE IF NOT EXISTS mail_quota (tenant TEXT NOT NULL, day DATE NOT NULL, sender TEXT NOT NULL, n INT NOT NULL DEFAULT 0, PRIMARY KEY (tenant, day, sender));
"""


def ensure_schema() -> None:
    with db.pool.connection() as c:
        c.execute(SCHEMA)


def _plain(t: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", (t or "").lower().strip()) if unicodedata.category(c) != "Mn")


# ---------------- normalización
EMAIL_RE = re.compile(r"^[a-z0-9._%+\-]+@[a-z0-9\-]+(\.[a-z0-9\-]+)*\.[a-z]{2,}$")
DISPOSABLE = {"mailinator.com", "10minutemail.com", "guerrillamail.com", "tempmail.com", "yopmail.com", "trashmail.com", "sharklasers.com", "getnada.com", "dispostable.com"}
ROLE_LOCALS = {"noreply", "no-reply", "donotreply", "mailer-daemon", "postmaster", "abuse", "spam"}


def norm_email(e: str | None) -> str:
    return (e or "").strip().lower()


def email_ok(e: str | None) -> tuple[bool, str]:
    """(válido, motivo si no): sintaxis, dominio desechable y buzones que nunca leen nadie."""
    e = norm_email(e)
    if not e or not EMAIL_RE.match(e) or ".." in e:
        return False, "Correo mal escrito"
    local, _, dom = e.partition("@")
    if dom in DISPOSABLE:
        return False, "Correo temporal o desechable"
    if local in ROLE_LOCALS:
        return False, "Buzón que no lee nadie"
    return True, ""


# prefijo telefónico → país (ISO), de más largo a más corto
PREFIX = {"57": "CO", "52": "MX", "51": "PE", "56": "CL", "54": "AR", "593": "EC", "507": "PA", "58": "VE", "591": "BO", "595": "PY", "598": "UY", "506": "CR", "502": "GT", "503": "SV",
          "504": "HN", "505": "NI", "809": "DO", "829": "DO", "849": "DO", "34": "ES", "55": "BR", "1": "US"}


def country_of_phone(e164: str | None) -> str:
    d = re.sub(r"\D", "", e164 or "")
    for n in (3, 2, 1):
        if d[:n] in PREFIX:
            return PREFIX[d[:n]]
    return ""


def phone_e164(raw: str | None, default_country: str = "CO") -> tuple[str, str]:
    """(teléfono en E.164 o '', motivo si no sirve). Sin «+» se asume el país por defecto."""
    s = re.sub(r"[^\d+]", "", (raw or "").strip())
    if not s:
        return "", "Sin teléfono"
    if s.startswith("00"):
        s = "+" + s[2:]
    if not s.startswith("+"):
        pref = next((p for p, c in PREFIX.items() if c == default_country.upper() and len(p) <= 3), "57")
        d = s.lstrip("0")
        s = "+" + (d if d.startswith(pref) and len(d) > 10 else pref + d)
    d = s[1:]
    if not d.isdigit() or not (8 <= len(d) <= 15):
        return "", "Teléfono con formato inválido"
    if country_of_phone(s) == "CO" and not re.match(r"^57(3\d{9})$", d) and not re.match(r"^57[1-8]\d{7}$", d):
        return "", "Teléfono de Colombia inválido"
    return s, ""


# ---------------- horarios legales de contacto comercial (conservadores)
# (zona horaria, {día_semana(0=lunes): (inicio, fin)}). Colombia: Ley 2300 de 2023 — lunes a viernes 7:00 a 19:00 y sábados 8:00 a 15:00; domingos y festivos no.
_WEEK = {i: (8, 18) for i in range(5)}
RULES = {
    "CO": ("America/Bogota", {**{i: (7, 19) for i in range(5)}, 5: (8, 15)}),
    "MX": ("America/Mexico_City", {i: (9, 18) for i in range(5)}),
    "PE": ("America/Lima", {i: (9, 18) for i in range(5)}),
    "CL": ("America/Santiago", {i: (9, 18) for i in range(5)}),
    "AR": ("America/Argentina/Buenos_Aires", {i: (9, 18) for i in range(5)}),
    "EC": ("America/Guayaquil", {i: (9, 18) for i in range(5)}),
    "PA": ("America/Panama", {i: (9, 18) for i in range(5)}),
    "ES": ("Europe/Madrid", {i: (9, 20) for i in range(5)}),
    "US": ("America/New_York", {i: (8, 20) for i in range(6)}),
}


def rule_for(country: str, fallback_tz: str = "America/Bogota") -> tuple[ZoneInfo, dict]:
    tz, days = RULES.get((country or "").upper(), (fallback_tz, _WEEK))
    return ZoneInfo(tz), days


def legal_ok(country: str, now: datetime | None = None, fallback_tz: str = "America/Bogota") -> tuple[bool, datetime]:
    """(se puede escribir ahora, próximo momento permitido en UTC)."""
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    tz, days = rule_for(country, fallback_tz)
    loc = now.astimezone(tz)
    d = days.get(loc.weekday())
    if d and d[0] <= loc.hour + loc.minute / 60 < d[1]:
        return True, now
    for add in range(0, 9):
        day = (loc + timedelta(days=add)).date()
        w = days.get(day.weekday())
        if not w:
            continue
        start = datetime(day.year, day.month, day.day, w[0], 0, tzinfo=tz)
        if start > loc:
            return False, start.astimezone(timezone.utc)
    return False, now + timedelta(hours=12)


# ---------------- lista de no contactar y consentimiento
def add_dnc(tenant: str, *, email: str | None = None, phones: list[str] | None = None, reason: str = "", source: str = "") -> None:
    rows = [("email", norm_email(email))] if norm_email(email) else []
    rows += [("phone", re.sub(r"\D", "", p)) for p in (phones or []) if re.sub(r"\D", "", p)]
    with db.pool.connection() as c:
        for kind, v in rows:
            c.execute("INSERT INTO dnc (tenant, kind, value, reason, source) VALUES (%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING", (tenant, kind, v, reason[:200], source[:60]))


def is_dnc(tenant: str, *, email: str | None = None, phones: list[str] | None = None) -> bool:
    vals = ([("email", norm_email(email))] if norm_email(email) else []) + [("phone", re.sub(r"\D", "", p)) for p in (phones or []) if re.sub(r"\D", "", p)]
    if not vals:
        return False
    with db.pool.connection() as c:
        for kind, v in vals:
            if c.execute("SELECT 1 FROM dnc WHERE tenant=%s AND kind=%s AND value=%s", (tenant, kind, v)).fetchone():
                return True
    return False


def remove_dnc(tenant: str, kind: str, value: str) -> bool:
    v = norm_email(value) if kind == "email" else re.sub(r"\D", "", value)
    with db.pool.connection() as c:
        return c.execute("DELETE FROM dnc WHERE tenant=%s AND kind=%s AND value=%s", (tenant, kind, v)).rowcount > 0


def list_dnc(tenant: str, limit: int = 500) -> list[dict]:
    with db.pool.connection() as c:
        return [{"kind": r["kind"], "value": r["value"], "reason": r["reason"], "source": r["source"], "at": r["at"].isoformat()}
                for r in c.execute("SELECT * FROM dnc WHERE tenant=%s ORDER BY at DESC LIMIT %s", (tenant, limit)).fetchall()]


def add_consent(tenant: str, *, email: str | None = None, phone: str | None = None, channel: str = "whatsapp", source: str = "") -> None:
    """Deja constancia de que la persona nos dio permiso (escribió ella, aceptó un formulario…)."""
    kind, v = ("phone", re.sub(r"\D", "", phone or "")) if phone else ("email", norm_email(email))
    if not v:
        return
    with db.pool.connection() as c:
        c.execute("INSERT INTO consents (tenant, kind, value, channel, source) VALUES (%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING", (tenant, kind, v, channel, source[:60]))


def has_consent(tenant: str, *, email: str | None = None, phones: list[str] | None = None, channel: str = "whatsapp") -> bool:
    vals = ([("email", norm_email(email))] if norm_email(email) else []) + [("phone", re.sub(r"\D", "", p)) for p in (phones or []) if re.sub(r"\D", "", p)]
    with db.pool.connection() as c:
        return any(c.execute("SELECT 1 FROM consents WHERE tenant=%s AND kind=%s AND value=%s AND channel=%s", (tenant, k, v, channel)).fetchone() for k, v in vals)


# ---------------- detección de bajas en el texto de quien responde
OPTOUT_WORDS = {"baja", "stop", "alto", "cancelar", "no mas", "no mas mensajes", "no quiero mas mensajes", "unsubscribe", "salir", "remover", "borrar", "basta"}
OPTOUT_PHRASES = re.compile(
    r"(no\s+me\s+(escrib|contact|llam|moles|envi|vuelv)\w*|dej\w+\s+de\s+(escrib|contact|molest|enviar)\w*|no\s+(quiero|deseo)\s+(recibir|mas|más)\s+(mas\s+|más\s+)?(mensajes|correos|publicidad|informaci)\w*|"
    r"(dar|darme|denme|d[eé]nme)\s+de\s+baja|bor+(en|ar)\w*\s+(mis\s+)?(datos|numero|número|correo)|elimin\w+\s+(mis\s+)?(datos|numero|número|correo)|quit\w+\s+(mi|de)\s+(numero|número|correo|lista)|"
    r"no\s+vuelv\w+\s+a\s+(escrib|contact)\w*|stop\s+(messag|emailing|texting|contact)\w*|remove\s+me|do\s+not\s+(contact|message)\s+me|don'?t\s+(contact|message|text)\s+me|habeas\s+data|spam)", re.I)


def is_optout_text(text: str) -> bool:
    t = _plain(text).strip(" .!¡¿?")
    if t in OPTOUT_WORDS:
        return True
    return bool(OPTOUT_PHRASES.search(_plain(text)))


# ---------------- enlace de baja de los correos (HMAC, no se puede adivinar ni usar para otra persona)
def _secret() -> bytes:
    return (os.environ.get("HUB_ADMIN_TOKEN") or os.environ.get("LIVEKIT_API_SECRET") or "crmhub").encode()


def unsub_token(tenant: str, lead_id: str) -> str:
    body = f"{tenant}|{lead_id}"
    sig = base64.urlsafe_b64encode(hmac.new(_secret(), ("unsub|" + body).encode(), hashlib.sha256).digest()).rstrip(b"=").decode()[:22]
    return base64.urlsafe_b64encode(body.encode()).rstrip(b"=").decode() + "." + sig


def unsub_parse(token: str) -> tuple[str, str] | None:
    try:
        b, sig = token.split(".", 1)
        body = base64.urlsafe_b64decode(b + "=" * (-len(b) % 4)).decode()
        tenant, lead_id = body.split("|", 1)
        ok = hmac.compare_digest(base64.urlsafe_b64encode(hmac.new(_secret(), ("unsub|" + body).encode(), hashlib.sha256).digest()).rstrip(b"=").decode()[:22], sig)
        return (tenant, lead_id) if ok else None
    except Exception:
        return None


def unsub_url(tenant: str, lead_id: str) -> str:
    return f"https://{os.environ.get('MEET_HOST', '')}/u/{unsub_token(tenant, lead_id)}"


def unsub_footer(company: str, url: str) -> str:
    """Pie de los correos proactivos: quién escribe y cómo darse de baja (un clic)."""
    import html
    return (f"<div style='margin-top:18px;padding-top:10px;border-top:1px solid #e3e7f0;font-size:11.5px;color:#7b8499'>Te escribe <span style='white-space:nowrap'>{html.escape(company).replace(' ', chr(160))}</span>. "
            f"Si no quieres recibir más mensajes nuestros, <a href='{html.escape(url)}' style='color:#7b8499'>date de baja aquí</a> y no volveremos a escribirte.</div>")


# ---------------- cuota diaria de correos por remitente (dominio): protege la reputación del dominio
def mail_quota_take(tenant: str, sender: str, limit: int) -> bool:
    """Cuenta un correo proactivo de hoy para ese remitente; False si ya llegó al tope diario."""
    with db.pool.connection() as c:
        row = c.execute("INSERT INTO mail_quota (tenant, day, sender, n) VALUES (%s, current_date, %s, 1) ON CONFLICT (tenant, day, sender) DO UPDATE SET n = mail_quota.n + 1 "
                        "WHERE mail_quota.n < %s RETURNING n", (tenant, sender.lower(), limit)).fetchone()
    return bool(row)


def cold_unhealthy(tenant: str) -> str:
    """Frenos del correo en frío: devuelve el motivo si hay que parar (rebotes o bajas altos en los últimos 14 días), o '' si todo va bien."""
    try:
        with db.pool.connection() as c:
            sends = c.execute("SELECT count(*) n FROM agent_events WHERE tenant=%s AND kind='send' AND channel='email' AND NOT dry AND at > now() - interval '14 days'", (tenant,)).fetchone()["n"]
            bounces = c.execute("SELECT count(*) n FROM dnc WHERE tenant=%s AND reason ILIKE 'rebote%%' AND at > now() - interval '14 days'", (tenant,)).fetchone()["n"]
            optouts = c.execute("SELECT count(*) n FROM dnc WHERE tenant=%s AND kind='email' AND reason NOT ILIKE 'rebote%%' AND source NOT IN ('csv','import','manual','auto','verificacion') AND at > now() - interval '14 days'", (tenant,)).fetchone()["n"]
    except Exception:
        return ""
    if bounces >= 3 and sends and bounces / sends >= 0.15:
        return f"{bounces} rebotes en {sends} envíos (más del 15 %)"
    if sends >= 10 and bounces / sends >= 0.08:
        return f"{bounces} rebotes en {sends} envíos (más del 8 %)"
    if sends >= 10 and optouts / sends >= 0.05:
        return f"{optouts} bajas en {sends} envíos (más del 5 %)"
    return ""
