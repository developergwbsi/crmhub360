define('custom:views/email/record/list', ['views/email/record/list'], function (Dep) {
    return class extends Dep {
        afterRender() {
            super.afterRender();
            this.hideEditOfSent();
        }
        // «Editar» solo para borradores: un correo enviado o recibido no se modifica
        hideEditOfSent() {
            this.$el.find('tr.list-row').each((i, tr) => {
                const m = this.collection && this.collection.get(tr.dataset.id);
                if (m && m.get('status') && m.get('status') !== 'Draft') { tr.querySelectorAll('[data-action="quickEdit"]').forEach(a => { (a.closest('li') || a).remove(); }); }
            });
        }
    };
});
