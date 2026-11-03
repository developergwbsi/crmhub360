/**
 * Notificaciones: buscador y agrupación por día. `attach(listContainer, {days})` pone arriba una barra con buscador (filtra lo ya cargado, y lo que se cargue después con «Mostrar más»)
 * y, en la página completa, títulos de día («Hoy», «Ayer», «01 nov») entre las tarjetas. No cambia las filas de Espo: solo añade la barra y los títulos.
 */
define('custom:notif-tools', [], function () {
    const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const dayKey = d => String(d.getDate()).padStart(2, '0') + ' ' + MES[d.getMonth()];

    function labelOf(row) {
        const t = row.querySelector('.stream-date-container [title]'); if (!t) { return ''; }
        const parts = (t.getAttribute('title') || '').trim().split(/\s+/);
        if (parts.length >= 3 && /^\d{1,2}:\d{2}/.test(parts[parts.length - 1])) { parts.pop(); }
        const raw = parts.join(' '), key = norm(raw).replace(/\./g, '').slice(0, 6), now = new Date(), y = new Date(Date.now() - 864e5);
        const m = k => { const a = norm(k).replace(/\./g, '').split(/\s+/); return a.length >= 2 ? String(a[0]).padStart(2, '0') + ' ' + a[1].slice(0, 3) : norm(k); };
        const mine = m(raw);
        return mine === dayKey(now) ? 'Hoy' : mine === dayKey(y) ? 'Ayer' : raw;
    }

    function attach(box, o) {
        if (!box || box.dataset.chNotif) { return; }
        box.dataset.chNotif = '1';
        const bar = document.createElement('div'); bar.className = 'ch-notif-bar';
        bar.innerHTML = '<span class="fas fa-magnifying-glass"></span><input type="search" class="form-control" placeholder="Buscar en las notificaciones…" aria-label="Buscar en las notificaciones"><span class="ch-notif-count"></span>';
        box.parentNode.insertBefore(bar, box);
        const input = bar.querySelector('input'), count = bar.querySelector('.ch-notif-count');
        let busy = false;
        const mo = new MutationObserver(() => run());
        const run = () => {
            if (busy) { return; } busy = true; mo.disconnect();
            const ul = box.querySelector('ul.list-group'); if (!ul) { busy = false; mo.observe(box, {childList: true, subtree: true}); return; }
            ul.querySelectorAll(':scope > .ch-notif-day').forEach(x => x.remove());
            const q = norm(input.value.trim()); let shown = 0, last = null, head = null, any = 0;
            [].forEach.call(ul.querySelectorAll(':scope > li.list-group-item'), li => {
                const ok = !q || norm(li.textContent).includes(q); li.hidden = !ok;
                if (!ok) { return; } shown++;
                if (o && o.days) { const lb = labelOf(li); if (lb && lb !== last) { last = lb; head = document.createElement('li'); head.className = 'ch-notif-day'; head.textContent = lb; li.parentNode.insertBefore(head, li); } }
            });
            any = ul.querySelectorAll(':scope > li.list-group-item').length;
            count.textContent = q ? shown + (shown === 1 ? ' resultado' : ' resultados') : '';
            let em = box.querySelector('.ch-notif-none'); if (q && !shown && any) { if (!em) { em = document.createElement('div'); em.className = 'ch-notif-none'; em.textContent = 'No hay notificaciones con ese texto. Prueba otra palabra o pulsa «Mostrar más» para cargar las anteriores.'; box.appendChild(em); } } else if (em) { em.remove(); }
            busy = false; mo.observe(box, {childList: true, subtree: true});
        };
        input.addEventListener('input', run);
        run();
    }
    return {attach};
});
