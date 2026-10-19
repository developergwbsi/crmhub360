"""Formularios internos: la empresa (gerente, director o supervisor) diseña formularios para capturar información de gestión de un lead, dice en qué etapas
y desde dónde se ven (pestaña de la ficha o botón), y qué pasa al guardarlos o con un botón: generar un PDF, cambiar el estado, crear una tarea,
enviar por correo, WhatsApp o SMS, o copiar respuestas a campos del lead. Las lecturas de PDF también pueden llenarlos (destino «form:<formulario>.<campo>»).
Definiciones y respuestas viven en Postgres del Hub (tablas iform_defs, iform_entries, iform_runs); los PDF generados quedan adjuntos en la ficha del lead (EspoCRM)."""
import io
import json
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone

from . import db, formula, processes
from .espo import Espo

log = logging.getLogger("hub.iforms")
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS iform_defs (tenant TEXT NOT NULL, id TEXT NOT NULL, def JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_by TEXT NOT NULL DEFAULT '', PRIMARY KEY (tenant, id));
CREATE TABLE IF NOT EXISTS iform_entries (id SERIAL PRIMARY KEY, tenant TEXT NOT NULL, form_id TEXT NOT NULL, lead_id TEXT NOT NULL, values JSONB NOT NULL DEFAULT '{}', complete BOOLEAN NOT NULL DEFAULT false,
    source TEXT NOT NULL DEFAULT 'manual', created_by TEXT NOT NULL DEFAULT '', created_by_name TEXT NOT NULL DEFAULT '', updated_by_name TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS iform_entries_lead ON iform_entries (tenant, lead_id, form_id);
CREATE TABLE IF NOT EXISTS iform_runs (id SERIAL PRIMARY KEY, tenant TEXT NOT NULL, entry_id INTEGER NOT NULL, action_id TEXT NOT NULL, kind TEXT NOT NULL, ok BOOLEAN NOT NULL DEFAULT true,
    detail TEXT NOT NULL DEFAULT '', attachment_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS iform_runs_entry ON iform_runs (tenant, entry_id, id DESC);
CREATE TABLE IF NOT EXISTS web_sources (tenant TEXT NOT NULL, id TEXT NOT NULL, def JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (tenant, id));
"""
FIELD_TYPES = {"heading": "Título de sección", "text": "Texto corto", "textarea": "Texto largo", "number": "Número", "money": "Monto", "date": "Fecha", "select": "Lista (una opción)",
               "multiselect": "Lista (varias opciones)", "bool": "Sí / No", "phone": "Teléfono", "email": "Correo",
               "calc": "Cálculo (fórmula)", "plan": "Plan de pagos (cuotas)"}
ACTION_TYPES = {"web": "Consultar una página web", "pdf": "Generar PDF", "status": "Cambiar el estado del lead", "task": "Crear una tarea", "send": "Enviar al cliente", "setfields": "Copiar respuestas a campos del lead"}
LEAD_TARGETS = list(processes.FIELDS)
MAX_FORMS, MAX_FIELDS, MAX_ACTIONS = 30, 60, 8


def ensure_schema() -> None:
    with db.pool.connection() as c:
        c.execute(SCHEMA_SQL)


def _slug(t: str, fallback: str) -> str:
    import unicodedata
    base = "".join(ch for ch in unicodedata.normalize("NFD", str(t or "")) if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9_]+", "_", base.lower()).strip("_")[:40] or fallback


def _num(v) -> float:
    """Número escrito a la colombiana o a la inglesa: «3.500.000», «3,500,000.50», «$ 1.234,56»."""
    t = re.sub(r"[^\d.,\-]", "", str(v))
    if "," in t and "." in t:
        dec = "," if t.rfind(",") > t.rfind(".") else "."
        t = t.replace("." if dec == "," else ",", "").replace(dec, ".")
    elif t.count(".") > 1 or t.count(",") > 1:
        t = t.replace(".", "").replace(",", "")
    elif "," in t:
        a, b = t.split(",")
        t = a + "." + b if len(b) != 3 else a + b
    elif "." in t:
        a, b = t.split(".")
        t = a + b if len(b) == 3 and len(a) <= 3 and a not in ("", "-0", "0") else t
    return float(t)


def clean(forms: list) -> list[dict]:
    """Valida y normaliza las definiciones; lanza ValueError con un mensaje claro si algo no es válido."""
    out, ids = [], set()
    for f in (forms or [])[:MAX_FORMS]:
        name = str(f.get("name", "")).strip()[:80]
        if len(name) < 2:
            raise ValueError("Cada formulario necesita un nombre.")
        fid = _slug(f.get("id"), "f" + secrets.token_hex(3))
        while fid in ids:
            fid += "_2"
        ids.add(fid)
        fields, keys = [], set()
        for x in (f.get("fields") or [])[:MAX_FIELDS]:
            label = str(x.get("label", "")).strip()[:120]
            if not label:
                continue
            typ = x.get("type") if x.get("type") in FIELD_TYPES else "text"
            key = _slug(x.get("key") or label, "campo")
            while key in keys:
                key += "_2"
            keys.add(key)
            opts = [str(o).strip()[:80] for o in (x.get("options") or []) if str(o).strip()][:40] if typ in ("select", "multiselect") else []
            if typ in ("select", "multiselect") and not opts:
                raise ValueError(f"«{name}»: la lista «{label}» necesita opciones.")
            fld = {"key": key, "label": label, "type": typ, "required": bool(x.get("required")) and typ not in ("heading", "calc", "plan"), "options": opts, "help": str(x.get("help", ""))[:200],
                   "width": "half" if x.get("width") == "half" else "full"}
            if typ == "calc":
                fld.update({"formula": str(x.get("formula", "")).strip()[:400], "format": x.get("format") if x.get("format") in ("number", "money", "percent", "integer") else "number", "decimals": max(0, min(6, int(x.get("decimals") or 0)))})
            elif typ == "plan":
                pl = x.get("plan") or {}
                fld["plan"] = {k: str(pl.get(k, "")).strip()[:300] for k in ("principal", "rate", "periods")}
                fld["plan"].update({"method": pl.get("method") if pl.get("method") in ("frances", "aleman", "simple", "sininteres") else "frances", "rateType": "anual" if pl.get("rateType") == "anual" else "mensual",
                                    "freq": pl.get("freq") if pl.get("freq") in ("mensual", "quincenal", "semanal") else "mensual", "startField": str(pl.get("startField", ""))[:40], "decimals": max(0, min(2, int(pl.get("decimals") or 0)))})
            fields.append(fld)
        if not [x for x in fields if x["type"] != "heading"]:
            raise ValueError(f"«{name}»: añade al menos un campo.")
        fkeys = {x["key"] for x in fields}
        inputs = {x["key"] for x in fields if x["type"] not in ("heading", "plan")}
        for x in fields:
            try:
                if x["type"] == "calc":
                    if not x["formula"]:
                        raise formula.FormulaError("escribe la fórmula.")
                    formula.validate(x["formula"], inputs - {x["key"]})
                elif x["type"] == "plan":
                    for k, lab in (("principal", "valor a financiar"), ("rate", "tasa"), ("periods", "número de cuotas")):
                        if not x["plan"][k]:
                            raise formula.FormulaError(f"indica el {lab}.")
                        formula.validate(x["plan"][k], inputs)
            except formula.FormulaError as e:
                raise ValueError(f"«{name}» · «{x['label']}»: {e}")
        actions = []
        for a in (f.get("actions") or [])[:MAX_ACTIONS]:
            typ = a.get("type")
            if typ not in ACTION_TYPES:
                continue
            c = a.get("config") or {}
            cfg: dict = {}
            if typ == "pdf":
                col = str(c.get("color") or "")
                cfg = {"title": str(c.get("title", ""))[:120], "subtitle": str(c.get("subtitle", ""))[:160], "footer": str(c.get("footer", ""))[:300], "fields": [k for k in (c.get("fields") or []) if k in fkeys],
                       "showLead": c.get("showLead") is not False, "logo": c.get("logo") is not False, "color": col if re.fullmatch(r"#[0-9a-fA-F]{6}", col) else "#3a52e0",
                       "signature": bool(c.get("signature"))}
            elif typ == "status":
                cfg = {"status": str(c.get("status", ""))[:80]}
                if not cfg["status"]:
                    raise ValueError(f"«{name}»: elige a qué estado cambiar el lead.")
            elif typ == "task":
                cfg = {"name": str(c.get("name", ""))[:140] or "Seguimiento: " + name, "days": max(0, min(365, int(c.get("days") or 1))), "assignTo": "me" if c.get("assignTo") == "me" else "lead"}
            elif typ == "send":
                ch = c.get("channel") if c.get("channel") in ("email", "whatsapp", "sms") else "email"
                cfg = {"channel": ch, "attachPdf": bool(c.get("attachPdf")) and ch == "email", "subject": str(c.get("subject", ""))[:160], "text": str(c.get("text", ""))[:1500]}
            elif typ == "web" and c.get("sourceId"):
                cfg = {"sourceId": str(c["sourceId"])[:40], "map": {k: v for k, v in (c.get("map") or {}).items() if v in fkeys}, "analyzeTo": c.get("analyzeTo") if c.get("analyzeTo") in fkeys else ""}
            elif typ == "web":
                url = str(c.get("url", "")).strip()[:600]
                if not re.match(r"^https?://", url):
                    raise ValueError(f"«{name}»: la dirección de la página debe empezar por http:// o https://")
                rules = []
                for r in (c.get("rules") or [])[:12]:
                    mode = r.get("mode") if r.get("mode") in ("selector", "regex", "text") else "selector"
                    expr = str(r.get("expr", "")).strip()[:300]
                    if mode != "text" and not expr:
                        continue
                    if mode == "regex":
                        try:
                            re.compile(expr)
                        except re.error:
                            raise ValueError(f"«{name}»: la expresión «{expr}» no es válida.")
                    rules.append({"label": str(r.get("label", ""))[:80] or expr[:40], "mode": mode, "expr": expr, "to": r.get("to") if r.get("to") in fkeys else ""})
                cfg = {"url": url, "rules": rules, "analyze": str(c.get("analyze", ""))[:600], "analyzeTo": c.get("analyzeTo") if c.get("analyzeTo") in fkeys else "", "note": c.get("note") is not False}
                if not rules and not cfg["analyze"]:
                    raise ValueError(f"«{name}»: indica qué datos traer de la página o qué debe analizar la IA.")
            elif typ == "setfields":
                m = {k: v for k, v in (c.get("map") or {}).items() if k in fkeys and (v in LEAD_TARGETS or v == "status")}
                if not m:
                    raise ValueError(f"«{name}»: elige al menos un campo del lead para copiar.")
                cfg = {"map": m}
            actions.append({"id": _slug(a.get("id"), "a" + secrets.token_hex(2)), "label": str(a.get("label") or ACTION_TYPES[typ])[:60], "type": typ, "when": "save" if a.get("when") == "save" else "button",
                            "onlyComplete": bool(a.get("onlyComplete", True)), "config": cfg})
        out.append({"id": fid, "name": name, "description": str(f.get("description", ""))[:300], "active": f.get("active") is not False, "stages": [str(s)[:80] for s in (f.get("stages") or [])][:20],
                    "tab": bool(f.get("tab", True)), "button": bool(f.get("button", True)), "multiple": bool(f.get("multiple")), "fields": fields, "actions": actions})
    return out


def defs(tenant: str, only_active: bool = False) -> list[dict]:
    with db.pool.connection() as c:
        rows = c.execute("SELECT def FROM iform_defs WHERE tenant=%s ORDER BY (def->>'name')", (tenant,)).fetchall()
    out = [r["def"] for r in rows]
    return [d for d in out if d.get("active", True)] if only_active else out


def get_def(tenant: str, fid: str) -> dict | None:
    with db.pool.connection() as c:
        r = c.execute("SELECT def FROM iform_defs WHERE tenant=%s AND id=%s", (tenant, fid)).fetchone()
    return r["def"] if r else None


def save_defs(tenant: str, forms: list, by: str) -> list[dict]:
    new = clean(forms)
    with db.pool.connection() as c:
        keep = [d["id"] for d in new]
        c.execute("DELETE FROM iform_defs WHERE tenant=%s AND NOT (id = ANY(%s))", (tenant, keep))
        for d in new:
            c.execute("INSERT INTO iform_defs (tenant, id, def, updated_by) VALUES (%s,%s,%s::jsonb,%s) ON CONFLICT (tenant,id) DO UPDATE SET def=EXCLUDED.def, updated_at=now(), updated_by=EXCLUDED.updated_by",
                      (tenant, d["id"], json.dumps(d, ensure_ascii=False), by[:80]))
    return new


# ---------------- consultas web guardadas (se usan desde el lead o desde una acción de formulario)
STEP_TYPES = {"goto": "Abrir una página", "fill": "Escribir en un campo", "click": "Hacer clic", "press": "Pulsar una tecla", "wait": "Esperar", "extract": "Extraer un dato"}


def clean_sources(items: list, old: dict | None = None) -> list[dict]:
    """Valida las consultas web. mode «simple»: una página HTML y reglas de extracción. mode «browser»: pasos de navegación (login, clics, páginas) y credenciales guardadas aparte."""
    old = old or {}
    out, ids = [], set()
    for x in (items or [])[:30]:
        name = str(x.get("name", "")).strip()[:80]
        if len(name) < 2:
            raise ValueError("Cada consulta necesita un nombre.")
        sid = _slug(x.get("id"), "w" + secrets.token_hex(3))
        while sid in ids:
            sid += "_2"
        ids.add(sid)
        mode = "browser" if x.get("mode") == "browser" else "simple"
        analyze = str(x.get("analyze", ""))[:600]
        base = {"id": sid, "name": name, "description": str(x.get("description", ""))[:300], "mode": mode, "analyze": analyze, "note": x.get("note") is not False, "active": x.get("active") is not False}
        if mode == "simple":
            url = str(x.get("url", "")).strip()[:600]
            if not re.match(r"^https?://", url):
                raise ValueError(f"«{name}»: la dirección debe empezar por http:// o https://")
            rules = []
            for r in (x.get("rules") or [])[:12]:
                m = r.get("mode") if r.get("mode") in ("selector", "regex", "text") else "selector"
                expr = str(r.get("expr", "")).strip()[:300]
                if m != "text" and not expr:
                    continue
                if m == "regex":
                    try:
                        re.compile(expr)
                    except re.error:
                        raise ValueError(f"«{name}»: la expresión «{expr}» no es válida.")
                rules.append({"label": str(r.get("label", ""))[:80] or expr[:40], "mode": m, "expr": expr})
            if not rules and not analyze:
                raise ValueError(f"«{name}»: indica qué datos traer de la página o qué debe analizar la IA.")
            out.append({**base, "url": url, "rules": rules})
            continue
        steps = []
        for st in (x.get("steps") or [])[:60]:
            t = st.get("type")
            if t not in STEP_TYPES:
                continue
            n = {"type": t}
            if t == "goto":
                n["url"] = str(st.get("url", "")).strip()[:600]
                if not re.match(r"^https?://", n["url"]):
                    raise ValueError(f"«{name}»: la dirección de «Abrir una página» debe empezar por http:// o https://")
            elif t in ("fill", "click"):
                n.update({"selector": str(st.get("selector", "")).strip()[:400], "text": str(st.get("text", "")).strip()[:120], "label": str(st.get("label", "")).strip()[:80]})
                if not n["selector"] and not n["text"]:
                    raise ValueError(f"«{name}»: un paso «{STEP_TYPES[t]}» necesita el elemento.")
                if t == "fill":
                    n["value"] = str(st.get("value", ""))[:300]
            elif t == "press":
                n["key"] = str(st.get("key", "Enter"))[:30] or "Enter"
            elif t == "wait":
                n.update({"selector": str(st.get("selector", ""))[:400], "text": str(st.get("text", ""))[:120], "ms": max(0, min(30000, int(st.get("ms") or 1500)))})
            elif t == "extract":
                m = st.get("mode") if st.get("mode") in ("selector", "regex", "text") else "selector"
                expr = str(st.get("expr") or st.get("selector") or "").strip()[:300]
                if m != "text" and not expr:
                    continue
                if m == "regex":
                    try:
                        re.compile(expr)
                    except re.error:
                        raise ValueError(f"«{name}»: la expresión «{expr}» no es válida.")
                n.update({"mode": m, "expr": expr, "label": str(st.get("label", ""))[:80] or expr[:40]})
            steps.append(n)
        if not any(s_["type"] == "goto" for s_ in steps):
            raise ValueError(f"«{name}»: el flujo necesita al menos un paso «Abrir una página».")
        if not any(s_["type"] == "extract" for s_ in steps) and not analyze:
            raise ValueError(f"«{name}»: añade un paso «Extraer un dato» o indica qué debe analizar la IA.")
        # credenciales: los valores nuevos reemplazan; los que no se envían se conservan; nunca vuelven al navegador del usuario
        prev = dict((old.get(sid) or {}).get("secrets") or {})
        for k, v in (x.get("credentials") or {}).items():
            k = _slug(k, "")
            if k and isinstance(v, str) and v != "":
                prev[k] = v[:300]
            elif k and v is None:
                prev.pop(k, None)
        names = [_slug(k, "") for k in (x.get("credNames") or [])] or list(prev)
        keep = {k: prev[k] for k in prev if k in names}
        out.append({**base, "url": "", "rules": [], "steps": steps, "secrets": keep, "credNames": sorted(set(names) | set(keep))})
    return out


def public_source(d: dict) -> dict:
    """La consulta sin valores de credenciales (solo nombre y si están guardadas) y con las reglas de extracción derivadas de los pasos."""
    o = {k: v for k, v in d.items() if k != "secrets"}
    sec = d.get("secrets") or {}
    o["credentials"] = [{"name": n, "set": n in sec} for n in d.get("credNames", [])]
    if d.get("mode") == "browser":
        o["rules"] = [{"label": s["label"], "mode": s["mode"], "expr": s["expr"]} for s in d.get("steps", []) if s["type"] == "extract"]
    return o


def sources(tenant: str, only_active: bool = False) -> list[dict]:
    with db.pool.connection() as c:
        rows = c.execute("SELECT def FROM web_sources WHERE tenant=%s ORDER BY (def->>'name')", (tenant,)).fetchall()
    out = [public_source(r["def"]) for r in rows]
    return [d for d in out if d.get("active", True)] if only_active else out


def get_source(tenant: str, sid: str) -> dict | None:
    with db.pool.connection() as c:
        r = c.execute("SELECT def FROM web_sources WHERE tenant=%s AND id=%s", (tenant, sid)).fetchone()
    return r["def"] if r else None


def save_sources(tenant: str, items: list) -> list[dict]:
    with db.pool.connection() as c:
        old = {r["def"]["id"]: r["def"] for r in c.execute("SELECT def FROM web_sources WHERE tenant=%s", (tenant,)).fetchall()}
    new = clean_sources(items, old)
    with db.pool.connection() as c:
        c.execute("DELETE FROM web_sources WHERE tenant=%s AND NOT (id = ANY(%s))", (tenant, [d["id"] for d in new]))
        for d in new:
            c.execute("INSERT INTO web_sources (tenant, id, def) VALUES (%s,%s,%s::jsonb) ON CONFLICT (tenant,id) DO UPDATE SET def=EXCLUDED.def, updated_at=now()", (tenant, d["id"], json.dumps(d, ensure_ascii=False)))
    return [public_source(d) for d in new]


async def _analyze(tenant: dict, page_text: str, final: str, analyze: str, ctx_text: str, lead_name: str) -> str:
    from . import llm
    if len(page_text) < 40:
        raise ValueError("La página no trae texto que se pueda leer (puede cargar su contenido con JavaScript).")
    return (await llm.chat_text(tenant, "Eres un analista de una empresa de servicios financieros. Lees información de una página web y ayudas a tomar una decisión sobre un cliente. Responde en español, claro y breve (máximo 8 líneas), "
                                "separando lo que la página dice de tu recomendación. No inventes datos que no estén en la página.",
                                f"Cliente: {lead_name}. {ctx_text}\n\nPregunta o criterio: {analyze}\n\nContenido de la página ({final}):\n{page_text[:9000]}")).strip()


async def web_fetch(tenant: dict, url_tpl: str, rules: list, analyze: str, vv: dict, ctx_text: str = "", lead_name: str = "") -> dict:
    """Consulta una página sencilla (HTML): sustituye las variables de la dirección, extrae los datos y, si hay criterio, pide a la IA un análisis. Devuelve {final, found, analysis}."""
    from urllib.parse import quote
    from . import webscrape
    url = re.sub(r"\{\{\s*(\w+)\s*\}\}", lambda m: quote(str(vv.get(m.group(1), "")), safe=""), url_tpl)
    final, html = await webscrape.fetch(url)
    found = webscrape.extract(html, rules)
    analysis = await _analyze(tenant, webscrape.text_of(html, 9000), final, analyze, ctx_text, lead_name) if analyze else ""
    return {"final": final, "found": found, "analysis": analysis}


def rules_of(src: dict) -> list[dict]:
    """Datos que trae una consulta (para dirigirlos a campos): las reglas de la página sencilla o los pasos «Extraer» del flujo con navegador."""
    if src.get("mode") == "browser":
        return [{"label": s["label"], "mode": s["mode"], "expr": s["expr"]} for s in src.get("steps", []) if s["type"] == "extract"]
    return src.get("rules", [])


async def fetch_source(tenant: dict, src: dict, vv: dict, ctx_text: str = "", lead_name: str = "") -> dict:
    """Ejecuta una consulta guardada, sea de página sencilla o de navegador (login, clics y páginas), y devuelve {final, found, analysis}."""
    if src.get("mode") != "browser":
        return await web_fetch(tenant, src["url"], src["rules"], src["analyze"], vv, ctx_text, lead_name)
    from urllib.parse import quote
    from . import browser
    sec = src.get("secrets") or {}

    def sub(t: str, enc: bool) -> str:
        def rep(m):
            k = m.group(1)
            v = sec[k] if k in sec else vv.get(k, "")
            return quote(str(v), safe="") if enc else str(v)
        return re.sub(r"\{\{\s*(\w+)\s*\}\}", rep, t)
    steps = []
    for st in src["steps"]:
        n = dict(st)
        for k in ("url", "selector", "text", "value", "expr"):
            if isinstance(n.get(k), str):
                n[k] = sub(n[k], k == "url")
        steps.append(n)
    r = await browser.run(steps, 75)
    analysis = await _analyze(tenant, r.get("text", ""), r.get("url", ""), src["analyze"], ctx_text, lead_name) if src.get("analyze") else ""
    return {"final": r.get("url", ""), "found": r.get("found", {}), "analysis": analysis}


async def run_source(tenant: dict, sid: str, lead_id: str, user_name: str) -> dict:
    """Ejecuta una consulta web guardada sobre un lead: deja el resultado en una nota y lo devuelve para mostrarlo."""
    src = get_source(tenant["slug"], sid)
    if not src or not src.get("active", True):
        raise ValueError("Esa consulta ya no existe.")
    e = Espo(tenant)
    lead = await e.get(f"Lead/{lead_id}", select="name,identification,phoneNumber,emailAddress")
    vv = {"nombre": lead.get("name") or "", "identificacion": lead.get("identification") or "", "telefono": lead.get("phoneNumber") or "", "correo": lead.get("emailAddress") or ""}
    r = await fetch_source(tenant, src, vv, "", lead.get("name") or "")
    if src.get("note", True):
        lines = [f"[Consulta web] {src['name']} · {r['final']} (por {user_name or 'un usuario'})"] + [f"{k}: {v}" for k, v in r["found"].items()] + ([f"Análisis: {r['analysis']}"] if r["analysis"] else [])
        await e.note(lead_id, "\n".join(lines)[:4000])
    return {"name": src["name"], "url": r["final"], "found": r["found"], "analysis": r["analysis"]}


# ---------------- respuestas
def _check(d: dict, values: dict) -> tuple[dict, bool, list[str]]:
    """Normaliza las respuestas según los campos del formulario. Devuelve (valores, completo, faltantes)."""
    out, missing = {}, []
    for f in d["fields"]:
        if f["type"] in ("heading", "calc", "plan"):
            continue
        v = values.get(f["key"])
        if f["type"] == "bool":
            v = bool(v) if v not in (None, "") else None
        elif f["type"] in ("number", "money"):
            try:
                v = _num(v) if str(v or "").strip() != "" else None
            except ValueError:
                raise ValueError(f"«{f['label']}» debe ser un número.")
        elif f["type"] == "multiselect":
            v = [o for o in (v or []) if o in f["options"]] if isinstance(v, list) else []
        elif f["type"] == "select":
            v = v if v in f["options"] else None
        else:
            v = str(v).strip()[:4000] if v not in (None, "") else None
        empty = v is None or v == [] or (f["type"] == "bool" and v is None)
        if f["required"] and empty:
            missing.append(f["label"])
        if not empty:
            out[f["key"]] = v
    compute(d, out)
    return out, not missing, missing


def _env(d: dict, vals: dict) -> dict:
    env = {}
    for f in d["fields"]:
        v = vals.get(f["key"])
        if f["type"] in ("number", "money", "calc") and isinstance(v, (int, float)):
            env[f["key"]] = float(v)
        elif f["type"] == "bool" and v is not None:
            env[f["key"]] = 1.0 if v else 0.0
        elif f["type"] in ("number", "money", "calc"):
            env[f["key"]] = 0.0
    return env


def compute(d: dict, vals: dict) -> None:
    """Calcula en `vals` los campos de fórmula (en el orden en que dependen unos de otros) y el resumen de cada plan de pagos. Un error de cálculo deja el campo vacío."""
    calcs = [f for f in d["fields"] if f["type"] == "calc"]
    for _ in range(len(calcs) + 1):
        changed = False
        for f in calcs:
            try:
                v = formula.evaluate(f["formula"], _env(d, vals))
                v = round(v, f.get("decimals", 0)) if f.get("decimals") else float(round(v)) if f.get("format") in ("integer", "money") and not f.get("decimals") else v
            except formula.FormulaError:
                v = None
            if v is None:
                if f["key"] in vals:
                    vals.pop(f["key"])
                    changed = True
            elif vals.get(f["key"]) != v:
                vals[f["key"]] = v
                changed = True
        if not changed:
            break
    for f in d["fields"]:
        if f["type"] == "plan":
            sch = plan_schedule(d, f, vals)
            if sch:
                vals[f["key"]] = {"firstPay": sch["firstPay"], "total": sch["total"], "interest": sch["interest"], "n": sch["n"]}
            else:
                vals.pop(f["key"], None)


def plan_schedule(d: dict, f: dict, vals: dict) -> dict | None:
    """Tabla de amortización de un campo «plan de pagos» con los valores del formulario; None si faltan datos o hay error."""
    from datetime import date as _d
    pl, env = f["plan"], _env(d, vals)
    try:
        principal = formula.evaluate(pl["principal"], env)
        rate = formula.evaluate(pl["rate"], env)
        n = int(round(formula.evaluate(pl["periods"], env)))
        start = None
        sv = vals.get(pl.get("startField") or "")
        if isinstance(sv, str) and re.match(r"^\d{4}-\d{2}-\d{2}", sv):
            start = _d.fromisoformat(sv[:10])
        if principal <= 0 or n <= 0:
            return None
        return formula.schedule(principal, rate, n, pl["method"], pl["rateType"], pl["freq"], start, pl.get("decimals", 0), first_is_start=start is not None)
    except (formula.FormulaError, ValueError):
        return None


def entries(tenant: str, lead_id: str) -> list[dict]:
    with db.pool.connection() as c:
        rows = c.execute("SELECT * FROM iform_entries WHERE tenant=%s AND lead_id=%s ORDER BY updated_at DESC", (tenant, lead_id)).fetchall()
        runs = c.execute("SELECT r.* FROM iform_runs r JOIN iform_entries e ON e.id=r.entry_id WHERE r.tenant=%s AND e.lead_id=%s AND r.attachment_id IS NOT NULL ORDER BY r.id DESC", (tenant, lead_id)).fetchall()
    files: dict = {}
    for r in runs:
        files.setdefault(r["entry_id"], []).append({"attachmentId": r["attachment_id"], "detail": r["detail"], "at": r["created_at"].isoformat()})
    return [{"id": r["id"], "formId": r["form_id"], "leadId": r["lead_id"], "values": r["values"], "complete": r["complete"], "source": r["source"], "by": r["updated_by_name"] or r["created_by_name"],
             "createdAt": r["created_at"].isoformat(), "updatedAt": r["updated_at"].isoformat(), "files": files.get(r["id"], [])} for r in rows]


def get_entry(tenant: str, eid: int) -> dict | None:
    with db.pool.connection() as c:
        return c.execute("SELECT * FROM iform_entries WHERE tenant=%s AND id=%s", (tenant, eid)).fetchone()


async def save_entry(tenant: dict, lead_id: str, form_id: str, values: dict, entry_id: int | None, user_id: str, user_name: str, source: str = "manual", partial: bool = False, run_actions: bool = True) -> dict:
    """Guarda (o actualiza) las respuestas y ejecuta las acciones «al guardar» si quedó completo."""
    slug = tenant["slug"]
    d = get_def(slug, form_id)
    if not d or not d.get("active", True):
        raise ValueError("Ese formulario ya no existe.")
    vals, complete, missing = _check(d, values or {})
    if missing and not partial:
        raise ValueError("Falta: " + ", ".join(missing[:6]) + ("…" if len(missing) > 6 else ""))
    with db.pool.connection() as c:
        row = None
        if entry_id:
            row = c.execute("SELECT id FROM iform_entries WHERE tenant=%s AND id=%s AND lead_id=%s AND form_id=%s", (slug, entry_id, lead_id, form_id)).fetchone()
        elif not d.get("multiple"):
            row = c.execute("SELECT id FROM iform_entries WHERE tenant=%s AND lead_id=%s AND form_id=%s ORDER BY id LIMIT 1", (slug, lead_id, form_id)).fetchone()
        if row:
            c.execute("UPDATE iform_entries SET values=%s::jsonb, complete=%s, updated_at=now(), updated_by_name=%s, source=%s WHERE id=%s", (json.dumps(vals, ensure_ascii=False), complete, user_name[:80], source, row["id"]))
            eid = row["id"]
        else:
            eid = c.execute("INSERT INTO iform_entries (tenant, form_id, lead_id, values, complete, source, created_by, created_by_name, updated_by_name) VALUES (%s,%s,%s,%s::jsonb,%s,%s,%s,%s,%s) RETURNING id",
                            (slug, form_id, lead_id, json.dumps(vals, ensure_ascii=False), complete, source, user_id[:40], user_name[:80], user_name[:80])).fetchone()["id"]
    try:
        await Espo(tenant).note(lead_id, f"[Formulario] {d['name']} {'completado' if complete else 'guardado (incompleto)'} por {user_name or 'un usuario'}")
    except Exception as ex:
        log.warning("nota del formulario: %s", str(ex)[:100])
    results = []
    if complete and run_actions:
        for a in d["actions"]:
            if a["when"] == "save":
                results.append(await run_action(tenant, eid, a["id"], user_id, user_name))
    return {"id": eid, "complete": complete, "missing": missing, "results": results}


async def merge_entry(tenant: dict, lead_id: str, form_id: str, values: dict, user_id: str, user_name: str, source: str, run_actions: bool = True) -> int | None:
    """Mezcla datos (p. ej. leídos de un PDF) sobre la respuesta existente del lead; si no hay, crea una incompleta para revisar."""
    d = get_def(tenant["slug"], form_id)
    if not d:
        return None
    with db.pool.connection() as c:
        row = c.execute("SELECT id, values FROM iform_entries WHERE tenant=%s AND lead_id=%s AND form_id=%s ORDER BY id LIMIT 1", (tenant["slug"], lead_id, form_id)).fetchone()
    cur = dict(row["values"]) if row else {}
    cur.update({k: v for k, v in values.items() if v not in (None, "")})
    r = await save_entry(tenant, lead_id, form_id, cur, row["id"] if row else None, user_id, user_name, source, partial=True, run_actions=run_actions)
    return r["id"]


# ---------------- acciones
def _money(x: float, dec: int = 0) -> str:
    t = f"{abs(x):,.{dec}f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return ("-" if x < 0 else "") + "$ " + t


def _fmt(f: dict, v) -> str:
    if v is None or v == "" or v == []:
        return "—"
    if f["type"] == "plan" and isinstance(v, dict):
        return f"{v['n']} cuotas de {_money(v['firstPay'], f['plan'].get('decimals', 0))} · total {_money(v['total'], f['plan'].get('decimals', 0))} · intereses {_money(v['interest'], f['plan'].get('decimals', 0))}"
    if f["type"] == "calc":
        fm, dec = f.get("format", "number"), f.get("decimals", 0)
        if fm == "money":
            return _money(float(v), dec)
        if fm == "percent":
            return f"{float(v) * 100:,.{dec}f}".replace(",", "X").replace(".", ",").replace("X", ".") + " %"
        if fm == "integer":
            return f"{int(round(float(v))):,}".replace(",", ".")
        return f"{float(v):,.{dec}f}".replace(",", "X").replace(".", ",").replace("X", ".")
    if f["type"] == "bool":
        return "Sí" if v else "No"
    if f["type"] == "multiselect":
        return ", ".join(v)
    if f["type"] == "money":
        return "$ " + f"{float(v):,.0f}".replace(",", ".")
    if f["type"] == "number":
        return f"{float(v):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".").rstrip("0").rstrip(",")
    return str(v)


_LOGO: dict = {}


async def _logo(tenant: dict) -> bytes | None:
    """Logo de la empresa (Configuración del CRM) en PNG o JPEG, para el encabezado del PDF; None si no hay o no se puede leer. Se recuerda 10 minutos."""
    import time
    hit = _LOGO.get(tenant["slug"])
    if hit and time.time() - hit[0] < 600:
        return hit[1]
    data = None
    try:
        e = Espo(tenant)
        lid = (await e.get("Settings", select="companyLogoId")).get("companyLogoId")
        if lid:
            raw = await e.file(lid)
            if raw[:8] == b"\x89PNG\r\n\x1a\n" or raw[:3] == b"\xff\xd8\xff":
                data = raw
    except Exception as ex:
        log.warning("logo para el PDF: %s", str(ex)[:100])
    _LOGO[tenant["slug"]] = (time.time(), data)
    return data


def render_pdf(tenant: dict, d: dict, entry: dict, lead: dict, cfg: dict, logo: bytes | None = None) -> bytes:
    """PDF de las respuestas: encabezado con la empresa, datos del lead, tabla campo → respuesta y pie con fecha."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    from xml.sax.saxutils import escape as esc
    ss = getSampleStyleSheet()
    accent = colors.HexColor(cfg.get("color") or "#3a52e0")
    h1 = ParagraphStyle("h1", parent=ss["Title"], fontSize=18, textColor=colors.HexColor("#1c2233"), alignment=0, spaceAfter=2)
    sub = ParagraphStyle("sub", parent=ss["Normal"], fontSize=9.5, textColor=colors.HexColor("#5d6678"))
    sec = ParagraphStyle("sec", parent=ss["Heading3"], fontSize=11.5, textColor=accent, spaceBefore=10, spaceAfter=3)
    cell = ParagraphStyle("c", parent=ss["Normal"], fontSize=10, leading=13)
    lab = ParagraphStyle("l", parent=cell, textColor=colors.HexColor("#5d6678"))
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=1.8 * cm, bottomMargin=1.8 * cm, title=cfg.get("title") or d["name"])
    story = []
    if logo and cfg.get("logo", True):
        from reportlab.platypus import Image
        from reportlab.lib.utils import ImageReader
        w, h = ImageReader(io.BytesIO(logo)).getSize()
        k = min(5.5 * cm / w, 1.6 * cm / h)
        story += [Image(io.BytesIO(logo), width=w * k, height=h * k, hAlign="LEFT"), Spacer(1, 6)]
    story += [Paragraph(esc(tenant.get("name") or ""), sub), Paragraph(esc(cfg.get("title") or d["name"]), h1)]
    if cfg.get("subtitle"):
        story.append(Paragraph(esc(cfg["subtitle"]), sub))
    when = datetime.now(timezone(timedelta(hours=-5))).strftime("%d/%m/%Y %H:%M")
    story.append(Paragraph(f"Generado el {when}", sub))
    story.append(Spacer(1, 8))
    if cfg.get("showLead", True):
        rows = [[Paragraph("Cliente", lab), Paragraph(esc(lead.get("name") or ""), cell)], [Paragraph("Teléfono", lab), Paragraph(esc(lead.get("phoneNumber") or "—"), cell)],
                [Paragraph("Correo", lab), Paragraph(esc(lead.get("emailAddress") or "—"), cell)], [Paragraph("Estado", lab), Paragraph(esc(lead.get("status") or "—"), cell)]]
        t = Table(rows, colWidths=[3.2 * cm, 13.8 * cm])
        t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f6f8fd")), ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#dfe3ee")), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
        story += [t, Spacer(1, 6)]
    want = set(cfg.get("fields") or [])
    block: list = []

    def flush():
        if block:
            t = Table(block, colWidths=[5.6 * cm, 11.4 * cm], repeatRows=0)
            t.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.4, colors.HexColor("#e6e9f2")), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
            story.append(t)
            block.clear()
    for f in d["fields"]:
        if f["type"] == "heading":
            flush()
            story.append(Paragraph(esc(f["label"]), sec))
            continue
        if want and f["key"] not in want:
            continue
        block.append([Paragraph(esc(f["label"]), lab), Paragraph(esc(_fmt(f, entry["values"].get(f["key"]))).replace("\n", "<br/>"), cell)])
        if f["type"] == "plan":
            sch = plan_schedule(d, f, entry["values"])
            if sch:
                flush()
                dec = f["plan"].get("decimals", 0)
                data = [[Paragraph(f"<b>{h}</b>", cell) for h in ("N.º", "Fecha", "Cuota", "Interés", "Capital", "Saldo")]]
                for r in sch["rows"][:240]:
                    dd = r["date"].split("-")
                    data.append([str(r["n"]), f"{dd[2]}/{dd[1]}/{dd[0]}", _money(r["pay"], dec), _money(r["interest"], dec), _money(r["capital"], dec), _money(r["balance"], dec)])
                data.append([Paragraph("<b>Total</b>", cell), "", Paragraph(f"<b>{_money(sch['total'], dec)}</b>", cell), Paragraph(f"<b>{_money(sch['interest'], dec)}</b>", cell), "", ""])
                pt = Table(data, colWidths=[1.3 * cm, 2.4 * cm, 3.1 * cm, 3.1 * cm, 3.1 * cm, 3.1 * cm], repeatRows=1)
                pt.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef1fb")), ("FONTSIZE", (0, 0), (-1, -1), 8.5), ("ALIGN", (2, 0), (-1, -1), "RIGHT"), ("LINEBELOW", (0, 0), (-1, -1), 0.3, colors.HexColor("#e6e9f2")),
                                        ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2), ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#f6f8fd"))]))
                story.extend([Spacer(1, 6), pt, Spacer(1, 8)])
    flush()
    if cfg.get("signature"):
        sig = Table([["", ""], [Paragraph("Firma del cliente", sub), Paragraph("Firma del asesor", sub)]], colWidths=[8.5 * cm, 8.5 * cm], rowHeights=[1.8 * cm, 0.6 * cm])
        sig.setStyle(TableStyle([("LINEABOVE", (0, 1), (0, 1), 0.6, colors.HexColor("#5d6678")), ("LINEABOVE", (1, 1), (1, 1), 0.6, colors.HexColor("#5d6678")), ("LEFTPADDING", (0, 0), (-1, -1), 4)]))
        story += [Spacer(1, 20), sig]
    if cfg.get("footer"):
        story += [Spacer(1, 14), Paragraph(esc(cfg["footer"]), sub)]
    doc.build(story)
    return buf.getvalue()


def _tpl(text: str, d: dict, entry: dict, lead: dict) -> str:
    """Variables: {{nombre}} (del lead), {{formulario}} y {{<clave del campo>}}."""
    by = {f["key"]: f for f in d["fields"]}
    def rep(m):
        k = m.group(1).strip()
        if k == "nombre":
            return (lead.get("name") or "").split(" ")[0]
        if k == "formulario":
            return d["name"]
        return _fmt(by[k], entry["values"].get(k)) if k in by else m.group(0)
    return re.sub(r"\{\{\s*([\w]+)\s*\}\}", rep, text or "")


async def run_action(tenant: dict, entry_id: int, action_id: str, user_id: str, user_name: str, lead_id: str = "") -> dict:
    """Ejecuta una acción del formulario sobre una respuesta. Devuelve {id, label, ok, detail, attachmentId?}."""
    slug = tenant["slug"]
    row = get_entry(slug, entry_id)
    if not row or (lead_id and row["lead_id"] != lead_id):
        raise ValueError("Respuesta inexistente.")
    d = get_def(slug, row["form_id"])
    a = next((x for x in (d or {}).get("actions", []) if x["id"] == action_id), None)
    if not a:
        raise ValueError("Acción inexistente.")
    entry = {"values": row["values"]}
    res = {"id": a["id"], "label": a["label"], "ok": True, "detail": ""}
    att = None
    try:
        if a["onlyComplete"] and not row["complete"]:
            raise ValueError("Completa los campos obligatorios del formulario primero.")
        e = Espo(tenant)
        lead = await e.get(f"Lead/{row['lead_id']}", select="name,status,phoneNumber,emailAddress,assignedUserId")
        c, t = a["config"], a["type"]
        if t == "pdf":
            pdf = render_pdf(tenant, d, entry, lead, c, await _logo(tenant))
            fname = re.sub(r"[^\w\-]+", "_", f"{d['name']}_{lead.get('name') or ''}")[:80] + ".pdf"
            att = await e.upload(fname, "application/pdf", pdf)
            await e.note(row["lead_id"], f"[Formulario] PDF «{d['name']}» generado por {user_name or 'un usuario'}", [att])
            res["detail"] = "PDF generado y adjunto en la ficha"
            res["attachmentId"] = att
        elif t == "web":
            lead_full = await e.get(f"Lead/{row['lead_id']}", select="name,identification,phoneNumber,emailAddress,status")
            vv = {"nombre": lead_full.get("name") or "", "identificacion": lead_full.get("identification") or "", "telefono": lead_full.get("phoneNumber") or "", "correo": lead_full.get("emailAddress") or ""}
            for f in d["fields"]:
                if f["type"] != "heading":
                    vv[f["key"]] = _fmt(f, row["values"].get(f["key"])) if row["values"].get(f["key"]) not in (None, "", []) else ""
            ctx = "Datos del formulario «" + d["name"] + "»: " + ("; ".join(f"{f['label']}: {_fmt(f, row['values'].get(f['key']))}" for f in d["fields"] if f["type"] != "heading" and row["values"].get(f["key"]) not in (None, "", [])) or "sin datos")
            if c.get("sourceId"):
                src = get_source(slug, c["sourceId"])
                if not src:
                    raise ValueError("La consulta web elegida ya no existe.")
                rules = [{"label": r["label"], "mode": r["mode"], "expr": r["expr"], "to": c["map"].get(r["label"], "")} for r in rules_of(src)]
                analyze, analyze_to, note = src["analyze"], c.get("analyzeTo", ""), src.get("note", True)
            else:
                rules, url_tpl, analyze, analyze_to, note = c["rules"], c["url"], c["analyze"], c["analyzeTo"], c["note"]
            if c.get("sourceId"):
                r = await fetch_source(tenant, src, vv, ctx, lead_full.get("name") or "")
            else:
                r = await web_fetch(tenant, url_tpl, rules, analyze, vv, ctx, lead_full.get("name") or "")
            found, analysis, final = r["found"], r["analysis"], r["final"]
            newv = {x["to"]: found[x["label"] or x["expr"]] for x in rules if x.get("to") and (x["label"] or x["expr"]) in found}
            if analysis and analyze_to:
                newv[analyze_to] = analysis
            if newv:
                await merge_entry(tenant, row["lead_id"], row["form_id"], newv, user_id, user_name, "web", run_actions=False)
            if note:
                lines = [f"[Consulta web] {d['name']} · {final}"] + [f"{k}: {v}" for k, v in found.items()] + ([f"Análisis: {analysis}"] if analysis else [])
                await e.note(row["lead_id"], "\n".join(lines)[:4000])
            res["detail"] = (f"{len(found)} dato(s) traídos de la página" if found else "Página consultada sin datos que coincidan") + (" y análisis de IA" if analysis else "")
            if analysis:
                res["analysis"] = analysis
        elif t == "status":
            await e.put(f"Lead/{row['lead_id']}", {"status": c["status"]})
            res["detail"] = f"Estado cambiado a «{c['status']}»"
        elif t == "task":
            due = (datetime.now(timezone.utc) + timedelta(days=int(c["days"]))).strftime("%Y-%m-%d %H:%M:%S")
            uid = user_id if c["assignTo"] == "me" and user_id else (lead.get("assignedUserId") or user_id)
            await e.post("Task", {"name": c["name"], "dateEnd": due, "parentType": "Lead", "parentId": row["lead_id"], "assignedUserId": uid, "status": "Not Started"})
            res["detail"] = "Tarea creada"
        elif t == "setfields":
            put = {}
            for k, target in c["map"].items():
                v = row["values"].get(k)
                if v in (None, "", []):
                    continue
                if target == "status":
                    put["status"] = str(v)
                else:
                    kind = processes.FIELDS[target]
                    put[target] = processes._cast(kind, ", ".join(v) if isinstance(v, list) else v)
                    if target in ("totalDebt", "overdueDebt", "monthlyIncome"):
                        put[target + "Currency"] = "COP"
            if put:
                await e.put(f"Lead/{row['lead_id']}", put)
            res["detail"] = f"{len(put)} campo(s) del lead actualizados"
        elif t == "send":
            text = _tpl(c["text"] or "Hola {{nombre}}, te compartimos la información de «{{formulario}}».", d, entry, lead)
            if c["channel"] == "email":
                if not lead.get("emailAddress"):
                    raise ValueError("El lead no tiene correo.")
                from . import mailout
                files = []
                if c["attachPdf"]:
                    pc = next((x["config"] for x in d["actions"] if x["type"] == "pdf"), {})
                    files.append({"name": re.sub(r"[^\w\-]+", "_", d["name"])[:60] + ".pdf", "bytes": render_pdf(tenant, d, entry, lead, pc, await _logo(tenant))})
                body = "<div style=\"font-family:Arial,sans-serif;max-width:560px;color:#1c2233;line-height:1.55\">" + "".join(f"<p>{__import__('html').escape(p)}</p>" for p in text.split("\n") if p.strip()) + "</div>"
                await mailout.send(tenant, {"userId": user_id or "system", "userName": user_name, "to": lead["emailAddress"], "subject": _tpl(c["subject"], d, entry, lead) or d["name"], "html": body,
                                            "attachments": files, "parentType": "Lead", "parentId": row["lead_id"]})
            elif c["channel"] == "whatsapp":
                from . import whatsapp
                await whatsapp.send(tenant, row["lead_id"], text, user_name or "Formulario", user_id or None)
            else:
                from . import sms
                await sms.send(tenant, row["lead_id"], text, user_name or "Formulario", user_id or None)
            res["detail"] = {"email": "Correo enviado", "whatsapp": "WhatsApp enviado", "sms": "SMS enviado"}[c["channel"]]
    except Exception as ex:
        res["ok"], res["detail"] = False, (str(ex) if isinstance(ex, (ValueError, LookupError)) else "No se pudo ejecutar: " + str(ex)[:140])
        log.warning("acción %s: %s", action_id, str(ex)[:160])
    with db.pool.connection() as cn:
        cn.execute("INSERT INTO iform_runs (tenant, entry_id, action_id, kind, ok, detail, attachment_id) VALUES (%s,%s,%s,%s,%s,%s,%s)", (slug, entry_id, a["id"], a["type"], res["ok"], res["detail"][:300], att))
    return res
