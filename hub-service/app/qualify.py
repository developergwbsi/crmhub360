"""Motor de calificación configurable: servicios (resolución de deudas, consolidación, préstamo, ...) con
condiciones editables por empresa. El LLM solo extrae datos; la decisión sale de estas reglas."""
from .espo import Espo

# métrica -> (etiqueta, atributo del Lead, unidad)
METRICS = {
    "score": ("Puntaje de crédito", "creditScore", ""),
    "total_debt": ("Deuda total", "totalDebt", "$"),
    "overdue_debt": ("Deuda en mora", "overdueDebt", "$"),
    "overdue_pct": ("Mora sobre deuda total (%)", None, "%"),
    "creditor_count": ("Cantidad de acreedores", "creditorCount", ""),
    "max_days_overdue": ("Máximo de días de mora", "maxDaysOverdue", "días"),
    "default_count": ("Obligaciones castigadas", "defaultCount", ""),
    "monthly_income": ("Ingresos mensuales", "monthlyIncome", "$"),
    "debt_to_income": ("Deuda total / ingresos mensuales (veces)", None, "x"),
}
OPS = [">=", "<=", ">", "<", "==", "!="]
MAX_SERVICES, MAX_CONDITIONS = 12, 10

# Valores de partida; cada empresa los edita en Integraciones > Servicios y filtros.
DEFAULT_SERVICES = [
    {"key": "resolucion_deudas", "name": "Resolución de deudas", "enabled": True, "conditions": [
        {"field": "overdue_debt", "op": ">=", "value": 1000000}]},
    {"key": "consolidacion_cartera", "name": "Consolidación de cartera", "enabled": True, "conditions": [
        {"field": "creditor_count", "op": ">=", "value": 3}, {"field": "total_debt", "op": ">=", "value": 5000000}]},
    {"key": "prestamo", "name": "Préstamo", "enabled": True, "conditions": [
        {"field": "score", "op": ">=", "value": 650}, {"field": "overdue_debt", "op": "==", "value": 0}]},
    {"key": "limpieza_historial", "name": "Limpieza de historial", "enabled": True, "conditions": [
        {"field": "default_count", "op": ">=", "value": 1}]},
]


def validate_services(services) -> list[dict]:
    if not isinstance(services, list) or not 1 <= len(services) <= MAX_SERVICES:
        raise ValueError(f"Define entre 1 y {MAX_SERVICES} servicios")
    out, keys = [], set()
    for i, s in enumerate(services):
        name = str(s.get("name", "")).strip()[:60]
        if not name:
            raise ValueError(f"El servicio #{i + 1} necesita un nombre")
        key = "".join(c if c.isalnum() else "_" for c in (s.get("key") or name).lower())[:40] or f"servicio_{i + 1}"
        while key in keys:
            key += "_"
        keys.add(key)
        conds = s.get("conditions") or []
        if len(conds) > MAX_CONDITIONS:
            raise ValueError(f"Máximo {MAX_CONDITIONS} condiciones por servicio")
        clean = []
        for c in conds:
            field, op, val = c.get("field"), c.get("op"), c.get("value")
            if op not in OPS:
                raise ValueError(f"Operador inválido en «{name}»")
            if field not in METRICS and not str(field).startswith("lead:"):
                raise ValueError(f"Campo inválido en «{name}»: {field}")
            if str(field).startswith("lead:") and not str(field)[5:].replace("_", "").isalnum():
                raise ValueError(f"Nombre de campo inválido en «{name}»")
            if isinstance(val, str):
                try:
                    val = float(val) if val.strip() != "" and val.replace(".", "", 1).replace("-", "", 1).isdigit() else val.strip()
                except ValueError:
                    pass
            if val is None or val == "":
                raise ValueError(f"Falta un valor en una condición de «{name}»")
            clean.append({"field": field, "op": op, "value": val})
        out.append({"key": key, "name": name, "enabled": bool(s.get("enabled", True)), "conditions": clean})
    return out


def services_for(tenant: dict) -> list[dict]:
    return (tenant.get("settings") or {}).get("services") or DEFAULT_SERVICES


def metrics_from_lead(lead: dict) -> dict:
    m = {k: (lead.get(attr) if attr else None) for k, (_, attr, _) in METRICS.items()}
    if m["total_debt"]:
        m["overdue_pct"] = round(100 * (m["overdue_debt"] or 0) / m["total_debt"], 1)
        if m["monthly_income"]:
            m["debt_to_income"] = round(m["total_debt"] / m["monthly_income"], 2)
    return m


def _cmp(actual, op, expected) -> bool:
    if isinstance(expected, (int, float)):
        a = float(actual)
        return {">=": a >= expected, "<=": a <= expected, ">": a > expected, "<": a < expected,
                "==": a == expected, "!=": a != expected}[op]
    a, e = str(actual).strip().lower(), str(expected).strip().lower()
    return a == e if op == "==" else a != e


def _fmt(v, unit="") -> str:
    if v is None:
        return "sin dato"
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    s = f"{v:,}".replace(",", ".") if isinstance(v, int) else str(v)
    return f"${s}" if unit == "$" else (f"{s}{'' if unit in ('', 'x') else ' ' + unit}" if unit != "x" else f"{s}x")


def evaluate(lead: dict, services: list[dict]) -> dict:
    metrics = metrics_from_lead(lead)
    passing, unknown, lines = [], [], []
    for svc in services:
        if not svc.get("enabled", True):
            continue
        state, svc_lines = "ok", []
        for c in svc.get("conditions", []):
            field = c["field"]
            if field.startswith("lead:"):
                label, unit, actual = field[5:], "", lead.get(field[5:])
            else:
                label, _, unit = METRICS[field]
                actual = metrics.get(field)
            if actual in (None, ""):
                ok = None
            else:
                try:
                    ok = _cmp(actual, c["op"], c["value"])
                except (TypeError, ValueError):
                    ok = None
            mark = "✔" if ok else ("✘" if ok is False else "?")
            svc_lines.append(f"  {mark} {label} {c['op']} {_fmt(c['value'], unit)} (actual: {_fmt(actual, unit)})")
            if ok is False:
                state = "fail"
            elif ok is None and state != "fail":
                state = "unknown"
        head = {"ok": "CUMPLE", "fail": "No cumple", "unknown": "Faltan datos"}[state]
        lines.append(f"{svc['name']} — {head}" + ("\n" + "\n".join(svc_lines) if svc_lines else ""))
        (passing if state == "ok" else unknown if state == "unknown" else []).append(svc["name"])
    if passing:
        status, suggested = "Califica", passing[0] + (f" (también: {', '.join(passing[1:])})" if len(passing) > 1 else "")
    elif unknown:
        status, suggested = "Revisión Manual", "Pendiente de datos: " + ", ".join(unknown)
    else:
        status, suggested = "No califica", ""
    return {"qualificationStatus": status, "suggestedService": suggested[:250], "qualificationReasons": "\n\n".join(lines)}


async def run(tenant: dict, lead_id: str) -> dict:
    espo = Espo(tenant)
    lead = await espo.get(f"Lead/{lead_id}")
    result = evaluate(lead, services_for(tenant))
    if result["qualificationStatus"] == "Califica" and lead.get("status") in ("Nuevo Lead", "En Calificación"):
        result["status"] = "Calificado"
    await espo.put(f"Lead/{lead_id}", result)
    return result
