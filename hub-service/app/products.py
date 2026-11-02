"""Catálogo de productos de la empresa: lo que ofrece (nombre, qué es, para quién, beneficios, cuándo NO ofrecerlo y su material de apoyo).
Es la fuente de verdad de la oferta: el comercial virtual lo recibe siempre en su prompt, el calificador elige de aquí el producto de cada prospecto, y las
propuestas y brochures se enlazan a un producto (proposals.product = slug). `lead_products` deja el rastro de qué producto se ofreció o compró cada cliente.
Sin precios en el catálogo: los precios y condiciones los da una persona."""
import re
import unicodedata

from . import db

SCHEMA = """
CREATE TABLE IF NOT EXISTS products (
    tenant TEXT NOT NULL, slug TEXT NOT NULL, name TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', for_whom TEXT NOT NULL DEFAULT '', benefits TEXT NOT NULL DEFAULT '',
    avoid TEXT NOT NULL DEFAULT '', main BOOLEAN NOT NULL DEFAULT FALSE, active BOOLEAN NOT NULL DEFAULT TRUE, sort INT NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (tenant, slug));
CREATE TABLE IF NOT EXISTS lead_products (
    id SERIAL PRIMARY KEY, tenant TEXT NOT NULL, lead_id TEXT NOT NULL, slug TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'offered', note TEXT NOT NULL DEFAULT '',
    at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS lead_products_lead ON lead_products (tenant, lead_id, at DESC);
CREATE INDEX IF NOT EXISTS lead_products_slug ON lead_products (tenant, slug, status);
"""
STATUSES = {"offered": "Ofrecido", "interested": "Interesado", "won": "Compró", "lost": "No compró"}

DEFAULTS = [
    {"slug": "crm_hub_360", "name": "Crm Hub 360", "main": True, "sort": 10,
     "summary": "CRM en español con inteligencia artificial: ordena a los clientes, atiende por todos los canales (WhatsApp, correo, SMS, llamadas), tiene un equipo de agentes de IA que busca clientes nuevos y agenda demos, lee documentos y trae su propio módulo de reuniones.",
     "for_whom": "Casi cualquier empresa que venda o atienda clientes y tenga el seguimiento disperso (WhatsApp, correo, Excel).",
     "benefits": "Un solo lugar para todas las conversaciones; el motor busca y califica prospectos; el equipo entra cuando ya hay una demo agendada.",
     "avoid": "Entidades públicas, personas naturales y otros CRM (competidores)."},
    {"slug": "gestor360", "name": "Gestor360", "main": False, "sort": 20,
     "summary": "Plataforma de gestión para negocios de servicios y ventas: agenda y turnos, servicios y productos, inventario, nómina por comisión, cotizaciones, facturación electrónica y una app para los clientes (Listo360), con chatbots configurables.",
     "for_whom": "Negocios de servicios o ventas con sedes: vehículos (mantenimiento y lavado), salud y belleza, panaderías, ferreterías y otras líneas.",
     "benefits": "Toda la operación (agenda, inventario, nómina, factura) en una sola plataforma hecha a la medida de la línea de negocio.",
     "avoid": "Empresas que no atienden clientes con citas o ventas en sedes."},
    {"slug": "core360", "name": "Core360", "main": False, "sort": 30,
     "summary": "ERP para manufactura y distribución: compras, materias primas e inventarios, producción (listas de materiales, MRP), ventas y distribución, calidad, mantenimiento, facturación electrónica y planta conectada en tiempo real.",
     "for_whom": "Empresas que fabrican o distribuyen y sufren con inventarios, producción o compras.",
     "benefits": "Toda la cadena de abastecimiento bajo control, de la compra de materia prima a la factura, con la planta conectada.",
     "avoid": "Negocios que no fabrican ni distribuyen."},
]


def ensure_schema() -> None:
    with db.pool.connection() as c:
        c.execute(SCHEMA)


def _slugify(t: str) -> str:
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "_", t).strip("_")[:40] or "producto"


def listing(tenant: str) -> list[dict]:
    with db.pool.connection() as c:
        rows = c.execute("SELECT * FROM products WHERE tenant=%s ORDER BY main DESC, sort, name", (tenant,)).fetchall()
        mats = c.execute("SELECT product, count(*) n FROM proposals WHERE tenant=%s AND active GROUP BY product", (tenant,)).fetchall()
        sold = c.execute("SELECT slug, status, count(DISTINCT lead_id) n FROM lead_products WHERE tenant=%s GROUP BY slug, status", (tenant,)).fetchall()
    m = {r["product"]: r["n"] for r in mats}
    st: dict[str, dict] = {}
    for r in sold:
        st.setdefault(r["slug"], {})[r["status"]] = r["n"]
    return [{**{k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in dict(r).items()}, "materials": m.get(r["slug"], 0), "stats": st.get(r["slug"], {})} for r in rows]


def save(tenant: str, d: dict) -> str:
    name = str(d.get("name") or "").strip()[:80]
    if not name:
        raise ValueError("Escribe el nombre del producto.")
    summary = str(d.get("summary") or "").strip()[:600]
    if len(summary) < 10:
        raise ValueError("Cuenta en una o dos frases qué es el producto: es lo que el agente usa para ofrecerlo.")
    slug = re.sub(r"[^a-z0-9_]", "", str(d.get("slug") or ""))[:40]
    vals = (name, summary, str(d.get("for_whom") or "").strip()[:400], str(d.get("benefits") or "").strip()[:500], str(d.get("avoid") or "").strip()[:300], bool(d.get("main")), bool(d.get("active", True)))
    with db.pool.connection() as c:
        if slug and c.execute("SELECT 1 FROM products WHERE tenant=%s AND slug=%s", (tenant, slug)).fetchone():
            c.execute("UPDATE products SET name=%s, summary=%s, for_whom=%s, benefits=%s, avoid=%s, main=%s, active=%s, updated_at=now() WHERE tenant=%s AND slug=%s", (*vals, tenant, slug))
        else:
            base = slug or _slugify(name); slug, n = base, 2
            while c.execute("SELECT 1 FROM products WHERE tenant=%s AND slug=%s", (tenant, slug)).fetchone():
                slug = f"{base}_{n}"; n += 1
            c.execute("INSERT INTO products (tenant, slug, name, summary, for_whom, benefits, avoid, main, active) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)", (tenant, slug, *vals))
        if vals[5]:   # un solo producto principal
            c.execute("UPDATE products SET main=false WHERE tenant=%s AND slug<>%s", (tenant, slug))
    return slug


def delete(tenant: str, slug: str) -> bool:
    with db.pool.connection() as c:
        return c.execute("DELETE FROM products WHERE tenant=%s AND slug=%s", (tenant, slug)).rowcount > 0


def seed_defaults(tenant: str) -> int:
    """Carga los productos estándar de DigitalAlliance Hub (solo los que falten)."""
    n = 0
    with db.pool.connection() as c:
        for p in DEFAULTS:
            n += c.execute("INSERT INTO products (tenant, slug, name, summary, for_whom, benefits, avoid, main, sort) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                           (tenant, p["slug"], p["name"], p["summary"], p["for_whom"], p["benefits"], p["avoid"], p["main"], p["sort"])).rowcount
    return n


def active(tenant: str) -> list[dict]:
    with db.pool.connection() as c:
        return [dict(r) for r in c.execute("SELECT * FROM products WHERE tenant=%s AND active ORDER BY main DESC, sort, name", (tenant,)).fetchall()]


def names(tenant: str) -> dict[str, str]:
    return {p["slug"]: p["name"] for p in active(tenant)}


def prompt_text(tenant: str) -> str:
    """Bloque del prompt del comercial virtual y del calificador: lo que la empresa ofrece, siempre presente."""
    ps = active(tenant)
    if not ps:
        return ""
    lines = []
    for p in ps:
        l = f"- {p['name']}{' (PRODUCTO PRINCIPAL: el que más se impulsa)' if p['main'] else ''}: {p['summary']}"
        if p["for_whom"]:
            l += f" Para quién: {p['for_whom']}"
        if p["benefits"]:
            l += f" Beneficios: {p['benefits']}"
        if p["avoid"]:
            l += f" NO lo ofrezcas a: {p['avoid']}"
        lines.append(l)
    return ("\n\nPRODUCTOS QUE OFRECE LA EMPRESA (ofrece SOLO estos; no inventes productos, funciones, precios ni plazos; si preguntan por algo que no está aquí, di que lo consultas con el equipo):\n"
            + "\n".join(lines))


def mark(tenant: str, lead_id: str, slug: str, status: str = "offered", note: str = "") -> None:
    """Deja el rastro del producto de un cliente: ofrecido, interesado, compró o no compró. No repite un mismo estado seguido."""
    if not (lead_id and slug) or status not in STATUSES:
        return
    with db.pool.connection() as c:
        last = c.execute("SELECT slug, status FROM lead_products WHERE tenant=%s AND lead_id=%s ORDER BY at DESC, id DESC LIMIT 1", (tenant, lead_id)).fetchone()
        if last and last["slug"] == slug and last["status"] == status:
            return
        c.execute("INSERT INTO lead_products (tenant, lead_id, slug, status, note) VALUES (%s,%s,%s,%s,%s)", (tenant, lead_id, slug, status, note[:300]))


def of_lead(tenant: str, lead_id: str) -> list[dict]:
    with db.pool.connection() as c:
        rows = c.execute("SELECT lp.slug, lp.status, lp.note, lp.at, COALESCE(p.name, lp.slug) AS name FROM lead_products lp LEFT JOIN products p ON p.tenant=lp.tenant AND p.slug=lp.slug WHERE lp.tenant=%s AND lp.lead_id=%s ORDER BY lp.at DESC, lp.id DESC", (tenant, lead_id)).fetchall()
    return [{**dict(r), "at": r["at"].isoformat(), "label": STATUSES.get(r["status"], r["status"])} for r in rows]
