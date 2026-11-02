/** Preferencias con encabezado de perfil de la persona que las edita. */
define('custom:views/preferences-edit', ['custom:views/user-hero', 'views/preferences/edit'], function (H, Dep) {
    return H.mix(Dep, function () { return this.getUser(); }, true);
});
