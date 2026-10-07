// Panel lateral con la ficha del lead: deja ver el tablero y, si se necesita todo, «Abrir completo» lleva a pantalla completa.
define('custom:views/modals/lead-drawer', ['views/modals/detail', 'custom:handlers/lead-contact', 'custom:split'], function (Dep, ContactHandler, Split) {
    return class extends Dep {
        className = 'dialog dialog-record ch-drawer ch-lead-drawer'
        backdrop = false
        fitHeight = false
        navigateButtonsDisabled = true
        editDisabled = false

        setup() {
            super.setup();
            // la X de la cabecera ya cierra el panel: se quita el botón «Cerrar»
            this.buttonList = this.buttonList.filter(b => b.name !== 'cancel');
            const full = this.buttonList.find(b => b.name === 'fullForm');
            if (full) { delete full.label; full.html = '<span class="fas fa-up-right-and-down-left-from-center"></span> Abrir completo'; full.style = 'primary'; }
            const scope = this.scope || this.options.scope || 'Lead';
            const all = [
                ['callLead', 'fas fa-phone', 'Llamar', 'actionCall'], ['whatsappLead', 'fab fa-whatsapp', 'WhatsApp', 'actionWhatsapp'],
                ['smsLead', 'fas fa-comment-sms', 'SMS', 'actionSms'], ['telegramLead', 'fab fa-telegram', 'Telegram', 'actionTelegram'], ['emailLead', 'fas fa-envelope', 'Correo', 'actionEmail'],
            ];
            // WhatsApp, SMS y Telegram viven en el módulo de leads; llamadas y correo sirven para cualquier registro
            const contact = scope === 'Lead' ? all : all.filter(c => ['callLead', 'emailLead'].includes(c[0]));
            contact.slice().reverse().forEach(([name, icon, label, fn]) => {
                this.buttonList.unshift({name, html: `<span class="${icon}"></span>`, title: label, className: 'ch-contact-btn ch-contact-' + name, onClick: () => new ContactHandler(this)[fn]()});
            });
        }

        afterRender() {
            super.afterRender();
            if (!this._chSplit) { this._chSplit = true; Split.open('lead'); }
        }

        onRemove() {
            if (this._chSplit) { this._chSplit = false; Split.close('lead'); }
            super.onRemove && super.onRemove();
        }

        // El título del panel es el propio nombre: el encabezado visual del registro ya muestra los datos.
        createRecordView(cb) {
            super.createRecordView(cb);
            this.headerHtml = '<span class="fas fa-address-card"></span> ' + ({Account: 'Ficha de la cuenta', Contact: 'Ficha del contacto', Opportunity: 'Ficha de la oportunidad'}[this.scope || this.options.scope] || 'Ficha del lead');
        }
    };
});
