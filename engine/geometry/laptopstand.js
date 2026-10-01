// Laptop stands. Two side pieces hold the laptop at an angle, with a lip at
// the front so it can't slide off and a window cut out of each to save
// filament; two bars slot through both sides to join them. Every piece prints
// flat. The bars have shoulders between the sides, so the sides can't slide in.
// Side profile in (x, y): x from the front (0) to the back, y up.
import { Mesh } from './mesh.js';
import { extrudePolygon, groupLoops, signedArea, simplifyClosed } from './polygon.js';
import { Grid, boxBlur, fillCircle, fillPolygon, offsetMask, traceContours } from './raster.js';

export const LAPTOPSTAND_DEFAULTS = {
  depth: 200, // front to back, under the laptop
  angle: 15, // degrees
  front: 22, // height at the front, under the lip
  span: 200, // between the two sides (about your laptop's width less 60 mm)
  thickness: 8, // each side piece
  lip: 10, // how far the lip stands above the slope
  clearance: 0.2, // round the bars in their slots
};

const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

export function laptopPlan(options = {}) {
  const o = { ...LAPTOPSTAND_DEFAULTS, ...options };
  const L = Math.max(120, Math.min(250, o.depth)), a = (Math.max(0, Math.min(35, o.angle)) * Math.PI) / 180;
  const hf = Math.max(16, o.front), hb = hf + L * Math.tan(a), T = Math.max(5, o.thickness), c = Math.max(0.05, o.clearance);
  const bw = 15, bt = 6, shoulder = 3; // bars: width (standing up), thickness, shoulder each side
  const span = Math.max(80, Math.min(240, o.span));
  const bars = [30, L - 30].map((x) => ({ x, y: 5 + (bw + c) / 2 })); // slot centres, near the bottom
  return { o, L, a, hf, hb, T, c, bw, bt, shoulder, span, bars, lipH: Math.max(4, o.lip) };
}

/** One side piece's profile as a raster. */
export function sideProfile(p, res = 0.25) {
  const { L, hf, hb, lipH, bars, bw, bt, c } = p;
  const lipW = 6;
  const g = Grid.covering(-2, -2, L + 2, hb + lipH + 2, res);
  fillPolygon(g, [[0, 0], [L, 0], [L, hb], [lipW, hf + (lipW * (hb - hf)) / L], [lipW, hf + lipH], [0, hf + lipH]]);
  fillCircle(g, lipW / 2, hf + lipH, lipW / 2); // a round top to the lip
  // A window inside, leaving a 10 mm frame and solid round each slot.
  const cut = offsetMask(g, -Math.round(10 / res));
  const keep = new Grid(g.width, g.height, g.x0, g.y0, res);
  for (const b of bars) fillPolygon(keep, rect(b.x - bt / 2 - 7, -2, b.x + bt / 2 + 7, b.y + bw / 2 + 8));
  for (let i = 0; i < g.data.length; i++) if (cut.data[i] >= 0.5 && !keep.data[i]) g.data[i] = 0;
  // The slots the bars pass through, standing on edge.
  const slots = new Grid(g.width, g.height, g.x0, g.y0, res);
  for (const b of bars) fillPolygon(slots, rect(b.x - (bt + c) / 2, b.y - (bw + c) / 2, b.x + (bt + c) / 2, b.y + (bw + c) / 2));
  for (let i = 0; i < g.data.length; i++) if (slots.data[i]) g.data[i] = 0;
  return g;
}

function traced(g, res) {
  const loops = traceContours(boxBlur(g, 1), 0.5).filter((l) => Math.abs(signedArea(l)) > 4 * res * res).map((l) => simplifyClosed(l, res * 0.2));
  return groupLoops(loops);
}

// A bar lying flat: (u along it, v across, w up). Ends fit the slots; the middle
// is wider, so its shoulders stop the sides sliding inward.
function bar(p) {
  const { span, T, bw, bt, shoulder } = p, out = 2;
  const end = T + out, len = span + 2 * end;
  const pts = [[0, 0], [end, 0], [end, -shoulder], [end + span, -shoulder], [end + span, 0], [len, 0], [len, bw], [end + span, bw], [end + span, bw + shoulder], [end, bw + shoulder], [end, bw], [0, bw]];
  return { mesh: extrudePolygon(pts, [], 0, bt), len, end };
}

export function generateLaptopStand(options = {}) {
  const p = laptopPlan(options), res = 0.25;
  const side = new Mesh();
  for (const q of traced(sideProfile(p, res), res)) side.append(extrudePolygon(q.outer, q.holes, 0, p.T));
  const b = bar(p);
  // On the bed: the two sides one above the other, the bars below them.
  const parts = [];
  const H = p.hb + p.lipH + 4;
  for (let k = 0; k < 2; k++) { const m = new Mesh(); m.append(side); m.translate(0, k * (H + 6), 0); parts.push({ mesh: m, name: `side-${k + 1}` }); }
  for (let k = 0; k < 2; k++) { const m = new Mesh(); m.append(b.mesh); m.translate(0, -(k + 1) * (p.bw + 2 * p.shoulder + 6), 0); parts.push({ mesh: m, name: `bar-${k + 1}` }); }
  // Put together, for the preview: the sides stand up, the bars run between them.
  const upright = new Mesh();
  for (const y0 of [0, p.span + p.T]) {
    const m = new Mesh(); m.append(side);
    const q = m.positions;
    for (let i = 0; i < q.length; i += 3) { const x = q[i], y = q[i + 1], z = q[i + 2]; q[i] = x; q[i + 1] = -z + y0 + p.T; q[i + 2] = y; } // (x, y, z) → (x, −z, y): a rotation
    upright.append(m);
  }
  for (const s of p.bars) {
    const m = new Mesh(); m.append(b.mesh);
    const q = m.positions;
    for (let i = 0; i < q.length; i += 3) { const u = q[i], v = q[i + 1], w = q[i + 2]; q[i] = w + s.x - p.bt / 2; q[i + 1] = u - b.end + p.T; q[i + 2] = v + s.y - p.bw / 2; } // (u, v, w) → (w, u, v): a rotation
    upright.append(m);
  }
  const notes = [
    `Raises the back ${Math.round(p.hb - p.hf)} mm over ${Math.round(p.L)} mm: a ${Math.round(options.angle ?? LAPTOPSTAND_DEFAULTS.angle)}° slope, ${Math.round(p.span + 2 * p.T)} mm wide. The lip stops the laptop sliding.`,
    'Push the bars through both sides until their shoulders meet. Everything prints flat; PETG is stiffer than PLA in a warm room.',
  ];
  return { parts, notes, plan: p, upright };
}
