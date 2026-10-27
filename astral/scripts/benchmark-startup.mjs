import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
const executable = path.resolve(process.argv[2]);
const data = path.resolve(process.argv[3]);
const result = [];
for (const run of ['first-data-launch', 'warm-data-launch']) {
    const started = Date.now(); let output = '';
    const child = spawn(executable, process.argv.slice(4), { windowsHide: true, env: { ...process.env, PATH: `${process.env.SystemRoot}\\System32;${process.env.SystemRoot}`, ASTRAL_TEST_USER_DATA: data, ASTRAL_SMOKE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => child.kill(), 180000);
    child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; });
    const code = await new Promise(resolve => child.on('exit', resolve)); clearTimeout(timer);
    const timings = output.split(/\r?\n/).filter(line => line.startsWith('{"event":')).map(line => JSON.parse(line));
    const record = { run, code, elapsedMs: Date.now() - started, ready: output.includes('ASTRAL_DESKTOP_READY'), timings };
    result.push(record); console.log(JSON.stringify(record));
    fs.mkdirSync(data, { recursive: true }); fs.writeFileSync(path.join(data, `${run}.log`), output);
    if (!record.ready) { process.exitCode = 1; break; }
}
fs.writeFileSync(path.join(data, 'benchmark.json'), JSON.stringify({ executable, result }, null, 2));
