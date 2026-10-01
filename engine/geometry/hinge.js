// Hinges and hinged boxes. Both print without supports:
//  - hinge: a flat print-in-place hinge. It comes off the bed already working:
//    a rod joined to one leaf's knuckles runs through the other leaf's knuckles
//    with the clearance asked for. Screw holes in both leaves.
//  - box: a box with a hinged lid. The lid prints upside down beside the box
//    (its rim points up, its hinge clips open upward like cups) and snaps onto
//    a bar along the box's back. A lid printed in place would have nothing under it.
// Every part is a union of closed shells, centred on the origin.
import { Mesh } from './mesh.js';
import { circlePolygon, extrudePolygon } from './polygon.js';
import { box } from './primitives.js';

export const HINGE_DEFAULTS = {
  item: 'hinge', // hinge | box
  // hinge
  length: 40,
  leaf: 18, // how far each leaf reaches from the pin, mm
  thickness: 2.4,
  knuckles: 5,
  holes: true,
  // box
  width: 80,
  depth: 60,
  height: 40,
  wall: 2,
  // both
  clearance: 0.4,
  segments: 40,
};

// Extrude a (y, z) polygon along x: (u, v, w) → (w, u, v) is a rotation.
function alongX(outer, holes, x0, x1) {
  const m = extrudePolygon(outer, holes, x0, x1);
  const p = m.positions;
  for (let i = 0; i < p.length; i += 3) { const u = p[i], v = p[i + 1], w = p[i + 2]; p[i] = w; p[i + 1] = u; p[i + 2] = v; }
  return m;
}

/** Flat print-in-place hinge. → { parts, notes } */
export function hinge(o) {
  const n = Math.max(24, o.segments), c = Math.max(0.2, o.clearance), t = Math.max(1.2, o.thickness);
  const L = Math.max(15, o.length), leaf = Math.max(8, o.leaf);
  const R = t + c; // folded flat, one leaf clears the other by the clearance
  const rod = Math.max(0.9, R * 0.45);
  const k = Math.max(3, Math.round(o.knuckles) | 1); // odd: leaf A has both ends
  const kw = (L - (k - 1) * c) / k;
  const notes = [];
  if (kw < 3) notes.push('The knuckles are very narrow: use fewer, or make the hinge longer.');
  const mesh = new Mesh();
  const axis = [0, R];
  for (let i = 0; i < k; i++) {
    const x0 = -L / 2 + i * (kw + c), x1 = x0 + kw, a = i % 2 === 0, s = a ? -1 : 1;
    // The knuckle: a ring round the rod (leaf B) or solid with the rod (leaf A).
    const holes = a ? [] : [circlePolygon(axis[0], axis[1], rod + c, n).reverse()];
    mesh.append(alongX(circlePolygon(axis[0], axis[1], R, n), holes, x0, x1));
    // Its own leaf's web, from the knuckle out to the leaf.
    // Leaf B's web starts outside the bore (which dips below the leaf's top),
    // so it never touches the rod.
    const clear = Math.sqrt(Math.max(0, (rod + c) ** 2 - (R - t) ** 2)) + 0.3;
    mesh.append(s < 0 ? box(x0, -R - c - 0.01, 0, x1, 0, t) : box(x0, clear, 0, x1, R + c + 0.01, t));
  }
  // The rod, joined to leaf A's knuckles, through leaf B's.
  mesh.append(alongX(circlePolygon(axis[0], axis[1], rod, n), [], -L / 2 + 0.01, L / 2 - 0.01));
  // The leaves, clear of the other leaf's knuckles by the clearance.
  for (const s of [-1, 1]) {
    const y0 = s < 0 ? -R - c - leaf : R + c, y1 = s < 0 ? -R - c : R + c + leaf;
    const holes = o.holes ? [-1, 1].map((e) => circlePolygon(e * L * 0.3, (y0 + y1) / 2, 1.7, 24).reverse()) : [];
    mesh.append(extrudePolygon([[-L / 2, y0], [L / 2, y0], [L / 2, y1], [-L / 2, y1]], holes, 0, t));
  }
  notes.push(`Prints working, with ${c} mm clearance. Snap it free with a gentle bend before fitting.`);
  return { parts: [{ mesh, name: `hinge-${Math.round(L)}mm` }], notes, plan: { R, rod, knuckles: k } };
}

/** Box and snap-on lid. */
export function hingedBox(o) {
  const n = Math.max(24, o.segments), c = Math.max(0.2, o.clearance), w = Math.max(1.2, o.wall);
  const W = Math.max(60, o.width), D = Math.max(30, o.depth), H = Math.max(20, o.height);
  const pin = 2, ri = pin + c, Rc = ri + 1.6; // hinge bar, and the lid clips round it
  const lt = Math.min(Math.max(1.6, w), Rc - 0.6), Hb = H - lt, floor = Math.max(1.2, w); // the bar stays below the lid
  const yc = D / 2 + c + Rc, zc = Hb + lt - Rc;
  const notes = [];
  // The body: floor, walls, then the bar on brackets along the back.
  const body = new Mesh();
  const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  body.append(extrudePolygon(rect(-W / 2, -D / 2, W / 2, D / 2), [], 0, floor));
  body.append(extrudePolygon(rect(-W / 2, -D / 2, W / 2, D / 2), [rect(-W / 2 + w, -D / 2 + w, W / 2 - w, D / 2 - w).reverse()], floor - 0.01, Hb));
  const brackets = [-(W / 2 - 6), 0, W / 2 - 6], bw = 6;
  const drop = yc - D / 2 + pin + 1; // a 45° underside back to the wall
  for (const bx of brackets) {
    const prof = [[D / 2 - 0.01, zc - drop], [yc, zc - pin - 1], [yc, zc], [D / 2 - 0.01, zc]];
    body.append(alongX(prof, [], bx - bw / 2, bx + bw / 2));
  }
  body.append(alongX(circlePolygon(yc, zc, pin, n), [], brackets[0] - bw / 2 + 0.01, brackets[2] + bw / 2 - 0.01));
  // The lid, built where it sits closed, then turned over to print.
  const lid = new Mesh();
  lid.append(extrudePolygon(rect(-W / 2, -D / 2, W / 2, D / 2), [], Hb, Hb + lt));
  const ix = W / 2 - w - c, iy = D / 2 - w - c; // the rim fits inside the walls
  lid.append(extrudePolygon(rect(-ix, -iy, ix, iy), [rect(-ix + 1.2, -iy + 1.2, ix - 1.2, iy - 1.2).reverse()], Hb - 3, Hb + 0.01));
  // Clips: a C round the bar, open downward so they press on from above.
  const half = Math.asin(Math.min(0.95, (0.85 * pin) / ri)), gapC = -Math.PI / 2;
  const cShape = () => {
    const pts = [], m = 24, a0 = gapC + half, a1 = gapC + Math.PI * 2 - half;
    for (let k = 0; k <= m; k++) { const a = a0 + ((a1 - a0) * k) / m; pts.push([yc + Rc * Math.cos(a), zc + Rc * Math.sin(a)]); }
    for (let k = m; k >= 0; k--) { const a = a0 + ((a1 - a0) * k) / m; pts.push([yc + ri * Math.cos(a), zc + ri * Math.sin(a)]); }
    return pts;
  };
  const clipW = 10, clips = [-W / 4, W / 4];
  for (const cx of clips) {
    lid.append(alongX(cShape(), [], cx - clipW / 2, cx + clipW / 2));
    lid.append(box(cx - clipW / 2, D / 2 - 1, Hb, cx + clipW / 2, yc - ri - 0.2, Hb + lt));
  }
  // Turned over about x (a rotation, so it stays the right way out), beside the box.
  const top = Hb + lt, p = lid.positions;
  for (let i = 0; i < p.length; i += 3) { p[i + 1] = -p[i + 1]; p[i + 2] = top - p[i + 2]; }
  lid.translate(W + 12, 0, 0);
  notes.push('Print the lid as it lies. Snap it on by pressing its clips down onto the bar at the back.');
  return { parts: [{ mesh: body, name: `hinged-box-${Math.round(W)}x${Math.round(D)}x${Math.round(H)}` }, { mesh: lid, name: 'hinged-box-lid' }], notes, plan: { yc, zc, pin, ri, Rc, Hb, lt } };
}

export function generateHingePart(options = {}) {
  const o = { ...HINGE_DEFAULTS, ...options };
  const r = o.item === 'box' ? hingedBox(o) : hinge(o);
  const all = new Mesh();
  for (const q of r.parts) all.append(q.mesh);
  const b = all.bounds(), cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2;
  for (const q of r.parts) q.mesh.translate(-cx, -cy, -b.min[2]);
  return r;
}
