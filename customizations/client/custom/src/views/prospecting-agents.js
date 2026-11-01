/**
 * Agentes de prospección (Comercial virtual → Agentes de prospección): la cadena que trabaja antes de que entre una persona.
 *   Buscador (halla empresas en internet) → Calificador (decide a quién vale la pena y qué ofrecer) → Valeria / comercial virtual (escribe y agenda) → persona (con la demo agendada).
 * Cada agente tiene su tarjeta con su configuración. Existen mientras la licencia incluya el buscador. Solo admin.
 * Endpoints: GET CrmHub/finder, POST finderSave, finderRun, pipelineRun; GET CrmHub/qualifier, POST qualifierSave, qualifierRun; GET CrmHub/searchConfig (solo lectura).
 * Peculiaridad: vista incrustada en views/agent.js; dibuja con innerHTML en draw() y no guarda nada hasta pulsar «Guardar» en la tarjeta.
 */
define('custom:views/prospecting-agents', ['view', 'custom:ui'], function (Dep, ChUi) {
    const esc = v => ChUi.esc(v == null ? '' : v);
    const reason = xhr => { const r = xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason'); if (xhr) { xhr.errorIsHandled = true; } return r || 'No se pudo completar.'; };
    const GR = {A: 'A · encaje claro', B: 'B · encaje probable', C: 'C · dudoso', D: 'D · no trabajar'};

    return class extends Dep {
        templateContent = '<div class="ch-pa"></div>'
        f = null; q = null; s = null
        afterRender() { this.load(); }
        load() {
            Promise.all([Espo.Ajax.getRequest('CrmHub/finder'), Espo.Ajax.getRequest('CrmHub/qualifier'), Espo.Ajax.getRequest('CrmHub/searchConfig').catch(() => null)])
                .then(([f, q, s]) => { this.f = f; this.q = q; this.s = s; this.draw(); })
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } const el = this.el.querySelector('.ch-pa'); if (el) { el.innerHTML = '<div class="ch-chat-err">No se pudieron cargar los agentes de prospección.</div>'; } });
        }
        draw() {
            const el = this.el.querySelector('.ch-pa'); if (!el || !this.f) { return; }
            const f = this.f, q = this.q, lic = f.licensed, dis = lic ? '' : 'disabled';
            const eng = this.s && this.s.active ? ((this.s.engines || {})[this.s.active.engine] || this.s.active.engine) : '—';
            const chip = (on, t) => `<span class="label label-${on ? 'success' : 'default'}">${t}</span>`;
            const flow = `<div class="ch-pa-flow"><span><b>1 · Buscador</b>halla empresas</span><i class="fas fa-arrow-right"></i><span><b>2 · Calificador</b>decide a quién vale la pena</span><i class="fas fa-arrow-right"></i><span><b>3 · Valeria</b>escribe y agenda</span><i class="fas fa-arrow-right"></i><span><b>4 · Tu equipo</b>entra con la demo agendada</span></div>`;
            const lr = f.last_run, pl = f.pipeline_last, st = q.stats || {grades: {}, passed: 0};
            el.innerHTML = (lic ? '' : '<div class="ch-chat-err">Tu licencia no incluye el buscador. Pídelo al administrador del servicio para activar estos dos agentes.</div>') + flow +
                `<div class="ch-pa-grid">` +
                // ---- Buscador
                `<div class="ch-pr-card" data-ag="finder"><h5><span class="fas fa-magnifying-glass"></span> ${esc(f.name)} ${chip(f.enabled && lic, f.enabled && lic ? 'Activo' : 'Apagado')}</h5>` +
                `<p class="ch-muted">Investiga en internet empresas que podrían necesitar lo que vendes y guarda solo las que tienen una página pública y un contacto de negocio publicado.</p>` +
                `<label class="ch-pr-chk"><input type="checkbox" data-k="enabled" ${f.enabled ? 'checked' : ''} ${dis}> <b>Agente activo</b></label>` +
                `<div class="ch-pr-g2"><div><label>Empresas por día (tope)</label><input class="form-control" type="number" min="1" max="100" data-k="daily_limit" value="${f.daily_limit}" ${dis}></div><div><label>Buscador web que usa</label><div class="form-control-static"><b>${esc(eng)}</b> <small class="ch-muted">· se cambia en Integraciones → Buscadores</small></div></div></div>` +
                `<label>Enfoque (a qué empresas buscar)</label><textarea class="form-control" rows="3" data-k="focus" placeholder="Ej.: clínicas de estética con varias sedes; fábricas de muebles" ${dis}>${esc(f.focus)}</textarea>` +
                `<div class="ch-pr-g2"><div><label class="ch-pr-chk"><input type="checkbox" data-k="auto" ${f.auto ? 'checked' : ''} ${dis}> Ciclo diario automático</label></div><div><label>Hora (de la empresa)</label><input class="form-control" type="number" min="0" max="23" data-k="hour" value="${f.hour}" ${dis}></div></div>` +
                `<label>Los correos en frío salen</label><select class="form-control" data-k="autonomy" ${dis}><option value="approval" ${f.autonomy === 'auto' ? '' : 'selected'}>con aprobación de una persona</option><option value="auto" ${f.autonomy === 'auto' ? 'selected' : ''}>solos, con tope diario y frenos</option></select>` +
                `<h5 style="margin-top:14px">Reporte gerencial por correo</h5><label class="ch-pr-chk"><input type="checkbox" data-k="rep_on" ${(f.report || {}).enabled ? 'checked' : ''} ${dis}> Enviarme cada día el reporte del motor comercial</label>` +
                `<div class="ch-pr-g2"><div><label>Destinatarios (separados por coma)</label><input class="form-control" data-k="rep_to" value="${esc(((f.report || {}).to || []).join(', '))}" placeholder="gerencia@tuempresa.com" ${dis}></div><div><label>Hora de envío (de la empresa)</label><input class="form-control" type="number" min="0" max="23" data-k="rep_hour" value="${(f.report || {}).hour != null ? (f.report || {}).hour : 11}" ${dis}></div></div>` +
                `<p style="margin-top:12px"><button class="btn btn-primary" data-a="fsave" ${dis}>Guardar</button> <button class="btn btn-default" data-a="frun" ${lic && f.enabled ? '' : 'disabled'}>Buscar ahora</button> <button class="btn btn-default" data-a="fcycle" ${lic && f.enabled ? '' : 'disabled'}>Ciclo completo ahora</button> <button class="btn btn-default" data-a="frep" ${lic ? '' : 'disabled'}>Enviar el reporte ahora</button></p>` +
                (lr ? `<p class="ch-muted">Última búsqueda: ${esc(ChUi.fmt.dt(lr.at))} · ${lr.found} halladas · ${lr.ready} listas</p>` : '<p class="ch-muted">Aún no ha buscado.</p>') +
                (pl && !pl.note ? `<p class="ch-muted">Último ciclo: ${esc(ChUi.fmt.dt(pl.at))}${pl.error ? ' · error: ' + esc(pl.error) : ` · ${(pl.qualifier || {}).passed || 0} pasados a Valeria`}</p>` : '') + `</div>` +
                // ---- Calificador
                `<div class="ch-pr-card" data-ag="qualifier"><h5><span class="fas fa-filter"></span> ${esc(q.name)} ${chip(q.enabled && lic, q.enabled && lic ? 'Activo' : 'Apagado')}</h5>` +
                `<p class="ch-muted">Con su entrenamiento y buenas prácticas de calificación decide a quién vale la pena, qué producto ofrecerle y con qué ángulo, y le pasa a Valeria solo lo bueno. Solo pasan prospectos con correo de negocio.</p>` +
                `<label class="ch-pr-chk"><input type="checkbox" data-q="enabled" ${q.enabled ? 'checked' : ''} ${dis}> <b>Agente activo</b></label>` +
                `<div class="ch-pr-g2"><div><label>Pasa a Valeria desde el grado</label><select class="form-control" data-q="min_grade" ${dis}>${['A', 'B', 'C'].map(g => `<option value="${g}" ${q.min_grade === g ? 'selected' : ''}>${GR[g]} (o mejor)</option>`).join('')}</select></div>` +
                `<div><label>Máximo que pasa por día</label><input class="form-control" type="number" min="1" max="50" data-q="daily_pass" value="${q.daily_pass}" ${dis}></div></div>` +
                `<label>Su entrenamiento: reglas de calificación <small class="ch-muted">(déjalo como está o ajústalo a tu negocio)</small></label><textarea class="form-control" rows="12" data-q="rules" ${dis}>${esc(q.rules)}</textarea>` +
                `<p><button class="btn btn-link btn-sm" data-a="qdefault" ${dis}>Restaurar las reglas recomendadas</button></p>` +
                `<p><button class="btn btn-primary" data-a="qsave" ${dis}>Guardar</button> <button class="btn btn-default" data-a="qrun" ${lic && q.enabled ? '' : 'disabled'}>Calificar ahora</button></p>` +
                `<p class="ch-muted">Calificados: ${Object.keys(GR).map(g => `<b>${g}</b> ${st.grades[g] || 0}`).join(' · ')} · pasaron a Valeria: <b>${st.passed}</b></p></div>` +
                `</div>` +
                `<div class="ch-pr-card" style="margin-top:12px"><h5><span class="fas fa-user-tie"></span> Valeria · comercial virtual</h5><p class="ch-muted">Escribe el primer correo, responde, envía el material y coordina la agenda con la persona. Cuando hay una demo agendada se detiene y avisa a tu equipo. Su entrenamiento está en las pestañas <b>Mis comerciales</b> y <b>Entrenamiento</b>.</p></div>`;
            this.bind(el);
        }
        bind(el) {
            const g = (sel, k) => el.querySelector(`[data-${sel}="${k}"]`), v = (sel, k) => g(sel, k).value;
            const fail = xhr => { Espo.Ui.notify(false); Espo.Ui.error(reason(xhr)); };
            const A = a => el.querySelector(`[data-a=${a}]`);
            const fdata = () => ({enabled: g('k', 'enabled').checked, daily_limit: +v('k', 'daily_limit') || 20, focus: v('k', 'focus'), auto: g('k', 'auto').checked, hour: +v('k', 'hour'), autonomy: v('k', 'autonomy'), report: {enabled: g('k', 'rep_on').checked, to: v('k', 'rep_to'), hour: +v('k', 'rep_hour')}});
            A('fsave').onclick = () => Espo.Ajax.postRequest('CrmHub/finderSave', fdata()).then(() => { Espo.Ui.success('Buscador guardado'); this.load(); }).catch(fail);
            A('frun').onclick = () => ChUi.confirm({title: 'Buscar ahora', ok: 'Buscar', text: 'Investiga en internet y guarda prospectos nuevos. Consume tokens y búsquedas. No envía nada.'}).then(y => { if (!y) { return; } Espo.Ui.notify('Buscando en internet…');
                Espo.Ajax.postRequest('CrmHub/finderRun', {}, {timeout: 600000}).then(r => { Espo.Ui.notify(false); Espo.Ui.success(`${r.ready || 0} prospectos nuevos`); this.load(); }).catch(fail); });
            A('fcycle').onclick = () => ChUi.confirm({title: 'Ciclo completo', ok: 'Ejecutar', text: 'Busca, califica y pasa los mejores a Valeria, que les escribirá según la configuración. Consume tokens y búsquedas.'}).then(y => { if (!y) { return; } Espo.Ui.notify('Ejecutando el ciclo…');
                Espo.Ajax.postRequest('CrmHub/pipelineRun', {}, {timeout: 600000}).then(r => { Espo.Ui.notify(false); Espo.Ui.success(`${(r.qualifier || {}).passed || 0} pasaron a Valeria`); this.load(); }).catch(fail); });
            A('frep').onclick = () => ChUi.confirm({title: 'Enviar el reporte ahora', ok: 'Enviar', text: 'Se envía ahora, como vista previa, el reporte gerencial a los destinatarios guardados. Si cambiaste los destinatarios, guarda primero.'}).then(y => { if (!y) { return; } Espo.Ui.notify('Armando y enviando el reporte…');
                Espo.Ajax.postRequest('CrmHub/reportSend', {}, {timeout: 120000}).then(r => { Espo.Ui.notify(false); Espo.Ui.success('Reporte enviado a ' + (r.to || []).join(', ')); }).catch(fail); });
            A('qsave').onclick = () => Espo.Ajax.postRequest('CrmHub/qualifierSave', {enabled: g('q', 'enabled').checked, min_grade: v('q', 'min_grade'), daily_pass: +v('q', 'daily_pass') || 5, rules: v('q', 'rules')}).then(() => { Espo.Ui.success('Calificador guardado'); this.load(); }).catch(fail);
            A('qdefault').onclick = () => { g('q', 'rules').value = this.q.default_rules; };
            A('qrun').onclick = () => ChUi.confirm({title: 'Calificar ahora', ok: 'Calificar', text: 'Califica los prospectos pendientes y pasa a Valeria los de grado suficiente (hasta el tope diario). Valeria les escribirá según su configuración.'}).then(y => { if (!y) { return; } Espo.Ui.notify('Calificando…');
                Espo.Ajax.postRequest('CrmHub/qualifierRun', {}, {timeout: 300000}).then(r => { Espo.Ui.notify(false); Espo.Ui.success(`${r.qualified || 0} calificados · ${r.passed || 0} pasaron a Valeria`); this.load(); }).catch(fail); });
        }
    };
});
