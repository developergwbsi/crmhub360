"""Monitor de conexión de Evolution API (WhatsApp) del Centro de control.

Un «Evolution conectado» no garantiza que la línea funcione: la sesión puede quedar abierta y sorda (no recibir mensajes) o aceptar envíos que nunca se entregan.
Por eso el monitor hace una prueba de extremo a extremo, igual que un cliente:

  1. Cada `interval_min` minutos (30 por defecto), cada línea de Evolution de cada empresa envía «[crmhub-ping:<id>]» a la **línea de pruebas** (una instancia nuestra, vinculada a un teléfono propio).
  2. La línea de pruebas recibe el ping por su webhook (POST /monitor/evolution, protegido con un secreto) y **responde sola** «[crmhub-pong:<id>]» a quien lo envió.
  3. El Hub de la empresa recibe el pong por su webhook habitual y lo marca (hub-service/app/monitor.py): quedó probado que la línea **envía y recibe**.
  4. Si no llega el pong en `timeout_s` se clasifica el fallo (rechazado, no entrega, no recibe, línea de pruebas caída) y, tras `fail_threshold` fallos seguidos, se abre una alerta
     (pantalla del Centro, correo y WhatsApp por la línea de pruebas), se reinicia la instancia una vez (si está activado) y se avisa cuando se recupera.

También ofrece al Centro operar la vinculación (QR), el cierre de sesión y el reinicio de la línea de cualquier empresa, para que el cliente no tenga que hacerlo solo.
Tablas: evo_probes (cada prueba), evo_health (estado por línea), evo_alerts (alertas). Configuración: control_settings «evo_monitor».
Se inicializa con init() desde main.py (que le pasa sus utilidades), porque main.py se ejecuta como __main__ y no puede importarse a sí mismo."""
import asyncio
import hmac
import json
import logging
import os
import re
import secrets
import time
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

log = logging.getLogger("control.evomon")
SCHEMA = """
CREATE TABLE IF NOT EXISTS evo_probes (
    id TEXT PRIMARY KEY, tenant TEXT NOT NULL, line_id TEXT NOT NULL DEFAULT '', instance TEXT NOT NULL, sent_at TIMESTAMPTZ NOT NULL DEFAULT now(), send_ok BOOLEAN,
    send_error TEXT NOT NULL DEFAULT '', ping_at TIMESTAMPTZ, pong_at TIMESTAMPTZ, status TEXT NOT NULL DEFAULT 'pending', kind TEXT NOT NULL DEFAULT '', rtt_ms INT);
CREATE INDEX IF NOT EXISTS evo_probes_line ON evo_probes (tenant, instance, sent_at DESC);
CREATE TABLE IF NOT EXISTS evo_health (
    tenant TEXT NOT NULL, instance TEXT NOT NULL, line_id TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT 'unknown', conn_state TEXT NOT NULL DEFAULT '', last_ok_at TIMESTAMPTZ,
    last_probe_at TIMESTAMPTZ, fails_in_row INT NOT NULL DEFAULT 0, last_error TEXT NOT NULL DEFAULT '', last_rtt_ms INT, restarts INT NOT NULL DEFAULT 0, incident_at TIMESTAMPTZ,
    last_alert_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (tenant, instance));
ALTER TABLE evo_health ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'evolution';
ALTER TABLE evo_health ADD COLUMN IF NOT EXISTS metrics JSONB NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS evo_alerts (
    id SERIAL PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now(), tenant TEXT NOT NULL DEFAULT '', instance TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL, severity TEXT NOT NULL DEFAULT 'alta',
    message TEXT NOT NULL, resolved_at TIMESTAMPTZ, notified BOOLEAN NOT NULL DEFAULT false);
"""
DEFAULTS = {"enabled": False, "provider_id": "", "instance": "crmhub-monitor", "number": "", "secret": "", "interval_min": 30, "timeout_s": 180, "fail_threshold": 2,
            "auto_restart": True, "realert_hours": 6, "alert_emails": [], "alert_whatsapp": [], "balance_warn": 10, "check_providers": True}
KINDS = {"no_recibe": "La línea envía pero NO RECIBE mensajes (la sesión está abierta pero sorda)", "no_entrega": "Los mensajes que envía la línea no llegan a su destino",
         "envio_rechazado": "Evolution rechazó el envío de la prueba", "desconectada": "La línea de WhatsApp está desconectada", "sin_instancia": "La instancia no existe en Evolution",
         "monitor_caido": "La línea de pruebas del monitor no está respondiendo", "sin_vincular": "La línea aún no está vinculada (falta escanear el QR)",
         "token_invalido": "Las credenciales del proveedor ya no son válidas (token vencido o revocado)", "cuenta_suspendida": "La cuenta del proveedor está suspendida o cerrada",
         "saldo_bajo": "El saldo del proveedor está por debajo del mínimo", "calidad_baja": "La calidad del número de WhatsApp está en ROJO (riesgo de bloqueo)",
         "misma_linea": "Esta línea usa el mismo teléfono que la línea de pruebas del monitor: la prueba necesita un número distinto", "calidad_media": "La calidad del número de WhatsApp bajó a AMARILLO", "bloqueada": "Meta bloqueó el envío de la línea", "limitada": "Meta tiene el envío de la línea limitado", "error_api": "La API del proveedor está respondiendo con errores", "sin_permiso": "El token no tiene permiso sobre este número o el número no existe"}
SEV = {"sin_vincular": "info", "saldo_bajo": "media", "calidad_media": "media", "limitada": "media"}   # el resto de las alertas son «alta»
TWILIO_BASE = os.environ.get("TWILIO_BASE", "https://api.twilio.com")
META_BASE = os.environ.get("META_GRAPH_BASE", "https://graph.facebook.com/v25.0")
GUPSHUP_BASE = os.environ.get("GUPSHUP_BASE", "https://api.gupshup.io")
PROV_KEYS = {"meta": ["meta_phone_number_id", "meta_access_token"], "gupshup": ["gupshup_api_key", "gupshup_source", "gupshup_app_name"], "twilio": ["twilio_account_sid", "twilio_auth_token"]}
CH_PKEY = {"whatsapp": "wa_provider", "sms": "sms_provider", "voice": "voice_provider"}
PING = re.compile(r"\[crmhub-ping:([0-9a-f]{8})\]")
PHRASES = ["Prueba automática de conexión de Crm Hub 360 (no necesitas responder).", "Verificación automática de la línea de WhatsApp (mensaje de sistema).",
           "Control de conexión de Crm Hub 360: mensaje automático.", "Chequeo de servicio automático de Crm Hub 360."]
ns = None            # utilidades de main.py (db, get_setting, put_setting, audit, smtp_send, providers_list, me, account)
_task = None
_busy = False
_numcache: dict = {}


# ---------------------------------------------------------------- utilidades
def now() -> datetime:
    return datetime.now(timezone.utc)


def cfg() -> dict:
    c = {**DEFAULTS, **(ns.get_setting("evo_monitor", {}) or {})}
    c["interval_min"] = max(2, min(240, int(c["interval_min"] or 15)))
    c["timeout_s"] = max(30, min(900, int(c["timeout_s"] or 180)))
    c["fail_threshold"] = max(1, min(10, int(c["fail_threshold"] or 2)))
    return c


def save_cfg(c: dict) -> None:
    ns.put_setting("evo_monitor", c)


def digits(v: str) -> str:
    return re.sub(r"\D", "", v or "")


def _q(sql: str, args: tuple = (), *, one=False, many=False):
    with ns.db() as c:
        cur = c.execute(sql, args)
        if one:
            return cur.fetchone()
        if many:
            return cur.fetchall()
    return None


async def aq(sql: str, args: tuple = (), **kw):
    return await asyncio.to_thread(_q, sql, args, **kw)


def provider_of(c: dict) -> dict | None:
    return next((p for p in ns.providers_list() if p["id"] == c.get("provider_id") and p["kind"] == "evolution"), None)


def global_key_for(url: str) -> str:
    """Clave global del servidor Evolution cuyo URL coincide (se usa para crear instancias y operar cualquier línea)."""
    u = (url or "").rstrip("/")
    for p in ns.providers_list():
        if p["kind"] == "evolution" and (p["fields"].get("url") or "").rstrip("/") == u:
            return p["fields"].get("apikey") or ""
    return ""


def lines_of(t: dict) -> list[dict]:
    """Líneas de Evolution de una empresa: la principal (wa_provider=evolution) y las adicionales de tipo Evolution, con su URL, clave de instancia y nombre de instancia."""
    st = t.get("settings") or {}
    out = []
    if st.get("wa_provider") == "evolution" and st.get("evolution_url") and st.get("evolution_instance") and (st.get("line_meta") or {}).get("main:whatsapp", {}).get("enabled", True) is not False:
        out.append({"line_id": "main:whatsapp", "name": ((st.get("line_meta") or {}).get("main:whatsapp") or {}).get("name") or "Principal", "url": st["evolution_url"].rstrip("/"),
                    "key": st.get("evolution_apikey") or "", "instance": st["evolution_instance"]})
    for ln in st.get("lines") or []:
        f = ln.get("fields") or {}
        if ln.get("channel") == "whatsapp" and ln.get("type") == "evolution" and ln.get("enabled", True) is not False and f.get("evolution_url") and f.get("evolution_instance"):
            out.append({"line_id": ln.get("id") or "", "name": ln.get("name") or "Línea", "url": f["evolution_url"].rstrip("/"), "key": f.get("evolution_apikey") or "", "instance": f["evolution_instance"]})
    for l in out:
        l.update(slug=t["slug"], company=t["name"], gkey=global_key_for(l["url"]))
        l["key"] = l["gkey"] or l["key"]
    return out


def other_lines_of(t: dict) -> list[dict]:
    """Líneas de Meta, Gupshup y Twilio (WhatsApp, SMS y voz) de una empresa, con las credenciales que usa cada una. `instance` es un identificador estable «proveedor:canal:identidad»."""
    st = t.get("settings") or {}
    meta = st.get("line_meta") or {}
    out = []

    def add(ch: str, lid: str, name: str, typ: str, f: dict):
        f = {k: (f.get(k) or "").strip() if isinstance(f.get(k), str) else "" for k in PROV_KEYS[typ]}
        need = {"meta": ["meta_phone_number_id", "meta_access_token"], "gupshup": ["gupshup_api_key", "gupshup_app_name"], "twilio": ["twilio_account_sid", "twilio_auth_token"]}[typ]
        if not all(f.get(k) for k in need):
            return
        ident = f.get({"meta": "meta_phone_number_id", "gupshup": "gupshup_app_name", "twilio": "twilio_account_sid"}[typ])
        out.append({"slug": t["slug"], "company": t["name"], "line_id": lid, "name": name, "provider": typ, "channel": ch, "creds": f, "instance": f"{typ}:{ch}:{ident}"})

    for ch, pk in CH_PKEY.items():
        mt = st.get(pk)
        if mt in ("meta", "gupshup", "twilio") and (meta.get("main:" + ch) or {}).get("enabled", True) is not False:
            add(ch, "main:" + ch, (meta.get("main:" + ch) or {}).get("name") or "Principal", mt, st)
        for ln in st.get("lines") or []:
            if ln.get("channel") == ch and ln.get("type") in ("meta", "gupshup", "twilio") and ln.get("enabled", True) is not False:
                add(ch, ln.get("id") or "", ln.get("name") or "Línea", ln["type"], ln.get("fields") or {})
    return out


def all_lines(with_others: bool = True) -> list[dict]:
    """Todas las líneas vigiladas: Evolution (prueba de extremo a extremo) y, si se pide, las de Meta, Gupshup y Twilio (comprobaciones de la API del proveedor)."""
    rows = _q("SELECT slug, name, settings, status FROM tenants WHERE status='active'", many=True) or []
    out = [{**l, "provider": "evolution"} for t in rows for l in lines_of(t)]
    if with_others:
        out += [l for t in rows for l in other_lines_of(t)]
    return out


async def ev(method: str, base: str, key: str, path: str, **kw) -> httpx.Response:
    async with httpx.AsyncClient(timeout=kw.pop("timeout", 20)) as c:
        return await c.request(method, base.rstrip("/") + path, headers={"apikey": key, "Content-Type": "application/json"}, **kw)


async def conn_state(base: str, key: str, inst: str) -> str:
    """'open', 'close', 'connecting', 'missing' (la instancia no existe) o 'error: …'."""
    try:
        r = await ev("GET", base, key, f"/instance/connectionState/{inst}")
        if r.status_code == 404:
            return "missing"
        r.raise_for_status()
        j = r.json()
        return str((j.get("instance") or j).get("state") or "unknown")
    except Exception as e:
        return "error: " + str(e)[:80]


async def send_text(base: str, key: str, inst: str, number: str, text: str) -> tuple[bool, str]:
    try:
        r = await ev("POST", base, key, f"/message/sendText/{inst}", json={"number": number, "text": text}, timeout=25)
        if r.status_code >= 400:
            return False, f"{r.status_code}: {r.text[:140]}"
        return True, ""
    except Exception as e:
        return False, str(e)[:140]


# ---------------------------------------------------------------- línea de pruebas (el «eco»)
def monitor_conn() -> dict | None:
    c = cfg()
    p = provider_of(c)
    if not p or not c["instance"]:
        return None
    return {"url": p["fields"]["url"].rstrip("/"), "key": p["fields"].get("apikey") or "", "instance": c["instance"]}


async def monitor_number() -> str:
    """Número de la línea de pruebas (dueño de la sesión de WhatsApp), solo dígitos; el configurado a mano manda."""
    c = cfg()
    if digits(c.get("number")):
        return digits(c["number"])
    m = monitor_conn()
    if not m:
        return ""
    hit = _numcache.get(m["instance"])
    if hit and time.time() - hit[1] < 120:
        return hit[0]
    try:
        r = await ev("GET", m["url"], m["key"], "/instance/fetchInstances", params={"instanceName": m["instance"]})
        d = r.json()
        d = d[0] if isinstance(d, list) and d else d
        n = digits(((d or {}).get("ownerJid") or "").split("@")[0])
        _numcache[m["instance"]] = (n, time.time())
        return n
    except Exception:
        return ""


def webhook_body(c: dict) -> dict:
    return {"url": f"https://{ns.CONTROL_HOST}/monitor/evolution", "enabled": True, "byEvents": False, "base64": False, "headers": {"apikey": c["secret"]}, "events": ["MESSAGES_UPSERT"]}


async def ensure_monitor_instance() -> str:
    """Crea la instancia de la línea de pruebas (si falta) y le apunta el webhook al Centro. Devuelve una nota."""
    c = cfg()
    m = monitor_conn()
    if not m:
        raise HTTPException(400, "Elige primero el servidor Evolution (proveedor) de la línea de pruebas.")
    if not c["secret"]:
        c["secret"] = secrets.token_urlsafe(24)
        save_cfg(c)
    wh = webhook_body(c)
    r = await ev("POST", m["url"], m["key"], "/instance/create", json={"instanceName": m["instance"], "integration": "WHATSAPP-BAILEYS", "qrcode": True, "webhook": wh})
    note = "Instancia creada." if r.status_code in (200, 201) else "La instancia ya existía."
    if r.status_code not in (200, 201, 403, 409) and "already" not in r.text.lower():
        raise HTTPException(502, f"Evolution respondió {r.status_code}: {r.text[:160]}")
    s = await ev("POST", m["url"], m["key"], f"/webhook/set/{m['instance']}", json={"webhook": wh})
    if s.status_code >= 400:
        s = await ev("POST", m["url"], m["key"], f"/webhook/set/{m['instance']}", json=wh)
    if s.status_code >= 400:
        raise HTTPException(502, f"No se pudo configurar el webhook de la línea de pruebas ({s.status_code}): {s.text[:140]}")
    return note + " Webhook configurado."


# ---------------------------------------------------------------- estado, alertas y avisos
async def health_row(tenant: str, inst: str) -> dict:
    r = await aq("SELECT * FROM evo_health WHERE tenant=%s AND instance=%s", (tenant, inst), one=True)
    return r or {"tenant": tenant, "instance": inst, "state": "unknown", "fails_in_row": 0, "restarts": 0, "last_ok_at": None, "incident_at": None, "last_alert_at": None}


async def set_health(l: dict, **f) -> None:
    """Crea o actualiza el estado de la línea (todos los campos se guardan también en la primera escritura)."""
    if not f:
        return
    f.setdefault("provider", l.get("provider", "evolution"))
    if "metrics" in f:
        f["metrics"] = json.dumps(f["metrics"])
    names = list(f)
    await aq(f"INSERT INTO evo_health (tenant, instance, line_id, {', '.join(names)}) VALUES (%s,%s,%s,{', '.join(['%s'] * len(names))}) "
             f"ON CONFLICT (tenant, instance) DO UPDATE SET {', '.join(f'{k}=EXCLUDED.{k}' for k in names)}, updated_at=now()", (l["slug"], l["instance"], l["line_id"], *f.values()))


async def notify(title: str, body: str) -> None:
    """Avisa por correo y por WhatsApp (línea de pruebas) a quienes están en la configuración."""
    c = cfg()
    mail = ns.get_setting("mail") or {}
    emails = [e for e in c["alert_emails"] if e] or ([ns.account()["email"]] if ns.account().get("email") else [])
    if mail.get("host") and mail.get("from_address") and mail.get("enabled", True):
        for to in emails:
            try:
                await asyncio.to_thread(ns.smtp_send, mail, to, f"[Crm Hub 360] {title}", body)
            except Exception as e:
                log.warning("alerta por correo a %s: %s", to, str(e)[:100])
    m = monitor_conn()
    if m and c["alert_whatsapp"] and await conn_state(m["url"], m["key"], m["instance"]) == "open":
        for n in c["alert_whatsapp"]:
            await send_text(m["url"], m["key"], m["instance"], digits(n), f"🔔 *Crm Hub 360 · Monitor de WhatsApp*\n{title}\n{body[:600]}")


async def open_alert(l: dict, kind: str, detail: str = "") -> None:
    msg = f"{l['company']} · línea «{l['name']}» ({l.get('provider', 'evolution')}): {KINDS.get(kind, kind)}." + (f" {detail}" if detail else "")
    exists = await aq("SELECT id FROM evo_alerts WHERE tenant=%s AND instance=%s AND kind=%s AND resolved_at IS NULL", (l["slug"], l["instance"], kind), one=True)
    if exists:
        return
    sev = SEV.get(kind, "alta")
    await aq("INSERT INTO evo_alerts (tenant, instance, kind, severity, message, notified) VALUES (%s,%s,%s,%s,%s,%s)", (l["slug"], l["instance"], kind, sev, msg, sev != "info"))
    if sev != "info":
        await notify(f"Línea de WhatsApp con problemas: {l['company']}", msg + "\n\nRevísalo en el Centro de control → Monitor WhatsApp (puedes reiniciar la línea o escanear su QR desde ahí).")
    await set_health(l, last_alert_at=now())


async def resolve_alerts(l: dict) -> None:
    rows = await aq("UPDATE evo_alerts SET resolved_at=now() WHERE tenant=%s AND instance=%s AND resolved_at IS NULL RETURNING id, kind, severity", (l["slug"], l["instance"]), many=True)
    if rows and any(r["severity"] != "info" for r in rows):
        await notify(f"Recuperada: {l['company']}", f"La línea «{l['name']}» de {l['company']} volvió a funcionar (envía y recibe).")


async def on_connected(slug: str, instance: str) -> None:
    """La línea quedó vinculada/conectada: cierra al instante las alertas de «sin vincular / desconectada / sin instancia» (sin esperar a la próxima prueba) y lanza una prueba."""
    l = next((x for x in all_lines(False) if x["slug"] == slug and x["instance"] == instance), None)
    if not l:
        return
    h = await health_row(slug, instance)
    if h.get("state") in ("sin_vincular", "desconectada", "sin_instancia"):
        await set_health(l, state="unknown", conn_state="open", fails_in_row=0, last_error="", incident_at=None)
        await aq("UPDATE evo_alerts SET resolved_at=now() WHERE tenant=%s AND instance=%s AND resolved_at IS NULL AND kind IN ('sin_vincular','desconectada','sin_instancia')", (slug, instance))
        if cfg()["enabled"]:   # solo al recuperarse (el diálogo consulta el estado cada pocos segundos): una prueba para confirmar el envío y la recepción
            try:
                await run_probe(l)
            except Exception as e:
                log.warning("prueba tras vincular %s: %s", instance, str(e)[:100])


async def record_result(l: dict, kind: str, ok: bool, detail: str = "", rtt: int | None = None, *, immediate: bool = False, metrics: dict | None = None) -> None:
    """Aplica el resultado de una prueba al estado de la línea: recupera, cuenta fallos, abre alerta y reinicia la instancia una vez por incidente."""
    c = cfg()
    h = await health_row(l["slug"], l["instance"])
    if ok:
        was_bad = h["fails_in_row"] >= c["fail_threshold"] or h["state"] not in ("ok", "unknown")
        await set_health(l, state="ok", conn_state="open", last_ok_at=now(), last_probe_at=now(), fails_in_row=0, last_error="", last_rtt_ms=rtt, restarts=0, incident_at=None)
        if was_bad:
            await resolve_alerts(l)
        return
    fails = h["fails_in_row"] + 1
    await set_health(l, state=kind, last_probe_at=now(), fails_in_row=fails, last_error=detail[:300], incident_at=h.get("incident_at") or now(), **({"metrics": metrics} if metrics is not None else {}))
    if kind == "sin_vincular":
        await open_alert(l, kind)
        return
    if fails >= c["fail_threshold"] or immediate:
        again = h.get("last_alert_at") and now() - h["last_alert_at"] > timedelta(hours=c["realert_hours"])
        if again:
            await aq("UPDATE evo_alerts SET resolved_at=now() WHERE tenant=%s AND instance=%s AND kind=%s AND resolved_at IS NULL", (l["slug"], l["instance"], kind))
        await open_alert(l, kind, detail)
        if c["auto_restart"] and h["restarts"] < 1 and kind in ("no_recibe", "no_entrega", "desconectada"):
            try:
                r = await ev("POST", l["url"], l["key"], f"/instance/restart/{l['instance']}", timeout=40)
                await set_health(l, restarts=h["restarts"] + 1)
                await aq("INSERT INTO evo_alerts (tenant, instance, kind, severity, message, resolved_at) VALUES (%s,%s,'reinicio','info',%s,now())",
                         (l["slug"], l["instance"], f"Se reinició la instancia automáticamente ({r.status_code})."))
            except Exception as e:
                log.warning("reinicio automático de %s: %s", l["instance"], str(e)[:100])



# ---------------------------------------------------------------- Meta, Gupshup y Twilio: comprobaciones de la API del proveedor
async def check_twilio(f: dict, warn_balance: float) -> tuple[str | None, str, list, dict]:
    """(fallo, detalle, avisos, métricas). Cuenta activa (credenciales válidas) y saldo."""
    sid, tok = f["twilio_account_sid"], f["twilio_auth_token"]
    async with httpx.AsyncClient(timeout=20, auth=(sid, tok)) as c:
        r = await c.get(f"{TWILIO_BASE}/2010-04-01/Accounts/{sid}.json")
        if r.status_code in (401, 403):
            return "token_invalido", f"Twilio respondió {r.status_code}", [], {}
        if r.status_code >= 400:
            return "error_api", f"Twilio respondió {r.status_code}", [], {}
        acc = r.json()
        m = {"cuenta": acc.get("status"), "tipo": acc.get("type")}
        if acc.get("status") != "active":
            return "cuenta_suspendida", f"Estado de la cuenta: {acc.get('status')}", [], m
        warns = []
        try:   # el saldo solo existe en cuentas principales con saldo prepago: si no se puede leer, no es un fallo
            b = await c.get(f"{TWILIO_BASE}/2010-04-01/Accounts/{sid}/Balance.json")
            if b.status_code == 200:
                j = b.json()
                m.update(saldo=float(j.get("balance")), moneda=j.get("currency"))
                if (j.get("currency") or "USD") == "USD" and float(j.get("balance")) < warn_balance:
                    warns.append(("saldo_bajo", f"Saldo: {j.get('balance')} {j.get('currency')} (mínimo {warn_balance})"))
        except Exception:
            pass
    return None, "", warns, m


async def check_meta(f: dict) -> tuple[str | None, str, list, dict]:
    """Token válido, número conectado, **puede enviar** (health_status) y calidad/límite del número (Graph API). Si Meta rechaza algún campo opcional se reintenta sin él."""
    pid, tok = f["meta_phone_number_id"], f["meta_access_token"]
    base = "display_phone_number,verified_name,quality_rating,status,name_status,throughput,health_status"
    async with httpx.AsyncClient(timeout=20) as c:
        for fields in (base + ",whatsapp_business_manager_messaging_limit", base):
            r = await c.get(f"{META_BASE}/{pid}", params={"fields": fields}, headers={"Authorization": f"Bearer {tok}"})
            if r.status_code != 400 or "whatsapp_business_manager_messaging_limit" not in fields:
                break
            if ((r.json().get("error") or {}).get("code")) not in (100, 12):   # campo no disponible: se prueba sin él
                break
    j = {}
    try:
        j = r.json()
    except Exception:
        pass
    if r.status_code >= 400:
        e = (j.get("error") or {}) if isinstance(j, dict) else {}
        code = e.get("code")
        if code == 190 or r.status_code == 401:
            return "token_invalido", (e.get("message") or "Token inválido o vencido")[:160], [], {}
        if code in (100, 10, 200, 33, 368) or r.status_code in (403, 404):
            return "sin_permiso", (e.get("message") or f"Meta respondió {r.status_code}")[:160], [], {}
        return "error_api", f"Meta respondió {r.status_code}: {(e.get('message') or '')[:120]}", [], {}
    hs = j.get("health_status") or {}
    lim = j.get("whatsapp_business_manager_messaging_limit") or j.get("messaging_limit_tier")
    m = {"numero": j.get("display_phone_number"), "nombre": j.get("verified_name"), "calidad": j.get("quality_rating"), "limite": lim, "estado": j.get("status"), "puede_enviar": hs.get("can_send_message")}
    why = "; ".join(str((x.get("error_description") or x.get("error_code") or ""))[:100] for e in (hs.get("entities") or []) for x in (e.get("errors") or []))[:240]
    if hs.get("can_send_message") == "BLOCKED":
        return "bloqueada", "Meta bloquea el envío de esta línea" + (f": {why}" if why else ""), [], m
    if j.get("status") and j["status"] not in ("CONNECTED",):
        return "desconectada", f"Estado del número: {j['status']}", [], m
    q = (j.get("quality_rating") or "").upper()
    if q == "RED":
        return "calidad_baja", "Meta puede limitar o bloquear el número: revisa los reportes y bloqueos de los clientes y baja el volumen.", [], m
    warns = []
    if q == "YELLOW":
        warns.append(("calidad_media", "Baja el volumen y mejora el contenido de las plantillas para no llegar a rojo."))
    if hs.get("can_send_message") == "LIMITED":
        warns.append(("limitada", "Meta limita el envío de esta línea" + (f": {why}" if why else "")))
    return None, "", warns, m


async def check_gupshup(f: dict) -> tuple[str | None, str, list, dict]:
    """La clave de la app sigue siendo válida (consulta de plantillas de la API de la app). Solo 401/403 se consideran fallo: la API de envío no publica un endpoint de salud."""
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(f"{GUPSHUP_BASE}/wa/api/v1/template/list/{f['gupshup_app_name']}", headers={"apikey": f["gupshup_api_key"]})
    if r.status_code in (401, 403):
        return "token_invalido", f"Gupshup respondió {r.status_code}", [], {}
    if r.status_code >= 500:
        return "error_api", f"Gupshup respondió {r.status_code}", [], {}
    return None, "", [], {"app": f["gupshup_app_name"], "verificado": "clave"}


async def check_line(l: dict) -> str:
    """Comprueba una línea de proveedor oficial y aplica el resultado: abre/cierra alertas y guarda las métricas. Devuelve el estado."""
    c = cfg()
    try:
        if l["provider"] == "twilio":
            fail, detail, warns, m = await check_twilio(l["creds"], float(c.get("balance_warn") or 10))
        elif l["provider"] == "meta":
            fail, detail, warns, m = await check_meta(l["creds"])
        else:
            fail, detail, warns, m = await check_gupshup(l["creds"])
    except Exception as e:
        fail, detail, warns, m = "error_api", "No se pudo contactar al proveedor: " + str(e)[:100], [], {}
    if fail:
        await aq("UPDATE evo_alerts SET resolved_at=now() WHERE tenant=%s AND instance=%s AND resolved_at IS NULL AND kind <> %s", (l["slug"], l["instance"], fail))   # los avisos de otro problema ya no aplican
        await record_result(l, fail, False, detail, immediate=True, metrics=m)
        return fail
    await set_health(l, state="ok", conn_state="ok", last_ok_at=now(), last_probe_at=now(), fails_in_row=0, last_error="", metrics=m)
    active = {k for k, _ in warns}
    for k, d in warns:
        await open_alert(l, k, d)
    # se resuelven las alertas de esta línea cuyo problema ya no existe
    rows = await aq("SELECT id, kind FROM evo_alerts WHERE tenant=%s AND instance=%s AND resolved_at IS NULL", (l["slug"], l["instance"]), many=True) or []
    cleared = [r for r in rows if r["kind"] not in active]
    for r in cleared:
        await aq("UPDATE evo_alerts SET resolved_at=now() WHERE id=%s", (r["id"],))
    if any(SEV.get(r["kind"], "alta") != "info" for r in cleared):
        await notify(f"Recuperada: {l['company']}", f"La línea «{l['name']}» ({l['provider']}) de {l['company']} volvió a estar en orden.")
    return "ok"


# ---------------------------------------------------------------- pruebas
async def run_probe(l: dict) -> str:
    """Una prueba de la línea (Evolution: ping de extremo a extremo; Meta, Gupshup y Twilio: comprobación de su API): estado de la conexión y envío del ping. El resultado lo cierra evaluate() cuando llega el pong o vence el tiempo."""
    if l.get("provider", "evolution") != "evolution":
        return await check_line(l)
    st = await conn_state(l["url"], l["key"], l["instance"])
    await set_health(l, conn_state=st[:60], last_probe_at=now())
    if st == "missing":
        await record_result(l, "sin_instancia", False, "No existe la instancia en el servidor Evolution")
        return "missing"
    if st != "open":
        h = await health_row(l["slug"], l["instance"])
        never = h.get("last_ok_at") is None
        await record_result(l, "sin_vincular" if never and st in ("close", "connecting") else "desconectada", False, f"Estado: {st}")
        return st
    num = await monitor_number()
    if not num:
        return "sin_monitor"
    try:   # una línea no puede probarse a sí misma: si comparte teléfono con la línea de pruebas no hay prueba posible
        info = await ev("GET", l["url"], l["key"], "/instance/fetchInstances", params={"instanceName": l["instance"]}, timeout=15)
        d = info.json()
        d = d[0] if isinstance(d, list) and d else d
        if digits(((d or {}).get("ownerJid") or "").split("@")[0]) == num:
            await record_result(l, "misma_linea", False, f"Ambas usan el +{num}", immediate=True)
            return "misma_linea"
    except Exception:
        pass
    pid = secrets.token_hex(4)
    ok, err = await send_text(l["url"], l["key"], l["instance"], num, f"[crmhub-ping:{pid}]\n{PHRASES[int(pid, 16) % len(PHRASES)]}")
    await aq("INSERT INTO evo_probes (id, tenant, line_id, instance, send_ok, send_error, status) VALUES (%s,%s,%s,%s,%s,%s,%s)", (pid, l["slug"], l["line_id"], l["instance"], ok, err, "pending" if ok else "send_failed"))
    if not ok:
        await aq("UPDATE evo_probes SET kind='envio_rechazado' WHERE id=%s", (pid,))
        await record_result(l, "envio_rechazado", False, err)
    return pid


async def evaluate() -> None:
    """Cierra las pruebas pendientes: con pong → bien; vencidas → se clasifica el fallo."""
    c = cfg()
    pend = await aq("SELECT * FROM evo_probes WHERE status='pending'", many=True) or []
    for p in pend:
        l = next((x for x in all_lines() if x["slug"] == p["tenant"] and x["instance"] == p["instance"]), None)
        if not l:
            await aq("UPDATE evo_probes SET status='timeout', kind='sin_linea' WHERE id=%s", (p["id"],))
            continue
        if p["pong_at"]:
            rtt = int((p["pong_at"] - p["sent_at"]).total_seconds() * 1000)
            await aq("UPDATE evo_probes SET status='ok', rtt_ms=%s WHERE id=%s", (rtt, p["id"]))
            await record_result(l, "ok", True, rtt=rtt)
        elif (now() - p["sent_at"]).total_seconds() > c["timeout_s"]:
            if p["ping_at"]:
                kind, detail = "no_recibe", "El mensaje llegó a la línea de pruebas y esta respondió, pero la respuesta no llegó a la línea."
            else:
                others = await aq("SELECT count(*) n FROM evo_probes WHERE ping_at > now() - make_interval(secs => %s) AND tenant <> %s", (c["timeout_s"] * 3, p["tenant"]), one=True)
                recent = await aq("SELECT count(DISTINCT tenant) n FROM evo_probes WHERE sent_at > now() - make_interval(secs => %s) AND tenant <> %s", (c["timeout_s"] * 3, p["tenant"]), one=True)
                if (recent["n"] or 0) >= 1 and (others["n"] or 0) == 0:
                    kind, detail = "monitor_caido", "Ninguna línea logró llegar a la línea de pruebas: revisa su sesión de WhatsApp."
                else:
                    kind, detail = "no_entrega", "El envío fue aceptado pero el mensaje no llegó a la línea de pruebas."
            await aq("UPDATE evo_probes SET status='timeout', kind=%s WHERE id=%s", (kind, p["id"]))
            if kind == "monitor_caido":
                await open_alert({"slug": "", "instance": "monitor", "company": "Línea de pruebas", "name": cfg()["instance"], "line_id": ""}, "monitor_caido", detail)
            else:
                await record_result(l, kind, False, detail)
    await aq("DELETE FROM evo_probes WHERE sent_at < now() - interval '14 days'")


async def due_lines() -> list[dict]:
    c = cfg()
    out = []
    for l in all_lines():
        h = await health_row(l["slug"], l["instance"])
        last = h.get("last_probe_at")
        base = c["interval_min"] if l.get("provider", "evolution") == "evolution" else min(c["interval_min"], 10)   # las consultas a la API de un proveedor son baratas: más seguido
        step = timedelta(minutes=base) if h["state"] in ("ok", "unknown") else timedelta(minutes=max(2, base // 3))   # con problemas se reprueba más seguido
        if not last or now() - last >= step:
            out.append(l)
    return out


async def recover_linked() -> None:
    """Líneas marcadas «sin vincular / desconectada / sin instancia» que ya están conectadas: cierra la alerta sin esperar la prueba (también con el monitor apagado)."""
    for l in all_lines(False):
        h = await health_row(l["slug"], l["instance"])
        if h.get("state") in ("sin_vincular", "desconectada", "sin_instancia") and await conn_state(l["url"], l["key"], l["instance"]) == "open":
            await on_connected(l["slug"], l["instance"])


async def tick() -> None:
    global _busy
    if _busy:
        return
    _busy = True
    try:
        await recover_linked()
        c = cfg()
        if not c["enabled"]:
            return
        due = await due_lines()
        # Meta, Gupshup y Twilio: se consulta su API (no necesitan la línea de pruebas)
        if c["check_providers"]:
            for l in [x for x in due if x["provider"] != "evolution"]:
                await check_line(l)
        # Evolution: prueba de extremo a extremo con la línea de pruebas
        if monitor_conn():
            await evaluate()
            m = monitor_conn()
            if await conn_state(m["url"], m["key"], m["instance"]) != "open":
                await open_alert({"slug": "", "instance": "monitor", "company": "Línea de pruebas", "name": c["instance"], "line_id": ""}, "monitor_caido", "La línea de pruebas no está conectada: vincúlala por QR en el Monitor.")
                return
            await aq("UPDATE evo_alerts SET resolved_at=now() WHERE instance='monitor' AND kind='monitor_caido' AND resolved_at IS NULL")   # la línea de pruebas ya está conectada
            for l in [x for x in due if x["provider"] == "evolution"]:
                await run_probe(l)
                await asyncio.sleep(20)   # las pruebas se reparten: no salen todas a la vez
    except Exception:
        log.exception("monitor de canales")
    finally:
        _busy = False


async def loop() -> None:
    await asyncio.sleep(15)
    while True:
        await tick()
        await asyncio.sleep(30)


# ---------------------------------------------------------------- webhook de la línea de pruebas
def _auth_ok(request: Request) -> bool:
    given = request.headers.get("apikey", "")
    sec = cfg()["secret"]
    return bool(sec) and hmac.compare_digest(given.encode(), sec.encode())


async def monitor_webhook(request: Request):
    """POST /monitor/evolution — la línea de pruebas recibe un ping y responde con el pong."""
    if not _auth_ok(request):
        raise HTTPException(403, "No autorizado")
    p = await request.json()
    if str(p.get("event", "")).lower().replace("_", ".") != "messages.upsert":
        return {"ok": True}
    d = p.get("data") or {}
    key = d.get("key") or {}
    if key.get("fromMe") or str(key.get("remoteJid", "")).endswith("@g.us"):
        return {"ok": True}
    msg = d.get("message") or {}
    text = msg.get("conversation") or (msg.get("extendedTextMessage") or {}).get("text") or ""
    m = PING.search(text)
    if not m:
        return {"ok": True}
    pid = m.group(1)
    await aq("UPDATE evo_probes SET ping_at=now() WHERE id=%s AND ping_at IS NULL", (pid,))
    jid = key.get("remoteJidAlt") or key.get("senderPn") or d.get("senderPn") or key.get("remoteJid") or ""
    to = jid.split("@")[0] if jid.endswith("@s.whatsapp.net") else jid
    mc = monitor_conn()
    if mc and to:
        ok, err = await send_text(mc["url"], mc["key"], mc["instance"], to, f"[crmhub-pong:{pid}]")
        if not ok:
            log.warning("pong no enviado (%s): %s", pid, err)
    return {"ok": True}


# ---------------------------------------------------------------- API para la interfaz del Centro
class ConfigReq(BaseModel):
    """Configuración del monitor (solo lo que viene se cambia)."""
    enabled: bool | None = None
    provider_id: str | None = None
    instance: str | None = None
    number: str | None = None
    interval_min: int | None = None
    timeout_s: int | None = None
    fail_threshold: int | None = None
    auto_restart: bool | None = None
    realert_hours: int | None = None
    alert_emails: list[str] | None = None
    alert_whatsapp: list[str] | None = None
    balance_warn: float | None = None
    check_providers: bool | None = None


def public_cfg(c: dict) -> dict:
    return {**{k: c[k] for k in DEFAULTS if k not in ("secret",)}, "secretSet": bool(c["secret"]), "webhookUrl": f"https://{ns.CONTROL_HOST}/monitor/evolution"}


def tenant_by_slug(slug: str) -> dict:
    t = _q("SELECT slug, name, settings, status FROM tenants WHERE slug=%s", (slug,), one=True)
    if not t:
        raise HTTPException(404, "Empresa no encontrada")
    return t


async def send_test_text(url: str, key: str, instance: str, to: str, text: str) -> None:
    """Envía un mensaje de prueba por la instancia (desde el Centro de control). Lanza 400/502 con un motivo entendible."""
    num = re.sub(r"\D", "", to or "")
    if len(num) < 8:
        raise HTTPException(400, "Escribe el número con código de país, p. ej. 573001234567.")
    if await conn_state(url, key, instance) != "open":
        raise HTTPException(400, "La línea no está conectada: escanea el QR primero.")
    x = await ev("POST", url, key, f"/message/sendText/{instance}", json={"number": num, "text": (text or "").strip() or "Mensaje de prueba de Crm Hub 360 ✅"})
    if x.status_code >= 400:
        raise HTTPException(502, f"Evolution no pudo enviar ({x.status_code}): {x.text[:160]}")


def line_for(slug: str, line_id: str = "") -> dict:
    """Línea de Evolution de la empresa (la indicada o la principal) para operarla desde el Centro."""
    ls = lines_of(tenant_by_slug(slug))
    if not ls:
        raise HTTPException(400, "Esta empresa no tiene una línea de WhatsApp con Evolution configurada (Servicios → WhatsApp).")
    return next((x for x in ls if x["line_id"] == line_id), ls[0])


def init(deps) -> None:
    """Conecta el módulo con main.py: crea las tablas, registra las rutas y arranca el vigilante."""
    global ns
    ns = deps
    with ns.db() as c:
        c.execute(SCHEMA)
    r = APIRouter()
    me = ns.me

    @r.post("/monitor/evolution")
    async def _webhook(request: Request):
        """Webhook de la línea de pruebas (autenticado por el secreto del monitor, no por sesión): responde sola a los pings."""
        return await monitor_webhook(request)

    @r.get("/api/evo-monitor")
    async def _status(actor: str = Depends(me)):
        """Estado del monitor: configuración, línea de pruebas, cada línea de las empresas con su historial reciente y las alertas abiertas y recientes. Lo llama la interfaz web del Centro."""
        c = cfg()
        m = monitor_conn()
        mon = {"configured": bool(m), "instance": c["instance"], "state": (await conn_state(m["url"], m["key"], m["instance"])) if m else "sin_configurar", "number": await monitor_number() if m else ""}
        lines = []
        for l in all_lines():
            h = await health_row(l["slug"], l["instance"])
            hist = await aq("SELECT status, kind, rtt_ms, sent_at FROM evo_probes WHERE tenant=%s AND instance=%s ORDER BY sent_at DESC LIMIT 14", (l["slug"], l["instance"]), many=True) or []
            lines.append({"slug": l["slug"], "company": l["company"], "line": l["name"], "lineId": l["line_id"], "instance": l["instance"], "provider": l.get("provider", "evolution"), "channel": l.get("channel", "whatsapp"),
                          "metrics": h.get("metrics") or {}, "state": h["state"], "connState": h.get("conn_state") or "",
                          "lastOkAt": h["last_ok_at"], "lastProbeAt": h.get("last_probe_at"), "failsInRow": h["fails_in_row"], "lastError": h.get("last_error") or "", "rttMs": h.get("last_rtt_ms"),
                          "incidentAt": h.get("incident_at"), "history": [{"s": x["status"], "k": x["kind"], "rtt": x["rtt_ms"], "at": x["sent_at"]} for x in hist]})
        alerts = await aq("SELECT id, at, tenant, instance, kind, severity, message, resolved_at FROM evo_alerts ORDER BY (resolved_at IS NULL) DESC, at DESC LIMIT 60", many=True) or []
        names = {r["slug"]: r["name"] for r in (await aq("SELECT slug, name FROM tenants", many=True) or [])}
        return {"config": public_cfg(c), "monitor": mon, "lines": lines, "alerts": [{**a, "company": names.get(a["tenant"], a["tenant"] or "Sistema")} for a in alerts],
                "providers": [{"id": p["id"], "name": p["name"], "url": p["fields"].get("url", "")} for p in ns.providers_list() if p["kind"] == "evolution"], "kinds": KINDS,
                "openAlerts": sum(1 for a in alerts if not a["resolved_at"] and a["severity"] != "info")}

    @r.get("/api/evo-monitor/summary")
    async def _summary(actor: str = Depends(me)):
        """Solo el número de alertas abiertas (para el indicador de la pestaña)."""
        row = await aq("SELECT count(*) n FROM evo_alerts WHERE resolved_at IS NULL AND severity <> 'info'", one=True)
        return {"openAlerts": int(row["n"])}

    @r.put("/api/evo-monitor/config")
    async def _config(req: ConfigReq, actor: str = Depends(me)):
        """Guarda la configuración del monitor (servidor y línea de pruebas, intervalos, avisos). Audita."""
        c = cfg()
        for k, v in req.model_dump(exclude_none=True).items():
            if k == "alert_emails":
                v = [e.strip() for e in v if re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", e.strip())][:5]
            if k == "alert_whatsapp":
                v = [digits(n) for n in v if 8 <= len(digits(n)) <= 15][:5]
            if k == "instance":
                if not re.fullmatch(r"[A-Za-z0-9_-]{2,60}", v):
                    raise HTTPException(400, "El nombre de la instancia solo admite letras, números y guiones")
            if k == "provider_id" and v and not any(p["id"] == v and p["kind"] == "evolution" for p in ns.providers_list()):
                raise HTTPException(400, "Proveedor Evolution no válido")
            c[k] = v
        if not c["secret"]:
            c["secret"] = secrets.token_urlsafe(24)
        save_cfg(c)
        ns.audit(actor, "monitor_evolution_config", None, {k: v for k, v in req.model_dump(exclude_none=True).items()})
        return {"ok": True, "config": public_cfg(c)}

    @r.post("/api/evo-monitor/instance")
    async def _ensure(actor: str = Depends(me)):
        """Crea la línea de pruebas (instancia de Evolution) y le configura el webhook hacia el Centro. Después se vincula por QR."""
        note = await ensure_monitor_instance()
        ns.audit(actor, "monitor_evolution_instancia", cfg()["instance"])
        return {"ok": True, "note": note}

    @r.post("/api/evo-monitor/run")
    async def _run(body: dict, actor: str = Depends(me)):
        """Prueba ahora una línea (slug y lineId) o todas; devuelve el id de la prueba para seguir el resultado en el estado."""
        if not cfg()["enabled"]:
            raise HTTPException(400, "Activa el monitor para probar.")
        ls = [l for l in all_lines() if not body.get("slug") or (l["slug"] == body["slug"] and (not body.get("lineId") or l["line_id"] == body["lineId"]))]
        if not ls:
            raise HTTPException(404, "No hay líneas para probar.")
        if any(l["provider"] == "evolution" for l in ls):
            mc = monitor_conn()
            if not mc or await conn_state(mc["url"], mc["key"], mc["instance"]) != "open":
                raise HTTPException(400, "La línea de pruebas de Evolution no está conectada: vincúlala por QR primero.")
        ids = [await run_probe(l) for l in ls[:30]]
        ns.audit(actor, "monitor_evolution_probar", body.get("slug") or "todas")
        return {"ok": True, "probes": ids}

    @r.post("/api/evo-monitor/alerts/{aid}/resolve")
    async def _resolve(aid: int, actor: str = Depends(me)):
        """Da por atendida una alerta (se vuelve a abrir sola si el problema sigue)."""
        await aq("UPDATE evo_alerts SET resolved_at=now() WHERE id=%s", (aid,))
        ns.audit(actor, "monitor_evolution_alerta_resuelta", str(aid))
        return {"ok": True}

    # ---- vincular por QR, cerrar sesión y reiniciar (empresas y línea de pruebas)
    def _target(slug: str, line_id: str):
        if slug == "__monitor":
            m = monitor_conn()
            if not m:
                raise HTTPException(400, "Elige primero el servidor Evolution de la línea de pruebas.")
            return {"url": m["url"], "key": m["key"], "instance": m["instance"], "company": "Línea de pruebas"}
        return line_for(slug, line_id)

    @r.get("/api/whatsapp/{slug}")
    async def _wa_state(slug: str, lineId: str = "", actor: str = Depends(me)):
        """Estado de la sesión de WhatsApp de una línea de Evolution (empresa o «__monitor»)."""
        t = _target(slug, lineId)
        st = await conn_state(t["url"], t["key"], t["instance"])
        if st == "open" and slug != "__monitor":
            asyncio.create_task(on_connected(slug, t["instance"]))
        return {"instance": t["instance"], "company": t["company"], "state": st}

    @r.post("/api/whatsapp/{slug}/qr")
    async def _wa_qr(slug: str, body: dict, actor: str = Depends(me)):
        """Código QR actual para vincular el WhatsApp de la línea (crea la instancia si falta). Se audita cada vez que se pide."""
        t = _target(slug, (body or {}).get("lineId", ""))
        st = await conn_state(t["url"], t["key"], t["instance"])
        if st == "missing":
            if slug == "__monitor":
                await ensure_monitor_instance()
            else:
                gk = global_key_for(t["url"])
                if not gk:
                    raise HTTPException(400, "La instancia no existe y no hay clave global del servidor Evolution para crearla (Proveedores aliados).")
                cr = await ev("POST", t["url"], gk, "/instance/create", json={"instanceName": t["instance"], "integration": "WHATSAPP-BAILEYS", "qrcode": True})
                if cr.status_code not in (200, 201, 403, 409):
                    raise HTTPException(502, f"Evolution respondió {cr.status_code}: {cr.text[:140]}")
            st = await conn_state(t["url"], t["key"], t["instance"])
        if st == "open":
            if slug != "__monitor":
                asyncio.create_task(on_connected(slug, t["instance"]))
            return {"connected": True, "state": st, "instance": t["instance"]}
        q = await ev("GET", t["url"], t["key"], f"/instance/connect/{t['instance']}")
        if q.status_code >= 400:
            raise HTTPException(502, f"Evolution respondió {q.status_code}: {q.text[:140]}")
        d = q.json()
        ns.audit(actor, "ver_qr_whatsapp", slug, {"instance": t["instance"]})
        return {"connected": False, "state": st, "instance": t["instance"], "qr": d.get("base64") or "", "pairingCode": d.get("pairingCode") or ""}

    @r.post("/api/whatsapp/{slug}/test")
    async def _wa_test(slug: str, body: dict, actor: str = Depends(me)):
        """Envía un mensaje de prueba de WhatsApp por la línea (empresa o «__monitor») al número indicado."""
        t = _target(slug, (body or {}).get("lineId", ""))
        await send_test_text(t["url"], t["key"], t["instance"], (body or {}).get("to", ""), (body or {}).get("text", ""))
        ns.audit(actor, "prueba_envio_whatsapp", slug, {"instance": t["instance"]})
        return {"ok": True}

    @r.post("/api/whatsapp/{slug}/logout")
    async def _wa_logout(slug: str, body: dict, actor: str = Depends(me)):
        """Cierra la sesión de WhatsApp de la línea (el teléfono queda desvinculado) para escanear otro número."""
        t = _target(slug, (body or {}).get("lineId", ""))
        x = await ev("DELETE", t["url"], t["key"], f"/instance/logout/{t['instance']}")
        if x.status_code not in (200, 201, 400, 404):
            raise HTTPException(502, f"Evolution respondió {x.status_code}: {x.text[:140]}")
        ns.audit(actor, "cerrar_sesion_whatsapp", slug, {"instance": t["instance"]})
        return {"ok": True}

    @r.post("/api/whatsapp/{slug}/restart")
    async def _wa_restart(slug: str, body: dict, actor: str = Depends(me)):
        """Reinicia la instancia de Evolution de la línea (reconecta la sesión sin pedir el QR)."""
        t = _target(slug, (body or {}).get("lineId", ""))
        x = await ev("POST", t["url"], t["key"], f"/instance/restart/{t['instance']}", timeout=40)
        if x.status_code >= 400:
            raise HTTPException(502, f"Evolution respondió {x.status_code}: {x.text[:140]}")
        ns.audit(actor, "reiniciar_whatsapp", slug, {"instance": t["instance"]})
        return {"ok": True}

    ns.app.include_router(r)

    async def _start():
        global _task
        _task = asyncio.create_task(loop())

    ns.app.add_event_handler("startup", _start)
