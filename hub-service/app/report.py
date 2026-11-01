"""Reporte gerencial por correo del motor comercial: qué hizo el ciclo, a quién se le escribió, qué respondió la gente, cómo van las protecciones (rebotes, bajas, tope diario),
qué espera una decisión del gerente y los próximos pasos. Lo arma el Hub con los datos reales (nada inventado) y una «lectura gerencial» redactada por la IA de la empresa
(con un respaldo por reglas si la IA falla). Se envía por el correo normal de la empresa a los destinatarios configurados en settings.finder.report = {enabled, hour, to[], last}."""
import html as _h
import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from . import agent, compliance, db, llm, mailout

log = logging.getLogger("hub.report")
GRADE_NAMES = {"-": "sin calificar", "A": "A · encaje claro", "B": "B · encaje probable", "C": "C · dudoso", "D": "D · no trabajar"}
E = _h.escape


def settings_of(tenant: dict) -> dict:
    r = (((tenant.get("settings") or {}).get("finder") or {}).get("report") or {})
    return {"enabled": bool(r.get("enabled")), "hour": max(0, min(23, int(r.get("hour") if r.get("hour") is not None else 11))),
            "to": [a.strip() for a in (r.get("to") or []) if isinstance(a, str) and "@" in a][:8], "last": r.get("last")}


def collect(tenant: dict, hours: int = 24) -> dict:
    """Todas las cifras del reporte (últimas `hours` horas, más el embudo de 30 días y los pendientes)."""
    slug = tenant["slug"]
    tz = ZoneInfo(((tenant.get("settings") or {}).get("agent") or {}).get("schedule", {}).get("tz") or "America/Bogota")
    loc = lambda d: d.astimezone(tz).strftime("%d/%m %H:%M")
    out: dict = {"slug": slug, "company": tenant.get("name") or slug, "now": datetime.now(tz).strftime("%d/%m/%Y %H:%M"), "hours": hours}
    with db.pool.connection() as c:
        q = lambda sql, *a: c.execute(sql, (slug, *a)).fetchall()
        h = f"{hours} hours"
        out["new"] = [dict(r) for r in q("SELECT status, coalesce(enrichment->'qualifier'->>'grade','-') g, count(*) n FROM prospects WHERE tenant=%s AND origin='finder' AND created_at > now() - %s::interval GROUP BY 1,2", h)]
        out["rejected"] = [dict(r) for r in q("SELECT left(reason,90) r, count(*) n FROM prospects WHERE tenant=%s AND status='rejected' AND updated_at > now() - %s::interval AND reason<>'' GROUP BY 1 ORDER BY 2 DESC LIMIT 6", h)]
        out["sent"] = [{"lead": r["lead_name"] or "", "at": loc(r["at"]), "subject": r["subject"] or "", "title": r["title"]} for r in q(
            "SELECT lead_name, at, data->>'subject' subject, title FROM agent_events WHERE tenant=%s AND kind='send' AND channel='email' AND NOT dry AND at > now() - %s::interval ORDER BY at", h)]
        out["replies"] = [{"lead": r["lead_name"] or "", "at": loc(r["at"]), "text": (r["detail"] or "")[:160]} for r in q("SELECT lead_name, at, detail FROM agent_events WHERE tenant=%s AND kind='inbound' AND at > now() - %s::interval ORDER BY at", h)]
        out["demos"] = [{"lead": r["lead_name"] or "", "title": r["title"]} for r in q("SELECT lead_name, title FROM agent_events WHERE tenant=%s AND kind='demo' AND NOT dry AND at > now() - %s::interval", h)]
        out["escalated"] = [{"lead": r["lead_name"] or "", "title": r["title"]} for r in q("SELECT lead_name, title FROM agent_events WHERE tenant=%s AND kind='escalate' AND at > now() - %s::interval", h)]
        out["stopped"] = [{"lead": r["lead_name"] or "", "title": r["title"]} for r in q("SELECT lead_name, title FROM agent_events WHERE tenant=%s AND kind='stop' AND at > now() - %s::interval", h)]
        out["bounces"] = [r["value"] for r in q("SELECT value FROM dnc WHERE tenant=%s AND reason ILIKE 'rebote%%' AND at > now() - %s::interval", h)]
        out["optouts"] = q("SELECT count(*) n FROM dnc WHERE tenant=%s AND kind='email' AND reason NOT ILIKE 'rebote%%' AND source NOT IN ('csv','import','manual','auto','verificacion') AND at > now() - %s::interval", h)[0]["n"]
        # direcciones que no existían y se descartaron antes de escribir (solo prospectos y leads reales, no las pruebas de la caché)
        out["verified_blocked"] = (q("SELECT count(*) n FROM prospects WHERE tenant=%s AND status='rejected' AND updated_at > now() - %s::interval AND (reason ILIKE 'El servidor de%%' OR reason ILIKE 'El dominio%%')", h)[0]["n"]
                                   + q("SELECT count(*) n FROM dnc WHERE tenant=%s AND source='verificacion' AND at > now() - %s::interval", h)[0]["n"])
        # prospectos listos que todavía no se contactaron: los de grado A o B con correo pasan en el próximo ciclo; los de grado C o D no pasan por regla del calificador
        rd = q("SELECT coalesce(enrichment->'qualifier'->>'grade','-') g, (email<>'') has_mail, count(*) n FROM prospects WHERE tenant=%s AND status='ready' GROUP BY 1,2")
        out["ready_ab"] = sum(r["n"] for r in rd if r["g"] in ("A", "B") and r["has_mail"])
        out["ready_other"] = sum(r["n"] for r in rd) - out["ready_ab"]
        out["quota_used"] = (c.execute("SELECT coalesce(sum(n),0) n FROM mail_quota WHERE tenant=%s AND day = current_date", (slug,)).fetchone()["n"])
        out["pending"] = [{"lead": p.get("lead_name") or p["lead_id"]} for p in agent.pending_proposals(slug)]
        out["followups"] = [{"lead": r["lead_name"] or "", "at": loc(r["next_at"])} for r in q(
            "SELECT (SELECT lead_name FROM agent_events e WHERE e.tenant=l.tenant AND e.lead_id=l.lead_id AND lead_name<>'' ORDER BY id DESC LIMIT 1) lead_name, next_at FROM agent_leads l "
            "WHERE tenant=%s AND state='waiting_reply' AND next_at BETWEEN now() AND now() + interval '72 hours' ORDER BY next_at LIMIT 10")]
        out["totals"] = {r["status"]: r["n"] for r in q("SELECT status, count(*) n FROM prospects WHERE tenant=%s GROUP BY 1")}
    cfg = agent.config(agent.for_agent(tenant))
    out["cap"] = (cfg.get("outbound") or {}).get("max_email_per_day") or 0
    out["funnel"] = agent.funnel(slug, 30)
    out["health"] = compliance.cold_unhealthy(slug)
    st = tenant.get("settings") or {}
    out["cycle"] = ((st.get("finder") or {}).get("pipeline_last") or {})
    out["paused"] = bool(agent.engine_paused(tenant))
    return out


def fallback_reading(d: dict) -> list[str]:
    """Lectura gerencial por reglas (si la IA no está disponible)."""
    f, items = d["funnel"], []
    items.append(f"En las últimas {d['hours']} horas se enviaron {len(d['sent'])} correos en frío; en 30 días van {f['contacted']} contactados, {f['replied']} respuestas y {f['demos']} demos agendadas.")
    items.append("No hubo respuestas todavía: es normal en las primeras 24 a 72 horas; los seguimientos automáticos siguen programados." if not d["replies"] else f"Respondieron {len(d['replies'])} contactos: revísalos en el CRM.")
    items.append(f"Protecciones: {len(d['bounces'])} rebote(s), {d['optouts']} baja(s) y {d['verified_blocked']} dirección(es) descartadas antes de escribir. " + (f"ALERTA: {d['health']}." if d["health"] else "Sin alertas de reputación."))
    if d["pending"]:
        items.append(f"Hay {len(d['pending'])} mensaje(s) esperando tu aprobación.")
    return items


async def reading(tenant: dict, d: dict) -> list[str]:
    brief = {k: d[k] for k in ("hours", "ready_ab", "ready_other", "new", "rejected", "sent", "replies", "demos", "escalated", "stopped", "bounces", "optouts", "verified_blocked", "quota_used", "cap", "pending", "followups", "funnel", "health", "cycle", "paused", "totals")}
    try:
        txt = await llm.chat_text(tenant, "Eres el analista del gerente general. Redactas la «lectura gerencial» de un reporte del motor comercial autónomo (busca empresas, las califica y les escribe por correo). "
                                          "Escribe SOLO 4 viñetas, cada una en una línea que empieza con «- », en español, con tono ejecutivo, claras y sin tecnicismos. Usa únicamente las cifras dadas; no inventes. "
                                          "Contexto del sistema (no lo contradigas): el ciclo corre solo cada día a las 9:00; solo pasan a Valeria los prospectos de grado A o B con correo, hasta un tope diario; ready_ab son listos que pasarán en el próximo ciclo y ready_other son de grado C, D o sin correo y NO pasan por regla (no es un retraso por cuota); "
                                          "verified_blocked son direcciones inexistentes descartadas antes de escribir; los seguimientos salen a los 3 y 5 días. No atribuyas causas que los datos no digan. La última viñeta es una recomendación concreta para el gerente. No uses negritas ni emojis.", "DATOS (JSON):\n" + __import__("json").dumps(brief, ensure_ascii=False, default=str)[:7000])
        lines = [l.strip(" -•\t") for l in txt.splitlines() if l.strip().startswith(("-", "•"))]
        return lines[:5] if len(lines) >= 3 else fallback_reading(d)
    except Exception as e:
        log.warning("lectura gerencial: %s", str(e)[:120])
        return fallback_reading(d)


def _tile(label: str, value, note: str = "", color: str = "#1e1b4b") -> str:
    return (f"<td style='width:25%;padding:6px'><div style='background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px 10px;text-align:center'>"
            f"<div style='font-size:26px;font-weight:700;color:{color};line-height:1.1'>{E(str(value))}</div><div style='font-size:11.5px;color:#475569;margin-top:2px'>{E(label)}</div>"
            + (f"<div style='font-size:10.5px;color:#94a3b8'>{E(note)}</div>" if note else "") + "</div></td>")


def _table(head: list[str], rows: list[list[str]], empty: str) -> str:
    if not rows:
        return f"<p style='color:#64748b;font-size:13px;margin:6px 0'>{E(empty)}</p>"
    th = "".join(f"<th style='text-align:left;padding:6px 8px;font-size:11px;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0'>{E(x)}</th>" for x in head)
    tr = "".join("<tr>" + "".join(f"<td style='padding:7px 8px;font-size:13px;border-bottom:1px solid #f1f5f9;color:#0f172a'>{E(str(c))}</td>" for c in r) + "</tr>" for r in rows)
    return f"<table style='width:100%;border-collapse:collapse;margin:6px 0'><tr>{th}</tr>{tr}</table>"


def render(d: dict, bullets: list[str], preview: bool = False) -> tuple[str, str, str]:
    f = d["funnel"]
    grades: dict = {}
    for r in d["new"]:
        grades[r["g"]] = grades.get(r["g"], 0) + r["n"]
    found = sum(r["n"] for r in d["new"])
    alert = bool(d["health"]) or d["paused"]
    status = ("Atención: " + (d["health"] or "el motor está pausado")) if alert else ("Todo en orden" if not d["bounces"] else "En orden, con un rebote para revisar")
    color = "#b91c1c" if alert else ("#b45309" if d["bounces"] else "#15803d")
    sub = f"{E(d['company'])} · {E(d['now'])} (últimas {d['hours']} horas)"
    h = (f"<div style='font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;color:#0f172a'>"
         f"<div style='background:linear-gradient(135deg,#312e81,#4f46e5 55%,#0891b2);color:#fff;border-radius:16px;padding:22px 24px'>"
         f"<div style='font-size:12px;opacity:.85;letter-spacing:.06em;text-transform:uppercase'>Reporte gerencial · Motor comercial{' · vista previa' if preview else ''}</div>"
         f"<div style='font-size:22px;font-weight:700;margin:6px 0 4px'>{E(d['company'])}</div><div style='font-size:13px;opacity:.9'>{E(d['now'])} · últimas {d['hours']} horas</div>"
         f"<div style='display:inline-block;margin-top:12px;background:#fff;color:{color};font-weight:700;font-size:13px;border-radius:999px;padding:5px 12px'>{E(status)}</div></div>"
         "<h3 style='margin:22px 0 6px;font-size:15px'>Lectura gerencial</h3><ul style='margin:0;padding-left:20px;font-size:14px;line-height:1.55'>" + "".join(f"<li style='margin-bottom:5px'>{E(b)}</li>" for b in bullets) + "</ul>"
         "<h3 style='margin:22px 0 4px;font-size:15px'>Indicadores</h3><table style='width:100%;border-collapse:collapse'><tr>"
         + _tile("Empresas halladas", found) + _tile("Correos enviados", len(d["sent"]), f"tope {d['quota_used']}/{d['cap']} hoy") + _tile("Respuestas", len(d["replies"]), color="#0f766e") + _tile("Demos agendadas", len(d["demos"]), color="#15803d") + "</tr><tr>"
         + _tile("Rebotes", len(d["bounces"]), color="#b91c1c" if d["bounces"] else "#1e1b4b") + _tile("Bajas", d["optouts"]) + _tile("Descartadas antes de escribir", d["verified_blocked"], "correo inexistente") + _tile("Esperan tu aprobación", len(d["pending"]), color="#b45309" if d["pending"] else "#1e1b4b") + "</tr></table>"
         "<h3 style='margin:22px 0 4px;font-size:15px'>Embudo de los últimos 30 días</h3>"
         f"<p style='font-size:14px;margin:4px 0'><b>{f['contacted']}</b> contactados → <b>{f['replied']}</b> respondieron → <b>{f['demos']}</b> demos agendadas · <b>{f['escalated']}</b> pasaron a una persona.</p>"
         "<h3 style='margin:22px 0 4px;font-size:15px'>Lo que hizo el ciclo</h3>")
    cy = d["cycle"]
    fi, qu = cy.get("finder") or {}, cy.get("qualifier") or {}
    h += (f"<p style='font-size:13.5px;margin:4px 0'>Última pasada: <b>{E(str(cy.get('at', ''))[:16].replace('T', ' ')) or '—'}</b> UTC · halló {fi.get('found', '—')} empresas, {fi.get('ready', '—')} cumplieron los requisitos, "
          f"{qu.get('qualified', '—')} calificadas y <b>{qu.get('passed', '—')}</b> pasaron a Valeria.</p>" if cy and not cy.get("error") else
          f"<p style='font-size:13.5px;margin:4px 0;color:#b91c1c'>El último ciclo falló: {E(str(cy.get('error')))}</p>" if cy.get("error") else "<p style='font-size:13.5px;margin:4px 0;color:#64748b'>Aún no hay un ciclo registrado.</p>")
    h += f"<p style='font-size:13px;margin:6px 0'>Listos sin contactar: <b>{d['ready_ab']}</b> de grado A o B (pasan en el próximo ciclo) y <b>{d['ready_other']}</b> de grado C o D (no pasan por regla del calificador).</p>"
    h += ("<p style='font-size:13px;margin:6px 0'>Calificación de lo hallado: " + (" · ".join(f"<b>{E(GRADE_NAMES.get(g, g))}</b> {n}" for g, n in sorted(grades.items())) or "sin prospectos nuevos") + "</p>")
    if d["rejected"]:
        h += "<p style='font-size:12.5px;color:#475569;margin:4px 0'>Descartados: " + "; ".join(f"{E(r['r'])} ({r['n']})" for r in d["rejected"]) + "</p>"
    h += "<h3 style='margin:22px 0 4px;font-size:15px'>A quién se le escribió</h3>" + _table(["Empresa", "Hora", "Asunto"], [[s["lead"], s["at"], s["subject"] or s["title"]] for s in d["sent"]], "No salieron correos en este período.")
    if d["replies"]:
        h += "<h3 style='margin:22px 0 4px;font-size:15px'>Respuestas</h3>" + _table(["Quién", "Hora", "Dijo"], [[r["lead"], r["at"], r["text"]] for r in d["replies"]], "")
    if d["demos"] or d["escalated"]:
        h += "<h3 style='margin:22px 0 4px;font-size:15px'>Para que entre tu equipo</h3>" + _table(["Empresa", "Qué pasó"], [[x["lead"], x["title"]] for x in d["demos"] + d["escalated"]], "")
    h += "<h3 style='margin:22px 0 4px;font-size:15px'>Protecciones</h3>"
    pr = [f"Rebotes: {len(d['bounces'])}" + (f" ({', '.join(d['bounces'][:4])})" if d["bounces"] else ""), f"Bajas: {d['optouts']}", f"Direcciones inexistentes detectadas antes de escribir: {d['verified_blocked']}",
          f"Tope diario de correos en frío: {d['quota_used']} de {d['cap']} usados hoy", "Frenos automáticos: " + (E(d["health"]) if d["health"] else "sin activar (la reputación del remitente está sana)")]
    if d["stopped"]:
        pr.append("Leads detenidos: " + "; ".join((x["lead"] or x["title"]) for x in d["stopped"]))
    h += "<ul style='margin:4px 0;padding-left:20px;font-size:13.5px;line-height:1.5'>" + "".join(f"<li>{x if x.startswith('Frenos') else E(x)}</li>" for x in pr) + "</ul>"
    h += "<h3 style='margin:22px 0 4px;font-size:15px'>Pendiente de tu parte</h3>" + (_table(["Mensaje por aprobar"], [[x["lead"]] for x in d["pending"]], "") if d["pending"] else "<p style='color:#64748b;font-size:13px;margin:6px 0'>Nada pendiente.</p>")
    h += "<h3 style='margin:22px 0 4px;font-size:15px'>Próximos seguimientos automáticos (72 horas)</h3>" + _table(["Empresa", "Cuándo"], [[x["lead"], x["at"]] for x in d["followups"]], "No hay seguimientos programados en las próximas 72 horas.")
    t = d["totals"]
    h += (f"<p style='margin:22px 0 4px;font-size:12px;color:#64748b'>Acumulado de prospectos: {t.get('imported', 0)} en el CRM · {t.get('ready', 0)} listos · {t.get('rejected', 0)} rechazados. "
          "Reporte generado automáticamente por Crm Hub 360 con los datos reales del CRM.</p></div>")
    subject = f"Reporte gerencial · Motor comercial · {d['now'][:10]}" + (" (vista previa)" if preview else "") + (" · ATENCIÓN" if alert else "")
    text = "\n".join([subject, "", *["- " + b for b in bullets], "", f"Empresas halladas: {found} · Correos enviados: {len(d['sent'])} · Respuestas: {len(d['replies'])} · Demos: {len(d['demos'])} · Rebotes: {len(d['bounces'])} · Bajas: {d['optouts']}",
                                      f"Embudo 30 días: {f['contacted']} contactados, {f['replied']} respondieron, {f['demos']} demos."])
    return subject, h, text


async def send(tenant: dict, to: list[str] | None = None, preview: bool = False) -> dict:
    """Arma y envía el reporte por el correo normal de la empresa; devuelve el asunto y los destinatarios."""
    cfg = settings_of(tenant)
    rcpt = to or cfg["to"]
    if not rcpt:
        raise ValueError("No hay destinatarios del reporte gerencial.")
    d = collect(tenant)
    bullets = await reading(tenant, d)
    subject, html, text = render(d, bullets, preview)
    uid = (agent.config(agent.for_agent(tenant)).get("handoff_user_id") or ((agent.config(agent.for_agent(tenant)).get("closer") or {}).get("host_user_id")) or "")
    await mailout.send(tenant, {"to": rcpt, "subject": subject, "html": html, "userId": uid, "userName": "Crm Hub 360 · Reporte gerencial", "record": False})
    if not preview:
        with db.pool.connection() as c:
            c.execute("UPDATE tenants SET settings = jsonb_set(settings, '{finder,report,last}', to_jsonb(%s::text), true) WHERE slug=%s", (datetime.now(timezone.utc).isoformat(), tenant["slug"]))
    return {"subject": subject, "to": rcpt}


def due(tenant: dict) -> bool:
    """¿Toca enviar el reporte de hoy? (activo, ya pasó su hora local y todavía no salió hoy)."""
    c = settings_of(tenant)
    if not (c["enabled"] and c["to"]):
        return False
    tz = ZoneInfo(((tenant.get("settings") or {}).get("agent") or {}).get("schedule", {}).get("tz") or "America/Bogota")
    now = datetime.now(tz)
    if c["last"] and datetime.fromisoformat(c["last"]).astimezone(tz).date() == now.date():
        return False
    return now.hour >= c["hour"]
