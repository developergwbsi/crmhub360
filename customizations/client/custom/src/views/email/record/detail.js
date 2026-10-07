define('custom:views/email/record/detail', ['views/email/record/detail', 'custom:lead-hero'], function (Dep, Hero) {
    return class extends Dep {
        afterRender() {
            super.afterRender();
            Hero.mount(this);
        }
    };
});
