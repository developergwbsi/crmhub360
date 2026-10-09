// Indicador global de lecturas de documentos: mientras una lectura sigue en el servidor (aunque hayas cerrado la ventana o cambiado de página) se ve abajo a la derecha;
// al terminar avisa y deja «Revisar» para abrir los datos y decidir cuáles guardar.
define('custom:doc-watch', ['custom:ui'], function (ChUi) {
    const esc = ChUi.esc;
    let box = null, timer = null, started = false, prev = {}, items = [];

    function ensureBox() {
        if (box && box.isConnected) { return box; }
        box = document.createElement('div'); box.id = 'ch-doc-watch'; document.body.appendChild(box);
        box.addEventListener('click', e => {
            const a = e.target.closest('[data-w]'); if (!a) { return; }
            const it = items.find(x => String(x.id) === a.dataset.id); if (!it) { return; }
            if (a.dataset.w === 'x') { Espo.Ajax.postRequest('CrmHub/docDismiss', {runId: it.id}).catch(() => {}).then(poll); return; }
            if (a.dataset.w === 'open') {
                try { sessionStorage.setItem('chDocReview', JSON.stringify({runId: it.id, leadId: it.lead_id})); } catch (x) { /* sin almacenamiento */ }
                if (location.hash === '#Lead/view/' + it.lead_id) { window.dispatchEvent(new CustomEvent('ch-doc-review')); } else { location.hash = '#Lead/view/' + it.lead_id; }
            }
        });
        return box;
    }

    function render() {
        const b = ensureBox();
        b.hidden = !items.length;
        const reading = items.filter(i => i.status === 'reading'), others = items.filter(i => i.status !== 'reading'), shown = reading.concat(others.slice(0, 3)), hidden = others.length - 3;
        b.innerHTML = shown.map(it => {
            const name = esc(it.lead_name || 'Lead');
            if (it.status === 'reading') { return `<div class="ch-dw ch-dw-run"><span class="ch-spin"></span><div><b>Leyendo documento…</b><small>${name}</small></div></div>`; }
            if (it.status === 'failed') { return `<div class="ch-dw ch-dw-err"><span class="fas fa-triangle-exclamation"></span><div><b>No se pudo leer el documento</b><small>${name}</small></div><a data-w="x" data-id="${it.id}" title="Descartar">×</a></div>`; }
            return `<div class="ch-dw ch-dw-ok"><span class="fas fa-circle-check"></span><div><b>Lectura lista</b><small>${name} · ${esc(it.profile_name || '')}</small></div><button class="btn btn-primary btn-xs" data-w="open" data-id="${it.id}">Revisar</button><a data-w="x" data-id="${it.id}" title="Descartar">×</a></div>`;
        }).join('') + (hidden > 0 ? `<div class="ch-dw ch-dw-more">y ${hidden} lectura(s) más listas · ábrelas desde el panel «Lectura de documentos» de cada lead</div>` : '');
    }

    function poll() {
        clearTimeout(timer);
        return Espo.Ajax.getRequest('CrmHub/docPending').then(r => {
            items = r.items || [];
            items.forEach(it => { if (it.status === 'read' && prev[it.id] === 'reading') { Espo.Ui.success('Lectura de documento lista: ' + (it.lead_name || 'lead')); } prev[it.id] = it.status; });
            render();
            if (items.some(i => i.status === 'reading')) { timer = setTimeout(poll, 3000); }
        }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } });
    }

    function init() {
        if (started) { return; }
        started = true;
        window.addEventListener('ch-doc-watch', () => setTimeout(poll, 400));
        poll();
    }
    return {init, poll};
});
