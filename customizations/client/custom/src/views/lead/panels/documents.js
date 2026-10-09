// Panel «Lectura de documentos»: sube un PDF en cualquier estado y ve las lecturas anteriores.
define('custom:views/lead/panels/documents', ['views/record/panels/bottom', 'custom:ui', 'custom:doc-reader'], function (Dep, ChUi, Reader) {
    return class extends Dep {
        templateContent = '<div class="ch-docs"><button class="btn btn-default btn-sm" data-act="read"><span class="fas fa-file-pdf"></span> Subir PDF y leer</button><div class="ch-docs-l" data-role="l"></div></div>'

        afterRender() {
            super.afterRender();
            this.el.querySelector('[data-act="read"]').onclick = () => Reader.open(this.model, () => this.load());
            this.load();
        }

        load() {
            Espo.Ajax.getRequest('CrmHub/docHistory', {leadId: this.model.id}).then(r => {
                const l = this.el.querySelector('[data-role="l"]'); if (!l) { return; }
                l.innerHTML = (r.items || []).map(i => `<div class="ch-docs-i"><span class="fas ${i.status === 'applied' ? 'fa-circle-check' : 'fa-circle-half-stroke'}" style="color:${i.status === 'applied' ? '#2fa36b' : '#94a3b8'}"></span><div><b>${ChUi.esc(i.profile_name)}</b><small>${ChUi.esc(i.status === 'applied' ? 'Guardado' : 'Leído, sin guardar')} · ${ChUi.esc(ChUi.fmt.dt(i.created_at))}</small></div></div>`).join('') || '<div class="ch-muted" style="margin-top:8px">Aún no se ha leído ningún documento.</div>';
            }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } });
        }
    };
});
