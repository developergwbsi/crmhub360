/**
 * PIN de reingreso: tras entrar con contraseña se ofrece crear un PIN (4 a 6 números, repetido y validado con la contraseña) para volver a entrar sin escribirla, solo en este equipo.
 * `offer(user)` lo llama el arranque una vez por sesión de página; `manage(user)` abre el panel del perfil (cambiar, activar en este equipo, quitar).
 * El código del equipo vive en localStorage (ch-pin-dev). Endpoints: GET CrmHub/pinStatus; POST pinSet, pinDevice, pinRemove, pinForget (Hub: /v1/pin*).
 */
define('custom:pin', ['custom:ui'], function (ChUi) {
    const esc = ChUi.esc, DEV = 'ch-pin-dev', SKIP = 'ch-pin-skip';
    const ls = {g: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, s: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* privado */ } }, d: k => { try { localStorage.removeItem(k); } catch (e) { /* privado */ } }};
    const reason = xhr => { if (xhr) { xhr.errorIsHandled = true; } return (xhr && xhr.getResponseHeader && xhr.getResponseHeader('X-Status-Reason')) || 'No se pudo completar.'; };

    function dialog(build) {
        return new Promise(resolve => {
            const back = document.createElement('div'); back.className = 'ch-dlg-back'; const box = document.createElement('div'); box.className = 'ch-dlg'; box.setAttribute('role', 'dialog'); back.appendChild(box); document.body.appendChild(back);
            const close = v => { document.removeEventListener('keydown', onKey, true); back.remove(); resolve(v); };
            const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } };
            document.addEventListener('keydown', onKey, true);
            box.addEventListener('click', e => { const b = e.target.closest('.ch-pin-eye'); if (!b) { return; } const i = b.parentNode.querySelector('input'), show = i.type === 'password'; i.type = show ? 'text' : 'password'; b.firstChild.className = show ? 'far fa-eye-slash' : 'far fa-eye'; b.title = show ? 'Ocultar' : 'Ver'; i.focus(); });
            build(box, close); requestAnimationFrame(() => back.classList.add('in'));
        });
    }
    const head = (t, ic) => `<div class="ch-dlg-head"><span class="ch-dlg-ic ${ic || 'fas fa-key'}"></span><h4>${esc(t)}</h4></div>`;
    const field = (label, name, extra) => `<label class="ch-dlg-label">${esc(label)}</label><div class="ch-pin-wrap"><input class="form-control ${name === 'pw' ? '' : 'ch-pin-in'}" type="password" data-f="${name}" ${name === 'pw' ? 'autocomplete="current-password"' : 'inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off"'} ${extra || ''}><button type="button" class="ch-pin-eye" tabindex="-1" title="Ver" aria-label="Ver"><span class="far fa-eye"></span></button></div>`;
    const keepUser = u => { if (u && u.userName) { ls.s('ch-last-user', u.userName); if (u.name) { ls.s('ch-last-name', u.name); } } };

    // Formulario para crear o cambiar el PIN (pide la contraseña: confirma que eres tú). → true si quedó guardado
    function setDialog(user, changing) {
        return dialog((box, close) => {
            box.innerHTML = head(changing ? 'Cambiar mi PIN' : 'Crear mi PIN', 'fas fa-key') + '<div class="ch-dlg-body">' +
                `<p>${changing ? 'Elige un PIN nuevo. Si lo habías activado en otros equipos, allí tendrás que volver a activarlo.' : 'Con un PIN de <b>4 a 6 números</b> entras más rápido desde este equipo, sin escribir tu contraseña.'}</p>` +
                field('Tu contraseña actual (para confirmar que eres tú)', 'pw') + field('PIN nuevo (4 a 6 números)', 'p1') + field('Repite el PIN', 'p2') +
                '<div class="ch-dlg-err" hidden></div></div><div class="ch-dlg-foot"><button type="button" class="btn btn-default" data-a="no">Cancelar</button><button type="button" class="btn btn-primary" data-a="ok">Guardar PIN</button></div>';
            const q = s => box.querySelector(s), er = m => { const e = q('.ch-dlg-err'); e.hidden = !m; e.textContent = m || ''; };
            box.querySelectorAll('.ch-pin-in').forEach(i => i.addEventListener('input', () => { i.value = i.value.replace(/\D/g, '').slice(0, 6); }));
            q('[data-a=no]').onclick = () => close(false);
            q('[data-a=ok]').onclick = () => {
                const pw = q('[data-f=pw]').value, p1 = q('[data-f=p1]').value, p2 = q('[data-f=p2]').value;
                if (!pw) { er('Escribe tu contraseña.'); return; }
                if (!/^\d{4,6}$/.test(p1)) { er('El PIN debe tener de 4 a 6 números.'); return; }
                if (p1 !== p2) { er('Los dos PIN no coinciden.'); return; }
                er(''); q('[data-a=ok]').disabled = true;
                Espo.Ajax.postRequest('CrmHub/pinSet', {password: pw, pin: p1}).then(r => { ls.s(DEV, r.device); keepUser(user); ls.d(SKIP); Espo.Ui.success('Listo: la próxima vez podrás entrar con tu PIN.'); close(true); })
                    .catch(xhr => { er(reason(xhr)); q('[data-a=ok]').disabled = false; });
            };
            setTimeout(() => q('[data-f=pw]').focus(), 60);
        });
    }

    // Activar el PIN que ya existe en este equipo (solo pide la contraseña)
    function deviceDialog(user) {
        return dialog((box, close) => {
            box.innerHTML = head('Activar mi PIN en este equipo', 'fas fa-laptop') + '<div class="ch-dlg-body"><p>Ya tienes un PIN, pero este equipo aún no está activado. Confirma tu contraseña para poder entrar aquí con tu PIN.</p>' +
                field('Tu contraseña', 'pw') + '<div class="ch-dlg-err" hidden></div></div><div class="ch-dlg-foot"><button type="button" class="btn btn-default" data-a="no">Ahora no</button><button type="button" class="btn btn-primary" data-a="ok">Activar</button></div>';
            const q = s => box.querySelector(s), er = m => { const e = q('.ch-dlg-err'); e.hidden = !m; e.textContent = m || ''; };
            q('[data-a=no]').onclick = () => close(false);
            q('[data-a=ok]').onclick = () => {
                const pw = q('[data-f=pw]').value; if (!pw) { er('Escribe tu contraseña.'); return; }
                q('[data-a=ok]').disabled = true;
                Espo.Ajax.postRequest('CrmHub/pinDevice', {password: pw}).then(r => { ls.s(DEV, r.device); keepUser(user); Espo.Ui.success('Listo: este equipo ya entra con tu PIN.'); close(true); })
                    .catch(xhr => { er(reason(xhr)); q('[data-a=ok]').disabled = false; });
            };
            setTimeout(() => q('[data-f=pw]').focus(), 60);
        });
    }

    // Pregunta al entrar: sin PIN → ofrece crearlo; con PIN pero equipo no activado → ofrece activarlo. Una vez por carga de página.
    let asked = false;
    function offer(user) {
        if (asked || !user || user.userName === 'soporte-lectura') { return; }
        asked = true;
        Espo.Ajax.getRequest('CrmHub/pinStatus', {device: ls.g(DEV) || ''}).then(st => {
            if (!st || st.unavailable) { return; }
            if (st.hasPin && st.deviceOk) { keepUser(user); return; }
            if (!st.hasPin && ls.g(SKIP) === user.id) { return; }
            if (st.hasPin && ls.g(SKIP + '-dev') === user.id + ':' + new Date().toISOString().slice(0, 10)) { return; }
            if (st.hasPin) {
                dialog((box, close) => {
                    box.innerHTML = head('¿Entrar con tu PIN en este equipo?', 'fas fa-key') + '<div class="ch-dlg-body"><p>Ya tienes un PIN creado. Actívalo aquí para no escribir la contraseña la próxima vez.</p></div><div class="ch-dlg-foot"><button type="button" class="btn btn-default" data-a="no">Hoy no</button><button type="button" class="btn btn-primary" data-a="ok">Activar</button></div>';
                    box.querySelector('[data-a=no]').onclick = () => { ls.s(SKIP + '-dev', user.id + ':' + new Date().toISOString().slice(0, 10)); close(false); };
                    box.querySelector('[data-a=ok]').onclick = () => close(true);
                }).then(y => { if (y) { deviceDialog(user); } });
                return;
            }
            dialog((box, close) => {
                box.innerHTML = head('¿Quieres entrar con un PIN?', 'fas fa-key') + '<div class="ch-dlg-body"><p>Crea un PIN de <b>4 a 6 números</b> y la próxima vez que vuelvas a este equipo entras con el PIN, sin escribir la contraseña. Si lo prefieres, siempre podrás usar tu contraseña.</p>' +
                    '<p class="ch-muted" style="font-size:13px">Lo puedes cambiar después en tu perfil.</p></div><div class="ch-dlg-foot"><button type="button" class="btn btn-link" data-a="never">No preguntar más</button><button type="button" class="btn btn-default" data-a="no">Ahora no</button><button type="button" class="btn btn-primary" data-a="ok">Crear PIN</button></div>';
                box.querySelector('[data-a=no]').onclick = () => close(false);
                box.querySelector('[data-a=never]').onclick = () => { ls.s(SKIP, user.id); close(false); };
                box.querySelector('[data-a=ok]').onclick = () => close(true);
            }).then(y => { if (y) { setDialog(user, false); } });
        }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } });
    }

    // Panel del perfil: estado del PIN, cambiarlo (si lo olvidó basta la contraseña), activarlo aquí, quitarlo
    function manage(user0) {
        (user0 && user0.userName ? Promise.resolve(user0) : Espo.Ajax.getRequest('App/user').then(r => r.user)).then(user => manage2(user)).catch(xhr => { Espo.Ui.error(reason(xhr)); });
    }
    function manage2(user) {
        Espo.Ajax.getRequest('CrmHub/pinStatus', {device: ls.g(DEV) || ''}).then(st => {
            if (st.unavailable) { ChUi.notice({title: 'PIN de ingreso', text: 'Tu usuario usa verificación en dos pasos, por eso no puede usar PIN.'}); return; }
            return dialog((box, close) => {
                const state = !st.hasPin ? 'Aún no tienes un PIN.' : st.deviceOk ? 'Tienes un PIN y <b>este equipo</b> entra con él.' : 'Tienes un PIN, pero <b>este equipo</b> no está activado.';
                box.innerHTML = head('PIN de ingreso', 'fas fa-key') + `<div class="ch-dlg-body"><p>${state}</p><p class="ch-muted" style="font-size:13px">El PIN solo sirve en los equipos donde lo activaste con tu contraseña. Si lo olvidaste, créalo de nuevo: te pedimos tu contraseña para confirmar que eres tú.${st.hasPin ? ` Equipos activos: ${st.devices}.` : ''}</p></div>` +
                    `<div class="ch-dlg-foot">${st.hasPin ? '<button type="button" class="btn btn-link" data-a="rm" style="color:#b42323">Quitar mi PIN</button>' : ''}${st.hasPin && st.deviceOk ? '<button type="button" class="btn btn-default" data-a="forget">Olvidar este equipo</button>' : ''}${st.hasPin && !st.deviceOk ? '<button type="button" class="btn btn-default" data-a="dev">Activar en este equipo</button>' : ''}<button type="button" class="btn btn-primary" data-a="set">${st.hasPin ? 'Cambiar PIN' : 'Crear PIN'}</button></div>`;
                box.onclick = e => {
                    const b = e.target.closest('[data-a]'); if (!b) { return; } const a = b.dataset.a;
                    if (a === 'set') { close(null); setDialog(user, st.hasPin); }
                    else if (a === 'dev') { close(null); deviceDialog(user); }
                    else if (a === 'forget') { Espo.Ajax.postRequest('CrmHub/pinForget', {device: ls.g(DEV) || ''}).then(() => { ls.d(DEV); Espo.Ui.success('Este equipo ya no entra con PIN.'); close(null); }); }
                    else if (a === 'rm') {
                        close(null);
                        dialog((bx, cl) => {
                            bx.innerHTML = head('Quitar mi PIN', 'fas fa-trash') + '<div class="ch-dlg-body"><p>Se borra tu PIN y dejará de funcionar en todos tus equipos. Confirma tu contraseña.</p>' + field('Tu contraseña', 'pw') + '<div class="ch-dlg-err" hidden></div></div><div class="ch-dlg-foot"><button type="button" class="btn btn-default" data-a="no">Cancelar</button><button type="button" class="btn btn-danger" data-a="ok">Quitar PIN</button></div>';
                            const q = s => bx.querySelector(s);
                            q('[data-a=no]').onclick = () => cl(false);
                            q('[data-a=ok]').onclick = () => Espo.Ajax.postRequest('CrmHub/pinRemove', {password: q('[data-f=pw]').value}).then(() => { ls.d(DEV); Espo.Ui.success('PIN eliminado.'); cl(true); })
                                .catch(xhr => { const er = q('.ch-dlg-err'); er.hidden = false; er.textContent = reason(xhr); });
                            setTimeout(() => q('[data-f=pw]').focus(), 60);
                        });
                    }
                };
                const f = box.querySelector('.ch-dlg-foot'); if (!f.querySelector('[data-a=cancel]')) { f.insertAdjacentHTML('afterbegin', '<button type="button" class="btn btn-default" data-a="x">Cerrar</button>'); f.querySelector('[data-a=x]').onclick = () => close(null); }
                box.addEventListener('mousedown', e => e.stopPropagation());
            });
        }).catch(xhr => { err(xhr); });
        function err(xhr) { Espo.Ui.error(reason(xhr)); }
    }

    return {offer, manage, device: () => ls.g(DEV) || ''};
});
