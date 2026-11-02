/** Ficha de usuario (ver) con encabezado de perfil. */
define('custom:views/user-detail', ['custom:views/user-hero', 'views/user/detail'], function (H, Dep) {
    return H.mix(Dep, function () { return this.model; });
});
