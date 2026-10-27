import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { initialState } from '../../src/astral/store.js';

test.beforeEach(async ({ request }) => {
    const { token } = await (await request.get('/csrf-token')).json();
    const state = initialState(JSON.parse(fs.readFileSync('astral/resources/characters.json', 'utf8')));
    state.settings.tutorialDone = true;
    state.settings.effects = 'off';
    state.settings.autoMemory = false;
    const r = await request.post('/api/astral/restore', { headers: { 'X-CSRF-Token': token }, data: { format: 'astral-backup', version: 1, state, files: [] } });
    expect(r.ok()).toBe(true);
});

async function navigate(page: any, name: string) {
    const target = page.getByRole('button', { name, exact: true });
    const toggle = page.getByRole('button', { name: 'Toggle navigation' });
    if (await toggle.isVisible() && !await page.locator('.app').evaluate((el: Element) => el.classList.contains('nav-open'))) await toggle.click();
    await target.click();
}

test('appearance controls have aligned bounds and the hidden picker opens from the keyboard', async ({ page }) => {
    await page.setViewportSize({ width: 1515, height: 727 });
    await page.goto('/');
    await navigate(page, 'Appearance');
    const panel = page.locator('.appearance-controls');
    await expect(panel).toHaveCSS('padding-left', '24px');
    expect(await panel.locator('input[type=file]').evaluateAll(es => es.every(e => getComputedStyle(e).display === 'none' && e.getBoundingClientRect().width === 0))).toBe(true);
    const sizes = await panel.evaluate(el => {
        const theme = el.querySelector('select')!.getBoundingClientRect();
        const range = el.querySelector('input[type=range]')!.getBoundingClientRect();
        const pair = el.querySelector('.two-fields')!.getBoundingClientRect();
        const column = el.querySelector('.two-fields select')!.getBoundingClientRect();
        return [theme.left, range.left, pair.left, theme.right - pair.right, range.right - column.right];
    });
    expect(Math.max(...sizes.slice(0, 3)) - Math.min(...sizes.slice(0, 3))).toBeLessThanOrEqual(1);
    expect(Math.max(...sizes.slice(3).map(Math.abs))).toBeLessThanOrEqual(1);
    const picker = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import theme', exact: true }).focus();
    await page.keyboard.press('Enter');
    await (await picker).setFiles({ name: 'theme.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'astral-theme', version: 1, appearance: { theme: 'paper', uiScale: 125 } })) });
    await expect(page.locator('.app')).toHaveAttribute('data-theme', 'paper');
});

test('memory switches stay within their card and remain usable in short enlarged layouts', async ({ page, request }) => {
    const { token } = await (await request.get('/csrf-token')).json();
    for (const [width, height, scale] of [[2229, 1264, 100], [1515, 727, 100], [960, 540, 150], [640, 480, 150]]) {
        await request.post('/api/astral/action', { headers: { 'X-CSRF-Token': token }, data: { type: 'settings', patch: { appearance: { theme: 'midnight', uiScale: scale } } } });
        await page.setViewportSize({ width, height });
        await page.goto('/');
        await expect(page.getByRole('button', { name: 'Start a story with Hina', exact: true })).toBeEnabled({ timeout: 90000 });
        await page.getByRole('button', { name: 'Start a story with Hina', exact: true }).click();
        await navigate(page, 'Memory');
        const control = page.getByRole('switch', { name: 'Include in memory', exact: true });
        await control.scrollIntoViewIfNeeded();
        const geometry = await control.evaluate(el => {
            const track = el.getBoundingClientRect(), card = el.closest('.settings-section')!.getBoundingClientRect();
            const thumb = getComputedStyle(el, '::before');
            return { width: track.width, height: track.height, inside: track.left >= card.left + 15 && track.right <= card.right - 15, thumbWidth: parseFloat(thumb.width) };
        });
        expect(geometry).toMatchObject({ width: 36, height: 21, inside: true, thumbWidth: 13 });
        const before = await control.isChecked();
        await control.focus();
        await page.keyboard.press('Space');
        await expect(control).toBeChecked({ checked: !before });
        await expect.poll(async () => {
            const state = await (await request.get('/api/astral/state')).json();
            return state.conversations.find((c: any) => c.characterId === 'hina').summaryEnabled;
        }).toBe(!before);
        const save = page.getByRole('button', { name: 'Save summary', exact: true });
        await save.scrollIntoViewIfNeeded();
        await expect(save).toBeInViewport();
        expect(await page.locator('.page').evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false);
    }
});
