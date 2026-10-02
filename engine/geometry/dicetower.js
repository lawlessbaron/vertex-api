// Dice towers: dice dropped in the top tumble down three baffles and roll out
// of the front onto a little tray. A tower full of slanted baffles can't
// print upright without supports, so it comes in two halves split down the
// middle: each lies on its outer wall, so the walls, baffles and tray are its
// side profile drawn as slabs and rising straight up from the bed. Glue the
// halves face to face. The second half is the first one's mirror, drawn with
// its profile turned front to back so it lies on its outer wall too.
import { Mesh } from './mesh.js';
import { rr, sections } from './slabs.js';

export const DICETOWER_DEFAULTS = {
  height: 150,
  width: 60, // across, both halves together
  depth: 60, // front to back
  tray: 50, // the tray in front, how far it reaches
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const WALL = 3, BAFFLE = 2.6, EXIT = 30, LIP = 8;

// The profile: y front (0) to back, z up. A bar from (y0, z0) to (y1, z1), t thick.
const bar = (y0, z0, y1, z1, t) => {
  const dy = y1 - y0, dz = z1 - z0, l = Math.hypot(dy, dz), ny = (-dz / l) * t / 2, nz = (dy / l) * t / 2;
  return [[y0 - ny, z0 - nz], [y1 - ny, z1 - nz], [y1 + ny, z1 + nz], [y0 + ny, z0 + nz]];
};

function half(p, mirror) {
  const { H, W, D, T } = p;
  const Y = (y) => (mirror ? D - y : y); // the mirror half: front to back
  const box = (y0, z0, y1, z1, r) => rr(Math.min(Y(y0), Y(y1)), z0, Math.max(Y(y0), Y(y1)), z1, r);
  const poly = (pts) => { const q = pts.map(([y, z]) => [Y(y), z]); return mirror ? q.reverse() : q; };
  // Three baffles, alternating sides, each falling about 35° across most of the shaft.
  const inner = D - 2 * WALL, span = inner * 0.72, drop = span * Math.tan((35 * Math.PI) / 180);
  const zs = [H - 25, H - 25 - drop - 18, H - 25 - 2 * (drop + 18)];
  const baffles = zs.map((z, i) => (i % 2 === 0 ? bar(D - WALL, z, D - WALL - span, z - drop, BAFFLE) : bar(WALL, z, WALL + span, z - drop, BAFFLE)));
  const ramp = bar(D - WALL, EXIT + 12, WALL - 2, 4, BAFFLE); // the last ramp sends dice out of the front
  // Drawn turned front to back, the tray reaches behind instead: the drawing area follows it.
  return sections([mirror ? -1 : -T - 1, -1, mirror ? D + T + 1 : D + 1, H + 1], [0, WALL, W / 2], (x, d) => {
    if (x < WALL) { // the outer wall: the whole side, the tray's side included
      d.on(box(-T, 0, D, H, 3));
      return;
    }
    d.on(box(D - WALL, 0, D, H, 1)); // back wall
    d.on(box(0, EXIT, WALL, H, 1)); // front wall, open at the bottom for the dice to come out
    d.on(box(-T, 0, D, WALL, 1)); // floor, running on as the tray
    d.on(box(-T, 0, -T + WALL, LIP, 1)); // the tray's lip
    for (const b of baffles) d.on(poly(b));
    d.on(poly(ramp));
  }, 0.12, 0.06);
}

export function generateDiceTower(options = {}) {
  const o = { ...DICETOWER_DEFAULTS, ...options };
  const H = num(o.height, 100, 240, 150), W = num(o.width, 40, 100, 60), D = num(o.depth, 40, 100, 60), T = num(o.tray, 0, 100, 50);
  const p = { H, W, D, T };
  const a = half(p, false), b = half(p, true);
  // Standing up, the halves face to face. A half's mesh is (u, v, w) = (front to back, up, across), the way it prints.
  // Left: (u, v, w) → (w − W/2, u, v); right, drawn front to back: (u, v, w) → (W/2 − w, D − u, v). Both are rotations.
  const preview = new Mesh();
  for (const [m, right] of [[a, false], [b, true]]) {
    const c = new Mesh(); c.append(m); const q = c.positions;
    for (let i = 0; i < q.length; i += 3) {
      const u = q[i], v = q[i + 1], w = q[i + 2];
      if (right) { q[i] = W / 2 - w; q[i + 1] = D - u; } else { q[i] = w - W / 2; q[i + 1] = u; }
      q[i + 2] = v;
    }
    preview.append(c);
  }
  const notes = [
    `A tower ${H} mm tall, ${W} × ${D} mm, with three baffles and a tray reaching ${T} mm in front.`,
    'Two halves, mirror images: glue them face to face (superglue or a solvent for your plastic), the tray to the front.',
    'Print both lying on their outer walls (as they come), no supports.',
  ];
  return { parts: [{ mesh: a, name: 'dice-tower-left' }, { mesh: b, name: 'dice-tower-right' }], notes, preview };
}
