define('custom:views/assignment', ['view'], function (Dep) {
    return class extends Dep {
        template = 'custom:assignment'
        state = null

        setup() {
            this.getHelper().pageTitle.setTitle('Asignación de leads');
            this.load();
        }

        load() {
            Espo.Ajax.getRequest('CrmHub/assignment')
                .then(a => { this.state = a; this.reRender(); })
                .catch(xhr => { this.state = {error: true}; this.reRender(); if (xhr) { xhr.errorIsHandled = true; } });
        }

        data() {
            const a = this.state;
            if (!a || a.error) { return {loading: !a, error: !!(a && a.error)}; }
            return {
                loading: false, balanced: a.method === 'balanced', roundrobin: a.method === 'roundrobin', cap: a.cap,
                eligibleTotal: a.eligibleTotal, none: a.eligibleTotal === 0,
                users: a.users.map(u => ({...u, hasTeams: u.teams.length > 0})),
                campaigns: a.campaigns.map(c => ({...c, hasTeams: c.teams.length > 0, teamsText: c.teams.join(', ')})),
                hasCampaigns: a.campaigns.length > 0,
            };
        }

        events = {
            'change [data-action="toggleReceives"]': function (e) {
                const el = e.currentTarget;
                Espo.Ajax.putRequest('User/' + el.dataset.id, {receivesLeads: el.checked})
                    .then(() => { Espo.Ui.success(el.checked ? 'Recibirá leads automáticamente' : 'Ya no recibirá leads automáticos'); this.load(); })
                    .catch(xhr => { el.checked = !el.checked; if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('No se pudo cambiar'); });
            },
            'click [data-action="saveMethod"]': function () {
                const method = this.$el.find('[name="method"]:checked').val();
                const cap = parseInt(this.$el.find('[name="cap"]').val() || '0', 10) || 0;
                Espo.Ajax.putRequest('CrmHub/assignment', {method, cap})
                    .then(() => { Espo.Ui.success('Configuración guardada'); this.load(); })
                    .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('No se pudo guardar'); });
            },
        }
    };
});
