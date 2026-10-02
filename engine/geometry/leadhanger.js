// Extension lead and hose hangers. A wall plate and a broad arm the coil
// hangs over, with a lip at its end so it can't slide off and a brace under
// it. Two slots through the arm take a hook-and-loop strap round the coil.
// Like the other wall hooks it's a side profile drawn as slabs across its
// width and prints lying on its side: no supports, and strong the way it's
// loaded. The screws go above and below the arm.
import { Mesh } from './mesh.js';
import { rr, sections } from './slabs.js';

export const LEADHANGER_DEFAULTS = {
  width: 60, // across the arm: wider spreads the coil's weight
  reach: 70, // out from the wall: how thick the coil is, plus a bit
  lip: 25,
  strap: true, // slots for a strap round the coil
  strapW: 25,
  thick: 6,
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const R = 2.25; // the screw slots' half width: 4 mm wood screws

export function generateLeadHanger(options = {}) {
  const o = { ...LEADHANGER_DEFAULTS, ...options };
  const W = num(o.width, 30, 120, 60), reach = num(o.reach, 30, 200, 70), lip = num(o.lip, 8, 60, 25), t = num(o.thick, 4, 10, 6);
  const strap = o.strap !== false && o.strap !== 'false', sw = Math.min(num(o.strapW, 10, 50, 25), W - 12);
  const at = Math.max(10, t + 4) + reach / 25, brace = Math.min(40, 16 + reach / 4); // the arm thickens and its brace grows as it reaches further
  const vA = brace + 14, H = vA + at + 34, mid = W / 2;
  const screws = [10, H - 12];
  const strapAt = [t + 14, reach - at - 6].filter((u, i, a) => i === 0 || u - a[0] > 12); // near the wall and near the lip
  const cuts = [0, 0.4, W - 0.4, W, mid - R, mid + R, ...(strap ? [mid - sw / 2, mid + sw / 2] : [])];
  const mesh = sections([-1, -1, reach + 2, H + lip + 2], cuts, (w, d) => {
    const f = w < 0.4 || w > W - 0.4 ? 0.4 : 0; // the bed face steps in: no elephant's foot
    d.on(rr(0, f, t, H - f, 3)); // the wall plate
    d.on(rr(0, vA + f, reach, vA + at - f, at / 2)); // the arm
    d.on(rr(reach - at, vA + f, reach - f, vA + lip, at / 2)); // the lip
    d.on([[t - 0.1, vA - brace], [t + brace, vA + 0.1], [t - 0.1, vA + 0.1]]); // a 45° brace under the arm
    if (strap && Math.abs(w - mid) < sw / 2) for (const u of strapAt) d.off(rr(u - 2.5, vA - brace - 1, u + 2.5, vA + at + 1)); // strap slots through the arm (and the brace under it)
    if (Math.abs(w - mid) < R) for (const v of screws) d.off(rr(-1, v - R, t + 1, v + R));
  }, 0.15);
  // On the wall: (u, v, w) → (W − w, −u, v), a rotation; the wall is y = 0, the hanger in front of it.
  const preview = new Mesh(); preview.append(mesh);
  const q = preview.positions;
  for (let i = 0; i < q.length; i += 3) { const u = q[i], v = q[i + 1], w = q[i + 2]; q[i] = W - w - mid; q[i + 1] = -u; q[i + 2] = v; }
  const notes = [
    `A hanger ${W} mm wide reaching ${reach} mm, with a ${lip} mm lip${strap ? ` and slots for a ${Math.round(sw)} mm strap` : ''}. Two 4 mm screws (with wall plugs on plasterboard), one above the arm and one below.`,
    'Print it on its side (as it comes), no supports. A garden hose wants about 120 mm of reach and 80 mm of width.',
  ];
  return { parts: [{ mesh, name: 'lead-hanger' }], notes, preview };
}
