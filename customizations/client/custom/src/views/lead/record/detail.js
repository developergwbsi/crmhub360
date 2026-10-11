/**
 * Detalle completo del Lead: monta el encabezado visual (custom:lead-hero) y oculta paneles que no aplican.
 * Oculta «targetLists» siempre y el panel «credit» si la configuración crmhubCartera (módulo Cartera y cobranza) está apagada.
 * Sin endpoints.
 */
define('custom:views/lead/record/detail', ['views/record/detail', 'custom:lead-hero'], function (Dep, Hero) {
    return class extends Dep {
        afterRender() {
            super.afterRender();
            Hero.mount(this);
            // Sin el módulo «Cartera y cobranza» no se muestra el reporte de crédito (deuda, mora, ingresos…)
            if (this.model.entityType === 'Lead') { try { this.hidePanel('targetLists', true); } catch (e) { /* sin esa relación */ } }   // las listas de objetivos (campañas masivas de Espo) no se usan aquí
            if (this.model.entityType === 'Lead' && !this.getConfig().get('crmhubCartera')) { try { this.hidePanel('credit', true); } catch (e) { /* panel inexistente */ } }
        }
    };
});
