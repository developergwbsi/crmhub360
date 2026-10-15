/**
 * Lista de leads de una cifra del tablero (#CrmHub/leadSet): los mismos leads que sumó el panel, en la lista de siempre (columnas, acciones masivas, ficha lateral).
 * Los ids vienen del panel por sessionStorage ('chLeadSet' = {title, ids, back, assign}). Con assign (Sin asesor) ofrece «Repartir automáticamente» (POST CrmHub/autoAssign).
 */
define('custom:views/lead-set', ['view', 'custom:ui'], function (Dep, ChUi) {
    const KEY = 'chLeadSet';
    const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };

    return class extends Dep {
        templateContent = `<div class="ch-ls">
            <div class="ch-ls-head"><a href="#Home" class="btn btn-default btn-sm" data-act="back"><span class="fas fa-arrow-left"></span> Volver al tablero</a>
            <h3 class="ch-ls-title"></h3><span class="ch-muted ch-ls-count"></span><span class="ch-ls-tools"></span></div>
            <div class="ch-ls-list list-container"></div></div>`
        set = null

        setup() {
            this.set = read();
            this.getHelper().pageTitle.setTitle(this.set ? this.set.title : 'Leads');
            if (!this.set || !this.set.ids.length) { return; }
            this.getCollectionFactory().create('Lead', c => {
                this.collection = c;
                c.maxSize = this.getConfig().get('recordsPerPage') || 20;
                c.where = [{type: 'in', attribute: 'id', value: this.set.ids}];
                c.fetch().then(() => {
                    this.createView('list', 'custom:views/record/list-drawer', {collection: c, selector: '.ch-ls-list', scope: 'Lead', pagination: false}, v => {
                        // la lista base deja escrito «undefined» donde iría la paginación que aquí no se usa
                        v.listenTo(v, 'after:render', () => { const w = document.createTreeWalker(v.el, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (n.nodeValue.trim() === 'undefined') { n.nodeValue = ''; } } });
                        if (this.isRendered()) { v.render(); }
                    });
                });
            });
        }

        afterRender() {
            const root = this.el.querySelector('.ch-ls'); if (!root) { return; }
            const s = this.set;
            root.querySelector('.ch-ls-title').textContent = s ? s.title : 'Leads';
            if (!s || !s.ids.length) {
                root.querySelector('.ch-ls-list').innerHTML = '<div class="ch-muted" style="padding:24px">No hay leads para mostrar. Vuelve al tablero y elige una cifra.</div>';
                return;
            }
            root.querySelector('.ch-ls-count').textContent = s.ids.length >= 2000 ? 'Primeros 2000' : s.ids.length + (s.ids.length === 1 ? ' lead' : ' leads');
            if (s.assign) {
                const t = root.querySelector('.ch-ls-tools');
                t.innerHTML = '<button class="btn btn-primary btn-sm" data-act="auto"><span class="fas fa-shuffle"></span> Repartir automáticamente</button>';
                t.querySelector('button').onclick = () => this.autoAssign();
            }
        }

        autoAssign() {
            const n = this.set.ids.length;
            ChUi.confirm({title: 'Repartir automáticamente', text: `Se asignarán ${n > 300 ? 'los primeros 300 de ' + n : n} lead(s) sin asesor entre los asesores disponibles, con el mismo balanceo del reparto automático.`, ok: 'Repartir'}).then(y => {
                if (!y) { return; }
                Espo.Ajax.postRequest('CrmHub/autoAssign', {ids: this.set.ids}).then(r => {
                    Espo.Ui.success(`Asignados ${r.assigned}` + (r.skipped ? ` · sin cambio ${r.skipped}` : ''));
                    this.set.ids = this.set.ids.slice(300).concat(r.assigned ? [] : this.set.ids.slice(0, 300));
                    if (this.collection) { this.collection.fetch(); }
                    try { this.getBaseController().clearScopeStoredMainView('Lead'); } catch (e) { /* sin lista guardada */ }
                }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('No se pudo repartir. ¿Tienes permiso de asignación?'); });
            });
        }
    };
});
