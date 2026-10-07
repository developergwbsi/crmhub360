define('custom:views/dashlets/crmhub-panel', ['views/dashlets/abstract/base'], function (Dep) {
    const STATUS_COLORS = {
        'Nuevo Lead': '#94a3b8', 'En Calificación': '#4f63e8', 'Calificado': '#8b5cf6',
        'En Enfriamiento/Contactado': '#f59e0b', 'Cierre Exitoso': '#2fa36b',
    };
    const nf = new Intl.NumberFormat('es-CO', {maximumFractionDigits: 1});

    const money = v => {
        const a = Math.abs(v);
        if (a >= 1e9) { return '$' + nf.format(v / 1e9) + ' MM'; }
        if (a >= 1e6) { return '$' + nf.format(v / 1e6) + ' M'; }
        if (a >= 1e3) { return '$' + nf.format(v / 1e3) + ' mil'; }
        return '$' + nf.format(v);
    };

    const bars = (list, colorFn) => {
        const max = Math.max(1, ...list.map(r => r.value));
        return list.map((r, i) => ({name: r.name, value: r.value, w: Math.max(2, Math.round(100 * r.value / max)),
            color: colorFn ? colorFn(r, i) : '#4f63e8'}));
    };
    const PALETTE = ['#4f63e8', '#8b5cf6', '#0ea5e9', '#2fa36b', '#f59e0b', '#ef5b5b', '#14b8a6', '#d4729b'];

    return class extends Dep {
        name = 'CrmHubPanel'
        template = 'custom:dashlets/crmhub-panel'
        state = null
        days = null

        setup() {
            this.days = parseInt(this.getOption('days') || '30', 10);
            this.load();
        }

        load() {
            this.state = null;
            Espo.Ajax.getRequest('CrmHub/metrics', {days: this.days})
                .then(m => { this.state = m; this.reRender(); })
                .catch(xhr => { this.state = {error: true}; this.reRender(); if (xhr) { xhr.errorIsHandled = true; } });
        }

        actionRefresh() { this.load(); }

        data() {
            const m = this.state;
            const periods = [7, 30, 90, 365].map(d => ({d, label: d === 365 ? '12 meses' : d + ' días', active: d === this.days}));
            if (!m || m.error) { return {loading: !m, error: !!(m && m.error), periods}; }
            const k = m.kpi;
            const kpis = [
                {label: 'Leads captados', value: nf.format(k.leads), sub: `${nf.format(k.nuevosHoy)} nuevos hoy`, icon: 'fas fa-user-plus', tone: 'primary'},
                {label: 'Sin asesor', value: nf.format(k.sinAsesor), sub: k.sinAsesor ? 'Requieren asignación' : 'Todo asignado', icon: 'fas fa-user-clock', tone: k.sinAsesor ? 'warn' : 'ok'},
                {label: 'Tasa de calificación', value: nf.format(k.tasaCalificacion) + '%', sub: `${nf.format(k.califican)} de ${nf.format(k.evaluados)} evaluados`, icon: 'fas fa-filter', tone: 'violet'},
                {label: 'Cierres exitosos', value: nf.format(k.cierres), sub: `${nf.format(k.tasaCierre)}% de los captados`, icon: 'fas fa-handshake', tone: 'ok'},
                {label: 'Deuda en cartera', value: money(k.deudaTotal), sub: 'Suma de los leads visibles', icon: 'fas fa-wallet', tone: 'info'},
                {label: 'Deuda en mora', value: money(k.deudaMora), sub: k.deudaTotal ? nf.format(100 * k.deudaMora / k.deudaTotal) + '% de la cartera' : '—', icon: 'fas fa-triangle-exclamation', tone: 'danger'},
            ];
            const maxT = Math.max(1, ...m.tendencia.map(t => t.value));
            const tendencia = m.tendencia.map(t => ({day: t.day, value: t.value, h: Math.max(3, Math.round(100 * t.value / maxT))}));
            const tot = m.tendencia.reduce((a, t) => a + t.value, 0);
            return {
                loading: false, error: false, periods, kpis,
                estado: bars(m.estado, r => STATUS_COLORS[r.name] || '#94a3b8'),
                servicio: bars(m.servicio, (r, i) => PALETTE[i % PALETTE.length]),
                origen: bars(m.origen, (r, i) => PALETTE[(i + 3) % PALETTE.length]),
                campanas: bars(m.campanas, (r, i) => PALETTE[(i + 1) % PALETTE.length]),
                asesores: m.asesores, hasAsesores: m.asesores.length > 0, multi: m.scope !== 'no',
                tendencia, trendTotal: tot, trendNote: m.bucketDays > 1 ? `Cada barra agrupa ${m.bucketDays} días` : 'Una barra por día',
                hasServicio: m.servicio.length > 0, hasCampanas: m.campanas.length > 0,
            };
        }

        events = {
            'click [data-action="period"]': function (e) {
                this.days = parseInt(e.currentTarget.dataset.d, 10);
                this.load();
            },
        }
    };
});
