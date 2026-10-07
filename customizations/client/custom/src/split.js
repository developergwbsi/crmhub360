// Pantalla dividida: el contenido se achica para dejar a la vista el tablero mientras hay paneles abiertos (ficha del lead y/o canal).
define('custom:split', [], function () {
    const open = {lead: 0, ch: 0};
    let minimizedByUs = false;
    const root = document.documentElement;

    function sidebarToggle() { const a = document.querySelector('#navbar a.minimizer'); if (a) { a.click(); } }

    function apply() {
        const both = open.lead > 0 && open.ch > 0;
        const lead = open.lead > 0 ? (both ? 340 : 460) : 0, ch = open.ch > 0 ? 380 : 0, total = lead + ch;
        root.style.setProperty('--ch-lead-w', lead + 'px');
        root.style.setProperty('--ch-ch-w', ch + 'px');
        root.style.setProperty('--ch-split-w', total + 'px');
        document.body.classList.toggle('ch-split', total > 0);
        // en pantallas medianas se recoge el menú lateral para que sigan cabiendo los estados
        const minimized = document.body.classList.contains('minimized');
        if (total > 0 && !minimized && !minimizedByUs && window.innerWidth < 1900) { sidebarToggle(); minimizedByUs = true; }
        else if (total === 0 && minimizedByUs) { sidebarToggle(); minimizedByUs = false; }
        // Espo recalcula anchos al «resize» y vuelve a fijar los encabezados con el «scroll»
        [60, 350, 700].forEach(ms => setTimeout(() => { window.dispatchEvent(new Event('resize')); window.dispatchEvent(new Event('scroll')); }, ms));
    }

    const api = {
        open(kind) { open[kind] += 1; apply(); },
        close(kind) { open[kind] = Math.max(0, open[kind] - 1); apply(); },
        // Si un panel desapareció sin avisar (cambio de pantalla, recarga parcial), el contenido recupera todo su ancho.
        reconcile() {
            const lead = document.querySelectorAll('.ch-lead-drawer').length, ch = document.querySelectorAll('.ch-ch-panel').length;
            if ((open.lead > 0 && !lead) || (open.ch > 0 && !ch) || (document.body.classList.contains('ch-split') && !lead && !ch)) {
                open.lead = lead ? open.lead : 0; open.ch = ch ? open.ch : 0; apply();
            }
        },
    };
    window.ChSplit = api;
    return api;
});
