/**
 * Pantalla de carga general de Crm Hub 360. Es lo primero que se pinta (se registra de primero en client.json → scriptList): cubre toda la pantalla mientras arranca la plataforma
 * y, al navegar a otra página, cubre el área de contenido mientras carga. Se quita sola cuando la página terminó de dibujarse y no quedan peticiones en curso (con un tope de tiempo).
 * No depende de hojas de estilo ni de Espo: lleva su propio CSS y respeta el modo claro/oscuro guardado.
 */
(function () {
    'use strict';
    var root = document.documentElement, shown = null, lastMut = Date.now(), timer = null, el = null;

    function dark() {
        var p = null; try { p = localStorage.getItem('crmhub-theme'); } catch (e) { /* privado */ }
        if (p === 'light' || p === 'dark') { return p === 'dark'; }
        return !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    }
    function name() { var n = ''; try { n = localStorage.getItem('ch-app-name') || ''; } catch (e) { /* privado */ } return n || (document.title && document.title !== 'EspoCRM' ? document.title : ''); }
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }

    var css = '#ch-preload{position:fixed;z-index:2147483000;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:18px;opacity:1;transition:opacity .28s ease;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}' +
        '#ch-preload.full{inset:0;background:var(--pl-bg)}#ch-preload.part{background:var(--pl-bg2);backdrop-filter:blur(2px)}#ch-preload.out{opacity:0;pointer-events:none}' +
        '#ch-preload{--pl-bg:#f4f6fb;--pl-bg2:rgba(244,246,251,.93);--pl-ink:#1b2030;--pl-mut:#7b8499;--pl-pri:#4f63e8;--pl-trk:rgba(79,99,232,.16)}' +
        '#ch-preload.dk{--pl-bg:#0f1420;--pl-bg2:rgba(15,20,32,.93);--pl-ink:#e8ecf5;--pl-mut:#8a93a8;--pl-pri:#7c8cff;--pl-trk:rgba(124,140,255,.2)}' +
        '#ch-preload .pl-mark{position:relative;width:72px;height:72px;display:flex;align-items:center;justify-content:center}' +
        '#ch-preload .pl-ring{position:absolute;inset:0;border-radius:50%;border:4px solid var(--pl-trk);border-top-color:var(--pl-pri);animation:chpl-spin .9s linear infinite}' +
        '#ch-preload .pl-logo{width:40px;height:40px;border-radius:12px;background:var(--pl-pri);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;letter-spacing:-.5px;animation:chpl-pulse 1.6s ease-in-out infinite}' +
        '#ch-preload .pl-name{font-size:17px;font-weight:700;color:var(--pl-ink);text-align:center;max-width:80vw}#ch-preload .pl-sub{font-size:13px;color:var(--pl-mut);margin-top:-12px}' +
        '#ch-preload.part .pl-name,#ch-preload.part .pl-sub{display:none}#ch-preload.part .pl-mark{width:56px;height:56px}#ch-preload.part .pl-logo{width:30px;height:30px;font-size:14px;border-radius:9px}' +
        '@keyframes chpl-spin{to{transform:rotate(360deg)}}@keyframes chpl-pulse{50%{transform:scale(.9);opacity:.85}}@media (prefers-reduced-motion:reduce){#ch-preload .pl-ring,#ch-preload .pl-logo{animation-duration:3s}}';

    function ensure() {
        if (!document.getElementById('ch-preload-css')) { var st = document.createElement('style'); st.id = 'ch-preload-css'; st.textContent = css; (document.head || root).appendChild(st); }
        if (!el) {
            el = document.createElement('div'); el.id = 'ch-preload'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
            el.innerHTML = '<div class="pl-mark"><span class="pl-ring"></span><span class="pl-logo">C</span></div><div class="pl-name"></div><div class="pl-sub">Cargando…</div>';
            root.appendChild(el);
        }
        el.classList.toggle('dk', dark());
        el.querySelector('.pl-name').innerHTML = esc(name() || 'Crm Hub 360');
        return el;
    }

    function show(kind) {
        var e = ensure(), r = null;
        if (kind === 'part') {
            // el área de contenido: a la derecha del menú lateral y debajo de la barra superior
            var nv = document.getElementById('navbar'), tb = nv && nv.querySelector('.navbar-right'), side = nv && nv.querySelector('.navbar-header, .navbar-body, .tabs, #navbar-menu'), l = side ? Math.round(side.getBoundingClientRect().right) : 0, t = tb ? Math.round(tb.getBoundingClientRect().bottom) : 0;
            if (!nv || l < 40 || l > innerWidth * 0.6 || t < 20) { l = t = 0; kind = nv ? 'part' : 'full'; }
            r = {left: l, top: t, width: innerWidth - l, height: innerHeight - t};
        }
        e.classList.remove('out', 'full', 'part'); e.classList.add(kind);
        if (kind === 'part') { e.style.inset = 'auto'; e.style.left = r.left + 'px'; e.style.top = r.top + 'px'; e.style.width = r.width + 'px'; e.style.height = Math.max(r.height, innerHeight - r.top) + 'px'; }
        else { e.style.inset = '0'; e.style.left = e.style.top = e.style.width = e.style.height = ''; }
        shown = {kind: kind, at: Date.now(), max: kind === 'full' ? 25000 : 7000}; lastMut = Date.now();
        clearInterval(timer); timer = setInterval(check, 150);
    }

    function hide() {
        clearInterval(timer); timer = null; shown = null;
        if (el) { el.classList.add('out'); var x = el; setTimeout(function () { if (!shown && x.classList.contains('out')) { x.remove(); if (el === x) { el = null; } } }, 350); }
    }

    // la página está lista: hay contenido dibujado (o el formulario de ingreso), sin peticiones en curso y sin cambios en el DOM desde hace un momento
    function ready() {
        if (document.querySelector('.crmhub-login, #login-form, .login-container')) { return true; }
        var c = document.getElementById('content');
        return !!(document.getElementById('navbar') && c && c.children.length && !c.querySelector(':scope > .loading, :scope > .main > .loading'));
    }
    function check() {
        if (!shown) { return; }
        var age = Date.now() - shown.at, busy = !!(window.jQuery && jQuery.active > 0);
        if (age > shown.max) { hide(); return; }
        if (age > 450 && !busy && Date.now() - lastMut > 280 && (shown.kind === 'part' || ready())) { hide(); }
    }

    new MutationObserver(function () { lastMut = Date.now(); }).observe(root, {childList: true, subtree: true});

    show('full');
    window.addEventListener('hashchange', function () { if (!shown || shown.kind === 'part') { show('part'); } });
    window.addEventListener('pageshow', function (e) { if (e.persisted && !shown) { show('full'); } });
    window.ChPreload = {show: show, hide: hide};
})();
