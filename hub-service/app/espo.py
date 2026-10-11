"""Cliente HTTP de la API REST de EspoCRM de cada empresa (tenant), por el puerto web local con su clave de API.
Lo usan casi todos los módulos del hub (ingest, qualify, agent, broadcast, forms...) para leer y escribir leads y notas."""
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
        """GET a la API; los parámetros van en la query. Devuelve el JSON."""
        return (await self._req("GET", path, params=params)).json()

    async def file(self, attachment_id: str) -> bytes:
        """Descarga el contenido binario de un adjunto (Attachment/file/<id>)."""
        return (await self._req("GET", f"Attachment/file/{attachment_id}")).content

    async def put(self, path: str, data: dict) -> dict:
        """PUT (actualización) con cuerpo JSON; devuelve el JSON."""
        return (await self._req("PUT", path, json=data)).json()

    async def post(self, path: str, data: dict) -> dict:
        # La deduplicación por teléfono/correo la hacemos nosotros; EspoCRM además rechaza (409) a quien comparte nombre y apellido
        # con otro lead aunque sea otra persona, y eso no debe impedir registrar a un cliente.
        """POST (creación) con cuerpo JSON, sin la comprobación de duplicados de EspoCRM; devuelve el JSON."""
        return (await self._req("POST", path, json=data, headers={"X-Skip-Duplicate-Check": "true"})).json()

    async def note(self, lead_id: str, text: str) -> None:
        """Agrega una nota tipo Post al flujo del lead."""
        await self.post("Note", {"type": "Post", "parentType": "Lead", "parentId": lead_id, "post": text})
