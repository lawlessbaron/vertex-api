// Sunglasses and glasses wall racks. A narrow strip on the wall with pegs one
// above another: each pair hangs open by its bridge, the peg between the nose
// pads, the lenses hanging clear of the pair below. A turned-up tip keeps a
// pair from sliding off. Like the other wall pieces it's a side profile drawn
// as slabs across its width and prints on its side, with no supports.
import { Mesh } from './mesh.js';
import { rr, sections } from './slabs.js';

export const GLASSESRACK_DEFAULTS = {
  pairs: 4,
  pitch: 58, // between pegs: the lenses' height plus a little
  reach: 34, // how far a peg comes out (the frame's depth at the bridge)
  peg: 12, // across: it fits between the nose pads
  thick: 5,
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const R = 2.25, PEG_T = 7, TIP = 7;

export function generateGlassesRack(options = {}) {
  const o = { ...GLASSESRACK_DEFAULTS, ...options };
  const n = Math.round(num(o.pairs, 1, 6, 4)), pitch = num(o.pitch, 40, 90, 58), L = num(o.reach, 20, 60, 34), W = num(o.peg, 8, 20, 12), t = num(o.thick, 3, 8, 5);
  const top = 14, H = top + (n - 1) * pitch + PEG_T + 50; // room under the last pair's lenses
  if (H > 250) throw new Error(`${n} pairs at ${pitch} mm make a strip ${Math.ceil(H)} mm long: more than a 250 mm bed. Fewer pairs, or two racks.`);
  const pegs = Array.from({ length: n }, (_, i) => H - top - i * pitch); // each peg's top, from the bottom
  const screws = [8, H - 6];
  const mesh = sections([-1, -1, t + L + 1, H + 1], [0, 0.4, W - 0.4, W, W / 2 - R, W / 2 + R], (w, d) => {
    const f = w < 0.4 || w > W - 0.4 ? 0.4 : 0;
    d.on(rr(0, f, t, H - f, 2.5)); // the strip on the wall
    for (const v of pegs) {
      d.on(rr(0, v - PEG_T, t + L, v, PEG_T / 2)); // the peg
      d.on(rr(t + L - PEG_T, v - PEG_T, t + L, v + TIP, PEG_T / 2)); // its tip, turned up
      d.on([[t - 0.1, v - PEG_T - 10], [t + 10, v - PEG_T + 0.1], [t - 0.1, v - PEG_T + 0.1]]); // a fillet under it
    }
    if (Math.abs(w - W / 2) < R) for (const v of screws) d.off(rr(-1, v - R, t + 1, v + R));
  }, 0.12, 0.08);
  // On the wall: (u, v, w) → (W − w − W/2, −u, v), a rotation; the wall is y = 0.
  const preview = new Mesh(); preview.append(mesh);
  const q = preview.positions;
  for (let i = 0; i < q.length; i += 3) { const u = q[i], v = q[i + 1], w = q[i + 2]; q[i] = W - w - W / 2; q[i + 1] = -u; q[i + 2] = v; }
  const notes = [
    `${n} pair${n > 1 ? 's' : ''}, one above another, ${pitch} mm apart: a strip ${W} mm wide and ${Math.round(H)} mm long. Two 4 mm screws.`,
    'Hang each pair open, the peg between the nose pads. Print it on its side (as it comes), no supports.',
  ];
  return { parts: [{ mesh, name: 'glasses-rack' }], notes, preview };
}
