define('custom:views/my-templates', ['view', 'custom:ui', 'custom:tpl', 'custom:mail-send'], function (Dep, ChUi, Tpl, MailSend) {
    const esc = v => ChUi.esc(v == null ? '' : v);
    const SAMPLE = Tpl.vars('María Pérez', '', '');

    return class extends Dep {
        templateContent = '<div class="ch-tpls"></div>'
        data0 = null
        channel = 'email'
        editing = null     // null = lista; {} = nueva; {id,...} = editar

        setup() { this.getHelper().pageTitle.setTitle('Mis plantillas'); this.refreshData(); }
        afterRender() { this.draw(); }

        refreshData() { Tpl.load(true).then(r => { this.data0 = r; this.draw(); }); }

        vars() { return Tpl.vars(SAMPLE.nombre_completo, this.getUser().get('name'), this.getConfig().get('applicationName')); }

        draw() {
            const root = this.el && this.el.querySelector('.ch-tpls'); if (!root) { return; }
            if (!this.data0) { root.innerHTML = '<div class="ch-muted" style="padding:24px">Cargando…</div>'; return; }
            const max = this.data0.max || 10;
            const tabs = Object.keys(Tpl.CH).map(k => { const n = Tpl.forChannel(this.data0, k).length;
                return `<a class="ch-tpl-tab ${k === this.channel ? 'on' : ''}" data-act="tab" data-ch="${k}"><span class="${Tpl.CH[k].icon}" style="color:${Tpl.CH[k].color}"></span> ${Tpl.CH[k].label} <small>${n}/${max}</small></a>`; }).join('');
            const list = Tpl.forChannel(this.data0, this.channel);
            const left = `<div class="ch-sim-card"><h4>Mis plantillas de ${esc(Tpl.CH[this.channel].label)} <small class="ch-muted">${list.length} de ${max}</small></h4>` +
                (list.map(t => `<div class="ch-tpl-item ${this.editing && this.editing.id === t.id ? 'on' : ''}"><a data-act="edit" data-id="${t.id}"><b>${esc(t.name)}</b><span>${esc(this.channel === 'email' ? t.subject : String(t.body).slice(0, 70))}</span></a><a class="ch-tpl-del" data-act="del" data-id="${t.id}" title="Eliminar"><span class="far fa-trash-can"></span></a></div>`).join('') || '<div class="ch-muted">Aún no tienes plantillas de este canal.</div>') +
                `<div class="ch-mail-actions"><button class="btn btn-primary btn-sm" data-act="new" ${list.length >= max ? 'disabled title="Llegaste al máximo; elimina una para crear otra"' : ''}><span class="fas fa-plus"></span> Nueva plantilla</button></div></div>`;
            root.innerHTML = `<div class="ch-sim-head"><h3><span class="fas fa-file-lines"></span> Mis plantillas</h3>
                <p class="ch-muted">Tus propios mensajes listos para usar: son privados, solo tú los ves y puedes tener hasta ${max} por canal. Úsalos desde el panel de correo, WhatsApp, Telegram o SMS de un lead, cuenta o contacto.</p></div>
                <div class="ch-tpl-tabs">${tabs}</div><div class="ch-sim-grid">${left}<div class="ch-sim-card" data-role="editor">${this.editorHtml()}</div></div>`;
            this.bind(root);
        }

        editorHtml() {
            const e = this.editing, ch = this.channel;
            if (!e) { return '<div class="ch-muted" style="padding:30px;text-align:center"><span class="fas fa-pen-to-square" style="font-size:28px"></span><br><br>Elige una plantilla para editarla o crea una nueva.</div>'; }
            const chips = Tpl.VARS.map(([v, t]) => `<a class="ch-var" data-act="var" data-v="${esc(v)}" title="${esc(t)}">${esc(v)}</a>`).join('');
            return `<h4>${e.id ? 'Editar plantilla' : 'Nueva plantilla de ' + esc(Tpl.CH[ch].label)}</h4>
                <label>Nombre de la plantilla</label><input data-f="name" maxlength="80" value="${esc(e.name || '')}" placeholder="Ej.: Primer contacto">
                ${ch === 'email' ? `<label>Asunto</label><input data-f="subject" maxlength="250" value="${esc(e.subject || '')}" placeholder="Asunto del correo">` : ''}
                <label>Mensaje</label>${ch === 'email' ? MailSend.editorMarkup(8) : `<textarea data-f="body" rows="8" maxlength="4000" placeholder="Escribe el mensaje…">${esc(e.body || '')}</textarea>`}
                <div class="ch-var-row"><span class="ch-muted">Variables (se rellenan solas con los datos del cliente):</span> ${chips}</div>
                ${ch === 'sms' ? '<div class="ch-muted" data-role="smscount"></div>' : ''}
                <div class="ch-chat-err" data-role="err" hidden></div>
                <div class="ch-mail-actions"><button class="btn btn-primary btn-sm" data-act="save"><span class="fas fa-floppy-disk"></span> Guardar</button><button class="btn btn-default btn-sm" data-act="cancel">Cancelar</button></div>
                <div class="ch-tpl-prev"><div class="ch-sig-h">Vista previa con un cliente de ejemplo (María Pérez):</div><div data-role="prev"></div></div>`;
        }

        body() {
            const el = this.el.querySelector(this.channel === 'email' ? '.ch-ed-area' : '[data-f="body"]');
            return el ? (this.channel === 'email' ? el.value : el.value) : '';
        }

        preview() {
            const p = this.el.querySelector('[data-role="prev"]'); if (!p) { return; }
            const v = this.vars(), txt = Tpl.fill(this.body(), {...v, nombre: 'María', apellido: 'Pérez', nombre_completo: 'María Pérez'});
            if (this.channel === 'email') { p.innerHTML = '<div class="ch-prev-mail">' + (txt || '<span class="ch-muted">—</span>') + '</div>'; } else { p.innerHTML = '<div class="ch-prev-msg"></div>'; p.firstChild.textContent = txt || '—'; }
            const sc = this.el.querySelector('[data-role="smscount"]');
            if (sc) { const n = txt.length, uni = /[^\u0000-\u007F¡¿áéíóúñÑüÜÁÉÍÓÚ€£¥]/.test(txt), single = uni ? 70 : 160, multi = uni ? 67 : 153; sc.textContent = n ? `${n} caracteres · ${n <= single ? 1 : Math.ceil(n / multi)} SMS${uni ? ' (caracteres especiales: caben menos)' : ''}` : ''; }
        }

        bind(root) {
            if (this.editing) {
                if (this.channel === 'email') { MailSend.mountEditor(root); const a = root.querySelector('.ch-ed-area'); a.value = this.editing.body || ''; a.addEventListener('input', () => this.preview()); }
                else { root.querySelector('[data-f="body"]').addEventListener('input', () => this.preview()); }
                this.preview();
            }
            root.onclick = e => {
                const a = e.target.closest('[data-act]'); if (!a) { return; }
                const act = a.dataset.act, list = Tpl.forChannel(this.data0, this.channel);
                if (act === 'tab') { this.channel = a.dataset.ch; this.editing = null; this.draw(); }
                else if (act === 'new') { this.editing = {}; this.draw(); }
                else if (act === 'edit') { this.editing = list.find(t => t.id === +a.dataset.id) || null; this.draw(); }
                else if (act === 'cancel') { this.editing = null; this.draw(); }
                else if (act === 'var') { this.insertVar(a.dataset.v); }
                else if (act === 'save') { this.saveTpl(); }
                else if (act === 'del') { this.removeTpl(+a.dataset.id); }
            };
        }

        insertVar(v) {
            if (this.channel === 'email') { const a = this.el.querySelector('.ch-ed-area'); a.focus(); document.execCommand('insertText', false, v); }
            else { const t = this.el.querySelector('[data-f="body"]'), s = t.selectionStart || 0; t.value = t.value.slice(0, s) + v + t.value.slice(t.selectionEnd || s); t.focus(); t.selectionStart = t.selectionEnd = s + v.length; this.preview(); }
        }

        saveTpl() {
            const q = n => this.el.querySelector(`[data-f="${n}"]`), err = this.el.querySelector('[data-role="err"]'); err.hidden = true;
            const body = this.body().trim(), name = q('name').value.trim(), subject = this.channel === 'email' ? q('subject').value.trim() : '';
            if (name.length < 2 || !body || (this.channel === 'email' && !subject)) { err.hidden = false; err.textContent = this.channel === 'email' ? 'Escribe el nombre, el asunto y el mensaje.' : 'Escribe el nombre y el mensaje.'; return; }
            const btn = this.el.querySelector('[data-act="save"]'); btn.disabled = true;
            Espo.Ajax.postRequest('CrmHub/templateSave', {id: this.editing.id || null, channel: this.channel, name, subject, body})
                .then(() => { Espo.Ui.success('Plantilla guardada'); this.editing = null; this.refreshData(); })
                .catch(xhr => { err.hidden = false; err.textContent = Tpl.reason(xhr, 'No se pudo guardar.'); if (xhr) { xhr.errorIsHandled = true; } btn.disabled = false; });
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
