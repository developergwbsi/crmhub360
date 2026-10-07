<div class="ch-panel">
  <div class="ch-panel-top">
    <div class="ch-seg">
      {{#each periods}}<button class="{{#if active}}active{{/if}}" data-action="period" data-d="{{d}}">{{label}}</button>{{/each}}
    </div>
    <span class="ch-muted ch-small">Los datos respetan tu alcance: {{#if multi}}equipo / empresa{{else}}tus leads{{/if}}.</span>
  </div>
  {{#if loading}}<div class="ch-muted ch-pad">Cargando indicadores…</div>{{/if}}
  {{#if error}}<div class="ch-warn">No se pudieron cargar los indicadores.</div>{{/if}}
  {{#unless loading}}{{#unless error}}
  <div class="ch-kpis">
    {{#each kpis}}
    <div class="ch-kpi ch-tone-{{tone}}">
      <span class="ch-kpi-ic"><span class="{{icon}}"></span></span>
      <div class="ch-kpi-body"><div class="ch-kpi-label">{{label}}</div><div class="ch-kpi-value">{{value}}</div><div class="ch-kpi-sub">{{sub}}</div></div>
    </div>
    {{/each}}
  </div>

  <div class="ch-cols">
    <div class="ch-box"><h5>Embudo comercial</h5>
      {{#each estado}}<div class="ch-bar"><span class="ch-bar-name">{{name}}</span><span class="ch-bar-track"><i style="width:{{w}}%;background:{{color}}"></i></span><b>{{value}}</b></div>{{/each}}
    </div>
    <div class="ch-box"><h5>Servicio sugerido (calificados)</h5>
      {{#if hasServicio}}{{#each servicio}}<div class="ch-bar"><span class="ch-bar-name">{{name}}</span><span class="ch-bar-track"><i style="width:{{w}}%;background:{{color}}"></i></span><b>{{value}}</b></div>{{/each}}
      {{else}}<div class="ch-muted ch-small">Aún no hay leads calificados en el periodo.</div>{{/if}}
    </div>
  </div>

  <div class="ch-cols">
    <div class="ch-box"><h5>Leads captados · {{trendTotal}} en total</h5>
      <div class="ch-spark">{{#each tendencia}}<span style="height:{{h}}%" title="{{day}}: {{value}}"></span>{{/each}}</div>
      <div class="ch-spark-axis ch-muted ch-small">{{trendNote}}</div>
    </div>
    <div class="ch-box"><h5>Origen de los leads</h5>
      {{#each origen}}<div class="ch-bar"><span class="ch-bar-name">{{name}}</span><span class="ch-bar-track"><i style="width:{{w}}%;background:{{color}}"></i></span><b>{{value}}</b></div>{{/each}}
    </div>
  </div>

  <div class="ch-cols">
    <div class="ch-box"><h5>{{#if multi}}Rendimiento por asesor{{else}}Mi rendimiento{{/if}}</h5>
      {{#if hasAsesores}}
      <table class="table ch-table ch-rank"><thead><tr><th>Asesor</th><th>Leads</th><th>Califican</th><th>Cierres</th></tr></thead>
        <tbody>{{#each asesores}}<tr><td>{{name}}</td><td>{{leads}}</td><td>{{califican}}</td><td><b>{{cierres}}</b></td></tr>{{/each}}</tbody></table>
      {{else}}<div class="ch-muted ch-small">Sin datos en el periodo.</div>{{/if}}
    </div>
    <div class="ch-box"><h5>Campañas con más leads</h5>
      {{#if hasCampanas}}{{#each campanas}}<div class="ch-bar"><span class="ch-bar-name">{{name}}</span><span class="ch-bar-track"><i style="width:{{w}}%;background:{{color}}"></i></span><b>{{value}}</b></div>{{/each}}
      {{else}}<div class="ch-muted ch-small">Ningún lead trae campaña en el periodo.</div>{{/if}}
    </div>
  </div>
  {{/unless}}{{/unless}}
</div>
