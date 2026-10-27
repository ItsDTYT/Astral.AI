import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { initialState } from '../../src/astral/store.js';
test.beforeEach(async ({ request }) => {
    const { token } = await (await request.get('/csrf-token')).json();
    const state = initialState(JSON.parse(fs.readFileSync('astral/resources/characters.json', 'utf8')));
    await request.post('/api/astral/restore', {
        headers: { 'X-CSRF-Token': token },
        data: { format: 'astral-backup', version: 1, state, files: [] },
    });
});
test('new user can start a real SillyTavern story, edit memory, save and return to the eight-character library', async ({
    page,
}) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Who will you meet today?' })).toBeVisible();
    if (
        await page
            .getByRole('button', { name: "I'll explore first" })
            .waitFor({ state: 'visible', timeout: 3000 })
            .then(() => true)
            .catch(() => false)
    )
        await page.getByRole('button', { name: "I'll explore first" }).click();
    await expect(page.getByRole('button', { name: 'Start a story with Hina', exact: true })).toBeEnabled({
        timeout: 90000,
    });
    await page.screenshot({
        path: 'astral/test-output/library-desktop.png',
        fullPage: true,
    });
    await page.getByRole('button', { name: 'Start a story with Hina', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Message Hina' })).toBeVisible();
    await expect(page.locator('.speech')).toContainText('good light');
    await page.getByRole('button', { name: 'Open memory', exact: true }).click();
    await page.getByRole('button', { name: 'Add memory' }).click();
    await page.getByRole('textbox', { name: 'Memory', exact: true }).fill('The user prefers green tea.');
    await page.getByRole('button', { name: 'Save memory', exact: true }).click();
    await expect(page.locator('.memory-card')).toContainText('green tea');
    await page.getByRole('button', { name: 'Chats', exact: false }).first().click();
    await page.getByRole('button', { name: 'Create save point', exact: true }).click();
    await page.getByRole('textbox', { name: 'Save point name' }).fill('The studio');
    await page.getByRole('button', { name: 'Create save point', exact: true }).last().click();
    await expect(page.getByRole('status').filter({ hasText: 'Save point created' })).toBeVisible();
    await page.locator('.nav-item').filter({ hasText: 'Characters' }).click();
    await expect(page.getByRole('button', { name: /NSFW/ })).toHaveCount(0);
    await expect(page.locator('.character-card')).toHaveCount(8);
    await expect(page.getByRole('heading', { name: 'Hina', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Hina', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
});
test('small screens and reduced motion retain usable navigation and character editing', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Who will you meet today?' })).toBeVisible();
    if (
        await page
            .getByRole('button', { name: "I'll explore first" })
            .isVisible()
            .catch(() => false)
    )
        await page.getByRole('button', { name: "I'll explore first" }).click();
    await page.screenshot({
        path: 'astral/test-output/library-mobile.png',
        fullPage: true,
    });
    const overflow = await page.locator('.app').evaluate((el) => el.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
    await page.getByRole('button', { name: 'Create character', exact: true }).click();
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('QA Character');
    await expect(page.getByRole('spinbutton', { name: /Age/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Save character', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'QA Character' })).toBeVisible();
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
    await page.getByRole('button', { name: 'Models', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Models', exact: true })).toBeVisible();
});

test('themes import/export and enlarged interface settings remain reachable in short windows',async({page,request})=>{
    await page.goto('/');
    await expect(page.getByRole('heading',{name:'Who will you meet today?'})).toBeVisible();
    if(await page.getByRole('button',{name:"I'll explore first"}).isVisible())await page.getByRole('button',{name:"I'll explore first"}).click();
    await page.getByRole('button',{name:'Appearance',exact:true}).click();
    await page.getByRole('combobox',{name:'Theme',exact:true}).selectOption('paper');
    await expect(page.locator('.app')).toHaveAttribute('data-theme','paper');
    await page.getByRole('slider',{name:/Interface size/}).focus();
    await page.getByRole('slider',{name:/Interface size/}).press('End');
    await expect.poll(async()=> (await(await request.get('/api/astral/state')).json()).settings.appearance.uiScale).toBe(150);
    const exported=page.waitForEvent('download');await page.getByRole('button',{name:'Export theme',exact:true}).click();
    expect((await exported).suggestedFilename()).toBe('Astral-theme.json');
    const input=page.locator('.appearance-controls input[type=file][accept=".json"]');
    await input.setInputFiles({name:'theme.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'astral-theme',version:1,appearance:{theme:'midnight',uiScale:150,density:'compact'}}))});
    await expect(page.locator('.app')).toHaveAttribute('data-theme','midnight');
    for(const size of [{width:1366,height:768},{width:960,height:540},{width:800,height:480},{width:640,height:480}]){
        await page.setViewportSize(size);
        expect(await page.locator('.app').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(false);
    }
    await page.getByRole('button',{name:'Toggle navigation'}).click();await page.getByRole('button',{name:'Characters',exact:true}).click();
    await page.getByRole('button',{name:'Create character',exact:true}).click();
    const save=page.getByRole('button',{name:'Save character',exact:true});await save.scrollIntoViewIfNeeded();await expect(save).toBeInViewport();
    await page.screenshot({path:'astral/test-output/editor-640x480-scale150.png'});
});
