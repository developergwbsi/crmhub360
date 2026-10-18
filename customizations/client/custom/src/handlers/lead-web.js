/**
 * «Consultar web» en la ficha del lead (menú ⋯): elige una consulta web guardada, la ejecuta con los datos del lead y muestra lo que encontró y el análisis de la IA.
 * Endpoints: GET CrmHub/webSources y POST CrmHub/webSourceRun (deja además una nota en el historial).
 */
define('custom:handlers/lead-web', ['action-handler', 'custom:ui'], function (Dep, ChUi) {
    const esc = v => ChUi.esc(v == null ? '' : v);
    return class extends Dep {
        actionWebQuery() {
            const model = this.view.model;
            Espo.Ajax.getRequest('CrmHub/webSources').then(r => {
                const list = r.sources || [];
                if (!list.length) { ChUi.notice({title: 'Aún no hay consultas web', text: r.canManage ? 'Créalas en Organización → Consultas web.' : 'Tu gerente o supervisor puede configurarlas en el menú Consultas web.'}); return; }
                ChUi.panel({title: 'Consultar web', icon: 'fas fa-globe', close: 'Cerrar', mount: (body, close) => {
                    body.innerHTML = '<p class="ch-muted">Elige la consulta: se usa la información de este lead y el resultado queda en su historial.</p>' + list.map(s => `<div class="ch-fp-card" data-id="${esc(s.id)}"><span class="fas fa-globe"></span><div><b>${esc(s.name)}</b><small>${esc(s.description || s.url)}</small></div></div>`).join('') + '<div data-out></div>';
                    body.onclick = e => {
                        const c = e.target.closest('[data-id]'); if (!c) { return; }
                        const out = body.querySelector('[data-out]'); out.innerHTML = '<div class="ch-muted" style="padding:10px 0">Consultando la página…</div>';
                        Espo.Ajax.postRequest('CrmHub/webSourceRun', {leadId: model.id, sourceId: c.dataset.id}).then(x => {
                            const f = Object.entries(x.found || {});
                            out.innerHTML = `<div class="ch-wp-res"><h4>${esc(x.name)}</h4><div class="ch-muted">${esc(x.url)}</div>${f.length ? '<table class="table"><tbody>' + f.map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('') + '</tbody></table>' : '<div class="ch-muted">La página no trajo datos que coincidan con la consulta.</div>'}${x.analysis ? `<h5>Análisis para decidir</h5><div style="white-space:pre-wrap">${esc(x.analysis)}</div>` : ''}</div>`;
                            model.fetch();
                        }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } out.innerHTML = '<div class="ch-chat-err">' + esc((xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason')) || 'No se pudo consultar la página.') + '</div>'; });
                    };
                }});
            }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('No se pudieron cargar las consultas'); });
        }
    };
});
