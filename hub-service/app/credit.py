import io

from pypdf import PdfReader

from . import config, llm, qualify
from .espo import Espo

SCHEMA = {
    "type": "object",
    "properties": {
        "score": {"type": ["integer", "null"], "description": "Puntaje de crédito (ej. 0-950)"},
        "total_debt": {"type": ["number", "null"], "description": "Deuda total en pesos"},
        "overdue_debt": {"type": ["number", "null"], "description": "Saldo total en mora"},
        "obligations": {"type": "array", "description": "Una entrada por obligación reportada", "items": {
            "type": "object",
            "properties": {
                "entity": {"type": "string", "description": "Acreedor / entidad"},
                "balance": {"type": ["number", "null"]},
                "overdue_amount": {"type": ["number", "null"]},
                "days_overdue": {"type": ["integer", "null"]},
                "written_off": {"type": "boolean", "description": "true si está castigada"},
            },
            "required": ["entity", "balance", "overdue_amount", "days_overdue", "written_off"],
        }},
        "summary": {"type": "string", "description": "Resumen financiero ejecutivo en español, máx. 5 frases"},
    },
    "required": ["score", "total_debt", "overdue_debt", "obligations", "summary"],
}

SYSTEM = (
    "Eres un analista financiero colombiano. Extrae datos EXACTAMENTE del texto de una historia de crédito "
    "(Datacrédito/TransUnion/CIFIN). No inventes cifras: si un dato no aparece, usa null. Montos como número sin "
    "símbolos ni separadores de miles. Lista cada obligación en 'obligations'. Responde solo con JSON y el resumen "
    "siempre en español."
)


def extract_text(pdf: bytes) -> str:
    reader = PdfReader(io.BytesIO(pdf))
    text = "\n".join((p.extract_text(extraction_mode="layout") or "") for p in reader.pages)
    return text.strip()


async def process(tenant: dict, lead_id: str, attachment_id: str) -> None:
    espo = Espo(tenant)
    await espo.put(f"Lead/{lead_id}", {"creditParseStatus": "Procesando"})
    try:
        text = extract_text(await espo.file(attachment_id))
        if len(text) < 80:
            raise ValueError("El PDF no contiene texto extraíble (¿escaneado?). Se requiere OCR.")
        data = await llm.chat_json(tenant, SYSTEM, text[: config.MAX_PDF_CHARS], SCHEMA)
    except Exception as e:  # el lead queda en revisión manual con el motivo
        await espo.put(f"Lead/{lead_id}", {"creditParseStatus": "Error", "qualificationStatus": "Revisión Manual",
                                           "creditSummary": f"No se pudo procesar el reporte: {e}"})
        raise
    obl = data.get("obligations") or []
    total = data.get("total_debt") or (sum((o.get("balance") or 0) for o in obl) or None)
    overdue = data.get("overdue_debt")
    if overdue is None and obl:
        overdue = sum((o.get("overdue_amount") or 0) for o in obl)
    detail = "\n".join(
        f"• {o.get('entity') or 'Acreedor'}: saldo {int(o.get('balance') or 0):,} · mora {int(o.get('overdue_amount') or 0):,}"
        f" · {o.get('days_overdue') or 0} días{' · CASTIGADA' if o.get('written_off') else ''}".replace(",", ".") for o in obl)
    update = {
        "creditScore": data.get("score"),
        "totalDebt": total, "totalDebtCurrency": "COP",
        "overdueDebt": overdue, "overdueDebtCurrency": "COP",
        "creditorCount": len(obl) or None,
        "maxDaysOverdue": max((o.get("days_overdue") or 0) for o in obl) if obl else None,
        "defaultCount": sum(1 for o in obl if o.get("written_off")) if obl else None,
        "defaultHistory": detail or "Sin obligaciones reportadas",
        "creditSummary": data.get("summary"),
        "creditParseStatus": "Completado",
    }
    await espo.put(f"Lead/{lead_id}", update)
    await qualify.run(tenant, lead_id)
