/**
 * Formularios internos: dibuja un formulario diseñado por la empresa (campos, obligatorios, listas…), guarda las respuestas en el lead y lanza sus acciones
 * (generar PDF, cambiar estado, crear tarea, enviar, copiar a campos del lead). Lo usan la pestaña «Formularios» de la ficha (en línea) y la ventana «Llenar formulario».
 * Endpoints: POST CrmHub/iformEntry (guardar; ejecuta las acciones «al guardar») y POST CrmHub/iformAction (acción de botón).
 * API: mount(root, {leadId, form, entry, onSaved}) y openModal(model, form, entry, onDone).
 */
define('custom:iform', ['custom:ui', 'custom:formula'], function (ChUi, F) {
    const esc = v => ChUi.esc(v == null ? '' : v);
    const dl = id => `?entryPoint=download&id=${encodeURIComponent(id)}`;
    const ICON = {pdf: 'fas fa-file-pdf', status: 'fas fa-arrows-rotate', task: 'fas fa-list-check', send: 'fas fa-paper-plane', setfields: 'fas fa-arrow-right-arrow-left', web: 'fas fa-globe'};

    const nfmt = (x, d) => new Intl.NumberFormat('es-CO', {minimumFractionDigits: d || 0, maximumFractionDigits: d || 0}).format(x);
    const money = (x, d) => (x < 0 ? '-' : '') + '$ ' + nfmt(Math.abs(x), d);
    const calcText = (f, v) => v == null || !Number.isFinite(v) ? '—' : f.format === 'money' ? money(v, f.decimals) : f.format === 'percent' ? nfmt(v * 100, f.decimals) + ' %' : f.format === 'integer' ? nfmt(Math.round(v), 0) : nfmt(v, f.decimals || 0);

    function fieldHtml(f, v, idx) {
        const id = 'f' + idx + '-' + f.key, req = f.required ? ' <span class="ch-if-req">*</span>' : '', help = f.help ? `<div class="ch-if-help">${esc(f.help)}</div>` : '';
        if (f.type === 'heading') { return `<div class="ch-if-h">${esc(f.label)}</div>`; }
        if (f.type === 'calc') { return `<div class="ch-if-f ${f.width === 'half' ? 'half' : ''}"><label>${esc(f.label)}</label><input class="form-control ch-if-calc" readonly tabindex="-1" data-calc="${f.key}">${f.help ? `<div class="ch-if-help">${esc(f.help)}</div>` : ''}</div>`; }
        if (f.type === 'plan') { return `<div class="ch-if-f"><label>${esc(f.label)}</label><div class="ch-if-plan" data-plan="${f.key}"></div>${f.help ? `<div class="ch-if-help">${esc(f.help)}</div>` : ''}</div>`; }
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
            if (f.type === 'heading' || f.type === 'calc' || f.type === 'plan') { return; }
            const el = root.querySelector(`[data-k="${f.key}"]`); if (!el) { return; }
            if (f.type === 'multiselect') { out[f.key] = [...el.querySelectorAll('input:checked')].map(i => i.value); }
            else if (f.type === 'bool') { const c = el.querySelector('input:checked'); out[f.key] = c ? c.value === '1' : null; }
            else { out[f.key] = el.value; }
        });
        return out;
    }

    // Recalcula en pantalla los campos de fórmula y los planes de pagos con lo que hay escrito (el Hub los vuelve a calcular al guardar)
    function recalc(root, form) {
        const vals = collect(root, form), env = {};
        form.fields.forEach(f => {
            if (f.type === 'number' || f.type === 'money') { const t = String(vals[f.key] == null ? '' : vals[f.key]).trim(); let n = NaN; if (t) { let c = t.replace(/[^\d.,-]/g, ''); if (c.includes(',') && c.includes('.')) { c = c.lastIndexOf(',') > c.lastIndexOf('.') ? c.replace(/\./g, '').replace(',', '.') : c.replace(/,/g, ''); } else if ((c.match(/\./g) || []).length > 1 || (c.match(/,/g) || []).length > 1) { c = c.replace(/[.,]/g, ''); } else if (c.includes(',')) { const p = c.split(','); c = p[1].length === 3 ? p[0] + p[1] : p[0] + '.' + p[1]; } else if (c.includes('.')) { const p = c.split('.'); if (p[1].length === 3 && p[0].length <= 3 && !/^-?0?$/.test(p[0])) { c = p[0] + p[1]; } } n = parseFloat(c); } env[f.key] = Number.isFinite(n) ? n : 0; vals[f.key] = Number.isFinite(n) ? n : null; }
            else if (f.type === 'bool' && vals[f.key] != null) { env[f.key] = vals[f.key] ? 1 : 0; }
        });
        const calcs = form.fields.filter(f => f.type === 'calc');
        for (let pass = 0; pass <= calcs.length; pass++) { let ch = false; calcs.forEach(f => { let v = null; try { v = F.evaluate(f.formula, env); if (f.decimals) { v = F.round(v, f.decimals); } else if (f.format === 'money' || f.format === 'integer') { v = Math.round(v); } } catch (e) { v = null; } const nv = v == null ? 0 : v; if (env[f.key] !== nv || vals[f.key] === undefined) { env[f.key] = nv; ch = true; } vals[f.key] = v; }); if (!ch) { break; } }
        calcs.forEach(f => { const el = root.querySelector(`[data-calc="${f.key}"]`); if (el) { let msg = ''; try { F.evaluate(f.formula, env); } catch (e) { msg = e.message; } el.value = calcText(f, vals[f.key]); el.title = msg; el.classList.toggle('err', !!msg && !/cero/.test(msg)); } });
        form.fields.filter(f => f.type === 'plan').forEach(f => {
            const box = root.querySelector(`[data-plan="${f.key}"]`); if (!box) { return; }
            const pl = f.plan; let sch = null, err = '';
            try { const sv = vals[pl.startField]; sch = F.schedule({principal: F.evaluate(pl.principal, env), rate: F.evaluate(pl.rate, env), n: F.evaluate(pl.periods, env), method: pl.method, rateType: pl.rateType, freq: pl.freq, decimals: pl.decimals || 0, start: sv && /^\d{4}-\d{2}-\d{2}/.test(sv) ? new Date(sv + 'T12:00:00') : new Date(), firstIsStart: !!(sv && /^\d{4}-\d{2}-\d{2}/.test(sv))}); } catch (e) { err = e.message; }
            if (!sch || err) { box.innerHTML = `<div class="ch-muted">${esc(err && !/cero/.test(err) ? err : 'Completa los datos para ver el plan de pagos.')}</div>`; return; }
            const d = pl.decimals || 0;
            box.innerHTML = `<div class="ch-if-plan-sum"><span><b>${nfmt(sch.n)}</b> cuotas</span><span>Primera cuota <b>${money(sch.firstPay, d)}</b></span><span>Intereses <b>${money(sch.interest, d)}</b></span><span>Total a pagar <b>${money(sch.total, d)}</b></span></div>
                <div class="ch-if-plan-tbl"><table class="table"><thead><tr><th>N.º</th><th>Fecha</th><th>Cuota</th><th>Interés</th><th>Capital</th><th>Saldo</th></tr></thead><tbody>${sch.rows.map(r => `<tr><td>${r.n}</td><td>${r.date.split('-').reverse().join('/')}</td><td>${money(r.pay, d)}</td><td>${money(r.interest, d)}</td><td>${money(r.capital, d)}</td><td>${money(r.balance, d)}</td></tr>`).join('')}</tbody></table></div>`;
        });
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
            if (form.fields.some(f => f.type === 'calc' || f.type === 'plan')) { const rc = () => recalc(root, form); root.querySelector('.ch-if').addEventListener('input', rc); root.querySelector('.ch-if').addEventListener('change', rc); rc(); }
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
