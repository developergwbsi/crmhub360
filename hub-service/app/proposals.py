"""Biblioteca de propuestas, brochures y presentaciones que los agentes comparten con los prospectos (como enlace a una página pública).
Cada empresa tiene las suyas (tabla proposals) y puede activarlas o apagarlas; el comercial virtual recibe el catálogo en su prompt y envía el enlace que corresponde.
Reglas de contenido: sin precios, sin promesas de resultados, sin testimonios ni cifras inventadas. Las páginas son HTML autocontenido con ilustraciones SVG (sin recursos externos).
Se sirven en https://<MEET_HOST>/p/<empresa>/<slug> (ver main.py: /v1/public/meet/p/...)."""
import base64
import html as _h
import os

from . import brand, db

SCHEMA = """
CREATE TABLE IF NOT EXISTS proposals (
    tenant TEXT NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL, product TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'brochure', summary TEXT NOT NULL DEFAULT '',
    html TEXT NOT NULL DEFAULT '', active BOOLEAN NOT NULL DEFAULT true, views INT NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (tenant, slug));
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS ext_url TEXT NOT NULL DEFAULT '';
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS pdf BYTEA;
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
        rows = c.execute("SELECT slug, title, product, kind, summary, active, views, ext_url, updated_at, (pdf IS NOT NULL) AS has_pdf FROM proposals WHERE tenant=%s ORDER BY (product='crm_hub_360') DESC, slug", (tenant,)).fetchall()
    return [{**dict(r), "updated_at": r["updated_at"].isoformat(), "own": bool(r["ext_url"]), "url": r["ext_url"] or url(tenant, r["slug"]),
             "pdf_url": (url(tenant, r["slug"]) + ".pdf") if r["has_pdf"] else ""} for r in rows]


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
            "\nCuándo usarlo: en el PRIMER correo incluye UN SOLO enlace de material (menos enlaces llegan mejor): si la ficha trae «Oferta indicada por el equipo», el de ese producto; si no, el de Crm Hub 360, el que más se impulsa. "
            "Preséntalo con una frase como «Aquí puedes ver cómo funciona». Si el lead trae un «producto recomendado» distinto, menciónalo en una frase SIN enlace. El PDF del material se adjunta solo; no digas que lo enviarás aparte. "
            "Si la persona pide información, una propuesta o una demo, envía el enlace correspondiente y propón dos horarios para una videollamada de 15 minutos. Nunca des precios ni prometas resultados.")


NBSP = "\u00a0"


def nb(text: str, name: str) -> str:
    """El nombre de la empresa nunca se parte en dos líneas: sus espacios pasan a espacios duros (no se separan al ajustar el texto)."""
    return text.replace(name, name.replace(" ", NBSP)) if name and " " in name else text


def make_pdf(html: str) -> bytes | None:
    """HTML → PDF con WeasyPrint (None si la librería no está disponible)."""
    try:
        import weasyprint
        return weasyprint.HTML(string=html).write_pdf()
    except Exception:
        import logging
        logging.getLogger("hub.proposals").exception("no se pudo generar el PDF")
        return None


def get_pdf(tenant: str, slug: str) -> bytes | None:
    with db.pool.connection() as c:
        r = c.execute("SELECT pdf FROM proposals WHERE tenant=%s AND slug=%s AND active AND pdf IS NOT NULL", (tenant, slug)).fetchone()
    return bytes(r["pdf"]) if r and r["pdf"] else None


MAX_ATTACH = 2          # PDF por correo
MAX_ATTACH_BYTES = 4_000_000


def attachments_for(tenant: str, text: str) -> list[dict]:
    """PDF de los materiales cuyo enlace va en el mensaje (el correo lleva el enlace y también el PDF adjunto)."""
    out, total = [], 0
    with db.pool.connection() as c:
        rows = c.execute("SELECT slug, title, pdf FROM proposals WHERE tenant=%s AND active AND pdf IS NOT NULL AND ext_url='' ORDER BY (product='crm_hub_360') DESC, slug", (tenant,)).fetchall()
    for r in rows:
        if url(tenant, r["slug"]) in (text or "") and len(out) < MAX_ATTACH and total + len(r["pdf"]) <= MAX_ATTACH_BYTES:
            out.append({"name": _slugify(r["title"].split(":")[0]) + ".pdf", "bytes": bytes(r["pdf"])}); total += len(r["pdf"])
    return out


def get_page(tenant: str, slug: str) -> str | None:
    with db.pool.connection() as c:
        r = c.execute("SELECT html FROM proposals WHERE tenant=%s AND slug=%s AND active AND ext_url=''", (tenant, slug)).fetchone()
        if r:
            c.execute("UPDATE proposals SET views = views + 1 WHERE tenant=%s AND slug=%s", (tenant, slug))
    return r["html"] if r else None


def upsert(tenant: str, slug: str, title: str, product: str, kind: str, summary: str, html: str, active: bool = True, pdf: bytes | None = None) -> None:
    with db.pool.connection() as c:
        c.execute("INSERT INTO proposals (tenant, slug, title, product, kind, summary, html, active, pdf) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) "
                  "ON CONFLICT (tenant, slug) DO UPDATE SET title=EXCLUDED.title, product=EXCLUDED.product, kind=EXCLUDED.kind, summary=EXCLUDED.summary, html=EXCLUDED.html, pdf=EXCLUDED.pdf, updated_at=now()",
                  (tenant, slug, title, product, kind, summary, html, active, pdf))


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
.fig{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:14px;margin:16px 0}.fig svg{width:100%;height:auto;display:block}.fig img.wide{max-width:100%;border:1px solid var(--line)}.fig img{width:100%;max-width:620px;height:auto;display:block;margin:0 auto;border-radius:14px}.phones{text-align:center;margin:16px 0 4px}.phones img{display:inline-block;vertical-align:top;width:31%;max-width:230px;margin:0 1%;border:1px solid var(--line);border-radius:16px}.cap{font-size:13px;color:var(--mut);text-align:center;margin-top:6px}
.steps{counter-reset:s;display:grid;gap:12px}.steps div{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 18px 16px 62px;position:relative}
.steps div:before{counter-increment:s;content:counter(s);position:absolute;left:16px;top:14px;width:34px;height:34px;border-radius:50%;background:var(--a);color:#fff;display:grid;place-items:center;font-weight:800}
.cta{background:linear-gradient(135deg,#0f172a,#312e81);color:#fff;border-radius:24px;padding:40px;margin:46px 0;text-align:center}.cta h2{margin-top:0}.cta .btn{background:#22c55e;color:#052e16}.cta .btn.alt{background:transparent;color:#fff}
footer{color:var(--mut);font-size:13px;text-align:center;padding:20px 0 40px}
.pill{display:inline-block;background:#eef2ff;color:#3730a3;border-radius:999px;padding:3px 10px;font-size:12.5px;font-weight:600;margin:2px 4px 2px 0}
"""


def _shell(company: str, title: str, tag: str, h1: str, sub: str, body: str, wa: str, cta_title: str, cta_text: str) -> str:
    c, wl = _h.escape(company), (f"https://wa.me/{wa}" if wa else "")
    wbtn = f'<a class="btn" href="{wl}">Escríbenos por WhatsApp</a>' if wl else ""
    return (f'<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">{brand.link_tags()}'
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



def _svg_docs() -> str:
    o = '<svg viewBox="0 0 800 250" role="img" aria-label="Lectura de documentos con IA"><rect width="800" height="250" rx="14" fill="#f8fafc"/>'
    o += '<rect x="40" y="30" width="150" height="190" rx="10" fill="#fff" stroke="#cbd5e1"/><rect x="58" y="52" width="80" height="10" rx="5" fill="#94a3b8"/>'
    for i in range(7):
        o += f'<rect x="58" y="{78 + i * 18}" width="{114 - (i % 3) * 22}" height="7" rx="3" fill="#e2e8f0"/>'
    o += '<text x="115" y="238" text-anchor="middle" font-size="12" fill="#475569" font-family="sans-serif">PDF: buró, cédula, soportes…</text>'
    o += '<path d="M210 125 h70" stroke="#6366f1" stroke-width="3" marker-end="url(#ar2)"/><circle cx="300" cy="125" r="30" fill="#6366f1"/><text x="300" y="131" text-anchor="middle" fill="#fff" font-size="16" font-weight="800" font-family="sans-serif">IA</text>'
    o += '<path d="M340 125 h60" stroke="#6366f1" stroke-width="3" marker-end="url(#ar2)"/>'
    o += '<rect x="420" y="30" width="340" height="190" rx="12" fill="#fff" stroke="#c7d2fe"/><text x="440" y="56" font-size="13" font-weight="700" fill="#3730a3" font-family="sans-serif">Datos encontrados · tú los revisas</text>'
    for i, (k, w) in enumerate([("Nombre", 150), ("Documento", 120), ("Ingresos", 100), ("Fecha", 90), ("Resumen", 200)]):
        y = 78 + i * 28
        o += f'<text x="440" y="{y + 12}" font-size="12" fill="#64748b" font-family="sans-serif">{k}</text><rect x="540" y="{y}" width="{w}" height="16" rx="5" fill="#eef2ff"/><circle cx="740" cy="{y + 8}" r="7" fill="#22c55e"/>'
    return o + '<defs><marker id="ar2" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="#6366f1"/></marker></defs></svg>'


def _svg_agents() -> str:
    ag = [("Buscador", "Halla empresas en internet", "#6366f1"), ("Calificador", "Decide a quién vale la pena", "#0891b2"), ("Comercial virtual", "Escribe, responde y agenda", "#16a34a"), ("Asistente", "Resume y redacta en la ficha", "#f59e0b")]
    o = '<svg viewBox="0 0 800 220" role="img" aria-label="Equipo de agentes de IA"><rect width="800" height="220" rx="14" fill="#f8fafc"/>'
    for i, (n, d, col) in enumerate(ag):
        x = 18 + i * 196
        o += f'<rect x="{x}" y="28" width="172" height="164" rx="16" fill="#fff" stroke="{col}" stroke-width="2"/><circle cx="{x + 86}" cy="66" r="24" fill="{col}"/><circle cx="{x + 77}" cy="62" r="3.5" fill="#fff"/><circle cx="{x + 95}" cy="62" r="3.5" fill="#fff"/><path d="M{x + 76} 72 q10 8 20 0" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/>'
        o += f'<text x="{x + 86}" y="118" text-anchor="middle" font-size="14" font-weight="700" fill="#0f172a" font-family="sans-serif">{n}</text><text x="{x + 86}" y="140" text-anchor="middle" font-size="11.5" fill="#475569" font-family="sans-serif">{d}</text>'
        o += f'<rect x="{x + 36}" y="158" width="100" height="18" rx="9" fill="{col}" opacity=".14"/><text x="{x + 86}" y="171" text-anchor="middle" font-size="10.5" font-weight="700" fill="{col}" font-family="sans-serif">trabaja contigo</text>'
    return o + "</svg>"


def _svg_channels() -> str:
    ch = [("WhatsApp", "#16a34a"), ("Correo", "#4f46e5"), ("SMS", "#0891b2"), ("Telegram", "#0284c7"), ("Llamadas", "#f59e0b"), ("Videollamada", "#db2777")]
    o = '<svg viewBox="0 0 800 260" role="img" aria-label="Todos los canales en una sola ficha"><rect width="800" height="260" rx="14" fill="#f8fafc"/>'
    for i, (n, col) in enumerate(ch):
        y = 22 + i * 36
        o += f'<rect x="30" y="{y}" width="190" height="28" rx="14" fill="#fff" stroke="{col}" stroke-width="2"/><circle cx="48" cy="{y + 14}" r="6" fill="{col}"/><text x="66" y="{y + 19}" font-size="13" font-weight="600" fill="#0f172a" font-family="sans-serif">{n}</text><path d="M222 {y + 14} C 300 {y + 14}, 330 130, 400 130" stroke="{col}" stroke-width="2" fill="none" opacity=".6"/>'
    o += '<rect x="400" y="52" width="370" height="156" rx="16" fill="#fff" stroke="#c7d2fe" stroke-width="2"/><circle cx="436" cy="86" r="16" fill="#6366f1"/><text x="462" y="82" font-size="14" font-weight="700" fill="#0f172a" font-family="sans-serif">Ficha del cliente</text><text x="462" y="100" font-size="11.5" fill="#64748b" font-family="sans-serif">Historial completo en un solo lugar</text>'
    for i in range(4):
        o += f'<rect x="420" y="{120 + i * 20}" width="{300 - i * 40}" height="10" rx="5" fill="#e2e8f0"/>'
    return o + "</svg>"


def _img(name: str, alt: str, wide: bool = False) -> str:
    """Imagen de proposal_assets incrustada (data URI): las páginas son autocontenidas y no cargan recursos externos."""
    try:
        with open(os.path.join(os.path.dirname(__file__), "proposal_assets", name), "rb") as f:
            return f'<img{" class=wide" if wide else ""} alt="{_h.escape(alt)}" src="data:image/jpeg;base64,{base64.b64encode(f.read()).decode()}">'
    except OSError:
        return ""


def _svg_flow() -> str:
    def box(x, y, w, t, col, fill="#fff", tc="#0f172a"):
        return f'<rect x="{x}" y="{y}" width="{w}" height="40" rx="10" fill="{fill}" stroke="{col}" stroke-width="2"/><text x="{x + w / 2}" y="{y + 25}" text-anchor="middle" font-size="12" font-weight="600" fill="{tc}" font-family="sans-serif">{t}</text>'
    o = '<svg viewBox="0 0 800 270" role="img" aria-label="Flujograma de un chatbot de agenda"><rect width="800" height="270" rx="14" fill="#f8fafc"/>'
    o += box(10, 115, 168, "¿En qué te ayudo?", "#6366f1", "#6366f1", "#fff")
    rows = [("Agendar una cita", 30, "#0891b2"), ("Ver servicios y horarios", 115, "#16a34a"), ("Hablar con una persona", 200, "#f59e0b")]
    for t, y, col in rows:
        o += f'<path d="M180 135 C 208 135, 198 {y + 20}, 228 {y + 20}" stroke="{col}" stroke-width="2" fill="none"/>' + box(230, y, 170, t, col)
    o += box(430, 30, 150, "Elige el servicio", "#0891b2") + '<path d="M402 50 h26" stroke="#0891b2" stroke-width="2"/>'
    o += box(610, 30, 170, "Elige día y hora libres", "#0891b2") + '<path d="M582 50 h26" stroke="#0891b2" stroke-width="2"/>'
    o += '<path d="M695 72 v34" stroke="#0891b2" stroke-width="2"/>' + box(610, 108, 170, "Cita confirmada y aviso", "#16a34a", "#dcfce7", "#14532d")
    o += box(430, 115, 176, "Responde con tu catálogo", "#16a34a") + '<path d="M402 135 h26" stroke="#16a34a" stroke-width="2"/>'
    o += box(430, 200, 176, "Pasa el chat a tu equipo", "#f59e0b") + '<path d="M402 220 h26" stroke="#f59e0b" stroke-width="2"/>'
    return o + "</svg>"


def _svg_plant() -> str:
    mq = [("Extrusora 1", "#16a34a", "En marcha"), ("Termoformadora 2", "#16a34a", "En marcha"), ("Impresora 3", "#f59e0b", "Parada"), ("Laminadora 4", "#16a34a", "En marcha")]
    o = '<svg viewBox="0 0 800 300" role="img" aria-label="Tablero de planta en tiempo real"><rect width="800" height="300" rx="14" fill="#0f172a"/><text x="24" y="34" font-size="15" font-weight="700" fill="#fff" font-family="sans-serif">Tablero de planta · en tiempo real</text>'
    o += '<circle cx="740" cy="29" r="6" fill="#22c55e"/><text x="728" y="33" text-anchor="end" font-size="12" fill="#94a3b8" font-family="sans-serif">conectado</text>'
    for i, (n, col, st) in enumerate(mq):
        x = 20 + i * 192
        o += f'<rect x="{x}" y="56" width="176" height="150" rx="12" fill="#1e293b" stroke="{col}" stroke-width="2"/><circle cx="{x + 20}" cy="80" r="7" fill="{col}"/><text x="{x + 36}" y="85" font-size="13" font-weight="700" fill="#fff" font-family="sans-serif">{n}</text>'
        o += f'<text x="{x + 16}" y="112" font-size="11" fill="#94a3b8" font-family="sans-serif">{st}</text><rect x="{x + 16}" y="124" width="144" height="10" rx="5" fill="#334155"/><rect x="{x + 16}" y="124" width="{[120, 96, 40, 110][i]}" height="10" rx="5" fill="{col}"/>'
        o += f'<text x="{x + 16}" y="160" font-size="11" fill="#94a3b8" font-family="sans-serif">Unidades</text><rect x="{x + 16}" y="168" width="90" height="12" rx="4" fill="#334155"/><rect x="{x + 16}" y="188" width="60" height="8" rx="4" fill="#475569"/>'
    labels = ["Turno A · operarios", "Producción vs. meta", "Alarmas y paradas", "Eficiencia (OEE)"]
    for i, t in enumerate(labels):
        x = 20 + i * 192
        o += f'<rect x="{x}" y="220" width="176" height="62" rx="12" fill="#1e293b"/><text x="{x + 14}" y="245" font-size="12" font-weight="600" fill="#e2e8f0" font-family="sans-serif">{t}</text><rect x="{x + 14}" y="256" width="{[110, 130, 70, 100][i]}" height="10" rx="5" fill="#6366f1"/>'
    return o + "</svg>"


def _cards(items: list[tuple[str, str, str]]) -> str:
    return '<div class="grid">' + "".join(f'<div class="card"><div class="ic">{_h.escape(i)}</div><h3>{_h.escape(t)}</h3><p>{_h.escape(d)}</p></div>' for i, t, d in items) + "</div>"


def default_pages(company: str, wa: str) -> list[dict]:
    """Presentaciones estándar de los productos de DigitalAlliance Hub (sin precios ni promesas de resultado)."""
    crm = (f'<h2>Todo lo que necesita tu equipo comercial, en un solo lugar</h2><p class="lead">Crm Hub 360 es el CRM en español con inteligencia artificial del portafolio de {_h.escape(company)}: ordena a tus clientes, atiende por todos los canales, busca clientes nuevos y deja que un equipo de agentes de IA trabaje contigo las 24 horas.</p>'
           f'<div class="fig">{_img("crm_panel.jpg", "Panel gerencial de Crm Hub 360", True)}<div class="cap">Tu panel gerencial en Crm Hub 360: embudo, leads por semana, origen y asesor (datos de prueba).</div></div>'
           f'<div class="fig">{_svg_pipeline()}<div class="cap">Cada oportunidad avanza por tu embudo, a la vista de todo el equipo.</div></div>'
           '<h2>Un equipo de agentes de IA que trabaja contigo</h2><p class="lead">No es un solo asistente: son varios agentes, cada uno con su entrenamiento, que se pasan el trabajo hasta que tu equipo entra a cerrar.</p>'
           f'<div class="fig">{_svg_agents()}<div class="cap">Agentes con funciones distintas que se complementan.</div></div>'
           + f'<div class="fig">{_img("crm_agentes.jpg", "Agentes de prospección en Crm Hub 360", True)}<div class="cap">Los agentes de prospección, con su propia configuración, en la pantalla real de Crm Hub 360.</div></div>'
           + _cards([("B", "Agente buscador", "Investiga en internet empresas que podrían necesitar lo que vendes y guarda solo las que tienen una página pública y un contacto de negocio publicado, con su fuente."),
                     ("Q", "Agente calificador", "Con buenas prácticas de calificación decide a quién vale la pena, qué producto ofrecerle y con qué ángulo. Solo pasa lo bueno al comercial virtual."),
                     ("V", "Comercial virtual", "Contacta, responde, hace seguimientos, maneja objeciones, comparte material y propone horarios para una demo. Pasa el caso a una persona cuando hace falta. Puedes tener varios, cada uno con su entrenamiento."),
                     ("A", "Asistente en la ficha", "Resume la conversación, redacta una respuesta y analiza el sentimiento y el interés de compra con un clic.")])
           + '<h2>Un motor que busca clientes por ti</h2><p class="lead">Lo más potente de Crm Hub 360: automatiza el control de tus ventas <b>y la búsqueda de nuevos clientes</b>. Tu equipo entra cuando ya hay una demo agendada.</p>'
           f'<div class="fig">{_svg_motor()}<div class="cap">De la búsqueda a la demo agendada, sin trabajo manual en el camino.</div></div>'
           f'<div class="fig">{_svg_chat()}<div class="cap">El comercial virtual conversa y coordina la agenda con la persona.</div></div>'
           + _cards([("C", "Cumplimiento integrado", "Respeta horarios legales por país, la lista de no contactar y la baja de un clic en cada correo."),
                     ("T", "Topes y frenos automáticos", "Límites diarios por remitente y frenos automáticos si suben los rebotes o las bajas, más un interruptor de emergencia."),
                     ("M", "Mejora cada día", "Prueba variantes de mensaje, aprende cuál responde mejor y pausa los nichos que no funcionan."),
                     ("P", "Propuestas y brochures", "El material de presentación se envía solo según el interés de cada prospecto, y ves cuántas veces se abrió.")])
           + f'<div class="fig">{_img("crm_material.jpg", "Biblioteca de propuestas y brochures", True)}<div class="cap">La biblioteca de propuestas y brochures que usan tus agentes: puedes agregar el tuyo.</div></div>'
           + '<h2>Lee y entiende documentos</h2><p class="lead">Sube un PDF a la ficha del cliente —un reporte de buró, una cédula, soportes de ingresos— y Crm Hub 360 lo lee por ti: detecta el tipo de documento, extrae los datos que le pides y tú los revisas antes de guardarlos.</p>'
           f'<div class="fig">{_svg_docs()}<div class="cap">Del PDF a los datos del cliente, con tu revisión antes de guardar.</div></div>'
           + _cards([("L", "Lector rápido y con IA", "Primero lo lee un lector interno, rápido y sin IA; si quieres más precisión, lo mejoras con IA."),
                     ("D", "Perfiles a tu medida", "Defines qué datos buscar según el documento: crédito, identidad, ingresos, resumen u otros."),
                     ("F", "De documento a formulario", "Los datos pueden llenar tus formularios internos y generar PDF, tareas, cambios de estado y mensajes.")])
           + '<h2>Todos los canales en una sola ficha</h2><p class="lead">Cada conversación, llamada y reunión con un cliente queda en su historial, sin importar por dónde llegó.</p>'
           f'<div class="fig">{_svg_channels()}<div class="cap">Todo el historial del cliente en un solo lugar.</div></div>'
           + _cards([("W", "WhatsApp con varios proveedores", "Conecta el que ya tienes: línea propia, API oficial de Meta, Gupshup o Twilio. Varias líneas y un principal."),
                     ("E", "Correo, SMS y Telegram", "Envía y recibe desde el CRM, con plantillas y firma propia por usuario."),
                     ("N", "Mensajes masivos y campañas", "Envíos a grupos de clientes con ritmo controlado, y campañas para medir qué convierte mejor."),
                     ("Z", "Llamadas", "Llama desde el CRM con tu central o proveedor de voz y deja el registro en la ficha.")])
           + '<h2>Reuniones y videollamadas propias, sin otro proveedor</h2><p class="lead">Crm Hub 360 trae su <b>propio módulo de reuniones</b>: no necesitas contratar otra herramienta de videollamadas (como Meet o Zoom), porque la reunión se programa, se hace y se registra dentro del CRM.</p>'
           + _cards([("1", "Módulo de reuniones propio", "Programa la reunión desde la ficha o el calendario; el cliente recibe el enlace por correo y entra desde el navegador, sin instalar nada y sin otra plataforma."),
                     ("2", "Subtítulos en vivo", "Subtítulos en español e inglés durante la llamada."),
                     ("3", "Grabación", "Graba videollamadas y pantalla, y las guarda ligadas al cliente."),
                     ("4", "Resumen con acuerdos", "Al terminar, un resumen con puntos clave, acuerdos y pendientes queda como nota en la ficha.")])
           + '<h2>Automatiza tu operación comercial</h2>'
           + _cards([("R", "Procesos de leads", "Cuando entra un lead, consulta una API o un webhook (buró, validación de identidad, web scraping) y guarda la respuesta en la ficha."),
                     ("W", "Consultas web", "Trae información de páginas —incluso con inicio de sesión— para decidir sobre un cliente, con análisis de IA opcional."),
                     ("H", "Tus propios formularios para captar leads", "Diseña tus formularios (con plantillas) y compártelos como enlace, QR o incrustados en tu web, en tus redes sociales o donde quieras: cada respuesta entra al CRM como lead, con correo y WhatsApp de bienvenida automáticos."),
                     ("I", "Formularios internos configurables", "Diseña los formularios de gestión de tu empresa: campos, etapas donde se ven y acciones al guardar, como generar un PDF, crear una tarea, cambiar el estado o enviar un mensaje.")])
           + '<h2>Reportes, aprendizaje y control</h2>'
           + _cards([("G", "Reportes y tableros", "Cada usuario arma sus gráficas (barras, líneas, circulares, indicadores) y tableros, y los comparte con su equipo."),
                     ("K", "Banco de conocimiento", "Aprende de tu historial real: qué fuentes, campañas y asesores convierten mejor, y cuándo llegan los mejores clientes."),
                     ("S", "Simulador", "Recorre con un lead de prueba todo lo que configuraste y te dice qué falta."),
                     ("O", "Equipos y reparto", "Roles, equipos, organigrama y reparto de leads entre personas y comerciales virtuales."),
                     ("Y", "Tareas, calendario y escritorio", "Agenda, tareas y un escritorio con los widgets que cada usuario elige."),
                     ("U", "Siempre actualizado", "Cambios en tiempo real, avisos en el celular y en el navegador, y se instala como aplicación.")])
           + '<h2>Trae lo tuyo: tú decides con qué trabajas</h2><p class="lead">Cada empresa puede usar sus propios proveedores o los que le ofrecemos: su correo y su buzón, su WhatsApp, su SMS y su telefonía, su motor de IA (Claude, OpenAI o local) y su buscador web. Los datos de cada empresa están separados de los de las demás, y cada usuario ve solo lo que su rol permite.</p>'
           '<p><span class="pill">Respeta horarios legales</span><span class="pill">Baja de un clic</span><span class="pill">Lista de no contactar</span><span class="pill">Topes diarios y frenos automáticos</span><span class="pill">Datos separados por empresa</span><span class="pill">Copias de seguridad de tus leads</span></p>'
           '<h2 id="como">Cómo funciona</h2><div class="steps"><div><b>Lo conectas.</b> Tus canales (WhatsApp, correo, llamadas) y tu equipo entran al CRM; cada empresa trae sus propios proveedores si lo prefiere.</div><div><b>Lo entrenas.</b> Le cuentas qué vendes y a quién; los agentes aprenden tu forma de hablar y tus reglas de calificación.</div>'
           '<div><b>Te entrega demos agendadas.</b> El motor busca, califica y conversa; tu equipo se dedica a cerrar.</div></div>')
    gestor = (f'<h2>La plataforma de gestión para tu negocio de servicios y ventas</h2><p class="lead">Gestor360 reúne la agenda, los servicios, los productos, la nómina, el inventario y los clientes de tu negocio en una sola plataforma, con una app hecha a la medida de tu línea de negocio. Y sigue sumando líneas.</p>'
              f'<div class="fig">{_img("gestor360_dashboard.jpg", "Interfaz de Gestor360: citas, ocupación e ingresos")}<div class="cap">La interfaz de Gestor360 (datos de ejemplo).</div></div>'
              '<h2>Una app a la medida de tu línea de negocio</h2><p class="lead">Gestor360 se adapta a cómo trabaja cada negocio. Hoy cuenta con cinco líneas:</p>'
              + _cards([("V", "Vehículos", "Mantenimiento, lavado y servicios para vehículos: visitas, trazabilidad con fotos y seguimiento del servicio."),
                        ("B", "Salud y belleza", "Peluquerías, barberías, spa y estética: agenda por profesional, comisiones y fidelización."),
                        ("P", "Panaderías", "Ventas, productos, inventario con alertas de stock mínimo y promociones."),
                        ("H", "Ferreterías", "Venta y control de materiales: inventario, cotizaciones y facturación."),
                        ("+", "Otras líneas", "¿Tu negocio es distinto? Se configura a tu medida, y seguimos sumando más líneas.")])
              + '<h2 id="como">Todo lo que gestiona</h2><p class="lead">Servicios y productos, de la reserva a la factura, en una sola plataforma. Activa solo los módulos que necesitas.</p>'
              + _cards([("A", "Agenda y turnos", "Reservas en línea, calendario y gestión de turnos en tiempo real, con estados, lista de tareas y fotos como evidencia."),
                        ("S", "Servicios y productos", "Catálogo de servicios con duración y precios, y venta de productos sueltos o ligados a un servicio."),
                        ("I", "Inventario", "Control de stock con movimientos, varios almacenes, alertas de reabastecimiento y costos por servicio."),
                        ("N", "Nómina", "Liquidación de pre-nómina por comisión, a partir de los servicios y las ventas de cada colaborador."),
                        ("Q", "Cotizaciones", "Tablero de cotizaciones que se convierten en orden de servicio con un clic."),
                        ("F", "Facturación electrónica", "Factura electrónica ante la DIAN desde la factura del servicio, por sede o para toda la empresa."),
                        ("C", "Clientes y CRM", "Historial, fidelización, comunicaciones y seguimiento de cada cliente, con base única para todas tus sedes."),
                        ("R", "Reportes", "Tableros de ventas, ocupación, rentabilidad y métricas clave, por sede o acumulados."),
                        ("Q", "QR y check-in", "Registro de llegada con QR y control de acceso digital."),
                        ("M", "Mensajería y campañas", "Chat con tus clientes y campañas por WhatsApp, correo y SMS."),
                        ("E", "Varias sedes", "Branding propio por sede, equipos y comisiones, con vista consolidada de toda la empresa."),
                        ("T", "Seguimiento en campo", "Visitas a domicilio y ubicación de tus profesionales, para la línea de vehículos.")])
              + '<h2>Chatbots 24/7 por WhatsApp: ventas, servicio al cliente y lo que necesites</h2><p class="lead">Gestor360 incluye un módulo de <b>chatbots configurables</b> que atienden a tus clientes <b>las 24 horas por WhatsApp</b> y por el chat web. No son solo para vender: los armas para <b>ventas</b> (toman el pedido y lo registran en el módulo de ventas), para <b>servicio al cliente (SAC)</b> —consultas, estado de pedidos, peticiones, quejas y reclamos— o para <b>cualquier proceso de atención</b> que tu negocio necesite. Los construyes como agente conversacional o con <b>flujogramas</b> visuales, sin programar, y tu equipo entra solo cuando hace falta.</p>'
              f'<div class="fig">{_img("gestor_chatbot.jpg", "Editor de flujogramas del chatbot de Gestor360", True)}<div class="cap">El editor de flujogramas: cada nodo es un paso de la conversación (datos de ejemplo).</div></div>'
              f'<div class="phones">{_img("chatbot_wa3.jpg", "Chatbot por WhatsApp: saludo con opciones y categorías")}{_img("chatbot_wa1.jpg", "Chatbot por WhatsApp: producto con botón Me interesa")}{_img("chatbot_wa2.jpg", "Chatbot por WhatsApp: confirmación de pedido con Sí o No")}</div><div class="cap">Así lo ve tu cliente en WhatsApp: saludo con menú de opciones, catálogo por categorías, producto con su precio y confirmación del pedido con un toque (datos de ejemplo).</div>'
              '<p class="lead"><b>Ejemplos de lo que puede hacer tu chatbot:</b></p>'
              + _cards([("1", "Toma pedidos por ti", "El cliente escribe y el bot lo saluda con un menú de opciones («Solicitar un pedido», etc.), le muestra las categorías y le pregunta qué necesita, si es para hoy, por encargo o para empresa, y si prefiere recogerlo en tienda o por domicilio. Si es domicilio, le pide la dirección y el pedido queda creado en ventas."),
                        ("2", "Muestra tu catálogo", "Presenta tus productos con foto y precio, o te envía el catálogo en PDF por categoría, directamente en la conversación, con botones como «Me interesa» y «Sí / No» para confirmar."),
                        ("3", "Informa el estado del pedido", "El cliente pregunta «¿cómo va mi pedido?» y el bot le responde con su estado, sin que nadie de tu equipo tenga que contestar."),
                        ("4", "Da ubicación y horarios", "Responde dónde queda cada sede, con su dirección y horario, y las preguntas frecuentes de tus clientes."),
                        ("5", "Agenda citas", "Existe una versión de agenda: el cliente elige servicio, profesional y horario libre, y la cita queda confirmada con su aviso."),
                        ("6", "Pasa a una persona", "Cuando el cliente lo pide o el bot no sabe, traspasa la conversación a un asesor con todo el contexto."),
                        ("7", "Servicio al cliente (SAC)", "Atiende consultas, solicitudes, quejas y reclamos a cualquier hora, y escala a tu equipo lo que requiere una persona."),
                        ("8", "El flujo que tu negocio necesite", "Como se arma con flujogramas, lo configuras para tu propio proceso: cobranza amable, encuestas, recordatorios, postventa, lo que se te ocurra.")])
              + '<p class="lead">Lo pruebas antes de encenderlo con una <b>vista previa</b> en chat web o WhatsApp, y completas el módulo con <b>plantillas de correo</b>, <b>plantillas de Meta</b> para WhatsApp, programación de mensajes, resultados y mensajes personalizados.</p>'
              '<h2>Seguimiento de pedidos en vivo</h2><p class="lead">Tu equipo ve todos los pedidos activos, finalizados y cancelados en un panel de despacho, con el estado del pago y de la preparación. Y <b>tu cliente sigue su pedido desde el celular</b>: un rastreador en vivo con el código del pedido, el tiempo estimado de llegada y cada etapa —pago confirmado, pedido listo, entregado—.</p>'
              f'<div class="fig">{_img("gestor_pedidos.jpg", "Panel de despacho y seguimiento del pedido en el celular del cliente", True)}<div class="cap">El panel de despacho y el rastreador que ve el cliente (datos de ejemplo).</div></div>'
              '<h2>Ventas y reportes para decidir</h2><p class="lead">El módulo de ventas te muestra en tiempo real cómo va el negocio: ventas e ingresos del mes, ticket promedio, productos vendidos, el producto más vendido y la <b>proyección del cierre de mes</b>, además de tienda vs. domicilio, tus mejores clientes y el origen de cada venta.</p>'
              f'<div class="fig">{_img("gestor_ventas.jpg", "Intelligence de ventas de Gestor360", True)}<div class="cap">Intelligence de ventas: indicadores y proyección (datos de ejemplo).</div></div>'
              '<p class="lead">Y los <b>reportes gerenciales</b> comparan tus ingresos con la meta de cada día, muestran las citas por estado, los servicios más solicitados y el monitor del día, por sede o de toda la empresa, con descarga a Excel y análisis con IA.</p>'
              + '<h2>Listo360: la app de tus clientes</h2><p class="lead">Listo360 es la app que <b>tu cliente final</b> usa para <b>autogestionarse</b>: ve todo lo que ofrece tu sede, agenda, sigue la trazabilidad de sus servicios y pedidos, compra y cotiza, sin llamar ni escribir. Es <b>personalizable para cada cliente de Gestor360</b>: con su marca, sus colores y sus sedes.</p>'
              f'<div class="phones">{_img("listo360_inicio.jpg", "Inicio de Listo360")}{_img("listo360_perfil.jpg", "Información y horarios de la sede en Listo360")}{_img("listo360_login.jpg", "Ingreso y registro de clientes en Listo360")}</div><div class="cap">Listo360 en el celular del cliente: inicio, información de la sede e ingreso (datos de ejemplo).</div>'
              + _cards([("L", "Con su propio chat", "Tus clientes conversan con tu sede desde la app, con el chatbot o con tu equipo."),
                        ("I", "Toda su información en un solo lugar", "Citas, compras, facturas y el historial de su gestión con cada sede."),
                        ("A", "Agenda desde la app", "Reservan, reprograman y siguen el estado de su cita en tiempo real, con avisos en el celular."),
                        ("P", "Pedidos y compras desde la app", "Hacen sus pedidos y compran desde la app, sin tener que llamar ni escribir."),
                        ("Q", "Cotiza desde la app", "Piden y reciben cotizaciones de lo que ofrece tu sede."),
                        ("T", "Trazabilidad", "Siguen el estado de sus servicios y pedidos, etapa por etapa, desde su celular."),
                        ("S", "Información de tu sede", "Dirección, horarios, contacto, servicios y equipo, siempre al día."),
                        ("D", "Se instala en cualquier dispositivo", "Es una app instalable en el celular, la tableta o el computador, si el cliente lo desea."),
                        ("M", "Hecha a tu medida", "Cada negocio la personaliza con su propia identidad: marca, colores y frase.")])
              + '<h2>Se conecta con tus otras plataformas</h2><p class="lead">Gestor360 se integra con otras plataformas a través de <b>APIs</b>, además de WhatsApp Business, pagos en línea y notificaciones automáticas, y se sincroniza con <b>Core360</b>.</p>'
              '<p class="lead">Y junto con <b>Crm Hub 360</b>, además de ordenar tu operación, consigues clientes nuevos y los atiendes automáticamente: el CRM busca, califica y conversa por ti, y Gestor360 organiza el servicio.</p>')
    listo = (f'<h2>La app de tus clientes, con chatbot propio</h2><p class="lead">Listo360 es la app que <b>tu cliente final</b> usa para <b>autogestionarse</b>: ve todo lo que ofrece tu sede, agenda, sigue la trazabilidad de sus servicios y pedidos, compra y cotiza, sin llamar ni escribir. Es <b>personalizable para cada cliente de Gestor360</b> —su marca, sus colores y sus sedes— y <b>cada sede tiene su propio chatbot</b> que atiende por WhatsApp las 24 horas.</p>'
             f'<div class="phones">{_img("listo360_inicio.jpg", "Inicio de Listo360")}{_img("listo360_perfil.jpg", "Información y horarios de la sede en Listo360")}{_img("listo360_login.jpg", "Ingreso y registro de clientes en Listo360")}</div><div class="cap">Listo360 en el celular del cliente: inicio, información de la sede e ingreso (datos de ejemplo).</div>'
             + '<h2 id="como">Cada sede con su chatbot de WhatsApp</h2><p class="lead">El mismo negocio que usa Listo360 tiene un <b>chatbot propio por WhatsApp</b>, con su nombre y su imagen. El cliente escribe a cualquier hora y el bot lo saluda, le muestra el menú, le presenta el catálogo por categorías y le toma el pedido; también atiende servicio al cliente y, si hace falta, pasa la conversación a una persona.</p>'
             f'<div class="phones">{_img("chatbot_wa3.jpg", "Chatbot por WhatsApp: saludo con opciones y categorías")}{_img("chatbot_wa1.jpg", "Chatbot por WhatsApp: producto con botón Me interesa")}{_img("chatbot_wa2.jpg", "Chatbot por WhatsApp: confirmación de pedido con Sí o No")}</div><div class="cap">El chatbot de una sede en WhatsApp: saludo y menú, producto con precio y confirmación del pedido (datos de ejemplo).</div>'
             + _cards([("1", "Saludo y menú de opciones", "Recibe al cliente con tu mensaje de bienvenida y un menú: pedir, ver catálogo, consultar un pedido, hablar con alguien."),
                       ("2", "Catálogo por categorías", "Muestra tus productos con foto y precio, o envía el catálogo en PDF de la categoría que el cliente elija."),
                       ("3", "Pedido con un toque", "Botones «Me interesa» y «Sí / No» para confirmar, y el pedido queda registrado en ventas, listo para despacho."),
                       ("4", "Servicio al cliente (SAC)", "Consultas, estado del pedido, peticiones, quejas y reclamos a cualquier hora, sin que tu equipo tenga que contestar cada mensaje."),
                       ("5", "Pasa a una persona", "Cuando el cliente lo pide o el bot no sabe, traspasa la conversación a un asesor con todo el contexto."),
                       ("6", "Con tu marca", "Nombre, imagen y mensajes de tu negocio; el flujo lo armas tú con flujogramas, sin programar.")])
             + '<h2>Lo que hace el cliente en la app</h2>'
             + _cards([("L", "Con su propio chat", "Conversan con tu sede desde la app, con el chatbot o con tu equipo."),
                       ("I", "Toda su información en un solo lugar", "Citas, compras, facturas y el historial de su gestión con cada sede."),
                       ("A", "Agenda desde la app", "Reservan, reprograman y siguen el estado de su cita en tiempo real, con avisos en el celular."),
                       ("P", "Pedidos y compras", "Hacen sus pedidos y compran desde la app, sin tener que llamar ni escribir."),
                       ("Q", "Cotiza", "Piden y reciben cotizaciones de lo que ofrece tu sede."),
                       ("T", "Trazabilidad", "Siguen el estado de sus servicios y pedidos, etapa por etapa, desde su celular."),
                       ("S", "Información de tu sede", "Dirección, horarios, contacto, servicios y equipo, siempre al día."),
                       ("D", "Se instala en cualquier dispositivo", "Es una app instalable en el celular, la tableta o el computador."),
                       ("M", "Hecha a tu medida", "Cada negocio la personaliza con su propia identidad: marca, colores y frase.")])
             + '<h2>Parte de Gestor360</h2><p class="lead">Listo360 y su chatbot se conectan con <b>Gestor360</b>: lo que el cliente pide, agenda o compra llega a tu agenda, tu inventario y tu panel de ventas. Y junto con <b>Crm Hub 360</b> consigues clientes nuevos y los atiendes automáticamente.</p>')
    core = (f'<h2>El ERP para fabricar y distribuir</h2><p class="lead">Core360 es la plataforma de gestión empresarial de {_h.escape(company)} para manufactura y distribución: compras, ventas, producción, inventario y materias primas, hasta la fábrica conectada, en un solo sistema.</p>'
            f'<div class="fig">{_svg_chain()}<div class="cap">De la compra de la materia prima a la factura, con una única fuente de verdad.</div></div>'
            + _cards([("C", "Compras", "Requisiciones, órdenes de compra con límite de aprobación, recepción contra la orden, alertas de reposición y facturas de proveedor con conciliación a tres vías."),
                      ("M", "Materias primas e inventarios", "Existencias por almacén, ubicación y lote, con control de vencimientos y valoración FIFO o costo promedio. Es la base de compras, producción y ventas."),
                      ("P", "Producción", "Listas de materiales de varios niveles, órdenes de producción con consumo de componentes, rendimiento y merma, y planeación de materiales (MRP)."),
                      ("V", "Ventas y distribución", "Cotizaciones, pedidos con reserva de stock, picking, entregas y envíos con transportadora y seguimiento."),
                      ("T", "Trazabilidad", "Sigue cada lote y cada documento, desde la materia prima hasta el cliente, y la gestión de tus vendedores."),
                      ("F", "Facturación electrónica", "Factura electrónica ante la DIAN, con perfil fiscal, resoluciones de numeración y trazabilidad de cada documento.")])
            + '<h2>Tu planta, conectada y en tiempo real</h2><p class="lead">Con el módulo de <b>automatización industrial</b>, tus máquinas se conectan a Core360 y ves la producción <b>mientras ocurre</b>, sin esperar los reportes del turno.</p>'
            f'<div class="fig">{_svg_plant()}<div class="cap">Tablero de planta con el estado de las máquinas (ilustración).</div></div>'
            + _cards([("1", "Integración con tus máquinas", "Se conectan por una pasarela de borde con los protocolos industriales más usados (REST, MQTT, OPC UA y Modbus)."),
                      ("2", "Producción en tiempo real", "Estados, contadores y alarmas de cada máquina, paradas y arranques, y confirmación automática de la producción."),
                      ("3", "Tablero andon y OEE", "El tablero de planta muestra disponibilidad, rendimiento y calidad, y avisa cuando una máquina se detiene."),
                      ("4", "Turnos y operarios", "Calendario de turnos y terminal de planta para que cada operario registre su trabajo."),
                      ("5", "Revisión humana de excepciones", "Lo que la máquina no puede resolver pasa a una cola para que una persona lo revise."),
                      ("6", "Mantenimiento", "Equipos, avisos de falla desde el piso, órdenes de mantenimiento y planes preventivos.")])
            + '<h2>Finanzas y contabilidad, si lo deseas</h2><p class="lead">Core360 lleva las finanzas de tu operación —cuentas por cobrar y pagar, libro mayor, conciliación y cierre contable—, y <b>se integra con tu sistema de contabilidad</b> si prefieres mantener el que ya usas.</p>'
            + _cards([("$", "Finanzas", "Facturación de clientes, cuentas por cobrar y pagar, pagos y conciliación, y reportes financieros."),
                      ("K", "Control de costos", "Centros de costos, presupuesto contra real, costeo estándar y rentabilidad."),
                      ("Q", "Calidad", "Planes de inspección, no conformidades, acciones correctivas y calificación de proveedores."),
                      ("A", "API e integraciones", "API externa con llaves y webhooks firmados, para conectarlo con tus otras plataformas.")])
            + '<h2 id="como">Se contrata por módulos</h2><p class="lead">Empiezas con la base, siempre incluida —datos maestros, materiales, clientes, proveedores, sedes y usuarios—, y sumas solo lo que necesitas: producción, automatización, calidad, mantenimiento, proyectos o costos. Y con <b>Crm Hub 360</b> conectas tu operación con la búsqueda y atención de clientes.</p>')
    return [
        {"slug": "crm-hub-360", "title": "Crm Hub 360: tu CRM con IA que busca y atiende clientes", "product": "crm_hub_360", "kind": "presentación",
         "summary": "Presentación del CRM con comercial virtual y motor que busca clientes (producto principal).",
         "html": _shell(company, "Crm Hub 360", "El motor más inteligente del portafolio", "Tu CRM con IA que <u>busca</u>, atiende y agenda clientes", "Automatiza el control de tus ventas y la búsqueda de nuevos clientes. Tu equipo entra cuando ya hay una demo agendada.", crm, wa, "Mira cómo se vería en tu negocio", "Agenda una demostración de 15 minutos por videollamada, sin compromiso.")},
        {"slug": "gestor360", "title": "Gestor360: agenda, nómina, inventario y facturación", "product": "gestor360", "kind": "presentación",
         "summary": "Plataforma de gestión para negocios de servicios y ventas con sedes: vehículos, salud y belleza, panaderías, ferreterías y otras líneas.",
         "html": _shell(company, "Gestor360", "Para negocios de servicios", "Tu negocio, <u>bajo control</u> en una sola plataforma", "Agenda, servicios, productos, nómina, inventario y clientes, con una app hecha a la medida de tu línea de negocio.", gestor, wa, "Conoce Gestor360", "Agenda una demostración de 15 minutos por videollamada, sin compromiso.")},
        {"slug": "listo360", "title": "Listo360: la app de tus clientes, con su propio chatbot", "product": "gestor360", "kind": "presentación",
         "summary": "App de autogestión para los clientes de cada sede (agenda, pedidos, cotizaciones, trazabilidad) con chatbot propio por WhatsApp.",
         "html": _shell(company, "Listo360", "La app de tus clientes", "Tus clientes se <u>autogestionan</u> y un chatbot los atiende 24/7", "Agenda, pedidos, cotizaciones y trazabilidad en su celular, y un chatbot por WhatsApp con tu marca que atiende y toma pedidos a cualquier hora.", listo, wa, "Conoce Listo360", "Agenda una demostración de 15 minutos por videollamada, sin compromiso.")},
        {"slug": "core360", "title": "Core360: ERP para manufactura y distribución", "product": "core360", "kind": "presentación",
         "summary": "ERP para manufactura y distribución: compras, ventas, producción, inventario y materias primas, planta conectada en tiempo real, turnos, finanzas y facturación electrónica.",
         "html": _shell(company, "Core360", "ERP para manufactura y distribución", "Toda tu cadena de abastecimiento, <u>bajo control</u>", "Compras, ventas, producción, inventario, materias primas y planta conectada en tiempo real, en un solo sistema.", core, wa, "Conoce Core360", "Agenda una demostración de 15 minutos por videollamada, sin compromiso.")},
    ]


# ---------------------------------------------------------------- brochures en PDF (2 páginas A4, para adjuntar a los correos)
BRO_CSS = """
@page { size: A4; margin: 0 }
* { box-sizing: border-box } body { margin: 0; font-family: 'Liberation Sans', Arial, sans-serif; color: #0f172a; font-size: 10.5pt; line-height: 1.45 }
.pg { width: 210mm; height: 297mm; overflow: hidden; page-break-after: always; background: #fff; position: relative }
.pg:last-child { page-break-after: auto }
.hero { background: linear-gradient(135deg, #312e81 0%, #4f46e5 50%, #0891b2 100%); color: #fff; padding: 11mm 16mm 9mm }
.brand { font-weight: bold; font-size: 12pt; margin-bottom: 6mm } .tag { display: inline-block; border: 1px solid rgba(255,255,255,.55); border-radius: 12px; padding: 1.2mm 4mm; font-size: 8.5pt; margin-bottom: 4mm }
h1 { font-size: 23pt; line-height: 1.12; margin: 0 0 3mm } .sub { font-size: 12pt; margin: 0; opacity: .95 }
.body { padding: 8mm 16mm 0 } h2 { font-size: 14pt; margin: 0 0 2mm; color: #1e1b4b } .lead { color: #475569; margin: 0 0 4mm }
.cards { display: flex; flex-wrap: wrap; margin: 0 -2mm } .card { width: 50%; padding: 0 2mm 4mm } .card div { border: 1px solid #e2e8f0; border-radius: 3mm; padding: 3mm 4mm; background: #f8fafc; height: 100% }
.card b { display: block; color: #3730a3; font-size: 10.5pt; margin-bottom: 1mm } .card span { color: #475569; font-size: 9.5pt }
.fig { border: 1px solid #e2e8f0; border-radius: 3mm; padding: 3mm; margin: 2mm 0 4mm; text-align: center } .fig { page-break-inside: avoid } .fig svg { width: 100%; height: auto; max-height: 62mm } .fig img { width: 100%; height: auto; max-width: 94mm } .cap { color: #64748b; font-size: 8.5pt; margin-top: 1.5mm }
.steps { margin: 0 0 4mm; padding: 0; list-style: none } .steps li { border-left: 3px solid #4f46e5; background: #f8fafc; padding: 2.5mm 4mm; margin-bottom: 2mm }
.cta { background: #0f172a; color: #fff; border-radius: 4mm; padding: 6mm 8mm; margin: 4mm 0 0; text-align: center } .cta h2 { color: #fff; font-size: 15pt } .cta p { margin: 1mm 0; font-size: 11pt } .cta b { color: #4ade80 }
.foot { position: absolute; left: 16mm; right: 16mm; bottom: 8mm; font-size: 8pt; color: #64748b; text-align: center }
.pill { display: inline-block; background: #eef2ff; color: #3730a3; border-radius: 10px; padding: .8mm 3mm; font-size: 8.5pt; margin: 0 1.5mm 1.5mm 0 }
"""


def _bro_cards(items: list[tuple[str, str]]) -> str:
    return '<div class="cards">' + "".join(f'<div class="card"><div><b>{_h.escape(t)}</b><span>{_h.escape(d)}</span></div></div>' for t, d in items) + "</div>"


def _bro(company: str, wa: str, tag: str, h1: str, sub: str, p1: str, p2: str, cta_t: str) -> str:
    c = _h.escape(company)
    wl = f"<p>Escríbenos por WhatsApp: <b>wa.me/{wa}</b></p>" if wa else ""
    cta = f'<div class="cta"><h2>{cta_t}</h2><p>Agenda una demostración de 15 minutos por videollamada, sin compromiso.</p><p>Responde al correo que te envió Valeria, nuestra asistente virtual.</p>{wl}</div>'
    foot = f'<div class="foot">{c} · Presentación informativa, sin precios ni compromiso.</div>'
    return (f'<!doctype html><html lang="es"><head><meta charset="utf-8"><style>{BRO_CSS}</style></head><body>'
            f'<div class="pg"><div class="hero"><div class="brand">{c}.</div><span class="tag">{_h.escape(tag)}</span><h1>{h1}</h1><p class="sub">{sub}</p></div><div class="body">{p1}</div>{foot}</div>'
            f'<div class="pg"><div class="body" style="padding-top:12mm">{p2}{cta}</div>{foot}</div></body></html>')


def brochures(company: str, wa: str) -> dict:
    """Brochure PDF (2 páginas) de cada producto: se adjunta a los correos junto con el enlace. Sin precios ni promesas de resultado."""
    crm = _bro(company, wa, "El motor más inteligente del portafolio", "Tu CRM con IA que busca, atiende y agenda clientes",
               "Automatiza el control de tus ventas y la búsqueda de nuevos clientes. Tu equipo entra cuando ya hay una demo agendada.",
               '<h2>Todo lo que necesita tu equipo comercial</h2><p class="lead">Crm Hub 360 es el CRM en español con inteligencia artificial: ordena a tus clientes, atiende por todos los canales y busca clientes nuevos.</p>'
               + _bro_cards([("Equipo de agentes de IA", "Buscador, calificador, comercial virtual y asistente, cada uno con su entrenamiento."), ("Motor que busca clientes", "Halla empresas, decide a quién vale la pena y les escribe, cumpliendo horarios y bajas."),
                             ("Lee y entiende documentos", "Sube un PDF a la ficha, extrae los datos que necesitas y tú los revisas."), ("Todos los canales", "WhatsApp, correo, SMS, Telegram y llamadas, con el historial en una sola ficha."),
                             ("Reuniones propias, sin otro proveedor", "Módulo de reuniones y videollamadas dentro del CRM, con subtítulos, grabación y resumen."), ("Reportes y control", "Tableros por usuario, banco de conocimiento, equipos y reparto de leads.")])
               + f'<div class="fig">{_img("crm_panel.jpg", "Panel gerencial de Crm Hub 360")}<div class="cap">Panel gerencial de Crm Hub 360 (datos de prueba).</div></div>',
               '<h2>De la búsqueda a la demo agendada</h2><p class="lead">El motor trabaja por ti las 24 horas: tu equipo se dedica a cerrar.</p>'
               f'<div class="fig">{_svg_motor()}</div>'
               + _bro_cards([("Tus propios formularios", "Capta leads en tus redes, tu web o donde quieras, con enlace, QR o incrustados; cada respuesta entra al CRM."), ("Formularios internos configurables", "Campos, etapas y acciones al guardar: PDF, tareas, estados y mensajes.")]) +
               '<h2>Cómo funciona</h2><ul class="steps"><li><b>Lo conectas.</b> Tus canales y tu equipo entran al CRM; cada empresa puede traer sus propios proveedores.</li><li><b>Lo entrenas.</b> Le cuentas qué vendes y a quién; los agentes aprenden tu forma de hablar.</li><li><b>Te entrega demos agendadas.</b> El motor busca, califica y conversa.</li></ul>'
               '<p><span class="pill">Respeta horarios legales</span><span class="pill">Baja de un clic</span><span class="pill">Lista de no contactar</span><span class="pill">Datos separados por empresa</span></p>', "Mira cómo se vería en tu negocio")
    gestor = _bro(company, wa, "Para negocios de servicios y ventas", "Tu negocio, bajo control en una sola plataforma",
                  "Agenda, servicios, productos, nómina, inventario y clientes, con una app hecha a la medida de tu línea de negocio.",
                  '<h2>Una app a la medida de tu línea de negocio</h2><p class="lead">Gestor360 cuenta hoy con cinco líneas de negocio y sigue sumando más.</p>'
                  + _bro_cards([("Vehículos", "Mantenimiento, lavado y servicios: visitas y trazabilidad con fotos."), ("Salud y belleza", "Agenda por profesional, comisiones y fidelización."), ("Panaderías", "Ventas, productos e inventario con alertas de stock."),
                                ("Ferreterías", "Inventario, cotizaciones y facturación."), ("Otras líneas", "Se configura a tu medida; seguimos sumando líneas.")])
                  + f'<div class="fig">{_img("gestor360_dashboard.jpg", "Interfaz de Gestor360")}<div class="cap">La interfaz de Gestor360 (datos de ejemplo).</div></div>',
                  '<h2>Todo lo que gestiona</h2><p class="lead">Activa solo los módulos que necesitas.</p>'
                  + _bro_cards([("Agenda y turnos", "Reservas en línea, estados y evidencia con fotos."), ("Servicios y productos", "Catálogo, duración, precios y ventas."), ("Inventario", "Stock, alertas de reabastecimiento y costos por servicio."), ("Nómina", "Pre-nómina por comisión."),
                                ("Cotizaciones", "Se convierten en orden de servicio."), ("Facturación electrónica", "Ante la DIAN, por sede o para toda la empresa."), ("Clientes y CRM", "Historial, fidelización y seguimiento."), ("Reportes", "Ventas, ocupación y rentabilidad."),
                                ("Chatbots 24/7 por WhatsApp: ventas, SAC y más", "Toma pedidos, muestra el catálogo, informa el estado del pedido, atiende servicio al cliente, agenda citas y pasa a una persona; se arma con flujogramas para el proceso que necesites, sin programar."), ("Seguimiento de pedidos en vivo", "Panel de despacho para tu equipo y rastreador en el celular del cliente, con tiempo estimado y cada etapa."),
                                ("Listo360: la app de tus clientes", "Personalizable para cada cliente, con su propio chat; agenda, pedidos y su información con cada sede. Instalable en cualquier dispositivo."),
                                ("Mensajería y campañas", "WhatsApp, correo y SMS."), ("Varias sedes", "Branding propio y vista consolidada.")])
                  + '<h2>Se conecta con tus otras plataformas</h2><p class="lead">Integración con otras plataformas a través de APIs, WhatsApp Business, pagos en línea y notificaciones; se sincroniza con Core360. Con Crm Hub 360, además de ordenar tu operación, consigues clientes nuevos.</p>', "Conoce Gestor360")
    core = _bro(company, wa, "ERP para manufactura y distribución", "Toda tu cadena de abastecimiento, bajo control",
                "Compras, ventas, producción, inventario, materias primas y planta conectada en tiempo real, en un solo sistema.",
                f'<h2>El ERP para fabricar y distribuir</h2><p class="lead">Core360 es la plataforma de gestión empresarial de {_h.escape(company)}.</p><div class="fig">{_svg_chain()}<div class="cap">De la compra de la materia prima a la factura, con una única fuente de verdad.</div></div>'
                + _bro_cards([("Compras", "Requisiciones, órdenes con aprobación y recepción contra la orden."), ("Materias primas e inventarios", "Por almacén, ubicación y lote; vencimientos; FIFO o costo promedio."), ("Producción", "Listas de materiales, órdenes, rendimiento, merma y planeación (MRP)."),
                              ("Ventas y distribución", "Cotizaciones, pedidos con reserva de stock, picking y envíos."), ("Trazabilidad", "De cada lote y documento, y de la gestión de tus vendedores."), ("Facturación electrónica", "Ante la DIAN, con trazabilidad de cada documento.")])
,
                '<h2>Tu planta, conectada y en tiempo real</h2><p class="lead">Con automatización industrial, tus máquinas se conectan a Core360 y ves la producción mientras ocurre.</p>'
                + f'<div class="fig">{_svg_plant()}<div class="cap">Planta conectada, en tiempo real (ilustración).</div></div>'
                + _bro_cards([("Integración con máquinas", "Pasarela de borde con REST, MQTT, OPC UA y Modbus."), ("Producción en tiempo real", "Estados, contadores, alarmas y confirmación automática."), ("Tablero andon y OEE", "Disponibilidad, rendimiento y calidad, con avisos de paradas."),
                              ("Turnos y operarios", "Calendario de turnos y terminal de planta."), ("Mantenimiento", "Avisos de falla, órdenes y planes preventivos."), ("Calidad", "Inspecciones, no conformidades y proveedores.")])
                + '<h2>Finanzas y contabilidad, si lo deseas</h2><p class="lead">Cuentas por cobrar y pagar, libro mayor, conciliación y cierre contable; y se integra con tu sistema de contabilidad si prefieres el que ya usas. API y webhooks para conectarlo con tus otras plataformas.</p>'
                '<h2>Se contrata por módulos</h2><p class="lead">Empiezas con la base y sumas lo que necesitas. Y con <b>Crm Hub 360</b> conectas tu operación con la búsqueda y atención de clientes.</p>', "Conoce Core360")
    return {"crm-hub-360": crm, "gestor360": gestor, "core360": core}


PRINT_CSS = """<style>
@page{size:A4;margin:12mm 11mm}
body{background:#fff!important;font-size:10.5pt}.wrap{max-width:none!important;padding:0!important}
.hero{border-radius:14px;padding:9mm 9mm;margin:0 0 6mm;-webkit-print-color-adjust:exact}.hero:after,.btn,header.top{display:none!important}
h1{font-size:22pt}h2{font-size:15pt;margin:7mm 0 2mm;break-after:avoid}.lead{margin:0 0 4mm;max-width:none}
.grid{grid-template-columns:repeat(2,1fr)!important;gap:3mm!important}.card{padding:3.5mm;border-radius:3mm;break-inside:avoid}.card h3{font-size:11pt;margin:2mm 0 1mm}.card p{font-size:9.5pt}
.ic{width:8mm;height:8mm;border-radius:2mm}
.fig{break-inside:avoid;border-radius:3mm;padding:2.5mm;margin:3mm 0}.fig img{max-width:120mm!important}.fig svg{max-height:75mm}.fig img.wide{max-width:100%!important;width:100%}.phones{margin:3mm 0 1mm}.phones img{width:30%!important;max-width:none!important;margin:0 1%;border-radius:3mm}
.steps div{break-inside:avoid;padding:3mm 4mm 3mm 13mm;border-radius:3mm}.steps div:before{left:3mm;top:2.5mm;width:7mm;height:7mm}
.cta{break-inside:avoid;border-radius:4mm;padding:7mm;margin:7mm 0 3mm}.cta .btn{display:none}footer{padding:2mm 0}
</style>"""


def pdf_html(page: str) -> str:
    """La presentación completa (la misma de la página pública) lista para imprimir en A4: el PDF lleva TODO el contenido del enlace."""
    return page.replace("</head>", PRINT_CSS + "</head>", 1)


def seed_defaults(tenant: str, company: str, wa: str) -> int:
    n = 0
    for p in default_pages(company, wa):
        pdf = make_pdf(pdf_html(nb(p["html"], company))) if p["slug"] in ("crm-hub-360", "gestor360", "listo360", "core360") else None
        upsert(tenant, p["slug"], p["title"], p["product"], p["kind"], p["summary"], nb(p["html"], company), pdf=pdf); n += 1
    return n
