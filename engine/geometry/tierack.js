// Tie and belt racks: a hanger that hooks over the wardrobe rail, with arms
// either side for ties (each with a little upturned tip so a tie can't slide
// off) and a bar along the bottom with pegs for belt buckles. The whole rack
// is one outline, printed lying flat (it's that outline stood up off the bed),
// so nothing overhangs; it hangs on the rail by its hook, face on.
import { Mesh } from './mesh.js';
import { rr, sections } from './slabs.js';

export const TIERACK_DEFAULTS = {
  rail: 25, // the wardrobe rail, across
  ties: 10, // arms, both sides together
  belts: 4, // pegs along the bottom
  arm: 80, // each arm, out from the middle
  thick: 8, // the rack, as it prints
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const SPINE = 10, ARM_W = 6, TIP = 4, PITCH = 12, HOOK = 5, BAR = 8, PEG = 10;

export function generateTieRack(options = {}) {
  const o = { ...TIERACK_DEFAULTS, ...options };
  const rail = num(o.rail, 12, 45, 25), n = Math.round(num(o.ties, 2, 20, 10)), belts = Math.round(num(o.belts, 0, 8, 4));
  const A = num(o.arm, 40, 110, 80), T = num(o.thick, 5, 12, 8);
  const W = 2 * A + SPINE;
  // From the bottom up: the belt bar, the arms (alternating sides, 12 mm apart), then the hook.
  const yArm0 = BAR + PEG + 14, yTop = yArm0 + (n - 1) * PITCH + ARM_W + 10;
  const R = rail / 2 + 1, cx = R + HOOK / 2, cy = yTop + R; // the hook's centre: its left side rises straight up from the middle of the spine
  const H = cy + R + HOOK;
  if (W > 250 || H > 250) throw new Error(`That rack is ${Math.ceil(W)} × ${Math.ceil(H)} mm: more than a 250 mm bed. Fewer ties or shorter arms.`);
  // The hook: a band round the rail from level on the left (a straight leg down to the spine) over the top
  // and round to level on the right, open underneath, wide enough for the rail to pass.
  const hook = [];
  const a0 = Math.PI, a1 = -0.1, steps = 48;
  for (let i = 0; i <= steps; i++) { const a = a0 + ((a1 - a0) * i) / steps; hook.push([cx + (R + HOOK) * Math.cos(a), cy + (R + HOOK) * Math.sin(a)]); }
  for (let i = steps; i >= 0; i--) { const a = a0 + ((a1 - a0) * i) / steps; hook.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
  const flat = sections([-W / 2 - 1, -1, W / 2 + 1, H + 1], [0, 0.4, T], (z, d) => {
    d.on(rr(-SPINE / 2, 0, SPINE / 2, yTop, 3)); // the spine, up to the bottom of the hook
    d.on(rr(-HOOK / 2, yTop - 3, HOOK / 2, cy + 0.5, 0)); // the hook's leg, up to where it turns over
    d.on(hook.slice().reverse()); // (the band runs clockwise as built: turned round so it fills)
    d.disc(cx + (R + HOOK / 2) * Math.cos(a1), cy + (R + HOOK / 2) * Math.sin(a1), HOOK / 2); // a round end on the hook
    for (let i = 0; i < n; i++) {
      const y = yArm0 + i * PITCH, s = i % 2 ? 1 : -1, x0 = s > 0 ? 0 : -A, x1 = s > 0 ? A : 0;
      d.on(rr(x0, y, x1, y + ARM_W, 2)); // an arm
      d.on(rr(s > 0 ? A - ARM_W : -A, y, s > 0 ? A : -A + ARM_W, y + ARM_W + TIP, 2.5)); // its tip, turned up
    }
    if (belts) {
      d.on(rr(-W / 2, 0, W / 2, BAR, 3)); // the belt bar
      for (let i = 0; i < belts; i++) { const x = -W / 2 + (W * (i + 0.5)) / belts; d.on(rr(x - 3, BAR - 1, x + 3, BAR + PEG, 3)); }
    }
  }, 0.1, 0.05);
  // Hanging: the flat outline stood up on its edge, face on (a turn of 90° about x).
  const preview = new Mesh(); preview.append(flat);
  const q = preview.positions;
  for (let i = 0; i < q.length; i += 3) { const y = q[i + 1], z = q[i + 2]; q[i + 1] = T / 2 - z; q[i + 2] = y; }
  const notes = [
    `A rack ${Math.round(W)} mm across and ${Math.round(H)} mm tall, with ${n} tie arms${belts ? ` and ${belts} belt pegs` : ''}, hooking over a rail up to ${rail} mm across.`,
    'Lift it onto the rail by the hook. Drape a tie over each arm, and hang belts by their buckles on the pegs along the bottom.',
    `Print it flat (as it comes), ${T} mm thick, no supports. PETG or a few extra walls makes the hook stiffer.`,
  ];
  return { parts: [{ mesh: flat, name: 'tie-rack' }], notes, preview };
}
