// Paneles del lead en vivo: se recargan cuando se envía/recibe algo (aviso interno entre ventanas y paneles), al volver a la pestaña y cada pocos segundos mientras se ven.
define('custom:live-panel', [], function () {
    const EVT = 'crmhub:lead-activity';
    return {
        // Avisa que hubo actividad en un lead (mensaje enviado, correo, llamada…): los paneles abiertos se actualizan
        notify(leadId) { try { document.dispatchEvent(new CustomEvent(EVT, {detail: {leadId}})); } catch (e) { /* nada */ } },

        attach(view, load, ms) {
            if (view._chLivePanel) { return; }
            view._chLivePanel = true;
            const alive = () => view.el && view.el.isConnected;
            const on = e => { const id = e.detail && e.detail.leadId; if ((!id || id === (view.model && view.model.id)) && alive()) { setTimeout(() => alive() && load(), 500); } };
            const vis = () => { if (!document.hidden && alive()) { load(); } };
            const timer = setInterval(() => { if (!document.hidden && alive()) { load(); } }, ms || 10000);
            document.addEventListener(EVT, on);
            document.addEventListener('visibilitychange', vis);
            view.once('remove', () => { clearInterval(timer); document.removeEventListener(EVT, on); document.removeEventListener('visibilitychange', vis); view._chLivePanel = false; });
        },
    };
});
