define('custom:handlers/lead-process', ['action-handler', 'custom:doc-reader'], function (Dep, Reader) {
    return class extends Dep {
        actionDoc() { Reader.open(this.view.model); }

        // Vuelve a ejecutar los procesos configurados para este lead (p. ej. después de corregir su identificación)
        actionRun() {
            const m = this.view.model;
            if (!(m.get('identification') || '').trim()) { Espo.Ui.warning('Este lead no tiene identificación. Escríbela primero.'); return; }
            Espo.Ajax.postRequest('CrmHub/processRun', {leadId: m.id}).then(r => {
                Espo.Ui.success((r.runs || []).length ? 'Procesos en ejecución: el resultado aparece en unos segundos' : 'No hay procesos activos para ejecutar');
                setTimeout(() => m.fetch(), 6000);
            }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('No se pudieron ejecutar los procesos'); });
        }
    };
});
