/**
 * Panel «Videollamadas» de la ficha (lead, cuenta, contacto, oportunidad), junto a las actividades: iniciar una videollamada ahora o programarla como reunión
 * (Meeting con «Videollamada» marcada, que crea la sala propia y deja el enlace). Lista las reuniones con videollamada del registro y deja entrar o copiar el enlace.
 * Servicio adicional: solo se muestra si el Centro de control lo habilitó (Settings.crmhubMeet). Endpoints: GET Meeting (filtrado), POST CrmHub/meet/host.
 */
define('custom:views/panels/video', ['views/record/panels/bottom', 'custom:ui', 'custom:meet-launch'], function (Dep, ChUi, Launch) {
    return class extends Dep {
        templateContent = '<div class="ch-vp"><div class="ch-vp-b"><button class="btn btn-primary btn-sm" data-act="now"><span class="fas fa-video"></span> Iniciar ahora</button> <button class="btn btn-default btn-sm" data-act="plan"><span class="far fa-calendar-plus"></span> Programar videollamada</button></div><div class="ch-vp-l" data-role="l"></div></div>'

        afterRender() {
            super.afterRender();
            this.el.onclick = e => {
                const a = e.target.closest('[data-act]'); if (!a) { return; }
                if (a.dataset.act === 'now') { this.now(); }
                else if (a.dataset.act === 'plan') { this.plan(); }
                else if (a.dataset.act === 'enter') { Espo.Ajax.postRequest('CrmHub/meet/host', {meetingId: a.dataset.id}).then(r => window.open(r.hostUrl, '_blank', 'noopener')).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('La sala de esta videollamada ya terminó.'); }); }
                else if (a.dataset.act === 'copy') { const u = a.dataset.url; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => Espo.Ui.success('Enlace copiado'), () => Espo.Ui.warning(u)); }
            };
            this.load();
        }

        isOn() { return ['video', 'video_subs'].includes(this.getConfig().get('crmhubMeet')); }

        // lead al que pertenece la conversación: el propio registro si es un lead; para cuentas, contactos y oportunidades lo resuelve el servidor
        leadId() {
            const m = this.model;
            if (m.entityType === 'Lead') { return Promise.resolve({id: m.id, phone: (m.get('phoneNumber') || '').trim()}); }
            return Espo.Ajax.postRequest('CrmHub/thread', {scope: m.entityType, id: m.id}).then(t => ({id: t.leadId, phone: (t.phone || m.get('phoneNumber') || '').trim()}));
        }

        now() { this.leadId().then(l => Launch.open(this.model, l.id, l.phone)).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('Este registro no tiene una conversación con la que abrir la videollamada.'); }); }

        plan() {
            const m = this.model, u = this.getUser();
            this.createView('chPlanVideo', 'views/modals/edit', {
                scope: 'Meeting', fullFormDisabled: false,
                attributes: {parentType: m.entityType, parentId: m.id, parentName: m.get('name'), name: 'Videollamada con ' + (m.get('name') || 'el cliente'), videoCall: true, assignedUserId: u.id, assignedUserName: u.get('name')},
            }, v => { v.render(); this.listenToOnce(v, 'after:save', () => { this.load(); Espo.Ui.success('Videollamada programada. El enlace quedó en la reunión.'); }); });
        }

        load() {
            const box = this.el && this.el.querySelector('[data-role="l"]'); if (!box) { return; }
            if (!this.isOn()) { this.el.querySelector('.ch-vp').innerHTML = '<div class="ch-muted">Las videollamadas no están habilitadas para esta empresa (servicio adicional).</div>'; return; }
            Espo.Ajax.getRequest('Meeting', {where: [{type: 'equals', attribute: 'parentId', value: this.model.id}, {type: 'equals', attribute: 'videoCall', value: true}], orderBy: 'dateStart', order: 'desc', maxSize: 6, select: 'name,dateStart,status,videoLink,videoCode'}).then(r => {
                const rows = r.list || [];
                box.innerHTML = rows.map(x => `<div class="ch-vp-i"><span class="fas fa-video"></span><div style="flex:1;min-width:0"><b>${ChUi.esc(x.name)}</b><small>${ChUi.esc(x.dateStart ? ChUi.fmt.dt(x.dateStart) : '')} · ${ChUi.esc(x.status || '')}</small></div>${x.videoCode ? `<button class="btn btn-default btn-xs" data-act="enter" data-id="${ChUi.esc(x.id)}" title="Entrar a la sala">Entrar</button><button class="btn btn-default btn-xs" data-act="copy" data-url="${ChUi.esc(x.videoLink)}" title="Copiar el enlace del cliente"><span class="far fa-copy"></span></button>` : ''}</div>`).join('')
                    || '<div class="ch-muted" style="padding:6px 0">Aún no hay videollamadas programadas.</div>';
            }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } });
        }
    };
});
