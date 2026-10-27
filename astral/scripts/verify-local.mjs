import { request as playwrightRequest } from '@playwright/test';
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
const ids = ['angelic-iq4_xs', 'forgotten-iq4_xs'];
for (const id of ids) {
    const list = await (await api.get('/api/astral/models')).json();
    const model = list.models.find((m) => m.id === id);
    if (!model.ready && !['downloading', 'verifying'].includes(model.downloadState))
        await post({ action: 'download', modelId: id });
}
let done = false;
while (!done) {
    const list = await (await api.get('/api/astral/models')).json();
    const selected = list.models.filter((m) => ids.includes(m.id));
    console.log(
        selected
            .map(
                (m) =>
                    `${m.name}: ${m.ready ? 'verified and ready' : `${m.downloadState ?? 'paused'} ${Math.round((m.downloaded / m.bytes) * 100)}%`}`,
            )
            .join(' | '),
    );
    for (const model of selected) if (model.error) throw new Error(model.error);
    done = selected.every((m) => m.ready);
    if (!done) await new Promise((resolve) => setTimeout(resolve, 15000));
}
await api.dispose();
