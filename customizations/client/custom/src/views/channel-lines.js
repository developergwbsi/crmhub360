/**
 * Canales de mensajería: cada canal (WhatsApp, SMS, llamadas, Telegram) tiene su espacio con un cuadro por proveedor.
 * Se pueden agregar varios, encender/apagar cada uno, probarlos (conexión, mensaje o llamada de prueba) y elegir el principal.
 * Solo admin. Endpoints: GET CrmHub/lines, POST CrmHub/lineSave, lineEnable, lineDefault, lineDelete, lineTest, lineSendTest,
 * POST CrmHub/whatsapp/qr y whatsapp/unlink (vincular WhatsApp por QR), CrmHub/telegram/setup y PUT CrmHub/integrations (token del bot).
 * Peculiaridad: es una vista incrustada que recibe options.httpVars desde integrations.js; dibuja con innerHTML en draw().
 */
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

    const RESP = [['human', 'fas fa-headset', 'Mis asesores', 'Los atiende una persona de tu equipo desde el CRM. Es lo habitual.'],
        ['preset', 'fas fa-message', 'Mensajes predefinidos', 'Respuestas automáticas que tú escribes: saludo, fuera de horario, menú de opciones y palabras clave. Lo que no encaja lo atiende una persona.'],
        ['virtual', 'fas fa-robot', 'Comercial virtual con IA', 'Un agente con inteligencia artificial conversa, da seguimiento y agenda. Se configura en Comercial virtual.'],
        ['chatbot', 'fas fa-diagram-project', 'Chatbot de Gestor360', 'Un chatbot configurable con flujos ya hechos (preguntas frecuentes, pedidos, cotización, reclamos…). Servicio adicional con cobro: todo chatbot es de Gestor360, administrado por DigitalAlliance Hub.']];
    const RESP_LABEL = {human: 'Mis asesores', preset: 'Mensajes predefinidos', virtual: 'Comercial virtual con IA', chatbot: 'Chatbot de Gestor360'};
    const DAYS = [[1, 'Lun'], [2, 'Mar'], [3, 'Mié'], [4, 'Jue'], [5, 'Vie'], [6, 'Sáb'], [7, 'Dom']];

    return class extends Dep {
        templateContent = '<div class="ch-ln"></div>'
        data0 = null
        cb = {licensed: false}
        ch = (function () { try { return sessionStorage.getItem('crmhub-ln-ch') || 'whatsapp'; } catch (e) { return 'whatsapp'; } })()
        status = {}

        setup() { this.httpVars = this.options.httpVars || {}; this.load(); }
        afterRender() { this.draw(); }

        load() {
            Espo.Ajax.getRequest('CrmHub/chatbot').then(r => { this.cb = r; }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } this.cb = {licensed: false}; });
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
            const mg = !!c.managed;   // línea de Crm Hub 360: la vincula el equipo desde el Centro de control; la empresa no escanea ni cambia el número
            // salud de la línea de Evolution: «Encendido» no garantiza que la sesión de WhatsApp reciba mensajes; se muestra cuándo llegó lo último
            const ago = iso => { const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); return m < 2 ? 'hace un momento' : m < 60 ? 'hace ' + m + ' min' : m < 1440 ? 'hace ' + Math.round(m / 60) + ' h' : 'hace ' + Math.round(m / 1440) + ' días'; };
            const ac = c.activity, quiet = ac && (!ac.event || Date.now() - new Date(ac.event).getTime() > 24 * 3600000);
            const MON0 = {no_recibe: 'Detectamos que la línea envía pero no está recibiendo mensajes. Ya lo estamos revisando; si persiste, usa «Cambiar de número» para volver a vincular el QR.', no_entrega: 'Detectamos que los mensajes de esta línea no se están entregando. Ya lo estamos revisando.',
                envio_rechazado: 'El servidor de WhatsApp está rechazando los envíos de esta línea. Ya lo estamos revisando.', desconectada: 'La línea está desconectada: vuélvela a vincular con «Vincular (QR)».', sin_instancia: 'La línea aún no existe en el servidor: contacta a soporte.', sin_vincular: 'La línea aún no está vinculada: escanea el QR con «Vincular (QR)» (o pídenos que lo hagamos por ti).',
                token_invalido: 'Las credenciales de esta línea ya no son válidas (vencidas o revocadas): actualízalas con «Editar».', cuenta_suspendida: 'La cuenta del proveedor aparece suspendida o cerrada: revisa tu cuenta con el proveedor.',
                saldo_bajo: 'El saldo del proveedor está bajo: recarga para no quedarte sin envíos.', calidad_baja: 'Meta marcó la calidad del número en ROJO: baja el volumen y revisa los reportes de los clientes para evitar un bloqueo.',
                calidad_media: 'La calidad del número bajó a AMARILLO: mejora el contenido y evita enviar a quien no lo espera.', bloqueada: 'Meta tiene bloqueado el envío de esta línea: revisa tu cuenta de WhatsApp Business.', limitada: 'Meta tiene limitado el envío de esta línea.',
                error_api: 'La API del proveedor está respondiendo con errores. Ya lo estamos revisando.', sin_permiso: 'El token no tiene permiso sobre este número o el número no existe: revisa los datos de la línea.'};
            const MON = mg ? Object.assign({}, MON0, {no_recibe: 'Detectamos que la línea envía pero no está recibiendo mensajes. Ya lo estamos revisando: nuestro equipo vuelve a vincularla si hace falta.',
                desconectada: 'La línea está desconectada. Nuestro equipo ya fue avisado y la vuelve a vincular.', sin_instancia: 'La línea aún no existe en el servidor. Nuestro equipo ya fue avisado.',
                sin_vincular: 'La línea aún está por vincular: nuestro equipo la vincula desde el Centro de control, no necesitas hacer nada.'}) : MON0;
            const mo = c.monitor && c.monitor.state !== 'unknown' ? c.monitor : null;
            const monLine = mo ? `<div class="ch-ln-health ${mo.state === 'ok' ? 'ok' : 'warn'}"><span class="fas fa-heart-pulse"></span> ${mo.state === 'ok' ? `Monitoreada por Crm Hub 360: <b>funciona</b>${mo.metrics && mo.metrics.calidad ? ` · calidad ${esc(mo.metrics.calidad)}` : ''}${mo.metrics && mo.metrics.saldo != null ? ` · saldo ${esc(String(mo.metrics.saldo))} ${esc(mo.metrics.moneda || '')}` : ''} · última prueba ${esc(ago(mo.lastProbeAt))}` : `<b>Atención:</b> ${esc(MON[mo.state] || 'Detectamos un problema con esta línea.')}`}</div>` : '';
            const health = monLine ? monLine : evo && ac ? `<div class="ch-ln-health ${c.enabled && quiet ? 'warn' : ''}"><span class="fas fa-satellite-dish"></span> ` +
                (ac.inbound ? `Último mensaje de un cliente: <b>${esc(ago(ac.inbound))}</b>` : ac.event ? 'Aún no ha llegado un mensaje de clientes por esta línea' : 'Sin actividad registrada todavía') +
                (c.enabled && quiet && !mo ? '<div class="ch-small">Si esperas respuestas y no llegan, la sesión de WhatsApp puede estar «conectada» pero sin recibir. ' + (mg ? 'Avísanos y nuestro equipo la vuelve a vincular.' : 'Usa <b>Cambiar de número</b> para volver a vincular el QR.') + '</div>' : '') + '</div>' : '';
            const testBtn = tg ? '' : `<button class="btn btn-default btn-sm" data-act="send" data-id="${esc(c.id)}"><span class="fas ${c.channel === 'voice' ? 'fa-phone-volume' : 'fa-paper-plane'}"></span> ${c.channel === 'voice' ? 'Llamada de prueba' : 'Enviar prueba'}</button>`;
            return `<div class="ch-ln-card ${c.enabled ? '' : 'off'}" data-id="${esc(c.id)}">
                <div class="ch-ln-head"><div class="ch-ln-ic"><span class="${CH[c.channel][1]}"></span></div>
                    <div class="ch-ln-title"><b>${esc(c.name)}</b><span class="ch-muted">${esc(c.typeLabel)}</span></div>
                    <label class="ch-ln-sw" title="${c.enabled ? 'Encendido: se usa para enviar' : 'Apagado: no se usa'}"><input type="checkbox" data-sw="${esc(c.id)}" ${c.enabled ? 'checked' : ''}><i></i></label></div>
                <div class="ch-ln-meta">${isDef && c.enabled && !tg ? '<span class="ch-ln-badge pri"><span class="fas fa-star"></span> Principal</span>' : ''}${c.enabled ? '<span class="ch-ln-badge on">Encendido</span>' : '<span class="ch-ln-badge">Apagado</span>'}<span class="ch-ln-sum">${esc(this.summary(c))}</span></div>
                ${health}
                ${c.channel === 'whatsapp' ? `<div class="ch-ln-resp"><span class="fas fa-comments"></span> Cuando un cliente escribe responde: <b>${RESP_LABEL[c.responder] || 'Mis asesores'}</b> <a href="#" data-act="resp" data-id="${esc(c.id)}">cambiar</a></div>` : ''}
                ${st ? `<div class="ch-ln-st ${st.ok ? 'ok' : 'err'}">${st.busy ? '<span class="fas fa-spinner fa-spin"></span> ' : (st.ok ? '<span class="fas fa-circle-check"></span> ' : '<span class="fas fa-circle-exclamation"></span> ')}${esc(st.text)}</div>` : ''}
                <div class="ch-ln-acts"><button class="btn btn-default btn-sm" data-act="test" data-id="${esc(c.id)}"><span class="fas fa-plug"></span> Probar conexión</button>${testBtn}
                    ${evo && !mg ? `<button class="btn btn-default btn-sm" data-act="qr" data-id="${esc(c.id)}"><span class="fas fa-qrcode"></span> Vincular (QR)</button><button class="btn btn-default btn-sm" data-act="chg" data-id="${esc(c.id)}"><span class="fas fa-right-left"></span> Cambiar de número</button>` : ''}
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
            else if (act === 'resp') { e.preventDefault && e.preventDefault(); this.respDialog(this.card(id)); }
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
                    <div data-role="fields"></div>${ch === 'whatsapp' ? this.respBlock(card ? card.responder : 'human') : ''}<div class="ch-ln-st err" data-err hidden></div>
                    <div style="margin-top:12px;text-align:right"><button class="btn btn-primary" data-save><span class="fas fa-floppy-disk"></span> ${editing ? 'Guardar cambios' : 'Agregar'}</button></div></div>`;
                this.bindResp(body);
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
                        voice_record: !!(body.querySelector('[data-f="rec"]') || {}).checked, responder: ch === 'whatsapp' ? ((body.querySelector('input[name=resp]:checked') || {}).value || 'human') : null}).then(done).catch(fail);
                };
            }});
        }

        // ---------- quién responde cuando un cliente escribe
        respBlock(cur) {
            const cb = this.cb || {};
            const chatNote = cb.licensed
                ? (cb.configured ? '' : '<div class="ch-small ch-muted">Servicio contratado. La configuración de los flujos se activa en cuanto Gestor360 esté conectado.</div>')
                : (cb.requested_at ? `<div class="ch-small ch-muted">Solicitado el ${esc(String(cb.requested_at).slice(0, 10))}: DigitalAlliance Hub te avisa cuando esté activo.</div>`
                    : '<div><button type="button" class="btn btn-default btn-sm" data-resp-req><span class="fas fa-paper-plane"></span> Solicitar el chatbot</button> <span class="ch-small ch-muted">Es un servicio adicional con cobro.</span></div>');
            return `<div class="ch-resp"><label class="ch-dlg-label" style="font-weight:700">¿Quién responde cuando un cliente escribe por este WhatsApp?</label>` +
                RESP.map(([k, ic, t, d]) => { const off = k === 'chatbot' && !cb.licensed;
                    return `<label class="ch-resp-opt ${off ? 'off' : ''}"><input type="radio" name="resp" value="${k}" ${(cur || 'human') === k ? 'checked' : ''} ${off ? 'disabled' : ''}><span class="${ic}"></span><span><b>${t}</b><small>${d}</small>` +
                        (k === 'preset' ? '<a href="#" data-resp-presets>Escribir los mensajes predefinidos</a>' : k === 'chatbot' ? chatNote : '') + '</span></label>'; }).join('') + '</div>';
        }

        bindResp(root) {
            const req = root.querySelector('[data-resp-req]');
            if (req) {
                req.onclick = () => ChUi.confirm({title: 'Solicitar el chatbot', ok: 'Solicitar', text: 'Le avisamos a DigitalAlliance Hub que quieres el chatbot de Gestor360 para tu WhatsApp. Es un servicio adicional con cobro; te contactan para activarlo.'}).then(y => {
                    if (!y) { return; }
                    Espo.Ajax.postRequest('CrmHub/chatbotRequest', {note: 'Solicitud desde Integraciones → Canales de mensajería'}).then(() => { Espo.Ui.success('Solicitud enviada'); this.cb = Object.assign({}, this.cb, {requested_at: new Date().toISOString()}); req.parentNode.innerHTML = '<span class="ch-small ch-muted">Solicitado: DigitalAlliance Hub te avisa cuando esté activo.</span>'; })
                        .catch(xhr => Espo.Ui.error(reason(xhr) || 'No se pudo enviar la solicitud.')); });
            }
            const pr = root.querySelector('[data-resp-presets]');
            if (pr) { pr.onclick = e => { e.preventDefault(); this.presetsPanel(); }; }
        }

        respDialog(card) {
            ChUi.panel({title: 'Quién responde', icon: 'fas fa-comments', close: 'Cancelar', mount: (body, close) => {
                body.innerHTML = this.respBlock(card.responder) + '<div class="ch-ln-st err" data-err hidden></div><div style="margin-top:12px;text-align:right"><button class="btn btn-primary" data-save>Guardar</button></div>';
                this.bindResp(body);
                body.querySelector('[data-save]').onclick = () => {
                    const v = (body.querySelector('input[name=resp]:checked') || {}).value || 'human', err = body.querySelector('[data-err]');
                    Espo.Ajax.postRequest('CrmHub/lineResponder', {id: card.id, responder: v}).then(() => { close(true); Espo.Ui.success('Guardado'); this.load(); })
                        .catch(xhr => { err.hidden = false; err.textContent = reason(xhr) || 'No se pudo guardar.'; });
                };
            }});
        }

        presetsPanel() {
            Espo.Ajax.getRequest('CrmHub/presets').then(c => {
                ChUi.panel({title: 'Mensajes predefinidos de WhatsApp', icon: 'fas fa-message', close: 'Cancelar', mount: (body, close) => {
                    const dlg = body.closest('.ch-dlg'); if (dlg) { dlg.classList.add('ch-wide'); dlg.style.maxWidth = '900px'; }
                    const sw = (k, on, t) => `<label class="ch-switch"><input type="checkbox" data-p="${k}" ${on ? 'checked' : ''}> ${t}</label>`;
                    const ACT = {reply: 'Solo responder', human: 'Avisar a una persona del equipo', callback: 'Crear tarea de llamada'}, actSel = (k, v) => `<select class="form-control" data-${k}="action" title="Qué más hace cuando el cliente la usa">${Object.entries(ACT).map(([a, l]) => `<option value="${a}" ${(v || 'reply') === a ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
                    const optRow = o => `<div class="ch-pr-row" data-opt><input class="form-control" data-o="label" placeholder="Opción (ej.: Horarios)" value="${esc(o.label)}"><textarea class="form-control" rows="2" data-o="reply" placeholder="Lo que se responde">${esc(o.reply)}</textarea>${actSel('o', o.action)}<a href="#" data-del>Quitar</a></div>`;
                    const kwRow = k => `<div class="ch-pr-row" data-kw><input class="form-control" data-k="words" placeholder="Palabras (separadas por coma): precio, costo" value="${esc((k.words || []).join(', '))}"><textarea class="form-control" rows="2" data-k="reply" placeholder="Lo que se responde">${esc(k.reply)}</textarea>${actSel('k', k.action)}<a href="#" data-del>Quitar</a></div>`;
                    const QUICK = [['Horarios y ubicación', 'menu', {label: 'Horarios y ubicación', reply: 'Atendemos de lunes a viernes de 8:00 a. m. a 6:00 p. m. Nuestra dirección: [escribe aquí tu dirección].'}], ['Medios de pago', 'menu', {label: 'Medios de pago', reply: 'Aceptamos transferencia, tarjeta y efectivo. Si necesitas un enlace de pago, escríbenos «pago» y una persona te lo envía.'}],
                        ['Hablar con una persona', 'menu', {label: 'Hablar con una persona', reply: 'Listo, avisamos a una persona de nuestro equipo para que te escriba en cuanto abramos.', action: 'human'}], ['Que me llamen', 'menu', {label: 'Que me llamen', reply: 'Con gusto. Te llamamos en el próximo horario de atención.', action: 'callback'}],
                        ['Estado de mi pedido', 'kw', {words: ['pedido', 'estado', 'seguimiento'], reply: 'Para consultar tu pedido, envíanos tu número de pedido o tu nombre completo y una persona te responde en cuanto abramos.', action: 'human'}], ['Precios', 'kw', {words: ['precio', 'costo', 'cotizacion', 'cuanto vale'], reply: 'Con gusto te cotizamos. Cuéntanos qué necesitas y una persona te envía la propuesta.', action: 'human'}]];
                    body.innerHTML = `<div class="ch-ln-form"><p class="ch-muted">Respuestas automáticas, sin IA. Todo es opcional. Lo que no encaje lo atiende una persona de tu equipo. Si el cliente ya lo atiende un comercial virtual, no se envían.</p>` +
                        sw('enabled', c.enabled, '<b>Mensajes predefinidos activos</b>') +
                        sw('fallback', c.fallback, '<b>Usarlos también como respaldo:</b> cuando nadie puede atender (tus asesores están fuera del horario de abajo y no hay un comercial virtual en línea), aunque la línea la atiendan personas') +
                        `<h5>Saludo</h5>${sw('greeting.enabled', c.greeting.enabled, 'Saludar la primera vez que escribe')}<textarea class="form-control" rows="2" data-p="greeting.text">${esc(c.greeting.text)}</textarea>` +
                        `<div class="ch-small ch-muted">No se repite en <input class="form-control" style="display:inline;width:64px" type="number" min="1" max="168" data-p="greeting.cooldown_hours" value="${c.greeting.cooldown_hours}"> horas.</div>` +
                        `<h5>Fuera de horario</h5>${sw('off.enabled', c.off_hours.enabled, 'Avisar cuando escriben fuera de horario')}<textarea class="form-control" rows="2" data-p="off.text">${esc(c.off_hours.text)}</textarea>` +
                        `<div class="ch-small">Días: ${DAYS.map(([n, l]) => `<label style="margin-right:8px;font-weight:400"><input type="checkbox" data-day="${n}" ${c.off_hours.days.includes(n) ? 'checked' : ''}> ${l}</label>`).join('')}` +
                        ` · de <input class="form-control" style="display:inline;width:90px" type="time" data-p="off.start" value="${esc(c.off_hours.start)}"> a <input class="form-control" style="display:inline;width:90px" type="time" data-p="off.end" value="${esc(c.off_hours.end)}"></div>` +
                        `<h5>Menú de opciones</h5>${sw('menu.enabled', c.menu.enabled, 'Ofrecer un menú (el cliente responde con el número o el nombre)')}<input class="form-control" data-p="menu.intro" value="${esc(c.menu.intro)}" placeholder="¿Qué necesitas? Responde con el número:">` +
                        `<div data-role="opts">${c.menu.options.map(optRow).join('')}</div><a href="#" data-add-opt>+ Agregar opción</a>` +
                        `<div class="ch-small ch-muted" style="margin:10px 0 4px">Ideas listas para agregar: ${QUICK.map(([l, t], i) => `<a href="#" data-quick="${i}" style="margin-right:10px">+ ${l}</a>`).join('')}</div>` +
                        `<h5>Palabras clave</h5><div data-role="kws">${c.keywords.map(kwRow).join('')}</div><a href="#" data-add-kw>+ Agregar palabra clave</a>` +
                        `<div class="ch-ln-st err" data-err hidden></div><div style="margin-top:14px;text-align:right"><button class="btn btn-primary" data-save>Guardar</button></div></div>`;
                    const wire = () => body.querySelectorAll('[data-del]').forEach(a => { a.onclick = e => { e.preventDefault(); a.closest('.ch-pr-row').remove(); }; });
                    wire();
                    body.querySelector('[data-add-opt]').onclick = e => { e.preventDefault(); if (body.querySelectorAll('[data-opt]').length < 9) { body.querySelector('[data-role=opts]').insertAdjacentHTML('beforeend', optRow({label: '', reply: ''})); wire(); } };
                    body.querySelectorAll('[data-quick]').forEach(a => { a.onclick = e => { e.preventDefault(); const [, t, v] = QUICK[+a.dataset.quick]; if (t === 'menu') { if (body.querySelectorAll('[data-opt]').length >= 9) { return; } body.querySelector('[data-p="menu.enabled"]').checked = true; body.querySelector('[data-role=opts]').insertAdjacentHTML('beforeend', optRow(v)); } else { body.querySelector('[data-role=kws]').insertAdjacentHTML('beforeend', kwRow(v)); } wire(); }; });
                    body.querySelector('[data-add-kw]').onclick = e => { e.preventDefault(); body.querySelector('[data-role=kws]').insertAdjacentHTML('beforeend', kwRow({words: [], reply: ''})); wire(); };
                    body.querySelector('[data-save]').onclick = () => {
                        const g = k => body.querySelector(`[data-p="${k}"]`), on = k => g(k).checked, val = k => g(k).value;
                        const payload = {enabled: on('enabled'), fallback: on('fallback'), greeting: {enabled: on('greeting.enabled'), text: val('greeting.text'), cooldown_hours: +val('greeting.cooldown_hours') || 12},
                            off_hours: {enabled: on('off.enabled'), text: val('off.text'), tz: c.off_hours.tz, days: [...body.querySelectorAll('[data-day]:checked')].map(x => +x.dataset.day), start: val('off.start'), end: val('off.end')},
                            menu: {enabled: on('menu.enabled'), intro: val('menu.intro'), options: [...body.querySelectorAll('[data-opt]')].map((r, i) => ({key: String(i + 1), label: r.querySelector('[data-o=label]').value.trim(), reply: r.querySelector('[data-o=reply]').value.trim(), action: r.querySelector('[data-o=action]').value}))},
                            keywords: [...body.querySelectorAll('[data-kw]')].map(r => ({words: r.querySelector('[data-k=words]').value, reply: r.querySelector('[data-k=reply]').value.trim(), action: r.querySelector('[data-k=action]').value}))};
                        Espo.Ajax.postRequest('CrmHub/presetsSave', payload).then(() => { close(true); Espo.Ui.success('Mensajes predefinidos guardados'); })
                            .catch(xhr => { const e = body.querySelector('[data-err]'); e.hidden = false; e.textContent = reason(xhr) || 'No se pudo guardar.'; });
                    };
                }});
            }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('No se pudieron cargar los mensajes predefinidos.'); });
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
