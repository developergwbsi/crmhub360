import httpx


class Espo:
    """Cliente mínimo de la API REST de EspoCRM de un tenant (usuario API con X-Api-Key)."""

    def __init__(self, tenant: dict):
        self.base = f"http://127.0.0.1:{tenant['web_port']}/api/v1"
        self.headers = {"X-Api-Key": tenant["espo_api_key"] or ""}

    async def _req(self, method: str, path: str, **kw) -> httpx.Response:
        async with httpx.AsyncClient(timeout=60, headers=self.headers) as c:
            r = await c.request(method, f"{self.base}/{path}", **kw)
            r.raise_for_status()
            return r

    async def get(self, path: str, **params) -> dict:
        return (await self._req("GET", path, params=params)).json()

    async def file(self, attachment_id: str) -> bytes:
        return (await self._req("GET", f"Attachment/file/{attachment_id}")).content

    async def put(self, path: str, data: dict) -> dict:
        return (await self._req("PUT", path, json=data)).json()

    async def post(self, path: str, data: dict) -> dict:
        return (await self._req("POST", path, json=data)).json()

    async def note(self, lead_id: str, text: str) -> None:
        await self.post("Note", {"type": "Post", "parentType": "Lead", "parentId": lead_id, "post": text})
