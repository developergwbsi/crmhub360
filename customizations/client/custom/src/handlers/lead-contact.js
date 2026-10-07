define('custom:handlers/lead-contact', ['action-handler'], function (Dep) {
    return class extends Dep {
        // Solo hay un panel de canal abierto; la ficha del registro queda al lado.
        openChannel(view, options, cb) {
            if (this.view.hasView('channelPanel')) { this.view.getView('channelPanel').close(); this.view.clearView('channelPanel'); }
            this.view.createView('channelPanel', view, options, v => { v.render(); cb && cb(v); });
        }

        phone() { return (this.view.model.get('phoneNumber') || '').trim(); }

        base() { const m = this.view.model; return {leadId: m.id, scope: m.entityType, model: m, name: m.get('name')}; }

        actionCall() {
            if (!this.phone()) { Espo.Ui.warning('Este registro no tiene teléfono.'); return; }
            this.openChannel('custom:views/modals/phone', {...this.base(), phone: this.phone(), handler: this});
        }

        actionEmail() {
            const email = (this.view.model.get('emailAddress') || '').trim();
            if (!email) { Espo.Ui.warning('Este registro no tiene correo.'); return; }
            this.openChannel('custom:views/modals/email-thread', {...this.base(), email}, v => v.once('done', () => this.view.model.fetch()));
        }

        chat(channel, phone, extra) {
            this.openChannel('custom:views/modals/whatsapp', {...this.base(), channel, phone, ...extra}, v => v.once('done', () => this.view.model.fetch()));
        }

        actionSms() {
            if (!this.phone()) { Espo.Ui.warning('Este lead no tiene teléfono.'); return; }
            this.chat('sms', this.phone());
        }

        actionWhatsapp() {
            if (!this.phone()) { Espo.Ui.warning('Este lead no tiene teléfono.'); return; }
            this.chat('whatsapp', this.phone());
        }

        // Con chat abierto: escribe por Telegram. Sin chat: el panel muestra la invitación (enlace de un solo uso).
        actionTelegram() {
            const m = this.view.model;
            this.chat('telegram', m.get('telegramUsername') ? '@' + m.get('telegramUsername') : this.phone(), {hasChat: !!m.get('telegramChatId')});
        }

        actionTelegramInvite() {
            const m = this.view.model;
            this.chat('telegram', m.get('telegramUsername') ? '@' + m.get('telegramUsername') : this.phone(), {hasChat: false, mode: 'invite'});
        }
    };
});
