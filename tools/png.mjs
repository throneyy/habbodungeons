// Minimal PNG decode/encode for the avatar tooling — zero dependencies.
//
// This deliberately does NOT use an npm image library. The bake step and its
// test are the only things in the repo that touch pixels off-browser, and the
// one that was being used (pngjs) was never declared in package.json or either
// lockfile: it sat in node_modules as an ad-hoc install until an unrelated
// `npm install` pruned it and took the baker and the test down with it. Node
// ships zlib, PNG's only hard part, so the honest fix is ~100 lines here rather
// than a dependency on a package nobody declared.
//
// Scope is exactly what habbo-imaging serves and what we bake: 8-bit RGBA
// (colour type 6), non-interlaced. Anything else throws loudly instead of
// silently decoding to garbage.
import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = 4; // RGBA — bytes per pixel, and the filter's `bpp` distance

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

// PNG's per-scanline filters (spec 9.2). `a` = pixel to the left, `b` = pixel
// above, `c` = pixel above-left; all zero outside the image.
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

// -> { width, height, data } with data as RGBA bytes, row-major.
export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG (bad signature)');
  let width = 0;
  let height = 0;
  const idat = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const depth = body[8];
      const colourType = body[9];
      const interlace = body[12];
      if (depth !== 8 || colourType !== 6 || interlace !== 0) {
        throw new Error(
          `unsupported PNG: depth=${depth} colourType=${colourType} interlace=${interlace} ` +
          '(this decoder handles 8-bit RGBA, non-interlaced only)'
        );
      }
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length; // length + type + body + CRC
  }
  if (!width || !height) throw new Error('PNG has no IHDR');

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * CHANNELS;
  const data = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const row = y * stride;
    const prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const value = raw[pos + x];
      const a = x >= CHANNELS ? data[row + x - CHANNELS] : 0;
      const b = y > 0 ? data[prev + x] : 0;
      const c = y > 0 && x >= CHANNELS ? data[prev + x - CHANNELS] : 0;
      let out;
      switch (filter) {
        case 0: out = value; break;
        case 1: out = value + a; break;
        case 2: out = value + b; break;
        case 3: out = value + ((a + b) >> 1); break;
        case 4: out = value + paeth(a, b, c); break;
        default: throw new Error(`unknown PNG filter ${filter} on row ${y}`);
      }
      data[row + x] = out & 0xff;
    }
    pos += stride;
  }
  return { width, height, data };
}

function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

// Encodes with filter 0 (None) on every scanline: the art is small, flat pixel
// art, and skipping filter heuristics keeps output byte-stable across runs so a
// re-bake that changed nothing produces an identical file.
export function encodePng({ width, height, data }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  const stride = width * CHANNELS;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    data.copy
      ? data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
      : Buffer.from(data.subarray(y * stride, (y + 1) * stride)).copy(raw, y * (stride + 1) + 1);
  }
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// A transparent RGBA canvas in the same shape decodePng returns.
export function blankImage(width, height) {
  return { width, height, data: Buffer.alloc(width * height * CHANNELS) };
}
