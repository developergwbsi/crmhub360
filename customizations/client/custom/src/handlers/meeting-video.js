/**
 * Botón «Entrar a la videollamada» de una reunión que tiene sala propia. Endpoint: POST CrmHub/meet/host (devuelve el enlace de anfitrión).
 */
define('custom:handlers/meeting-video', ['action-handler', 'custom:call-dock'], function (Dep, Dock) {
    return class extends Dep {
        hasVideo() { return !!this.view.model.get('videoCode') && ['video', 'video_subs'].includes(this.view.getConfig().get('crmhubMeet')); }

        // reenvía (o envía por primera vez) la invitación por correo con «Agregar al calendario»
        actionInvite() {
            Espo.Ui.notify('Enviando la invitación…');
            Espo.Ajax.postRequest('CrmHub/meet/invite', {meetingId: this.view.model.id}).then(() => { Espo.Ui.notify(false); Espo.Ui.success('Invitación enviada al cliente por correo'); this.view.model.fetch(); })
                .catch(xhr => { Espo.Ui.notify(false); const why = xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason'); Espo.Ui.error(why || 'No se pudo enviar la invitación'); if (xhr) { xhr.errorIsHandled = true; } });
        }

        actionJoin() {
            Espo.Ajax.postRequest('CrmHub/meet/host', {meetingId: this.view.model.id}).then(r => Dock.open(r.hostUrl, this.view.model.get('name') || 'Videollamada'))
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('La sala de esta videollamada ya terminó.'); });
        }
    };
});
