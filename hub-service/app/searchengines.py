"""Buscadores web del buscador de prospectos. Cada empresa decide el suyo (settings.search.mode):
  · «global»: el predeterminado del sistema = la búsqueda web de Claude (usa el motor de IA de la empresa si es Anthropic);
  · «provider:<id>»: un buscador prestado desde el Centro de control (proveedor de tipo «search»);
  · «own»: el que la empresa configura con su propia clave (settings.search.own = {engine, api_key, cx}).
Motores con clave: serper (Google vía Serper.dev), brave (Brave Search API), google (Google Programmable Search: clave + cx).
Con un motor de clave, el Hub genera las consultas con la IA, busca, lee las páginas públicas (contacto) y arma el informe que luego se estructura igual que el de Claude."""
import asyncio
import json
import re

import httpx

from . import db, httpgen, llm, wallet

ENGINES = {"claude": "Búsqueda web de Claude (sin clave extra)", "serper": "Serper.dev (resultados de Google)", "brave": "Brave Search API", "google": "Google Programmable Search"}
RECOMMENDED = [
    {"engine": "claude", "note": "La opción por defecto: no necesita otra cuenta, usa tu clave de Anthropic. Se paga en tokens más un cargo por búsqueda."},
    {"engine": "serper", "note": "Resultados de Google, simple y barato por consulta. Cuenta en serper.dev."},
    {"engine": "brave", "note": "Índice independiente de Brave. Cuenta en brave.com/search/api."},
    {"engine": "google", "note": "Google Programmable Search: necesita clave de Google Cloud y el identificador del buscador (cx). Cupo gratuito diario pequeño."},
]


def _control_providers() -> list:
    try:
        with db.pool.connection() as c:
            p = c.execute("SELECT value FROM control_settings WHERE key='providers'").fetchone()
        return [x for x in (p["value"] if p else []) if x.get("kind") == "search"]
    except Exception:
        return []


def settings_of(tenant: dict) -> dict:
    return ((tenant.get("settings") or {}).get("search") or {})


def mode_of(tenant: dict) -> str:
    return settings_of(tenant).get("mode") or "global"


def resolve(tenant: dict) -> dict:
    """Motor de búsqueda de esta empresa → {engine, api_key, cx, source}."""
    st = settings_of(tenant); mode = mode_of(tenant)
    if mode == "own" and (st.get("own") or {}).get("engine"):
        o = st["own"]
        return {"engine": o["engine"], "api_key": o.get("api_key") or "", "cx": o.get("cx") or "", "source": "own"}
    if mode.startswith("provider:"):
        p = next((x for x in _control_providers() if x["id"] == mode[9:]), None)
        if p:
            f = p.get("fields", {})
            return {"engine": f.get("engine") or "serper", "api_key": f.get("api_key") or "", "cx": f.get("cx") or "", "source": f"provider:{p['id']}"}
    return {"engine": "claude", "api_key": "", "cx": "", "source": "global"}


async def _get(url: str, headers: dict, params: dict) -> dict:
    async with httpx.AsyncClient(timeout=25, follow_redirects=False) as c:
        r = await c.get(url, headers=headers, params=params)
    if r.status_code >= 400:
        raise RuntimeError(f"El buscador respondió {r.status_code}" + (" (clave inválida o sin cupo)" if r.status_code in (401, 403, 422, 429) else ""))
    return r.json()


async def search(cfg: dict, query: str, n: int = 8) -> list[dict]:
    """Una búsqueda → [{title, url, snippet}] según el motor."""
    e = cfg["engine"]
    if not cfg.get("api_key"):
        raise RuntimeError("Falta la clave del buscador.")
    if e == "serper":
        async with httpx.AsyncClient(timeout=25) as c:
            r = await c.post("https://google.serper.dev/search", headers={"X-API-KEY": cfg["api_key"], "Content-Type": "application/json"}, json={"q": query, "gl": "co", "hl": "es", "num": n})
        if r.status_code >= 400:
            raise RuntimeError(f"Serper respondió {r.status_code}" + (" (clave inválida o sin cupo)" if r.status_code in (400, 401, 403, 429) else ""))
        return [{"title": x.get("title", ""), "url": x.get("link", ""), "snippet": x.get("snippet", "")} for x in (r.json().get("organic") or [])[:n]]
    if e == "brave":
        j = await _get("https://api.search.brave.com/res/v1/web/search", {"X-Subscription-Token": cfg["api_key"], "Accept": "application/json"}, {"q": query, "country": "co", "search_lang": "es", "count": n})
        return [{"title": x.get("title", ""), "url": x.get("url", ""), "snippet": re.sub(r"<[^>]+>", "", x.get("description", ""))} for x in ((j.get("web") or {}).get("results") or [])[:n]]
    if e == "google":
        if not cfg.get("cx"):
            raise RuntimeError("Falta el identificador del buscador de Google (cx).")
        j = await _get("https://www.googleapis.com/customsearch/v1", {}, {"key": cfg["api_key"], "cx": cfg["cx"], "q": query, "num": min(n, 10), "gl": "co", "lr": "lang_es"})
        return [{"title": x.get("title", ""), "url": x.get("link", ""), "snippet": x.get("snippet", "")} for x in (j.get("items") or [])[:n]]
    raise RuntimeError("Motor de búsqueda desconocido.")


async def _page_text(url: str) -> str:
    """Texto de una página pública (para leer su contacto). Solo direcciones públicas; máx. ~200 KB."""
    try:
        httpgen.check_url(url)
        async with httpx.AsyncClient(timeout=12, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0 (compatible; CrmHubFinder/1.0)"}) as c:
            r = await c.get(url)
        if r.status_code >= 400 or "html" not in r.headers.get("content-type", ""):
            return ""
        t = re.sub(r"(?is)<(script|style|noscript)\b.*?</\1>", " ", r.text[:200000])
        t = re.sub(r"<[^>]+>", " ", t)
        return re.sub(r"\s+", " ", t).strip()
    except Exception:
        return ""


QUERIES = {"type": "object", "properties": {"queries": {"type": "array", "items": {"type": "string"}, "description": "búsquedas web distintas, en español"}}, "required": ["queries"]}


async def report(tenant: dict, brief: str, n: int, cfg: dict) -> str:
    """Informe de investigación con un motor de clave: consultas (IA) → resultados → lectura de páginas → texto con fuentes."""
    if cfg.get("source") != "own":
        wallet.require(tenant, "search")
    q = await llm.chat_json(tenant, "Generas consultas de búsqueda web para encontrar empresas que serían clientes. Responde solo el JSON.", f"{brief}\n\nDame 6 consultas de búsqueda distintas (con ciudad, barrio o sector) para hallar páginas de contacto de pymes y negocios locales candidatos; evita consultas que traerían solo grandes marcas o cadenas.", QUERIES, 400)
    qs = [str(x)[:150] for x in (q.get("queries") or [])][:6] or []
    found, seen = [], set()
    if cfg.get("source") != "own":
        wallet.charge(tenant, "search", len(qs), note="Búsqueda de prospectos")
    for res in await asyncio.gather(*(search(cfg, x, 8) for x in qs), return_exceptions=True):
        if isinstance(res, Exception):
            raise res
        for r in res:
            d = re.sub(r"^https?://(www\.)?", "", r["url"]).split("/")[0]
            if r["url"].startswith("http") and d not in seen:
                seen.add(d); found.append(r)
    found = found[: max(6, n * 2)]
    pages = await asyncio.gather(*(_page_text(r["url"]) for r in found))
    out = []
    for r, t in zip(found, pages):
        out.append(f"FUENTE: {r['url']}\nTÍTULO: {r['title']}\nRESUMEN: {r['snippet']}\nTEXTO DE LA PÁGINA: {t[:2500]}")
    return "\n\n---\n\n".join(out)


async def test(cfg: dict) -> dict:
    """Prueba la clave con una búsqueda real (consume 1 consulta)."""
    if cfg["engine"] == "claude":
        return {"ok": True, "detail": "Usa la búsqueda web de Claude con el motor de IA de la empresa."}
    r = await search(cfg, "clínica estética Bogotá contacto", 3)
    return {"ok": True, "detail": f"Conectado: {len(r)} resultados de prueba."}
