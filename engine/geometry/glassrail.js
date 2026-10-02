// Under-shelf wine glass rails: screwed under a cupboard shelf, they hold
// wine glasses upside down by their feet. Each row is a T-slot: the foot
// slides in from the front and rests on two lips, the stem hanging down
// through the gap between them. Rows sit side by side and share walls. The
// cross-section is the same all along, so it's drawn as slabs along the
// rail's length and printed standing on its end: the profile lies flat on
// the bed and nothing overhangs. The screw holes go across the print, so
// they're diamonds.
import { Mesh } from './mesh.js';
import { rr, sections } from './slabs.js';

export const GLASSRAIL_DEFAULTS = {
  rows: 2,
  footD: 75, // a glass's foot, across
  footT: 4, // the foot's thickness at its rim
  stem: 12, // the stem's thickness where it meets the foot (the gap between the lips)
  length: 200, // how far the rail runs into the cupboard
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const TOP = 4, WALL = 4, LIP = 4;

export function glassRailPlan(options = {}) {
  const o = { ...GLASSRAIL_DEFAULTS, ...options };
  const n = Math.round(num(o.rows, 1, 4, 2)), foot = num(o.footD, 40, 110, 75) + 4, ft = num(o.footT, 2, 12, 4) + 3;
  const stem = Math.min(num(o.stem, 6, 30, 12) + 4, foot - 16), L = num(o.length, 60, 240, 200);
  const W = n * foot + (n + 1) * WALL, H = TOP + ft + LIP; // across, and down from the shelf
  return { n, foot, ft, stem, L, W, H };
}

export function generateGlassRail(options = {}) {
  const p = glassRailPlan(options), { n, foot, ft, stem, L, W, H } = p;
  if (W > 250) throw new Error(`${n} rows make a rail ${Math.ceil(W)} mm wide: more than a 250 mm bed. Fewer rows, or two rails.`);
  // The profile: x across, y up (y = H is the shelf's underside); z along the rail, the way it prints.
  const cx = (i) => WALL + i * (foot + WALL) + foot / 2; // a row's centre
  const holesZ = [20, L - 20];
  const cuts = [0, 0.4, L];
  for (const z of holesZ) cuts.push(z - 3, z, z + 3);
  const mesh = sections([-1, -1, W + 1, H + 1], cuts, (z, d) => {
    const f = z < 0.4 ? 0.4 : 0; // the bed face steps in
    d.on(rr(f, H - TOP + f, W - f, H - f, 1)); // the plate under the shelf
    for (let i = 0; i <= n; i++) { const x = i * (foot + WALL); d.on(rr(x + (i === 0 ? f : 0), f, x + WALL - (i === n ? f : 0), H - TOP + 0.01, 1)); } // the walls
    for (let i = 0; i < n; i++) {
      d.on(rr(cx(i) - foot / 2 - 0.01, f, cx(i) - stem / 2, LIP, 1)); // the lips the foot rests on
      d.on(rr(cx(i) + stem / 2, f, cx(i) + foot / 2 + 0.01, LIP, 1));
      for (const zh of holesZ) if (Math.abs(z - zh) < 3) { const r = 3 - Math.abs(z - zh); d.off(rr(cx(i) - r, H - TOP - 1, cx(i) + r, H + 1)); } // a diamond screw hole over each row
    }
  }, 0.1, 0.06);
  // Under the shelf: (x, y, z) → (W/2 − x, z, y − H), a rotation; the rail runs back into the cupboard.
  const preview = new Mesh(); preview.append(mesh);
  const q = preview.positions;
  for (let i = 0; i < q.length; i += 3) { const x = q[i], y = q[i + 1], z = q[i + 2]; q[i] = W / 2 - x; q[i + 1] = z; q[i + 2] = y - H; }
  const notes = [
    `${n} row${n > 1 ? 's' : ''} for glasses with feet up to ${Math.round(foot - 4)} mm across and stems up to ${Math.round(stem - 4)} mm, ${L} mm into the cupboard. The rail is ${Math.round(W)} mm wide and hangs ${Math.round(H)} mm below the shelf.`,
    `Screw it under the shelf through the ${2 * n} diamond holes (4 mm screws, no longer than the shelf is thick), then slide the glasses in from the front, upside down.`,
    'Print it standing on its end (as it comes), no supports.',
  ];
  return { parts: [{ mesh, name: 'glass-rail' }], notes, preview };
}
