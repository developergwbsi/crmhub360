define('custom:handlers/lead-ai', ['action-handler'], function (Dep) {
    return class extends Dep {
        run(action) {
            Espo.Ui.notify(this.view.translate('Loading...', 'messages'));
            Espo.Ajax.postRequest(`Lead/${this.view.model.id}/ai/${action}`, {}, {timeout: 300000})
                .then(res => {
                    Espo.Ui.notify(false);
                    this.view.createView('aiResult', 'views/modal', {
                        headerText: 'Asistente IA',
                        templateContent: '<div style="white-space:pre-wrap">{{text}}</div>',
                        text: res.text,
                        buttonList: [{name: 'cancel', label: 'Cerrar'}],
                    }, v => v.render());
                })
                .catch(() => Espo.Ui.error('El asistente IA no está disponible'));
        }
        summarize() { this.run('summarize'); }
        draft() { this.run('draft'); }
        sentiment() { this.run('sentiment'); }
    };
});
