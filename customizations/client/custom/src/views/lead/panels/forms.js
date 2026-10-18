/**
 * Panel «Formularios» de la ficha del lead: los formularios internos que la empresa diseñó para la etapa actual del lead, en pestañas (sin alargar la ficha hacia abajo),
 * con «Llenar formulario» para los que se lanzan desde un botón. Cada formulario se llena en línea y puede generar PDF, cambiar el estado, crear tareas, etc.
 * Endpoints: GET CrmHub/iforms y GET CrmHub/iformEntries. Se redibuja al cambiar el estado del lead.
 */
define('custom:views/lead/panels/forms', ['views/record/panels/bottom', 'custom:ui', 'custom:iform'], function (Dep, ChUi, IForm) {
    const esc = v => ChUi.esc(v == null ? '' : v);
    return class extends Dep {
        templateContent = '<div class="ch-fp"><div class="ch-muted ch-pad">Cargando…</div></div>'
        defs = null
        entries = []
        tab = 'stage'
        canManage = false

        afterRender() {
            super.afterRender();
            if (!this._chL) { this._chL = true; this.listenTo(this.model, 'change:status', () => this.draw()); }
            try { this.tab = sessionStorage.getItem('chFp-' + this.model.id) || 'stage'; } catch (e) { /* nada */ }
            this.load();
        }

        load() {
            Promise.all([Espo.Ajax.getRequest('CrmHub/iforms'), Espo.Ajax.getRequest('CrmHub/iformEntries', {leadId: this.model.id})]).then(([d, e]) => {
                this.defs = d.forms || []; this.canManage = !!d.canManage; this.entries = e.entries || []; this.draw();
            }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } const r = this.el && this.el.querySelector('.ch-fp'); if (r) { r.innerHTML = '<div class="ch-muted ch-pad">No se pudieron cargar los formularios.</div>'; } });
        }

        entryOf(f) { return this.entries.find(x => x.formId === f.id) || null; }
        applies(f) { return !f.stages.length || f.stages.includes(this.model.get('status')); }

        draw() {
            const root = this.el && this.el.querySelector('.ch-fp'); if (!root || !this.defs) { return; }
            const forms = this.defs, st = forms.filter(f => this.applies(f));
            const tabForms = forms.filter(f => f.tab && (this.applies(f) || this.entryOf(f)));
            const btnForms = forms.filter(f => f.button && this.applies(f));
            if (!forms.length) {
                root.innerHTML = ChUi.empty({kind: 'doc', title: 'Aún no hay formularios', text: this.canManage ? 'Crea los formularios de tu gestión en Organización → Formularios internos.' : 'Tu gerente o supervisor puede crear formularios para tu gestión.', compact: true});
                return;
            }
            const done = f => { const e = this.entryOf(f); return e ? (e.complete ? '✓' : '•') : ''; };
            if (this.tab !== 'stage' && !tabForms.some(f => f.id === this.tab)) { this.tab = 'stage'; }
            const tabs = [`<button data-t="stage" class="${this.tab === 'stage' ? 'on' : ''}">Esta etapa <b>${st.length}</b></button>`].concat(tabForms.map(f => `<button data-t="${esc(f.id)}" class="${this.tab === f.id ? 'on' : ''}">${esc(f.name)} <i>${done(f)}</i></button>`));
            root.innerHTML = `<div class="ch-fp-top"><div class="ch-fp-tabs">${tabs.join('')}</div>` +
                (btnForms.length ? `<div class="ch-fp-fill"><button class="btn btn-default btn-sm" data-fill><span class="fas fa-clipboard-list"></span> Llenar formulario</button></div>` : '') + '</div><div class="ch-fp-body"></div>';
            const body = root.querySelector('.ch-fp-body');
            if (this.tab === 'stage') {
                body.innerHTML = st.length ? st.map(f => { const e = this.entryOf(f); return `<div class="ch-fp-card" data-open="${esc(f.id)}"><span class="fas fa-clipboard-list"></span><div><b>${esc(f.name)}</b><small>${e ? (e.complete ? 'Completo' : 'Incompleto') + ' · ' + esc(ChUi.fmt.dt(e.updatedAt)) : 'Pendiente de llenar'}</small></div><span class="ch-fp-st ${e ? (e.complete ? 'ok' : 'half') : ''}">${e ? (e.complete ? '✓' : '•') : '○'}</span></div>`; }).join('')
                    : ChUi.empty({kind: 'doc', title: 'Sin formularios para esta etapa', text: `El estado del lead es «${esc(this.model.get('status') || '')}».`, compact: true});
            } else {
                const f = forms.find(x => x.id === this.tab); this.mounted = IForm.mount(body, {leadId: this.model.id, form: f, entry: this.entryOf(f), onSaved: () => this.refresh(true)});
            }
            root.onclick = e => {
                const t = e.target.closest('[data-t]'); if (t) { this.tab = t.dataset.t; try { sessionStorage.setItem('chFp-' + this.model.id, this.tab); } catch (x) { /* nada */ } this.draw(); return; }
                const o = e.target.closest('[data-open]'); if (o) { this.tab = o.dataset.open; try { sessionStorage.setItem('chFp-' + this.model.id, this.tab); } catch (x) { /* nada */ } const f = forms.find(x => x.id === this.tab); if (f && !f.tab) { this.tab = 'stage'; IForm.openModal(this.model, f, this.entryOf(f), () => this.refresh()); } else { this.draw(); } return; }
                if (e.target.closest('[data-fill]')) { this.pick(btnForms); }
            };
        }

        // refresca las respuestas sin volver a dibujar el formulario que se está escribiendo (silent)
        refresh(silent) {
            Espo.Ajax.getRequest('CrmHub/iformEntries', {leadId: this.model.id}).then(e => { this.entries = e.entries || []; if (silent && this.mounted && this.tab !== 'stage') { const f = this.defs.find(x => x.id === this.tab); this.mounted.update(this.entryOf(f)); } else { this.draw(); } })
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } });
        }

        pick(list) {
            ChUi.panel({title: 'Llenar formulario', icon: 'fas fa-clipboard-list', close: 'Cancelar', mount: (body, close) => {
                body.innerHTML = list.map(f => `<div class="ch-fp-card" data-id="${esc(f.id)}"><span class="fas fa-clipboard-list"></span><div><b>${esc(f.name)}</b><small>${esc(f.description || '')}</small></div></div>`).join('');
                body.onclick = e => { const c = e.target.closest('[data-id]'); if (!c) { return; } close(true); const f = list.find(x => x.id === c.dataset.id); setTimeout(() => IForm.openModal(this.model, f, this.entryOf(f), () => this.refresh()), 50); };
            }});
        }
    };
});
