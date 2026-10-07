<div class="page-header"><h3>Manual de usuario</h3></div>
<div class="ch-manual">
  <div class="ch-hero"><h2>Guía práctica de {{appName}}</h2><p>Para comerciales, directores de equipo y gerentes.</p></div>
  <div class="ch-rolebar"><span>Manual para: <b>{{roleLabel}}</b></span>
    {{#if canToggle}}<button class="btn btn-default btn-sm" data-action="toggleAll">{{#if showAll}}Ver solo mi rol{{else}}Ver todo el manual{{/if}}</button>{{/if}}</div>
  <div class="ch-manual-layout">
    <div class="ch-manual-toc panel panel-default"><div class="panel-body"><a role="button" class="ch-toc-link" data-action="goTo" data-id="inicio" data-roles="comercial director gerente">1. Ingreso y navegación</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="app" data-roles="comercial director gerente">1b. Modo oscuro, instalar y sin internet</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="leads" data-roles="comercial director gerente">2. Leads</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="pipeline" data-roles="comercial director gerente">3. Tablero Kanban</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="credito" data-roles="comercial director gerente">4. Reporte de crédito con IA</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="asistente" data-roles="comercial director gerente">5. Asistente IA</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="contacto" data-roles="comercial director gerente">5b. Llamar, WhatsApp y SMS</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="canales" data-roles="gerente">6. Canales de captación</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="roles" data-roles="director gerente">7. Roles y equipos</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="asignacion" data-roles="director gerente">7b. Asignación y reasignación</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="organizacion" data-roles="director gerente">7c. Equipos, campañas y organigrama</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="config" data-roles="">7d. Estados y balanceo (configuración)</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="configcomm" data-roles="">7e. Canales: WhatsApp, Telegram y Meta</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="formularios" data-roles="">7f. Formularios web</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="telefonia" data-roles="">7g. SMS, llamadas y troncal</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="masivos" data-roles="director gerente">7h. Mensajes masivos</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="actividades" data-roles="comercial director gerente">8. Tareas y calendario</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="admin" data-roles="">9. Administración (solo administradores)</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="faq" data-roles="comercial director gerente">10. Preguntas frecuentes</a></div></div>
    <div class="ch-manual-body">
<div class="panel panel-default" id="ch-m-inicio" data-roles="comercial director gerente">
  <div class="panel-heading"><h4 class="panel-title">1. Ingreso y navegación</h4></div>
  <div class="panel-body">
<ol>
<li>Entra a la dirección de tu empresa e inicia sesión con tu usuario y contraseña.</li>
<li>Cambia tu contraseña la primera vez: menú de tu usuario (arriba a la derecha) → <b>Preferencias</b>.</li>
<li>El menú lateral izquierdo da acceso a <b>Leads</b>, cuentas, contactos, oportunidades, tareas y calendario.</li>
<li>Usa la lupa superior para buscar cualquier registro por nombre, teléfono o correo.</li>
<li>Con la flecha de abajo a la izquierda puedes <b>contraer el menú</b>; al pasar el mouse sobre cada ícono verás su nombre. Si lo abres desde el modo contraído (☰), el contenido se desplaza en vez de taparse.</li>
</ol>
<div class="ch-tip">El inicio tiene dos pestañas: <b>Panel gerencial</b> (indicadores, embudo, servicios, tendencia, origen, rendimiento por asesor y campañas, según tu alcance; puedes cambiar el periodo de 7 días a 12 meses) y <b>Mi día</b> (leads recientes, tareas, actividades y la actividad del equipo).</div>
</div>
</div>
<div class="panel panel-default" id="ch-m-app" data-roles="comercial director gerente">
  <div class="panel-heading"><h4 class="panel-title">1b. Modo claro/oscuro, instalar la app y trabajar sin internet</h4></div>
  <div class="panel-body">
<h3>Modo claro u oscuro</h3>
<p>El botón de <b>luna / sol</b> está siempre visible: en la barra superior (junto a las notificaciones) y también en la pantalla de ingreso. Tu elección se recuerda en ese dispositivo. Si nunca la cambias, se usa la preferencia de tu sistema.</p>
<h3>Instalar Crm Hub 360 como aplicación</h3>
<ul>
<li><b>Chrome / Edge (computador):</b> aparece un botón de <b>descarga</b> en la barra superior (o el ícono de instalar en la barra de direcciones). Al instalarla se abre en su propia ventana, con ícono propio.</li>
<li><b>Android:</b> menú del navegador → <i>Instalar aplicación</i>. <b>iPhone / iPad:</b> Compartir → <i>Añadir a pantalla de inicio</i>.</li>
</ul>
<h3>Trabajar sin conexión</h3>
<ul>
<li>Si se cae el internet verás un aviso <b>«Sin conexión»</b>. Puedes seguir consultando lo que ya habías abierto (leads, listas, tablero, panel, manual); aparecerán los datos de tu última conexión.</li>
<li><b>Los cambios no se guardan sin internet</b> (crear, editar, enviar WhatsApp, registrar llamadas): el sistema te lo dirá. Cuando vuelva la conexión verás <b>«Conexión restablecida»</b> y podrás repetirlos.</li>
<li>La primera vez que abres la app necesitas internet. Los datos guardados son solo tuyos y de ese dispositivo; no uses esta función en equipos compartidos sin cerrar sesión.</li>
</ul>
<h3>Notificaciones push (aunque la app esté cerrada)</h3>
<ol>
<li>Pulsa el botón del <b>megáfono</b> en la barra superior (junto al de luna/sol) y acepta el permiso del navegador. Verde = activado en este dispositivo; púlsalo de nuevo para desactivarlo.</li>
<li>Actívalo en cada dispositivo donde quieras recibir avisos (computador, celular).</li>
<li>Hoy llega el aviso de <b>nueva versión</b>: cuando se publica una actualización recibes una notificación en el dispositivo aunque no tengas la app abierta; al tocarla, la app se abre ya actualizada.</li>
<li><b>iPhone / iPad:</b> funciona solo si primero <b>instalas la app</b> (Compartir → Añadir a pantalla de inicio), con iOS 16.4 o superior.</li>
<li>Si no llegan: revisa que el navegador tenga permiso de notificaciones para este sitio y que el sistema no esté en «No molestar». Los administradores pueden enviarse una prueba en <b>Integraciones → Notificaciones push</b>.</li>
</ol>
<h3>Avisos de nueva versión con la app abierta</h3>
<p>Si estás usando la app cuando sale una versión nueva, aparece abajo a la derecha <b>«Nueva versión disponible»</b> con el botón <b>Actualizar ahora</b>.</p>
</div>
</div>
<div class="panel panel-default" id="ch-m-leads" data-roles="comercial director gerente">
  <div class="panel-heading"><h4 class="panel-title">2. Leads</h4></div>
  <div class="panel-body">
<p>Un <b>lead</b> es una persona interesada en un crédito. Verás solo los leads que tu rol permite (ver sección 7).</p>
<h3>Crear un lead manualmente</h3>
<ol><li><b>Leads</b> → botón <b>Crear lead</b> (arriba a la derecha).</li><li>Completa nombre, teléfono (con indicativo; si no lo pones se asume +57), correo y origen.</li><li>Guarda. El estado inicial es <span class="ch-pill">Nuevo Lead</span>.</li></ol>
<h3>Estados del lead</h3>
<table class="table table-bordered ch-table"><tr><th>Estado</th><th>Significado</th></tr>
<tr><td>Nuevo Lead</td><td>Recién captado, sin gestionar.</td></tr>
<tr><td>En Calificación</td><td>Se recibió el reporte o los datos del cliente y se está aplicando el filtro.</td></tr>
<tr><td>Calificado</td><td>El cliente cumple al menos un servicio; ya tiene servicio sugerido.</td></tr>
<tr><td>En Enfriamiento/Contactado</td><td>Contactado; se espera respuesta o decisión del cliente.</td></tr>
<tr><td>Cierre Exitoso</td><td>El cliente tomó el crédito.</td></tr>
<tr><td>Perdido / Convertido</td><td>Descartado, o convertido en cuenta/contacto/oportunidad.</td></tr></table>
<p>En el detalle del lead, el <b>flujo</b> (<i>stream</i>) guarda notas, mensajes de WhatsApp y cambios. Documenta cada contacto allí.</p>
</div>
</div>
<div class="panel panel-default" id="ch-m-pipeline" data-roles="comercial director gerente">
  <div class="panel-heading"><h4 class="panel-title">3. Tablero Kanban</h4></div>
  <div class="panel-body">
<div class="ch-warn"><b>Cambios de estado:</b> cada vez que cambias el estado de un lead (arrastrando la tarjeta o editándolo) debes escribir un <b>comentario</b>, salvo que ya hayas hecho una <b>acción con ese lead</b> desde el último cambio (una llamada, un mensaje, un correo, una reunión o una tarea). Todo queda en el panel <b>Historial de estados</b> del lead: de qué estado a cuál, quién, cuándo y por qué.</div>
<div class="ch-tip"><b>Ficha rápida:</b> al pulsar una tarjeta se abre la ficha del lead en un <b>panel lateral</b> (el tablero sigue visible para pasar a otro lead). Desde ahí puedes llamar, escribir por WhatsApp, SMS o Telegram, editar, o pulsar <b>Abrir completo</b> para ver toda la información en pantalla completa.</div>
<p>Al entrar a <b>Leads</b> verás el tablero Kanban: cada columna es un estado. Con los iconos de arriba a la derecha alternas entre el tablero y la lista.</p>
<ul><li><b>Arrastra</b> una tarjeta a otra columna para cambiar su estado.</li><li>Cada tarjeta muestra el avatar (foto de WhatsApp si existe, o las iniciales), el resultado del filtro, el servicio sugerido, la deuda, el teléfono, el asesor y la antigüedad.</li><li>Cada columna tiene su propio <b>buscador</b>: escribe un nombre, teléfono, servicio o asesor y se filtran solo las tarjetas de ese estado (aparece <i>n/total</i>). Si hay más tarjetas sin cargar, usa «Mostrar más» primero.</li>
<li>Usa los filtros de arriba para ver solo los tuyos o los de tu equipo.</li><li>Vuelve a la lista con el icono de lista.</li></ul>
</div>
</div>
<div class="panel panel-default" id="ch-m-credito" data-roles="comercial director gerente">
  <div class="panel-heading"><h4 class="panel-title">4. Filtro del cliente y servicio sugerido</h4></div>
  <div class="panel-body"><p>Cuando un cliente se registra, el primer paso es aplicar el <b>filtro</b>: ¿cumple las condiciones para alguno de los servicios de la empresa (por ejemplo resolución de deudas, consolidación de cartera, préstamo o limpieza de historial)?</p>
<h3>Cómo se aplica</h3>
<ol>
<li>Abre el lead y edítalo. En <b>Reporte de crédito (PDF)</b> adjunta la historia de crédito autorizada por el cliente y guarda. Si no tienes el PDF, puedes escribir a mano el puntaje, las deudas, los acreedores y los <b>ingresos mensuales</b>.</li>
<li>La IA lee el PDF (uno o dos minutos) y completa: puntaje, deuda total, deuda en mora, cantidad de acreedores, máximo de días de mora, obligaciones castigadas y el detalle de cada obligación.</li>
<li>El sistema evalúa los servicios <b>en orden de prioridad</b> y deja en el lead: <b>Resultado del filtro</b>, <b>Servicio sugerido</b> y los <b>Motivos</b> (qué condición cumple o no cumple cada servicio).</li>
</ol>
<h3>Resultado del filtro</h3>
<table class="table table-bordered ch-table"><tr><th>Resultado</th><th>Significado</th></tr>
<tr><td><span class="ch-pill">Califica</span></td><td>Cumple las condiciones de al menos un servicio. El lead pasa a <i>Calificado</i> y se muestra el servicio sugerido (y otros posibles).</td></tr>
<tr><td><span class="ch-pill">No califica</span></td><td>No cumple ningún servicio activo.</td></tr>
<tr><td><span class="ch-pill">Revisión Manual</span></td><td>Faltan datos para decidir (por ejemplo ingresos) o no se pudo leer el PDF. Complétalos y el sistema recalcula solo.</td></tr></table>
<div class="ch-warn"><b>Importante:</b> la IA ayuda, no decide por ti. Verifica las cifras contra el PDF antes de comunicar algo al cliente. Los PDF escaneados (imagen) no se pueden leer: el lead queda en <i>Revisión Manual</i>. Sube el PDF original del buró.</div>
<div class="ch-tip">Los servicios y sus condiciones los configura el administrador en <b>Integraciones → Servicios y filtros</b>: puede agregar servicios propios, activarlos, cambiar su prioridad y definir condiciones sobre deuda, mora, acreedores, ingresos, puntaje o cualquier campo del lead (por ejemplo, la campaña o el origen).</div></div>
</div>
<div class="panel panel-default" id="ch-m-asistente" data-roles="comercial director gerente">
  <div class="panel-heading"><h4 class="panel-title">5. Asistente IA</h4></div>
  <div class="panel-body">
<p>En el detalle de un lead, abre el menú de acciones (⋯ junto a <b>Editar</b>):</p>
<ul><li><b>IA: Resumir conversación</b> — viñetas con necesidad, objeciones y próximo paso.</li><li><b>IA: Redactar respuesta</b> — borrador de mensaje de WhatsApp en español.</li><li><b>IA: Analizar sentimiento</b> — sentimiento e interés de compra.</li></ul>
<p>Trabaja sobre la conversación registrada en el flujo del lead. Puede tardar de 15 a 60 segundos.</p>
<div class="ch-warn">Revisa y edita el texto antes de enviarlo. El asistente puede equivocarse; no uses sus resultados como única base de una decisión.</div>
</div>
</div>
<div class="panel panel-default" id="ch-m-contacto" data-roles="comercial director gerente">
  <div class="panel-heading"><h4 class="panel-title">5b. Llamar y enviar WhatsApp a un lead</h4></div>
  <div class="panel-body">
<div class="ch-tip">Cada botón abre la interfaz de su canal: <b>WhatsApp, Telegram y SMS</b> se ven como una conversación (burbujas, con el historial y la caja para escribir abajo); <b>Llamar</b> abre un teléfono con el historial de llamadas (estado, duración, quién y notas); <b>Correo</b> muestra los correos enviados y recibidos y permite redactar uno.</div>
<p>Abre el lead: arriba están los botones <b>Llamar</b>, <b>WhatsApp</b> y <b>SMS</b>. Todos necesitan que el lead tenga <b>teléfono</b>.</p>
<h3>Llamar</h3>
<ol>
<li>Pulsa <b>Llamar</b>. Si tu administrador conectó una <b>central o proveedor de llamadas</b>, escribe tu teléfono o extensión: el sistema <b>te llama primero</b> y, al contestar, te comunica con el cliente (la llamada queda registrada y, si está activado, grabada). Si no hay central conectada, se abre el marcador de tu equipo (softphone o app de teléfono) con el número ya cargado.</li>
<li>Haz la llamada. Cuando termines, en la ventana <b>Registrar llamada</b> elige el <b>resultado</b> (Contactado, No contesta, Buzón de voz, Número equivocado, Reagendar), los minutos y tus notas, y guarda.</li>
<li>Queda en <b>Llamadas</b>, en el <b>Historial de actividades</b> y en el flujo del lead.</li>
</ol>
<h3>WhatsApp</h3>
<ol>
<li>Pulsa <b>WhatsApp</b>. Escribe el mensaje, o usa <b>Sugerir con IA</b> para que proponga un borrador según la conversación (revísalo y edítalo).</li>
<li>Pulsa <b>Enviar</b>. Sale desde el WhatsApp conectado de la empresa y queda en el flujo del lead.</li>
<li>Las respuestas del cliente aparecen solas en el flujo del lead.</li>
</ol>
<h3>SMS</h3>
<ol>
<li>Pulsa <b>SMS</b> (o elige SMS en la ventana de mensajes), escribe el texto y mira el contador: un SMS normal admite 160 caracteres; con tildes especiales o emojis, 70. Si te pasas se envía en varios segmentos.</li>
<li>Pulsa <b>Enviar</b>: sale desde el número, código corto o remitente que configuró tu administrador, y queda en el flujo del lead. Las respuestas del cliente aparecen solas.</li>
<li>Si el cliente responde <b>BAJA</b>, queda marcado como «No contactar» y deja de recibir mensajes y campañas.</li>
</ol>
<h3>Telegram</h3>
<p>Si el cliente prefiere Telegram (aparece en <b>Canal preferido</b> del lead):</p>
<ol>
<li>Si ya te escribió al bot, pulsa <b>Telegram</b> y responde igual que por WhatsApp.</li>
<li>Si aún no ha abierto el chat, pulsa <b>Telegram</b> (o <b>⋯ → Invitar por Telegram</b>): se genera un <b>enlace de un solo uso</b>. Envíaselo por WhatsApp, correo o llamada; al abrirlo y pulsar <i>Iniciar</i>, el chat queda ligado a ese lead.</li>
<li>Los mensajes del cliente aparecen solos en el flujo del lead.</li>
</ol>
<div class="ch-tip">Si WhatsApp responde «no está configurado» o falla el envío, avisa a tu administrador: él lo conecta en Integraciones.</div>
</div>
</div>
<div class="panel panel-default" id="ch-m-canales" data-roles="gerente">
  <div class="panel-heading"><h4 class="panel-title">6. Canales de captación</h4></div>
  <div class="panel-body">
<table class="table table-bordered ch-table"><tr><th>Canal</th><th>Qué ocurre</th></tr>
<tr><td>Facebook / Instagram Ads</td><td>Cada formulario de anuncio crea un lead con origen Facebook Ads o Instagram Ads.</td></tr>
<tr><td>WhatsApp</td><td>Cada mensaje entrante se registra en el flujo del lead (se crea si no existía). Los números se unifican por teléfono, así que no se duplican.</td></tr>
<tr><td>Formulario web</td><td>Los envíos de la página web crean leads con origen Formulario Web.</td></tr>
<tr><td>Manual</td><td>Lo creas tú desde Leads.</td></tr></table>
<p>La conexión de cada canal la configura el administrador (ver sección 9).</p>
</div>
</div>
<div class="panel panel-default" id="ch-m-roles" data-roles="director gerente">
  <div class="panel-heading"><h4 class="panel-title">7. Roles y equipos</h4></div>
  <div class="panel-body">
<table class="table table-bordered ch-table"><tr><th>Rol</th><th>Qué puede ver</th><th>Qué puede hacer</th></tr>
<tr><td><b>Comercial</b></td><td>Solo los leads asignados a él.</td><td>Crear y editar sus leads; usar IA y el tablero Kanban.</td></tr>
<tr><td><b>Director de Equipo</b></td><td>Los leads de su equipo.</td><td>Reasignar leads del equipo, ver el rendimiento del equipo y paneles.</td></tr>
<tr><td><b>Gerente General</b></td><td>Todo el sistema.</td><td>Gestión completa, analítica global y métricas.</td></tr></table>
<div class="ch-tip">Si no ves un lead que esperabas, normalmente está asignado a otro usuario o equipo. Pide a tu director que lo reasigne.</div>
</div>
</div>
<div class="panel panel-default" id="ch-m-asignacion" data-roles="director gerente">
  <div class="panel-heading"><h4 class="panel-title">7b. Asignación y reasignación de leads</h4></div>
  <div class="panel-body">
<h3>Asignación automática</h3>
<p>Cada lead nuevo sin asesor se asigna solo, de forma <b>balanceada</b>: recibe el lead el usuario habilitado con <b>menos leads abiertos</b> (en empate, quien lleva más tiempo sin recibir uno).</p>
<ol>
<li>Si el lead trae una <b>campaña</b>, se reparte entre los usuarios habilitados que están en los <b>equipos de esa campaña</b>.</li>
<li>Si no tiene campaña, o nadie de esos equipos está habilitado, se reparte entre <b>todos los usuarios habilitados</b>.</li>
</ol>
<p>El asesor recibe una notificación y el lead queda visible también para su director de equipo.</p>
<div class="ch-tip">Se habilita a cada usuario en <b>Integraciones → Asignación automática de leads</b> (casilla <i>Recibe leads</i>). Desmárcala para sacar a alguien del reparto, por ejemplo en vacaciones. La campaña se liga a un grupo eligiendo sus <b>Equipos</b> en la ficha de la campaña.</div>
<h3>Reasignar leads o clientes</h3>
<p>Los <b>directores de equipo</b> (a usuarios de sus equipos), los <b>gerentes</b> y los administradores (a cualquiera) pueden reasignar:</p>
<ul>
<li><b>Un registro:</b> abre el lead, cliente o contacto y elige <b>⋯ → Reasignar</b>.</li>
<li><b>Varios a la vez:</b> en la lista marca las casillas y usa <b>Acciones → Reasignar</b>.</li>
</ul>
<p>Elige un usuario, o <b>Automático (el más libre)</b> para repartirlos con el balanceo. Puedes escribir un motivo; queda en el historial del registro junto con quién lo hizo.</p>
</div>
</div>
<div class="panel panel-default" id="ch-m-organizacion" data-roles="director gerente">
  <div class="panel-heading"><h4 class="panel-title">7c. Equipos, campañas y organigrama</h4></div>
  <div class="panel-body">
<p>Todo está en el grupo <b>Organización</b> del menú lateral (los gerentes y administradores lo ven completo; los directores ven sus equipos y campañas).</p>
<table class="table table-bordered ch-table"><tr><th>Qué quiero hacer</th><th>Dónde</th></tr>
<tr><td><b>Crear un grupo de trabajo (equipo)</b></td><td>Organización → <b>Equipos</b> → <b>Crear equipo</b>. También con el botón <i>Crear equipo</i> del Organigrama.</td></tr>
<tr><td><b>Crear un usuario y meterlo a un equipo</b></td><td>Organización → <b>Usuarios</b> → <b>Crear usuario</b>. Elige su <b>Rol</b> (Comercial, Director de Equipo o Gerente General) y su <b>Equipo</b>.</td></tr>
<tr><td><b>Habilitarlo para recibir leads</b></td><td>Integraciones → Asignación automática de leads → casilla <i>Recibe leads</i>.</td></tr>
<tr><td><b>Crear una campaña</b></td><td>Organización → <b>Campañas</b> → <b>Crear campaña</b>. En el campo <b>Equipos</b> elige qué equipos la atienden: sus leads se reparten entre ellos.</td></tr>
<tr><td><b>Ver la estructura</b></td><td>Organización → <b>Organigrama</b>.</td></tr></table>
<h3>Cómo se compone</h3>
<ul>
<li><b>Dirección:</b> administradores y usuarios con rol <i>Gerente General</i>.</li>
<li><b>Equipo:</b> un grupo de trabajo. Su <b>director</b> es el usuario con rol <i>Director de Equipo</i> que pertenece a él; sus <b>asesores</b> son los usuarios con rol <i>Comercial</i>.</li>
<li><b>Campaña:</b> se liga a uno o más equipos. Un mismo equipo puede atender varias campañas.</li>
</ul>
<div class="ch-tip">El organigrama no se dibuja a mano: se arma solo con los roles y equipos de cada usuario. Si alguien no aparece, revisa que tenga equipo (si no, sale en «Sin equipo»).</div>
</div>
</div>
<div class="panel panel-default" id="ch-m-config" data-roles="">
  <div class="panel-heading"><h4 class="panel-title">7d. Dónde se configuran los estados y el balanceo</h4></div>
  <div class="panel-body">
<p>Solo los administradores. Están en el grupo <b>Organización</b> del menú lateral.</p>
<table class="table table-bordered ch-table"><tr><th>Qué quiero hacer</th><th>Dónde</th></tr>
<tr><td><b>Crear, renombrar, ordenar o dar color a los estados de los leads</b> (las columnas del Kanban)</td><td><b>Estados del pipeline</b> → botón <i>Crear, renombrar u ordenar estados</i>. Es la pantalla Administración → Entidades → Lead → Campos → Estado.</td></tr>
<tr><td><b>Decir cuál estado usa el sistema</b> para leads nuevos, «en calificación», «calificado» y los que ya no cuentan como abiertos</td><td><b>Estados del pipeline</b> (panel derecho). Si renombras un estado, vuelve a elegirlo aquí.</td></tr>
<tr><td><b>Elegir cómo se reparten los leads</b> (balanceado o rotación) y poner un tope de leads abiertos por asesor</td><td><b>Asignación de leads</b> → <i>Cómo se reparten los leads nuevos</i>.</td></tr>
<tr><td><b>Ver y cambiar quién recibe leads</b>, y qué equipos atiende cada campaña</td><td><b>Asignación de leads</b> → <i>Quién recibe leads</i> y <i>Campañas activas</i>.</td></tr>
<tr><td><b>Definir los servicios y sus condiciones</b></td><td><b>Integraciones</b> → Servicios y filtros.</td></tr></table>
<div class="ch-warn"><b>Antes de renombrar o eliminar un estado</b> mueve los leads que lo tienen (<i>Acciones → Actualización masiva</i>); EspoCRM no los cambia solo.</div>
</div>
</div>
<div class="panel panel-default" id="ch-m-configcomm" data-roles="">
  <div class="panel-heading"><h4 class="panel-title">7e. Canales: WhatsApp, Telegram, Meta y llamadas (administradores)</h4></div>
  <div class="panel-body">
<p>Todo se configura en <b>Integraciones</b> (pestañas <i>Canales de mensajería</i> y <i>Meta</i>). La tabla de arriba lista las <b>direcciones (webhooks)</b> que pegas en cada proveedor; usa «Mostrar token» y «Copiar».</p>
<h3>WhatsApp: elige un proveedor</h3>
<table class="table table-bordered ch-table"><tr><th>Proveedor</th><th>Qué necesitas</th><th>Para recibir mensajes</th></tr>
<tr><td><b>Evolution API</b></td><td>URL, nombre de la instancia y API key. Teléfono vinculado por QR en Evolution.</td><td>Webhook de la instancia → <code>/hub/evolution</code>, evento <code>MESSAGES_UPSERT</code>, encabezado <code>apikey</code> = token.</td></tr>
<tr><td><b>Meta WhatsApp Cloud API</b></td><td><i>Phone Number ID</i> y token de acceso permanente (usuario del sistema). En la pestaña Meta, el <i>App Secret</i>.</td><td>En tu app de Meta → WhatsApp → Webhooks: URL <code>/hub/whatsapp-cloud?token=…</code>, token de verificación = token, campo <code>messages</code>.</td></tr>
<tr><td><b>Gupshup</b></td><td>API key, número de origen y nombre de la app.</td><td>Webhook entrante de tu app → <code>/hub/gupshup?token=…</code>.</td></tr></table>
<p>Guarda y pulsa <b>Probar conexión</b>. Solo un proveedor está activo a la vez. Con Meta Cloud API, fuera de las 24 h de una conversación solo se pueden enviar plantillas aprobadas por Meta.</p>
<h3>Telegram</h3>
<ol>
<li>En Telegram habla con <b>@BotFather</b> → <code>/newbot</code> y copia el token.</li>
<li>Pégalo en <b>Telegram · bot</b> y pulsa <b>Guardar y conectar</b>: el webhook se registra solo y aparece el enlace de tu bot.</li>
<li>Puedes cambiar el <b>mensaje de bienvenida</b>. Quien escriba al bot queda como un lead nuevo (origen Telegram) y se le pide su teléfono con un botón.</li>
</ol>
<h3>Meta: anuncios de Facebook e Instagram</h3>
<p>Pestaña <b>Meta</b>: guarda el token de la página (permiso <code>leads_retrieval</code>) y el <b>App Secret</b> (con él se rechazan los webhooks sin firma válida). En tu app de Meta suscribe el campo <code>leadgen</code> a <code>/hub/facebook?token=…</code>.</p>
<h3>Otro proveedor de WhatsApp o SMS (BSP)</h3>
<p>Si tu proveedor no está en la lista (360dialog, Infobip, Hablame, Onurix, Altiria…), elige <b>Otro proveedor (API HTTP)</b>. Ver la sección 7g.</p>
<h3>Llamadas y SMS</h3>
<p>Se configuran en la pestaña <b>SMS y llamadas</b> (sección 7g).</p>
</div>
</div>
</div>
<div class="panel panel-default" id="ch-m-telefonia" data-roles="">
  <div class="panel-heading"><h4 class="panel-title">7g. SMS, llamadas, troncal y otros proveedores (administradores)</h4></div>
  <div class="panel-body">
<h3>¿Mi proveedor no es Gupshup?</h3>
<p>En <b>Canales de mensajería → WhatsApp</b> y en <b>SMS y llamadas → SMS</b> elige <b>Otro proveedor (API HTTP)</b>. Pulsa una <b>plantilla de ejemplo</b> y ajusta con los datos de la documentación de tu proveedor:</p>
<ul>
<li><b>URL y método</b> (POST o GET), <b>autenticación</b> (ninguna, token Bearer, usuario y clave, o una cabecera propia) y <b>token/clave</b> (se guarda y nunca se vuelve a mostrar).</li>
<li><b>Plantilla del cuerpo</b> (JSON, formulario o parámetros en la URL) con las variables <code>\{{to}}</code> (teléfono con +), <code>\{{to_plain}}</code> (solo dígitos), <code>\{{text}}</code>, <code>\{{from}}</code>, <code>\{{name}}</code>, <code>\{{lead_id}}</code>, <code>\{{agent}}</code> y <code>\{{agent_phone}}</code>.</li>
<li><b>Mensajes entrantes (opcional):</b> el proveedor envía a <code>/hub/generic?channel=sms</code> (o <code>whatsapp</code>) <code>&amp;token=…</code>; indica la ruta del teléfono, del texto y del nombre en el JSON que recibes (por ejemplo <code>messages.0.from</code>).</li>
</ul>
<p>Prueba con <b>Enviar SMS de prueba</b> a tu celular. Por seguridad, no se aceptan direcciones internas del servidor.</p>
<h3>SMS: números largos, códigos cortos y remitentes</h3>
<p>El CRM envía por la API de tu proveedor; el tipo de remitente lo define lo que él te habilite. En <b>Remitente</b> escribe un número largo (+57…), un <b>código corto</b> (p. ej. 89999) o un nombre alfanumérico. Con <b>Twilio</b> basta guardar Account SID, Auth Token y remitente (o un Messaging Service que empiece por MG). Para recibir respuestas, en tu número de Twilio pon como webhook la URL que muestra la pestaña.</p>
<h3>Llamadas: ¿dónde va mi troncal?</h3>
<div class="ch-tip">La <b>troncal SIP</b> no se configura en el CRM: vive en tu <b>central telefónica</b> (Asterisk, FreePBX, 3CX…) o en tu <b>proveedor</b> (Twilio, Telnyx…). El CRM solo le pide a esa central que marque.</div>
<ol>
<li>En <b>SMS y llamadas → Llamadas</b> elige el proveedor: <b>Twilio</b> (usa las credenciales de arriba y el número de caller ID) u <b>Otra central (API HTTP)</b> (plantillas para Asterisk ARI y API REST).</li>
<li>Cuando un asesor pulsa <b>Llamar</b>, la central llama primero a su teléfono o extensión y, al contestar, lo conecta con el cliente. El caller ID es el número que ve el cliente.</li>
<li>Cada llamada queda en <b>Llamadas</b> con su duración y resultado, y una nota en el lead. Con Twilio puedes activar la grabación.</li>
<li>Si no configuras nada, el botón Llamar sigue abriendo el softphone del asesor (<code>tel:</code>).</li>
</ol>
</div>
</div>
<div class="panel panel-default" id="ch-m-masivos" data-roles="director gerente">
  <div class="panel-heading"><h4 class="panel-title">7h. Mensajes masivos (campañas de envío)</h4></div>
  <div class="panel-body">
<p>Menú <b>Mensajes masivos</b>: envía un mensaje a un grupo de leads por WhatsApp, SMS o Telegram, con ritmo controlado.</p>
<ol>
<li><b>Canal:</b> elige WhatsApp, SMS o Telegram (debe estar configurado en Integraciones).</li>
<li><b>Audiencia:</b> filtra por estado, resultado del filtro, origen, canal preferido, antigüedad, servicio sugerido o asesor, y pulsa <b>Calcular audiencia</b> para ver cuántos y quiénes. Solo entran quienes tienen el dato de contacto y no pidieron «no contactar»; verás los leads que tus permisos permiten.</li>
<li><b>Mensaje:</b> escribe el texto con variables (<code>{nombre}</code>, <code>{primer_nombre}</code>, <code>{servicio}</code>, <code>{asesor}</code>, <code>{empresa}</code>). Se agrega «Responde BAJA para no recibir más» (recomendado).</li>
<li><b>Ritmo y horario:</b> mensajes por minuto, y empezar <b>ahora</b> o <b>programado</b>.</li>
<li>Pulsa <b>Crear y enviar campaña</b>. En la lista puedes ver el avance, <b>pausar, reanudar o cancelar</b>; el detalle muestra enviados, fallidos y omitidos.</li>
</ol>
<div class="ch-warn">Envía solo a clientes que <b>autorizaron</b> ser contactados (Ley 1581 / habeas data). Quien responda BAJA queda excluido automáticamente. Con WhatsApp oficial (Meta), fuera de las 24 h solo se permiten plantillas aprobadas; con Evolution (no oficial) un ritmo alto puede hacer que bloqueen tu número: usa pocos mensajes por minuto.</div>
</div>
</div>
<div class="panel panel-default" id="ch-m-formularios" data-roles="">
  <div class="panel-heading"><h4 class="panel-title">7f. Formularios web de captación (administradores)</h4></div>
  <div class="panel-body">
<p>En <b>Integraciones → Formularios web</b> diseñas tus propios formularios. Cada uno tiene una <b>dirección pública</b> (<code>https://tu-dominio/f/nombre</code>) para enlazarla en anuncios, redes o un QR, o <b>incrustarla</b> en tu página con el botón <i>Código para incrustar</i> (iframe).</p>
<ol>
<li><b>Nuevo formulario</b> arranca con una plantilla (nombre, teléfono, correo, deuda aproximada y canal preferido). Pulsa <b>Editar</b> para ajustar título, texto, color, botón y mensaje de éxito.</li>
<li><b>Campos:</b> agrega, ordena y marca como obligatorios. Cada campo se guarda donde elijas: nombre, teléfono, correo, ingresos, deuda total, deuda en mora, acreedores, o en las notas del lead. Si hay datos de deuda, el lead se <b>califica solo</b> con tus servicios y filtros.</li>
<li><b>Campaña:</b> escribe el nombre exacto de una campaña para ligar los leads y que se repartan entre sus equipos. Si el enlace trae <code>?utm_campaign=nombre</code> y coincide con una campaña, también se liga.</li>
<li><b>Autorización de datos (habeas data):</b> el texto que aceptan queda en el historial del lead junto con la fecha. Puedes hacerla obligatoria.</li>
<li><b>Telegram:</b> si el cliente elige ese canal, al enviar ve un botón para abrir tu bot y queda ligado a su lead.</li>
<li>Pulsa <b>Guardar formularios</b> para publicar. Un formulario <i>apagado</i> deja de responder. Los parámetros <code>utm_source</code>, <code>utm_medium</code>… de la URL se guardan en las notas del lead.</li>
</ol>
<div class="ch-tip">Protección: el formulario rechaza envíos instantáneos de robots y repetidos desde la misma conexión (8 por 10 minutos). Si un cliente ya existe (mismo teléfono o correo), se actualiza su lead y se anota que volvió a escribir, sin duplicarlo.</div>
</div>
</div>
<div class="panel panel-default" id="ch-m-actividades" data-roles="comercial director gerente">
  <div class="panel-heading"><h4 class="panel-title">8. Tareas y calendario</h4></div>
  <div class="panel-body">
<ul><li><b>Tareas:</b> crea recordatorios ligados a un lead (por ejemplo "Llamar el viernes") con fecha de vencimiento.</li><li><b>Calendario:</b> muestra tus llamadas, reuniones y tareas; haz clic en un hueco para agendar.</li><li>Las actividades pendientes aparecen en el panel de inicio.</li></ul>
</div>
</div>
<div class="panel panel-default" id="ch-m-admin" data-roles="">
  <div class="panel-heading"><h4 class="panel-title">9. Administración (solo administradores)</h4></div>
  <div class="panel-body">
<h3>Crear un usuario</h3>
<ol><li>Menú de usuario → <b>Administración</b> → <b>Usuarios</b> → <b>Crear usuario</b>.</li><li>Define usuario, contraseña y correo.</li><li>Asigna el <b>rol</b> (Comercial, Director de Equipo o Gerente General) y su <b>equipo</b>.</li></ol>
<h3>Webhooks de captación</h3>
<p>Los datos de conexión de tu empresa (dirección y token) los entrega el equipo de plataforma. Rutas:</p>
<ul><li><code>/hub/facebook?token=…</code> — Facebook e Instagram Leads</li><li><code>/hub/evolution</code> — WhatsApp (Evolution API, cabecera <code>apikey</code>)</li><li><code>/hub/web?token=…</code> — formularios web</li></ul>
<p>No compartas el token fuera de la empresa.</p>
</div>
</div>
<div class="panel panel-default" id="ch-m-faq" data-roles="comercial director gerente">
  <div class="panel-heading"><h4 class="panel-title">10. Preguntas frecuentes</h4></div>
  <div class="panel-body">
<h3>El reporte quedó en "Error"</h3><p>Lo más común: PDF escaneado o protegido. Descarga de nuevo el PDF original del buró y vuelve a adjuntarlo.</p>
<h3>El asistente IA no responde</h3><p>Puede estar ocupado procesando otro reporte. Espera un minuto y reintenta; si persiste, avisa al administrador.</p>
<h3>Mi licencia aparece vencida o suspendida</h3><p>Las funciones de IA y la captación automática se pausan. Contacta al administrador de tu empresa.</p>
<h3>¿Cómo cambio mi contraseña?</h3><p>Menú de usuario → Preferencias → Cambiar contraseña.</p>
</div>
</div></div>
  </div>
</div>
