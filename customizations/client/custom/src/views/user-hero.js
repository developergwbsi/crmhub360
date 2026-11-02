/**
 * Encabezado de perfil (tarjeta con degradado, avatar grande y datos clave) para la ficha del usuario (ver y editar) y para Preferencias.
 * Uso: Hero.mix(VistaBase, view => usuario) → devuelve la vista con la tarjeta puesta arriba de la ficha. Solo lectura: no toca los campos ni los permisos.
 * El avatar es el del sistema (foto subida o el degradado con iniciales). Se redibuja en cada render.
 */
define('custom:views/user-hero', [], function () {
    const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
    const TYPE = {admin: 'Administrador', regular: 'Usuario', portal: 'Portal', api: 'API', system: 'Sistema'};
    const names = o => Object.values(o || {}).filter(Boolean);
    const when = d => { if (!d) { return 'Nunca'; } try { return new Date(String(d).replace(' ', 'T') + 'Z').toLocaleString('es-CO', {dateStyle: 'medium', timeStyle: 'short'}); } catch (e) { return d; } };
    const html = u => {
        const a = u.attributes || u, id = a.id || u.id, name = a.name || [a.firstName, a.lastName].filter(Boolean).join(' ') || a.userName || '—';
        const teams = names(a.teamsNames), roles = names(a.rolesNames), active = a.isActive !== false;
        const chips = [`<i class="ch-uh-chip ${active ? 'ok' : 'off'}">${active ? 'Activo' : 'Inactivo'}</i>`, `<i class="ch-uh-chip">${esc(TYPE[a.type] || a.type || 'Usuario')}</i>`]
            .concat(roles.map(r => `<i class="ch-uh-chip">${esc(r)}</i>`)).join('');
        const fact = (ic, l, v) => `<div><span><i class="fas ${ic}"></i> ${l}</span><b>${esc(v || '—')}</b></div>`;
        return `<div class="ch-uh"><div class="ch-uh-main"><img class="ch-uh-av" alt="" src="?entryPoint=avatar&size=large&id=${esc(id)}&t=${Date.now() % 100000}">` +
            `<div class="ch-uh-t"><h2>${esc(name)}</h2><p>@${esc(a.userName || '')}${a.title ? ' · ' + esc(a.title) : ''}</p><div class="ch-uh-chips">${chips}</div></div></div>` +
            `<div class="ch-uh-facts">${a.teamsNames !== undefined ? fact('fa-people-group', 'Equipos', teams.join(', ') || 'Sin equipo') : ''}${a.emailAddress !== undefined ? fact('fa-envelope', 'Correo', a.emailAddress) : ''}${a.phoneNumber !== undefined ? fact('fa-phone', 'Teléfono', a.phoneNumber) : ''}${a.lastAccess !== undefined ? fact('fa-clock', 'Último acceso', when(a.lastAccess)) : ''}</div></div>`;
    };
    return {
        mix(Base, who, wide) {
            return class extends Base {
                afterRender() {
                    super.afterRender();
                    try {
                        if (wide) { this.el.classList.add('ch-wide-record'); }
                        const u = who.call(this); if (!u) { return; }
                        const rec = this.el.querySelector('.record'); if (!rec) { return; }
                        this.el.querySelectorAll('.ch-uh').forEach(x => x.remove());
                        rec.insertAdjacentHTML('beforebegin', html(u));
                    } catch (e) { /* sin encabezado, la ficha sigue igual */ }
                }
            };
        },
    };
});
