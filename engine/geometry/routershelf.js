// Router and modem wall shelves. A flat shelf sized to the box, on a wall
// plate with a brace underneath, low fences either side and a lip at the
// front so it can't walk off, rows of short vent slots so it breathes, and a
// notch at the back for the power and network cables to drop through. The
// brace is three ribs (both ends and the middle), stiff enough for a router. Like
// the other wall pieces it's a side profile drawn as slabs across its width
// and prints lying on its side, with no supports: the vents and the cable
// notch are short bridges.
import { Mesh } from './mesh.js';
import { rr, sections } from './slabs.js';

export const ROUTERSHELF_DEFAULTS = {
  width: 200, // the router's width plus a few mm
  depth: 140, // front to back
  fences: true, // low walls either side
  vents: true,
  cableSlot: 40, // the notch at the back for cables (0 for none)
  thick: 6,
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const R = 2.25; // 4 mm screws
const ST = 6, LIP = 10, FENCE = 4, FENCE_H = 22, VENT_U = 14, VENT_W = 5; // shelf, lip, fences, vent slot length and width

export function generateRouterShelf(options = {}) {
  const o = { ...ROUTERSHELF_DEFAULTS, ...options };
  const W = num(o.width, 80, 250, 200), L = num(o.depth, 60, 220, 140), t = num(o.thick, 4, 10, 6);
  const fences = !(o.fences === false || o.fences === 'false'), vents = !(o.vents === false || o.vents === 'false');
  const cs = Math.min(num(o.cableSlot, 0, 120, 40), W - 2 * FENCE - 20);
  const brace = Math.min(70, L * 0.5), low = 26; // the brace stops above the lower screws
  const vTop = low + brace + ST, H = vTop + 32;
  const screws = [12, H - 12];
  const cols = [W * 0.2, W * 0.8];
  const x0 = t, x1 = t + L; // the shelf runs from the plate's face to its front
  // Vent slots: short rows across the shelf, clear of the fences, the notch and the lip.
  const ventRows = [];
  if (vents) for (let u = t + 22; u + VENT_U <= x1 - ST - 8; u += VENT_U + 8) ventRows.push(u);
  const ventCols = [];
  if (vents) for (let w = FENCE + 10; w + VENT_W <= W - FENCE - 10; w += VENT_W + 7) ventCols.push(w);
  const RIB = 6, ribs = [[0, RIB], [W / 2 - RIB / 2, W / 2 + RIB / 2], [W - RIB, W]]; // the brace is three ribs, not a solid wedge
  const cuts = [0, 0.4, W - 0.4, W, FENCE, W - FENCE, ...ribs.flat(), ...cols.flatMap((c) => [c - R, c + R]), ...ventCols.flatMap((w) => [w, w + VENT_W])];
  if (cs > 0) cuts.push(W / 2 - cs / 2, W / 2 + cs / 2);
  const mesh = sections([-1, -1, x1 + 2, H + 2], cuts, (w, d) => {
    const f = w < 0.4 || w > W - 0.4 ? 0.4 : 0; // the bed face steps in: no elephant's foot
    const side = fences && (w < FENCE || w > W - FENCE);
    d.on(rr(0, f, t, H - f, 3)); // the wall plate
    d.on(rr(0, vTop - ST, x1, vTop, 2)); // the shelf
    d.on(rr(x1 - ST, vTop - 1, x1, vTop + LIP, ST / 2)); // the lip
    if (side) d.on(rr(t - 0.1, vTop - 1, x1, vTop + FENCE_H, 4)); // a fence
    if (ribs.some(([a, b]) => w > a && w < b)) d.on([[t - 0.1, low], [t + brace, vTop - ST + 0.1], [t - 0.1, vTop - ST + 0.1]]); // a brace rib
    if (ventCols.some((c) => w > c && w < c + VENT_W)) for (const u of ventRows) d.off(rr(u, vTop - ST - 1, u + VENT_U, vTop + 1, 0));
    if (cs > 0 && Math.abs(w - W / 2) < cs / 2) d.off(rr(t, vTop - ST - 1, t + 16, vTop + 1, 0)); // the cable notch
    if (cols.some((c) => Math.abs(w - c) < R)) for (const v of screws) d.off(rr(-1, v - R, t + 1, v + R));
  }, 0.15, 0.1);
  // On the wall: (u, v, w) → (W − w − W/2, −u, v), a rotation; the wall is y = 0.
  const preview = new Mesh(); preview.append(mesh);
  const q = preview.positions;
  for (let i = 0; i < q.length; i += 3) { const u = q[i], v = q[i + 1], w = q[i + 2]; q[i] = W - w - W / 2; q[i + 1] = -u; q[i + 2] = v; }
  const inside = fences ? W - 2 * FENCE : W;
  const notes = [
    `A shelf ${Math.round(inside)} mm wide inside and ${L} mm deep${fences ? ', with fences either side' : ''}${vents ? ', vented' : ''}${cs > 0 ? `, a ${Math.round(cs)} mm cable notch at the back` : ''}. Screws: 4 × 4 mm (wall plugs on plasterboard).`,
    'Print it on its side (as it comes), no supports. Leave a hand’s width above the router so it stays cool.',
  ];
  return { parts: [{ mesh, name: 'router-shelf' }], notes, preview };
}
