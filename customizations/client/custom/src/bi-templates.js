/**
 * Tableros gerenciales ya armados (plantillas) para «Reportes y tableros»: cada uno trae sus reportes (que quedan guardados como del usuario) y la distribución de tarjetas
 * (indicadores, barras, líneas, anillos y tablas). Después se ajustan: colores, títulos, quitar o añadir tarjetas. Sin endpoints propios.
 * Los campos son los estándar del CRM; si un rol no puede leer alguno, esa tarjeta muestra «No disponible».
 */
define('custom:bi-templates', [], function () {
    const R = (name, source, chart, o) => ({name, def: Object.assign({source, filters: [], groups: [], measures: [{fn: 'count'}], chart, limit: 20}, o || {})});
    const g = (field, bucket) => ({field, bucket});
    const f = (field, op, value) => ({field, op, value});
    const W = (rep, x, y, w, h, o) => Object.assign({type: 'report', rep, x, y, w, h}, o || {});
    const T = (text, size, y) => ({type: 'text', text, size, align: 'left', x: 0, y, w: 12, h: 1});

    const list = [
        {id: 'comercial', name: 'Gerencial comercial', icon: 'fas fa-chart-line', color: '#4f63e8', desc: 'Captación, embudo, origen de los leads, desempeño por asesor y servicios más pedidos.',
            reports: [
                R('Leads captados (30 días)', 'Lead', 'kpi', {filters: [f('createdAt', 'lastXDays', '30')]}),
                R('Leads que califican', 'Lead', 'kpi', {filters: [f('qualificationStatus', 'equals', 'Califica')]}),
                R('Cierres exitosos', 'Lead', 'kpi', {filters: [f('status', 'equals', 'Cierre Exitoso')]}),
                R('Leads sin asesor', 'Lead', 'kpi', {filters: [f('assignedUser', 'isNull', '')]}),
                R('Embudo por estado', 'Lead', 'bar', {groups: [g('status')]}),
                R('Leads por semana', 'Lead', 'area', {groups: [g('createdAt', 'week')], filters: [f('createdAt', 'lastXDays', '90')]}),
                R('Origen de los leads', 'Lead', 'doughnut', {groups: [g('source')]}),
                R('Leads por asesor', 'Lead', 'hbar', {groups: [g('assignedUser')]}),
                R('Servicio sugerido', 'Lead', 'table', {groups: [g('suggestedService')], limit: 10}),
            ],
            widgets: [T('Panel gerencial · Comercial', 22, 0), W(0, 0, 1, 3, 2, {color: '#4f63e8'}), W(1, 3, 1, 3, 2, {color: '#2fa36b'}), W(2, 6, 1, 3, 2, {color: '#8b5cf6'}), W(3, 9, 1, 3, 2, {color: '#f59e0b'}),
                W(4, 0, 3, 6, 5), W(5, 6, 3, 6, 5, {color: '#0ea5e9'}), W(6, 0, 8, 4, 5), W(7, 4, 8, 4, 5, {color: '#14b8a6'}), W(8, 8, 8, 4, 5)]},
        {id: 'actividad', name: 'Actividad del equipo', icon: 'fas fa-people-group', color: '#2fa36b', desc: 'Tareas, reuniones y llamadas: quién hace qué y cómo va el ritmo de trabajo.',
            reports: [
                R('Tareas pendientes', 'Task', 'kpi', {filters: [f('status', 'notIn', 'Completed,Canceled')]}),
                R('Tareas completadas', 'Task', 'kpi', {filters: [f('status', 'equals', 'Completed')]}),
                R('Reuniones del mes', 'Meeting', 'kpi', {filters: [f('dateStart', 'currentMonth', '')]}),
                R('Llamadas del mes', 'Call', 'kpi', {filters: [f('dateStart', 'currentMonth', '')]}),
                R('Tareas por estado', 'Task', 'doughnut', {groups: [g('status')]}),
                R('Tareas por asesor', 'Task', 'hbar', {groups: [g('assignedUser')]}),
                R('Reuniones por semana', 'Meeting', 'area', {groups: [g('dateStart', 'week')], filters: [f('dateStart', 'lastXDays', '90')]}),
                R('Llamadas por semana', 'Call', 'line', {groups: [g('dateStart', 'week')], filters: [f('dateStart', 'lastXDays', '90')]}),
                R('Llamadas por asesor y estado', 'Call', 'stacked', {groups: [g('assignedUser'), g('status')]}),
            ],
            widgets: [T('Panel gerencial · Actividad del equipo', 22, 0), W(0, 0, 1, 3, 2, {color: '#f59e0b'}), W(1, 3, 1, 3, 2, {color: '#2fa36b'}), W(2, 6, 1, 3, 2, {color: '#8b5cf6'}), W(3, 9, 1, 3, 2, {color: '#0ea5e9'}),
                W(4, 0, 3, 4, 5), W(5, 4, 3, 8, 5, {color: '#4f63e8'}), W(6, 0, 8, 6, 5, {color: '#8b5cf6'}), W(7, 6, 8, 6, 5, {color: '#0ea5e9'}), W(8, 0, 13, 12, 5)]},
        {id: 'cartera', name: 'Cartera y cobranza', icon: 'fas fa-wallet', color: '#ef5b5b', desc: 'Deuda total y en mora, por estado, por asesor y por calificación del lead.',
            reports: [
                R('Deuda total', 'Lead', 'kpi', {measures: [{fn: 'sum', field: 'totalDebt', label: 'Deuda total'}]}),
                R('Deuda en mora', 'Lead', 'kpi', {measures: [{fn: 'sum', field: 'overdueDebt', label: 'Deuda en mora'}]}),
                R('Deuda promedio por lead', 'Lead', 'kpi', {measures: [{fn: 'avg', field: 'totalDebt', label: 'Deuda promedio'}]}),
                R('Leads con mora', 'Lead', 'kpi', {filters: [f('overdueDebt', 'greaterThan', '0')]}),
                R('Deuda por estado', 'Lead', 'bar', {groups: [g('status')], measures: [{fn: 'sum', field: 'totalDebt', label: 'Deuda total'}]}),
                R('Mora por asesor', 'Lead', 'hbar', {groups: [g('assignedUser')], measures: [{fn: 'sum', field: 'overdueDebt', label: 'Deuda en mora'}]}),
                R('Leads por calificación', 'Lead', 'doughnut', {groups: [g('qualificationStatus')]}),
                R('Cartera por servicio', 'Lead', 'table', {groups: [g('suggestedService')], measures: [{fn: 'count'}, {fn: 'sum', field: 'totalDebt', label: 'Deuda total'}], limit: 10}),
            ],
            widgets: [T('Panel gerencial · Cartera y cobranza', 22, 0), W(0, 0, 1, 3, 2, {color: '#4f63e8'}), W(1, 3, 1, 3, 2, {color: '#ef5b5b'}), W(2, 6, 1, 3, 2, {color: '#8b5cf6'}), W(3, 9, 1, 3, 2, {color: '#f59e0b'}),
                W(4, 0, 3, 6, 5, {color: '#4f63e8'}), W(5, 6, 3, 6, 5, {color: '#ef5b5b'}), W(6, 0, 8, 4, 5), W(7, 4, 8, 8, 5)]},
        {id: 'oportunidades', name: 'Oportunidades y ventas', icon: 'fas fa-handshake', color: '#8b5cf6', desc: 'Valor del embudo de oportunidades, por etapa y por asesor, y lo ganado mes a mes.',
            reports: [
                R('Oportunidades abiertas', 'Opportunity', 'kpi', {filters: [f('stage', 'notIn', 'Closed Won,Closed Lost')]}),
                R('Valor del embudo', 'Opportunity', 'kpi', {filters: [f('stage', 'notIn', 'Closed Won,Closed Lost')], measures: [{fn: 'sum', field: 'amount', label: 'Valor del embudo'}]}),
                R('Ganadas', 'Opportunity', 'kpi', {filters: [f('stage', 'equals', 'Closed Won')]}),
                R('Valor ganado', 'Opportunity', 'kpi', {filters: [f('stage', 'equals', 'Closed Won')], measures: [{fn: 'sum', field: 'amount', label: 'Valor ganado'}]}),
                R('Valor por etapa', 'Opportunity', 'bar', {groups: [g('stage')], measures: [{fn: 'sum', field: 'amount', label: 'Valor'}]}),
                R('Oportunidades por etapa', 'Opportunity', 'doughnut', {groups: [g('stage')]}),
                R('Valor por asesor', 'Opportunity', 'hbar', {groups: [g('assignedUser')], measures: [{fn: 'sum', field: 'amount', label: 'Valor'}]}),
                R('Ganado por mes', 'Opportunity', 'area', {filters: [f('stage', 'equals', 'Closed Won')], groups: [g('closeDate', 'month')], measures: [{fn: 'sum', field: 'amount', label: 'Valor ganado'}]}),
            ],
            widgets: [T('Panel gerencial · Oportunidades y ventas', 22, 0), W(0, 0, 1, 3, 2, {color: '#4f63e8'}), W(1, 3, 1, 3, 2, {color: '#8b5cf6'}), W(2, 6, 1, 3, 2, {color: '#2fa36b'}), W(3, 9, 1, 3, 2, {color: '#14b8a6'}),
                W(4, 0, 3, 6, 5, {color: '#8b5cf6'}), W(5, 6, 3, 6, 5), W(6, 0, 8, 6, 5, {color: '#14b8a6'}), W(7, 6, 8, 6, 5, {color: '#2fa36b'})]},
    ];
    return {list};
});
