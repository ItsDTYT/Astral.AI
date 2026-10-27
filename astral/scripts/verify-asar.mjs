import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import asar from '@electron/asar';
const archive = path.resolve(process.argv[2] || 'release/win-unpacked/resources/app.asar');
const { header, headerSize } = asar.getRawHeader(archive);
const bytes = fs.readFileSync(archive);
let checked = 0;
const failures = [];
function walk(node, prefix = '') {
    for (const [name, entry] of Object.entries(node.files || {})) {
        const file = prefix + name;
        if (entry.files) walk(entry, file + '/');
        else if (!entry.link) {
            if (!entry.integrity) throw new Error(`Missing ASAR integrity: ${file}`);
            const start = 8 + headerSize + Number(entry.offset || 0);
            const contents = entry.unpacked ? fs.readFileSync(path.join(archive + '.unpacked', ...file.split('/'))) : bytes.subarray(start, start + entry.size);
            if (contents.length !== entry.size || crypto.createHash('sha256').update(contents).digest('hex') !== entry.integrity.hash) failures.push(file);
            checked++;
        }
    }
}
walk(header);
if (failures.length) throw new Error(`ASAR input changed during packaging (${failures.length} files): ${failures.slice(0, 5).join(', ')}. Freeze build inputs and rebuild.`);
console.log(`Verified size and SHA-256 for ${checked} packaged ASAR files.`);
