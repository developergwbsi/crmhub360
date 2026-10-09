// Comercial virtual: entrenamiento (qué sabe, cómo habla, cuándo escribe, cuándo pasa a una persona), prueba de conversación y resultados con trazabilidad.
define('custom:views/agent', ['view', 'custom:ui', 'custom:tpl'], function (Dep, ChUi, Tpl) {
    const esc = ChUi.esc;
    const DAYS = [[1, 'Lun'], [2, 'Mar'], [3, 'Mié'], [4, 'Jue'], [5, 'Vie'], [6, 'Sáb'], [7, 'Dom']];
    const TZ = ['America/Bogota', 'America/Lima', 'America/Mexico_City', 'America/Santiago', 'America/Argentina/Buenos_Aires', 'America/Caracas', 'America/Guayaquil', 'America/Panama', 'America/New_York', 'Europe/Madrid'];
    const ACT = {send: 'Escribiría al cliente', wait: 'Esperaría', escalate: 'Pasaría el caso a una persona', close: 'Cerraría la conversación'};
    const KIND = {send: 'Mensaje enviado', inbound: 'Cliente escribió', status: 'Cambio de estado', escalate: 'Pasó a una persona', close: 'Conversación cerrada', wait: 'En espera', stop: 'Detenido', error: 'Error', control: 'Control manual', queued: 'En cola'};
    const when = d => { try { return new Date(d).toLocaleString('es', {dateStyle: 'short', timeStyle: 'short'}); } catch (e) { return d || ''; } };

    return class extends Dep {
        templateContent = '<div class="ch-ag"></div>'
        d = null
        tab = 'train'
        users = []
        test = {history: [], busy: false, last: null}
        stats = null

        setup() {
            this.getHelper().pageTitle.setTitle('Comercial virtual');
            Promise.all([Espo.Ajax.getRequest('CrmHub/agentConfig'), Espo.Ajax.getRequest('User', {maxSize: 200, select: 'name,userName,isActive,type'}).catch(() => ({list: []}))])
                .then(([c, u]) => { this.d = c; this.users = (u.list || []).filter(x => x.isActive && !['api', 'system', 'portal'].includes(x.type)); this.draw(); })
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } this.d = {error: true}; this.draw(); });
        }
        afterRender() { this.draw(); }

        draw() {
            const root = this.el && this.el.querySelector('.ch-ag'); if (!root) { return; }
            if (!this.d) { root.innerHTML = '<div class="ch-muted" style="padding:24px">Cargando…</div>'; return; }
            if (this.d.error) { root.innerHTML = '<div class="ch-chat-err">No se pudo cargar. Solo los administradores pueden ver esta pantalla.</div>'; return; }
            const tabs = [['train', 'fas fa-graduation-cap', 'Entrenamiento'], ['test', 'fas fa-comments', 'Probar'], ['stats', 'fas fa-chart-column', 'Resultados y trazabilidad'], ['ai', 'fas fa-microchip', 'Motor de IA']].map(([k, i, l]) => `<a class="ch-tpl-tab ${this.tab === k ? 'on' : ''}" data-act="tab" data-t="${k}"><span class="${i}"></span> ${l}</a>`).join('');
            root.innerHTML = `<div class="ch-sim-head"><h3><span class="fas fa-robot"></span> Comercial virtual</h3><p class="ch-muted">Atiende a cada lead de principio a fin —primer contacto, respuestas, seguimientos, cambios de estado— y pasa el caso a una persona cuando hace falta. Cada decisión queda registrada con su porqué.</p></div><div class="ch-tpl-tabs">${tabs}</div>` +
                (this.tab === 'train' ? this.trainHtml() : this.tab === 'test' ? this.testHtml() : this.tab === 'ai' ? this.aiHtml() : this.statsHtml());
            root.onclick = e => this.click(e);
            if (this.tab === 'stats' && !this.stats) { this.loadStats(); }
            if (this.tab === 'ai' && !this.ai) { Espo.Ajax.getRequest('CrmHub/aiConfig').then(r => { this.ai = r; this.draw(); }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } }); }
        }

        // ------------------------------------------------ entrenamiento
        trainHtml() {
            const c = this.d.config, lic = this.d.licensed, u = this.d.usage || {};
            const opt = (v, t, s, off) => `<div class="ch-ag-opt ${c.mode === v ? 'on' : ''} ${off ? 'off' : ''}" data-act="mode" data-m="${v}"><b>${t}</b><small>${s}</small></div>`;
            const day = DAYS.map(([n, l]) => `<label><input type="checkbox" data-day="${n}" ${c.schedule.days.includes(n) ? 'checked' : ''}> ${l}</label>`).join('');
            return `<div class="ch-sim-card"><h5>1. Versión</h5><div class="ch-ag-mode">${opt('manual', 'Manual', 'Siempre una persona atiende a los leads. El comercial virtual no escribe a nadie.')}${opt('auto', 'Automática', lic ? 'El comercial virtual atiende a todos los leads solo, según este entrenamiento.' : 'No activada para tu empresa: pídela a tu proveedor (tiene un costo distinto).', !lic)}</div>
                ${lic ? `<div class="ch-muted">Este mes: ${u.messages || 0} mensajes enviados por el agente · ${u.llm_calls || 0} consultas de IA · ${u.escalations || 0} casos pasados a una persona.</div>` : ''}
                <label class="ch-dz-chk"><input type="checkbox" data-f="dry_run" ${c.dry_run ? 'checked' : ''}> <b>Modo de prueba</b> — el agente decide y lo registra, pero <b>no envía nada</b> al cliente. Úsalo mientras lo entrenas.</label>
                <label class="ch-dz-chk"><input type="checkbox" data-f="approval" ${c.approval ? 'checked' : ''}> <b>Aprobación previa</b> — el agente redacta cada mensaje y una persona lo aprueba (o lo edita) antes de enviarlo.</label>
                <label class="ch-dz-chk"><input type="checkbox" data-f="disclose" ${c.disclose ? 'checked' : ''}> Presentarse como asistente virtual en el primer mensaje (recomendado)</label>
                <h5>2. Quién es</h5><div class="ch-ag-row2"><div><label>Nombre con el que se presenta</label><input data-f="persona.name" value="${esc(c.persona.name)}" maxlength="40"></div><div><label>Cargo</label><input data-f="persona.role" value="${esc(c.persona.role)}" maxlength="60"></div></div>
                <label>Tono y forma de hablar</label><input data-f="company.tone" value="${esc(c.company.tone)}" maxlength="600">
                <h5>3. Lo que sabe de tu empresa</h5>
                <label>Sobre la empresa</label><textarea data-f="company.about" rows="3" placeholder="Quiénes son, qué hacen, desde cuándo, a quién ayudan…">${esc(c.company.about)}</textarea>
                <label>Servicios y lo que ofrecen</label><textarea data-f="company.services" rows="4" placeholder="Cada servicio, a quién va dirigido, qué incluye, cómo es el proceso…">${esc(c.company.services)}</textarea>
                <label>Políticas y condiciones (precios, plazos, requisitos)</label><textarea data-f="company.policies" rows="3" placeholder="Solo lo que puede decir con seguridad. Lo que no esté aquí, el agente dirá que un asesor lo confirmará.">${esc(c.company.policies)}</textarea>
                <label>Preguntas frecuentes</label>${c.faq.map((f, i) => `<div class="ch-ag-faq"><input data-fq="${i}" value="${esc(f.q)}" placeholder="Pregunta"><textarea data-fa="${i}" rows="2" placeholder="Respuesta">${esc(f.a)}</textarea><a data-act="delfaq" data-i="${i}"><span class="far fa-trash-can"></span></a></div>`).join('')}<a class="ch-dz-link" data-act="addfaq"><span class="fas fa-plus"></span> Añadir pregunta frecuente</a>
                <h5>4. Qué debe lograr y qué no debe hacer</h5>
                <label>Objetivo</label><textarea data-f="goals" rows="2">${esc(c.goals)}</textarea>
                <label>Nunca debe… (además de inventar datos)</label><input data-f="company.forbidden" value="${esc(c.company.forbidden)}" maxlength="600" placeholder="Ej.: prometer aprobación de un crédito, dar asesoría legal, hablar de la competencia">
                <label>Pasa el caso a una persona cuando…</label><textarea data-f="company.escalate_when" rows="2">${esc(c.company.escalate_when)}</textarea>
                <div class="ch-ag-row2"><div><label>Persona a la que se le pasan los casos</label><select data-f="handoff_user_id"><option value="">— La asignada al lead —</option>${this.users.map(x => `<option value="${esc(x.id)}" ${c.handoff_user_id === x.id ? 'selected' : ''}>${esc(x.name || x.userName)}</option>`).join('')}</select></div>
                    <div style="padding-top:22px"><label class="ch-dz-chk"><input type="checkbox" data-f="allow_status_changes" ${c.allow_status_changes ? 'checked' : ''}> Puede cambiar el estado del lead (calificación, enfriamiento)</label></div></div>
                <h5>5. Cuándo y por dónde escribe</h5>
                <div class="ch-ag-days">${day}</div>
                <div class="ch-ag-row2"><div><label>Desde</label><input type="time" data-f="schedule.start" value="${esc(c.schedule.start)}"></div><div><label>Hasta</label><input type="time" data-f="schedule.end" value="${esc(c.schedule.end)}"></div></div>
                <div class="ch-ag-row2"><div><label>Zona horaria</label><select data-f="schedule.tz">${(TZ.includes(c.schedule.tz) ? TZ : [c.schedule.tz].concat(TZ)).map(z => `<option ${z === c.schedule.tz ? 'selected' : ''}>${esc(z)}</option>`).join('')}</select></div>
                    <div style="padding-top:22px"><label class="ch-dz-chk"><input type="checkbox" data-f="schedule.reply_outside_hours" ${c.schedule.reply_outside_hours ? 'checked' : ''}> Responder a los clientes que escriben fuera de horario</label></div></div>
                <label>Canales que puede usar</label><div class="ch-ag-days"><label><input type="checkbox" data-f="channels.whatsapp" ${c.channels.whatsapp ? 'checked' : ''}> WhatsApp</label><label><input type="checkbox" data-f="channels.email" ${c.channels.email ? 'checked' : ''}> Correo</label><label><input type="checkbox" data-f="channels.sms" ${c.channels.sms ? 'checked' : ''}> SMS</label></div>
                <h5>6. Ritmo de seguimiento</h5>
                <div class="ch-ag-row2"><div><label>Primer contacto, minutos después de que llega el lead</label><input type="number" min="0" data-f="cadence.first_contact_minutes" value="${esc(c.cadence.first_contact_minutes)}"></div><div><label>Máximo de mensajes por lead al día</label><input type="number" min="1" max="10" data-f="cadence.max_per_day" value="${esc(c.cadence.max_per_day)}"></div></div>
                <label>Seguimientos si el cliente no responde (horas desde el mensaje anterior, separadas por coma)</label><input data-f="fu" value="${esc((c.cadence.follow_ups || []).map(m => +(m / 60).toFixed(2)).join(', '))}" placeholder="4, 24, 72, 168">
                <label>Si una persona escribe al cliente, el agente se hace a un lado (minutos)</label><input type="number" min="0" data-f="cadence.human_hold_minutes" value="${esc(c.cadence.human_hold_minutes)}">
                <div class="ch-chat-err" data-role="err" hidden></div><div class="ch-mail-actions"><button class="btn btn-primary" data-act="save"><span class="fas fa-floppy-disk"></span> Guardar entrenamiento</button></div></div>`;
        }

        collect() {
            const c = JSON.parse(JSON.stringify(this.d.config)), q = s => this.el.querySelector(s);
            this.el.querySelectorAll('[data-f]').forEach(el => {
                const k = el.dataset.f; if (k === 'fu') { return; }
                const v = el.type === 'checkbox' ? el.checked : (el.type === 'number' ? Number(el.value) : el.value);
                const p = k.split('.'); let o = c; for (let i = 0; i < p.length - 1; i++) { o = o[p[i]]; } o[p[p.length - 1]] = v;
            });
            c.schedule.days = [...this.el.querySelectorAll('[data-day]')].filter(x => x.checked).map(x => +x.dataset.day);
            c.cadence.follow_ups = q('[data-f="fu"]').value.split(',').map(x => Math.round(parseFloat(x.replace(',', '.')) * 60)).filter(x => x > 0);
            c.faq = [...this.el.querySelectorAll('[data-fq]')].map(el => ({q: el.value.trim(), a: this.el.querySelector(`[data-fa="${el.dataset.fq}"]`).value.trim()})).filter(f => f.q && f.a);
            return c;
        }

        // ------------------------------------------------ probar
        testHtml() {
            const t = this.test;
            const chat = t.history.map(h => `<div class="ch-ag-b ${h.who === 'cliente' ? 'c' : 'a'}">${esc(h.text)}</div>`).join('') || ChUi.empty({kind: 'chat', title: 'Aún no hay mensajes', text: 'Pulsa «Simular primer contacto» o escribe como si fueras el cliente.', compact: true});
            const l = t.last, dec = l ? `<div class="ch-ag-dec"><b>${esc(ACT[l.action] || l.action)}</b> por ${esc(l.channel)}${l.new_status ? ` · pondría el lead en «${esc(l.new_status)}»` : ''}<div class="ch-muted">Por qué: ${esc(l.reason || '—')}</div>${l.summary ? `<div class="ch-muted">Resumen: ${esc(l.summary)}</div>` : ''}</div>` : '';
            return `<div class="ch-sim-card"><p class="ch-muted">Aquí pruebas el entrenamiento sin enviar nada a nadie: simula a un cliente y mira cómo respondería el comercial virtual (usa lo que tienes <b>guardado</b> en «Entrenamiento»). Puede tardar uno o dos minutos por respuesta.</p>
                <div class="ch-ag-row2"><div><label>Nombre del cliente</label><input data-t="name" value="Carlos Ruiz"></div><div><label>Canal</label><select data-t="channel"><option value="whatsapp">WhatsApp</option><option value="email">Correo</option><option value="sms">SMS</option></select></div></div>
                <label>Lo que dejó en el formulario / descripción del lead</label><input data-t="description" value="Quiere información sobre consolidar sus deudas. Ingresos: 4 millones mensuales." >
                <div class="ch-ag-chat">${chat}</div>${dec}
                <label>Mensaje del cliente</label><textarea data-t="message" rows="2" placeholder="Ej.: Hola, ¿cuánto cuesta y qué necesito para empezar?"></textarea>
                <div class="ch-chat-err" data-role="err" hidden></div>
                <div class="ch-mail-actions"><button class="btn btn-primary btn-sm" data-act="tsend" ${t.busy ? 'disabled' : ''}><span class="fas fa-paper-plane"></span> ${t.busy ? 'Pensando…' : 'Enviar como cliente'}</button><button class="btn btn-default btn-sm" data-act="tfirst" ${t.busy ? 'disabled' : ''}>Simular primer contacto</button><button class="btn btn-default btn-sm" data-act="treset">Empezar de nuevo</button></div></div>`;
        }

        runTest(first) {
            const q = s => this.el.querySelector(s), t = this.test, msg = first ? '' : q('[data-t="message"]').value.trim();
            if (!first && !msg) { return; }
            const sample = {name: q('[data-t="name"]').value, channel: q('[data-t="channel"]').value, description: q('[data-t="description"]').value, history: t.history.map(h => ({who: h.who, text: h.text})), message: msg, kind: first ? 'first' : undefined};
            if (msg) { t.history.push({who: 'cliente', text: msg}); }
            t.busy = true; this.draw();
            Espo.Ajax.postRequest('CrmHub/agentTest', {sample: {...sample, history: sample.history}}, {timeout: 295000}).then(r => { t.last = r; if (r.message) { t.history.push({who: 'agente', text: r.message}); } })
                .catch(xhr => { const e = this.el.querySelector('[data-role="err"]'); if (e) { e.hidden = false; e.textContent = Tpl.reason(xhr, 'No se pudo generar la respuesta de prueba.'); } if (xhr) { xhr.errorIsHandled = true; } })
                .then(() => { t.busy = false; this.draw(); });
        }

        // ------------------------------------------------ motor de IA
        aiHtml() {
            const a = this.ai; if (!a) { return '<div class="ch-muted" style="padding:20px">Cargando…</div>'; }
            const e = a.effective, src = {local: 'IA local del sistema', own: 'Motor propio de tu empresa'}[e.source] || 'Motor del sistema (gestionado por tu proveedor)';
            const usage = (a.usage || []).map(u => `<div>${esc(u.engine)} · <b>${u.calls}</b> consultas · ${(u.tokens_in / 1000).toFixed(1)}k tokens de entrada / ${(u.tokens_out / 1000).toFixed(1)}k de salida</div>`).join('') || ChUi.empty({kind: 'chart', title: 'Sin consultas este mes', text: 'Aquí verás el consumo de IA.', compact: true});
            let own = '';
            if (a.mode === 'own') {
                const o = a.own;
                own = `<h5>Tu propio motor de IA</h5><p class="ch-muted">Tu empresa usa su propia cuenta de IA: las consultas (comercial virtual, lectura de documentos, asistente…) se cobran en tu cuenta con el proveedor.</p>
                    <div class="ch-ag-row2"><div><label>Proveedor</label><select data-ai="kind">${Object.keys(a.kinds).map(k => `<option value="${k}" ${o.kind === k ? 'selected' : ''}>${esc(a.kinds[k])}</option>`).join('')}</select></div><div><label>Modelo</label><input data-ai="model" value="${esc(o.model)}" placeholder="claude-haiku-5-5 · gpt-4o-mini"></div></div>
                    <label>Dirección de la API (opcional)</label><input data-ai="base_url" value="${esc(o.base_url)}" placeholder="Vacío = la dirección oficial del proveedor">
                    <label>ID del workspace (solo Anthropic, y solo si al probar te lo pide)</label><input data-ai="workspace_id" value="${esc(o.workspace_id || '')}" placeholder="wrkspc_… (opcional)">
                    <label>Clave de la API ${o.secretSet ? `<span class="ch-muted">(guardada ${esc(o.secretHint)}; vacía = conservar)</span>` : ''}</label><input data-ai="api_key" type="password" autocomplete="new-password">
                    <div class="ch-chat-err" data-role="err" hidden></div><div class="ch-ag-aiout" data-role="aiout"></div>
                    <div class="ch-mail-actions"><button class="btn btn-primary btn-sm" data-act="aisave"><span class="fas fa-floppy-disk"></span> Guardar</button><button class="btn btn-default btn-sm" data-act="aitest"><span class="fas fa-vial"></span> Probar</button></div>`;
            } else { own = `<div class="ch-muted" style="margin-top:8px">Si prefieres usar tu propia cuenta de IA (por ejemplo la tuya de Claude u OpenAI), pídeselo a tu proveedor y te habilitará esa opción. <button class="btn btn-default btn-xs" data-act="aitest"><span class="fas fa-vial"></span> Probar el motor actual</button></div><div class="ch-ag-aiout" data-role="aiout"></div>`; }
            return `<div class="ch-sim-card"><h5>Motor de IA que usa tu empresa</h5><div class="ch-ag-dec"><b>${esc(src)}</b><div>${esc(e.label)} · ${esc(a.kinds[e.kind] || e.kind)}${e.model ? ' · modelo ' + esc(e.model) : ''}</div></div>
                <div class="ch-muted">Este mes:</div>${usage}${own}</div>`;
        }

        aiBody() { const o = {}; this.el.querySelectorAll('[data-ai]').forEach(el => { o[el.dataset.ai] = el.value; }); return o; }

        aiTest() {
            const out = this.el.querySelector('[data-role="aiout"]'); out.innerHTML = '<span class="ch-spin"></span> Probando…';
            Espo.Ajax.postRequest('CrmHub/aiTest', this.ai.mode === 'own' ? this.aiBody() : {}, {timeout: 160000}).then(r => { out.innerHTML = `<div class="ch-dlg-note ok"><span class="fas fa-circle-check"></span> El motor responde (${esc(r.seconds)} s).</div>`; })
                .catch(xhr => { out.innerHTML = `<div class="ch-chat-err">${esc(Tpl.reason(xhr, 'No respondió.'))}</div>`; if (xhr) { xhr.errorIsHandled = true; } });
        }

        aiSave() {
            const err = this.el.querySelector('[data-role="err"]'); err.hidden = true;
            Espo.Ajax.postRequest('CrmHub/aiOwnSave', this.aiBody()).then(r => { this.ai = r; Espo.Ui.success('Motor de IA guardado'); this.draw(); })
                .catch(xhr => { err.hidden = false; err.textContent = Tpl.reason(xhr, 'No se pudo guardar.'); if (xhr) { xhr.errorIsHandled = true; } });
        }

        // ------------------------------------------------ resultados
        loadStats() { Promise.all([Espo.Ajax.getRequest('CrmHub/agentStats', {days: 30}), Espo.Ajax.getRequest('CrmHub/agentPending').catch(() => ({items: []}))]).then(([s, p]) => { s.pending = p.items || []; this.stats = s; this.draw(); }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } }); }

        statsHtml() {
            const s = this.stats; if (!s) { return '<div class="ch-muted" style="padding:20px">Cargando…</div>'; }
            const pend = (s.pending || []).length ? `<div class="ch-sim-card"><h4><span class="fas fa-hourglass-half"></span> Pendientes de aprobación (${s.pending.length})</h4>${s.pending.map(p => `<div class="ch-agp-e"><span class="fas fa-paper-plane" style="color:#4f63e8"></span><div><b>${esc(p.lead_name || p.lead_id)}</b> · ${esc(p.channel)} <a href="#Lead/view/${esc(p.lead_id)}">Revisar y aprobar</a><div class="ch-agp-d">${esc(String(p.detail).slice(0, 240))}</div></div></div>`).join('')}</div>` : '';
            const kpi = (l, v, sub) => `<div class="ch-kb-kpi"><span>${l}</span><b>${v}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
            const max = Math.max(1, ...s.series.map(x => x.n));
            const rt = s.avgFirstResponseSeconds == null ? '—' : (s.avgFirstResponseSeconds < 120 ? s.avgFirstResponseSeconds + ' s' : Math.round(s.avgFirstResponseSeconds / 60) + ' min');
            return pend + `<div class="ch-kb-kpis">${kpi('Leads atendidos (30 días)', s.leads)}${kpi('Mensajes enviados', s.sent, s.simulated ? s.simulated + ' en modo de prueba' : '')}${kpi('Respuestas de clientes', s.replies)}${kpi('Pasados a una persona', s.escalations)}${kpi('Tiempo al primer contacto', rt, 'promedio')}${kpi('Cambios de estado', s.statusChanges)}</div>
                <div class="ch-sim-card"><h4>Mensajes por día</h4>${s.series.length ? `<div class="ch-ag-bars">${s.series.map(x => `<i style="height:${Math.max(3, 100 * x.n / max)}%" title="${esc(x.d)}: ${x.n}"></i>`).join('')}</div>` : ChUi.empty({kind: 'chat', title: 'Aún no hay mensajes', text: 'Pronto entrarán datos.', compact: true})}</div>
                <div class="ch-sim-card"><h4>Trazabilidad: lo último que hizo el comercial virtual</h4>${(s.events || []).map(e => `<div class="ch-agp-e"><span class="fas fa-circle" style="color:${e.kind === 'send' ? '#4f63e8' : e.kind === 'escalate' ? '#f59e0b' : e.kind === 'error' || e.kind === 'stop' ? '#d64545' : '#94a3b8'};font-size:9px"></span><div><b>${esc(KIND[e.kind] || e.kind)} · ${esc(e.lead_name || e.lead_id)}</b> ${e.dry ? '<em>(prueba)</em>' : ''} <a href="#Lead/view/${esc(e.lead_id)}">Abrir lead</a><div>${esc(e.title)}</div>${e.detail ? `<div class="ch-agp-d">${esc(String(e.detail).slice(0, 260))}</div>` : ''}${e.reason ? `<div class="ch-muted">Por qué: ${esc(e.reason)}</div>` : ''}<small>${esc(when(e.at))}${e.channel ? ' · ' + esc(e.channel) : ''}</small></div></div>`).join('') || ChUi.empty({kind: 'robot', title: 'Todavía no hay actividad', text: 'Tu comercial virtual aún no ha trabajado. Verás aquí cada paso.', compact: true})}</div>`;
        }

        // ------------------------------------------------ eventos
        click(e) {
            const a = e.target.closest('[data-act]'); if (!a) { return; }
            const act = a.dataset.act;
            if (act === 'tab') { this.tab = a.dataset.t; if (this.tab === 'stats') { this.stats = null; } this.draw(); }
            else if (act === 'mode') { if (a.classList.contains('off')) { Espo.Ui.warning('La versión automática no está activada para tu empresa.'); return; } this.d.config = this.collect(); this.d.config.mode = a.dataset.m; this.draw(); }
            else if (act === 'addfaq') { this.d.config = this.collect(); this.d.config.faq.push({q: '', a: ''}); this.draw(); }
            else if (act === 'delfaq') { this.d.config = this.collect(); this.d.config.faq.splice(+a.dataset.i, 1); this.draw(); }
            else if (act === 'save') { this.save(); }
            else if (act === 'aitest') { this.aiTest(); }
            else if (act === 'aisave') { this.aiSave(); }
            else if (act === 'tsend') { this.runTest(false); }
            else if (act === 'tfirst') { this.test.history = []; this.runTest(true); }
            else if (act === 'treset') { this.test = {history: [], busy: false, last: null}; this.draw(); }
        }

        save() {
            const c = this.collect(), err = this.el.querySelector('[data-role="err"]'); err.hidden = true;
            if (c.mode === 'auto' && !c.company.about.trim() && !c.company.services.trim()) { err.hidden = false; err.textContent = 'Antes de activar la versión automática cuéntale al agente qué hace tu empresa y qué servicios ofrece.'; return; }
            const go = () => Espo.Ajax.postRequest('CrmHub/agentConfigSave', {config: c}).then(r => { this.d.config = r.config; Espo.Ui.success('Entrenamiento guardado'); this.draw(); })
                .catch(xhr => { err.hidden = false; err.textContent = Tpl.reason(xhr, 'No se pudo guardar.'); if (xhr) { xhr.errorIsHandled = true; } });
            if (c.mode === 'auto' && !c.dry_run && this.d.config.mode !== 'auto' || (c.mode === 'auto' && !c.dry_run && this.d.config.dry_run)) {
                ChUi.confirm({title: 'Activar la versión automática', html: 'El comercial virtual <b>escribirá a los clientes de verdad</b> (WhatsApp, correo) sin que una persona lo revise. ¿Ya probaste sus respuestas?', ok: 'Activar', danger: true}).then(y => { if (y) { go(); } });
            } else { go(); }
        }
    };
});
