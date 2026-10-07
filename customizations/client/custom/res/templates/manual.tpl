<div class="page-header"><h3>Manual de usuario</h3></div>
<div class="ch-manual">
  <div class="ch-hero"><h2>Guía práctica de {{appName}}</h2><p>Para comerciales, directores de equipo y gerentes.</p></div>
  <div class="ch-manual-layout">
    <div class="ch-manual-toc panel panel-default"><div class="panel-body"><a role="button" class="ch-toc-link" data-action="goTo" data-id="inicio">1. Ingreso y navegación</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="leads">2. Leads</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="pipeline">3. Tablero Kanban</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="credito">4. Reporte de crédito con IA</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="asistente">5. Asistente IA</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="canales">6. Canales de captación</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="roles">7. Roles y equipos</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="asignacion">7b. Asignación y reasignación</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="actividades">8. Tareas y calendario</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="admin">9. Administración (solo administradores)</a><a role="button" class="ch-toc-link" data-action="goTo" data-id="faq">10. Preguntas frecuentes</a></div></div>
    <div class="ch-manual-body">
<div class="panel panel-default" id="ch-m-inicio">
  <div class="panel-heading"><h4 class="panel-title">1. Ingreso y navegación</h4></div>
  <div class="panel-body">
<ol>
<li>Entra a la dirección de tu empresa e inicia sesión con tu usuario y contraseña.</li>
<li>Cambia tu contraseña la primera vez: menú de tu usuario (arriba a la derecha) → <b>Preferencias</b>.</li>
<li>El menú lateral izquierdo da acceso a <b>Leads</b>, cuentas, contactos, oportunidades, tareas y calendario.</li>
<li>Usa la lupa superior para buscar cualquier registro por nombre, teléfono o correo.</li>
</ol>
<div class="ch-tip">La pantalla de inicio es tu panel: muestra tus leads recientes, tareas pendientes, actividades y la actividad del equipo.</div>
</div>
</div>
<div class="panel panel-default" id="ch-m-leads">
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
<div class="panel panel-default" id="ch-m-pipeline">
  <div class="panel-heading"><h4 class="panel-title">3. Tablero Kanban</h4></div>
  <div class="panel-body">
<p>Al entrar a <b>Leads</b> verás el tablero Kanban: cada columna es un estado. Con los iconos de arriba a la derecha alternas entre el tablero y la lista.</p>
<ul><li><b>Arrastra</b> una tarjeta a otra columna para cambiar su estado.</li><li>Cada tarjeta muestra el avatar (foto de WhatsApp si existe, o las iniciales), el resultado del filtro, el servicio sugerido, la deuda, el teléfono, el asesor y la antigüedad.</li><li>Usa los filtros para ver solo los tuyos o los de tu equipo.</li><li>Vuelve a la lista con el icono de lista.</li></ul>
</div>
</div>
<div class="panel panel-default" id="ch-m-credito">
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
<div class="panel panel-default" id="ch-m-asistente">
  <div class="panel-heading"><h4 class="panel-title">5. Asistente IA</h4></div>
  <div class="panel-body">
<p>En el detalle de un lead, abre el menú de acciones (⋯ junto a <b>Editar</b>):</p>
<ul><li><b>IA: Resumir conversación</b> — viñetas con necesidad, objeciones y próximo paso.</li><li><b>IA: Redactar respuesta</b> — borrador de mensaje de WhatsApp en español.</li><li><b>IA: Analizar sentimiento</b> — sentimiento e interés de compra.</li></ul>
<p>Trabaja sobre la conversación registrada en el flujo del lead. Puede tardar de 15 a 60 segundos.</p>
<div class="ch-warn">Revisa y edita el texto antes de enviarlo. El asistente puede equivocarse; no uses sus resultados como única base de una decisión.</div>
</div>
</div>
<div class="panel panel-default" id="ch-m-canales">
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
<div class="panel panel-default" id="ch-m-roles">
  <div class="panel-heading"><h4 class="panel-title">7. Roles y equipos</h4></div>
  <div class="panel-body">
<table class="table table-bordered ch-table"><tr><th>Rol</th><th>Qué puede ver</th><th>Qué puede hacer</th></tr>
<tr><td><b>Comercial</b></td><td>Solo los leads asignados a él.</td><td>Crear y editar sus leads; usar IA y el tablero Kanban.</td></tr>
<tr><td><b>Director de Equipo</b></td><td>Los leads de su equipo.</td><td>Reasignar leads del equipo, ver el rendimiento del equipo y paneles.</td></tr>
<tr><td><b>Gerente General</b></td><td>Todo el sistema.</td><td>Gestión completa, analítica global y métricas.</td></tr></table>
<div class="ch-tip">Si no ves un lead que esperabas, normalmente está asignado a otro usuario o equipo. Pide a tu director que lo reasigne.</div>
</div>
</div>
<div class="panel panel-default" id="ch-m-asignacion">
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
<div class="panel panel-default" id="ch-m-actividades">
  <div class="panel-heading"><h4 class="panel-title">8. Tareas y calendario</h4></div>
  <div class="panel-body">
<ul><li><b>Tareas:</b> crea recordatorios ligados a un lead (por ejemplo "Llamar el viernes") con fecha de vencimiento.</li><li><b>Calendario:</b> muestra tus llamadas, reuniones y tareas; haz clic en un hueco para agendar.</li><li>Las actividades pendientes aparecen en el panel de inicio.</li></ul>
</div>
</div>
<div class="panel panel-default" id="ch-m-admin">
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
<div class="panel panel-default" id="ch-m-faq">
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
