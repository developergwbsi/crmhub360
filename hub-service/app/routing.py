"""Enrutamiento de WhatsApp sobre una línea compartida: quién escribió a cada cliente (para que la respuesta le llegue a esa persona), qué número usó
el cliente y los identificadores LID de WhatsApp (contactos que no revelan su número) ligados a su lead."""
import time

from . import db

SCHEMA = """
CREATE TABLE IF NOT EXISTS wa_routes (
    tenant TEXT NOT NULL, lead_id TEXT NOT NULL, user_id TEXT, last_out_phone TEXT, last_in_phone TEXT, out_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant, lead_id));
CREATE TABLE IF NOT EXISTS wa_lids (tenant TEXT NOT NULL, lid TEXT NOT NULL, lead_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (tenant, lid));
"""


def ensure_schema() -> None:
    with db.pool.connection() as c:
        c.execute(SCHEMA)


def note_out(tenant: str, lead_id: str, user_id: str | None, phone: str | None) -> None:
    with db.pool.connection() as c:
        c.execute("INSERT INTO wa_routes (tenant, lead_id, user_id, last_out_phone, out_at) VALUES (%s,%s,%s,%s,now()) ON CONFLICT (tenant, lead_id) DO UPDATE SET "
                  "user_id = COALESCE(EXCLUDED.user_id, wa_routes.user_id), last_out_phone = COALESCE(EXCLUDED.last_out_phone, wa_routes.last_out_phone), out_at = now(), updated_at = now()",
                  (tenant, lead_id, user_id, phone))


def note_in(tenant: str, lead_id: str, phone: str | None) -> None:
    with db.pool.connection() as c:
        c.execute("INSERT INTO wa_routes (tenant, lead_id, last_in_phone) VALUES (%s,%s,%s) ON CONFLICT (tenant, lead_id) DO UPDATE SET "
                  "last_in_phone = COALESCE(EXCLUDED.last_in_phone, wa_routes.last_in_phone), updated_at = now()", (tenant, lead_id, phone))


def route_of(tenant: str, lead_id: str) -> dict | None:
    with db.pool.connection() as c:
        r = c.execute("SELECT user_id, last_out_phone, last_in_phone, out_at FROM wa_routes WHERE tenant=%s AND lead_id=%s", (tenant, lead_id)).fetchone()
    return dict(r) if r else None


def recent_out(tenant: str, minutes: int = 45) -> list[str]:
    with db.pool.connection() as c:
        rows = c.execute("SELECT lead_id FROM wa_routes WHERE tenant=%s AND out_at > now() - make_interval(mins => %s) ORDER BY out_at DESC", (tenant, minutes)).fetchall()
    return [r["lead_id"] for r in rows]


def lid_get(tenant: str, lid: str) -> str | None:
    with db.pool.connection() as c:
        r = c.execute("SELECT lead_id FROM wa_lids WHERE tenant=%s AND lid=%s", (tenant, lid)).fetchone()
    return r["lead_id"] if r else None


def lid_set(tenant: str, lid: str, lead_id: str) -> None:
    with db.pool.connection() as c:
        c.execute("INSERT INTO wa_lids (tenant, lid, lead_id) VALUES (%s,%s,%s) ON CONFLICT (tenant, lid) DO UPDATE SET lead_id=EXCLUDED.lead_id", (tenant, lid, lead_id))
