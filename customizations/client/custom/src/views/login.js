define('custom:views/login', ['views/login'], function (Dep) {
    return class extends Dep {
        template = 'custom:login'

        data() {
            return {
                ...super.data(),
                appName: this.getConfig().get('applicationName') || 'Crm Hub 360',
                year: new Date().getFullYear(),
            };
        }
    };
});
