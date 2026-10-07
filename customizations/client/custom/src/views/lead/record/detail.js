define('custom:views/lead/record/detail', ['views/record/detail', 'custom:lead-hero'], function (Dep, Hero) {
    return class extends Dep {
        afterRender() {
            super.afterRender();
            Hero.mount(this);
        }
    };
});
