/**
 * Formularios internos (gerente, director o supervisor): se diseñan los formularios de gestión de la empresa —campos, etapas donde se ven, dónde aparecen
 * (pestaña de la ficha o botón «Llenar formulario») y qué acciones lanzan (PDF, cambiar estado, tarea, enviar al cliente, copiar a campos del lead)—.
 * Endpoints: GET CrmHub/iforms?all=1 y POST CrmHub/iformsSave. Ruta #CrmHub/formularios.
 */
define('custom:views/iforms', ['view', 'custom:ui', 'custom:studio'], function (Dep, ChUi, Studio) {
    const esc = v => ChUi.esc(v == null ? '' : v);
    const LEAD_LABEL = {creditScore: 'Puntaje de crédito', totalDebt: 'Deuda total', overdueDebt: 'Deuda en mora', monthlyIncome: 'Ingresos mensuales', creditorCount: 'Cantidad de acreedores',
        maxDaysOverdue: 'Máx. días de mora', defaultCount: 'Obligaciones castigadas', identificationType: 'Tipo de documento', identification: 'Identificación', processResult: 'Resultado de proceso',
        description: 'Descripción (se agrega)', creditSummary: 'Resumen de crédito', defaultHistory: 'Historial de castigos', status: 'Estado del lead'};
    const slug = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'campo';
    const NEW_FORM = () => ({id: '', name: 'Nuevo formulario', description: '', active: true, stages: [], tab: true, button: true, multiple: false,
        fields: [{key: '', label: 'Observaciones', type: 'textarea', required: false, options: [], help: '', width: 'full'}], actions: []});
    const SAMPLE = () => ({id: '', name: 'Visita de verificación', description: 'Datos que se capturan en la visita al cliente.', active: true, stages: [], tab: true, button: true, multiple: false,
        fields: [{key: '', label: 'Datos del cliente', type: 'heading', required: false, options: [], help: '', width: 'full'},
            {key: '', label: 'Dirección verificada', type: 'text', required: true, options: [], help: '', width: 'full'}, {key: '', label: 'Fecha de la visita', type: 'date', required: true, options: [], help: '', width: 'half'},
            {key: '', label: 'Ingreso mensual confirmado', type: 'money', required: false, options: [], help: '', width: 'half'},
            {key: '', label: 'Resultado', type: 'select', required: true, options: ['Favorable', 'Pendiente de documentos', 'No favorable'], help: '', width: 'half'},
            {key: '', label: 'Observaciones', type: 'textarea', required: false, options: [], help: '', width: 'full'}],
        actions: [{id: '', label: 'Generar PDF del informe', type: 'pdf', when: 'button', onlyComplete: true, config: {title: 'Informe de visita', footer: '', fields: [], showLead: true}}]});

    return class extends Dep {
        templateContent = '<div class="ch-ifb"></div>'
        data0 = null
        sel = 0
        stages = []
        webSources = []
        dirty = false
        tab = 'general'

        setup() {
            this.getHelper().pageTitle.setTitle('Formularios internos');
            this.stages = (this.getMetadata().get('entityDefs.Lead.fields.status.options') || []).filter(Boolean);
            Espo.Ajax.getRequest('CrmHub/webSources', {all: 1}).then(w => { this.webSources = w.sources || []; }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } });
            Espo.Ajax.getRequest('CrmHub/iforms', {all: 1}).then(r => { this.data0 = r; this.forms = JSON.parse(JSON.stringify(r.forms || [])); this.draw(); })
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } this.data0 = {error: true}; this.draw(); });
        }

        afterRender() { this.draw(); }

        onRemove() { Studio.detach(this); if (super.onRemove) { super.onRemove(); } }

        draw() {
            const root = this.el && this.el.querySelector('.ch-ifb'); if (!root) { return; }
            const d = this.data0;
            if (!d) { root.innerHTML = '<div class="ch-muted" style="padding:24px">Cargando…</div>'; return; }
            if (d.error) { root.innerHTML = '<div class="ch-chat-err">No se pudieron cargar los formularios.</div>'; return; }
            if (!d.canManage) { root.innerHTML = '<div class="ch-chat-err">Solo gerentes, directores y supervisores pueden diseñar formularios.</div>'; return; }
            const list = this.forms.map((f, i) => `<div class="ch-ifb-it ${i === this.sel ? 'on' : ''}" data-sel="${i}"><span class="fas fa-clipboard-list"></span><div><b>${esc(f.name)}</b><small>${f.active ? '' : 'Inactivo · '}${f.fields.filter(x => x.type !== 'heading').length} campos · ${(f.actions || []).length} acciones</small></div></div>`).join('');
            const cur = this.forms[this.sel], secs = cur ? this.editor(cur) : null;
            const tabs = [['general', 'General'], ['where', 'Dónde se ve'], ['fields', 'Campos' + (cur ? ` (${cur.fields.filter(x => x.type !== 'heading').length})` : '')], ['actions', 'Acciones' + (cur ? ` (${(cur.actions || []).length})` : '')]];
            if (!tabs.some(t => t[0] === this.tab)) { this.tab = 'general'; }
            const keep = root.querySelector('.ch-studio-content'), top = keep ? keep.scrollTop : 0;
            root.innerHTML = `<div class="ch-studio"><div class="ch-studio-head"><div><h3><span class="fas fa-clipboard-list"></span> Formularios internos</h3><p class="ch-muted">Los formularios que tu equipo llena en la gestión de cada lead: en qué etapas se ven, dónde aparecen y qué hacen al guardarse (por ejemplo, generar un PDF).</p></div>
                <div class="ch-studio-act">${this.dirty ? '<span class="ch-studio-dirty"><span class="fas fa-circle"></span> Cambios sin guardar</span>' : ''}<button class="btn btn-default btn-sm" data-a="sample" title="Un ejemplo ya armado para ajustar">Usar ejemplo</button><button class="btn btn-default btn-sm" data-a="new"><span class="fas fa-plus"></span> Nuevo formulario</button><button class="btn btn-primary btn-sm" data-a="save" ${this.forms.length || this.data0.forms.length ? '' : 'disabled'}><span class="fas fa-floppy-disk"></span> Guardar todo</button></div></div>
                <div class="ch-studio-body"><aside class="ch-studio-list">${list || ChUi.empty({kind: 'doc', title: 'Sin formularios', text: 'Crea el primero.', compact: true})}</aside>
                <section class="ch-studio-main">${cur ? `<div class="ch-studio-tabs">${tabs.map(([k, l]) => `<button type="button" data-tab="${k}" class="${k === this.tab ? 'on' : ''}">${l}</button>`).join('')}</div><div class="ch-studio-content">${secs[this.tab]}</div>` : '<div class="ch-studio-content ch-muted">Crea un formulario para empezar.</div>'}</section></div></div>`;
            const c2 = root.querySelector('.ch-studio-content'); if (c2) { c2.scrollTop = top; }
            Studio.attach(this, '.ch-studio');
            this.bind(root);
        }

        opt(list, cur) { return list.map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join(''); }

        editor(f) {
            const FT = Object.entries(this.data0.fieldTypes), keys = f.fields.filter(x => x.type !== 'heading');
            const stageChecks = this.stages.map(s => `<label><input type="checkbox" data-st="${esc(s)}" ${f.stages.includes(s) ? 'checked' : ''}> ${esc(s)}</label>`).join('');
            const fields = f.fields.map((x, i) => `<div class="ch-ifb-fld"><div class="ch-ifb-row">
                <input class="form-control input-sm" data-b="fields.${i}.label" value="${esc(x.label)}" placeholder="Nombre del campo">
                <select class="form-control input-sm" data-b="fields.${i}.type" data-redraw>${this.opt(FT, x.type)}</select>
                ${x.type !== 'heading' ? `<label class="ch-ifb-ck"><input type="checkbox" data-b="fields.${i}.required" ${x.required ? 'checked' : ''}> Obligatorio</label>
                <select class="form-control input-sm" data-b="fields.${i}.width"><option value="full" ${x.width !== 'half' ? 'selected' : ''}>Ancho completo</option><option value="half" ${x.width === 'half' ? 'selected' : ''}>Media columna</option></select>` : ''}
                <a data-mv="${i}:-1" title="Subir"><span class="fas fa-arrow-up"></span></a><a data-mv="${i}:1" title="Bajar"><span class="fas fa-arrow-down"></span></a><a data-del-f="${i}" title="Quitar"><span class="far fa-trash-can"></span></a></div>
                ${['select', 'multiselect'].includes(x.type) ? `<textarea class="form-control input-sm" rows="2" data-opts="${i}" placeholder="Una opción por línea">${esc((x.options || []).join('\n'))}</textarea>` : ''}
                ${x.type !== 'heading' ? `<input class="form-control input-sm" data-b="fields.${i}.help" value="${esc(x.help)}" placeholder="Ayuda para quien lo llena (opcional)">` : ''}</div>`).join('');
            const acts = (f.actions || []).map((a, i) => this.actionEd(f, a, i, keys)).join('');
            return {general: `<div class="ch-sim-card"><h4>Datos del formulario</h4>
                <input class="form-control" data-b="name" value="${esc(f.name)}" placeholder="Nombre">
                <textarea class="form-control" rows="2" data-b="description" placeholder="Descripción para quien lo llena (opcional)" style="margin-top:6px">${esc(f.description)}</textarea>
                <label class="ch-ifb-ck"><input type="checkbox" data-b="active" ${f.active ? 'checked' : ''}> Activo</label>
                <label class="ch-ifb-ck"><input type="checkbox" data-b="multiple" ${f.multiple ? 'checked' : ''}> Permitir varias respuestas por lead (por ejemplo, una por visita)</label>
                <a class="ch-ifb-del" data-a="del"><span class="far fa-trash-can"></span> Eliminar este formulario</a></div>`, where: `<div class="ch-sim-card"><h4>¿Dónde se ve?</h4><p class="ch-muted">Etapas del lead en las que aparece (sin marcar ninguna = en todas):</p><div class="ch-if-chk">${stageChecks}</div>
                <label class="ch-ifb-ck"><input type="checkbox" data-b="tab" ${f.tab ? 'checked' : ''}> Como pestaña en la ficha del lead (panel «Formularios»)</label>
                <label class="ch-ifb-ck"><input type="checkbox" data-b="button" ${f.button ? 'checked' : ''}> En el botón «Llenar formulario» de la ficha</label></div>`, fields: `<div class="ch-sim-card"><h4>Campos</h4>${fields}<button class="btn btn-default btn-sm" data-a="addf"><span class="fas fa-plus"></span> Añadir campo</button></div>`, actions: `<div class="ch-sim-card"><h4>Acciones</h4><p class="ch-muted">Qué pasa al guardar el formulario o al pulsar un botón en la ficha.</p>${acts}
                <button class="btn btn-default btn-sm" data-a="adda"><span class="fas fa-plus"></span> Añadir acción</button></div>`};
        }

        actionEd(f, a, i, keys) {
            const c = a.config || {}, AT = Object.entries(this.data0.actionTypes), p = `actions.${i}.config.`;
            let cfg = '', cfg0 = '';
            if (a.type === 'pdf') {
                cfg = `<input class="form-control input-sm" data-b="${p}title" value="${esc(c.title)}" placeholder="Título del PDF (por defecto, el nombre del formulario)">
                    <input class="form-control input-sm" data-b="${p}footer" value="${esc(c.footer)}" placeholder="Texto al pie (opcional)"><input class="form-control input-sm" data-b="${p}subtitle" value="${esc(c.subtitle)}" placeholder="Subtítulo (opcional)">
                    <div class="ch-ifb-row"><label class="ch-ifb-ck"><input type="checkbox" data-b="${p}showLead" ${c.showLead !== false ? 'checked' : ''}> Datos del cliente</label>
                    <label class="ch-ifb-ck"><input type="checkbox" data-b="${p}logo" ${c.logo !== false ? 'checked' : ''}> Logo de la empresa</label>
                    <label class="ch-ifb-ck"><input type="checkbox" data-b="${p}signature" ${c.signature ? 'checked' : ''}> Líneas de firma</label>
                    <label class="ch-ifb-ck">Color <input type="color" data-b="${p}color" value="${esc(c.color || '#3a52e0')}" style="width:42px;height:26px;padding:0;border:0"></label></div>
                    <div class="ch-muted">Campos en el PDF (sin marcar = todos):</div><div class="ch-if-chk">${keys.map(k => `<label><input type="checkbox" data-pf="${i}:${esc(k.key || k.label)}" ${(c.fields || []).includes(k.key) ? 'checked' : ''}> ${esc(k.label)}</label>`).join('')}</div>`;
            } else if (a.type === 'web' && c.sourceId) {
                const src = (this.webSources || []).find(w => w.id === c.sourceId), map = c.map || {}, fopts = lbl => '<option value="">No guardar en un campo</option>' + keys.map(k => `<option value="${esc(k.key)}" ${map[lbl] === k.key ? 'selected' : ''}>${esc(k.label)}</option>`).join('');
                cfg = `<div class="ch-ifb-row"><select class="form-control input-sm" data-b="${p}sourceId" data-redraw><option value="">Definir aquí la página y los datos</option>${(this.webSources || []).map(w => `<option value="${esc(w.id)}" ${w.id === c.sourceId ? 'selected' : ''}>Usar la consulta: ${esc(w.name)}</option>`).join('')}</select></div>` +
                    (src ? `<div class="ch-muted">${esc(src.url)}</div>` + src.rules.map(r => `<div class="ch-ifb-row"><span style="min-width:160px">${esc(r.label)}</span><span class="fas fa-arrow-right"></span><select class="form-control input-sm" data-wmap="${i}:${esc(r.label)}">${fopts(r.label)}</select></div>`).join('') +
                        (src.analyze ? `<div class="ch-ifb-row"><span style="min-width:160px">Análisis de la IA</span><span class="fas fa-arrow-right"></span><select class="form-control input-sm" data-b="${p}analyzeTo"><option value="">Solo en la nota del lead</option>${keys.filter(k => ['text', 'textarea'].includes(k.type)).map(k => `<option value="${esc(k.key)}" ${c.analyzeTo === k.key ? 'selected' : ''}>${esc(k.label)}</option>`).join('')}</select></div>` : '') : '<div class="ch-muted">Esa consulta ya no existe.</div>');
            } else if (a.type === 'web') {
                cfg0 = (this.webSources || []).length ? `<div class="ch-ifb-row"><select class="form-control input-sm" data-b="${p}sourceId" data-redraw><option value="">Definir aquí la página y los datos</option>${this.webSources.map(w => `<option value="${esc(w.id)}">Usar la consulta guardada: ${esc(w.name)}</option>`).join('')}</select><span class="ch-muted">o configúralas en el menú «Consultas web»</span></div>` : '<div class="ch-muted">Tip: en el menú «Consultas web» puedes guardar consultas y reutilizarlas aquí.</div>';
                const rules = c.rules || [], fopts = '<option value="">No guardar en un campo</option>' + keys.map(k => `<option value="${esc(k.key)}">${esc(k.label)}</option>`).join('');
                cfg = `<input class="form-control input-sm" data-b="${p}url" value="${esc(c.url)}" placeholder="https://ejemplo.com/consulta?documento={{identificacion}}">
                    <div class="ch-muted">En la dirección puedes usar {{nombre}}, {{identificacion}}, {{telefono}}, {{correo}} y {{clave_del_campo}}. Solo páginas públicas que ya muestran su contenido (sin JavaScript, captcha ni usuario y clave). Respeta los términos de uso de cada sitio.</div>` +
                    `<div><button class="btn btn-primary btn-sm" data-a="webpick" data-i="${i}"><span class="fas fa-hand-pointer"></span> Ver la página y elegir los datos con clics</button></div>` +
                    rules.map((r, j) => `<div class="ch-ifb-row"><input class="form-control input-sm" data-b="${p}rules.${j}.label" value="${esc(r.label)}" placeholder="Qué dato es">
                        <select class="form-control input-sm" data-b="${p}rules.${j}.mode" data-redraw><option value="selector" ${r.mode !== 'regex' && r.mode !== 'text' ? 'selected' : ''}>Selector CSS</option><option value="regex" ${r.mode === 'regex' ? 'selected' : ''}>Expresión regular</option><option value="text" ${r.mode === 'text' ? 'selected' : ''}>Texto de la página</option></select>
                        ${r.mode === 'text' ? '' : `<input class="form-control input-sm" data-b="${p}rules.${j}.expr" value="${esc(r.expr)}" placeholder="${r.mode === 'regex' ? 'Saldo:\\s*([\\d.,]+)' : '.resultado .valor'}">`}
                        <select class="form-control input-sm" data-b="${p}rules.${j}.to">${fopts.replace(`value="${esc(r.to)}"`, `value="${esc(r.to)}" selected`)}</select><a data-del-r="${i}:${j}" title="Quitar"><span class="far fa-trash-can"></span></a></div>`).join('') +
                    `<button class="btn btn-default btn-xs" data-a="addrule" data-i="${i}"><span class="fas fa-plus"></span> Añadir dato a traer</button>
                    <textarea class="form-control input-sm" rows="2" data-b="${p}analyze" placeholder="Opcional: qué debe analizar la IA con lo que dice la página para ayudar a decidir (ej.: ¿el cliente aparece reportado? ¿qué recomiendas?)">${esc(c.analyze)}</textarea>
                    <div class="ch-ifb-row"><select class="form-control input-sm" data-b="${p}analyzeTo"><option value="">Guardar el análisis solo en la nota del lead</option>${keys.filter(k => ['text', 'textarea'].includes(k.type)).map(k => `<option value="${esc(k.key)}" ${c.analyzeTo === k.key ? 'selected' : ''}>Guardar el análisis en: ${esc(k.label)}</option>`).join('')}</select>
                    <label class="ch-ifb-ck"><input type="checkbox" data-b="${p}note" ${c.note !== false ? 'checked' : ''}> Dejar nota en el historial del lead</label></div>`;
            } else if (a.type === 'status') {
                cfg = `<select class="form-control input-sm" data-b="${p}status"><option value="">Elige el estado…</option>${this.stages.map(s => `<option ${s === c.status ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>`;
            } else if (a.type === 'task') {
                cfg = `<input class="form-control input-sm" data-b="${p}name" value="${esc(c.name)}" placeholder="Nombre de la tarea"><div class="ch-ifb-row"><label>Vence en <input type="number" min="0" max="365" class="form-control input-sm" style="width:80px;display:inline-block" data-b="${p}days" value="${esc(c.days == null ? 1 : c.days)}"> días</label>
                    <select class="form-control input-sm" data-b="${p}assignTo"><option value="lead" ${c.assignTo !== 'me' ? 'selected' : ''}>Para el asesor del lead</option><option value="me" ${c.assignTo === 'me' ? 'selected' : ''}>Para quien llena el formulario</option></select></div>`;
            } else if (a.type === 'send') {
                cfg = `<div class="ch-ifb-row"><select class="form-control input-sm" data-b="${p}channel" data-redraw>${this.opt([['email', 'Correo'], ['whatsapp', 'WhatsApp'], ['sms', 'SMS']], c.channel || 'email')}</select>
                    ${(c.channel || 'email') === 'email' ? `<label class="ch-ifb-ck"><input type="checkbox" data-b="${p}attachPdf" ${c.attachPdf ? 'checked' : ''}> Adjuntar el PDF (usa la acción «Generar PDF» del formulario)</label>` : ''}</div>
                    ${(c.channel || 'email') === 'email' ? `<input class="form-control input-sm" data-b="${p}subject" value="${esc(c.subject)}" placeholder="Asunto">` : ''}
                    <textarea class="form-control input-sm" rows="3" data-b="${p}text" placeholder="Mensaje. Puedes usar {{nombre}}, {{formulario}} y {{clave_del_campo}}">${esc(c.text)}</textarea><div class="ch-muted">Campos: ${keys.map(k => '{{' + esc(k.key || '…') + '}}').join(' ') || '—'}</div>`;
            } else if (a.type === 'setfields') {
                const m = c.map || {};
                cfg = keys.map(k => { const kk = k.key || ''; return `<div class="ch-ifb-row"><span style="min-width:160px">${esc(k.label)}</span><span class="fas fa-arrow-right"></span><select class="form-control input-sm" data-map="${i}:${esc(kk)}" ><option value="">No copiar</option>${Object.keys(LEAD_LABEL).map(t => `<option value="${t}" ${m[kk] === t ? 'selected' : ''}>${esc(LEAD_LABEL[t])}</option>`).join('')}</select></div>`; }).join('');
            }
            return `<div class="ch-ifb-act"><div class="ch-ifb-row"><select class="form-control input-sm" data-b="actions.${i}.type" data-redraw>${this.opt(AT, a.type)}</select>
                <input class="form-control input-sm" data-b="actions.${i}.label" value="${esc(a.label)}" placeholder="Nombre del botón">
                <select class="form-control input-sm" data-b="actions.${i}.when"><option value="button" ${a.when !== 'save' ? 'selected' : ''}>Con un botón en la ficha</option><option value="save" ${a.when === 'save' ? 'selected' : ''}>Automática al guardar</option></select>
                <label class="ch-ifb-ck"><input type="checkbox" data-b="actions.${i}.onlyComplete" ${a.onlyComplete !== false ? 'checked' : ''}> Solo si está completo</label><a data-del-a="${i}" title="Quitar"><span class="far fa-trash-can"></span></a></div>${cfg0}${cfg}</div>`;
        }

        // la clave de un campo nuevo sigue a su nombre (y no se repite); al guardar queda fija
        syncKeys(f) {
            const used = new Set(f.fields.filter(x => !x._new).map(x => x.key));
            f.fields.forEach(x => { if (x._new || !x.key) { let k = slug(x.label), n = 2, b = k; while (used.has(k)) { k = b + '_' + n++; } x.key = k; x._new = true; used.add(k); } });
        }

        // Vista previa de la página (custom:web-picker): el usuario pulsa el dato y se agrega como regla de la acción
        pickWeb(i) {
            const f = this.forms[this.sel], act = f.actions[i], keys = f.fields.filter(x => x.type !== 'heading');
            act.config.rules = act.config.rules || [];
            Espo.loader.require('custom:web-picker', WP => WP.open({url: act.config.url, rules: act.config.rules, fields: keys, onUrl: u => { if (!act.config.url) { act.config.url = u; } }}).then(() => { this.dirty = true; this.draw(); }));
        }

        // la clave de un campo nuevo sigue a su nombre (y no se repite); al guardar queda fija
        syncKeys(f) {
            const used = new Set(f.fields.filter(x => !x._new).map(x => x.key));
            f.fields.forEach(x => { if (x._new || !x.key) { let k = slug(x.label), n = 2, b = k; while (used.has(k)) { k = b + '_' + n++; } x.key = k; x._new = true; used.add(k); } });
        }

        // Vista previa de la página: se muestra (sin scripts) y el usuario pulsa sobre el dato que quiere; el Hub calcula el selector y se agrega como regla
        pickWeb(i) {
            const f = this.forms[this.sel], act = f.actions[i], keys = f.fields.filter(x => x.type !== 'heading');
            const start = String((act.config && act.config.url) || '').replace(/\{\{\s*\w+\s*\}\}/g, '');
            ChUi.panel({title: 'Elegir datos de la página', icon: 'fas fa-hand-pointer', close: 'Listo', mount: body => {
                const box = body.closest('.ch-dlg'); if (box) { box.classList.add('ch-wide'); }
                body.innerHTML = `<div class="ch-wp"><div class="ch-wp-bar"><input class="form-control input-sm" data-u value="${esc(start)}" placeholder="Dirección de la página (con un ejemplo real en lugar de las variables)"><button class="btn btn-primary btn-sm" data-load><span class="fas fa-eye"></span> Cargar página</button></div>
                    <div class="ch-muted ch-wp-msg" data-msg>Escribe la dirección y pulsa «Cargar página». Luego pulsa sobre el dato que quieras traer.</div>
                    <div class="ch-wp-main"><iframe class="ch-wp-frame" sandbox="allow-same-origin" title="Vista previa"></iframe>
                    <div class="ch-wp-side"><div data-cand class="ch-muted">Aquí aparece el dato que elijas.</div><div class="ch-wp-added" data-added></div></div></div></div>`;
                const q = s2 => body.querySelector(s2), frame = q('iframe'), msg = q('[data-msg]'), cand = q('[data-cand]'), added = q('[data-added]');
                let pid = '', cur = null;
                const drawAdded = () => { const rs = (act.config.rules || []); added.innerHTML = rs.length ? '<h5>Datos agregados</h5>' + rs.map(r => `<div class="ch-wp-it"><span class="fas fa-check" style="color:#2fa36b"></span> <b>${esc(r.label)}</b><small>${esc(r.expr)}</small></div>`).join('') : ''; };
                drawAdded();
                const showCand = (r, idx, parentIdx) => {
                    cur = {selector: r.selector, idx};
                    cand.innerHTML = `<div class="ch-wp-c"><div class="ch-muted">Dato elegido</div><div class="ch-wp-txt">${esc(r.text) || '<i>(sin texto)</i>'}</div><code>${esc(r.selector)}</code>
                        <input class="form-control input-sm" data-lb placeholder="Qué dato es (ej.: Estado, Saldo)" value="">
                        <select class="form-control input-sm" data-to><option value="">No guardar en un campo</option>${keys.map(k => `<option value="${esc(k.key)}">${esc(k.label)}</option>`).join('')}</select>
                        <div class="ch-ifb-row">${parentIdx != null ? '<button class="btn btn-default btn-xs" data-up title="Seleccionar el bloque que lo contiene"><span class="fas fa-arrow-up"></span> Bloque que lo contiene</button>' : ''}<button class="btn btn-primary btn-xs" data-add><span class="fas fa-plus"></span> Agregar dato</button></div></div>`;
                    const up = cand.querySelector('[data-up]'); if (up) { up.onclick = () => choose(parentIdx); }
                    cand.querySelector('[data-add]').onclick = () => {
                        const lb = cand.querySelector('[data-lb]').value.trim() || r.text.slice(0, 30) || 'Dato';
                        act.config.rules = act.config.rules || []; act.config.rules.push({label: lb, mode: 'selector', expr: r.selector, to: cand.querySelector('[data-to]').value}); this.dirty = true;
                        cand.innerHTML = '<div class="ch-muted">Agregado. Pulsa otro dato de la página si quieres traer más.</div>'; drawAdded();
                    };
                };
                const choose = idx => {
                    cand.innerHTML = '<div class="ch-muted">Calculando…</div>';
                    Espo.Ajax.postRequest('CrmHub/iformWebPick', {previewId: pid, idx}).then(r => {
                        const d = frame.contentDocument, el = d && d.querySelector(`[data-chi="${idx}"]`), par = el && el.parentElement && el.parentElement.getAttribute('data-chi');
                        if (d) { d.querySelectorAll('.ch-picked').forEach(x => x.classList.remove('ch-picked')); if (el) { el.classList.add('ch-picked'); } }
                        showCand(r, idx, par != null && par !== '' && el.parentElement.tagName !== 'HTML' ? +par : null);
                    }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } cand.innerHTML = '<div class="ch-chat-err">No se pudo calcular el selector. Vuelve a cargar la página.</div>'; });
                };
                frame.onload = () => {
                    const d = frame.contentDocument; if (!d || !pid) { return; }
                    const st = d.createElement('style'); st.textContent = '.ch-hov{outline:2px solid #3a52e0 !important;background:rgba(58,82,224,.12) !important;cursor:pointer !important}.ch-picked{outline:3px solid #2fa36b !important;background:rgba(47,163,107,.18) !important}'; d.head.appendChild(st);
                    let last = null;
                    d.addEventListener('mouseover', e => { if (last) { last.classList.remove('ch-hov'); } last = e.target; if (last.setAttribute) { last.classList.add('ch-hov'); } });
                    d.addEventListener('mouseout', e => { if (e.target.classList) { e.target.classList.remove('ch-hov'); } });
                    d.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); let t = e.target; while (t && t.getAttribute && !t.hasAttribute('data-chi')) { t = t.parentElement; } if (t && t.getAttribute) { choose(+t.getAttribute('data-chi')); } }, true);
                };
                q('[data-load]').onclick = () => {
                    const url = q('[data-u]').value.trim(); if (!/^https?:\/\//i.test(url)) { msg.textContent = 'La dirección debe empezar por http:// o https://'; return; }
                    msg.textContent = 'Cargando la página…'; pid = '';
                    Espo.Ajax.postRequest('CrmHub/iformWebPreview', {url}).then(r => {
                        pid = r.previewId; msg.innerHTML = r.warning ? `<span style="color:#b45309">${esc(r.warning)}</span>` : 'Pulsa sobre el dato que quieras traer: se resalta al pasar el cursor.';
                        if (!act.config.url) { act.config.url = url; }
                        frame.srcdoc = r.html;
                    }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } msg.innerHTML = '<span style="color:#d64545">' + esc((xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason')) || 'No se pudo cargar la página.') + '</span>'; });
                };
                if (/^https?:\/\/\S+$/.test(start)) { q('[data-load]').click(); }
            }}).then(() => this.draw());
        }

        set(path, v) {
            const ks = path.split('.'); let o = this.forms[this.sel];
            for (let i = 0; i < ks.length - 1; i++) { o = o[isNaN(ks[i]) ? ks[i] : +ks[i]]; if (o == null) { return; } }
            const k = ks[ks.length - 1]; o[isNaN(k) ? k : +k] = v; this.dirty = true;
        }

        bind(root) {
            const f = () => this.forms[this.sel];
            root.onchange = root.oninput = e => {
                const t = e.target, b = t.dataset.b;
                if (b) { this.set(b, t.type === 'checkbox' ? t.checked : t.type === 'number' ? +t.value : t.value); if (/^fields\.\d+\.label$/.test(b)) { this.syncKeys(f()); } if (t.hasAttribute('data-redraw') && e.type === 'change') { if (t.dataset.b.endsWith('.type') && t.dataset.b.startsWith('actions.')) { const i = +t.dataset.b.split('.')[1]; f().actions[i].config = {}; } this.draw(); } return; }
                if (t.dataset.st) { const s = f().stages, i = s.indexOf(t.dataset.st); if (t.checked && i < 0) { s.push(t.dataset.st); } else if (!t.checked && i >= 0) { s.splice(i, 1); } this.dirty = true; return; }
                if (t.dataset.opts) { f().fields[+t.dataset.opts].options = t.value.split('\n').map(x => x.trim()).filter(Boolean); this.dirty = true; return; }
                if (t.dataset.pf) { const [i, k] = t.dataset.pf.split(':'), c = f().actions[+i].config, fk = f().fields.find(x => (x.key || x.label) === k); const key = fk && fk.key; if (!key) { return; } c.fields = c.fields || []; const j = c.fields.indexOf(key); if (t.checked && j < 0) { c.fields.push(key); } else if (!t.checked && j >= 0) { c.fields.splice(j, 1); } this.dirty = true; return; }
                if (t.dataset.wmap) { const idx = t.dataset.wmap.indexOf(':'), i = +t.dataset.wmap.slice(0, idx), lbl = t.dataset.wmap.slice(idx + 1), c = f().actions[i].config; c.map = c.map || {}; if (t.value) { c.map[lbl] = t.value; } else { delete c.map[lbl]; } this.dirty = true; return; }
                if (t.dataset.map) { const [i, k] = t.dataset.map.split(':'), c = f().actions[+i].config; c.map = c.map || {}; if (t.value) { c.map[k] = t.value; } else { delete c.map[k]; } this.dirty = true; }
            };
            root.onclick = e => {
                const tb = e.target.closest('[data-tab]'); if (tb) { this.tab = tb.dataset.tab; this.draw(); return; }
                const s = e.target.closest('[data-sel]'); if (s) { this.sel = +s.dataset.sel; this.draw(); return; }
                const mv = e.target.closest('[data-mv]'); if (mv) { const [i, d] = mv.dataset.mv.split(':').map(Number), a = f().fields, j = i + d; if (j >= 0 && j < a.length) { [a[i], a[j]] = [a[j], a[i]]; this.dirty = true; this.draw(); } return; }
                const df = e.target.closest('[data-del-f]'); if (df) { f().fields.splice(+df.dataset.delF, 1); this.dirty = true; this.draw(); return; }
                const da = e.target.closest('[data-del-a]'); if (da) { f().actions.splice(+da.dataset.delA, 1); this.dirty = true; this.draw(); return; }
                const dr = e.target.closest('[data-del-r]'); if (dr) { const [i, j] = dr.dataset.delR.split(':').map(Number); f().actions[i].config.rules.splice(j, 1); this.dirty = true; this.draw(); return; }
                const wp = e.target.closest('[data-a="webpick"]'); if (wp) { this.pickWeb(+wp.dataset.i); return; }
                const ar = e.target.closest('[data-a="addrule"]'); if (ar) { const c = f().actions[+ar.dataset.i].config; c.rules = c.rules || []; c.rules.push({label: '', mode: 'selector', expr: '', to: ''}); this.dirty = true; this.draw(); return; }
                const a = e.target.closest('[data-a]'); if (!a) { return; }
                if (a.dataset.a === 'new') { this.forms.push(NEW_FORM()); this.syncKeys(this.forms[this.forms.length - 1]); this.sel = this.forms.length - 1; this.dirty = true; this.draw(); }
                else if (a.dataset.a === 'sample') { this.forms.push(SAMPLE()); this.syncKeys(this.forms[this.forms.length - 1]); this.sel = this.forms.length - 1; this.dirty = true; this.draw(); }
                else if (a.dataset.a === 'addf') { f().fields.push({key: '', label: 'Nuevo campo', type: 'text', required: false, options: [], help: '', width: 'full'}); this.syncKeys(f()); this.dirty = true; this.draw(); }
                else if (a.dataset.a === 'adda') { f().actions = f().actions || []; f().actions.push({id: '', label: 'Generar PDF', type: 'pdf', when: 'button', onlyComplete: true, config: {title: '', footer: '', fields: [], showLead: true}}); this.dirty = true; this.draw(); }
                else if (a.dataset.a === 'del') { ChUi.confirm({title: 'Eliminar formulario', text: 'Se elimina el formulario al guardar; las respuestas ya guardadas dejan de verse.', ok: 'Eliminar', danger: true}).then(y => { if (y) { this.forms.splice(this.sel, 1); this.sel = 0; this.dirty = true; this.draw(); } }); }
                else if (a.dataset.a === 'save') { this.save(a); }
            };
        }

        save(btn) {
            btn.disabled = true;
            Espo.Ajax.postRequest('CrmHub/iformsSave', {forms: this.forms}).then(r => {
                this.forms = JSON.parse(JSON.stringify(r.forms)); this.data0.forms = r.forms; this.dirty = false; this.sel = Math.min(this.sel, Math.max(0, this.forms.length - 1)); Espo.Ui.success('Formularios guardados'); this.draw();
            }).catch(xhr => { btn.disabled = false; Espo.Ui.error((xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason')) || 'No se pudo guardar'); if (xhr) { xhr.errorIsHandled = true; } });
        }
    };
});
