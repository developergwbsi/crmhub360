"""Chatbot de WhatsApp de Gestor360 (servicio adicional con cobro). Todo chatbot es de Gestor360 y entra por la cuenta de DigitalAlliance Hub que administra el Centro de control;
la empresa lo configura desde Crm Hub 360. Esta primera fase guarda el estado del servicio y las solicitudes; la conexión de mensajes con Gestor360 viene después.
Estado por empresa: settings.limits.chatbot (servicio contratado) y settings.chatbot (configuración, cuando exista)."""
import logging

from . import db

log = logging.getLogger("hub.chatbot")
SCHEMA = ("CREATE TABLE IF NOT EXISTS service_requests (id SERIAL PRIMARY KEY, tenant TEXT NOT NULL, service TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', requested_by TEXT NOT NULL DEFAULT '', "
          "status TEXT NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT now());\nCREATE INDEX IF NOT EXISTS service_requests_t ON service_requests (tenant, service, created_at DESC);")


def ensure_schema() -> None:
    with db.pool.connection() as c:
        c.execute(SCHEMA)


def provider_ready() -> bool:
    """¿El Centro de control ya tiene cargada la cuenta de DigitalAlliance Hub en Gestor360?"""
    try:
        with db.pool.connection() as c:
            p = c.execute("SELECT value FROM control_settings WHERE key='providers'").fetchone()
        return any(x.get("kind") == "gestor360" for x in (p["value"] if p else []))
    except Exception:
        return False


def state(tenant: dict) -> dict:
    st = tenant.get("settings") or {}
    licensed = bool((st.get("limits") or {}).get("chatbot"))
    with db.pool.connection() as c:
        r = c.execute("SELECT created_at, status FROM service_requests WHERE tenant=%s AND service='chatbot' ORDER BY created_at DESC LIMIT 1", (tenant["slug"],)).fetchone()
    cfg = st.get("chatbot") or {}
    return {"licensed": licensed, "requested_at": r["created_at"].isoformat() if r and r["status"] == "pending" else None, "engine_ready": provider_ready(), "configured": bool(cfg.get("sede_id")), "enabled": bool(cfg.get("enabled"))}


def request(tenant: dict, note: str, by: str) -> dict:
    """La empresa pide el servicio de chatbot: queda registrado (una solicitud pendiente a la vez) para que DigitalAlliance Hub lo active."""
    with db.pool.connection() as c:
        dup = c.execute("SELECT 1 FROM service_requests WHERE tenant=%s AND service='chatbot' AND status='pending'", (tenant["slug"],)).fetchone()
        if not dup:
            c.execute("INSERT INTO service_requests (tenant, service, note, requested_by) VALUES (%s,'chatbot',%s,%s)", (tenant["slug"], note[:500], by[:120]))
    return {"ok": True, "already": bool(dup)}
