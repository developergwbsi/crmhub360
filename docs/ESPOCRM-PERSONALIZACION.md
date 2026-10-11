# Personalización de EspoCRM

Todo lo propio de Crm Hub 360 dentro de EspoCRM vive en `customizations/` y **se copia a cada empresa** con `bin/crmhub tenant:upgrade <slug>` (no se modifica el núcleo de Espo). La referencia automática de archivos está en [`referencia/MODULOS.md`](referencia/MODULOS.md) y de rutas en [`referencia/RUTAS-ESPO.md`](referencia/RUTAS-ESPO.md).

## Servidor (`customizations/Espo/Custom/`)

| Carpeta | Contenido |
|---|---|
| `Controllers/CrmHub.php` | Controlador principal: todas las acciones `/CrmHub/*` (métricas, asignación, integraciones, líneas, agentes, copias de leads, push…). Casi todas llaman al Hub con `hubCall()` y las de administración empiezan con `$this->admin()`. |
| `Controllers/CrmHubSupport.php` | Canje del código de **modo lectura** del Centro de control. |
| `Controllers/Lead.php` | Ajustes del controlador nativo de Lead. |
| `Hooks/Lead/AutoAssign` | `beforeSave`: asigna asesor (campaña → equipos → menor carga) o decide reparto hacia un comercial virtual. |
| `Hooks/Lead/RunProcesses` | `afterSave`: avisa al Hub para correr los procesos del lead (bienvenida, primer contacto…). |
| `Hooks/Lead/NotifyNew` | `afterSave`: campana y *push* de lead nuevo. |
| `Hooks/Email/BrandOnSend` | Envuelve con la marca de la empresa todo correo que sale de Espo. |
| `Services/LeadAssigner` | Algoritmo de asignación y balanceo. |
| `Services/HubClient` | Cliente HTTP hacia el Hub con el token de la empresa. |
| `Services/EmailBrand` | HTML de marca y firma. |
| `Services/LeadTimeline` | Línea de tiempo unificada del lead. |
| `Resources/routes.json` | Rutas REST propias. |
| `Resources/metadata`, `i18n`, `layouts` | Campos del Lead (crédito, calificación, `originForm`…), textos en español y diseños. |

El usuario **API del Hub** es un rol limitado: no puede borrar leads ni crear notificaciones directamente; para eso existen acciones propias (`notifyTeam`, etc.) que verifican `isApi()`.

## Cliente (`customizations/client/custom/`)

| Carpeta | Contenido |
|---|---|
| `src/` | Vistas y utilidades JS (cada archivo trae una cabecera que explica su función). `crmhub-boot.js` arranca el tema, el modo oscuro, el aviso/auto-actualización y los decoradores de tablas y estados vacíos. |
| `src/views/` | Pantallas (`integrations`, `agent`, `broadcasts`, `processes`, `manual`, `assignment`, `pipeline`, `knowledge`, `simulator`…), paneles del lead, modales (WhatsApp, teléfono, correo) y dashlets. |
| `res/templates/` | Plantillas Handlebars (`.tpl`), incluido el **manual** (`manual.tpl`). |
| `css/` | `crmhub-base.css` (reglas, prefijo `ch-`), temas claro y oscuro y tokens `--ch-*`. |
| `sw.js`, `manifest.webmanifest`, `img/` | PWA e íconos. |
| `version.json` | Lo escribe el despliegue (hash del contenido). |

## Tema, modo oscuro y PWA

`crmhub-theme.css` (claro, sobre `espo.css`) y `crmhub-theme-dark.css` (sobre `dark.css`) importan `crmhub-base.css`. `crmhub-boot.js` cambia la hoja `main-stylesheet` y guarda la elección en `localStorage`. El *service worker* exige las cabeceras `Service-Worker-Allowed` que ya incluye el vhost.

## Configuración guardada en Espo

Balanceo y estados: `crmhubAssignMethod`, `crmhubAssignCap`, `crmhubStatusNew|Review|Qualified`, `crmhubClosedStatuses`, `crmhubCartera`. Menú y ajustes de interfaz los aplica `bin/ui_settings.py` (`tenant:ui`); las semillas de roles, equipo y usuario API están en `bin/seed_tenant.py`.
