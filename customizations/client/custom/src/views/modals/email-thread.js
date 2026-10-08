// Correos del registro: historial tipo bandeja y redacción dentro del mismo panel (sin ventanas aparte).
define('custom:views/modals/email-thread', ['views/modal', 'custom:ui', 'custom:split', 'custom:mail-send'], function (Dep, ChUi, Split, MailSend) {
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
                '<label>Mensaje</label><textarea name="body" rows="6" placeholder="Escribe el correo…"></textarea><div class="ch-sig" data-role="sig"><span class="ch-muted">Cargando tu firma…</span></div><div class="ch-chat-err" data-role="err" hidden></div>' +
                '<div class="ch-mail-actions"><button type="button" class="btn btn-primary btn-sm" data-action="sendMail"><span class="fas fa-paper-plane"></span> Enviar</button><button type="button" class="btn btn-default btn-sm" data-action="saveTpl"><span class="far fa-floppy-disk"></span> Guardar como plantilla</button><button type="button" class="btn btn-default btn-sm" data-action="cancelCompose">Cancelar</button></div>';
            this.loadTemplates();
            MailSend.signature().then(r => { const s = this.el.querySelector('[data-role="sig"]'); if (s) { s.innerHTML = '<div class="ch-sig-h">Se envía como <b>' + ChUi.esc(r.name || '') + '</b> con esta firma:</div>' + (r.html || ''); } });
            setTimeout(() => { const i = box.querySelector('[name="subject"]'); i && i.focus(); }, 50);
        }

        loadTemplates() {
            Espo.Ajax.getRequest('EmailTemplate', {maxSize: 60, orderBy: 'name', select: 'name,subject'}).then(r => {
                const box = this.el.querySelector('[data-role="tpls"]'); if (!box) { return; }
                this.templates = r.list || [];
                box.innerHTML = this.templates.length ? this.templates.map(x => `<button type="button" class="ch-tpl" data-action="pickTpl" data-id="${ChUi.esc(x.id)}" title="${ChUi.esc(x.subject || '')}"><span class="fas fa-file-lines"></span><b>${ChUi.esc(x.name)}</b></button>`).join('')
                    : '<span class="ch-muted">Aún no hay plantillas. Escribe un correo y usa «Guardar como plantilla».</span>';
            }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } const box = this.el.querySelector('[data-role="tpls"]'); if (box) { box.innerHTML = '<span class="ch-muted">No se pudieron cargar las plantillas.</span>'; } });
        }

        // Rellena asunto y mensaje con la plantilla (ya con el nombre del cliente y del asesor); sigue siendo editable antes de enviar
        applyTemplate(id) {
            const box = this.el.querySelector('[data-role="compose"]'), subj = box.querySelector('[name="subject"]'), body = box.querySelector('[name="body"]');
            const go = () => Espo.Ajax.postRequest(`EmailTemplate/${id}/prepare`, {parentType: this.scope, parentId: this.options.leadId, emailAddress: this.options.email}).then(r => {
                subj.value = toText(r.subject); body.value = toText(r.body); body.focus();
                box.querySelectorAll('.ch-tpl').forEach(b => b.classList.toggle('on', b.dataset.id === id));
            }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } const e = box.querySelector('[data-role="err"]'); e.hidden = false; e.textContent = 'No se pudo cargar la plantilla.'; });
            if ((subj.value.trim() || body.value.trim()) && !box.querySelector('.ch-tpl.on')) {
                ChUi.confirm({title: 'Usar plantilla', text: 'Se reemplazará el asunto y el mensaje que ya escribiste. ¿Continuar?', ok: 'Usar plantilla'}).then(yes => { if (yes) { go(); } });
            } else { go(); }
        }

        saveAsTemplate() {
            const box = this.el.querySelector('[data-role="compose"]'), subject = box.querySelector('[name="subject"]').value.trim(), body = box.querySelector('[name="body"]').value.trim();
            if (!subject || !body) { const e = box.querySelector('[data-role="err"]'); e.hidden = false; e.textContent = 'Escribe el asunto y el mensaje para guardarlos como plantilla.'; return; }
            ChUi.prompt({title: 'Guardar como plantilla', label: 'Nombre de la plantilla', required: true, min: 3, rows: 1, max: 80, ok: 'Guardar', hint: 'Queda disponible para ti y tu equipo. Puedes usar {Person.firstName} y {User.name} para personalizar.'}).then(name => {
                if (!name) { return; }
                Espo.Ajax.postRequest('EmailTemplate', {name, subject, body: body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>'), isHtml: true})
                    .then(() => { Espo.Ui.success('Plantilla guardada'); this.loadTemplates(); })
                    .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('No se pudo guardar la plantilla'); });
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
