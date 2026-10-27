import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Transform, Readable } from 'node:stream';
import { assert } from './store.js';
import { cachedHardware, probeHardware } from './hardware.js';
import { RuntimeManager } from './runtimes.js';
import { registerRunner, forgetRunner } from './runner-access.js';

export function localEndpoint(value) {
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new Error('Enter a complete local URL, such as http://127.0.0.1:1234/v1.');
    }
    assert(
        url.protocol === 'http:' &&
            ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
            !url.username &&
            !url.password,
        'Only local HTTP model servers are supported.',
    );
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
}
export function hardware() {
    const resources = path.resolve(import.meta.dirname, '../../astral/resources');
    return probeHardware(resources, JSON.parse(fs.readFileSync(path.join(resources, 'models.lock.json'))));
}
export async function sha256(file) {
    const hash = crypto.createHash('sha256');
    for await (const b of fs.createReadStream(file)) hash.update(b);
    return hash.digest('hex');
}
export async function verifyGguf(file) {
    const handle = await fsp.open(file, 'r');
    try {
        const b = Buffer.alloc(8);
        await handle.read(b, 0, 8, 0);
        assert(
            b.toString('ascii', 0, 4) === 'GGUF' && b.readUInt32LE(4) >= 2,
            'This file is not a supported GGUF model.',
        );
    } finally {
        await handle.close();
    }
}
export async function freePort() {
    const s = net.createServer();
    await new Promise((resolve, reject) => {
        s.once('error', reject);
        s.listen(0, '127.0.0.1', resolve);
    });
    const port = s.address().port;
    await new Promise((resolve) => s.close(resolve));
    return port;
}
export class ModelManager {
    constructor(root, resourceRoot, dependencies = {}) {
        this.directory = path.join(root, 'astral', 'models');
        fs.mkdirSync(this.directory, { recursive: true });
        this.resources = resourceRoot;
        this.catalog = JSON.parse(fs.readFileSync(path.join(resourceRoot, 'models.lock.json'), 'utf8'));
        this.importsFile = path.join(this.directory, 'imports.json');
        this.imports = fs.existsSync(this.importsFile)
            ? JSON.parse(fs.readFileSync(this.importsFile, 'utf8'))
            : [];
        this.jobs = new Map();
        this.runner = null;
        this.operation = false;
        this.hardware = dependencies.hardware ?? (() => cachedHardware(this.catalog));
        this.runtimes = dependencies.runtimes || new RuntimeManager(root, resourceRoot);
        this.probeHardware = dependencies.hardware ? async () => dependencies.hardware() : () => probeHardware(resourceRoot, this.catalog, this.runtimes.root);
        this.statfs = dependencies.statfs ?? fsp.statfs;
        this.status = {
            state: 'stopped',
            url: '',
            modelId: '',
            error: '',
            backend: '',
            log: '',
        };
    }
    list() {
        const recommendation = this.hardware().recommendation;
        return [
            ...this.catalog.map(m => {
                const files = [m, ...(m.projector ? [m.projector] : [])];
                return { ...m, storagePath: path.join(this.directory, m.filename), weightBytes: m.bytes, bytes: files.reduce((n, f) => n + f.bytes, 0),
                    ready: files.every(f => fs.existsSync(path.join(this.directory, f.filename))),
                    downloaded: files.reduce((n, f) => { const file = path.join(this.directory, f.filename); return n + (fs.existsSync(file) ? f.bytes : fs.existsSync(file + '.part') ? fs.statSync(file + '.part').size : 0); }, 0),
                    recommended: m.id === recommendation.modelId,
                    ...(this.jobs.get(m.id)?.public ?? {}) };
            }),
            ...this.imports.map(m => ({ ...m, ready: fs.existsSync(m.path) && (!m.projectorPath || fs.existsSync(m.projectorPath)), imported: true })),
        ];
    }
    async download(modelId) {
        const model = this.catalog.find((m) => m.id === modelId);
        assert(model, 'Unknown model.');
        assert(![...this.jobs.values()].some(job => job.active), 'Finish or pause the current download first.');
        const files = [model, ...(model.projector ? [model.projector] : [])];
        assert(!files.every(f => fs.existsSync(path.join(this.directory, f.filename))), 'This model is already installed.');
        const controller = new AbortController();
        const job = {
            active: true,
            controller,
            public: { downloadState: 'downloading', downloaded: 0, error: '' },
        };
        this.jobs.set(modelId, job);
        const task = async () => {
            const storage = await this.statfs(this.directory);
            const remaining = files.reduce((sum, part) => {
                const file = path.join(this.directory, part.filename);
                return sum + (fs.existsSync(file) ? 0 : Math.max(0, part.bytes - (fs.existsSync(file + '.part') ? fs.statSync(file + '.part').size : 0)));
            }, 0);
            assert(Number(storage.bavail) * Number(storage.bsize) > remaining + 256 * 1024 ** 2, 'Not enough free storage for the model and its vision files.');
            let completed = 0;
            for (const part of files) {
                const target = path.join(this.directory, part.filename);
                if (fs.existsSync(target)) { completed += part.bytes; continue; }
                const partial = target + '.part';
                let offset = fs.existsSync(partial) ? fs.statSync(partial).size : 0;
                if (offset === part.bytes) {
                    job.public.downloadState = 'verifying';
                    assert((await sha256(partial)) === part.sha256, 'Checksum verification failed. Remove the partial file and download again.');
                    await verifyGguf(partial); await fsp.rename(partial, target);
                    completed += part.bytes; job.public.downloaded = completed; continue;
                }
                const stat = await this.statfs(this.directory);
                assert(
                    Number(stat.bavail) * Number(stat.bsize) > part.bytes - offset + 256 * 1024 ** 2,
                    'Not enough free storage for this model.',
                );
                const response = await fetch(part.url, {
                    headers: offset ? { Range: `bytes=${offset}-` } : {},
                    signal: controller.signal,
                });
                if (offset && response.status !== 206) offset = 0;
                assert(response.ok, `Download failed (${response.status}). Resume to try again.`);
                if (response.status === 206)
                    assert(
                        response.headers.get('content-range')?.startsWith(`bytes ${offset}-`),
                        'The server returned an unexpected download range.',
                    );
                job.public.downloaded = completed + offset;
                job.public.downloadState = 'downloading';
                await pipeline(
                    Readable.fromWeb(response.body),
                    new Transform({
                        transform(chunk, _, cb) {
                            job.public.downloaded += chunk.length;
                            cb(null, chunk);
                        },
                    }),
                    fs.createWriteStream(partial, { flags: offset ? 'a' : 'w' }),
                    { signal: controller.signal },
                );
                job.public.downloadState = 'verifying';
                assert(
                    fs.statSync(partial).size === part.bytes,
                    'The model download is incomplete. Resume to finish it.',
                );
                assert(
                    (await sha256(partial)) === part.sha256,
                    'Checksum verification failed. Remove the partial file and download again.',
                );
                await verifyGguf(partial);
                await fsp.rename(partial, target);
                completed += part.bytes;
                job.public.downloaded = completed;
            }
            job.public.downloadState = 'complete';
        };
        job.task = task()
            .catch((error) => {
                job.public.downloadState = controller.signal.aborted ? 'paused' : 'error';
                job.public.error = controller.signal.aborted ? '' : error.message;
            })
            .finally(() => {
                job.active = false;
            });
        return true;
    }
    async pause(modelId) {
        const job = this.jobs.get(modelId);
        if (job?.active) {
            job.controller.abort();
            await job.task;
            const model = this.catalog.find(m => m.id === modelId);
            if (model && job.public.downloadState === 'paused') {
                job.public.downloaded = [model, model.projector].filter(Boolean).reduce((total, file) => {
                    const target = path.join(this.directory, file.filename);
                    return total + (fs.existsSync(target) ? fs.statSync(target).size : fs.existsSync(target + '.part') ? fs.statSync(target + '.part').size : 0);
                }, 0);
            }
        }
        return true;
    }
    async remove(modelId) {
        assert(
            this.status.modelId !== modelId || this.status.state === 'stopped',
            'Stop the running model before removing it.',
        );
        await this.pause(modelId);
        const model = this.catalog.find((m) => m.id === modelId);
        if (model) {
            const files = [model];
            if (model.projector && !this.catalog.some(m => m.id !== modelId && m.projector?.filename === model.projector.filename && (fs.existsSync(path.join(this.directory, m.filename)) || this.jobs.get(m.id)?.active))) files.push(model.projector);
            for (const f of files) for (const suffix of ['', '.part']) await fsp.rm(path.join(this.directory, f.filename + suffix), { force: true });
        } else {
            this.imports = this.imports.filter((m) => m.id !== modelId);
            await fsp.writeFile(this.importsFile, JSON.stringify(this.imports));
        }
        this.jobs.delete(modelId);
        return true;
    }
    async importFile(file, projectorPath) {
        assert(path.isAbsolute(file) && /\.gguf$/i.test(file), 'Select a GGUF file.');
        await verifyGguf(file);
        const resolved = path.resolve(file);
        const checksum = await sha256(resolved);
        const known = this.catalog.find(m => m.sha256 === checksum);
        const old = this.imports.find((m) => m.path === resolved);
        if (old) {
            Object.assign(old, { sha256: checksum, familyId: known?.repo, canonicalModelId: known?.id });
            if (projectorPath) await this.setProjector(old.id, projectorPath);
            await fsp.writeFile(this.importsFile, JSON.stringify(this.imports));
            return old;
        }
        const model = {
            id: crypto.randomUUID(),
            name: path.basename(file, '.gguf'),
            filename: path.basename(file),
            path: resolved,
            bytes: (await fsp.stat(file)).size,
            sha256: checksum,
            familyId: known?.repo,
            canonicalModelId: known?.id,
            protocol: known?.protocol,
            template: known?.template || 'auto',
            quant: known?.quant || 'Imported',
            description: 'Linked GGUF. The original file remains where you selected it.',
        };
        this.imports.push(model);
        if (projectorPath) { await verifyGguf(projectorPath); model.projectorPath = path.resolve(projectorPath); model.protocol = 'chat'; model.capabilities = { vision: true }; }
        await fsp.writeFile(this.importsFile, JSON.stringify(this.imports));
        return model;
    }
    async setProjector(modelId, file) {
        assert(this.status.state === 'stopped' || this.status.modelId !== modelId, 'Stop the model before changing its vision file.');
        const model = this.imports.find(m => m.id === modelId);
        assert(model && path.isAbsolute(file), 'Select an imported model and a matching projector GGUF.');
        await verifyGguf(file);
        model.projectorPath = path.resolve(file); model.protocol = 'chat'; model.capabilities = { vision: true };
        await fsp.writeFile(this.importsFile, JSON.stringify(this.imports));
        return model;
    }
    async stop() {
        forgetRunner(this.status?.url);
        this.runVersion = (this.runVersion || 0) + 1;
        const proc = this.runner;
        this.runner = null;
        if (proc) {
            proc.kill();
            await Promise.race([
                new Promise((resolve) => proc.once('exit', resolve)),
                new Promise((resolve) => setTimeout(resolve, 3000)),
            ]);
            if (proc.exitCode === null) proc.kill('SIGKILL');
        }
        this.status = {
            state: 'stopped',
            url: '',
            modelId: '',
            error: '',
            backend: '',
            log: '',
        };
        return true;
    }
    async start(modelId, options = {}) {
        assert(!this.operation, 'A model is already starting or stopping.');
        this.operation = true;
        try {
            await this.stop();
            const runVersion = this.runVersion;
            const model =
                this.catalog.find((m) => m.id === modelId) ?? this.imports.find((m) => m.id === modelId);
            assert(model, 'Unknown model.');
            const file = model.path ?? path.join(this.directory, model.filename);
            assert(fs.existsSync(file), 'Download or import this model first.');
            await verifyGguf(file);
            const machine = await this.probeHardware();
            if (this.runVersion !== runVersion) return this.status;
            assert(!model.minRamGiB || machine.totalGiB >= model.minRamGiB, 'This profile needs more system RAM. Choose a smaller recommendation or import a custom GGUF.');
            const gpuLayers = Math.max(
                0,
                Math.min(
                    99,
                    Number.isFinite(Number(options.gpuLayers))
                        ? Number(options.gpuLayers)
                        : machine.recommendation.gpuLayers,
                ),
            );
            const backend = gpuLayers > 0 && machine.gpu ? (machine.gpu.backend || 'cuda') : 'cpu';
            const nativeRoot = await this.runtimes.verify(backend);
            if (this.runVersion !== runVersion) return this.status;
            const executable = path.join(nativeRoot, 'llama-server.exe');
            assert(
                fs.existsSync(executable),
                'Bundled runner is missing. Run npm run astral:prepare-runner, or connect an existing local server.',
            );
            const port = await freePort();
            const args = [
                '--alias', modelId,
                '--model',
                file,
                '--host',
                '127.0.0.1',
                '--port',
                String(port),
                '--ctx-size',
                String(
                    Math.max(
                        1024,
                        Math.min(32768, Number(options.context) || model.defaultContext || machine.recommendation.context),
                    ),
                ),
                '--n-gpu-layers',
                String(executable.includes(`${path.sep}cpu${path.sep}`) ? 0 : gpuLayers === 99 ? 'auto' : gpuLayers),
                '--parallel',
                '1',
                '--threads',
                String(Math.max(1, Math.min(os.availableParallelism(), 8))),
                '--no-webui',
                '--jinja',
            ];
            const projector = model.projectorPath || (model.projector ? path.join(this.directory, model.projector.filename) : '');
            if (projector) {
                assert(fs.existsSync(projector), 'Download or link the matching vision projector first.');
                await verifyGguf(projector);
                args.push('--mmproj', projector, '--image-max-tokens', '560');
                if (!machine.gpu || machine.gpu.totalMiB <= 8192 || machine.gpu.freeMiB < (model.bytes + (model.projector?.bytes || 0)) / 1024 ** 2 + 1024) args.push('--no-mmproj-offload');
            }
            args.push('--fit', 'on', '--fit-ctx', '2048', '--fit-target', String(Math.ceil(Math.max(768, (machine.gpu?.totalMiB || 0) * .1))));
            if (backend !== 'cpu' && machine.gpu?.device) args.push('--device', machine.gpu.device);
            if (model.template === 'chatml') args.push('--chat-template', 'chatml');
            if (runVersion !== this.runVersion) return this.status;
            const runnerKey = crypto.randomBytes(32).toString('hex');
            registerRunner(`http://127.0.0.1:${port}`, runnerKey);
            args.push('--cors-origins', process.env.ASTRAL_DESKTOP_ORIGIN || 'http://astral.invalid', '--no-cors-credentials');
            const proc = spawn(executable, args, {
                windowsHide: true,
                cwd: path.dirname(executable),
                stdio: ['ignore', 'pipe', 'pipe'],
                env: { ...process.env, LLAMA_API_KEY: runnerKey },
            });
            this.runner = proc;
            this.status = {
                state: 'loading',
                modelId,
                url: `http://127.0.0.1:${port}`,
                backend: executable.includes(`${path.sep}cpu${path.sep}`) ? 'cpu' : backend,
                capabilities: { vision: !!model.projector || !!model.projectorPath },
                protocol: model.protocol || 'completion',
                generation: model.generation,
                context: Math.max(1024, Math.min(32768, Number(options.context) || model.defaultContext || machine.recommendation.context)),
                error: '',
                log: '',
            };
            const collect = (b) => {
                this.status.log = (this.status.log + b.toString()).slice(-7000);
            };
            proc.stdout.on('data', collect);
            proc.stderr.on('data', collect);
            proc.on('error', (e) => {
                if (this.runner === proc) forgetRunner(this.status.url);
                if (this.runner === proc)
                    this.status = {
                        ...this.status,
                        state: 'error',
                        error: e.message,
                    };
            });
            proc.on('exit', (code) => {
                if (this.runner === proc) {
                    forgetRunner(this.status.url);
                    this.runner = null;
                    if (!options.recovered && backend !== 'cpu' && /out of memory|cuda.*alloc|failed to allocate|device.*error/i.test(this.status.log)) {
                        this.status = { ...this.status, state: 'loading', error: 'Retrying once with a smaller memory budget.' };
                        setTimeout(() => { if (!this.runner && this.runVersion === runVersion) void this.start(modelId, { ...options, gpuLayers: Math.max(0, Math.floor(gpuLayers / 2)), context: 2048, recovered: true }).catch(error => { this.status.state = 'error'; this.status.error = error.message; }); }, 100);
                        return;
                    }
                    this.status = {
                        ...this.status,
                        state: 'error',
                        error: /out of memory|cuda.*alloc|failed to allocate/i.test(this.status.log)
                            ? 'Not enough GPU memory. Reduce GPU layers or context, or select CPU in Advanced.'
                            : `The runner exited (${code}). Open diagnostics for details.`,
                    };
                }
            });
            const check = async () => {
                const deadline = Date.now() + 300000;
                while (this.runner === proc && this.status.state === 'loading' && Date.now() < deadline) {
                    try {
                        const r = await fetch(`${this.status.url}/health`, {
                            headers: { Authorization: `Bearer ${runnerKey}` },
                            signal: AbortSignal.timeout(2000),
                        });
                        if (r.ok && this.runner === proc && this.runVersion === runVersion) {
                            this.status.state = 'ready';
                            return;
                        }
                    } catch {
                        /* Model is still loading. */
                    }
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                }
                if (this.runner === proc && this.status.state === 'loading') {
                    proc.kill();
                    this.status.state = 'error';
                    this.status.error = 'Model loading timed out. Try a smaller context or CPU mode.';
                }
            };
            void check();
            return this.status;
        } finally {
            this.operation = false;
        }
    }
    async shutdown() {
        await this.stop();
        await Promise.all([...this.jobs.keys()].map((key) => this.pause(key)));
        await this.runtimes.shutdown();
    }
}
