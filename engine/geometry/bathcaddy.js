// Bathroom shelf caddies: a basket for bottles and soap that sits on a shelf
// or the vanity, or hangs over a shower screen on two hooks. The floor is
// slotted so water drains away, dividers split it for bottles, and two
// columns at the back each have a pocket, open at the top, that a hook's
// long leg drops into. The basket prints upright: walls, columns and pockets
// go straight up. Each hook is an upside-down U over the glass, a side profile
// printed flat on its side: nothing overhangs in either.
import { Mesh } from './mesh.js';
import { rr, sections } from './slabs.js';

export const BATHCADDY_DEFAULTS = {
  width: 220,
  depth: 90,
  height: 70,
  sections: 2, // compartments across
  hooks: true, // hang it over a shower screen
  glass: 8, // the screen's thickness
  drop: 40, // how far the basket's rim sits below the top of the screen
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const WALL = 2.4, FLOOR = 2.4, DIV = 2, COL_W = 20, COL_D = 9, POCKET_W = 12.6, POCKET_D = 4.6, POCKET_H = 30, LEG = 4, HOOK_W = 12;

function hook(glass, drop) {
  // In the profile: u across the glass (0 at the basket side of the inner leg), v up from the leg's foot.
  const top = POCKET_H + drop, g = glass + 0.6;
  return sections([-1, -1, 2 * LEG + g + 1, top + LEG + 1], [0, HOOK_W], (w, d) => {
    d.on(rr(0, 0, LEG, top + LEG, 1)); // the leg into the pocket, up past the rim and the drop
    d.on(rr(0, top, 2 * LEG + g, top + LEG, 1)); // over the glass
    d.on(rr(LEG + g, top - 25, 2 * LEG + g, top + LEG, 1)); // down the far side
  }, 0.08, 0.05);
}

export function generateBathCaddy(options = {}) {
  const o = { ...BATHCADDY_DEFAULTS, ...options };
  const W = num(o.width, 80, 240, 220), D = num(o.depth, 50, 160, 90), H = num(o.height, 30, 160, 70);
  const n = Math.round(num(o.sections, 1, 5, 2)), hooks = !(o.hooks === false || o.hooks === 'false'), glass = num(o.glass, 4, 14, 8), drop = num(o.drop, 10, 120, 40);
  const cw = (W - 2 * WALL - (n - 1) * DIV) / n;
  if (cw < 30) throw new Error('Compartments that narrow won\'t take a bottle: fewer sections.');
  if (H < POCKET_H + 5 && hooks) throw new Error(`A basket for hooks needs to be at least ${POCKET_H + 5} mm tall.`);
  const cols = hooks ? [-W / 3, W / 3] : [];
  // Drainage: slots across the floor of every compartment.
  const slots = [];
  for (let i = 0; i < n; i++) {
    const x0 = -W / 2 + WALL + i * (cw + DIV) + 6, x1 = x0 + cw - 12;
    for (let y = -D / 2 + WALL + 8; y + 4 <= D / 2 - WALL - 8; y += 9) slots.push([x0, y, x1, y + 4]);
  }
  const yb = D / 2; // the back wall's outside
  const cuts = [0, 0.4, FLOOR, H, H - POCKET_H];
  const basket = sections([-W / 2 - 1, -D / 2 - 1, W / 2 + 1, yb + COL_D + 1], cuts, (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    d.on(rr(-W / 2 + f, -D / 2 + f, W / 2 - f, D / 2 - f, 6));
    for (const x of cols) d.on(rr(x - COL_W / 2 + f, D / 2 - 2, x + COL_W / 2 - f, yb + COL_D - f, 3)); // the columns
    if (z < FLOOR) { for (const s of slots) d.off(rr(s[0], s[1], s[2], s[3], 2)); return; }
    // The compartments, between dividers.
    for (let i = 0; i < n; i++) { const x0 = -W / 2 + WALL + i * (cw + DIV); d.off(rr(x0, -D / 2 + WALL, x0 + cw, D / 2 - WALL, 4)); }
    if (z > H - POCKET_H) for (const x of cols) d.off(rr(x - POCKET_W / 2, yb + (COL_D - POCKET_D) / 2, x + POCKET_W / 2, yb + (COL_D + POCKET_D) / 2, 0.5)); // the pockets
  }, 0.2, 0.1);
  const parts = [{ mesh: basket, name: 'bath-caddy' }];
  const preview = new Mesh(); preview.append(basket);
  if (hooks) {
    const hk = hook(glass, drop);
    parts.push({ mesh: hk, name: 'screen-hook-left' }, { mesh: hk, name: 'screen-hook-right' });
    // In place: the leg down the pocket. (u, v, w) → (x0 + w, y0 + u, z0 + v), a rotation (w, u, v taken round in turn).
    for (const x of cols) {
      const c = new Mesh(); c.append(hk); const q = c.positions;
      const x0 = x - HOOK_W / 2, y0 = yb + (COL_D - LEG) / 2, z0 = H - POCKET_H;
      for (let i = 0; i < q.length; i += 3) { const u = q[i], v = q[i + 1], w = q[i + 2]; q[i] = x0 + w; q[i + 1] = y0 + u; q[i + 2] = z0 + v; }
      preview.append(c);
    }
  }
  const notes = [
    `${n} compartment${n > 1 ? 's' : ''}, ${Math.round(cw)} × ${Math.round(D - 2 * WALL)} mm, in a basket ${W} × ${D} × ${H} mm with a slotted floor that drains.`,
    hooks ? `Two hooks for a screen ${glass} mm thick: drop each one's long leg into a pocket at the back. The basket's rim hangs ${drop} mm below the top of the glass.` : 'It sits on a shelf or the vanity.',
    'Print the basket upright and the hooks flat on their sides (as they come), no supports. PETG or ASA stands up to a hot shower better than PLA.',
  ];
  return { parts, notes, preview };
}
