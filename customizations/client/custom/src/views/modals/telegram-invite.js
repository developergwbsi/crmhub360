define('custom:views/modals/telegram-invite', ['views/modal'], function (Dep) {
    return class extends Dep {
        templateContent = `
            <p class="ch-muted">Este lead aún no ha abierto el chat con tu bot de Telegram. Envíale este enlace (por WhatsApp, correo o llamada): al abrirlo y pulsar <b>Iniciar</b>, la conversación queda ligada a este lead.</p>
            {{#if link}}
            <div class="form-group"><label>Enlace de invitación (de un solo uso)</label>
                <div class="ch-row"><input class="form-control" readonly value="{{link}}" data-role="link" style="flex:1"><button class="btn btn-primary" data-action="copyLink">Copiar</button></div></div>
            {{else}}{{#if error}}<div class="ch-warn">{{error}}</div>{{else}}<div class="ch-muted">Generando enlace…</div>{{/if}}{{/if}}`

        events = {
            'click [data-action="copyLink"]': function () {
                const v = this.link;
                (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(() => Espo.Ui.success('Enlace copiado'))
                    .catch(() => { this.$el.find('[data-role="link"]').select(); Espo.Ui.warning('Cópialo manualmente (Ctrl+C)'); });
            },
        }

        setup() {
            this.headerText = 'Invitar por Telegram';
            this.buttonList = [{name: 'cancel', label: 'Cerrar'}];
            Espo.Ajax.postRequest('CrmHub/telegram/invite', {leadId: this.options.leadId})
                .then(r => { this.link = r.link; this.reRender(); this.trigger('done'); })
                .catch(xhr => {
                    this.error = (xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason')) || 'No se pudo generar el enlace.';
                    if (xhr) { xhr.errorIsHandled = true; }
                    this.reRender();
                });
        }

        data() { return {link: this.link, error: this.error}; }
    };
});
