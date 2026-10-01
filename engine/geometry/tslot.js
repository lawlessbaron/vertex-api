// T-slot parts for aluminium profile (2020, 3030, 4040 and 4080): T-nuts,
// end caps, slot covers, cable clips, corner brackets and joining plates.
//
// Profile sizes vary a little between makers, so the slot sizes here are the
// common ones (B-type, 6 mm slot for 20 series, 8 mm for 30 and 40). Every part
// that goes into the slot has a little room to spare, and the notes say to
// print one first to check the fit.
//
// Every part prints without supports: flat parts lie flat, the slide-in T-nut
// widens at 45° in steps, sideways holes are teardrops, and the brackets'
// gussets slope at 45°.
import { Mesh } from './mesh.js';
import { extrudePolygon, circlePolygon } from './polygon.js';
import { rr, wallSlab } from './enclosure.js';
import { placeBadge, recessedSlab } from './brand.js';
import { BOLTS as SIM_BOLTS } from './simrig.js';

// Bolt clearance holes (the sim rig's, plus M3 for small parts).
const BOLTS = { m3: { d: 3.4 }, ...SIM_BOLTS };

// face: the side, cells: how many slots along the long side (4080 has two),
// open: slot opening, lip: how thick the lip is, cavity: the slot's width
// behind the lip, depth: face to the bottom of the slot, bolt: the usual bolt.
export const PROFILES = {
  2020: { name: '20 series (2020, 6 mm slot)', face: 20, cells: 1, open: 6.2, lip: 1.8, cavity: 11, depth: 6.1, bolt: 'm5' },
  3030: { name: '30 series (3030, 8 mm slot)', face: 30, cells: 1, open: 8.2, lip: 2.2, cavity: 16.5, depth: 9, bolt: 'm6' },
  4040: { name: '40 series (4040, 8 mm slot)', face: 40, cells: 1, open: 8.2, lip: 4.3, cavity: 20, depth: 12.2, bolt: 'm6' },
  4080: { name: '4080 (40 × 80, 8 mm slot)', face: 40, cells: 2, open: 8.2, lip: 4.3, cavity: 20, depth: 12.2, bolt: 'm6' },
};

// Heat-set insert holes, nut sizes (across the flats, and thickness) and
// holes for a bolt to cut its own thread.
const INSERT = { m3: 4.2, m4: 5.6, m5: 6.4, m6: 8.0, m8: 10.0 };
const NUT = { m3: [5.5, 2.4], m4: [7, 3.2], m5: [8, 4], m6: [10, 5], m8: [13, 6.5] };
const PILOT = { m3: 2.6, m4: 3.4, m5: 4.3, m6: 5.1, m8: 6.9 };
const INSERT_LEN = { m3: 3, m4: 4, m5: 4, m6: 5, m8: 6 }; // the shortest common heat-set inserts

export const TSLOT_PARTS = {
  tnut: 'T-nut',
  endcap: 'End cap',
  cover: 'Slot cover strip',
  clip: 'Cable clip',
  corner: 'Corner bracket',
  plate: 'Joining plate',
};

export const TSLOT_DEFAULTS = {
  part: 'tnut',
  profile: '2020',
  bolt: 'auto', // auto = the profile's usual bolt
  nutStyle: 'twist', // twist: drops in and turns a quarter; slide: slides in from the end
  thread: 'auto', // nut, insert, pilot (the bolt cuts its own thread); auto picks what fits
  nutLength: 12,
  count: 4,
  coverLength: 120,
  clipD: 8,
  clipLength: 10,
  cornerHoles: 1,
  gusset: true,
  plateShape: 'L',
  plateHoles: 2,
  plateT: 4,
  brandMark: true,
};

const GAP = 0.3; // room left around anything that goes into the slot
const circle = (x, y, d) => circlePolygon(x, y, d / 2, 28);
const hexagon = (x, y, flats) => {
  const r = flats / Math.sqrt(3);
  return Array.from({ length: 6 }, (_, i) => [x + r * Math.cos((Math.PI / 3) * i), y + r * Math.sin((Math.PI / 3) * i)]);
};
// A teardrop hole in a vertical wall: coordinates along the wall and z, point up.
function teardrop(a, z, d, seg = 20) {
  const r = d / 2, pts = [];
  for (let i = 0; i <= seg; i++) { const t = ((135 + (270 * i) / seg) * Math.PI) / 180; pts.push([a + r * Math.cos(t), z + r * Math.sin(t)]); }
  pts.push([a, z + r * Math.SQRT2]);
  return pts;
}
const boltOf = (o, P) => (o.bolt && o.bolt !== 'auto' && BOLTS[o.bolt] ? o.bolt : P.bolt);

// ---------- T-nuts ----------

// How the bolt holds: a nut trap, a heat-set insert or a pilot hole the bolt
// threads into, whichever is asked for and fits (auto: a nut if it fits, else
// an insert, else a pilot). room(w) is how much height (from the top down) the
// nut has where it's at least w wide; length is its length along the slot.
// The nut trap sits with its flats across the slot.
function threadFor(o, bolt, room, length) {
  const [flats, nutH] = NUT[bolt];
  const nutFits = flats / Math.cos(Math.PI / 6) + 1.6 <= length && room(flats + 1.6) >= nutH + 0.3;
  const insertFits = INSERT[bolt] + 1.6 <= length && room(INSERT[bolt] + 1.6) >= INSERT_LEN[bolt] + 0.3;
  const want = o.thread || 'auto';
  if (want === 'nut' && nutFits) return 'nut';
  if (want === 'insert' && insertFits) return 'insert';
  if (want === 'pilot') return 'pilot';
  return nutFits ? 'nut' : insertFits ? 'insert' : 'pilot';
}

// The hole through a nut, in layers from the bed up: [z0, z1, polygon]. The
// nut trap or insert sits in the top of the nut, from `from` up (the part
// that's wide enough); below that the bolt just passes through.
function nutHoles(kind, bolt, height, from = 0) {
  const d = BOLTS[bolt].d;
  if (kind === 'nut') {
    const z = Math.max(from, height - (NUT[bolt][1] + 0.3));
    return [[0, z, circle(0, 0, d)], [z, height, hexagon(0, 0, NUT[bolt][0] + 0.3)]];
  }
  if (kind === 'insert') return from > 0 ? [[0, from, circle(0, 0, d)], [from, height, circle(0, 0, INSERT[bolt])]] : [[0, height, circle(0, 0, INSERT[bolt])]];
  return [[0, height, circle(0, 0, PILOT[bolt])]];
}

// A stack of slabs: layers [z0, z1, outline], each with the holes that cross it.
function stack(layers, holes) {
  const m = new Mesh();
  const cuts = [...new Set([...layers.flatMap(([a, b]) => [a, b]), ...holes.flatMap(([a, b]) => [a, b])])].sort((a, b) => a - b);
  for (let i = 0; i < cuts.length - 1; i++) {
    const z0 = cuts[i], z1 = cuts[i + 1], mid = (z0 + z1) / 2;
    const layer = layers.find(([a, b]) => a <= mid && b >= mid);
    if (!layer) continue;
    m.append(extrudePolygon(layer[2], holes.filter(([a, b]) => a <= mid && b >= mid).map((h) => h[2]), z0, z1));
  }
  return m;
}

// Drops in through the slot opening, then turns a quarter (clockwise) to lock
// behind the lips. Two opposite corners are rounded so it can turn one way.
function twistNut(o, P, bolt) {
  const A = P.cavity - 0.8, B = P.open - 0.5, T = Math.max(2.4, P.depth - P.lip - 0.5);
  const r = B / 2 - 0.05, seg = 10, pts = [];
  const arc = (cx, cy, a0) => { for (let s = 0; s <= seg; s++) { const a = ((a0 + (90 * s) / seg) * Math.PI) / 180; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
  pts.push([A / 2, -B / 2]);
  arc(A / 2 - r, B / 2 - r, 0);
  pts.push([-A / 2, B / 2]);
  arc(-A / 2 + r, -B / 2 + r, 180);
  const kind = threadFor(o, bolt, (w) => (w <= B ? T : 0), A);
  return { mesh: stack([[0, T, pts]], nutHoles(kind, bolt, T)), kind, size: [A, B, T] };
}

// Slides in from the end of the profile: a neck that fills the slot opening
// (on the bed), widening at 45° to fill the slot behind the lips.
function slideNut(o, P, bolt) {
  // Long enough for a nut trap's corners, if a nut is what it'll take.
  const L = Math.max(8, +o.nutLength || 12, NUT[bolt][0] / Math.cos(Math.PI / 6) + 2);
  const wn = P.open - 0.4, wb = P.cavity - 0.6, neck = Math.max(0.8, P.lip - 0.2), top = P.depth - 0.3;
  const layers = [[0, neck, rr(-L / 2, -wn / 2, L / 2, wn / 2, 0.4)]];
  const step = 0.4;
  let z = neck, w = wn;
  while (w < wb - 1e-6 && z < top - step) {
    w = Math.min(wb, w + 2 * step);
    layers.push([z, z + step, rr(-L / 2, -w / 2, L / 2, w / 2, 0.4)]);
    z += step;
  }
  layers.push([z, top, rr(-L / 2, -wb / 2, L / 2, wb / 2, 0.6)]);
  // The nut or insert goes where the nut is wide enough for it; the bolt passes through the neck.
  const zAt = (w) => { const l = layers.find(([, , poly]) => Math.max(...poly.map((q) => q[1])) * 2 >= w - 1e-6); return l ? l[0] : top; };
  const kind = threadFor(o, bolt, (w) => top - zAt(w), L);
  const need = kind === 'nut' ? NUT[bolt][0] + 1.6 : INSERT[bolt] + 1.6;
  return { mesh: stack(layers, nutHoles(kind, bolt, top, kind === 'pilot' ? 0 : zAt(need))), kind, size: [L, wb, top] };
}

// ---------- in the slot: end caps, covers, clips ----------

// A cap for the end of the profile: a plate the size of the end, with a pin
// into every slot. Printed face down.
function endCap(o, P) {
  const W = P.face * P.cells, H = P.face, T = 2.4, pinH = Math.min(8, P.depth + 2);
  const m = extrudePolygon(rr(-W / 2 + 0.1, -H / 2 + 0.1, W / 2 - 0.1, H / 2 - 0.1, 1.2), [], 0, T);
  const pw = P.open - GAP, inner = P.lip + 1.5;
  const pin = (x0, y0, x1, y1) => m.append(extrudePolygon(rr(x0, y0, x1, y1, 0.3), [], T - 0.2, T + pinH));
  // Slots along the long sides (one per cell), and one on each short side.
  for (let c = 0; c < P.cells; c++) {
    const cx = -W / 2 + P.face * (c + 0.5);
    pin(cx - pw / 2, H / 2 - inner, cx + pw / 2, H / 2 - 0.5);
    pin(cx - pw / 2, -H / 2 + 0.5, cx + pw / 2, -H / 2 + inner);
  }
  pin(W / 2 - inner, -pw / 2, W / 2 - 0.5, pw / 2);
  pin(-W / 2 + 0.5, -pw / 2, -W / 2 + inner, pw / 2);
  return { mesh: m, size: [W, H, T + pinH] };
}

// The part of a strip that snaps into the slot: two legs with a barb each,
// from z = base up. Returns the outline across the slot (y, z).
function snapLegs(P, base) {
  const ws = P.open - GAP, slit = 1, zb = base + P.lip + 0.1, top = base + P.lip + 1.8;
  const half = [[slit / 2, base], [ws / 2, base], [ws / 2, zb], [ws / 2 + 0.45, zb + 0.5], [ws / 2 - 0.2, top], [slit / 2, top]];
  return { right: half, left: half.map(([y, z]) => [-y, z]).reverse(), top };
}

// A strip that snaps into the slot and hides it (and the cables in it).
// Printed on its back, the flange on the bed.
function cover(o, P) {
  const L = Math.max(20, +o.coverLength || 120), fw = P.open + 4, f = 1;
  const legs = snapLegs(P, f);
  // One outline: the flange with chamfered edges, then each leg.
  const outline = [[-fw / 2 + 0.4, 0], [fw / 2 - 0.4, 0], [fw / 2, 0.4], [fw / 2, f], ...legs.right, ...legs.left, [-fw / 2, f], [-fw / 2, 0.4]];
  const clean = outline.filter((p, i) => i === 0 || p[0] !== outline[i - 1][0] || p[1] !== outline[i - 1][1]);
  return { mesh: wallSlab('y', clean, [], -L / 2, L / 2), size: [L, fw, legs.top] };
}

// A clip that snaps into the slot, with a ring for a cable or a bundle.
// Printed on its side: the ring on the bed, the legs up.
function clip(o, P) {
  const d = Math.max(3, +o.clipD || 8), L = Math.max(6, +o.clipLength || 10), wall = 1.6;
  const rw = Math.max(d + 2 * wall, P.open + 3), rh = d + 2 * wall + 0.6;
  const m = new Mesh();
  m.append(wallSlab('y', rr(-rw / 2, 0, rw / 2, rh, 1.2), [teardrop(0, wall + d / 2, d)], -L / 2, L / 2));
  const legs = snapLegs(P, rh - 0.2);
  m.append(wallSlab('y', [...legs.right, ...legs.left], [], -L / 2, L / 2));
  return { mesh: m, size: [L, rw, legs.top] };
}

// ---------- brackets and plates ----------

// An L bracket for a square corner: one leg flat on the bed, one standing, with
// a gusset at each edge. Holes in the standing leg are teardrops.
function corner(o, P, bolt) {
  const F = P.face, n = Math.max(1, Math.min(3, +o.cornerHoles || 1));
  const t = F <= 20 ? 4 : F <= 30 ? 5 : 6, W = F, Lg = t + n * F, d = BOLTS[bolt].d;
  const at = (k) => t + F / 2 + k * F;
  const m = new Mesh();
  m.append(extrudePolygon(rr(0, -W / 2, Lg, W / 2, 1), Array.from({ length: n }, (_, k) => circle(at(k), 0, d)), 0, t));
  m.append(wallSlab('y', rr(-W / 2, 0, W / 2, Lg, 1), Array.from({ length: n }, (_, k) => teardrop(0, at(k), d)), 0, t));
  if (o.gusset !== false) {
    const g = Lg - t - 1, gt = 2.4;
    const tri = [[t - 0.2, t - 0.2], [t + g, t - 0.2], [t - 0.2, t + g]];
    m.append(wallSlab('x', tri, [], -W / 2, -W / 2 + gt));
    m.append(wallSlab('x', tri, [], W / 2 - gt, W / 2));
  }
  return { mesh: m, size: [Lg, W, Lg] };
}

// A flat plate that joins profiles: straight, L, T or a cross, with a hole
// over every slot it crosses (one per face width along each arm).
export function plateLayout(shape, F, n) {
  const arms = { straight: ['+x', '-x'], L: ['+x', '+y'], T: ['+x', '-x', '+y'], cross: ['+x', '-x', '+y', '-y'] }[shape] || ['+x', '+y'];
  const h = F / 2, len = n * F;
  const has = (a) => arms.includes(a);
  const pts = [[h, -h]];
  if (has('+x')) pts.push([h + len, -h], [h + len, h]);
  pts.push([h, h]);
  if (has('+y')) pts.push([h, h + len], [-h, h + len]);
  pts.push([-h, h]);
  if (has('-x')) pts.push([-h - len, h], [-h - len, -h]);
  pts.push([-h, -h]);
  if (has('-y')) pts.push([-h, -h - len], [h, -h - len]);
  const dir = { '+x': [1, 0], '-x': [-1, 0], '+y': [0, 1], '-y': [0, -1] };
  const holes = [[0, 0], ...arms.flatMap((a) => Array.from({ length: n }, (_, k) => [dir[a][0] * F * (k + 1), dir[a][1] * F * (k + 1)]))];
  return { outline: pts, holes };
}

function plate(o, P, bolt) {
  const F = P.face, n = Math.max(1, Math.min(6, +o.plateHoles || 2)), T = Math.max(3, Math.min(10, +o.plateT || 4));
  const { outline, holes } = plateLayout(o.plateShape, F, n);
  const d = BOLTS[bolt].d, polys = holes.map(([x, y]) => circle(x, y, d));
  const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]);
  const badge = o.brandMark !== false ? placeBadge(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), polys, { margin: 3, sizes: [12, 9, 7, 5] }) : null;
  // The badge has to sit on the plate, not in the gap between arms.
  const onPlate = badge && badge.groups.every((g) => g.outer.every(([x, y]) => outline.length && inside(outline, x, y)));
  const mesh = onPlate ? recessedSlab(outline, polys, badge.groups, 0, T, 0.6) : extrudePolygon(outline, polys, 0, T);
  return { mesh, holes: holes.length, size: [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), T] };
}
function inside(poly, x, y) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

// Copies of a small part in rows, so a plate of T-nuts prints in one go.
function copies(mesh, count, size) {
  const n = Math.max(1, Math.min(40, Math.round(+count || 1)));
  if (n === 1) return mesh;
  const b = mesh.bounds(), sx = b.size[0] + 4, sy = b.size[1] + 4, cols = Math.ceil(Math.sqrt(n));
  const out = new Mesh();
  for (let i = 0; i < n; i++) {
    const c = new Mesh();
    c.append(mesh);
    out.append(c.translate((i % cols) * sx - ((cols - 1) * sx) / 2, Math.floor(i / cols) * sy, 0));
  }
  return out;
}

/**
 * Make a T-slot part. Returns { parts: [{ mesh, name, detail }], thread, notes: [string], size }.
 */
export function generateTslotPart(options = {}) {
  const o = { ...TSLOT_DEFAULTS, ...options };
  const P = PROFILES[o.profile] || PROFILES[2020];
  const bolt = boltOf(o, P);
  const notes = [];
  let r, name = o.part, count = 1;
  if (o.part === 'tnut') {
    r = o.nutStyle === 'slide' ? slideNut(o, P, bolt) : twistNut(o, P, bolt);
    count = o.count;
    const wanted = o.thread && o.thread !== 'auto' ? o.thread : null;
    if (wanted && wanted !== r.kind) notes.push(`A ${wanted === 'nut' ? `${bolt.toUpperCase()} nut` : `${bolt.toUpperCase()} insert`} doesn’t fit in this T-nut, so it has a hole for the bolt to cut its own thread instead.`);
    name = `tnut-${o.nutStyle}-${bolt}`;
  } else if (o.part === 'endcap') { r = endCap(o, P); count = o.count; }
  else if (o.part === 'cover') r = cover(o, P);
  else if (o.part === 'clip') { r = clip(o, P); count = o.count; }
  else if (o.part === 'corner') { r = corner(o, P, bolt); count = o.count; }
  else { r = plate(o, P, bolt); name = `plate-${o.plateShape}`; }
  const mesh = copies(r.mesh, count);
  return { parts: [{ mesh, name: `tslot-${o.profile}-${name}`, detail: count > 1 ? `${Math.round(count)} copies` : '' }], thread: r.kind, bolt, notes, size: r.size, holes: r.holes };
}
