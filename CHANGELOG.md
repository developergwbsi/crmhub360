# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado [SemVer](https://semver.org/lang/es/). Cómo se publica una versión: [`docs/VERSIONES.md`](docs/VERSIONES.md). El historial completo de commits está en [`docs/referencia/HISTORIAL.md`](docs/referencia/HISTORIAL.md).

## [Sin publicar]

## [1.8.0] - 2026-10-19

### Consultas web con navegador: login, navegación y páginas con JavaScript
- **Nuevo modo «Navegador»** en las consultas web (además de la «página sencilla»): un Chromium propio (contenedor `crmhub-browser` con Playwright, al estilo de lo que se hace en n8n con navegadores aparte) **inicia sesión, hace clic, navega por varias páginas y lee páginas que se dibujan con JavaScript**.
- **Grabador visual**: en «Flujo de navegación → Grabar el flujo» ves un navegador real dentro del CRM: escribes la dirección, haces clic, escribes usuario y clave, navegas, y cada acción queda grabada como un paso editable (abrir, escribir, clic, tecla, esperar, extraer). En modo «Elegir dato» pulsas lo que quieres traer.
- **Credenciales protegidas**: el usuario y la clave que escribes al grabar se guardan aparte en el servidor y **no vuelven a mostrarse**; los pasos solo dicen `{{usuario}}` y `{{clave}}` (y se pueden añadir otras credenciales, como un token). También se pueden usar datos del lead (`{{identificacion}}`, `{{nombre}}`…).
- El flujo se repite igual desde la ficha del lead («Consultar web»), desde una acción de formulario y con el análisis de la IA como antes.
- **Seguridad**: el navegador solo abre direcciones públicas (cada petición se revisa y se rechazan redes internas y del propio servidor), sin descargas, con tiempo límite y pocas sesiones a la vez. No resuelve captchas ni verificación en dos pasos. Quien configura es responsable de usar solo sitios y cuentas que tenga derecho a automatizar.

## [1.7.2] - 2026-10-18

### Ficha y pantallas de diseño con zonas independientes
- **Ficha del lead, cliente, cuenta u oportunidad (pantallas anchas)**: la página **ya no se desplaza**; el encabezado, la barra de etapas y los botones quedan quietos y **la zona de los datos (4/12) y la de actividad (8/12) se desplazan cada una por su lado**, sin mover la otra. Se quitó un comportamiento antiguo que subía toda la página al girar la rueda sobre una columna y que era la causa de que «se moviera todo».
- **Formularios internos y Consultas web con diseño profesional**: cabecera fija con título y acciones («Nuevo», «Usar ejemplo», «Guardar todo» y aviso de cambios sin guardar), lista a la izquierda que no se mueve y el editor a la derecha con **pestañas fijas** (General, Dónde se ve, Campos, Acciones / La consulta, Datos a traer, Análisis con IA) y contenido que se desplaza por dentro. La página no se mueve.

### Consultas web con su propio menú, y el menú lateral deja de moverse
- **Nuevo menú «Consultas web»** (Organización; para gerentes, directores y supervisores): ahí se configura todo lo del web scraping. Cada consulta tiene su página (con variables como `{{identificacion}}`), los datos a traer —**eliges viendo la página y pulsando con el cursor**— y, si quieres, qué debe analizar la IA para recomendar. Antes solo se podía definir dentro de una acción de formulario.
- **«Consultar web» en la ficha del lead** (menú ⋯): el asesor elige una consulta guardada, se ejecuta con los datos del lead y ve lo que encontró y el análisis de la IA; además queda una nota en el historial.
- Las acciones de **formulario** pueden **usar una consulta guardada** (y dirigir cada dato a un campo del formulario) o seguir definiendo la página ahí mismo.
- **El menú lateral ya no se mueve al hacer scroll** en ninguna página (EspoCRM copiaba el desplazamiento de la página al menú).

### Panel lateral del lead con pestañas fijas, tablero con más vida y dos formas de abrir una ficha
- **El panel lateral (modal) de la ficha ahora tiene pestañas** —Contacto, Gestión, Crédito, Notas y, debajo, Actividad, Agenda y tareas, Formularios, Documentos, Videollamadas, Comercial virtual y Estados— y **quedan fijas** (las dos filas apiladas bajo el resumen del lead, con el título de cada panel) mientras te desplazas. Antes era una sola columna larga sin pestañas.
- **Pestañas fijas también en pantallas angostas** de la ficha completa (Espo dejaba un desplazamiento interno en la columna izquierda que lo impedía).
- **Tablero de Leads rediseñado, sobrio y profesional**: fondo limpio, cabeceras de columna blancas con una línea del color de la etapa y el contador, tarjetas planas con borde fino y datos secundarios en gris, la calificación como una etiqueta pequeña (verde califica, ámbar revisión manual, rojo no califica), avatar discreto, sombra suave al pasar el cursor y «Sin leads en esta etapa» en las columnas vacías.
- **«Asignación» es una pestaña más** de la zona de datos, junto a Resumen, Detalles y Calificación (antes era una tarjeta aparte): usuario asignado, equipos y de dónde llegó el lead.
- **Ficha con desplazamiento independiente**: en pantallas anchas **la página ya no se mueve**: la zona izquierda (datos) y la derecha (actividad, formularios…) se desplazan **cada una por su lado**; el encabezado, las pestañas y los títulos quedan siempre a la vista.
- **Diseño de formularios internos y de consultas web con otra estructura**: cabecera fija con título y botones (Nuevo, Usar ejemplo, Guardar todo y aviso de cambios sin guardar), lista a la izquierda y el detalle en pestañas (General, Dónde se ve, Campos, Acciones / La consulta, Datos a traer, Análisis con IA) que se desplazan por dentro, sin mover la página.
- **Dos formas de abrir un lead (y cuentas, contactos y oportunidades)** desde la tarjeta del tablero o la fila de la lista: el icono del ojo abre solo el **panel lateral** y el de flechas abre la **ficha completa**; además, el botón «Abrir completo» del panel lateral.

## [1.7.1] - 2026-10-17

### Ficha con menos scroll (más pestañas)
- **Lead, contacto, cuenta y oportunidad**: lo que antes estaba apilado hacia abajo y en la columna derecha ahora va en **pestañas bajo el encabezado**: **Actividad**, **Agenda y tareas** (próximas actividades, tareas e historial de actividades), **Formularios**, **Documentos** (lectura de PDF), **Videollamadas**, **Comercial virtual** y **Estados** (historial). La columna derecha queda solo con asignación, equipos y creación.
- **Todo en una sola vista (pantallas anchas)**: los datos del lead, cliente, cuenta u oportunidad (Resumen, Detalles, Calificación y la tarjeta de asignación) van **a la izquierda en 4/12** y las pestañas de actividad (Actividad, Agenda y tareas, Formularios, Documentos, Videollamadas, Comercial virtual, Estados) **a la derecha en 8/12**, con el encabezado, la barra de etapas y la agenda más bajitos. Las pestañas de la derecha se desplazan solas sin mover los datos. En pantallas angostas y en el panel lateral se mantiene el orden vertical de siempre.
- **Pestañas y títulos siempre fijos**: al desplazarte por la ficha quedan fijos, apilados bajo el encabezado, la barra de etapas y los botones, las pestañas de la izquierda (Resumen, Detalles, Calificación) y de la derecha (Actividad, Formularios, etc.), y también el título de cada panel («General», «Historia»…).
- En el lead, los datos se reparten además en **Resumen**, **Detalles** y **Calificación** (antes «Detalles» iba debajo de «General»).

## [1.7.0] - 2026-10-17

### Formularios internos de gestión
- **Nuevo: formularios que la propia empresa diseña** para capturar información de la gestión de cada lead (visitas, verificaciones, solicitudes…). Los crean **gerentes, directores y supervisores** en *Organización → Formularios internos*: campos (texto, número, monto, fecha, listas, Sí/No, teléfono, correo y títulos de sección), obligatorios, **en qué etapas del lead se ven** y **dónde aparecen**.
- **En la ficha del lead**, nuevo panel **Formularios** con pestañas (sin alargar la página): «Esta etapa» y una pestaña por formulario que se llena ahí mismo; y un botón **Llenar formulario** para los que se lanzan desde un botón.
- **Acciones configurables** (automáticas al guardar o con un botón): **generar un PDF** con los datos (queda adjunto en la ficha), cambiar el estado del lead, crear una tarea, enviar por correo (con PDF), WhatsApp o SMS, y copiar respuestas a campos del lead.
- **La lectura de PDF puede llenar formularios**: al revisar un documento, cada dato puede tener como destino un campo de un formulario (también en los perfiles de lectura); queda guardado en el formulario del lead para revisarlo.
- Cifras escritas a la colombiana («3.500.000») se entienden bien en los campos numéricos y de monto.
- **Lectura de PDF sin revisión (opcional)**: en el perfil de lectura se puede marcar **«Aplicar sin revisión»**: al terminar de leer, los datos se guardan solos en el lead y en los formularios destino (con aviso y constancia en el historial); si algo falla, queda para revisar como siempre. Si el formulario queda completo, sus acciones «al guardar» (por ejemplo generar el PDF) también se lanzan solas.
- **Consulta de páginas web** (nueva acción de formulario): trae información de una página pública (por selector CSS, expresión regular o el texto completo), la guarda en campos del formulario y la deja en una nota del lead; además la **IA puede analizar lo que dice la página y dar una recomendación** para decidir (queda en un campo y en la nota). La dirección admite variables como `{{identificacion}}`. Solo páginas que muestran su contenido sin JavaScript, captcha ni usuario y clave; se bloquean direcciones internas.
- **Elegir los datos de la página con clics**: en la acción «Consultar una página web», el botón **«Ver la página y elegir los datos con clics»** muestra la página dentro del CRM (vista previa segura, sin scripts); pasas el cursor, pulsas el dato que quieres traer (o el bloque que lo contiene), le pones nombre y eliges el campo del formulario donde se guarda. El sistema calcula solo el selector. Avisa si la página parece cargar su contenido con JavaScript.
- **PDF más personalizable**: logo de la empresa (el de Configuración), color, subtítulo y líneas de firma.
- **Diseño de formularios más ágil**: las claves de los campos se generan solas desde su nombre, así que se pueden usar de inmediato en acciones y mensajes sin guardar antes.
- **Ficha del lead más ordenada (estilo HubSpot)**: barra de **etapas** en el encabezado (la actual resaltada y las anteriores marcadas; al pulsar otra se cambia el estado con confirmación) y los paneles de abajo en **pestañas** («Actividad» y «Formularios») para no alargar la página.

### Videollamada en otra ventana: ficha de cada participante
- **Con la llamada en una ventana aparte (sin el panel del CRM) ya puedes ver la información de las personas**: en la lista «En la llamada» el anfitrión toca un nombre y aparece su tarjeta (estado, teléfono, correo, empresa, asesor, origen) con «Abrir la ficha en el CRM», que se abre en otra pestaña sin cortar la llamada. Funciona con el lead de la sala, quienes entraron con invitación personal y los invitados de la reunión programada (leads y contactos), ubicándolos por su ficha o por su nombre.

## [1.6.6] - 2026-10-16

### Videollamada: ficha desde la lista de la sala y «Abrir en otra ventana»
- **En pantalla completa (y en el panel) ya puedes tocar a una persona de la lista «En la llamada» de la sala** y se abre su ficha del CRM (estado, teléfono, correo, asesor, «Abrir la ficha», silenciar y sacar de la llamada). Antes solo se podía desde la franja de nombres de arriba.
- **«↗ Abrir en otra ventana» también está en el menú ⋮ de la sala** (además del botón del encabezado del panel, que ahora es más fácil de encontrar), para pasar la llamada a otra ventana o monitor sin cortarla.

## [1.6.5] - 2026-10-16

### Videollamada: ficha automática de cada participante
- Quien entra por el **enlace general** (sin invitación personal) aparecía como «Sin ficha» y había que buscarlo a mano. Ahora el panel de la llamada **lo busca en el CRM por su nombre** y, si hay una sola persona (lead o contacto) con ese nombre, **le liga la ficha solo**: un clic en su nombre muestra estado, teléfono, correo, asesor y «Abrir la ficha». Si hay varios con el mismo nombre o ninguno, queda el buscador para vincularlo.
- La sala ahora confirma «X ya puede entrar» al admitir y avisa si no se pudo; quien espera entra de inmediato al volver a su pestaña.

## [1.6.4] - 2026-10-15

### Avisar a todas las personas de la reunión
- Corrección: al reenviar la invitación (o avisar de una actualización) el CRM decía «El cliente no tiene correo ni teléfono» aunque los invitados sí los tenían, porque solo miraba el registro principal de la reunión. Ahora la ventana lista **todas las personas de la reunión** (el registro ligado y los leads y contactos invitados), cada una con su correo y teléfono; eliges a quiénes y por qué canales, y ves el resultado de cada envío.

## [1.6.3] - 2026-10-15

### Reenviar la invitación por el canal que quieras y avisar cuando cambia la agenda
- **Desde la reunión, «Enviar invitación al cliente» ahora te deja elegir el canal**: correo, **WhatsApp, SMS o Telegram** (uno o varios a la vez). Cada canal tiene su propia plantilla por defecto: el correo con diseño y botones de calendario; WhatsApp con los datos, el enlace y el enlace para agregarla a Google Calendar; SMS corto con fecha y enlace; Telegram con los datos y el enlace. Los canales que el cliente no tiene (sin correo o sin teléfono) salen deshabilitados y, tras enviar, ves el resultado de cada uno.
- **Al editar una reunión con videollamada** (nombre, fecha u hora), después de guardar el CRM **te pregunta si quieres avisarle al cliente de la actualización** y por qué canal. El correo de actualización lleva el encabezado «Videollamada actualizada», el asunto «Actualización: …» y un .ics con la misma cita ya corregida, para que su calendario la reemplace en vez de duplicarla.

## [1.6.2] - 2026-10-15

### Invitaciones por correo con plantilla profesional
- **Todas las invitaciones a videollamadas por correo usan ahora la misma plantilla por defecto**, con diseño (cabecera con el nombre de la empresa, tarjeta con fecha, hora, duración y organizador, botón grande «Unirme a la videollamada») en vez del mensaje plano.
- **Siempre traen la opción de agregarla al calendario**: botones *Google Calendar* y *Outlook*, el archivo **invitacion.ics** adjunto (Apple y otros) y la parte de calendario que Gmail y Outlook muestran con «Aceptar / Quizás / No» directamente en el correo; con recordatorios 15 y 5 minutos antes.
- Aplica a la invitación de una reunión programada, a **«Invitar desde el CRM → Correo»** (antes solo mandaba el enlace) y a la invitación por correo que el anfitrión envía desde dentro de la sala.

## [1.6.1] - 2026-10-15

### Tablero con cifras que se pueden abrir
- **Cada cifra del tablero ahora es un enlace**: al hacer clic en «Leads captados», «Sin asesor», «Tasa de calificación», «Cierres exitosos», «Deuda en cartera / en mora», en cada barra (embudo, servicio, origen, campaña), en cada barra de la tendencia o en la fila de un asesor, se abre la **lista de esos mismos leads** (los que suman en esa cifra, con las mismas reglas y el mismo periodo), con la ficha lateral y las acciones masivas de siempre. Un botón «Volver al tablero» regresa.
- En **«Sin asesor»** hay además **«Repartir automáticamente»**: asigna esos leads con el mismo balanceo del reparto automático (por campaña o grupo general). Solo con permiso de asignación; también se pueden marcar y reasignar a mano.

### WhatsApp (Evolution)
- **Respuestas que llegan sin número** (WhatsApp ahora identifica a algunos contactos con un código interno «LID»): para ligarlas al lead al que se le escribió, el Hub busca primero en los últimos 45 minutos y, si no hay a nadie, en las **últimas 24 horas** (antes se creaba un lead aparte «sin número»).
- Al asignar una línea que **ya existe** en Evolution desde *Servicios* del Centro de control, ahora se le **enciende el aviso** de mensajes hacia el CRM de la empresa (antes quedaba apagado y no llegaba nada).
- Con el menú recogido, el nombre de la empresa y «Crm Hub 360» pasan a la esquina superior izquierda de la cabecera.

### Subtítulos en más idiomas y motor de IA de la empresa
- **Subtítulos en 6 idiomas**: español, inglés, **portugués, francés, alemán e italiano** (cada persona elige el que habla y el que quiere leer; la voz a texto local ya era multilingüe). Cada quien publica su idioma de lectura y quien habla traduce solo a los idiomas que hay en la sala.
- **Los subtítulos traducidos y el resumen de la reunión usan el motor de IA de la empresa** (el que asigna el Centro de control en *Empresas → Servicios y módulos → Motor de IA*: Claude, OpenAI, Ollama…). Con un motor en la nube la traducción es mejor y sirve para todos los idiomas; con el motor local se usa el traductor liviano es↔en y la IA local para el resto. El consumo queda en «Este mes» del panel de IA. Antes el resumen y el respaldo de traducción llamaban a Ollama directo.

### Resumen automático de la reunión
- **Al terminar la llamada se genera un resumen** con la IA local a partir de los subtítulos y se **deja en la ficha**: duración, participantes, resumen, puntos clave, acuerdos, pendientes y percepción (interés y sentimiento). Si el lead ya fue convertido, también queda en su **contacto y su cuenta**; y la **reunión programada** pasa a «Realizada» con el resumen en su descripción.
- **Se le muestra al asesor donde esté**: al colgar aparece «Preparando el resumen de la reunión…» y, al estar listo, una ventana con el resumen, **Abrir la ficha**, **Copiar** y **Crear tarea con los pendientes**.
- La llamada se da por terminada cuando **el asesor sale** y no vuelve en ~45 s (aunque el cliente siga conectado). Sin subtítulos queda al menos el registro de la llamada (duración y participantes).
- **Privacidad**: el audio no se guarda; el texto de la conversación se conserva 7 días para generar el resumen y los participantes lo ven avisado antes de entrar.

### Videollamada: pantalla compartida y ficha del cliente
- **La pantalla compartida ya se ve** (antes quedaba «negra»): al ponerla en grande la ficha se estiraba a una altura enorme y el video quedaba centrado fuera de lo visible. Ahora ocupa el área de la sala y los participantes van en la columna lateral. En el panel angosto del CRM va arriba y los participantes debajo.
- **La ficha del cliente a un clic desde que se abre la llamada**: la franja del panel muestra «Cliente: <nombre>» aunque aún no haya entrado (tarjeta con estado, teléfono, correo y «Abrir la ficha» sin cortar la llamada), además de los participantes que ya están dentro.
- Las ventanitas de la sala (idioma, fondos, dispositivos) ya no tapan los botones en el panel angosto.

### WhatsApp
- Al enviar a un número que **no tiene WhatsApp** (o está mal escrito) el CRM ahora lo dice con claridad —«Ese número no tiene WhatsApp o está mal escrito (revisa que lleve el código de país)»— en vez de «Evolution API rechazó el mensaje: Bad Request». Además los celulares colombianos de 10 dígitos sin prefijo se envían con el 57.

## [1.6.0] - 2026-10-14

### Videollamada con la información del CRM
- **Tiempo de la llamada siempre visible**: reloj «⏱ 12:34» arriba de la sala (y en el panel del CRM), medido desde que la llamada empezó de verdad (no desde que entraste), igual para todos.
- **Controles del anfitrión más a mano**: sobre el video de cada participante (al pasar el cursor) los botones **Silenciar** y **Sacar de la llamada**, y lo mismo desde la tarjeta del participante en el panel del CRM; además de la lista de Personas y «Silenciar a todos». A quien sacan le sale «El anfitrión te quitó de la llamada».
- **Pasar la llamada a otra ventana sin cortarla**: el botón ahora abre una ventana nueva que **entra sola** a la misma sala y, ya conectada, el panel del CRM se cierra (antes cerraba y había que volver a iniciar).
- **Participantes con su ficha**: bajo el título del panel de la llamada aparecen los participantes («En la llamada: Uno Dock · Dos Dock»); al pulsar uno se ve su tarjeta del CRM (estado, teléfono, correo, asignado, origen) y **Abrir la ficha** lleva a ella **sin cortar la llamada**. A quien no tiene ficha se le puede buscar y vincular.
- **Invitar a la llamada a personas del CRM** (botón 👤+ del panel): se busca un lead o contacto y se le envía su **enlace personal** (WhatsApp, SMS, correo o copiar); entra ya identificado (no escribe su nombre) y queda ligado a su ficha. Sirve para reuniones grupales.

### Sala de videollamada al nivel de Meet o Zoom
- **Más personas en una llamada ya iniciada**: «Invitar a más personas» (enlace para copiar o envío por correo); cada invitado escribe su nombre y espera la admisión del anfitrión. Capacidad de la sala: 12 personas (aplica al reiniciar el servidor de video).
- **Pantalla compartida en grande y centrada**, con los participantes en una columna lateral (también al fijar a alguien con 📌, o con la «vista de orador»).
- **Panel lateral con Personas y Chat**: las **solicitudes de ingreso** aparecen en el panel (y como aviso con «Admitir / Rechazar» y sonido), con «Admitir a todos»; la lista de participantes muestra quién tiene el micrófono apagado o la mano levantada.
- **Chat interno** con mensajes, **enlaces clicables**, **imágenes con vista previa** y **archivos** (hasta 10 MB; sin ejecutables; se pegan con Ctrl+V o se arrastran), con historial para quien entra tarde.
- **Fondos virtuales** (desenfoque suave o fuerte, 6 fondos predefinidos o tu propia imagen) con segmentación de persona que corre en el navegador: nada sale de tu equipo.
- Además: **levantar la mano**, **reacciones**, resaltado de quien habla, **selección de micrófono, cámara y altavoces**, cancelación de ruido, pantalla completa, y controles del anfitrión (silenciar a uno o a todos, quitar a alguien, **bloquear la sala**, terminar para todos).

## [1.5.5] - 2026-10-14

### Agenda y recordatorios
- **La agenda va primero en la ficha del cliente** (lead, cuenta, contacto y oportunidad; detalle completo y panel lateral): bajo el encabezado, las citas, videollamadas, llamadas y tareas pendientes («Hoy 20:00», «Mañana 9:00», «En 5 min», lo vencido en rojo), con **Entrar** a la sala en las videollamadas y los botones **Agendar: Cita · Videollamada · Llamada · Tarea** para programar lo siguiente sin salir de la ficha.

### Videollamadas programadas
- **Invitación por correo al cliente** al programar una videollamada (casilla «Enviar invitación al cliente por correo», marcada por defecto) y con el botón **Enviar invitación al cliente** en la reunión: correo con el botón «Unirme a la videollamada», la fecha y hora en su zona, los enlaces **Agregar a Google Calendar / Outlook** y el archivo **.ics** (parte de calendario para Gmail/Outlook) con recordatorios 15 y 5 minutos antes.
- **Recordatorios del asesor**: toda reunión con videollamada nace con aviso en el CRM 5 minutos antes y correo 15 minutos antes (se pueden cambiar en la reunión), y el aviso global del CRM muestra «Tu videollamada empieza en N min · Entrar a la sala» desde 15 minutos antes.
- Las salas de las reuniones programadas **se reabren con el mismo código** si faltan, así el enlace que ya recibió el cliente nunca queda inválido.

## [1.5.4] - 2026-10-14

### Videollamadas
- **Enviar el enlace por el canal que prefieras, de inmediato**: además de WhatsApp, el diálogo de la videollamada ofrece **SMS**, **correo** (con tu firma) y **Telegram**, según los datos que tenga el cliente.

## [1.5.3] - 2026-10-13

### Videollamadas
- **Panel lateral en vez de ventana flotante**: la llamada se abre a la derecha como la ficha del lead (el contenido se achica y deja su espacio). El asesor elige: **pantalla completa**, **minimizada** (queda una barrita con el nombre y el cronómetro; la llamada sigue) o pestaña nueva; la X es la única que sale de la llamada (pide confirmación).
- **Volver a entrar si se cuelga por error**: si el cliente sigue en la sala y el asesor ya no está, aparece un aviso en cualquier pantalla del CRM («María sigue en la videollamada, sin ti · Volver a entrar») y en el panel «Videollamadas» de la ficha. El Hub lo sabe consultando a LiveKit quién está dentro.
- **Subtítulos: idioma visible**: botón «Subtítulos · leo en español» arriba de la sala (se abre solo la primera vez) para elegir en qué idioma habla cada quien y en cuál quiere leer; los subtítulos ya no dependen de cómo se creó la sala, sino de que el servicio esté habilitado a la empresa.

## [1.5.2] - 2026-10-13

### Videollamadas dentro del CRM
- **La videollamada se abre dentro del CRM**, en una ventana flotante que **no se cierra al cambiar de ficha, de lista o de página**: el asesor conserva la información del cliente a la vista, puede abrir otros clientes, enviar información o hacer otras actividades sin colgar. Se puede mover, ampliar, minimizar (la llamada sigue) o abrir en una pestaña nueva; al salir de la sala se cierra sola.
- **Aviso cuando el cliente llega primero, en cualquier pantalla del CRM**: un aviso amarillo con sonido («María espera en la videollamada · Entrar y admitir») para el asesor que creó la sala o que tiene asignado el lead, además del push y de la nota en el lead. «Entrar y admitir» abre la sala en la ventana flotante.
- **Cajón lateral del lead**: ahora también tiene el botón **Videollamada**.

### Videollamadas
- **El cliente ya no escribe su nombre**: la sala conoce al cliente (lead, o el registro de la reunión), así que el enlace lo saluda («Hola, María») y entra directo con su nombre del CRM; el asesor lo ve con ese nombre al admitirlo.

## [1.5.1] - 2026-10-13

### Videollamadas
- **Si el cliente llega primero**: espera en la sala de espera (el mensaje le avisa que ya se le notificó al asesor) y al asesor le llega una **notificación push**, una nota en el lead y un aviso amarillo en el panel «Videollamadas» («María espera en la videollamada · Entrar y admitir»). La sala sigue viva hasta que el asesor entre.

## [1.5.0] - 2026-10-13

### Detalle de registros
- En el detalle a pantalla completa (lead, cuenta, contacto, oportunidad) la columna izquierda (general, detalles, historia) y la derecha (asignado, documentos, comercial virtual, actividad…) **se desplazan por separado**. Con la rueda sobre una columna primero sube la cabecera del registro y, ya fija, se mueve solo esa columna.

### Enlaces y archivos en las conversaciones
- **Enlaces clicables en todas partes**: en los chats (WhatsApp, SMS, Telegram, Mensajes), correos (texto y HTML), historial de actividad y banco de conocimiento, toda dirección (`https://…`, `www.…`) y correo electrónico se muestra como hipervínculo que abre en una pestaña nueva, sin arrastrar la puntuación final.
- **Vistas previas**: las direcciones a imágenes se ven como miniatura, las de video y audio con reproductor, las de documentos (PDF, Word, Excel…) como tarjeta con icono y nombre, y los enlaces de videollamada como tarjeta «Videollamada».
- **Archivos que envía el cliente por WhatsApp** (imagen, video, audio, documento, sticker; por Evolution y Meta): se guardan como archivos del CRM y se ven en el chat con su vista previa; antes solo quedaba la etiqueta «[Imagen]». Las miniaturas de correo adjuntas también se ven en el correo.

### Centro de control
- **Gestionar empresas como los leads**: la empresa se abre en un panel a la derecha con la lista siempre visible a la izquierda (se cambia de empresa sin cerrar), botón de **pantalla completa** y pestañas Resumen, Servicios y módulos, WhatsApp, Consumo y facturación e Historial de cambios (quién y cuándo cambió qué, con los trabajos del servidor).

### Videollamadas propias (en desarrollo)
- **Programar videollamadas**: en la ficha (lead, cuenta, contacto y oportunidad) hay un panel **Videollamadas** junto a las actividades con «Iniciar ahora» y «Programar videollamada», y la lista de las ya programadas con «Entrar» y copiar enlace. La opción **Videollamada** también está en el formulario de **Reunión**, incluido el que se abre desde el **Calendario**: al guardar crea la sala propia, deja el enlace en la reunión y en su descripción (así llega en las invitaciones) y la sala dura hasta 12 horas después de que termine. El botón «Videollamada» de la cabecera ahora también está en cuentas, contactos y oportunidades.
- **La sala persiste y el cliente espera para entrar**: cada lead tiene una sala vigente (el botón «Videollamada» siempre vuelve a ella; el asesor puede cerrar la ventana y reentrar). El cliente abre el enlace, pide acceso y el asesor lo **admite o rechaza** dentro de la sala (aviso con sonido). El cliente ya no puede entrar sin que lo admitan.
- **Idioma elegido por cada persona**: en la entrada y durante la llamada (botón CC) cada quien elige en qué idioma habla y en cuál quiere leer los subtítulos (español, inglés o sin subtítulos).
- **Servicio adicional por empresa**: se habilita desde el Centro de control (*Servicios → Videollamadas*: no incluidas / videollamadas / videollamadas + subtítulos). Apagado, el botón «Videollamada» no aparece, el Hub no crea salas y los enlaces existentes dejan de funcionar.
- **Subtítulos en vivo español↔inglés, sin traducir el audio**: cada frase se transcribe con IA local (faster-whisper) y se traduce con un traductor local liviano; cada quien ve la traducción a su idioma con el original en pequeño y un botón **CC**. El audio y el texto no se guardan. Nuevo servicio `crmhub-stt` (`stt-service/`).
- Servidor de video propio (LiveKit) y sala por enlace: el asesor crea la videollamada desde el lead (botón **Videollamada**), comparte el enlace por WhatsApp y el cliente entra desde el navegador, sin cuenta. Ver `docs/modulos/VIDEOLLAMADAS.md`. 

## [1.4.1] - 2026-10-11

- Líneas de WhatsApp **administradas por Crm Hub 360** (asignadas desde el Centro de control): en las integraciones de la empresa ya no aparecen «Vincular (QR)» ni «Cambiar de número» —el QR solo lo escanea el equipo desde el Centro— y los avisos de salud dicen que nuestro equipo la atiende. El Hub también lo impone (el QR y el cierre de sesión devuelven 403 a esas líneas). Las líneas propias de la empresa conservan todas las opciones.

- Monitor: el aviso «La línea aún no está vinculada» (y «desconectada») se **cierra solo** en cuanto la línea queda conectada —al escanear el QR desde el Centro o en la siguiente revisión de 1 minuto, aunque el monitor esté apagado— y se lanza una prueba de confirmación. Antes esperaba hasta 30 minutos.

### Líneas de WhatsApp
- Centro de control: al vincular por QR la línea de una empresa (o una línea del inventario) y quedar conectada, el diálogo ofrece **Probar el envío**: manda un mensaje de WhatsApp desde esa línea al número que se indique, para comprobar que funciona. Queda auditado.

## [1.4.0] - 2026-10-11

### Líneas de WhatsApp desde el Centro de control
- Nueva pestaña **Líneas WhatsApp**: inventario de las instancias de Evolution que administramos. Se pueden **crear** líneas, **vincularlas por QR**, reiniciarlas, cambiar de número, **asignarlas a una empresa** como **principal** (la predeterminada) o **adicional** (otra tarjeta con interruptor y «Enviar desde»), **moverlas** de una empresa a otra sin volver a escanear, quitarlas y eliminar las libres. Al asignar se apunta el webhook al Hub de la empresa con la clave propia de la instancia; al quitar o mover se **desactiva** el webhook para que los mensajes de una línea libre no creen leads en la empresa anterior. Todo auditado.
- El CRM explica claramente el error de envío cuando la línea está desconectada («la sesión se cerró… vuelve a vincularla con «Vincular (QR)» o pide a soporte que la vincule desde el Centro») en vez de mostrar el error 500 de Evolution.
- El monitor detecta si una línea comparte teléfono con la **línea de pruebas** (una línea no puede probarse a sí misma) y lo avisa como «Mismo teléfono que la línea de pruebas».

## [1.3.0] - 2026-10-11

### Monitor de WhatsApp (Evolution) en el Centro de control
- Nueva pestaña **Monitor WhatsApp**: una **prueba de extremo a extremo** de cada línea de Evolution de las empresas. Cada línea escribe periódicamente a una **línea de pruebas** nuestra, que responde sola; si la respuesta no llega se detecta «no recibe mensajes» (sesión abierta pero sorda), «no entrega», envío rechazado, desconexión, instancia inexistente o línea sin vincular, y se abre una **alerta** (insignia en la pestaña, correo y WhatsApp), se reinicia la instancia una vez (opcional) y se avisa al recuperarse. Estado por línea con historial de pruebas y tiempo de respuesta.
- **Vinculación por QR desde el Centro** (botón *QR* en el monitor y *WhatsApp (QR)* en la ficha de cada empresa): se puede escanear el QR de la empresa para que el cliente no tenga que hacerlo solo; incluye reiniciar la línea y cambiar de número. Auditado.
- La tarjeta de la línea en *Integraciones → Mensajería* muestra «Monitoreada por Crm Hub 360: funciona» o el problema detectado con la guía para resolverlo.
- Nuevas tablas `evo_probes`, `evo_health` y `evo_alerts`; el Hub reconoce el «pong» sin crear leads. Desactivado por defecto: requiere configurar la línea de pruebas (ver `docs/modulos/MONITOR-WHATSAPP.md`).

### Monitor de canales (Meta, Gupshup y Twilio) y consumo
- El monitor ahora vigila también las líneas de **Meta** (`health_status`, estado y calidad del número), **Twilio** (cuenta activa y saldo) y **Gupshup** (clave válida) consultando su API, con alertas, correo y WhatsApp como en Evolution; la tarjeta de la línea muestra su estado y métricas. La pestaña pasa a llamarse **Monitor de canales**.
- **Libro de consumo** en el Hub y pestaña **Consumo** del Centro de control: cada mensaje, SMS (segmentos), llamada (minutos) y correo se mide por empresa, canal y proveedor, con tarifario (costo y precio), margen y exportación CSV; base de la recarga prepago y del postpago. Investigación y diseño en `docs/investigacion/`.
- La Graph API de Meta pasa de `v21.0` (a punto de vencer) a `v25.0`.
- Corregido: la primera escritura de estado de una línea nueva en el monitor se perdía.

### Corrector ortográfico
- Todos los campos de texto libre (cajas de mensaje de WhatsApp/SMS/Telegram, correos y asuntos, notas, descripciones y el editor de texto) se escriben con el corrector del navegador **en español** (`lang="es"` y `spellcheck`); no se aplica a usuario, claves, correos, teléfonos, números ni identificaciones. La página completa declara `lang="es"`. El navegador debe tener el diccionario en español instalado (Chrome: Configuración → Idiomas → Revisión ortográfica).

### Página «Mensajes»
- Nueva página **Mensajes** en el menú (grupo Actividad, junto a Llamadas y Correos): la bandeja de conversaciones de **WhatsApp, SMS y Telegram** del usuario. A la izquierda las conversaciones por lead (último mensaje, hora, canales, punto de «sin leer», filtros «Mis conversaciones / Todas» y por canal, búsqueda y búsqueda de otros leads para empezar una conversación); a la derecha el chat del lead con **una pestaña por canal**, cada una con su propio espacio de conversación (hilo, caja para escribir, plantillas, sugerencia con IA y elección de número y de línea de envío). Los canales se muestran solo con su icono (el nombre aparece al pasar el mouse) y **RCS** aparece bloqueado como «próximamente». Se actualiza sola (websocket, cada 12 s y al volver a la pestaña).
- El chat se extrajo a un componente común (`custom:views/chat-pane`) que usan la página y el panel acoplado del lead. Nuevo endpoint `GET /CrmHub/conversations` (respeta los permisos de Espo).

### Estados de los leads
- El tablero Kanban ahora muestra también la columna **Perdido** (antes estaba excluida, y por eso no se podía arrastrar un lead allí aunque aparecía en «Estados del pipeline»). **Convertido** sigue sin columna a propósito: se asigna con el botón *Convertir* del lead, que crea la cuenta y el contacto.
- El aviso «Guardando…» ya no se queda fijo arriba mientras se pide el comentario del cambio de estado.
- El diálogo de cambio de estado, el historial y las notas muestran «Perdido» y «Convertido» en vez de los nombres de fábrica `Dead` y `Converted`.

### Salud de las líneas de WhatsApp (Evolution)
- La tarjeta de cada línea de Evolution muestra cuándo llegó el último mensaje de un cliente (y avisa en ámbar si hace más de 24 h que no llega nada). Un estado «conectado» no garantiza que la sesión de WhatsApp esté recibiendo mensajes: tras una desconexión (código 401) y una nueva vinculación puede quedar «abierta» pero sorda. El Hub anota cada llamada del webhook en la tabla `kv` (`wa_evt:` y `wa_in:`).

### Paneles de llamada y de correo
- **Llamada:** el panel dejó de verse como un teléfono pequeño y oscuro (chocaba con una regla antigua de la vista previa de plantillas) y ahora tiene el mismo estilo que el chat de WhatsApp: botón grande «Llamar a …», acciones secundarias, formulario para registrar una llamada hecha y la lista de llamadas con su estado, duración y **quién la hizo**.
- **Correo:** la lista era ilegible (el asunto se partía palabra por palabra). Ahora cada correo es una tarjeta con asunto, fecha, quién lo envió o de quién viene, y una vista previa; al hacer clic se abre **el detalle dentro del mismo panel** con el mensaje completo (en un marco aislado, sin scripts), adjuntos, «Responder» y «Abrir en el CRM». Redactar sigue en el mismo panel.

## [1.2.0] - 2026-10-11

### Corregido
- **Quién hizo cada cosa:** cada mensaje, llamada, correo y cambio de estado dice quién lo realizó, sin deducirlo del usuario asignado al lead (pudo atenderlo otra persona, un supervisor, el gerente o un comercial virtual). Los mensajes del comercial virtual se marcan «(comercial virtual)» y llevan un icono; los de formularios, «Formulario web (automático)»; lo escrito directamente desde el celular de la línea de Evolution, «Celular de la línea» (antes «Asesor»); los cambios de estado del comercial virtual dejan de aparecer hechos por `hub-api`; las llamadas se atribuyen a quien las hizo; y los correos automáticos guardan su remitente real. En el chat de WhatsApp también se ve el nombre del cliente en sus mensajes.
- **Mensajes entrantes de WhatsApp (Evolution):** ahora se registran los que llegan envueltos como mensajes temporales o «ver una vez», y las fotos, videos, audios y documentos (como «[Imagen] texto», «[Audio]»…). Antes se descartaban sin dejar rastro.
- Con un panel acoplado abierto (WhatsApp, llamada, correo) la página del detalle del lead no se podía desplazar: Bootstrap bloqueaba el scroll del `body`. Ahora la información de atrás se puede recorrer mientras escribes.

### Mensajes automáticos de WhatsApp
- **Negrillas:** el nombre de la empresa y el del comercial/asesor van en negrilla (`*texto*`), y la IA resalta de 2 a 4 palabras clave. También en las acciones de WhatsApp de los formularios (nueva variable `{{asesor}}`) y en los mensajes masivos (empresa).
- **Botones de respuesta rápida:** los mensajes proactivos del comercial virtual (primer contacto y seguimientos) llevan botones configurables (por defecto «Sí, me interesa», «Más información», «Ahora no»); nativos con Meta y numerados en los demás proveedores. Las acciones de WhatsApp de los formularios admiten 2–3 botones propios. Ajustes en *Comercial virtual → Mensajes con opciones* (con «Probar en mi WhatsApp»).

## [1.1.0] - 2026-10-11

### Detalle del lead
- **Usuario asignado:** cuando lo atiende un comercial virtual, la tarjeta lateral dice «Comercial virtual · nombre» en vez de «Ninguno».
- **Creado / Modificado:** muestran el origen del lead (p. ej. «Formulario Web: Expediciones a montañas», «WhatsApp») o «Sistema automático» / «Comercial virtual» en vez del usuario técnico `hub-api`. Campo nuevo `originDetail` (lo llenan los formularios).
- **Identificación temporal:** si un lead llega sin cédula/NIT se guarda el celular o el correo (ajuste `crmhubIdTemp`) marcado como temporal (`identificationIsTemp`), con aviso en el encabezado y en el campo; al escribir la real la marca se quita sola. Con `crmhubIdRequired` (por defecto sí) una persona no puede pasar el lead a «Calificado» ni a «Cierre exitoso» con identificación temporal; los comerciales virtuales y las integraciones no se bloquean. Se configura en *Estados del pipeline → Identificación del cliente*. `tenant:ui` rellena una vez los leads antiguos sin identificación.

### Seguridad
- **Las sesiones ahora se cierran.** Antes EspoCRM dejaba la sesión abierta hasta 48 h sin uso (y sin límite de duración), y como las pestañas abiertas consultan el servidor solas, nunca vencían. Ahora: cierre automático tras 30 minutos sin actividad real de la persona (con aviso «¿Sigues ahí?» 60 s antes, compartido entre pestañas), vida máxima de la sesión de 12 h y caducidad en el servidor tras 1 h sin ninguna consulta (pestaña cerrada). Los valores se aplican con `tenant:ui` solo si siguen en el de fábrica, y el tiempo del navegador es el ajuste `crmhubIdleMinutes` (0 = desactivado).

## [1.0.0] - 2026-10-10

Primera versión etiquetada. Reúne todo lo construido hasta hoy y la documentación completa del código.

### Plataforma
- CRM multi-empresa sobre EspoCRM 10 + PostgreSQL (una BD y un rol por empresa), Hub Service (FastAPI) y Centro de control (FastAPI).
- Entornos: dev, prod y la empresa cliente `gestor-360`; base de producción congelada con `release:publish`; respaldos diarios con `bin/backup`.
- Licencias y servicios por empresa desde el Centro: plantillas por usuario, comercial virtual (y cuántos), política de mensajes masivos, motor de IA, correo y proveedores aliados.

### Leads, asignación y calificación
- Calificación por servicios y filtros, asignación automática (campaña → equipos → menor carga), reasignación, tablero Kanban, historial de estados y de actividades.
- Reporte de crédito con IA local (reglas deterministas de pre-aprobación) y lectura de documentos PDF en el lead.
- Copias de seguridad y limpieza de leads para administradores.
- Panel gerencial en vivo; los leads atendidos por un comercial virtual ya no cuentan como «Sin asesor» y aparecen con su nombre.

### Mensajería
- Varias líneas por canal (WhatsApp, SMS, voz, Telegram) con interruptor, prueba, línea principal y «Enviar desde».
- Proveedores: Evolution, Meta, Gupshup, Twilio y HTTP genérico; cambio de número de Evolution.
- Mensajes masivos con política de 100 destinatarios por campaña y 1 mensaje cada 2 minutos en Evolution (configurable por empresa).
- Correo «como el usuario» con firma y respuestas por alias; todo correo de Espo sale con la marca de la empresa.

### Comercial virtual
- Entrenamiento, simulador y banco de conocimiento; mensajes con opciones (lista o botones) configurables.
- Varios comerciales virtuales por empresa, cada uno con su entrenamiento e interruptor; reparto de leads entre personas y agentes (compartido o por pesos intercalados).
- Motor de IA a elección: Claude, compatible con OpenAI u Ollama.

### Formularios web
- Diseño: encabezado con imagen, fondo, colores del botón, ancho por campo.
- Campos condicionales y acciones al recibir: correo (imágenes, PDF adjunto, botón de WhatsApp), WhatsApp o aviso «Nuevo registro» al equipo, según una respuesta.
- Opción de no registrar dos veces al mismo cliente.
- Galería de 8 plantillas listas (turismo, deudas, inmobiliaria, citas, cursos, seguros, evento, contacto) y botón Duplicar.

### Experiencia
- Notificaciones de lead nuevo (campana y push), listas y paneles que se actualizan solos, actualización automática de la app en reposo, aviso de nueva versión en el CRM y en el Centro.
- Tablas con búsqueda, paginación, encabezado fijo y scroll interno; ilustraciones animadas en estados vacíos; modo claro/oscuro; PWA instalable.
- Manual de usuario por rol dentro del CRM.

### Corregido
- Cruce de notificaciones entre empresas (websocket compartido).
- «Sin asesor» en el panel cuando atendía el comercial virtual.
- Error 400 de Claude por el parámetro `temperature`.

### Documentación
- Docstrings en todos los módulos Python, cabeceras en todo el JavaScript del cliente y docblocks en el PHP.
- Carpeta `docs/` (arquitectura, operación, versionado, desarrollo, módulos), manual en Markdown y referencias generadas con `bin/gen-docs` (API del Hub, del Centro, rutas de Espo, módulos, historial).
- Versionado SemVer con etiquetas anotadas mediante `bin/tag-release`.
