import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AstralStore, buildMemoryPrompt, validateState } from '../../src/astral/store.js';
import { localEndpoint, verifyGguf, ModelManager, sha256 } from '../../src/astral/models.js';
const defaults = JSON.parse(fs.readFileSync('astral/resources/characters.json'));
function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astral-test-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    return { root, store: new AstralStore(root, defaults) };
}
test('the standard library rejects removed content modes and characters', (t) => {
    const { store } = fixture(t);
    assert.throws(
        () =>
            store.action({
                type: 'createConversation',
                mode: 'nsfw',
                characterId: 'yuna',
            }),
        /mode/i,
    );
    assert.throws(() => store.action({ type: 'settings', patch: { mode: 'nsfw' } }), /mode/i);
    const normal = store.action({
        type: 'createConversation',
        mode: 'normal',
        characterId: 'hina',
    });
    assert.throws(
        () =>
            store.action({
                type: 'createConversation',
                mode: 'nsfw',
                characterId: 'hina',
            }),
        /mode/i,
    );
    assert.equal(normal.mode, 'normal');
    assert.equal(store.state.characters.length, defaults.length);
    assert.ok(store.state.characters.every((c) => c.mode === 'normal'));
});

test('upgrading archives removed profiles and preserves standard chats and memories', (t) => {
    const { store, root } = fixture(t);
    const chat = store.action({ type: 'createConversation', mode: 'normal', characterId: 'hina' });
    store.action({
        type: 'saveMemory',
        mode: 'normal',
        conversationId: chat.id,
        memory: { text: 'Green tea.', scope: 'character' },
    });
    const legacy = structuredClone(store.state);
    legacy.characters[0].avatar = 'Hina.png';
    delete legacy.characters[0].artVersion;
    legacy.characters.push({ ...legacy.characters[0], id: 'legacy-adult', mode: 'nsfw' });
    legacy.conversations.push({ ...chat, id: 'old-adult-chat', characterId: 'legacy-adult', mode: 'nsfw' });
    legacy.settings.mode = 'nsfw';
    legacy.settings.adultConfirmed = true;
    fs.writeFileSync(store.file, JSON.stringify(legacy));
    const upgraded = new AstralStore(root, defaults);
    assert.equal(upgraded.state.characters.length, defaults.length);
    assert.equal(upgraded.state.characters[0].avatar, 'Hina.png');
    assert.equal(upgraded.state.characters[0].artNeedsSync, true);
    assert.equal(upgraded.state.conversations[0].id, chat.id);
    assert.equal(upgraded.state.memories[0].text, 'Green tea.');
    assert.equal(upgraded.state.settings.mode, 'normal');
    assert.equal(upgraded.state.settings.adultConfirmed, undefined);
    const archive = fs
        .readdirSync(path.dirname(store.file))
        .find((name) => name.includes('before-standard-library'));
    assert.ok(archive);
    assert.equal(
        JSON.parse(fs.readFileSync(path.join(path.dirname(store.file), archive))).characters.length,
        defaults.length + 1,
    );
});
test('character and story facts have correct scope; disable and edits change the prompt', (t) => {
    const { store } = fixture(t);
    const a = store.action({
        type: 'createConversation',
        mode: 'normal',
        characterId: 'hina',
    });
    const b = store.action({
        type: 'createConversation',
        mode: 'normal',
        characterId: 'hina',
    });
    const rei = store.action({
        type: 'createConversation',
        mode: 'normal',
        characterId: 'rei',
    });
    const edit = (type, extra) => store.action({ type, mode: 'normal', conversationId: a.id, ...extra });
    const fact = edit('saveMemory', {
        memory: {
            text: 'The user likes green tea.',
            scope: 'character',
            pinned: true,
        },
    });
    edit('saveMemory', {
        memory: { text: 'The studio door is locked.', scope: 'story' },
    });
    assert.match(buildMemoryPrompt(store.state, a.id), /door is locked/);
    assert.doesNotMatch(buildMemoryPrompt(store.state, b.id), /door is locked/);
    assert.match(buildMemoryPrompt(store.state, b.id), /green tea/);
    assert.equal(buildMemoryPrompt(store.state, rei.id), '');
    edit('saveMemory', {
        memory: { ...fact, text: 'The user likes black tea.' },
    });
    assert.doesNotMatch(buildMemoryPrompt(store.state, a.id), /green tea/);
    edit('updateConversation', { patch: { memoryEnabled: false } });
    assert.equal(buildMemoryPrompt(store.state, a.id), '');
});
test('deleted memories are suppressed during automatic updates and survive restart', (t) => {
    const { store, root } = fixture(t);
    const c = store.action({
        type: 'createConversation',
        mode: 'normal',
        characterId: 'hina',
    });
    const fact = store.action({
        type: 'saveMemory',
        mode: 'normal',
        conversationId: c.id,
        memory: { text: 'The user prefers green tea.', scope: 'character' },
    });
    store.action({
        type: 'deleteMemory',
        mode: 'normal',
        conversationId: c.id,
        memoryId: fact.id,
    });
    store.action({
        type: 'applyAutoMemory',
        mode: 'normal',
        conversationId: c.id,
        expectedCursor: 0,
        cursor: 5,
        summary: 'A studio visit.',
        facts: [{ text: 'The user prefers green tea!', scope: 'character' }],
    });
    const restarted = new AstralStore(root, defaults);
    assert.equal(restarted.state.memories.length, 0);
    assert.equal(restarted.state.tombstones.length, 1);
    assert.equal(restarted.state.conversations[0].summary, 'A studio visit.');
});
test('memory budget prioritizes pinned facts and excludes summary when disabled', (t) => {
    const { store } = fixture(t);
    const c = store.action({
        type: 'createConversation',
        mode: 'normal',
        characterId: 'hina',
    });
    store.action({
        type: 'saveMemory',
        mode: 'normal',
        conversationId: c.id,
        memory: { text: 'a'.repeat(120), scope: 'story' },
    });
    store.action({
        type: 'saveMemory',
        mode: 'normal',
        conversationId: c.id,
        memory: { text: 'Pinned fact', scope: 'character', pinned: true },
    });
    store.action({
        type: 'updateConversation',
        mode: 'normal',
        conversationId: c.id,
        patch: { summary: 'Hidden summary', summaryEnabled: false },
    });
    store.action({ type: 'settings', patch: { memoryBudget: 64 } });
    const prompt = buildMemoryPrompt(store.state, c.id);
    assert.match(prompt, /Pinned fact/);
    assert.doesNotMatch(prompt, /a{120}|Hidden summary/);
});
test('save points restore their summary and are scoped to their conversation', (t) => {
    const { store } = fixture(t);
    const c = store.action({
        type: 'createConversation',
        mode: 'normal',
        characterId: 'hina',
    });
    const d = store.action({
        type: 'createConversation',
        mode: 'normal',
        characterId: 'rei',
    });
    const cp = store.action({
        type: 'checkpoint',
        mode: 'normal',
        conversationId: c.id,
        name: 'Before the rain',
        messages: [{ name: 'Hina', mes: 'Hello', is_user: false }],
    });
    store.action({
        type: 'saveMemory',
        mode: 'normal',
        conversationId: c.id,
        memory: { text: 'A later story event.', scope: 'story' },
    });
    store.action({
        type: 'saveMemory',
        mode: 'normal',
        conversationId: c.id,
        memory: { text: 'A lasting preference.', scope: 'character' },
    });
    store.action({
        type: 'updateConversation',
        mode: 'normal',
        conversationId: c.id,
        patch: { summary: 'Later events' },
    });
    assert.throws(
        () =>
            store.action({
                type: 'restoreCheckpoint',
                mode: 'normal',
                conversationId: d.id,
                checkpointId: cp.id,
            }),
        /not found/i,
    );
    const restored = store.action({
        type: 'restoreCheckpoint',
        mode: 'normal',
        conversationId: c.id,
        checkpointId: cp.id,
    });
    assert.equal(restored.messages[0].mes, 'Hello');
    assert.equal(store.state.conversations[0].summary, '');
    assert(!store.state.memories.some((m) => m.text === 'A later story event.'));
    assert(store.state.memories.some((m) => m.text === 'A lasting preference.'));
});
test('invalid mutations roll back without modifying persisted data', (t) => {
    const { store, root } = fixture(t);
    const before = fs.readFileSync(store.file, 'utf8');
    assert.throws(
        () =>
            store.action({
                type: 'saveCharacter',
                mode: 'normal',
                character: { name: '' },
            }),
        /name/i,
    );
    assert.throws(
        () =>
            store.action({
                type: 'saveCharacter',
                mode: 'normal',
                character: { name: 'Bad', age: 24, avatar: '../bad.png' },
            }),
        /file/i,
    );
    assert.equal(fs.readFileSync(store.file, 'utf8'), before);
    assert.equal(new AstralStore(root, defaults).state.characters.length, defaults.length);
});
test('backup validation rejects cross-character memory and path traversal', (t) => {
    const { store } = fixture(t);
    const c = store.action({
        type: 'createConversation',
        mode: 'normal',
        characterId: 'hina',
    });
    const bad = structuredClone(store.state);
    bad.characters[0].avatar = '../escape.png';
    assert.throws(() => validateState(bad));
    const bad2 = structuredClone(store.state);
    bad2.memories.push({
        id: 'bad',
        characterId: 'rei',
        mode: 'normal',
        conversationId: c.id,
        scope: 'story',
        text: 'No',
    });
    assert.throws(() => validateState(bad2), /another story/);
});
test('local connection validation rejects external hosts, credentials and other protocols', () => {
    assert.equal(localEndpoint('http://127.0.0.1:1234/v1/'), 'http://127.0.0.1:1234/v1');
    for (const value of [
        'https://example.com',
        'file:///C:/secret',
        'http://user:pass@localhost:12',
        'http://127.0.0.1.evil.test:12',
    ])
        assert.throws(() => localEndpoint(value));
});
test('GGUF imports validate magic bytes and removing a linked model retains the original', async (t) => {
    const { root } = fixture(t);
    const bad = path.join(root, 'bad.gguf');
    fs.writeFileSync(bad, 'not a model');
    await assert.rejects(verifyGguf(bad), /GGUF/);
    const file = path.join(root, 'valid.gguf');
    const header = Buffer.alloc(32);
    header.write('GGUF');
    header.writeUInt32LE(3, 4);
    fs.writeFileSync(file, header);
    const manager = new ModelManager(root, path.resolve('astral/resources'));
    const imported = await manager.importFile(file);
    assert.equal(manager.list().find((m) => m.id === imported.id).ready, true);
    await manager.remove(imported.id);
    assert.equal(fs.existsSync(file), true);
});
