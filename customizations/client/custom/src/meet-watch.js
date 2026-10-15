/**
 * Aviso global de videollamadas: mientras el CRM está abierto (en cualquier pantalla) consulta cada 12 s si un cliente espera en la sala de espera de una
 * videollamada del usuario (sala que creó o lead que tiene asignado) y también si un cliente sigue en la llamada y el asesor ya no está dentro (colgó por error): muestra un aviso con sonido y el botón «Entrar y admitir» o «Volver a entrar», que abre la sala dentro del CRM.
 * Endpoint: GET CrmHub/meet/waiting. Solo si el servicio de videollamadas está habilitado (Settings.crmhubMeet).
 */
define('custom:meet-watch', ['custom:ui', 'custom:call-dock'], function (ChUi, Dock) {
    let started = false, seen = {}, dismissed = {};
    function beep() { try { const c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.frequency.value = 880; g.gain.value = 0.08; o.start(); setTimeout(() => { o.stop(); c.close(); }, 220); } catch (e) { /* sin sonido */ } }

    function paint(list) {
        let box = document.getElementById('ch-meet-alert');
        list.forEach(w => { w.names = [...new Set(w.names)]; });
        const items = list.filter(w => w.hostUrl && !dismissed[w.kind + w.code + (w.kind === 'soon' ? '' : '|' + w.names.join(','))]);
        if (!items.length) { if (box) { box.remove(); } return; }
        if (!box) { box = document.createElement('div'); box.id = 'ch-meet-alert'; document.body.appendChild(box); }
        box.innerHTML = items.map(w => { const live = w.kind === 'live', soon = w.kind === 'soon', many = w.names.length > 1; if (soon) { return `<div class="ch-ma ch-ma-soon" data-c="${ChUi.esc(w.code)}"><span class="far fa-calendar-check"></span><div class="ch-ma-t"><b>${w.minutes > 0 ? 'Tu videollamada empieza en ' + w.minutes + ' min' : w.minutes === 0 ? 'Tu videollamada empieza ahora' : 'Tu videollamada empezó hace ' + (-w.minutes) + ' min'}</b><small>${ChUi.esc(w.title || '')}</small></div><button class="btn btn-primary btn-sm" data-a="in" data-u="${ChUi.esc(w.hostUrl)}" data-n="${ChUi.esc(w.title || 'Videollamada')}" data-s="${ChUi.esc(w.refScope || '')}" data-l="${ChUi.esc(w.refId || '')}" data-nm="${ChUi.esc((w.names || [])[0] || '')}">Entrar a la sala</button><a role="button" data-a="x" data-k="${ChUi.esc(w.kind + w.code)}" title="Ocultar">×</a></div>`; } return `<div class="ch-ma" data-c="${ChUi.esc(w.code)}"><span class="fas ${live ? 'fa-video' : 'fa-user-clock'}"></span><div class="ch-ma-t"><b>${ChUi.esc(w.names.join(', '))}</b> ${live ? (many ? 'siguen' : 'sigue') + ' en la videollamada, sin ti' : (many ? 'esperan' : 'espera') + ' en la videollamada'}<small>${ChUi.esc(w.title || '')}</small></div>` +
            `<button class="btn btn-primary btn-sm" data-a="in" data-u="${ChUi.esc(w.hostUrl)}" data-n="${ChUi.esc(w.title || 'Videollamada')}" data-s="${ChUi.esc(w.refScope || '')}" data-l="${ChUi.esc(w.refId || '')}" data-nm="${ChUi.esc((w.names || [])[0] || '')}">${live ? 'Volver a entrar' : 'Entrar y admitir'}</button><a role="button" data-a="x" data-k="${ChUi.esc(w.kind + w.code + '|' + w.names.join(','))}" title="Ocultar">×</a></div>`; }).join('');
        box.onclick = e => {
            const a = e.target.closest('[data-a]'); if (!a) { return; }
            if (a.dataset.a === 'in') { Dock.open(a.dataset.u, a.dataset.n, a.dataset.s && a.dataset.l ? {s: a.dataset.s, l: a.dataset.l} : null, a.dataset.nm); }
            else { dismissed[a.dataset.k] = 1; a.closest('.ch-ma').remove(); if (!box.children.length) { box.remove(); } }
        };
        items.forEach(w => { if (w.kind === 'soon' && w.minutes > 5) { return; } const k = w.kind + w.code + '|' + w.names.join(','); if (!seen[k]) { seen[k] = 1; beep(); if (document.hidden && 'Notification' in window && Notification.permission === 'granted') { try { new Notification(w.kind === 'live' ? 'Un cliente sigue en la videollamada' : 'Un cliente espera en la videollamada', {body: w.kind === 'live' ? w.names.join(', ') + ' sigue en la sala.' : w.names.join(', ') + ' quiere entrar.', tag: 'ch-meet-' + w.code}); } catch (e) { /* sin aviso del navegador */ } } } });
    }

    function poll() {
        Espo.Ajax.getRequest('CrmHub/meet/waiting').then(r => paint([...(r.upcoming || []).map(u => ({kind: 'soon', code: 'm' + u.id, names: [u.parentName || 'Cliente'], title: u.name, minutes: u.minutes, hostUrl: u.hostUrl, refScope: u.parentType || '', refId: u.parentId || ''})), ...(r.waiting || []).map(w => Object.assign({refScope: w.leadId ? 'Lead' : '', refId: w.leadId || ''}, w))])).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } });
    }

    return {
        start() {
            if (started) { return; }   // el servidor responde vacío (sin llamar al Hub) si la empresa no tiene el servicio
            started = true; poll(); setInterval(() => { if (!document.hidden) { poll(); } }, 12000);
            document.addEventListener('visibilitychange', () => { if (!document.hidden) { poll(); } });
        },
    };
});
