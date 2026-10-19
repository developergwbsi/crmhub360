/**
 * Grabaciones: los videos de pantalla del CRM (capacitaciones, explicaciones) y de videollamadas que grabó el usuario. Se pueden ver, descargar, renombrar, compartir con un enlace
 * (que se puede quitar) y eliminar. Quien tiene alcance «todos» ve las de toda la empresa. Endpoints: GET CrmHub/recList, GET recPlay, POST recStart/recUpdate/recDelete.
 */
define('custom:views/recordings', ['view', 'custom:ui', 'custom:recorder'], function (Dep, ChUi, Rec) {
    const esc = v => ChUi.esc(v == null ? '' : v);
    const bytes = n => n >= 1073741824 ? (n / 1073741824).toFixed(1) + ' GB' : n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
    const dur = s => { s = Math.max(0, s | 0); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(r).padStart(2, '0'); };

    return class extends Dep {
        templateContent = '<div class="ch-rc"></div>'
        d = null
        q = ''
        kind = ''

        setup() {
            this.getHelper().pageTitle.setTitle('Grabaciones');
            this.onSaved = () => this.load();
            window.addEventListener('ch-rec-saved', this.onSaved);
            this.load();
        }
        afterRender() { this.draw(); }
        onRemove() { window.removeEventListener('ch-rec-saved', this.onSaved); clearTimeout(this.poll); if (super.onRemove) { super.onRemove(); } }

        load() {
            clearTimeout(this.poll);
            Espo.Ajax.getRequest('CrmHub/recList').then(r => {
                this.d = r; this.draw();
                if ((r.items || []).some(i => i.status === 'processing')) { this.poll = setTimeout(() => this.load(), 4000); }
            }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } this.d = {error: true}; this.draw(); });
        }

        draw() {
            const root = this.el && this.el.querySelector('.ch-rc'); if (!root) { return; }
            const d = this.d;
            if (!d) { root.innerHTML = '<div class="ch-muted" style="padding:24px">Cargando…</div>'; return; }
            if (d.error) { root.innerHTML = '<div class="ch-chat-err">No se pudieron cargar las grabaciones.</div>'; return; }
            const q = this.q.toLowerCase(), items = (d.items || []).filter(i => (!this.kind || i.kind === this.kind) && (!q || (i.title + ' ' + i.ownerName).toLowerCase().includes(q)));
            const pct = d.quotaBytes ? Math.min(100, Math.round(d.usedBytes * 100 / d.quotaBytes)) : 0;
            const card = i => {
                const mine = i.owner === d.me, can = mine || d.manager, ready = i.status === 'ready';
                const st = i.status === 'processing' ? '<span class="ch-rc-tag warn">Procesando…</span>' : i.status === 'uploading' ? '<span class="ch-rc-tag warn">Incompleta</span>' : '';
                return `<div class="ch-rc-card" data-id="${esc(i.id)}"><div class="ch-rc-thumb ${ready ? 'ok' : ''}" ${ready ? 'data-a="play"' : ''}><span class="fas ${i.kind === 'call' ? 'fa-video' : 'fa-display'}"></span>${ready ? '<span class="ch-rc-play fas fa-play"></span>' : ''}<em>${dur(i.duration)}</em></div>` +
                    `<div class="ch-rc-body"><b title="${esc(i.title)}">${esc(i.title)}</b><small>${i.kind === 'call' ? 'Videollamada' : 'Pantalla'} · ${esc(i.ownerName || '—')} · ${esc(ChUi.fmt.dt(i.at))}</small>` +
                    `<small>${bytes(i.size)} · <span class="fas ${i.audio ? 'fa-volume-high' : 'fa-volume-xmark'}"></span> ${i.audio ? 'con audio' : 'sin audio'} ${st}${i.shared ? ' <span class="ch-rc-tag ok"><span class="fas fa-link"></span> compartida</span>' : ''}</small></div>` +
                    `<div class="ch-rc-act">${ready ? '<button type="button" data-a="play" title="Ver"><span class="fas fa-play"></span></button><button type="button" data-a="dl" title="Descargar"><span class="fas fa-download"></span></button>' : ''}` +
                    (can && ready ? '<button type="button" data-a="share" title="Compartir"><span class="fas fa-share-nodes"></span></button>' : '') + (can ? '<button type="button" data-a="ren" title="Cambiar el nombre"><span class="fas fa-pen"></span></button><button type="button" data-a="del" title="Eliminar"><span class="fas fa-trash"></span></button>' : '') + '</div></div>';
            };
            root.innerHTML = `<div class="ch-rc-top"><div><h3>Grabaciones</h3><p class="ch-muted">Videos de pantalla del CRM y de videollamadas. Úsalos para capacitar o explicar un proceso. Ocupas ${bytes(d.usedBytes)} de ${bytes(d.quotaBytes)}.</p></div>` +
                `<button type="button" class="btn btn-danger" data-a="new"><span class="fas fa-circle-dot"></span> Grabar pantalla</button></div>` +
                `<div class="ch-rc-filters"><input class="form-control" type="search" data-f="q" placeholder="Buscar por título o persona" value="${esc(this.q)}"><select class="form-control" data-f="kind"><option value="">Todas</option><option value="screen"${this.kind === 'screen' ? ' selected' : ''}>De pantalla</option><option value="call"${this.kind === 'call' ? ' selected' : ''}>De videollamadas</option></select>` +
                `<div class="ch-rc-quota" title="${pct}% del espacio"><i style="width:${pct}%"></i></div></div>` +
                (items.length ? `<div class="ch-rc-grid">${items.map(card).join('')}</div>` : ChUi.empty({kind: 'search', title: (d.items || []).length ? 'No hay grabaciones con ese filtro' : 'Aún no hay grabaciones', text: (d.items || []).length ? 'Cambia la búsqueda.' : 'Pulsa «Grabar pantalla» (o el círculo rojo de la barra superior) para grabar una explicación. En una videollamada, el anfitrión puede grabarla desde «⋮».'}));
            const qi = root.querySelector('[data-f="q"]');
            qi.oninput = () => { this.q = qi.value; const p = qi.selectionStart; this.draw(); const n = this.el.querySelector('[data-f="q"]'); n.focus(); n.setSelectionRange(p, p); };
            root.querySelector('[data-f="kind"]').onchange = e => { this.kind = e.target.value; this.draw(); };
            root.onclick = e => this.click(e);
        }

        click(e) {
            const a = e.target.closest('[data-a]'); if (!a) { return; }
            if (a.dataset.a === 'new') { Rec.open(); return; }
            const card = a.closest('.ch-rc-card'), id = card && card.dataset.id, it = id && (this.d.items || []).find(x => x.id === id); if (!it) { return; }
            const k = a.dataset.a;
            if (k === 'play') { this.play(it); }
            else if (k === 'dl') { Espo.Ajax.getRequest('CrmHub/recPlay', {id}).then(r => { const l = document.createElement('a'); l.href = r.downloadUrl; l.download = ''; document.body.appendChild(l); l.click(); l.remove(); }); }
            else if (k === 'share') { this.share(it); }
            else if (k === 'ren') { ChUi.prompt({title: 'Cambiar el nombre', icon: 'fas fa-pen', label: 'Título', rows: 1, max: 120, required: true, min: 1}).then(v => { if (v) { Espo.Ajax.postRequest('CrmHub/recUpdate', {id, title: v}).then(() => this.load()); } }); }
            else if (k === 'del') { ChUi.confirm({title: 'Eliminar la grabación', danger: true, ok: 'Eliminar', html: `Se borra <b>${esc(it.title)}</b> y dejan de funcionar sus enlaces para compartir. No se puede deshacer.`}).then(ok => { if (ok) { Espo.Ajax.postRequest('CrmHub/recDelete', {id}).then(() => this.load()); } }); }
        }

        play(it) {
            Espo.Ajax.getRequest('CrmHub/recPlay', {id: it.id}).then(r => {
                ChUi.panel({title: it.title, icon: 'fas fa-play', mount: (body) => {
                    body.innerHTML = `<video class="ch-rc-video" controls autoplay playsinline src="${esc(r.url)}"></video><div style="margin-top:10px"><a class="btn btn-default" href="${esc(r.downloadUrl)}"><span class="fas fa-download"></span> Descargar</a></div>`;
                }});
            }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } ChUi.notice({title: 'No se pudo abrir', text: 'No pudimos abrir la grabación.'}); });
        }

        share(it) {
            const show = cur => ChUi.panel({title: 'Compartir la grabación', icon: 'fas fa-share-nodes', mount: (body, close) => {
                body.innerHTML = cur.shared
                    ? `<p>Cualquiera que tenga este enlace puede ver y descargar el video, sin entrar al CRM.</p><div class="ch-rc-link"><input class="form-control" readonly value="${esc(cur.shareUrl)}"><button type="button" class="btn btn-primary" data-a="copy">Copiar</button></div><p style="margin-top:12px"><button type="button" class="btn btn-default" data-a="off"><span class="fas fa-link-slash"></span> Dejar de compartir</button></p>`
                    : '<p>Todavía no está compartida. Al compartirla se crea un enlace que cualquiera con el enlace puede abrir (ver y descargar), sin entrar al CRM. Puedes quitarlo cuando quieras.</p><button type="button" class="btn btn-primary" data-a="on"><span class="fas fa-link"></span> Crear enlace</button>';
                body.onclick = ev => {
                    const b = ev.target.closest('[data-a]'); if (!b) { return; }
                    if (b.dataset.a === 'copy') { const inp = body.querySelector('input'); inp.select(); try { navigator.clipboard.writeText(inp.value); } catch (x) { document.execCommand('copy'); } b.textContent = '¡Copiado!'; }
                    else { Espo.Ajax.postRequest('CrmHub/recUpdate', {id: it.id, share: b.dataset.a === 'on'}).then(r => { close(true); this.load(); if (b.dataset.a === 'on') { show(r); } }); }
                };
            }});
            show(it);
        }
    };
});
