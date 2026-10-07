define('custom:views/integrations', ['view'], function (Dep) {
    return class extends Dep {
        template = 'custom:integrations'

        state = null
        services = null
        forms = null
        editing = null
        showToken = false
        tab = (function () { try { return sessionStorage.getItem('crmhub-int-tab') || 'canales'; } catch (e) { return 'canales'; } })()

        setup() {
            this.getHelper().pageTitle.setTitle('Integraciones');
            this.load();
        }

        load(keepLocal) {
            Espo.Ajax.getRequest('CrmHub/integrations')
                .then(s => {
                    this.state = s;
                    // al guardar un panel no se pierden las ediciones sin guardar de los demás
                    if (!keepLocal || !this.services) { this.services = JSON.parse(JSON.stringify(s.services)); }
                    if (!keepLocal || !this.forms) { this.forms = JSON.parse(JSON.stringify(s.forms)).map(f => ({...f, _saved: true})); }
                    this.reRender();
                })
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
                {name: 'Facebook / Instagram · Lead Ads', icon: 'fab fa-facebook', method: 'GET + POST', url: `${base}/facebook?token=${tk}`, copy: `${base}/facebook?token=${real}`,
                 note: 'Webhook de Meta (campo leadgen). Token de verificación: el mismo token.'},
                {name: 'WhatsApp · Evolution API', icon: 'fab fa-whatsapp', method: 'POST', url: `${base}/evolution`, copy: `${base}/evolution`,
                 note: 'Evento MESSAGES_UPSERT. Agrega el encabezado apikey con el token.'},
                {name: 'WhatsApp · Meta Cloud API', icon: 'fab fa-whatsapp', method: 'GET + POST', url: `${base}/whatsapp-cloud?token=${tk}`, copy: `${base}/whatsapp-cloud?token=${real}`,
                 note: 'Campo messages. Token de verificación: el mismo token.'},
                {name: 'WhatsApp · Gupshup', icon: 'fab fa-whatsapp', method: 'POST', url: `${base}/gupshup?token=${tk}`, copy: `${base}/gupshup?token=${real}`,
                 note: 'Webhook de mensajes entrantes de tu app en Gupshup.'},
                {name: 'SMS y WhatsApp · Twilio', icon: 'fas fa-comment-sms', method: 'POST', url: `${base}/twilio?token=${tk}`, copy: `${base}/twilio?token=${real}`,
                 note: 'En tu número de Twilio → «A message comes in».'},
                {name: 'SMS · proveedor genérico', icon: 'fas fa-comment-sms', method: 'POST (JSON)', url: `${base}/generic?channel=sms&token=${tk}`, copy: `${base}/generic?channel=sms&token=${real}`,
                 note: 'Webhook de SMS entrantes de tu proveedor; las rutas del JSON se definen en SMS y llamadas.'},
                {name: 'WhatsApp · proveedor genérico', icon: 'fab fa-whatsapp', method: 'POST (JSON)', url: `${base}/generic?channel=whatsapp&token=${tk}`, copy: `${base}/generic?channel=whatsapp&token=${real}`,
                 note: 'Webhook de mensajes entrantes de tu proveedor; las rutas del JSON se definen en el panel de WhatsApp.'},
                {name: 'Telegram', icon: 'fab fa-telegram', method: 'POST', url: `${base}/telegram`, copy: '',
                 note: 'Se registra solo al pulsar «Guardar y conectar» en el panel de Telegram.'},
                {name: 'Formulario externo (JSON)', icon: 'fas fa-globe', method: 'POST (JSON)', url: `${base}/web?token=${tk}`, copy: `${base}/web?token=${real}`,
                 note: 'Para formularios propios: {"name","phone","email","source","campaign"}. Los formularios del constructor no lo necesitan.'},
            ];
            const jobs = {};
            (s.jobs || []).forEach(j => { jobs[j.status] = (jobs[j.status] || 0) + j.n; });
            const prov = s.wa.provider || '';
            const provOptions = [{value: '', label: 'Sin configurar'}].concat(Object.keys(s.wa.providers).map(k => ({value: k, label: s.wa.providers[k]})))
                .map(o => ({...o, selected: o.value === prov}));
            const opts = (map, cur) => [{value: '', label: 'Sin configurar'}].concat(Object.keys(map).map(k => ({value: k, label: map[k]}))).map(o => ({...o, selected: o.value === cur}));
            const smsOptions = opts(s.sms.providers, s.sms.provider), voiceOptions = opts(s.voice.providers, s.voice.provider);
            const tabs = [
                {key: 'canales', icon: 'fas fa-comments', label: 'Canales de mensajería'}, {key: 'telefonia', icon: 'fas fa-phone-volume', label: 'SMS y llamadas'}, {key: 'formularios', icon: 'fas fa-file-lines', label: 'Formularios web'},
                {key: 'meta', icon: 'fab fa-facebook', label: 'Meta'}, {key: 'reglas', icon: 'fas fa-sliders', label: 'Servicios y filtros'},
                {key: 'sistema', icon: 'fas fa-gear', label: 'Sistema'},
            ].map(t => ({...t, active: t.key === this.tab}));
            return {
                loading: false, rows, s, showToken: this.showToken, hub: base, tabs, provOptions, smsOptions, voiceOptions,
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
            'click [data-action="tab"]': function (e) { this.tab = e.currentTarget.dataset.tab; try { sessionStorage.setItem('crmhub-int-tab', this.tab); } catch (x) { /* privado */ } this.applyTab(); },
            'change [name="wa_provider"], [name="sms_provider"], [name="voice_provider"]': function () { this.applyProvider(); },
            'click [data-action="httpPreset"]': function (e) {
                const kind = e.currentTarget.dataset.kind, p = this.httpPresets()[kind][e.currentTarget.dataset.preset];
                Object.keys(p).forEach(k => this.$el.find(`[data-http="${kind}.${k}"]`).val(p[k]));
                Espo.Ui.success('Plantilla aplicada: reemplaza los datos de ejemplo por los de tu proveedor');
            },
            'click [data-action="saveTwilio"]': function () {
                const v = n => (this.$el.find(`[name="${n}"]`).val() || '').trim();
                this.save({twilio_account_sid: v('tw_sid'), twilio_auth_token: v('tw_token'), twilio_sms_from: v('tw_sms_from'), twilio_voice_from: v('tw_voice_from')});
            },
            'click [data-action="testTwilio"]': function () {
                const $s = this.$el.find('[data-role="twStatus"]').text('Probando…').removeClass('text-danger text-success');
                Espo.Ajax.postRequest('CrmHub/twilio/test', {}).then(r => $s.text('Conectado ✔ ' + (r.name || '')).addClass('text-success')).catch(xhr => this.showError($s, xhr, 'No se pudo probar'));
            },
            'click [data-action="saveSms"]': function () {
                this.save({sms_provider: this.$el.find('[name="sms_provider"]').val(), generic_sms: this.collectHttp('sms')});
            },
            'click [data-action="testSms"]': function () {
                const $s = this.$el.find('[data-role="smsStatus"]').text('Enviando…').removeClass('text-danger text-success');
                Espo.Ajax.postRequest('CrmHub/sms/test', {to: this.$el.find('[name="sms_test_to"]').val()})
                    .then(r => $s.text('Enviado a ' + r.to + ' ✔').addClass('text-success')).catch(xhr => this.showError($s, xhr, 'No se pudo enviar'));
            },
            'click [data-action="saveVoice"]': function () {
                this.save({voice_provider: this.$el.find('[name="voice_provider"]').val(), voice_record: this.$el.find('[name="voice_record"]').is(':checked'), generic_voice: this.collectHttp('voice')});
            },
            'click [data-action="saveWhatsapp"]': function () {
                const v = n => (this.$el.find(`[name="${n}"]`).val() || '').trim();
                this.save({twilio_wa_from: v('wa_tw_from'), generic_whatsapp: this.collectHttp('whatsapp'), wa_provider: v('wa_provider'), evolution_url: v('wa_url'), evolution_instance: v('wa_instance'), evolution_apikey: v('wa_key'),
                    meta_phone_number_id: v('meta_pid'), meta_access_token: v('meta_token'),
                    gupshup_source: v('gs_source'), gupshup_app_name: v('gs_app'), gupshup_api_key: v('gs_key')});
            },
            'click [data-action="testWhatsapp"]': function () {
                const $s = this.$el.find('[data-role="waStatus"]');
                $s.text('Probando…').removeClass('text-danger text-success');
                Espo.Ajax.postRequest('CrmHub/whatsapp/test', {})
                    .then(r => $s.text(r.connected ? 'Conectado ✔ ' + (r.state || '') + (r.note ? ' — ' + r.note : '') : 'Conectado, pero el estado es «' + r.state + '». Vincula el teléfono.')
                        .addClass(r.connected ? 'text-success' : 'text-danger'))
                    .catch(xhr => this.showError($s, xhr, 'No se pudo probar'));
            },
            'click [data-action="saveTelegram"]': function () {
                const v = n => (this.$el.find(`[name="${n}"]`).val() || '').trim();
                const $s = this.$el.find('[data-role="tgStatus"]').text('Guardando y conectando…').removeClass('text-danger text-success');
                Espo.Ajax.putRequest('CrmHub/integrations', {telegram_bot_token: v('tg_token'), telegram_welcome: v('tg_welcome')})
                    .then(() => Espo.Ajax.postRequest('CrmHub/telegram/setup', {}))
                    .then(r => { Espo.Ui.success('Bot conectado: @' + r.bot); this.load(true); })
                    .catch(xhr => this.showError($s, xhr, 'No se pudo conectar el bot'));
            },
            'click [data-action="testTelegram"]': function () {
                const $s = this.$el.find('[data-role="tgStatus"]').text('Probando…').removeClass('text-danger text-success');
                Espo.Ajax.postRequest('CrmHub/telegram/test', {})
                    .then(r => $s.text(`@${r.bot} ✔ · webhook ${r.webhook ? 'registrado' : 'SIN registrar'}${r.pending ? ' · ' + r.pending + ' pendientes' : ''}${r.lastError ? ' · último error: ' + r.lastError : ''}`)
                        .addClass(r.webhook && !r.lastError ? 'text-success' : 'text-danger'))
                    .catch(xhr => this.showError($s, xhr, 'No se pudo probar'));
            },
            'click [data-action="saveMeta"]': function () {
                const v = n => (this.$el.find(`[name="${n}"]`).val() || '').trim();
                if (!v('fb_token') && !v('meta_secret')) { Espo.Ui.warning('Escribe el token o el App Secret que quieras guardar.'); return; }
                this.save({fb_page_token: v('fb_token'), meta_app_secret: v('meta_secret')});
            },
            'click [data-action="addForm"]': function () {
                const f = JSON.parse(JSON.stringify(this.state.formDefault));
                f.slug = this.uniqueSlug(f.slug); f.id = Math.random().toString(16).slice(2, 10); f._saved = false;
                this.forms.push(f); this.editing = this.forms.length - 1; this.renderForms();
            },
            'click [data-action="editForm"]': function (e) { const i = +e.currentTarget.dataset.i; this.editing = this.editing === i ? null : i; this.renderForms(); },
            'click [data-action="removeForm"]': function (e) {
                const i = +e.currentTarget.dataset.i;
                if (confirm('¿Eliminar el formulario «' + this.forms[i].name + '»? Su dirección dejará de funcionar al guardar.')) { this.forms.splice(i, 1); this.editing = null; this.renderForms(); }
            },
            'click [data-action="copyEmbed"]': function (e) {
                const f = this.forms[+e.currentTarget.dataset.i];
                this.copyText(`<iframe src="${this.formUrl(f)}" style="width:100%;max-width:520px;height:720px;border:0" loading="lazy" title="${f.name.replace(/"/g, '')}"></iframe>`);
            },
            'click [data-action="addField"]': function (e) {
                const f = this.forms[+e.currentTarget.dataset.i];
                f.fields.push({key: this.uniqueKey(f, 'campo'), label: 'Nuevo campo', type: 'text', required: false, maps_to: '', placeholder: '', options: []});
                this.renderForms();
            },
            'click [data-action="removeField"]': function (e) { this.forms[+e.currentTarget.dataset.i].fields.splice(+e.currentTarget.dataset.k, 1); this.renderForms(); },
            'click [data-action="moveField"]': function (e) {
                const f = this.forms[+e.currentTarget.dataset.i], k = +e.currentTarget.dataset.k, j = k + +e.currentTarget.dataset.d;
                if (j < 0 || j >= f.fields.length) { return; }
                [f.fields[k], f.fields[j]] = [f.fields[j], f.fields[k]]; this.renderForms();
            },
            'change [data-fbind]': function (e) {
                const el = e.currentTarget, f = this.forms[+el.dataset.i], w = el.dataset.fbind;
                if (el.dataset.k !== undefined) {
                    const fd = f.fields[+el.dataset.k];
                    if (w === 'required') { fd.required = el.checked; }
                    else if (w === 'options') { fd.options = el.value.split(',').map(x => x.trim()).filter(Boolean); }
                    else { fd[w] = el.value; if (w === 'type' || w === 'maps_to') { this.renderForms(); } }
                    if (w === 'label' && /^campo\d*$/.test(fd.key)) { fd.key = this.uniqueKey(f, this.slugify(el.value).replace(/-/g, '_') || 'campo', fd); }
                } else if (w === 'enabled' || w === 'consent_required') { f[w] = el.checked; if (w === 'enabled') { this.renderForms(); } }
                else if (w === 'slug') { f.slug = this.slugify(el.value); el.value = f.slug; this.renderForms(); }
                else { f[w] = el.value; if (w === 'name') { this.renderForms(); } }
            },
            'click [data-action="saveForms"]': function () { this.save({forms: this.forms}, true); },
            'click [data-action="pushTest"]': function () {
                const $s = this.$el.find('[data-role="pushStatus"]');
                $s.text('Enviando…').removeClass('text-danger text-success');
                Espo.Ajax.postRequest('CrmHub/push/test', {})
                    .then(r => $s.text(r.devices ? `Enviada a ${r.sent} de ${r.devices} dispositivo(s)` : 'No tienes dispositivos suscritos: activa el botón de la barra superior primero.').addClass(r.sent ? 'text-success' : 'text-danger'))
                    .catch(xhr => { $s.text('No se pudo enviar').addClass('text-danger'); if (xhr) { xhr.errorIsHandled = true; } });
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
        }

        afterRender() {
            super.afterRender();
            if (!this.state || this.state.error) { return; }
            this.applyTab(); this.applyProvider();
            this.renderHttp(); this.applyProvider();
            if (this.services) { this.renderServices(); }
            if (this.forms) { this.renderForms(); }
        }

        applyTab() {
            this.$el.find('.ch-tabbtn').each((i, b) => b.classList.toggle('active', b.dataset.tab === this.tab));
            this.$el.find('.ch-pane').each((i, p) => { p.style.display = p.dataset.pane === this.tab ? '' : 'none'; });
        }

        applyProvider() {
            [['wa_provider', 'wa'], ['sms_provider', 'sms'], ['voice_provider', 'voice']].forEach(([name, grp]) => {
                const prov = this.$el.find(`[name="${name}"]`).val();
                this.$el.find('.ch-prov').each((i, d) => {
                    const g = d.dataset.for || 'wa';
                    if (g === grp) { d.style.display = d.dataset.prov === prov ? '' : 'none'; }
                });
            });
        }

        // Formulario del proveedor genérico (cualquier BSP / SMS / central con API HTTP)
        httpPresets() {
            return {
                sms: {'JSON con token (Bearer)': {method: 'POST', body_type: 'json', auth_type: 'bearer', url: 'https://api.tu-proveedor.com/v1/sms', body: '{"from":"{{from}}","to":"{{to}}","message":"{{text}}"}'},
                      'Formulario con usuario y clave': {method: 'POST', body_type: 'form', auth_type: 'basic', url: 'https://api.tu-proveedor.com/sms/send', body: 'from={{from}}&to={{to_plain}}&text={{text}}'},
                      'GET con parámetros en la URL': {method: 'GET', body_type: 'query', auth_type: 'none', url: 'https://api.tu-proveedor.com/sendsms', body: 'user=USUARIO&pass=CLAVE&to={{to_plain}}&msg={{text}}'}},
                whatsapp: {'JSON con token (Bearer)': {method: 'POST', body_type: 'json', auth_type: 'bearer', url: 'https://api.tu-proveedor.com/v1/messages', body: '{"to":"{{to_plain}}","type":"text","text":{"body":"{{text}}"}}'}},
                voice: {'Asterisk / FreePBX (ARI)': {method: 'POST', body_type: 'query', auth_type: 'basic', url: 'http://pbx.tu-empresa.com:8088/ari/channels', body: 'endpoint=PJSIP/{{agent_phone}}&extension={{to_plain}}&context=from-internal&priority=1&callerId={{from}}'},
                        'API REST con token (Bearer)': {method: 'POST', body_type: 'json', auth_type: 'bearer', url: 'https://api.tu-central.com/v1/click-to-call', body: '{"agent":"{{agent_phone}}","customer":"{{to}}","caller_id":"{{from}}"}'}},
            };
        }

        renderHttp() {
            const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
            const vars = Object.keys(this.state.httpVars).map(k => `<code title="${esc(this.state.httpVars[k])}">{{${k}}}</code>`).join(' ');
            const opt = (list, cur) => list.map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`).join('');
            const cfgs = {whatsapp: this.state.genericWhatsapp, sms: this.state.sms.generic, voice: this.state.voice.generic};
            this.$el.find('.ch-http').each((i, box) => {
                const kind = box.dataset.kind, c = cfgs[kind] || {}, f = n => `data-http="${kind}.${n}"`;
                const presets = Object.keys(this.httpPresets()[kind] || {}).map(p => `<button class="btn btn-default btn-sm" data-action="httpPreset" data-kind="${kind}" data-preset="${esc(p)}">${esc(p)}</button>`).join(' ');
                const inbound = kind === 'voice' ? '' : `<h5 class="ch-subtitle">Mensajes entrantes (opcional)</h5>
                    <div class="ch-cols2"><div class="form-group"><label>Ruta del teléfono en el JSON</label><input class="form-control" ${f('inbound_phone')} value="${esc(c.inbound_phone)}" placeholder="messages.0.from"></div>
                    <div class="form-group"><label>Ruta del texto</label><input class="form-control" ${f('inbound_text')} value="${esc(c.inbound_text)}" placeholder="messages.0.text"></div>
                    <div class="form-group"><label>Ruta del nombre (opcional)</label><input class="form-control" ${f('inbound_name')} value="${esc(c.inbound_name)}" placeholder="contacts.0.name"></div></div>`;
                box.innerHTML = `<div class="ch-small ch-muted" style="margin-bottom:6px">Plantillas de ejemplo (ajusta los datos a tu proveedor): ${presets}</div>
                    <div class="ch-cols2">
                        <div class="form-group"><label>URL</label><input class="form-control" ${f('url')} value="${esc(c.url)}" placeholder="https://api.tu-proveedor.com/…"></div>
                        <div class="form-group"><label>Método</label><select class="form-control" ${f('method')}>${opt([['POST', 'POST'], ['GET', 'GET'], ['PUT', 'PUT']], c.method || 'POST')}</select></div>
                        <div class="form-group"><label>Autenticación</label><select class="form-control" ${f('auth_type')}>${opt([['none', 'Ninguna'], ['bearer', 'Token (Bearer)'], ['basic', 'Usuario y clave (Basic)'], ['header', 'Cabecera propia']], c.auth_type || 'none')}</select></div>
                        <div class="form-group"><label>Usuario / nombre de la cabecera</label><input class="form-control" ${f('auth_user')} value="${esc(c.auth_user || c.auth_header)}" placeholder="solo para Basic o cabecera propia"></div>
                        <div class="form-group"><label>Token / clave</label><input type="password" class="form-control" ${f('auth_secret')} autocomplete="off" placeholder="${c.secretSet ? 'Configurada ' + esc(c.secretHint) + ' · escribe una nueva para reemplazarla' : 'Pega aquí la clave'}"></div>
                        <div class="form-group"><label>${kind === 'voice' ? 'Caller ID / número que verá el cliente' : 'Remitente ({{from}})'}</label><input class="form-control" ${f('sender')} value="${esc(c.sender)}" placeholder="${kind === 'sms' ? 'número largo, código corto o ID' : '+57…'}"></div>
                    </div>
                    <div class="ch-cols2"><div class="form-group"><label>Formato del cuerpo</label><select class="form-control" ${f('body_type')}>${opt([['json', 'JSON'], ['form', 'Formulario (a=1&b=2)'], ['query', 'Parámetros en la URL']], c.body_type || 'json')}</select></div>
                        <div class="form-group"><label>Cabeceras adicionales (JSON, opcional)</label><input class="form-control" ${f('headers')} value="${esc(c.headers)}" placeholder='{"X-Api-Version":"2"}'></div></div>
                    <div class="form-group"><label>Plantilla del cuerpo</label><textarea class="form-control" rows="4" ${f('body')} style="font-family:monospace;font-size:12.5px">${esc(c.body)}</textarea>
                        <div class="ch-small ch-muted">Variables: ${vars}. En JSON los textos se escapan solos.</div></div>${inbound}`;
            });
        }

        collectHttp(kind) {
            const o = {};
            this.$el.find(`[data-http^="${kind}."]`).each((i, el) => { o[el.dataset.http.split('.')[1]] = (el.value || '').trim(); });
            if (o.auth_type === 'header') { o.auth_header = o.auth_user; }
            return o;
        }

        showError($el, xhr, fallback) {
            const reason = xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason');
            $el.text(reason || fallback).removeClass('text-success').addClass('text-danger');
            if (xhr) { xhr.errorIsHandled = true; }
        }

        copyText(v) {
            (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject())
                .then(() => Espo.Ui.success('Copiado')).catch(() => Espo.Ui.warning('No se pudo copiar; selecciónalo manualmente'));
        }

        slugify(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40); }

        uniqueSlug(base) {
            let s = base, n = 1;
            while (this.forms.some(f => f.slug === s)) { n++; s = base.replace(/-\d+$/, '') + '-' + n; }
            return s;
        }

        uniqueKey(form, base, self) {
            let k = base.slice(0, 28), n = 1;
            while (form.fields.some(f => f !== self && f.key === k)) { n++; k = base.slice(0, 26) + n; }
            return k;
        }

        formUrl(f) { return 'https://' + this.state.host + '/f/' + f.slug; }

        // Constructor de formularios web: lista, dirección pública, código para incrustar y editor de campos
        renderForms() {
            const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
            const st = this.state, maps = st.fieldMaps, types = {text: 'Texto', email: 'Correo', tel: 'Teléfono', textarea: 'Texto largo', select: 'Lista', number: 'Número', checkbox: 'Casilla', channel: 'Canal preferido'};
            const inp = (i, w, v, ph) => `<input class="form-control" data-fbind="${w}" data-i="${i}" value="${esc(v)}" ${ph ? `placeholder="${esc(ph)}"` : ''}>`;
            const html = this.forms.map((f, i) => {
                const url = this.formUrl(f);
                const fields = f.fields.map((fd, k) => `<div class="ch-ffield">
                    <input class="form-control" data-fbind="label" data-i="${i}" data-k="${k}" value="${esc(fd.label)}" placeholder="Pregunta">
                    <select class="form-control" data-fbind="type" data-i="${i}" data-k="${k}">${Object.keys(types).map(t => `<option value="${t}" ${fd.type === t ? 'selected' : ''}>${types[t]}</option>`).join('')}</select>
                    <select class="form-control" data-fbind="maps_to" data-i="${i}" data-k="${k}" title="Dónde se guarda la respuesta en el lead"><option value="">→ Notas del lead</option>${Object.keys(maps).map(m => `<option value="${m}" ${fd.maps_to === m ? 'selected' : ''}>→ ${esc(maps[m])}</option>`).join('')}</select>
                    <label class="ch-switch"><input type="checkbox" data-fbind="required" data-i="${i}" data-k="${k}" ${fd.required ? 'checked' : ''}> Obligatorio</label>
                    <button class="btn btn-link" title="Subir" data-action="moveField" data-i="${i}" data-k="${k}" data-d="-1"><span class="fas fa-arrow-up"></span></button>
                    <button class="btn btn-link" title="Bajar" data-action="moveField" data-i="${i}" data-k="${k}" data-d="1"><span class="fas fa-arrow-down"></span></button>
                    <button class="btn btn-link text-danger" title="Quitar" data-action="removeField" data-i="${i}" data-k="${k}"><span class="far fa-trash-alt"></span></button>
                    ${fd.type === 'select' ? `<input class="form-control ch-fopts" data-fbind="options" data-i="${i}" data-k="${k}" value="${esc(fd.options.join(', '))}" placeholder="Opciones separadas por coma">` : ''}
                </div>`).join('');
                const editor = this.editing !== i ? '' : `<div class="ch-feditor">
                    <div class="ch-cols2">
                        <div><label>Nombre interno</label>${inp(i, 'name', f.name)}</div>
                        <div><label>Dirección (parte final de la URL)</label>${inp(i, 'slug', f.slug)}</div>
                        <div><label>Título</label>${inp(i, 'title', f.title)}</div>
                        <div><label>Color del botón</label><input type="color" class="form-control" data-fbind="color" data-i="${i}" value="${esc(f.color)}" style="height:36px;padding:2px"></div>
                    </div>
                    <label>Texto de introducción</label>${inp(i, 'intro', f.intro)}
                    <div class="ch-cols2">
                        <div><label>Texto del botón</label>${inp(i, 'button', f.button)}</div>
                        <div><label>Origen del lead</label>${inp(i, 'source', f.source)}</div>
                        <div><label>Campaña (nombre exacto, opcional)</label>${inp(i, 'campaign', f.campaign, 'Se liga al lead y define quién lo atiende')}</div>
                        <div><label>Redirigir tras enviar (URL, opcional)</label>${inp(i, 'redirect_url', f.redirect_url, 'https://…')}</div>
                    </div>
                    <label>Mensaje de éxito</label>${inp(i, 'success_message', f.success_message)}
                    <label>Autorización de tratamiento de datos (habeas data)</label>
                    <textarea class="form-control" rows="3" data-fbind="consent_text" data-i="${i}">${esc(f.consent_text)}</textarea>
                    <label class="ch-switch" style="margin-top:6px"><input type="checkbox" data-fbind="consent_required" data-i="${i}" ${f.consent_required ? 'checked' : ''}> Es obligatorio aceptarla para enviar</label>
                    <h5 class="ch-subtitle">Campos del formulario</h5>${fields}
                    <button class="btn btn-default btn-sm" data-action="addField" data-i="${i}"><span class="fas fa-plus"></span> Agregar campo</button>
                    <div class="ch-small ch-muted" style="margin-top:8px">Necesita un campo para el nombre y otro para teléfono o correo. «Canal preferido» deja al cliente elegir cómo contactarlo (si elige Telegram recibe el enlace a tu bot al enviar).</div>
                </div>`;
                return `<div class="ch-form-card ${f.enabled ? '' : 'ch-off'}">
                    <div class="ch-form-head"><b>${esc(f.name)}</b><span class="ch-pill">${f.fields.length} campos</span>
                        <label class="ch-switch"><input type="checkbox" data-fbind="enabled" data-i="${i}" ${f.enabled ? 'checked' : ''}> Activo</label><span class="ch-spacer"></span>
                        <button class="btn btn-default btn-sm" data-action="editForm" data-i="${i}">${this.editing === i ? 'Cerrar' : 'Editar'}</button>
                        <button class="btn btn-link text-danger" title="Eliminar" data-action="removeForm" data-i="${i}"><span class="far fa-trash-alt"></span></button></div>
                    <div class="ch-form-urls"><code class="ch-url">${esc(url)}</code>
                        <button class="btn btn-default btn-sm" data-action="copy" data-value="${esc(url)}"><span class="far fa-copy"></span> Copiar URL</button>
                        <button class="btn btn-default btn-sm" data-action="copyEmbed" data-i="${i}"><span class="fas fa-code"></span> Código para incrustar</button>
                        ${f._saved ? `<a class="btn btn-default btn-sm" href="${esc(url)}" target="_blank" rel="noopener"><span class="fas fa-up-right-from-square"></span> Abrir</a>` : '<span class="ch-muted ch-small">Guarda para publicarlo</span>'}</div>
                    ${editor}
                </div>`;
            }).join('') || '<div class="ch-muted">Aún no tienes formularios. Pulsa «Nuevo formulario» para crear el primero con una plantilla lista.</div>';
            this.$el.find('.ch-forms').html(html);
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

        save(body, reloadAll) {
            Espo.Ui.notify('Guardando…');
            Espo.Ajax.putRequest('CrmHub/integrations', body)
                .then(() => { Espo.Ui.success('Guardado'); if (reloadAll || body.services) { this.forms = body.forms ? null : this.forms; this.services = body.services ? null : this.services; this.load(true); } else { this.load(true); } })
                .catch(xhr => {
                    const reason = xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason');
                    Espo.Ui.error(reason || 'No se pudo guardar');
                    if (xhr) { xhr.errorIsHandled = true; }
                });
        }
    };
});
