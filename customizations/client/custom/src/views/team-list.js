/** Equipos con indicadores: equipos, personas activas, personas sin equipo y campañas. */
define('custom:views/team-list', ['custom:views/kpi-list', 'views/list'], function (K, Dep) {
    return K.mix(Dep, function () {
        return Promise.all([Espo.Ajax.getRequest('Team', {maxSize: 200, select: 'name'}), Espo.Ajax.getRequest('User', {maxSize: 200, select: 'isActive,type,teamsIds'}), Espo.Ajax.getRequest('Campaign', {maxSize: 1, select: 'name'}).catch(() => ({total: 0}))]).then(([t, u, c]) => {
            const act = (u.list || []).filter(x => x.isActive && x.type !== 'system' && x.type !== 'api'), sinEq = act.filter(x => !(x.teamsIds || []).length).length;
            return [
                {ic: 'fa-people-group', label: 'Equipos', val: t.total},
                {ic: 'fa-users', label: 'Personas activas', val: act.length},
                {cls: sinEq ? 'warn' : 'ok', ic: 'fa-user-slash', label: 'Personas sin equipo', val: sinEq, sub: sinEq ? 'asígnales un equipo' : 'todas tienen equipo'},
                {ic: 'fa-bullhorn', label: 'Campañas', val: c.total, sub: 'los equipos reciben leads por campaña'},
            ];
        });
    });
});
