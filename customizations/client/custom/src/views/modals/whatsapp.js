/**
 * Panel acoplado de conversación (WhatsApp, Telegram o SMS) de un lead: encabezado, pantalla dividida ('ch') y el chat común (custom:views/chat-pane).
 * Mismos endpoints que el componente; avisa 'done' hacia fuera cuando se envía un mensaje.
 */
define('custom:views/modals/whatsapp', ['views/modal', 'custom:ui', 'custom:split'], function (Dep, ChUi, Split) {
    const META = {
        whatsapp: {title: 'WhatsApp', icon: 'fab fa-whatsapp', color: '#25d366'},
        telegram: {title: 'Telegram', icon: 'fab fa-telegram', color: '#229ed9'},
        sms: {title: 'SMS', icon: 'fas fa-comment-sms', color: '#0ea5e9'},
    };
    return class extends Dep {
        className = 'dialog ch-ch-panel ch-chat-modal'
        backdrop = false
        templateContent = '<div class="ch-chat-host"></div>'

        setup() {
            this.channel = META[this.options.channel] ? this.options.channel : 'whatsapp';
            this.meta = META[this.channel];
            this.buttonList = [];
            this.headerHtml = `<span class="ch-chat-badge" style="background:${this.meta.color}"><span class="${this.meta.icon}"></span></span> ` +
                `<span class="ch-chat-title"><b>${ChUi.esc(this.options.name || '')}</b><small>${ChUi.esc(this.options.phone || '')} · ${this.meta.title}</small></span>`;
            this.createView('pane', 'custom:views/chat-pane', {selector: '.ch-chat-host', leadId: this.options.leadId, channel: this.channel, name: this.options.name, phone: this.options.phone, hasChat: this.options.hasChat, mode: this.options.mode}, v => {
                this.listenTo(v, 'done', () => this.trigger('done'));
                this.listenTo(v, 'phone', cur => { const sub = this.el && this.el.querySelector('.ch-chat-title small'); if (sub && cur) { sub.textContent = cur + ' · ' + this.meta.title; } });
            });
        }

        afterRender() { if (!this._chSplit) { this._chSplit = true; Split.open('ch'); } }

        onRemove() { if (this._chSplit) { this._chSplit = false; Split.close('ch'); } }
    };
});
