import fs from 'node:fs';
const entries = [];
for (const [slug, repo, name, template, description] of [
    [
        'angelic',
        'mradermacher/Angelic_Eclipse_12B-i1-GGUF',
        'Angelic Eclipse 12B',
        'chatml',
        'Thoughtful, grounded roleplay. Suggested starting point for Normal mode.',
    ],
    [
        'forgotten',
        'mradermacher/Forgotten-Safeword-12B-v4.0-i1-GGUF',
        'Forgotten Safeword 12B',
        'auto',
        'An adult roleplay model. Uses its GGUF instruction metadata.',
    ],
]) {
    const response = await fetch(`https://huggingface.co/api/models/${repo}?blobs=true`);
    if (!response.ok) throw new Error(`Model metadata: ${response.status}`);
    const data = await response.json();
    for (const quant of ['IQ4_XS', 'Q4_K_M']) {
        const file = data.siblings.find((f) => f.rfilename.endsWith(`-${quant}.gguf`));
        if (!file?.lfs?.sha256 || !file.lfs.size)
            throw new Error(`Missing integrity metadata for ${repo} ${quant}`);
        entries.push({
            id: `${slug}-${quant.toLowerCase()}`,
            name,
            repo,
            revision: data.sha,
            filename: file.rfilename,
            quant,
            bytes: file.lfs.size,
            sha256: file.lfs.sha256,
            url: `https://huggingface.co/${repo}/resolve/${data.sha}/${file.rfilename}`,
            template,
            description,
            license: 'Apache-2.0',
            source: `https://huggingface.co/${repo}`,
        });
    }
}
fs.writeFileSync('astral/resources/models.lock.json', JSON.stringify(entries, null, 2) + '\n');
console.log(`Pinned ${entries.length} GGUF artifacts with revision, byte size and SHA-256.`);
