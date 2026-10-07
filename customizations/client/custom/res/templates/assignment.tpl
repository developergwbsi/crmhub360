<div class="page-header"><h3>Asignación de leads</h3></div>
{{#if loading}}<div class="ch-muted">Cargando…</div>{{/if}}
{{#if error}}<div class="ch-warn">No se pudo cargar la configuración.</div>{{/if}}
{{#unless loading}}{{#unless error}}
<div class="ch-grid">
  <div class="panel panel-default">
    <div class="panel-heading"><h4 class="panel-title">Cómo se reparten los leads nuevos</h4></div>
    <div class="panel-body">
      <p class="ch-muted">Un lead nuevo sin asesor se asigna solo. Primero se busca en los <b>equipos de su campaña</b>; si no tiene campaña
        (o nadie de esos equipos está habilitado) se usa <b>todo el grupo habilitado</b>.</p>
      <div class="ch-radio"><label><input type="radio" name="method" value="balanced" {{#if balanced}}checked{{/if}}>
        <b>Balanceado</b> <span class="ch-muted">— recibe quien tenga menos leads abiertos</span></label></div>
      <div class="ch-radio"><label><input type="radio" name="method" value="roundrobin" {{#if roundrobin}}checked{{/if}}>
        <b>Rotación</b> <span class="ch-muted">— recibe quien lleve más tiempo sin recibir un lead</span></label></div>
      <div class="form-group" style="margin-top:12px">
        <label>Máximo de leads abiertos por asesor</label>
        <input type="number" name="cap" class="form-control" min="0" value="{{cap}}" style="max-width:160px">
        <div class="ch-muted ch-small">0 = sin tope. Quien llegue al tope deja de recibir; si todos lo alcanzan, el lead queda sin asesor.</div>
      </div>
      <button class="btn btn-primary" data-action="saveMethod">Guardar</button>
    </div>
  </div>

  <div class="panel panel-default">
    <div class="panel-heading"><h4 class="panel-title">Campañas activas</h4></div>
    <div class="panel-body">
      <ul class="ch-camps">
        {{#each campaigns}}<li><b>{{name}}</b> — equipos: {{#if hasTeams}}{{teamsText}}{{else}}<span class="text-danger">ninguno (usa el grupo general)</span>{{/if}} · habilitados: {{eligible}}</li>
        {{else}}<li class="ch-muted">No hay campañas activas. Los leads se reparten entre todos los habilitados.</li>{{/each}}
      </ul>
      <div class="ch-small ch-muted">Para ligar una campaña a un grupo, abre la campaña y elige sus <b>Equipos</b>.
        <a href="#Campaign">Ir a campañas</a></div>
    </div>
  </div>

  <div class="panel panel-default ch-span-2">
    <div class="panel-heading"><h4 class="panel-title">Quién recibe leads</h4></div>
    <div class="panel-body">
      <table class="table table-bordered ch-table">
        <thead><tr><th>Usuario</th><th>Equipos</th><th>Leads abiertos</th><th>Asignación automática</th></tr></thead>
        <tbody>
        {{#each users}}<tr>
          <td><b>{{name}}</b><div class="ch-muted ch-small">{{userName}}</div></td>
          <td>{{#if hasTeams}}{{#each teams}}<span class="ch-pill">{{this}}</span> {{/each}}{{else}}<span class="ch-muted">Sin equipo</span>{{/if}}</td>
          <td>{{openLeads}}</td>
          <td><label class="ch-switch"><input type="checkbox" data-action="toggleReceives" data-id="{{id}}" {{#if receivesLeads}}checked{{/if}}> Recibe leads</label></td>
        </tr>{{/each}}
        </tbody>
      </table>
      <div class="ch-small ch-muted">Habilitados en total: <b>{{eligibleTotal}}</b>
        {{#if none}} — <span class="text-danger">activa al menos un usuario para que los leads se asignen solos</span>{{/if}}</div>
      <div class="ch-small ch-muted">Un director o gerente puede reasignar leads y clientes cuando quiera con el botón <b>Reasignar</b>.</div>
    </div>
  </div>
</div>
{{/unless}}{{/unless}}
