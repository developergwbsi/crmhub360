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
            if (this.model.get('videoCode')) { rv.setFieldReadOnly('videoCall'); rv.hideField('videoInvite'); this.watchUpdate(); } else { rv.hideField('videoLink'); this.sync(); }
        }

        // Al editar una reunión con videollamada ya creada: si cambió la agenda (nombre, fecha, hora, estado), pregunta si se avisa al cliente
        watchUpdate() {
            const rv = this.recordView, m = this.model, keys = ['name', 'dateStart', 'dateEnd'], was = {};
            keys.forEach(k => { was[k] = m.get(k); });
            rv.listenTo(rv, 'after:save', () => {
                const moved = keys.some(k => was[k] !== m.get(k));
                keys.forEach(k => { was[k] = m.get(k); });
                if (!moved || m.get('status') !== 'Planned') { return; }
                Espo.loader.require(['custom:ui', 'custom:meet-notify'], (ChUi, N) => {
                    ChUi.confirm({title: 'Actualizaste la agenda', text: 'Cambiaste el nombre, la fecha o la hora de la reunión. ¿Quieres avisarle al cliente de la actualización?', ok: 'Sí, avisar', cancel: 'No avisar'})
                        .then(y => { if (y) { N.ask({meetingId: m.id, kind: 'update'}); } });
                });
            });
        }

        onChange(model, o) { if (o && o.changes ? 'videoCall' in o.changes : true) { this.sync(); } }

        sync() {
            if (this.model.get('videoCode')) { return; }
            if (this.model.get('videoCall')) { this.recordView.showField('videoInvite'); } else { this.recordView.hideField('videoInvite'); }
        }
    };
});
