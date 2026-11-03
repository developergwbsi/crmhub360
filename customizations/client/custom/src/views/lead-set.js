/**
 * Cifra del tablero (#CrmHub/leadSet): no tiene pantalla propia. Deja el filtro por ids en la búsqueda guardada de la lista
 * y abre la lista normal del módulo (la misma de la barra lateral); crmhub-boot.js pinta encima el aviso con «Quitar filtro».
 * Los ids vienen del tablero por sessionStorage ('chLeadSet' = {title, ids, scope, assign}).
 */
define('custom:views/lead-set', ['view', 'custom:ui'], function (Dep, ChUi) {
    const KEY = 'chLeadSet';
    const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };

    const View = class extends Dep {
        templateContent = '<div class="ch-muted" style="padding:24px">Abriendo la lista…</div>'

        setup() {
            const s = read();
            if (!s || !s.ids || !s.ids.length) { this.getRouter().navigate('#Home', {trigger: true, replace: true}); return; }
            const scope = s.scope || 'Lead';
            try {
                localStorage.setItem('espo-listSearch-' + scope, '__JSON__:' + JSON.stringify({advanced: {id: {type: 'in', attribute: 'id', value: s.ids, data: {type: 'anyOf', valueList: s.ids}}}, bool: {}, presetName: null, primary: null}));
                sessionStorage.setItem('chSetBar', JSON.stringify({title: s.title, ids: s.ids, scope, assign: !!s.assign}));
            } catch (e) { /* sin storage */ }
            this.getRouter().navigate('#' + scope, {trigger: true, replace: true});
        }
    };

    // Reparto automático de los leads sin asesor del filtro activo
    View.autoAssign = function (set) {
        const n = set.ids.length;
        ChUi.confirm({title: 'Repartir automáticamente', text: `Se asignarán ${n > 300 ? 'los primeros 300 de ' + n : n} lead(s) sin asesor entre los asesores disponibles, con el mismo balanceo del reparto automático.`, ok: 'Repartir'}).then(y => {
            if (!y) { return; }
            Espo.Ajax.postRequest('CrmHub/autoAssign', {ids: set.ids}).then(r => {
                Espo.Ui.success(`Asignados ${r.assigned}` + (r.skipped ? ` · sin cambio ${r.skipped}` : ''));
                location.reload();
            }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('No se pudo repartir. ¿Tienes permiso de asignación?'); });
        });
    };
    return View;
});
