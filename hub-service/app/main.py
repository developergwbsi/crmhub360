"""Hub Service de Crm Hub 360: API FastAPI que consume EspoCRM (interfaz PHP), que recibe los webhooks de los canales y mantiene los workers.

Los endpoints se agrupan por secciones, en este orden: ingesta de leads (webhooks), integraciones del tenant, envío por canal (SMS, WhatsApp,
Telegram, voz, correo), campañas masivas, formularios web públicos, push, simulador y banco de conocimiento, plantillas, procesos, lectura de
documentos, comercial virtual, motor de IA y líneas de mensajería.

Autenticación: casi todo usa `tenant_auth` (cabeceras X-Tenant y X-Hub-Token, tenant con licencia activa); los webhooks usan ?token= o apikey (o el secreto
propio de Telegram); las rutas /v1/admin/* exigen X-Admin-Token; las /v1/public/* no piden credenciales.

Regla: toda ruta nueva debe registrarse ANTES del bloque `if __name__ == "__main__"` del final, o no existirá al arrancar con uvicorn."""
import asyncio
import hmac
import json
import logging
from datetime import datetime
import os
import re
import secrets
from contextlib import asynccontextmanager

import uvicorn
from fastapi import BackgroundTasks, Body, Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse, Response
from pydantic import BaseModel

import httpx

from . import bi, brand, chatbot, products, report, wallet, compliance, emailcheck, presets, finder, growth, pipeline, proposals, qualifier, prospects, recordings, iforms, meet, meet_summary, monitor, usage, form_templates, assistant, broadcast, config, credit, db, forms, httpgen, ingest, lines, push, qualify, sms, telegram, voice, whatsapp, mailbox, mailcfg, mailout, searchengines, resend_inbound, ollama, simulate, knowledge, templates, routing, processes, documents, agent, llm

log = logging.getLogger("crmhub")
logging.basicConfig(level=logging.INFO)
# Ollama atiende una inferencia a la vez con modelos locales; serializamos para no saturar la RAM.


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Arranque y cierre del Hub: abre el pool de BD, crea los esquemas y lanza los workers de campañas, buzón y comercial virtual."""
    db.pool.open()
    push.keys()  # crea las claves VAPID la primera vez
    simulate.ensure_schema()
    products.ensure_schema()
    wallet.ensure_schema()
    routing.ensure_schema()
    processes.ensure_schema()
    documents.ensure_schema()
    iforms.ensure_schema()
    bi.ensure_schema()
    recordings.ensure_schema()
    compliance.ensure_schema()
    prospects.ensure_schema()
    proposals.ensure_schema()
    emailcheck.ensure_schema()
    presets.ensure_schema()
    chatbot.ensure_schema()
    growth.ensure_schema()
    agent.ensure_schema()
    monitor.ensure_schema()
    usage.ensure_schema()
    meet.ensure_schema()
    meet_summary.ensure_schema()
    templates.ensure_schema()
    bg = asyncio.create_task(broadcast.worker())
    mb = asyncio.create_task(mailbox.worker())
    ag = asyncio.create_task(agent.worker())
    ms = asyncio.create_task(meet_summary.loop())
    gr = asyncio.create_task(growth.loop())
    pl = asyncio.create_task(pipeline.worker())
    yield
    pl.cancel()
    ms.cancel()
    gr.cancel()
    bg.cancel()
    mb.cancel()
    ag.cancel()
    db.pool.close()


app = FastAPI(title="Crm Hub 360 - Hub Service", lifespan=lifespan)


def _check(tenant: dict | None, token: str) -> dict:
    """Valida tenant y token (comparación en tiempo constante); 401 si no coinciden y 403 si la licencia no está activa."""
    if not tenant or not hmac.compare_digest(tenant["hub_token"], token or ""):
        raise HTTPException(401, "Tenant o token inválido")
    if tenant["status"] != "active":
        raise HTTPException(403, "Licencia suspendida o vencida")
    return tenant


def tenant_auth(x_tenant: str = Header(...), x_hub_token: str = Header(...)) -> dict:
    """Dependencia de FastAPI: autentica con las cabeceras X-Tenant y X-Hub-Token y devuelve el tenant."""
    return _check(db.get_tenant(x_tenant), x_hub_token)


class CreditReq(BaseModel):
    """Cuerpo para leer un informe de crédito adjunto a un lead."""
    leadId: str
    attachmentId: str


class AssistReq(BaseModel):
    """Cuerpo de las acciones del asistente IA sobre un lead."""
    leadId: str


async def _job(tenant: dict, kind: str, entity_id: str, coro_fn):
    """Ejecuta una tarea en segundo plano registrándola en ai_jobs (con el error si falla)."""
    job = db.log_job(tenant["slug"], kind, entity_id)
    try:
        await coro_fn()
        db.finish_job(job)
    except Exception as e:
        log.exception("job %s falló", job)
        db.finish_job(job, str(e)[:500])


@app.get("/health")
def health():
    """Comprobación de vida del Hub; devuelve el modelo de Ollama configurado."""
    return {"ok": True, "model": config.OLLAMA_MODEL}


@app.post("/v1/credit/parse", status_code=202)
async def credit_parse(req: CreditReq, bg: BackgroundTasks, tenant: dict = Depends(tenant_auth)):
    """Encola la lectura del informe de crédito de un adjunto del lead; lo llama la interfaz de Espo (responde 202)."""
    bg.add_task(_job, tenant, "credit_parse", req.leadId,
                lambda: credit.process(tenant, req.leadId, req.attachmentId))
    return {"status": "queued"}


@app.post("/v1/assistant/{action}")
async def assist(action: str, req: AssistReq, tenant: dict = Depends(tenant_auth)):
    """Ejecuta una acción del asistente IA (resumen, respuesta, etc.) sobre un lead y devuelve el texto; lo llama la interfaz de Espo."""
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
    """Autentica un webhook de ingesta: token en ?token= o en la cabecera apikey."""
    token = request.query_params.get("token") or request.headers.get("apikey") or ""
    return _check(db.get_tenant(slug), token)


@app.get("/v1/ingest/{slug}/facebook")
def fb_verify(slug: str, request: Request):
    """Verificación del webhook de Facebook Lead Ads (hub.challenge) con el token del tenant."""
    q = request.query_params
    t = db.get_tenant(slug)
    if t and q.get("hub.mode") == "subscribe" and hmac.compare_digest(q.get("hub.verify_token", ""), t["hub_token"]):
        return int(q["hub.challenge"])
    raise HTTPException(403)


@app.post("/v1/ingest/{slug}/facebook")
async def fb_ingest(slug: str, request: Request):
    """Webhook de Facebook Lead Ads: valida la firma de Meta y crea o actualiza los leads."""
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
    """Verificación del webhook de WhatsApp Cloud API (hub.challenge) con el token del tenant."""
    q = request.query_params
    t = db.get_tenant(slug)
    if t and q.get("hub.mode") == "subscribe" and hmac.compare_digest(q.get("hub.verify_token", ""), t["hub_token"]):
        return int(q["hub.challenge"])
    raise HTTPException(403)


@app.post("/v1/ingest/{slug}/whatsapp-cloud")
async def meta_wa_ingest(slug: str, request: Request):
    """Webhook de WhatsApp Cloud API: valida la firma de Meta y registra los mensajes entrantes."""
    tenant = _ingest_tenant(slug, request)
    raw = await request.body()
    _verify_signature(tenant, raw, request.headers.get("x-hub-signature-256"))
    return {"leads": await ingest.from_meta_whatsapp(tenant, json.loads(raw or b"{}"))}


@app.post("/v1/ingest/{slug}/gupshup")
async def gupshup_ingest(slug: str, request: Request):
    """Webhook de Gupshup: registra el mensaje entrante de WhatsApp."""
    tenant = _ingest_tenant(slug, request)
    return {"lead": await ingest.from_gupshup(tenant, await request.json())}


@app.post("/v1/ingest/{slug}/resend-mail")
async def resend_mail_ingest(slug: str, request: Request):
    """Webhook de correo entrante de Resend (email.received), autenticado con la firma Svix y el secreto de la empresa; responde 200 salvo firma inválida."""
    tenant = db.get_tenant(slug)
    secret = (((tenant or {}).get("settings") or {}).get("mailout") or {}).get("inbound_secret") or ""
    body = await request.body()
    if not tenant or not resend_inbound.verify(secret, body, request.headers):
        raise HTTPException(401, "No autorizado")
    if tenant["status"] != "active":
        raise HTTPException(403, "Licencia suspendida o vencida")
    try:
        return {"imported": await resend_inbound.handle(tenant, json.loads(body))}
    except Exception:
        log.exception("fallo al procesar un correo entrante de Resend")
        return {"imported": False}


@app.post("/v1/ingest/{slug}/telegram")
async def telegram_ingest(slug: str, request: Request):
    """Webhook de Telegram autenticado con el secreto del bot; siempre responde 200 para que Telegram no reintente."""
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
    """Webhook de Twilio (SMS/WhatsApp, formulario urlencoded); responde TwiML vacío."""
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
    """Devuelve el TwiML que conecta la llamada del asesor con el cliente (`to`); lo consume Twilio."""
    tenant = _ingest_tenant(slug, request)
    to = "+" + "".join(ch for ch in request.query_params.get("to", "") if ch.isdigit())
    return Response(voice.bridge_twiml(tenant, to), media_type="text/xml")


@app.post("/v1/ingest/{slug}/voice-status")
async def voice_status(slug: str, request: Request):
    """Callback de estado de llamada de Twilio: actualiza la llamada en Espo (Held o Not Held, fin) y deja una nota en el lead."""
    from urllib.parse import parse_qs
    tenant = _ingest_tenant(slug, request)
    form = {k: v[0] for k, v in parse_qs((await request.body()).decode("utf-8", "replace"), keep_blank_values=True).items()}
    call_id = request.query_params.get("call", "")
    st, dur = form.get("CallStatus", ""), int(form.get("CallDuration") or 0)
    if st == "completed" and dur > 0:   # minutos facturables de la llamada (se redondea hacia arriba, como cobran los proveedores)
        usage.record(tenant, "voice", "twilio", units=-(-dur // 60), kind="minutes", ext_id=form.get("CallSid", ""))
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
    """Webhook genérico para proveedores HTTP de SMS o WhatsApp (?channel=sms|whatsapp)."""
    tenant = _ingest_tenant(slug, request)
    ch = request.query_params.get("channel", "sms")
    if ch not in ("sms", "whatsapp"):
        raise HTTPException(422, "channel debe ser sms o whatsapp")
    return {"lead": await ingest.from_generic(tenant, ch, await request.json())}


@app.post("/v1/ingest/{slug}/evolution")
async def evo_ingest(slug: str, request: Request):
    """Webhook de Evolution API: registra los mensajes de WhatsApp entrantes."""
    tenant = _ingest_tenant(slug, request)
    return {"lead": await ingest.from_evolution(tenant, await request.json())}


@app.post("/v1/ingest/{slug}/web")
async def web_ingest(slug: str, request: Request):
    """Alta de un lead desde un formulario web externo (nombre, teléfono, correo, fuente y campaña)."""
    tenant = _ingest_tenant(slug, request)
    b = await request.json()
    lead = await ingest.upsert_lead(tenant, name=b.get("name", ""), phone=b.get("phone"), email=b.get("email"),
                                    source=b.get("source", "Formulario Web"), campaign=b.get("campaign"))
    return {"lead": lead}


# --- Integraciones del tenant (las consume el panel de administración de EspoCRM) ---
class SettingsReq(BaseModel):
    """Campos aceptados al guardar integraciones del tenant."""
    fb_page_token: str | None = None
    services: list[dict] | None = None
    evolution_url: str | None = None
    evolution_apikey: str | None = None
    evolution_instance: str | None = None


class SendReq(BaseModel):
    """Cuerpo para enviar un mensaje de texto a un lead (WhatsApp, SMS o Telegram)."""
    leadId: str
    text: str
    agent: str = 'Asesor'
    userId: str | None = None
    phone: str | None = None
    lineId: str | None = None


class PushSubReq(BaseModel):
    """Cuerpo para registrar la suscripción push de un dispositivo."""
    userId: str
    subscription: dict
    userAgent: str | None = None


class PushUnsubReq(BaseModel):
    """Cuerpo para dar de baja una suscripción push por su endpoint."""
    endpoint: str


class PushSendReq(BaseModel):
    """Cuerpo para enviar una notificación push a uno o varios usuarios."""
    userId: str | None = None
    userIds: list[str] | None = None
    tag: str = "crmhub-test"
    kind: str = "info"
    title: str = "Crm Hub 360"
    body: str
    url: str = "/"


class BroadcastReq(BaseModel):
    """Cuerpo del aviso push masivo de nueva versión (uso administrativo)."""
    tenant: str
    title: str = "Crm Hub 360 — nueva versión"
    body: str = "Hay una versión nueva disponible. Ábrela para actualizar."
    url: str = "/"


class QualifyReq(BaseModel):
    """Cuerpo con el id de un lead (calificar, invitar por Telegram)."""
    leadId: str


@app.get("/v1/tenant/settings")
async def tenant_settings(tenant: dict = Depends(tenant_auth)):
    """Estado completo de integraciones del tenant para el panel de administración de Espo; los secretos solo salen como pista de los últimos 4 caracteres."""
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
        "fieldTypes": forms.FIELD_TYPES, "fieldMaps": forms.MAPS, "formAction": forms.default_action(), "formTemplates": form_templates.catalog(), "formVars": forms.VARS_HELP,
        "services": qualify.services_for(tenant), "servicesCustomized": bool(st.get("services")), "pushDevices": push.count(tenant["slug"]),
        "metrics": [{"key": k, "label": v[0], "unit": v[2]} for k, v in qualify.METRICS.items()],
        "ops": qualify.OPS,
    }


SECRET_KEYS = {"fb_page_token", "evolution_apikey", "meta_access_token", "meta_app_secret", "gupshup_api_key", "telegram_bot_token", "twilio_auth_token"}
PLAIN_KEYS = {"evolution_instance", "meta_phone_number_id", "gupshup_source", "gupshup_app_name", "telegram_welcome",
              "twilio_account_sid", "twilio_sms_from", "twilio_wa_from", "twilio_voice_from"}


@app.put("/v1/tenant/settings")
def tenant_settings_update(body: dict = Body(...), tenant: dict = Depends(tenant_auth)):
    """Guarda integraciones del tenant (secretos solo si vienen no vacíos, proveedores, servicios y formularios validados) mezclándolas en settings."""
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


@app.get("/v1/forms/template/{key}")
def form_template(key: str, slugs: str = "", tenant: dict = Depends(tenant_auth)):
    """Construye una plantilla de formulario de la galería; la usa el editor de formularios de Espo."""
    try:
        return form_templates.build(key, {x for x in slugs.split(",") if x})
    except ValueError as e:
        raise HTTPException(404, str(e))


@app.post("/v1/tenant/settings/reset-services")
def reset_services(tenant: dict = Depends(tenant_auth)):
    """Quita los servicios personalizados del tenant para volver a los predeterminados."""
    with db.pool.connection() as c:
        c.execute("UPDATE tenants SET settings = settings - 'services' WHERE slug = %s", (tenant["slug"],))
    return {"ok": True}


class SmsTestReq(BaseModel):
    """Cuerpo de la prueba de SMS (número de destino)."""
    to: str


class CallReq(BaseModel):
    """Cuerpo para iniciar una llamada puente entre el asesor y el lead."""
    leadId: str
    agentPhone: str
    agent: str = "Asesor"
    agentId: str = ""
    lineId: str | None = None


class BroadcastCreate(BaseModel):
    """Cuerpo para crear una campaña de mensajes masivos."""
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
    """Envía un SMS a un lead (1 a 1000 caracteres) y registra el trabajo; lo llama la interfaz de Espo."""
    text = req.text.strip()
    if not text or len(text) > 1000:
        raise HTTPException(422, "El SMS debe tener entre 1 y 1000 caracteres")
    job = db.log_job(tenant["slug"], "sms_send", req.leadId)
    try:
        res = await sms.send(tenant, req.leadId, text, req.agent, req.userId, req.phone, req.lineId); db.finish_job(job); return res
    except ValueError as e:
        db.finish_job(job, str(e)[:500]); raise HTTPException(422, str(e))
    except Exception as e:
        db.finish_job(job, str(e)[:500]); raise HTTPException(502, f"No se pudo enviar: {e}")


@app.post("/v1/sms/test")
async def sms_test(req: SmsTestReq, tenant: dict = Depends(tenant_auth)):
    """Envía un SMS de prueba para verificar el proveedor configurado."""
    try:
        return await sms.test(tenant, req.to)
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.post("/v1/twilio/test")
async def twilio_test(tenant: dict = Depends(tenant_auth)):
    """Verifica las credenciales de Twilio y devuelve nombre y estado de la cuenta."""
    from . import twilio
    try:
        a = await twilio.account(tenant)
        return {"name": a.get("friendly_name"), "status": a.get("status")}
    except ValueError as e:
        raise HTTPException(422, str(e))



class SupportExchangeReq(BaseModel):
    """Cuerpo para canjear un código de acceso de soporte."""
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
    """Inicia una llamada saliente que conecta primero al asesor y luego al lead; registra el trabajo."""
    job = db.log_job(tenant["slug"], "voice_call", req.leadId)
    try:
        res = await voice.call(tenant, req.leadId, req.agentPhone, req.agent, req.agentId, req.lineId); db.finish_job(job); return res
    except ValueError as e:
        db.finish_job(job, str(e)[:500]); raise HTTPException(422, str(e))
    except Exception as e:
        db.finish_job(job, str(e)[:500]); raise HTTPException(502, f"No se pudo iniciar la llamada: {e}")


@app.get("/v1/broadcasts")
def bc_list(tenant: dict = Depends(tenant_auth)):
    """Lista las campañas de mensajes masivos del tenant y el estado, límites y política de cada canal."""
    return {"items": [{**b, "created_at": str(b["created_at"]), "scheduled_at": str(b["scheduled_at"]) if b["scheduled_at"] else None}
                      for b in broadcast.listing(tenant["slug"])], "channels": {k: {"label": v, "ready": broadcast.configured(tenant, k), "max": broadcast.LIMITS[k], "policy": broadcast.policy(tenant, k), "support": broadcast.SUPPORT_HINT} for k, v in broadcast.CHANNELS.items()}}


@app.post("/v1/broadcasts")
def bc_create(req: BroadcastCreate, tenant: dict = Depends(tenant_auth)):
    """Crea una campaña masiva (con inicio programado de hasta 14 días); la procesa el worker de broadcast."""
    try:
        bid = broadcast.create(tenant, name=req.name, channel=req.channel, text=req.text, lead_ids=req.leadIds, per_minute=req.perMinute,
                               footer=req.footer, by=req.by, start_in_min=max(0, min(req.startInMinutes, 60 * 24 * 14)))
    except ValueError as e:
        raise HTTPException(422, str(e))
    return {"id": bid}


@app.get("/v1/broadcasts/{bid}")
def bc_detail(bid: int, tenant: dict = Depends(tenant_auth)):
    """Detalle de una campaña, con sus fechas como texto; 404 si no existe."""
    d = broadcast.detail(tenant["slug"], bid)
    if not d:
        raise HTTPException(404)
    return {**d, "created_at": str(d["created_at"]), "scheduled_at": str(d["scheduled_at"]) if d["scheduled_at"] else None,
            "next_send_at": str(d["next_send_at"]) if d["next_send_at"] else None, "finished_at": str(d["finished_at"]) if d["finished_at"] else None}


@app.post("/v1/broadcasts/{bid}/{action}")
def bc_action(bid: int, action: str, tenant: dict = Depends(tenant_auth)):
    """Pausa, reanuda o cancela una campaña; 409 si su estado no lo permite."""
    if action not in ("pause", "resume", "cancel"):
        raise HTTPException(404)
    if not broadcast.set_status(tenant["slug"], bid, action):
        raise HTTPException(409, "La campaña no está en un estado que permita esa acción")
    return {"ok": True}


@app.post("/v1/telegram/setup")
async def tg_setup(tenant: dict = Depends(tenant_auth)):
    """Configura el bot de Telegram del tenant (webhook y datos del bot)."""
    try:
        return await telegram.setup(tenant)
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(502, f"No se pudo contactar a Telegram: {e}")


@app.post("/v1/telegram/test")
async def tg_test(tenant: dict = Depends(tenant_auth)):
    """Prueba la conexión con el bot de Telegram del tenant."""
    try:
        return await telegram.test(tenant)
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(502, f"No se pudo contactar a Telegram: {e}")


@app.post("/v1/telegram/send")
async def tg_send(req: SendReq, tenant: dict = Depends(tenant_auth)):
    """Envía un mensaje de Telegram a un lead (1 a 4000 caracteres) y registra el trabajo."""
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
    """Genera la invitación para que un lead hable con el bot de Telegram."""
    try:
        return await telegram.invite(tenant, req.leadId)
    except ValueError as e:
        raise HTTPException(422, str(e))


# --- Formularios web públicos (los publica el vhost como https://<dominio>/f/<slug>) ---
def _public_tenant(slug: str) -> dict:
    """Tenant activo para las rutas públicas; 404 si no existe o no está activo."""
    t = db.get_tenant(slug)
    if not t or t["status"] != "active":
        raise HTTPException(404, "No encontrado")
    return t


_FORM_HEADERS = {"Cache-Control": "no-store", "Content-Security-Policy": "frame-ancestors *", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff"}


@app.get("/v1/public/{slug}/forms/{form_slug}", response_class=HTMLResponse)
def form_page(slug: str, form_slug: str):
    """Página pública HTML de un formulario web (se publica en /f/<slug>); 404 si no existe."""
    t = _public_tenant(slug)
    f = forms.find(t, form_slug)
    if not f:
        return HTMLResponse("<!doctype html><meta charset=utf-8><p style='font:16px sans-serif;padding:2rem'>Este formulario no está disponible.</p>", 404, _FORM_HEADERS)
    return HTMLResponse(forms.page(f), headers=_FORM_HEADERS)


@app.get("/v1/public/{slug}/forms/{form_slug}/img/{action_id}/{n}")
def form_image(slug: str, form_slug: str, action_id: str, n: int):
    """Imagen pública de una acción del formulario (la usan los correos); con caché de un día."""
    t = _public_tenant(slug)
    f = forms.find(t, form_slug)
    img = forms.image_bytes(f, action_id, n) if f else None
    if not img:
        raise HTTPException(404, "No encontrado")
    return Response(img[0], media_type=img[1], headers={"Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff"})


@app.post("/v1/public/{slug}/forms/{form_slug}", response_class=HTMLResponse)
async def form_submit(slug: str, form_slug: str, request: Request):
    """Recibe el envío de un formulario público: valida, registra el lead y ejecuta las acciones; redirige o muestra la confirmación."""
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
    except forms.Duplicate as e:
        return HTMLResponse(forms.page(f, done={"notice": str(e)}), headers=_FORM_HEADERS)
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
    """Clave pública VAPID para suscribir dispositivos a notificaciones push."""
    return {"publicKey": push.keys()["public"]}


@app.post("/v1/push/subscribe")
def push_subscribe(req: PushSubReq, tenant: dict = Depends(tenant_auth)):
    """Registra la suscripción push de un usuario."""
    try:
        push.save(tenant["slug"], req.userId, req.subscription, req.userAgent)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return {"ok": True}


@app.post("/v1/push/unsubscribe")
def push_unsubscribe(req: PushUnsubReq, tenant: dict = Depends(tenant_auth)):
    """Elimina una suscripción push."""
    push.remove(req.endpoint)
    return {"ok": True}


@app.post("/v1/push/send")
async def push_send(req: PushSendReq, tenant: dict = Depends(tenant_auth)):
    """Envía una notificación push a usuarios del tenant."""
    return await push.send(tenant["slug"], title=req.title, body=req.body, url=req.url, kind=req.kind[:20], tag=req.tag[:80], user_id=req.userId, user_ids=req.userIds)


@app.post("/v1/admin/push/broadcast")
async def push_broadcast(req: BroadcastReq, x_admin_token: str = Header(...)):
    """Lo llama el despliegue (bin/crmhub) cuando cambia la versión de un tenant."""
    if not hmac.compare_digest(x_admin_token, config.HUB_ADMIN_TOKEN):
        raise HTTPException(401)
    if not db.get_tenant(req.tenant):
        raise HTTPException(404, "Tenant desconocido")
    return await push.send(req.tenant, title=req.title, body=req.body, url=req.url, tag="crmhub-update", kind="update")


def _lid(body) -> str | None:
    """lineId opcional del cuerpo (el CRM puede enviar un objeto o una lista vacía)."""
    return body.get("lineId") if isinstance(body, dict) and isinstance(body.get("lineId"), str) else None


@app.post("/v1/whatsapp/test")
async def wa_test(body: dict | list | None = Body(None), tenant: dict = Depends(tenant_auth)):
    """Prueba la conexión del proveedor de WhatsApp de la línea indicada."""
    try:
        return await whatsapp.test(lines.effective(tenant, "whatsapp", _lid(body), allow_off=True))
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(502, f"No se pudo conectar con Evolution API: {e}")


@app.post("/v1/whatsapp/qr")
async def wa_qr(body: dict | list | None = Body(None), tenant: dict = Depends(tenant_auth)):
    """Obtiene el código QR para vincular un número de WhatsApp (Evolution)."""
    if lines.is_managed(tenant, _lid(body)):
        raise HTTPException(403, "Esta línea la administra Crm Hub 360: pídele a soporte que la vincule o cambie de número.")
    try:
        return await whatsapp.qr(lines.effective(tenant, "whatsapp", _lid(body), allow_off=True))
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(502, f"No se pudo obtener el código QR: {e}")


@app.post("/v1/whatsapp/unlink")
async def wa_unlink(body: dict | list | None = Body(None), tenant: dict = Depends(tenant_auth)):
    """Cierra la sesión del número vinculado (Evolution) para poder escanear otro número."""
    if lines.is_managed(tenant, _lid(body)):
        raise HTTPException(403, "Esta línea la administra Crm Hub 360: pídele a soporte que la vincule o cambie de número.")
    try:
        return await whatsapp.unlink(lines.effective(tenant, "whatsapp", _lid(body), allow_off=True))
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(502, f"No se pudo desvincular el número: {e}")


class EmailSendReq(BaseModel):
    """Cuerpo para enviar un correo como un usuario del CRM."""
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
    """Envía un mensaje de WhatsApp a un lead (1 a 4000 caracteres) y registra el trabajo; lo llama la interfaz de Espo."""
    text = req.text.strip()
    if not text or len(text) > 4000:
        raise HTTPException(422, "El mensaje debe tener entre 1 y 4000 caracteres")
    job = db.log_job(tenant["slug"], "whatsapp_send", req.leadId)
    try:
        res = await whatsapp.send(tenant, req.leadId, text, req.agent, req.userId, req.phone, req.lineId)
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
    """Califica un lead con IA (servicio sugerido y puntaje) y registra el trabajo."""
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
    """Métricas de licenciamiento por tenant y de trabajos de IA; solo con el token de administración del Hub."""
    if not hmac.compare_digest(x_admin_token, config.HUB_ADMIN_TOKEN):
        raise HTTPException(401)
    with db.pool.connection() as c:
        tenants = c.execute("SELECT slug,name,plan,max_users,status,license_until FROM tenants ORDER BY slug").fetchall()
        jobs = c.execute("SELECT tenant,kind,status,count(*) n FROM ai_jobs GROUP BY 1,2,3 ORDER BY 1").fetchall()
    return {"tenants": tenants, "ai_jobs": jobs}


# ---------------- simulador del proceso comercial y banco de conocimiento ----------------
class SimReq(BaseModel):
    """Cuerpo para iniciar una simulación del proceso comercial."""
    userId: str
    userName: str = ""
    name: str = ""
    email: str = ""
    phone: str = ""
    real: bool = True
    steps: list[str] = []


@app.get("/v1/sim/config")
async def sim_config(tenant: dict = Depends(tenant_auth)):
    """Verificación de configuración y pasos disponibles del simulador."""
    return {"config": simulate.config_probe(tenant), "steps": [{"key": k, "label": l} for k, l in simulate.STEPS]}


@app.post("/v1/sim/runs")
async def sim_start(req: SimReq, tenant: dict = Depends(tenant_auth)):
    """Inicia una simulación del proceso comercial y devuelve su id."""
    return {"id": await simulate.start(tenant, req.model_dump())}


@app.get("/v1/sim/runs")
async def sim_list(userId: str = "", tenant: dict = Depends(tenant_auth)):
    """Lista las simulaciones del tenant (opcionalmente de un usuario)."""
    return {"items": simulate.list_runs(tenant["slug"], userId or None)}


@app.get("/v1/sim/runs/{run_id}")
async def sim_get(run_id: int, userId: str = "", tenant: dict = Depends(tenant_auth)):
    """Detalle de una simulación; 404 si no existe."""
    r = simulate.get_run(tenant["slug"], run_id, userId or None)
    if not r:
        raise HTTPException(404, "Simulación no encontrada")
    return r


@app.delete("/v1/sim/runs/{run_id}")
async def sim_delete(run_id: int, userId: str = "", tenant: dict = Depends(tenant_auth)):
    """Elimina una simulación; 404 si no existe."""
    if not await simulate.delete_run(tenant, run_id, userId or None):
        raise HTTPException(404, "Simulación no encontrada")
    return {"ok": True}


class NoteReq(BaseModel):
    """Cuerpo para añadir una nota al banco de conocimiento."""
    userId: str
    userName: str = ""
    text: str


@app.get("/v1/kb")
async def kb_get(tenant: dict = Depends(tenant_auth)):
    """Banco de conocimiento del tenant."""
    return knowledge.get(tenant["slug"])


@app.post("/v1/kb/refresh")
async def kb_refresh(tenant: dict = Depends(tenant_auth)):
    """Regenera el banco de conocimiento con el modelo de IA del tenant."""
    async def ask(system: str, user: str) -> str:
        return await llm.chat_text(tenant, system, user)
    return await knowledge.refresh(tenant, ask)


@app.post("/v1/kb/notes")
async def kb_note(req: NoteReq, tenant: dict = Depends(tenant_auth)):
    """Añade una nota manual al banco de conocimiento (mínimo 3 caracteres)."""
    if len(req.text.strip()) < 3:
        raise HTTPException(422, "Escribe la nota.")
    knowledge.add_note(tenant["slug"], req.userId, req.userName, req.text.strip())
    return {"ok": True}


@app.delete("/v1/kb/notes/{note_id}")
async def kb_note_delete(note_id: int, userId: str = "", tenant: dict = Depends(tenant_auth)):
    """Borra una nota del banco de conocimiento; 404 si no existe."""
    if not knowledge.delete_note(tenant["slug"], note_id, userId or None):
        raise HTTPException(404, "Nota no encontrada")
    return {"ok": True}


# ---------------- plantillas personales (correo, WhatsApp, Telegram, SMS) ----------------
class TplReq(BaseModel):
    """Cuerpo para guardar una plantilla personal de mensaje."""
    userId: str
    channel: str
    name: str
    subject: str = ""
    body: str
    design: str | None = None
    id: int | None = None


@app.get("/v1/tpl")
async def tpl_list(userId: str, tenant: dict = Depends(tenant_auth)):
    """Plantillas personales del usuario y el límite de la licencia."""
    return templates.list_for(tenant["slug"], userId, templates.limit_of(tenant))


@app.post("/v1/tpl")
async def tpl_save(req: TplReq, tenant: dict = Depends(tenant_auth)):
    """Crea o edita una plantilla personal (422 inválida, 409 sin permiso, 404 si no existe)."""
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
    """Borra una plantilla personal del usuario; 404 si no existe."""
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
    """Cuerpo para guardar los procesos que se ejecutan al llegar un lead."""
    processes: list[dict]


class ProcTestReq(BaseModel):
    """Cuerpo para probar una definición de proceso, con un lead real opcional."""
    process: dict
    leadId: str | None = None


class ProcTriggerReq(BaseModel):
    """Cuerpo con que el CRM avisa de un lead nuevo o modificado para disparar procesos y el comercial virtual."""
    leadId: str
    changed: bool = False
    processId: str | None = None
    manual: bool = False
    agentId: str | None = None    # comercial virtual que decidió el reparto de leads (lo manda el CRM al crear el lead)
    decided: bool = False         # el CRM sí consultó el reparto (si agentId viene vacío, lo atiende una persona)


@app.get("/v1/processes")
async def proc_list(tenant: dict = Depends(tenant_auth)):
    """Procesos configurados, campos disponibles, máximo y catálogo."""
    return {"processes": processes.public(processes.load(tenant)), "fields": list(processes.FIELDS), "max": processes.MAX_PROCESSES, "catalog": processes.catalog(tenant)}


@app.put("/v1/processes")
async def proc_save(req: ProcSaveReq, tenant: dict = Depends(tenant_auth)):
    """Valida y guarda los procesos del tenant (settings.processes)."""
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
    """Lo llama el CRM al guardar un lead: ejecuta los procesos (manual en el acto; si no, tras 1,5 s en segundo plano) y, si el lead es nuevo, da de alta al comercial virtual."""
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
                await agent.on_lead(tenant, req.leadId, req.agentId, req.decided)
            except Exception:
                logging.getLogger("hub.agent").exception("alta del lead en el comercial virtual")
    asyncio.create_task(later())
    return {"queued": True}


@app.get("/v1/process/runs")
async def proc_runs(leadId: str = "", tenant: dict = Depends(tenant_auth)):
    """Historial de ejecuciones de procesos (de un lead o del tenant)."""
    return {"items": processes.runs(tenant["slug"], leadId or None)}


# ---------------- lectura de documentos (PDF) con perfiles configurables ----------------
class DocProfilesReq(BaseModel):
    """Cuerpo para guardar los perfiles de lectura de documentos."""
    profiles: list[dict]


class DocExtractReq(BaseModel):
    """Cuerpo para iniciar la lectura de un PDF adjunto a un lead."""
    leadId: str
    attachmentId: str
    profileId: str
    userId: str | None = None
    engine: str = "internal"
    leadName: str = ""


class DocApplyReq(BaseModel):
    """Cuerpo para aplicar al lead los datos leídos de un documento."""
    leadId: str
    runId: int
    values: dict | list | None = None   # PHP envía [] cuando está vacío
    items: list[dict] | None = None
    agent: str = "Asesor"


class DocRememberReq(BaseModel):
    """Cuerpo para crear un perfil de lectura a partir de campos ya revisados."""
    name: str
    items: list[dict]


# ---------------- formularios internos (diseñados por la empresa; ver iforms.py)
class IFormsSaveReq(BaseModel):
    """Definiciones de los formularios internos de la empresa."""
    forms: list[dict]
    by: str = ""


class IFormEntryReq(BaseModel):
    """Respuestas de un formulario para un lead."""
    leadId: str
    formId: str
    values: dict = {}
    entryId: int | None = None
    userId: str = ""
    userName: str = ""
    partial: bool = False


class IFormActionReq(BaseModel):
    """Acción de botón de un formulario sobre una respuesta ya guardada."""
    entryId: int
    actionId: str
    leadId: str = ""
    userId: str = ""
    userName: str = ""


@app.get("/v1/iforms")
async def iforms_list(all: bool = False, tenant: dict = Depends(tenant_auth)):
    """Formularios de la empresa (solo los activos, salvo all=true para quien los administra) y los catálogos para diseñarlos."""
    from . import documents
    return {"forms": iforms.defs(tenant["slug"], only_active=not all), "fieldTypes": iforms.FIELD_TYPES, "actionTypes": iforms.ACTION_TYPES, "leadTargets": iforms.LEAD_TARGETS,
            "docProfiles": [{"id": p["id"], "name": p["name"]} for p in documents.profiles(tenant)]}


@app.put("/v1/iforms")
async def iforms_save(req: IFormsSaveReq, tenant: dict = Depends(tenant_auth)):
    try:
        return {"forms": iforms.save_defs(tenant["slug"], req.forms, req.by)}
    except ValueError as e:
        raise HTTPException(422, str(e))


class IFormPreviewReq(BaseModel):
    """Dirección de la página que se quiere ver para elegir datos."""
    url: str


class IFormPickReq(BaseModel):
    """Elemento elegido (posición data-chi) en una vista previa."""
    previewId: str
    idx: int


@app.post("/v1/iforms/webpreview")
async def iforms_webpreview(req: IFormPreviewReq, tenant: dict = Depends(tenant_auth)):
    """Descarga una página pública y la devuelve lista para mostrarla y elegir datos con clics."""
    from . import webscrape
    try:
        final, html = await webscrape.fetch(req.url.strip()[:600])
        return webscrape.preview(tenant["slug"], final, html)
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.post("/v1/iforms/webpick")
async def iforms_webpick(req: IFormPickReq, tenant: dict = Depends(tenant_auth)):
    """Selector CSS y texto de muestra del elemento elegido en la vista previa."""
    from . import webscrape
    try:
        return webscrape.pick(tenant["slug"], req.previewId, req.idx)
    except ValueError as e:
        raise HTTPException(422, str(e))


class WebSourcesSaveReq(BaseModel):
    """Consultas web guardadas de la empresa."""
    sources: list[dict]


class WebSourceRunReq(BaseModel):
    """Ejecutar una consulta web guardada sobre un lead."""
    sourceId: str
    leadId: str
    userName: str = ""


class WebSessionOpenReq(BaseModel):
    """Abrir un navegador de grabación en una dirección."""
    url: str = ""


class WebSessionActionReq(BaseModel):
    """Acción en el navegador de grabación: goto, click, probe, type, press, scroll, back, wait."""
    type: str
    x: int = 0
    y: int = 0
    text: str = ""
    key: str = ""
    url: str = ""
    dy: int = 0


@app.post("/v1/websessions")
async def websession_open(req: WebSessionOpenReq, tenant: dict = Depends(tenant_auth)):
    from . import browser
    try:
        return await browser.open_session(tenant["slug"], req.url.strip()[:600])
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.post("/v1/websessions/{sid}/action")
async def websession_action(sid: str, req: WebSessionActionReq, tenant: dict = Depends(tenant_auth)):
    from . import browser
    try:
        return await browser.action(tenant["slug"], sid, req.model_dump())
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.delete("/v1/websessions/{sid}")
async def websession_close(sid: str, tenant: dict = Depends(tenant_auth)):
    from . import browser
    await browser.close_session(tenant["slug"], sid)
    return {"ok": True}


# ---------------- reportes y tableros (BI)
class BiItemReq(BaseModel):
    """Reporte o tablero de un usuario."""
    id: str | None = None
    kind: str
    name: str
    definition: dict = {}
    share: str = "none"
    userId: str
    userName: str = ""
    teams: list[str] = []
    manager: bool = False


class BiFormQueryReq(BaseModel):
    """Consulta sobre las respuestas de un formulario interno."""
    formId: str
    query: dict
    leadIds: list[str] | None = None


class BiPinReq(BaseModel):
    """Fijar un tablero en el escritorio de un usuario (siempre o entre fechas), quitarlo o moverlo."""
    id: str
    userId: str
    teams: list[str] = []
    dateFrom: str = ""
    dateTo: str = ""
    tab: str = ""
    place: str = "top"
    up: bool = True


@app.get("/v1/bi/pins")
async def bi_pins(userId: str, teams: str = "", tenant: dict = Depends(tenant_auth)):
    return {"pins": bi.pins(tenant["slug"], userId, [t for t in teams.split(",") if t])}


@app.put("/v1/bi/pin")
async def bi_pin(req: BiPinReq, tenant: dict = Depends(tenant_auth)):
    try:
        return bi.pin_set(tenant["slug"], req.userId, req.teams, req.id, req.dateFrom, req.dateTo, req.tab, req.place)
    except ValueError as e:
        raise HTTPException(422, str(e))
    except PermissionError as e:
        raise HTTPException(403, str(e))


@app.delete("/v1/bi/pin")
async def bi_unpin(id: str, userId: str, tenant: dict = Depends(tenant_auth)):
    return {"ok": bi.pin_del(tenant["slug"], userId, id)}


@app.post("/v1/bi/pinmove")
async def bi_pinmove(req: BiPinReq, tenant: dict = Depends(tenant_auth)):
    return {"ok": bi.pin_move(tenant["slug"], req.userId, req.id, req.up)}


@app.get("/v1/bi/items")
async def bi_items(userId: str, teams: str = "", tenant: dict = Depends(tenant_auth)):
    return {"items": bi.items(tenant["slug"], userId, [t for t in teams.split(",") if t]), "forms": bi.form_meta(tenant["slug"])}


@app.get("/v1/bi/item")
async def bi_item(id: str, userId: str, teams: str = "", tenant: dict = Depends(tenant_auth)):
    r = bi.get_item(tenant["slug"], id, userId, [t for t in teams.split(",") if t])
    if not r:
        raise HTTPException(404, "No existe o no tienes acceso.")
    return r


@app.put("/v1/bi/item")
async def bi_save(req: BiItemReq, tenant: dict = Depends(tenant_auth)):
    try:
        return bi.save_item(tenant["slug"], req.id, req.kind, req.name, req.definition, req.share, req.userId, req.userName, req.teams, req.manager)
    except ValueError as e:
        raise HTTPException(422, str(e))
    except PermissionError as e:
        raise HTTPException(403, str(e))


@app.delete("/v1/bi/item")
async def bi_delete(id: str, userId: str, manager: bool = False, tenant: dict = Depends(tenant_auth)):
    try:
        return {"ok": bi.delete_item(tenant["slug"], id, userId, manager)}
    except PermissionError as e:
        raise HTTPException(403, str(e))


@app.post("/v1/bi/formquery")
async def bi_formquery(req: BiFormQueryReq, tenant: dict = Depends(tenant_auth)):
    try:
        return bi.form_query(tenant["slug"], req.formId, req.query, req.leadIds)
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.get("/v1/websources")
async def websources_list(all: bool = False, tenant: dict = Depends(tenant_auth)):
    return {"sources": iforms.sources(tenant["slug"], only_active=not all)}


@app.put("/v1/websources")
async def websources_save(req: WebSourcesSaveReq, tenant: dict = Depends(tenant_auth)):
    try:
        return {"sources": iforms.save_sources(tenant["slug"], req.sources)}
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.post("/v1/websources/run")
async def websources_run(req: WebSourceRunReq, tenant: dict = Depends(tenant_auth)):
    try:
        return await iforms.run_source(tenant, req.sourceId, req.leadId, req.userName)
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.get("/v1/iforms/entries")
async def iforms_entries(leadId: str, tenant: dict = Depends(tenant_auth)):
    return {"entries": iforms.entries(tenant["slug"], leadId)}


@app.post("/v1/iforms/entry")
async def iforms_entry(req: IFormEntryReq, tenant: dict = Depends(tenant_auth)):
    try:
        return await iforms.save_entry(tenant, req.leadId, req.formId, req.values, req.entryId, req.userId, req.userName, "manual", req.partial)
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.post("/v1/iforms/action")
async def iforms_action(req: IFormActionReq, tenant: dict = Depends(tenant_auth)):
    try:
        return await iforms.run_action(tenant, req.entryId, req.actionId, req.userId, req.userName, req.leadId)
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.get("/v1/docs/profiles")
async def docs_profiles(tenant: dict = Depends(tenant_auth)):
    """Perfiles de lectura de documentos (incluidos los integrados), tipos y campos destino."""
    ft = [{"value": f"form:{d['id']}.{x['key']}", "label": f"Formulario «{d['name']}» › {x['label']}"} for d in iforms.defs(tenant["slug"], only_active=True) for x in d["fields"] if x["type"] != "heading"]
    return {"profiles": documents.profiles(tenant), "types": documents.TYPES, "targets": list(processes.FIELDS), "formTargets": ft, "max": documents.MAX_PROFILES}


@app.put("/v1/docs/profiles")
async def docs_profiles_save(req: DocProfilesReq, tenant: dict = Depends(tenant_auth)):
    """Guarda los perfiles personalizados (los integrados no se guardan)."""
    try:
        new = documents.clean([p for p in req.profiles if not p.get("builtin")])
    except ValueError as e:
        raise HTTPException(422, str(e))
    with db.pool.connection() as c:
        c.execute("UPDATE tenants SET settings = jsonb_set(settings, '{doc_profiles}', %s::jsonb, true) WHERE slug = %s", (json.dumps(new), tenant["slug"]))
    return {"profiles": documents.BUILTIN + new}


@app.post("/v1/docs/extract")
async def docs_extract(req: DocExtractReq, tenant: dict = Depends(tenant_auth)):
    """Inicia la lectura de un documento con el perfil elegido y responde de inmediato con el id de lectura (estado «reading»)."""
    async def ask(system: str, user: str, schema: dict, max_tokens: int | None = None) -> dict:
        return await llm.chat_json(tenant, system, user, schema, max_tokens)
    try:
        return {"runId": await documents.start(tenant, req.leadId, req.attachmentId, req.profileId, req.userId, ask, req.engine, req.leadName), "status": "reading"}
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.get("/v1/docs/run")
async def docs_run(leadId: str, runId: int, tenant: dict = Depends(tenant_auth)):
    """Estado y resultado de una lectura de documento; 404 si no existe."""
    r = documents.get_run(tenant["slug"], leadId, runId)
    if not r:
        raise HTTPException(404, "Lectura inexistente.")
    return r


@app.post("/v1/docs/apply")
async def docs_apply(req: DocApplyReq, tenant: dict = Depends(tenant_auth)):
    """Aplica al lead los valores o ítems leídos de un documento."""
    try:
        if req.items is not None:
            return await documents.apply_items(tenant, req.leadId, req.runId, req.items, req.agent)
        return await documents.apply(tenant, req.leadId, req.runId, req.values if isinstance(req.values, dict) else {}, req.agent)
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.post("/v1/docs/remember")
async def docs_remember(req: DocRememberReq, tenant: dict = Depends(tenant_auth)):
    """Crea un perfil de lectura reutilizable a partir de los ítems indicados."""
    try:
        return {"profile": documents.profile_from_items(tenant, req.name.strip()[:80] or "Documento", req.items)}
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.get("/v1/docs/pending")
async def docs_pending(userId: str, tenant: dict = Depends(tenant_auth)):
    """Lecturas de documentos pendientes de revisar por el usuario."""
    return {"items": documents.pending(tenant["slug"], userId)}


@app.post("/v1/docs/dismiss")
async def docs_dismiss(req: dict = Body(...), tenant: dict = Depends(tenant_auth)):
    """Descarta una lectura pendiente del usuario."""
    documents.dismiss(tenant["slug"], str(req.get("userId", "")), int(req.get("runId", 0)))
    return {"ok": True}


@app.get("/v1/docs/history")
async def docs_history(leadId: str, tenant: dict = Depends(tenant_auth)):
    """Historial de lecturas de documentos de un lead."""
    return {"items": documents.history(tenant["slug"], leadId)}


# ---------------- comercial virtual (versión automática del seguimiento de leads)
class AgentCfgReq(BaseModel):
    """Cuerpo para guardar el entrenamiento de un comercial virtual."""
    config: dict
    agentId: str | None = None
    name: str | None = None


class AgentTestReq(BaseModel):
    """Cuerpo de la prueba de respuesta del comercial virtual."""
    sample: dict


class AgentApprovalReq(BaseModel):
    """Cuerpo para aprobar o descartar un mensaje propuesto por el comercial virtual."""
    leadId: str
    eventId: int
    message: str | None = None
    approve: bool = True
    by: str = "Un usuario"


class AgentActionReq(BaseModel):
    """Cuerpo de una intervención humana sobre un lead del comercial virtual."""
    leadId: str
    action: str
    by: str = "Un usuario"


def _agent_cards(tenant: dict) -> list[dict]:
    """Resumen de cada comercial virtual (modo, persona, canales, menús y estadísticas) para el panel."""
    by = agent.by_agent(tenant["slug"])
    out = []
    for a in agent.agents(tenant):
        cfg = a["config"]
        out.append({"id": a["id"], "name": a["name"], "enabled": a.get("enabled", True), "mode": cfg["mode"], "dry_run": cfg["dry_run"], "persona": cfg["persona"]["name"], "role": cfg["persona"]["role"],
                    "channels": [k for k, v in cfg["channels"].items() if v], "menus": len([m for m in cfg.get("menus") or [] if m.get("enabled")]), "stats": by.get(a["id"], {"leads": 0, "active": 0, "sent": 0})})
    return out


def _agent_overview(tenant: dict, agent_id: str | None = None) -> dict:
    """Vista completa que consume el panel del comercial virtual: configuración elegida, tarjetas, reparto, cupos, licencia y consumo."""
    sel = agent.get_agent(tenant, agent_id)
    return {"config": sel["config"], "selectedId": sel["id"], "name": sel["name"], "agents": _agent_cards(tenant), "dispatch": agent.dispatch_cfg(tenant), "slots": agent.slots(tenant),
            "licensed": agent.licensed(tenant), "usage": agent.usage(tenant["slug"]), "company": tenant.get("name") or ""}


@app.get("/v1/agent/config")
async def agent_config(agentId: str = "", tenant: dict = Depends(tenant_auth)):
    """Configuración y panorama del comercial virtual seleccionado."""
    return _agent_overview(tenant, agentId or None)


def _store_agents(tenant: dict, lst: list[dict]) -> None:
    """Persiste la lista de comerciales virtuales del tenant."""
    agent.save_agents(tenant["slug"], lst)


@app.put("/v1/agent/config")
async def agent_config_save(req: AgentCfgReq, tenant: dict = Depends(tenant_auth)):
    """Guarda el entrenamiento de un comercial virtual; el modo automático exige licencia (403)."""
    try:
        new = agent.clean_config(req.config)
    except (ValueError, TypeError) as e:
        raise HTTPException(422, str(e))
    if new["mode"] == "auto" and not agent.licensed(tenant):
        raise HTTPException(403, "La versión automática del comercial virtual no está activada para tu empresa. Pídela a tu proveedor; mientras tanto puedes dejar el modo manual y entrenar al agente.")
    lst = agent._raw_agents(tenant)
    cur = next((a for a in lst if a["id"] == (req.agentId or lst[0]["id"])), None)
    if not cur:
        raise HTTPException(404, "Ese comercial virtual no existe")
    cur["config"] = new
    if req.name is not None and req.name.strip():
        cur["name"] = req.name.strip()[:60]
    _store_agents(tenant, lst)
    return {"config": new, "agentId": cur["id"]}


class AgentNewReq(BaseModel):
    """Cuerpo para crear un comercial virtual (opcionalmente clonando otro)."""
    name: str = ""
    cloneFrom: str | None = None


class AgentIdReq(BaseModel):
    """Cuerpo con el id de un comercial virtual."""
    id: str


class AgentEnableReq(BaseModel):
    """Cuerpo para encender o apagar un comercial virtual."""
    id: str
    enabled: bool


class DispatchReq(BaseModel):
    """Cuerpo del reparto de leads entre personas y comerciales virtuales."""
    mode: str = "shared"
    weights: dict = {}


@app.post("/v1/agents")
async def agents_create(req: AgentNewReq, tenant: dict = Depends(tenant_auth)):
    """Crea un comercial virtual (los que pasen de los incluidos tienen un costo adicional en la factura); arranca en manual y en prueba."""
    lst = agent._raw_agents(tenant)
    # sin tope: los comerciales por encima de los incluidos en la licencia se suman a la factura de la empresa (se avisa en pantalla y en el Centro de control)
    src = next((a for a in agent.agents(tenant) if a["id"] == req.cloneFrom), None)
    cfg = json.loads(json.dumps(src["config"])) if src else agent.clean_config({})
    cfg["mode"], cfg["dry_run"] = "manual", True   # un comercial nuevo arranca en prueba y en manual hasta que lo entrenes y lo actives
    nid = "a_" + secrets.token_hex(4)
    name = req.name.strip()[:60] or (f"{src['name']} (copia)" if src else f"Comercial virtual {len(lst) + 1}")
    lst.append({"id": nid, "name": name, "enabled": True, "config": agent.clean_config(cfg)})
    _store_agents(tenant, lst)
    return _agent_overview(db.get_tenant(tenant["slug"]), nid)


@app.post("/v1/agents/enabled")
async def agents_enabled(req: AgentEnableReq, tenant: dict = Depends(tenant_auth)):
    """Enciende o apaga un comercial virtual."""
    lst = agent._raw_agents(tenant)
    cur = next((a for a in lst if a["id"] == req.id), None)
    if not cur:
        raise HTTPException(404, "Ese comercial virtual no existe")
    cur["enabled"] = bool(req.enabled)
    _store_agents(tenant, lst)
    return _agent_overview(db.get_tenant(tenant["slug"]), req.id)


@app.post("/v1/agents/delete")
async def agents_delete(req: AgentIdReq, tenant: dict = Depends(tenant_auth)):
    """Elimina un comercial virtual (queda al menos uno): sus leads pasan al primero y se quita su peso del reparto."""
    lst = agent._raw_agents(tenant)
    if len(lst) <= 1:
        raise HTTPException(422, "Debe quedar al menos un comercial virtual. Si no lo quieres usar, apágalo.")
    if not any(a["id"] == req.id for a in lst):
        raise HTTPException(404, "Ese comercial virtual no existe")
    lst = [a for a in lst if a["id"] != req.id]
    _store_agents(tenant, lst)
    with db.pool.connection() as c:   # sus leads pasan al primero de la lista
        c.execute("UPDATE agent_leads SET agent_id = %s WHERE tenant = %s AND agent_id = %s", (lst[0]["id"], tenant["slug"], req.id))
    d = agent.dispatch_cfg(tenant)
    d["weights"].pop(req.id, None)
    with db.pool.connection() as c:
        c.execute("UPDATE tenants SET settings = jsonb_set(settings, '{dispatch}', %s::jsonb, true) WHERE slug = %s", (json.dumps(d), tenant["slug"]))
    return _agent_overview(db.get_tenant(tenant["slug"]), lst[0]["id"])


@app.put("/v1/agent/dispatch")
async def agent_dispatch_save(req: DispatchReq, tenant: dict = Depends(tenant_auth)):
    """Guarda el modo de reparto de leads y los pesos (0 a 100) por atendedor."""
    known = {"humans"} | {a["id"] for a in agent.agents(tenant)}
    w = {}
    for k, v in (req.weights or {}).items():
        if k in known:
            try:
                w[k] = max(0, min(100, int(v)))
            except (TypeError, ValueError):
                raise HTTPException(422, "Los pesos deben ser números de 0 a 100")
    d = {"mode": "split" if req.mode == "split" else "shared", "weights": w}
    with db.pool.connection() as c:
        c.execute("UPDATE tenants SET settings = jsonb_set(settings, '{dispatch}', %s::jsonb, true) WHERE slug = %s", (json.dumps(d), tenant["slug"]))
    return {"dispatch": d}


@app.post("/v1/agent/dispatch/pick")
async def agent_dispatch_pick(tenant: dict = Depends(tenant_auth)):
    """Lo consulta el CRM al llegar un lead nuevo: ¿lo atiende una persona, un comercial virtual o ambos?"""
    return agent.pick_attendant(tenant)


@app.post("/v1/agent/test")
async def agent_test(req: AgentTestReq, tenant: dict = Depends(tenant_auth)):
    """Genera la respuesta de prueba del comercial virtual para un cliente simulado, sin enviar nada."""
    try:
        return await agent.test_reply(tenant, req.sample)
    except Exception as e:
        raise HTTPException(502, f"No se pudo generar la respuesta de prueba: {str(e)[:200]}")


@app.get("/v1/agent/lead")
async def agent_lead(leadId: str, tenant: dict = Depends(tenant_auth)):
    """Estado del comercial virtual sobre un lead, para la ficha del CRM."""
    return agent.lead_state(tenant, leadId)


@app.post("/v1/agent/lead/action")
async def agent_lead_action(req: AgentActionReq, tenant: dict = Depends(tenant_auth)):
    """Intervención humana sobre un lead (pausar, tomar control, cambiar de comercial, reanudar); devuelve el estado nuevo."""
    try:
        await agent.lead_action(tenant, req.leadId, req.action, req.by)
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))
    return agent.lead_state(tenant, req.leadId)


@app.get("/v1/agent/pending")
async def agent_pending(tenant: dict = Depends(tenant_auth)):
    """Mensajes del comercial virtual pendientes de aprobación."""
    return {"items": agent.pending_proposals(tenant["slug"])}


@app.post("/v1/agent/approval")
async def agent_approval(req: AgentApprovalReq, tenant: dict = Depends(tenant_auth)):
    """Aprueba (y envía) o descarta un mensaje propuesto; devuelve el estado del lead."""
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


@app.get("/v1/agent/attended")
def agent_attended(tenant: dict = Depends(tenant_auth)):
    """Leads que hoy gestiona un comercial virtual (el panel gerencial no los cuenta como «Sin asesor»)."""
    return {"leads": agent.attended(tenant)}


@app.get("/v1/agent/stats")
async def agent_stats(days: int = 30, tenant: dict = Depends(tenant_auth)):
    """Estadísticas del comercial virtual del periodo (1 a 365 días) y sus últimos 40 eventos."""
    return {**agent.stats(tenant["slug"], max(1, min(365, days))), "events": agent.events(tenant["slug"], None, 40)}


# ---------------- motor de IA (por empresa)
class AiOwnReq(BaseModel):
    """Cuerpo para configurar el motor de IA propio de la empresa."""
    kind: str
    model: str = ""
    base_url: str = ""
    api_key: str = ""
    workspace_id: str = ""


def _ai_public(tenant: dict) -> dict:
    """Configuración del motor de IA para el panel: modo, motor efectivo, consumo y datos del propio (la clave solo como pista)."""
    ai = (tenant.get("settings") or {}).get("ai") or {}
    eff = llm.resolve(tenant)
    own = ai.get("own") or {}
    k = own.get("api_key") or ""
    return {"mode": ai.get("mode") or "global", "kinds": llm.KINDS, "usage": llm.usage(tenant["slug"]),
            "effective": {"label": eff["label"], "kind": eff["kind"], "model": eff["model"], "source": eff["source"]},
            "own": {"kind": own.get("kind") or "anthropic", "model": own.get("model") or "", "base_url": own.get("base_url") or "", "workspace_id": own.get("workspace_id") or "", "saved": bool(own.get("kind")), "secretSet": bool(k), "secretHint": ("…" + k[-4:]) if k else ""}}


@app.get("/v1/ai/config")
async def ai_config(tenant: dict = Depends(tenant_auth)):
    """Configuración del motor de IA de la empresa."""
    return _ai_public(tenant)


@app.put("/v1/ai/own")
async def ai_own_save(req: AiOwnReq, tenant: dict = Depends(tenant_auth)):
    """Guarda el motor de IA propio (solo si el tenant está en modo «own»); una clave vacía conserva la actual."""
    ai = (tenant.get("settings") or {}).get("ai") or {}
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
    _set_mode(tenant, "ai", "own")
    llm._cache["at"] = 0
    return _ai_public(db.get_tenant(tenant["slug"]))


def _set_mode(tenant: dict, key: str, mode: str) -> None:
    """Cambia entre «el de la plataforma» y «el propio» (ai o search). Al pasar al propio se recuerda el modo anterior (global o proveedor del Centro de control) para poder volver."""
    cur = ((tenant.get("settings") or {}).get(key) or {})
    now = cur.get("mode") or "global"
    patch = {}
    if mode == "own":
        if now != "own":
            patch = {"mode": "own", "platform_mode": now}
    else:
        if now == "own":
            patch = {"mode": cur.get("platform_mode") or "global"}
    if patch:
        with db.pool.connection() as c:
            c.execute("UPDATE tenants SET settings = jsonb_set(COALESCE(settings,'{}'::jsonb), %s, COALESCE(settings->%s,'{}'::jsonb) || %s::jsonb, true) WHERE slug=%s", ("{" + key + "}", key, json.dumps(patch), tenant["slug"]))
    llm._cache["at"] = 0


@app.post("/v1/ai/mode")
async def ai_mode(body: dict = Body(...), tenant: dict = Depends(tenant_auth)):
    """La empresa elige: motor de IA de la plataforma (recomendado, se cobra en su factura) o el propio."""
    mode = "own" if body.get("mode") == "own" else "platform"
    if mode == "own" and not (((tenant.get("settings") or {}).get("ai") or {}).get("own") or {}).get("kind"):
        raise HTTPException(422, "Primero guarda los datos de tu motor propio.")
    _set_mode(tenant, "ai", mode)
    return _ai_public(db.get_tenant(tenant["slug"]))


@app.post("/v1/ai/test")
async def ai_test(req: AiOwnReq | None = None, tenant: dict = Depends(tenant_auth)):
    """Prueba el motor que usa la empresa (o, si se envía un borrador del propio, ese)."""
    cfg = llm.resolve(tenant)
    if req and req.kind:
        old = (((tenant.get("settings") or {}).get("ai") or {}).get("own") or {})
        cfg = {"kind": req.kind, "model": req.model.strip(), "base_url": req.base_url.strip(), "api_key": req.api_key.strip() or old.get("api_key", ""), "workspace_id": req.workspace_id.strip(), "check_url": True}
    try:
        return await llm.test(cfg)
    except Exception as e:
        raise HTTPException(502, str(e)[:240])


# --- Proveedores (líneas) de mensajería: varios por canal, cada uno con su interruptor ---
class LineSaveReq(BaseModel):
    """Cuerpo para crear o editar un proveedor (línea) de mensajería."""
    id: str | None = None
    channel: str
    type: str
    name: str = ""
    fields: dict = {}
    http: dict | None = None
    voice_record: bool = False
    responder: str | None = None   # quién responde: human | preset | virtual | chatbot


class LineIdReq(BaseModel):
    """Cuerpo con el id de una línea."""
    id: str


class LineEnableReq(BaseModel):
    """Cuerpo para encender o apagar una línea."""
    id: str
    enabled: bool


class LineSendReq(BaseModel):
    """Cuerpo para enviar un mensaje de prueba desde una línea."""
    id: str
    to: str
    text: str = ""


def _line_err(e: Exception):
    """Convierte un error de prueba de línea en HTTP: 422 si es de validación, 502 en otro caso."""
    if isinstance(e, ValueError):
        raise HTTPException(422, str(e))
    raise HTTPException(502, f"No se pudo completar la prueba: {str(e)[:240]}")


@app.get("/v1/lines")
def lines_overview(tenant: dict = Depends(tenant_auth)):
    """Líneas de mensajería del tenant por canal."""
    return lines.overview(tenant)


@app.post("/v1/lines")
def lines_save(req: LineSaveReq, tenant: dict = Depends(tenant_auth)):
    """Crea o edita una línea de mensajería."""
    try:
        return lines.save(tenant, req.model_dump())
    except ValueError as e:
        raise HTTPException(422, str(e))


class LineResponderReq(BaseModel):
    id: str
    responder: str


@app.post("/v1/lines/responder")
def lines_responder(req: LineResponderReq, tenant: dict = Depends(tenant_auth)):
    """Cambia quién responde cuando un cliente escribe por esa línea: human | preset | virtual | chatbot (este último, solo con el servicio contratado)."""
    try:
        lines.set_responder(tenant, req.id, req.responder)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return {"ok": True}


@app.get("/v1/presets")
def presets_get(tenant: dict = Depends(tenant_auth)):
    """Mensajes predefinidos de WhatsApp (saludo, fuera de horario, menú y palabras clave)."""
    return presets.config(tenant)


@app.put("/v1/presets")
def presets_save(body: dict = Body(...), tenant: dict = Depends(tenant_auth)):
    return presets.save(tenant["slug"], body)


@app.get("/v1/chatbot")
def chatbot_state(tenant: dict = Depends(tenant_auth)):
    """Estado del servicio de chatbot (Gestor360): contratado, solicitado, motor listo y configurado."""
    return chatbot.state(tenant)


class ChatbotRequestReq(BaseModel):
    note: str = ""
    by: str = ""


@app.post("/v1/chatbot/request")
def chatbot_request(req: ChatbotRequestReq, tenant: dict = Depends(tenant_auth)):
    """La empresa solicita el servicio de chatbot (adicional, con cobro)."""
    return chatbot.request(tenant, req.note, req.by)


@app.post("/v1/lines/enabled")
def lines_enabled(req: LineEnableReq, tenant: dict = Depends(tenant_auth)):
    """Enciende o apaga una línea."""
    try:
        lines.set_enabled(tenant, req.id, req.enabled)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return {"ok": True}


@app.post("/v1/lines/default")
def lines_default(req: LineIdReq, tenant: dict = Depends(tenant_auth)):
    """Marca una línea como predeterminada de su canal."""
    try:
        lines.set_default(tenant, req.id)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return {"ok": True}


@app.post("/v1/lines/delete")
def lines_delete(req: LineIdReq, tenant: dict = Depends(tenant_auth)):
    """Elimina una línea."""
    try:
        lines.delete(tenant, req.id)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return {"ok": True}


@app.post("/v1/lines/test")
async def lines_test(req: LineIdReq, tenant: dict = Depends(tenant_auth)):
    """Prueba la conexión de una línea."""
    try:
        return await lines.connection_test(tenant, req.id)
    except Exception as e:
        _line_err(e)


@app.post("/v1/lines/send-test")
async def lines_send_test(req: LineSendReq, tenant: dict = Depends(tenant_auth)):
    """Envía un mensaje de prueba por una línea."""
    try:
        return await lines.send_test(tenant, req.id, req.to, req.text)
    except Exception as e:
        _line_err(e)


@app.get("/v1/lines/active")
def lines_active(tenant: dict = Depends(tenant_auth)):
    """Líneas encendidas por canal (para elegir «enviar desde» al escribir un mensaje)."""
    return {ch: {"lines": lines.active_lines(tenant, ch), "default": lines._default_id(lines._st(tenant), ch, lines.raw_cards(tenant, ch))} for ch in ("whatsapp", "sms", "voice")}


class AgentMenuTestReq(BaseModel):
    """Cuerpo para probar un menú de WhatsApp del comercial virtual."""
    menuId: str
    to: str
    agentId: str | None = None


@app.post("/v1/agent/menu-test")
async def agent_menu_test(req: AgentMenuTestReq, tenant: dict = Depends(tenant_auth)):
    """Envía un menú del entrenamiento a un número de prueba para ver cómo lo recibe el cliente."""
    try:
        return await agent.test_menu(tenant, req.menuId, req.to, req.agentId)
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(502, f"No se pudo enviar el menú de prueba: {str(e)[:200]}")


# --- Videollamadas propias (sala por enlace; los medios los maneja LiveKit) ---
class MeetCreateReq(BaseModel):
    """Cuerpo para crear una sala de videollamada desde el CRM."""
    leadId: str = ""
    title: str = ""
    hostName: str = ""
    createdBy: str = ""
    hostLang: str = "es"
    guestLang: str = "en"
    subtitles: bool = False
    validHours: int = 0
    fresh: bool = False
    guestName: str = ""


@app.post("/v1/meet/rooms")
def meet_create(req: MeetCreateReq, tenant: dict = Depends(tenant_auth)):
    """Crea una sala y devuelve el enlace del cliente y el del anfitrión (el del anfitrión no se comparte)."""
    try:
        return meet.create(tenant["slug"], req.leadId, req.title, req.hostName, req.createdBy, req.hostLang, req.guestLang, req.subtitles, req.validHours, req.fresh, req.guestName)
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))


class MeetRestoreReq(BaseModel):
    """Datos para reabrir la sala de una reunión programada con su mismo código."""
    code: str
    title: str = ""
    leadId: str = ""
    hostName: str = ""
    guestName: str = ""
    validHours: int = 24
    createdBy: str = ""


@app.post("/v1/meet/rooms/restore")
def meet_restore(req: MeetRestoreReq, tenant: dict = Depends(tenant_auth)):
    """Reabre (o recrea) la sala de una reunión con el mismo código: el enlace ya enviado al cliente sigue valiendo."""
    if meet.mode(tenant["slug"]) == "off":
        raise HTTPException(403, "Las videollamadas no están habilitadas para esta empresa.")
    try:
        return meet.restore(tenant["slug"], req.code, req.title, req.leadId, req.hostName, req.guestName, req.validHours, req.createdBy)
    except ValueError as e:
        raise HTTPException(422, str(e))


def _pkey(x_stt_key: str) -> str:
    return x_stt_key


class ChatPostReq(BaseModel):
    """Mensaje del chat de la sala (texto y/o un archivo ya subido)."""
    id: str
    name: str = ""
    text: str = ""
    file: dict | None = None


class MeetAdminReq(BaseModel):
    """Acción del anfitrión sobre la sala o sobre un participante."""
    host: str
    action: str
    identity: str = ""


class MeetInviteMoreReq(BaseModel):
    """Correo de otra persona a la que el anfitrión invita a la videollamada en curso."""
    host: str
    to: str


@app.get("/v1/public/meet/{code}/chat")
def meet_chat_get(code: str, x_stt_key: str = Header("")):
    """Historial reciente del chat de la sala (para quien entra tarde)."""
    try:
        return JSONResponse({"items": meet.chat_history(code, x_stt_key)}, headers=_MEET_HEADERS)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except PermissionError as e:
        raise HTTPException(403, str(e))


@app.post("/v1/public/meet/{code}/chat")
def meet_chat_post(code: str, req: ChatPostReq, x_stt_key: str = Header("")):
    """Guarda un mensaje del chat (el reparto en vivo va por el canal de datos de la sala)."""
    try:
        return JSONResponse({"ok": meet.chat_post(code, x_stt_key, req.id, req.name, req.text, req.file)}, headers=_MEET_HEADERS)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.post("/v1/public/meet/{code}/file")
async def meet_file_post(code: str, request: Request, name: str = "archivo", type: str = "", x_stt_key: str = Header("")):
    """Sube un archivo para compartirlo en el chat de la sala (hasta 10 MB)."""
    try:
        return JSONResponse(meet.file_save(code, x_stt_key, name, type or request.headers.get("content-type", ""), await request.body()), headers=_MEET_HEADERS)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.get("/v1/public/meet/{code}/file/{fid}")
def meet_file_get(code: str, fid: str):
    """Descarga o muestra un archivo compartido (las imágenes se ven en línea; lo demás se descarga)."""
    f = meet.file_get(code, fid)
    if not f:
        raise HTTPException(404, "El archivo ya no está disponible.")
    data, mime, name = f
    inline = mime.startswith("image/")
    from urllib.parse import quote
    return Response(data, media_type=mime, headers={"Content-Disposition": f"{'inline' if inline else 'attachment'}; filename*=UTF-8''{quote(name)}", "X-Content-Type-Options": "nosniff",
                                                    "Content-Security-Policy": "sandbox; default-src 'none'", "Cache-Control": "private, max-age=3600"})


@app.post("/v1/public/meet/{code}/admin")
def meet_admin(code: str, req: MeetAdminReq):
    """Controles del anfitrión: silenciar, quitar, bloquear la sala o terminar la llamada."""
    try:
        return JSONResponse(meet.admin(code, req.host, req.action, req.identity), headers=_MEET_HEADERS)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(502, "No se pudo completar la acción.")


@app.post("/v1/public/meet/{code}/invite")
async def meet_invite_more(code: str, req: MeetInviteMoreReq):
    """El anfitrión invita por correo a otra persona a la videollamada en curso."""
    r = meet.room(code)
    if not r:
        raise HTTPException(404, "Esta videollamada ya terminó.")
    try:
        return JSONResponse(await meet.invite_more(db.get_tenant(r["tenant"]), code, req.host, req.to), headers=_MEET_HEADERS)
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))
    except LookupError as e:
        raise HTTPException(409, str(e))
    except Exception as e:
        raise HTTPException(502, "No se pudo enviar el correo.")


class MeetInviteReq(BaseModel):
    """Datos de una videollamada programada para invitar al cliente por correo."""
    to: str
    toName: str = ""
    title: str = ""
    startUtc: str
    endUtc: str
    url: str
    organizerName: str = ""
    organizerEmail: str = ""
    userId: str
    tz: str = "America/Bogota"
    uid: str = ""
    parentType: str = ""
    parentId: str = ""
    note: str = ""
    record: bool = True
    kind: str = "invite"


@app.post("/v1/meet/invite")
async def meet_invite(req: MeetInviteReq, tenant: dict = Depends(tenant_auth)):
    """Envía la invitación por correo (con «Agregar al calendario» y .ics) de una videollamada programada."""
    if meet.mode(tenant["slug"]) == "off":
        raise HTTPException(403, "Las videollamadas no están habilitadas para esta empresa.")
    try:
        return await meet.invite(tenant, req.model_dump())
    except LookupError as e:
        raise HTTPException(409, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(502, f"No se pudo enviar la invitación: {str(e)[:200]}")


class InviteeReq(BaseModel):
    """Invitación nominal a una persona del CRM."""
    scope: str = "Lead"
    recId: str
    name: str = ""


@app.post("/v1/meet/rooms/{code}/invitee")
def meet_invitee(code: str, req: InviteeReq, tenant: dict = Depends(tenant_auth)):
    """Enlace de invitación nominal para una persona del CRM (la llamada la liga a su ficha)."""
    try:
        return meet.invitee(tenant["slug"], code, req.scope, req.recId, req.name)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.get("/v1/public/meet/{code}/invitee/{p}")
def meet_invitee_name(code: str, p: str):
    """Nombre de quien fue invitado con un enlace nominal (para saludarlo sin pedirle el nombre)."""
    return JSONResponse({"name": meet.invite_name(code, p)}, headers=_MEET_HEADERS)


@app.get("/v1/meet/rooms/{code}/summary")
def meet_summary_get(code: str, since: int = 0, tenant: dict = Depends(tenant_auth)):
    """Resumen de la reunión de una sala, posterior a `since` (milisegundos); 204 sin cuerpo si aún no está listo."""
    r = meet_summary.latest(tenant["slug"], code, since)
    if not r:
        return Response(status_code=204)
    return r


@app.get("/v1/meet/waiting")
def meet_waiting(tenant: dict = Depends(tenant_auth)):
    """Salas con clientes esperando (de toda la empresa); el CRM filtra las del usuario."""
    return {"items": meet.waiting_all(tenant["slug"])}


@app.get("/v1/meet/rooms/{code}/host")
def meet_host(code: str, tenant: dict = Depends(tenant_auth)):
    """Enlace de entrada del anfitrión de una sala (para quien tiene acceso a la reunión en el CRM)."""
    u = meet.host_url(tenant["slug"], code)
    if not u:
        raise HTTPException(404, "La sala ya terminó o no existe.")
    return {"hostUrl": u}


@app.get("/v1/meet/status")
def meet_status(tenant: dict = Depends(tenant_auth)):
    """Servicio de videollamadas habilitado a la empresa: off | video | video_subs."""
    return {"mode": meet.mode(tenant["slug"])}


@app.get("/v1/meet/rooms")
def meet_list(leadId: str = "", tenant: dict = Depends(tenant_auth)):
    """Salas recientes de la empresa (o de un lead)."""
    return {"items": meet.listing(tenant["slug"], leadId)}


@app.post("/v1/meet/rooms/{code}/end")
def meet_end(code: str, tenant: dict = Depends(tenant_auth)):
    """Cierra una sala: el enlace deja de servir."""
    return {"ok": meet.end(tenant["slug"], code)}


_MEET_HEADERS = {"Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "Permissions-Policy": "camera=(self), microphone=(self), display-capture=(self)"}


# ---------------- grabaciones de pantalla y de videollamadas
_REC_CORS = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, X-Rec-Key", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Cache-Control": "no-store"}


class RecStartReq(BaseModel):
    """Empieza una grabación de pantalla del CRM (la hace un usuario)."""
    title: str = ""
    userId: str
    userName: str = ""
    audio: bool = False
    mime: str = "video/webm"


class RecUpdateReq(BaseModel):
    """Renombrar o compartir/dejar de compartir una grabación."""
    userId: str
    manager: bool = False
    title: str | None = None
    share: bool | None = None


class RecFinishReq(BaseModel):
    duration: int = 0


class RecRoomStartReq(BaseModel):
    """El anfitrión empieza a grabar la videollamada."""
    host: str
    audio: bool = False
    mime: str = "video/webm"
    name: str = ""


@app.post("/v1/rec/start")
def rec_start(req: RecStartReq, tenant: dict = Depends(tenant_auth)):
    try:
        return recordings.start(tenant["slug"], "screen", req.title, req.userId, req.userName, req.audio, req.mime)
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.get("/v1/rec")
def rec_list(userId: str, all: bool = False, tenant: dict = Depends(tenant_auth)):
    return recordings.listing(tenant["slug"], userId, all)


@app.post("/v1/rec/{rid}/update")
def rec_update(rid: str, req: RecUpdateReq, tenant: dict = Depends(tenant_auth)):
    try:
        return recordings.update(tenant["slug"], rid, req.userId, req.manager, req.title, req.share)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except PermissionError as e:
        raise HTTPException(403, str(e))


@app.delete("/v1/rec/{rid}")
def rec_delete(rid: str, userId: str, manager: bool = False, tenant: dict = Depends(tenant_auth)):
    try:
        return {"ok": recordings.delete(tenant["slug"], rid, userId, manager)}
    except LookupError as e:
        raise HTTPException(404, str(e))
    except PermissionError as e:
        raise HTTPException(403, str(e))


@app.get("/v1/rec/{rid}/play")
def rec_play(rid: str, userId: str, manager: bool = False, tenant: dict = Depends(tenant_auth)):
    try:
        return recordings.play_info(tenant["slug"], rid, userId, manager)
    except LookupError as e:
        raise HTTPException(404, str(e))


@app.post("/v1/public/meet/{code}/rec/start")
def rec_room_start(code: str, req: RecRoomStartReq):
    """Solo el anfitrión de una sala vigente puede grabarla. La grabación queda en la empresa dueña de la sala, a nombre de quien creó la sala."""
    r = meet.room(code)
    if not r or not meet._is_host(r, req.host):
        raise HTTPException(403, "Solo el anfitrión puede grabar la videollamada.")
    try:
        t = (r["title"] or "Videollamada")
        return JSONResponse(recordings.start(r["tenant"], "call", t, r["created_by"] or "", r["host_name"] or req.name, req.audio, req.mime, code), headers=_REC_CORS)
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.options("/v1/public/meet/_/rec/{rid}")
@app.options("/v1/public/meet/_/rec/{rid}/{what}")
def rec_options(rid: str, what: str = ""):
    return Response(status_code=204, headers=_REC_CORS)


@app.post("/v1/public/meet/_/rec/{rid}/chunk")
async def rec_chunk(rid: str, request: Request, seq: int = 0, x_rec_key: str = Header("")):
    try:
        return JSONResponse(recordings.chunk(rid, x_rec_key, seq, await request.body()), headers=_REC_CORS)
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.post("/v1/public/meet/_/rec/{rid}/finish")
def rec_finish(rid: str, req: RecFinishReq, x_rec_key: str = Header("")):
    try:
        return JSONResponse(recordings.finish(rid, x_rec_key, req.duration), headers=_REC_CORS)
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except LookupError as e:
        raise HTTPException(404, str(e))


def _rec_file(rid: str, k: str, share: str, dl: bool):
    f = recordings.file_for(rid, k, share)
    if not f:
        raise HTTPException(404, "La grabación no existe o el enlace venció.")
    h = {"Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff", "Access-Control-Allow-Origin": "*"}
    return FileResponse(f[0], media_type=f[1], filename=f[2] if dl else None, content_disposition_type="attachment" if dl else "inline", headers=h)


@app.get("/v1/public/meet/_/rec/{rid}/file")
def rec_file(rid: str, k: str = "", dl: int = 0):
    """Reproduce o descarga una grabación con una llave de corta vida (la entrega el CRM al usuario con acceso)."""
    return _rec_file(rid, k, "", bool(dl))


@app.get("/v1/public/meet/r/{token}", response_class=HTMLResponse)
def rec_share_page(token: str):
    """Página pública de una grabación compartida (https://meet.<dominio>/r/<enlace>)."""
    r = recordings.share_row(token)
    if not r:
        return HTMLResponse("<!doctype html><meta charset=utf-8><title>Grabación</title><body style='font-family:sans-serif;padding:40px'><h2>Esta grabación ya no está compartida.</h2>", 404, _MEET_HEADERS)
    import html as _h
    t = _h.escape(r["title"])
    page = ("<!doctype html><html lang=es><head><meta charset=utf-8><link rel=icon type=image/svg+xml href=/favicon.svg><link rel=icon type=image/png sizes=64x64 href=/favicon.ico><meta name=viewport content='width=device-width,initial-scale=1'><meta name=robots content=noindex><title>" + t + "</title>"
            "<style>body{margin:0;background:#0f1420;color:#e8ecf5;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;min-height:100vh}"
            "main{width:min(1100px,94vw);padding:24px 0}h1{font-size:20px;margin:0 0 4px}p{color:#8a93a8;margin:0 0 14px;font-size:14px}video{width:100%;max-height:78vh;background:#000;border-radius:10px}"
            "a.b{display:inline-block;margin-top:14px;background:#3b6df0;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600}</style></head><body><main>"
            "<h1>" + t + "</h1><p>Grabada el " + r["created_at"].strftime("%d/%m/%Y %H:%M") + (" por " + _h.escape(r["owner_name"]) if r["owner_name"] else "") + "</p>"
            "<video controls playsinline preload=metadata src='" + token + "/video'></video><br><a class=b href='" + token + "/video?dl=1'>Descargar video</a></main></body></html>")
    return HTMLResponse(page, 200, {**_MEET_HEADERS, "Content-Security-Policy": "default-src 'none'; media-src 'self'; style-src 'unsafe-inline'"})


@app.get("/v1/public/meet/r/{token}/video")
def rec_share_video(token: str, dl: int = 0):
    return _rec_file("", "", token, bool(dl))


# ---------------- cumplimiento: lista de no contactar y baja de los correos
class DncReq(BaseModel):
    """Agrega a la lista de no contactar (correo y/o teléfono)."""
    email: str = ""
    phone: str = ""
    reason: str = ""


@app.get("/v1/compliance/dnc")
def dnc_list(tenant: dict = Depends(tenant_auth)):
    return {"items": compliance.list_dnc(tenant["slug"])}


@app.post("/v1/compliance/dnc")
def dnc_add(req: DncReq, tenant: dict = Depends(tenant_auth)):
    if not req.email.strip() and not req.phone.strip():
        raise HTTPException(422, "Escribe un correo o un teléfono.")
    phones = [compliance.phone_e164(req.phone)[0] or req.phone] if req.phone.strip() else []
    compliance.add_dnc(tenant["slug"], email=req.email or None, phones=phones, reason=req.reason or "Agregado a mano", source="manual")
    return {"ok": True}


@app.delete("/v1/compliance/dnc")
def dnc_remove(kind: str, value: str, tenant: dict = Depends(tenant_auth)):
    return {"ok": compliance.remove_dnc(tenant["slug"], kind, value)}


_UNSUB_CSS = "body{font-family:system-ui,sans-serif;background:#f4f6fb;color:#1b2030;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}main{background:#fff;border-radius:14px;padding:28px 32px;max-width:420px;box-shadow:0 8px 30px #0001;text-align:center}button{background:#4f63e8;color:#fff;border:0;border-radius:9px;padding:11px 20px;font-size:15px;font-weight:600;cursor:pointer}p{color:#5d6678}"


async def _do_unsub(token: str) -> bool:
    p = compliance.unsub_parse(token)
    if not p:
        return False
    t = db.get_tenant(p[0])
    if not t:
        return False
    from . import ingest
    await ingest.apply_optout(t, p[1], "Correo")
    return True


@app.get("/v1/public/meet/u/{token}", response_class=HTMLResponse)
def unsub_page(token: str):
    """Página de baja de un correo (https://meet.<dominio>/u/<enlace>): pide confirmar con un botón (los antivirus abren los enlaces sin querer)."""
    if not compliance.unsub_parse(token):
        return HTMLResponse("<!doctype html><meta charset=utf-8><body style='font-family:sans-serif;padding:40px'><h3>Este enlace no es válido.</h3>", 404, _MEET_HEADERS)
    return HTMLResponse(f"<!doctype html><html lang=es><meta charset=utf-8><link rel=icon type=image/svg+xml href=/favicon.svg><link rel=icon type=image/png sizes=64x64 href=/favicon.ico><meta name=viewport content='width=device-width,initial-scale=1'><meta name=robots content=noindex><title>Darse de baja</title><style>{_UNSUB_CSS}</style>"
                        "<main><h2>¿Quieres dejar de recibir mensajes?</h2><p>Confirma y no volveremos a escribirte por ningún canal.</p>"
                        "<form method=post><button>Sí, darme de baja</button></form></main>", 200, {**_MEET_HEADERS, "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'"})


@app.post("/v1/public/meet/u/{token}", response_class=HTMLResponse)
async def unsub_do(token: str):
    """Baja confirmada (botón de la página o «un clic» del cliente de correo, RFC 8058)."""
    ok = await _do_unsub(token)
    return HTMLResponse(f"<!doctype html><html lang=es><meta charset=utf-8><link rel=icon type=image/svg+xml href=/favicon.svg><link rel=icon type=image/png sizes=64x64 href=/favicon.ico><meta name=viewport content='width=device-width,initial-scale=1'><title>Baja</title><style>{_UNSUB_CSS}</style>"
                        f"<main><h2>{'Listo' if ok else 'Enlace no válido'}</h2><p>{'No volveremos a escribirte. Lamentamos las molestias.' if ok else 'No pudimos procesar la baja con este enlace.'}</p></main>", 200 if ok else 404, _MEET_HEADERS)


# ---------------- prospección saliente: prospectos, perfil de cliente ideal y métricas de variantes
class ProspectImportReq(BaseModel):
    """Filas para importar (de un CSV o de otro sistema)."""
    rows: list[dict]
    batch: str = ""
    defaultCountry: str = "CO"
    campaign: str = ""
    enrich: bool = True


class ProspectPromoteReq(BaseModel):
    """Pasa prospectos listos al CRM como leads."""
    ids: list[int] = []
    limit: int | None = None
    agentId: str | None = None


class ProspectIdsReq(BaseModel):
    ids: list[int]


@app.get("/v1/prospects")
def prospects_list(status: str = "", batch: str = "", q: str = "", tenant: dict = Depends(tenant_auth)):
    return {**prospects.listing(tenant["slug"], status, batch, q), "icp": prospects.icp(tenant)}


@app.get("/v1/mail-config")
def mail_config_get(tenant: dict = Depends(tenant_auth)):
    """Correo de la empresa (principal y en frío): si lo provee el sistema o es propio, y los datos no secretos de cada uno."""
    return mailcfg.get(tenant)


@app.put("/v1/mail-config/{role}")
def mail_config_save(role: str, body: dict = Body(...), tenant: dict = Depends(tenant_auth)):
    """Guarda el correo propio de la empresa (SMTP de salida y buzón IMAP). Solo si el Centro de control dejó esa función como «Propio»."""
    if role not in mailcfg.ROLES:
        raise HTTPException(404, "Función de correo desconocida")
    try:
        return mailcfg.save(tenant, role, body)
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.delete("/v1/mail-config/{role}")
def mail_config_clear(role: str, tenant: dict = Depends(tenant_auth)):
    if role not in mailcfg.ROLES:
        raise HTTPException(404, "Función de correo desconocida")
    try:
        mailcfg.clear(tenant, role)
    except PermissionError as e:
        raise HTTPException(403, str(e))
    return {"ok": True}


@app.post("/v1/mail-config/{role}/test")
async def mail_config_test(role: str, tenant: dict = Depends(tenant_auth)):
    """Prueba de conexión SMTP e IMAP con los datos guardados (no envía ni lee correos)."""
    if role not in mailcfg.ROLES:
        raise HTTPException(404, "Función de correo desconocida")
    try:
        return await mailcfg.test(tenant, role)
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.get("/v1/search-config")
def search_config_get(tenant: dict = Depends(tenant_auth)):
    """Buscador web de la empresa: cómo está (del sistema, prestado o propio) y los datos no secretos de su buscador propio."""
    st, mode = searchengines.settings_of(tenant), searchengines.mode_of(tenant)
    own = st.get("own") or {}
    res = searchengines.resolve(tenant)
    return {"mode": "own" if mode == "own" else ("loaned" if mode.startswith("provider:") else "global"), "editable": True, "hasOwn": bool(own.get("engine")), "active": {"engine": res["engine"], "source": res["source"]},
            "own": {"engine": own.get("engine") or "", "cx": own.get("cx") or "", "hasKey": bool(own.get("api_key"))}, "engines": searchengines.ENGINES, "recommended": searchengines.RECOMMENDED}


@app.put("/v1/search-config")
async def search_config_save(body: dict = Body(...), tenant: dict = Depends(tenant_auth)):
    """Guarda el buscador propio de la empresa (motor, clave, cx). Solo si el Centro de control dejó el buscador en «Propio»."""
    eng = str(body.get("engine") or "")
    if eng not in searchengines.ENGINES:
        raise HTTPException(422, "Elige un motor de búsqueda de la lista.")
    old = searchengines.settings_of(tenant).get("own") or {}
    key = str(body.get("api_key") or "").strip() or (old.get("api_key") if old.get("engine") == eng else "")
    if eng != "claude" and not key:
        raise HTTPException(422, "Falta la clave (API key) del buscador.")
    cx = str(body.get("cx") or "").strip()[:120]
    if eng == "google" and not cx:
        raise HTTPException(422, "Google Programmable Search necesita el identificador del buscador (cx).")
    own = {"engine": eng, "api_key": key if eng != "claude" else "", "cx": cx if eng == "google" else ""}
    with db.pool.connection() as c:
        c.execute("UPDATE tenants SET settings = jsonb_set(COALESCE(settings,'{}'::jsonb), '{search}', COALESCE(settings->'search','{}'::jsonb) || jsonb_build_object('own', %s::jsonb), true) WHERE slug=%s", (json.dumps(own), tenant["slug"]))
    _set_mode(db.get_tenant(tenant["slug"]), "search", "own")
    return search_config_get(db.get_tenant(tenant["slug"]))


@app.post("/v1/search-config/mode")
async def search_config_mode(body: dict = Body(...), tenant: dict = Depends(tenant_auth)):
    """La empresa elige: buscador de la plataforma (recomendado, se cobra en su factura) o el propio."""
    mode = "own" if body.get("mode") == "own" else "platform"
    if mode == "own" and not (searchengines.settings_of(tenant).get("own") or {}).get("engine"):
        raise HTTPException(422, "Primero guarda los datos de tu buscador propio.")
    _set_mode(tenant, "search", mode)
    return search_config_get(db.get_tenant(tenant["slug"]))


@app.post("/v1/search-config/test")
async def search_config_test(tenant: dict = Depends(tenant_auth)):
    """Prueba el buscador que usa la empresa con una búsqueda real (consume una consulta)."""
    try:
        return await searchengines.test(searchengines.resolve(tenant))
    except Exception as e:
        raise HTTPException(502, f"No se pudo usar el buscador: {str(e)[:200]}")


@app.post("/v1/pipeline/run")
async def pipeline_run(tenant: dict = Depends(tenant_auth)):
    """Una pasada completa ahora mismo: busca, califica y pasa los mejores al comercial virtual."""
    if agent.engine_paused(tenant):
        raise HTTPException(409, "El motor comercial está pausado por el interruptor de emergencia.")
    try:
        return await pipeline.run_once(tenant)
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except Exception as e:
        raise HTTPException(502, f"No se pudo completar: {str(e)[:200]}")


class ProductReq(BaseModel):
    slug: str = ""
    name: str
    summary: str = ""
    for_whom: str = ""
    benefits: str = ""
    avoid: str = ""
    main: bool = False
    active: bool = True


@app.exception_handler(wallet.NoBalance)
async def _no_balance(request, exc):
    """Sin créditos: 402 con un mensaje claro (el CRM lo muestra y ofrece recargar)."""
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=402, content={"detail": str(exc)}, headers={"X-Status-Reason": "Sin creditos"})


@app.get("/v1/wallet")
def wallet_get(tenant: dict = Depends(tenant_auth)):
    """Saldo de créditos de la empresa, paquetes de recarga, lo que cuesta cada cosa y los últimos movimientos."""
    return wallet.public(tenant)


@app.post("/v1/wallet/checkout")
def wallet_checkout(body: dict = Body(...), tenant: dict = Depends(tenant_auth)):
    """Enlace de pago (Wompi) para comprar créditos."""
    try:
        return {"url": wallet.checkout_url(tenant, float(body.get("credits") or 0), str(body.get("redirect") or ""))}
    except (ValueError, TypeError) as e:
        raise HTTPException(422, str(e))


@app.post("/v1/ingest/{slug}/wompi")
async def wompi_events(slug: str, request: Request):
    """Eventos de Wompi (un solo enlace para toda la plataforma): se acreditan las recargas aprobadas, verificando la firma."""
    try:
        return wallet.handle_event(await request.json())
    except PermissionError:
        raise HTTPException(401, "Firma inválida")
    except Exception as e:
        log.warning("evento de Wompi: %s", str(e)[:120])
        raise HTTPException(400, "Evento no válido")


@app.get("/v1/products")
def products_list(tenant: dict = Depends(tenant_auth)):
    """Catálogo de productos que ofrece la empresa (lo que siempre tiene presente el comercial virtual)."""
    return {"items": products.listing(tenant["slug"]), "statuses": products.STATUSES}


@app.post("/v1/products")
def products_save(req: ProductReq, tenant: dict = Depends(tenant_auth)):
    try:
        return {"slug": products.save(tenant["slug"], req.model_dump())}
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.delete("/v1/products/{slug}")
def products_delete(slug: str, tenant: dict = Depends(tenant_auth)):
    if not products.delete(tenant["slug"], slug):
        raise HTTPException(404, "No existe")
    return {"ok": True}


@app.post("/v1/products/seed")
def products_seed(tenant: dict = Depends(tenant_auth)):
    """Carga los productos estándar de DigitalAlliance Hub (Crm Hub 360, Gestor360, Core360) que falten."""
    return {"created": products.seed_defaults(tenant["slug"])}


@app.get("/v1/leads/{lead_id}/products")
def lead_products_get(lead_id: str, tenant: dict = Depends(tenant_auth)):
    return {"items": products.of_lead(tenant["slug"], re.sub(r"[^A-Za-z0-9]", "", lead_id)), "statuses": products.STATUSES}


@app.post("/v1/leads/{lead_id}/products")
def lead_products_mark(lead_id: str, body: dict = Body(...), tenant: dict = Depends(tenant_auth)):
    """Marca qué producto se ofreció o compró un cliente (status: offered, interested, won, lost)."""
    slug, st = str(body.get("slug") or ""), str(body.get("status") or "")
    if st not in products.STATUSES or not slug:
        raise HTTPException(422, "Elige el producto y el estado.")
    products.mark(tenant["slug"], re.sub(r"[^A-Za-z0-9]", "", lead_id), slug, st, str(body.get("note") or ""))
    return {"items": products.of_lead(tenant["slug"], re.sub(r"[^A-Za-z0-9]", "", lead_id))}


@app.get("/v1/proposals")
def proposals_list(tenant: dict = Depends(tenant_auth)):
    """Material (presentaciones, propuestas, enlaces propios) que los agentes pueden enviar."""
    return {"items": proposals.listing(tenant["slug"])}


class ProposalReq(BaseModel):
    title: str
    product: str = ""
    kind: str = "enlace"
    summary: str = ""
    link: str = ""


@app.post("/v1/proposals")
def proposals_create(req: ProposalReq, tenant: dict = Depends(tenant_auth)):
    """Agrega material propio de la empresa: un enlace (PDF, página, video) que los agentes enviarán."""
    if not req.title.strip():
        raise HTTPException(422, "Escribe un nombre para el material.")
    try:
        return {"slug": proposals.create_link(tenant["slug"], req.title.strip(), req.product, req.kind, req.summary, req.link.strip())}
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.put("/v1/proposals/{slug}")
def proposals_update(slug: str, req: ProposalReq, tenant: dict = Depends(tenant_auth)):
    try:
        ok = proposals.update_meta(tenant["slug"], slug, req.title.strip() or slug, req.product, req.kind, req.summary, req.link.strip() or None)
    except ValueError as e:
        raise HTTPException(422, str(e))
    if not ok:
        raise HTTPException(404, "No existe")
    return {"ok": True}


@app.delete("/v1/proposals/{slug}")
def proposals_delete(slug: str, tenant: dict = Depends(tenant_auth)):
    if not proposals.delete(tenant["slug"], slug):
        raise HTTPException(404, "No existe")
    return {"ok": True}


@app.get("/v1/qualifier")
def qualifier_get(tenant: dict = Depends(tenant_auth)):
    """Agente calificador de la empresa: configuración, reglas por defecto y resumen de grados."""
    return {**qualifier.config(tenant), "default_rules": qualifier.DEFAULT_RULES, "licensed": finder.licensed(tenant), "name": "calificador_" + tenant["slug"], "stats": qualifier.stats(tenant["slug"])}


@app.put("/v1/qualifier")
def qualifier_save(body: dict = Body(...), tenant: dict = Depends(tenant_auth)):
    if not finder.licensed(tenant):
        raise HTTPException(403, "El buscador (y su calificador) no está incluido en la licencia de esta empresa.")
    return qualifier.save(tenant["slug"], body)


@app.post("/v1/qualifier/run")
async def qualifier_run(tenant: dict = Depends(tenant_auth)):
    """Califica ahora los prospectos pendientes y pasa a Valeria los de grado suficiente."""
    if not finder.licensed(tenant):
        raise HTTPException(403, "El buscador (y su calificador) no está incluido en la licencia de esta empresa.")
    if agent.engine_paused(tenant):
        raise HTTPException(409, "El motor comercial está pausado por el interruptor de emergencia.")
    try:
        return await qualifier.run(tenant)
    except Exception as e:
        raise HTTPException(502, f"No se pudo calificar: {str(e)[:200]}")


@app.post("/v1/proposals/seed")
def proposals_seed(tenant: dict = Depends(tenant_auth)):
    """Crea (o actualiza) las presentaciones estándar de los productos de la empresa."""
    wa = re.sub(r"\D", "", str((tenant.get("settings") or {}).get("gupshup_source") or ""))
    return {"created": proposals.seed_defaults(tenant["slug"], tenant.get("name") or "", wa)}


@app.put("/v1/proposals/{slug}/active")
def proposals_active(slug: str, body: dict = Body(...), tenant: dict = Depends(tenant_auth)):
    with db.pool.connection() as c:
        n = c.execute("UPDATE proposals SET active=%s WHERE tenant=%s AND slug=%s", (bool(body.get("active")), tenant["slug"], slug)).rowcount
    if not n:
        raise HTTPException(404, "No existe")
    return {"ok": True}


@app.get("/v1/public/meet/favicon.svg")
def favicon_svg():
    """Favicon genérico de DigitalAlliance Hub para las páginas públicas del dominio de las salas."""
    return Response(brand.SVG, 200, {"Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400"})


@app.get("/v1/public/meet/favicon.ico")
def favicon_ico():
    return Response(brand.png(), 200, {"Content-Type": "image/png", "Cache-Control": "public, max-age=86400"})


@app.get("/v1/public/meet/p/{tenant}/{slug}.pdf")
def proposal_pdf(tenant: str, slug: str):
    """PDF del brochure de una presentación (el mismo que se adjunta a los correos)."""
    if not re.fullmatch(r"[a-z0-9-]{1,40}", tenant) or not re.fullmatch(r"[a-z0-9-]{1,60}", slug):
        raise HTTPException(404, "No existe")
    b = proposals.get_pdf(tenant, slug)
    if not b:
        raise HTTPException(404, "No existe")
    return Response(b, 200, {**_MEET_HEADERS, "Content-Type": "application/pdf", "Content-Disposition": f'inline; filename="{slug}.pdf"', "Cache-Control": "public, max-age=300"})


@app.get("/v1/public/meet/p/{tenant}/{slug}", response_class=HTMLResponse)
def proposal_page(tenant: str, slug: str):
    """Página pública de una presentación (https://meet.<dominio>/p/<empresa>/<producto>): HTML autocontenido, sin scripts."""
    if not re.fullmatch(r"[a-z0-9-]{1,40}", tenant) or not re.fullmatch(r"[a-z0-9-]{1,60}", slug):
        raise HTTPException(404, "No existe")
    h = proposals.get_page(tenant, slug)
    if not h:
        raise HTTPException(404, "No existe")
    return HTMLResponse(h, 200, {**_MEET_HEADERS, "Cache-Control": "public, max-age=300", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"})


@app.get("/v1/finder")
def finder_get(tenant: dict = Depends(tenant_auth)):
    """Estado del buscador de prospectos: licencia, configuración y última pasada."""
    return {**finder.config(tenant), "licensed": finder.licensed(tenant), "name": "buscador_" + tenant["slug"]}


@app.put("/v1/finder")
def finder_save(body: dict = Body(...), tenant: dict = Depends(tenant_auth)):
    """Activa o ajusta el buscador (tope diario y enfoque). Requiere que la licencia lo incluya."""
    if not finder.licensed(tenant):
        raise HTTPException(403, "El buscador no está incluido en la licencia de esta empresa.")
    finder._save(tenant["slug"], {"enabled": bool(body.get("enabled")), "daily_limit": max(1, min(100, int(body.get("daily_limit") or 20))), "focus": str(body.get("focus") or "")[:600],
                                  "auto": bool(body.get("auto")), "hour": max(0, min(23, int(body.get("hour") if body.get("hour") is not None else 9))),
                                  "autonomy": "auto" if body.get("autonomy") == "auto" else "approval"})
    if isinstance(body.get("report"), dict):   # reporte gerencial por correo: activo, hora local y destinatarios
        r = body["report"]
        to = [a.strip().lower() for a in (r.get("to") if isinstance(r.get("to"), list) else str(r.get("to") or "").replace(";", ",").split(",")) if "@" in a and "." in a][:8]
        with db.pool.connection() as c:
            c.execute("UPDATE tenants SET settings = jsonb_set(COALESCE(settings,'{}'::jsonb), '{finder,report}', COALESCE(settings->'finder'->'report','{}'::jsonb) || %s::jsonb, true) WHERE slug=%s",
                      (json.dumps({"enabled": bool(r.get("enabled")), "hour": max(0, min(23, int(r.get("hour") if r.get("hour") is not None else 11))), "to": to}), tenant["slug"]))
    return finder.config(db.get_tenant(tenant["slug"]))


@app.post("/v1/report/send")
async def report_send(body: dict = Body(default={}), tenant: dict = Depends(tenant_auth)):
    """Envía ahora el reporte gerencial (como vista previa) a los destinatarios configurados o al indicado."""
    to = [a.strip() for a in (body.get("to") or []) if isinstance(a, str) and "@" in a][:5] or None
    try:
        return await report.send(tenant, to, preview=bool(body.get("preview", True)))
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(502, f"No se pudo enviar el reporte: {str(e)[:200]}")


@app.post("/v1/finder/run")
async def finder_run(body: dict = Body(default={}), tenant: dict = Depends(tenant_auth)):
    """Una pasada de búsqueda en internet (solo guarda prospectos con fuente pública; no envía nada)."""
    try:
        return await finder.run(tenant, int(body.get("limit") or 0) or None)
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except Exception as e:
        raise HTTPException(502, f"No se pudo completar la búsqueda: {str(e)[:200]}")


@app.post("/v1/prospects/verify")
async def prospects_verify(tasks: BackgroundTasks, tenant: dict = Depends(tenant_auth)):
    """Comprueba (en segundo plano) que existan los correos de los prospectos listos; los inexistentes pasan a rechazados."""
    with db.pool.connection() as c:
        n = c.execute("SELECT count(*) n FROM prospects WHERE tenant=%s AND status='ready' AND email <> ''", (tenant["slug"],)).fetchone()["n"]
    tasks.add_task(prospects.verify_pending, tenant)
    return {"queued": n}


@app.put("/v1/prospects/icp")
def prospects_icp_save(body: dict = Body(...), tenant: dict = Depends(tenant_auth)):
    try:
        return prospects.save_icp(tenant["slug"], body)
    except (ValueError, TypeError) as e:
        raise HTTPException(422, "Revisa los valores del perfil de cliente ideal.")


@app.post("/v1/prospects/import")
async def prospects_import(req: ProspectImportReq, tasks: BackgroundTasks, tenant: dict = Depends(tenant_auth)):
    if not req.rows:
        raise HTTPException(422, "No hay filas para importar.")
    r = await prospects.import_rows(tenant, req.rows, req.batch, req.defaultCountry, req.campaign)
    if req.enrich and r["ready"]:
        tasks.add_task(prospects.enrich_pending, tenant)
    return r


@app.post("/v1/prospects/enrich")
async def prospects_enrich(tasks: BackgroundTasks, tenant: dict = Depends(tenant_auth)):
    tasks.add_task(prospects.enrich_pending, tenant)
    return {"ok": True}


@app.post("/v1/prospects/promote")
async def prospects_promote(req: ProspectPromoteReq, tenant: dict = Depends(tenant_auth)):
    return await prospects.promote(tenant, req.ids or None, req.limit, req.agentId)


@app.post("/v1/prospects/delete")
def prospects_delete(req: ProspectIdsReq, tenant: dict = Depends(tenant_auth)):
    return {"deleted": prospects.remove(tenant["slug"], req.ids)}


# ---------------- optimización diaria (growth loop)
class GrowthRunReq(BaseModel):
    """Ejecuta el análisis ahora. apply=True aplica los cambios; False solo propone. force analiza aunque el comercial esté en modo prueba."""
    agentId: str = ""
    apply: bool | None = None
    force: bool = False


class GrowthEntryReq(BaseModel):
    id: int
    by: str = ""


@app.get("/v1/growth/overview")
def growth_overview(agentId: str = "", tenant: dict = Depends(tenant_auth)):
    a = agent.get_agent(tenant, agentId or None)
    return growth.overview(tenant, a["id"] if a else "main")


@app.post("/v1/growth/run")
async def growth_run(req: GrowthRunReq, tenant: dict = Depends(tenant_auth)):
    a = agent.get_agent(tenant, req.agentId or None)
    return await growth.analyze(tenant, a["id"] if a else "main", req.apply, req.force)


@app.post("/v1/growth/apply")
def growth_apply(req: GrowthEntryReq, tenant: dict = Depends(tenant_auth)):
    try:
        return growth.apply_entry(tenant["slug"], req.id, req.by or "manual")
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.post("/v1/growth/revert")
def growth_revert(req: GrowthEntryReq, tenant: dict = Depends(tenant_auth)):
    try:
        return growth.revert_entry(tenant["slug"], req.id, req.by or "manual")
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.post("/v1/prospects/niche")
def prospects_niche(body: dict = Body(...), tenant: dict = Depends(tenant_auth)):
    """Pausa o reanuda un nicho a mano."""
    n = str(body.get("niche") or "").strip().lower()[:60]
    if not n:
        raise HTTPException(422, "Falta el nicho.")
    growth._set_paused(tenant["slug"], n, bool(body.get("paused")))
    return {"ok": True}


@app.get("/v1/agent/funnel")
def agent_funnel(days: int = 30, tenant: dict = Depends(tenant_auth)):
    """Embudo de la prospección: contactados, respondieron, demos agendadas, escalados e intención de los leads."""
    return agent.funnel(tenant["slug"], max(1, min(days, 365)))


@app.get("/v1/agent/outbound/stats")
def outbound_stats(days: int = 30, tenant: dict = Depends(tenant_auth)):
    """Envíos y respuestas por variante de cada paso de la secuencia saliente."""
    st = agent.variant_stats(tenant["slug"], max(1, min(days, 365)), include_dry=True)
    return {"items": [{"step": k[0], "variant": k[1], **v, "rate": round(v["replies"] * 100 / v["sends"], 1) if v["sends"] else 0} for k, v in sorted(st.items())]}


@app.get("/v1/public/meet/_/assets/{name:path}")
def meet_asset(name: str):
    """Archivos estáticos de la sala: página (js y css), fondos virtuales y segmentación de persona (alojados aquí, sin servicios de terceros)."""
    a = meet.asset(name)
    if not a:
        raise HTTPException(404, "No existe.")
    return Response(a[0], media_type=a[1], headers={"Cache-Control": "public, max-age=3600"})


@app.get("/v1/public/meet/_/lk.js")
def meet_js():
    """Cliente de LiveKit para la página de la videollamada."""
    return Response(meet.client_js(), media_type="text/javascript", headers={"Cache-Control": "public, max-age=86400"})


@app.get("/v1/public/meet/{code}", response_class=HTMLResponse)
def meet_page(code: str):
    """Página pública de la videollamada (se publica en https://meet.<dominio>/<código>). Puede incrustarse en el CRM de la empresa (el asesor la ve sin salir de la ficha)."""
    base = (os.environ.get("MEET_HOST") or "").split(".", 1)[-1]
    h = {**_MEET_HEADERS, "Content-Security-Policy": f"frame-ancestors 'self' https://*.{base}" if base else "frame-ancestors 'self'"}
    return HTMLResponse(meet.page(code), 200 if meet.room(code) else 404, h)


@app.post("/v1/public/meet/{code}/stt")
async def meet_subtitle(code: str, request: Request, lang: str = "es", n: str = "", to: str = "", x_stt_key: str = Header("")):
    """Subtítulo de un enunciado de audio (WAV 16 kHz mono): lo transcribe y traduce con IA local. No guarda nada."""
    try:
        return JSONResponse(await meet.subtitle(code, x_stt_key, lang, await request.body(), n, [x for x in to.split(",") if x][:4]), headers=_MEET_HEADERS)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        logging.getLogger("hub.meet").warning("subtítulo: %s", str(e)[:150])
        raise HTTPException(502, "No se pudo generar el subtítulo.")


class KnockReq(BaseModel):
    """El invitado pide entrar a la sala (extra: entra por una invitación adicional y escribió su propio nombre)."""
    name: str = ""
    extra: bool = False
    p: str = ""


class DecideReq(BaseModel):
    """El anfitrión admite o rechaza a quien espera."""
    host: str
    id: str
    admit: bool = True


@app.post("/v1/public/meet/{code}/knock")
def meet_knock(code: str, req: KnockReq, bg: BackgroundTasks):
    """El invitado pide entrar: espera a que el anfitrión lo admita (y se le avisa al anfitrión aunque no esté dentro)."""
    try:
        res = meet.knock(code, req.name, req.extra, req.p)
        bg.add_task(meet.notify_knock, code, (req.name or "Un cliente").strip()[:60] or "Un cliente")
        return JSONResponse(res, headers=_MEET_HEADERS)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except PermissionError as e:
        raise HTTPException(423, str(e))
    except ValueError as e:
        raise HTTPException(429, str(e))


@app.get("/v1/public/meet/{code}/knock/{kid}")
def meet_knock_status(code: str, kid: str):
    """Estado de la solicitud; admitido trae la credencial de entrada."""
    try:
        return JSONResponse(meet.knock_status(code, kid), headers=_MEET_HEADERS)
    except LookupError as e:
        raise HTTPException(404, str(e))


@app.get("/v1/public/meet/{code}/ficha")
async def meet_ficha(code: str, h: str = "", n: str = "", r: str = ""):
    """Información del CRM de una persona de la llamada, solo para el anfitrión (clave en h)."""
    try:
        return JSONResponse(await meet.ficha(code, h, n[:80], r[:40]), headers=_MEET_HEADERS)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except PermissionError as e:
        raise HTTPException(403, str(e))


@app.get("/v1/public/meet/{code}/pending")
def meet_pending(code: str, h: str = ""):
    """Solicitudes esperando al anfitrión (requiere su clave)."""
    try:
        return JSONResponse({"items": meet.pending(code, h)}, headers=_MEET_HEADERS)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except PermissionError as e:
        raise HTTPException(403, str(e))


@app.post("/v1/public/meet/{code}/decide")
def meet_decide(code: str, req: DecideReq):
    """El anfitrión admite o rechaza una solicitud."""
    try:
        return JSONResponse({"ok": meet.decide(code, req.host, req.id, req.admit)}, headers=_MEET_HEADERS)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except PermissionError as e:
        raise HTTPException(403, str(e))


class MeetJoinReq(BaseModel):
    """Cuerpo para entrar a una sala: el nombre y, si es el anfitrión, su clave."""
    name: str = ""
    host: str = ""


@app.post("/v1/public/meet/{code}/token")
def meet_token(code: str, req: MeetJoinReq):
    """Credencial para entrar a la sala con LiveKit."""
    try:
        return JSONResponse(meet.join(code, req.name, req.host), headers=_MEET_HEADERS)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except PermissionError as e:
        raise HTTPException(403, str(e))


if __name__ == "__main__":
    uvicorn.run(app, host=config.HUB_BIND_HOST, port=config.HUB_PORT)
