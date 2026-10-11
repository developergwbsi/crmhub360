/**
 * Página «Mensajes» (#CrmHub/mensajes): la bandeja de conversaciones de WhatsApp, SMS y Telegram del usuario, como Correos y Llamadas agrupan lo suyo.
 * Izquierda: conversaciones (por lead) con el último mensaje, hora, canales y un punto si hay algo sin leer; filtros «Mis conversaciones / Todas» y por canal; búsqueda.
 * Derecha: el chat del lead seleccionado con una pestaña por canal (custom:views/chat-pane): cada canal tiene su propio espacio de conversación.
 * Endpoints: GET CrmHub/conversations (scope, channel) y GET Lead (búsqueda de otros leads para empezar una conversación); el chat usa los de custom:views/chat-pane.
 * Se actualiza sola: aviso por websocket (newNotification), cada 12 s y al volver a la pestaña. Opciones de la ruta: leadId, channel.
 */
define('custom:views/messages', ['view', 'custom:ui'], function (Dep, ChUi) {
    const esc = ChUi.esc;
    const CH = {whatsapp: ['WhatsApp', 'fab fa-whatsapp', '#25d366'], sms: ['SMS', 'fas fa-comment-sms', '#0ea5e9'], telegram: ['Telegram', 'fab fa-telegram', '#229ed9']};
    const COLORS = ['#4f63e8', '#2fa36b', '#d97706', '#8b5cf6', '#0d9488', '#e11d48', '#0ea5e9', '#7c3aed'];
    const parse = d => new Date(String(d).replace(' ', 'T') + 'Z');
    const short = d => {
        try {
            const x = parse(d), now = new Date();
            if (x.toDateString() === now.toDateString()) { return x.toLocaleTimeString('es', {hour: '2-digit', minute: '2-digit'}); }
            const y = new Date(now); y.setDate(now.getDate() - 1);
            return x.toDateString() === y.toDateString() ? 'Ayer' : x.toLocaleDateString('es', {day: 'numeric', month: 'short'});
        } catch (e) { return ''; }
    };
    const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
    const color = id => { let h = 0; String(id || '').split('').forEach(c => { h = (h * 31 + c.charCodeAt(0)) >>> 0; }); return COLORS[h % COLORS.length]; };

    return class extends Dep {
        templateContent = '<div class="ch-ms"></div>'

        events = {
            'click [data-action="scope"]': function (e) { this.scope = e.currentTarget.dataset.v; this.ls('ch-ms-scope', this.scope); this.load(); },
            'click [data-action="chan"]': function (e) { this.filter = e.currentTarget.dataset.v || ''; this.paintList(); },
            'input [name="q"]': function (e) { this.q = e.currentTarget.value; this.paintList(); this.searchOthers(); },
            'click [data-action="open"]': function (e) { this.select(e.currentTarget.dataset.id, e.currentTarget.dataset.ch || ''); },
            'click [data-action="tab"]': function (e) { this.setTab(e.currentTarget.dataset.v); },
            'click [data-action="back"]': function () { this.sel = null; this.paintAll(); },
        }

        ls(k, v) { try { if (v === undefined) { return localStorage.getItem(k); } localStorage.setItem(k, v); } catch (e) { return null; } }

        setup() {
            this.getHelper().pageTitle.setTitle('Mensajes');
            this.scope = this.ls('ch-ms-scope') === 'all' ? 'all' : 'mine';
            this.filter = ''; this.q = ''; this.items = []; this.others = []; this.sel = this.options.leadId || null; this.tab = this.options.channel || 'whatsapp';
            this.seenKey = 'ch-ms-seen:' + (this.getUser().id || '');
            try { this.seen = JSON.parse(this.ls(this.seenKey) || '{}'); } catch (e) { this.seen = {}; }
        }

        afterRender() {
            this.paintAll();
            this.load();
            clearInterval(this.timer); this.timer = setInterval(() => { if (!document.hidden) { this.load(true); } }, 12000);
            if (!this._ws) {
                try { const ws = this.getHelper().webSocketManager; if (ws) { this._ws = ws; this._cb = () => setTimeout(() => this.load(true), 500); ws.subscribe('newNotification', this._cb); } } catch (e) { /* queda el intervalo */ }
                this._vis = () => { if (!document.hidden) { this.load(true); } }; document.addEventListener('visibilitychange', this._vis);
            }
        }

        onRemove() {
            clearInterval(this.timer); clearTimeout(this._qt);
            if (this._ws && this._cb) { try { this._ws.unsubscribe('newNotification', this._cb); } catch (e) { /* nada */ } }
            if (this._vis) { document.removeEventListener('visibilitychange', this._vis); }
        }

        load(silent) {
            return Espo.Ajax.getRequest('CrmHub/conversations', {scope: this.scope}).then(r => {
                this.items = r.items || []; this.loaded = true;
                if (this.sel && !this.items.find(i => i.leadId === this.sel) && !this.extra) { /* lead sin historial: se conserva el chat abierto */ }
                this.paintList(); this.paintMain(true);
            }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } if (!silent) { this.loaded = true; this.paintList(); } });
        }

        isUnread(c) {
            const l = c.last; if (!l || l.dir !== 'in') { return false; }
            const s = this.seen[c.leadId];
            return s ? parse(l.at) > new Date(s) : (Date.now() - parse(l.at).getTime()) < 3 * 86400000;
        }

        markSeen(id) { this.seen[id] = new Date().toISOString(); this.ls(this.seenKey, JSON.stringify(this.seen)); }

        paintAll() {
            const root = this.el.querySelector('.ch-ms'); if (!root) { return; }
            root.classList.toggle('ch-ms-open', !!this.sel);
            root.innerHTML = '<aside class="ch-ms-side"><div class="ch-ms-top"><h3><span class="fas fa-comments"></span> Mensajes</h3>' +
                '<div class="ch-ms-seg" data-role="scope"></div>' +
                '<div class="ch-ms-search"><span class="fas fa-magnifying-glass"></span><input name="q" placeholder="Buscar por nombre o teléfono…" autocomplete="off"></div>' +
                '<div class="ch-ms-chips" data-role="chips"></div></div><div class="ch-ms-list" data-role="list"></div></aside>' +
                '<section class="ch-ms-main" data-role="main"></section>';
            const q = root.querySelector('[name="q"]'); if (q) { q.value = this.q; }
            this.paintList(); this.paintMain();
        }

        paintList() {
            const seg = this.el.querySelector('[data-role="scope"]'), chips = this.el.querySelector('[data-role="chips"]'), list = this.el.querySelector('[data-role="list"]');
            if (!list) { return; }
            seg.innerHTML = ['mine', 'all'].map(v => `<button type="button" data-action="scope" data-v="${v}" class="${this.scope === v ? 'on' : ''}">${v === 'mine' ? 'Mis conversaciones' : 'Todas'}</button>`).join('');
            chips.innerHTML = `<button type="button" data-action="chan" data-v="" class="${this.filter ? '' : 'on'}">Todos</button>` +
                Object.keys(CH).map(k => `<button type="button" data-action="chan" data-v="${k}" class="${this.filter === k ? 'on' : ''}"><span class="${CH[k][1]}" style="color:${CH[k][2]}"></span> ${CH[k][0]}</button>`).join('');
            const q = this.q.trim().toLowerCase(), digits = q.replace(/\D/g, '');
            const rows = this.items.filter(c => (!this.filter || c.channels[this.filter]) &&
                (!q || (c.name || '').toLowerCase().includes(q) || (digits.length >= 3 && String(c.phone || '').replace(/\D/g, '').includes(digits))));
            let html = rows.map(c => {
                const l = this.filter && c.channels[this.filter] ? c.channels[this.filter].last : c.last, un = this.isUnread(c);
                const who = l.dir === 'out' ? (l.who ? esc(l.who.replace(/\s*\(comercial virtual\)$/i, '')) + ': ' : 'Tú: ') : '';
                return `<div class="ch-ms-item ${c.leadId === this.sel ? 'on' : ''} ${un ? 'unread' : ''}" role="button" tabindex="0" data-action="open" data-id="${esc(c.leadId)}" data-ch="${esc(l.channel)}">` +
                    `<span class="ch-avatar ch-ms-av" style="background:${color(c.leadId)}">${esc(initials(c.name))}</span><div class="ch-ms-info">` +
                    `<div class="ch-ms-row"><b class="ch-ms-name">${esc(c.name || '(sin nombre)')}</b><span class="ch-ms-time">${esc(short(l.at))}</span></div>` +
                    `<div class="ch-ms-row"><span class="ch-ms-last">${who}${esc(l.text)}</span>${un ? '<i class="ch-ms-dot"></i>' : ''}</div>` +
                    `<div class="ch-ms-meta">${Object.keys(CH).filter(k => c.channels[k]).map(k => `<span class="${CH[k][1]}" style="color:${CH[k][2]}" title="${CH[k][0]}: ${c.channels[k].count}"></span>`).join('')}` +
                    `${c.assignedUserName ? `<span class="ch-ms-asg"><span class="fas fa-user"></span> ${esc(c.assignedUserName)}</span>` : ''}</div></div></div>`;
            }).join('');
            if (this.others.length && q.length >= 2) {
                html += '<div class="ch-ms-sub">Otros leads</div>' + this.others.filter(o => !this.items.find(i => i.leadId === o.id)).map(o =>
                    `<div class="ch-ms-item" role="button" tabindex="0" data-action="open" data-id="${esc(o.id)}" data-ch="whatsapp"><span class="ch-avatar ch-ms-av" style="background:${color(o.id)}">${esc(initials(o.name))}</span>` +
                    `<div class="ch-ms-info"><div class="ch-ms-row"><b class="ch-ms-name">${esc(o.name)}</b></div><div class="ch-ms-row"><span class="ch-ms-last">${esc(o.phoneNumber || o.emailAddress || '')} · empezar una conversación</span></div></div></div>`).join('');
            }
            list.innerHTML = html || (this.loaded ? ChUi.empty({kind: 'chat', title: q ? 'Sin resultados' : (this.scope === 'mine' ? 'Aún no tienes conversaciones' : 'Aún no hay conversaciones'),
                text: q ? 'Prueba con otro nombre o teléfono.' : (this.scope === 'mine' ? 'Aquí aparecen las de tus leads y las que tú escribas. Mira «Todas» para ver las de tu equipo.' : 'Cuando un cliente escriba o le escribas por WhatsApp, SMS o Telegram, aparecerá aquí.'), compact: true}) : '<div class="ch-muted" style="padding:16px">Cargando…</div>');
        }

        // Busca otros leads (sin conversación aún) para poder escribirles desde aquí
        searchOthers() {
            clearTimeout(this._qt);
            const q = this.q.trim();
            if (q.length < 2) { this.others = []; return; }
            this._qt = setTimeout(() => {
                Espo.Ajax.getRequest('Lead', {textFilter: q, maxSize: 6, select: 'name,phoneNumber,emailAddress'}).then(r => { this.others = r.list || []; this.paintList(); })
                    .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } });
            }, 350);
        }

        current() { return this.items.find(i => i.leadId === this.sel) || this.extra || null; }

        select(id, ch) {
            this.sel = id; if (ch && CH[ch]) { this.tab = ch; }
            const found = this.items.find(i => i.leadId === id);
            if (!found) { const o = this.others.find(x => x.id === id); this.extra = o ? {leadId: o.id, name: o.name, phone: o.phoneNumber || '', channels: {}, last: null} : null; } else { this.extra = null; }
            this.markSeen(id); this.paintAll();
        }

        setTab(ch) {
            if (!CH[ch]) { return; }
            this.tab = ch; this.paintTabs();
            const pane = this.getView('pane'); if (pane) { pane.setChannel(ch); }
        }

        paintTabs() {
            const c = this.current(), box = this.el.querySelector('[data-role="tabs"]'); if (!c || !box) { return; }
            box.innerHTML = Object.keys(CH).map(k => `<button type="button" data-action="tab" data-v="${k}" class="${this.tab === k ? 'on' : ''}" style="--tc:${CH[k][2]}"><span class="${CH[k][1]}"></span> ${CH[k][0]}` +
                `${c.channels[k] ? `<small>${c.channels[k].count}</small>` : ''}</button>`).join('');
        }

        paintMain(keep) {
            const main = this.el.querySelector('[data-role="main"]'); if (!main) { return; }
            const c = this.current();
            if (!c) {
                this.clearView('pane');
                main.innerHTML = '<div class="ch-ms-empty">' + ChUi.empty({kind: 'chat', title: 'Elige una conversación', text: 'Selecciona un cliente de la lista para ver y responder sus mensajes de WhatsApp, SMS y Telegram, cada uno en su propio espacio.', compact: false}) + '</div>';
                return;
            }
            // la misma conversación ya abierta: solo se actualizan las pestañas (no se vuelve a crear el chat)
            if (keep && this._shown === c.leadId && main.querySelector('.ch-ms-pane')) { this.paintTabs(); return; }
            this._shown = c.leadId;
            main.innerHTML = `<header class="ch-ms-head"><button type="button" class="btn btn-link ch-ms-back" data-action="back"><span class="fas fa-arrow-left"></span></button>` +
                `<span class="ch-avatar ch-ms-av" style="background:${color(c.leadId)}">${esc(initials(c.name))}</span><div class="ch-ms-hinfo"><b>${esc(c.name || '')}</b><small>${esc(c.phone || c.email || '')}${c.status ? ' · ' + esc(c.status) : ''}</small></div>` +
                `<a class="btn btn-default btn-sm" href="#Lead/view/${esc(c.leadId)}"><span class="fas fa-up-right-from-square"></span> Abrir lead</a></header>` +
                '<div class="ch-ms-tabs" data-role="tabs"></div><div class="ch-ms-pane"></div>';
            this.paintTabs();
            this.clearView('pane');
            this.createView('pane', 'custom:views/chat-pane', {selector: '.ch-ms-pane', leadId: c.leadId, channel: this.tab, name: c.name, phone: c.phone}, v => {
                this.listenTo(v, 'done', () => setTimeout(() => this.load(true), 800));
                v.render();
            });
        }
    };
});
