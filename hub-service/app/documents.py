"""Lectura de documentos: un usuario sube un PDF (reporte de buró, cédula, extracto, certificado laboral…) en cualquier estado del lead y el sistema extrae los datos que
la empresa necesita. Cada empresa tiene «perfiles de lectura» (qué documento es y qué datos sacar y dónde guardarlos); nosotros entregamos perfiles listos y ella puede crear los suyos."""
import json, logging, re, secrets

from . import config, credit, db, ollama, processes, qualify
from .espo import Espo

log = logging.getLogger("hub.docs")
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS doc_runs (
    id SERIAL PRIMARY KEY, tenant TEXT NOT NULL, lead_id TEXT NOT NULL, user_id TEXT, profile_id TEXT NOT NULL, profile_name TEXT NOT NULL DEFAULT '', attachment_id TEXT,
    status TEXT NOT NULL DEFAULT 'read', error TEXT NOT NULL DEFAULT '', result JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), applied_at TIMESTAMPTZ);
CREATE INDEX IF NOT EXISTS doc_runs_lead ON doc_runs (tenant, lead_id, id DESC);
"""
TYPES = {"text": "Texto", "number": "Número (monto)", "integer": "Número entero", "date": "Fecha", "bool": "Sí / No"}
MAX_PROFILES, MAX_FIELDS = 15, 25


def ensure_schema() -> None:
    with db.pool.connection() as c:
        c.execute(SCHEMA_SQL)


def F(key, label, typ, to, hint=""):
    return {"key": key, "label": label, "type": typ, "to": to, "hint": hint}


# Perfiles que entregamos listos (la empresa puede usarlos tal cual o copiarlos y ajustarlos)
BUILTIN = [
    {"id": "credit", "name": "Reporte de crédito (buró)", "builtin": True, "recalc": True,
     "instructions": "Historia de crédito (Datacrédito/Experian, TransUnion/CIFIN u otro buró). Montos en pesos.",
     "fields": [F("score", "Puntaje de crédito", "integer", "field:creditScore", "Puntaje numérico del reporte (ej. 0-950)"), F("total_debt", "Deuda total", "number", "field:totalDebt", "Suma de saldos de todas las obligaciones"),
                F("overdue_debt", "Deuda en mora", "number", "field:overdueDebt", "Saldo total en mora"), F("creditor_count", "Cantidad de acreedores", "integer", "field:creditorCount", "Número de entidades con obligaciones"),
                F("max_days_overdue", "Máx. días de mora", "integer", "field:maxDaysOverdue", "Mayor número de días de mora entre las obligaciones"), F("default_count", "Obligaciones castigadas", "integer", "field:defaultCount", "Cantidad de obligaciones castigadas"),
                F("monthly_income", "Ingresos mensuales", "number", "field:monthlyIncome", "Solo si el reporte lo indica"), F("obligations", "Detalle de obligaciones", "text", "field:defaultHistory", "Una línea por obligación: entidad, saldo, mora, días"),
                F("summary", "Resumen financiero", "text", "field:creditSummary", "Resumen ejecutivo en español, máximo 5 frases")]},
    {"id": "cedula", "name": "Documento de identidad (cédula)", "builtin": True, "recalc": False,
     "instructions": "Cédula de ciudadanía o documento de identidad.",
     "fields": [F("numero", "Número de documento", "text", "note", "Solo dígitos"), F("nombre", "Nombres y apellidos", "text", "note"), F("fecha_nacimiento", "Fecha de nacimiento", "date", "note"),
                F("tipo", "Tipo de documento", "text", "field:identificationType", "CC, CE, pasaporte, etc.")]},
    {"id": "ingresos", "name": "Soporte de ingresos (certificado laboral / extracto)", "builtin": True, "recalc": True,
     "instructions": "Certificado laboral, desprendible de nómina o extracto bancario. Montos en pesos.",
     "fields": [F("empresa", "Empresa o entidad", "text", "note"), F("cargo", "Cargo", "text", "note"), F("ingreso_mensual", "Ingreso mensual", "number", "field:monthlyIncome", "Salario o ingreso mensual promedio"),
                F("antiguedad", "Antigüedad", "text", "note", "Tiempo en la empresa")]},
    {"id": "resumen", "name": "Resumen general de un documento", "builtin": True, "recalc": False,
     "instructions": "Cualquier documento.", "fields": [F("resumen", "Resumen", "text", "field:processResult", "Resumen claro en español, máximo 6 frases"), F("datos", "Datos clave", "text", "note", "Cifras, fechas y nombres relevantes")]},
]


def profiles(tenant: dict) -> list[dict]:
    custom = list((tenant.get("settings") or {}).get("doc_profiles") or [])
    return BUILTIN + custom


def clean(new: list) -> list[dict]:
    out = []
    for p in (new or [])[:MAX_PROFILES]:
        name = str(p.get("name", "")).strip()[:80]
        if len(name) < 2:
            raise ValueError("Cada perfil necesita un nombre.")
        fields, seen = [], set()
        for f in (p.get("fields") or [])[:MAX_FIELDS]:
            label = str(f.get("label", "")).strip()[:80]
            if not label:
                continue
            key = re.sub(r"[^a-z0-9_]+", "_", str(f.get("key") or label).lower()).strip("_")[:40] or "campo"
            while key in seen:
                key += "_2"
            seen.add(key)
            to = str(f.get("to", "note"))
            if not (to == "note" or (to.startswith("field:") and to[6:] in processes.FIELDS)):
                raise ValueError(f"Destino no válido en «{label}».")
            typ = f.get("type") if f.get("type") in TYPES else "text"
            fields.append({"key": key, "label": label, "type": typ, "to": to, "hint": str(f.get("hint", ""))[:200]})
        if not fields:
            raise ValueError(f"«{name}»: añade al menos un dato a extraer.")
        out.append({"id": str(p.get("id") or "d" + secrets.token_hex(3)), "name": name, "instructions": str(p.get("instructions", ""))[:600], "fields": fields, "recalc": bool(p.get("recalc", False))})
    return out


def schema_of(profile: dict) -> dict:
    props = {}
    for f in profile["fields"]:
        t = {"text": ["string", "null"], "number": ["number", "null"], "integer": ["integer", "null"], "date": ["string", "null"], "bool": ["boolean", "null"]}[f["type"]]
        props[f["key"]] = {"type": t, "description": (f["label"] + (": " + f["hint"] if f["hint"] else "") + (" (fecha AAAA-MM-DD)" if f["type"] == "date" else ""))}
    return {"type": "object", "properties": props, "required": list(props)}


async def extract(tenant: dict, lead_id: str, attachment_id: str, profile_id: str, user_id: str | None, llm_json) -> dict:
    prof = next((p for p in profiles(tenant) if p["id"] == profile_id), None)
    if not prof:
        raise ValueError("Perfil de lectura inexistente.")
    data = await Espo(tenant).file(attachment_id)
    if not data[:5] == b"%PDF-":
        raise ValueError("El archivo no es un PDF.")
    text = credit.extract_text(data)
    if len(text) < 80:
        raise ValueError("El PDF no tiene texto que se pueda leer (parece una imagen escaneada). Sube la versión digital del documento.")
    system = ("Eres un analista que lee documentos en español. " + (prof.get("instructions") or "") + " Extrae los datos pedidos EXACTAMENTE del texto del documento. No inventes: si un dato no aparece, usa null. "
              "Los montos van como número sin símbolos ni separadores de miles. Responde solo con JSON.")
    values = await llm_json(system, text[: config.MAX_PDF_CHARS], schema_of(prof))
    with db.pool.connection() as c:
        rid = c.execute("INSERT INTO doc_runs (tenant, lead_id, user_id, profile_id, profile_name, attachment_id, result) VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id",
                        (tenant["slug"], lead_id, user_id, prof["id"], prof["name"], attachment_id, json.dumps(values, ensure_ascii=False))).fetchone()["id"]
    return {"runId": rid, "profile": {"id": prof["id"], "name": prof["name"], "fields": prof["fields"]}, "values": values}


async def apply(tenant: dict, lead_id: str, run_id: int, values: dict, agent: str) -> dict:
    with db.pool.connection() as c:
        r = c.execute("SELECT profile_id FROM doc_runs WHERE id=%s AND tenant=%s AND lead_id=%s", (run_id, tenant["slug"], lead_id)).fetchone()
    prof = next((p for p in profiles(tenant) if r and p["id"] == r["profile_id"]), None)
    if not prof:
        raise ValueError("Lectura inexistente.")
    espo, put, notes = Espo(tenant), {}, []
    for f in prof["fields"]:
        v = values.get(f["key"])
        if v is None or v == "":
            continue
        if f["to"] == "note":
            notes.append(f'{f["label"]}: {v}')
        else:
            name = f["to"][6:]
            kind = processes.FIELDS[name]
            val = processes._cast(kind, v)
            if kind == "append":
                cur = (await espo.get(f"Lead/{lead_id}", select="description")).get("description") or ""
                put[name] = (cur + f"\n[{prof['name']}] {val}").strip()[:5000]
            else:
                put[name] = val
                if name in ("totalDebt", "overdueDebt", "monthlyIncome"):
                    put[name + "Currency"] = "COP"
    if put:
        await espo.put(f"Lead/{lead_id}", put)
    await espo.note(lead_id, f"[Documento] {prof['name']} leído por {agent}" + (" · " + " · ".join(notes) if notes else "") + (f" · {len(put)} campo(s) actualizado(s)" if put else ""))
    if prof.get("recalc"):
        try:
            await qualify.run(tenant, lead_id)
        except Exception as e:
            log.warning("recalcular calificación: %s", str(e)[:120])
    with db.pool.connection() as c:
        c.execute("UPDATE doc_runs SET status='applied', applied_at=now(), result=%s WHERE id=%s", (json.dumps(values, ensure_ascii=False), run_id))
    return {"updated": len(put), "notes": len(notes)}


def history(tenant: str, lead_id: str) -> list[dict]:
    with db.pool.connection() as c:
        rows = c.execute("SELECT id, profile_name, status, created_at, applied_at FROM doc_runs WHERE tenant=%s AND lead_id=%s ORDER BY id DESC LIMIT 20", (tenant, lead_id)).fetchall()
    return [dict(r) for r in rows]
