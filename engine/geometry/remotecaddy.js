// Remote control caddies. A slot for each remote, sized to them, standing
// upright so the buttons face you; a second row stands taller behind the
// first so every remote shows. Rounded outside, a finger scoop cut into the
// front of each slot so a remote lifts out, and a phone slot if you like.
// Drawn in plan as slabs (slabs.js) and printed upright: walls go straight
// up from a solid floor, so nothing overhangs.
import { rr, sections } from './slabs.js';

export const REMOTECADDY_DEFAULTS = {
  remoteW: 50, // across a remote's face
  remoteT: 24, // a remote's thickness (front to back)
  slots: 4, // per row
  rows: 1, // 1, or 2 with the back row taller
  height: 70, // the front row, from the table
  step: 25, // how much taller the back row stands
  phone: false, // a wider slot for a phone at the end of the back (or only) row
  wall: 2.4,
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const FLOOR = 2.4, PHONE_W = 82, PHONE_T = 14;

export function generateRemoteCaddy(options = {}) {
  const o = { ...REMOTECADDY_DEFAULTS, ...options };
  const w = num(o.remoteW, 20, 90, 50) + 3, t = num(o.remoteT, 10, 50, 24) + 3, n = Math.round(num(o.slots, 1, 8, 4));
  const rows = Math.round(num(o.rows, 1, 2, 1)), wall = num(o.wall, 1.6, 4, 2.4), h1 = num(o.height, 30, 200, 70), h2 = h1 + (rows > 1 ? num(o.step, 0, 80, 25) : 0);
  const phone = o.phone === true || o.phone === 'true';
  // Slots across each row: [x0, x1, depth].
  const row = (withPhone) => { const s = []; let x = wall; for (let i = 0; i < n; i++) { s.push([x, x + w, t]); x += w + wall; } if (withPhone) { s.push([x, x + PHONE_W, Math.min(t, PHONE_T + 3)]); x += PHONE_W + wall; } return { s, W: x }; };
  const front = row(phone && rows === 1), back = rows > 1 ? row(phone) : null;
  const W = Math.max(front.W, back ? back.W : 0), D1 = t + 2 * wall, D = rows > 1 ? 2 * t + 3 * wall : D1;
  // A row shorter than the other gets a tray across the rest (batteries, earbuds) instead of solid plastic.
  for (const r of [front, back]) if (r && W - r.W > 12) r.s.push([r.W, W - wall, t]);
  if (W > 250 || D > 250) throw new Error(`That caddy is ${Math.ceil(W)} × ${Math.ceil(D)} mm: bigger than a 250 mm bed. Fewer slots, or two caddies.`);
  const R = Math.min(6, wall * 2.5);
  const cuts = [0, 0.4, FLOOR, h1, h2];
  const scoop = (s, y0, top, d) => { const sw = Math.min(26, (s[1] - s[0]) * 0.6), cx = (s[0] + s[1]) / 2; return { cx, sw, y0, top, d }; };
  const scoops = [];
  // Front row along y = 0 … D1, the back row behind it.
  for (const s of front.s) scoops.push(scoop(s, 0, h1, 0));
  if (back) for (const s of back.s) scoops.push(scoop(s, D1 - wall, h2, 0));
  for (const sc of scoops) cuts.push(sc.top - Math.min(22, (sc.top - FLOOR) * 0.4));
  const mesh = sections([-1, -1, W + 1, D + 1], cuts, (z, d) => {
    const f = z < 0.4 ? 0.4 : 0; // the bed face steps in: no elephant's foot
    if (z < h1) d.on(rr(f, f, W - f, D - f, R));
    else if (back) d.on(rr(0, D1 - wall, W, D, R));
    if (z < FLOOR) return;
    for (const [x0, x1] of front.s) if (z < h1) d.off(rr(x0, wall, x1, wall + t, 1.5));
    if (back) for (const [x0, x1, dd] of back.s) d.off(rr(x0, D1, x1, D1 + dd, 1.5));
    // A scoop down the middle of each slot's front wall, so a remote lifts out.
    for (const sc of scoops) if (z > sc.top - Math.min(22, (sc.top - FLOOR) * 0.4) && z < sc.top) d.off(rr(sc.cx - sc.sw / 2, sc.y0 - 1, sc.cx + sc.sw / 2, sc.y0 + wall + 1, 0));
  }, 0.2, 0.1);
  const all = n * rows;
  const notes = [
    `${all} slot${all > 1 ? 's' : ''} for remotes up to ${w - 3} × ${t - 3} mm${phone ? ', and one for a phone' : ''}, ${Math.round(W)} × ${Math.round(D)} mm, ${h1} mm high${back ? ` (the back row ${h2} mm)` : ''}.`,
    'Print it upright (as it comes), no supports. A felt pad or two under it stops it sliding on the table.',
  ];
  return { parts: [{ mesh, name: 'remote-caddy' }], notes, preview: mesh };
}
