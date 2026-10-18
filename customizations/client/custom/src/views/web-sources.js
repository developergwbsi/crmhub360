/**
 * Consultas web (gerente, director o supervisor): se definen las páginas públicas que el equipo puede consultar para traer información de un cliente y decidir:
 * dirección (con variables como {{identificacion}}), datos a traer (se eligen pulsando sobre la página en la vista previa) y, opcionalmente, qué debe analizar la IA.
 * Luego se usan desde la ficha del lead («Consultar web» en el menú ⋯) o desde una acción de formulario interno. Endpoints: GET CrmHub/webSources?all=1 y POST CrmHub/webSourcesSave.
 */
define('custom:views/web-sources', ['view', 'custom:ui', 'custom:web-picker'], function (Dep, ChUi, WP) {
    const esc = v => ChUi.esc(v == null ? '' : v);
    const NEW = () => ({id: '', name: 'Nueva consulta', description: '', url: '', rules: [], analyze: '', note: true, active: true});
    const SAMPLE = () => ({id: '', name: 'Validación de un registro público', description: 'Ejemplo: consulta una página con el documento del cliente y pide a la IA una recomendación.', url: 'https://ejemplo.com/consulta?documento={{identificacion}}', rules: [], analyze: '¿La persona aparece con alguna alerta o sanción? ¿Qué recomiendas para atenderla?', note: true, active: true});

    return class extends Dep {
        templateContent = '<div class="ch-ifb"></div>'
        data0 = null
        sel = 0
        dirty = false

        setup() {
            this.getHelper().pageTitle.setTitle('Consultas web');
            Espo.Ajax.getRequest('CrmHub/webSources', {all: 1}).then(r => { this.data0 = r; this.items = JSON.parse(JSON.stringify(r.sources || [])); this.draw(); })
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } this.data0 = {error: true}; this.draw(); });
        }

        afterRender() { this.draw(); }

        draw() {
            const root = this.el && this.el.querySelector('.ch-ifb'); if (!root) { return; }
            const d = this.data0;
            if (!d) { root.innerHTML = '<div class="ch-muted" style="padding:24px">Cargando…</div>'; return; }
            if (d.error) { root.innerHTML = '<div class="ch-chat-err">No se pudieron cargar las consultas.</div>'; return; }
            if (!d.canManage) { root.innerHTML = '<div class="ch-chat-err">Solo gerentes, directores y supervisores pueden configurar consultas web.</div>'; return; }
            const list = this.items.map((x, i) => `<div class="ch-ifb-it ${i === this.sel ? 'on' : ''}" data-sel="${i}"><span class="fas fa-globe"></span><div><b>${esc(x.name)}</b><small>${x.active ? '' : 'Inactiva · '}${x.rules.length} dato(s)${x.analyze ? ' · con IA' : ''}</small></div></div>`).join('');
            root.innerHTML = `<div class="ch-sim-head"><h3><span class="fas fa-globe"></span> Consultas web</h3>
                <p class="ch-muted">Configura las páginas públicas que tu equipo puede consultar para traer información de un cliente y tomar decisiones: eliges la página, <b>ves la página y pulsas sobre los datos que necesitas</b>, y si quieres la IA los analiza y recomienda. Se usan desde la ficha del lead (menú ⋯ → «Consultar web») o desde una acción de un formulario interno. Solo páginas públicas que muestran su contenido sin JavaScript, captcha ni usuario y clave; respeta los términos de uso de cada sitio.</p></div>
                <div class="ch-ifb-wrap"><div class="ch-ifb-list">${list || ChUi.empty({kind: 'doc', title: 'Sin consultas', text: 'Crea la primera.', compact: true})}
                <button class="btn btn-primary btn-sm" data-a="new"><span class="fas fa-plus"></span> Nueva consulta</button> <button class="btn btn-default btn-sm" data-a="sample">Usar ejemplo</button></div>
                <div class="ch-ifb-ed">${this.items.length ? this.editor(this.items[this.sel]) : '<div class="ch-muted">Crea una consulta para empezar.</div>'}</div></div>
                <div class="ch-ifb-save"><span class="ch-muted">${this.dirty ? 'Hay cambios sin guardar' : ''}</span><button class="btn btn-primary" data-a="save"><span class="fas fa-floppy-disk"></span> Guardar todo</button></div>`;
            this.bind(root);
        }

        editor(x) {
            const rules = x.rules.map((r, j) => `<div class="ch-ifb-row"><input class="form-control input-sm" data-b="rules.${j}.label" value="${esc(r.label)}" placeholder="Qué dato es">
                <select class="form-control input-sm" data-b="rules.${j}.mode" data-redraw><option value="selector" ${r.mode !== 'regex' && r.mode !== 'text' ? 'selected' : ''}>Selector CSS</option><option value="regex" ${r.mode === 'regex' ? 'selected' : ''}>Expresión regular</option><option value="text" ${r.mode === 'text' ? 'selected' : ''}>Texto de la página</option></select>
                ${r.mode === 'text' ? '' : `<input class="form-control input-sm" data-b="rules.${j}.expr" value="${esc(r.expr)}" placeholder="${r.mode === 'regex' ? 'Saldo:\\s*([\\d.,]+)' : '.resultado .valor'}">`}<a data-del-r="${j}" title="Quitar"><span class="far fa-trash-can"></span></a></div>`).join('');
            return `<div class="ch-sim-card"><h4>La consulta</h4>
                <input class="form-control" data-b="name" value="${esc(x.name)}" placeholder="Nombre">
                <textarea class="form-control" rows="2" data-b="description" placeholder="Para qué sirve (opcional)" style="margin-top:6px">${esc(x.description)}</textarea>
                <input class="form-control" data-b="url" value="${esc(x.url)}" placeholder="https://ejemplo.com/consulta?documento={{identificacion}}" style="margin-top:6px">
                <div class="ch-muted">Variables: {{nombre}}, {{identificacion}}, {{telefono}} y {{correo}} del lead.</div>
                <label class="ch-ifb-ck"><input type="checkbox" data-b="active" ${x.active ? 'checked' : ''}> Activa</label>
                <label class="ch-ifb-ck"><input type="checkbox" data-b="note" ${x.note !== false ? 'checked' : ''}> Dejar nota en el historial del lead</label>
                <a class="ch-ifb-del" data-a="del"><span class="far fa-trash-can"></span> Eliminar esta consulta</a></div>
                <div class="ch-sim-card"><h4>Datos a traer</h4>
                <div><button class="btn btn-primary btn-sm" data-a="pick"><span class="fas fa-hand-pointer"></span> Ver la página y elegir los datos con clics</button></div>${rules}
                <button class="btn btn-default btn-xs" data-a="addrule"><span class="fas fa-plus"></span> Añadir dato a mano</button></div>
                <div class="ch-sim-card"><h4>Análisis con IA (opcional)</h4><textarea class="form-control" rows="3" data-b="analyze" placeholder="Qué debe analizar la IA con lo que dice la página para ayudar a decidir (ej.: ¿el cliente aparece reportado? ¿qué recomiendas?)">${esc(x.analyze)}</textarea></div>`;
        }

        set(path, v) {
            const ks = path.split('.'); let o = this.items[this.sel];
            for (let i = 0; i < ks.length - 1; i++) { o = o[isNaN(ks[i]) ? ks[i] : +ks[i]]; if (o == null) { return; } }
            const k = ks[ks.length - 1]; o[isNaN(k) ? k : +k] = v; this.dirty = true;
        }

        bind(root) {
            const cur = () => this.items[this.sel];
            root.onchange = root.oninput = e => {
                const t = e.target, b = t.dataset.b; if (!b) { return; }
                this.set(b, t.type === 'checkbox' ? t.checked : t.value);
                if (t.hasAttribute('data-redraw') && e.type === 'change') { this.draw(); }
            };
            root.onclick = e => {
                const s = e.target.closest('[data-sel]'); if (s) { this.sel = +s.dataset.sel; this.draw(); return; }
                const dr = e.target.closest('[data-del-r]'); if (dr) { cur().rules.splice(+dr.dataset.delR, 1); this.dirty = true; this.draw(); return; }
                const a = e.target.closest('[data-a]'); if (!a) { return; }
                const k = a.dataset.a;
                if (k === 'new') { this.items.push(NEW()); this.sel = this.items.length - 1; this.dirty = true; this.draw(); }
                else if (k === 'sample') { this.items.push(SAMPLE()); this.sel = this.items.length - 1; this.dirty = true; this.draw(); }
                else if (k === 'addrule') { cur().rules.push({label: '', mode: 'selector', expr: ''}); this.dirty = true; this.draw(); }
                else if (k === 'pick') { WP.open({url: cur().url, rules: cur().rules, onUrl: u => { if (!cur().url) { cur().url = u; } }}).then(() => { this.dirty = true; this.draw(); }); }
                else if (k === 'del') { ChUi.confirm({title: 'Eliminar consulta', text: 'Se elimina al guardar. Las acciones de formulario que la usen dejarán de funcionar.', ok: 'Eliminar', danger: true}).then(y => { if (y) { this.items.splice(this.sel, 1); this.sel = 0; this.dirty = true; this.draw(); } }); }
                else if (k === 'save') { this.save(a); }
            };
        }

        save(btn) {
            btn.disabled = true;
            Espo.Ajax.postRequest('CrmHub/webSourcesSave', {sources: this.items}).then(r => {
                this.items = JSON.parse(JSON.stringify(r.sources)); this.dirty = false; this.sel = Math.min(this.sel, Math.max(0, this.items.length - 1)); Espo.Ui.success('Consultas guardadas'); this.draw();
            }).catch(xhr => { btn.disabled = false; Espo.Ui.error((xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason')) || 'No se pudo guardar'); if (xhr) { xhr.errorIsHandled = true; } });
        }
    };
});
