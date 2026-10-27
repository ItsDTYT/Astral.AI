import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { ModelManager } from '../../src/astral/models.js';
async function fixture(t, dependencies = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astral-download-test-'));
    const payload = Buffer.alloc(1024 * 1024, 65);
    payload.write('GGUF');
    payload.writeUInt32LE(3, 4);
    const received = [];
    const server = http.createServer((req, res) => {
        const range = req.headers.range;
        received.push(range ?? 'full');
        const offset = range ? Number(range.match(/\d+/)[0]) : 0;
        res.writeHead(offset ? 206 : 200, {
            'Content-Length': payload.length - offset,
            ...(offset
                ? {
                      'Content-Range': `bytes ${offset}-${payload.length - 1}/${payload.length}`,
                  }
                : {}),
        });
        if (req.url === '/slow') {
            let position = offset;
            const timer = setInterval(() => {
                if (position >= payload.length) {
                    clearInterval(timer);
                    res.end();
                } else {
                    res.write(payload.subarray(position, position + 8192));
                    position += 8192;
                }
            }, 10);
            res.on('close', () => clearInterval(timer));
        } else res.end(payload.subarray(offset));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const manager = new ModelManager(root, path.resolve('astral/resources'), dependencies);
    manager.catalog = [
        {
            id: 'test',
            name: 'Test GGUF',
            filename: 'test.gguf',
            bytes: payload.length,
            sha256: crypto.createHash('sha256').update(payload).digest('hex'),
            url: `http://127.0.0.1:${server.address().port}/file`,
        },
    ];
    t.after(async () => {
        await manager.shutdown();
        await new Promise((resolve) => server.close(resolve));
        fs.rmSync(root, { recursive: true, force: true });
    });
    return { manager, payload, received };
}
test('resumes a partial download with Range and verifies the complete file', async (t) => {
    const { manager, payload, received } = await fixture(t);
    fs.writeFileSync(path.join(manager.directory, 'test.gguf.part'), payload.subarray(0, 16384));
    await manager.download('test');
    await manager.jobs.get('test').task;
    assert.equal(received[0], 'bytes=16384-');
    assert.equal(manager.list()[0].ready, true);
    assert.deepEqual(fs.readFileSync(path.join(manager.directory, 'test.gguf')), payload);
});
test('a checksum mismatch never becomes a loadable model', async (t) => {
    const { manager } = await fixture(t);
    manager.catalog[0].sha256 = '0'.repeat(64);
    await manager.download('test');
    await manager.jobs.get('test').task;
    assert.equal(manager.list()[0].ready, false);
    assert.match(manager.list()[0].error, /Checksum/);
    assert.equal(fs.existsSync(path.join(manager.directory, 'test.gguf')), false);
});
test('insufficient storage fails before a network request', async (t) => {
    const { manager, received } = await fixture(t, {
        statfs: async () => ({ bavail: 1, bsize: 4096 }),
    });
    await manager.download('test');
    await manager.jobs.get('test').task;
    assert.equal(received.length, 0);
    assert.match(manager.list()[0].error, /storage/);
});
test('pausing keeps partial data and a subsequent request resumes successfully', async (t) => {
    const { manager, received } = await fixture(t);
    manager.catalog[0].url = manager.catalog[0].url.replace('/file', '/slow');
    await manager.download('test');
    const deadline = Date.now() + 5000;
    while ((!fs.existsSync(path.join(manager.directory, 'test.gguf.part')) || fs.statSync(path.join(manager.directory, 'test.gguf.part')).size < 16384) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    await manager.pause('test');
    const partial = manager.list()[0].downloaded;
    assert(partial > 0 && partial < manager.catalog[0].bytes);
    assert.equal(partial, fs.statSync(path.join(manager.directory, 'test.gguf.part')).size);
    assert.equal(manager.list()[0].downloadState, 'paused');
    manager.catalog[0].url = manager.catalog[0].url.replace('/slow', '/file');
    await manager.download('test');
    await manager.jobs.get('test').task;
    assert(received.includes(`bytes=${partial}-`));
    assert.equal(manager.list()[0].ready, true);
});
test('a model is not ready without its verified projector; complete partial files resume without Range 416', async t => {
    const { manager, payload, received } = await fixture(t);
    manager.catalog[0].projector = { ...manager.catalog[0], filename: 'test-mmproj.gguf', sha256: '0'.repeat(64) };
    await manager.download('test'); await manager.jobs.get('test').task;
    assert.equal(manager.list()[0].ready, false);
    assert(fs.existsSync(path.join(manager.directory,'test.gguf')));
    manager.catalog[0].projector.sha256 = crypto.createHash('sha256').update(payload).digest('hex');
    const count = received.length;
    await manager.download('test'); await manager.jobs.get('test').task;
    assert.equal(manager.list()[0].ready, true); assert.equal(received.length, count);
});
