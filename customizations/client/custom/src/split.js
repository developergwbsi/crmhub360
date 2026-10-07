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
        [60, 350].forEach(ms => setTimeout(() => window.dispatchEvent(new Event('resize')), ms));
    }

    return {
        open(kind) { open[kind] += 1; apply(); },
        close(kind) { open[kind] = Math.max(0, open[kind] - 1); apply(); },
    };
});
