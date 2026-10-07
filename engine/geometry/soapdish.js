// Soap dishes: the bar sits on raised ribs, clear of the water, and the floor between the ribs has
// slots (or a spout at the front) so the water drains away instead of turning the soap to mush.
// Printed as it stands: the floor on the bed, the rim and ribs going straight up, the slots straight
// through. Nothing overhangs.
import { rr, sections } from './slabs.js';

export const SOAPDISH_DEFAULTS = {
  width: 110, // side to side
  depth: 80, // front to back
  rim: 14, // the rim, above the bed
  ribs: 6, // the ribs the soap sits on, above the floor
  drain: 'slots', // slots | spout | none
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const WALL = 2.4, FLOOR = 2, RIB_W = 2.4, RIB_GAP = 7, R = 10, SPOUT = 24;

export function generateSoapDish(options = {}) {
  const o = { ...SOAPDISH_DEFAULTS, ...options };
  const W = num(o.width, 50, 220, 110), D = num(o.depth, 40, 160, 80), H = num(o.rim, 6, 40, 14);
  const rib = Math.min(num(o.ribs, 2, 20, 6), H - FLOOR - 1), drain = ['slots', 'spout', 'none'].includes(o.drain) ? o.drain : 'slots';
  const cr = Math.min(R, W / 4, D / 4), iw = W - 2 * WALL;
  const ribsX = [];
  for (let x = -iw / 2 + RIB_GAP; x + RIB_W <= iw / 2 - RIB_GAP + 0.01; x += RIB_W + RIB_GAP) ribsX.push(x);
  const cuts = [0, 0.4, FLOOR, FLOOR + rib, H];
  const mesh = sections([-W / 2 - 1, -D / 2 - 1, W / 2 + 1, D / 2 + 1], cuts, (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    d.on(rr(-W / 2 + f, -D / 2 + f, W / 2 - f, D / 2 - f, cr));
    if (z < FLOOR) {
      // Drain slots run front to back between the ribs, short of the rim so the floor holds together.
      if (drain === 'slots') for (const x of ribsX) d.off(rr(x - RIB_GAP + 2, -D / 2 + WALL + 6, x - 2, D / 2 - WALL - 6, 1.5));
      return;
    }
    d.off(rr(-W / 2 + WALL, -D / 2 + WALL, W / 2 - WALL, D / 2 - WALL, Math.max(1, cr - WALL)));
    if (z < FLOOR + rib) for (const x of ribsX) d.on(rr(x, -D / 2 + WALL - 0.01, x + RIB_W, D / 2 - WALL + 0.01, 0));
    if (drain === 'spout') d.off(rr(-SPOUT / 2, -D / 2 - 2, SPOUT / 2, -D / 2 + WALL + 0.01, 0)); // a gap in the front rim, level with the floor
  }, 0.1, 0.05);
  const notes = [
    `A soap dish ${W} × ${D} mm with a ${H} mm rim and ${ribsX.length} ribs ${rib} mm tall for the bar to sit on.`,
    drain === 'slots' ? 'Slots between the ribs let the water through: stand it on the sink edge or a tiled shelf.' : drain === 'spout' ? 'A gap in the front rim lets the water run out: tilt it a little toward the sink.' : 'No drain: empty it now and then.',
    'Print it as it comes, floor down, no supports. PETG takes soap and hot water better than PLA.',
  ];
  return { parts: [{ mesh, name: 'soap-dish' }], notes, preview: mesh };
}
