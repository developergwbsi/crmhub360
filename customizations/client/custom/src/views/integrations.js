define('custom:views/integrations', ['view'], function (Dep) {
    return class extends Dep {
        template = 'custom:integrations'

        state = null
        showToken = false

        setup() {
            this.getHelper().pageTitle.setTitle('Integraciones');
            this.load();
        }

        load() {
            Espo.Ajax.getRequest('CrmHub/integrations')
                .then(s => { this.state = s; this.reRender(); })
                .catch(xhr => { this.state = {error: true}; this.reRender(); if (xhr) { xhr.errorIsHandled = true; } });
        }

        data() {
            const s = this.state;
            if (!s || s.error) {
                return {loading: !s, error: !!(s && s.error)};
            }
            const base = 'https://' + s.host + '/hub';
            const tk = this.showToken ? s.token : '••••••••••••••••';
            const real = s.token;
            const rows = [
                {name: 'Facebook / Instagram Leads', icon: 'fab fa-facebook', method: 'GET + POST',
                 url: `${base}/facebook?token=${tk}`, copy: `${base}/facebook?token=${real}`,
                 note: 'URL de devolución de llamada del webhook de Meta. Token de verificación: el mismo token.'},
                {name: 'WhatsApp (Evolution API)', icon: 'fab fa-whatsapp', method: 'POST',
                 url: `${base}/evolution`, copy: `${base}/evolution`,
                 note: 'Evento MESSAGES_UPSERT. Agrega el encabezado apikey con el token.'},
                {name: 'Formulario web', icon: 'fas fa-globe', method: 'POST (JSON)',
                 url: `${base}/web?token=${tk}`, copy: `${base}/web?token=${real}`,
                 note: 'Cuerpo: {"name","phone","email","source"}.'},
            ];
            const jobs = {};
            (s.jobs || []).forEach(j => { jobs[j.status] = (jobs[j.status] || 0) + j.n; });
            return {
                loading: false, rows, s, showToken: this.showToken, th: s.thresholds,
                pct: Math.round(s.thresholds.reject_overdue_ratio * 100),
                active: s.status === 'active', jobsDone: jobs.done || 0, jobsError: jobs.error || 0,
                license: s.licenseUntil || 'Sin vencimiento',
            };
        }

        events = {
            'click [data-action="toggleToken"]': function () { this.showToken = !this.showToken; this.reRender(); },
            'click [data-action="copy"]': function (e) {
                const v = e.currentTarget.dataset.value;
                (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject())
                    .then(() => Espo.Ui.success('Copiado'))
                    .catch(() => Espo.Ui.warning('No se pudo copiar; selecciónalo manualmente'));
            },
            'click [data-action="saveThresholds"]': function () {
                const v = n => this.$el.find(`[name="${n}"]`).val();
                this.save({
                    approve_min_score: parseInt(v('approve_min_score'), 10),
                    reject_max_score: parseInt(v('reject_max_score'), 10),
                    reject_overdue_ratio: parseFloat(v('reject_overdue_pct')) / 100,
                });
            },
            'click [data-action="saveFacebook"]': function () {
                const t = (this.$el.find('[name="fb_page_token"]').val() || '').trim();
                if (!t) { Espo.Ui.warning('Ingresa el token de página'); return; }
                this.save({fb_page_token: t});
            },
        }

        save(body) {
            Espo.Ui.notify('Guardando…');
            Espo.Ajax.putRequest('CrmHub/integrations', body)
                .then(() => { Espo.Ui.success('Guardado'); this.load(); })
                .catch(xhr => {
                    const reason = xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason');
                    Espo.Ui.error(reason || 'No se pudo guardar');
                    if (xhr) { xhr.errorIsHandled = true; }
                });
        }
    };
});
