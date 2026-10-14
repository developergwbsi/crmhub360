/**
 * Videollamada dentro del CRM como panel lateral (igual que la ficha del lead): la sala (https://meet.<dominio>/…) se abre a la derecha, junto al tablero,
 * y NO se cierra al cambiar de ficha, de lista o de página: el asesor conserva la información del cliente y puede seguir trabajando sin colgar.
 * El asesor decide cómo verla: panel lateral, pantalla completa, minimizada (la llamada sigue en una barrita) o en una pestaña nueva; la X es la única que sale de la llamada.
 * Se acopla con custom:split (tipo 'call') para que el contenido deje su espacio. La sala avisa al salir (postMessage) y el panel se cierra.
 */
define('custom:call-dock', ['custom:split'], function (Split) {
    let el = null, mode = 'side', url = '', timer = null, t0 = 0, title = '', counted = false;
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const roomOf = u => { try { return new URL(u).pathname; } catch (e) { return u; } };

    function setMode(m) {
        mode = m; if (!el) { return; }
        el.className = 'ch-dock ch-dock-' + m;
        const side = m === 'side';
        if (side && !counted) { counted = true; Split.open('call'); } else if (!side && counted) { counted = false; Split.close('call'); }   // solo el panel lateral le quita ancho al contenido
        const sz = el.querySelector('[data-d=size]'); if (sz) { sz.title = m === 'full' ? 'Volver al panel lateral' : 'Pantalla completa'; sz.firstElementChild.className = m === 'full' ? 'fas fa-compress' : 'fas fa-expand'; }
        const mn = el.querySelector('[data-d=min]'); if (mn) { mn.title = m === 'pill' ? 'Restaurar' : 'Minimizar (la llamada sigue)'; }
    }

    function tick() {
        const sec = Math.floor((Date.now() - t0) / 1000), txt = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
        el && el.querySelectorAll('[data-d=time]').forEach(n => { n.textContent = txt; });
    }

    const API = {
        active: () => !!el,
        mode: () => mode,
        // entra a la sala dentro del CRM; si ya hay una videollamada abierta en otra sala, pregunta antes de cambiarla
        open(u, name) {
            if (el && roomOf(u) === roomOf(url)) { setMode('side'); return; }
            if (el && !window.confirm('Ya estás en una videollamada. ¿Salir de ella y entrar a esta?')) { return; }
            API.close();
            url = u; title = name || 'Videollamada'; t0 = Date.now();
            el = document.createElement('div'); el.id = 'ch-dock';
            el.innerHTML = `<div class="ch-dock-h"><span class="fas fa-video"></span><b>${esc(title)}</b><small data-d="time">0:00</small><span style="flex:1"></span>` +
                '<button type="button" data-d="tab" title="Abrir en una pestaña nueva"><span class="fas fa-up-right-from-square"></span></button>' +
                '<button type="button" data-d="min" title="Minimizar (la llamada sigue)"><span class="fas fa-minus"></span></button>' +
                '<button type="button" data-d="size" title="Pantalla completa"><span class="fas fa-expand"></span></button>' +
                '<button type="button" data-d="end" title="Salir de la videollamada"><span class="fas fa-xmark"></span></button></div>' +
                `<iframe title="Videollamada" allow="camera; microphone; display-capture; autoplay; fullscreen; clipboard-write" src="${esc(u)}"></iframe>` +
                `<div class="ch-dock-pill-bar"><span class="fas fa-video"></span><b>${esc(title)}</b><small data-d="time">0:00</small></div>`;
            document.body.appendChild(el); counted = false; setMode('side');
            el.addEventListener('click', e => {
                const b = e.target.closest('[data-d]');
                if (!b) { if (e.target.closest('.ch-dock-pill-bar')) { setMode('side'); } return; }
                const k = b.dataset.d;
                if (k === 'end') { if (window.confirm('¿Salir de la videollamada? Si el cliente sigue dentro, podrás volver a entrar desde la ficha («Videollamadas»).')) { API.close(); } }
                else if (k === 'min') { setMode(mode === 'pill' ? 'side' : 'pill'); }
                else if (k === 'size') { setMode(mode === 'full' ? 'side' : 'full'); }
                else if (k === 'tab') { window.open(url, '_blank', 'noopener'); API.close(); }
            });
            clearInterval(timer); timer = setInterval(tick, 1000);
        },
        close() {
            clearInterval(timer);
            if (counted) { counted = false; Split.close('call'); }
            if (el) { el.remove(); el = null; url = ''; }
        },
    };
    // la sala avisa cuando la persona sale de la videollamada: el panel se cierra solo
    window.addEventListener('message', e => { if (el && e.data && e.data.k === 'ch-meet' && e.data.ev === 'left') { setTimeout(() => API.close(), 1200); } });
    window.ChCallDock = API;
    return API;
});
