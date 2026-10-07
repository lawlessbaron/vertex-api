// Drive bays for the 10-inch rack, built like a real server's: each drive is
// fixed to a sled (push-in pins or screws), and the sled slides into a cage on
// rails and clicks home. Cages are modules: a dovetail on the left and the
// bottom, a dovetail groove on the right and the top, so they clip to each
// other side by side and on top of each other, and onto the grooves in the
// bay's floor (slid in from the back). A power module clips beside a 3.5"
// cage for the 12 V a 3.5" drive needs.
//
// How they print, all without supports:
// - cages and the power module stand on end: every rail, lip and dovetail
//   runs straight up, so nothing hangs over;
// - sleds lie on their floor: the walls, pins and the face rise off it.
//
// Drive sizes and screw holes are the standard form factors (SFF-8301 for
// 3.5", SFF-8201 for 2.5"), measured from the end away from the connector.
import { Mesh } from './mesh.js';
import { extrudePolygon } from './polygon.js';
import { rr, sections } from './slabs.js';

export const BAY_DRIVES = {
  hdd35: { name: '3.5" hard drive', w: 101.6, l: 147, h: 26.1, side: { z: 6.35, ys: [28.5, 130.1], r: 1.8, screw: '6-32 UNC' } },
  hdd25: { name: '2.5" hard drive (up to 15 mm)', w: 69.85, l: 100.2, h: 15, side: { z: 3, ys: [14, 90.6], r: 1.6, screw: 'M3' }, bottom: { x: 61.72 / 2, ys: [9.4, 86] } },
  ssd25: { name: '2.5" SSD (7 or 9.5 mm)', w: 69.85, l: 100.2, h: 9.5, side: { z: 3, ys: [14, 90.6], r: 1.6, screw: 'M3' }, bottom: { x: 61.72 / 2, ys: [9.4, 86] } },
  m2: { name: 'M.2 SSD in a USB enclosure', w: 30, l: 100, h: 11, lips: true },
};

// The dovetail every module shares: a tongue (narrow at the root) and the groove it slides into.
export const DOVE = { root: 8, tip: 10, h: 2.8, open: 8.5, bottom: 10.5, depth: 3, boss: 16 };
const tongue = (d, cx, cy, nx, ny) => {
  // Root on the surface at (cx, cy), pointing along (nx, ny).
  const tx = -ny, ty = nx, a = DOVE.root / 2, b = DOVE.tip / 2, e = 0.01;
  d.on([[cx + tx * a - nx * e, cy + ty * a - ny * e], [cx + tx * b + nx * DOVE.h, cy + ty * b + ny * DOVE.h], [cx - tx * b + nx * DOVE.h, cy - ty * b + ny * DOVE.h], [cx - tx * a - nx * e, cy - ty * a - ny * e]]);
};
const groove = (d, cx, cy, nx, ny) => {
  // A boss standing DOVE.depth off the surface at (cx, cy) along (nx, ny), the groove cut through it to the surface.
  const tx = -ny, ty = nx, B = DOVE.boss / 2, D = DOVE.depth, a = DOVE.open / 2, b = DOVE.bottom / 2, e = 0.01;
  d.on([[cx + tx * B - nx * e, cy + ty * B - ny * e], [cx + tx * B + nx * D, cy + ty * B + ny * D], [cx - tx * B + nx * D, cy - ty * B + ny * D], [cx - tx * B - nx * e, cy - ty * B - ny * e]]);
  d.off([[cx + tx * b, cy + ty * b], [cx + tx * a + nx * (D + e), cy + ty * a + ny * (D + e)], [cx - tx * a + nx * (D + e), cy - ty * a + ny * (D + e)], [cx - tx * b, cy - ty * b]]);
};

// Every size, from the drive out: sled, then cage.
export function bayDims(drive) {
  const dr = BAY_DRIVES[drive] || BAY_DRIVES.ssd25;
  const cl = 0.4, sw = 2, sf = 2, fl = 3; // drive clearance, sled wall and floor, flange (the rail)
  const wallX = dr.w / 2 + cl, wallOut = wallX + sw, half = wallOut + fl; // sled: the walls' inner and outer faces, half its width
  const ci = half + 0.5, cw = 2.4, co = ci + cw, cf = 2.4, ct = 2.4; // cage: inside, wall, outside, floor, top
  const Hc = cf + sf + dr.h + 1.5 + ct;
  const lipZ = cf + sf + 0.8, lipT = 1.6, lipIn = 2.5; // the lips over the sled's rails: 0.8 mm to spare, for the click
  const wh = dr.lips ? dr.h + 1.3 : Math.max(8, (dr.side?.z || 0) + 4); // sled walls
  return {
    dr, cl, sw, sf, fl, wallX, wallOut, half, ci, cw, co, cf, ct, Hc, lipZ, lipT, lipIn, wh,
    Lc: dr.l + 6, Ls: 3 + 1 + dr.l + 2, // cage and sled lengths (the sled: face, a gap, the drive, 2 mm behind)
    faceH: sf + dr.h + 1, faceHalf: half + 2, // the sled's face: wider than the cage's inside, so it stops against the cage
    pitchX: 2 * co + DOVE.depth, pitchY: Hc + DOVE.depth, // module spacing, clipped together
  };
}
// The click: a bump on the cage floor under each rail, a notch in the sled's rail that it drops into.
const BUMP = [[5, 6, 0.3], [6, 8, 0.6], [8, 9, 0.3]]; // cage depth from, to, height

// A cage as it prints, standing on its front: drawn across (x) and up (y), z back from the front.
export function driveCage(drive) {
  const b = bayDims(drive), { co, ci, cf, ct, Hc, lipZ, lipT, lipIn, Lc } = b, m = Hc / 2;
  // Vent slots in the floor and the top, between the rails: short bridges only.
  const vents = [];
  for (let z = 22; z + 22 <= Lc - 14; z += 30) vents.push([z, z + 22]);
  const cuts = [0, Lc, ...BUMP.flatMap(([a, c]) => [a, c]), ...vents.flat()];
  return sections([-co - DOVE.h - 1, -DOVE.h - 1, co + DOVE.depth + 1, Hc + DOVE.depth + 1], cuts, (z, d) => {
    d.on(rr(-co, 0, co, Hc, 1.2));
    d.off(rr(-ci, cf, ci, Hc - ct, 0.6));
    for (const s of [-1, 1]) d.on(s < 0 ? [[-ci - 0.01, lipZ], [-ci + lipIn, lipZ], [-ci + lipIn, lipZ + lipT], [-ci - 0.01, lipZ + lipT]] : [[ci + 0.01, lipZ], [ci + 0.01, lipZ + lipT], [ci - lipIn, lipZ + lipT], [ci - lipIn, lipZ]]);
    const bump = BUMP.find(([a, c]) => z >= a && z < c);
    if (bump) for (const s of [-1, 1]) d.on(rr(s < 0 ? -ci + 0.6 : ci - 2.5, cf - 0.01, s < 0 ? -ci + 2.5 : ci - 0.6, cf + bump[2]));
    if (vents.some(([a, c]) => z >= a && z < c)) for (const x of ventXs(ci - lipIn - 4)) { d.off(rr(x - 2.5, -0.1, x + 2.5, cf + 0.1)); d.off(rr(x - 2.5, Hc - ct - 0.1, x + 2.5, Hc + 0.1)); }
    tongue(d, 0, 0, 0, -1); // under: into the bay floor or the cage below
    groove(d, 0, Hc, 0, 1); // on top: for the cage above
    tongue(d, -co, m, -1, 0); // left: into the cage (or power module) on its left
    groove(d, co, m, 1, 0); // right
  }, 0.1, 0.05);
}
// Slot positions across a floor of half-width w, clear of the dovetail in the middle.
const ventXs = (w) => { const xs = []; for (let x = 12; x + 2.5 <= w; x += 9) xs.push(-x, x); return xs; };

// A sled as it prints, flat: x across, y back from the face, z up.
export function driveSled(drive, mount = 'clip') {
  const b = bayDims(drive), { dr, sf, wallX, wallOut, half, wh, Ls, faceH, faceHalf } = b;
  const y0 = 4; // the drive's front (the end away from its connector)
  const side = dr.side, c = side ? sf + side.z : 0, r = side?.r || 1.5;
  const pins = mount !== 'screw' && side, holes = mount === 'screw' && side;
  const notch = BUMP.map(([a, cc]) => [a + 3, cc + 3]).reduce(([a0, c0], [a, cc]) => [Math.min(a0, a), Math.max(c0, cc)], [99, 0]); // under the cage's bump when pushed home
  const pull = [faceH * 0.3, faceH * 0.66, faceH * 0.76];
  const cuts = [0, sf, sf + wh, faceH, ...pull];
  if (side) cuts.push(c - r, c + r * 0.4, c + r, c + r * 1.4);
  if (dr.lips) cuts.push(sf + dr.h + 0.3, sf + dr.h + 0.8);
  return sections([-faceHalf - 1, -1, faceHalf + 1, Ls + 1], cuts, (z, d) => {
    if (z < faceH) d.on(rr(-faceHalf, 0, faceHalf, 3, 0.8)); // the face
    if (z >= pull[0] && z < pull[2]) { const w = z < pull[1] ? 14 : 8; d.off(rr(-w, -1, w, 4, z < pull[1] ? 3 : 1)); } // a finger pull, its top stepped in
    if (z < sf) {
      d.on(rr(-half, 2.9, half, Ls, 1.5)); // the floor, its edges the rails
      for (const s of [-1, 1]) d.off(rr(s < 0 ? -half - 1 : half - 2.6, notch[0] - 0.4, s < 0 ? -half + 2.6 : half + 1, notch[1] + 0.4)); // the click
      const vw = dr.w / 2 - (dr.bottom ? 12 : 8);
      if (vw > 6) d.off(rr(-vw, y0 + 16, vw, y0 + dr.l - 16, 6)); // light, and air under the drive
      if (dr.bottom && mount === 'screw') for (const x of [-dr.bottom.x, dr.bottom.x]) for (const y of dr.bottom.ys) d.disc(x, y0 + y, r, 0);
      if (dr.lips) for (const y of [y0 + 20, y0 + dr.l - 20]) for (const s of [-1, 1]) d.off(rr(s * (wallX - 3) - 2, y - 1.5, s * (wallX - 3) + 2, y + 1.5)); // for a cable tie as well
      return;
    }
    if (z < sf + wh) for (const s of [-1, 1]) {
      d.on(rr(s < 0 ? -wallOut : wallX, 3, s < 0 ? -wallX : wallOut, Ls - 2));
      if (side) for (const y of side.ys) {
        const yc = y0 + y, wide = z < c + r * 0.4 ? r * 0.85 : z < c + r * 1.4 ? r * 0.4 : 0; // round-ish, its top stepped in so it prints
        if (z >= c - r && wide) {
          if (pins) d.on(s < 0 ? rr(-wallX - 0.01, yc - wide, -wallX + 1.8, yc + wide) : rr(wallX - 1.8, yc - wide, wallX + 0.01, yc + wide)); // a pin into the drive's screw hole
          if (holes) d.off(rr(s < 0 ? -wallOut - 0.1 : wallX - 0.1, yc - wide - 1, s < 0 ? -wallX + 0.1 : wallOut + 0.1, yc + wide + 1)); // a slot: 1 mm either way
        }
      }
      if (dr.lips && z >= sf + dr.h + 0.3) { const w = z < sf + dr.h + 0.8 ? 0.6 : 1.2; d.on(s < 0 ? rr(-wallX - 0.01, 6, -wallX + w, Ls - 6) : rr(wallX - w, 6, wallX + 0.01, Ls - 6)); } // lips over the enclosure
    }
  }, 0.1, 0.05);
}

// The power module, beside a 3.5" cage: a box the cage's height with a 12 V
// barrel socket in its back, a slot for the drive's power lead, and a row of
// holes in its outer wall to screw (or tie) a 12 V → SATA power board to.
// As it prints: standing on its back, drawn across (x) and up (y), z towards
// the front. Its dovetail points +x here; turned round it meets the cage.
export function powerModule(drive = 'hdd35', jack = 11) {
  const { Hc } = bayDims(drive), W = 40, L = 60, w = 2.4, m = Hc / 2;
  const rows = [m - 7, m + 7], cols = []; for (let z = 14; z <= L - 8; z += 6) cols.push(z);
  const cuts = [0, 3, L, ...cols.flatMap((z) => [z - 1.3, z + 0.5, z + 1.3])];
  return sections([-W - 1, -DOVE.h - 1, DOVE.h + 1, Hc + DOVE.depth + 1], cuts, (z, d) => {
    d.on(rr(-W, 0, 0, Hc, 1.2));
    if (z < 3) {
      d.disc(-W + 13, m, Math.min(jack / 2, m - 4), 0); // the socket: 11 mm fits a 5.5 × 2.1 mm panel socket
      d.off(rr(-15, 5, -5, Hc - 5, 3)); // the lead out to the drive
    } else {
      d.off(rr(-W + w, w, -w, Hc - w, 0.6));
      const col = cols.find((c) => z >= c - 1.3 && z < c + 1.3);
      if (col !== undefined) { const h = z < col + 0.5 ? 1.2 : 0.6; for (const y of rows) d.off(rr(-W - 0.1, y - h, -W + w + 0.1, y + h)); } // board holes, for M2.5 or M3 self-tappers
    }
    tongue(d, -W / 2, 0, 0, -1);
    groove(d, -W / 2, Hc, 0, 1);
    tongue(d, 0, m, 1, 0);
  }, 0.1, 0.05);
}

// A cage's footprint in the bay: flat (as drawn) or on its side (a quarter turn about its depth, so the drive
// stands on edge). Turned, its dovetails still chain: the old left tongue points down into the floor, the old
// floor tongue points right into the next cage's groove, and the old top groove takes the cage on its left.
export function bayGeom(drive, side = false) {
  const b = bayDims(drive);
  return side ? { half: b.Hc / 2, height: 2 * b.co, pitchX: b.pitchY, pitchY: b.pitchX } : { half: b.co, height: b.Hc, pitchX: b.pitchX, pitchY: b.pitchY };
}
// Flat cage coordinates → on its side, standing on its old left tongue, centred on it (a rotation).
const onSide = (b) => (x, y, z) => [-y + b.Hc / 2, x + b.co, z];

// Where the modules go across a bay: columns centred, the power module (if
// any) to the right of the first column. Returns the x of each cage column,
// and of the power module's dovetail face.
export function bayLayout(drive, room, power, side = false) {
  const b = bayDims(drive), g = bayGeom(drive, side), pw = power && !side ? 40 : 0; // the power module's body (its dovetail sits in the cage's groove)
  const n = Math.max(1, Math.floor((room - DOVE.h - pw) / g.pitchX));
  const total = n * g.pitchX + DOVE.h + pw;
  const x0 = -total / 2 + DOVE.h + g.half; // the first column's centre
  const cols = Array.from({ length: n }, (_, i) => x0 + i * g.pitchX);
  return { b, cols, power: pw ? cols[n - 1] + b.co + DOVE.depth : null, total };
}

// The bay's floor, standing off the back of its face (as the face prints):
// drawn across (x) and up (y), extruded back, with a dovetail groove under
// each column so the cages slide on from the back and can't lift.
export function bayFloor(xs, sw, st, z0, z1) {
  const a = DOVE.open / 2, b = DOVE.bottom / 2, D = DOVE.depth;
  const pts = [[-sw, 0], [sw, 0], [sw, st]];
  for (const x of [...xs].sort((p, q) => q - p)) pts.push([x + a, st], [x + b, st - D], [x - b, st - D], [x - a, st]);
  pts.push([-sw, st]);
  return extrudePolygon(pts, [], z0, z1);
}

// Everything in a bay, put together in the face's own frame (x across, y up
// from the face's bottom, z back from the face): cages, sleds pushed home (the
// first pulled out a little, to show it slides), power modules.
export function bayContents({ drive, mount, power, rows, cols, powerX, floorTop, ft, jack, side = false }) {
  const b = bayDims(drive), g = bayGeom(drive, side), cage = driveCage(drive), sled = driveSled(drive, mount), pm = power && !side ? powerModule(drive, jack) : null;
  const turn = side ? onSide(b) : (x, y, z) => [x, y, z];
  const cages = new Mesh(), sleds = new Mesh();
  const put = (src, f) => { const m = new Mesh(); m.append(src); const q = m.positions; for (let i = 0; i < q.length; i += 3) { const [x, y, z] = f(q[i], q[i + 1], q[i + 2]); q[i] = x; q[i + 1] = y; q[i + 2] = z; } return m; };
  let first = true;
  for (let k = 0; k < rows; k++) {
    const y = floorTop + k * g.pitchY;
    for (const cx of cols) {
      const at = (X, Y, Z) => { const [a, c, e] = turn(X, Y, Z); return [cx + a, y + c, ft + e]; };
      cages.append(put(cage, (x, h, z) => at(x, h, z)));
      const out = first ? 45 : 0; first = false;
      // Flat → in the cage: (x, y, z) → (−x, z, y), a rotation, on the cage floor with its face in the window.
      sleds.append(put(sled, (x, yy, z) => at(-x, b.cf + z, -3 + yy - out)));
    }
    // Standing on its back → at the cage's back: half a turn about y.
    if (pm) cages.append(put(pm, (x, h, z) => [powerX - x, y + h, ft + b.Lc - z]));
  }
  return { cages, sleds };
}
