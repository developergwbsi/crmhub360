"""Videollamadas propias de Crm Hub 360 (sala de reunión por enlace, sin Meet ni Zoom).

El asesor crea una sala desde un lead (`create`); el CRM le devuelve el enlace del cliente y el suyo. El cliente entra desde el navegador, sin cuenta, con el enlace
`https://meet.<dominio>/<código>`; el asesor entra con el mismo enlace más una clave de anfitrión (`?h=`) que solo recibe él.
Los medios (audio y video) los maneja un servidor LiveKit propio (docker-compose: `livekit`); el Hub solo firma las credenciales de entrada (JWT HS256) y sirve la página.
La página lleva el cliente de LiveKit incluido (`meet_assets/`), así no depende de internet de terceros. Subtítulos en vivo: ver docs/modulos/VIDEOLLAMADAS.md.
"""
import base64
import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import time
from pathlib import Path

from . import db

log = logging.getLogger("hub.meet")
ASSETS = Path(__file__).parent / "meet_assets"
SCHEMA = """
CREATE TABLE IF NOT EXISTS meet_rooms (
    code TEXT PRIMARY KEY, tenant TEXT NOT NULL, lead_id TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', host_name TEXT NOT NULL DEFAULT '', host_key TEXT NOT NULL,
    created_by TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL, ended_at TIMESTAMPTZ,
    first_join_at TIMESTAMPTZ, host_lang TEXT NOT NULL DEFAULT 'es', guest_lang TEXT NOT NULL DEFAULT 'en', subtitles BOOLEAN NOT NULL DEFAULT false);
CREATE INDEX IF NOT EXISTS meet_rooms_tenant ON meet_rooms (tenant, created_at DESC);
"""
CODE_ALPHA = "abcdefghjkmnpqrstuvwxyz23456789"   # sin letras ni números que se confundan
CODE_RE = re.compile(r"^[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}$")
TTL_HOURS = 24


def ensure_schema() -> None:
    """Crea la tabla de salas si no existe."""
    with db.pool.connection() as c:
        c.execute(SCHEMA)


def configured() -> bool:
    """True si el Hub tiene las claves y el dominio del servidor de videollamadas."""
    return bool(os.environ.get("LIVEKIT_API_KEY") and os.environ.get("LIVEKIT_API_SECRET") and os.environ.get("MEET_HOST"))


def public_base() -> str:
    """Dirección pública de las salas (https://meet.<dominio>)."""
    return "https://" + os.environ.get("MEET_HOST", "")


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def sign(identity: str, name: str, room: str, host: bool, ttl: int = 4 * 3600) -> str:
    """JWT de acceso a una sala de LiveKit (HS256). El anfitrión además puede administrar la sala (expulsar, cerrar)."""
    now = int(time.time())
    claims = {"iss": os.environ["LIVEKIT_API_KEY"], "sub": identity, "name": name, "nbf": now - 10, "exp": now + ttl,
              "video": {"room": room, "roomJoin": True, "canPublish": True, "canSubscribe": True, "canPublishData": True, **({"roomAdmin": True} if host else {})}}
    head = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    body = _b64(json.dumps(claims, separators=(",", ":")).encode())
    sig = hmac.new(os.environ["LIVEKIT_API_SECRET"].encode(), f"{head}.{body}".encode(), hashlib.sha256).digest()
    return f"{head}.{body}.{_b64(sig)}"


def new_code() -> str:
    """Código legible tipo «abc-defg-hij»."""
    pick = lambda n: "".join(secrets.choice(CODE_ALPHA) for _ in range(n))
    return f"{pick(3)}-{pick(4)}-{pick(3)}"


def create(tenant_slug: str, lead_id: str, title: str, host_name: str, created_by: str, host_lang: str = "es", guest_lang: str = "en", subtitles: bool = False) -> dict:
    """Crea una sala y devuelve su código y los dos enlaces (cliente y anfitrión)."""
    if not configured():
        raise ValueError("Las videollamadas no están configuradas en el servidor.")
    code, key = new_code(), secrets.token_urlsafe(18)
    with db.pool.connection() as c:
        c.execute("INSERT INTO meet_rooms (code, tenant, lead_id, title, host_name, host_key, created_by, expires_at, host_lang, guest_lang, subtitles) VALUES (%s,%s,%s,%s,%s,%s,%s, now() + make_interval(hours => %s),%s,%s,%s)",
                  (code, tenant_slug, lead_id or "", (title or "").strip()[:120], (host_name or "")[:80], key, created_by[:80], TTL_HOURS, host_lang, guest_lang, subtitles))
    base = f"{public_base()}/{code}"
    return {"code": code, "guestUrl": base, "hostUrl": f"{base}?h={key}", "expiresInHours": TTL_HOURS}


def room(code: str) -> dict | None:
    """Sala vigente (no cerrada ni vencida) o None."""
    if not CODE_RE.match(code or ""):
        return None
    with db.pool.connection() as c:
        return c.execute("SELECT * FROM meet_rooms WHERE code = %s AND ended_at IS NULL AND expires_at > now()", (code,)).fetchone()


def join(code: str, name: str, host_key: str = "") -> dict:
    """Credencial de entrada para una persona: el cliente con su nombre, o el anfitrión si trae su clave."""
    r = room(code)
    if not r:
        raise LookupError("Esta videollamada ya terminó o el enlace no es válido.")
    is_host = bool(host_key) and hmac.compare_digest(host_key, r["host_key"])
    name = (name or "").strip()[:60] or (r["host_name"] if is_host else "Invitado")
    ident = ("h-" if is_host else "g-") + secrets.token_hex(5)
    with db.pool.connection() as c:
        c.execute("UPDATE meet_rooms SET first_join_at = COALESCE(first_join_at, now()) WHERE code = %s", (code,))
    return {"token": sign(ident, name, f"{r['tenant']}-{code}", is_host), "url": "wss://" + os.environ["MEET_HOST"], "name": name, "host": is_host,
            "title": r["title"], "subtitles": bool(r["subtitles"]), "myLang": r["host_lang"] if is_host else r["guest_lang"], "otherLang": r["guest_lang"] if is_host else r["host_lang"]}


def end(tenant_slug: str, code: str) -> bool:
    """Cierra la sala (el enlace deja de servir)."""
    with db.pool.connection() as c:
        return c.execute("UPDATE meet_rooms SET ended_at = now() WHERE code = %s AND tenant = %s AND ended_at IS NULL", (code, tenant_slug)).rowcount > 0


def listing(tenant_slug: str, lead_id: str = "", limit: int = 20) -> list[dict]:
    """Salas recientes de la empresa (opcionalmente de un lead)."""
    with db.pool.connection() as c:
        rows = c.execute("SELECT code, lead_id, title, created_by, created_at, expires_at, ended_at, first_join_at FROM meet_rooms WHERE tenant = %s AND (%s = '' OR lead_id = %s) ORDER BY created_at DESC LIMIT %s",
                         (tenant_slug, lead_id, lead_id, limit)).fetchall()
    return [{**r, "created_at": r["created_at"].isoformat(), "expires_at": r["expires_at"].isoformat(), "ended_at": r["ended_at"].isoformat() if r["ended_at"] else None,
             "first_join_at": r["first_join_at"].isoformat() if r["first_join_at"] else None, "active": r["ended_at"] is None and r["expires_at"].timestamp() > time.time()} for r in rows]


def client_js() -> bytes:
    """Cliente de LiveKit para el navegador (incluido en el repositorio)."""
    return (ASSETS / "livekit-client.umd.min.js").read_bytes()


def page(code: str) -> str:
    """Página de la videollamada: entrada (nombre, cámara y micrófono), sala con video y controles."""
    r = room(code)
    if not r:
        return _PAGE_END
    return _PAGE.replace("__CODE__", code).replace("__TITLE__", (r["title"] or "Videollamada").replace("<", "&lt;"))


_PAGE_END = """<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Videollamada</title>
<style>body{font:16px system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#0f1424;color:#e9ecf8}.c{text-align:center;padding:24px;max-width:380px}h1{font-size:20px}p{color:#aab1cc}</style></head>
<body><div class="c"><h1>Esta videollamada ya terminó</h1><p>El enlace venció o la sala se cerró. Pide a tu asesor un enlace nuevo.</p></div></body></html>"""

_PAGE = r"""<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex"><title>__TITLE__</title>
<style>
:root{--bg:#0f1424;--panel:#181f36;--line:#2a3354;--tx:#e9ecf8;--mut:#aab1cc;--pri:#4f6bff;--bad:#e5484d;--ok:#30a46c}
*{box-sizing:border-box}html,body{height:100%}body{margin:0;background:var(--bg);color:var(--tx);font:16px system-ui,-apple-system,Segoe UI,sans-serif}
button{font:inherit;cursor:pointer}.hide{display:none!important}
#lobby{min-height:100%;display:grid;place-items:center;padding:20px}.card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px;width:100%;max-width:440px}
.card h1{font-size:20px;margin:0 0 4px}.card p{margin:0 0 14px;color:var(--mut);font-size:14px}
#prev{width:100%;aspect-ratio:4/3;border-radius:12px;background:#0a0e1c;object-fit:cover;transform:scaleX(-1)}
input[type=text]{width:100%;padding:12px;border-radius:10px;border:1px solid var(--line);background:#0f1527;color:var(--tx);font:inherit;margin:12px 0}
.row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.tg{flex:1;padding:10px;border-radius:10px;border:1px solid var(--line);background:#0f1527;color:var(--tx)}.tg.off{background:#3a1d24;border-color:#6b2a35}
.go{width:100%;padding:13px;border:0;border-radius:10px;background:var(--pri);color:#fff;font-weight:600}.go:disabled{opacity:.5}
#err{color:#ff9aa0;font-size:14px;margin-top:10px}
#room{position:fixed;inset:0;display:flex;flex-direction:column}#top{padding:10px 14px;color:var(--mut);font-size:14px;display:flex;justify-content:space-between}
#grid{flex:1;display:grid;gap:8px;padding:8px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));grid-auto-rows:1fr;min-height:0}
.tile{position:relative;background:#0a0e1c;border-radius:12px;overflow:hidden;min-height:140px}.tile video{width:100%;height:100%;object-fit:cover}.tile.me video{transform:scaleX(-1)}
.tile.share video{object-fit:contain}.nm{position:absolute;left:8px;bottom:8px;background:#000a;padding:3px 8px;border-radius:8px;font-size:13px}
.av{position:absolute;inset:0;display:grid;place-items:center;font-size:42px;color:var(--mut);background:#10162a}
#bar{display:flex;justify-content:center;gap:10px;padding:12px;padding-bottom:calc(12px + env(safe-area-inset-bottom))}
.cb{width:52px;height:52px;border-radius:50%;border:0;background:#26304f;color:#fff;font-size:20px}.cb.off{background:#5a2330}.cb.end{background:var(--bad)}
#wait{position:absolute;inset:0;display:grid;place-items:center;color:var(--mut);text-align:center;pointer-events:none;padding:30px}
</style></head><body>
<div id="lobby"><div class="card"><h1>__TITLE__</h1><p>Revisa tu cámara y tu micrófono antes de entrar.</p>
<video id="prev" autoplay playsinline muted></video><input id="nm" type="text" placeholder="Tu nombre" maxlength="60" autocomplete="name">
<div class="row"><button class="tg" id="tm">🎤 Micrófono: activado</button><button class="tg" id="tc">📷 Cámara: activada</button></div>
<button class="go" id="go">Unirme a la videollamada</button><div id="err"></div></div></div>
<div id="room" class="hide"><div id="top"><span id="ttl"></span><span id="cnt"></span></div><div id="grid"></div><div id="wait">Esperando a la otra persona…</div>
<div id="bar"><button class="cb" id="bm" title="Micrófono">🎤</button><button class="cb" id="bc" title="Cámara">📷</button><button class="cb" id="bs" title="Compartir pantalla">🖥️</button><button class="cb end" id="be" title="Salir">⏻</button></div></div>
<script src="_/lk.js"></script>
<script>
(function(){
var CODE="__CODE__", HK=new URLSearchParams(location.search).get('h')||'', $=function(i){return document.getElementById(i)};
var mic=true, cam=true, stream=null, room=null, L=window.LivekitClient;
try{ $('nm').value=localStorage.getItem('meet-name')||''; }catch(e){}
function err(t){ $('err').textContent=t||''; }
function paint(){ $('tm').textContent='🎤 Micrófono: '+(mic?'activado':'apagado'); $('tm').classList.toggle('off',!mic); $('tc').textContent='📷 Cámara: '+(cam?'activada':'apagada'); $('tc').classList.toggle('off',!cam); }
$('tm').onclick=function(){mic=!mic;paint()}; $('tc').onclick=function(){cam=!cam;paint(); if(stream){stream.getVideoTracks().forEach(function(t){t.enabled=cam})}};
if(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia){
  navigator.mediaDevices.getUserMedia({video:true,audio:true}).then(function(s){stream=s;$('prev').srcObject=s}).catch(function(){ err('No pudimos usar la cámara o el micrófono. Revisa los permisos del navegador; igual puedes entrar a escuchar.'); });
} else { err('Tu navegador no permite videollamadas. Abre el enlace en Chrome, Safari o Edge actualizados.'); }
paint();
function initials(n){return (n||'?').trim().charAt(0).toUpperCase()}
function tileFor(p,local){
  var id='t-'+p.identity+(local?'-me':''); var t=$(id); if(t){return t}
  t=document.createElement('div'); t.className='tile'+(local?' me':''); t.id=id;
  t.innerHTML='<div class="av">'+initials(p.name)+'</div><div class="nm"></div>'; t.querySelector('.nm').textContent=(p.name||'Invitado')+(local?' (tú)':'');
  $('grid').appendChild(t); return t;
}
function attach(track,p,local){
  if(track.kind==='video'){ var t=tileFor(p,local), share=track.source==='screen_share'; if(share){t=document.createElement('div');t.className='tile share';t.id='s-'+p.identity;t.innerHTML='<div class="nm"></div>';t.querySelector('.nm').textContent='Pantalla de '+(p.name||'');$('grid').appendChild(t)}
    var v=t.querySelector('video'); if(!v){v=document.createElement('video');v.autoplay=true;v.playsInline=true;if(local){v.muted=true}t.insertBefore(v,t.firstChild)} track.attach(v); var av=t.querySelector('.av'); if(av){av.classList.add('hide')} }
  else if(!local){ var a=track.attach(); a.id='a-'+track.sid; document.body.appendChild(a); }
}
function detach(track,p){
  track.detach().forEach(function(e){ if(e.tagName==='AUDIO'){e.remove()} });
  if(track.kind==='video'){ if(track.source==='screen_share'){var s=$('s-'+p.identity);if(s){s.remove()}} else {var t=$('t-'+p.identity); if(t){var av=t.querySelector('.av'); if(av){av.classList.remove('hide')} var v=t.querySelector('video'); if(v){v.remove()}}} }
}
function err2(t){ var w=$('wait'); w.textContent=t; w.classList.remove('hide'); }
function count(){ var n=room?room.remoteParticipants.size+1:0; $('cnt').textContent=n+(n===1?' persona':' personas'); $('wait').classList.toggle('hide', n>1); }
$('go').onclick=function(){
  var name=$('nm').value.trim(); if(!name&&!HK){ err('Escribe tu nombre para entrar.'); return; }
  try{ localStorage.setItem('meet-name',name) }catch(e){}
  $('go').disabled=true; err('');
  fetch(CODE+'/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name,host:HK})}).then(function(r){ if(!r.ok){throw new Error(r.status===404?'Esta videollamada ya terminó.':'No se pudo entrar. Intenta de nuevo.')} return r.json(); }).then(function(j){
    room=new L.Room({adaptiveStream:true,dynacast:true});
    room.on('trackSubscribed',function(t,pub,p){attach(t,p,false);count()}).on('trackUnsubscribed',function(t,pub,p){detach(t,p)})
        .on('participantConnected',function(p){tileFor(p,false);count()}).on('participantDisconnected',function(p){var t=$('t-'+p.identity);if(t){t.remove()};count()})
        .on('disconnected',function(){ $('room').classList.add('hide'); $('lobby').classList.remove('hide'); $('go').disabled=false; err('Saliste de la videollamada.'); if(stream){stream.getTracks().forEach(function(t){t.stop()}); stream=null} });
    return room.connect(j.url,j.token).then(function(){
      if(stream){stream.getTracks().forEach(function(t){t.stop()}); stream=null; $('prev').srcObject=null}
      $('lobby').classList.add('hide'); $('room').classList.remove('hide'); $('ttl').textContent=j.title||'Videollamada';
      room.remoteParticipants.forEach(function(p){tileFor(p,false); p.trackPublications.forEach(function(pb){ if(pb.track){attach(pb.track,p,false)} })});
      tileFor(room.localParticipant,true); count();
      return room.localParticipant.setMicrophoneEnabled(mic).then(function(){return room.localParticipant.setCameraEnabled(cam)}).catch(function(e){ console.warn('No se pudo publicar el audio o el video', e); err2('No pudimos enviar tu cámara o micrófono: '+(e&&e.message||e)); });
    }).then(function(){ room.localParticipant.trackPublications.forEach(function(pb){ if(pb.track&&pb.track.kind==='video'){attach(pb.track,room.localParticipant,true)} }); });
  }).catch(function(e){ $('go').disabled=false; err(e.message||'No se pudo entrar.'); });
};
$('bm').onclick=function(){ if(!room){return} var on=!room.localParticipant.isMicrophoneEnabled; room.localParticipant.setMicrophoneEnabled(on).then(function(){$('bm').classList.toggle('off',!on)}) };
$('bc').onclick=function(){ if(!room){return} var on=!room.localParticipant.isCameraEnabled; room.localParticipant.setCameraEnabled(on).then(function(){ $('bc').classList.toggle('off',!on); var t=$('t-'+room.localParticipant.identity+'-me'); if(t){ if(on){ room.localParticipant.trackPublications.forEach(function(pb){ if(pb.track&&pb.track.kind==='video'&&pb.source==='camera'){attach(pb.track,room.localParticipant,true)} }) } else { var v=t.querySelector('video'); if(v){v.remove()} var av=t.querySelector('.av'); if(av){av.classList.remove('hide')} } } }) };
$('bs').onclick=function(){ if(!room){return} var on=!room.localParticipant.isScreenShareEnabled; room.localParticipant.setScreenShareEnabled(on).then(function(){ $('bs').classList.toggle('off',false); room.localParticipant.trackPublications.forEach(function(pb){ if(pb.source==='screen_share'&&pb.track){attach(pb.track,room.localParticipant,true)} }); if(!on){var s=$('s-'+room.localParticipant.identity); if(s){s.remove()}} }).catch(function(){}) };
$('be').onclick=function(){ if(room){room.disconnect()} };
window.addEventListener('beforeunload',function(){ if(room){room.disconnect()} });
})();
</script></body></html>"""
