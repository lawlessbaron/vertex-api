// Under-desk headphone hooks. A plate that screws up under the desk, a drop,
// and an arm with a lip at its end: the headband rests on the arm, the lip
// keeps it on. Two notches in the drop hold the lead wound up. It prints
// lying on its side (the side view flat on the bed), so nothing overhangs,
// and the screw holes are square slots through the plate.
import { Mesh } from './mesh.js';
import { rr, sections } from './slabs.js';

export const DESKHANGER_DEFAULTS = {
  width: 30, // across the arm: what the headband rests on
  drop: 45, // under the desk to the arm
  reach: 45, // how far the arm comes out
  lip: 12,
  thick: 6,
  holes: 2,
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

export function generateDeskHanger(options = {}) {
  const o = { ...DESKHANGER_DEFAULTS, ...options };
  const W = num(o.width, 15, 60, 30), drop = num(o.drop, 20, 120, 45), reach = num(o.reach, 25, 90, 45), lip = num(o.lip, 4, 30, 12), t = num(o.thick, 4, 10, 6), n = Math.round(num(o.holes, 1, 3, 2));
  const plateL = Math.max(36, 18 * n + 6), r = 2.25;
  const holesU = Array.from({ length: n }, (_, k) => plateL - 10 - k * 16); // along the plate, from its far end
  // The side view in (u along the arm, v down from the desk), the width in w.
  const cuts = [0, 0.4, W / 2 - r, W / 2 + r, W - 0.4, W];
  const part = sections([-1, -1, Math.max(plateL, reach) + 1, drop + t + 1], cuts, (w, d) => {
    const f = w < 0.4 || w > W - 0.4 ? 0.4 : 0; // the faces on the bed and on top step in: no elephant's foot
    d.on(rr(0, f, plateL, t - f, 2)); // the plate, under the desk
    d.on(rr(f, 0, t - f, drop + t, 2)); // the drop
    d.on(rr(0, drop + f, reach, drop + t - f, t / 2)); // the arm
    d.on(rr(reach - t, drop - lip, reach - f, drop + t, t / 2)); // the lip, turned up
    // Fillets in the two inside corners: a square filled, a circle taken out.
    d.on(rr(t, drop - 4, t + 4, drop)); d.disc(t + 4, drop - 4, 4, 0);
    d.on(rr(t, t, t + 4, t + 4)); d.disc(t + 4, t + 4, 4, 0);
    // Two notches in the drop's back edge for the lead, wound round.
    for (const v of [drop * 0.35, drop * 0.7]) d.off(rr(-1, v - 2, 2.5, v + 2, 1));
    // Square screw slots through the plate, only in the middle of its width.
    if (Math.abs(w - W / 2) < r) for (const u of holesU) d.off(rr(u - r, -1, u + r, t + 1));
  }, 0.12);
  // Hanging as it's used: (u, v, w) → (u, w, −v), a rotation; the desk at z = 0.
  const use = new Mesh(); use.append(part);
  const q = use.positions;
  for (let i = 0; i < q.length; i += 3) { const u = q[i], v = q[i + 1], w = q[i + 2]; q[i] = u; q[i + 1] = w - W / 2; q[i + 2] = -v; }
  const notes = [
    `A hook ${W} mm wide, ${drop} mm under the desk, reaching ${reach} mm, with a ${lip} mm lip and ${n} screw slot${n > 1 ? 's' : ''} for 4 mm wood screws.`,
    'Print it on its side (as it comes), no supports; wind the lead round the two notches.',
  ];
  return { parts: [{ mesh: part, name: 'headphone-hook' }], notes, preview: use };
}
