/**
 * Diálogos propios de Crm Hub 360 (confirmar, preguntar, panel, aviso, cambio de estado) y formato de fechas. Nunca se usan los del navegador.
 * Módulo de utilidades sin endpoints: lo usan casi todas las vistas (esc para escapar HTML, fmt para fechas en es-CO).
 * Cada diálogo devuelve una promesa; Esc o clic fuera cierran con null.
 */
define('custom:ui', [], function () {
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const tz = {timeZone: undefined};
    const parse = s => { if (!s) { return null; } const d = new Date(String(s).replace(' ', 'T') + (String(s).length <= 19 ? 'Z' : '')); return isNaN(d) ? null : d; };

    // ---- enlaces y vistas previas: todo texto con una dirección se muestra con hipervínculo; imágenes, videos, audios y archivos, con su vista previa
    const LINK_RE = /((?:https?:\/\/|www\.)[^\s<>"'`]+)|([A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/gi;
    const IMG_EXT = /\.(jpe?g|png|gif|webp|bmp|avif)$/i, VID_EXT = /\.(mp4|webm|mov|m4v)$/i, AUD_EXT = /\.(mp3|ogg|oga|wav|m4a|opus|aac)$/i;
    const FILE_EXT = {pdf: ['far fa-file-pdf', '#e5484d'], doc: ['far fa-file-word', '#2b6cb0'], docx: ['far fa-file-word', '#2b6cb0'], xls: ['far fa-file-excel', '#1f9d55'], xlsx: ['far fa-file-excel', '#1f9d55'], csv: ['far fa-file-excel', '#1f9d55'],
        ppt: ['far fa-file-powerpoint', '#d9622b'], pptx: ['far fa-file-powerpoint', '#d9622b'], zip: ['far fa-file-zipper', '#8a6d3b'], rar: ['far fa-file-zipper', '#8a6d3b'], txt: ['far fa-file-lines', '#5d6678']};
    // separa la puntuación final que no es parte de la dirección («mira www.x.com.», «(https://x.com)»)
    const cut = raw => {
        let u = raw, tail = '';
        while (u && /[.,;:!?)\]}'"»…]$/.test(u)) {
            if (u.endsWith(')') && (u.match(/\(/g) || []).length >= (u.match(/\)/g) || []).length) { break; }
            tail = u.slice(-1) + tail; u = u.slice(0, -1);
        }
        return [u, tail];
    };
    const hrefOf = u => (/^https?:\/\//i.test(u) ? u : 'https://' + u);
    // texto plano → HTML seguro con enlaces (solo http, https y mailto)
    function linkify(text) {
        const t = String(text == null ? '' : text); let out = '', last = 0, m;
        LINK_RE.lastIndex = 0;
        while ((m = LINK_RE.exec(t))) {
            out += esc(t.slice(last, m.index)); last = m.index + m[0].length;
            if (m[1]) { const [u, tail] = cut(m[1]); out += `<a class="ch-link" href="${esc(hrefOf(u))}" target="_blank" rel="noopener noreferrer nofollow">${esc(u)}</a>${esc(tail)}`; }
            else { out += `<a class="ch-link" href="mailto:${esc(m[2])}">${esc(m[2])}</a>`; }
        }
        return out + esc(t.slice(last));
    }
    const urlsOf = text => { const r = []; String(text || '').replace(LINK_RE, (a, u) => { if (u) { r.push(hrefOf(cut(u)[0])); } return a; }); return [...new Set(r)].slice(0, 4); };
    const nameOf = u => { try { return decodeURIComponent(new URL(u).pathname.split('/').pop() || new URL(u).hostname); } catch (e) { return u; } };
    // vistas previas de las direcciones del texto: imagen, video, audio, archivo (con icono y nombre) y salas de videollamada
    function previews(text) {
        return urlsOf(text).map(u => {
            let path = '', host = ''; try { const x = new URL(u); path = x.pathname; host = x.hostname; } catch (e) { return ''; }
            const a = esc(u);
            if (IMG_EXT.test(path)) { return `<a class="ch-prev ch-prev-img" href="${a}" target="_blank" rel="noopener noreferrer"><img src="${a}" alt="${esc(nameOf(u))}" loading="lazy" referrerpolicy="no-referrer"></a>`; }
            if (VID_EXT.test(path)) { return `<video class="ch-prev ch-prev-vid" src="${a}" controls preload="metadata" playsinline></video>`; }
            if (AUD_EXT.test(path)) { return `<audio class="ch-prev ch-prev-aud" src="${a}" controls preload="none"></audio>`; }
            const ext = (path.split('.').pop() || '').toLowerCase();
            if (FILE_EXT[ext]) { const f = FILE_EXT[ext]; return `<a class="ch-prev ch-prev-file" href="${a}" target="_blank" rel="noopener noreferrer"><span class="${f[0]}" style="color:${f[1]}"></span><span class="ch-pf-n">${esc(nameOf(u))}</span><small>${esc(ext.toUpperCase())} · abrir</small></a>`; }
            if (/^meet\./i.test(host)) { return `<a class="ch-prev ch-prev-file" href="${a}" target="_blank" rel="noopener noreferrer"><span class="fas fa-video" style="color:#4f6bff"></span><span class="ch-pf-n">Videollamada</span><small>Unirse a la sala</small></a>`; }
            return '';
        }).join('');
    }
    // HTML de un correo: convierte en enlace las direcciones sueltas (las que ya son enlace no se tocan)
    function linkifyHtml(html) {
        try {
            const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
            const w = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT), nodes = [];
            while (w.nextNode()) { const n = w.currentNode; if (!n.parentElement.closest('a, script, style, textarea') && /(https?:\/\/|www\.|@)/i.test(n.nodeValue)) { nodes.push(n); } }
            nodes.forEach(n => { const sp = doc.createElement('span'); sp.innerHTML = linkify(n.nodeValue); n.replaceWith(...sp.childNodes); });
            return doc.body.innerHTML;
        } catch (e) { return html; }
    }
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

    // Base de todos los diálogos: crea el fondo y la caja, atrapa el foco y resuelve la promesa al cerrar
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
        esc, fmt, linkify, previews, linkifyHtml,
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
        // Diálogo con contenido propio: mount(cuerpo, cerrar) lo llena; devuelve una promesa que se resuelve al cerrarse
        panel(o) {
            return open((box, close) => {
                box.innerHTML = head(o.title || '', o.icon) + `<div class="ch-dlg-body" data-role="body"></div><div class="ch-dlg-foot"><button type="button" class="btn btn-default" data-a="ok">${esc(o.close || 'Cerrar')}</button></div>`;
                box.querySelector('[data-a="ok"]').onclick = () => close(true);
                o.mount(box.querySelector('[data-role="body"]'), close);
            });
        },
        // Estado vacío con ilustración: ChUi.empty({kind, title, text, compact})
        empty(o) { return window.ChEmpty ? window.ChEmpty.html(o) : `<div class="ch-muted">${esc((o && o.title) || '')}</div>`; },
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
        // Diálogo de cambio de estado: pide el comentario obligatorio y, si hay, muestra la acción previa
        statusChange(o) {
            const lbl = v => ({Dead: 'Perdido', Converted: 'Convertido'}[v] || v);   // estados de fábrica de Espo que se muestran en español
            const act = o.action ? `<div class="ch-dlg-note ok"><span class="fas fa-circle-check"></span> Ya hay una acción registrada: <b>${esc(o.action.label)}</b> (${esc(fmt.dt(o.action.at))}). El comentario es opcional.</div>`
                : '<div class="ch-dlg-note warn"><span class="fas fa-circle-info"></span> Aún no hay una acción con este lead desde el último cambio de estado. Cuenta qué pasó (o llama / escribe antes).</div>';
            return ChUi.prompt({
                title: 'Cambiar estado', icon: 'fas fa-right-left', required: !o.action, min: 3, ok: 'Cambiar estado', rows: 3, max: 500, label: 'Comentario',
                placeholder: 'Ej.: Cliente confirmó interés, agendamos reunión para el jueves',
                html: true, text: `<span class="ch-st-move"><span class="ch-chip">${esc(lbl(o.from) || '—')}</span> <span class="fas fa-arrow-right"></span> <span class="ch-chip ch-chip-main">${esc(lbl(o.to))}</span></span>${act}`,
                requiredText: 'El comentario es obligatorio para cambiar el estado (mínimo 3 caracteres).',
            }).then(v => (v === null ? null : {comment: v}));
        },
    };
    window.ChUi = ChUi;
    return ChUi;
});
