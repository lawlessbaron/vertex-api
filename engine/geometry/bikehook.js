// Bike and helmet wall hooks. A thick wall plate and an arm that the front
// wheel hangs from, with a channel sized to the tyre (two side walls guide it
// in and stop it twisting off) and a lip at the end. A peg below holds the
// helmet. Like the other wall hooks it's a side profile drawn as slabs across
// its width and prints lying on its side: no supports, and the layers run
// the way it's loaded. Three screws: two above the arm, one below.
import { Mesh } from './mesh.js';
import { rr, sections } from './slabs.js';

export const BIKEHOOK_DEFAULTS = {
  tyre: 50, // the tyre's width (mm): 25 road, 50 gravel and trail, 65 enduro
  reach: 70, // out from the wall: the rim's depth plus a bit
  lip: 30,
  helmet: true, // a peg for the helmet under the hook
  thick: 8,
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const R = 2.5; // the screw slots' half width: 5 mm screws

export function generateBikeHook(options = {}) {
  const o = { ...BIKEHOOK_DEFAULTS, ...options };
  const tyre = num(o.tyre, 20, 90, 50), reach = num(o.reach, 40, 120, 70), lip = num(o.lip, 15, 60, 30), t = num(o.thick, 6, 12, 8);
  const helmet = o.helmet !== false && o.helmet !== 'false';
  const sw = 6, W = tyre + 4 + 2 * sw, mid = W / 2; // the channel: the tyre plus 2 mm each side, and its walls
  const at = 14, brace = Math.min(50, 22 + reach / 4), side = 16; // the arm, its brace, how high the channel's walls stand
  const vP = 22, peg = 55; // the helmet peg, low on the plate
  const vA = (helmet ? vP + 16 + 12 : 14) + brace, H = vA + at + 40;
  const screws = [vA + at + 14, vA + at + 30, ...(helmet ? [] : [8])]; // two above the arm (and one low if there's no peg)
  const lowScrew = helmet ? vP - 10 : null; // under the peg
  if (lowScrew != null && lowScrew > 6) screws.push(lowScrew);
  const cuts = [0, 0.4, W - 0.4, W, sw, W - sw, mid - R, mid + R, mid - 8, mid + 8];
  const mesh = sections([-1, -1, Math.max(reach, peg) + 2, H + lip + side + 2], cuts, (w, d) => {
    const f = w < 0.4 || w > W - 0.4 ? 0.4 : 0; // the bed face steps in: no elephant's foot
    const wall = w < sw || w > W - sw;
    d.on(rr(0, f, t, H - f, 4)); // the wall plate
    d.on(rr(0, vA + f, reach, vA + at - f, at / 2)); // the arm
    d.on(rr(reach - at, vA + f, reach - f, vA + lip, at / 2)); // the lip
    d.on([[t - 0.1, vA - brace], [t + brace, vA + 0.1], [t - 0.1, vA + 0.1]]); // a 45° brace under the arm
    if (wall) d.on(rr(t, vA + at - 2, reach - at + 2, vA + at + side, 3)); // the channel's walls either side of the tyre
    if (helmet && Math.abs(w - mid) < 8) { d.on(rr(0, vP, peg - 8, vP + 16, 6)); d.disc(peg - 9, vP + 12, 9); } // the helmet peg, a knob at its end
    if (Math.abs(w - mid) < R) for (const v of screws) d.off(rr(-1, v - R, t + 1, v + R));
  }, 0.15, 0.1);
  // On the wall: (u, v, w) → (W − w − W/2, −u, v), a rotation; the wall is y = 0.
  const preview = new Mesh(); preview.append(mesh);
  const q = preview.positions;
  for (let i = 0; i < q.length; i += 3) { const u = q[i], v = q[i + 1], w = q[i + 2]; q[i] = W - w - mid; q[i + 1] = -u; q[i + 2] = v; }
  const notes = [
    `A hook for a ${tyre} mm tyre, reaching ${reach} mm with a ${lip} mm lip${helmet ? ' and a helmet peg underneath' : ''}. ${screws.length} × 5 mm screws into a stud or masonry plugs: a bike is heavy, so not plasterboard alone.`,
    'Print it on its side (as it comes), in PETG or ABS with 5 walls and 40 % infill; no supports.',
  ];
  return { parts: [{ mesh, name: 'bike-hook' }], notes, preview };
}
