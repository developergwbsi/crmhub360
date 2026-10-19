/**
 * Crm Hub 360 - arranque global (se carga en todas las pantallas, incluido el login).
 * Se registra en Resources/metadata/app/client.json (scriptList), por eso no es un módulo AMD sino un IIFE.
 * Modo claro/oscuro, colores por sección del menú, PWA (service worker /client/custom/sw.js, instalación),
 * aviso de pérdida/retorno de conexión (eventos online/offline y latido a version.json) y aviso de nueva versión.
 * Endpoints: CrmHub/push/key, CrmHub/push/subscribe y CrmHub/push/unsubscribe (notificaciones push); App/user (nombre de la empresa y modo solo lectura).
 * Corrector ortográfico en español (lang=es y spellcheck) en todos los campos de texto libre.
 * Cierre de sesión por inactividad (ajuste crmhubIdleMinutes, por defecto 30 min; 0 = desactivado) con aviso de 60 s.
 * También carga bajo demanda custom:doc-watch, decora tablas y estados vacíos y fija el encabezado de página.
 */
(function () {
    'use strict';

    var root = document.documentElement;
    var THEME_KEY = 'crmhub-theme';
    var BASE = '/client/custom/';

    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* modo privado */ } }
    function el(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }

    /* ---------------- Tema claro / oscuro ---------------- */
    // Tema efectivo (claro/oscuro): el guardado o, si no hay, el del sistema
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

    document.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-ch-manual]');
        if (b && window.Espo && Espo.loader) { e.preventDefault(); Espo.loader.require('custom:manual-help', function (m) { m.open(); }); }
        var r = e.target.closest && e.target.closest('[data-ch-rec]');
        if (r && window.Espo && Espo.loader) { e.preventDefault(); Espo.loader.require('custom:recorder', function (m) { if (m.active()) { m.stop(); } else { m.open(); } }); }
    });

    function ensureTools() {
        var bar = document.querySelector('#navbar .navbar-right');
        var login = document.querySelector('.crmhub-login');
        idleNotice(login);
        // Dentro de la app: en la barra superior. En el login (sin barra): flotante arriba a la derecha.
        if (bar) {
            var f = document.getElementById('ch-float-tools'); if (f) { f.remove(); }
            if (!bar.querySelector('[data-ch-manual]')) {
                bar.insertBefore(el('<li class="ch-tools-li"><a role="button" tabindex="0" class="ch-tool ch-tool-manual" data-ch-manual title="Ver esta página en el manual"><span class="fas fa-book-open"></span></a></li>'), bar.firstElementChild);
            }
            if (!bar.querySelector('[data-ch-rec]')) {
                bar.insertBefore(el('<li class="ch-tools-li"><a role="button" tabindex="0" class="ch-tool ch-tool-rec" data-ch-rec title="Grabar la pantalla (capacitaciones y explicaciones)"><span class="fas fa-circle-dot"></span></a></li>'), bar.firstElementChild.nextSibling);
            }
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
        if (!meetWatchStarted && window.Espo && Espo.Ajax && Espo.loader && document.querySelector('#navbar .navbar-right')) {
            meetWatchStarted = true;
            try { Espo.loader.require('custom:call-dock', function () { Espo.loader.require('custom:meet-watch', function (m) { m.start(); }); }); } catch (e) { /* sin aviso de videollamadas */ }
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
    var pushOn = false, pushSynced = false, docWatchStarted = false, meetWatchStarted = false;
    function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext; }
    // Llamada a la API de Espo (usa Espo.Ajax) para los endpoints CrmHub/push/*
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

    // Compara version.json con la versión cargada y avisa si hay una nueva
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
            '<span class="fas fa-cloud-arrow-down"></span><b>Nueva versión disponible</b><small class="ch-upd-note">Se aplica sola cuando dejes de usar la pantalla unos segundos.</small>' +
            '<button class="btn btn-primary btn-sm" data-ch-apply>Actualizar ahora</button>' +
            (canAsk ? '<button class="btn btn-default btn-sm" data-ch-notify>Activar avisos aunque la app esté cerrada</button>' : '') +
            '<a role="button" data-ch-dismiss title="Cerrar">×</a>');
        if ('Notification' in window && Notification.permission === 'granted') { tellWorker({type: 'notify-update', version: v.version}); }
        autoApplyWhenIdle();
    }

    /* Las mejoras se aplican solas: si no hay nada a medias (ventanas abiertas, campos en edición, texto escrito) y llevas unos segundos sin tocar la pantalla, se recarga. */
    var lastInput = Date.now(), autoTimer = null;
    ['keydown', 'mousedown', 'touchstart', 'wheel'].forEach(function (ev) { document.addEventListener(ev, function () { lastInput = Date.now(); }, {passive: true, capture: true}); });
    function safeToReload() {
        if (Date.now() - lastInput < 25000 || document.hidden) { return false; }
        if (document.querySelector('.modal.in, .modal.show, .ch-dlg-back, .record.edit-mode, .detail.edit-mode, .ch-phone-form:not([hidden]) input:focus')) { return false; }
        var a = document.activeElement;
        if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) { return false; }
        var typed = document.querySelectorAll('textarea, .ch-ed-area');
        for (var i = 0; i < typed.length; i++) { if ((typed[i].value || typed[i].textContent || '').trim() && typed[i].offsetParent !== null) { return false; } }
        return true;
    }
    function autoApplyWhenIdle() {
        if (autoTimer) { return; }
        autoTimer = setInterval(function () {
            if (!document.getElementById('ch-update')) { clearInterval(autoTimer); autoTimer = null; return; }
            if (safeToReload()) {
                clearInterval(autoTimer); autoTimer = null;
                var bar = document.getElementById('ch-update'); if (bar) { bar.innerHTML = '<span class="fas fa-rotate fa-spin"></span><b>Actualizando para aplicar las mejoras…</b>'; }
                setTimeout(applyUpdate, 1200);
            }
        }, 5000);
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
        setInterval(checkVersion, 60 * 1000);
        document.addEventListener('visibilitychange', function () { if (!document.hidden) { checkVersion(); } });
    }

    /* ---------------- Observador: el DOM de la app se pinta después ---------------- */
    // Encabezado fijo: la altura real del encabezado de página se publica como variable para apilar debajo el resumen del lead.
    // Espo copia el desplazamiento de la página al menú lateral (por eso el menú «se movía» al hacer scroll). Se ignoran esas asignaciones; el scroll propio del menú (con la rueda) sigue funcionando.
    function pinNavbar() {
        var t = document.querySelector('#navbar .tabs');
        if (!t || t._chPinned) { return; }
        t._chPinned = true;
        var d = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
        Object.defineProperty(t, 'scrollTop', {configurable: true, get: function () { return d.get.call(t); }, set: function () { /* lo mueve solo el usuario */ }});
        d.set.call(t, 0);
    }

    function syncSticky() {
        pinNavbar();
        var ph = document.querySelector('#main .page-header, .page-header');
        var h = ph ? Math.round(ph.getBoundingClientRect().height) : 0;
        if (h && document.documentElement.style.getPropertyValue('--ch-ph-h') !== h + 'px') { document.documentElement.style.setProperty('--ch-ph-h', h + 'px'); }
        var bc = document.querySelector('#main .detail-button-container.record-buttons');   // barra de botones (Editar…): los títulos y pestañas se apilan debajo
        if (bc && !bc._chRo && window.ResizeObserver) {
            bc._chRo = new ResizeObserver(function () { document.documentElement.style.setProperty('--ch-bc-h', Math.round(bc.getBoundingClientRect().height) + 'px'); });
            bc._chRo.observe(bc);
        } else if (!bc) { document.documentElement.style.setProperty('--ch-bc-h', '0px'); }
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
        // con el menú recogido el nombre de la empresa y el del sistema pasan a la esquina superior izquierda de la cabecera
        if (name) {
            var tb = document.getElementById('ch-topbrand');
            if (!tb && document.body.classList.contains('has-navbar')) { tb = document.createElement('div'); tb.id = 'ch-topbrand'; tb.innerHTML = '<b class="ch-tb-co"></b><small class="ch-tb-sys">' + SYSTEM + '</small>'; document.body.appendChild(tb); }
            if (tb && tb.querySelector('.ch-tb-co').textContent !== name) { tb.querySelector('.ch-tb-co').textContent = name; }
        }
        if (name && document.title.indexOf(SYSTEM) === -1) { document.title = (document.title || name) + ' · ' + SYSTEM; }
    }
    function checkReadOnly() {
        if (roChecked || !document.body.classList.contains('has-navbar') || !window.Espo || !Espo.Ajax) { return; }
        roChecked = true;
        Espo.Ajax.getRequest('App/user').then(function (r) {
            startIdle(r && r.settings);
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

    /* ---------------- Corrector ortográfico en español ----------------
       Todo texto libre (cajas de mensaje, correos, notas, descripciones, asuntos) se escribe con el corrector del navegador en español:
       lang="es" + spellcheck. No se toca lo que no es texto corriente (usuario, claves, correos, teléfonos, números, códigos, identificaciones). */
    document.documentElement.setAttribute('lang', 'es');
    var FREE_TEXT = 'textarea, [contenteditable="true"], [contenteditable=""], .note-editable, input[name="subject"], input[data-name="name"], input[data-name="subject"]';
    var NO_SPELL = /user|login|pass|email|phone|url|site|token|key|slug|code|zip|postal|number|iban|nit|identific|document|account|domain|host|port|color|date|time/i;
    function spellFix(root) {
        if (!root || !root.querySelectorAll) { return; }
        var list = root.matches && root.matches(FREE_TEXT) ? [root] : [];
        root.querySelectorAll(FREE_TEXT).forEach(function (e) { list.push(e); });
        list.forEach(function (e) {
            if (e._chSpell) { return; }
            var n = (e.getAttribute('name') || '') + ' ' + (e.getAttribute('data-name') || '');
            if (e.tagName === 'INPUT' && NO_SPELL.test(n)) { return; }
            e._chSpell = true;
            e.setAttribute('spellcheck', 'true'); e.setAttribute('lang', 'es'); e.setAttribute('autocorrect', 'on'); e.setAttribute('autocapitalize', 'sentences');
        });
    }
    var spellTimer = null, spellQueue = [];
    function spellScan() { spellQueue = []; spellFix(document.body); }
    document.addEventListener('focusin', function (ev) { spellFix(ev.target.closest ? (ev.target.closest(FREE_TEXT) || ev.target) : ev.target); }, true);   // también lo que se crea justo antes de escribir
    new MutationObserver(function () { clearTimeout(spellTimer); spellTimer = setTimeout(spellScan, 400); }).observe(document.documentElement, {childList: true, subtree: true});
    spellScan();

    /* ---------------- Cierre de sesión por inactividad ----------------
       El servidor no puede saberlo: mientras haya una pestaña abierta, las consultas automáticas (avisos, listas en vivo) mantienen el acceso «activo».
       Por eso se mide la actividad REAL de la persona (mouse, teclado, toque, desplazamiento), compartida entre pestañas, y al cumplirse el tiempo
       se avisa 60 s antes y se cierra la sesión. Tiempo en minutos: ajuste crmhubIdleMinutes (0 = sin cierre automático). */
    var IDLE_KEY = 'ch-activity', IDLE_OUT = 'ch-idle-out', idleOn = false, idleLast = Date.now(), idleWritten = 0, idleWarn = null;
    function idleTouch() {
        idleLast = Date.now();
        if (idleLast - idleWritten > 10000) { idleWritten = idleLast; lsSet(IDLE_KEY, String(idleLast)); }
        if (idleWarn) { idleHideWarn(); }
    }
    function idleSince() { return Date.now() - Math.max(idleLast, parseInt(lsGet(IDLE_KEY) || '0', 10) || 0); }
    function idleHideWarn() { if (idleWarn) { clearInterval(idleWarn.t); idleWarn.node.remove(); idleWarn = null; } }
    function idleLogout() {
        idleHideWarn();
        lsSet(IDLE_OUT, String(Date.now()));
        // se usa el mismo «Salir» del menú: así Espo anula el acceso en el servidor y limpia su estado; si no está, se descarta el acceso local y se recarga
        var out = document.querySelector('#navbar a[data-name="logout"]');
        if (out) { out.click(); } else { try { localStorage.removeItem('espo-user-auth'); } catch (e) { /* privado */ } location.reload(); }
    }
    function idleShowWarn(msLeft) {
        if (idleWarn) { return; }
        var node = el('<div class="ch-idle-back" role="alertdialog" aria-live="assertive"><div class="ch-idle-box"><span class="fas fa-hourglass-half ch-idle-ico"></span>' +
            '<h4>¿Sigues ahí?</h4><p>Por seguridad cerraremos tu sesión por inactividad en <b data-ch-idle-n></b> segundos.</p>' +
            '<button class="btn btn-primary" data-ch-idle-stay>Seguir conectado</button></div></div>');
        document.body.appendChild(node);
        idleWarn = {node: node, t: setInterval(function () {
            var left = Math.ceil((idleWarn ? idleWarn.end - Date.now() : 0) / 1000);
            var n = node.querySelector('[data-ch-idle-n]'); if (n) { n.textContent = Math.max(0, left); }
            if (left <= 0) { idleLogout(); }
        }, 500), end: Date.now() + msLeft};
        node.querySelector('[data-ch-idle-n]').textContent = Math.ceil(msLeft / 1000);
        node.querySelector('[data-ch-idle-stay]').addEventListener('click', idleTouch);
    }
    function startIdle(settings) {
        if (idleOn) { return; }
        var m = settings && settings.crmhubIdleMinutes;
        m = (m === undefined || m === null || m === '') ? 30 : Number(m);
        if (!(m > 0)) { return; }
        idleOn = true;
        var limit = m * 60000, warn = Math.min(60000, limit / 2);
        ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(function (ev) { document.addEventListener(ev, idleTouch, {passive: true, capture: true}); });
        idleTouch();
        setInterval(function () {
            if (!document.body.classList.contains('has-navbar')) { return; }
            var idle = idleSince();
            if (idle >= limit) { idleLogout(); }
            else if (idle >= limit - warn && !idleWarn) { idleShowWarn(limit - idle); }
            else if (idle < limit - warn && idleWarn) { idleHideWarn(); }   // hubo actividad en otra pestaña
        }, 5000);
    }
    // Tras cerrarse por inactividad, el login lo explica
    function idleNotice(login) {
        if (!login || document.getElementById('ch-idle-note')) { return; }
        var t = parseInt(lsGet(IDLE_OUT) || '0', 10);
        if (!t || Date.now() - t > 6 * 3600000) { return; }
        var box = login.querySelector('form') || login;
        box.insertBefore(el('<div id="ch-idle-note" class="ch-idle-note"><span class="fas fa-lock"></span> Cerramos tu sesión por inactividad. Ingresa de nuevo para continuar.</div>'), box.firstChild);
        try { localStorage.removeItem(IDLE_OUT); } catch (e) { /* privado */ }
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
    // Escritorio (Inicio) sin widgets: en vez de una pantalla en blanco, un aviso con las formas de empezar a armarlo
    function paintHomeEmpty() {
        var home = document.querySelector('.home-content');
        var old = home && home.querySelector(':scope > .ch-home-empty');
        var isHome = /^#?(Home)?$/.test(location.hash) || /^#Home\b/.test(location.hash);
        if (!home || !isHome) { if (old) { old.remove(); } return; }
        var grid = home.querySelector('.dashlets');
        var has = !!(grid && grid.querySelector('.grid-stack-item'));
        if (has) { if (old) { old.remove(); } return; }
        if (old || !grid || !window.ChEmpty) { return; }
        var box = document.createElement('div');
        box.className = 'ch-home-empty';
        box.innerHTML = window.ChEmpty.html({kind: 'box', title: 'Este escritorio está vacío', text: 'Añade widgets con la información que quieres ver al entrar (leads, tareas, actividad…) o arma tus propios reportes y tableros con gráficas.'}) +
            '<div class="ch-home-empty-act"><button type="button" class="btn btn-primary" data-ch-he="add"><span class="fas fa-plus"></span> Añadir un widget</button>' +
            '<a class="btn btn-default" href="#CrmHub/reportes"><span class="fas fa-chart-pie"></span> Crear un reporte o tablero</a>' +
            '<button type="button" class="btn btn-default" data-ch-he="edit"><span class="fas fa-pencil-alt"></span> Editar escritorio</button></div>';
        box.addEventListener('click', function (e) {
            var b = e.target.closest('[data-ch-he]'); if (!b) { return; }
            var a = document.querySelector('.dashboard-buttons [data-action="' + (b.dataset.chHe === 'add' ? 'addDashlet' : 'editTabs') + '"]');
            if (a) { a.click(); }
        });
        grid.insertAdjacentElement('afterend', box);
    }

    // «Añadir widget»: en vez de una lista de nombres, tarjetas con un dibujo que representa lo que se verá y una descripción
    var WG = {
        Calendar: ['calendar', '#4f63e8', 'Tu agenda por mes, semana o día con reuniones, llamadas y tareas.'],
        SalesPipeline: ['funnel', '#8b5cf6', 'Cuánto vale tu embudo: el valor de las oportunidades en cada etapa.'],
        Stream: ['stream', '#0ea5e9', 'Lo último que pasa en tus registros y en los que sigues.'],
        Iframe: ['window', '#64748b', 'Muestra una página web dentro de tu escritorio.'],
        Records: ['list', '#4f63e8', 'Lista de los registros que elijas (leads, cuentas, oportunidades…) con tus filtros.'],
        Emails: ['inbox', '#f59e0b', 'Tus últimos correos recibidos.'],
        Calls: ['list', '#2fa36b', 'Tus llamadas próximas y recientes.'],
        Opportunities: ['list', '#8b5cf6', 'Tus oportunidades abiertas.'],
        Leads: ['list', '#4f63e8', 'Tus leads más recientes.'],
        Activities: ['stream', '#14b8a6', 'Tus próximas reuniones, llamadas y tareas.'],
        Meetings: ['calendar', '#14b8a6', 'Tus próximas reuniones.'],
        Tasks: ['check', '#f59e0b', 'Tus tareas pendientes.'],
        Cases: ['list', '#ef5b5b', 'Tus tickets abiertos.'],
        Memo: ['note', '#f59e0b', 'Un bloc de notas para escribir recordatorios.'],
        OpportunitiesByStage: ['bars', '#8b5cf6', 'Gráfica de barras: oportunidades por etapa.'],
        OpportunitiesByLeadSource: ['donut', '#0ea5e9', 'Gráfica de anillo: de dónde llegan tus oportunidades.'],
        CrmHubPanel: ['kpis', '#4f63e8', 'Indicadores de captación y cartera con embudo, origen y desempeño por asesor.']
    };
    function wgArt(t, c) {
        var bar = function (x, h) { return '<rect x="' + x + '" y="' + (62 - h) + '" width="12" height="' + h + '" rx="2" fill="' + c + '"/>'; };
        var body = {
            list: [0, 1, 2, 3].map(function (i) { return '<circle cx="18" cy="' + (18 + i * 14) + '" r="4" fill="' + c + '"/><rect x="28" y="' + (15 + i * 14) + '" width="' + (70 - i * 8) + '" height="6" rx="3" fill="' + c + '" opacity=".35"/>'; }).join(''),
            check: [0, 1, 2].map(function (i) { return '<rect x="14" y="' + (13 + i * 17) + '" width="11" height="11" rx="3" fill="none" stroke="' + c + '" stroke-width="2"/>' + (i < 2 ? '<path d="M17 ' + (19 + i * 17) + 'l3 3 5-6" stroke="' + c + '" stroke-width="2" fill="none"/>' : '') + '<rect x="32" y="' + (16 + i * 17) + '" width="' + (74 - i * 10) + '" height="6" rx="3" fill="' + c + '" opacity=".35"/>'; }).join(''),
            calendar: '<rect x="14" y="10" width="92" height="56" rx="6" fill="none" stroke="' + c + '" stroke-width="2"/><rect x="14" y="10" width="92" height="14" rx="6" fill="' + c + '"/>' + [0, 1, 2, 3, 4].map(function (i) { return [0, 1].map(function (j) { return '<rect x="' + (22 + i * 17) + '" y="' + (31 + j * 15) + '" width="11" height="9" rx="2" fill="' + c + '" opacity="' + ((i + j) % 3 === 0 ? 1 : .3) + '"/>'; }).join(''); }).join(''),
            bars: bar(20, 22) + bar(40, 38) + bar(60, 30) + bar(80, 46),
            donut: '<circle cx="60" cy="38" r="22" fill="none" stroke="' + c + '" stroke-opacity=".25" stroke-width="12"/><path d="M60 16a22 22 0 0 1 21 28" fill="none" stroke="' + c + '" stroke-width="12"/><path d="M82 46a22 22 0 0 1-20 14" fill="none" stroke="#f59e0b" stroke-width="12"/>',
            funnel: '<path d="M16 12h88l-14 16H30z" fill="' + c + '"/><path d="M30 32h60l-10 14H40z" fill="' + c + '" opacity=".65"/><path d="M40 50h40l-8 14H48z" fill="' + c + '" opacity=".4"/>',
            stream: [0, 1, 2].map(function (i) { return '<circle cx="20" cy="' + (16 + i * 20) + '" r="5" fill="' + c + '"/><rect x="32" y="' + (11 + i * 20) + '" width="' + (66 - i * 8) + '" height="7" rx="3" fill="' + c + '" opacity=".4"/><rect x="32" y="' + (22 + i * 20) + '" width="' + (46 - i * 6) + '" height="5" rx="2.5" fill="' + c + '" opacity=".22"/>'; }).join('') + '<path d="M20 22v14M20 42v14" stroke="' + c + '" stroke-opacity=".3" stroke-width="2"/>',
            kpis: [0, 1, 2].map(function (i) { return '<rect x="' + (10 + i * 34) + '" y="10" width="30" height="22" rx="4" fill="' + c + '" opacity="' + (1 - i * .25) + '"/>'; }).join('') + bar(18, 18) + bar(38, 26) + bar(58, 14) + bar(78, 22),
            inbox: '<rect x="14" y="14" width="92" height="50" rx="6" fill="none" stroke="' + c + '" stroke-width="2"/><path d="M14 22l46 22 46-22" fill="none" stroke="' + c + '" stroke-width="2"/>',
            note: '<rect x="22" y="8" width="76" height="60" rx="5" fill="' + c + '" opacity=".2"/>' + [0, 1, 2, 3].map(function (i) { return '<rect x="32" y="' + (20 + i * 11) + '" width="' + (56 - (i % 2) * 14) + '" height="5" rx="2.5" fill="' + c + '"/>'; }).join(''),
            window: '<rect x="14" y="10" width="92" height="56" rx="6" fill="none" stroke="' + c + '" stroke-width="2"/><path d="M14 24h92" stroke="' + c + '" stroke-width="2"/><circle cx="22" cy="17" r="2.5" fill="' + c + '"/><circle cx="30" cy="17" r="2.5" fill="' + c + '" opacity=".6"/>'
        }[t] || '';
        return '<svg viewBox="0 0 120 76" width="100%" height="76" aria-hidden="true">' + body + '</svg>';
    }
    function decorateWidgets() {
        var lists = document.querySelectorAll('.modal .array-add-list-group:not([data-ch-wg])');
        for (var i = 0; i < lists.length; i++) {
            var ul = lists[i], items = ul.querySelectorAll('li[data-name]');
            if (!items.length || !ul.querySelector('li[data-name="Records"], li[data-name="Stream"], li[data-name="Calendar"], li[data-name="CrmHubPanel"]')) { continue; }   // solo la lista de widgets del escritorio
            ul.setAttribute('data-ch-wg', '1'); ul.classList.add('ch-wg-grid');
            for (var j = 0; j < items.length; j++) {
                var li = items[j], d = WG[li.getAttribute('data-name')] || ['list', '#64748b', 'Widget del escritorio.'];
                li.insertAdjacentHTML('afterbegin', '<div class="ch-wg-ill" style="background:' + d[1] + '14">' + wgArt(d[0], d[1]) + '</div>');
                li.insertAdjacentHTML('beforeend', '<small class="ch-wg-desc">' + d[2] + '</small>');
            }
        }
    }

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
            pending = false; swapStylesheet(resolved()); ensureTools(); colorizeMenu(); syncSticky(); checkReadOnly(); paintBrand(); paintFavicon(); decorateEmpty(); paintHomeEmpty(); decorateWidgets(); dtScan(document); if (window.ChSplit) { window.ChSplit.reconcile(); }
            // EspoCRM reconstruye <body> al arrancar y puede borrar los avisos: se vuelven a poner mientras sigan vigentes
            if (!online && !document.getElementById('ch-net')) { banner('ch-net', 'ch-banner-warn', OFFLINE_HTML); }
        });
    }
    new MutationObserver(onDom).observe(root, {childList: true, subtree: true});


    function ready() { injectPwaHead(); onDom(); startWorker(); }
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', ready); } else { ready(); }
})();
