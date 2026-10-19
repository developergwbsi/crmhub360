"""Grabaciones de pantalla y de videollamadas: el navegador graba (MediaRecorder) y sube el video por partes; el Hub lo guarda en disco (volumen /recordings) y
lo sirve con Range para reproducirlo. Cada grabación es de quien la hizo; con enlace para compartir (opcional, se puede quitar) y descarga.
Las subidas y las reproducciones usan llaves firmadas (HMAC) de corta vida, para no pasar los videos por el CRM."""
import base64
import hashlib
import hmac
import os
import re
import secrets
import subprocess
import threading
import time
from pathlib import Path

from . import db, meet

DIR = Path(os.environ.get("RECORDINGS_DIR", "/recordings"))
MAX_BYTES = 3 * 1024 ** 3          # una grabación
MAX_CHUNK = 64 * 1024 ** 2
QUOTA_BYTES = 40 * 1024 ** 3       # por empresa
ID_RE = re.compile(r"^[A-Za-z0-9_-]{10,40}$")
SCHEMA = """
CREATE TABLE IF NOT EXISTS recordings (id TEXT PRIMARY KEY, tenant TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'screen', owner TEXT NOT NULL DEFAULT '',
    owner_name TEXT NOT NULL DEFAULT '', mime TEXT NOT NULL DEFAULT 'video/webm', size BIGINT NOT NULL DEFAULT 0, duration INT NOT NULL DEFAULT 0, has_audio BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'uploading', share_token TEXT, meet_code TEXT NOT NULL DEFAULT '', chunks INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS recordings_tenant ON recordings (tenant, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS recordings_share ON recordings (share_token) WHERE share_token IS NOT NULL;
"""


def ensure_schema() -> None:
    DIR.mkdir(parents=True, exist_ok=True)
    with db.pool.connection() as c:
        c.execute(SCHEMA)


def _secret() -> bytes:
    return (os.environ.get("LIVEKIT_API_SECRET") or os.environ.get("HUB_ADMIN_TOKEN") or "crmhub").encode()


def _sig(purpose: str, rid: str, exp: int) -> str:
    return base64.urlsafe_b64encode(hmac.new(_secret(), f"rec|{purpose}|{rid}|{exp}".encode(), hashlib.sha256).digest()).rstrip(b"=").decode()[:28]


def sign(purpose: str, rid: str, seconds: int) -> str:
    exp = int(time.time()) + seconds
    return f"{exp}.{_sig(purpose, rid, exp)}"


def check(purpose: str, rid: str, key: str) -> bool:
    try:
        exp, sg = (key or "").split(".", 1)
        return int(exp) > time.time() and hmac.compare_digest(_sig(purpose, rid, int(exp)), sg)
    except (ValueError, TypeError):
        return False


def base() -> str:
    return meet.public_base()


def _path(tenant: str, rid: str) -> Path:
    return DIR / re.sub(r"[^a-z0-9_-]", "_", tenant) / f"{rid}.webm"


def _row(rid: str) -> dict | None:
    if not ID_RE.match(rid or ""):
        return None
    with db.pool.connection() as c:
        return c.execute("SELECT * FROM recordings WHERE id = %s", (rid,)).fetchone()


def used(tenant: str) -> int:
    with db.pool.connection() as c:
        return int(c.execute("SELECT COALESCE(sum(size),0) n FROM recordings WHERE tenant = %s", (tenant,)).fetchone()["n"])


def start(tenant: str, kind: str, title: str, owner: str, owner_name: str, has_audio: bool, mime: str = "video/webm", meet_code: str = "") -> dict:
    if used(tenant) >= QUOTA_BYTES:
        raise ValueError("La empresa llegó al límite de espacio para grabaciones. Elimina algunas para grabar de nuevo.")
    rid = secrets.token_urlsafe(14)
    kind = "call" if kind == "call" else "screen"
    mime = "video/mp4" if (mime or "").startswith("video/mp4") else "video/webm"
    title = (title or "").strip()[:120] or ("Videollamada" if kind == "call" else "Grabación de pantalla")
    p = _path(tenant, rid)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(b"")
    with db.pool.connection() as c:
        c.execute("INSERT INTO recordings (id, tenant, title, kind, owner, owner_name, mime, has_audio, meet_code) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                  (rid, tenant, title, kind, owner[:80], owner_name[:80], mime, bool(has_audio), (meet_code or "")[:20]))
    return {"id": rid, **upload_info(rid)}


def upload_info(rid: str) -> dict:
    return {"url": f"{base()}/_/rec/{rid}", "key": sign("up", rid, 6 * 3600)}


def chunk(rid: str, key: str, seq: int, data: bytes) -> dict:
    if not check("up", rid, key):
        raise PermissionError("La llave de subida venció.")
    r = _row(rid)
    if not r or r["status"] != "uploading":
        raise LookupError("La grabación no está en curso.")
    if not data or len(data) > MAX_CHUNK:
        raise ValueError("Parte vacía o demasiado grande.")
    if seq != r["chunks"]:
        if seq < r["chunks"]:
            return {"ok": True, "chunks": r["chunks"]}     # reintento de una parte ya recibida
        raise ValueError("Falta una parte anterior.")
    p = _path(r["tenant"], rid)
    if p.stat().st_size + len(data) > MAX_BYTES:
        raise ValueError("La grabación superó el tamaño máximo permitido.")
    with open(p, "ab") as f:
        f.write(data)
    with db.pool.connection() as c:
        c.execute("UPDATE recordings SET chunks = chunks + 1, size = %s WHERE id = %s", (p.stat().st_size, rid))
    return {"ok": True, "chunks": seq + 1}


def finish(rid: str, key: str, duration: int) -> dict:
    if not check("up", rid, key):
        raise PermissionError("La llave de subida venció.")
    r = _row(rid)
    if not r:
        raise LookupError("No existe.")
    p = _path(r["tenant"], rid)
    size = p.stat().st_size if p.exists() else 0
    if size == 0:
        with db.pool.connection() as c:
            c.execute("DELETE FROM recordings WHERE id = %s", (rid,))
        return {"ok": False, "empty": True}
    with db.pool.connection() as c:
        c.execute("UPDATE recordings SET status = 'processing', size = %s, duration = %s WHERE id = %s", (size, max(0, min(int(duration or 0), 86400)), rid))
    if r["mime"] == "video/mp4":
        with db.pool.connection() as c:
            c.execute("UPDATE recordings SET status = 'ready' WHERE id = %s", (rid,))
    else:
        threading.Thread(target=_fix, args=(r["tenant"], rid), daemon=True).start()
    return {"ok": True, "id": rid}


def _fix(tenant: str, rid: str) -> None:
    """El navegador entrega el video sin duración ni índice (no deja adelantar). ffmpeg lo copia sin recodificar para corregirlo; si falla se deja tal cual."""
    p = _path(tenant, rid)
    tmp = p.with_suffix(".fix.webm")
    try:
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(p), "-c", "copy", "-f", "webm", str(tmp)], check=True, timeout=1800)
        if tmp.exists() and tmp.stat().st_size > 0:
            tmp.replace(p)
    except Exception:
        try:
            tmp.unlink()
        except OSError:
            pass
    with db.pool.connection() as c:
        c.execute("UPDATE recordings SET status = 'ready', size = %s WHERE id = %s", (p.stat().st_size if p.exists() else 0, rid))


def _out(r: dict) -> dict:
    return {"id": r["id"], "title": r["title"], "kind": r["kind"], "owner": r["owner"], "ownerName": r["owner_name"], "size": int(r["size"]), "duration": r["duration"],
            "audio": r["has_audio"], "status": r["status"], "shared": bool(r["share_token"]), "shareUrl": f"{base()}/r/{r['share_token']}" if r["share_token"] else "",
            "at": r["created_at"].isoformat(), "mime": r["mime"]}


def listing(tenant: str, user: str, all_: bool) -> dict:
    with db.pool.connection() as c:
        # las que quedaron a medias (se cerró el navegador) se muestran como «incompletas» si ya traen datos, y se limpian las vacías de más de un día
        c.execute("DELETE FROM recordings WHERE tenant = %s AND size = 0 AND created_at < now() - interval '1 day'", (tenant,))
        rows = c.execute("SELECT * FROM recordings WHERE tenant = %s AND (%s OR owner = %s) AND NOT (status = 'uploading' AND size = 0) ORDER BY created_at DESC LIMIT 500", (tenant, all_, user)).fetchall()
    return {"items": [_out(r) for r in rows], "usedBytes": used(tenant), "quotaBytes": QUOTA_BYTES}


def _mine(tenant: str, rid: str, user: str, manager: bool) -> dict:
    r = _row(rid)
    if not r or r["tenant"] != tenant:
        raise LookupError("No existe la grabación.")
    if r["owner"] != user and not manager:
        raise PermissionError("Solo quien la grabó o un gerente puede hacer esto.")
    return r


def update(tenant: str, rid: str, user: str, manager: bool, title: str | None, share: bool | None) -> dict:
    r = _mine(tenant, rid, user, manager)
    with db.pool.connection() as c:
        if title is not None:
            c.execute("UPDATE recordings SET title = %s WHERE id = %s", ((title or "").strip()[:120] or r["title"], rid))
        if share is True and not r["share_token"]:
            c.execute("UPDATE recordings SET share_token = %s WHERE id = %s", (secrets.token_urlsafe(18), rid))
        if share is False:
            c.execute("UPDATE recordings SET share_token = NULL WHERE id = %s", (rid,))
    return _out(_row(rid))


def delete(tenant: str, rid: str, user: str, manager: bool) -> bool:
    r = _mine(tenant, rid, user, manager)
    try:
        _path(tenant, rid).unlink()
    except OSError:
        pass
    with db.pool.connection() as c:
        c.execute("DELETE FROM recordings WHERE id = %s", (rid,))
    return True


def play_info(tenant: str, rid: str, user: str, manager: bool) -> dict:
    r = _row(rid)
    if not r or r["tenant"] != tenant or (r["owner"] != user and not manager):
        raise LookupError("No existe la grabación.")
    k = sign("play", rid, 4 * 3600)
    return {"url": f"{base()}/_/rec/{rid}/file?k={k}", "downloadUrl": f"{base()}/_/rec/{rid}/file?k={k}&dl=1", "title": r["title"], "mime": r["mime"]}


def file_for(rid: str, key: str = "", share: str = "") -> tuple[Path, str, str] | None:
    """(ruta, tipo, nombre) si la llave de reproducción o el enlace compartido es válido."""
    r = _row(rid) if rid else None
    if not r and share:
        with db.pool.connection() as c:
            r = c.execute("SELECT * FROM recordings WHERE share_token = %s", (share,)).fetchone()
    if not r or not r["size"]:
        return None
    if not (check("play", r["id"], key) or (share and r["share_token"] and hmac.compare_digest(r["share_token"], share))):
        return None
    p = _path(r["tenant"], r["id"])
    if not p.exists():
        return None
    ext = "mp4" if r["mime"] == "video/mp4" else "webm"
    return p, r["mime"], re.sub(r'[^\w .-]', "_", r["title"]) + "." + ext


def share_row(token: str) -> dict | None:
    with db.pool.connection() as c:
        return c.execute("SELECT * FROM recordings WHERE share_token = %s AND status <> 'uploading'", (token or "",)).fetchone()
