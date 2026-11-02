"""Motor comercial en el Centro de control: vista maestra de la prospección de IA de TODAS las empresas (la propia y las de los clientes). Lee las tablas del Hub
(agent_events, agent_leads, prospects, dnc, growth_log) y muestra por empresa: comerciales virtuales, volumen, respuestas, demos, escalados, pendientes de aprobación y alertas;
más las variantes ganadoras y los nichos de todo el sistema. Trae el interruptor de emergencia: pausa global o por empresa (el Hub deja de enviar de inmediato) y apagar un comercial.
Se inicializa con init() desde main.py."""
import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

ns = None


class PauseReq(BaseModel):
    paused: bool


class AgentReq(BaseModel):
    enabled: bool


def init(deps) -> None:
    global ns
    ns = deps
    r = APIRouter()
    me = ns.me

    def q(sql, *a):
        with ns.db() as c:
            return c.execute(sql, a).fetchall()

    def per_tenant(days: int) -> dict:
        """Cifras de cada empresa en la ventana (una consulta por cifra, agrupada por empresa)."""
        d: dict = {}
        def put(rows, key):
            for x in rows:
                d.setdefault(x["tenant"], {})[key] = x["n"]
        iv = (days,)
        put(q("SELECT tenant, count(*) n FROM agent_events WHERE kind='send' AND sent AND NOT dry AND COALESCE(data->>'kind','') IN ('first','followup') AND at > now() - make_interval(days => %s) GROUP BY tenant", *iv), "outreach")
        put(q("SELECT tenant, count(*) n FROM agent_events WHERE kind='send' AND sent AND NOT dry AND COALESCE(data->>'kind','') NOT IN ('first','followup') AND at > now() - make_interval(days => %s) GROUP BY tenant", *iv), "replies_sent")
        put(q("SELECT tenant, count(*) n FROM agent_events WHERE kind='send' AND dry AND at > now() - make_interval(days => %s) GROUP BY tenant", *iv), "dry_sends")
        put(q("SELECT tenant, count(DISTINCT lead_id) n FROM agent_events WHERE kind='send' AND sent AND NOT dry AND COALESCE(data->>'kind','') IN ('first','followup') AND at > now() - make_interval(days => %s) GROUP BY tenant", *iv), "contacted")
        put(q("SELECT tenant, count(DISTINCT lead_id) n FROM agent_events WHERE kind='inbound' AND at > now() - make_interval(days => %s) GROUP BY tenant", *iv), "replied")
        put(q("SELECT tenant, count(DISTINCT lead_id) n FROM agent_events WHERE kind='demo' AND NOT dry AND at > now() - make_interval(days => %s) GROUP BY tenant", *iv), "demos")
        put(q("SELECT tenant, count(DISTINCT lead_id) n FROM agent_events WHERE kind='escalate' AND at > now() - make_interval(days => %s) GROUP BY tenant", *iv), "escalated")
        put(q("SELECT tenant, count(*) n FROM agent_events WHERE kind='error' AND at > now() - make_interval(days => %s) GROUP BY tenant", *iv), "errors")
        put(q("SELECT e.tenant, count(*) n FROM agent_events e JOIN agent_leads l ON l.tenant=e.tenant AND l.lead_id=e.lead_id AND l.state='awaiting_approval' WHERE e.kind='proposal' AND NOT (e.data ? 'resolved') GROUP BY e.tenant"), "pending")
        put(q("SELECT tenant, count(*) n FROM agent_leads WHERE state IN ('active','waiting_reply') AND next_at IS NOT NULL AND next_at < now() + interval '30 days' GROUP BY tenant"), "queue")
        put(q("SELECT tenant, count(*) n FROM prospects WHERE status='ready' GROUP BY tenant"), "prospects_ready")
        put(q("SELECT tenant, count(*) n FROM prospects WHERE status='imported' GROUP BY tenant"), "prospects_in")
        put(q("SELECT tenant, count(*) n FROM dnc GROUP BY tenant"), "dnc")
        put(q("SELECT tenant, count(*) n FROM growth_log WHERE applied=false AND reverted=false GROUP BY tenant"), "growth_pending")
        for x in q("SELECT tenant, max(at) a FROM growth_log WHERE applied GROUP BY tenant"):
            d.setdefault(x["tenant"], {})["growth_last"] = x["a"].isoformat()
        return d

    def agents_of(t) -> list[dict]:
        st = t["settings"] or {}
        lst = st.get("agents") if isinstance(st.get("agents"), list) and st.get("agents") else [{"id": "main", "name": "Comercial virtual", "enabled": True, "config": st.get("agent") or {}}]
        out = []
        for a in lst:
            c = a.get("config") or {}
            out.append({"id": a.get("id"), "name": a.get("name") or (c.get("persona") or {}).get("name") or a.get("id"), "persona": (c.get("persona") or {}).get("name") or "", "enabled": a.get("enabled", True) is not False,
                        "mode": c.get("mode") or "manual", "dry_run": c.get("dry_run", True) is not False, "approval": bool(c.get("approval")), "outbound": bool((c.get("outbound") or {}).get("enabled")),
                        "closer": bool((c.get("closer") or {}).get("enabled")), "growth": bool((c.get("growth") or {}).get("enabled")), "growth_mode": (c.get("growth") or {}).get("mode") or "auto"})
        return out

    @r.get("/api/engine/overview")
    def overview(days: int = 7, actor: str = Depends(me)):
        days = max(1, min(days, 90))
        data = per_tenant(days)
        with ns.db() as c:
            tenants = c.execute("SELECT * FROM tenants ORDER BY CASE kind WHEN 'dev' THEN 0 WHEN 'prod' THEN 1 ELSE 2 END, created_at").fetchall()
            gp = c.execute("SELECT value FROM control_settings WHERE key='engine_paused'").fetchone()
        items, tot = [], {"outreach": 0, "contacted": 0, "replied": 0, "demos": 0, "escalated": 0, "pending": 0, "errors": 0, "queue": 0}
        for t in tenants:
            st, m = t["settings"] or {}, data.get(t["slug"], {})
            ags = agents_of(t)
            licensed = ((st.get("limits") or {}).get("agent")) == "auto"
            active_out = [a for a in ags if a["enabled"] and a["outbound"] and a["mode"] == "auto"]
            alerts = []
            if licensed and any(a["outbound"] and a["dry_run"] and a["enabled"] for a in ags):
                alerts.append("Prospección activa pero en modo prueba: no envía nada real.")
            if m.get("errors", 0) >= 10:
                alerts.append(f"{m['errors']} errores de envío o de IA en el periodo.")
            if m.get("pending", 0):
                alerts.append(f"{m['pending']} mensajes esperan aprobación.")
            if m.get("outreach", 0) >= 50 and m.get("replied", 0) == 0:
                alerts.append("Muchos envíos y ninguna respuesta: revisa los mensajes.")
            if st.get("engine_paused"):
                alerts.append("Pausada por el Centro de control.")
            rate = round(m.get("replied", 0) * 100 / m["contacted"], 1) if m.get("contacted") else None
            included = max(1, int((st.get("limits") or {}).get("agents") or 1))
            if len(ags) > included:
                alerts.append(f"{len(ags) - included} comercial(es) virtual(es) adicional(es) sobre los {included} incluidos: se suman a su factura.")
            items.append({"slug": t["slug"], "name": t["name"], "kind": t["kind"], "status": t["status"], "licensed": licensed, "agents": ags, "included": included, "activeOutbound": len(active_out), "paused": bool(st.get("engine_paused")),
                          "paused_niches": ((st.get("prospecting") or {}).get("paused_niches") or []), "m": m, "rate": rate, "alerts": alerts})
            if t["status"] == "active":
                for k in tot:
                    tot[k] += m.get(k, 0)
        tot["rate"] = round(tot["replied"] * 100 / tot["contacted"], 1) if tot["contacted"] else None
        # variantes ganadoras y nichos de todo el sistema
        var = q("WITH s AS (SELECT tenant, lead_id, at, COALESCE((data->>'step')::int,0) step, data->>'variant' v FROM agent_events WHERE kind='send' AND data ? 'variant' AND NOT dry AND sent AND at > now() - make_interval(days => %s)) "
                "SELECT s.tenant, s.step, s.v, count(*) sends, (SELECT count(DISTINCT (i.lead_id, i.at)) FROM agent_events i WHERE i.kind='inbound' AND i.tenant=s.tenant AND i.lead_id IN (SELECT lead_id FROM s s2 WHERE s2.tenant=s.tenant AND s2.step=s.step AND s2.v=s.v) "
                "AND EXISTS (SELECT 1 FROM s s3 WHERE s3.tenant=i.tenant AND s3.lead_id=i.lead_id AND s3.step=s.step AND s3.v=s.v AND s3.at <= i.at)) replies FROM s GROUP BY s.tenant, s.step, s.v", max(days, 30))
        variants = sorted([{"tenant": x["tenant"], "step": x["step"], "variant": x["v"], "sends": x["sends"], "replies": min(x["replies"], x["sends"]), "rate": round(min(x["replies"], x["sends"]) * 100 / x["sends"], 1) if x["sends"] else 0}
                           for x in var if x["sends"] >= 10], key=lambda x: -x["rate"])[:15]
        niches = q("SELECT p.niche, count(DISTINCT p.lead_id) leads, count(DISTINCT p.lead_id) FILTER (WHERE EXISTS (SELECT 1 FROM agent_events i WHERE i.tenant=p.tenant AND i.lead_id=p.lead_id AND i.kind='inbound')) replied "
                   "FROM prospects p WHERE p.status='imported' AND p.lead_id IS NOT NULL GROUP BY p.niche HAVING count(DISTINCT p.lead_id) >= 5 ORDER BY leads DESC LIMIT 15")
        growth = q("SELECT g.id, g.tenant, g.at, g.kind, g.title, g.applied, g.reverted FROM growth_log g ORDER BY g.id DESC LIMIT 15")
        return {"days": days, "paused": bool(gp and gp["value"]), "items": items, "totals": tot, "variants": variants,
                "niches": [{"niche": x["niche"], "leads": x["leads"], "replied": x["replied"], "rate": round(x["replied"] * 100 / x["leads"], 1) if x["leads"] else 0} for x in niches],
                "growth": [{**dict(x), "at": x["at"].isoformat()} for x in growth]}

    @r.get("/api/engine/companies/{slug}")
    def company_detail(slug: str, actor: str = Depends(me)):
        t = ns.get_tenant(slug)
        with ns.db() as c:
            pend = c.execute("SELECT e.lead_id, e.lead_name, e.at, e.channel, e.title, left(e.detail, 240) detail FROM agent_events e JOIN agent_leads l ON l.tenant=e.tenant AND l.lead_id=e.lead_id AND l.state='awaiting_approval' "
                             "WHERE e.tenant=%s AND e.kind='proposal' AND NOT (e.data ? 'resolved') ORDER BY e.id DESC LIMIT 20", (slug,)).fetchall()
            ev = c.execute("SELECT lead_id, lead_name, at, kind, channel, title, dry FROM agent_events WHERE tenant=%s AND kind IN ('send','inbound','demo','escalate','error','stop') ORDER BY id DESC LIMIT 25", (slug,)).fetchall()
            states = c.execute("SELECT state, count(*) n FROM agent_leads WHERE tenant=%s GROUP BY state", (slug,)).fetchall()
            gl = c.execute("SELECT id, at, kind, title, reason, applied, reverted FROM growth_log WHERE tenant=%s ORDER BY id DESC LIMIT 10", (slug,)).fetchall()
        return {"slug": slug, "name": t["name"], "host": t["host"], "agents": agents_of(t), "paused": bool((t["settings"] or {}).get("engine_paused")),
                "pending": [{**dict(x), "at": x["at"].isoformat()} for x in pend], "events": [{**dict(x), "at": x["at"].isoformat()} for x in ev], "states": {x["state"]: x["n"] for x in states},
                "growth": [{**dict(x), "at": x["at"].isoformat()} for x in gl]}

    @r.post("/api/engine/pause")
    def pause_all(req: PauseReq, actor: str = Depends(me)):
        ns.put_setting("engine_paused", bool(req.paused))
        ns.audit(actor, "engine.pause_all" if req.paused else "engine.resume_all", None, {})
        return {"paused": req.paused}

    @r.post("/api/engine/companies/{slug}/pause")
    def pause_company(slug: str, req: PauseReq, actor: str = Depends(me)):
        ns.get_tenant(slug)
        with ns.db() as c:
            c.execute("UPDATE tenants SET settings = jsonb_set(COALESCE(settings,'{}'::jsonb), '{engine_paused}', %s::jsonb, true) WHERE slug=%s", (json.dumps(bool(req.paused)), slug))
        ns.audit(actor, "engine.pause" if req.paused else "engine.resume", slug, {})
        return {"paused": req.paused}

    @r.post("/api/engine/companies/{slug}/agents/{aid}/enabled")
    def agent_enabled(slug: str, aid: str, req: AgentReq, actor: str = Depends(me)):
        t = ns.get_tenant(slug)
        st = t["settings"] or {}
        lst = st.get("agents")
        if not (isinstance(lst, list) and lst):
            raise HTTPException(400, "Esta empresa aún no tiene comerciales virtuales configurados.")
        a = next((x for x in lst if x.get("id") == aid), None)
        if not a:
            raise HTTPException(404, "Ese comercial no existe.")
        a["enabled"] = bool(req.enabled)
        with ns.db() as c:
            c.execute("UPDATE tenants SET settings = settings || %s::jsonb WHERE slug=%s", (json.dumps({"agents": lst}), slug))
        ns.audit(actor, "engine.agent_on" if req.enabled else "engine.agent_off", slug, {"agent": aid})
        return {"ok": True}

    ns.app.include_router(r)
