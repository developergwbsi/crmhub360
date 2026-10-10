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
        tab = 'agents'
        users = []
        test = {history: [], busy: false, last: null}
        stats = null

        setup() {
            this.getHelper().pageTitle.setTitle('Comercial virtual');
            Promise.all([Espo.Ajax.getRequest('CrmHub/agentConfig', {agentId: this.sel || ''}), Espo.Ajax.getRequest('User', {maxSize: 200, select: 'name,userName,isActive,type'}).catch(() => ({list: []}))])
                .then(([c, u]) => { this.d = c; this.users = (u.list || []).filter(x => x.isActive && !['api', 'system', 'portal'].includes(x.type)); this.draw(); })
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } this.d = {error: true}; this.draw(); });
        }
        afterRender() { this.draw(); }

        // carga el entrenamiento del comercial virtual elegido (y la lista de todos con el reparto)
        load(agentId, then) {
            this.sel = agentId || this.sel || '';
            return Espo.Ajax.getRequest('CrmHub/agentConfig', {agentId: this.sel}).then(c => { this.d = c; this.sel = c.selectedId; this.test = {history: [], busy: false, last: null}; this.draw(); if (then) { then(); } })
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('No se pudo cargar el comercial virtual'); });
        }

        agentBar() {
            const d = this.d, opts = d.agents.map(a => `<option value="${esc(a.id)}" ${a.id === d.selectedId ? 'selected' : ''}>${esc(a.name)}${a.persona && a.persona !== a.name ? ' · ' + esc(a.persona) : ''}${a.enabled ? '' : ' (apagado)'}</option>`).join('');
            return `<div class="ch-ag-bar"><button type="button" class="btn btn-default btn-sm" data-act="agback"><span class="fas fa-arrow-left"></span> Mis comerciales</button><span class="ch-ag-bar-l"><span class="fas fa-robot"></span> Estás configurando a</span><select data-agsel class="form-control">${opts}</select>${d.agents.length > 1 ? '' : '<small class="ch-muted">Puedes crear más en «Mis comerciales».</small>'}</div>`;
        }

        // ------------------------------------------------ mis comerciales y reparto
        agentsHtml() {
            const d = this.d, dp = d.dispatch, split = dp.mode === 'split', w = k => (dp.weights[k] != null ? dp.weights[k] : 1);
            const canAdd = d.agents.length < d.slots;
            const card = a => `<div class="ch-ln-card ${a.enabled ? '' : 'off'} ch-ag-card" data-ag="${esc(a.id)}">
                <div class="ch-ln-head"><div class="ch-ln-ic"><span class="fas fa-robot"></span></div><div class="ch-ln-title"><b>${esc(a.name)}</b><span class="ch-muted">${esc(a.persona)} · ${esc(a.role)}</span></div>
                    <label class="ch-ln-sw" title="${a.enabled ? 'Encendido: recibe leads' : 'Apagado: no recibe leads nuevos y pausa los que lleva'}"><input type="checkbox" data-agsw="${esc(a.id)}" ${a.enabled ? 'checked' : ''}><i></i></label></div>
                <div class="ch-ln-meta"><span class="ch-ln-badge ${a.mode === 'auto' ? 'on' : ''}">${a.mode === 'auto' ? 'Automático' : 'Manual'}</span>${a.mode === 'auto' && a.dry_run ? '<span class="ch-ln-badge">Modo de prueba</span>' : ''}<span class="ch-ln-sum">${a.channels.map(c => ({whatsapp: 'WhatsApp', email: 'Correo', sms: 'SMS'}[c] || c)).join(' · ') || 'Sin canales'}${a.menus ? ' · ' + a.menus + ' menú(s)' : ''}</span></div>
                <div class="ch-ag-nums"><div><b>${a.stats.active}</b><small>leads activos</small></div><div><b>${a.stats.leads}</b><small>leads en total</small></div><div><b>${a.stats.sent}</b><small>mensajes (30 d)</small></div></div>
                <div class="ch-ln-acts"><button class="btn btn-default btn-sm" data-act="agtrain" data-id="${esc(a.id)}"><span class="fas fa-graduation-cap"></span> Entrenar</button><button class="btn btn-default btn-sm" data-act="agtest" data-id="${esc(a.id)}"><span class="fas fa-comments"></span> Probar</button>
                    <button class="btn btn-default btn-sm" data-act="agclone" data-id="${esc(a.id)}" ${canAdd ? '' : 'disabled'}><span class="far fa-clone"></span> Duplicar</button>${d.agents.length > 1 ? `<button class="btn btn-link btn-sm text-danger" data-act="agdel" data-id="${esc(a.id)}"><span class="far fa-trash-can"></span> Quitar</button>` : ''}</div></div>`;
            const pct = (k, list) => { const t = list.reduce((s, x) => s + x.w, 0); return t ? Math.round(100 * (list.find(x => x.k === k) || {w: 0}).w / t) : 0; };
            const liveAg = d.agents.filter(a => a.enabled && a.mode === 'auto');
            const rows = [{k: 'humans', n: 'Asesores humanos (grupo, se balancean entre sí por carga)', w: w('humans')}].concat(d.agents.map(a => ({k: a.id, n: `${a.name} (comercial virtual)${a.enabled && a.mode === 'auto' ? '' : a.enabled ? ' · en manual: no participa' : ' · apagado: no participa'}`, w: w(a.id)})));
            const active = split ? rows.filter(r => r.k === 'humans' || liveAg.some(a => a.id === r.k)) : rows.filter(r => r.k !== 'humans' && liveAg.some(a => a.id === r.k));
            return `${d.licensed ? '' : '<div class="ch-warn">La versión automática del comercial virtual no está activada para tu empresa: puedes crear y entrenar comerciales, pero no recibirán leads. Pídela a tu proveedor.</div>'}
                <div class="ch-ln-bar"><button class="btn btn-primary btn-sm" data-act="agadd" ${canAdd ? '' : 'disabled'}><span class="fas fa-plus"></span> Nuevo comercial virtual</button><span class="ch-muted">${d.agents.length} de ${d.slots} incluido(s) en tu licencia${canAdd ? '' : ' · Para tener más, contacta con soporte de Crm Hub 360.'}</span></div>
                <div class="ch-ln-grid">${d.agents.map(card).join('')}</div>
                <div class="ch-sim-card"><h4><span class="fas fa-shuffle"></span> Reparto de leads nuevos</h4><p class="ch-muted">Decide quién atiende cada lead que llega por formularios, WhatsApp, redes u otro canal automático.</p>
                    <label class="ch-dz-chk"><input type="radio" name="dpmode" value="shared" ${split ? '' : 'checked'}> <b>Compartido</b> — los asesores humanos reciben la asignación de siempre y además un comercial virtual atiende el lead (si hay varios, rotan según su peso).</label>
                    <label class="ch-dz-chk"><input type="radio" name="dpmode" value="split" ${split ? 'checked' : ''}> <b>Repartir entre humanos y virtuales</b> — cada lead nuevo va a <b>uno solo</b>: al grupo de asesores humanos o a un comercial virtual, según los pesos. Así los intercalas.</label>
                    <div class="ch-ag-dp">${rows.map(r => `<div class="ch-ag-dpr ${(split || r.k !== 'humans') ? '' : 'dim'}"><span>${esc(r.n)}</span><input type="number" min="0" max="100" data-dw="${esc(r.k)}" value="${r.w}"><small>${active.some(x => x.k === r.k) ? pct(r.k, active.map(x => ({k: x.k, w: +(this.el.querySelector(`[data-dw="${x.k}"]`) ? this.el.querySelector(`[data-dw="${x.k}"]`).value : x.w)}))) + '%' : '—'}</small></div>`).join('')}</div>
                    <p class="ch-muted">El peso es la proporción: con humanos 2 y un comercial virtual 1, de cada 3 leads salen 2 para personas y 1 para el comercial virtual, intercalados. Un peso 0 excluye a ese participante. Solo participan los comerciales <b>encendidos y en modo automático</b>.</p>
                    <div class="ch-mail-actions"><button class="btn btn-primary btn-sm" data-act="dpsave"><span class="fas fa-floppy-disk"></span> Guardar reparto</button></div></div>`;
        }

        dpWeights() { const w = {}; this.el.querySelectorAll('[data-dw]').forEach(i => { w[i.dataset.dw] = Math.max(0, Math.min(100, parseInt(i.value, 10) || 0)); }); return w; }

        dpPreview() {   // porcentajes del reparto mientras se editan los pesos
            const split = (this.el.querySelector('[name="dpmode"]:checked') || {}).value === 'split', w = this.dpWeights();
            const live = this.d.agents.filter(a => a.enabled && a.mode === 'auto').map(a => a.id), ks = (split ? ['humans'] : []).concat(live), tot = ks.reduce((s, k) => s + (w[k] || 0), 0);
            this.el.querySelectorAll('.ch-ag-dpr').forEach(r => { const i = r.querySelector('[data-dw]'), k = i.dataset.dw, sm = r.querySelector('small'); sm.textContent = ks.includes(k) && tot ? Math.round(100 * (w[k] || 0) / tot) + '%' : '—'; });
        }

        dpSave() {
            const mode = (this.el.querySelector('[name="dpmode"]:checked') || {}).value || 'shared';
            Espo.Ajax.postRequest('CrmHub/agentDispatchSave', {mode, weights: this.dpWeights()}).then(() => { Espo.Ui.success('Reparto guardado'); return this.load(this.sel); })
                .catch(xhr => { const rs = xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason'); if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error(rs || 'No se pudo guardar el reparto'); });
        }

        agentCall(promise, ok) {
            return promise.then(r => { this.d = r; this.sel = r.selectedId; if (ok) { Espo.Ui.success(ok); } this.draw(); })
                .catch(xhr => { const rs = xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason'); if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error(rs || 'No se pudo completar la acción'); this.load(this.sel); });
        }

        draw() {
            const root = this.el && this.el.querySelector('.ch-ag'); if (!root) { return; }
            if (!this.d) { root.innerHTML = '<div class="ch-muted" style="padding:24px">Cargando…</div>'; return; }
            if (this.d.error) { root.innerHTML = '<div class="ch-chat-err">No se pudo cargar. Solo los administradores pueden ver esta pantalla.</div>'; return; }
            const tabs = [['agents', 'fas fa-users-gear', 'Mis comerciales'], ['train', 'fas fa-graduation-cap', 'Entrenamiento'], ['menus', 'fas fa-list-ul', 'Mensajes con opciones'], ['test', 'fas fa-comments', 'Probar'], ['stats', 'fas fa-chart-column', 'Resultados y trazabilidad'], ['ai', 'fas fa-microchip', 'Motor de IA']].map(([k, i, l]) => `<a class="ch-tpl-tab ${this.tab === k ? 'on' : ''}" data-act="tab" data-t="${k}"><span class="${i}"></span> ${l}</a>`).join('');
            root.innerHTML = `<div class="ch-sim-head"><h3><span class="fas fa-robot"></span> Comercial virtual</h3><p class="ch-muted">Atiende a cada lead de principio a fin —primer contacto, respuestas, seguimientos, cambios de estado— y pasa el caso a una persona cuando hace falta. Cada decisión queda registrada con su porqué.</p></div><div class="ch-tpl-tabs">${tabs}</div>` +
                (this.tab === 'agents' ? this.agentsHtml() : ['train', 'menus', 'test'].includes(this.tab) ? this.agentBar() + (this.tab === 'train' ? this.trainHtml() : this.tab === 'menus' ? this.menusHtml() : this.testHtml()) : this.tab === 'ai' ? this.aiHtml() : this.statsHtml());
            root.onclick = e => this.click(e);
            root.onchange = e => { const s = e.target.closest('[data-agsel]'); if (s) { this.load(s.value); return; } const sw = e.target.closest('[data-agsw]'); if (sw) { this.agentCall(Espo.Ajax.postRequest('CrmHub/agentEnable', {id: sw.dataset.agsw, enabled: sw.checked}), sw.checked ? 'Comercial virtual encendido' : 'Comercial virtual apagado'); } };
            root.oninput = e => { if (e.target.closest('[data-dw]') && this.tab === 'agents') { clearTimeout(this._dwt); this._dwt = setTimeout(() => this.dpPreview(), 250); } };
            if (this.tab === 'stats' && !this.stats) { this.loadStats(); }
            if (this.tab === 'ai' && !this.ai) { Espo.Ajax.getRequest('CrmHub/aiConfig').then(r => { this.ai = r; this.draw(); }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } }); }
        }

        // ------------------------------------------------ entrenamiento
        trainHtml() {
            const c = this.d.config, lic = this.d.licensed, u = this.d.usage || {};
            const opt = (v, t, s, off) => `<div class="ch-ag-opt ${c.mode === v ? 'on' : ''} ${off ? 'off' : ''}" data-act="mode" data-m="${v}"><b>${t}</b><small>${s}</small></div>`;
            const day = DAYS.map(([n, l]) => `<label><input type="checkbox" data-day="${n}" ${c.schedule.days.includes(n) ? 'checked' : ''}> ${l}</label>`).join('');
            return `<div class="ch-sim-card"><h5>Nombre de este comercial virtual</h5><input data-an value="${esc(this.d.name)}" maxlength="60" placeholder="Ej.: Cobranza, Ventas, Atención al cliente"><div class="ch-muted">Es el nombre interno para distinguirlo de los demás; el nombre con el que se presenta al cliente es «Nombre con el que se presenta».</div><h5>1. Versión</h5><div class="ch-ag-mode">${opt('manual', 'Manual', 'Siempre una persona atiende a los leads. El comercial virtual no escribe a nadie.')}${opt('auto', 'Automática', lic ? 'El comercial virtual atiende a todos los leads solo, según este entrenamiento.' : 'No activada para tu empresa: pídela a tu proveedor (tiene un costo distinto).', !lic)}</div>
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
                <div class="ch-chat-err" data-role="err" hidden></div><div class="ch-mail-actions"><button class="btn btn-primary" data-act="save"><span class="fas fa-floppy-disk"></span> Guardar entrenamiento</button><button class="btn btn-default" data-act="agcancel">Cancelar</button></div></div>`;
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

        // ------------------------------------------------ mensajes con opciones (lista / botones de WhatsApp)
        blankMenu(tpl) {
            if (tpl === 'situacion') {
                return {id: '', name: 'Situación del cliente', enabled: true, type: 'list', when: 'Cuando el cliente ya respondió y necesitas saber cuál es su situación para orientarlo.', body: 'Para ayudarte mejor, cuéntame: ¿cuál de estas opciones describe mejor tu situación?', button: 'Ver opciones',
                    options: [{id: '', title: 'Estoy en mora', description: 'Tengo cuotas atrasadas', status: ''}, {id: '', title: 'Quiero consolidar deudas', description: 'Pagar una sola cuota', status: ''}, {id: '', title: 'Estoy reportado', description: 'Aparezco en centrales de riesgo', status: ''}, {id: '', title: 'Otra consulta', description: '', status: ''}]};
            }
            return {id: '', name: 'Nuevo mensaje con opciones', enabled: true, type: 'list', when: '', body: '', button: 'Ver opciones', options: [{id: '', title: '', description: '', status: ''}, {id: '', title: '', description: '', status: ''}]};
        }

        menusHtml() {
            const c = this.d.config, menus = c.menus || [];
            const stOpt = s => ['', 'En Calificación', 'Calificado', 'En Enfriamiento/Contactado', 'Dead'].map(v => `<option value="${esc(v)}" ${v === (s || '') ? 'selected' : ''}>${v ? esc(v) : 'No cambia el estado'}</option>`).join('');
            const card = (m, i) => `<div class="ch-ag-mn ${m.enabled ? '' : 'off'}" data-mn="${i}">
                <div class="ch-ag-mnh"><input data-m="name" value="${esc(m.name)}" maxlength="60" placeholder="Nombre del mensaje"><select data-m="type"><option value="list" ${m.type === 'list' ? 'selected' : ''}>Lista (hasta 10 opciones)</option><option value="buttons" ${m.type === 'buttons' ? 'selected' : ''}>Botones (hasta 3)</option></select>
                    <label class="ch-ln-sw" title="Encendido: el comercial virtual puede usarlo"><input type="checkbox" data-m="enabled" ${m.enabled ? 'checked' : ''}><i></i></label><a data-act="mndel" data-i="${i}" title="Eliminar"><span class="far fa-trash-can"></span></a></div>
                <label>Cuándo usarlo (se lo indicas a la IA)</label><textarea data-m="when" rows="2" maxlength="400" placeholder="Ej.: Cuando el cliente no ha dicho cuál es su situación de deuda.">${esc(m.when)}</textarea>
                <label>Texto del mensaje</label><textarea data-m="body" rows="3" maxlength="1000" placeholder="Ej.: Para ayudarte mejor, ¿cuál de estas opciones describe mejor tu situación?">${esc(m.body)}</textarea>
                ${m.type === 'list' ? `<label>Texto del botón que abre la lista (máx. 20)</label><input data-m="button" maxlength="20" value="${esc(m.button)}">` : ''}
                <label>Opciones</label>${m.options.map((o, j) => `<div class="ch-ag-op" data-op="${j}"><input data-o="title" maxlength="${m.type === 'buttons' ? 20 : 24}" value="${esc(o.title)}" placeholder="Opción ${j + 1} (máx. ${m.type === 'buttons' ? 20 : 24} letras)">${m.type === 'list' ? `<input data-o="description" maxlength="72" value="${esc(o.description || '')}" placeholder="Descripción (opcional, máx. 72)">` : ''}<select data-o="status" title="Estado del lead cuando el cliente elige esta opción">${stOpt(o.status)}</select><a data-act="opdel" data-i="${i}" data-o="${j}" title="Quitar opción"><span class="fas fa-xmark"></span></a></div>`).join('')}
                <div class="ch-mail-actions"><button class="btn btn-default btn-sm" data-act="opadd" data-i="${i}" ${m.options.length >= (m.type === 'buttons' ? 3 : 10) ? 'disabled' : ''}><span class="fas fa-plus"></span> Agregar opción</button><button class="btn btn-default btn-sm" data-act="mntest" data-i="${i}"><span class="fab fa-whatsapp"></span> Probar en mi WhatsApp</button></div></div>`;
            return `<div class="ch-sim-card"><p class="ch-muted">En vez de pedirle al cliente que escriba, el comercial virtual puede enviar <b>una lista o botones</b> de WhatsApp: «¿cuál de estas opciones describe mejor tu situación?». Tú defines los menús y <b>cuándo usarlos</b>; la IA decide el momento. Cuando el cliente elige una opción queda registrada en su historial y puede cambiar el estado del lead.</p>
                <div class="ch-help"><b>Cómo lo recibe el cliente:</b> con <b>WhatsApp oficial (Meta)</b> aparece como lista o botones nativos. Con una línea no oficial (<b>Evolution / QR</b>), Twilio, Gupshup u otro proveedor, WhatsApp no muestra listas: se envía como <b>texto numerado</b> («1. … 2. …, responde con el número») y el sistema entiende la respuesta igual.</div>
                <label class="ch-dz-chk"><input type="checkbox" data-mf="native" ${c.menus_native_evolution ? 'checked' : ''}> Intentar lista/botones nativos también con Evolution API <small class="ch-muted">(experimental: WhatsApp suele ocultarlos en líneas no oficiales; si no los ves, déjalo apagado)</small></label>
                ${menus.map(card).join('') || ChUi.empty({kind: 'chat', title: 'Aún no tienes mensajes con opciones', text: 'Crea uno desde cero o parte del ejemplo «Situación del cliente».', compact: true})}
                <div class="ch-chat-err" data-role="err" hidden></div>
                <div class="ch-mail-actions"><button class="btn btn-default btn-sm" data-act="mnadd"><span class="fas fa-plus"></span> Nuevo mensaje con opciones</button><button class="btn btn-default btn-sm" data-act="mnadd" data-tpl="situacion"><span class="fas fa-wand-magic-sparkles"></span> Usar el ejemplo «Situación del cliente»</button><button class="btn btn-primary" data-act="mnsave"><span class="fas fa-floppy-disk"></span> Guardar</button><button class="btn btn-default" data-act="agcancel">Cancelar</button></div></div>`;
        }

        menusCollect() {
            const c = this.d.config;
            c.menus = [...this.el.querySelectorAll('[data-mn]')].map((card, i) => {
                const g = k => (card.querySelector(`[data-m="${k}"]`) || {}), old = (c.menus || [])[i] || {};
                return {id: old.id || '', name: g('name').value || '', enabled: !!g('enabled').checked, type: g('type').value || 'list', when: g('when').value || '', body: g('body').value || '', button: g('button').value || old.button || 'Ver opciones',
                    options: [...card.querySelectorAll('[data-op]')].map((op, j) => { const f = k => (op.querySelector(`[data-o="${k}"]`) || {}).value || ''; return {id: ((old.options || [])[j] || {}).id || '', title: f('title'), description: f('description'), status: f('status')}; })};
            });
            const n = this.el.querySelector('[data-mf="native"]'); if (n) { c.menus_native_evolution = n.checked; }
        }

        menusSave() {
            this.menusCollect();
            const err = this.el.querySelector('[data-role="err"]'); err.hidden = true;
            const c = JSON.parse(JSON.stringify(this.d.config));
            c.menus = c.menus.map(m => ({...m, options: m.options.filter(o => o.title.trim())}));
            Espo.Ajax.postRequest('CrmHub/agentConfigSave', {config: c, agentId: this.d.selectedId}).then(r => { this.d.config = r.config; Espo.Ui.success('Mensajes con opciones guardados'); this.draw(); })
                .catch(xhr => { err.hidden = false; err.textContent = Tpl.reason(xhr, 'No se pudo guardar.'); if (xhr) { xhr.errorIsHandled = true; } });
        }

        menuTest(i) {
            this.menusCollect();
            const m = (this.d.config.menus || [])[i];
            if (!m || !m.id) { Espo.Ui.warning('Guarda el mensaje antes de probarlo.'); return; }
            ChUi.prompt({title: 'Probar en tu WhatsApp', text: `Se envía «${m.name}» al número que escribas para que veas cómo lo recibe el cliente.`, label: 'Tu número de WhatsApp (con indicativo)', rows: 1, max: 20, ok: 'Enviar prueba', required: true, min: 7, requiredText: 'Escribe un número con indicativo, p. ej. +57 300 123 4567.'}).then(to => {
                if (!to) { return; }
                Espo.Ui.notify('Enviando…');
                Espo.Ajax.postRequest('CrmHub/agentMenuTest', {menuId: m.id, to, agentId: this.d.selectedId}).then(r => { Espo.Ui.notify(false); Espo.Ui.success(r.native ? 'Enviado como ' + (m.type === 'buttons' ? 'botones' : 'lista') + ' nativa(o)' : 'Enviado como texto numerado'); })
                    .catch(xhr => { Espo.Ui.notify(false); const rs = xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason'); if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error(rs || 'No se pudo enviar la prueba'); });
            });
        }

        // ------------------------------------------------ probar
        testHtml() {
            const t = this.test;
            const chat = t.history.map(h => `<div class="ch-ag-b ${h.who === 'cliente' ? 'c' : 'a'}">${esc(h.text)}${h.menu ? `<div class="ch-ag-opts">${h.menu.options.map(o => `<a data-act="topt" data-v="${esc(o.title)}"><b>${esc(o.title)}</b>${o.description ? `<small>${esc(o.description)}</small>` : ''}</a>`).join('')}<small class="ch-muted">${h.menu.type === 'buttons' ? 'Botones' : 'Lista «' + esc(h.menu.button) + '»'} · toca una opción para responder como el cliente</small></div>` : ''}</div>`).join('') || ChUi.empty({kind: 'chat', title: 'Aún no hay mensajes', text: 'Pulsa «Simular primer contacto» o escribe como si fueras el cliente.', compact: true});
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
            const sample = {agentId: this.d.selectedId, name: q('[data-t="name"]').value, channel: q('[data-t="channel"]').value, description: q('[data-t="description"]').value, history: t.history.map(h => ({who: h.who, text: h.text})), message: msg, kind: first ? 'first' : undefined};
            if (msg) { t.history.push({who: 'cliente', text: msg}); }
            t.busy = true; this.draw();
            Espo.Ajax.postRequest('CrmHub/agentTest', {sample: {...sample, history: sample.history}}, {timeout: 295000}).then(r => { t.last = r; if (r.message) { t.history.push({who: 'agente', text: r.message, menu: r.menu || null}); } })
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
            const ba = this.d.agents.length > 1 ? `<div class="ch-sim-card"><h4><span class="fas fa-users-gear"></span> Por comercial virtual</h4><div class="ch-ag-nums" style="flex-wrap:wrap">${this.d.agents.map(a => { const x = (s.byAgent || {})[a.id] || {leads: 0, active: 0, sent: 0}; return `<div><b>${esc(a.name)}</b><small>${x.active} activos · ${x.leads} leads · ${x.sent} mensajes (30 d)${a.enabled ? '' : ' · apagado'}</small></div>`; }).join('')}</div></div>` : '';
            return pend + ba + `<div class="ch-kb-kpis">${kpi('Leads atendidos (30 días)', s.leads)}${kpi('Mensajes enviados', s.sent, s.simulated ? s.simulated + ' en modo de prueba' : '')}${kpi('Respuestas de clientes', s.replies)}${kpi('Pasados a una persona', s.escalations)}${kpi('Tiempo al primer contacto', rt, 'promedio')}${kpi('Cambios de estado', s.statusChanges)}</div>
                <div class="ch-sim-card"><h4>Mensajes por día</h4>${s.series.length ? `<div class="ch-ag-bars">${s.series.map(x => `<i style="height:${Math.max(3, 100 * x.n / max)}%" title="${esc(x.d)}: ${x.n}"></i>`).join('')}</div>` : ChUi.empty({kind: 'chat', title: 'Aún no hay mensajes', text: 'Pronto entrarán datos.', compact: true})}</div>
                <div class="ch-sim-card"><h4>Trazabilidad: lo último que hizo el comercial virtual</h4>${(s.events || []).map(e => `<div class="ch-agp-e"><span class="fas fa-circle" style="color:${e.kind === 'send' ? '#4f63e8' : e.kind === 'escalate' ? '#f59e0b' : e.kind === 'error' || e.kind === 'stop' ? '#d64545' : '#94a3b8'};font-size:9px"></span><div><b>${esc(KIND[e.kind] || e.kind)} · ${esc(e.lead_name || e.lead_id)}</b> ${e.dry ? '<em>(prueba)</em>' : ''} <a href="#Lead/view/${esc(e.lead_id)}">Abrir lead</a><div>${esc(e.title)}</div>${e.detail ? `<div class="ch-agp-d">${esc(String(e.detail).slice(0, 260))}</div>` : ''}${e.reason ? `<div class="ch-muted">Por qué: ${esc(e.reason)}</div>` : ''}<small>${esc(when(e.at))}${e.channel ? ' · ' + esc(e.channel) : ''}</small></div></div>`).join('') || ChUi.empty({kind: 'robot', title: 'Todavía no hay actividad', text: 'Tu comercial virtual aún no ha trabajado. Verás aquí cada paso.', compact: true})}</div>`;
        }

        // ------------------------------------------------ eventos
        click(e) {
            const a = e.target.closest('[data-act]'); if (!a) { return; }
            const act = a.dataset.act;
            if (act === 'tab') { this.tab = a.dataset.t; if (this.tab === 'stats') { this.stats = null; } this.draw(); }
            else if (act === 'mode') { if (a.classList.contains('off')) { Espo.Ui.warning('La versión automática no está activada para tu empresa.'); return; } this.d.config = this.collect(); this.d.config.mode = a.dataset.m; this.draw(); }
            else if (act === 'agback') { this.tab = 'agents'; this.draw(); }
            else if (act === 'agcancel') { this.load(this.sel, () => { this.tab = 'agents'; this.draw(); }); }
            else if (act === 'agadd') { ChUi.prompt({title: 'Nuevo comercial virtual', text: 'Parte de cero (queda en manual y en modo de prueba hasta que lo entrenes y lo actives).', label: 'Nombre interno', rows: 1, max: 60, ok: 'Crear', placeholder: 'Ej.: Cobranza, Ventas, Atención al cliente'}).then(n => { if (n !== null) { this.agentCall(Espo.Ajax.postRequest('CrmHub/agentCreate', {name: n}), 'Comercial virtual creado: entrénalo en la pestaña «Entrenamiento»').then(() => { this.tab = 'train'; this.draw(); }); } }); }
            else if (act === 'agclone') { this.agentCall(Espo.Ajax.postRequest('CrmHub/agentCreate', {cloneFrom: a.dataset.id}), 'Copia creada: ajústala en «Entrenamiento»').then(() => { this.tab = 'train'; this.draw(); }); }
            else if (act === 'agdel') { ChUi.confirm({title: 'Quitar comercial virtual', danger: true, ok: 'Quitar', text: 'Se quita este comercial virtual. Los leads que atiende pasan al primero de la lista y su historial se conserva.'}).then(y => { if (y) { this.agentCall(Espo.Ajax.postRequest('CrmHub/agentDelete', {id: a.dataset.id}), 'Comercial virtual quitado'); } }); }
            else if (act === 'agtrain') { this.load(a.dataset.id, () => { this.tab = 'train'; this.draw(); }); }
            else if (act === 'agtest') { this.load(a.dataset.id, () => { this.tab = 'test'; this.draw(); }); }
            else if (act === 'dpsave') { this.dpSave(); }
            else if (act === 'addfaq') { this.d.config = this.collect(); this.d.config.faq.push({q: '', a: ''}); this.draw(); }
            else if (act === 'delfaq') { this.d.config = this.collect(); this.d.config.faq.splice(+a.dataset.i, 1); this.draw(); }
            else if (act === 'save') { this.save(); }
            else if (act === 'aitest') { this.aiTest(); }
            else if (act === 'aisave') { this.aiSave(); }
            else if (act === 'tsend') { this.runTest(false); }
            else if (act === 'tfirst') { this.test.history = []; this.runTest(true); }
            else if (act === 'topt') { const ta = this.el.querySelector('[data-t="message"]'); if (ta) { ta.value = a.dataset.v; this.runTest(false); } }
            else if (act === 'mnadd') { this.menusCollect(); this.d.config.menus = (this.d.config.menus || []).concat([this.blankMenu(a.dataset.tpl)]); this.draw(); }
            else if (act === 'mndel') { this.menusCollect(); this.d.config.menus.splice(+a.dataset.i, 1); this.draw(); }
            else if (act === 'opadd') { this.menusCollect(); const m = this.d.config.menus[+a.dataset.i]; if (m.options.length < (m.type === 'buttons' ? 3 : 10)) { m.options.push({id: '', title: '', description: '', status: ''}); } this.draw(); }
            else if (act === 'opdel') { this.menusCollect(); this.d.config.menus[+a.dataset.i].options.splice(+a.dataset.o, 1); this.draw(); }
            else if (act === 'mnsave') { this.menusSave(); }
            else if (act === 'mntest') { this.menuTest(+a.dataset.i); }
            else if (act === 'treset') { this.test = {history: [], busy: false, last: null}; this.draw(); }
        }

        save() {
            const c = this.collect(), err = this.el.querySelector('[data-role="err"]'); err.hidden = true;
            if (c.mode === 'auto' && !c.company.about.trim() && !c.company.services.trim()) { err.hidden = false; err.textContent = 'Antes de activar la versión automática cuéntale al agente qué hace tu empresa y qué servicios ofrece.'; return; }
            const go = () => Espo.Ajax.postRequest('CrmHub/agentConfigSave', {config: c, agentId: this.d.selectedId, name: (this.el.querySelector('[data-an]') || {}).value || undefined}).then(r => { Espo.Ui.success('Entrenamiento guardado'); return this.load(r.agentId); })
                .catch(xhr => { err.hidden = false; err.textContent = Tpl.reason(xhr, 'No se pudo guardar.'); if (xhr) { xhr.errorIsHandled = true; } });
            if (c.mode === 'auto' && !c.dry_run && this.d.config.mode !== 'auto' || (c.mode === 'auto' && !c.dry_run && this.d.config.dry_run)) {
                ChUi.confirm({title: 'Activar la versión automática', html: 'El comercial virtual <b>escribirá a los clientes de verdad</b> (WhatsApp, correo) sin que una persona lo revise. ¿Ya probaste sus respuestas?', ok: 'Activar', danger: true}).then(y => { if (y) { go(); } });
            } else { go(); }
        }
    };
});
