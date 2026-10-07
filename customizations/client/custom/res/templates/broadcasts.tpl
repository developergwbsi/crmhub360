<div class="page-header"><h3>Mensajes masivos</h3>
  {{#unless wizard}}<div class="pull-right"><button class="btn btn-primary" data-action="bcNew"><span class="fas fa-plus"></span> Nueva campaña</button></div>{{/unless}}</div>
{{#if loading}}<div class="ch-muted">Cargando…</div>{{/if}}
{{#if error}}<div class="ch-warn">No se pudieron cargar las campañas.</div>{{/if}}
{{#unless loading}}{{#unless error}}

{{#if wizard}}
<div class="ch-grid">
  <div class="panel panel-default ch-span-2">
    <div class="panel-heading"><h4 class="panel-title">1 · Canal</h4></div>
    <div class="panel-body">
      {{#unless anyReady}}<div class="ch-warn">No hay ningún canal configurado. Conecta WhatsApp, SMS o Telegram en <b>Integraciones</b> primero.</div>{{/unless}}
      <div class="ch-radios">{{#each channels}}<label class="ch-radio-card {{#unless ready}}ch-off{{/unless}}"><input type="radio" name="bc_channel" value="{{key}}" {{#unless ready}}disabled{{/unless}}> <b>{{label}}</b>
        <span class="ch-muted ch-small">{{#if ready}}hasta {{max}} por minuto{{else}}sin configurar{{/if}}</span></label>{{/each}}</div>
      <div class="ch-help"><b>Antes de enviar:</b> con <b>WhatsApp oficial (Meta)</b> los mensajes que inicia la empresa fuera de las 24 h requieren <b>plantillas aprobadas</b>; con una instancia no oficial (<b>Evolution</b>) el envío masivo puede hacer que bloqueen tu número, usa ritmo bajo. Envía solo a quienes <b>autorizaron</b> ser contactados (Ley 1581): quien responda <b>BAJA</b> queda excluido automáticamente.</div>
    </div>
  </div>

  <div class="panel panel-default ch-span-2">
    <div class="panel-heading"><h4 class="panel-title">2 · Audiencia</h4></div>
    <div class="panel-body">
      <p class="ch-muted">Solo se incluye a quienes tienen el dato de contacto del canal y no pidieron «no contactar». Verás los leads que tus permisos te dejan ver.</p>
      <div class="ch-cols2">
        <div><label>Estado</label><div class="ch-checks">{{#each statuses}}<label class="ch-switch"><input type="checkbox" name="f_status" value="{{value}}"> {{label}}</label>{{/each}}</div></div>
        <div><label>Resultado del filtro</label><div class="ch-checks">{{#each quals}}<label class="ch-switch"><input type="checkbox" name="f_qual" value="{{value}}"> {{label}}</label>{{/each}}</div>
          <label style="margin-top:10px">Origen</label><div class="ch-checks">{{#each sources}}<label class="ch-switch"><input type="checkbox" name="f_source" value="{{value}}"> {{label}}</label>{{/each}}</div></div>
        <div><label>Canal preferido</label><div class="ch-checks">{{#each prefs}}<label class="ch-switch"><input type="checkbox" name="f_pref" value="{{value}}"> {{label}}</label>{{/each}}</div></div>
        <div>
          <label>Creados en los últimos (días)</label><input type="number" name="f_days" class="form-control" min="1" placeholder="cualquier fecha">
          <label style="margin-top:10px">Servicio sugerido contiene</label><input name="f_service" class="form-control" placeholder="p. ej. deudas">
          <label style="margin-top:10px">Asesor</label><select name="f_assigned" class="form-control"><option value="">Todos</option><option value="none">Sin asesor</option></select>
        </div>
      </div>
      <div class="ch-row"><button class="btn btn-default" data-action="bcAudience"><span class="fas fa-users"></span> Calcular audiencia</button><span data-role="audience" class="ch-small"></span></div>
    </div>
  </div>

  <div class="panel panel-default ch-span-2">
    <div class="panel-heading"><h4 class="panel-title">3 · Mensaje y envío</h4></div>
    <div class="panel-body">
      <div class="ch-cols2">
        <div>
          <div class="form-group"><label>Nombre de la campaña</label><input name="bc_name" class="form-control" placeholder="Promoción de octubre"></div>
          <div class="form-group"><label>Mensaje</label><textarea name="bc_text" class="form-control" rows="6" maxlength="1500" placeholder="Hola {primer_nombre}, soy {asesor} de {empresa}…"></textarea>
            <div class="ch-row" style="margin-top:6px"><span class="ch-small ch-muted">Insertar:</span>
              {{#each vars}}<button type="button" class="btn btn-default btn-sm" data-action="bcVar" data-v="{{v}}">{{v}}</button>{{/each}}<span class="ch-small ch-muted" data-role="count" style="margin-left:auto"></span></div></div>
          <label class="ch-switch"><input type="checkbox" name="bc_footer" checked> Agregar «Responde BAJA para no recibir más» (recomendado)</label>
        </div>
        <div>
          <label>Así lo verá el cliente</label><pre class="ch-pre" data-role="preview">Aquí verás cómo queda el mensaje.</pre>
          <div class="ch-cols2">
            <div class="form-group"><label>Mensajes por minuto</label><input type="number" name="bc_rate" class="form-control" value="20" min="1"></div>
            <div class="form-group"><label>Empezar</label><select name="bc_when" class="form-control"><option value="0">Ahora</option><option value="30">En 30 minutos</option><option value="60">En 1 hora</option><option value="240">En 4 horas</option><option value="720">En 12 horas</option><option value="1440">Mañana (24 h)</option></select></div>
          </div>
        </div>
      </div>
      <div class="ch-row ch-services-actions"><button class="btn btn-default" data-action="bcCancelWizard">Volver</button><button class="btn btn-primary" data-action="bcSend"><span class="fas fa-paper-plane"></span> Crear y enviar campaña</button></div>
    </div>
  </div>
</div>
{{else}}
<div class="panel panel-default">
  <div class="panel-heading"><h4 class="panel-title">Campañas</h4></div>
  <div class="panel-body">
    <table class="table table-bordered ch-table"><thead><tr><th>Campaña</th><th>Canal</th><th>Estado</th><th>Avance</th><th></th></tr></thead><tbody class="ch-bc-list"></tbody></table>
  </div>
</div>
{{/if}}
{{/unless}}{{/unless}}
