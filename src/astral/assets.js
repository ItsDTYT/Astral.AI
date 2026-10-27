import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { imageSize } from 'image-size';
import Jimp from '../jimp.js';
import { assert } from './store.js';

export function assetDirectory(root) { return path.join(root, 'astral', 'assets'); }
export async function saveImageAsset(root, data, title = 'Image') {
    assert(typeof data === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(data), 'Choose a PNG, JPEG, or WebP image.');
    const bytes = Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
    assert(bytes.length <= 10 * 1024 ** 2, 'Choose an image under 10 MB.');
    const size = imageSize(bytes);
    assert(size.width * size.height <= 40_000_000, 'Choose an image under 40 megapixels.');
    assert(['png', 'jpg', 'webp'].includes(size.type), 'Choose a PNG, JPEG, or WebP image.');
    // Validate dimensions before decoding, then strip metadata by re-encoding.
    const image = await Jimp.read(bytes);
    assert(image.bitmap.width * image.bitmap.height <= 40_000_000, 'Choose an image under 40 megapixels.');
    if (Math.max(image.bitmap.width, image.bitmap.height) > 2048) image.scaleToFit({ w: 2048, h: 2048 });
    const normalized = await image.getBuffer('image/png');
    const name = crypto.createHash('sha256').update(normalized).digest('hex') + '.png';
    fs.mkdirSync(assetDirectory(root), { recursive: true });
    const dest = path.join(assetDirectory(root), name);
    if (!fs.existsSync(dest)) fs.writeFileSync(dest, normalized);
    return { url: `/api/astral/assets/${name}`, type: 'image', title: String(title).slice(0, 100), width: image.bitmap.width, height: image.bitmap.height };
}
export function getAssetFile(root, name) {
    assert(/^[a-f0-9]{64}\.png$/.test(name), 'Invalid image reference.');
    const file = path.join(assetDirectory(root), name);
    assert(fs.existsSync(file), 'Image is missing.', 404);
    return file;
}
