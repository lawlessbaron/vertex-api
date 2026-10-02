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

// Tools that touch with no paper between them, told apart by colour: a red
// screwdriver lying against a black probe, a blue ruler across an orange
// knife. Each shape's pixels are split into their two main colours; it's cut
// in two only when each colour is one solid piece and the two lie side by
// side or at an angle. Two colours end to end along one line (a handle and
// its shaft), a colour broken up by the other (a grip stripe, a band), one
// colour wrapped in the other (a tin's lid in its rim), or a grey that is
// only a dimmer paper (a shadow) all stay one tool.
export function splitByColour(mask, image, k, { minArea = 150, paper = null } = {}) {
  if (!image) return mask;
  const { width: W, height: H } = mask, n = W * H, m = mask.data, d = image.data;
  const blobs = components({ width: W, height: H, data: Uint8Array.from(m, (v) => (v >= 0.5 ? 1 : 0)) });
  const minPx = minArea * k * k;
  if (!paper) {
    const rs = [], gs = [], bs = [];
    for (let i = 0; i < n; i += 17) if (m[i] < 0.5) { rs.push(d[4 * i]); gs.push(d[4 * i + 1]); bs.push(d[4 * i + 2]); }
    const med = (v) => v.sort((x, y) => x - y)[v.length >> 1];
    paper = rs.length > 50 ? [med(rs), med(gs), med(bs)] : [240, 240, 240];
  }
  const paperL = (paper[0] + paper[1] + paper[2]) / 3;
  // Pixels of each blob, gathered once.
  const px = new Map();
  for (let i = 0; i < n; i++) { const l = blobs.labels[i]; if (l && blobs.sizes[l] >= 2 * minPx) (px.get(l) || px.set(l, []).get(l)).push(i); }
  for (const pts of px.values()) {
    // The fringe round a shape (paper-coloured pixels the gap closing took in) isn't either tool's colour: leave it out.
    const near = (i) => Math.abs(d[4 * i] - paper[0]) + Math.abs(d[4 * i + 1] - paper[1]) + Math.abs(d[4 * i + 2] - paper[2]) < 45;
    const body = pts.filter((i) => !near(i));
    const two = body.length > minPx ? twoColours(body, d) : null;
    if (!two) continue;
    const [ca, cb] = two.centres;
    if (Math.hypot(ca[0] - cb[0], ca[1] - cb[1], ca[2] - cb[2]) < 70) continue; // not two different colours
    // A shadow is the paper's own colour, only dimmer: never a tool of its own.
    const shadowy = (c) => { const L = (c[0] + c[1] + c[2]) / 3, chroma = Math.max(...c) - Math.min(...c); return chroma < 20 && L > paperL * 0.45 && L < paperL * 0.98; };
    if (shadowy(ca) || shadowy(cb)) continue;
    // Each colour's main piece, and how much of that colour it holds.
    const lab = new Int8Array(n);
    for (const p of body) lab[p] = two.of(p) + 1;
    const pieceA = biggestPiece(body, lab, 1, W, n), pieceB = biggestPiece(body, lab, 2, W, n);
    const countA = body.reduce((s, p) => s + (lab[p] === 1), 0), countB = body.length - countA;
    const big = (piece, count) => piece.length >= Math.max(minPx, body.length * 0.15) && piece.length >= count * 0.8;
    if (!big(pieceA, countA) || !big(pieceB, countB)) continue; // a stripe or speckle: one tool
    // One colour mostly wrapped in the other (a tin's lid in its rim, a label on a case): one thing.
    const small = pieceA.length < pieceB.length ? pieceA : pieceB, other = small === pieceA ? 2 : 1;
    let edge = 0, wrapped = 0;
    for (const p of small) { const x = p % W; for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p >= W ? p - W : -1, p + W < n ? p + W : -1]) if (q < 0 || lab[q] !== lab[p]) { edge++; if (q >= 0 && lab[q] === other) wrapped++; } }
    if (wrapped > edge * 0.7) continue;
    const a = shapeOf(pieceA, W), b = shapeOf(pieceB, W);
    // End to end along one line: one tool in two colours.
    let dAng = Math.abs(a.angle - b.angle) % Math.PI; dAng = Math.min(dAng, Math.PI - dAng);
    const dx = b.cx - a.cx, dy = b.cy - a.cy, along = Math.abs(dx * Math.cos(a.angle) + dy * Math.sin(a.angle)), across = Math.abs(-dx * Math.sin(a.angle) + dy * Math.cos(a.angle));
    if (dAng < 0.35 && across < Math.max(a.halfW, b.halfW) * 1.2 + k && along > 0.6 * (a.halfL + b.halfL)) continue;
    // Two tools: every pixel goes to the nearer piece, then the seam between them is cleared.
    const owner = new Int8Array(n), queue = new Int32Array(pts.length), inBlob = new Uint8Array(n);
    for (const p of pts) inBlob[p] = 1;
    let head = 0, tail = 0;
    for (const p of pieceA) { owner[p] = 1; queue[tail++] = p; }
    for (const p of pieceB) { owner[p] = 2; queue[tail++] = p; }
    while (head < tail) {
      const p = queue[head++], x = p % W;
      for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p >= W ? p - W : -1, p + W < n ? p + W : -1]) if (q >= 0 && !owner[q] && inBlob[q]) { owner[q] = owner[p]; queue[tail++] = q; }
    }
    const seam = Math.max(2, Math.round(0.4 * k)); // wide enough that the smoothing before outlining doesn't bridge it
    const cutPx = [];
    for (const p of pts) { const x = p % W; for (const q of [x < W - 1 ? p + 1 : -1, p + W < n ? p + W : -1]) if (q >= 0 && owner[q] && owner[q] !== owner[p]) { cutPx.push(p); break; } }
    for (const p of cutPx) { const x = p % W, y = (p - x) / W; for (let yy = y - seam + 1; yy < y + seam; yy++) for (let xx = x - seam + 1; xx < x + seam; xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < H) m[yy * W + xx] = 0; }
  }
  return mask;
}

// The two main colours of some pixels (2-means on a sample), and which one a pixel is nearer.
function twoColours(pts, d) {
  const step = Math.max(1, Math.floor(pts.length / 20000)), s = [];
  for (let i = 0; i < pts.length; i += step) { const p = pts[i] * 4; s.push([d[p], d[p + 1], d[p + 2]]); }
  if (s.length < 50) return null;
  const mean = [0, 1, 2].map((c) => s.reduce((t, v) => t + v[c], 0) / s.length);
  const dist = (u, v) => (u[0] - v[0]) ** 2 + (u[1] - v[1]) ** 2 + (u[2] - v[2]) ** 2;
  let c1 = s.reduce((best, v) => (dist(v, mean) > dist(best, mean) ? v : best), s[0]);
  let c2 = s.reduce((best, v) => (dist(v, c1) > dist(best, c1) ? v : best), s[0]);
  for (let it = 0; it < 8; it++) {
    const sum = [[0, 0, 0, 0], [0, 0, 0, 0]];
    for (const v of s) { const j = dist(v, c1) <= dist(v, c2) ? 0 : 1; sum[j][0] += v[0]; sum[j][1] += v[1]; sum[j][2] += v[2]; sum[j][3]++; }
    if (!sum[0][3] || !sum[1][3]) return null;
    c1 = sum[0].slice(0, 3).map((t) => t / sum[0][3]); c2 = sum[1].slice(0, 3).map((t) => t / sum[1][3]);
  }
  return { centres: [c1, c2], of: (p) => { const v = [d[4 * p], d[4 * p + 1], d[4 * p + 2]]; return dist(v, c1) <= dist(v, c2) ? 0 : 1; } };
}
// The largest 4-connected piece of the pixels labelled `which`.
function biggestPiece(pts, lab, which, W, n) {
  const seen = new Uint8Array(n);
  let best = [];
  for (const start of pts) {
    if (lab[start] !== which || seen[start]) continue;
    const piece = [start]; seen[start] = 1;
    for (let h = 0; h < piece.length; h++) {
      const p = piece[h], x = p % W;
      for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p >= W ? p - W : -1, p + W < n ? p + W : -1]) if (q >= 0 && !seen[q] && lab[q] === which) { seen[q] = 1; piece.push(q); }
    }
    if (piece.length > best.length) best = piece;
  }
  return best;
}
// A piece's centre, main direction and half length and width (from its spread).
function shapeOf(piece, W) {
  let sx = 0, sy = 0;
  for (const p of piece) { sx += p % W; sy += Math.floor(p / W); }
  const cx = sx / piece.length, cy = sy / piece.length;
  let xx = 0, yy = 0, xy = 0;
  for (const p of piece) { const dx = (p % W) - cx, dy = Math.floor(p / W) - cy; xx += dx * dx; yy += dy * dy; xy += dx * dy; }
  xx /= piece.length; yy /= piece.length; xy /= piece.length;
  const tr = xx + yy, det = xx * yy - xy * xy, gap = Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const l1 = tr / 2 + gap, l2 = Math.max(0, tr / 2 - gap);
  return { cx, cy, angle: 0.5 * Math.atan2(2 * xy, xx - yy), halfL: Math.sqrt(3 * l1), halfW: Math.sqrt(3 * l2) };
}
