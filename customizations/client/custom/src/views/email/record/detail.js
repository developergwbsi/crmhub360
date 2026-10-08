define('custom:views/email/record/detail', ['views/email/record/detail', 'custom:lead-hero', 'custom:email-lock'], function (Dep, Hero, Lock) {
    return class extends Dep {
        setup() { super.setup(); Lock.mount(this); }
        afterRender() {
            super.afterRender();
            Hero.mount(this);
            Lock.lock(this);
        }
    };
});
