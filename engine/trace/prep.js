// Pre-processing for the built-in trace: what the photo looks like to the
// trace before it looks for tools. Every room lights a photo differently, so
// nothing here is a fixed cut-off; each step works from the photo itself.
//
//   1. Greyscale: colour is dropped, so a red handle counts for no more than
//      bare steel.
//   2. Smoothing: a Gaussian blur, so scratches and glints on metal, and the
//      paper's grain, aren't taken for edges.
//   3. CLAHE (contrast-limited adaptive histogram equalisation): contrast is
//      stretched tile by tile, so shiny metal stands apart from white paper
//      even where the light is dim.
//   4. Adaptive threshold: each pixel is compared with the light around it,
//      not with one cut-off for the whole photo. A soft shadow darkens its
//      surroundings as much as itself, so it drops out; a tool is darker than
//      the paper beside it, so it stays. Shadow tolerance sets how much darker.
//   5. Edges (Canny): a tool has a crisp outline; a soft shadow fades out
//      without one. Crisp edges close the outline of a tool whose middle is as
//      light as the paper (a polished jaw), so it can be filled.
//
// Works on {width, height, data: RGBA} images, in the browser and in tests.

export const PREP_DEFAULTS = {
  shadowTolerance: 50, // 0..100: higher leaves out darker shadows
  edgeSensitivity: 50, // 0..100: higher finds fainter edges
  smoothing: 1, // mm of Gaussian blur
};

/** Greyscale, 0..255. */
export function greyscale(img) {
  const { width: W, height: H, data } = img;
  const out = new Float32Array(W * H);
  for (let i = 0, p = 0; p < W * H; p++, i += 4) out[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  return out;
}

/** Gaussian blur with standard deviation `sigma` pixels (separable, edges clamped). */
export function gaussian(src, W, H, sigma) {
  if (!(sigma > 0.3)) return src.slice();
  const r = Math.ceil(sigma * 3), k = new Float32Array(r * 2 + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); sum += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      let v = 0;
      for (let i = -r; i <= r; i++) v += src[row + Math.min(W - 1, Math.max(0, x + i))] * k[i + r];
      tmp[row + x] = v;
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 0;
    for (let i = -r; i <= r; i++) v += tmp[Math.min(H - 1, Math.max(0, y + i)) * W + x] * k[i + r];
    out[y * W + x] = v;
  }
  return out;
}

/**
 * CLAHE: the photo in `tiles` × `tiles` tiles, each with its own histogram
 * equalisation, clipped at `clip` times the average so noise isn't blown up,
 * and blended between tile centres so no seams show.
 */
export function clahe(src, W, H, { tiles = 8, clip = 2.5 } = {}) {
  const tw = W / tiles, th = H / tiles;
  const maps = [];
  for (let ty = 0; ty < tiles; ty++) for (let tx = 0; tx < tiles; tx++) {
    const x0 = Math.floor(tx * tw), x1 = Math.floor((tx + 1) * tw), y0 = Math.floor(ty * th), y1 = Math.floor((ty + 1) * th);
    const hist = new Float64Array(256);
    let n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { hist[Math.max(0, Math.min(255, src[y * W + x] | 0))]++; n++; }
    const limit = Math.max(1, (clip * n) / 256);
    let excess = 0;
    for (let i = 0; i < 256; i++) if (hist[i] > limit) { excess += hist[i] - limit; hist[i] = limit; }
    const add = excess / 256;
    const map = new Float32Array(256);
    let c = 0;
    for (let i = 0; i < 256; i++) { c += hist[i] + add; map[i] = (c / Math.max(1, n)) * 255; }
    maps.push(map);
  }
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const fy = Math.max(0, Math.min(tiles - 1, y / th - 0.5));
    const ty0 = Math.floor(fy), ty1 = Math.min(tiles - 1, ty0 + 1), wy = fy - ty0;
    for (let x = 0; x < W; x++) {
      const fx = Math.max(0, Math.min(tiles - 1, x / tw - 0.5));
      const tx0 = Math.floor(fx), tx1 = Math.min(tiles - 1, tx0 + 1), wx = fx - tx0;
      const v = Math.max(0, Math.min(255, src[y * W + x] | 0));
      const a = maps[ty0 * tiles + tx0][v], b = maps[ty0 * tiles + tx1][v], c = maps[ty1 * tiles + tx0][v], d = maps[ty1 * tiles + tx1][v];
      out[y * W + x] = (a * (1 - wx) + b * wx) * (1 - wy) + (c * (1 - wx) + d * wx) * wy;
    }
  }
  return out;
}

/** Mean of each `size`-pixel square around every pixel (summed-area table). */
export function boxMean(src, W, H, size) {
  const r = Math.max(1, Math.floor(size / 2));
  const S = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let row = 0;
    for (let x = 0; x < W; x++) { row += src[y * W + x]; S[(y + 1) * (W + 1) + x + 1] = S[y * (W + 1) + x + 1] + row; }
  }
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
      const s = S[y1 * (W + 1) + x1] - S[y0 * (W + 1) + x1] - S[y1 * (W + 1) + x0] + S[y0 * (W + 1) + x0];
      out[y * W + x] = s / ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}

/** 1 where a pixel is at least `c` darker than the mean of the `block` around it. */
export function adaptiveThreshold(src, W, H, block, c) {
  const mean = boxMean(src, W, H, block);
  const out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) out[i] = src[i] < mean[i] - c ? 1 : 0;
  return out;
}

/**
 * Canny edges: Sobel gradients, thinned to one pixel along the edge, then
 * kept where strong (above `high`) or where weak (above `low`) but joined to
 * a strong one. Returns 1 on an edge.
 */
export function canny(src, W, H, low, high) {
  const mag = new Float32Array(W * H), dir = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const p = y * W + x;
    const gx = -src[p - W - 1] - 2 * src[p - 1] - src[p + W - 1] + src[p - W + 1] + 2 * src[p + 1] + src[p + W + 1];
    const gy = -src[p - W - 1] - 2 * src[p - W] - src[p - W + 1] + src[p + W - 1] + 2 * src[p + W] + src[p + W + 1];
    mag[p] = Math.hypot(gx, gy) / 4;
    const a = ((Math.atan2(gy, gx) * 180) / Math.PI + 180) % 180;
    dir[p] = a < 22.5 || a >= 157.5 ? 0 : a < 67.5 ? 1 : a < 112.5 ? 2 : 3;
  }
  const thin = new Float32Array(W * H);
  const off = [[1, 0], [1, 1], [0, 1], [-1, 1]];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const p = y * W + x, m = mag[p];
    if (m < low) continue;
    const [dx, dy] = off[dir[p]];
    if (m >= mag[p + dy * W + dx] && m >= mag[p - dy * W - dx]) thin[p] = m;
  }
  const out = new Uint8Array(W * H), stack = [];
  for (let p = 0; p < W * H; p++) if (thin[p] >= high && !out[p]) {
    out[p] = 1; stack.push(p);
    while (stack.length) {
      const q = stack.pop(), qx = q % W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = qx + dx, n = q + dy * W + dx;
        if (nx < 0 || nx >= W || n < 0 || n >= W * H || out[n] || thin[n] < low) continue;
        out[n] = 1; stack.push(n);
      }
    }
  }
  return out;
}

/**
 * How bright the bare paper is around every pixel: the brightest tenth of
 * each `cell`-pixel square (the paper, even with tools on it), blended
 * smoothly between squares.
 */
export function paperLevel(grey, W, H, cell) {
  const cw = Math.max(1, Math.ceil(W / cell)), ch = Math.max(1, Math.ceil(H / cell));
  const lvl = new Float32Array(cw * ch);
  for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
    const hist = new Uint32Array(256);
    let n = 0;
    for (let y = cy * cell; y < Math.min(H, (cy + 1) * cell); y++) for (let x = cx * cell; x < Math.min(W, (cx + 1) * cell); x++) { hist[Math.max(0, Math.min(255, grey[y * W + x] | 0))]++; n++; }
    let seen = 0, v = 255;
    for (; v > 0; v--) { seen += hist[v]; if (seen >= n * 0.1) break; }
    lvl[cy * cw + cx] = Math.max(1, v);
  }
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const fy = Math.max(0, Math.min(ch - 1, y / cell - 0.5)), y0 = Math.floor(fy), y1 = Math.min(ch - 1, y0 + 1), wy = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.max(0, Math.min(cw - 1, x / cell - 0.5)), x0 = Math.floor(fx), x1 = Math.min(cw - 1, x0 + 1), wx = fx - x0;
      out[y * W + x] = (lvl[y0 * cw + x0] * (1 - wx) + lvl[y0 * cw + x1] * wx) * (1 - wy) + (lvl[y1 * cw + x0] * (1 - wx) + lvl[y1 * cw + x1] * wx) * wy;
    }
  }
  return out;
}

/**
 * The pre-processed photo and the two things the trace takes from it:
 * { grey (after smoothing and CLAHE, 0..255), dark (adaptive threshold),
 *   edges (Canny), depth (brightness next to the paper around it) }, all W*H.
 */
export function preprocess(img, pxPerMm = 4, options = {}) {
  const o = { ...PREP_DEFAULTS, ...options };
  const W = img.width, H = img.height;
  const plain = greyscale(img);
  const smooth = gaussian(plain, W, H, Math.max(0, o.smoothing) * pxPerMm * 0.5);
  const grey = clahe(smooth, W, H, { tiles: Math.max(2, Math.round(Math.max(W, H) / (40 * pxPerMm))), clip: 2.5 });
  // A block wide enough to take in the paper around a tool's edge, but local
  // enough to follow the light across the sheet.
  const block = Math.round(30 * pxPerMm) | 1;
  // At 0 it still needs a clear step down, or creases in the paper count.
  const c = 20 + (o.shadowTolerance / 100) * 37;
  const dark = adaptiveThreshold(grey, W, H, block, c);
  // Hysteresis does the shadow work here: an edge is only kept if some of
  // it is crisp (above high), then followed along its fainter stretches
  // (above low). A soft shadow's edge is faint all the way, so it goes.
  // Kept within 0.3 to 0.65 of the usual thresholds: lower, the paper's own
  // grain counts as edges and the whole sheet fills in; higher, a bare steel
  // head has too little edge to fill, and comes off its handles.
  const s = Math.max(0.3, Math.min(0.65, 1.05 - Math.max(0, Math.min(100, o.edgeSensitivity)) / 100));
  const edges = canny(grey, W, H, (o.edgeLow ?? 18) * s, (o.edgeHigh ?? 45) * s);
  // How dark each pixel is next to the paper around it (1 = as bright as
  // the paper). A shadow rarely takes the paper below about half.
  const paper = paperLevel(smooth, W, H, Math.round(25 * pxPerMm));
  const depth = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) depth[i] = smooth[i] / paper[i];
  return { grey, dark, edges, depth, W, H };
}
