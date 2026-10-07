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
  function renderLogin() {
    clearInterval(state.timer);
    $app.innerHTML = `<div class="login"><div class="card"><div class="brand" style="margin-bottom:6px"><i>◆</i> Crm Hub 360</div><p class="sub">Centro de control</p>
      <label>Usuario</label><input id="u" autocomplete="username"><label>Contraseña</label><input id="p" type="password" autocomplete="current-password">
      <div class="err" id="e" hidden></div><div style="margin-top:18px"><button class="btn primary" id="go" style="width:100%;justify-content:center">Entrar</button></div></div></div>`;
    const go = async () => {
      const e = document.getElementById('e'); e.hidden = true;
      try { await api('POST', '/login', {user: document.getElementById('u').value.trim(), password: document.getElementById('p').value}); await boot(); }
      catch (x) { e.hidden = false; e.textContent = x.message; }
    };
    document.getElementById('go').onclick = go;
    document.getElementById('p').addEventListener('keydown', e => { if (e.key === 'Enter') { go(); } });
    document.getElementById('u').focus();
  }

  // ---------- estructura
  function shell() {
    $app.innerHTML = `<div class="top"><div class="brand"><i>◆</i><span>Crm Hub 360 <small>· Centro de control</small></span></div><span class="grow"></span>
      <span class="mut hide-m" id="who"></span><button class="btn sm" id="out">Salir</button></div>
      <div class="tabs"><button class="tab" data-t="empresas">Empresas</button><button class="tab" data-t="base">Base de producción</button><button class="tab" data-t="actividad">Actividad</button></div>
      <main id="main"></main>`;
    document.getElementById('out').onclick = async () => { try { await api('POST', '/logout'); } catch (e) { /* ya cerrada */ } renderLogin(); };
    document.querySelectorAll('.tab').forEach(b => b.onclick = () => { state.tab = b.dataset.t; draw(); });
  }
  function draw() {
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.t === state.tab));
    ({empresas: drawCompanies, base: drawBase, actividad: drawActivity}[state.tab])();
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

  function newCompany() {
    if (!state.currentRelease) { modal('<h3>Falta la base de producción</h3><p>Primero publica la base de producción desde desarrollo (pestaña «Base de producción»).</p><div class="foot"><button class="btn primary" data-x="k">Entendido</button></div>').el.querySelector('[data-x=k]').onclick = e => e.target.closest('.back').remove(); return; }
    const m = modal(`<h3>Nueva empresa</h3><p class="mut">Se crea en producción con la base ${esc(state.currentRelease)}: sitio propio, base de datos aislada, certificado SSL y un administrador.</p>
      <label>Nombre de la empresa</label><input id="n" maxlength="80" placeholder="Acme S.A.S.">
      <div class="grid2"><div><label>Identificador (sin espacios)</label><input id="s" maxlength="31" placeholder="acme"></div><div><label>Plan</label><select id="pl"><option value="standard">Estándar</option><option value="pro">Pro</option><option value="enterprise">Enterprise</option><option value="trial">Prueba</option></select></div></div>
      <label>Dirección del sitio</label><input id="h" placeholder="acme.${esc(state.base)}"><div class="mut">Debe terminar en .${esc(state.base)} y apuntar a este servidor.</div>
      <label>Correo del administrador</label><input id="e" type="email" placeholder="admin@acme.com">
      <div class="grid2"><div><label>Máximo de usuarios</label><input id="mu" type="number" min="1" max="500" value="10"></div><div><label>Licencia hasta (opcional)</label><input id="li" type="date"></div></div>
      <div class="err" id="er" hidden></div><div class="foot"><button class="btn" data-x="n">Cancelar</button><button class="btn primary" data-x="y">Crear empresa</button></div>`, 'wide');
    const $ = id => m.el.querySelector('#' + id);
    $('n').addEventListener('input', () => { if (!$('s').dataset.touched) { $('s').value = $('n').value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30); } $('h').placeholder = ($('s').value || 'empresa') + '.' + state.base; });
    $('s').addEventListener('input', () => { $('s').dataset.touched = 1; $('h').placeholder = ($('s').value || 'empresa') + '.' + state.base; });
    m.el.querySelector('[data-x=n]').onclick = m.close;
    m.el.querySelector('[data-x=y]').onclick = async () => {
      const er = $('er'); er.hidden = true;
      const body = {name: $('n').value.trim(), slug: $('s').value.trim(), email: $('e').value.trim(), host: $('h').value.trim() || undefined, plan: $('pl').value, max_users: +$('mu').value || 10, license_until: $('li').value || null};
      if (!body.name || !body.slug || !body.email) { er.hidden = false; er.textContent = 'Nombre, identificador y correo son obligatorios.'; return; }
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
          if (j.status === 'done' && j.result && j.result.url) { m.el.querySelector('#rs').innerHTML = `<p>Sitio listo: <a href="${esc(j.result.url)}" target="_blank" rel="noopener">${esc(j.result.url)}</a>. Las credenciales del administrador están en «Gestionar → Ver credenciales».</p>${j.result.ssl === false ? '<p class="chip warn">Sin certificado SSL: verifica el DNS y vuelve a intentarlo desde la consola del servidor.</p>' : ''}`; }
          if (after) { after(j); }
          return;
        }
        st.innerHTML = `<span class="spin"></span> ${j.status === 'queued' ? 'En cola…' : 'Trabajando…'}`;
      } catch (e) { /* reintenta */ }
      setTimeout(tick, 1500);
    };
    tick();
  }

  // ---------- gestión de una empresa
  async function manage(slug) {
    const c = state.companies.find(x => x.slug === slug); if (!c) { return; }
    const d = document.createElement('div'); d.className = 'drawer';
    const isClient = c.kind === 'client';
    d.innerHTML = `<header><div style="flex:1"><div class="name" style="font-size:17px">${esc(c.name)}</div><div class="mut">${esc(c.host)}</div></div><button class="x" aria-label="Cerrar">×</button></header><div class="body">
      <div class="acts"><a class="btn" href="https://${esc(c.host)}" target="_blank" rel="noopener">Abrir sitio</a><button class="btn primary" data-a="ro">Ver en modo lectura</button>
        ${isClient ? `<button class="btn" data-a="up">Actualizar a la base actual</button><button class="btn ${c.status === 'active' ? 'danger' : ''}" data-a="pw">${c.status === 'active' ? 'Suspender' : 'Reactivar'}</button>` : ''}
        <button class="btn" data-a="cred">Ver credenciales del admin</button><button class="btn" data-a="ren">Cambiar nombre</button></div>
      <h4 style="margin:18px 0 6px">Datos</h4><div class="kv"><span>Estado</span><span>${esc(c.status === 'active' ? 'Activa' : 'Suspendida')}</span><span>Plan</span><span>${esc(c.plan)} · hasta ${c.maxUsers} usuarios</span>
        <span>Licencia</span><span>${esc(c.license || 'Sin vencimiento')}</span><span>Versión instalada</span><span>${esc(c.health.version || '—')}</span><span>Base de producción</span><span>${esc(c.kind === 'client' ? (c.release || 'ninguna') : 'Código de desarrollo')}</span>
        <span>Creada</span><span>${esc(fmtDate(c.createdAt))}</span><span>Respuesta</span><span>${c.health.ms == null ? '—' : c.health.ms + ' ms'}</span></div>
      <h4 style="margin:20px 0 4px">Usuarios</h4><div class="mut" style="margin-bottom:6px">Cambia la contraseña de cualquier usuario de esta empresa.</div><div id="us"><span class="spin"></span></div></div>`;
    document.body.appendChild(d);
    const close = () => d.remove(); d.querySelector('.x').onclick = close;
    d.querySelector('[data-a=ro]').onclick = async () => {
      const w = window.open('', '_blank'); // se abre antes de la consulta para que el navegador no la bloquee
      try { const r = await api('POST', `/companies/${slug}/support-link`); if (w) { w.opener = null; w.location = r.url; } else { toast('Permite las ventanas emergentes para continuar'); } toast('Entrando en modo lectura…'); }
      catch (e) { if (w) { w.close(); } toast(e.message); }
    };
    d.querySelector('[data-a=cred]').onclick = async () => {
      if (!await confirmBox('Ver credenciales', 'Se mostrará el usuario y la contraseña del administrador de «' + c.name + '». Queda registrado en la actividad.', 'Mostrar')) { return; }
      try { const r = await api('GET', `/companies/${slug}/admin-credentials`); secretBox('Administrador de ' + c.name, `Usuario: ${r.userName} · Sitio: ${r.url}`, r.password); } catch (e) { toast(e.message); }
    };
    d.querySelector('[data-a=ren]').onclick = async () => {
      const nm = await inputBox('Nombre de la empresa', 'Nombre que verán sus usuarios', {text: 'Aparece en el menú y en el inicio de sesión. «Crm Hub 360» se muestra siempre como nombre del sistema.', ok: 'Guardar', required: true, validate: v => (v.length < 2 ? 'Escribe al menos 2 caracteres.' : /[<>;'"`]/.test(v) ? 'No uses comillas ni los símbolos < > ;' : '')});
      if (nm === null) { return; }
      try { await api('PUT', `/companies/${slug}/name`, {name: nm}); toast('Nombre actualizado'); close(); loadCompanies(); } catch (e) { toast(e.message); }
    };
    const up = d.querySelector('[data-a=up]');
    if (up) { up.onclick = async () => { if (await confirmBox('Actualizar empresa', 'Se aplicará la base de producción actual (' + state.currentRelease + '). El sitio se reinicia unos segundos.', 'Actualizar')) { close(); const r = await api('POST', `/companies/${slug}/upgrade`); watchJob(r.job, 'Actualizando «' + c.name + '»'); } }; }
    const pw = d.querySelector('[data-a=pw]');
    if (pw) { pw.onclick = async () => {
      const susp = c.status === 'active';
      if (await confirmBox(susp ? 'Suspender empresa' : 'Reactivar empresa', susp ? 'Se detiene el sitio y deja de recibir mensajes. Los datos se conservan.' : 'Se vuelve a encender el sitio.', susp ? 'Suspender' : 'Reactivar', susp)) {
        close(); const r = await api('POST', `/companies/${slug}/power/${susp ? 'suspend' : 'resume'}`); watchJob(r.job, (susp ? 'Suspendiendo «' : 'Reactivando «') + c.name + '»');
      } }; }
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

  // ---------- base de producción
  async function loadSide() { const [r, j, a] = await Promise.all([api('GET', '/releases'), api('GET', '/jobs'), api('GET', '/audit')]); state.releases = r.items; state.jobs = j.items; state.audit = a.items; if (state.tab !== 'empresas') { draw(); } }
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
    shell(); document.getElementById('who').textContent = 'Sesión: ' + me.user;
    await Promise.all([loadCompanies(), loadSide()]); draw();
    clearInterval(state.timer); state.timer = setInterval(() => { if (!document.querySelector('.back, .drawer')) { loadCompanies().catch(() => {}); loadSide().catch(() => {}); } }, 20000);
  }
  boot();
})();
