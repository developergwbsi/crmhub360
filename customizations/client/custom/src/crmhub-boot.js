/* Crm Hub 360 - arranque global (se carga en todas las pantallas, incluido el login).
 * Modo claro/oscuro, colores por sección del menú, PWA (service worker, instalación),
 * aviso de pérdida/retorno de conexión y aviso de nueva versión. */
(function () {
    'use strict';

    var root = document.documentElement;
    var THEME_KEY = 'crmhub-theme';
    var BASE = '/client/custom/';

    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* modo privado */ } }
    function el(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }

    /* ---------------- Tema claro / oscuro ---------------- */
    function resolved() {
        var p = lsGet(THEME_KEY);
        if (p === 'light' || p === 'dark') { return p; }
        return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function swapStylesheet(theme) {
        var link = document.getElementById('main-stylesheet');
        if (!link) { return false; }
        var want = theme === 'dark' ? 'crmhub-theme-dark.css' : 'crmhub-theme.css';
        var href = link.getAttribute('href') || '';
        if (href.indexOf(want) === -1) { link.setAttribute('href', href.replace(/crmhub-theme(-dark)?\.css/, want)); }
        return true;
    }

    function applyTheme() {
        var t = resolved();
        root.setAttribute('data-ch-theme', t);
        swapStylesheet(t);
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) { meta.setAttribute('content', t === 'dark' ? '#0f1420' : '#4f63e8'); }
        document.querySelectorAll('[data-ch-theme-toggle]').forEach(function (a) {
            var dark = t === 'dark';
            a.setAttribute('title', dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
            a.setAttribute('aria-label', a.getAttribute('title'));
            var i = a.querySelector('span'); if (i) { i.className = 'fas ' + (dark ? 'fa-sun' : 'fa-moon'); }
        });
    }

    function toggleTheme() { lsSet(THEME_KEY, resolved() === 'dark' ? 'light' : 'dark'); applyTheme(); }

    if (window.matchMedia) {
        var mq = matchMedia('(prefers-color-scheme: dark)');
        (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(function () { if (!lsGet(THEME_KEY)) { applyTheme(); } });
    }
    applyTheme();

    /* ---------------- Barra de herramientas siempre visible ---------------- */
    var installEvent = null;

    function toggleButton(floating) {
        return '<a role="button" tabindex="0" class="ch-tool" data-ch-theme-toggle><span class="fas fa-moon"></span></a>';
    }

    function ensureTools() {
        var bar = document.querySelector('#navbar .navbar-right');
        var login = document.querySelector('.crmhub-login');
        // Dentro de la app: en la barra superior. En el login (sin barra): flotante arriba a la derecha.
        if (bar) {
            var f = document.getElementById('ch-float-tools'); if (f) { f.remove(); }
            if (!bar.querySelector('[data-ch-theme-toggle]')) {
                var li = el('<li class="ch-tools-li">' + toggleButton() + '<a role="button" tabindex="0" class="ch-tool" data-ch-push style="display:none"><span class="fas fa-bullhorn"></span></a><a role="button" tabindex="0" class="ch-tool ch-install" data-ch-install title="Instalar la aplicación" style="display:none"><span class="fas fa-download"></span></a></li>');
                var anchor = bar.querySelector('li.notifications-badge-container') || bar.firstElementChild;
                bar.insertBefore(li, anchor);
            }
        } else if (login && !document.getElementById('ch-float-tools')) {
            document.body.appendChild(el('<div id="ch-float-tools">' + toggleButton() + '</div>'));
        }
        refreshInstallButton();
        refreshPushButton();
        if (!pushSynced && window.Espo && Espo.Ajax && document.querySelector('#navbar .navbar-right')) { pushSynced = true; syncPush(); }
        if (!docWatchStarted && window.Espo && Espo.Ajax && Espo.loader && document.querySelector('#navbar .navbar-right')) {
            docWatchStarted = true;
            try { Espo.loader.require('custom:doc-watch', function (m) { m.init(); }); } catch (e) { /* sin indicador de lecturas */ }
        }
        applyTheme();
    }

    document.addEventListener('click', function (e) {
        var t = e.target.closest && e.target.closest('[data-ch-theme-toggle]');
        if (t) { e.preventDefault(); toggleTheme(); return; }
        var pb = e.target.closest && e.target.closest('[data-ch-push]');
        if (pb) { e.preventDefault(); pushOn ? disablePush() : enablePush(); return; }
        var i = e.target.closest && e.target.closest('[data-ch-install]');
        if (i && installEvent) { e.preventDefault(); installEvent.prompt(); installEvent.userChoice.then(function () { installEvent = null; refreshInstallButton(); }); }
    });
    document.addEventListener('keydown', function (e) {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.ch-tool')) { e.preventDefault(); e.target.click(); }
    });

    /* ---------------- Colores por sección del menú ---------------- */
    function colorizeMenu() {
        var items = document.querySelectorAll('#navbar ul.tabs > li');
        var n = 0, sig = '';
        items.forEach(function (li) {
            if (li.classList.contains('tab-divider')) { n++; }
            var cls = 'ch-sec-' + ((n) % 8);
            sig += cls;
            if (!li.classList.contains(cls)) {
                li.className = li.className.replace(/\bch-sec-\d+\b/g, '').trim() + ' ' + cls;
            }
        });
    }

    /* ---------------- Notificaciones push (llegan con la app cerrada) ---------------- */
    var pushOn = false, pushSynced = false, docWatchStarted = false;
    function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext; }
    function api(method, url, data) {
        return (window.Espo && Espo.Ajax) ? Espo.Ajax[method + 'Request'](url, data) : Promise.reject(new Error('app no lista'));
    }
    function b64uToU8(b) {
        var p = (b + '='.repeat((4 - b.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'), r = atob(p), o = new Uint8Array(r.length);
        for (var i = 0; i < r.length; i++) { o[i] = r.charCodeAt(i); }
        return o;
    }
    function say(ok, msg) { if (window.Espo && Espo.Ui) { (ok ? Espo.Ui.success : Espo.Ui.warning)(msg); } }
    function refreshPushButton() {
        document.querySelectorAll('[data-ch-push]').forEach(function (a) {
            a.style.display = pushSupported() ? '' : 'none';
            a.classList.toggle('ch-on', pushOn);
            a.setAttribute('title', pushOn ? 'Notificaciones push activadas en este dispositivo (clic para desactivar)' : 'Activar notificaciones push (avisos aunque la app esté cerrada)');
        });
    }
    function enablePush() {
        if (!pushSupported()) { say(false, 'Este navegador no admite notificaciones push. En iPhone, instala primero la app (Compartir → Añadir a pantalla de inicio).'); return Promise.resolve(); }
        return Notification.requestPermission().then(function (perm) {
            if (perm !== 'granted') { say(false, 'No diste permiso para notificaciones. Puedes activarlo en la configuración del sitio del navegador.'); return; }
            return navigator.serviceWorker.ready.then(function (reg) {
                return api('get', 'CrmHub/push/key').then(function (k) {
                    return reg.pushManager.getSubscription().then(function (sub) {
                        return sub || reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: b64uToU8(k.publicKey)});
                    });
                }).then(function (sub) {
                    return api('post', 'CrmHub/push/subscribe', {subscription: sub.toJSON(), userAgent: navigator.userAgent});
                }).then(function () { pushOn = true; refreshPushButton(); say(true, 'Notificaciones push activadas en este dispositivo'); });
            });
        }).catch(function (err) { console.warn('[crmhub] push:', err); say(false, 'No se pudo activar el push: ' + ((err && err.message) || 'error desconocido')); });
    }
    function disablePush() {
        return navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
            if (!sub) { return; }
            return api('post', 'CrmHub/push/unsubscribe', {endpoint: sub.endpoint}).catch(function () {}).then(function () { return sub.unsubscribe(); });
        }).then(function () { pushOn = false; refreshPushButton(); say(true, 'Notificaciones push desactivadas'); });
    }
    // al abrir la app con una sesión: si el dispositivo ya está suscrito, se vincula al usuario actual (por si cambió de usuario)
    function syncPush() {
        if (!pushSupported() || Notification.permission !== 'granted') { return; }
        navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
            pushOn = !!sub; refreshPushButton();
            if (sub) { api('post', 'CrmHub/push/subscribe', {subscription: sub.toJSON(), userAgent: navigator.userAgent}).catch(function () {}); }
        }).catch(function () {});
    }

    /* ---------------- Instalación (PWA) ---------------- */
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvent = e; refreshInstallButton(); });
    window.addEventListener('appinstalled', function () { installEvent = null; refreshInstallButton(); });
    function refreshInstallButton() {
        var standalone = window.matchMedia && matchMedia('(display-mode: standalone)').matches;
        document.querySelectorAll('[data-ch-install]').forEach(function (a) { a.style.display = installEvent && !standalone ? '' : 'none'; });
    }

    function injectPwaHead() {
        var head = document.head;
        if (!document.querySelector('link[rel="manifest"]')) { head.appendChild(el('<link rel="manifest" href="' + BASE + 'manifest.webmanifest">')); }
        if (!document.querySelector('meta[name="theme-color"]')) { head.appendChild(el('<meta name="theme-color" content="#4f63e8">')); }
        if (!document.querySelector('link[rel="apple-touch-icon"]')) { head.appendChild(el('<link rel="apple-touch-icon" href="' + BASE + 'img/apple-touch-icon.png">')); }
        head.appendChild(el('<meta name="apple-mobile-web-app-capable" content="yes">'));
        head.appendChild(el('<meta name="mobile-web-app-capable" content="yes">'));
        applyTheme();
    }

    /* ---------------- Avisos (conexión y versión) ---------------- */
    function banner(id, cls, html) {
        // el script corre en <head>: si la página aún no tiene <body>, se pinta cuando exista
        if (!document.body) { document.addEventListener('DOMContentLoaded', function () { banner(id, cls, html); }); return null; }
        var b = document.getElementById(id);
        if (!b) { b = document.createElement('div'); b.id = id; document.body.appendChild(b); }
        b.className = 'ch-banner ' + cls; b.innerHTML = html; return b;
    }
    function hideBanner(id) { var b = document.getElementById(id); if (b) { b.remove(); } }

    var online = navigator.onLine !== false, okTimer = null;
    var OFFLINE_HTML = '<span class="fas fa-triangle-exclamation"></span><b>Sin conexión</b> — verás los datos guardados en este dispositivo. Los cambios no se guardarán hasta que vuelva internet.';
    function setOnline(v) {
        if (v === online) { return; }
        online = v;
        if (!v) {
            clearTimeout(okTimer);
            banner('ch-net', 'ch-banner-warn', OFFLINE_HTML);
        } else {
            banner('ch-net', 'ch-banner-ok', '<b>Conexión restablecida</b>');
            clearTimeout(okTimer); okTimer = setTimeout(function () { hideBanner('ch-net'); }, 3500);
            checkVersion();
        }
    }
    window.addEventListener('offline', function () { setOnline(false); });
    window.addEventListener('online', function () { setOnline(true); });
    if (!online) { online = true; setOnline(false); }

    // mientras no haya red, el aviso se mantiene aunque EspoCRM reconstruya la página
    setInterval(function () { if (!online && document.body && !document.getElementById('ch-net')) { banner('ch-net', 'ch-banner-warn', OFFLINE_HTML); } }, 1500);

    // «latido»: detecta redes que dicen estar conectadas pero no dejan salir
    function heartbeat() {
        fetch(BASE + 'version.json?hb=' + Date.now(), {cache: 'no-store'}).then(function (r) { setOnline(r.ok || r.status < 500); }).catch(function () { setOnline(false); });
    }
    setInterval(heartbeat, 45000);

    /* ---------------- Nueva versión ---------------- */
    var VER_KEY = 'crmhub-version', loadedVersion = null, announced = null, startupTried = false;

    function fetchVersion() {
        return fetch(BASE + 'version.json?t=' + Date.now(), {cache: 'no-store'}).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    }

    function checkVersion() {
        var atStart = !startupTried; startupTried = true;
        fetchVersion().then(function (v) {
            if (!v || !v.version) { return; }
            if (!loadedVersion) {
                // si la página se abrió sin red (desde la copia guardada), la versión «cargada» es la última que vimos
                loadedVersion = atStart ? v.version : (lsGet(VER_KEY) || v.version);
                if (atStart) { lsSet(VER_KEY, v.version); tellWorker({type: 'version', version: v.version}); }
            }
            if (v.version !== loadedVersion && announced !== v.version) { announced = v.version; announceUpdate(v); }
        });
    }

    function tellWorker(msg) {
        if (!('serviceWorker' in navigator)) { return; }
        navigator.serviceWorker.ready.then(function (reg) { (reg.active || navigator.serviceWorker.controller) && (reg.active || navigator.serviceWorker.controller).postMessage(msg); });
    }

    function announceUpdate(v) {
        var canAsk = 'Notification' in window && Notification.permission === 'default';
        banner('ch-update', 'ch-banner-info',
            '<span class="fas fa-cloud-arrow-down"></span><b>Nueva versión disponible</b>' +
            '<button class="btn btn-primary btn-sm" data-ch-apply>Actualizar ahora</button>' +
            (canAsk ? '<button class="btn btn-default btn-sm" data-ch-notify>Activar avisos aunque la app esté cerrada</button>' : '') +
            '<a role="button" data-ch-dismiss title="Cerrar">×</a>');
        if ('Notification' in window && Notification.permission === 'granted') { tellWorker({type: 'notify-update', version: v.version}); }
    }

    document.addEventListener('click', function (e) {
        var t = e.target;
        if (t.closest && t.closest('[data-ch-apply]')) { applyUpdate(); }
        if (t.closest && t.closest('[data-ch-dismiss]')) { hideBanner('ch-update'); }
        if (t.closest && t.closest('[data-ch-notify]')) {
            enablePush().then(function () {
                if (Notification.permission === 'granted') { tellWorker({type: 'notify-update', version: announced}); }
                var b = document.querySelector('[data-ch-notify]'); if (b) { b.remove(); }
            });
        }
    });

    function applyUpdate() {
        tellWorker({type: 'clear'});
        var done = function () { location.reload(); };
        if ('serviceWorker' in navigator) { navigator.serviceWorker.getRegistration().then(function (r) { (r ? r.update() : Promise.resolve()).then(done, done); }, done); } else { done(); }
    }

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', function (e) {
            if (!e.data) { return; }
            if (e.data.type === 'apply-update') { applyUpdate(); }
            if (e.data.type === 'goto' && e.data.url && e.data.url.indexOf('#') > -1) { location.hash = e.data.url.slice(e.data.url.indexOf('#')); }
        });
    }

    function startWorker() {
        if (!('serviceWorker' in navigator) || !window.isSecureContext) { return; }
        navigator.serviceWorker.register('/client/custom/sw.js', {scope: '/'}).then(function () { checkVersion(); }).catch(function (err) { console.warn('[crmhub] service worker no disponible:', err && err.message); });
        setInterval(checkVersion, 5 * 60 * 1000);
        document.addEventListener('visibilitychange', function () { if (!document.hidden) { checkVersion(); } });
    }

    /* ---------------- Observador: el DOM de la app se pinta después ---------------- */
    // Encabezado fijo: la altura real del encabezado de página se publica como variable para apilar debajo el resumen del lead.
    function syncSticky() {
        var ph = document.querySelector('#main .page-header, .page-header');
        var h = ph ? Math.round(ph.getBoundingClientRect().height) : 0;
        if (h && document.documentElement.style.getPropertyValue('--ch-ph-h') !== h + 'px') { document.documentElement.style.setProperty('--ch-ph-h', h + 'px'); }
        var hero = document.querySelector('.ch-lead-hero:not(.ch-in-modal)');
        if (!hero) { document.documentElement.style.setProperty('--ch-hero-h', '0px'); }
        else if (!hero._chRo && window.ResizeObserver) {
            hero._chRo = new ResizeObserver(function () { document.documentElement.style.setProperty('--ch-hero-h', hero.offsetHeight + 'px'); });
            hero._chRo.observe(hero);
        }
    }
    window.addEventListener('scroll', function () {
        var c = window.scrollY > 60;
        document.querySelectorAll('.ch-lead-hero:not(.ch-in-modal)').forEach(function (e) { e.classList.toggle('ch-compact', c); });
    }, {passive: true});
    window.addEventListener('resize', syncSticky);
    // Modo lectura (soporte): aviso permanente y botones de edición ocultos; los permisos del rol lo impiden de todos modos
    // Favicon propio: desarrollo «CD» (ámbar), producción «CP» (azul) y empresas con la marca de Crm Hub 360
    function paintFavicon() {
        var h = location.hostname, v = /^dev[-.]/.test(h) ? 'dev' : /^crm\./.test(h) ? 'prod' : 'crm';
        var head = document.head, key = 'crmhub-fav-' + v;
        if (head.getAttribute('data-ch-fav') === v) { return; }
        head.setAttribute('data-ch-fav', v);
        Array.prototype.slice.call(head.querySelectorAll('link[rel*="icon"]')).forEach(function (n) { n.remove(); });
        var base = (typeof BASE !== 'undefined' ? BASE : 'client/custom/') + 'img/favicon-' + v;
        [['icon', 'image/svg+xml', base + '.svg', ''], ['icon', 'image/png', base + '-32.png', '32x32'], ['apple-touch-icon', '', base + '-180.png', '180x180']].forEach(function (a) {
            var l = document.createElement('link'); l.rel = a[0]; if (a[1]) { l.type = a[1]; } l.href = a[2]; if (a[3]) { l.sizes = a[3]; } head.appendChild(l);
        });
    }
    var roChecked = false, SYSTEM = 'Crm Hub 360';
    function companyName() { try { return localStorage.getItem('ch-app-name') || ''; } catch (e) { return ''; } }
    // Marca: la empresa pone su nombre; «Crm Hub 360» (el sistema) se muestra siempre debajo, en el menú, el título y el inicio de sesión
    function paintBrand() {
        var name = companyName(), a = document.querySelector('#navbar .navbar-brand');
        if (a && name) {
            var cur = a.querySelector('.ch-brand-co');
            if (!cur) {
                a.classList.add('ch-has-brand');
                a.insertAdjacentHTML('beforeend', '<span class="ch-brand"><b class="ch-brand-co"></b><small class="ch-brand-sys">' + SYSTEM + '</small></span>');
                cur = a.querySelector('.ch-brand-co');
            }
            if (cur.textContent !== name) { cur.textContent = name; }
            a.title = name + ' · ' + SYSTEM;
        }
        if (name && document.title.indexOf(SYSTEM) === -1) { document.title = (document.title || name) + ' · ' + SYSTEM; }
    }
    function checkReadOnly() {
        if (roChecked || !document.body.classList.contains('has-navbar') || !window.Espo || !Espo.Ajax) { return; }
        roChecked = true;
        Espo.Ajax.getRequest('App/user').then(function (r) {
            var n = r && r.settings && r.settings.applicationName;
            if (n) { try { localStorage.setItem('ch-app-name', n); } catch (e) { /* privado */ } paintBrand(); }
            // el nombre del usuario recordado se guarda para la bienvenida del próximo inicio de sesión
            try { if (r && r.user && localStorage.getItem('ch-last-user') === r.user.userName && r.user.name) { localStorage.setItem('ch-last-name', r.user.name); } } catch (e) { /* privado */ }
            if (r && r.user && r.user.userName === 'soporte-lectura') {
                document.body.classList.add('ch-readonly');
                if (!document.getElementById('ch-ro')) {
                    var d = document.createElement('div'); d.id = 'ch-ro'; d.className = 'ch-ro-banner';
                    d.innerHTML = '<span class="fas fa-eye"></span> Modo lectura (soporte): puedes ver la información, pero no modificarla.';
                    document.body.appendChild(d);
                }
            }
        }).catch(function () { roChecked = false; });
    }

    /* ---------------- Estados vacíos: ilustración divertida en vez de un texto suelto ---------------- */
    var FACE = function (x, y, s) {
        s = s || 1;
        return '<g class="e-face"><circle cx="' + (x - 11 * s) + '" cy="' + y + '" r="' + 4.2 * s + '" class="e-ink"/><circle cx="' + (x + 11 * s) + '" cy="' + y + '" r="' + 4.2 * s + '" class="e-ink"/>' +
            '<path d="M' + (x - 8 * s) + ' ' + (y + 11 * s) + ' Q' + x + ' ' + (y + 20 * s) + ' ' + (x + 8 * s) + ' ' + (y + 11 * s) + '" class="e-mouth"/>' +
            '<circle cx="' + (x - 19 * s) + '" cy="' + (y + 9 * s) + '" r="' + 4 * s + '" class="e-blush"/><circle cx="' + (x + 19 * s) + '" cy="' + (y + 9 * s) + '" r="' + 4 * s + '" class="e-blush"/></g>';
    };
    var STAR = function (x, y, r, d) { return '<path class="e-star" style="animation-delay:' + d + 's" d="M' + x + ' ' + (y - r) + ' Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + ' Q' + x + ' ' + y + ' ' + x + ' ' + (y + r) + ' Q' + x + ' ' + y + ' ' + (x - r) + ' ' + y + ' Q' + x + ' ' + y + ' ' + x + ' ' + (y - r) + 'Z"/>'; };
    var ART = {
        box: '<ellipse class="e-shadow" cx="110" cy="154" rx="62" ry="8"/><g class="e-float"><circle cx="94" cy="76" r="10" class="e-eyew"/><circle cx="126" cy="76" r="10" class="e-eyew"/><circle cx="96" cy="77" r="5" class="e-ink e-look"/><circle cx="128" cy="77" r="5" class="e-ink e-look"/>' +
            '<path class="e-box2" d="M56 88 L42 66 L86 66 L94 88Z"/><path class="e-box2" d="M164 88 L178 66 L134 66 L126 88Z"/><rect class="e-box" x="56" y="86" width="108" height="62" rx="9"/><rect class="e-tape" x="98" y="86" width="24" height="26" rx="3"/>' + FACE(110, 124, .8) + '</g>' + STAR(40, 40, 8, 0) + STAR(184, 52, 6, .6) + STAR(168, 22, 5, 1.1),
        search: '<ellipse class="e-shadow" cx="110" cy="154" rx="56" ry="8"/><g class="e-float"><line class="e-handle" x1="136" y1="108" x2="168" y2="140"/><circle class="e-lens" cx="106" cy="78" r="42"/>' + FACE(106, 72, 1) + '<path class="e-shine" d="M80 52 Q86 44 96 42"/></g>' + STAR(44, 44, 8, .2) + STAR(186, 60, 6, .8),
        chat: '<ellipse class="e-shadow" cx="110" cy="156" rx="58" ry="8"/><g class="e-float"><path class="e-b1" d="M44 40 h104 a20 20 0 0 1 20 20 v22 a20 20 0 0 1 -20 20 h-62 l-26 20 v-20 h-16 a20 20 0 0 1 -20 -20 v-22 a20 20 0 0 1 20 -20z"/><circle class="e-dotw d1" cx="82" cy="71" r="6"/><circle class="e-dotw d2" cx="106" cy="71" r="6"/><circle class="e-dotw d3" cx="130" cy="71" r="6"/>' +
            '<path class="e-b2" d="M112 108 h56 a16 16 0 0 1 16 16 v6 a16 16 0 0 1 -16 16 h-4 v14 l-18 -14 h-34 a16 16 0 0 1 -16 -16 v-6 a16 16 0 0 1 16 -16z" transform="translate(0,-4)"/></g>' + STAR(190, 40, 7, .4) + STAR(34, 112, 6, 1),
        mail: '<ellipse class="e-shadow" cx="110" cy="154" rx="62" ry="8"/><g class="e-float"><rect class="e-env" x="40" y="52" width="140" height="92" rx="14"/><path class="e-flap" d="M44 62 L110 110 L176 62"/>' + FACE(110, 124, .75) + '<path class="e-heart" d="M110 44 c-8 -12 -26 -4 -18 10 l18 16 l18 -16 c8 -14 -10 -22 -18 -10z" transform="translate(0,-18) scale(1)"/></g>' + STAR(36, 46, 7, .3) + STAR(188, 70, 6, .9),
        chart: '<ellipse class="e-shadow" cx="110" cy="154" rx="70" ry="8"/><g class="e-float"><rect class="e-bar" x="52" y="112" width="30" height="36" rx="8"/><rect class="e-bar" x="94" y="86" width="30" height="62" rx="8"/><rect class="e-bar e-bar3" x="136" y="56" width="30" height="92" rx="8"/>' + FACE(151, 86, .55) +
            '<path class="e-sprout" d="M67 112 q0 -14 -10 -18 M67 112 q0 -12 10 -16"/><path class="e-leaf" d="M57 94 q-10 -2 -12 -10 q10 0 12 10z M77 96 q10 -2 12 -10 q-10 0 -12 10z"/></g><path class="e-arrow" d="M44 70 L96 40 L88 40 M96 40 L96 48"/>' + STAR(184, 40, 7, .5),
        doc: '<ellipse class="e-shadow" cx="110" cy="156" rx="52" ry="8"/><g class="e-float"><path class="e-paper" d="M68 28 h58 l30 30 v84 a10 10 0 0 1 -10 10 h-78 a10 10 0 0 1 -10 -10 v-104 a10 10 0 0 1 10 -10z"/><path class="e-fold" d="M126 28 v22 a8 8 0 0 0 8 8 h22z"/><line class="e-ln" x1="80" y1="74" x2="112" y2="74"/>' + FACE(112, 100, .85) + '<line class="e-ln" x1="84" y1="132" x2="140" y2="132"/></g>' + STAR(40, 60, 7, .2) + STAR(180, 100, 6, .8),
        calendar: '<ellipse class="e-shadow" cx="110" cy="156" rx="62" ry="8"/><g class="e-float"><rect class="e-cal" x="48" y="42" width="124" height="104" rx="14"/><path class="e-calh" d="M48 56 a14 14 0 0 1 14 -14 h96 a14 14 0 0 1 14 14 v14 h-124z"/><rect class="e-ring" x="76" y="32" width="8" height="20" rx="4"/><rect class="e-ring" x="136" y="32" width="8" height="20" rx="4"/>' + FACE(110, 106, .85) + '<text class="e-z" x="150" y="96">z</text></g>' + STAR(34, 66, 6, .5) + STAR(190, 56, 7, 1),
        robot: '<ellipse class="e-shadow" cx="110" cy="156" rx="52" ry="8"/><g class="e-float"><line class="e-ant" x1="110" y1="38" x2="110" y2="52"/><circle class="e-antb" cx="110" cy="34" r="6"/><rect class="e-head" x="68" y="50" width="84" height="62" rx="18"/>' + FACE(110, 78, 1) + '<rect class="e-body" x="80" y="116" width="60" height="32" rx="10"/><circle class="e-eyew" cx="98" cy="132" r="4"/><circle class="e-eyew" cx="122" cy="132" r="4"/><g class="e-wave"><line class="e-arm" x1="140" y1="124" x2="166" y2="104"/></g><line class="e-arm" x1="80" y1="124" x2="56" y2="136"/></g>' + STAR(40, 50, 7, .1) + STAR(186, 50, 6, .7)
    };
    var SCOPE = {
        Lead: ['search', 'Aún no hay leads', 'Cuando llegue el primero aparecerá aquí.'], Account: ['box', 'Aún no hay cuentas', 'Las cuentas aparecerán aquí cuando conviertas tus primeros leads.'],
        Contact: ['box', 'Aún no hay contactos', 'Tus contactos aparecerán aquí.'], Opportunity: ['chart', 'Aún no hay oportunidades', 'Cada venta en camino se verá aquí.'],
        Task: ['calendar', 'Sin tareas por ahora', 'Disfruta la calma: cuando haya tareas las verás aquí.'], Meeting: ['calendar', 'Sin reuniones por ahora', 'Tus reuniones aparecerán aquí.'],
        Call: ['chat', 'Aún no hay llamadas', 'El historial de llamadas se llenará aquí.'], Email: ['mail', 'Tu bandeja está vacía', 'Cuando llegue o envíes un correo lo verás aquí.'],
        Campaign: ['chart', 'Aún no hay campañas', 'Crea la primera y mide sus resultados aquí.'], Document: ['doc', 'Aún no hay documentos', 'Los documentos aparecerán aquí.']
    };
    var COMPACT_BY_NAME = [[/history|activit|task|meeting|call/i, 'calendar'], [/email|mail/i, 'mail'], [/opportun|campaign|stat/i, 'chart'], [/note|stream|messag/i, 'chat'], [/doc|file|attach/i, 'doc']];
    function emptyHtml(o) {
        o = o || {};
        var kind = ART[o.kind] ? o.kind : 'box';
        var title = o.title || 'Todo muy tranquilo por aquí';
        var text = o.text === undefined ? 'Todavía no hay datos, pero pronto entrarán.' : o.text;
        var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]; }); };
        return '<div class="ch-empty' + (o.compact ? ' ch-empty-compact' : ' ch-empty-full') + '" role="status"><svg class="ch-empty-art" viewBox="0 0 220 170" aria-hidden="true" focusable="false">' + ART[kind] + '</svg>' +
            '<div class="ch-empty-title">' + esc(title) + '</div>' + (text ? '<div class="ch-empty-text">' + (o.html ? text : esc(text)) + '</div>' : '') + '</div>';
    }
    window.ChEmpty = {html: emptyHtml, kinds: Object.keys(ART)};

    // El «Sin datos» nativo de EspoCRM (listas, paneles, ventanas) se cambia por la ilustración.
    function decorateEmpty() {
        var nodes = document.querySelectorAll('.no-data:not([data-ch-empty])');
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            n.setAttribute('data-ch-empty', '1');
            if (n.closest('.dropdown-menu, .navbar, .autocomplete-suggestions, .ch-empty')) { continue; }
            var compact = !!n.closest('.panel, .dashlet, .modal, .side, .detail-container, .kanban-column, .ch-kcol');
            var scope = (location.hash.replace(/^#/, '').split(/[\/?]/)[0] || '');
            var o = {compact: compact};
            if (!compact && SCOPE[scope]) { o.kind = SCOPE[scope][0]; o.title = SCOPE[scope][1]; o.text = SCOPE[scope][2]; }
            else if (compact) {
                var holder = n.closest('[data-name]'); var nm = holder ? holder.getAttribute('data-name') : '';
                o.kind = 'box'; for (var k = 0; k < COMPACT_BY_NAME.length; k++) { if (COMPACT_BY_NAME[k][0].test(nm)) { o.kind = COMPACT_BY_NAME[k][1]; break; } }
                o.title = 'Aún no hay nada por aquí'; o.text = 'Pronto entrarán datos.';
            }
            n.classList.add('ch-empty-host');
            n.innerHTML = emptyHtml(o);
        }
    }
    /* ---------------- Tablas: buscador, paginación, encabezado fijo y scroll dentro del contenido ---------------- */
    var DT_STATE = {};
    function dtNorm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' '); }
    function dtEnhance(table) {
        if (table.getAttribute('data-ch-enh') || !table.tBodies.length) { return; }
        var tbody = table.tBodies[0], rows = Array.prototype.slice.call(tbody.rows);
        if (!rows.length || (rows.length === 1 && rows[0].querySelector('.ch-empty'))) { return; }   // sin datos: queda solo la ilustración
        table.setAttribute('data-ch-enh', '1');
        var heads = Array.prototype.map.call(table.querySelectorAll('thead th'), function (h) { return h.textContent.trim(); }).join('|');
        var key = location.pathname + location.hash + '#' + heads;
        var st = DT_STATE[key] || (DT_STATE[key] = {q: '', page: 1, size: 10});
        var wrap = document.createElement('div'); wrap.className = 'ch-dt';
        wrap.innerHTML = '<div class="ch-dt-bar"><div class="ch-dt-search"><input type="search" class="ch-dt-q" placeholder="Buscar en la tabla…" aria-label="Buscar en la tabla" autocomplete="off"></div><span class="ch-dt-count"></span></div>' +
            '<div class="ch-dt-scroll"></div><div class="ch-dt-none" hidden></div>' +
            '<div class="ch-dt-foot"><label class="ch-dt-size">Filas <select class="ch-dt-sz"><option>10</option><option>25</option><option>50</option><option>100</option></select></label><div class="ch-dt-pages"></div></div>';
        table.parentNode.insertBefore(wrap, table);
        wrap.querySelector('.ch-dt-scroll').appendChild(table);
        var q = wrap.querySelector('.ch-dt-q'), sz = wrap.querySelector('.ch-dt-sz'), cnt = wrap.querySelector('.ch-dt-count'), pg = wrap.querySelector('.ch-dt-pages'), none = wrap.querySelector('.ch-dt-none'), sc = wrap.querySelector('.ch-dt-scroll');
        var data = rows.map(function (r) { return {r: r, t: dtNorm(r.textContent)}; });
        q.value = st.q; sz.value = String(st.size);
        function draw() {
            var term = dtNorm(st.q).trim(), hit = term ? data.filter(function (d) { return d.t.indexOf(term) !== -1; }) : data;
            var pages = Math.max(1, Math.ceil(hit.length / st.size)); if (st.page > pages) { st.page = pages; }
            var from = (st.page - 1) * st.size, to = from + st.size;
            data.forEach(function (d) { d.r.hidden = true; });
            hit.slice(from, to).forEach(function (d) { d.r.hidden = false; });
            cnt.textContent = hit.length ? (from + 1) + '–' + Math.min(to, hit.length) + ' de ' + hit.length : '0 resultados';
            sc.hidden = !hit.length; none.hidden = !!hit.length;
            if (!hit.length) { none.innerHTML = window.ChEmpty ? window.ChEmpty.html({compact: true, kind: 'search', title: 'Sin resultados', text: 'Nada coincide con «' + st.q.replace(/[<>&"]/g, '') + '».'}) : 'Sin resultados'; }
            var b = '', add = function (n, label, on, dis) { b += '<button type="button" class="ch-dt-pb' + (on ? ' on' : '') + '" data-p="' + n + '"' + (dis ? ' disabled' : '') + '>' + label + '</button>'; };
            if (pages > 1) {
                add(st.page - 1, '‹', false, st.page === 1);
                var lo = Math.max(1, st.page - 2), hi = Math.min(pages, lo + 4); lo = Math.max(1, hi - 4);
                if (lo > 1) { add(1, '1', false); if (lo > 2) { b += '<span class="ch-dt-dots">…</span>'; } }
                for (var i = lo; i <= hi; i++) { add(i, i, i === st.page); }
                if (hi < pages) { if (hi < pages - 1) { b += '<span class="ch-dt-dots">…</span>'; } add(pages, pages, false); }
                add(st.page + 1, '›', false, st.page === pages);
            }
            pg.innerHTML = b;
        }
        q.addEventListener('input', function () { st.q = q.value; st.page = 1; draw(); sc.scrollTop = 0; });
        sz.addEventListener('change', function () { st.size = parseInt(sz.value, 10) || 10; st.page = 1; draw(); });
        pg.addEventListener('click', function (e) { var b = e.target.closest('[data-p]'); if (b && !b.disabled) { st.page = parseInt(b.getAttribute('data-p'), 10); draw(); sc.scrollTop = 0; } });
        draw();
        // si la vista vuelve a pintar las filas (actualización en vivo), se reconstruye la lista sin perder la búsqueda
        new MutationObserver(function () {
            data = Array.prototype.map.call(tbody.rows, function (r) { return {r: r, t: dtNorm(r.textContent)}; });
            draw();
        }).observe(tbody, {childList: true});
    }
    function dtScan(root) {
        var t = (root || document).querySelectorAll('table[data-ch-table]:not([data-ch-enh])');
        for (var i = 0; i < t.length; i++) { dtEnhance(t[i]); }
    }
    // Los menús de fila de las listas viven dentro de un contenedor con scroll: se dibujan en posición fija para que no se recorten
    document.addEventListener('click', function (e) {
        var t = e.target.closest && e.target.closest('.list-container > .list .dropdown-toggle'); if (!t) { return; }
        setTimeout(function () {
            var host = t.closest('.btn-group, .dropdown, .list-row-buttons') || t.parentNode, m = host && host.querySelector('.dropdown-menu');
            if (!m || getComputedStyle(m).display === 'none') { return; }
            var r = t.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
            m.style.position = 'fixed'; m.style.transform = 'none'; m.style.margin = '0'; m.style.right = 'auto'; m.style.bottom = 'auto';
            m.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
            m.style.top = (r.bottom + h + 8 > window.innerHeight && r.top - h - 4 > 0 ? r.top - h - 4 : r.bottom + 4) + 'px';
            m.style.zIndex = 1100;
        }, 0);
    }, true);
    window.addEventListener('scroll', function (e) {
        if (!(e.target && e.target.classList && e.target.classList.contains('list'))) { return; }
        var m = e.target.querySelector('.dropdown-menu[style*="fixed"]'); if (!m) { return; }
        var open = m.closest('.open, .show'); if (open) { open.classList.remove('open', 'show'); }
        m.classList.remove('show'); m.style.display = 'none'; setTimeout(function () { m.style.cssText = ''; }, 0);
    }, true);
    var pending = false;
    function onDom() {
        if (pending) { return; }
        pending = true;
        requestAnimationFrame(function () {
            pending = false; swapStylesheet(resolved()); ensureTools(); colorizeMenu(); syncSticky(); checkReadOnly(); paintBrand(); paintFavicon(); decorateEmpty(); dtScan(document); if (window.ChSplit) { window.ChSplit.reconcile(); }
            // EspoCRM reconstruye <body> al arrancar y puede borrar los avisos: se vuelven a poner mientras sigan vigentes
            if (!online && !document.getElementById('ch-net')) { banner('ch-net', 'ch-banner-warn', OFFLINE_HTML); }
        });
    }
    new MutationObserver(onDom).observe(root, {childList: true, subtree: true});

    function ready() { injectPwaHead(); onDom(); startWorker(); }
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', ready); } else { ready(); }
})();
