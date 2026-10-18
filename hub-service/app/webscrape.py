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


# ---------------- vista previa para elegir visualmente los datos
_PREVIEWS: dict[str, tuple[float, str]] = {}


def _is_ident(t: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z_][\w-]*", t or "")) and len(t) < 40


def preview(tenant: str, final_url: str, html: str) -> dict:
    """Prepara la página para mostrarla de forma segura: cada elemento lleva data-chi (su posición), se quitan scripts, marcos y manejadores de eventos, y las rutas pasan a absolutas.
    Se guarda el HTML original unos minutos para resolver luego el selector del elemento elegido (pick)."""
    import secrets
    import time
    soup = BeautifulSoup(html, "html.parser")
    for i, el in enumerate(soup.find_all(True)):
        el["data-chi"] = str(i)
    original = BeautifulSoup(html, "html.parser")   # sin marcas: el selector se calcula sobre el árbol original
    for t in soup(["script", "noscript", "iframe", "object", "embed", "base", "frame", "frameset"]):
        t.decompose()
    for t in soup.find_all("meta"):
        if str(t.get("http-equiv", "")).lower() == "refresh":
            t.decompose()
    for el in soup.find_all(True):
        for a in list(el.attrs):
            if a.lower().startswith("on") or (a in ("href", "src", "action") and str(el.attrs[a]).strip().lower().startswith("javascript:")):
                del el.attrs[a]
        for a in ("href", "src", "poster"):
            v = el.get(a)
            if isinstance(v, str) and v and not v.startswith(("data:", "#", "mailto:", "tel:")):
                el[a] = urljoin(final_url, v)
        if el.get("srcset"):
            del el.attrs["srcset"]
        if el.name == "form":
            el.attrs.pop("action", None)
    head = soup.find("head")
    if head is not None:
        head.append(BeautifulSoup('<style>a{pointer-events:auto}body{cursor:crosshair}</style>', "html.parser"))
    pid = secrets.token_urlsafe(9)
    now = time.time()
    for k in [k for k, v in _PREVIEWS.items() if now - v[0] > 600]:
        _PREVIEWS.pop(k, None)
    _PREVIEWS[f"{tenant}:{pid}"] = (now, html)
    text_len = len(text_of(html, 60000))
    return {"previewId": pid, "html": str(soup)[:1_800_000], "finalUrl": final_url, "textLength": text_len,
            "warning": "" if text_len > 200 else "La página casi no trae texto en su HTML: probablemente carga el contenido con JavaScript y no se podrá leer así."}


def pick(tenant: str, preview_id: str, idx: int) -> dict:
    """Selector CSS (corto y único) del elemento n de la página de la vista previa, y el texto de muestra que daría."""
    import time
    hit = _PREVIEWS.get(f"{tenant}:{preview_id}")
    if not hit or time.time() - hit[0] > 600:
        raise ValueError("La vista previa venció. Ábrela de nuevo.")
    soup = BeautifulSoup(hit[1], "html.parser")
    els = soup.find_all(True)
    if idx < 0 or idx >= len(els):
        raise ValueError("Elemento no válido.")
    el = els[idx]
    parts: list[str] = []
    cur = el
    sel = ""
    while cur is not None and cur.name not in ("[document]",):
        seg = cur.name
        cid = cur.get("id")
        if isinstance(cid, str) and _is_ident(cid) and len(soup.select("#" + cid)) == 1:
            parts.insert(0, "#" + cid)
            sel = " > ".join(parts) if len(parts) > 1 else parts[0]
            break
        cls = [c for c in (cur.get("class") or []) if _is_ident(c) and not re.search(r"\d{3,}", c)][:2]
        if cls:
            seg += "".join("." + c for c in cls)
        par = cur.parent
        if par is not None and par.name != "[document]":
            same = [s for s in par.find_all(cur.name, recursive=False)]
            if len(same) > 1 and not (cls and sum(1 for s in same if all(c in (s.get("class") or []) for c in cls)) == 1):
                seg += f":nth-of-type({same.index(cur) + 1})"
        parts.insert(0, seg)
        cand = " > ".join(parts)
        try:
            r = soup.select(cand)
            ok = len(r) == 1 and r[0] is el
        except Exception:
            ok = False
        if ok:
            sel = cand
            break
        cur = par
    if not sel:
        sel = " > ".join(parts)
    text = re.sub(r"\s+", " ", el.get_text(" ")).strip()[:300]
    return {"selector": sel, "text": text}
