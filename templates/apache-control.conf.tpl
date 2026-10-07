# Crm Hub 360 - Centro de control (${CONTROL_HOST}) -> 127.0.0.1:${CONTROL_PORT}
<VirtualHost *:80>
    ServerName ${CONTROL_HOST}
    ProxyPreserveHost On
    ProxyPass        / http://127.0.0.1:${CONTROL_PORT}/ timeout=120
    ProxyPassReverse / http://127.0.0.1:${CONTROL_PORT}/
    RequestHeader set X-Forwarded-Proto "http"
    Header always set Strict-Transport-Security "max-age=31536000"
    ErrorLog  @@LOGDIR@@/crmhub-control-error.log
    CustomLog @@LOGDIR@@/crmhub-control-access.log combined
</VirtualHost>
