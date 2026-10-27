const fs = require('node:fs');
const path = require('node:path');

function fitBounds(saved, area) {
    saved = Object.fromEntries(Object.entries(saved || {}).filter(([key, value]) => ['x', 'y', 'width', 'height'].includes(key) && Number.isFinite(value) && (!['width', 'height'].includes(key) || value > 0)));
    const width = Math.max(Math.min(600, area.width), Math.min(saved?.width || 1280, area.width - Math.min(32, area.width / 10)));
    const height = Math.max(Math.min(440, area.height), Math.min(saved?.height || 860, area.height - Math.min(32, area.height / 10)));
    const x = Math.max(area.x, Math.min(saved?.x ?? area.x + (area.width - width) / 2, area.x + area.width - width));
    const y = Math.max(area.y, Math.min(saved?.y ?? area.y + (area.height - height) / 2, area.y + area.height - height));
    return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}
function windowState(userData, screen) {
    const file = path.join(userData, 'window.json');
    let saved;
    try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* Use fitted defaults when state is missing or invalid. */ }
    if (!saved || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(saved[key])) || saved.width <= 0 || saved.height <= 0) saved = undefined;
    const display = saved ? screen.getDisplayMatching(saved) : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    return {
        bounds: fitBounds(saved, display.workArea),
        maximized: !!saved?.maximized,
        bind(window) {
            let timer;
            const save = () => {
                clearTimeout(timer);
                timer = setTimeout(() => {
                    if (!window.isDestroyed() && !window.isMinimized()) {
                        fs.mkdirSync(userData, { recursive: true });
                        fs.writeFileSync(file, JSON.stringify({ ...window.getNormalBounds(), maximized: window.isMaximized() }));
                    }
                }, 300);
            };
            const fit = () => {
                if (window.isDestroyed() || window.isMaximized()) return;
                const area = screen.getDisplayMatching(window.getBounds()).workArea;
                window.setMinimumSize(Math.min(600, area.width), Math.min(440, area.height));
                window.setBounds(fitBounds(window.getBounds(), area));
            };
            window.on('resize', save);
            window.on('move', save);
            screen.on('display-metrics-changed', fit);
            screen.on('display-removed', fit);
            window.on('closed', () => {
                clearTimeout(timer);
                screen.removeListener('display-metrics-changed', fit);
                screen.removeListener('display-removed', fit);
            });
        },
    };
}
module.exports = { fitBounds, windowState };
