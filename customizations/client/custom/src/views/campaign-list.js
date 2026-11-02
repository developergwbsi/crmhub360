/** Campañas con indicadores: total, activas, en planificación y completadas. */
define('custom:views/campaign-list', ['custom:views/kpi-list', 'views/list'], function (K, Dep) {
    return K.mix(Dep, function () {
        return Espo.Ajax.getRequest('Campaign', {maxSize: 200, select: 'status'}).then(r => {
            const l = r.list || [], n = s => l.filter(x => x.status === s).length;
            return [
                {ic: 'fa-bullhorn', label: 'Campañas', val: r.total},
                {cls: n('Active') ? 'ok' : '', ic: 'fa-play', label: 'Activas', val: n('Active'), sub: 'reciben leads ahora'},
                {ic: 'fa-pen-ruler', label: 'En planificación', val: n('Planning')},
                {ic: 'fa-flag-checkered', label: 'Completadas', val: n('Complete')},
            ];
        });
    });
});
