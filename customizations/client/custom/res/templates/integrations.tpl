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

  <div class="panel panel-default">
    <div class="panel-heading"><h4 class="panel-title">Evaluación de crédito</h4></div>
    <div class="panel-body">
      <p class="ch-muted">Reglas con las que se asigna el Estado de Pre-Aprobación al leer un reporte.</p>
      <div class="form-group"><label>Puntaje mínimo para Pre-Aprobado (sin mora)</label>
        <input type="number" name="approve_min_score" class="form-control" min="1" max="999" value="{{th.approve_min_score}}"></div>
      <div class="form-group"><label>Puntaje menor a este valor = Rechazado</label>
        <input type="number" name="reject_max_score" class="form-control" min="0" max="998" value="{{th.reject_max_score}}"></div>
      <div class="form-group"><label>Mora máxima sobre la deuda total (%)</label>
        <input type="number" name="reject_overdue_pct" class="form-control" min="0" max="100" step="1" value="{{pct}}"></div>
      <button class="btn btn-primary" data-action="saveThresholds">Guardar reglas</button>
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
