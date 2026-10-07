<div class="page-header"><h3>Manual de usuario</h3></div>
<div class="ch-manual">
  <div class="ch-hero"><h2>Guía práctica de {{appName}}</h2><p>Para comerciales, directores de equipo y gerentes.</p></div>
  <div class="ch-rolebar"><span>Manual para: <b>{{roleLabel}}</b></span>
    {{#if canToggle}}<button class="btn btn-default btn-sm" data-action="toggleAll">{{#if showAll}}Ver solo mi rol{{else}}Ver todo el manual{{/if}}</button>{{/if}}</div>
  <div class="ch-manual-layout">
    <div class="ch-manual-toc panel panel-default"><div class="panel-body"><a role="button" class="ch-toc-link" data-action="goTo" data-id="inicio" data-roles="comercial director gerente">1. Ingreso y navegación</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="app" data-roles="comercial director gerente">1b. Modo oscuro, instalar y sin internet</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="leads" data-roles="comercial director gerente">2. Leads</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="pipeline" data-roles="comercial director gerente">3. Tablero Kanban</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="credito" data-roles="comercial director gerente">4. Reporte de crédito con IA</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="asistente" data-roles="comercial director gerente">5. Asistente IA</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="contacto" data-roles="comercial director gerente">5b. Llamar y WhatsApp</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="canales" data-roles="gerente">6. Canales de captación</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="roles" data-roles="director gerente">7. Roles y equipos</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="asignacion" data-roles="director gerente">7b. Asignación y reasignación</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="organizacion" data-roles="director gerente">7c. Equipos, campañas y organigrama</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="config" data-roles="">7d. Estados y balanceo (configuración)</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="configcomm" data-roles="">7e. Configurar WhatsApp y llamadas</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="actividades" data-roles="comercial director gerente">8. Tareas y calendario</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="admin" data-roles="">9. Administración (solo administradores)</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="faq" data-roles="comercial director gerente">10. Preguntas frecuentes</a></div></div>
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
<h3>Avisos de nueva versión</h3>
<p>Cuando hay una versión nueva aparece abajo a la derecha <b>«Nueva versión disponible»</b> con el botón <b>Actualizar ahora</b>. Puedes pulsar <b>«Avisarme en el escritorio»</b> para recibir además una notificación del navegador (si has aceptado los permisos).</p>
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
<p>Abre el lead: arriba están los botones <b>Llamar</b> y <b>WhatsApp</b>. Ambos necesitan que el lead tenga <b>teléfono</b>.</p>
<h3>Llamar</h3>
<ol>
<li>Pulsa <b>Llamar</b>: se abre el marcador de tu equipo (tu softphone o la app de teléfono vinculada) con el número ya cargado.</li>
<li>Haz la llamada. Cuando termines, en la ventana <b>Registrar llamada</b> elige el <b>resultado</b> (Contactado, No contesta, Buzón de voz, Número equivocado, Reagendar), los minutos y tus notas, y guarda.</li>
<li>Queda en <b>Llamadas</b>, en el <b>Historial de actividades</b> y en el flujo del lead.</li>
</ol>
<h3>WhatsApp</h3>
<ol>
<li>Pulsa <b>WhatsApp</b>. Escribe el mensaje, o usa <b>Sugerir con IA</b> para que proponga un borrador según la conversación (revísalo y edítalo).</li>
<li>Pulsa <b>Enviar</b>. Sale desde el WhatsApp conectado de la empresa y queda en el flujo del lead.</li>
<li>Las respuestas del cliente aparecen solas en el flujo del lead.</li>
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
  <div class="panel-heading"><h4 class="panel-title">7e. Configurar WhatsApp y llamadas (administradores)</h4></div>
  <div class="panel-body">
<h3>WhatsApp</h3>
<ol>
<li>Necesitas una instancia de <b>Evolution API</b> con el WhatsApp de la empresa vinculado (QR escaneado en Evolution).</li>
<li>Entra a <b>Integraciones → WhatsApp · envío de mensajes</b> y completa: <b>URL de Evolution API</b>, <b>nombre de la instancia</b> y <b>API key</b>. Guarda.</li>
<li>Pulsa <b>Probar conexión</b>: debe decir <i>Conectado</i>. Si dice otro estado, vincula el teléfono en Evolution.</li>
<li>Para <b>recibir</b> los mensajes: en Evolution configura el webhook de la instancia hacia la dirección <code>/hub/evolution</code> que aparece en Integraciones (evento <code>MESSAGES_UPSERT</code>) y agrega el encabezado <code>apikey</code> con el token de tu empresa.</li>
</ol>
<h3>Llamadas</h3>
<p>El botón <b>Llamar</b> abre el marcador del equipo del asesor (enlace <code>tel:</code>) y registra el resultado. Para que marque, cada asesor necesita en su computador o teléfono un <b>softphone o app de telefonía</b> (por ejemplo Zoiper, Linphone, MicroSIP o la app de teléfono vinculada al celular) conectado a tu proveedor SIP o central telefónica, y configurado como aplicación predeterminada para enlaces de teléfono.</p>
<div class="ch-warn">La marcación directa desde el CRM con grabación, o llamadas por navegador (Twilio, Asterisk/WebRTC), <b>no están incluidas</b>: requieren contratar un proveedor y configurarlo con sus credenciales. Hoy el CRM registra el resultado de cada llamada, no el audio.</div>
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
