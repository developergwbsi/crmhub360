import asyncio
import hmac
import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Request
from pydantic import BaseModel

from . import assistant, config, credit, db, ingest

log = logging.getLogger("crmhub")
logging.basicConfig(level=logging.INFO)
# Ollama atiende una inferencia a la vez con modelos locales; serializamos para no saturar la RAM.
_llm_lock = asyncio.Semaphore(1)


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.pool.open()
    yield
    db.pool.close()


app = FastAPI(title="Crm Hub 360 - Hub Service", lifespan=lifespan)


def _check(tenant: dict | None, token: str) -> dict:
    if not tenant or not hmac.compare_digest(tenant["hub_token"], token or ""):
        raise HTTPException(401, "Tenant o token inválido")
    if tenant["status"] != "active":
        raise HTTPException(403, "Licencia suspendida o vencida")
    return tenant


def tenant_auth(x_tenant: str = Header(...), x_hub_token: str = Header(...)) -> dict:
    return _check(db.get_tenant(x_tenant), x_hub_token)


class CreditReq(BaseModel):
    leadId: str
    attachmentId: str


class AssistReq(BaseModel):
    leadId: str


async def _job(tenant: dict, kind: str, entity_id: str, coro_fn):
    job = db.log_job(tenant["slug"], kind, entity_id)
    try:
        async with _llm_lock:
            await coro_fn()
        db.finish_job(job)
    except Exception as e:
        log.exception("job %s falló", job)
        db.finish_job(job, str(e)[:500])


@app.get("/health")
def health():
    return {"ok": True, "model": config.OLLAMA_MODEL}


@app.post("/v1/credit/parse", status_code=202)
async def credit_parse(req: CreditReq, bg: BackgroundTasks, tenant: dict = Depends(tenant_auth)):
    bg.add_task(_job, tenant, "credit_parse", req.leadId,
                lambda: credit.process(tenant, req.leadId, req.attachmentId))
    return {"status": "queued"}


@app.post("/v1/assistant/{action}")
async def assist(action: str, req: AssistReq, tenant: dict = Depends(tenant_auth)):
    if action not in assistant.PROMPTS:
        raise HTTPException(404, "Acción desconocida")
    job = db.log_job(tenant["slug"], f"assistant_{action}", req.leadId)
    try:
        async with _llm_lock:
            text = await assistant.run(tenant, req.leadId, action)
        db.finish_job(job)
        return {"text": text}
    except Exception as e:
        db.finish_job(job, str(e)[:500])
        raise HTTPException(502, f"Error del asistente IA: {e}")


# --- Ingesta de leads (webhooks). Autenticación: ?token=<hub_token> o cabecera apikey ---
def _ingest_tenant(slug: str, request: Request) -> dict:
    token = request.query_params.get("token") or request.headers.get("apikey") or ""
    return _check(db.get_tenant(slug), token)


@app.get("/v1/ingest/{slug}/facebook")
def fb_verify(slug: str, request: Request):
    q = request.query_params
    t = db.get_tenant(slug)
    if t and q.get("hub.mode") == "subscribe" and hmac.compare_digest(q.get("hub.verify_token", ""), t["hub_token"]):
        return int(q["hub.challenge"])
    raise HTTPException(403)


@app.post("/v1/ingest/{slug}/facebook")
async def fb_ingest(slug: str, request: Request):
    tenant = _ingest_tenant(slug, request)
    return {"leads": await ingest.from_facebook(tenant, await request.json())}


@app.post("/v1/ingest/{slug}/evolution")
async def evo_ingest(slug: str, request: Request):
    tenant = _ingest_tenant(slug, request)
    return {"lead": await ingest.from_evolution(tenant, await request.json())}


@app.post("/v1/ingest/{slug}/web")
async def web_ingest(slug: str, request: Request):
    tenant = _ingest_tenant(slug, request)
    b = await request.json()
    lead = await ingest.upsert_lead(tenant, name=b.get("name", ""), phone=b.get("phone"), email=b.get("email"),
                                    source=b.get("source", "Formulario Web"))
    return {"lead": lead}


# --- Métricas de licenciamiento (Gerente General / operador de plataforma) ---
@app.get("/v1/admin/metrics")
def metrics(x_admin_token: str = Header(...)):
    if not hmac.compare_digest(x_admin_token, config.HUB_ADMIN_TOKEN):
        raise HTTPException(401)
    with db.pool.connection() as c:
        tenants = c.execute("SELECT slug,name,plan,max_users,status,license_until FROM tenants ORDER BY slug").fetchall()
        jobs = c.execute("SELECT tenant,kind,status,count(*) n FROM ai_jobs GROUP BY 1,2,3 ORDER BY 1").fetchall()
    return {"tenants": tenants, "ai_jobs": jobs}


if __name__ == "__main__":
    uvicorn.run(app, host=config.HUB_BIND_HOST, port=config.HUB_PORT)
