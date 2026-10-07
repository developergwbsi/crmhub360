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

        // Acceso de soporte en modo lectura: ?support=<código de un solo uso> inicia sesión solo, con el usuario de lectura
        afterRender() {
            super.afterRender();
            this.setupRemember();
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
