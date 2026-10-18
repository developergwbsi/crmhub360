/**
 * Formularios internos: dibuja un formulario diseñado por la empresa (campos, obligatorios, listas…), guarda las respuestas en el lead y lanza sus acciones
 * (generar PDF, cambiar estado, crear tarea, enviar, copiar a campos del lead). Lo usan la pestaña «Formularios» de la ficha (en línea) y la ventana «Llenar formulario».
 * Endpoints: POST CrmHub/iformEntry (guardar; ejecuta las acciones «al guardar») y POST CrmHub/iformAction (acción de botón).
 * API: mount(root, {leadId, form, entry, onSaved}) y openModal(model, form, entry, onDone).
 */
define('custom:iform', ['custom:ui'], function (ChUi) {
    const esc = v => ChUi.esc(v == null ? '' : v);
    const dl = id => `?entryPoint=download&id=${encodeURIComponent(id)}`;
    const ICON = {pdf: 'fas fa-file-pdf', status: 'fas fa-arrows-rotate', task: 'fas fa-list-check', send: 'fas fa-paper-plane', setfields: 'fas fa-arrow-right-arrow-left', web: 'fas fa-globe'};

    function fieldHtml(f, v, idx) {
        const id = 'f' + idx + '-' + f.key, req = f.required ? ' <span class="ch-if-req">*</span>' : '', help = f.help ? `<div class="ch-if-help">${esc(f.help)}</div>` : '';
        if (f.type === 'heading') { return `<div class="ch-if-h">${esc(f.label)}</div>`; }
        let input = '';
        if (f.type === 'textarea') { input = `<textarea class="form-control" rows="3" data-k="${f.key}" id="${id}">${esc(v)}</textarea>`; }
        else if (f.type === 'select') { input = `<select class="form-control" data-k="${f.key}" id="${id}"><option value=""></option>${f.options.map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`; }
        else if (f.type === 'multiselect') { const a = Array.isArray(v) ? v : []; input = `<div class="ch-if-chk" data-k="${f.key}">${f.options.map(o => `<label><input type="checkbox" value="${esc(o)}" ${a.includes(o) ? 'checked' : ''}> ${esc(o)}</label>`).join('')}</div>`; }
        else if (f.type === 'bool') { input = `<div class="ch-if-chk" data-k="${f.key}" data-bool="1"><label><input type="radio" name="${id}" value="1" ${v === true ? 'checked' : ''}> Sí</label><label><input type="radio" name="${id}" value="0" ${v === false ? 'checked' : ''}> No</label></div>`; }
        else if (f.type === 'date') { input = `<input type="date" class="form-control" data-k="${f.key}" id="${id}" value="${esc(v)}">`; }
        else { input = `<input type="${f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : 'text'}" ${f.type === 'number' || f.type === 'money' ? 'inputmode="decimal"' : ''} class="form-control" data-k="${f.key}" id="${id}" value="${esc(v)}">`; }
        return `<div class="ch-if-f ${f.width === 'half' ? 'half' : ''}"><label for="${id}">${esc(f.label)}${req}</label>${input}${help}</div>`;
    }

    function collect(root, form) {
        const out = {};
        form.fields.forEach(f => {
            if (f.type === 'heading') { return; }
            const el = root.querySelector(`[data-k="${f.key}"]`); if (!el) { return; }
            if (f.type === 'multiselect') { out[f.key] = [...el.querySelectorAll('input:checked')].map(i => i.value); }
            else if (f.type === 'bool') { const c = el.querySelector('input:checked'); out[f.key] = c ? c.value === '1' : null; }
            else { out[f.key] = el.value; }
        });
        return out;
    }

    // Dibuja el formulario dentro de root. opts: {leadId, form, entry, onSaved(entryId)}
    function mount(root, opts) {
        const form = opts.form;
        let entry = opts.entry || null;
        const draw = () => {
            const v = entry ? entry.values : {};
            const acts = (form.actions || []).filter(a => a.when === 'button');
            const files = (entry && entry.files) || [];
            root.innerHTML = `<div class="ch-if">${form.description ? `<div class="ch-if-desc">${esc(form.description)}</div>` : ''}<div class="ch-if-grid">${form.fields.map((f, i) => fieldHtml(f, v[f.key], i)).join('')}</div>` +
                `<div class="ch-if-err" hidden></div><div class="ch-if-bar"><button class="btn btn-primary btn-sm" data-a="save"><span class="fas fa-check"></span> ${entry ? 'Guardar cambios' : 'Guardar'}</button>` +
                `<button class="btn btn-default btn-sm" data-a="draft" title="Guarda lo que llevas sin exigir los campos obligatorios">Guardar borrador</button>` +
                (entry ? acts.map(a => `<button class="btn btn-default btn-sm" data-act="${esc(a.id)}"><span class="${ICON[a.type] || 'fas fa-bolt'}"></span> ${esc(a.label)}</button>`).join('') : '') +
                `</div>${entry ? `<div class="ch-if-meta ch-muted">${entry.complete ? '✓ Completo' : 'Incompleto'} · ${esc(entry.by || '')} · ${esc(ChUi.fmt.dt(entry.updatedAt))}${entry.source === 'documento' ? ' · llenado desde un documento: revísalo' : ''}</div>` : ''}` +
                (files.length ? `<div class="ch-if-files">${files.map(x => `<a href="${dl(x.attachmentId)}" target="_blank" rel="noopener"><span class="fas fa-file-pdf"></span> ${esc(x.detail || 'PDF')} · ${esc(ChUi.fmt.dt(x.at))}</a>`).join('')}</div>` : '') + '</div>';
            const err = m => { const e = root.querySelector('.ch-if-err'); e.hidden = !m; e.textContent = m || ''; };
            root.querySelector('.ch-if').onclick = e => {
                const b = e.target.closest('button'); if (!b || b.disabled) { return; }
                if (b.dataset.a) { save(b, b.dataset.a === 'draft'); }
                else if (b.dataset.act) { run(b, b.dataset.act); }
            };
            const save = (b, partial) => {
                err(''); b.disabled = true;
                Espo.Ajax.postRequest('CrmHub/iformEntry', {leadId: opts.leadId, formId: form.id, entryId: entry && entry.id, values: collect(root, form), partial}).then(r => {
                    (r.results || []).forEach(x => { (x.ok ? Espo.Ui.success : Espo.Ui.warning)(x.label + ': ' + x.detail); if (x.analysis) { ChUi.notice({title: 'Lo que encontré para decidir', icon: 'fas fa-globe', html: '<div style="white-space:pre-wrap">' + esc(x.analysis) + '</div>', ok: 'Entendido'}); } });
                    Espo.Ui.success(r.complete ? 'Formulario guardado' : 'Borrador guardado');
                    entry = Object.assign({}, entry || {}, {id: r.id, values: collect(root, form), complete: r.complete}); if (opts.onSaved) { opts.onSaved(r); }
                }).catch(xhr => { b.disabled = false; err((xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason')) || 'No se pudo guardar.'); if (xhr) { xhr.errorIsHandled = true; } });
            };
            const run = (b, aid) => {
                b.disabled = true;
                Espo.Ajax.postRequest('CrmHub/iformAction', {leadId: opts.leadId, entryId: entry.id, actionId: aid}).then(r => {
                    (r.ok ? Espo.Ui.success : Espo.Ui.warning)(r.detail || r.label); b.disabled = false; if (r.analysis) { ChUi.notice({title: 'Lo que encontré para decidir', icon: 'fas fa-globe', html: '<div style="white-space:pre-wrap">' + esc(r.analysis) + '</div>', ok: 'Entendido'}); } if (opts.onSaved) { opts.onSaved(r); }
                }).catch(xhr => { b.disabled = false; Espo.Ui.error((xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason')) || 'No se pudo ejecutar la acción.'); if (xhr) { xhr.errorIsHandled = true; } });
            };
        };
        draw();
        return {update(e) { entry = e; draw(); }};
    }

    function openModal(model, form, entry, onDone) {
        return ChUi.panel({title: form.name, icon: 'fas fa-clipboard-list', close: 'Cerrar', mount: (body, close) => {
            body.classList.add('ch-if-modal');
            mount(body, {leadId: model.id, form, entry, onSaved: () => { if (onDone) { onDone(); } }});
        }});
    }

    return {mount, openModal};
});
