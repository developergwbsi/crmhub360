# Arquitectura de Crm Hub 360

Crm Hub 360 es un CRM **multi-empresa** (cada empresa es un *tenant*) construido sobre **EspoCRM 10**, con un servicio propio (**Hub Service**) que aporta IA, mensajería, formularios y automatización, y un **Centro de control** para operar la plataforma. Todo el producto está en español (`es_ES`, COP, `America/Bogota`).

## Vista general

```
                    Internet (Apache + SSL, certbot)
   ┌──────────────────────┬──────────────────────────┬─────────────────────────┐
   │ <empresa>.dominio    │ control.dominio          │ /hub/* webhooks y /f/*  │
   │ (EspoCRM del tenant) │ (Centro de control)      │ formularios públicos    │
   └──────────┬───────────┴────────────┬─────────────┴───────────┬─────────────┘
              │                        │                         │
   ┌──────────▼───────────┐  ┌─────────▼──────────┐   ┌──────────▼──────────┐
   │ crmhub-<slug>        │  │ crmhub-control     │   │ crmhub-hub-service  │
   │ crmhub-<slug>-daemon │  │ FastAPI + static   │   │ FastAPI (host net)  │
   │ crmhub-<slug>-websock│  │ 127.0.0.1:8195     │   │ 172.28.0.1:8190     │
   └──────────┬───────────┘  └─────────┬──────────┘   └──────────┬──────────┘
              │   PHP → HubClient      │ cola control_jobs       │ Ollama/Claude/OpenAI
              └──────────────────────► │ (bin/control-worker)    │ WhatsApp/SMS/Voz/Email
                          ┌────────────▼──────────────────────────▼───────┐
                          │ PostgreSQL 16 (crmhub-postgres)               │
                          │  crmhub_master: tenants, licencias, kv, tablas│
                          │  del Hub y del Centro                         │
                          │  tenant_<slug>: una BD y un rol por empresa   │
                          └───────────────────────────────────────────────┘
```

## Piezas

| Pieza | Dónde | Responsabilidad |
|---|---|---|
| **EspoCRM por empresa** | contenedores `crmhub-<slug>` (web), `-daemon` (cron/colas), `-websocket` (tiempo real) | CRM: leads, kanban, tareas, correo, usuarios y roles. Se personaliza copiando `customizations/` (ver [ESPOCRM-PERSONALIZACION](ESPOCRM-PERSONALIZACION.md)). |
| **Hub Service** | `hub-service/` (FastAPI, red *host*) | IA y reglas de crédito, calificación, ingesta de canales, mensajería multi-proveedor, comercial virtual, formularios, procesos, notificaciones push. Una sola instancia atiende a todas las empresas. |
| **Centro de control** | `control-service/` + `bin/control-worker` | Alta de empresas, licencias, servicios por empresa, proveedores aliados, modo lectura de soporte. La web **no ejecuta comandos**: encola trabajos y el worker (systemd) ejecuta una lista cerrada. |
| **PostgreSQL** | `crmhub-postgres` | Una BD maestra y **una BD + un rol por empresa** (EspoCRM no soporta schemas nativos; esto aísla sin parchear el núcleo). |
| **CLI de plataforma** | `bin/crmhub` | `init`, `up`, `tenant:*`, `release:*`, `control:*`, `vhost:*`. |
| **Apache** | `apache/` y `templates/apache-vhost.conf.tpl` | SSL, proxy de la app, `/ws`, `/hub/*` y `/f/*`. |

## Aislamiento entre empresas

- BD y rol propios (`tenant_<slug>`), contenedores propios y archivos propios (`tenants/<slug>/`, ignorado por git).
- El Hub identifica a la empresa por **token de tenant** (`tenants.hub_token`) y todo dato del Hub lleva columna `tenant`.
- El *websocket* de cada empresa usa su propio DSN de ZeroMQ (`crmhub-<slug>-websocket`); antes compartían nombre y se cruzaban las notificaciones (corregido en `templates/tenant-compose.yml.tpl`).
- Licencia: `tenants.status` (`active`/`suspended`/`expired`); si no está activa se bloquea IA e ingesta.

## Ajustes por empresa (`tenants.settings`, JSONB)

El Hub guarda la configuración de cada empresa en una sola columna JSONB. Las claves principales:

| Clave | Contenido |
|---|---|
| `limits` | Licencia que fija el Centro: `templates` (plantillas por usuario), `agent` (`off`/`auto`), `agents` (cantidad de comerciales virtuales), `wa_bulk` (`max` por campaña y `every_s` entre mensajes). |
| `mailout`, `mailbox` | SMTP de salida («como el usuario») e IMAP del buzón de entrada. |
| `lines`, `line_meta`, `line_default` | Líneas de mensajería por canal (WhatsApp/SMS/voz/Telegram) con interruptor, línea principal y metadatos. Ver [MENSAJERIA](modulos/MENSAJERIA.md). |
| `agents`, `agent`, `dispatch` | Comerciales virtuales y su reparto. Ver [COMERCIAL-VIRTUAL](modulos/COMERCIAL-VIRTUAL.md). |
| `forms` | Formularios web de captación. Ver [FORMULARIOS](modulos/FORMULARIOS.md). |
| `services` | Servicios y filtros de calificación de leads. |
| `ai` | Motor de IA de la empresa (proveedor propio o el de la plataforma). |
| `lookups` | Consultas externas habilitadas. |
| `wa_provider`, `evolution_*`, `meta_*`, `gupshup_*`, `twilio_*`, `generic_*`, `telegram_*`, `fb_page_token` | Credenciales y proveedores (nunca se devuelven a la interfaz). |
| `processes` | Procesos automáticos al crear un lead. |

## Tablas propias (BD maestra)

`tenants`, `kv` (claves VAPID y otros), `push_subscriptions`, `broadcasts`/`broadcast_items` (mensajes masivos), `wa_routes`/`wa_lids` (qué usuario escribió a qué cliente y por qué línea), `agent_leads`/`agent_events`/`agent_dispatch`/`agent_usage` (comercial virtual), `process_runs`, `doc_runs`, `ai_jobs`/`ai_usage`, `kb_notes`/`kb_insights` (banco de conocimiento), `sim_runs`/`sim_events` (simulador), `user_templates`, y del Centro: `control_jobs`, `control_audit`, `control_releases`, `control_settings`, `control_resets`, `support_codes`. Los scripts iniciales están en `hub-service/sql/`; otras tablas del Hub se crean al arrancar o al primer uso (`CREATE TABLE IF NOT EXISTS`, p. ej. `agent.ensure_schema`).

## Flujos principales

### Entra un lead (formulario, WhatsApp, Facebook, API)
1. **Ingesta** (`ingest.py`, `forms.py`): normaliza el teléfono (E.164, +57 por defecto), busca duplicados por teléfono/correo y crea o actualiza el `Lead` vía API de EspoCRM.
2. **Hooks de Espo** al guardar: `AutoAssign` (beforeSave) decide asesor con `LeadAssigner` o reparte hacia un comercial virtual; `RunProcesses` (afterSave) avisa al Hub; `NotifyNew` (afterSave) crea la campana y el *push*.
3. **Procesos** (`processes.py`): correo de bienvenida, primer mensaje, calificación… según configure la empresa.
4. **Comercial virtual** (`agent.py`): si el lead le corresponde, escribe, sigue y escala a una persona cuando hace falta.
5. **Tiempo real**: el navegador recibe `newNotification` por websocket y actualiza listas y paneles sin recargar.

### Mensajería saliente
`whatsapp.py`/`sms.py`/`voice.py`/`telegram.py`/`mailout.py` resuelven la **línea efectiva** con `lines.effective()` y delegan en el proveedor. Ver [MENSAJERIA](modulos/MENSAJERIA.md).

## Patrón «overlay» (sustituir ajustes sin tocar el código que los usa)

`lines.effective(tenant, canal, línea)` y `agent.for_agent(tenant, agente)` devuelven una **copia del tenant** con los ajustes de esa línea o de ese comercial virtual superpuestos. Todo el código existente (`provider(tenant)`, `config(tenant)`…) sigue funcionando sin cambios; ambas funciones son idempotentes (marcas `_res`/`_agent`).

## Frontend

El cliente es el de EspoCRM más `customizations/client/custom/` (vistas propias, temas claro/oscuro, PWA, *service worker*). Se carga una vez por sesión y **solo recoge código nuevo al recargar**: por eso existe el aviso de nueva versión y la **actualización automática cuando la pantalla está en reposo** (`crmhub-boot.js`, `version.json`). Detalle en [TIEMPO-REAL](modulos/TIEMPO-REAL.md).

## Seguridad (resumen)

- Secretos de terceros solo en `tenants.settings` (servidor); la interfaz recibe indicios (`…abcd`), nunca el valor.
- Formularios públicos: honeypot, tiempo mínimo, límite por IP, escape de HTML, consentimiento registrado.
- Proveedor HTTP genérico con protección anti-SSRF.
- Centro de control: scrypt, sesión firmada, CSRF, bloqueo por intentos, auditoría (`control_audit`), lista cerrada de trabajos.
- El rol de la API del Hub está limitado; las acciones sensibles (`CrmHub/notifyTeam`, etc.) verifican que quien llama sea el usuario API.
