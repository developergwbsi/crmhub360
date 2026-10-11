# Tiempo real, notificaciones y actualización de la app

Código: `customizations/client/custom/src/{crmhub-boot,live-list,live-panel}.js`, hooks PHP `NotifyNew`, `push.py` del Hub, `sw.js`.

## Qué se actualiza solo

- **Listas, tablero y paneles:** `live-list.js` / `live-panel.js` se suscriben al tema de websocket de Espo `newNotification`; al llegar un lead (o cualquier evento) recargan en silencio. Una vista se engancha con `Live.feed(this, () => this.load(true))` y se suelta en `onRemove` con `Live.unfeed(this)`. Incluye el **Panel gerencial** y el historial de actividades del lead.
- **Campana:** `NotifyNew` crea una `Notification` (tipo `Message`) para administradores y envía *push* al asesor asignado. El formulario web añade «Nuevo registro» (`CrmHub/notifyTeam`).
- **Push con la app cerrada:** `push.py` (VAPID, `pywebpush`), suscripciones en `push_subscriptions`; el navegador se suscribe con el botón del megáfono. iOS exige la app instalada.

## Websocket por empresa

Cada empresa tiene su contenedor `-websocket` con su **propio DSN de ZeroMQ** (`templates/tenant-compose.yml.tpl`). Con un nombre compartido las notificaciones de una empresa llegaban a otra.

## Nueva versión y actualización automática

`tenant:upgrade` escribe `client/custom/version.json` (hash del contenido). El navegador lo consulta **cada 60 s** y al volver a la pestaña; si cambió, `autoApplyWhenIdle` recarga cuando la pantalla está en reposo (`safeToReload`: sin modales, formularios editándose ni borradores) y, si no es seguro, muestra un aviso. El Centro de control tiene su propio aviso (`/api/ui-version`, meta `ui-version`).

## Service worker y PWA

`sw.js` (alcance `/`): código propio y API en *red primero*; `/client/*` desde caché; escrituras sin red devuelven 503 claro; copias por usuario (no se guardan integraciones ni adjuntos). Íconos y manifiesto en `client/custom/img/` y `manifest.webmanifest`.
