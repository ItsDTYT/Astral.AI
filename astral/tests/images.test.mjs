import test from 'node:test';
import assert from 'node:assert/strict';
import '../../src/fetch-patch.js';
import Jimp from '../../src/jimp.js';

test('local WASM codecs encode and decode PNG, JPEG, and WebP', async () => {
    const image = new Jimp({ width: 16, height: 16, color: 0xd8b77aff });
    for (const mime of ['image/png', 'image/jpeg', 'image/webp']) {
        const encoded = await image.getBuffer(mime, mime === 'image/jpeg' ? { jpegColorSpace: 'rgb', quality: 80 } : {});
        assert(encoded.length > 10);
        const decoded = await Jimp.read(encoded);
        assert.equal(decoded.bitmap.width, 16);
        assert.equal(decoded.bitmap.height, 16);
    }
});
