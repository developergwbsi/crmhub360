/**
 * Panel «Teléfono» del registro: marcar, registrar una llamada manual y ver el historial de llamadas.
 * Endpoints: GET CrmHub/channels, GET CrmHub/linesActive, POST CrmHub/voice/call (llamada por el proveedor de voz), POST CrmHub/call (registrar llamada), GET CrmHub/leadTimeline (kind=calls).
 * El teléfono del agente se recuerda con la clave crmhub-agent-phone-{usuario}. Recarga con 'sync' del modelo y avisa con Live.notify; usa pantalla dividida ('ch').
 */
define('custom:views/modals/phone', ['views/modal', 'custom:ui', 'custom:split', 'custom:live-panel'], function (Dep, ChUi, Split, Live) {
    const STATUS = {Held: ['Realizada', 'ok'], 'Not Held': ['No contestada', 'bad'], Planned: ['En curso / pendiente', 'warn']};
    return class extends Dep {
        className = 'dialog ch-ch-panel ch-phone-modal'
        backdrop = false
        templateContent = '<div class="ch-cl"></div>'

        events = {
            'click [data-action="dial"]': function () { this.startCall(); },
            'click [data-action="dialer"]': function () { this.dialer(); },
            'click [data-action="manual"]': function () { this.setMode('log'); },
            'click [data-action="cancelForm"]': function () { this.setMode(null); },
            'click [data-action="startNow"]': function () { this.startNow(); },
            'click [data-action="saveLog"]': function () { this.saveLog(); },
        }

        setup() {
            this.buttonList = [];
            this.scope = this.options.scope || 'Lead';
            this.headerHtml = '<span class="ch-chat-badge" style="background:#16a34a"><span class="fas fa-phone"></span></span> ' +
                `<span class="ch-chat-title"><b>${ChUi.esc(this.options.name || '')}</b><small>${ChUi.esc(this.options.phone || '')} · Llamadas</small></span>`;
            this.listenTo(this.options.model, 'sync', () => this.load());
        }

        key() { return 'crmhub-agent-phone-' + (this.getUser().id || ''); }

        afterRender() {
            if (!this._chSplit) { this._chSplit = true; Split.open('ch'); }
            this.el.querySelector('.ch-cl').innerHTML = '<div class="ch-cl-scroll">' +
                '<div class="ch-cl-actions">' +
                    `<button type="button" class="btn ch-cl-main" data-action="dial"><span class="fas fa-phone"></span> Llamar a ${ChUi.esc(this.options.phone || 'este número')}</button>` +
                    '<div class="ch-cl-sub"><button type="button" class="btn btn-default btn-sm" data-action="dialer"><span class="fas fa-headset"></span> Usar el marcador del equipo</button>' +
                    '<button type="button" class="btn btn-default btn-sm" data-action="manual"><span class="fas fa-clipboard-check"></span> Registrar llamada hecha</button></div>' +
                    '<div class="ch-cl-hint" data-role="hint">Listo para llamar</div><div class="ch-cl-form" data-role="form" hidden></div></div>' +
                '<div class="ch-cl-hist"><h5>Llamadas</h5><div data-role="list" class="ch-cl-list"><div class="ch-chat-empty">Cargando…</div></div></div></div>';
            this.load();
            this.timer = setInterval(() => this.load(), 8000);
        }

        onRemove() { clearInterval(this.timer); if (this._chSplit) { this._chSplit = false; Split.close('ch'); } }

        // Cambia lo que muestra el panel: marcador, llamada en curso o registro manual.
        setMode(mode, opts) {
            const f = this.el.querySelector('[data-role="form"]'); if (!f) { return; }
            this.mode = mode;
            if (!mode) { f.hidden = true; f.innerHTML = ''; return; }
            f.hidden = false;
            if (mode === 'start') {
                let agent = ''; try { agent = localStorage.getItem(this.key()) || ''; } catch (e) { /* privado */ }
                f.innerHTML = `<p>Primero <b>te llamamos a ti</b>; al contestar te conectamos con el cliente.</p><label>Tu teléfono o extensión</label>` +
                    `<input name="agent" value="${ChUi.esc(agent)}" placeholder="3001234567 o 101" autocomplete="tel"><div class="ch-cl-err" hidden></div>` +
                    `<div class="ch-cl-btns"><button type="button" class="btn btn-success" data-action="startNow">Llamar ahora</button><button type="button" class="btn btn-default" data-action="cancelForm">Cancelar</button></div>`;
                setTimeout(() => { const i = f.querySelector('input'); i && i.focus(); }, 50);
                // varias troncales encendidas: se puede elegir desde cuál se llama
                Espo.Ajax.getRequest('CrmHub/linesActive').then(l => {
                    const v = l && l.voice; if (!v || !v.lines || v.lines.length < 2 || this.mode !== 'start') { return; }
                    const acts = f.querySelector('.ch-cl-btns'); if (!acts || f.querySelector('[name="line"]')) { return; }
                    acts.insertAdjacentHTML('beforebegin', '<label>Llamar desde</label><select name="line"><option value="">Automática (el proveedor principal)</option>' +
                        v.lines.map(x => `<option value="${ChUi.esc(x.id)}">${ChUi.esc(x.name)} · ${ChUi.esc(x.type)}${x.id === v.default ? ' (principal)' : ''}</option>`).join('') + '</select>');
                }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } });
            } else {
                f.innerHTML = `<p>${opts && opts.fromDialer ? 'Cuando termines la llamada, cuenta cómo fue:' : 'Registra una llamada que ya hiciste:'}</p>` +
                    `<label>Resultado</label><select name="result"><option>Contactado</option><option>No contesta</option><option>Buzón de voz</option><option>Número equivocado</option><option>Reagendar</option></select>` +
                    `<label>Duración (minutos)</label><input type="number" name="minutes" min="0" max="600" value="0">` +
                    `<label>Notas</label><textarea name="note" rows="3" maxlength="1000" placeholder="Qué se habló, acuerdos, próximo paso…"></textarea><div class="ch-cl-err" hidden></div>` +
                    `<div class="ch-cl-btns"><button type="button" class="btn btn-primary" data-action="saveLog">Guardar</button><button type="button" class="btn btn-default" data-action="cancelForm">Cancelar</button></div>`;
            }
        }

        formError(msg) { const e = this.el.querySelector('.ch-cl-err'); if (e) { e.hidden = !msg; e.textContent = msg || ''; } }

        startCall() {
            if (this.scope !== 'Lead') { this.dialer(); return; }
            Espo.Ajax.getRequest('CrmHub/channels').then(ch => (ch.voice ? this.setMode('start') : this.dialer()))
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } this.dialer(); });
        }

        dialer() {
            window.location.href = 'tel:' + String(this.options.phone || '').replace(/[^+\d]/g, '');
            this.setMode('log', {fromDialer: true});
        }

        // Inicia la llamada vía el Hub (CrmHub/voice/call).
        startNow() {
            const agent = (this.el.querySelector('[name="agent"]').value || '').trim();
            if (!agent) { this.formError('Escribe tu teléfono o extensión.'); return; }
            try { localStorage.setItem(this.key(), agent); } catch (e) { /* privado */ }
            this.formError(''); this.el.querySelector('[data-role="hint"]').textContent = 'Llamando…';
            Espo.Ajax.postRequest('CrmHub/voice/call', {leadId: this.options.leadId, agentPhone: agent, lineId: (this.el.querySelector('[name="line"]') || {}).value || undefined}).then(() => {
                this.el.querySelector('[data-role="hint"]').textContent = 'Te estamos llamando: contesta para conectar';
                this.setMode(null); this.load(); this.trigger('done'); Live.notify(this.options.leadId);
            }).catch(xhr => {
                this.el.querySelector('[data-role="hint"]').textContent = 'Listo para llamar';
                this.formError((xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason')) || 'No se pudo iniciar la llamada.');
                if (xhr) { xhr.errorIsHandled = true; }
            });
        }

        saveLog() {
            const v = n => (this.el.querySelector(`[name="${n}"]`) || {}).value;
            Espo.Ajax.postRequest('CrmHub/call', {leadId: this.options.leadId, entityType: this.scope, result: v('result'), minutes: parseInt(v('minutes') || '0', 10), note: v('note')})
                .then(() => { Espo.Ui.success('Llamada registrada'); this.setMode(null); this.load(); this.trigger('done'); Live.notify(this.options.leadId); })
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } this.formError('No se pudo registrar la llamada.'); });
        }

        load() {
            Espo.Ajax.getRequest('CrmHub/leadTimeline', {leadId: this.options.leadId, scope: this.scope, kind: 'calls'}).then(r => {
                const list = this.el.querySelector('[data-role="list"]'); if (!list) { return; }
                const items = r.items || [];
                list.innerHTML = items.length ? items.map(c => {
                    const st = STATUS[c.status] || [c.status || '', ''];
                    const ic = c.status === 'Not Held' ? 'fa-phone-slash' : (c.dir === 'in' ? 'fa-phone-volume' : 'fa-phone-flip');
                    return `<div class="ch-cl-item"><span class="ch-cl-ic ${st[1]}"><span class="fas ${ic}"></span></span><div class="ch-cl-info">` +
                        `<div class="ch-cl-top"><b>${c.dir === 'in' ? 'Entrante' : 'Saliente'}</b><span class="ch-chip ch-chip-${st[1] || 'info'}">${ChUi.esc(st[0])}</span><span class="ch-cl-dur">${c.duration ? ChUi.fmt.dur(c.duration) : '—'}</span></div>` +
                        `<div class="ch-cl-when">${ChUi.esc(ChUi.fmt.dt(c.at))}${c.who ? ' · por <b>' + ChUi.esc(c.who) + '</b>' : ''}</div>` +
                        (c.notes ? `<div class="ch-cl-notes">${ChUi.esc(c.notes)}</div>` : '') + '</div></div>';
                }).join('') : '<div class="ch-chat-empty"><span class="fas fa-phone"></span><p>Aún no hay llamadas.</p></div>';
            }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } });
        }
    };
});
