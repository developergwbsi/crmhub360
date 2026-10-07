import json

import httpx

from . import config


async def chat_json(system: str, user: str, schema: dict) -> dict:
    """Llama a Ollama con salida estructurada (JSON schema) y temperatura 0."""
    payload = {
        "model": config.OLLAMA_MODEL,
        "stream": False,
        "format": schema,
        "options": {"temperature": 0},
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
    }
    async with httpx.AsyncClient(timeout=config.OLLAMA_TIMEOUT) as c:
        r = await c.post(f"{config.OLLAMA_URL}/api/chat", json=payload)
        r.raise_for_status()
    return json.loads(r.json()["message"]["content"])


async def chat_text(system: str, user: str) -> str:
    payload = {
        "model": config.OLLAMA_MODEL,
        "stream": False,
        "options": {"temperature": 0.3},
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
    }
    async with httpx.AsyncClient(timeout=config.OLLAMA_TIMEOUT) as c:
        r = await c.post(f"{config.OLLAMA_URL}/api/chat", json=payload)
        r.raise_for_status()
    return r.json()["message"]["content"].strip()
