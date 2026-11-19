"""Leads por atender: cuando un cliente reacciona (responde, hace clic, abre el correo varias veces…) el lead se marca en el CRM
(campos attentionReason y attentionAt) para que la persona lo vea con borde rojo y lo atienda. Se limpia cuando una persona le escribe
o pulsa «Marcar atendido». Sin endpoints."""
import asyncio
import logging
from datetime import datetime, timezone

from . import db
from .espo import Espo

log = logging.getLogger("hub.attention")
SKIP_STATUS = ("Convertido",)   # ya es contacto o cliente: no aplica


async def raise_(tenant: dict, lead_id: str, reason: str) -> None:
    """Marca el lead como «por atender» con el motivo (p. ej. «Respondió por WhatsApp»). Un motivo nuevo reemplaza al anterior."""
    try:
        espo = Espo(tenant)
        lead = await espo.get(f"Lead/{lead_id}", select="status,doNotContact,isSimulation,isThread")
        if lead.get("status") in SKIP_STATUS or lead.get("isSimulation") or lead.get("isThread"):
            return
        await espo.put(f"Lead/{lead_id}", {"attentionReason": reason[:120], "attentionAt": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")})
    except Exception as e:
        log.warning("por atender (%s): %s", lead_id, str(e)[:100])


async def clear(tenant: dict, lead_id: str) -> None:
    """Quita la marca (una persona ya atendió al cliente)."""
    try:
        espo = Espo(tenant)
        lead = await espo.get(f"Lead/{lead_id}", select="attentionReason")
        if lead.get("attentionReason"):
            await espo.put(f"Lead/{lead_id}", {"attentionReason": "", "attentionAt": None})
    except Exception as e:
        log.warning("quitar por atender (%s): %s", lead_id, str(e)[:100])


def clear_soon(slug: str, lead_id: str) -> None:
    """Versión para código síncrono: limpia en segundo plano si hay un bucle de eventos en marcha."""
    try:
        tenant = db.get_tenant(slug)
        if tenant:
            asyncio.get_running_loop().create_task(clear(tenant, lead_id))
    except RuntimeError:
        pass
