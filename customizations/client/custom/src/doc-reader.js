// Leer un documento (PDF) en cualquier estado del lead. La lectura interna (propia, sin IA) es la opción por defecto: rápida y sin depender del servidor de IA; con IA es opcional, para
// documentos difíciles. La lectura corre en segundo plano en el servidor: si cierras la ventana sigue y un indicador te avisa cuando está lista para revisar.
define('custom:doc-reader', ['custom:ui', 'custom:tpl'], function (ChUi, Tpl) {
    const esc = v => ChUi.esc(v == null ? '' : v);
    const TARGET = f => f.to === 'note' ? 'Nota en el historial' : 'Campo del lead';
    const FIELD_LABEL = {creditScore: 'Puntaje de crédito', totalDebt: 'Deuda total', overdueDebt: 'Deuda en mora', monthlyIncome: 'Ingresos mensuales', creditorCount: 'Cantidad de acreedores',
        maxDaysOverdue: 'Máx. días de mora', defaultCount: 'Obligaciones castigadas', identificationType: 'Tipo de documento', identification: 'Identificación', processResult: 'Resultado de procesos', description: 'Descripción (añade al final)', creditSummary: 'Resumen financiero', defaultHistory: 'Detalle de obligaciones'};
    const DEST = [['note', 'Nota en el historial'], ...Object.keys(FIELD_LABEL).map(k => ['field:' + k, 'Campo: ' + FIELD_LABEL[k]])];
    const ENGINE_LABEL = {internal: 'lectura interna', ai: 'IA'};

    function open(model, onDone, opts) {
        opts = opts || {};
        return ChUi.panel({title: 'Leer documento (PDF)', icon: 'fas fa-file-pdf', close: 'Cerrar', mount: (body, close) => {
            body.classList.add('ch-doc');
            body.innerHTML = '<div class="ch-muted">Cargando…</div>';
            let profiles = [], file = null, run = null, attId = null, profileId = 'auto', engine = 'internal', reading = null, finished = false;
            const q = s => body.querySelector(s);
            const err = m => { const e = q('[data-role="err"]'); if (e) { e.hidden = !m; e.textContent = m || ''; } };
            const watch = () => { try { window.dispatchEvent(new CustomEvent('ch-doc-watch')); } catch (e) { /* noop */ } };

            // al cerrar con una lectura en curso, sigue en el servidor: se avisa y se activa el indicador global
            const obs = new MutationObserver(() => { if (!body.isConnected) { obs.disconnect(); if (reading && !finished) { Espo.Ui.success('La lectura sigue en curso. Te aviso aquí abajo cuando termine.'); watch(); } } });
            obs.observe(document.body, {childList: true, subtree: true});

            function stepOne() {
                reading = null;
                body.innerHTML = `<p class="ch-muted">Sube un PDF (por ejemplo la historia de crédito, la cédula o un soporte de ingresos). El sistema lo lee y te muestra los datos que encuentra; <b>tú eliges cuáles tener en cuenta</b> antes de guardarlos.</p>
                    <label class="ch-dlg-label">Qué leer</label><select class="form-control" data-role="prof">${profiles.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select>
                    <div class="ch-doc-hint ch-muted" data-role="hint"></div>
                    <label class="ch-dlg-label">Cómo leerlo</label>
                    <div class="ch-doc-eng"><label><input type="radio" name="eng" value="internal" checked> <b>Lectura interna</b> <small>rápida, propia del sistema, sin IA (recomendada)</small></label>
                    <label><input type="radio" name="eng" value="ai"> <b>Con IA</b> <small>más lenta; para documentos difíciles o sin formato fijo</small></label></div>
                    <label class="ch-doc-drop" data-role="drop"><input type="file" accept="application/pdf,.pdf" hidden><span class="fas fa-cloud-arrow-up"></span><b data-role="fname">Elige o arrastra el PDF aquí</b><small>Solo PDF con texto (no imágenes escaneadas), hasta 15 MB</small></label>
                    <div class="ch-chat-err" data-role="err" hidden></div>
                    <div class="ch-mail-actions"><button class="btn btn-primary btn-sm" data-act="read" disabled><span class="fas fa-wand-magic-sparkles"></span> Leer documento</button></div>`;
                const sel = q('[data-role="prof"]'), hint = () => {
                    const p = profiles.find(x => x.id === sel.value); q('[data-role="hint"]').textContent = !p ? '' : (p.auto ? 'Muestra todos los datos que encuentra; tú eliges cuáles conservar y dónde guardarlos.' : 'Extrae: ' + p.fields.map(f => f.label).join(', '));
                    if (p && p.engine === 'ai') { body.querySelector('input[name="eng"][value="ai"]').checked = true; } };
                sel.onchange = hint; sel.value = profileId; hint();
                const inp = q('input[type=file]'), set = f => { file = f; q('[data-role="fname"]').textContent = f ? f.name : 'Elige o arrastra el PDF aquí'; q('[data-act="read"]').disabled = !f; };
                inp.onchange = () => { const f = inp.files[0]; if (f && !/pdf/i.test(f.type + f.name)) { err('Solo se aceptan archivos PDF.'); set(null); return; } if (f && f.size > 15 * 1024 * 1024) { err('El PDF supera los 15 MB.'); set(null); return; } err(''); set(f || null); };
                const drop = q('[data-role="drop"]');
                ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('on'); }));
                ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('on'); }));
                drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) { inp.files = e.dataTransfer.files; inp.onchange(); } });
                q('[data-act="read"]').onclick = () => { profileId = sel.value; engine = body.querySelector('input[name="eng"]:checked').value; upload(); };
            }

            function waiting(txt) {
                body.innerHTML = `<div class="ch-doc-wait"><span class="ch-spin"></span><b>${esc(txt || 'Leyendo el documento…')}</b><small></small><div class="ch-muted" style="margin-top:6px">Puedes cerrar esta ventana: la lectura sigue en segundo plano y te aviso cuando esté lista.</div></div>`;
            }

            function upload() {
                waiting('Subiendo el documento…');
                const fr = new FileReader();
                fr.onload = () => {
                    Espo.Ajax.postRequest('Attachment', {name: file.name, type: 'application/pdf', size: file.size, role: 'Attachment', relatedType: 'Lead', field: 'creditPdf', file: fr.result})
                        .then(a => { attId = a.id; return startRead(); }).catch(fail);
                };
                fr.readAsDataURL(file);
            }

            function startRead() {
                waiting(engine === 'ai' ? 'Leyendo el documento con IA…' : 'Leyendo el documento…');
                return Espo.Ajax.postRequest('CrmHub/docExtract', {leadId: model.id, attachmentId: attId, profileId, engine})
                    .then(r => { reading = r.runId; watch(); return poll(r.runId); }).then(done).catch(fail);
            }

            function fail(x) {
                if (x === null) { return; }
                reading = null;
                if (x && x.reason !== undefined) { stepOne(); err(x.reason || x.message); return; }
                if (x && x.message && !x.getResponseHeader) { stepOne(); err(x.message); return; }
                if (x) { x.errorIsHandled = true; }
                stepOne(); err(Tpl.reason(x, 'No se pudo leer el documento.'));
            }

            function done(r) {
                finished = true; reading = null; run = r; attId = r.attachmentId || attId; profileId = r.mode === 'auto' ? 'auto' : (r.profile && r.profile.id) || profileId; engine = r.engine || engine;
                if (r.mode === 'auto') { reviewAuto(); } else { review(); }
            }

            // consulta el avance cada 2-3 s; si cierras la ventana deja de preguntar aquí (el indicador global toma el relevo)
            function poll(runId) {
                const t0 = Date.now();
                return new Promise((resolve, reject) => {
                    const tick = () => {
                        if (!body.isConnected) { reject(null); return; }
                        Espo.Ajax.getRequest('CrmHub/docRun', {leadId: model.id, runId}).then(r => {
                            if (r.status === 'read' || r.status === 'applied') { resolve(r); return; }
                            if (r.status === 'failed') { const e = new Error(r.error || 'No se pudo leer el documento.'); e.reason = r.error; reject(e); return; }
                            const w = body.querySelector('.ch-doc-wait small'), sec = Math.round((Date.now() - t0) / 1000);
                            if (w) { w.textContent = 'Llevo ' + sec + ' s. ' + (sec > 60 ? 'El servidor está atendiendo varias lecturas; sigue en curso.' : ''); }
                            if (sec > 900) { reject(new Error('La lectura tardó demasiado. Inténtalo de nuevo en unos minutos.')); return; }
                            setTimeout(tick, 2000);
                        }).catch(reject);
                    };
                    tick();
                });
            }

            function engineBar(count) {
                const used = ENGINE_LABEL[run.engine] || 'lectura interna';
                const low = count === 0 || (run.engine !== 'ai' && count < 3);
                return `<div class="ch-doc-engbar ${low ? 'warn' : ''}"><span class="fas ${run.engine === 'ai' ? 'fa-wand-magic-sparkles' : 'fa-gears'}"></span> Leído con ${esc(used)}.` +
                    (run.engine !== 'ai' ? ` ${low ? '<b>Encontré pocos datos.</b>' : ''} <a data-act="useai">${low ? 'Intentar con IA' : 'Mejorar con IA'}</a>` : '') + '</div>';
            }

            function retryWithAi() { engine = 'ai'; startRead(); }

            // Lectura libre: el usuario marca cuáles datos conservar, los corrige y elige dónde se guardan
            function reviewAuto() {
                const items = run.items || [];
                const sel = (v, i) => `<select class="form-control input-sm" data-d="${i}">${DEST.map(([k, l]) => `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
                body.innerHTML = engineBar(items.length) + `<p class="ch-muted">Esto es lo que encontré en el documento (<b>${esc(run.documentType)}</b>). <b>Marca los datos que quieres tener en cuenta</b> para validar al cliente, corrige lo que haga falta y elige dónde guardar cada uno.</p>` +
                    (items.length ? `<div class="ch-doc-bar"><a data-act="all">Marcar todo</a> · <a data-act="none">Quitar todo</a></div><table class="table ch-doc-tbl"><tbody>` +
                    items.map((it, i) => `<tr><td style="width:28px"><input type="checkbox" data-c="${i}" checked></td><td><input class="form-control input-sm" data-l="${i}" value="${esc(it.label)}"></td><td><input class="form-control input-sm" data-v="${i}" value="${esc(it.value)}"></td><td style="width:34%">${sel(it.to, i)}</td></tr>`).join('') +
                    `</tbody></table><label class="ch-dz-chk"><input type="checkbox" data-role="rem"> Recordar esta selección para documentos del mismo tipo</label><input class="form-control input-sm" data-role="remname" value="${esc(run.documentType)}" maxlength="80" placeholder="Nombre del tipo de documento" hidden>`
                    : '<div class="ch-chat-err">No encontré datos con esta lectura.</div>') +
                    `<div class="ch-chat-err" data-role="err" hidden></div><div class="ch-mail-actions">${items.length ? '<button class="btn btn-primary btn-sm" data-act="apply"><span class="fas fa-check"></span> Guardar los marcados</button>' : ''}<button class="btn btn-default btn-sm" data-act="again">Leer otro documento</button></div>`;
                q('[data-act="again"]').onclick = stepOne;
                const ua = q('[data-act="useai"]'); if (ua) { ua.onclick = retryWithAi; }
                if (!items.length) { return; }
                const rem = q('[data-role="rem"]'); rem.onchange = () => { q('[data-role="remname"]').hidden = !rem.checked; };
                body.querySelectorAll('[data-act="all"],[data-act="none"]').forEach(a => { a.onclick = () => body.querySelectorAll('[data-c]').forEach(c => { c.checked = a.dataset.act === 'all'; }); });
                q('[data-act="apply"]').onclick = () => {
                    const chosen = [...body.querySelectorAll('[data-c]')].filter(c => c.checked).map(c => { const i = c.dataset.c; return {label: body.querySelector(`[data-l="${i}"]`).value.trim(), value: body.querySelector(`[data-v="${i}"]`).value.trim(), to: body.querySelector(`[data-d="${i}"]`).value, type: items[i].type}; }).filter(x => x.label && x.value);
                    if (!chosen.length) { err('Marca al menos un dato para guardar.'); return; }
                    const b = q('[data-act="apply"]'); b.disabled = true;
                    Espo.Ajax.postRequest('CrmHub/docApply', {leadId: model.id, runId: run.runId, items: chosen})
                        .then(() => rem.checked ? Espo.Ajax.postRequest('CrmHub/docRemember', {leadId: model.id, name: q('[data-role="remname"]').value.trim() || run.documentType, items: chosen}).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.warning('Los datos se guardaron, pero no se pudo recordar la selección.'); }) : null)
                        .then(() => { Espo.Ui.success('Datos guardados en el lead'); model.fetch(); watch(); onDone && onDone(); close(true); })
                        .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } err(Tpl.reason(xhr, 'No se pudo guardar.')); b.disabled = false; });
                };
            }

            function review() {
                const f = run.profile.fields, found = f.filter(x => run.values[x.key] != null && run.values[x.key] !== '').length;
                body.innerHTML = engineBar(found) + `<p class="ch-muted">Esto leí en «${esc(run.profile.name)}». Corrige lo que haga falta; solo se guardan los datos con valor.</p><table class="table ch-doc-tbl"><tbody>` +
                    f.map(x => `<tr><td><b>${esc(x.label)}</b><div class="ch-muted">${TARGET(x)}</div></td><td>${x.type === 'text' && String(run.values[x.key] || '').length > 70 ? `<textarea class="form-control" rows="3" data-k="${esc(x.key)}">${esc(run.values[x.key])}</textarea>` : `<input class="form-control" data-k="${esc(x.key)}" value="${esc(run.values[x.key])}" placeholder="No se encontró en el documento">`}</td></tr>`).join('') +
                    `</tbody></table><div class="ch-chat-err" data-role="err" hidden></div><div class="ch-mail-actions"><button class="btn btn-primary btn-sm" data-act="apply"><span class="fas fa-check"></span> Guardar en el lead</button><button class="btn btn-default btn-sm" data-act="again">Leer otro documento</button></div>`;
                q('[data-act="again"]').onclick = stepOne;
                const ua = q('[data-act="useai"]'); if (ua) { ua.onclick = retryWithAi; }
                q('[data-act="apply"]').onclick = () => {
                    const values = {}; body.querySelectorAll('[data-k]').forEach(el => { const t = f.find(x => x.key === el.dataset.k).type; let v = el.value.trim(); if (v === '') { values[el.dataset.k] = null; return; } values[el.dataset.k] = (t === 'number' || t === 'integer') ? Number(v.replace(/[^\d.\-]/g, '')) : (t === 'bool' ? /^(s|si|sí|true|1)/i.test(v) : v); });
                    const b = q('[data-act="apply"]'); b.disabled = true;
                    Espo.Ajax.postRequest('CrmHub/docApply', {leadId: model.id, runId: run.runId, values}).then(() => { Espo.Ui.success('Datos guardados en el lead'); model.fetch(); watch(); onDone && onDone(); close(true); })
                        .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } err(Tpl.reason(xhr, 'No se pudo guardar.')); b.disabled = false; });
                };
            }

            Espo.Ajax.getRequest('CrmHub/docProfiles').then(r => {
                profiles = [{id: 'auto', name: 'Detectar los datos automáticamente (recomendado)', auto: true, fields: []}].concat((r.profiles || []).map(p => Object.assign({}, p, {engine: p.engine || (p.id === 'resumen' ? 'ai' : 'internal')})));
                if (opts.runId) {   // se abre una lectura que ya estaba en curso o lista (desde el indicador)
                    waiting('Recuperando la lectura…'); reading = opts.runId;
                    poll(opts.runId).then(done).catch(fail);
                } else { stepOne(); }
            }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } body.innerHTML = '<div class="ch-chat-err">No se pudieron cargar los tipos de documento.</div>'; });
        }});
    }
    return {open};
});
