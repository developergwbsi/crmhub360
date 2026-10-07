define('custom:views/lead/record/kanban', ['views/record/kanban'], function (Dep) {
    return class extends Dep {
        itemViewName = 'custom:views/lead/kanban-item'
    };
});
