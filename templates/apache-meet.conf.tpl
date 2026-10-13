# Crm Hub 360 - Videollamadas (${MEET_HOST}): la página y las credenciales las sirve el Hub; la señal (wss) va a LiveKit en 127.0.0.1:7880
<VirtualHost *:80>
    ServerName ${MEET_HOST}
    ProxyPreserveHost On
    RewriteEngine On
    # Señal de LiveKit por WebSocket (y su validación por HTTP)
    RewriteCond %{HTTP:Upgrade} =websocket [NC]
    RewriteRule ^/rtc(.*)$ ws://127.0.0.1:7880/rtc$1 [P,L]
    ProxyPass        /rtc http://127.0.0.1:7880/rtc retry=0
    ProxyPassReverse /rtc http://127.0.0.1:7880/rtc
    # Página, cliente de LiveKit y credenciales de entrada -> Hub Service
    ProxyPass        / http://172.28.0.1:${HUB_PORT}/v1/public/meet/ retry=0
    ProxyPassReverse / http://172.28.0.1:${HUB_PORT}/v1/public/meet/
    Header always set Strict-Transport-Security "max-age=31536000"
    Header always set Permissions-Policy "camera=(self), microphone=(self), display-capture=(self)"
    ErrorLog  @@LOGDIR@@/crmhub-meet-error.log
    CustomLog @@LOGDIR@@/crmhub-meet-access.log combined
</VirtualHost>
