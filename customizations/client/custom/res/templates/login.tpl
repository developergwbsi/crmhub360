<div class="crmhub-login">
    <aside class="crmhub-brand">
        <div class="crmhub-brand-inner">
            <div class="crmhub-logo">
                <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
                    <rect width="48" height="48" rx="12" fill="rgba(255,255,255,.16)"/>
                    <path d="M24 9a15 15 0 1 0 0 30 15 15 0 0 0 0-30Zm0 5.5a9.5 9.5 0 0 1 8.4 5H15.6a9.5 9.5 0 0 1 8.4-5Zm-9.5 9.5h19a9.5 9.5 0 0 1-19 0Z" fill="#fff"/>
                </svg>
                <span>{{appName}}</span>
            </div>
            <div class="crmhub-system">con <b>Crm Hub 360</b></div>

            <h1>Vende más,<br>con cada lead bajo control.</h1>
            <p class="crmhub-lead">
                Crm Hub 360 es la plataforma comercial que centraliza tus leads, automatiza la evaluación
                de crédito con inteligencia artificial y mantiene a todo tu equipo alineado.
            </p>

            <ul class="crmhub-features">
                <li><span class="crmhub-ic">⚡</span><div><strong>Captación omnicanal</strong><small>Facebook, Instagram, WhatsApp y formularios web en un solo lugar.</small></div></li>
                <li><span class="crmhub-ic">🧠</span><div><strong>Crédito con IA</strong><small>Lee el reporte del buró y sugiere la pre-aprobación en segundos.</small></div></li>
                <li><span class="crmhub-ic">👥</span><div><strong>Equipos y pipeline</strong><small>Roles, jerarquías y tableros Kanban para cada comercial.</small></div></li>
            </ul>

            <div class="crmhub-brand-foot">© {{year}} {{appName}} · Plataforma Crm Hub 360</div>
        </div>
    </aside>

    <main class="crmhub-form-side">
        <div class="crmhub-card">
            <div class="crmhub-mobile-brand">{{appName}} <small>· Crm Hub 360</small></div>
            <h2>Bienvenido de nuevo</h2>
            <p class="crmhub-sub">Inicia sesión para continuar en {{appName}}.</p>

            <form id="login-form">
                {{#if hasSignIn}}
                <div class="cell" data-name="sign-in">
                    {{#if hasFallback}}
                    <div class="pull-right">
                        <a role="button" tabindex="0" class="btn btn-link btn-icon" data-action="showFallback"><span class="fas fa-chevron-down"></span></a>
                    </div>
                    {{/if}}
                    <button class="btn btn-default btn-x-wide" id="sign-in" type="button">{{signInText}}</button>
                </div>
                {{/if}}

                <div class="crmhub-welcome" id="ch-welcome" hidden>
                    <span class="crmhub-wav" id="ch-wav"></span>
                    <div class="crmhub-wtxt"><small>Bienvenido de nuevo</small><strong id="ch-wname"></strong><em id="ch-wuser"></em></div>
                    <a role="button" id="ch-notme" tabindex="5">¿No eres tú?</a>
                </div>

                <div class="form-group cell" data-name="username">
                    <label for="field-userName">{{translate 'Username'}}</label>
                    <input type="text" name="username" id="field-userName" class="form-control" autocapitalize="off"
                           spellcheck="false" tabindex="1" autocomplete="username" maxlength="255" placeholder="usuario">
                </div>

                <div class="form-group cell" data-name="password">
                    <label for="field-password">{{translate 'Password'}}</label>
                    <div data-role="password-input-container">
                        <input type="password" name="password" id="field-password" class="form-control" tabindex="2"
                               autocomplete="current-password" maxlength="255" placeholder="••••••••">
                        <a role="button" data-action="toggleShowPassword" class="text-soft" title="{{translate 'View'}}"><span class="far fa-eye"></span></a>
                    </div>
                </div>

                <label class="crmhub-remember" id="ch-remember-row"><input type="checkbox" id="ch-remember" checked> Recordar mi usuario en este equipo</label>

                {{#if anotherUser}}
                <div class="form-group cell">
                    <label>{{translate 'Log in as'}}</label>
                    <div>{{anotherUser}}</div>
                </div>
                {{/if}}

                <button type="submit" class="btn btn-primary crmhub-submit" id="btn-login" tabindex="3">{{logInText}}</button>

                <div class="crmhub-forgot">
                    <a role="button" id="ch-forgot" tabindex="4">¿Olvidaste tu contraseña?</a>
                </div>
            </form>
        </div>
    </main>
</div>
<footer class="crmhub-hidden-footer">{{{footer}}}</footer>
