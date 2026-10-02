// Card holders for small hands: a low curved block with one or two slots
// along an arc, so a hand of cards stands up fanned out on the table, for
// children or anyone who finds a full hand hard to hold. Drawn in plan as
// slabs and printed upright: the slots are cut straight down into the block,
// and the top edge is chamfered at 45°, so nothing overhangs.
import { sections } from './slabs.js';

export const CARDHOLDER_DEFAULTS = {
  length: 180, // the arc's chord, along the middle of the block
  slots: 2,
  slot: 2.4, // the slot's width: a few cards thick
  height: 22,
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const BASE = 6, GAP = 12, CH = 2;

// A band between radii r0 and r1 over the angles a0..a1, centred at (0, cy).
function band(cy, r0, r1, a0, a1, n = 48) {
  const out = [], inn = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push([r1 * Math.cos(a), cy + r1 * Math.sin(a)]); inn.push([r0 * Math.cos(a), cy + r0 * Math.sin(a)]); }
  return [...out, ...inn.reverse()];
}

export function generateCardHolder(options = {}) {
  const o = { ...CARDHOLDER_DEFAULTS, ...options };
  const L = num(o.length, 80, 210, 180), n = Math.round(num(o.slots, 1, 3, 2)), s = num(o.slot, 1.2, 6, 2.4), H = num(o.height, 12, 40, 22);
  // The arc: a chord of L that rises by L/6 in the middle, so the cards fan out.
  const sag = L / 6, R = (L * L) / (8 * sag) + sag / 2, cy = -R + sag / 2;
  const half = Math.asin(Math.min(1, L / 2 / R)), a0 = Math.PI / 2 - half, a1 = Math.PI / 2 + half;
  const depth = n * GAP + 10; // front to back
  const r0 = R - depth / 2, r1 = R + depth / 2;
  const across = 2 * r1 * Math.sin(half);
  if (across > 250) throw new Error(`That holder is ${Math.ceil(across)} mm across: more than a 250 mm bed. A shorter arc.`);
  const slotR = Array.from({ length: n }, (_, i) => R - ((n - 1) * GAP) / 2 + i * GAP);
  const cuts = [0, 0.4, BASE, H];
  for (let z = H - CH; z <= H; z += 0.5) cuts.push(z);
  const mesh = sections([-L / 2 - depth, cy + r0 * Math.cos(half) - 2, L / 2 + depth, cy + r1 + 2], cuts, (z, d) => {
    const f = z < 0.4 ? 0.4 : 0, c = Math.max(0, z - (H - CH)); // the top edge in at 45°
    d.on(band(cy, r0 + f + c, r1 - f - c, a0 + (f + c) / R, a1 - (f + c) / R));
    if (z > BASE) for (const r of slotR) d.off(band(cy, r - s / 2, r + s / 2, a0 + 6 / R, a1 - 6 / R)); // the slots, stopping short of the ends
  }, 0.1, 0.05);
  const notes = [
    `${n} slot${n > 1 ? 's' : ''} ${s} mm wide, ${Math.round(H - BASE)} mm deep, along an arc ${L} mm across: a hand of cards stands up fanned out.`,
    'Push the cards into a slot in a fan, faces toward you. Use the second slot for a second hand or the cards you play next.',
    'Print it upright (as it comes), no supports.',
  ];
  return { parts: [{ mesh, name: 'card-holder' }], notes, preview: mesh };
}
