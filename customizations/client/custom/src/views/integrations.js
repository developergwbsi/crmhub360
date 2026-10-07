define('custom:views/integrations', ['view'], function (Dep) {
    return class extends Dep {
        template = 'custom:integrations'

        state = null
        services = null
        showToken = false

        setup() {
            this.getHelper().pageTitle.setTitle('Integraciones');
            this.load();
        }

        load() {
            Espo.Ajax.getRequest('CrmHub/integrations')
                .then(s => { this.state = s; this.services = JSON.parse(JSON.stringify(s.services)); this.reRender(); })
                .catch(xhr => { this.state = {error: true}; this.reRender(); if (xhr) { xhr.errorIsHandled = true; } });
        }

        data() {
            const s = this.state;
            if (!s || s.error) {
                return {loading: !s, error: !!(s && s.error)};
            }
            const base = 'https://' + s.host + '/hub';
            const tk = this.showToken ? s.token : '••••••••••••••••';
            const real = s.token;
            const rows = [
                {name: 'Facebook / Instagram Leads', icon: 'fab fa-facebook', method: 'GET + POST',
                 url: `${base}/facebook?token=${tk}`, copy: `${base}/facebook?token=${real}`,
                 note: 'URL de devolución de llamada del webhook de Meta. Token de verificación: el mismo token.'},
                {name: 'WhatsApp (Evolution API)', icon: 'fab fa-whatsapp', method: 'POST',
                 url: `${base}/evolution`, copy: `${base}/evolution`,
                 note: 'Evento MESSAGES_UPSERT. Agrega el encabezado apikey con el token.'},
                {name: 'Formulario web', icon: 'fas fa-globe', method: 'POST (JSON)',
                 url: `${base}/web?token=${tk}`, copy: `${base}/web?token=${real}`,
                 note: 'Cuerpo: {"name","phone","email","source"}.'},
            ];
            const jobs = {};
            (s.jobs || []).forEach(j => { jobs[j.status] = (jobs[j.status] || 0) + j.n; });
            return {
                loading: false, rows, s, showToken: this.showToken,
                active: s.status === 'active', jobsDone: jobs.done || 0, jobsError: jobs.error || 0,
                license: s.licenseUntil || 'Sin vencimiento',
            };
        }

        events = {
            'click [data-action="toggleToken"]': function () { this.showToken = !this.showToken; this.reRender(); },
            'click [data-action="copy"]': function (e) {
                const v = e.currentTarget.dataset.value;
                (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject())
                    .then(() => Espo.Ui.success('Copiado'))
                    .catch(() => Espo.Ui.warning('No se pudo copiar; selecciónalo manualmente'));
            },
            'click [data-action="saveWhatsapp"]': function () {
                const v = n => (this.$el.find(`[name="${n}"]`).val() || '').trim();
                this.save({evolution_url: v('wa_url'), evolution_instance: v('wa_instance'), evolution_apikey: v('wa_key')});
            },
            'click [data-action="testWhatsapp"]': function () {
                const $s = this.$el.find('[data-role="waStatus"]');
                $s.text('Probando…').removeClass('text-danger text-success');
                Espo.Ajax.postRequest('CrmHub/whatsapp/test', {})
                    .then(r => $s.text(r.connected ? 'Conectado ✔ (WhatsApp vinculado)' : 'Instancia encontrada, pero el estado es «' + r.state + '». Vincula el teléfono en Evolution.')
                        .addClass(r.connected ? 'text-success' : 'text-danger'))
                    .catch(xhr => {
                        const reason = xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason');
                        $s.text(reason || 'No se pudo probar').addClass('text-danger');
                        if (xhr) { xhr.errorIsHandled = true; }
                    });
            },
            'click [data-action="addService"]': function () {
                this.services.push({key: '', name: 'Nuevo servicio', enabled: true, conditions: []});
                this.renderServices();
            },
            'click [data-action="removeService"]': function (e) {
                const i = +e.currentTarget.dataset.i;
                if (confirm('¿Eliminar el servicio «' + this.services[i].name + '»?')) {
                    this.services.splice(i, 1);
                    this.renderServices();
                }
            },
            'click [data-action="moveService"]': function (e) {
                const i = +e.currentTarget.dataset.i, d = +e.currentTarget.dataset.d, j = i + d;
                if (j < 0 || j >= this.services.length) { return; }
                [this.services[i], this.services[j]] = [this.services[j], this.services[i]];
                this.renderServices();
            },
            'click [data-action="addCondition"]': function (e) {
                this.services[+e.currentTarget.dataset.i].conditions.push({field: 'overdue_debt', op: '>=', value: 0});
                this.renderServices();
            },
            'click [data-action="removeCondition"]': function (e) {
                this.services[+e.currentTarget.dataset.i].conditions.splice(+e.currentTarget.dataset.j, 1);
                this.renderServices();
            },
            'change [data-bind]': function (e) {
                const el = e.currentTarget, i = +el.dataset.i, j = el.dataset.j === undefined ? null : +el.dataset.j;
                const svc = this.services[i], what = el.dataset.bind;
                if (what === 'name') { svc.name = el.value; }
                else if (what === 'enabled') { svc.enabled = el.checked; }
                else {
                    const c = svc.conditions[j];
                    if (what === 'field') {
                        c.field = el.value === '__custom__' ? 'lead:' : el.value;
                        this.renderServices();
                    } else if (what === 'custom') { c.field = 'lead:' + el.value.trim(); }
                    else if (what === 'op') { c.op = el.value; }
                    else if (what === 'value') {
                        const n = Number(el.value.replace(/[$.\s]/g, '').replace(',', '.'));
                        c.value = el.value.trim() !== '' && !isNaN(n) && /^[\d.,$\s-]+$/.test(el.value) ? n : el.value;
                    }
                }
            },
            'click [data-action="saveServices"]': function () { this.save({services: this.services}); },
            'click [data-action="resetServices"]': function () {
                if (!confirm('Se reemplazarán tus servicios y filtros por los valores iniciales. ¿Continuar?')) { return; }
                Espo.Ajax.postRequest('CrmHub/integrations/reset-services', {})
                    .then(() => { Espo.Ui.success('Valores iniciales restaurados'); this.load(); });
            },
            'click [data-action="saveFacebook"]': function () {
                const t = (this.$el.find('[name="fb_page_token"]').val() || '').trim();
                if (!t) { Espo.Ui.warning('Ingresa el token de página'); return; }
                this.save({fb_page_token: t});
            },
        }

        afterRender() {
            super.afterRender();
            if (this.services) { this.renderServices(); }
        }

        renderServices() {
            const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
            const metrics = this.state.metrics, ops = this.state.ops;
            const html = this.services.map((svc, i) => {
                const conds = svc.conditions.map((c, j) => {
                    const custom = String(c.field).startsWith('lead:');
                    const fopts = metrics.map(m => `<option value="${m.key}" ${c.field === m.key ? 'selected' : ''}>${esc(m.label)}</option>`).join('')
                        + `<option value="__custom__" ${custom ? 'selected' : ''}>Otro campo del lead…</option>`;
                    const oopts = ops.map(o => `<option ${c.op === o ? 'selected' : ''}>${esc(o)}</option>`).join('');
                    return `<div class="ch-cond">
                        <select class="form-control" data-bind="field" data-i="${i}" data-j="${j}">${fopts}</select>
                        ${custom ? `<input class="form-control" data-bind="custom" data-i="${i}" data-j="${j}" value="${esc(String(c.field).slice(5))}" placeholder="campo técnico (ej. source)">` : ''}
                        <select class="form-control ch-op" data-bind="op" data-i="${i}" data-j="${j}">${oopts}</select>
                        <input class="form-control ch-val" data-bind="value" data-i="${i}" data-j="${j}" value="${esc(typeof c.value === 'number' && Math.abs(c.value) >= 1000 ? c.value.toLocaleString('es-CO') : c.value)}">
                        <button class="btn btn-link" title="Quitar condición" data-action="removeCondition" data-i="${i}" data-j="${j}"><span class="fas fa-times"></span></button>
                    </div>`;
                }).join('') || '<div class="ch-muted ch-small">Sin condiciones: este servicio siempre se sugiere.</div>';
                return `<div class="ch-service ${svc.enabled ? '' : 'ch-off'}">
                    <div class="ch-service-head">
                        <span class="ch-prio">${i + 1}</span>
                        <input class="form-control ch-svc-name" data-bind="name" data-i="${i}" value="${esc(svc.name)}" placeholder="Nombre del servicio">
                        <label class="ch-switch"><input type="checkbox" data-bind="enabled" data-i="${i}" ${svc.enabled ? 'checked' : ''}> Activo</label>
                        <button class="btn btn-link" title="Subir prioridad" data-action="moveService" data-i="${i}" data-d="-1"><span class="fas fa-arrow-up"></span></button>
                        <button class="btn btn-link" title="Bajar prioridad" data-action="moveService" data-i="${i}" data-d="1"><span class="fas fa-arrow-down"></span></button>
                        <button class="btn btn-link text-danger" title="Eliminar servicio" data-action="removeService" data-i="${i}"><span class="far fa-trash-alt"></span></button>
                    </div>
                    <div class="ch-service-body">${conds}
                        <button class="btn btn-default btn-sm" data-action="addCondition" data-i="${i}"><span class="fas fa-plus"></span> Condición</button>
                    </div>
                </div>`;
            }).join('');
            this.$el.find('.ch-services').html(html);
        }

        save(body) {
            Espo.Ui.notify('Guardando…');
            Espo.Ajax.putRequest('CrmHub/integrations', body)
                .then(() => { Espo.Ui.success('Guardado'); this.load(); })
                .catch(xhr => {
                    const reason = xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason');
                    Espo.Ui.error(reason || 'No se pudo guardar');
                    if (xhr) { xhr.errorIsHandled = true; }
                });
        }
    };
});
