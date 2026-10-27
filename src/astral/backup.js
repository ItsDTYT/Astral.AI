import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import archiver from 'archiver';
import yauzl from 'yauzl';
import { pipeline } from 'node:stream/promises';
import { assert, validateState } from './store.js';
import { safeArchiveName } from './runtimes.js';

export function validBackupPath(name) {
    return safeArchiveName(name) &&
        (name === 'state.json' || /^characters\/.+\.png$/i.test(name) || /^chats\/.+\.jsonl$/i.test(name) || /^astral\/assets\/[a-f0-9]{64}\.png$/.test(name));
}
export function streamBackup(res, store, directories) {
    const zip = archiver('zip', { zlib: { level: 3 } });
    res.attachment('Astral-backup.astral.zip');
    zip.on('error', e => res.destroy(e));
    res.on('close', () => { if (!res.writableFinished) zip.abort(); });
    zip.pipe(res);
    const state = structuredClone(store.state);
    state.settings.connection = { ...state.settings.connection, url: '', model: '' };
    zip.append(JSON.stringify({ format: 'astral-backup', version: 2, exportedAt: new Date().toISOString(), state }), { name: 'state.json' });
    const walk = (folder, prefix) => {
        if (!fs.existsSync(folder)) return;
        for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
            if (item.isSymbolicLink()) continue;
            const file = path.join(folder, item.name);
            const name = `${prefix}/${item.name}`;
            if (item.isDirectory()) walk(file, name);
            else if (validBackupPath(name)) zip.file(file, { name });
        }
    };
    walk(directories.characters, 'characters');
    walk(directories.chats, 'chats');
    walk(path.join(directories.root, 'astral', 'assets'), 'astral/assets');
    return zip.finalize();
}
export async function restoreZip(archive, store, root, dependencies = {}) {
    const copyFile = dependencies.copyFile || fsp.copyFile;
    const staging = await fsp.mkdtemp(path.join(os.tmpdir(), 'astral-restore-'));
    let state;
    const files = [];
    let preserveRecovery = false;
    try {
        await new Promise((resolve, reject) => yauzl.open(archive, { lazyEntries: true }, (error, zip) => {
            if (error) return reject(error);
            let total = 0, entries = 0;
            const names = new Set();
            const fail = e => { zip.close(); reject(e); };
            zip.on('error', fail);
            zip.on('end', resolve);
            zip.on('entry', async entry => {
                try {
                    assert(++entries <= 100000, 'Backup contains too many files.');
                    if (entry.fileName.endsWith('/')) { zip.readEntry(); return; }
                    assert(validBackupPath(entry.fileName) && !names.has(entry.fileName.toLowerCase()), 'Unsafe or duplicate file in backup.');
                    names.add(entry.fileName.toLowerCase());
                    assert(((entry.externalFileAttributes >>> 16) & 0xf000) !== 0xa000, 'Links are not allowed in backups.');
                    total += entry.uncompressedSize;
                    assert(total <= 4 * 1024 ** 3 && entry.uncompressedSize <= 256 * 1024 ** 2, 'Backup exceeds the 4 GB restore limit or contains an oversized file.');
                    const dest = path.join(staging, ...entry.fileName.split('/'));
                    await fsp.mkdir(path.dirname(dest), { recursive: true });
                    zip.openReadStream(entry, async (error, stream) => {
                        if (error) return fail(error);
                        try {
                            await pipeline(stream, fs.createWriteStream(dest));
                            if (entry.fileName === 'state.json') {
                                const manifest = JSON.parse(await fsp.readFile(dest, 'utf8'));
                                assert(manifest.format === 'astral-backup' && manifest.version === 2, 'Unsupported backup format.');
                                state = validateState(manifest.state);
                            } else {
                                if (entry.fileName.startsWith('astral/assets/')) {
                                    const hash = crypto.createHash('sha256');
                                    for await (const chunk of fs.createReadStream(dest)) hash.update(chunk);
                                    assert(path.basename(dest) === hash.digest('hex') + '.png', 'An image in the backup failed its integrity check.');
                                }
                                files.push({ source: dest, target: path.join(root, ...entry.fileName.split('/')) });
                            }
                            zip.readEntry();
                        } catch (e) { fail(e); }
                    });
                } catch (e) { fail(e); }
            });
            zip.readEntry();
        }));
        assert(state, 'Backup metadata is missing.');
        const stat = await fsp.statfs(root);
        const needed = (await Promise.all(files.map(f => fsp.stat(f.source)))).reduce((sum, item) => sum + item.size, 0);
        assert(Number(stat.bavail) * Number(stat.bsize) > needed + 128 * 1024 ** 2, 'Not enough free storage to restore this backup.');
        await fsp.copyFile(store.file, `${store.file}.before-restore-${Date.now()}.json`);
        const changes = [];
        try {
            for (const [index, file] of files.entries()) {
                await assertRestoreTarget(root, file.target);
                await fsp.mkdir(path.dirname(file.target), { recursive: true });
                const previous = fs.existsSync(file.target) ? path.join(staging, `previous-${index}`) : null;
                if (previous) await fsp.copyFile(file.target, previous);
                const temp = `${file.target}.astral-restore-${crypto.randomUUID()}.tmp`;
                try { await copyFile(file.source, temp, fs.constants.COPYFILE_EXCL); await fsp.rename(temp, file.target); changes.push({ target: file.target, previous }); } finally { await fsp.rm(temp, { force: true }); }
            }
            store.transact(next => { for (const key of Object.keys(next)) delete next[key]; Object.assign(next, state); });
        } catch (error) {
            const recoveryErrors = [];
            for (const change of changes.reverse()) {
                try {
                    if (change.previous) await fsp.copyFile(change.previous, change.target);
                    else await fsp.rm(change.target, { force: true });
                } catch (failure) { recoveryErrors.push(failure); }
            }
            if (recoveryErrors.length) {
                preserveRecovery = true;
                throw new Error(`Restore stopped and recovery needs attention. Original files are kept in ${staging}.`, { cause: new globalThis.AggregateError([error, ...recoveryErrors]) });
            }
            throw error;
        }
    } finally {
        assert(path.dirname(path.resolve(staging)) === path.resolve(os.tmpdir()) && path.basename(staging).startsWith('astral-restore-'), 'Unsafe restore staging path.');
        if (!preserveRecovery) await fsp.rm(staging, { recursive: true, force: true });
    }
}
export async function restoreLegacy(backup, store, root) {
    const archive = path.join(os.tmpdir(), `astral-legacy-${crypto.randomUUID()}.zip`);
    const zip = archiver('zip', { zlib: { level: 1 } });
    const output = fs.createWriteStream(archive, { flags: 'wx' });
    const completed = new Promise((resolve, reject) => { output.on('close', resolve); output.on('error', reject); zip.on('error', reject); });
    zip.pipe(output);
    zip.append(JSON.stringify({ format: 'astral-backup', version: 2, state: backup.state }), { name: 'state.json' });
    const names = new Set(); let size = 0;
    try {
        for (const file of backup.files) {
            assert(validBackupPath(file.path) && !names.has(file.path.toLowerCase()) && typeof file.base64 === 'string', 'Unsafe or duplicate file in backup.');
            names.add(file.path.toLowerCase());
            const data = Buffer.from(file.base64, 'base64'); size += data.length;
            assert(size < 200 * 1024 ** 2, 'Backup exceeds the 200 MB restore limit.');
            zip.append(data, { name: file.path });
        }
        await zip.finalize(); await completed;
        await restoreZip(archive, store, root);
    } finally {
        zip.abort(); output.destroy();
        await fsp.rm(archive, { force: true });
    }
}
export async function assertRestoreTarget(root, target) {
    const relative = path.relative(path.resolve(root), path.resolve(target));
    assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Restore target is outside the data folder.');
    let cursor = path.resolve(root);
    for (const part of relative.split(path.sep)) {
        cursor = path.join(cursor, part);
        try { const stat = await fsp.lstat(cursor); assert(!stat.isSymbolicLink(), 'A backup target contains a link or junction.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
}

