window.addEventListener('load', () => {
    const update = () => document.documentElement.style.setProperty('--doc-height', `${window.innerHeight}px`);
    window.addEventListener('resize', update);
    update();
});
