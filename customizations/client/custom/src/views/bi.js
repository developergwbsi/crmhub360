/**
 * Reportes y tableros: cada usuario arma y guarda los suyos con los datos del CRM (los que su rol le deja ver) y de los formularios internos.
 * Reporte = origen + filtros + agrupar + medir + tipo de gráfica (tabla, barras, líneas, circular, indicador…). Tablero = reportes, textos e imágenes en una cuadrícula que se acomoda y se guarda.
 * Se pueden compartir con el equipo o con toda la empresa (solo lectura). Endpoints: GET CrmHub/biItems, GET biItem, POST biSave, POST biDelete y POST biRun.
 */
define('custom:views/bi', ['view', 'custom:ui', 'custom:bi-render', 'custom:studio', 'custom:bi-templates'], function (Dep, ChUi, R, Studio, TPL) {
    const esc = v => ChUi.esc(v == null ? '' : v);
    const uid = () => 'w' + Math.random().toString(36).slice(2, 9);
    const OPS = {
        enum: [['equals', 'es'], ['notEquals', 'no es'], ['in', 'es alguno de'], ['isNull', 'está vacío'], ['isNotNull', 'tiene valor']],
        varchar: [['contains', 'contiene'], ['equals', 'es igual a'], ['startsWith', 'empieza por'], ['isNull', 'está vacío'], ['isNotNull', 'tiene valor']],
        bool: [['isTrue', 'es Sí'], ['isFalse', 'es No']],
        num: [['greaterThan', 'es mayor que'], ['lessThan', 'es menor que'], ['equals', 'es igual a'], ['between', 'está entre'], ['isNull', 'está vacío'], ['isNotNull', 'tiene valor']],
        date: [['lastSevenDays', 'últimos 7 días'], ['lastXDays', 'últimos N días'], ['today', 'hoy'], ['currentMonth', 'este mes'], ['lastMonth', 'el mes pasado'], ['currentQuarter', 'este trimestre'], ['currentYear', 'este año'], ['lastYear', 'el año pasado'], ['between', 'entre fechas']],
        link: [['isNull', 'está vacío'], ['isNotNull', 'tiene valor']],
    };
    const BUCKETS = [['day', 'Por día'], ['week', 'Por semana'], ['month', 'Por mes'], ['year', 'Por año']];
    const SHARE = [['none', 'Solo yo'], ['team', 'Mi equipo'], ['all', 'Toda la empresa']];
    const opsOf = t => OPS[t] || (['int', 'float', 'currency'].includes(t) ? OPS.num : ['date', 'datetime'].includes(t) ? OPS.date : OPS.varchar);

    return class extends Dep {
        templateContent = '<div class="ch-bi"></div>'
        items = []
        sources = []
        cur = null
        canPublish = false
        reports = {}   // cache de definiciones de reportes para los tableros

        setup() { this.getHelper().pageTitle.setTitle('Reportes y tableros'); this.load(); }
        afterRender() { this.draw(); }
        onRemove() { this.destroyGrid(); Studio.detach(this); if (super.onRemove) { super.onRemove(); } }

        load(then) {
            Espo.Ajax.getRequest('CrmHub/biItems').then(r => { this.items = r.items || []; this.sources = r.sources || []; this.canPublish = !!r.canPublish; this.loaded = true; this.draw(); if (then) { then(); } })
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } this.loaded = 'error'; this.draw(); });
        }

        src(id) { return this.sources.find(s => s.id === id); }
        fld(sid, name) { const s = this.src(sid); return s && s.fields.find(f => f.name === name); }
        ctxFor(sid) { return {fieldLabel: n => (this.fld(sid, n) || {}).label || n || '', fieldType: n => (this.fld(sid, n) || {}).type || ''}; }

        // ---------- estructura general
        draw() {
            const root = this.el && this.el.querySelector('.ch-bi'); if (!root) { return; }
            if (!this.loaded) { root.innerHTML = '<div class="ch-muted" style="padding:24px">Cargando…</div>'; return; }
            if (this.loaded === 'error') { root.innerHTML = '<div class="ch-chat-err">No se pudieron cargar los reportes.</div>'; return; }
            const list = k => this.items.filter(i => i.kind === k).map(i => `<div class="ch-ifb-it ${this.cur && this.cur.id === i.id ? 'on' : ''}" data-open="${esc(i.id)}"><span class="fas ${k === 'dashboard' ? 'fa-table-cells-large' : 'fa-chart-column'}"></span><div><b>${esc(i.name)}</b><small>${i.mine ? (i.share === 'none' ? 'Solo yo' : i.share === 'team' ? 'Compartido con mi equipo' : 'Compartido con la empresa') : 'De ' + esc(i.ownerName)}</small></div></div>`).join('') || '<div class="ch-muted ch-small" style="padding:4px 2px">Aún no hay.</div>';
            root.innerHTML = `<div class="ch-studio"><div class="ch-studio-head"><div><h3><span class="fas fa-chart-pie"></span> Reportes y tableros</h3><p class="ch-muted">Arma tus propios reportes con los datos del CRM y de tus formularios: tablas, gráficas e indicadores. Júntalos en un tablero a tu gusto, guárdalo y compártelo con tu equipo.</p></div>
                <div class="ch-studio-act"><button class="btn btn-default btn-sm" data-a="newrep"><span class="fas fa-plus"></span> Nuevo reporte</button><button class="btn btn-primary btn-sm" data-a="newdash"><span class="fas fa-plus"></span> Nuevo tablero</button></div></div>
                <div class="ch-studio-body"><aside class="ch-studio-list"><h5 class="ch-bi-h5">Tableros</h5>${list('dashboard')}<h5 class="ch-bi-h5">Reportes</h5>${list('report')}</aside>
                <section class="ch-studio-main ch-bi-main">${this.cur ? (this.cur.kind === 'report' ? this.reportHtml() : this.dashHtml()) : this.homeHtml()}</section></div></div>`;
            Studio.attach(this, '.ch-studio');
            this.bind(root);
            if (this.cur) { this.cur.kind === 'report' ? this.afterReport(root) : this.afterDash(root); }
        }

        homeHtml() {
            return `<div class="ch-studio-content"><div class="ch-bi-home">${ChUi.empty({kind: 'box', title: 'Tu espacio de reportes', text: 'Crea un reporte (por ejemplo, leads por estado o cartera por asesor) y luego un tablero para verlos juntos. Todo queda guardado.', compact: false})}
                <div class="ch-ifb-row" style="justify-content:center"><button class="btn btn-primary" data-a="newdash"><span class="fas fa-table-cells-large"></span> Crear un tablero</button><button class="btn btn-default" data-a="newrep"><span class="fas fa-chart-column"></span> Crear un reporte</button></div></div></div>`;
        }

        // ---------- acciones comunes
        shareSel(disabled) { return `<select class="form-control input-sm ch-bi-share" data-c="share" ${disabled ? 'disabled' : ''}>${SHARE.filter(s => s[0] !== 'all' || this.canPublish).map(([k, l]) => `<option value="${k}" ${this.cur.share === k ? 'selected' : ''}>Compartir: ${l}</option>`).join('')}</select>`; }

        save() {
            const c = this.cur;
            return Espo.Ajax.postRequest('CrmHub/biSave', {id: c.id, kind: c.kind, name: c.name, definition: c.def, share: c.share}).then(r => {
                c.id = r.id; c.dirty = false; c.editing = false; Espo.Ui.success('Guardado'); this.load(() => { this.cur = c; this.draw(); });
            }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error((xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason')) || 'No se pudo guardar'); });
        }

        open(id) {
            if (this.cur && this.cur.dirty && !this._okDiscard) { ChUi.confirm({title: 'Cambios sin guardar', text: 'Hay cambios sin guardar. ¿Descartarlos y abrir otro?', ok: 'Descartar', cancel: 'Seguir editando'}).then(y => { if (y) { this._okDiscard = true; this.open(id); } }); return; }
            this._okDiscard = false;
            Espo.Ajax.getRequest('CrmHub/biItem', {id}).then(r => { this.cur = Object.assign({}, r, {dirty: false, editing: false}); this.draw(); })
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('No se pudo abrir.'); });
        }

        removeItem() {
            ChUi.confirm({title: 'Eliminar', text: `Se elimina «${this.cur.name}» para siempre.`, ok: 'Eliminar', danger: true}).then(y => {
                if (!y) { return; }
                if (!this.cur.id) { this.cur = null; this.draw(); return; }
                Espo.Ajax.postRequest('CrmHub/biDelete', {id: this.cur.id}).then(() => { this.cur = null; this.load(); }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('No se pudo eliminar.'); });
            });
        }

        newReport() {
            const s = this.sources[0]; if (!s) { Espo.Ui.warning('No tienes datos disponibles para reportes.'); return; }
            this.cur = {kind: 'report', id: null, name: 'Nuevo reporte', share: 'none', mine: true, dirty: true, editing: true, def: {source: s.id, filters: [], groups: [], measures: [{fn: 'count'}], chart: 'bar', limit: 50}};
            this.draw();
        }

        newDash() {
            const blank = () => { this.cur = {kind: 'dashboard', id: null, name: 'Nuevo tablero', share: 'none', mine: true, dirty: true, editing: true, def: {widgets: []}}; this.draw(); };
            ChUi.panel({title: 'Nuevo tablero: ¿con qué empiezas?', icon: 'fas fa-table-cells-large', close: 'Cancelar', mount: (body, close) => {
                body.classList.add('ch-tpl-body');
                body.innerHTML = '<p class="ch-muted">Elige un tablero ya armado (con gráficas, tablas e indicadores) y ajústalo: cambia colores y títulos, quita tarjetas o añade más. O empieza en blanco.</p><div class="ch-tpl-grid">' +
                    `<div class="ch-tpl" data-t=""><div class="ic"><span class="far fa-square-plus"></span></div><b>En blanco</b><small>Tú decides qué mostrar.</small></div>` + TPL.list.map(t => `<div class="ch-tpl" data-t="${esc(t.id)}"><div class="ic" style="background:${esc(t.color)}1f;color:${esc(t.color)}"><span class="${esc(t.icon)}"></span></div><b>${esc(t.name)}</b><small>${esc(t.desc)}</small><div class="ch-tpl-meta">${t.reports.length} reportes · ${t.widgets.length} tarjetas</div></div>`).join('') + '</div>';
                body.onclick = e => { const c = e.target.closest('[data-t]'); if (!c) { return; } close(true); if (!c.dataset.t) { blank(); } else { this.fromTemplate(TPL.list.find(t => t.id === c.dataset.t)); } };
            }});
        }

        // crea los reportes de la plantilla (quedan guardados como del usuario) y el tablero con sus tarjetas, listo para ajustar
        fromTemplate(t) {
            Espo.Ui.notify('Armando tu tablero…');
            const ids = [];
            const next = i => {
                if (i >= t.reports.length) { return Promise.resolve(); }
                const r = t.reports[i];
                return Espo.Ajax.postRequest('CrmHub/biSave', {kind: 'report', name: r.name, share: 'none', definition: r.def}).then(x => { ids[i] = x.id; return next(i + 1); });
            };
            next(0).then(() => {
                const widgets = t.widgets.map(w => Object.assign({id: uid()}, w.type === 'report' ? {type: 'report', reportId: ids[w.rep], title: w.title, color: w.color, chart: w.chart} : {type: w.type, text: w.text, size: w.size, align: w.align}, {x: w.x, y: w.y, w: w.w, h: w.h}));
                Espo.Ui.notify(false);
                this.load(() => { this.cur = {kind: 'dashboard', id: null, name: t.name, share: 'none', mine: true, dirty: true, editing: true, def: {widgets}}; this.draw(); Espo.Ui.success('Tablero listo: ajústalo y guárdalo.'); });
            }).catch(xhr => { Espo.Ui.notify(false); if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('No se pudo armar el tablero.'); });
        }

        bind(root) {
            root.onclick = e => {
                const o = e.target.closest('[data-open]'); if (o) { this.open(o.dataset.open); return; }
                const a = e.target.closest('[data-a]'); if (!a) { return; }
                const k = a.dataset.a;
                if (k === 'newrep') { this.newReport(); } else if (k === 'newdash') { this.newDash(); }
                else if (k === 'save') { this.save(); }
                else if (k === 'del') { this.removeItem(); }
                else if (k === 'edit') { this.cur.editing = true; this.draw(); }
                else if (k === 'cancel') { if (!this.cur.id) { this.cur = null; this.draw(); } else if (this.cur.dirty) { this.cur.dirty = false; this.open(this.cur.id); } else { this.cur.editing = false; this.draw(); } }
                else if (k === 'dup') { this.cur = Object.assign({}, this.cur, {id: null, name: this.cur.name + ' (copia)', mine: true, share: 'none', dirty: true, editing: true, def: JSON.parse(JSON.stringify(this.cur.def))}); this.draw(); }
                else if (k === 'refresh') { this.cur.kind === 'report' ? this.preview() : this.refreshDash(); }
                else { this.onAction(k, a, e); }
            };
            root.onchange = root.oninput = e => this.onChange(e);
        }

        onChange(e) {
            const t = e.target, c = this.cur; if (!c) { return; }
            if (t.dataset.c === 'name') { c.name = t.value; c.dirty = true; return; }
            if (t.dataset.c === 'share') { c.share = t.value; c.dirty = true; return; }
            if (c.kind === 'report' && t.dataset.p) { this.setPath(c.def, t.dataset.p, t.type === 'checkbox' ? t.checked : t.type === 'number' ? (t.value === '' ? '' : +t.value) : t.value); c.dirty = true; if (t.hasAttribute('data-redraw') && e.type === 'change') { this.draw(); } else { this.previewSoon(); } }
        }

        setPath(o, path, v) {
            const ks = path.split('.'); for (let i = 0; i < ks.length - 1; i++) { o = o[isNaN(ks[i]) ? ks[i] : +ks[i]]; if (o == null) { return; } }
            const k = ks[ks.length - 1]; o[isNaN(k) ? k : +k] = v;
        }

        previewSoon() { clearTimeout(this._pt); this._pt = setTimeout(() => this.preview(), 600); }

        // ---------- constructor de reportes
        reportHtml() {
            const c = this.cur, d = c.def, ro = !c.mine || !c.editing, s = this.src(d.source) || {fields: []}, dis = ro ? 'disabled' : '';
            const F = (types, sel, attr, empty) => `<select class="form-control input-sm" ${attr} ${dis} data-redraw>${empty ? `<option value="">${esc(empty)}</option>` : ''}${s.fields.filter(f => !types || types.includes(f.type)).map(f => `<option value="${esc(f.name)}" ${f.name === sel ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}</select>`;
            const filters = (d.filters || []).map((f, i) => { const fd = this.fld(d.source, f.field) || {}, ops = opsOf(fd.type), p = `filters.${i}.`; const need = !['isNull', 'isNotNull', 'isTrue', 'isFalse', 'today', 'lastSevenDays', 'currentMonth', 'lastMonth', 'currentYear', 'lastYear', 'currentQuarter'].includes(f.op);
                let val = ''; if (need) { if (f.op === 'between') { const v = Array.isArray(f.value) ? f.value : String(f.value || ',').split(','); val = `<input class="form-control input-sm" ${['date', 'datetime'].includes(fd.type) ? 'type="date"' : ''} data-bf="${i}:0" value="${esc(v[0] || '')}" ${dis}><input class="form-control input-sm" ${['date', 'datetime'].includes(fd.type) ? 'type="date"' : ''} data-bf="${i}:1" value="${esc(v[1] || '')}" ${dis}>`; } else if (fd.type === 'enum' && fd.options && fd.options.length && ['equals', 'notEquals'].includes(f.op)) { val = `<select class="form-control input-sm" data-p="${p}value" ${dis}>${fd.options.map(o => `<option ${o === f.value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`; } else { val = `<input class="form-control input-sm" data-p="${p}value" value="${esc(Array.isArray(f.value) ? f.value.join(', ') : f.value)}" placeholder="${f.op === 'in' ? 'valor1, valor2' : f.op === 'lastXDays' ? 'Número de días' : 'Valor'}" ${dis}>`; } }
                return `<div class="ch-ifb-row">${F(null, f.field, `data-p="${p}field"`)}<select class="form-control input-sm" data-p="${p}op" ${dis} data-redraw>${ops.map(([k, l]) => `<option value="${k}" ${k === f.op ? 'selected' : ''}>${l}</option>`).join('')}</select>${val}${ro ? '' : `<a data-a="delf" data-i="${i}"><span class="far fa-trash-can"></span></a>`}</div>`; }).join('');
            const g1 = (d.groups || [])[0], g2 = (d.groups || [])[1];
            const bucket = (g, i) => g && ['date', 'datetime'].includes((this.fld(d.source, g.field) || {}).type) ? `<select class="form-control input-sm" data-p="groups.${i}.bucket" ${dis}>${BUCKETS.map(([k, l]) => `<option value="${k}" ${(g.bucket || 'month') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>` : '';
            const ms = (d.measures || []).map((m, i) => `<div class="ch-ifb-row"><select class="form-control input-sm" data-p="measures.${i}.fn" ${dis} data-redraw>${R.FNS.map(([k, l]) => `<option value="${k}" ${k === m.fn ? 'selected' : ''}>${l}</option>`).join('')}</select>${m.fn === 'count' ? '' : F(['int', 'float', 'currency'], m.field, `data-p="measures.${i}.field"`, 'Campo…')}<input class="form-control input-sm" data-p="measures.${i}.label" value="${esc(m.label || '')}" placeholder="Nombre en el reporte (opcional)" ${dis}>${ro || (d.measures || []).length < 2 ? '' : `<a data-a="delm" data-i="${i}"><span class="far fa-trash-can"></span></a>`}</div>`).join('');
            return `<div class="ch-bi-bar"><input class="form-control input-sm ch-bi-name" data-c="name" value="${esc(c.name)}" ${c.mine && c.editing ? '' : 'disabled'} placeholder="Nombre del reporte">${c.mine ? this.shareSel(!c.editing) : `<span class="ch-muted">De ${esc(c.ownerName)}</span>`}
                <span class="ch-bi-btns">${c.mine ? (c.editing ? '<button class="btn btn-default btn-sm" data-a="cancel">Cancelar</button><button class="btn btn-primary btn-sm" data-a="save"><span class="fas fa-floppy-disk"></span> Guardar</button>' : '<button class="btn btn-default btn-sm" data-a="edit"><span class="fas fa-pen"></span> Editar</button>') + (c.id ? '<button class="btn btn-default btn-sm" data-a="del" title="Eliminar"><span class="far fa-trash-can"></span></button>' : '') : ''}<button class="btn btn-default btn-sm" data-a="dup" title="Hacer una copia propia"><span class="far fa-copy"></span></button><button class="btn btn-default btn-sm" data-a="refresh" title="Actualizar"><span class="fas fa-rotate"></span></button></span></div>
                <div class="ch-bi-split"><div class="ch-bi-cfg">
                <div class="ch-sim-card"><h4>1 · Datos</h4><select class="form-control input-sm" data-p="source" ${dis} data-redraw>${this.sources.map(x => `<option value="${esc(x.id)}" ${x.id === d.source ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></div>
                <div class="ch-sim-card"><h4>2 · Filtros</h4>${filters || '<div class="ch-muted">Sin filtros: usa todos los datos que puedes ver.</div>'}${ro ? '' : '<button class="btn btn-default btn-xs" data-a="addf"><span class="fas fa-plus"></span> Añadir filtro</button>'}</div>
                <div class="ch-sim-card"><h4>3 · Agrupar</h4><div class="ch-ifb-row">${F(['enum', 'varchar', 'bool', 'date', 'datetime', 'link', 'int'], g1 && g1.field, 'data-gp="0"', 'Sin agrupar (una sola cifra)')}${bucket(g1, 0)}</div>
                ${g1 ? `<div class="ch-ifb-row">${F(['enum', 'varchar', 'bool', 'date', 'datetime', 'link', 'int'], g2 && g2.field, 'data-gp="1"', 'Dividir además por… (opcional)')}${bucket(g2, 1)}</div>` : ''}</div>
                <div class="ch-sim-card"><h4>4 · Medir</h4>${ms}${ro ? '' : '<button class="btn btn-default btn-xs" data-a="addm"><span class="fas fa-plus"></span> Añadir otra medida</button>'}</div>
                <div class="ch-sim-card"><h4>5 · Cómo verlo</h4><div class="ch-bi-types">${R.CHARTS.map(([k, l]) => `<button type="button" class="${d.chart === k ? 'on' : ''}" data-a="chart" data-k="${k}" ${dis}>${l}</button>`).join('')}</div><label class="ch-ifb-ck">Máximo de filas <input type="number" min="1" max="1000" class="form-control input-sm" style="width:90px;display:inline-block" data-p="limit" value="${esc(d.limit || 50)}" ${dis}></label></div></div>
                <div class="ch-bi-prev"><div class="ch-bi-prevhead">Vista previa</div><div class="ch-bi-view" data-view></div></div></div>`;
        }

        afterReport(root) {
            root.querySelectorAll('[data-gp]').forEach(sel => { sel.onchange = e => { e.stopPropagation(); const i = +sel.dataset.gp, c = this.cur.def; c.groups = c.groups || []; if (!sel.value) { c.groups.splice(i); } else { const t = (this.fld(c.source, sel.value) || {}).type; c.groups[i] = {field: sel.value, bucket: ['date', 'datetime'].includes(t) ? 'month' : undefined}; } this.cur.dirty = true; this.draw(); }; });
            root.querySelectorAll('[data-bf]').forEach(inp => { inp.oninput = inp.onchange = e => { e.stopPropagation(); const [i, k] = inp.dataset.bf.split(':'), f = this.cur.def.filters[+i]; const v = Array.isArray(f.value) ? f.value : ['', '']; v[+k] = inp.value; f.value = v; this.cur.dirty = true; this.previewSoon(); }; });
            this.preview();
        }

        onAction(k, a) {
            const c = this.cur; if (!c || c.kind !== 'report') { return this.onDashAction(k, a); }
            const d = c.def;
            if (k === 'addf') { const f = (this.src(d.source).fields.find(x => x.type !== 'id') || {}); d.filters.push({field: f.name, op: opsOf(f.type)[0][0], value: ''}); }
            else if (k === 'delf') { d.filters.splice(+a.dataset.i, 1); }
            else if (k === 'addm') { d.measures.push({fn: 'sum', field: ((this.src(d.source).fields.find(x => ['int', 'float', 'currency'].includes(x.type))) || {}).name || ''}); }
            else if (k === 'delm') { d.measures.splice(+a.dataset.i, 1); }
            else if (k === 'chart') { d.chart = a.dataset.k; }
            else { return; }
            c.dirty = true; this.draw();
        }

        // pide los datos y dibuja la vista previa
        runDef(def) {
            const clean = {source: def.source, filters: (def.filters || []).filter(f => f.field && f.op), groups: (def.groups || []).filter(g => g.field), measures: (def.measures || []).filter(m => m.fn === 'count' || m.field), limit: def.limit || 50};
            return Espo.Ajax.postRequest('CrmHub/biRun', clean);
        }

        preview() {
            const el = this.el && this.el.querySelector('[data-view]'); if (!el || !this.cur) { return; }
            const def = this.cur.def; el.innerHTML = '<div class="ch-muted ch-bi-empty">Calculando…</div>';
            this.runDef(def).then(r => R.draw(el, def, r, Object.assign({preview: true}, this.ctxFor(def.source)))).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } el.innerHTML = '<div class="ch-chat-err">' + esc((xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason')) || 'No se pudo calcular el reporte.') + '</div>'; });
        }

        // ---------- tableros
        dashHtml() {
            const c = this.cur, ed = c.mine && c.editing;
            return `<div class="ch-bi-bar"><input class="form-control input-sm ch-bi-name" data-c="name" value="${esc(c.name)}" ${ed ? '' : 'disabled'} placeholder="Nombre del tablero">${c.mine ? this.shareSel(!ed) : `<span class="ch-muted">De ${esc(c.ownerName)}</span>`}
                <span class="ch-bi-btns">${ed ? '<button class="btn btn-default btn-sm" data-a="addrepw"><span class="fas fa-chart-column"></span> Reporte</button><button class="btn btn-default btn-sm" data-a="addtext"><span class="fas fa-font"></span> Texto</button><button class="btn btn-default btn-sm" data-a="addimg"><span class="far fa-image"></span> Imagen</button><button class="btn btn-default btn-sm" data-a="cancel">Cancelar</button><button class="btn btn-primary btn-sm" data-a="save"><span class="fas fa-floppy-disk"></span> Guardar</button>' : (c.mine ? '<button class="btn btn-default btn-sm" data-a="edit"><span class="fas fa-pen"></span> Editar tablero</button><button class="btn btn-default btn-sm" data-a="del" title="Eliminar"><span class="far fa-trash-can"></span></button>' : '<button class="btn btn-default btn-sm" data-a="dup" title="Hacer una copia propia"><span class="far fa-copy"></span> Copiar</button>')}<button class="btn btn-default btn-sm" data-a="refresh" title="Actualizar"><span class="fas fa-rotate"></span></button></span></div>
                <div class="ch-bi-canvas ${ed ? 'editing' : ''}"><div class="grid-stack"></div>${(c.def.widgets || []).length ? '' : `<div class="ch-bi-emptyd">${ed ? 'Añade reportes, textos o imágenes con los botones de arriba y acomódalos arrastrando.' : 'Este tablero está vacío.'}</div>`}</div>`;
        }

        destroyGrid() { if (this.grid) { try { this.grid.destroy(false); } catch (e) { /* ya no existe */ } this.grid = null; } }

        afterDash(root) {
            this.destroyGrid();
            const c = this.cur, el = root.querySelector('.grid-stack'), ed = c.mine && c.editing;
            R.loadLibs(true).then(() => {
                if (!this.el || !this.el.contains(el) || this.cur !== c) { return; }
                this.grid = window.GridStack.init({column: 12, cellHeight: 76, margin: 12, float: false, disableDrag: !ed, disableResize: !ed, handle: '.ch-w-head', animate: true}, el);
                (c.def.widgets || []).forEach(w => this.grid.addWidget({id: w.id, x: w.x, y: w.y, w: w.w || 4, h: w.h || 4, minW: 2, minH: w.type === 'text' ? 1 : 2, content: this.widgetShell(w, ed)}));
                this.grid.on('change', () => { c.def.widgets.forEach(w => { const n = this.grid.engine.nodes.find(x => x.id === w.id); if (n) { w.x = n.x; w.y = n.y; w.w = n.w; w.h = n.h; } }); c.dirty = true; });
                (c.def.widgets || []).forEach(w => this.fillWidget(w));
            });
        }

        widgetShell(w, ed) {
            const tools = ed ? `<span class="ch-w-tools"><a data-a="wcfg" data-id="${esc(w.id)}" title="Configurar"><span class="fas fa-gear"></span></a><a data-a="wdel" data-id="${esc(w.id)}" title="Quitar"><span class="fas fa-xmark"></span></a></span>` : '';
            return `<div class="ch-w ch-w-${w.type}" data-w="${esc(w.id)}" ${w.color ? `style="border-top:3px solid ${esc(w.color)}"` : ''}><div class="ch-w-head"><b data-wt>${esc(w.title || (w.type === 'report' ? 'Reporte' : ''))}</b>${tools}</div><div class="ch-w-body" data-wb></div></div>`;
        }

        fillWidget(w) {
            const box = this.el && this.el.querySelector(`[data-w="${w.id}"] [data-wb]`); if (!box) { return; }
            if (w.type === 'text') { box.innerHTML = `<div class="ch-w-text" style="font-size:${esc(w.size || 16)}px;text-align:${esc(w.align || 'left')}">${esc(w.text || '').replace(/\n/g, '<br>')}</div>`; return; }
            if (w.type === 'image') { box.innerHTML = w.url ? `<img class="ch-w-img" src="${esc(w.url)}" alt="" referrerpolicy="no-referrer">` : '<div class="ch-muted ch-bi-empty">Sin imagen</div>'; return; }
            if (!w.reportId) { box.innerHTML = '<div class="ch-muted ch-bi-empty">Elige un reporte</div>'; return; }
            box.innerHTML = '<div class="ch-muted ch-bi-empty">Calculando…</div>';
            const get = this.reports[w.reportId] ? Promise.resolve(this.reports[w.reportId]) : Espo.Ajax.getRequest('CrmHub/biItem', {id: w.reportId}).then(r => (this.reports[w.reportId] = r));
            get.then(rep => { const t = this.el.querySelector(`[data-w="${w.id}"] [data-wt]`); if (t && !w.title) { t.textContent = rep.name; } const def = Object.assign({}, rep.def, w.chart ? {chart: w.chart} : {}); return this.runDef(def).then(res => R.draw(box, def, res, Object.assign({color: w.color}, this.ctxFor(def.source)))); })
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } box.innerHTML = '<div class="ch-muted ch-bi-empty">No disponible (¿se eliminó o ya no tienes acceso?).</div>'; });
        }

        refreshDash() { this.reports = {}; (this.cur.def.widgets || []).forEach(w => this.fillWidget(w)); }

        addWidget(w) { const c = this.cur; w.id = uid(); w.x = (w.w || 4) >= 12 ? 0 : (((c.def.widgets || []).filter(x => x.type === 'report').length % 2) * 6); w.y = 999; c.def.widgets = c.def.widgets || []; c.def.widgets.push(w); c.dirty = true; this.draw(); }

        onDashAction(k, a) {
            const c = this.cur, ws = c.def.widgets || [];
            if (k === 'addrepw') { const reps = this.items.filter(i => i.kind === 'report'); if (!reps.length) { Espo.Ui.warning('Primero crea un reporte.'); return; }
                ChUi.panel({title: 'Añadir un reporte al tablero', icon: 'fas fa-chart-column', close: 'Cancelar', mount: (body, close) => { body.innerHTML = reps.map(r => `<div class="ch-fp-card" data-id="${esc(r.id)}"><span class="fas fa-chart-column"></span><div><b>${esc(r.name)}</b><small>${r.mine ? 'Mío' : 'De ' + esc(r.ownerName)}</small></div></div>`).join(''); body.onclick = e => { const x = e.target.closest('[data-id]'); if (x) { close(true); this.addWidget({type: 'report', reportId: x.dataset.id, w: 6, h: 5}); } }; }}); }
            else if (k === 'addtext') { this.addWidget({type: 'text', text: 'Escribe aquí un título o una nota', size: 20, align: 'left', w: 12, h: 1}); }
            else if (k === 'addimg') { this.imageDialog({type: 'image', w: 4, h: 3}, true); }
            else if (k === 'wdel') { c.def.widgets = ws.filter(w => w.id !== a.dataset.id); c.dirty = true; this.draw(); }
            else if (k === 'wcfg') { const w = ws.find(x => x.id === a.dataset.id); if (!w) { return; } if (w.type === 'text') { this.textDialog(w); } else if (w.type === 'image') { this.imageDialog(w, false); } else { this.titleDialog(w); } }
        }

        textDialog(w) {
            ChUi.panel({title: 'Texto', icon: 'fas fa-font', close: 'Listo', mount: body => { body.innerHTML = `<textarea class="form-control" rows="4" data-t>${esc(w.text)}</textarea><div class="ch-ifb-row" style="margin-top:8px"><label class="ch-ifb-ck">Tamaño <input type="number" min="10" max="64" class="form-control input-sm" style="width:80px;display:inline-block" data-s value="${esc(w.size || 16)}"></label><select class="form-control input-sm" data-al><option value="left" ${w.align !== 'center' && w.align !== 'right' ? 'selected' : ''}>Izquierda</option><option value="center" ${w.align === 'center' ? 'selected' : ''}>Centro</option><option value="right" ${w.align === 'right' ? 'selected' : ''}>Derecha</option></select></div>`;
                body.oninput = body.onchange = () => { w.text = body.querySelector('[data-t]').value; w.size = +body.querySelector('[data-s]').value || 16; w.align = body.querySelector('[data-al]').value; this.cur.dirty = true; }; }}).then(() => this.fillWidget(w));
        }

        // título, color y tipo de gráfica de una tarjeta de reporte
        titleDialog(w) {
            const sw = R.PALETTE.map(c => `<button type="button" class="ch-sw ${w.color === c ? 'on' : ''}" data-col="${c}" style="background:${c}" title="${c}"></button>`).join('');
            ChUi.panel({title: 'Configurar la tarjeta', icon: 'fas fa-gear', close: 'Listo', mount: body => {
                body.innerHTML = `<label class="ch-dlg-label">Título</label><input class="form-control" data-t value="${esc(w.title || '')}" placeholder="Por defecto, el nombre del reporte">
                    <label class="ch-dlg-label" style="margin-top:10px">Color</label><div class="ch-sws">${sw}<button type="button" class="ch-sw none ${!w.color ? 'on' : ''}" data-col="" title="Automático">A</button><input type="color" data-cc value="${esc(w.color || '#4f63e8')}" title="Otro color"></div>
                    <label class="ch-dlg-label" style="margin-top:10px">Cómo verlo</label><select class="form-control" data-ch><option value="">Como está en el reporte</option>${R.CHARTS.map(([k, l]) => `<option value="${k}" ${w.chart === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
                body.oninput = body.onchange = e => { w.title = body.querySelector('[data-t]').value; w.chart = body.querySelector('[data-ch]').value || undefined; if (e.target.dataset.cc !== undefined) { w.color = e.target.value; } this.cur.dirty = true; };
                body.onclick = e => { const c = e.target.closest('[data-col]'); if (!c) { return; } w.color = c.dataset.col || undefined; body.querySelectorAll('.ch-sw').forEach(x => x.classList.toggle('on', x === c)); this.cur.dirty = true; };
            }}).then(() => { this.draw(); });
        }

        imageDialog(w, isNew) {
            ChUi.panel({title: 'Imagen', icon: 'far fa-image', close: 'Listo', mount: body => { body.innerHTML = `<input class="form-control" data-u value="${esc(w.url || '')}" placeholder="Dirección de la imagen (https://…)"><div class="ch-muted" style="margin:8px 0">o sube un archivo:</div><input type="file" accept="image/*" data-f><div class="ch-muted" data-m></div>`;
                body.querySelector('[data-u]').oninput = e => { w.url = e.target.value.trim(); this.cur.dirty = true; };
                body.querySelector('[data-f]').onchange = e => { const f = e.target.files[0]; if (!f) { return; } if (f.size > 3 * 1024 * 1024) { body.querySelector('[data-m]').textContent = 'La imagen pesa más de 3 MB.'; return; } const fr = new FileReader(); fr.onload = () => { body.querySelector('[data-m]').textContent = 'Subiendo…'; Espo.Ajax.postRequest('Attachment', {name: f.name, type: f.type, size: f.size, role: 'Attachment', relatedType: 'Note', field: 'attachments', file: fr.result}).then(r => { w.url = '?entryPoint=image&id=' + r.id; body.querySelector('[data-u]').value = w.url; body.querySelector('[data-m]').textContent = 'Lista.'; this.cur.dirty = true; }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } body.querySelector('[data-m]').textContent = 'No se pudo subir.'; }); }; fr.readAsDataURL(f); }; }})
                .then(() => { if (isNew) { this.addWidget(w); } else { this.fillWidget(w); } });
        }
    };
});
