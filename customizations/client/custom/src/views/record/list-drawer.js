/**
 * Lista (tabla) de cualquier entidad: al pulsar el nombre abre la ficha en custom:views/modals/lead-drawer; con Ctrl/Cmd/Shift se abre a pantalla completa.
 * Se recarga sola con custom:live-list. El click se captura en fase de captura para interceptar el enlace del nombre. Sin endpoints.
 */
define('custom:views/record/list-drawer', ['views/record/list', 'custom:live-list'], function (Dep, Live) {
    return class extends Dep {
        setup() {
            super.setup();
            Live.attach(this);   // lead nuevo → la lista se recarga sola
        }

        onRemove() {
            Live.detach(this);
            super.onRemove && super.onRemove();
        }

        // iconos en cada fila: ver en el panel lateral o abrir la ficha completa
        chRowActs() {
            if (!this.collection) { return; }
            this.el.querySelectorAll('tr.list-row[data-id]').forEach(tr => {
                const cell = tr.querySelector('td.cell-name, td[data-name="name"]'); if (!cell || cell.querySelector('.ch-row-acts')) { return; }
                const w = document.createElement('span'); w.className = 'ch-row-acts';
                w.innerHTML = '<button type="button" data-ch-act="peek" title="Ver en el panel lateral"><span class="far fa-eye"></span></button><button type="button" data-ch-act="full" title="Abrir la ficha completa"><span class="fas fa-up-right-and-down-left-from-center"></span></button>';
                cell.appendChild(w);
            });
        }

        afterRender() {
            super.afterRender();
            this.chRowActs();
            if (this._chRowBound) { return; }
            this._chRowBound = true;
            this.el.addEventListener('click', e => {
                const act = e.target.closest('[data-ch-act]');
                if (act) {
                    e.preventDefault(); e.stopPropagation();
                    const id = act.closest('tr[data-id]').dataset.id;
                    if (act.dataset.chAct === 'full') { this.getRouter().navigate('#' + this.entityType + '/view/' + id, {trigger: true}); }
                    else { if (this.hasView('drawer')) { this.getView('drawer').close(); this.clearView('drawer'); } this.createView('drawer', 'custom:views/modals/lead-drawer', {scope: this.entityType, entityType: this.entityType, id, model: this.collection.get(id)}, v => v.render()); }
                    return;
                }
                if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) { return; }
                const a = e.target.closest('td[data-name="name"] a.link[data-id], td.cell-name a.link[data-id]');
                if (!a || !this.collection || !this.collection.get(a.dataset.id)) { return; }
                e.preventDefault(); e.stopPropagation();
                if (this.hasView('drawer')) { this.getView('drawer').close(); this.clearView('drawer'); }
                this.createView('drawer', 'custom:views/modals/lead-drawer', {scope: this.entityType, entityType: this.entityType, id: a.dataset.id, model: this.collection.get(a.dataset.id)}, v => v.render());
            }, true);
        }
    };
});
