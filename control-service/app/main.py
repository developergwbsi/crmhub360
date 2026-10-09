"""Crm Hub 360 - Centro de control: crear y vigilar empresas, restablecer claves y entrar en modo lectura.
No ejecuta nada privilegiado: encola trabajos que realiza `bin/control-worker` en el servidor."""
import asyncio, base64, hashlib, hmac, json, os, re, secrets, smtplib, ssl, time
from email.message import EmailMessage
from typing import Optional

import httpx
import psycopg
import uvicorn
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from psycopg.rows import dict_row
from pydantic import BaseModel, Field

from . import welcome as welcome_tpl

DATABASE_URL = os.environ["DATABASE_URL"]
USER = os.environ["CONTROL_USER"]
PASS_HASH = os.environ["CONTROL_PASSWORD_HASH"]          # scrypt:<salt_b64>:<hash_b64>
SECRET = os.environ["CONTROL_SESSION_SECRET"].encode()
BASE_DOMAIN = os.environ["BASE_DOMAIN"]
BIND_HOST, PORT = os.environ.get("CONTROL_BIND_HOST", "127.0.0.1"), int(os.environ.get("CONTROL_PORT", "8195"))
TENANTS_DIR = "/tenants"
SESSION_TTL = 12 * 3600
SUPPORT_USER = "soporte-lectura"
CONTROL_EMAIL = os.environ.get("CONTROL_EMAIL", "")
CONTROL_HOST = os.environ.get("CONTROL_HOST", "")

app = FastAPI(title="Crm Hub 360 · Centro de control", docs_url=None, redoc_url=None, openapi_url=None)


def db():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row, autocommit=True)


def audit(actor, action, target=None, detail=None):
    with db() as c:
        c.execute("INSERT INTO control_audit (actor, action, target, detail) VALUES (%s,%s,%s,%s)", (actor, action, target, json.dumps(detail or {})))


# ---------------------------------------------------------------- ajustes (BD)
def get_setting(key: str, default=None):
    with db() as c:
        r = c.execute("SELECT value FROM control_settings WHERE key=%s", (key,)).fetchone()
    return r["value"] if r else default


def put_setting(key: str, value) -> None:
    with db() as c:
        c.execute("INSERT INTO control_settings (key, value) VALUES (%s,%s) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()", (key, json.dumps(value)))


def account() -> dict:
    """Cuenta del superadmin: la contraseña/correo cambiados desde el Centro (BD) mandan sobre los valores iniciales del .env."""
    a = get_setting("admin", {}) or {}
    return {"hash": a.get("hash") or PASS_HASH, "email": a.get("email") or CONTROL_EMAIL, "name": a.get("name") or "Superadministrador"}


def hash_password(pw: str) -> str:
    salt = os.urandom(16)
    h = hashlib.scrypt(pw.encode(), salt=salt, n=2 ** 14, r=8, p=1, dklen=32)
    return "scrypt:" + base64.b64encode(salt).decode() + ":" + base64.b64encode(h).decode()


# ---------------------------------------------------------------- sesión
def verify_password(pw: str) -> bool:
    try:
        _, salt, h = account()["hash"].split(":")
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
    a = account()
    return {"user": actor, "name": a["name"], "email": a["email"], "baseDomain": BASE_DOMAIN}


@app.get("/api/hello")
def hello():
    """Datos públicos mínimos para la pantalla de bienvenida (sin revelar nada sensible)."""
    mm = get_setting("mail") or {}
    return {"mailReady": bool(mm.get("host")) and mm.get("enabled", True)}


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
                    "profile": (t["settings"] or {}).get("profile") or {}, "health": h, "stats": await asyncio.to_thread(stats, t)})
    return {"items": out, "currentRelease": cur["id"] if cur else None}


# ---------------------------------------------------------------- trabajos
SLUG_RE = r"^[a-z][a-z0-9-]{1,30}$"


class CreateReq(BaseModel):
    slug: str = Field(pattern=SLUG_RE)
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(max_length=190)
    admin_first: str = Field("", max_length=60)
    admin_last: str = Field("", max_length=60)
    phone: str = Field("", max_length=30)
    country: str = Field("", max_length=2)
    city: str = Field("", max_length=60)
    send_welcome: bool = True
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
                             "max_users": req.max_users, "license_until": req.license_until or "",
                             "admin_first": req.admin_first.strip(), "admin_last": req.admin_last.strip(), "phone": req.phone.strip(), "country": req.country.strip().upper(),
                             "city": req.city.strip(), "send_welcome": req.send_welcome}, actor)
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




# ---------------------------------------------------------------- correos del Centro a las empresas (bienvenida, pago, reingreso…)
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]


def fecha_es(iso: str) -> str:
    try:
        y, mo, d = (int(x) for x in str(iso)[:10].split("-"))
        return f"{d} de {MESES[mo - 1]} de {y}"
    except Exception:
        return str(iso or "")


def tpl_overrides() -> dict:
    o = dict(get_setting("email_templates", {}) or {})
    legacy = get_setting("welcome", {}) or {}
    if legacy and "welcome" not in o:
        o["welcome"] = legacy
    return o


def tpl_view(key: str) -> dict:
    base, o = welcome_tpl.TEMPLATES[key], tpl_overrides().get(key) or {}
    return {"key": key, "name": base["name"], "icon": base["icon"], "desc": base["desc"], "fields": base["fields"], "credentials": base["credentials"],
            "subject": o.get("subject") or base["subject"], "html": o.get("html") or base["html"], "custom": bool(o), "markers": welcome_tpl.MARKERS_BASE + [f["key"] for f in base["fields"]]}


@app.get("/api/mail-templates")
def list_mail_templates(actor: str = Depends(me)):
    return {"items": [tpl_view(k) for k in welcome_tpl.TEMPLATES], "sample": welcome_tpl.SAMPLE}


class TplReq(BaseModel):
    subject: str = Field(min_length=3, max_length=200)
    html: str = Field(min_length=50, max_length=60000)


@app.put("/api/mail-templates/{key}")
def save_mail_template(key: str, req: TplReq, actor: str = Depends(me)):
    if key not in welcome_tpl.TEMPLATES:
        raise HTTPException(404, "Plantilla desconocida")
    low = req.html.lower()
    if "<script" in low or "javascript:" in low or re.search(r"\son\w+\s*=", low):
        raise HTTPException(400, "La plantilla no puede llevar scripts ni eventos (los correos no los admiten)")
    o = dict(get_setting("email_templates", {}) or {})
    o[key] = {"subject": req.subject.strip(), "html": req.html}
    put_setting("email_templates", o)
    if key == "welcome":
        put_setting("welcome", o[key])   # el ejecutor de creación de empresas lee esta clave
    audit(actor, "guardar_plantilla_correo", key)
    return tpl_view(key)


@app.delete("/api/mail-templates/{key}")
def reset_mail_template(key: str, actor: str = Depends(me)):
    if key not in welcome_tpl.TEMPLATES:
        raise HTTPException(404, "Plantilla desconocida")
    o = dict(get_setting("email_templates", {}) or {})
    o.pop(key, None)
    put_setting("email_templates", o)
    if key == "welcome":
        with db() as c:
            c.execute("DELETE FROM control_settings WHERE key='welcome'")
    audit(actor, "restablecer_plantilla_correo", key)
    return tpl_view(key)


class TplTestReq(BaseModel):
    to: str
    subject: str = ""
    html: str = ""


@app.post("/api/mail-templates/{key}/test")
async def test_mail_template(key: str, req: TplTestReq, actor: str = Depends(me)):
    if key not in welcome_tpl.TEMPLATES:
        raise HTTPException(404, "Plantilla desconocida")
    m = get_setting("mail") or {}
    if not m.get("host") or not m.get("enabled", True):
        raise HTTPException(400, "Configura y activa el correo general para enviar pruebas")
    v = tpl_view(key)
    html_s = welcome_tpl.render(req.html or v["html"], welcome_tpl.SAMPLE)
    try:
        await asyncio.to_thread(smtp_send, m, req.to.strip(), "[Prueba] " + welcome_tpl.render(req.subject or v["subject"], welcome_tpl.SAMPLE), welcome_tpl.plain(html_s), html_s, "Crm Hub 360")
    except Exception as e:
        raise HTTPException(502, "No se pudo enviar: " + str(e)[:200])
    audit(actor, "probar_plantilla_correo", key, {"para": req.to})
    return {"ok": True}


async def company_context(t: dict) -> dict:
    prof = (t["settings"] or {}).get("profile") or {}
    st = await asyncio.to_thread(stats, t)
    email = prof.get("email")
    first, last = prof.get("first") or "", prof.get("last") or ""
    if not email or not first:
        try:
            async with espo(t) as c:
                r = await c.get("/User", params={"where[0][type]": "equals", "where[0][attribute]": "userName", "where[0][value]": "admin", "select": "firstName,lastName,emailAddress"})
            u = (r.json().get("list") or [{}])[0]
            email, first, last = email or u.get("emailAddress"), first or u.get("firstName") or "", last or u.get("lastName") or ""
        except Exception:
            pass
    days = None
    if st.get("lastLogin"):
        try:
            days = max(0, int((time.time() - time.mktime(time.strptime(st["lastLogin"][:19], "%Y-%m-%dT%H:%M:%S"))) / 86400))
        except Exception:
            days = None
    lic = t["license_until"].isoformat() if t["license_until"] else ""
    left = ""
    if lic:
        try:
            left = str(max(0, int((time.mktime(time.strptime(lic, "%Y-%m-%d")) - time.time()) / 86400)))
        except Exception:
            left = ""
    countries = {"CO": "Colombia", "MX": "México", "PE": "Perú", "CL": "Chile", "AR": "Argentina", "EC": "Ecuador", "PA": "Panamá", "CR": "Costa Rica", "DO": "República Dominicana", "GT": "Guatemala", "UY": "Uruguay", "PY": "Paraguay", "BO": "Bolivia", "VE": "Venezuela", "ES": "España", "US": "Estados Unidos"}
    return {"admin_email": email, "data": {"nombre": first or "equipo", "apellido": last, "empresa": t["name"], "url": f"https://{t['host']}", "usuario": "admin", "ciudad": prof.get("city") or "",
            "pais": countries.get(prof.get("country", ""), ""), "plan": t["plan"], "dias": str(days) if days is not None else "varios", "leads": str(st.get("leads") if st.get("leads") is not None else "—"),
            "usuarios": str(st.get("users") if st.get("users") is not None else "—"), "vencimiento": fecha_es(lic), "dias_restantes": left or "—", "anio": time.strftime("%Y")}}


class SendMailReq(BaseModel):
    template: str
    to_mode: str = "admin"          # admin | all | custom
    to_custom: str = ""
    values: dict = {}
    subject: str = ""
    html: str = ""


def _values(key: str, ctx: dict, given: dict) -> dict:
    out = {}
    for f in welcome_tpl.TEMPLATES[key]["fields"]:
        v = str(given.get(f["key"], "") or "")
        if not v:
            v = welcome_tpl.render(f.get("default", ""), ctx["data"])
        if f.get("required") and not v.strip():
            raise HTTPException(400, f"Falta: {f['label']}")
        out[f["key"]] = fecha_es(v) if f.get("type") == "date" and re.match(r"^\d{4}-\d{2}-\d{2}$", v) else v
    if not out.get("enlace_pago") and "enlace_pago" in out:
        out["enlace_pago"] = ctx["data"]["url"]
    return out


@app.post("/api/companies/{slug}/mail-preview")
async def preview_mail(slug: str, req: SendMailReq, actor: str = Depends(me)):
    if req.template not in welcome_tpl.TEMPLATES:
        raise HTTPException(404, "Plantilla desconocida")
    t = get_tenant(slug)
    ctx, v = await company_context(t), tpl_view(req.template)
    data = {**ctx["data"], **_values(req.template, ctx, req.values), "clave": "••••••••"}
    return {"subject": welcome_tpl.render(req.subject or v["subject"], data), "html": welcome_tpl.render(req.html or v["html"], data), "to": ctx["admin_email"]}


@app.post("/api/companies/{slug}/send-mail")
async def send_company_mail(slug: str, req: SendMailReq, actor: str = Depends(me)):
    if req.template not in welcome_tpl.TEMPLATES:
        raise HTTPException(404, "Plantilla desconocida")
    t = get_tenant(slug)
    mail = get_setting("mail") or {}
    if not mail.get("host") or not mail.get("enabled", True):
        raise HTTPException(400, "Configura y activa el correo general (pestaña «Correo general») para enviar correos")
    ctx, v = await company_context(t), tpl_view(req.template)
    vals = _values(req.template, ctx, req.values)
    creds = welcome_tpl.TEMPLATES[req.template]["credentials"]
    if creds and req.to_mode == "all":
        raise HTTPException(400, "La bienvenida lleva credenciales: envíala solo al administrador o a un correo concreto")
    recipients: list = []
    if req.to_mode == "custom":
        if not re.match(r"^[^@\s]{1,64}@[^@\s]{1,120}\.[A-Za-z]{2,}$", req.to_custom.strip()):
            raise HTTPException(400, "Escribe un correo válido")
        recipients = [(req.to_custom.strip(), ctx["data"]["nombre"])]
    elif req.to_mode == "all":
        async with espo(t) as c:
            r = await c.get("/User", params={"maxSize": 200, "select": "userName,firstName,emailAddress,type,isActive"})
        recipients = [(u["emailAddress"], u.get("firstName") or "equipo") for u in r.json().get("list", []) if u.get("emailAddress") and u.get("isActive") and u.get("type") in ("admin", "regular") and u["userName"] != SUPPORT_USER]
        if not recipients:
            raise HTTPException(400, "Ningún usuario activo tiene correo")
    else:
        if not ctx["admin_email"]:
            raise HTTPException(400, "El administrador no tiene correo registrado: usa «Otro correo»")
        recipients = [(ctx["admin_email"], ctx["data"]["nombre"])]
    clave = tenant_env(slug).get("ADMIN_PASSWORD", "") if creds else ""
    sent, failed = [], []
    for addr, first in recipients:
        data = {**ctx["data"], **vals, "nombre": first, "clave": clave}
        html_s = welcome_tpl.render(req.html or v["html"], data)
        try:
            await asyncio.to_thread(smtp_send, mail, addr, welcome_tpl.render(req.subject or v["subject"], data), welcome_tpl.plain(html_s), html_s, "Crm Hub 360")
            sent.append(addr)
        except Exception as e:
            failed.append({"to": addr, "error": str(e)[:120]})
    audit(actor, "enviar_correo", slug, {"plantilla": req.template, "enviados": len(sent), "fallidos": len(failed), "para": sent[:5]})
    if not sent:
        raise HTTPException(502, "No se pudo enviar: " + (failed[0]["error"] if failed else "sin destinatarios"))
    return {"sent": sent, "failed": failed}


@app.get("/api/companies/{slug}/mail-history")
def mail_history(slug: str, actor: str = Depends(me)):
    get_tenant(slug)
    with db() as c:
        rows = c.execute("SELECT at, actor, detail FROM control_audit WHERE action='enviar_correo' AND target=%s ORDER BY id DESC LIMIT 8", (slug,)).fetchall()
    return {"items": [{"at": r["at"].isoformat(), "by": r["actor"], "template": (r["detail"] or {}).get("plantilla"), "sent": (r["detail"] or {}).get("enviados"), "to": (r["detail"] or {}).get("para")} for r in rows]}


@app.post("/api/companies/{slug}/welcome")
def resend_welcome(slug: str, actor: str = Depends(me)):
    t = get_tenant(slug)
    jid = enqueue("welcome", {"slug": t["slug"]}, actor)
    audit(actor, "reenviar_bienvenida", slug, {"job": jid})
    return {"job": jid}


# ---------------------------------------------------------------- mi cuenta, recuperación de clave
class AccountPwReq(BaseModel):
    current: str
    new: str = Field(min_length=10, max_length=80)


@app.post("/api/account/password")
def change_my_password(req: AccountPwReq, actor: str = Depends(me)):
    if not verify_password(req.current):
        raise HTTPException(400, "La contraseña actual no es correcta")
    a = get_setting("admin", {}) or {}
    a["hash"] = hash_password(req.new)
    put_setting("admin", a)
    audit(actor, "cambiar_mi_clave")
    return {"ok": True}


class AccountReq(BaseModel):
    email: str = Field(max_length=190)
    name: str = Field("Superadministrador", max_length=80)


@app.put("/api/account")
def update_account(req: AccountReq, actor: str = Depends(me)):
    if not re.match(r"^[^@\s]{1,64}@[^@\s]{1,120}\.[A-Za-z]{2,}$", req.email):
        raise HTTPException(400, "Correo inválido")
    a = get_setting("admin", {}) or {}
    a.update({"email": req.email.strip(), "name": req.name.strip() or "Superadministrador"})
    put_setting("admin", a)
    audit(actor, "actualizar_mi_cuenta")
    return {"ok": True}


def smtp_send(cfg: dict, to: str, subject: str, text: str, html: Optional[str] = None, from_name: Optional[str] = None) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{from_name or cfg.get('from_name') or 'Crm Hub 360'} <{cfg['from_address']}>"
    msg["To"] = to
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
    port = int(cfg.get("port") or 587)
    sec = cfg.get("security") or "TLS"
    ctx = ssl.create_default_context()
    if sec == "SSL":
        srv = smtplib.SMTP_SSL(cfg["host"], port, timeout=15, context=ctx)
    else:
        srv = smtplib.SMTP(cfg["host"], port, timeout=15)
        if sec == "TLS":
            srv.starttls(context=ctx)
    try:
        if cfg.get("user"):
            srv.login(cfg["user"], cfg.get("password") or "")
        srv.send_message(msg)
    finally:
        try:
            srv.quit()
        except Exception:
            pass


class ForgotReq(BaseModel):
    user: str
    email: str


@app.post("/api/forgot")
async def forgot(req: ForgotReq, request: Request):
    if request.headers.get("x-cc") != "1":
        raise HTTPException(403, "Solicitud no permitida")
    ip, now = client_ip(request), time.time()
    recent = [t for t in _fails.get("f" + ip, []) if now - t < 900]
    if len(recent) >= 5:
        raise HTTPException(429, "Demasiados intentos. Espera unos minutos.")
    _fails["f" + ip] = recent + [now]
    a, mail = account(), get_setting("mail") or {}
    ok = hmac.compare_digest(req.user.strip().encode(), USER.encode()) & hmac.compare_digest(req.email.strip().lower().encode(), (a["email"] or "").lower().encode())
    if ok and mail.get("host") and mail.get("enabled", True):
        token = secrets.token_urlsafe(32)
        with db() as c:
            c.execute("DELETE FROM control_resets WHERE expires_at < now()")
            c.execute("INSERT INTO control_resets (token_hash, expires_at) VALUES (%s, now() + interval '30 minutes')", (hashlib.sha256(token.encode()).hexdigest(),))
        link = f"https://{CONTROL_HOST}/?reset={token}"
        try:
            await asyncio.to_thread(smtp_send, mail, a["email"], "Recupera tu acceso al Centro de control",
                                    f"Hola,\n\nPara crear una nueva contraseña del Centro de control usa este enlace (vale 30 minutos):\n{link}\n\nSi no lo pediste, ignora este mensaje.\n\nCrm Hub 360")
        except Exception as e:  # el aviso al usuario es siempre el mismo para no revelar datos
            audit("sistema", "recuperacion_correo_fallido", None, {"error": str(e)[:150]})
        audit("sistema", "recuperacion_solicitada", ip)
    else:
        audit(req.user[:40], "recuperacion_datos_incorrectos", ip)
    return {"ok": True}


class ResetReq(BaseModel):
    token: str
    password: str = Field(min_length=10, max_length=80)


@app.post("/api/reset")
def reset_password_with_token(req: ResetReq, request: Request):
    if request.headers.get("x-cc") != "1":
        raise HTTPException(403, "Solicitud no permitida")
    h = hashlib.sha256(req.token.encode()).hexdigest()
    with db() as c:
        row = c.execute("DELETE FROM control_resets WHERE token_hash=%s AND expires_at > now() RETURNING token_hash", (h,)).fetchone()
    if not row:
        raise HTTPException(400, "El enlace no es válido o ya venció. Solicita uno nuevo.")
    a = get_setting("admin", {}) or {}
    a["hash"] = hash_password(req.password)
    put_setting("admin", a)
    audit("sistema", "clave_restablecida", client_ip(request))
    return {"ok": True}


# ---------------------------------------------------------------- correo general (SMTP del sistema)
MAIL_SECRET = "password"


def mask_mail(m: dict) -> dict:
    out = {k: v for k, v in m.items() if k != MAIL_SECRET}
    pw = m.get(MAIL_SECRET) or ""
    out["passwordSet"] = bool(pw)
    out["passwordHint"] = ("…" + pw[-3:]) if pw else ""
    return out


class MailReq(BaseModel):
    host: str = Field(max_length=190)
    port: int = Field(587, ge=1, le=65535)
    security: str = "TLS"
    user: str = Field("", max_length=190)
    password: str = Field("", max_length=190)
    from_address: str = Field(max_length=190)
    from_name: str = Field("Crm Hub 360", max_length=80)


def companies_using_mail() -> list:
    with db() as c:
        rows = c.execute("SELECT slug, name FROM tenants").fetchall()
    return [{"slug": r["slug"], "name": r["name"]} for r in rows if services_of(r["slug"]).get("mail") == "shared"]


@app.get("/api/settings/mail")
def get_mail(actor: str = Depends(me)):
    m = get_setting("mail", {}) or {}
    return dict(mask_mail(m), enabled=bool(m) and m.get("enabled", True), configured=bool(m.get("host")), companies=companies_using_mail())


@app.put("/api/settings/mail")
def put_mail(req: MailReq, actor: str = Depends(me)):
    if req.security not in ("TLS", "SSL", ""):
        raise HTTPException(400, "Seguridad inválida")
    if not re.match(r"^[^@\s]{1,64}@[^@\s]{1,120}\.[A-Za-z]{2,}$", req.from_address):
        raise HTTPException(400, "Correo remitente inválido")
    old = get_setting("mail", {}) or {}
    d = req.model_dump()
    d["host"] = d["host"].strip()
    if "gmail" in d["host"] or "google" in d["host"]:   # Google muestra la contraseña de aplicación en bloques con espacios
        d[MAIL_SECRET] = d[MAIL_SECRET].replace(" ", "")
    if not d[MAIL_SECRET]:
        d[MAIL_SECRET] = old.get(MAIL_SECRET, "")
    d["enabled"] = True
    put_setting("mail", d)
    audit(actor, "guardar_correo_general")
    return dict(mask_mail(d), enabled=True, configured=True, companies=companies_using_mail())


class MailEnabledReq(BaseModel):
    enabled: bool


@app.put("/api/settings/mail/enabled")
async def mail_enabled(req: MailEnabledReq, actor: str = Depends(me)):
    """Activa o desactiva el correo general. Al desactivarlo se retira de las empresas a las que se les había prestado."""
    m = get_setting("mail", {}) or {}
    if not m.get("host"):
        raise HTTPException(400, "Aún no hay un correo configurado")
    affected = []
    if not req.enabled:
        for c in companies_using_mail():
            await set_company_mail(get_tenant(c["slug"]), "own")
            sv = services_of(c["slug"]); sv["mail"] = "own"; put_setting("services:" + c["slug"], sv)
            affected.append(c["name"])
    m["enabled"] = req.enabled
    put_setting("mail", m)
    audit(actor, "activar_correo_general" if req.enabled else "desactivar_correo_general", None, {"empresas": affected})
    return {"enabled": req.enabled, "affected": affected}


class MailTestReq(BaseModel):
    to: str


@app.post("/api/settings/mail/test")
async def test_mail(req: MailTestReq, actor: str = Depends(me)):
    m = get_setting("mail") or {}
    if not m.get("host"):
        raise HTTPException(400, "Primero guarda la configuración de correo")
    try:
        await asyncio.to_thread(smtp_send, m, req.to.strip(), "Prueba de correo · Crm Hub 360", "Si lees esto, el correo general del Centro de control funciona.\n\nCrm Hub 360")
    except Exception as e:
        raise HTTPException(502, "No se pudo enviar: " + str(e)[:200])
    audit(actor, "probar_correo_general", req.to)
    return {"ok": True}


# ---------------------------------------------------------------- proveedores aliados (servicios que revendemos)
KINDS = {
    "evolution": {"label": "Evolution API (servidor propio)", "channels": ["whatsapp"], "secrets": ["apikey"]},
    "gupshup": {"label": "Gupshup (WhatsApp BSP)", "channels": ["whatsapp"], "secrets": ["api_key"]},
    "twilio": {"label": "Twilio (SMS, WhatsApp y voz)", "channels": ["whatsapp", "sms", "voice"], "secrets": ["auth_token"]},
    "generic_whatsapp": {"label": "Otro proveedor de WhatsApp (API HTTP)", "channels": ["whatsapp"], "secrets": ["auth_secret"]},
    "generic_sms": {"label": "Proveedor de SMS (API HTTP)", "channels": ["sms"], "secrets": ["auth_secret"]},
    "generic_voice": {"label": "Central / proveedor de llamadas (API HTTP)", "channels": ["voice"], "secrets": ["auth_secret"]},
    "email": {"label": "Proveedor de correo (SMTP: Gmail, Outlook, SendGrid…)", "channels": ["email"], "secrets": ["password"]},
}


def providers_list() -> list:
    return get_setting("providers", []) or []


def mask_provider(p: dict) -> dict:
    sec = KINDS.get(p["kind"], {}).get("secrets", [])
    f = {k: v for k, v in p.get("fields", {}).items() if k not in sec}
    for k in sec:
        v = p.get("fields", {}).get(k) or ""
        f[k] = ""; f[k + "_set"] = bool(v); f[k + "_hint"] = ("…" + v[-4:]) if v else ""
    return {"id": p["id"], "kind": p["kind"], "name": p["name"], "notes": p.get("notes", ""), "fields": f}


def services_of(slug: str) -> dict:
    return get_setting("services:" + slug, {}) or {}


@app.get("/api/providers")
def list_providers(actor: str = Depends(me)):
    uses: dict = {}
    with db() as c:
        slugs = [r["slug"] for r in c.execute("SELECT slug FROM tenants").fetchall()]
    for sl in slugs:
        for ch, v in services_of(sl).items():
            if isinstance(v, dict) and v.get("provider"):
                uses.setdefault(v["provider"], []).append(sl)
            elif ch == "mail" and isinstance(v, str) and v.startswith("p"):
                uses.setdefault(v, []).append(sl)
    return {"kinds": {k: {"label": v["label"], "channels": v["channels"]} for k, v in KINDS.items()},
            "items": [dict(mask_provider(p), companies=sorted(set(uses.get(p["id"], [])))) for p in providers_list()]}


class ProviderReq(BaseModel):
    kind: str
    name: str = Field(min_length=2, max_length=80)
    notes: str = Field("", max_length=300)
    fields: dict = {}


def _clean_fields(kind: str, fields: dict, old: dict) -> dict:
    out = {}
    for k, v in (fields or {}).items():
        if k.endswith("_set") or k.endswith("_hint"):
            continue
        if not isinstance(v, (str, int, float, bool)) or len(str(v)) > 4000:
            raise HTTPException(400, f"Valor inválido en «{k}»")
        out[k] = v
    for k in KINDS[kind]["secrets"]:
        if not out.get(k):
            out[k] = old.get(k, "")
    if kind == "email":
        if not out.get("host") or not re.match(r"^[^@\s]{1,64}@[^@\s]{1,120}\.[A-Za-z]{2,}$", str(out.get("from_address") or out.get("user") or "")):
            raise HTTPException(400, "Escribe el servidor SMTP y un correo remitente válido")
        out["host"] = str(out["host"]).strip()
        out["security"] = "" if out.get("security") in ("NONE", "", None) else out["security"]
        out["from_address"] = str(out.get("from_address") or out.get("user")).strip()
        if "gmail" in out["host"] or "google" in out["host"]:
            out["password"] = str(out.get("password", "")).replace(" ", "")
    return out


@app.put("/api/providers/{pid}")
def save_provider(pid: str, req: ProviderReq, actor: str = Depends(me)):
    if req.kind not in KINDS:
        raise HTTPException(400, "Tipo de proveedor desconocido")
    items = providers_list()
    cur = next((p for p in items if p["id"] == pid), None)
    if pid != "new" and not cur:
        raise HTTPException(404, "Proveedor no encontrado")
    if cur and cur["kind"] != req.kind:
        raise HTTPException(400, "No se puede cambiar el tipo de un proveedor existente")
    fields = _clean_fields(req.kind, req.fields, (cur or {}).get("fields", {}))
    if cur:
        cur.update({"name": req.name.strip(), "notes": req.notes.strip(), "fields": fields})
    else:
        cur = {"id": "p" + secrets.token_hex(4), "kind": req.kind, "name": req.name.strip(), "notes": req.notes.strip(), "fields": fields}
        items.append(cur)
    put_setting("providers", items)
    audit(actor, "guardar_proveedor", cur["id"], {"nombre": cur["name"]})
    return mask_provider(cur)


@app.delete("/api/providers/{pid}")
def delete_provider(pid: str, actor: str = Depends(me)):
    with db() as c:
        slugs = [r["slug"] for r in c.execute("SELECT slug FROM tenants").fetchall()]
    used = [sl for sl in slugs for v in services_of(sl).values() if (isinstance(v, dict) and v.get("provider") == pid) or v == pid]
    if used:
        raise HTTPException(409, "Está asignado a: " + ", ".join(sorted(set(used))) + ". Quítalo primero de esas empresas.")
    put_setting("providers", [p for p in providers_list() if p["id"] != pid])
    audit(actor, "borrar_proveedor", pid)
    return {"ok": True}


@app.post("/api/providers/{pid}/test")
async def test_provider_mail(pid: str, req: MailTestReq, actor: str = Depends(me)):
    p = next((x for x in providers_list() if x["id"] == pid and x["kind"] == "email"), None)
    if not p:
        raise HTTPException(404, "Proveedor de correo no encontrado")
    f = p["fields"]
    cfg = {"host": f["host"], "port": int(f.get("port") or 587), "security": f.get("security", "TLS"), "user": f.get("user", ""), "password": f.get("password", ""),
           "from_address": f["from_address"], "from_name": f.get("from_name") or "Crm Hub 360"}
    try:
        await asyncio.to_thread(smtp_send, cfg, req.to.strip(), "Prueba de correo · Crm Hub 360", f"Prueba del proveedor «{p['name']}».\n\nCrm Hub 360")
    except Exception as e:
        raise HTTPException(502, "No se pudo enviar: " + str(e)[:200])
    audit(actor, "probar_proveedor_correo", pid, {"para": req.to})
    return {"ok": True}


# claves de ajustes del Hub que gestiona cada canal (para poder retirarlas al quitar el servicio)
CHANNEL_KEYS = {
    "whatsapp": ["wa_provider", "evolution_url", "evolution_apikey", "evolution_instance", "gupshup_api_key", "gupshup_source", "gupshup_app_name", "twilio_wa_from", "generic_whatsapp"],
    "sms": ["sms_provider", "twilio_sms_from", "generic_sms"],
    "voice": ["voice_provider", "twilio_voice_from", "generic_voice"],
}
TWILIO_CORE = ["twilio_account_sid", "twilio_auth_token"]


def _generic(f: dict) -> dict:
    return {"url": f.get("url", ""), "method": f.get("method") or "POST", "auth_type": f.get("auth_type") or "none", "auth_user": f.get("auth_user", ""), "auth_secret": f.get("auth_secret", ""),
            "body_type": f.get("body_type") or "json", "body": f.get("body", ""), "headers": f.get("headers", ""), "sender": f.get("sender", "")}


def channel_settings(channel: str, prov: dict, svc: dict, t: dict) -> dict:
    f, kind = prov["fields"], prov["kind"]
    if channel == "whatsapp":
        if kind == "evolution":
            return {"wa_provider": "evolution", "evolution_url": f.get("url", ""), "evolution_apikey": f.get("apikey", ""), "evolution_instance": svc.get("instance") or t["slug"]}
        if kind == "gupshup":
            return {"wa_provider": "gupshup", "gupshup_api_key": f.get("api_key", ""), "gupshup_source": svc.get("from") or f.get("source", ""), "gupshup_app_name": f.get("app_name", "")}
        if kind == "twilio":
            return {"wa_provider": "twilio", "twilio_account_sid": f.get("account_sid", ""), "twilio_auth_token": f.get("auth_token", ""), "twilio_wa_from": svc.get("from") or f.get("wa_from", "")}
        if kind == "generic_whatsapp":
            return {"wa_provider": "generic", "generic_whatsapp": _generic(f)}
    if channel == "sms":
        if kind == "twilio":
            return {"sms_provider": "twilio", "twilio_account_sid": f.get("account_sid", ""), "twilio_auth_token": f.get("auth_token", ""), "twilio_sms_from": svc.get("from") or f.get("sms_from", "")}
        if kind == "generic_sms":
            return {"sms_provider": "generic", "generic_sms": _generic(f)}
    if channel == "voice":
        if kind == "twilio":
            return {"voice_provider": "twilio", "twilio_account_sid": f.get("account_sid", ""), "twilio_auth_token": f.get("auth_token", ""), "twilio_voice_from": svc.get("from") or f.get("voice_from", "")}
        if kind == "generic_voice":
            return {"voice_provider": "generic", "generic_voice": _generic(f)}
    raise HTTPException(400, f"El proveedor «{prov['name']}» no sirve para {channel}")


async def evolution_token(prov: dict, instance: str) -> str:
    """Clave propia de la instancia (no la global): la empresa solo puede operar su instancia, nunca las demás del servidor."""
    f = prov["fields"]
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(f["url"].rstrip("/") + "/instance/fetchInstances", params={"instanceName": instance}, headers={"apikey": f.get("apikey", "")})
        d = r.json()
        d = d[0] if isinstance(d, list) and d else d
        return (d or {}).get("token") or (d or {}).get("apikey") or ""
    except Exception:
        return ""


async def evolution_instance(t: dict, prov: dict, instance: str) -> str:
    """Crea (si no existe) la instancia de WhatsApp de la empresa en nuestro servidor Evolution y le apunta el webhook al Hub de la empresa."""
    f = prov["fields"]
    body = {"instanceName": instance, "integration": "WHATSAPP-BAILEYS", "qrcode": True,
            "webhook": {"url": f"https://{t['host']}/hub/evolution", "byEvents": False, "base64": False, "headers": {"apikey": t["hub_token"]}, "events": ["MESSAGES_UPSERT"]}}
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(f["url"].rstrip("/") + "/instance/create", headers={"apikey": f.get("apikey", "")}, json=body)
        if r.status_code in (200, 201):
            return "Instancia creada: la empresa escanea el código QR en Integraciones."
        if r.status_code in (403, 409) or "already" in r.text.lower():
            return "La instancia ya existía."
        return f"Evolution respondió {r.status_code}: crea la instancia a mano."
    except Exception as e:
        return "No se pudo contactar a Evolution: " + str(e)[:100]


class ServicesReq(BaseModel):
    whatsapp: Optional[dict] = None
    sms: Optional[dict] = None
    voice: Optional[dict] = None
    mail: Optional[str] = None            # 'shared' | 'own'
    cartera: Optional[bool] = None        # módulo «Cartera y cobranza» (tarjetas de deuda y mora)
    agent: Optional[str] = None           # comercial virtual: 'off' (solo manual) | 'auto' (versión automática, con costo propio)
    lookups: Optional[list] = None        # servicios de consulta del sistema habilitados para la empresa
    templates: Optional[int] = None       # plantillas personales por usuario y canal (10 incluidas; más es un servicio adicional)


async def tenant_mail_state(t: dict) -> dict:
    try:
        async with espo(t) as c:
            r = await c.get("/Settings")
        s = r.json()
        return {"hasOwn": bool(s.get("outboundEmailFromAddress")) and (get_setting("services:" + t["slug"], {}) or {}).get("mail", "own") == "own", "from": s.get("outboundEmailFromAddress")}
    except Exception:
        return {"hasOwn": None, "from": None}


IMAP_HOSTS = {"smtp.gmail.com": "imap.gmail.com", "smtp.office365.com": "outlook.office365.com", "smtp.mail.yahoo.com": "imap.mail.yahoo.com", "smtp.zoho.com": "imap.zoho.com"}


def set_company_mailbox(slug: str, mail: Optional[dict]) -> bool:
    """Activa (o retira) la lectura del buzón de entrada de la empresa: el Hub trae por IMAP los correos que llegan a esa cuenta.
    No se hace desde EspoCRM porque el cortafuegos del servidor redirige IMAP (143/993) del tráfico de los contenedores."""
    with db() as c:
        row = c.execute("SELECT settings FROM tenants WHERE slug=%s", (slug,)).fetchone()
        settings = dict(row["settings"] or {})
        host = IMAP_HOSTS.get((mail or {}).get("host", ""))
        old = settings.get("mailbox") or {}
        if mail and host and mail.get("user") and mail.get("password"):
            same = old.get("user") == mail["user"] and old.get("host") == host
            settings["mailbox"] = {"enabled": True, "host": host, "port": 993, "user": mail["user"], "password": mail["password"], "folder": "INBOX",
                                   "since": old.get("since") if same else time.strftime("%Y-%m-%d", time.gmtime()), "last_uid": old.get("last_uid", 0) if same else 0}
            ok = True
        else:
            settings.pop("mailbox", None)
            ok = False
        # envío «como el usuario»: el Hub manda con SMTP propio (nombre, firma y Reply-To del usuario) y las respuestas vuelven por un alias personal
        if mail and mail.get("host") and mail.get("from_address"):
            plus = any(k in mail["host"] for k in ("gmail", "google", "zoho"))
            settings["mailout"] = {"host": mail["host"], "port": int(mail.get("port") or 587), "security": mail.get("security") or "", "user": mail.get("user") or "",
                                   "password": mail.get("password") or "", "from_address": mail["from_address"], "plus": plus}
        else:
            settings.pop("mailout", None)
        c.execute("UPDATE tenants SET settings=%s WHERE slug=%s", (json.dumps(settings), slug))
    return ok


SYS_ACCOUNT = "Crm Hub 360 · correo del sistema"
LEGACY_SMTP_OFF = {"smtpServer": None, "smtpUsername": None, "smtpPassword": None, "smtpSecurity": ""}


async def set_company_mail(t: dict, mode: str) -> None:
    """Aplica (o retira) el correo de salida de una empresa. En EspoCRM 10 el correo del sistema es una cuenta de grupo con SMTP
    cuya dirección coincide con «outboundEmailFromAddress»: por eso se crea esa cuenta y se apunta el ajuste a ella."""
    mail = get_setting("mail") or {}
    if mode.startswith("p"):   # un proveedor de correo de la lista de proveedores aliados
        p = next((x for x in providers_list() if x["id"] == mode and x["kind"] == "email"), None)
        if not p:
            raise HTTPException(400, "Proveedor de correo inexistente")
        f = p["fields"]
        mail = {"host": f["host"], "port": f.get("port") or 587, "security": f.get("security", "TLS"), "user": f.get("user", ""), "password": f.get("password", ""),
                "from_address": f["from_address"], "enabled": True}
        mode = "shared"
    async with espo(t) as c:
        found = (await c.get("/InboundEmail", params={"where[0][type]": "equals", "where[0][attribute]": "name", "where[0][value]": SYS_ACCOUNT, "select": "id,emailAddress"})).json().get("list", [])
        acc = found[0] if found else None
        if mode == "shared":
            if not mail.get("host") or not mail.get("enabled", True):
                raise HTTPException(400, "El correo general está sin configurar o desactivado (pestaña «Correo general»)")
            data = {"name": SYS_ACCOUNT, "emailAddress": mail["from_address"], "status": "Active", "useImap": False, "useSmtp": True, "smtpIsShared": True,
                    "smtpHost": mail["host"], "smtpPort": int(mail.get("port") or 587), "smtpAuth": bool(mail.get("user")), "smtpSecurity": mail.get("security") or "",
                    "smtpUsername": mail.get("user") or None, "smtpPassword": mail.get("password") or None, "fromName": t["name"], "createCase": False}
            r = await (c.put(f"/InboundEmail/{acc['id']}", json=data) if acc else c.post("/InboundEmail", json=data))
            if r.status_code != 200:
                raise HTTPException(502, "No se pudo crear la cuenta de correo del sistema en la empresa: " + (r.headers.get("X-Status-Reason") or str(r.status_code)))
            body = {"outboundEmailFromAddress": mail["from_address"], "outboundEmailFromName": t["name"], "outboundEmailIsShared": True, "passwordRecoveryNoExposure": True, **LEGACY_SMTP_OFF}
        else:
            body = dict(LEGACY_SMTP_OFF)
            if acc:
                cur = (await c.get("/Settings")).json().get("outboundEmailFromAddress")
                await c.put(f"/InboundEmail/{acc['id']}", json={"status": "Inactive", "useSmtp": False})
                if cur and cur.lower() == (acc.get("emailAddress") or "").lower():
                    body.update({"outboundEmailFromAddress": None, "outboundEmailIsShared": False})
        r = await c.put("/Settings", json=body)
    if r.status_code != 200:
        raise HTTPException(502, "No se pudo aplicar la configuración de correo en la empresa")
    set_company_mailbox(t["slug"], mail if mode == "shared" else None)


@app.get("/api/companies/{slug}/services")
async def get_services(slug: str, actor: str = Depends(me)):
    t = get_tenant(slug)
    sv = services_of(slug)
    try:
        async with espo(t) as c:
            cartera = bool((await c.get("/Settings")).json().get("crmhubCartera"))
    except Exception:
        cartera = False
    try:
        with db() as c4:
            u = c4.execute("SELECT messages, llm_calls, escalations FROM agent_usage WHERE tenant=%s AND month=to_char(now() AT TIME ZONE 'UTC','YYYY-MM')", (slug,)).fetchone()
    except Exception:
        u = None
    return {"agent": ((t["settings"] or {}).get("limits") or {}).get("agent") or "off", "agentUsage": dict(u) if u else {"messages": 0, "llm_calls": 0, "escalations": 0},
            "lookups": list(((t["settings"] or {}).get("lookups")) or []), "lookupCatalog": [{"id": l["id"], "name": l["name"], "category": l.get("category", "otro")} for l in lookups_list()], "cartera": cartera, "templates": int(((t["settings"] or {}).get("limits") or {}).get("templates") or 10), "whatsapp": sv.get("whatsapp") or {}, "sms": sv.get("sms") or {}, "voice": sv.get("voice") or {}, "mail": {"mode": sv.get("mail") or "own", "systemReady": bool((get_setting("mail") or {}).get("host")) and (get_setting("mail") or {}).get("enabled", True), **(await tenant_mail_state(t))},
            "providers": [mask_provider(p) for p in providers_list()], "kinds": {k: v["channels"] for k, v in KINDS.items()}}


@app.put("/api/companies/{slug}/services")
async def put_services(slug: str, req: ServicesReq, actor: str = Depends(me)):
    t = get_tenant(slug)
    provs = {p["id"]: p for p in providers_list()}
    sv = services_of(slug)
    settings = dict(t["settings"] or {})
    notes = []
    for ch in ("whatsapp", "sms", "voice"):
        want = getattr(req, ch)
        if want is None:
            continue
        # retira lo que estaba gestionado para este canal
        for k in CHANNEL_KEYS[ch]:
            settings.pop(k, None)
        pid = (want or {}).get("provider")
        if pid:
            prov = provs.get(pid)
            if not prov:
                raise HTTPException(400, "Proveedor inexistente")
            svc = {"provider": pid, "instance": (want.get("instance") or "").strip()[:60], "from": (want.get("from") or "").strip()[:40]}
            if svc["instance"] and not re.match(r"^[A-Za-z0-9_-]{2,60}$", svc["instance"]):
                raise HTTPException(400, "El nombre de instancia solo admite letras, números, guiones")
            settings.update(channel_settings(ch, prov, svc, t))
            sv[ch] = svc
            if prov["kind"] == "evolution":
                notes.append(await evolution_instance(t, prov, svc["instance"] or slug))
                tok = await evolution_token(prov, svc["instance"] or slug)
                if tok:
                    settings["evolution_apikey"] = tok   # la empresa usa la clave de SU instancia, no la global del servidor
        else:
            sv.pop(ch, None)
    # Twilio compartido: se quitan las credenciales solo si ningún canal gestionado las sigue usando
    if not any(provs.get((sv.get(c) or {}).get("provider"), {}).get("kind") == "twilio" for c in ("whatsapp", "sms", "voice")):
        for k in TWILIO_CORE:
            settings.pop(k, None)
    settings["managed"] = {c: (sv.get(c) or {}).get("provider") for c in ("whatsapp", "sms", "voice") if sv.get(c)}
    with db() as c:
        c.execute("UPDATE tenants SET settings=%s WHERE slug=%s", (json.dumps(settings), slug))
    # correo
    if req.mail in ("shared", "own") or (req.mail or "").startswith("p"):
        await set_company_mail(t, req.mail)
        sv["mail"] = req.mail
    if req.agent is not None:
        if req.agent not in ("off", "auto"):
            raise HTTPException(400, "Valor no válido para el comercial virtual")
        with db() as c5:
            c5.execute("UPDATE tenants SET settings = jsonb_set(settings, '{limits}', COALESCE(settings->'limits', '{}'::jsonb) || %s::jsonb, true) WHERE slug=%s", (json.dumps({"agent": req.agent}), slug))
    if req.lookups is not None:
        known = {l["id"] for l in lookups_list()}
        ids = [str(i) for i in req.lookups if str(i) in known]
        with db() as c3:
            c3.execute("UPDATE tenants SET settings = jsonb_set(settings, '{lookups}', %s::jsonb, true) WHERE slug=%s", (json.dumps(ids), slug))
    if req.templates is not None:
        if not 10 <= req.templates <= 500:
            raise HTTPException(400, "El límite de plantillas va de 10 (incluidas) a 500")
        with db() as c2:   # solo el campo limits: el correo recién aplicado también escribió en settings y no debe pisarse
            c2.execute("UPDATE tenants SET settings = jsonb_set(settings, '{limits}', COALESCE(settings->'limits', '{}'::jsonb) || %s::jsonb, true) WHERE slug=%s",
                       (json.dumps({"templates": req.templates}), slug))
    if req.cartera is not None:
        async with espo(t) as c:
            r = await c.put("/Settings", json={"crmhubCartera": bool(req.cartera)})
        if r.status_code != 200:
            raise HTTPException(502, "No se pudo cambiar el módulo de cartera en la empresa")
        sv["cartera"] = bool(req.cartera)
    put_setting("services:" + slug, sv)
    audit(actor, "asignar_servicios", slug, {"servicios": {k: (v or {}).get("provider") if isinstance(v, dict) else v for k, v in sv.items()}, "plantillas_por_canal": req.templates})
    return {"ok": True, "notes": notes}


# ---------------------------------------------------------------- servicios de consulta (buró de crédito, validación de identidad, scraping…)
LOOKUP_CATEGORIES = {"buro": "Buró de crédito", "identidad": "Validación de identidad", "scraping": "Web scraping", "otro": "Otro servicio"}
LOOKUP_TARGETS = {"note", "status", "field:creditScore", "field:totalDebt", "field:overdueDebt", "field:monthlyIncome", "field:creditorCount", "field:maxDaysOverdue", "field:defaultCount",
                  "field:identificationType", "field:identification", "field:processResult", "field:description"}


def lookups_list() -> list:
    return get_setting("lookups", []) or []


def mask_lookup(l: dict) -> dict:
    h = dict(l.get("http") or {})
    s = h.pop("auth_secret", "")
    h["secretSet"] = bool(s)
    h["secretHint"] = ("…" + s[-4:]) if s else ""
    return {**l, "http": h}


@app.get("/api/lookups")
def list_lookups(actor: str = Depends(me)):
    with db() as c:
        trows = c.execute("SELECT slug, settings FROM tenants").fetchall()
        try:
            usage = c.execute("SELECT tenant, managed_id, count(*) FILTER (WHERE status='ok') AS ok, count(*) AS total FROM process_runs WHERE managed_id IS NOT NULL "
                              "AND started_at >= date_trunc('month', now()) GROUP BY 1, 2").fetchall()
        except Exception:
            usage = []
    uses: dict = {}
    for r in trows:
        for lid in ((r["settings"] or {}).get("lookups") or []):
            uses.setdefault(lid, []).append(r["slug"])
    cnt: dict = {}
    for u in usage:
        cnt.setdefault(u["managed_id"], {})[u["tenant"]] = {"ok": u["ok"], "total": u["total"]}
    return {"categories": LOOKUP_CATEGORIES, "targets": sorted(LOOKUP_TARGETS),
            "items": [dict(mask_lookup(l), companies=sorted(uses.get(l["id"], [])), usage=cnt.get(l["id"], {})) for l in lookups_list()]}


class LookupReq(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    category: str = "otro"
    description: str = Field("", max_length=400)
    unit_price: str = Field("", max_length=40)
    enabled: bool = True
    http: dict = {}
    map: list = []


@app.put("/api/lookups/{lid}")
def put_lookup(lid: str, req: LookupReq, actor: str = Depends(me)):
    items = lookups_list()
    old = next((l for l in items if l["id"] == lid), None)
    if lid != "new" and not old:
        raise HTTPException(404, "Servicio inexistente")
    h = req.http or {}
    url = str(h.get("url", "")).strip()[:500]
    if not re.match(r"^https?://", url.replace("{{", "x").replace("}}", "x")):
        raise HTTPException(400, "La URL debe empezar por http:// o https://")
    hdr = str(h.get("headers", "")).strip()
    if hdr:
        try:
            v = json.loads(hdr)
            assert isinstance(v, dict)
        except Exception:
            raise HTTPException(400, "Las cabeceras deben ser un JSON de pares clave/valor")
    secret = str(h.get("auth_secret", ""))[:500] or ((old or {}).get("http") or {}).get("auth_secret", "")
    http = {"url": url, "method": h.get("method") if h.get("method") in ("POST", "GET", "PUT") else "POST", "body_type": h.get("body_type") if h.get("body_type") in ("json", "form", "query") else "json",
            "body": str(h.get("body", ""))[:4000], "auth_type": h.get("auth_type") if h.get("auth_type") in ("none", "basic", "bearer", "header") else "none",
            "auth_user": str(h.get("auth_user", ""))[:200], "auth_header": str(h.get("auth_header", ""))[:80], "auth_secret": secret, "headers": hdr[:1500]}
    rows = []
    for r in (req.map or [])[:20]:
        path, to = str(r.get("path", "")).strip()[:120], str(r.get("to", ""))
        if path and to in LOOKUP_TARGETS:
            rows.append({"path": path, "to": to})
    item = {"id": old["id"] if old else "l" + secrets.token_hex(4), "name": req.name.strip(), "category": req.category if req.category in LOOKUP_CATEGORIES else "otro",
            "description": req.description.strip(), "unit_price": req.unit_price.strip(), "enabled": req.enabled, "http": http, "map": rows}
    put_setting("lookups", [item if l["id"] == item["id"] else l for l in items] if old else items + [item])
    audit(actor, "servicio_consulta", None, {"nombre": item["name"], "categoria": item["category"]})
    return {"ok": True, "id": item["id"]}


@app.delete("/api/lookups/{lid}")
def delete_lookup(lid: str, actor: str = Depends(me)):
    with db() as c:
        used = [r["slug"] for r in c.execute("SELECT slug, settings FROM tenants").fetchall() if lid in ((r["settings"] or {}).get("lookups") or [])]
    if used:
        raise HTTPException(409, "Lo usan estas empresas: " + ", ".join(used) + ". Quítalo primero de cada una (panel Servicios).")
    put_setting("lookups", [l for l in lookups_list() if l["id"] != lid])
    audit(actor, "eliminar_servicio_consulta", None, {"id": lid})
    return {"ok": True}


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
                         "Content-Security-Policy": f"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-src https://*.{BASE_DOMAIN}; frame-ancestors 'none'",
                         "Cache-Control": resp.headers.get("Cache-Control", "no-store")})
    return resp


if __name__ == "__main__":
    uvicorn.run(app, host=BIND_HOST, port=PORT, log_level="info", proxy_headers=False)
