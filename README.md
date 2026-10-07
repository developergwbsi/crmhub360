# Crm Hub 360

CRM multi-empresa sobre EspoCRM 10 + PostgreSQL, con IA local (Ollama) para leer reportes de crédito y asistir a los comerciales. Idioma por defecto: español (`es_ES`), moneda COP, zona `America/Bogota`.

## Arquitectura

| Pieza | Detalle |
|---|---|
| Aislamiento | **Una BD PostgreSQL + un rol por empresa** (`tenant_<slug>`), una instancia EspoCRM por empresa (web + daemon + websocket). EspoCRM no soporta schemas nativos; esto evita parchear el núcleo. |
| Registro de licencias | BD `crmhub_master` (tabla `tenants`: plan, máx. usuarios, vencimiento, estado). `suspended`/`expired` bloquea IA e ingesta. |
| Hub Service | FastAPI en `hub-service/`. Red host, enlazado a `172.28.0.1:8190` (gateway de `crmhub_net`), porque Ollama solo escucha en `127.0.0.1`. |
| IA | Ollama, modelo `OLLAMA_MODEL` (por defecto `llama3.2:3b`). El LLM **solo extrae datos**; la decisión de pre-aprobación son reglas deterministas en `hub-service/app/credit.py` (umbrales por env). |
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

## Pendiente / límites conocidos

- Dashboard de rendimiento por equipo y métricas de licencia dentro del CRM (hoy: `GET /v1/admin/metrics` con `X-Admin-Token`).
- PDFs escaneados: requieren OCR (hoy se marca el lead como "Revisión Manual" con el motivo).
- `llama3.2:3b` es débil para extracción y puede inventar citas en el análisis de sentimiento; para producción conviene un modelo mayor (`OLLAMA_MODEL`).
- Límite `max_users` aún no se aplica dentro de EspoCRM.
- La regla UFW `172.28.0.0/24 -> 172.28.0.1:8190` es necesaria para que los tenants lleguen al Hub Service.
