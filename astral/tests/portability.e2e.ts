import { test, expect } from '@playwright/test';
test('PNG cards round-trip through SillyTavern, and backup restores edited data', async ({
    page,
    request,
}) => {
    const { token } = await (await request.get('/csrf-token')).json();
    const post = async (data: any) => {
        const r = await request.post('/api/astral/action', {
            headers: { 'X-CSRF-Token': token },
            data,
        });
        expect(r.ok()).toBe(true);
        return (await r.json()).result;
    };
    await post({
        type: 'settings',
        patch: { mode: 'normal', tutorialDone: true },
    });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Start a story with Hina', exact: true })).toBeEnabled({
        timeout: 90000,
    });
    const signature = await page.evaluate(async () => {
        const state = await (await fetch('/api/astral/state')).json();
        const hina = state.characters.find((c: any) => c.id === 'hina');
        hina.sourceCard = { spec: 'chara_card_v3', spec_version: '3.0', customRoot: { preserved: true }, data: { creator: 'Fixture author', creator_notes: 'Source attribution', alternate_greetings: ['Welcome again.'], character_book: { name: 'Studio notes', entries: [] }, extensions: { foreign: { preserved: true } } } };
        const blob = await window.astralBridge.exportPNG(hina);
        (window as any).__astralRoundtripBlob = blob;
        return [...new Uint8Array(await blob.slice(0, 8).arrayBuffer())];
    });
    expect(signature).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const importedName = await page.evaluate(async () => {
        const file = new File([(window as any).__astralRoundtripBlob], 'Hina-roundtrip.png', {
            type: 'image/png',
        });
        delete (window as any).__astralRoundtripBlob;
        const imported = await window.astralBridge.importCharacter(file, 'normal');
        return { name: imported.name, greeting: imported.greeting, source: imported.sourceCard };
    });
    expect(importedName.name).toBe('Hina');
    expect(importedName.greeting).toContain('good light');
    expect(importedName.source.spec).toBe('chara_card_v3');
    expect(importedName.source.data.creator).toBe('Fixture author');
    expect(importedName.source.data.extensions.foreign).toEqual({ preserved: true });
    expect(importedName.source.data.character_book.name).toBe('Studio notes');
    expect(importedName.source.customRoot).toEqual({ preserved: true });
    const backup = await (await request.get('/api/astral/backup')).json();
    expect(backup.files.some((f: any) => f.path.endsWith('.png'))).toBe(true);
    await post({ type: 'settings', patch: { userName: 'Temporary QA name' } });
    const restore = await request.post('/api/astral/restore', {
        headers: { 'X-CSRF-Token': token },
        data: backup,
    });
    expect(restore.ok()).toBe(true);
    const restored = await (await request.get('/api/astral/state')).json();
    expect(restored.settings.userName).toBe(backup.state.settings.userName);
    expect(restored.settings.mode).toBe('normal');
    expect(restored.settings).not.toHaveProperty('adultConfirmed');
    const unsafe = structuredClone(backup);
    unsafe.files.push({ path: '../outside.txt', base64: 'aGVsbG8=' });
    expect(
        (
            await request.post('/api/astral/restore', {
                headers: { 'X-CSRF-Token': token },
                data: unsafe,
            })
        ).status(),
    ).toBe(400);
});
