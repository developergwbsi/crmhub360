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
                {{#unless ../rowActionsDisabled}}<div class="item-menu-container fix-position">{{{../itemMenu}}}</div>{{/unless}}
            </div>
            {{else}}
            <div class="field ch-f ch-f-{{name}}" data-name="{{name}}">{{{var key ../this}}}</div>
            {{/if}}
        {{/each}}
    </div>
</div>
