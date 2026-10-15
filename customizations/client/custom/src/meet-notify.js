/**
 * Avisar al cliente de una reunión con videollamada por el canal que se elija (correo, WhatsApp, SMS, Telegram), cada uno con su plantilla.
 * ask({meetingId, kind: 'invite'|'update', title, text, ok}) → muestra los canales disponibles, envía y resume el resultado por canal.
 * Endpoints: GET CrmHub/meet/inviteInfo?meetingId, POST CrmHub/meet/invite {meetingId, kind, channels}.
 */
define('custom:meet-notify', ['custom:ui'], function (ChUi) {
    const CH = [['email', 'fas fa-envelope', 'Correo', 'con botón para unirse y «Agregar al calendario» (Google, Outlook y .ics)'], ['whatsapp', 'fab fa-whatsapp', 'WhatsApp', 'mensaje con los datos, el enlace y el enlace al calendario'],
        ['sms', 'fas fa-comment-sms', 'SMS', 'mensaje corto con fecha y enlace'], ['telegram', 'fab fa-telegram', 'Telegram', 'mensaje con los datos y el enlace']];

    function ask(o) {
        const upd = o.kind === 'update';
        return Espo.Ajax.getRequest('CrmHub/meet/inviteInfo', {meetingId: o.meetingId}).then(info => new Promise(resolve => {
            const av = info.channels || {};
            if (!Object.values(av).some(Boolean)) { ChUi.notice({title: 'Sin forma de avisar', text: 'El cliente no tiene correo ni teléfono en su ficha. Agrégalos o comparte el enlace por otro medio.'}); resolve(false); return; }
            ChUi.panel({title: o.title || (upd ? 'Avisar de la actualización' : 'Enviar la invitación'), icon: upd ? 'fas fa-calendar-check' : 'fas fa-paper-plane', close: 'Cerrar', mount: (body, close) => {
                const sub = (info.name ? '<b>' + ChUi.esc(info.name) + '</b>' : 'El cliente');
                body.innerHTML = `<p>${o.text ? ChUi.esc(o.text) : (upd ? 'Cambiaste la agenda. ¿Quieres avisarle a ' + sub + ' con los datos nuevos?' : '¿Por dónde quieres enviarle la invitación a ' + sub + '?')}</p>` +
                    CH.map(([k, ic, n, d]) => `<label class="ch-mn-opt ${av[k] ? '' : 'off'}"><input type="checkbox" data-k="${k}" ${av[k] ? '' : 'disabled'} ${k === 'email' && av.email ? 'checked' : ''}><span class="${ic}"></span><div><b>${n}</b><small>${av[k] ? d : 'No disponible para este cliente'}</small></div></label>`).join('') +
                    `<div class="ch-mn-res ch-muted" data-r></div><div class="ch-mn-act"><button class="btn btn-primary" data-go><span class="fas fa-paper-plane"></span> ${upd ? 'Enviar actualización' : 'Enviar invitación'}</button></div>`;
                const res = body.querySelector('[data-r]'), go = body.querySelector('[data-go]');
                go.onclick = () => {
                    const channels = [...body.querySelectorAll('[data-k]:checked')].map(i => i.dataset.k);
                    if (!channels.length) { res.textContent = 'Elige al menos un canal.'; return; }
                    go.disabled = true; res.textContent = 'Enviando…';
                    Espo.Ajax.postRequest('CrmHub/meet/invite', {meetingId: o.meetingId, kind: o.kind || 'invite', channels}).then(r => {
                        const names = Object.fromEntries(CH.map(c => [c[0], c[2]]));
                        res.innerHTML = Object.entries(r.results || {}).map(([k, v]) => v.ok ? `✓ ${names[k]}: enviado` : `✗ ${names[k]}: ${ChUi.esc(v.error || 'no se pudo enviar')}`).join('<br>');
                        go.disabled = false; go.textContent = 'Enviar de nuevo';
                        if (Object.values(r.results || {}).every(v => v.ok)) { setTimeout(() => close(true), 1400); }
                    }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } res.textContent = 'No se pudo enviar.'; go.disabled = false; });
                };
            }}).then(() => resolve(true));
        })).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('No se pudo cargar los datos del cliente'); return false; });
    }

    return {ask};
});
