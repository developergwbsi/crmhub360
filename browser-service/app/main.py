"""Navegador automático (Chromium con Playwright) para las consultas web de Crm Hub 360: sesiones interactivas para grabar un flujo (ver la página, hacer clic, escribir, navegar)
y ejecución sin pantalla de un flujo ya grabado (abrir, escribir, clic, esperar, extraer). Solo escucha en 127.0.0.1 y exige X-Browser-Token.
Seguridad: solo http/https hacia direcciones públicas (cada petición del navegador se revisa y se rechazan las redes privadas, loopback y de contenedores), sin descargas,
sesiones y flujos con tiempo límite, pocas sesiones a la vez. No resuelve captchas ni verificación en dos pasos."""
import asyncio
import base64
import hmac
import ipaddress
import os
import re
import secrets
import socket
import time
from urllib.parse import urlparse

import uvicorn
from fastapi import Depends, FastAPI, Header, HTTPException
from playwright.async_api import async_playwright
from pydantic import BaseModel

TOKEN = os.environ.get("BROWSER_TOKEN", "")
PORT = int(os.environ.get("BROWSER_PORT", "8198"))
MAX_SESSIONS, SESSION_TTL, RUN_TIMEOUT = 4, 600, 90
VIEW = {"width": 1100, "height": 720}
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"
app = FastAPI(title="Crm Hub Browser")
_state: dict = {"pw": None, "browser": None}
_sessions: dict[str, dict] = {}
_run_sem = asyncio.Semaphore(2)


def auth(x_browser_token: str = Header("")):
    if not TOKEN or not hmac.compare_digest(x_browser_token, TOKEN):
        raise HTTPException(401, "No autorizado.")


async def _public(host: str) -> bool:
    """True si el nombre resuelve solo a direcciones públicas."""
    try:
        infos = await asyncio.to_thread(socket.getaddrinfo, host, None, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        return False
    for i in infos:
        ip = ipaddress.ip_address(i[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified:
            return False
    return bool(infos)


async def _guard(route):
    u = urlparse(route.request.url)
    if u.scheme in ("data", "blob", "about"):
        return await route.continue_()
    if u.scheme not in ("http", "https", "ws", "wss") or not u.hostname or not await _public(u.hostname):
        return await route.abort("blockedbyclient")
    await route.continue_()


async def _browser():
    if not _state["browser"]:
        _state["pw"] = await async_playwright().start()
        _state["browser"] = await _state["pw"].chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
    return _state["browser"]


async def _context():
    b = await _browser()
    ctx = await b.new_context(viewport=VIEW, user_agent=UA, locale="es-CO", accept_downloads=False, java_script_enabled=True, service_workers="block")
    await ctx.route("**/*", _guard)
    return ctx


def _check_url(url: str) -> str:
    url = (url or "").strip()
    if not re.match(r"^https?://", url, re.I):
        raise HTTPException(422, "La dirección debe empezar por http:// o https://")
    return url


async def _settle(page, ms: int = 4000):
    try:
        await page.wait_for_load_state("networkidle", timeout=ms)
    except Exception:
        pass


async def _retry(fn):
    """Tras un clic que cambia de página, el contexto puede destruirse un instante: se reintenta."""
    for i in range(4):
        try:
            return await fn()
        except Exception:
            if i == 3:
                raise
            await asyncio.sleep(0.5)


async def _shot(page) -> str:
    b = await _retry(lambda: page.screenshot(type="jpeg", quality=62))
    return base64.b64encode(b).decode()


async def _title(page) -> str:
    try:
        return await _retry(page.title)
    except Exception:
        return ""


# Selector CSS corto y único de un elemento (se calcula dentro de la página) y datos para saber si se puede escribir en él
JS_INFO = r"""(el) => {
  const ident = t => /^[A-Za-z_][\w-]*$/.test(t || '') && t.length < 40;
  const uniq = s => { try { return document.querySelectorAll(s).length === 1; } catch (e) { return false; } };
  let cur = el, parts = [], sel = '';
  while (cur && cur.nodeType === 1 && cur.tagName !== 'HTML') {
    let seg = cur.tagName.toLowerCase();
    if (cur.id && ident(cur.id) && uniq('#' + cur.id)) { parts.unshift('#' + cur.id); sel = parts.join(' > '); break; }
    const nm = cur.getAttribute && cur.getAttribute('name');
    if (nm && ident(nm) && ['input', 'select', 'textarea', 'button'].includes(seg) && uniq(seg + '[name="' + nm + '"]')) { parts.unshift(seg + '[name="' + nm + '"]'); sel = parts.join(' > '); break; }
    const cls = [...cur.classList].filter(c => ident(c) && !/\d{3,}/.test(c)).slice(0, 2);
    if (cls.length) { seg += '.' + cls.join('.'); }
    const par = cur.parentElement;
    if (par) { const same = [...par.children].filter(c => c.tagName === cur.tagName); if (same.length > 1 && !(cls.length && same.filter(c => cls.every(k => c.classList.contains(k))).length === 1)) { seg += ':nth-of-type(' + (same.indexOf(cur) + 1) + ')'; } }
    parts.unshift(seg);
    const cand = parts.join(' > ');
    if (uniq(cand)) { sel = cand; break; }
    cur = par;
  }
  if (!sel) { sel = parts.join(' > '); }
  const tag = el.tagName.toLowerCase(), type = (el.getAttribute('type') || '').toLowerCase();
  const isInput = (tag === 'input' && !['button', 'submit', 'checkbox', 'radio', 'image', 'reset', 'file'].includes(type)) || tag === 'textarea' || el.isContentEditable;
  const lab = el.getAttribute('aria-label') || (el.id && document.querySelector('label[for="' + el.id + '"]') ? document.querySelector('label[for="' + el.id + '"]').innerText : '') || el.getAttribute('placeholder') || '';
  return {selector: sel, tag, isInput, isPassword: type === 'password', inputType: type, label: (lab || '').trim().slice(0, 60), text: (el.innerText || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 300), href: el.getAttribute('href') || ''};
}"""


async def _info_at(page, x: int, y: int):
    h = await page.evaluate_handle("([x, y]) => document.elementFromPoint(x, y)", [x, y])
    el = h.as_element()
    if not el:
        return None
    return await el.evaluate(JS_INFO)


class OpenReq(BaseModel):
    url: str = ""


class ActionReq(BaseModel):
    type: str
    x: int = 0
    y: int = 0
    text: str = ""
    key: str = ""
    url: str = ""
    dy: int = 0


@app.get("/health")
async def health():
    return {"ok": True, "sessions": len(_sessions)}


async def _reap():
    now = time.time()
    for sid in [k for k, v in _sessions.items() if now - v["last"] > SESSION_TTL]:
        await _close(sid)


async def _close(sid: str):
    s = _sessions.pop(sid, None)
    if s:
        try:
            await s["ctx"].close()
        except Exception:
            pass


@app.post("/session", dependencies=[Depends(auth)])
async def open_session(req: OpenReq):
    await _reap()
    if len(_sessions) >= MAX_SESSIONS:
        raise HTTPException(429, "Hay demasiadas sesiones de navegador abiertas. Cierra alguna e inténtalo de nuevo.")
    ctx = await _context()
    page = await ctx.new_page()
    sid = secrets.token_urlsafe(10)
    _sessions[sid] = {"ctx": ctx, "page": page, "last": time.time()}
    if req.url:
        try:
            await page.goto(_check_url(req.url), wait_until="domcontentloaded", timeout=20000)
            await _settle(page)
        except HTTPException:
            await _close(sid)
            raise
        except Exception as e:
            return {"id": sid, "url": req.url, "title": "", "shot": await _shot(page), "error": "No se pudo abrir la página: " + str(e)[:120], "viewport": VIEW}
    return {"id": sid, "url": page.url, "title": await _title(page), "shot": await _shot(page), "viewport": VIEW}


@app.post("/session/{sid}/action", dependencies=[Depends(auth)])
async def action(sid: str, req: ActionReq):
    s = _sessions.get(sid)
    if not s:
        raise HTTPException(404, "La sesión del navegador venció. Ábrela de nuevo.")
    s["last"] = time.time()
    page, info, err = s["page"], None, ""
    try:
        t = req.type
        if t == "goto":
            await page.goto(_check_url(req.url), wait_until="domcontentloaded", timeout=20000)
        elif t == "click":
            info = await _info_at(page, req.x, req.y)
            await page.mouse.click(req.x, req.y)
        elif t == "probe":
            info = await _info_at(page, req.x, req.y)
        elif t == "type":
            await page.keyboard.type(req.text, delay=15)
        elif t == "press":
            await page.keyboard.press(req.key or "Enter")
        elif t == "scroll":
            await page.mouse.wheel(0, req.dy)
        elif t == "back":
            await page.go_back(wait_until="domcontentloaded", timeout=15000)
        elif t == "wait":
            await page.wait_for_timeout(1000)
        else:
            raise HTTPException(422, "Acción no válida.")
        if t not in ("probe", "scroll"):
            await _settle(page, 3500)
    except HTTPException:
        raise
    except Exception as e:
        err = "No se pudo completar: " + str(e)[:120]
    return {"url": page.url, "title": await _title(page), "shot": await _shot(page), "info": info, "error": err}


@app.delete("/session/{sid}", dependencies=[Depends(auth)])
async def close_session(sid: str):
    await _close(sid)
    return {"ok": True}


class RunReq(BaseModel):
    steps: list[dict]
    timeout: int = 60


async def _locate(page, step: dict):
    """Localiza el elemento de un paso: primero por su selector; si no aparece, por el texto con que se grabó."""
    sel, txt = step.get("selector") or "", (step.get("text") or "").strip()
    if sel:
        loc = page.locator(sel).first
        try:
            await loc.wait_for(state="attached", timeout=6000)
            return loc
        except Exception:
            pass
    if txt:
        loc = page.get_by_text(txt, exact=False).first
        try:
            await loc.wait_for(state="visible", timeout=4000)
            return loc
        except Exception:
            pass
    raise ValueError("No encontré el elemento «" + (step.get("label") or sel or txt)[:60] + "» en la página.")


@app.post("/run", dependencies=[Depends(auth)])
async def run(req: RunReq):
    """Ejecuta un flujo: goto, fill, click, press, wait, extract. Devuelve lo extraído, el texto final de la página y la dirección final."""
    async with _run_sem:
        ctx = await _context()
        found: dict[str, str] = {}
        try:
            page = await ctx.new_page()
            page.set_default_timeout(15000)

            async def go():
                for i, st in enumerate(req.steps[:60], 1):
                    t = st.get("type")
                    try:
                        if t == "goto":
                            await page.goto(_check_url(st.get("url", "")), wait_until="domcontentloaded", timeout=20000)
                            await _settle(page)
                        elif t == "fill":
                            loc = await _locate(page, st)
                            await loc.fill("")
                            await loc.type(str(st.get("value", "")), delay=12)
                        elif t == "click":
                            loc = await _locate(page, st)
                            await loc.click()
                            await _settle(page, 3500)
                        elif t == "press":
                            await page.keyboard.press(st.get("key") or "Enter")
                            await _settle(page, 3500)
                        elif t == "wait":
                            if st.get("selector"):
                                await page.locator(st["selector"]).first.wait_for(state="visible", timeout=min(30000, int(st.get("ms") or 15000)))
                            elif st.get("text"):
                                await page.get_by_text(st["text"]).first.wait_for(state="visible", timeout=min(30000, int(st.get("ms") or 15000)))
                            else:
                                await page.wait_for_timeout(min(10000, int(st.get("ms") or 1000)))
                        elif t == "extract":
                            mode, expr, label = st.get("mode") or "selector", st.get("expr") or st.get("selector") or "", st.get("label") or "Dato"
                            v = ""
                            if mode == "selector" and expr:
                                v = await page.eval_on_selector_all(expr, "els => els.slice(0, 5).map(e => (e.innerText || e.value || '').replace(/\\s+/g, ' ').trim()).filter(Boolean).join(' | ')")
                            elif mode == "regex" and expr:
                                body = await page.inner_text("body")
                                m = re.search(expr, body, re.I | re.S)
                                v = (m.group(1) if m and m.groups() else m.group(0) if m else "").strip()
                            elif mode == "text":
                                v = (await page.inner_text("body"))[:1500]
                            if v:
                                found[label] = v[:1500]
                    except Exception as e:
                        raise ValueError(f"Paso {i} ({t}): {str(e)[:140]}")

            await asyncio.wait_for(go(), timeout=min(RUN_TIMEOUT, max(10, req.timeout)))
            body = ""
            try:
                body = (await page.inner_text("body"))[:12000]
            except Exception:
                pass
            return {"found": found, "text": re.sub(r"\n\s*\n+", "\n", body).strip(), "url": page.url}
        except asyncio.TimeoutError:
            raise HTTPException(504, "El flujo tardó demasiado y se canceló.")
        except ValueError as e:
            raise HTTPException(422, str(e))
        finally:
            await ctx.close()


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="info")
