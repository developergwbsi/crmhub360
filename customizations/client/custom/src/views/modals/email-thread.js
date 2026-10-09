// Correos del registro: historial tipo bandeja y redacción dentro del mismo panel (sin ventanas aparte).
define('custom:views/modals/email-thread', ['views/modal', 'custom:ui', 'custom:split', 'custom:mail-send', 'custom:tpl'], function (Dep, ChUi, Split, MailSend, Tpl) {
    // HTML de una plantilla → texto editable (el correo se envía con saltos de línea convertidos a HTML)
    const toText = h => String(h || '').replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n').replace(/<li[^>]*>/gi, '• ').replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\n{3,}/g, '\n\n').trim();
    return class extends Dep {
        className = 'dialog ch-ch-panel ch-mail-modal'
        backdrop = false
        templateContent = '<div class="ch-mail"></div>'

        events = {
            'click [data-action="compose"]': function () { this.toggleCompose(true); },
            'click [data-action="cancelCompose"]': function () { this.toggleCompose(false); },
            'click [data-action="sendMail"]': function () { this.send(); },
            'click [data-action="pickTpl"]': function (e) { this.applyTemplate(e.currentTarget.dataset.id); },
            'click [data-action="pickMine"]': function (e) { this.applyMine(e.currentTarget.dataset.id); },
            'click [data-action="saveTpl"]': function () { this.saveAsTemplate(); },
            'click [data-action="replyMail"]': function (e) { e.stopPropagation(); const m = this.items[+e.currentTarget.dataset.i]; this.replyTo = {messageId: m.messageId, refs: m.refs || []}; this.toggleCompose(true); const s = this.el.querySelector('[name="subject"]'); s.value = /^re:/i.test(m.subject) ? m.subject : 'Re: ' + m.subject; this.el.querySelector('[name="body"]').focus(); },
            'click .ch-mail-item': function (e) { e.currentTarget.classList.toggle('open'); },
        }

        setup() {
            this.buttonList = [];
            this.scope = this.options.scope || 'Lead';
            this.headerHtml = `<span class="fas fa-envelope"></span> <span class="ch-chat-title"><b>${ChUi.esc(this.options.name || '')}</b><small>${ChUi.esc(this.options.email || '')} · Correos</small></span>`;
        }

        onRemove() { if (this._chSplit) { this._chSplit = false; Split.close('ch'); } }

        afterRender() {
            if (!this._chSplit) { this._chSplit = true; Split.open('ch'); }
            this.el.querySelector('.ch-mail').innerHTML = '<div class="ch-mail-bar"><button type="button" class="btn btn-primary btn-sm" data-action="compose"><span class="fas fa-pen"></span> Redactar correo</button></div>' +
                '<div class="ch-mail-compose" data-role="compose" hidden></div><div class="ch-mail-list" data-role="list"><div class="ch-chat-empty">Cargando…</div></div>';
            Espo.Ajax.getRequest('CrmHub/channels').catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } return {}; }).then(ch => { this.channels = ch || {}; });
            this.load();
        }

        toggleCompose(on) {
            const box = this.el.querySelector('[data-role="compose"]');
            if (!on) { box.hidden = true; box.innerHTML = ''; return; }
            const ready = this.channels && this.channels.email;
            box.hidden = false;
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
                .then(() => { Espo.Ui.success('Correo enviado'); this.replyTo = null; this.toggleCompose(false); this.trigger('done'); setTimeout(() => this.load(), 900); })
                .catch(xhr => { err.hidden = false; err.textContent = MailSend.reason(xhr); if (xhr) { xhr.errorIsHandled = true; } })
                .then(() => { btn.disabled = false; });
        }

        load() {
            Espo.Ajax.getRequest('CrmHub/leadTimeline', {leadId: this.options.leadId, scope: this.scope, kind: 'emails'}).then(r => {
                const list = this.el.querySelector('[data-role="list"]'); if (!list) { return; }
                const items = r.items || [];
                this.items = items; list.innerHTML = items.length ? items.map((m, i) => `<div class="ch-mail-item ch-mail-${m.dir}"><div class="ch-mail-head"><span class="ch-mail-dir"><span class="fas ${m.dir === 'out' ? 'fa-arrow-up-right-from-square' : 'fa-inbox'}"></span> ${m.dir === 'out' ? 'Enviado' : 'Recibido'}</span>` +
                    `<b class="ch-mail-subj">${ChUi.esc(m.subject || '(sin asunto)')}</b><span class="ch-mail-date">${ChUi.esc(ChUi.fmt.dt(m.at))}</span></div>` +
                    `<div class="ch-mail-sub">${m.dir === 'out' ? 'Para: ' + ChUi.esc(m.to || this.options.email) : 'De: ' + ChUi.esc(m.from || this.options.email)}${m.dir === 'in' && m.messageId ? ` · <a role="button" data-action="replyMail" data-i="${i}">Responder</a>` : ''}</div><div class="ch-mail-body">${ChUi.esc(m.text)}</div></div>`).join('')
                    : '<div class="ch-chat-empty"><span class="fas fa-envelope-open"></span><p>Aún no hay correos.<br>Pulsa «Redactar correo» para escribir el primero.</p></div>';
            }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } });
        }
    };
});
