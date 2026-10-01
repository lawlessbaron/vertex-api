import { Mesh } from './mesh.js';
import { triangulate } from './polygon.js';

const MIN_RADIUS = 0.01;

// Rounded rectangle contour, counter-clockwise seen from +z.
// `r` is a number or per-corner radii [+x+y, -x+y, -x-y, +x-y].
// Every contour built with the same `segments` has the same point count, so
// contours can be lofted into one another point for point.
export function roundedRect({ cx = 0, cy = 0, w, d, r }, segments) {
  const radii = Array.isArray(r) ? r : [r, r, r, r];
  const maxR = Math.min(w, d) / 2 - 1e-3;
  const corners = [
    [cx + w / 2, cy + d / 2, 0],
    [cx - w / 2, cy + d / 2, 90],
    [cx - w / 2, cy - d / 2, 180],
    [cx + w / 2, cy - d / 2, 270],
  ];
  const pts = [];
  corners.forEach(([x, y, a0], i) => {
    if (segments === 0) {
      pts.push([x, y]); // sharp corner
      return;
    }
    const cr = Math.max(MIN_RADIUS, Math.min(radii[i], maxR));
    const ox = x - Math.sign(x - cx) * cr;
    const oy = y - Math.sign(y - cy) * cr;
    for (let s = 0; s <= segments; s++) {
      const a = ((a0 + (90 * s) / segments) * Math.PI) / 180;
      pts.push([ox + cr * Math.cos(a), oy + cr * Math.sin(a)]);
    }
  });
  return pts;
}

function addRing(mesh, contour, z) {
  const start = mesh.vertexCount;
  for (const [x, y] of contour) mesh.addVertex(x, y, z);
  return start;
}

function addCap(mesh, contour, z, start, up) {
  let sx = 0, sy = 0;
  for (const [x, y] of contour) { sx += x; sy += y; }
  const c = mesh.addVertex(sx / contour.length, sy / contour.length, z);
  const m = contour.length;
  for (let k = 0; k < m; k++) {
    const a = start + k, b = start + ((k + 1) % m);
    if (up) mesh.addTri(c, a, b);
    else mesh.addTri(c, b, a);
  }
}

function addSides(mesh, lower, upper, m, outward) {
  for (let k = 0; k < m; k++) {
    const k1 = (k + 1) % m;
    const a = lower + k, b = lower + k1, c = upper + k1, d = upper + k;
    if (outward) mesh.addQuad(a, b, c, d);
    else mesh.addQuad(a, d, c, b);
  }
}

// Closed solid lofted through convex rounded-rect levels [{z, rect}], bottom to top.
export function loftSolid(levels, segments) {
  const mesh = new Mesh();
  const contours = levels.map((l) => roundedRect(l.rect, segments));
  const m = contours[0].length;
  const starts = levels.map((l, i) => addRing(mesh, contours[i], l.z));
  for (let i = 0; i < levels.length - 1; i++) addSides(mesh, starts[i], starts[i + 1], m, true);
  addCap(mesh, contours[0], levels[0].z, starts[0], false);
  addCap(mesh, contours.at(-1), levels.at(-1).z, starts.at(-1), true);
  return mesh;
}

// Closed tube between an outer and inner loft. Both lists share z values.
export function loftRing(outerLevels, innerLevels, segments) {
  const mesh = new Mesh();
  const outer = outerLevels.map((l) => addRing(mesh, roundedRect(l.rect, segments), l.z));
  const inner = innerLevels.map((l) => addRing(mesh, roundedRect(l.rect, segments), l.z));
  const m = 4 * (segments + 1);
  for (let i = 0; i < outer.length - 1; i++) {
    addSides(mesh, outer[i], outer[i + 1], m, true);
    addSides(mesh, inner[i], inner[i + 1], m, false);
  }
  const ob = outer[0], ib = inner[0], ot = outer.at(-1), it = inner.at(-1);
  for (let k = 0; k < m; k++) {
    const k1 = (k + 1) % m;
    mesh.addQuad(ob + k, ib + k, ib + k1, ob + k1); // bottom, facing down
    mesh.addQuad(ot + k, ot + k1, it + k1, it + k); // top, facing up
  }
  return mesh;
}

export function box(x0, y0, z0, x1, y1, z1) {
  const rect = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, d: y1 - y0, r: 0 };
  return loftSolid([{ z: z0, rect }, { z: z1, rect }], 0);
}

// Extrude a 2D profile given as [y, z] points along x. The profile must be
// star-shaped from its first point (true for the fillets and wedges used here).
export function extrudeX(profile, x0, x1) {
  let area = 0;
  for (let k = 0; k < profile.length; k++) {
    const [y0, z0] = profile[k];
    const [y1, z1] = profile[(k + 1) % profile.length];
    area += y0 * z1 - y1 * z0;
  }
  const pts = area < 0 ? [...profile].reverse() : profile;
  const mesh = new Mesh();
  const m = pts.length;
  const a = mesh.vertexCount;
  for (const [y, z] of pts) mesh.addVertex(x0, y, z);
  const b = mesh.vertexCount;
  for (const [y, z] of pts) mesh.addVertex(x1, y, z);
  for (let k = 0; k < m; k++) {
    const k1 = (k + 1) % m;
    mesh.addQuad(a + k, a + k1, b + k1, b + k);
  }
  for (let k = 1; k < m - 1; k++) {
    mesh.addTri(a, a + k + 1, a + k); // faces -x
    mesh.addTri(b, b + k, b + k + 1); // faces +x
  }
  return mesh;
}

// Loft through rounded-rect levels with constant vertical holes (any polygons)
// running from the bottom level to the top level. Watertight.
export function loftWithHoles(levels, holes, segments) {
  if (!holes.length) return loftSolid(levels, segments);
  const cw = holes.map((h) => (signedArea2(h) > 0 ? [...h].reverse() : h));
  const contours = levels.map((l) => roundedRect(l.rect, segments));
  const bottom = triangulate(contours[0], cw);
  const top = triangulate(contours.at(-1), cw);
  const mesh = new Mesh();
  const z0 = levels[0].z, z1 = levels.at(-1).z;
  const b0 = mesh.vertexCount;
  for (const [x, y] of bottom.coords) mesh.addVertex(x, y, z0);
  const mids = [];
  for (let i = 1; i < levels.length - 1; i++) mids.push(addRing(mesh, contours[i], levels[i].z));
  const t0 = mesh.vertexCount;
  for (const [x, y] of top.coords) mesh.addVertex(x, y, z1);
  const m = contours[0].length;
  const rings = [b0, ...mids, t0];
  for (let i = 0; i < rings.length - 1; i++) addSides(mesh, rings[i], rings[i + 1], m, true);
  let off = m;
  for (const h of cw) {
    const n = h.length;
    for (let k = 0; k < n; k++) {
      const a = off + k, b = off + ((k + 1) % n);
      mesh.addQuad(b0 + a, b0 + b, t0 + b, t0 + a);
    }
    off += n;
  }
  for (let t = 0; t < bottom.tris.length; t += 3) mesh.addTri(b0 + bottom.tris[t], b0 + bottom.tris[t + 2], b0 + bottom.tris[t + 1]);
  for (let t = 0; t < top.tris.length; t += 3) mesh.addTri(t0 + top.tris[t], t0 + top.tris[t + 1], t0 + top.tris[t + 2]);
  return mesh;
}

function signedArea2(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] - poly[i][0]) * (poly[j][1] + poly[i][1]);
  return a;
}

// Magnet hole with inward crush ribs that grip a 6 mm magnet.
export function ribbedCircle(cx, cy, r, ribR, ribs = 8, segments = 48) {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const phase = ((a / (Math.PI * 2)) * ribs) % 1;
    const d = Math.abs(phase - 0.5) * 2; // 1 at rib centre, 0 between ribs
    const rr = d > 0.75 ? ribR + (r - ribR) * (1 - (d - 0.75) / 0.25) : r;
    pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
  }
  return pts;
}

// Extrude a 2D profile given as [x, z] points along y (see extrudeX).
export function extrudeY(profile, y0, y1) {
  const mesh = extrudeX(profile, y0, y1);
  // extrudeX built it with the profile in the y-z plane; swapping x and y
  // mirrors the solid, so flip every triangle to keep it facing outward.
  const p = mesh.positions;
  for (let i = 0; i < p.length; i += 3) [p[i], p[i + 1]] = [p[i + 1], p[i]];
  const ix = mesh.indices;
  for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
  return mesh;
}

// Closed solid lofted through simple polygons [{z, pts}] that all have the
// same point count (any shape, not just convex). Bottom to top.
export function loftPolygons(levels) {
  const ccw = signedArea2(levels[0].pts) > 0; // positive for counter-clockwise
  const rings = levels.map((l) => (ccw ? l.pts : [...l.pts].reverse()));
  const mesh = new Mesh();
  const m = rings[0].length;
  const starts = levels.map((l, i) => addRing(mesh, rings[i], l.z));
  for (let i = 0; i < levels.length - 1; i++) addSides(mesh, starts[i], starts[i + 1], m, true);
  const bottom = triangulate(rings[0], []);
  const top = triangulate(rings.at(-1), []);
  const b0 = starts[0], t0 = starts.at(-1);
  for (let t = 0; t < bottom.tris.length; t += 3) mesh.addTri(b0 + bottom.tris[t], b0 + bottom.tris[t + 2], b0 + bottom.tris[t + 1]);
  for (let t = 0; t < top.tris.length; t += 3) mesh.addTri(t0 + top.tris[t], t0 + top.tris[t + 1], t0 + top.tris[t + 2]);
  return mesh;
}

// A rounded-rect ring (outer rect minus inner rect) with a gap cut through its
// front (-y) side, |x - cx| < half: a C shape, as one simple polygon.
export function notchedRing(outer, inner, half, segments) {
  const path = (r) => {
    const c = roundedRect(r, segments); // corners: +x+y, -x+y, -x-y, +x-y
    const k = segments + 1;
    const cy = r.cy ?? 0, cx = r.cx ?? 0;
    return [[cx + half, cy - r.d / 2], ...c.slice(3 * k), ...c.slice(0, 3 * k), [cx - half, cy - r.d / 2]];
  };
  return [...path(outer), ...path(inner).reverse()];
}
