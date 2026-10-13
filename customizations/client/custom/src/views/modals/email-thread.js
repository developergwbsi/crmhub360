/**
 * Panel «Correos del registro»: lista de correos (asunto, quién, fecha y vista previa), detalle del correo al hacer clic (con el mensaje completo, adjuntos y «Responder») y redacción, todo en el mismo panel.
 * Endpoints: GET CrmHub/leadTimeline (kind=emails), GET Email/{id} (detalle), GET CrmHub/channels, POST CrmHub/templateSave (guardar como plantilla), GET EmailTemplate y POST EmailTemplate/{id}/prepare; el envío va por custom:mail-send.
 * Tras enviar dispara 'done' y avisa con Live.notify (custom:live-panel); usa pantalla dividida ('ch').
 */
define('custom:views/modals/email-thread', ['views/modal', 'custom:ui', 'custom:split', 'custom:mail-send', 'custom:tpl', 'custom:live-panel'], function (Dep, ChUi, Split, MailSend, Tpl, Live) {
    // HTML de una plantilla → texto editable (el correo se envía con saltos de línea convertidos a HTML)
    const toText = h => String(h || '').replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n').replace(/<li[^>]*>/gi, '• ').replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\n{3,}/g, '\n\n').trim();
    return class extends Dep {
        className = 'dialog ch-ch-panel ch-mail-modal'
        backdrop = false
        templateContent = '<div class="ch-em"></div>'

        events = {
            'click [data-action="compose"]': function () { this.toggleCompose(true); },
            'click [data-action="cancelCompose"]': function () { this.toggleCompose(false); },
            'click [data-action="sendMail"]': function () { this.send(); },
            'click [data-action="pickTpl"]': function (e) { this.applyTemplate(e.currentTarget.dataset.id); },
            'click [data-action="pickMine"]': function (e) { this.applyMine(e.currentTarget.dataset.id); },
            'click [data-action="saveTpl"]': function () { this.saveAsTemplate(); },
            'click [data-action="replyMail"]': function (e) { e.stopPropagation(); const m = this.items[+e.currentTarget.dataset.i]; this.replyTo = {messageId: m.messageId, refs: m.refs || []}; this.toggleCompose(true); const s = this.el.querySelector('[name="subject"]'); s.value = /^re:/i.test(m.subject) ? m.subject : 'Re: ' + m.subject; this.el.querySelector('[name="body"]').focus(); },
            'click [data-action="openMail"]': function (e) { this.openMail(+e.currentTarget.dataset.i); },
            'keydown [data-action="openMail"]': function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.openMail(+e.currentTarget.dataset.i); } },
            'click [data-action="backList"]': function () { this.detail = null; this.load(); },
        }

        setup() {
            this.buttonList = [];
            this.scope = this.options.scope || 'Lead';
            this.headerHtml = '<span class="ch-chat-badge" style="background:#f59e0b"><span class="fas fa-envelope"></span></span> ' +
                `<span class="ch-chat-title"><b>${ChUi.esc(this.options.name || '')}</b><small>${ChUi.esc(this.options.email || '')} · Correos</small></span>`;
        }

        onRemove() { if (this._chSplit) { this._chSplit = false; Split.close('ch'); } }

        afterRender() {
            if (!this._chSplit) { this._chSplit = true; Split.open('ch'); }
            this.el.querySelector('.ch-em').innerHTML = '<div class="ch-em-bar"><span class="ch-em-count" data-role="count"></span><button type="button" class="btn btn-primary btn-sm" data-action="compose"><span class="fas fa-pen"></span> Redactar correo</button></div>' +
                '<div class="ch-em-scroll"><div class="ch-mail-compose" data-role="compose" hidden></div><div data-role="view"><div class="ch-chat-empty">Cargando…</div></div></div>';
            Espo.Ajax.getRequest('CrmHub/channels').catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } return {}; }).then(ch => { this.channels = ch || {}; });
            this.load();
        }

        toggleCompose(on) {
            const box = this.el.querySelector('[data-role="compose"]');
            if (!on) { box.hidden = true; box.innerHTML = ''; return; }
            const ready = this.channels && this.channels.email;
            box.hidden = false;
            const sc = this.el.querySelector('.ch-em-scroll'); if (sc) { sc.scrollTop = 0; }
            box.innerHTML = (ready === false ? '<div class="ch-chat-err">El envío de correo aún no está configurado (SMTP). Puedes redactar, pero el envío fallará hasta que' +
                    (this.channels.admin ? ' lo configures en <a href="#Admin/outboundEmails">Administración → Correo saliente</a>.' : ' tu administrador lo configure.') + '</div>' : '') +
                '<label>Plantillas <a class="ch-tpl-manage" href="#EmailTemplate">Administrar</a></label><div class="ch-tpl-gallery" data-role="tpls"><span class="ch-muted">Cargando plantillas…</span></div>' +
                `<label>Para</label><input value="${ChUi.esc(this.options.email)}" readonly><label>Asunto</label><input name="subject" maxlength="250" placeholder="Asunto">` +
                '<label>Mensaje</label>' + MailSend.editorMarkup(6) + '<div class="ch-sig" data-role="sig"><span class="ch-muted">Cargando tu firma…</span></div><div class="ch-chat-err" data-role="err" hidden></div>' +
                '<div class="ch-mail-actions"><button type="button" class="btn btn-primary btn-sm" data-action="sendMail"><span class="fas fa-paper-plane"></span> Enviar</button><button type="button" class="btn btn-default btn-sm" data-action="saveTpl"><span class="far fa-floppy-disk"></span> Guardar como plantilla</button><button type="button" class="btn btn-default btn-sm" data-action="cancelCompose">Cancelar</button></div>';
            this.loadTemplates(); MailSend.mountEditor(box);
            MailSend.signature().then(r => { const s = this.el.querySelector('[data-role="sig"]'); if (s) { s.innerHTML = '<div class="ch-sig-h">Se envía como <b>' + ChUi.esc(r.name || '') + '</b> con esta firma:</div>' + (r.html || ''); } });
            setTimeout(() => { const i = box.querySelector('[name="subject"]'); i && i.focus(); }, 50);
        }

        loadTemplates() {
            Promise.all([Espo.Ajax.getRequest('EmailTemplate', {maxSize: 60, orderBy: 'name', select: 'name,subject'}).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } return {list: []}; }), Tpl.load(true)]).then(([r, t]) => {
                const box = this.el.querySelector('[data-role="tpls"]'); if (!box) { return; }
                this.templates = r.list || []; this.mine = Tpl.forChannel(t, 'email');
                const chips = (mine, shared) => mine.map(x => `<button type="button" class="ch-tpl mine" data-action="pickMine" data-id="${x.id}" title="Mi plantilla"><span class="fas fa-user"></span><b>${ChUi.esc(x.name)}</b></button>`).join('') +
                    shared.map(x => `<button type="button" class="ch-tpl" data-action="pickTpl" data-id="${ChUi.esc(x.id)}" title="${ChUi.esc(x.subject || '')}"><span class="fas fa-file-lines"></span><b>${ChUi.esc(x.name)}</b></button>`).join('');
                box.innerHTML = chips(this.mine, this.templates) || '<span class="ch-muted">Aún no tienes plantillas. Escribe un correo y usa «Guardar como plantilla» (queda solo para ti).</span>';
            });
        }

        applyMine(id) {
            const t = (this.mine || []).find(x => String(x.id) === String(id)); if (!t) { return; }
            const box = this.el.querySelector('[data-role="compose"]'), v = Tpl.ctx(this, this.options.name);
            box.querySelector('[name="subject"]').value = Tpl.fill(t.subject, v); box.querySelector('[name="body"]').value = Tpl.fill(t.body, v);
            box.querySelectorAll('.ch-tpl').forEach(b => b.classList.toggle('on', b.dataset.id === String(id)));
        }

        // Rellena asunto y mensaje con la plantilla (ya con el nombre del cliente y del asesor); sigue siendo editable antes de enviar
        applyTemplate(id) {
            const box = this.el.querySelector('[data-role="compose"]'), subj = box.querySelector('[name="subject"]'), body = box.querySelector('[name="body"]');
            const go = () => Espo.Ajax.postRequest(`EmailTemplate/${id}/prepare`, {parentType: this.scope, parentId: this.options.leadId, emailAddress: this.options.email}).then(r => {
                subj.value = toText(r.subject); body.value = r.body; body.focus();
                box.querySelectorAll('.ch-tpl').forEach(b => b.classList.toggle('on', b.dataset.id === id));
            }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } const e = box.querySelector('[data-role="err"]'); e.hidden = false; e.textContent = 'No se pudo cargar la plantilla.'; });
            if ((subj.value.trim() || body.value.trim()) && !box.querySelector('.ch-tpl.on')) {
                ChUi.confirm({title: 'Usar plantilla', text: 'Se reemplazará el asunto y el mensaje que ya escribiste. ¿Continuar?', ok: 'Usar plantilla'}).then(yes => { if (yes) { go(); } });
            } else { go(); }
        }

        // Guarda el correo en redacción como plantilla personal (CrmHub/templateSave).
        saveAsTemplate() {
            const box = this.el.querySelector('[data-role="compose"]'), subject = box.querySelector('[name="subject"]').value.trim(), body = box.querySelector('[name="body"]').value.trim();
            if (!subject || !body) { const e = box.querySelector('[data-role="err"]'); e.hidden = false; e.textContent = 'Escribe el asunto y el mensaje para guardarlos como plantilla.'; return; }
            ChUi.prompt({title: 'Guardar como plantilla', label: 'Nombre de la plantilla', required: true, min: 3, rows: 1, max: 80, ok: 'Guardar', hint: 'Queda solo para ti (máximo 10 de correo). Puedes usar {nombre}, {apellido}, {asesor} y {empresa} para personalizar.'}).then(name => {
                if (!name) { return; }
                Espo.Ajax.postRequest('CrmHub/templateSave', {channel: 'email', name, subject, body})
                    .then(() => { Espo.Ui.success('Plantilla guardada en «Mis plantillas»'); Tpl.invalidate(); this.loadTemplates(); })
                    .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error(Tpl.reason(xhr, 'No se pudo guardar la plantilla')); });
            });
        }

        send() {
            const box = this.el.querySelector('[data-role="compose"]'), err = box.querySelector('[data-role="err"]');
            const subject = (box.querySelector('[name="subject"]').value || '').trim(), body = (box.querySelector('[name="body"]').value || '').trim();
            if (!subject || !body) { err.hidden = false; err.textContent = 'Escribe el asunto y el mensaje.'; return; }
            err.hidden = true;
            const btn = box.querySelector('[data-action="sendMail"]'); btn.disabled = true;
            MailSend.send({to: this.options.email, subject, body, parentType: this.scope, parentId: this.options.leadId, inReplyTo: this.replyTo && this.replyTo.messageId, references: this.replyTo && this.replyTo.refs})
                .then(() => { Espo.Ui.success('Correo enviado'); this.replyTo = null; this.toggleCompose(false); this.trigger('done'); Live.notify(this.options.leadId); setTimeout(() => this.load(), 900); })
                .catch(xhr => { err.hidden = false; err.textContent = MailSend.reason(xhr); if (xhr) { xhr.errorIsHandled = true; } })
                .then(() => { btn.disabled = false; });
        }

        // Carga los correos del registro (CrmHub/leadTimeline kind=emails) y los lista; si hay un correo abierto no lo cierra.
        load() {
            Espo.Ajax.getRequest('CrmHub/leadTimeline', {leadId: this.options.leadId, scope: this.scope, kind: 'emails'}).then(r => {
                const view = this.el.querySelector('[data-role="view"]'); if (!view) { return; }
                const items = r.items || []; this.items = items;
                const cnt = this.el.querySelector('[data-role="count"]'); if (cnt) { cnt.textContent = items.length ? items.length + (items.length === 1 ? ' correo' : ' correos') : ''; }
                if (this.detail != null) { return; }
                const short = d => { try { const x = new Date(String(d).replace(' ', 'T') + 'Z'), now = new Date(); return x.toLocaleString('es', x.toDateString() === now.toDateString() ? {timeStyle: 'short'} : {day: 'numeric', month: 'short', year: x.getFullYear() === now.getFullYear() ? undefined : 'numeric'}); } catch (e) { return d || ''; } };
                view.innerHTML = items.length ? '<div class="ch-em-list">' + items.map((m, i) => {
                    const out = m.dir === 'out', prev = String(m.text || '').replace(/\s+/g, ' ').trim();
                    return `<div class="ch-em-item ch-em-${m.dir}" role="button" tabindex="0" data-action="openMail" data-i="${i}">` +
                        `<span class="ch-em-ic"><span class="fas ${out ? 'fa-paper-plane' : 'fa-inbox'}"></span></span><div class="ch-em-main">` +
                        `<div class="ch-em-row1"><span class="ch-em-subj">${ChUi.esc(m.subject || '(sin asunto)')}</span><span class="ch-em-date">${ChUi.esc(short(m.at))}</span></div>` +
                        `<div class="ch-em-who">${out ? 'Enviado por <b>' + ChUi.esc(m.from || 'el equipo') + '</b> · para ' + ChUi.esc(m.to || this.options.email) : 'Recibido de <b>' + ChUi.esc(m.from || this.options.email) + '</b>'}</div>` +
                        (prev ? `<div class="ch-em-prev">${ChUi.esc(prev)}</div>` : '') + '</div></div>';
                }).join('') + '</div>'
                    : '<div class="ch-chat-empty"><span class="fas fa-envelope-open"></span><p>Aún no hay correos.<br>Pulsa «Redactar correo» para escribir el primero.</p></div>';
            }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } });
        }

        // Abre un correo en el mismo panel: encabezado, mensaje completo (en un marco aislado, sin scripts), adjuntos y «Responder».
        openMail(i) {
            const m = (this.items || [])[i], view = this.el.querySelector('[data-role="view"]'); if (!m || !view) { return; }
            this.detail = i;
            const date = ChUi.fmt.dt(m.at), out = m.dir === 'out';
            view.innerHTML = '<button type="button" class="btn btn-link ch-em-back" data-action="backList"><span class="fas fa-arrow-left"></span> Correos</button>' +
                `<h4 class="ch-em-dsubj">${ChUi.esc(m.subject || '(sin asunto)')}</h4>` +
                `<div class="ch-em-meta"><span>${out ? 'Enviado por' : 'De'}</span><b>${ChUi.esc(m.from || (out ? 'el equipo' : this.options.email))}</b><span>Para</span><b>${ChUi.esc(m.to || this.options.email)}</b><span>Fecha</span><b>${ChUi.esc(date)}</b></div>` +
                '<div class="ch-em-acts">' + (!out && m.messageId ? `<button type="button" class="btn btn-primary btn-sm" data-action="replyMail" data-i="${i}"><span class="fas fa-reply"></span> Responder</button>` : '') +
                `<a class="btn btn-default btn-sm" href="#Email/view/${ChUi.esc(m.id)}"><span class="fas fa-up-right-from-square"></span> Abrir en el CRM</a></div>` +
                '<div class="ch-em-att" data-role="att"></div><div class="ch-em-paper" data-role="paper"><div class="ch-em-text">Cargando el mensaje…</div></div>';
            Espo.Ajax.getRequest('Email/' + m.id).then(d => {
                const paper = this.el.querySelector('[data-role="paper"]'); if (!paper || this.detail !== i) { return; }
                if (d.isHtml && d.body) {
                    const f = document.createElement('iframe');
                    f.setAttribute('sandbox', 'allow-same-origin allow-popups allow-popups-to-escape-sandbox');   // sin scripts: el contenido de un correo nunca se ejecuta
                    f.srcdoc = '<base target="_blank"><style>body{margin:0;padding:12px 14px;font:14px/1.55 system-ui,-apple-system,Segoe UI,sans-serif;color:#1c2233;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}a{color:#2f43c4}</style>' + ChUi.linkifyHtml(d.body);
                    f.onload = () => { try { f.style.height = (f.contentDocument.documentElement.scrollHeight + 4) + 'px'; } catch (e) { f.style.height = '420px'; } };
                    paper.innerHTML = ''; paper.appendChild(f);
                } else {
                    const plain = d.bodyPlain || d.body || m.text || '(sin contenido)';
                    paper.innerHTML = `<div class="ch-em-text">${ChUi.linkify(plain)}</div>${ChUi.previews(plain)}`;
                }
                const names = d.attachmentsNames || {}, att = this.el.querySelector('[data-role="att"]');
                if (att) { att.innerHTML = Object.keys(names).map(id => { const nm = names[id].name || names[id], img = /\.(jpe?g|png|gif|webp|bmp)$/i.test(nm); return img ? `<a class="ch-att-img" href="?entryPoint=download&id=${encodeURIComponent(id)}" target="_blank" rel="noopener"><img src="?entryPoint=image&id=${encodeURIComponent(id)}&size=medium" alt="${ChUi.esc(nm)}" loading="lazy"><small>${ChUi.esc(nm)}</small></a>` : `<a href="?entryPoint=download&id=${encodeURIComponent(id)}" target="_blank" rel="noopener"><span class="fas fa-paperclip"></span>${ChUi.esc(nm)}</a>`; }).join(''); }
            }).catch(xhr => {
                if (xhr) { xhr.errorIsHandled = true; }
                const paper = this.el.querySelector('[data-role="paper"]'); if (paper) { paper.innerHTML = `<div class="ch-em-text">${ChUi.esc(m.text || '(no se pudo cargar el mensaje)')}</div>`; }
            });
        }
    };
});
