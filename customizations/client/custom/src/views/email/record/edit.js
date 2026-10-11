/**
 * Edición de un correo: si el correo ya no es borrador (status distinto de Draft) avisa y redirige a su vista de detalle.
 * Solo los borradores se pueden editar. Sin endpoints.
 */
define('custom:views/email/record/edit', ['views/email/record/edit'], function (Dep) {
    return class extends Dep {
        setup() {
            super.setup();
            const st = this.model && this.model.get('status');
            if (st && st !== 'Draft' && this.model.id) {
                Espo.Ui.warning('Un correo enviado o recibido no se puede editar. Usa «Responder» para escribir otro.');
                setTimeout(() => this.getRouter().navigate('#Email/view/' + this.model.id, {trigger: true}), 0);
            }
        }
    };
});
