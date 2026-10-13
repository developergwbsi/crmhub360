/**
 * Reunión (Meeting): el campo «Videollamada» solo existe si el Centro de control habilitó el servicio a la empresa (Settings.crmhubMeet);
 * una vez creada la sala el campo queda fijo y se muestra el enlace del cliente. Se carga como dynamicHandler de Meeting (clientDefs).
 */
define('custom:handlers/meeting-video-dyn', ['dynamic-handler'], function (Dep) {
    return class extends Dep {
        init() {
            const rv = this.recordView, on = ['video', 'video_subs'].includes(rv.getConfig().get('crmhubMeet'));
            if (!on) { rv.hideField('videoCall'); rv.hideField('videoLink'); return; }
            if (this.model.get('videoCode')) { rv.setFieldReadOnly('videoCall'); } else { rv.hideField('videoLink'); }
        }
    };
});
