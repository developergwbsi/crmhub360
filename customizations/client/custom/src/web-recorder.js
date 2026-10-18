/**
 * Grabador visual de un flujo de navegación (como Selenium IDE): un navegador real (Chromium en el servidor) se muestra dentro del CRM; el usuario escribe la dirección,
 * hace clic, escribe usuario y clave, navega, y cada acción queda grabada como un paso. En modo «Elegir dato» pulsa sobre lo que quiere extraer.
 * open({url, steps, credNames, onCredential(name, value)}) → promesa al cerrar. Endpoint: POST CrmHub/webSession {op: open|action|close}.
 * Las claves se envían al navegador del servidor pero NO se guardan en los pasos: el paso lleva {{usuario}} / {{clave}} y el valor queda como credencial protegida.
 */
define('custom:web-recorder', ['custom:ui'], function (ChUi) {
    const esc = v => ChUi.esc(v == null ? '' : v);
    const VAR_OPTS = [['fixed', 'Texto fijo'], ['usuario', 'Credencial: usuario'], ['clave', 'Credencial: clave (oculta)'], ['identificacion', 'Dato del lead: identificación'], ['nombre', 'Dato del lead: nombre'], ['telefono', 'Dato del lead: teléfono'], ['correo', 'Dato del lead: correo']];
    const STEP_LABEL = {goto: 'Abrir', fill: 'Escribir', click: 'Clic', press: 'Tecla', wait: 'Esperar', extract: 'Extraer'};

    function open(o) {
        const steps = o.steps;
        return ChUi.panel({title: 'Grabar el flujo en un navegador', icon: 'fas fa-circle-dot', close: 'Terminar', mount: body => {
            const box = body.closest('.ch-dlg'); if (box) { box.classList.add('ch-wide'); }
            body.innerHTML = `<div class="ch-rec"><div class="ch-wp-bar"><button class="btn btn-default btn-sm" data-back title="Atrás"><span class="fas fa-arrow-left"></span></button><input class="form-control input-sm" data-u placeholder="https://… (la página donde empieza el flujo)" value="${esc(o.url || '')}"><button class="btn btn-primary btn-sm" data-go><span class="fas fa-play"></span> Ir</button>
                <div class="ch-rec-mode"><button type="button" class="on" data-mode="nav"><span class="fas fa-hand-pointer"></span> Navegar</button><button type="button" data-mode="pick"><span class="fas fa-crosshairs"></span> Elegir dato</button></div></div>
                <div class="ch-muted ch-wp-msg" data-msg>Escribe la dirección y pulsa «Ir». Luego usa la página como siempre: cada clic y cada texto que escribas se graba como un paso. Para traer un dato, cambia a «Elegir dato» y púlsalo.</div>
                <div class="ch-wp-main"><div class="ch-rec-view"><img data-img alt="" draggable="false"><div class="ch-rec-load" data-load hidden>Cargando…</div></div>
                <div class="ch-wp-side"><div data-cand class="ch-muted">Aquí aparece lo que elijas.</div><div class="ch-wp-added" data-steps></div></div></div></div>`;
            const q = s2 => body.querySelector(s2), img = q('[data-img]'), msg = q('[data-msg]'), cand = q('[data-cand]'), list = q('[data-steps]'), ld = q('[data-load]');
            let sid = '', mode = 'nav', vp = {width: 1100, height: 720}, busy = false;
            const api = b => Espo.Ajax.postRequest('CrmHub/webSession', b);
            const err = xhr => { if (xhr) { xhr.errorIsHandled = true; } msg.innerHTML = '<span style="color:#d64545">' + esc((xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason')) || 'No se pudo completar.') + '</span>'; };
            const show = r => { if (r.shot) { img.src = 'data:image/jpeg;base64,' + r.shot; } if (r.url) { q('[data-u]').value = r.url; } if (r.error) { msg.innerHTML = '<span style="color:#b45309">' + esc(r.error) + '</span>'; } };
            const drawSteps = () => { list.innerHTML = steps.length ? '<h5>Pasos grabados</h5>' + steps.map((s, i) => `<div class="ch-wp-it"><div><b>${i + 1}. ${STEP_LABEL[s.type] || s.type}</b> ${esc(s.type === 'goto' ? s.url : s.type === 'fill' ? (s.label || s.selector) + ' ← ' + (/^\{\{\w+\}\}$/.test(s.value) ? s.value : (s.value ? '«texto»' : '')) : s.type === 'extract' ? s.label : s.type === 'press' ? s.key : (s.label || s.text || s.selector || ''))} <a data-del="${i}" title="Quitar" style="float:right"><span class="far fa-trash-can"></span></a></div></div>`).join('') : ''; };
            drawSteps();
            list.onclick = e => { const d = e.target.closest('[data-del]'); if (d) { steps.splice(+d.dataset.del, 1); drawSteps(); } };
            const run = (b, then) => { if (busy || !sid) { return; } busy = true; ld.hidden = false; return api(Object.assign({op: 'action', id: sid}, b)).then(r => { show(r); if (then) { then(r); } }).catch(err).then(() => { busy = false; ld.hidden = true; }); };

            const start = () => {
                const url = q('[data-u]').value.trim(); if (!/^https?:\/\//i.test(url)) { msg.textContent = 'La dirección debe empezar por http:// o https://'; return; }
                if (!sid) {
                    ld.hidden = false; msg.textContent = 'Abriendo el navegador…';
                    api({op: 'open', url}).then(r => { sid = r.id; vp = r.viewport || vp; show(r); msg.textContent = 'Listo: usa la página. Cada acción se graba como un paso.'; if (!steps.some(s => s.type === 'goto')) { steps.unshift({type: 'goto', url}); drawSteps(); } }).catch(err).then(() => { ld.hidden = true; });
                } else { run({type: 'goto', url}, () => { steps.push({type: 'goto', url}); drawSteps(); }); }
            };
            q('[data-go]').onclick = start;
            q('[data-u]').addEventListener('keydown', e => { if (e.key === 'Enter') { start(); } });
            q('[data-back]').onclick = () => run({type: 'back'});
            body.querySelectorAll('[data-mode]').forEach(b => { b.onclick = () => { mode = b.dataset.mode; body.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === b)); cand.innerHTML = '<div class="ch-muted">' + (mode === 'pick' ? 'Pulsa sobre el dato que quieres traer.' : 'Navega y escribe como siempre.') + '</div>'; }; });

            const typeBox = info => {
                cand.innerHTML = `<div class="ch-wp-c"><div class="ch-muted">Campo para escribir</div><b>${esc(info.label || info.selector)}</b>
                    <select class="form-control input-sm" data-as>${VAR_OPTS.map(([k, l]) => `<option value="${k}" ${info.isPassword && k === 'clave' ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
                    <input class="form-control input-sm" data-val type="${info.isPassword ? 'password' : 'text'}" placeholder="Escribe el texto (una vez, para grabar)" autocomplete="off">
                    <div class="ch-muted" style="font-size:11.5px">Si es credencial, el valor se guarda protegido y no queda en el paso: el paso solo dice {{usuario}} o {{clave}}.</div>
                    <button class="btn btn-primary btn-xs" data-write><span class="fas fa-keyboard"></span> Escribir y grabar</button></div>`;
                cand.querySelector('[data-val]').focus();
                cand.querySelector('[data-write]').onclick = () => {
                    const as = cand.querySelector('[data-as]').value, val = cand.querySelector('[data-val]').value; if (!val) { return; }
                    cand.innerHTML = '<div class="ch-muted">Escribiendo…</div>';
                    run({type: 'type', text: val}, () => {
                        const value = as === 'fixed' ? val : '{{' + as + '}}';
                        if (as === 'usuario' || as === 'clave') { o.onCredential(as, val); }
                        steps.push({type: 'fill', selector: info.selector, label: info.label || '', text: '', value}); drawSteps();
                        cand.innerHTML = '<div class="ch-muted">Escrito y grabado. Sigue con la página o pulsa <b>Enter</b> si hace falta.</div><button class="btn btn-default btn-xs" data-enter><span class="fas fa-level-down-alt"></span> Pulsar Enter (grabar)</button>';
                        cand.querySelector('[data-enter]').onclick = () => run({type: 'press', key: 'Enter'}, () => { steps.push({type: 'press', key: 'Enter'}); drawSteps(); });
                    });
                };
            };
            const pickBox = info => {
                cand.innerHTML = `<div class="ch-wp-c"><div class="ch-muted">Dato elegido</div><div class="ch-wp-txt">${esc(info.text) || '<i>(sin texto)</i>'}</div><code>${esc(info.selector)}</code>
                    <input class="form-control input-sm" data-lb placeholder="Qué dato es (ej.: Estado, Saldo)"><button class="btn btn-primary btn-xs" data-add><span class="fas fa-plus"></span> Agregar dato</button></div>`;
                cand.querySelector('[data-add]').onclick = () => { steps.push({type: 'extract', mode: 'selector', expr: info.selector, label: cand.querySelector('[data-lb]').value.trim() || info.text.slice(0, 30) || 'Dato'}); drawSteps(); cand.innerHTML = '<div class="ch-muted">Agregado. Elige otro dato si quieres.</div>'; };
            };
            img.addEventListener('click', e => {
                if (!sid) { return; }
                const r = img.getBoundingClientRect(), x = Math.round((e.clientX - r.left) / r.width * vp.width), y = Math.round((e.clientY - r.top) / r.height * vp.height);
                if (mode === 'pick') { run({type: 'probe', x, y}, res => { if (res.info) { pickBox(res.info); } }); return; }
                run({type: 'click', x, y}, res => {
                    const i = res.info; if (!i) { return; }
                    if (i.isInput) { typeBox(i); }
                    else { steps.push({type: 'click', selector: i.selector, text: i.tag === 'button' || i.tag === 'a' ? (i.text || '').slice(0, 60) : '', label: (i.text || i.label || '').slice(0, 50)}); drawSteps(); }
                });
            });
            img.addEventListener('wheel', e => { e.preventDefault(); run({type: 'scroll', dy: e.deltaY}); }, {passive: false});
            const obs = new MutationObserver(() => { if (!body.isConnected) { obs.disconnect(); if (sid) { api({op: 'close', id: sid}).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } }); } } });
            obs.observe(document.body, {childList: true, subtree: true});
            if (/^https?:\/\/\S+$/.test(o.url || '')) { start(); }
        }});
    }

    return {open};
});
