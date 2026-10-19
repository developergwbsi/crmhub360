/**
 * «Ver en el manual» en cualquier página: abre el manual de usuario en un panel lateral, ya en la sección que corresponde a la página donde está el usuario;
 * el panel trae «Ir a la página del manual» para abrirlo completo (en esa misma sección). Usa la misma plantilla del manual (res/templates/manual.tpl) y respeta los roles.
 * open(): abre el panel para la página actual. Endpoint: GET CrmHub/myroles.
 */
define('custom:manual-help', ['custom:ui'], function (ChUi) {
    const esc = v => ChUi.esc(v == null ? '' : v);
    // página (ruta) → sección del manual
    const MAP = [
        [/^$|^Home/, 'escritorio'], [/^Lead\/(view|edit|create)/, 'leads'], [/^Lead/, 'pipeline'], [/^(Account|Contact|Opportunity)/, 'leads'],
        [/^(Task|Meeting|Call|Calendar)/, 'actividades'], [/^Email/, 'contacto'], [/^CrmHub\/mensajes/, 'contacto'], [/^Campaign/, 'organizacion'], [/^CrmHub\/organigrama/, 'organizacion'],
        [/^CrmHub\/difusion/, 'masivos'], [/^CrmHub\/(simulador|conocimiento)/, 'simulador'], [/^CrmHub\/plantillas/, 'plantillas'], [/^CrmHub\/reportes/, 'reportes'], [/^CrmHub\/grabaciones/, 'grabaciones'], [/^CrmHub\/consultasWeb/, 'consultasweb'],
        [/^CrmHub\/formularios/, 'formint'], [/^CrmHub\/(procesos|copiasLeads)/, 'procesos'], [/^CrmHub\/agente/, 'comercialvirtual'], [/^CrmHub\/asignacion/, 'asignacion'], [/^CrmHub\/pipeline/, 'config'],
        [/^CrmHub\/leadSet/, 'leads'], [/^(Integrations|CrmHub\/integrations)/, 'configcomm'], [/^(Team|User|Role)/, 'roles'], [/^Admin/, 'admin'], [/^Preferences/, 'app'],
    ];
    let cache = null, who = null;

    const sectionFor = hash => { const h = String(hash || '').replace(/^#/, ''); const m = MAP.find(x => x[0].test(h)); return m ? m[1] : 'inicio'; };

    function keys(w) {
        const k = [];
        if (w.isAdmin) { k.push('admin'); }
        if ((w.roles || []).includes('Gerente General')) { k.push('gerente'); }
        if ((w.roles || []).includes('Director de Equipo')) { k.push('director'); }
        if ((w.roles || []).includes('Comercial')) { k.push('comercial'); }
        return k.length ? k : ['comercial'];
    }

    // panel de cada sección del manual (sin cabecera ni índice), listo para mostrar
    function load() {
        const html = cache ? Promise.resolve(cache) : fetch('client/custom/res/templates/manual.tpl', {cache: 'no-cache'}).then(r => r.text()).then(t => {
            const doc = new DOMParser().parseFromString(t.replace(/\\\{\{/g, '{{'), 'text/html');
            cache = [...doc.querySelectorAll('.panel[id^="ch-m-"]')].map(p => ({id: p.id.replace('ch-m-', ''), roles: (p.getAttribute('data-roles') || '').split(/\s+/).filter(Boolean), title: (p.querySelector('.panel-title') || {}).textContent || '', html: p.outerHTML}));
            return cache;
        });
        const roles = who ? Promise.resolve(who) : Espo.Ajax.getRequest('CrmHub/myroles').then(w => (who = w)).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } return (who = {isAdmin: false, roles: []}); });
        return Promise.all([html, roles]);
    }

    function close() { const d = document.getElementById('ch-mdrawer'); if (d) { d.classList.remove('in'); setTimeout(() => d.remove(), 200); } document.removeEventListener('keydown', onKey, true); }
    function onKey(e) { if (e.key === 'Escape') { close(); } }

    function open(forceSection) {
        const target = forceSection || sectionFor(location.hash);
        close();
        const d = document.createElement('div'); d.id = 'ch-mdrawer'; d.className = 'ch-mdrawer';
        d.innerHTML = '<div class="ch-md-head"><span class="fas fa-book-open"></span><b>Manual de usuario</b><span class="ch-md-sec" data-sec></span><button type="button" class="ch-md-close" data-x title="Cerrar"><span class="fas fa-xmark"></span></button></div>' +
            '<div class="ch-md-bar"><button type="button" class="btn btn-primary btn-sm" data-full><span class="fas fa-up-right-from-square"></span> Ir a la página del manual</button></div><div class="ch-md-body"><div class="ch-muted" style="padding:20px">Cargando el manual…</div></div>';
        document.body.appendChild(d);
        requestAnimationFrame(() => d.classList.add('in'));
        document.addEventListener('keydown', onKey, true);
        d.querySelector('[data-x]').onclick = close;
        load().then(([secs, w]) => {
            if (!d.isConnected) { return; }
            const k = keys(w), all = k.includes('admin'), visible = secs.filter(s => all || !s.roles.length ? all : s.roles.some(r => k.includes(r)));
            const id = visible.some(s => s.id === target) ? target : 'inicio', cur = secs.find(s => s.id === id);
            d.querySelector('[data-sec]').textContent = cur ? '· ' + cur.title.replace(/^\d+[a-z]?\.\s*/, '') : '';
            const body = d.querySelector('.ch-md-body');
            body.innerHTML = '<div class="ch-manual ch-md-manual">' + visible.map(s => s.html).join('') + '</div>';
            const el = body.querySelector('#ch-m-' + id);
            if (el) { el.classList.add('ch-m-focus'); setTimeout(() => body.scrollTo({top: el.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 10, behavior: 'smooth'}), 80); }
            d.querySelector('[data-full]').onclick = () => { try { sessionStorage.setItem('chManualSection', id); } catch (e) { /* sin sessionStorage */ } close(); if (/^#?CrmHub\/manual/.test(location.hash)) { location.reload(); } else { location.hash = '#CrmHub/manual'; } };
        }).catch(() => { const b = d.querySelector('.ch-md-body'); if (b) { b.innerHTML = '<div class="ch-chat-err">No se pudo cargar el manual.</div>'; } });
    }

    return {open, close, sectionFor};
});
