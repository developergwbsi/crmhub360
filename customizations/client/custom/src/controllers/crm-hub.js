define('custom:controllers/crm-hub', ['controller'], function (Dep) {
    return class extends Dep {
        defaultAction = 'manual'

        actionManual() {
            this.main('custom:views/manual', {});
        }

        actionOrganigrama() {
            this.main('custom:views/orgchart', {});
        }

        actionIntegrations() {
            if (!this.getUser().isAdmin()) {
                this.error403();
                return;
            }
            this.main('custom:views/integrations', {});
        }
    };
});
