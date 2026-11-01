/**
 * Prospección saliente: la fuerza comercial de IA de la empresa. Pestañas: Prospectos (importar CSV, validar, puntuar, enriquecer con IA y pasar al CRM), Cliente ideal (ICP),
 * Secuencia (solo administradores: activar la prospección, plantilla de WhatsApp oficial, cuota de correos y variantes A/B por paso, con sus resultados) y No contactar.
 * Endpoints: GET CrmHub/prospects, outboundStats, dnc, agentConfig; POST prospectsImport/Enrich/Promote/Delete/Icp, dncAdd/Remove y agentConfigSave.
 */
define('custom:views/prospects', ['view', 'custom:ui'], function (Dep, ChUi) {
    const esc = v => ChUi.esc(v == null ? '' : v);
    const ST = {ready: ['Listo', 'ok'], imported: ['En el CRM', 'pri'], rejected: ['Rechazado', 'bad'], new: ['Nuevo', '']};
    const STEPS = ['Primer contacto', 'Seguimiento a las 72 h', 'Último intento (+5 días)'];

    // CSV sencillo con comillas; separador coma, punto y coma o tabulación
    function parseCsv(text) {
        const first = text.split(/\r?\n/)[0] || '', sep = [',', ';', '\t'].map(s => [s, first.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
        const rows = []; let row = [], cur = '', q = false;
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else { q = false; } } else { cur += c; } }
            else if (c === '"') { q = true; }
            else if (c === sep) { row.push(cur); cur = ''; }
            else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') { i++; } row.push(cur); cur = ''; if (row.some(x => x.trim())) { rows.push(row); } row = []; }
            else { cur += c; }
        }
        row.push(cur); if (row.some(x => x.trim())) { rows.push(row); }
        const head = (rows.shift() || []).map(h => h.trim());
        return rows.map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
    }


    const KIND = {variant: 'Variante', style: 'Estilo', niche_pause: 'Nicho'};
    function growthHtml(g) {
        const ch = g.channels.length ? `<table><thead><tr><th>Canal</th><th>Envíos</th><th>Respuestas</th><th>Tasa</th><th>Mínimo</th><th>Entrega</th></tr></thead><tbody>${g.channels.map(c => `<tr><td>${c.channel === 'whatsapp' ? 'WhatsApp' : c.channel === 'email' ? 'Correo' : esc(c.channel)}</td><td>${c.sends}</td><td>${c.replies}</td><td><b>${c.rate}%</b></td><td>${c.target != null ? c.target + '%' : '—'}</td><td>${c.delivery != null ? c.delivery + '%' : '—'}</td></tr>`).join('')}</tbody></table>` : '<p class="ch-muted">Aún no hay envíos en frío en los últimos 30 días.</p>';
        const ni = g.niches.length ? `<table><thead><tr><th>Nicho</th><th>Contactados</th><th>Respondieron</th><th>Tasa</th><th></th></tr></thead><tbody>${g.niches.map(n => `<tr><td>${esc(n.niche)}${n.paused ? ' <span class="ch-pr-tag bad">En pausa</span>' : ''}</td><td>${n.leads}</td><td>${n.replied}</td><td>${n.rate}%</td><td><button class="btn btn-link btn-sm" data-gr="niche" data-n="${esc(n.niche)}" data-p="${n.paused ? 0 : 1}">${n.paused ? 'Reanudar' : 'Pausar'}</button></td></tr>`).join('')}</tbody></table>` : '';
        const lg = g.log.length ? `<table><thead><tr><th>Cuándo</th><th>Ajuste</th><th></th></tr></thead><tbody>${g.log.map(x => `<tr><td>${esc(ChUi.fmt.dt(x.at))}</td><td><span class="ch-pr-tag">${KIND[x.kind] || x.kind}</span> ${esc(x.title)}<small>${esc(x.reason)}${x.kind === 'variant' ? ' · nuevo enfoque: ' + esc((x.payload.new || {}).angle || '') : x.kind === 'style' ? ' · ' + esc(x.payload.after || '') : ''}</small></td>` +
            `<td>${x.reverted ? '<span class="ch-pr-tag">Revertido</span>' : x.applied ? `<button class="btn btn-link btn-sm" data-gr="revert" data-id="${x.id}">Revertir</button>` : `<button class="btn btn-primary btn-sm" data-gr="apply" data-id="${x.id}">Aplicar</button>`}</td></tr>`).join('')}</tbody></table>` : '<p class="ch-muted">Todavía no ha hecho ajustes.</p>';
        return `<div class="ch-pr-gr"><div class="ch-pr-bar"><button type="button" class="btn btn-default btn-sm" data-gr="run">Analizar ahora (solo proponer)</button><button type="button" class="btn btn-default btn-sm" data-gr="runapply">Analizar y aplicar</button>` +
            `<span class="ch-muted">${g.lastRun ? 'Última tarea diaria: ' + esc(g.lastRun) : 'Aún no se ha ejecutado la tarea diaria.'}${g.dry_run ? ' · El comercial está en modo prueba: no hay respuestas reales que analizar.' : ''}</span></div>` +
            `<h6>Resultados por canal (30 días)</h6><div class="ch-pr-tbl">${ch}</div>${ni ? `<h6>Resultados por nicho</h6><div class="ch-pr-tbl">${ni}</div>` : ''}<h6>Historial de ajustes</h6><div class="ch-pr-tbl">${lg}</div></div>`;
    }

    return class extends Dep {
        templateContent = '<div class="ch-pr"></div>'
        tab = 'list'
        d = null
        f = {status: '', batch: '', q: ''}
        sel = new Set()

        setup() { this.getHelper().pageTitle.setTitle('Prospección'); this.load(); }
        afterRender() { this.draw(); }

        load() {
            Espo.Ajax.getRequest('CrmHub/outboundFunnel', {days: 30}).then(r => { this.fun = r; if (this.tab === 'list' && this.d && !this.d.error) { this.drawList(this.el.querySelector('.ch-pr-body')); } }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } });
            return Espo.Ajax.getRequest('CrmHub/prospects', this.f).then(r => { this.d = r; this.draw(); })
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } this.d = {error: true}; this.draw(); });
        }

        draw() {
            const root = this.el && this.el.querySelector('.ch-pr'); if (!root) { return; }
            const d = this.d;
            if (!d) { root.innerHTML = '<div class="ch-muted" style="padding:24px">Cargando…</div>'; return; }
            if (d.error) { root.innerHTML = '<div class="ch-chat-err">Solo gerentes, directores y supervisores pueden usar la prospección.</div>'; return; }
            const tabs = [['list', 'Prospectos'], ['icp', 'Cliente ideal'], ['finder', 'Buscador'], ...(d.isAdmin ? [['seq', 'Secuencia y resultados']] : []), ['dnc', 'No contactar']];
            root.innerHTML = `<div class="ch-rc-top"><div><h3>Prospección</h3><p class="ch-muted">Carga prospectos, deja que la IA los valide y puntúe, y los comerciales virtuales los contactan respetando horarios legales, la lista de no contactar y los permisos de cada canal.</p></div></div>` +
                `<div class="ch-pr-tabs">${tabs.map(([k, l]) => `<button type="button" data-tab="${k}" class="${this.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div><div class="ch-pr-body"></div>`;
            const body = root.querySelector('.ch-pr-body');
            root.querySelector('.ch-pr-tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) { this.tab = b.dataset.tab; this.draw(); } };
            ({list: () => this.drawList(body), icp: () => this.drawIcp(body), finder: () => this.drawFinder(body), seq: () => this.drawSeq(body), dnc: () => this.drawDnc(body)})[this.tab]();
        }

        // ---------- prospectos
        drawList(body) {
            const d = this.d, c = d.counts || {}, icp = d.icp || {};
            body.classList.add('is-list');   // título, pestañas, tarjetas, botones y filtros quedan fijos; solo la lista se desplaza (con sus encabezados fijos)
            const rows = (d.items || []).map(i => { const [l, k] = ST[i.status] || [i.status, '']; const en = i.enrichment || {};
                return `<tr><td><input type="checkbox" data-sel="${i.id}" ${this.sel.has(i.id) ? 'checked' : ''} ${i.status === 'imported' ? 'disabled' : ''}></td><td><b>${esc(i.name)}</b>${i.origin === 'finder' ? ' <span class="ch-pr-tag" title="Hallado por el buscador en internet: contacto frío">Buscador</span>' : ''}<small>${esc([i.title, i.company].filter(Boolean).join(' · '))}</small>${i.origin === 'finder' && (i.raw || {}).fuente_url ? `<small>Fuente: <a href="${esc(String((i.raw || {}).fuente_url).split(' ')[0])}" target="_blank" rel="noopener noreferrer">ver página</a></small>` : ''}</td>` +
                    `<td>${esc(i.email)}<small>${esc(i.phone)}</small></td><td>${esc(i.industry || '—')}<small>${esc(i.country)} · ${esc((i.segment || '').toUpperCase())}</small></td><td>${i.score == null ? '—' : `<span class="ch-pr-sc" title="${esc(en.reason || '')}">${i.score}</span>`}${en.pain ? `<small>${esc(en.pain)}</small>` : ''}</td>` +
                    `<td><span class="ch-pr-tag ${k}">${l}</span>${i.reason ? `<small>${esc(i.reason)}</small>` : ''}${i.lead_id ? `<small><a href="#Lead/view/${esc(i.lead_id)}">Ver lead</a></small>` : ''}</td></tr>`; }).join('');
            const fu = this.fun, pct = (a, b) => b ? Math.round(a * 100 / b) + '%' : '—';
            const funnel = fu ? `<div class="ch-pr-fun"><h5>Embudo de los últimos 30 días</h5><div class="ch-pr-stats ch-pr-stats5"><div><b>${fu.contacted}</b><span>Contactados</span></div><div><b>${fu.replied}</b><span>Respondieron · ${pct(fu.replied, fu.contacted)}</span></div>` +
                `<div><b>${fu.demos}</b><span>Demos agendadas · ${pct(fu.demos, fu.replied)} de los que respondieron</span></div><div><b>${fu.escalated}</b><span>Pasaron a una persona</span></div></div>` +
                (fu.intents.length ? `<div class="ch-pr-vs">${fu.intents.map(x => `<span class="ch-pr-v"><b>${esc(x.label)}</b> ${x.n}</span>`).join('')}</div>` : '') + '</div>' : '';
            body.innerHTML = funnel + `<div class="ch-pr-stats"><div><b>${c.ready || 0}</b><span>Listos</span></div><div><b>${c.imported || 0}</b><span>En el CRM</span></div><div><b>${d.promotedToday || 0}/${icp.daily_limit || 0}</b><span>Pasados hoy</span></div><div><b>${c.rejected || 0}</b><span>Rechazados</span></div></div>` +
                `<div class="ch-pr-bar"><button class="btn btn-primary" data-a="import"><span class="fas fa-file-import"></span> Importar CSV</button><button class="btn btn-default" data-a="enrich"><span class="fas fa-wand-magic-sparkles"></span> Enriquecer con IA</button><button class="btn btn-default" data-a="verify" title="Comprueba que cada correo exista, sin enviarle nada"><span class="fas fa-envelope-circle-check"></span> Validar correos</button>` +
                `<button class="btn btn-success" data-a="promote"><span class="fas fa-paper-plane"></span> Pasar al CRM los mejores</button><button class="btn btn-default" data-a="promotesel" ${this.sel.size ? '' : 'disabled'}>Pasar seleccionados (${this.sel.size})</button><button class="btn btn-default" data-a="del" ${this.sel.size ? '' : 'disabled'}><span class="far fa-trash-can"></span></button><input type="file" accept=".csv,text/csv,.txt" style="display:none" data-file></div>` +
                `<div class="ch-pr-filters"><input class="form-control" data-f="q" placeholder="Buscar por nombre, empresa, correo o teléfono" value="${esc(this.f.q)}"><select class="form-control" data-f="status"><option value="">Todos los estados</option>${Object.entries(ST).map(([k, v]) => `<option value="${k}" ${this.f.status === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select>` +
                `<select class="form-control" data-f="batch"><option value="">Todos los lotes</option>${(d.batches || []).map(b => `<option ${this.f.batch === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></div>` +
                (rows ? `<div class="ch-pr-tbl"><table><thead><tr><th></th><th>Prospecto</th><th>Contacto</th><th>Sector</th><th>Puntaje</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table></div>`
                    : ChUi.empty({kind: 'search', title: 'Aún no hay prospectos', text: 'Importa un CSV con columnas como nombre, empresa, cargo, correo, teléfono, país y sector. La IA valida cada fila y calcula qué tan bien encaja con tu cliente ideal.'}));
            const flt = e => { const k = e.target.dataset.f; this.f[k] = e.target.value; clearTimeout(this._t); this._t = setTimeout(() => this.load(), k === 'q' ? 400 : 0); };
            body.querySelectorAll('[data-f]').forEach(x => { x.oninput = flt; x.onchange = flt; });
            body.onclick = e => this.listClick(e, body);
            body.querySelector('[data-file]').onchange = e => { const f = e.target.files[0]; if (f) { this.importFile(f); } e.target.value = ''; };
        }

        listClick(e, body) {
            const ck = e.target.closest('[data-sel]'); if (ck) { const id = +ck.dataset.sel; if (ck.checked) { this.sel.add(id); } else { this.sel.delete(id); } this.drawList(body); return; }
            const b = e.target.closest('[data-a]'); if (!b) { return; } const k = b.dataset.a;
            if (k === 'import') { body.querySelector('[data-file]').click(); }
            else if (k === 'verify') { Espo.Ajax.postRequest('CrmHub/prospectsVerify', {}).then(r => { Espo.Ui.success(`Comprobando ${r.queued} correos sin enviarles nada; los que no existan pasan a «Rechazado». Recarga en un momento.`); setTimeout(() => this.load(), 20000); }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('No se pudo iniciar la validación.'); }); }
            else if (k === 'enrich') { Espo.Ajax.postRequest('CrmHub/prospectsEnrich', {}).then(() => { Espo.Ui.success('La IA está analizando los prospectos pendientes; recarga en un momento.'); setTimeout(() => this.load(), 8000); }); }
            else if (k === 'promote' || k === 'promotesel') {
                const ids = k === 'promotesel' ? [...this.sel] : [];
                ChUi.confirm({title: 'Pasar al CRM', ok: 'Pasar', html: k === 'promotesel' ? `Se crean <b>${ids.length}</b> leads de «Prospección IA» y los comerciales virtuales empiezan a contactarlos.` :
                    `Se pasan los prospectos listos con mejor puntaje (mínimo <b>${(this.d.icp || {}).min_score}</b>), hasta el tope diario de <b>${(this.d.icp || {}).daily_limit}</b>. Los comerciales virtuales empiezan a contactarlos según su secuencia.`}).then(y => {
                    if (!y) { return; } Espo.Ui.notify('Creando los leads…');
                    Espo.Ajax.postRequest('CrmHub/prospectsPromote', {ids}).then(r => { Espo.Ui.notify(false); this.sel.clear(); Espo.Ui.success(`${r.created} leads creados${r.limit_reached ? ' (tope diario alcanzado)' : ''}${r.errors ? ` · ${r.errors} con error` : ''}`); this.load(); })
                        .catch(xhr => { Espo.Ui.notify(false); if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('No se pudieron pasar los prospectos.'); });
                });
            }
            else if (k === 'del') { ChUi.confirm({title: 'Eliminar prospectos', danger: true, ok: 'Eliminar', text: `Se borran ${this.sel.size} prospectos (los que ya pasaron al CRM se conservan).`}).then(y => { if (y) { Espo.Ajax.postRequest('CrmHub/prospectsDelete', {ids: [...this.sel]}).then(() => { this.sel.clear(); this.load(); }); } }); }
        }

        async importFile(file) {
            const rows = parseCsv(await file.text()); if (!rows.length) { Espo.Ui.warning('El archivo no tiene filas.'); return; }
            const batch = file.name.replace(/\.[^.]+$/, '').slice(0, 40) + '-' + new Date().toISOString().slice(0, 10);
            Espo.Ui.notify(`Importando ${rows.length} filas…`);
            const tot = {received: 0, ready: 0, rejected: 0, reasons: {}};
            try {
                for (let i = 0; i < rows.length; i += 400) {
                    const r = await Espo.Ajax.postRequest('CrmHub/prospectsImport', {rows: rows.slice(i, i + 400), batch, defaultCountry: ((this.d.icp || {}).countries || ['CO'])[0] || 'CO', campaign: (this.d.icp || {}).campaign || '', enrich: true});
                    ['received', 'ready', 'rejected'].forEach(k => { tot[k] += r[k]; }); Object.entries(r.reasons || {}).forEach(([k, v]) => { tot.reasons[k] = (tot.reasons[k] || 0) + v; });
                }
            } catch (xhr) { Espo.Ui.notify(false); if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('No se pudo importar el archivo.'); return; }
            Espo.Ui.notify(false); this.f.batch = batch; await this.load();
            ChUi.notice({title: 'Importación lista', icon: 'fas fa-file-import', html: `<p><b>${tot.ready}</b> prospectos listos de ${tot.received}. La IA los está analizando para ponerles puntaje.</p>` + (tot.rejected ? `<p><b>${tot.rejected}</b> rechazados:</p><ul>${Object.entries(tot.reasons).map(([k, v]) => `<li>${esc(k)}: ${v}</li>`).join('')}</ul>` : '')});
            setTimeout(() => this.load(), 12000);
        }

        // ---------- cliente ideal
        // ---------- buscador (agente que investiga en internet)
        drawFinder(body) {
            body.innerHTML = '<div class="ch-muted" style="padding:16px">Cargando…</div>';
            Espo.Ajax.getRequest('CrmHub/finder').then(f => {
                const lr = f.last_run;
                body.innerHTML = `<div class="ch-pr-card"><h5><span class="fas fa-magnifying-glass"></span> ${esc(f.name)}</h5>` +
                    `<p class="ch-muted">Un agente que investiga en internet empresas que podrían necesitar lo que ofreces y las deja en <b>Prospectos</b> con la página pública donde halló el contacto. Usa el motor de IA de tu empresa (consume tokens y el cargo por búsqueda web).</p>` +
                    (f.licensed ? '' : '<div class="ch-chat-err">El buscador no está incluido en tu licencia. Pídelo al administrador del servicio.</div>') +
                    `<div class="ch-pr-g2"><div><label class="ch-pr-chk"><input type="checkbox" data-f2="enabled" ${f.enabled ? 'checked' : ''} ${f.licensed ? '' : 'disabled'}> <b>Buscador activo</b></label></div>` +
                    `<div><label>Tope de empresas por día</label><input class="form-control" type="number" min="1" max="100" data-f2="daily_limit" value="${f.daily_limit}" ${f.licensed ? '' : 'disabled'}></div></div>` +
                    `<div class="ch-pr-g2"><div><label class="ch-pr-chk"><input type="checkbox" data-f2="auto" ${f.auto ? 'checked' : ''} ${f.licensed ? '' : 'disabled'}> <b>Ciclo diario automático</b> <small>— busca, califica y pasa los mejores a Valeria</small></label></div>` +
                    `<div><label>Hora del ciclo (hora de la empresa)</label><input class="form-control" type="number" min="0" max="23" data-f2="hour" value="${f.hour}" ${f.licensed ? '' : 'disabled'}></div></div>` +
                    `<label>Los correos en frío salen…</label><select class="form-control" data-f2="autonomy" ${f.licensed ? '' : 'disabled'}><option value="approval" ${f.autonomy === 'auto' ? '' : 'selected'}>con la aprobación de una persona, uno a uno</option><option value="auto" ${f.autonomy === 'auto' ? 'selected' : ''}>solos, con tope diario y frenos automáticos (rebotes y bajas)</option></select>` +
                    `<label>Enfoque de la búsqueda (opcional)</label><textarea class="form-control" rows="3" data-f2="focus" placeholder="Ej.: clínicas de estética con varias sedes en Cali y Bogotá; fábricas de muebles de más de 20 empleados" ${f.licensed ? '' : 'disabled'}>${esc(f.focus)}</textarea>` +
                    `<div class="ch-pr-warn"><b>Reglas:</b> solo se guardan empresas con una página pública y un contacto de negocio publicado; nunca se adivinan correos. Los hallados son <b>contactos fríos</b>: no reciben WhatsApp ni SMS, el correo sale solo por un remitente aparte y <b>cada mensaje lo aprueba una persona</b>.</div>` +
                    `<p><button class="btn btn-primary" data-a="fsave" ${f.licensed ? '' : 'disabled'}><span class="fas fa-floppy-disk"></span> Guardar</button> <button class="btn btn-default" data-a="frun" ${f.licensed && f.enabled ? '' : 'disabled'}><span class="fas fa-play"></span> Buscar ahora</button> <button class="btn btn-default" data-a="fcycle" ${f.licensed && f.enabled ? '' : 'disabled'}><span class="fas fa-forward"></span> Ciclo completo ahora</button></p>` +
                    (f.pipeline_last ? `<p class="ch-muted">Último ciclo: ${esc(ChUi.fmt.dt(f.pipeline_last.at))} · ${f.pipeline_last.error ? 'error: ' + esc(f.pipeline_last.error) : `${(f.pipeline_last.finder || {}).ready || 0} nuevos · ${(f.pipeline_last.qualifier || {}).qualified || 0} calificados · ${(f.pipeline_last.qualifier || {}).passed || 0} pasados a Valeria`}</p>` : '') +
                    (lr ? `<p class="ch-muted">Última búsqueda: ${esc(ChUi.fmt.dt(lr.at))} · ${lr.found} empresas halladas · ${lr.ready} listas · lote ${esc(lr.batch)}</p>` : '<p class="ch-muted">Aún no ha buscado.</p>') + '</div>';
                const q = s => body.querySelector(s), fail = xhr => { Espo.Ui.notify(false); if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error((xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason')) || 'No se pudo completar.'); };
                const data = () => ({enabled: q('[data-f2=enabled]').checked, daily_limit: +q('[data-f2=daily_limit]').value || 20, focus: q('[data-f2=focus]').value, auto: q('[data-f2=auto]').checked, hour: +q('[data-f2=hour]').value, autonomy: q('[data-f2=autonomy]').value});
                q('[data-a=fsave]').onclick = () => Espo.Ajax.postRequest('CrmHub/finderSave', data()).then(() => { Espo.Ui.success('Guardado'); this.drawFinder(body); }).catch(fail);
                q('[data-a=fcycle]').onclick = () => ChUi.confirm({title: 'Ciclo completo', ok: 'Ejecutar', text: 'Busca empresas, las califica y pasa las mejores a Valeria, que les escribirá según la configuración (con aprobación o sola). Consume tokens y búsquedas.'}).then(y => {
                    if (!y) { return; } Espo.Ui.notify('Ejecutando el ciclo… puede tardar unos minutos');
                    Espo.Ajax.postRequest('CrmHub/pipelineRun', {}, {timeout: 600000}).then(r => { Espo.Ui.notify(false); Espo.Ui.success(`${(r.qualifier || {}).passed || 0} prospectos pasaron a Valeria`); this.drawFinder(body); }).catch(fail); });
                q('[data-a=frun]').onclick = () => ChUi.confirm({title: 'Buscar ahora', ok: 'Buscar', text: 'El agente investigará en internet y guardará prospectos nuevos. Consume tokens y búsquedas del proveedor de IA. No envía nada.'}).then(y => {
                    if (!y) { return; } Espo.Ui.notify('Buscando en internet… puede tardar un par de minutos');
                    Espo.Ajax.postRequest('CrmHub/finderRun', {}).then(r => { Espo.Ui.notify(false); Espo.Ui.success(`${r.ready || 0} prospectos nuevos${r.reason ? ' · ' + r.reason : ''}`); this.tab = 'list'; this.load(); }).catch(fail); });
            }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } body.innerHTML = '<div class="ch-chat-err">No se pudo cargar el buscador.</div>'; });
        }

        drawIcp(body) {
            const i = this.d.icp || {}, ls = v => esc((v || []).join(', '));
            body.innerHTML = `<div class="ch-pr-card"><h4>¿A quién le vendemos?</h4><p class="ch-muted">Con esto la IA decide qué tan bien encaja cada prospecto (0 a 100) y solo pasan al CRM los que superan el puntaje mínimo.</p>` +
                `<label>Descripción del cliente ideal</label><textarea class="form-control" rows="3" data-i="describe" maxlength="800" placeholder="Ej.: Pymes de servicios y comercio que venden por WhatsApp y necesitan ordenar su seguimiento comercial.">${esc(i.describe)}</textarea>` +
                `<div class="ch-pr-g2"><div><label>Sectores (separados por coma)</label><input class="form-control" data-i="industries" value="${ls(i.industries)}" placeholder="salud, comercio, servicios"></div><div><label>Países (código de 2 letras)</label><input class="form-control" data-i="countries" value="${ls(i.countries).toUpperCase()}" placeholder="CO, MX"></div>` +
                `<div><label>Cargos que decide (coma)</label><input class="form-control" data-i="titles" value="${ls(i.titles)}"></div><div><label>Tipo de cliente</label><select class="form-control" data-i="segments"><option value="b2b" ${(i.segments || []).join() === 'b2b' ? 'selected' : ''}>Empresas (B2B)</option><option value="b2c" ${(i.segments || []).join() === 'b2c' ? 'selected' : ''}>Personas (B2C)</option><option value="b2b,b2c" ${(i.segments || []).length > 1 ? 'selected' : ''}>Ambos</option></select></div>` +
                `<div><label>Puntaje mínimo para pasar al CRM</label><input class="form-control" type="number" min="0" max="100" data-i="min_score" value="${i.min_score}"></div><div><label>Tope de leads nuevos por día</label><input class="form-control" type="number" min="1" max="2000" data-i="daily_limit" value="${i.daily_limit}"></div>` +
                `<div><label>Campaña del CRM (opcional)</label><input class="form-control" data-i="campaign" value="${esc(i.campaign)}" placeholder="Nombre exacto de la campaña"></div></div><p><button class="btn btn-primary" data-a="save"><span class="fas fa-floppy-disk"></span> Guardar</button></p></div>`;
            body.querySelector('[data-a=save]').onclick = () => {
                const v = {}; body.querySelectorAll('[data-i]').forEach(x => { v[x.dataset.i] = x.value; });
                Espo.Ajax.postRequest('CrmHub/prospectsIcp', v).then(r => { this.d.icp = r; Espo.Ui.success('Cliente ideal guardado'); }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('No se pudo guardar.'); });
            };
        }

        // ---------- secuencia (administradores)
        drawSeq(body) {
            body.innerHTML = '<div class="ch-muted" style="padding:16px">Cargando…</div>';
            Promise.all([Espo.Ajax.getRequest('CrmHub/agentConfig', {}), Espo.Ajax.getRequest('CrmHub/outboundStats', {days: 60}), Espo.Ajax.getRequest('User', {maxSize: 200, select: 'name,isActive,type'}).catch(() => ({list: []})), Espo.Ajax.getRequest('CrmHub/growthOverview', {agentId: ''}).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } return null; })]).then(([ac, st, us, gr]) => {
                this.users = (us.list || []).filter(u => u.isActive && ['regular', 'admin'].includes(u.type));
                const cfg = ac.config, gc = cfg.growth || {enabled: false, mode: 'auto', min_sends: 30, wa_min_rate: 12, email_min_rate: 3, niche_pause_after: 300, hour: 3}, ob = cfg.outbound, cl = cfg.closer || {enabled: false, auto_book: true, demo_minutes: 15, host_user_id: '', signup_url: '', playbook: ''}, stats = {}; (st.items || []).forEach(x => { stats[x.step + '|' + x.variant] = x; });
                const wt = ob.wa_template, steps = ob.steps.slice(0, 3);
                body.innerHTML = `<div class="ch-pr-card"><h4>Comercial virtual saliente: ${esc((ac.name || cfg.persona.name))}</h4>` +
                    `<label class="ch-pr-chk"><input type="checkbox" data-o="enabled" ${ob.enabled ? 'checked' : ''}> <b>Prospección saliente activa</b> <small>— contacta a los leads de «Prospección IA» y aplica horarios legales, no contactar y cuota de correos.</small></label>` +
                    `<div class="ch-pr-warn">${cfg.dry_run ? '<b>Modo prueba:</b> el comercial virtual solo simula (no envía nada). ' : ''}${cfg.mode !== 'auto' ? '<b>Comercial en modo manual:</b> actívalo en «Comercial virtual» para que escriba. ' : ''}${cfg.approval ? 'Cada mensaje espera tu aprobación. ' : ''}Cambia estos ajustes en <a href="#CrmHub/agente">Comercial virtual</a>.</div>` +
                    `<div class="ch-pr-g2"><div><label>País por defecto</label><input class="form-control" data-o="country" maxlength="2" value="${esc(ob.country)}"></div><div><label>Tope de correos en frío por día (por remitente)</label><input class="form-control" type="number" min="1" max="200" data-o="max_email_per_day" value="${ob.max_email_per_day}"></div></div>` +
                    `<label class="ch-pr-chk"><input type="checkbox" data-o="require_consent_whatsapp" ${ob.require_consent_whatsapp ? 'checked' : ''}> WhatsApp solo a quien dio permiso o ya escribió <small>— a los demás se les escribe primero por correo.</small></label>` +
                    `<h5>Optimización diaria</h5><p class="ch-muted">Cada día la IA lee los resultados y mejora sola: reescribe las variantes que peor responden, ajusta el estilo de WhatsApp y del correo si no llegan al mínimo, y pausa los nichos que no responden para mandar más volumen a los que sí. Todo queda en el historial y se puede revertir.</p>` +
                    `<label class="ch-pr-chk"><input type="checkbox" data-g="enabled" ${gc.enabled ? 'checked' : ''}> <b>Optimización diaria activa</b></label>` +
                    `<div class="ch-pr-g2"><div><label>Cómo aplica los cambios</label><select class="form-control" data-g="mode"><option value="auto" ${gc.mode !== 'propose' ? 'selected' : ''}>Los aplica sola (con historial para revertir)</option><option value="propose" ${gc.mode === 'propose' ? 'selected' : ''}>Solo propone y yo los aplico</option></select></div>` +
                    `<div><label>Hora de la tarea diaria</label><input class="form-control" type="number" min="0" max="23" data-g="hour" value="${gc.hour}"></div>` +
                    `<div><label>Mínimo de envíos para decidir una variante</label><input class="form-control" type="number" min="10" max="1000" data-g="min_sends" value="${gc.min_sends}"></div><div><label>Pausar un nicho tras estos intentos sin respuesta</label><input class="form-control" type="number" min="50" max="5000" data-g="niche_pause_after" value="${gc.niche_pause_after}"></div>` +
                    `<div><label>Respuesta mínima de WhatsApp (%)</label><input class="form-control" type="number" min="1" max="80" data-g="wa_min_rate" value="${gc.wa_min_rate}"></div><div><label>Respuesta mínima de correo (%)</label><input class="form-control" type="number" min="1" max="80" data-g="email_min_rate" value="${gc.email_min_rate}"></div></div>` +
                    (gr ? growthHtml(gr) : '') +
                    `<h5>Cierre: demo y objeciones</h5><label class="ch-pr-chk"><input type="checkbox" data-c="enabled" ${cl.enabled ? 'checked' : ''}> <b>El comercial virtual clasifica la intención y maneja objeciones</b> <small>— precio, competencia, tiempo, desconfianza.</small></label>` +
                    `<label class="ch-pr-chk"><input type="checkbox" data-c="auto_book" ${cl.auto_book ? 'checked' : ''}> Agendar la demo solo cuando el cliente elige un horario <small>— crea la reunión con videollamada y le confirma por el mismo canal.</small></label>` +
                    `<div class="ch-pr-g2"><div><label>Duración de la demo (minutos)</label><input class="form-control" type="number" min="10" max="90" data-c="demo_minutes" value="${cl.demo_minutes}"></div><div><label>Quién da la demo</label><select class="form-control" data-c="host_user_id"><option value="">El asesor del lead o a quien se pasan los casos</option>${(this.users || []).map(u => `<option value="${esc(u.id)}" ${u.id === cl.host_user_id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>` +
                    `<div style="grid-column:1/-1"><label>Enlace para probar o registrarse (opcional)</label><input class="form-control" data-c="signup_url" value="${esc(cl.signup_url)}" placeholder="https://crm.digitalalliancehub.site/"></div></div>` +
                    `<label>Guion de objeciones (déjalo vacío para usar el recomendado)</label><textarea class="form-control" rows="4" data-c="playbook" placeholder="Una regla por línea: PRECIO: …">${esc(cl.playbook)}</textarea>` +
                    `<h5>Plantilla oficial de WhatsApp (Meta)</h5><p class="ch-muted">Fuera de las 24 horas desde que la persona escribió, la API oficial solo deja iniciar con una plantilla aprobada por Meta. Escribe el nombre exacto y cómo se ve.</p>` +
                    `<div class="ch-pr-g2"><div><label>Nombre de la plantilla</label><input class="form-control" data-w="name" value="${esc(wt.name)}" placeholder="primer_contacto_crm"></div><div><label>Idioma</label><input class="form-control" data-w="lang" value="${esc(wt.lang)}"></div></div>` +
                    `<label>Texto de la plantilla (para el historial; {{1}} = nombre)</label><textarea class="form-control" rows="2" data-w="preview">${esc(wt.preview)}</textarea>` +
                    `<h5>Variantes por paso (A/B)</h5><p class="ch-muted">Cada variante es un enfoque. El sistema prueba todas y luego envía más la que mejor responde. Una por línea: <code>id: enfoque</code>. Deja un paso sin variantes para que la IA decida sola.</p>` +
                    steps.map((s, k) => `<div class="ch-pr-step"><b>${STEPS[k]}</b><textarea class="form-control" rows="3" data-v="${k}" placeholder="a1: Ahorro de tiempo con todo en un solo lugar&#10;a2: Pregunta sobre cómo hacen hoy el seguimiento">${esc(s.variants.map(v => `${v.id}${v.active === false ? ' (pausada)' : ''}: ${v.angle}`).join('\n'))}</textarea>` +
                        (s.variants.length ? `<div class="ch-pr-vs">${s.variants.map(v => { const x = stats[k + '|' + v.id]; return `<span class="ch-pr-v ${v.active === false ? 'off' : ''}"><b>${esc(v.id)}</b> ${x ? `${x.sends} env. · ${x.replies} resp. · ${x.rate}%` : 'sin envíos'}</span>`; }).join('')}</div>` : '') + '</div>').join('') +
                    `<p><button class="btn btn-primary" data-a="save"><span class="fas fa-floppy-disk"></span> Guardar secuencia</button></p></div>`;
                body.addEventListener('click', e => this.growthClick(e, body));
                body.querySelector('[data-a=save]').onclick = () => {
                    const q = s => body.querySelector(s), o = {enabled: q('[data-o=enabled]').checked, country: q('[data-o=country]').value, max_email_per_day: +q('[data-o=max_email_per_day]').value || 40, require_consent_whatsapp: q('[data-o=require_consent_whatsapp]').checked,
                        wa_template: {name: q('[data-w=name]').value, lang: q('[data-w=lang]').value, preview: q('[data-w=preview]').value, params: ['first_name']}, steps: [0, 1, 2].map(k => ({variants: q(`[data-v="${k}"]`).value.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
                            const m = /^([a-z0-9_-]{1,20})(\s*\(pausada\))?\s*:\s*(.+)$/i.exec(l); return m ? {id: m[1].toLowerCase(), angle: m[3], active: !m[2]} : {id: '', angle: l, active: true}; })}))};
                    const closer = {enabled: q('[data-c=enabled]').checked, auto_book: q('[data-c=auto_book]').checked, demo_minutes: +q('[data-c=demo_minutes]').value || 15, host_user_id: q('[data-c=host_user_id]').value, signup_url: q('[data-c=signup_url]').value.trim(), playbook: q('[data-c=playbook]').value};
                    const growth = {enabled: q('[data-g=enabled]').checked, mode: q('[data-g=mode]').value, hour: +q('[data-g=hour]').value, min_sends: +q('[data-g=min_sends]').value, niche_pause_after: +q('[data-g=niche_pause_after]').value, wa_min_rate: +q('[data-g=wa_min_rate]').value, email_min_rate: +q('[data-g=email_min_rate]').value};
                    Espo.Ajax.postRequest('CrmHub/agentConfigSave', {config: Object.assign({}, cfg, {outbound: Object.assign({}, cfg.outbound, o), closer, growth}), agentId: ac.selectedId}).then(() => { Espo.Ui.success('Secuencia guardada'); this.drawSeq(body); })
                        .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('No se pudo guardar.'); });
                };
            }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } body.innerHTML = '<div class="ch-chat-err">No se pudo cargar la secuencia.</div>'; });
        }


        growthClick(e, body) {
            const b = e.target.closest('[data-gr]'); if (!b) { return; } const k = b.dataset.gr, id = +b.dataset.id;
            const done = () => this.drawSeq(body), fail = xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error((xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason')) || 'No se pudo completar.'); };
            if (k === 'apply') { Espo.Ajax.postRequest('CrmHub/growthApply', {id}).then(() => { Espo.Ui.success('Cambio aplicado'); done(); }).catch(fail); }
            else if (k === 'revert') { ChUi.confirm({title: 'Revertir el cambio', ok: 'Revertir', text: 'Se vuelve a como estaba antes de este ajuste.'}).then(y => { if (y) { Espo.Ajax.postRequest('CrmHub/growthRevert', {id}).then(() => { Espo.Ui.success('Cambio revertido'); done(); }).catch(fail); } }); }
            else if (k === 'run' || k === 'runapply') { Espo.Ui.notify('Analizando resultados…'); Espo.Ajax.postRequest('CrmHub/growthRun', {apply: k === 'runapply', force: false}).then(r => { Espo.Ui.notify(false); Espo.Ui.success(r.changes.length ? `${r.changes.length} ajustes ${r.changes.some(c => c.applied) ? 'aplicados' : 'propuestos'}` : (r.skipped[0] || 'Nada que ajustar por ahora: los resultados están dentro de lo esperado.')); done(); }).catch(x => { Espo.Ui.notify(false); fail(x); }); }
            else if (k === 'niche') { Espo.Ajax.postRequest('CrmHub/prospectsNiche', {niche: b.dataset.n, paused: b.dataset.p === '1'}).then(done).catch(fail); }
        }

        // ---------- no contactar
        drawDnc(body) {
            body.innerHTML = '<div class="ch-muted" style="padding:16px">Cargando…</div>';
            Espo.Ajax.getRequest('CrmHub/dnc', {}).then(r => {
                const items = r.items || [];
                body.innerHTML = `<div class="ch-pr-card"><h4>Lista de no contactar</h4><p class="ch-muted">Quien pide la baja (BAJA, STOP, «no me escriban más», el enlace de los correos…) entra aquí sola y ningún comercial virtual le vuelve a escribir. También puedes agregar a mano.</p>` +
                    `<div class="ch-pr-g2"><div><input class="form-control" data-d="email" placeholder="correo@empresa.com"></div><div><input class="form-control" data-d="phone" placeholder="+57 300 123 4567"></div></div><p style="margin-top:8px"><button class="btn btn-default" data-a="add"><span class="fas fa-ban"></span> Agregar a la lista</button></p>` +
                    (items.length ? `<div class="ch-pr-tbl"><table><thead><tr><th>Tipo</th><th>Dato</th><th>Motivo</th><th>Fecha</th>${this.d.isAdmin ? '<th></th>' : ''}</tr></thead><tbody>${items.map(x => `<tr><td>${x.kind === 'email' ? 'Correo' : 'Teléfono'}</td><td>${esc(x.value)}</td><td>${esc(x.reason)}<small>${esc(x.source)}</small></td><td>${esc(ChUi.fmt.dt(x.at))}</td>${this.d.isAdmin ? `<td><button class="btn btn-link btn-sm" data-rm="${esc(x.kind)}|${esc(x.value)}">Quitar</button></td>` : ''}</tr>`).join('')}</tbody></table></div>` : '<p class="ch-muted">La lista está vacía.</p>') + '</div>';
                body.onclick = e => {
                    const a = e.target.closest('[data-a=add]'), rm = e.target.closest('[data-rm]');
                    if (a) { const email = body.querySelector('[data-d=email]').value.trim(), phone = body.querySelector('[data-d=phone]').value.trim(); if (!email && !phone) { return; } Espo.Ajax.postRequest('CrmHub/dncAdd', {email, phone, reason: 'Agregado a mano'}).then(() => this.drawDnc(body)); }
                    else if (rm) { const [kind, ...v] = rm.dataset.rm.split('|'); ChUi.confirm({title: 'Volver a permitir contacto', danger: true, ok: 'Quitar de la lista', text: 'Solo hazlo si la persona pidió volver a recibir mensajes. ¿Continuar?'}).then(y => { if (y) { Espo.Ajax.postRequest('CrmHub/dncRemove', {kind, value: v.join('|')}).then(() => this.drawDnc(body)); } }); }
                };
            }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } body.innerHTML = '<div class="ch-chat-err">No se pudo cargar la lista.</div>'; });
        }
    };
});
