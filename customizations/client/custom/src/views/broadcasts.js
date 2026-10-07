define('custom:views/broadcasts', ['view'], function (Dep) {
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const STATUS = {running: ['En envío', 'info'], scheduled: ['Programada', 'warning'], paused: ['En pausa', 'warning'], done: ['Terminada', 'success'], cancelled: ['Cancelada', 'danger']};

    return class extends Dep {
        template = 'custom:broadcasts'
        state = null
        wizard = false
        audience = null
        timer = null

        setup() {
            this.getHelper().pageTitle.setTitle('Mensajes masivos');
            this.load();
            this.timer = setInterval(() => { if (!this.wizard && this.isRendered()) { this.load(true); } }, 8000);
        }

        onRemove() { clearInterval(this.timer); }

        load(silent) {
            Espo.Ajax.getRequest('CrmHub/broadcasts')
                .then(s => { this.state = s; if (silent) { this.renderList(); } else { this.reRender(); } })
                .catch(xhr => { if (!silent) { this.state = {error: true}; this.reRender(); } if (xhr) { xhr.errorIsHandled = true; } });
        }

        data() {
            const s = this.state;
            if (!s || s.error) { return {loading: !s, error: !!(s && s.error)}; }
            const meta = this.getMetadata();
            const opts = (path, tr) => (meta.get(path) || []).filter(Boolean).map(v => ({value: v, label: this.getLanguage().translateOption(v, tr, 'Lead')}));
            return {
                loading: false, wizard: this.wizard, vars: ['{nombre}', '{primer_nombre}', '{servicio}', '{asesor}', '{empresa}'].map(v => ({v})),
                channels: Object.keys(s.channels).map(k => ({key: k, label: s.channels[k].label, ready: s.channels[k].ready, max: s.channels[k].max})),
                anyReady: Object.values(s.channels).some(c => c.ready),
                statuses: opts('entityDefs.Lead.fields.status.options', 'status'), quals: opts('entityDefs.Lead.fields.qualificationStatus.options', 'qualificationStatus'),
                sources: opts('entityDefs.Lead.fields.source.options', 'source'), prefs: opts('entityDefs.Lead.fields.preferredChannel.options', 'preferredChannel'),
            };
        }

        afterRender() {
            super.afterRender();
            if (this.state && !this.state.error) { this.renderList(); }
            if (this.wizard) {
                Espo.Ajax.getRequest('CrmHub/assignees').then(us => {
                    const $sel = this.$el.find('[name="f_assigned"]');
                    us.forEach(u => $sel.append(`<option value="${esc(u.id)}">${esc(u.name)}</option>`));
                }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } });
                const first = this.$el.find('[name="bc_channel"]:not(:disabled)').first(); if (first.length) { first.prop('checked', true); }
                this.updatePreview();
            }
        }

        renderList() {
            const items = (this.state && this.state.items) || [];
            const rows = items.map(b => {
                const done = b.sent + b.failed + b.skipped, pct = b.total ? Math.round(100 * done / b.total) : 0, st = STATUS[b.status] || [b.status, 'default'];
                return `<tr>
                    <td><b>${esc(b.name)}</b><div class="ch-muted ch-small">${esc(b.created_by || '')} · ${esc(String(b.created_at).slice(0, 16).replace('T', ' '))}</div></td>
                    <td>${esc({whatsapp: 'WhatsApp', sms: 'SMS', telegram: 'Telegram'}[b.channel])}</td>
                    <td><span class="label label-${st[1]}">${st[0]}</span></td>
                    <td style="min-width:200px"><div class="ch-bar-track"><i style="display:block;height:100%;width:${pct}%;background:var(--ch-primary)"></i></div>
                        <div class="ch-small ch-muted">${b.sent} enviados · ${b.failed} fallidos · ${b.skipped} omitidos · ${b.pending} pendientes de ${b.total}</div></td>
                    <td class="ch-nowrap">
                        ${['running', 'scheduled'].includes(b.status) ? `<button class="btn btn-default btn-sm" data-action="bcAct" data-id="${b.id}" data-act="pause">Pausar</button>` : ''}
                        ${b.status === 'paused' ? `<button class="btn btn-default btn-sm" data-action="bcAct" data-id="${b.id}" data-act="resume">Reanudar</button>` : ''}
                        ${['running', 'scheduled', 'paused'].includes(b.status) ? `<button class="btn btn-link text-danger btn-sm" data-action="bcAct" data-id="${b.id}" data-act="cancel">Cancelar</button>` : ''}
                        <button class="btn btn-link btn-sm" data-action="bcDetail" data-id="${b.id}">Detalle</button></td></tr>`;
            }).join('') || '<tr><td colspan="5" class="ch-muted">Aún no hay campañas. Crea la primera con «Nueva campaña».</td></tr>';
            this.$el.find('.ch-bc-list').html(rows);
        }

        filters() {
            const multi = n => this.$el.find(`[name="${n}"]:checked`).map((i, e) => e.value).get();
            return {statuses: multi('f_status'), qualifications: multi('f_qual'), sources: multi('f_source'), channels: multi('f_pref'),
                days: parseInt(this.$el.find('[name="f_days"]').val() || '0', 10) || null, service: (this.$el.find('[name="f_service"]').val() || '').trim() || null,
                assigned: this.$el.find('[name="f_assigned"]').val() || null};
        }

        channel() { return this.$el.find('[name="bc_channel"]:checked').val(); }

        updatePreview() {
            const t = this.$el.find('[name="bc_text"]').val() || '';
            const ex = t.replace(/\{nombre\}/g, 'María Gómez').replace(/\{primer_nombre\}/g, 'María').replace(/\{servicio\}/g, 'Resolución de deudas').replace(/\{asesor\}/g, 'Carlos').replace(/\{empresa\}/g, 'Tu empresa');
            const foot = this.$el.find('[name="bc_footer"]').is(':checked') && !/baja/i.test(t) ? (this.channel() === 'sms' ? ' Responde BAJA para no recibir mas.' : '\nPara no recibir más mensajes responde BAJA.') : '';
            this.$el.find('[data-role="preview"]').text((ex + foot) || 'Aquí verás cómo queda el mensaje.');
            this.$el.find('[data-role="count"]').text(`${t.length} caracteres`);
        }

        events = {
            'click [data-action="bcNew"]': function () { this.wizard = true; this.audience = null; this.reRender(); },
            'click [data-action="bcCancelWizard"]': function () { this.wizard = false; this.reRender(); },
            'input [name="bc_text"], change [name="bc_footer"], change [name="bc_channel"]': function () { this.updatePreview(); },
            'click [data-action="bcVar"]': function (e) {
                const ta = this.$el.find('[name="bc_text"]')[0], v = e.currentTarget.dataset.v;
                ta.setRangeText(v, ta.selectionStart, ta.selectionEnd, 'end'); ta.focus(); this.updatePreview();
            },
            'click [data-action="bcAudience"]': function () {
                const $s = this.$el.find('[data-role="audience"]').text('Calculando…');
                Espo.Ajax.postRequest('CrmHub/broadcast/audience', {channel: this.channel(), filters: this.filters()})
                    .then(r => { this.audience = r.count; $s.html(`<b>${r.count}</b> destinatarios con medio de contacto${r.sample.length ? ' · p. ej.: ' + r.sample.map(esc).join(', ') : ''}`); })
                    .catch(xhr => { $s.text('No se pudo calcular'); if (xhr) { xhr.errorIsHandled = true; } });
            },
            'click [data-action="bcSend"]': function () {
                const name = (this.$el.find('[name="bc_name"]').val() || '').trim(), text = this.$el.find('[name="bc_text"]').val() || '';
                if (!name || !text.trim()) { Espo.Ui.warning('Escribe el nombre y el mensaje de la campaña.'); return; }
                if (!this.audience) { Espo.Ui.warning('Primero pulsa «Calcular audiencia».'); return; }
                const when = parseInt(this.$el.find('[name="bc_when"]').val() || '0', 10), per = parseInt(this.$el.find('[name="bc_rate"]').val() || '20', 10);
                const mins = Math.ceil(this.audience / per);
                if (!confirm(`Se enviará «${name}» por ${this.channel().toUpperCase()} a ${this.audience} personas, ${per} por minuto (≈ ${mins} min).\n¿Confirmas el envío?`)) { return; }
                Espo.Ui.notify('Creando campaña…');
                Espo.Ajax.postRequest('CrmHub/broadcast', {name, channel: this.channel(), text, filters: this.filters(), perMinute: per, footer: this.$el.find('[name="bc_footer"]').is(':checked'), startInMinutes: when})
                    .then(() => { Espo.Ui.success('Campaña creada'); this.wizard = false; this.load(); })
                    .catch(xhr => {
                        const r = xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason');
                        Espo.Ui.error(r || 'No se pudo crear la campaña'); if (xhr) { xhr.errorIsHandled = true; }
                    });
            },
            'click [data-action="bcAct"]': function (e) {
                const d = e.currentTarget.dataset;
                if (d.act === 'cancel' && !confirm('¿Cancelar la campaña? Los mensajes pendientes no se enviarán.')) { return; }
                Espo.Ajax.postRequest(`CrmHub/broadcasts/${d.id}/${d.act}`, {}).then(() => this.load(true))
                    .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('No se pudo aplicar la acción'); });
            },
            'click [data-action="bcDetail"]': function (e) {
                Espo.Ajax.getRequest('CrmHub/broadcasts/' + e.currentTarget.dataset.id).then(b => {
                    const prob = b.problems.length ? '<ul>' + b.problems.map(p => `<li>Lead <a href="#Lead/view/${esc(p.lead_id)}">${esc(p.lead_id)}</a> — ${p.status === 'failed' ? 'falló' : 'omitido'}: ${esc(p.error)}</li>`).join('') + '</ul>' : '<p class="ch-muted">Sin problemas.</p>';
                    this.createView('bcd', 'views/modal', {headerText: b.name, templateContent: `<p class="ch-muted">Mensaje enviado:</p><pre class="ch-pre">${esc(b.text)}</pre><h5>Problemas (primeros 50)</h5>${prob}`,
                        buttonList: [{name: 'cancel', label: 'Cerrar'}]}, v => v.render());
                });
            },
        }
    };
});
