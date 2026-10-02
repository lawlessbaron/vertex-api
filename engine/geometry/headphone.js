// Headphone stands. Two flat pieces that slide together at a cross-lap joint,
// so the whole stand prints flat with nothing to support:
//  - the front piece has the long curved cradle the headband rests on (and a
//    hook for the cable), with a slot from the bottom;
//  - the side piece has a short cradle with raised edges so the band can't slip
//    off sideways, with a slot from the top.
// A round base with a cross-shaped socket for the feet, and pockets for coins
// or washers to weigh it down, is optional.
// Each piece's profile is in (x, y), y up, unioned on a raster and traced.
import { Mesh } from './mesh.js';
import { circlePolygon, extrudePolygon, groupLoops, signedArea, simplifyClosed } from './polygon.js';
import { Grid, fillPolygon, traceBinary } from './raster.js';

export const HEADPHONE_DEFAULTS = {
  height: 250, // to the top of the cradle
  span: 110, // the cradle's length along the headband
  band: 45, // the headband's width
  foot: 150, // each piece's foot, end to end
  thickness: 8, // each piece's thickness, and so the slots' width
  clearance: 0.3, // in the slots and the base socket
  hook: true, // a cable hook on the front piece
  base: true,
};

const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

function traced(grid, res) {
  const loops = traceBinary(grid).filter((l) => Math.abs(signedArea(l)) > 4 * res * res).map((l) => simplifyClosed(l, res * 0.25));
  return groupLoops(loops);
}

export function headphonePlan(options = {}) {
  const o = { ...HEADPHONE_DEFAULTS, ...options };
  const H = Math.max(120, o.height), span = Math.max(60, o.span), band = Math.max(20, o.band), F = Math.max(90, o.foot);
  const t = Math.max(4, o.thickness), c = Math.max(0.1, o.clearance);
  const P = Math.max(26, 3 * t + 6); // post width: the slot leaves a strip each side
  const fh = 10, shoulder = (F - P) / 3; // foot height, and how high the foot blends into the post
  const ys = H / 2; // where the two slots meet
  return { o, H, span, band, F, t, c, P, fh, shoulder, ys, slot: t + 2 * c };
}

// The foot and post shared by both pieces.
function footAndPost(g, p, top) {
  fillPolygon(g, [[-p.F / 2, 0], [p.F / 2, 0], [p.F / 2, p.fh], [p.P / 2, p.fh + p.shoulder], [-p.P / 2, p.fh + p.shoulder], [-p.F / 2, p.fh]]);
  fillPolygon(g, rect(-p.P / 2, 0, p.P / 2, top));
}

export function frontPiece(p, res = 0.25) {
  const { H, span, t, P } = p;
  const sag = Math.min(18, span * 0.15), R = (span / 2) ** 2 / (2 * sag) + sag / 2, ct = 12;
  const cy = H - R, aEnd = Math.acos(Math.min(1, span / 2 / R));
  const reach = p.o.hook ? 30 : 0;
  const g = Grid.covering(-Math.max(p.F, span) / 2 - 2, -2, Math.max(p.F, span) / 2 + reach + 2, H + 2, res);
  footAndPost(g, p, H - ct + 1);
  // The cradle: a band between two arcs about the same centre.
  const arc = [];
  for (let k = 0; k <= 48; k++) { const a = aEnd + ((Math.PI - 2 * aEnd) * k) / 48; arc.push([R * Math.cos(a), cy + R * Math.sin(a)]); }
  for (let k = 48; k >= 0; k--) { const a = aEnd + ((Math.PI - 2 * aEnd) * k) / 48; arc.push([(R - ct) * Math.cos(a), cy + (R - ct) * Math.sin(a)]); }
  fillPolygon(g, signedArea(arc) < 0 ? arc.reverse() : arc);
  if (p.o.hook) {
    // A cable hook off the post: an arm and an upturned lip.
    const y = H * 0.42;
    fillPolygon(g, [[P / 2 - 1, y], [P / 2 + reach, y], [P / 2 + reach, y + 8], [P / 2 - 1, y + 14]]);
    fillPolygon(g, rect(P / 2 + reach - 6, y, P / 2 + reach, y + 16));
  }
  // The slot from the bottom, up to the middle.
  const cut = new Grid(g.width, g.height, g.x0, g.y0, res);
  fillPolygon(cut, rect(-p.slot / 2, -2, p.slot / 2, p.ys));
  for (let i = 0; i < g.data.length; i++) if (cut.data[i]) g.data[i] = 0;
  const mesh = new Mesh();
  for (const q of traced(g, res)) mesh.append(extrudePolygon(q.outer, q.holes, 0, t));
  return mesh;
}

export function sidePiece(p, res = 0.25) {
  const { H, band, t, P } = p;
  const w = band + 12, lip = 6;
  const g = Grid.covering(-Math.max(p.F, w) / 2 - 2, -2, Math.max(p.F, w) / 2 + 2, H + lip + 2, res);
  footAndPost(g, p, H - 13);
  // A short cradle, level in the middle and turning up at the edges.
  const top = [];
  for (let k = 0; k <= 32; k++) { const x = -w / 2 + (w * k) / 32, u = Math.abs(x) / (w / 2); top.push([x, H + lip * u ** 4]); }
  fillPolygon(g, [[w / 2, H - 14], ...top.reverse(), [-w / 2, H - 14]]);
  // The slot from the top, down to the middle: the front piece fills it.
  const cut = new Grid(g.width, g.height, g.x0, g.y0, res);
  fillPolygon(cut, rect(-p.slot / 2, p.ys, p.slot / 2, H + lip + 2));
  for (let i = 0; i < g.data.length; i++) if (cut.data[i]) g.data[i] = 0;
  const mesh = new Mesh();
  for (const q of traced(g, res)) mesh.append(extrudePolygon(q.outer, q.holes, 0, t));
  return mesh;
}

export function basePiece(p) {
  const { F, t, c } = p;
  const R = F / 2 + 6, T = 8, socket = 5, pocketD = 6, n = 96;
  const fl = F / 2 + c, hw = t / 2 + c; // the cross's arms, with clearance
  const cross = [[hw, -hw], [fl, -hw], [fl, hw], [hw, hw], [hw, fl], [-hw, fl], [-hw, hw], [-fl, hw], [-fl, -hw], [-hw, -hw], [-hw, -fl], [hw, -fl]];
  // Coin pockets between the arms: far enough out to clear them, inside the rim.
  const pr = 13.2, pd = Math.min(R - pr - 3, Math.max((hw + pr + 2) * Math.SQRT2, R * 0.55));
  const pockets = [0, 1, 2, 3].map((k) => { const a = Math.PI / 4 + (k * Math.PI) / 2; return circlePolygon(pd * Math.cos(a), pd * Math.sin(a), pr, 48).reverse(); });
  const disc = circlePolygon(0, 0, R, n);
  const mesh = extrudePolygon(disc, [], 0, T - pocketD);
  mesh.append(extrudePolygon(disc, pockets, T - pocketD - 0.01, T - socket));
  mesh.append(extrudePolygon(disc, [...pockets, cross.slice().reverse()], T - socket - 0.01, T));
  return { mesh, R, T, socket };
}

export function generateHeadphoneStand(options = {}) {
  const p = headphonePlan(options);
  const res = p.H > 300 ? 0.3 : 0.25;
  const front = frontPiece(p, res), side = sidePiece(p, res);
  // Laid out side by side on the bed.
  const fb = front.bounds(), sb = side.bounds();
  side.translate(fb.max[0] - sb.min[0] + 10, 0, 0);
  const parts = [{ mesh: front, name: 'stand-front' }, { mesh: side, name: 'stand-side' }];
  const notes = [`Slide the two pieces together at their slots to make a cross, ${Math.round(p.H)} mm tall. The band rests on a cradle ${Math.round(p.span)} mm long, with room for a band up to ${Math.round(p.band)} mm wide.`];
  if (p.o.base) {
    const b = basePiece(p);
    const sb2 = side.bounds();
    b.mesh.translate(sb2.max[0] + 10 + b.R, b.R - 2, 0);
    parts.push({ mesh: b.mesh, name: 'stand-base' });
    notes.push(`Push the cross's feet into the base. The four pockets take coins or washers up to 26 mm across to weigh it down.`);
  }
  if (p.o.hook) notes.push('The hook on the front piece holds the cable.');
  return { parts, notes, plan: p };
}
