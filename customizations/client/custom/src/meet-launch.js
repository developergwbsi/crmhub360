/**
 * Videollamada propia desde un registro: crea (o reutiliza) la sala del lead y muestra el enlace del cliente, la entrada del asesor y el envío por WhatsApp.
 * Lo usan el botón «Videollamada» de la ficha (custom:handlers/lead-contact) y el panel «Videollamadas» (custom:views/panels/video).
 * Endpoints: POST CrmHub/meet/create, meet/end y whatsapp/send.
 */
define('custom:meet-launch', ['custom:ui'], function (ChUi) {
    return {
        // leadId: el lead al que pertenece la conversación; model: el registro abierto (solo para el nombre y refrescar); phone: teléfono para enviar el enlace por WhatsApp
        open(model, leadId, phone) {
            const m = model;
            Espo.Ui.notify('Creando la videollamada…');
            Espo.Ajax.postRequest('CrmHub/meet/create', {leadId: leadId}).then(r => {
                Espo.Ui.notify(false);
                                ChUi.panel({title: 'Videollamada con ' + (m.get('name') || 'el cliente'), icon: 'fas fa-video', mount: body => {
                    body.innerHTML = '<p>' + (r.reused ? 'Esta lead ya tiene una sala activa: puedes volver a entrar cuando quieras, aunque cierres la ventana.' : 'La sala está lista.') + ' Comparte este enlace con el cliente: entra desde el navegador, sin instalar nada ni crear una cuenta. <b>Cuando el cliente lo abra, te llegará una solicitud dentro de la sala para que lo admitas.</b></p>' +
                        '<div class="input-group"><input class="form-control" data-r="url" readonly><span class="input-group-btn"><button class="btn btn-default" data-r="copy"><span class="far fa-copy"></span> Copiar</button></span></div>' +
                        '<p class="ch-muted" style="margin:8px 0 12px">El enlace del cliente no cambia y sirve ' + Number(r.expiresInHours) + ' horas. Tu entrada (botón «Entrar a la sala») es personal: no la compartas.</p>' +
                        '<button class="btn btn-primary" data-r="enter"><span class="fas fa-video"></span> Entrar a la sala</button> ' +
                        (phone ? '<button class="btn btn-default" data-r="wa"><span class="fab fa-whatsapp"></span> Enviar enlace por WhatsApp</button> ' : '') + '<button class="btn btn-link text-danger" data-r="end">Cerrar esta sala</button>';
                    const q = k => body.querySelector('[data-r="' + k + '"]');
                    q('url').value = r.guestUrl;
                    q('copy').onclick = () => { q('url').select(); (navigator.clipboard ? navigator.clipboard.writeText(r.guestUrl) : Promise.reject()).catch(() => document.execCommand('copy')).then(() => Espo.Ui.success('Enlace copiado'), () => {}); };
                    q('enter').onclick = () => { window.open(r.hostUrl, '_blank', 'noopener'); };
                    q('end').onclick = () => { Espo.Ajax.postRequest('CrmHub/meet/end', {leadId: leadId, code: r.code}).then(() => { Espo.Ui.success('Sala cerrada: el enlace ya no sirve. La próxima videollamada crea una sala nueva.'); body.closest('.ch-dlg, .modal, body').querySelectorAll('[data-a="ok"]').forEach(b => b.click()); }).catch(() => Espo.Ui.error('No se pudo cerrar la sala')); };
                    if (phone) {
                        q('wa').onclick = () => {
                            q('wa').disabled = true;
                            Espo.Ajax.postRequest('CrmHub/whatsapp/send', {leadId: leadId, phone, text: 'Hola, te comparto el enlace de nuestra videollamada: ' + r.guestUrl + ' . Ábrelo desde tu celular o computador.'})
                                .then(() => { Espo.Ui.success('Enlace enviado por WhatsApp'); m.fetch(); })
                                .catch(xhr => { q('wa').disabled = false; const why = xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason'); Espo.Ui.error(why || 'No se pudo enviar por WhatsApp'); if (xhr) { xhr.errorIsHandled = true; } });
                        };
                    }
                }});
            }).catch(xhr => { Espo.Ui.notify(false); const why = xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason'); Espo.Ui.error(why || 'No se pudo crear la videollamada'); if (xhr) { xhr.errorIsHandled = true; } });
        }
    };
});
