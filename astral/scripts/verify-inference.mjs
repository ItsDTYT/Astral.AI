import { request as playwrightRequest } from '@playwright/test';
import fs from 'node:fs';
const api = await playwrightRequest.newContext({
    baseURL: 'http://127.0.0.1:8000',
});
const { token } = await (await api.get('/csrf-token')).json();
const post = async (data) => {
    const r = await api.post('/api/astral/models', {
        headers: { 'X-CSRF-Token': token },
        data,
    });
    if (!r.ok()) throw new Error(await r.text());
    return r.json();
};
const results = [];
try {
    for (const modelId of ['angelic-iq4_xs', 'forgotten-iq4_xs']) {
        await post({
            action: 'start',
            modelId,
            options: { gpuLayers: 28, context: 2048 },
        });
        console.log(`Loading ${modelId}…`);
        let runner;
        const deadline = Date.now() + 300000;
        while (Date.now() < deadline) {
            ({ runner } = await (await api.get('/api/astral/models')).json());
            if (runner.state === 'ready') break;
            if (runner.state === 'error') throw new Error(`${runner.error}\n${runner.log}`);
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        if (runner.state !== 'ready') throw new Error('Model loading timed out.');
        const start = Date.now();
        const response = await fetch(`${runner.url}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [
                    {
                        role: 'system',
                        content:
                            'You are a friendly fictional character. Keep the response brief and non-explicit.',
                    },
                    {
                        role: 'user',
                        content: 'Say hello and introduce yourself in one sentence.',
                    },
                ],
                max_tokens: 40,
                temperature: 0.6,
            }),
            signal: AbortSignal.timeout(180000),
        });
        const data = await response.json();
        if (!response.ok || !data.choices?.[0]?.message?.content) throw new Error(JSON.stringify(data));
        const result = {
            modelId,
            backend: runner.backend,
            milliseconds: Date.now() - start,
            reply: data.choices[0].message.content,
            usage: data.usage,
        };
        results.push(result);
        console.log(JSON.stringify(result));
        await post({ action: 'stop' });
    }
    fs.mkdirSync('astral/test-output', { recursive: true });
    fs.writeFileSync('astral/test-output/real-model-verification.json', JSON.stringify(results, null, 2));
} finally {
    await post({ action: 'stop' }).catch(() => {});
    await api.dispose();
}
