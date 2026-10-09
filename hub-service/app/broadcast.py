"""Campañas de mensajes masivos: audiencia (lista de leads) + texto con variables + ritmo de envío.
Un proceso en segundo plano envía de a un mensaje por intervalo, respeta «no contactar» y deja nota en cada lead."""
import asyncio
import logging
import re
import time

from . import db, sms, telegram, whatsapp
from .espo import Espo
from .ingest import normalize_phone

log = logging.getLogger("crmhub.broadcast")
CHANNELS = {"whatsapp": "WhatsApp", "sms": "SMS", "telegram": "Telegram"}
MAX_AUDIENCE = 5000
LIMITS = {"whatsapp": 120, "sms": 600, "telegram": 300}
# WhatsApp por Evolution API (no oficial): para no poner en riesgo la línea se limita el tamaño de cada campaña y se envía muy despacio.
# Por defecto 100 destinatarios por campaña y un mensaje cada 2 minutos en toda la empresa; el Centro de control puede ampliarlo (settings.limits.wa_bulk).
WA_MAX, WA_EVERY = 100, 120
SUPPORT_HINT = "Si necesitas enviar más, contacta con soporte de Crm Hub 360."
_last_wa: dict[str, float] = {}
FOOTER = {"whatsapp": "\nPara no recibir más mensajes responde BAJA.", "sms": " Responde BAJA para no recibir mas.", "telegram": "\nPara no recibir más mensajes responde BAJA."}


def policy(tenant: dict, channel: str) -> dict | None:
    """Reglas de ritmo del WhatsApp no oficial (Evolution); None para el resto de canales y proveedores."""
    if channel != "whatsapp" or whatsapp.provider(tenant) != "evolution":
        return None
    lim = ((tenant.get("settings") or {}).get("limits") or {}).get("wa_bulk") or {}
    return {"max": max(10, int(lim.get("max") or WA_MAX)), "every_s": max(30, int(lim.get("every_s") or WA_EVERY))}


def configured(tenant: dict, channel: str) -> bool:
    return bool({"whatsapp": whatsapp.provider, "sms": sms.provider, "telegram": lambda t: (t.get("settings") or {}).get("telegram_bot_token")}[channel](tenant))


def render(tpl: str, lead: dict, tenant: dict, advisor: str = "") -> str:
    first = (lead.get("firstName") or (lead.get("name") or "").split(" ")[0] or "").strip()
    vals = {"nombre": lead.get("name") or first, "primer_nombre": first, "servicio": (lead.get("suggestedService") or "").split(" (")[0],
            "asesor": advisor or lead.get("assignedUserName") or "", "empresa": tenant.get("name") or ""}
    return re.sub(r"\{(\w+)\}", lambda m: vals.get(m.group(1), m.group(0)), tpl).strip()


def create(tenant: dict, *, name: str, channel: str, text: str, lead_ids: list[str], per_minute: int, footer: bool, by: str,
           start_in_min: int = 0) -> int:
    if channel not in CHANNELS:
        raise ValueError("Canal no válido")
    if not configured(tenant, channel):
        raise ValueError(f"{CHANNELS[channel]} no está configurado en Integraciones.")
    text = text.strip()
    if not name.strip() or not text:
        raise ValueError("La campaña necesita nombre y mensaje.")
    ids = list(dict.fromkeys(lead_ids))
    if not ids:
        raise ValueError("La audiencia está vacía.")
    if len(ids) > MAX_AUDIENCE:
        raise ValueError(f"La audiencia supera el máximo de {MAX_AUDIENCE} destinatarios por campaña.")
    pol = policy(tenant, channel)
    if pol:
        if len(ids) > pol["max"]:
            raise ValueError(f"Con WhatsApp por Evolution API cada campaña admite hasta {pol['max']} destinatarios, para no poner en riesgo tu línea (hoy son {len(ids)}). {SUPPORT_HINT}")
        per_minute = 1   # el ritmo real lo manda la política (un mensaje cada pocos minutos)
    else:
        per_minute = max(1, min(int(per_minute or 20), LIMITS[channel]))
    if footer and "BAJA" not in text.upper():
        text += FOOTER[channel]
    with db.pool.connection() as c:
        bid = c.execute(
            """INSERT INTO broadcasts (tenant, name, channel, text, status, per_minute, scheduled_at, next_send_at, created_by)
               VALUES (%s,%s,%s,%s,%s,%s, now() + make_interval(mins => %s), now() + make_interval(mins => %s), %s) RETURNING id""",
            (tenant["slug"], name.strip()[:120], channel, text[:2000], "scheduled" if start_in_min > 0 else "running", per_minute, start_in_min, start_in_min, by)).fetchone()["id"]
        with c.cursor() as cur:
            cur.executemany("INSERT INTO broadcast_items (broadcast_id, lead_id) VALUES (%s,%s)", [(bid, i) for i in ids])
    return bid


def listing(slug: str) -> list[dict]:
    with db.pool.connection() as c:
        return c.execute(
            """SELECT b.id, b.name, b.channel, b.status, b.per_minute, b.created_by, b.created_at, b.scheduled_at,
                      count(i.*) total, count(i.*) FILTER (WHERE i.status='sent') sent, count(i.*) FILTER (WHERE i.status='failed') failed,
                      count(i.*) FILTER (WHERE i.status='skipped') skipped, count(i.*) FILTER (WHERE i.status='pending') pending
               FROM broadcasts b LEFT JOIN broadcast_items i ON i.broadcast_id = b.id WHERE b.tenant = %s GROUP BY b.id ORDER BY b.id DESC LIMIT 60""", (slug,)).fetchall()


def detail(slug: str, bid: int) -> dict | None:
    with db.pool.connection() as c:
        b = c.execute("SELECT * FROM broadcasts WHERE id = %s AND tenant = %s", (bid, slug)).fetchone()
        if not b:
            return None
        errs = c.execute("SELECT lead_id, status, error FROM broadcast_items WHERE broadcast_id = %s AND status IN ('failed','skipped') ORDER BY id LIMIT 50", (bid,)).fetchall()
    return {**b, "problems": errs}


def set_status(slug: str, bid: int, status: str) -> bool:
    allowed = {"pause": ("paused", ("running", "scheduled")), "resume": ("running", ("paused",)), "cancel": ("cancelled", ("running", "scheduled", "paused"))}
    new, frm = allowed[status]
    with db.pool.connection() as c:
        r = c.execute("UPDATE broadcasts SET status = %s, finished_at = CASE WHEN %s='cancelled' THEN now() END WHERE id = %s AND tenant = %s AND status = ANY(%s)",
                      (new, new, bid, slug, list(frm)))
        return r.rowcount > 0


async def _send_one(tenant: dict, b: dict, item: dict) -> tuple[str, str | None]:
    espo = Espo(tenant)
    lead = await espo.get(f"Lead/{item['lead_id']}")
    if lead.get("doNotContact"):
        return "skipped", "Pidió no ser contactado"
    text = render(b["text"], lead, tenant)
    if b["channel"] == "telegram":
        if not lead.get("telegramChatId"):
            return "skipped", "Sin chat de Telegram"
        await telegram.send_text(tenant, lead["telegramChatId"], text)
    else:
        phone = normalize_phone(lead.get("phoneNumber"))
        if not phone:
            return "skipped", "Sin teléfono"
        if b["channel"] == "whatsapp":
            await whatsapp.send_text(tenant, phone, text)
            whatsapp._sent[(item["lead_id"], text)] = time.time()
        else:
            await sms.send_text(tenant, phone, text, lead)
    await espo.note(item["lead_id"], f"[Difusión: {b['name']}] {CHANNELS[b['channel']]}: {text}")
    return "sent", None


async def tick() -> None:
    with db.pool.connection() as c:
        due = c.execute("""SELECT * FROM broadcasts WHERE status IN ('running','scheduled') AND coalesce(next_send_at, now()) <= now() ORDER BY id LIMIT 20""").fetchall()
    for b in due:
        tenant = db.get_tenant(b["tenant"])
        if not tenant or tenant["status"] != "active":
            continue
        pol = policy(tenant, b["channel"])
        if pol:   # una sola línea: ninguna campaña de la empresa envía antes de que pase el intervalo desde el último mensaje
            last = _last_wa.get(b["tenant"])
            if last is None:
                with db.pool.connection() as c:
                    r = c.execute("""SELECT extract(epoch FROM now() - max(i.sent_at)) AS ago FROM broadcast_items i JOIN broadcasts x ON x.id = i.broadcast_id
                                     WHERE x.tenant = %s AND x.channel = 'whatsapp' AND i.sent_at IS NOT NULL""", (b["tenant"],)).fetchone()
                last = time.monotonic() - float(r["ago"]) if r and r["ago"] is not None else time.monotonic() - 10 ** 6
                _last_wa[b["tenant"]] = last
            wait = pol["every_s"] - (time.monotonic() - last)
            if wait > 0:
                with db.pool.connection() as c:
                    c.execute("UPDATE broadcasts SET next_send_at = now() + make_interval(secs => %s) WHERE id=%s", (wait + 0.5, b["id"]))
                continue
        with db.pool.connection() as c:
            item = c.execute("""UPDATE broadcast_items SET status='sent' WHERE id = (SELECT id FROM broadcast_items WHERE broadcast_id=%s AND status='pending'
                                ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id, lead_id""", (b["id"],)).fetchone()
            if not item:
                c.execute("UPDATE broadcasts SET status='done', finished_at=now() WHERE id=%s", (b["id"],))
                continue
            c.execute("UPDATE broadcasts SET status='running', next_send_at = now() + make_interval(secs => %s) WHERE id=%s", (pol["every_s"] if pol else 60.0 / b["per_minute"], b["id"]))
        if pol:
            _last_wa[b["tenant"]] = time.monotonic()
        try:
            st, err = await _send_one(tenant, b, item)
        except Exception as e:
            st, err = "failed", str(e)[:240]
        with db.pool.connection() as c:
            c.execute("UPDATE broadcast_items SET status=%s, error=%s, sent_at=now() WHERE id=%s", (st, err, item["id"]))


async def worker() -> None:
    while True:
        try:
            await tick()
        except Exception:
            log.exception("error en el envío masivo")
        await asyncio.sleep(1)
