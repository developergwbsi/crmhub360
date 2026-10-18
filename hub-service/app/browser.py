"""Cliente del navegador automático (contenedor crmhub-browser, Playwright): sesiones interactivas para grabar un flujo y ejecución de flujos ya grabados.
Cada sesión pertenece a la empresa que la abrió (no se puede usar desde otra). Las claves que se escriben en un flujo viajan solo entre el Hub y el navegador (127.0.0.1) y no se registran."""
import os

import httpx

URL = os.environ.get("BROWSER_URL", "http://127.0.0.1:8198")
TOKEN = os.environ.get("BROWSER_TOKEN", "")
_owner: dict[str, str] = {}


async def _req(method: str, path: str, body: dict | None = None, timeout: float = 70) -> dict:
    try:
        async with httpx.AsyncClient(timeout=timeout, headers={"X-Browser-Token": TOKEN}) as c:
            r = await c.request(method, URL + path, json=body)
    except httpx.HTTPError:
        raise ValueError("El navegador automático no está disponible en este momento. Inténtalo de nuevo en unos minutos.")
    if r.status_code >= 400:
        try:
            msg = r.json().get("detail")
        except Exception:
            msg = None
        raise ValueError(str(msg or "El navegador automático no pudo completar la acción."))
    return r.json()


async def open_session(tenant: str, url: str) -> dict:
    d = await _req("POST", "/session", {"url": url})
    _owner[d["id"]] = tenant
    return d


def _mine(tenant: str, sid: str) -> None:
    if _owner.get(sid) != tenant:
        raise ValueError("La sesión del navegador venció. Ábrela de nuevo.")


async def action(tenant: str, sid: str, body: dict) -> dict:
    _mine(tenant, sid)
    return await _req("POST", f"/session/{sid}/action", body)


async def close_session(tenant: str, sid: str) -> None:
    if _owner.get(sid) == tenant:
        _owner.pop(sid, None)
        try:
            await _req("DELETE", f"/session/{sid}", timeout=15)
        except ValueError:
            pass


async def run(steps: list[dict], timeout: int = 60) -> dict:
    return await _req("POST", "/run", {"steps": steps, "timeout": timeout}, timeout=timeout + 20)
