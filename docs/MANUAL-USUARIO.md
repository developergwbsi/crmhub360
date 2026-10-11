# Manual de usuario — Crm Hub 360

> Generado desde `customizations/client/custom/res/templates/manual.tpl`, la misma fuente que se muestra dentro del CRM (menú *Manual de usuario*). No lo edites aquí: cambia el `.tpl` y ejecuta `bin/gen-docs`. Cada sección indica los roles que la ven.

## Contenido

- [1. Ingreso y navegación](#1-ingreso-y-navegación)
- [1b. Modo claro/oscuro, instalar la app y trabajar sin internet](#1b-modo-clarooscuro-instalar-la-app-y-trabajar-sin-internet)
- [2. Leads](#2-leads)
- [3. Tablero Kanban](#3-tablero-kanban)
- [4. Filtro del cliente y servicio sugerido](#4-filtro-del-cliente-y-servicio-sugerido)
- [5. Asistente IA](#5-asistente-ia)
- [5b. Llamar y enviar WhatsApp a un lead](#5b-llamar-y-enviar-whatsapp-a-un-lead)
- [6. Canales de captación](#6-canales-de-captación)
- [7. Roles y equipos](#7-roles-y-equipos)
- [7b. Asignación y reasignación de leads](#7b-asignación-y-reasignación-de-leads)
- [7c. Equipos, campañas y organigrama](#7c-equipos-campañas-y-organigrama)
- [7d. Dónde se configuran los estados y el balanceo](#7d-dónde-se-configuran-los-estados-y-el-balanceo)
- [7e. Canales: WhatsApp, Telegram, Meta y llamadas (administradores)](#7e-canales-whatsapp-telegram-meta-y-llamadas-administradores)
- [7g. SMS, llamadas, troncal y otros proveedores (administradores)](#7g-sms-llamadas-troncal-y-otros-proveedores-administradores)
- [7h. Mensajes masivos (envíos a un grupo de leads)](#7h-mensajes-masivos-envíos-a-un-grupo-de-leads)
- [7f. Formularios web de captación (administradores)](#7f-formularios-web-de-captación-administradores)
- [8. Tareas y calendario](#8-tareas-y-calendario)
- [9. Administración (solo administradores)](#9-administración-solo-administradores)
- [5c. Lo que se actualiza solo](#5c-lo-que-se-actualiza-solo)
- [5d. Mis plantillas](#5d-mis-plantillas)
- [5e. Simulador y Banco de conocimiento](#5e-simulador-y-banco-de-conocimiento)
- [5f. Leer documentos (PDF) en el lead](#5f-leer-documentos-pdf-en-el-lead)
- [7i. Mensajes masivos y campañas: en qué se diferencian](#7i-mensajes-masivos-y-campañas-en-qué-se-diferencian)
- [9b. Canales de mensajería: varios proveedores por canal](#9b-canales-de-mensajería-varios-proveedores-por-canal)
- [9c. Comercial virtual: comerciales, entrenamiento y mensajes con opciones](#9c-comercial-virtual-comerciales-entrenamiento-y-mensajes-con-opciones)
- [9d. Reparto de leads entre personas y comerciales virtuales](#9d-reparto-de-leads-entre-personas-y-comerciales-virtuales)
- [9e. Procesos de leads, copias de leads y lectura de documentos](#9e-procesos-de-leads-copias-de-leads-y-lectura-de-documentos)
- [10. Preguntas frecuentes](#10-preguntas-frecuentes)

## 1. Ingreso y navegación

*Visible para: Comercial, Director, Gerente*

1. Entra a la dirección de tu empresa e inicia sesión con tu usuario y contraseña.
2. Cambia tu contraseña la primera vez: menú de tu usuario (arriba a la derecha) → **Preferencias**.
3. El menú lateral izquierdo da acceso a **Leads**, cuentas, contactos, oportunidades, tareas y calendario.
4. **Seguridad de la sesión:** si dejas de usar la pantalla durante **30 minutos** (sin mover el mouse, teclear ni tocar), aparece el aviso «¿Sigues ahí?» y, si no respondes en 60 segundos, la sesión se cierra sola. Al volver verás el inicio de sesión con un aviso. Además, una sesión nunca dura más de **12 horas**, y si cierras el navegador y pasa más de una hora sin usarla, también caduca. Guarda tu trabajo antes de dejar la pantalla sola.
5. Usa la lupa superior para buscar cualquier registro por nombre, teléfono o correo.
6. Con la flecha de abajo a la izquierda puedes **contraer el menú**; al pasar el mouse sobre cada ícono verás su nombre. Si lo abres desde el modo contraído (☰), el contenido se desplaza en vez de taparse.

> El inicio tiene dos pestañas: **Panel gerencial** (indicadores, embudo, servicios, tendencia, origen, rendimiento por asesor y campañas, según tu alcance; puedes cambiar el periodo de 7 días a 12 meses) y **Mi día** (leads recientes, tareas, actividades y la actividad del equipo).


## 1b. Modo claro/oscuro, instalar la app y trabajar sin internet

*Visible para: Comercial, Director, Gerente*

Modo claro u oscuro

El botón de **luna / sol** está siempre visible: en la barra superior (junto a las notificaciones) y también en la pantalla de ingreso. Tu elección se recuerda en ese dispositivo. Si nunca la cambias, se usa la preferencia de tu sistema.

Instalar Crm Hub 360 como aplicación

- **Chrome / Edge (computador):** aparece un botón de **descarga** en la barra superior (o el ícono de instalar en la barra de direcciones). Al instalarla se abre en su propia ventana, con ícono propio.
- **Android:** menú del navegador → *Instalar aplicación*. **iPhone / iPad:** Compartir → *Añadir a pantalla de inicio*.

Trabajar sin conexión

- Si se cae el internet verás un aviso **«Sin conexión»**. Puedes seguir consultando lo que ya habías abierto (leads, listas, tablero, panel, manual); aparecerán los datos de tu última conexión.
- **Los cambios no se guardan sin internet** (crear, editar, enviar WhatsApp, registrar llamadas): el sistema te lo dirá. Cuando vuelva la conexión verás **«Conexión restablecida»** y podrás repetirlos.
- La primera vez que abres la app necesitas internet. Los datos guardados son solo tuyos y de ese dispositivo; no uses esta función en equipos compartidos sin cerrar sesión.

Notificaciones push (aunque la app esté cerrada)

1. Pulsa el botón del **megáfono** en la barra superior (junto al de luna/sol) y acepta el permiso del navegador. Verde = activado en este dispositivo; púlsalo de nuevo para desactivarlo.
2. Actívalo en cada dispositivo donde quieras recibir avisos (computador, celular).
3. Hoy llega el aviso de **nueva versión**: cuando se publica una actualización recibes una notificación en el dispositivo aunque no tengas la app abierta; al tocarla, la app se abre ya actualizada.
4. **iPhone / iPad:** funciona solo si primero **instalas la app** (Compartir → Añadir a pantalla de inicio), con iOS 16.4 o superior.
5. Si no llegan: revisa que el navegador tenga permiso de notificaciones para este sitio y que el sistema no esté en «No molestar». Los administradores pueden enviarse una prueba en **Integraciones → Notificaciones push**.

Avisos de nueva versión con la app abierta

Si estás usando la app cuando sale una versión nueva, aparece abajo a la derecha **«Nueva versión disponible»** con el botón **Actualizar ahora**.


## 2. Leads

*Visible para: Comercial, Director, Gerente*

Un **lead** es una persona interesada en un crédito. Verás solo los leads que tu rol permite (ver sección 7).

Crear un lead manualmente

1. **Leads** → botón **Crear lead** (arriba a la derecha).
2. Completa nombre, teléfono (con indicativo; si no lo pones se asume +57), correo y origen.
3. Guarda. El estado inicial es Nuevo Lead.

Quién lo atiende, de dónde llegó y su identificación

- **Usuario asignado:** si el lead lo atiende un **comercial virtual** (no hay una persona asignada), la tarjeta lo dice: «Comercial virtual · nombre». Si ves «Ninguno», nadie lo atiende todavía.
- **Creado:** muestra de dónde llegó el lead (por ejemplo «Formulario Web: Expediciones a montañas», «WhatsApp»…), no el usuario técnico de la integración. «Modificado» dice «Sistema automático» o «Comercial virtual» cuando el cambio lo hizo el sistema.
- **Identificación (cédula, NIT…):** los formularios y canales automáticos casi nunca la traen. Si falta, el lead guarda una **identificación temporal** (el celular o el correo, según lo configure el administrador) con la marca *Temporal* y el aviso «Identificación temporal» en el encabezado. Cuando abordes al cliente, edita el lead y escribe su documento real: la marca desaparece sola.
- Por regla, **no puedes pasar un lead a «Calificado» ni a «Cierre exitoso» mientras su identificación sea temporal**: primero registra la real. Los comerciales virtuales no se bloquean por esto.

Estados del lead

| Estado | Significado |
|---|---|
| Nuevo Lead | Recién captado, sin gestionar. |
| En Calificación | Se recibió el reporte o los datos del cliente y se está aplicando el filtro. |
| Calificado | El cliente cumple al menos un servicio; ya tiene servicio sugerido. |
| En Enfriamiento/Contactado | Contactado; se espera respuesta o decisión del cliente. |
| Cierre Exitoso | El cliente tomó el crédito. |
| Perdido / Convertido | Descartado, o convertido en cuenta/contacto/oportunidad. |

En el detalle del lead, el **flujo** (*stream*) guarda notas, mensajes de WhatsApp y cambios. Documenta cada contacto allí.


## 3. Tablero Kanban

*Visible para: Comercial, Director, Gerente*

**Cambios de estado:**

cada vez que cambias el estado de un lead (arrastrando la tarjeta o editándolo) debes escribir un

**comentario**

, salvo que ya hayas hecho una

**acción con ese lead**

desde el último cambio (una llamada, un mensaje, un correo, una reunión o una tarea). Todo queda en el panel

**Historial de estados**

del lead: de qué estado a cuál, quién, cuándo y por qué.

> **Ficha rápida:** al pulsar una tarjeta se abre la ficha del lead en un **panel lateral** (la pantalla se divide: el tablero se achica pero sigue visible con todos los estados). Si pulsas Llamar, WhatsApp, SMS, Telegram o Correo, el canal se abre **al lado de la ficha**, así siempre ves con quién hablas y sus datos. Funciona igual en **Leads, Cuentas, Contactos y Oportunidades** (en las tres últimas, con Llamar y Correo). Si un canal no está configurado, el panel lo avisa y te lleva a Integraciones; nunca se abre una ventana aparte. Desde ahí puedes llamar, escribir por WhatsApp, SMS o Telegram, editar, o pulsar **Abrir completo** para ver toda la información en pantalla completa.

Al entrar a **Leads** verás el tablero Kanban: cada columna es un estado. Con los iconos de arriba a la derecha alternas entre el tablero y la lista.

- **Arrastra** una tarjeta a otra columna para cambiar su estado.
- Cada tarjeta muestra el avatar (foto de WhatsApp si existe, o las iniciales), el resultado del filtro, el servicio sugerido, la deuda, el teléfono, el asesor y la antigüedad.
- Cada columna tiene su propio **buscador**: escribe un nombre, teléfono, servicio o asesor y se filtran solo las tarjetas de ese estado (aparece *n/total*). Si hay más tarjetas sin cargar, usa «Mostrar más» primero.
- Usa los filtros de arriba para ver solo los tuyos o los de tu equipo.
- Vuelve a la lista con el icono de lista.


## 4. Filtro del cliente y servicio sugerido

*Visible para: Comercial, Director, Gerente*

Cuando un cliente se registra, el primer paso es aplicar el **filtro**: ¿cumple las condiciones para alguno de los servicios de la empresa (por ejemplo resolución de deudas, consolidación de cartera, préstamo o limpieza de historial)?

Cómo se aplica

1. Abre el lead y edítalo. En **Reporte de crédito (PDF)** adjunta la historia de crédito autorizada por el cliente y guarda. Si no tienes el PDF, puedes escribir a mano el puntaje, las deudas, los acreedores y los **ingresos mensuales**.
2. La IA lee el PDF (uno o dos minutos) y completa: puntaje, deuda total, deuda en mora, cantidad de acreedores, máximo de días de mora, obligaciones castigadas y el detalle de cada obligación.
3. El sistema evalúa los servicios **en orden de prioridad** y deja en el lead: **Resultado del filtro**, **Servicio sugerido** y los **Motivos** (qué condición cumple o no cumple cada servicio).

Resultado del filtro

| Resultado | Significado |
|---|---|
| Califica | Cumple las condiciones de al menos un servicio. El lead pasa a *Calificado* y se muestra el servicio sugerido (y otros posibles). |
| No califica | No cumple ningún servicio activo. |
| Revisión Manual | Faltan datos para decidir (por ejemplo ingresos) o no se pudo leer el PDF. Complétalos y el sistema recalcula solo. |

**Importante:**

la IA ayuda, no decide por ti. Verifica las cifras contra el PDF antes de comunicar algo al cliente. Los PDF escaneados (imagen) no se pueden leer: el lead queda en

*Revisión Manual*

. Sube el PDF original del buró.

> Los servicios y sus condiciones los configura el administrador en **Integraciones → Servicios y filtros**: puede agregar servicios propios, activarlos, cambiar su prioridad y definir condiciones sobre deuda, mora, acreedores, ingresos, puntaje o cualquier campo del lead (por ejemplo, la campaña o el origen).


## 5. Asistente IA

*Visible para: Comercial, Director, Gerente*

En el detalle de un lead, abre el menú de acciones (⋯ junto a **Editar**):

- **IA: Resumir conversación** — viñetas con necesidad, objeciones y próximo paso.
- **IA: Redactar respuesta** — borrador de mensaje de WhatsApp en español.
- **IA: Analizar sentimiento** — sentimiento e interés de compra.

Trabaja sobre la conversación registrada en el flujo del lead. Puede tardar de 15 a 60 segundos.

Revisa y edita el texto antes de enviarlo. El asistente puede equivocarse; no uses sus resultados como única base de una decisión.


## 5b. Llamar y enviar WhatsApp a un lead

*Visible para: Comercial, Director, Gerente*

> **Plantillas de correo:** al redactar un correo verás una galería de plantillas ya listas (bienvenida, seguimiento, propuesta, documentos, recordatorio…). Elige una y el asunto y el mensaje se llenan con el nombre del cliente y el tuyo; puedes modificarlos antes de enviar y guardar tu versión con «Guardar como plantilla». «Administrar» abre la lista completa para editarlas.

> Cada botón abre la interfaz de su canal: **WhatsApp, Telegram y SMS** se ven como una conversación (burbujas, con el historial y la caja para escribir abajo); **Llamar** abre un teléfono con el historial de llamadas (estado, duración, quién y notas); **Correo** muestra los correos enviados y recibidos y permite redactar uno.

Abre el lead: arriba están los botones **Llamar**, **WhatsApp** y **SMS**. Todos necesitan que el lead tenga **teléfono**.

Llamar

1. Pulsa **Llamar**. Si tu administrador conectó una **central o proveedor de llamadas**, escribe tu teléfono o extensión: el sistema **te llama primero** y, al contestar, te comunica con el cliente (la llamada queda registrada y, si está activado, grabada). Si no hay central conectada, se abre el marcador de tu equipo (softphone o app de teléfono) con el número ya cargado.
2. Haz la llamada. Cuando termines, en la ventana **Registrar llamada** elige el **resultado** (Contactado, No contesta, Buzón de voz, Número equivocado, Reagendar), los minutos y tus notas, y guarda.
3. Queda en **Llamadas**, en el **Historial de actividades** y en el flujo del lead.

WhatsApp

1. Pulsa **WhatsApp**. Escribe el mensaje, o usa **Sugerir con IA** para que proponga un borrador según la conversación (revísalo y edítalo).
2. Pulsa **Enviar**. Sale desde el WhatsApp conectado de la empresa y queda en el flujo del lead.
3. Las respuestas del cliente aparecen solas en el flujo del lead.

SMS

1. Pulsa **SMS** (o elige SMS en la ventana de mensajes), escribe el texto y mira el contador: un SMS normal admite 160 caracteres; con tildes especiales o emojis, 70. Si te pasas se envía en varios segmentos.
2. Pulsa **Enviar**: sale desde el número, código corto o remitente que configuró tu administrador, y queda en el flujo del lead. Las respuestas del cliente aparecen solas.
3. Si el cliente responde **BAJA**, queda marcado como «No contactar» y deja de recibir mensajes y campañas.

Telegram

Si el cliente prefiere Telegram (aparece en **Canal preferido** del lead):

1. Si ya te escribió al bot, pulsa **Telegram** y responde igual que por WhatsApp.
2. Si aún no ha abierto el chat, pulsa **Telegram** (o **⋯ → Invitar por Telegram**): se genera un **enlace de un solo uso**. Envíaselo por WhatsApp, correo o llamada; al abrirlo y pulsar *Iniciar*, el chat queda ligado a ese lead.
3. Los mensajes del cliente aparecen solos en el flujo del lead.

> Si WhatsApp responde «no está configurado» o falla el envío, avisa a tu administrador: él lo conecta en Integraciones.


## 6. Canales de captación

*Visible para: Gerente*

| Canal | Qué ocurre |
|---|---|
| Facebook / Instagram Ads | Cada formulario de anuncio crea un lead con origen Facebook Ads o Instagram Ads. |
| WhatsApp | Cada mensaje entrante se registra en el flujo del lead (se crea si no existía). Los números se unifican por teléfono, así que no se duplican. |
| Formulario web | Los envíos de la página web crean leads con origen Formulario Web. |
| Manual | Lo creas tú desde Leads. |

La conexión de cada canal la configura el administrador (ver sección 9).


## 7. Roles y equipos

*Visible para: Director, Gerente*

| Rol | Qué puede ver | Qué puede hacer |
|---|---|---|
| **Comercial** | Solo los leads asignados a él. | Crear y editar sus leads; usar IA y el tablero Kanban. |
| **Director de Equipo** | Los leads de su equipo. | Reasignar leads del equipo, ver el rendimiento del equipo y paneles. |
| **Gerente General** | Todo el sistema. | Gestión completa, analítica global y métricas. |

> Si no ves un lead que esperabas, normalmente está asignado a otro usuario o equipo. Pide a tu director que lo reasigne.


## 7b. Asignación y reasignación de leads

*Visible para: Director, Gerente*

Asignación automática

Cada lead nuevo sin asesor se asigna solo, de forma **balanceada**: recibe el lead el usuario habilitado con **menos leads abiertos** (en empate, quien lleva más tiempo sin recibir uno).

1. Si el lead trae una **campaña**, se reparte entre los usuarios habilitados que están en los **equipos de esa campaña**.
2. Si no tiene campaña, o nadie de esos equipos está habilitado, se reparte entre **todos los usuarios habilitados**.

El asesor recibe una notificación y el lead queda visible también para su director de equipo.

> Se habilita a cada usuario en **Integraciones → Asignación automática de leads** (casilla *Recibe leads*). Desmárcala para sacar a alguien del reparto, por ejemplo en vacaciones. La campaña se liga a un grupo eligiendo sus **Equipos** en la ficha de la campaña.

Reasignar leads o clientes

Los **directores de equipo** (a usuarios de sus equipos), los **gerentes** y los administradores (a cualquiera) pueden reasignar:

- **Un registro:** abre el lead, cliente o contacto y elige **⋯ → Reasignar**.
- **Varios a la vez:** en la lista marca las casillas y usa **Acciones → Reasignar**.

Elige un usuario, o **Automático (el más libre)** para repartirlos con el balanceo. Puedes escribir un motivo; queda en el historial del registro junto con quién lo hizo.


## 7c. Equipos, campañas y organigrama

*Visible para: Director, Gerente*

Todo está en el grupo **Organización** del menú lateral (los gerentes y administradores lo ven completo; los directores ven sus equipos y campañas).

| Qué quiero hacer | Dónde |
|---|---|
| **Crear un grupo de trabajo (equipo)** | Organización → **Equipos** → **Crear equipo**. También con el botón *Crear equipo* del Organigrama. |
| **Crear un usuario y meterlo a un equipo** | Organización → **Usuarios** → **Crear usuario**. Elige su **Rol** (Comercial, Director de Equipo o Gerente General) y su **Equipo**. |
| **Habilitarlo para recibir leads** | Integraciones → Asignación automática de leads → casilla *Recibe leads*. |
| **Crear una campaña** | Organización → **Campañas** → **Crear campaña**. En el campo **Equipos** elige qué equipos la atienden: sus leads se reparten entre ellos. |
| **Ver la estructura** | Organización → **Organigrama**. |

Cómo se compone

- **Dirección:** administradores y usuarios con rol *Gerente General*.
- **Equipo:** un grupo de trabajo. Su **director** es el usuario con rol *Director de Equipo* que pertenece a él; sus **asesores** son los usuarios con rol *Comercial*.
- **Campaña:** se liga a uno o más equipos. Un mismo equipo puede atender varias campañas.

> El organigrama no se dibuja a mano: se arma solo con los roles y equipos de cada usuario. Si alguien no aparece, revisa que tenga equipo (si no, sale en «Sin equipo»).


## 7d. Dónde se configuran los estados y el balanceo

*Visible para: Admin*

Solo los administradores. Están en el grupo **Organización** del menú lateral.

| Qué quiero hacer | Dónde |
|---|---|
| **Crear, renombrar, ordenar o dar color a los estados de los leads** (las columnas del Kanban) | **Estados del pipeline** → botón *Crear, renombrar u ordenar estados*. Es la pantalla Administración → Entidades → Lead → Campos → Estado. |
| **Elegir la identificación temporal** (celular, correo o ninguna) y si la real es obligatoria para calificar o cerrar un lead | **Estados del pipeline** → sección *Identificación del cliente*. |
| **Decir cuál estado usa el sistema** para leads nuevos, «en calificación», «calificado» y los que ya no cuentan como abiertos | **Estados del pipeline** (panel derecho). Si renombras un estado, vuelve a elegirlo aquí. |
| **Elegir cómo se reparten los leads** (balanceado o rotación) y poner un tope de leads abiertos por asesor | **Asignación de leads** → *Cómo se reparten los leads nuevos*. |
| **Ver y cambiar quién recibe leads**, y qué equipos atiende cada campaña | **Asignación de leads** → *Quién recibe leads* y *Campañas activas*. |
| **Definir los servicios y sus condiciones** | **Integraciones** → Servicios y filtros. |

**Antes de renombrar o eliminar un estado**

mueve los leads que lo tienen (

*Acciones → Actualización masiva*

); EspoCRM no los cambia solo.


## 7e. Canales: WhatsApp, Telegram, Meta y llamadas (administradores)

*Visible para: Admin*

Todo se configura en **Integraciones** (pestañas *Canales de mensajería* y *Meta*). La tabla de arriba lista las **direcciones (webhooks)** que pegas en cada proveedor; usa «Mostrar token» y «Copiar».

WhatsApp: elige un proveedor

| Proveedor | Qué necesitas | Para recibir mensajes |
|---|---|---|
| **Evolution API** | URL, nombre de la instancia y API key. Teléfono vinculado por QR en Evolution. | Webhook de la instancia → `/hub/evolution`, evento `MESSAGES_UPSERT`, encabezado `apikey` = token. |
| **Meta WhatsApp Cloud API** | *Phone Number ID* y token de acceso permanente (usuario del sistema). En la pestaña Meta, el *App Secret*. | En tu app de Meta → WhatsApp → Webhooks: URL `/hub/whatsapp-cloud?token=…`, token de verificación = token, campo `messages`. |
| **Gupshup** | API key, número de origen y nombre de la app. | Webhook entrante de tu app → `/hub/gupshup?token=…`. |

Guarda y pulsa **Probar conexión**. Solo un proveedor está activo a la vez. Con Meta Cloud API, fuera de las 24 h de una conversación solo se pueden enviar plantillas aprobadas por Meta.

Telegram

1. En Telegram habla con **@BotFather** → `/newbot` y copia el token.
2. Pégalo en **Telegram · bot** y pulsa **Guardar y conectar**: el webhook se registra solo y aparece el enlace de tu bot.
3. Puedes cambiar el **mensaje de bienvenida**. Quien escriba al bot queda como un lead nuevo (origen Telegram) y se le pide su teléfono con un botón.

Meta: anuncios de Facebook e Instagram

Pestaña **Meta**: guarda el token de la página (permiso `leads_retrieval`) y el **App Secret** (con él se rechazan los webhooks sin firma válida). En tu app de Meta suscribe el campo `leadgen` a `/hub/facebook?token=…`.

Otro proveedor de WhatsApp o SMS (BSP)

Si tu proveedor no está en la lista (360dialog, Infobip, Hablame, Onurix, Altiria…), elige **Otro proveedor (API HTTP)**. Ver la sección 7g.

Llamadas y SMS

Se configuran en la pestaña **SMS y llamadas** (sección 7g).


## 7g. SMS, llamadas, troncal y otros proveedores (administradores)

*Visible para: Admin*

¿Mi proveedor no es Gupshup?

En **Canales de mensajería → WhatsApp** y en **SMS y llamadas → SMS** elige **Otro proveedor (API HTTP)**. Pulsa una **plantilla de ejemplo** y ajusta con los datos de la documentación de tu proveedor:

- **URL y método** (POST o GET), **autenticación** (ninguna, token Bearer, usuario y clave, o una cabecera propia) y **token/clave** (se guarda y nunca se vuelve a mostrar).
- **Plantilla del cuerpo** (JSON, formulario o parámetros en la URL) con las variables `\{{to}}` (teléfono con +), `\{{to_plain}}` (solo dígitos), `\{{text}}`, `\{{from}}`, `\{{name}}`, `\{{lead_id}}`, `\{{agent}}` y `\{{agent_phone}}`.
- **Mensajes entrantes (opcional):** el proveedor envía a `/hub/generic?channel=sms` (o `whatsapp`) `&token=…`; indica la ruta del teléfono, del texto y del nombre en el JSON que recibes (por ejemplo `messages.0.from`).

Prueba con **Enviar SMS de prueba** a tu celular. Por seguridad, no se aceptan direcciones internas del servidor.

SMS: números largos, códigos cortos y remitentes

El CRM envía por la API de tu proveedor; el tipo de remitente lo define lo que él te habilite. En **Remitente** escribe un número largo (+57…), un **código corto** (p. ej. 89999) o un nombre alfanumérico. Con **Twilio** basta guardar Account SID, Auth Token y remitente (o un Messaging Service que empiece por MG). Para recibir respuestas, en tu número de Twilio pon como webhook la URL que muestra la pestaña.

Llamadas: ¿dónde va mi troncal?

> La **troncal SIP** no se configura en el CRM: vive en tu **central telefónica** (Asterisk, FreePBX, 3CX…) o en tu **proveedor** (Twilio, Telnyx…). El CRM solo le pide a esa central que marque.

1. En **SMS y llamadas → Llamadas** elige el proveedor: **Twilio** (usa las credenciales de arriba y el número de caller ID) u **Otra central (API HTTP)** (plantillas para Asterisk ARI y API REST).
2. Cuando un asesor pulsa **Llamar**, la central llama primero a su teléfono o extensión y, al contestar, lo conecta con el cliente. El caller ID es el número que ve el cliente.
3. Cada llamada queda en **Llamadas** con su duración y resultado, y una nota en el lead. Con Twilio puedes activar la grabación.
4. Si no configuras nada, el botón Llamar sigue abriendo el softphone del asesor (`tel:`).


## 7h. Mensajes masivos (envíos a un grupo de leads)

*Visible para: Director, Gerente*

Menú **Mensajes masivos**: envía un mensaje a un grupo de leads por WhatsApp, SMS o Telegram, con ritmo controlado. No es lo mismo que una **Campaña** de Organización (el origen de los leads): ver 7i.

1. **Canal:** elige WhatsApp, SMS o Telegram (debe estar configurado en Integraciones).
2. **Audiencia:** filtra por estado, resultado del filtro, origen, canal preferido, antigüedad, servicio sugerido o asesor, y pulsa **Calcular audiencia** para ver cuántos y quiénes. Solo entran quienes tienen el dato de contacto y no pidieron «no contactar»; verás los leads que tus permisos permiten.
3. **Mensaje:** escribe el texto con variables (`{nombre}`, `{primer_nombre}`, `{servicio}`, `{asesor}`, `{empresa}`). Se agrega «Responde BAJA para no recibir más» (recomendado).
4. **Ritmo y horario:** mensajes por minuto, y empezar **ahora** o **programado**. Con **WhatsApp por Evolution** el ritmo es fijo: **1 mensaje cada 2 minutos** y hasta **100 destinatarios por envío** (para no bloquear la línea); si necesitas más, contacta con soporte de Crm Hub 360.
5. Pulsa **Crear y enviar campaña**. En la lista puedes ver el avance, **pausar, reanudar o cancelar**; el detalle muestra enviados, fallidos y omitidos.

Envía solo a clientes que

**autorizaron**

ser contactados (Ley 1581 / habeas data). Quien responda BAJA queda excluido automáticamente. Con WhatsApp oficial (Meta), fuera de las 24 h solo se permiten plantillas aprobadas; con Evolution (no oficial) un ritmo alto puede hacer que bloqueen tu número: usa pocos mensajes por minuto.


## 7f. Formularios web de captación (administradores)

*Visible para: Admin*

En **Integraciones → Formularios web** diseñas tus propios formularios. Cada uno tiene una **dirección pública** (`https://tu-dominio/f/nombre`) para enlazarla en anuncios, redes o un QR, o **incrustarla** en tu página con el botón *Código para incrustar* (iframe).

1. **Nuevo formulario** arranca con una plantilla (nombre, teléfono, correo, deuda aproximada y canal preferido). Pulsa **Editar** para ajustar título, texto, color, botón y mensaje de éxito.
2. **Campos:** agrega, ordena y marca como obligatorios. Cada campo se guarda donde elijas: nombre, teléfono, correo, ingresos, deuda total, deuda en mora, acreedores, o en las notas del lead. Si hay datos de deuda, el lead se **califica solo** con tus servicios y filtros.
3. **Campaña:** escribe el nombre exacto de una campaña para ligar los leads y que se repartan entre sus equipos. Si el enlace trae `?utm_campaign=nombre` y coincide con una campaña, también se liga.
4. **Autorización de datos (habeas data):** el texto que aceptan queda en el historial del lead junto con la fecha. Puedes hacerla obligatoria.
5. **Telegram:** si el cliente elige ese canal, al enviar ve un botón para abrir tu bot y queda ligado a su lead.
6. **Plantillas listas:** el botón **Plantillas** abre una galería con formularios ya diseñados (expediciones y turismo, alivio de deudas, inmobiliaria, citas médicas, cursos, seguros, inscripción a evento y contacto). Elige una, ajusta los textos y pulsa *Guardar formularios*. El botón **Duplicar** (dos hojas) copia cualquier formulario tuyo para usarlo de base.
7. **Diseño:** imagen de encabezado (como en Google Forms) o franja de color, color o imagen de fondo, y colores del botón y de los campos. Cada campo puede ocupar ¼, ⅓, ½, ⅔, ¾ o todo el ancho.
8. **Campos condicionales:** en cada campo, *Mostrar solo si* otra pregunta tiene cierta respuesta (por ejemplo, la lista de montañas cambia según el país). Un campo oculto no se exige ni se guarda.
9. **Al recibir el formulario:** agrega acciones que se ejecutan solas: *enviar un correo* (con imágenes, PDF adjunto y botón de WhatsApp o de enlace), *enviar un WhatsApp* o *avisar al equipo* («Nuevo registro» en la campana y como notificación). Cada acción puede ejecutarse siempre o solo si una respuesta coincide, así cada destino, servicio o especialidad recibe su propio mensaje. En el texto puedes usar {{nombre}}, {{empresa}}, {{telefono}}, {{correo}} y la clave de cualquier pregunta. Si algo falla, el motivo queda en las notas del lead. Con WhatsApp Meta, el texto libre solo llega si el cliente escribió en las últimas 24 horas.
10. **Clientes repetidos:** elige si al volver a registrarse se actualiza su lead y se continúa, o si no se registra de nuevo y se le avisa que ya está registrado.
11. Pulsa **Guardar formularios** para publicar. Un formulario *apagado* deja de responder. Los parámetros `utm_source`, `utm_medium`… de la URL se guardan en las notas del lead.

> Protección: el formulario rechaza envíos instantáneos de robots y repetidos desde la misma conexión (8 por 10 minutos). Si un cliente ya existe (mismo teléfono o correo), se actualiza su lead y se anota que volvió a escribir, sin duplicarlo.


## 8. Tareas y calendario

*Visible para: Comercial, Director, Gerente*

- **Tareas:** crea recordatorios ligados a un lead (por ejemplo "Llamar el viernes") con fecha de vencimiento.
- **Calendario:** muestra tus llamadas, reuniones y tareas; haz clic en un hueco para agendar.
- Las actividades pendientes aparecen en el panel de inicio.


## 9. Administración (solo administradores)

*Visible para: Admin*

Crear un usuario

1. Menú de usuario → **Administración** → **Usuarios** → **Crear usuario**.
2. Define usuario, contraseña y correo.
3. Asigna el **rol** (Comercial, Director de Equipo o Gerente General) y su **equipo**.

Webhooks de captación

Los datos de conexión de tu empresa (dirección y token) los entrega el equipo de plataforma. Rutas:

- `/hub/facebook?token=…` — Facebook e Instagram Leads
- `/hub/evolution` — WhatsApp (Evolution API, cabecera `apikey`)
- `/hub/web?token=…` — formularios web

No compartas el token fuera de la empresa.


## 5c. Lo que se actualiza solo

*Visible para: Comercial, Director, Gerente*

No necesitas recargar la página: el sistema te avisa y se actualiza en tiempo real.

| Qué | Cómo funciona |
|---|---|
| **Lead nuevo** | Llega un aviso a la **campana** y a tu dispositivo (notificación push) cuando entra un lead. Lo reciben el asesor asignado y los administradores; si el lead quedó **sin asesor**, el aviso lo dice. |
| **Listas, tablero y Panel gerencial** | Al llegar un lead nuevo, la lista de Leads, el tablero Kanban y las cifras del Panel gerencial se actualizan solos (en pocos segundos). |
| **Historial de actividades** | En la ficha del lead (y de cuentas, contactos y oportunidades) reúne **todo lo que ya pasó**: correos, WhatsApp, SMS, Telegram, llamadas, reuniones, tareas y cambios de estado, con filtros por tipo. Se actualiza al enviar o recibir un mensaje. **Actividades** es distinto: muestra lo **pendiente** (tareas, reuniones y llamadas por hacer). |
| **Nueva versión de la aplicación** | Cuando hay mejoras, aparece un aviso y se aplican solas cuando llevas unos segundos sin usar la pantalla y no tienes nada a medias (ventana abierta, campo en edición o texto escrito). También puedes pulsar **Actualizar ahora**. |
| **Sin asesor humano** | Si un lead lo atiende el **comercial virtual**, el encabezado del lead muestra «Comercial virtual · nombre». |


## 5d. Mis plantillas

*Visible para: Comercial, Director, Gerente*

Menú **Mis plantillas**: tus propios mensajes listos para usar. Son **privados**: solo tú los ves.

- Tienes un espacio por canal: **Correo, WhatsApp, Telegram y SMS** (RCS, próximamente). Incluye hasta **10 por canal**; tu empresa puede ampliar el cupo como servicio adicional.
- Cada canal tiene su propio lienzo: el de **correo** es un diseñador de bloques (título, texto, imagen, botón, columnas…); **WhatsApp y Telegram** muestran un teléfono de vista previa con formato, emoji y enlaces; **SMS** cuenta caracteres y segmentos.
- Puedes usar variables como el nombre del cliente, tu nombre y la empresa; se rellenan solas al usar la plantilla.
- Se usan desde el panel de cada canal (Correo, WhatsApp, SMS, Telegram) del lead: eliges la plantilla y la editas antes de enviar.


## 5e. Simulador y Banco de conocimiento

*Visible para: Comercial, Director, Gerente*

Simulador

Menú **Simulador**: recorre con un lead de prueba todo lo que tu empresa tiene configurado (registro, correo de bienvenida, mensaje por WhatsApp o SMS, respuesta del cliente, llamada, reunión y tarea, cambios de estado y conversión a cliente) y te dice qué falta por configurar. Los datos quedan marcados como **[Simulación]**, no cuentan en los reportes y puedes borrarlos desde la misma pantalla.

Banco de conocimiento

Menú **Banco de conocimiento**: aprende del historial **real** de tus leads (las simulaciones no cuentan). Muestra qué **fuentes, servicios, campañas y asesores** convierten mejor, qué días y horas llegan los mejores clientes y cuánto tardan en cerrar. Con 10 leads o más la IA agrega recomendaciones. Pulsa **Actualizar análisis** para recalcular y escribe en **Aprendizajes del equipo** lo que vayas descubriendo.


## 5f. Leer documentos (PDF) en el lead

*Visible para: Comercial, Director, Gerente*

En la ficha del lead, el panel **Lectura de documentos** lee un PDF por ti (reporte de buró, cédula, soportes de ingresos…).

1. Pulsa **Subir PDF y leer**. El sistema detecta el tipo de documento y lo lee con su **lector interno** (rápido, sin IA); si quieres, pulsa **Mejorar con IA**.
2. Elige el **perfil** (qué datos buscar): crédito, cédula, ingresos, resumen u otros que tu empresa haya creado.
3. **Revisa y corrige** los datos que encontró, marca cuáles guardar y pulsa aplicar: se guardan en el lead.

> La lectura sigue en segundo plano si cierras la ventana: verás un indicador y un aviso cuando termine, y podrás reabrir el resultado para revisarlo.


## 7i. Mensajes masivos y campañas: en qué se diferencian

*Visible para: Director, Gerente*

|  | Campaña (Organización → Campañas) | Mensajes masivos |
|---|---|---|
| **Qué es** | El **origen o iniciativa** de tus leads (un anuncio, un evento, una promoción). | Una **acción de envío**: un mismo mensaje a muchos leads. |
| **Para qué sirve** | Saber de dónde vienen los leads, medir qué campaña rinde más y decidir **qué equipos la atienden** (los leads de la campaña se reparten entre esos equipos). | Contactar a un grupo de leads a la vez por WhatsApp, SMS o Telegram, con ritmo controlado y respetando «no contactar». |
| **Dónde está** | Organización → **Campañas**. Un lead queda ligado a su campaña (por ejemplo, la que trae el anuncio de Facebook). | Menú **Mensajes masivos**. |
| **Cómo se relacionan** | Son **independientes**: un mensaje masivo no crea ni modifica una campaña. Cada envío masivo deja una nota en el lead («Difusión: …»). Las campañas aparecen en el Panel gerencial y en el Banco de conocimiento para medir resultados. |  |

> En la pantalla de Mensajes masivos cada envío se llama «campaña» por costumbre: es un **envío masivo**, no la «Campaña» de Organización.


## 9b. Canales de mensajería: varios proveedores por canal

*Visible para: Admin*

**Integraciones → Canales de mensajería**. Cada canal tiene su pestaña: **WhatsApp, SMS, Llamadas y Telegram**, y en cada una un **cuadro por proveedor**. Puedes tener varios en el mismo canal (por ejemplo, dos números de WhatsApp o dos cuentas de Twilio).

- **Agregar proveedor**: elige el tipo (WhatsApp: Evolution API, Meta Cloud API, Gupshup, Twilio u otro por API HTTP; SMS: Twilio u otro; Llamadas: Twilio u otra central), ponle un nombre y pega sus datos.
- **Interruptor**: encendido = se usa para enviar; apagado = no se usa. Si todos los de un canal están apagados, el canal queda «sin configurar».
- **Probar conexión**, **Enviar prueba** (un mensaje real a un número, incluso con el proveedor apagado) y **Llamada de prueba** en Llamadas.
- **Usar como principal**: los mensajes salen por el principal. Al escribir un WhatsApp, SMS o llamar, si hay más de un proveedor encendido aparece **Enviar desde** para elegir; en automático, la respuesta sale por la **misma línea por la que escribió el cliente**.
- **Evolution (QR)**: **Vincular (QR)** escanea el número con el teléfono; **Cambiar de número** cierra la sesión del número actual y muestra el QR del nuevo (las conversaciones se conservan).

Con

**Evolution**

(línea no oficial) los

**mensajes masivos**

admiten hasta

**100 destinatarios por campaña**

y se envía

**1 mensaje cada 2 minutos**

para no bloquear la línea. Si necesitas más, contacta con soporte de Crm Hub 360.


## 9c. Comercial virtual: comerciales, entrenamiento y mensajes con opciones

*Visible para: Admin*

Menú **Comercial virtual** (administradores). Atiende a cada lead de principio a fin: primer contacto, respuestas, seguimientos, cambios de estado, y pasa el caso a una persona cuando hace falta. Cada decisión queda registrada con su porqué. La **versión automática** se activa por empresa (servicio adicional); la **manual** siempre está disponible.

Mis comerciales

- Cada comercial virtual es una **tarjeta** con su propio entrenamiento: puedes tener varios que se comporten distinto (uno de ventas, otro de cobranza…). Tu licencia incluye 1; para más, contacta con soporte de Crm Hub 360.
- **Interruptor**: apagado, no recibe leads nuevos y pausa los que lleva. **Entrenar, Probar, Duplicar** (copia para ajustar) y **Quitar** (sus leads pasan al primero).
- Un comercial nuevo arranca en **manual** y en **modo de prueba** hasta que lo entrenes y lo actives.

Entrenamiento

1. **Versión**: manual (siempre una persona) o automática; **modo de prueba** (decide y registra, pero no envía nada); **aprobación previa** (una persona aprueba o edita cada mensaje); presentarse como asistente virtual.
2. **Quién es**: nombre, cargo y tono.
3. **Lo que sabe**: sobre la empresa, servicios, políticas y preguntas frecuentes. Lo que no esté ahí, dirá que un asesor lo confirmará.
4. **Objetivo y límites**: qué debe lograr, qué nunca debe hacer y cuándo pasa el caso a una persona.
5. **Cuándo y por dónde**: días y horario, zona horaria y canales (WhatsApp, correo, SMS).
6. **Ritmo**: primer contacto, seguimientos si no responde, máximo de mensajes por día y cuánto se hace a un lado cuando una persona escribe al cliente.

Mensajes con opciones (lista o botones de WhatsApp)

En vez de pedir texto libre, el comercial puede enviar un menú («¿cuál de estas opciones describe mejor tu situación?»). Tú defines el menú, **cuándo usarlo** (la IA decide el momento), las opciones (hasta 10 en lista, 3 en botones) y, opcionalmente, el estado al que pasa el lead según lo que elija el cliente. Con WhatsApp **oficial (Meta)** llega como lista o botones nativos; con Evolution u otros proveedores llega como **texto numerado** («responde con el número») y el sistema entiende la respuesta igual. Usa **Probar en mi WhatsApp** para verlo.

Probar, resultados y motor de IA

- **Probar**: simulas a un cliente y ves cómo respondería, sin enviar nada.
- **Resultados y trazabilidad**: leads atendidos, mensajes, tiempo de primera respuesta, resultados por comercial y todo lo que hizo con su porqué.
- **Motor de IA**: muestra qué IA usa tu empresa (global del sistema, una asignada o la tuya propia con su clave: Claude, OpenAI u otro compatible) y su consumo del mes.

En el lead

El panel **Comercial virtual** muestra quién lo atiende, en qué va y qué hizo. Puedes **Pausar**, **Tomar el control** (pasa a gestión manual), **Pasar al comercial virtual** o elegir en **Lo atiende** a otro comercial. Si hay aprobación previa, aquí apruebas o editas cada mensaje.

Mensajes automáticos con botones y negrillas

Los mensajes de WhatsApp que el comercial virtual envía **por su cuenta** (el primer contacto y los seguimientos) salen con **botones de respuesta rápida** —por defecto «Sí, me interesa», «Más información» y «Ahora no»— para que el cliente conteste con un toque; su elección le llega al comercial como si la hubiera escrito. Además, el **nombre de la empresa y el del comercial** van en **negrilla** y la IA resalta las palabras clave (beneficio, fecha, acción). Todo se ajusta en **Comercial virtual → Mensajes con opciones** (cambia los textos de los botones, apágalos o apaga la negrilla; el botón *Probar en mi WhatsApp* te lo envía).

- Con **WhatsApp oficial (Meta)** los botones son nativos. Con Evolution (QR), Twilio, Gupshup u otro proveedor WhatsApp no los muestra, así que el mensaje llega con las opciones **numeradas** («Responde 1, 2 o 3») y el comercial entiende la respuesta igual.
- Las respuestas a preguntas del cliente no llevan botones: solo los mensajes que el comercial inicia.
- Los **formularios web** también pueden enviar un WhatsApp con botones (campo *Botones de respuesta* de la acción) y ponen en negrilla la empresa y el asesor ({{asesor}}); los **mensajes masivos** resaltan el nombre de la empresa.


## 9d. Reparto de leads entre personas y comerciales virtuales

*Visible para: Admin*

En **Comercial virtual → Mis comerciales → Reparto de leads nuevos** decides quién atiende cada lead que llega por formularios, WhatsApp, redes u otro canal automático (los que creas a mano los llevas tú).

| Modo | Qué pasa |
|---|---|
| **Compartido** | Los asesores humanos reciben la asignación automática de siempre y además un comercial virtual atiende el lead. Si hay varios comerciales, rotan según su peso. |
| **Repartir entre humanos y virtuales** | Cada lead va a **uno solo**: al grupo de asesores humanos (balanceados entre sí por su carga) o a un comercial virtual, según los pesos, **intercalados**. |

**Pesos**: con humanos 2 y un comercial virtual 1, de cada 3 leads salen 2 para personas y 1 para el comercial, intercalados. Un peso 0 excluye a ese participante. Solo participan los comerciales **encendidos y en modo automático**. El porcentaje de cada uno se ve mientras editas.

> Si el lead va a un comercial virtual, queda sin asesor humano y el encabezado lo indica; puedes reasignarlo a una persona cuando quieras. La asignación humana se habilita en **Asignación de leads** (casilla *Recibe leads*).


## 9e. Procesos de leads, copias de leads y lectura de documentos

*Visible para: Admin*

Procesos de leads

Menú **Procesos de leads**: cuando llega un lead (o cambia su identificación), el sistema envía su identificación y datos a una **API o webhook** —consulta a un buró de crédito, validación de identidad, web scraping, aviso a otro sistema— y guarda en el lead lo que responda. Puedes partir de plantillas, o elegir los **servicios del sistema** que tu proveedor te asignó (sin credenciales). Cada ejecución queda registrada, con reintentos. La pestaña **Lectura de documentos** define los perfiles que usa el panel de PDF.

Copias de leads

Menú **Copias de leads**: **Crear copia** guarda todos los leads con sus notas, tareas, llamadas y reuniones; puedes **descargarla** (archivo .json) o **restaurarla** (recupera lo que falte sin tocar los leads que ya existen). **Limpiar todos los leads** los quita para empezar de nuevo: antes crea una copia automática y exige escribir **LIMPIAR**. No toca correos, cuentas, contactos ni oportunidades.


## 10. Preguntas frecuentes

*Visible para: Comercial, Director, Gerente*

El reporte quedó en "Error"

Lo más común: PDF escaneado o protegido. Descarga de nuevo el PDF original del buró y vuelve a adjuntarlo.

El asistente IA no responde

Puede estar ocupado procesando otro reporte. Espera un minuto y reintenta; si persiste, avisa al administrador.

Mi licencia aparece vencida o suspendida

Las funciones de IA y la captación automática se pausan. Contacta al administrador de tu empresa.

¿Cómo cambio mi contraseña?

Menú de usuario → Preferencias → Cambiar contraseña.

