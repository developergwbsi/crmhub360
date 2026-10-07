define('custom:views/login', ['views/login'], function (Dep) {
    return class extends Dep {
        template = 'custom:login'

        // Acceso de soporte en modo lectura: ?support=<código de un solo uso> inicia sesión solo, con el usuario de lectura
        afterRender() {
            super.afterRender();
            const code = new URLSearchParams(window.location.search).get('support');
            if (!code || this._chSupport) { return; }
            this._chSupport = true;
            history.replaceState(null, '', window.location.pathname + window.location.hash);
            Espo.Ajax.postRequest('CrmHubSupport/exchange', {code}).then(r => {
                this.$el.find('#field-userName').val(r.userName);
                this.$el.find('#field-password').val(r.password);
                this.$el.find('#btn-login').click();
            }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('El enlace de acceso venció. Genera uno nuevo desde el Centro de control.'); });
        }

        data() {
            return {
                ...super.data(),
                appName: this.getConfig().get('applicationName') || 'Crm Hub 360',
                year: new Date().getFullYear(),
            };
        }
    };
});
