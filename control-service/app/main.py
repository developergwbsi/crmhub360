"""Crm Hub 360 - Centro de control: crear y vigilar empresas, restablecer claves y entrar en modo lectura.
No ejecuta nada privilegiado: encola trabajos que realiza `bin/control-worker` en el servidor."""
import asyncio, base64, hashlib, hmac, json, os, re, secrets, time
from typing import Optional

import httpx
import psycopg
import uvicorn
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from psycopg.rows import dict_row
from pydantic import BaseModel, Field

DATABASE_URL = os.environ["DATABASE_URL"]
USER = os.environ["CONTROL_USER"]
PASS_HASH = os.environ["CONTROL_PASSWORD_HASH"]          # scrypt:<salt_b64>:<hash_b64>
SECRET = os.environ["CONTROL_SESSION_SECRET"].encode()
BASE_DOMAIN = os.environ["BASE_DOMAIN"]
BIND_HOST, PORT = os.environ.get("CONTROL_BIND_HOST", "127.0.0.1"), int(os.environ.get("CONTROL_PORT", "8195"))
TENANTS_DIR = "/tenants"
SESSION_TTL = 12 * 3600
SUPPORT_USER = "soporte-lectura"

app = FastAPI(title="Crm Hub 360 · Centro de control", docs_url=None, redoc_url=None, openapi_url=None)


def db():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row, autocommit=True)


def audit(actor, action, target=None, detail=None):
    with db() as c:
        c.execute("INSERT INTO control_audit (actor, action, target, detail) VALUES (%s,%s,%s,%s)", (actor, action, target, json.dumps(detail or {})))


# ---------------------------------------------------------------- sesión
def verify_password(pw: str) -> bool:
    try:
        _, salt, h = PASS_HASH.split(":")
        calc = hashlib.scrypt(pw.encode(), salt=base64.b64decode(salt), n=2 ** 14, r=8, p=1, dklen=32)
        return hmac.compare_digest(calc, base64.b64decode(h))
    except Exception:
        return False


def sign(payload: dict) -> str:
    raw = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()
    return raw + "." + hmac.new(SECRET, raw.encode(), hashlib.sha256).hexdigest()


def read_session(request: Request) -> Optional[dict]:
    tok = request.cookies.get("cc_session", "")
    if "." not in tok:
        return None
    raw, sig = tok.rsplit(".", 1)
    if not hmac.compare_digest(sig, hmac.new(SECRET, raw.encode(), hashlib.sha256).hexdigest()):
        return None
    try:
        data = json.loads(base64.urlsafe_b64decode(raw))
    except Exception:
        return None
    return data if data.get("exp", 0) > time.time() else None


def me(request: Request) -> str:
    s = read_session(request)
    if not s:
        raise HTTPException(401, "Sesión vencida")
    if request.method not in ("GET", "HEAD") and request.headers.get("x-cc") != "1":
        raise HTTPException(403, "Solicitud no permitida")
    return s["u"]


_fails: dict = {}


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    return (fwd.split(",")[0].strip() if fwd and request.client and request.client.host in ("127.0.0.1", "::1") else (request.client.host if request.client else "?"))


class LoginReq(BaseModel):
    user: str
    password: str


@app.post("/api/login")
def login(req: LoginReq, request: Request, response: Response):
    ip, now = client_ip(request), time.time()
    recent = [t for t in _fails.get(ip, []) if now - t < 600]
    if len(recent) >= 5:
        raise HTTPException(429, "Demasiados intentos. Espera 10 minutos.")
    if request.headers.get("x-cc") != "1":
        raise HTTPException(403, "Solicitud no permitida")
    ok = hmac.compare_digest(req.user.encode(), USER.encode()) & verify_password(req.password)
    if not ok:
        _fails[ip] = recent + [now]
        audit(req.user[:40], "login_fallido", ip)
        time.sleep(1)
        raise HTTPException(401, "Usuario o contraseña incorrectos")
    _fails.pop(ip, None)
    response.set_cookie("cc_session", sign({"u": USER, "exp": now + SESSION_TTL}), max_age=SESSION_TTL, httponly=True, secure=True, samesite="strict", path="/")
    audit(USER, "login", ip)
    return {"ok": True, "user": USER}


@app.post("/api/logout")
def logout(response: Response):
    response.delete_cookie("cc_session", path="/")
    return {"ok": True}


@app.get("/api/me")
def whoami(actor: str = Depends(me)):
    return {"user": actor, "baseDomain": BASE_DOMAIN}


# ---------------------------------------------------------------- empresas
def tenant_env(slug: str) -> dict:
    out = {}
    try:
        for line in open(f"{TENANTS_DIR}/{slug}/.env", encoding="utf8"):
            if "=" in line and not line.startswith("#"):
                k, v = line.rstrip("\n").split("=", 1)
                out[k] = v
    except FileNotFoundError:
        pass
    return out


def get_tenant(slug: str) -> dict:
    if not re.match(r"^[a-z][a-z0-9-]{1,30}$", slug):
        raise HTTPException(404, "Empresa no encontrada")
    with db() as c:
        t = c.execute("SELECT * FROM tenants WHERE slug=%s", (slug,)).fetchone()
    if not t:
        raise HTTPException(404, "Empresa no encontrada")
    return t


def espo(t: dict):
    pw = tenant_env(t["slug"]).get("ADMIN_PASSWORD")
    if not pw:
        raise HTTPException(500, "No hay credenciales de administrador para esta empresa")
    return httpx.AsyncClient(base_url=f"http://127.0.0.1:{t['web_port']}/api/v1", auth=("admin", pw), timeout=20, headers={"X-Skip-Duplicate-Check": "true"})


async def probe(t: dict) -> dict:
    started = time.time()
    try:
        async with espo(t) as c:
            r = await c.get("/App/user", timeout=4)
        v = None
        try:
            async with httpx.AsyncClient(timeout=3) as c2:
                v = (await c2.get(f"http://127.0.0.1:{t['web_port']}/client/custom/version.json")).json().get("version")
        except Exception:
            pass
        return {"up": r.status_code == 200, "ms": int((time.time() - started) * 1000), "version": v}
    except Exception:
        return {"up": False, "ms": None, "version": None}


def stats(t: dict) -> dict:
    try:
        url = DATABASE_URL.rsplit("/", 1)[0] + "/" + t["db_name"]
        with psycopg.connect(url, autocommit=True, connect_timeout=3) as c:
            users = c.execute("""SELECT count(*) FROM "user" WHERE deleted=false AND is_active AND type IN ('admin','regular') AND user_name <> %s""", (SUPPORT_USER,)).fetchone()[0]
            leads = c.execute("SELECT count(*) FROM lead WHERE deleted=false").fetchone()[0]
            last = c.execute("""SELECT max(a.created_at) FROM auth_log_record a WHERE a.is_denied=false AND a.username <> %s AND a.username <> 'hub-api'""", (SUPPORT_USER,)).fetchone()[0]
        return {"users": users, "leads": leads, "lastLogin": last.isoformat() if last else None}
    except Exception:
        return {"users": None, "leads": None, "lastLogin": None}


@app.get("/api/companies")
async def companies(actor: str = Depends(me)):
    with db() as c:
        rows = c.execute("SELECT * FROM tenants ORDER BY CASE kind WHEN 'dev' THEN 0 WHEN 'prod' THEN 1 ELSE 2 END, created_at").fetchall()
        cur = c.execute("SELECT id FROM control_releases WHERE is_current").fetchone()
    health = await asyncio.gather(*[probe(t) for t in rows])
    out = []
    for t, h in zip(rows, health):
        out.append({"slug": t["slug"], "name": t["name"], "kind": t["kind"], "host": t["host"], "status": t["status"], "plan": t["plan"], "maxUsers": t["max_users"],
                    "license": t["license_until"].isoformat() if t["license_until"] else None, "release": t["release_id"], "createdAt": t["created_at"].isoformat(),
                    "health": h, "stats": await asyncio.to_thread(stats, t)})
    return {"items": out, "currentRelease": cur["id"] if cur else None}


# ---------------------------------------------------------------- trabajos
SLUG_RE = r"^[a-z][a-z0-9-]{1,30}$"


class CreateReq(BaseModel):
    slug: str = Field(pattern=SLUG_RE)
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(max_length=190)
    host: Optional[str] = None
    plan: str = "standard"
    max_users: int = Field(10, ge=1, le=500)
    license_until: Optional[str] = None


def enqueue(kind: str, params: dict, actor: str) -> int:
    with db() as c:
        return c.execute("INSERT INTO control_jobs (kind, params, created_by) VALUES (%s,%s,%s) RETURNING id", (kind, json.dumps(params), actor)).fetchone()["id"]


@app.post("/api/companies")
def create_company(req: CreateReq, actor: str = Depends(me)):
    host = (req.host or f"{req.slug}.{BASE_DOMAIN}").strip().lower()
    jid = enqueue("create", {"slug": req.slug, "name": req.name.strip(), "email": req.email.strip(), "host": host, "plan": req.plan,
                             "max_users": req.max_users, "license_until": req.license_until or ""}, actor)
    audit(actor, "crear_empresa", req.slug, {"host": host, "job": jid})
    return {"job": jid}


@app.post("/api/companies/{slug}/upgrade")
def upgrade_company(slug: str, actor: str = Depends(me)):
    t = get_tenant(slug)
    jid = enqueue("upgrade", {"slug": t["slug"]}, actor)
    audit(actor, "actualizar_empresa", slug, {"job": jid})
    return {"job": jid}


@app.post("/api/companies/{slug}/power/{action}")
def power_company(slug: str, action: str, actor: str = Depends(me)):
    if action not in ("suspend", "resume"):
        raise HTTPException(404, "Acción desconocida")
    t = get_tenant(slug)
    jid = enqueue(action, {"slug": t["slug"]}, actor)
    audit(actor, "suspender_empresa" if action == "suspend" else "reactivar_empresa", slug, {"job": jid})
    return {"job": jid}


class NameReq(BaseModel):
    name: str = Field(min_length=2, max_length=80)


@app.put("/api/companies/{slug}/name")
async def rename_company(slug: str, req: NameReq, actor: str = Depends(me)):
    """Nombre que ven los usuarios de la empresa (el sistema siempre se muestra como Crm Hub 360)."""
    t = get_tenant(slug)
    name = req.name.strip()
    if re.search(r"[<>\\'\"`;]", name):
        raise HTTPException(400, "El nombre no puede llevar comillas ni símbolos < > ;")
    async with espo(t) as c:
        r = await c.put("/Settings", json={"applicationName": name})
    if r.status_code != 200:
        raise HTTPException(502, "No se pudo actualizar el nombre en la empresa")
    with db() as c:
        c.execute("UPDATE tenants SET name=%s WHERE slug=%s", (name, slug))
    audit(actor, "renombrar_empresa", slug, {"nombre": name})
    return {"name": name}


class ReleaseReq(BaseModel):
    note: str = Field("", max_length=120)


@app.post("/api/releases")
def publish_release(req: ReleaseReq, actor: str = Depends(me)):
    jid = enqueue("release", {"note": req.note.replace("'", "").replace("\n", " ")}, actor)
    audit(actor, "publicar_base", None, {"job": jid})
    return {"job": jid}


@app.get("/api/releases")
def releases(actor: str = Depends(me)):
    with db() as c:
        rows = c.execute("SELECT id, note, commit_ref, is_current, created_at FROM control_releases ORDER BY created_at DESC LIMIT 30").fetchall()
        use = c.execute("SELECT release_id, count(*) n FROM tenants WHERE kind='client' GROUP BY 1").fetchall()
    counts = {r["release_id"]: r["n"] for r in use}
    return {"items": [{"id": r["id"], "note": r["note"], "commit": r["commit_ref"], "current": r["is_current"], "createdAt": r["created_at"].isoformat(), "companies": counts.get(r["id"], 0)} for r in rows]}


MASK = re.compile(r"(Admin:\s+admin / )\S+")


@app.get("/api/jobs")
def jobs(limit: int = 15, actor: str = Depends(me)):
    with db() as c:
        rows = c.execute("SELECT id, kind, params, status, created_by, created_at, finished_at FROM control_jobs ORDER BY id DESC LIMIT %s", (min(limit, 50),)).fetchall()
    return {"items": [{"id": r["id"], "kind": r["kind"], "target": (r["params"] or {}).get("slug") or (r["params"] or {}).get("note"), "status": r["status"], "by": r["created_by"],
                       "createdAt": r["created_at"].isoformat(), "finishedAt": r["finished_at"].isoformat() if r["finished_at"] else None} for r in rows]}


@app.get("/api/jobs/{jid}")
def job(jid: int, actor: str = Depends(me)):
    with db() as c:
        r = c.execute("SELECT id, kind, status, log, result FROM control_jobs WHERE id=%s", (jid,)).fetchone()
    if not r:
        raise HTTPException(404, "Trabajo no encontrado")
    return {"id": r["id"], "kind": r["kind"], "status": r["status"], "log": MASK.sub(r"\1••••••••", r["log"])[-20000:], "result": r["result"]}


@app.get("/api/audit")
def audit_log(limit: int = 40, actor: str = Depends(me)):
    with db() as c:
        rows = c.execute("SELECT at, actor, action, target, detail FROM control_audit ORDER BY id DESC LIMIT %s", (min(limit, 200),)).fetchall()
    return {"items": [{"at": r["at"].isoformat(), "actor": r["actor"], "action": r["action"], "target": r["target"], "detail": r["detail"]} for r in rows]}


# ---------------------------------------------------------------- usuarios, claves y modo lectura
def new_password(n: int = 14) -> str:
    alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(n - 2)) + secrets.choice("!#$%*+-=?") + secrets.choice("23456789")


@app.get("/api/companies/{slug}/users")
async def company_users(slug: str, actor: str = Depends(me)):
    t = get_tenant(slug)
    async with espo(t) as c:
        r = await c.get("/User", params={"maxSize": 200, "select": "userName,name,type,isActive,emailAddress", "orderBy": "userName"})
    if r.status_code != 200:
        raise HTTPException(502, "La empresa no respondió")
    items = [u for u in r.json().get("list", []) if u["userName"] not in (SUPPORT_USER, "system")]
    return {"items": [{"id": u["id"], "userName": u["userName"], "name": u.get("name"), "type": u["type"], "active": u["isActive"], "email": u.get("emailAddress")} for u in items]}


class PwReq(BaseModel):
    password: Optional[str] = Field(None, min_length=10, max_length=60)


@app.post("/api/companies/{slug}/users/{uid}/password")
async def reset_password(slug: str, uid: str, req: PwReq, actor: str = Depends(me)):
    t = get_tenant(slug)
    if not re.match(r"^[0-9a-f]{10,24}$", uid):
        raise HTTPException(400, "Usuario inválido")
    pw = req.password or new_password()
    async with espo(t) as c:
        u = await c.get(f"/User/{uid}", params={"select": "userName,type"})
        if u.status_code != 200 or u.json().get("type") not in ("admin", "regular"):
            raise HTTPException(404, "Usuario no encontrado")
        r = await c.put(f"/User/{uid}", json={"password": pw, "passwordConfirm": pw})
    if r.status_code != 200:
        why = r.headers.get("X-Status-Reason") or ""
        raise HTTPException(502, "No se pudo cambiar la contraseña" + (f": {why}" if why else ""))
    # la clave de «admin» la usa el propio Centro para gestionar la empresa: se mantiene sincronizada en tenants/<slug>/.env
    if u.json().get("userName") == "admin":
        path = f"{TENANTS_DIR}/{slug}/.env"
        txt = open(path, encoding="utf8").read()
        open(path, "w", encoding="utf8").write(re.sub(r"(?m)^ADMIN_PASSWORD=.*$", lambda m: "ADMIN_PASSWORD=" + pw, txt))
    audit(actor, "cambiar_clave", slug, {"usuario": u.json().get("userName")})
    return {"userName": u.json().get("userName"), "password": pw}


@app.get("/api/companies/{slug}/admin-credentials")
def admin_credentials(slug: str, actor: str = Depends(me)):
    t = get_tenant(slug)
    pw = tenant_env(slug).get("ADMIN_PASSWORD")
    audit(actor, "ver_credencial_admin", slug)
    return {"userName": "admin", "password": pw, "url": f"https://{t['host']}"}


SCOPES = ["Lead", "Account", "Contact", "Opportunity", "Task", "Call", "Meeting", "Email", "Note", "Campaign", "Document", "Case", "KnowledgeBaseArticle"]


@app.post("/api/companies/{slug}/support-link")
async def support_link(slug: str, actor: str = Depends(me)):
    t = get_tenant(slug)
    if t["status"] != "active":
        raise HTTPException(409, "La empresa está suspendida")
    pw = new_password(16)
    async with espo(t) as c:
        role = (await c.get("/Role", params={"where[0][type]": "equals", "where[0][attribute]": "name", "where[0][value]": "Soporte (solo lectura)", "select": "id"})).json().get("list", [])
        if role:
            role_id = role[0]["id"]
        else:
            data = {s: {"create": "no", "read": "all", "edit": "no", "delete": "no", "stream": "all"} for s in SCOPES}
            rr = await c.post("/Role", json={"name": "Soporte (solo lectura)", "data": data, "assignmentPermission": "no", "userPermission": "no", "portalPermission": "no",
                                             "groupEmailAccountPermission": "no", "exportPermission": "no", "massUpdatePermission": "no", "dataPrivacyPermission": "no", "auditPermission": "no"})
            if rr.status_code != 200:
                raise HTTPException(502, "No se pudo crear el rol de solo lectura")
            role_id = rr.json()["id"]
        us = (await c.get("/User", params={"where[0][type]": "equals", "where[0][attribute]": "userName", "where[0][value]": SUPPORT_USER, "select": "id"})).json().get("list", [])
        if us:
            r = await c.put(f"/User/{us[0]['id']}", json={"password": pw, "passwordConfirm": pw, "isActive": True, "rolesIds": [role_id]})
        else:
            r = await c.post("/User", json={"userName": SUPPORT_USER, "firstName": "Soporte", "lastName": "(solo lectura)", "type": "regular", "isActive": True,
                                            "password": pw, "passwordConfirm": pw, "rolesIds": [role_id]})
        if r.status_code != 200:
            raise HTTPException(502, "No se pudo preparar el usuario de lectura")
    code = secrets.token_urlsafe(24)
    with db() as c:
        c.execute("DELETE FROM support_codes WHERE expires_at < now() OR slug=%s", (slug,))
        c.execute("INSERT INTO support_codes (code, slug, user_name, password, expires_at) VALUES (%s,%s,%s,%s, now() + interval '90 seconds')", (code, slug, SUPPORT_USER, pw))
    audit(actor, "entrar_modo_lectura", slug)
    return {"url": f"https://{t['host']}/?support={code}"}


# ---------------------------------------------------------------- interfaz
STATIC = os.path.join(os.path.dirname(__file__), "static")


@app.get("/")
def index():
    return FileResponse(os.path.join(STATIC, "index.html"), headers={"Cache-Control": "no-store"})


app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers.update({"X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
                         "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'",
                         "Cache-Control": resp.headers.get("Cache-Control", "no-store")})
    return resp


if __name__ == "__main__":
    uvicorn.run(app, host=BIND_HOST, port=PORT, log_level="info", proxy_headers=False)
