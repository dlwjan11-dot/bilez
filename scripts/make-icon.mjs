// Builds icon.ico (used by electron-builder and the window) from assets/icon*.svg.
// Run with `npm run icon` after editing the SVGs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const full = fs.readFileSync(path.join(ROOT, 'assets', 'icon.svg'));
const small = fs.readFileSync(path.join(ROOT, 'assets', 'icon-small.svg'));

// Windows picks the closest size per context (taskbar, explorer, alt-tab...)
const SIZES = [16, 24, 32, 48, 64, 128, 256];

const images = await Promise.all(SIZES.map(size =>
    sharp(size <= 32 ? small : full, { density: Math.max(72, (72 * size) / 256 * 4) })
        .resize(size, size)
        .png()
        .toBuffer()));

// ICO = 6-byte header + 16-byte directory entry per image + PNG payloads
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);

let offset = 6 + 16 * images.length;
const entries = images.map((png, i) => {
    const size = SIZES[i];
    const e = Buffer.alloc(16);
    e.writeUInt8(size === 256 ? 0 : size, 0);
    e.writeUInt8(size === 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    return e;
});

fs.writeFileSync(path.join(ROOT, 'icon.ico'), Buffer.concat([header, ...entries, ...images]));
await sharp(full).resize(512, 512).png().toFile(path.join(ROOT, 'assets', 'icon-512.png'));
console.log(`icon.ico written with sizes ${SIZES.join(', ')}`);
