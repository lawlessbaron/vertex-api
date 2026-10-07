// Egg trays: a block with a round cup for each egg, for the fridge door or the bench. Each cup is a
// bowl (part of a sphere) that narrows to a point on the floor, so an egg sits upright and can't
// roll. Printed as it stands: the bowls
// open upward and only widen as they rise, so nothing overhangs.
import { rr, sections } from './slabs.js';

export const EGGTRAY_DEFAULTS = {
  rows: 2,
  cols: 6,
  egg: 'large', // small | medium | large | jumbo
  depth: 18, // how deep each egg sits
};

const EGG = { small: 40, medium: 42.5, large: 45, jumbo: 48 }; // across the egg, mm
const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const GAP = 3, EDGE = 4, FLOOR = 1.6, R = 8;

export function generateEggTray(options = {}) {
  const o = { ...EGGTRAY_DEFAULTS, ...options };
  const rows = Math.round(num(o.rows, 1, 4, 2)), cols = Math.round(num(o.cols, 1, 6, 6)), egg = EGG[o.egg] || EGG.large;
  const dep = num(o.depth, 10, 26, 18);
  // A cup: the bowl that meets the egg's width at the top, its sphere's radius chosen so it's that deep.
  const top = egg * 0.82, rt = top / 2, sr = (rt * rt + dep * dep) / (2 * dep), pitch = top + GAP;
  const W = cols * pitch - GAP + 2 * EDGE, D = rows * pitch - GAP + 2 * EDGE, H = dep + FLOOR;
  if (W > 250 || D > 250) throw new Error(`That tray is ${Math.ceil(W)} × ${Math.ceil(D)} mm: bigger than a 250 mm bed. Fewer eggs in a row.`);
  const cups = [];
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) cups.push([-W / 2 + EDGE + pitch * i + rt, -D / 2 + EDGE + pitch * j + rt]);
  const cuts = [0, 0.4, FLOOR, H];
  for (let z = FLOOR; z < H; z += 0.8) cuts.push(z);
  const zc = FLOOR + sr; // the sphere's centre: the bowl's bottom touches the floor
  const mesh = sections([-W / 2 - 1, -D / 2 - 1, W / 2 + 1, D / 2 + 1], cuts, (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    d.on(rr(-W / 2 + f, -D / 2 + f, W / 2 - f, D / 2 - f, R));
    if (z < FLOOR) return;
    const dz = zc - z, r = dz < sr ? Math.sqrt(sr * sr - dz * dz) : 0;
    if (r > 0.3) for (const [x, y] of cups) d.disc(x, y, Math.min(r, rt), 0);
  }, 0.25, 0.1);
  const n = rows * cols;
  const notes = [
    `${n} cup${n > 1 ? 's' : ''} for ${o.egg in EGG ? o.egg : 'large'} eggs (about ${egg} mm across), ${dep} mm deep, on a tray ${Math.round(W)} × ${Math.round(D)} mm.`,
    'Eggs sit pointed end down. Measure a tray for your fridge door before printing: most door shelves are 90 to 110 mm deep.',
    'Print it as it comes, no supports. Any plastic will do; PETG cleans up best.',
  ];
  return { parts: [{ mesh, name: 'egg-tray' }], notes, preview: mesh };
}
