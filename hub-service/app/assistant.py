from . import ollama
from .espo import Espo

PROMPTS = {
    "summarize": "Resume en español, en máximo 6 viñetas, la conversación comercial: necesidad del cliente, "
                 "objeciones, compromisos y próximo paso recomendado.",
    "draft": "Redacta en español colombiano, tono cordial y profesional, un mensaje corto de WhatsApp "
             "(máx. 80 palabras) para continuar la conversación con este cliente. Solo el mensaje.",
    "sentiment": "Analiza el sentimiento y la intención de compra del cliente. Responde en español con: "
                 "Sentimiento (positivo/neutro/negativo), Nivel de interés (alto/medio/bajo) y una frase de justificación.",
}


async def run(tenant: dict, lead_id: str, action: str) -> str:
    espo = Espo(tenant)
    lead = await espo.get(f"Lead/{lead_id}")
    stream = await espo.get(f"Lead/{lead_id}/stream", maxSize=60)
    lines = [(n.get("post") or "").strip() for n in reversed(stream.get("list", [])) if n.get("post")]
    if not lines:
        return "No hay conversación registrada para este lead."
    name = f"{lead.get('firstName') or ''} {lead.get('lastName') or ''}".strip()
    context = f"Cliente: {name}\nEstado: {lead.get('status')}\n\nConversación:\n" + "\n".join(lines)
    return await ollama.chat_text(PROMPTS[action] + " No inventes datos que no estén en la conversación.", context[:12000])
