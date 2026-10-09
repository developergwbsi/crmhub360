/* Tablas del Centro de control. */
(function () {
    'use strict';
    /* ---------------- Tablas: buscador, paginación, encabezado fijo y scroll dentro del contenido ---------------- */
    var DT_STATE = {};
    function dtNorm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' '); }
    function dtEnhance(table) {
        if (table.getAttribute('data-ch-enh') || !table.tBodies.length) { return; }
        var tbody = table.tBodies[0], rows = Array.prototype.slice.call(tbody.rows);
        if (!rows.length || (rows.length === 1 && rows[0].querySelector('.ch-empty'))) { return; }   // sin datos: queda solo la ilustración
        table.setAttribute('data-ch-enh', '1');
        var heads = Array.prototype.map.call(table.querySelectorAll('thead th'), function (h) { return h.textContent.trim(); }).join('|');
        var key = location.pathname + location.hash + '#' + heads;
        var st = DT_STATE[key] || (DT_STATE[key] = {q: '', page: 1, size: 10});
        var wrap = document.createElement('div'); wrap.className = 'ch-dt';
        wrap.innerHTML = '<div class="ch-dt-bar"><div class="ch-dt-search"><input type="search" class="ch-dt-q" placeholder="Buscar en la tabla…" aria-label="Buscar en la tabla" autocomplete="off"></div><span class="ch-dt-count"></span></div>' +
            '<div class="ch-dt-scroll"></div><div class="ch-dt-none" hidden></div>' +
            '<div class="ch-dt-foot"><label class="ch-dt-size">Filas <select class="ch-dt-sz"><option>10</option><option>25</option><option>50</option><option>100</option></select></label><div class="ch-dt-pages"></div></div>';
        table.parentNode.insertBefore(wrap, table);
        wrap.querySelector('.ch-dt-scroll').appendChild(table);
        var q = wrap.querySelector('.ch-dt-q'), sz = wrap.querySelector('.ch-dt-sz'), cnt = wrap.querySelector('.ch-dt-count'), pg = wrap.querySelector('.ch-dt-pages'), none = wrap.querySelector('.ch-dt-none'), sc = wrap.querySelector('.ch-dt-scroll');
        var data = rows.map(function (r) { return {r: r, t: dtNorm(r.textContent)}; });
        q.value = st.q; sz.value = String(st.size);
        function draw() {
            var term = dtNorm(st.q).trim(), hit = term ? data.filter(function (d) { return d.t.indexOf(term) !== -1; }) : data;
            var pages = Math.max(1, Math.ceil(hit.length / st.size)); if (st.page > pages) { st.page = pages; }
            var from = (st.page - 1) * st.size, to = from + st.size;
            data.forEach(function (d) { d.r.hidden = true; });
            hit.slice(from, to).forEach(function (d) { d.r.hidden = false; });
            cnt.textContent = hit.length ? (from + 1) + '–' + Math.min(to, hit.length) + ' de ' + hit.length : '0 resultados';
            sc.hidden = !hit.length; none.hidden = !!hit.length;
            if (!hit.length) { none.innerHTML = window.ChEmpty ? window.ChEmpty.html({compact: true, kind: 'search', title: 'Sin resultados', text: 'Nada coincide con «' + st.q.replace(/[<>&"]/g, '') + '».'}) : 'Sin resultados'; }
            var b = '', add = function (n, label, on, dis) { b += '<button type="button" class="ch-dt-pb' + (on ? ' on' : '') + '" data-p="' + n + '"' + (dis ? ' disabled' : '') + '>' + label + '</button>'; };
            if (pages > 1) {
                add(st.page - 1, '‹', false, st.page === 1);
                var lo = Math.max(1, st.page - 2), hi = Math.min(pages, lo + 4); lo = Math.max(1, hi - 4);
                if (lo > 1) { add(1, '1', false); if (lo > 2) { b += '<span class="ch-dt-dots">…</span>'; } }
                for (var i = lo; i <= hi; i++) { add(i, i, i === st.page); }
                if (hi < pages) { if (hi < pages - 1) { b += '<span class="ch-dt-dots">…</span>'; } add(pages, pages, false); }
                add(st.page + 1, '›', false, st.page === pages);
            }
            pg.innerHTML = b;
        }
        q.addEventListener('input', function () { st.q = q.value; st.page = 1; draw(); sc.scrollTop = 0; });
        sz.addEventListener('change', function () { st.size = parseInt(sz.value, 10) || 10; st.page = 1; draw(); });
        pg.addEventListener('click', function (e) { var b = e.target.closest('[data-p]'); if (b && !b.disabled) { st.page = parseInt(b.getAttribute('data-p'), 10); draw(); sc.scrollTop = 0; } });
        draw();
        // si la vista vuelve a pintar las filas (actualización en vivo), se reconstruye la lista sin perder la búsqueda
        new MutationObserver(function () {
            data = Array.prototype.map.call(tbody.rows, function (r) { return {r: r, t: dtNorm(r.textContent)}; });
            draw();
        }).observe(tbody, {childList: true});
    }
    function dtScan(root) {
        var t = (root || document).querySelectorAll('.card > table:not([data-ch-enh]):not([data-ch-skip])');
        for (var i = 0; i < t.length; i++) { dtEnhance(t[i]); }
    }
    var pend = false;
    new MutationObserver(function () { if (pend) { return; } pend = true; requestAnimationFrame(function () { pend = false; dtScan(document); }); }).observe(document.documentElement, {childList: true, subtree: true});
})();
