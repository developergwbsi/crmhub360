// Listas y tableros de leads en vivo: cuando llega un lead nuevo (aviso por websocket o, como respaldo, una revisión cada 20 s) la lista se vuelve a cargar sola.
define('custom:live-list', [], function () {
    const dragging = () => !!document.querySelector('.ui-sortable-helper, .ui-draggable-dragging, .ch-dragging');

    function attach(view) {
        if (view._chLive || view.entityType !== 'Lead') { return; }
        const st = view._chLive = {last: null, timer: null, deb: null, ws: null, cb: null};
        const refresh = () => {
            if (!view.collection || view.isRemoved && view.isRemoved()) { return; }
            if (dragging() || document.hidden) { st.deb = setTimeout(refresh, 3000); return; }   // no se recarga mientras se arrastra una tarjeta o la pestaña está oculta
            view.collection.fetch();
        };
        const check = () => {
            if (document.hidden) { return; }
            Espo.Ajax.getRequest('Lead', {maxSize: 1, orderBy: 'createdAt', order: 'desc', select: 'id'}).then(r => {
                const id = r && r.list && r.list[0] && r.list[0].id;
                if (st.last !== null && id && id !== st.last) { clearTimeout(st.deb); st.deb = setTimeout(refresh, 600); }
                if (id) { st.last = id; }
            }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } });
        };
        try {
            const ws = view.getHelper().webSocketManager;
            if (ws) { st.ws = ws; st.cb = () => setTimeout(check, 400); ws.subscribe('newNotification', st.cb); }
        } catch (e) { /* sin websocket: queda la revisión periódica */ }
        st.timer = setInterval(check, 20000);
        check();
    }

    function detach(view) {
        const st = view._chLive; if (!st) { return; }
        clearInterval(st.timer); clearTimeout(st.deb);
        if (st.ws && st.cb) { try { st.ws.unsubscribe('newNotification', st.cb); } catch (e) { /* nada */ } }
        view._chLive = null;
    }

    return {attach, detach};
});
