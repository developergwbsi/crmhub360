<div class="page-header"><h3>Estados del pipeline</h3></div>
{{#if loading}}<div class="ch-muted">Cargando…</div>{{/if}}
{{#if error}}<div class="ch-warn">No se pudo cargar la configuración.</div>{{/if}}
{{#unless loading}}{{#unless error}}
<div class="ch-grid">
  <div class="panel panel-default">
    <div class="panel-heading"><h4 class="panel-title">Estados de los leads (columnas del Kanban)</h4></div>
    <div class="panel-body">
      <ol class="ch-stages">
        {{#each stages}}<li><span class="label label-{{tone}}">{{label}}</span>
          {{#if hidden}}<span class="ch-muted ch-small">no se muestra en el Kanban</span>{{/if}}
          {{#if closed}}<span class="ch-muted ch-small">cuenta como cerrado</span>{{/if}}</li>{{/each}}
      </ol>
      <a class="btn btn-primary" href="#Admin/fieldManager/scope=Lead&field=status"><span class="fas fa-pen"></span> Crear, renombrar u ordenar estados</a>
      <div class="ch-tip" style="margin-top:12px">En esa pantalla agregas estados, los renombras, cambias su orden (el orden de la lista es el orden de las columnas) y su color.
        <b>Ojo:</b> si renombras o eliminas un estado, los leads que lo tienen conservan el valor anterior; muévelos antes con
        <i>Acciones → Actualización masiva</i>.</div>
    </div>
  </div>

  <div class="panel panel-default">
    <div class="panel-heading"><h4 class="panel-title">Qué estados usa el sistema</h4></div>
    <div class="panel-body">
      <p class="ch-muted">El sistema mueve los leads automáticamente en estos puntos. Elige cuál de tus estados corresponde a cada uno.</p>
      <div class="form-group"><label>Estado de un lead nuevo (al llegar)</label>
        <select name="new" class="form-control">{{#each optNew}}<option value="{{value}}" {{#if selected}}selected{{/if}}>{{label}}</option>{{/each}}</select></div>
      <div class="form-group"><label>Estado «en calificación»</label>
        <select name="review" class="form-control">{{#each optReview}}<option value="{{value}}" {{#if selected}}selected{{/if}}>{{label}}</option>{{/each}}</select></div>
      <div class="form-group"><label>Estado al calificar el lead (cuando el filtro dice «Califica»)</label>
        <select name="qualified" class="form-control">{{#each optQualified}}<option value="{{value}}" {{#if selected}}selected{{/if}}>{{label}}</option>{{/each}}</select></div>
      <div class="form-group"><label>Estados que ya no cuentan como «lead abierto»</label>
        <div class="ch-checks">{{#each closedList}}<label class="ch-switch"><input type="checkbox" name="closed" value="{{value}}" {{#if checked}}checked{{/if}}> {{label}}</label>{{/each}}</div>
        <div class="ch-muted ch-small">Se usa para el balanceo de asignación y el panel gerencial. El primero de la lista se cuenta como «cierre exitoso».</div></div>
      <button class="btn btn-primary" data-action="save">Guardar</button>
    </div>
  </div>
</div>
{{/unless}}{{/unless}}
