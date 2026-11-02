/**
 * Productos que ofrece la empresa (Comercial virtual → Productos): el catálogo que los agentes tienen SIEMPRE presente al ofrecer.
 * Cada producto dice qué es, para quién, qué beneficios da y a quién NO ofrecérselo; se enlaza a su material (Propuestas y brochures) y deja el rastro
 * de qué producto se ofreció o compró cada cliente. Sin precios: los da una persona. Solo admin.
 * Endpoints: GET CrmHub/products, POST productSave | productDelete | productsSeed. Hub: /v1/products.
 * Peculiaridad: vista incrustada en views/agent.js; sin productos propios ofrece «Cargar los productos de DigitalAlliance Hub».
 */
define('custom:views/products-lib', ['view', 'custom:ui'], function (Dep, ChUi) {
    const esc = v => ChUi.esc(v == null ? '' : v);
    const reason = xhr => { const r = xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason'); if (xhr) { xhr.errorIsHandled = true; } return r || 'No se pudo completar.'; };
    return class extends Dep {
        templateContent = '<div class="ch-pd"></div>'
        d = null
        afterRender() { this.load(); }
        load() {
            Espo.Ajax.getRequest('CrmHub/products').then(r => { this.d = r; this.draw(); })
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } const el = this.el.querySelector('.ch-pd'); if (el) { el.innerHTML = '<div class="ch-chat-err">No se pudo cargar el catálogo.</div>'; } });
        }
        draw() {
            const el = this.el.querySelector('.ch-pd'); if (!el || !this.d) { return; }
            const items = this.d.items || [];
            const st = x => { const s = x.stats || {}; const t = [['offered', 'ofrecido a'], ['interested', 'interesados'], ['won', 'compraron'], ['lost', 'no compraron']].filter(([k]) => s[k]).map(([k, l]) => `${s[k]} ${l}`); return t.length ? t.join(' · ') : '—'; };
            const rows = items.map(i => `<tr data-s="${esc(i.slug)}"><td><b>${esc(i.name)}</b>${i.main ? ' <span class="ch-pr-tag">Principal</span>' : ''}<small class="ch-muted" style="display:block">${esc(i.summary)}</small>${i.for_whom ? `<small class="ch-muted" style="display:block">Para: ${esc(i.for_whom)}</small>` : ''}</td>` +
                `<td>${i.materials} ${i.materials === 1 ? 'material' : 'materiales'}</td><td>${esc(st(i))}</td>` +
                `<td><label class="ch-pr-chk" style="margin:0"><input type="checkbox" data-a="act" ${i.active ? 'checked' : ''}> ${i.active ? 'Lo ofrecen los agentes' : 'Apagado'}</label></td>` +
                `<td style="white-space:nowrap"><button class="btn btn-default btn-sm" data-a="edit">Editar</button> <button class="btn btn-link btn-sm text-danger" data-a="del">Quitar</button></td></tr>`).join('');
            el.innerHTML = `<div class="ch-pr-card"><h5><span class="fas fa-box-open"></span> Productos que ofrece tu empresa</h5>` +
                `<p class="ch-muted">Es la lista de lo que vendes. Tus agentes la tienen <b>siempre presente</b>: solo ofrecen estos productos, eligen el que mejor encaja con cada prospecto y no inventan otros. Las <b>propuestas y brochures</b> son el material de cada producto (cómo se presenta); aquí defines <b>qué se ofrece</b>. Además queda el rastro de qué producto se ofreció o compró cada cliente. No pongas precios: los da una persona.</p>` +
                `<p><button class="btn btn-primary" data-a="add"><span class="fas fa-plus"></span> Agregar producto</button> ${items.length ? '' : '<button class="btn btn-default" data-a="seed">Cargar los productos de DigitalAlliance Hub</button>'}</p>` +
                (items.length ? `<div class="ch-pr-tbl"><table><thead><tr><th>Producto</th><th>Material</th><th>Clientes</th><th>Estado</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
                    : '<p class="ch-muted">Aún no hay productos. Agrega el primero: bastan su nombre y una o dos frases que expliquen qué es. Mientras tanto, los agentes usan lo que escribiste en «Entrenamiento → Servicios».</p>') + '</div>';
            const fail = xhr => Espo.Ui.error(reason(xhr)), done = m => () => { Espo.Ui.success(m); this.load(); };
            const bySlug = e => items.find(i => i.slug === e.target.closest('tr').dataset.s);
            el.onclick = e => {
                const b = e.target.closest('[data-a]'); if (!b) { return; } const a = b.dataset.a;
                if (a === 'add') { this.form(null); }
                else if (a === 'seed') { Espo.Ajax.postRequest('CrmHub/productsSeed', {}).then(done('Productos cargados')).catch(fail); }
                else if (a === 'edit') { this.form(bySlug(e)); }
                else if (a === 'del') { const i = bySlug(e); ChUi.confirm({title: 'Quitar producto', danger: true, ok: 'Quitar', text: `«${i.name}» deja de ser ofrecido por los agentes. El historial de clientes que lo recibieron se conserva.`}).then(y => { if (y) { Espo.Ajax.postRequest('CrmHub/productDelete', {slug: i.slug}).then(done('Quitado')).catch(fail); } }); }
            };
            el.onchange = e => { if (e.target.dataset.a === 'act') { const i = bySlug(e); Espo.Ajax.postRequest('CrmHub/productSave', {...i, active: e.target.checked}).then(done(e.target.checked ? 'Encendido' : 'Apagado')).catch(fail); } };
        }
        form(i) {
            ChUi.panel({title: i ? 'Editar producto' : 'Agregar producto', icon: 'fas fa-box-open', ok: 'Cerrar', mount: (body, close) => {
                const f = (k, l, rows, max, ph) => `<label>${l}</label><textarea class="form-control" rows="${rows}" data-f="${k}" maxlength="${max}" placeholder="${esc(ph || '')}">${esc(i ? i[k] : '')}</textarea>`;
                body.innerHTML = `<label>Nombre</label><input class="form-control" data-f="name" value="${esc(i ? i.name : '')}" maxlength="80">` +
                    f('summary', 'Qué es (una o dos frases: el agente lo usa para ofrecerlo)', 3, 600) +
                    f('for_whom', 'Para quién es', 2, 400, 'Ej.: clínicas y consultorios con varias sedes') +
                    f('benefits', 'Qué beneficios da', 2, 500) +
                    f('avoid', 'A quién NO ofrecérselo', 2, 300, 'Ej.: personas naturales, entidades públicas') +
                    `<label class="ch-pr-chk"><input type="checkbox" data-f="main" ${i && i.main ? 'checked' : ''}> Es el producto principal (el que más se impulsa)</label>` +
                    '<p style="margin-top:12px"><button class="btn btn-primary" data-f="save">Guardar</button></p><div class="ch-dlg-err" data-f="err" hidden></div>';
                const q = k => { const x = body.querySelector(`[data-f="${k}"]`); return x.type === 'checkbox' ? x.checked : x.value.trim(); };
                body.querySelector('[data-f=save]').onclick = () => {
                    Espo.Ajax.postRequest('CrmHub/productSave', {slug: i ? i.slug : '', name: q('name'), summary: q('summary'), for_whom: q('for_whom'), benefits: q('benefits'), avoid: q('avoid'), main: q('main'), active: i ? i.active : true})
                        .then(() => { Espo.Ui.success('Guardado'); close(true); this.load(); })
                        .catch(xhr => { const e = body.querySelector('[data-f=err]'); e.hidden = false; e.textContent = reason(xhr); });
                };
            }});
        }
    };
});
