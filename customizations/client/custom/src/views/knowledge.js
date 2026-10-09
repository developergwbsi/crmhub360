define('custom:views/knowledge', ['view', 'custom:ui'], function (Dep, ChUi) {
    const esc = v => ChUi.esc(v == null ? '' : v);
    const STEP = {register: 'Registro del lead', welcome: 'Correo de bienvenida', message: 'Mensaje por WhatsApp/SMS', reply: 'Respuesta del cliente', call: 'Llamada', tasks: 'Reunión y tarea', pipeline: 'Estados', convert: 'Conversión', config: 'Configuración'};
    const fmt = d => { try { return new Date(d).toLocaleString('es', {dateStyle: 'medium', timeStyle: 'short'}); } catch (e) { return d || ''; } };

    return class extends Dep {
        templateContent = '<div class="ch-kb"></div>'
        kb = null
        busy = false

        setup() {
            this.getHelper().pageTitle.setTitle('Banco de conocimiento');
            this.load();
        }
        afterRender() { this.draw(); }

        load() {
            Espo.Ajax.getRequest('CrmHub/kb').then(k => { this.kb = k; this.draw(); }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } this.kb = {error: true}; this.draw(); });
        }

        bars(rows, label) {
            if (!rows || !rows.length) { return '<div class="ch-muted">Sin datos todavía.</div>'; }
            const max = Math.max(1, ...rows.map(r => r.rate != null ? r.rate : (r.n ? 100 * r.won / r.n : 0)));
            return rows.map(r => { const rate = r.rate != null ? r.rate : (r.n ? Math.round(100 * r.won / r.n) : 0);
                return `<div class="ch-kb-row"><span class="ch-kb-n">${esc(r.name)}</span><span class="ch-kb-bar"><i style="width:${Math.max(2, 100 * rate / max)}%"></i></span><span class="ch-kb-v">${rate}% <small>(${r.won}/${r.n})</small></span></div>`; }).join('');
        }

        draw() {
            const root = this.el && this.el.querySelector('.ch-kb'); if (!root) { return; }
            const k = this.kb;
            if (!k) { root.innerHTML = '<div class="ch-muted" style="padding:24px">Cargando…</div>'; return; }
            if (k.error) { root.innerHTML = '<div class="ch-chat-err">No se pudo cargar el banco de conocimiento.</div>'; return; }
            const s = k.stats;
            const kpi = (l, v, sub) => `<div class="ch-kb-kpi"><span>${l}</span><b>${v}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
            const head = `<div class="ch-sim-head"><h3><span class="fas fa-brain"></span> Banco de conocimiento</h3>
                <p class="ch-muted">Aprende del historial real de tus leads (las simulaciones no cuentan): qué fuentes, servicios, campañas y asesores convierten mejor, cuándo llegan los mejores clientes y cuánto tardan en cerrar.</p>
                <div class="ch-mail-actions"><button class="btn btn-primary btn-sm" data-act="refresh" ${this.busy ? 'disabled' : ''}><span class="fas fa-rotate"></span> ${this.busy ? 'Analizando…' : 'Actualizar análisis'}</button>
                <span class="ch-muted">${k.generatedAt ? 'Último análisis: ' + esc(fmt(k.generatedAt)) : 'Aún no se ha generado el análisis.'}</span></div></div>`;
            let body = '';
            if (s) {
                body = `<div class="ch-kb-kpis">${kpi('Leads reales', s.total)}${kpi('Cierres', s.won, s.rate + '% de los leads')}${kpi('Descartados', s.dead)}${kpi('Días hasta cerrar', s.daysToWinMedian != null ? s.daysToWinMedian : '—', 'mediana')}</div>
                    <div class="ch-sim-card"><h4>Hallazgos</h4><ul class="ch-kb-list">${(s.findings || []).map(f => `<li>${esc(f)}</li>`).join('') || '<li class="ch-muted">Sin hallazgos.</li>'}</ul></div>
                    <div class="ch-sim-card"><h4><span class="fas fa-wand-magic-sparkles"></span> Recomendaciones de la IA</h4>${k.summary ? `<div class="ch-kb-ai">${esc(k.summary)}</div>` : '<div class="ch-muted">Se generan al actualizar el análisis cuando hay suficientes leads (10 o más) y la IA está disponible.</div>'}</div>
                    <div class="ch-kb-cols"><div class="ch-sim-card"><h4>Conversión por fuente</h4>${this.bars(s.bySource)}</div><div class="ch-sim-card"><h4>Conversión por servicio</h4>${this.bars(s.byService)}</div>
                    <div class="ch-sim-card"><h4>Conversión por campaña</h4>${this.bars(s.byCampaign)}</div><div class="ch-sim-card"><h4>Conversión por asesor</h4>${this.bars(s.byAdvisor)}</div>
                    <div class="ch-sim-card"><h4>Por día de llegada</h4>${this.bars((s.byWeekday || []).filter(r => r.n))}</div><div class="ch-sim-card"><h4>Por hora de llegada (UTC)</h4>${this.bars(s.byHour)}</div></div>`;
            } else { body = '<div class="ch-sim-card ch-muted">Pulsa «Actualizar análisis» para calcular lo que dice tu historial.</div>'; }
            const gaps = (k.simGaps || []).length ? `<div class="ch-sim-card"><h4>Lo que detectó el simulador</h4><p class="ch-muted">Pasos que se omitieron o fallaron en tus simulaciones; suelen indicar configuración pendiente.</p><ul class="ch-kb-list">${k.simGaps.map(g => `<li>${esc(STEP[g.step] || g.step)}: ${g.n} vez/veces</li>`).join('')}</ul></div>` : '';
            const notes = `<div class="ch-sim-card"><h4>Aprendizajes del equipo</h4><p class="ch-muted">Escribe lo que has aprendido (qué funciona con un tipo de cliente, objeciones, mejores momentos para llamar…).</p>
                <textarea data-f="note" rows="3" placeholder="Ej.: Los clientes de Facebook responden mejor por WhatsApp en la tarde."></textarea>
                <div class="ch-mail-actions"><button class="btn btn-default btn-sm" data-act="note"><span class="fas fa-plus"></span> Guardar aprendizaje</button></div>
                ${(k.notes || []).map(n => `<div class="ch-kb-note"><div>${esc(n.text)}</div><small>${esc(n.user_name)} · ${esc(fmt(n.created_at))}</small> <a data-act="delnote" data-id="${n.id}" title="Eliminar"><span class="far fa-trash-can"></span></a></div>`).join('')}</div>`;
            root.innerHTML = head + body + gaps + notes;
            root.onclick = e => {
                const a = e.target.closest('[data-act]'); if (!a) { return; }
                if (a.dataset.act === 'refresh') { this.refresh(); }
                else if (a.dataset.act === 'note') { this.addNote(); }
                else if (a.dataset.act === 'delnote') { Espo.Ajax.postRequest('CrmHub/kbNoteDelete', {id: +a.dataset.id}).then(() => this.load()).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('No se pudo eliminar'); }); }
            };
        }

        refresh() {
            this.busy = true; this.draw();
            Espo.Ajax.postRequest('CrmHub/kbRefresh', {}, {timeout: 300000}).then(k => { this.kb = k; })
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('No se pudo actualizar el análisis'); })
                .then(() => { this.busy = false; this.draw(); });
        }

        addNote() {
            const t = this.el.querySelector('[data-f="note"]').value.trim();
            if (t.length < 3) { Espo.Ui.warning('Escribe el aprendizaje.'); return; }
            Espo.Ajax.postRequest('CrmHub/kbNote', {text: t}).then(() => this.load()).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('No se pudo guardar'); });
        }
    };
});
