// Wall tablet holders: four small corner pieces, so any tablet fits and every
// piece fits any bed. Two cradles take the bottom corners (a ledge, a lip in
// front and a stop at the side) and two clips hook over the top corners. The
// gap between the cradles leaves room for the charging cable. Each piece is a
// side profile drawn as slabs across its width and prints on its side, with
// no supports.
import { Mesh } from './mesh.js';
import { extrudePolygon } from './polygon.js';
import { rr, sections } from './slabs.js';

export const TABLETHOLDER_DEFAULTS = {
  tabletW: 250, // the tablet in its case, across
  tabletH: 178, // and up
  tabletT: 9, // its thickness, case and all
  piece: 40, // how far each corner piece reaches along the edge
  lip: 10, // how far the front lip comes up over the screen's edge
  thick: 5,
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const R = 2.25, LEDGE = 5, FENCE = 3, P = 48; // 4 mm screws; ledge and fence thickness; the plate's height

// One corner piece in profile: u out from the wall, v up, w along the tablet's edge.
// top: a clip over the top corner (else a cradle under the bottom one); fenceAt: which end of w the side stop is.
function corner(o, top, fenceAt) {
  const { t, T, L, lip } = o;
  const front = t + T + 0.6; // 0.6 mm play
  const holes = top ? [12, 30] : [P - 30, P - 12];
  const cuts = [0, 0.4, L - 0.4, L, fenceAt === 'start' ? FENCE : L - FENCE, L / 2 - R, L / 2 + R];
  return sections([-1, -1, front + FENCE + 1, P + 1], cuts, (w, d) => {
    const f = w < 0.4 || w > L - 0.4 ? 0.4 : 0; // the bed face steps in
    const fence = fenceAt === 'start' ? w < FENCE : w > L - FENCE;
    d.on(rr(0, f, t, P - f, 2)); // the plate on the wall
    if (top) {
      d.on(rr(0, P - LEDGE, front + FENCE, P, 1.5)); // over the tablet's top edge
      d.on(rr(front, P - LEDGE - lip, front + FENCE, P, 1.5)); // and down in front of it
      if (fence) d.on(rr(0, P - LEDGE - 26, front + FENCE, P, 1.5));
    } else {
      d.on(rr(0, 0, front + FENCE, LEDGE, 1.5)); // the ledge it stands on
      d.on(rr(front, 0, front + FENCE, LEDGE + lip, 1.5)); // the lip in front
      if (fence) d.on(rr(0, 0, front + FENCE, LEDGE + 26, 1.5));
    }
    if (Math.abs(w - L / 2) < R) for (const v of holes) d.off(rr(-1, v - R, t + 1, v + R)); // screw holes, square: no overhang on their side
  }, 0.12, 0.08);
}

export function generateTabletHolder(options = {}) {
  const x = { ...TABLETHOLDER_DEFAULTS, ...options };
  const W = num(x.tabletW, 100, 400, 250), H = num(x.tabletH, 80, 300, 178), T = num(x.tabletT, 4, 20, 9);
  const L = num(x.piece, 25, 80, 40), lip = num(x.lip, 4, 20, 10), t = num(x.thick, 3, 8, 5);
  const o = { t, T, L, lip };
  const pieces = [
    ['cradle-left', corner(o, false, 'end'), -W / 2, 0],
    ['cradle-right', corner(o, false, 'start'), W / 2, 0],
    ['clip-left', corner(o, true, 'end'), -W / 2, 1],
    ['clip-right', corner(o, true, 'start'), W / 2, 1],
  ];
  // Where each goes on the wall: the tablet's bottom on the cradles' ledges, its top under the clips.
  const gap = LEDGE + H + 0.6 - (P - LEDGE); // a clip's bottom over a cradle's: the hook's underside just over the tablet's top
  const preview = new Mesh();
  for (const [name, m, side, top] of pieces) {
    const c = new Mesh(); c.append(m); const q = c.positions;
    // (u, v, w) → (x, −u, v): a rotation with x = −w, shifted so the stop sits at the tablet's side.
    const x0 = side < 0 ? side - FENCE + L : side + FENCE;
    for (let i = 0; i < q.length; i += 3) { const u = q[i], v = q[i + 1], w = q[i + 2]; q[i] = x0 - w; q[i + 1] = -u; q[i + 2] = v + (top ? gap : 0); }
    preview.append(c);
  }
  // The tablet itself, for the preview only: standing on the ledges, against the plates.
  const tablet = extrudePolygon([[-W / 2, -(t + 0.3 + T)], [W / 2, -(t + 0.3 + T)], [W / 2, -(t + 0.3)], [-W / 2, -(t + 0.3)]], [], LEDGE, LEDGE + H);
  const notes = [
    `For a tablet ${W} × ${H} × ${T} mm. Four pieces: two cradles for the bottom corners, two clips for the top, 8 screws (4 mm).`,
    `Screw the cradles up first, ${Math.round(W + 2 * FENCE - L)} mm apart (centre to centre of their holes), level. Stand the tablet on them, then slide the clips down over its top corners and screw them: their bottoms ${Math.round(gap)} mm above the cradles' bottoms.`,
    'Print each on its side (as it comes), no supports. The gap between the cradles is for the charging cable.',
  ];
  return { parts: pieces.map(([name, mesh]) => ({ mesh, name })), notes, preview, tablet };
}
