/**
 * Detalle compacto del Lead (ventana/panel lateral): monta el encabezado visual (custom:lead-hero).
 * Sin endpoints.
 */
define('custom:views/lead/record/detail-small', ['views/record/detail-small', 'custom:lead-hero'], function (Dep, Hero) {
    return class extends Dep {
        afterRender() {
            super.afterRender();
            Hero.mount(this);
        }
    };
});
