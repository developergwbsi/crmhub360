/**
 * Motor de IA de la empresa (Integraciones → Motor de IA y buscador): con qué IA trabajan el comercial virtual, la lectura de documentos y el asistente.
 * Muestra el motor que usa hoy la empresa, su consumo del mes y, si el proveedor lo habilita, el formulario del motor propio (proveedor, modelo, clave).
 * Endpoints: GET CrmHub/aiConfig, POST CrmHub/aiOwnSave | aiTest. La clave nunca vuelve al navegador. Antes vivía en Comercial virtual → Motor de IA.
 */
define('custom:views/ai-config', ['view', 'custom:ui', 'custom:tpl'], function (Dep, ChUi, Tpl) {
    const esc = v => ChUi.esc(v == null ? '' : v);

    return class extends Dep {
        templateContent = '<div class="ch-ac"></div>'
        ai = null
        afterRender() {
            Espo.Ajax.getRequest('CrmHub/aiConfig').then(r => { this.ai = r; this.draw(); })
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } const el = this.el.querySelector('.ch-ac'); if (el) { el.innerHTML = '<div class="ch-chat-err">No se pudo cargar la configuración del motor de IA.</div>'; } });
            this.el.onclick = e => { const b = e.target.closest('[data-act]'); if (!b) { return; } if (b.dataset.act === 'aitest') { this.aiTest(); } else if (b.dataset.act === 'aisave') { this.aiSave(); } else if (b.dataset.act === 'aipick') { this.aiPick(b.value); } };
        }
        draw() { const el = this.el.querySelector('.ch-ac'); if (el) { el.innerHTML = this.aiHtml(); } }

                aiHtml() {
            const a = this.ai; if (!a) { return '<div class="ch-muted" style="padding:20px">Cargando…</div>'; }
            const e = a.effective, src = {local: 'IA local del sistema', own: 'Motor propio de tu empresa'}[e.source] || 'Con créditos de DigitalAlliance Hub';
            const usage = (a.usage || []).map(u => `<div>${esc(u.engine)} · <b>${u.calls}</b> consultas · ${(u.tokens_in / 1000).toFixed(1)}k tokens de entrada / ${(u.tokens_out / 1000).toFixed(1)}k de salida</div>`).join('') || ChUi.empty({kind: 'chart', title: 'Sin consultas este mes', text: 'Aquí verás el consumo de IA.', compact: true});
            const pick = this.pick || (a.mode === 'own' ? 'own' : 'platform'), o = a.own;
            const form = pick !== 'own' ? '' : `<div class="ch-ag-row2"><div><label>Proveedor</label><select data-ai="kind">${Object.keys(a.kinds).map(k => `<option value="${k}" ${o.kind === k ? 'selected' : ''}>${esc(a.kinds[k])}</option>`).join('')}</select></div><div><label>Modelo</label><input data-ai="model" value="${esc(o.model)}" placeholder="claude-haiku-5-5 · gpt-4o-mini"></div></div>
                    <label>Dirección de la API (opcional)</label><input data-ai="base_url" value="${esc(o.base_url)}" placeholder="Vacío = la dirección oficial del proveedor">
                    <label>ID del workspace (solo Anthropic, y solo si al probar te lo pide)</label><input data-ai="workspace_id" value="${esc(o.workspace_id || '')}" placeholder="wrkspc_… (opcional)">
                    <label>Clave de la API ${o.secretSet ? `<span class="ch-muted">(guardada ${esc(o.secretHint)}; vacía = conservar)</span>` : ''}</label><input data-ai="api_key" type="password" autocomplete="new-password">
                    <div class="ch-chat-err" data-role="err" hidden></div><div class="ch-ag-aiout" data-role="aiout"></div>
                    <div class="ch-mail-actions"><button class="btn btn-primary btn-sm" data-act="aisave"><span class="fas fa-floppy-disk"></span> Guardar y usar mi motor</button><button class="btn btn-default btn-sm" data-act="aitest"><span class="fas fa-vial"></span> Probar</button></div>`;
            const opt = (k, title, txt) => `<div class="radio"><label><input type="radio" name="aipick" data-act="aipick" value="${k}" ${pick === k ? 'checked' : ''}> <b>${title}</b> — ${txt}</label></div>`;
            return `<div class="ch-sim-card"><h5>Motor de IA que usa tu empresa</h5><div class="ch-ag-dec"><b>${esc(src)}</b><div>${esc(e.label)} · ${esc(a.kinds[e.kind] || e.kind)}${e.model ? ' · modelo ' + esc(e.model) : ''}</div></div>
                <div class="ch-muted">Este mes:</div>${usage}
                <h5 style="margin-top:14px">¿Con qué motor quieres trabajar?</h5>
                ${opt('platform', 'Con créditos de DigitalAlliance Hub <span class="label label-primary">Recomendado</span>', 'usas nuestro motor de IA, sin cuentas ni claves; cada consulta descuenta créditos de tu saldo (Integraciones → Saldo y recargas).')}
                ${opt('own', 'El mío', 'usas tu propia cuenta de IA (por ejemplo la tuya de Claude u OpenAI); el consumo lo cobra tu proveedor y no descuenta créditos.')}
                ${form}${pick === 'platform' ? `<div class="ch-mail-actions"><button class="btn btn-default btn-sm" data-act="aitest"><span class="fas fa-vial"></span> Probar el motor actual</button></div><div class="ch-ag-aiout" data-role="aiout"></div>` : ''}</div>`;
        }

        aiPick(v) {
            const a = this.ai;
            if (v === 'own' && !a.own.saved) { this.pick = 'own'; this.draw(); return; }   // aún no tiene motor propio: se muestra el formulario
            Espo.Ajax.postRequest('CrmHub/aiMode', {mode: v}).then(r => { this.ai = r; this.pick = null; Espo.Ui.success(v === 'own' ? 'Ahora usas tu propio motor de IA' : 'Ahora usas créditos de DigitalAlliance Hub'); this.draw(); })
                .catch(xhr => { Espo.Ui.error(Tpl.reason(xhr, 'No se pudo cambiar.')); if (xhr) { xhr.errorIsHandled = true; } this.pick = null; this.draw(); });
        }

        aiBody() { const o = {}; this.el.querySelectorAll('[data-ai]').forEach(el => { o[el.dataset.ai] = el.value; }); return o; }

        aiTest() {
            const out = this.el.querySelector('[data-role="aiout"]'); out.innerHTML = '<span class="ch-spin"></span> Probando…';
            Espo.Ajax.postRequest('CrmHub/aiTest', this.el.querySelector('[data-ai="kind"]') ? this.aiBody() : {}, {timeout: 160000}).then(r => { out.innerHTML = `<div class="ch-dlg-note ok"><span class="fas fa-circle-check"></span> El motor responde (${esc(r.seconds)} s).</div>`; })
                .catch(xhr => { out.innerHTML = `<div class="ch-chat-err">${esc(Tpl.reason(xhr, 'No respondió.'))}</div>`; if (xhr) { xhr.errorIsHandled = true; } });
        }

        aiSave() {
            const err = this.el.querySelector('[data-role="err"]'); err.hidden = true;
            Espo.Ajax.postRequest('CrmHub/aiOwnSave', this.aiBody()).then(r => { this.ai = r; this.pick = null; Espo.Ui.success('Listo: ahora usas tu propio motor de IA'); this.draw(); })
                .catch(xhr => { err.hidden = false; err.textContent = Tpl.reason(xhr, 'No se pudo guardar.'); if (xhr) { xhr.errorIsHandled = true; } });
        }

    }
});
