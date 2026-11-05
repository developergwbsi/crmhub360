# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado [SemVer](https://semver.org/lang/es/). Cómo se publica una versión: [`docs/VERSIONES.md`](docs/VERSIONES.md). El historial completo de commits está en [`docs/referencia/HISTORIAL.md`](docs/referencia/HISTORIAL.md).

## [Sin publicar]

## [1.27.17] - 2026-11-05

### Mejorado
- **Presentación de Gestor360: sección de Listo360 con capturas de la app** (inicio, información y horarios de la sede, ingreso de clientes) y tarjetas de cotizar, trazabilidad e información de la sede; texto de autogestión del cliente. Todas las capturas llevan nombre, logo, dirección y teléfono de ejemplo (sin marcas de clientes reales).

## [1.27.16] - 2026-11-05

### Corregido
- **Presentación de Gestor360: se quita la captura de reportes gerenciales**, que mostraba cifras de un cliente real. Se volverá a poner con una captura de una cuenta de pruebas.

## [1.27.15] - 2026-11-05

### Mejorado
- **Presentación de Gestor360: los chatbots no son solo de ventas:** la sección del chatbot ahora dice que sirven para ventas, servicio al cliente (SAC: consultas, quejas y reclamos) y cualquier proceso de atención, e incluye dos ejemplos nuevos.

## [1.27.14] - 2026-11-05

### Mejorado
- **Presentación de Gestor360 (página y PDF) más completa:** nueva sección del chatbot de ventas y atención 24/7 por WhatsApp (toma pedidos, catálogo, estado del pedido, ubicación y horarios, agenda, traspaso a una persona) con la imagen del editor de flujogramas; seguimiento de pedidos en vivo con el panel de despacho y el rastreador del cliente; y ventas y reportes gerenciales con sus capturas. Las capturas llevan los nombres de clientes difuminados o recortados. Las imágenes anchas ahora ocupan todo el ancho del PDF.

## [1.27.13] - 2026-11-05

### Mejorado
- **Buscador: una búsqueda por rubro en cada pasada:** en vez de trabajar un solo nicho por pasada, ahora busca en paralelo hasta 4 rubros a la vez (los que menos prospectos han traído en los últimos 14 días, p. ej. muebles, colchones, cosméticos, dulces) y reparte entre ellos el cupo de la pasada. Trae más candidatos y más variados.

## [1.27.12] - 2026-11-05

### Añadido
- **Nuevo estado del pipeline de leads: «Standby (en pausa)»:** para leads que se dejan en espera sin perderlos ni cerrarlos. Aparece como columna del tablero, como tarjeta en la página de Leads y en el selector de estado. Mientras un lead está en Standby, el comercial virtual no le escribe ni le da seguimiento; al sacarlo de Standby, el seguimiento se puede retomar.

## [1.27.11] - 2026-11-04

### Corregido
- **Buscador: la pasada de la tarde ya no se cae si el modelo devuelve un candidato mal formado:** se ignoran los textos sueltos y se procesan solo los candidatos completos; si algo falla, el motivo queda registrado con detalle.

## [1.27.10] - 2026-11-04

### Corregido
- **Leads: la página ya no se desplaza, solo el contenido:** el título, las tarjetas por estado, el buscador con sus filtros y los nombres de cada estado quedan fijos; lo que se desplaza es la lista de leads dentro de cada estado (cada columna con su propio scroll) o, en la vista de tabla, las filas, con el encabezado de la tabla fijo. Se ajusta solo al alto de la ventana; en pantallas pequeñas (celular o menos de 520 px de alto) sigue como antes.

## [1.27.9] - 2026-11-04

### Añadido
- **Leads con tarjetas por estado:** arriba de la lista y del tablero hay una tarjeta por estado (Todos, Nuevo lead, En calificación, Calificado, Enfriamiento/contactado, Cierre exitoso; Perdido y Convertido cuando hay) con su cantidad. Un clic filtra la lista por ese estado; «Todos» quita el filtro.

### Corregido
- **Selector tabla/tablero en la esquina derecha:** los íconos para cambiar entre lista y tablero quedaban en el centro, en una fila aparte; ahora están a la derecha, en la misma fila del buscador.

## [1.27.8] - 2026-11-04

### Corregido
- **Tablero de leads con muchos leads en un estado:** al bajar la página, la fila de estados (nombres y buscadores) se metía debajo del encabezado y reaparecía de golpe más abajo; ahora queda fija justo bajo el encabezado desde el primer momento, alineada con sus columnas, sin saltos.

## [1.27.7] - 2026-11-03

### Corregido
- **El buscador ya no trae grandes empresas:** al ampliar la búsqueda a pymes y micropymes la primera pasada trajo marcas grandes (Éxito, Arturo Calle, Bold). Ahora la instrucción pide expresamente negocios de 1 a ~200 empleados, excluye multinacionales, cadenas y marcas nacionales conocidas, y las consultas de búsqueda (ahora 6 en vez de 4) apuntan a negocios locales por ciudad, barrio o sector.

## [1.27.6] - 2026-11-03

### Añadido
- **Segunda pasada del buscador en la tarde:** en Prospección → Buscador hay un campo «Segunda pasada, en la tarde» (vacío = solo una). Cada pasada corre el ciclo completo (busca, califica y pasa al comercial virtual) y el tope diario de empresas se reparte entre las dos.

### Corregido
- **Lectura de sitios más precisa:** ya no confunde un celular con un teléfono fijo, entiende los fijos con indicativo 60X (p. ej. 605 388 5152), se queda con el WhatsApp que más se repite en el sitio (ignora el de la agencia que lo diseñó, que aparece en el pie) y conserva el enlace completo de los perfiles de Facebook tipo `profile.php?id=…`.

## [1.27.5] - 2026-11-03

### Corregido
- **El buscador lee teléfonos fijos, celulares y direcciones escritos como texto:** antes solo veía los que estaban como enlace (`tel:`, WhatsApp) y se perdía los de sitios que los escriben en la página, como el PBX y la dirección de Plásticos Línea Líder. Los fijos se guardan en la ficha del prospecto, se ven bajo el teléfono en Prospección y viajan a la descripción del lead; el campo de teléfono de contacto sigue siendo solo para celulares.

## [1.27.4] - 2026-11-03

### Añadido
- **El buscador de prospectos lee el sitio de cada empresa:** además de lo que traía el motor de búsqueda, ahora abre la portada y las páginas de contacto/sedes del sitio propio de la empresa y recupera el correo de su dominio (prefiere info@, contacto@, comercial@ y descarta contabilidad, nómina, etc.), el teléfono, el WhatsApp, las redes y la dirección. Lo que antes quedaba solo con teléfono ahora puede tener correo. Los prospectos «ready» sin correo se completan igual en cada pasada. No se toman datos de redes sociales ni de fichas en directorios o centros comerciales.
- **Lo recuperado se ve y viaja al CRM:** la tabla de Prospección muestra, bajo cada empresa, qué hace (descripción de su sitio), la dirección y enlaces a sus redes; bajo el correo, los otros correos que publica; bajo el teléfono, su WhatsApp. Al pasar el prospecto al CRM, todo eso queda en la descripción del lead.

### Corregido
- **Las tarjetas del tablero abren la misma lista de la barra lateral:** antes «Leads captados», «Sin asesor», etc. llevaban a una pantalla aparte; ahora abren la lista normal del módulo (mismo tablero por etapas, buscador y filtros) ya filtrada, con un aviso arriba que indica de qué cifra viene y un botón «Quitar filtro» (y «Repartir automáticamente» en «Sin asesor»).

## [1.27.3] - 2026-11-03

### Añadido
- **Notificaciones con buscador y tarjetas:** el panel de la campana y la página completa tienen un buscador arriba que filtra por cualquier texto (también lo que se cargue con «Mostrar más»). En la página completa cada aviso es una tarjeta agrupada por día (Hoy, Ayer o la fecha), y el título y el buscador quedan fijos mientras se desplaza la lista.

## [1.27.2] - 2026-11-03

### Corregido
- **Notificaciones: el panel de la campana ya se cierra** al abrir un aviso (antes se quedaba abierto encima de la pantalla a la que ibas).

### Añadido
- **Notificaciones: «Ver todas las notificaciones»** al pie del panel de la campana lleva a la página completa (`#Notification`), que ahora ocupa todo el ancho, sin recorte ni barra de desplazamiento interna y con las mismas filas ordenadas del panel.

## [1.27.1] - 2026-11-03

### Cambiado
- **PIN: ojo para ver lo que escribes:** los campos de contraseña y PIN de los diálogos del PIN (crear, cambiar, activar, quitar) y el de la pantalla de acceso con PIN tienen el ícono del ojo para mostrar u ocultar lo escrito.
- **Notificaciones (campana) ordenadas:** cada aviso tiene margen a los costados, el avatar al lado del texto, la fecha debajo alineada con el mensaje, líneas separadoras y un botón «Mostrar más» de ancho completo; el listado se desplaza dentro del panel.

## [1.27.0] - 2026-11-03

### Añadido
- **PIN de reingreso:** al entrar con contraseña, si la persona no tiene PIN se le pregunta si quiere crear uno (4 a 6 números, repetido y confirmado con su contraseña; se rechazan los obvios como 1234 o 0000). La próxima vez que vuelve a ese equipo la pantalla de acceso pide solo el PIN, con la opción «Prefiero usar mi contraseña». El PIN va unido al equipo (un código largo guardado en ese navegador), se guarda con hash, tras 5 intentos fallidos se bloquea 15 minutos y los equipos dejan de valer, y no se ofrece a quien usa verificación en dos pasos. En el menú del usuario hay «Mi PIN de ingreso» para cambiarlo (con la contraseña, si lo olvidó), activarlo en este equipo, olvidar este equipo o quitarlo. Hub: `/v1/pin*` (tablas `user_pin` y `pin_device`); CRM: `CrmHub/pin*` y el público `CrmHubPin/login`, que entrega un token de sesión del CRM.
- **Tableros: las cifras llevan a los registros:** en los tableros del escritorio y de Reportes, pulsar una cifra, una barra o porción de la gráfica, o una fila de la tabla abre la lista de los registros que suma (leads, oportunidades, tareas, reuniones, llamadas, cuentas o contactos), con los permisos de la persona (`CrmHub/biIds`).

### Cambiado
- **Inicio ya no repite el «Panel gerencial»:** si la persona ya fijó sus tableros en el escritorio, el panel que llega por defecto se oculta (un botón «Ver el panel gerencial» lo vuelve a mostrar y recuerda la elección). Sin tableros fijados, el panel por defecto se sigue viendo.

## [1.26.7] - 2026-11-03

### Añadido
- **Prospección: editar y completar datos con registro de quién lo hizo:** cada prospecto tiene un lápiz para corregir empresa, persona de contacto, cargo, correo, teléfono, país, sector, tipo de cliente y notas, y un botón «Agregar prospecto» para escribir uno a mano. Se valida igual que una importación (correo existente, teléfono, lista de no contactar, duplicados). Cada cambio queda en una bitácora con la persona, la fecha, el valor anterior y el nuevo, visible en el historial del prospecto y como «Editado por…» en la lista. Al cambiar su perfil se vuelve a analizar con IA, y un prospecto rechazado por un correo mal escrito vuelve a estar listo al corregirlo.

## [1.26.6] - 2026-11-03

### Cambiado
- **Prospección, lista de prospectos con columnas separadas:** ahora hay una columna para la **empresa**, otra para la **persona de contacto** (con su cargo), otra para el **correo** y otra para el **teléfono**, en lugar de mezclar el contacto en una sola.

## [1.26.5] - 2026-11-03

### Corregido
- **Tableros repetidos en Inicio:** la galería avisa que «Gerencial comercial» es casi igual al «Panel gerencial» que ya trae el escritorio, para no tener el mismo panel dos veces.

## [1.26.4] - 2026-11-03

### Corregido
- **Inicio con la parte de arriba fija:** el panel «Mis tableros», el selector de periodo y las tarjetas de indicadores del panel gerencial quedan fijos bajo las pestañas del escritorio; solo se desplaza el contenido.

## [1.26.3] - 2026-11-03

### Corregido
- **Pestañas del escritorio (Panel gerencial / Mi día):** vuelven a quedar a la derecha, junto al menú de tres puntos, donde estaban.

## [1.26.2] - 2026-11-03

### Cambiado
- **Inicio con el mismo estilo del resto:** barra de tableros con degradado, pestañas del escritorio segmentadas, panel gerencial y tableros en tarjetas redondeadas con encabezado suave, indicadores con degradado y efecto al pasar el cursor, y sin subrayados. Los indicadores del panel gerencial ya no se pegan arriba ni tapan el contenido al desplazarse.

## [1.26.1] - 2026-11-03

### Corregido
- **Elegir un tablero ya armado:** cada tarjeta de la galería indica si ya hay datos para llenarlo («Con datos: 7 leads» o «Aún sin datos…»), y los que tienen datos salen primero, para que no quede una tarjeta vacía. Al elegir uno se puede **reemplazar** los tableros que ya estaban en el escritorio (casilla marcada por defecto; no se borran).

## [1.26.0] - 2026-11-03

### Añadido
- **10 tableros ya armados para el escritorio:** en *Inicio* hay un botón «Elegir un tablero» con una galería (Gerencial comercial, Actividad del equipo, Cartera y cobranza, Oportunidades y ventas y seis nuevos: Captación y marketing, Embudo y conversión, Reuniones y videollamadas, Llamadas y contact center, Clientes y Desempeño por asesor). Cada uno indica para qué actividad sirve; al elegirlo se crea con sus reportes y queda fijado en Inicio. También se puede armar uno propio. La galería se ve igual en *Reportes y tableros → Nuevo tablero*.

## [1.25.1] - 2026-11-03

### Corregido
- **Escalado de la prospección:** faltaban registrar las rutas de la tarjeta; ya carga y guarda.

## [1.25.0] - 2026-11-03

### Añadido
- **Escalado de la prospección por niveles:** un solo control (6 niveles) ajusta a la vez las empresas que busca el buscador, los prospectos que pasan a Valeria y los correos en frío por día. En modo automático evalúa cada noche: sube un nivel con resultados sanos (rebotes y bajas bajo 2 %, días con envíos, respuestas, créditos) y baja si los rebotes llegan al 5 % o las bajas al 3 %. En modo manual solo recomienda. Siempre muestra la recomendación y lo que acarrea cada nivel; subir a mano por encima de lo recomendado pide confirmar. Tarjeta en *Comercial virtual → Agentes de prospección*, manual 9h.

## [1.24.4] - 2026-11-02

### Cambiado
- **Respuestas automáticas con pestaña propia:** ahora hay una pestaña «Respuestas automáticas» en *Integraciones* y otra en *Comercial virtual*, con el formulario completo en la página (indicadores de estado, saludo, fuera de horario, menú, palabras clave, acciones y respaldo) en lugar de un cuadro emergente. El botón de WhatsApp y la tarjeta de Integraciones llevan a esa pestaña.

## [1.24.3] - 2026-11-02

### Corregido
- **La parte de arriba de las pantallas propias queda fija al desplazarse:** el título, las tarjetas de indicadores y las pestañas se apilan bajo el encabezado de la página (Comercial virtual, Integraciones, Asignación de leads, Estados del pipeline, Procesos, Copias, Organigrama, Grabaciones, Plantillas, Simulador, Banco de conocimiento, Usuarios, Equipos y Campañas); solo se desplaza el contenido. Para ocupar poco espacio, los indicadores se compactan, las pestañas van en una sola fila y la descripción del título se pliega al desplazarse.

## [1.24.2] - 2026-11-02

### Cambiado
- **Las respuestas automáticas de WhatsApp ahora se encuentran fácil:** botón «Respuestas automáticas» junto a «Agregar proveedor de WhatsApp» (Integraciones → Canales de mensajería) y una tarjeta «Respuestas automáticas» arriba en Integraciones que muestra si están activas y abre el editor. Antes solo aparecían al cambiar quién responde en la línea. El manual de usuario indica la nueva ruta.

## [1.24.1] - 2026-11-02

### Cambiado
- **Manual de usuario:** el ejemplo real de las respuestas automáticas de DigitalAlliance Hub (saludo, fuera de horario, menú con presentaciones de los tres productos, demostración, hablar con una persona y palabras clave) y dónde se configuran.

## [1.24.0] - 2026-11-02

### Añadido
- **Respuestas automáticas de respaldo cuando nadie puede atender:** los mensajes predefinidos de WhatsApp ahora pueden activarse como respaldo —fuera del horario de los asesores y sin comercial virtual en línea— aunque la línea la atiendan personas. Cada opción del menú y cada palabra clave puede, además de responder, **avisar a una persona del equipo** (nota en el lead y notificación a su asesor) o **crear una tarea de llamada**. El editor trae ideas listas para agregar con un clic: horarios y ubicación, medios de pago, hablar con una persona, que me llamen, estado de mi pedido y precios.

### Cambiado
- **Manual de usuario** con dos secciones nuevas: «9f. Créditos, costos y recargas» y «9g. Respuestas automáticas cuando nadie puede atender», y la mención del motor de IA actualizada a la nueva forma de configurarlo.

## [1.23.4] - 2026-11-02

### Cambiado
- **Administración**: las secciones pasan de una columna angosta a tarjetas en dos columnas a todo el ancho (cada tarjeta con su título y sus opciones con ícono y descripción), con el buscador más grande.
- **Ficha del usuario (ver y editar) y Preferencias** estrenan un encabezado de perfil con degradado: avatar grande, nombre, usuario, etiquetas de estado, tipo y roles, y los datos clave (equipos, correo, teléfono y último acceso). Preferencias ocupa todo el ancho.

## [1.23.3] - 2026-11-02

### Cambiado
- **Procesos de leads, Copias y limpieza de leads, Estados del pipeline, Organigrama y Grabaciones** con franja de indicadores en el diseño de la plataforma (procesos y ejecuciones con error; leads, copias y espacio; estados abiertos, cerrados y ocultos; equipos, personas y gente sin equipo; grabaciones y espacio usado).
- **Panel de notificaciones** renovado: encabezado con degradado, tarjeta redondeada con sombra, filas con más aire y resaltado al pasar el cursor.
- **Administración, Preferencias y Acerca de** con el mismo estilo: tarjetas redondeadas, pestañas segmentadas, filas con resaltado y buscador más cuidado.

## [1.23.2] - 2026-11-02

### Cambiado
- **Usuarios, Equipos y Campañas** estrenan franja de indicadores (usuarios activos, administradores, regulares y sin equipo; equipos, personas activas y sin equipo; campañas activas, en planificación y completadas) y una lista más cuidada: buscador a todo el ancho, tabla en tarjeta redondeada y encabezado suave.
- **Banco de conocimiento, Mis plantillas, Simulador del proceso comercial, Consultas web y Formularios internos** con indicadores en el diseño de la plataforma (el simulador muestra qué canales están listos para la prueba; las plantillas, cuántas hay por canal; las consultas y los formularios, cuántos hay y cuántos están activos).

### Corregido
- En **Mensajes masivos** el botón «Nueva campaña» ya no queda montado sobre la tarjeta: el encabezado de las páginas propias ordena título y botón en una fila y la tarjeta ocupa todo el ancho.
- En «Mis plantillas» el ícono del canal seleccionado ya no se pierde.

## [1.23.1] - 2026-11-02

### Cambiado
- **Avatares de usuario renovados:** quien no ha subido su foto ahora tiene un avatar con degradado profundo (nueve combinaciones, siempre la misma para la misma persona), brillo suave e iniciales en blanco, en lugar del círculo plano pastel con letras. Todos los avatares llevan un aro limpio con sombra y el del menú superior un anillo de color. La foto subida por el usuario se sigue mostrando igual.

### Cambiado
- **El diseño unificado llega a todas las pantallas propias**: Asignación de leads, Estados del pipeline, Organigrama, Procesos de leads, Banco de conocimiento, Grabaciones, Mis plantillas, Formularios internos, Consultas web, Reportes y tableros, Copias de leads, Mensajes masivos y Mensajes. Títulos, tarjetas y paneles redondeados con sombra suave, pestañas segmentadas, tarjetas de indicadores, botones y tablas con el mismo aspecto.
- **Asignación de leads** estrena su franja de indicadores (habilitados para recibir leads, método de reparto, leads abiertos y campañas activas).

## [1.23.0] - 2026-11-02

### Cambiado
- **Diseño unificado de la plataforma** (el de «Saldo y recargas») en *Comercial virtual*, *Prospección* e *Integraciones*: pestañas segmentadas, tarjetas redondeadas con sombra suave, tablas con encabezado suave y etiquetas de color, botones y campos más pulidos, texto de las opciones en minúsculas normales y tema oscuro con las mismas variables.
- **Franjas de indicadores** con íconos: *Comercial virtual* (comerciales encendidos, en automático, leads activos y mensajes del mes), *Prospección* (contactados, respondieron, demos, pasaron a una persona, listos, en el CRM, pasados hoy y rechazados, todo a lo ancho) e *Integraciones* (saldo de créditos, motor de IA y buscador web, cada una lleva a su pestaña).

## [1.22.1] - 2026-11-02

### Cambiado
- **Saldo y recargas con un diseño renovado:** tarjeta de saldo destacada (cambia de color si el saldo está bajo o en cero) con su equivalente en pesos, usados del mes, obsequio mensual y última recarga; paquetes de recarga con el precio por crédito, el ahorro y el más elegido; lo que cuesta cada servicio en créditos y en pesos; y movimientos con filtros de entradas y consumo. Las empresas de uso interno también ven los paquetes para poder probar el pago.

## [1.22.0] - 2026-11-02

### Añadido
- **Créditos y recargas (DigitalAlliance Hub como proveedor de todo).** Cada empresa compra créditos prepagados con los que paga lo que usa de la plataforma: IA de los agentes, búsqueda de prospectos y, si así se define para esa empresa, correo, SMS, WhatsApp y llamadas. Lo que corre con proveedores propios de la empresa no descuenta. Ya no hay motor de IA ni buscador «predeterminados» gratis: la empresa elige entre **los suyos** o **créditos de DigitalAlliance Hub** (recomendado).
- **Saldo y recargas** (*Integraciones → Saldo y recargas*): saldo, obsequio del mes, lo que cuesta cada cosa, paquetes de recarga con pago en **Wompi** y movimientos. Los créditos se acreditan solo con el evento firmado de Wompi (una sola vez por pago).
- **Sin créditos, se detiene** lo que usa la plataforma (IA, buscador, ciclo diario del motor comercial, y los canales cobrados) con un aviso claro; lo que corre con proveedores propios sigue.
- **Centro de control → Créditos y recargas**: precio del crédito, recarga mínima, paquetes, créditos que cuesta cada servicio, llaves de Wompi (pruebas o producción), saldo por empresa, obsequio mensual, canales que se cobran, marca de «uso interno» (sin cobro) y ajuste manual de saldo con motivo; todo auditado.

### Cambiado
- Las empresas de uso interno (dev, prod y gestor-360) quedan marcadas «sin cobro» para no frenar el motor comercial.

### Añadido
- **Nichos de mercado a elección de la empresa** (*Prospección → Cliente ideal*): los nichos son fichas que se agregan y se quitan (con sugeridos de un clic); el buscador trabaja los nichos por turnos, yendo cada vez al que menos prospectos ha traído en los últimos 14 días, y los nichos puestos en pausa por falta de respuestas se pueden reanudar desde la misma ficha.

### Corregido
- Guardar el cliente ideal ya no borra los nichos que el sistema había puesto en pausa.

## [1.21.0] - 2026-11-02

### Añadido
- **Catálogo de productos de la empresa** (*Comercial virtual → Productos*): lo que la empresa ofrece, con qué es, para quién, beneficios y a quién no ofrecérselo. Los agentes lo tienen siempre presente al ofrecer (solo ofrecen esos productos y no inventan otros), el calificador elige de ahí el producto de cada prospecto, y las propuestas y brochures se enlazan a un producto. Cada producto muestra cuántos clientes lo recibieron como oferta, se interesaron o lo compraron.
- **Rastro del producto de cada cliente** (`lead_products`): al pasar un prospecto al CRM queda anotado el producto que se le ofreció; los estados ofrecido, interesado, compró y no compró ya se pueden registrar por cliente (la pantalla para marcarlos desde la ficha viene después).

## [1.20.4] - 2026-11-02

### Cambiado
- **Comercial virtual sin tope:** la empresa puede crear todos los comerciales virtuales que quiera. Si pasa de los incluidos en su licencia, se le avisa (en pantalla y con una confirmación) que cada adicional tiene un costo que se suma a su factura; el Centro de control muestra los adicionales a facturar de cada empresa.
- **Motor de IA y buscador, a elección de la empresa:** cada empresa elige entre el de la plataforma (recomendado, listo para usar y se cobra en su factura) y el propio (su cuenta y su clave), sin tener que pedirlo al proveedor. Puede volver a la plataforma cuando quiera.

### Corregido
- Guardar el buscador propio de una empresa que nunca había configurado uno no guardaba nada.

### Cambiado
- **Integraciones → «Motor de IA y buscador»**: el motor de IA de la empresa (con su consumo del mes, la prueba y, si el proveedor lo habilita, el motor propio con su clave) pasa a Integraciones, junto al buscador web. La pestaña «Motor de IA» de Comercial virtual queda con un botón que lleva allí.

## [1.20.3] - 2026-11-02

### Corregido
- El cuadro «¿Quién trae mejores prospectos?» de Prospección ocupa todo el ancho y se despliega con un clic, para no quitarle espacio a la lista.

## [1.20.2] - 2026-11-02

### Añadido
- **Prospección: quién trajo a cada prospecto.** Cada prospecto muestra «Hallado por» (agente de IA con Claude, Serper, Brave, Google, archivo CSV o pedido a mano), y arriba aparece el cuadro «¿Quién trae mejores prospectos?» con, por origen, cuántos trajo, cuántos sirvieron, pasaron al CRM, se rechazaron, se contactaron, respondieron y llegaron a demo. El buscador anota el motor desde ahora; los hallados antes quedan como «motor sin registrar».
- Las tarjetas «Listos», «En el CRM» y «Rechazados» explican qué significa cada estado.

## [1.20.1] - 2026-11-02

### Corregido
- **El PDF que se adjunta a los correos ya trae toda la información de la presentación.** Antes era un resumen de 2 páginas con menos contenido que el enlace; ahora se genera a partir de la misma presentación (Crm Hub 360, Gestor360 y Core360), con todas sus secciones e ilustraciones.

## [1.20.0] - 2026-11-01

### Añadido
- **Reporte gerencial por correo del motor comercial.** Después del ciclo diario (hora configurable, 11:00 por defecto) llega a los destinatarios elegidos un correo con las cifras del día (prospectos hallados, listos, descartados y por qué, correos enviados, rebotes, bajas, respuestas, demos), una lectura gerencial y los siguientes pasos. Se configura en *Comercial virtual → Agentes de prospección → Buscador* y se puede enviar al instante con «Enviar el reporte ahora».

## [1.19.0] - 2026-11-01

### Añadido
- **¿Quién responde cuando un cliente escribe por WhatsApp?** Al agregar o editar un WhatsApp (*Integraciones → Canales*) se elige: mis asesores, **mensajes predefinidos**, comercial virtual con IA o **chatbot de Gestor360** (servicio adicional con cobro; sin el servicio aparece el botón «Solicitar el chatbot»).
- **Mensajes predefinidos de WhatsApp**: saludo, fuera de horario, menú de opciones, palabras clave, con topes para no insistir y sin interferir con el comercial virtual.
- **Centro de control**: proveedor «Gestor360» (la cuenta de DigitalAlliance Hub, con botón Probar) y servicio «Chatbot de WhatsApp (Gestor360)» por empresa, con aviso de las solicitudes. Todo chatbot es de Gestor360; no se permiten chatbots de terceros. La conexión de mensajes con Gestor360 viene en la siguiente fase.

### Corregido
- El tope diario de correos en frío se cuenta por el remitente que realmente los envía (el del correo en frío), no por el del correo normal.

### Corregido
- **Un correo largo ya no sale con el enlace cortado.** Cuando el modelo se pasaba de las 120 palabras, el recorte de último recurso cortaba en el último punto, que a veces era el de la dirección web; el enlace llegaba roto, se perdía el cierre y no se adjuntaba el PDF. Ahora el recorte protege las direcciones, corta en un fin de frase y, si se llevó un enlace, lo vuelve a poner completo.

## [1.18.1] - 2026-11-01

### Corregido
- **Los correos que envía el comercial virtual salen en «Enviados»** del CRM (antes aparecían en la «Bandeja de entrada»). Al enviar, el Hub registra la dirección remitente como una de las direcciones del usuario (acción `CrmHub/senderAddress`, solo para el usuario de integración); EspoCRM clasifica así el correo como enviado por esa persona, también los ya enviados.

## [1.18.0] - 2026-11-01

### Añadido
- **Validación de correos antes de escribir.** Se comprueba que el buzón exista sin enviarle nada (dominio con correo y respuesta del servidor del destinatario). Se aplica al importar prospectos, al pasarlos al CRM, antes de que el comercial virtual escriba y al aprobar un mensaje; nuevo botón **Validar correos** en Prospección. Los inexistentes quedan rechazados con el motivo y en *No contactar*.
- **Un rebote detiene al comercial virtual** para ese lead (antes solo se agregaba a *No contactar*), se anota en la ficha y el prospecto queda rechazado.

### Corregido
- El correo guardado en el CRM ahora **muestra los PDF adjuntos**, tiene los **enlaces pulsables** y el remitente se llama «Valeria Virtual» (antes el avatar mostraba «V(»).

### Corregido
- Un prospecto cuyo único contacto público es un buzón genérico («Atención al cliente», «Ventas»…) ya no da nombre al lead: el lead se llama como la empresa.

## [1.17.1] - 2026-11-01

### Corregido
- El nombre de la empresa también va con espacio duro en la firma y en el pie de baja de los correos.

### Corregido
- **Prospección con encabezado fijo**: el título, las pestañas, las tarjetas, los botones (importar, enriquecer…), el buscador y los filtros se quedan fijos; solo se desplaza la lista, con sus encabezados de columna también fijos.

## [1.17.0] - 2026-11-01

### Cambiado
- **Core360 (presentación y brochure)** reescritos con todo el producto: compras, materias primas e inventarios, producción, ventas y distribución, trazabilidad, facturación electrónica, **planta conectada en tiempo real** (máquinas por REST, MQTT, OPC UA y Modbus, producción en tiempo real, tablero andon y OEE, turnos y operarios), mantenimiento, calidad, finanzas y contabilidad (con integración a tu sistema contable si se desea), costos, API, y contratación por módulos. Incluye una ilustración del tablero de planta.
- El correo en frío lleva **un solo enlace de material** (el de la «Oferta indicada por el equipo» o, por defecto, Crm Hub 360), su PDF adjunto y, si se quiere, el enlace de WhatsApp.
- Un prospecto puede llevar una **oferta indicada por el equipo** (campo `oferta`), que pasa a la ficha del lead y manda sobre el producto recomendado.

### Añadido
- **Favicon genérico de DigitalAlliance Hub** en todos los enlaces públicos que enviamos (presentaciones, salas de videollamada, grabaciones, bajas y formularios), con rutas `/favicon.svg` y `/favicon.ico` en el dominio de las salas.

### Cambiado
- **Gestor360**: nueva sección de **chatbots configurables** (agentes conversacionales o flujogramas, con una versión de agenda y un flujograma de ejemplo) y de **Listo360** (app personalizable de los clientes, con su propio chat, agenda, pedidos e información por sede, instalable en cualquier dispositivo). Su brochure en PDF los incluye.
- **Crm Hub 360**: ahora destaca sus **formularios propios** para captar leads (enlace, QR o incrustados; redes o donde se quiera), los **formularios internos configurables** y su **módulo de reuniones propio**, sin necesidad de otro proveedor de videollamadas.

### Añadido
- **Brochures en PDF adjuntos a los correos.** Cada presentación estándar tiene un brochure de 2 páginas; cuando el comercial virtual envía el enlace, el correo lleva también el PDF adjunto (hasta 2 y 4 MB). El PDF se descarga además de la biblioteca (botón «PDF»).
- **El nombre de la empresa siempre en una sola línea** en correos, WhatsApp, SMS, presentaciones, PDF y pantallas.

### Cambiado
- **Presentaciones con capturas reales**: Crm Hub 360 (panel gerencial, agentes de prospección y biblioteca de propuestas, tomadas del propio CRM) y Gestor360 (su interfaz). Gestor360 reescrito con sus cinco líneas de negocio (vehículos, salud y belleza, panaderías, ferreterías y otras), todos sus módulos y la conexión por API. El comercial virtual y el calificador conocen las nuevas líneas.

### Cambiado
- **Presentación de Crm Hub 360 ampliada** con todo lo que hace el producto: equipo de agentes de IA (buscador, calificador, comercial virtual, asistente), motor de prospección y su cumplimiento, lectura y comprensión de documentos (PDF), todos los canales, videollamadas con subtítulos, grabación y resumen, procesos y formularios, reportes, banco de conocimiento y «trae lo tuyo». Seis ilustraciones; sin precios ni promesas.

## [1.16.0] - 2026-11-01

### Añadido
- **Comercial virtual → Agentes de prospección**: tarjetas del **agente buscador** y del **agente calificador**, cada uno con su configuración (el calificador con sus reglas de calificación editables, grado mínimo, tope diario y resumen de grados), junto a Valeria. Existen mientras la licencia incluya el buscador.
- **Comercial virtual → Propuestas y brochures**: biblioteca del material que envían los agentes, con las presentaciones estándar y **material propio** (enlaces a PDF, páginas o videos), visitas, y opciones de ver, copiar enlace, editar, apagar y quitar.

## [1.15.0] - 2026-11-01

### Añadido
- **Cadena comercial autónoma.** Nuevo agente **Calificador** (califica A/B/C/D con buenas prácticas, elige producto y ángulo, y pasa a Valeria solo lo bueno), **ciclo diario automático** (buscador → calificador → Valeria) con hora configurable, y **autonomía del correo en frío** (sale solo, con tope diario y **frenos automáticos por rebotes y bajas**; los rebotes se detectan en el buzón y pasan a «No contactar»). Opción «Enviar correos a cualquier hora».
- **Propuestas y presentaciones** públicas con ilustraciones para Crm Hub 360, Gestor360 y Core360 (sin precios ni promesas); el comercial virtual las envía solo, siempre con Crm Hub 360 en el primer correo.
- Pestaña *Prospección → Buscador*: ciclo diario, hora, autonomía del frío y «Ciclo completo ahora».

## [1.14.0] - 2026-11-01

### Añadido
- **Buscadores web por empresa.** El buscador de prospectos puede usar la búsqueda web de Claude (por defecto) o **Serper, Brave o Google Programmable Search** con clave. Cada empresa trae el suyo en *Integraciones → Buscadores* (con prueba de conexión y guía para sacar la clave) o usa uno prestado por el Centro de control, que tiene un nuevo tipo de proveedor «Buscador web» y la opción de servicio «Buscador web» por empresa.

### Añadido
- **Cada empresa configura su propio correo.** Nueva pestaña *Integraciones → Correo* con dos funciones: **correo principal** y **correo en frío** (remitente aparte en otro dominio), cada una con su SMTP de salida y su buzón IMAP de entrada, con presets de Zoho, Google y Microsoft 365 y botón «Probar conexión». En el Centro de control cada función puede quedar «Propia» (la empresa la configura) o «Prestada» por el sistema; nueva opción de servicio **Correo en frío**. Las respuestas al correo en frío entran por su propio buzón. Los servidores que escribe la empresa no pueden apuntar a direcciones internas del servidor.

## [1.13.1] - 2026-11-01

### Añadido
- Pestaña Buscador en Prospección e interruptor de licencia del buscador por empresa en el Centro de control.

### Corregido
- El buscador descarta correos con dominio casi igual al del sitio y reintenta si el informe sale vacío.

## [1.13.0] - 2026-11-01

### Añadido
- **Buscador de prospectos (`buscador_<empresa>`).** Un agente investiga en internet (búsqueda web de Claude) empresas que podrían necesitar lo que se vende y las deja como prospectos con su fuente pública. Los contactos hallados se tratan como **fríos**: nunca salen por WhatsApp/SMS ni por Resend, solo por un remitente de correo aparte y con aprobación de una persona. Se activa por empresa desde la licencia. Ver `docs/modulos/BUSCADOR.md`.

## [1.12.2] - 2026-11-01

### Añadido
- **Respuestas de clientes por el correo entrante de Resend**, sin necesidad de un buzón IMAP: Resend recibe la respuesta en el dominio y avisa al Hub por webhook firmado; el Hub la importa al CRM, asignada al usuario que escribió (alias `remitente+idUsuario@dominio`). Se configura en el proveedor de correo del Centro de control con el campo «secreto del webhook».

## [1.12.1] - 2026-11-01

### Añadido
- **Correo con proveedores que solo envían (Resend, SendGrid…) y buzón de respuestas aparte.** En el Centro de control, el proveedor de correo ahora admite un **buzón de respuestas** (correo, servidor IMAP y contraseña): los correos salen por el proveedor (con su dominio verificado) y las respuestas de los clientes llegan a ese buzón real, que el sistema lee como siempre. Antes, cambiar a un proveedor que solo envía habría hecho que las respuestas de los clientes se perdieran. Trae el preset de **Resend** (`smtp.resend.com`, usuario `resend`, contraseña = API key). Recordatorio: Resend no admite correo en frío; úsalo para correo con permiso.

## [1.12.0] - 2026-11-01

### Añadido
- **Panel maestro «Motor comercial» en el Centro de control (F5).** Una pestaña nueva reúne la prospección de IA de **todas las empresas**: contactados, respondieron y tasa, demos agendadas, pasados a una persona, mensajes que esperan aprobación y errores, con **alertas** (prospección activa en modo prueba, errores altos, muchos envíos sin respuesta). Debajo, las **variantes que mejor responden**, los **nichos** y los ajustes recientes de la optimización diaria. Al abrir una empresa se ven sus comerciales virtuales (se pueden **encender o apagar**), el estado de sus leads, las aprobaciones pendientes y la actividad reciente.
- **Interruptor de emergencia:** *Pausa de emergencia* para todas las empresas o *Pausar esta empresa*. El comercial virtual deja de escribir de inmediato (ni respuestas ni seguimientos ni optimización) y retoma donde iba al reanudar. Queda en el historial del Centro.

## [1.11.2] - 2026-11-01

### Añadido
- **Optimización diaria del motor comercial (F4).** Una tarea diaria (a la hora que elijas) lee los resultados por canal, por variante de cada paso y por nicho, y mejora la prospección sola: **reescribe con IA la variante que responde mucho peor que la ganadora** (la anterior queda pausada), **ajusta la guía de estilo** de WhatsApp (< 12 % de respuesta) o del correo (< 3 %), y **pausa los nichos** sin respuesta tras 300 intentos, repartiendo el cupo diario de prospectos hacia los nichos que mejor responden. Los asuntos de los correos en frío nunca llevan palabras de spam. Modo «aplica sola» o «solo propone»; **historial de ajustes con botón de revertir** (lo revertido no se vuelve a proponer por 14 días) y tablas de resultados por canal (con tasa de entrega) y por nicho en «Secuencia y resultados». Lo hace con muestras mínimas y no actúa con el comercial en modo prueba.

## [1.11.1] - 2026-11-01

### Añadido
- **Cierre del motor comercial (F3).** El comercial virtual ahora **clasifica la intención** de cada respuesta (interesado, pide demo, precio, competencia, tiempo, información, no le interesa) con un puntaje de 0 a 100 visible en la ficha del lead, responde las objeciones con un **guion enfocado en retorno de inversión, facilidad y centralización** (editable) y puede usar un **enlace de prueba**. Cuando el cliente muestra interés, **propone horarios libres** de la agenda de quien da la demo; al elegir uno **crea sola la reunión con videollamada**, se la confirma por el mismo canal, pasa el lead a «Calificado» y avisa al anfitrión. Si el horario ya no está libre ofrece otros; si hay negociación, pasa a una persona.
- **Embudo de la prospección** en la pestaña Prospectos: contactados, respondieron, demos agendadas, pasados a una persona y la intención de los leads. Configuración del cierre en «Secuencia y resultados».

## [1.11.0] - 2026-11-01

### Añadido
- **Prospección saliente (motor comercial de IA).** Nuevo menú **Prospección**: se importan prospectos (CSV), se validan (correo, teléfono internacional, no contactar, duplicados contra el CRM), la IA los puntúa contra el **cliente ideal** y los enriquece (empresa o persona, sector, dolor probable); los mejores pasan al CRM como leads de «Prospección IA», hasta un **tope diario**. El comercial virtual los contacta con una **secuencia de 3 pasos** (primer contacto, 72 horas, 5 días) con **variantes A/B por paso** (se prueba cada una y luego se envía más la que mejor responde) y reglas de forma: WhatsApp de máximo 3 párrafos cortos con pregunta final; correo con asunto de 2 a 4 palabras, menos de 120 palabras y un solo llamado.
- **Cumplimiento integrado:** lista de **no contactar** (se llena sola con BAJA, STOP, «no me escriban más» y el enlace de baja de los correos, que es de un clic), **horarios legales por país** (Colombia: Ley 2300), **WhatsApp solo a quien dio permiso o ya escribió**, plantillas oficiales de Meta para iniciar conversaciones y **tope diario de correos en frío por remitente**.
- Plan completo y fases: `docs/modulos/MOTOR-COMERCIAL-PLAN.md`. Pendientes de las fases siguientes: cierre con intención y objeciones (F3), optimización diaria automática (F4) y panel maestro en el Centro de control (F5).

## [1.10.7] - 2026-10-19

### Corregido
- **El panel del manual de usuario se quedaba mostrando la sección de la página anterior** al navegar con el panel abierto. Ahora se reinicia solo en la sección de la página nueva (y se cierra si pasas a la página del manual).

### Cambiado
- **Información del participante en la videollamada.** Al pulsar a un participante (o al cliente de la llamada), ya no sale el cuadro pequeño con 4 datos y el enlace «ver en el CRM»: se abre **la ficha completa en el panel lateral**, la misma de las listas (datos, agenda, gestión, historial, formularios, botones para llamar, escribir y agendar), **sin salir de la página y sin cortar la llamada**. El panel de la llamada se acomoda a su lado y la ficha **se queda abierta hasta que la cierres** con la X.
- **Formularios web de captación: la campaña ahora se elige de una lista** con tus campañas del CRM (con su estado), en vez de escribir su nombre exacto. Incluye un enlace para crear una campaña nueva.

### Corregido
- **No aparecía «Guardar» al crear una reunión (cita, videollamada, llamada o tarea) desde la ficha de un lead o contacto.** Una regla de estilos ocultaba también el pie de las ventanas emergentes, que es donde están los botones Guardar y Cancelar. Ya aparecen en todas las ventanas.
- **Enviar por WhatsApp o SMS a un contacto o cuenta que no es un lead.** Si el contacto no tenía teléfono cuando se abrió su conversación y se lo agregaron después, el sistema decía que «el lead no tiene teléfono». Ahora el teléfono y el correo se actualizan en la conversación al abrirla. Además, la invitación a una reunión con un contacto o cuenta ya se puede enviar por WhatsApp y SMS (antes solo para leads).

## [1.10.6] - 2026-10-19

### Cambiado
- **Página «Acerca de»** (menú de usuario → Acerca): ahora presenta **Crm Hub 360**, su versión instalada y que la desarrolla **DigitalAlliance Hub** (con enlace a digitalalliancehub.site). Se conserva el aviso legal del software libre en que se basa (EspoCRM, licencia GNU AGPL v3), porque esa licencia lo exige.

## [1.10.5] - 2026-10-19

### Añadido
- **Buscador del menú lateral**: caja «Buscar en el menú» arriba de las opciones; filtra mientras escribes (sin importar tildes ni mayúsculas), **Enter** abre la primera coincidencia y **Esc** la limpia. Atajo **Ctrl + K** para ir directo a la caja desde cualquier página.
- **Tu foto en el encabezado**: el botón del menú de usuario (arriba a la derecha) ahora es tu avatar; al pulsarlo se abre el desplegable de opciones (perfil, Administración, Preferencias, Acerca, Salir).

### Corregido
- **Scroll innecesario en casi todas las páginas.** La plataforma alargaba la página hasta la altura total del menú lateral, así que casi siempre aparecía la barra de desplazamiento aunque no hiciera falta (por ejemplo, en Leads). Ahora la barra solo aparece cuando la página tiene más contenido que la pantalla. En el tablero de Leads y en Reportes, el crédito del pie pasó a una esquina para no sumar altura.
- La opción **Acerca** del menú de usuario no tenía icono.

## [1.10.4] - 2026-10-19

### Corregido
- **Los tableros fijados salían en todas las pestañas del escritorio** (por ejemplo, el del Panel gerencial también aparecía en «Mi día»). Ahora, al fijar un tablero eliges **en qué pestaña** va (o «en todas») y **dónde**: arriba, antes de los widgets, o **al final**, después de ellos. Al cambiar de pestaña se muestran solo los de esa pestaña; cada pestaña sigue configurándose con sus propios widgets, igual que la principal. «Administrar» muestra la pestaña y la posición de cada tablero.

## [1.10.3] - 2026-10-19

### Añadido
- **Pantalla de carga general.** Es lo primero que se pinta al abrir la plataforma (con el nombre de la empresa, y en modo claro u oscuro según tu preferencia) y se quita sola cuando todo terminó de cargar. Al pasar de una página a otra, el área de contenido muestra la misma pantalla de carga (dejando visible el menú) hasta que la página nueva esté lista.

## [1.10.2] - 2026-10-19

### Añadido
- **Editar un tablero desde el escritorio.** Cada tablero fijado en Inicio trae un lápiz: abre «Reportes y tableros» con ese tablero ya en modo edición (añadir reportes, mover, cambiar tamaños). Si el tablero es de otra persona, el botón lo abre para verlo o copiarlo.

## [1.10.1] - 2026-10-19

### Añadido
- **Tableros en el escritorio (Inicio).** Antes, al guardar un tablero de «Reportes y tableros», el escritorio seguía vacío. Ahora cada usuario puede **fijar** los tableros que quiera ver al entrar: botón **«Ver en mi escritorio»** en el tablero (y, al guardar un tablero nuevo, el sistema pregunta si lo quieres en Inicio). Se pueden fijar **siempre o solo entre dos fechas** (luego dejan de mostrarse solos), tener **varios**, **subirlos o bajarlos** y **quitarlos** (con la X del tablero o desde «Administrar»); quitarlo del escritorio no lo elimina.

## [1.10.0] - 2026-10-19

### Añadido
- **Grabaciones de pantalla y de videollamadas.** Nuevo menú **Grabaciones**: ahí quedan los videos, que se pueden **ver, descargar, renombrar, compartir con un enlace** (que se puede quitar) y eliminar.
  - **Grabar la pantalla del CRM** (capacitaciones, explicaciones): círculo rojo de la barra superior. El navegador pide qué compartir (pestaña, ventana o pantalla); barra flotante con tiempo, **pausa** y **detener** que sigue al cambiar de página.
  - **Grabar una videollamada**: el anfitrión usa el botón ⏺ de la llamada. Todos los participantes ven el aviso «Se está grabando».
  - En ambos casos se elige **con o sin audio**: audio de la pestaña/llamada y/o micrófono; **por defecto sin audio** (todo apagado).
  - El video se sube por partes al Hub (no pasa por el CRM) y se corrige con ffmpeg para que se pueda adelantar. Cada empresa tiene un límite de espacio (40 GB). Cada persona ve las suyas; con alcance «todos» se ven las de la empresa.
  - Requiere reconstruir el Hub (`docker compose up -d --build hub-service`): lleva ffmpeg y un volumen nuevo (`crmhub_recordings`).

## [1.9.1] - 2026-10-19

### Tableros gerenciales ya armados y vista previa de reportes más clara
- En el escritorio de Inicio, «Añadir caja» pasa a llamarse **«Añadir widget»** (menú del escritorio y aviso de escritorio vacío).
- **«Añadir widget» ahora muestra tarjetas** (en vez de una lista de nombres): cada widget tiene un dibujo que representa lo que se verá (calendario, embudo, barras, anillo, lista de registros, indicadores…) y una descripción de para qué sirve; el buscador sigue filtrando.
- **Botón «Ver en el manual» en todas las páginas** (icono del libro en la barra superior): abre el manual de usuario en un **panel lateral, ya en la sección de la página donde estás** (Reportes y tableros, Leads, Inicio, Consultas web, Tareas…), y trae **«Ir a la página del manual»** para abrirlo completo en esa misma sección. Respeta los roles. El manual tiene secciones nuevas: **Escritorio y widgets**, **Reportes y tableros** y **Consultas web**, y cuenta los cálculos y el plan de pagos de los formularios.
- **Tarjetas de los tableros con espacio entre ellas** (antes quedaban pegadas).
- **Corrección importante en «Reportes y tableros»**: al salir de esa pantalla se producía un error que dejaba la página sin soltar su modo de pantalla fija (podía quedar sin desplazamiento en otras páginas). Ya se suelta bien.
- **Ver lo que escribes en usuario y clave**: al grabar un login (y en las credenciales de la consulta) hay un **ojo** para mostrar u ocultar el texto y comprobar que lo escribiste bien. Las credenciales ya guardadas siguen sin poder verse.
- **Plantillas de tableros gerenciales**: al crear un tablero eliges uno ya construido —**Gerencial comercial**, **Actividad del equipo**, **Cartera y cobranza** u **Oportunidades y ventas**— con mezcla de indicadores, barras, líneas, áreas, anillos y tablas. Se crean sus reportes (quedan tuyos) y el tablero, y los ajustas: **cambias colores, títulos y tipo de gráfica de cada tarjeta, quitas tarjetas o añades más**, y lo guardas. También se puede empezar en blanco.
- **Color y tipo de cada tarjeta** (engranaje de la tarjeta): paleta de colores o uno propio, y «cómo verlo» (tabla, barras, líneas, circular…) sin tocar el reporte.
- **Vista previa del reporte**: ahora ocupa todo el ancho arriba y las opciones quedan debajo en columnas (antes la gráfica quedaba diminuta); la gráfica se ajusta al espacio y, si aún no eliges «Agrupar», avisa qué falta para verla. Los totales de dinero de los indicadores se muestran abreviados ($ 200 M).
- Se pueden agrupar y filtrar por las fechas de reuniones, llamadas y tareas (inicio y vencimiento).

### Menú lateral que se desplaza y confirmaciones bien visibles
- **El menú lateral se puede recorrer con la rueda**: como las páginas ya no arrastran el menú, este tiene ahora su propio desplazamiento y puedes llegar a todas las opciones (antes la rueda movía la página y el menú no avanzaba).
- **Escritorio (Inicio) vacío con aviso**: si borras todas las cajas de un escritorio ya no queda la pantalla en blanco: aparece «Este escritorio está vacío» con los botones **Añadir una caja**, **Crear un reporte o tablero** y **Editar escritorio** para empezar a armarlo ahí mismo.
- **La ventana de confirmación (al eliminar, etc.) aparece centrada y con fondo oscuro**, bien visible; antes quedaba pegada arriba, sin fondo y se confundía con la barra del navegador. Las pocas preguntas que usaban el cuadro del navegador (cambios sin guardar en reportes, salir o cambiar de videollamada, nombre de una credencial) usan ahora el mismo diseño.

## [1.9.0] - 2026-10-19

### Reportes y tableros: un «Power BI» dentro de la plataforma
- **Nuevo menú «Reportes y tableros»** (para todos los usuarios): cada quien arma y guarda **sus propios reportes y tableros**, sin límite de cantidad.
- **Reportes**: eliges los datos (leads, contactos, cuentas, oportunidades, tareas, reuniones, llamadas y **las respuestas de tus formularios internos**, incluidos sus cálculos y montos), pones filtros (por estado, fechas, montos, texto…), **agrupas** (por estado, asesor, origen, campaña, día/semana/mes/año…, y además divides por un segundo criterio), eliges qué **medir** (cantidad, suma, promedio, mínimo, máximo) y cómo verlo: **tabla, barras, barras horizontales o apiladas, líneas, áreas, circular, anillo o indicador (cifra grande)**. Ves el resultado al instante mientras lo armas.
- **Tableros**: reúnes reportes, **textos** (títulos y notas) e **imágenes** en una cuadrícula que **acomodas arrastrando y cambias de tamaño**; queda guardado tal como lo dejaste y se actualiza con los datos al abrirlo.
- **Compartir**: personales por defecto; se pueden compartir con tu equipo o (gerentes y supervisores) con toda la empresa, en solo lectura; cualquiera puede hacerse una copia propia para modificarla.
- **Permisos**: los datos de cada reporte se calculan con el acceso del usuario que lo mira (un asesor solo ve lo suyo o de su equipo, aunque el tablero sea compartido).

### Formularios con cálculos y plan de pagos
- **Campos de cálculo**: un campo puede ser una **fórmula** con otros campos del formulario (suma, resta, multiplicación, división, potencia, porcentajes, paréntesis y funciones como `REDONDEAR`, `SI`, `MIN`, `MAX`, `SUMA`, `PROMEDIO`, `ABS` y `CUOTA`). Se calcula en pantalla mientras se escribe, se vuelve a calcular en el servidor al guardar y sale en el PDF; se puede formatear como número, monto, porcentaje o entero. Al diseñar, los campos se insertan en la fórmula con un clic y se valida que esté bien escrita.
- **Plan de pagos**: campo que arma la **tabla de amortización** (cuota, interés, capital y saldo de cada cuota, con fechas) a partir del valor a financiar, la tasa y el número de cuotas —cada uno puede ser un campo o una fórmula—. Métodos: cuota fija (sistema francés), abono fijo a capital, interés simple y sin interés; cuotas mensuales, quincenales o semanales; tasa por periodo o anual; fecha de la primera cuota tomada de un campo. Se ve completo en el formulario y **sale en el PDF**; el resumen (cuota, total, intereses) también se puede usar en mensajes y en acciones.

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
