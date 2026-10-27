import fs from 'node:fs';
const profiles = [
    ['gemma-e2b-q4', 'gemma-4-E2B-it-GGUF', 'Q4_K_M', 4, 8, 2048],
    ['gemma-e4b-q4', 'gemma-4-E4B-it-GGUF', 'Q4_K_M', 6, 12, 4096],
    ['gemma-12b-iq4', 'gemma-4-12b-it-GGUF', 'IQ4_XS', 8, 16, 4096],
    ['gemma-12b-q4', 'gemma-4-12b-it-GGUF', 'Q4_K_M', 10, 16, 4096],
    ['gemma-12b-q6', 'gemma-4-12b-it-GGUF', 'Q6_K', 12, 16, 4096],
    ['gemma-26b-qat', 'gemma-4-26B-A4B-it-qat-GGUF', 'UD-Q4_K_XL', 16, 32, 8192],
    ['gemma-31b-q4', 'gemma-4-31B-it-GGUF', 'Q4_K_M', 24, 32, 8192],
    ['gemma-31b-q6', 'gemma-4-31B-it-GGUF', 'Q6_K', 32, 32, 8192],
    ['gemma-31b-q8', 'gemma-4-31B-it-GGUF', 'Q8_0', 48, 32, 16384],
];
const cache = new Map();
for (const [, repo] of profiles) if (!cache.has(repo)) {
    const response = await fetch(`https://huggingface.co/api/models/unsloth/${repo}?blobs=true`);
    if (!response.ok) throw new Error(`Metadata failed for ${repo}`);
    cache.set(repo, await response.json());
}
const fileRecord = (info, file, filename = file.rfilename) => {
    if (!file.lfs?.sha256 || !file.size) throw new Error(`Missing immutable metadata for ${file.rfilename}`);
    return { filename, sourceFilename: file.rfilename, bytes: file.size, sha256: file.lfs.sha256, url: `https://huggingface.co/${info.id}/resolve/${info.sha}/${file.rfilename}` };
};
const catalog = profiles.map(([id, repo, quant, tierGiB, minRamGiB, defaultContext]) => {
    const info = cache.get(repo);
    const file = info.siblings.find(f => f.rfilename.endsWith(`-${quant}.gguf`) && !f.rfilename.includes('/') && !f.rfilename.startsWith('mtp-'));
    const projector = info.siblings.find(f => f.rfilename === 'mmproj-F16.gguf');
    if (!file || !projector) throw new Error(`Missing quant or projector for ${id}`);
    const family = id.split('-').slice(0, 2).join('-');
    return { id, name: repo.replace(/-it(?:-qat)?-GGUF$/i, '').replace('gemma-4-', 'Gemma 4 '), repo: info.id, revision: info.sha,
        ...fileRecord(info, file), projector: fileRecord(info, projector, `${family}-mmproj-F16.gguf`),
        quant, tierGiB, minRamGiB, defaultContext, protocol: 'chat', template: 'gguf', capabilities: { vision: true },
        generation: { temperature: 1, topP: .95, topK: 64, minP: 0, repetitionPenalty: 1 },
        description: `Balanced ${tierGiB} GB graphics-memory starting profile. ${minRamGiB} GB system RAM recommended. Image support included.`,
        license: info.cardData?.license || 'apache-2.0', source: `https://huggingface.co/${info.id}`, researchedAt: '2026-10-25', fitConfidence: 'estimated',
        research: ['https://www.reddit.com/r/SillyTavernAI/comments/1wxsier/megathread_best_modelsapi_discussion_week_of/'],
    };
});
const file = 'astral/resources/models.lock.json';
const legacy = JSON.parse(fs.readFileSync(file)).filter(m => !m.id.startsWith('gemma-'));
fs.writeFileSync(file, JSON.stringify([...catalog, ...legacy], null, 2) + '\n');
console.log(`Pinned ${catalog.length} profiles and their vision projectors; retained ${legacy.length} existing options.`);
const release = await (await fetch('https://api.github.com/repos/ggml-org/llama.cpp/releases/tags/b11669')).json();
const vulkan = release.assets.find(a => a.name === 'llama-b11669-bin-win-vulkan-x64.zip');
if (!vulkan?.digest?.startsWith('sha256:')) throw new Error('Vulkan checksum unavailable.');
const lockFile = 'astral/resources/runner.lock.json';
const lock = JSON.parse(fs.readFileSync(lockFile));
if (!lock.artifacts.some(a => a.backend === 'vulkan')) lock.artifacts.push({ backend: 'vulkan', name: vulkan.name, sha256: vulkan.digest.slice(7) });
fs.writeFileSync(lockFile, JSON.stringify(lock, null, 2) + '\n');
