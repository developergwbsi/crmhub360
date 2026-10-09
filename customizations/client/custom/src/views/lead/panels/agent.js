// Panel «Comercial virtual» del lead: quién lo atiende (persona o agente), en qué va, qué hizo y por qué (trazabilidad), y los controles para pausarlo o tomar el control.
define('custom:views/lead/panels/agent', ['views/record/panels/bottom', 'custom:ui', 'custom:tpl'], function (Dep, ChUi, Tpl) {
    const esc = ChUi.esc;
    const K = {send: ['fas fa-paper-plane', '#4f63e8'], inbound: ['fas fa-reply', '#2fa36b'], status: ['fas fa-right-left', '#0d9488'], escalate: ['fas fa-user-tie', '#f59e0b'], close: ['fas fa-flag-checkered', '#64748b'],
        wait: ['fas fa-hourglass-half', '#94a3b8'], stop: ['fas fa-ban', '#d64545'], error: ['fas fa-triangle-exclamation', '#d64545'], control: ['fas fa-sliders', '#7c3aed'], queued: ['fas fa-clock', '#94a3b8']};
    const STATE = {awaiting_approval: 'Esperando tu aprobación', active: 'Activo', waiting_reply: 'Esperando respuesta del cliente', paused: 'Pausado', escalated: 'Pasó a una persona', stopped: 'Detenido', cooled: 'Sin más seguimientos'};
    const when = d => { try { return new Date(d).toLocaleString('es', {dateStyle: 'short', timeStyle: 'short'}); } catch (e) { return d || ''; } };

    return class extends Dep {
        templateContent = '<div class="ch-agp"><div class="ch-muted">Cargando…</div></div>'
        afterRender() {
            super.afterRender();
            this.el.onclick = e => { const a = e.target.closest('[data-act]'); if (a) { this.act(a.dataset.act); } };
            this.load();
            if (!this._chS) { this._chS = true; this.listenTo(this.model, 'sync', () => setTimeout(() => this.load(), 800)); }
        }
        onRemove() { clearTimeout(this._t); }

        load() {
            clearTimeout(this._t);
            Espo.Ajax.getRequest('CrmHub/agentLead', {leadId: this.model.id}).then(s => { this.s = s; this.paint(); if (s.effective === 'auto' && ['active', 'waiting_reply'].includes(s.state)) { this._t = setTimeout(() => this.load(), 20000); } })
                .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } });
        }

        paint() {
            const s = this.s, box = this.el.querySelector('.ch-agp'); if (!box) { return; }
            const auto = s.effective === 'auto', st = s.state ? (STATE[s.state] || s.state) : (auto ? 'Sin iniciar' : '');
            const chip = auto ? `<span class="ch-agp-chip auto"><span class="fas fa-robot"></span> Automático · ${esc(s.persona)}</span>${s.dry_run ? '<span class="ch-agp-chip test" title="Modo de prueba: no envía nada">Modo de prueba</span>' : ''}` : '<span class="ch-agp-chip"><span class="fas fa-user"></span> Manual · lo atiende una persona</span>';
            let ctl = '';
            if (auto) { ctl = (s.state === 'paused' ? '<button class="btn btn-default btn-xs" data-act="resume"><span class="fas fa-play"></span> Reanudar</button>' : '<button class="btn btn-default btn-xs" data-act="pause"><span class="fas fa-pause"></span> Pausar</button>') + ' <button class="btn btn-default btn-xs" data-act="manual"><span class="fas fa-hand"></span> Tomar el control</button>'; }
            else if (s.licensed) { ctl = '<button class="btn btn-primary btn-xs" data-act="auto"><span class="fas fa-robot"></span> Pasar al comercial virtual</button>'; }
            else { ctl = '<div class="ch-muted">La versión automática del comercial virtual no está activada en tu empresa.</div>'; }
            const pr = s.proposal;
            const prop = pr ? `<div class="ch-agp-prop"><b><span class="fas fa-hourglass-half"></span> ${esc(pr.title)}</b><div class="ch-muted">Por ${esc(pr.channel)}. Puedes editarlo antes de enviarlo.</div><textarea rows="5" data-role="pmsg">${esc(pr.detail)}</textarea>${pr.reason ? `<div class="ch-muted">Por qué: ${esc(pr.reason)}</div>` : ''}<div class="ch-agp-ctl"><button class="btn btn-primary btn-xs" data-act="approve"><span class="fas fa-paper-plane"></span> Aprobar y enviar</button><button class="btn btn-default btn-xs" data-act="reject">Descartar</button></div></div>` : '';
            box.innerHTML = `<div>${chip}</div>${prop}${st ? `<div class="ch-agp-st"><b>${esc(st)}</b>${s.state === 'waiting_reply' || s.state === 'active' ? (s.nextAt ? ` · próximo paso: ${esc(when(s.nextAt))}` : '') : ''}${s.reason && ['escalated', 'stopped'].includes(s.state) ? `<div class="ch-muted">${esc(s.reason)}</div>` : ''}</div>` : ''}` +
                `<div class="ch-agp-ctl">${ctl}</div>` +
                ((s.events || []).length ? '<div class="ch-agp-ev">' + s.events.slice(0, 12).map(e => { const k = K[e.kind] || K.wait;
                    return `<div class="ch-agp-e"><span class="${k[0]}" style="color:${k[1]}"></span><div><b>${esc(e.title)}${e.dry ? ' <em>(prueba)</em>' : ''}</b>${e.detail ? `<div class="ch-agp-d">${esc(String(e.detail).slice(0, 220))}</div>` : ''}${e.reason ? `<div class="ch-muted">Por qué: ${esc(e.reason)}</div>` : ''}<small>${esc(when(e.at))}${e.channel ? ' · ' + esc(e.channel) : ''}</small></div></div>`; }).join('') + '</div>' : '');
        }

        approval(ok) {
            const pr = this.s.proposal; if (!pr) { return; }
            const msg = this.el.querySelector('[data-role="pmsg"]').value;
            Espo.Ajax.postRequest('CrmHub/agentApproval', {leadId: this.model.id, eventId: pr.id, approve: ok, message: msg}, {timeout: 70000}).then(s => { this.s = s; this.paint(); Espo.Ui.success(ok ? 'Mensaje enviado' : 'Mensaje descartado'); this.model.fetch(); })
                .catch(xhr => { Espo.Ui.error(Tpl.reason(xhr, 'No se pudo completar.')); if (xhr) { xhr.errorIsHandled = true; } });
        }

        act(a) {
            if (a === 'approve') { this.approval(true); return; }
            if (a === 'reject') { this.approval(false); return; }
            const go = () => Espo.Ajax.postRequest('CrmHub/agentAction', {leadId: this.model.id, action: a}).then(s => { this.s = s; this.paint(); Espo.Ui.success('Listo'); })
                .catch(xhr => { Espo.Ui.error(Tpl.reason(xhr, 'No se pudo completar la acción.')); if (xhr) { xhr.errorIsHandled = true; } });
            if (a === 'manual') { ChUi.confirm({title: 'Tomar el control', text: 'El comercial virtual deja de atender a este lead y lo gestionas tú. Podrás devolvérselo cuando quieras.', ok: 'Tomar el control'}).then(y => { if (y) { go(); } }); }
            else if (a === 'auto') { ChUi.confirm({title: 'Pasar al comercial virtual', text: 'El agente contactará y dará seguimiento a este lead automáticamente, según su entrenamiento.', ok: 'Pasar al comercial virtual'}).then(y => { if (y) { go(); } }); }
            else { go(); }
        }
    };
});
