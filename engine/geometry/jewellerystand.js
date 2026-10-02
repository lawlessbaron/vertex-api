// Jewellery stands: a tray with ring cones standing in it, and behind them a
// panel with rows of small holes for earrings and notches along its top for
// necklaces and bracelets. Drawn in plan as slabs and printed upright. The
// earring holes run through the panel level with the bed, so each is a
// diamond (it bridges nothing). The cones narrow as they rise, the ribs that
// brace the panel fall back at 45° and the notches widen as they rise:
// nothing overhangs.
import { rr, sections } from './slabs.js';

export const JEWELLERYSTAND_DEFAULTS = {
  width: 160,
  height: 140, // the panel, from the bed
  cones: 3, // ring cones
  notches: 6, // along the top, for necklaces
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const D = 70, BASE = 4, RIM = 5, LIP = 2, PANEL = 4, RIB = 20, CONE_H = 45, CONE_R0 = 11, CONE_R1 = 5, HOLE = 1.5, PITCH = 8, NOTCH = 8;

export function generateJewelleryStand(options = {}) {
  const o = { ...JEWELLERYSTAND_DEFAULTS, ...options };
  const W = num(o.width, 80, 240, 160), H = num(o.height, 70, 220, 140), n = Math.round(num(o.cones, 0, 6, 3)), notches = Math.round(num(o.notches, 0, 12, 6));
  if (n * 2 * CONE_R0 + (n + 1) * 4 > W - 2 * LIP) throw new Error(`${n} ring cones don't fit across ${W} mm: fewer cones or a wider stand.`);
  const py0 = D - RIB - PANEL, py1 = D - RIB; // the panel, with ribs behind it
  const cones = Array.from({ length: n }, (_, i) => ({ x: (W * (i + 0.5)) / n, y: py0 / 2 }));
  // Earring holes: a grid between the cones' tops and the notches.
  const hz0 = BASE + CONE_H + 10, hz1 = H - NOTCH - 8, cols = Math.max(1, Math.floor((W - 30) / PITCH));
  const rows = [];
  for (let z = hz0; z <= hz1; z += 12) rows.push(z);
  const holeX = Array.from({ length: cols }, (_, i) => W / 2 + (i - (cols - 1) / 2) * PITCH);
  const notchX = Array.from({ length: notches }, (_, i) => 12 + ((W - 24) * (i + 0.5)) / notches);
  const cuts = [0, 0.4, BASE, BASE + RIM, H];
  for (let z = BASE; z <= BASE + CONE_H; z += 1) cuts.push(z);
  for (let z = BASE; z <= BASE + RIB; z += 0.5) cuts.push(z);
  for (const r of rows) for (let dz = -HOLE; dz <= HOLE; dz += 0.25) cuts.push(r + dz);
  for (let z = H - NOTCH; z <= H; z += 0.5) cuts.push(z);
  const mesh = sections([-1, -1, W + 1, D + 1], cuts, (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    if (z < BASE) { d.on(rr(f, f, W - f, D - f, 5)); return; }
    if (z < BASE + RIM) { // the tray's rim, round the front and sides
      d.on(rr(0, 0, W, py0 + 0.01, 5));
      d.off(rr(LIP, LIP, W - LIP, py0 + 1, 3));
    }
    // The panel, and a rib at each end and the middle behind it, falling back at 45°.
    d.on(rr(0, py0, W, py1, 0));
    const back = RIB - (z - BASE);
    if (back > 0.2) for (const x of [6, W / 2, W - 6]) d.on(rr(x - 2, py1 - 0.01, x + 2, py1 + back, 0));
    // The ring cones, narrowing as they rise, a chamfer on top.
    const cz = z - BASE;
    if (cz < CONE_H) for (const c of cones) d.disc(c.x, c.y, Math.min(CONE_R0 + (CONE_R1 - CONE_R0) * (cz / CONE_H), CONE_R1 - 1 + (CONE_H - cz)));
    // Earring holes, diamonds through the panel.
    for (const r of rows) {
      const hw = HOLE - Math.abs(z - r);
      if (hw > 0.05) for (const x of holeX) d.off(rr(x - hw, py0 - 1, x + hw, py1 + 1, 0));
    }
    // Notches along the top, widening as they rise.
    const nz = z - (H - NOTCH);
    if (nz > 0) for (const x of notchX) d.off(rr(x - 1 - nz * 0.6, py0 - 1, x + 1 + nz * 0.6, py1 + 1, 0));
  }, 0.15, 0.08);
  const notes = [
    `A stand ${W} × ${D} mm with a panel ${H} mm tall: ${n} ring cone${n === 1 ? '' : 's'}, ${rows.length * cols} earring holes and ${notches} necklace notch${notches === 1 ? '' : 'es'}, and a tray for the rest.`,
    'Hook earrings through the diamond holes, hang necklaces and bracelets in the notches along the top, and slide rings onto the cones (they fit rings from about 10 to 22 mm across).',
    'Print it upright (as it comes), no supports. A felt pad under each corner keeps it from scratching the dresser.',
  ];
  return { parts: [{ mesh, name: 'jewellery-stand' }], notes, preview: mesh };
}
