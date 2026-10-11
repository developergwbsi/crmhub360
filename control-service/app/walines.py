"""Líneas de WhatsApp (Evolution) del Centro de control: un inventario de las instancias que nosotros administramos, para crearlas, vincularlas por QR y **asignarlas a las empresas**.

Una línea es una instancia de Evolution (con su teléfono). Puede estar libre, o asignada a una empresa como **principal** (claves planas de settings: wa_provider, evolution_*) o como
**adicional** (settings.lines, que el CRM muestra como otra tarjeta con su interruptor y «Enviar desde»). Al asignarla se apunta su webhook al Hub de esa empresa; al quitarla o moverla se
**desactiva el webhook** (si no, los mensajes de una línea libre crearían leads en la empresa anterior). La empresa usa la clave propia de la instancia, nunca la global del servidor.
El inventario se guarda en control_settings «wa_pool» (líneas creadas aquí con su etiqueta); las asignadas salen además de la configuración de cada empresa.
Se inicializa con init() desde main.py (que le pasa sus utilidades)."""
import asyncio
import json
import re
import secrets
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from . import evomon

ns = None
NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{1,58}$")
MAX_LINES = 12


class NewReq(BaseModel):
    """Nueva línea: nombre de la instancia (sin espacios), etiqueta visible y servidor Evolution."""
    name: str
    label: str = ""
    provider_id: str = ""


class AssignReq(BaseModel):
    """Asignación de una línea: empresa y modo («main» = línea principal, «extra» = línea adicional) y nombre con el que la verá la empresa."""
    slug: str
    mode: str = "extra"
    label: str = ""


def pool() -> list[dict]:
    return (ns.get_setting("wa_pool", {}) or {}).get("items", [])


def save_pool(items: list[dict]) -> None:
    ns.put_setting("wa_pool", {"items": items})


def prov_by_id(pid: str) -> dict:
    p = next((x for x in ns.providers_list() if x["id"] == pid and x["kind"] == "evolution"), None)
    if not p:
        raise HTTPException(400, "Servidor Evolution no válido (Proveedores aliados).")
    return p


def prov_of_url(url: str) -> dict | None:
    u = (url or "").rstrip("/")
    return next((p for p in ns.providers_list() if p["kind"] == "evolution" and (p["fields"].get("url") or "").rstrip("/") == u), None)


async def ev(method: str, prov: dict, path: str, **kw) -> httpx.Response:
    async with httpx.AsyncClient(timeout=kw.pop("timeout", 25)) as c:
        return await c.request(method, prov["fields"]["url"].rstrip("/") + path, headers={"apikey": prov["fields"].get("apikey", ""), "Content-Type": "application/json"}, **kw)


def tenants() -> list[dict]:
    with ns.db() as c:
        return c.execute("SELECT * FROM tenants").fetchall()


def assignments() -> dict:
    """{instancia: {slug, company, mode, lineId, lineName, url}} según la configuración de cada empresa."""
    out = {}
    for t in tenants():
        st = t["settings"] or {}
        if st.get("wa_provider") == "evolution" and st.get("evolution_instance"):
            out[st["evolution_instance"]] = {"slug": t["slug"], "company": t["name"], "mode": "main", "lineId": "main:whatsapp", "lineName": ((st.get("line_meta") or {}).get("main:whatsapp") or {}).get("name") or "Principal", "url": st.get("evolution_url") or ""}
        for ln in st.get("lines") or []:
            f = ln.get("fields") or {}
            if ln.get("channel") == "whatsapp" and ln.get("type") == "evolution" and f.get("evolution_instance"):
                out[f["evolution_instance"]] = {"slug": t["slug"], "company": t["name"], "mode": "extra", "lineId": ln.get("id"), "lineName": ln.get("name") or "Línea", "url": f.get("evolution_url") or ""}
    return out


async def set_webhook(prov: dict, name: str, url: str | None, token: str = "") -> None:
    """Apunta el webhook de la instancia al Hub de una empresa, o lo desactiva (url=None)."""
    wh = {"url": url or "https://invalid.invalid/", "enabled": bool(url), "byEvents": False, "base64": False, "headers": {"apikey": token}, "events": ["MESSAGES_UPSERT"]}
    r = await ev("POST", prov, f"/webhook/set/{name}", json={"webhook": wh})
    if r.status_code >= 400:
        r = await ev("POST", prov, f"/webhook/set/{name}", json=wh)
    if r.status_code >= 400:
        raise HTTPException(502, f"No se pudo configurar el webhook de la línea ({r.status_code}): {r.text[:140]}")


async def instance_info(prov: dict, name: str) -> dict:
    try:
        r = await ev("GET", prov, "/instance/fetchInstances", params={"instanceName": name}, timeout=15)
        d = r.json()
        d = d[0] if isinstance(d, list) and d else d
        st = await ev("GET", prov, f"/instance/connectionState/{name}", timeout=15)
        state = str(((st.json() or {}).get("instance") or {}).get("state") or "unknown") if st.status_code == 200 else ("missing" if st.status_code == 404 else "error")
        return {"state": state, "owner": ((d or {}).get("ownerJid") or "").split("@")[0], "profile": (d or {}).get("profileName") or ""}
    except Exception as e:
        return {"state": "error", "owner": "", "profile": "", "error": str(e)[:80]}


def unassign_settings(t: dict, name: str) -> dict:
    """Configuración de la empresa sin la línea `name` (principal o adicional)."""
    st = dict(t["settings"] or {})
    if st.get("evolution_instance") == name:
        for k in ("wa_provider", "evolution_url", "evolution_apikey", "evolution_instance"):
            st.pop(k, None)
        meta = dict(st.get("line_meta") or {})
        meta.pop("main:whatsapp", None)
        st["line_meta"] = meta
        man = dict(st.get("managed") or {})
        man.pop("whatsapp", None)
        st["managed"] = man
    st["lines"] = [l for l in (st.get("lines") or []) if not (l.get("type") == "evolution" and (l.get("fields") or {}).get("evolution_instance") == name)]
    return st


def init(deps) -> None:
    """Registra las rutas del inventario de líneas."""
    global ns
    ns = deps
    r = APIRouter()
    me = ns.me

    def write(slug: str, st: dict) -> None:
        with ns.db() as c:
            c.execute("UPDATE tenants SET settings=%s WHERE slug=%s", (json.dumps(st), slug))

    async def locate(name: str) -> tuple[dict, dict | None]:
        """(servidor Evolution, asignación actual) de una línea del inventario."""
        asg = assignments().get(name)
        entry = next((p for p in pool() if p["name"] == name), None)
        prov = None
        if entry:
            prov = prov_by_id(entry["provider_id"])
        elif asg:
            prov = prov_of_url(asg["url"])
        if not prov:
            raise HTTPException(404, "Línea no encontrada en el inventario")
        return prov, asg

    @r.get("/api/wa-lines")
    async def list_lines(actor: str = Depends(me)):
        """Inventario de líneas de Evolution (libres y asignadas) con estado, número y empresa asignada, más los servidores y empresas disponibles. Lo llama la interfaz web del Centro."""
        asg = assignments()
        items, seen = [], set()
        entries = {p["name"]: p for p in pool()}
        for name in list(entries) + [n for n in asg if n not in entries]:
            if name in seen:
                continue
            seen.add(name)
            prov = prov_by_id(entries[name]["provider_id"]) if name in entries else prov_of_url((asg.get(name) or {}).get("url", ""))
            items.append({"name": name, "label": (entries.get(name) or {}).get("label", ""), "provider": prov, "assigned": asg.get(name)})
        infos = await asyncio.gather(*[instance_info(i["provider"], i["name"]) if i["provider"] else asyncio.sleep(0, {"state": "sin_servidor", "owner": "", "profile": ""}) for i in items])
        out = [{"name": i["name"], "label": i["label"], "providerId": (i["provider"] or {}).get("id", ""), "assigned": i["assigned"], **inf} for i, inf in zip(items, infos)]
        companies = [{"slug": t["slug"], "name": t["name"], "status": t["status"]} for t in tenants()]
        return {"items": out, "providers": [{"id": p["id"], "name": p["name"]} for p in ns.providers_list() if p["kind"] == "evolution"], "companies": companies}

    @r.post("/api/wa-lines")
    async def create_line(req: NewReq, actor: str = Depends(me)):
        """Crea una línea (instancia de Evolution sin empresa y sin webhook) y la agrega al inventario; después se vincula por QR y se asigna."""
        name = req.name.strip()
        if not NAME.match(name):
            raise HTTPException(400, "El nombre solo admite letras, números, guiones (2 a 59 caracteres, sin espacios)")
        pid = req.provider_id or next((p["id"] for p in ns.providers_list() if p["kind"] == "evolution"), "")
        prov = prov_by_id(pid)
        if name in assignments() or any(p["name"] == name for p in pool()):
            raise HTTPException(400, "Ya existe una línea con ese nombre")
        x = await ev("POST", prov, "/instance/create", json={"instanceName": name, "integration": "WHATSAPP-BAILEYS", "qrcode": True})
        if x.status_code in (403, 409) or "already" in x.text.lower():
            raise HTTPException(400, "Ese nombre ya existe en el servidor Evolution: elige otro (puede ser de otro producto).")
        if x.status_code not in (200, 201):
            raise HTTPException(502, f"Evolution respondió {x.status_code}: {x.text[:140]}")
        await set_webhook(prov, name, None)   # libre: sin webhook hasta que se asigne
        save_pool(pool() + [{"name": name, "provider_id": pid, "label": req.label.strip()[:60], "created_at": datetime.now(timezone.utc).isoformat()}])
        ns.audit(actor, "linea_whatsapp_creada", name)
        return {"ok": True, "name": name}

    @r.post("/api/wa-lines/{name}/assign")
    async def assign_line(name: str, req: AssignReq, actor: str = Depends(me)):
        """Asigna la línea a una empresa como principal («main») o adicional («extra»): usa la clave propia de la instancia, apunta su webhook al Hub de la empresa y, si estaba en otra, la quita de allí."""
        prov, cur = await locate(name)
        if req.mode not in ("main", "extra"):
            raise HTTPException(400, "Modo no válido")
        t = ns.get_tenant(req.slug)
        if t["status"] != "active":
            raise HTTPException(400, "La empresa está suspendida")
        tok = await ns.evolution_token(prov, name)
        if not tok:
            raise HTTPException(502, "No se pudo obtener la clave de la instancia en Evolution")
        if cur:   # se retira de la empresa anterior
            old = ns.get_tenant(cur["slug"])
            write(cur["slug"], unassign_settings(old, name))
            if cur["mode"] == "main":
                sv = ns.services_of(cur["slug"]); sv.pop("whatsapp", None); ns.put_setting("services:" + cur["slug"], sv)
            t = ns.get_tenant(req.slug)
        st = dict(t["settings"] or {})
        label = (req.label.strip() or (next((p["label"] for p in pool() if p["name"] == name), "") or name))[:60]
        fields = {"evolution_url": prov["fields"]["url"].rstrip("/"), "evolution_instance": name, "evolution_apikey": tok}
        if req.mode == "main":
            prev = st.get("evolution_instance")
            if prev and prev != name and st.get("wa_provider") == "evolution" and not any(p["name"] == prev for p in pool()):   # la principal anterior no se pierde: queda libre en el inventario
                save_pool(pool() + [{"name": prev, "provider_id": (prov_of_url(st.get("evolution_url", "")) or prov)["id"], "label": "", "created_at": datetime.now(timezone.utc).isoformat()}])
                try:
                    await set_webhook(prov_of_url(st.get("evolution_url", "")) or prov, prev, None)
                except HTTPException:
                    pass
            st.update(wa_provider="evolution", **fields)
            meta = dict(st.get("line_meta") or {}); meta["main:whatsapp"] = {**(meta.get("main:whatsapp") or {}), "name": label if label != name else "Principal", "enabled": True}
            st["line_meta"] = meta
            man = dict(st.get("managed") or {}); man["whatsapp"] = prov["id"]; st["managed"] = man
            sv = ns.services_of(req.slug); sv["whatsapp"] = {"provider": prov["id"], "instance": name, "from": ""}; ns.put_setting("services:" + req.slug, sv)
        else:
            lines = list(st.get("lines") or [])
            if len(lines) >= MAX_LINES:
                raise HTTPException(400, f"La empresa ya tiene el máximo de {MAX_LINES} líneas adicionales")
            lines.append({"id": "l_" + secrets.token_hex(4), "channel": "whatsapp", "type": "evolution", "name": label, "enabled": True, "fields": fields, "extra": {}})
            st["lines"] = lines
        write(req.slug, st)
        await set_webhook(prov, name, f"https://{t['host']}/hub/evolution", t["hub_token"])
        ns.audit(actor, "linea_whatsapp_asignada", req.slug, {"instancia": name, "modo": req.mode})
        return {"ok": True}

    @r.post("/api/wa-lines/{name}/unassign")
    async def unassign_line(name: str, actor: str = Depends(me)):
        """Quita la línea de su empresa (queda libre en el inventario) y desactiva su webhook para que sus mensajes no lleguen a esa empresa."""
        prov, cur = await locate(name)
        if not cur:
            return {"ok": True}
        t = ns.get_tenant(cur["slug"])
        write(cur["slug"], unassign_settings(t, name))
        if cur["mode"] == "main":
            sv = ns.services_of(cur["slug"]); sv.pop("whatsapp", None); ns.put_setting("services:" + cur["slug"], sv)
        if not any(p["name"] == name for p in pool()):
            save_pool(pool() + [{"name": name, "provider_id": prov["id"], "label": "", "created_at": datetime.now(timezone.utc).isoformat()}])
        await set_webhook(prov, name, None)
        ns.audit(actor, "linea_whatsapp_liberada", cur["slug"], {"instancia": name})
        return {"ok": True}

    @r.delete("/api/wa-lines/{name}")
    async def delete_line(name: str, actor: str = Depends(me)):
        """Elimina una línea libre (borra la instancia en Evolution y del inventario). Una línea asignada no se puede eliminar."""
        prov, cur = await locate(name)
        if cur:
            raise HTTPException(400, "La línea está asignada a una empresa: quítala primero")
        x = await ev("DELETE", prov, f"/instance/delete/{name}")
        if x.status_code not in (200, 201, 404):
            raise HTTPException(502, f"Evolution respondió {x.status_code}: {x.text[:140]}")
        save_pool([p for p in pool() if p["name"] != name])
        ns.audit(actor, "linea_whatsapp_eliminada", name)
        return {"ok": True}

    @r.put("/api/wa-lines/{name}/label")
    async def label_line(name: str, body: dict, actor: str = Depends(me)):
        """Cambia la etiqueta visible de una línea del inventario."""
        prov, _ = await locate(name)
        items = pool()
        lab = str(body.get("label") or "").strip()[:60]
        if any(p["name"] == name for p in items):
            for p in items:
                if p["name"] == name:
                    p["label"] = lab
        else:
            items.append({"name": name, "provider_id": prov["id"], "label": lab, "created_at": datetime.now(timezone.utc).isoformat()})
        save_pool(items)
        return {"ok": True}

    # ---- QR, estado, cierre de sesión y reinicio por nombre de línea
    @r.get("/api/wa-lines/{name}/state")
    async def line_state(name: str, actor: str = Depends(me)):
        """Estado de la sesión de WhatsApp de la línea (open, close, connecting…)."""
        prov, asg = await locate(name)
        st = (await instance_info(prov, name))["state"]
        if st == "open" and asg:
            asyncio.create_task(evomon.on_connected(asg["slug"], name))
        return {"instance": name, "state": st}

    @r.post("/api/wa-lines/{name}/qr")
    async def line_qr(name: str, actor: str = Depends(me)):
        """Código QR actual para vincular el teléfono de la línea (se audita cada vez que se pide)."""
        prov, asg = await locate(name)
        info = await instance_info(prov, name)
        if info["state"] == "open":
            if asg:
                asyncio.create_task(evomon.on_connected(asg["slug"], name))
            return {"connected": True, "state": "open", "instance": name}
        q = await ev("GET", prov, f"/instance/connect/{name}")
        if q.status_code >= 400:
            raise HTTPException(502, f"Evolution respondió {q.status_code}: {q.text[:140]}")
        d = q.json()
        ns.audit(actor, "ver_qr_whatsapp", name)
        return {"connected": False, "state": info["state"], "instance": name, "qr": d.get("base64") or "", "pairingCode": d.get("pairingCode") or ""}

    @r.post("/api/wa-lines/{name}/test")
    async def line_test(name: str, body: dict, actor: str = Depends(me)):
        """Envía un mensaje de prueba por la línea al número indicado (usa la clave propia de la instancia si está asignada)."""
        prov, asg = await locate(name)
        key = prov["fields"].get("apikey", "")
        if asg:
            t = next((x for x in tenants() if x["slug"] == asg["slug"]), None)
            st = (t or {}).get("settings") or {}
            key = st.get("evolution_apikey") if st.get("evolution_instance") == name else next(((l.get("fields") or {}).get("evolution_apikey") for l in st.get("lines") or [] if (l.get("fields") or {}).get("evolution_instance") == name), None) or key
        await evomon.send_test_text(prov["fields"]["url"], key or prov["fields"].get("apikey", ""), name, (body or {}).get("to", ""), (body or {}).get("text", ""))
        ns.audit(actor, "prueba_envio_whatsapp", name)
        return {"ok": True}

    @r.post("/api/wa-lines/{name}/logout")
    async def line_logout(name: str, actor: str = Depends(me)):
        """Cierra la sesión de WhatsApp de la línea (el teléfono queda desvinculado) para escanear otro número."""
        prov, _ = await locate(name)
        x = await ev("DELETE", prov, f"/instance/logout/{name}")
        if x.status_code not in (200, 201, 400, 404):
            raise HTTPException(502, f"Evolution respondió {x.status_code}: {x.text[:140]}")
        ns.audit(actor, "cerrar_sesion_whatsapp", name)
        return {"ok": True}

    @r.post("/api/wa-lines/{name}/restart")
    async def line_restart(name: str, actor: str = Depends(me)):
        """Reinicia la instancia de la línea (reconecta la sesión sin pedir el QR)."""
        prov, _ = await locate(name)
        x = await ev("POST", prov, f"/instance/restart/{name}", timeout=40)
        if x.status_code >= 400:
            raise HTTPException(502, f"Evolution respondió {x.status_code}: {x.text[:140]}")
        ns.audit(actor, "reiniciar_whatsapp", name)
        return {"ok": True}

    ns.app.include_router(r)
