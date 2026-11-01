/**
 * Correo de la empresa (Integraciones → Correo): dos funciones, cada una del sistema (prestada) o propia.
 *  · Correo principal: el correo normal del CRM y del comercial virtual (SMTP de salida + buzón IMAP de entrada).
 *  · Correo en frío: remitente aparte, en otro dominio, para la prospección y el buscador (nunca el mismo que el principal).
 * Solo admin. Endpoints: GET CrmHub/mailConfig, POST CrmHub/mailConfigSave|mailConfigClear|mailConfigTest. Hub: /v1/mail-config.
 * Peculiaridad: las claves nunca se devuelven; un campo de contraseña vacío conserva la guardada. Se dibuja con innerHTML en draw().
 */
define('custom:views/mail-config', ['view', 'custom:ui'], function (Dep, ChUi) {
    const esc = v => ChUi.esc(v == null ? '' : v);
    const PRESETS = {
        '': {label: 'Elegir proveedor…'},
        zoho: {label: 'Zoho Mail', smtp: {host: 'smtp.zoho.com', port: 465, security: 'SSL'}, imap: {host: 'imap.zoho.com', port: 993}, help: 'Activa IMAP en Zoho y usa una <b>contraseña de aplicación</b> (Seguridad → Contraseñas de aplicación). Si tu cuenta es de Europa o India, cambia .com por .eu o .in.'},
        google: {label: 'Google Workspace / Gmail', smtp: {host: 'smtp.gmail.com', port: 465, security: 'SSL'}, imap: {host: 'imap.gmail.com', port: 993}, help: 'Usa una <b>contraseña de aplicación</b> de Google (requiere verificación en dos pasos).'},
        outlook: {label: 'Microsoft 365 / Outlook', smtp: {host: 'smtp.office365.com', port: 587, security: 'TLS'}, imap: {host: 'outlook.office365.com', port: 993}, help: 'El administrador de Microsoft 365 debe permitir SMTP autenticado y IMAP en el buzón.'},
        otro: {label: 'Otro proveedor (SMTP/IMAP)', smtp: {host: '', port: 587, security: 'TLS'}, imap: {host: '', port: 993}, help: 'Escribe los datos que te da tu proveedor.'}
    };
    const ROLE = {
        main: {title: 'Correo principal', icon: 'fas fa-envelope', text: 'El correo normal de tu CRM: lo que envían tus asesores y el comercial virtual a clientes que ya te escribieron o te dieron permiso, y donde llegan sus respuestas.'},
        cold: {title: 'Correo en frío', icon: 'fas fa-snowflake', text: 'Remitente aparte para escribir a quien nunca te ha escrito (lo que halla el buscador o importas de listas). Debe ser un <b>buzón real en un dominio distinto</b> al del correo principal: si recibe quejas, no daña tu correo normal. Cada mensaje en frío lo aprueba una persona. Los servicios de solo envío (Resend, SendGrid…) no admiten correo en frío.'}
    };
    const reason = xhr => { const r = xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason'); if (xhr) { xhr.errorIsHandled = true; } return r || 'No se pudo completar.'; };

    return class extends Dep {
        templateContent = '<div class="ch-mc"></div>'
        d = null
        afterRender() { this.load(); }
        load() {
            Espo.Ajax.getRequest('CrmHub/mailConfig').then(r => { this.d = r; this.draw(); })
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } const el = this.el.querySelector('.ch-mc'); if (el) { el.innerHTML = '<div class="ch-chat-err">No se pudo cargar el correo de la empresa.</div>'; } });
        }
        card(role, c) {
            const R = ROLE[role], sm = c.smtp, im = c.imap;
            const head = `<div class="panel panel-default"><div class="panel-heading"><h4 class="panel-title"><span class="${R.icon}"></span> ${R.title} ${c.mode === 'loaned' ? '<span class="label label-info">Provisto por el sistema</span>' : c.mode === 'off' ? '<span class="label label-default">No incluido</span>' : c.configured ? '<span class="label label-success">Propio · configurado</span>' : '<span class="label label-warning">Propio · sin configurar</span>'}</h4></div><div class="panel-body" data-role="${role}"><p class="text-muted">${R.text}</p>`;
            if (c.mode === 'off') { return head + '<p class="text-muted">Tu licencia no incluye esta función. Pídela al administrador del servicio.</p></div></div>'; }
            if (c.mode === 'loaned') {
                return head + `<p>Este correo lo provee el sistema${c.configured ? `: envías como <b>${esc(sm.from_address)}</b>` : ''}. Si prefieres usar tu propio proveedor y buzón, pide al administrador del servicio que lo cambie a «Propio».</p></div></div>`;
            }
            const f = (k, l, v, ph, type) => `<div class="form-group"><label>${l}</label><input class="form-control" type="${type || 'text'}" data-k="${k}" value="${esc(v)}" placeholder="${esc(ph || '')}" autocomplete="off"></div>`;
            return head + `<div class="form-group"><label>Proveedor</label><select class="form-control" data-k="preset">${Object.entries(PRESETS).map(([k, p]) => `<option value="${k}">${p.label}</option>`).join('')}</select><div class="text-muted small" data-role="help"></div></div>` +
                `<div class="row"><div class="col-sm-6"><h5>Salida (SMTP)</h5>${f('smtp.host', 'Servidor', sm.host, 'smtp.tu-proveedor.com')}<div class="row"><div class="col-xs-6">${f('smtp.port', 'Puerto', sm.port, '465', 'number')}</div><div class="col-xs-6"><div class="form-group"><label>Seguridad</label><select class="form-control" data-k="smtp.security">${[['SSL', 'SSL'], ['TLS', 'TLS (STARTTLS)'], ['', 'Ninguna']].map(([v, l]) => `<option value="${v}" ${sm.security === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div></div>` +
                `${f('smtp.user', 'Usuario', sm.user, 'correo completo')}${f('smtp.password', 'Contraseña' + (sm.hasPassword ? ' (guardada; déjala vacía para conservarla)' : ''), '', sm.hasPassword ? '••••••••' : '', 'password')}${f('smtp.from_address', 'Correo remitente', sm.from_address, role === 'cold' ? 'ventas@tu-dominio-aparte.com' : 'ventas@tu-dominio.com')}</div>` +
                `<div class="col-sm-6"><h5>Entrada (buzón IMAP: aquí llegan las respuestas)</h5>${f('imap.host', 'Servidor IMAP', im.host, 'imap.tu-proveedor.com')}${f('imap.port', 'Puerto', im.port, '993', 'number')}${f('imap.user', 'Usuario del buzón', im.user, 'correo completo')}${f('imap.password', 'Contraseña' + (im.hasPassword ? ' (guardada; déjala vacía para conservarla)' : ''), '', im.hasPassword ? '••••••••' : '', 'password')}</div></div>` +
                `<p><button class="btn btn-primary" data-a="save"><span class="fas fa-floppy-disk"></span> Guardar</button> <button class="btn btn-default" data-a="test" ${c.configured ? '' : 'disabled'}><span class="fas fa-plug"></span> Probar conexión</button> ${c.configured ? '<button class="btn btn-link text-danger" data-a="clear">Quitar</button>' : ''} <span data-role="status" class="small"></span></p></div></div>`;
        }
        draw() {
            const el = this.el.querySelector('.ch-mc'); if (!el || !this.d) { return; }
            el.innerHTML = this.card('main', this.d.main) + this.card('cold', this.d.cold);
            el.querySelectorAll('[data-role=main],[data-role=cold]').forEach(box => {
                const role = box.dataset.role, q = k => box.querySelector(`[data-k="${k}"]`);
                if (!q('preset')) { return; }
                const val = k => (q(k) ? q(k).value.trim() : '');
                q('preset').onchange = () => {
                    const p = PRESETS[q('preset').value]; if (!p || !p.smtp) { box.querySelector('[data-role=help]').innerHTML = ''; return; }
                    q('smtp.host').value = p.smtp.host; q('smtp.port').value = p.smtp.port; q('smtp.security').value = p.smtp.security; q('imap.host').value = p.imap.host; q('imap.port').value = p.imap.port;
                    box.querySelector('[data-role=help]').innerHTML = p.help;
                };
                const status = t => { box.querySelector('[data-role=status]').innerHTML = t; };
                box.querySelector('[data-a=save]').onclick = () => {
                    const body = {role, smtp: {host: val('smtp.host'), port: +val('smtp.port') || 587, security: q('smtp.security').value, user: val('smtp.user'), password: q('smtp.password').value, from_address: val('smtp.from_address')},
                        imap: {host: val('imap.host'), port: +val('imap.port') || 993, user: val('imap.user'), password: q('imap.password').value}};
                    status('Guardando…');
                    Espo.Ajax.postRequest('CrmHub/mailConfigSave', body).then(() => { Espo.Ui.success('Guardado'); this.load(); }).catch(xhr => { status(''); Espo.Ui.error(reason(xhr)); });
                };
                const t = box.querySelector('[data-a=test]');
                if (t) { t.onclick = () => { status('Probando…'); Espo.Ajax.postRequest('CrmHub/mailConfigTest', {role}).then(r => {
                    const o = x => x === 'ok' ? '<span class="text-success">✔ conectado</span>' : x ? `<span class="text-danger">✖ ${esc(x.replace(/^error: /, ''))}</span>` : '<span class="text-muted">no configurado</span>';
                    status(`Salida: ${o(r.smtp)} · Entrada: ${o(r.imap)}`); }).catch(xhr => { status(''); Espo.Ui.error(reason(xhr)); }); }; }
                const x = box.querySelector('[data-a=clear]');
                if (x) { x.onclick = () => ChUi.confirm({title: 'Quitar el correo propio', danger: true, ok: 'Quitar', text: 'Se borran el servidor, el usuario y las contraseñas guardadas. El correo de esta función deja de funcionar.'}).then(y => {
                    if (y) { Espo.Ajax.postRequest('CrmHub/mailConfigClear', {role}).then(() => { Espo.Ui.success('Quitado'); this.load(); }).catch(xhr => Espo.Ui.error(reason(xhr))); } }); }
            });
        }
    };
});
