define('custom:views/manual', ['view'], function (Dep) {
    return class extends Dep {
        template = 'custom:manual'

        data() {
            return {appName: this.getConfig().get('applicationName') || 'Crm Hub 360'};
        }

        events = {
            'click [data-action="goTo"]': function (e) {
                const el = this.$el.find('#ch-m-' + e.currentTarget.dataset.id)[0];
                if (el) {
                    el.scrollIntoView({behavior: 'smooth', block: 'start'});
                }
            },
        }

        setup() {
            this.getHelper().pageTitle.setTitle('Manual de usuario');
        }
    };
});
