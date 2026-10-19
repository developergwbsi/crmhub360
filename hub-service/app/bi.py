"""Reportes y tableros (BI) de cada usuario: se guardan en Postgres del Hub (tabla bi_items) como definiciones JSON; los datos los calcula el CRM (con los permisos del usuario)
o, para los formularios internos, este módulo. Un elemento es personal, de un equipo o de toda la empresa (solo lectura para los demás)."""
import json
import re
import secrets
from collections import defaultdict
from datetime import datetime

from . import db, iforms

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS bi_items (tenant TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL, owner TEXT NOT NULL, owner_name TEXT NOT NULL DEFAULT '', name TEXT NOT NULL,
    def JSONB NOT NULL DEFAULT '{}', share TEXT NOT NULL DEFAULT 'none', teams TEXT[] NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (tenant, id));
CREATE INDEX IF NOT EXISTS bi_items_owner ON bi_items (tenant, owner);
"""
MAX_DEF = 300_000
KINDS = ("report", "dashboard")


def ensure_schema() -> None:
    with db.pool.connection() as c:
        c.execute(SCHEMA_SQL)


def _visible(row: dict, user: str, teams: list[str]) -> bool:
    return row["owner"] == user or row["share"] == "all" or (row["share"] == "team" and bool(set(row["teams"]) & set(teams)))


def items(tenant: str, user: str, teams: list[str]) -> list[dict]:
    with db.pool.connection() as c:
        rows = c.execute("SELECT id, kind, owner, owner_name, name, share, teams, updated_at FROM bi_items WHERE tenant=%s ORDER BY kind, name", (tenant,)).fetchall()
    return [{"id": r["id"], "kind": r["kind"], "name": r["name"], "owner": r["owner"], "ownerName": r["owner_name"], "share": r["share"], "mine": r["owner"] == user, "updatedAt": r["updated_at"].isoformat()}
            for r in rows if _visible(r, user, teams)]


def get_item(tenant: str, iid: str, user: str, teams: list[str]) -> dict | None:
    with db.pool.connection() as c:
        r = c.execute("SELECT * FROM bi_items WHERE tenant=%s AND id=%s", (tenant, iid)).fetchone()
    if not r or not _visible(r, user, teams):
        return None
    return {"id": r["id"], "kind": r["kind"], "name": r["name"], "def": r["def"], "owner": r["owner"], "ownerName": r["owner_name"], "share": r["share"], "mine": r["owner"] == user, "updatedAt": r["updated_at"].isoformat()}


def save_item(tenant: str, iid: str | None, kind: str, name: str, definition: dict, share: str, user: str, user_name: str, teams: list[str], is_manager: bool) -> dict:
    if kind not in KINDS:
        raise ValueError("Tipo no válido.")
    name = (name or "").strip()[:100]
    if len(name) < 2:
        raise ValueError("Ponle un nombre.")
    if len(json.dumps(definition)) > MAX_DEF:
        raise ValueError("El tablero es demasiado grande.")
    share = share if share in ("none", "team", "all") else "none"
    if share == "all" and not is_manager:
        share = "team" if teams else "none"   # compartir con toda la empresa lo hacen gerentes y supervisores
    with db.pool.connection() as c:
        if iid:
            r = c.execute("SELECT owner FROM bi_items WHERE tenant=%s AND id=%s", (tenant, iid)).fetchone()
            if not r:
                iid = None
            elif r["owner"] != user and not is_manager:
                raise PermissionError("Solo quien lo creó puede cambiarlo.")
        if iid:
            c.execute("UPDATE bi_items SET name=%s, def=%s::jsonb, share=%s, teams=%s, updated_at=now() WHERE tenant=%s AND id=%s", (name, json.dumps(definition, ensure_ascii=False), share, teams if share == "team" else [], tenant, iid))
        else:
            iid = "b" + secrets.token_hex(5)
            c.execute("INSERT INTO bi_items (tenant, id, kind, owner, owner_name, name, def, share, teams) VALUES (%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s)",
                      (tenant, iid, kind, user, user_name[:80], name, json.dumps(definition, ensure_ascii=False), share, teams if share == "team" else []))
    return {"id": iid}


def delete_item(tenant: str, iid: str, user: str, is_manager: bool) -> bool:
    with db.pool.connection() as c:
        r = c.execute("SELECT owner FROM bi_items WHERE tenant=%s AND id=%s", (tenant, iid)).fetchone()
        if not r:
            return False
        if r["owner"] != user and not is_manager:
            raise PermissionError("Solo quien lo creó puede eliminarlo.")
        c.execute("DELETE FROM bi_items WHERE tenant=%s AND id=%s", (tenant, iid))
    return True


# ---------------- consultas sobre las respuestas de los formularios internos
def _bucket(v, b: str):
    if not v:
        return None
    t = str(v)[:19].replace("T", " ")
    try:
        d = datetime.fromisoformat(t)
    except ValueError:
        return t
    return {"year": f"{d.year}", "month": f"{d.year}-{d.month:02d}", "week": f"{d.isocalendar()[0]}-S{d.isocalendar()[1]:02d}"}.get(b, f"{d.year}-{d.month:02d}-{d.day:02d}")


def form_meta(tenant: str) -> list[dict]:
    """Formularios con los campos que se pueden agrupar (listas, Sí/No, fechas, texto corto) o sumar (números, montos, cálculos)."""
    out = []
    for d in iforms.defs(tenant, only_active=False):
        fields = [{"name": "_created", "label": "Fecha de la respuesta", "type": "datetime"}, {"name": "_by", "label": "Quién la llenó", "type": "enum"}]
        for f in d["fields"]:
            if f["type"] in ("heading", "plan"):
                continue
            t = {"number": "float", "money": "currency", "calc": "float", "date": "date", "select": "enum", "multiselect": "enum", "bool": "bool", "text": "varchar", "textarea": "varchar", "phone": "varchar", "email": "varchar"}.get(f["type"], "varchar")
            fields.append({"name": f["key"], "label": f["label"], "type": t})
        out.append({"id": "form:" + d["id"], "label": "Formulario: " + d["name"], "fields": fields})
    return out


def form_query(tenant: str, form_id: str, q: dict, lead_ids: list[str] | None) -> dict:
    """Agrupa y suma las respuestas de un formulario. lead_ids = leads que el usuario puede ver (None = todos)."""
    d = iforms.get_def(tenant, form_id)
    if not d:
        raise ValueError("Ese formulario ya no existe.")
    with db.pool.connection() as c:
        rows = c.execute("SELECT values, lead_id, created_at, updated_by_name FROM iform_entries WHERE tenant=%s AND form_id=%s", (tenant, form_id)).fetchall()
    if lead_ids is not None:
        ok = set(lead_ids)
        rows = [r for r in rows if r["lead_id"] in ok]

    def val(r, k):
        if k == "_created":
            return r["created_at"].isoformat()
        if k == "_by":
            return r["updated_by_name"] or "—"
        return r["values"].get(k)

    def passes(r, f):
        v, op, x = val(r, f["field"]), f.get("op", "equals"), f.get("value")
        if op == "isNull":
            return v in (None, "", [])
        if op == "isNotNull":
            return v not in (None, "", [])
        if isinstance(v, list):
            return (str(x) in v) if op in ("equals", "contains") else (str(x) not in v)
        try:
            if op in ("greaterThan", "lessThan", "greaterThanOrEquals", "lessThanOrEquals") and isinstance(v, (int, float)):
                x = float(x)
                return {"greaterThan": v > x, "lessThan": v < x, "greaterThanOrEquals": v >= x, "lessThanOrEquals": v <= x}[op]
        except (TypeError, ValueError):
            return False
        sv, sx = str(v if v is not None else "").lower(), str(x if x is not None else "").lower()
        return {"equals": sv == sx, "notEquals": sv != sx, "contains": sx in sv, "in": sv in [str(i).lower() for i in (x if isinstance(x, list) else [x])]}.get(op, True)

    for f in q.get("filters", []):
        rows = [r for r in rows if passes(r, f)]
    groups = (q.get("groups") or [])[:2]
    measures = (q.get("measures") or [{"fn": "count"}])[:4]
    acc: dict = defaultdict(lambda: [[] for _ in measures])
    for r in rows:
        key = []
        for g in groups:
            v = val(r, g["field"])
            if g.get("bucket"):
                v = _bucket(v, g["bucket"])
            key.append(", ".join(v) if isinstance(v, list) else ("Sin valor" if v in (None, "") else (("Sí" if v else "No") if isinstance(v, bool) else v)))
        for i, m in enumerate(measures):
            if m["fn"] == "count":
                acc[tuple(key)][i].append(1)
            else:
                x = val(r, m.get("field", ""))
                if isinstance(x, (int, float)):
                    acc[tuple(key)][i].append(float(x))
    out = []
    for key, ms in acc.items():
        row = {f"g{j + 1}": k for j, k in enumerate(key)}
        for i, m in enumerate(measures):
            xs = ms[i]
            row[f"m{i + 1}"] = (len(xs) if m["fn"] == "count" else sum(xs) if m["fn"] == "sum" else (sum(xs) / len(xs) if xs else 0) if m["fn"] == "avg" else (min(xs) if xs else 0) if m["fn"] == "min" else (max(xs) if xs else 0))
        out.append(row)
    if groups:
        out.sort(key=lambda r: (str(r.get("g1")), str(r.get("g2"))) if groups[0].get("bucket") else (-(r.get("m1") or 0), str(r.get("g1"))))
    return {"rows": out[: int(q.get("limit") or 500)]}
