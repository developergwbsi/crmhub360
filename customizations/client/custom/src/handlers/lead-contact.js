/**
 * Acciones de contacto del registro (llamar, correo, SMS, WhatsApp, Telegram): abren el panel de canal correspondiente al lado de la ficha.
 * Sirve a leads y también a cuentas, contactos y oportunidades: para estos resuelve el lead de origen con POST CrmHub/thread.
 * Paneles que abre: custom:views/modals/phone, email-thread y whatsapp (este último para WhatsApp, SMS y Telegram). Al cerrar el panel (evento done) se recarga el modelo.
 */
define('custom:handlers/lead-contact', ['action-handler', 'custom:ui'], function (Dep, ChUi) {
    return class extends Dep {
        // Solo hay un panel de canal abierto; la ficha del registro queda al lado.
        openChannel(view, options, cb) {
            if (this.view.hasView('channelPanel')) { this.view.getView('channelPanel').close(); this.view.clearView('channelPanel'); }
            this.view.createView('channelPanel', view, options, v => { v.render(); cb && cb(v); });
        }

        // Cuenta, contacto u oportunidad: la conversación (WhatsApp, SMS, Telegram) sigue en el lead del que nació; el servidor lo resuelve
        thread() {
            const m = this.view.model;
            if (m.entityType === 'Lead') { return Promise.resolve(null); }
            return Espo.Ajax.postRequest('CrmHub/thread', {scope: m.entityType, id: m.id}).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('No se pudo abrir la conversación de este registro.'); return false; });
        }

        base() { const m = this.view.model; return {leadId: m.id, scope: m.entityType, model: m, name: m.get('name')}; }

        withThread(fn) { this.thread().then(t => { if (t !== false) { fn(t); } }); }

        phoneOf(t) { return ((this.view.model.get('phoneNumber') || '') + '').trim() || (t && t.phone || '').trim(); }

        actionCall() {
            this.withThread(t => {
                const phone = this.phoneOf(t);
                if (!phone) { Espo.Ui.warning('Este registro no tiene teléfono.'); return; }
                this.openChannel('custom:views/modals/phone', {...this.base(), phone, handler: this});
            });
        }

        actionEmail() {
            this.withThread(t => {
                const email = ((this.view.model.get('emailAddress') || '') + '').trim() || (t && t.email || '').trim();
                if (!email) { Espo.Ui.warning('Este registro no tiene correo.'); return; }
                this.openChannel('custom:views/modals/email-thread', {...this.base(), email}, v => v.once('done', () => this.view.model.fetch()));
            });
        }

        chat(channel, phone, extra, t) {
            const base = t ? {leadId: t.leadId, scope: 'Lead', model: this.view.model, name: this.view.model.get('name')} : this.base();
            this.openChannel('custom:views/modals/whatsapp', {...base, channel, phone, ...extra}, v => v.once('done', () => this.view.model.fetch()));
        }

        // Videollamada propia: crea una sala, muestra el enlace del cliente (copiar o enviar por WhatsApp) y deja entrar al asesor
        actionVideo() {
            const m = this.view.model;
            Espo.Ui.notify('Creando la videollamada…');
            Espo.Ajax.postRequest('CrmHub/meet/create', {leadId: m.id}).then(r => {
                Espo.Ui.notify(false);
                const phone = ((m.get('phoneNumber') || '') + '').trim();
                ChUi.panel({title: 'Videollamada con ' + (m.get('name') || 'el cliente'), icon: 'fas fa-video', mount: body => {
                    body.innerHTML = '<p>La sala está lista. Comparte este enlace con el cliente: entra desde el navegador, sin instalar nada ni crear una cuenta.</p>' +
                        '<div class="input-group"><input class="form-control" data-r="url" readonly><span class="input-group-btn"><button class="btn btn-default" data-r="copy"><span class="far fa-copy"></span> Copiar</button></span></div>' +
                        '<p class="ch-muted" style="margin:8px 0 12px">El enlace sirve ' + Number(r.expiresInHours) + ' horas. Tu entrada es personal: no la compartas.</p>' +
                        '<button class="btn btn-primary" data-r="enter"><span class="fas fa-video"></span> Entrar a la sala</button> ' +
                        (phone ? '<button class="btn btn-default" data-r="wa"><span class="fab fa-whatsapp"></span> Enviar enlace por WhatsApp</button>' : '');
                    const q = k => body.querySelector('[data-r="' + k + '"]');
                    q('url').value = r.guestUrl;
                    q('copy').onclick = () => { q('url').select(); (navigator.clipboard ? navigator.clipboard.writeText(r.guestUrl) : Promise.reject()).catch(() => document.execCommand('copy')).then(() => Espo.Ui.success('Enlace copiado'), () => {}); };
                    q('enter').onclick = () => { window.open(r.hostUrl, '_blank', 'noopener'); };
                    if (phone) {
                        q('wa').onclick = () => {
                            q('wa').disabled = true;
                            Espo.Ajax.postRequest('CrmHub/whatsapp/send', {leadId: m.id, phone, text: 'Hola, te comparto el enlace de nuestra videollamada: ' + r.guestUrl + ' . Ábrelo desde tu celular o computador.'})
                                .then(() => { Espo.Ui.success('Enlace enviado por WhatsApp'); m.fetch(); })
                                .catch(xhr => { q('wa').disabled = false; const why = xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason'); Espo.Ui.error(why || 'No se pudo enviar por WhatsApp'); if (xhr) { xhr.errorIsHandled = true; } });
                        };
                    }
                }});
            }).catch(xhr => { Espo.Ui.notify(false); const why = xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason'); Espo.Ui.error(why || 'No se pudo crear la videollamada'); if (xhr) { xhr.errorIsHandled = true; } });
        }

        actionSms() {
            this.withThread(t => { const phone = this.phoneOf(t); if (!phone) { Espo.Ui.warning('Este registro no tiene teléfono.'); return; } this.chat('sms', phone, null, t); });
        }

        actionWhatsapp() {
            this.withThread(t => { const phone = this.phoneOf(t); if (!phone) { Espo.Ui.warning('Este registro no tiene teléfono.'); return; } this.chat('whatsapp', phone, null, t); });
        }

        // Con chat abierto: escribe por Telegram. Sin chat: el panel muestra la invitación (enlace de un solo uso).
        actionTelegram() {
            this.withThread(t => {
                const m = t || {telegramUsername: this.view.model.get('telegramUsername'), telegramChatId: this.view.model.get('telegramChatId')};
                this.chat('telegram', m.telegramUsername ? '@' + m.telegramUsername : this.phoneOf(t), {hasChat: !!m.telegramChatId}, t);
            });
        }

        actionTelegramInvite() {
            this.withThread(t => {
                const m = t || {telegramUsername: this.view.model.get('telegramUsername')};
                this.chat('telegram', m.telegramUsername ? '@' + m.telegramUsername : this.phoneOf(t), {hasChat: false, mode: 'invite'}, t);
            });
        }
    };
});
