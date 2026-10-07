define('custom:views/orgchart', ['view'], function (Dep) {
    const COLORS = ['#4f63e8', '#8b5cf6', '#0ea5e9', '#2fa36b', '#f59e0b', '#ef5b5b', '#14b8a6', '#d4729b'];
    const decorate = u => {
        let h = 0;
        String(u.id).split('').forEach(c => { h = (h * 31 + c.charCodeAt(0)) >>> 0; });
        const parts = String(u.name || '?').trim().split(/\s+/);
        return {...u, color: COLORS[h % COLORS.length], initials: ((parts[0] || '')[0] + ((parts[1] || '')[0] || '')).toUpperCase(),
            rolesText: (u.roles || []).join(' · ')};
    };

    return class extends Dep {
        template = 'custom:orgchart'
        state = null

        setup() {
            this.getHelper().pageTitle.setTitle('Organigrama');
            Espo.Ajax.getRequest('CrmHub/orgchart')
                .then(s => { this.state = s; this.reRender(); })
                .catch(xhr => { this.state = {error: true}; this.reRender(); if (xhr) { xhr.errorIsHandled = true; } });
        }

        data() {
            const s = this.state;
            if (!s || s.error) { return {loading: !s, error: !!(s && s.error)}; }
            return {
                loading: false, canManage: s.canManage,
                managers: s.managers.map(decorate), unassigned: s.unassigned.map(decorate),
                teams: s.teams.map(t => ({...t, directors: t.directors.map(decorate), members: t.members.map(decorate),
                    count: t.directors.length + t.members.length})),
            };
        }
    };
});
