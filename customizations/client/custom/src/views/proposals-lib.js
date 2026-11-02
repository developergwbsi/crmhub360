/**
 * Propuestas y brochures (Comercial virtual → Propuestas y brochures): el material que los agentes envían a los prospectos (como enlace).
 * Incluye las presentaciones estándar con ilustraciones (sin precios ni promesas) y el material propio de la empresa (enlaces a PDF, páginas o videos).
 * Cada pieza se puede ver, copiar, editar, apagar (el agente deja de enviarla) o quitar. Solo admin.
 * Endpoints: GET CrmHub/proposals, POST proposalSave | proposalActive | proposalDelete | proposalsSeed.
 * Peculiaridad: vista incrustada en views/agent.js; las presentaciones estándar solo permiten editar nombre y resumen, y se restauran con «Restaurar estándar».
 */
define('custom:views/proposals-lib', ['view', 'custom:ui'], function (Dep, ChUi) {
    const esc = v => ChUi.esc(v == null ? '' : v);
    const reason = xhr => { const r = xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason'); if (xhr) { xhr.errorIsHandled = true; } return r || 'No se pudo completar.'; };
    let PROD = {crm_hub_360: 'Crm Hub 360', gestor360: 'Gestor360', core360: 'Core360', '': 'General'};   // se reemplaza por los productos del catálogo de la empresa
    return class extends Dep {
        templateContent = '<div class="ch-pl"></div>'
        d = null
        afterRender() { this.load(); }
        load() {
            Espo.Ajax.getRequest('CrmHub/products').then(p => { if ((p.items || []).length) { PROD = {'': 'General'}; p.items.forEach(x => { PROD[x.slug] = x.name; }); } }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } })
                .then(() => Espo.Ajax.getRequest('CrmHub/proposals')).then(r => { this.d = r; this.draw(); })
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } const el = this.el.querySelector('.ch-pl'); if (el) { el.innerHTML = '<div class="ch-chat-err">No se pudo cargar la biblioteca.</div>'; } });
        }
        draw() {
            const el = this.el.querySelector('.ch-pl'); if (!el || !this.d) { return; }
            const items = this.d.items || [];
            const rows = items.map(i => `<tr data-s="${esc(i.slug)}"><td><b>${esc(i.title)}</b><small class="ch-muted" style="display:block">${esc(i.summary)}</small></td><td>${esc(PROD[i.product] || i.product || 'General')}</td><td>${i.own ? 'Enlace propio' : 'Presentación estándar'}${i.pdf_url ? '<small class="ch-muted" style="display:block">Con PDF adjunto en los correos</small>' : ''}</td>` +
                `<td>${i.views}</td><td><label class="ch-pr-chk" style="margin:0"><input type="checkbox" data-a="act" ${i.active ? 'checked' : ''}> ${i.active ? 'La usan los agentes' : 'Apagada'}</label></td>` +
                `<td style="white-space:nowrap"><a class="btn btn-default btn-sm" href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">Ver</a> ${i.pdf_url ? `<a class="btn btn-default btn-sm" href="${esc(i.pdf_url)}" target="_blank" rel="noopener noreferrer">PDF</a> ` : ''}<button class="btn btn-default btn-sm" data-a="copy">Copiar enlace</button> <button class="btn btn-default btn-sm" data-a="edit">Editar</button> ${i.own ? '<button class="btn btn-link btn-sm text-danger" data-a="del">Quitar</button>' : ''}</td></tr>`).join('');
            el.innerHTML = `<div class="ch-pr-card"><h5><span class="fas fa-file-powerpoint"></span> Propuestas y brochures que envían los agentes</h5>` +
                `<p class="ch-muted">Es el material que Valeria comparte con los prospectos —el correo lleva el enlace y también el PDF adjunto—: en el primer correo siempre va el de <b>Crm Hub 360</b>; si piden información o una propuesta, el que corresponda. Sin precios ni promesas de resultado. Las <b>visitas</b> muestran a quién le interesó.</p>` +
                `<p><button class="btn btn-primary" data-a="add"><span class="fas fa-plus"></span> Agregar material propio (enlace)</button> <button class="btn btn-default" data-a="seed">Restaurar presentaciones estándar</button></p>` +
                (items.length ? `<div class="ch-pr-tbl"><table><thead><tr><th>Material</th><th>Producto (del catálogo)</th><th>Tipo</th><th>Visitas</th><th>Estado</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
                    : '<p class="ch-muted">Aún no hay material. Pulsa «Restaurar presentaciones estándar» para crear las de Crm Hub 360, Gestor360 y Core360.</p>') + '</div>';
            const fail = xhr => Espo.Ui.error(reason(xhr)), done = m => () => { Espo.Ui.success(m); this.load(); };
            const bySlug = e => items.find(i => i.slug === e.target.closest('tr').dataset.s);
            el.onclick = e => {
                const b = e.target.closest('[data-a]'); if (!b) { return; } const a = b.dataset.a;
                if (a === 'add') { this.form(null); }
                else if (a === 'seed') { ChUi.confirm({title: 'Restaurar estándar', ok: 'Restaurar', text: 'Se crean (o se vuelven a dejar como vienen) las presentaciones de Crm Hub 360, Gestor360 y Core360. Si editaste el texto de alguna, se reemplaza.'}).then(y => { if (y) { Espo.Ajax.postRequest('CrmHub/proposalsSeed', {}).then(done('Presentaciones restauradas')).catch(fail); } }); }
                else if (a === 'copy') { const i = bySlug(e); (navigator.clipboard ? navigator.clipboard.writeText(i.url) : Promise.reject()).then(() => Espo.Ui.success('Enlace copiado')).catch(() => Espo.Ui.warning(i.url)); }
                else if (a === 'edit') { this.form(bySlug(e)); }
                else if (a === 'del') { const i = bySlug(e); ChUi.confirm({title: 'Quitar material', danger: true, ok: 'Quitar', text: `«${i.title}» deja de estar disponible para los agentes.`}).then(y => { if (y) { Espo.Ajax.postRequest('CrmHub/proposalDelete', {slug: i.slug}).then(done('Quitado')).catch(fail); } }); }
            };
            el.onchange = e => { if (e.target.dataset.a === 'act') { const i = bySlug(e); Espo.Ajax.postRequest('CrmHub/proposalActive', {slug: i.slug, active: e.target.checked}).then(done(e.target.checked ? 'Activada' : 'Apagada')).catch(fail); } };
        }
        form(i) {
            const own = !i || i.own;
            ChUi.panel({title: i ? 'Editar material' : 'Agregar material propio', icon: 'fas fa-file-powerpoint', ok: 'Cerrar', mount: (body, close) => {
                body.innerHTML = `<label>Nombre</label><input class="form-control" data-f="title" value="${esc(i ? i.title : '')}" maxlength="120">` +
                    `<label>Producto</label><select class="form-control" data-f="product">${Object.entries(PROD).map(([k, l]) => `<option value="${k}" ${i && i.product === k ? 'selected' : ''}>${l}</option>`).join('')}</select>` +
                    `<label>Para qué sirve (el agente lo usa para decidir cuándo enviarlo)</label><textarea class="form-control" rows="2" data-f="summary" maxlength="300">${esc(i ? i.summary : '')}</textarea>` +
                    (own ? `<label>Enlace (https://…): PDF, página o video públicos</label><input class="form-control" data-f="link" value="${esc(i ? i.ext_url : '')}" placeholder="https://…">` : '<p class="ch-muted">Es una presentación estándar: puedes ajustar su nombre y resumen. Para cambiar su diseño, escríbeme.</p>') +
                    '<p style="margin-top:12px"><button class="btn btn-primary" data-f="save">Guardar</button></p><div class="ch-dlg-err" data-f="err" hidden></div>';
                const q = k => { const x = body.querySelector(`[data-f="${k}"]`); return x ? x.value.trim() : ''; };
                body.querySelector('[data-f=save]').onclick = () => {
                    Espo.Ajax.postRequest('CrmHub/proposalSave', {slug: i ? i.slug : '', title: q('title'), product: q('product'), kind: i ? i.kind : 'enlace', summary: q('summary'), link: q('link')})
                        .then(() => { Espo.Ui.success('Guardado'); close(true); this.load(); })
                        .catch(xhr => { const e = body.querySelector('[data-f=err]'); e.hidden = false; e.textContent = reason(xhr); });
                };
            }});
        }
    };
});
