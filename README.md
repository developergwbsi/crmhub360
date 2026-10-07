# Crm Hub 360

CRM multi-empresa sobre EspoCRM 10 + PostgreSQL, con IA local (Ollama) para leer reportes de crédito y asistir a los comerciales. Idioma por defecto: español (`es_ES`), moneda COP, zona `America/Bogota`.

## Arquitectura

| Pieza | Detalle |
|---|---|
| Aislamiento | **Una BD PostgreSQL + un rol por empresa** (`tenant_<slug>`), una instancia EspoCRM por empresa (web + daemon + websocket). EspoCRM no soporta schemas nativos; esto evita parchear el núcleo. |
| Registro de licencias | BD `crmhub_master` (tabla `tenants`: plan, máx. usuarios, vencimiento, estado). `suspended`/`expired` bloquea IA e ingesta. |
| Hub Service | FastAPI en `hub-service/`. Red host, enlazado a `172.28.0.1:8190` (gateway de `crmhub_net`), porque Ollama solo escucha en `127.0.0.1`. |
| IA | Ollama, modelo `OLLAMA_MODEL` (por defecto `llama3.1:8b`, ver benchmark abajo). El LLM **solo extrae datos**; la decisión de pre-aprobación son reglas deterministas en `hub-service/app/credit.py` (umbrales por env). |
| Customizaciones | `customizations/` se copia a cada tenant: Lead con campos de crédito, pipeline Kanban en español, hook del PDF, acciones IA en el detalle del Lead. |

## Uso

```bash
bin/crmhub init                       # genera .env con secretos
bin/crmhub up                         # Postgres + Hub Service
bin/crmhub tenant:create acme --name "Acme SAS" --admin-email gerente@acme.co \
    --host acme.crm.digitalalliancehub.site --plan pro --max-users 25 --license-until 2027-10-07
bin/crmhub tenant:list | tenant:suspend <slug> | tenant:resume <slug> | tenant:upgrade <slug>
bin/crmhub tenant:delete <slug> --yes # irreversible
```

`tenant:create` hace todo: BD aislada, contenedores, customizaciones, ajustes es_ES/COP, roles (Comercial / Director de Equipo / Gerente General), equipo, usuario API y registro de licencia. La contraseña del admin se muestra una sola vez (queda en `tenants/<slug>/.env`, ignorado por git).

## Apache + SSL (dev / prod)

```bash
sudo bin/crmhub vhost:install dev --env dev     # crea /etc/apache2/sites-available/crmhub-dev.conf, activa y recarga
sudo certbot --apache -d dev-crm.digitalalliancehub.site --non-interactive --agree-tos -m strauss@intelibpo.com
```
El vhost proxea la app, el WebSocket (`/ws`, `mod_proxy_wstunnel`) y los webhooks `/hub/*`. Certbot se emite solo para el host indicado, sin tocar los demás vhosts.

## Webhooks de ingesta (`https://<host>/hub/...`)

- `facebook` (Facebook/Instagram Leads; verificación GET con el token del tenant; para consultar `leadgen_id` hay que guardar `fb_page_token` en `tenants.settings`)
- `evolution` (Evolution API `messages.upsert`; header `apikey: <hub_token>`; crea/une el lead por teléfono y registra cada mensaje en el stream)
- `web` (JSON `{name, phone, email, source}`; `?token=<hub_token>`)

Teléfonos se normalizan a E.164 (sin prefijo se asume +57).

## Calificación de leads y asignación

- **Servicios y filtros** (`hub-service/app/qualify.py`): cada empresa define sus servicios y condiciones en *Integraciones → Servicios y filtros*;
  los valores iniciales (`DEFAULT_SERVICES`) son solo de partida. El lead queda con *Resultado del filtro*, *Servicio sugerido* y *Motivos*.
- **Asignación automática** (`customizations/.../Services/LeadAssigner.php`, hook `AutoAssign`): campaña → usuarios habilitados de sus equipos;
  si no hay, todos los habilitados; siempre al de menos leads abiertos. Habilitación por usuario: campo `receivesLeads`.
- **Config del balanceo y de estados** (pantallas `#CrmHub/asignacion` y `#CrmHub/pipeline`, guardadas en la config de EspoCRM como `crmhubAssignMethod`, `crmhubAssignCap`, `crmhubStatusNew|Review|Qualified`, `crmhubClosedStatuses`).
- **Reasignación**: `POST /CrmHub/reassign` (admin, o rol con permiso de asignación; *team* = solo usuarios de sus equipos). Deja nota en el historial.

## WhatsApp (envío) y llamadas

- **WhatsApp**: Integraciones → *WhatsApp · envío de mensajes* (URL de Evolution API, instancia, API key; las credenciales viven en `tenants.settings`, nunca se devuelven a la interfaz).
  El botón **WhatsApp** del lead envía por `POST {url}/message/sendText/{instancia}` (`hub-service/app/whatsapp.py`) y registra la nota; el eco del webhook (`fromMe`) se ignora para no duplicarla.
- **Llamadas**: el botón **Llamar** abre `tel:` (softphone/teléfono del asesor) y luego registra el resultado como `Call` (Held, saliente) + nota. No hay marcación ni grabación integradas (requieren proveedor SIP/Twilio).
- **Manual por rol**: cada sección lleva `data-roles`; `GET /CrmHub/myroles` decide qué ve cada usuario (admin ve todo; los demás pueden alternar «Ver todo el manual»).

## PWA, modo oscuro y versiones

- **Tema claro/oscuro**: `crmhub-theme.css` (claro, sobre `espo.css`) y `crmhub-theme-dark.css` (sobre `dark.css` de Espo); ambos importan `crmhub-base.css` (reglas) y un archivo de tokens `--ch-*`. `src/crmhub-boot.js` cambia el `<link id="main-stylesheet">` y guarda la elección en `localStorage`.
- **PWA**: `manifest.webmanifest`, `sw.js` (alcance `/`, requiere las cabeceras `Service-Worker-Allowed` del vhost, ya en `templates/apache-vhost.conf.tpl`). Caché: `/client/*` primero caché; API GET red primero con copia **por usuario** (no se guardan `CrmHub/integrations`, adjuntos ni administración); escrituras sin red -> 503 claro.
- **Nueva versión**: `bin/crmhub` escribe `client/custom/version.json` (hash del contenido) en cada despliegue; el navegador lo consulta cada 5 min y al volver a la pestaña, y muestra el aviso + notificación de escritorio si se concedió el permiso. **Web Push con la app cerrada**: `hub-service/app/push.py` (VAPID RFC 8292, `pywebpush`; claves en la tabla `kv`, suscripciones en `push_subscriptions`). El navegador se suscribe desde el botón del megáfono; `bin/crmhub tenant:upgrade` envía el aviso «nueva versión» a los dispositivos del tenant solo si cambió el contenido (`NO_PUSH=1` lo omite). iOS exige la app instalada.
- Íconos de la app: `client/custom/img/pwa-*.png`.

## Canales, formularios y Telegram

- **WhatsApp multi-proveedor** (`hub-service/app/whatsapp.py`): Evolution API, Meta Cloud API y Gupshup; uno activo por empresa. Entrantes: `/hub/evolution`, `/hub/whatsapp-cloud` (verificación GET + firma `X-Hub-Signature-256` si hay App Secret), `/hub/gupshup`.
- **Telegram** (`telegram.py`): `Guardar y conectar` hace `getMe` + `setWebhook` con secreto propio (`/hub/telegram`); enlace `t.me/<bot>?start=<código>` de un solo uso liga el chat a un lead; envío desde el CRM.
- **Formularios web** (`forms.py`): configuración en `tenants.settings.forms`; páginas públicas `https://<dominio>/f/<slug>` (el vhost las proxea a `/v1/public/<tenant>/forms/`); honeypot, tiempo mínimo, límite por IP, escape de HTML, consentimiento en nota, deduplicación por teléfono/correo.
- Las URLs base de Telegram/Meta/Gupshup son variables de entorno (`TELEGRAM_API_BASE`, `META_GRAPH_BASE`, `GUPSHUP_BASE`) solo para poder probar con servidores simulados.


## SMS, llamadas, proveedor genérico y mensajes masivos
- **Proveedor genérico HTTP** (`httpgen.py`): WhatsApp, SMS y llamadas contra cualquier API REST (plantillas con `{{to}} {{to_plain}} {{text}} {{from}} {{name}} {{lead_id}} {{agent}} {{agent_phone}}`, cuerpo json/form/query, auth ninguna/Bearer/Basic/cabecera, mapeo de entrantes por ruta JSON). Guarda anti-SSRF: bloquea loopback/privadas/metadata salvo `ALLOW_LOOPBACK_URLS=1` (solo pruebas).
- **Twilio** (`twilio.py`, `sms.py`, `voice.py`): SMS/WhatsApp y click-to-call (llama al asesor y luego lo conecta con el cliente; grabación opcional; estado en `/hub/voice-status`). La troncal SIP vive en la central/proveedor, no en el CRM. `TWILIO_BASE` solo para pruebas.
- **Mensajes masivos** (`broadcast.py`, tablas `broadcasts`/`broadcast_items`, `sql/003_broadcast.sql`): audiencia resuelta en PHP con ACL, worker con ritmo por minuto, programación, pausa/cancelación, omite `doNotContact`, respuesta `BAJA` activa «no contactar», pie legal automático.
- El rol «Integración API (Hub)» necesita `assignmentPermission/userPermission = all` y lectura de `User` para crear llamadas asignadas al asesor (`bin/seed_tenant.py`, `bin/ui_settings.py`).

## Entornos y paso a producción

| Entorno | Host | Tenant | Puerto local |
|---|---|---|---|
| dev | https://dev-crm.digitalalliancehub.site | `dev` | 8200 |
| prod | https://crm.digitalalliancehub.site | `prod` | 8201 |

Flujo: cambiar `customizations/` o `hub-service/` -> probar en `dev` (`bin/crmhub tenant:upgrade dev`) -> commit -> `bin/crmhub tenant:upgrade prod`
(y `docker compose up -d --build hub-service` si cambió el servicio). Los vhosts versionados están en `apache/` (certbot renueva solo).
## Respaldos y restauración

`bin/backup` (cron diario 02:30 en `/etc/cron.d/crmhub`, log en `/var/log/crmhub-backup.log`) guarda en `/var/backups/crmhub/<fecha>/`:
BD maestra + una BD por tenant (`*.dump`, formato custom), `config.tar.gz` (`.env` y de cada tenant, con secretos) y los adjuntos de cada tenant. Verifica cada dump y borra lo de más de 14 días.
Restaurar un tenant (ejemplo prod):

```bash
docker exec -i crmhub-postgres pg_restore -U crmhub_admin -d tenant_prod --clean --if-exists --no-owner < /var/backups/crmhub/<fecha>/tenant_prod.dump
tar -xzf /var/backups/crmhub/<fecha>/crmhub_prod_data.tar.gz -C /ruta/temporal   # adjuntos -> volumen crmhub_prod_data
```
Las copias están en el mismo servidor: para protegerse de la pérdida del disco, sincroniza `/var/backups/crmhub` a un almacenamiento externo.

## Selección de modelo (benchmark en `hub-service/bench/`, CPU 6 núcleos, sin GPU)

| Modelo | Extracción (3 reportes) | Tiempo | Narrativa |
|---|---|---|---|
| llama3.2:3b | 12/12 | 80 s | inventó una cita del cliente |
| qwen2.5:7b-instruct | 12/12 | 254 s | correcta, lenta |
| **llama3.1:8b** | 12/12 | 120 s | correcta, sin alucinar |

Los reportes del benchmark son sintéticos y limpios; valida con PDFs reales de Datacrédito antes de confiar en la extracción.

## Datacrédito: integración

No hay scraping del portal: iniciar sesión automatizada con credenciales en un portal de buró contraviene sus términos y es riesgoso con datos personales (Ley 1581). La vía soportada es el PDF autorizado por el cliente (implementado) o el servicio web oficial de Experian/Datacrédito, que requiere contrato.

## Pendiente / límites conocidos

- Dashboard de rendimiento por equipo y métricas de licencia dentro del CRM (hoy: `GET /v1/admin/metrics` con `X-Admin-Token`).
- PDFs escaneados: requieren OCR (hoy se marca el lead como "Revisión Manual" con el motivo).
- Límite `max_users` aún no se aplica dentro de EspoCRM.
- La regla UFW `172.28.0.0/24 -> 172.28.0.1:8190` es necesaria para que los tenants lleguen al Hub Service.

## Centro de control (empresas, claves y modo lectura)
Landing propia (`https://control.<dominio>`) para operar sin pasar por la consola: crear empresas nuevas **solo en producción**, ver su estado, cambiar contraseñas de usuarios y entrar en **modo lectura**.
- **Desarrollo es la base.** `bin/crmhub release:publish` (o el botón «Publicar desde desarrollo») congela una copia del código y las semillas en `releases/<id>/`; esa copia es la réplica con la que se crean las empresas nuevas (`tenant:create --release current`). Las empresas existentes solo cambian cuando se pulsa «Actualizar a la base actual».
- **Servicios:** `control-service/` (FastAPI, contenedor `crmhub-control`, solo 127.0.0.1:8195 detrás de Apache + SSL) y `bin/control-worker` (servicio systemd en el servidor). La web **no ejecuta nada**: encola trabajos en `control_jobs` y el ejecutor solo corre una lista cerrada (crear, actualizar, publicar base, suspender, reactivar) con parámetros validados y sin shell.
- **Instalación:** `bin/crmhub control:install` (contenedor + Apache + ejecutor; imprime la clave inicial) y luego certbot para el host. Cambiar clave: `bin/crmhub control:password`.
- **Seguridad:** clave con scrypt, sesión firmada (12 h, HttpOnly/Secure/SameSite=Strict), cabecera anti-CSRF, 5 intentos fallidos = bloqueo de 10 min por IP, auditoría en `control_audit`.
- **Modo lectura:** el Centro crea (si falta) el rol «Soporte (solo lectura)» y el usuario `soporte-lectura` en la empresa, le pone una clave nueva y emite un código de un solo uso (90 s). `/?support=<código>` en el sitio de la empresa lo canjea (`CrmHubSupport/exchange` → hub `/v1/support/exchange`) e inicia sesión solo; el rol impide cualquier escritura (el API responde 403) y un aviso fijo lo indica.
- **Más del Centro:** visor de **modo lectura incrustado** en la propia página (la empresa solo acepta ser enmarcada por el host del Centro: `frame-ancestors` en su vhost de Apache); **Correo general** (SMTP del sistema para prestarlo a empresas sin correo: se aplica a su configuración de salida y activa «Olvidé mi contraseña» del login); **Proveedores aliados** (Twilio, Gupshup, Evolution, SMS/voz/WhatsApp por API HTTP) que se asignan por empresa (`services:<slug>` + ajustes del Hub); cambio de contraseña propio, recuperación por correo y «recordar usuario» con bienvenida.
- **Login de las empresas:** «Recordar mi usuario» y pantalla de bienvenida (solo contraseña); el enlace «Olvidé mi contraseña» de Espo aparece cuando la empresa tiene correo de salida y valida usuario + correo antes de enviar.
