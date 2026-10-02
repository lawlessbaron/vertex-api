// Tube squeezers: a slide-on squeezer and a winding key, sized to the tube,
// to get the last of the toothpaste, paint, glue or cream out. The squeezer
// is a plate with a slot the flattened tube passes through: push it toward
// the cap. The key is a slotted bar with a ring for a handle: thread the end
// of the tube through and wind it up. Both are outlines printed flat (with a
// 45° chamfer round the squeezer's top edge), so nothing overhangs.
import { Mesh } from './mesh.js';
import { rr, sections } from './slabs.js';

export const TUBESQUEEZER_DEFAULTS = {
  tube: 50, // the tube's flattened end, across
  gap: 1.6, // the slot: the flattened tube's thickness, and a little
  thick: 6, // the squeezer, as it prints
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const CH = 1.2, BAR = 9, KEY_T = 4, RING = 9, HOLE = 5;

export function generateTubeSqueezer(options = {}) {
  const o = { ...TUBESQUEEZER_DEFAULTS, ...options };
  const w = num(o.tube, 15, 90, 50), gap = num(o.gap, 0.8, 4, 1.6), T = num(o.thick, 4, 12, 6);
  // The squeezer: a rounded plate with the slot across its middle and a grip notch either side.
  const SW = w + 18, SD = 24;
  const cuts = [0, 0.4, T - CH, T];
  for (let z = T - CH; z <= T; z += 0.2) cuts.push(z);
  const squeezer = sections([-SW / 2 - 1, -SD / 2 - 1, SW / 2 + 1, SD / 2 + 1], cuts, (z, d) => {
    const f = z < 0.4 ? 0.4 : 0, c = Math.max(0, z - (T - CH)); // the top edge in at 45°
    d.on(rr(-SW / 2 + f + c, -SD / 2 + f + c, SW / 2 - f - c, SD / 2 - f - c, 8 - c));
    d.off(rr(-w / 2 - 1, -gap / 2, w / 2 + 1, gap / 2, gap / 2)); // the slot
    for (const s of [-1, 1]) d.disc(s * (SW / 2 + 4), 0, 7, 0); // grip notches at the ends
  }, 0.05, 0.025);
  // The key: a bar with a long slot, a neck, and a ring to turn it by.
  const KL = w + 12, y0 = 0;
  const key = sections([-KL / 2 - 1, -RING - 1, KL / 2 + 12 + 2 * RING + 1, RING + 1], [0, 0.4, KEY_T], (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    d.on(rr(-KL / 2 + f, y0 - BAR / 2 + f, KL / 2 - f, y0 + BAR / 2 - f, 3));
    d.off(rr(-w / 2 - 1, y0 - gap / 2 - 0.2, w / 2 + 1, y0 + gap / 2 + 0.2, (gap + 0.4) / 2));
    d.on(rr(KL / 2 - 2, y0 - 3 + f, KL / 2 + 12, y0 + 3 - f, 1)); // the neck
    d.disc(KL / 2 + 10 + RING, y0, RING - f);
    d.disc(KL / 2 + 10 + RING, y0, HOLE, 0);
  }, 0.05, 0.025);
  // Together: the squeezer, and the key laid in front of it.
  const preview = new Mesh(); preview.append(squeezer);
  const k = new Mesh(); k.append(key);
  for (let i = 0, q = k.positions; i < q.length; i += 3) { q[i] -= RING + 5; q[i + 1] -= SD / 2 + BAR / 2 + 8; }
  preview.append(k);
  const notes = [
    `A squeezer and a winding key for tubes up to ${w} mm wide flattened, with a ${gap} mm slot.`,
    'Slide the squeezer over the tube from the end and push it toward the cap. Or thread the end of the tube through the key\'s slot and wind it up by the ring.',
    'Print both flat (as they come), no supports. If the slot\'s too tight for a thick tube, go up a few tenths.',
  ];
  return { parts: [{ mesh: squeezer, name: 'tube-squeezer' }, { mesh: key, name: 'tube-key' }], notes, preview };
}
