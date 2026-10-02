// Pot lid racks: lids stand on their edges between upright dividers, for a
// cupboard shelf, a deep drawer or the counter. Each divider has a scoop in
// its top so a lid's handle clears it and a hand gets round the lid, and a
// thicker foot so it doesn't wobble. Drawn in plan as slabs and printed
// upright: the dividers go straight up from the base, the scoops widen as
// they rise, and nothing overhangs.
import { rr, sections } from './slabs.js';

export const LIDRACK_DEFAULTS = {
  lids: 5,
  gap: 40, // between dividers: a lid with its knob, plus a little
  width: 140, // across the rack (how much of a lid's rim it holds)
  height: 90, // the dividers
  scoop: 35, // how deep the scoop is in each divider's top
  screws: false, // holes in the base for a cupboard shelf
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const BASE = 3, DIV = 4, FOOT = 8, FOOT_H = 12;

export function generateLidRack(options = {}) {
  const o = { ...LIDRACK_DEFAULTS, ...options };
  const n = Math.round(num(o.lids, 1, 10, 5)), gap = num(o.gap, 15, 80, 40), W = num(o.width, 60, 240, 140);
  const H = num(o.height, 40, 200, 90), scoop = Math.min(num(o.scoop, 0, 80, 35), H - 20), screws = o.screws === true || o.screws === 'true';
  const L = (n + 1) * DIV + n * gap; // along the rack: a divider at each end and between every two lids
  if (L > 250 || W > 250 || H + BASE > 250) throw new Error(`That rack is ${Math.ceil(L)} × ${Math.ceil(W)} mm: bigger than a 250 mm bed. Fewer lids or less space between them, or two racks.`);
  const divY = (i) => -L / 2 + i * (DIV + gap); // a divider's front face
  // The scoop: a rounded dip in each divider's top, half as wide as the rack at the top.
  const sw = W * 0.5;
  const scoopHalf = (z) => {
    const d = z - (BASE + H - scoop);
    if (d <= 0) return 0;
    const t = d / scoop; // 0 at the bottom of the scoop, 1 at the top
    return (sw / 2) * Math.sqrt(1 - (1 - t) * (1 - t)); // a quarter circle each side: steep at the bottom, wide at the top
  };
  const cuts = [0, 0.4, BASE, BASE + FOOT_H, BASE + H];
  if (scoop > 0) for (let z = BASE + H - scoop; z < BASE + H; z += 1) cuts.push(z);
  const mesh = sections([-W / 2 - 1, -L / 2 - 1, W / 2 + 1, L / 2 + 1], cuts, (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    if (z < BASE) {
      d.on(rr(-W / 2 + f, -L / 2 + f, W / 2 - f, L / 2 - f, 4));
      if (screws) for (const y of [-L / 2 + DIV + gap / 2, L / 2 - DIV - gap / 2]) d.disc(0, y, 2.2, 0);
      return;
    }
    for (let i = 0; i <= n; i++) {
      const y = divY(i), foot = z < BASE + FOOT_H ? (FOOT - DIV) / 2 : 0;
      const y0 = Math.max(-L / 2, y - foot), y1 = Math.min(L / 2, y + DIV + foot);
      d.on(rr(-W / 2, y0, W / 2, y1, Math.min(1, (y1 - y0) / 2 - 0.01)));
      const h = scoopHalf(z);
      if (h > 0.2) d.off(rr(-h, y0 - 1, h, y1 + 1));
    }
  }, 0.3, 0.15);
  const notes = [
    `${n} lid${n > 1 ? 's' : ''}, ${gap} mm apart (a lid and its knob), on a rack ${Math.round(L)} × ${Math.round(W)} mm and ${Math.round(H + BASE)} mm tall.`,
    'Stand each lid on its rim, knob facing the same way. The scoops let you reach round a lid and lift it out.',
    `Print it upright (as it comes), no supports.${screws ? ' Two screws hold it to a shelf.' : ' A couple of rubber feet stop it sliding.'}`,
  ];
  return { parts: [{ mesh, name: 'lid-rack' }], notes, preview: mesh };
}
