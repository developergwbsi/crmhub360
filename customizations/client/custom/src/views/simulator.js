define('custom:views/simulator', ['view', 'custom:ui'], function (Dep, ChUi) {
    const esc = v => ChUi.esc(v == null ? '' : v);
    const ICON = {ok: ['fa-circle-check', 'ok'], skip: ['fa-circle-minus', 'skip'], error: ['fa-circle-xmark', 'err'], info: ['fa-circle-info', 'info']};
    const ST = {running: 'En curso', done: 'Completada', partial: 'Con errores', error: 'Falló'};
    const fmt = d => { try { return new Date(d).toLocaleString('es', {dateStyle: 'short', timeStyle: 'medium'}); } catch (e) { return d || ''; } };

    return class extends Dep {
        templateContent = '<div class="ch-sim"></div>'
        cfg = null
        runs = []
        run = null
        timer = null

        setup() {
            this.getHelper().pageTitle.setTitle('Simulador');
            Promise.all([Espo.Ajax.getRequest('CrmHub/simConfig'), Espo.Ajax.getRequest('CrmHub/simRuns')]).then(([c, r]) => { this.cfg = c; this.runs = r.items || []; this.draw(); })
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } this.cfg = {error: true}; this.draw(); });
            this.timer = setInterval(() => { if (this.run && this.run.status === 'running') { this.openRun(this.run.id, true); } }, 1500);
        }

        onRemove() { clearInterval(this.timer); }
        afterRender() { this.draw(); }

        draw() {
            const root = this.el && this.el.querySelector('.ch-sim'); if (!root) { return; }
            if (!this.cfg) { root.innerHTML = '<div class="ch-muted" style="padding:24px">Cargando…</div>'; return; }
            if (this.cfg.error) { root.innerHTML = '<div class="ch-chat-err">No se pudo cargar el simulador.</div>'; return; }
            const c = this.cfg.config || {}, chip = (ok, t) => `<span class="ch-sim-chip ${ok ? 'on' : 'off'}"><span class="fas ${ok ? 'fa-check' : 'fa-minus'}"></span> ${t}</span>`;
            const stepsHtml = (this.cfg.steps || []).map(s => {
                const miss = (s.key === 'welcome' && !c.correo) || (s.key === 'message' && !(c.whatsapp || c.sms));
                return `<label class="ch-sim-step"><input type="checkbox" data-step="${esc(s.key)}" checked> ${esc(s.label)}${miss ? ' <em>(sin configurar: se omitirá)</em>' : ''}</label>`;
            }).join('');
            root.innerHTML = `<div class="ch-sim-head"><h3><span class="fas fa-flask-vial"></span> Simulador del proceso comercial</h3>
                <p class="ch-muted">Recorre con un lead de prueba todo lo que esta empresa tiene configurado: registro, correo de bienvenida, mensajes, llamada, estados y conversión a cliente. Los datos quedan marcados como simulación y no cuentan en los reportes.</p>
                <div>${chip(c.correo, 'Correo de salida')} ${chip(c.whatsapp, 'WhatsApp' + (c.whatsapp ? ' · ' + esc(c.whatsapp) : ''))} ${chip(c.sms, 'SMS')} ${chip(c.buzon, 'Buzón de entrada')}</div></div>
                <div class="ch-sim-grid"><div class="ch-sim-card"><h4>Nueva simulación</h4>
                <label>Nombre del cliente de prueba</label><input data-f="name" value="Cliente de Prueba">
                <label>Correo de prueba (aquí llegan los correos reales)</label><input data-f="email" value="${esc(this.cfg.email || '')}" placeholder="tucorreo@ejemplo.com">
                <label>Teléfono / WhatsApp de prueba (opcional)</label><input data-f="phone" value="${esc(this.cfg.phone || '')}" placeholder="+57 300 000 0000">
                <label>Pasos</label><div class="ch-sim-steps">${stepsHtml}</div>
                <label class="ch-sim-step"><input type="checkbox" data-f="real" checked> Envíos reales al correo/número de prueba (si lo desmarcas, todo se simula)</label>
                <div class="ch-mail-actions"><button type="button" class="btn btn-primary" data-act="start"><span class="fas fa-play"></span> Ejecutar simulación</button></div>
                <div class="ch-chat-err" data-role="err" hidden></div>
                <h4 style="margin-top:18px">Historial</h4><div data-role="runs">${this.runsHtml()}</div></div>
                <div class="ch-sim-card" data-role="run">${this.runHtml()}</div></div>`;
            root.onclick = e => {
                const a = e.target.closest('[data-act]'); if (!a) { return; }
                const act = a.dataset.act;
                if (act === 'start') { this.start(); } else if (act === 'open') { this.openRun(+a.dataset.id); } else if (act === 'del') { this.removeRun(+a.dataset.id); }
                else if (act === 'lead') { this.getRouter().navigate('#Lead/view/' + a.dataset.id, {trigger: true}); }
            };
        }

        runsHtml() {
            if (!this.runs.length) { return '<div class="ch-muted">Aún no has ejecutado simulaciones.</div>'; }
            return this.runs.map(r => `<a class="ch-sim-run ${this.run && this.run.id === r.id ? 'on' : ''}" data-act="open" data-id="${r.id}"><b>#${r.id}</b> ${esc(ST[r.status] || r.status)}<span>${esc(fmt(r.started_at))}${r.user_name ? ' · ' + esc(r.user_name) : ''}</span></a>`).join('');
        }

        runHtml() {
            const r = this.run;
            if (!r) { return '<div class="ch-muted" style="padding:30px;text-align:center"><span class="fas fa-timeline" style="font-size:28px"></span><br><br>Ejecuta una simulación para ver aquí, paso a paso, todo lo que pasa con el cliente de prueba.</div>'; }
            const ev = (r.events || []).map(e => {
                const [ic, tone] = ICON[e.status] || ICON.info, d = e.data || {};
                const kv = Object.keys(d).filter(k => typeof d[k] !== 'object' && !/Id$/.test(k)).map(k => `<li><b>${esc(k)}:</b> ${esc(d[k])}</li>`).join('');
                return `<div class="ch-tl ${tone}"><span class="ch-tl-dot fas ${ic}"></span><div class="ch-tl-b"><div class="ch-tl-t">${esc(e.title)} <small>${esc(fmt(e.at))}</small></div>${e.detail ? `<div class="ch-tl-d">${esc(e.detail)}</div>` : ''}${kv ? `<ul class="ch-tl-kv">${kv}</ul>` : ''}</div></div>`;
            }).join('');
            return `<div class="ch-sim-runh"><h4>Simulación #${r.id} · ${esc(ST[r.status] || r.status)} ${r.status === 'running' ? '<span class="ch-spin"></span>' : ''}</h4><div>` +
                (r.lead_id ? `<button class="btn btn-default btn-sm" data-act="lead" data-id="${esc(r.lead_id)}"><span class="fas fa-up-right-from-square"></span> Abrir el lead</button> ` : '') +
                `<button class="btn btn-default btn-sm" data-act="del" data-id="${r.id}"><span class="far fa-trash-can"></span> Eliminar datos de la simulación</button></div></div><div class="ch-tl-wrap">${ev}</div>`;
        }

        refreshRunPane() { const p = this.el.querySelector('[data-role="run"]'); if (p) { p.innerHTML = this.runHtml(); } const l = this.el.querySelector('[data-role="runs"]'); if (l) { l.innerHTML = this.runsHtml(); } }

        start() {
            const q = s => this.el.querySelector(s), err = q('[data-role="err"]'); err.hidden = true;
            const steps = [...this.el.querySelectorAll('[data-step]')].filter(i => i.checked).map(i => i.dataset.step);
            if (!steps.includes('register')) { err.hidden = false; err.textContent = 'El paso de registro es necesario.'; return; }
            const btn = q('[data-act="start"]'); btn.disabled = true;
            Espo.Ajax.postRequest('CrmHub/simRun', {name: q('[data-f="name"]').value, email: q('[data-f="email"]').value, phone: q('[data-f="phone"]').value, real: q('[data-f="real"]').checked, steps})
                .then(r => { this.run = {id: r.id, status: 'running', events: []}; return Espo.Ajax.getRequest('CrmHub/simRuns').then(l => { this.runs = l.items || []; this.openRun(r.id); }); })
                .catch(xhr => { err.hidden = false; err.textContent = (xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason')) || 'No se pudo iniciar la simulación.'; if (xhr) { xhr.errorIsHandled = true; } })
                .then(() => { btn.disabled = false; });
        }

        openRun(id, silent) {
            Espo.Ajax.getRequest('CrmHub/simRun', {id}).then(r => {
                this.run = r; this.refreshRunPane();
                if (r.status !== 'running' && silent) { Espo.Ajax.getRequest('CrmHub/simRuns').then(l => { this.runs = l.items || []; this.refreshRunPane(); }); }
            }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } });
        }

        removeRun(id) {
            ChUi.confirm({title: 'Eliminar simulación', text: 'Se eliminan el lead de prueba y todo lo que creó la simulación (cuenta, contacto, oportunidad, llamadas, correos). ¿Continuar?', ok: 'Eliminar'}).then(yes => {
                if (!yes) { return; }
                Espo.Ajax.postRequest('CrmHub/simDelete', {id}).then(() => { Espo.Ui.success('Simulación eliminada'); this.run = null; return Espo.Ajax.getRequest('CrmHub/simRuns'); })
                    .then(l => { this.runs = l.items || []; this.refreshRunPane(); }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('No se pudo eliminar'); });
            });
        }
    };
});
