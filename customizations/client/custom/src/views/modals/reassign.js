define('custom:views/modals/reassign', ['views/modal'], function (Dep) {
    return class extends Dep {
        templateContent = `
            <div class="ch-reassign">
                <p class="ch-muted">{{count}} {{#if one}}registro seleccionado{{else}}registros seleccionados{{/if}}.</p>
                <div class="form-group">
                    <label>Asignar a</label>
                    <select name="userId" class="form-control">
                        <option value="auto">⚖ Automático (el más libre)</option>
                        {{#each users}}<option value="{{id}}">{{name}} · {{openLeads}} abiertos{{#unless receivesLeads}} · no recibe automáticos{{/unless}}</option>{{/each}}
                    </select>
                </div>
                <div class="form-group">
                    <label>Motivo (opcional, queda en el historial)</label>
                    <textarea name="note" class="form-control" rows="3" maxlength="500"></textarea>
                </div>
            </div>`

        setup() {
            this.headerText = 'Reasignar';
            this.buttonList = [
                {name: 'save', label: 'Reasignar', style: 'primary'},
                {name: 'cancel', label: 'Cancelar'},
            ];
            this.users = [];
            Espo.Ajax.getRequest('CrmHub/assignees').then(u => { this.users = u; this.reRender(); });
        }

        data() {
            return {users: this.users, count: this.options.ids.length, one: this.options.ids.length === 1};
        }

        actionSave() {
            const userId = this.$el.find('[name="userId"]').val();
            const note = this.$el.find('[name="note"]').val();
            Espo.Ui.notify('Reasignando…');
            Espo.Ajax.postRequest('CrmHub/reassign', {
                entityType: this.options.entityType, ids: this.options.ids, userId, note,
            }).then(r => {
                const skipped = (r.skipped || []).length;
                Espo.Ui.success('Reasignados: ' + r.done + (skipped ? ' · sin permiso: ' + skipped : ''));
                this.trigger('done');
                this.close();
            }).catch(xhr => {
                const reason = xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason');
                Espo.Ui.error(reason || 'No se pudo reasignar');
                if (xhr) { xhr.errorIsHandled = true; }
            });
        }
    };
});
