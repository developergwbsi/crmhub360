define('custom:views/manual', ['view'], function (Dep) {
    return class extends Dep {
        template = 'custom:manual'

        who = null
        showAll = false

        data() {
            const w = this.who;
            return {
                appName: this.getConfig().get('applicationName') || 'Crm Hub 360',
                roleLabel: w ? this.roleLabel() : '…', canToggle: !!w && !this.keys().includes('admin'), showAll: this.showAll,
            };
        }

        // Roles de manual del usuario: admin / gerente / director / comercial
        keys() {
            const w = this.who || {roles: []}, k = [];
            if (w.isAdmin) { k.push('admin'); }
            if (w.roles.includes('Gerente General')) { k.push('gerente'); }
            if (w.roles.includes('Director de Equipo')) { k.push('director'); }
            if (w.roles.includes('Comercial')) { k.push('comercial'); }
            return k.length ? k : ['comercial'];
        }

        roleLabel() {
            const names = {admin: 'Administrador', gerente: 'Gerente General', director: 'Director de Equipo', comercial: 'Comercial'};
            return this.keys().map(k => names[k]).join(' · ');
        }

        applyRole() {
            const keys = this.keys(), all = this.showAll || keys.includes('admin');
            this.$el.find('[data-roles]').each((i, el) => {
                const roles = (el.getAttribute('data-roles') || '').split(/\s+/).filter(Boolean);
                el.style.display = all || roles.some(r => keys.includes(r)) ? '' : 'none';
            });
        }

        afterRender() {
            super.afterRender();
            if (this.who) { this.applyRole(); }
        }

        events = {
            'click [data-action="toggleAll"]': function () { this.showAll = !this.showAll; this.reRender(); },
            'click [data-action="goTo"]': function (e) {
                const el = this.$el.find('#ch-m-' + e.currentTarget.dataset.id)[0];
                if (el) {
                    el.scrollIntoView({behavior: 'smooth', block: 'start'});
                }
            },
        }

        setup() {
            this.getHelper().pageTitle.setTitle('Manual de usuario');
            Espo.Ajax.getRequest('CrmHub/myroles').then(w => { this.who = w; this.reRender(); }).catch(xhr => { this.who = {isAdmin: false, roles: []}; this.reRender(); if (xhr) { xhr.errorIsHandled = true; } });
        }
    };
});
