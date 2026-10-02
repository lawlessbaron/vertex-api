// Monitor risers. A shelf on two legs: each leg has two tabs along its top
// that push through slots in the shelf, and a window cut out of it, so a
// keyboard slides underneath. A brace through both legs at the back stops it
// racking side to side; its shoulders stop the legs sliding in. Every piece
// prints flat.
// Leg profile in (u, v): u across the riser's depth, v up.
import { Mesh } from './mesh.js';
import { extrudePolygon } from './polygon.js';

export const MONITORRISER_DEFAULTS = {
  width: 240, // the shelf, side to side (up to your bed)
  depth: 200,
  height: 90, // under the shelf
  shelf: 6, // shelf thickness
  legs: 8, // leg thickness
  clearance: 0.2, // round the tabs in their slots
};

function roundedRect(x0, y0, x1, y1, r, n = 6) {
  const pts = [];
  for (const [cx, cy, a0] of [[x1 - r, y0 + r, -90], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, 90], [x0 + r, y0 + r, 180]]) {
    for (let k = 0; k <= n; k++) { const a = ((a0 + (90 * k) / n) * Math.PI) / 180; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  }
  return pts;
}
const rectCW = (x0, y0, x1, y1) => [[x0, y0], [x0, y1], [x1, y1], [x1, y0]];

export function riserPlan(options = {}) {
  const o = { ...MONITORRISER_DEFAULTS, ...options };
  const W = Math.max(120, Math.min(256, o.width)), D = Math.max(100, Math.min(256, o.depth)), H = Math.max(40, o.height);
  const tp = Math.max(4, o.shelf), lt = Math.max(5, o.legs), c = Math.max(0.05, o.clearance);
  const tabL = Math.min(30, D / 4), tabs = [-D / 4, D / 4]; // tab centres across the depth
  const legX = [-(W / 2 - 15), W / 2 - 15]; // leg centres along the width
  const frame = Math.min(15, H / 4);
  // The brace: through the legs' back posts, as tall as fits between the frame rails.
  const braceT = 6, braceH = Math.min(30, H - 2 * frame - 8), braceU = D - frame / 2, braceV = H / 2, shoulder = 3;
  const brace = braceH >= 12 ? { t: braceT, h: braceH, u: braceU, v: braceV, shoulder } : null;
  return { o, W, D, H, tp, lt, c, tabL, tabs, legX, frame, brace };
}

export function generateMonitorRiser(options = {}) {
  const p = riserPlan(options);
  const { W, D, H, tp, lt, c, tabL, tabs, legX, frame, brace } = p;
  // The shelf, with a slot under each tab.
  const slots = [];
  for (const x of legX) for (const y of tabs) slots.push(rectCW(x - (lt + c) / 2, y - (tabL + c) / 2, x + (lt + c) / 2, y + (tabL + c) / 2));
  const shelf = extrudePolygon(roundedRect(-W / 2, -D / 2, W / 2, D / 2, 8), slots, 0, tp);
  // A leg: a frame with a window, and two tabs along the top that stand up through the shelf.
  const legPoly = [[0, 0], [D, 0], [D, H]];
  for (const y of [...tabs].reverse()) { const u = D / 2 + y; legPoly.push([u + tabL / 2, H], [u + tabL / 2, H + tp], [u - tabL / 2, H + tp], [u - tabL / 2, H]); }
  legPoly.push([0, H]);
  const win = H - 2 * frame > 10 && D - 2 * frame > 20 ? [roundedRect(frame, frame, D - frame, H - frame, Math.min(10, (H - 2 * frame) / 3)).reverse()] : [];
  if (brace) win.push(rectCW(brace.u - (brace.t + c) / 2, brace.v - (brace.h + c) / 2, brace.u + (brace.t + c) / 2, brace.v + (brace.h + c) / 2));
  const leg = extrudePolygon(legPoly, win, 0, lt);
  // The brace, lying flat: (s along it, r across). Its ends pass through the
  // legs and stand 3 mm proud; the middle is 3 mm taller each side, so its
  // shoulders sit against the legs' inner faces.
  let braceMesh = null, braceEnd = 0;
  if (brace) {
    const inner = legX[1] - legX[0] - lt, end = inner / 2 + lt + 3, hh = brace.h / 2, sh = hh + brace.shoulder;
    braceEnd = end;
    braceMesh = extrudePolygon([[-end, -hh], [-inner / 2, -hh], [-inner / 2, -sh], [inner / 2, -sh], [inner / 2, -hh], [end, -hh], [end, hh], [inner / 2, hh], [inner / 2, sh], [-inner / 2, sh], [-inner / 2, hh], [-end, hh]], [], 0, brace.t);
  }
  // Laid out on the bed: the shelf, then the two legs beside it.
  const parts = [{ mesh: shelf, name: 'shelf' }];
  for (let k = 0; k < 2; k++) { const m = new Mesh(); m.append(leg); m.translate(W / 2 + 10 + k * (H + tp + 10), -D / 2, 0); parts.push({ mesh: m, name: `leg-${k + 1}` }); }
  if (braceMesh) { const m = new Mesh(); m.append(braceMesh); m.translate(0, -D / 2 - 10 - brace.h / 2 - brace.shoulder, 0); parts.push({ mesh: m, name: 'brace' }); }
  // Put together, for the preview: legs standing, (u, v, w) → (w, u, v) (a rotation), shelf on top.
  const upright = new Mesh();
  for (const x of legX) {
    const m = new Mesh(); m.append(leg);
    const q = m.positions;
    for (let i = 0; i < q.length; i += 3) { const u = q[i], v = q[i + 1], w = q[i + 2]; q[i] = w + x - lt / 2; q[i + 1] = u - D / 2; q[i + 2] = v; }
    upright.append(m);
  }
  const top = new Mesh(); top.append(shelf); top.translate(0, 0, H); upright.append(top);
  if (braceMesh) {
    // Standing at the back: (s, r, w) → (s, −w, r), a rotation; through the legs' posts.
    const m = new Mesh(); m.append(braceMesh);
    const q = m.positions;
    for (let i = 0; i < q.length; i += 3) { const s0 = q[i], r = q[i + 1], w = q[i + 2]; q[i] = s0 + (legX[0] + legX[1]) / 2; q[i + 1] = -w + brace.u - D / 2 + brace.t / 2; q[i + 2] = r + brace.v; }
    upright.append(m);
  }
  const notes = [
    `A shelf ${Math.round(W)} × ${Math.round(D)} mm, ${Math.round(H + tp)} mm high, with ${Math.round(W - 30 - lt)} mm clear between the legs for a keyboard.`,
    brace ? 'Slide the brace through both legs’ back posts until its shoulders meet them, then push the legs’ tabs up through the shelf’s slots. Everything prints flat; for a heavy monitor use PETG and 4 walls.' : 'Push the legs’ tabs up through the shelf’s slots. Everything prints flat; for a heavy monitor use PETG and 4 walls.',
  ];
  return { parts, notes, plan: p, upright };
}
