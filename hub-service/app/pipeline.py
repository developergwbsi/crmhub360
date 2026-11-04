"""Ciclo diario autónomo de prospección: Buscador → Calificador → comercial virtual (Valeria). Cada empresa lo activa en Prospección → Buscador (settings.finder.auto) y elige la hora local.
Respeta la licencia del buscador, el interruptor de emergencia (engine_paused) y los frenos del correo en frío. El humano entra cuando el comercial virtual consigue una demo agendada."""
import asyncio
import json
import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from . import agent, db, finder, qualifier, ramp, report, wallet

log = logging.getLogger("hub.pipeline")


def _hours(tenant: dict) -> list[int]:
    """Horas locales de las pasadas del día: la principal y, si está configurada, una segunda (p. ej. la tarde)."""
    c = finder.config(tenant)
    return sorted({c["hour"], *([c["hour2"]] if c.get("hour2") is not None else [])})


async def run_once(tenant: dict) -> dict:
    """Una pasada completa para una empresa: busca, califica y pasa los mejores al comercial virtual."""
    out = {"at": datetime.now(timezone.utc).isoformat()}
    cfg = finder.config(tenant)
    per = -(-cfg["daily_limit"] // len(_hours(tenant)))   # el tope diario se reparte entre las pasadas del día
    f = await finder.run(tenant, limit=per)
    out["finder"] = {k: f.get(k) for k in ("found", "ready", "rejected", "reason")}
    q = await qualifier.run(db.get_tenant(tenant["slug"]))
    out["qualifier"] = q
    finder._save(tenant["slug"], {"pipeline_last": out})
    return out


def _due_hour(tenant: dict) -> int | None:
    """Hora de la pasada que toca ahora (la más reciente ya cumplida que aún no corrió hoy), o None."""
    f = ((tenant.get("settings") or {}).get("finder") or {})
    if not (f.get("enabled") and f.get("auto") and finder.licensed(tenant)):
        return None
    tz = ZoneInfo(((tenant.get("settings") or {}).get("agent") or {}).get("schedule", {}).get("tz") or "America/Bogota")
    now = datetime.now(tz)
    done = f.get("slots_done") or {}
    ran = set(done.get("h") or []) if done.get("d") == str(now.date()) else set()
    last = (f.get("pipeline_last") or {}).get("at")
    if not ran and last and datetime.fromisoformat(last).astimezone(tz).date() == now.date():
        ran = {h for h in _hours(tenant) if h <= datetime.fromisoformat(last).astimezone(tz).hour}   # corrida anterior a las pasadas por turno: cuenta como la de su hora
    due = [h for h in _hours(tenant) if h <= now.hour and h not in ran]
    return max(due) if due else None


def _mark_slot(tenant: dict, hour: int) -> None:
    tz = ZoneInfo(((tenant.get("settings") or {}).get("agent") or {}).get("schedule", {}).get("tz") or "America/Bogota")
    today = str(datetime.now(tz).date())
    f = ((db.get_tenant(tenant["slug"]).get("settings") or {}).get("finder") or {})
    done = f.get("slots_done") or {}
    hs = set(done.get("h") or []) if done.get("d") == today else set()
    hs.add(hour)
    finder._save(tenant["slug"], {"slots_done": {"d": today, "h": sorted(hs)}})


async def worker() -> None:
    """Revisa cada 10 minutos si a alguna empresa le toca su pasada diaria."""
    await asyncio.sleep(60)
    while True:
        try:
            with db.pool.connection() as c:
                rows = c.execute("SELECT * FROM tenants WHERE status='active' AND settings->'finder'->>'auto' = 'true'").fetchall()
            for t in rows:
                t = dict(t)
                slot = None if agent.engine_paused(t) else _due_hour(t)
                if slot is None:
                    continue
                _mark_slot(t, slot)   # se marca antes de correr: si falla no se repite en bucle cada 10 minutos
                if not wallet.has_funds(t):   # sin créditos y sin motor propio: el ciclo espera a que recarguen
                    finder._save(t["slug"], {"pipeline_last": {"at": datetime.now(timezone.utc).isoformat(), "error": wallet.MSG}})
                    continue
                try:
                    r = await run_once(t)
                    log.info("%s: pipeline %s", t["slug"], json.dumps(r, ensure_ascii=False)[:300])
                except Exception as e:
                    log.warning("pipeline %s: %s", t["slug"], str(e)[:200], exc_info=True)
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
        try:   # escalado de la prospección: evaluación nocturna de resultados (sube, mantiene o baja el ritmo)
            with db.pool.connection() as c:
                rows = c.execute("SELECT * FROM tenants WHERE status='active' AND settings->'ramp'->>'enabled' = 'true'").fetchall()
            for t in rows:
                t = dict(t)
                if ramp.due(t):
                    try:
                        await ramp.evaluate(t)
                    except Exception as e:
                        log.warning("escalado %s: %s", t["slug"], str(e)[:200])
        except Exception:
            log.exception("escalado de la prospección")
        await asyncio.sleep(600)
