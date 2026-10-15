/**
 * Videollamada dentro del CRM como panel lateral (igual que la ficha del lead): la sala (https://meet.<dominio>/…) se abre a la derecha, junto al tablero,
 * y NO se cierra al cambiar de ficha, de lista o de página: el asesor conserva la información del cliente y puede seguir trabajando sin colgar.
 * El asesor decide cómo verla: panel lateral, pantalla completa, minimizada (la llamada sigue en una barrita) o en una pestaña nueva; la X es la única que sale de la llamada.
 * Se acopla con custom:split (tipo 'call') para que el contenido deje su espacio. La sala avisa al salir (postMessage) y el panel se cierra.
 */
define('custom:call-dock', ['custom:split', 'custom:ui'], function (Split, ChUi) {
    let el = null, mode = 'side', url = '', timer = null, t0 = 0, title = '', counted = false, people = [], links = {}, card = null, popTimer = null;
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


    // ---- participantes de la llamada con su ficha del CRM
    const codeOf = () => { try { return new URL(url).pathname.replace(/^\//, ''); } catch (e) { return ''; } };
    const refOf = p => links[p.id] || (p.ref && p.ref.l ? {s: p.ref.s || 'Lead', l: p.ref.l} : null);

    function paintPeople() {
        const box = el && el.querySelector('.ch-dock-people'); if (!box) { return; }
        const others = people.filter(p => !p.me);
        box.classList.toggle('hide', !others.length);
        box.innerHTML = '<span class="ch-dp-t">En la llamada:</span>' + others.map(p => {
            const r = refOf(p), ic = p.host ? 'fa-user-tie' : r ? 'fa-address-card' : 'fa-user';
            return `<button class="ch-dp ${r ? 'lk' : ''}" data-p="${ChUi.esc(p.id)}" title="${r ? 'Ver la información del CRM' : 'Sin ficha: pulsa para vincularlo con un lead'}"><span class="fas ${ic}"></span> ${ChUi.esc(p.name)}${p.hand ? ' ✋' : ''}</button>`;
        }).join('');
    }

    const isHost = () => /[?&]h=/.test(url);
    const ctl = p => isHost() ? `<div class="ch-dc-a ch-dc-ctl"><button class="btn btn-default btn-xs" data-cmd="mute"><span class="fas fa-microphone-slash"></span> Silenciar</button> <button class="btn btn-danger btn-xs" data-cmd="remove"><span class="fas fa-user-slash"></span> Sacar de la llamada</button></div>` : '';
    function sendCmd(cmd, p) { const f = el && el.querySelector('iframe'); if (f && f.contentWindow) { f.contentWindow.postMessage({k: 'ch-cmd', cmd, id: p.id, name: p.name}, '*'); } }
    function wireCtl(p) { card.querySelectorAll('[data-cmd]').forEach(b => { b.onclick = e => { e.stopPropagation(); sendCmd(b.dataset.cmd, p); if (b.dataset.cmd === 'remove') { closeCard(); } }; }); }

    function closeCard() { if (card) { card.remove(); card = null; } }

    // tarjeta con los datos del cliente (o buscador para vincular a quien no tiene ficha); se abre sobre el panel de la llamada
    function openCard(pid, anchor) {
        closeCard();
        const p = people.find(x => x.id === pid); if (!p) { return; }
        card = document.createElement('div'); card.className = 'ch-dock-card';
        el.appendChild(card);
        const r = refOf(p);
        if (!r) { return linkSearch(p); }
        card.innerHTML = '<span class="spin">Cargando…</span>';
        Espo.Ajax.getRequest(r.s + '/' + r.l, {select: 'name,phoneNumber,emailAddress,status,stage,assignedUserName,source,accountName'}).then(d => {
            if (!card) { return; }
            const row = (ic, v) => v ? `<div class="ch-dc-r"><span class="${ic}"></span>${ChUi.esc(v)}</div>` : '';
            card.innerHTML = `<div class="ch-dc-h"><b>${ChUi.esc(d.name || p.name)}</b><button data-x title="Cerrar">✕</button></div>` + row('fas fa-flag', d.status || d.stage) + row('fas fa-phone', d.phoneNumber) + row('fas fa-envelope', d.emailAddress) + row('fas fa-building', d.accountName) + row('fas fa-user', d.assignedUserName ? 'Asignado a ' + d.assignedUserName : '') + row('fas fa-tag', d.source) +
                `<div class="ch-dc-a"><button class="btn btn-primary btn-xs" data-open>Abrir la ficha</button> <button class="btn btn-default btn-xs" data-unlink>Cambiar</button></div>` + ctl(p);
            wireCtl(p);
            card.onclick = e => {
                if (e.target.closest('[data-x]')) { closeCard(); }
                else if (e.target.closest('[data-open]')) { window.location.hash = '#' + r.s + '/view/' + r.l; closeCard(); }   // la llamada sigue: el panel no se destruye al navegar
                else if (e.target.closest('[data-unlink]')) { delete links[p.id]; linkSearch(p); }
            };
        }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } if (card) { card.innerHTML = '<div class="ch-dc-h"><b>' + ChUi.esc(p.name) + '</b><button data-x>✕</button></div><div class="ch-dc-r">No tienes acceso a esa ficha.</div>'; card.onclick = () => closeCard(); } });
    }

    function linkSearch(p) {
        if (!card) { return; }
        card.innerHTML = `<div class="ch-dc-h"><b>${ChUi.esc(p.name)}</b><button data-x>✕</button></div><div class="ch-dc-r">Sin ficha del CRM. Búscalo para ver su información:</div><input class="form-control input-sm" data-q placeholder="Nombre, teléfono o correo" autocomplete="off"><div data-res></div>` + ctl(p);
        wireCtl(p);
        const inp = card.querySelector('[data-q]'), res = card.querySelector('[data-res]'); inp.focus();
        let tm = null;
        inp.oninput = () => { clearTimeout(tm); tm = setTimeout(() => search(inp.value.trim(), res, hit => { links[p.id] = hit; paintPeople(); openCard(p.id); }), 300); };
        card.onclick = e => { if (e.target.closest('[data-x]')) { closeCard(); } };
    }

    // busca leads y contactos del CRM por texto (nombre, teléfono o correo)
    function search(q, box, pick, extra) {
        if (q.length < 2) { box.innerHTML = ''; return; }
        const get = sc => Espo.Ajax.getRequest(sc, {maxSize: 6, select: 'name,phoneNumber,emailAddress', where: [{type: 'textFilter', value: q}]}).then(r => (r.list || []).map(x => Object.assign({s: sc}, x))).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } return []; });
        Promise.all([get('Lead'), get('Contact')]).then(([a, b]) => {
            const items = a.concat(b); if (!card && !extra) { return; }
            box.innerHTML = items.map((x, i) => `<div class="ch-dc-hit" data-i="${i}"><span class="fas ${x.s === 'Lead' ? 'fa-address-card' : 'fa-user'}"></span><div><b>${ChUi.esc(x.name)}</b><small>${ChUi.esc([x.s === 'Lead' ? 'Lead' : 'Contacto', x.phoneNumber, x.emailAddress].filter(Boolean).join(' · '))}</small></div></div>`).join('') || '<div class="ch-dc-r">Sin resultados.</div>';
            box.onclick = e => { const h = e.target.closest('.ch-dc-hit'); if (h) { const x = items[+h.dataset.i]; pick({s: x.s, l: x.id, name: x.name, phone: x.phoneNumber, email: x.emailAddress}); } };
        });
    }

    // invitar a una persona del CRM a la llamada en curso: su enlace propio la liga a su ficha; se envía por WhatsApp, SMS o correo, o se copia
    function invitePanel() {
        const code = codeOf(); if (!code) { return; }
        ChUi.panel({title: 'Invitar a la llamada desde el CRM', icon: 'fas fa-user-plus', mount: body => {
            body.innerHTML = '<p class="ch-muted">Busca un lead o contacto. Su enlace es personal: entra ya identificado y tú lo ves con su información del CRM. Cada persona espera tu admisión.</p><input class="form-control" data-q placeholder="Nombre, teléfono o correo" autocomplete="off"><div data-res style="margin-top:8px"></div><div data-sel></div>';
            const inp = body.querySelector('[data-q]'), res = body.querySelector('[data-res]'), sel = body.querySelector('[data-sel]'); let tm = null;
            inp.oninput = () => { clearTimeout(tm); tm = setTimeout(() => search(inp.value.trim(), res, pick, true), 300); };
            const say = (m) => { sel.querySelector('[data-m]').textContent = m; };
            function pick(x) {
                res.innerHTML = ''; inp.value = '';
                sel.innerHTML = `<div class="ch-dc-r"><b>${ChUi.esc(x.name)}</b></div><div class="ch-dc-a" data-b></div><div class="ch-muted" data-m>Creando su enlace…</div>`;
                Espo.Ajax.postRequest('CrmHub/meet/invitee', {code, scope: x.s, recId: x.l, name: x.name}).then(r => {
                    const text = 'Hola ' + (x.name.split(' ')[0] || '') + ', te invito a nuestra videollamada: ' + r.url + ' . Ábrelo desde tu celular o computador.';
                    const b = sel.querySelector('[data-b]');
                    b.innerHTML = '<button class="btn btn-default btn-sm" data-c="copy"><span class="far fa-copy"></span> Copiar enlace</button> ' + (x.s === 'Lead' && x.phone ? '<button class="btn btn-default btn-sm" data-c="wa"><span class="fab fa-whatsapp"></span> WhatsApp</button> <button class="btn btn-default btn-sm" data-c="sms"><span class="fas fa-comment-sms"></span> SMS</button> ' : '') + (x.email ? '<button class="btn btn-default btn-sm" data-c="mail"><span class="fas fa-envelope"></span> Correo</button>' : '');
                    say('Enlace listo.');
                    b.onclick = e => {
                        const c = e.target.closest('[data-c]'); if (!c) { return; } const k = c.dataset.c, ok = () => { say('Enviado.'); }, bad = xhr => { const w = xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason'); say(w || 'No se pudo enviar.'); if (xhr) { xhr.errorIsHandled = true; } };
                        if (k === 'copy') { (navigator.clipboard ? navigator.clipboard.writeText(r.url) : Promise.reject()).then(() => say('Enlace copiado.'), () => say(r.url)); }
                        else if (k === 'wa') { Espo.Ajax.postRequest('CrmHub/whatsapp/send', {leadId: x.l, phone: x.phone, text}).then(ok).catch(bad); }
                        else if (k === 'sms') { Espo.Ajax.postRequest('CrmHub/sms/send', {leadId: x.l, phone: x.phone, text}).then(ok).catch(bad); }
                        else { Espo.loader.require('custom:mail-send', Mail => { const u = ChUi.esc(r.url); Mail.send({to: [x.email], subject: 'Invitación a nuestra videollamada', body: `<p>Hola ${ChUi.esc(x.name.split(' ')[0] || '')},</p><p>Te invito a nuestra videollamada:</p><p><a href="${u}">${u}</a></p><p>Ábrelo desde tu celular o computador; no necesitas instalar nada.</p>`, parentType: x.s, parentId: x.l}).then(ok).catch(bad); }); }
                    };
                }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } say('No se pudo crear el enlace.'); });
            }
        }});
    }

    const API = {
        active: () => !!el,
        mode: () => mode,
        // entra a la sala dentro del CRM; si ya hay una videollamada abierta en otra sala, pregunta antes de cambiarla
        open(u, name) {
            if (el && roomOf(u) === roomOf(url)) { setMode('side'); return; }
            if (el && !window.confirm('Ya estás en una videollamada. ¿Salir de ella y entrar a esta?')) { return; }
            API.close();
            url = u; title = name || 'Videollamada'; t0 = Date.now(); people = []; links = {};
            el = document.createElement('div'); el.id = 'ch-dock';
            el.innerHTML = `<div class="ch-dock-h"><span class="fas fa-video"></span><b>${esc(title)}</b><small data-d="time">0:00</small><span style="flex:1"></span>` +
                '<button type="button" data-d="inv" title="Invitar a la llamada a alguien del CRM"><span class="fas fa-user-plus"></span></button>' +
                '<button type="button" data-d="tab" title="Pasar la llamada a otra ventana (sin cortarla)"><span class="fas fa-up-right-from-square"></span></button>' +
                '<button type="button" data-d="min" title="Minimizar (la llamada sigue)"><span class="fas fa-minus"></span></button>' +
                '<button type="button" data-d="size" title="Pantalla completa"><span class="fas fa-expand"></span></button>' +
                '<button type="button" data-d="end" title="Salir de la videollamada"><span class="fas fa-xmark"></span></button></div>' +
                '<div class="ch-dock-people hide"></div>' +
                `<iframe title="Videollamada" allow="camera; microphone; display-capture; autoplay; fullscreen; clipboard-write" src="${esc(u)}"></iframe>` +
                `<div class="ch-dock-pill-bar"><span class="fas fa-video"></span><b>${esc(title)}</b><small data-d="time">0:00</small></div>`;
            document.body.appendChild(el); counted = false; setMode('side');
            el.addEventListener('click', e => {
                const pp = e.target.closest('[data-p]'); if (pp) { openCard(pp.dataset.p, pp); return; }
                const b = e.target.closest('[data-d]');
                if (!b) { if (e.target.closest('.ch-dock-pill-bar')) { setMode('side'); } return; }
                const k = b.dataset.d;
                if (k === 'end') { if (window.confirm('¿Salir de la videollamada? Si el cliente sigue dentro, podrás volver a entrar desde la ficha («Videollamadas»).')) { API.close(); } }
                else if (k === 'min') { setMode(mode === 'pill' ? 'side' : 'pill'); }
                else if (k === 'size') { setMode(mode === 'full' ? 'side' : 'full'); }
                else if (k === 'inv') { invitePanel(); }
                else if (k === 'tab') { API.popOut(); }
            });
            clearInterval(timer); timer = setInterval(tick, 1000);
        },
        // pasa la llamada a otra ventana (otro monitor) sin cortarla: la ventana nueva entra sola y, cuando ya está conectada, este panel se cierra
        popOut() {
            if (!el) { return; }
            const u = url + (url.indexOf('?') < 0 ? '?' : '&') + 'auto=1', w = window.open(u, 'chcall', 'popup=yes,width=1100,height=760');
            if (!w) { Espo.Ui.warning('El navegador bloqueó la ventana nueva. Permite las ventanas emergentes para este sitio.'); return; }
            Espo.Ui.notify('Abriendo la llamada en otra ventana… no cuelgues.');
            clearTimeout(popTimer); popTimer = setTimeout(() => { Espo.Ui.notify(false); Espo.Ui.warning('La otra ventana no se conectó; la llamada sigue aquí.'); }, 25000);
        },
        close() {
            clearInterval(timer); clearTimeout(popTimer); closeCard(); people = []; links = {};
            if (counted) { counted = false; Split.close('call'); }
            if (el) { el.remove(); el = null; url = ''; }
        },
    };
    // la sala avisa cuando la persona sale de la videollamada: el panel se cierra solo
    window.addEventListener('message', e => {
        const d = e.data; if (!el || !d || d.k !== 'ch-meet') { return; }
        if (d.ev === 'left') { setTimeout(() => API.close(), 1200); }
        else if (d.ev === 'people') { people = d.people || []; if (d.started) { t0 = d.started; tick(); } paintPeople(); }
        else if (d.ev === 'popout-ready') { clearTimeout(popTimer); Espo.Ui.notify(false); Espo.Ui.success('La llamada continúa en la otra ventana.'); API.close(); }   // la otra ventana ya está conectada
    });
    window.ChCallDock = API;
    return API;
});
