// Cable boxes: a box that hides a power strip and its plugs. A base with a
// U-slot in each end for the cables in and out (and one in the back if you
// like), and a lid that drops over it on an inner lip, with vent slots so a
// strip and its chargers never get warm. The base prints upright, the lid top
// down; neither needs supports (the slots are open at the top, the vents run
// straight through).
import { Mesh } from './mesh.js';
import { extrudePolygon, orient } from './polygon.js';

export const CABLEBOX_DEFAULTS = {
  stripL: 300, // the power strip, end to end (mm)
  stripW: 55,
  plugH: 70, // the tallest plug or charger standing in it
  wall: 2.4,
  floor: 2.4,
  slot: 26, // the cable slots' width
  backSlot: false, // a third slot in the back wall
  vents: true,
  clearance: 0.3, // round the lid's lip
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
function rounded(w, d, r, inset = 0, seg = 6) {
  const pts = [], hw = w / 2 - inset, hd = d / 2 - inset, rr = Math.max(0.3, r - inset);
  for (const [qx, qy, a0] of [[1, -1, -90], [1, 1, 0], [-1, 1, 90], [-1, -1, 180]]) for (let k = 0; k <= seg; k++) { const a = ((a0 + (90 * k) / seg) * Math.PI) / 180; pts.push([qx * (hw - rr) + rr * Math.cos(a), qy * (hd - rr) + rr * Math.sin(a)]); }
  return pts;
}
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

export function cableBoxPlan(options = {}) {
  const o = { ...CABLEBOX_DEFAULTS, ...options };
  const t = num(o.wall, 1.6, 4, 2.4), f = num(o.floor, 1.6, 4, 2.4), c = num(o.clearance, 0.1, 0.8, 0.3);
  // Room round the strip for plugs that stick out sideways and the cables' bend.
  const L = num(o.stripL, 120, 420, 300) + 2 * 20 + 2 * t, W = num(o.stripW, 30, 120, 55) + 2 * 25 + 2 * t, H = num(o.plugH, 30, 120, 70) + f + 8;
  const slot = Math.min(num(o.slot, 12, 50, 26), W - 2 * t - 10), slotDepth = Math.min(H * 0.5, slot + 6);
  return { o, t, f, c, L, W, H, slot, slotDepth, lidT: 3, lip: 8 };
}

export function generateCableBox(options = {}) {
  const p = cableBoxPlan(options), { o, t, f, c, L, W, H, slot, slotDepth, lidT, lip } = p, r = 6;
  // The base: floor, then the wall as one ring up to the slots' bottom, then
  // the wall in pieces either side of each slot up to the top.
  const base = new Mesh(), zs = H - slotDepth;
  base.append(extrudePolygon(rounded(L, W, r, 0.4), [], 0, 0.4));
  base.append(extrudePolygon(rounded(L, W, r), [], 0.4, f));
  base.append(extrudePolygon(rounded(L, W, r), [orient(rounded(L, W, r, t), false)], f, zs));
  // Above the slots' bottom: the ring, cut where the slots are. Built from
  // the long walls, the end walls either side of the slot, and the corners.
  const hs = slot / 2, xL = L / 2, yW = W / 2, cr = r; // corner zones keep the rounding
  const pieces = [
    rect(-xL + cr, -yW, xL - cr, -yW + t), // front wall
    o.backSlot ? null : rect(-xL + cr, yW - t, xL - cr, yW), // back wall, whole
    ...(o.backSlot ? [rect(-xL + cr, yW - t, -hs, yW), rect(hs, yW - t, xL - cr, yW)] : []),
    rect(-xL, -yW + cr, -xL + t, -hs), rect(-xL, hs, -xL + t, yW - cr), // left end, either side of its slot
    rect(xL - t, -yW + cr, xL, -hs), rect(xL - t, hs, xL, yW - cr), // right end
  ].filter(Boolean);
  for (const q of pieces) base.append(extrudePolygon(q, [], zs, H));
  // The four corners: the rounded ring's corner pieces.
  for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const outer = rounded(L, W, r).filter(([x, y]) => sx * x >= xL - cr - 1e-6 && sy * y >= yW - cr - 1e-6);
    const inner = rounded(L, W, r, t).filter(([x, y]) => sx * x >= xL - cr - 1e-6 && sy * y >= yW - cr - 1e-6);
    const ring = [...outer, ...inner.reverse()];
    // A corner piece from the outer arc back along the inner arc, closed through the wall's ends.
    const poly = [[sx * (xL - cr), sy * yW], ...ring, [sx * (xL - cr), sy * (yW - t)]].filter((q, i, a) => i === 0 || Math.hypot(q[0] - a[i - 1][0], q[1] - a[i - 1][1]) > 1e-6);
    base.append(extrudePolygon(orient(poly, true), [], zs, H));
  }
  // The lid, modelled top down (as it prints): a plate with vent slots, and a
  // lip that drops inside the walls.
  const lid = new Mesh(), il = L - 2 * t - 2 * c, iw = W - 2 * t - 2 * c, vents = [];
  if (o.vents !== false) {
    const vw = 3, gap = 6, n = Math.floor((il - 60) / (vw + gap));
    for (let k = 0; k < n; k++) { const x = -((n - 1) * (vw + gap)) / 2 + k * (vw + gap); vents.push(orient(rect(x - vw / 2, -iw / 2 + 12, x + vw / 2, iw / 2 - 12), false)); }
  }
  lid.append(extrudePolygon(rounded(L, W, r, 0.4), vents, 0, 0.4));
  lid.append(extrudePolygon(rounded(L, W, r), vents, 0.4, lidT));
  lid.append(extrudePolygon(rounded(il, iw, Math.max(1, r - t)), [orient(rounded(il, iw, Math.max(1, r - t), 2), false)], lidT, lidT + lip));
  const parts = [{ mesh: base, name: 'cable-box' }, { mesh: lid.translate(0, W + 10, 0), name: 'cable-box-lid' }];
  // Put together for the preview: the lid flipped onto the base.
  const preview = new Mesh();
  preview.append(base);
  const l2 = new Mesh(); l2.append(lid); l2.translate(0, -(W + 10), 0);
  const q = l2.positions;
  for (let i = 0; i < q.length; i += 3) { q[i + 1] = -q[i + 1]; q[i + 2] = H + lidT - q[i + 2]; } // half a turn about x, onto the walls
  preview.append(l2);
  const notes = [
    `A box ${Math.round(L)} × ${Math.round(W)} × ${Math.round(H + lidT)} mm for a strip ${num(o.stripL, 120, 420, 300)} × ${num(o.stripW, 30, 120, 55)} mm and plugs up to ${num(o.plugH, 30, 120, 70)} mm tall, with ${o.backSlot ? 'three' : 'two'} ${Math.round(slot)} mm cable slots${o.vents !== false ? ` and ${vents.length} vent slots in the lid` : ''}.`,
    `Print the base upright and the lid top down; no supports.${L > 256 ? ' It’s longer than most beds (256 mm): print it diagonally, or on a big bed.' : ''}`,
  ];
  return { parts, notes, plan: p, preview };
}
