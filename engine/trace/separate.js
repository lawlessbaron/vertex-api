// Tools lying close together. The trace closes small gaps (so one tool whose
// outline has a gap stays whole), which also joins two tools a few millimetres
// apart into one. Here each joined shape is checked against the pixels found
// before the gaps were closed: if it holds two or more big pieces that meet
// along a long seam over bare paper (screwdrivers side by side, two boards in a
// row), they are different things and are cut apart along the seam. Pieces that meet over a
// short stretch (a handle and its shaft, end to end) stay one tool.
import { components } from '../geometry/raster.js';

/**
 * @param mask   the tool mask (Grid), changed in place and returned
 * @param raw    what was found before gaps were closed (Grid, same size)
 * @param k      pixels per mm
 * @param minArea big enough to count as a piece, mm²
 * @param seam   pieces meeting along this many mm or more are cut apart
 * @param gapMm  how far the gap closing reached, mm (cleared again along a cut)
 * @param image  the photo: a seam is only cut where it runs over bare paper
 */
export function separateNeighbours(mask, raw, k, { minArea = 150, seam = 12, gapMm = 1.6, image = null } = {}) {
  const { width: W, height: H } = mask, n = W * H, m = mask.data;
  const inRaw = { width: W, height: H, data: new Uint8Array(n) };
  for (let i = 0; i < n; i++) if (m[i] >= 0.5 && raw.data[i] >= 0.5) inRaw.data[i] = 1;
  const { labels, count, sizes } = components(inRaw);
  const big = new Uint8Array(count + 1);
  let nBig = 0;
  for (let l = 1; l <= count; l++) if (sizes[l] >= minArea * k * k * 0.5) { big[l] = 1; nBig++; }
  if (nBig < 2) return mask;
  // Every mask pixel goes to the nearest big piece (a flood out from all of them at once).
  const owner = new Int32Array(n), queue = new Int32Array(n);
  let head = 0, tail = 0;
  for (let i = 0; i < n; i++) if (big[labels[i]]) { owner[i] = labels[i]; queue[tail++] = i; }
  while (head < tail) {
    const p = queue[head++], x = p % W;
    for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p >= W ? p - W : -1, p + W < n ? p + W : -1]) {
      if (q >= 0 && !owner[q] && m[q] >= 0.5) { owner[q] = owner[p]; queue[tail++] = q; }
    }
  }
  // The paper: the typical colour of what's outside the mask.
  let paper = null;
  if (image) {
    const d = image.data, rs = [], gs = [], bs = [];
    for (let i = 0; i < n; i += 13) if (m[i] < 0.5) { rs.push(d[4 * i]); gs.push(d[4 * i + 1]); bs.push(d[4 * i + 2]); }
    const med = (v) => v.sort((x, y) => x - y)[v.length >> 1];
    if (rs.length > 50) paper = [med(rs), med(gs), med(bs)];
  }
  // A seam pixel over bare paper: within a few levels of the paper's colour. A
  // highlight on polished metal is brighter than the paper; a tool is darker or tinted.
  const bare = (p) => !paper || (Math.abs(image.data[4 * p] - paper[0]) < 9 && Math.abs(image.data[4 * p + 1] - paper[1]) < 9 && Math.abs(image.data[4 * p + 2] - paper[2]) < 9);
  // How long each pair of pieces meets for, and how much of that is over bare paper.
  const seamLen = new Map(), seamBare = new Map();
  const key = (a, b) => (a < b ? a * (count + 1) + b : b * (count + 1) + a);
  for (let p = 0; p < n; p++) {
    const a = owner[p];
    if (!a) continue;
    const x = p % W;
    for (const q of [x < W - 1 ? p + 1 : -1, p + W < n ? p + W : -1]) {
      const b = q >= 0 ? owner[q] : 0;
      if (b && b !== a) { const kk = key(a, b); seamLen.set(kk, (seamLen.get(kk) || 0) + 1); if (bare(p)) seamBare.set(kk, (seamBare.get(kk) || 0) + 1); }
    }
  }
  // Pieces meeting only briefly are one thing; group them.
  const parent = Int32Array.from({ length: count + 1 }, (_, i) => i);
  const find = (a) => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
  let cut = false;
  for (const [kk, len] of seamLen) {
    const a = Math.floor(kk / (count + 1)), b = kk % (count + 1);
    if (len / k < seam || (seamBare.get(kk) || 0) < len * 0.6) parent[find(a)] = find(b); else cut = true;
  }
  if (!cut) return mask;
  // Cut along each long seam: of two touching pixels in different groups, the
  // upper or left one goes, which leaves no 4-connected path between them.
  const seamPx = [];
  for (let p = 0; p < n; p++) {
    const a = owner[p];
    if (!a) continue;
    const x = p % W, ga = find(a);
    for (const q of [x < W - 1 ? p + 1 : -1, p + W < n ? p + W : -1]) {
      const b = q >= 0 ? owner[q] : 0;
      if (b && find(b) !== ga) { m[p] = 0; seamPx.push(p, q); break; }
    }
  }
  // The gap between them was filled when gaps were closed: clear it again, out
  // from the seam over pixels that weren't found as tool, about as far as the
  // closing reached, so each outline keeps its own size.
  const reach = Math.round(gapMm * k), depth = new Int16Array(n).fill(-1);
  head = 0; tail = 0;
  for (const p of seamPx) if (p >= 0 && depth[p] < 0) { depth[p] = 0; queue[tail++] = p; }
  while (head < tail) {
    const p = queue[head++], x = p % W;
    if (!raw.data[p]) m[p] = 0;
    if (depth[p] >= reach) continue;
    for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p >= W ? p - W : -1, p + W < n ? p + W : -1]) {
      if (q >= 0 && depth[q] < 0 && owner[q] && !raw.data[q]) { depth[q] = depth[p] + 1; queue[tail++] = q; }
    }
  }
  return mask;
}
