/**
 * Agenda de la ficha (lead, cuenta, contacto, oportunidad): lo primero que se ve bajo el encabezado son las citas, videollamadas, llamadas y tareas pendientes
 * del cliente, con lo vencido en rojo, y desde ahí se agenda lo siguiente (cita, videollamada, llamada o tarea) sin salir de la ficha.
 * Endpoint: GET CrmHub/agenda. Se monta desde custom:lead-hero (detalle completo y panel lateral).
 */
define('custom:agenda', ['custom:ui', 'custom:call-dock'], function (ChUi, Dock) {
    const T = {Meeting: ['far fa-calendar-check', '#4f6bff', 'Cita'], Video: ['fas fa-video', '#4f6bff', 'Videollamada'], Call: ['fas fa-phone', '#2fa36b', 'Llamada'], Task: ['fas fa-list-check', '#e08a00', 'Tarea']};
    const parse = s => { if (!s) { return null; } const d = new Date(String(s).replace(' ', 'T') + 'Z'); return isNaN(d) ? null : d; };
    const sameDay = (a, b) => a.toDateString() === b.toDateString();

    // «Hoy 20:00», «Mañana 9:00», «mié 15 oct 14:30» o «vencida hace 2 días»
    function when(it) {
        const d = parse(it.at); if (!d) { return 'Sin fecha'; }
        const now = new Date(), hm = d.toLocaleTimeString('es-CO', {hour: '2-digit', minute: '2-digit'});
        const tom = new Date(Date.now() + 864e5), dayTxt = sameDay(d, now) ? 'Hoy' : sameDay(d, tom) ? 'Mañana' : d.toLocaleDateString('es-CO', {weekday: 'short', day: 'numeric', month: 'short'});
        if (it.overdue) { const days = Math.floor((now - d) / 864e5); return days < 1 ? 'Hoy ' + hm + ' · vencida' : 'Vencida hace ' + days + (days === 1 ? ' día' : ' días'); }
        const mins = Math.round((d - now) / 60000);
        if (mins >= 0 && mins < 60) { return 'En ' + mins + ' min · ' + hm; }
        return dayTxt + ' ' + hm;
    }

    function mount(view, hero) {
        const model = view.model; if (!model.id || !hero || !hero.parentNode) { return; }
        let box = view.el.querySelector(':scope > .ch-agenda');
        if (!box) { box = document.createElement('div'); box.className = 'ch-agenda'; hero.after(box); }
        if (box._chOn) { return; }
        box._chOn = true;
        const state = {items: [], video: false, all: false, loaded: false};
        const user = view.getUser();

        const create = (scope, extra) => {
            const attrs = Object.assign({parentType: model.entityType, parentId: model.id, parentName: model.get('name'), assignedUserId: user.id, assignedUserName: user.get('name')}, extra || {});
            view.createView('chAgendaNew', 'views/modals/edit', {scope, attributes: attrs}, v => { v.render(); view.listenToOnce(v, 'after:save', () => { load(); Espo.Ui.success('Agendado'); }); });
        };
        const open = it => view.createView('chAgendaItem', 'views/modals/detail', {scope: it.type, id: it.id}, v => { v.render(); view.listenToOnce(v, 'after:save', load); view.listenToOnce(v, 'remove', load); });

        function paint() {
            const nm = model.get('name') || 'el cliente';
            const rows = (state.all ? state.items : state.items.slice(0, 4)).map(it => {
                const t = T[it.video ? 'Video' : it.type];
                return `<div class="ch-ag-row ${it.overdue ? 'late' : ''}" data-id="${ChUi.esc(it.id)}" data-t="${ChUi.esc(it.type)}"><span class="${t[0]}" style="color:${t[1]}"></span><div class="ch-ag-n"><b>${ChUi.esc(it.name)}</b><small>${t[2]} · ${ChUi.esc(when(it))}</small></div>` +
                    (it.video && !it.overdue ? `<button class="btn btn-primary btn-xs" data-go="${ChUi.esc(it.id)}">Entrar</button>` : '') + '</div>';
            }).join('');
            const more = state.items.length > 4 ? `<a class="ch-ag-more" data-more>${state.all ? 'Ver menos' : 'Ver las ' + state.items.length + ' pendientes'}</a>` : '';
            box.innerHTML = `<div class="ch-ag-h"><span class="far fa-calendar"></span><b>Agenda y recordatorios</b><span style="flex:1"></span><span class="ch-ag-add">Agendar:` +
                `<button class="btn btn-default btn-xs" data-new="Meeting"><span class="far fa-calendar-check"></span> Cita</button>` +
                (state.video ? '<button class="btn btn-default btn-xs" data-new="Video"><span class="fas fa-video"></span> Videollamada</button>' : '') +
                '<button class="btn btn-default btn-xs" data-new="Call"><span class="fas fa-phone"></span> Llamada</button><button class="btn btn-default btn-xs" data-new="Task"><span class="fas fa-list-check"></span> Tarea</button></span></div>' +
                (state.loaded ? (rows ? `<div class="ch-ag-l">${rows}</div>${more}` : `<div class="ch-ag-empty">No hay citas, llamadas ni tareas pendientes con ${ChUi.esc(nm)}. Agenda la siguiente para no perder el seguimiento.</div>`) : '<div class="ch-ag-empty">Cargando…</div>');
        }

        function load() {
            Espo.Ajax.getRequest('CrmHub/agenda', {scope: model.entityType, id: model.id}).then(r => { state.items = r.items || []; state.video = !!r.videoEnabled; state.loaded = true; paint(); })
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } });
        }

        box.addEventListener('click', e => {
            const nw = e.target.closest('[data-new]'), go = e.target.closest('[data-go]'), more = e.target.closest('[data-more]'), row = e.target.closest('.ch-ag-row');
            const nm = model.get('name') || 'el cliente';
            if (nw) {
                const k = nw.dataset.new;
                if (k === 'Meeting') { create('Meeting', {name: 'Cita con ' + nm}); }
                else if (k === 'Video') { create('Meeting', {name: 'Videollamada con ' + nm, videoCall: true}); }
                else if (k === 'Call') { create('Call', {name: 'Llamar a ' + nm}); }
                else { create('Task', {name: 'Seguimiento a ' + nm}); }
            } else if (go) {
                Espo.Ajax.postRequest('CrmHub/meet/host', {meetingId: go.dataset.go}).then(r => Dock.open(r.hostUrl, 'Videollamada con ' + nm)).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('No se pudo abrir la sala.'); });
            } else if (more) { state.all = !state.all; paint(); }
            else if (row) { open({id: row.dataset.id, type: row.dataset.t}); }
        });
        paint(); load();
        view.listenTo(model, 'sync', () => load());
        const tm = setInterval(() => { if (!document.body.contains(box)) { clearInterval(tm); } else { paint(); } }, 60000);   // «en 5 min», «vencida» se mantienen al día
    }

    return {mount};
});
