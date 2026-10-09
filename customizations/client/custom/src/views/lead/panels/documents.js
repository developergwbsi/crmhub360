// Panel «Lectura de documentos»: sube un PDF en cualquier estado, sigue las lecturas en curso y reabre las que están listas para revisar.
define('custom:views/lead/panels/documents', ['views/record/panels/bottom', 'custom:ui', 'custom:doc-reader'], function (Dep, ChUi, Reader) {
    return class extends Dep {
        templateContent = '<div class="ch-docs"><button class="btn btn-default btn-sm" data-act="read"><span class="fas fa-file-pdf"></span> Subir PDF y leer</button><div class="ch-docs-l" data-role="l"></div></div>'

        afterRender() {
            super.afterRender();
            this.el.onclick = e => {
                if (e.target.closest('[data-act="read"]')) { Reader.open(this.model, () => this.load()); return; }
                const o = e.target.closest('[data-open]'); if (o) { Reader.open(this.model, () => this.load(), {runId: +o.dataset.open}); }
            };
            if (!this._chW) { this._chW = true; this._h = () => { this.load(); this.checkReview(); }; window.addEventListener('ch-doc-watch', this._h); window.addEventListener('ch-doc-review', this._h); }
            this.load();
            this.checkReview();
        }

        onRemove() { clearTimeout(this._t); if (this._h) { window.removeEventListener('ch-doc-watch', this._h); window.removeEventListener('ch-doc-review', this._h); } }

        // viene del indicador global («Revisar»): abre directamente los datos leídos
        checkReview() {
            let f = null; try { f = JSON.parse(sessionStorage.getItem('chDocReview') || 'null'); sessionStorage.removeItem('chDocReview'); } catch (e) { f = null; }
            if (f && f.leadId === this.model.id) { Reader.open(this.model, () => this.load(), {runId: f.runId}); }
        }

        load() {
            clearTimeout(this._t);
            Espo.Ajax.getRequest('CrmHub/docHistory', {leadId: this.model.id}).then(r => {
                const l = this.el.querySelector('[data-role="l"]'); if (!l) { return; }
                const rows = r.items || [];
                l.innerHTML = rows.map(i => {
                    const st = i.status === 'applied' ? ['fa-circle-check', '#2fa36b', 'Guardado'] : i.status === 'reading' ? ['fa-spinner fa-spin', '#4f63e8', 'Leyendo…'] : i.status === 'failed' ? ['fa-circle-xmark', '#d64545', 'No se pudo leer'] : i.status === 'read' ? ['fa-circle-half-stroke', '#f59e0b', 'Lista para revisar'] : null;
                    if (!st) { return ''; }
                    return `<div class="ch-docs-i"><span class="fas ${st[0]}" style="color:${st[1]}"></span><div style="flex:1"><b>${ChUi.esc(i.profile_name)}</b><small>${st[2]} · ${ChUi.esc(ChUi.fmt.dt(i.created_at))}</small></div>${i.status === 'read' ? `<button class="btn btn-default btn-xs" data-open="${i.id}">Revisar</button>` : ''}</div>`;
                }).join('') || '<div class="ch-muted" style="margin-top:8px">Aún no se ha leído ningún documento.</div>';
                if (rows.some(i => i.status === 'reading')) { this._t = setTimeout(() => this.load(), 4000); }
            }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } });
        }
    };
});
