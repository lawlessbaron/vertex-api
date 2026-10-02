// Bag clips with a date dial: a spring clip for an open packet with a dial on
// its top arm, turned to the day the packet was opened. Two parts. The clip
// prints flat: two arms joined by a loop at one end (the spring), the bag
// pinched between them, and a peg standing up from the top arm. The dial is a
// disc with the days cut into its top that presses onto the peg and turns,
// a notch on the arm pointing at today. Nothing overhangs in either.
import { textPolygons, textUnits } from './font.js';
import { rr, sections } from './slabs.js';

export const DATECLIP_DEFAULTS = {
  length: 110, // the clip's arms
  thick: 6, // the clip, as it prints (how wide the clip's grip is)
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const ARM = 6, GAP = 0.8, LOOP = 7, PEG = 3, PEG_H = 3.2, DIAL = 13, DIAL_T = 3, ETCH = 0.6, FIT = 0.1;
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export function generateDateClip(options = {}) {
  const o = { ...DATECLIP_DEFAULTS, ...options };
  const L = num(o.length, 70, 200, 110), t = num(o.thick, 4, 12, 6);
  // Plan: the arms along x, the loop at x = 0; the bottom arm y ∈ [0, ARM], the top one above the gap.
  const yTop = ARM + GAP, px = L * 0.55, py = yTop + ARM / 2; // the peg, on the top arm
  const loopR = (2 * ARM + GAP) / 2 + 0.01;
  const clip = sections([-LOOP - loopR - 1, -1, L + 1, 2 * ARM + GAP + 1], [0, 0.4, t, t + PEG_H], (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    if (z < t) {
      d.on(rr(0, f, L - f, ARM - f, 2)); // the bottom arm
      d.on(rr(0, yTop + f, L - f, yTop + ARM - f, 2)); // the top arm
      d.disc(0, (2 * ARM + GAP) / 2, loopR - f); // the loop that springs them together
      d.disc(0, (2 * ARM + GAP) / 2, loopR - ARM * 0.55, 0); // hollow, so it flexes
      d.off([[px + DIAL + 2, yTop + ARM + 0.01], [px + DIAL + 4, yTop + ARM - 2], [px + DIAL + 6, yTop + ARM + 0.01]]); // the pointer notch
      return;
    }
    d.disc(px, py, PEG); // the peg the dial turns on
  }, 0.08, 0.04);
  // The dial: a disc with the days round its top, a hole that grips the peg.
  const letters = [];
  const size = 3.2;
  DAYS.forEach((day, i) => {
    const a = Math.PI / 2 - (i * 2 * Math.PI) / 7, w = (textUnits(day) * size) / 6, r = DIAL - 4.2;
    for (const q of textPolygons(day, -w / 2, -size / 2, size, 0.6)) {
      // Each word turned to face outward, then set at its place round the dial.
      letters.push(q.map(([x, y]) => { const yy = y + r, ang = a - Math.PI / 2; return [x * Math.cos(ang) - yy * Math.sin(ang), x * Math.sin(ang) + yy * Math.cos(ang)]; }));
    }
  });
  const dial = sections([-DIAL - 1, -DIAL - 1, DIAL + 1, DIAL + 1], [0, 0.4, DIAL_T - ETCH, DIAL_T], (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    d.disc(0, 0, DIAL - f);
    d.disc(0, 0, PEG - FIT, 0); // the hole: a press fit on the peg, stiff enough to stay put
    if (z > DIAL_T - ETCH) for (const q of letters) d.off(q);
  }, 0.05, 0.03);
  const notes = [
    `A clip ${L} mm long that grips ${t} mm of a bag, and a dial ${2 * DIAL} mm across with the days round it.`,
    'Press the dial onto the peg and turn it so the day you opened the packet sits at the notch. If it turns too freely, a drop of glue on the peg and none in the dial still lets it turn stiffly.',
    'Print both flat (as they come), no supports. PETG gives the clip a better spring than PLA.',
  ];
  return { parts: [{ mesh: clip, name: 'date-clip' }, { mesh: dial, name: 'date-dial' }], notes, preview: clip };
}
