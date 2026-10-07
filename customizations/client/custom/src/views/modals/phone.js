// Teléfono del lead: marcador estilo celular + historial de llamadas.
define('custom:views/modals/phone', ['views/modal', 'custom:ui', 'custom:split'], function (Dep, ChUi, Split) {
    const STATUS = {Held: ['Realizada', 'ok'], 'Not Held': ['No contestada', 'bad'], Planned: ['En curso / pendiente', 'warn']};
    return class extends Dep {
        className = 'dialog ch-ch-panel ch-phone-modal'
        backdrop = false
        templateContent = '<div class="ch-phone"></div>'

        events = {
            'click [data-action="dial"]': function () { this.options.handler.actionCallStart(this.options.phone); },
            'click [data-action="dialer"]': function () { this.options.handler.dialerCall(this.options.phone); },
            'click [data-action="manual"]': function () { this.options.handler.manualCallLog(this.options.phone); },
        }

        setup() {
            this.buttonList = [];
            this.headerHtml = '<span class="ch-phone-bar"><span>Crm Hub 360</span><span class="fas fa-signal"></span></span>';
            this.listenTo(this.options.model, 'sync', () => this.load());
        }

        afterRender() {
            if (!this._chSplit) { this._chSplit = true; Split.open('ch'); }
            const initials = (this.options.name || '?').split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
            this.el.querySelector('.ch-phone').innerHTML =
                `<div class="ch-phone-top"><span class="ch-avatar ch-avatar-lg ch-phone-av">${ChUi.esc(initials)}</span><div class="ch-phone-name">${ChUi.esc(this.options.name || '')}</div>` +
                `<div class="ch-phone-num">${ChUi.esc(this.options.phone || '')}</div><div class="ch-phone-hint">Listo para llamar</div>` +
                `<button type="button" class="ch-phone-call" data-action="dial" title="Llamar"><span class="fas fa-phone"></span></button>` +
                `<div class="ch-phone-links"><a role="button" data-action="dialer">Usar el marcador del equipo</a><a role="button" data-action="manual">Registrar llamada hecha</a></div></div>` +
                `<div class="ch-phone-hist"><h5>Recientes</h5><div data-role="list" class="ch-phone-list"><div class="ch-chat-empty">Cargando…</div></div></div>`;
            this.load();
            this.timer = setInterval(() => this.load(), 8000);
        }

        onRemove() { clearInterval(this.timer); if (this._chSplit) { this._chSplit = false; Split.close('ch'); } }

        load() {
            Espo.Ajax.getRequest('CrmHub/leadTimeline', {leadId: this.options.leadId, kind: 'calls'}).then(r => {
                const list = this.el.querySelector('[data-role="list"]'); if (!list) { return; }
                const items = r.items || [];
                list.innerHTML = items.length ? items.map(c => {
                    const st = STATUS[c.status] || [c.status || '', ''];
                    const ic = c.status === 'Not Held' ? 'fa-xmark' : 'fa-phone';
                    return `<div class="ch-call"><span class="ch-call-ic ch-call-${st[1]}"><span class="fas ${ic}"></span></span><div class="ch-call-main">` +
                        `<div class="ch-call-top"><b>${c.dir === 'in' ? 'Entrante' : 'Saliente'}</b><span class="ch-chip ch-chip-${st[1] || 'info'}">${ChUi.esc(st[0])}</span></div>` +
                        `<div class="ch-call-sub">${ChUi.esc(ChUi.fmt.dt(c.at))}${c.who ? ' · ' + ChUi.esc(c.who) : ''}</div>` +
                        (c.notes ? `<div class="ch-call-notes">${ChUi.esc(c.notes)}</div>` : '') + `</div><div class="ch-call-dur">${c.duration ? ChUi.fmt.dur(c.duration) : '—'}</div></div>`;
                }).join('') : '<div class="ch-chat-empty"><span class="fas fa-phone"></span><p>Aún no hay llamadas con este lead.</p></div>';
            }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } });
        }
    };
});
