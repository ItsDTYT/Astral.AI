import { chromium, request as playwrightRequest } from '@playwright/test';
import fs from 'node:fs';
const modelId = process.argv[2] || 'angelic-iq4_xs';
const api = await playwrightRequest.newContext({ baseURL: 'http://127.0.0.1:8000' });
const { token } = await (await api.get('/csrf-token')).json();
const post = async (url, data) => {
    const r = await api.post(url, { headers: { 'X-CSRF-Token': token }, data });
    if (!r.ok()) throw new Error(await r.text());
    return r.json();
};
await post('/api/astral/action', {
    type: 'settings',
    patch: {
        mode: 'normal',
        tutorialDone: true,
        autoMemory: false,
        connection: {
            kind: 'managed',
            url: '',
            model: '',
            template: 'auto',
            temperature: 0.8,
            maxTokens: 128,
            context: 4096,
        },
    },
});
await post('/api/astral/models', {
    action: 'start',
    modelId,
    options: { gpuLayers: 28, context: 4096 },
});
let runner;
for (let i = 0; i < 180; i++) {
    ({ runner } = await (await api.get('/api/astral/models')).json());
    if (runner.state === 'ready') break;
    if (runner.state === 'error') throw new Error(runner.error);
    await new Promise((resolve) => setTimeout(resolve, 1000));
}
const browser = await chromium.launch();
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    page.on('pageerror', (error) => console.log('PAGE_ERROR', error.message));
    await page.goto('http://127.0.0.1:8000/');
    await page.waitForFunction(() => window.astralBridge?.st?.astralAppReady);
    await page.locator('.featured button').click();
    await page
        .getByRole('textbox', { name: 'Message Hina' })
        .fill('Hello Hina. What are you painting today? Please reply in one short paragraph.');
    const previousCount = await page.evaluate(() => window.astralBridge.messages.length);
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await page.waitForFunction(
        (count) =>
            !window.astralBridge.generating &&
            window.astralBridge.messages.length >= count + 2 &&
            !window.astralBridge.messages.at(-1)?.is_user,
        previousCount,
        { timeout: 180000 },
    );
    const result = await page.evaluate(() => ({
        messages: window.astralBridge.messages.map((m) => ({ name: m.name, user: m.is_user, text: m.mes })),
        template: window.astralBridge.power.power_user.instruct.preset,
        sampling: {
            topP: window.astralBridge.textgen.textgenerationwebui_settings.top_p,
            topK: window.astralBridge.textgen.textgenerationwebui_settings.top_k,
            repetitionPenalty: window.astralBridge.textgen.textgenerationwebui_settings.rep_pen,
        },
    }));
    if (result.messages.length < 3 || !result.messages.at(-1).text) {
        const error = await page
            .locator('.error-banner')
            .textContent()
            .catch(() => '');
        throw new Error(`Managed chat failed: ${error}`);
    }
    if (
        result.sampling.topP !== 0.5 ||
        result.sampling.topK !== 40 ||
        result.sampling.repetitionPenalty !== 1.2
    )
        throw new Error('Model sampling preset was not applied.');
    fs.mkdirSync('.cache/verification', { recursive: true });
    fs.writeFileSync(`.cache/verification/managed-chat-${modelId}.json`, JSON.stringify(result, null, 2));
    await page.screenshot({ path: `.cache/verification/managed-chat-${modelId}.png` });
    console.log(
        JSON.stringify({
            template: result.template,
            messages: result.messages.length,
            replyCharacters: result.messages.at(-1).text.length,
        }),
    );
    await page
        .getByRole('textbox', { name: 'Message Hina' })
        .fill('Tell me a very long story about your art.');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await page.getByRole('button', { name: 'Stop reply', exact: true }).click();
    await page.waitForFunction(() => !window.astralBridge.generating);
    console.log('STOP_REPLY_VERIFIED');
} finally {
    await browser.close();
    await post('/api/astral/models', { action: 'stop' });
    await api.dispose();
}
