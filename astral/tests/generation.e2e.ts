import { test, expect } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import { initialState } from '../../src/astral/store.js';
let server: http.Server;
const prompts: any[] = [];
test.beforeAll(async () => {
    server = http.createServer((req, res) => {
        if (req.url?.endsWith('/models')) {
            res.setHeader('Content-Type', 'application/json');
            res.end(
                JSON.stringify({
                    object: 'list',
                    data: [{ id: 'astral-test-model', object: 'model' }],
                }),
            );
            return;
        }
        let text = '';
        req.on('data', (chunk) => (text += chunk));
        req.on('end', () => {
            const data = JSON.parse(text || '{}');
            prompts.push(data);
            if (data.stream) {
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                });
                const emit = (content: string) =>
                    res.write(
                        `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`,
                    );
                emit('*Hina smiles.* ');
                setTimeout(() => {
                    emit('Green tea sounds lovely. Welcome to the studio.');
                    res.write('data: [DONE]\n\n');
                    res.end();
                }, 250);
            } else {
                res.setHeader('Content-Type', 'application/json');
                res.end(
                    JSON.stringify({
                        choices: [
                            {
                                message: {
                                    content: '{"summary":"Tea in the studio.","facts":[]}',
                                },
                                finish_reason: 'stop',
                            },
                        ],
                    }),
                );
            }
        });
    });
    await new Promise<void>((resolve) => server.listen(18081, '127.0.0.1', resolve));
});
test.afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
});
test.beforeEach(async ({ request }) => {
    prompts.length = 0;
    const { token } = await (await request.get('/csrf-token')).json();
    const state = initialState(JSON.parse(fs.readFileSync('astral/resources/characters.json', 'utf8')));
    await request.post('/api/astral/restore', {
        headers: { 'X-CSRF-Token': token },
        data: { format: 'astral-backup', version: 1, state, files: [] },
    });
});
test('upstream generation streams, includes scoped memory, and persists the reply', async ({
    page,
    request,
}) => {
    const { token } = await (await request.get('/csrf-token')).json();
    const post = (data: any) =>
        request.post('/api/astral/action', {
            headers: { 'X-CSRF-Token': token },
            data,
        });
    await post({
        type: 'settings',
        patch: {
            mode: 'normal',
            tutorialDone: true,
            autoMemory: false,
            connection: {
                kind: 'openai',
                url: 'http://127.0.0.1:18081/v1',
                model: 'astral-test-model',
                template: 'auto',
                temperature: 0.8,
                maxTokens: 128,
                context: 4096,
                sampling: { topP: 0.75 },
            },
        },
    });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Start a story with Hina', exact: true })).toBeEnabled({
        timeout: 90000,
    });
    await page.getByRole('button', { name: 'Start a story with Hina', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Message Hina' })).toBeVisible();
    await page.getByRole('button', { name: 'Open memory' }).click();
    await page.getByRole('button', { name: 'Add memory' }).click();
    await page.getByRole('textbox', { name: 'Memory', exact: true }).fill('The user prefers green tea.');
    await page.getByRole('button', { name: 'Save memory', exact: true }).click();
    await expect(page.locator('.memory-card')).toContainText('green tea');
    await page.getByRole('button', { name: /^Chats/ }).click();
    await page.getByRole('textbox', { name: 'Message Hina' }).fill('Hello Hina. Shall we make tea?');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(page.locator('.speech')).toContainText('Welcome to the studio.', { timeout: 45000 });
    expect(prompts.some((p) => JSON.stringify(p.messages).includes('The user prefers green tea.'))).toBe(
        true,
    );
    expect(prompts.some((p) => p.top_p === 0.75)).toBe(true);
    expect(prompts.some((p) => JSON.stringify(p.messages).includes('Keep this story non-explicit'))).toBe(
        true,
    );
    const upstream = await page.evaluate(() => ({
        count: window.astralBridge.st.chat.length,
        file: window.astralBridge.st.getCurrentChatId(),
        user: window.astralBridge.st.chat.some((m: any) => m.is_user && m.mes.includes('Shall we make tea')),
    }));
    expect(upstream.user).toBe(true);
    expect(upstream.count).toBeGreaterThanOrEqual(3);
    expect(upstream.file).toContain('astral_normal_');
    await page.getByRole('button', { name: 'Open memory' }).click();
    await page.getByRole('switch', { name: /^Use memory in this story/ }).uncheck();
    await page.getByRole('button', { name: /^Chats/ }).click();
    await page.getByRole('textbox', { name: 'Message Hina' }).fill('Tell me about the canvas.');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeVisible({
        timeout: 45000,
    });
    const injection = await page.evaluate(
        () => window.astralBridge.st.extension_prompts['astral-memory']?.value,
    );
    expect(injection).toBe('');
    const activeId = await page.evaluate(() => window.astralBridge.active!.id);
    await post({ type: 'settings', patch: { autoMemory: true } });
    await post({
        type: 'updateConversation',
        mode: 'normal',
        conversationId: activeId,
        patch: { memoryEnabled: true },
    });
    await page.evaluate(async () => {
        const state = await (await fetch('/api/astral/state')).json();
        const chat = state.conversations.find((c: any) => c.id === window.astralBridge.active!.id);
        window.astralBridge.remember(state, chat, () => {});
        await window.astralBridge.quietTask;
    });
    const remembered = await (await request.get('/api/astral/state')).json();
    expect(remembered.conversations.find((c: any) => c.id === activeId).summary).toBe('Tea in the studio.');
    await page.screenshot({ path: 'astral/test-output/chat-desktop.png' });
    await page.reload();
    await expect(page.getByRole('button', { name: 'Start a story with Hina', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Start a story with Hina', exact: true }).click();
    await expect(page.locator('.speech')).toContainText('Welcome to the studio.');
});

test('actual generation keeps profiles and memories isolated, and sharing can be switched off independently', async ({ page, request }) => {
    const { token } = await (await request.get('/csrf-token')).json();
    const action = async (data: any) => {
        const response = await request.post('/api/astral/action', { headers: { 'X-CSRF-Token': token }, data });
        expect(response.ok()).toBe(true); return (await response.json()).result;
    };
    await action({ type: 'settings', patch: { tutorialDone: true, autoMemory: false, connection: { kind: 'openai', url: 'http://127.0.0.1:18081/v1', model: 'astral-test-model', maxTokens: 128, context: 4096 } } });
    const first = await action({ type: 'saveProfile', profile: { displayName: 'Rowan', about: 'PROFILE_ONE_CANARY', facts: [] } });
    const second = await action({ type: 'saveProfile', profile: { displayName: 'Morgan', about: 'PROFILE_TWO_CANARY', facts: [] } });
    const chats = [];
    for (const profile of [first, second]) {
        const chat = await action({ type: 'createConversation', mode: 'normal', characterId: 'hina', userProfileId: profile.id });
        await action({ type: 'saveMemory', mode: 'normal', conversationId: chat.id, memory: { text: `MEMORY_${profile.id}`, scope: 'character' } }); chats.push(chat);
    }
    await page.goto('/'); await page.waitForFunction(() => !!window.astralBridge?.openai);
    const send = async (chatId: string) => page.evaluate(async id => {
        const state = await (await fetch('/api/astral/state')).json(); const b = window.astralBridge;
        const chat = state.conversations.find((c: any) => c.id === id), character = state.characters.find((c: any) => c.id === chat.characterId);
        await b.open(character, chat, state); await b.send('Hello there.', state, { state: 'stopped' } as any);
    }, chatId);
    await send(chats[0].id);
    let prompt = JSON.stringify(prompts.at(-1).messages);
    expect(prompt).toContain('PROFILE_ONE_CANARY'); expect(prompt).not.toContain('PROFILE_TWO_CANARY'); expect(prompt).toContain(`MEMORY_${first.id}`);
    await send(chats[1].id);
    prompt = JSON.stringify(prompts.at(-1).messages);
    expect(prompt).toContain('PROFILE_TWO_CANARY'); expect(prompt).not.toContain('PROFILE_ONE_CANARY'); expect(prompt).not.toContain(`MEMORY_${first.id}`);
    await action({ type: 'updateConversation', mode: 'normal', conversationId: chats[1].id, patch: { shareProfile: false } });
    await send(chats[1].id); prompt = JSON.stringify(prompts.at(-1).messages);
    expect(prompt).not.toContain('PROFILE_TWO_CANARY'); expect(prompt).toContain(`MEMORY_${second.id}`);
    const history = await page.evaluate(() => window.astralBridge.messages.filter(m => m.is_user).map(m => m.name));
    expect(history[0]).toBe('Morgan'); expect(history.at(-1)).toBe('You');
});
