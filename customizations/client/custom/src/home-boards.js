/**
 * Tableros en el escritorio (Inicio): cada usuario «fija» los tableros de Reportes y tableros que quiere ver al entrar, siempre o solo entre dos fechas, puede tener varios,
 * acomodarlos y quitarlos. Se dibujan arriba de los widgets del escritorio. Endpoints: GET CrmHub/biPins, POST biPin, biUnpin, biPinMove (y biItems/biItem/biRun para dibujarlos).
 */
define('custom:home-boards', ['custom:ui', 'custom:bi-render', 'custom:bi-templates'], function (ChUi, R, TPL) {
    const esc = v => ChUi.esc(v == null ? '' : v);
    const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const nice = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('es-CO', {day: 'numeric', month: 'short', year: 'numeric'}); };
    const active = (p, today) => (!p.from || p.from <= today) && (!p.to || p.to >= today);
    const vig = p => !p.from && !p.to ? 'Siempre' : p.from && p.to ? `Del ${nice(p.from)} al ${nice(p.to)}` : p.from ? `Desde el ${nice(p.from)}` : `Hasta el ${nice(p.to)}`;
    let meta = null, grids = [];   // sources: se pide una vez por sesión

    const err = xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error((xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason')) || 'No se pudo completar.'); };

    // Diálogo para fijar un tablero (o cambiar su vigencia). → true si se guardó
    const curTab = () => { const a = document.querySelector('.home-content .dashboard-tabs .active'); return a ? a.textContent.trim() : ''; };
    function pinDialog(id, name, cur) {
        return Espo.Ajax.getRequest('CrmHub/homeTabs').then(r => r.tabs || [], () => []).then(tabs => dialog(id, name, cur, tabs));
    }
    function dialog(id, name, cur, tabs) {
        return new Promise(resolve => {
            const back = document.createElement('div'); back.className = 'ch-dlg-back'; const box = document.createElement('div'); box.className = 'ch-dlg'; back.appendChild(box); document.body.appendChild(back);
            const close = v => { document.removeEventListener('keydown', onKey, true); back.remove(); resolve(v); };
            const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(false); } };
            document.addEventListener('keydown', onKey, true); back.addEventListener('mousedown', e => { if (e.target === back) { close(false); } });
            const dated = !!(cur && (cur.from || cur.to));
            box.innerHTML = `<div class="ch-dlg-head"><span class="ch-dlg-ic fas fa-thumbtack"></span><h4>Ver en mi escritorio</h4></div><div class="ch-dlg-body"><p>El tablero <b>${esc(name)}</b> se verá arriba en <b>Inicio</b>.</p>` +
                `<label class="ch-hb-opt"><input type="radio" name="hb" value="always" ${dated ? '' : 'checked'}> <b>Siempre</b> <small>hasta que lo quites</small></label>` +
                `<label class="ch-hb-opt"><input type="radio" name="hb" value="range" ${dated ? 'checked' : ''}> <b>Solo por un tiempo</b> <small>entre dos fechas; luego deja de mostrarse solo</small></label>` +
                `<div class="ch-hb-dates" ${dated ? '' : 'hidden'}><label>Desde<input type="date" class="form-control" data-f="from" value="${esc(cur && cur.from || '')}"></label><label>Hasta<input type="date" class="form-control" data-f="to" value="${esc(cur && cur.to || '')}"></label></div>` +
                (tabs.length > 1 ? `<label class="ch-dlg-label">¿En qué pestaña del escritorio?</label><select class="form-control" data-f="tab"><option value="">En todas las pestañas</option>${tabs.map(t => `<option value="${esc(t)}" ${(cur ? cur.tab === t : curTab() === t) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>` : '') +
                `<label class="ch-dlg-label" style="margin-top:10px">¿Dónde?</label><select class="form-control" data-f="place"><option value="top" ${cur && cur.place === 'bottom' ? '' : 'selected'}>Arriba, antes de los widgets</option><option value="bottom" ${cur && cur.place === 'bottom' ? 'selected' : ''}>Al final, después de los widgets</option></select>` +
                `<div class="ch-dlg-err" hidden></div></div><div class="ch-dlg-foot"><button type="button" class="btn btn-default" data-a="no">Cancelar</button><button type="button" class="btn btn-primary" data-a="ok">Guardar</button></div>`;
            const q = s => box.querySelector(s), dates = q('.ch-hb-dates');
            box.addEventListener('change', e => { if (e.target.name === 'hb') { dates.hidden = e.target.value !== 'range'; } });
            q('[data-a="no"]').onclick = () => close(false);
            q('[data-a="ok"]').onclick = () => {
                const range = box.querySelector('input[name=hb]:checked').value === 'range', from = range ? q('[data-f=from]').value : '', to = range ? q('[data-f=to]').value : '';
                if (range && !from && !to) { const e = q('.ch-dlg-err'); e.hidden = false; e.textContent = 'Elige al menos una fecha, o deja «Siempre».'; return; }
                Espo.Ajax.postRequest('CrmHub/biPin', {id, dateFrom: from, dateTo: to, tab: q('[data-f=tab]') ? q('[data-f=tab]').value : '', place: q('[data-f=place]').value}).then(() => { Espo.Ui.success('Listo: lo verás en Inicio.'); close(true); }).catch(xhr => { err(xhr); });
            };
            requestAnimationFrame(() => back.classList.add('in'));
        });
    }

    function draw(wrap, p, def, sources) {
        const ctxFor = sid => { const s = sources.find(x => x.id === sid); const f = n => s && s.fields.find(x => x.name === n); return {fieldLabel: n => (f(n) || {}).label || n || '', fieldType: n => (f(n) || {}).type || ''}; };
        const run = d => Espo.Ajax.postRequest('CrmHub/biRun', {source: d.source, filters: (d.filters || []).filter(f => f.field && f.op), groups: (d.groups || []).filter(g => g.field), measures: (d.measures || []).filter(m => m.fn === 'count' || m.field), limit: d.limit || 50});
        const el = wrap.querySelector('.grid-stack'), ws = def.widgets || [];
        if (!ws.length) { wrap.querySelector('.ch-hb-body').innerHTML = '<div class="ch-muted" style="padding:14px">Este tablero está vacío.</div>'; return; }
        R.loadLibs(true).then(() => {
            if (!document.body.contains(el)) { return; }
            const g = window.GridStack.init({column: 12, cellHeight: 76, margin: 12, float: false, staticGrid: true, disableDrag: true, disableResize: true}, el); grids.push(g);
            ws.forEach(w => g.addWidget({id: w.id, x: w.x, y: w.y, w: w.w || 4, h: w.h || 4, minW: 2, minH: w.type === 'text' ? 1 : 2,
                content: `<div class="ch-w ch-w-${w.type}" data-w="${esc(w.id)}" ${w.color ? `style="border-top:3px solid ${esc(w.color)}"` : ''}><div class="ch-w-head"><b data-wt>${esc(w.title || (w.type === 'report' ? 'Reporte' : ''))}</b></div><div class="ch-w-body" data-wb></div></div>`}));
            ws.forEach(w => {
                const box = el.querySelector(`[data-w="${w.id}"] [data-wb]`); if (!box) { return; }
                if (w.type === 'text') { box.innerHTML = `<div class="ch-w-text" style="font-size:${esc(w.size || 16)}px;text-align:${esc(w.align || 'left')}">${esc(w.text || '').replace(/\n/g, '<br>')}</div>`; return; }
                if (w.type === 'image') { box.innerHTML = w.url ? `<img class="ch-w-img" src="${esc(w.url)}" alt="" referrerpolicy="no-referrer">` : ''; return; }
                if (!w.reportId) { return; }
                box.innerHTML = '<div class="ch-muted ch-bi-empty">Calculando…</div>';
                Espo.Ajax.getRequest('CrmHub/biItem', {id: w.reportId}).then(rep => { const t = el.querySelector(`[data-w="${w.id}"] [data-wt]`); if (t && !w.title) { t.textContent = rep.name; }
                    const d = Object.assign({}, rep.def, w.chart ? {chart: w.chart} : {}); return run(d).then(res => R.draw(box, d, res, Object.assign({color: w.color, title: w.title || rep.name}, ctxFor(d.source)))); })
                    .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } box.innerHTML = '<div class="ch-muted ch-bi-empty">No disponible.</div>'; });
            });
        });
    }

    // Galería de tableros ya armados: se elige uno, se crea (con sus reportes) y queda fijado en Inicio. También se puede ir a armarlo a mano.
    const ENT = {Lead: 'leads', Opportunity: 'oportunidades', Task: 'tareas', Meeting: 'reuniones', Call: 'llamadas', Account: 'cuentas', Contact: 'contactos'};
    const ONE = {Lead: 'lead', Opportunity: 'oportunidad', Task: 'tarea', Meeting: 'reunión', Call: 'llamada', Account: 'cuenta', Contact: 'contacto'};
    const mainEntity = t => { const c = {}; t.reports.forEach(r => { c[r.def.source] = (c[r.def.source] || 0) + 1; }); return Object.keys(c).sort((x, y) => c[y] - c[x])[0]; };
    function gallery(host) {
        const pins = host._pins || [];
        // cuántos registros hay de cada tipo (con los permisos de la persona), para avisar qué tableros se verían vacíos
        const ents = [...new Set(TPL.list.map(mainEntity))], counts = {};
        const counted = Promise.all(ents.map(e => Espo.Ajax.getRequest(e, {maxSize: 1, select: 'id'}).then(r => { counts[e] = r.total; }, xhr => { if (xhr) { xhr.errorIsHandled = true; } counts[e] = null; })));
        counted.then(() => ChUi.panel({title: 'Elige un tablero para tu escritorio', icon: 'fas fa-table-cells-large', close: 'Cerrar', mount: (body, close) => {
            body.classList.add('ch-tpl-body');
            const info = t => { const e = mainEntity(t), n = counts[e]; return n === null || n === undefined ? {ok: null} : {ok: n > 0, n, label: ENT[e] || e, one: ONE[e] || e}; };
            const list = TPL.list.slice().sort((x, y) => (info(y).ok === true) - (info(x).ok === true));
            body.innerHTML = '<p class="ch-muted">Tableros ya armados según lo que hace tu equipo: elige uno y aparece en <b>Inicio</b> con sus gráficas e indicadores. Un tablero solo se llena si ya tienes los datos que mide; por eso cada tarjeta indica si ya hay datos. Después puedes editarlo en «Reportes y tableros» o quitarlo cuando quieras.</p>' +
                (pins.length ? `<label class="ch-pr-chk"><input type="checkbox" data-rep checked> <b>Reemplazar</b> los ${pins.length === 1 ? 'tablero que ya tengo' : pins.length + ' tableros que ya tengo'} en el escritorio <small>(no se borran: siguen en «Reportes y tableros»)</small></label>` : '') +
                '<div class="ch-tpl-grid">' + list.map(t => { const i = info(t); return `<div class="ch-tpl" data-t="${esc(t.id)}"><div class="ic" style="background:${esc(t.color)}1f;color:${esc(t.color)}"><span class="${esc(t.icon)}"></span></div><b>${esc(t.name)}</b><small>${esc(t.desc)}</small><div class="ch-tpl-meta"><b>Ideal si</b> ${esc(t.ideal || '')}</div>` +
                    (t.id === 'comercial' && document.querySelector('.home-content .dashlet[data-name="CrmHubPanel"]') ? '<div class="ch-tpl-data no"><span class="fas fa-clone"></span> Muy parecido al «Panel gerencial» que ya tienes en Inicio: no lo repitas.</div>' : '') + (i.ok === null ? '' : `<div class="ch-tpl-data ${i.ok ? 'ok' : 'no'}"><span class="fas fa-${i.ok ? 'circle-check' : 'circle-info'}"></span> ${i.ok ? `Con datos: ${i.n} ${esc(i.n === 1 ? i.one : i.label)}` : `Aún sin datos: no tienes ${esc(i.label)} todavía, se vería vacío`}</div>`) + '</div>'; }).join('') + '</div>' +
                '<p style="margin-top:14px"><a class="btn btn-default" href="#CrmHub/reportes" data-go="1"><span class="fas fa-pen-ruler"></span> Prefiero armar mi propio tablero</a></p>';
            body.onclick = e => {
                if (e.target.closest('[data-go]')) { close(true); return; }
                const c = e.target.closest('[data-t]'); if (!c || body.dataset.busy) { return; }
                const t = TPL.list.find(x => x.id === c.dataset.t), rep = body.querySelector('[data-rep]'), replace = !!(rep && rep.checked); body.dataset.busy = '1';
                body.innerHTML = `<p class="ch-muted" style="padding:20px 4px"><span class="fas fa-spinner fa-spin"></span> Armando «${esc(t.name)}»…</p>`;
                (replace ? Promise.all(pins.map(p => Espo.Ajax.postRequest('CrmHub/biUnpin', {id: p.id}))) : Promise.resolve())
                    .then(() => TPL.create(t)).then(d => Espo.Ajax.postRequest('CrmHub/biPin', {id: d.id, dateFrom: '', dateTo: '', tab: '', place: 'top'}))
                    .then(() => { close(true); Espo.Ui.success('Listo: «' + t.name + '» ya está en tu escritorio.'); host._pins = null; if (host._go) { host._go(); } })
                    .catch(xhr => { close(false); err(xhr); });
            };
        }}));
    }

    function manage(root, pins, refresh) {
        const today = ymd(new Date());
        ChUi.panel({title: 'Tableros de mi escritorio', icon: 'fas fa-thumbtack', mount: (body, close) => {
            const paint = () => {
                body.innerHTML = (pins.length ? '<div class="ch-hb-list">' + pins.map((p, i) => `<div class="ch-hb-row" data-id="${esc(p.id)}"><div><b>${esc(p.name)}</b><small>${esc(vig(p))} · ${p.tab ? 'Pestaña «' + esc(p.tab) + '»' : 'Todas las pestañas'} · ${p.place === 'bottom' ? 'al final' : 'arriba'}${active(p, today) ? '' : ' · <em>no se muestra hoy</em>'}</small></div>` +
                    `<span><button type="button" data-a="up" title="Subir" ${i ? '' : 'disabled'}><span class="fas fa-arrow-up"></span></button><button type="button" data-a="down" title="Bajar" ${i < pins.length - 1 ? '' : 'disabled'}><span class="fas fa-arrow-down"></span></button>` +
                    `<button type="button" data-a="edit" title="Cambiar fechas"><span class="far fa-calendar"></span></button><button type="button" data-a="rm" title="Quitar del escritorio"><span class="fas fa-trash"></span></button></span></div>`).join('') + '</div>' : '<p class="ch-muted">No tienes tableros fijados.</p>') +
                    '<p style="margin-top:12px"><button type="button" class="btn btn-default" data-a="add"><span class="fas fa-plus"></span> Añadir otro tablero</button> <button type="button" class="btn btn-default" data-a="gal"><span class="fas fa-table-cells-large"></span> Elegir uno ya armado</button> <a class="btn btn-link" href="#CrmHub/reportes" data-a="go">Crear un tablero nuevo</a></p>';
            };
            paint();
            const reload = () => Espo.Ajax.getRequest('CrmHub/biPins').then(r => { pins = r.pins || []; paint(); refresh(); });
            const onClick = e => {
                const b = e.target.closest('[data-a]'); if (!b) { return; } const row = b.closest('.ch-hb-row'), id = row && row.dataset.id, p = id && pins.find(x => x.id === id), k = b.dataset.a;
                if (k === 'go') { close(true); return; }
                if (k === 'gal') { close(true); gallery(root); return; }
                if (k === 'up' || k === 'down') { Espo.Ajax.postRequest('CrmHub/biPinMove', {id, up: k === 'up'}).then(reload); }
                else if (k === 'rm') { Espo.Ajax.postRequest('CrmHub/biUnpin', {id}).then(reload); }
                else if (k === 'edit') { pinDialog(id, p.name, p).then(ok => { if (ok) { reload(); } }); }
                else if (k === 'add') {
                    Espo.Ajax.getRequest('CrmHub/biItems').then(r => {
                        const have = new Set(pins.map(x => x.id)), ds = (r.items || []).filter(i => i.kind === 'dashboard' && !have.has(i.id));
                        if (!ds.length) { ChUi.notice({title: 'No hay más tableros', text: 'Todos tus tableros ya están en el escritorio. Crea uno nuevo en «Reportes y tableros».'}); return; }
                        body.innerHTML = '<p>Elige el tablero que quieres ver en tu escritorio:</p><div class="ch-hb-list">' + ds.map(i => `<div class="ch-hb-row pick" data-pick="${esc(i.id)}" data-name="${esc(i.name)}"><div><b>${esc(i.name)}</b><small>${i.mine ? 'Mío' : 'De ' + esc(i.ownerName)}</small></div><span class="fas fa-chevron-right"></span></div>`).join('') + '</div>';
                        body.onclick = ev => { const r2 = ev.target.closest('[data-pick]'); if (!r2) { return; } pinDialog(r2.dataset.pick, r2.dataset.name, null).then(() => { body.onclick = onClick; reload(); }); };
                    });
                }
            };
            body.onclick = onClick;
        }});
    }

    // Pinta los tableros fijados dentro de `host` (div que el arranque pone encima de los widgets de Inicio)
    // una vez por sesión de página se piden los tableros fijados; al cambiar de pestaña solo se vuelve a dibujar
    function mount(host, refetch) {
        const go = () => (refetch || !host._pins ? Espo.Ajax.getRequest('CrmHub/biPins').then(r => { host._pins = r.pins || []; }) : Promise.resolve()).then(() => draw2(host, go))
            .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } host.dataset.state = 'none'; });
        host._go = go; go();
    }
    // El «Panel gerencial» que llega por defecto no se repite cuando la persona ya eligió sus tableros: se oculta y puede volver a verlo con un botón
    const PKEY = 'ch-hb-showpanel', PANEL = '.dashlet[data-name="CrmHubPanel"]';
    const setHide = (host, on) => { const hc = host.parentNode; if (hc) { hc.classList.toggle('ch-hb-hide-panel', on); } };
    function panelSwitch(host, low, hasShown) {
        const show = (() => { try { return localStorage.getItem(PKEY) === '1'; } catch (x) { return false; } })();
        setHide(host, hasShown && !show);
        const sync = () => {
            const has = !!(host.parentNode && host.parentNode.querySelector(PANEL));
            host.parentNode && host.parentNode.querySelectorAll('.ch-hb-top [data-a=panel]').forEach(b => { b.hidden = !(hasShown && has); b.querySelector('i').textContent = show ? 'Ocultar el panel gerencial' : 'Ver el panel gerencial'; b.firstElementChild.className = 'fas fa-' + (show ? 'eye-slash' : 'eye'); });
        };
        sync(); setTimeout(sync, 1200); setTimeout(sync, 3000);
    }
    const tabOf = () => curTab();
    const tabsDom = () => [].map.call(document.querySelectorAll('.home-content .dashboard-tabs button'), x => x.textContent.trim());
    function draw2(host, go) {
        const token = (host._tok = (host._tok || 0) + 1), tab = tabOf(), refetchGo = () => { host._pins = null; return go(); };
        host.dataset.tab = tab;
        return (async () => {
            if (host._tok !== token || !document.body.contains(host)) { return; }
            // abajo: un segundo contenedor después de los widgets (para los tableros fijados «al final»)
            let low = host.parentNode.querySelector(':scope > .ch-home-boards-b');
            if (!low) { low = document.createElement('div'); low.className = 'ch-home-boards-b'; const g = host.parentNode.querySelector('.dashlets'); (g || host).insertAdjacentElement('afterend', low); }
            const pins = host._pins || [], today = ymd(new Date()), names = tabsDom();
            const inTab = p => !p.tab || !names.length || p.tab === tab || !names.includes(p.tab);   // sin pestaña, o su pestaña ya no existe → se ve en la actual
            const show = pins.filter(p => active(p, today) && inTab(p));
            grids.forEach(g => { try { g.destroy(false); } catch (e) { /* ya no existe */ } }); grids = [];
            if (!pins.length) { setHide(host, false); host.dataset.state = 'none'; host.innerHTML = '<div class="ch-hb-top"><span><span class="fas fa-thumbtack"></span> Mis tableros <small class="ch-muted">· aún no tienes ninguno en tu escritorio</small></span><button type="button" class="btn btn-primary btn-xs" data-a="gallery"><span class="fas fa-table-cells-large"></span> Elegir un tablero</button></div>'; low.innerHTML = ''; host.onclick = e => { if (e.target.closest('[data-a=gallery]')) { gallery(host); } }; return; }
            host.dataset.state = show.length ? 'some' : 'none';
            const sec = p => `<section class="ch-hb" data-id="${esc(p.id)}"><div class="ch-hb-head"><h4>${esc(p.name)}</h4><small>${esc(vig(p))}</small><button type="button" class="ch-hb-x" data-a="edit" title="${p.mine ? 'Editar este tablero' : 'Abrir en Reportes y tableros'}"><span class="fas ${p.mine ? 'fa-pen' : 'fa-arrow-up-right-from-square'}"></span></button><button type="button" class="ch-hb-x" data-a="rm" title="Quitar de mi escritorio"><span class="fas fa-xmark"></span></button></div><div class="ch-hb-body"><div class="grid-stack"></div></div></section>`;
            const topList = show.filter(p => p.place !== 'bottom'), lowList = show.filter(p => p.place === 'bottom');
            const bar = '<div class="ch-hb-top"><span><span class="fas fa-thumbtack"></span> Mis tableros</span><span><button type="button" class="btn btn-default btn-xs" data-a="panel" hidden><span class="fas fa-eye"></span> <i>Ver el panel gerencial</i></button> <button type="button" class="btn btn-primary btn-xs" data-a="gallery"><span class="fas fa-table-cells-large"></span> Elegir un tablero</button> <button type="button" class="btn btn-default btn-xs" data-a="manage"><span class="fas fa-sliders"></span> Administrar</button></span></div>';
            host.innerHTML = (topList.length || !lowList.length ? bar : '') + topList.map(sec).join('') + (show.length ? '' : '<div class="ch-muted" style="padding:6px 2px">No hay tableros fijados en esta pestaña.</div>');
            low.innerHTML = (!topList.length && lowList.length ? bar : '') + lowList.map(sec).join('');
            const click = e => {
                const b = e.target.closest('[data-a]'); if (!b) { return; }
                if (b.dataset.a === 'panel') { try { localStorage.setItem(PKEY, localStorage.getItem(PKEY) === '1' ? '0' : '1'); } catch (x) { /* sin almacenamiento */ } panelSwitch(host, low, true); return; }
                if (b.dataset.a === 'gallery') { gallery(host); return; }
                if (b.dataset.a === 'manage') { manage(host, pins, refetchGo); return; }
                const sc = b.closest('.ch-hb'); if (!sc) { return; } const id = sc.dataset.id, p = pins.find(x => x.id === id);
                if (b.dataset.a === 'edit') { try { sessionStorage.setItem('chBiOpen', JSON.stringify({id, edit: !!(p && p.mine)})); } catch (x) { /* nada */ } location.hash = '#CrmHub/reportes'; }
                else if (b.dataset.a === 'rm') { ChUi.confirm({title: 'Quitar del escritorio', ok: 'Quitar', html: `<b>${esc(p.name)}</b> dejará de verse en Inicio. El tablero no se elimina: sigue en «Reportes y tableros».`}).then(y => { if (y) { Espo.Ajax.postRequest('CrmHub/biUnpin', {id}).then(refetchGo); } }); }
            };
            host.onclick = click; low.onclick = click;
            panelSwitch(host, low, show.length > 0);
            if (!show.length) { return; }
            if (!meta) { try { meta = (await Espo.Ajax.getRequest('CrmHub/biItems')).sources || []; } catch (x) { meta = []; } }
            for (const p of show) {
                const wrap = document.querySelector(`.home-content .ch-hb[data-id="${p.id}"]`);
                Espo.Ajax.getRequest('CrmHub/biItem', {id: p.id}).then(it => { if (wrap && host._tok === token) { draw(wrap, p, it.def || {}, meta); } }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } if (wrap) { wrap.querySelector('.ch-hb-body').innerHTML = '<div class="ch-muted" style="padding:14px">No se pudo abrir este tablero.</div>'; } });
            }
        })();
    }

    return {mount, pinDialog, openGallery: gallery, refresh: host => { if (host._go) { host._pins ? draw2(host, host._go) : host._go(); } }, syncTab: host => { if (host.dataset.tab !== tabOf() && host._pins) { draw2(host, host._go); } }};
});
