define('custom:handlers/reassign', ['action-handler'], function (Dep) {
    return class extends Dep {
        // Detalle (menú de acciones) y lista (acción masiva) comparten esta acción.
        actionReassign(data) {
            const view = this.view;
            let ids, entityType;
            if (view.model) {
                ids = [view.model.id];
                entityType = view.model.entityType;
            } else {
                const p = (data && data.params) || view.getMassActionSelectionPostData();
                ids = p.ids;
                entityType = view.scope || (view.collection && view.collection.entityType);
                if (!ids || !ids.length) {
                    Espo.Ui.warning('Selecciona los registros uno a uno (no se admite «todos los resultados»).');
                    return;
                }
            }
            view.createView('reassign', 'custom:views/modals/reassign', {entityType, ids}, v => {
                v.render();
                v.once('done', () => {
                    if (view.model) { view.model.fetch(); } else if (view.collection) { view.collection.fetch(); }
                });
            });
        }

        canReassign() {
            return this.hasPermission();
        }

        hasPermission() {
            const u = this.view.getUser();
            return u.isAdmin() || (this.view.getAcl().getPermissionLevel('assignmentPermission') || 'no') !== 'no';
        }

        initReassign() {
            if (!this.hasPermission()) {
                this.view.removeMassAction('reassign');
            }
        }
    };
});
