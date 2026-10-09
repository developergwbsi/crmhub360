"""Procesos al llegar un lead: cada empresa define qué se ejecuta (una llamada a una API/webhook) cuando entra un lead —con su identificación y demás datos—
y qué se guarda de la respuesta. Se ejecutan en segundo plano, con reintentos y un registro de cada ejecución. El scraping se enchufa después como otro tipo de acción."""
import asyncio, json, logging, re, secrets, time

import httpx

from . import db, httpgen, qualify
from .espo import Espo

log = logging.getLogger("hub.proc")
SCHEMA = """
CREATE TABLE IF NOT EXISTS process_runs (
    id SERIAL PRIMARY KEY, tenant TEXT NOT NULL, lead_id TEXT NOT NULL, process_id TEXT NOT NULL, process_name TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'running',
    managed_id TEXT, http_status INT, error TEXT NOT NULL DEFAULT '', response TEXT NOT NULL DEFAULT '', applied JSONB NOT NULL DEFAULT '[]', attempts INT NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ);
ALTER TABLE process_runs ADD COLUMN IF NOT EXISTS managed_id TEXT;
CREATE INDEX IF NOT EXISTS process_runs_lead ON process_runs (tenant, lead_id, id DESC);
CREATE INDEX IF NOT EXISTS process_runs_tenant ON process_runs (tenant, id DESC);
"""
MAX_PROCESSES = 20
# Campos del lead que un proceso puede llenar y cómo se convierten
FIELDS = {"creditScore": "int", "totalDebt": "num", "overdueDebt": "num", "monthlyIncome": "num", "creditorCount": "int", "maxDaysOverdue": "int", "defaultCount": "int",
          "identificationType": "str", "processResult": "str", "description": "append"}
_sem = asyncio.Semaphore(5)


def ensure_schema() -> None:
    with db.pool.connection() as c:
        c.execute(SCHEMA)


# ---------------- servicios del sistema (los define y mantiene el Centro de control; sus credenciales nunca salen de ahí)
def lookup(lid: str) -> dict | None:
    with db.pool.connection() as c:
        r = c.execute("SELECT value FROM control_settings WHERE key='lookups'").fetchone()
    return next((x for x in (r["value"] if r else []) if x.get("id") == lid), None)


def assigned(tenant: dict) -> list[str]:
    return list((tenant.get("settings") or {}).get("lookups") or [])


def catalog(tenant: dict) -> list[dict]:
    """Servicios que esta empresa tiene habilitados (sin credenciales)."""
    out = []
    for lid in assigned(tenant):
        lk = lookup(lid)
        if lk and lk.get("enabled", True):
            out.append({"id": lk["id"], "name": lk["name"], "description": lk.get("description", ""), "category": lk.get("category", "otro"), "map": lk.get("map", []), "unitPrice": lk.get("unit_price", "")})
    return out


# ---------------- configuración
def _list(v, n: int, m: int) -> list[str]:
    return [str(x).strip()[:m] for x in (v or []) if str(x).strip()][:n]


def clean(new: list, old: list | None, tenant_assigned: list[str] | None = None) -> list[dict]:
    """Valida los procesos que llegan de la interfaz; los secretos vacíos conservan el valor guardado."""
    olds = {p.get("id"): p for p in (old or [])}
    out = []
    for p in (new or [])[:MAX_PROCESSES]:
        name = str(p.get("name", "")).strip()[:80]
        if len(name) < 2:
            raise ValueError("Cada proceso necesita un nombre.")
        pid = str(p.get("id") or secrets.token_hex(4))
        tr = p.get("trigger") or {}
        rows = []
        for r in (p.get("map") or [])[:20]:
            to = str(r.get("to", ""))
            path = str(r.get("path", "")).strip()[:120]
            if not path:
                continue
            if not (to in ("note", "status") or (to.startswith("field:") and to[6:] in FIELDS)):
                raise ValueError(f"Destino no válido: {to}")
            rows.append({"path": path, "to": to})
        managed = str(p.get("managed") or "")
        if managed:
            if managed not in tenant_assigned:
                raise ValueError(f"«{name}»: este servicio no está habilitado para tu empresa.")
            http = {}
        else:
            http = httpgen.merge((olds.get(pid) or {}).get("http"), p.get("http") or {})
            if not http["url"]:
                raise ValueError(f"«{name}»: falta la URL de la API.")
        out.append({"id": pid, "name": name, "enabled": bool(p.get("enabled", True)),
                    "trigger": {"sources": _list(tr.get("sources"), 20, 60), "forms": _list(tr.get("forms"), 20, 80), "requireId": bool(tr.get("requireId", True)), "runOnChange": bool(tr.get("runOnChange", True))},
                    "http": http, "managed": managed, "map": rows, "recalc": bool(p.get("recalc", False)), "timeout": min(60, max(5, int(p.get("timeout") or 25)))})
    return out


def public(procs: list | None) -> list[dict]:
    return [{**p, "http": httpgen.public(p.get("http"))} for p in (procs or [])]


def load(tenant: dict) -> list[dict]:
    return list((tenant.get("settings") or {}).get("processes") or [])


# ---------------- ejecución
def values_of(lead: dict, tenant: dict) -> dict:
    full = (lead.get("name") or "").strip()
    return {"identificacion": lead.get("identification") or "", "tipo_identificacion": lead.get("identificationType") or "", "nombre": lead.get("firstName") or full.split(" ")[0],
            "apellido": lead.get("lastName") or "", "nombre_completo": full, "telefono": lead.get("phoneNumber") or "", "correo": lead.get("emailAddress") or "",
            "fuente": lead.get("source") or "", "campana": lead.get("campaignName") or "", "formulario": lead.get("originForm") or "", "lead_id": lead.get("id") or "",
            "empresa": tenant.get("name") or ""}


def matches(proc: dict, lead: dict, changed: bool) -> bool:
    tr = proc.get("trigger") or {}
    if changed and not tr.get("runOnChange", True):
        return False
    if tr.get("sources") and (lead.get("source") or "") not in tr["sources"]:
        return False
    if tr.get("forms") and (lead.get("originForm") or "") not in tr["forms"]:
        return False
    return True


def _cast(kind: str, v):
    if kind == "int":
        return int(float(re.sub(r"[^\d.\-]", "", str(v)) or 0))
    if kind == "num":
        return float(re.sub(r"[^\d.\-]", "", str(v).replace(",", ".")) or 0)
    return str(v if not isinstance(v, (dict, list)) else json.dumps(v, ensure_ascii=False))[:4000]


async def _request(proc: dict, values: dict, tenant: dict | None = None) -> tuple[int, str]:
    cfg = proc["http"]
    if proc.get("managed"):   # servicio del sistema: la dirección y las credenciales las pone el Centro de control
        lk = lookup(proc["managed"])
        if not lk or not lk.get("enabled", True) or (tenant is not None and proc["managed"] not in assigned(tenant)):
            raise ValueError("Este servicio ya no está disponible para tu empresa. Contacta a tu proveedor.")
        cfg = lk["http"]
    method, url, kw, extra = httpgen.build(cfg, values)
    httpgen.check_url(url)
    async with httpx.AsyncClient(timeout=proc.get("timeout", 25), follow_redirects=False) as c:
        r = await c.request(method, url, headers=extra["headers"], auth=extra["auth"], **kw)
    return r.status_code, r.text[:200000]


def preview(proc: dict, text: str) -> list[dict]:
    """Qué se guardaría de esta respuesta (sin guardar nada)."""
    try:
        data = json.loads(text)
    except ValueError:
        data = None
    return [{"path": r["path"], "to": r["to"], "value": httpgen.dig(data, r["path"]) if data is not None else None} for r in proc.get("map", [])]


async def test(tenant: dict, proc: dict, values: dict) -> dict:
    try:
        status, text = await _request(proc, values, tenant)
    except Exception as e:
        return {"ok": False, "error": str(e)[:300]}
    return {"ok": status < 400, "status": status, "response": text[:4000], "preview": preview(proc, text)}


async def _apply(tenant: dict, proc: dict, lead_id: str, text: str) -> list[dict]:
    espo = Espo(tenant)
    try:
        data = json.loads(text)
    except ValueError:
        data = None
    applied, put, notes, status_to = [], {}, [], None
    for r in proc.get("map", []):
        v = httpgen.dig(data, r["path"]) if data is not None else None
        if v is None or v == "":
            continue
        to = r["to"]
        if to == "note":
            notes.append(f'{r["path"]}: {v if not isinstance(v, (dict, list)) else json.dumps(v, ensure_ascii=False)[:300]}')
        elif to == "status":
            status_to = str(v)
        else:
            f = to[6:]
            val = _cast(FIELDS[f], v)
            if FIELDS[f] == "append":
                cur = (await espo.get(f"Lead/{lead_id}", select="description")).get("description") or ""
                put[f] = (cur + f"\n[{proc['name']}] {val}").strip()[:5000]
            else:
                put[f] = val
        applied.append({"path": r["path"], "to": to, "value": v if not isinstance(v, (dict, list)) else "…"})
    if put:
        await espo.put(f"Lead/{lead_id}", put)
    if status_to:
        try:
            await espo.put(f"Lead/{lead_id}", {"status": status_to, "statusComment": f"[Proceso] {proc['name']}"})
        except Exception:
            applied.append({"path": "(estado)", "to": "status", "value": f"«{status_to}» no es un estado válido"})
    note = f"[Proceso] {proc['name']}: completado" + (" · " + " · ".join(notes) if notes else "") + (f" · {len(put)} campo(s) actualizado(s)" if put else "")
    await espo.note(lead_id, note)
    if proc.get("recalc"):
        try:
            await qualify.run(tenant, lead_id)
        except Exception as e:
            log.warning("recalcular calificación falló: %s", str(e)[:120])
    return applied


async def execute(tenant: dict, proc: dict, lead: dict, run_id: int) -> None:
    slug, lead_id = tenant["slug"], lead["id"]
    values = values_of(lead, tenant)
    last_err, status_code, text = "", None, ""
    async with _sem:
        for attempt in range(3):
            with db.pool.connection() as c:
                c.execute("UPDATE process_runs SET attempts=%s WHERE id=%s", (attempt + 1, run_id))
            try:
                status_code, text = await _request(proc, values, tenant)
                if status_code < 500 and status_code != 429:
                    break
                last_err = f"La API respondió {status_code}"
            except ValueError as e:   # configuración inválida o URL no permitida: reintentar no sirve
                last_err = str(e); status_code = None
                break
            except Exception as e:
                last_err = f"No se pudo conectar: {str(e)[:160]}"
            if attempt < 2:
                await asyncio.sleep(2 if attempt == 0 else 8)
    ok = status_code is not None and status_code < 400
    applied: list[dict] = []
    if ok:
        try:
            applied = await _apply(tenant, proc, lead_id, text)
        except Exception as e:
            ok, last_err = False, f"La respuesta llegó pero no se pudo guardar en el lead: {str(e)[:200]}"
    if not ok:
        last_err = last_err or f"La API respondió {status_code}: {text[:160]}"
        try:
            await Espo(tenant).note(lead_id, f"[Proceso] {proc['name']}: error — {last_err[:300]}")
        except Exception:
            pass
    with db.pool.connection() as c:
        c.execute("UPDATE process_runs SET status=%s, http_status=%s, error=%s, response=%s, applied=%s, finished_at=now() WHERE id=%s",
                  ("ok" if ok else "error", status_code, last_err[:500], text[:2000], json.dumps(applied), run_id))


async def run_for_lead(tenant: dict, lead_id: str, *, process_id: str | None = None, changed: bool = False, manual: bool = False) -> list[int]:
    """Lanza los procesos que correspondan a este lead (o uno concreto). Devuelve los ids de ejecución."""
    procs = [p for p in load(tenant) if (p.get("enabled") or manual) and (not process_id or p["id"] == process_id)]
    if not procs:
        return []
    lead = await Espo(tenant).get(f"Lead/{lead_id}")
    if lead.get("isSimulation") or lead.get("isThread"):
        return []
    ids = []
    for p in procs:
        if not manual and not matches(p, lead, changed):
            continue
        skip = (p.get("trigger") or {}).get("requireId", True) and not (lead.get("identification") or "").strip()
        with db.pool.connection() as c:
            rid = c.execute("INSERT INTO process_runs (tenant, lead_id, process_id, process_name, managed_id, status, error) VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id",
                            (tenant["slug"], lead_id, p["id"], p["name"], p.get("managed") or None, "skipped" if skip else "running", "El lead no tiene identificación." if skip else "")).fetchone()["id"]
            if skip:
                c.execute("UPDATE process_runs SET finished_at=now() WHERE id=%s", (rid,))
        ids.append(rid)
        if not skip:
            asyncio.create_task(_safe(tenant, p, lead, rid))
    return ids


async def _safe(tenant, proc, lead, rid):
    try:
        await execute(tenant, proc, lead, rid)
    except Exception as e:
        log.exception("proceso %s", proc.get("name"))
        with db.pool.connection() as c:
            c.execute("UPDATE process_runs SET status='error', error=%s, finished_at=now() WHERE id=%s", (str(e)[:400], rid))


def runs(tenant: str, lead_id: str | None = None, limit: int = 60) -> list[dict]:
    with db.pool.connection() as c:
        q = "SELECT id, lead_id, process_id, process_name, managed_id, status, http_status, error, applied, attempts, started_at, finished_at FROM process_runs WHERE tenant=%s" + (" AND lead_id=%s" if lead_id else "") + " ORDER BY id DESC LIMIT %s"
        return [dict(r) for r in c.execute(q, (tenant, lead_id, limit) if lead_id else (tenant, limit)).fetchall()]
