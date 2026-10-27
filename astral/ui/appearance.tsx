import React, { useEffect, useRef, useState } from 'react';
import { Download, Upload, RotateCcw } from 'lucide-react';
import { THEMES, DEFAULT_APPEARANCE, normalizeAppearance, themeTokens } from '../shared/appearance';
import { downloadBlob, readFile } from './api';
import { Modal , FileButton } from './components';
import type { Appearance, Character, ThemeTokens } from './types';

export function appearanceStyle(a: Appearance, readingSize: number, dim: number, dark: boolean): React.CSSProperties {
    const t: ThemeTokens = themeTokens(a, dark);
    return { '--bg': t.background, '--surface': t.surface, '--raised': t.raised, '--ink': t.text, '--muted': t.muted, '--subtle': t.muted, '--accent': t.accent, '--accent-ink': t.accentInk, '--line': t.line, '--line-strong': t.lineStrong, '--hover': t.hover, '--pressed': t.pressed, '--focus': t.focus, '--accent-text': t.accentText, '--disabled': t.disabled, '--danger': t.danger, '--danger-surface': t.dangerSurface, '--danger-line': t.dangerLine, '--success': t.success, '--overlay': t.overlay, '--shadow': t.shadow, '--ui-font': `${a.uiFont}, sans-serif`, '--dialogue-font': `${a.dialogueFont}, ${a.dialogueFont === 'Georgia' ? 'serif' : 'sans-serif'}`, '--ui-scale': String(a.uiScale / 100), '--reading-size': `${readingSize * a.uiScale / 100}px`, '--scene-dim': String(dim / 100), '--scene-blur': `${a.blur}px`, '--custom-scene': a.backgroundImage ? `url("${a.backgroundImage}")` : 'none', colorScheme: t.dark ? 'dark' : 'light' } as React.CSSProperties;
}
export function SceneBackground({ character }: { character: Character }) {
    const scenes: Record<string, string> = { hina: 'studio', rei: 'library', sora: 'hangar', aiko: 'workshop', haru: 'cafe', ren: 'music-room', akira: 'clinic', kai: 'outpost' };
    return <div className="scene-background" aria-hidden="true" style={{ backgroundImage: scenes[character.id] ? `url('/astral/backgrounds/${scenes[character.id]}.png')` : undefined }} />;
}
export function AppearanceControls({ value, preview, save }: { value: Appearance; preview: (value: Appearance) => void; save: (value: Appearance) => Promise<unknown> }) {
    const a = normalizeAppearance(value) as Appearance;
    const [error, setError] = useState('');
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pending = useRef<Appearance | null>(null);
    const saveRef = useRef(save); saveRef.current = save;
    const persist = (next: Appearance) => {
        preview(next); pending.current = next;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => { const p = pending.current; pending.current = null; if (p) void saveRef.current(p).catch(e => setError(e.message)); }, 350);
    };
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); if (pending.current) void saveRef.current(pending.current).catch(() => {}); }, []);
    const edit = (patch: Partial<Appearance>) => persist(normalizeAppearance({ ...a, ...patch }) as Appearance);
    const colors = themeTokens(a, matchMedia('(prefers-color-scheme: dark)').matches);
    return <div className="settings-section appearance-controls"><h2>Theme & layout</h2>
        <label>Theme<select value={a.theme} onChange={e => edit({ theme: e.target.value, accent: '', background: '' })}><option value="system">Follow Windows</option>{Object.entries(THEMES).map(([id, theme]) => <option key={id} value={id}>{theme.label}</option>)}</select></label>
        <div className="theme-swatches">{Object.entries(THEMES).map(([id, theme]) => <button type="button" key={id} aria-label={`${theme.label} theme`} aria-pressed={a.theme === id} onClick={() => edit({ theme: id, accent: '', background: '' })} style={{ background: theme.background, color: theme.text, borderColor: theme.accent }}><span style={{ background: theme.accent }} />{theme.label}</button>)}</div>
        <p>Pick an accent color to match the rest of the interface. You can also choose an exact background color.</p><div className="two-fields"><label>Accent color<input aria-label="Accent color" type="color" value={a.accent || colors.accent} onChange={e => edit({ accent: e.target.value })} /></label><label>App background color<input aria-label="App background color" type="color" value={a.background || colors.background} onChange={e => edit({ background: e.target.value })} /></label></div>
        <div className="two-fields"><label>Interface font<select value={a.uiFont} onChange={e => edit({ uiFont: e.target.value })}>{['DM Sans', 'Outfit', 'Segoe UI'].map(font => <option key={font}>{font}</option>)}</select></label><label>Dialogue font<select value={a.dialogueFont} onChange={e => edit({ dialogueFont: e.target.value })}>{['DM Sans', 'Outfit', 'Segoe UI', 'Georgia'].map(font => <option key={font}>{font}</option>)}</select></label></div>
        <div className="two-fields"><label>Interface size · {a.uiScale}%<input type="range" min={75} max={150} step={5} value={a.uiScale} onChange={e => edit({ uiScale: Number(e.target.value) })} /></label>
        <label>Density<select value={a.density} onChange={e => edit({ density: e.target.value })}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label></div>
        <h3>Scene backgrounds</h3><p>These settings change the scenery behind your character.</p>
        <div className="two-fields"><label>Background style<select value={a.backgroundMode} onChange={e => edit({ backgroundMode: e.target.value })}><option value="scene">Simple character scenes</option><option value="plain">Plain</option><option value="custom">Uploaded image</option></select></label><label>Background blur · {a.blur}px<input type="range" min={0} max={20} step={1} value={a.blur} onChange={e => edit({ blur: Number(e.target.value) })} /></label></div>
        {a.backgroundMode === 'custom' && <FileButton className="button secondary file-label" accept="image/png,image/jpeg,image/webp" onChange={e => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 8 * 1024 ** 2) { setError('Choose a background under 8 MB.'); return; } void readFile(f).then(data => edit({ backgroundImage: data })).catch(e => setError(e.message)); e.target.value = ''; }}><Upload size={16} /> Choose background</FileButton>}
        
        <div className="button-row"><button className="button secondary" onClick={() => downloadBlob(new Blob([JSON.stringify({ format: 'astral-theme', version: 2, appearance: a }, null, 2)], { type: 'application/json' }), 'Astral-theme.json')}><Download size={16} /> Export theme</button>
            <FileButton className="button secondary file-label" accept=".json" onChange={e => { const f = e.target.files?.[0]; if (f) { if (f.size > 12 * 1024 ** 2) { setError('Theme file is too large.'); return; } void f.text().then(text => { const theme = JSON.parse(text); if (theme.format !== 'astral-theme' || ![1, 2].includes(theme.version)) throw new Error('Choose an Astral theme export.'); persist(normalizeAppearance(theme.appearance) as Appearance); setError(''); }).catch(e => setError(e.message)); } e.target.value = ''; }}><Upload size={16} /> Import theme</FileButton>
            <button className="text-button" onClick={() => persist({ ...DEFAULT_APPEARANCE } as Appearance)}><RotateCcw size={15} /> Reset theme & layout</button>
        </div>{error && <p className="inline-error" role="alert">{error}</p>}
    </div>;
}
export function Credits({ close }: { close: () => void }) {
    const links = [
        ['Astral.AI on GitHub', 'https://github.com/ItsDTYT/Astral.AI'], ['SillyTavern contributors', 'https://github.com/SillyTavern/SillyTavern'], ['llama.cpp contributors', 'https://github.com/ggml-org/llama.cpp'],
        ['Taste design guidance', 'https://github.com/Leonxlnx/taste-skill'], ['UI/UX Pro Max', 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill'],
        ['ShaderGradient', 'https://github.com/ruucm/shadergradient'], ['Paper shader approach', 'https://github.com/paper-design/liquid-logo'],
        ['Liquid Glass', 'https://github.com/dashersw/liquid-glass-js'], ['React Three Fiber', 'https://github.com/pmndrs/react-three-fiber'],
    ];
    const open = (url: string) => { if (window.astralDesktop) void window.astralDesktop.openExternal(url); else window.open(url, '_blank', 'noopener,noreferrer'); };
    return <Modal title="Credits" close={close}><h3>ItsDT</h3><p>Creator & product direction</p><h3>Astral.AI contributors</h3><p>Built on SillyTavern and distributed under AGPL-3.0.</p><div className="credits-links">{links.map(([name, url]) => <button className="text-button" key={url} onClick={() => open(url)}>{name} ↗</button>)}</div><h3>AI assistance</h3><p>AI tools helped with code, interface design, and documentation.</p><h3>Artwork & type</h3><p>Character portraits and backgrounds were generated with AI. Some UI elements were created with AI assistance. Fonts: DM Sans and Outfit. Icons: Lucide.</p><p>The source release includes artwork notes, dependency credits, and licenses.</p><button className="button secondary" onClick={() => open('https://github.com/SillyTavern/SillyTavern/blob/release/LICENSE')}>AGPL-3.0 license</button></Modal>;
}
