// «Mis plantillas»: cada canal tiene su propio lienzo. Correo = diseñador de bloques (HTML); WhatsApp y Telegram = chat con vista previa en teléfono y
// formato propio de cada app; SMS = texto plano con contador de segmentos; RCS = próximamente (bloqueado).
define('custom:views/my-templates', ['view', 'custom:ui', 'custom:tpl', 'custom:mail-send', 'custom:designer'], function (Dep, ChUi, Tpl, MailSend, Dz) {
    const esc = v => ChUi.esc(v == null ? '' : v);
    const SAMPLE = 'María Pérez';
    const EMOJI = ['😀', '😊', '😉', '😍', '🙏', '👍', '👏', '🎉', '✅', '⭐', '🔥', '💡', '📞', '📅', '📍', '📎', '💬', '📧', '🤝', '💼', '🏠', '🚗', '💰', '💳', '📈', '⏰', '❤️', '😅', '🙌', '👋', '✨', '📣'];
    const NOTES = {
        whatsapp: 'WhatsApp entiende: *negrita*, _cursiva_, ~tachado~ y ```monoespaciado```. Los enlaces se vuelven tocables solos.',
        telegram: 'Telegram: *negrita*, _cursiva_, ~tachado~, `código` y [texto del enlace](https://…). Se convierten al formato de Telegram al enviar.',
        sms: 'Los SMS son texto plano, sin formato. Un mensaje largo se envía en varios SMS y cada uno se cobra.',
    };
    const LOCKED = {rcs: {label: 'RCS', icon: 'fas fa-comment-dots', color: '#94a3b8'}};

    // Texto con marcas de formato → HTML de vista previa (misma idea que WhatsApp/Telegram)
    function fmt(text, ch) {
        let t = esc(text);
        if (ch === 'sms') { return t.replace(/\n/g, '<br>'); }
        t = t.replace(/```([\s\S]+?)```/g, '<code class="blk">$1</code>').replace(/`([^`\n]+)`/g, '<code>$1</code>');
        if (ch === 'telegram') { t = t.replace(/\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]{3,500})\)/g, '<a>$1</a>'); }
        [['*', 'b'], ['_', 'i'], ['~', 's']].forEach(([m, tag]) => {
            const e = '\\' + m;
            t = t.replace(new RegExp('(?<![\\w' + e + '])' + e + '(?=\\S)([^\\n' + e + ']*?\\S)' + e + '(?![\\w' + e + '])', 'g'), `<${tag}>$1</${tag}>`);
        });
        return t.replace(/\n/g, '<br>');
    }

    return class extends Dep {
        templateContent = '<div class="ch-tpls"></div>'
        data0 = null
        channel = 'email'
        editing = null
        designer = null

        setup() { this.getHelper().pageTitle.setTitle('Mis plantillas'); this.refreshData(); }
        afterRender() { this.draw(); }
        onRemove() { this.designer = null; }
        refreshData() { Tpl.load(true).then(r => { this.data0 = r; this.draw(); }); }
        ctx() { return Tpl.ctx(this, SAMPLE); }

        draw() {
            const root = this.el && this.el.querySelector('.ch-tpls'); if (!root) { return; }
            if (!this.data0) { root.innerHTML = '<div class="ch-muted" style="padding:24px">Cargando…</div>'; return; }
            const max = this.data0.max || 10, ch = this.channel, list = Tpl.forChannel(this.data0, ch);
            const tabs = Object.keys(Tpl.CH).map(k => { const n = Tpl.forChannel(this.data0, k).length;
                return `<a class="ch-tpl-tab ${k === ch ? 'on' : ''}" data-act="tab" data-ch="${k}"><span class="${Tpl.CH[k].icon}" style="color:${k === ch ? '#fff' : Tpl.CH[k].color}"></span> ${Tpl.CH[k].label} <small>${n}/${max}</small></a>`; }).join('') +
                Object.keys(LOCKED).map(k => `<a class="ch-tpl-tab lock" title="Próximamente"><span class="fas fa-lock"></span> ${LOCKED[k].label} <small>Próximamente</small></a>`).join('');
            const head = `<div class="ch-sim-head"><h3><span class="fas fa-file-lines"></span> Mis plantillas</h3>
                <p class="ch-muted">Tus propios mensajes listos para usar: son privados, solo tú los ves y puedes tener hasta ${max} por canal. Úsalos desde el panel de correo, WhatsApp, Telegram o SMS de un lead, cuenta o contacto.</p></div><div class="ch-tpl-tabs">${tabs}</div>`;
            if (this.editing && ch === 'email') {   // el diseñador necesita todo el ancho
                root.innerHTML = head + this.emailEditorHtml(); this.bindEmail(root); return;
            }
            const left = `<div class="ch-sim-card"><h4>Mis plantillas de ${esc(Tpl.CH[ch].label)} <small class="ch-muted">${list.length} de ${max}</small></h4>` +
                (list.map(t => `<div class="ch-tpl-item ${this.editing && this.editing.id === t.id ? 'on' : ''}"><a data-act="edit" data-id="${t.id}"><b>${esc(t.name)}</b><span>${esc(ch === 'email' ? t.subject : String(t.body).slice(0, 70))}</span></a><a class="ch-tpl-del" data-act="del" data-id="${t.id}" title="Eliminar"><span class="far fa-trash-can"></span></a></div>`).join('') || ChUi.empty({kind: 'doc', title: 'Aún no tienes plantillas en este canal', text: 'Crea la primera con «Nueva plantilla»: te ahorrará tiempo en cada mensaje.', compact: true})) +
                `<div class="ch-mail-actions"><button class="btn btn-primary btn-sm" data-act="new" ${list.length >= max ? 'disabled title="Llegaste al máximo; elimina una o pide ampliar el límite"' : ''}><span class="fas fa-plus"></span> Nueva plantilla</button></div></div>`;
            root.innerHTML = head + `<div class="ch-sim-grid">${left}<div class="ch-sim-card" data-role="editor">${this.editing ? this.chatEditorHtml() : this.emptyHtml()}</div></div>`;
            this.bind(root);
            if (this.editing) { this.bindChat(root); }
        }

        emptyHtml() { return '<div class="ch-muted" style="padding:30px;text-align:center"><span class="fas fa-pen-to-square" style="font-size:28px"></span><br><br>Elige una plantilla para editarla o crea una nueva.</div>'; }

        // ---------- lienzo de correo
        emailEditorHtml() {
            const e = this.editing;
            return `<div class="ch-dz-top"><a class="ch-dz-back" data-act="cancel"><span class="fas fa-arrow-left"></span> Mis plantillas</a>
                <div class="ch-dz-names"><input data-f="name" maxlength="80" value="${esc(e.name || '')}" placeholder="Nombre de la plantilla (solo lo ves tú)"><input data-f="subject" maxlength="250" value="${esc(e.subject || '')}" placeholder="Asunto del correo"></div>
                <div><button class="btn btn-primary btn-sm" data-act="save"><span class="fas fa-floppy-disk"></span> Guardar</button></div></div>
                <div class="ch-chat-err" data-role="err" hidden></div><div data-role="dz"></div>`;
        }

        bindEmail(root) {
            const e = this.editing;
            const design = e.design && e.design.blocks ? e.design : (e.body ? {theme: Dz.starter().theme, blocks: [Dz.starter().blocks[0], {id: 'bx', type: 'text', props: {html: e.body, align: 'left'}}, Dz.starter().blocks[4]]} : null);
            this.designer = new Dz.Designer(root.querySelector('[data-role="dz"]'), design, {vars: this.ctx(), fill: Tpl.fill, varList: Tpl.VARS});
            this.bind(root);
        }

        // ---------- lienzo de chat (WhatsApp, Telegram, SMS)
        chatEditorHtml() {
            const e = this.editing, ch = this.channel, meta = Tpl.CH[ch];
            const fmtBar = ch === 'sms' ? '' : `<div class="ch-fmt"><a data-fmt="*" title="Negrita"><b>B</b></a><a data-fmt="_" title="Cursiva"><i>I</i></a><a data-fmt="~" title="Tachado"><s>S</s></a>` +
                (ch === 'whatsapp' ? '<a data-fmt="```" title="Monoespaciado"><span class="fas fa-code"></span></a>' : '<a data-fmt="`" title="Código"><span class="fas fa-code"></span></a><a data-act="tglink" title="Enlace"><span class="fas fa-link"></span></a>') +
                `<a data-act="emoji" title="Emoji"><span class="far fa-face-smile"></span></a></div>`;
            const chips = Tpl.VARS.filter(v => v[0] !== '{logo}').map(([v, t]) => `<a class="ch-var" data-act="var" data-v="${esc(v)}" title="${esc(t)}">${esc(v)}</a>`).join('');
            return `<h4><span class="${meta.icon}" style="color:${meta.color}"></span> ${e.id ? 'Editar plantilla' : 'Nueva plantilla de ' + esc(meta.label)}</h4>
                <div class="ch-cz"><div class="ch-cz-form"><label>Nombre de la plantilla</label><input data-f="name" maxlength="80" value="${esc(e.name || '')}" placeholder="Ej.: Primer contacto">
                <label>Mensaje</label>${fmtBar}<div class="ch-emoji-pop" hidden>${EMOJI.map(m => `<a data-act="em" data-e="${m}">${m}</a>`).join('')}</div>
                <textarea data-f="body" rows="9" maxlength="4000" placeholder="Escribe el mensaje…">${esc(e.body || '')}</textarea>
                <div class="ch-var-row"><span class="ch-muted">Variables:</span> ${chips}</div><div class="ch-muted ch-cz-note">${esc(NOTES[ch] || '')}</div>
                <div class="ch-muted" data-role="count"></div><div class="ch-chat-err" data-role="err" hidden></div>
                <div class="ch-mail-actions"><button class="btn btn-primary btn-sm" data-act="save"><span class="fas fa-floppy-disk"></span> Guardar</button><button class="btn btn-default btn-sm" data-act="cancel">Cancelar</button></div></div>
                <div class="ch-cz-prev"><div class="ch-sig-h">Así lo verá el cliente (ejemplo: ${esc(SAMPLE)}):</div><div data-role="phone"></div></div></div>`;
        }

        phoneHtml(text) {
            const ch = this.channel, v = this.ctx(), txt = Tpl.fill(text, {...v, nombre: 'María', apellido: 'Pérez', nombre_completo: SAMPLE});
            const time = new Date().toLocaleTimeString('es', {hour: '2-digit', minute: '2-digit'});
            const body = txt ? fmt(txt, ch) : '<span class="ch-muted">Escribe tu mensaje…</span>';
            const head = {whatsapp: ['ch-ph-wa', SAMPLE, 'en línea'], telegram: ['ch-ph-tg', SAMPLE, 'visto recientemente'], sms: ['ch-ph-sms', SAMPLE, 'Mensaje de texto']}[ch];
            const ticks = ch === 'whatsapp' ? ' <span class="fas fa-check-double" style="color:#53bdeb"></span>' : (ch === 'telegram' ? ' <span class="fas fa-check-double"></span>' : '');
            return `<div class="ch-phone ${head[0]}"><div class="ch-ph-head"><span class="ch-ph-av">M</span><div><b>${esc(head[1])}</b><small>${head[2]}</small></div></div>
                <div class="ch-ph-body"><div class="ch-ph-day">Hoy</div><div class="ch-ph-bub">${body}<span class="ch-ph-time">${time}${ticks}</span></div></div>
                <div class="ch-ph-foot"><span>${ch === 'sms' ? 'Mensaje de texto' : 'Escribe un mensaje'}</span></div></div>`;
        }

        updateChat() {
            const ta = this.el.querySelector('[data-f="body"]'), ph = this.el.querySelector('[data-role="phone"]'); if (!ta || !ph) { return; }
            ph.innerHTML = this.phoneHtml(ta.value);
            const c = this.el.querySelector('[data-role="count"]'), v = ta.value;
            if (this.channel === 'sms') {
                const t = Tpl.fill(v, {...this.ctx(), nombre: 'María', apellido: 'Pérez', nombre_completo: SAMPLE}), n = t.length, uni = /[^\u0000-\u007F¡¿áéíóúñÑüÜÁÉÍÓÚ€£¥]/.test(t), single = uni ? 70 : 160, multi = uni ? 67 : 153;
                c.textContent = n ? `${n} caracteres · ${n <= single ? 1 : Math.ceil(n / multi)} SMS${uni ? ' (caracteres especiales: caben menos)' : ''}` : '';
            } else { c.textContent = v.length ? `${v.length} de 4000 caracteres` : ''; }
        }

        bindChat(root) {
            const ta = root.querySelector('[data-f="body"]'); ta.addEventListener('input', () => this.updateChat()); this.updateChat();
        }

        wrap(m) {
            const ta = this.el.querySelector('[data-f="body"]'), s = ta.selectionStart, e = ta.selectionEnd, sel = ta.value.slice(s, e) || 'texto';
            ta.value = ta.value.slice(0, s) + m + sel + m + ta.value.slice(e); ta.focus(); ta.selectionStart = s + m.length; ta.selectionEnd = s + m.length + sel.length; this.updateChat();
        }
        insertAtCursor(txt) {
            const ta = this.el.querySelector('[data-f="body"]'), s = ta.selectionStart || 0; ta.value = ta.value.slice(0, s) + txt + ta.value.slice(ta.selectionEnd || s); ta.focus(); ta.selectionStart = ta.selectionEnd = s + txt.length; this.updateChat();
        }

        bind(root) {
            root.onclick = e => {
                const fm = e.target.closest('[data-fmt]'); if (fm) { this.wrap(fm.dataset.fmt); return; }
                const a = e.target.closest('[data-act]'); if (!a) { return; }
                const act = a.dataset.act, list = Tpl.forChannel(this.data0, this.channel);
                if (act === 'tab') { this.channel = a.dataset.ch; this.editing = null; this.draw(); }
                else if (act === 'new') { this.editing = {}; this.draw(); }
                else if (act === 'edit') { this.editing = list.find(t => t.id === +a.dataset.id) || null; this.draw(); }
                else if (act === 'cancel') { this.editing = null; this.designer = null; this.draw(); }
                else if (act === 'var') { this.insertAtCursor(a.dataset.v); }
                else if (act === 'emoji') { const p = this.el.querySelector('.ch-emoji-pop'); p.hidden = !p.hidden; }
                else if (act === 'em') { this.insertAtCursor(a.dataset.e); this.el.querySelector('.ch-emoji-pop').hidden = true; }
                else if (act === 'tglink') { this.tgLink(); }
                else if (act === 'save') { this.saveTpl(); }
                else if (act === 'del') { this.removeTpl(+a.dataset.id); }
            };
        }

        tgLink() {
            const ta = this.el.querySelector('[data-f="body"]'), s = ta.selectionStart, e = ta.selectionEnd, sel = ta.value.slice(s, e);
            ChUi.prompt({title: 'Insertar enlace', icon: 'fas fa-link', label: 'Dirección del enlace', placeholder: 'https://…', required: true, min: 4, rows: 1, max: 500, ok: 'Insertar',
                hint: sel ? 'El texto seleccionado se convertirá en el enlace.' : 'Escribe después el texto que verá el cliente.', requiredText: 'Escribe la dirección completa (https://…).'}).then(u => {
                if (!u) { return; }
                const url = /^https?:\/\//i.test(u) ? u : 'https://' + u;
                ta.value = ta.value.slice(0, s) + '[' + (sel || 'texto del enlace') + '](' + url + ')' + ta.value.slice(e); this.updateChat();
            });
        }

        saveTpl() {
            const q = n => this.el.querySelector(`[data-f="${n}"]`), err = this.el.querySelector('[data-role="err"]'); err.hidden = true;
            const ch = this.channel, name = q('name').value.trim();
            let body, subject = '', design = null;
            if (ch === 'email') { subject = q('subject').value.trim(); body = this.designer.getHtml(); design = JSON.stringify(this.designer.getDesign()); }
            else { body = q('body').value.trim(); }
            const fail = m => { err.hidden = false; err.textContent = m; };
            if (name.length < 2) { fail('Escribe el nombre de la plantilla.'); return; }
            if (ch === 'email' && !subject) { fail('Escribe el asunto del correo.'); return; }
            if (!body || (ch === 'email' && !this.designer.getDesign().blocks.length)) { fail('La plantilla está vacía.'); return; }
            const btn = this.el.querySelector('[data-act="save"]'); btn.disabled = true;
            Espo.Ajax.postRequest('CrmHub/templateSave', {id: this.editing.id || null, channel: ch, name, subject, body, design})
                .then(() => { Espo.Ui.success('Plantilla guardada'); this.editing = null; this.designer = null; this.refreshData(); })
                .catch(xhr => { fail(Tpl.reason(xhr, 'No se pudo guardar.')); if (xhr) { xhr.errorIsHandled = true; } btn.disabled = false; });
        }

        removeTpl(id) {
            ChUi.confirm({title: 'Eliminar plantilla', text: 'La plantilla se elimina solo para ti. ¿Continuar?', ok: 'Eliminar', danger: true}).then(yes => {
                if (!yes) { return; }
                Espo.Ajax.postRequest('CrmHub/templateDelete', {id}).then(() => { Espo.Ui.success('Plantilla eliminada'); if (this.editing && this.editing.id === id) { this.editing = null; } this.refreshData(); })
                    .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('No se pudo eliminar'); });
            });
        }
    };
});
