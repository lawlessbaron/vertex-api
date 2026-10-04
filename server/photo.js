// Reading a photo here, without a converter service: JPEG (baseline and
// progressive) and PNG, turned upright from the camera's rotation tag, shrunk
// to `side` pixels on the long edge, and sent back as pixels plus a JPEG.
// HEIC (iPhones) isn't read here; the caller sends it to the converter if one
// is set up. Runs on a trace worker thread (trace-work.js), so a big photo
// never holds up other requests.
import { createRequire } from 'node:module';
import { inflateSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const decodeJpeg = require('./vendor/jpeg-js/decoder.cjs');
const encodeJpeg = require('./vendor/jpeg-js/encoder.cjs');

export const PHOTO_SIDE = 1600;
const MAX_MP = 64;

/** 'jpeg' | 'png' | 'heic' | 'webp' | null, from the first bytes. */
export function photoKind(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return 'png';
  if (buf.toString('latin1', 4, 8) === 'ftyp' && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1|avif)$/.test(buf.toString('latin1', 8, 12))) return 'heic';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

class PhotoError extends Error {}

// The EXIF orientation (1–8) in a JPEG's APP1 block; 1 when there isn't one.
export function exifOrientation(exif) {
  if (!exif || exif.length < 14) return 1;
  // The TIFF header (II*\0 or MM\0*) sits a few bytes in, depending on who cut the block out.
  const head = exif.toString('latin1', 0, 16), o = Math.max(head.indexOf('II*\0'), head.indexOf('MM\0*'));
  if (o < 0) return 1;
  const le = exif.toString('latin1', o, o + 2) === 'II';
  const u16 = (i) => (le ? exif.readUInt16LE(i) : exif.readUInt16BE(i));
  const u32 = (i) => (le ? exif.readUInt32LE(i) : exif.readUInt32BE(i));
  try {
    const ifd = o + u32(o + 4), n = u16(ifd);
    for (let k = 0; k < n; k++) {
      const e = ifd + 2 + k * 12;
      if (u16(e) === 0x0112) { const v = u16(e + 8); return v >= 1 && v <= 8 ? v : 1; }
    }
  } catch { /* a cut-short block: treat as upright */ }
  return 1;
}

function readPng(buf) {
  let p = 8, W = 0, H = 0, depth = 0, type = 0, interlace = 0, palette = null, trns = null;
  const idat = [];
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p), name = buf.toString('latin1', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (name === 'IHDR') { W = d.readUInt32BE(0); H = d.readUInt32BE(4); depth = d[8]; type = d[9]; interlace = d[12]; }
    else if (name === 'PLTE') palette = d;
    else if (name === 'tRNS') trns = d;
    else if (name === 'IDAT') idat.push(d);
    else if (name === 'IEND') break;
    p += 12 + len;
  }
  if (!W || !H) throw new PhotoError('not a PNG');
  if (W * H > MAX_MP * 1e6) throw new PhotoError('too many pixels');
  if (interlace) throw new PhotoError('interlaced PNG');
  if (![8, 16].includes(depth) && !(type === 3 && [1, 2, 4, 8].includes(depth)) && !(type === 0 && [1, 2, 4].includes(depth))) throw new PhotoError('PNG bit depth');
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!ch) throw new PhotoError('PNG colour type');
  const bpp = Math.max(1, (ch * depth) >> 3), stride = Math.ceil((W * ch * depth) / 8);
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length < H * (stride + 1)) throw new PhotoError('PNG cut short');
  const cur = Buffer.alloc(stride), prev = Buffer.alloc(stride);
  const out = new Uint8ClampedArray(W * H * 4);
  const sample = (row, i) => { // sample i of the row, as 0–255
    if (depth === 8) return row[i];
    if (depth === 16) return row[i * 2];
    const bit = i * depth, v = (row[bit >> 3] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
    return type === 3 ? v : Math.round((v * 255) / ((1 << depth) - 1));
  };
  for (let y = 0; y < H; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = src[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      if (type === 3) {
        const k = sample(cur, x);
        out[o] = palette?.[k * 3] ?? 0; out[o + 1] = palette?.[k * 3 + 1] ?? 0; out[o + 2] = palette?.[k * 3 + 2] ?? 0; out[o + 3] = trns && k < trns.length ? trns[k] : 255;
      } else if (ch <= 2) {
        const g = sample(cur, x * ch); out[o] = out[o + 1] = out[o + 2] = g; out[o + 3] = ch === 2 ? sample(cur, x * 2 + 1) : 255;
      } else {
        out[o] = sample(cur, x * ch); out[o + 1] = sample(cur, x * ch + 1); out[o + 2] = sample(cur, x * ch + 2); out[o + 3] = ch === 4 ? sample(cur, x * 4 + 3) : 255;
      }
    }
    prev.set(cur);
  }
  return { width: W, height: H, data: out };
}

// Shrink so the long edge is at most `side`, averaging the pixels each new one covers.
// Transparent pixels are laid on white (a PNG cut-out reads as a tool on paper).
function shrink({ width: W, height: H, data }, side) {
  const s = Math.max(1, Math.max(W, H) / side), w = Math.max(1, Math.round(W / s)), h = Math.max(1, Math.round(H / s));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * H) / h), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * H) / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * W) / w), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * W) / w));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0, i = (yy * W + x0) * 4; xx < x1; xx++, i += 4) {
          const a = data[i + 3] / 255;
          r += data[i] * a + 255 * (1 - a); g += data[i + 1] * a + 255 * (1 - a); b += data[i + 2] * a + 255 * (1 - a); n++;
        }
      }
      const o = (y * w + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}

// Turn the pixels the way the camera's tag says (EXIF orientations 2–8).
export function upright(img, orientation) {
  if (!orientation || orientation === 1) return img;
  const { width: W, height: H, data } = img, swap = orientation >= 5;
  const w = swap ? H : W, h = swap ? W : H, out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sx, sy; // where this upright pixel was in the stored picture
      switch (orientation) {
        case 2: sx = W - 1 - x; sy = y; break;
        case 3: sx = W - 1 - x; sy = H - 1 - y; break;
        case 4: sx = x; sy = H - 1 - y; break;
        case 5: sx = y; sy = x; break;
        case 6: sx = y; sy = H - 1 - x; break;
        case 7: sx = W - 1 - y; sy = H - 1 - x; break;
        default: sx = W - 1 - y; sy = x; // 8
      }
      out.set(data.subarray((sy * W + sx) * 4, (sy * W + sx) * 4 + 4), (y * w + x) * 4);
    }
  }
  return { width: w, height: h, data: out };
}

/**
 * A JPEG or PNG photo → { width, height, data (RGBA), jpeg (base64) }, upright and
 * at most `side` pixels on the long edge. Throws { unreadable: true } for anything else.
 */
export function readPhoto(buf, { side = PHOTO_SIDE, quality = 88 } = {}) {
  buf = Buffer.from(buf.buffer ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : buf);
  const kind = photoKind(buf);
  let img, turn = 1;
  try {
    if (kind === 'jpeg') {
      const d = decodeJpeg(buf, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: MAX_MP, maxMemoryUsageInMB: 768 });
      img = { width: d.width, height: d.height, data: new Uint8ClampedArray(d.data.buffer, d.data.byteOffset, d.data.byteLength) };
      turn = exifOrientation(d.exifBuffer ? Buffer.from(d.exifBuffer) : null);
    } else if (kind === 'png') img = readPng(buf);
    else throw new PhotoError(kind || 'unknown');
  } catch (e) {
    throw Object.assign(new Error(`can't read this photo (${e.message})`), { unreadable: true, kind });
  }
  img = upright(shrink(img, side), turn);
  const jpeg = encodeJpeg({ width: img.width, height: img.height, data: Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength) }, quality).data;
  return { width: img.width, height: img.height, data: img.data, jpeg: Buffer.from(jpeg).toString('base64') };
}
