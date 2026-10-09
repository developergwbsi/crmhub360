/* Ilustraciones de «sin datos» (mismas que el CRM). */
(function () {
    'use strict';
    var FACE = function (x, y, s) {
        s = s || 1;
        return '<g class="e-face"><circle cx="' + (x - 11 * s) + '" cy="' + y + '" r="' + 4.2 * s + '" class="e-ink"/><circle cx="' + (x + 11 * s) + '" cy="' + y + '" r="' + 4.2 * s + '" class="e-ink"/>' +
            '<path d="M' + (x - 8 * s) + ' ' + (y + 11 * s) + ' Q' + x + ' ' + (y + 20 * s) + ' ' + (x + 8 * s) + ' ' + (y + 11 * s) + '" class="e-mouth"/>' +
            '<circle cx="' + (x - 19 * s) + '" cy="' + (y + 9 * s) + '" r="' + 4 * s + '" class="e-blush"/><circle cx="' + (x + 19 * s) + '" cy="' + (y + 9 * s) + '" r="' + 4 * s + '" class="e-blush"/></g>';
    };
    var STAR = function (x, y, r, d) { return '<path class="e-star" style="animation-delay:' + d + 's" d="M' + x + ' ' + (y - r) + ' Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + ' Q' + x + ' ' + y + ' ' + x + ' ' + (y + r) + ' Q' + x + ' ' + y + ' ' + (x - r) + ' ' + y + ' Q' + x + ' ' + y + ' ' + x + ' ' + (y - r) + 'Z"/>'; };
    var ART = {
        box: '<ellipse class="e-shadow" cx="110" cy="154" rx="62" ry="8"/><g class="e-float"><circle cx="94" cy="76" r="10" class="e-eyew"/><circle cx="126" cy="76" r="10" class="e-eyew"/><circle cx="96" cy="77" r="5" class="e-ink e-look"/><circle cx="128" cy="77" r="5" class="e-ink e-look"/>' +
            '<path class="e-box2" d="M56 88 L42 66 L86 66 L94 88Z"/><path class="e-box2" d="M164 88 L178 66 L134 66 L126 88Z"/><rect class="e-box" x="56" y="86" width="108" height="62" rx="9"/><rect class="e-tape" x="98" y="86" width="24" height="26" rx="3"/>' + FACE(110, 124, .8) + '</g>' + STAR(40, 40, 8, 0) + STAR(184, 52, 6, .6) + STAR(168, 22, 5, 1.1),
        search: '<ellipse class="e-shadow" cx="110" cy="154" rx="56" ry="8"/><g class="e-float"><line class="e-handle" x1="136" y1="108" x2="168" y2="140"/><circle class="e-lens" cx="106" cy="78" r="42"/>' + FACE(106, 72, 1) + '<path class="e-shine" d="M80 52 Q86 44 96 42"/></g>' + STAR(44, 44, 8, .2) + STAR(186, 60, 6, .8),
        chat: '<ellipse class="e-shadow" cx="110" cy="156" rx="58" ry="8"/><g class="e-float"><path class="e-b1" d="M44 40 h104 a20 20 0 0 1 20 20 v22 a20 20 0 0 1 -20 20 h-62 l-26 20 v-20 h-16 a20 20 0 0 1 -20 -20 v-22 a20 20 0 0 1 20 -20z"/><circle class="e-dotw d1" cx="82" cy="71" r="6"/><circle class="e-dotw d2" cx="106" cy="71" r="6"/><circle class="e-dotw d3" cx="130" cy="71" r="6"/>' +
            '<path class="e-b2" d="M112 108 h56 a16 16 0 0 1 16 16 v6 a16 16 0 0 1 -16 16 h-4 v14 l-18 -14 h-34 a16 16 0 0 1 -16 -16 v-6 a16 16 0 0 1 16 -16z" transform="translate(0,-4)"/></g>' + STAR(190, 40, 7, .4) + STAR(34, 112, 6, 1),
        mail: '<ellipse class="e-shadow" cx="110" cy="154" rx="62" ry="8"/><g class="e-float"><rect class="e-env" x="40" y="52" width="140" height="92" rx="14"/><path class="e-flap" d="M44 62 L110 110 L176 62"/>' + FACE(110, 124, .75) + '<path class="e-heart" d="M110 44 c-8 -12 -26 -4 -18 10 l18 16 l18 -16 c8 -14 -10 -22 -18 -10z" transform="translate(0,-18) scale(1)"/></g>' + STAR(36, 46, 7, .3) + STAR(188, 70, 6, .9),
        chart: '<ellipse class="e-shadow" cx="110" cy="154" rx="70" ry="8"/><g class="e-float"><rect class="e-bar" x="52" y="112" width="30" height="36" rx="8"/><rect class="e-bar" x="94" y="86" width="30" height="62" rx="8"/><rect class="e-bar e-bar3" x="136" y="56" width="30" height="92" rx="8"/>' + FACE(151, 86, .55) +
            '<path class="e-sprout" d="M67 112 q0 -14 -10 -18 M67 112 q0 -12 10 -16"/><path class="e-leaf" d="M57 94 q-10 -2 -12 -10 q10 0 12 10z M77 96 q10 -2 12 -10 q-10 0 -12 10z"/></g><path class="e-arrow" d="M44 70 L96 40 L88 40 M96 40 L96 48"/>' + STAR(184, 40, 7, .5),
        doc: '<ellipse class="e-shadow" cx="110" cy="156" rx="52" ry="8"/><g class="e-float"><path class="e-paper" d="M68 28 h58 l30 30 v84 a10 10 0 0 1 -10 10 h-78 a10 10 0 0 1 -10 -10 v-104 a10 10 0 0 1 10 -10z"/><path class="e-fold" d="M126 28 v22 a8 8 0 0 0 8 8 h22z"/><line class="e-ln" x1="80" y1="74" x2="112" y2="74"/>' + FACE(112, 100, .85) + '<line class="e-ln" x1="84" y1="132" x2="140" y2="132"/></g>' + STAR(40, 60, 7, .2) + STAR(180, 100, 6, .8),
        calendar: '<ellipse class="e-shadow" cx="110" cy="156" rx="62" ry="8"/><g class="e-float"><rect class="e-cal" x="48" y="42" width="124" height="104" rx="14"/><path class="e-calh" d="M48 56 a14 14 0 0 1 14 -14 h96 a14 14 0 0 1 14 14 v14 h-124z"/><rect class="e-ring" x="76" y="32" width="8" height="20" rx="4"/><rect class="e-ring" x="136" y="32" width="8" height="20" rx="4"/>' + FACE(110, 106, .85) + '<text class="e-z" x="150" y="96">z</text></g>' + STAR(34, 66, 6, .5) + STAR(190, 56, 7, 1),
        robot: '<ellipse class="e-shadow" cx="110" cy="156" rx="52" ry="8"/><g class="e-float"><line class="e-ant" x1="110" y1="38" x2="110" y2="52"/><circle class="e-antb" cx="110" cy="34" r="6"/><rect class="e-head" x="68" y="50" width="84" height="62" rx="18"/>' + FACE(110, 78, 1) + '<rect class="e-body" x="80" y="116" width="60" height="32" rx="10"/><circle class="e-eyew" cx="98" cy="132" r="4"/><circle class="e-eyew" cx="122" cy="132" r="4"/><g class="e-wave"><line class="e-arm" x1="140" y1="124" x2="166" y2="104"/></g><line class="e-arm" x1="80" y1="124" x2="56" y2="136"/></g>' + STAR(40, 50, 7, .1) + STAR(186, 50, 6, .7)
    };
    var SCOPE = {
        Lead: ['search', 'Aún no hay leads', 'Cuando llegue el primero aparecerá aquí.'], Account: ['box', 'Aún no hay cuentas', 'Las cuentas aparecerán aquí cuando conviertas tus primeros leads.'],
        Contact: ['box', 'Aún no hay contactos', 'Tus contactos aparecerán aquí.'], Opportunity: ['chart', 'Aún no hay oportunidades', 'Cada venta en camino se verá aquí.'],
        Task: ['calendar', 'Sin tareas por ahora', 'Disfruta la calma: cuando haya tareas las verás aquí.'], Meeting: ['calendar', 'Sin reuniones por ahora', 'Tus reuniones aparecerán aquí.'],
        Call: ['chat', 'Aún no hay llamadas', 'El historial de llamadas se llenará aquí.'], Email: ['mail', 'Tu bandeja está vacía', 'Cuando llegue o envíes un correo lo verás aquí.'],
        Campaign: ['chart', 'Aún no hay campañas', 'Crea la primera y mide sus resultados aquí.'], Document: ['doc', 'Aún no hay documentos', 'Los documentos aparecerán aquí.']
    };
    var COMPACT_BY_NAME = [[/history|activit|task|meeting|call/i, 'calendar'], [/email|mail/i, 'mail'], [/opportun|campaign|stat/i, 'chart'], [/note|stream|messag/i, 'chat'], [/doc|file|attach/i, 'doc']];
    function emptyHtml(o) {
        o = o || {};
        var kind = ART[o.kind] ? o.kind : 'box';
        var title = o.title || 'Todo muy tranquilo por aquí';
        var text = o.text === undefined ? 'Todavía no hay datos, pero pronto entrarán.' : o.text;
        var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]; }); };
        return '<div class="ch-empty' + (o.compact ? ' ch-empty-compact' : ' ch-empty-full') + '" role="status"><svg class="ch-empty-art" viewBox="0 0 220 170" aria-hidden="true" focusable="false">' + ART[kind] + '</svg>' +
            '<div class="ch-empty-title">' + esc(title) + '</div>' + (text ? '<div class="ch-empty-text">' + (o.html ? text : esc(text)) + '</div>' : '') + '</div>';
    }
    window.ChEmpty = {html: emptyHtml};
})();
