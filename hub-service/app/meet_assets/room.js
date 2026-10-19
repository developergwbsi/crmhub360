/* Sala de videollamada de Crm Hub 360: video, personas (con solicitudes de ingreso), chat con archivos, reacciones, mano levantada, pantalla compartida,
   fondos virtuales, dispositivos, subtítulos en vivo y controles del anfitrión. Sirve el Hub (meet_assets/room.js); medios por LiveKit. */
(function () {
'use strict';
var R = window.__ROOM, CODE = R.code, GUEST = R.guest, SUBS = R.subs, L = window.LivekitClient;
var Q = new URLSearchParams(location.search), HK = Q.get('h') || '', EXTRA = Q.get('i') === '1', INV = Q.get('p') || '', AUTO = Q.get('auto') === '1' && !!HK;
var $ = function (i) { return document.getElementById(i); };
var mic = true, cam = true, stream = null, room = null, J = null;
var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]; }); };
var enc = function (o) { return new TextEncoder().encode(JSON.stringify(o)); };
if (window.parent !== window) { document.body.classList.add('framed'); }

function post(path, body, headers) { return fetch(CODE + '/' + path, {method: 'POST', headers: Object.assign({'Content-Type': 'application/json'}, headers || {}), body: JSON.stringify(body)}); }
function reqToast(k) {
  var d = document.createElement('div'); d.className = 'tt'; d.dataset.k = k.id; d.innerHTML = '<b></b> quiere entrar a la videollamada <button data-y>Admitir</button> <button data-n>Rechazar</button>'; d.querySelector('b').textContent = k.name;
  d.onclick = function (e) { var b = e.target.closest('button'); if (!b) { return; } decide(k.id, b.hasAttribute('data-y')); d.remove(); }; $('toast').appendChild(d); setTimeout(function () { d.remove(); }, 25000);
}
function toast(t, ms) { var d = document.createElement('div'); d.className = 'tt'; d.textContent = t; $('toast').appendChild(d); setTimeout(function () { d.remove(); }, ms || 4000); }
function beep() { try { var c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.frequency.value = 880; g.gain.value = 0.08; o.start(); setTimeout(function () { o.stop(); c.close(); }, 180); } catch (e) { /* sin sonido */ } }
function err(t) { $('err').textContent = t || ''; }

/* ---------------- entrada (vista previa de cámara y datos) ---------------- */
try { $('nm').value = localStorage.getItem('meet-name') || ''; } catch (e) { /* sin almacenamiento */ }
function lobbyPaint() { $('tm').textContent = '🎤 Micrófono: ' + (mic ? 'activado' : 'apagado'); $('tm').classList.toggle('off', !mic); $('tc').textContent = '📷 Cámara: ' + (cam ? 'activada' : 'apagada'); $('tc').classList.toggle('off', !cam); }
$('tm').onclick = function () { mic = !mic; lobbyPaint(); };
$('tc').onclick = function () { cam = !cam; lobbyPaint(); if (stream) { stream.getVideoTracks().forEach(function (t) { t.enabled = cam; }); } };
if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
  navigator.mediaDevices.getUserMedia({video: true, audio: true}).then(function (s) { stream = s; $('prev').srcObject = s; }).catch(function () { err('No pudimos usar la cámara o el micrófono. Revisa los permisos del navegador; igual puedes entrar a escuchar.'); });
} else { err('Tu navegador no permite videollamadas. Abre el enlace en Chrome, Safari o Edge actualizados.'); }
lobbyPaint();
if (AUTO) { setTimeout(function () { var go = $('go'); if (go && !go.disabled) { go.click(); } }, 1200); }
if (SUBS) { $('lgs').classList.remove('hide'); }
if (INV && !HK) { fetch(CODE + '/invitee/' + encodeURIComponent(INV)).then(function (r) { return r.json(); }).then(function (j) { if (j.name) { $('nm').classList.add('hide'); $('nm').value = j.name; $('hi').textContent = 'Hola, ' + j.name.split(' ')[0]; $('hi').classList.remove('hide'); } }).catch(function () { /* escribe su nombre */ }); }
if (GUEST && !HK && !EXTRA) { $('nm').classList.add('hide'); $('nm').value = GUEST; $('hi').textContent = 'Hola, ' + GUEST.split(' ')[0]; $('hi').classList.remove('hide'); }
(function () { var sp = '', rd = ''; try { sp = localStorage.getItem('meet-speak') || ''; rd = localStorage.getItem('meet-read') || ''; } catch (e) { /* nada */ } sp = sp || (HK ? 'es' : 'en'); rd = rd || sp; $('sp').value = sp; $('rd').value = rd; })();
$('sp').onchange = function () { if ($('rd').dataset.t !== '1') { $('rd').value = $('sp').value; } }; $('rd').onchange = function () { $('rd').dataset.t = '1'; };

/* ---------------- fichas de video ---------------- */
var pinned = '', layoutMode = 'grid', speakerId = '', tiles = {};
function initial(n) { return (n || '?').trim().charAt(0).toUpperCase(); }
function tileFor(p, local) {
  var id = 't-' + (local ? 'me' : p.identity), t = $(id); if (t) { return t; }
  t = document.createElement('div'); t.className = 'tile' + (local ? ' me' : ''); t.id = id; t.dataset.who = local ? 'me' : p.identity;
  t.innerHTML = '<div class="av">' + esc(initial(p.name)) + '</div><div class="nm"><span class="hnd">✋</span><span class="mi">🔇</span><span class="tn"></span></div><div class="tb"><button class="pin" title="Fijar en grande">📌</button>' + (J && J.host && !local ? '<button class="tmute" title="Silenciar a esta persona">🔇</button><button class="trm" title="Sacar de la llamada">⛔</button>' : '') + '</div>';
  if (J && J.host && !local) { t.querySelector('.tmute').onclick = function () { hostCmd('mute', p.identity); }; t.querySelector('.trm').onclick = function () { hostCmd('remove', p.identity, p.name); }; }
  t.querySelector('.tn').textContent = (p.name || 'Invitado') + (local ? ' (tú)' : '');
  t.querySelector('.pin').onclick = function () { pinned = pinned === id ? '' : id; relayout(); };
  $('grid').appendChild(t); tiles[id] = t; micState(p, local); relayout(); return t;
}
function attach(track, p, local) {
  if (track.kind === 'video') {
    var share = track.source === 'screen_share', t;
    if (share) { t = document.createElement('div'); t.className = 'tile share'; t.id = 's-' + (local ? 'me' : p.identity); t.innerHTML = '<div class="nm"><span class="tn"></span></div><div class="tb"><button class="pin" title="Fijar">📌</button></div>'; t.querySelector('.tn').textContent = 'Pantalla de ' + (local ? 'ti' : (p.name || '')); $('grid').appendChild(t); }
    else { t = tileFor(p, local); }
    var v = t.querySelector('video'); if (!v) { v = document.createElement('video'); v.autoplay = true; v.playsInline = true; if (local) { v.muted = true; } t.insertBefore(v, t.firstChild); }
    track.attach(v); var av = t.querySelector('.av'); if (av) { av.classList.add('hide'); } relayout();
  } else if (!local) { var a = track.attach(); a.id = 'a-' + track.sid; document.body.appendChild(a); }
}
function detach(track, p) {
  track.detach().forEach(function (e) { if (e.tagName === 'AUDIO') { e.remove(); } });
  if (track.kind === 'video') {
    if (track.source === 'screen_share') { var s = $('s-' + p.identity); if (s) { s.remove(); } }
    else { var t = $('t-' + p.identity); if (t) { var av = t.querySelector('.av'); if (av) { av.classList.remove('hide'); } var v = t.querySelector('video'); if (v) { v.remove(); } } }
    relayout();
  }
}
// pantalla compartida o ficha fijada → grande al centro y las demás a un lado (como Meet); modo «orador»: quien habla va grande
function relayout() {
  var g = $('grid'), all = [].slice.call(g.children), big = g.querySelector('.tile.share');
  if (!big && pinned && $(pinned)) { big = $(pinned); }
  if (!big && layoutMode === 'speaker' && speakerId && $(speakerId)) { big = $(speakerId); }
  all.forEach(function (t) { t.classList.remove('big'); });
  if (big && all.length > 1) { g.classList.add('spot'); big.classList.add('big'); g.style.setProperty('--span', Math.max(1, all.length - 1)); } else { g.classList.remove('spot'); g.style.removeProperty('--span'); }
  g.querySelectorAll('.pin').forEach(function (b) { b.textContent = '📌'; });
}
function micState(p, local) {
  var t = $('t-' + (local ? 'me' : p.identity)); if (!t) { return; }
  var on = local ? room && room.localParticipant.isMicrophoneEnabled : p.isMicrophoneEnabled; t.classList.toggle('mm', !on);
}
var clockT = null, startLocal = 0;
function fmtClock(ms) { var t = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), sec = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sec).padStart(2, '0'); }
function startClock() { startLocal = J.startedAt - (J.now - Date.now()); clearInterval(clockT); var tick = function () { $('clock').textContent = '⏱ ' + fmtClock(Date.now() - startLocal); }; tick(); clockT = setInterval(tick, 1000); }
function count() { var n = room ? room.remoteParticipants.size + 1 : 0; $('cnt').textContent = n + (n === 1 ? ' persona' : ' personas'); $('pcount').textContent = n; $('wait').classList.toggle('hide', n > 1); renderPeople(); }

/* ---------------- personas y solicitudes de ingreso ---------------- */
var pend = [];
function who(p) { return {id: p.identity, name: p.name || 'Invitado', mic: p.isMicrophoneEnabled, hand: (p.attributes || {}).hand === '1'}; }
// el CRM (ventana de la llamada) recibe quién está en la sala y a qué ficha corresponde, para mostrar su información sin salir de la llamada
function emitPeople(list) {
  var out = list.map(function (x) { var p = x.me ? room.localParticipant : room.remoteParticipants.get(x.id), ref = null; try { ref = p && p.metadata ? JSON.parse(p.metadata) : null; } catch (e) { /* sin ficha */ } return {id: x.id, name: x.name, me: !!x.me, host: String(x.id).indexOf('h-') === 0 || (x.me && !!J.host), hand: x.hand, mic: x.mic, ref: ref}; });
  try { parent.postMessage({k: 'ch-meet', ev: 'people', people: out, started: startLocal}, '*'); } catch (e) { /* sin CRM */ }
}
function renderPeople() {
  if (!room) { return; }
  var me = room.localParticipant, list = [Object.assign(who(me), {me: true})].concat(Array.from(room.remoteParticipants.values()).map(who));
  $('plist').innerHTML = list.map(function (x) {
    return '<div class="pr" data-pid="' + esc(x.id) + '"><span class="av2">' + esc(initial(x.name)) + '</span><span class="n">' + esc(x.name) + (x.me ? ' (tú)' : '') + '</span>' + (x.hand ? '<span class="st">✋</span>' : '') + '<span class="st">' + (x.mic ? '🎤' : '🔇') + '</span>' +
      (J.host && !x.me ? '<button data-mute="' + esc(x.id) + '" title="Silenciar">🔇</button><button data-rm="' + esc(x.id) + '" title="Quitar de la llamada">⛔</button>' : '') + '</div>';
  }).join('');
  emitPeople(list);
  var rq = $('reqlist'); $('reqs').classList.toggle('hide', !pend.length);
  rq.innerHTML = pend.map(function (k) { return '<div class="rq"><b>' + esc(k.name) + '</b><button data-ad="' + esc(k.id) + '">Admitir</button><button class="no" data-dn="' + esc(k.id) + '">Rechazar</button></div>'; }).join('');
  var b = $('pbadge'); b.textContent = pend.length; b.classList.toggle('hide', !pend.length);
  $('bp').classList.toggle('act', pend.length > 0);
}
// Ventana aparte (sin el panel del CRM): el anfitrión ve aquí la ficha de la persona (el Hub la consulta al CRM; solo registros ligados a esta llamada)
function showFicha(pid) {
  var p = room.remoteParticipants.get(pid); if (!p) { return; }
  var ref = null; try { ref = p.metadata ? JSON.parse(p.metadata) : null; } catch (e) { /* sin ficha */ }
  var box = $('fcard'); if (!box) { box = document.createElement('div'); box.id = 'fcard'; document.body.appendChild(box); }
  box.innerHTML = '<div class="fh"><b>' + esc(p.name || p.identity) + '</b><button class="fx" title="Cerrar">✕</button></div><div class="fr">Buscando en el CRM…</div>'; box.classList.remove('hide');
  box.querySelector('.fx').onclick = function () { box.classList.add('hide'); };
  fetch(CODE + '/ficha?h=' + encodeURIComponent(HK) + '&n=' + encodeURIComponent(p.name || '') + '&r=' + encodeURIComponent(ref && ref.l || '')).then(function (r) { return r.ok ? r.json() : null; }).then(function (f) {
    var row = function (ic, v) { return v ? '<div class="fr">' + ic + ' ' + esc(v) + '</div>' : ''; };
    if (!f || !f.found) { box.querySelector('.fr').textContent = 'No encontré a esta persona entre los invitados de la reunión. Búscala en el CRM.'; return; }
    box.innerHTML = '<div class="fh"><b>' + esc(f.name) + '</b><button class="fx" title="Cerrar">✕</button></div>' + row('🚩', f.status) + row('📞', f.phone) + row('✉️', f.email) + row('🏢', f.account) + row('👤', f.assigned ? 'Asignado a ' + f.assigned : '') + row('🏷️', f.source) +
      '<div class="fa"><a href="' + esc(f.url) + '" target="_blank" rel="noopener">Abrir la ficha en el CRM ↗</a></div>';
    box.querySelector('.fx').onclick = function () { box.classList.add('hide'); };
  }).catch(function () { box.querySelector('.fr').textContent = 'No se pudo consultar el CRM.'; });
}
function hostCmd(action, id, name) {
  if (action === 'remove' && !confirm('¿Sacar a ' + (name || 'esta persona') + ' de la llamada?')) { return; }
  post('admin', {host: HK, action: action, identity: id}).then(function () { toast(action === 'mute' ? 'Silenciado' : 'Sacado de la llamada', 2500); }).catch(function () { toast('No se pudo completar la acción.'); });
}
// el CRM (panel de la llamada) también puede silenciar o sacar a un participante
window.addEventListener('message', function (e) { var d = e.data; if (e.source !== parent || !d || d.k !== 'ch-cmd' || !J || !J.host) { return; } if (d.cmd === 'mute' || d.cmd === 'remove') { hostCmd(d.cmd, d.id, d.name); } });
$('p-people').onclick = function (e) {
  var a = e.target.closest('button');
  if (!a) { var row = e.target.closest('.pr[data-pid]'); if (row) { if (window.parent !== window) { try { parent.postMessage({k: 'ch-meet', ev: 'person', id: row.dataset.pid}, '*'); } catch (x) { /* sin CRM */ } } else if (J && J.host) { showFicha(row.dataset.pid); } } return; }
  if (a.dataset.ad || a.dataset.dn) { decide(a.dataset.ad || a.dataset.dn, !!a.dataset.ad); }
  else if (a.dataset.mute) { hostCmd('mute', a.dataset.mute); }
  else if (a.dataset.rm) { hostCmd('remove', a.dataset.rm); }
};
$('admitall').onclick = function () { pend.slice().forEach(function (k) { decide(k.id, true); }); };
function decide(id, ok) {
  var k = pend.filter(function (x) { return x.id === id; })[0]; pend = pend.filter(function (x) { return x.id !== id; });
  // primero se avisa al servidor (si el repintado fallara por cualquier cosa, la decisión no se pierde) y se confirma o se avisa del error
  var sent = post('decide', {host: HK, id: id, admit: ok}).then(function (r) { return r.ok ? r.json() : Promise.reject(); }).then(function (j) { toast(j.ok ? (ok ? (k ? k.name + ' ya puede entrar' : 'Admitido') : 'Solicitud rechazada') : 'Esa solicitud ya no estaba pendiente', 2500); })
    .catch(function () { if (k) { pend.push(k); seen[k.id] = 0; } toast('No se pudo completar. Vuelve a intentarlo.', 4000); try { renderPeople(); } catch (e) { /* nada */ } });
  try { renderPeople(); } catch (e) { console.warn('personas', e); }
  return sent;
}
var seen = {};
function startPending() {
  setInterval(function () {
    fetch(CODE + '/pending?h=' + encodeURIComponent(HK)).then(function (r) { return r.ok ? r.json() : null; }).then(function (r) {
      if (!r) { return; } var fresh = false;
      r.items.forEach(function (k) { if (!seen[k.id]) { seen[k.id] = 1; fresh = true; reqToast(k); } });
      pend = r.items; renderPeople(); document.querySelectorAll('#toast .tt[data-k]').forEach(function (t) { if (!pend.some(function (k) { return k.id === t.dataset.k; })) { t.remove(); } });
      if (fresh) { beep(); }
    }).catch(function () { /* se reintenta */ });
  }, 2000);
}

/* ---------------- panel lateral ---------------- */
var tab = 'people', unread = 0;
function openSide(t) { tab = t || tab; $('side').classList.remove('hide'); document.querySelectorAll('.stabs button[data-t]').forEach(function (b) { b.classList.toggle('on', b.dataset.t === tab); }); $('p-people').classList.toggle('hide', tab !== 'people'); $('p-chat').classList.toggle('hide', tab !== 'chat'); if (tab === 'chat') { unread = 0; $('cbadge').classList.add('hide'); $('cdot').classList.add('hide'); $('msgs').scrollTop = 1e9; $('cin').focus(); } }
function closeSide() { $('side').classList.add('hide'); }
document.querySelectorAll('.stabs button[data-t]').forEach(function (b) { b.onclick = function () { openSide(b.dataset.t); }; });
$('sx').onclick = closeSide;
$('bp').onclick = function () { if (!$('side').classList.contains('hide') && tab === 'people') { closeSide(); } else { openSide('people'); } };
$('bch').onclick = function () { if (!$('side').classList.contains('hide') && tab === 'chat') { closeSide(); } else { openSide('chat'); } };

/* ---------------- chat: mensajes, imágenes, archivos y enlaces ---------------- */
var chatIds = {};
function linkify(t) { return esc(t).replace(/((?:https?:\/\/|www\.)[^\s<]+)/gi, function (m) { var u = m.replace(/[.,;:!?)]+$/, ''), tail = m.slice(u.length); return '<a href="' + (/^https?:/i.test(u) ? u : 'https://' + u) + '" target="_blank" rel="noopener noreferrer">' + u + '</a>' + tail; }); }
function kb(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
function addMsg(m, mine) {
  if (chatIds[m.id]) { return; } chatIds[m.id] = 1;
  var box = $('msgs'); var e0 = box.querySelector('.ch-empty'); if (e0) { e0.remove(); }
  var d = document.createElement('div'); d.className = 'm' + (mine ? ' me' : '');
  var fu = m.f ? CODE + '/' + m.f.url : '';   // la ruta del archivo es relativa a la sala
  var f = m.f ? (/^image\//.test(m.f.type) ? '<a href="' + esc(fu) + '" target="_blank" rel="noopener"><img src="' + esc(fu) + '" alt="' + esc(m.f.name) + '" loading="lazy"></a>' : '<a class="fl" href="' + esc(fu) + '" target="_blank" rel="noopener"><span style="font-size:22px">📄</span><span><b>' + esc(m.f.name) + '</b><small>' + kb(m.f.size) + ' · descargar</small></span></a>') : '';
  var tm = new Date(m.at || Date.now()).toLocaleTimeString('es-CO', {hour: '2-digit', minute: '2-digit'});
  d.innerHTML = (mine ? '' : '<span class="w">' + esc(m.n) + '</span>') + f + (m.t ? '<span>' + linkify(m.t) + '</span>' : '') + '<span class="t">' + tm + '</span>';
  var near = box.scrollHeight - box.scrollTop - box.clientHeight < 90; box.appendChild(d); if (near || mine) { box.scrollTop = 1e9; }
  if (!mine && (tab !== 'chat' || $('side').classList.contains('hide'))) { unread++; $('cbadge').textContent = unread; $('cbadge').classList.remove('hide'); $('cdot').classList.remove('hide'); beep(); }
}
function sendChat(text, file) {
  var m = {id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), n: J.name, t: text, f: file || null, at: new Date().toISOString()};
  addMsg(m, true);
  try { room.localParticipant.publishData(enc({k: 'chat', m: m}), {reliable: true}); } catch (e) { /* sin conexión */ }
  post('chat', {id: m.id, name: m.n, text: m.t, file: m.f}, {'X-Stt-Key': J.sttKey}).catch(function () { /* el reparto en vivo ya salió */ });
}
$('csend').onclick = function () { var t = $('cin').value.trim(); if (t) { sendChat(t, null); $('cin').value = ''; } };
$('cin').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); $('csend').onclick(); } };
function upload(file) {
  if (!file) { return; } if (file.size > 10 * 1048576) { toast('El archivo pesa más de 10 MB.'); return; }
  toast('Subiendo ' + file.name + '…', 2500);
  fetch(CODE + '/file?name=' + encodeURIComponent(file.name || 'imagen.png') + '&type=' + encodeURIComponent(file.type || ''), {method: 'POST', headers: {'X-Stt-Key': J.sttKey, 'Content-Type': file.type || 'application/octet-stream'}, body: file})
    .then(function (r) { return r.json().then(function (j) { if (!r.ok) { throw new Error(j.detail || 'No se pudo subir'); } return j; }); })
    .then(function (f) { sendChat('', {id: f.id, name: f.name, type: f.type, size: f.size, url: f.url}); }).catch(function (e) { toast(e.message || 'No se pudo subir el archivo.', 6000); });
}
$('attb').onclick = function () { $('cfile').click(); };
$('cfile').onchange = function () { upload($('cfile').files[0]); $('cfile').value = ''; };
$('cin').onpaste = function (e) { var it = [].slice.call((e.clipboardData || {}).items || []).find(function (i) { return /^image\//.test(i.type); }); if (it) { e.preventDefault(); upload(it.getAsFile()); } };
$('p-chat').ondragover = function (e) { e.preventDefault(); }; $('p-chat').ondrop = function (e) { e.preventDefault(); upload(e.dataTransfer.files[0]); };

/* ---------------- reacciones y mano levantada ---------------- */
function float(e, name) { var d = document.createElement('div'); d.className = 'fx'; d.style.left = (10 + Math.random() * 70) + '%'; d.innerHTML = esc(e) + '<small>' + esc(name) + '</small>'; $('rx').appendChild(d); setTimeout(function () { d.remove(); }, 3100); }
$('br').onclick = function (e) { e.stopPropagation(); pop('rxp'); };
$('rxp').onclick = function (e) { var b = e.target.closest('button'); if (!b) { return; } float(b.textContent, 'Tú'); try { room.localParticipant.publishData(enc({k: 'react', e: b.textContent, n: J.name}), {reliable: false}); } catch (x) { /* nada */ } hidePops(); };
var hand = false;
$('bh').onclick = function () { hand = !hand; $('bh').classList.toggle('act', hand); try { room.localParticipant.setAttributes({hand: hand ? '1' : ''}); } catch (e) { /* nada */ } var t = $('t-me'); if (t) { t.classList.toggle('hand', hand); } renderPeople(); };

/* ---------------- grabación de la videollamada (solo el anfitrión; todos ven el aviso) ----------------
   Se graba la pestaña con el navegador (MediaRecorder) y se sube por partes al Hub; queda en «Grabaciones» del CRM. Audio opcional: voces de los demás y/o micrófono propio (por defecto, sin audio). */
var rec = null, recSeenAt = 0;
function recSeen(m) {
  var b = $('recbanner'); recSeenAt = Date.now();
  if (m.on) { b.textContent = 'Se está grabando esta videollamada' + (m.n ? ' · ' + m.n : ''); b.classList.remove('hide'); if (!m.hb) { toast('⏺ ' + (m.n || 'El anfitrión') + ' empezó a grabar la videollamada.', 6000); } }
  else { b.classList.add('hide'); toast('La grabación terminó.', 4000); }
}
setInterval(function () { if (!rec && recSeenAt && Date.now() - recSeenAt > 45000) { $('recbanner').classList.add('hide'); recSeenAt = 0; } }, 5000);
function recAnnounce(on, hb) { try { room.localParticipant.publishData(enc({k: 'rec', on: on, n: J.name, hb: !!hb}), {reliable: true}); } catch (e) { /* sin conexión */ } }
function recClick() { if (rec) { recStop(); } else { hidePops('recp'); $('rec-msg').textContent = ''; $('recp').classList.remove('hide'); } }
$('brec').onclick = function (e) { e.stopPropagation(); recClick(); };
function recMime() { var l = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']; for (var i = 0; i < l.length; i++) { try { if (MediaRecorder.isTypeSupported(l[i])) { return l[i]; } } catch (e) { /* nada */ } } return ''; }
$('rec-go').onclick = function () {
  if (rec) { return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia || !window.MediaRecorder) { $('rec-msg').textContent = 'Este navegador no puede grabar. Usa Chrome o Edge de escritorio.'; return; }
  var wantCall = $('rec-call').checked, wantMic = $('rec-mic').checked, mime = recMime();
  navigator.mediaDevices.getDisplayMedia({video: {frameRate: {ideal: 24, max: 30}}, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include'}).then(function (display) {
    var ctx = null, dest = null, srcs = {}, tracks = [];
    function addAudio(t, id) { if (!ctx || srcs[id] || !t) { return; } try { srcs[id] = ctx.createMediaStreamSource(new MediaStream([t])); srcs[id].connect(dest); } catch (e) { /* pista no válida */ } }
    if (wantCall || wantMic) { var AC = window.AudioContext || window.webkitAudioContext; ctx = new AC(); dest = ctx.createMediaStreamDestination(); if (ctx.state === 'suspended') { ctx.resume(); } tracks = dest.stream.getAudioTracks(); }
    function sync() {
      if (!ctx) { return; }
      if (wantCall) { room.remoteParticipants.forEach(function (p) { p.trackPublications.forEach(function (pb) { if (pb.kind === 'audio' && pb.track && pb.track.mediaStreamTrack) { addAudio(pb.track.mediaStreamTrack, pb.trackSid); } }); }); }
      if (wantMic) { room.localParticipant.trackPublications.forEach(function (pb) { if (pb.source === 'microphone' && pb.track && pb.track.mediaStreamTrack) { addAudio(pb.track.mediaStreamTrack, 'mic'); } }); }
    }
    sync();
    return post('rec/start', {host: HK, audio: tracks.length > 0, mime: mime.split(';')[0] || 'video/webm', name: J.name}).then(function (r) { return r.json().then(function (j) { if (!r.ok) { throw new Error(j.detail || 'No se pudo iniciar la grabación.'); } return j; }); }).then(function (up) {
      var out = new MediaStream(display.getVideoTracks().concat(tracks)), mr = new MediaRecorder(out, mime ? {mimeType: mime, videoBitsPerSecond: 2500000, audioBitsPerSecond: 96000} : {});
      rec = {mr: mr, up: up, display: display, ctx: ctx, seq: 0, queue: [], pumping: false, t0: Date.now(), sync: sync, hb: null, timer: null};
      mr.ondataavailable = function (e) { if (rec && e.data && e.data.size) { rec.queue.push(e.data); recPump(); } };
      mr.start(4000);
      display.getVideoTracks()[0].addEventListener('ended', function () { recStop(); });
      rec.sync2 = setInterval(sync, 3000); recAnnounce(true); rec.hb = setInterval(function () { recAnnounce(true, true); }, 15000);
      $('brec').classList.add('on'); $('brec').title = 'Detener la grabación';
      $('recbanner').textContent = 'Grabando la videollamada · 0:00'; $('recbanner').classList.remove('hide'); recSeenAt = 0;
      rec.timer = setInterval(function () { var s = Math.floor((Date.now() - rec.t0) / 1000); $('recbanner').textContent = 'Grabando la videollamada · ' + Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }, 1000);
      hidePops();
    }).catch(function (e) { display.getTracks().forEach(function (t) { t.stop(); }); try { ctx && ctx.close(); } catch (x) { /* nada */ } $('rec-msg').textContent = e.message || 'No se pudo iniciar la grabación.'; });
  }).catch(function () { /* canceló el selector */ });
};
function recPump() {
  if (!rec || rec.pumping) { return; } rec.pumping = true; var cur = rec;
  (function next() {
    if (!cur.queue.length) { cur.pumping = false; return; }
    fetch(cur.up.url + '/chunk?seq=' + cur.seq, {method: 'POST', headers: {'X-Rec-Key': cur.up.key, 'Content-Type': 'application/octet-stream'}, body: cur.queue[0]}).then(function (r) {
      if (r.status === 403 || r.status === 404 || r.status === 422) { cur.queue = []; cur.dead = true; cur.pumping = false; return; }
      if (!r.ok) { throw new Error('http'); } cur.queue.shift(); cur.seq++; next();
    }).catch(function () { setTimeout(next, 3000); });
  })();
}
function recStop() {
  var cur = rec; if (!cur || cur.stopping) { return; } cur.stopping = true;
  clearInterval(cur.timer); clearInterval(cur.hb); clearInterval(cur.sync2);
  $('recbanner').textContent = 'Guardando la grabación…';
  new Promise(function (res) { cur.mr.onstop = res; try { cur.mr.stop(); } catch (e) { res(); } }).then(function () {
    return new Promise(function (res) { var n = 0; (function w() { if ((!cur.queue.length && !cur.pumping) || cur.dead || n++ > 1500) { res(); } else { setTimeout(w, 300); } })(); });
  }).then(function () {
    cur.display.getTracks().forEach(function (t) { t.stop(); }); try { cur.ctx && cur.ctx.close(); } catch (e) { /* nada */ }
    return fetch(cur.up.url + '/finish', {method: 'POST', headers: {'X-Rec-Key': cur.up.key, 'Content-Type': 'application/json'}, body: JSON.stringify({duration: Math.round((Date.now() - cur.t0) / 1000)})}).then(function (r) { return r.json(); });
  }).then(function (j) { toast(j.ok ? '✅ Grabación guardada en «Grabaciones» del CRM.' : 'La grabación quedó vacía y no se guardó.', 7000); }, function () { toast('No se pudo terminar de guardar la grabación.', 7000); })
    .then(function () { rec = null; $('brec').classList.remove('on'); $('brec').title = 'Grabar la videollamada'; $('recbanner').classList.add('hide'); if (room) { recAnnounce(false); } });
}

/* ---------------- ventanitas ---------------- */
var POPS = ['rxp', 'lgp', 'more', 'bgp', 'devp', 'invp', 'recp'];
function hidePops(except) { POPS.forEach(function (p) { if (p !== except) { $(p).classList.add('hide'); } }); }
function pop(id) { var el = $(id), was = !el.classList.contains('hide'); hidePops(); if (!was) { el.classList.remove('hide'); } }
document.addEventListener('click', function (e) { if (!e.target.closest('.pop') && !e.target.closest('#bar') && !e.target.closest('#langb')) { hidePops(); } });

/* ---------------- fondos virtuales (segmentación de persona local; nada sale del navegador) ---------------- */
var BGS = [{id: 'none', t: 'Ninguno'}, {id: 'blur1', t: 'Desenfoque suave'}, {id: 'blur2', t: 'Desenfoque fuerte'}, {id: 'oficina', t: 'Oficina', img: '_/assets/bg/oficina.svg'}, {id: 'sala', t: 'Sala', img: '_/assets/bg/sala.svg'},
  {id: 'montanas', t: 'Montañas', img: '_/assets/bg/montanas.svg'}, {id: 'playa', t: 'Playa', img: '_/assets/bg/playa.svg'}, {id: 'atardecer', t: 'Atardecer', img: '_/assets/bg/atardecer.svg'}, {id: 'degradado', t: 'Degradado', img: '_/assets/bg/degradado.svg'}, {id: 'own', t: '＋ Mi imagen'}];
var BASE = new URL('_/assets/', document.baseURI).href, bgCur = 'none', bgImg = null, segmenter = null, segLoading = null;
function loadSeg() {
  if (segmenter) { return Promise.resolve(segmenter); } if (segLoading) { return segLoading; }
  segLoading = import(BASE + 'mp/vision_bundle.mjs').then(function (m) { return m.FilesetResolver.forVisionTasks(BASE + 'mp').then(function (fs) { var mk = function (d) { return m.ImageSegmenter.createFromOptions(fs, {baseOptions: {modelAssetPath: BASE + 'mp/selfie_segmenter.tflite', delegate: d}, runningMode: 'VIDEO', outputCategoryMask: false, outputConfidenceMasks: true}); }; return mk('GPU').catch(function () { return mk('CPU'); }); }); })
    .then(function (s) { segmenter = s; return s; }).catch(function (e) { segLoading = null; throw e; });
  return segLoading;
}
function BgProcessor(kind, img) { this.name = 'crmhub-bg'; this.kind = kind; this.img = img; }
BgProcessor.prototype.init = function (o) {
  var self = this; this.run = true; this.last = 0;
  this.video = document.createElement('video'); this.video.muted = true; this.video.playsInline = true; this.video.srcObject = new MediaStream([o.track]);
  return this.video.play().then(function () {
    var w = self.video.videoWidth || 640, h = self.video.videoHeight || 360, k = Math.min(1, 960 / w); w = Math.round(w * k); h = Math.round(h * k);
    self.c = document.createElement('canvas'); self.c.width = w; self.c.height = h; self.x = self.c.getContext('2d');
    self.p = document.createElement('canvas'); self.p.width = w; self.p.height = h; self.px = self.p.getContext('2d');
    self.m = document.createElement('canvas'); self.mx = self.m.getContext('2d');
    self.processedTrack = self.c.captureStream(30).getVideoTracks()[0];
    return loadSeg().then(function (seg) { self.seg = seg; self.loop(); });
  });
};
BgProcessor.prototype.restart = function (o) { var s = this; return this.destroy().then(function () { return s.init(o); }); };
BgProcessor.prototype.destroy = function () { this.run = false; if (this.video) { this.video.pause(); this.video.srcObject = null; } return Promise.resolve(); };
BgProcessor.prototype.loop = function () {
  var self = this; if (!this.run) { return; }
  var tick = function () { self.frame(); if (self.run) { (self.video.requestVideoFrameCallback ? self.video.requestVideoFrameCallback(tick) : setTimeout(tick, 40)); } }; tick();
};
BgProcessor.prototype.frame = function () {
  var v = this.video, w = this.c.width, h = this.c.height, now = performance.now(); if (v.readyState < 2 || now - this.last < 33) { return; } this.last = now;
  try {
    var res = this.seg.segmentForVideo(v, now), mk = res.confidenceMasks && res.confidenceMasks[0]; if (!mk) { this.x.drawImage(v, 0, 0, w, h); return; }
    var mw = mk.width, mh = mk.height, data = mk.getAsFloat32Array(); if (this.m.width !== mw) { this.m.width = mw; this.m.height = mh; }
    var im = this.mx.createImageData(mw, mh), d = im.data;
    for (var i = 0; i < data.length; i++) { var q = data[i], a = q < 0.35 ? 0 : q > 0.65 ? 1 : (q - 0.35) / 0.3; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255; d[i * 4 + 3] = a * 255; }
    this.mx.putImageData(im, 0, 0); mk.close();
    this.px.globalCompositeOperation = 'source-over'; this.px.clearRect(0, 0, w, h); this.px.drawImage(v, 0, 0, w, h); this.px.globalCompositeOperation = 'destination-in'; this.px.drawImage(this.m, 0, 0, w, h);
    var x = this.x; x.globalCompositeOperation = 'source-over';
    if (this.kind === 'img' && this.img) { var ir = this.img.width / this.img.height, cr = w / h, sw = ir > cr ? this.img.height * cr : this.img.width, sh = ir > cr ? this.img.height : this.img.width / cr; x.drawImage(this.img, (this.img.width - sw) / 2, (this.img.height - sh) / 2, sw, sh, 0, 0, w, h); }
    else { var px = this.kind === 'blur2' ? 22 : 11; if ('filter' in x) { x.filter = 'blur(' + px + 'px)'; x.drawImage(v, 0, 0, w, h); x.filter = 'none'; } else { var sm = Math.max(2, Math.round(w / (px * 3))); this.t = this.t || document.createElement('canvas'); this.t.width = sm; this.t.height = Math.round(sm * h / w); this.t.getContext('2d').drawImage(v, 0, 0, this.t.width, this.t.height); x.drawImage(this.t, 0, 0, w, h); } }
    x.drawImage(this.p, 0, 0, w, h);
  } catch (e) { this.x.drawImage(v, 0, 0, w, h); }
};
function camTrack() { var p = room && room.localParticipant.getTrackPublication(L.Track.Source.Camera); return p && p.track; }
function applyBg(id, img) {
  bgCur = id; bgImg = img || null; $('bgl').querySelectorAll('.bgo').forEach(function (b) { b.classList.toggle('on', b.dataset.id === id); });
  var t = camTrack(); if (!t) { $('bgm').textContent = 'Enciende la cámara para ver el fondo.'; return; }
  if (id === 'none') { $('bgm').textContent = ''; return t.stopProcessor ? t.stopProcessor() : null; }
  $('bgm').textContent = 'Preparando el fondo… (la primera vez descarga el modelo)';
  var proc = new BgProcessor(id === 'blur1' || id === 'blur2' ? id : 'img', img);
  return Promise.resolve(t.setProcessor(proc)).then(function () { $('bgm').textContent = ''; }).catch(function (e) { console.warn('fondo', e); $('bgm').textContent = 'Tu navegador no admite fondos virtuales.'; bgCur = 'none'; });
}
function buildBgs() {
  $('bgl').innerHTML = BGS.map(function (b) { return '<button class="bgo' + (b.id === bgCur ? ' on' : '') + '" data-id="' + b.id + '"' + (b.img ? ' style="background-image:url(' + b.img + ')"' : '') + ' title="' + esc(b.t) + '">' + (b.img ? '' : esc(b.t)) + '</button>'; }).join('');
}
$('bgl').onclick = function (e) {
  var b = e.target.closest('.bgo'); if (!b) { return; } var def = BGS.find(function (x) { return x.id === b.dataset.id; });
  if (def.id === 'own') { var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.onchange = function () { var f = inp.files[0]; if (!f) { return; } var im = new Image(); im.onload = function () { applyBg('own', im); }; im.src = URL.createObjectURL(f); }; inp.click(); return; }
  if (def.img) { var im = new Image(); im.onload = function () { applyBg(def.id, im); }; im.src = def.img; } else { applyBg(def.id, null); }
};

/* ---------------- dispositivos ---------------- */
function fillDevices() {
  [['audioinput', 'd-mic'], ['videoinput', 'd-cam'], ['audiooutput', 'd-spk']].forEach(function (x) {
    L.Room.getLocalDevices(x[0]).then(function (ds) { var cur = room.getActiveDevice(x[0]); $(x[1]).innerHTML = ds.map(function (d) { return '<option value="' + esc(d.deviceId) + '"' + (d.deviceId === cur ? ' selected' : '') + '>' + esc(d.label || x[0]) + '</option>'; }).join('') || '<option>(no disponible)</option>'; }).catch(function () { /* sin permiso */ });
    $(x[1]).onchange = function () { room.switchActiveDevice(x[0], $(x[1]).value).catch(function () { toast('No se pudo cambiar el dispositivo.'); }); };
  });
}

/* ---------------- invitar a más personas ---------------- */
function openInvite() { hidePops('invp'); $('invurl').value = location.origin + '/' + CODE + '?i=1'; $('invmsg').textContent = ''; $('invp').classList.remove('hide'); }
$('invb').onclick = openInvite;
$('invcopy').onclick = function () { $('invurl').select(); (navigator.clipboard ? navigator.clipboard.writeText($('invurl').value) : Promise.reject()).catch(function () { document.execCommand('copy'); }).then(function () { $('invmsg').textContent = 'Enlace copiado.'; }, function () { /* nada */ }); };
$('invsend').onclick = function () { var to = $('invto').value.trim(); if (!to) { return; } $('invmsg').textContent = 'Enviando…';
  post('invite', {host: HK, to: to}).then(function (r) { return r.json().then(function (j) { $('invmsg').textContent = r.ok ? 'Invitación enviada a ' + to : (j.detail || 'No se pudo enviar.'); if (r.ok) { $('invto').value = ''; } }); }).catch(function () { $('invmsg').textContent = 'No se pudo enviar.'; }); };

/* ---------------- menú «más» ---------------- */
var locked = false;
function buildMore() {
  var h = '<button data-a="bg">🖼️ Fondos y efectos</button><button data-a="dev">⚙️ Audio y video</button><button data-a="lay">' + (layoutMode === 'speaker' ? '▦ Vista de cuadrícula' : '👤 Vista de orador') + '</button><button data-a="full">⛶ Pantalla completa</button><button data-a="inv">➕ Invitar a más personas</button>' + (window.parent !== window ? '<button data-a="pop">↗ Abrir en otra ventana</button>' : '');
  if (J.host) { h += '<hr><div class="hl">Anfitrión</div><button data-a="rec">' + (rec ? '⏹ Detener la grabación' : '⏺ Grabar la videollamada') + '</button><button data-a="muteall">🔇 Silenciar a todos</button><button data-a="lock">' + (locked ? '🔓 Desbloquear la sala' : '🔒 Bloquear la sala') + '</button><button data-a="end">⛔ Terminar para todos</button>'; }
  $('more').innerHTML = h;
}
$('bmore').onclick = function (e) { e.stopPropagation(); buildMore(); pop('more'); };
$('more').onclick = function (e) {
  var b = e.target.closest('button'); if (!b) { return; } var a = b.dataset.a;
  if (a === 'rec') { recClick(); }
  else if (a === 'bg') { hidePops('bgp'); buildBgs(); $('bgp').classList.remove('hide'); }
  else if (a === 'dev') { hidePops('devp'); fillDevices(); $('devp').classList.remove('hide'); }
  else if (a === 'lay') { layoutMode = layoutMode === 'speaker' ? 'grid' : 'speaker'; hidePops(); relayout(); toast(layoutMode === 'speaker' ? 'Vista de orador' : 'Vista de cuadrícula', 1800); }
  else if (a === 'full') { hidePops(); (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(function () { /* sin permiso */ }); }
  else if (a === 'inv') { openInvite(); }
  else if (a === 'pop') { hidePops(); try { parent.postMessage({k: 'ch-meet', ev: 'popout'}, '*'); } catch (e) { /* sin CRM */ } }
  else if (a === 'muteall') { hidePops(); post('admin', {host: HK, action: 'mute_all'}).then(function () { toast('Todos silenciados'); }); }
  else if (a === 'lock') { hidePops(); post('admin', {host: HK, action: locked ? 'unlock' : 'lock'}).then(function (r) { return r.json(); }).then(function (j) { locked = !!j.locked; toast(locked ? 'Sala bloqueada: nadie más puede pedir entrar' : 'Sala desbloqueada'); }); }
  else if (a === 'end') { hidePops(); if (confirm('¿Terminar la videollamada para todos?')) { post('admin', {host: HK, action: 'end'}).then(function () { leave(); }); } }
};

/* ---------------- subtítulos en vivo ---------------- */
var subsShow = true, capCtx = null, lines = [];
function showLine(name, m, mine) {
  if (J.read === 'off') { return; }
  var txt = mine ? m.t : (m.l === J.read ? m.t : (m.tr && m.tr[J.read]) || m.t), orig = (!mine && txt !== m.t) ? m.t : '';
  var el = document.createElement('div'); el.className = 'sl'; var b = document.createElement('b'); b.textContent = name; var d = document.createElement('span'); d.textContent = txt; el.appendChild(b); el.appendChild(d);
  if (orig) { var o = document.createElement('small'); o.textContent = orig; el.appendChild(o); }
  $('subs').appendChild(el); lines.push(el); while (lines.length > 3) { var x = lines.shift(); if (x.parentNode) { x.parentNode.removeChild(x); } }
  setTimeout(function () { if (el.parentNode) { el.parentNode.removeChild(el); } lines = lines.filter(function (q) { return q !== el; }); }, 4000 + txt.length * 60);
}
function wavOf(chunks, rate) {
  var n = 0; chunks.forEach(function (c) { n += c.length; }); var all = new Float32Array(n), o = 0; chunks.forEach(function (c) { all.set(c, o); o += c.length; });
  var ratio = rate / 16000, len = Math.floor(n / ratio), pcm = new Int16Array(len);
  for (var i = 0; i < len; i++) { var a = Math.floor(i * ratio), b = Math.min(n, Math.floor((i + 1) * ratio)), sum = 0, k = 0; for (var j = a; j < b; j++) { sum += all[j]; k++; } var v = k ? sum / k : 0; v = Math.max(-1, Math.min(1, v)); pcm[i] = v < 0 ? v * 32768 : v * 32767; }
  var buf = new ArrayBuffer(44 + len * 2), dv = new DataView(buf); function w(off, str) { for (var q = 0; q < str.length; q++) { dv.setUint8(off + q, str.charCodeAt(q)); } }
  w(0, 'RIFF'); dv.setUint32(4, 36 + len * 2, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, 16000, true); dv.setUint32(28, 32000, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, len * 2, true);
  for (var m = 0; m < len; m++) { dv.setInt16(44 + m * 2, pcm[m], true); } return new Blob([buf], {type: 'audio/wav'});
}
// idiomas a los que hay que traducir lo que digo: los que quienes están en la sala eligieron para leer (cada quien publica el suyo)
function targets() {
  var t = []; room.remoteParticipants.forEach(function (p) { var r = (p.attributes || {}).read; if (r && r !== 'off' && r !== J.speak && t.indexOf(r) < 0) { t.push(r); } });
  return t.length ? t.slice(0, 3) : [J.speak === 'es' ? 'en' : 'es'];
}
function publishLang() { try { room.localParticipant.setAttributes({speak: J.speak, read: J.read}); } catch (e) { /* nada */ } }
function sendSub(blob) {
  fetch(CODE + '/stt?lang=' + J.speak + '&n=' + encodeURIComponent(J.name || '') + '&to=' + targets().join(','), {method: 'POST', headers: {'X-Stt-Key': J.sttKey}, body: blob}).then(function (r) { return r.ok ? r.json() : null; }).then(function (r) {
    if (!r || !r.text) { return; } if (subsShow) { showLine('Tú', {t: r.text, l: r.lang}, true); }
    try { room.localParticipant.publishData(enc({k: 'sub', n: J.name, l: r.lang, t: r.text, tr: r.tr || {}}), {reliable: true}); } catch (e) { /* nada */ }
  }).catch(function () { /* se omite la frase */ });
}
function hookMic(mt) {
  if (!J || !J.subtitles || capCtx || !mt) { return; } var AC = window.AudioContext || window.webkitAudioContext; if (!AC) { return; }
  capCtx = new AC(); var rate = capCtx.sampleRate, src = capCtx.createMediaStreamSource(new MediaStream([mt])), proc = capCtx.createScriptProcessor(4096, 1, 1); src.connect(proc); proc.connect(capCtx.destination);
  var pre = [], cur = [], speaking = false, voiced = 0, silent = 0, seg = 0;
  function flush() { var ok = voiced >= 400, c = cur; cur = []; speaking = false; voiced = 0; silent = 0; seg = 0; if (ok) { sendSub(wavOf(c, rate)); } }
  proc.onaudioprocess = function (e) {
    var d = e.inputBuffer.getChannelData(0), s = 0; for (var i = 0; i < d.length; i++) { s += d[i] * d[i]; } var rms = Math.sqrt(s / d.length), ms = d.length / rate * 1000, copy = new Float32Array(d), loud = rms > 0.012;
    if (!speaking) { pre.push(copy); if (pre.length > 2) { pre.shift(); } if (loud) { voiced += ms; if (voiced >= 120) { speaking = true; cur = pre.slice(); pre = []; seg = cur.length * ms; silent = 0; } } else { voiced = 0; } return; }
    cur.push(copy); seg += ms; if (loud) { voiced += ms; silent = 0; } else { silent += ms; } if (silent >= 700 || seg >= 12000) { flush(); }
  };
}
var LN = {es: 'español', en: 'inglés', pt: 'portugués', fr: 'francés', de: 'alemán', it: 'italiano'};
function langLabel() { if (J) { $('langb').textContent = 'Subtítulos · ' + (J.read === 'off' ? 'apagados' : 'leo en ' + (LN[J.read] || J.read)); } }
function applyLang() { if (!J) { return; } J.speak = $('sp2').value; J.read = $('rd2').value; subsShow = J.read !== 'off'; $('bcc').classList.toggle('on', subsShow); if (!subsShow) { $('subs').innerHTML = ''; lines = []; } try { localStorage.setItem('meet-speak', J.speak); localStorage.setItem('meet-read', J.read); } catch (e) { /* nada */ } langLabel(); publishLang(); }
$('sp2').onchange = applyLang; $('rd2').onchange = applyLang;
$('bcc').onclick = function (e) { e.stopPropagation(); pop('lgp'); }; $('langb').onclick = function (e) { e.stopPropagation(); pop('lgp'); };

/* ---------------- conexión a la sala ---------------- */
function leave() { if (rec) { recStop(); var n = 0; (function w() { if (!rec || n++ > 300) { leave2(); } else { setTimeout(w, 300); } })(); return; } leave2(); }
function leave2() { try { if (room) { room.disconnect(); } } catch (e) { /* nada */ } try { parent.postMessage({k: 'ch-meet', ev: 'left'}, '*'); } catch (e) { /* nada */ } }
function startRoom(j) {
  j.speak = $('sp').value; j.read = $('rd').value; J = j; subsShow = j.read !== 'off'; locked = !!j.locked; if (j.host) { $('brec').classList.remove('hide'); }
  room = new L.Room({adaptiveStream: true, dynacast: true, audioCaptureDefaults: {noiseSuppression: true, echoCancellation: true, autoGainControl: true}});
  var E = L.RoomEvent;
  room.on(E.DataReceived, function (payload, p) {
    try { var m = JSON.parse(new TextDecoder().decode(payload));
      if (m.k === 'sub' && subsShow) { showLine(m.n || (p && p.name) || '', m, false); }
      else if (m.k === 'chat' && m.m) { addMsg(m.m, false); }
      else if (m.k === 'rec') { recSeen(m); }
      else if (m.k === 'react') { float(m.e, m.n || (p && p.name) || ''); } } catch (e) { /* mensaje ajeno */ }
  });
  room.on(E.LocalTrackPublished, function (pub) {
    if (pub.source === 'microphone' && pub.track) { hookMic(pub.track.mediaStreamTrack); micState(room.localParticipant, true); }
    if (pub.source === 'camera' && pub.track && bgCur !== 'none') { applyBg(bgCur, bgImg); }
  });
  room.on(E.TrackSubscribed, function (t, pub, p) { attach(t, p, false); count(); micState(p); })
      .on(E.TrackUnsubscribed, function (t, pub, p) { detach(t, p); })
      .on(E.TrackMuted, function (pub, p) { micState(p, p.isLocal); renderPeople(); }).on(E.TrackUnmuted, function (pub, p) { micState(p, p.isLocal); renderPeople(); })
      .on(E.ParticipantConnected, function (p) { tileFor(p, false); count(); toast((p.name || 'Alguien') + ' entró a la llamada', 2500); })
      .on(E.ParticipantDisconnected, function (p) { var t = $('t-' + p.identity); if (t) { t.remove(); } var s = $('s-' + p.identity); if (s) { s.remove(); } relayout(); count(); })
      .on(E.ParticipantAttributesChanged, function (attrs, p) { var t = $('t-' + (p.isLocal ? 'me' : p.identity)); if (t) { t.classList.toggle('hand', attrs.hand === '1'); } if (attrs.hand === '1' && !p.isLocal) { toast('✋ ' + (p.name || 'Alguien') + ' levantó la mano', 4000); beep(); } renderPeople(); })
      .on(E.ActiveSpeakersChanged, function (sp) { document.querySelectorAll('.tile.sp').forEach(function (t) { t.classList.remove('sp'); }); sp.forEach(function (p) { var t = $('t-' + (p.isLocal ? 'me' : p.identity)); if (t) { t.classList.add('sp'); } }); var top = sp.find(function (p) { return !p.isLocal; }) || sp[0]; if (top) { speakerId = 't-' + (top.isLocal ? 'me' : top.identity); if (layoutMode === 'speaker') { relayout(); } } })
      .on(E.Disconnected, function (reason) { $('room').classList.add('hide'); $('lobby').classList.remove('hide'); $('lf').classList.remove('hide'); $('wr').classList.add('hide'); $('go').disabled = false; err(reason === L.DisconnectReason.PARTICIPANT_REMOVED ? 'El anfitrión te quitó de la llamada.' : 'Saliste de la videollamada.'); try { parent.postMessage({k: 'ch-meet', ev: 'left'}, '*'); } catch (e) { /* nada */ } if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; } });
  return room.connect(j.url, j.token).then(function () {
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; $('prev').srcObject = null; }
    $('lobby').classList.add('hide'); $('room').classList.remove('hide'); $('ttl').textContent = j.title || 'Videollamada'; startClock();
    if (AUTO) { try { window.opener && window.opener.postMessage({k: 'ch-meet', ev: 'popout-ready'}, '*'); } catch (e) { /* sin ventana de origen */ } }
    room.remoteParticipants.forEach(function (p) { tileFor(p, false); p.trackPublications.forEach(function (pb) { if (pb.track) { attach(pb.track, p, false); } }); });
    tileFor(room.localParticipant, true); count();
    if (j.subtitles) { $('bcc').classList.remove('hide'); $('langb').classList.remove('hide'); $('bcc').classList.toggle('on', subsShow); $('sp2').value = j.speak; $('rd2').value = j.read; langLabel(); var seenL = ''; try { seenL = localStorage.getItem('meet-lang-seen') || ''; } catch (e) { /* nada */ } if (!seenL) { $('lgp').classList.remove('hide'); try { localStorage.setItem('meet-lang-seen', '1'); } catch (e) { /* nada */ } } }
    publishLang();
    if (j.host) { startPending(); } else { $('invb').classList.add('hide'); }
    fetch(CODE + '/chat', {headers: {'X-Stt-Key': j.sttKey}}).then(function (r) { return r.ok ? r.json() : null; }).then(function (r) { if (r) { r.items.forEach(function (m) { addMsg({id: m.id, n: m.n, t: m.t, f: m.f, at: m.at}, m.i === j.sttKey.split('.')[0]); }); unread = 0; $('cbadge').classList.add('hide'); $('cdot').classList.add('hide'); } }).catch(function () { /* sin historial */ });
    return room.localParticipant.setMicrophoneEnabled(mic).then(function () { return room.localParticipant.setCameraEnabled(cam); }).catch(function (e) { console.warn('No se pudo publicar el audio o el video', e); $('wait').textContent = 'No pudimos enviar tu cámara o micrófono: ' + (e && e.message || e); $('wait').classList.remove('hide'); });
  }).then(function () { room.localParticipant.trackPublications.forEach(function (pb) { if (pb.track && pb.track.kind === 'video' && pb.source === 'camera') { attach(pb.track, room.localParticipant, true); } }); micState(room.localParticipant, true); });
}
function waitAdmit(id, host) {
  $('lf').classList.add('hide'); $('wr').classList.remove('hide'); $('wrt').textContent = 'Esperando a que ' + (host || 'tu asesor') + ' te dé acceso…';
  var stop = false; setTimeout(function () { if (!stop) { $('wrt').textContent = (host || 'Tu asesor') + ' aún no entra a la sala. Ya le avisamos; no cierres esta ventana.'; } }, 45000);
  $('wrx').onclick = function () { stop = true; $('wr').classList.add('hide'); $('lf').classList.remove('hide'); $('go').disabled = false; };
  var tm = null; document.addEventListener('visibilitychange', function () { if (!document.hidden && !stop) { clearTimeout(tm); poll(); } });   // al volver a la pestaña no espera el siguiente turno del temporizador
  function poll() {
    if (stop) { return; }
    fetch(CODE + '/knock/' + id).then(function (r) { if (r.status === 404) { throw new Error('x'); } return r.json(); }).then(function (j) {
      if (stop) { return; }
      if (j.status === 'admitted') { stop = true; $('wr').classList.add('hide'); return startRoom(j).catch(function (e) { $('lf').classList.remove('hide'); $('go').disabled = false; err(e.message || 'No se pudo entrar.'); }); }
      if (j.status === 'denied') { stop = true; $('wr').classList.add('hide'); $('lf').classList.remove('hide'); $('go').disabled = false; err('El anfitrión no pudo admitirte ahora. Pídele que te vuelva a enviar el enlace.'); return; }
      tm = setTimeout(poll, 2000);
    }).catch(function (e) { if (e && e.message === 'x') { stop = true; $('wr').classList.add('hide'); $('lf').classList.remove('hide'); $('go').disabled = false; err('Esta videollamada ya terminó.'); return; } tm = setTimeout(poll, 3000); });
  }
  poll();
}
$('go').onclick = function () {
  var name = $('nm').value.trim(); if (!name && !HK) { err('Escribe tu nombre para entrar.'); return; }
  try { localStorage.setItem('meet-name', name); localStorage.setItem('meet-speak', $('sp').value); localStorage.setItem('meet-read', $('rd').value); } catch (e) { /* nada */ }
  $('go').disabled = true; err('');
  if (HK) {
    post('token', {name: name, host: HK}).then(function (r) { if (!r.ok) { throw new Error(r.status === 404 ? 'Esta videollamada ya terminó.' : 'No se pudo entrar. Intenta de nuevo.'); } return r.json(); }).then(startRoom).catch(function (e) { $('go').disabled = false; err(e.message || 'No se pudo entrar.'); });
    return;
  }
  post('knock', {name: name, extra: EXTRA, p: INV}).then(function (r) { if (!r.ok) { throw new Error(r.status === 404 ? 'Esta videollamada ya terminó.' : r.status === 423 ? 'El anfitrión bloqueó la sala: no admite más personas por ahora.' : 'No se pudo pedir acceso. Intenta de nuevo.'); } return r.json(); }).then(function (k) { waitAdmit(k.id, k.host); }).catch(function (e) { $('go').disabled = false; err(e.message || 'No se pudo entrar.'); });
};

/* ---------------- barra de controles ---------------- */
$('bm').onclick = function () { if (!room) { return; } var on = !room.localParticipant.isMicrophoneEnabled; room.localParticipant.setMicrophoneEnabled(on).then(function () { $('bm').classList.toggle('off', !on); micState(room.localParticipant, true); renderPeople(); }); };
$('bc').onclick = function () {
  if (!room) { return; } var on = !room.localParticipant.isCameraEnabled;
  room.localParticipant.setCameraEnabled(on).then(function () {
    $('bc').classList.toggle('off', !on); var t = $('t-me');
    if (t) { if (on) { room.localParticipant.trackPublications.forEach(function (pb) { if (pb.track && pb.track.kind === 'video' && pb.source === 'camera') { attach(pb.track, room.localParticipant, true); } }); } else { var v = t.querySelector('video'); if (v) { v.remove(); } var av = t.querySelector('.av'); if (av) { av.classList.remove('hide'); } } }
  });
};
$('bs').onclick = function () {
  if (!room) { return; } var on = !room.localParticipant.isScreenShareEnabled;
  room.localParticipant.setScreenShareEnabled(on).then(function () {
    $('bs').classList.toggle('on', on);
    room.localParticipant.trackPublications.forEach(function (pb) { if (pb.source === 'screen_share' && pb.track) { attach(pb.track, room.localParticipant, true); pb.track.on && pb.track.on('ended', function () { var s = $('s-me'); if (s) { s.remove(); } $('bs').classList.remove('on'); relayout(); }); } });
    if (!on) { var s = $('s-me'); if (s) { s.remove(); } relayout(); }
  }).catch(function () { /* canceló el permiso */ });
};
$('be').onclick = function () { leave(); };
window.addEventListener('beforeunload', function () { if (room) { room.disconnect(); } });
// las ventanitas se abren por encima de la barra de controles aunque esta ocupe varias filas (panel angosto)
try { new ResizeObserver(function () { document.documentElement.style.setProperty('--barh', $('bar').offsetHeight + 'px'); }).observe($('bar')); } catch (e) { /* navegador sin ResizeObserver */ }
})();
