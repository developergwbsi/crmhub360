/**
 * Acerca de Crm Hub 360: qué es la plataforma, quién la hace (DigitalAlliance Hub, digitalalliancehub.site), la versión instalada y el aviso legal del software libre en que se basa
 * (EspoCRM, licencia GNU AGPL v3), que se conserva por exigirlo esa licencia.
 */
define('custom:views/about', ['view', 'custom:ui'], function (Dep, ChUi) {
    const esc = v => ChUi.esc(v == null ? '' : v);
    return class extends Dep {
        templateContent = '<div class="ch-about"></div>'
        info = null

        setup() {
            this.getHelper().pageTitle.setTitle('Acerca de Crm Hub 360');
            fetch('client/custom/version.json?t=' + Date.now(), {cache: 'no-store'}).then(r => (r.ok ? r.json() : null)).catch(() => null).then(j => { this.info = j || {}; this.draw(); });
        }
        afterRender() { this.draw(); }

        draw() {
            const root = this.el && this.el.querySelector('.ch-about'); if (!root || !this.info) { return; }
            const i = this.info, built = i.built ? new Date(i.built).toLocaleString('es-CO', {day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'}) : '';
            root.innerHTML = `<div class="page-header"><h3>Acerca de Crm Hub 360</h3></div>
                <div class="ch-ab-card">
                    <div class="ch-ab-logo" aria-hidden="true">C</div>
                    <div class="ch-ab-main">
                        <h2>Crm Hub 360</h2>
                        <p class="ch-ab-lead">Plataforma de gestión comercial: leads, pipeline, comunicaciones, videollamadas, formularios, reportes y más, en un solo lugar.</p>
                        <p class="ch-ab-ver">${i.release ? `<b>Versión ${esc(i.release)}</b>` : ''}${built ? `<span>${i.release ? ' · ' : ''}Actualizada el ${esc(built)}</span>` : ''}</p>
                    </div>
                </div>
                <div class="ch-ab-card ch-ab-col">
                    <h4>Desarrollada por DigitalAlliance Hub</h4>
                    <p>Crm Hub 360 es un producto de <b>DigitalAlliance Hub</b>. Si necesitas soporte, una capacitación o quieres conocer otras soluciones, visítanos.</p>
                    <p><a class="btn btn-primary" href="https://digitalalliancehub.site" target="_blank" rel="noopener"><span class="fas fa-up-right-from-square"></span> digitalalliancehub.site</a></p>
                </div>
                <div class="ch-ab-card ch-ab-col ch-ab-legal">
                    <h4>Aviso legal del software libre</h4>
                    <p>Crm Hub 360 se construye sobre <b>EspoCRM</b>, software libre publicado bajo la licencia <b>GNU Affero General Public License v3</b>. Copyright © 2014-2026 EspoCRM, Inc. — <a href="https://www.espocrm.com" target="_blank" rel="noopener">www.espocrm.com</a>.</p>
                    <p>Puedes redistribuirlo y modificarlo según los términos de esa licencia. El software se ofrece sin garantía alguna. Consulta el texto completo en <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener">gnu.org/licenses/agpl-3.0</a>.</p>
                </div>`;
        }
    };
});
