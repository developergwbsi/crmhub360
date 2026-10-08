(function () {
  'use strict';
  const $app = document.getElementById('app');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const state = {tab: 'empresas', companies: [], currentRelease: null, base: '', releases: [], jobs: [], audit: [], timer: null};

  async function api(method, path, body) {
    const r = await fetch('/api' + path, {method, headers: {'Content-Type': 'application/json', 'X-CC': '1'}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin'});
    let data = null; try { data = await r.json(); } catch (e) { /* sin cuerpo */ }
    if (r.status === 401 && path !== '/login') { renderLogin(); throw new Error('Sesión vencida'); }
    if (!r.ok) { throw new Error((data && (data.detail && (data.detail.map ? data.detail.map(d => d.msg).join(', ') : data.detail))) || 'Error ' + r.status); }
    return data;
  }

  // ---------- utilidades de interfaz (diálogos y avisos propios)
  function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3200); }
  function modal(html, cls) {
    const back = document.createElement('div'); back.className = 'back';
    back.innerHTML = `<div class="dlg ${cls || ''}" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(back);
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') { close(); } };
    document.addEventListener('keydown', onKey);
    back.addEventListener('mousedown', e => { if (e.target === back) { close(); } });
    return {el: back.firstChild, close};
  }
  function confirmBox(title, text, ok, danger) {
    return new Promise(res => {
      const m = modal(`<h3>${esc(title)}</h3><p>${esc(text)}</p><div class="foot"><button class="btn" data-x="n">Cancelar</button><button class="btn ${danger ? 'danger' : 'primary'}" data-x="y">${esc(ok || 'Aceptar')}</button></div>`);
      m.el.querySelector('[data-x=n]').onclick = () => { m.close(); res(false); };
      m.el.querySelector('[data-x=y]').onclick = () => { m.close(); res(true); };
    });
  }
  function inputBox(title, label, opts) {
    opts = opts || {};
    return new Promise(res => {
      const m = modal(`<h3>${esc(title)}</h3>${opts.text ? `<p>${esc(opts.text)}</p>` : ''}<label>${esc(label)}</label><input type="${opts.type || 'text'}" placeholder="${esc(opts.placeholder || '')}" maxlength="120"><div class="err" hidden></div><div class="foot"><button class="btn" data-x="n">Cancelar</button><button class="btn primary" data-x="y">${esc(opts.ok || 'Guardar')}</button></div>`);
      const inp = m.el.querySelector('input'); setTimeout(() => inp.focus(), 30);
      const go = () => {
        const v = inp.value.trim(), e = m.el.querySelector('.err');
        const bad = (opts.required && !v) ? 'Este dato es obligatorio.' : (opts.validate ? opts.validate(v) : '');
        if (bad) { e.hidden = false; e.textContent = bad; inp.focus(); return; }
        m.close(); res(v);
      };
      m.el.querySelector('[data-x=n]').onclick = () => { m.close(); res(null); };
      m.el.querySelector('[data-x=y]').onclick = go; inp.addEventListener('keydown', e => { if (e.key === 'Enter') { go(); } });
    });
  }
  function secretBox(title, text, value, extra) {
    const m = modal(`<h3>${esc(title)}</h3><p>${esc(text)}</p><div class="secret"><span style="flex:1">${esc(value)}</span><button class="btn sm" data-x="c">Copiar</button></div>${extra ? `<p class="mut">${esc(extra)}</p>` : ''}<div class="foot"><button class="btn primary" data-x="k">Listo</button></div>`);
    m.el.querySelector('[data-x=c]').onclick = () => { (navigator.clipboard ? navigator.clipboard.writeText(value) : Promise.reject()).then(() => toast('Copiado')).catch(() => toast('Cópialo manualmente')); };
    m.el.querySelector('[data-x=k]').onclick = m.close;
  }
  const fmtDate = s => s ? new Date(s).toLocaleString('es-CO', {day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'}) : '—';
  function ago(s) {
    if (!s) { return 'Nunca'; }
    const m = Math.round((Date.now() - new Date(s)) / 60000);
    return m < 1 ? 'Ahora' : m < 60 ? `Hace ${m} min` : m < 1440 ? `Hace ${Math.round(m / 60)} h` : `Hace ${Math.round(m / 1440)} d`;
  }

  // ---------- inicio de sesión
  const store = {get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* privado */ } }, del: k => { try { localStorage.removeItem(k); } catch (e) { /* privado */ } }};
  function renderLogin(forceFull) {
    clearInterval(state.timer);
    const params = new URLSearchParams(location.search);
    if (params.get('reset')) { return renderReset(params.get('reset')); }
    const known = !forceFull && store.get('cc-user');
    const nm = store.get('cc-name') || known || '';
    $app.innerHTML = `<div class="login"><div class="card"><div class="brand" style="margin-bottom:6px"><i>◆</i> Crm Hub 360</div><p class="sub">Centro de control</p>
      ${known ? `<div class="welcome"><span class="av">${esc(nm.slice(0, 1).toUpperCase())}</span><div><div class="mut">Bienvenido de nuevo</div><b>${esc(nm)}</b><div class="mut">@${esc(known)}</div></div></div>`
        : '<label>Usuario</label><input id="u" autocomplete="username">'}
      <label>Contraseña</label><input id="p" type="password" autocomplete="current-password">
      ${known ? '' : '<label class="chk"><input type="checkbox" id="rm" checked> Recordar mi usuario en este equipo</label>'}
      <div class="err" id="e" hidden></div><div style="margin-top:16px"><button class="btn primary" id="go" style="width:100%;justify-content:center">Entrar</button></div>
      <div class="links"><a role="button" id="fg">¿Olvidaste tu contraseña?</a>${known ? '<a role="button" id="nu">¿No eres tú?</a>' : ''}</div></div></div>`;
    const go = async () => {
      const e = document.getElementById('e'); e.hidden = true;
      const user = known || document.getElementById('u').value.trim();
      try {
        await api('POST', '/login', {user, password: document.getElementById('p').value});
        const rm = document.getElementById('rm');
        if (known || (rm && rm.checked)) { store.set('cc-user', user); } else { store.del('cc-user'); store.del('cc-name'); }
        await boot();
      } catch (x) { e.hidden = false; e.textContent = x.message; }
    };
    document.getElementById('go').onclick = go;
    document.getElementById('p').addEventListener('keydown', e => { if (e.key === 'Enter') { go(); } });
    document.getElementById('fg').onclick = forgotDialog;
    const nu = document.getElementById('nu'); if (nu) { nu.onclick = () => { store.del('cc-user'); store.del('cc-name'); renderLogin(true); }; }
    (document.getElementById('u') || document.getElementById('p')).focus();
  }
  function forgotDialog() {
    const m = modal(`<h3>Recuperar contraseña</h3><p class="mut">Escribe tu usuario y el correo de tu cuenta. Si coinciden, te enviamos un enlace para crear una contraseña nueva (vale 30 minutos).</p>
      <label>Usuario</label><input id="fu" autocomplete="username"><label>Correo de la cuenta</label><input id="fe" type="email" autocomplete="email"><div class="err" id="fer" hidden></div>
      <div class="foot"><button class="btn" data-x="n">Cancelar</button><button class="btn primary" data-x="y">Enviar enlace</button></div>`);
    m.el.querySelector('[data-x=n]').onclick = m.close;
    m.el.querySelector('[data-x=y]').onclick = async () => {
      const er = m.el.querySelector('#fer'); er.hidden = true;
      const user = m.el.querySelector('#fu').value.trim(), email = m.el.querySelector('#fe').value.trim();
      if (!user || !email) { er.hidden = false; er.textContent = 'Completa los dos datos.'; return; }
      try { await api('POST', '/forgot', {user, email}); m.el.innerHTML = '<h3>Revisa tu correo</h3><p>Si los datos son correctos, te enviamos un enlace de recuperación. Puede tardar un par de minutos.</p><div class="foot"><button class="btn primary" data-x="k">Entendido</button></div>'; m.el.querySelector('[data-x=k]').onclick = m.close; }
      catch (x) { er.hidden = false; er.textContent = x.message; }
    };
  }
  function renderReset(token) {
    $app.innerHTML = `<div class="login"><div class="card"><div class="brand" style="margin-bottom:6px"><i>◆</i> Crm Hub 360</div><p class="sub">Crea tu nueva contraseña</p>
      <label>Contraseña nueva (mínimo 10 caracteres)</label><input id="n1" type="password" autocomplete="new-password"><label>Repítela</label><input id="n2" type="password" autocomplete="new-password">
      <div class="err" id="e" hidden></div><div style="margin-top:16px"><button class="btn primary" id="go" style="width:100%;justify-content:center">Guardar contraseña</button></div></div></div>`;
    document.getElementById('go').onclick = async () => {
      const e = document.getElementById('e'); e.hidden = true;
      const a = document.getElementById('n1').value, b = document.getElementById('n2').value;
      if (a.length < 10) { e.hidden = false; e.textContent = 'Debe tener al menos 10 caracteres.'; return; }
      if (a !== b) { e.hidden = false; e.textContent = 'Las contraseñas no coinciden.'; return; }
      try { await api('POST', '/reset', {token, password: a}); history.replaceState(null, '', '/'); toast('Contraseña actualizada. Ya puedes entrar.'); renderLogin(); }
      catch (x) { e.hidden = false; e.textContent = x.message; }
    };
  }

  // ---------- estructura
  function shell() {
    $app.innerHTML = `<div class="top"><div class="brand"><i>◆</i><span>Crm Hub 360 <small>· Centro de control</small></span></div><span class="grow"></span>
      <button class="btn sm" id="acc"><span id="who">Mi cuenta</span></button><button class="btn sm" id="out">Salir</button></div>
      <div class="tabs"><button class="tab" data-t="empresas">Empresas</button><button class="tab" data-t="base">Base de producción</button><button class="tab" data-t="proveedores">Proveedores aliados</button><button class="tab" data-t="correo">Correo general</button><button class="tab" data-t="bienvenida">Plantilla de bienvenida</button><button class="tab" data-t="actividad">Actividad</button></div>
      <main id="main"></main>`;
    document.getElementById('acc').onclick = accountDialog;
    document.getElementById('out').onclick = async () => { try { await api('POST', '/logout'); } catch (e) { /* ya cerrada */ } renderLogin(); };
    document.querySelectorAll('.tab').forEach(b => b.onclick = () => { state.tab = b.dataset.t; draw(); });
  }
  function draw() {
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.t === state.tab));
    ({empresas: drawCompanies, base: drawBase, proveedores: drawProviders, correo: drawMail, bienvenida: drawWelcome, actividad: drawActivity}[state.tab])();
  }

  // ---------- empresas
  async function loadCompanies() { const r = await api('GET', '/companies'); state.companies = r.items; state.currentRelease = r.currentRelease; if (state.tab === 'empresas') { drawCompanies(); } }
  function drawCompanies() {
    const main = document.getElementById('main');
    const rows = state.companies.map(c => {
      const st = c.status === 'active' ? (c.health.up ? '<span class="chip ok"><span class="dot up"></span> En línea</span>' : '<span class="chip bad"><span class="dot down"></span> Sin respuesta</span>') : '<span class="chip warn">Suspendida</span>';
      const kind = c.kind === 'dev' ? '<span class="chip info">Desarrollo · base</span>' : c.kind === 'prod' ? '<span class="chip info">Producción propia</span>' : '';
      const rel = c.kind !== 'client' ? '—' : (c.release === state.currentRelease ? '<span class="chip ok">Al día</span>' : `<span class="chip warn" title="${esc(c.release || 'sin base')}">Desactualizada</span>`);
      const lic = c.license ? esc(c.license) : 'Sin vencimiento';
      return `<tr data-s="${esc(c.slug)}"><td><div class="name">${esc(c.name)}</div><div class="mut">${esc(c.host)} ${kind}</div></td><td>${st}</td>
        <td class="hide-m">${c.stats.users == null ? '—' : c.stats.users} <span class="mut">/ ${c.maxUsers}</span></td><td class="hide-m">${c.stats.leads == null ? '—' : c.stats.leads}</td>
        <td class="hide-m mut">${esc(ago(c.stats.lastLogin))}</td><td class="hide-m">${rel}</td><td class="hide-m mut">${lic}</td><td style="text-align:right"><button class="btn sm" data-manage="${esc(c.slug)}">Gestionar</button></td></tr>`;
    }).join('');
    main.innerHTML = `<h2>Empresas</h2><p class="sub">Cada empresa tiene su propio sitio, usuarios y base de datos. Se crean siempre en producción a partir de la base de producción vigente${state.currentRelease ? ` (<b>${esc(state.currentRelease)}</b>)` : ''}.</p>
      <div class="bar"><button class="btn primary" id="new">+ Nueva empresa</button><span class="grow"></span><button class="btn sm" id="ref">Actualizar</button></div>
      <div class="card">${state.companies.length ? `<table><thead><tr><th>Empresa</th><th>Estado</th><th class="hide-m">Usuarios</th><th class="hide-m">Leads</th><th class="hide-m">Último ingreso</th><th class="hide-m">Base</th><th class="hide-m">Licencia</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty">Aún no hay empresas.</div>'}</div>`;
    document.getElementById('new').onclick = newCompany;
    document.getElementById('ref').onclick = () => loadCompanies().then(() => toast('Lista actualizada'));
    main.querySelectorAll('[data-manage]').forEach(b => b.onclick = () => manage(b.dataset.manage));
  }

  const COUNTRIES = [['CO', 'Colombia'], ['MX', 'México'], ['PE', 'Perú'], ['CL', 'Chile'], ['AR', 'Argentina'], ['EC', 'Ecuador'], ['PA', 'Panamá'], ['CR', 'Costa Rica'], ['DO', 'República Dominicana'],
    ['GT', 'Guatemala'], ['UY', 'Uruguay'], ['PY', 'Paraguay'], ['BO', 'Bolivia'], ['VE', 'Venezuela'], ['ES', 'España'], ['US', 'Estados Unidos']];
  const countryName = c => (COUNTRIES.find(x => x[0] === c) || [])[1] || '';
  function newCompany() {
    if (!state.currentRelease) { modal('<h3>Falta la base de producción</h3><p>Primero publica la base de producción desde desarrollo (pestaña «Base de producción»).</p><div class="foot"><button class="btn primary" data-x="k">Entendido</button></div>').el.querySelector('[data-x=k]').onclick = e => e.target.closest('.back').remove(); return; }
    const m = modal(`<h3>Nueva empresa</h3><p class="mut">Se crea en producción con la base ${esc(state.currentRelease)}: sitio propio, base de datos aislada, certificado SSL y un administrador que recibe su bienvenida con el acceso.</p>
      <h4 style="margin:14px 0 0">La empresa</h4>
      <label>Nombre de la empresa</label><input id="n" maxlength="80" placeholder="Acme S.A.S.">
      <div class="grid2"><div><label>Identificador (sin espacios)</label><input id="s" maxlength="31" placeholder="acme"></div><div><label>Plan</label><select id="pl"><option value="standard">Estándar</option><option value="pro">Pro</option><option value="enterprise">Enterprise</option><option value="trial">Prueba</option></select></div></div>
      <label>Dirección del sitio</label><input id="h" placeholder="acme.${esc(state.base)}"><div class="mut">Debe terminar en .${esc(state.base)} y apuntar a este servidor.</div>
      <div class="grid2"><div><label>Máximo de usuarios</label><input id="mu" type="number" min="1" max="500" value="10"></div><div><label>Licencia hasta (opcional)</label><input id="li" type="date"></div></div>
      <h4 style="margin:18px 0 0">El administrador</h4>
      <div class="grid2"><div><label>Nombre</label><input id="af" maxlength="60" autocomplete="off"></div><div><label>Apellido</label><input id="al" maxlength="60" autocomplete="off"></div></div>
      <div class="grid2"><div><label>Correo (recibe el acceso)</label><input id="e" type="email" placeholder="admin@acme.com"></div><div><label>Teléfono</label><input id="ph" maxlength="30" placeholder="+57 300 123 4567"></div></div>
      <div class="grid2"><div><label>País</label><select id="co"><option value="">Elige un país…</option>${COUNTRIES.map(c => `<option value="${c[0]}" ${c[0] === 'CO' ? 'selected' : ''}>${esc(c[1])}</option>`).join('')}</select></div><div><label>Ciudad</label><input id="ci" maxlength="60" placeholder="Bogotá"></div></div>
      <label class="chk" style="margin-top:14px"><input type="checkbox" id="sw" checked> Enviar correo de bienvenida con el enlace de ingreso y las credenciales</label>
      <div class="mut" id="swh"></div>
      <div class="err" id="er" hidden></div><div class="foot"><button class="btn" data-x="n">Cancelar</button><button class="btn primary" data-x="y">Crear empresa</button></div>`, 'wide');
    const $ = id => m.el.querySelector('#' + id);
    api('GET', '/settings/mail').then(ml => { if (!ml.configured || !ml.enabled) { $('swh').innerHTML = '⚠️ El correo general no está configurado o está desactivado: la empresa se crea igual, pero la bienvenida no se enviará (podrás reenviarla desde su panel).'; } }).catch(() => {});
    $('n').addEventListener('input', () => { if (!$('s').dataset.touched) { $('s').value = $('n').value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30); } $('h').placeholder = ($('s').value || 'empresa') + '.' + state.base; });
    $('s').addEventListener('input', () => { $('s').dataset.touched = 1; $('h').placeholder = ($('s').value || 'empresa') + '.' + state.base; });
    m.el.querySelector('[data-x=n]').onclick = m.close;
    m.el.querySelector('[data-x=y]').onclick = async () => {
      const er = $('er'); er.hidden = true;
      const body = {name: $('n').value.trim(), slug: $('s').value.trim(), email: $('e').value.trim(), host: $('h').value.trim() || undefined, plan: $('pl').value, max_users: +$('mu').value || 10, license_until: $('li').value || null,
        admin_first: $('af').value.trim(), admin_last: $('al').value.trim(), phone: $('ph').value.trim(), country: $('co').value, city: $('ci').value.trim(), send_welcome: $('sw').checked};
      if (!body.name || !body.slug || !body.email) { er.hidden = false; er.textContent = 'Nombre de la empresa, identificador y correo del administrador son obligatorios.'; return; }
      if (!body.admin_first) { er.hidden = false; er.textContent = 'Escribe el nombre del administrador para personalizar su bienvenida.'; return; }
      try { const r = await api('POST', '/companies', body); m.close(); watchJob(r.job, 'Creando «' + body.name + '»'); }
      catch (x) { er.hidden = false; er.textContent = x.message; }
    };
  }

  // ---------- seguimiento de trabajos
  function watchJob(id, title, after) {
    const m = modal(`<h3>${esc(title)}</h3><div id="st" class="mut"><span class="spin"></span> En cola…</div><div class="log" id="lg" style="margin-top:12px">Esperando al ejecutor…</div><div id="rs"></div><div class="foot"><button class="btn primary" data-x="k" disabled>Cerrar</button></div>`, 'wide');
    const lg = m.el.querySelector('#lg'), st = m.el.querySelector('#st'), btn = m.el.querySelector('[data-x=k]');
    btn.onclick = () => { m.close(); loadCompanies(); loadSide(); };
    const tick = async () => {
      if (!document.body.contains(m.el)) { return; }
      try {
        const j = await api('GET', '/jobs/' + id);
        lg.textContent = j.log || '…'; lg.scrollTop = lg.scrollHeight;
        if (j.status === 'done' || j.status === 'error') {
          st.innerHTML = j.status === 'done' ? '<span class="chip ok">Terminado</span>' : '<span class="chip bad">Falló: revisa el registro</span>'; btn.disabled = false;
          if (j.status === 'done' && j.result && j.result.url) { m.el.querySelector('#rs').innerHTML = `<p>Sitio listo: <a href="${esc(j.result.url)}" target="_blank" rel="noopener">${esc(j.result.url)}</a>. El administrador recibe sus credenciales por correo; también están en «Gestionar → Ver credenciales».</p>${j.result.ssl === false ? '<p class="chip warn">Sin certificado SSL: verifica el DNS y vuelve a intentarlo desde la consola del servidor.</p>' : ''}${j.result.welcome === true ? '<p class="chip ok">Bienvenida enviada al administrador</p>' : (j.result.welcome === false ? '<p class="chip warn">La bienvenida no se envió: configura el correo general y reenvíala desde el panel de la empresa.</p>' : '')}`; }
          if (after) { after(j); }
          return;
        }
        st.innerHTML = `<span class="spin"></span> ${j.status === 'queued' ? 'En cola…' : 'Trabajando…'}`;
      } catch (e) { /* reintenta */ }
      setTimeout(tick, 1500);
    };
    tick();
  }


  // ---------- visor en modo lectura (dentro del Centro de control, sin pedir inicio de sesión)
  async function readLink(slug) { return (await api('POST', `/companies/${slug}/support-link`)).url; }
  async function openViewer(c) {
    const v = document.createElement('div'); v.className = 'viewer';
    v.innerHTML = `<div class="vbar"><b>${esc(c.name)}</b><span class="chip info">Modo lectura</span><span class="mut hide-m">${esc(c.host)} · solo ves información, no puedes modificarla</span><span class="grow"></span>
      <button class="btn sm" data-v="tab">Abrir en pestaña nueva</button><button class="btn sm primary" data-v="x">Cerrar visor</button></div><div class="vbody"><div class="vload"><span class="spin"></span> Entrando en modo lectura…</div><iframe title="${esc(c.name)}" allow="clipboard-read; clipboard-write"></iframe></div>`;
    document.body.appendChild(v);
    v.querySelector('[data-v=x]').onclick = () => v.remove();
    v.querySelector('[data-v=tab]').onclick = async () => { const w = window.open('', '_blank'); try { const u = await readLink(c.slug); if (w) { w.opener = null; w.location = u; } } catch (e) { if (w) { w.close(); } toast(e.message); } };
    const fr = v.querySelector('iframe');
    fr.addEventListener('load', () => { const l = v.querySelector('.vload'); if (l) { setTimeout(() => l.remove(), 1200); } });
    try { fr.src = await readLink(c.slug); } catch (e) { v.remove(); toast(e.message); }
  }

  // ---------- gestión de una empresa
  async function manage(slug) {
    const c = state.companies.find(x => x.slug === slug); if (!c) { return; }
    const d = document.createElement('div'); d.className = 'drawer';
    const isClient = c.kind === 'client';
    d.innerHTML = `<header><div style="flex:1"><div class="name" style="font-size:17px">${esc(c.name)}</div><div class="mut">${esc(c.host)}</div></div><button class="x" aria-label="Cerrar">×</button></header><div class="body">
      <div class="acts"><a class="btn" href="https://${esc(c.host)}" target="_blank" rel="noopener">Abrir sitio</a><button class="btn primary" data-a="ro">Ver en modo lectura</button>
        ${isClient ? `<button class="btn" data-a="up">Actualizar a la base actual</button><button class="btn ${c.status === 'active' ? 'danger' : ''}" data-a="pw">${c.status === 'active' ? 'Suspender' : 'Reactivar'}</button>` : ''}
        <button class="btn" data-a="cred">Ver credenciales del admin</button><button class="btn" data-a="ren">Cambiar nombre</button>${isClient ? '<button class="btn" data-a="wel">Reenviar bienvenida</button>' : ''}</div>
      <h4 style="margin:18px 0 6px">Datos</h4><div class="kv"><span>Estado</span><span>${esc(c.status === 'active' ? 'Activa' : 'Suspendida')}</span><span>Plan</span><span>${esc(c.plan)} · hasta ${c.maxUsers} usuarios</span>
        <span>Licencia</span><span>${esc(c.license || 'Sin vencimiento')}</span><span>Versión instalada</span><span>${esc(c.health.version || '—')}</span><span>Base de producción</span><span>${esc(c.kind === 'client' ? (c.release || 'ninguna') : 'Código de desarrollo')}</span>
        ${c.profile && (c.profile.first || c.profile.email) ? `<span>Administrador</span><span>${esc([c.profile.first, c.profile.last].filter(Boolean).join(' ') || '—')}<br><span class="mut">${esc(c.profile.email || '')}${c.profile.phone ? ' · ' + esc(c.profile.phone) : ''}</span></span>` : ''}${c.profile && (c.profile.country || c.profile.city) ? `<span>Ubicación</span><span>${esc([c.profile.city, countryName(c.profile.country)].filter(Boolean).join(', '))}</span>` : ''}<span>Creada</span><span>${esc(fmtDate(c.createdAt))}</span><span>Respuesta</span><span>${c.health.ms == null ? '—' : c.health.ms + ' ms'}</span></div>
      <h4 style="margin:20px 0 4px">Servicios</h4><div id="sv"><span class="spin"></span></div>
      <h4 style="margin:20px 0 4px">Usuarios</h4><div class="mut" style="margin-bottom:6px">Cambia la contraseña de cualquier usuario de esta empresa.</div><div id="us"><span class="spin"></span></div></div>`;
    document.body.appendChild(d);
    const close = () => d.remove(); d.querySelector('.x').onclick = close;
    d.querySelector('[data-a=ro]').onclick = () => { close(); openViewer(c); };
    d.querySelector('[data-a=cred]').onclick = async () => {
      if (!await confirmBox('Ver credenciales', 'Se mostrará el usuario y la contraseña del administrador de «' + c.name + '». Queda registrado en la actividad.', 'Mostrar')) { return; }
      try { const r = await api('GET', `/companies/${slug}/admin-credentials`); secretBox('Administrador de ' + c.name, `Usuario: ${r.userName} · Sitio: ${r.url}`, r.password); } catch (e) { toast(e.message); }
    };
    d.querySelector('[data-a=ren]').onclick = async () => {
      const nm = await inputBox('Nombre de la empresa', 'Nombre que verán sus usuarios', {text: 'Aparece en el menú y en el inicio de sesión. «Crm Hub 360» se muestra siempre como nombre del sistema.', ok: 'Guardar', required: true, validate: v => (v.length < 2 ? 'Escribe al menos 2 caracteres.' : /[<>;'"`]/.test(v) ? 'No uses comillas ni los símbolos < > ;' : '')});
      if (nm === null) { return; }
      try { await api('PUT', `/companies/${slug}/name`, {name: nm}); toast('Nombre actualizado'); close(); loadCompanies(); } catch (e) { toast(e.message); }
    };
    const wel = d.querySelector('[data-a=wel]');
    if (wel) { wel.onclick = async () => {
      if (!await confirmBox('Reenviar bienvenida', 'Se envía de nuevo al administrador el correo con el enlace de ingreso y sus credenciales actuales.', 'Reenviar')) { return; }
      try { const r = await api('POST', `/companies/${slug}/welcome`); close(); watchJob(r.job, 'Enviando bienvenida a «' + c.name + '»'); } catch (e) { toast(e.message); } }; }
    const up = d.querySelector('[data-a=up]');
    if (up) { up.onclick = async () => { if (await confirmBox('Actualizar empresa', 'Se aplicará la base de producción actual (' + state.currentRelease + '). El sitio se reinicia unos segundos.', 'Actualizar')) { close(); const r = await api('POST', `/companies/${slug}/upgrade`); watchJob(r.job, 'Actualizando «' + c.name + '»'); } }; }
    const pw = d.querySelector('[data-a=pw]');
    if (pw) { pw.onclick = async () => {
      const susp = c.status === 'active';
      if (await confirmBox(susp ? 'Suspender empresa' : 'Reactivar empresa', susp ? 'Se detiene el sitio y deja de recibir mensajes. Los datos se conservan.' : 'Se vuelve a encender el sitio.', susp ? 'Suspender' : 'Reactivar', susp)) {
        close(); const r = await api('POST', `/companies/${slug}/power/${susp ? 'suspend' : 'resume'}`); watchJob(r.job, (susp ? 'Suspendiendo «' : 'Reactivando «') + c.name + '»');
      } }; }
    loadServices(slug, d.querySelector('#sv'));
    try {
      const r = await api('GET', `/companies/${slug}/users`);
      d.querySelector('#us').innerHTML = r.items.length ? r.items.map(u => `<div class="userrow"><div style="flex:1"><b>${esc(u.userName)}</b> <span class="chip">${esc(u.type === 'admin' ? 'Administrador' : u.type === 'api' ? 'Integración' : 'Usuario')}</span>${u.active ? '' : ' <span class="chip warn">Inactivo</span>'}<div class="mut">${esc(u.name || '')} ${esc(u.email || '')}</div></div>${u.type === 'api' ? '' : `<button class="btn sm" data-u="${esc(u.id)}" data-n="${esc(u.userName)}">Cambiar clave</button>`}</div>`).join('') : '<div class="mut">Sin usuarios.</div>';
      d.querySelectorAll('[data-u]').forEach(b => b.onclick = async () => {
        const custom = await inputBox('Cambiar contraseña de ' + b.dataset.n, 'Nueva contraseña (mínimo 10 caracteres; vacía = generar una segura)', {type: 'text', ok: 'Cambiar', placeholder: 'Generar automáticamente', validate: v => (v && v.length < 10 ? 'La contraseña debe tener al menos 10 caracteres (o déjala vacía para generar una).' : '')});
        if (custom === null) { return; }
        try { const r2 = await api('POST', `/companies/${slug}/users/${b.dataset.u}/password`, custom ? {password: custom} : {}); secretBox('Contraseña cambiada', 'Nueva contraseña de «' + r2.userName + '». No se vuelve a mostrar.', r2.password, 'Entrégala por un canal seguro; el usuario puede cambiarla desde su perfil.'); } catch (e) { toast(e.message); }
      });
    } catch (e) { d.querySelector('#us').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  }


  // ---------- mi cuenta
  function accountDialog() {
    const me = state.me || {};
    const m = modal(`<h3>Mi cuenta</h3><div class="kv" style="margin-bottom:6px"><span>Usuario</span><span>${esc(me.user)}</span></div>
      <label>Nombre</label><input id="an" maxlength="80" value="${esc(me.name || '')}"><label>Correo (para recuperar la contraseña)</label><input id="ae" type="email" value="${esc(me.email || '')}"><div class="err" id="aer" hidden></div>
      <div class="acts"><button class="btn primary sm" data-x="sv">Guardar datos</button></div>
      <h4 style="margin:18px 0 0">Cambiar contraseña</h4><label>Contraseña actual</label><input id="pc" type="password" autocomplete="current-password">
      <label>Contraseña nueva (mínimo 10 caracteres)</label><input id="p1" type="password" autocomplete="new-password"><label>Repite la nueva</label><input id="p2" type="password" autocomplete="new-password"><div class="err" id="per" hidden></div>
      <div class="foot"><button class="btn" data-x="c">Cerrar</button><button class="btn primary" data-x="pw">Cambiar contraseña</button></div>`);
    const q = id => m.el.querySelector('#' + id);
    m.el.querySelector('[data-x=c]').onclick = m.close;
    m.el.querySelector('[data-x=sv]').onclick = async () => {
      q('aer').hidden = true;
      try { await api('PUT', '/account', {name: q('an').value.trim(), email: q('ae').value.trim()}); state.me.name = q('an').value.trim(); state.me.email = q('ae').value.trim(); document.getElementById('who').textContent = state.me.name || 'Mi cuenta'; store.set('cc-name', state.me.name); toast('Datos guardados'); }
      catch (e) { q('aer').hidden = false; q('aer').textContent = e.message; }
    };
    m.el.querySelector('[data-x=pw]').onclick = async () => {
      const er = q('per'); er.hidden = true;
      if (q('p1').value.length < 10) { er.hidden = false; er.textContent = 'La contraseña nueva debe tener al menos 10 caracteres.'; return; }
      if (q('p1').value !== q('p2').value) { er.hidden = false; er.textContent = 'Las contraseñas nuevas no coinciden.'; return; }
      try { await api('POST', '/account/password', {current: q('pc').value, new: q('p1').value}); m.close(); toast('Contraseña cambiada'); }
      catch (e) { er.hidden = false; er.textContent = e.message; }
    };
  }

  // ---------- correo general
  const MAIL_PRESETS = {
    gmail: {label: 'Gmail / Google Workspace', host: 'smtp.gmail.com', port: 465, security: 'SSL', userIsFrom: true,
      help: 'Usa tu correo completo como usuario y una <b>contraseña de aplicación</b> (no tu clave normal): activa la verificación en 2 pasos y créala en <b>myaccount.google.com/apppasswords</b>. Se pega con o sin espacios. Se usa el puerto 465 (SSL): en este servidor el 587 está redirigido por el cortafuegos y las empresas no podrían enviar.'},
    outlook: {label: 'Outlook / Microsoft 365', host: 'smtp.office365.com', port: 587, security: 'TLS', userIsFrom: true,
      help: 'Usa tu correo completo. En Microsoft 365 el administrador debe tener activado «SMTP autenticado» para el buzón; con verificación en 2 pasos usa una contraseña de aplicación.'},
    yahoo: {label: 'Yahoo Mail', host: 'smtp.mail.yahoo.com', port: 465, security: 'SSL', userIsFrom: true, help: 'Genera una contraseña de aplicación en la seguridad de tu cuenta Yahoo.'},
    zoho: {label: 'Zoho Mail', host: 'smtp.zoho.com', port: 465, security: 'SSL', userIsFrom: true, help: 'Usa tu correo completo; con 2 pasos crea una contraseña de aplicación.'},
    sendgrid: {label: 'SendGrid', host: 'smtp.sendgrid.net', port: 587, security: 'TLS', user: 'apikey', help: 'El usuario es literalmente «apikey» y la contraseña es tu API key. El remitente debe estar verificado en SendGrid.'},
    mailgun: {label: 'Mailgun', host: 'smtp.mailgun.org', port: 587, security: 'TLS', help: 'Usuario y contraseña SMTP de tu dominio en Mailgun (postmaster@tu-dominio).'},
    ses: {label: 'Amazon SES', host: 'email-smtp.us-east-1.amazonaws.com', port: 587, security: 'TLS', help: 'Usa las credenciales SMTP de SES (no las de IAM) y ajusta la región en el servidor si no es us-east-1.'},
    other: {label: 'Otro servidor SMTP', help: 'Escribe los datos que te dio tu proveedor de correo.'},
  };
  const presetOf = h => Object.keys(MAIL_PRESETS).find(k => MAIL_PRESETS[k].host && MAIL_PRESETS[k].host === h) || (h ? 'other' : '');
  async function drawMail(mode) {   // mode: undefined = resumen si ya hay correo; 'edit' | 'new' = formulario
    const main = document.getElementById('main');
    main.innerHTML = '<h2>Correo general</h2><p class="sub">Cargando…</p>';
    let m; try { m = await api('GET', '/settings/mail'); } catch (e) { main.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
    const intro = `<h2>Correo general</h2><p class="sub">Cuenta de correo (SMTP) del sistema. Se usa para recuperar tu contraseña del Centro y para las empresas a las que decidas prestarles el correo (se activa en el panel de cada empresa → Servicios).</p>`;
    if (m.configured && !mode) {
      const pk = presetOf(m.host), pl = pk && MAIL_PRESETS[pk] ? MAIL_PRESETS[pk].label : 'Otro servidor SMTP';
      main.innerHTML = intro + `<div class="card" style="padding:18px 20px;max-width:760px">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><b style="font-size:17px">${esc(pl)}</b><span class="chip ${m.enabled ? 'ok' : 'warn'}">${m.enabled ? 'Activo' : 'Desactivado'}</span></div>
        <div class="kv" style="margin-top:12px"><span>Servidor</span><span>${esc(m.host)}:${esc(m.port)} ${m.security ? '· ' + esc(m.security) : ''}</span><span>Usuario</span><span>${esc(m.user || '—')}</span>
          <span>Contraseña</span><span>${m.passwordSet ? 'Guardada ' + esc(m.passwordHint) : '—'}</span><span>Remitente</span><span>${esc(m.from_name)} &lt;${esc(m.from_address)}&gt;</span>
          <span>Empresas que lo usan</span><span>${m.companies.length ? m.companies.map(c => esc(c.name)).join(', ') : 'Ninguna'}</span></div>
        <div class="acts"><button class="btn primary" id="ts">Enviar correo de prueba</button><button class="btn" id="ed">Editar</button><button class="btn" id="nw">Configurar otro</button>
          <button class="btn ${m.enabled ? 'danger' : 'primary'}" id="tg">${m.enabled ? 'Desactivar' : 'Activar'}</button></div>
        ${m.enabled ? '' : '<p class="mut">Mientras esté desactivado no se envían correos del Centro (recuperación de contraseña) y no se puede prestar a empresas.</p>'}</div>`;
      document.getElementById('ed').onclick = () => drawMail('edit');
      document.getElementById('nw').onclick = () => drawMail('new');
      document.getElementById('ts').onclick = () => sendMailTest(async () => {});
      document.getElementById('tg').onclick = async () => {
        if (m.enabled) {
          const txt = m.companies.length ? 'Se retirará el correo prestado de: ' + m.companies.map(c => c.name).join(', ') + '. Esas empresas quedarán sin correo de salida hasta que configuren el suyo.' : 'Dejará de usarse para recuperar tu contraseña del Centro y no se podrá prestar.';
          if (!await confirmBox('Desactivar correo general', txt, 'Desactivar', true)) { return; }
        }
        try { await api('PUT', '/settings/mail/enabled', {enabled: !m.enabled}); toast(m.enabled ? 'Correo desactivado' : 'Correo activado'); drawMail(); } catch (e) { toast(e.message); }
      };
      return;
    }
    const fresh = mode === 'new', cur = fresh ? {} : m;
    main.innerHTML = intro + `<div class="card" style="padding:18px 20px;max-width:760px"><label>Proveedor de correo</label><select id="pr"><option value="">Elige tu proveedor…</option>${Object.keys(MAIL_PRESETS).map(k => `<option value="${k}">${esc(MAIL_PRESETS[k].label)}</option>`).join('')}</select>
      <div class="notice" id="hp"></div>
      <div class="grid2"><div><label>Servidor SMTP</label><input id="h" value="${esc(cur.host || '')}" placeholder="smtp.proveedor.com"></div><div><label>Puerto</label><input id="po" type="number" value="${esc(cur.port || 587)}"></div></div>
      <div class="grid2"><div><label>Seguridad</label><select id="se"><option value="TLS">STARTTLS (587)</option><option value="SSL">SSL/TLS (465)</option><option value="">Ninguna</option></select></div><div><label>Usuario (correo completo)</label><input id="us" value="${esc(cur.user || '')}" autocomplete="off" placeholder="tucuenta@gmail.com"></div></div>
      <label>Contraseña ${!fresh && m.passwordSet ? `<span class="mut">(guardada ${esc(m.passwordHint)}; déjala vacía para conservarla)</span>` : '<span class="mut">(en Gmail: contraseña de aplicación)</span>'}</label><input id="pw" type="password" autocomplete="new-password">
      <div class="grid2"><div><label>Correo remitente</label><input id="fa" value="${esc(cur.from_address || '')}" placeholder="tucuenta@gmail.com"></div><div><label>Nombre del remitente</label><input id="fn" value="${esc(cur.from_name || 'Crm Hub 360')}"></div></div>
      <div class="err" id="er" hidden></div><div class="acts"><button class="btn primary" id="sv">Guardar</button><button class="btn" id="ts">Guardar y enviar prueba</button>${m.configured ? '<button class="btn" id="cn">Cancelar</button>' : ''}</div></div>`;
    const $ = id => document.getElementById(id), val = id => $(id).value.trim();
    $('se').value = cur.security == null ? 'TLS' : cur.security;
    const showHelp = () => { const p = MAIL_PRESETS[$('pr').value] || {}; $('hp').innerHTML = p.help || ''; $('hp').hidden = !p.help; };
    $('pr').value = presetOf(cur.host || ''); showHelp();
    $('pr').onchange = () => { const p = MAIL_PRESETS[$('pr').value] || {}; showHelp(); if (p.host) { $('h').value = p.host; $('po').value = p.port; $('se').value = p.security; } if (p.user) { $('us').value = p.user; } };
    $('us').addEventListener('blur', () => { const p = MAIL_PRESETS[$('pr').value] || {}; if (p.userIsFrom && !val('fa') && /@/.test(val('us'))) { $('fa').value = val('us'); } });
    $('h').addEventListener('input', () => { const k = presetOf(val('h')); if (k && $('pr').value !== k) { $('pr').value = k; showHelp(); } });
    const body = () => ({host: val('h'), port: +val('po') || 587, security: $('se').value, user: val('us'), password: $('pw').value, from_address: val('fa') || val('us'), from_name: val('fn') || 'Crm Hub 360'});
    const save = async () => {
      if (fresh && !$('pw').value) { throw new Error('Escribe la contraseña del nuevo correo.'); }
      if (!val('h')) { throw new Error('Elige un proveedor o escribe el servidor SMTP.'); }
      await api('PUT', '/settings/mail', body());
    };
    $('sv').onclick = async () => { try { await save(); toast('Correo guardado'); drawMail(); } catch (e) { const er = $('er'); er.hidden = false; er.textContent = e.message; } };
    $('ts').onclick = () => sendMailTest(async () => { try { await save(); } catch (e) { const er = $('er'); er.hidden = false; er.textContent = e.message; throw e; } });
    const cn = $('cn'); if (cn) { cn.onclick = () => drawMail(); }
  }
  async function sendMailTest(beforeSend) {
    const to = await inputBox('Correo de prueba', 'Enviar a', {required: true, ok: 'Enviar', placeholder: (state.me && state.me.email) || 'tu@correo.com', validate: v => (/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(v) ? '' : 'Escribe un correo válido.')});
    if (to === null) { return; }
    try { await beforeSend(); await api('POST', '/settings/mail/test', {to}); toast('Correo enviado a ' + to); if (state.tab === 'correo' && document.getElementById('sv')) { drawMail(); } }
    catch (e) { if (e && !document.querySelector('#er:not([hidden])')) { modal(`<h3>No se pudo enviar</h3><p>${esc(e.message)}</p><div class="foot"><button class="btn primary" data-x="k">Cerrar</button></div>`).el.querySelector('[data-x=k]').onclick = ev => ev.target.closest('.back').remove(); } }
  }


  // ---------- plantilla de bienvenida de las empresas nuevas
  async function drawWelcome() {
    const main = document.getElementById('main');
    main.innerHTML = '<h2>Plantilla de bienvenida</h2><p class="sub">Cargando…</p>';
    let w; try { w = await api('GET', '/settings/welcome'); } catch (e) { main.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
    main.innerHTML = `<h2>Plantilla de bienvenida</h2><p class="sub">Correo que recibe el administrador al crear su empresa, con el enlace de ingreso y sus credenciales. Se envía desde el <b>correo general</b>. ${w.custom ? '<span class="chip info">Personalizada</span>' : '<span class="chip ok">Plantilla original</span>'}</p>
      <div class="wgrid"><div class="card" style="padding:16px 18px"><label>Asunto</label><input id="ws" maxlength="200" value="${esc(w.subject)}">
        <label>Contenido (HTML)</label><textarea id="wh" rows="22" spellcheck="false" style="font:12.5px/1.45 ui-monospace,Menlo,Consolas,monospace">${esc(w.html)}</textarea>
        <div class="mut" style="margin-top:8px">Marcadores: ${w.markers.map(k => `<code>{{${k}}}</code>`).join(' ')}</div>
        <div class="err" id="we" hidden></div><div class="acts"><button class="btn primary" id="wsv">Guardar</button><button class="btn" id="wts">Enviar prueba</button><button class="btn danger" id="wrs">Restablecer original</button></div></div>
        <div class="card" style="padding:0;overflow:hidden"><div class="mut" style="padding:10px 14px;border-bottom:1px solid var(--line)">Vista previa (con datos de ejemplo)</div><iframe id="wp" title="Vista previa" sandbox="" style="width:100%;height:760px;border:0;background:#fff"></iframe></div></div>`;
    const $ = id => document.getElementById(id);
    const prev = () => { $('wp').srcdoc = ($('wh').value || '').replace(/\{\{nombre\}\}/g, 'Camila').replace(/\{\{apellido\}\}/g, 'Rojas').replace(/\{\{empresa\}\}/g, 'Acme S.A.S.').replace(/\{\{url\}\}/g, 'https://acme.' + state.base)
      .replace(/\{\{usuario\}\}/g, 'admin').replace(/\{\{clave\}\}/g, 'Xk93-Pw2mQ7aB').replace(/\{\{ciudad\}\}/g, 'Bogotá').replace(/\{\{pais\}\}/g, 'Colombia').replace(/\{\{anio\}\}/g, String(new Date().getFullYear())).replace(/\{\{ubicacion\}\}/g, ' en Bogotá, Colombia'); };
    prev(); let tm; $('wh').addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(prev, 400); });
    $('wsv').onclick = async () => { const er = $('we'); er.hidden = true; try { await api('PUT', '/settings/welcome', {subject: $('ws').value.trim(), html: $('wh').value}); toast('Plantilla guardada'); drawWelcome(); } catch (e) { er.hidden = false; er.textContent = e.message; } };
    $('wrs').onclick = async () => { if (!await confirmBox('Restablecer plantilla', 'Se descartan tus cambios y vuelve la plantilla original de Crm Hub 360.', 'Restablecer', true)) { return; } try { await api('DELETE', '/settings/welcome'); toast('Plantilla original restablecida'); drawWelcome(); } catch (e) { toast(e.message); } };
    $('wts').onclick = async () => {
      const to = await inputBox('Enviar prueba', 'Enviar a', {required: true, ok: 'Enviar', placeholder: (state.me && state.me.email) || 'tu@correo.com', validate: v => (/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(v) ? '' : 'Escribe un correo válido.')});
      if (to === null) { return; }
      try { await api('POST', '/settings/welcome/test', {to, subject: $('ws').value.trim(), html: $('wh').value}); toast('Prueba enviada a ' + to); }
      catch (e) { modal(`<h3>No se pudo enviar</h3><p>${esc(e.message)}</p><div class="foot"><button class="btn primary" data-x="k">Cerrar</button></div>`).el.querySelector('[data-x=k]').onclick = ev => ev.target.closest('.back').remove(); }
    };
  }

  // ---------- proveedores aliados
  const FIELDS = {
    evolution: [['url', 'URL del servidor Evolution', 'https://evolution.tudominio.com'], ['apikey', 'API key global', '', 1]],
    gupshup: [['api_key', 'API key', '', 1], ['source', 'Número de origen', '57300…'], ['app_name', 'Nombre de la app', '']],
    twilio: [['account_sid', 'Account SID', 'AC…'], ['auth_token', 'Auth token', '', 1], ['sms_from', 'Remitente de SMS (número, código corto o MG…)', ''], ['wa_from', 'Número de WhatsApp (whatsapp:+…)', ''], ['voice_from', 'Número para llamadas (caller ID)', '']],
    email: [['host', 'Servidor SMTP', 'smtp.gmail.com'], ['port', 'Puerto', '587'], ['security', 'Seguridad', '', 0, ['TLS', 'SSL', 'NONE']], ['user', 'Usuario (correo completo)', 'tucuenta@gmail.com'], ['password', 'Contraseña (en Gmail: contraseña de aplicación)', '', 1], ['from_address', 'Correo remitente', 'tucuenta@gmail.com'], ['from_name', 'Nombre del remitente', 'Crm Hub 360']],
    generic: [['url', 'URL de la API', 'https://api.proveedor.com/v1/…'], ['method', 'Método', '', 0, ['POST', 'GET']], ['auth_type', 'Autenticación', '', 0, ['none', 'bearer', 'basic', 'header']], ['auth_user', 'Usuario / nombre de la cabecera', ''], ['auth_secret', 'Token o clave', '', 1], ['body_type', 'Formato del cuerpo', '', 0, ['json', 'form', 'query']], ['body', 'Plantilla del cuerpo', '{"to":"{{to}}","text":"{{text}}"}', 0, 'area'], ['sender', 'Remitente / caller ID', '']],
  };
  const fieldsFor = kind => FIELDS[kind.startsWith('generic') ? 'generic' : kind];
  async function drawProviders() {
    const main = document.getElementById('main');
    main.innerHTML = '<h2>Proveedores aliados</h2><p class="sub">Cargando…</p>';
    let r; try { r = await api('GET', '/providers'); } catch (e) { main.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
    state.providers = r;
    main.innerHTML = `<h2>Proveedores aliados</h2><p class="sub">Servicios que nosotros contratamos para revenderlos a las empresas: WhatsApp, SMS, llamadas. Se configuran una sola vez aquí y se asignan a cada empresa desde su panel (Servicios); la empresa no ve nuestras claves.</p>
      <div class="bar"><button class="btn primary" id="np">+ Agregar proveedor</button></div><div class="card">${r.items.length ? `<table><thead><tr><th>Proveedor</th><th>Tipo</th><th>Canales</th><th>Empresas que lo usan</th><th></th></tr></thead><tbody>${r.items.map(p => `<tr><td><div class="name">${esc(p.name)}</div><div class="mut">${esc(p.notes || '')}</div></td><td>${esc(r.kinds[p.kind].label)}</td><td>${r.kinds[p.kind].channels.map(c => `<span class="chip info">${esc({whatsapp: 'WhatsApp', sms: 'SMS', voice: 'Llamadas', email: 'Correo'}[c])}</span>`).join(' ')}</td><td>${p.companies.length ? p.companies.map(esc).join(', ') : '<span class="mut">Ninguna</span>'}</td><td style="text-align:right;white-space:nowrap">${p.kind === 'email' ? `<button class="btn sm" data-pt="${esc(p.id)}">Probar</button> ` : ''}<button class="btn sm" data-ed="${esc(p.id)}">Editar</button> <button class="btn sm danger" data-del="${esc(p.id)}">Eliminar</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Aún no hay proveedores. Agrega el primero (por ejemplo, tu cuenta de Twilio o tu servidor Evolution).</div>'}</div>`;
    document.getElementById('np').onclick = () => providerDialog(null);
    main.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => providerDialog(r.items.find(x => x.id === b.dataset.ed)));
    main.querySelectorAll('[data-pt]').forEach(b => b.onclick = async () => {
      const to = await inputBox('Correo de prueba', 'Enviar a', {required: true, ok: 'Enviar', placeholder: (state.me && state.me.email) || 'tu@correo.com', validate: v => (/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(v) ? '' : 'Escribe un correo válido.')});
      if (to === null) { return; }
      try { await api('POST', `/providers/${b.dataset.pt}/test`, {to}); toast('Correo enviado a ' + to); } catch (e) { modal(`<h3>No se pudo enviar</h3><p>${esc(e.message)}</p><div class="foot"><button class="btn primary" data-x="k">Cerrar</button></div>`).el.querySelector('[data-x=k]').onclick = ev => ev.target.closest('.back').remove(); }
    });
    main.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!await confirmBox('Eliminar proveedor', 'Se borra este proveedor del Centro. Las empresas que lo usan deben quitarlo primero.', 'Eliminar', true)) { return; }
      try { await api('DELETE', '/providers/' + b.dataset.del); toast('Proveedor eliminado'); drawProviders(); } catch (e) { toast(e.message); }
    });
  }
  function providerDialog(p) {
    const kinds = state.providers.kinds, cur = p ? p.kind : 'twilio';
    const m = modal(`<h3>${p ? 'Editar' : 'Agregar'} proveedor</h3><label>Tipo</label><select id="k" ${p ? 'disabled' : ''}>${Object.keys(kinds).map(k => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(kinds[k].label)}</option>`).join('')}</select>
      <label>Nombre para identificarlo</label><input id="pn" maxlength="80" value="${esc(p ? p.name : '')}" placeholder="Ej.: Twilio principal"><label>Notas (opcional)</label><input id="pt" maxlength="300" value="${esc(p ? p.notes : '')}">
      <div id="ff"></div><div class="err" id="pe" hidden></div><div class="foot"><button class="btn" data-x="n">Cancelar</button><button class="btn primary" data-x="y">Guardar</button></div>`, 'wide');
    const ff = m.el.querySelector('#ff');
    const draw = () => {
      const kind = m.el.querySelector('#k').value, f = (p && p.kind === kind) ? p.fields : {};
      const presetHtml = kind === 'email' ? `<label>Proveedor de correo</label><select id="mp"><option value="">Elige un proveedor…</option>${Object.keys(MAIL_PRESETS).map(k => `<option value="${k}" ${presetOf(f.host || '') === k ? 'selected' : ''}>${esc(MAIL_PRESETS[k].label)}</option>`).join('')}</select><div class="notice" id="mh" hidden></div>` : '';
      ff.innerHTML = presetHtml + fieldsFor(kind).map(([key, label, ph, secret, opts]) => {
        const v = f[key] == null ? '' : f[key];
        if (opts === 'area') { return `<label>${esc(label)}</label><textarea data-f="${key}" rows="3" placeholder="${esc(ph)}">${esc(v)}</textarea>`; }
        if (opts) { return `<label>${esc(label)}</label><select data-f="${key}">${opts.map(o => `<option ${o === (v || opts[0]) ? 'selected' : ''}>${o}</option>`).join('')}</select>`; }
        const set = secret && f[key + '_set'];
        return `<label>${esc(label)} ${set ? `<span class="mut">(guardada ${esc(f[key + '_hint'])}; vacía = conservar)</span>` : ''}</label><input data-f="${key}" ${secret ? 'type="password" autocomplete="new-password"' : ''} value="${secret ? '' : esc(v)}" placeholder="${esc(ph)}">`;
      }).join('');
      const mp = ff.querySelector('#mp');
      if (mp) {
        const fld = n => ff.querySelector(`[data-f="${n}"]`), help = () => { const pr = MAIL_PRESETS[mp.value] || {}, h = ff.querySelector('#mh'); h.innerHTML = pr.help || ''; h.hidden = !pr.help; };
        help();
        mp.onchange = () => { const pr = MAIL_PRESETS[mp.value] || {}; help(); if (pr.host) { fld('host').value = pr.host; fld('port').value = pr.port; fld('security').value = pr.security || 'NONE'; } if (pr.user) { fld('user').value = pr.user; } };
        fld('user').addEventListener('blur', () => { const pr = MAIL_PRESETS[mp.value] || {}; if (pr.userIsFrom && !fld('from_address').value && /@/.test(fld('user').value)) { fld('from_address').value = fld('user').value.trim(); } });
      }
    };
    draw(); m.el.querySelector('#k').onchange = draw;
    m.el.querySelector('[data-x=n]').onclick = m.close;
    m.el.querySelector('[data-x=y]').onclick = async () => {
      const er = m.el.querySelector('#pe'); er.hidden = true;
      const fields = {}; m.el.querySelectorAll('[data-f]').forEach(el => { fields[el.dataset.f] = el.value; });
      try { await api('PUT', '/providers/' + (p ? p.id : 'new'), {kind: m.el.querySelector('#k').value, name: m.el.querySelector('#pn').value.trim(), notes: m.el.querySelector('#pt').value.trim(), fields}); m.close(); toast('Proveedor guardado'); drawProviders(); }
      catch (e) { er.hidden = false; er.textContent = e.message; }
    };
  }

  // servicios (proveedores y correo) de una empresa, dentro de su panel
  async function loadServices(slug, box) {
    let r; try { r = await api('GET', `/companies/${slug}/services`); } catch (e) { box.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
    const rows = [['whatsapp', 'WhatsApp'], ['sms', 'SMS'], ['voice', 'Llamadas']].map(([ch, label]) => {
      const cur = r[ch] || {}, opts = r.providers.filter(p => r.kinds[p.kind].includes(ch));
      return `<div class="svc" data-ch="${ch}"><label>${label}</label><div class="grid2"><select data-p><option value="">Propio de la empresa (sin nuestro servicio)</option>${opts.map(p => `<option value="${esc(p.id)}" ${cur.provider === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
        <input data-x placeholder="${ch === 'whatsapp' ? 'Instancia (Evolution) o número' : 'Remitente / caller ID (opcional)'}" value="${esc(cur.instance || cur.from || '')}"></div></div>`;
    }).join('');
    box.innerHTML = `${rows}<div class="svc"><label>Correo de salida</label><select id="ml"><option value="own">Propio de la empresa${r.mail.hasOwn ? ' (tiene SMTP configurado)' : ' (aún sin configurar)'}</option>${r.mail.systemReady ? `<option value="shared" ${r.mail.mode === 'shared' ? 'selected' : ''}>Prestado: correo general del sistema</option>` : ''}${r.providers.filter(p => p.kind === 'email').map(p => `<option value="${esc(p.id)}" ${r.mail.mode === p.id ? 'selected' : ''}>Prestado: ${esc(p.name)}</option>`).join('')}</select></div>
      <div class="acts"><button class="btn primary sm" id="sv">Aplicar servicios</button></div><div class="mut">Al aplicar, la empresa recibe las credenciales en su configuración; no las puede ver. Quitar el servicio las retira.</div>`;
    box.querySelector('#sv').onclick = async () => {
      const body = {mail: box.querySelector('#ml').value};
      box.querySelectorAll('.svc[data-ch]').forEach(row => { const ch = row.dataset.ch, pid = row.querySelector('[data-p]').value, x = row.querySelector('[data-x]').value.trim(); body[ch] = pid ? {provider: pid, instance: ch === 'whatsapp' && !/^\+?\d[\d\s-]{6,}$/.test(x) ? x : '', from: ch === 'whatsapp' && !/^\+?\d[\d\s-]{6,}$/.test(x) ? '' : x} : {provider: null}; });
      try { const res = await api('PUT', `/companies/${slug}/services`, body); toast('Servicios aplicados'); if (res.notes && res.notes.length) { modal(`<h3>Servicios aplicados</h3><p>${res.notes.map(esc).join('<br>')}</p><div class="foot"><button class="btn primary" data-x="k">Cerrar</button></div>`).el.querySelector('[data-x=k]').onclick = ev => ev.target.closest('.back').remove(); } loadServices(slug, box); }
      catch (e) { toast(e.message); }
    };
  }

  // ---------- base de producción
  async function loadSide() { const [r, j, a] = await Promise.all([api('GET', '/releases'), api('GET', '/jobs'), api('GET', '/audit')]); state.releases = r.items; state.jobs = j.items; state.audit = a.items; if (state.tab === 'base' || state.tab === 'actividad') { if (!document.querySelector('.back, .drawer, .viewer')) { draw(); } } }
  function drawBase() {
    const main = document.getElementById('main'); const cur = state.releases.find(r => r.current);
    main.innerHTML = `<h2>Base de producción</h2><p class="sub">Desarrollo es siempre la base. Al publicar, se congela una copia de su código y configuración: esa copia es la réplica con la que se crean las empresas nuevas.</p>
      <div class="bar"><button class="btn primary" id="pub">Publicar desde desarrollo</button></div>
      <div class="card" style="padding:16px 18px;margin-bottom:16px"><b>Base vigente:</b> ${cur ? `${esc(cur.id)} <span class="chip ok">Actual</span> <span class="mut">${esc(cur.note)} · ${esc(cur.commit || '')}</span>` : '<span class="chip warn">Sin publicar</span>'}</div>
      <div class="card">${state.releases.length ? `<table><thead><tr><th>Versión</th><th>Nota</th><th class="hide-m">Código</th><th>Publicada</th><th>Empresas</th></tr></thead><tbody>${state.releases.map(r => `<tr><td><b>${esc(r.id)}</b> ${r.current ? '<span class="chip ok">Actual</span>' : ''}</td><td>${esc(r.note)}</td><td class="hide-m mut">${esc(r.commit || '')}</td><td class="mut">${esc(fmtDate(r.createdAt))}</td><td>${r.companies}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Aún no hay versiones.</div>'}</div>`;
    document.getElementById('pub').onclick = async () => {
      const note = await inputBox('Publicar base de producción', 'Nota de esta versión', {text: 'Se copia el código actual de desarrollo. Las empresas existentes no cambian hasta que las actualices.', ok: 'Publicar', placeholder: 'Ej.: Ficha lateral y mensajes masivos', required: true});
      if (note === null) { return; }
      try { const r = await api('POST', '/releases', {note}); watchJob(r.job, 'Publicando base de producción'); } catch (e) { toast(e.message); }
    };
  }

  // ---------- actividad
  function drawActivity() {
    const main = document.getElementById('main');
    const kinds = {create: 'Crear empresa', upgrade: 'Actualizar empresa', release: 'Publicar base', suspend: 'Suspender', resume: 'Reactivar'};
    main.innerHTML = `<h2>Actividad</h2><p class="sub">Trabajos del servidor y acciones hechas desde este centro.</p>
      <div class="card" style="margin-bottom:18px"><table><thead><tr><th>#</th><th>Trabajo</th><th>Empresa / nota</th><th>Estado</th><th>Cuándo</th></tr></thead><tbody>${state.jobs.map(j => `<tr data-j="${j.id}" style="cursor:pointer"><td>${j.id}</td><td>${esc(kinds[j.kind] || j.kind)}</td><td>${esc(j.target || '')}</td><td><span class="chip ${j.status === 'done' ? 'ok' : j.status === 'error' ? 'bad' : 'warn'}">${j.status === 'done' ? 'Terminado' : j.status === 'error' ? 'Con error' : j.status === 'running' ? 'En curso' : 'En cola'}</span></td><td class="mut">${esc(fmtDate(j.createdAt))}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Sin trabajos.</td></tr>'}</tbody></table></div>
      <div class="card"><table><thead><tr><th>Fecha</th><th>Quién</th><th>Acción</th><th>Empresa</th></tr></thead><tbody>${state.audit.map(a => `<tr><td class="mut">${esc(fmtDate(a.at))}</td><td>${esc(a.actor)}</td><td>${esc(a.action.replace(/_/g, ' '))}</td><td>${esc(a.target || '')}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Sin actividad.</td></tr>'}</tbody></table></div>`;
    main.querySelectorAll('[data-j]').forEach(r => r.onclick = () => watchJob(+r.dataset.j, 'Trabajo #' + r.dataset.j));
  }

  async function boot() {
    let me; try { me = await api('GET', '/me'); state.base = me.baseDomain; } catch (e) { renderLogin(); return; }
    shell(); state.me = me; document.getElementById('who').textContent = me.name || me.user; if (me.name) { store.set('cc-name', me.name); }
    await Promise.all([loadCompanies(), loadSide()]); draw();
    clearInterval(state.timer); state.timer = setInterval(() => { if (!document.querySelector('.back, .drawer')) { loadCompanies().catch(() => {}); loadSide().catch(() => {}); } }, 20000);
  }
  boot();
})();
