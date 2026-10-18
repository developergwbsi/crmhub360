/**
 * Pantallas de trabajo a altura completa: la página no se desplaza, solo lo hacen sus zonas internas (como en una aplicación).
 * attach(view, selector) ajusta la altura del elemento al resto de la ventana (la publica en --ch-fit-h) y bloquea el desplazamiento de la página mientras la vista exista;
 * detach(view) lo suelta. Se vuelve a ajustar al cambiar el tamaño de la ventana o del contenido.
 */
define('custom:studio', [], function () {
    const users = new Set();
    function fit(el) {
        const top = el.getBoundingClientRect().top;
        el.style.setProperty('--ch-fit-h', Math.max(360, Math.round(window.innerHeight - top - 14)) + 'px');
    }
    function attach(view, selector) {
        if (view._chFit) { view._chFit(); return; }
        const run = () => { const el = view.el && view.el.querySelector(selector); if (el) { fit(el); } };
        view._chFit = run;
        users.add(view);
        document.documentElement.classList.add('ch-noscroll');
        view._chFitResize = run;
        window.addEventListener('resize', run);
        if (window.ResizeObserver && view.el) { view._chFitRO = new ResizeObserver(run); view._chFitRO.observe(view.el); }
        run(); setTimeout(run, 250); setTimeout(run, 1000);
    }
    function detach(view) {
        if (!view._chFit) { return; }
        window.removeEventListener('resize', view._chFitResize);
        if (view._chFitRO) { view._chFitRO.disconnect(); }
        view._chFit = null; users.delete(view);
        if (!users.size) { document.documentElement.classList.remove('ch-noscroll'); }
    }
    return {attach, detach};
});
