import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import multer from 'multer';
import { read as readPNGCard } from '../character-card-parser.js';
import { router as contentRouter } from '../endpoints/content-manager.js';
import { decodeCharacter } from '../../astral/shared/cards.js';
import { saveImageAsset, getAssetFile } from './assets.js';
import { streamBackup, restoreZip, restoreLegacy } from './backup.js';
import { withSafeCardImports } from './import-security.js';
import { AstralStore, assert } from './store.js';
import { ModelManager, localEndpoint } from './models.js';
import { serverDirectory } from '../server-directory.js';

const resources = path.join(serverDirectory, 'astral', 'resources');
const defaults = JSON.parse(
    fs.readFileSync(path.join(resources, 'characters.json'), 'utf8'),
);
const stores = new Map();
let manager;
export const router = express.Router();
const zipUpload = multer({ dest: os.tmpdir(), limits: { fileSize: 2 * 1024 ** 3, files: 1 } });
function getStore(req) {
    const root = req.user.directories.root;
    if (!stores.has(root)) {
        const store = new AstralStore(root, defaults);
        stores.set(root, store);
    }
    return stores.get(root);
}
function getManager() {
    return (manager ??= new ModelManager(globalThis.DATA_ROOT, resources));
}
export async function shutdownAstral() {
    await manager?.shutdown();
}
const endpoint = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (e) {
        console.error('[Astral]', e.message);
        res.status(e.status || 400).json({ error: e.message });
    }
};
router.post('/assets', endpoint(async (req, res) => {
    res.json(await saveImageAsset(req.user.directories.root, req.body.data, req.body.title));
}));
router.get('/assets/:name', endpoint(async (req, res) => { res.type('png').sendFile(getAssetFile(req.user.directories.root, req.params.name)); }));
router.post('/character-preview', endpoint(async (req, res) => {
    assert(typeof req.body.data === 'string' && req.body.data.length < 45 * 1024 ** 2, 'Choose a character file under 32 MB.');
    const data = /\.png$/i.test(req.body.filename) ? JSON.parse(readPNGCard(Buffer.from(req.body.data, 'base64'))) : JSON.parse(Buffer.from(req.body.data, 'base64').toString('utf8'));
    res.json(decodeCharacter(data));
}));
router.post('/import-url', endpoint(async (req, res) => {
    const url = new URL(req.body.url);
    assert(url.protocol === 'https:' && !url.username && !url.password && !url.port && ['chub.ai', 'www.chub.ai', 'characterhub.org', 'www.characterhub.org', 'pygmalion.chat', 'aicharactercards.com', 'www.aicharactercards.com', 'perchance.org'].includes(url.hostname), 'This site requires an exported PNG/JSON card. Use the file tab for Character.AI, JanitorAI, and other sites.');
    req.url = '/importURL';
    withSafeCardImports(() => contentRouter.handle(req, res, () => { if (!res.headersSent) res.status(400).json({ error: 'This link could not be imported. Try an exported character file.' }); }));
}));
router.get('/backup-zip', endpoint(async (req, res) => { await streamBackup(res, getStore(req), req.user.directories); }));
router.post('/restore-zip', zipUpload.single('file'), endpoint(async (req, res) => {
    assert(req.file, 'Choose an Astral backup ZIP.');
    try { await restoreZip(req.file.path, getStore(req), req.user.directories.root); res.json({ ok: true }); } finally { fs.unlinkSync(req.file.path); }
}));
router.get(
    '/state',
    endpoint(async (req, res) => {
        const state = structuredClone(getStore(req).state);
        res.json(state);
    }),
);
router.post(
    '/action',
    endpoint(async (req, res) => {
        const store = getStore(req);
        if (req.body.type === 'settings' && req.body.patch?.connection?.url)
            localEndpoint(req.body.patch.connection.url);
        res.json({ result: store.action(req.body) });
    }),
);
router.get(
    '/hardware',
    endpoint(async (req, res) => {
        const machine = await getManager().probeHardware();
        const store = getStore(req);
        if (store.isNew && !store.state.settings.connection.preferredModelId) {
            store.state.settings.connection.preferredModelId = machine.recommendation.modelId;
            store.state.settings.connection.context = machine.recommendation.context;
            store.write();
        }
        res.json(machine);
    }),
);
router.get(
    '/models',
    endpoint(async (_, res) => {
        const m = getManager();
        res.json({ models: m.list(), runner: m.status, runtimes: m.runtimes.list() });
    }),
);
router.post(
    '/models',
    endpoint(async (req, res) => {
        const m = getManager();
        const { action, modelId } = req.body;
        if (action === 'download') await m.download(modelId);
        else if (action === 'pause') await m.pause(modelId);
        else if (action === 'remove') await m.remove(modelId);
        else if (action === 'start') await m.start(modelId, req.body.options);
        else if (action === 'stop') await m.stop();
        else if (action === 'import') await m.importFile(req.body.path, req.body.projectorPath);
        else if (action === 'projector') await m.setProjector(modelId, req.body.path);
        else throw new Error('Unknown model action.');
        res.json({ models: m.list(), runner: m.status });
    }),
);
router.post('/runtimes', endpoint(async (req, res) => {
    const manager = getManager(), { action, backend } = req.body;
    assert(['cuda', 'vulkan'].includes(backend), 'Choose CUDA or Vulkan support.');
    if (action === 'download') await manager.runtimes.download(backend);
    else if (action === 'pause') await manager.runtimes.pause(backend);
    else if (action === 'discard') await manager.runtimes.discard(backend);
    else throw new Error('Unknown runtime action.');
    res.json({ runtimes: manager.runtimes.list() });
}));
router.post(
    '/test-connection',
    endpoint(async (req, res) => {
        const base = localEndpoint(req.body.url);
        const url =
            req.body.kind === 'koboldcpp'
                ? `${base.replace(/\/v1$/, '')}/api/v1/model`
                : `${base.replace(/\/v1$/, '')}/v1/models`;
        const response = await fetch(url, {
            signal: AbortSignal.timeout(8000),
        });
        assert(
            response.ok,
            `The local server returned ${response.status}. Check that its API is enabled.`,
        );
        const data = await response.json();
        const models = data.data?.map((m) => m.id) ?? [data.result].filter(Boolean);
        if (req.body.vision && req.body.kind !== 'koboldcpp') {
            const tested = await fetch(`${base.replace(/\/v1$/, '')}/v1/chat/completions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(120000),
                body: JSON.stringify({ model: req.body.model || models[0], messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply OK to confirm this image request.' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMr8AAAAASUVORK5CYII=' } }] }], max_tokens: 16, stream: false }),
            });
            assert(tested.ok(), `The server rejected the image test (${tested.status}). Check its vision model and projector, or turn off image support.`);
            const answer = await tested.json();
            assert(answer.choices?.[0]?.message, 'The image test did not return a chat reply.');
        }
        res.json({
            ok: true,
            models, visionVerified: !!req.body.vision && req.body.kind !== 'koboldcpp',
        });
    }),
);
function backupFiles(directories) {
    const files = [];
    const walk = (root, prefix) => {
        if (!fs.existsSync(root)) return;
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
            if (entry.isSymbolicLink()) continue;
            const file = path.join(root, entry.name);
            const rel = `${prefix}/${entry.name}`;
            if (entry.isDirectory()) walk(file, rel);
            else if (/\.(png|jsonl)$/i.test(entry.name))
                files.push({
                    path: rel,
                    base64: fs.readFileSync(file).toString('base64'),
                });
        }
    };
    walk(directories.characters, 'characters');
    walk(directories.chats, 'chats');
    return files;
}
router.get(
    '/backup',
    endpoint(async (req, res) => {
        const state = structuredClone(getStore(req).state);
        state.settings.connection = {
            ...state.settings.connection,
            url: '',
            model: '',
        };
        res.setHeader(
            'Content-Disposition',
            'attachment; filename="Astral-backup.astral.json"',
        );
        res.json({
            format: 'astral-backup',
            version: 1,
            exportedAt: new Date().toISOString(),
            state,
            files: backupFiles(req.user.directories),
        });
    }),
);
router.post(
    '/restore',
    endpoint(async (req, res) => {
        const backup = req.body;
        assert(
            backup.format === 'astral-backup' &&
                backup.version === 1 &&
                Array.isArray(backup.files),
            'This is not an Astral backup.',
        );
        await restoreLegacy(backup, getStore(req), req.user.directories.root);
        res.json({ ok: true });
    }),
);
