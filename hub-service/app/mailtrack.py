"""Señales de los correos que envía el comercial virtual: entregado, abierto, clic, rebote y queja de spam.
Resend avisa por el mismo webhook de los correos entrantes (email.delivered, email.opened, email.clicked, email.bounced, email.complained). Cada señal se guarda
en la bitácora del lead (kind «mail»), se resume para el comercial virtual (agent.decide) y, si hay reacción, adelanta el próximo seguimiento y avisa al responsable.
Las aperturas son aproximadas: Apple Mail y algunos filtros abren el correo solos, así que una apertura sola nunca se trata como interés seguro."""
import logging
from datetime import datetime, timedelta, timezone

from . import agent, compliance, db, push
from .espo import Espo

log = logging.getLogger("hub.mailtrack")
TYPES = {"email.delivered": "delivered", "email.opened": "opened", "email.clicked": "clicked", "email.bounced": "bounced", "email.complained": "complained", "email.delivery_delayed": "delayed"}
TITLE = {"delivered": "El correo llegó a la bandeja del cliente", "opened": "El cliente abrió el correo", "clicked": "El cliente hizo clic en un enlace del correo",
         "bounced": "El correo rebotó", "complained": "El cliente marcó el correo como spam", "delayed": "La entrega del correo se retrasó"}


def _find(slug: str, addr: str, subject: str) -> tuple[str, str] | None:
    """(lead_id, lead_name) del último correo enviado a esa dirección (o con ese asunto, para los enviados antes de guardar la dirección)."""
    with db.pool.connection() as c:
        r = c.execute("SELECT lead_id, lead_name FROM agent_events WHERE tenant=%s AND kind='send' AND channel='email' AND NOT dry AND at > now() - interval '45 days' AND data->>'to'=%s ORDER BY id DESC LIMIT 1", (slug, addr)).fetchone()
        if not r and subject:
            rows = c.execute("SELECT DISTINCT lead_id, lead_name FROM agent_events WHERE tenant=%s AND kind='send' AND channel='email' AND NOT dry AND at > now() - interval '45 days' AND data->>'subject'=%s LIMIT 2", (slug, subject[:200])).fetchall()
            r = rows[0] if len(rows) == 1 else None   # solo si el asunto identifica a un único lead
    return (r["lead_id"], r["lead_name"]) if r else None


async def handle(tenant: dict, event: dict) -> bool:
    """Procesa un evento de seguimiento de Resend. True si quedó registrado."""
    kind = TYPES.get(event.get("type") or "")
    if not kind:
        return False
    ev = event.get("data") or {}
    to = ev.get("to") or []
    addr = str(to[0] if isinstance(to, list) and to else to or "").strip().lower()
    slug = tenant["slug"]
    if not addr:
        return False
    found = _find(slug, addr, str(ev.get("subject") or ""))
    if kind == "bounced":   # rebote permanente: la dirección no existe (cuenta para el freno automático del correo en frío)
        if str((ev.get("bounce") or {}).get("type") or "").lower() == "permanent":
            compliance.add_dnc(slug, email=addr, reason="rebote: el correo no se pudo entregar", source="auto")
            try:
                await agent.stop_bounced(tenant, addr)
            except Exception as e:
                log.warning("detener tras el rebote de %s: %s", addr, str(e)[:100])
            return True
    if kind == "complained":   # queja de spam: no se le vuelve a escribir
        compliance.add_dnc(slug, email=addr, reason="queja de spam", source="complaint")
        if found:
            agent._set(slug, found[0], state="stopped", reason="El cliente marcó el correo como spam", next_at=None)
    if not found:
        return False
    lead_id, lname = found
    url = str((ev.get("click") or {}).get("link") or "")[:300]
    with db.pool.connection() as c:
        if kind in ("opened", "delivered") and c.execute("SELECT 1 FROM agent_events WHERE tenant=%s AND lead_id=%s AND kind='mail' AND data->>'event'=%s AND at > now() - make_interval(mins => %s)", (slug, lead_id, kind, 30 if kind == "opened" else 2)).fetchone():
            return False   # aperturas repetidas en pocos minutos (precarga de los filtros) y avisos duplicados no se cuentan
    agent.log_event(slug, lead_id, "mail", lead_name=lname or "", channel="email", title=TITLE[kind], detail=url, data={"event": kind, "to": addr, "email_id": ev.get("email_id"), "url": url, "subject": str(ev.get("subject") or "")[:200]})
    if kind in ("opened", "clicked"):
        await _react(tenant, lead_id, lname or "", kind, url)
    return True


async def _react(tenant: dict, lead_id: str, lname: str, kind: str, url: str) -> None:
    """Reacción: el seguimiento se adelanta (nunca antes de 2 h) y un clic avisa al responsable del lead."""
    slug = tenant["slug"]
    now = datetime.now(timezone.utc)
    with db.pool.connection() as c:
        row = c.execute("SELECT state, next_at FROM agent_leads WHERE tenant=%s AND lead_id=%s", (slug, lead_id)).fetchone()
        opens = c.execute("SELECT count(*) n FROM agent_events WHERE tenant=%s AND lead_id=%s AND kind='mail' AND data->>'event'='opened' AND at > now() - interval '7 days'", (slug, lead_id)).fetchone()["n"]
    if row and row["state"] == "waiting_reply" and row["next_at"] and (kind == "clicked" or opens >= 2):
        target = now + timedelta(hours=2)
        if row["next_at"] > target:
            agent._set(slug, lead_id, next_at=target)
    if kind != "clicked":
        return
    try:
        lead = await Espo(tenant).get(f"Lead/{lead_id}", select="assignedUserId")
        uid = lead.get("assignedUserId") or agent.config(tenant).get("handoff_user_id")
        if uid:
            await push.send(slug, title=f"{lname or 'Un prospecto'} hizo clic en tu correo"[:90], body="Vio el enlace. Buen momento para estar atento a su respuesta."[:140], url=f"/#Lead/view/{lead_id}", tag=f"crmhub-mail-{lead_id}", kind="agent", user_id=uid)
    except Exception as e:
        log.warning("aviso de clic (%s): %s", lead_id, str(e)[:100])


def signals(slug: str, lead_id: str) -> str:
    """Resumen de lo que pasó con los correos enviados a este lead, para el comercial virtual. Vacío si no hay datos."""
    with db.pool.connection() as c:
        last = c.execute("SELECT at FROM agent_events WHERE tenant=%s AND lead_id=%s AND kind='send' AND channel='email' AND NOT dry ORDER BY id DESC LIMIT 1", (slug, lead_id)).fetchone()
        if not last:
            return ""
        rows = c.execute("SELECT at, data FROM agent_events WHERE tenant=%s AND lead_id=%s AND kind='mail' AND at >= %s ORDER BY id", (slug, lead_id, last["at"])).fetchall()
    ev = [(r["at"], (r["data"] or {}).get("event"), (r["data"] or {}).get("url")) for r in rows]
    if not ev:
        return "No hay señales del último correo (puede que el seguimiento de aperturas esté apagado)."
    ago = lambda t: (lambda m: f"hace {m} min" if m < 90 else f"hace {m // 60} h" if m < 2880 else f"hace {m // 1440} días")(int((datetime.now(timezone.utc) - t).total_seconds() // 60))
    delivered = [t for t, k, _ in ev if k == "delivered"]
    opened = [t for t, k, _ in ev if k == "opened"]
    clicked = [(t, u) for t, k, u in ev if k == "clicked"]
    parts = [f"entregado ({ago(delivered[-1])})" if delivered else "sin confirmación de entrega"]
    parts.append(f"abierto {len(opened)} vez/veces, la última {ago(opened[-1])}" if opened else "NO abierto")
    if clicked:
        parts.append(f"hizo clic en un enlace ({ago(clicked[-1][0])})")
    return "; ".join(parts)
