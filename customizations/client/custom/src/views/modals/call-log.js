define('custom:views/modals/call-log', ['views/modal'], function (Dep) {
    return class extends Dep {
        templateContent = `
            <p class="ch-muted">Llamando a <b>{{phone}}</b>. Cuando termines, registra cómo fue:</p>
            <div class="form-group"><label>Resultado</label>
                <select name="result" class="form-control">
                    <option>Contactado</option><option>No contesta</option><option>Buzón de voz</option>
                    <option>Número equivocado</option><option>Reagendar</option>
                </select></div>
            <div class="form-group"><label>Duración (minutos, opcional)</label>
                <input type="number" name="minutes" class="form-control" min="0" max="600" value="0" style="max-width:140px"></div>
            <div class="form-group"><label>Notas</label>
                <textarea name="note" class="form-control" rows="3" maxlength="1000" placeholder="Qué se habló, acuerdos, próximo paso…"></textarea></div>`

        setup() {
            this.headerText = 'Registrar llamada';
            this.buttonList = [{name: 'save', label: 'Guardar', style: 'primary'}, {name: 'cancel', label: 'Cancelar'}];
        }

        data() { return {phone: this.options.phone}; }

        actionSave() {
            const v = n => this.$el.find(`[name="${n}"]`).val();
            Espo.Ajax.postRequest('CrmHub/call', {leadId: this.options.leadId, result: v('result'), minutes: parseInt(v('minutes') || '0', 10), note: v('note')})
                .then(() => { Espo.Ui.success('Llamada registrada'); this.trigger('done'); this.close(); })
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('No se pudo registrar la llamada'); });
        }
    };
});
