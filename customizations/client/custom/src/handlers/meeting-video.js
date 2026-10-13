/**
 * Botón «Entrar a la videollamada» de una reunión que tiene sala propia. Endpoint: POST CrmHub/meet/host (devuelve el enlace de anfitrión).
 */
define('custom:handlers/meeting-video', ['action-handler'], function (Dep) {
    return class extends Dep {
        hasVideo() { return !!this.view.model.get('videoCode') && ['video', 'video_subs'].includes(this.view.getConfig().get('crmhubMeet')); }

        actionJoin() {
            Espo.Ajax.postRequest('CrmHub/meet/host', {meetingId: this.view.model.id}).then(r => window.open(r.hostUrl, '_blank', 'noopener'))
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('La sala de esta videollamada ya terminó.'); });
        }
    };
});
