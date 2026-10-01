// Split: when two tools lie so close that the trace draws one outline round
// both, a line drawn across it (where they touch) cuts it in two. The
// outline is filled on a fine grid, a thin band along the line is cleared,
// and each piece left is traced on its own. Works on any shape, however
// hooked or hollow-sided (pliers, cutters).
import { Grid, fillPolygon, components, traceContours, boxBlur, offsetMask } from '../geometry/raster.js';
import { signedArea, simplifyClosed } from '../geometry/polygon.js';

// Distance from (x, y) to the segment a–b.
function toSegment(x, y, [ax, ay], [bx, by]) {
  const vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1)));
  return Math.hypot(ax + vx * t - x, ay + vy * t - y);
}

// Does the segment a–b cross the edge p–q?
function crosses(a, b, p, q) {
  const side = (o, s, t) => (s[0] - o[0]) * (t[1] - o[1]) - (s[1] - o[1]) * (t[0] - o[0]);
  const d1 = side(a, b, p), d2 = side(a, b, q), d3 = side(p, q, a), d4 = side(p, q, b);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

/** How many times the line a–b crosses the outline's edge (2 or more: it cuts across). */
export function crossings(poly, a, b) {
  let n = 0;
  poly.forEach((p, i) => { if (crosses(a, b, p, poly[(i + 1) % poly.length])) n++; });
  return n;
}

/**
 * Cut an outline along the line from a to b, leaving `gap` mm between the
 * pieces. Returns the pieces as polygons (mm), largest first, or null when the
 * line doesn't cut it into two or more pieces of at least `minArea` mm².
 */
export function splitOutline(poly, a, b, { gap = 1.5, res = 0.25, minArea = 25 } = {}) {
  if (crossings(poly, a, b) < 2) return null;
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const grid = Grid.covering(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), res, 4);
  fillPolygon(grid, poly, 1);
  const { width: W, height: H } = grid;
  const half = Math.max(res, gap / 2);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    if (!grid.data[k]) continue;
    const [x, y] = grid.toWorld([i, j]);
    if (toSegment(x, y, a, b) <= half) grid.data[k] = 0;
  }
  const { labels, count, sizes } = components(grid);
  const keep = [];
  for (let c = 1; c <= count; c++) if (sizes[c] * res * res >= minArea) keep.push(c);
  if (keep.length < 2) return null;
  const pieces = keep.map((c) => {
    const one = new Grid(W, H, grid.x0, grid.y0, res);
    for (let k = 0; k < labels.length; k++) if (labels[k] === c) one.data[k] = 1;
    const loops = traceContours(boxBlur(one, 1), 0.5);
    let outer = loops[0];
    for (const l of loops) if (Math.abs(signedArea(l)) > Math.abs(signedArea(outer))) outer = l;
    return simplifyClosed(outer, 0.15);
  }).filter((p) => p && p.length >= 3);
  if (pieces.length < 2) return null;
  return pieces.sort((p, q) => Math.abs(signedArea(q)) - Math.abs(signedArea(p)));
}

/**
 * Two tools lying so they touch are found as one region. Shrinking it by
 * `neck` mm breaks the narrow place where they meet, but not a tool's own
 * shaft or jaws; when that leaves two or more good-sized parts, each pixel of
 * the region goes to the part it reaches first without leaving the region.
 * Parts much smaller than the rest (under `minShare` of the biggest) aren't
 * split off. `mask` is a Grid (res in mm). Returns { labels (1..count),
 * count }, or null when it's one tool.
 */
export function partByNecks(mask, { neck = 2.5, minCore = 150, minShare = 0.25 } = {}) {
  const { width: W, height: H, res, data } = mask;
  const core = offsetMask(mask, -neck / res);
  const { labels: cl, count, sizes } = components(core);
  const keep = new Int32Array(count + 1);
  let n = 0;
  for (let c = 1; c <= count; c++) if (sizes[c] * res * res >= minCore) keep[c] = ++n;
  if (n < 2) return null;
  const labels = new Int32Array(W * H);
  const queue = new Int32Array(W * H);
  let head = 0, tail = 0;
  for (let k = 0; k < W * H; k++) if (cl[k] && keep[cl[k]]) { labels[k] = keep[cl[k]]; queue[tail++] = k; }
  while (head < tail) {
    const k = queue[head++], x = k % W;
    for (const q of [x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1, k - W, k + W]) {
      if (q >= 0 && q < W * H && !labels[q] && data[q] >= 0.5) { labels[q] = labels[k]; queue[tail++] = q; }
    }
  }
  // A piece the parts can't reach (lying apart from them) would be lost:
  // leave the region whole rather than drop part of a tool.
  let on = 0;
  for (let k = 0; k < W * H; k++) if (data[k] >= 0.5) on++;
  if (tail < on * 0.99) return null;
  // A narrow place in one tool (a handle where it meets the head, around a
  // glint) can look like a join too. Two tools lying together are much the
  // same size; a piece a fifth the size of the rest, or less, is part of it.
  const size = new Float64Array(n + 1);
  for (let k = 0; k < W * H; k++) if (labels[k]) size[labels[k]]++;
  const big = Math.max(...size.slice(1));
  if (size.slice(1).some((v) => v < big * minShare)) return null;
  return { labels, count: n };
}
