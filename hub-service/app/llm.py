"""Motor de IA intercambiable. Cada empresa usa: el motor global que define el Centro de control (por defecto el Ollama local), un proveedor concreto que el Centro le asigne
(Anthropic, OpenAI o compatible, Ollama) o uno propio que ella misma configure. Todo el sistema (comercial virtual, lectura de documentos, asistente, banco de conocimiento…)
pasa por aquí. Los motores en la nube atienden varias peticiones a la vez; el Ollama local, una por turno."""
import asyncio, json, logging, time
from datetime import datetime, timezone

import httpx

from . import config, db, httpgen, ollama

log = logging.getLogger("hub.llm")
REMOTE_SEM = asyncio.Semaphore(6)
KINDS = {"anthropic": "Anthropic (Claude)", "openai": "OpenAI o compatible (Groq, OpenRouter, Azure, vLLM…)", "ollama": "Ollama (modelo local)"}
DEFAULT_URL = {"anthropic": "https://api.anthropic.com", "openai": "https://api.openai.com/v1", "ollama": config.OLLAMA_URL}
_cache: dict = {"at": 0, "providers": [], "default": None}


def _control() -> tuple[list, str | None]:
    if time.time() - _cache["at"] > 20:
        try:
            with db.pool.connection() as c:
                p = c.execute("SELECT value FROM control_settings WHERE key='providers'").fetchone()
                d = c.execute("SELECT value FROM control_settings WHERE key='ai_default'").fetchone()
            _cache.update(at=time.time(), providers=[x for x in (p["value"] if p else []) if x.get("kind") == "ai"], default=(d["value"] if d else None))
        except Exception:
            pass
    return _cache["providers"], _cache["default"]


def _from_provider(p: dict) -> dict:
    f = p.get("fields", {})
    return {"kind": f.get("engine") or "openai", "model": f.get("model") or "", "base_url": (f.get("base_url") or "").strip(), "api_key": f.get("api_key") or "", "workspace_id": f.get("workspace_id") or "", "label": p["name"], "source": f"global:{p['id']}", "check_url": False}


def resolve(tenant: dict | None) -> dict:
    """Motor que corresponde a esta empresa."""
    ai = ((tenant or {}).get("settings") or {}).get("ai") or {}
    mode = ai.get("mode") or "global"
    providers, default = _control()
    if mode == "own" and (ai.get("own") or {}).get("kind"):
        o = ai["own"]
        return {"kind": o["kind"], "model": o.get("model") or "", "base_url": (o.get("base_url") or "").strip(), "api_key": o.get("api_key") or "", "workspace_id": o.get("workspace_id") or "", "label": "Motor propio de la empresa", "source": "own", "check_url": True}
    if mode.startswith("provider:"):
        p = next((x for x in providers if x["id"] == mode[9:]), None)
        if p:
            return _from_provider(p)
    if default:
        p = next((x for x in providers if x["id"] == default), None)
        if p:
            return _from_provider(p)
    return {"kind": "ollama", "model": config.OLLAMA_MODEL, "base_url": config.OLLAMA_URL, "api_key": "", "label": "IA local del sistema (Ollama)", "source": "local", "check_url": False}


# ---------------- uso (para cobrar y vigilar)
def _usage(tenant: str, cfg: dict, calls: int, tin: int, tout: int) -> None:
    mon = datetime.now(timezone.utc).strftime("%Y-%m")
    try:
        with db.pool.connection() as c:
            c.execute("CREATE TABLE IF NOT EXISTS ai_usage (tenant TEXT NOT NULL, month TEXT NOT NULL, engine TEXT NOT NULL, calls INT NOT NULL DEFAULT 0, tokens_in BIGINT NOT NULL DEFAULT 0, tokens_out BIGINT NOT NULL DEFAULT 0, PRIMARY KEY (tenant, month, engine))")
            c.execute("INSERT INTO ai_usage (tenant, month, engine, calls, tokens_in, tokens_out) VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT (tenant, month, engine) DO UPDATE SET calls=ai_usage.calls+EXCLUDED.calls, "
                      "tokens_in=ai_usage.tokens_in+EXCLUDED.tokens_in, tokens_out=ai_usage.tokens_out+EXCLUDED.tokens_out", (tenant, mon, f"{cfg['kind']}:{cfg['model'] or 'por defecto'}", calls, tin, tout))
    except Exception as e:
        log.warning("uso de IA: %s", str(e)[:100])


def usage(tenant: str) -> list[dict]:
    mon = datetime.now(timezone.utc).strftime("%Y-%m")
    try:
        with db.pool.connection() as c:
            return [dict(r) for r in c.execute("SELECT engine, calls, tokens_in, tokens_out FROM ai_usage WHERE tenant=%s AND month=%s ORDER BY calls DESC", (tenant, mon)).fetchall()]
    except Exception:
        return []


# ---------------- adaptadores
async def _post(cfg: dict, url: str, headers: dict, body: dict, timeout: float = 120) -> dict:
    if cfg.get("check_url"):
        httpgen.check_url(url)   # los motores que configura una empresa no pueden apuntar a direcciones internas del servidor
    last = None
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as c:
                r = await c.post(url, headers=headers, json=body)
        except httpx.HTTPError as e:
            last = f"No se pudo conectar con el proveedor de IA: {str(e)[:120]}"
        else:
            if r.status_code in (429, 500, 502, 503, 529) and attempt < 2:
                last = f"El proveedor de IA respondió {r.status_code}"
                await asyncio.sleep(2 * (attempt + 1))
                continue
            if r.status_code >= 400:
                msg = ""
                try:
                    j = r.json(); msg = (j.get("error") or {}).get("message") if isinstance(j.get("error"), dict) else str(j.get("error") or j.get("message") or "")
                except Exception:
                    msg = r.text[:160]
                hint = " (clave de API inválida)" if r.status_code in (401, 403) else (" (modelo inexistente)" if r.status_code == 404 else "")
                if "workspace" in str(msg).lower():
                    hint = " (tu clave de Anthropic no está asociada a un workspace: pega el ID del workspace en la configuración del motor)"
                raise RuntimeError(f"El proveedor de IA respondió {r.status_code}{hint}: {str(msg)[:200]}")
            return r.json()
        await asyncio.sleep(1)
    raise RuntimeError(last or "El proveedor de IA no respondió.")


def _schema_text(schema: dict) -> str:
    return json.dumps(schema, ensure_ascii=False)


async def _anthropic(cfg: dict, system: str, user: str, schema: dict | None, max_tokens: int | None, temp: float) -> tuple[object, int, int]:
    base = (cfg["base_url"] or DEFAULT_URL["anthropic"]).rstrip("/")
    body = {"model": cfg["model"] or "claude-haiku-5-5", "max_tokens": max_tokens or 2048, "system": system, "messages": [{"role": "user", "content": user}]}
    if schema:   # salida estructurada: se obliga a «llamar» a una herramienta cuyo esquema es el pedido
        body["tools"] = [{"name": "responder", "description": "Entrega la respuesta con la estructura pedida.", "input_schema": schema}]
        body["tool_choice"] = {"type": "tool", "name": "responder"}
    j = await _post(cfg, f"{base}/v1/messages", {"x-api-key": cfg["api_key"], "anthropic-version": "2023-06-01", "content-type": "application/json", **({"anthropic-workspace-id": cfg["workspace_id"]} if cfg.get("workspace_id") else {})}, body)
    u = j.get("usage") or {}
    if schema:
        blk = next((b for b in j.get("content", []) if b.get("type") == "tool_use"), None)
        if not blk:
            raise RuntimeError("El proveedor de IA no devolvió la estructura pedida.")
        return blk["input"], u.get("input_tokens", 0), u.get("output_tokens", 0)
    return "".join(b.get("text", "") for b in j.get("content", []) if b.get("type") == "text").strip(), u.get("input_tokens", 0), u.get("output_tokens", 0)


async def _openai(cfg: dict, system: str, user: str, schema: dict | None, max_tokens: int | None, temp: float) -> tuple[object, int, int]:
    base = (cfg["base_url"] or DEFAULT_URL["openai"]).rstrip("/")
    sys_ = system + (f"\n\nResponde SOLO con un objeto JSON válido que cumpla este esquema (sin texto adicional):\n{_schema_text(schema)}" if schema else "")
    body = {"model": cfg["model"] or "gpt-4o-mini", "temperature": temp, "messages": [{"role": "system", "content": sys_}, {"role": "user", "content": user}]}
    if schema:
        body["response_format"] = {"type": "json_object"}
    if max_tokens:
        body["max_tokens"] = max_tokens
    headers = {"Authorization": f"Bearer {cfg['api_key']}", "content-type": "application/json"}
    try:
        j = await _post(cfg, f"{base}/chat/completions", headers, body)
    except RuntimeError as e:
        if max_tokens and "max_completion_tokens" in str(e):   # modelos nuevos de OpenAI usan otro nombre del parámetro
            body.pop("max_tokens"); body["max_completion_tokens"] = max_tokens
            j = await _post(cfg, f"{base}/chat/completions", headers, body)
        else:
            raise
    u, text = j.get("usage") or {}, (j["choices"][0]["message"].get("content") or "")
    if schema:
        try:
            return json.loads(text[text.find("{"): text.rfind("}") + 1]), u.get("prompt_tokens", 0), u.get("completion_tokens", 0)
        except ValueError:
            raise RuntimeError("El proveedor de IA no devolvió un JSON válido.")
    return text.strip(), u.get("prompt_tokens", 0), u.get("completion_tokens", 0)


async def _ollama(cfg: dict, system: str, user: str, schema: dict | None, max_tokens: int | None, temp: float) -> tuple[object, int, int]:
    base = (cfg["base_url"] or DEFAULT_URL["ollama"]).rstrip("/")
    body = {"model": cfg["model"] or config.OLLAMA_MODEL, "stream": False, "options": {"temperature": temp, **({"num_predict": max_tokens} if max_tokens else {})}, "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
    if schema:
        body["format"] = schema
    j = await _post(cfg, f"{base}/api/chat", {}, body, timeout=config.OLLAMA_TIMEOUT)
    text = j["message"]["content"]
    return (json.loads(text) if schema else text.strip()), j.get("prompt_eval_count", 0), j.get("eval_count", 0)


async def _run(tenant: dict | None, system: str, user: str, schema: dict | None, max_tokens: int | None, temp: float):
    cfg = resolve(tenant)
    if cfg["kind"] != "ollama" and not cfg["api_key"]:
        raise RuntimeError("El motor de IA no tiene la clave de API configurada.")
    fn = {"anthropic": _anthropic, "openai": _openai, "ollama": _ollama}.get(cfg["kind"])
    if not fn:
        raise RuntimeError("Tipo de motor de IA desconocido.")
    gate = ollama.LOCK if cfg["kind"] == "ollama" else REMOTE_SEM
    async with gate:
        out, tin, tout = await fn(cfg, system, user, schema, max_tokens, temp)
    if tenant:
        _usage(tenant["slug"], cfg, 1, tin or 0, tout or 0)
    return out


async def chat_json(tenant: dict | None, system: str, user: str, schema: dict, max_tokens: int | None = None) -> dict:
    return await _run(tenant, system, user, schema, max_tokens, 0)


async def chat_text(tenant: dict | None, system: str, user: str) -> str:
    return await _run(tenant, system, user, None, None, 0.3)


async def test(cfg: dict) -> dict:
    """Prueba un motor (sin tocar el uso de ninguna empresa): una llamada mínima."""
    t0 = time.time()
    fn = {"anthropic": _anthropic, "openai": _openai, "ollama": _ollama}.get(cfg.get("kind"))
    if not fn:
        raise RuntimeError("Tipo de motor desconocido.")
    if cfg["kind"] != "ollama" and not cfg.get("api_key"):
        raise RuntimeError("Falta la clave de la API.")
    schema = {"type": "object", "properties": {"respuesta": {"type": "string"}}, "required": ["respuesta"]}
    gate = ollama.LOCK if cfg["kind"] == "ollama" else REMOTE_SEM
    async with gate:
        out, tin, tout = await fn(cfg, "Responde en español.", "Di 'listo' en el campo respuesta.", schema, 40, 0)
    return {"ok": True, "seconds": round(time.time() - t0, 1), "answer": str(out.get("respuesta", ""))[:60], "tokens": [tin, tout]}
