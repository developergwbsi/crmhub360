"""Biblioteca de propuestas, brochures y presentaciones que los agentes comparten con los prospectos (como enlace a una página pública).
Cada empresa tiene las suyas (tabla proposals) y puede activarlas o apagarlas; el comercial virtual recibe el catálogo en su prompt y envía el enlace que corresponde.
Reglas de contenido: sin precios, sin promesas de resultados, sin testimonios ni cifras inventadas. Las páginas son HTML autocontenido con ilustraciones SVG (sin recursos externos).
Se sirven en https://<MEET_HOST>/p/<empresa>/<slug> (ver main.py: /v1/public/meet/p/...)."""
import html as _h
import os

from . import db

SCHEMA = """
CREATE TABLE IF NOT EXISTS proposals (
    tenant TEXT NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL, product TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'brochure', summary TEXT NOT NULL DEFAULT '',
    html TEXT NOT NULL DEFAULT '', active BOOLEAN NOT NULL DEFAULT true, views INT NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (tenant, slug));
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS ext_url TEXT NOT NULL DEFAULT '';
"""


def ensure_schema() -> None:
    with db.pool.connection() as c:
        c.execute(SCHEMA)


def url(tenant: str, slug: str) -> str:
    return f"https://{os.environ.get('MEET_HOST', '')}/p/{tenant}/{slug}"


def catalog(tenant: str) -> list[dict]:
    with db.pool.connection() as c:
        rows = c.execute("SELECT slug, title, product, kind, summary, ext_url FROM proposals WHERE tenant=%s AND active ORDER BY (product='crm_hub_360') DESC, slug", (tenant,)).fetchall()
    return [{**dict(r), "url": r["ext_url"] or url(tenant, r["slug"])} for r in rows]


def listing(tenant: str) -> list[dict]:
    with db.pool.connection() as c:
        rows = c.execute("SELECT slug, title, product, kind, summary, active, views, ext_url, updated_at FROM proposals WHERE tenant=%s ORDER BY (product='crm_hub_360') DESC, slug", (tenant,)).fetchall()
    return [{**dict(r), "updated_at": r["updated_at"].isoformat(), "own": bool(r["ext_url"]), "url": r["ext_url"] or url(tenant, r["slug"])} for r in rows]


def _slugify(t: str) -> str:
    import re, unicodedata
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")[:50] or "material"


def create_link(tenant: str, title: str, product: str, kind: str, summary: str, link: str) -> str:
    """Material propio de la empresa: un enlace (PDF, página, video) que los agentes pueden enviar. Solo http(s) públicos."""
    import re
    if not re.match(r"^https://[^\s]{4,500}$", link or ""):
        raise ValueError("El enlace debe empezar por https:// y ser público.")
    from . import httpgen
    try:
        httpgen.check_url(link)
    except Exception:
        raise ValueError("Ese enlace apunta a una dirección interna o no es válido.")
    base = _slugify(title); slug, n = base, 2
    with db.pool.connection() as c:
        while c.execute("SELECT 1 FROM proposals WHERE tenant=%s AND slug=%s", (tenant, slug)).fetchone():
            slug = f"{base}-{n}"; n += 1
        c.execute("INSERT INTO proposals (tenant, slug, title, product, kind, summary, html, ext_url) VALUES (%s,%s,%s,%s,%s,%s,'',%s)", (tenant, slug, title[:120], product[:40], kind[:30] or "enlace", summary[:300], link))
    return slug


def update_meta(tenant: str, slug: str, title: str, product: str, kind: str, summary: str, link: str | None) -> bool:
    with db.pool.connection() as c:
        row = c.execute("SELECT ext_url FROM proposals WHERE tenant=%s AND slug=%s", (tenant, slug)).fetchone()
        if not row:
            return False
        ext = row["ext_url"]
        if row["ext_url"] and link:
            import re
            if not re.match(r"^https://[^\s]{4,500}$", link):
                raise ValueError("El enlace debe empezar por https://")
            ext = link
        c.execute("UPDATE proposals SET title=%s, product=%s, kind=%s, summary=%s, ext_url=%s, updated_at=now() WHERE tenant=%s AND slug=%s", (title[:120], product[:40], kind[:30], summary[:300], ext, tenant, slug))
    return True


def delete(tenant: str, slug: str) -> bool:
    with db.pool.connection() as c:
        return c.execute("DELETE FROM proposals WHERE tenant=%s AND slug=%s", (tenant, slug)).rowcount > 0


def catalog_text(tenant: str) -> str:
    """Bloque del prompt del comercial virtual: qué material puede enviar y cuándo."""
    cat = catalog(tenant)
    if not cat:
        return ""
    lines = "\n".join(f"- {c['title']} ({c['kind']}): {c['url']} — {c['summary']}" for c in cat)
    return ("\n\nMATERIAL QUE PUEDES COMPARTIR (usa SOLO estos enlaces, tal cual; no inventes otros):\n" + lines +
            "\nCuándo usarlo: en el PRIMER correo incluye SIEMPRE el enlace de Crm Hub 360 (es el producto que más se impulsa), con una frase como «Aquí puedes ver cómo funciona». "
            "Si el lead trae un «producto recomendado» distinto (Gestor360, Core360), menciónalo en una frase y puedes añadir su enlace como segundo. "
            "Si pide información, una propuesta o una demo, envía el enlace correspondiente y propón dos horarios para una videollamada de 15 minutos. Nunca des precios ni prometas resultados.")


def get_page(tenant: str, slug: str) -> str | None:
    with db.pool.connection() as c:
        r = c.execute("SELECT html FROM proposals WHERE tenant=%s AND slug=%s AND active AND ext_url=''", (tenant, slug)).fetchone()
        if r:
            c.execute("UPDATE proposals SET views = views + 1 WHERE tenant=%s AND slug=%s", (tenant, slug))
    return r["html"] if r else None


def upsert(tenant: str, slug: str, title: str, product: str, kind: str, summary: str, html: str, active: bool = True) -> None:
    with db.pool.connection() as c:
        c.execute("INSERT INTO proposals (tenant, slug, title, product, kind, summary, html, active) VALUES (%s,%s,%s,%s,%s,%s,%s,%s) "
                  "ON CONFLICT (tenant, slug) DO UPDATE SET title=EXCLUDED.title, product=EXCLUDED.product, kind=EXCLUDED.kind, summary=EXCLUDED.summary, html=EXCLUDED.html, updated_at=now()",
                  (tenant, slug, title, product, kind, summary, html, active))


# ---------------------------------------------------------------- páginas
CSS = """
:root{--a:#4f46e5;--b:#0891b2;--ink:#0f172a;--mut:#475569;--bg:#f8fafc;--card:#fff;--line:#e2e8f0}
*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);background:var(--bg);line-height:1.55}
.wrap{max-width:1040px;margin:0 auto;padding:0 20px}
header.top{display:flex;justify-content:space-between;align-items:center;padding:18px 0}
.brand{font-weight:800;letter-spacing:-.02em;font-size:18px}.brand span{color:var(--a)}
.hero{background:linear-gradient(135deg,#312e81 0%,#4f46e5 45%,#0891b2 100%);color:#fff;border-radius:28px;padding:56px 40px;margin:8px 0 40px;position:relative;overflow:hidden}
.hero:after{content:"";position:absolute;right:-80px;top:-80px;width:320px;height:320px;border-radius:50%;background:rgba(255,255,255,.08)}
.tag{display:inline-block;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.3);padding:4px 12px;border-radius:999px;font-size:12.5px;font-weight:600;margin-bottom:16px}
h1{font-size:clamp(28px,5vw,46px);line-height:1.1;margin:0 0 14px;letter-spacing:-.03em}.hero p{font-size:clamp(16px,2.2vw,19px);max-width:640px;opacity:.95;margin:0 0 26px}
.btn{display:inline-block;background:#fff;color:#312e81;padding:13px 22px;border-radius:12px;font-weight:700;text-decoration:none;margin:0 10px 10px 0}
.btn.alt{background:transparent;color:#fff;border:1.5px solid rgba(255,255,255,.7)}
h2{font-size:clamp(22px,3.4vw,30px);letter-spacing:-.02em;margin:46px 0 8px}.lead{color:var(--mut);max-width:700px;margin:0 0 22px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:20px}.card h3{margin:10px 0 6px;font-size:17px}.card p{margin:0;color:var(--mut);font-size:15px}
.ic{width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,var(--a),var(--b));color:#fff;display:grid;place-items:center;font-weight:800}
.fig{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:14px;margin:16px 0}.fig svg{width:100%;height:auto;display:block}.cap{font-size:13px;color:var(--mut);text-align:center;margin-top:6px}
.steps{counter-reset:s;display:grid;gap:12px}.steps div{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 18px 16px 62px;position:relative}
.steps div:before{counter-increment:s;content:counter(s);position:absolute;left:16px;top:14px;width:34px;height:34px;border-radius:50%;background:var(--a);color:#fff;display:grid;place-items:center;font-weight:800}
.cta{background:linear-gradient(135deg,#0f172a,#312e81);color:#fff;border-radius:24px;padding:40px;margin:46px 0;text-align:center}.cta h2{margin-top:0}.cta .btn{background:#22c55e;color:#052e16}.cta .btn.alt{background:transparent;color:#fff}
footer{color:var(--mut);font-size:13px;text-align:center;padding:20px 0 40px}
.pill{display:inline-block;background:#eef2ff;color:#3730a3;border-radius:999px;padding:3px 10px;font-size:12.5px;font-weight:600;margin:2px 4px 2px 0}
"""


def _shell(company: str, title: str, tag: str, h1: str, sub: str, body: str, wa: str, cta_title: str, cta_text: str) -> str:
    c, wl = _h.escape(company), (f"https://wa.me/{wa}" if wa else "")
    wbtn = f'<a class="btn" href="{wl}">Escríbenos por WhatsApp</a>' if wl else ""
    return (f'<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">'
            f'<title>{_h.escape(title)} · {c}</title><style>{CSS}</style></head><body><div class="wrap">'
            f'<header class="top"><div class="brand">{c}<span>.</span></div></header>'
            f'<section class="hero"><span class="tag">{_h.escape(tag)}</span><h1>{h1}</h1><p>{sub}</p>{wbtn}<a class="btn alt" href="#como">Cómo funciona</a></section>'
            f'{body}<section class="cta"><h2>{cta_title}</h2><p>{cta_text}</p>{wbtn}</section>'
            f'<footer>{c} · Esta presentación es informativa. Si prefieres no recibir más mensajes, usa el enlace de baja de nuestro correo.</footer></div></body></html>')


def _svg_pipeline() -> str:
    cols = [("Nuevo", "#6366f1", 3), ("Contactado", "#0891b2", 2), ("Demo agendada", "#16a34a", 2), ("Propuesta", "#f59e0b", 1)]
    o = '<svg viewBox="0 0 800 300" role="img" aria-label="Tablero de oportunidades"><rect width="800" height="300" rx="14" fill="#f1f5f9"/>'
    for i, (n, col, k) in enumerate(cols):
        x = 16 + i * 194
        o += f'<rect x="{x}" y="16" width="184" height="268" rx="12" fill="#fff" stroke="#e2e8f0"/><rect x="{x}" y="16" width="184" height="30" rx="12" fill="{col}"/><text x="{x + 12}" y="36" fill="#fff" font-size="13" font-weight="700" font-family="sans-serif">{n}</text>'
        for j in range(k):
            y = 58 + j * 74
            o += f'<rect x="{x + 10}" y="{y}" width="164" height="64" rx="10" fill="#f8fafc" stroke="#e2e8f0"/><rect x="{x + 20}" y="{y + 12}" width="90" height="9" rx="4" fill="#cbd5e1"/><rect x="{x + 20}" y="{y + 30}" width="120" height="8" rx="4" fill="#e2e8f0"/><circle cx="{x + 154}" cy="{y + 16}" r="8" fill="{col}" opacity=".85"/>'
    return o + "</svg>"


def _svg_chat() -> str:
    return ('<svg viewBox="0 0 800 330" role="img" aria-label="Conversación atendida por el comercial virtual"><rect width="800" height="330" rx="14" fill="#ecfdf5"/>'
            '<rect x="20" y="20" width="360" height="52" rx="14" fill="#fff"/><text x="36" y="42" font-size="13" font-family="sans-serif" fill="#334155">Hola, ¿tienen forma de ordenar</text><text x="36" y="60" font-size="13" font-family="sans-serif" fill="#334155">el seguimiento de mis clientes?</text>'
            '<rect x="420" y="88" width="360" height="70" rx="14" fill="#bbf7d0"/><text x="436" y="110" font-size="13" font-family="sans-serif" fill="#14532d">Claro. Con Crm Hub 360 todo queda en la ficha</text><text x="436" y="128" font-size="13" font-family="sans-serif" fill="#14532d">de cada cliente. ¿Te muestro en 15 minutos</text><text x="436" y="146" font-size="13" font-family="sans-serif" fill="#14532d">cómo se vería en tu negocio?</text>'
            '<rect x="20" y="172" width="250" height="36" rx="14" fill="#fff"/><text x="36" y="195" font-size="13" font-family="sans-serif" fill="#334155">Sí, ¿qué horarios tienen?</text>'
            '<rect x="420" y="222" width="360" height="86" rx="14" fill="#bbf7d0"/><text x="436" y="244" font-size="13" font-family="sans-serif" fill="#14532d">¿Te sirve mañana a las 10:00 o 15:00?</text><rect x="436" y="258" width="328" height="38" rx="10" fill="#fff"/><text x="450" y="282" font-size="13" font-weight="700" font-family="sans-serif" fill="#166534">Demo agendada · videollamada</text></svg>')


def _svg_motor() -> str:
    nodes = [("Buscador", "Halla empresas\nen internet", "#6366f1"), ("Calificador", "Decide quién\nvale la pena", "#0891b2"), ("Comercial virtual", "Escribe y\ncoordina la agenda", "#16a34a"), ("Tu equipo", "Entra con la\ndemo ya agendada", "#f59e0b")]
    o = '<svg viewBox="0 0 800 210" role="img" aria-label="Motor comercial automático"><rect width="800" height="210" rx="14" fill="#f8fafc"/>'
    for i, (n, d, col) in enumerate(nodes):
        x = 18 + i * 196
        o += f'<rect x="{x}" y="38" width="168" height="130" rx="16" fill="#fff" stroke="{col}" stroke-width="2"/><circle cx="{x + 84}" cy="68" r="16" fill="{col}"/><text x="{x + 84}" y="74" text-anchor="middle" font-size="16" font-weight="800" fill="#fff" font-family="sans-serif">{i + 1}</text><text x="{x + 84}" y="104" text-anchor="middle" font-size="14" font-weight="700" fill="#0f172a" font-family="sans-serif">{n}</text>'
        for k, ln in enumerate(d.split("\n")):
            o += f'<text x="{x + 84}" y="{126 + k * 16}" text-anchor="middle" font-size="12" fill="#475569" font-family="sans-serif">{ln}</text>'
        if i < 3:
            o += f'<path d="M{x + 172} 103 h20" stroke="#94a3b8" stroke-width="2" marker-end="url(#ar)"/>'
    return o + '<defs><marker id="ar" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="#94a3b8"/></marker></defs></svg>'


def _svg_calendar() -> str:
    o = '<svg viewBox="0 0 800 280" role="img" aria-label="Agenda de citas"><rect width="800" height="280" rx="14" fill="#f1f5f9"/><rect x="20" y="20" width="760" height="40" rx="10" fill="#4f46e5"/>'
    for i, d in enumerate(["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]):
        o += f'<text x="{70 + i * 120}" y="46" text-anchor="middle" fill="#fff" font-size="14" font-weight="700" font-family="sans-serif">{d}</text>'
    import random
    rnd = random.Random(7)
    for i in range(6):
        for j in range(4):
            if rnd.random() < .62:
                col = rnd.choice(["#c7d2fe", "#a5f3fc", "#bbf7d0", "#fde68a"])
                o += f'<rect x="{26 + i * 120}" y="{72 + j * 50}" width="108" height="42" rx="8" fill="{col}"/><rect x="{36 + i * 120}" y="{82 + j * 50}" width="60" height="8" rx="4" fill="#fff" opacity=".8"/>'
    return o + "</svg>"


def _svg_chain() -> str:
    nodes = ["Compras", "Inventario", "Producción", "Ventas", "Facturación"]
    o = '<svg viewBox="0 0 800 170" role="img" aria-label="Cadena de abastecimiento"><rect width="800" height="170" rx="14" fill="#f8fafc"/>'
    for i, n in enumerate(nodes):
        x = 20 + i * 154
        o += f'<rect x="{x}" y="46" width="132" height="78" rx="14" fill="#fff" stroke="#6366f1" stroke-width="2"/><text x="{x + 66}" y="92" text-anchor="middle" font-size="14" font-weight="700" fill="#0f172a" font-family="sans-serif">{n}</text>'
        if i < 4:
            o += f'<path d="M{x + 136} 85 h14" stroke="#94a3b8" stroke-width="2"/>'
    return o + "</svg>"


def _cards(items: list[tuple[str, str, str]]) -> str:
    return '<div class="grid">' + "".join(f'<div class="card"><div class="ic">{_h.escape(i)}</div><h3>{_h.escape(t)}</h3><p>{_h.escape(d)}</p></div>' for i, t, d in items) + "</div>"


def default_pages(company: str, wa: str) -> list[dict]:
    """Presentaciones estándar de los productos de DigitalAlliance Hub (sin precios ni promesas de resultado)."""
    crm = (f'<h2>Todo tu proceso de ventas, en un solo lugar</h2><p class="lead">Crm Hub 360 es el CRM en español con inteligencia artificial del portafolio de {_h.escape(company)}: junta a tus clientes, sus conversaciones y tu equipo, y deja que un comercial virtual trabaje por ti las 24 horas.</p>'
           f'<div class="fig">{_svg_pipeline()}<div class="cap">Cada oportunidad avanza por tu embudo, a la vista de todo el equipo.</div></div>'
           + _cards([("1", "WhatsApp, correo, SMS y Telegram", "Las conversaciones con cada cliente quedan en su ficha, con historial, plantillas y respuestas rápidas."),
                     ("2", "Comercial virtual con IA", "Contacta, responde y da seguimiento fuera de horario, y pasa el caso a una persona cuando hace falta."),
                     ("3", "Videollamadas dentro del CRM", "Salas propias con subtítulos y grabación, agendadas desde la misma ficha."),
                     ("4", "Formularios, reportes y tableros", "Capta clientes desde tu web y arma los tableros que cada usuario necesita."),
                     ("5", "Agenda y tareas", "Cada seguimiento tiene fecha y responsable; nada se pierde entre chats."),
                     ("6", "Roles y permisos", "Cada persona ve solo lo que su rol permite. Funciona en el navegador y como app instalable.")])
           + '<h2>El motor que busca clientes por ti</h2><p class="lead">Lo más potente de Crm Hub 360: automatiza el control de tus ventas <b>y la búsqueda de nuevos clientes</b>. Tu equipo entra cuando ya hay una demo agendada.</p>'
           f'<div class="fig">{_svg_motor()}<div class="cap">De la búsqueda a la demo agendada, sin trabajo manual en el camino.</div></div>'
           f'<div class="fig">{_svg_chat()}<div class="cap">El comercial virtual conversa y coordina la agenda con la persona.</div></div>'
           '<p><span class="pill">Respeta horarios legales</span><span class="pill">Baja de un clic</span><span class="pill">Lista de no contactar</span><span class="pill">Topes diarios y frenos automáticos</span></p>'
           '<h2 id="como">Cómo funciona</h2><div class="steps"><div><b>Lo conectas.</b> Tus canales (WhatsApp, correo) y tu equipo entran al CRM.</div><div><b>Lo entrenas.</b> Le cuentas qué vendes y a quién; el comercial virtual aprende tu forma de hablar.</div>'
           '<div><b>Te entrega demos agendadas.</b> El motor busca, califica y conversa; tu equipo se dedica a cerrar.</div></div>')
    gestor = (f'<h2>Tu negocio de servicios, ordenado de punta a punta</h2><p class="lead">Gestor360 reúne agenda, servicios, nómina, inventario y clientes en una sola plataforma, para negocios con una o varias sedes.</p>'
              f'<div class="fig">{_svg_calendar()}<div class="cap">Agenda de citas por sede y por profesional.</div></div>'
              + _cards([("A", "Agenda y trazabilidad", "Citas con estados, lista de tareas y evidencia en fotos que el cliente también puede ver."),
                        ("N", "Nómina e inventario", "Pre-nómina a partir de servicios y ventas, y control de productos con alertas de stock mínimo."),
                        ("F", "Facturación electrónica", "Emisión ante la DIAN desde la factura del servicio, por sede o para toda la empresa."),
                        ("L", "App para tus clientes", "Tus clientes reservan, siguen su cita y reciben avisos en el celular (Listo360)."),
                        ("W", "Mensajería a clientes", "Chat y campañas por WhatsApp, correo y SMS desde la misma plataforma."),
                        ("S", "Varias sedes", "Una base única de clientes y reportes por sede o acumulados.")])
              + '<h2 id="como">Pensado para</h2><p><span class="pill">Salud y belleza</span><span class="pill">Automotriz</span><span class="pill">Pastelerías</span><span class="pill">Mecánica</span><span class="pill">Autolavados</span></p>'
              '<p class="lead">Y junto con <b>Crm Hub 360</b>, además de ordenar tu operación, consigues clientes nuevos y los atiendes automáticamente.</p>')
    core = (f'<h2>El ERP para fabricar y distribuir</h2><p class="lead">Core360 es la plataforma de gestión empresarial de {_h.escape(company)} para manufactura y distribución: toda la cadena de abastecimiento en un solo sistema.</p>'
            f'<div class="fig">{_svg_chain()}<div class="cap">De la compra a la factura, con una única fuente de verdad.</div></div>'
            + _cards([("C", "Compras", "Requisiciones, órdenes con aprobación, recepción contra la orden y alertas de reposición."),
                      ("I", "Inventarios y almacenes", "Existencias por almacén, ubicación y lote, con valoración FIFO o costo promedio y control de vencimientos."),
                      ("P", "Producción", "Listas de materiales, órdenes de producción con consumo de componentes y planeación de materiales (MRP)."),
                      ("V", "Ventas y distribución", "Cotizaciones, pedidos con reserva de stock, entregas y seguimiento de envíos."),
                      ("F", "Finanzas y facturación electrónica", "Cuentas por cobrar y pagar, libro mayor y factura electrónica ante la DIAN."),
                      ("A", "Conexión con otras plataformas", "API con llaves y webhooks firmados para integrarlo con tus sistemas.")])
            + '<h2 id="como">Se contrata por módulos</h2><p class="lead">Empiezas con la base y sumas lo que necesitas: calidad, mantenimiento o proyectos son módulos opcionales. Y con <b>Crm Hub 360</b> conectas tu operación con la búsqueda y atención de clientes.</p>')
    return [
        {"slug": "crm-hub-360", "title": "Crm Hub 360: tu CRM con IA que busca y atiende clientes", "product": "crm_hub_360", "kind": "presentación",
         "summary": "Presentación del CRM con comercial virtual y motor que busca clientes (producto principal).",
         "html": _shell(company, "Crm Hub 360", "El motor más inteligente del portafolio", "Tu CRM con IA que <u>busca</u>, atiende y agenda clientes", "Automatiza el control de tus ventas y la búsqueda de nuevos clientes. Tu equipo entra cuando ya hay una demo agendada.", crm, wa, "Mira cómo se vería en tu negocio", "Agenda una demostración de 15 minutos por videollamada, sin compromiso.")},
        {"slug": "gestor360", "title": "Gestor360: agenda, nómina, inventario y facturación", "product": "gestor360", "kind": "presentación",
         "summary": "Plataforma para negocios de servicios con sedes (salud y belleza, automotriz, autolavados…).",
         "html": _shell(company, "Gestor360", "Para negocios de servicios", "Toda tu operación de servicios en <u>una sola plataforma</u>", "Agenda, servicios, nómina, inventario y clientes. Paga solo los módulos que necesitas.", gestor, wa, "Conoce Gestor360", "Agenda una demostración de 15 minutos por videollamada, sin compromiso.")},
        {"slug": "core360", "title": "Core360: ERP para manufactura y distribución", "product": "core360", "kind": "presentación",
         "summary": "ERP con compras, inventarios, producción, ventas, finanzas y facturación electrónica.",
         "html": _shell(company, "Core360", "ERP para manufactura y distribución", "Toda tu cadena de abastecimiento, <u>bajo control</u>", "Compras, inventarios, producción, ventas y facturación electrónica en un solo sistema.", core, wa, "Conoce Core360", "Agenda una demostración de 15 minutos por videollamada, sin compromiso.")},
    ]


def seed_defaults(tenant: str, company: str, wa: str) -> int:
    n = 0
    for p in default_pages(company, wa):
        upsert(tenant, p["slug"], p["title"], p["product"], p["kind"], p["summary"], p["html"]); n += 1
    return n
