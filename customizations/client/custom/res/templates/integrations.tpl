<div class="page-header"><h3>Integraciones</h3></div>
{{#if loading}}<div class="ch-muted">Cargando…</div>{{/if}}
{{#if error}}<div class="ch-warn">No se pudo consultar el servicio de integraciones. Intenta de nuevo en unos minutos.</div>{{/if}}
{{#unless loading}}{{#unless error}}
<div class="ch-tabbar" role="tablist">
  {{#each tabs}}<button type="button" role="tab" class="ch-tabbtn {{#if active}}active{{/if}}" data-action="tab" data-tab="{{key}}"><span class="{{icon}}"></span> {{label}}</button>{{/each}}
</div>

<div class="ch-pane" data-pane="canales">
<div class="ch-grid">
  <div class="ch-span-2" data-role="lines"></div>
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
