// Conversación con el lead por WhatsApp, Telegram o SMS, con aspecto de app de mensajería.
define('custom:views/modals/whatsapp', ['views/modal', 'custom:ui', 'custom:split'], function (Dep, ChUi, Split) {
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
            root.innerHTML = '<div class="ch-chat-thread" tabindex="0" aria-live="polite"><div class="ch-chat-empty">Cargando conversación…</div></div>' +
                '<div class="ch-chat-composer"><div class="ch-chat-err" hidden></div>' +
                '<div class="ch-chat-row"><textarea name="text" rows="1" maxlength="4000" placeholder="Escribe un mensaje…"></textarea>' +
                '<button type="button" class="ch-chat-send" data-action="send" title="Enviar" style="background:' + this.meta.color + '"><span class="fas fa-paper-plane"></span></button></div>' +
                '<div class="ch-chat-tools"><button type="button" class="btn btn-default btn-xs" data-action="aiDraft"><span class="fas fa-wand-magic-sparkles"></span> Sugerir con IA</button>' +
                '<span class="ch-chat-counter"></span></div></div>';
            this.load(true);
            this.timer = setInterval(() => this.load(false), 6000);
            setTimeout(() => { const t = this.el.querySelector('[name="text"]'); t && t.focus(); }, 150);
        }

        onRemove() { clearInterval(this.timer); if (this._chSplit) { this._chSplit = false; Split.close('ch'); } }

        load(first) {
            return Espo.Ajax.getRequest('CrmHub/leadTimeline', {leadId: this.options.leadId, kind: 'chat', channel: this.channel}).then(r => {
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

        autosize() { const t = this.el.querySelector('[name="text"]'); t.style.height = 'auto'; t.style.height = Math.min(140, t.scrollHeight) + 'px'; }

        counter() {
            const c = this.el.querySelector('.ch-chat-counter'), v = this.el.querySelector('[name="text"]').value || '';
            if (this.channel !== 'sms') { c.textContent = ''; return; }
            const uni = /[^\u0000-\u007F¡¿áéíóúñÑüÜÁÉÍÓÚ€£¥èùìòÇØøÅåΔΦΓΛΩΠΨΣΘΞÆæßÉÄÖÜ§]/.test(v);
            const single = uni ? 70 : 160, multi = uni ? 67 : 153;
            const seg = v.length <= single ? (v.length ? 1 : 0) : Math.ceil(v.length / multi);
            c.textContent = v.length ? `${v.length} caracteres · ${seg} SMS${uni ? ' (caracteres especiales: caben menos)' : ''}` : '';
        }

        error(msg) { const e = this.el.querySelector('.ch-chat-err'); e.hidden = !msg; e.textContent = msg || ''; }

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
            Espo.Ajax.postRequest('CrmHub/' + this.channel + '/send', {leadId: this.options.leadId, text}).then(() => {
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
