/**
 * Tarjeta del tablero de leads (plantilla custom:lead/kanban-item).
 * Calcula iniciales y color de avatar (según el id) y oculta los campos vacíos; avatarUrl viene del atributo del lead.
 * Sin endpoints.
 */
define('custom:views/lead/kanban-item', ['views/record/kanban-item'], function (Dep) {
    const COLORS = ['#4f63e8', '#8b5cf6', '#0ea5e9', '#2fa36b', '#f59e0b', '#ef5b5b', '#14b8a6', '#d4729b'];

    return class extends Dep {
        template = 'custom:lead/kanban-item'

        afterRender() {
            super.afterRender();
            // los campos se pintan de forma asíncrona: se revisa al instante y de nuevo poco después
            const hideEmpty = () => this.$el.find('.ch-f').each((i, el) => {
                el.classList.toggle('ch-empty', !el.textContent.trim());
            });
            hideEmpty();
            setTimeout(hideEmpty, 400);
            // color según la calificación (borde izquierdo de la tarjeta)
            const card = this.el.querySelector('.ch-card');
            if (card) { const q = this.model.get('qualificationStatus'); card.classList.toggle('q-ok', q === 'Califica'); card.classList.toggle('q-warn', q === 'Revisión Manual'); card.classList.toggle('q-bad', q === 'No califica'); }
        }

        data() {
            const a = this.model.attributes;
            const first = (a.firstName || '').trim();
            const last = (a.lastName || '').trim();
            const initials = ((first[0] || '') + (last[0] || (first ? '' : (a.name || '?')[0]))).toUpperCase() || '?';
            let h = 0;
            String(this.model.id || '').split('').forEach(c => { h = (h * 31 + c.charCodeAt(0)) >>> 0; });
            return {
                ...super.data(),
                initials,
                avatarColor: COLORS[h % COLORS.length],
                avatarUrl: a.avatarUrl || '',
            };
        }
    };
});
