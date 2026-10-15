/**
 * Botón «Entrar a la videollamada» de una reunión que tiene sala propia. Endpoints: POST CrmHub/meet/host (devuelve el enlace de anfitrión) y, vía custom:meet-notify, la invitación por canal.
 */
define('custom:handlers/meeting-video', ['action-handler', 'custom:call-dock'], function (Dep, Dock) {
    return class extends Dep {
        hasVideo() { return !!this.view.model.get('videoCode') && ['video', 'video_subs'].includes(this.view.getConfig().get('crmhubMeet')); }

        // reenvía (o envía por primera vez) la invitación: se elige el canal (correo, WhatsApp, SMS, Telegram), cada uno con su plantilla
        actionInvite() {
            Espo.loader.require('custom:meet-notify', N => N.ask({meetingId: this.view.model.id, kind: 'invite'}));
        }

        actionJoin() {
            Espo.Ajax.postRequest('CrmHub/meet/host', {meetingId: this.view.model.id}).then(r => { const m = this.view.model; Dock.open(r.hostUrl, m.get('name') || 'Videollamada', m.get('parentId') ? {s: m.get('parentType'), l: m.get('parentId')} : null, m.get('parentName')); })
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('La sala de esta videollamada ya terminó.'); });
        }
    };
});
