import fs from 'node:fs';
import path from 'node:path';
import webpack from 'webpack';
import getPublicLibConfig from '../../webpack.config.js';

const config = getPublicLibConfig({ forceDist: true });
const compiler = webpack(config);
await new Promise((resolve, reject) => compiler.run((error, stats) => {
    compiler.close(closeError => {
        if (error || closeError || stats?.hasErrors()) reject(error || closeError || new Error(stats.toString({ all: false, errors: true })));
        else resolve();
    });
}));
fs.mkdirSync('astral/resources', { recursive: true });
const artifact = path.join(config.output.path, config.output.filename);
fs.copyFileSync(artifact, 'astral/resources/upstream-lib.js');
console.log('Built pinned SillyTavern browser libraries for offline desktop startup.');
