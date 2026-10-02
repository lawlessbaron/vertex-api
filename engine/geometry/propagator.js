// Plant propagation stations: a block for the windowsill with a row (or two)
// of holes that test tubes or small jars of water stand in, for rooting
// cuttings. Each hole is a little bigger than the tube and has a floor, so a
// round-bottomed tube sits on a ring. Drawn in plan as slabs and printed
// upright: the holes go straight down and the top edge is chamfered at 45°
// (narrower as it rises), so nothing overhangs.
import { rr, sections } from './slabs.js';

export const PROPAGATOR_DEFAULTS = {
  tubeD: 25, // a tube or jar across
  count: 5,
  rows: 1,
  depth: 45, // how deep each tube sits
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const FLOOR = 3, RIM = 4, CHAMFER = 3, PLAY = 0.8;

export function generatePropagator(options = {}) {
  const o = { ...PROPAGATOR_DEFAULTS, ...options };
  const d = num(o.tubeD, 10, 90, 25) + PLAY, n = Math.round(num(o.count, 1, 12, 5)), rows = Math.round(num(o.rows, 1, 3, 1)), dep = num(o.depth, 15, 100, 45);
  const pitch = d + RIM, W = n * pitch + RIM, D = rows * pitch + RIM, H = FLOOR + dep;
  if (W > 250 || D > 250) throw new Error(`That station is ${Math.ceil(W)} × ${Math.ceil(D)} mm: bigger than a 250 mm bed. Fewer tubes, or two stations.`);
  const holes = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < rows; j++) holes.push([-W / 2 + RIM + d / 2 + i * pitch, -D / 2 + RIM + d / 2 + j * pitch]);
  const cuts = [0, 0.4, FLOOR, H];
  for (let z = H - CHAMFER; z <= H; z += 0.5) cuts.push(z);
  const mesh = sections([-W / 2 - 1, -D / 2 - 1, W / 2 + 1, D / 2 + 1], cuts, (z, dr) => {
    const f = z < 0.4 ? 0.4 : 0, c = Math.max(0, z - (H - CHAMFER)); // the top edge steps in at 45°
    dr.on(rr(-W / 2 + f + c, -D / 2 + f + c, W / 2 - f - c, D / 2 - f - c, Math.max(1, 6 - c)));
    if (z > FLOOR) for (const [x, y] of holes) dr.disc(x, y, d / 2, 0);
    else if (z > 0.4) for (const [x, y] of holes) dr.disc(x, y, d / 4, 0); // a drain hole: the tube sits on the ring round it
  }, 0.15, 0.08);
  const notes = [
    `${n * rows} tube${n * rows > 1 ? 's' : ''} up to ${Math.round(d - PLAY)} mm across, ${dep} mm deep, in a block ${Math.round(W)} × ${Math.round(D)} × ${Math.round(H)} mm for the windowsill.`,
    'Fill each tube with water, put a cutting in it and stand it in a hole: roots in a few weeks. Change the water every few days.',
    'Print it upright (as it comes), no supports.',
  ];
  return { parts: [{ mesh, name: 'propagation-station' }], notes, preview: mesh };
}
