// Generates placeholder CloudTracer icons (ink-on-cream with a cyan "trace"
// disc). Pure Node, no dependencies. Re-run after editing to refresh the PNGs:
//   node extension/icons/generate.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// Brand colors (sRGB approximations of the cloudtracer.dev oklch palette).
const INK = [20, 24, 31];
const CYAN = [28, 142, 205];
const CREAM = [247, 244, 238];

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function blend(bg, fg, a) {
  return [0, 1, 2].map((i) => Math.round(bg[i] * (1 - a) + fg[i] * a));
}

function pixel(x, y, size) {
  const c = (size - 1) / 2;
  const dx = x - c;
  const dy = y - c;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const r = size / 2;

  // Rounded-square background mask with a soft edge.
  const corner = size * 0.22;
  const inset = size * 0.04;
  const rx = Math.abs(dx) - (size / 2 - inset - corner);
  const ry = Math.abs(dy) - (size / 2 - inset - corner);
  const cornerDist = Math.sqrt(Math.max(rx, 0) ** 2 + Math.max(ry, 0) ** 2) - corner;
  const bgAlpha = clamp(0.5 - cornerDist, 0, 1);
  if (bgAlpha <= 0) return [0, 0, 0, 0];

  let rgb = INK;
  // Outer cyan ring (anti-aliased on both edges).
  const ringOuter = r * 0.78;
  const ringInner = r * 0.5;
  const ringAlpha = clamp(ringOuter - dist, 0, 1) * clamp(dist - ringInner, 0, 1);
  if (ringAlpha > 0) rgb = blend(rgb, CYAN, ringAlpha);

  // Inner cream "trace" dot.
  const dot = r * 0.26;
  rgb = blend(rgb, CREAM, clamp(dot - dist, 0, 1));

  return [rgb[0], rgb[1], rgb[2], Math.round(bgAlpha * 255)];
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function png(size) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y, size);
      const o = y * stride + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [16, 32, 48, 128]) {
  writeFileSync(resolve(here, `icon-${size}.png`), png(size));
  console.log(`wrote icon-${size}.png`);
}
