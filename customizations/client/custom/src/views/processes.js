// Procesos al llegar un lead: la empresa define a qué API/webhook se envía la identificación y los datos del lead, y qué se guarda de la respuesta.
define('custom:views/processes', ['view', 'custom:ui', 'custom:tpl'], function (Dep, ChUi, Tpl) {
    const esc = v => ChUi.esc(v == null ? '' : v);
    const VARS = [['{{identificacion}}', 'Identificación'], ['{{tipo_identificacion}}', 'Tipo de documento'], ['{{nombre}}', 'Nombre'], ['{{apellido}}', 'Apellido'], ['{{nombre_completo}}', 'Nombre completo'],
        ['{{telefono}}', 'Teléfono'], ['{{correo}}', 'Correo'], ['{{fuente}}', 'Fuente'], ['{{campana}}', 'Campaña'], ['{{formulario}}', 'Formulario de origen'], ['{{lead_id}}', 'ID del lead'], ['{{empresa}}', 'Empresa']];
    const FIELD_LABEL = {creditScore: 'Puntaje de crédito', totalDebt: 'Deuda total', overdueDebt: 'Deuda en mora', monthlyIncome: 'Ingresos mensuales', creditorCount: 'Cantidad de acreedores',
        maxDaysOverdue: 'Máx. días de mora', defaultCount: 'Obligaciones castigadas', identificationType: 'Tipo de documento', processResult: 'Resultado de procesos', description: 'Descripción (añade al final)'};
    const ST = {ok: ['Correcto', 'ok'], error: ['Con error', 'err'], running: ['En curso', 'info'], skipped: ['Omitido', 'skip']};
    const fmt = d => { try { return new Date(d).toLocaleString('es', {dateStyle: 'short', timeStyle: 'short'}); } catch (e) { return d || ''; } };
    const blank = () => ({id: '', name: '', enabled: true, trigger: {sources: [], forms: [], requireId: true, runOnChange: true}, recalc: false, timeout: 25, map: [],
        http: {method: 'POST', url: '', body_type: 'json', body: '{\n  "identificacion": "{{identificacion}}"\n}', auth_type: 'none', auth_user: '', auth_header: '', auth_secret: '', headers: ''}});

    return class extends Dep {
        templateContent = '<div class="ch-proc"></div>'
        data0 = null
        runs = []
        editing = null
        tab = 'list'
        testOut = null

        setup() { this.getHelper().pageTitle.setTitle('Procesos de leads'); this.load(); }
        afterRender() { this.draw(); }

        load() {
            Promise.all([Espo.Ajax.getRequest('CrmHub/processes'), Espo.Ajax.getRequest('CrmHub/processRuns')]).then(([p, r]) => { this.data0 = p; this.runs = r.items || []; this.draw(); })
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } this.data0 = {error: true}; this.draw(); });
        }

        sources() { return (this.getMetadata().get(['entityDefs', 'Lead', 'fields', 'source', 'options']) || []).filter(Boolean); }

        draw() {
            const root = this.el && this.el.querySelector('.ch-proc'); if (!root) { return; }
            if (!this.data0) { root.innerHTML = '<div class="ch-muted" style="padding:24px">Cargando…</div>'; return; }
            if (this.data0.error) { root.innerHTML = '<div class="ch-chat-err">No se pudo cargar. Solo los administradores pueden ver esta pantalla.</div>'; return; }
            const head = `<div class="ch-sim-head"><h3><span class="fas fa-gears"></span> Procesos de leads</h3><p class="ch-muted">Cuando llega un lead, el sistema envía su identificación y datos a la API o webhook que tú configures, y guarda en el lead lo que responda. Se ejecuta en segundo plano, con reintentos, y cada ejecución queda registrada.</p></div>` +
                `<div class="ch-tpl-tabs"><a class="ch-tpl-tab ${this.tab === 'list' ? 'on' : ''}" data-act="tab" data-t="list"><span class="fas fa-list"></span> Procesos</a><a class="ch-tpl-tab ${this.tab === 'runs' ? 'on' : ''}" data-act="tab" data-t="runs"><span class="fas fa-clock-rotate-left"></span> Ejecuciones</a></div>`;
            root.innerHTML = head + (this.tab === 'runs' ? this.runsHtml() : (this.editing ? this.editorHtml() : this.listHtml()));
            root.onclick = e => this.click(e);
            root.oninput = e => this.input(e);
        }

        listHtml() {
            const list = this.data0.processes || [];
            const lastOf = id => this.runs.find(r => r.process_id === id);
            return `<div class="ch-sim-card">${list.map(p => { const lr = lastOf(p.id), s = lr && ST[lr.status];
                return `<div class="ch-proc-item"><label class="ch-switch"><input type="checkbox" data-act="toggle" data-id="${esc(p.id)}" ${p.enabled ? 'checked' : ''}><i></i></label>` +
                    `<a data-act="edit" data-id="${esc(p.id)}"><b>${esc(p.name)}</b><span>${esc(p.http.method)} ${esc(p.http.url.slice(0, 70))}</span><span>${p.trigger.sources.length ? 'Fuentes: ' + esc(p.trigger.sources.join(', ')) : 'Todos los leads'}${p.trigger.forms.length ? ' · Formularios: ' + esc(p.trigger.forms.join(', ')) : ''}</span></a>` +
                    `${s ? `<span class="ch-ah-chip st-${s[1]}">${s[0]}</span>` : ''}<a class="ch-tpl-del" data-act="del" data-id="${esc(p.id)}" title="Eliminar"><span class="far fa-trash-can"></span></a></div>`; }).join('') || '<div class="ch-muted">Aún no hay procesos.</div>'}
                <div class="ch-mail-actions"><button class="btn btn-primary btn-sm" data-act="new" ${list.length >= this.data0.max ? 'disabled' : ''}><span class="fas fa-plus"></span> Nuevo proceso</button></div></div>`;
        }

        runsHtml() {
            return `<div class="ch-sim-card"><table class="table ch-proc-runs"><thead><tr><th>Cuándo</th><th>Proceso</th><th>Lead</th><th>Resultado</th><th>Detalle</th></tr></thead><tbody>` +
                (this.runs.map(r => { const s = ST[r.status] || ST.info;
                    return `<tr><td>${esc(fmt(r.started_at))}</td><td>${esc(r.process_name)}</td><td><a href="#Lead/view/${esc(r.lead_id)}">Abrir lead</a></td><td><span class="ch-ah-chip st-${s[1]}">${s[0]}${r.http_status ? ' · ' + r.http_status : ''}</span></td><td>${esc(r.error || (r.applied || []).map(a => a.to + ': ' + a.value).join(' · '))}</td></tr>`; }).join('') || '<tr><td colspan="5" class="ch-muted">Aún no se ha ejecutado ningún proceso.</td></tr>') + '</tbody></table></div>';
        }

        editorHtml() {
            const e = this.editing, h = e.http, t = e.trigger, srcs = this.sources();
            const selRow = (r, i) => `<div class="ch-proc-map"><input data-m="path" data-i="${i}" value="${esc(r.path)}" placeholder="Ruta en la respuesta, p. ej. data.score"><span class="fas fa-arrow-right"></span>` +
                `<select data-m="to" data-i="${i}"><option value="note" ${r.to === 'note' ? 'selected' : ''}>Nota en el historial</option><option value="status" ${r.to === 'status' ? 'selected' : ''}>Estado del lead</option>` +
                Object.keys(FIELD_LABEL).map(f => `<option value="field:${f}" ${r.to === 'field:' + f ? 'selected' : ''}>Campo: ${FIELD_LABEL[f]}</option>`).join('') + `</select><a data-act="delmap" data-i="${i}" title="Quitar"><span class="far fa-trash-can"></span></a></div>`;
            return `<div class="ch-sim-card ch-proc-ed"><h4>${e.id ? 'Editar proceso' : 'Nuevo proceso'}</h4>
                <label>Nombre</label><input data-f="name" maxlength="80" value="${esc(e.name)}" placeholder="Ej.: Consulta de antecedentes">
                <label class="ch-dz-chk"><input type="checkbox" data-f="enabled" ${e.enabled ? 'checked' : ''}> Activo</label>
                <h5>1. Cuándo se ejecuta</h5>
                <label>Fuentes (vacío = todos los leads)</label><div class="ch-proc-chips">${srcs.map(s => `<a class="ch-ah-chip ${t.sources.includes(s) ? 'on' : ''}" data-act="src" data-s="${esc(s)}">${esc(s)}</a>`).join('')}</div>
                <label>Formularios (vacío = cualquiera; separa con comas el nombre corto de la URL)</label><input data-f="forms" value="${esc(t.forms.join(', '))}" placeholder="formulario-1, creditos">
                <label class="ch-dz-chk"><input type="checkbox" data-f="requireId" ${t.requireId ? 'checked' : ''}> Solo si el lead tiene identificación</label>
                <label class="ch-dz-chk"><input type="checkbox" data-f="runOnChange" ${t.runOnChange ? 'checked' : ''}> Ejecutar también cuando se escribe o cambia la identificación</label>
                <h5>2. Llamada a la API</h5>
                <div class="ch-proc-row"><select data-h="method">${['POST', 'GET', 'PUT'].map(m => `<option ${h.method === m ? 'selected' : ''}>${m}</option>`).join('')}</select><input data-h="url" value="${esc(h.url)}" placeholder="https://api.ejemplo.com/consulta/{{identificacion}}"></div>
                <label>Cuerpo</label><div class="ch-proc-row"><select data-h="body_type"><option value="json" ${h.body_type === 'json' ? 'selected' : ''}>JSON</option><option value="form" ${h.body_type === 'form' ? 'selected' : ''}>Formulario</option><option value="query" ${h.body_type === 'query' ? 'selected' : ''}>En la URL (query)</option></select></div>
                <textarea data-h="body" rows="5" placeholder='{"documento": "{{identificacion}}"}'>${esc(h.body)}</textarea>
                <div class="ch-var-row"><span class="ch-muted">Variables:</span> ${VARS.map(([v, tt]) => `<a class="ch-var" data-act="var" data-v="${esc(v)}" title="${esc(tt)}">${esc(v)}</a>`).join('')}</div>
                <label>Autenticación</label><div class="ch-proc-row"><select data-h="auth_type">${[['none', 'Sin autenticación'], ['bearer', 'Token (Bearer)'], ['basic', 'Usuario y contraseña'], ['header', 'Cabecera con clave']].map(([v, l]) => `<option value="${v}" ${h.auth_type === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
                    ${h.auth_type === 'basic' ? `<input data-h="auth_user" value="${esc(h.auth_user)}" placeholder="Usuario">` : ''}${h.auth_type === 'header' ? `<input data-h="auth_header" value="${esc(h.auth_header)}" placeholder="Nombre de la cabecera (X-Api-Key)">` : ''}
                    ${h.auth_type !== 'none' ? `<input data-h="auth_secret" type="password" value="${esc(h.auth_secret)}" placeholder="${h.secretSet ? 'Clave guardada (' + esc(h.secretHint) + '); déjalo vacío para conservarla' : 'Clave o token'}">` : ''}</div>
                <label>Otras cabeceras (JSON, opcional)</label><input data-h="headers" value="${esc(h.headers)}" placeholder='{"X-Api-Version": "2"}'>
                <h5>3. Qué se guarda de la respuesta</h5>
                <div data-role="maps">${e.map.map(selRow).join('')}</div><a class="ch-dz-link" data-act="addmap"><span class="fas fa-plus"></span> Añadir dato a guardar</a>
                <label class="ch-dz-chk"><input type="checkbox" data-f="recalc" ${e.recalc ? 'checked' : ''}> Volver a calcular la calificación del lead al terminar</label>
                <div class="ch-chat-err" data-role="err" hidden></div>
                <div class="ch-mail-actions"><button class="btn btn-primary btn-sm" data-act="save"><span class="fas fa-floppy-disk"></span> Guardar</button><button class="btn btn-default btn-sm" data-act="test"><span class="fas fa-vial"></span> Probar</button><button class="btn btn-default btn-sm" data-act="cancel">Cancelar</button></div>
                <div class="ch-proc-test" data-role="test">${this.testHtml()}</div></div>`;
        }

        testHtml() {
            const o = this.testOut; if (!o) { return '<div class="ch-muted">«Probar» llama a la API con datos de ejemplo (identificación 1234567890) y muestra qué se guardaría, sin tocar ningún lead.</div>'; }
            if (o.loading) { return '<div class="ch-muted"><span class="ch-spin"></span> Probando…</div>'; }
            if (o.error) { return `<div class="ch-chat-err">${esc(o.error)}</div>`; }
            return `<div class="ch-sig-h">Respuesta: <b>${o.ok ? 'correcta' : 'con error'} (HTTP ${esc(o.status)})</b></div><pre class="ch-proc-pre">${esc(o.response)}</pre>` +
                ((o.preview || []).length ? '<div class="ch-sig-h">Lo que se guardaría:</div><table class="table"><tbody>' + o.preview.map(p => `<tr><td>${esc(p.path)}</td><td><span class="fas fa-arrow-right"></span> ${esc(p.to === 'note' ? 'Nota en el historial' : (p.to === 'status' ? 'Estado del lead' : 'Campo: ' + (FIELD_LABEL[p.to.replace('field:', '')] || p.to)))}</td><td><b>${p.value == null ? '<span class="ch-muted">sin valor</span>' : esc(typeof p.value === 'object' ? JSON.stringify(p.value) : p.value)}</b></td></tr>`).join('') + '</tbody></table>' : '');
        }

        // ---- eventos
        read() {
            const q = s => this.el.querySelector(s), e = this.editing;
            e.name = q('[data-f="name"]').value; e.enabled = q('[data-f="enabled"]').checked;
            e.trigger.forms = q('[data-f="forms"]').value.split(',').map(x => x.trim()).filter(Boolean);
            e.trigger.requireId = q('[data-f="requireId"]').checked; e.trigger.runOnChange = q('[data-f="runOnChange"]').checked; e.recalc = q('[data-f="recalc"]').checked;
            this.el.querySelectorAll('[data-h]').forEach(i => { e.http[i.dataset.h] = i.value; });
            this.el.querySelectorAll('.ch-proc-map').forEach((row, i) => { e.map[i] = {path: row.querySelector('[data-m="path"]').value.trim(), to: row.querySelector('[data-m="to"]').value}; });
        }

        input() { /* los valores se leen al guardar o probar */ }

        click(e) {
            const a = e.target.closest('[data-act]'); if (!a) { return; }
            const act = a.dataset.act, list = this.data0.processes;
            if (act === 'tab') { this.tab = a.dataset.t; this.editing = null; this.draw(); return; }
            if (act === 'new') { this.editing = blank(); this.testOut = null; this.draw(); return; }
            if (act === 'edit') { this.editing = JSON.parse(JSON.stringify(list.find(p => p.id === a.dataset.id))); this.editing.http.auth_secret = ''; this.testOut = null; this.draw(); return; }
            if (act === 'cancel') { this.editing = null; this.draw(); return; }
            if (act === 'toggle') { const p = list.find(x => x.id === a.dataset.id); p.enabled = a.checked; this.persist(list, 'Guardado'); return; }
            if (act === 'del') { ChUi.confirm({title: 'Eliminar proceso', text: 'Se elimina el proceso. El registro de sus ejecuciones se conserva.', ok: 'Eliminar', danger: true}).then(y => { if (y) { this.persist(list.filter(p => p.id !== a.dataset.id), 'Proceso eliminado'); } }); return; }
            if (!this.editing) { return; }
            this.read();
            if (act === 'src') { const s = a.dataset.s, t = this.editing.trigger.sources, i = t.indexOf(s); if (i >= 0) { t.splice(i, 1); } else { t.push(s); } this.draw(); }
            else if (act === 'addmap') { this.editing.map.push({path: '', to: 'note'}); this.draw(); }
            else if (act === 'delmap') { this.editing.map.splice(+a.dataset.i, 1); this.draw(); }
            else if (act === 'var') { const ta = this.el.querySelector('[data-h="body"]'), s = ta.selectionStart || ta.value.length; ta.value = ta.value.slice(0, s) + a.dataset.v + ta.value.slice(ta.selectionEnd || s); ta.focus(); }
            else if (act === 'save') { this.save(); }
            else if (act === 'test') { this.test(); }
            if (['src', 'addmap', 'delmap'].includes(act)) { /* ya redibujado */ }
        }

        err(m) { const e = this.el.querySelector('[data-role="err"]'); if (e) { e.hidden = !m; e.textContent = m || ''; } }

        persist(list, msg) {
            return Espo.Ajax.postRequest('CrmHub/processesSave', {processes: list}).then(r => { this.data0.processes = r.processes; Espo.Ui.success(msg); this.editing = null; this.draw(); })
                .catch(xhr => { const m = Tpl.reason(xhr, 'No se pudo guardar.'); if (this.editing) { this.err(m); } else { Espo.Ui.error(m); } if (xhr) { xhr.errorIsHandled = true; } });
        }

        save() {
            const e = this.editing, list = this.data0.processes.filter(p => p.id !== e.id);
            if (e.name.trim().length < 2) { this.err('Escribe el nombre del proceso.'); return; }
            if (!e.http.url.trim()) { this.err('Escribe la URL de la API.'); return; }
            const all = this.data0.processes.map(p => p.id === e.id ? e : p); if (!e.id) { all.push(e); }
            this.persist(all, 'Proceso guardado');
        }

        test() {
            this.testOut = {loading: true}; this.el.querySelector('[data-role="test"]').innerHTML = this.testHtml();
            Espo.Ajax.postRequest('CrmHub/processTest', {process: this.editing}, {timeout: 90000}).then(r => { this.testOut = r; })
                .catch(xhr => { this.testOut = {error: Tpl.reason(xhr, 'No se pudo probar.')}; if (xhr) { xhr.errorIsHandled = true; } })
                .then(() => { const t = this.el.querySelector('[data-role="test"]'); if (t) { t.innerHTML = this.testHtml(); } });
        }
    };
});
