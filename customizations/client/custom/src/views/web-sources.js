/**
 * Consultas web (gerente, director o supervisor): se definen las páginas públicas que el equipo puede consultar para traer información de un cliente y decidir:
 * dirección (con variables como {{identificacion}}), datos a traer (se eligen pulsando sobre la página en la vista previa) y, opcionalmente, qué debe analizar la IA.
 * Luego se usan desde la ficha del lead («Consultar web» en el menú ⋯) o desde una acción de formulario interno. Endpoints: GET CrmHub/webSources?all=1 y POST CrmHub/webSourcesSave.
 */
define('custom:views/web-sources', ['view', 'custom:ui', 'custom:web-picker', 'custom:web-recorder', 'custom:studio'], function (Dep, ChUi, WP, Rec, Studio) {
    const esc = v => ChUi.esc(v == null ? '' : v);
    const NEW = () => ({id: '', name: 'Nueva consulta', description: '', mode: 'simple', url: '', rules: [], steps: [], credNames: [], credentials: [], analyze: '', note: true, active: true});
    const NEWB = () => ({id: '', name: 'Consulta con login', description: 'Entra a un sitio con usuario y clave, navega y trae datos.', mode: 'browser', url: '', rules: [], steps: [], credNames: ['usuario', 'clave'], credentials: [], analyze: '', note: true, active: true});
    const STEP_TYPES = [['goto', 'Abrir una página'], ['fill', 'Escribir en un campo'], ['click', 'Hacer clic'], ['press', 'Pulsar una tecla'], ['wait', 'Esperar'], ['extract', 'Extraer un dato']];
    const SAMPLE = () => ({id: '', name: 'Validación de un registro público', description: 'Ejemplo: consulta una página con el documento del cliente y pide a la IA una recomendación.', url: 'https://ejemplo.com/consulta?documento={{identificacion}}', rules: [], analyze: '¿La persona aparece con alguna alerta o sanción? ¿Qué recomiendas para atenderla?', note: true, active: true});

    return class extends Dep {
        templateContent = '<div class="ch-ifb"></div>'
        data0 = null
        sel = 0
        dirty = false
        tab = 'query'

        setup() {
            this.getHelper().pageTitle.setTitle('Consultas web');
            Espo.Ajax.getRequest('CrmHub/webSources', {all: 1}).then(r => { this.data0 = r; this.items = JSON.parse(JSON.stringify(r.sources || [])); this.draw(); })
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } this.data0 = {error: true}; this.draw(); });
        }

        afterRender() { this.draw(); }

        onRemove() { Studio.detach(this); if (super.onRemove) { super.onRemove(); } }

        draw() {
            const root = this.el && this.el.querySelector('.ch-ifb'); if (!root) { return; }
            const d = this.data0;
            if (!d) { root.innerHTML = '<div class="ch-muted" style="padding:24px">Cargando…</div>'; return; }
            if (d.error) { root.innerHTML = '<div class="ch-chat-err">No se pudieron cargar las consultas.</div>'; return; }
            if (!d.canManage) { root.innerHTML = '<div class="ch-chat-err">Solo gerentes, directores y supervisores pueden configurar consultas web.</div>'; return; }
            const list = this.items.map((x, i) => `<div class="ch-ifb-it ${i === this.sel ? 'on' : ''}" data-sel="${i}"><span class="fas fa-globe"></span><div><b>${esc(x.name)}</b><small>${x.active ? '' : 'Inactiva · '}${x.mode === 'browser' ? 'navegador · ' + (x.steps || []).length + ' paso(s)' : x.rules.length + ' dato(s)'}${x.analyze ? ' · con IA' : ''}</small></div></div>`).join('');
            const cur = this.items[this.sel], secs = cur ? this.editor(cur) : null;
            const br = cur && cur.mode === 'browser';
            const tabs = [['query', 'La consulta'], br ? ['flow', 'Flujo de navegación' + (cur ? ` (${(cur.steps || []).length})` : '')] : ['data', 'Datos a traer' + (cur ? ` (${cur.rules.length})` : '')], ['ai', 'Análisis con IA']];
            if (!tabs.some(t => t[0] === this.tab)) { this.tab = 'query'; }
            const top = (root.querySelector('.ch-studio-content') || {}).scrollTop || 0;
            root.innerHTML = `<div class="ch-studio"><div class="ch-studio-head"><div><h3><span class="fas fa-globe"></span> Consultas web</h3><p class="ch-muted">Las páginas públicas que tu equipo puede consultar para traer información de un cliente: ves la página, pulsas sobre los datos que necesitas y, si quieres, la IA los analiza y recomienda. Se usan desde la ficha del lead (menú ⋯ → «Consultar web») o desde un formulario interno. Solo páginas que muestran su contenido sin JavaScript, captcha ni usuario y clave; respeta los términos de cada sitio.</p></div>
                <div class="ch-studio-act">${this.dirty ? '<span class="ch-studio-dirty"><span class="fas fa-circle"></span> Cambios sin guardar</span>' : ''}<button class="btn btn-default btn-sm" data-a="sample">Usar ejemplo</button><button class="btn btn-default btn-sm" data-a="new"><span class="fas fa-plus"></span> Nueva consulta</button><button class="btn btn-default btn-sm" data-a="newb"><span class="fas fa-window-maximize"></span> Nueva con navegador</button><button class="btn btn-primary btn-sm" data-a="save"><span class="fas fa-floppy-disk"></span> Guardar todo</button></div></div>
                <div class="ch-studio-body"><aside class="ch-studio-list">${list || ChUi.empty({kind: 'doc', title: 'Sin consultas', text: 'Crea la primera.', compact: true})}</aside>
                <section class="ch-studio-main">${cur ? `<div class="ch-studio-tabs">${tabs.map(([k, l]) => `<button type="button" data-tab="${k}" class="${k === this.tab ? 'on' : ''}">${l}</button>`).join('')}</div><div class="ch-studio-content">${secs[this.tab]}</div>` : '<div class="ch-studio-content ch-muted">Crea una consulta para empezar.</div>'}</section></div></div>`;
            const c2 = root.querySelector('.ch-studio-content'); if (c2) { c2.scrollTop = top; }
            Studio.attach(this, '.ch-studio');
            this.bind(root);
        }

        editor(x) {
            const rules = x.rules.map((r, j) => `<div class="ch-ifb-row"><input class="form-control input-sm" data-b="rules.${j}.label" value="${esc(r.label)}" placeholder="Qué dato es">
                <select class="form-control input-sm" data-b="rules.${j}.mode" data-redraw><option value="selector" ${r.mode !== 'regex' && r.mode !== 'text' ? 'selected' : ''}>Selector CSS</option><option value="regex" ${r.mode === 'regex' ? 'selected' : ''}>Expresión regular</option><option value="text" ${r.mode === 'text' ? 'selected' : ''}>Texto de la página</option></select>
                ${r.mode === 'text' ? '' : `<input class="form-control input-sm" data-b="rules.${j}.expr" value="${esc(r.expr)}" placeholder="${r.mode === 'regex' ? 'Saldo:\\s*([\\d.,]+)' : '.resultado .valor'}">`}<a data-del-r="${j}" title="Quitar"><span class="far fa-trash-can"></span></a></div>`).join('');
            return {flow: this.flow(x), query: `<div class="ch-sim-card"><h4>La consulta</h4>
                <input class="form-control" data-b="name" value="${esc(x.name)}" placeholder="Nombre">
                <textarea class="form-control" rows="2" data-b="description" placeholder="Para qué sirve (opcional)" style="margin-top:6px">${esc(x.description)}</textarea>
                <div class="ch-ifb-row" style="margin-top:8px"><select class="form-control input-sm" data-b="mode" data-redraw><option value="simple" ${x.mode !== 'browser' ? 'selected' : ''}>Página sencilla: lee el HTML de una dirección</option><option value="browser" ${x.mode === 'browser' ? 'selected' : ''}>Navegador: inicia sesión, navega y lee páginas con JavaScript</option></select></div>
                ${x.mode === 'browser' ? '<div class="ch-muted">El flujo se graba en la pestaña «Flujo de navegación». Variables disponibles: {{nombre}}, {{identificacion}}, {{telefono}}, {{correo}} y tus credenciales.</div>' : `<input class="form-control" data-b="url" value="${esc(x.url)}" placeholder="https://ejemplo.com/consulta?documento={{identificacion}}" style="margin-top:6px">
                <div class="ch-muted">Variables: {{nombre}}, {{identificacion}}, {{telefono}} y {{correo}} del lead.</div>`}
                <label class="ch-ifb-ck"><input type="checkbox" data-b="active" ${x.active ? 'checked' : ''}> Activa</label>
                <label class="ch-ifb-ck"><input type="checkbox" data-b="note" ${x.note !== false ? 'checked' : ''}> Dejar nota en el historial del lead</label>
                <a class="ch-ifb-del" data-a="del"><span class="far fa-trash-can"></span> Eliminar esta consulta</a></div>`, data: `<div class="ch-sim-card"><h4>Datos a traer</h4>
                <div><button class="btn btn-primary btn-sm" data-a="pick"><span class="fas fa-hand-pointer"></span> Ver la página y elegir los datos con clics</button></div>${rules}
                <button class="btn btn-default btn-xs" data-a="addrule"><span class="fas fa-plus"></span> Añadir dato a mano</button></div>`, ai: `<div class="ch-sim-card"><h4>Análisis con IA (opcional)</h4><textarea class="form-control" rows="3" data-b="analyze" placeholder="Qué debe analizar la IA con lo que dice la página para ayudar a decidir (ej.: ¿el cliente aparece reportado? ¿qué recomiendas?)">${esc(x.analyze)}</textarea></div>`};
        }

        // pasos del flujo con navegador: grabar, editar y credenciales protegidas
        flow(x) {
            const st = x.steps || [];
            const row = (s2, i) => {
                const p = `steps.${i}.`, t = s2.type;
                const f = {
                    goto: `<input class="form-control input-sm" data-b="${p}url" value="${esc(s2.url)}" placeholder="https://…">`,
                    fill: `<input class="form-control input-sm" data-b="${p}label" value="${esc(s2.label)}" placeholder="Campo"><input class="form-control input-sm" data-b="${p}value" value="${esc(s2.value)}" placeholder="Valor o {{usuario}} / {{clave}}">`,
                    click: `<input class="form-control input-sm" data-b="${p}label" value="${esc(s2.label)}" placeholder="Elemento">`,
                    press: `<input class="form-control input-sm" data-b="${p}key" value="${esc(s2.key)}" placeholder="Enter, Tab…">`,
                    wait: `<input class="form-control input-sm" data-b="${p}text" value="${esc(s2.text)}" placeholder="Texto que debe aparecer (opcional)"><input type="number" class="form-control input-sm" style="max-width:110px" data-b="${p}ms" value="${esc(s2.ms == null ? 1500 : s2.ms)}" title="Milisegundos">`,
                    extract: `<input class="form-control input-sm" data-b="${p}label" value="${esc(s2.label)}" placeholder="Qué dato es"><input class="form-control input-sm" data-b="${p}expr" value="${esc(s2.expr)}" placeholder="Selector CSS">`,
                }[t] || '';
                return `<div class="ch-ifb-row"><span class="ch-muted" style="min-width:18px">${i + 1}</span><select class="form-control input-sm" style="max-width:190px" data-b="${p}type" data-redraw>${STEP_TYPES.map(([k, l]) => `<option value="${k}" ${k === t ? 'selected' : ''}>${l}</option>`).join('')}</select>${f}<a data-mvs="${i}:-1" title="Subir"><span class="fas fa-arrow-up"></span></a><a data-mvs="${i}:1" title="Bajar"><span class="fas fa-arrow-down"></span></a><a data-del-s="${i}" title="Quitar"><span class="far fa-trash-can"></span></a></div>`;
            };
            const creds = (x.credNames || []).map(n => { const c = (x.credentials || []).find(k => k.name === n); return `<div class="ch-ifb-row"><span style="min-width:90px"><b>{{${esc(n)}}}</b></span><div class="ch-pw" style="flex:1"><input class="form-control input-sm" type="password" autocomplete="new-password" data-cred="${esc(n)}" value="${esc((x.credNew || {})[n] || '')}" placeholder="${c && c.set ? '•••••••• (guardada; escribe para cambiarla)' : 'Valor (se guarda protegido)'}"><button type="button" class="ch-pw-eye" data-eye title="Mostrar u ocultar lo que escribes"><span class="far fa-eye"></span></button></div><span class="ch-muted">${(c && c.set) || (x.credNew && x.credNew[n]) ? '✓ guardada' : 'falta'}</span></div>`; }).join('');
            return `<div class="ch-sim-card"><h4>Flujo de navegación</h4><p class="ch-muted">Graba el recorrido en un navegador real: inicia sesión, navega hasta la página y elige los datos. Se repite igual cada vez que alguien usa la consulta.</p>
                <div class="ch-ifb-row"><button class="btn btn-primary btn-sm" data-a="record"><span class="fas fa-circle-dot"></span> ${st.length ? 'Grabar de nuevo / continuar' : 'Grabar el flujo'}</button><button class="btn btn-default btn-xs" data-a="addstep"><span class="fas fa-plus"></span> Añadir paso a mano</button></div>
                ${st.map(row).join('') || '<div class="ch-muted">Aún no hay pasos. Pulsa «Grabar el flujo».</div>'}</div>
                <div class="ch-sim-card"><h4>Credenciales de acceso</h4><p class="ch-muted">Usuario y clave del sitio. Se guardan protegidos en el servidor, no se muestran ni salen en el flujo; los pasos solo llevan {{usuario}} y {{clave}}. Usa una cuenta propia de la empresa con los permisos mínimos y respeta los términos del sitio. No funciona con captcha ni verificación en dos pasos.</p>${creds}
                <button class="btn btn-default btn-xs" data-a="addcred"><span class="fas fa-plus"></span> Añadir otra credencial</button></div>`;
        }

        set(path, v) {
            const ks = path.split('.'); let o = this.items[this.sel];
            for (let i = 0; i < ks.length - 1; i++) { o = o[isNaN(ks[i]) ? ks[i] : +ks[i]]; if (o == null) { return; } }
            const k = ks[ks.length - 1]; o[isNaN(k) ? k : +k] = v; this.dirty = true;
        }

        bind(root) {
            const cur = () => this.items[this.sel];
            root.onchange = root.oninput = e => {
                const t = e.target;
                if (t.dataset.cred) { const c = cur(); c.credNew = c.credNew || {}; c.credNew[t.dataset.cred] = t.value; this.dirty = true; return; }
                const b = t.dataset.b; if (!b) { return; }
                this.set(b, t.type === 'checkbox' ? t.checked : t.value);
                if (t.hasAttribute('data-redraw') && e.type === 'change') { this.draw(); }
            };
            root.onclick = e => {
                const tb = e.target.closest('[data-tab]'); if (tb) { this.tab = tb.dataset.tab; this.draw(); return; }
                const s = e.target.closest('[data-sel]'); if (s) { this.sel = +s.dataset.sel; this.draw(); return; }
                const ey = e.target.closest('[data-eye]'); if (ey) { const v = ey.parentElement.querySelector('input'), show = v.type === 'password'; v.type = show ? 'text' : 'password'; ey.querySelector('span').className = show ? 'far fa-eye-slash' : 'far fa-eye'; return; }
                const ds = e.target.closest('[data-del-s]'); if (ds) { cur().steps.splice(+ds.dataset.delS, 1); this.dirty = true; this.draw(); return; }
                const ms = e.target.closest('[data-mvs]'); if (ms) { const [i, dd] = ms.dataset.mvs.split(':').map(Number), a2 = cur().steps, j = i + dd; if (j >= 0 && j < a2.length) { [a2[i], a2[j]] = [a2[j], a2[i]]; this.dirty = true; this.draw(); } return; }
                const dr = e.target.closest('[data-del-r]'); if (dr) { cur().rules.splice(+dr.dataset.delR, 1); this.dirty = true; this.draw(); return; }
                const a = e.target.closest('[data-a]'); if (!a) { return; }
                const k = a.dataset.a;
                if (k === 'new') { this.items.push(NEW()); this.sel = this.items.length - 1; this.dirty = true; this.draw(); }
                else if (k === 'sample') { this.items.push(SAMPLE()); this.sel = this.items.length - 1; this.dirty = true; this.draw(); }
                else if (k === 'newb') { this.items.push(NEWB()); this.sel = this.items.length - 1; this.tab = 'query'; this.dirty = true; this.draw(); }
                else if (k === 'record') { const c = cur(); c.steps = c.steps || []; Rec.open({url: (c.steps.find(x => x.type === 'goto') || {}).url || '', steps: c.steps, credNames: c.credNames || [], onCredential: (n, v) => { c.credentials = c.credentials || []; c.credNew = c.credNew || {}; c.credNew[n] = v; c.credNames = c.credNames || []; if (!c.credNames.includes(n)) { c.credNames.push(n); } }}).then(() => { this.dirty = true; this.draw(); }); }
                else if (k === 'addstep') { cur().steps = cur().steps || []; cur().steps.push({type: 'click', selector: '', text: '', label: ''}); this.dirty = true; this.draw(); }
                else if (k === 'addcred') { ChUi.prompt({title: 'Otra credencial', text: 'Nombre sin espacios, por ejemplo: token', label: 'Nombre', rows: 1, max: 30, ok: 'Añadir'}).then(v => { const n = (v || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'); if (n) { cur().credNames = cur().credNames || []; if (!cur().credNames.includes(n)) { cur().credNames.push(n); } this.dirty = true; this.draw(); } }); }
                else if (k === 'addrule') { cur().rules.push({label: '', mode: 'selector', expr: ''}); this.dirty = true; this.draw(); }
                else if (k === 'pick') { WP.open({url: cur().url, rules: cur().rules, onUrl: u => { if (!cur().url) { cur().url = u; } }}).then(() => { this.dirty = true; this.draw(); }); }
                else if (k === 'del') { ChUi.confirm({title: 'Eliminar consulta', text: 'Se elimina al guardar. Las acciones de formulario que la usen dejarán de funcionar.', ok: 'Eliminar', danger: true}).then(y => { if (y) { this.items.splice(this.sel, 1); this.sel = 0; this.dirty = true; this.draw(); } }); }
                else if (k === 'save') { this.save(a); }
            };
        }

        save(btn) {
            btn.disabled = true;
            const payload = this.items.map(x => { const o2 = Object.assign({}, x); if (x.mode === 'browser') { o2.credentials = Object.assign({}, x.credNew || {}); } delete o2.credNew; return o2; });
            Espo.Ajax.postRequest('CrmHub/webSourcesSave', {sources: payload}).then(r => {
                this.items = JSON.parse(JSON.stringify(r.sources)); this.dirty = false; this.sel = Math.min(this.sel, Math.max(0, this.items.length - 1)); Espo.Ui.success('Consultas guardadas'); this.draw();
            }).catch(xhr => { btn.disabled = false; Espo.Ui.error((xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason')) || 'No se pudo guardar'); if (xhr) { xhr.errorIsHandled = true; } });
        }
    };
});
