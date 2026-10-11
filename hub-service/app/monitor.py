"""Monitor de conexión de Evolution (lado del Hub): reconoce las respuestas automáticas de la línea de pruebas del Centro de control y expone el estado de la línea.

El Centro (control-service/app/evomon.py) envía periódicamente «[crmhub-ping:<id>]» desde cada línea de Evolution a una línea de pruebas, que contesta «[crmhub-pong:<id>]».
Cuando el pong llega al webhook de la empresa, consume() lo marca en la tabla evo_probes (compartida con el Centro) y devuelve True: el mensaje no se registra como conversación ni crea un lead.
health() devuelve el último estado de la línea para mostrarlo en su tarjeta (Integraciones → Mensajería)."""
import re

from . import db

PONG = re.compile(r"^\s*\[crmhub-pong:([0-9a-f]{8})\]")
PING = re.compile(r"^\s*\[crmhub-ping:([0-9a-f]{8})\]")
SCHEMA = """
CREATE TABLE IF NOT EXISTS evo_probes (
    id TEXT PRIMARY KEY, tenant TEXT NOT NULL, line_id TEXT NOT NULL DEFAULT '', instance TEXT NOT NULL, sent_at TIMESTAMPTZ NOT NULL DEFAULT now(), send_ok BOOLEAN,
    send_error TEXT NOT NULL DEFAULT '', ping_at TIMESTAMPTZ, pong_at TIMESTAMPTZ, status TEXT NOT NULL DEFAULT 'pending', kind TEXT NOT NULL DEFAULT '', rtt_ms INT);
CREATE TABLE IF NOT EXISTS evo_health (
    tenant TEXT NOT NULL, instance TEXT NOT NULL, line_id TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT 'unknown', conn_state TEXT NOT NULL DEFAULT '', last_ok_at TIMESTAMPTZ,
    last_probe_at TIMESTAMPTZ, fails_in_row INT NOT NULL DEFAULT 0, last_error TEXT NOT NULL DEFAULT '', last_rtt_ms INT, restarts INT NOT NULL DEFAULT 0, incident_at TIMESTAMPTZ,
    last_alert_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (tenant, instance));
ALTER TABLE evo_health ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'evolution';
ALTER TABLE evo_health ADD COLUMN IF NOT EXISTS metrics JSONB NOT NULL DEFAULT '{}';
"""


def ensure_schema() -> None:
    """Crea las tablas del monitor (las comparte con el Centro de control) si no existen."""
    with db.pool.connection() as c:
        c.execute(SCHEMA)


def consume(slug: str, text: str) -> bool:
    """True si el texto es un ping/pong del monitor (no es una conversación): un pong marca la prueba como recibida."""
    m = PONG.match(text or "")
    if m:
        with db.pool.connection() as c:
            c.execute("UPDATE evo_probes SET pong_at = now() WHERE id = %s AND tenant = %s AND pong_at IS NULL", (m.group(1), slug))
        return True
    return bool(PING.match(text or ""))


def line_key(card: dict) -> str:
    """Identificador estable de una línea para el monitor: la instancia (Evolution) o «proveedor:canal:identidad» (Meta, Gupshup, Twilio). Debe coincidir con control-service/app/evomon.py."""
    t, f, ch = card.get("type"), card.get("fields") or {}, card.get("channel")
    if t == "evolution":
        return f.get("evolution_instance") or ""
    ident = {"meta": f.get("meta_phone_number_id"), "gupshup": f.get("gupshup_app_name"), "twilio": f.get("twilio_account_sid")}.get(t)
    return f"{t}:{ch}:{ident}" if ident else ""


def health(slug: str, instance: str) -> dict | None:
    """Estado de monitoreo de una línea: {state, lastOkAt, lastProbeAt, failsInRow, error, provider, metrics} o None si aún no se ha medido."""
    if not instance:
        return None
    with db.pool.connection() as c:
        r = c.execute("SELECT state, last_ok_at, last_probe_at, fails_in_row, last_error, provider, metrics FROM evo_health WHERE tenant = %s AND instance = %s", (slug, instance)).fetchone()
    if not r:
        return None
    return {"state": r["state"], "lastOkAt": r["last_ok_at"].isoformat() if r["last_ok_at"] else None, "lastProbeAt": r["last_probe_at"].isoformat() if r["last_probe_at"] else None,
            "failsInRow": r["fails_in_row"], "error": r["last_error"], "provider": r["provider"], "metrics": r["metrics"] or {}}
