"""Consumo y tarifas en el Centro de control: lee el libro de consumo del Hub (tabla usage_events) y lo resume por empresa, canal y proveedor.

Muestra el consumo medido (mensajes, segmentos de SMS, minutos de llamada, correos), el costo estimado (lo que nos cuesta, según las tarifas) y el precio (lo que se cobra a la empresa),
con el margen. Las tarifas se editan aquí (control_settings «rates») y el Hub las congela en cada evento al registrarlo.
Es el cimiento de la recarga prepago y del postpago: la medición propia es la fuente de verdad y se concilia con la factura de cada proveedor.
Se inicializa con init() desde main.py (que le pasa sus utilidades)."""
import csv
import io
import re
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel

SCHEMA = """
CREATE TABLE IF NOT EXISTS usage_events (
    id BIGSERIAL PRIMARY KEY, tenant TEXT NOT NULL, at TIMESTAMPTZ NOT NULL DEFAULT now(), channel TEXT NOT NULL, provider TEXT NOT NULL DEFAULT '', line_id TEXT NOT NULL DEFAULT '',
    direction TEXT NOT NULL DEFAULT 'out', kind TEXT NOT NULL DEFAULT 'text', units NUMERIC(14,3) NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'sent', ext_id TEXT NOT NULL DEFAULT '',
    currency TEXT NOT NULL DEFAULT 'COP', cost NUMERIC(14,4) NOT NULL DEFAULT 0, price NUMERIC(14,4) NOT NULL DEFAULT 0, cost_real NUMERIC(14,6), meta JSONB NOT NULL DEFAULT '{}');
CREATE INDEX IF NOT EXISTS usage_events_tenant_at ON usage_events (tenant, at DESC);
"""
TZ = ZoneInfo("America/Bogota")
CHANNELS = {"whatsapp": "WhatsApp", "sms": "SMS", "voice": "Llamadas", "email": "Correo"}
ns = None


def period(name: str, frm: str = "", to: str = "") -> tuple[datetime, datetime, str]:
    """Rango [desde, hasta) en hora de Bogotá: este mes, el mes anterior, últimos 7/30 días o fechas a elección."""
    now = datetime.now(TZ)
    first = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if name == "prev":
        end = first
        start = (first - timedelta(days=1)).replace(day=1)
        return start, end, start.strftime("%Y-%m")
    if name in ("7d", "30d"):
        return now - timedelta(days=int(name[:-1])), now + timedelta(minutes=1), f"últimos {name[:-1]} días"
    if name == "custom":
        try:
            a = datetime.strptime(frm, "%Y-%m-%d").replace(tzinfo=TZ)
            b = datetime.strptime(to, "%Y-%m-%d").replace(tzinfo=TZ) + timedelta(days=1)
        except ValueError:
            raise HTTPException(400, "Las fechas deben tener el formato AAAA-MM-DD")
        if b <= a or (b - a).days > 400:
            raise HTTPException(400, "Rango de fechas no válido (máximo 400 días)")
        return a, b, f"{frm} a {to}"
    return first, now + timedelta(minutes=1), first.strftime("%Y-%m")


class RateItem(BaseModel):
    """Una tarifa por unidad (mensaje, segmento de SMS, minuto, correo). Los campos vacíos valen para todos."""
    channel: str
    provider: str = ""
    direction: str = ""
    kind: str = ""
    cost: float = 0
    price: float = 0


class RatesReq(BaseModel):
    """Tarifario completo: moneda y filas."""
    currency: str = "COP"
    items: list[RateItem]


def init(deps) -> None:
    """Conecta el módulo con main.py: crea la tabla (si el Hub aún no lo hizo) y registra las rutas."""
    global ns
    ns = deps
    with ns.db() as c:
        c.execute(SCHEMA)
    r = APIRouter()
    me = ns.me

    def rows(a, b, slug: str = ""):
        q = ("SELECT tenant, channel, provider, direction, kind, count(*) events, sum(units) units, sum(cost) cost, sum(price) price, sum(cost_real) cost_real, "
             "count(*) FILTER (WHERE cost_real IS NOT NULL) reconciled FROM usage_events WHERE at >= %s AND at < %s" + (" AND tenant = %s" if slug else "") + " GROUP BY 1,2,3,4,5")
        with ns.db() as c:
            return c.execute(q, (a, b) + ((slug,) if slug else ())).fetchall()

    def names() -> dict:
        with ns.db() as c:
            return {t["slug"]: t["name"] for t in c.execute("SELECT slug, name FROM tenants").fetchall()}

    @r.get("/api/usage")
    def usage_summary(period_: str = Query("month", alias="period"), from_: str = Query("", alias="from"), to: str = "", actor: str = Depends(me)):
        """Consumo del periodo por empresa (y su detalle por canal, proveedor y tipo), con totales, costo estimado, precio y margen. Lo llama la interfaz web del Centro."""
        a, b, label = period(period_, from_, to)
        nm = names()
        out: dict = {}
        cur = ns.get_setting("rates", {}) or {}
        for x in rows(a, b):
            t = out.setdefault(x["tenant"], {"slug": x["tenant"], "name": nm.get(x["tenant"], x["tenant"]), "cost": 0.0, "price": 0.0, "byChannel": {}, "detail": []})
            u, cost, price = float(x["units"] or 0), float(x["cost"] or 0), float(x["price"] or 0)
            t["cost"] += cost
            t["price"] += price
            ch = t["byChannel"].setdefault(x["channel"], {"out": 0.0, "in": 0.0})
            ch[x["direction"] if x["direction"] in ("out", "in") else "out"] += u
            t["detail"].append({"channel": x["channel"], "provider": x["provider"], "direction": x["direction"], "kind": x["kind"], "events": x["events"], "units": u, "cost": cost, "price": price,
                                "costReal": float(x["cost_real"]) if x["cost_real"] is not None else None, "reconciled": x["reconciled"]})
        items = sorted(out.values(), key=lambda t: -t["price"] - t["cost"])
        tot = {"cost": sum(t["cost"] for t in items), "price": sum(t["price"] for t in items)}
        return {"period": label, "from": a.isoformat(), "to": b.isoformat(), "currency": cur.get("currency") or "COP", "items": items, "total": {**tot, "margin": tot["price"] - tot["cost"]}, "channels": CHANNELS}

    @r.get("/api/usage/{slug}/daily")
    def usage_daily(slug: str, period_: str = Query("month", alias="period"), from_: str = Query("", alias="from"), to: str = "", actor: str = Depends(me)):
        """Consumo diario de una empresa en el periodo (unidades, costo y precio por día y canal)."""
        a, b, _ = period(period_, from_, to)
        with ns.db() as c:
            res = c.execute("SELECT (at AT TIME ZONE 'America/Bogota')::date d, channel, sum(units) units, sum(cost) cost, sum(price) price FROM usage_events WHERE tenant = %s AND at >= %s AND at < %s GROUP BY 1,2 ORDER BY 1 DESC, 2",
                            (slug, a, b)).fetchall()
        return {"items": [{"day": str(x["d"]), "channel": x["channel"], "units": float(x["units"]), "cost": float(x["cost"]), "price": float(x["price"])} for x in res]}

    @r.get("/api/usage-export")
    def usage_export(period_: str = Query("month", alias="period"), from_: str = Query("", alias="from"), to: str = "", slug: str = "", actor: str = Depends(me)):
        """CSV del consumo del periodo (por empresa, canal, proveedor, dirección y tipo) para contabilidad o facturación. Se audita."""
        a, b, label = period(period_, from_, to)
        nm = names()
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["periodo", "empresa", "slug", "canal", "proveedor", "direccion", "tipo", "eventos", "unidades", "costo_estimado", "precio", "costo_real_conciliado"])
        for x in sorted(rows(a, b, slug), key=lambda x: (x["tenant"], x["channel"], x["provider"])):
            w.writerow([label, nm.get(x["tenant"], x["tenant"]), x["tenant"], x["channel"], x["provider"], x["direction"], x["kind"], x["events"], float(x["units"]), float(x["cost"]), float(x["price"]),
                        float(x["cost_real"]) if x["cost_real"] is not None else ""])
        ns.audit(actor, "exportar_consumo", slug or "todas", {"periodo": label})
        return Response(buf.getvalue(), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="consumo-{re.sub(r"[^0-9A-Za-z-]", "_", label)}.csv"'})

    @r.get("/api/rates")
    def get_rates(actor: str = Depends(me)):
        """Tarifario actual (costo que pagamos y precio que cobramos por unidad) y los canales y proveedores disponibles."""
        v = ns.get_setting("rates", {}) or {}
        return {"currency": v.get("currency") or "COP", "items": v.get("items", []), "channels": CHANNELS,
                "providers": ["evolution", "meta", "gupshup", "twilio", "generic", "smtp"], "kinds": ["text", "interactive", "template", "marketing", "utility", "authentication", "service", "call", "minutes"]}

    @r.put("/api/rates")
    def put_rates(req: RatesReq, actor: str = Depends(me)):
        """Guarda el tarifario. El costo y el precio se congelan en cada evento nuevo; los anteriores no cambian."""
        if not re.fullmatch(r"[A-Z]{3}", req.currency):
            raise HTTPException(400, "La moneda debe ser un código de 3 letras (COP, USD…)")
        items, seen = [], set()
        for i in req.items[:200]:
            if i.channel not in CHANNELS:
                raise HTTPException(400, f"Canal desconocido: {i.channel}")
            if i.cost < 0 or i.price < 0 or i.cost > 1e6 or i.price > 1e6:
                raise HTTPException(400, "Las tarifas deben estar entre 0 y 1.000.000")
            key = (i.channel, i.provider, i.direction, i.kind)
            if key in seen:
                raise HTTPException(400, f"Tarifa repetida: {' / '.join(x or 'todos' for x in key)}")
            seen.add(key)
            items.append(i.model_dump())
        ns.put_setting("rates", {"currency": req.currency, "items": items})
        ns.audit(actor, "tarifas_actualizadas", None, {"filas": len(items), "moneda": req.currency})
        return {"ok": True}

    ns.app.include_router(r)
