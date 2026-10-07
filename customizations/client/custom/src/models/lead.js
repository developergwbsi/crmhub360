// Pide el comentario antes de guardar un cambio de estado (arrastrar en el tablero, editar o edición rápida).
define('custom:models/lead', ['model', 'custom:ui'], function (Dep, ChUi) {
    return class extends Dep {
        constructor(attributes, options) {
            super(attributes, options);
            // estado «de origen»: el que tenía el lead al cargarse o al guardarse por última vez (el formulario ya cambia el atributo antes de guardar)
            this._chFrom = this.attributes ? this.attributes.status : undefined;
            this.on('sync', () => { this._chFrom = this.attributes.status; });
        }

        save(attrs, options) {
            const to = attrs && attrs.status;
            const from = this._chFrom !== undefined ? this._chFrom : this.get('status');
            if (this.isNew() || !to || to === from || attrs.statusComment || (options && options.chSkipGuard)) {
                return super.save(attrs, options);
            }
            const cancelled = () => { Espo.Ui.notify(false); return {status: 0, errorIsHandled: true, responseText: '', getResponseHeader: () => null, chCancelled: true}; };
            return Espo.Ajax.getRequest('CrmHub/statusGuard', {leadId: this.id})
                .catch(() => ({requiresComment: true}))
                .then(g => ChUi.statusChange({from, to, action: g.action || null}))
                .then(res => (res ? super.save({...attrs, statusComment: res.comment}, options) : Promise.reject(cancelled())));
        }
    };
});
