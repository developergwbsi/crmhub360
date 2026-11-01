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

    return class extends Dep {
        templateContent = '<div class="ch-pr"></div>'
        tab = 'list'
        d = null
        f = {status: '', batch: '', q: ''}
        sel = new Set()

        setup() { this.getHelper().pageTitle.setTitle('Prospección'); this.load(); }
        afterRender() { this.draw(); }

        load() {
            return Espo.Ajax.getRequest('CrmHub/prospects', this.f).then(r => { this.d = r; this.draw(); })
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } this.d = {error: true}; this.draw(); });
        }

        draw() {
            const root = this.el && this.el.querySelector('.ch-pr'); if (!root) { return; }
            const d = this.d;
            if (!d) { root.innerHTML = '<div class="ch-muted" style="padding:24px">Cargando…</div>'; return; }
            if (d.error) { root.innerHTML = '<div class="ch-chat-err">Solo gerentes, directores y supervisores pueden usar la prospección.</div>'; return; }
            const tabs = [['list', 'Prospectos'], ['icp', 'Cliente ideal'], ...(d.isAdmin ? [['seq', 'Secuencia y resultados']] : []), ['dnc', 'No contactar']];
            root.innerHTML = `<div class="ch-rc-top"><div><h3>Prospección</h3><p class="ch-muted">Carga prospectos, deja que la IA los valide y puntúe, y los comerciales virtuales los contactan respetando horarios legales, la lista de no contactar y los permisos de cada canal.</p></div></div>` +
                `<div class="ch-pr-tabs">${tabs.map(([k, l]) => `<button type="button" data-tab="${k}" class="${this.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div><div class="ch-pr-body"></div>`;
            const body = root.querySelector('.ch-pr-body');
            root.querySelector('.ch-pr-tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) { this.tab = b.dataset.tab; this.draw(); } };
            ({list: () => this.drawList(body), icp: () => this.drawIcp(body), seq: () => this.drawSeq(body), dnc: () => this.drawDnc(body)})[this.tab]();
        }

        // ---------- prospectos
        drawList(body) {
            const d = this.d, c = d.counts || {}, icp = d.icp || {};
            const rows = (d.items || []).map(i => { const [l, k] = ST[i.status] || [i.status, '']; const en = i.enrichment || {};
                return `<tr><td><input type="checkbox" data-sel="${i.id}" ${this.sel.has(i.id) ? 'checked' : ''} ${i.status === 'imported' ? 'disabled' : ''}></td><td><b>${esc(i.name)}</b><small>${esc([i.title, i.company].filter(Boolean).join(' · '))}</small></td>` +
                    `<td>${esc(i.email)}<small>${esc(i.phone)}</small></td><td>${esc(i.industry || '—')}<small>${esc(i.country)} · ${esc((i.segment || '').toUpperCase())}</small></td><td>${i.score == null ? '—' : `<span class="ch-pr-sc" title="${esc(en.reason || '')}">${i.score}</span>`}${en.pain ? `<small>${esc(en.pain)}</small>` : ''}</td>` +
                    `<td><span class="ch-pr-tag ${k}">${l}</span>${i.reason ? `<small>${esc(i.reason)}</small>` : ''}${i.lead_id ? `<small><a href="#Lead/view/${esc(i.lead_id)}">Ver lead</a></small>` : ''}</td></tr>`; }).join('');
            body.innerHTML = `<div class="ch-pr-stats"><div><b>${c.ready || 0}</b><span>Listos</span></div><div><b>${c.imported || 0}</b><span>En el CRM</span></div><div><b>${d.promotedToday || 0}/${icp.daily_limit || 0}</b><span>Pasados hoy</span></div><div><b>${c.rejected || 0}</b><span>Rechazados</span></div></div>` +
                `<div class="ch-pr-bar"><button class="btn btn-primary" data-a="import"><span class="fas fa-file-import"></span> Importar CSV</button><button class="btn btn-default" data-a="enrich"><span class="fas fa-wand-magic-sparkles"></span> Enriquecer con IA</button>` +
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
            Promise.all([Espo.Ajax.getRequest('CrmHub/agentConfig', {}), Espo.Ajax.getRequest('CrmHub/outboundStats', {days: 60})]).then(([ac, st]) => {
                const cfg = ac.config, ob = cfg.outbound, stats = {}; (st.items || []).forEach(x => { stats[x.step + '|' + x.variant] = x; });
                const wt = ob.wa_template, steps = ob.steps.slice(0, 3);
                body.innerHTML = `<div class="ch-pr-card"><h4>Comercial virtual saliente: ${esc((ac.name || cfg.persona.name))}</h4>` +
                    `<label class="ch-pr-chk"><input type="checkbox" data-o="enabled" ${ob.enabled ? 'checked' : ''}> <b>Prospección saliente activa</b> <small>— contacta a los leads de «Prospección IA» y aplica horarios legales, no contactar y cuota de correos.</small></label>` +
                    `<div class="ch-pr-warn">${cfg.dry_run ? '<b>Modo prueba:</b> el comercial virtual solo simula (no envía nada). ' : ''}${cfg.mode !== 'auto' ? '<b>Comercial en modo manual:</b> actívalo en «Comercial virtual» para que escriba. ' : ''}${cfg.approval ? 'Cada mensaje espera tu aprobación. ' : ''}Cambia estos ajustes en <a href="#CrmHub/agente">Comercial virtual</a>.</div>` +
                    `<div class="ch-pr-g2"><div><label>País por defecto</label><input class="form-control" data-o="country" maxlength="2" value="${esc(ob.country)}"></div><div><label>Tope de correos en frío por día (por remitente)</label><input class="form-control" type="number" min="1" max="200" data-o="max_email_per_day" value="${ob.max_email_per_day}"></div></div>` +
                    `<label class="ch-pr-chk"><input type="checkbox" data-o="require_consent_whatsapp" ${ob.require_consent_whatsapp ? 'checked' : ''}> WhatsApp solo a quien dio permiso o ya escribió <small>— a los demás se les escribe primero por correo.</small></label>` +
                    `<h5>Plantilla oficial de WhatsApp (Meta)</h5><p class="ch-muted">Fuera de las 24 horas desde que la persona escribió, la API oficial solo deja iniciar con una plantilla aprobada por Meta. Escribe el nombre exacto y cómo se ve.</p>` +
                    `<div class="ch-pr-g2"><div><label>Nombre de la plantilla</label><input class="form-control" data-w="name" value="${esc(wt.name)}" placeholder="primer_contacto_crm"></div><div><label>Idioma</label><input class="form-control" data-w="lang" value="${esc(wt.lang)}"></div></div>` +
                    `<label>Texto de la plantilla (para el historial; {{1}} = nombre)</label><textarea class="form-control" rows="2" data-w="preview">${esc(wt.preview)}</textarea>` +
                    `<h5>Variantes por paso (A/B)</h5><p class="ch-muted">Cada variante es un enfoque. El sistema prueba todas y luego envía más la que mejor responde. Una por línea: <code>id: enfoque</code>. Deja un paso sin variantes para que la IA decida sola.</p>` +
                    steps.map((s, k) => `<div class="ch-pr-step"><b>${STEPS[k]}</b><textarea class="form-control" rows="3" data-v="${k}" placeholder="a1: Ahorro de tiempo con todo en un solo lugar&#10;a2: Pregunta sobre cómo hacen hoy el seguimiento">${esc(s.variants.map(v => `${v.id}${v.active === false ? ' (pausada)' : ''}: ${v.angle}`).join('\n'))}</textarea>` +
                        (s.variants.length ? `<div class="ch-pr-vs">${s.variants.map(v => { const x = stats[k + '|' + v.id]; return `<span class="ch-pr-v ${v.active === false ? 'off' : ''}"><b>${esc(v.id)}</b> ${x ? `${x.sends} env. · ${x.replies} resp. · ${x.rate}%` : 'sin envíos'}</span>`; }).join('')}</div>` : '') + '</div>').join('') +
                    `<p><button class="btn btn-primary" data-a="save"><span class="fas fa-floppy-disk"></span> Guardar secuencia</button></p></div>`;
                body.querySelector('[data-a=save]').onclick = () => {
                    const q = s => body.querySelector(s), o = {enabled: q('[data-o=enabled]').checked, country: q('[data-o=country]').value, max_email_per_day: +q('[data-o=max_email_per_day]').value || 40, require_consent_whatsapp: q('[data-o=require_consent_whatsapp]').checked,
                        wa_template: {name: q('[data-w=name]').value, lang: q('[data-w=lang]').value, preview: q('[data-w=preview]').value, params: ['first_name']}, steps: [0, 1, 2].map(k => ({variants: q(`[data-v="${k}"]`).value.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
                            const m = /^([a-z0-9_-]{1,20})(\s*\(pausada\))?\s*:\s*(.+)$/i.exec(l); return m ? {id: m[1].toLowerCase(), angle: m[3], active: !m[2]} : {id: '', angle: l, active: true}; })}))};
                    Espo.Ajax.postRequest('CrmHub/agentConfigSave', {config: Object.assign({}, cfg, {outbound: o}), agentId: ac.selectedId}).then(() => { Espo.Ui.success('Secuencia guardada'); this.drawSeq(body); })
                        .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('No se pudo guardar.'); });
                };
            }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } body.innerHTML = '<div class="ch-chat-err">No se pudo cargar la secuencia.</div>'; });
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
