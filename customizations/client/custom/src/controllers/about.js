/**
 * Página «Acerca de» (#About) de Crm Hub 360: reemplaza la de EspoCRM por la de la plataforma y de DigitalAlliance Hub, conservando el aviso legal del software base.
 */
define('custom:controllers/about', ['controller'], function (Dep) {
    return class extends Dep {
        defaultAction = 'about'

        actionAbout() {
            this.main('custom:views/about', {}, view => view.render());
        }
    };
});
