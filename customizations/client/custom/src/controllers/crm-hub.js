/**
 * Controlador del módulo Crm Hub 360 (rutas #CrmHub/...): cada acción abre la vista custom:views/* correspondiente.
 * Acción por defecto: manual. Las acciones son: manual, mensajes, organigrama, difusion, simulador, conocimiento, plantillas, procesos, copiasLeads, agente, asignacion, pipeline e integrations.
 * Los endpoints los llaman las propias vistas, no el controlador.
 */
define('custom:controllers/crm-hub', ['controller'], function (Dep) {
    return class extends Dep {
        defaultAction = 'manual'

        actionManual() {
            this.main('custom:views/manual', {});
        }

        actionReportes() {
            this.main('custom:views/bi', {});
        }

        actionConsultasWeb() {
            this.main('custom:views/web-sources', {});
        }

        actionGrabaciones() {
            this.main('custom:views/recordings', {});
        }

        actionFormularios() {
            this.main('custom:views/iforms', {});
        }

        actionLeadSet() {
            this.main('custom:views/lead-set', {});
        }

        actionOrganigrama() {
            this.main('custom:views/orgchart', {});
        }

        actionMensajes(options) {
            this.main('custom:views/messages', {leadId: options && options.leadId, channel: options && options.channel});
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
