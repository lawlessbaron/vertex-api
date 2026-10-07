// Armour and feet for the framed server rack (Epic 1, phase 1D). Every piece prints on its own,
// meant for TPU (rack-zones.js: the "fittings" zone), and goes on afterwards:
//
//   bumpers   none | corner | rugged | full
//     corner  a cap over each of the eight outside corners: a skin over the frame's outside face and
//             two walls down its sides, legs bumperSize long (12–40 mm). It stretches on; on the top
//             frame, with a handle, the skin is only a 4 mm rim, so it clears the handle's feet.
//     rugged  the caps, plus an angle guard down each vertical edge, 30 % of the side's height
//     full    the caps, plus a guard along every edge of both frames between them
//   bumperGrip  smooth | ribbed (vertical ribs) | knurled (ribs crossed by bands): on the caps' walls
//
//   feet      none | pads | spikes | casters | plinth
//     Each foot bolts up through the bottom frame with two M5 bolts, their heads sunk flush inside
//     the rack, into nuts trapped in the foot. Each pair runs front to back, 14 mm in from the side,
//     centred 50 mm behind the front rails and in front of the back ones (46 on a short rack, its feet
//     a little smaller): clear of the uprights' flanges at every strength (34 mm at most) and the brackets.
//     pads     Ø32 × 6 mm discs (TPU: quiet and grippy)
//     spikes   35 mm cones to a 4 mm tip (decoupling, for a rack on carpet)
//     casters  60 × 60 × 8 mm plates for 50 mm plate casters (bolt holes 42 × 42 mm; check yours);
//              a rack under 160 mm deep has no room for two plates a side, so it gets pads
//     plinth   a ring 10 mm high, just inside the frame's outline: the rack floats above the desk
import { Mesh } from './mesh.js';
import { rr, sections } from './slabs.js';

export const BUMPERS = ['none', 'corner', 'rugged', 'full'];
export const GRIPS = ['smooth', 'ribbed', 'knurled'];
export const FEET = ['none', 'pads', 'spikes', 'casters', 'plinth'];
const T = 2.5; // the bumpers' wall
const FOOT_IN = 14, FOOT_END = 50, FOOT_MIN = 46, PAIR = 12; // the feet: in from the sides, behind the rail planes (at most, at least), their two bolts apart (front to back)
export const CASTER_MIN_D = 160; // two 60 mm caster plates a side, clear of each other
const M5 = { hole: 5.6, nutAF: 8.4, nutT: 4.4, head: 9.4, headH: 5.2 };

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
/** The settings, cleaned. D: the rack's depth, rail to rail (casters need room). */
export function armourOptions(o = {}, D = 200) {
  const feet = FEET.includes(o.feet) ? o.feet : 'none';
  return {
    bumpers: BUMPERS.includes(o.bumpers) ? o.bumpers : 'none',
    bumperSize: Math.round(num(o.bumperSize, 12, 40, 24)),
    bumperGrip: GRIPS.includes(o.bumperGrip) ? o.bumperGrip : 'smooth',
    feet: feet === 'casters' && D < CASTER_MIN_D ? 'pads' : feet,
  };
}

const footEnd = (D) => Math.max(FOOT_MIN, Math.min(FOOT_END, D / 2 - 16.5));
/** A foot's radius: 16 mm, less on a short rack so the front and back feet stay 1 mm apart. */
export const footR = (D) => Math.min(16, D / 2 - footEnd(D) - 0.5);
/** The four feet's centres, in the bottom frame's own coordinates (rails at y = 0 and D): [x, y]. */
export function footCentres(xo, D) {
  const c = footEnd(D), out = [];
  for (const sx of [-1, 1]) for (const yc of [c, D - c]) out.push([sx * (xo - FOOT_IN), yc]);
  return out;
}
/** Where the feet's bolts go: [x, y] pairs, two a foot, front to back. */
export function footBolts(xo, D) {
  return footCentres(xo, D).flatMap(([x, y]) => [[x, y - PAIR / 2], [x, y + PAIR / 2]]);
}
/** Draw the feet's bolt holes in a slab of the bottom frame at height z (0 its outside face, ft inside). */
export function drawFootHoles(d, z, ft, xo, D) {
  for (const [x, y] of footBolts(xo, D)) d.disc(x, y, z > ft - M5.headH ? M5.head / 2 : M5.hole / 2, 0); // the head sunk flush inside
}
export const footCuts = (ft) => [ft - M5.headH];
// A bolt long enough to pass the frame below its sunk head and through the nut, rounded up to a stock length.
export const footBolt = (ft) => [8, 10, 12, 16, 20, 25].find((L) => L >= ft - M5.headH + M5.nutT + 1.5) || 25;

const hex = (cx, cy, af) => { const r = af / Math.sqrt(3); return Array.from({ length: 6 }, (_, k) => { const a = (Math.PI / 3) * k; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }); };
const nutTraps = (d, z, cx, cy) => { for (const dy of [-PAIR / 2, PAIR / 2]) { d.disc(cx, cy + dy, M5.hole / 2, 0); if (z < M5.nutT) d.off(hex(cx, cy + dy, M5.nutAF)); } };

/** One corner cap, outer corner at the origin, legs along +x and +y, printed skin down (z = 0). */
export function bumperCap(a, ft, { rim = 0, grip = 'smooth' } = {}) {
  const s = a.bumperSize, H = T + ft, w = rim || s; // rim: the skin is only this wide along the two edges
  const cuts = [0, T, H];
  if (grip === 'knurled') for (let z = T + 2; z < H - 1; z += 3) cuts.push(z, Math.min(H, z + 1.2));
  return sections([0, 0, s, s], [...new Set(cuts)].sort((x, y) => x - y), (z, d) => {
    if (z < T) { d.on(rr(0, 0, s, w, 1)); d.on(rr(0, 0, w, s, 1)); return; } // the skin over the frame's face
    d.on(rr(0, 0, s, T, 0.6)); d.on(rr(0, 0, T, s, 0.6)); // the two walls down its sides
    const band = grip === 'knurled' && ((z - T - 2) % 3) < 1.2 && z > T + 2;
    if (grip !== 'smooth') for (let k = 5; k < s - 3; k += 3) { d.off(rr(k, -1, k + 1.2, 0.6)); d.off(rr(-1, k, 0.6, k + 1.2)); } // vertical ribs
    if (band) { d.off(rr(-1, -1, s + 1, 0.6)); d.off(rr(-1, -1, 0.6, s + 1)); } // crossed by bands: knurled
  }, 0.1, 0.06);
}

/** An angle guard: an L of the bumpers' wall, legs `leg` wide, `len` long (printed on its end). */
export function bumperGuard(len, leg = 12) {
  return sections([0, 0, leg, leg], [0, len], (z, d) => { d.on(rr(0, 0, leg, T, 0.6)); d.on(rr(0, 0, T, leg, 0.6)); }, 0.1, 0.06);
}

/** One foot, centred on its bolt pair, printed on its frame side (z = 0 against the frame). R: pads' and spikes' radius. */
export function foot(kind, R = 16) {
  if (kind === 'pads') return sections([-R, -R, R, R], [0, 0.6, 6], (z, d) => { d.disc(0, 0, z < 0.6 ? R - 0.4 : R); nutTraps(d, z, 0, 0); }, 0.1, 0.06);
  if (kind === 'spikes') {
    const H = 35, cuts = [0, ...Array.from({ length: 34 }, (_, k) => k + 1), H];
    return sections([-R, -R, R, R], cuts, (z, d) => { const r = R - ((R - 2) * z) / H; d.disc(0, 0, r); if (z < 12) nutTraps(d, z, 0, 0); }, 0.1, 0.06);
  }
  if (kind === 'casters') {
    return sections([-30, -30, 30, 30], [0, M5.nutT, 8], (z, d) => {
      d.on(rr(-30, -30, 30, 30, 4));
      nutTraps(d, z, 0, 0); // the two bolts up into the frame
      for (const sx of [-21, 21]) for (const sy of [-21, 21]) { d.disc(sx, sy, M5.hole / 2, 0); if (z < M5.nutT) d.off(hex(sx, sy, M5.nutAF)); } // the caster's four: bolted to the plate first, nuts on the frame side
    }, 0.1, 0.06);
  }
  return null;
}

/** The plinth: a ring 10 mm high inside the bottom frame's outline (4 mm in at the sides, 10 at the ends; 248 mm wide on a 10-inch rack), its sides 24 mm wide over the feet's bolts; in two halves if it won't fit the bed. */
export function plinth(xo, Y0, Y1, D, bed = 250) {
  const x0 = -xo + 4, x1 = xo - 4, y0 = Y0 + 10, y1 = Y1 - 10, Ws = 24, W = 12, H = 10;
  const bolts = footBolts(xo, D);
  const ring = (ya, yb) => sections([x0, ya, x1, yb], [0, M5.nutT, H], (z, d) => {
    d.on(rr(x0, y0, x1, y1, 4)); d.off(rr(x0 + Ws, y0 + W, x1 - Ws, y1 - W, 2));
    for (const [x, y] of bolts) { d.disc(x, y, M5.hole / 2, 0); if (z < M5.nutT) d.off(hex(x, y, M5.nutAF)); }
    if (ya > y0 || yb < y1) d.off(ya > y0 ? rr(x0 - 1, y0 - 1, x1 + 1, ya) : rr(x0 - 1, yb, x1 + 1, y1 + 1));
  }, 0.15, 0.1);
  if (x1 - x0 <= bed && y1 - y0 <= bed) return [{ mesh: ring(y0, y1), name: 'plinth' }];
  const mid = (y0 + y1) / 2;
  return [{ mesh: ring(y0, mid), name: 'plinth-front' }, { mesh: ring(mid, y1), name: 'plinth-back' }];
}

/**
 * The bottom corner caps' size: as set, smaller to stay clear of the feet (1 mm), none under a plinth.
 * A cap reaches bumperSize − T in from the frame's end, which is ext (4 mm or more) in front of the rails.
 */
export function bottomCapSize(a, { Y0, Y1, D }) {
  if (a.feet === 'plinth') return 0;
  if (a.feet === 'none') return a.bumperSize;
  const edge = footEnd(D) - (a.feet === 'casters' ? 30 : footR(D)), ext = Math.min(-Y0, Y1 - D);
  return Math.max(12, Math.min(a.bumperSize, Math.floor(edge - 1 + ext + T)));
}

const turn = (m, f) => { const out = new Mesh(); out.append(m); const P = out.positions; for (let i = 0; i < P.length; i += 3) { const [x, y, z] = f(P[i], P[i + 1], P[i + 2]); P[i] = x; P[i + 1] = y; P[i + 2] = z; } return out; };
const flip = (m) => { const out = turn(m, (x, y, z) => [x, y, z]); const I = out.indices; for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; } return out; };

/**
 * The armour and feet for a rack: { parts: [{ mesh, name }], preview: Mesh, notes: [...] }.
 * g: { xo, Y0, Y1, D, ft, height, handle } in the assembled rack's coordinates (bottom frame's outside face at z = 0).
 */
export function rackArmour(a, g) {
  const parts = [], preview = new Mesh(), notes = [];
  const { xo, Y0, Y1, D, ft, height, handle } = g;
  // Mirror a piece about x and/or y (keeping its faces the right way out).
  // odd: f itself mirrors an odd number of axes (then the faces are flipped back the right way out).
  const place = (m, sx, sy, f, odd = false) => { let q = turn(m, (x, y, z) => { const [X, Y, Z] = f(x, y, z); return [sx * X, sy * Y, Z]; }); if ((sx * sy < 0) !== odd) q = flip(q); return q; };
  const down = (m, f) => flip(turn(m, f)); // a z mirror: feet hang under the frame
  if (a.bumpers !== 'none') {
    const sB = bottomCapSize(a, g), capTop = bumperCap(a, ft, { rim: handle ? 4 : 0, grip: a.bumperGrip });
    const same = sB === a.bumperSize && !handle, cap = sB && (same ? capTop : bumperCap({ ...a, bumperSize: sB }, ft, { grip: a.bumperGrip }));
    if (same) parts.push({ mesh: cap, name: 'bumper-corner-x8' });
    else { if (cap) parts.push({ mesh: cap, name: 'bumper-corner-x4' }); parts.push({ mesh: capTop, name: 'bumper-corner-top-x4' }); }
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      // Bottom: the skin under the frame. Top: turned over, the skin over the top.
      const yE = sy < 0 ? -Y0 : Y1;
      if (cap) preview.append(place(cap, sx, sy, (x, yy, z) => [xo + T - x, yE + T - yy, z - T]));
      preview.append(place(capTop, sx, sy, (x, yy, z) => [xo + T - x, yE + T - yy, height + T - z], true));
    }
    if (!cap) notes.push('Bumpers: on a plinth, the bottom corners need no caps; the plinth keeps them off the desk.');
    else if (sB < a.bumperSize) notes.push(`Bumpers: the bottom caps are ${sB} mm a side, so they stay clear of the feet.`);
    if (a.bumpers === 'rugged') {
      const len = Math.max(20, Math.round(0.3 * (height - 2 * ft))), gd = bumperGuard(len);
      parts.push({ mesh: gd, name: 'bumper-edge-guard-x8' });
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const top of [false, true]) {
        const yE = sy < 0 ? -Y0 : Y1;
        preview.append(place(gd, sx, sy, (x, yy, z) => [xo + T - x, yE + T - yy, top ? height - ft - z : ft + z], top));
      }
      notes.push(`Rugged: 8 edge guards (${len} mm) down the rack's vertical edges, from each frame. Stick them on with VHB tape.`);
    }
    if (a.bumpers === 'full') {
      const along = (L) => bumperGuard(Math.max(10, L - 2 * a.bumperSize + 2 * T), 10);
      const wide = along(2 * xo), deep = along(Y1 - Y0);
      parts.push({ mesh: wide, name: 'bumper-rail-width-x4' }, { mesh: deep, name: 'bumper-rail-depth-x4' });
      notes.push(`Full: rails along every edge of both frames between the corner caps (4 across, ${Math.round(2 * xo - 2 * a.bumperSize + 2 * T)} mm; 4 front to back, ${Math.round(Y1 - Y0 - 2 * a.bumperSize + 2 * T)} mm). Stick them on with VHB tape.`);
    }
    notes.push(`Bumpers: print the corner caps in TPU (95A), ${a.bumperSize} mm a side; they stretch over the frames' corners${handle ? ', and the top ones leave room for the handle' : ''}. Without feet, the bottom caps are the rack's feet.`);
  }
  if (a.feet !== 'none') {
    if (a.feet === 'plinth') {
      const pl = plinth(xo, Y0, Y1, D);
      parts.push(...pl);
      for (const q of pl) preview.append(down(q.mesh, (x, y, z) => [x, y, -z]));
      notes.push(`Plinth: ${pl.length > 1 ? 'two halves, glued at the seam, ' : ''}10 mm high, set just inside the frame's edges, so the rack floats above the desk. 8 M5 × ${footBolt(ft)} bolts down through the bottom frame into nuts in the plinth.`);
    } else {
      const f = foot(a.feet, footR(D));
      parts.push({ mesh: f, name: `foot-${a.feet}-x4` });
      const H = a.feet === 'spikes' ? 35 : a.feet === 'casters' ? 8 : 6;
      for (const [cx, cy] of footCentres(xo, D)) preview.append(down(f, (x, y, z) => [cx + x, cy + y, -z]));
      notes.push({
        pads: `Feet: 4 pads (print in TPU) bolt under the bottom frame, two M5 × ${footBolt(ft)} bolts each, their heads sunk flush inside the rack, the nuts trapped between the pad and the frame.`,
        spikes: `Feet: 4 spikes (PETG or ASA), two M5 × ${footBolt(ft)} bolts each down through the bottom frame. For carpet; on a hard floor put a coin or pad under each tip.`,
        casters: `Feet: 4 caster plates for 50 mm plate casters (bolt holes 42 × 42 mm: check yours). Bolt each caster to its plate first (four M5 × 12, nuts on top), then the plate to the frame (two M5 × ${footBolt(ft)}). Use casters with brakes.`,
      }[a.feet] + ` They add ${H} mm.`);
    }
  }
  return { parts, preview, notes };
}
