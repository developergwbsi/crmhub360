// Listas (modo tabla): al pulsar el nombre se abre la ficha en un panel lateral; con Ctrl/Cmd se abre la pantalla completa como siempre.
define('custom:views/record/list-drawer', ['views/record/list'], function (Dep) {
    return class extends Dep {
        afterRender() {
            super.afterRender();
            if (this._chRowBound) { return; }
            this._chRowBound = true;
            this.el.addEventListener('click', e => {
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
