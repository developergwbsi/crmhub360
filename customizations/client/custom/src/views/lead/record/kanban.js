define('custom:views/lead/record/kanban', ['custom:views/record/kanban-drawer'], function (Dep) {
    const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

    return class extends Dep {
        itemViewName = 'custom:views/lead/kanban-item'
        columnFilters = {}

        afterRender() {
            super.afterRender();
            this.setupColumnSearch();
        }

        // Un buscador por estado: filtra las tarjetas ya cargadas de esa columna (nombre, teléfono, servicio, asesor…).
        setupColumnSearch() {
            const cols = this.$el.find('td.group-column');
            // los buscadores viven en el encabezado de estados (que Espo deja fijo al hacer scroll), una celda por columna
            const headRow = this.el.querySelector('.kanban-head thead');
            if (!headRow) { return; }
            let cells = headRow.querySelectorAll('.ch-head-search-cell');
            if (!cells.length) {
                const tr = document.createElement('tr');
                tr.className = 'ch-head-search';
                headRow.querySelectorAll('th.group-header').forEach(() => {
                    const th = document.createElement('th'); th.className = 'ch-head-search-cell'; tr.appendChild(th);
                });
                headRow.appendChild(tr);
                cells = tr.querySelectorAll('.ch-head-search-cell');
            }
            cols.each((i, td) => {
                const list = td.querySelector('.group-column-list');
                if (!list || !cells[i] || cells[i].querySelector('.ch-col-search')) { return; }
                const box = document.createElement('div');
                box.className = 'ch-col-search';
                box.innerHTML = '<span class="fas fa-magnifying-glass"></span>' +
                    '<input type="search" placeholder="Buscar…" title="Buscar en esta columna" autocomplete="off" spellcheck="false">' +
                    '<span class="ch-col-count"></span>';
                cells[i].appendChild(box);
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
            const count = (this.el.querySelectorAll('.ch-head-search-cell')[i] || td).querySelector('.ch-col-count');
            if (count) {
                const g = (this.groupDataList || [])[i], total = g && g.collection ? g.collection.total : -1;
                const more = total > items.length ? total - items.length : 0;
                count.textContent = q ? `${shown} de ${items.length} cargados` : (total >= 0 ? (more ? `${items.length} de ${total}` : `${total}`) : '');
                td.classList.toggle('ch-has-more', more > 0);
                td.dataset.chMore = more || '';
            }
        }
    };
});
