/**
 * Dibujo de reportes (tabla, barras, líneas, áreas, circular, anillo, indicador) con Chart.js y utilidades de la pantalla de reportes.
 * draw(el, def, result, ctx): ctx.fieldLabel(name) y ctx.fieldType(name) dan el nombre y tipo de los campos del origen. loadLibs() carga Chart.js y GridStack (una vez).
 */
define('custom:bi-render', ['custom:ui'], function (ChUi) {
    const esc = v => ChUi.esc(v == null ? '' : v);
    const PALETTE = ['#4f63e8', '#2fa36b', '#f59e0b', '#8b5cf6', '#0ea5e9', '#ef5b5b', '#14b8a6', '#d4729b', '#64748b', '#a3a30b'];
    const CHARTS = [['table', 'Tabla'], ['bar', 'Barras'], ['hbar', 'Barras horizontales'], ['stacked', 'Barras apiladas'], ['line', 'Líneas'], ['area', 'Áreas'], ['pie', 'Circular'], ['doughnut', 'Anillo'], ['kpi', 'Indicador (cifra)']];
    const FNS = [['count', 'Cantidad de registros'], ['sum', 'Suma'], ['avg', 'Promedio'], ['min', 'Mínimo'], ['max', 'Máximo']];
    const nf = new Intl.NumberFormat('es-CO', {maximumFractionDigits: 2});
    const money = v => '$ ' + new Intl.NumberFormat('es-CO', {maximumFractionDigits: 0}).format(v);
    const libs = {};

    // carga un script fuera del cargador AMD de EspoCRM (las librerías UMD se registrarían como módulos anónimos y fallarían)
    function loadScript(src, globalName) {
        if (libs[src]) { return libs[src]; }
        libs[src] = new Promise((resolve, reject) => {
            if (window[globalName]) { resolve(window[globalName]); return; }
            const d = window.define; window.define = undefined;
            const s = document.createElement('script'); s.src = src;
            s.onload = () => { window.define = d; resolve(window[globalName]); };
            s.onerror = () => { window.define = d; reject(new Error('No se pudo cargar ' + src)); };
            document.head.appendChild(s);
        });
        return libs[src];
    }
    function loadCss(href) { if (!document.querySelector(`link[href="${href}"]`)) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l); } }
    function loadLibs(needGrid) {
        const base = 'client/custom/lib/';
        const p = [loadScript(base + 'chart.umd.min.js', 'Chart')];
        if (needGrid) { loadCss(base + 'gridstack.min.css'); p.push(loadScript(base + 'gridstack-all.js', 'GridStack')); }
        return Promise.all(p);
    }

    function measureLabel(m, ctx) { return m.label || (m.fn === 'count' ? 'Cantidad' : (FNS.find(f => f[0] === m.fn) || [])[1] + ' de ' + ctx.fieldLabel(m.field)); }
    function fmt(m, ctx, v) { if (v == null) { return '—'; } return m.fn !== 'count' && ctx.fieldType(m.field) === 'currency' ? money(v) : nf.format(v); }
    function xLabel(def, v) { return v; }

    function table(el, def, rows, ctx) {
        const groups = def.groups || [], ms = def.measures && def.measures.length ? def.measures : [{fn: 'count'}];
        const head = groups.map(g => `<th>${esc(ctx.fieldLabel(g.field))}</th>`).concat(ms.map(m => `<th class="num">${esc(measureLabel(m, ctx))}</th>`)).join('');
        const body = rows.map(r => '<tr>' + groups.map((g, i) => `<td>${esc(r['g' + (i + 1)])}</td>`).concat(ms.map((m, i) => `<td class="num">${esc(fmt(m, ctx, r['m' + (i + 1)]))}</td>`)).join('') + '</tr>').join('');
        el.innerHTML = `<div class="ch-bi-tbl"><table class="table"><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${groups.length + ms.length}" class="ch-muted">Sin datos con estos filtros.</td></tr>`}</tbody></table></div>`;
    }

    function kpi(el, def, rows, ctx) {
        const m = (def.measures && def.measures[0]) || {fn: 'count'};
        const vals = rows.map(r => r.m1).filter(v => v != null);
        const v = !vals.length ? 0 : m.fn === 'min' ? Math.min(...vals) : m.fn === 'max' ? Math.max(...vals) : m.fn === 'avg' ? vals.reduce((a, b) => a + b, 0) / vals.length : vals.reduce((a, b) => a + b, 0);
        el.innerHTML = `<div class="ch-bi-kpi"><div class="v">${esc(fmt(m, ctx, v))}</div><div class="l">${esc(measureLabel(m, ctx))}</div></div>`;
    }

    function chart(el, def, rows, ctx) {
        const type = def.chart, groups = def.groups || [], ms = def.measures && def.measures.length ? def.measures : [{fn: 'count'}];
        if (!groups.length) { kpi(el, def, rows, ctx); return Promise.resolve(); }
        let labels, datasets;
        if (groups.length === 2) {
            labels = [...new Set(rows.map(r => r.g1))]; const series = [...new Set(rows.map(r => r.g2))];
            datasets = series.map((s, i) => ({label: String(s), data: labels.map(l => { const r = rows.find(x => x.g1 === l && x.g2 === s); return r ? r.m1 : 0; }), backgroundColor: PALETTE[i % PALETTE.length], borderColor: PALETTE[i % PALETTE.length]}));
        } else {
            labels = rows.map(r => r.g1);
            datasets = ms.map((m, i) => ({label: measureLabel(m, ctx), data: rows.map(r => r['m' + (i + 1)]), backgroundColor: ['pie', 'doughnut'].includes(type) ? rows.map((x, j) => PALETTE[j % PALETTE.length]) : PALETTE[i % PALETTE.length], borderColor: PALETTE[i % PALETTE.length]}));
        }
        el.innerHTML = '<div class="ch-bi-cv"><canvas></canvas></div>';
        return loadLibs(false).then(() => {
            const cv = el.querySelector('canvas'); if (!cv) { return; }
            if (el._chart) { el._chart.destroy(); }
            const circ = ['pie', 'doughnut'].includes(type), line = ['line', 'area'].includes(type);
            el._chart = new window.Chart(cv, {
                type: circ ? type : line ? 'line' : 'bar',
                data: {labels, datasets: datasets.map(d => line ? Object.assign(d, {fill: type === 'area', tension: .3, backgroundColor: type === 'area' ? d.borderColor + '33' : d.borderColor, pointRadius: 3}) : d)},
                options: {responsive: true, maintainAspectRatio: false, indexAxis: type === 'hbar' ? 'y' : 'x', animation: {duration: 350},
                    plugins: {legend: {display: circ || datasets.length > 1, position: 'bottom', labels: {boxWidth: 10, font: {size: 11}}}, tooltip: {callbacks: {label: c => (c.dataset.label ? c.dataset.label + ': ' : '') + nf.format(c.parsed.y != null && !circ && type !== 'hbar' ? c.parsed.y : c.parsed.x != null && type === 'hbar' ? c.parsed.x : c.parsed)}}},
                    scales: circ ? {} : {x: {stacked: type === 'stacked', grid: {display: false}, ticks: {font: {size: 11}}}, y: {stacked: type === 'stacked', beginAtZero: true, ticks: {font: {size: 11}, precision: datasets.every(d => d.data.every(v => Number.isInteger(v))) ? 0 : undefined, callback: v => nf.format(v)}}}},
            });
        });
    }

    function draw(el, def, result, ctx) {
        const rows = (result && result.rows) || [];
        if (el._chart) { el._chart.destroy(); el._chart = null; }
        if (def.chart === 'table' || !def.chart) { table(el, def, rows, ctx); return Promise.resolve(); }
        if (def.chart === 'kpi') { kpi(el, def, rows, ctx); return Promise.resolve(); }
        if (!rows.length) { el.innerHTML = '<div class="ch-muted ch-bi-empty">Sin datos con estos filtros.</div>'; return Promise.resolve(); }
        return chart(el, def, rows, ctx);
    }

    return {draw, loadLibs, CHARTS, FNS, PALETTE, measureLabel};
});
