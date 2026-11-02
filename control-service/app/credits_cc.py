"""Créditos y recargas en el Centro de control: DigitalAlliance Hub vende a cada empresa créditos prepagados con los que paga lo que usa de la plataforma
(IA, búsqueda, correo, SMS, WhatsApp y llamadas). Aquí se fijan el precio del crédito, los paquetes, lo que cuesta cada cosa y las llaves de Wompi (control_settings «credits»),
y se ve y ajusta el saldo de cada empresa (tablas wallet y wallet_ledger del Hub). Los ajustes manuales y los cambios de llaves quedan en la auditoría.
Se inicializa con init() desde main.py."""
import json
import os

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

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
CHANNELS = {"email": "Correo", "sms": "SMS", "whatsapp": "WhatsApp", "voice": "Llamadas"}
DEFAULT = {"price_cop": 50, "min_topup": 1000, "low": 200, "packs": [{"credits": 1000, "price": 50000}, {"credits": 5000, "price": 225000}, {"credits": 20000, "price": 800000}],
           "costs": {"ai_in": 0.3, "ai_out": 1.5, "search": 2, "email": 0.2, "sms": 3, "whatsapp": 1, "voice": 5}, "wompi": {"env": "sandbox", "public_key": "", "integrity_secret": "", "events_secret": ""}}
ns = None


class CfgReq(BaseModel):
    price_cop: float
    min_topup: float
    packs: list[dict]
    costs: dict
    wompi: dict = {}


class TenantReq(BaseModel):
    grant: float = 0
    billed: list[str] = []
    exempt: bool = False


class AdjustReq(BaseModel):
    credits: float
    note: str = ""


def _cfg() -> dict:
    v = ns.get_setting("credits", {}) or {}
    return {**DEFAULT, **v, "costs": {**DEFAULT["costs"], **(v.get("costs") or {})}, "wompi": {**DEFAULT["wompi"], **(v.get("wompi") or {})}}


def init(deps) -> None:
    global ns
    ns = deps
    with ns.db() as c:
        c.execute(SCHEMA)
    r = APIRouter()
    me = ns.me

    @r.get("/api/credits")
    def get_credits(actor: str = Depends(me)):
        """Configuración de créditos (sin mostrar los secretos de Wompi) y el saldo de cada empresa."""
        c, w = _cfg(), _cfg()["wompi"]
        with ns.db() as cn:
            ts = cn.execute("SELECT slug, name, kind, status, settings FROM tenants ORDER BY CASE kind WHEN 'dev' THEN 0 WHEN 'prod' THEN 1 ELSE 2 END, created_at").fetchall()
            bal = {x["tenant"]: float(x["balance"]) for x in cn.execute("SELECT tenant, balance FROM wallet").fetchall()}
            used = {x["tenant"]: float(x["u"]) for x in cn.execute("SELECT tenant, -sum(credits) u FROM wallet_ledger WHERE kind='usage' AND at >= date_trunc('month', now()) GROUP BY tenant").fetchall()}
        items = []
        for t in ts:
            wl = ((t["settings"] or {}).get("wallet") or {})
            items.append({"slug": t["slug"], "name": t["name"], "kind": t["kind"], "status": t["status"], "balance": bal.get(t["slug"], 0.0), "used_month": used.get(t["slug"], 0.0),
                          "grant": float(wl.get("grant") or 0), "billed": [x for x in (wl.get("billed") or []) if x in CHANNELS], "exempt": bool(wl.get("exempt"))})
        return {"config": {**c, "wompi": {"env": w.get("env") or "sandbox", "public_key": w.get("public_key") or "", "has_integrity": bool(w.get("integrity_secret")), "has_events": bool(w.get("events_secret"))}},
                "services": SERVICES, "channels": CHANNELS, "items": items, "webhook": f"https://{os.environ.get('CRM_HOST', 'crm.digitalalliancehub.site')}/hub/wompi"}

    @r.put("/api/credits/config")
    def put_config(req: CfgReq, actor: str = Depends(me)):
        if req.price_cop <= 0 or req.min_topup <= 0:
            raise HTTPException(400, "El precio del crédito y la recarga mínima deben ser mayores que cero.")
        packs = [{"credits": float(p.get("credits") or 0), "price": float(p.get("price") or 0)} for p in req.packs[:8] if float(p.get("credits") or 0) > 0 and float(p.get("price") or 0) > 0]
        costs = {k: max(0.0, float(req.costs.get(k) or 0)) for k in SERVICES}
        old = _cfg()["wompi"]
        w = {"env": "prod" if req.wompi.get("env") == "prod" else "sandbox", "public_key": str(req.wompi.get("public_key") or "").strip()[:120],
             "integrity_secret": str(req.wompi.get("integrity_secret") or "").strip()[:200] or old.get("integrity_secret", ""), "events_secret": str(req.wompi.get("events_secret") or "").strip()[:200] or old.get("events_secret", "")}
        ns.put_setting("credits", {"price_cop": req.price_cop, "min_topup": req.min_topup, "packs": packs, "costs": costs, "wompi": w})
        ns.audit(actor, "credits.config", "", {"price_cop": req.price_cop, "packs": len(packs), "wompi_env": w["env"], "wompi_keys": bool(w["public_key"] and w["integrity_secret"])})
        return {"ok": True}

    @r.put("/api/credits/{slug}/settings")
    def put_tenant(slug: str, req: TenantReq, actor: str = Depends(me)):
        ns.get_tenant(slug)
        w = {"grant": max(0.0, min(1e7, req.grant)), "billed": [x for x in req.billed if x in CHANNELS], "exempt": bool(req.exempt)}
        with ns.db() as c:
            c.execute("UPDATE tenants SET settings = jsonb_set(COALESCE(settings,'{}'::jsonb), '{wallet}', COALESCE(settings->'wallet','{}'::jsonb) || %s::jsonb, true) WHERE slug=%s", (json.dumps(w), slug))
        ns.audit(actor, "credits.tenant", slug, w)
        return {"ok": True}

    @r.post("/api/credits/{slug}/adjust")
    def adjust(slug: str, req: AdjustReq, actor: str = Depends(me)):
        """Acredita (o descuenta) créditos a mano: una recarga cobrada por otro medio, una cortesía o una corrección. Queda en el libro y en la auditoría."""
        ns.get_tenant(slug)
        if not req.credits or abs(req.credits) > 1e7:
            raise HTTPException(400, "Indica una cantidad de créditos distinta de cero.")
        if not req.note.strip():
            raise HTTPException(400, "Escribe el motivo del ajuste.")
        kind = "topup" if req.credits > 0 else "adjust"
        with ns.db() as c:
            c.execute("INSERT INTO wallet (tenant) VALUES (%s) ON CONFLICT DO NOTHING", (slug,))
            b = c.execute("UPDATE wallet SET balance = balance + %s, updated_at = now() WHERE tenant=%s RETURNING balance", (req.credits, slug)).fetchone()
            c.execute("INSERT INTO wallet_ledger (tenant, kind, credits, balance_after, note, meta) VALUES (%s,%s,%s,%s,%s,%s)", (slug, kind, req.credits, b["balance"], f"{req.note.strip()[:160]} (por {actor})", json.dumps({"by": actor})))
        ns.audit(actor, "credits.adjust", slug, {"credits": req.credits, "note": req.note[:160]})
        return {"balance": float(b["balance"])}

    @r.get("/api/credits/{slug}/ledger")
    def ledger(slug: str, actor: str = Depends(me)):
        with ns.db() as c:
            rows = c.execute("SELECT at, kind, credits, balance_after, service, note FROM wallet_ledger WHERE tenant=%s ORDER BY at DESC, id DESC LIMIT 100", (slug,)).fetchall()
            ords = c.execute("SELECT ref, credits, amount_cents, status, created_at FROM wallet_orders WHERE tenant=%s ORDER BY created_at DESC LIMIT 20", (slug,)).fetchall()
        return {"items": [{**dict(x), "at": x["at"].isoformat(), "credits": float(x["credits"]), "balance_after": float(x["balance_after"])} for x in rows],
                "orders": [{**dict(x), "credits": float(x["credits"]), "created_at": x["created_at"].isoformat()} for x in ords]}

    ns.app.include_router(r)
