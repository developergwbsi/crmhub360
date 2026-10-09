// Historial de actividades completo: correos, llamadas, reuniones, tareas, WhatsApp, SMS, Telegram y cambios de estado, en una sola línea de tiempo.
define('custom:views/lead/panels/activity-history', ['views/record/panels/bottom', 'custom:ui', 'custom:handlers/lead-contact'], function (Dep, ChUi, ContactHandler) {
    const T = {
        email: ['fas fa-envelope', '#f59e0b', 'Correo'], call: ['fas fa-phone', '#2fa36b', 'Llamada'], meeting: ['fas fa-calendar-check', '#8b5cf6', 'Reunión'], task: ['fas fa-list-check', '#64748b', 'Tarea'],
        whatsapp: ['fab fa-whatsapp', '#25d366', 'WhatsApp'], sms: ['fas fa-comment-sms', '#0ea5e9', 'SMS'], telegram: ['fab fa-telegram', '#229ed9', 'Telegram'], status: ['fas fa-right-left', '#4f63e8', 'Estado'], process: ['fas fa-gears', '#0d9488', 'Proceso'],
    };
    return class extends Dep {
        templateContent = '<div class="ch-ah"><div class="ch-ah-f" data-role="f"></div><div class="ch-ah-l" data-role="l"><div class="ch-chat-empty">Cargando…</div></div></div>'
        items = []
        filter = 'all'

        afterRender() {
            super.afterRender();
            this.load();
            if (!this._chSync) { this._chSync = true; this.listenTo(this.model, 'sync', () => setTimeout(() => this.load(), 700)); }
            this.el.onclick = e => {
                const f = e.target.closest('[data-f]'); if (f) { this.filter = f.dataset.f; this.paint(); return; }
                const r = e.target.closest('[data-i]'); if (!r) { return; }
                const it = this.items[+r.dataset.i];
                if (!it) { return; }
                if (it.href) { this.getRouter().navigate(it.href, {trigger: true}); return; }
                const fn = {whatsapp: 'actionWhatsapp', sms: 'actionSms', telegram: 'actionTelegram'}[it.type];
                if (fn) { const v = this.getParentView(); if (v) { new ContactHandler(v)[fn](); } }
            };
        }

        load() {
            Espo.Ajax.getRequest('CrmHub/leadTimeline', {leadId: this.model.id, scope: this.model.entityType, kind: 'all'}).then(r => { this.items = r.items || []; this.paint(); })
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } });
        }

        paint() {
            const l = this.el.querySelector('[data-role="l"]'), f = this.el.querySelector('[data-role="f"]'); if (!l) { return; }
            const counts = {}; this.items.forEach(i => { counts[i.type] = (counts[i.type] || 0) + 1; });
            f.innerHTML = `<a class="ch-ah-chip ${this.filter === 'all' ? 'on' : ''}" data-f="all">Todo <small>${this.items.length}</small></a>` +
                Object.keys(T).filter(k => counts[k]).map(k => `<a class="ch-ah-chip ${this.filter === k ? 'on' : ''}" data-f="${k}"><span class="${T[k][0]}" style="color:${this.filter === k ? '#fff' : T[k][1]}"></span> ${T[k][2]} <small>${counts[k]}</small></a>`).join('');
            const show = this.items.map((it, i) => [it, i]).filter(([it]) => this.filter === 'all' || it.type === this.filter);
            l.innerHTML = show.length ? show.map(([it, i]) => {
                const t = T[it.type] || T.task, arrow = it.type === 'status' ? '' : (it.dir === 'in' ? '<span class="fas fa-arrow-down ch-ah-in" title="Recibido"></span>' : '<span class="fas fa-arrow-up ch-ah-out" title="Enviado"></span>');
                const main = it.title ? `<b>${ChUi.esc(it.title)}</b>${it.text ? ' · ' + ChUi.esc(it.text) : ''}` : ChUi.esc(it.text);
                return `<div class="ch-ah-row ${it.href || ['whatsapp', 'sms', 'telegram'].includes(it.type) ? 'click' : ''}" data-i="${i}"><span class="ch-ah-ic" style="background:${t[1]}"><span class="${t[0]}"></span></span>` +
                    `<div class="ch-ah-b"><div class="ch-ah-t">${arrow} <span class="ch-ah-k">${t[2]}</span> ${main}</div><div class="ch-tl-meta">${ChUi.esc(it.who || '')}${it.who ? ' · ' : ''}${ChUi.esc(ChUi.fmt.dt(it.at))}</div></div></div>`;
            }).join('') : '<div class="ch-chat-empty"><span class="fas fa-timeline"></span><p>Aún no hay actividad registrada.</p></div>';
        }
    };
});
