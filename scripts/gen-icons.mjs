#!/usr/bin/env node
// Generates public/icons/icon-192.png and icon-512.png — a green tile with a
// white play triangle. Pure zlib, no image libs. Run: node scripts/gen-icons.mjs
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function icon(size) {
  const bg = [0, 177, 64]; // #00b140
  const fg = [255, 255, 255];
  const stride = size * 3;
  const raw = Buffer.alloc((stride + 1) * size);

  // play triangle centred, ~44% of the tile
  const cx = size * 0.52;
  const half = size * 0.22;
  const x0 = cx - half * 0.9;
  const x1 = cx + half;
  const y0 = size / 2 - half;
  const y1 = size / 2 + half;

  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let c = bg;
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) {
        const t = (x - x0) / (x1 - x0); // 0..1 across the triangle
        const spread = half * (1 - t);
        if (Math.abs(y - size / 2) <= spread) c = fg;
      }
      const off = y * (stride + 1) + 1 + x * 3;
      raw[off] = c[0];
      raw[off + 1] = c[1];
      raw[off + 2] = c[2];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const dir = path.join(process.cwd(), "public/icons");
fs.mkdirSync(dir, { recursive: true });
for (const s of [192, 512]) {
  fs.writeFileSync(path.join(dir, `icon-${s}.png`), icon(s));
  console.log(`wrote public/icons/icon-${s}.png`);
}
// iOS reads this one specifically (ignores the manifest's icons list) for
// "Add to Home Screen" — without it iOS falls back to a screenshot instead
// of a real icon.
fs.writeFileSync(path.join(dir, "apple-touch-icon.png"), icon(180));
console.log("wrote public/icons/apple-touch-icon.png");
