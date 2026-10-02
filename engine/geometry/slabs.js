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
  // Each slab blurs and traces only the box its drawing reached (plus a margin
  // of empty pixels), not the whole grid: the same outline, point for point,
  // for a fraction of the work when a slab is a small part of the bounds.
  let bx0, by0, bx1, by1, all;
  const reach = (minX, minY, maxX, maxY) => {
    const i0 = Math.floor((minX - g.x0) / res), j0 = Math.floor((minY - g.y0) / res);
    const i1 = Math.ceil((maxX - g.x0) / res), j1 = Math.ceil((maxY - g.y0) / res);
    if (i0 < bx0) bx0 = i0; if (j0 < by0) by0 = j0; if (i1 > bx1) bx1 = i1; if (j1 > by1) by1 = j1;
  };
  const on = (p) => {
    if (!p) return;
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const [x, y] of p) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; }
    reach(a, b, c, d);
    fillPolygon(g, p, 1);
  };
  const off = (p) => { if (p) fillPolygon(g, p, 0); };
  const disc = (x, y, r, v = 1) => { if (v) reach(x - r, y - r, x + r, y + r); fillCircle(g, x, y, r, v); };
  const tools = { on, off, disc, get g() { all = true; return g; } };
  for (let i = 0; i < zs.length - 1; i++) {
    const za = zs[i], zb = zs[i + 1];
    if (zb - za < 1e-6) continue;
    g.data.fill(0);
    bx0 = by0 = Infinity; bx1 = by1 = -Infinity; all = false;
    draw((za + zb) / 2, tools);
    if (!all && bx1 < bx0) continue; // nothing drawn
    const M = 4; // empty pixels round the drawing: the blur (radius 1) never reaches the crop's edge
    const i0 = all ? 0 : Math.max(0, bx0 - M), j0 = all ? 0 : Math.max(0, by0 - M);
    const i1 = all ? g.width : Math.min(g.width, bx1 + M), j1 = all ? g.height : Math.min(g.height, by1 + M);
    let crop = g;
    if (i0 > 0 || j0 > 0 || i1 < g.width || j1 < g.height) {
      crop = new Grid(i1 - i0, j1 - j0, g.x0, g.y0, res);
      for (let j = j0; j < j1; j++) crop.data.set(g.data.subarray(j * g.width + i0, j * g.width + i1), (j - j0) * crop.width);
    }
    const loops = traceContours(boxBlur(crop, 1), 0.5, i0, j0).filter((l) => Math.abs(signedArea(l)) > 6 * res * res).map((l) => simplifyClosed(l, tol));
    for (const q of groupLoops(loops)) mesh.append(extrudePolygon(q.outer, q.holes, za, zb));
  }
  return mesh;
}
