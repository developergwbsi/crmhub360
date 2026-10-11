/**
 * Detalle completo del Lead: monta el encabezado visual (custom:lead-hero) y oculta paneles que no aplican.
 * Oculta «targetLists» siempre y el panel «credit» si la configuración crmhubCartera (módulo Cartera y cobranza) está apagada.
 * Tarjeta lateral: si no hay asesor humano y lo atiende un comercial virtual, «Usuario asignado» lo dice; «Creado» muestra de dónde llegó el lead
 * (formulario, WhatsApp…) en vez del usuario técnico de la integración; y se marca la identificación temporal (celular o correo) hasta que se registre la real.
 * Sin endpoints.
 */
define('custom:views/lead/record/detail', ['views/record/detail', 'custom:lead-hero'], function (Dep, Hero) {
    return class extends Dep {
        afterRender() {
            super.afterRender();
            Hero.mount(this);
            if (this.model.entityType === 'Lead') { this.chDecorate(); }
            // Sin el módulo «Cartera y cobranza» no se muestra el reporte de crédito (deuda, mora, ingresos…)
            if (this.model.entityType === 'Lead') { try { this.hidePanel('targetLists', true); } catch (e) { /* sin esa relación */ } }   // las listas de objetivos (campañas masivas de Espo) no se usan aquí
            if (this.model.entityType === 'Lead' && !this.getConfig().get('crmhubCartera')) { try { this.hidePanel('credit', true); } catch (e) { /* panel inexistente */ } }
        }

        // Las celdas de la tarjeta lateral las vuelve a dibujar Espo al cambiar datos: se retocan de nuevo cuando cambia el lead, el comercial virtual o el DOM
        chDecorate() {
            if (!this._chDeco) {
                this._chDeco = true;
                const again = () => { clearTimeout(this._chT); this._chT = setTimeout(() => this.chPaintSide(), 250); };
                this.listenTo(this.model, 'sync change:identification change:identificationIsTemp change:assignedUserId ch:agent', again);
                this._chObs = new MutationObserver(again);
            }
            this.chPaintSide();
            const side = this.el && this.el.querySelector('.side'); if (side && this._chObs) { this._chObs.disconnect(); this._chObs.observe(side, {childList: true, subtree: true}); }
        }
        onRemove() { if (this._chObs) { this._chObs.disconnect(); } clearTimeout(this._chT); if (super.onRemove) { super.onRemove(); } }

        chPaintSide() {
            const root = this.el; if (!root) { return; }
            if (this._chObs) { this._chObs.disconnect(); }
            const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
            const m = this.model, a = m.attributes, api = n => /^hub[- ]?api$/i.test(String(n || ''));
            // 1) Usuario asignado: sin persona, lo atiende un comercial virtual
            const au = root.querySelector('.side .field[data-name="assignedUser"]');
            if (au && !a.assignedUserId && m._chAgent && au.querySelector('.none-value, .ch-va')) {
                au.innerHTML = `<span class="ch-va" title="Sin asesor humano: lo atiende un comercial virtual"><span class="fas fa-robot"></span> Comercial virtual · ${esc(m._chAgent.persona || '')}<small>${m._chAgent.state === 'paused' ? 'en pausa' : 'automático'}</small></span>`;
            }
            // 2) Creado / Modificado: el usuario técnico de la integración se reemplaza por el origen
            const origin = a.originDetail || a.source || '';
            const fix = (name, label) => {
                const f = root.querySelector(`.side .field[data-name="${name}"]`); if (!f) { return; }
                f.querySelectorAll('a, span').forEach(n => {
                    if (n.children.length || !api(n.textContent)) { return; }
                    const by = name === 'complexCreated' ? a.createdByName : a.modifiedByName;
                    if (!api(by)) { return; }
                    n.outerHTML = `<span class="ch-origin" title="Lo registró la integración automática (${esc(by)})">${esc(label)}</span>`;
                });
            };
            fix('complexCreated', origin ? origin : 'Sistema automático');
            fix('complexModified', m._chAgent ? 'Comercial virtual' : 'Sistema automático');
            // 3) Identificación temporal
            const idf = root.querySelector('.field[data-name="identification"]');
            if (idf && a.identificationIsTemp && !idf.querySelector('.ch-idtemp') && !idf.querySelector('input')) {
                const kind = /@/.test(a.identification || '') ? 'correo' : 'celular';
                idf.insertAdjacentHTML('beforeend', ` <span class="ch-idtemp" title="Se guardó el ${kind} como identificación mientras no haya documento. Edítala cuando abordes al cliente.">Temporal · ${kind}</span>`);
            }
            const side = root.querySelector('.side'); if (side && this._chObs) { this._chObs.observe(side, {childList: true, subtree: true}); }
            const main = root.querySelector('.middle'); if (main && this._chObs) { this._chObs.observe(main, {childList: true, subtree: true}); }
        }
    };
});
