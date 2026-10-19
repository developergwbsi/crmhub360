/**
 * Grabación de pantalla del CRM (para capacitaciones y explicaciones). El navegador pide qué compartir (pestaña, ventana o pantalla), graba con MediaRecorder y sube el video
 * por partes al Hub (llave de corta vida entregada por POST CrmHub/recStart); al terminar queda en «Grabaciones». Opciones: grabar el audio de la pestaña/sistema y/o el micrófono;
 * por defecto las dos desactivadas (sin audio). La barra flotante con tiempo, pausa y detener sigue visible al cambiar de página dentro del CRM.
 */
define('custom:recorder', ['custom:ui'], function (ChUi) {
    const esc = ChUi.esc;
    const MIMES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    let S = null;   // grabación en curso

    const supported = () => !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia && window.MediaRecorder);
    const pickMime = () => MIMES.find(m => { try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; } }) || '';
    const fmtT = s => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(r).padStart(2, '0'); };

    function toast(html, ms) {
        const d = document.createElement('div'); d.className = 'ch-rec-toast'; d.innerHTML = html; document.body.appendChild(d);
        requestAnimationFrame(() => d.classList.add('in')); setTimeout(() => { d.classList.remove('in'); setTimeout(() => d.remove(), 300); }, ms || 6000); return d;
    }

    function dialog() {
        return new Promise(resolve => {
            const back = document.createElement('div'); back.className = 'ch-dlg-back'; const box = document.createElement('div'); box.className = 'ch-dlg ch-rec-dlg'; back.appendChild(box); document.body.appendChild(back);
            const close = v => { document.removeEventListener('keydown', onKey, true); back.remove(); resolve(v); };
            const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } };
            document.addEventListener('keydown', onKey, true); back.addEventListener('mousedown', e => { if (e.target === back) { close(null); } });
            box.innerHTML = '<div class="ch-dlg-head"><span class="ch-dlg-ic fas fa-circle-dot" style="color:#e5484d"></span><h4>Grabar pantalla</h4></div>' +
                '<div class="ch-dlg-body"><p class="ch-muted" style="margin-top:0">El navegador te preguntará qué compartir: <b>esta pestaña</b>, una ventana o toda la pantalla. La grabación queda en <b>Grabaciones</b>, donde puedes verla, descargarla o compartirla.</p>' +
                '<label class="ch-dlg-label">Título (opcional)</label><input class="form-control" data-f="title" maxlength="120" placeholder="Ej.: Cómo crear un reporte">' +
                '<div class="ch-rec-opts"><label><input type="checkbox" data-f="sys"> <span class="fas fa-volume-high"></span> Grabar el <b>audio de la pestaña o del sistema</b> <small>(en el selector del navegador marca «compartir audio»)</small></label>' +
                '<label><input type="checkbox" data-f="mic"> <span class="fas fa-microphone"></span> Grabar mi <b>micrófono</b> <small>(para explicar mientras grabas)</small></label></div>' +
                '<div class="ch-dlg-hint">Por defecto se graba sin audio. Se ve solo lo que compartas; el resto del navegador no se graba.</div></div>' +
                '<div class="ch-dlg-foot"><button type="button" class="btn btn-default" data-a="no">Cancelar</button><button type="button" class="btn btn-danger" data-a="go"><span class="fas fa-circle"></span> Empezar a grabar</button></div>';
            const q = s => box.querySelector(s);
            q('[data-a="no"]').onclick = () => close(null);
            q('[data-a="go"]').onclick = () => close({title: q('[data-f="title"]').value.trim(), sys: q('[data-f="sys"]').checked, mic: q('[data-f="mic"]').checked});
            requestAnimationFrame(() => { back.classList.add('in'); q('[data-f="title"]').focus(); });
        });
    }

    function bar() {
        let b = document.getElementById('ch-recbar');
        if (!b) {
            b = document.createElement('div'); b.id = 'ch-recbar';
            b.innerHTML = '<span class="ch-rb-dot"></span><b class="ch-rb-t">0:00</b><span class="ch-rb-s"></span><button type="button" data-a="pause" title="Pausar"><span class="fas fa-pause"></span></button><button type="button" data-a="stop" class="stop"><span class="fas fa-stop"></span> Detener</button>';
            document.body.appendChild(b);
            b.onclick = e => { const a = e.target.closest('button'); if (!a || !S) { return; } if (a.dataset.a === 'stop') { stop(); } else { pauseToggle(); } };
        }
        return b;
    }

    function tick() {
        if (!S) { return; }
        const b = document.getElementById('ch-recbar'); if (!b) { return; }
        const el = (S.paused ? S.acc : S.acc + (Date.now() - S.t0)) / 1000;
        b.querySelector('.ch-rb-t').textContent = fmtT(el);
        b.querySelector('.ch-rb-s').textContent = S.failed ? 'Sin conexión: reintentando…' : (S.paused ? 'En pausa' : (S.queue.length > 6 ? 'Subiendo…' : ''));
        b.classList.toggle('paused', !!S.paused);
        const bt = b.querySelector('[data-a="pause"]'); bt.innerHTML = S.paused ? '<span class="fas fa-play"></span>' : '<span class="fas fa-pause"></span>'; bt.title = S.paused ? 'Reanudar' : 'Pausar';
    }

    function pauseToggle() {
        if (!S || !S.mr) { return; }
        if (S.paused) { S.mr.resume(); S.t0 = Date.now(); S.paused = false; } else { S.mr.pause(); S.acc += Date.now() - S.t0; S.paused = true; }
        tick();
    }

    // sube las partes en orden; si falla la red reintenta sin perder lo grabado
    async function pump() {
        if (!S || S.pumping) { return; } S.pumping = true;
        while (S && S.queue.length) {
            const blob = S.queue[0];
            try {
                const r = await fetch(S.up.url + '/chunk?seq=' + S.seq, {method: 'POST', headers: {'X-Rec-Key': S.up.key, 'Content-Type': 'application/octet-stream'}, body: blob});
                if (r.status === 422 || r.status === 403 || r.status === 404) { S.dead = true; break; }
                if (!r.ok) { throw new Error('http ' + r.status); }
                S.queue.shift(); S.seq++; S.failed = false;
            } catch (e) { S.failed = true; await new Promise(res => setTimeout(res, 3000)); }
        }
        if (S) { S.pumping = false; }
    }

    function cleanup(s) {
        clearInterval(s.timer); window.removeEventListener('beforeunload', warn);
        [s.display, s.micStream].forEach(st => st && st.getTracks().forEach(t => { try { t.stop(); } catch (e) { /* nada */ } }));
        try { s.ctx && s.ctx.close(); } catch (e) { /* nada */ }
        const b = document.getElementById('ch-recbar'); if (b) { b.remove(); }
        document.documentElement.classList.remove('ch-recording');
        document.querySelectorAll('[data-ch-rec]').forEach(a => a.classList.remove('on'));
    }
    const warn = e => { if (S) { e.preventDefault(); e.returnValue = ''; } };

    async function stop() {
        const s = S; if (!s || s.stopping) { return; } s.stopping = true;
        if (!s.paused) { s.acc += Date.now() - s.t0; }
        const b = document.getElementById('ch-recbar'); if (b) { b.querySelector('.ch-rb-s').textContent = 'Guardando…'; b.querySelectorAll('button').forEach(x => { x.disabled = true; }); }
        await new Promise(res => { s.mr.onstop = res; try { s.mr.stop(); } catch (e) { res(); } });
        let guard = 0;
        while (S && (S.queue.length || S.pumping) && !S.dead && guard++ < 1200) { await new Promise(res => setTimeout(res, 300)); }
        const secs = Math.round(s.acc / 1000);
        cleanup(s); S = null;
        try {
            const r = await fetch(s.up.url + '/finish', {method: 'POST', headers: {'X-Rec-Key': s.up.key, 'Content-Type': 'application/json'}, body: JSON.stringify({duration: secs})});
            const j = await r.json();
            if (j.ok) { toast('<span class="fas fa-circle-check" style="color:#2ea043"></span> Grabación guardada. <a href="#CrmHub/grabaciones">Verla en Grabaciones</a>', 9000); if (location.hash === '#CrmHub/grabaciones') { window.dispatchEvent(new Event('ch-rec-saved')); } }
            else { toast('La grabación quedó vacía y no se guardó.'); }
        } catch (e) { toast('No se pudo terminar de guardar la grabación. Revisa la conexión; lo subido hasta ahora queda en Grabaciones.', 9000); }
    }

    async function start(o) {
        const mime = pickMime();
        let display, micStream = null;
        try {
            display = await navigator.mediaDevices.getDisplayMedia({video: {frameRate: {ideal: 24, max: 30}}, audio: !!o.sys, preferCurrentTab: false, selfBrowserSurface: 'include', systemAudio: 'include'});
        } catch (e) { return false; }   // canceló el selector
        if (o.mic) {
            try { micStream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true}}); }
            catch (e) { toast('No pudimos usar el micrófono: la grabación seguirá sin tu voz. Revisa el permiso del navegador.', 7000); }
        }
        const sysTracks = display.getAudioTracks();
        if (o.sys && !sysTracks.length) { toast('No se compartió el audio de la pestaña: marca «compartir audio» en el selector del navegador. Se grabará sin ese audio.', 8000); }
        // audio de la pestaña y micrófono se mezclan en una sola pista
        const tracks = [];
        let ctx = null;
        const srcs = [sysTracks.length ? display : null, micStream].filter(Boolean);
        if (srcs.length) {
            ctx = new (window.AudioContext || window.webkitAudioContext)(); const dest = ctx.createMediaStreamDestination();
            srcs.forEach(st => { if (st.getAudioTracks().length) { ctx.createMediaStreamSource(new MediaStream(st.getAudioTracks())).connect(dest); } });
            dest.stream.getAudioTracks().forEach(t => tracks.push(t));
        }
        const out = new MediaStream([...display.getVideoTracks(), ...tracks]);
        let up;
        try {
            up = await Espo.Ajax.postRequest('CrmHub/recStart', {title: o.title, audio: tracks.length > 0, mime: mime.split(';')[0] || 'video/webm'});
        } catch (xhr) {
            if (xhr) { xhr.errorIsHandled = true; }
            display.getTracks().forEach(t => t.stop()); if (micStream) { micStream.getTracks().forEach(t => t.stop()); }
            const why = xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason');
            ChUi.notice({title: 'No se pudo empezar', icon: 'fas fa-triangle-exclamation', text: why || 'No pudimos preparar la grabación. Intenta de nuevo en un momento.'}); return false;
        }
        const mr = new MediaRecorder(out, mime ? {mimeType: mime, videoBitsPerSecond: 2500000, audioBitsPerSecond: 96000} : {});
        S = {mr, up, display, micStream, ctx, seq: 0, queue: [], acc: 0, t0: Date.now(), paused: false, timer: null};
        mr.ondataavailable = e => { if (S && e.data && e.data.size) { S.queue.push(e.data); pump(); } };
        mr.start(4000);
        display.getVideoTracks()[0].addEventListener('ended', () => stop());
        bar(); S.timer = setInterval(tick, 500); tick();
        document.documentElement.classList.add('ch-recording');
        document.querySelectorAll('[data-ch-rec]').forEach(a => a.classList.add('on'));
        window.addEventListener('beforeunload', warn);
        return true;
    }

    return {
        supported,
        active: () => !!S,
        // botón «Grabar pantalla» de la barra superior y de la página Grabaciones
        async open() {
            if (S) { toast('Ya hay una grabación en curso. Usa «Detener» en la barra roja para terminarla.'); return false; }
            if (!supported()) { ChUi.notice({title: 'Tu navegador no puede grabar pantalla', icon: 'fas fa-triangle-exclamation', text: 'Abre el CRM en Chrome, Edge o Firefox de escritorio actualizados para grabar la pantalla.'}); return false; }
            const o = await dialog(); if (!o) { return false; }
            return start(o);
        },
        stop,
    };
});
