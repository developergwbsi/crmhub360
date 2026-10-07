/* Crm Hub 360 - service worker.
 * - Archivos de la app (/client/*): cache primero (la URL lleva ?r=<versión>, así que se renuevan solos).
 * - API (GET): red primero; sin conexión responde con la última copia guardada de ESE usuario (solo lectura).
 * - Escrituras sin conexión: respuesta 503 «Sin conexión» (no se encolan, para no pisar datos).
 * - Nunca se guardan: integraciones/tokens, adjuntos, administración. */
'use strict';

const STATIC = 'crmhub-static';
const PAGES = 'crmhub-pages';
const API = 'crmhub-api';
const META = 'crmhub-meta';
const API_MAX = 500;
const NO_CACHE_API = /\/api\/v1\/(CrmHub\/(integrations|whatsapp|call)|Attachment|Admin|Authentication|Auth|AuthToken|ExternalAccount|Integration|Extension)/i;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('message', e => {
    const d = e.data || {};
    if (d.type === 'version') { e.waitUntil(onVersion(d.version)); }
    if (d.type === 'clear') { e.waitUntil(clearAll()); }
    if (d.type === 'notify-update') {
        e.waitUntil(self.registration.showNotification('Crm Hub 360 — nueva versión', {
            body: 'Hay una versión nueva disponible. Toca para actualizar.',
            icon: '/client/custom/img/pwa-192.png', badge: '/client/custom/img/pwa-192.png',
            tag: 'crmhub-update', renotify: false, requireInteraction: true, data: {version: d.version},
        }));
    }
});

self.addEventListener('push', e => {
    let d = {};
    try { d = e.data ? e.data.json() : {}; } catch (err) { d = {body: e.data && e.data.text()}; }
    e.waitUntil(self.registration.showNotification(d.title || 'Crm Hub 360', {
        body: d.body || '', icon: '/client/custom/img/pwa-192.png', badge: '/client/custom/img/pwa-192.png',
        tag: d.tag || 'crmhub', renotify: false, requireInteraction: d.type === 'update', data: {url: d.url || '/', type: d.type || ''},
    }));
});

self.addEventListener('notificationclick', e => {
    e.notification.close();
    const d = e.notification.data || {};
    e.waitUntil((async () => {
        const all = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
        let c = all[0];
        if (c) { if (c.focus) { await c.focus(); } } else { c = await self.clients.openWindow(d.url || '/'); }
        if (c && c.postMessage) { c.postMessage(d.type === 'update' ? {type: 'apply-update'} : {type: 'goto', url: d.url}); }
    })());
});

async function onVersion(version) {
    const meta = await caches.open(META);
    const prev = await meta.match('version').then(r => r && r.text());
    if (prev && prev !== version) { await caches.delete(STATIC); await caches.delete(PAGES); }
    await meta.put('version', new Response(version));
}

async function clearAll() {
    for (const n of [STATIC, PAGES, API, META]) { await caches.delete(n); }
}

self.addEventListener('fetch', e => {
    const req = e.request, url = new URL(req.url);
    if (url.origin !== location.origin) { return; }
    const p = url.pathname;
    if (p === '/client/custom/sw.js' || p === '/client/custom/version.json' || p.startsWith('/hub/')) { return; }
    if (p.startsWith('/api/')) { e.respondWith(handleApi(req, url)); return; }
    if (req.mode === 'navigate') { e.respondWith(handleNavigate(req, url)); return; }
    if (req.method === 'GET' && p.startsWith('/client/custom/')) { e.respondWith(networkFirst(req)); return; }   // nuestro código: siempre lo último
    if (req.method === 'GET' && p.startsWith('/client/')) { e.respondWith(cacheFirst(req)); }
});

// Archivos propios (/client/custom/*): la URL no cambia entre despliegues, así que se pide a la red y la copia solo sirve sin conexión.
async function networkFirst(req) {
    const cache = await caches.open(STATIC);
    try {
        const res = await withTimeout(fetch(req), 4000);
        if (res.ok) { cache.put(req, res.clone()); }
        return res;
    } catch (err) {
        return (await cache.match(req)) || new Response('', {status: 504, statusText: 'Sin conexión'});
    }
}

async function cacheFirst(req) {
    const cache = await caches.open(STATIC);
    const hit = await cache.match(req);
    if (hit) { return hit; }
    try {
        const res = await fetch(req);
        if (res.ok) { cache.put(req, res.clone()); }
        return res;
    } catch (err) {
        return new Response('', {status: 504, statusText: 'Sin conexión'});
    }
}

async function handleNavigate(req, url) {
    const isRoot = url.pathname === '/' && !url.search;
    try {
        const res = await withTimeout(fetch(req), 8000);
        if (isRoot && res.ok) { (await caches.open(PAGES)).put('/', res.clone()); }
        return res;
    } catch (err) {
        const cached = isRoot ? await (await caches.open(PAGES)).match('/') : await (await caches.open(PAGES)).match('/');
        return cached || new Response('<h1>Sin conexión</h1><p>Abre Crm Hub 360 una vez con internet para poder usarlo sin conexión.</p>',
            {status: 503, headers: {'Content-Type': 'text/html; charset=utf-8'}});
    }
}

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

async function handleApi(req, url) {
    if (req.method !== 'GET') {
        try { return await fetch(req); }
        catch (err) { return offlineJson(); }
    }
    const cacheable = !NO_CACHE_API.test(url.pathname);
    const uid = hash((req.headers.get('Espo-Authorization') || '') + '|' + (req.headers.get('Authorization') || ''));
    const key = new Request(url.origin + url.pathname + (url.search ? url.search + '&' : '?') + '__u=' + uid);
    try {
        const res = await withTimeout(fetch(req), 7000);
        if (res.ok && cacheable) { const c = await caches.open(API); await c.put(key, res.clone()); trim(c); }
        return res;
    } catch (err) {
        if (cacheable) {
            const hit = await (await caches.open(API)).match(key);
            if (hit) {
                const h = new Headers(hit.headers); h.set('X-Crmhub-Offline', '1');
                return new Response(await hit.blob(), {status: 200, headers: h});
            }
        }
        return offlineJson();
    }
}

function offlineJson() {
    return new Response(JSON.stringify({message: 'Sin conexión'}), {
        status: 503, headers: {'Content-Type': 'application/json', 'X-Status-Reason': 'Sin conexion: este dato no esta guardado en el dispositivo', 'X-Crmhub-Offline': '1'},
    });
}

async function trim(cache) {
    const keys = await cache.keys();
    if (keys.length > API_MAX) { for (const k of keys.slice(0, keys.length - API_MAX + 50)) { await cache.delete(k); } }
}

function withTimeout(p, ms) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), ms);
        p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
    });
}
