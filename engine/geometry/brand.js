// The Mint Motive mark, flattened from the official vector artwork
// (Brand Guidelines 2026). Units: the mark is MARK_WIDTH x 100, y up,
// origin at the bottom-left of the bar.
import { textPolygons, textUnits } from './font.js';
import { Grid, fillPolygon, traceContours, boxBlur } from './raster.js';
import { simplifyClosed, signedArea, groupLoops, extrudePolygon } from './polygon.js';
import { Mesh } from './mesh.js';
export const MARK_WIDTH = 97.9;
export const MARK_HEIGHT = 100;

const MARK = [[[48.95,55.01],[51.79,55.15],[54.54,55.57],[57.2,56.26],[59.75,57.19],[62.17,58.36],[64.46,59.75],[66.6,61.34],[68.56,63.13],[70.36,65.1],[71.95,67.24],[73.34,69.53],[74.51,71.95],[75.44,74.5],[76.13,77.16],[76.55,79.91],[76.69,82.75],[76.69,100.0],[73.85,99.86],[71.1,99.44],[68.44,98.75],[65.89,97.82],[63.47,96.65],[61.18,95.26],[59.04,93.67],[57.07,91.88],[55.28,89.91],[53.69,87.77],[52.3,85.48],[51.13,83.06],[50.2,80.51],[49.51,77.85],[49.09,75.1],[48.95,72.26],[48.81,75.1],[48.39,77.85],[47.7,80.51],[46.77,83.06],[45.6,85.48],[44.21,87.77],[42.62,89.91],[40.82,91.88],[38.86,93.67],[36.72,95.26],[34.43,96.65],[32.01,97.82],[29.46,98.75],[26.8,99.44],[24.05,99.86],[21.21,100.0],[21.21,82.75],[21.35,79.91],[21.77,77.16],[22.46,74.5],[23.39,71.95],[24.56,69.53],[25.95,67.24],[27.54,65.1],[29.34,63.13],[31.3,61.34],[33.44,59.75],[35.73,58.36],[38.15,57.19],[40.7,56.26],[43.36,55.57],[46.11,55.15]],[[45.11,21.33],[44.88,25.94],[44.19,30.42],[43.08,34.74],[41.56,38.89],[39.66,42.83],[37.4,46.55],[34.81,50.02],[31.9,53.22],[28.69,56.13],[25.22,58.73],[21.5,60.99],[17.56,62.89],[13.41,64.4],[9.09,65.51],[4.61,66.2],[0.0,66.43],[0.0,21.21],[45.11,21.21]],[[97.9,66.43],[93.29,66.2],[88.81,65.51],[84.49,64.4],[80.34,62.89],[76.4,60.99],[72.68,58.73],[69.21,56.13],[66.01,53.22],[63.1,50.02],[60.5,46.55],[58.24,42.83],[56.34,38.89],[54.83,34.74],[53.72,30.42],[53.03,25.94],[52.8,21.33],[52.8,21.21],[97.9,21.21]],[[0.0,0.0],[97.9,0.0],[97.9,13.05],[0.0,13.05]]];

export function markPolygons() {
  return MARK.map((poly) => poly.map(([x, y]) => [x, y]));
}

// Polygons scaled to `size` mm wide, centred on (cx, cy).
export function markAt(cx, cy, size) {
  const k = size / MARK_WIDTH;
  return MARK.map((poly) => poly.map(([x, y]) => [cx + (x - MARK_WIDTH / 2) * k, cy + (y - MARK_HEIGHT / 2) * k]));
}

// The VERTEX badge (the mark with "VERTEX" beside it) as simple, non-overlapping
// outlines, for recessing into a face or engraving. `size` is the mark's width;
// the word is about 70% of its height. `mirror` flips it left to right, for a
// face that's read from the other side (the back of a box printed floor-down).
// Returns { groups: [{ outer, holes }], w, h } centred on (cx, cy).
export function badgeOutlines(cx, cy, size, { mirror = false, res = 0.1 } = {}) {
  const lib = { textPolygons, textUnits, Grid, fillPolygon, traceContours, boxBlur, simplifyClosed, signedArea };
  const markH = (size * MARK_HEIGHT) / MARK_WIDTH, textH = markH * 0.7, gap = size * 0.25;
  const textW = (lib.textUnits('VERTEX') * textH) / 6;
  const w = size + gap + textW, h = markH;
  const x0 = -w / 2;
  const polys = [...markAt(x0 + size / 2, 0, size), ...lib.textPolygons('VERTEX', x0 + size + gap, -textH / 2, textH, Math.max(0.6, textH * 0.16))];
  const grid = lib.Grid.covering(-w / 2 - 2, -h / 2 - 2, w / 2 + 2, h / 2 + 2, res);
  for (const p of polys) lib.fillPolygon(grid, p);
  const loops = lib.traceContours(lib.boxBlur(grid, 1), 0.5)
    .filter((l) => Math.abs(lib.signedArea(l)) > 4 * res * res)
    .map((l) => { const m = lib.simplifyClosed(l, res * 0.2).map(([x, y]) => [cx + (mirror ? -x : x), cy + y]); return mirror ? m.reverse() : m; });
  // Outlines with their counters (the holes in R), so a recess leaves the counters standing.
  return { groups: groupLoops(loops), w, h };
}

// The biggest badge that fits in the box x0..x1 × y0..y1 (a face that lies on
// the bed), clear of `keep` (polygons or [x, y, r] circles) by 1.5 mm: tried in
// the middle, then above, below and beside it, then in each quarter. Mirrored by default, so it reads
// the right way from outside once the part is turned over. { groups, size } or null.
export function placeBadge(x0, y0, x1, y1, keep = [], { sizes = [12, 9, 7], margin = 4, mirror = true } = {}) {
  const boxes = keep.map((k) => {
    if (typeof k[0] === 'number') return [k[0] - k[2] - 1.5, k[1] - k[2] - 1.5, k[0] + k[2] + 1.5, k[1] + k[2] + 1.5];
    const xs = k.map((p) => p[0]), ys = k.map((p) => p[1]);
    return [Math.min(...xs) - 1.5, Math.min(...ys) - 1.5, Math.max(...xs) + 1.5, Math.max(...ys) + 1.5];
  });
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  for (const size of sizes) {
    const { w, h } = badgeOutlines(0, 0, size);
    const dy = (y1 - y0) / 4, dx = (x1 - x0) / 4;
    for (const [cx, cy] of [[mx, my], [mx, my - dy], [mx, my + dy], [mx - dx, my], [mx + dx, my], [mx - dx, my - dy], [mx + dx, my - dy], [mx - dx, my + dy], [mx + dx, my + dy]]) {
      const bx0 = cx - w / 2, bx1 = cx + w / 2, by0 = cy - h / 2, by1 = cy + h / 2;
      if (bx0 < x0 + margin || bx1 > x1 - margin || by0 < y0 + margin || by1 > y1 - margin) continue;
      if (boxes.some(([a0, b0, a1, b1]) => a1 > bx0 && a0 < bx1 && b1 > by0 && b0 < by1)) continue;
      return { ...badgeOutlines(cx, cy, size, { mirror }), size };
    }
  }
  return null;
}
// A slab from z0 to z1 with the badge recessed `depth` into its bottom face
// (the face on the bed). Counters in letters stay standing.
export function recessedSlab(outline, holes, groups, z0, z1, depth = 0.6) {
  const m = new Mesh();
  m.append(extrudePolygon(outline, [...holes, ...groups.map((g) => g.outer)], z0, z0 + depth));
  for (const g of groups) for (const c of g.holes) m.append(extrudePolygon([...c].reverse(), [], z0, z0 + depth));
  m.append(extrudePolygon(outline, holes, z0 + depth, z1));
  return m;
}

const fmt = (n) => (Math.round(n * 1000) / 1000).toString();
export const boltSpots = (L) => { const i = +L.inset || 7; return [[i, i], [L.w - i, i], [i, L.h - i], [L.w - i, L.h - i]]; };

