"""Libro de consumo: cada mensaje, llamada o correo que sale (o entra) por el Hub queda registrado por empresa, canal, proveedor y línea, con unidades y costo/precio estimados.

Es el cimiento para **controlar y cobrar el consumo** (recarga prepago y postpago): los proveedores compartidos (una cuenta de Twilio o Gupshup para varias empresas) no
separan el consumo por empresa, así que la medición propia es la fuente de verdad y se **concilia** después con lo que facture cada proveedor (el costo real, cuando el proveedor lo
informa, se guarda en `cost_real` mediante su callback de estado).
Tarifas: control_settings «rates» (las edita el Centro de control). Cada evento congela el costo y el precio vigentes al momento del envío.
Registrar nunca debe frenar un envío: record() traga sus propios errores."""
import json
import logging
import time

from . import db

log = logging.getLogger("hub.usage")
SCHEMA = """
CREATE TABLE IF NOT EXISTS usage_events (
    id BIGSERIAL PRIMARY KEY, tenant TEXT NOT NULL, at TIMESTAMPTZ NOT NULL DEFAULT now(), channel TEXT NOT NULL, provider TEXT NOT NULL DEFAULT '', line_id TEXT NOT NULL DEFAULT '',
    direction TEXT NOT NULL DEFAULT 'out', kind TEXT NOT NULL DEFAULT 'text', units NUMERIC(14,3) NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'sent', ext_id TEXT NOT NULL DEFAULT '',
    currency TEXT NOT NULL DEFAULT 'COP', cost NUMERIC(14,4) NOT NULL DEFAULT 0, price NUMERIC(14,4) NOT NULL DEFAULT 0, cost_real NUMERIC(14,6), meta JSONB NOT NULL DEFAULT '{}');
CREATE INDEX IF NOT EXISTS usage_events_tenant_at ON usage_events (tenant, at DESC);
CREATE INDEX IF NOT EXISTS usage_events_ext ON usage_events (ext_id) WHERE ext_id <> '';
"""
_cache: dict = {"at": 0, "rates": {}, "currency": "COP"}


def ensure_schema() -> None:
    """Crea la tabla usage_events si no existe (la lee también el Centro de control)."""
    with db.pool.connection() as c:
        c.execute(SCHEMA)


def rates() -> dict:
    """Tarifas vigentes: {clave: {cost, price}} con clave «canal|proveedor|dirección|tipo» (los campos vacíos valen para todos). Se refresca cada minuto."""
    if time.time() - _cache["at"] > 60:
        try:
            with db.pool.connection() as c:
                r = c.execute("SELECT value FROM control_settings WHERE key = 'rates'").fetchone()
            v = (r["value"] if r else {}) or {}
            _cache["rates"] = {"|".join([i.get("channel", ""), i.get("provider", ""), i.get("direction", ""), i.get("kind", "")]): {"cost": float(i.get("cost") or 0), "price": float(i.get("price") or 0)} for i in v.get("items", [])}
            _cache["currency"] = v.get("currency") or "COP"
        except Exception:
            log.warning("no se pudieron leer las tarifas")
        _cache["at"] = time.time()
    return _cache


def price_of(channel: str, provider: str, direction: str, kind: str) -> tuple[float, float, str]:
    """(costo, precio, moneda) por unidad: la tarifa más específica que coincida (con tipo, sin tipo, sin proveedor, general)."""
    r = rates()
    for key in (f"{channel}|{provider}|{direction}|{kind}", f"{channel}|{provider}|{direction}|", f"{channel}||{direction}|{kind}", f"{channel}||{direction}|", f"{channel}|||"):
        if key in r["rates"]:
            return r["rates"][key]["cost"], r["rates"][key]["price"], r["currency"]
    return 0.0, 0.0, r["currency"]


def record(tenant: dict | str, channel: str, provider: str = "", *, units: float = 1, direction: str = "out", kind: str = "text", ext_id: str = "", line_id: str = "", status: str = "sent", meta: dict | None = None) -> None:
    """Anota un consumo. `tenant` es el dict del tenant (o su slug). Nunca lanza excepciones."""
    try:
        slug = tenant if isinstance(tenant, str) else tenant["slug"]
        if not line_id and isinstance(tenant, dict):
            line_id = (tenant.get("_line") or {}).get("id") or ""
        cost, price, cur = price_of(channel, provider, direction, kind)
        with db.pool.connection() as c:
            c.execute("INSERT INTO usage_events (tenant, channel, provider, line_id, direction, kind, units, status, ext_id, currency, cost, price, meta) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                      (slug, channel, provider, line_id, direction, kind, units, status, ext_id or "", cur, round(cost * units, 4), round(price * units, 4), json.dumps(meta or {})))
    except Exception:
        log.warning("no se pudo registrar el consumo", exc_info=True)


def set_real_cost(ext_id: str, cost_real: float) -> None:
    """Guarda el costo real informado por el proveedor para un mensaje (conciliación)."""
    try:
        with db.pool.connection() as c:
            c.execute("UPDATE usage_events SET cost_real = %s WHERE ext_id = %s", (cost_real, ext_id))
    except Exception:
        log.warning("no se pudo guardar el costo real", exc_info=True)
