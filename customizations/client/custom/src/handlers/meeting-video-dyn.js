/**
 * Reunión (Meeting): el campo «Videollamada» solo existe si el Centro de control habilitó el servicio a la empresa (Settings.crmhubMeet);
 * «Enviar invitación al cliente por correo» solo se ofrece al crear la sala; una vez creada, el campo queda fijo y se muestra el enlace del cliente.
 * Se carga como dynamicHandler de Meeting (clientDefs).
 */
define('custom:handlers/meeting-video-dyn', ['dynamic-handler'], function (Dep) {
    return class extends Dep {
        init() {
            const rv = this.recordView, on = ['video', 'video_subs'].includes(rv.getConfig().get('crmhubMeet'));
            if (!on) { rv.hideField('videoCall'); rv.hideField('videoLink'); rv.hideField('videoInvite'); return; }
            if (this.model.get('videoCode')) { rv.setFieldReadOnly('videoCall'); rv.hideField('videoInvite'); } else { rv.hideField('videoLink'); this.sync(); }
        }

        onChange(model, o) { if (o && o.changes ? 'videoCall' in o.changes : true) { this.sync(); } }

        sync() {
            if (this.model.get('videoCode')) { return; }
            if (this.model.get('videoCall')) { this.recordView.showField('videoInvite'); } else { this.recordView.hideField('videoInvite'); }
        }
    };
});
