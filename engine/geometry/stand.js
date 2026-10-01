// Phone and tablet stands. The stand's side profile (a base, a back plate at
// the angle asked for, a rear leg, and a seat with a lip in front) is
// extruded across its width, and it prints lying on its side, so every edge
// goes straight up and nothing needs support. With a cable slot the seat is left
// out in the middle: the plug drops through and the cable runs out the front.
// The device sits on the seat high enough for the plug to clear the desk.
import { Mesh } from './mesh.js';
import { extrudePolygon } from './polygon.js';

export const STAND_DEFAULTS = {
  width: 80, // across, mm
  angle: 65, // the back from the desk, degrees
  thickness: 12, // the device in its case, mm
  height: 90, // the back's height, mm
  lip: 10,
  cable: true,
  slot: 16, // the cable slot's width
  wall: 4,
};

function alongX(outer, holes, x0, x1) {
  const m = extrudePolygon(outer, holes, x0, x1);
  const p = m.positions;
  for (let i = 0; i < p.length; i += 3) { const u = p[i], v = p[i + 1], w = p[i + 2]; p[i] = w; p[i + 1] = u; p[i + 2] = v; }
  return m;
}

// Where two lines (point + direction) cross.
function cross([px, py], [dx, dy], [qx, qy], [ex, ey]) {
  const det = dx * ey - dy * ex;
  if (Math.abs(det) < 1e-9) return null;
  const t = ((qx - px) * ey - (qy - py) * ex) / det;
  return [px + t * dx, py + t * dy];
}

/** The side profile: { frame, hole, seat, ... } in (y, z), y forward-negative. */
export function standProfile(options = {}) {
  const o = { ...STAND_DEFAULTS, ...options };
  const a = (Math.max(45, Math.min(85, o.angle)) * Math.PI) / 180, w = Math.max(2.4, o.wall);
  const H = Math.max(40, o.height), th = Math.max(4, o.thickness);
  const seatZ = o.cable ? Math.max(3 * w, 22) : Math.max(3 * w, 10); // a plug needs about 20 mm below the device
  const dir = [Math.cos(a), Math.sin(a)], n = [Math.sin(a), -Math.cos(a)];
  const faceAt = (z) => (z - w) / Math.tan(a); // the back plate's front face, y at height z
  const L = (H - w) / Math.sin(a);
  const T = [dir[0] * L, w + dir[1] * L], Tb = [T[0] + w * n[0], T[1] + w * n[1]];
  const yB = Tb[0] + 0.25 * H; // the leg spreads back for a steady stand
  const lipInner = faceAt(seatZ) - (th / Math.sin(a) + 1), lipOuter = lipInner - w;
  const frame = [[lipOuter, 0], [yB, 0], Tb, T, [0, w], [lipOuter, w]];
  // The open triangle between the base, the back plate and the leg.
  const back0 = [w * n[0], w + w * n[1]];
  const e = [Tb[0] - yB, Tb[1]], el = Math.hypot(...e), eu = [e[0] / el, e[1] / el], m = [-eu[1], eu[0]];
  const leg0 = [yB + w * m[0], w * m[1]];
  const H1 = cross(back0, dir, [0, w], [1, 0]), H2 = cross(leg0, eu, [0, w], [1, 0]), H3 = cross(back0, dir, leg0, eu);
  const hole = H1 && H2 && H3 && H2[0] - H1[0] > 2 * w && H3[1] > w + 2 * w ? [[H1[0], w + 0.01], H3, [H2[0], w + 0.01]] : null;
  const bot = faceAt(seatZ - w), top = faceAt(seatZ);
  const seat = [[lipOuter, w - 0.01], [lipOuter + w, w - 0.01], [lipOuter + w, seatZ - w], [bot + w, seatZ - w], [top + w, seatZ], [lipInner, seatZ], [lipInner, seatZ + Math.max(3, o.lip)], [lipOuter, seatZ + Math.max(3, o.lip)]];
  return { o, frame, hole, seat, seatZ, depth: yB - lipOuter, T };
}

export function generateStand(options = {}) {
  const pr = standProfile(options), { o } = pr;
  const W = Math.max(30, o.width), mesh = new Mesh();
  mesh.append(alongX(pr.frame, pr.hole ? [pr.hole] : [], -W / 2, W / 2));
  const slot = o.cable ? Math.min(W - 20, Math.max(8, o.slot)) : 0;
  const spans = slot ? [[-W / 2, -slot / 2], [slot / 2, W / 2]] : [[-W / 2, W / 2]];
  for (const [x0, x1] of spans) mesh.append(alongX(pr.seat, [], x0, x1));
  // On its side to print: x (across) becomes up. (x, y, z) → (z, y, −x) is a rotation.
  const p = mesh.positions;
  for (let i = 0; i < p.length; i += 3) { const x = p[i], z = p[i + 2]; p[i] = z; p[i + 2] = -x; }
  const b = mesh.bounds();
  mesh.translate(-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2, -b.min[2]);
  const notes = [`Prints on its side, ${Math.round(W)} mm tall. Fits a device up to ${o.thickness} mm thick in its case, leaning back at ${o.angle}°.`];
  if (slot) notes.push(`The charging plug drops through a ${Math.round(slot)} mm slot in the seat; the cable runs out the front.`);
  return { parts: [{ mesh, name: `stand-${Math.round(W)}mm-${o.angle}deg` }], notes, plan: pr };
}
