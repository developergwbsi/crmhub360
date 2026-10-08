define('custom:views/email/record/detail-quick', ['views/email/record/detail-quick', 'custom:email-lock'], function (Dep, Lock) {
    return class extends Dep {
        setup() { super.setup(); Lock.mount(this); }
        afterRender() { super.afterRender(); Lock.lock(this); }
    };
});
