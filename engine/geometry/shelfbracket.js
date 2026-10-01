// Shelf brackets. An L of a wall leg and a shelf leg, held square by a straight
// brace or a curved web. It prints on its side, as it comes, so the layers run
// along the load and nothing needs support; the screw holes run sideways, so
// they print as teardrops.
// Frame: the wall is x = 0 (bracket at x > 0), the shelf's underside y = H,
// the bracket's width along z.
import { Mesh } from './mesh.js';
import { extrudePolygon, signedArea } from './polygon.js';

export const SHELFBRACKET_DEFAULTS = {
  style: 'brace', // brace | curved
  depth: 150, // the shelf leg, out from the wall
  height: 150, // the wall leg
  width: 25,
  thickness: 6,
  screw: 4.5, // hole for the screws (4 mm / #8 screws)
};

const ccw = (pts) => (signedArea(pts) < 0 ? pts.reverse() : pts);

// Extrude an outline in (y, z) along x, or one in (z, x) along y: both are
// rotations of extrudePolygon's (x, y) / z, so the winding holds.
function cyclic(outer, holes, a, b, turns) {
  const m = extrudePolygon(outer, holes, a, b), p = m.positions;
  for (let i = 0; i < p.length; i += 3) {
    const u = p[i], v = p[i + 1], w = p[i + 2];
    if (turns === 1) { p[i] = w; p[i + 1] = u; p[i + 2] = v; } else { p[i] = v; p[i + 1] = w; p[i + 2] = u; }
  }
  return m;
}

// A teardrop round (cu, cv), its point towards (du, dv), counter-clockwise.
function teardrop(cu, cv, r, du, dv, n = 24) {
  const up = Math.atan2(dv, du), pts = [[cu + r * Math.SQRT2 * Math.cos(up), cv + r * Math.SQRT2 * Math.sin(up)]];
  for (let k = 0; k <= n; k++) { const a = up + Math.PI / 4 + (k / n) * (1.5 * Math.PI); pts.push([cu + r * Math.cos(a), cv + r * Math.sin(a)]); }
  return pts;
}

/** Where the brace meets each leg, and where the screws go. */
export function bracketPlan(options = {}) {
  const o = { ...SHELFBRACKET_DEFAULTS, ...options };
  const t = Math.max(3, o.thickness), D = Math.max(40, o.depth), H = Math.max(40, o.height), W = Math.max(10, o.width);
  const top = H - t; // the shelf leg's underside
  const yj = top * 0.3, xj = t + (D - t) * 0.7; // the brace's ends
  const r = Math.max(1, o.screw / 2 + 0.2);
  const wall = [yj / 2], shelf = [(xj + D) / 2];
  if (o.style !== 'curved') {
    const len = Math.hypot(xj - t, top - yj), gy = (t * len) / (xj - t);
    wall.push(yj + gy + (top - yj - gy) * 0.55);
    shelf.push(t + (xj - t) * 0.35);
  }
  return { o, t, D, H, W, top, yj, xj, r, wall, shelf };
}

export function generateShelfBracket(options = {}) {
  const p = bracketPlan(options);
  const { o, t, D, H, W, top, yj, xj, r } = p;
  const mesh = new Mesh();
  const holes = (cs, along) => cs.filter((c) => c - r * 1.5 > 2).map((c) => teardrop(along === 'wall' ? c : W / 2, along === 'wall' ? W / 2 : c, r, along === 'wall' ? 0 : 1, along === 'wall' ? 1 : 0).reverse());
  // Wall leg: an outline in (y, z) along x. Shelf leg: in (z, x) along y.
  mesh.append(cyclic([[0, 0], [H, 0], [H, W], [0, W]], holes(p.wall, 'wall'), 0, t, 1));
  mesh.append(cyclic([[0, 0], [W, 0], [W, D], [0, D]], holes(p.shelf, 'shelf'), top, H, 2));
  let web;
  if (o.style === 'curved') {
    // The corner filled in up to an arc between the brace's ends, curving in.
    const chord = Math.hypot(xj - t, top - yj), rho = chord * 1.1;
    const mx = (t + xj) / 2, my = (yj + top) / 2, nx = (top - yj) / chord, ny = -(xj - t) / chord; // normal, away from the corner
    const off = Math.sqrt(rho * rho - (chord / 2) ** 2), cx = mx + nx * off, cy = my + ny * off;
    const a0 = Math.atan2(yj - cy, t - cx), a1 = Math.atan2(top - cy, xj - cx);
    web = [[t - 0.01, top + 0.01], [t - 0.01, yj]];
    for (let k = 1; k < 32; k++) { const a = a0 + ((a1 - a0) * k) / 32; web.push([cx + rho * Math.cos(a), cy + rho * Math.sin(a)]); }
    web.push([xj, top + 0.01]);
  } else {
    const len = Math.hypot(xj - t, top - yj), gy = (t * len) / (xj - t), gx = (t * len) / (top - yj);
    web = [[t - 0.01, yj], [xj + gx, top + 0.01], [xj, top + 0.01], [t - 0.01, yj + gy]];
  }
  mesh.append(extrudePolygon(ccw(web), [], 0, W));
  const notes = [
    `Holds a shelf ${Math.round(D)} mm deep or a little more. ${p.wall.length + p.shelf.length} screw holes for ${o.screw >= 5 ? '5 mm' : o.screw >= 4 ? '4 mm (#8)' : '3.5 mm'} pan-head screws, into wall plugs or a stud.`,
    'Print it on its side, as it comes, with 4 walls and 40 % infill or more: the layers then run along the load. Use two per shelf, and more for a long or heavy one.',
  ];
  return { parts: [{ mesh, name: `shelf-bracket-${o.style}-${Math.round(D)}x${Math.round(H)}` }], notes, plan: p };
}
