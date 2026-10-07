// Panel lateral con la ficha del lead: deja ver el tablero y, si se necesita todo, «Abrir completo» lleva a pantalla completa.
define('custom:views/modals/lead-drawer', ['views/modals/detail', 'custom:handlers/lead-contact'], function (Dep, ContactHandler) {
    return class extends Dep {
        className = 'dialog dialog-record ch-drawer'
        backdrop = false
        fitHeight = false
        navigateButtonsDisabled = true
        editDisabled = false

        setup() {
            super.setup();
            const full = this.buttonList.find(b => b.name === 'fullForm');
            if (full) { delete full.label; full.html = '<span class="fas fa-up-right-and-down-left-from-center"></span> Abrir completo'; full.style = 'primary'; }
            const contact = [
                ['callLead', 'fas fa-phone', 'Llamar', 'actionCall'], ['whatsappLead', 'fab fa-whatsapp', 'WhatsApp', 'actionWhatsapp'],
                ['smsLead', 'fas fa-comment-sms', 'SMS', 'actionSms'], ['telegramLead', 'fab fa-telegram', 'Telegram', 'actionTelegram'], ['emailLead', 'fas fa-envelope', 'Correo', 'actionEmail'],
            ];
            contact.slice().reverse().forEach(([name, icon, label, fn]) => {
                this.buttonList.unshift({name, html: `<span class="${icon}"></span> ${label}`, className: 'ch-contact-btn ch-contact-' + name, onClick: () => new ContactHandler(this)[fn]()});
            });
        }

        // El título del panel es el propio nombre: el encabezado visual del registro ya muestra los datos.
        createRecordView(cb) {
            super.createRecordView(cb);
            this.headerHtml = '<span class="fas fa-address-card"></span> Ficha del lead';
        }
    };
});
