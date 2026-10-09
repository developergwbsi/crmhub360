// Copias de seguridad y limpieza de leads (solo administrador). La limpieza siempre guarda antes una copia que se puede restaurar.
define('custom:views/lead-backup', ['view', 'custom:ui'], function (Dep, ChUi) {
    const esc = v => ChUi.esc(v == null ? '' : v);
    const fmt = d => { try { return new Date(String(d).replace(' ', 'T') + 'Z').toLocaleString('es', {dateStyle: 'medium', timeStyle: 'short'}); } catch (e) { return d || ''; } };
    const size = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
    const REASON = {manual: 'Manual', 'before-clean': 'Antes de limpiar'};

    return class extends Dep {
        templateContent = '<div class="ch-lbk"></div>'
        data0 = null
        busy = ''

        setup() { this.getHelper().pageTitle.setTitle('Copias de leads'); this.load(); }
        afterRender() { this.draw(); }

        load() {
            Espo.Ajax.getRequest('CrmHub/leadBackups').then(d => { this.data0 = d; this.draw(); })
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } this.data0 = {error: true}; this.draw(); });
        }

        draw() {
            const root = this.el && this.el.querySelector('.ch-lbk'); if (!root) { return; }
            const d = this.data0;
            if (!d) { root.innerHTML = '<div class="ch-muted" style="padding:24px">Cargando…</div>'; return; }
            if (d.error) { root.innerHTML = '<div class="ch-chat-err">No se pudo cargar. Solo los administradores pueden ver esta pantalla.</div>'; return; }
            const dis = this.busy ? 'disabled' : '';
            const rows = (d.items || []).map(b => `<div class="ch-proc-item"><a><b>${esc(fmt(b.createdAt))} · ${esc(REASON[b.reason] || b.reason)}</b>
                <span>${b.counts.Lead} leads · ${b.counts.Note} notas · ${b.counts.Task} tareas · ${b.counts.Call} llamadas · ${b.counts.Meeting} reuniones · ${size(b.size)} · ${esc(b.by)}${b.note ? ' · ' + esc(b.note) : ''}</span></a>
                <button class="btn btn-default btn-sm" data-act="dl" data-id="${b.id}" ${dis}><span class="fas fa-download"></span> Descargar</button>
                <button class="btn btn-default btn-sm" data-act="restore" data-id="${b.id}" ${dis}><span class="fas fa-clock-rotate-left"></span> Restaurar</button>
                <a data-act="del" data-id="${b.id}" title="Eliminar copia"><span class="far fa-trash-can"></span></a></div>`).join('');
            root.innerHTML = `<div class="ch-sim-head"><h3><span class="fas fa-box-archive"></span> Copias y limpieza de leads</h3>
                <p class="ch-muted">Guarda una copia de todos tus leads (con sus notas, tareas, llamadas y reuniones) y, si lo necesitas, déjalos en blanco para empezar de nuevo. Antes de limpiar, el sistema siempre crea una copia que puedes restaurar.</p></div>
                <div class="ch-sim-card"><h4>Leads actuales: <b>${d.leads}</b></h4>
                <div class="ch-mail-actions"><button class="btn btn-primary btn-sm" data-act="create" ${dis}><span class="fas fa-copy"></span> ${this.busy === 'create' ? 'Creando copia…' : 'Crear copia ahora'}</button>
                <button class="btn btn-danger btn-sm" data-act="clean" ${dis || (d.leads ? '' : 'disabled')}><span class="fas fa-broom"></span> ${this.busy === 'clean' ? 'Limpiando…' : 'Limpiar todos los leads'}</button></div>
                <p class="ch-muted" style="margin-top:8px">Los correos enviados o recibidos no se tocan. Los clientes, cuentas y oportunidades ya convertidos tampoco: solo se limpian los leads.</p></div>
                <div class="ch-sim-card"><h4><span class="fas fa-clock-rotate-left"></span> Copias guardadas</h4>${rows || '<div class="ch-muted">Aún no hay copias.</div>'}</div>`;
            root.onclick = e => { const a = e.target.closest('[data-act]'); if (a && !a.disabled) { this.act(a.dataset.act, a.dataset.id); } };
        }

        // la lista de leads queda guardada en memoria al salir de ella: se descarta para que muestre el cambio sin recargar la página
        refreshLeadLists() { try { this.getBaseController().clearScopeStoredMainView('Lead'); } catch (e) { /* sin lista guardada */ } }

        fail(msg) { return xhr => { if (xhr) { xhr.errorIsHandled = true; } this.busy = ''; this.draw(); Espo.Ui.error(msg); }; }

        act(act, id) {
            if (this.busy) { return; }
            if (act === 'create') {
                ChUi.prompt({title: 'Crear copia', text: 'Se guarda una copia de todos los leads actuales.', label: 'Nota (opcional)', rows: 2, max: 120, ok: 'Crear copia'}).then(note => {
                    if (note === null) { return; }
                    this.busy = 'create'; this.draw();
                    Espo.Ajax.postRequest('CrmHub/leadBackupCreate', {note}).then(() => { this.busy = ''; Espo.Ui.success('Copia creada'); this.load(); }).catch(this.fail('No se pudo crear la copia'));
                });
            } else if (act === 'clean') {
                ChUi.prompt({title: 'Limpiar todos los leads', icon: 'fas fa-triangle-exclamation ch-dlg-ic-danger',
                    text: `Vas a quitar los ${this.data0.leads} leads (con sus notas, tareas, llamadas y reuniones). Antes se crea una copia automática que podrás restaurar desde esta pantalla. Para continuar escribe LIMPIAR.`,
                    label: 'Confirmación', rows: 1, max: 20, ok: 'Limpiar', required: true, min: 7, requiredText: 'Escribe LIMPIAR para confirmar.'}).then(t => {
                    if (t === null) { return; }
                    if (t.trim() !== 'LIMPIAR') { Espo.Ui.warning('No coincide: escribe LIMPIAR'); return; }
                    this.busy = 'clean'; this.draw();
                    Espo.Ajax.postRequest('CrmHub/leadClean', {confirm: 'LIMPIAR'}).then(r => {
                        this.busy = ''; this.refreshLeadLists(); Espo.Ui.success(`Se limpiaron ${r.removed} leads. Copia guardada.`); this.load();
                    }).catch(this.fail('No se pudo limpiar. La copia (si se alcanzó a crear) queda en la lista.'));
                });
            } else if (act === 'restore') {
                ChUi.confirm({title: 'Restaurar copia', text: 'Se recuperan los leads y su actividad que ya no existan. Los leads que sigan en el sistema no se modifican.', ok: 'Restaurar'}).then(y => {
                    if (!y) { return; }
                    this.busy = 'restore'; this.draw();
                    Espo.Ajax.postRequest('CrmHub/leadRestore', {id}).then(r => {
                        this.busy = ''; this.refreshLeadLists(); Espo.Ui.success(`Restaurados ${r.restored.Lead} leads` + (r.skipped ? ` (${r.skipped} ya existían)` : '')); this.load();
                    }).catch(this.fail('No se pudo restaurar'));
                });
            } else if (act === 'del') {
                ChUi.confirm({title: 'Eliminar copia', text: 'La copia se elimina definitivamente y ya no podrás restaurarla.', ok: 'Eliminar', danger: true}).then(y => {
                    if (y) { Espo.Ajax.postRequest('CrmHub/leadBackupDelete', {id}).then(() => this.load()).catch(this.fail('No se pudo eliminar')); }
                });
            } else if (act === 'dl') {
                this.busy = 'dl'; this.draw();
                Espo.Ajax.getRequest('CrmHub/leadBackupDownload', {id}).then(r => {
                    const blob = new Blob([JSON.stringify(r)], {type: 'application/json'});
                    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
                    a.download = 'copia-leads-' + String(r.backup.createdAt).replace(/[^0-9]/g, '').slice(0, 12) + '.json';
                    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
                    this.busy = ''; this.draw();
                }).catch(this.fail('No se pudo descargar'));
            }
        }
    };
});
