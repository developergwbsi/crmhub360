// Diálogos propios de Crm Hub 360 (confirmar, preguntar, cambio de estado) y formato de fechas. Nunca se usan los del navegador.
define('custom:ui', [], function () {
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const tz = {timeZone: undefined};
    const parse = s => { if (!s) { return null; } const d = new Date(String(s).replace(' ', 'T') + (String(s).length <= 19 ? 'Z' : '')); return isNaN(d) ? null : d; };
    const fmt = {
        time: s => { const d = parse(s); return d ? d.toLocaleTimeString('es-CO', {hour: '2-digit', minute: '2-digit', ...tz}) : ''; },
        dt: s => { const d = parse(s); return d ? d.toLocaleString('es-CO', {day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', ...tz}) : ''; },
        day: s => {
            const d = parse(s); if (!d) { return ''; }
            const t = new Date(), y = new Date(Date.now() - 864e5), same = (a, b) => a.toDateString() === b.toDateString();
            return same(d, t) ? 'Hoy' : same(d, y) ? 'Ayer' : d.toLocaleDateString('es-CO', {weekday: 'long', day: 'numeric', month: 'long', ...tz});
        },
        dayKey: s => { const d = parse(s); return d ? d.toDateString() : ''; },
        dur: sec => { sec = Math.max(0, parseInt(sec || 0, 10)); const m = Math.floor(sec / 60), r = sec % 60; return m + ':' + String(r).padStart(2, '0'); },
    };

    function open(build) {
        return new Promise(resolve => {
            const back = document.createElement('div');
            back.className = 'ch-dlg-back';
            const box = document.createElement('div');
            box.className = 'ch-dlg'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
            back.appendChild(box); document.body.appendChild(back);
            const prev = document.activeElement;
            const close = v => { document.removeEventListener('keydown', onKey, true); back.remove(); try { prev && prev.focus && prev.focus(); } catch (e) { /* nada */ } resolve(v); };
            const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(null); } };
            document.addEventListener('keydown', onKey, true);
            back.addEventListener('mousedown', e => { if (e.target === back) { close(null); } });
            build(box, close);
            requestAnimationFrame(() => back.classList.add('in'));
        });
    }

    function head(t, icon) { return `<div class="ch-dlg-head"><span class="ch-dlg-ic ${icon || 'fas fa-circle-question'}"></span><h4>${esc(t)}</h4></div>`; }

    const ChUi = {
        esc, fmt,
        // → true / false
        confirm(o) {
            return open((box, close) => {
                box.innerHTML = head(o.title || 'Confirmar', o.danger ? 'fas fa-triangle-exclamation ch-dlg-ic-danger' : 'fas fa-circle-question') +
                    `<div class="ch-dlg-body">${o.html || esc(o.text || '')}</div>` +
                    `<div class="ch-dlg-foot"><button type="button" class="btn btn-default" data-a="no">${esc(o.cancel || 'Cancelar')}</button>` +
                    `<button type="button" class="btn ${o.danger ? 'btn-danger' : 'btn-primary'}" data-a="yes">${esc(o.ok || 'Aceptar')}</button></div>`;
                box.querySelector('[data-a="no"]').onclick = () => close(false);
                const yes = box.querySelector('[data-a="yes"]'); yes.onclick = () => close(true); yes.focus();
            }).then(v => v === true);
        },
        // Aviso con un solo botón
        notice(o) {
            return open((box, close) => {
                box.innerHTML = head(o.title || 'Aviso', o.icon || 'fas fa-circle-info') + `<div class="ch-dlg-body">${o.html || esc(o.text || '')}</div>` +
                    `<div class="ch-dlg-foot"><button type="button" class="btn btn-primary" data-a="ok">${esc(o.ok || 'Entendido')}</button></div>`;
                const b = box.querySelector('[data-a="ok"]'); b.onclick = () => close(true); b.focus();
            }).then(() => true);
        },
        // → texto o null si se cancela
        prompt(o) {
            return open((box, close) => {
                box.innerHTML = head(o.title || 'Escribe', o.icon) + `<div class="ch-dlg-body">${o.text ? `<p>${o.html ? o.text : esc(o.text)}</p>` : ''}` +
                    `<label class="ch-dlg-label">${esc(o.label || '')}</label><textarea class="form-control" rows="${o.rows || 3}" maxlength="${o.max || 1000}" placeholder="${esc(o.placeholder || '')}"></textarea>` +
                    `<div class="ch-dlg-err" hidden></div>${o.hint ? `<div class="ch-dlg-hint">${esc(o.hint)}</div>` : ''}</div>` +
                    `<div class="ch-dlg-foot"><button type="button" class="btn btn-default" data-a="no">${esc(o.cancel || 'Cancelar')}</button><button type="button" class="btn btn-primary" data-a="yes">${esc(o.ok || 'Guardar')}</button></div>`;
                const ta = box.querySelector('textarea'), err = box.querySelector('.ch-dlg-err'), min = o.required ? (o.min || 3) : 0;
                const go = () => { const v = ta.value.trim(); if (v.length < min) { err.hidden = false; err.textContent = o.requiredText || `Escribe al menos ${min} caracteres.`; ta.focus(); return; } close(v); };
                box.querySelector('[data-a="no"]').onclick = () => close(null);
                box.querySelector('[data-a="yes"]').onclick = go;
                ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { go(); } });
                setTimeout(() => ta.focus(), 30);
            });
        },
        // Cambio de estado: pide comentario (obligatorio si no hubo una acción previa con el lead). → {comment} o null
        statusChange(o) {
            const act = o.action ? `<div class="ch-dlg-note ok"><span class="fas fa-circle-check"></span> Ya hay una acción registrada: <b>${esc(o.action.label)}</b> (${esc(fmt.dt(o.action.at))}). El comentario es opcional.</div>`
                : '<div class="ch-dlg-note warn"><span class="fas fa-circle-info"></span> Aún no hay una acción con este lead desde el último cambio de estado. Cuenta qué pasó (o llama / escribe antes).</div>';
            return ChUi.prompt({
                title: 'Cambiar estado', icon: 'fas fa-right-left', required: !o.action, min: 3, ok: 'Cambiar estado', rows: 3, max: 500, label: 'Comentario',
                placeholder: 'Ej.: Cliente confirmó interés, agendamos reunión para el jueves',
                html: true, text: `<span class="ch-st-move"><span class="ch-chip">${esc(o.from || '—')}</span> <span class="fas fa-arrow-right"></span> <span class="ch-chip ch-chip-main">${esc(o.to)}</span></span>${act}`,
                requiredText: 'El comentario es obligatorio para cambiar el estado (mínimo 3 caracteres).',
            }).then(v => (v === null ? null : {comment: v}));
        },
    };
    window.ChUi = ChUi;
    return ChUi;
});
