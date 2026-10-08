// Encabezado visual del lead (avatar, estado, contacto y cifras clave). Lo usan la vista completa y el panel lateral.
define('custom:lead-hero', [], function () {
    const COLORS = ['#4f63e8', '#8b5cf6', '#0ea5e9', '#2fa36b', '#f59e0b', '#ef5b5b', '#14b8a6', '#d4729b'];
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const money = n => (n === null || n === undefined || n === '') ? '—' : new Intl.NumberFormat('es-CO', {style: 'currency', currency: 'COP', maximumFractionDigits: 0}).format(n);
    const QUAL = {'Califica': 'ok', 'No califica': 'bad', 'Revisión Manual': 'warn'};

    // Correo: remitente como avatar, asunto como título y de/para/fecha como resumen
    function emailHtml(view) {
        const a = view.model.attributes, lang = view.getLanguage();
        const sender = (a.fromName || a.fromString || a.from || '?').replace(/<.*>/, '').trim() || a.from || '?';
        const initials = sender.split(/\s+/).slice(0, 2).map(w => (w[0] || '')).join('').toUpperCase() || '?';
        let h = 0; String(a.from || sender).split('').forEach(c => { h = (h * 31 + c.charCodeAt(0)) >>> 0; });
        const chips = [];
        if (a.status) { chips.push(`<span class="ch-chip ch-chip-main">${esc(lang.translateOption(a.status, 'status', 'Email'))}</span>`); }
        if (a.isRead === false) { chips.push('<span class="ch-chip ch-chip-warn">Sin leer</span>'); }
        if (a.isImportant) { chips.push('<span class="ch-chip ch-chip-bad"><span class="fas fa-star"></span> Importante</span>'); }
        if (a.parentName) { chips.push(`<span class="ch-chip"><span class="fas fa-link"></span> ${esc(a.parentName)}</span>`); }
        const meta = [];
        if (a.from) { meta.push(`<span><span class="fas fa-paper-plane"></span>De: ${esc(a.from)}</span>`); }
        if (a.to) { meta.push(`<span><span class="fas fa-inbox"></span>Para: ${esc(String(a.to).split(';').join(', '))}</span>`); }
        if (a.dateSent) { meta.push(`<span><span class="far fa-clock"></span>${esc(a.dateSent)}</span>`); }
        const avatar = `<span class="ch-avatar ch-avatar-lg" style="background:${COLORS[h % COLORS.length]}"><span class="ch-initials">${esc(initials)}</span></span>`;
        return `${avatar}<div class="ch-lh-main"><div class="ch-lh-name">${esc(a.name || '(sin asunto)')}</div><div class="ch-lh-chips">${chips.join('')}</div><div class="ch-lh-meta">${meta.join('')}</div></div>`;
    }

    function html(view) {
        if ((view.model.entityType || '') === 'Email') { return emailHtml(view); }
        const a = view.model.attributes, lang = view.getLanguage(), scope = view.model.entityType || 'Lead';
        const first = (a.firstName || '').trim(), last = (a.lastName || '').trim();
        const initials = ((first[0] || '') + (last[0] || (first ? '' : (a.name || '?')[0]))).toUpperCase() || '?';
        let h = 0;
        String(view.model.id || '').split('').forEach(c => { h = (h * 31 + c.charCodeAt(0)) >>> 0; });
        const tr = (field, v) => esc(lang.translateOption(v, field, scope));
        const chips = [];
        const stage = a.status || a.stage;
        if (stage) { chips.push(`<span class="ch-chip ch-chip-main">${tr(a.status ? 'status' : 'stage', stage)}</span>`); }
        if (a.qualificationStatus) { chips.push(`<span class="ch-chip ch-chip-${QUAL[a.qualificationStatus] || 'info'}">${tr('qualificationStatus', a.qualificationStatus)}</span>`); }
        if (a.type) { chips.push(`<span class="ch-chip">${tr('type', a.type)}</span>`); }
        if (a.source || a.leadSource) { chips.push(`<span class="ch-chip">${tr(a.source ? 'source' : 'leadSource', a.source || a.leadSource)}</span>`); }
        if (a.doNotContact) { chips.push('<span class="ch-chip ch-chip-bad"><span class="fas fa-ban"></span> No contactar</span>'); }
        const meta = [];
        if (a.phoneNumber) { meta.push(`<span><span class="fas fa-phone"></span>${esc(a.phoneNumber)}</span>`); }
        if (a.emailAddress) { meta.push(`<span><span class="fas fa-envelope"></span>${esc(a.emailAddress)}</span>`); }
        if (a.accountName && scope !== 'Account') { meta.push(`<span><span class="fas fa-building"></span>${esc(a.accountName)}</span>`); }
        if (a.assignedUserName) { meta.push(`<span><span class="fas fa-user-tie"></span>${esc(a.assignedUserName)}</span>`); }
        if (a.suggestedService) { meta.push(`<span><span class="fas fa-tag"></span>${esc(a.suggestedService)}</span>`); }
        const kpi = (label, value) => `<div class="ch-lh-kpi"><span>${label}</span><b>${value}</b></div>`;
        let kpis = '';
        if (scope === 'Opportunity') {
            kpis = kpi('Monto', money(a.amount)) + kpi('Cierre', a.closeDate ? esc(a.closeDate) : '—') + kpi('Probabilidad', a.probability != null ? esc(a.probability) + '%' : '—');
        } else if (view.getConfig().get('crmhubCartera') && (a.totalDebt || a.overdueDebt || a.creditScore || a.monthlyIncome)) {
            kpis = kpi('Deuda total', money(a.totalDebt)) + kpi('En mora', money(a.overdueDebt)) + kpi('Ingresos', money(a.monthlyIncome)) + kpi('Puntaje', a.creditScore != null ? esc(a.creditScore) : '—');
        }
        const avatar = `<span class="ch-avatar ch-avatar-lg" style="background:${COLORS[h % COLORS.length]}"><span class="ch-initials">${esc(initials)}</span>` +
            (a.avatarUrl ? `<img src="${esc(a.avatarUrl)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : '') + '</span>';
        return `${avatar}<div class="ch-lh-main"><div class="ch-lh-name">${esc(a.name || '')}</div><div class="ch-lh-chips">${chips.join('')}</div>` +
            `<div class="ch-lh-meta">${meta.join('')}</div></div>${kpis ? `<div class="ch-lh-kpis">${kpis}</div>` : ''}`;
    }

    // Inserta (o refresca) el encabezado al inicio del registro y lo mantiene al día cuando el modelo cambia.
    function mount(view) {
        const paint = () => {
            if (!view.model.get('name') && !view.model.id) { return; }
            let el = view.el.querySelector(':scope > .ch-lead-hero');
            if (!el) {
                el = document.createElement('div');
                el.className = 'ch-lead-hero';
                view.el.insertBefore(el, view.el.firstChild);
            }
            el.innerHTML = html(view);
            // dentro del panel lateral el que se desplaza es el cuerpo del modal
            const body = view.el.closest('.modal-body');
            if (body && !el._chScroll) {
                el._chScroll = true; el.classList.add('ch-in-modal');
                body.addEventListener('scroll', () => el.classList.toggle('ch-compact', body.scrollTop > 40), {passive: true});
            }
        };
        paint();
        if (!view._chHero) {
            view._chHero = true;
            view.listenTo(view.model, 'sync change:status change:stage change:qualificationStatus change:assignedUserName change:phoneNumber', paint);
        }
    }

    return {html, mount};
});
