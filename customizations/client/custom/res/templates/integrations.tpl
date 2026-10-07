<div class="page-header"><h3>Integraciones</h3></div>
{{#if loading}}<div class="ch-muted">Cargando…</div>{{/if}}
{{#if error}}<div class="ch-warn">No se pudo consultar el servicio de integraciones. Intenta de nuevo en unos minutos.</div>{{/if}}
{{#unless loading}}{{#unless error}}
<div class="ch-grid">
  <div class="panel panel-default ch-span-2">
    <div class="panel-heading"><h4 class="panel-title">Captación de leads · Webhooks</h4></div>
    <div class="panel-body">
      <p class="ch-muted">Configura estas direcciones en cada canal. Cada lead que llegue aparece en <b>Leads</b> con su origen.</p>
      <table class="table table-bordered ch-table">
        <thead><tr><th>Canal</th><th>Método</th><th>URL</th><th></th></tr></thead>
        <tbody>
        {{#each rows}}
          <tr>
            <td><span class="{{icon}}"></span> <b>{{name}}</b><div class="ch-muted ch-small">{{note}}</div></td>
            <td>{{method}}</td>
            <td><code class="ch-url">{{url}}</code></td>
            <td><button class="btn btn-default btn-sm" data-action="copy" data-value="{{copy}}"><span class="far fa-copy"></span> Copiar</button></td>
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

  <div class="panel panel-default">
    <div class="panel-heading"><h4 class="panel-title">WhatsApp · envío de mensajes</h4></div>
    <div class="panel-body">
      <p class="ch-muted">Conecta tu instancia de <b>Evolution API</b> para que los asesores envíen WhatsApp desde el lead (botón <b>WhatsApp</b>).
        La recepción de mensajes se configura con la dirección <code>/hub/evolution</code> de arriba.</p>
      <div class="form-group"><label>URL de Evolution API</label>
        <input name="wa_url" class="form-control" value="{{s.wa.url}}" placeholder="https://evolution.tuempresa.com"></div>
      <div class="form-group"><label>Nombre de la instancia</label>
        <input name="wa_instance" class="form-control" value="{{s.wa.instance}}" placeholder="mi-instancia"></div>
      <div class="form-group"><label>API key de la instancia</label>
        <input type="password" name="wa_key" class="form-control" autocomplete="off"
               placeholder="{{#if s.wa.keySet}}Configurada {{s.wa.keyHint}} · escribe una nueva para reemplazarla{{else}}Pega aquí la clave{{/if}}"></div>
      <div class="ch-row">
        <button class="btn btn-primary" data-action="saveWhatsapp">Guardar</button>
        <button class="btn btn-default" data-action="testWhatsapp"><span class="fas fa-plug"></span> Probar conexión</button>
        <span class="ch-small" data-role="waStatus"></span>
      </div>
    </div>
  </div>

  <div class="panel panel-default">
    <div class="panel-heading"><h4 class="panel-title">Facebook / Instagram</h4></div>
    <div class="panel-body">
      <p class="ch-muted">Token de acceso de la página (permiso <code>leads_retrieval</code>) para consultar los datos del formulario.</p>
      <div class="form-group">
        <label>Token de página</label>
        <input type="password" name="fb_page_token" class="form-control" autocomplete="off"
               placeholder="{{#if s.fbPageTokenSet}}Configurado {{s.fbPageTokenHint}} · escribe uno nuevo para reemplazarlo{{else}}Pega aquí el token{{/if}}">
      </div>
      <button class="btn btn-primary" data-action="saveFacebook">Guardar</button>
    </div>
  </div>

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

  <div class="panel panel-default ch-span-2">
    <div class="panel-heading"><h4 class="panel-title">Configuración comercial</h4></div>
    <div class="panel-body ch-row">
      <a class="btn btn-default" href="#CrmHub/asignacion"><span class="fas fa-shuffle"></span> Asignación de leads (balanceo)</a>
      <a class="btn btn-default" href="#CrmHub/pipeline"><span class="fas fa-timeline"></span> Estados del pipeline</a>
      <span class="ch-muted ch-small">Dónde se define quién recibe los leads y qué estados existen.</span>
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
</div>
{{/unless}}{{/unless}}
