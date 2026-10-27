import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AstralStore } from '../../src/astral/store.js';
import { THEMES, normalizeAppearance, themeTokens, contrast } from '../shared/appearance.js';
test('custom colors resolve complete palettes with readable control states and exact background overrides', () => {
    const colors = ['#8e54d8', '#337ddb', '#db3949', '#888888', '#ffffff', '#000000', '#777777', '#ff0000'];
    for (const theme of Object.keys(THEMES)) for (const background of ['', ...colors]) for (const accent of colors) {
        const t = themeTokens({ theme, accent, background });
        if (background) assert.equal(t.background, background);
        assert(contrast(t.accentInk, t.accent) >= 4.5);
        for (const surface of [t.background, t.surface, t.raised, t.hover, t.pressed]) {
            assert(contrast(t.text, surface) >= 4.5, `${theme}/${background}/${accent}: text`);
            assert(contrast(t.muted, surface) >= 4.5, `${theme}/${background}/${accent}: muted`);
            assert(contrast(t.focus, surface) >= 3, `${theme}/${background}/${accent}: focus`);
        }
        if (accent !== THEMES.forest.accent) assert.notEqual(t.surface, THEMES.forest.surface);
    }
});
test('built-in palettes and system preference share the same complete token interface', () => {
    for (const theme of Object.keys(THEMES)) {
        const t = themeTokens({ theme });
        assert.equal(t.background, THEMES[theme].background);
        for (const token of ['hover','pressed','focus','accentInk','danger','success','effectPrimary','effectSecondary','effectAccent']) assert.match(t[token], /^#[a-f0-9]{6}$/i);
    }
    assert.equal(themeTokens({ theme: 'system' }, false).dark, false);
    assert.equal(themeTokens({ theme: 'forest', background: '#ffffff' }).dark, false);
    assert.equal(themeTokens({ theme: 'paper', background: '#000000' }).dark, true);
    const legacy = normalizeAppearance({ version: 1, accent: '#8866cc', background: '#121020', uiScale: 125, density: 'compact' });
    assert.equal(legacy.version, 2); assert.equal(legacy.accent, '#8866cc'); assert.equal(legacy.background, '#121020'); assert.equal(legacy.uiScale, 125);
});
test('interface CSS has no literal Forest colors; effects have no fixed portrait texture or palette', () => {
    for (const file of ['style.css','v2.css','v3.css']) assert(!/#[a-f\d]{3,8}\b|rgba?\(/i.test(fs.readFileSync(`astral/ui/${file}`, 'utf8')), file);
    const effects = fs.readFileSync('astral/ui/effects.tsx', 'utf8');
    assert(!effects.includes('/astral/art/hina.png'));
    assert(!/color[123]=["']#/.test(effects));
});
test('starter artwork upgrades lazily while preserving edits, custom art, deleted starters and appearance choices', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astral-art-v31-'));
    t.after(() => { assert(path.basename(root).startsWith('astral-art-v31-')); fs.rmSync(root, { recursive: true, force: true }); });
    const defaults = JSON.parse(fs.readFileSync('astral/resources/characters.json'));
    const store = new AstralStore(root, defaults), old = structuredClone(store.state);
    const hina = old.characters.find(c => c.id === 'hina'); hina.art = '/astral/art/hina.png'; hina.artVersion = 'anime-v2'; hina.avatar = 'Hina.png'; hina.description = 'Keep this edited definition';
    const rei = old.characters.find(c => c.id === 'rei'); rei.art = '/api/astral/assets/' + 'a'.repeat(64) + '.png'; rei.artVersion = 'custom';
    old.characters = old.characters.filter(c => c.id !== 'kai');
    const userProfileId = old.profiles[0].id;
    old.conversations.push({ id: 'existing-chat', characterId: 'hina', mode: 'normal', fileName: 'astral_existing', userProfileId, title: 'Keep this story', summary: 'We met in the studio.', summaryEnabled: true, updatedAt: 1 });
    old.memories.push({ id: 'existing-memory', characterId: 'hina', mode: 'normal', userProfileId, scope: 'character', text: 'Prefers tea.', enabled: true, pinned: true, createdAt: 1 });
    old.settings.appearance = { ...old.settings.appearance, version: 1, accent: '#8855cc', background: '#111122', uiScale: 125 };
    fs.writeFileSync(store.file, JSON.stringify(old));
    const upgraded = new AstralStore(root, defaults).state;
    assert.equal(upgraded.characters.length, 7);
    const updated = upgraded.characters.find(c => c.id === 'hina');
    assert.equal(updated.art, '/astral/art/v4/hina.png'); assert.equal(updated.artNeedsSync, true); assert.equal(updated.avatar, 'Hina.png'); assert.equal(updated.description, 'Keep this edited definition');
    assert.equal(upgraded.characters.find(c => c.id === 'rei').art, rei.art);
    assert.equal(upgraded.settings.appearance.version, 2); assert.equal(upgraded.settings.appearance.accent, '#8855cc'); assert.equal(upgraded.settings.appearance.background, '#111122');
    assert.deepEqual(upgraded.profiles, old.profiles); assert.deepEqual(upgraded.conversations, old.conversations); assert.deepEqual(upgraded.memories, old.memories);
});
