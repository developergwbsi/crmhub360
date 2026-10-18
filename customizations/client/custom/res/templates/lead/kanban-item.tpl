<div class="panel panel-default ch-card {{#if isStarred}}starred{{/if}}">
    <div class="panel-body">
        {{#each layoutDataList}}
            {{#if isFirst}}
            <div class="ch-card-head">
                <span class="ch-avatar" style="background: {{../avatarColor}}">
                    <span class="ch-initials">{{../initials}}</span>
                    {{#if ../avatarUrl}}<img src="{{../avatarUrl}}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">{{/if}}
                </span>
                <div class="field ch-card-name" data-name="{{name}}">{{{var key ../this}}}</div>
                <div class="ch-card-acts"><button type="button" data-ch-act="peek" title="Ver en el panel lateral"><span class="far fa-eye"></span></button><button type="button" data-ch-act="full" title="Abrir la ficha completa"><span class="fas fa-up-right-and-down-left-from-center"></span></button></div>
                {{#unless ../rowActionsDisabled}}<div class="item-menu-container fix-position">{{{../itemMenu}}}</div>{{/unless}}
            </div>
            {{else}}
            <div class="field ch-f ch-f-{{name}}" data-name="{{name}}">{{{var key ../this}}}</div>
            {{/if}}
        {{/each}}
    </div>
</div>
