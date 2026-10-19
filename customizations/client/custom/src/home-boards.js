/**
 * Tableros en el escritorio (Inicio): cada usuario «fija» los tableros de Reportes y tableros que quiere ver al entrar, siempre o solo entre dos fechas, puede tener varios,
 * acomodarlos y quitarlos. Se dibujan arriba de los widgets del escritorio. Endpoints: GET CrmHub/biPins, POST biPin, biUnpin, biPinMove (y biItems/biItem/biRun para dibujarlos).
 */
define('custom:home-boards', ['custom:ui', 'custom:bi-render'], function (ChUi, R) {
    const esc = v => ChUi.esc(v == null ? '' : v);
    const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const nice = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('es-CO', {day: 'numeric', month: 'short', year: 'numeric'}); };
    const active = (p, today) => (!p.from || p.from <= today) && (!p.to || p.to >= today);
    const vig = p => !p.from && !p.to ? 'Siempre' : p.from && p.to ? `Del ${nice(p.from)} al ${nice(p.to)}` : p.from ? `Desde el ${nice(p.from)}` : `Hasta el ${nice(p.to)}`;
    let meta = null, grids = [];   // sources: se pide una vez por sesión

    const err = xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error((xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason')) || 'No se pudo completar.'); };

    // Diálogo para fijar un tablero (o cambiar su vigencia). → true si se guardó
    function pinDialog(id, name, cur) {
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
                `<div class="ch-dlg-err" hidden></div></div><div class="ch-dlg-foot"><button type="button" class="btn btn-default" data-a="no">Cancelar</button><button type="button" class="btn btn-primary" data-a="ok">Guardar</button></div>`;
            const q = s => box.querySelector(s), dates = q('.ch-hb-dates');
            box.addEventListener('change', e => { if (e.target.name === 'hb') { dates.hidden = e.target.value !== 'range'; } });
            q('[data-a="no"]').onclick = () => close(false);
            q('[data-a="ok"]').onclick = () => {
                const range = box.querySelector('input[name=hb]:checked').value === 'range', from = range ? q('[data-f=from]').value : '', to = range ? q('[data-f=to]').value : '';
                if (range && !from && !to) { const e = q('.ch-dlg-err'); e.hidden = false; e.textContent = 'Elige al menos una fecha, o deja «Siempre».'; return; }
                Espo.Ajax.postRequest('CrmHub/biPin', {id, dateFrom: from, dateTo: to}).then(() => { Espo.Ui.success('Listo: lo verás en Inicio.'); close(true); }).catch(xhr => { err(xhr); });
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
                    const d = Object.assign({}, rep.def, w.chart ? {chart: w.chart} : {}); return run(d).then(res => R.draw(box, d, res, Object.assign({color: w.color}, ctxFor(d.source)))); })
                    .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } box.innerHTML = '<div class="ch-muted ch-bi-empty">No disponible.</div>'; });
            });
        });
    }

    function manage(root, pins, refresh) {
        const today = ymd(new Date());
        ChUi.panel({title: 'Tableros de mi escritorio', icon: 'fas fa-thumbtack', mount: (body, close) => {
            const paint = () => {
                body.innerHTML = (pins.length ? '<div class="ch-hb-list">' + pins.map((p, i) => `<div class="ch-hb-row" data-id="${esc(p.id)}"><div><b>${esc(p.name)}</b><small>${esc(vig(p))}${active(p, today) ? '' : ' · <em>no se muestra hoy</em>'}</small></div>` +
                    `<span><button type="button" data-a="up" title="Subir" ${i ? '' : 'disabled'}><span class="fas fa-arrow-up"></span></button><button type="button" data-a="down" title="Bajar" ${i < pins.length - 1 ? '' : 'disabled'}><span class="fas fa-arrow-down"></span></button>` +
                    `<button type="button" data-a="edit" title="Cambiar fechas"><span class="far fa-calendar"></span></button><button type="button" data-a="rm" title="Quitar del escritorio"><span class="fas fa-trash"></span></button></span></div>`).join('') + '</div>' : '<p class="ch-muted">No tienes tableros fijados.</p>') +
                    '<p style="margin-top:12px"><button type="button" class="btn btn-default" data-a="add"><span class="fas fa-plus"></span> Añadir otro tablero</button> <a class="btn btn-link" href="#CrmHub/reportes" data-a="go">Crear un tablero nuevo</a></p>';
            };
            paint();
            const reload = () => Espo.Ajax.getRequest('CrmHub/biPins').then(r => { pins = r.pins || []; paint(); refresh(); });
            const onClick = e => {
                const b = e.target.closest('[data-a]'); if (!b) { return; } const row = b.closest('.ch-hb-row'), id = row && row.dataset.id, p = id && pins.find(x => x.id === id), k = b.dataset.a;
                if (k === 'go') { close(true); return; }
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
    function mount(host) {
        const token = (host._tok = (host._tok || 0) + 1);
        const go = () => Espo.Ajax.getRequest('CrmHub/biPins').then(async r => {
            if (host._tok !== token || !document.body.contains(host)) { return; }
            const pins = r.pins || [], today = ymd(new Date()), show = pins.filter(p => active(p, today));
            grids.forEach(g => { try { g.destroy(false); } catch (e) { /* ya no existe */ } }); grids = [];
            if (!pins.length) { host.dataset.state = 'none'; host.innerHTML = ''; return; }
            host.dataset.state = show.length ? 'some' : 'none';
            host.innerHTML = '<div class="ch-hb-top"><span><span class="fas fa-thumbtack"></span> Mis tableros</span><button type="button" class="btn btn-default btn-xs" data-a="manage"><span class="fas fa-sliders"></span> Administrar</button></div>' +
                show.map(p => `<section class="ch-hb" data-id="${esc(p.id)}"><div class="ch-hb-head"><h4>${esc(p.name)}</h4><small>${esc(vig(p))}</small><button type="button" class="ch-hb-x" data-a="edit" title="${p.mine ? 'Editar este tablero' : 'Abrir en Reportes y tableros'}"><span class="fas ${p.mine ? 'fa-pen' : 'fa-arrow-up-right-from-square'}"></span></button><button type="button" class="ch-hb-x" data-a="rm" title="Quitar de mi escritorio"><span class="fas fa-xmark"></span></button></div><div class="ch-hb-body"><div class="grid-stack"></div></div></section>`).join('') +
                (show.length ? '' : '<div class="ch-muted" style="padding:6px 2px">Ninguno de tus tableros fijados está vigente hoy.</div>');
            host.onclick = e => {
                const b = e.target.closest('[data-a]'); if (!b) { return; }
                if (b.dataset.a === 'manage') { manage(host, pins, go); }
                else if (b.dataset.a === 'edit') { const id = b.closest('.ch-hb').dataset.id, p = pins.find(x => x.id === id); try { sessionStorage.setItem('chBiOpen', JSON.stringify({id, edit: !!(p && p.mine)})); } catch (x) { /* nada */ } location.hash = '#CrmHub/reportes'; }
                else if (b.dataset.a === 'rm') { const id = b.closest('.ch-hb').dataset.id, p = pins.find(x => x.id === id); ChUi.confirm({title: 'Quitar del escritorio', ok: 'Quitar', html: `<b>${esc(p.name)}</b> dejará de verse en Inicio. El tablero no se elimina: sigue en «Reportes y tableros».`}).then(y => { if (y) { Espo.Ajax.postRequest('CrmHub/biUnpin', {id}).then(go); } }); }
            };
            if (!show.length) { return; }
            if (!meta) { try { meta = (await Espo.Ajax.getRequest('CrmHub/biItems')).sources || []; } catch (x) { meta = []; } }
            for (const p of show) {
                const wrap = host.querySelector(`.ch-hb[data-id="${p.id}"]`);
                Espo.Ajax.getRequest('CrmHub/biItem', {id: p.id}).then(it => { if (wrap && host._tok === token) { draw(wrap, p, it.def || {}, meta); } }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } if (wrap) { wrap.querySelector('.ch-hb-body').innerHTML = '<div class="ch-muted" style="padding:14px">No se pudo abrir este tablero.</div>'; } });
            }
        }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } host.dataset.state = 'none'; });
        go();
    }

    return {mount, pinDialog};
});
