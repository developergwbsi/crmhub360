/**
 * Buscadores web de la empresa (Integraciones → Buscadores): con qué busca el «buscador de prospectos».
 * Tres formas: el predeterminado del sistema (búsqueda web de Claude), uno prestado por el Centro de control, o uno propio con la clave de la empresa
 * (Serper, Brave o Google Programmable Search). Solo admin. Endpoints: GET CrmHub/searchConfig, POST CrmHub/searchConfigSave | searchConfigTest. Hub: /v1/search-config.
 * Peculiaridad: la clave nunca vuelve al navegador; un campo vacío conserva la guardada. Se dibuja con innerHTML en draw().
 */
define('custom:views/search-config', ['view', 'custom:ui'], function (Dep, ChUi) {
    const esc = v => ChUi.esc(v == null ? '' : v);
    const HOW = {
        claude: 'No necesitas otra cuenta: usa la clave de Anthropic de tu motor de IA. Se paga en tokens más un cargo por búsqueda de Anthropic. Hay que tener la búsqueda web habilitada en console.anthropic.com.',
        serper: 'Entra a <b>serper.dev</b>, regístrate y copia tu clave en el panel (API Key). Da resultados de Google; verifica en su página el cupo gratuito y los precios vigentes.',
        brave: 'Entra a <b>brave.com/search/api</b>, crea una cuenta y elige el plan de búsqueda web (hay uno gratuito limitado; puede pedir una tarjeta de verificación). Crea una clave en «API Keys».',
        google: 'En <b>programmablesearchengine.google.com</b> crea un buscador que busque en toda la web y copia su identificador (<b>cx</b>); en <b>console.cloud.google.com</b> activa «Custom Search API» y crea una clave. El cupo gratuito diario es pequeño; verifica que Google siga aceptando cuentas nuevas para esa API.'
    };
    const reason = xhr => { const r = xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason'); if (xhr) { xhr.errorIsHandled = true; } return r || 'No se pudo completar.'; };

    return class extends Dep {
        templateContent = '<div class="ch-sc"></div>'
        d = null
        afterRender() { this.load(); }
        load() {
            Espo.Ajax.getRequest('CrmHub/searchConfig').then(r => { this.d = r; this.draw(); })
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } const el = this.el.querySelector('.ch-sc'); if (el) { el.innerHTML = '<div class="ch-chat-err">No se pudo cargar la configuración del buscador.</div>'; } });
        }
        draw() {
            const el = this.el.querySelector('.ch-sc'); if (!el || !this.d) { return; }
            const d = this.d, a = d.active || {}, own = d.own || {};
            const state = d.mode === 'own' ? '<span class="label label-success">Propio</span>' : d.mode === 'loaned' ? '<span class="label label-info">Prestado por el sistema</span>' : '<span class="label label-default">Predeterminado del sistema</span>';
            let h = `<div class="panel panel-default"><div class="panel-heading"><h4 class="panel-title"><span class="fas fa-magnifying-glass"></span> Buscador web ${state}</h4></div><div class="panel-body">` +
                `<p class="text-muted">Con esto busca en internet el <b>buscador de prospectos</b> (Prospección → Buscador). Hoy usa: <b>${esc((d.engines || {})[a.engine] || a.engine)}</b>.</p>`;
            const pick = this.pick || (d.mode === 'own' ? 'own' : 'platform');
            const opt = (k, title, txt) => `<div class="radio"><label><input type="radio" name="scpick" data-pick="${k}" ${pick === k ? 'checked' : ''}> <b>${title}</b> — ${txt}</label></div>`;
            h += `<h5>¿Con qué buscador quieres trabajar?</h5>` + opt('platform', 'El de la plataforma <span class="label label-primary">Recomendado</span>', 'listo para usar, sin cuentas ni claves; el consumo se suma a tu factura.') + opt('own', 'El mío', 'Serper, Brave o Google con tu propia clave; el consumo lo cobra tu proveedor.');
            if (pick === 'own') {
                const eng = own.engine || 'serper';
                h += `<div class="form-group"><label>Buscador</label><select class="form-control" data-k="engine">${Object.entries(d.engines).map(([k, l]) => `<option value="${k}" ${eng === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>` +
                    `<div class="text-muted small" data-role="how" style="margin-bottom:10px"></div>` +
                    `<div data-role="keys"><div class="form-group"><label>Clave (API key)${own.hasKey ? ' <span class="text-muted">(guardada; déjala vacía para conservarla)</span>' : ''}</label><input class="form-control" type="password" autocomplete="new-password" data-k="api_key" placeholder="${own.hasKey ? '••••••••' : ''}"></div>` +
                    `<div class="form-group" data-role="cxg"><label>Identificador del buscador (cx) — solo Google</label><input class="form-control" data-k="cx" value="${esc(own.cx)}"></div></div>` +
                    `<p><button class="btn btn-primary" data-a="save"><span class="fas fa-floppy-disk"></span> Guardar y usar mi buscador</button> <button class="btn btn-default" data-a="test"><span class="fas fa-plug"></span> Probar (usa 1 búsqueda)</button> <span class="small" data-role="status"></span></p>`;
            } else {
                h += (d.mode === 'loaned' ? '<p>Hoy usas un buscador que te presta la plataforma.</p>' : '<p>Hoy usas la búsqueda web de la plataforma.</p>') +
                    '<p><button class="btn btn-default" data-a="test"><span class="fas fa-plug"></span> Probar (usa 1 búsqueda)</button> <span class="small" data-role="status"></span></p>';
            }
            h += `<h5>Recomendados</h5><ul class="small">${(d.recommended || []).map(r => `<li><b>${esc((d.engines || {})[r.engine] || r.engine)}</b> — ${esc(r.note)}</li>`).join('')}</ul></div></div>`;
            el.innerHTML = h;
            const q = k => el.querySelector(`[data-k="${k}"]`), status = t => { const s = el.querySelector('[data-role=status]'); if (s) { s.innerHTML = t; } };
            const sync = () => { if (!q('engine')) { return; } const e = q('engine').value; el.querySelector('[data-role=how]').innerHTML = HOW[e] || ''; el.querySelector('[data-role=keys]').style.display = e === 'claude' ? 'none' : ''; el.querySelector('[data-role=cxg]').style.display = e === 'google' ? '' : 'none'; };
            if (q('engine')) { q('engine').onchange = sync; sync(); }
            el.querySelectorAll('[data-pick]').forEach(r => { r.onchange = () => {
                const v = r.dataset.pick;
                if (v === 'own' && !d.hasOwn) { this.pick = 'own'; this.draw(); return; }
                Espo.Ajax.postRequest('CrmHub/searchConfigMode', {mode: v}).then(x => { this.d = x; this.pick = null; Espo.Ui.success(v === 'own' ? 'Ahora usas tu propio buscador' : 'Ahora usas el buscador de la plataforma'); this.draw(); }).catch(xhr => { Espo.Ui.error(reason(xhr)); this.pick = null; this.draw(); });
            }; });
            const sv = el.querySelector('[data-a=save]');
            if (sv) { sv.onclick = () => { status('Guardando…'); Espo.Ajax.postRequest('CrmHub/searchConfigSave', {engine: q('engine').value, api_key: q('api_key').value, cx: q('cx').value.trim()}).then(() => { Espo.Ui.success('Listo: ahora usas tu propio buscador'); this.pick = null; this.load(); }).catch(xhr => { status(''); Espo.Ui.error(reason(xhr)); }); }; }
            const ts = el.querySelector('[data-a=test]');
            if (ts) { ts.onclick = () => { status('Probando…'); Espo.Ajax.postRequest('CrmHub/searchConfigTest', {}).then(r => status(`<span class="text-success">✔ ${esc(r.detail || 'Conectado')}</span>`)).catch(xhr => status(`<span class="text-danger">✖ ${esc(reason(xhr))}</span>`)); }; }
        }
    };
});
