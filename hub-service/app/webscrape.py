"""Consulta de páginas web públicas para traer información a un formulario (y que la persona o la IA decida con ella): descarga la página con límites
(http/https, sin direcciones internas, tamaño y tiempo acotados, redirecciones revisadas) y extrae datos con un selector CSS, una expresión regular o el texto completo.
No ejecuta JavaScript ni resuelve captchas: sirve para páginas que ya muestran su contenido en el HTML. Úsalo solo en sitios cuyos términos lo permitan."""
import asyncio
import re
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup

from . import httpgen

MAX_BYTES = 1_500_000
UA = "Mozilla/5.0 (compatible; CrmHub360/1.0; public-info lookup)"
_sem = asyncio.Semaphore(3)


async def fetch(url: str, timeout: float = 20) -> tuple[str, str]:
    """Descarga una página HTML. Devuelve (url final, html). Lanza ValueError con un motivo claro."""
    cur = url
    async with _sem, httpx.AsyncClient(timeout=timeout, follow_redirects=False, headers={"User-Agent": UA, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "es,en;q=0.8"}) as c:
        for _ in range(4):
            httpgen.check_url(cur)
            try:
                async with c.stream("GET", cur) as r:
                    if r.status_code in (301, 302, 303, 307, 308) and r.headers.get("location"):
                        cur = urljoin(cur, r.headers["location"])
                        continue
                    if r.status_code >= 400:
                        raise ValueError(f"La página respondió {r.status_code}.")
                    ct = r.headers.get("content-type", "")
                    if ct and "html" not in ct and "text" not in ct and "xml" not in ct:
                        raise ValueError("La dirección no es una página web de texto.")
                    buf = bytearray()
                    async for chunk in r.aiter_bytes():
                        buf += chunk
                        if len(buf) > MAX_BYTES:
                            break
                    enc = r.encoding or "utf-8"
                    return cur, bytes(buf).decode(enc, errors="replace")
            except httpx.TimeoutException:
                raise ValueError("La página tardó demasiado en responder.")
            except httpx.HTTPError as e:
                raise ValueError("No se pudo abrir la página: " + str(e)[:100])
        raise ValueError("Demasiadas redirecciones.")


def text_of(html: str, limit: int = 12000) -> str:
    """Texto visible de la página (sin scripts, estilos ni menús), con saltos de línea razonables."""
    soup = BeautifulSoup(html, "html.parser")
    for t in soup(["script", "style", "noscript", "svg", "nav", "footer", "header", "form", "iframe"]):
        t.decompose()
    t = soup.get_text("\n")
    t = re.sub(r"[ \t\r\f\v]+", " ", t)
    return re.sub(r"\n\s*\n+", "\n", t).strip()[:limit]


def extract(html: str, rules: list[dict]) -> dict[str, str]:
    """Aplica las reglas {label, mode: selector|regex|text, expr} y devuelve etiqueta → valor (solo las que encontraron algo)."""
    soup = BeautifulSoup(html, "html.parser")
    out: dict[str, str] = {}
    for r in rules:
        label, mode, expr = str(r.get("label") or ""), r.get("mode"), str(r.get("expr") or "")
        v = ""
        try:
            if mode == "selector" and expr:
                els = soup.select(expr)[:5]
                v = " | ".join(re.sub(r"\s+", " ", e.get_text(" ")).strip() for e in els if e.get_text(strip=True))
            elif mode == "regex" and expr:
                m = re.search(expr, text_of(html, 60000), re.I | re.S)
                v = (m.group(1) if m and m.groups() else m.group(0) if m else "").strip()
            elif mode == "text":
                v = text_of(html, 1500)
        except (re.error, Exception):
            v = ""
        if v:
            out[label or expr] = v[:1500]
    return out
