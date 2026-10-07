define('custom:views/modals/whatsapp', ['views/modal'], function (Dep) {
    return class extends Dep {
        templateContent = `
            <p class="ch-muted">Para <b>{{name}}</b> · {{phone}}</p>
            <div class="form-group">
                <label>Mensaje</label>
                <textarea name="text" class="form-control" rows="6" maxlength="4000" placeholder="Escribe el mensaje…"></textarea>
                <div class="ch-row" style="margin-top:8px">
                    <button class="btn btn-default btn-sm" data-action="aiDraft"><span class="fas fa-wand-magic-sparkles"></span> Sugerir con IA</button>
                    <span class="ch-muted ch-small">La IA propone un borrador según la conversación; revísalo antes de enviar.</span><span class="ch-muted ch-small" data-role="counter" style="margin-left:auto"></span>
                </div>
            </div>`

        events = {
            'input [name="text"]': function () {
                if (this.channel !== 'sms') { return; }
                const v = this.$el.find('[name="text"]').val() || '';
                const uni = /[^\u0000-\u007F¡¿áéíóúñÑüÜÁÉÍÓÚ€£¥èùìòÇØøÅåΔΦΓΛΩΠΨΣΘΞÆæßÉÄÖÜ§]/.test(v);
                const single = uni ? 70 : 160, multi = uni ? 67 : 153;
                const seg = v.length <= single ? (v.length ? 1 : 0) : Math.ceil(v.length / multi);
                this.$el.find('[data-role="counter"]').text(`${v.length} caracteres · ${seg} SMS${uni ? ' (lleva caracteres especiales: caben menos)' : ''}`);
            },
            'click [data-action="aiDraft"]': function () {
                Espo.Ui.notify('Redactando…');
                Espo.Ajax.postRequest(`Lead/${this.options.leadId}/ai/draft`, {}, {timeout: 300000})
                    .then(r => { Espo.Ui.notify(false); this.$el.find('[name="text"]').val(r.text || ''); })
                    .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('El asistente IA no está disponible'); });
            },
        }

        setup() {
            this.channel = ['telegram', 'sms'].includes(this.options.channel) ? this.options.channel : 'whatsapp';
            this.headerText = {telegram: 'Enviar Telegram', sms: 'Enviar SMS', whatsapp: 'Enviar WhatsApp'}[this.channel];
            this.buttonList = [{name: 'save', label: 'Enviar', style: 'primary'}, {name: 'cancel', label: 'Cancelar'}];
        }

        data() { return {name: this.options.name, phone: this.options.phone}; }

        actionSave() {
            const text = (this.$el.find('[name="text"]').val() || '').trim();
            if (!text) { Espo.Ui.warning('Escribe un mensaje.'); return; }
            Espo.Ui.notify('Enviando…');
            Espo.Ajax.postRequest('CrmHub/' + this.channel + '/send', {leadId: this.options.leadId, text})
                .then(() => { Espo.Ui.success('Mensaje enviado'); this.trigger('done'); this.close(); })
                .catch(xhr => {
                    const reason = xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason');
                    Espo.Ui.error(reason || 'No se pudo enviar el mensaje');
                    if (xhr) { xhr.errorIsHandled = true; }
                });
        }
    };
});
