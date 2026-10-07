"""Formularios web de captación: cada empresa los diseña en Integraciones y obtiene una URL pública (https://<dominio>/f/<slug>)
que puede enlazar o incrustar (iframe). Al enviarse crean el lead, registran el consentimiento y, si aplica, califican."""
import html
import re
import secrets
import time
from collections import defaultdict, deque
from urllib.parse import urlparse

from . import ingest, qualify, telegram
from .espo import Espo

FIELD_TYPES = ["text", "email", "tel", "textarea", "select", "number", "checkbox", "channel"]
MAPS = {"name": "Nombre", "phone": "Teléfono", "email": "Correo", "description": "Descripción / notas", "monthlyIncome": "Ingresos mensuales",
        "totalDebt": "Deuda total", "overdueDebt": "Deuda en mora", "creditorCount": "Cantidad de acreedores"}
CHANNELS = ["Teléfono", "WhatsApp", "Telegram", "Correo"]
MAX_FORMS, MAX_FIELDS = 20, 20
_hits: dict[str, deque] = defaultdict(deque)


def default_form(n: int = 1) -> dict:
    return {
        "id": secrets.token_hex(4), "slug": f"formulario-{n}", "name": f"Formulario {n}", "enabled": True,
        "title": "Cuéntanos tu caso", "intro": "Déjanos tus datos y un asesor se comunicará contigo.", "button": "Enviar", "color": "#4f63e8",
        "fields": [
            {"key": "nombre", "label": "Nombre completo", "type": "text", "required": True, "maps_to": "name", "placeholder": "", "options": []},
            {"key": "telefono", "label": "Teléfono / WhatsApp", "type": "tel", "required": True, "maps_to": "phone", "placeholder": "300 123 4567", "options": []},
            {"key": "correo", "label": "Correo electrónico", "type": "email", "required": False, "maps_to": "email", "placeholder": "", "options": []},
            {"key": "deuda", "label": "¿Cuánto debes aproximadamente? (COP)", "type": "number", "required": False, "maps_to": "totalDebt", "placeholder": "", "options": []},
            {"key": "canal", "label": "¿Cómo prefieres que te contactemos?", "type": "channel", "required": False, "maps_to": "", "placeholder": "", "options": []},
        ],
        "consent_text": "Autorizo el tratamiento de mis datos personales para ser contactado, de acuerdo con la Ley 1581 de 2012 y la política de tratamiento de datos de la empresa.",
        "consent_required": True, "campaign": "", "source": "Formulario Web",
        "success_message": "¡Gracias! Recibimos tus datos y un asesor te contactará pronto.", "redirect_url": "",
    }


def _s(v, n: int) -> str:
    return str(v or "").strip()[:n]


def validate(forms) -> list[dict]:
    if not isinstance(forms, list) or len(forms) > MAX_FORMS:
        raise ValueError(f"Máximo {MAX_FORMS} formularios")
    out, slugs = [], set()
    for f in forms:
        slug = _s(f.get("slug"), 40).lower()
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{2,39}", slug):
            raise ValueError(f"URL inválida «{slug}»: usa 3-40 caracteres: letras minúsculas, números y guiones")
        if slug in slugs:
            raise ValueError(f"La URL «{slug}» está repetida")
        slugs.add(slug)
        name = _s(f.get("name"), 80)
        if not name:
            raise ValueError("Cada formulario necesita un nombre")
        color = _s(f.get("color"), 7)
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
            color = "#4f63e8"
        red = _s(f.get("redirect_url"), 300)
        if red and urlparse(red).scheme not in ("http", "https"):
            raise ValueError("La URL de redirección debe empezar por http:// o https://")
        fields, keys = [], set()
        for fd in (f.get("fields") or [])[:MAX_FIELDS]:
            key = _s(fd.get("key"), 31).lower()
            if not re.fullmatch(r"[a-z][a-z0-9_]{0,30}", key) or key in keys or key in ("website", "_t", "consent"):
                raise ValueError(f"Identificador de campo inválido o repetido: «{key}» (en «{name}»)")
            keys.add(key)
            typ = fd.get("type") if fd.get("type") in FIELD_TYPES else "text"
            mp = fd.get("maps_to") if fd.get("maps_to") in MAPS else ""
            opts = [_s(o, 80) for o in (fd.get("options") or []) if _s(o, 80)][:20]
            if typ == "select" and not opts:
                raise ValueError(f"El campo «{fd.get('label')}» es una lista y necesita opciones")
            fields.append({"key": key, "label": _s(fd.get("label"), 120) or key, "type": typ, "required": bool(fd.get("required")),
                           "maps_to": mp, "placeholder": _s(fd.get("placeholder"), 80), "options": opts})
        maps = {fd["maps_to"] for fd in fields}
        if "name" not in maps or not ({"phone", "email"} & maps):
            raise ValueError(f"«{name}» necesita un campo para el nombre y otro para el teléfono o el correo")
        out.append({
            "id": _s(f.get("id"), 16) or secrets.token_hex(4), "slug": slug, "name": name, "enabled": bool(f.get("enabled", True)),
            "title": _s(f.get("title"), 120), "intro": _s(f.get("intro"), 500), "button": _s(f.get("button"), 30) or "Enviar", "color": color,
            "fields": fields, "consent_text": _s(f.get("consent_text"), 1500), "consent_required": bool(f.get("consent_required", True)),
            "campaign": _s(f.get("campaign"), 120), "source": _s(f.get("source"), 40) or "Formulario Web",
            "success_message": _s(f.get("success_message"), 500) or "¡Gracias! Recibimos tus datos.", "redirect_url": red,
        })
    return out


def find(tenant: dict, slug: str) -> dict | None:
    for f in (tenant.get("settings") or {}).get("forms") or []:
        if f["slug"] == slug and f.get("enabled", True):
            return f
    return None


# ---------------------------------------------------------------- página pública
E = html.escape

CSS = """
:root{--c:%(color)s;--bg:#f4f6fa;--card:#fff;--ink:#1c2233;--mut:#667085;--line:#dfe3ec;--in:#f6f8fb}
@media (prefers-color-scheme:dark){:root{--bg:#0f1420;--card:#171d2c;--ink:#eef1f7;--mut:#9aa4b8;--line:#2a3247;--in:#1e2536}}
*{box-sizing:border-box}body{margin:0;font:16px/1.5 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--bg);color:var(--ink);display:flex;justify-content:center;padding:20px 14px}
.card{width:100%%;max-width:520px;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:26px 24px;box-shadow:0 8px 30px rgba(20,28,60,.08)}
h1{margin:0 0 6px;font-size:23px;letter-spacing:-.02em}p.intro{margin:0 0 18px;color:var(--mut)}
label{display:block;font-size:13.5px;font-weight:600;margin:14px 0 6px}label .req{color:#e5484d}
input,select,textarea{width:100%%;padding:11px 13px;font:inherit;color:var(--ink);background:var(--in);border:1px solid var(--line);border-radius:11px}
textarea{min-height:90px;resize:vertical}input:focus,select:focus,textarea:focus{outline:3px solid color-mix(in srgb,var(--c) 30%%,transparent);border-color:var(--c)}
.chk{display:flex;gap:10px;align-items:flex-start;font-size:13.5px;font-weight:400;color:var(--mut);margin:14px 0}.chk input{width:auto;margin-top:4px}
button,.btn{display:inline-block;width:100%%;margin-top:18px;padding:13px 16px;border:0;border-radius:12px;background:var(--c);color:#fff;font:inherit;font-weight:600;cursor:pointer;text-align:center;text-decoration:none}
.err{background:#fdecec;color:#8a1f24;border:1px solid #f4b8ba;border-radius:11px;padding:10px 13px;margin-bottom:14px;font-size:14.5px}
.ok{text-align:center;padding:10px 0}.ok .tick{width:56px;height:56px;border-radius:50%%;background:color-mix(in srgb,var(--c) 15%%,transparent);color:var(--c);display:grid;place-items:center;font-size:30px;margin:0 auto 12px}
.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}.foot{margin-top:16px;text-align:center;font-size:12px;color:var(--mut)}
"""


def _input(fd: dict, val: str) -> str:
    k, ph = E(fd["key"]), E(fd.get("placeholder", ""))
    req = " required" if fd["required"] else ""
    if fd["type"] == "textarea":
        return f'<textarea name="{k}" placeholder="{ph}"{req}>{E(val)}</textarea>'
    if fd["type"] in ("select", "channel"):
        opts = fd["options"] if fd["type"] == "select" else CHANNELS
        o = "".join(f'<option value="{E(x)}"{" selected" if x == val else ""}>{E(x)}</option>' for x in opts)
        return f'<select name="{k}"{req}><option value="">Selecciona…</option>{o}</select>'
    if fd["type"] == "checkbox":
        return f'<input type="checkbox" name="{k}" value="Sí"{" checked" if val else ""}>'
    typ = {"email": "email", "tel": "tel", "number": "number"}.get(fd["type"], "text")
    extra = ' inputmode="numeric" min="0"' if typ == "number" else ""
    return f'<input type="{typ}" name="{k}" value="{E(val)}" placeholder="{ph}"{extra}{req}>'


def page(form: dict, *, error: str | None = None, values: dict | None = None, done: dict | None = None) -> str:
    values = values or {}
    head = f'<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>{E(form["title"] or form["name"])}</title><style>{CSS % {"color": form["color"]}}</style></head><body><main class="card">'
    if done is not None:
        tg = f'<a class="btn" href="{E(done["telegram"])}" target="_blank" rel="noopener">Abrir Telegram</a><p class="foot">Pulsa «Iniciar» en Telegram para que un asesor te escriba por ahí.</p>' if done.get("telegram") else ""
        return head + f'<div class="ok"><div class="tick">✓</div><h1>{E(form["title"] or "¡Listo!")}</h1><p>{E(form["success_message"])}</p></div>{tg}</main></body></html>'
    fields = ""
    for fd in form["fields"]:
        if fd["type"] == "checkbox":
            fields += f'<label class="chk">{_input(fd, values.get(fd["key"], ""))}<span>{E(fd["label"])}{" *" if fd["required"] else ""}</span></label>'
        else:
            fields += f'<label>{E(fd["label"])}{"<span class=req> *</span>" if fd["required"] else ""}</label>{_input(fd, values.get(fd["key"], ""))}'
    consent = ""
    if form["consent_text"]:
        consent = f'<label class="chk"><input type="checkbox" name="consent" value="1"{" required" if form["consent_required"] else ""}><span>{E(form["consent_text"])}</span></label>'
    err = f'<div class="err" role="alert">{E(error)}</div>' if error else ""
    utm = "".join(f'<input type="hidden" name="{u}" value="">' for u in ("utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"))
    js = "<script>var q=new URLSearchParams(location.search);document.querySelectorAll('input[name^=utm_]').forEach(function(i){i.value=q.get(i.name)||''});</script>"
    return (head + f'<h1>{E(form["title"] or form["name"])}</h1>' + (f'<p class="intro">{E(form["intro"])}</p>' if form["intro"] else "") + err +
            f'<form method="post" autocomplete="on">{fields}{consent}<div class="hp"><label>No llenar</label><input name="website" tabindex="-1" autocomplete="off"></div>'
            f'<input type="hidden" name="_t" value="{int(time.time())}">{utm}<button type="submit">{E(form["button"])}</button></form>'
            f'<p class="foot">Tus datos se envían de forma segura.</p>{js}</main></body></html>')


# ---------------------------------------------------------------- envío
def _limited(key: str, limit: int = 8, window: int = 600) -> bool:
    q, now = _hits[key], time.time()
    while q and now - q[0] > window:
        q.popleft()
    if len(q) >= limit:
        return True
    q.append(now)
    return False


class FormError(ValueError):
    pass


async def submit(tenant: dict, form: dict, data: dict[str, str], ip: str) -> dict:
    if data.get("website"):
        raise FormError("Solicitud no válida.")  # honeypot
    try:
        age = time.time() - int(data.get("_t", "0"))
    except ValueError:
        age = -1
    if age < 3 or age > 7200:
        raise FormError("El formulario expiró o se envió demasiado rápido. Recarga la página e inténtalo de nuevo.")
    if form["consent_text"] and form["consent_required"] and data.get("consent") != "1":
        raise FormError("Debes autorizar el tratamiento de tus datos para continuar.")

    lead: dict = {}
    desc: list[str] = []
    channel = ""
    for fd in form["fields"]:
        v = (data.get(fd["key"]) or "").strip()[:2000]
        if fd["required"] and not v:
            raise FormError(f"Completa el campo «{fd['label']}».")
        if not v:
            continue
        t = fd["type"]
        if t == "email" and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", v):
            raise FormError("El correo no es válido.")
        if t == "tel":
            digits = re.sub(r"\D", "", v)
            if not 7 <= len(digits) <= 15:
                raise FormError("El teléfono no es válido.")
        if t == "number":
            try:
                float(v.replace(",", "."))
            except ValueError:
                raise FormError(f"«{fd['label']}» debe ser un número.")
        if t == "select" and v not in fd["options"]:
            raise FormError(f"Selecciona una opción válida en «{fd['label']}».")
        if t == "channel":
            if v not in CHANNELS:
                raise FormError("Elige un canal de contacto válido.")
            channel = v
            continue
        m = fd["maps_to"]
        if m == "name": lead["name"] = v
        elif m == "phone": lead["phone"] = v
        elif m == "email": lead["email"] = v
        elif m in ("monthlyIncome", "totalDebt", "overdueDebt"):
            lead[m] = float(re.sub(r"[^\d.]", "", v.replace(",", ".")) or 0)
        elif m == "creditorCount": lead[m] = int(float(v.replace(",", ".")))
        else: desc.append(f"{fd['label']}: {v}")
    utm = {k: data.get(k, "")[:120] for k in ("utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term") if data.get(k)}
    if utm:
        desc.append("Origen: " + ", ".join(f"{k}={v}" for k, v in utm.items()))

    # el límite cuenta solo los envíos válidos: equivocarse al llenar el formulario no gasta intentos
    if _limited(f"{ip}|{form['slug']}"):
        raise FormError("Demasiados envíos desde tu conexión. Intenta de nuevo en unos minutos.")

    extra: dict = {}
    for m in ("monthlyIncome", "totalDebt", "overdueDebt"):
        if m in lead:
            extra[m] = lead[m]; extra[m + "Currency"] = "COP"
    if "creditorCount" in lead:
        extra["creditorCount"] = lead["creditorCount"]
    if desc:
        extra["description"] = "\n".join(desc)
    if channel:
        extra["preferredChannel"] = channel
    invite = None
    bot = (tenant.get("settings") or {}).get("telegram_bot_username")
    if channel == "Telegram" and bot:
        invite = secrets.token_urlsafe(9)
        extra["telegramStartToken"] = invite
    espo = Espo(tenant)
    # ¿ya es cliente? (mismo teléfono o correo): se actualiza el lead existente en vez de duplicarlo
    existing = await ingest.find_lead_by_phone(tenant, lead["phone"]) if lead.get("phone") else None
    if not existing and lead.get("email"):
        existing = await ingest.find_lead(tenant, "emailAddress", lead["email"])
    again = bool(existing)
    if existing:
        cur = await espo.get(f"Lead/{existing}")
        upd = {}
        for k, v in extra.items():
            base = k[:-8] if k.endswith("Currency") else k
            if k == "description":
                upd[k] = ((cur.get("description") or "") + "\n— Nuevo envío del formulario —\n" + v).strip()[:5000]
            elif k in ("preferredChannel", "telegramStartToken") or not cur.get(base):
                upd[k] = v
        if upd:
            await espo.put(f"Lead/{existing}", upd)
        lead_id = existing
    else:
        lead_id = await ingest.upsert_lead(tenant, name=lead.get("name", ""), phone=lead.get("phone"), email=lead.get("email"),
                                           source=form["source"], extra=extra, campaign=form["campaign"] or utm.get("utm_campaign"))
    consent = ""
    if form["consent_text"]:
        consent = f" Autorizó el tratamiento de datos personales el {time.strftime('%d/%m/%Y %H:%M', time.gmtime())} UTC. Texto aceptado: «{form['consent_text']}»"
    await espo.note(lead_id, f"[Formulario web: {form['name']}] {'El cliente volvió a enviar el formulario.' if again else 'Nuevo registro.'}{consent}")
    if any(k in extra for k in ("totalDebt", "overdueDebt", "monthlyIncome", "creditorCount")):
        try:
            await qualify.run(tenant, lead_id)
        except Exception:
            pass  # el lead ya existe; la calificación se puede recalcular
    return {"lead_id": lead_id, "telegram": f"https://t.me/{bot}?start={invite}" if invite else None}
