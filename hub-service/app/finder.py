"""Buscador de prospectos («buscador_<empresa>»): investiga en internet, a partir de lo que la empresa vende (cliente ideal + catálogo), empresas que podrían necesitarlo
y deja en Prospectos (origen «finder») solo lo que tiene una fuente pública verificable. Reglas: nunca se adivinan correos; solo datos de contacto de negocio publicados
por la propia empresa o un directorio; los correos personales (gmail, hotmail…) se descartan; cada prospecto guarda la dirección donde se halló.
Los hallados NUNCA salen por WhatsApp/SMS ni por el proveedor de correo transaccional (Resend): solo por un remitente aparte y con aprobación de una persona (agent._deliver).
Configuración: settings.finder = {enabled, daily_limit, focus, last_run}. Licencia: settings.limits.finder."""
import json
import logging
import re
from datetime import datetime, timezone

from . import compliance, db, llm, prospects

log = logging.getLogger("hub.finder")
FREE_MAIL = {"gmail.com", "googlemail.com", "hotmail.com", "outlook.com", "live.com", "yahoo.com", "yahoo.es", "icloud.com", "msn.com", "proton.me", "protonmail.com"}
SCHEMA = {"type": "object", "properties": {"candidates": {"type": "array", "items": {"type": "object", "properties": {
    "company": {"type": "string"}, "website": {"type": "string"}, "sector": {"type": "string", "description": "sector en 1 a 3 palabras"}, "city": {"type": "string"},
    "contact_name": {"type": "string", "description": "solo si la fuente lo publica; si no, vacío"}, "contact_title": {"type": "string"},
    "email": {"type": "string", "description": "correo de negocio publicado en la fuente, tal cual; vacío si no aparece. NUNCA lo deduzcas"},
    "phone": {"type": "string", "description": "teléfono publicado en la fuente; vacío si no aparece"},
    "source_url": {"type": "string", "description": "dirección exacta donde aparece el dato de contacto"},
    "why": {"type": "string", "description": "una frase: por qué necesitaría lo que vendemos"}},
    "required": ["company", "source_url", "why"]}}}, "required": ["candidates"]}


def config(tenant: dict) -> dict:
    f = ((tenant.get("settings") or {}).get("finder") or {})
    return {"enabled": bool(f.get("enabled")), "daily_limit": max(1, min(100, int(f.get("daily_limit") or 20))), "focus": str(f.get("focus") or "")[:600], "last_run": f.get("last_run")}


def licensed(tenant: dict) -> bool:
    return bool((((tenant.get("settings") or {}).get("limits") or {}).get("finder")))


def _save(slug: str, patch: dict) -> None:
    with db.pool.connection() as c:
        c.execute("UPDATE tenants SET settings = jsonb_set(COALESCE(settings,'{}'::jsonb), '{finder}', COALESCE(settings->'finder','{}'::jsonb) || %s::jsonb, true) WHERE slug=%s", (json.dumps(patch), slug))


def _brief(tenant: dict, cfg: dict, n: int, already: list[str]) -> str:
    icp = prospects.icp(tenant)
    ag = ((tenant.get("settings") or {}).get("agents") or [{}])[0].get("config") or (tenant.get("settings") or {}).get("agent") or {}
    co = ag.get("company") or {}
    return (f"EMPRESA QUE VENDE: {tenant.get('name')}\n{co.get('about', '')}\n\nLO QUE OFRECE:\n{co.get('services', '')}\n\nCLIENTE IDEAL: {icp['describe']}\n"
            f"Sectores: {', '.join(icp['industries'])}\nPaíses: {', '.join(icp['countries']) or 'cualquiera'}\nCargos que deciden: {', '.join(icp['titles'])}\n"
            f"{('ENFOQUE DE ESTA BÚSQUEDA: ' + cfg['focus']) if cfg['focus'] else ''}\n\n"
            f"TAREA: busca en internet hasta {n} empresas reales que encajen y que NO estén en esta lista de ya conocidas: {', '.join(already[:80]) or '(ninguna)'}.\n"
            "Para cada una entrega el correo o teléfono de NEGOCIO que ella misma publica (su sitio web, página de contacto o un directorio público) y la dirección exacta de esa fuente. "
            "Reglas estrictas: no adivines ni construyas correos (nada de nombre@dominio supuesto); no uses correos personales; si una empresa no publica contacto, omítela; "
            "no incluyas datos de personas naturales que no sean la cara pública del negocio.")


async def run(tenant: dict, limit: int | None = None) -> dict:
    """Una pasada de búsqueda: investiga, valida y guarda los prospectos «ready». No promueve ni envía nada."""
    slug, cfg = tenant["slug"], config(tenant)
    if not licensed(tenant):
        raise PermissionError("El buscador no está activo en la licencia de esta empresa.")
    n = max(1, min(limit or cfg["daily_limit"], cfg["daily_limit"]))
    with db.pool.connection() as c:
        today = c.execute("SELECT count(*) n FROM prospects WHERE tenant=%s AND origin='finder' AND created_at::date = current_date", (slug,)).fetchone()["n"]
        known = [r["company"] for r in c.execute("SELECT DISTINCT company FROM prospects WHERE tenant=%s AND company <> '' ORDER BY company LIMIT 200", (slug,)).fetchall()]
    room = max(0, cfg["daily_limit"] - today)
    if room == 0:
        return {"found": 0, "ready": 0, "rejected": 0, "reason": "Se alcanzó el tope diario del buscador."}
    n = min(n, room)
    report = await llm.web_search(tenant, "Eres un investigador comercial riguroso. Solo reportas lo que verificaste en una página pública y siempre citas su dirección. Respondes en español.",
                                  _brief(tenant, cfg, n, known), max_uses=min(10, 2 + n // 2))
    d = await llm.chat_json(tenant, "Extraes datos de un informe de investigación a JSON. Copia solo lo que el informe afirma, con su dirección de fuente; no inventes ni completes datos.",
                            f"INFORME:\n{report[:12000]}", SCHEMA, 3000)
    rows, dropped = [], 0
    for c in (d.get("candidates") or [])[:n]:
        src, email, phone = str(c.get("source_url") or "").strip(), str(c.get("email") or "").strip().lower(), str(c.get("phone") or "").strip()
        if not re.match(r"^https?://", src):
            dropped += 1; continue
        if email and email.partition("@")[2] in FREE_MAIL:
            email = ""   # correo personal: no se usa en frío
        if not email and not phone:
            dropped += 1; continue
        rows.append({"nombre": str(c.get("contact_name") or "")[:120] or c.get("company"), "empresa": c.get("company"), "cargo": c.get("contact_title") or "", "correo": email, "telefono": phone, "pais": "",
                     "sector": c.get("sector") or "", "fuente_url": src[:300], "sitio": str(c.get("website") or "")[:200], "por_que": str(c.get("why") or "")[:300], "ciudad": str(c.get("city") or "")[:80]})
    batch = datetime.now(timezone.utc).strftime("buscador-%Y%m%d-%H%M")
    res = await prospects.import_rows(tenant, rows, batch=batch) if rows else {"batch": batch, "received": 0, "ready": 0, "rejected": 0, "reasons": {}}
    with db.pool.connection() as c:
        c.execute("UPDATE prospects SET origin='finder' WHERE tenant=%s AND batch=%s", (slug, batch))
    _save(slug, {"last_run": {"at": datetime.now(timezone.utc).isoformat(), "found": len(d.get("candidates") or []), "ready": res["ready"], "batch": batch}})
    await prospects.enrich_pending(tenant, limit=n)
    return {"found": len(d.get("candidates") or []), "dropped_no_source_or_contact": dropped, **res}
