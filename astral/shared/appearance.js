export const THEMES = {
    forest: { label: 'Forest', background: '#151a17', surface: '#1d261f', raised: '#2b372b', text: '#eeeae1', muted: '#b2b9ab', accent: '#d8b77a', line: '#3d493b', dark: true },
    charcoal: { label: 'Charcoal', background: '#171719', surface: '#222225', raised: '#313135', text: '#f0edf0', muted: '#b9b5bd', accent: '#d5ae83', line: '#46434b', dark: true },
    midnight: { label: 'Midnight', background: '#141a28', surface: '#1d273a', raised: '#2c3b53', text: '#edf1fa', muted: '#b0bdd3', accent: '#a6bee9', line: '#435571', dark: true },
    paper: { label: 'Paper', background: '#f4f1e9', surface: '#fffdf7', raised: '#e9e3d5', text: '#2c2822', muted: '#625f58', accent: '#78582a', line: '#cbc6bc', dark: false },
};
export const DEFAULT_APPEARANCE = { version: 2, theme: 'forest', accent: '', background: '', uiFont: 'DM Sans', dialogueFont: 'DM Sans', uiScale: 100, density: 'comfortable', backgroundMode: 'scene', backgroundImage: '', blur: 2 };
export function normalizeAppearance(input = {}) {
    const a = { ...DEFAULT_APPEARANCE, ...input };
    if (![...Object.keys(THEMES), 'system'].includes(a.theme)) a.theme = 'forest';
    for (const key of ['accent', 'background']) if (!/^#[0-9a-f]{6}$/i.test(a[key])) a[key] = '';
    if (!['DM Sans', 'Outfit', 'Segoe UI'].includes(a.uiFont)) a.uiFont = 'DM Sans';
    if (!['DM Sans', 'Outfit', 'Segoe UI', 'Georgia'].includes(a.dialogueFont)) a.dialogueFont = 'DM Sans';
    a.uiScale = Math.max(75, Math.min(150, Math.round(Number(a.uiScale) || 100)));
    a.blur = Math.max(0, Math.min(20, Number(a.blur) || 0));
    a.density = a.density === 'compact' ? 'compact' : 'comfortable';
    if (!['plain', 'scene', 'custom'].includes(a.backgroundMode)) a.backgroundMode = 'scene';
    if (!/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(a.backgroundImage)) a.backgroundImage = '';
    a.version = 2;
    return Object.fromEntries(Object.keys(DEFAULT_APPEARANCE).map(key => [key, a[key]]));
}

const channels = hex => hex.slice(1).match(/../g).map(v => parseInt(v, 16));
export function luminance(hex) { const rgb = channels(hex).map(x => x / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4); return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722; }
export function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
export function mix(a, b, amount) { const x = channels(a), y = channels(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * amount).toString(16).padStart(2, '0')).join(''); }
function readable(color, surfaces, target = 4.5) {
    const candidates = ['#ffffff', '#000000'];
    const best = candidates.sort((a, b) => Math.min(...surfaces.map(s => contrast(b, s))) - Math.min(...surfaces.map(s => contrast(a, s))))[0];
    for (let i = 0; i <= 100; i++) { const value = mix(color, best, i / 100); if (surfaces.every(s => contrast(value, s) >= target)) return value; }
    return best;
}
export function themeTokens(appearance, prefersDark = true) {
    const a = normalizeAppearance(appearance);
    const preset = THEMES[a.theme === 'system' ? (prefersDark ? 'forest' : 'paper') : a.theme];
    const custom = !!(a.accent || a.background);
    const background = a.background || (a.accent ? mix(preset.dark ? '#161618' : '#f4f4f5', a.accent, preset.dark ? .08 : .06) : preset.background);
    const dark = luminance(background) < .179;
    const baseInk = dark ? '#f6f5f8' : '#202023';
    const tone = amount => { const candidate = mix(background, '#ffffff', amount); return dark && contrast('#ffffff', candidate) < 4.5 ? mix(background, '#000000', amount) : candidate; };
    const surface = custom ? tone(.055) : preset.surface;
    const raised = custom ? tone(.10) : preset.raised;
    const hover = custom ? tone(.14) : mix(raised, baseInk, .045);
    const pressed = custom ? tone(.18) : mix(raised, baseInk, .09);
    const surfaces = [background, surface, raised, hover, pressed];
    const text = readable(custom ? baseInk : preset.text, surfaces);
    const muted = readable(custom ? mix(background, text, .64) : preset.muted, surfaces);
    const accent = a.accent || preset.accent;
    const accentInk = contrast('#000000', accent) >= contrast('#ffffff', accent) ? '#000000' : '#ffffff';
    const line = custom ? mix(background, text, .23) : preset.line;
    return {
        ...preset, dark, background, surface, raised, text, muted, accent, accentInk, line,
        hover, pressed,
        lineStrong: mix(line, text, .25), focus: readable(accent, surfaces, 3),
        accentText: readable(accent, surfaces), disabled: muted,
        danger: readable(dark ? '#f6abae' : '#a12638', surfaces),
        dangerSurface: mix(surface, '#bc344c', .10), dangerLine: mix(line, '#bc344c', .45),
        success: readable(dark ? '#b5d9bc' : '#28653e', surfaces),
        overlay: dark ? '#08080b' : '#24242b', shadow: '#000000',
        effectPrimary: raised, effectSecondary: background, effectAccent: mix(raised, accent, .28),
    };
}
