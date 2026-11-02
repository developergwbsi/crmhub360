/**
 * Respuestas automáticas de WhatsApp (pestaña de Integraciones y de Comercial virtual): lo que el sistema contesta solo, sin IA, cuando nadie puede atender.
 * Saludo, aviso de fuera de horario, menú de opciones y palabras clave; cada opción o palabra puede además avisar a una persona o crear una tarea de llamada.
 * «Usarlos también como respaldo» los activa solo cuando los asesores están fuera de su horario y no hay un comercial virtual en línea.
 * Endpoints: GET CrmHub/presets, POST CrmHub/presetsSave. Hub: /v1/presets. Solo admin. Formulario en la página (no en un cuadro), a todo el ancho.
 */
define('custom:views/presets-config', ['view', 'custom:ui'], function (Dep, ChUi) {
    const esc = v => ChUi.esc(v == null ? '' : v);
    const reason = xhr => { const r = xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason'); if (xhr) { xhr.errorIsHandled = true; } return r || 'No se pudo completar.'; };
    const DAYS = [[1, 'Lun'], [2, 'Mar'], [3, 'Mié'], [4, 'Jue'], [5, 'Vie'], [6, 'Sáb'], [7, 'Dom']];
    const ACT = {reply: 'Solo responder', human: 'Avisar a una persona del equipo', callback: 'Crear una tarea de llamada'};
    const QUICK = [
        ['Horarios y ubicación', 'menu', {label: 'Horarios y ubicación', reply: 'Atendemos de lunes a viernes de 8:00 a. m. a 6:00 p. m. Nuestra dirección: [escribe aquí tu dirección].'}],
        ['Medios de pago', 'menu', {label: 'Medios de pago', reply: 'Aceptamos transferencia, tarjeta y efectivo. Si necesitas un enlace de pago, escríbenos «pago» y una persona te lo envía.'}],
        ['Hablar con una persona', 'menu', {label: 'Hablar con una persona', reply: 'Listo, avisamos a una persona de nuestro equipo para que te escriba en cuanto abramos.', action: 'human'}],
        ['Que me llamen', 'menu', {label: 'Que me llamen', reply: 'Con gusto. Te llamamos en el próximo horario de atención.', action: 'callback'}],
        ['Estado de mi pedido', 'kw', {words: ['pedido', 'estado', 'seguimiento'], reply: 'Para consultar tu pedido, envíanos tu número de pedido o tu nombre completo y una persona te responde en cuanto abramos.', action: 'human'}],
        ['Precios', 'kw', {words: ['precio', 'costo', 'cotizacion', 'cuanto vale'], reply: 'Con gusto te cotizamos. Cuéntanos qué necesitas y una persona te envía la propuesta.', action: 'human'}],
    ];
    const actSel = (k, v) => `<select class="form-control" data-${k}="action" title="Qué más hace cuando el cliente la usa">${Object.entries(ACT).map(([a, l]) => `<option value="${a}" ${(v || 'reply') === a ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    const optRow = o => `<div class="ch-pr-row" data-opt><input class="form-control" data-o="label" placeholder="Opción (ej.: Horarios)" value="${esc(o.label)}"><textarea class="form-control" rows="2" data-o="reply" placeholder="Lo que se responde">${esc(o.reply)}</textarea>${actSel('o', o.action)}<a href="#" data-del>Quitar</a></div>`;
    const kwRow = k => `<div class="ch-pr-row" data-kw><input class="form-control" data-k="words" placeholder="Palabras (separadas por coma): precio, costo" value="${esc((k.words || []).join(', '))}"><textarea class="form-control" rows="2" data-k="reply" placeholder="Lo que se responde">${esc(k.reply)}</textarea>${actSel('k', k.action)}<a href="#" data-del>Quitar</a></div>`;
    const sw = (k, on, t) => `<label class="ch-pc-sw"><input type="checkbox" data-p="${k}" ${on ? 'checked' : ''}> ${t}</label>`;

    return class extends Dep {
        templateContent = '<div class="ch-pc"></div>'
        c = null
        afterRender() { this.load(); }
        load() {
            Espo.Ajax.getRequest('CrmHub/presets').then(c => { this.c = c; this.draw(); })
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } const el = this.el.querySelector('.ch-pc'); if (el) { el.innerHTML = '<div class="ch-chat-err">No se pudieron cargar las respuestas automáticas.</div>'; } });
        }
        draw() {
            const body = this.el.querySelector('.ch-pc'), c = this.c; if (!body || !c) { return; }
            const kp = (cls, ic, l, v, sub) => `<div class="ch-kpi ${cls}"><span class="ic"><i class="fas ${ic}"></i></span><div><span>${l}</span><b>${v}</b>${sub ? `<small>${sub}</small>` : ''}</div></div>`;
            const days = c.off_hours.days.map(d => (DAYS.find(x => x[0] === d) || [0, ''])[1]).join(' · ');
            body.innerHTML = `<div class="ch-kpis">${kp(c.enabled ? 'ok' : 'warn', 'fa-message', 'Respuestas automáticas', c.enabled ? 'Activas' : 'Apagadas', c.enabled ? '' : 'actívalas abajo')}` +
                `${kp(c.fallback ? 'ok' : '', 'fa-life-ring', 'Como respaldo', c.fallback ? 'Sí' : 'No', 'solo si nadie puede atender')}${kp('', 'fa-clock', 'Horario de los asesores', `${esc(c.off_hours.start)} – ${esc(c.off_hours.end)}`, esc(days))}` +
                `${kp('', 'fa-list-ol', 'Menú y palabras', `${c.menu.options.length} · ${c.keywords.length}`, 'opciones · palabras clave')}</div>` +
                `<div class="ch-pr-card"><h4><span class="fas fa-message"></span> Respuestas automáticas de WhatsApp</h4><p class="ch-muted">Respuestas sin IA para cuando nadie puede atender: el cliente recibe el saludo, el horario y la información que suele necesitar con urgencia, y puede pedir que una persona lo contacte. Todo es opcional. Lo que no encaje lo atiende una persona de tu equipo. Si el cliente ya lo atiende un comercial virtual, no se envían.</p>` +
                sw('enabled', c.enabled, '<b>Respuestas automáticas activas</b>') +
                sw('fallback', c.fallback, '<b>Usarlas también como respaldo:</b> solo cuando nadie puede atender (tus asesores están fuera del horario de abajo y no hay un comercial virtual en línea), aunque la línea la atiendan personas') +
                `<div class="ch-pc-cols"><div><h5>Saludo</h5>${sw('greeting.enabled', c.greeting.enabled, 'Saludar la primera vez que escribe')}<textarea class="form-control" rows="3" data-p="greeting.text">${esc(c.greeting.text)}</textarea>` +
                `<div class="ch-small ch-muted" style="margin-top:6px">No se repite en <input class="form-control" style="display:inline;width:70px" type="number" min="1" max="168" data-p="greeting.cooldown_hours" value="${c.greeting.cooldown_hours}"> horas.</div></div>` +
                `<div><h5>Fuera de horario (horario de tus asesores)</h5>${sw('off.enabled', c.off_hours.enabled, 'Avisar cuando escriben fuera de horario')}<textarea class="form-control" rows="3" data-p="off.text">${esc(c.off_hours.text)}</textarea>` +
                `<div class="ch-small" style="margin-top:6px">Días: ${DAYS.map(([n, l]) => `<label style="margin-right:8px;font-weight:400"><input type="checkbox" data-day="${n}" ${c.off_hours.days.includes(n) ? 'checked' : ''}> ${l}</label>`).join('')} · de <input class="form-control" style="display:inline;width:110px" type="time" data-p="off.start" value="${esc(c.off_hours.start)}"> a <input class="form-control" style="display:inline;width:110px" type="time" data-p="off.end" value="${esc(c.off_hours.end)}"></div></div></div>` +
                `<h5>Menú de opciones</h5>${sw('menu.enabled', c.menu.enabled, 'Ofrecer un menú (el cliente responde con el número o el nombre)')}<input class="form-control" data-p="menu.intro" value="${esc(c.menu.intro)}" placeholder="¿Qué necesitas? Responde con el número:">` +
                `<div data-role="opts">${c.menu.options.map(optRow).join('')}</div><a href="#" data-add-opt>+ Agregar opción</a>` +
                `<div class="ch-small ch-muted" style="margin:10px 0 4px">Ideas listas para agregar: ${QUICK.map(([l], i) => `<a href="#" data-quick="${i}" style="margin-right:12px">+ ${l}</a>`).join('')}</div>` +
                `<h5>Palabras clave</h5><div data-role="kws">${c.keywords.map(kwRow).join('')}</div><a href="#" data-add-kw>+ Agregar palabra clave</a>` +
                `<div class="ch-ln-st err" data-err hidden></div><div style="margin-top:18px"><button class="btn btn-primary" data-save><span class="fas fa-floppy-disk"></span> Guardar</button></div></div>`;
            const wire = () => body.querySelectorAll('[data-del]').forEach(a => { a.onclick = e => { e.preventDefault(); a.closest('.ch-pr-row').remove(); }; });
            wire();
            body.querySelector('[data-add-opt]').onclick = e => { e.preventDefault(); if (body.querySelectorAll('[data-opt]').length < 9) { body.querySelector('[data-role=opts]').insertAdjacentHTML('beforeend', optRow({label: '', reply: ''})); wire(); } };
            body.querySelector('[data-add-kw]').onclick = e => { e.preventDefault(); body.querySelector('[data-role=kws]').insertAdjacentHTML('beforeend', kwRow({words: [], reply: ''})); wire(); };
            body.querySelectorAll('[data-quick]').forEach(a => { a.onclick = e => { e.preventDefault(); const [, t, v] = QUICK[+a.dataset.quick];
                if (t === 'menu') { if (body.querySelectorAll('[data-opt]').length >= 9) { return; } body.querySelector('[data-p="menu.enabled"]').checked = true; body.querySelector('[data-role=opts]').insertAdjacentHTML('beforeend', optRow(v)); } else { body.querySelector('[data-role=kws]').insertAdjacentHTML('beforeend', kwRow(v)); } wire(); }; });
            body.querySelector('[data-save]').onclick = () => {
                const g = k => body.querySelector(`[data-p="${k}"]`), on = k => g(k).checked, val = k => g(k).value;
                const payload = {enabled: on('enabled'), fallback: on('fallback'), greeting: {enabled: on('greeting.enabled'), text: val('greeting.text'), cooldown_hours: +val('greeting.cooldown_hours') || 12},
                    off_hours: {enabled: on('off.enabled'), text: val('off.text'), tz: c.off_hours.tz, days: [...body.querySelectorAll('[data-day]:checked')].map(x => +x.dataset.day), start: val('off.start'), end: val('off.end')},
                    menu: {enabled: on('menu.enabled'), intro: val('menu.intro'), options: [...body.querySelectorAll('[data-opt]')].map((r, i) => ({key: String(i + 1), label: r.querySelector('[data-o=label]').value.trim(), reply: r.querySelector('[data-o=reply]').value.trim(), action: r.querySelector('[data-o=action]').value}))},
                    keywords: [...body.querySelectorAll('[data-kw]')].map(r => ({words: r.querySelector('[data-k=words]').value, reply: r.querySelector('[data-k=reply]').value.trim(), action: r.querySelector('[data-k=action]').value}))};
                Espo.Ajax.postRequest('CrmHub/presetsSave', payload).then(() => { Espo.Ui.success('Respuestas automáticas guardadas'); this.load(); })
                    .catch(xhr => { const e = body.querySelector('[data-err]'); e.hidden = false; e.textContent = reason(xhr); });
            };
        }
    };
});
