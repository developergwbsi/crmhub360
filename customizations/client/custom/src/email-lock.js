// Un correo ya enviado o recibido no se puede editar (evita malentendidos): solo los borradores. Se bloquea al abrirlo y al cargar su estado.
define('custom:email-lock', [], function () {
    function lock(view) {
        const st = view.model && view.model.get('status');
        if (!st || st === 'Draft') { return; }
        view.readOnly = true;
        if (view.setReadOnly) { try { view.setReadOnly(); } catch (e) { /* vista sin soporte: el CSS y el servidor lo impiden */ } }
        ['edit', 'inlineEdit'].forEach(a => { try { view.hideActionItem && view.hideActionItem(a); } catch (e) { /* noop */ } });
        view.$el && view.$el.addClass('ch-email-locked');
    }
    return {mount(view) { lock(view); view.listenTo(view.model, 'sync', () => lock(view)); }, lock};
});
