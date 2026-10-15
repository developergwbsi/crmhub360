/**
 * Avisar al cliente de una reunión con videollamada por el canal que se elija (correo, WhatsApp, SMS, Telegram), cada uno con su plantilla.
 * Avisa a las personas de la reunión (registro ligado + leads y contactos invitados), cada una por los canales que tenga. ask({meetingId, kind: 'invite'|'update', title, text, ok}) → muestra los canales disponibles, envía y resume el resultado por canal.
 * Endpoints: GET CrmHub/meet/inviteInfo?meetingId, POST CrmHub/meet/invite {meetingId, kind, channels}.
 */
define('custom:meet-notify', ['custom:ui'], function (ChUi) {
    const CH = [['email', 'fas fa-envelope', 'Correo', 'con botón para unirse y «Agregar al calendario» (Google, Outlook y .ics)'], ['whatsapp', 'fab fa-whatsapp', 'WhatsApp', 'mensaje con los datos, el enlace y el enlace al calendario'],
        ['sms', 'fas fa-comment-sms', 'SMS', 'mensaje corto con fecha y enlace'], ['telegram', 'fab fa-telegram', 'Telegram', 'mensaje con los datos y el enlace']];

    function ask(o) {
        const upd = o.kind === 'update', esc = ChUi.esc;
        return Espo.Ajax.getRequest('CrmHub/meet/inviteInfo', {meetingId: o.meetingId}).then(info => new Promise(resolve => {
            const rec = info.recipients || [];
            if (!rec.some(r => Object.values(r.channels).some(Boolean))) { ChUi.notice({title: 'Sin forma de avisar', text: 'Nadie de esta reunión tiene correo o teléfono en su ficha. Agrégalos o comparte el enlace por otro medio.'}); resolve(false); return; }
            const any = k => rec.some(r => r.channels[k]);
            ChUi.panel({title: o.title || (upd ? 'Avisar de la actualización' : 'Enviar la invitación'), icon: upd ? 'fas fa-calendar-check' : 'fas fa-paper-plane', close: 'Cerrar', mount: (body, close) => {
                body.innerHTML = `<p>${o.text ? esc(o.text) : (upd ? 'Cambiaste la agenda. ¿A quién le avisas con los datos nuevos?' : '¿A quién le envías la invitación?')}</p>` +
                    '<div class="ch-mn-label">Personas</div>' + rec.map(r => `<label class="ch-mn-opt"><input type="checkbox" data-r="${esc(r.key)}" checked><span class="fas ${r.scope === 'Lead' ? 'fa-address-card' : 'fa-user'}"></span><div><b>${esc(r.name)}</b><small>${esc([r.scope === 'Lead' ? 'Lead' : r.scope === 'Contact' ? 'Contacto' : 'Cuenta', r.email, r.phone].filter(Boolean).join(' · ') || 'Sin correo ni teléfono')}</small></div></label>`).join('') +
                    '<div class="ch-mn-label">Por qué canal (cada uno con su plantilla)</div><div class="ch-mn-chs">' + CH.map(([k, ic, n, d]) => `<label class="ch-mn-ch ${any(k) ? '' : 'off'}" title="${esc(any(k) ? d : 'Ninguna de estas personas lo tiene disponible')}"><input type="checkbox" data-k="${k}" ${any(k) ? '' : 'disabled'} ${k === 'email' && any('email') ? 'checked' : ''}><span class="${ic}"></span> ${n}</label>`).join('') + '</div>' +
                    `<div class="ch-mn-res ch-muted" data-r2></div><div class="ch-mn-act"><button class="btn btn-primary" data-go><span class="fas fa-paper-plane"></span> ${upd ? 'Enviar actualización' : 'Enviar invitación'}</button></div>`;
                const res = body.querySelector('[data-r2]'), go = body.querySelector('[data-go]');
                go.onclick = () => {
                    const channels = [...body.querySelectorAll('[data-k]:checked')].map(i => i.dataset.k), to = [...body.querySelectorAll('[data-r]:checked')].map(i => i.dataset.r);
                    if (!channels.length || !to.length) { res.textContent = 'Elige al menos una persona y un canal.'; return; }
                    go.disabled = true; res.textContent = 'Enviando…';
                    Espo.Ajax.postRequest('CrmHub/meet/invite', {meetingId: o.meetingId, kind: o.kind || 'invite', channels, to}).then(r => {
                        const names = Object.fromEntries(CH.map(c => [c[0], c[2]])), list = r.results || [];
                        res.innerHTML = list.map(v => v.ok ? `✓ ${esc(v.name)} · ${names[v.channel]}: enviado` : `✗ ${esc(v.name)} · ${names[v.channel]}: ${esc(v.error || 'no se pudo enviar')}`).join('<br>');
                        go.disabled = false; go.textContent = 'Enviar de nuevo';
                        if (list.length && list.every(v => v.ok)) { setTimeout(() => close(true), 1600); }
                    }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } res.textContent = 'No se pudo enviar.'; go.disabled = false; });
                };
            }}).then(() => resolve(true));
        })).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('No se pudo cargar los datos de la reunión'); return false; });
    }

    return {ask};
});
