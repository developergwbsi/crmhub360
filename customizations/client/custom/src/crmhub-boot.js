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
    var pushOn = false, pushSynced = false;
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
    var pending = false;
    function onDom() {
        if (pending) { return; }
        pending = true;
        requestAnimationFrame(function () {
            pending = false; swapStylesheet(resolved()); ensureTools(); colorizeMenu(); syncSticky(); checkReadOnly(); paintBrand(); if (window.ChSplit) { window.ChSplit.reconcile(); }
            // EspoCRM reconstruye <body> al arrancar y puede borrar los avisos: se vuelven a poner mientras sigan vigentes
            if (!online && !document.getElementById('ch-net')) { banner('ch-net', 'ch-banner-warn', OFFLINE_HTML); }
        });
    }
    new MutationObserver(onDom).observe(root, {childList: true, subtree: true});

    function ready() { injectPwaHead(); onDom(); startWorker(); }
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', ready); } else { ready(); }
})();
