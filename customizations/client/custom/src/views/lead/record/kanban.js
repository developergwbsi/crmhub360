define('custom:views/lead/record/kanban', ['views/record/kanban'], function (Dep) {
    const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

    return class extends Dep {
        itemViewName = 'custom:views/lead/kanban-item'
        columnFilters = {}

        afterRender() {
            super.afterRender();
            this.setupColumnSearch();
            this.setupCardOpen();
        }

        // Al pulsar una tarjeta se abre la ficha en un panel lateral (el tablero sigue visible); «Abrir completo» va a pantalla completa.
        setupCardOpen() {
            if (this._chOpenBound) { return; }
            this._chOpenBound = true;
            let down = null;
            this.el.addEventListener('mousedown', e => { down = {x: e.clientX, y: e.clientY}; }, true);
            this.el.addEventListener('click', e => {
                const t = e.target;
                if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) { return; }
                if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { return; } // fue un arrastre
                if (t.closest('.item-menu-container, .ch-col-search, input, select, textarea, button, a[href^="tel:"], a[href^="mailto:"], .dropdown-menu')) { return; }
                const item = t.closest('.group-column-list .item');
                if (!item || !item.dataset.id) { return; }
                e.preventDefault(); e.stopPropagation();
                this.openDrawer(item.dataset.id);
            }, true);
        }

        openDrawer(id) {
            if (this.hasView('drawer')) { this.getView('drawer').close(); this.clearView('drawer'); }
            const model = this.collection.get(id);
            this.createView('drawer', 'custom:views/modals/lead-drawer', {scope: 'Lead', entityType: 'Lead', id, model}, v => v.render());
        }

        // Un buscador por estado: filtra las tarjetas ya cargadas de esa columna (nombre, teléfono, servicio, asesor…).
        setupColumnSearch() {
            const cols = this.$el.find('td.group-column');
            cols.each((i, td) => {
                const list = td.querySelector('.group-column-list');
                if (!list || td.querySelector('.ch-col-search')) { return; }
                const box = document.createElement('div');
                box.className = 'ch-col-search';
                box.innerHTML = '<span class="fas fa-magnifying-glass"></span>' +
                    '<input type="search" placeholder="Buscar en esta columna…" autocomplete="off" spellcheck="false">' +
                    '<span class="ch-col-count"></span>';
                list.parentNode.insertBefore(box, list);
                const input = box.querySelector('input');
                input.value = this.columnFilters[i] || '';
                input.addEventListener('input', () => { this.columnFilters[i] = input.value; this.applyColumnFilter(td, i); });
                // «mostrar más» o movimientos de tarjetas añaden elementos: se vuelve a aplicar el filtro
                new MutationObserver(() => this.applyColumnFilter(td, i)).observe(list, {childList: true});
                this.applyColumnFilter(td, i);
            });
        }

        applyColumnFilter(td, i) {
            const q = norm(this.columnFilters[i]).trim();
            const items = td.querySelectorAll('.group-column-list .item');
            let shown = 0;
            items.forEach(it => {
                const ok = !q || norm(it.textContent).includes(q);
                it.style.display = ok ? '' : 'none';
                shown += ok ? 1 : 0;
            });
            const count = td.querySelector('.ch-col-count');
            if (count) { count.textContent = q ? `${shown}/${items.length}` : ''; }
        }
    };
});
