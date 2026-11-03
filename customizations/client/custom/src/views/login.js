/**
 * Pantalla de acceso propia: extiende views/login con la plantilla custom:login.
 * Añade «¿Olvidaste tu contraseña?» siempre visible, recordar usuario (localStorage, claves ch-last-user y ch-last-name) y el acceso de soporte en modo lectura
 * ?support=<código> que se canjea con POST CrmHubSupport/exchange (ver Controllers/CrmHubSupport.php).
 */
define('custom:views/login', ['views/login', 'custom:ui'], function (Dep, ChUi) {
    return class extends Dep {
        template = 'custom:login'

        // «¿Olvidaste tu contraseña?» siempre visible: con correo de salida usa la recuperación de Espo (valida usuario y correo y envía el enlace);
        // sin correo explica qué hacer en vez de esconder la opción.
        setupForgot() {
            this.$el.find('#ch-forgot').on('click', () => {
                if (this.getConfig().get('passwordRecoveryEnabled')) { this.showPasswordChangeRequest(); return; }
                ChUi.notice({
                    title: 'Recuperar contraseña', ok: 'Entendido',
                    html: 'Esta empresa aún no tiene un <b>correo de salida</b> configurado, por eso no podemos enviarte el enlace de recuperación.<br><br>Pídele a tu administrador que restablezca tu contraseña (Usuarios → tu usuario) o que active el correo de la empresa.',
                });
            });
        }

        // Recordar usuario: la próxima vez se muestra una bienvenida y solo se pide la contraseña
        setupRemember() {
            if (this._chRem) { return; }
            this._chRem = true;
            const ls = {g: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, s: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* privado */ } }, d: k => { try { localStorage.removeItem(k); } catch (e) { /* privado */ } }};
            const $u = this.$el.find('#field-userName'), $grp = this.$el.find('[data-name="username"]'), $w = this.$el.find('#ch-welcome'), $row = this.$el.find('#ch-remember-row');
            const known = ls.g('ch-last-user'), name = ls.g('ch-last-name') || known;
            const welcome = () => {
                $u.val(known); $grp.hide(); $row.hide();
                this.$el.find('#ch-wav').text((name || '?').trim().slice(0, 1).toUpperCase());
                this.$el.find('#ch-wname').text(name); this.$el.find('#ch-wuser').text('@' + known);
                $w.prop('hidden', false); setTimeout(() => this.$el.find('#field-password').focus(), 80);
            };
            if (known && known !== 'soporte-lectura' && !new URLSearchParams(window.location.search).get('support')) { this._chWelcome = true; welcome(); }
            this.$el.find('#ch-notme').on('click', () => { ls.d('ch-last-user'); ls.d('ch-last-name'); this._chWelcome = false; $u.val(''); $w.prop('hidden', true); $grp.show(); $row.show(); $u.focus(); });
            const save = () => {
                const v = ($u.val() || '').trim();
                if (!v || v === 'soporte-lectura') { return; }
                if (this._chWelcome || this.$el.find('#ch-remember').is(':checked')) { if (ls.g('ch-last-user') !== v) { ls.d('ch-last-name'); } ls.s('ch-last-user', v); } else { ls.d('ch-last-user'); ls.d('ch-last-name'); }
            };
            this.$el.find('#login-form').on('submit', save);
            this.$el.find('#btn-login').on('click', save);
        }

        // Reingreso con PIN: si en este equipo ya se activó (ch-pin-dev) y hay usuario recordado, se pide el PIN y solo se ofrece la contraseña como alternativa.
        setupPin() {
            if (this._chPin || !this._chWelcome) { return; }
            let dev = null; try { dev = localStorage.getItem('ch-pin-dev'); } catch (e) { /* privado */ }
            const user = (this.$el.find('#field-userName').val() || '').trim();
            if (!dev || !user) { return; }
            this._chPin = true;
            const $ = s => this.$el.find(s), $pin = $('#ch-pin'), $in = $('#ch-pin-in'), $err = $('#ch-pin-err'), pwParts = $('[data-name="password"], #btn-login, #login-form > .crmhub-forgot');
            const err = m => { $err.prop('hidden', !m).text(m || ''); };
            const toPassword = msg => { $pin.prop('hidden', true); pwParts.show(); if (msg) { Espo.Ui.warning(msg); } setTimeout(() => $('#field-password').focus(), 60); };
            pwParts.hide(); $pin.prop('hidden', false); setTimeout(() => $in.focus(), 80);
            $in.on('input', () => { $in.val($in.val().replace(/\D/g, '').slice(0, 6)); err(''); });
            $('#ch-pin-pw').on('click', () => toPassword(''));
            $('#ch-notme').on('click', () => { $pin.prop('hidden', true); pwParts.show(); });
            const go = () => {
                const pin = $in.val();
                if (!/^\d{4,6}$/.test(pin)) { err('Escribe tu PIN (4 a 6 números).'); return; }
                $('#ch-pin-go').prop('disabled', true);
                Espo.Ajax.postRequest('CrmHubPin/login', {userName: user, device: dev, pin}).then(r => {
                    if (r && r.ok) {
                        const auth = btoa(r.userName + ':' + r.token);
                        Espo.Ui.notify(this.translate('pleaseWait', 'messages'));
                        Espo.Ajax.getRequest('App/user', null, {login: true, headers: {'Authorization': 'Basic ' + auth, 'Espo-Authorization': auth, 'Espo-Authorization-By-Token': 'true'}})
                            .then(data => { Espo.Ui.notify(false); this.triggerLogin(r.userName, data); })
                            .catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.notify(false); $('#ch-pin-go').prop('disabled', false); toPassword('No se pudo entrar con el PIN. Usa tu contraseña.'); });
                        return;
                    }
                    $('#ch-pin-go').prop('disabled', false); $in.val('');
                    if (r && r.reason === 'wrong') { err('PIN incorrecto. Te ' + (r.left === 1 ? 'queda 1 intento' : 'quedan ' + r.left + ' intentos') + '.'); $in.focus(); }
                    else if (r && r.reason === 'locked') { try { localStorage.removeItem('ch-pin-dev'); } catch (e) { /* privado */ } toPassword('Demasiados intentos. El PIN se bloqueó por ' + (r.minutes || 15) + ' minutos: entra con tu contraseña.'); }
                    else { try { localStorage.removeItem('ch-pin-dev'); } catch (e) { /* privado */ } toPassword('Tu PIN ya no está activo en este equipo. Entra con tu contraseña.'); }
                }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } $('#ch-pin-go').prop('disabled', false); err('No se pudo comprobar el PIN. Intenta de nuevo o usa tu contraseña.'); });
            };
            $('#ch-pin-go').on('click', go);
            $in.on('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
        }

        // Acceso de soporte en modo lectura: ?support=<código de un solo uso> inicia sesión solo, con el usuario de lectura
        afterRender() {
            super.afterRender();
            this.setupRemember();
            this.setupPin();
            this.setupForgot();
            const code = new URLSearchParams(window.location.search).get('support');
            if (!code || this._chSupport) { return; }
            this._chSupport = true;
            history.replaceState(null, '', window.location.pathname + window.location.hash);
            Espo.Ajax.postRequest('CrmHubSupport/exchange', {code}).then(r => {
                this.$el.find('#field-userName').val(r.userName);
                this.$el.find('#field-password').val(r.password);
                this.$el.find('#btn-login').click();
            }).catch(xhr => { if (xhr) { xhr.errorIsHandled = true; } Espo.Ui.error('El enlace de acceso venció. Genera uno nuevo desde el Centro de control.'); });
        }

        data() {
            return {
                ...super.data(),
                appName: this.getConfig().get('applicationName') || 'Crm Hub 360',
                year: new Date().getFullYear(),
            };
        }
    };
});
