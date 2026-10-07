// Tablero de cualquier entidad: al pulsar una tarjeta se abre la ficha en un panel lateral (pantalla dividida).
define('custom:views/record/kanban-drawer', ['views/record/kanban'], function (Dep) {
    return class extends Dep {
        afterRender() {
            super.afterRender();
            this.setupCardOpen();
        }

        setupCardOpen() {
            if (this._chOpenBound) { return; }
            this._chOpenBound = true;
            const SKIP = '.item-menu-container, .ch-col-search, input, select, textarea, button, a[href^="tel:"], a[href^="mailto:"], .dropdown-menu';
            let down = null;
            this.el.addEventListener('mousedown', e => {
                const it = e.target.closest('.group-column-list .item');
                down = (it && !e.target.closest(SKIP) && !e.button && !e.ctrlKey && !e.metaKey && !e.shiftKey) ? {id: it.dataset.id, x: e.clientX, y: e.clientY} : null;
            }, true);
            // Se abre al soltar el botón (no con «click»): el arrastre de tarjetas de Espo a veces se come el click aunque solo se mueva un poco el ratón.
            this.el.addEventListener('mouseup', e => {
                const d = down; down = null;
                if (!d || !d.id || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) { return; } // fue un arrastre
                const it = e.target.closest('.group-column-list .item');
                if (!it || it.dataset.id !== d.id || e.target.closest(SKIP)) { return; }
                this.openDrawer(d.id);
            }, true);
            // el enlace del nombre no debe navegar a pantalla completa
            this.el.addEventListener('click', e => {
                if (e.ctrlKey || e.metaKey || e.shiftKey || e.button || e.target.closest(SKIP)) { return; }
                if (e.target.closest('.group-column-list .item')) { e.preventDefault(); e.stopPropagation(); }
            }, true);
        }

        openDrawer(id) {
            if (this.hasView('drawer')) { this.getView('drawer').close(); this.clearView('drawer'); }
            const model = this.collection.get(id);
            this.createView('drawer', 'custom:views/modals/lead-drawer', {scope: this.entityType, entityType: this.entityType, id, model}, v => v.render());
        }
    };
});
