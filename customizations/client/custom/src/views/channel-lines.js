// Canales de mensajería: cada canal (WhatsApp, SMS, llamadas, Telegram) tiene su espacio con un cuadro por proveedor.
// Se pueden agregar varios, encender/apagar cada uno, probarlos (conexión, mensaje o llamada de prueba) y elegir el principal.
define('custom:views/channel-lines', ['view', 'custom:ui'], function (Dep, ChUi) {
    const esc = v => ChUi.esc(v == null ? '' : v);
    const CH = {whatsapp: ['WhatsApp', 'fab fa-whatsapp'], sms: ['SMS', 'fas fa-comment-sms'], voice: ['Llamadas', 'fas fa-phone'], telegram: ['Telegram', 'fab fa-telegram']};
    const HINT = {
        whatsapp: 'Cada cuadro es un número o cuenta de WhatsApp. Si hay varios encendidos, los mensajes salen por el principal; al escribir a un cliente puedes elegir otro, y las respuestas de quien te escribió salen por la misma línea.',
        sms: 'Cada cuadro es una cuenta o remitente de SMS. Los mensajes salen por el principal, o por el que elijas al escribir.',
        voice: 'Cada cuadro es una troncal o central desde la que se hacen llamadas. Las llamadas salen por el principal, o por el que elijas al llamar.',
        telegram: 'El bot de Telegram de tu empresa. Los clientes le escriben o abren el enlace de invitación que reciben.'};
    const PRESETS = {
        sms: {'JSON con token (Bearer)': {method: 'POST', body_type: 'json', auth_type: 'bearer', url: 'https://api.tu-proveedor.com/v1/sms', body: '{"from":"{{from}}","to":"{{to}}","message":"{{text}}"}'},
            'Formulario con usuario y clave': {method: 'POST', body_type: 'form', auth_type: 'basic', url: 'https://api.tu-proveedor.com/sms/send', body: 'from={{from}}&to={{to_plain}}&text={{text}}'},
            'GET con parámetros en la URL': {method: 'GET', body_type: 'query', auth_type: 'none', url: 'https://api.tu-proveedor.com/sendsms', body: 'user=USUARIO&pass=CLAVE&to={{to_plain}}&msg={{text}}'}},
        whatsapp: {'JSON con token (Bearer)': {method: 'POST', body_type: 'json', auth_type: 'bearer', url: 'https://api.tu-proveedor.com/v1/messages', body: '{"to":"{{to_plain}}","type":"text","text":{"body":"{{text}}"}}'}},
        voice: {'Asterisk / FreePBX (ARI)': {method: 'POST', body_type: 'query', auth_type: 'basic', url: 'http://pbx.tu-empresa.com:8088/ari/channels', body: 'endpoint=PJSIP/{{agent_phone}}&extension={{to_plain}}&context=from-internal&priority=1&callerId={{from}}'},
            'API REST con token (Bearer)': {method: 'POST', body_type: 'json', auth_type: 'bearer', url: 'https://api.tu-central.com/v1/click-to-call', body: '{"agent":"{{agent_phone}}","customer":"{{to}}","caller_id":"{{from}}"}'}}};
    const reason = xhr => { const r = xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason'); if (xhr) { xhr.errorIsHandled = true; } return r; };

    return class extends Dep {
        templateContent = '<div class="ch-ln"></div>'
        data0 = null
        ch = (function () { try { return sessionStorage.getItem('crmhub-ln-ch') || 'whatsapp'; } catch (e) { return 'whatsapp'; } })()
        status = {}

        setup() { this.httpVars = this.options.httpVars || {}; this.load(); }
        afterRender() { this.draw(); }

        load() {
            return Espo.Ajax.getRequest('CrmHub/lines').then(d => { this.data0 = d; this.draw(); })
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } this.data0 = {error: true}; this.draw(); });
        }

        summary(c) {
            const f = c.fields || {};
            if (c.type === 'evolution') { return [f.evolution_instance && 'Instancia ' + f.evolution_instance, f.evolution_url && f.evolution_url.replace(/^https?:\/\//, '')].filter(Boolean).join(' · '); }
            if (c.type === 'meta') { return f.meta_phone_number_id ? 'Número ID ' + f.meta_phone_number_id : ''; }
            if (c.type === 'gupshup') { return [f.gupshup_source, f.gupshup_app_name].filter(Boolean).join(' · '); }
            if (c.type === 'twilio') { return f.twilio_wa_from || f.twilio_sms_from || f.twilio_voice_from || (f.twilio_account_sid ? 'Cuenta ' + String(f.twilio_account_sid).slice(0, 8) + '…' : ''); }
            if (c.type === 'generic') { try { return new URL((c.http || {}).url).host; } catch (e) { return (c.http || {}).url || 'Sin URL'; } }
            if (c.type === 'bot') { return (c.extra && c.extra.bot) ? '@' + c.extra.bot : ''; }
            return '';
        }

        draw() {
            const root = this.el && this.el.querySelector('.ch-ln'); if (!root) { return; }
            const d = this.data0;
            if (!d) { root.innerHTML = '<div class="ch-muted" style="padding:18px">Cargando…</div>'; return; }
            if (d.error) { root.innerHTML = '<div class="ch-warn">No se pudieron cargar los proveedores. Intenta de nuevo en unos minutos.</div>'; return; }
            const tabs = Object.keys(CH).map(k => { const n = ((d[k] || {}).cards || []).filter(c => c.enabled).length;
                return `<a class="ch-tpl-tab ${this.ch === k ? 'on' : ''}" data-act="ch" data-k="${k}"><span class="${CH[k][1]}"></span> ${CH[k][0]} <span class="ch-ln-n ${n ? 'on' : ''}">${n}</span></a>`; }).join('');
            const sec = d[this.ch] || {cards: [], types: []};
            const cards = sec.cards.map(c => this.cardHtml(c, sec)).join('');
            const empty = ChUi.empty({kind: 'chat', title: `Aún no tienes proveedores de ${CH[this.ch][0]}`, text: 'Agrega el primero con el botón de arriba.', compact: true});
            root.innerHTML = `<div class="ch-tpl-tabs">${tabs}</div><p class="ch-muted ch-ln-hint">${esc(HINT[this.ch])}</p>
                <div class="ch-ln-bar"><button class="btn btn-primary btn-sm" data-act="add" ${sec.canAdd ? '' : 'disabled'}><span class="fas fa-plus"></span> Agregar proveedor de ${CH[this.ch][0]}</button>${sec.canAdd ? '' : `<span class="ch-muted">${this.ch === 'telegram' ? 'Telegram admite un solo bot.' : 'Llegaste al máximo de proveedores.'}</span>`}</div>
                <div class="ch-ln-grid">${cards || `<div class="ch-ln-empty">${empty}</div>`}</div>`;
            root.onclick = e => this.click(e);
            root.onchange = e => { const sw = e.target.closest('[data-sw]'); if (sw) { this.toggle(sw.dataset.sw, sw.checked); } };
        }

        cardHtml(c, sec) {
            const st = this.status[c.id];
            const isDef = sec.default === c.id, multi = sec.cards.length > 1;
            const evo = c.type === 'evolution', tg = c.channel === 'telegram';
            const testBtn = tg ? '' : `<button class="btn btn-default btn-sm" data-act="send" data-id="${esc(c.id)}"><span class="fas ${c.channel === 'voice' ? 'fa-phone-volume' : 'fa-paper-plane'}"></span> ${c.channel === 'voice' ? 'Llamada de prueba' : 'Enviar prueba'}</button>`;
            return `<div class="ch-ln-card ${c.enabled ? '' : 'off'}" data-id="${esc(c.id)}">
                <div class="ch-ln-head"><div class="ch-ln-ic"><span class="${CH[c.channel][1]}"></span></div>
                    <div class="ch-ln-title"><b>${esc(c.name)}</b><span class="ch-muted">${esc(c.typeLabel)}</span></div>
                    <label class="ch-ln-sw" title="${c.enabled ? 'Encendido: se usa para enviar' : 'Apagado: no se usa'}"><input type="checkbox" data-sw="${esc(c.id)}" ${c.enabled ? 'checked' : ''}><i></i></label></div>
                <div class="ch-ln-meta">${isDef && c.enabled && !tg ? '<span class="ch-ln-badge pri"><span class="fas fa-star"></span> Principal</span>' : ''}${c.enabled ? '<span class="ch-ln-badge on">Encendido</span>' : '<span class="ch-ln-badge">Apagado</span>'}<span class="ch-ln-sum">${esc(this.summary(c))}</span></div>
                ${st ? `<div class="ch-ln-st ${st.ok ? 'ok' : 'err'}">${st.busy ? '<span class="fas fa-spinner fa-spin"></span> ' : (st.ok ? '<span class="fas fa-circle-check"></span> ' : '<span class="fas fa-circle-exclamation"></span> ')}${esc(st.text)}</div>` : ''}
                <div class="ch-ln-acts"><button class="btn btn-default btn-sm" data-act="test" data-id="${esc(c.id)}"><span class="fas fa-plug"></span> Probar conexión</button>${testBtn}
                    ${evo ? `<button class="btn btn-default btn-sm" data-act="qr" data-id="${esc(c.id)}"><span class="fas fa-qrcode"></span> Vincular (QR)</button><button class="btn btn-default btn-sm" data-act="chg" data-id="${esc(c.id)}"><span class="fas fa-right-left"></span> Cambiar de número</button>` : ''}
                    ${!isDef && c.enabled && multi && !tg ? `<button class="btn btn-default btn-sm" data-act="def" data-id="${esc(c.id)}"><span class="far fa-star"></span> Usar como principal</button>` : ''}
                    <button class="btn btn-default btn-sm" data-act="edit" data-id="${esc(c.id)}"><span class="fas fa-pen"></span> Editar</button>
                    <button class="btn btn-link btn-sm text-danger" data-act="del" data-id="${esc(c.id)}"><span class="far fa-trash-can"></span> Quitar</button></div></div>`;
        }

        card(id) { for (const k of Object.keys(CH)) { const c = ((this.data0[k] || {}).cards || []).find(x => x.id === id); if (c) { return c; } } return null; }

        click(e) {
            const a = e.target.closest('[data-act]'); if (!a || a.disabled) { return; }
            const act = a.dataset.act, id = a.dataset.id;
            if (act === 'ch') { this.ch = a.dataset.k; try { sessionStorage.setItem('crmhub-ln-ch', this.ch); } catch (x) { /* nada */ } this.draw(); }
            else if (act === 'add') { this.form(null); }
            else if (act === 'edit') { this.form(this.card(id)); }
            else if (act === 'test') { this.testConn(id); }
            else if (act === 'send') { this.sendTest(this.card(id)); }
            else if (act === 'def') { Espo.Ajax.postRequest('CrmHub/lineDefault', {id}).then(() => { Espo.Ui.success('Ahora es el principal'); this.load(); }).catch(x => Espo.Ui.error(reason(x) || 'No se pudo cambiar')); }
            else if (act === 'qr') { this.qr(id); }
            else if (act === 'chg') { this.change(id); }
            else if (act === 'del') {
                const c = this.card(id);
                ChUi.confirm({title: 'Quitar proveedor', danger: true, ok: 'Quitar', text: `Se quita «${c.name}». Los mensajes ya enviados y las conversaciones se conservan.`}).then(y => {
                    if (y) { Espo.Ajax.postRequest('CrmHub/lineDelete', {id}).then(() => { delete this.status[id]; Espo.Ui.success('Proveedor quitado'); this.load(); }).catch(x => Espo.Ui.error(reason(x) || 'No se pudo quitar')); }
                });
            }
        }

        toggle(id, on) {
            Espo.Ajax.postRequest('CrmHub/lineEnable', {id, enabled: on}).then(() => { Espo.Ui.success(on ? 'Proveedor encendido' : 'Proveedor apagado'); this.load(); })
                .catch(x => { Espo.Ui.error(reason(x) || 'No se pudo cambiar'); this.load(); });
        }

        setStatus(id, s) { this.status[id] = s; this.draw(); }

        testConn(id) {
            this.setStatus(id, {busy: true, ok: true, text: 'Probando la conexión…'});
            const body = {id};
            Espo.Ajax.postRequest('CrmHub/lineTest', body).then(r => this.setStatus(id, {ok: !!r.connected, text: (r.connected ? 'Conectado · ' : 'Sin conexión · ') + (r.state || '') + (r.note ? ' — ' + r.note : '')}))
                .catch(x => this.setStatus(id, {ok: false, text: reason(x) || 'No se pudo probar la conexión'}));
        }

        // Mensaje o llamada de prueba a un número
        sendTest(c) {
            const call = c.channel === 'voice';
            ChUi.panel({title: call ? 'Llamada de prueba' : 'Enviar mensaje de prueba', icon: CH[c.channel][1], close: 'Cerrar', mount: (body, close) => {
                body.innerHTML = `<p class="ch-muted">${call ? `La línea «${esc(c.name)}» llamará a este número y dirá una frase de prueba.` : `Se envía un mensaje real desde «${esc(c.name)}», aunque esté apagado, para que puedas probarlo antes de encenderlo.`}</p>
                    <label class="ch-dlg-label">Número de destino (con indicativo)</label><input class="form-control" data-f="to" placeholder="+57 300 123 4567">
                    ${call ? '' : '<label class="ch-dlg-label" style="margin-top:10px">Mensaje (opcional)</label><textarea class="form-control" rows="2" maxlength="300" data-f="text" placeholder="Si lo dejas vacío se envía un texto de prueba."></textarea>'}
                    <div class="ch-ln-st" data-r hidden></div><div style="margin-top:12px;text-align:right"><button class="btn btn-primary" data-go><span class="fas ${call ? 'fa-phone-volume' : 'fa-paper-plane'}"></span> ${call ? 'Llamar' : 'Enviar'}</button></div>`;
                const r = body.querySelector('[data-r]'), go = body.querySelector('[data-go]');
                go.onclick = () => {
                    const to = body.querySelector('[data-f="to"]').value.trim(), tx = body.querySelector('[data-f="text"]');
                    if (!to) { r.hidden = false; r.className = 'ch-ln-st err'; r.textContent = 'Escribe el número de destino.'; return; }
                    go.disabled = true; r.hidden = false; r.className = 'ch-ln-st'; r.textContent = call ? 'Iniciando la llamada…' : 'Enviando…';
                    Espo.Ajax.postRequest('CrmHub/lineSendTest', {id: c.id, to, text: tx ? tx.value : ''}).then(res => { r.className = 'ch-ln-st ok'; r.textContent = (call ? 'Llamada solicitada a ' : 'Mensaje enviado a ') + res.to + ' ✔'; go.disabled = false; })
                        .catch(x => { r.className = 'ch-ln-st err'; r.textContent = reason(x) || 'No se pudo completar la prueba'; go.disabled = false; });
                };
            }});
        }

        // Vincular el teléfono por QR (Evolution): el código se renueva solo y se detecta la conexión
        qr(id) {
            let alive = true, timer = null;
            const tick = body => Espo.Ajax.postRequest('CrmHub/whatsapp/qr', {lineId: id}).then(r => {
                if (!alive) { return; }
                if (r.connected) { body.innerHTML = '<div class="ch-qr-ok"><span class="fas fa-circle-check"></span><b>¡WhatsApp vinculado!</b><p>Ya puedes enviar y recibir mensajes desde el CRM.</p><p class="ch-muted">¿Quieres usar otro número? Cierra este panel y pulsa «Cambiar de número».</p></div>'; Espo.Ui.success('WhatsApp vinculado'); this.setStatus(id, {ok: true, text: 'Vinculado y conectado'}); return; }
                body.innerHTML = (r.qr ? `<div class="ch-qr"><img alt="Código QR de WhatsApp" src="${esc(r.qr)}"></div>` : '<div class="ch-qr-wait"><span class="fas fa-spinner fa-spin"></span> Generando el código…</div>') +
                    '<ol class="ch-qr-steps"><li>Abre WhatsApp en el teléfono de la empresa.</li><li>Ve a <b>Ajustes → Dispositivos vinculados → Vincular un dispositivo</b>.</li><li>Escanea este código. Se renueva solo cada pocos segundos.</li></ol>' +
                    (r.pairingCode ? `<p class="ch-muted">¿Sin cámara? Usa el código de emparejamiento: <b>${esc(r.pairingCode)}</b></p>` : '');
                timer = setTimeout(() => tick(body), 4000);
            }).catch(x => { body.innerHTML = `<div class="ch-warn">${esc(reason(x) || 'No se pudo obtener el código QR. Revisa que los datos del proveedor estén guardados.')}</div>`; });
            ChUi.panel({title: 'Vincular WhatsApp', icon: 'fab fa-whatsapp', mount: body => { body.innerHTML = '<div class="ch-qr-wait"><span class="fas fa-spinner fa-spin"></span> Generando el código…</div>'; tick(body); }}).then(() => { alive = false; clearTimeout(timer); });
        }

        change(id) {
            ChUi.confirm({title: 'Cambiar de número de WhatsApp', ok: 'Cerrar sesión y escanear otro', danger: true,
                html: '<p>Se cierra la sesión del número vinculado ahora: dejará de enviar y recibir mensajes desde el CRM hasta que escanees el nuevo.</p><p class="ch-muted">Tus conversaciones y leads se conservan. Ten a la mano el teléfono del nuevo número.</p>'}).then(yes => {
                if (!yes) { return; }
                Espo.Ui.notify('Cerrando la sesión…');
                Espo.Ajax.postRequest('CrmHub/whatsapp/unlink', {lineId: id}).then(() => { Espo.Ui.notify(false); this.qr(id); })
                    .catch(x => Espo.Ui.error(reason(x) || 'No se pudo cerrar la sesión del número actual'));
            });
        }

        // Alta / edición de un proveedor
        form(card) {
            const sec = this.data0[this.ch], editing = !!card;
            const ch = card ? card.channel : this.ch;
            ChUi.panel({title: editing ? 'Editar proveedor' : `Agregar proveedor de ${CH[ch][0]}`, icon: CH[ch][1], close: 'Cancelar', mount: (body, close) => {
                const types = sec.types;
                const typeOpts = types.map(t => `<option value="${t.key}" ${card && card.type === t.key ? 'selected' : ''}>${esc(t.label)}</option>`).join('');
                body.innerHTML = `<div class="ch-ln-form"><div class="ch-cols2"><div class="form-group"><label>Nombre del proveedor</label><input class="form-control" data-f="name" maxlength="60" value="${esc(card ? card.name : '')}" placeholder="Ej.: Ventas Bogotá"></div>
                    <div class="form-group"><label>Proveedor</label><select class="form-control" data-f="type" ${editing && types.length === 1 ? 'disabled' : ''}>${typeOpts}</select></div></div>
                    <div data-role="fields"></div><div class="ch-ln-st err" data-err hidden></div>
                    <div style="margin-top:12px;text-align:right"><button class="btn btn-primary" data-save><span class="fas fa-floppy-disk"></span> ${editing ? 'Guardar cambios' : 'Agregar'}</button></div></div>`;
                const sel = body.querySelector('[data-f="type"]'), box = body.querySelector('[data-role="fields"]'), err = body.querySelector('[data-err]');
                const render = () => {
                    const t = types.find(x => x.key === sel.value), same = card && card.type === t.key;
                    let h = '';
                    if (t.http) { h = this.httpForm(ch, same ? card.http : {}); }
                    else {
                        h = '<div class="ch-cols2">' + t.fields.map(f => { const cur = same ? card.fields[f.key] : (f.secret ? {} : '');
                            return f.secret ? `<div class="form-group"><label>${esc(f.label)}</label><input type="password" class="form-control" data-fld="${f.key}" autocomplete="off" placeholder="${cur && cur.set ? 'Configurado ' + esc(cur.hint) + ' · escribe uno nuevo para reemplazarlo' : 'Pégalo aquí'}"></div>`
                                : `<div class="form-group"><label>${esc(f.label)}</label><input class="form-control" data-fld="${f.key}" value="${esc(cur || '')}" autocomplete="off"></div>`; }).join('') + '</div>';
                    }
                    if (ch === 'voice') { h += `<label class="ch-switch"><input type="checkbox" data-f="rec" ${card && card.extra && card.extra.voice_record ? 'checked' : ''}> Grabar las llamadas (avisa al cliente según la ley)</label>`; }
                    if (t.key === 'twilio' && ch !== 'telegram') { h += '<div class="ch-help">La cuenta de Twilio de este cuadro es solo suya: puedes tener otra cuenta (u otro número) en otro cuadro.</div>'; }
                    if (t.key === 'bot') { h += '<div class="ch-help">1. En Telegram habla con <b>@BotFather</b> → <code>/newbot</code> y copia el token.<br>2. Pégalo aquí y guarda: se conecta solo y queda listo.</div>'; }
                    box.innerHTML = h;
                    box.querySelectorAll('[data-preset]').forEach(b => { b.onclick = () => { const p = PRESETS[ch][b.dataset.preset]; Object.keys(p).forEach(k => { const el = box.querySelector(`[data-http="${k}"]`); if (el) { el.value = p[k]; } }); }; });
                };
                render(); sel.onchange = render;
                body.querySelector('[data-save]').onclick = () => {
                    const t = types.find(x => x.key === sel.value), fields = {};
                    box.querySelectorAll('[data-fld]').forEach(el => { fields[el.dataset.fld] = (el.value || '').trim(); });
                    const http = {}; box.querySelectorAll('[data-http]').forEach(el => { http[el.dataset.http] = (el.value || '').trim(); });
                    if (http.auth_type === 'header') { http.auth_header = http.auth_user; }
                    const btn = body.querySelector('[data-save]'); btn.disabled = true; err.hidden = true;
                    const done = () => { close(true); Espo.Ui.success(editing ? 'Cambios guardados' : 'Proveedor agregado'); this.load(); };
                    const fail = x => { btn.disabled = false; err.hidden = false; err.textContent = reason(x) || 'No se pudo guardar. Revisa los datos.'; };
                    if (ch === 'telegram') {
                        Espo.Ajax.putRequest('CrmHub/integrations', {telegram_bot_token: fields.telegram_bot_token, telegram_welcome: fields.telegram_welcome || ''})
                            .then(() => Espo.Ajax.postRequest('CrmHub/telegram/setup', {})).then(r => { Espo.Ui.success('Bot conectado: @' + r.bot); done(); }).catch(fail);
                        return;
                    }
                    Espo.Ajax.postRequest('CrmHub/lineSave', {id: card ? card.id : null, channel: ch, type: t.key, name: body.querySelector('[data-f="name"]').value.trim(), fields, http: t.http ? http : null,
                        voice_record: !!(body.querySelector('[data-f="rec"]') || {}).checked}).then(done).catch(fail);
                };
            }});
        }

        httpForm(ch, c) {
            c = c || {};
            const f = n => `data-http="${n}"`, opt = (list, cur) => list.map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`).join('');
            const vars = Object.keys(this.httpVars).map(k => `<code title="${esc(this.httpVars[k])}">{{${k}}}</code>`).join(' ');
            const presets = Object.keys(PRESETS[ch] || {}).map(p => `<button type="button" class="btn btn-default btn-sm" data-preset="${esc(p)}">${esc(p)}</button>`).join(' ');
            return `<div class="ch-small ch-muted" style="margin-bottom:6px">Plantillas de ejemplo (ajusta los datos a tu proveedor): ${presets}</div>
                <div class="ch-cols2"><div class="form-group"><label>URL</label><input class="form-control" ${f('url')} value="${esc(c.url)}" placeholder="https://api.tu-proveedor.com/…"></div>
                <div class="form-group"><label>Método</label><select class="form-control" ${f('method')}>${opt([['POST', 'POST'], ['GET', 'GET'], ['PUT', 'PUT']], c.method || 'POST')}</select></div>
                <div class="form-group"><label>Autenticación</label><select class="form-control" ${f('auth_type')}>${opt([['none', 'Ninguna'], ['bearer', 'Token (Bearer)'], ['basic', 'Usuario y clave (Basic)'], ['header', 'Cabecera propia']], c.auth_type || 'none')}</select></div>
                <div class="form-group"><label>Usuario / nombre de la cabecera</label><input class="form-control" ${f('auth_user')} value="${esc(c.auth_user || c.auth_header)}"></div>
                <div class="form-group"><label>Token / clave</label><input type="password" class="form-control" ${f('auth_secret')} autocomplete="off" placeholder="${c.secretSet ? 'Configurada ' + esc(c.secretHint) + ' · escribe una nueva para reemplazarla' : 'Pega aquí la clave'}"></div>
                <div class="form-group"><label>${ch === 'voice' ? 'Caller ID / número que verá el cliente' : 'Remitente ({{from}})'}</label><input class="form-control" ${f('sender')} value="${esc(c.sender)}"></div></div>
                <div class="ch-cols2"><div class="form-group"><label>Formato del cuerpo</label><select class="form-control" ${f('body_type')}>${opt([['json', 'JSON'], ['form', 'Formulario (a=1&b=2)'], ['query', 'Parámetros en la URL']], c.body_type || 'json')}</select></div>
                <div class="form-group"><label>Cabeceras adicionales (JSON, opcional)</label><input class="form-control" ${f('headers')} value="${esc(c.headers)}" placeholder='{"X-Api-Version":"2"}'></div></div>
                <div class="form-group"><label>Plantilla del cuerpo</label><textarea class="form-control" rows="4" ${f('body')} style="font-family:monospace;font-size:12.5px">${esc(c.body)}</textarea><div class="ch-small ch-muted">Variables: ${vars}. En JSON los textos se escapan solos.</div></div>`;
        }
    };
});
