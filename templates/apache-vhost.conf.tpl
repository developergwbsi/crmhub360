# Crm Hub 360 - ${LABEL} (${SERVER_NAME}) -> tenant ${SLUG}
<VirtualHost *:80>
    ServerName ${SERVER_NAME}
    ProxyPreserveHost On
    # Permite incrustar esta empresa solo en el Centro de control (modo lectura); nadie más puede enmarcarla
    Header always append Content-Security-Policy "frame-ancestors 'self' https://${CONTROL_HOST}"
    RewriteEngine On

    # WebSocket de EspoCRM
    RewriteCond %{HTTP:Upgrade} =websocket [NC]
    RewriteRule ^/ws$ ws://127.0.0.1:${WS_PORT}/ [P,L]

    # Webhooks de ingesta (Facebook/Instagram, Evolution API, formularios) -> Hub Service
    ProxyPass        /hub/ http://172.28.0.1:${HUB_PORT}/v1/ingest/${SLUG}/ retry=0
    ProxyPassReverse /hub/ http://172.28.0.1:${HUB_PORT}/v1/ingest/${SLUG}/

    # Formularios web públicos de captación: https://<dominio>/f/<nombre-del-formulario>
    ProxyPass        /f/ http://172.28.0.1:${HUB_PORT}/v1/public/${SLUG}/forms/ retry=0
    ProxyPassReverse /f/ http://172.28.0.1:${HUB_PORT}/v1/public/${SLUG}/forms/

    ProxyPass        / http://127.0.0.1:${WEB_PORT}/ timeout=300
    ProxyPassReverse / http://127.0.0.1:${WEB_PORT}/
    # X-Forwarded-Proto lo fija el vhost SSL generado por certbot (https)

    # PWA: el service worker debe poder controlar todo el sitio y no cachearse
    <Location "/client/custom/sw.js">
        Header set Service-Worker-Allowed "/"
        Header set Cache-Control "no-cache"
    </Location>
    <Location "/client/custom/version.json">
        Header set Cache-Control "no-store"
    </Location>
    <Location "/client/custom/manifest.webmanifest">
        Header set Content-Type "application/manifest+json"
    </Location>

    ErrorLog  @@LOGDIR@@/crmhub-${SLUG}-error.log
    CustomLog @@LOGDIR@@/crmhub-${SLUG}-access.log combined
</VirtualHost>
