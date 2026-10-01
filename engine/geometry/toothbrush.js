// Toothbrush holders. A holder with a hole for each brush and one for the
// toothpaste, with a short tube under each hole to keep the handles upright,
// open underneath so it drains and dries. It prints upside down (top on the
// bed), so nothing needs support. A drip tray with ribs, which the holder
// stands on above the water, is optional.
import { Mesh } from './mesh.js';
import { circlePolygon, extrudePolygon } from './polygon.js';

export const TOOTHBRUSH_DEFAULTS = {
  brushes: 4,
  paste: true,
  brush: 18, // brush hole, mm
  pasteHole: 42,
  height: 90,
  tube: 25, // guide tube under each hole
  tray: true,
  wall: 2.4,
};

function roundedRect(W, D, r, n = 8) {
  const pts = [], hx = W / 2 - r, hy = D / 2 - r;
  for (const [cx, cy, a0] of [[hx, -hy, -90], [hx, hy, 0], [-hx, hy, 90], [-hx, -hy, 180]]) {
    for (let k = 0; k <= n; k++) { const a = ((a0 + (90 * k) / n) * Math.PI) / 180; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  }
  return pts;
}

export function toothbrushPlan(options = {}) {
  const o = { ...TOOTHBRUSH_DEFAULTS, ...options };
  const n = Math.max(1, Math.min(8, Math.round(o.brushes))), b = Math.max(10, o.brush), pz = Math.max(20, o.pasteHole);
  const wall = Math.max(1.6, o.wall), tw = 1.6, gap = 4;
  const holes = [];
  let x = 0;
  for (let i = 0; i < n; i++) { holes.push({ x: x + b / 2, r: b / 2 }); x += b + 2 * tw + gap; }
  if (o.paste) { holes.push({ x: x + pz / 2, r: pz / 2 }); x += pz + 2 * tw + gap; }
  const span = x - gap, shift = -span / 2 + tw;
  for (const h of holes) h.x += shift;
  const D = Math.max(b, o.paste ? pz : 0) + 2 * tw + 2 * wall + 8, W = span + 2 * wall + 8;
  return { o, n, wall, tw, holes, W, D, H: Math.max(40, o.height), tube: Math.max(8, Math.min(o.tube, o.height - 10)) };
}

export function generateToothbrushHolder(options = {}) {
  const p = toothbrushPlan(options);
  const { o, W, D, H, wall, tw } = p;
  const r = Math.min(10, D / 3), top = 3, seg = 48;
  const outline = roundedRect(W, D, r);
  const holder = new Mesh();
  // The top (on the bed as it prints), with the holes.
  holder.append(extrudePolygon(outline, p.holes.map((h) => circlePolygon(h.x, 0, h.r, seg).reverse()), 0, top));
  // The outer wall, open at the far end (the bottom, in use).
  holder.append(extrudePolygon(outline, [roundedRect(W - 2 * wall, D - 2 * wall, Math.max(1, r - wall)).reverse()], top - 0.01, H));
  // A guide tube under each hole.
  for (const h of p.holes) holder.append(extrudePolygon(circlePolygon(h.x, 0, h.r + tw, seg), [circlePolygon(h.x, 0, h.r, seg).reverse()], top - 0.01, top + p.tube));
  const parts = [{ mesh: holder, name: `toothbrush-holder-${p.n}` }];
  // The holder the way up it's used, for the preview: turned over about x.
  const upright = new Mesh();
  upright.append(holder);
  const q = upright.positions;
  for (let i = 0; i < q.length; i += 3) { q[i + 1] = -q[i + 1]; q[i + 2] = H - q[i + 2]; }
  const notes = [`Holds ${p.n} brush${p.n > 1 ? 'es' : ''}${o.paste ? ' and the toothpaste' : ''}. It prints upside down, top on the bed: turn it over to use it. Open underneath, so it drains.`];
  if (o.tray) {
    // A tray it stands in, with ribs to hold it above the water.
    const c = 1, tWall = 2, floor = 2, rim = 8, Wt = W + 2 * (c + tWall), Dt = D + 2 * (c + tWall);
    const tray = extrudePolygon(roundedRect(Wt, Dt, r + c + tWall), [], 0, floor);
    tray.append(extrudePolygon(roundedRect(Wt, Dt, r + c + tWall), [roundedRect(W + 2 * c, D + 2 * c, r + c).reverse()], floor - 0.01, floor + rim));
    for (let x = -W / 2 + 6; x <= W / 2 - 6; x += 10) tray.append(extrudePolygon([[x - 1, -D / 2], [x + 1, -D / 2], [x + 1, D / 2], [x - 1, D / 2]], [], floor - 0.01, floor + 2));
    tray.translate(0, D / 2 + Dt / 2 + 8, 0);
    parts.push({ mesh: tray, name: 'drip-tray' });
    notes.push('The holder stands on 2 mm ribs in the tray, so water runs off underneath. Tip it out now and then.');
  }
  return { parts, notes, plan: p, upright };
}
