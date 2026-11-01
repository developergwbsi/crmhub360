"""Agente Calificador: entre el buscador y el comercial virtual. Con su propio entrenamiento y buenas prácticas de calificación decide qué prospectos vale la pena trabajar,
qué producto ofrecerles (Crm Hub 360, Gestor360, Core360…) y con qué ángulo, y pasa al comercial virtual solo a los mejores (grados A y B), hasta un tope diario.
Configuración: settings.qualifier = {enabled, min_grade, daily_pass, rules}. Guarda su análisis en prospects.enrichment.qualifier."""
import asyncio
import json
import logging

from . import compliance, db, llm, prospects

log = logging.getLogger("hub.qualifier")
GRADES = {"A": 90, "B": 70, "C": 45, "D": 10}
DEFAULT_RULES = (
    "Buenas prácticas de calificación (BANT adaptado a prospección B2B en frío):\n"
    "- Encaje: ¿el negocio vende o atiende clientes y sufre el problema de seguimiento disperso (WhatsApp, correo, Excel)? Más sedes, asesores o volumen de consultas = más encaje.\n"
    "- Contactabilidad: correo de negocio en dominio propio (info@, ventas@, comercial@ o una persona) es un buen contacto; solo teléfono no se puede trabajar por correo.\n"
    "- Producto: Crm Hub 360 es el producto principal y el que más se impulsa: es el motor que ordena las ventas y busca clientes, y encaja con casi cualquier empresa que venda o atienda clientes. "
    "Elígelo SIEMPRE por defecto. Cambia a Gestor360 solo si el negocio es claramente de servicios con agenda y sedes (belleza, automotriz, autolavado) Y el dolor es la operación de citas/nómina/inventario; "
    "a Core360 solo si fabrica o distribuye y el dolor es inventarios, producción o compras. En el ángulo menciona primero Crm Hub 360 aunque el producto elegido sea otro.\n"
    "- Descarta (grado D): competidores directos (otros CRM), entidades públicas, personas naturales y contactos sin relación con ventas o atención.\n"
    "- Prefiere a quien decide (gerencia, dirección comercial, dueño). Si el contacto es solo atención al cliente, baja un grado.\n"
    "- Escala de grados: A = encaje claro (varias sedes o asesores, dolor evidente) y buen contacto por correo. B = encaje probable y correo de negocio utilizable (basta para trabajarlo). "
    "C = encaje dudoso, o solo teléfono, o contacto poco útil. D = no trabajar. Sé justo: un negocio que vende o atiende clientes con correo de negocio publicado es al menos B.")
SCHEMA = {"type": "object", "properties": {
    "grade": {"type": "string", "enum": ["A", "B", "C", "D"]},
    "product": {"type": "string", "enum": ["crm_hub_360", "gestor360", "core360"], "description": "el producto que mejor encaja"},
    "angle": {"type": "string", "description": "en una frase, el ángulo para el primer correo (específico del sector, sin inventar datos)"},
    "why": {"type": "string", "description": "por qué ese grado, en una frase"},
    "flags": {"type": "array", "items": {"type": "string"}, "description": "alertas: competidor, entidad pública, solo teléfono, contacto genérico…"}},
    "required": ["grade", "product", "angle", "why"]}
PRODUCT_NAMES = {"crm_hub_360": "Crm Hub 360", "gestor360": "Gestor360", "core360": "Core360"}


def config(tenant: dict) -> dict:
    q = ((tenant.get("settings") or {}).get("qualifier") or {})
    return {"enabled": q.get("enabled", True) is not False, "min_grade": q.get("min_grade") if q.get("min_grade") in ("A", "B", "C") else "B",
            "daily_pass": max(1, min(50, int(q.get("daily_pass") or 5))), "rules": str(q.get("rules") or DEFAULT_RULES)[:3000]}


def _company_ctx(tenant: dict) -> str:
    ag = ((tenant.get("settings") or {}).get("agents") or [{}])[0].get("config") or (tenant.get("settings") or {}).get("agent") or {}
    co = ag.get("company") or {}
    return f"EMPRESA: {tenant.get('name')}\n{co.get('about', '')}\nPRODUCTOS Y SERVICIOS:\n{co.get('services', '')}"


async def qualify_one(tenant: dict, row: dict, cfg: dict) -> dict | None:
    icp = prospects.icp(tenant)
    user = (f"{_company_ctx(tenant)}\n\nCLIENTE IDEAL: {icp['describe']}\n\nREGLAS DE CALIFICACIÓN:\n{cfg['rules']}\n\nPROSPECTO:\nEmpresa: {row['company'] or row['name']}\nContacto: {row['name']} · {row['title'] or '(sin cargo)'}\n"
            f"Sector: {row['industry'] or '(no indica)'}\nCorreo: {row['email'] or '(no tiene)'}\nTeléfono: {'sí' if row['phone'] else 'no'}\nPaís: {row['country']}\n"
            f"Lo que sabemos: {((row.get('raw') or {}).get('por_que') or '')} · Dolor probable: {((row.get('enrichment') or {}).get('pain') or '')}\nFuente pública: {((row.get('raw') or {}).get('fuente_url') or '(no consta)')}")
    try:
        d = await llm.chat_json(tenant, "Eres el Calificador de prospectos de un equipo comercial B2B. Calificas con rigor y sin inventar datos: si no hay información suficiente, baja el grado y dilo.", user, SCHEMA, 400)
    except Exception as e:
        log.warning("calificar %s: %s", row["id"], str(e)[:120]); return None
    g = d.get("grade") if d.get("grade") in GRADES else "C"
    q = {"grade": g, "product": d.get("product") if d.get("product") in PRODUCT_NAMES else "crm_hub_360", "angle": str(d.get("angle") or "")[:300], "why": str(d.get("why") or "")[:300], "flags": [str(x)[:60] for x in (d.get("flags") or [])][:6]}
    en = {**(row.get("enrichment") or {}), "qualifier": q}
    with db.pool.connection() as c:
        c.execute("UPDATE prospects SET enrichment=%s::jsonb, score=%s, updated_at=now() WHERE id=%s", (json.dumps(en), round((row["rules_score"] or 0) * 0.3 + GRADES[g] * 0.7), row["id"]))
    return q


async def run(tenant: dict, limit: int = 30) -> dict:
    """Califica los prospectos «ready» sin calificar y pasa al comercial virtual los de grado suficiente, hasta el tope diario."""
    cfg, slug = config(tenant), tenant["slug"]
    if not cfg["enabled"]:
        return {"qualified": 0, "passed": 0, "reason": "El calificador está apagado."}
    with db.pool.connection() as c:
        rows = [dict(r) for r in c.execute("SELECT * FROM prospects WHERE tenant=%s AND status='ready' AND NOT (enrichment ? 'qualifier') ORDER BY id LIMIT %s", (slug, limit)).fetchall()]
    sem = asyncio.Semaphore(3)

    async def one(r):
        async with sem:
            return r, await qualify_one(tenant, r, cfg)
    res = await asyncio.gather(*(one(r) for r in rows))
    order = "ABC"
    with db.pool.connection() as c:
        done = c.execute("SELECT count(*) n FROM prospects WHERE tenant=%s AND status='imported' AND updated_at::date = current_date AND origin='finder'", (slug,)).fetchone()["n"]
        ready = [dict(r) for r in c.execute("SELECT id, enrichment FROM prospects WHERE tenant=%s AND status='ready' AND enrichment ? 'qualifier' AND (email <> '') ORDER BY score DESC NULLS LAST, id", (slug,)).fetchall()]
    ok = [r["id"] for r in ready if (r["enrichment"]["qualifier"]["grade"] in order and order.index(r["enrichment"]["qualifier"]["grade"]) <= order.index(cfg["min_grade"]))]
    room = max(0, cfg["daily_pass"] - done)
    out = {"qualified": sum(1 for _, q in res if q), "passed": 0, "grades": {}}
    for _, q in res:
        if q:
            out["grades"][q["grade"]] = out["grades"].get(q["grade"], 0) + 1
    if ok and room:
        pr = await prospects.promote(tenant, ids=ok[:room])
        out["passed"] = pr.get("created", 0)
    return out


def stats(slug: str) -> dict:
    """Resumen del calificador: cuántos prospectos hay por grado y cuántos pasaron a Valeria."""
    with db.pool.connection() as c:
        rows = c.execute("SELECT enrichment->'qualifier'->>'grade' g, status, count(*) n FROM prospects WHERE tenant=%s AND enrichment ? 'qualifier' GROUP BY 1, 2", (slug,)).fetchall()
    grades, passed = {}, 0
    for r in rows:
        grades[r["g"]] = grades.get(r["g"], 0) + r["n"]
        if r["status"] == "imported":
            passed += r["n"]
    return {"grades": grades, "passed": passed}


def save(slug: str, body: dict) -> dict:
    new = {"enabled": bool(body.get("enabled", True)), "min_grade": body.get("min_grade") if body.get("min_grade") in ("A", "B", "C") else "B",
           "daily_pass": max(1, min(50, int(body.get("daily_pass") or 5))), "rules": str(body.get("rules") or "").strip()[:3000]}
    with db.pool.connection() as c:
        c.execute("UPDATE tenants SET settings = jsonb_set(COALESCE(settings,'{}'::jsonb), '{qualifier}', %s::jsonb, true) WHERE slug=%s", (json.dumps(new), slug))
    return new
