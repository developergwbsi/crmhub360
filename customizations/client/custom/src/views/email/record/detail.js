/**
 * Detalle de un correo (Email): añade el encabezado visual (custom:lead-hero) y bloquea la edición de correos enviados o recibidos (custom:email-lock).
 * Se registra como vista de registro de Email en el metadato clientDefs.
 */
define('custom:views/email/record/detail', ['views/email/record/detail', 'custom:lead-hero', 'custom:email-lock'], function (Dep, Hero, Lock) {
    return class extends Dep {
        setup() { super.setup(); Lock.mount(this); }
        afterRender() {
            super.afterRender();
            Hero.mount(this);
            Lock.lock(this);
        }
    };
});
