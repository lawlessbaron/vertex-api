// Wrap and foil dispensers: two end cradles for the inside of a cupboard door
// that hold boxes of cling wrap, foil and baking paper (or bare rolls) one
// above another. The boxes are longer than a bed, so the rack is two pieces,
// one at each end: a plate on the door, and for each box a floor, a lip in
// front and an end wall that stops it sliding out sideways. Each piece is a
// side profile drawn as slabs across its width and printed on its side with
// the end wall on the bed; the left-hand piece is the right one's mirror,
// drawn upside down in profile so its end wall is on the bed too.
import { Mesh } from './mesh.js';
import { rr, sections } from './slabs.js';

export const WRAPRACK_DEFAULTS = {
  boxes: 3,
  boxD: 50, // a box's depth (or a roll's diameter), front to back
  boxH: 50, // its height
  boxL: 300, // its length: how far apart the two pieces go
  reach: 30, // how far each piece reaches along a box
  lip: 18, // the lip in front, above the floor
  thick: 4,
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const END = 2.4, R = 2.25, PLAY = 3, FIL = 12; // FIL: the fillet under each floor

export function wrapRackPlan(options = {}) {
  const o = { ...WRAPRACK_DEFAULTS, ...options };
  const n = Math.round(num(o.boxes, 1, 5, 3)), D = num(o.boxD, 20, 90, 50) + PLAY, Hb = num(o.boxH, 20, 90, 50);
  const boxL = num(o.boxL, 150, 500, 300), reach = num(o.reach, 15, 60, 30), lip = num(o.lip, 8, 40, 18), t = num(o.thick, 3, 8, 4);
  const pitch = t + Hb + 12; // a floor, the box, and room to lift it out over the lip
  const H = FIL + 1 + (n - 1) * pitch + t + Math.max(lip, 10) + 3; // the plate: from under the lowest fillet to over the top lip
  return { n, D, Hb, boxL, reach, lip, t, pitch, H };
}

function piece(p, mirror) {
  const { n, D, reach, lip, t, pitch, H } = p;
  const V = (v) => (mirror ? H - v : v); // the right-hand piece: the profile upside down
  const box = (u0, v0, u1, v1, r) => rr(u0, Math.min(V(v0), V(v1)), u1, Math.max(V(v0), V(v1)), r);
  const tri = (pts) => { const q = pts.map(([u, v]) => [u, V(v)]); return mirror ? q.reverse() : q; };
  const holes = [H - 6, n > 1 ? FIL + 1 + pitch - 8 : 6];
  const cuts = [0, END, reach, reach / 2 - R, reach / 2 + R];
  return sections([-1, -1, t + D + t + 1, H + 1], cuts, (w, d) => {
    d.on(box(0, 0, t, H, 2)); // the plate on the door
    for (let i = 0; i < n; i++) {
      const v = FIL + 1 + i * pitch;
      d.on(box(0, v, t + D + t, v + t, 1.5)); // the floor
      d.on(box(t + D, v, t + D + t, v + t + lip, 1.5)); // the lip
      d.on(tri([[t - 0.1, v + 0.1], [t + 12, v + 0.1], [t - 0.1, v - 12]])); // a fillet under the floor
      if (w < END) d.on(box(t - 0.1, v, t + D + 0.1, v + t + lip, 1)); // the end wall
    }
    if (Math.abs(w - reach / 2) < R) for (const v of holes) d.off(box(-1, v - R, t + 1, v + R)); // square screw holes
  }, 0.12, 0.08);
}

export function generateWrapRack(options = {}) {
  const p = wrapRackPlan(options), { n, D, boxL, reach, t, H } = p;
  if (H > 250) throw new Error(`${n} boxes make pieces ${Math.ceil(H)} mm tall: more than a 250 mm bed. Fewer boxes.`);
  // Turned to stand on the door, the piece as drawn has its end wall on the right; its mirror is the left one.
  const right = piece(p, false), left = piece(p, true);
  // On the door (y = 0, the boxes toward −y, x along them), each by a rotation:
  // right (u, v, w) → (L/2 + END − w, −u, v); left, drawn upside down, (u, v, w) → (w − L/2 − END, −u, H − v).
  const preview = new Mesh();
  const L = boxL;
  for (const [m, side] of [[left, -1], [right, 1]]) {
    const c = new Mesh(); c.append(m); const q = c.positions;
    for (let i = 0; i < q.length; i += 3) {
      const u = q[i], v = q[i + 1], w = q[i + 2];
      if (side > 0) { q[i] = L / 2 + END - w; q[i + 1] = -u; q[i + 2] = v; } else { q[i] = w - L / 2 - END; q[i + 1] = -u; q[i + 2] = H - v; }
    }
    preview.append(c);
  }
  const notes = [
    `${n} box${n > 1 ? 'es' : ''} up to ${Math.round(D - 3)} × ${p.Hb} mm, ${boxL} mm long. Two pieces, ${Math.round(t + D + t)} × ${Math.round(H)} mm, each reaching ${reach} mm along the boxes.`,
    `Screw the two pieces to the door ${boxL + 2 * END} mm apart (outside to outside), level, end walls outward. Each box drops in from above and pulls out over its lip.`,
    'Print both on their sides (as they come), no supports: they are mirror images, not two of the same.',
  ];
  return { parts: [{ mesh: left, name: 'wrap-rack-left' }, { mesh: right, name: 'wrap-rack-right' }], notes, preview };
}
