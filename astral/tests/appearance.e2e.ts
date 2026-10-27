import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { themeTokens } from '../shared/appearance.js';

test('custom color pickers coordinate chrome, survive reload, and round-trip v2 and legacy themes', async ({ page, request }) => {
    const { token } = await (await request.get('/csrf-token')).json();
    await request.post('/api/astral/action', { headers: { 'X-CSRF-Token': token }, data: { type: 'settings', patch: { tutorialDone: true, effects: 'off', appearance: { theme: 'midnight' } } } });
    await page.goto('/');
    await page.getByRole('button', { name: 'Appearance', exact: true }).click();
    const rgb = (hex: string) => `rgb(${hex.slice(1).match(/../g)!.map(n => parseInt(n, 16)).join(', ')})`;
    for (const accent of ['#9254d4', '#287edd', '#d83a4d', '#888888']) {
        await page.getByLabel('Accent color', { exact: true }).fill(accent);
        const palette = themeTokens({ theme: 'midnight', accent });
        await expect(page.locator('.app')).toHaveCSS('background-color', rgb(palette.background));
        await expect(page.locator('.sidebar')).toHaveCSS('background-color', rgb(palette.surface));
        await expect(page.getByRole('button', { name: 'Export theme', exact: true })).toHaveCSS('background-color', rgb(palette.raised));
    }
    await page.getByLabel('App background color', { exact: true }).fill('#fffaf3');
    await expect(page.locator('.app')).toHaveCSS('background-color', 'rgb(255, 250, 243)');
    await expect(page.locator('.app')).toHaveCSS('color-scheme', 'light');
    await expect.poll(async () => (await (await request.get('/api/astral/state')).json()).settings.appearance).toMatchObject({ version: 2, accent: '#888888', background: '#fffaf3' });
    await page.reload();
    await expect(page.locator('.app')).toHaveCSS('background-color', 'rgb(255, 250, 243)');
    await page.getByRole('button', { name: 'Appearance', exact: true }).click();
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export theme', exact: true }).click();
    const download = await downloadEvent;
    const exported = JSON.parse(await fs.readFile((await download.path())!, 'utf8'));
    expect(exported).toMatchObject({ format: 'astral-theme', version: 2, appearance: { version: 2, background: '#fffaf3', accent: '#888888' } });
    const input = page.locator('.appearance-controls input[type=file][accept=".json"]');
    await input.setInputFiles({ name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'astral-theme', version: 1, appearance: { version: 1, theme: 'paper', accent: '#744baa', uiScale: 100 } })) });
    await expect(page.locator('.app')).toHaveCSS('background-color', rgb(themeTokens({ theme: 'paper', accent: '#744baa' }).background));
    await input.setInputFiles({ name: 'current.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
    await expect(page.locator('.app')).toHaveCSS('background-color', 'rgb(255, 250, 243)');
    await page.getByRole('button', { name: 'Characters', exact: true }).click();
    await page.getByRole('button', { name: 'Create character', exact: true }).click();
    await expect(page.locator('.modal')).toHaveCSS('background-color', rgb(themeTokens(exported.appearance).surface));
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await page.getByRole('button', { name: 'Credits', exact: true }).click();
    await expect(page.locator('.modal')).toContainText('ItsDT');
    await expect(page.locator('.modal')).toContainText('Character portraits and backgrounds were generated with AI. Some UI elements were created with AI assistance.');
});

test('Windows theme follows light and dark preference changes without a reload', async ({ page, request }) => {
    const { token } = await (await request.get('/csrf-token')).json();
    await request.post('/api/astral/action', { headers: { 'X-CSRF-Token': token }, data: { type: 'settings', patch: { tutorialDone: true, effects: 'off', appearance: { theme: 'system' } } } });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.locator('.app')).toHaveAttribute('data-theme', 'forest');
    await expect(page.locator('.app')).toHaveCSS('background-color', 'rgb(21, 26, 23)');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('.app')).toHaveAttribute('data-theme', 'paper');
    await expect(page.locator('.app')).toHaveCSS('background-color', 'rgb(244, 241, 233)');
    await expect(page.locator('.app')).toHaveCSS('color-scheme', 'light');
});
