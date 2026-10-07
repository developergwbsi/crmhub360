// Correos con el lead: historial tipo bandeja y botón para redactar.
define('custom:views/modals/email-thread', ['views/modal', 'custom:ui'], function (Dep, ChUi) {
    return class extends Dep {
        className = 'dialog ch-mail-modal'
        templateContent = '<div class="ch-mail"></div>'

        events = {
            'click [data-action="compose"]': function () { this.compose(); },
            'click .ch-mail-item': function (e) { e.currentTarget.classList.toggle('open'); },
        }

        setup() {
            this.buttonList = [];
            this.headerHtml = `<span class="fas fa-envelope"></span> <span class="ch-chat-title"><b>${ChUi.esc(this.options.name || '')}</b><small>${ChUi.esc(this.options.email || '')} · Correos</small></span>`;
        }

        afterRender() {
            this.el.querySelector('.ch-mail').innerHTML = '<div class="ch-mail-bar"><button type="button" class="btn btn-primary" data-action="compose"><span class="fas fa-pen"></span> Redactar correo</button></div><div class="ch-mail-list" data-role="list"><div class="ch-chat-empty">Cargando…</div></div>';
            this.load();
        }

        load() {
            Espo.Ajax.getRequest('CrmHub/leadTimeline', {leadId: this.options.leadId, kind: 'emails'}).then(r => {
                const list = this.el.querySelector('[data-role="list"]'); if (!list) { return; }
                const items = r.items || [];
                list.innerHTML = items.length ? items.map(m => `<div class="ch-mail-item ch-mail-${m.dir}"><div class="ch-mail-head"><span class="ch-mail-dir"><span class="fas ${m.dir === 'out' ? 'fa-arrow-up-right-from-square' : 'fa-inbox'}"></span> ${m.dir === 'out' ? 'Enviado' : 'Recibido'}</span>` +
                    `<b class="ch-mail-subj">${ChUi.esc(m.subject || '(sin asunto)')}</b><span class="ch-mail-date">${ChUi.esc(ChUi.fmt.dt(m.at))}</span></div>` +
                    `<div class="ch-mail-sub">${m.dir === 'out' ? 'Para: ' + ChUi.esc(m.to || this.options.email) : 'De: ' + ChUi.esc(m.from || this.options.email)}</div><div class="ch-mail-body">${ChUi.esc(m.text)}</div></div>`).join('')
                    : '<div class="ch-chat-empty"><span class="fas fa-envelope-open"></span><p>Aún no hay correos con este lead.<br>Pulsa «Redactar correo» para escribir el primero.</p></div>';
            }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } });
        }

        compose() {
            this.createView('compose', 'views/modals/compose-email', {
                attributes: {to: this.options.email, parentType: 'Lead', parentId: this.options.leadId, parentName: this.options.name, name: ''},
            }, v => { v.render(); this.listenToOnce(v, 'after:save', () => { this.trigger('done'); setTimeout(() => this.load(), 800); }); });
        }
    };
});
