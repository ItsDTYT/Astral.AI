import crypto from 'node:crypto';
import fs from 'node:fs';
import { imageSize } from 'image-size';
import { localEndpoint } from './models.js';
import { withSafeCardImports } from './import-security.js';
export const desktopCSP = {
    defaultSrc: ['\'self\''], scriptSrc: ['\'self\'', '\'unsafe-eval\'', '\'wasm-unsafe-eval\''],
    styleSrc: ['\'self\'', '\'unsafe-inline\''], imgSrc: ['\'self\'', 'data:', 'blob:'], fontSrc: ['\'self\'', 'data:'],
    connectSrc: ['\'self\''], workerSrc: ['\'self\'', 'blob:'], objectSrc: ['\'none\''], frameSrc: ['\'none\''],
    frameAncestors: ['\'none\''], baseUri: ['\'none\''], formAction: ['\'self\''], upgradeInsecureRequests: null,
};
export function desktopAccess({ token = process.env.ASTRAL_DESKTOP_TOKEN, origin = process.env.ASTRAL_DESKTOP_ORIGIN } = {}) {
    return (req, res, next) => {
        const provided = Buffer.from(String(req.headers['x-astral-desktop-token'] || ''));
        const expected = Buffer.from(token || '');
        if (!expected.length || expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) return res.status(401).json({ error: 'Open Astral through the desktop app.' });
        if (req.headers.origin && req.headers.origin !== origin) return res.status(403).json({ error: 'This request came from another application.' });
        const expectedHost = new URL(origin).host;
        if (req.headers.host !== expectedHost) return res.status(403).json({ error: 'Invalid local service host.' });
        next();
    };
}
export function desktopRoutes(req, res, next) {
    if (/^\/api\/(vector|extra\/(classify|caption)|speech)/.test(req.path)) return res.status(403).json({ error: 'This optional upstream feature is not included in Astral.' });
    const blocked = /^\/api\/(plugins|classify|caption|embeddings|vectors|transcribe|synthesize|extensions\/(install|update|delete|move|auto-update)|assets\/download|google|anthropic|novelai|openrouter|horde|sd|speech|tts|secrets\/(write|delete))/;
    if (blocked.test(req.path)) return res.status(403).json({ error: 'This feature is unavailable in the local desktop app.' });
    try {
        if (req.path.startsWith('/api/backends/chat-completions/') && req.body?.custom_url) localEndpoint(req.body.custom_url);
        if (req.path.startsWith('/api/backends/chat-completions/') && req.body?.chat_completion_source && req.body.chat_completion_source !== 'custom') return res.status(403).json({ error: 'Use a local OpenAI-compatible server in Models.' });
        if (req.path.startsWith('/api/backends/text-completions/') && req.body?.api_server) {
            localEndpoint(req.body.api_server);
            if (!['llamacpp', 'koboldcpp'].includes(req.body.api_type)) return res.status(403).json({ error: 'Choose a supported local model server.' });
        }
    } catch (error) { return res.status(400).json({ error: error.message }); }
    if (req.path.startsWith('/api/content-manager/')) return withSafeCardImports(next);
    next();
}
export function privateLogs() {
    const errorLog = console.error.bind(console);
    console.debug = console.log = console.info = () => {};
    console.warn = (...args) => errorLog('[Astral warning]', args.find(a => a instanceof Error)?.code || 'A service operation needs attention.');
    console.error = (...args) => {
        const error = args.find(a => a instanceof Error);
        errorLog('[Astral error]', error?.name || 'ServiceError', error?.code || 'See the message in the app.');
    };
}
export function desktopUpload(req, res, next) {
    if (!req.file || !/\.(png|jpe?g|webp)$/i.test(req.file.originalname)) return next();
    try {
        const size = imageSize(fs.readFileSync(req.file.path));
        if (!['png', 'jpg', 'webp'].includes(size.type) || size.width * size.height > 40_000_000) throw new Error('Choose a PNG, JPEG, or WebP image under 40 megapixels.');
        next();
    } catch {
        fs.rmSync(req.file.path, { force: true });
        res.status(400).json({ error: 'This image cannot be opened. Choose a PNG, JPEG, or WebP under 40 megapixels.' });
    }
}
