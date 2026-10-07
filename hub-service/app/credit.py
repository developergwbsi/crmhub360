import io

from pypdf import PdfReader

from . import config, ollama
from .espo import Espo

SCHEMA = {
    "type": "object",
    "properties": {
        "score": {"type": ["integer", "null"], "description": "Puntaje de crédito (ej. 0-950)"},
        "total_debt": {"type": ["number", "null"], "description": "Deuda total en pesos"},
        "overdue_debt": {"type": ["number", "null"], "description": "Saldo total en mora"},
        "default_history": {"type": "array", "items": {"type": "string"},
                            "description": "Obligaciones con mora o castigo: entidad, monto, estado"},
        "summary": {"type": "string", "description": "Resumen financiero ejecutivo en español, máx. 5 frases"},
    },
    "required": ["score", "total_debt", "overdue_debt", "default_history", "summary"],
}

SYSTEM = (
    "Eres un analista de riesgo crediticio colombiano. Extrae datos EXACTAMENTE del texto de una historia de "
    "crédito (Datacrédito/TransUnion/CIFIN). No inventes cifras: si un dato no aparece, usa null. Montos como "
    "número sin símbolos ni separadores de miles. Responde solo con JSON y el resumen siempre en español."
)


def extract_text(pdf: bytes) -> str:
    reader = PdfReader(io.BytesIO(pdf))
    text = "\n".join((p.extract_text(extraction_mode="layout") or "") for p in reader.pages)
    return text.strip()


def thresholds(tenant: dict | None) -> dict:
    """Umbrales por empresa (tenants.settings) con respaldo en los valores globales."""
    st = (tenant or {}).get("settings") or {}
    return {
        "approve_min_score": int(st.get("approve_min_score", config.APPROVE_MIN_SCORE)),
        "reject_max_score": int(st.get("reject_max_score", config.REJECT_MAX_SCORE)),
        "reject_overdue_ratio": float(st.get("reject_overdue_ratio", config.REJECT_OVERDUE_RATIO)),
    }


def decide(score, total_debt, overdue_debt, tenant: dict | None = None) -> str:
    """Reglas deterministas de pre-aprobación; sin datos suficientes -> revisión manual."""
    t = thresholds(tenant)
    if score is None:
        return "Revisión Manual"
    ratio = (overdue_debt or 0) / total_debt if total_debt else 0
    if score < t["reject_max_score"] or ratio > t["reject_overdue_ratio"]:
        return "Rechazado"
    if score >= t["approve_min_score"] and not overdue_debt:
        return "Pre-Aprobado"
    return "Revisión Manual"


async def process(tenant: dict, lead_id: str, attachment_id: str) -> None:
    espo = Espo(tenant)
    await espo.put(f"Lead/{lead_id}", {"creditParseStatus": "Procesando"})
    try:
        text = extract_text(await espo.file(attachment_id))
        if len(text) < 80:
            raise ValueError("El PDF no contiene texto extraíble (¿escaneado?). Se requiere OCR.")
        data = await ollama.chat_json(SYSTEM, text[: config.MAX_PDF_CHARS], SCHEMA)
    except Exception as e:  # el lead queda en revisión manual con el motivo
        await espo.put(f"Lead/{lead_id}", {"creditParseStatus": "Error", "preApprovalStatus": "Revisión Manual",
                                           "creditSummary": f"No se pudo procesar el reporte: {e}"})
        raise
    verdict = decide(data.get("score"), data.get("total_debt"), data.get("overdue_debt"), tenant)
    update = {
        "creditScore": data.get("score"),
        "totalDebt": data.get("total_debt"),
        "totalDebtCurrency": "COP",
        "overdueDebt": data.get("overdue_debt"),
        "overdueDebtCurrency": "COP",
        "defaultHistory": "\n".join(data.get("default_history") or []) or "Sin mora reportada",
        "creditSummary": data.get("summary"),
        "preApprovalStatus": verdict,
        "creditParseStatus": "Completado",
    }
    if verdict == "Pre-Aprobado":
        update["status"] = "Pre-Aprobado"
    await espo.put(f"Lead/{lead_id}", update)
