import asyncio
import hmac
import json
import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import BackgroundTasks, Body, Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from pydantic import BaseModel

import httpx

from . import assistant, broadcast, config, credit, db, forms, httpgen, ingest, push, qualify, sms, telegram, voice, whatsapp, mailbox, mailout, ollama, simulate, knowledge, templates, routing, processes, documents, agent, llm

log = logging.getLogger("crmhub")
logging.basicConfig(level=logging.INFO)
# Ollama atiende una inferencia a la vez con modelos locales; serializamos para no saturar la RAM.


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.pool.open()
    push.keys()  # crea las claves VAPID la primera vez
    simulate.ensure_schema()
    routing.ensure_schema()
    processes.ensure_schema()
    documents.ensure_schema()
    agent.ensure_schema()
    templates.ensure_schema()
    bg = asyncio.create_task(broadcast.worker())
    mb = asyncio.create_task(mailbox.worker())
    ag = asyncio.create_task(agent.worker())
    yield
    bg.cancel()
    mb.cancel()
    ag.cancel()
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


@app.post("/v1/ingest/{slug}/twilio")
async def twilio_ingest(slug: str, request: Request):
    from urllib.parse import parse_qs
    tenant = _ingest_tenant(slug, request)
    form = {k: v[0] for k, v in parse_qs((await request.body()).decode("utf-8", "replace"), keep_blank_values=True).items()}
    try:
        await ingest.from_twilio(tenant, form)
    except Exception:
        log.exception("fallo al procesar un mensaje de Twilio")
    return Response("<Response/>", media_type="text/xml")  # Twilio espera TwiML (vacío = sin respuesta automática)


@app.api_route("/v1/ingest/{slug}/voice-bridge", methods=["GET", "POST"])
async def voice_bridge(slug: str, request: Request):
    tenant = _ingest_tenant(slug, request)
    to = "+" + "".join(ch for ch in request.query_params.get("to", "") if ch.isdigit())
    return Response(voice.bridge_twiml(tenant, to), media_type="text/xml")


@app.post("/v1/ingest/{slug}/voice-status")
async def voice_status(slug: str, request: Request):
    from urllib.parse import parse_qs
    tenant = _ingest_tenant(slug, request)
    form = {k: v[0] for k, v in parse_qs((await request.body()).decode("utf-8", "replace"), keep_blank_values=True).items()}
    call_id = request.query_params.get("call", "")
    st, dur = form.get("CallStatus", ""), int(form.get("CallDuration") or 0)
    if call_id and st:
        from .espo import Espo
        espo = Espo(tenant)
        held = st == "completed" and dur > 0
        try:
            call = await espo.get(f"Call/{call_id}")
            upd = {"status": "Held" if held else "Not Held"}
            if dur and call.get("dateStart"):  # la duración de Espo se calcula de inicio/fin
                import datetime as _dt
                upd["dateEnd"] = (_dt.datetime.strptime(call["dateStart"], "%Y-%m-%d %H:%M:%S") + _dt.timedelta(seconds=dur)).strftime("%Y-%m-%d %H:%M:%S")
            await espo.put(f"Call/{call_id}", upd)
            if call.get("parentId"):
                label = {"completed": f"contestada ({max(1, round(dur / 60))} min)", "busy": "ocupado", "no-answer": "no contestó", "failed": "falló", "canceled": "cancelada"}.get(st, st)
                await espo.note(call["parentId"], f"[Llamada] {label}")
        except Exception:
            log.exception("no se pudo registrar el estado de la llamada")
    return {"ok": True}


@app.post("/v1/ingest/{slug}/generic")
async def generic_ingest(slug: str, request: Request):
    tenant = _ingest_tenant(slug, request)
    ch = request.query_params.get("channel", "sms")
    if ch not in ("sms", "whatsapp"):
        raise HTTPException(422, "channel debe ser sms o whatsapp")
    return {"lead": await ingest.from_generic(tenant, ch, await request.json())}


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
    userId: str | None = None
    phone: str | None = None


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
        "twilio": {"sid": st.get("twilio_account_sid") or "", "tokenSet": bool(st.get("twilio_auth_token")),
                   "tokenHint": ("…" + st["twilio_auth_token"][-4:]) if st.get("twilio_auth_token") else "",
                   "smsFrom": st.get("twilio_sms_from") or "", "waFrom": st.get("twilio_wa_from") or "", "voiceFrom": st.get("twilio_voice_from") or ""},
        "genericWhatsapp": httpgen.public(st.get("generic_whatsapp")),
        "sms": {"provider": sms.provider(tenant), "providers": sms.PROVIDERS, "generic": httpgen.public(st.get("generic_sms"))},
        "voice": {"provider": voice.provider(tenant), "providers": voice.PROVIDERS, "record": bool(st.get("voice_record")),
                  "generic": httpgen.public(st.get("generic_voice"))},
        "httpVars": httpgen.VARS,
        "channelsReady": {k: broadcast.configured(tenant, k) for k in broadcast.CHANNELS},
        "telegram": {"tokenSet": bool(st.get("telegram_bot_token")), "tokenHint": ("…" + st["telegram_bot_token"][-4:]) if st.get("telegram_bot_token") else "",
                     "bot": st.get("telegram_bot_username") or "", "welcome": st.get("telegram_welcome") or ""},
        "forms": st.get("forms") or [], "formDefault": forms.default_form(len(st.get("forms") or []) + 1),
        "fieldTypes": forms.FIELD_TYPES, "fieldMaps": forms.MAPS,
        "services": qualify.services_for(tenant), "servicesCustomized": bool(st.get("services")), "pushDevices": push.count(tenant["slug"]),
        "metrics": [{"key": k, "label": v[0], "unit": v[2]} for k, v in qualify.METRICS.items()],
        "ops": qualify.OPS,
    }


SECRET_KEYS = {"fb_page_token", "evolution_apikey", "meta_access_token", "meta_app_secret", "gupshup_api_key", "telegram_bot_token", "twilio_auth_token"}
PLAIN_KEYS = {"evolution_instance", "meta_phone_number_id", "gupshup_source", "gupshup_app_name", "telegram_welcome",
              "twilio_account_sid", "twilio_sms_from", "twilio_wa_from", "twilio_voice_from"}


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
    if "sms_provider" in body:
        if body["sms_provider"] not in ("", *sms.PROVIDERS):
            raise HTTPException(422, "Proveedor de SMS desconocido")
        patch["sms_provider"] = body["sms_provider"]
    if "voice_provider" in body:
        if body["voice_provider"] not in ("", *voice.PROVIDERS):
            raise HTTPException(422, "Proveedor de llamadas desconocido")
        patch["voice_provider"] = body["voice_provider"]
    if "voice_record" in body:
        patch["voice_record"] = bool(body["voice_record"])
    for key in ("generic_whatsapp", "generic_sms", "generic_voice"):
        if isinstance(body.get(key), dict):
            try:
                patch[key] = httpgen.merge((tenant.get("settings") or {}).get(key), body[key])
            except ValueError as e:
                raise HTTPException(422, str(e))
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


class SmsTestReq(BaseModel):
    to: str


class CallReq(BaseModel):
    leadId: str
    agentPhone: str
    agent: str = "Asesor"
    agentId: str = ""


class BroadcastCreate(BaseModel):
    name: str
    channel: str
    text: str
    leadIds: list[str]
    perMinute: int = 20
    footer: bool = True
    startInMinutes: int = 0
    by: str = ""


@app.post("/v1/sms/send")
async def sms_send(req: SendReq, tenant: dict = Depends(tenant_auth)):
    text = req.text.strip()
    if not text or len(text) > 1000:
        raise HTTPException(422, "El SMS debe tener entre 1 y 1000 caracteres")
    job = db.log_job(tenant["slug"], "sms_send", req.leadId)
    try:
        res = await sms.send(tenant, req.leadId, text, req.agent, req.userId, req.phone); db.finish_job(job); return res
    except ValueError as e:
        db.finish_job(job, str(e)[:500]); raise HTTPException(422, str(e))
    except Exception as e:
        db.finish_job(job, str(e)[:500]); raise HTTPException(502, f"No se pudo enviar: {e}")


@app.post("/v1/sms/test")
async def sms_test(req: SmsTestReq, tenant: dict = Depends(tenant_auth)):
    try:
        return await sms.test(tenant, req.to)
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.post("/v1/twilio/test")
async def twilio_test(tenant: dict = Depends(tenant_auth)):
    from . import twilio
    try:
        a = await twilio.account(tenant)
        return {"name": a.get("friendly_name"), "status": a.get("status")}
    except ValueError as e:
        raise HTTPException(422, str(e))



class SupportExchangeReq(BaseModel):
    code: str


@app.post("/v1/support/exchange")
def support_exchange(req: SupportExchangeReq, tenant: dict = Depends(tenant_auth)):
    """Canje de un código de acceso de soporte (un solo uso, 90 s) por las credenciales del usuario de solo lectura."""
    code = (req.code or "")[:80]
    with db.pool.connection() as c:
        row = c.execute("DELETE FROM support_codes WHERE code = %s AND slug = %s AND expires_at > now() RETURNING user_name, password", (code, tenant["slug"])).fetchone()
    if not row:
        raise HTTPException(404, "Código inválido o vencido")
    return {"userName": row["user_name"], "password": row["password"]}


@app.post("/v1/voice/call")
async def voice_call(req: CallReq, tenant: dict = Depends(tenant_auth)):
    job = db.log_job(tenant["slug"], "voice_call", req.leadId)
    try:
        res = await voice.call(tenant, req.leadId, req.agentPhone, req.agent, req.agentId); db.finish_job(job); return res
    except ValueError as e:
        db.finish_job(job, str(e)[:500]); raise HTTPException(422, str(e))
    except Exception as e:
        db.finish_job(job, str(e)[:500]); raise HTTPException(502, f"No se pudo iniciar la llamada: {e}")


@app.get("/v1/broadcasts")
def bc_list(tenant: dict = Depends(tenant_auth)):
    return {"items": [{**b, "created_at": str(b["created_at"]), "scheduled_at": str(b["scheduled_at"]) if b["scheduled_at"] else None}
                      for b in broadcast.listing(tenant["slug"])], "channels": {k: {"label": v, "ready": broadcast.configured(tenant, k), "max": broadcast.LIMITS[k]} for k, v in broadcast.CHANNELS.items()}}


@app.post("/v1/broadcasts")
def bc_create(req: BroadcastCreate, tenant: dict = Depends(tenant_auth)):
    try:
        bid = broadcast.create(tenant, name=req.name, channel=req.channel, text=req.text, lead_ids=req.leadIds, per_minute=req.perMinute,
                               footer=req.footer, by=req.by, start_in_min=max(0, min(req.startInMinutes, 60 * 24 * 14)))
    except ValueError as e:
        raise HTTPException(422, str(e))
    return {"id": bid}


@app.get("/v1/broadcasts/{bid}")
def bc_detail(bid: int, tenant: dict = Depends(tenant_auth)):
    d = broadcast.detail(tenant["slug"], bid)
    if not d:
        raise HTTPException(404)
    return {**d, "created_at": str(d["created_at"]), "scheduled_at": str(d["scheduled_at"]) if d["scheduled_at"] else None,
            "next_send_at": str(d["next_send_at"]) if d["next_send_at"] else None, "finished_at": str(d["finished_at"]) if d["finished_at"] else None}


@app.post("/v1/broadcasts/{bid}/{action}")
def bc_action(bid: int, action: str, tenant: dict = Depends(tenant_auth)):
    if action not in ("pause", "resume", "cancel"):
        raise HTTPException(404)
    if not broadcast.set_status(tenant["slug"], bid, action):
        raise HTTPException(409, "La campaña no está en un estado que permita esa acción")
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


@app.post("/v1/whatsapp/qr")
async def wa_qr(tenant: dict = Depends(tenant_auth)):
    try:
        return await whatsapp.qr(tenant)
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(502, f"No se pudo obtener el código QR: {e}")


class EmailSendReq(BaseModel):
    userId: str
    userName: str = ""
    to: list[str] | str
    cc: list[str] | str = []
    subject: str = ""
    html: str
    parentType: str | None = None
    parentId: str | None = None
    inReplyTo: str | None = None
    references: list[str] = []
    record: bool = True


@app.post("/v1/email/send")
async def email_send(req: EmailSendReq, tenant: dict = Depends(tenant_auth)):
    """Envía un correo como el usuario (nombre, firma y Reply-To personales). 409 si la empresa no tiene el correo del Centro."""
    try:
        return await mailout.send(tenant, req.model_dump())
    except LookupError as e:
        raise HTTPException(409, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(502, f"No se pudo enviar el correo: {str(e)[:200]}")


@app.post("/v1/whatsapp/send")
async def wa_send(req: SendReq, tenant: dict = Depends(tenant_auth)):
    text = req.text.strip()
    if not text or len(text) > 4000:
        raise HTTPException(422, "El mensaje debe tener entre 1 y 4000 caracteres")
    job = db.log_job(tenant["slug"], "whatsapp_send", req.leadId)
    try:
        res = await whatsapp.send(tenant, req.leadId, text, req.agent, req.userId, req.phone)
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


# ---------------- simulador del proceso comercial y banco de conocimiento ----------------
class SimReq(BaseModel):
    userId: str
    userName: str = ""
    name: str = ""
    email: str = ""
    phone: str = ""
    real: bool = True
    steps: list[str] = []


@app.get("/v1/sim/config")
async def sim_config(tenant: dict = Depends(tenant_auth)):
    return {"config": simulate.config_probe(tenant), "steps": [{"key": k, "label": l} for k, l in simulate.STEPS]}


@app.post("/v1/sim/runs")
async def sim_start(req: SimReq, tenant: dict = Depends(tenant_auth)):
    return {"id": await simulate.start(tenant, req.model_dump())}


@app.get("/v1/sim/runs")
async def sim_list(userId: str = "", tenant: dict = Depends(tenant_auth)):
    return {"items": simulate.list_runs(tenant["slug"], userId or None)}


@app.get("/v1/sim/runs/{run_id}")
async def sim_get(run_id: int, userId: str = "", tenant: dict = Depends(tenant_auth)):
    r = simulate.get_run(tenant["slug"], run_id, userId or None)
    if not r:
        raise HTTPException(404, "Simulación no encontrada")
    return r


@app.delete("/v1/sim/runs/{run_id}")
async def sim_delete(run_id: int, userId: str = "", tenant: dict = Depends(tenant_auth)):
    if not await simulate.delete_run(tenant, run_id, userId or None):
        raise HTTPException(404, "Simulación no encontrada")
    return {"ok": True}


class NoteReq(BaseModel):
    userId: str
    userName: str = ""
    text: str


@app.get("/v1/kb")
async def kb_get(tenant: dict = Depends(tenant_auth)):
    return knowledge.get(tenant["slug"])


@app.post("/v1/kb/refresh")
async def kb_refresh(tenant: dict = Depends(tenant_auth)):
    async def ask(system: str, user: str) -> str:
        return await llm.chat_text(tenant, system, user)
    return await knowledge.refresh(tenant, ask)


@app.post("/v1/kb/notes")
async def kb_note(req: NoteReq, tenant: dict = Depends(tenant_auth)):
    if len(req.text.strip()) < 3:
        raise HTTPException(422, "Escribe la nota.")
    knowledge.add_note(tenant["slug"], req.userId, req.userName, req.text.strip())
    return {"ok": True}


@app.delete("/v1/kb/notes/{note_id}")
async def kb_note_delete(note_id: int, userId: str = "", tenant: dict = Depends(tenant_auth)):
    if not knowledge.delete_note(tenant["slug"], note_id, userId or None):
        raise HTTPException(404, "Nota no encontrada")
    return {"ok": True}


# ---------------- plantillas personales (correo, WhatsApp, Telegram, SMS) ----------------
class TplReq(BaseModel):
    userId: str
    channel: str
    name: str
    subject: str = ""
    body: str
    design: str | None = None
    id: int | None = None


@app.get("/v1/tpl")
async def tpl_list(userId: str, tenant: dict = Depends(tenant_auth)):
    return templates.list_for(tenant["slug"], userId, templates.limit_of(tenant))


@app.post("/v1/tpl")
async def tpl_save(req: TplReq, tenant: dict = Depends(tenant_auth)):
    try:
        return templates.save(tenant["slug"], req.userId, req.model_dump(), templates.limit_of(tenant))
    except ValueError as e:
        raise HTTPException(422, str(e))
    except PermissionError as e:
        raise HTTPException(409, str(e))
    except LookupError as e:
        raise HTTPException(404, str(e))


@app.delete("/v1/tpl/{tid}")
async def tpl_delete(tid: int, userId: str, tenant: dict = Depends(tenant_auth)):
    if not templates.delete(tenant["slug"], userId, tid):
        raise HTTPException(404, "Plantilla no encontrada.")
    return {"ok": True}


@app.get("/v1/wa/route")
async def wa_route(leadId: str, tenant: dict = Depends(tenant_auth)):
    """Número preferido para escribirle al cliente (el último desde el que respondió, o al que se le escribió) y quién le escribió."""
    r = routing.route_of(tenant["slug"], leadId) or {}
    return {"phone": r.get("last_in_phone") or r.get("last_out_phone"), "userId": r.get("user_id")}


# ---------------- procesos al llegar un lead (API/webhook con la identificación y datos del lead) ----------------
class ProcSaveReq(BaseModel):
    processes: list[dict]


class ProcTestReq(BaseModel):
    process: dict
    leadId: str | None = None


class ProcTriggerReq(BaseModel):
    leadId: str
    changed: bool = False
    processId: str | None = None
    manual: bool = False


@app.get("/v1/processes")
async def proc_list(tenant: dict = Depends(tenant_auth)):
    return {"processes": processes.public(processes.load(tenant)), "fields": list(processes.FIELDS), "max": processes.MAX_PROCESSES, "catalog": processes.catalog(tenant)}


@app.put("/v1/processes")
async def proc_save(req: ProcSaveReq, tenant: dict = Depends(tenant_auth)):
    try:
        new = processes.clean(req.processes, processes.load(tenant), processes.assigned(tenant))
    except ValueError as e:
        raise HTTPException(422, str(e))
    with db.pool.connection() as c:
        c.execute("UPDATE tenants SET settings = jsonb_set(settings, '{processes}', %s::jsonb, true) WHERE slug = %s", (json.dumps(new), tenant["slug"]))
    return {"processes": processes.public(new)}


@app.post("/v1/processes/test")
async def proc_test(req: ProcTestReq, tenant: dict = Depends(tenant_auth)):
    """Prueba una definición contra un lead real (o datos de ejemplo) sin guardar nada en el lead."""
    try:
        proc = processes.clean([req.process], processes.load(tenant), processes.assigned(tenant))[0]
    except ValueError as e:
        raise HTTPException(422, str(e))
    if req.leadId:
        lead = await Espo(tenant).get(f"Lead/{req.leadId}")
        values = processes.values_of(lead, tenant)
    else:
        values = {"identificacion": "1234567890", "tipo_identificacion": "CC", "nombre": "María", "apellido": "Pérez", "nombre_completo": "María Pérez", "telefono": "+573001234567",
                  "correo": "maria@example.com", "fuente": "Formulario Web", "campana": "", "formulario": "", "lead_id": "ejemplo", "empresa": tenant.get("name") or ""}
    return await processes.test(tenant, proc, values)


@app.post("/v1/process/trigger")
async def proc_trigger(req: ProcTriggerReq, tenant: dict = Depends(tenant_auth)):
    if req.manual:
        return {"runs": await processes.run_for_lead(tenant, req.leadId, process_id=req.processId, manual=True)}

    async def later():   # el CRM avisa dentro del guardado: se espera un instante a que el lead quede confirmado
        await asyncio.sleep(1.5)
        try:
            await processes.run_for_lead(tenant, req.leadId, process_id=req.processId, changed=req.changed)
        except Exception:
            logging.getLogger("hub.proc").exception("disparo de procesos")
        if not req.changed:   # lead nuevo: el comercial virtual programa su primer contacto
            try:
                await agent.on_lead(tenant, req.leadId)
            except Exception:
                logging.getLogger("hub.agent").exception("alta del lead en el comercial virtual")
    asyncio.create_task(later())
    return {"queued": True}


@app.get("/v1/process/runs")
async def proc_runs(leadId: str = "", tenant: dict = Depends(tenant_auth)):
    return {"items": processes.runs(tenant["slug"], leadId or None)}


# ---------------- lectura de documentos (PDF) con perfiles configurables ----------------
class DocProfilesReq(BaseModel):
    profiles: list[dict]


class DocExtractReq(BaseModel):
    leadId: str
    attachmentId: str
    profileId: str
    userId: str | None = None
    engine: str = "internal"
    leadName: str = ""


class DocApplyReq(BaseModel):
    leadId: str
    runId: int
    values: dict | list | None = None   # PHP envía [] cuando está vacío
    items: list[dict] | None = None
    agent: str = "Asesor"


class DocRememberReq(BaseModel):
    name: str
    items: list[dict]


@app.get("/v1/docs/profiles")
async def docs_profiles(tenant: dict = Depends(tenant_auth)):
    return {"profiles": documents.profiles(tenant), "types": documents.TYPES, "targets": list(processes.FIELDS), "max": documents.MAX_PROFILES}


@app.put("/v1/docs/profiles")
async def docs_profiles_save(req: DocProfilesReq, tenant: dict = Depends(tenant_auth)):
    try:
        new = documents.clean([p for p in req.profiles if not p.get("builtin")])
    except ValueError as e:
        raise HTTPException(422, str(e))
    with db.pool.connection() as c:
        c.execute("UPDATE tenants SET settings = jsonb_set(settings, '{doc_profiles}', %s::jsonb, true) WHERE slug = %s", (json.dumps(new), tenant["slug"]))
    return {"profiles": documents.BUILTIN + new}


@app.post("/v1/docs/extract")
async def docs_extract(req: DocExtractReq, tenant: dict = Depends(tenant_auth)):
    async def ask(system: str, user: str, schema: dict, max_tokens: int | None = None) -> dict:
        return await llm.chat_json(tenant, system, user, schema, max_tokens)
    try:
        return {"runId": await documents.start(tenant, req.leadId, req.attachmentId, req.profileId, req.userId, ask, req.engine, req.leadName), "status": "reading"}
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.get("/v1/docs/run")
async def docs_run(leadId: str, runId: int, tenant: dict = Depends(tenant_auth)):
    r = documents.get_run(tenant["slug"], leadId, runId)
    if not r:
        raise HTTPException(404, "Lectura inexistente.")
    return r


@app.post("/v1/docs/apply")
async def docs_apply(req: DocApplyReq, tenant: dict = Depends(tenant_auth)):
    try:
        if req.items is not None:
            return await documents.apply_items(tenant, req.leadId, req.runId, req.items, req.agent)
        return await documents.apply(tenant, req.leadId, req.runId, req.values if isinstance(req.values, dict) else {}, req.agent)
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.post("/v1/docs/remember")
async def docs_remember(req: DocRememberReq, tenant: dict = Depends(tenant_auth)):
    try:
        return {"profile": documents.profile_from_items(tenant, req.name.strip()[:80] or "Documento", req.items)}
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.get("/v1/docs/pending")
async def docs_pending(userId: str, tenant: dict = Depends(tenant_auth)):
    return {"items": documents.pending(tenant["slug"], userId)}


@app.post("/v1/docs/dismiss")
async def docs_dismiss(req: dict = Body(...), tenant: dict = Depends(tenant_auth)):
    documents.dismiss(tenant["slug"], str(req.get("userId", "")), int(req.get("runId", 0)))
    return {"ok": True}


@app.get("/v1/docs/history")
async def docs_history(leadId: str, tenant: dict = Depends(tenant_auth)):
    return {"items": documents.history(tenant["slug"], leadId)}


# ---------------- comercial virtual (versión automática del seguimiento de leads)
class AgentCfgReq(BaseModel):
    config: dict


class AgentTestReq(BaseModel):
    sample: dict


class AgentApprovalReq(BaseModel):
    leadId: str
    eventId: int
    message: str | None = None
    approve: bool = True
    by: str = "Un usuario"


class AgentActionReq(BaseModel):
    leadId: str
    action: str
    by: str = "Un usuario"


@app.get("/v1/agent/config")
async def agent_config(tenant: dict = Depends(tenant_auth)):
    return {"config": agent.config(tenant), "licensed": agent.licensed(tenant), "usage": agent.usage(tenant["slug"]), "company": tenant.get("name") or ""}


@app.put("/v1/agent/config")
async def agent_config_save(req: AgentCfgReq, tenant: dict = Depends(tenant_auth)):
    try:
        new = agent.clean_config(req.config)
    except (ValueError, TypeError) as e:
        raise HTTPException(422, str(e))
    if new["mode"] == "auto" and not agent.licensed(tenant):
        raise HTTPException(403, "La versión automática del comercial virtual no está activada para tu empresa. Pídela a tu proveedor; mientras tanto puedes dejar el modo manual y entrenar al agente.")
    with db.pool.connection() as c:
        c.execute("UPDATE tenants SET settings = jsonb_set(settings, '{agent}', %s::jsonb, true) WHERE slug = %s", (json.dumps(new), tenant["slug"]))
    return {"config": new}


@app.post("/v1/agent/test")
async def agent_test(req: AgentTestReq, tenant: dict = Depends(tenant_auth)):
    try:
        return await agent.test_reply(tenant, req.sample)
    except Exception as e:
        raise HTTPException(502, f"No se pudo generar la respuesta de prueba: {str(e)[:200]}")


@app.get("/v1/agent/lead")
async def agent_lead(leadId: str, tenant: dict = Depends(tenant_auth)):
    return agent.lead_state(tenant, leadId)


@app.post("/v1/agent/lead/action")
async def agent_lead_action(req: AgentActionReq, tenant: dict = Depends(tenant_auth)):
    try:
        await agent.lead_action(tenant, req.leadId, req.action, req.by)
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))
    return agent.lead_state(tenant, req.leadId)


@app.get("/v1/agent/pending")
async def agent_pending(tenant: dict = Depends(tenant_auth)):
    return {"items": agent.pending_proposals(tenant["slug"])}


@app.post("/v1/agent/approval")
async def agent_approval(req: AgentApprovalReq, tenant: dict = Depends(tenant_auth)):
    try:
        if req.approve:
            await agent.approve(tenant, req.leadId, req.eventId, req.message, req.by)
        else:
            await agent.reject(tenant, req.leadId, req.eventId, req.by)
    except ValueError as e:
        raise HTTPException(422, str(e))
    except RuntimeError as e:
        raise HTTPException(502, str(e))
    return agent.lead_state(tenant, req.leadId)


@app.get("/v1/agent/stats")
async def agent_stats(days: int = 30, tenant: dict = Depends(tenant_auth)):
    return {**agent.stats(tenant["slug"], max(1, min(365, days))), "events": agent.events(tenant["slug"], None, 40)}


# ---------------- motor de IA (por empresa)
class AiOwnReq(BaseModel):
    kind: str
    model: str = ""
    base_url: str = ""
    api_key: str = ""
    workspace_id: str = ""


def _ai_public(tenant: dict) -> dict:
    ai = (tenant.get("settings") or {}).get("ai") or {}
    eff = llm.resolve(tenant)
    own = ai.get("own") or {}
    k = own.get("api_key") or ""
    return {"mode": ai.get("mode") or "global", "kinds": llm.KINDS, "usage": llm.usage(tenant["slug"]),
            "effective": {"label": eff["label"], "kind": eff["kind"], "model": eff["model"], "source": eff["source"]},
            "own": {"kind": own.get("kind") or "anthropic", "model": own.get("model") or "", "base_url": own.get("base_url") or "", "workspace_id": own.get("workspace_id") or "", "secretSet": bool(k), "secretHint": ("…" + k[-4:]) if k else ""}}


@app.get("/v1/ai/config")
async def ai_config(tenant: dict = Depends(tenant_auth)):
    return _ai_public(tenant)


@app.put("/v1/ai/own")
async def ai_own_save(req: AiOwnReq, tenant: dict = Depends(tenant_auth)):
    ai = (tenant.get("settings") or {}).get("ai") or {}
    if (ai.get("mode") or "global") != "own":
        raise HTTPException(403, "Tu empresa usa el motor de IA del sistema. Si quieres usar el tuyo, pídelo a tu proveedor.")
    if req.kind not in llm.KINDS:
        raise HTTPException(422, "Tipo de motor no válido.")
    url = req.base_url.strip()[:300]
    if url:
        try:
            httpgen.check_url(url)
        except ValueError as e:
            raise HTTPException(422, str(e))
    old = ai.get("own") or {}
    import re as _re
    own = {"kind": req.kind, "model": req.model.strip()[:80], "base_url": url, "api_key": req.api_key.strip()[:500] or old.get("api_key", ""), "workspace_id": _re.sub(r"[^\w\-]", "", req.workspace_id)[:80]}
    with db.pool.connection() as c:
        c.execute("UPDATE tenants SET settings = jsonb_set(settings, '{ai}', COALESCE(settings->'ai', '{}'::jsonb) || jsonb_build_object('own', %s::jsonb), true) WHERE slug = %s", (json.dumps(own), tenant["slug"]))
    llm._cache["at"] = 0
    return {**_ai_public({**tenant, "settings": {**(tenant.get("settings") or {}), "ai": {**ai, "own": own}}})}


@app.post("/v1/ai/test")
async def ai_test(req: AiOwnReq | None = None, tenant: dict = Depends(tenant_auth)):
    """Prueba el motor que usa la empresa (o, si se envía un borrador del propio, ese)."""
    cfg = llm.resolve(tenant)
    if req and req.kind and (((tenant.get("settings") or {}).get("ai") or {}).get("mode") == "own"):
        old = (((tenant.get("settings") or {}).get("ai") or {}).get("own") or {})
        cfg = {"kind": req.kind, "model": req.model.strip(), "base_url": req.base_url.strip(), "api_key": req.api_key.strip() or old.get("api_key", ""), "workspace_id": req.workspace_id.strip(), "check_url": True}
    try:
        return await llm.test(cfg)
    except Exception as e:
        raise HTTPException(502, str(e)[:240])


if __name__ == "__main__":
    uvicorn.run(app, host=config.HUB_BIND_HOST, port=config.HUB_PORT)
