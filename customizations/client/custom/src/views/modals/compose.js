// Redactar correo (botón «Nuevo», «Responder», «Reenviar»): panel lateral que envía como el usuario, con su nombre y su firma.
define('custom:views/modals/compose', ['views/modal', 'custom:ui', 'custom:split', 'custom:mail-send', 'custom:tpl'], function (Dep, ChUi, Split, MailSend, Tpl) {
    return class extends Dep {
        className = 'dialog ch-ch-panel ch-mail-modal'
        backdrop = false
        templateContent = '<div class="ch-mail"></div>'

        events = {
            'click [data-action="sendMail"]': function () { this.send(); },
            'click [data-action="cancelMail"]': function () { this.close(); },
            'click [data-action="pickTpl"]': function (e) { this.applyTemplate(e.currentTarget.dataset.id); },
            'click [data-action="pickMine"]': function (e) { this.applyMine(e.currentTarget.dataset.id); },
        }

        setup() {
            this.buttonList = [];
            this.attrs = this.options.attributes || {};
            this.headerHtml = '<span class="fas fa-pen"></span> <span class="ch-chat-title"><b>Escribir correo</b><small>Se envía con tu nombre y tu firma</small></span>';
            this.replyTo = null;
            // las respuestas guardan a quién se contestan para que el hilo se mantenga
            if (this.attrs.repliedId) {
                Espo.Ajax.getRequest('Email/' + this.attrs.repliedId, {select: 'messageId'}).then(r => { if (r.messageId) { this.replyTo = {messageId: r.messageId, refs: []}; } }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } });
            }
        }

        onRemove() { if (this._chSplit) { this._chSplit = false; Split.close('ch'); } }

        afterRender() {
            if (!this._chSplit) { this._chSplit = true; Split.open('ch'); }
            const a = this.attrs, to = [].concat(a.to || a.emailAddress || []).join(', ').replace(/;/g, ',');
            const quoted = a.body ? MailSend.quoteHtml(MailSend.toText(a.body)) : '';
            this.el.querySelector('.ch-mail').innerHTML = '<div class="ch-mail-compose" style="margin:0">' +
                '<label>Plantillas <a class="ch-tpl-manage" href="#EmailTemplate">Administrar</a></label><div class="ch-tpl-gallery" data-role="tpls"><span class="ch-muted">Cargando plantillas…</span></div>' +
                `<label>Para</label><input name="to" value="${ChUi.esc(to)}" placeholder="cliente@empresa.com, otro@empresa.com"><label>Cc (opcional)</label><input name="cc" value="${ChUi.esc([].concat(a.cc || []).join(', ').replace(/;/g, ','))}">` +
                `<label>Asunto</label><input name="subject" maxlength="250" value="${ChUi.esc(a.name || a.subject || '')}"><label>Mensaje</label>` + MailSend.editorMarkup(9) +
                '<div class="ch-sig" data-role="sig"><span class="ch-muted">Cargando tu firma…</span></div><div class="ch-chat-err" data-role="err" hidden></div>' +
                '<div class="ch-mail-actions"><button type="button" class="btn btn-primary btn-sm" data-action="sendMail"><span class="fas fa-paper-plane"></span> Enviar</button><button type="button" class="btn btn-default btn-sm" data-action="cancelMail">Cancelar</button></div></div>';
            MailSend.mountEditor(this.el); if (quoted) { this.el.querySelector('[name="body"]').value = quoted; }
            MailSend.signature().then(r => { const s = this.el.querySelector('[data-role="sig"]'); if (s) { s.innerHTML = '<div class="ch-sig-h">Se envía como <b>' + ChUi.esc(r.name || '') + '</b> con esta firma:</div>' + (r.html || ''); } });
            Promise.all([Espo.Ajax.getRequest('EmailTemplate', {maxSize: 60, orderBy: 'name', select: 'name,subject'}).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } return {list: []}; }), Tpl.load()]).then(([r, t]) => {
                const box = this.el.querySelector('[data-role="tpls"]'); if (!box) { return; }
                this.mine = Tpl.forChannel(t, 'email');
                const chips = (mine, shared) => mine.map(x => `<button type="button" class="ch-tpl mine" data-action="pickMine" data-id="${x.id}" title="Mi plantilla"><span class="fas fa-user"></span><b>${ChUi.esc(x.name)}</b></button>`).join('') +
                    shared.map(x => `<button type="button" class="ch-tpl" data-action="pickTpl" data-id="${ChUi.esc(x.id)}" title="${ChUi.esc(x.subject || '')}"><span class="fas fa-file-lines"></span><b>${ChUi.esc(x.name)}</b></button>`).join('');
                box.innerHTML = chips(this.mine, r.list || []) || '<span class="ch-muted">Sin plantillas. Crea las tuyas en «Mis plantillas».</span>';
            });
            setTimeout(() => { const f = this.el.querySelector(to ? '[name="subject"]' : '[name="to"]'); f && f.focus(); }, 120);
        }

        applyMine(id) {
            const t = (this.mine || []).find(x => String(x.id) === String(id)); if (!t) { return; }
            const v = Tpl.vars(this.attrs.name || '', this.getUser().get('name'), this.getConfig().get('applicationName'));
            this.el.querySelector('[name="subject"]').value = Tpl.fill(t.subject, v); this.el.querySelector('[name="body"]').value = Tpl.fill(t.body, v);
        }

        applyTemplate(id) {
            const first = (this.el.querySelector('[name="to"]').value || '').split(',')[0].trim();
            Espo.Ajax.postRequest(`EmailTemplate/${id}/prepare`, {parentType: this.attrs.parentType || undefined, parentId: this.attrs.parentId || undefined, emailAddress: first || undefined}).then(r => {
                this.el.querySelector('[name="subject"]').value = MailSend.toText(r.subject); this.el.querySelector('[name="body"]').value = r.body;
            }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } });
        }

        send() {
            const q = n => this.el.querySelector(`[name="${n}"]`), err = this.el.querySelector('[data-role="err"]'), btn = this.el.querySelector('[data-action="sendMail"]');
            const to = q('to').value.split(',').map(x => x.trim()).filter(Boolean), cc = q('cc').value.split(',').map(x => x.trim()).filter(Boolean), subject = q('subject').value.trim(), body = q('body').value.trim();
            err.hidden = true;
            if (!to.length || !subject || !body) { err.hidden = false; err.textContent = 'Escribe el destinatario, el asunto y el mensaje.'; return; }
            btn.disabled = true;
            MailSend.send({to, cc, subject, body, parentType: this.attrs.parentType, parentId: this.attrs.parentId, inReplyTo: this.replyTo && this.replyTo.messageId, references: this.replyTo && this.replyTo.refs})
                .then(() => { Espo.Ui.success('Correo enviado'); this.trigger('after:send'); this.trigger('after:save'); this.close(); })
                .catch(xhr => { err.hidden = false; err.textContent = MailSend.reason(xhr); if (xhr) { xhr.errorIsHandled = true; } btn.disabled = false; });
        }
    };
});
