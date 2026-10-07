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
- **Reasignación**: `POST /CrmHub/reassign` (admin, o rol con permiso de asignación; *team* = solo usuarios de sus equipos). Deja nota en el historial.

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
