import fs from 'node:fs';
import path from 'node:path';
const seen = new Set();
const notices = [];
function walk(folder) {
    if (!fs.existsSync(folder)) return;
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('@')) {
            walk(path.join(folder, entry.name));
            continue;
        }
        const root = path.join(folder, entry.name);
        const pkg = path.join(root, 'package.json');
        if (!fs.existsSync(pkg)) continue;
        const p = JSON.parse(fs.readFileSync(pkg, 'utf8'));
        const key = `${p.name}@${p.version}`;
        if (!seen.has(key)) {
            seen.add(key);
            const files = fs
                .readdirSync(root)
                .filter((n) => /^(license|licence|copying|notice)(\.|$|-)/i.test(n));
            notices.push(
                `\n${'='.repeat(80)}\n${key}\nLicense: ${p.license || 'See package notices'}\n${p.homepage || ''}\n${files
                    .map((n) => {
                        const file = path.join(root, n);
                        return fs.statSync(file).isFile() ? `\n${n}\n${fs.readFileSync(file, 'utf8')}` : '';
                    })
                    .join('\n')}`,
            );
        }
        walk(path.join(root, 'node_modules'));
    }
}
walk('node_modules');
fs.mkdirSync('astral/licenses', { recursive: true });
fs.writeFileSync(
    'astral/licenses/DEPENDENCY-LICENSES.txt',
    'Installed dependency notices. Build-time dependencies are included conservatively.\n' +
        notices.sort().join('\n'),
);
const response = await fetch('https://raw.githubusercontent.com/ggml-org/llama.cpp/b11669/LICENSE');
if (!response.ok) throw new Error('llama.cpp license could not be retrieved.');
fs.writeFileSync('astral/licenses/llama.cpp-LICENSE.txt', await response.text());
console.log(`Collected notices for ${seen.size} package versions.`);
