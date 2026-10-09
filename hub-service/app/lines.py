"""Proveedores (líneas) de mensajería por canal: una empresa puede tener varios de WhatsApp, SMS y llamadas, cada uno con su interruptor.
La línea «principal» es la configuración de siempre (claves planas de tenants.settings, que también asigna el Centro de control); las demás viven en
settings.lines. Para enviar, `effective()` devuelve una copia del tenant con la línea elegida superpuesta sobre esas claves planas, así que todo el
código de envío existente funciona sin cambios."""
import json
import re
import secrets

from . import db, httpgen

PKEY = {"whatsapp": "wa_provider", "sms": "sms_provider", "voice": "voice_provider"}
HTTPKEY = {"whatsapp": "generic_whatsapp", "sms": "generic_sms", "voice": "generic_voice"}
TW = [("twilio_account_sid", "Account SID de Twilio", False), ("twilio_auth_token", "Auth Token de Twilio", True)]
SPEC = {
    "whatsapp": {"label": "WhatsApp", "types": {
        "evolution": ("Evolution API (QR)", [("evolution_url", "URL del servidor", False), ("evolution_instance", "Nombre de la instancia", False), ("evolution_apikey", "API key", True)]),
        "meta": ("Meta WhatsApp Cloud API", [("meta_phone_number_id", "ID del número de teléfono", False), ("meta_access_token", "Token de acceso permanente", True)]),
        "gupshup": ("Gupshup", [("gupshup_source", "Número de origen", False), ("gupshup_app_name", "Nombre de la app", False), ("gupshup_api_key", "API key", True)]),
        "twilio": ("Twilio", TW + [("twilio_wa_from", "Remitente de WhatsApp (+57… o MG…)", False)]),
        "generic": ("Otro proveedor (API HTTP)", None)}},
    "sms": {"label": "SMS", "types": {
        "twilio": ("Twilio", TW + [("twilio_sms_from", "Remitente (número, código corto, ID o MG…)", False)]),
        "generic": ("Otro proveedor (API HTTP)", None)}},
    "voice": {"label": "Llamadas", "types": {
        "twilio": ("Twilio Voice", TW + [("twilio_voice_from", "Número que ve el cliente", False)]),
        "generic": ("Otra central / proveedor (API HTTP)", None)}},
}
MAX_LINES = 12


def _st(tenant: dict) -> dict:
    return tenant.get("settings") or {}


def _spec_fields(ch: str, typ: str):
    t = SPEC[ch]["types"].get(typ)
    return t[1] if t else None


def _main_type(st: dict, ch: str) -> str:
    p = st.get(PKEY[ch]) or ""
    if p not in SPEC[ch]["types"]:
        p = "evolution" if ch == "whatsapp" and st.get("evolution_url") else ""
    return p


def _meta(st: dict, ch: str) -> dict:
    return (st.get("line_meta") or {}).get("main:" + ch) or {}


def raw_cards(tenant: dict, ch: str) -> list[dict]:
    """Todas las líneas del canal (principal primero) con su configuración sin ocultar. Uso interno."""
    st = _st(tenant)
    out = []
    mt = _main_type(st, ch)
    if mt:
        m = _meta(st, ch)
        out.append({"id": "main:" + ch, "channel": ch, "type": mt, "name": m.get("name") or "Principal", "enabled": m.get("enabled", True) is not False,
                    "fields": {k: st.get(k, "") for k, _, _ in (_spec_fields(ch, mt) or [])}, "http": st.get(HTTPKEY[ch]) if mt == "generic" else None,
                    "main": True, "extra": {"voice_record": bool(st.get("voice_record"))} if ch == "voice" else {}})
    for ln in st.get("lines") or []:
        if ln.get("channel") == ch and ln.get("type") in SPEC[ch]["types"]:
            out.append({**ln, "main": False, "enabled": ln.get("enabled", True) is not False})
    return out


def _default_id(st: dict, ch: str, cards: list[dict]) -> str | None:
    want = (st.get("line_default") or {}).get(ch)
    active = [c for c in cards if c["enabled"]]
    if want and any(c["id"] == want for c in active):
        return want
    return active[0]["id"] if active else None


def _overlay(tenant: dict, ch: str, card: dict | None) -> dict:
    st = dict(_st(tenant))
    if card is None:   # ninguna línea activa: el canal queda sin configurar
        st[PKEY[ch]] = ""
        if ch == "whatsapp":
            st["evolution_url"] = ""
        return {**tenant, "settings": st}
    st[PKEY[ch]] = card["type"]
    st.update({k: v for k, v in (card.get("fields") or {}).items()})
    if card["type"] == "generic":
        st[HTTPKEY[ch]] = card.get("http") or {}
    if ch == "voice" and card.get("extra"):
        st["voice_record"] = bool(card["extra"].get("voice_record"))
    return {**tenant, "settings": st, "_line": {"id": card["id"], "name": card["name"], "channel": ch}}


def effective(tenant: dict, ch: str, line_id: str | None = None, *, allow_off: bool = False) -> dict:
    """Tenant con la línea del canal ya superpuesta. Sin line_id usa la predeterminada (o la primera activa). Idempotente por canal."""
    res = tenant.get("_res") or {}
    if ch in res and (line_id is None or res[ch] == line_id):
        return tenant
    cards = raw_cards(tenant, ch)
    if line_id:
        card = next((c for c in cards if c["id"] == line_id), None)
        if not card:
            raise ValueError("Esa línea de mensajería ya no existe.")
        if not card["enabled"] and not allow_off:
            raise ValueError(f"La línea «{card['name']}» está apagada. Enciéndela en Integraciones para usarla.")
    else:
        did = _default_id(_st(tenant), ch, cards)
        card = next((c for c in cards if c["id"] == did), None)
    t = _overlay(tenant, ch, card)
    t["_res"] = {**res, ch: card["id"] if card else None}
    return t


def active_lines(tenant: dict, ch: str) -> list[dict]:
    return [{"id": c["id"], "name": c["name"], "type": SPEC[ch]["types"][c["type"]][0]} for c in raw_cards(tenant, ch) if c["enabled"]]


def line_for_instance(tenant: dict, instance: str) -> str | None:
    for c in raw_cards(tenant, "whatsapp"):
        if c["type"] == "evolution" and (c["fields"].get("evolution_instance") or "") == (instance or ""):
            return c["id"]
    return None


# ---------------- vista para la interfaz (sin secretos) ----------------
def _public(card: dict, ch: str) -> dict:
    flds = _spec_fields(ch, card["type"])
    fields = {}
    for k, label, secret in flds or []:
        v = (card["fields"] or {}).get(k) or ""
        fields[k] = {"set": bool(v), "hint": ("…" + v[-4:]) if v and len(v) > 6 else ""} if secret else v
    http = None
    if card["type"] == "generic":
        http = dict(card.get("http") or {})
        sec = http.pop(httpgen.SECRET, "")
        http["secretSet"] = bool(sec); http["secretHint"] = ("…" + sec[-4:]) if sec and len(sec) > 6 else ""
    return {"id": card["id"], "channel": ch, "type": card["type"], "typeLabel": SPEC[ch]["types"][card["type"]][0], "name": card["name"], "enabled": card["enabled"],
            "main": card["main"], "fields": fields, "http": http, "extra": card.get("extra") or {}}


def overview(tenant: dict) -> dict:
    st = _st(tenant)
    out = {}
    for ch, spec in SPEC.items():
        cards = raw_cards(tenant, ch)
        out[ch] = {"label": spec["label"], "default": _default_id(st, ch, cards), "cards": [_public(c, ch) for c in cards],
                   "types": [{"key": k, "label": v[0], "fields": [{"key": f[0], "label": f[1], "secret": f[2]} for f in (v[1] or [])], "http": v[1] is None} for k, v in spec["types"].items()],
                   "canAdd": len(st.get("lines") or []) < MAX_LINES}
    tok = (st.get("telegram_bot_token") or "").strip()
    out["telegram"] = {"label": "Telegram", "default": "main:telegram" if tok and st.get("telegram_off") is not True else None,
                       "cards": [{"id": "main:telegram", "channel": "telegram", "type": "bot", "typeLabel": "Bot de Telegram", "name": (st.get("line_meta") or {}).get("main:telegram", {}).get("name") or ("@" + st["telegram_bot_username"] if st.get("telegram_bot_username") else "Bot"),
                                  "enabled": st.get("telegram_off") is not True, "main": True, "fields": {"telegram_bot_token": {"set": True, "hint": "…" + tok[-4:]}, "telegram_welcome": st.get("telegram_welcome") or ""}, "http": None, "extra": {"bot": st.get("telegram_bot_username") or ""}}] if tok else [],
                       "types": [{"key": "bot", "label": "Bot de Telegram", "fields": [{"key": "telegram_bot_token", "label": "Token del bot (de @BotFather)", "secret": True}, {"key": "telegram_welcome", "label": "Mensaje de bienvenida", "secret": False}], "http": False}],
                       "canAdd": not tok}
    return out


# ---------------- altas, cambios y bajas ----------------
def _write(slug: str, patch: dict) -> None:
    with db.pool.connection() as c:
        c.execute("UPDATE tenants SET settings = settings || %s::jsonb WHERE slug = %s", (json.dumps(patch), slug))


def _clean_fields(ch: str, typ: str, incoming: dict, old: dict) -> dict:
    out = {}
    for k, label, secret in _spec_fields(ch, typ) or []:
        v = incoming.get(k)
        if isinstance(v, dict):
            v = None
        if secret:
            out[k] = (v.strip() if isinstance(v, str) and v.strip() else (old.get(k) or ""))   # vacío = conservar
        else:
            out[k] = (v if isinstance(v, str) else old.get(k, "")).strip()[:500]
        if k == "evolution_url" and out[k]:
            out[k] = out[k].rstrip("/")
            if not out[k].startswith(("http://", "https://")):
                raise ValueError("La URL de Evolution API debe empezar por http:// o https://")
    return out


def save(tenant: dict, body: dict) -> dict:
    ch, typ = body.get("channel"), body.get("type")
    if ch not in SPEC or typ not in SPEC[ch]["types"]:
        raise ValueError("Canal o proveedor no válido")
    slug, st = tenant["slug"], _st(tenant)
    name = (body.get("name") or "").strip()[:60]
    lid = body.get("id")
    http_in = body.get("http") if isinstance(body.get("http"), dict) else None
    extra = {"voice_record": bool(body.get("voice_record"))} if ch == "voice" else {}
    cards = raw_cards(tenant, ch)
    if lid == "main:" + ch:   # la principal escribe en las claves planas de siempre
        old = next((c for c in cards if c["id"] == lid), None)
        patch = {PKEY[ch]: typ}
        patch.update(_clean_fields(ch, typ, body.get("fields") or {}, (old or {}).get("fields") or {}))
        if typ == "generic" and http_in is not None:
            patch[HTTPKEY[ch]] = httpgen.merge(st.get(HTTPKEY[ch]), http_in)
        if ch == "voice":
            patch["voice_record"] = extra["voice_record"]
        meta = dict(st.get("line_meta") or {}); meta[lid] = {**(meta.get(lid) or {}), "name": name or "Principal"}
        patch["line_meta"] = meta
        _write(slug, patch)
        return {"id": lid}
    lines = list(st.get("lines") or [])
    if lid:
        cur = next((l for l in lines if l["id"] == lid), None)
        if not cur:
            raise ValueError("La línea no existe")
        cur.update({"type": typ, "name": name or cur["name"], "fields": _clean_fields(ch, typ, body.get("fields") or {}, cur.get("fields") or {}), "extra": extra})
        if typ == "generic" and http_in is not None:
            cur["http"] = httpgen.merge(cur.get("http"), http_in)
    else:
        if len(lines) >= MAX_LINES:
            raise ValueError(f"Máximo {MAX_LINES} líneas adicionales.")
        if not raw_cards(tenant, ch) and not name:
            name = "Principal"
        lid = "l_" + secrets.token_hex(4)
        new = {"id": lid, "channel": ch, "type": typ, "name": name or f"{SPEC[ch]['types'][typ][0]} {len(raw_cards(tenant, ch)) + 1}", "enabled": True,
               "fields": _clean_fields(ch, typ, body.get("fields") or {}, {}), "extra": extra}
        if typ == "generic":
            new["http"] = httpgen.merge(None, http_in or {})
        lines.append(new)
    _write(slug, {"lines": lines})
    return {"id": lid}


def set_enabled(tenant: dict, lid: str, enabled: bool) -> None:
    st = _st(tenant)
    if lid == "main:telegram":
        _write(tenant["slug"], {"telegram_off": not enabled}); return
    if lid.startswith("main:"):
        meta = dict(st.get("line_meta") or {}); meta[lid] = {**(meta.get(lid) or {}), "enabled": bool(enabled)}
        _write(tenant["slug"], {"line_meta": meta}); return
    lines = list(st.get("lines") or [])
    cur = next((l for l in lines if l["id"] == lid), None)
    if not cur:
        raise ValueError("La línea no existe")
    cur["enabled"] = bool(enabled)
    _write(tenant["slug"], {"lines": lines})


def set_default(tenant: dict, lid: str) -> None:
    ch = lid.split(":")[1] if lid.startswith("main:") else next((l["channel"] for l in _st(tenant).get("lines") or [] if l["id"] == lid), None)
    if ch not in SPEC:
        raise ValueError("La línea no existe")
    if not any(c["id"] == lid for c in raw_cards(tenant, ch)):
        raise ValueError("La línea no existe")
    d = dict(_st(tenant).get("line_default") or {}); d[ch] = lid
    _write(tenant["slug"], {"line_default": d})


def delete(tenant: dict, lid: str) -> None:
    st = _st(tenant)
    if lid.startswith("main:"):
        ch = lid.split(":")[1]
        if ch == "telegram":
            _write(tenant["slug"], {"telegram_bot_token": "", "telegram_off": False}); return
        _write(tenant["slug"], {PKEY[ch]: ""})
        if ch == "whatsapp":
            _write(tenant["slug"], {"evolution_url": ""})
        return
    lines = [l for l in st.get("lines") or [] if l["id"] != lid]
    d = {k: v for k, v in (st.get("line_default") or {}).items() if v != lid}
    _write(tenant["slug"], {"lines": lines, "line_default": d})


def channel_of(tenant: dict, lid: str) -> str:
    if lid.startswith("main:"):
        return lid.split(":")[1]
    for l in _st(tenant).get("lines") or []:
        if l["id"] == lid:
            return l["channel"]
    raise ValueError("La línea no existe")


# ---------------- pruebas ----------------
async def connection_test(tenant: dict, lid: str) -> dict:
    ch = channel_of(tenant, lid)
    if ch == "telegram":
        from . import telegram
        r = await telegram.test(tenant)
        return {"connected": True, "state": "@" + (r.get("bot") or "") + (" · hay un error: " + r["lastError"] if r.get("lastError") else "")}
    t = effective(tenant, ch, lid, allow_off=True)
    typ = next(c["type"] for c in raw_cards(tenant, ch) if c["id"] == lid)
    if ch == "whatsapp":
        from . import whatsapp
        return await whatsapp.test(t)
    if typ == "twilio":
        from . import twilio
        a = await twilio.account(t)
        return {"connected": True, "state": a.get("friendly_name") or "cuenta válida"}
    cfg = (t.get("settings") or {}).get(HTTPKEY[ch]) or {}
    if not cfg.get("url"):
        raise ValueError("Falta la URL del proveedor.")
    return {"connected": True, "state": "configuración guardada", "note": "Un proveedor HTTP no tiene prueba de conexión: usa «Enviar prueba»."}


async def send_test(tenant: dict, lid: str, to: str, text: str = "") -> dict:
    from . import sms, voice, whatsapp
    from .ingest import normalize_phone
    ch = channel_of(tenant, lid)
    phone = normalize_phone(to)
    if not phone:
        raise ValueError("Escribe un número de celular válido (con indicativo de país).")
    if ch == "telegram":
        raise ValueError("Para probar Telegram escríbele al bot desde tu cuenta.")
    t = effective(tenant, ch, lid, allow_off=True)
    name = t["_line"]["name"]
    msg = (text or "").strip()[:300] or f"Prueba de Crm Hub 360: la línea «{name}» funciona."
    if ch == "whatsapp":
        await whatsapp.send_text(t, phone, msg)
    elif ch == "sms":
        await sms.send_text(t, phone, msg)
    else:
        await voice.test_call(t, phone)
    return {"ok": True, "to": phone}
