/**
 * Listas estándar (Usuarios, Equipos, Campañas) con una franja de indicadores arriba, en el diseño de la plataforma.
 * Uso: K.mix(VistaBase, function kpis() { return Promise.resolve([{cls?, ic, label, val, sub?}, ...]); }) devuelve la vista de lista con la franja.
 * Cada lista concreta (custom:views/user-list, team-list, campaign-list) dice qué indicadores muestra. La franja se redibuja en cada render y no toca datos ni permisos.
 */
define('custom:views/kpi-list', [], function () {
    const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
    return {
        mix(Base, kpis) {
            return class extends Base {
                afterRender() {
                    super.afterRender();
                    kpis.call(this).then(list => {
                        const el = this.el; if (!el || !list.length) { return; }
                        el.querySelectorAll('.ch-kpis.ch-list-kp').forEach(x => x.remove());
                        const html = `<div class="ch-kpis ch-list-kp">${list.map(k => `<div class="ch-kpi ${k.cls || ''}"><span class="ic"><i class="fas ${k.ic}"></i></span><div><span>${esc(k.label)}</span><b>${esc(k.val)}</b>${k.sub ? `<small>${esc(k.sub)}</small>` : ''}</div></div>`).join('')}</div>`;
                        const anchor = el.querySelector('.search-container');
                        if (anchor) { anchor.insertAdjacentHTML('beforebegin', html); }
                    }).catch(() => {});
                }
            };
        },
    };
});
