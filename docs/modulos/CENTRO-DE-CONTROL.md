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


## Motor comercial (vista maestra de la prospección de IA)

Pestaña **Motor comercial** (`control-service/app/engine_cc.py`, `static/app.js → drawMotor`). Lee las tablas del Hub (`agent_events`, `agent_leads`, `prospects`, `dnc`, `growth_log`) y muestra, para todas las empresas: contactados, respondieron, tasa, demos agendadas, escalados, mensajes que esperan aprobación, errores y alertas (prospección activa en modo prueba, errores altos, muchos envíos sin respuesta, empresa pausada); además las variantes que mejor responden, los nichos y los ajustes recientes de la optimización diaria. Al abrir una empresa: sus comerciales virtuales (encender/apagar), estado de sus leads, aprobaciones pendientes con enlace al lead y actividad reciente.

**Interruptor de emergencia:** *Pausa de emergencia* (global, `control_settings.engine_paused`) o *Pausar esta empresa* (`settings.engine_paused`). El Hub (`agent.engine_paused`) deja de ejecutar a los comerciales virtuales de inmediato (no se envían ni respuestas ni seguimientos y la optimización diaria tampoco corre); los mensajes pendientes se conservan y se retoman al reanudar. Todo queda en el historial de cambios del Centro. Endpoints: `GET /api/engine/overview`, `GET /api/engine/companies/{slug}`, `POST /api/engine/pause`, `POST /api/engine/companies/{slug}/pause`, `POST /api/engine/companies/{slug}/agents/{id}/enabled`.


## Proveedor de correo con buzón de respuestas (Resend y similares)

Un proveedor de correo (*Proveedores aliados → correo*) puede traer, además del SMTP de salida, un **buzón de respuestas**: `reply_user`, `reply_host` (IMAP) y `reply_password`. Al asignarlo a una empresa (`set_company_mail` → `set_company_mailbox`) el Hub **envía por el SMTP** del proveedor (p. ej. `smtp.resend.com`, 465 SSL, usuario `resend`, contraseña = API key; remitente de un dominio verificado) y **lee por IMAP el buzón de respuestas**; el `Reply-To` de cada correo es el alias `buzón+<idUsuario>@dominio` de ese buzón (`mailout.plus_alias` usa `settings.mailout.reply_address`). Sin buzón de respuestas todo funciona como antes (el mismo buzón envía y recibe).

**Respuestas por el correo entrante de Resend (sin buzón IMAP).** Alternativa para Resend: en el dominio se activa «Enable Receiving» (registro MX que muestra Resend) y se crea un webhook `email.received` hacia `https://<dirección de la empresa>/hub/resend-mail` (en el Hub: `POST /v1/ingest/<empresa>/resend-mail`). El secreto del webhook (`whsec_…`) se pega en el campo `inbound_secret` del proveedor (deja vacío el buzón de respuestas). Al asignarlo, `settings.mailout` queda con `inbound_secret`, `plus: true` y no hay buzón IMAP: el `Reply-To` es `remitente+<idUsuario>@dominio` y cualquier alias llega a Resend. El Hub (`resend_inbound.py`) verifica la firma Svix (HMAC-SHA256, tolerancia 5 min), pide el correo completo a `GET https://api.resend.com/emails/receiving/<id>` con la API key y lo importa con la misma lógica del lector IMAP (`mailbox.import_message`).


## Principio: cada empresa puede traer lo suyo (correo, WhatsApp, SMS, llamadas, IA)
Lo que ofrece el sistema es un **servicio prestado**; si la empresa prefiere, configura **el suyo** y el sistema no interviene. En el Centro de control, *Empresas → Servicios*, cada función tiene el modo «Propio» o «Prestado». WhatsApp, SMS, llamadas y Telegram los configura la empresa en *Integraciones → Canales*; el motor de IA, en su propia clave; y el **correo** en *Integraciones → Correo* (`views/mail-config.js`, Hub `/v1/mail-config/{main|cold}`), con dos funciones independientes:
- **Correo principal** (`settings.mailout` + `settings.mailbox`): SMTP de salida y buzón IMAP de entrada. Servicio `mail`.
- **Correo en frío** (`settings.mailout_cold` + `settings.mailbox_cold`): remitente aparte en otro dominio para la prospección y el buscador; servicio `mail_cold` = `off` | `own` | `p<id>` (proveedor prestado; Resend se rechaza). 
La empresa solo edita su correo si el Centro de control lo dejó en «Propio» (el Hub lo valida). Los servidores SMTP/IMAP que escribe la empresa no pueden apuntar a direcciones internas (`mailcfg.check_public_host`). Las contraseñas nunca se devuelven al navegador. Al volver a aplicar «Propio» desde el Centro, la configuración propia de la empresa **se conserva** (`source: own`); al prestar un proveedor se reemplaza (`source: loaned`).
