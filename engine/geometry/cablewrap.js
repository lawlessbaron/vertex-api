// Cable wraps and earbud winders. Both print flat:
//  - winder: a dog-bone the cable wraps round, with a slit at each end that
//    grips the cable (the plug at one end, the earbuds at the other);
//  - strap: a strap with holes along it and a button at one end that snaps
//    through any of them (print it in TPU for a soft one, PLA or PETG works too).
// Outlines are unioned on a raster and traced, like the cookie cutters.
import { Mesh } from './mesh.js';
import { circlePolygon, extrudePolygon, groupLoops, signedArea, simplifyClosed } from './polygon.js';
import { Grid, fillCircle, fillPolygon, traceBinary } from './raster.js';

export const CABLEWRAP_DEFAULTS = {
  item: 'winder', // winder | strap
  cable: 3, // the cable's diameter, mm
  length: 60, // winder length, or the strap's length
  width: 24,
  thickness: 3,
  segments: 48,
};

const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

function traced(grid, res) {
  const loops = traceBinary(grid).filter((l) => Math.abs(signedArea(l)) > 4 * res * res).map((l) => simplifyClosed(l, res * 0.25));
  return groupLoops(loops);
}

export function winder(o) {
  const c = Math.max(1, o.cable), L = Math.max(30, o.length), Wd = Math.max(14, o.width), T = Math.max(1.6, o.thickness);
  const lobe = Wd / 2, waist = Math.max(6, Wd * 0.38);
  const res = 0.1, pad = 2;
  const g = Grid.covering(-L / 2 - pad, -Wd / 2 - pad, L / 2 + pad, Wd / 2 + pad, res);
  fillCircle(g, -L / 2 + lobe, 0, lobe);
  fillCircle(g, L / 2 - lobe, 0, lobe);
  fillPolygon(g, rect(-L / 2 + lobe, -waist / 2, L / 2 - lobe, waist / 2));
  // A slit into each lobe from its end, a little narrower than the cable so it grips.
  const slit = Math.max(0.6, c * 0.8), depth = Math.min(lobe * 1.2, 10);
  const cut = new Grid(g.width, g.height, g.x0, g.y0, res);
  fillPolygon(cut, rect(-L / 2 - pad, -slit / 2, -L / 2 + depth, slit / 2));
  fillPolygon(cut, rect(L / 2 - depth, -slit / 2, L / 2 + pad, slit / 2));
  fillCircle(cut, -L / 2 + depth, 0, slit * 0.75); // a round end to the slit, to hold the cable
  fillCircle(cut, L / 2 - depth, 0, slit * 0.75);
  for (let i = 0; i < g.data.length; i++) if (cut.data[i]) g.data[i] = 0;
  const mesh = new Mesh();
  for (const p of traced(g, res)) mesh.append(extrudePolygon(p.outer, p.holes, 0, T));
  const turns = Math.max(1, Math.floor((L - 2 * lobe) / (c * 1.1)));
  return { parts: [{ mesh, name: `cable-winder-${Math.round(L)}mm` }], notes: [`About ${turns} turns of a ${c} mm cable fit across the waist, in a single layer. Push the cable into a slit at each end to hold it.`] };
}

export function strap(o) {
  const c = Math.max(1, o.cable), L = Math.max(60, o.length), Wd = Math.max(8, Math.min(30, o.width * 0.5)), T = Math.max(1.2, Math.min(3, o.thickness * 0.6));
  const n = Math.max(24, o.segments);
  const post = Math.min(Wd * 0.35, 3.5), cap = post + 1.2, hole = post + 0.25;
  // The strap: rounded ends, holes from the far end back.
  const out = [], r = Wd / 2;
  for (let k = 0; k <= 16; k++) { const a = -Math.PI / 2 + (k / 16) * Math.PI; out.push([L / 2 - r + r * Math.cos(a), r * Math.sin(a)]); }
  for (let k = 0; k <= 16; k++) { const a = Math.PI / 2 + (k / 16) * Math.PI; out.push([-L / 2 + r + r * Math.cos(a), r * Math.sin(a)]); }
  const holes = [];
  for (let x = L / 2 - r; x > -L / 2 + 2 * r + 12; x -= Math.max(5, hole * 2 + 2)) holes.push(circlePolygon(x, 0, hole / 2, 24).reverse());
  const mesh = extrudePolygon(out, holes, 0, T);
  // The button: a post and a slightly wider cap that snaps through a hole.
  const bx = -L / 2 + r;
  mesh.append(extrudePolygon(circlePolygon(bx, 0, post / 2, n), [], T - 0.01, T + T + 0.4));
  mesh.append(extrudePolygon(circlePolygon(bx, 0, cap / 2, n), [], T + T + 0.39, T + T + 1.4));
  const reach = Math.round(((L - 2 * r - 12) / Math.PI) * 10) / 10;
  return { parts: [{ mesh, name: `cable-strap-${Math.round(L)}mm` }], notes: [`Holds a bundle up to about ${reach} mm across. Snap the button through whichever hole fits. TPU makes it soft; PLA or PETG works too.`] };
}

export function generateCableWrap(options = {}) {
  const o = { ...CABLEWRAP_DEFAULTS, ...options };
  const r = o.item === 'strap' ? strap(o) : winder(o);
  const b = r.parts[0].mesh.bounds();
  r.parts[0].mesh.translate(-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2, 0);
  return r;
}
