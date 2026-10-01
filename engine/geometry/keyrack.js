// Key racks. A wall plate printed face up, with pegs standing out of it (each
// ends in a 45° flared cap so a key ring can't slide off), an optional trough
// for post across the top, a name raised as its own part, and countersunk screw
// holes or none (for mounting tape). Every overhang is 45° or steeper, so
// nothing needs support.
// Frame: the plate's back on the bed (z = 0), the wall's up is +y.
import { Mesh } from './mesh.js';
import { circlePolygon, extrudePolygon, signedArea } from './polygon.js';
import { textMesh, textUnits } from './font.js';
import { cleanName } from './keychain.js';

export const KEYRACK_DEFAULTS = {
  width: 160,
  hooks: 4,
  hookLength: 25,
  shelf: true, // a trough for post along the top
  shelfDepth: 25,
  text: 'KEYS',
  mount: 'screws', // screws | tape
  thickness: 5,
};

const ccw = (pts) => (signedArea(pts) < 0 ? pts.reverse() : pts);

function roundedRect(x0, y0, x1, y1, r, n = 8) {
  const pts = [];
  for (const [cx, cy, a0] of [[x1 - r, y0 + r, -90], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, 90], [x0 + r, y0 + r, 180]]) {
    for (let k = 0; k <= n; k++) { const a = ((a0 + (90 * k) / n) * Math.PI) / 180; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  }
  return pts;
}

// An outline in (y, z) extruded along x (a rotation, so the winding holds).
function alongX(outer, x0, x1) {
  const m = extrudePolygon(ccw(outer), [], x0, x1), p = m.positions;
  for (let i = 0; i < p.length; i += 3) { const u = p[i], v = p[i + 1], w = p[i + 2]; p[i] = w; p[i + 1] = u; p[i + 2] = v; }
  return m;
}

export function keyrackPlan(options = {}) {
  const o = { ...KEYRACK_DEFAULTS, ...options };
  const n = Math.max(1, Math.min(12, Math.round(o.hooks))), T = Math.max(3, o.thickness);
  const text = cleanName(o.text || '');
  const W = Math.max(60, o.width, n * 22 + 16);
  const pegY = 14, textH = text ? 12 : 0;
  const textY = pegY + 12, shelfY = textY + (text ? textH + 8 : 4);
  const D = Math.max(12, o.shelfDepth), L = Math.min(18, D - 6); // the trough's depth out from the plate, and its lip
  const top = o.shelf ? shelfY + L + 14 : textY + textH + 14;
  const H = Math.max(top + (o.mount === 'screws' ? 4 : 0), 50);
  const pegs = Array.from({ length: n }, (_, i) => -W / 2 + (W * (i + 0.5)) / n);
  const holes = o.mount === 'tape' ? [] : [[-W / 2 + 12, H - 9], [W / 2 - 12, H - 9]];
  return { o, n, T, W, H, text, textH, textY, pegY, pegs, shelfY, D, L, holes };
}

export function generateKeyrack(options = {}) {
  const p = keyrackPlan(options);
  const { o, T, W, H, D, L } = p;
  const plate = roundedRect(-W / 2, 0, W / 2, H, 6);
  const mesh = new Mesh();
  // The plate, with each screw hole widening into a countersink in the last 2 mm.
  const hole = (r) => p.holes.map(([x, y]) => circlePolygon(x, y, r, 32).reverse());
  const sink = 2, steps = 5;
  mesh.append(extrudePolygon(plate, hole(2.25), 0, T - sink));
  for (let k = 0; k < steps; k++) {
    const z0 = T - sink + (k * sink) / steps, z1 = T - sink + ((k + 1) * sink) / steps;
    mesh.append(extrudePolygon(plate, hole(2.25 + (k + 1) * (sink / steps)), z0 - 0.01, z1));
  }
  // Pegs: a post, then a cap flaring out at 45° in steps, then a flat top.
  const pr = 3.5, Lh = Math.max(12, o.hookLength);
  for (const x of p.pegs) {
    mesh.append(extrudePolygon(circlePolygon(x, p.pegY, pr, 32), [], T - 0.01, T + Lh));
    for (let k = 0; k < 5; k++) mesh.append(extrudePolygon(circlePolygon(x, p.pegY, pr + (k + 1) * 0.4, 32), [], T + Lh + k * 0.4 - 0.01, T + Lh + (k + 1) * 0.4));
    mesh.append(extrudePolygon(circlePolygon(x, p.pegY, pr + 2, 32), [], T + Lh + 1.99, T + Lh + 3.2));
  }
  if (o.shelf) {
    // A trough: a floor out from the plate and a lip leaning back at 45°, with ends.
    const yb = p.shelfY, t = 3, d = t * Math.SQRT2, x0 = -W / 2 + 4, x1 = W / 2 - 4;
    mesh.append(alongX([[yb, T - 0.01], [yb, T + D], [yb + L, T + D - L], [yb + L, T + D - L - d], [yb + t, T + D - d - t], [yb + t, T - 0.01]], x0, x1));
    for (const [a, b] of [[x0, x0 + t], [x1 - t, x1]]) mesh.append(alongX([[yb, T - 0.01], [yb, T + D], [yb + L, T + D - L], [yb + L, T - 0.01]], a, b));
  }
  const parts = [{ mesh, name: `key-rack-${p.n}-hooks` }];
  if (p.text) {
    const h = Math.min(p.textH, ((W - 20) * 6) / textUnits(p.text)), w = (textUnits(p.text) * h) / 6;
    parts.push({ mesh: textMesh(p.text, -w / 2, p.textY + (p.textH - h) / 2, h, T - 0.01, T + 0.8), name: 'name' });
  }
  const notes = [`${p.n} pegs ${Math.round(Lh)} mm long, each with a flared cap so key rings stay on.${o.shelf ? ` A ${Math.round(D)} mm deep trough across the top holds post.` : ''}`];
  notes.push(o.mount === 'tape' ? 'No screw holes: stick it up with heavy-duty mounting tape on a smooth wall.' : 'Two countersunk holes for 4 mm screws with wall plugs.');
  return { parts, notes, plan: p };
}
