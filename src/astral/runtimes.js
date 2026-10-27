import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import yauzl from 'yauzl';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
async function digest(file) { const hash = crypto.createHash('sha256'); for await (const chunk of fs.createReadStream(file)) hash.update(chunk); return hash.digest('hex'); }
function check(condition, message) { if (!condition) throw new Error(message); }
export function safeArchiveName(name) {
    return typeof name === 'string' && name.length <= 240 && !name.includes('\\') && name.split('/').every(p => p && p !== '.' && p !== '..' && !/[\x00-\x1f:<>"|?*]/.test(p) && !/[. ]$/.test(p) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p));
}
export class RuntimeManager {
    constructor(root, resources, dependencies = {}) {
        this.lock = dependencies.lock || JSON.parse(fs.readFileSync(path.join(resources, 'runner.lock.json')));
        this.root = path.join(root, 'astral', 'runtimes', this.lock.version);
        this.bundled = dependencies.bundled || process.env.ASTRAL_RUNNER_ROOT || path.join(resources, 'runner');
        this.jobs = new Map(); this.fetch = dependencies.fetch || fetch; this.verified = new Map();
        this.execute = dependencies.execute || execute;
    }
    location(backend) {
        check(['cpu', 'cuda', 'vulkan'].includes(backend), 'Unknown runtime.');
        const cached = path.join(this.root, backend);
        if (fs.existsSync(path.join(cached, 'verified.json')) && fs.existsSync(path.join(cached, 'llama-server.exe'))) return cached;
        const bundled = path.join(this.bundled, backend);
        if (fs.existsSync(path.join(bundled, 'llama-server.exe'))) return bundled;
        return null;
    }
    list() {
        return ['cpu', 'cuda', 'vulkan'].map(backend => ({ backend, version: this.lock.version,
            state: this.location(backend) ? 'ready' : 'missing', downloaded: 0,
            total: this.lock.artifacts.filter(a => a.backend === backend).reduce((n, a) => n + (a.bytes || 0), 0),
            ...(this.jobs.get(backend)?.public || {}),
        }));
    }
    async verify(backend) {
        const folder = this.location(backend); check(folder, `Install ${backend.toUpperCase()} support in Models first.`);
        const manifestFile = path.join(folder, 'verified.json');
        if (!fs.existsSync(manifestFile)) return folder; // Bundled assets are part of the release's integrity-checked payload.
        const manifest = JSON.parse(await fsp.readFile(manifestFile, 'utf8'));
        check(manifest.version === this.lock.version, 'The runtime version does not match this app. Reinstall GPU support.');
        const artifacts = this.lock.artifacts.filter(a => a.backend === backend);
        check(artifacts.every(a => manifest.archives?.[a.name] === a.sha256), 'The runtime manifest is not trusted. Reinstall GPU support.');
        for (const [name, expected] of Object.entries(manifest.files || {})) {
            check(safeArchiveName(name) && !name.includes('/'), 'Invalid runtime file.');
            const file = path.join(folder, name), stat = await fsp.stat(file);
            const key = `${file}:${stat.size}:${stat.mtimeMs}`;
            if (!this.verified.has(key)) { check(await digest(file) === expected, 'A runtime file changed. Reinstall GPU support.'); this.verified.set(key, true); }
        }
        return folder;
    }
    async download(backend) {
        check(['cuda', 'vulkan'].includes(backend), 'CPU support is already included.');
        check(![...this.jobs.values()].some(j => j.active), 'Finish or pause the current runtime download first.');
        check(!this.location(backend), 'This runtime is already available.');
        const assets = this.lock.artifacts.filter(a => a.backend === backend);
        const controller = new AbortController();
        const job = { active: true, controller, public: { state: 'downloading', downloaded: 0, error: '' } };
        this.jobs.set(backend, job);
        job.task = (async () => {
            await fsp.mkdir(this.root, { recursive: true });
            const cache = path.join(this.root, 'downloads'); await fsp.mkdir(cache, { recursive: true });
            const stat = await fsp.statfs(this.root);
            check(Number(stat.bavail) * Number(stat.bsize) > assets.reduce((n, a) => n + (a.bytes || 0), 0) + 2 * 1024 ** 3, 'Not enough storage to download and unpack GPU support.');
            let completed = 0;
            for (const asset of assets) {
                controller.signal.throwIfAborted();
                const target = path.join(cache, asset.name), partial = target + '.part';
                if (fs.existsSync(target) && await digest(target) === asset.sha256) { completed += asset.bytes; job.public.downloaded = completed; continue; }
                let offset = fs.existsSync(partial) ? fs.statSync(partial).size : 0;
                if (offset !== asset.bytes) {
                    const response = await this.fetch(asset.url || `https://github.com/ggml-org/llama.cpp/releases/download/${this.lock.version}/${asset.name}`, { headers: offset ? { Range: `bytes=${offset}-` } : {}, signal: controller.signal });
                    check(response.ok, `GPU support download failed (${response.status}).`);
                    if (response.status !== 206) offset = 0;
                    else check(response.headers.get('content-range')?.startsWith(`bytes ${offset}-`), 'The download server returned an invalid resume range.');
                    job.public.downloaded = completed + offset; job.public.state = 'downloading';
                    await pipeline(Readable.fromWeb(response.body), new Transform({ transform(chunk, _, callback) { job.public.downloaded += chunk.length; if (job.public.downloaded > completed + asset.bytes) callback(new Error('Runtime download exceeds its pinned size.')); else callback(null, chunk); } }), fs.createWriteStream(partial, { flags: offset ? 'a' : 'w' }), { signal: controller.signal });
                }
                job.public.state = 'verifying'; controller.signal.throwIfAborted();
                check(fs.statSync(partial).size === asset.bytes && await digest(partial) === asset.sha256, 'Runtime integrity check failed. Remove the partial download and try again.');
                await fsp.rename(partial, target); completed += asset.bytes; job.public.downloaded = completed;
            }
            const staging = await fsp.mkdtemp(path.join(this.root, `${backend}-staging-`));
            try {
                job.public.state = 'installing';
                for (const asset of assets) { controller.signal.throwIfAborted(); await this.extract(path.join(cache, asset.name), staging, controller.signal); }
                const cpu = this.location('cpu');
                if (cpu) for (const name of fs.readdirSync(cpu).filter(n => /^(vcruntime|msvcp|concrt).*\.dll$/i.test(n))) await fsp.copyFile(path.join(cpu, name), path.join(staging, name));
                const hashes = {};
                for (const name of fs.readdirSync(staging)) hashes[name] = await digest(path.join(staging, name));
                check(hashes['llama-server.exe'], 'The runtime is missing its server executable.');
                if (process.platform === 'win32') await this.execute(path.join(staging, 'llama-server.exe'), ['--version'], { windowsHide: true, timeout: 15000, cwd: staging, signal: controller.signal });
                await fsp.writeFile(path.join(staging, 'verified.json'), JSON.stringify({ version: this.lock.version, archives: Object.fromEntries(assets.map(a => [a.name, a.sha256])), files: hashes }));
                controller.signal.throwIfAborted();
                await fsp.rename(staging, path.join(this.root, backend));
                job.public.state = 'ready';
            } finally {
                check(path.dirname(path.resolve(staging)) === path.resolve(this.root) && path.basename(staging).startsWith(`${backend}-staging-`), 'Unsafe runtime staging path.');
                await fsp.rm(staging, { force: true, recursive: true });
            }
        })().catch(error => { job.public.state = controller.signal.aborted ? 'paused' : 'error'; job.public.error = controller.signal.aborted ? '' : error.message; }).finally(() => { job.active = false; });
        return true;
    }
    async extract(archive, destination, signal) {
        await new Promise((resolve, reject) => yauzl.open(archive, { lazyEntries: true }, (error, zip) => {
            if (error) return reject(error);
            let total = 0, count = 0; const names = new Set();
            const fail = e => { zip.close(); reject(e); };
            zip.on('error', fail); zip.on('end', resolve);
            zip.on('entry', async entry => {
                try {
                    signal.throwIfAborted();
                    if (entry.fileName.endsWith('/')) { zip.readEntry(); return; }
                    check(safeArchiveName(entry.fileName) && ++count <= 1000 && ((entry.externalFileAttributes >>> 16) & 0xf000) !== 0xa000, 'Unsafe runtime archive.');
                    total += entry.uncompressedSize; check(total <= 2 * 1024 ** 3 && entry.uncompressedSize <= 1024 ** 3, 'Runtime archive is too large.');
                    const name = path.basename(entry.fileName);
                    if (!/\.(dll|exe)$/i.test(name) && !/license|notice|copying/i.test(name)) { zip.readEntry(); return; }
                    check(!names.has(name.toLowerCase()), 'Runtime archive has duplicate files.'); names.add(name.toLowerCase());
                    zip.openReadStream(entry, async (error, stream) => {
                        if (error) return fail(error);
                        try { await pipeline(stream, fs.createWriteStream(path.join(destination, name)), { signal }); zip.readEntry(); } catch (e) { fail(e); }
                    });
                } catch (e) { fail(e); }
            }); zip.readEntry();
        }));
    }
    async pause(backend) { const job = this.jobs.get(backend); if (job?.active) { job.controller.abort(); await job.task; } }
    async discard(backend) { await this.pause(backend); for (const asset of this.lock.artifacts.filter(a => a.backend === backend)) await fsp.rm(path.join(this.root, 'downloads', asset.name + '.part'), { force: true }); this.jobs.delete(backend); }
    async shutdown() { await Promise.all([...this.jobs.keys()].map(key => this.pause(key))); }
}
