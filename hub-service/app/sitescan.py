"""Lectura del sitio web propio de un prospecto: abre la portada y sus páginas de contacto/sedes y recupera lo que la empresa publica
(correos de su dominio, teléfonos, WhatsApp, redes, dirección). Solo páginas públicas, con los límites de webscrape.fetch; no adivina nada."""
import asyncio
import json
import logging
import re
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from . import webscrape

log = logging.getLogger("crmhub.sitescan")
EM = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
NOT_OWN = ("facebook.", "instagram.", "linkedin.", "tiktok.", "youtube.", "google.", "x.com", "twitter.", "wa.me", "whatsapp.")
JUNK = ("sentry", "wixpress", "example.", "domain.com", "email.com", "tuemail", "tucorreo", "nombre@", "usuario@", ".png", ".jpg", ".webp", ".svg", "godaddy")
GOOD = ("info", "contacto", "contact", "comercial", "ventas", "servicio", "atencion", "hola", "gerencia", "administracion", "mercadeo", "marketing")
BAD = ("contabilidad", "rrhh", "talento", "nomina", "pqr", "facturacion", "tesoreria", "juridico", "seleccion", "empleo", "noreply", "no-reply")
PAGES = re.compile(r"contact|nosotros|about|ubica|sedes|sucursal|escr[ií]benos|cont[aá]ct")


def host_of(u: str) -> str:
    h = (urlparse(u if "//" in u else "https://" + u).hostname or "").lower()
    return h[4:] if h.startswith("www.") else h


def own_site(u: str) -> bool:
    """¿Es el sitio de la propia empresa (y no una red social, un buscador o la ficha en un directorio/centro comercial)?"""
    if not u:
        return False
    h = host_of(u)
    p = urlparse(u if "//" in u else "https://" + u).path.lower()
    return bool(h) and not any(n in h for n in NOT_OWN) and not re.search(r"/(tiendas|directorio|listado|locales|negocios)/", p)


def _same_domain(email: str, host: str) -> bool:
    d = email.rpartition("@")[2]
    root = ".".join(host.split(".")[-3:]) if host.endswith(".co") and host.count(".") >= 2 and host.split(".")[-2] in ("com", "org", "net") else ".".join(host.split(".")[-2:])
    return d == host or d.endswith("." + root) or d == root


def _rank(e: str) -> int:
    u = e.partition("@")[0]
    if any(b in u for b in BAD):
        return 9
    for i, g in enumerate(GOOD):
        if u.startswith(g):
            return i
    return 5


def _wa_number(href: str) -> str:
    m = re.search(r"(?:wa\.me/|phone=)\+?(\d{10,13})", href)
    return m.group(1) if m else ""


async def scan(url: str) -> dict:
    """Devuelve {emails, phones, whatsapp, social, address, pages}; vacío si el sitio no abre o no es propio."""
    out = {"emails": [], "phones": [], "whatsapp": [], "social": [], "address": "", "about": "", "pages": 0}
    if not own_site(url):
        return out
    url = url if "//" in url else "https://" + url
    try:
        fu, h = await webscrape.fetch(url, timeout=15)
    except Exception as e:
        log.info("sitescan %s: %s", url, str(e)[:80])
        return out
    host = host_of(fu)
    pages = [(fu, h)]
    cand = []
    for a in BeautifulSoup(h, "html.parser").find_all("a", href=True):
        t = (a.get_text(" ") + " " + a["href"]).lower()
        if PAGES.search(t) and not a["href"].startswith(("mailto:", "tel:", "#")):
            u = urljoin(fu, a["href"]).split("#")[0]
            if host_of(u) == host:
                cand.append(u)
    for c in list(dict.fromkeys(cand))[:3]:
        try:
            pages.append(await webscrape.fetch(c, timeout=15))
        except Exception:
            pass
    ems, tel, wa, soc = set(), set(), set(), set()
    m = BeautifulSoup(h, "html.parser").find("meta", attrs={"name": "description"}) or BeautifulSoup(h, "html.parser").find("meta", attrs={"property": "og:description"})
    out["about"] = re.sub(r"\s+", " ", (m.get("content") or "") if m else "").strip()[:280]
    for pu, ph in pages:
        s = BeautifulSoup(ph, "html.parser")
        for a in s.find_all("a", href=True):
            hr = a["href"].strip()
            if hr.startswith("mailto:"):
                ems.add(hr[7:].split("?")[0].strip().lower())
            elif hr.startswith("tel:"):
                n = re.sub(r"[^\d+]", "", hr[4:])
                if len(n) >= 7:
                    tel.add(n)
            elif re.search(r"wa\.me|api\.whatsapp\.com|web\.whatsapp\.com", hr):
                n = _wa_number(hr)
                if n:
                    wa.add(n)
            elif re.search(r"(facebook|instagram|linkedin|tiktok|youtube)\.com/(?!watch|sharer|share)", hr):
                soc.add(hr.split("?")[0][:120])
        ems.update(e.lower() for e in EM.findall(s.get_text(" ")))
        for sc in s.find_all("script", type="application/ld+json"):
            try:
                j = json.loads(sc.string or "")
            except Exception:
                continue
            for node in (j.get("@graph") if isinstance(j, dict) and "@graph" in j else [j]) if isinstance(j, (dict, list)) else []:
                if isinstance(node, dict) and isinstance(node.get("address"), dict) and not out["address"]:
                    ad = node["address"]
                    out["address"] = ", ".join(str(ad.get(k)) for k in ("streetAddress", "addressLocality") if ad.get(k))[:160]
    good = sorted({e for e in ems if not any(j in e for j in JUNK) and _same_domain(e, host)}, key=_rank)
    out.update(emails=[e for e in good if _rank(e) < 9][:5], phones=sorted(tel)[:5], whatsapp=sorted(wa)[:3], social=sorted(soc)[:5], pages=len(pages))
    return out


async def complete(rows: list[dict]) -> int:
    """Completa filas del buscador (claves en español de prospects.import_rows) con lo que publica su sitio. Devuelve cuántas mejoraron."""
    sem = asyncio.Semaphore(3)
    n = 0

    async def one(r):
        nonlocal n
        async with sem:
            d = await scan(str(r.get("sitio") or ""))
        if not d["pages"]:
            return
        got = False
        if not r.get("correo") and d["emails"]:
            r["correo"], got = d["emails"][0], True
        if not r.get("telefono") and (d["whatsapp"] or d["phones"]):
            r["telefono"], got = ("+" + d["whatsapp"][0]) if d["whatsapp"] else d["phones"][0], True
        if d["whatsapp"]:
            r["whatsapp"] = "+" + d["whatsapp"][0]
        if len(d["emails"]) > 1:
            r["otros_correos"] = ", ".join(d["emails"][1:])
        if d["social"]:
            r["redes"] = " ".join(d["social"])
        if d["address"] and not r.get("direccion"):
            r["direccion"] = d["address"]
        if d["about"] and not r.get("descripcion"):
            r["descripcion"] = d["about"]
        r["sitio_leido"] = "si"
        n += got

    await asyncio.gather(*(one(r) for r in rows))
    return n


async def backfill(slug: str, limit: int = 20) -> int:
    """Prospectos «ready» sin correo cuyo sitio aún no se ha leído: se completan con lo que el sitio publica."""
    from . import compliance, db
    with db.pool.connection() as c:
        rows = c.execute("SELECT id, email, phone, raw FROM prospects WHERE tenant=%s AND status='ready' AND email='' AND coalesce(raw->>'sitio','')<>'' AND raw->>'sitio_leido' IS NULL ORDER BY id DESC LIMIT %s", (slug, limit)).fetchall()
    items = [{"id": r["id"], "sitio": r["raw"].get("sitio"), "correo": "", "telefono": r["phone"]} for r in rows]
    await complete(items)
    n = 0
    for it, r in zip(items, rows):
        extra = {k: it[k] for k in ("whatsapp", "otros_correos", "redes", "direccion", "descripcion", "sitio_leido") if it.get(k)}
        email = compliance.norm_email(it.get("correo") or "")
        ok = bool(email) and compliance.email_ok(email)[0] and not compliance.is_dnc(slug, email=email, phones=[])
        try:
            with db.pool.connection() as c:
                c.execute("UPDATE prospects SET email=%s, raw=raw || %s::jsonb, updated_at=now() WHERE id=%s", (email if ok else "", json.dumps(extra), it["id"]))
                n += ok
        except Exception as e:   # correo ya cargado en otro prospecto
            log.info("backfill %s: %s", it["id"], str(e)[:80])
            with db.pool.connection() as c:
                c.execute("UPDATE prospects SET raw=raw || %s::jsonb WHERE id=%s", (json.dumps({"sitio_leido": "si"}), it["id"]))
    return n
