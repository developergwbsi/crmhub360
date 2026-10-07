define('custom:handlers/lead-contact', ['action-handler'], function (Dep) {
    return class extends Dep {
        phone() {
            const m = this.view.model;
            return (m.get('phoneNumber') || '').trim();
        }

        // Abre el marcador del equipo (softphone o teléfono vinculado) y pide registrar el resultado.
        actionCall() {
            const phone = this.phone();
            if (!phone) { Espo.Ui.warning('Este lead no tiene teléfono.'); return; }
            window.location.href = 'tel:' + phone.replace(/[^+\d]/g, '');
            this.view.createView('callLog', 'custom:views/modals/call-log', {leadId: this.view.model.id, phone}, v => {
                v.render();
                v.once('done', () => this.view.model.fetch());
            });
        }

        // Con chat abierto: escribe por Telegram. Sin chat: genera el enlace de invitación (t.me) para que el cliente abra el bot.
        actionTelegram() {
            const m = this.view.model;
            if (!m.get('telegramChatId')) { this.actionTelegramInvite(); return; }
            this.view.createView('telegram', 'custom:views/modals/whatsapp', {channel: 'telegram', leadId: m.id, name: m.get('name'), phone: m.get('telegramUsername') ? '@' + m.get('telegramUsername') : 'Telegram'}, v => {
                v.render();
                v.once('done', () => m.fetch());
            });
        }

        actionTelegramInvite() {
            this.view.createView('tgInvite', 'custom:views/modals/telegram-invite', {leadId: this.view.model.id}, v => { v.render(); v.once('done', () => this.view.model.fetch()); });
        }

        actionWhatsapp() {
            if (!this.phone()) { Espo.Ui.warning('Este lead no tiene teléfono.'); return; }
            this.view.createView('whatsapp', 'custom:views/modals/whatsapp', {leadId: this.view.model.id, name: this.view.model.get('name'), phone: this.phone()}, v => {
                v.render();
                v.once('done', () => this.view.model.fetch());
            });
        }
    };
});
