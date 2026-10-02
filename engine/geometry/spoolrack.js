// Thread and ribbon spool racks: a plate for the wall or the back of a sewing
// desk with a grid of round pegs, each sized to the hole in your spools and
// ending in a lip so a spool can't slide off. It prints flat on its back: the
// pegs rise straight up and each lip widens at 45°, so nothing needs support.
// The screw holes go straight down through the plate, countersunk.
import { Mesh } from './mesh.js';
import { sections, rr } from './slabs.js';

export const SPOOLRACK_DEFAULTS = {
  cols: 6,
  rows: 4,
  spoolD: 32, // the biggest spool across: sets the spacing
  hole: 7, // the hole through a spool: the peg is a little under it
  reach: 40, // how far a peg comes out (a spool's length, and a bit)
  thick: 4,
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const R = 2.25, HEAD = 4.25, LIP = 1.2, EDGE = 6;

export function generateSpoolRack(options = {}) {
  const o = { ...SPOOLRACK_DEFAULTS, ...options };
  const cols = Math.round(num(o.cols, 2, 12, 6)), rows = Math.round(num(o.rows, 2, 10, 4)), sd = num(o.spoolD, 15, 90, 32);
  const peg = num(o.hole, 3, 25, 7) - 0.8, reach = num(o.reach, 15, 120, 40), t = num(o.thick, 3, 8, 4);
  const pitch = sd + 4, W = cols * pitch + 2 * EDGE, H = rows * pitch + 2 * EDGE;
  if (W > 250 || H > 250) throw new Error(`That rack is ${Math.ceil(W)} × ${Math.ceil(H)} mm: bigger than a 250 mm bed. Fewer spools, or two racks.`);
  const at = [];
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) at.push([-W / 2 + EDGE + pitch * (i + 0.5), -H / 2 + EDGE + pitch * (j + 0.5)]);
  // Screws at two opposite corners of the grid, each between four pegs.
  const screws = [[-W / 2 + EDGE + pitch, H / 2 - EDGE - pitch], [W / 2 - EDGE - pitch, -H / 2 + EDGE + pitch]];
  const top = t + reach;
  const cuts = [0, 0.4, t, t - 2.5, top - LIP, top];
  for (let z = t - 2.5; z <= t; z += 0.5) cuts.push(z);
  for (let z = top - LIP; z <= top; z += 0.4) cuts.push(z);
  const mesh = sections([-W / 2 - 1, -H / 2 - 1, W / 2 + 1, H / 2 + 1], cuts, (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    if (z < t) {
      d.on(rr(-W / 2 + f, -H / 2 + f, W / 2 - f, H / 2 - f, 5));
      const cs = z > t - 2.5 ? R + (HEAD - R) * ((z - (t - 2.5)) / 2.5) : R;
      for (const [x, y] of screws) d.disc(x, y, cs, 0);
      return;
    }
    const r = peg / 2 + (z > top - LIP ? z - (top - LIP) : 0); // the lip widens at 45°
    for (const [x, y] of at) d.disc(x, y, r);
  }, 0.15, 0.08);
  // On the wall: (x, y, z) → (x, −z, y), a rotation.
  const preview = new Mesh(); preview.append(mesh);
  const q = preview.positions;
  for (let i = 0; i < q.length; i += 3) { const y = q[i + 1], z = q[i + 2]; q[i + 1] = -z; q[i + 2] = y; }
  const notes = [
    `${cols * rows} pegs (${cols} × ${rows}) for spools up to ${sd} mm across with a ${o.hole} mm hole, ${reach} mm long. The rack is ${Math.round(W)} × ${Math.round(H)} mm. Two 4 mm countersunk screws.`,
    'Hang it with the pegs level or tilt the rack back a little: the lip on each peg keeps its spool on either way.',
    'Print it flat on its back (as it comes), no supports.',
  ];
  return { parts: [{ mesh, name: 'spool-rack' }], notes, preview };
}
