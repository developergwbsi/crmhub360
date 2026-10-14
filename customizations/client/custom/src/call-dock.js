/**
 * Videollamada dentro del CRM: la sala (https://meet.<dominio>/…) se abre en una ventana flotante fija a la pantalla, que NO se cierra al cambiar de ficha,
 * de lista o de página: el asesor conserva la información del cliente a la vista y puede seguir trabajando (otras fichas, otras actividades, otros clientes) sin colgar.
 * Modos: normal (esquina), ampliada, minimizada (barra con el nombre; el audio y el video siguen) y pestaña nueva. La página de la sala avisa al salir (postMessage).
 */
define('custom:call-dock', [], function () {
    let el = null, mode = 'mini', url = '', timer = null, t0 = 0;
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const roomOf = u => { try { return new URL(u).pathname; } catch (e) { return u; } };

    function setMode(m) { mode = m; if (el) { el.className = 'ch-dock ch-dock-' + m; const s = el.querySelector('[data-d=size]'); if (s) { s.title = m === 'big' ? 'Reducir' : 'Ampliar'; } } }

    function tick() {
        const tm = el && el.querySelector('[data-d=time]'); if (!tm) { return; }
        const sec = Math.floor((Date.now() - t0) / 1000); tm.textContent = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
    }

    function drag(h) {   // se mueve por la barra de título
        h.addEventListener('pointerdown', e => {
            if (e.target.closest('button') || mode === 'big' || window.innerWidth < 700) { return; }
            const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
            h.setPointerCapture(e.pointerId);
            const mv = ev => { el.style.left = Math.max(0, Math.min(window.innerWidth - 120, ev.clientX - dx)) + 'px'; el.style.top = Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - dy)) + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto'; };
            const up = () => { h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', up); };
            h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up);
        });
    }

    const API = {
        active: () => !!el,
        // entra a la sala dentro del CRM; si ya hay una videollamada abierta en otra sala, pregunta antes de cambiarla
        open(u, title) {
            if (el && roomOf(u) === roomOf(url)) { setMode(mode === 'pill' ? 'mini' : mode); return; }
            if (el && !window.confirm('Ya estás en una videollamada. ¿Salir de ella y entrar a esta?')) { return; }
            API.close();
            url = u; t0 = Date.now();
            el = document.createElement('div'); el.id = 'ch-dock';
            el.innerHTML = `<div class="ch-dock-h"><span class="fas fa-video"></span><b>${esc(title || 'Videollamada')}</b><small data-d="time">0:00</small><span style="flex:1"></span>` +
                '<button type="button" data-d="tab" title="Abrir en una pestaña nueva"><span class="fas fa-up-right-from-square"></span></button>' +
                '<button type="button" data-d="size" title="Ampliar"><span class="fas fa-expand"></span></button>' +
                '<button type="button" data-d="min" title="Minimizar (la llamada sigue)"><span class="fas fa-minus"></span></button>' +
                '<button type="button" data-d="end" title="Salir de la videollamada"><span class="fas fa-xmark"></span></button></div>' +
                `<iframe title="Videollamada" allow="camera; microphone; display-capture; autoplay; fullscreen; clipboard-write" src="${esc(u)}"></iframe>`;
            document.body.appendChild(el); setMode('mini'); drag(el.querySelector('.ch-dock-h'));
            el.addEventListener('click', e => {
                const b = e.target.closest('[data-d]'); if (!b) { if (mode === 'pill') { setMode('mini'); } return; }
                const k = b.dataset.d;
                if (k === 'end') { API.close(); }
                else if (k === 'min') { setMode(mode === 'pill' ? 'mini' : 'pill'); }
                else if (k === 'size') { setMode(mode === 'big' ? 'mini' : 'big'); }
                else if (k === 'tab') { window.open(url, '_blank', 'noopener'); API.close(); }
            });
            clearInterval(timer); timer = setInterval(tick, 1000);
        },
        close() { clearInterval(timer); if (el) { el.remove(); el = null; url = ''; } },
    };
    // la sala avisa cuando la persona sale de la videollamada: la ventana se cierra sola
    window.addEventListener('message', e => { if (el && e.data && e.data.k === 'ch-meet' && e.data.ev === 'left') { setTimeout(() => API.close(), 1200); } });
    window.ChCallDock = API;
    return API;
});
