define('custom:handlers/lead-contact', ['action-handler'], function (Dep) {
    return class extends Dep {
        // Solo hay un panel de canal abierto; la ficha del lead queda al lado.
        openChannel(view, options, cb) {
            if (this.view.hasView('channelPanel')) { this.view.getView('channelPanel').close(); this.view.clearView('channelPanel'); }
            this.view.createView('channelPanel', view, options, v => { v.render(); cb && cb(v); });
        }

        phone() {
            const m = this.view.model;
            return (m.get('phoneNumber') || '').trim();
        }

        // El botón Llamar abre el teléfono del lead (marcador + historial de llamadas).
        actionCall() {
            const phone = this.phone();
            if (!phone) { Espo.Ui.warning('Este lead no tiene teléfono.'); return; }
            const m = this.view.model;
            this.openChannel('custom:views/modals/phone', {leadId: m.id, model: m, name: m.get('name'), phone, handler: this});
        }

        // Si la empresa configuró telefonía (Integraciones → SMS y llamadas), la central llama primero al asesor y luego lo conecta con el cliente.
        // Si no, se abre el marcador del equipo (tel:) y luego se registra el resultado a mano.
        actionCallStart(phone) {
            Espo.Ajax.getRequest('CrmHub/channels')
                .then(ch => ch.voice ? this.clickToCall(phone) : this.dialerCall(phone))
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } this.dialerCall(phone); });
        }

        manualCallLog(phone) {
            this.view.createView('callLog', 'custom:views/modals/call-log', {leadId: this.view.model.id, phone}, v => {
                v.render();
                v.once('done', () => this.view.model.fetch());
            });
        }

        actionEmail() {
            const m = this.view.model, email = (m.get('emailAddress') || '').trim();
            if (!email) { Espo.Ui.warning('Este lead no tiene correo.'); return; }
            this.openChannel('custom:views/modals/email-thread', {leadId: m.id, name: m.get('name'), email}, v => v.once('done', () => m.fetch()));
        }

        clickToCall(phone) {
            this.view.createView('callStart', 'custom:views/modals/call-start', {leadId: this.view.model.id, phone}, v => {
                v.render();
                v.once('done', () => this.view.model.fetch());
                v.once('dialer', () => this.dialerCall(phone));
            });
        }

        dialerCall(phone) {
            window.location.href = 'tel:' + phone.replace(/[^+\d]/g, '');
            this.view.createView('callLog', 'custom:views/modals/call-log', {leadId: this.view.model.id, phone}, v => {
                v.render();
                v.once('done', () => this.view.model.fetch());
            });
        }

        actionSms() {
            if (!this.phone()) { Espo.Ui.warning('Este lead no tiene teléfono.'); return; }
            this.openChannel('custom:views/modals/whatsapp', {channel: 'sms', leadId: this.view.model.id, name: this.view.model.get('name'), phone: this.phone()}, v => v.once('done', () => this.view.model.fetch()));
        }

        // Con chat abierto: escribe por Telegram. Sin chat: genera el enlace de invitación (t.me) para que el cliente abra el bot.
        actionTelegram() {
            const m = this.view.model;
            if (!m.get('telegramChatId')) { this.actionTelegramInvite(); return; }
            this.openChannel('custom:views/modals/whatsapp', {channel: 'telegram', leadId: m.id, name: m.get('name'), phone: m.get('telegramUsername') ? '@' + m.get('telegramUsername') : 'Telegram'}, v => v.once('done', () => m.fetch()));
        }

        actionTelegramInvite() {
            this.view.createView('tgInvite', 'custom:views/modals/telegram-invite', {leadId: this.view.model.id}, v => { v.render(); v.once('done', () => this.view.model.fetch()); });
        }

        actionWhatsapp() {
            if (!this.phone()) { Espo.Ui.warning('Este lead no tiene teléfono.'); return; }
            this.openChannel('custom:views/modals/whatsapp', {leadId: this.view.model.id, name: this.view.model.get('name'), phone: this.phone()}, v => v.once('done', () => this.view.model.fetch()));
        }
    };
});
