// Parts drawn as a stack of slabs: each slab is a 2D drawing (on and off,
// so unions, holes, slots and notches are just drawing), traced and
// extruded. Used where a part's shape changes with height in ways plain
// extrusion can't do: snap tines, spring beams, lead-ins, recesses.
import { Mesh } from './mesh.js';
import { extrudePolygon, groupLoops, signedArea, simplifyClosed } from './polygon.js';
import { roundedRect } from './primitives.js';
import { Grid, boxBlur, fillCircle, fillPolygon, traceContours } from './raster.js';

export function rr(x0, y0, x1, y1, r = 0) {
  const w = x1 - x0, d = y1 - y0;
  if (w <= 0 || d <= 0) return null;
  return roundedRect({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w, d, r: Math.max(0, Math.min(r, w / 2 - 0.01, d / 2 - 0.01)) }, 6);
}
// tol: how far a traced outline may be straightened (default 0.3 of a pixel); parts
// with many holes can afford more, for far fewer triangles.
export function sections(bounds, cuts, draw, res = 0.1, tol = res * 0.3) {
  const [x0, y0, x1, y1] = bounds;
  const zs = [...new Set(cuts.map((z) => Math.round(z * 1000) / 1000))].sort((a, b) => a - b);
  const mesh = new Mesh();
  const g = Grid.covering(x0 - 1, y0 - 1, x1 + 1, y1 + 1, res);
  const on = (p) => { if (p) fillPolygon(g, p, 1); };
  const off = (p) => { if (p) fillPolygon(g, p, 0); };
  const disc = (x, y, r, v = 1) => fillCircle(g, x, y, r, v);
  for (let i = 0; i < zs.length - 1; i++) {
    const za = zs[i], zb = zs[i + 1];
    if (zb - za < 1e-6) continue;
    g.data.fill(0);
    draw((za + zb) / 2, { on, off, disc, g });
    const loops = traceContours(boxBlur(g, 1), 0.5).filter((l) => Math.abs(signedArea(l)) > 6 * res * res).map((l) => simplifyClosed(l, tol));
    for (const q of groupLoops(loops)) mesh.append(extrudePolygon(q.outer, q.holes, za, zb));
  }
  return mesh;
}
