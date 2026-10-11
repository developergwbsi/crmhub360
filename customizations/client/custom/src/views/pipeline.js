/**
 * «Estados del pipeline»: qué estado de Lead es nuevo, en revisión y calificado, y cuáles cuentan como cerrados.
 * También la identificación del cliente: qué se usa como identificación temporal (celular o correo) y si es obligatoria para avanzar el lead.
 * Endpoints: GET/PUT CrmHub/pipeline (guardar es solo admin; el motivo del error viene en la cabecera X-Status-Reason). Plantilla: custom:pipeline.
 */
define('custom:views/pipeline', ['view'], function (Dep) {
    return class extends Dep {
        template = 'custom:pipeline'
        state = null

        setup() {
            this.getHelper().pageTitle.setTitle('Estados del pipeline');
            this.load();
        }

        load() {
            Espo.Ajax.getRequest('CrmHub/pipeline')
                .then(s => { this.state = s; this.reRender(); })
                .catch(xhr => { this.state = {error: true}; this.reRender(); if (xhr) { xhr.errorIsHandled = true; } });
        }

        data() {
            const s = this.state;
            if (!s || s.error) { return {loading: !s, error: !!(s && s.error)}; }
            const style = this.getMetadata().get('entityDefs.Lead.fields.status.style') || {};
            const label = v => this.getLanguage().translateOption(v, 'status', 'Lead');
            const sel = cur => s.options.map(o => ({value: o, label: label(o), selected: o === cur}));
            return {
                loading: false,
                stages: s.options.map((o, i) => ({n: i + 1, label: label(o), tone: style[o] || 'default',
                    hidden: s.ignored.includes(o), closed: s.closed.includes(o)})),
                optNew: sel(s.new), optReview: sel(s.review), optQualified: sel(s.qualified),
                idTempOpts: [['phone', 'El celular'], ['email', 'El correo'], ['off', 'Ninguna (dejarla vacía)']].map(([v, l]) => ({value: v, label: l, selected: v === s.idTemp})), idRequired: s.idRequired,
                closedList: s.options.map(o => ({value: o, label: label(o), checked: s.closed.includes(o)})),
            };
        }

        events = {
            'click [data-action="save"]': function () {
                const v = n => this.$el.find(`[name="${n}"]`).val();
                const closed = this.$el.find('[name="closed"]:checked').map((i, e) => e.value).get();
                Espo.Ajax.putRequest('CrmHub/pipeline', {new: v('new'), review: v('review'), qualified: v('qualified'), closed, idTemp: v('idTemp'), idRequired: this.$el.find('[name="idRequired"]').is(':checked')})
                    .then(() => { Espo.Ui.success('Guardado'); this.load(); })
                    .catch(xhr => {
                        const reason = xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason');
                        Espo.Ui.error(reason || 'No se pudo guardar');
                        if (xhr) { xhr.errorIsHandled = true; }
                    });
            },
        }
    };
});
