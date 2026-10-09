// Conversación con el lead por WhatsApp, Telegram o SMS, con aspecto de app de mensajería.
define('custom:views/modals/whatsapp', ['views/modal', 'custom:ui', 'custom:split', 'custom:tpl'], function (Dep, ChUi, Split, Tpl) {
    const META = {
        whatsapp: {title: 'WhatsApp', icon: 'fab fa-whatsapp', color: '#25d366'},
        telegram: {title: 'Telegram', icon: 'fab fa-telegram', color: '#229ed9'},
        sms: {title: 'SMS', icon: 'fas fa-comment-sms', color: '#0ea5e9'},
    };
    return class extends Dep {
        className = 'dialog ch-ch-panel ch-chat-modal'
        backdrop = false
        templateContent = '<div class="ch-chat"></div>'

        events = {
            'input [name="text"]': function () { this.autosize(); this.counter(); },
            'keydown [name="text"]': function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); this.send(); } },
            'click [data-action="send"]': function () { this.send(); },
            'click [data-action="aiDraft"]': function () { this.aiDraft(); },
            'change [data-role="phoneSel"]': function (e) { this.phone = e.currentTarget.value; this.paintTo(); },
            'click [data-action="myTpls"]': function (e) { e.stopPropagation(); this.toggleTpls(); },
            'click [data-action="pickMine"]': function (e) { this.useTpl(e.currentTarget.dataset.id); },
            'click [data-action="copyLink"]': function () {
                (navigator.clipboard ? navigator.clipboard.writeText(this.inviteLink) : Promise.reject()).then(() => Espo.Ui.success('Enlace copiado')).catch(() => { const i = this.el.querySelector('.ch-chat-invite input'); i && i.select(); Espo.Ui.warning('Cópialo manualmente (Ctrl+C)'); });
            },
        }

        setup() {
            this.channel = META[this.options.channel] ? this.options.channel : 'whatsapp';
            this.meta = META[this.channel];
            this.buttonList = [];
            this.headerHtml = `<span class="ch-chat-badge" style="background:${this.meta.color}"><span class="${this.meta.icon}"></span></span> ` +
                `<span class="ch-chat-title"><b>${ChUi.esc(this.options.name || '')}</b><small>${ChUi.esc(this.options.phone || '')} · ${this.meta.title}</small></span>`;
            this.items = [];
            this.signature = '';
        }

        afterRender() {
            if (!this._chSplit) { this._chSplit = true; Split.open('ch'); }
            const root = this.el.querySelector('.ch-chat');
            root.innerHTML = '<div class="ch-chat-thread" tabindex="0" aria-live="polite"><div class="ch-chat-empty">Cargando conversación…</div></div><div class="ch-chat-foot"></div>';
            this.load(true);
            this.timer = setInterval(() => this.load(false), 6000);
            Espo.Ajax.getRequest('CrmHub/channels').catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } return {}; }).then(ch => { this.channels = ch || {}; this.paintFoot(); });
            // varios proveedores encendidos en el canal: se puede elegir desde cuál enviar
            Espo.Ajax.getRequest('CrmHub/linesActive').catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } return {}; }).then(l => { this.lines = l || {}; this.paintLine(); });
        }

        onRemove() { clearInterval(this.timer); if (this._chSplit) { this._chSplit = false; Split.close('ch'); } }

        load(first) {
            return Espo.Ajax.getRequest('CrmHub/leadTimeline', {leadId: this.options.leadId, kind: 'chat', channel: this.channel}).then(r => {
                const norm = x => String(x || '').replace(/\D/g, '');
                if (r.phones && !this.phones) {   // primer arranque: se escribe al número desde el que respondió el cliente por última vez, o al principal
                    this.phones = r.phones;
                    const pref = r.preferred && r.phones.find(x => norm(x.phone) === norm(r.preferred)), main = r.phones.find(x => x.primary) || r.phones[0];
                    this.phone = (pref || main || {}).phone || this.options.phone; this.paintTo();
                }
                const sig = (r.items || []).map(i => i.id).join(',');
                if (sig !== this.signature || first) { this.signature = sig; this.items = r.items || []; this.paint(); }
            }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } });
        }

        paint() {
            const th = this.el.querySelector('.ch-chat-thread');
            if (!th) { return; }
            const near = th.scrollHeight - th.scrollTop - th.clientHeight < 80;
            let html = '', day = '';
            this.items.forEach(m => {
                const k = ChUi.fmt.dayKey(m.at);
                if (k !== day) { day = k; html += `<div class="ch-chat-day"><span>${ChUi.esc(ChUi.fmt.day(m.at))}</span></div>`; }
                const who = m.dir === 'out' ? (m.broadcast ? m.who : m.who) : '';
                html += `<div class="ch-msg ch-msg-${m.dir}"><div class="ch-bubble">${m.dir === 'out' && who ? `<div class="ch-msg-who">${ChUi.esc(who)}</div>` : ''}` +
                    `<div class="ch-msg-text">${ChUi.esc(m.text)}</div><div class="ch-msg-time">${ChUi.esc(ChUi.fmt.time(m.at))}</div></div></div>`;
            });
            th.innerHTML = html || `<div class="ch-chat-empty"><span class="${this.meta.icon}"></span><p>Aún no hay mensajes por ${this.meta.title}.<br>Escribe el primero abajo.</p></div>`;
            if (near || this.justSent) { th.scrollTop = th.scrollHeight; this.justSent = false; }
        }

        // Pie del panel: caja para escribir, aviso de canal sin configurar o invitación de Telegram. Nunca un modal aparte.
        paintFoot() {
            const foot = this.el.querySelector('.ch-chat-foot');
            if (!foot) { return; }
            const key = this.channel, ready = !!this.channels[key];
            const needInvite = this.channel === 'telegram' && ready && (this.options.mode === 'invite' || !this.options.hasChat);
            if (!ready) {
                foot.innerHTML = `<div class="ch-chat-state"><span class="${this.meta.icon}" style="color:${this.meta.color}"></span><b>${this.meta.title} no está configurado</b>` +
                    (this.channels.admin ? `<p>Conéctalo en Integraciones para poder escribir desde aquí.</p><a class="btn btn-primary btn-sm" href="#CrmHub/integrations">Ir a Integraciones</a>` : '<p>Pídele a tu administrador que lo conecte en Integraciones.</p>') + '</div>';
                return;
            }
            if (needInvite) {
                foot.innerHTML = '<div class="ch-chat-state"><span class="fab fa-telegram" style="color:#229ed9"></span><b>Este contacto aún no abre el chat con tu bot</b>' +
                    '<p>Envíale este enlace (por WhatsApp, correo o llamada). Al abrirlo y pulsar <i>Iniciar</i>, la conversación queda aquí.</p>' +
                    '<div class="ch-chat-invite" data-role="invite">Generando enlace…</div></div>';
                Espo.Ajax.postRequest('CrmHub/telegram/invite', {leadId: this.options.leadId}).then(r => {
                    const box = foot.querySelector('[data-role="invite"]'); if (!box) { return; }
                    box.innerHTML = `<input class="form-control" readonly value="${ChUi.esc(r.link)}"><button type="button" class="btn btn-primary btn-sm" data-action="copyLink">Copiar</button>`;
                    this.inviteLink = r.link; this.trigger('done');
                }).catch(xhr => {
                    const box = foot.querySelector('[data-role="invite"]');
                    if (box) { box.textContent = (xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason')) || 'No se pudo generar el enlace.'; }
                    if (xhr) { xhr.errorIsHandled = true; }
                });
                return;
            }
            foot.innerHTML = '<div class="ch-chat-composer"><div class="ch-chat-err" hidden></div><div class="ch-chat-to" data-role="to"></div><div class="ch-chat-to" data-role="line"></div>' +
                '<div class="ch-chat-row"><textarea name="text" rows="1" maxlength="4000" placeholder="Escribe un mensaje…"></textarea>' +
                '<button type="button" class="ch-chat-send" data-action="send" title="Enviar" style="background:' + this.meta.color + '"><span class="fas fa-paper-plane"></span></button></div>' +
                '<div class="ch-chat-tools"><button type="button" class="btn btn-default btn-xs" data-action="myTpls"><span class="far fa-file-lines"></span> Mis plantillas</button> <button type="button" class="btn btn-default btn-xs" data-action="aiDraft"><span class="fas fa-wand-magic-sparkles"></span> Sugerir con IA</button>' +
                '<span class="ch-chat-counter"></span></div></div>';
            this.paintTo();
            setTimeout(() => { const t = this.el.querySelector('[name="text"]'); t && t.focus(); }, 100);
        }

        // A qué número va el mensaje: si el cliente tiene varios se elige aquí (por defecto, el último desde el que respondió)
        paintLine() {
            const box = this.el.querySelector('[data-role="line"]'), L = this.lines && this.lines[this.channel];
            if (!box) { return; }
            if (!L || !L.lines || L.lines.length < 2) { box.innerHTML = ''; return; }
            box.innerHTML = '<label>Enviar desde</label><select data-role="lineSel" class="form-control"><option value="">' + (this.channel === 'whatsapp' ? 'Automático (la línea por la que escribió el cliente)' : 'Automático (el proveedor principal)') + '</option>' +
                L.lines.map(x => `<option value="${ChUi.esc(x.id)}" ${x.id === this.lineId ? 'selected' : ''}>${ChUi.esc(x.name)} · ${ChUi.esc(x.type)}${x.id === L.default ? ' (principal)' : ''}</option>`).join('') + '</select>';
            box.querySelector('select').onchange = e => { this.lineId = e.target.value || null; };
        }

        paintTo() {
            this.paintLine();
            const to = this.el.querySelector('[data-role="to"]'), cur = this.phone || this.options.phone || '';
            const sub = this.el.querySelector('.ch-chat-title small'); if (sub && cur) { sub.textContent = cur + ' · ' + this.meta.title; }
            if (!to || this.channel === 'telegram') { return; }
            const list = this.phones || [];
            if (list.length > 1) {
                to.innerHTML = '<label>Enviar a</label><select data-role="phoneSel" class="form-control">' + list.map(x => `<option value="${ChUi.esc(x.phone)}" ${x.phone === cur ? 'selected' : ''}>${ChUi.esc(x.phone)}${x.type ? ' · ' + ChUi.esc(({Mobile: 'Móvil', Work: 'Trabajo', Home: 'Casa', Office: 'Oficina', Fax: 'Fax', Other: 'Otro'})[x.type] || x.type) : ''}${x.primary ? ' (principal)' : ''}</option>`).join('') + '</select>';
            } else { to.innerHTML = cur ? `<span class="ch-muted"><span class="fas fa-phone"></span> Se enviará a <b>${ChUi.esc(cur)}</b></span>` : ''; }
        }

        // Plantillas personales de este canal: se rellenan con el nombre del cliente, el asesor y la empresa; siguen siendo editables antes de enviar
        toggleTpls() {
            const tools = this.el.querySelector('.ch-chat-tools'), open = tools.querySelector('.ch-tpl-pop');
            if (open) { open.remove(); return; }
            Tpl.load().then(r => {
                const list = Tpl.forChannel(r, this.channel), pop = document.createElement('div'); pop.className = 'ch-tpl-pop';
                this.tplList = list;
                pop.innerHTML = list.map(t => `<a data-action="pickMine" data-id="${t.id}"><b>${ChUi.esc(t.name)}</b><span>${ChUi.esc(String(t.body).slice(0, 80))}</span></a>`).join('') ||
                    '<div class="ch-muted" style="padding:8px 10px">Aún no tienes plantillas de este canal. <a href="#CrmHub/plantillas">Crear una</a></div>';
                tools.appendChild(pop);
                const close = ev => { if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('click', close); } };
                setTimeout(() => document.addEventListener('click', close), 0);
            });
        }

        useTpl(id) {
            const t = (this.tplList || []).find(x => String(x.id) === String(id)); if (!t) { return; }
            const v = Tpl.ctx(this, this.options.name);
            const ta = this.el.querySelector('[name="text"]'); ta.value = Tpl.fill(t.body, v); this.autosize(); this.counter(); ta.focus();
            const pop = this.el.querySelector('.ch-tpl-pop'); if (pop) { pop.remove(); }
        }

        autosize() { const t = this.el.querySelector('[name="text"]'); t.style.height = 'auto'; t.style.height = Math.min(140, t.scrollHeight) + 'px'; }

        counter() {
            const c = this.el.querySelector('.ch-chat-counter'), v = this.el.querySelector('[name="text"]').value || '';
            if (this.channel !== 'sms') { c.textContent = ''; return; }
            const uni = /[^\u0000-\u007F¡¿áéíóúñÑüÜÁÉÍÓÚ€£¥èùìòÇØøÅåΔΦΓΛΩΠΨΣΘΞÆæßÉÄÖÜ§]/.test(v);
            const single = uni ? 70 : 160, multi = uni ? 67 : 153;
            const seg = v.length <= single ? (v.length ? 1 : 0) : Math.ceil(v.length / multi);
            c.textContent = v.length ? `${v.length} caracteres · ${seg} SMS${uni ? ' (caracteres especiales: caben menos)' : ''}` : '';
        }

        error(msg) { const e = this.el.querySelector('.ch-chat-err'); if (!e) { return; } e.hidden = !msg; e.textContent = msg || ''; }

        aiDraft() {
            this.error('');
            const b = this.el.querySelector('[data-action="aiDraft"]'); b.disabled = true;
            Espo.Ajax.postRequest(`Lead/${this.options.leadId}/ai/draft`, {}, {timeout: 300000})
                .then(r => { const t = this.el.querySelector('[name="text"]'); t.value = r.text || ''; this.autosize(); this.counter(); t.focus(); })
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } this.error('El asistente IA no está disponible ahora.'); })
                .then(() => { b.disabled = false; });
        }

        send() {
            const t = this.el.querySelector('[name="text"]'), text = (t.value || '').trim(), btn = this.el.querySelector('[data-action="send"]');
            if (!text || btn.disabled) { return; }
            this.error(''); btn.disabled = true;
            Espo.Ajax.postRequest('CrmHub/' + this.channel + '/send', {leadId: this.options.leadId, text, phone: this.channel === 'telegram' ? undefined : this.phone, lineId: this.channel === 'telegram' ? undefined : (this.lineId || undefined)}).then(() => {
                t.value = ''; this.autosize(); this.counter(); this.justSent = true; this.trigger('done');
                return this.load(true);
            }).catch(xhr => {
                const reason = xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason');
                this.error(reason || 'No se pudo enviar el mensaje. Revisa la configuración del canal en Integraciones.');
                if (xhr) { xhr.errorIsHandled = true; }
            }).then(() => { btn.disabled = false; t.focus(); });
        }
    };
});
