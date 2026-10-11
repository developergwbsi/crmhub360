"""Formularios web de captación: cada empresa los diseña en Integraciones y obtiene una URL pública (https://<dominio>/f/<slug>)
que puede enlazar o incrustar (iframe). Al enviarse crean el lead, registran el consentimiento y, si aplica, califican."""
import asyncio
import html
import json
import logging
import re
import secrets
import time
from collections import defaultdict, deque
from urllib.parse import urlparse

from . import ingest, qualify, telegram
from .espo import Espo

FIELD_TYPES = ["text", "email", "tel", "textarea", "select", "number", "checkbox", "channel"]
MAPS = {"name": "Nombre", "phone": "Teléfono", "email": "Correo", "description": "Descripción / notas", "monthlyIncome": "Ingresos mensuales",
        "totalDebt": "Deuda total", "overdueDebt": "Deuda en mora", "creditorCount": "Cantidad de acreedores",
        "identification": "Identificación (cédula, NIT…)", "identificationType": "Tipo de documento"}
CHANNELS = ["Teléfono", "WhatsApp", "Telegram", "Correo"]
MAX_FORMS, MAX_FIELDS, MAX_ACTIONS = 20, 20, 10
WIDTHS = [25, 33, 50, 66, 75, 100]
OPS = ["eq", "neq", "filled", "empty"]
ACTION_TYPES = ["email", "whatsapp", "notify"]
MAX_IMAGES, MAX_ATTACH = 4, 3
_PDF = re.compile(r"data:application/pdf;base64,[A-Za-z0-9+/=]{20,900000}")
VARS_HELP = "{{nombre}}, {{empresa}}, {{telefono}}, {{correo}} y {{clave_del_campo}} de cualquier pregunta"
_COLOR = re.compile(r"#[0-9a-fA-F]{6}")
_IMG = re.compile(r"(https?://[^\s\"'()<>\\]{4,900}|data:image/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]{20,450000})")
log = logging.getLogger('forms')
_hits: dict[str, deque] = defaultdict(deque)


def default_form(n: int = 1) -> dict:
    return {
        "id": secrets.token_hex(4), "slug": f"formulario-{n}", "name": f"Formulario {n}", "enabled": True,
        "title": "Cuéntanos tu caso", "intro": "Déjanos tus datos y un asesor se comunicará contigo.", "button": "Enviar", "color": "#4f63e8",
        "button_color": "#4f63e8", "button_text_color": "#ffffff", "bg_color": "", "bg_image": "", "header_image": "", "header_color": "#4f63e8",
        "fields": [
            {"key": "nombre", "label": "Nombre completo", "type": "text", "required": True, "maps_to": "name", "placeholder": "", "options": [], "width": 100, "show_if": None},
            {"key": "telefono", "label": "Teléfono / WhatsApp", "type": "tel", "required": True, "maps_to": "phone", "placeholder": "300 123 4567", "options": [], "width": 50, "show_if": None},
            {"key": "correo", "label": "Correo electrónico", "type": "email", "required": False, "maps_to": "email", "placeholder": "", "options": [], "width": 50, "show_if": None},
            {"key": "deuda", "label": "¿Cuánto debes aproximadamente? (COP)", "type": "number", "required": False, "maps_to": "totalDebt", "placeholder": "", "options": [], "width": 100, "show_if": None},
            {"key": "canal", "label": "¿Cómo prefieres que te contactemos?", "type": "channel", "required": False, "maps_to": "", "placeholder": "", "options": [], "width": 100, "show_if": None},
        ],
        "consent_text": "Autorizo el tratamiento de mis datos personales para ser contactado, de acuerdo con la Ley 1581 de 2012 y la política de tratamiento de datos de la empresa.",
        "consent_required": True, "campaign": "", "source": "Formulario Web", "on_duplicate": "update", "duplicate_message": "Ya estás registrado con estos datos. Un asesor te contactará pronto.",
        "success_message": "¡Gracias! Recibimos tus datos y un asesor te contactará pronto.", "redirect_url": "", "actions": [],
    }


def default_action() -> dict:
    return {"id": secrets.token_hex(3), "enabled": True, "type": "email", "when": None, "to": "lead", "to_custom": "",
            "images": [], "attachments": [], "button_label": "", "button_kind": "whatsapp", "button_value": "", "button_text": "Hola, me registré en el formulario y quiero más información.", "notify_text": "",
            "subject": "Recibimos tu solicitud, {{nombre}}", "message": "Hola {{nombre}},\n\nGracias por escribirnos. Recibimos tus datos y un asesor te contactará muy pronto.\n\n{{empresa}}"}


def _s(v, n: int) -> str:
    return str(v or "").strip()[:n]


def _cond(c, keys: set, label: str) -> dict | None:
    """Condición {field, op, value}: «el campo X es / no es / tiene / no tiene valor». None = sin condición."""
    if not isinstance(c, dict) or not c.get("field"):
        return None
    f, op = _s(c.get("field"), 31).lower(), c.get("op") if c.get("op") in OPS else "eq"
    if f not in keys:
        raise ValueError(f"La condición de «{label}» usa un campo que no existe: «{f}»")
    return {"field": f, "op": op, "value": _s(c.get("value"), 120)}


def _img(v, label: str) -> str:
    v = _s(v, 460000)
    if v and not _IMG.fullmatch(v):
        raise ValueError(f"{label}: usa una dirección https:// o sube una imagen PNG, JPG, WEBP o GIF")
    return v


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
        def col(k, default=""):
            v = _s(f.get(k), 7)
            return v if _COLOR.fullmatch(v) else default
        color = col("color", "#4f63e8")
        red = _s(f.get("redirect_url"), 300)
        if red and urlparse(red).scheme not in ("http", "https"):
            raise ValueError("La URL de redirección debe empezar por http:// o https://")
        fields, keys = [], set()
        raw_fields = (f.get("fields") or [])[:MAX_FIELDS]
        for fd in raw_fields:
            key = _s(fd.get("key"), 31).lower()
            if not re.fullmatch(r"[a-z][a-z0-9_]{0,30}", key) or key in keys or key in ("website", "_t", "consent") or key.startswith("utm_"):
                raise ValueError(f"Identificador de campo inválido o repetido: «{key}» (en «{name}»)")
            keys.add(key)
        for fd in raw_fields:
            key = _s(fd.get("key"), 31).lower()
            typ = fd.get("type") if fd.get("type") in FIELD_TYPES else "text"
            mp = fd.get("maps_to") if fd.get("maps_to") in MAPS else ""
            opts = [_s(o, 80) for o in (fd.get("options") or []) if _s(o, 80)][:20]
            if typ == "select" and not opts:
                raise ValueError(f"El campo «{fd.get('label')}» es una lista y necesita opciones")
            try:
                width = int(fd.get("width") or 100)
            except (TypeError, ValueError):
                width = 100
            if width not in WIDTHS:
                width = 100
            show = _cond(fd.get("show_if"), keys - {key}, _s(fd.get("label"), 60) or key)
            fields.append({"key": key, "label": _s(fd.get("label"), 120) or key, "type": typ, "required": bool(fd.get("required")),
                           "maps_to": mp, "placeholder": _s(fd.get("placeholder"), 80), "options": opts, "width": width, "show_if": show})
        maps = {fd["maps_to"] for fd in fields}
        if "name" not in maps or not ({"phone", "email"} & maps):
            raise ValueError(f"«{name}» necesita un campo para el nombre y otro para el teléfono o el correo")
        actions = []
        for a in (f.get("actions") or [])[:MAX_ACTIONS]:
            typ = a.get("type") if a.get("type") in ACTION_TYPES else "email"
            msg = _s(a.get("message"), 3000)
            if not msg and typ != "notify":
                raise ValueError(f"Una acción de «{name}» no tiene mensaje")
            to_custom = _s(a.get("to_custom"), 190)
            to = "custom" if typ == "email" and a.get("to") == "custom" else "lead"
            if to == "custom" and not re.fullmatch(r"[^@\s,;<>]{1,64}@[^@\s,;<>]{1,190}\.[A-Za-z]{2,}", to_custom):
                raise ValueError(f"El correo de aviso «{to_custom}» no es válido (en «{name}»)")
            if typ == "email" and to == "lead" and "email" not in {fd["maps_to"] for fd in fields}:
                raise ValueError(f"«{name}»: para enviar un correo al cliente el formulario necesita un campo de correo")
            if typ == "whatsapp" and "phone" not in {fd["maps_to"] for fd in fields}:
                raise ValueError(f"«{name}»: para enviar un WhatsApp el formulario necesita un campo de teléfono")
            images = [_img(x, "Imagen del correo") for x in (a.get("images") or [])[:MAX_IMAGES] if x]
            attach = []
            for at in (a.get("attachments") or [])[:MAX_ATTACH]:
                data = _s(at.get("data"), 920000)
                if not _PDF.fullmatch(data):
                    raise ValueError(f"El adjunto «{_s(at.get('name'), 60)}» debe ser un PDF")
                attach.append({"name": re.sub(r"[^\w.\- ]", "", _s(at.get("name"), 80)) or "documento.pdf", "data": data})
            bk = a.get("button_kind") if a.get("button_kind") in ("whatsapp", "link") else "whatsapp"
            bv = _s(a.get("button_value"), 300)
            if _s(a.get("button_label"), 40) and bv:
                if bk == "link" and urlparse(bv).scheme not in ("http", "https"):
                    raise ValueError("El botón del correo necesita una dirección que empiece por http:// o https://")
                if bk == "whatsapp" and not 7 <= len(re.sub(r"\D", "", bv)) <= 15:
                    raise ValueError("El número de WhatsApp del botón no es válido (incluye el indicativo del país)")
            actions.append({"id": _s(a.get("id"), 12) or secrets.token_hex(3), "enabled": bool(a.get("enabled", True)), "type": typ,
                            "when": _cond(a.get("when"), keys, "una acción de " + name), "to": to, "to_custom": to_custom if to == "custom" else "",
                            "subject": _s(a.get("subject"), 200), "message": msg, "images": images, "attachments": attach,
                            "button_label": _s(a.get("button_label"), 40), "button_kind": bk, "button_value": bv, "button_text": _s(a.get("button_text"), 300),
                            "notify_text": _s(a.get("notify_text"), 300)})
        out.append({
            "id": _s(f.get("id"), 16) or secrets.token_hex(4), "slug": slug, "name": name, "enabled": bool(f.get("enabled", True)),
            "title": _s(f.get("title"), 120), "intro": _s(f.get("intro"), 500), "button": _s(f.get("button"), 30) or "Enviar", "color": color,
            "fields": fields, "consent_text": _s(f.get("consent_text"), 1500), "consent_required": bool(f.get("consent_required", True)),
            "campaign": _s(f.get("campaign"), 120), "source": _s(f.get("source"), 40) or "Formulario Web",
            "success_message": _s(f.get("success_message"), 500) or "¡Gracias! Recibimos tus datos.", "redirect_url": red,
            "button_color": col("button_color", color), "button_text_color": col("button_text_color", "#ffffff"),
            "bg_color": col("bg_color"), "bg_image": _img(f.get("bg_image"), "Imagen de fondo"), "header_image": _img(f.get("header_image"), "Imagen del encabezado"),
            "header_color": col("header_color", color), "actions": actions,
            "on_duplicate": "block" if f.get("on_duplicate") == "block" else "update",
            "duplicate_message": _s(f.get("duplicate_message"), 300) or "Ya estás registrado con estos datos. Un asesor te contactará pronto.",
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
:root{--c:%(color)s;--bc:%(button)s;--bt:%(btext)s;--hc:%(header)s;--bg:#f4f6fa;--card:#fff;--ink:#1c2233;--mut:#667085;--line:#dfe3ec;--in:#f6f8fb}
@media (prefers-color-scheme:dark){:root{--bg:#0f1420;--card:#171d2c;--ink:#eef1f7;--mut:#9aa4b8;--line:#2a3247;--in:#1e2536}}
*{box-sizing:border-box}body{margin:0;font:16px/1.5 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--bg);color:var(--ink);display:flex;justify-content:center;padding:20px 14px}
.card{width:100%%;max-width:560px;align-self:flex-start;background:var(--card);border:1px solid var(--line);border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(20,28,60,.08)}
.band{height:10px;background:var(--hc)}.banner{display:block;width:100%%;height:170px;object-fit:cover}.body{padding:24px 24px 26px}
.row{display:flex;flex-wrap:wrap;gap:0 14px}.fld{flex:1 1 100%%;min-width:0}.fld.w25{flex-basis:calc(25%% - 11px)}.fld.w33{flex-basis:calc(33.3%% - 10px)}.fld.w50{flex-basis:calc(50%% - 7px)}.fld.w66{flex-basis:calc(66.6%% - 5px)}.fld.w75{flex-basis:calc(75%% - 4px)}
.fld.hide{display:none}@media (max-width:480px){.fld{flex-basis:100%%!important}}
h1{margin:0 0 6px;font-size:23px;letter-spacing:-.02em}p.intro{margin:0 0 18px;color:var(--mut)}
label{display:block;font-size:13.5px;font-weight:600;margin:14px 0 6px}label.chk{margin:14px 0}label .req{color:#e5484d}
input,select,textarea{width:100%%;padding:11px 13px;font:inherit;color:var(--ink);background:var(--in);border:1px solid var(--line);border-radius:11px}
textarea{min-height:90px;resize:vertical}input:focus,select:focus,textarea:focus{outline:3px solid color-mix(in srgb,var(--c) 30%%,transparent);border-color:var(--c)}
.chk{display:flex;gap:10px;align-items:flex-start;font-size:13.5px;font-weight:400;color:var(--mut);margin:14px 0}.chk input{width:auto;margin-top:4px}
button,.btn{display:inline-block;width:100%%;margin-top:18px;padding:13px 16px;border:0;border-radius:12px;background:var(--bc);color:var(--bt);font:inherit;font-weight:600;cursor:pointer;text-align:center;text-decoration:none}
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
    bg = ""
    if form.get("bg_color"):
        bg += f'body{{background:{form["bg_color"]}}}'
    if form.get("bg_image"):
        bg += f'body{{background-image:url("{form["bg_image"]}");background-size:cover;background-position:center;background-attachment:fixed}}'
    css = CSS % {"color": form["color"], "button": form.get("button_color") or form["color"], "btext": form.get("button_text_color") or "#fff", "header": form.get("header_color") or form["color"]}
    top = f'<img class="banner" src="{E(form["header_image"])}" alt="">' if form.get("header_image") else '<div class="band"></div>'
    head = f'<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>{E(form["title"] or form["name"])}</title><style>{css}{bg}</style></head><body><main class="card">{top}<div class="body">'
    if done is not None and done.get("notice"):
        return head + f'<div class="ok"><div class="tick">i</div><h1>{E(form["title"] or "Ya estás registrado")}</h1><p>{E(done["notice"])}</p></div></div></main></body></html>'
    if done is not None:
        tg = f'<a class="btn" href="{E(done["telegram"])}" target="_blank" rel="noopener">Abrir Telegram</a><p class="foot">Pulsa «Iniciar» en Telegram para que un asesor te escriba por ahí.</p>' if done.get("telegram") else ""
        return head + f'<div class="ok"><div class="tick">✓</div><h1>{E(form["title"] or "¡Listo!")}</h1><p>{E(form["success_message"])}</p></div>{tg}</div></main></body></html>'
    fields = ""
    for fd in form["fields"]:
        sh = fd.get("show_if")
        attrs = f' data-showif="{E(json.dumps(sh, ensure_ascii=False))}"' if sh else ""
        cls = f'fld w{fd.get("width") or 100}'
        if fd["type"] == "checkbox":
            inner = f'<label class="chk">{_input(fd, values.get(fd["key"], ""))}<span>{E(fd["label"])}{" *" if fd["required"] else ""}</span></label>'
        else:
            inner = f'<label>{E(fd["label"])}{"<span class=req> *</span>" if fd["required"] else ""}</label>{_input(fd, values.get(fd["key"], ""))}'
        fields += f'<div class="{cls}"{attrs}>{inner}</div>'
    fields = f'<div class="row">{fields}</div>'
    consent = ""
    if form["consent_text"]:
        consent = f'<label class="chk"><input type="checkbox" name="consent" value="1"{" required" if form["consent_required"] else ""}><span>{E(form["consent_text"])}</span></label>'
    err = f'<div class="err" role="alert">{E(error)}</div>' if error else ""
    utm = "".join(f'<input type="hidden" name="{u}" value="">' for u in ("utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"))
    js = ("<script>var q=new URLSearchParams(location.search);document.querySelectorAll('input[name^=utm_]').forEach(function(i){i.value=q.get(i.name)||''});"
          "var F=document.querySelector('form');function val(n){var e=F.elements[n];if(!e)return'';if(e.type==='checkbox')return e.checked?e.value:'';return(e.value||'').trim()}"
          "function ok(c){var v=val(c.field);return c.op==='eq'?v===c.value:c.op==='neq'?v!==c.value:c.op==='filled'?v!=='':v===''}"
          "function upd(){document.querySelectorAll('[data-showif]').forEach(function(d){var s=ok(JSON.parse(d.dataset.showif));d.classList.toggle('hide',!s);d.querySelectorAll('input,select,textarea').forEach(function(i){i.disabled=!s})})}"
          "F.addEventListener('input',upd);F.addEventListener('change',upd);upd();</script>")
    return (head + f'<h1>{E(form["title"] or form["name"])}</h1>' + (f'<p class="intro">{E(form["intro"])}</p>' if form["intro"] else "") + err +
            f'<form method="post" autocomplete="on">{fields}{consent}<div class="hp"><label>No llenar</label><input name="website" tabindex="-1" autocomplete="off"></div>'
            f'<input type="hidden" name="_t" value="{int(time.time())}">{utm}<button type="submit">{E(form["button"])}</button></form>'
            f'<p class="foot">Tus datos se envían de forma segura.</p>{js}</div></main></body></html>')


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


class Duplicate(FormError):
    """El cliente ya está registrado y el formulario está configurado para no repetirlo."""


def _holds(c: dict | None, data: dict) -> bool:
    if not c:
        return True
    v = (data.get(c["field"]) or "").strip()
    op = c.get("op", "eq")
    return v == c.get("value", "") if op == "eq" else v != c.get("value", "") if op == "neq" else v != "" if op == "filled" else v == ""


def _visible(fd: dict, data: dict) -> bool:
    return _holds(fd.get("show_if"), data)


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
        if not _visible(fd, data):   # el campo estaba oculto por su condición: no se exige ni se guarda
            data = {**data, fd["key"]: ""}
            continue
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
        elif m in ("identification", "identificationType"): lead[m] = re.sub(r"[^\w.\- ]", "", v)[:40]
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
    for k in ("identification", "identificationType"):
        if lead.get(k):
            extra[k] = lead[k]
    extra["originForm"] = form["slug"][:80]
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
    if existing and form.get("on_duplicate") == "block":
        await espo.note(existing, f"[Formulario web: {form['name']}] Intentó registrarse de nuevo; no se creó otro registro ni se enviaron mensajes automáticos.")
        raise Duplicate(form.get("duplicate_message") or "Ya estás registrado con estos datos.")
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
    if form.get("actions"):
        asyncio.create_task(run_actions(tenant, form, data, lead_id, lead))   # no hace esperar al cliente
    return {"lead_id": lead_id, "telegram": f"https://t.me/{bot}?start={invite}" if invite else None}


# ---------------------------------------------------------------- acciones al recibir el formulario
def _fill(text: str, vars_: dict) -> str:
    return re.sub(r"\{\{\s*([a-z0-9_]+)\s*\}\}", lambda m: str(vars_.get(m.group(1), "")), text)


def _wa_link(number: str, text: str) -> str:
    from urllib.parse import quote
    return f"https://wa.me/{re.sub(chr(92) + 'D', '', number)}" + (f"?text={quote(text)}" if text else "")


def _mail_html(text: str, company: str, color: str, images: list[str], button: tuple[str, str] | None) -> str:
    """Correo con la marca de la empresa: imagen principal, texto, galería y botón. Las imágenes van como enlaces (los clientes de correo bloquean las incrustadas)."""
    paras = "".join(f"<p style='margin:0 0 12px'>{E(p).replace(chr(10), '<br>')}</p>" for p in re.split(r"\n{2,}", text.strip()))
    hero = f"<img src='{E(images[0])}' alt='' width='560' style='display:block;width:100%;max-width:560px;height:auto;border:0'>" if images else ""
    gallery = ""
    if len(images) > 1:
        w = 100 // min(len(images) - 1, 3)
        gallery = "<table role='presentation' width='100%' style='margin:14px 0 4px;border-collapse:collapse'><tr>" + "".join(
            f"<td style='padding:3px;width:{w}%'><img src='{E(u)}' alt='' style='display:block;width:100%;height:auto;border-radius:8px;border:0'></td>" for u in images[1:4]) + "</tr></table>"
    btn = (f"<p style='margin:20px 0 4px'><a href='{E(button[1])}' style='display:inline-block;background:#25d366;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px'>{E(button[0])}</a></p>"
           if button else "")
    return (f"<div style='background:#eef1f7;padding:20px 8px;font-family:Arial,Helvetica,sans-serif'><div style='max-width:560px;margin:auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #dfe4f3'>"
            f"<div style='background:{color};padding:16px 24px;color:#fff;font:700 18px Arial'>{E(company)}</div>{hero}"
            f"<div style='padding:24px;font-size:15px;line-height:1.6;color:#161b2e'>{paras}{gallery}{btn}</div></div></div>")


def image_bytes(form: dict, action_id: str, n: int) -> tuple[bytes, str] | None:
    """Imagen incrustada (data:) de una acción, para servirla como enlace público en los correos."""
    import base64
    for a in form.get("actions") or []:
        if a["id"] == action_id and 0 <= n < len(a.get("images") or []):
            m = re.fullmatch(r"data:(image/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)", a["images"][n])
            if m:
                return base64.b64decode(m.group(2)), m.group(1)
    return None


async def _notify(tenant: dict, espo: Espo, form: dict, lead_id: str, lead: dict, text: str) -> None:
    """Campana del CRM y push al asesor del lead y a los administradores: «Nuevo registro»."""
    from . import push
    cur = await espo.get(f"Lead/{lead_id}")
    admins = (await espo.get("User", **{"where[0][type]": "equals", "where[0][attribute]": "type", "where[0][value]": "admin", "where[1][type]": "isTrue", "where[1][attribute]": "isActive", "select": "id", "maxSize": 50})).get("list", [])
    ids = list(dict.fromkeys([i for i in [cur.get("assignedUserId"), *[u["id"] for u in admins]] if i]))
    link = f"[{(lead.get('name') or 'Registro').replace('[', '').replace(']', '')}](#Lead/view/{lead_id})"
    try:
        await espo.post("CrmHub/notifyTeam", {"userIds": ids, "message": f"Nuevo registro: {link} · {text}"})
    except Exception as e:
        log.warning("campana: %s", str(e)[:100])
    await push.send(tenant["slug"], title="Nuevo registro", body=f"{lead.get('name') or 'Alguien'} · {text}"[:180], url=f"/#Lead/view/{lead_id}", tag=f"form-{lead_id}", kind="lead", user_ids=ids)


async def run_actions(tenant: dict, form: dict, data: dict, lead_id: str, lead: dict) -> list[dict]:
    """Ejecuta las acciones del formulario cuyo «cuándo» se cumple (siempre, o según la respuesta de una lista). Cada resultado queda en las notas del lead."""
    import base64
    from . import mailout, whatsapp
    espo, company = Espo(tenant), tenant.get("name") or "la empresa"
    vars_ = {"nombre": lead.get("name", ""), "empresa": company, "telefono": lead.get("phone", ""), "correo": lead.get("email", ""), "formulario": form["name"]}
    vars_.update({fd["key"]: (data.get(fd["key"]) or "").strip() for fd in form["fields"]})
    done = []
    for a in form.get("actions") or []:
        if not a.get("enabled", True) or not _holds(a.get("when"), data):
            continue
        label = {"email": "correo", "whatsapp": "WhatsApp", "notify": "aviso interno"}[a["type"]]
        try:
            text = _fill(a.get("message") or "", vars_)
            if a["type"] == "notify":
                await _notify(tenant, espo, form, lead_id, lead, _fill(a.get("notify_text") or "{{nombre}} · {{formulario}}", vars_))
            elif a["type"] == "whatsapp":
                await whatsapp.send(tenant, lead_id, text, "Formulario web", None, None)
            else:
                dest = a["to_custom"] if a.get("to") == "custom" else lead.get("email", "")
                if not dest:
                    raise ValueError("el cliente no dejó correo")
                cur = await espo.get(f"Lead/{lead_id}")
                from . import mailbox
                uid = cur.get("assignedUserId") or await mailbox._admin_id(espo) or ""
                subject = _fill(a.get("subject") or "", vars_).strip() or f"{company}: recibimos tu solicitud"
                imgs = [u if not u.startswith("data:") else f"https://{tenant['host']}/f/{form['slug']}/img/{a['id']}/{i}" for i, u in enumerate(a.get("images") or [])]
                btn = (a["button_label"], _wa_link(a["button_value"], _fill(a.get("button_text") or "", vars_)) if a["button_kind"] == "whatsapp" else a["button_value"]) if a.get("button_label") and a.get("button_value") else None
                files = [{"name": x["name"], "bytes": base64.b64decode(x["data"].split(",", 1)[1])} for x in a.get("attachments") or []]
                await mailout.send(tenant, {"userId": uid, "userName": company, "to": [dest], "subject": subject[:200], "html": _mail_html(text, company, form.get("header_color") or form["color"], imgs, btn),
                                            "parentType": "Lead", "parentId": lead_id, "agent": True, "attachments": files})
                await espo.note(lead_id, f"[Formulario web: {form['name']}] Se envió un correo a {dest}" + (f" con {len(files)} adjunto(s)." if files else "."))
            done.append({"id": a["id"], "ok": True})
        except Exception as e:
            log.warning("acción %s del formulario %s: %s", a.get("id"), form["slug"], str(e)[:160])
            try:
                await espo.note(lead_id, f"[Formulario web: {form['name']}] No se pudo ejecutar el {label} automático: {str(e)[:200]}")
            except Exception:
                pass
            done.append({"id": a["id"], "ok": False, "error": str(e)[:200]})
    return done
