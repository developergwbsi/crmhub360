/**
 * Elegir con clics los datos de una página web: muestra la página (sin scripts) dentro del CRM, el usuario pasa el cursor y pulsa el dato que quiere,
 * le pone nombre (y, si hay campos, elige dónde se guarda) y se agrega como regla {label, mode:'selector', expr, to}. El Hub calcula el selector.
 * open({url, rules, fields?, onUrl?}) → promesa que se resuelve al cerrar. Endpoints: POST CrmHub/iformWebPreview y POST CrmHub/iformWebPick.
 */
define('custom:web-picker', ['custom:ui'], function (ChUi) {
    const esc = v => ChUi.esc(v == null ? '' : v);

    function open(o) {
        const rules = o.rules, keys = o.fields || [], start = String(o.url || '').replace(/\{\{\s*\w+\s*\}\}/g, '');
        return ChUi.panel({title: 'Elegir datos de la página', icon: 'fas fa-hand-pointer', close: 'Listo', mount: body => {
            const box = body.closest('.ch-dlg'); if (box) { box.classList.add('ch-wide'); }
            body.innerHTML = `<div class="ch-wp"><div class="ch-wp-bar"><input class="form-control input-sm" data-u value="${esc(start)}" placeholder="Dirección de la página (con un ejemplo real en lugar de las variables)"><button class="btn btn-primary btn-sm" data-load><span class="fas fa-eye"></span> Cargar página</button></div>
                <div class="ch-muted ch-wp-msg" data-msg>Escribe la dirección y pulsa «Cargar página». Luego pulsa sobre el dato que quieras traer.</div>
                <div class="ch-wp-main"><iframe class="ch-wp-frame" sandbox="allow-same-origin" title="Vista previa"></iframe>
                <div class="ch-wp-side"><div data-cand class="ch-muted">Aquí aparece el dato que elijas.</div><div class="ch-wp-added" data-added></div></div></div></div>`;
            const q = s2 => body.querySelector(s2), frame = q('iframe'), msg = q('[data-msg]'), cand = q('[data-cand]'), added = q('[data-added]');
            let pid = '';
            const drawAdded = () => { added.innerHTML = rules.length ? '<h5>Datos agregados</h5>' + rules.map(r => `<div class="ch-wp-it"><span class="fas fa-check" style="color:#2fa36b"></span> <b>${esc(r.label)}</b><small>${esc(r.expr)}</small></div>`).join('') : ''; };
            drawAdded();
            const showCand = (r, idx, parentIdx) => {
                cand.innerHTML = `<div class="ch-wp-c"><div class="ch-muted">Dato elegido</div><div class="ch-wp-txt">${esc(r.text) || '<i>(sin texto)</i>'}</div><code>${esc(r.selector)}</code>
                    <input class="form-control input-sm" data-lb placeholder="Qué dato es (ej.: Estado, Saldo)" value="">
                    ${keys.length ? `<select class="form-control input-sm" data-to><option value="">No guardar en un campo</option>${keys.map(k => `<option value="${esc(k.key)}">${esc(k.label)}</option>`).join('')}</select>` : ''}
                    <div class="ch-ifb-row">${parentIdx != null ? '<button class="btn btn-default btn-xs" data-up title="Seleccionar el bloque que lo contiene"><span class="fas fa-arrow-up"></span> Bloque que lo contiene</button>' : ''}<button class="btn btn-primary btn-xs" data-add><span class="fas fa-plus"></span> Agregar dato</button></div></div>`;
                const up = cand.querySelector('[data-up]'); if (up) { up.onclick = () => choose(parentIdx); }
                cand.querySelector('[data-add]').onclick = () => {
                    const lb = cand.querySelector('[data-lb]').value.trim() || r.text.slice(0, 30) || 'Dato', to = cand.querySelector('[data-to]');
                    rules.push({label: lb, mode: 'selector', expr: r.selector, to: to ? to.value : ''});
                    cand.innerHTML = '<div class="ch-muted">Agregado. Pulsa otro dato de la página si quieres traer más.</div>'; drawAdded();
                };
            };
            const choose = idx => {
                cand.innerHTML = '<div class="ch-muted">Calculando…</div>';
                Espo.Ajax.postRequest('CrmHub/iformWebPick', {previewId: pid, idx}).then(r => {
                    const d = frame.contentDocument, el = d && d.querySelector(`[data-chi="${idx}"]`), par = el && el.parentElement && el.parentElement.getAttribute('data-chi');
                    if (d) { d.querySelectorAll('.ch-picked').forEach(x => x.classList.remove('ch-picked')); if (el) { el.classList.add('ch-picked'); } }
                    showCand(r, idx, par != null && par !== '' && el.parentElement.tagName !== 'HTML' ? +par : null);
                }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } cand.innerHTML = '<div class="ch-chat-err">No se pudo calcular el selector. Vuelve a cargar la página.</div>'; });
            };
            frame.onload = () => {
                const d = frame.contentDocument; if (!d || !pid) { return; }
                const st = d.createElement('style'); st.textContent = '.ch-hov{outline:2px solid #3a52e0 !important;background:rgba(58,82,224,.12) !important;cursor:pointer !important}.ch-picked{outline:3px solid #2fa36b !important;background:rgba(47,163,107,.18) !important}'; d.head.appendChild(st);
                let last = null;
                d.addEventListener('mouseover', e => { if (last) { last.classList.remove('ch-hov'); } last = e.target; if (last.setAttribute) { last.classList.add('ch-hov'); } });
                d.addEventListener('mouseout', e => { if (e.target.classList) { e.target.classList.remove('ch-hov'); } });
                d.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); let t = e.target; while (t && t.getAttribute && !t.hasAttribute('data-chi')) { t = t.parentElement; } if (t && t.getAttribute) { choose(+t.getAttribute('data-chi')); } }, true);
            };
            q('[data-load]').onclick = () => {
                const url = q('[data-u]').value.trim(); if (!/^https?:\/\//i.test(url)) { msg.textContent = 'La dirección debe empezar por http:// o https://'; return; }
                msg.textContent = 'Cargando la página…'; pid = '';
                Espo.Ajax.postRequest('CrmHub/iformWebPreview', {url}).then(r => {
                    pid = r.previewId; msg.innerHTML = r.warning ? `<span style="color:#b45309">${esc(r.warning)}</span>` : 'Pulsa sobre el dato que quieras traer: se resalta al pasar el cursor.';
                    if (o.onUrl) { o.onUrl(url); }
                    frame.srcdoc = r.html;
                }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } msg.innerHTML = '<span style="color:#d64545">' + esc((xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason')) || 'No se pudo cargar la página.') + '</span>'; });
            };
            if (/^https?:\/\/\S+$/.test(start)) { q('[data-load]').click(); }
        }});
    }

    return {open};
});
