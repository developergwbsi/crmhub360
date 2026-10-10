// Historial de cambios de estado del lead: quién, cuándo y por qué.
define('custom:views/lead/panels/status-history', ['views/record/panels/bottom', 'custom:ui', 'custom:live-panel'], function (Dep, ChUi, Live) {
    const KIND = {comment: ['fa-comment-dots', 'Comentario'], action: ['fa-bolt', 'Acción previa'], auto: ['fa-robot', 'Automático']};
    return class extends Dep {
        templateContent = '<div class="ch-timeline" data-role="tl"><div class="ch-chat-empty">Cargando…</div></div>'

        afterRender() {
            super.afterRender();
            this.load();
            Live.attach(this, () => this.load(), 15000);
            if (!this._chSync) { this._chSync = true; this.listenTo(this.model, 'sync', () => setTimeout(() => this.load(), 600)); }
        }

        load() {
            Espo.Ajax.getRequest('CrmHub/leadTimeline', {leadId: this.model.id, kind: 'status'}).then(r => {
                const el = this.el.querySelector('[data-role="tl"]'); if (!el) { return; }
                const items = r.items || [];
                el.innerHTML = items.length ? items.map(i => {
                    const k = KIND[i.kind] || KIND.comment;
                    const text = i.kind === 'action' ? i.comment.replace(/^Acción previa:\s*/, '') : (i.kind === 'auto' ? 'Cambio automático del sistema' : i.comment);
                    return `<div class="ch-tl-item"><span class="ch-tl-dot ch-tl-${i.kind}"><span class="fas ${k[0]}"></span></span><div class="ch-tl-main">` +
                        `<div class="ch-tl-top"><span class="ch-chip">${ChUi.esc(i.from)}</span> <span class="fas fa-arrow-right"></span> <span class="ch-chip ch-chip-main">${ChUi.esc(i.to)}</span></div>` +
                        `<div class="ch-tl-text"><b>${k[1]}:</b> ${ChUi.esc(text)}</div><div class="ch-tl-meta">${ChUi.esc(i.who || 'Sistema')} · ${ChUi.esc(ChUi.fmt.dt(i.at))}</div></div></div>`;
                }).join('') : '<div class="ch-chat-empty"><span class="fas fa-timeline"></span><p>Aún no hay cambios de estado registrados.</p></div>';
            }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } });
        }
    };
});
