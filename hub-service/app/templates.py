"""Plantillas personales de cada usuario (correo, WhatsApp, Telegram y SMS): privadas, hasta MAX por canal."""
from . import db

MAX = 10   # incluidas en la licencia; la empresa puede tener más como servicio adicional (settings.limits.templates, lo asigna el Centro de control)
CHANNELS = ("email", "whatsapp", "telegram", "sms")
SCHEMA = """
CREATE TABLE IF NOT EXISTS user_templates (
    id SERIAL PRIMARY KEY, tenant TEXT NOT NULL, user_id TEXT NOT NULL, channel TEXT NOT NULL, name TEXT NOT NULL, subject TEXT NOT NULL DEFAULT '', body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS user_templates_owner ON user_templates (tenant, user_id, channel);
"""


def ensure_schema() -> None:
    with db.pool.connection() as c:
        c.execute(SCHEMA)


def limit_of(tenant: dict) -> int:
    try:
        return max(MAX, int(((tenant.get("settings") or {}).get("limits") or {}).get("templates") or MAX))
    except (TypeError, ValueError):
        return MAX


def list_for(tenant: str, user_id: str, limit: int = MAX) -> dict:
    with db.pool.connection() as c:
        rows = c.execute("SELECT id, channel, name, subject, body, updated_at FROM user_templates WHERE tenant=%s AND user_id=%s ORDER BY channel, lower(name)", (tenant, user_id)).fetchall()
    return {"items": [dict(r) for r in rows], "max": limit}


def save(tenant: str, user_id: str, p: dict, limit: int = MAX) -> dict:
    ch, name, body, subject = p.get("channel"), (p.get("name") or "").strip(), (p.get("body") or "").strip(), (p.get("subject") or "").strip()
    if ch not in CHANNELS:
        raise ValueError("Canal inválido.")
    if not (2 <= len(name) <= 80):
        raise ValueError("El nombre debe tener entre 2 y 80 caracteres.")
    if not body:
        raise ValueError("Escribe el contenido de la plantilla.")
    if len(body) > (20000 if ch == "email" else 4000):
        raise ValueError("El contenido es demasiado largo.")
    if ch == "email" and not subject:
        raise ValueError("Escribe el asunto del correo.")
    with db.pool.connection() as c:
        tid = p.get("id")
        if tid:
            r = c.execute("UPDATE user_templates SET name=%s, subject=%s, body=%s, updated_at=now() WHERE id=%s AND tenant=%s AND user_id=%s AND channel=%s RETURNING id",
                          (name, subject[:250], body, int(tid), tenant, user_id, ch)).fetchone()
            if not r:
                raise LookupError("Plantilla no encontrada.")
            return {"id": r["id"]}
        n = c.execute("SELECT count(*) n FROM user_templates WHERE tenant=%s AND user_id=%s AND channel=%s", (tenant, user_id, ch)).fetchone()["n"]
        if n >= limit:
            raise PermissionError(f"Ya tienes {limit} plantillas de este canal (el máximo de tu licencia). Elimina una o pide a tu administrador ampliar el límite (servicio adicional).")
        r = c.execute("INSERT INTO user_templates (tenant, user_id, channel, name, subject, body) VALUES (%s,%s,%s,%s,%s,%s) RETURNING id", (tenant, user_id, ch, name, subject[:250], body)).fetchone()
        return {"id": r["id"]}


def delete(tenant: str, user_id: str, tid: int) -> bool:
    with db.pool.connection() as c:
        return bool(c.execute("DELETE FROM user_templates WHERE id=%s AND tenant=%s AND user_id=%s RETURNING id", (tid, tenant, user_id)).fetchone())
