import asyncio
import hmac
import json
import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import BackgroundTasks, Body, Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel

import httpx

from . import assistant, config, credit, db, forms, ingest, push, qualify, telegram, whatsapp

log = logging.getLogger("crmhub")
logging.basicConfig(level=logging.INFO)
# Ollama atiende una inferencia a la vez con modelos locales; serializamos para no saturar la RAM.
_llm_lock = asyncio.Semaphore(1)


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.pool.open()
    push.keys()  # crea las claves VAPID la primera vez
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
    raw = await request.body()
    _verify_signature(tenant, raw, request.headers.get("x-hub-signature-256"))
    return {"leads": await ingest.from_facebook(tenant, json.loads(raw or b"{}"))}


def _verify_signature(tenant: dict, raw: bytes, header: str | None) -> None:
    """Si la empresa guardó el App Secret de Meta, exige la firma X-Hub-Signature-256."""
    secret = (tenant.get("settings") or {}).get("meta_app_secret")
    if not secret:
        return
    import hashlib
    expected = "sha256=" + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    if not (header and hmac.compare_digest(expected, header)):
        raise HTTPException(401, "Firma inválida")


@app.get("/v1/ingest/{slug}/whatsapp-cloud")
def meta_wa_verify(slug: str, request: Request):
    q = request.query_params
    t = db.get_tenant(slug)
    if t and q.get("hub.mode") == "subscribe" and hmac.compare_digest(q.get("hub.verify_token", ""), t["hub_token"]):
        return int(q["hub.challenge"])
    raise HTTPException(403)


@app.post("/v1/ingest/{slug}/whatsapp-cloud")
async def meta_wa_ingest(slug: str, request: Request):
    tenant = _ingest_tenant(slug, request)
    raw = await request.body()
    _verify_signature(tenant, raw, request.headers.get("x-hub-signature-256"))
    return {"leads": await ingest.from_meta_whatsapp(tenant, json.loads(raw or b"{}"))}


@app.post("/v1/ingest/{slug}/gupshup")
async def gupshup_ingest(slug: str, request: Request):
    tenant = _ingest_tenant(slug, request)
    return {"lead": await ingest.from_gupshup(tenant, await request.json())}


@app.post("/v1/ingest/{slug}/telegram")
async def telegram_ingest(slug: str, request: Request):
    tenant = db.get_tenant(slug)
    secret = ((tenant or {}).get("settings") or {}).get("telegram_secret") or ""
    if not tenant or not secret or not hmac.compare_digest(request.headers.get("x-telegram-bot-api-secret-token", ""), secret):
        raise HTTPException(401, "No autorizado")
    if tenant["status"] != "active":
        raise HTTPException(403, "Licencia suspendida o vencida")
    try:
        return {"lead": await ingest.from_telegram(tenant, await request.json())}
    except Exception:
        log.exception("fallo al procesar un mensaje de Telegram")
        return {"lead": None}  # 200: Telegram reintenta indefinidamente si respondemos error


@app.post("/v1/ingest/{slug}/evolution")
async def evo_ingest(slug: str, request: Request):
    tenant = _ingest_tenant(slug, request)
    return {"lead": await ingest.from_evolution(tenant, await request.json())}


@app.post("/v1/ingest/{slug}/web")
async def web_ingest(slug: str, request: Request):
    tenant = _ingest_tenant(slug, request)
    b = await request.json()
    lead = await ingest.upsert_lead(tenant, name=b.get("name", ""), phone=b.get("phone"), email=b.get("email"),
                                    source=b.get("source", "Formulario Web"), campaign=b.get("campaign"))
    return {"lead": lead}


# --- Integraciones del tenant (las consume el panel de administración de EspoCRM) ---
class SettingsReq(BaseModel):
    fb_page_token: str | None = None
    services: list[dict] | None = None
    evolution_url: str | None = None
    evolution_apikey: str | None = None
    evolution_instance: str | None = None


class SendReq(BaseModel):
    leadId: str
    text: str
    agent: str = 'Asesor'


class PushSubReq(BaseModel):
    userId: str
    subscription: dict
    userAgent: str | None = None


class PushUnsubReq(BaseModel):
    endpoint: str


class PushSendReq(BaseModel):
    userId: str | None = None
    title: str = "Crm Hub 360"
    body: str
    url: str = "/"


class BroadcastReq(BaseModel):
    tenant: str
    title: str = "Crm Hub 360 — nueva versión"
    body: str = "Hay una versión nueva disponible. Ábrela para actualizar."
    url: str = "/"


class QualifyReq(BaseModel):
    leadId: str


@app.get("/v1/tenant/settings")
async def tenant_settings(tenant: dict = Depends(tenant_auth)):
    st = tenant.get("settings") or {}
    ai_ok = False
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            tags = (await c.get(f"{config.OLLAMA_URL}/api/tags")).json()
            ai_ok = any(m["name"] == config.OLLAMA_MODEL for m in tags.get("models", []))
    except Exception:
        pass
    with db.pool.connection() as c:
        jobs = c.execute("SELECT kind, status, count(*) n FROM ai_jobs WHERE tenant=%s GROUP BY 1,2", (tenant["slug"],)).fetchall()
    fb = st.get("fb_page_token") or ""
    return {
        "host": tenant["host"], "token": tenant["hub_token"], "plan": tenant["plan"], "maxUsers": tenant["max_users"],
        "status": tenant["status"], "licenseUntil": str(tenant["license_until"]) if tenant["license_until"] else None,
        "model": config.OLLAMA_MODEL, "aiReachable": ai_ok, "jobs": jobs,
        "fbPageTokenSet": bool(fb), "fbPageTokenHint": ("…" + fb[-4:]) if fb else "",
        "wa": {"provider": whatsapp.provider(tenant), "providers": whatsapp.PROVIDERS,
               "evolution": {"url": st.get("evolution_url") or "", "instance": st.get("evolution_instance") or "", "keySet": bool(st.get("evolution_apikey")),
                             "keyHint": ("…" + st["evolution_apikey"][-4:]) if st.get("evolution_apikey") else ""},
               "meta": {"phoneNumberId": st.get("meta_phone_number_id") or "", "tokenSet": bool(st.get("meta_access_token")),
                        "tokenHint": ("…" + st["meta_access_token"][-4:]) if st.get("meta_access_token") else ""},
               "gupshup": {"source": st.get("gupshup_source") or "", "appName": st.get("gupshup_app_name") or "", "keySet": bool(st.get("gupshup_api_key")),
                           "keyHint": ("…" + st["gupshup_api_key"][-4:]) if st.get("gupshup_api_key") else ""}},
        "metaAppSecretSet": bool(st.get("meta_app_secret")),
        "telegram": {"tokenSet": bool(st.get("telegram_bot_token")), "tokenHint": ("…" + st["telegram_bot_token"][-4:]) if st.get("telegram_bot_token") else "",
                     "bot": st.get("telegram_bot_username") or "", "welcome": st.get("telegram_welcome") or ""},
        "forms": st.get("forms") or [], "formDefault": forms.default_form(len(st.get("forms") or []) + 1),
        "fieldTypes": forms.FIELD_TYPES, "fieldMaps": forms.MAPS,
        "services": qualify.services_for(tenant), "servicesCustomized": bool(st.get("services")), "pushDevices": push.count(tenant["slug"]),
        "metrics": [{"key": k, "label": v[0], "unit": v[2]} for k, v in qualify.METRICS.items()],
        "ops": qualify.OPS,
    }


SECRET_KEYS = {"fb_page_token", "evolution_apikey", "meta_access_token", "meta_app_secret", "gupshup_api_key", "telegram_bot_token"}
PLAIN_KEYS = {"evolution_instance", "meta_phone_number_id", "gupshup_source", "gupshup_app_name", "telegram_welcome"}


@app.put("/v1/tenant/settings")
def tenant_settings_update(body: dict = Body(...), tenant: dict = Depends(tenant_auth)):
    patch = {}
    for k in SECRET_KEYS:  # un valor vacío conserva el secreto actual
        if isinstance(body.get(k), str) and body[k].strip():
            patch[k] = body[k].strip()
    for k in PLAIN_KEYS:
        if isinstance(body.get(k), str):
            patch[k] = body[k].strip()[:500]
    if isinstance(body.get("evolution_url"), str):
        u = body["evolution_url"].strip().rstrip("/")
        if u and not u.startswith(("http://", "https://")):
            raise HTTPException(422, "La URL de Evolution API debe empezar por http:// o https://")
        patch["evolution_url"] = u
    if "wa_provider" in body:
        if body["wa_provider"] not in ("", *whatsapp.PROVIDERS):
            raise HTTPException(422, "Proveedor de WhatsApp desconocido")
        patch["wa_provider"] = body["wa_provider"]
    if body.get("services") is not None:
        try:
            patch["services"] = qualify.validate_services(body["services"])
        except ValueError as e:
            raise HTTPException(422, str(e))
    if body.get("forms") is not None:
        try:
            patch["forms"] = forms.validate(body["forms"])
        except ValueError as e:
            raise HTTPException(422, str(e))
    with db.pool.connection() as c:
        c.execute("UPDATE tenants SET settings = settings || %s::jsonb WHERE slug = %s", (json.dumps(patch), tenant["slug"]))
    return {"ok": True}


@app.post("/v1/tenant/settings/reset-services")
def reset_services(tenant: dict = Depends(tenant_auth)):
    with db.pool.connection() as c:
        c.execute("UPDATE tenants SET settings = settings - 'services' WHERE slug = %s", (tenant["slug"],))
    return {"ok": True}


@app.post("/v1/telegram/setup")
async def tg_setup(tenant: dict = Depends(tenant_auth)):
    try:
        return await telegram.setup(tenant)
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(502, f"No se pudo contactar a Telegram: {e}")


@app.post("/v1/telegram/test")
async def tg_test(tenant: dict = Depends(tenant_auth)):
    try:
        return await telegram.test(tenant)
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(502, f"No se pudo contactar a Telegram: {e}")


@app.post("/v1/telegram/send")
async def tg_send(req: SendReq, tenant: dict = Depends(tenant_auth)):
    text = req.text.strip()
    if not text or len(text) > 4000:
        raise HTTPException(422, "El mensaje debe tener entre 1 y 4000 caracteres")
    job = db.log_job(tenant["slug"], "telegram_send", req.leadId)
    try:
        res = await telegram.send(tenant, req.leadId, text, req.agent); db.finish_job(job); return res
    except ValueError as e:
        db.finish_job(job, str(e)[:500]); raise HTTPException(422, str(e))
    except Exception as e:
        db.finish_job(job, str(e)[:500]); raise HTTPException(502, f"No se pudo enviar: {e}")


@app.post("/v1/telegram/invite")
async def tg_invite(req: QualifyReq, tenant: dict = Depends(tenant_auth)):
    try:
        return await telegram.invite(tenant, req.leadId)
    except ValueError as e:
        raise HTTPException(422, str(e))


# --- Formularios web públicos (los publica el vhost como https://<dominio>/f/<slug>) ---
def _public_tenant(slug: str) -> dict:
    t = db.get_tenant(slug)
    if not t or t["status"] != "active":
        raise HTTPException(404, "No encontrado")
    return t


_FORM_HEADERS = {"Cache-Control": "no-store", "Content-Security-Policy": "frame-ancestors *", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff"}


@app.get("/v1/public/{slug}/forms/{form_slug}", response_class=HTMLResponse)
def form_page(slug: str, form_slug: str):
    t = _public_tenant(slug)
    f = forms.find(t, form_slug)
    if not f:
        return HTMLResponse("<!doctype html><meta charset=utf-8><p style='font:16px sans-serif;padding:2rem'>Este formulario no está disponible.</p>", 404, _FORM_HEADERS)
    return HTMLResponse(forms.page(f), headers=_FORM_HEADERS)


@app.post("/v1/public/{slug}/forms/{form_slug}", response_class=HTMLResponse)
async def form_submit(slug: str, form_slug: str, request: Request):
    from urllib.parse import parse_qs
    t = _public_tenant(slug)
    f = forms.find(t, form_slug)
    if not f:
        return HTMLResponse("<p>Este formulario no está disponible.</p>", 404, _FORM_HEADERS)
    raw = await request.body()
    if len(raw) > 40_000:
        return HTMLResponse(forms.page(f, error="El envío es demasiado grande."), 413, _FORM_HEADERS)
    data = {k: v[0] for k, v in parse_qs(raw.decode("utf-8", "replace"), keep_blank_values=True).items()}
    ip = (request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (request.client.host if request.client else "?"))
    try:
        res = await forms.submit(t, f, data, ip)
    except forms.FormError as e:
        return HTMLResponse(forms.page(f, error=str(e), values=data), 400, _FORM_HEADERS)
    except Exception:
        log.exception("fallo al procesar el formulario %s", form_slug)
        return HTMLResponse(forms.page(f, error="No pudimos registrar tus datos. Intenta de nuevo en un momento.", values=data), 500, _FORM_HEADERS)
    if f.get("redirect_url") and not res.get("telegram"):
        return RedirectResponse(f["redirect_url"], status_code=303)
    return HTMLResponse(forms.page(f, done=res), headers=_FORM_HEADERS)


@app.get("/v1/push/key")
def push_key(tenant: dict = Depends(tenant_auth)):
    return {"publicKey": push.keys()["public"]}


@app.post("/v1/push/subscribe")
def push_subscribe(req: PushSubReq, tenant: dict = Depends(tenant_auth)):
    try:
        push.save(tenant["slug"], req.userId, req.subscription, req.userAgent)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return {"ok": True}


@app.post("/v1/push/unsubscribe")
def push_unsubscribe(req: PushUnsubReq, tenant: dict = Depends(tenant_auth)):
    push.remove(req.endpoint)
    return {"ok": True}


@app.post("/v1/push/send")
async def push_send(req: PushSendReq, tenant: dict = Depends(tenant_auth)):
    return await push.send(tenant["slug"], title=req.title, body=req.body, url=req.url, kind="info", tag="crmhub-test", user_id=req.userId)


@app.post("/v1/admin/push/broadcast")
async def push_broadcast(req: BroadcastReq, x_admin_token: str = Header(...)):
    """Lo llama el despliegue (bin/crmhub) cuando cambia la versión de un tenant."""
    if not hmac.compare_digest(x_admin_token, config.HUB_ADMIN_TOKEN):
        raise HTTPException(401)
    if not db.get_tenant(req.tenant):
        raise HTTPException(404, "Tenant desconocido")
    return await push.send(req.tenant, title=req.title, body=req.body, url=req.url, tag="crmhub-update", kind="update")


@app.post("/v1/whatsapp/test")
async def wa_test(tenant: dict = Depends(tenant_auth)):
    try:
        return await whatsapp.test(tenant)
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(502, f"No se pudo conectar con Evolution API: {e}")


@app.post("/v1/whatsapp/send")
async def wa_send(req: SendReq, tenant: dict = Depends(tenant_auth)):
    text = req.text.strip()
    if not text or len(text) > 4000:
        raise HTTPException(422, "El mensaje debe tener entre 1 y 4000 caracteres")
    job = db.log_job(tenant["slug"], "whatsapp_send", req.leadId)
    try:
        res = await whatsapp.send(tenant, req.leadId, text, req.agent)
        db.finish_job(job)
        return res
    except ValueError as e:
        db.finish_job(job, str(e)[:500])
        raise HTTPException(422, str(e))
    except Exception as e:
        db.finish_job(job, str(e)[:500])
        raise HTTPException(502, f"No se pudo enviar: {e}")


@app.post("/v1/leads/qualify")
async def leads_qualify(req: QualifyReq, tenant: dict = Depends(tenant_auth)):
    job = db.log_job(tenant["slug"], "qualify", req.leadId)
    try:
        res = await qualify.run(tenant, req.leadId)
        db.finish_job(job)
        return res
    except Exception as e:
        db.finish_job(job, str(e)[:500])
        raise HTTPException(502, f"No se pudo calificar: {e}")


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
