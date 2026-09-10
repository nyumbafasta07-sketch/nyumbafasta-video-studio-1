/**
 * Dependency-free media generators for MOCK output. Real models never touch this
 * file. Node's zlib gives us real PNGs; raw PCM gives us real WAVs.
 */
import zlib from "node:zlib";

/* ---------------- WAV (PCM 16-bit mono) ---------------- */

/**
 * A quiet tone with a per-"word" amplitude envelope so it reads as speech-shaped
 * placeholder audio, not a flat beep. Duration is caller-controlled.
 */
export function makeMockWav(opts: {
  seconds: number;
  wordCount: number;
  sampleRate?: number;
}): Buffer {
  const sampleRate = opts.sampleRate ?? 22050;
  const seconds = Math.max(0.5, opts.seconds);
  const n = Math.floor(seconds * sampleRate);
  const words = Math.max(1, opts.wordCount);
  const samplesPerWord = n / words;
  const pcm = Buffer.alloc(n * 2);

  for (let i = 0; i < n; i++) {
    const wordPos = (i % samplesPerWord) / samplesPerWord; // 0..1 within a word
    // raised-cosine envelope per word + short gap
    const env = wordPos < 0.8 ? 0.5 - 0.5 * Math.cos((wordPos / 0.8) * 2 * Math.PI) : 0;
    const freq = 110 + 40 * Math.sin(i / sampleRate * 3); // gentle wobble
    const s = Math.sin((2 * Math.PI * freq * i) / sampleRate) * env * 0.28;
    pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s * 32767))), i * 2);
  }

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/* ---------------- PNG (truecolor, 8-bit) ---------------- */

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

export type RGB = [number, number, number];

/**
 * Draws a crude portrait "avatar card": flat background, a head oval, eyes and a
 * mouth. Obviously a placeholder — that is the point (brief §0: label MOCK).
 */
export function makeMockFacePng(opts: {
  width: number;
  height: number;
  bg?: RGB;
  skin?: RGB;
}): Buffer {
  const w = opts.width;
  const h = opts.height;
  const bg = opts.bg ?? [24, 26, 32];
  const skin = opts.skin ?? [150, 110, 84];

  // raw RGB rows with a leading filter byte (0 = none) per scanline
  const stride = w * 3;
  const raw = Buffer.alloc((stride + 1) * h);

  const cx = w / 2;
  const cy = h * 0.46;
  const rx = w * 0.30;
  const ry = h * 0.34;

  const put = (x: number, y: number, c: RGB) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const off = y * (stride + 1) + 1 + x * 3;
    raw[off] = c[0];
    raw[off + 1] = c[1];
    raw[off + 2] = c[2];
  };

  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter byte
    for (let x = 0; x < w; x++) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny <= 1) put(x, y, skin);
      else put(x, y, bg);
    }
  }

  // eyes
  const eyeY = cy - ry * 0.15;
  for (const ex of [cx - rx * 0.38, cx + rx * 0.38]) {
    for (let y = -Math.round(h * 0.012); y <= Math.round(h * 0.012); y++)
      for (let x = -Math.round(w * 0.03); x <= Math.round(w * 0.03); x++)
        put(Math.round(ex + x), Math.round(eyeY + y), [20, 20, 24]);
  }
  // mouth
  const mouthY = cy + ry * 0.45;
  for (let y = -Math.round(h * 0.008); y <= Math.round(h * 0.008); y++)
    for (let x = -Math.round(w * 0.12); x <= Math.round(w * 0.12); x++)
      put(Math.round(cx + x), Math.round(mouthY + y), [70, 35, 40]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
