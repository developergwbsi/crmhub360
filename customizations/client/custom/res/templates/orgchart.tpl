<div class="page-header"><h3>Organigrama</h3></div>
{{#if loading}}<div class="ch-muted">Cargando…</div>{{/if}}
{{#if error}}<div class="ch-warn">No se pudo cargar el organigrama.</div>{{/if}}
{{#unless loading}}{{#unless error}}
{{#if canManage}}
<div class="ch-org-actions">
  <a class="btn btn-primary" href="#Team/create"><span class="fas fa-users"></span> Crear equipo</a>
  <a class="btn btn-default" href="#User/create"><span class="fas fa-user-plus"></span> Crear usuario</a>
  <a class="btn btn-default" href="#Campaign/create"><span class="fas fa-bullhorn"></span> Crear campaña</a>
  <a class="btn btn-default" href="#Role"><span class="fas fa-id-badge"></span> Roles y permisos</a>
</div>
{{/if}}
<div class="ch-org">
  {{#if managers.length}}
  <div class="ch-org-level ch-org-top">
    {{#each managers}}<div class="ch-org-mgr">
      <div class="ch-org-sec">Dirección</div>
      <div class="ch-person"><span class="ch-avatar" style="background:{{color}}">{{initials}}</span>
        <div><a href="#User/view/{{id}}">{{name}}</a><small>{{rolesText}}</small></div></div>
    </div>{{/each}}
  </div>
  {{/if}}
  <div class="ch-org-teams">
    {{#each teams}}
    <div class="ch-org-team">
      <div class="ch-org-team-head">
        <b><a href="#Team/view/{{id}}">{{name}}</a></b>
        <div class="ch-muted ch-small">{{count}} personas · {{openLeads}} leads abiertos</div>
        {{#if campaigns.length}}<div class="ch-org-camps">{{#each campaigns}}<span class="ch-pill"><span class="fas fa-bullhorn"></span> {{this}}</span>{{/each}}</div>{{/if}}
      </div>
      <div class="ch-org-sec">Director de equipo</div>
      {{#each directors}}<div class="ch-person"><span class="ch-avatar" style="background:{{color}}">{{initials}}</span>
        <div><a href="#User/view/{{id}}">{{name}}</a><small>{{openLeads}} abiertos</small></div></div>{{else}}<div class="ch-person ch-muted ch-small">Sin director asignado</div>{{/each}}
      <div class="ch-org-sec">Asesores</div>
      {{#each members}}<div class="ch-person"><span class="ch-avatar" style="background:{{color}}">{{initials}}</span>
        <div><a href="#User/view/{{id}}">{{name}}</a><small>{{openLeads}} abiertos {{#unless receivesLeads}}<span class="ch-pill off">sin asignación auto.</span>{{/unless}}</small></div></div>
      {{else}}<div class="ch-person ch-muted ch-small">Sin asesores</div>{{/each}}
    </div>
    {{else}}
    <div class="ch-muted">Aún no hay equipos.</div>
    {{/each}}
  </div>
  {{#if unassigned.length}}
  <div class="panel panel-default ch-org-help"><div class="panel-heading"><h4 class="panel-title">Sin equipo</h4></div>
    <div class="panel-body">{{#each unassigned}}<span class="ch-pill">{{name}}</span> {{/each}}
    <div class="ch-small ch-muted">Edita cada usuario y asígnale un equipo para que aparezca en el organigrama y reciba leads.</div></div></div>
  {{/if}}
</div>

<div class="panel panel-default ch-org-help">
  <div class="panel-heading"><h4 class="panel-title">Cómo se compone la organización</h4></div>
  <div class="panel-body"><ul>
    <li><b>Usuario:</b> cada persona con su acceso. Tiene un <b>rol</b> (qué puede hacer) y uno o más <b>equipos</b> (con quién trabaja).</li>
    <li><b>Rol:</b> <i>Comercial</i> ve solo sus leads · <i>Director de Equipo</i> ve y reasigna los de su equipo · <i>Gerente General</i> ve todo.</li>
    <li><b>Equipo:</b> es el grupo de trabajo. El director de equipo lo es por su rol; los asesores son quienes tienen rol Comercial en ese equipo.</li>
    <li><b>Campaña:</b> se liga a uno o varios equipos. Los leads de esa campaña se reparten entre los asesores habilitados de esos equipos.</li>
    <li><b>Organigrama:</b> se arma solo con esa información: Dirección → Equipos → Director y asesores.</li>
  </ul></div>
</div>
{{/unless}}{{/unless}}
