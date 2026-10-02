// Hair dryer and straightener holders: one plate for the wall or the inside
// of a cupboard door. A ring the dryer hangs in by its barrel (nozzle down),
// a sleeve the straightener stands in, a round cup for a brush if you like,
// and a hook for the cords below the ring. It prints upright, the way it
// hangs: the sleeve and cup stand on the bed with their floors, and the ring
// and hook grow out of the plate on 45° corbels, so nothing needs support.
// The screw holes are diamonds (a hole across the print would sag).
import { Mesh } from './mesh.js';
import { rr, sections } from './slabs.js';

export const HAIRHOLDER_DEFAULTS = {
  dryerD: 60, // the dryer's barrel where it rests in the ring (nozzle off)
  straightW: 42, // the straightener's closed plates, across
  straightT: 32, // and front to back
  sleeveH: 90, // how tall the sleeve stands
  brush: true,
  brushD: 45, // the brush cup, inside
  cordHook: true,
  thick: 5,
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const WALL = 2.4, FLOOR = 2.4, RING = 6, RING_T = 8, GAP = 10, STEP = 1;
const bool = (v) => v === true || v === 'true';

export function generateHairHolder(options = {}) {
  const o = { ...HAIRHOLDER_DEFAULTS, ...options };
  const dd = num(o.dryerD, 35, 110, 60), sw = num(o.straightW, 20, 70, 42), st = num(o.straightT, 15, 50, 32), sh = num(o.sleeveH, 50, 160, 90);
  const brush = o.brush === undefined ? true : bool(o.brush) || o.brush === 1, bd = num(o.brushD, 25, 80, 45), hook = o.cordHook === undefined ? true : bool(o.cordHook) || o.cordHook === 1, t = num(o.thick, 3, 8, 5);
  // Across the plate, left to right: the sleeve, the brush cup, the ring. x across, y out from the wall, z up.
  const Ro = dd / 2 + RING;
  const sleeveW = sw + 2 * WALL, cupW = brush ? bd + 2 * WALL : 0;
  const W = 8 + sleeveW + (brush ? GAP + cupW : 0) + GAP + 2 * Ro + 8;
  const corbelH = 2 + 2 * Ro, hookL = 34; // the ring's corbel climbs as far as the ring reaches out (45°)
  const H = Math.max(sh + 30, RING_T + corbelH + (hook ? 14 + hookL + 24 : 16));
  if (W > 250 || H > 250) throw new Error(`That holder is ${Math.ceil(W)} × ${Math.ceil(H)} mm: bigger than a 250 mm bed. A smaller ring, or leave out the brush cup.`);
  const x0 = -W / 2 + 8, sx = x0 + sleeveW / 2, cx = brush ? x0 + sleeveW + GAP + cupW / 2 : 0, rx = W / 2 - 8 - Ro;
  const ringTop = H, ry = t + 2 + Ro; // the ring's centre: its back 2 mm off the plate
  const corbel0 = ringTop - RING_T - (ry + Ro - t); // where its corbel starts on the plate: 45° up to the ring's front
  const hookZ = corbel0 - 14;
  const screws = [[x0 + sleeveW + (brush ? GAP / 2 : GAP / 2), H - 14], [rx, Math.max(14, (hook ? hookZ - hookL : corbel0) - 14)]];
  const depth = Math.max(ry + Ro, t + st + 2 * WALL, brush ? t + bd + 2 * WALL : 0, t + hookL + 4);
  // Slab heights: the bed, the floors, every millimetre up the corbels (45°), the tops.
  const cuts = [0, 0.4, FLOOR, sh, H, ringTop - RING_T];
  for (let z = corbel0; z < ringTop - RING_T; z += STEP) cuts.push(z);
  if (hook) { for (let z = hookZ - hookL; z < hookZ; z += STEP) cuts.push(z); cuts.push(hookZ + 8, hookZ + 16); }
  for (const [, zc] of screws) cuts.push(zc - 3, zc, zc + 3);
  const mesh = sections([-W / 2 - 1, -1, W / 2 + 1, depth + 1], cuts, (z, d) => {
    const f = z < 0.4 ? 0.4 : 0; // the bed face steps in
    // The ring, on its corbel: the disc out to as far as 45° has reached, then the barrel's hole through it.
    if (z > corbel0 && z < ringTop) {
      const out = Math.min(ry + Ro, t + (z - corbel0));
      d.disc(rx, ry, Ro);
      d.off(rr(rx - Ro - 1, out, rx + Ro + 1, ry + Ro + 1));
      d.on(rr(rx - Ro * 0.55, 0, rx + Ro * 0.55, Math.min(out, t + 2 + RING))); // a neck joins it to the plate: the rest is the ring itself, climbing at 45°
      const hole = []; for (let i = 0; i < 48; i++) { const a = (i / 48) * 2 * Math.PI; hole.push([rx + (dd / 2) * Math.cos(a), ry + (dd / 2) * Math.sin(a)]); }
      d.off(hole);
    }
    // The cord hook: a peg on a corbel, with a turned-up tip.
    if (hook && z > hookZ - hookL && z < hookZ + 16) {
      const out = z < hookZ ? t + (z - (hookZ - hookL)) : z < hookZ + 8 ? t + hookL : 0;
      if (out > t) d.on(rr(rx - 6, 0, rx + 6, out, 1.5));
      if (z >= hookZ + 8) d.on(rr(rx - 6, t + hookL - 7, rx + 6, t + hookL, 1.5)); // the tip
    }
    // The plate.
    d.on(rr(-W / 2 + f, f, W / 2 - f, t, 3));
    // The straightener's sleeve and the brush cup, standing on the bed.
    if (z < sh) {
      d.on(rr(x0 + f, t - 1, x0 + sleeveW - f, t + st + 2 * WALL - f, 3));
      if (brush) d.disc(cx, t + WALL + bd / 2 - 1, bd / 2 + WALL);
      if (z > FLOOR) {
        d.off(rr(x0 + WALL, t, x0 + WALL + sw, t + WALL + st, 1.5));
        if (brush) d.disc(cx, t + WALL + bd / 2 - 1, bd / 2, 0);
      }
    }
    for (const [x, zc] of screws) if (Math.abs(z - zc) < 3) { const r = 3 - Math.abs(z - zc); d.off(rr(x - r, -1, x + r, t + 1)); } // diamond screw holes, 6 mm
  }, 0.25, 0.15);
  const notes = [
    `A ring for a dryer barrel ${dd} mm across, a sleeve for a straightener ${sw} × ${st} mm${brush ? `, a cup for a brush ${bd} mm across` : ''}${hook ? ' and a hook for the cords' : ''}. ${Math.round(W)} × ${Math.round(H)} mm on the wall.`,
    'Hang the dryer nozzle-down through the ring. Let a hot straightener cool before it goes in the sleeve, or print it in PETG or ASA.',
    'Print it upright (as it comes), no supports. Two screws (4 mm) through the diamond holes.',
  ];
  // On the wall, seen from the room: turned half round, so the ring and sleeve face you.
  const preview = new Mesh(); preview.append(mesh);
  const q = preview.positions;
  for (let i = 0; i < q.length; i += 3) { q[i] = -q[i]; q[i + 1] = -q[i + 1]; }
  return { parts: [{ mesh, name: 'hair-tool-holder' }], notes, preview };
}
