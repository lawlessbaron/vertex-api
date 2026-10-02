// Fridge magnet holders: a pen cup, marker tray or note basket that sticks to
// the fridge (or any steel) with round magnets glued into pockets in its back.
// Printed upright, open top up. The pockets run into the back wall level with
// the bed, so each is a teardrop (round below, coming to a 45° point on top)
// that a round magnet sits in. A basket's sides fall from the back to a lower
// front, cut away as they rise. Nothing overhangs.
import { rr, sections } from './slabs.js';

export const MAGNETHOLDER_DEFAULTS = {
  width: 80,
  depth: 45, // out from the fridge
  height: 100, // at the back
  front: 100, // at the front: lower for a basket you can see into
  magnet: 12, // the round magnets, across
  magnetT: 3, // and thick
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const WALL = 2, FLOOR = 2, INNER = 1.4, PLAY = 0.15, R = 4;

export function generateMagnetHolder(options = {}) {
  const o = { ...MAGNETHOLDER_DEFAULTS, ...options };
  const W = num(o.width, 30, 240, 80), D = num(o.depth, 20, 100, 45), H = num(o.height, 30, 200, 100);
  const F = Math.min(H, num(o.front, 15, 200, H)), md = num(o.magnet, 6, 25, 12), mt = num(o.magnetT, 1, 6, 3);
  const r = md / 2 + PLAY, deep = mt + 0.2, BACK = deep + INNER;
  if (W < md + 2 * WALL + 4) throw new Error(`A holder ${W} mm wide is too narrow for ${md} mm magnets.`);
  if (H < 2 * r + FLOOR + 6) throw new Error(`A holder ${H} mm tall is too short for ${md} mm magnets.`);
  // The magnets: one every 60 mm or so across, in two rows on a tall holder, one row on a short one.
  const across = Math.max(1, Math.round(W / 60)), rows = H > 4 * md + 30 ? [0.28, 0.75] : [0.5];
  const pockets = [];
  for (const k of rows) for (let i = 0; i < across; i++) pockets.push({ x: (W * (i + 0.5)) / across, z: Math.max(FLOOR + r + 2, Math.min(H - r * 1.5 - 3, H * k)) });
  const cuts = [0, 0.4, FLOOR, F, H];
  for (const p of pockets) for (let z = p.z - r; z <= p.z + r * Math.SQRT2 + 0.25; z += 0.25) cuts.push(z);
  if (H > F) for (let z = F; z <= H; z += 0.5) cuts.push(z);
  const mesh = sections([-1, -1, W + 1, D + 1], cuts, (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    d.on(rr(f, f, W - f, D - f, R));
    if (z >= FLOOR) d.off(rr(WALL, WALL, W - WALL, D - BACK, Math.max(1, R - WALL)));
    // A basket: the sides and front fall from the back's height to the front's, cut away as they rise.
    if (z > F) d.off([[-2, -2], [W + 2, -2], [W + 2, ((z - F) / (H - F)) * (D - BACK)], [-2, ((z - F) / (H - F)) * (D - BACK)]]);
    for (const p of pockets) {
      const dz = z - p.z;
      if (dz < -r || dz > r * Math.SQRT2) continue;
      const half = dz <= r / Math.SQRT2 ? Math.sqrt(r * r - dz * dz) : r * Math.SQRT2 - dz; // a teardrop: round, then a 45° point
      if (half > 0.05) d.off(rr(p.x - half, D - deep, p.x + half, D + 2, 0));
    }
  }, 0.1, 0.05);
  const notes = [
    `A holder ${W} × ${D} mm, ${H} mm tall at the back${F < H ? ` and ${F} mm at the front` : ''}, with ${pockets.length} pocket${pockets.length > 1 ? 's' : ''} for ${md} × ${mt} mm round magnets.`,
    'Glue a magnet into each pocket in the back (superglue or epoxy), all the same way up, flush with the back. Neodymium magnets hold best.',
    'Print it upright (as it comes), no supports: the pockets come to a point on top so they bridge nothing.',
  ];
  return { parts: [{ mesh, name: 'magnet-holder' }], notes, preview: mesh };
}
