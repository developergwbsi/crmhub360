"""Ciclo diario autónomo de prospección: Buscador → Calificador → comercial virtual (Valeria). Cada empresa lo activa en Prospección → Buscador (settings.finder.auto) y elige la hora local.
Respeta la licencia del buscador, el interruptor de emergencia (engine_paused) y los frenos del correo en frío. El humano entra cuando el comercial virtual consigue una demo agendada."""
import asyncio
import json
import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from . import agent, db, finder, qualifier, report

log = logging.getLogger("hub.pipeline")


async def run_once(tenant: dict) -> dict:
    """Una pasada completa para una empresa: busca, califica y pasa los mejores al comercial virtual."""
    out = {"at": datetime.now(timezone.utc).isoformat()}
    f = await finder.run(tenant)
    out["finder"] = {k: f.get(k) for k in ("found", "ready", "rejected", "reason")}
    q = await qualifier.run(db.get_tenant(tenant["slug"]))
    out["qualifier"] = q
    finder._save(tenant["slug"], {"pipeline_last": out})
    return out


def _due(tenant: dict) -> bool:
    f = ((tenant.get("settings") or {}).get("finder") or {})
    if not (f.get("enabled") and f.get("auto") and finder.licensed(tenant)):
        return False
    tz = ZoneInfo(((tenant.get("settings") or {}).get("agent") or {}).get("schedule", {}).get("tz") or "America/Bogota")
    now = datetime.now(tz)
    last = (f.get("pipeline_last") or {}).get("at")
    if last and datetime.fromisoformat(last).astimezone(tz).date() == now.date():
        return False
    return now.hour >= int(f.get("hour") or 9)


async def worker() -> None:
    """Revisa cada 10 minutos si a alguna empresa le toca su pasada diaria."""
    await asyncio.sleep(60)
    while True:
        try:
            with db.pool.connection() as c:
                rows = c.execute("SELECT * FROM tenants WHERE status='active' AND settings->'finder'->>'auto' = 'true'").fetchall()
            for t in rows:
                t = dict(t)
                if agent.engine_paused(t) or not _due(t):
                    continue
                try:
                    r = await run_once(t)
                    log.info("%s: pipeline %s", t["slug"], json.dumps(r, ensure_ascii=False)[:300])
                except Exception as e:
                    log.warning("pipeline %s: %s", t["slug"], str(e)[:200])
                    finder._save(t["slug"], {"pipeline_last": {"at": datetime.now(timezone.utc).isoformat(), "error": str(e)[:200]}})
        except Exception:
            log.exception("ciclo del pipeline")
        try:   # reporte gerencial por correo: después del ciclo, a la hora que cada empresa eligió
            with db.pool.connection() as c:
                rows = c.execute("SELECT * FROM tenants WHERE status='active' AND settings->'finder'->'report'->>'enabled' = 'true'").fetchall()
            for t in rows:
                t = dict(t)
                if report.due(t):
                    try:
                        r = await report.send(t)
                        log.info("%s: reporte gerencial enviado a %s", t["slug"], ", ".join(r["to"]))
                    except Exception as e:
                        log.warning("reporte gerencial %s: %s", t["slug"], str(e)[:200])
        except Exception:
            log.exception("reporte gerencial")
        await asyncio.sleep(600)
