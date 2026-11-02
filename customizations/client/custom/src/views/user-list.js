/** Usuarios con indicadores: activos, administradores, regulares y sin equipo. */
define('custom:views/user-list', ['custom:views/kpi-list', 'views/user/list'], function (K, Dep) {
    return K.mix(Dep, function () {
        return Espo.Ajax.getRequest('User', {maxSize: 200, select: 'userName,isActive,type,teamsIds'}).then(r => {
            const l = (r.list || []).filter(u => u.type !== 'system' && u.type !== 'api'), act = l.filter(u => u.isActive);
            const sinEq = act.filter(u => !(u.teamsIds || []).length).length;
            return [
                {ic: 'fa-users', label: 'Usuarios activos', val: act.length, sub: `${l.length} en total`},
                {cls: 'ok', ic: 'fa-user-shield', label: 'Administradores', val: act.filter(u => u.type === 'admin').length},
                {ic: 'fa-user-group', label: 'Usuarios regulares', val: act.filter(u => u.type === 'regular').length},
                {cls: sinEq ? 'warn' : 'ok', ic: 'fa-people-group', label: 'Sin equipo', val: sinEq, sub: sinEq ? 'no aparecen en el organigrama' : 'todos tienen equipo'},
            ];
        });
    });
});
