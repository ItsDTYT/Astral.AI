import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const folder = path.resolve('release');
const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
const files = fs
    .readdirSync(folder)
    .filter((name) => name.startsWith(`Astral.AI-${version}-`) && /(?:-setup\.exe|-portable\.(?:exe|zip)|-source\.zip)$/.test(name))
    .sort();
if (!files.length) throw new Error('No release artifacts found.');
const lines = [];
for (const name of files) {
    const hash = createHash('sha256');
    for await (const chunk of fs.createReadStream(path.join(folder, name))) hash.update(chunk);
    lines.push(`${hash.digest('hex')}  ${name}`);
}
fs.writeFileSync(path.join(folder, 'SHA256SUMS.txt'), lines.join('\n') + '\n');
console.log(`Wrote checksums for ${files.length} release artifacts.`);
