"""Prospectos de la prospección saliente: se importan (CSV o API), se validan (correo, teléfono E.164, lista de no contactar, duplicados contra el CRM), se puntúan contra el
perfil de cliente ideal (ICP) y se enriquecen con IA (B2B o B2C, sector, dolor probable). Los mejores pasan al CRM como leads de «Prospección IA» y los atiende el comercial virtual
en modo saliente, a un ritmo diario limitado. Tablas: prospects. Configuración del ICP: settings.prospecting."""
import asyncio
import json
import logging
import re
from datetime import datetime, timezone

from . import compliance, db, ingest, llm
from .espo import Espo

log = logging.getLogger("hub.prospects")
SCHEMA = """
CREATE TABLE IF NOT EXISTS prospects (
    id SERIAL PRIMARY KEY, tenant TEXT NOT NULL, batch TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', company TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', country TEXT NOT NULL DEFAULT '', industry TEXT NOT NULL DEFAULT '', segment TEXT NOT NULL DEFAULT '', niche TEXT NOT NULL DEFAULT '',
    score INT, rules_score INT, status TEXT NOT NULL DEFAULT 'new', reason TEXT NOT NULL DEFAULT '', lead_id TEXT, enrichment JSONB NOT NULL DEFAULT '{}', raw JSONB NOT NULL DEFAULT '{}',
    campaign TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'import';
CREATE INDEX IF NOT EXISTS prospects_tenant ON prospects (tenant, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS prospects_email ON prospects (tenant, email) WHERE email <> '' AND status <> 'rejected';
CREATE UNIQUE INDEX IF NOT EXISTS prospects_phone ON prospects (tenant, phone) WHERE phone <> '' AND status <> 'rejected';
"""
DEFAULT_ICP = {"industries": [], "countries": [], "segments": ["b2b"], "titles": ["gerente", "director", "dueño", "propietario", "ceo", "fundador", "gerente comercial", "jefe de ventas"],
               "min_score": 50, "daily_limit": 100, "describe": "", "campaign": ""}


def ensure_schema() -> None:
    with db.pool.connection() as c:
        c.execute(SCHEMA)


# ---------------- configuración del ICP
def icp(tenant: dict) -> dict:
    raw = ((tenant.get("settings") or {}).get("prospecting") or {})
    return {**DEFAULT_ICP, **{k: v for k, v in raw.items() if k in DEFAULT_ICP}}


def clean_icp(new: dict) -> dict:
    t = lambda v, n: str(v or "").strip()[:n]
    lst = lambda v, n=40: [t(x, 60).lower() for x in (v if isinstance(v, list) else str(v or "").split(",")) if t(x, 60)][:n]
    return {"industries": lst(new.get("industries")), "countries": [x.upper()[:2] for x in lst(new.get("countries"), 20)], "segments": [x for x in lst(new.get("segments"), 2) if x in ("b2b", "b2c")] or ["b2b"],
            "titles": lst(new.get("titles")), "min_score": max(0, min(100, int(new.get("min_score") or 50))), "daily_limit": max(1, min(2000, int(new.get("daily_limit") or 100))),
            "describe": t(new.get("describe"), 800), "campaign": t(new.get("campaign"), 120)}


def save_icp(slug: str, new: dict) -> dict:
    clean = clean_icp(new)
    with db.pool.connection() as c:
        c.execute("UPDATE tenants SET settings = jsonb_set(COALESCE(settings,'{}'::jsonb), '{prospecting}', %s::jsonb, true) WHERE slug=%s", (json.dumps(clean), slug))
    return clean


# ---------------- puntaje por reglas (0-100)
def rules_score(p: dict, cfg: dict) -> int:
    s = 20
    if p["email"] and p["phone"]:
        s += 10
    if p["company"]:
        s += 10
    hay = " ".join([p["industry"], p["company"], p["title"]]).lower()
    if cfg["industries"] and any(i in hay for i in cfg["industries"]):
        s += 25
    if p["title"] and any(t in p["title"].lower() for t in cfg["titles"]):
        s += 15
    if cfg["countries"] and p["country"] in cfg["countries"]:
        s += 15
    elif not cfg["countries"]:
        s += 5
    seg = p["segment"] or ("b2b" if p["company"] else "b2c")
    if seg in cfg["segments"]:
        s += 10
    return max(0, min(100, s))


def _row_to_dict(r) -> dict:
    d = dict(r)
    for k in ("created_at", "updated_at"):
        d[k] = d[k].isoformat() if d.get(k) else None
    return d


# ---------------- importación y validación
def _pick(row: dict, *keys: str) -> str:
    low = {re.sub(r"[^a-z0-9]", "", str(k).lower()): v for k, v in row.items()}
    for k in keys:
        v = low.get(re.sub(r"[^a-z0-9]", "", k.lower()))
        if v not in (None, ""):
            return str(v).strip()
    return ""


async def _exists_in_crm(tenant: dict, email: str, phone: str) -> bool:
    try:
        if email and await ingest.find_lead(tenant, "emailAddress", email):
            return True
        if phone and await ingest.find_lead_by_phone(tenant, phone):
            return True
    except Exception as e:
        log.warning("duplicado en el CRM: %s", str(e)[:100])
    return False


async def import_rows(tenant: dict, rows: list[dict], batch: str = "", default_country: str = "CO", campaign: str = "") -> dict:
    """Valida y guarda hasta 5.000 filas. Cada una queda «ready» (válida), o «rejected» con el motivo (correo/teléfono inválido, no contactar, duplicado)."""
    cfg, slug = icp(tenant), tenant["slug"]
    batch = (batch or datetime.now(timezone.utc).strftime("lote-%Y%m%d-%H%M"))[:60]
    out = {"batch": batch, "received": 0, "ready": 0, "rejected": 0, "reasons": {}}
    for raw in rows[:5000]:
        out["received"] += 1
        name = _pick(raw, "nombre", "name", "contacto", "full name", "nombre completo") or (_pick(raw, "first name", "firstname", "nombres") + " " + _pick(raw, "last name", "lastname", "apellidos")).strip()
        company = _pick(raw, "empresa", "company", "compania", "razon social")
        email_raw, phone_raw = _pick(raw, "correo", "email", "e-mail", "mail", "correo electronico"), _pick(raw, "telefono", "phone", "celular", "whatsapp", "movil", "mobile")
        country = (_pick(raw, "pais", "country") or "").upper()[:2]
        email = compliance.norm_email(email_raw)
        reason = ""
        ok_e, why_e = compliance.email_ok(email) if email else (False, "")
        if email and not ok_e:
            reason, email = why_e, ""
        phone, why_p = compliance.phone_e164(phone_raw, country or default_country) if phone_raw else ("", "")
        if phone_raw and not phone and not email and not reason:
            reason = why_p
        country = country or compliance.country_of_phone(phone) or default_country
        if not email and not phone:
            reason = reason or "Sin correo ni teléfono"
        elif compliance.is_dnc(slug, email=email or None, phones=[phone] if phone else []):
            reason = "Está en la lista de no contactar"
        elif await _exists_in_crm(tenant, email, phone):
            reason = "Ya existe en el CRM"
        p = {"name": name[:120] or (company[:120] or "Sin nombre"), "company": company[:120], "title": _pick(raw, "cargo", "title", "puesto", "position")[:80], "email": email, "phone": phone, "country": country,
             "industry": _pick(raw, "sector", "industry", "industria", "rubro")[:80], "segment": "", "niche": ""}
        p["niche"] = (p["industry"] or "sin sector").lower()[:60]
        status = "rejected" if reason else "ready"
        score = None if reason else rules_score(p, cfg)
        try:
            with db.pool.connection() as c:
                c.execute("INSERT INTO prospects (tenant, batch, name, company, title, email, phone, country, industry, segment, niche, score, rules_score, status, reason, raw, campaign) "
                          "VALUES (%(t)s,%(b)s,%(name)s,%(company)s,%(title)s,%(email)s,%(phone)s,%(country)s,%(industry)s,%(segment)s,%(niche)s,%(sc)s,%(sc)s,%(st)s,%(r)s,%(raw)s::jsonb,%(camp)s)",
                          {**p, "t": slug, "b": batch, "sc": score, "st": status, "r": reason, "raw": json.dumps({k: str(v)[:300] for k, v in raw.items()}), "camp": campaign[:120]})
        except Exception as e:   # índice único: mismo correo o teléfono ya cargado
            reason = "Duplicado en los prospectos"
            status = "rejected"
            log.info("prospecto duplicado: %s", str(e)[:80])
        if status == "rejected":
            out["rejected"] += 1
            out["reasons"][reason] = out["reasons"].get(reason, 0) + 1
        else:
            out["ready"] += 1
    return out


# ---------------- enriquecimiento con IA
ENRICH_SCHEMA = {"type": "object", "properties": {
    "segment": {"type": "string", "enum": ["b2b", "b2c"], "description": "b2b = empresa que compraría para su negocio; b2c = persona natural"},
    "industry": {"type": "string", "description": "sector o industria en 1 a 3 palabras"},
    "pain": {"type": "string", "description": "dolor operacional más probable que resolvería nuestro producto, en una frase"},
    "fit": {"type": "integer", "description": "0 a 100: qué tan bien encaja con el cliente ideal descrito"},
    "reason": {"type": "string", "description": "por qué ese puntaje, en una frase"}},
    "required": ["segment", "industry", "pain", "fit", "reason"]}


async def enrich_one(tenant: dict, row: dict, cfg: dict) -> None:
    sysm = ("Eres un analista comercial. Clasificas prospectos para un equipo de ventas. Responde SOLO con el JSON pedido, sin inventar datos: si no hay información suficiente, "
            "baja el puntaje y dilo en «reason».")
    user = (f"CLIENTE IDEAL:\n{cfg['describe'] or '(sin descripción: empresas que necesiten ordenar sus ventas y su atención a clientes)'}\nSectores: {', '.join(cfg['industries']) or '(cualquiera)'}\n"
            f"Países: {', '.join(cfg['countries']) or '(cualquiera)'}\n\nPROSPECTO:\nNombre: {row['name']}\nEmpresa: {row['company'] or '(no indica)'}\nCargo: {row['title'] or '(no indica)'}\n"
            f"Sector: {row['industry'] or '(no indica)'}\nPaís: {row['country']}\nCorreo: {row['email'].partition('@')[2] or '(no tiene)'}")
    try:
        d = await llm.chat_json(tenant, sysm, user, ENRICH_SCHEMA, 300)
    except Exception as e:
        log.warning("enriquecimiento: %s", str(e)[:120])
        return
    fit = max(0, min(100, int(d.get("fit") or 0)))
    score = round((row["rules_score"] or 0) * 0.5 + fit * 0.5)
    seg = d.get("segment") if d.get("segment") in ("b2b", "b2c") else row["segment"]
    with db.pool.connection() as c:
        c.execute("UPDATE prospects SET enrichment=%s::jsonb, segment=%s, industry=CASE WHEN industry='' THEN %s ELSE industry END, niche=CASE WHEN industry='' THEN lower(%s) ELSE niche END, score=%s, updated_at=now() WHERE id=%s",
                  (json.dumps({"pain": str(d.get("pain") or "")[:300], "fit": fit, "reason": str(d.get("reason") or "")[:300]}), seg or "", str(d.get("industry") or "")[:80], str(d.get("industry") or "")[:60], score, row["id"]))


async def enrich_pending(tenant: dict, limit: int = 200) -> int:
    """Enriquece los prospectos «ready» que aún no tienen análisis (de 3 en 3 para no saturar al motor de IA)."""
    cfg = icp(tenant)
    with db.pool.connection() as c:
        rows = c.execute("SELECT * FROM prospects WHERE tenant=%s AND status='ready' AND enrichment = '{}'::jsonb ORDER BY id LIMIT %s", (tenant["slug"], limit)).fetchall()
    sem = asyncio.Semaphore(3)

    async def one(r):
        async with sem:
            await enrich_one(tenant, dict(r), cfg)
    await asyncio.gather(*(one(r) for r in rows))
    return len(rows)


# ---------------- consulta
def listing(slug: str, status: str = "", batch: str = "", q: str = "", limit: int = 300) -> dict:
    where, args = ["tenant=%s"], [slug]
    if status:
        where.append("status=%s"); args.append(status)
    if batch:
        where.append("batch=%s"); args.append(batch)
    if q:
        where.append("(name ILIKE %s OR company ILIKE %s OR email ILIKE %s OR phone ILIKE %s)"); args += [f"%{q}%"] * 4
    with db.pool.connection() as c:
        rows = c.execute(f"SELECT * FROM prospects WHERE {' AND '.join(where)} ORDER BY score DESC NULLS LAST, id DESC LIMIT %s", (*args, limit)).fetchall()
        counts = {r["status"]: r["n"] for r in c.execute("SELECT status, count(*) n FROM prospects WHERE tenant=%s GROUP BY status", (slug,)).fetchall()}
        batches = [r["batch"] for r in c.execute("SELECT batch FROM prospects WHERE tenant=%s GROUP BY batch ORDER BY max(id) DESC LIMIT 30", (slug,)).fetchall()]
        today = c.execute("SELECT count(*) n FROM prospects WHERE tenant=%s AND status='imported' AND updated_at::date = current_date", (slug,)).fetchone()["n"]
    return {"items": [_row_to_dict(r) for r in rows], "counts": counts, "batches": batches, "promotedToday": today}


def remove(slug: str, ids: list[int]) -> int:
    with db.pool.connection() as c:
        return c.execute("DELETE FROM prospects WHERE tenant=%s AND id = ANY(%s) AND status <> 'imported'", (slug, ids)).rowcount


# ---------------- paso al CRM
async def promote(tenant: dict, ids: list[int] | None = None, limit: int | None = None, agent_id: str | None = None) -> dict:
    """Crea en el CRM los leads de los prospectos listos (puntaje ≥ mínimo), hasta el tope diario, y le avisa al comercial virtual saliente."""
    from . import agent
    cfg, slug = icp(tenant), tenant["slug"]
    with db.pool.connection() as c:
        done = c.execute("SELECT count(*) n FROM prospects WHERE tenant=%s AND status='imported' AND updated_at::date = current_date", (slug,)).fetchone()["n"]
        room = max(0, cfg["daily_limit"] - done)
        if ids:
            rows = c.execute("SELECT * FROM prospects WHERE tenant=%s AND status='ready' AND id = ANY(%s) ORDER BY score DESC NULLS LAST LIMIT %s", (slug, ids, room)).fetchall()
        else:
            rows = c.execute("SELECT * FROM prospects WHERE tenant=%s AND status='ready' AND COALESCE(score,0) >= %s ORDER BY score DESC NULLS LAST, id LIMIT 2000", (slug, cfg["min_score"])).fetchall()
            rows = _allocate([dict(r) for r in rows], min(room, limit or room), tenant)
    out = {"created": 0, "skipped": 0, "limit_reached": room == 0, "errors": 0}
    for r in rows:
        r = dict(r)
        try:
            if compliance.is_dnc(slug, email=r["email"] or None, phones=[r["phone"]] if r["phone"] else []):
                _mark(r["id"], "rejected", "Está en la lista de no contactar"); out["skipped"] += 1; continue
            en = r["enrichment"] or {}
            desc = "\n".join(x for x in [f"Empresa: {r['company']}" if r["company"] else "", f"Cargo: {r['title']}" if r["title"] else "", f"Sector: {r['industry']}" if r["industry"] else "",
                                          f"Dolor probable: {en['pain']}" if en.get("pain") else "", f"Puntaje de ajuste: {r['score']}/100" if r["score"] is not None else "", f"Lote: {r['batch']}",
                                          (f"Hallado por el buscador. Fuente pública: {(r['raw'] or {}).get('fuente_url', '')}" if r.get("origin") == "finder" else ""),
                                          (f"Oferta indicada por el equipo: {(r['raw'] or {}).get('oferta')} como producto principal de este contacto." if (r.get("raw") or {}).get("oferta") else ""),
                                          (f"Producto recomendado por el calificador: {(en.get('qualifier') or {}).get('product', '')} (grado {(en.get('qualifier') or {}).get('grade', '')}). Ángulo: {(en.get('qualifier') or {}).get('angle', '')}" if en.get("qualifier") else "")] if x)
            extra = {"description": desc, "preferredChannel": "Correo" if r["email"] else "WhatsApp", **({"accountName": r["company"]} if r["company"] else {})}
            lead_id = await ingest.upsert_lead(tenant, name=r["name"], phone=r["phone"] or None, email=r["email"] or None, source="Prospección IA", extra=extra, campaign=r["campaign"] or cfg["campaign"] or None)
            _mark(r["id"], "imported", "", lead_id)
            out["created"] += 1
            try:
                await agent.on_lead(tenant, lead_id, agent_id, decided=bool(agent_id))
            except Exception as e:
                log.warning("encolar en el comercial virtual: %s", str(e)[:100])
        except Exception as e:
            out["errors"] += 1
            log.warning("promover prospecto %s: %s", r["id"], str(e)[:120])
    return out


def _allocate(rows: list[dict], n: int, tenant: dict) -> list[dict]:
    """Reparte el cupo del día entre los nichos según cuánto responden (los pausados no entran); dentro de cada nicho van primero los de mejor puntaje."""
    from . import growth
    paused = set(((tenant.get("settings") or {}).get("prospecting") or {}).get("paused_niches") or [])
    by: dict = {}
    for r in rows:
        if r["niche"] not in paused:
            by.setdefault(r["niche"], []).append(r)
    if not by or n <= 0:
        return []
    try:
        w = growth.niche_weights(tenant["slug"], tenant)
    except Exception:
        w = {}
    avg = (sum(w.values()) / len(w)) if w else 0.3
    weight = {k: w.get(k, avg) for k in by}   # un nicho sin historial parte del promedio (se explora)
    taken = {k: 0 for k in by}
    out: list[dict] = []
    while len(out) < n and any(by.values()):
        k = max((k for k in by if by[k]), key=lambda k: weight[k] / (taken[k] + 1))
        out.append(by[k].pop(0))
        taken[k] += 1
    return out


def is_cold(slug: str, lead_id: str) -> bool:
    """¿Este lead lo encontró el buscador en internet (nadie pidió que lo contactaran)? Esos contactos nunca salen por WhatsApp/SMS ni por el proveedor transaccional."""
    try:
        with db.pool.connection() as c:
            return bool(c.execute("SELECT 1 FROM prospects WHERE tenant=%s AND lead_id=%s AND origin='finder' LIMIT 1", (slug, lead_id)).fetchone())
    except Exception:
        return True   # ante la duda, tratarlo como frío (más restrictivo)


def _mark(pid: int, status: str, reason: str = "", lead_id: str | None = None) -> None:
    with db.pool.connection() as c:
        c.execute("UPDATE prospects SET status=%s, reason=%s, lead_id=COALESCE(%s, lead_id), updated_at=now() WHERE id=%s", (status, reason, lead_id, pid))
