if (!new URLSearchParams(location.search).has('legacy')) {
    document.title = 'Astral.AI';
    document.documentElement.classList.add('astral-mode');
    const host = document.createElement('div');
    host.id = 'astral-root';
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<link rel="stylesheet" href="/astral/app.css"><div id="astral-app"><div style="height:100vh;background:#18181b;color:#f4f4f5;display:grid;place-items:center;font:18px system-ui">Opening Astral.AI…</div></div>';
    const hidden = document.createElement('style');
    hidden.textContent = 'html.astral-mode body{overflow:hidden!important}html.astral-mode body>:not(#astral-root):not(script){visibility:hidden!important;pointer-events:none!important}#astral-root{position:fixed;inset:0;z-index:2147483000;visibility:visible!important;pointer-events:auto!important}html.astral-mode body>:not(#astral-root){user-select:none}';
    document.head.appendChild(hidden);
    // Chromium registers @font-face at document level, including for a shadow-root UI.
    fetch('/astral/app.css').then(r => r.text()).then(css => {
        const fonts = document.createElement('style');
        fonts.textContent = (css.match(/@font-face\{[^}]+\}/g) || []).join('\n');
        document.head.appendChild(fonts);
    }).catch(() => {});
    import('/astral/app.js').catch(() => { shadow.querySelector('#astral-app').innerHTML = '<div style="padding:48px;background:#18181b;color:#eee;height:100vh;font:18px system-ui">Astral needs its interface build. Run <code>npm run astral:build</code>, then refresh. <a style="color:#d2d2e0" href="/?legacy">Open SillyTavern</a></div>'; });
}
