/**
 * Detalle rápido (ventana) de un correo: aplica el bloqueo de edición de correos no borrador (custom:email-lock).
 * Sin endpoints; usa solo el estado del modelo.
 */
define('custom:views/email/record/detail-quick', ['views/email/record/detail-quick', 'custom:email-lock'], function (Dep, Lock) {
    return class extends Dep {
        setup() { super.setup(); Lock.mount(this); }
        afterRender() { super.afterRender(); Lock.lock(this); }
    };
});
