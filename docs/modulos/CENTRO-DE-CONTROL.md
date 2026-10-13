# Centro de control

Código: `control-service/app/main.py` (+ `static/` con `app.js`, `empty.js`, `table.js`, `style.css`, `index.html`), `bin/control-worker`, tablas `control_*`. Sitio `https://control.<dominio>`.

## Qué permite

Crear empresas **solo en producción**, ver su estado, suspender/reactivar, cambiar contraseñas de usuarios, entrar en **modo lectura**, publicar la base de desarrollo, y administrar por empresa los **servicios y licencias**.

## Servicios y licencias por empresa (`settings.limits` y afines)

| Campo en Servicios | Efecto |
|---|---|
| Plantillas por usuario | `limits.templates` |
| Comercial virtual (`off`/`auto`) | `limits.agent` |
| Cantidad de comerciales virtuales | `limits.agents` |
| Mensajes masivos de WhatsApp | `limits.wa_bulk.max` y `every_s` |
| Motor de IA | proveedor «ai» asignado (`put_services`) |
| Correo | propio o el correo general de la plataforma |
| WhatsApp / SMS / Voz | proveedores aliados asignados |
| Consultas externas, cartera | `lookups`, módulo cartera |

## Cómo se ejecutan las acciones

La web **no ejecuta nada**: encola un trabajo en `control_jobs` y `bin/control-worker` (servicio systemd) corre una **lista cerrada** (crear, actualizar, publicar base, suspender, reactivar) con parámetros validados y sin shell. Todo queda en `control_audit` (la columna *Empresa* muestra el nombre, no el identificador).

## Base de producción y actualizaciones

*Dev es la base:* `release:publish` congela `customizations/` en `releases/<id>/`; esa copia es con la que se crean empresas nuevas. Las existentes solo cambian al pulsar «Actualizar a la base actual» (o `tenant:upgrade`). Ver [VERSIONES](../VERSIONES.md).

## Monitor de WhatsApp y QR de las líneas

La pestaña **Monitor WhatsApp** vigila de extremo a extremo cada línea de Evolution de las empresas (envío y recepción) con una línea de pruebas que responde sola, abre alertas (pantalla, correo y WhatsApp), reinicia la instancia y permite **escanear el QR de cualquier empresa desde el Centro**. Detalle en [MONITOR-WHATSAPP](MONITOR-WHATSAPP.md).

## Gestión de una empresa (lista + detalle)
Al abrir una empresa en la pestaña **Empresas**, la lista queda **a la izquierda** (con buscador) y el detalle **a la derecha**: se cambia de empresa pulsando otra en la lista, sin cerrar nada. **Pantalla completa** oculta la lista para ver todo el detalle; **Cerrar** (o «Lista») vuelve a la lista completa. Pestañas del detalle:
- **Resumen**: datos, acciones (abrir sitio, modo lectura, actualizar, suspender, credenciales, cambiar nombre, correo) y usuarios.
- **Servicios y módulos**: proveedores (WhatsApp, SMS, llamadas, correo) y módulos adicionales (cartera, comerciales virtuales, plantillas, mensajes masivos, videollamadas, consultas, IA).
- **WhatsApp**: líneas de Evolution de la empresa con su estado; QR y prueba de envío.
- **Consumo y facturación**: costo, precio y margen del periodo por canal y por día (base para facturar; aún no se emiten facturas).
- **Historial de cambios**: lo hecho sobre la empresa (`GET /api/audit?target=<slug>`) y sus trabajos del servidor (`GET /api/jobs?slug=<slug>`).

## Líneas de WhatsApp (inventario)

La pestaña **Líneas WhatsApp** (`control-service/app/walines.py`) lista las instancias de Evolution que administramos —las creadas aquí (`control_settings` «wa_pool») y las que ya usan las empresas— con su número, estado y empresa asignada. Acciones: **Nueva línea** (crea la instancia sin webhook activo y muestra su QR), **QR / Reiniciar / cambiar de número**, **Asignar o Mover** (como *principal* —claves planas `wa_provider`/`evolution_*`, reemplaza a la anterior, que queda libre— o *adicional* —`settings.lines`—), **Quitar** y **Eliminar** (solo líneas libres). La empresa recibe la clave **propia** de la instancia y su webhook apunta a `https://<empresa>/hub/evolution`; al quitar/mover la línea el webhook se desactiva. Cuando la línea queda conectada, el diálogo del QR muestra **Probar el envío** (`POST /api/whatsapp/{slug}/test` y `/api/wa-lines/{name}/test`): envía un mensaje al número indicado. Una línea (teléfono) no puede ser a la vez de una empresa y la **línea de pruebas** del [monitor](MONITOR-WHATSAPP.md).

## Modo lectura de soporte

Crea (si falta) el rol «Soporte (solo lectura)» y el usuario `soporte-lectura`, genera una clave nueva y un código de un solo uso (90 s) que `/?support=<código>` canjea en la empresa (`CrmHubSupport/exchange` → Hub `/v1/support/exchange`). El rol impide toda escritura y un aviso fijo lo indica. También se puede ver incrustado en la página del Centro.

## Seguridad

Clave con scrypt, sesión firmada (12 h, HttpOnly/Secure/SameSite=Strict), cabecera anti-CSRF, 5 intentos fallidos = bloqueo de 10 min por IP, auditoría completa. Instalación: `bin/crmhub control:install`; cambiar la clave: `bin/crmhub control:password`. Reconstruir: `docker compose build control && docker compose up -d control`.

## Interfaz

Tablas con búsqueda, paginación, encabezado fijo y desplazamiento interno (`table.js`); ilustraciones animadas cuando no hay datos (`empty.js`); aviso de nueva versión.
