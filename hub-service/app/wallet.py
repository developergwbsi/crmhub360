"""Billetera prepago en créditos: DigitalAlliance Hub es el proveedor de todo y cada empresa compra créditos con los que paga lo que usa de la plataforma
(IA del agente, búsqueda de prospectos, correo, SMS, WhatsApp y llamadas). Lo que corre con proveedores propios de la empresa no descuenta.
Tablas (base maestra, las lee y las ajusta también el Centro de control): `wallet` (saldo), `wallet_ledger` (movimientos, solo se agregan) y `wallet_orders` (pagos con Wompi).
Tarifas en créditos y paquetes: control_settings «credits». Ajustes por empresa: settings.wallet = {grant, billed[], exempt, last_grant}.
Cobrar nunca debe romper un envío ya hecho (charge no lanza); lo que bloquea es require(), antes de usar un servicio de la plataforma."""
import hashlib
import hmac
import json
import logging
import os
import time
import uuid
from datetime import datetime, timezone

from . import db

log = logging.getLogger("hub.wallet")
SCHEMA = """
CREATE TABLE IF NOT EXISTS wallet (tenant TEXT PRIMARY KEY, balance NUMERIC(16,3) NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), low_alert_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS wallet_ledger (
    id BIGSERIAL PRIMARY KEY, tenant TEXT NOT NULL, at TIMESTAMPTZ NOT NULL DEFAULT now(), kind TEXT NOT NULL, credits NUMERIC(16,3) NOT NULL, balance_after NUMERIC(16,3) NOT NULL,
    service TEXT NOT NULL DEFAULT '', ref TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', meta JSONB NOT NULL DEFAULT '{}');
CREATE INDEX IF NOT EXISTS wallet_ledger_tenant ON wallet_ledger (tenant, at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_ref ON wallet_ledger (tenant, kind, ref) WHERE ref <> '';
CREATE TABLE IF NOT EXISTS wallet_orders (
    ref TEXT PRIMARY KEY, tenant TEXT NOT NULL, credits NUMERIC(16,3) NOT NULL, amount_cents BIGINT NOT NULL, currency TEXT NOT NULL DEFAULT 'COP', status TEXT NOT NULL DEFAULT 'pending',
    wompi_id TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), paid_at TIMESTAMPTZ);
"""
SERVICES = {"ai_in": "IA: por cada 1.000 tokens leídos", "ai_out": "IA: por cada 1.000 tokens escritos", "search": "Búsqueda web (cada consulta)", "email": "Correo (por destinatario)",
            "sms": "SMS (por segmento)", "whatsapp": "WhatsApp (por mensaje)", "voice": "Llamada (por minuto)"}
CHANNELS = ("email", "sms", "whatsapp", "voice")
# valores de ejemplo hasta que el Centro de control fije los definitivos
DEFAULT_CFG = {"price_cop": 50, "min_topup": 1000, "low": 200, "packs": [{"credits": 1000, "price": 50000}, {"credits": 5000, "price": 225000}, {"credits": 20000, "price": 800000}],
               "costs": {"ai_in": 0.3, "ai_out": 1.5, "search": 2, "email": 0.2, "sms": 3, "whatsapp": 1, "voice": 5},
               "wompi": {"env": "sandbox", "public_key": "", "integrity_secret": "", "events_secret": ""}}
_cache: dict = {"at": 0, "cfg": DEFAULT_CFG}


class NoBalance(Exception):
    """Sin créditos para usar un servicio de la plataforma."""


MSG = "Tu empresa no tiene créditos para este servicio. Recarga en Integraciones → Saldo y recargas, o conecta tu propio proveedor."


def ensure_schema() -> None:
    with db.pool.connection() as c:
        c.execute(SCHEMA)


def cfg() -> dict:
    if time.time() - _cache["at"] > 30:
        try:
            with db.pool.connection() as c:
                r = c.execute("SELECT value FROM control_settings WHERE key='credits'").fetchone()
            v = (r["value"] if r else {}) or {}
            _cache["cfg"] = {**DEFAULT_CFG, **v, "costs": {**DEFAULT_CFG["costs"], **(v.get("costs") or {})}, "wompi": {**DEFAULT_CFG["wompi"], **(v.get("wompi") or {})}}
        except Exception:
            pass
        _cache["at"] = time.time()
    return _cache["cfg"]


def settings_of(tenant: dict) -> dict:
    w = ((tenant.get("settings") or {}).get("wallet") or {})
    return {"grant": float(w.get("grant") or 0), "billed": [x for x in (w.get("billed") or []) if x in CHANNELS], "exempt": bool(w.get("exempt")), "last_grant": w.get("last_grant") or ""}


def exempt(tenant: dict) -> bool:
    """Empresas de uso interno (las nuestras): no se cobran ni se bloquean."""
    return settings_of(tenant)["exempt"]


def billed(tenant: dict, service: str) -> bool:
    """¿Este servicio se paga con créditos? IA y búsqueda, siempre que no corran con el proveedor propio de la empresa (lo decide quien llama); mensajería, solo los canales marcados para esa empresa."""
    if exempt(tenant):
        return False
    return True if service in ("ai", "search") else service in settings_of(tenant)["billed"]


def _month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def balance(slug: str) -> float:
    with db.pool.connection() as c:
        r = c.execute("SELECT balance FROM wallet WHERE tenant=%s", (slug,)).fetchone()
    return float(r["balance"]) if r else 0.0


def _post(c, slug: str, kind: str, credits: float, service: str = "", ref: str = "", note: str = "", meta: dict | None = None) -> float | None:
    """Mueve el saldo y deja el rastro, en una sola transacción. Con `ref` repetido (mismo tipo) no hace nada: así un pago no se acredita dos veces."""
    if ref and c.execute("SELECT 1 FROM wallet_ledger WHERE tenant=%s AND kind=%s AND ref=%s", (slug, kind, ref)).fetchone():
        return None
    c.execute("INSERT INTO wallet (tenant) VALUES (%s) ON CONFLICT DO NOTHING", (slug,))
    r = c.execute("UPDATE wallet SET balance = balance + %s, updated_at = now() WHERE tenant=%s RETURNING balance", (credits, slug)).fetchone()
    c.execute("INSERT INTO wallet_ledger (tenant, kind, credits, balance_after, service, ref, note, meta) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)", (slug, kind, credits, r["balance"], service, ref, note[:200], json.dumps(meta or {})))
    return float(r["balance"])


def topup(slug: str, credits: float, ref: str = "", note: str = "", kind: str = "topup") -> float | None:
    with db.pool.connection() as c:
        return _post(c, slug, kind, round(credits, 3), ref=ref, note=note)


def grant_if_due(tenant: dict) -> None:
    """Obsequio mensual de créditos: se acredita una vez por mes, la primera vez que la empresa usa la plataforma ese mes."""
    s = settings_of(tenant)
    if s["grant"] <= 0 or s["last_grant"] == _month() or s["exempt"]:
        return
    try:
        with db.pool.connection() as c:
            c.execute("UPDATE tenants SET settings = jsonb_set(COALESCE(settings,'{}'::jsonb), '{wallet}', COALESCE(settings->'wallet','{}'::jsonb) || %s::jsonb, true) WHERE slug=%s", (json.dumps({"last_grant": _month()}), tenant["slug"]))
            _post(c, tenant["slug"], "grant", s["grant"], ref=_month(), note="Obsequio mensual de créditos")
        tenant.setdefault("settings", {}).setdefault("wallet", {})["last_grant"] = _month()
    except Exception:
        log.warning("obsequio mensual", exc_info=True)


def cost_of(service: str, units: float = 1) -> float:
    return round(float(cfg()["costs"].get(service, 0)) * units, 3)


def charge(tenant: dict | str, service: str, units: float = 1, *, note: str = "", meta: dict | None = None) -> None:
    """Descuenta los créditos de un consumo ya hecho. Nunca lanza (no se debe romper un envío por cobrar)."""
    try:
        t = tenant if isinstance(tenant, dict) else db.get_tenant(tenant)
        if not t or exempt(t) or (service in CHANNELS and service not in settings_of(t)["billed"]):
            return
        cr = cost_of(service, units)
        if cr <= 0:
            return
        with db.pool.connection() as c:
            _post(c, t["slug"], "usage", -cr, service=service, note=note, meta={"units": units, **(meta or {})})
    except Exception:
        log.warning("no se pudo cobrar %s", service, exc_info=True)


def charge_tokens(tenant: dict | str, tin: int, tout: int, model: str = "") -> None:
    cr = cost_of("ai_in", tin / 1000) + cost_of("ai_out", tout / 1000)
    if cr > 0:
        charge_raw(tenant, "ai", cr, meta={"tin": tin, "tout": tout, "model": model})


def charge_raw(tenant: dict | str, service: str, credits: float, *, note: str = "", meta: dict | None = None) -> None:
    try:
        t = tenant if isinstance(tenant, dict) else db.get_tenant(tenant)
        if not t or exempt(t) or credits <= 0:
            return
        with db.pool.connection() as c:
            _post(c, t["slug"], "usage", -round(credits, 3), service=service, note=note, meta=meta)
    except Exception:
        log.warning("no se pudo cobrar %s", service, exc_info=True)


def require(tenant: dict, service: str) -> None:
    """Antes de usar un servicio de la plataforma: si la empresa paga con créditos y no le quedan, lanza NoBalance."""
    if not billed(tenant, service):
        return
    grant_if_due(tenant)
    if balance(tenant["slug"]) <= 0:
        raise NoBalance(MSG)


def has_funds(tenant: dict) -> bool:
    """Para los procesos automáticos (ciclo diario, comercial virtual): ¿puede la empresa usar la IA de la plataforma?"""
    if exempt(tenant) or (own_ai(tenant) and own_search(tenant)):
        return True
    grant_if_due(tenant)
    return balance(tenant["slug"]) > 0


def own_ai(tenant: dict | None) -> bool:
    ai = ((tenant or {}).get("settings") or {}).get("ai") or {}
    return (ai.get("mode") or "") == "own" and bool((ai.get("own") or {}).get("kind"))


def own_search(tenant: dict | None) -> bool:
    s = ((tenant or {}).get("settings") or {}).get("search") or {}
    return (s.get("mode") or "") == "own" and bool((s.get("own") or {}).get("engine"))


def public(tenant: dict) -> dict:
    """Lo que ve la empresa: saldo, obsequio, paquetes, lo que cuesta cada cosa y los últimos movimientos."""
    grant_if_due(tenant)
    s, c = settings_of(tenant), cfg()
    with db.pool.connection() as cn:
        led = cn.execute("SELECT at, kind, credits, balance_after, service, note FROM wallet_ledger WHERE tenant=%s ORDER BY at DESC, id DESC LIMIT 60", (tenant["slug"],)).fetchall()
    return {"balance": balance(tenant["slug"]), "exempt": s["exempt"], "grant": s["grant"], "billed": s["billed"], "price_cop": c["price_cop"], "min_topup": c["min_topup"], "low": c["low"], "packs": c["packs"],
            "costs": {k: {"label": v, "credits": c["costs"].get(k, 0)} for k, v in SERVICES.items()}, "wompi": bool(c["wompi"].get("public_key") and c["wompi"].get("integrity_secret")), "sandbox": c["wompi"].get("env") != "prod",
            "ledger": [{**dict(r), "at": r["at"].isoformat(), "credits": float(r["credits"]), "balance_after": float(r["balance_after"])} for r in led],
            "own": {"ai": own_ai(tenant), "search": own_search(tenant)}}


# ---------------- Wompi
def checkout_url(tenant: dict, credits: float, redirect: str) -> str:
    """Enlace de pago de Wompi para comprar `credits`. La referencia queda en wallet_orders y el pago se acredita solo con el evento firmado."""
    c = cfg(); w = c["wompi"]
    if not (w.get("public_key") and w.get("integrity_secret")):
        raise ValueError("Los pagos en línea aún no están activos. Pídele a tu proveedor que te acredite la recarga.")
    credits = float(credits)
    if credits < c["min_topup"]:
        raise ValueError(f"La recarga mínima es de {c['min_topup']:g} créditos.")
    pack = next((p for p in c["packs"] if float(p["credits"]) == credits), None)
    amount = int(round(float(pack["price"]) * 100)) if pack else int(round(credits * float(c["price_cop"]) * 100))
    ref = f"RC-{tenant['slug']}-{uuid.uuid4().hex[:10]}"
    with db.pool.connection() as cn:
        cn.execute("INSERT INTO wallet_orders (ref, tenant, credits, amount_cents) VALUES (%s,%s,%s,%s)", (ref, tenant["slug"], credits, amount))
    sig = hashlib.sha256(f"{ref}{amount}COP{w['integrity_secret']}".encode()).hexdigest()
    from urllib.parse import urlencode
    q = urlencode({"public-key": w["public_key"], "currency": "COP", "amount-in-cents": amount, "reference": ref, "signature:integrity": sig, "redirect-url": redirect})
    return "https://checkout.wompi.co/p/?" + q


def _dig(d: dict, path: str):
    for k in path.split("."):
        d = (d or {}).get(k) if isinstance(d, dict) else None
    return d


def handle_event(body: dict) -> dict:
    """Evento de Wompi (transaction.updated): se verifica la firma con el secreto de eventos y, si la transacción fue aprobada, se acreditan los créditos (una sola vez)."""
    w = cfg()["wompi"]
    sg = body.get("signature") or {}
    data = body.get("data") or {}
    base = "".join(str(_dig(data, p) if _dig(data, p) is not None else "") for p in (sg.get("properties") or [])) + str(body.get("timestamp") or "") + (w.get("events_secret") or "")
    if not w.get("events_secret") or not hmac.compare_digest(hashlib.sha256(base.encode()).hexdigest(), str(sg.get("checksum") or "")):
        raise PermissionError("firma inválida")
    tx = data.get("transaction") or {}
    ref = str(tx.get("reference") or "")
    if body.get("event") != "transaction.updated" or not ref.startswith("RC-"):
        return {"ignored": True}
    with db.pool.connection() as c:
        o = c.execute("SELECT * FROM wallet_orders WHERE ref=%s", (ref,)).fetchone()
        if not o:
            return {"ignored": True}
        if str(tx.get("status")) == "APPROVED" and int(tx.get("amount_in_cents") or 0) == int(o["amount_cents"]):
            c.execute("UPDATE wallet_orders SET status='paid', wompi_id=%s, paid_at=now() WHERE ref=%s AND status<>'paid'", (str(tx.get("id") or ""), ref))
            nb = _post(c, o["tenant"], "topup", float(o["credits"]), ref=ref, note=f"Recarga con Wompi ({tx.get('payment_method_type', '')})", meta={"wompi_id": tx.get("id")})
            return {"credited": nb is not None}
        if str(tx.get("status")) in ("DECLINED", "ERROR", "VOIDED"):
            c.execute("UPDATE wallet_orders SET status=%s WHERE ref=%s AND status='pending'", (str(tx.get("status")).lower(), ref))
    return {"status": tx.get("status")}
