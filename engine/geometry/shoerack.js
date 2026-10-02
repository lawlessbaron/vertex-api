// Shoe and boot wall racks. A wall shelf that tilts a pair of shoes toward
// you (so you see them side on, toes forward), with a lip at the front, a
// brace underneath, and a wall plate that screws up. Shelves are modules:
// line several up side by side, or stack them, at whatever spacing your
// shoes need. Like the other wall pieces it's a side profile drawn as slabs
// across its width and prints lying on its side, with no supports.
import { Mesh } from './mesh.js';
import { rr, sections } from './slabs.js';

export const SHOERACK_DEFAULTS = {
  width: 200, // across: one pair side by side (about 2 × 95 mm for adult shoes)
  depth: 180, // how far the shelf comes out: about two-thirds of the shoe's length
  tilt: 15, // degrees the shelf slopes down toward you
  lip: 18,
  boots: false, // a taller back for boots, and a deeper lip
  thick: 6,
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const R = 2.25; // 4 mm screws

export function generateShoeRack(options = {}) {
  const o = { ...SHOERACK_DEFAULTS, ...options };
  const W = num(o.width, 80, 250, 200), L = num(o.depth, 80, 240, 180), tilt = (num(o.tilt, 0, 30, 15) * Math.PI) / 180, t = num(o.thick, 4, 10, 6);
  const boots = o.boots === true || o.boots === 'true', lip = num(o.lip, 8, 50, boots ? 30 : 18), st = 7; // the shelf's thickness
  const drop = L * Math.tan(tilt), brace = Math.min(80, L * 0.45);
  const vTop = brace + drop + st + 10, H = vTop + (boots ? 80 : 40); // the shelf meets the wall at vTop
  const screws = [12, H - 12].concat(H > 140 ? [H / 2 + 20] : []);
  const cols = [W * 0.2, W * 0.8]; // two screw columns, near each end
  // The shelf as one polygon: along its slope, from the wall out and down.
  const ca = Math.cos(tilt), sa = Math.sin(tilt);
  const shelf = [[0, vTop], [L * ca, vTop - L * sa], [L * ca - st * sa, vTop - L * sa - st * ca], [0, vTop - st / ca]];
  const tipX = L * ca, tipY = vTop - L * sa;
  const cuts = [0, 0.4, W - 0.4, W, ...cols.flatMap((c) => [c - R, c + R])];
  const mesh = sections([-1, -1, tipX + 4, H + 2], cuts, (w, d) => {
    const f = w < 0.4 || w > W - 0.4 ? 0.4 : 0; // the bed face steps in: no elephant's foot
    d.on(rr(0, f, t, H - f, 3)); // the wall plate
    d.on(shelf); // the sloping shelf
    d.on(rr(tipX - st, tipY - st, tipX, tipY + lip, st / 2)); // the lip, standing up off its front
    d.on([[t - 0.1, vTop - brace - drop * 0.5], [t + brace, vTop - st - (brace / L) * drop - 0.5], [t - 0.1, vTop - st + 0.1]]); // a brace under it
    if (cols.some((c) => Math.abs(w - c) < R)) for (const v of screws) if (v < vTop - st - 2 || v > vTop + 2) d.off(rr(-1, v - R, t + 1, v + R));
  }, 0.15, 0.1);
  // On the wall: (u, v, w) → (W − w − W/2, −u, v), a rotation; the wall is y = 0.
  const preview = new Mesh(); preview.append(mesh);
  const q = preview.positions;
  for (let i = 0; i < q.length; i += 3) { const u = q[i], v = q[i + 1], w = q[i + 2]; q[i] = W - w - W / 2; q[i + 1] = -u; q[i + 2] = v; }
  const notes = [
    `A shelf ${W} mm wide and ${L} mm deep, tilted ${Math.round((tilt * 180) / Math.PI)}° with a ${lip} mm lip${boots ? ', with a taller back for boots' : ''}. Screws: ${2 * screws.filter((v) => v < vTop - st - 2 || v > vTop + 2).length} × 4 mm (wall plugs on plasterboard).`,
    'Print it on its side (as it comes), no supports. Make a few and line them up, or stack them about a shoe’s height apart.',
  ];
  return { parts: [{ mesh, name: 'shoe-shelf' }], notes, preview };
}
