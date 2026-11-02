/** Ficha de usuario (editar) con encabezado de perfil. */
define('custom:views/user-edit', ['custom:views/user-hero', 'views/edit'], function (H, Dep) {
    return H.mix(Dep, function () { return this.model; });
});
