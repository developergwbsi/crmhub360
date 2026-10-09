define('custom:controllers/crm-hub', ['controller'], function (Dep) {
    return class extends Dep {
        defaultAction = 'manual'

        actionManual() {
            this.main('custom:views/manual', {});
        }

        actionOrganigrama() {
            this.main('custom:views/orgchart', {});
        }

        actionDifusion() {
            this.main('custom:views/broadcasts', {});
        }

        actionSimulador() {
            this.main('custom:views/simulator', {});
        }

        actionConocimiento() {
            this.main('custom:views/knowledge', {});
        }

        actionPlantillas() {
            this.main('custom:views/my-templates', {});
        }

        actionProcesos() {
            if (!this.getUser().isAdmin()) { this.error403(); return; }
            this.main('custom:views/processes', {});
        }

        actionCopiasLeads() {
            if (!this.getUser().isAdmin()) { this.error403(); return; }
            this.main('custom:views/lead-backup', {});
        }

        actionAgente() {
            if (!this.getUser().isAdmin()) { this.error403(); return; }
            this.main('custom:views/agent', {});
        }

        actionAsignacion() {
            if (!this.getUser().isAdmin()) { this.error403(); return; }
            this.main('custom:views/assignment', {});
        }

        actionPipeline() {
            if (!this.getUser().isAdmin()) { this.error403(); return; }
            this.main('custom:views/pipeline', {});
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
