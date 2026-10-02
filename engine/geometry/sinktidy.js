// Sink tidies: a caddy for a sponge and a washing-up brush, and a drip tray
// it stands in. The caddy has no solid floor: it stands on a grate of ribs,
// so water runs straight through to the tray instead of pooling under the
// sponge. The sponge side's front is lower, to lift it out; the brush stands
// in a round cup beside it. Both print upright: the ribs sit on the bed and
// the walls rise straight up, so nothing overhangs.
import { Mesh } from './mesh.js';
import { rr, sections } from './slabs.js';

export const SINKTIDY_DEFAULTS = {
  width: 100, // the sponge side, across
  depth: 70, // front to back
  height: 45,
  brush: true, // a cup for a brush
  brushDia: 45, // the cup, inside
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const WALL = 2, RIB = 2.4, RIB_W = 2, RIB_GAP = 3.5, TRAY_H = 8, TRAY_FLOOR = 1.6, PLAY = 1;

export function generateSinkTidy(options = {}) {
  const o = { ...SINKTIDY_DEFAULTS, ...options };
  const Ws = num(o.width, 60, 160, 100), D = num(o.depth, 40, 110, 70), H = num(o.height, 25, 90, 45);
  const brush = o.brush !== false && o.brush !== 'false', rb = num(o.brushDia, 25, 70, 45) / 2;
  const Rb = rb + WALL, cx = Ws + Rb - WALL, cy = D / 2; // the cup shares the sponge side's right wall
  if (brush && 2 * Rb > D + 0.01) throw new Error(`A brush cup ${2 * rb} mm across needs the caddy at least ${Math.ceil(2 * Rb)} mm deep.`);
  const Wc = brush ? cx + Rb : Ws, front = Math.max(15, H * 0.5);
  if (Wc + 2 * (WALL + PLAY) > 250) throw new Error(`That caddy and its tray are ${Math.ceil(Wc + 2 * (WALL + PLAY))} mm wide: more than a 250 mm bed.`);
  const cuts = [0, 0.4, RIB, front, H];
  const caddy = sections([-1, -1, Wc + 1, D + 1], cuts, (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    d.on(rr(f, f, Ws - f, D - f, 4));
    if (brush) d.disc(cx, cy, Rb - f);
    d.off(rr(WALL, WALL, Ws - WALL, D - WALL, 2));
    if (brush) d.disc(cx, cy, rb, 0);
    if (z < RIB) {
      // The grate: ribs front to back across each compartment, water running between them.
      for (let x = WALL + RIB_GAP; x + RIB_W < Ws - WALL; x += RIB_W + RIB_GAP) d.on(rr(x, WALL - 0.01, x + RIB_W, D - WALL + 0.01, 0));
      if (brush) for (let x = cx - rb + RIB_GAP; x + RIB_W < cx + rb; x += RIB_W + RIB_GAP) {
        const a = Math.min(Math.abs(x - cx), Math.abs(x + RIB_W - cx)), h = Math.sqrt(Math.max(0, rb * rb - a * a)) + 0.3;
        if (h > 1) d.on(rr(x, cy - h, x + RIB_W, cy + h, 0));
      }
      d.on(rr(WALL - 0.01, D / 2 - RIB_W / 2, Ws - WALL + 0.01, D / 2 + RIB_W / 2, 0)); // one across, to tie the sponge side's ribs
      if (brush) d.on(rr(cx - rb - 0.3, cy - RIB_W / 2, cx + rb + 0.3, cy + RIB_W / 2, 0));
    }
    if (z > front) d.off(rr(WALL + 6, -1, Ws - WALL - 6, WALL + 0.01, 0)); // the sponge side's front, cut down
  }, 0.1, 0.05);
  // The tray: the caddy's footprint, a millimetre all round, with a low wall.
  const tx = Wc + 2 * (WALL + PLAY), ty = D + 2 * (WALL + PLAY);
  const tray = sections([-1, -1, tx + 1, ty + 1], [0, 0.4, TRAY_FLOOR, TRAY_H], (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    d.on(rr(f, f, tx - f, ty - f, 5));
    if (z >= TRAY_FLOOR) d.off(rr(WALL, WALL, tx - WALL, ty - WALL, 3));
  }, 0.1, 0.05);
  const preview = new Mesh(); preview.append(tray);
  const c = new Mesh(); c.append(caddy);
  for (let i = 0, q = c.positions; i < q.length; i += 3) { q[i] += WALL + PLAY; q[i + 1] += WALL + PLAY; q[i + 2] += TRAY_FLOOR; }
  preview.append(c);
  const notes = [
    `A caddy ${Math.round(Wc)} × ${D} × ${H} mm with a sponge side ${Ws} mm across${brush ? ` and a brush cup ${2 * rb} mm across` : ''}, standing on drain ribs in a tray ${Math.round(tx)} × ${Math.round(ty)} mm.`,
    'Stand the caddy in the tray; water runs through the ribs and collects in the tray. Tip it out now and then.',
    'Print both upright (as they come), no supports. PETG or ASA takes the wet and the washing-up liquid better than PLA.',
  ];
  return { parts: [{ mesh: caddy, name: 'sink-caddy' }, { mesh: tray, name: 'drip-tray' }], notes, preview };
}
