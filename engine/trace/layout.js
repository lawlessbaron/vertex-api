// Laying traced tools out on a bin, like arranging real tools in a drawer:
// each tool keeps its own outline (in mm, centred on itself) and is placed at
// (x, y) turned by `rot` degrees. The bin's inside is centred on (0, 0), with y
// running away from you (up the screen). Pure functions, shared by the trace
// page and the tests.
import { signedArea } from '../geometry/polygon.js';
import { Grid, fillPolygon, offsetMask, fillHoles, traceContours } from '../geometry/raster.js';

export const PITCH = 42;
// Room inside a bin of gx × gy units: the wall and the margin every pocket keeps from it.
export const insideOf = (gx, gy, { wall = 1.2, margin = 1.2 } = {}) => ({ w: gx * PITCH - 0.5 - 2 * (wall + margin), d: gy * PITCH - 0.5 - 2 * (wall + margin) });

/** An outline moved so its middle (of its box) sits on (0, 0). */
export function centred(poly) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return poly.map(([x, y]) => [x - cx, y - cy]);
}

/** A tool's outline where it sits on the bin. */
export function placed(tool) {
  const t = (tool.rot || 0) * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  return tool.poly.map(([x, y]) => [tool.x + x * c - y * s, tool.y + x * s + y * c]);
}

export function boxOf(poly) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}

function inside(pt, poly) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function segmentsCross(a, b, c, d) {
  return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
}
/** Whether two outlines overlap (touching edges don't count). */
export function overlap(p, q) {
  const [a0, b0, a1, b1] = boxOf(p), [c0, d0, c1, d1] = boxOf(q);
  if (a1 <= c0 || c1 <= a0 || b1 <= d0 || d1 <= b0) return false;
  if (inside(p[0], q) || inside(q[0], p)) return true;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    for (let j = 0; j < q.length; j++) if (segmentsCross(a, b, q[j], q[(j + 1) % q.length])) return true;
  }
  return false;
}

/**
 * Where a finger hole of diameter `dia` goes in a pocket: the point deepest
 * inside it (furthest from every edge), so it always lands on the tool. The
 * middle of the box can be outside the tool altogether: the gap between a
 * pair of pliers' handles. null when the pocket is too narrow for a useful hole.
 */
export function fingerSpot(poly, dia) {
  if (!(dia > 0) || poly.length < 3) return null;
  const edgeDist = ([px, py]) => {
    let best = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [ax, ay] = poly[j], [bx, by] = poly[i], dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
      const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
      best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy));
    }
    return best;
  };
  const [x0, y0, x1, y1] = boxOf(poly);
  let at = null, depth = 0;
  const scan = (cx0, cy0, cx1, cy1, step) => {
    for (let y = cy0; y <= cy1; y += step) for (let x = cx0; x <= cx1; x += step) {
      if (!inside([x, y], poly)) continue;
      const d = edgeDist([x, y]);
      if (d > depth) { depth = d; at = [x, y]; }
    }
  };
  const step = Math.max(0.5, Math.min(x1 - x0, y1 - y0) / 30);
  scan(x0, y0, x1, y1, step);
  if (at) { const [ax, ay] = at; scan(ax - step, ay - step, ax + step, ay + step, step / 6); }
  // Same bar as before: the tool must be wider than 0.6 of the hole there.
  return at && depth >= 0.3 * dia ? at.map((v) => Math.round(v * 100) / 100) : null;
}

/**
 * The pocket round a tool: its outline grown by r mm all round (on a fine grid),
 * and with round, grown that much further and shrunk back, which fills notches
 * and tight inside corners without ever cutting into the tool.
 */
export function growPocket(poly, r, round = 0) {
  if (!(r > 0) && !(round > 0)) return poly;
  const res = 0.25, m = Math.max(0, r) + round + 2, xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const x0 = Math.min(...xs) - m, y0 = Math.min(...ys) - m;
  const g = new Grid(Math.ceil((Math.max(...xs) + m - x0) / res), Math.ceil((Math.max(...ys) + m - y0) / res), x0, y0, res);
  fillPolygon(g, poly);
  let mask = r > 0 ? offsetMask(g, r / res) : g;
  if (round > 0) mask = fillHoles(offsetMask(offsetMask(mask, round / res), -round / res));
  const loops = traceContours(mask);
  const big = loops.reduce((b, l) => (l.length > (b?.length || 0) ? l : b), null);
  return big || poly; // contours come back in mm already (Grid.toWorld)
}

/**
 * The smallest bin (whole cells, up to 8 × 8) whose rows hold every pocket
 * without clashing: tools are { poly } centred on themselves. → { gx, gy, tools } or null.
 */
export function smallestBin(tools, gap = 3) {
  const sizes = [];
  for (let gx = 1; gx <= 8; gx++) for (let gy = 1; gy <= 8; gy++) sizes.push([gx, gy]);
  sizes.sort((a, b) => a[0] * a[1] - b[0] * b[1] || Math.abs(a[0] - a[1]) - Math.abs(b[0] - b[1]));
  for (const [gx, gy] of sizes) {
    const laid = pack(tools, gx, gy, gap);
    if (problems(laid, gx, gy).ok) return { gx, gy, tools: laid };
  }
  return null;
}

/** What's wrong with a layout: tools off the bin, and tools on top of each other. */
export function problems(tools, gx, gy) {
  const { w, d } = insideOf(gx, gy), out = new Set(), clash = new Set();
  const polys = tools.map(placed);
  polys.forEach((p, i) => {
    const [x0, y0, x1, y1] = boxOf(p);
    if (x0 < -w / 2 || x1 > w / 2 || y0 < -d / 2 || y1 > d / 2) out.add(i);
    // Shapes (finger notches, cut-outs) may overlap tools: that's what they're for.
    for (let j = i + 1; j < polys.length; j++) if (!tools[i].shape && !tools[j].shape && overlap(p, polys[j])) { clash.add(i); clash.add(j); }
  });
  return { out, clash, ok: !out.size && !clash.size };
}

/** A simple shape's outline (mm, centred): a finger notch (a stadium), circle, square, rectangle or rounded rectangle. */
export function shapeOutline({ kind, w, h, r: corner = null }) {
  const arc = (cx, cy, r, a0, a1, n) => Array.from({ length: n + 1 }, (_, k) => { const a = a0 + ((a1 - a0) * k) / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
  if (kind === 'circle') return arc(0, 0, w / 2, 0, 2 * Math.PI, 48).slice(0, -1);
  const W = w, H = kind === 'square' ? w : h;
  const r = kind === 'notch' ? Math.min(W, H) / 2 : corner != null ? Math.min(corner, Math.min(W, H) / 2) : kind === 'rrect' ? Math.min(W, H) * 0.2 : 0;
  if (!r) return [[-W / 2, -H / 2], [W / 2, -H / 2], [W / 2, H / 2], [-W / 2, H / 2]];
  const x = W / 2 - r, y = H / 2 - r;
  return [...arc(x, -y, r, -Math.PI / 2, 0, 10), ...arc(x, y, r, 0, Math.PI / 2, 10), ...arc(-x, y, r, Math.PI / 2, Math.PI, 10), ...arc(-x, -y, r, Math.PI, 1.5 * Math.PI, 10)];
}
export const SHAPES = { notch: ['Finger notch', 22, 36], circle: ['Circle', 30, 30], square: ['Square', 30, 30], rect: ['Rectangle', 40, 25], rrect: ['Rounded rect', 40, 25] };

/** Rounded corners for a compartment locked to the grid, as in a standard bin. */
export const CELL_FILLET = 4;
/**
 * A box ({x, y, w, h}, centred, mm) locked to the bin's grid: on the
 * grid lines (cells of step × 42 mm): as many cells as it nearly fills, in the nearest place; set in to the bin's inside at the
 * rim and by half a 1.2 mm divider between cells. At least one cell each way.
 */
export function lockToGrid({ x, y, w, h }, gx, gy, step = 1, { gap = 0.6 } = {}) {
  const axis = (c, size, units) => {
    const total = units * PITCH, cell = PITCH * step, lines = [];
    for (let k = 0; k < total - 0.01; k += cell) lines.push(k - total / 2);
    lines.push(total / 2);
    const near = (v) => lines.reduce((b, l, i) => (Math.abs(l - v) < Math.abs(lines[b] - v) ? i : b), 0);
    // Keep how many cells it spans (so a drag to the edge doesn't shrink it), then its nearest place.
    const n = Math.max(1, Math.min(lines.length - 1, Math.round((size + 2 * gap) / cell)));
    const a = Math.max(0, Math.min(lines.length - 1 - n, near(c - size / 2))), b = a + n;
    const edge = 2.7; // the inside of the bin: 0.25 mm clearance, 1.2 mm wall, 1.2 mm margin, a hair more
    const lo = lines[a] + (a === 0 ? edge : gap), hi = lines[b] - (b === lines.length - 1 ? edge : gap);
    return [(lo + hi) / 2, hi - lo];
  };
  const [cx, cw] = axis(x, w, gx), [cy, ch] = axis(y, h, gy);
  return { x: cx, y: cy, w: Math.round(cw * 100) / 100, h: Math.round(ch * 100) / 100 };
}

/** The smallest bin (up to 8 × 8) that holds every tool where it is now, centred. step: 1, or 0.5 for half units. */
export function fitGrid(tools, step = 1) {
  if (!tools.length) return { gx: 2, gy: 2 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of tools) { const [a, b, c, d] = boxOf(placed(t)); x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d); }
  const need = (span) => Math.min(8, Math.max(1, Math.ceil((span + 0.5 + 2 * 2.4) / (PITCH * step)) * step));
  return { gx: need(x1 - x0), gy: need(y1 - y0), shift: [-(x0 + x1) / 2, -(y0 + y1) / 2] };
}

/** Tools packed in rows, longest first, turned to lie along the bin: a starting layout. */
export function pack(tools, gx, gy, gap = 3) {
  const { w, d } = insideOf(gx, gy);
  const order = tools.map((t, i) => i).sort((a, b) => spanOf(tools[b]) - spanOf(tools[a]));
  let x = -w / 2, y = d / 2, rowH = 0;
  const out = tools.map((t) => ({ ...t }));
  for (const i of order) {
    const t = out[i];
    // Lie it the long way along the bin's depth.
    const [a, b, c, e] = boxOf(t.poly);
    t.rot = (c - a > e - b) === (d >= w) ? 90 : 0;
    const [p0, q0, p1, q1] = boxOf(placed({ ...t, x: 0, y: 0 }));
    const tw = p1 - p0, th = q1 - q0;
    if (x + tw > w / 2 && x > -w / 2) { x = -w / 2; y -= rowH + gap; rowH = 0; }
    t.x = x - p0; t.y = y - q1;
    x += tw + gap; rowH = Math.max(rowH, th);
  }
  return out;
}
const spanOf = (t) => { const [a, b, c, d] = boxOf(t.poly); return Math.max(c - a, d - b); };

/** A tool outline with its points running anticlockwise (what the bin maker expects). */
export const ccw = (poly) => (signedArea(poly) < 0 ? [...poly].reverse() : poly);
