// Correos del registro: historial tipo bandeja y redacción dentro del mismo panel (sin ventanas aparte).
define('custom:views/modals/email-thread', ['views/modal', 'custom:ui', 'custom:split'], function (Dep, ChUi, Split) {
    return class extends Dep {
        className = 'dialog ch-ch-panel ch-mail-modal'
        backdrop = false
        templateContent = '<div class="ch-mail"></div>'

        events = {
            'click [data-action="compose"]': function () { this.toggleCompose(true); },
            'click [data-action="cancelCompose"]': function () { this.toggleCompose(false); },
            'click [data-action="sendMail"]': function () { this.send(); },
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
                `<label>Para</label><input value="${ChUi.esc(this.options.email)}" readonly><label>Asunto</label><input name="subject" maxlength="250" placeholder="Asunto">` +
                '<label>Mensaje</label><textarea name="body" rows="6" placeholder="Escribe el correo…"></textarea><div class="ch-chat-err" data-role="err" hidden></div>' +
                '<div class="ch-mail-actions"><button type="button" class="btn btn-primary btn-sm" data-action="sendMail"><span class="fas fa-paper-plane"></span> Enviar</button><button type="button" class="btn btn-default btn-sm" data-action="cancelCompose">Cancelar</button></div>';
            setTimeout(() => { const i = box.querySelector('[name="subject"]'); i && i.focus(); }, 50);
        }

        send() {
            const box = this.el.querySelector('[data-role="compose"]'), err = box.querySelector('[data-role="err"]');
            const subject = (box.querySelector('[name="subject"]').value || '').trim(), body = (box.querySelector('[name="body"]').value || '').trim();
            if (!subject || !body) { err.hidden = false; err.textContent = 'Escribe el asunto y el mensaje.'; return; }
            err.hidden = true;
            const btn = box.querySelector('[data-action="sendMail"]'); btn.disabled = true;
            Espo.Ajax.postRequest('Email', {name: subject, body: body.replace(/\n/g, '<br>'), bodyPlain: body, isHtml: true, to: this.options.email, status: 'Sending', parentType: this.scope, parentId: this.options.leadId})
                .then(() => { Espo.Ui.success('Correo enviado'); this.toggleCompose(false); this.trigger('done'); setTimeout(() => this.load(), 600); })
                .catch(xhr => {
                    err.hidden = false;
                    err.textContent = (xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason')) || 'No se pudo enviar el correo. Revisa la configuración de correo saliente.';
                    if (xhr) { xhr.errorIsHandled = true; }
                }).then(() => { btn.disabled = false; });
        }

        load() {
            Espo.Ajax.getRequest('CrmHub/leadTimeline', {leadId: this.options.leadId, scope: this.scope, kind: 'emails'}).then(r => {
                const list = this.el.querySelector('[data-role="list"]'); if (!list) { return; }
                const items = r.items || [];
                list.innerHTML = items.length ? items.map(m => `<div class="ch-mail-item ch-mail-${m.dir}"><div class="ch-mail-head"><span class="ch-mail-dir"><span class="fas ${m.dir === 'out' ? 'fa-arrow-up-right-from-square' : 'fa-inbox'}"></span> ${m.dir === 'out' ? 'Enviado' : 'Recibido'}</span>` +
                    `<b class="ch-mail-subj">${ChUi.esc(m.subject || '(sin asunto)')}</b><span class="ch-mail-date">${ChUi.esc(ChUi.fmt.dt(m.at))}</span></div>` +
                    `<div class="ch-mail-sub">${m.dir === 'out' ? 'Para: ' + ChUi.esc(m.to || this.options.email) : 'De: ' + ChUi.esc(m.from || this.options.email)}</div><div class="ch-mail-body">${ChUi.esc(m.text)}</div></div>`).join('')
                    : '<div class="ch-chat-empty"><span class="fas fa-envelope-open"></span><p>Aún no hay correos.<br>Pulsa «Redactar correo» para escribir el primero.</p></div>';
            }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } });
        }
    };
});
