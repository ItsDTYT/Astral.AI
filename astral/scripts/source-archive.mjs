import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import archiver from 'archiver';
const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
fs.mkdirSync('release', { recursive: true });
const destination = fs.createWriteStream(`release/Astral.AI-${version}-source.zip`);
const zip = archiver('zip', { zlib: { level: 6 } });
zip.pipe(destination);
const completed = new Promise((resolve, reject) => {
    destination.on('close', resolve);
    destination.on('error', reject);
    zip.on('error', reject);
});
let files;
try {
    files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
        maxBuffer: 20 * 1024 ** 2,
    })
        .toString()
        .split('\0')
        .filter(Boolean);
} catch {
    // A corresponding-source ZIP does not include the original .git directory.
    files = [];
    const walk = (folder = '') => {
        for (const entry of fs.readdirSync(folder || '.', { withFileTypes: true })) {
            const file = path.posix.join(folder, entry.name);
            if (
                entry.isSymbolicLink() ||
                /(^|\/)(node_modules|release|\.git|\.cache|test-output|data|backups)(\/|$)/.test(file) ||
                file.startsWith('astral/resources/runner/') ||
                file === 'config.yaml'
            )
                continue;
            if (entry.isDirectory()) walk(file);
            else files.push(file);
        }
    };
    walk();
}
for (const file of files)
    if (!/^\.(?:taste-skill|agents)\//.test(file) && !file.startsWith('design-system/') && fs.existsSync(file) && fs.statSync(file).isFile()) zip.file(file, { name: `Astral.AI/${file}` });
await zip.finalize();
await completed;
console.log(`Created release/Astral.AI-${version}-source.zip`);
