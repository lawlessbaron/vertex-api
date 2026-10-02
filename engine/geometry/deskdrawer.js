// Under-desk drawers. A drawer whose top edges flare out into flanges, and two
// rails that screw to the underside of a desk: each rail is a channel the
// flange slides along. The drawer prints upright (its flanges grow out at
// 45°, so they need no support); the rails print lying on their side, every
// wall standing straight up from the bed.
import { Mesh } from './mesh.js';
import { extrudePolygon, orient } from './polygon.js';

export const DESKDRAWER_DEFAULTS = {
  width: 200, // the drawer, outside
  depth: 220,
  height: 60,
  wall: 2,
  floor: 2,
  clearance: 0.5, // round the flanges in their rails
  screws: 4, // holes per rail
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
function rounded(w, d, r, inset = 0, seg = 6) {
  const pts = [], hw = w / 2 - inset, hd = d / 2 - inset, rr = Math.max(0.3, r - inset);
  for (const [qx, qy, a0] of [[1, -1, -90], [1, 1, 0], [-1, 1, 90], [-1, -1, 180]]) for (let k = 0; k <= seg; k++) { const a = ((a0 + (90 * k) / seg) * Math.PI) / 180; pts.push([qx * (hw - rr) + rr * Math.cos(a), qy * (hd - rr) + rr * Math.sin(a)]); }
  return pts;
}

export function deskDrawerPlan(options = {}) {
  const o = { ...DESKDRAWER_DEFAULTS, ...options };
  const W = num(o.width, 80, 250, 200), D = num(o.depth, 80, 250, 220), H = num(o.height, 25, 120, 60);
  const t = num(o.wall, 1.6, 4, 2), f = num(o.floor, 1.6, 4, 2), c = num(o.clearance, 0.2, 1, 0.5);
  const flangeW = 6, flangeT = 3; // each flange: how far it sticks out, how thick
  // The rail's U, in (across, up from the desk): a plate on the desk, the
  // channel the flange runs in, and a lip under it.
  const plateT = 4, legT = 3, lipT = 3, chan = flangeT + 2 * c, reach = flangeW + c;
  return { o, W, D, H, t, f, c, flangeW, flangeT, plateT, legT, lipT, chan, reach, plateW: reach + legT + 14, screws: Math.round(num(o.screws, 2, 8, 4)) };
}

export function generateDeskDrawer(options = {}) {
  const p = deskDrawerPlan(options), { W, D, H, t, f, flangeW, flangeT, plateT, legT, lipT, chan, reach, plateW, screws } = p;
  // ---- The drawer: floor, walls, then the top band flaring out into flanges.
  const drawer = new Mesh(), r = 4, flare = flangeW;
  const inner = orient(rounded(W, D, r, t), false);
  drawer.append(extrudePolygon(rounded(W, D, r, 0.4), [], 0, 0.4));
  drawer.append(extrudePolygon(rounded(W, D, r), [], 0.4, f));
  const z0 = H - flangeT - flare; // the flare starts here, 45° out to the flange
  drawer.append(extrudePolygon(rounded(W, D, r), [inner], f, z0));
  const steps = 12;
  for (let k = 0; k < steps; k++) {
    const a = z0 + (flare * k) / steps, b = z0 + (flare * (k + 1)) / steps, out = (flare * (k + 0.5)) / steps;
    drawer.append(extrudePolygon([[-W / 2 - out, -D / 2], [W / 2 + out, -D / 2], [W / 2 + out, D / 2], [-W / 2 - out, D / 2]], [inner], a, b));
  }
  drawer.append(extrudePolygon(rect(-W / 2 - flangeW, -D / 2, W / 2 + flangeW, D / 2), [inner], H - flangeT, H));
  // The front: a face a little bigger than the drawer, with a finger pull at the top.
  const fw = W / 2 + flangeW + 4, pull = Math.min(50, W / 3);
  const face = [[-fw, -4], [fw, -4], [fw, H], [pull / 2, H], [pull / 2, H - 14], [-pull / 2, H - 14], [-pull / 2, H], [-fw, H]];
  const front = extrudePolygon(face, [], D / 2, D / 2 + 4);
  const q = front.positions;
  for (let i = 0; i < q.length; i += 3) { const u = q[i], v = q[i + 1], w = q[i + 2]; q[i] = u; q[i + 1] = -w; q[i + 2] = v; } // (u, v, w) → (u, −w, v): a rotation
  drawer.append(front);
  // ---- A rail, as it prints: lying on its side. x across the U (0 = the
  // plate's outside face), y along the rail, z up from the bed.
  const legLen = plateT + chan + lipT, rail = new Mesh();
  rail.append(extrudePolygon(rect(0, 0, legLen, D), [], 0, legT)); // the back of the U, flat on the bed
  rail.append(extrudePolygon(rect(legLen - lipT, 0, legLen, D), [], legT, legT + reach - 1)); // the lip the flange rests on
  // The plate that screws to the desk, with holes; built in (y, z) and turned to stand at x 0..plateT.
  // Counterbored from the side that faces down, so the screws' heads sit
  // inside the plate, flush, and nothing hangs into the drawer.
  const ring = (y, z, rad) => orient(Array.from({ length: 24 }, (_, j) => { const a = (2 * Math.PI * j) / 24; return [y + rad * Math.cos(a), z + rad * Math.sin(a)]; }), false);
  const ys = Array.from({ length: screws }, (_, k) => 15 + ((D - 30) * k) / Math.max(1, screws - 1)), hz = legT + reach + 5;
  const plate = new Mesh(), bore = 1.5;
  plate.append(extrudePolygon(rect(0, legT, D, plateW), ys.map((y) => ring(y, hz, 2.25)), 0, bore));
  plate.append(extrudePolygon(rect(0, legT, D, plateW), ys.map((y) => ring(y, hz, 4.4)), bore, plateT));
  const pq = plate.positions;
  for (let i = 0; i < pq.length; i += 3) { const u = pq[i], v = pq[i + 1], w = pq[i + 2]; pq[i] = w; pq[i + 1] = u; pq[i + 2] = v; } // (u, v, w) → (w, u, v): a rotation
  rail.append(plate);
  const parts = [{ mesh: drawer, name: 'drawer' }];
  for (let k = 0; k < 2; k++) { const m = new Mesh(); m.append(rail); m.translate(W / 2 + 30 + k * (plateW + 10), -D / 2, 0); parts.push({ mesh: m, name: `rail-${k + 1}` }); }
  // ---- Put together, under a desk at z = top: each rail turned so its plate
  // is flat under the desk and its channel faces the drawer's flange.
  const top = H + plateT + 0.5, preview = new Mesh();
  preview.append(drawer);
  for (const s of [-1, 1]) {
    const m = new Mesh(); m.append(rail);
    const rq = m.positions;
    // Print (x, y, z) → use: the plate face up against the desk, the U opening toward the drawer.
    for (let i = 0; i < rq.length; i += 3) { const x = rq[i], y = rq[i + 1], z = rq[i + 2]; rq[i] = s * (W / 2 + flangeW + p.c + legT - z); rq[i + 1] = y - D / 2; rq[i + 2] = top - x; }
    if (s < 0) for (let i = 0; i < m.indices.length; i += 3) [m.indices[i + 1], m.indices[i + 2]] = [m.indices[i + 2], m.indices[i + 1]]; // a mirror: keep it facing out
    else { /* (x, y, z) → (−z, y, −x): a rotation */ }
    preview.append(m);
  }
  const notes = [
    `A drawer ${Math.round(W)} × ${Math.round(D)} × ${Math.round(H)} mm, and two rails that screw under the desk ${Math.round(W + 2 * (flangeW + p.c + legT))} mm apart (outside to outside), with ${screws} counterbored holes each for 4 mm pan-head wood screws (heads up to 8.5 mm across), which sit flush.`,
    'Screw one rail up, slide the drawer in to set the second rail’s place, then screw that one up. Print the drawer upright and the rails on their sides; no supports.',
  ];
  return { parts, notes, plan: p, preview };
}
