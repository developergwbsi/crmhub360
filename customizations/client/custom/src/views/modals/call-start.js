define('custom:views/modals/call-start', ['views/modal'], function (Dep) {
    return class extends Dep {
        templateContent = `
            <p class="ch-muted">Primero <b>te llamamos a ti</b>; cuando contestes te conectamos con <b>{{phone}}</b>.</p>
            <div class="form-group"><label>Tu teléfono o extensión</label>
                <input name="agent" class="form-control" value="{{agent}}" placeholder="3001234567 o 101" autocomplete="tel"></div>
            <div class="ch-small ch-muted">Se recuerda en este equipo. Al terminar, el resultado se registra solo; puedes completar las notas en el lead.</div>
            <div style="margin-top:12px"><a role="button" data-action="dialer" class="ch-small">Prefiero usar el marcador de mi equipo (tel:)</a></div>`

        events = {
            'click [data-action="dialer"]': function () { this.close(); this.trigger('dialer'); },
        }

        key() { return 'crmhub-agent-phone-' + (this.getUser().id || ''); }

        setup() {
            this.headerText = 'Llamar desde el CRM';
            this.buttonList = [{name: 'save', label: 'Llamar ahora', style: 'primary'}, {name: 'cancel', label: 'Cancelar'}];
            try { this.agent = localStorage.getItem(this.key()) || ''; } catch (e) { this.agent = ''; }
        }

        data() { return {phone: this.options.phone, agent: this.agent}; }

        actionSave() {
            const agent = (this.$el.find('[name="agent"]').val() || '').trim();
            if (!agent) { Espo.Ui.warning('Escribe tu teléfono o extensión.'); return; }
            try { localStorage.setItem(this.key(), agent); } catch (e) { /* privado */ }
            Espo.Ui.notify('Iniciando llamada…');
            Espo.Ajax.postRequest('CrmHub/voice/call', {leadId: this.options.leadId, agentPhone: agent})
                .then(() => { Espo.Ui.success('Te estamos llamando: contesta para conectar con el cliente'); this.trigger('done'); this.close(); })
                .catch(xhr => {
                    const reason = xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason');
                    Espo.Ui.error(reason || 'No se pudo iniciar la llamada');
                    if (xhr) { xhr.errorIsHandled = true; }
                });
        }
    };
});
