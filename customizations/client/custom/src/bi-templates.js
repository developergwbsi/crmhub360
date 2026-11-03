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
        {id: 'comercial', ideal: 'vendes con un equipo de asesores y quieres ver captación, embudo y cierres.', name: 'Gerencial comercial', icon: 'fas fa-chart-line', color: '#4f63e8', desc: 'Captación, embudo, origen de los leads, desempeño por asesor y servicios más pedidos.',
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
        {id: 'actividad', ideal: 'tu equipo vive de tareas, reuniones y llamadas y quieres medir el ritmo.', name: 'Actividad del equipo', icon: 'fas fa-people-group', color: '#2fa36b', desc: 'Tareas, reuniones y llamadas: quién hace qué y cómo va el ritmo de trabajo.',
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
        {id: 'cartera', ideal: 'haces cobranza o recuperación de cartera y sigues deuda y mora.', name: 'Cartera y cobranza', icon: 'fas fa-wallet', color: '#ef5b5b', desc: 'Deuda total y en mora, por estado, por asesor y por calificación del lead.',
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
        {id: 'oportunidades', ideal: 'manejas oportunidades con montos y etapas de venta.', name: 'Oportunidades y ventas', icon: 'fas fa-handshake', color: '#8b5cf6', desc: 'Valor del embudo de oportunidades, por etapa y por asesor, y lo ganado mes a mes.',
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

        {id: 'captacion', ideal: 'atraes clientes con campañas, formularios web, redes o WhatsApp y quieres saber qué canal rinde.', name: 'Captación y marketing', icon: 'fas fa-bullhorn', color: '#f59e0b', desc: 'De dónde llegan los leads: origen, campañas, formularios, canal preferido y ciudades.',
            reports: [
                R('Leads de hoy', 'Lead', 'kpi', {filters: [f('createdAt', 'today', '')]}),
                R('Leads últimos 7 días', 'Lead', 'kpi', {filters: [f('createdAt', 'lastSevenDays', '')]}),
                R('Leads del mes', 'Lead', 'kpi', {filters: [f('createdAt', 'currentMonth', '')]}),
                R('Leads sin asesor', 'Lead', 'kpi', {filters: [f('assignedUser', 'isNull', '')]}),
                R('Leads por origen', 'Lead', 'doughnut', {groups: [g('source')]}),
                R('Leads por campaña', 'Lead', 'hbar', {groups: [g('campaign')]}),
                R('Leads por formulario', 'Lead', 'table', {groups: [g('originForm')], limit: 10}),
                R('Captación por semana', 'Lead', 'area', {groups: [g('createdAt', 'week')], filters: [f('createdAt', 'lastXDays', '90')]}),
                R('Canal preferido', 'Lead', 'doughnut', {groups: [g('preferredChannel')]}),
                R('Leads por ciudad', 'Lead', 'table', {groups: [g('addressCity')], limit: 10}),
            ],
            widgets: [T('Panel · Captación y marketing', 22, 0), W(0, 0, 1, 3, 2, {color: '#f59e0b'}), W(1, 3, 1, 3, 2, {color: '#4f63e8'}), W(2, 6, 1, 3, 2, {color: '#2fa36b'}), W(3, 9, 1, 3, 2, {color: '#ef5b5b'}),
                W(7, 0, 3, 8, 5, {color: '#f59e0b'}), W(4, 8, 3, 4, 5), W(5, 0, 8, 4, 5, {color: '#14b8a6'}), W(8, 4, 8, 4, 5), W(6, 8, 8, 4, 5), W(9, 0, 13, 12, 4)]},
        {id: 'embudo', ideal: 'sigues cada lead hasta el cierre y quieres medir cuánto se convierte y dónde se pierde.', name: 'Embudo y conversión', icon: 'fas fa-filter', color: '#0ea5e9', desc: 'Leads por estado y calificación, convertidos, cierres por mes y estados por asesor.',
            reports: [
                R('Leads totales', 'Lead', 'kpi'),
                R('Leads que califican', 'Lead', 'kpi', {filters: [f('qualificationStatus', 'equals', 'Califica')]}),
                R('Convertidos', 'Lead', 'kpi', {filters: [f('convertedAt', 'isNotNull', '')]}),
                R('Cierres exitosos', 'Lead', 'kpi', {filters: [f('status', 'equals', 'Cierre Exitoso')]}),
                R('Embudo por estado', 'Lead', 'bar', {groups: [g('status')]}),
                R('Calificación de los leads', 'Lead', 'doughnut', {groups: [g('qualificationStatus')]}),
                R('Cierres por mes', 'Lead', 'area', {filters: [f('status', 'equals', 'Cierre Exitoso')], groups: [g('createdAt', 'month')]}),
                R('Estado por asesor', 'Lead', 'stacked', {groups: [g('assignedUser'), g('status')]}),
                R('Convertidos por semana', 'Lead', 'line', {filters: [f('convertedAt', 'isNotNull', ''), f('convertedAt', 'lastXDays', '90')], groups: [g('convertedAt', 'week')]}),
            ],
            widgets: [T('Panel · Embudo y conversión', 22, 0), W(0, 0, 1, 3, 2, {color: '#4f63e8'}), W(1, 3, 1, 3, 2, {color: '#2fa36b'}), W(2, 6, 1, 3, 2, {color: '#0ea5e9'}), W(3, 9, 1, 3, 2, {color: '#8b5cf6'}),
                W(4, 0, 3, 6, 5, {color: '#0ea5e9'}), W(5, 6, 3, 6, 5), W(6, 0, 8, 6, 5, {color: '#2fa36b'}), W(8, 6, 8, 6, 5, {color: '#8b5cf6'}), W(7, 0, 13, 12, 5)]},
        {id: 'reuniones', ideal: 'agendas demos, citas o visitas (también por videollamada) y quieres ver la agenda del equipo.', name: 'Reuniones y videollamadas', icon: 'fas fa-calendar-check', color: '#8b5cf6', desc: 'Reuniones de hoy, del mes y próximas, con videollamada, por estado, asesor y semana.',
            reports: [
                R('Reuniones de hoy', 'Meeting', 'kpi', {filters: [f('dateStart', 'today', '')]}),
                R('Próximos 7 días', 'Meeting', 'kpi', {filters: [f('dateStart', 'nextXDays', '7')]}),
                R('Reuniones del mes', 'Meeting', 'kpi', {filters: [f('dateStart', 'currentMonth', '')]}),
                R('Con videollamada (mes)', 'Meeting', 'kpi', {filters: [f('dateStart', 'currentMonth', ''), f('videoCall', 'isTrue', '')]}),
                R('Reuniones por estado', 'Meeting', 'doughnut', {groups: [g('status')]}),
                R('Reuniones por asesor', 'Meeting', 'hbar', {groups: [g('assignedUser')]}),
                R('Reuniones por semana', 'Meeting', 'area', {groups: [g('dateStart', 'week')], filters: [f('dateStart', 'lastXDays', '90')]}),
            ],
            widgets: [T('Panel · Reuniones y videollamadas', 22, 0), W(0, 0, 1, 3, 2, {color: '#8b5cf6'}), W(1, 3, 1, 3, 2, {color: '#0ea5e9'}), W(2, 6, 1, 3, 2, {color: '#4f63e8'}), W(3, 9, 1, 3, 2, {color: '#14b8a6'}),
                W(6, 0, 3, 8, 5, {color: '#8b5cf6'}), W(4, 8, 3, 4, 5), W(5, 0, 8, 12, 5, {color: '#4f63e8'})]},
        {id: 'llamadas', ideal: 'trabajas por teléfono (ventas, cobranza o servicio) y quieres medir el ritmo de llamadas.', name: 'Llamadas y contact center', icon: 'fas fa-phone-volume', color: '#14b8a6', desc: 'Llamadas de hoy y del mes, entrantes y salientes, por estado, asesor y semana.',
            reports: [
                R('Llamadas de hoy', 'Call', 'kpi', {filters: [f('dateStart', 'today', '')]}),
                R('Llamadas del mes', 'Call', 'kpi', {filters: [f('dateStart', 'currentMonth', '')]}),
                R('Entrantes del mes', 'Call', 'kpi', {filters: [f('dateStart', 'currentMonth', ''), f('direction', 'equals', 'Inbound')]}),
                R('Salientes del mes', 'Call', 'kpi', {filters: [f('dateStart', 'currentMonth', ''), f('direction', 'equals', 'Outbound')]}),
                R('Llamadas por estado', 'Call', 'doughnut', {groups: [g('status')]}),
                R('Llamadas por asesor', 'Call', 'hbar', {groups: [g('assignedUser')]}),
                R('Llamadas por semana', 'Call', 'line', {groups: [g('dateStart', 'week')], filters: [f('dateStart', 'lastXDays', '90')]}),
                R('Asesor y estado de la llamada', 'Call', 'stacked', {groups: [g('assignedUser'), g('status')]}),
                R('Entrantes y salientes', 'Call', 'doughnut', {groups: [g('direction')]}),
            ],
            widgets: [T('Panel · Llamadas y contact center', 22, 0), W(0, 0, 1, 3, 2, {color: '#14b8a6'}), W(1, 3, 1, 3, 2, {color: '#4f63e8'}), W(2, 6, 1, 3, 2, {color: '#2fa36b'}), W(3, 9, 1, 3, 2, {color: '#f59e0b'}),
                W(6, 0, 3, 8, 5, {color: '#14b8a6'}), W(8, 8, 3, 4, 5), W(5, 0, 8, 6, 5, {color: '#4f63e8'}), W(4, 6, 8, 6, 5), W(7, 0, 13, 12, 5)]},
        {id: 'clientes', ideal: 'vendes a empresas y quieres conocer tu base de clientes: cuentas, contactos, sectores y ciudades.', name: 'Clientes: cuentas y contactos', icon: 'fas fa-building', color: '#2fa36b', desc: 'Cuántas cuentas y contactos tienes, nuevos del mes, por tipo, sector, ciudad y asesor.',
            reports: [
                R('Cuentas', 'Account', 'kpi'),
                R('Contactos', 'Contact', 'kpi'),
                R('Cuentas nuevas del mes', 'Account', 'kpi', {filters: [f('createdAt', 'currentMonth', '')]}),
                R('Contactos nuevos del mes', 'Contact', 'kpi', {filters: [f('createdAt', 'currentMonth', '')]}),
                R('Cuentas por tipo', 'Account', 'doughnut', {groups: [g('type')]}),
                R('Cuentas por sector', 'Account', 'hbar', {groups: [g('industry')]}),
                R('Cuentas por ciudad', 'Account', 'table', {groups: [g('billingAddressCity')], limit: 10}),
                R('Contactos nuevos por mes', 'Contact', 'area', {groups: [g('createdAt', 'month')], filters: [f('createdAt', 'lastXDays', '365')]}),
                R('Contactos por asesor', 'Contact', 'hbar', {groups: [g('assignedUser')]}),
            ],
            widgets: [T('Panel · Clientes: cuentas y contactos', 22, 0), W(0, 0, 1, 3, 2, {color: '#2fa36b'}), W(1, 3, 1, 3, 2, {color: '#4f63e8'}), W(2, 6, 1, 3, 2, {color: '#14b8a6'}), W(3, 9, 1, 3, 2, {color: '#8b5cf6'}),
                W(7, 0, 3, 8, 5, {color: '#2fa36b'}), W(4, 8, 3, 4, 5), W(5, 0, 8, 4, 5, {color: '#14b8a6'}), W(6, 4, 8, 4, 5), W(8, 8, 8, 4, 5, {color: '#4f63e8'})]},
        {id: 'asesores', ideal: 'quieres comparar a tu equipo: quién capta, cierra, llama, agenda y cuánto vale lo que maneja.', name: 'Desempeño por asesor', icon: 'fas fa-ranking-star', color: '#ef5b5b', desc: 'Leads, cierres, tareas, reuniones, llamadas y valor de oportunidades de cada asesor, lado a lado.',
            reports: [
                R('Leads por asesor', 'Lead', 'hbar', {groups: [g('assignedUser')]}),
                R('Cierres por asesor', 'Lead', 'hbar', {filters: [f('status', 'equals', 'Cierre Exitoso')], groups: [g('assignedUser')]}),
                R('Tareas pendientes por asesor', 'Task', 'hbar', {filters: [f('status', 'notIn', 'Completed,Canceled')], groups: [g('assignedUser')]}),
                R('Reuniones del mes por asesor', 'Meeting', 'hbar', {filters: [f('dateStart', 'currentMonth', '')], groups: [g('assignedUser')]}),
                R('Llamadas del mes por asesor', 'Call', 'hbar', {filters: [f('dateStart', 'currentMonth', '')], groups: [g('assignedUser')]}),
                R('Valor de oportunidades por asesor', 'Opportunity', 'hbar', {groups: [g('assignedUser')], measures: [{fn: 'sum', field: 'amount', label: 'Valor'}]}),
                R('Leads sin asesor', 'Lead', 'kpi', {filters: [f('assignedUser', 'isNull', '')]}),
                R('Tareas vencidas', 'Task', 'kpi', {filters: [f('dateEnd', 'past', ''), f('status', 'notIn', 'Completed,Canceled')]}),
            ],
            widgets: [T('Panel · Desempeño por asesor', 22, 0), W(6, 0, 1, 6, 2, {color: '#f59e0b'}), W(7, 6, 1, 6, 2, {color: '#ef5b5b'}),
                W(0, 0, 3, 6, 5, {color: '#4f63e8'}), W(1, 6, 3, 6, 5, {color: '#2fa36b'}), W(2, 0, 8, 4, 5, {color: '#f59e0b'}), W(3, 4, 8, 4, 5, {color: '#8b5cf6'}), W(4, 8, 8, 4, 5, {color: '#14b8a6'}), W(5, 0, 13, 12, 5, {color: '#ef5b5b'})]},
    ];
    // Crea en el CRM los reportes de la plantilla y el tablero con sus tarjetas (todo del usuario); devuelve {id, name} del tablero, listo para fijarlo en Inicio.
    const uid = () => 'w' + Math.random().toString(36).slice(2, 9);
    function create(t) {
        const ids = [];
        const next = i => i >= t.reports.length ? Promise.resolve() : Espo.Ajax.postRequest('CrmHub/biSave', {kind: 'report', name: t.reports[i].name, share: 'none', definition: t.reports[i].def}).then(x => { ids[i] = x.id; return next(i + 1); });
        return next(0).then(() => {
            const widgets = t.widgets.map(w => Object.assign({id: uid()}, w.type === 'report' ? {type: 'report', reportId: ids[w.rep], title: w.title, color: w.color, chart: w.chart} : {type: w.type, text: w.text, size: w.size, align: w.align}, {x: w.x, y: w.y, w: w.w, h: w.h}));
            return Espo.Ajax.postRequest('CrmHub/biSave', {kind: 'dashboard', name: t.name, share: 'none', definition: {widgets}}).then(r => ({id: r.id, name: t.name}));
        });
    }
    return {list, create};
});
