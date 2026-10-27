import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import yauzl from 'yauzl';
import { sha256 } from '../../src/astral/models.js';
const lock = JSON.parse(fs.readFileSync('astral/resources/runner.lock.json', 'utf8'));
const requested = process.argv.includes('--backend') ? process.argv[process.argv.indexOf('--backend') + 1] : 'cpu';
if (!['cpu', 'cuda', 'vulkan', 'all'].includes(requested)) throw new Error('Use --backend cpu, cuda, vulkan, or all.');
const artifacts = lock.artifacts.filter(asset => requested === 'all' || asset.backend === requested);
const root = path.resolve('astral/resources/runner');
fs.mkdirSync(root, { recursive: true });
const cache = path.resolve('.cache/astral-runner');
fs.mkdirSync(cache, { recursive: true });
for (const asset of artifacts) {
    const archive = path.join(cache, asset.name);
    if (!fs.existsSync(archive) || (await sha256(archive)) !== asset.sha256) {
        console.log(`Downloading ${asset.name}…`);
        const response = await fetch(
            `https://github.com/ggml-org/llama.cpp/releases/download/${lock.version}/${asset.name}`,
        );
        if (!response.ok) throw new Error(`Runner download failed (${response.status}).`);
        await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(archive + '.part'));
        if ((await sha256(archive + '.part')) !== asset.sha256)
            throw new Error(`Runner checksum mismatch: ${asset.name}`);
        await fsp.rename(archive + '.part', archive);
    }
    console.log(`Verified ${asset.name}. Extracting ${asset.backend}…`);
    await new Promise((resolve, reject) =>
        yauzl.open(archive, { lazyEntries: true }, (error, zip) => {
            if (error) return reject(error);
            zip.on('error', reject);
            zip.on('end', resolve);
            zip.on('entry', (entry) => {
                if (/\/$/.test(entry.fileName)) return zip.readEntry();
                const name = path.basename(entry.fileName);
                if (!/\.(exe|dll|txt|md|json)$/i.test(name) && !/license|copying|notice/i.test(name))
                    return zip.readEntry();
                const dest = path.join(root, asset.backend, name);
                fs.mkdirSync(path.dirname(dest), { recursive: true });
                zip.openReadStream(entry, async (error, stream) => {
                    if (error) return reject(error);
                    try {
                        await pipeline(stream, fs.createWriteStream(dest));
                        zip.readEntry();
                    } catch (e) {
                        reject(e);
                    }
                });
            });
            zip.readEntry();
        }),
    );
}
fs.copyFileSync('astral/resources/runner.lock.json', path.join(root, 'manifest.json'));
// App-local MSVC libraries avoid requiring a separate runtime install on users' PCs.
// Source builders on Windows need the Microsoft Visual C++ 2015–2022 x64 runtime.
const system = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
const runtimeFiles = [
    'vcruntime140.dll',
    'vcruntime140_1.dll',
    'msvcp140.dll',
    'msvcp140_1.dll',
    'msvcp140_2.dll',
    'msvcp140_atomic_wait.dll',
    'msvcp140_codecvt_ids.dll',
    'concrt140.dll',
];
const runtimeManifest = [];
for (const name of runtimeFiles) {
    const source = path.join(system, name);
    if (!fs.existsSync(source)) {
        if (['vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll'].includes(name))
            throw new Error(
                `Install the Microsoft Visual C++ 2015–2022 x64 runtime on the build machine before packaging (${name} missing).`,
            );
        continue;
    }
    for (const backend of artifacts.map(asset => asset.backend)) fs.copyFileSync(source, path.join(root, backend, name));
    runtimeManifest.push({ name, sha256: await sha256(source) });
}
fs.writeFileSync(path.join(root, 'msvc-runtime.json'), JSON.stringify(runtimeManifest, null, 2));
console.log(`Prepared ${requested} ${lock.version} runner support.`);
