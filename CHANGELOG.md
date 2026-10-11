# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado [SemVer](https://semver.org/lang/es/). Cómo se publica una versión: [`docs/VERSIONES.md`](docs/VERSIONES.md). El historial completo de commits está en [`docs/referencia/HISTORIAL.md`](docs/referencia/HISTORIAL.md).

## [Sin publicar]

- Líneas de WhatsApp **administradas por Crm Hub 360** (asignadas desde el Centro de control): en las integraciones de la empresa ya no aparecen «Vincular (QR)» ni «Cambiar de número» —el QR solo lo escanea el equipo desde el Centro— y los avisos de salud dicen que nuestro equipo la atiende. El Hub también lo impone (el QR y el cierre de sesión devuelven 403 a esas líneas). Las líneas propias de la empresa conservan todas las opciones.

- Monitor: el aviso «La línea aún no está vinculada» (y «desconectada») se **cierra solo** en cuanto la línea queda conectada —al escanear el QR desde el Centro o en la siguiente revisión de 1 minuto, aunque el monitor esté apagado— y se lanza una prueba de confirmación. Antes esperaba hasta 30 minutos.

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
