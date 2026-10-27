import fs from 'node:fs';
import path from 'node:path';

// The pinned @jsquash Emscripten builds leave readBinary undefined in Node.
// Route Node's WASM loading through SillyTavern's restricted file-fetch adapter,
// just as the same factories already do in browsers and workers.
const root = path.resolve('node_modules/@jsquash');
let patched = 0;
function walk(directory) {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (entry.name.endsWith('.js')) {
            const original = fs.readFileSync(file, 'utf8');
            if (!original.includes('var ENVIRONMENT_IS_NODE=')) continue;
            const updated = original.replaceAll('(ENVIRONMENT_IS_WEB||ENVIRONMENT_IS_WORKER)', '(ENVIRONMENT_IS_WEB||ENVIRONMENT_IS_WORKER||ENVIRONMENT_IS_NODE)');
            if (updated !== original) { fs.writeFileSync(file, updated); patched++; }
        }
    }
}
walk(root);
console.log(`Astral image codec compatibility: ${patched} factory files updated.`);
