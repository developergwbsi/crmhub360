<div class="page-header"><h3>Integraciones</h3></div>
{{#if loading}}<div class="ch-muted">Cargando…</div>{{/if}}
{{#if error}}<div class="ch-warn">No se pudo consultar el servicio de integraciones. Intenta de nuevo en unos minutos.</div>{{/if}}
{{#unless loading}}{{#unless error}}
<div class="ch-tabbar" role="tablist">
  {{#each tabs}}<button type="button" role="tab" class="ch-tabbtn {{#if active}}active{{/if}}" data-action="tab" data-tab="{{key}}"><span class="{{icon}}"></span> {{label}}</button>{{/each}}
</div>

<div class="ch-pane" data-pane="canales">
<div class="ch-grid">
  <div class="panel panel-default ch-span-2">
    <div class="panel-heading"><h4 class="panel-title">Direcciones de captación · Webhooks</h4></div>
    <div class="panel-body">
      <p class="ch-muted">Direcciones que se pegan en cada canal para que los mensajes y leads lleguen aquí. Cada lead aparece en <b>Leads</b> con su origen.</p>
      <table class="table table-bordered ch-table">
        <thead><tr><th>Canal</th><th>Método</th><th>URL</th><th></th></tr></thead>
        <tbody>
        {{#each rows}}
          <tr>
            <td><span class="{{icon}}"></span> <b>{{name}}</b><div class="ch-muted ch-small">{{note}}</div></td>
            <td>{{method}}</td>
            <td><code class="ch-url">{{url}}</code></td>
            <td>{{#if copy}}<button class="btn btn-default btn-sm" data-action="copy" data-value="{{copy}}"><span class="far fa-copy"></span> Copiar</button>{{/if}}</td>
          </tr>
        {{/each}}
        </tbody>
      </table>
      <div class="ch-row">
        <button class="btn btn-default btn-sm" data-action="toggleToken"><span class="far fa-eye"></span> {{#if showToken}}Ocultar{{else}}Mostrar{{/if}} token</button>
        <span class="ch-muted ch-small">Trata el token como una contraseña: quien lo tenga puede crear leads en tu empresa.</span>
      </div>
    </div>
  </div>

  <div class="panel panel-default ch-span-2">
    <div class="panel-heading"><h4 class="panel-title"><span class="fab fa-whatsapp"></span> WhatsApp · proveedor de mensajería</h4></div>
    <div class="panel-body">
      <p class="ch-muted">Elige con qué proveedor atiende tu empresa. Los asesores envían desde el botón <b>WhatsApp</b> del lead y las respuestas del cliente llegan al flujo del lead.</p>
      <div class="form-group" style="max-width:420px"><label>Proveedor</label>
        <select name="wa_provider" class="form-control">{{#each provOptions}}<option value="{{value}}" {{#if selected}}selected{{/if}}>{{label}}</option>{{/each}}</select></div>

      <div class="ch-prov" data-prov="evolution">
        <div class="form-group"><label>URL de Evolution API</label><input name="wa_url" class="form-control" value="{{s.wa.evolution.url}}" placeholder="https://evolution.tuempresa.com"></div>
        <div class="form-group"><label>Nombre de la instancia</label><input name="wa_instance" class="form-control" value="{{s.wa.evolution.instance}}" placeholder="mi-instancia"></div>
        <div class="form-group"><label>API key de la instancia</label><input type="password" name="wa_key" class="form-control" autocomplete="off" placeholder="{{#if s.wa.evolution.keySet}}Configurada {{s.wa.evolution.keyHint}} · escribe una nueva para reemplazarla{{else}}Pega aquí la clave{{/if}}"></div>
        <div class="ch-help">Para <b>recibir</b>: en Evolution, webhook de la instancia → <code>{{hub}}/evolution</code>, evento <code>MESSAGES_UPSERT</code>, encabezado <code>apikey</code> = el token.</div>
      </div>

      <div class="ch-prov" data-prov="meta">
        <div class="form-group"><label>Phone Number ID</label><input name="meta_pid" class="form-control" value="{{s.wa.meta.phoneNumberId}}" placeholder="Identificador del número en Meta (WhatsApp → Configuración de la API)"></div>
        <div class="form-group"><label>Token de acceso permanente</label><input type="password" name="meta_token" class="form-control" autocomplete="off" placeholder="{{#if s.wa.meta.tokenSet}}Configurado {{s.wa.meta.tokenHint}} · escribe uno nuevo para reemplazarlo{{else}}Token del usuario del sistema{{/if}}"></div>
        <div class="ch-help">Para <b>recibir</b>: en tu app de Meta → WhatsApp → Configuración → Webhooks: URL <code>{{hub}}/whatsapp-cloud?token=…</code> (cópiala de la tabla de arriba), token de verificación = el token de tu empresa, suscribe el campo <code>messages</code>. El <b>App Secret</b> (pestaña Meta) valida la firma. Fuera de las 24 h de una conversación, Meta exige plantillas aprobadas.</div>
      </div>

      <div class="ch-prov" data-prov="gupshup">
        <div class="form-group"><label>API key de Gupshup</label><input type="password" name="gs_key" class="form-control" autocomplete="off" placeholder="{{#if s.wa.gupshup.keySet}}Configurada {{s.wa.gupshup.keyHint}} · escribe una nueva para reemplazarla{{else}}Pega aquí la clave{{/if}}"></div>
        <div class="form-group"><label>Número de origen (source)</label><input name="gs_source" class="form-control" value="{{s.wa.gupshup.source}}" placeholder="573001234567"></div>
        <div class="form-group"><label>Nombre de la app en Gupshup</label><input name="gs_app" class="form-control" value="{{s.wa.gupshup.appName}}" placeholder="MiApp"></div>
        <div class="ch-help">Para <b>recibir</b>: en Gupshup → tu app → Webhook (Inbound): <code>{{hub}}/gupshup?token=…</code> (cópiala de la tabla de arriba).</div>
      </div>

      <div class="ch-prov" data-prov="twilio">
        <div class="form-group"><label>Número de WhatsApp de Twilio</label><input name="wa_tw_from" class="form-control" value="{{s.twilio.waFrom}}" placeholder="+14155238886"></div>
        <div class="ch-help">Usa las credenciales de la pestaña <b>SMS y llamadas → Twilio</b>. Para <b>recibir</b>: en Twilio, en tu número de WhatsApp → «When a message comes in»: <code>{{hub}}/twilio?token=…</code> (cópiala de la tabla de arriba).</div>
      </div>

      <div class="ch-prov" data-prov="generic">
        <p class="ch-muted">¿Tu proveedor no está en la lista? Configura su API aquí: dónde se envía, cómo se autentica y cómo es el cuerpo del mensaje, con variables como <code>{{to}}</code> y <code>{{text}}</code>.</p>
        <div class="ch-http" data-kind="whatsapp"></div>
      </div>

      <div class="ch-row" style="margin-top:12px">
        <button class="btn btn-primary" data-action="saveWhatsapp">Guardar</button>
        <button class="btn btn-default" data-action="testWhatsapp"><span class="fas fa-plug"></span> Probar conexión</button>
        <button class="btn btn-default" data-action="linkWhatsapp" title="Solo Evolution API"><span class="fas fa-qrcode"></span> Vincular WhatsApp (QR)</button>
        <button class="btn btn-default" data-action="changeWhatsapp" title="Solo Evolution API: cierra la sesión del número actual y te deja escanear otro"><span class="fas fa-right-left"></span> Cambiar de número</button>
        <span class="ch-small" data-role="waStatus"></span>
      </div>
    </div>
  </div>

  <div class="panel panel-default ch-span-2">
    <div class="panel-heading"><h4 class="panel-title"><span class="fab fa-telegram"></span> Telegram · bot</h4></div>
    <div class="panel-body">
      <p class="ch-muted">Si un cliente prefiere que lo contacten por Telegram, escribe a tu bot (o abre el enlace de invitación que genera el formulario o el asesor). La conversación queda en el lead y el asesor responde desde el botón <b>Telegram</b>.</p>
      <div class="ch-cols2">
        <div>
          <div class="form-group"><label>Token del bot (de @BotFather)</label><input type="password" name="tg_token" class="form-control" autocomplete="off" placeholder="{{#if s.telegram.tokenSet}}Configurado {{s.telegram.tokenHint}} · escribe uno nuevo para reemplazarlo{{else}}123456:ABC-DEF…{{/if}}"></div>
          <div class="form-group"><label>Mensaje de bienvenida</label><textarea name="tg_welcome" class="form-control" rows="3" placeholder="¡Hola! Recibimos tu mensaje. Un asesor te escribirá por aquí en breve.">{{s.telegram.welcome}}</textarea></div>
        </div>
        <div>
          <div class="ch-help" style="margin-top:0">1. En Telegram habla con <b>@BotFather</b> → <code>/newbot</code> y copia el token.<br>2. Pégalo aquí y pulsa <b>Guardar y conectar</b>: se registra el webhook automáticamente.<br>3. {{#if s.telegram.bot}}Tu bot es <a href="https://t.me/{{s.telegram.bot}}" target="_blank" rel="noopener"><b>@{{s.telegram.bot}}</b></a>.{{else}}Aparecerá aquí el enlace del bot.{{/if}}</div>
        </div>
      </div>
      <div class="ch-row">
        <button class="btn btn-primary" data-action="saveTelegram">Guardar y conectar</button>
        <button class="btn btn-default" data-action="testTelegram"><span class="fas fa-plug"></span> Probar</button>
        <span class="ch-small" data-role="tgStatus"></span>
      </div>
    </div>
  </div>
</div>
</div>

<div class="ch-pane" data-pane="formularios" style="display:none">
  <div class="panel panel-default">
    <div class="panel-heading"><h4 class="panel-title"><span class="fas fa-file-lines"></span> Formularios web de captación</h4></div>
    <div class="panel-body">
      <p class="ch-muted">Diseña tus propios formularios. Cada uno tiene una <b>dirección pública</b> que puedes enlazar (anuncios, redes, QR) o <b>incrustar</b> en tu página con un iframe. Al enviarse crea el lead, guarda la autorización de datos y, si hay datos de deuda, lo califica.</p>
      <div class="ch-forms"></div>
      <div class="ch-row ch-services-actions">
        <button class="btn btn-default btn-sm" data-action="addForm"><span class="fas fa-plus"></span> Nuevo formulario</button>
        <button class="btn btn-primary" data-action="saveForms">Guardar formularios</button>
      </div>
    </div>
  </div>
</div>

<div class="ch-pane" data-pane="meta" style="display:none">
<div class="ch-grid">
  <div class="panel panel-default ch-span-2">
    <div class="panel-heading"><h4 class="panel-title"><span class="fab fa-facebook"></span> Meta · Facebook, Instagram y WhatsApp Cloud API</h4></div>
    <div class="panel-body">
      <p class="ch-muted">Credenciales de tu app de Meta (developers.facebook.com). Se usan para leer los leads de los formularios de anuncios y para validar la firma de los webhooks.</p>
      <div class="ch-cols2">
        <div>
          <div class="form-group"><label>Token de acceso de la página (permiso <code>leads_retrieval</code>)</label>
            <input type="password" name="fb_token" class="form-control" autocomplete="off" placeholder="{{#if s.fbPageTokenSet}}Configurado {{s.fbPageTokenHint}} · escribe uno nuevo para reemplazarlo{{else}}Pega aquí el token{{/if}}"></div>
          <div class="form-group"><label>App Secret de la app de Meta</label>
            <input type="password" name="meta_secret" class="form-control" autocomplete="off" placeholder="{{#if s.metaAppSecretSet}}Configurado · escribe uno nuevo para reemplazarlo{{else}}Para verificar la firma de los webhooks{{/if}}"></div>
          <button class="btn btn-primary" data-action="saveMeta">Guardar</button>
        </div>
        <div class="ch-help" style="margin-top:0">
          <b>Leads de anuncios (Facebook / Instagram):</b> en la app de Meta → Webhooks → <i>Page</i> → campo <code>leadgen</code>. URL: <code>{{hub}}/facebook?token=…</code>; token de verificación = el token de tu empresa.<br><br>
          <b>WhatsApp Cloud API:</b> las credenciales del número van en <i>Canales → WhatsApp</i>; aquí solo el App Secret.<br><br>
          Con el <b>App Secret</b> guardado, se rechazan los webhooks de Meta sin firma válida.
        </div>
      </div>
    </div>
  </div>
</div>
</div>

<div class="ch-pane" data-pane="telefonia" style="display:none">
<div class="ch-grid">
  <div class="panel panel-default ch-span-2">
    <div class="panel-heading"><h4 class="panel-title"><span class="fas fa-phone-volume"></span> Twilio · una cuenta para SMS, WhatsApp y llamadas</h4></div>
    <div class="panel-body">
      <p class="ch-muted">Opcional: si usas Twilio, guarda aquí las credenciales una sola vez y elígelo como proveedor en cada canal. Para <b>recibir</b> SMS: en tu número de Twilio → «A message comes in»: <code>{{hub}}/twilio?token=…</code>.</p>
      <div class="ch-cols2">
        <div class="form-group"><label>Account SID</label><input name="tw_sid" class="form-control" value="{{s.twilio.sid}}" placeholder="AC…"></div>
        <div class="form-group"><label>Auth Token</label><input type="password" name="tw_token" class="form-control" autocomplete="off" placeholder="{{#if s.twilio.tokenSet}}Configurado {{s.twilio.tokenHint}} · escribe uno nuevo para reemplazarlo{{else}}Token de autenticación{{/if}}"></div>
        <div class="form-group"><label>Remitente de SMS</label><input name="tw_sms_from" class="form-control" value="{{s.twilio.smsFrom}}" placeholder="+1…, código corto, ID alfanumérico o Messaging Service (MG…)"></div>
        <div class="form-group"><label>Número para llamadas (caller ID)</label><input name="tw_voice_from" class="form-control" value="{{s.twilio.voiceFrom}}" placeholder="+57…"></div>
      </div>
      <div class="ch-row"><button class="btn btn-primary" data-action="saveTwilio">Guardar</button>
        <button class="btn btn-default" data-action="testTwilio"><span class="fas fa-plug"></span> Probar credenciales</button><span class="ch-small" data-role="twStatus"></span></div>
    </div>
  </div>

  <div class="panel panel-default ch-span-2">
    <div class="panel-heading"><h4 class="panel-title"><span class="fas fa-comment-sms"></span> SMS</h4></div>
    <div class="panel-body">
      <p class="ch-muted">Los asesores envían desde el botón <b>SMS</b> del lead y las campañas masivas pueden usar este canal. El <b>remitente</b> puede ser un número largo, un <b>código corto</b> o un ID alfanumérico: depende de lo que tu proveedor te haya habilitado.</p>
      <div class="form-group" style="max-width:420px"><label>Proveedor</label>
        <select name="sms_provider" class="form-control" data-for="sms">{{#each smsOptions}}<option value="{{value}}" {{#if selected}}selected{{/if}}>{{label}}</option>{{/each}}</select></div>
      <div class="ch-prov" data-for="sms" data-prov="twilio"><div class="ch-help" style="margin-top:0">Usa las credenciales de Twilio de arriba; el remitente es «Remitente de SMS».</div></div>
      <div class="ch-prov" data-for="sms" data-prov="generic">
        <p class="ch-muted">Configura la API de tu proveedor de SMS (Infobip, Hablame, Onurix, LabsMobile, Altiria… cualquiera con API REST).</p>
        <div class="ch-http" data-kind="sms"></div>
      </div>
      <div class="ch-row" style="margin-top:12px"><button class="btn btn-primary" data-action="saveSms">Guardar</button>
        <input name="sms_test_to" class="form-control" style="max-width:200px" placeholder="Celular de prueba">
        <button class="btn btn-default" data-action="testSms"><span class="fas fa-paper-plane"></span> Enviar SMS de prueba</button><span class="ch-small" data-role="smsStatus"></span></div>
    </div>
  </div>

  <div class="panel panel-default ch-span-2">
    <div class="panel-heading"><h4 class="panel-title"><span class="fas fa-phone"></span> Llamadas desde el CRM · troncal / central</h4></div>
    <div class="panel-body">
      <div class="ch-help" style="margin-top:0"><b>¿Dónde está mi troncal?</b> La troncal SIP se configura en tu <b>central telefónica</b> (Asterisk / FreePBX, 3CX…) o en tu <b>proveedor</b> (Twilio, Telnyx…); el CRM no maneja SIP. Aquí le indicas <b>cómo pedirle a esa central que marque</b>: primero llama al teléfono o extensión del asesor y, al contestar, lo conecta con el cliente (click-to-call). Sin esta configuración, el botón <b>Llamar</b> abre el marcador del equipo.</div>
      <div class="form-group" style="max-width:420px;margin-top:12px"><label>Proveedor / central</label>
        <select name="voice_provider" class="form-control" data-for="voice">{{#each voiceOptions}}<option value="{{value}}" {{#if selected}}selected{{/if}}>{{label}}</option>{{/each}}</select></div>
      <div class="ch-prov" data-for="voice" data-prov="twilio">
        <label class="ch-switch"><input type="checkbox" name="voice_record" {{#if s.voice.record}}checked{{/if}}> Grabar las llamadas (avisa al cliente según la ley)</label>
        <div class="ch-help">Usa las credenciales de Twilio de arriba y el «Número para llamadas». Twilio debe poder llamar a tu servidor: las direcciones <code>{{hub}}/voice-bridge</code> y <code>/voice-status</code> se usan solas.</div>
      </div>
      <div class="ch-prov" data-for="voice" data-prov="generic">
        <p class="ch-muted">Configura la petición que inicia la llamada en tu central. Variables: <code>\{{agent_phone}}</code> (teléfono/extensión del asesor) y <code>\{{to}}</code> (cliente).</p>
        <div class="ch-http" data-kind="voice"></div>
      </div>
      <div class="ch-row" style="margin-top:12px"><button class="btn btn-primary" data-action="saveVoice">Guardar</button>
        <span class="ch-small ch-muted">Pruébalo desde un lead de prueba con el botón Llamar.</span></div>
    </div>
  </div>
</div>
</div>

<div class="ch-pane" data-pane="reglas" style="display:none">
<div class="ch-grid">
  <div class="panel panel-default ch-span-2">
    <div class="panel-heading"><h4 class="panel-title">Servicios y filtros</h4></div>
    <div class="panel-body">
      <p class="ch-muted">Define qué servicios ofrece tu empresa y las condiciones que debe cumplir un cliente para cada uno.
        Cuando llega un reporte de crédito (o editas los datos del lead) el sistema evalúa los servicios <b>en este orden</b>
        y sugiere el primero que cumpla, con los motivos. Si falta un dato, el lead queda en <i>Revisión Manual</i>.</p>
      <div class="ch-services"></div>
      <div class="ch-row ch-services-actions">
        <button class="btn btn-default btn-sm" data-action="addService"><span class="fas fa-plus"></span> Agregar servicio</button>
        <button class="btn btn-default btn-sm" data-action="resetServices">Restaurar valores iniciales</button>
        <button class="btn btn-primary" data-action="saveServices">Guardar servicios y filtros</button>
      </div>
    </div>
  </div>
</div>
</div>

<div class="ch-pane" data-pane="sistema" style="display:none">
<div class="ch-grid">
  <div class="panel panel-default">
    <div class="panel-heading"><h4 class="panel-title">Notificaciones push</h4></div>
    <div class="panel-body">
      <p class="ch-muted">Avisos que llegan al dispositivo <b>aunque la app esté cerrada</b> (hoy: nueva versión disponible). Cada persona los activa con el botón
        <span class="fas fa-bullhorn"></span> de la barra superior.</p>
      <table class="table ch-kv"><tr><td>Dispositivos suscritos</td><td><b>{{s.pushDevices}}</b></td></tr></table>
      <div class="ch-row"><button class="btn btn-default" data-action="pushTest"><span class="fas fa-paper-plane"></span> Enviarme una prueba</button>
        <span class="ch-small" data-role="pushStatus"></span></div>
    </div>
  </div>

  <div class="panel panel-default">
    <div class="panel-heading"><h4 class="panel-title">Inteligencia artificial</h4></div>
    <div class="panel-body">
      <table class="table ch-kv">
        <tr><td>Modelo</td><td><code>{{s.model}}</code></td></tr>
        <tr><td>Estado</td><td>{{#if s.aiReachable}}<span class="label label-success">Disponible</span>{{else}}<span class="label label-danger">No disponible</span>{{/if}}</td></tr>
        <tr><td>Procesos completados</td><td>{{jobsDone}}</td></tr>
        <tr><td>Procesos con error</td><td>{{jobsError}}</td></tr>
      </table>
    </div>
  </div>

  <div class="panel panel-default">
    <div class="panel-heading"><h4 class="panel-title">Licencia</h4></div>
    <div class="panel-body">
      <table class="table ch-kv">
        <tr><td>Estado</td><td>{{#if active}}<span class="label label-success">Activa</span>{{else}}<span class="label label-danger">{{s.status}}</span>{{/if}}</td></tr>
        <tr><td>Plan</td><td>{{s.plan}}</td></tr>
        <tr><td>Usuarios máximos</td><td>{{s.maxUsers}}</td></tr>
        <tr><td>Vigencia</td><td>{{license}}</td></tr>
      </table>
    </div>
  </div>

  <div class="panel panel-default ch-span-2">
    <div class="panel-heading"><h4 class="panel-title">Configuración comercial</h4></div>
    <div class="panel-body ch-row">
      <a class="btn btn-default" href="#CrmHub/asignacion"><span class="fas fa-shuffle"></span> Asignación de leads (balanceo)</a>
      <a class="btn btn-default" href="#CrmHub/pipeline"><span class="fas fa-timeline"></span> Estados del pipeline</a>
      <span class="ch-muted ch-small">Dónde se define quién recibe los leads y qué estados existen.</span>
    </div>
  </div>
</div>
</div>
{{/unless}}{{/unless}}
