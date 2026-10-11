define('custom:views/integrations', ['view', 'custom:ui'], function (Dep, ChUi) {
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
                {key: 'canales', icon: 'fas fa-comments', label: 'Canales de mensajería'}, {key: 'formularios', icon: 'fas fa-file-lines', label: 'Formularios web'},
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
            'click [data-action="testTwilio"]': function () {
                const $s = this.$el.find('[data-role="twStatus"]').text('Probando…').removeClass('text-danger text-success');
                Espo.Ajax.postRequest('CrmHub/twilio/test', {}).then(r => $s.text('Conectado ✔ ' + (r.name || '')).addClass('text-success')).catch(xhr => this.showError($s, xhr, 'No se pudo probar'));
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
                ChUi.confirm({title: 'Eliminar formulario', danger: true, ok: 'Eliminar', text: '¿Eliminar el formulario «' + this.forms[i].name + '»? Su dirección dejará de funcionar al guardar.'})
                    .then(yes => { if (yes) { this.forms.splice(i, 1); this.editing = null; this.renderForms(); } });
            },
            'click [data-action="copyEmbed"]': function (e) {
                const f = this.forms[+e.currentTarget.dataset.i];
                this.copyText(`<iframe src="${this.formUrl(f)}" style="width:100%;max-width:520px;height:720px;border:0" loading="lazy" title="${f.name.replace(/"/g, '')}"></iframe>`);
            },
            'click [data-action="addField"]': function (e) {
                const f = this.forms[+e.currentTarget.dataset.i];
                f.fields.push({key: this.uniqueKey(f, 'campo'), label: 'Nuevo campo', type: 'text', required: false, maps_to: '', placeholder: '', options: [], width: 100, show_if: null});
                this.renderForms();
            },
            'click [data-action="removeField"]': function (e) { this.forms[+e.currentTarget.dataset.i].fields.splice(+e.currentTarget.dataset.k, 1); this.renderForms(); },
            'click [data-action="moveField"]': function (e) {
                const f = this.forms[+e.currentTarget.dataset.i], k = +e.currentTarget.dataset.k, j = k + +e.currentTarget.dataset.d;
                if (j < 0 || j >= f.fields.length) { return; }
                [f.fields[k], f.fields[j]] = [f.fields[j], f.fields[k]]; this.renderForms();
            },
            'click [data-action="addFormAction"]': function (e) {
                const f = this.forms[+e.currentTarget.dataset.i];
                f.actions = f.actions || []; f.actions.push(JSON.parse(JSON.stringify(this.state.formAction))); this.renderForms();
            },
            'click [data-action="removeFormAction"]': function (e) { this.forms[+e.currentTarget.dataset.i].actions.splice(+e.currentTarget.dataset.a, 1); this.renderForms(); },
            'click [data-action="clearFormImage"]': function (e) { this.forms[+e.currentTarget.dataset.i][e.currentTarget.dataset.w] = ''; this.renderForms(); },
            'change [data-fimage]': function (e) {
                const el = e.currentTarget, f = this.forms[+el.dataset.i], w = el.dataset.fimage, file = el.files && el.files[0];
                if (!file) { return; }
                if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) { Espo.Ui.warning('Usa una imagen PNG, JPG, WEBP o GIF.'); return; }
                const img = new Image(), url = URL.createObjectURL(file);
                img.onload = () => {   // se reduce y comprime en el navegador para que el formulario cargue rápido
                    const max = w === 'header_image' ? 1400 : 1920, k = Math.min(1, max / img.width), c = document.createElement('canvas');
                    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
                    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                    URL.revokeObjectURL(url);
                    f[w] = c.toDataURL('image/jpeg', 0.8); this.renderForms();
                };
                img.onerror = () => Espo.Ui.warning('No se pudo leer la imagen.');
                img.src = url;
            },
            'change [data-aimage]': function (e) {
                const el = e.currentTarget, a = this.forms[+el.dataset.i].actions[+el.dataset.a], files = [...(el.files || [])];
                a.images = a.images || [];
                const next = files.filter(f => /^image\/(png|jpe?g|webp|gif)$/.test(f.type)).slice(0, Math.max(0, 4 - a.images.length));
                if (!next.length) { Espo.Ui.warning('Usa imágenes PNG, JPG, WEBP o GIF (máximo 4 por correo).'); return; }
                Promise.all(next.map(file => new Promise(res => {
                    const img = new Image(), url = URL.createObjectURL(file);
                    img.onload = () => { const k = Math.min(1, 1000 / img.width), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
                        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.78)); };
                    img.onerror = () => res(null); img.src = url;
                }))).then(list => { a.images.push(...list.filter(Boolean)); this.renderForms(); });
            },
            'change [data-aurl]': function (e) {
                const el = e.currentTarget, a = this.forms[+el.dataset.i].actions[+el.dataset.a], v = el.value.trim();
                if (v && a.images.length < 4) { a.images.push(v); this.renderForms(); }
            },
            'click [data-action="removeActImage"]': function (e) { this.forms[+e.currentTarget.dataset.i].actions[+e.currentTarget.dataset.a].images.splice(+e.currentTarget.dataset.n, 1); this.renderForms(); },
            'change [data-afile]': function (e) {
                const el = e.currentTarget, a = this.forms[+el.dataset.i].actions[+el.dataset.a], file = el.files && el.files[0];
                if (!file) { return; }
                if (file.type !== 'application/pdf') { Espo.Ui.warning('El adjunto debe ser un PDF.'); return; }
                if (file.size > 650 * 1024) { Espo.Ui.warning('El PDF pesa más de 650 KB. Comprímelo antes de subirlo.'); return; }
                const r = new FileReader();
                r.onload = () => { a.attachments = a.attachments || []; if (a.attachments.length < 3) { a.attachments.push({name: file.name, data: r.result}); } this.renderForms(); };
                r.readAsDataURL(file);
            },
            'click [data-action="removeActFile"]': function (e) { this.forms[+e.currentTarget.dataset.i].actions[+e.currentTarget.dataset.a].attachments.splice(+e.currentTarget.dataset.n, 1); this.renderForms(); },
            'change [data-abind]': function (e) {
                const el = e.currentTarget, a = this.forms[+el.dataset.i].actions[+el.dataset.a], w = el.dataset.abind;
                if (w === 'enabled') { a.enabled = el.checked; return; }
                if (w.startsWith('when_')) {
                    const part = w.slice(5);
                    if (part === 'field') { a.when = el.value ? {field: el.value, op: 'eq', value: ''} : null; this.renderForms(); return; }
                    a.when = a.when || {field: '', op: 'eq', value: ''}; a.when[part] = el.value;
                    if (part === 'op') { this.renderForms(); }
                    return;
                }
                a[w] = el.value; if (w === 'type' || w === 'to') { this.renderForms(); }
            },
            'change [data-fbind]': function (e) {
                const el = e.currentTarget, f = this.forms[+el.dataset.i], w = el.dataset.fbind;
                if (el.dataset.k !== undefined) {
                    const fd = f.fields[+el.dataset.k];
                    if (w === 'width') { fd.width = +el.value; }
                    else if (w.startsWith('si_')) {
                        const part = w.slice(3);
                        if (part === 'field') { fd.show_if = el.value ? {field: el.value, op: 'eq', value: ''} : null; this.renderForms(); return; }
                        fd.show_if = fd.show_if || {field: '', op: 'eq', value: ''}; fd.show_if[part] = el.value;
                        if (part === 'op') { this.renderForms(); }
                    }
                    else if (w === 'required') { fd.required = el.checked; }
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
                ChUi.confirm({title: 'Eliminar servicio', danger: true, ok: 'Eliminar', text: '¿Eliminar el servicio «' + this.services[i].name + '»?'})
                    .then(yes => { if (yes) { this.services.splice(i, 1); this.renderServices(); } });
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
                ChUi.confirm({title: 'Restaurar valores iniciales', danger: true, ok: 'Restaurar', text: 'Se reemplazarán tus servicios y filtros por los valores iniciales. ¿Continuar?'}).then(yes => {
                    if (!yes) { return; }
                    Espo.Ajax.postRequest('CrmHub/integrations/reset-services', {})
                        .then(() => { Espo.Ui.success('Valores iniciales restaurados'); this.load(); });
                });
            },
        }

        afterRender() {
            super.afterRender();
            if (!this.state || this.state.error) { return; }
            if (this.tab === 'telefonia') { this.tab = 'canales'; }
            this.applyTab();
            // proveedores por canal (WhatsApp, SMS, llamadas, Telegram): vista propia con un cuadro por proveedor
            this.createView('lines', 'custom:views/channel-lines', {selector: '[data-role="lines"]', httpVars: this.state.httpVars || {}}).then(v => v.render());
            if (this.services) { this.renderServices(); }
            if (this.forms) { this.renderForms(); }
        }

        applyTab() {
            this.$el.find('.ch-tabbtn').each((i, b) => { b.classList.toggle('active', b.dataset.tab === this.tab); });
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
            const opsLbl = {eq: 'es igual a', neq: 'es distinto de', filled: 'tiene respuesta', empty: 'está vacío'};
            const widthLbl = {25: '¼', 33: '⅓', 50: '½', 66: '⅔', 75: '¾', 100: 'Completo'};
            // Editor de una condición «campo · operador · valor»: sirve para mostrar un campo y para decidir qué acción se ejecuta
            const cond = (f, c, bind, pos, prefix, selfKey, none) => {
                const at = n => `${bind}="${prefix}${n}" ${pos}`;
                const sel = `<select class="form-control" ${at('field')}><option value="">${none}</option>${f.fields.filter(x => x.key !== selfKey).map(x => `<option value="${esc(x.key)}" ${c && c.field === x.key ? 'selected' : ''}>${esc(x.label || x.key)}</option>`).join('')}</select>`;
                if (!c) { return sel; }
                const target = f.fields.find(x => x.key === c.field);
                const list = target && (target.type === 'select' ? target.options : target.type === 'channel' ? ['Teléfono', 'WhatsApp', 'Telegram', 'Correo'] : target.type === 'checkbox' ? ['Sí'] : null);
                const op = `<select class="form-control" ${at('op')}>${Object.keys(opsLbl).map(o => `<option value="${o}" ${c.op === o ? 'selected' : ''}>${opsLbl[o]}</option>`).join('')}</select>`;
                const val = c.op !== 'eq' && c.op !== 'neq' ? '' : list ? `<select class="form-control" ${at('value')}><option value="">Elige…</option>${list.map(o => `<option ${c.value === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
                    : `<input class="form-control" ${at('value')} value="${esc(c.value)}" placeholder="valor">`;
                return sel + op + val;
            };
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
                    <div class="ch-fcond"><span class="ch-muted ch-small">Ancho</span>
                        <select class="form-control ch-fwidth" data-fbind="width" data-i="${i}" data-k="${k}">${Object.keys(widthLbl).map(w => `<option value="${w}" ${(fd.width || 100) == w ? 'selected' : ''}>${widthLbl[w]}</option>`).join('')}</select>
                        <span class="ch-muted ch-small">Mostrar solo si</span>${cond(f, fd.show_if, 'data-fbind', `data-i="${i}" data-k="${k}"`, 'si_', fd.key, 'Siempre visible')}</div>
                    ${fd.type === 'select' ? `<input class="form-control ch-fopts" data-fbind="options" data-i="${i}" data-k="${k}" value="${esc(fd.options.join(', '))}" placeholder="Opciones separadas por coma">` : ''}
                </div>`).join('');
                const imgPick = w => f[w] ? `<div class="ch-imgprev" style="background-image:url('${esc(f[w])}')"></div><button class="btn btn-default btn-sm" data-action="clearFormImage" data-i="${i}" data-w="${w}"><span class="far fa-trash-alt"></span> Quitar</button>`
                    : `<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-fimage="${w}" data-i="${i}" class="form-control"><input class="form-control" style="margin-top:6px" data-fbind="${w}" data-i="${i}" placeholder="…o pega la dirección https:// de una imagen">`;
                const colorPick = (label, w, v) => `<div class="ch-color"><label>${label}</label><input type="color" class="form-control" data-fbind="${w}" data-i="${i}" value="${esc(v)}"></div>`;
                const acts = (f.actions || []).map((a, j) => {
                    const pos = `data-i="${i}" data-a="${j}"`;
                    return `<div class="ch-faction ${a.enabled === false ? 'ch-off' : ''}">
                        <div class="ch-fa-head"><label class="ch-switch"><input type="checkbox" data-abind="enabled" ${pos} ${a.enabled === false ? '' : 'checked'}> Activa</label>
                            <select class="form-control" data-abind="type" ${pos}><option value="email" ${a.type === 'email' ? 'selected' : ''}>Enviar un correo</option><option value="whatsapp" ${a.type === 'whatsapp' ? 'selected' : ''}>Enviar un WhatsApp</option><option value="notify" ${a.type === 'notify' ? 'selected' : ''}>Avisar al equipo (campana y push)</option></select>
                            <span class="ch-spacer"></span><button class="btn btn-link text-danger" title="Quitar acción" data-action="removeFormAction" ${pos}><span class="far fa-trash-alt"></span></button></div>
                        <div class="ch-fcond"><span class="ch-muted ch-small">Cuándo</span>${cond(f, a.when, 'data-abind', pos, 'when_', '', 'Siempre que llegue el formulario')}</div>
                        ${a.type === 'email' ? `<div class="ch-fcond"><span class="ch-muted ch-small">Para</span>
                            <select class="form-control" data-abind="to" ${pos}><option value="lead" ${a.to !== 'custom' ? 'selected' : ''}>El cliente (su correo)</option><option value="custom" ${a.to === 'custom' ? 'selected' : ''}>Un correo interno</option></select>
                            ${a.to === 'custom' ? `<input class="form-control" data-abind="to_custom" ${pos} value="${esc(a.to_custom)}" placeholder="aviso@tuempresa.com">` : ''}</div>
                            <label>Asunto</label><input class="form-control" data-abind="subject" ${pos} value="${esc(a.subject)}">` : ''}
                        ${a.type === 'notify' ? `<label>Texto del aviso (título: «Nuevo registro»)</label><input class="form-control" data-abind="notify_text" ${pos} value="${esc(a.notify_text)}" placeholder="{{nombre}} · {{formulario}}">
                            <div class="ch-small ch-muted">Le llega a quien atiende el lead y a los administradores, en la campana del CRM y como notificación del dispositivo.</div>`
                        : `<label>Mensaje</label><textarea class="form-control" rows="4" data-abind="message" ${pos}>${esc(a.message)}</textarea>`}
                        ${a.type === 'email' ? `<label>Imágenes del correo (la primera va arriba; máx. 4)</label>
                            <div class="ch-aimgs">${(a.images || []).map((u, n) => `<div class="ch-aimg" style="background-image:url('${esc(u)}')"><button class="btn btn-link text-danger" title="Quitar" data-action="removeActImage" ${pos} data-n="${n}"><span class="fas fa-times"></span></button></div>`).join('')}</div>
                            <div class="ch-fcond"><input type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" class="form-control" data-aimage ${pos}><input class="form-control" data-aurl ${pos} placeholder="…o pega una dirección https:// y pulsa Enter"></div>
                            <label>PDF adjunto (máx. 3, hasta 650 KB cada uno)</label>
                            ${(a.attachments || []).map((x, n) => `<div class="ch-afile"><span class="far fa-file-pdf"></span> ${esc(x.name)} <button class="btn btn-link text-danger" title="Quitar" data-action="removeActFile" ${pos} data-n="${n}"><span class="fas fa-times"></span></button></div>`).join('')}
                            <input type="file" accept="application/pdf" class="form-control" data-afile ${pos}>
                            <label>Botón de contacto (opcional)</label>
                            <div class="ch-fcond"><input class="form-control" data-abind="button_label" ${pos} value="${esc(a.button_label)}" placeholder="Texto, p. ej. Escríbenos por WhatsApp">
                                <select class="form-control" data-abind="button_kind" ${pos}><option value="whatsapp" ${a.button_kind !== 'link' ? 'selected' : ''}>Abre WhatsApp</option><option value="link" ${a.button_kind === 'link' ? 'selected' : ''}>Abre un enlace</option></select>
                                <input class="form-control" data-abind="button_value" ${pos} value="${esc(a.button_value)}" placeholder="${a.button_kind === 'link' ? 'https://…' : 'Número con indicativo, p. ej. 573001234567'}"></div>
                            ${a.button_kind !== 'link' ? `<input class="form-control" style="margin-top:6px" data-abind="button_text" ${pos} value="${esc(a.button_text)}" placeholder="Mensaje que aparece escrito al abrir WhatsApp">` : ''}` : ''}
                    </div>`;
                }).join('');
                const editor = this.editing !== i ? '' : `<div class="ch-feditor">
                    <div class="ch-cols2">
                        <div><label>Nombre interno</label>${inp(i, 'name', f.name)}</div>
                        <div><label>Dirección (parte final de la URL)</label>${inp(i, 'slug', f.slug)}</div>
                        <div><label>Título</label>${inp(i, 'title', f.title)}</div>
                    </div>
                    <h5 class="ch-subtitle">Diseño</h5>
                    <div class="ch-design">
                        <div class="ch-dcol"><label>Encabezado (imagen)</label>${imgPick('header_image')}<div class="ch-small ch-muted">Se muestra arriba, como en Google Forms. Sin imagen se usa una franja de color.</div></div>
                        <div class="ch-dcol"><label>Fondo de la página (imagen)</label>${imgPick('bg_image')}</div>
                    </div>
                    <div class="ch-colors">
                        ${colorPick('Fondo de la página', 'bg_color', f.bg_color || '#f4f6fa', true)}
                        ${colorPick('Franja del encabezado', 'header_color', f.header_color || f.color)}
                        ${colorPick('Color principal (campos)', 'color', f.color)}
                        ${colorPick('Fondo del botón', 'button_color', f.button_color || f.color)}
                        ${colorPick('Texto del botón', 'button_text_color', f.button_text_color || '#ffffff')}
                    </div>
                    <label>Texto de introducción</label>${inp(i, 'intro', f.intro)}
                    <div class="ch-cols2">
                        <div><label>Texto del botón</label>${inp(i, 'button', f.button)}</div>
                        <div><label>Origen del lead</label>${inp(i, 'source', f.source)}</div>
                        <div><label>Campaña (nombre exacto, opcional)</label>${inp(i, 'campaign', f.campaign, 'Se liga al lead y define quién lo atiende')}</div>
                        <div><label>Redirigir tras enviar (URL, opcional)</label>${inp(i, 'redirect_url', f.redirect_url, 'https://…')}</div>
                    </div>
                    <label>Mensaje de éxito</label>${inp(i, 'success_message', f.success_message)}
                    <div class="ch-cols2"><div><label>Si el cliente ya está registrado (mismo teléfono o correo)</label>
                        <select class="form-control" data-fbind="on_duplicate" data-i="${i}"><option value="update" ${f.on_duplicate !== 'block' ? 'selected' : ''}>Actualizar su registro y continuar</option><option value="block" ${f.on_duplicate === 'block' ? 'selected' : ''}>No registrarlo otra vez y avisarle</option></select></div>
                        ${f.on_duplicate === 'block' ? `<div><label>Mensaje para quien ya está registrado</label>${inp(i, 'duplicate_message', f.duplicate_message)}</div>` : ''}</div>
                    <label>Autorización de tratamiento de datos (habeas data)</label>
                    <textarea class="form-control" rows="3" data-fbind="consent_text" data-i="${i}">${esc(f.consent_text)}</textarea>
                    <label class="ch-switch" style="margin-top:6px"><input type="checkbox" data-fbind="consent_required" data-i="${i}" ${f.consent_required ? 'checked' : ''}> Es obligatorio aceptarla para enviar</label>
                    <h5 class="ch-subtitle">Campos del formulario</h5>${fields}
                    <button class="btn btn-default btn-sm" data-action="addField" data-i="${i}"><span class="fas fa-plus"></span> Agregar campo</button>
                    <h5 class="ch-subtitle">Al recibir el formulario</h5>
                    <div class="ch-small ch-muted" style="margin-bottom:8px">Envía un correo o un WhatsApp automáticamente. Cada acción puede depender de la respuesta a una lista (por ejemplo, un mensaje distinto según el servicio que elija el cliente). Puedes usar ${esc(st.formVars)}.</div>
                    ${acts}
                    <button class="btn btn-default btn-sm" data-action="addFormAction" data-i="${i}"><span class="fas fa-plus"></span> Agregar acción</button>
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
            }).join('') || ChUi.empty({kind: 'doc', title: 'Aún no tienes formularios', text: 'Pulsa «Nuevo formulario» para crear el primero con una plantilla lista.', compact: true});
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
