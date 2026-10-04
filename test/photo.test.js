// Reading photos here instead of on a converter service: JPEG and PNG, upright, shrunk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { deflateSync } from 'node:zlib';
import { exifOrientation, photoKind, readPhoto, upright } from '../server/photo.js';

const encode = createRequire(import.meta.url)('../server/vendor/jpeg-js/encoder.cjs');

// A W×H picture, white with a red block in the top-left corner.
function picture(W, H) {
  const data = Buffer.alloc(W * H * 4, 255);
  for (let y = 0; y < H / 4; y++) for (let x = 0; x < W / 4; x++) { const i = (y * W + x) * 4; data[i + 1] = 0; data[i + 2] = 0; }
  return { width: W, height: H, data };
}
const jpegOf = (W, H) => Buffer.from(encode(picture(W, H), 95).data);
// The same JPEG with an EXIF block saying how the camera was turned.
function withOrientation(jpeg, o) {
  const tiff = Buffer.from([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, o, 0, 0, 0, 0, 0, 0, 0, 0]);
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 255]), body]);
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}
function pngOf(W, H) {
  const { data } = picture(W, H), rows = [];
  for (let y = 0; y < H; y++) rows.push(Buffer.from([0]), data.subarray(y * W * 4, (y + 1) * W * 4));
  const chunk = (name, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); return Buffer.concat([len, Buffer.from(name, 'latin1'), d, Buffer.alloc(4)]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
const px = (r, x, y) => [...r.data.subarray((y * r.width + x) * 4, (y * r.width + x) * 4 + 3)];
const red = ([r, g, b]) => r > 200 && g < 60 && b < 60;

test('what kind of photo it is, from its first bytes', () => {
  assert.equal(photoKind(jpegOf(8, 8)), 'jpeg');
  assert.equal(photoKind(pngOf(8, 8)), 'png');
  assert.equal(photoKind(Buffer.from('\0\0\0\x18ftypheic\0\0\0\0', 'latin1')), 'heic');
  assert.equal(photoKind(Buffer.from('not a photo at all')), null);
});

test('a JPEG and a PNG come back as pixels and a JPEG, the same way up', () => {
  for (const buf of [jpegOf(400, 200), pngOf(400, 200)]) {
    const r = readPhoto(buf);
    assert.deepEqual([r.width, r.height], [400, 200]);
    assert.ok(red(px(r, 5, 5)) && !red(px(r, 395, 5)));
    assert.equal(photoKind(Buffer.from(r.jpeg, 'base64')), 'jpeg');
  }
});

test('a phone photo is turned upright from the camera’s tag', () => {
  const plain = jpegOf(400, 200);
  assert.equal(exifOrientation(null), 1);
  const r = readPhoto(withOrientation(plain, 6)); // turned 90° clockwise
  assert.deepEqual([r.width, r.height], [200, 400]);
  assert.ok(red(px(r, 195, 5)), 'the red corner is now top right');
  const flipped = readPhoto(withOrientation(plain, 3)); // upside down
  assert.ok(red(px(flipped, 395, 195)));
  // Every turn keeps every pixel.
  for (let o = 1; o <= 8; o++) { const t = upright(picture(6, 4), o); assert.equal(t.width * t.height, 24); }
});

test('big photos are shrunk to 1600 px on the long edge; anything else is refused plainly', () => {
  const r = readPhoto(jpegOf(3200, 1200));
  assert.deepEqual([r.width, r.height], [1600, 600]);
  assert.ok(red(px(r, 10, 10)));
  assert.throws(() => readPhoto(Buffer.from('hello, not a photo')), (e) => e.unreadable === true);
});
