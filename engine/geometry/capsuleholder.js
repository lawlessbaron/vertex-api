// Coffee capsule holders: a drawer tray with a pocket for every capsule, each
// pocket tapered to the capsule's body so it stands up with its rim just
// proud of the top to lift it out by. Sized for the common capsule types or
// your own. Not a solid block: each pocket is a tube, the tubes joined by
// ribs inside an outer wall. Drawn in plan as slabs and printed upright: the
// pockets widen as they rise and every wall goes straight up, so nothing
// overhangs.
import { rr, sections } from './slabs.js';

// Capsule sizes (mm): rim across, the body across at the top and the bottom, and its height below the rim.
export const CAPSULES = {
  nespresso: { name: 'Nespresso Original', rim: 37.5, top: 30.5, bottom: 22, height: 28.5 },
  dolcegusto: { name: 'Dolce Gusto', rim: 53.5, top: 50, bottom: 46, height: 32 },
  kcup: { name: 'K-Cup', rim: 51, top: 46, bottom: 37, height: 42 },
  vertuo: { name: 'Vertuo (mug)', rim: 56, top: 54, bottom: 40, height: 38 },
};

export const CAPSULEHOLDER_DEFAULTS = {
  capsule: 'nespresso', // or 'custom', with the sizes below
  cols: 6,
  rows: 4,
  rim: 37.5,
  top: 30.5,
  bottom: 22,
  height: 28.5,
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const FLOOR = 1.6, EDGE = 3, GAP = 2.5, PLAY = 0.5, PROUD = 5, WALL = 1.6, RIB = 1.2;

export function generateCapsuleHolder(options = {}) {
  const o = { ...CAPSULEHOLDER_DEFAULTS, ...options };
  const c = CAPSULES[o.capsule] || { name: 'your capsules', rim: num(o.rim, 20, 80, 37.5), top: num(o.top, 15, 80, 30.5), bottom: num(o.bottom, 10, 80, 22), height: num(o.height, 10, 60, 28.5) };
  const cols = Math.round(num(o.cols, 1, 10, 6)), rows = Math.round(num(o.rows, 1, 10, 4));
  const rt = Math.min(c.top, c.rim) / 2 + PLAY, rb = Math.min(c.bottom, c.top) / 2 + PLAY;
  const pitch = c.rim + GAP, depth = Math.max(4, c.height - PROUD), H = FLOOR + depth;
  const W = cols * pitch + 2 * EDGE - GAP, D = rows * pitch + 2 * EDGE - GAP;
  if (W > 250 || D > 250) throw new Error(`${cols} × ${rows} capsules make a tray ${Math.ceil(W)} × ${Math.ceil(D)} mm: more than a 250 mm bed. Fewer rows or columns.`);
  const centres = [], xs = [], ys = [];
  for (let i = 0; i < cols; i++) xs.push(-W / 2 + EDGE + c.rim / 2 + i * pitch);
  for (let j = 0; j < rows; j++) ys.push(-D / 2 + EDGE + c.rim / 2 + j * pitch);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) centres.push([-W / 2 + EDGE + c.rim / 2 + i * pitch, -D / 2 + EDGE + c.rim / 2 + j * pitch]);
  const cuts = [0, 0.4, FLOOR, H];
  for (let z = FLOOR; z < H; z += 1) cuts.push(z); // the taper in 1 mm steps: each step 0.15 mm or so
  const mesh = sections([-W / 2 - 1, -D / 2 - 1, W / 2 + 1, D / 2 + 1], cuts, (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    d.on(rr(-W / 2 + f, -D / 2 + f, W / 2 - f, D / 2 - f, 4));
    if (z < FLOOR) return;
    // Above the floor, not a solid block: an outer wall, a tube round each pocket and ribs joining them.
    d.off(rr(-W / 2 + WALL, -D / 2 + WALL, W / 2 - WALL, D / 2 - WALL, 2));
    // Each pocket follows the capsule's taper from its bottom up to the tray's top.
    const t = Math.min(1, (z - FLOOR) / c.height), r = rb + (rt - rb) * t;
    for (const [x, y] of centres) d.disc(x, y, r + WALL);
    for (const x of xs) d.on(rr(x - RIB / 2, -D / 2 + 1, x + RIB / 2, D / 2 - 1)); // a rib down each column
    for (const y of ys) d.on(rr(-W / 2 + 1, y - RIB / 2, W / 2 - 1, y + RIB / 2)); // and along each row
    for (const [x, y] of centres) d.disc(x, y, r, 0);
  }, 0.2, 0.1);
  const notes = [
    `${cols * rows} pockets for ${c.name} capsules in a tray ${Math.round(W)} × ${Math.round(D)} × ${Math.round(H)} mm. Each capsule's rim stands ${PROUD} mm proud of the top to lift it out by.`,
    'Measure your drawer and pick rows and columns to fill it; the tray is the pockets plus 3 mm all round. For other capsules choose Custom and measure one: the rim across, the body across just under the rim and at the bottom, and its height under the rim.',
    'Print it upright (as it comes), no supports.',
  ];
  return { parts: [{ mesh, name: 'capsule-holder' }], notes, preview: mesh };
}
