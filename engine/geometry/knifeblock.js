// Knife blocks: an upright block with a slot for each blade and, if asked, a round hole for a
// sharpening steel or scissors. The slots stop above a solid floor, so the block is as tall as the
// longest blade plus that floor and the tips never touch the bench. Printed as it stands: floor on
// the bed, the slots straight up. Nothing overhangs.
import { rr, sections } from './slabs.js';

export const KNIFEBLOCK_DEFAULTS = {
  knives: 5, // slots
  blade: 40, // the widest blade, heel to spine
  thick: 3, // the slot's width: the thickest spine, plus a little
  length: 200, // the longest blade, tip to handle
  steel: true, // a round hole for a sharpening steel
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const WALL = 8, GAP = 9, FLOOR = 4, R = 8, STEEL = 16, TOP = 2;

export function generateKnifeBlock(options = {}) {
  const o = { ...KNIFEBLOCK_DEFAULTS, ...options };
  const n = Math.round(num(o.knives, 1, 10, 5)), bl = num(o.blade, 15, 60, 40), t = num(o.thick, 1.5, 6, 3);
  const len = num(o.length, 60, 240, 200), steel = o.steel !== false && o.steel !== 'false';
  const H = len + FLOOR + TOP, W = 2 * WALL + n * t + (n - 1) * GAP + (steel ? STEEL + GAP : 0), D = bl + 2 * WALL;
  if (H > 250) throw new Error(`A ${len} mm blade needs a block ${Math.ceil(H)} mm tall: more than a 250 mm printer can print. Leave the longest knife out.`);
  const slots = Array.from({ length: n }, (_, i) => -W / 2 + WALL + i * (t + GAP));
  const cuts = [0, 0.4, FLOOR, H - 1.2, H];
  const mesh = sections([-W / 2 - 1, -D / 2 - 1, W / 2 + 1, D / 2 + 1], cuts, (z, d) => {
    const f = z < 0.4 ? 0.4 : 0, c = z > H - 1.2 ? 1.2 : 0; // small chamfers along the bottom and top edges
    d.on(rr(-W / 2 + f + c, -D / 2 + f + c, W / 2 - f - c, D / 2 - f - c, R));
    if (z < FLOOR) return;
    for (const x of slots) d.off(rr(x, -bl / 2, x + t, bl / 2, 0));
    if (steel) d.disc(W / 2 - WALL - STEEL / 2, 0, STEEL / 2, 0);
  }, 0.1, 0.05);
  const notes = [
    `${n} slot${n > 1 ? 's' : ''} ${t} mm wide for blades up to ${bl} mm across and ${len} mm long${steel ? ', and a hole for a sharpening steel' : ''}, in a block ${Math.round(W)} × ${Math.round(D)} × ${Math.round(H)} mm.`,
    'Measure your longest blade from the tip to where the handle starts: the block is that tall plus a floor, so the tip never touches the bench.',
    'Print it upright, no supports. 15 % infill keeps it light; dry the knives before putting them back.',
  ];
  return { parts: [{ mesh, name: 'knife-block' }], notes, preview: mesh };
}
