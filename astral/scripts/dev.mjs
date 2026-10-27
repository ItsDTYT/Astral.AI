import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
const data =
    process.env.ASTRAL_DATA_ROOT || path.join(process.env.APPDATA || os.homedir(), 'Astral.AI', 'data');
const config = path.join(path.dirname(data), 'config.yaml');
fs.mkdirSync(path.dirname(config), { recursive: true });
if (!fs.existsSync(config)) fs.copyFileSync('default/config.yaml', config);
process.argv = [
    process.execPath,
    path.resolve('server.js'),
    '--dataRoot',
    data,
    '--configPath',
    config,
    '--port',
    process.env.ASTRAL_PORT || '8000',
    '--listen',
    'false',
    '--browserLaunchEnabled',
    'false',
];
await import('../../server.js');
