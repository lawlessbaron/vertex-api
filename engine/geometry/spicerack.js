// Spice racks. One profile carried across the rack's width. It prints on its
// side (the profile on the bed), hollow inside with a grid of ribs, so nothing
// needs support and the end walls only bridge the small cells:
//  - shelf: tiered steps, each a jar deep with a lip at the front, so the
//    jars at the back stand higher and every label shows;
//  - drawer: rows of V cradles that hold jars on their sides, lids to the front.
// Profile in (y, z): y from the front (0) to the back, z up.
import { Mesh } from './mesh.js';
import { extrudePolygon, groupLoops, signedArea, simplifyClosed } from './polygon.js';
import { Grid, fillPolygon, offsetMask, traceBinary } from './raster.js';

export const SPICERACK_DEFAULTS = {
  style: 'shelf', // shelf | drawer
  jar: 45, // the jar's diameter
  tiers: 3, // tiers, or rows in a drawer
  width: 200,
  rise: 30, // how much higher each tier stands
  lip: 4,
};

export function spiceProfile(options = {}) {
  const o = { ...SPICERACK_DEFAULTS, ...options };
  const jar = Math.max(20, o.jar), n = Math.max(1, Math.min(6, Math.round(o.tiers)));
  if (o.style === 'drawer') {
    const r0 = jar + 4, b = 4, v = jar * 0.25, pts = [[0, 0], [n * r0, 0], [n * r0, b + v]];
    for (let i = n - 1; i >= 0; i--) pts.push([i * r0 + r0 / 2, b], [i * r0, b + v]);
    return { o, n, jar, pts, depth: n * r0, height: b + v };
  }
  const d = jar + 8, h = Math.max(10, o.rise), lip = Math.max(0, o.lip), pts = [[0, 0], [n * d, 0], [n * d, n * h]];
  for (let i = n - 1; i >= 0; i--) {
    if (lip > 0) pts.push([i * d + 3, (i + 1) * h], [i * d + 3, (i + 1) * h + lip], [i * d, (i + 1) * h + lip]);
    else pts.push([i * d, (i + 1) * h]);
    if (i > 0) pts.push([i * d, i * h]);
  }
  return { o, n, jar, pts, depth: n * d, height: n * h + lip };
}

// Outlines (outer + holes) of a mask, traced.
function traced(g, res) {
  const loops = traceBinary(g).filter((l) => Math.abs(signedArea(l)) > 4 * res * res).map((l) => simplifyClosed(l, res * 0.25));
  return groupLoops(loops);
}

export function generateSpiceRack(options = {}) {
  const p = spiceProfile(options);
  const W = Math.max(40, p.o.width), wall = 2.4, rib = 1.6, cell = 30, cap = 1.6, res = 0.25;
  const prof = p.pts.map((q) => [q[0] - p.depth / 2, q[1]]);
  // The profile, and the same with the inside taken out but for a grid of ribs.
  const g = Grid.covering(-p.depth / 2 - 2, -2, p.depth / 2 + 2, p.height + 2, res);
  fillPolygon(g, signedArea(prof) < 0 ? prof.slice().reverse() : prof);
  const inner = offsetMask(g, -wall / res), shell = g.clone();
  for (let j = 0; j < g.height; j++) for (let i = 0; i < g.width; i++) {
    const k = j * g.width + i;
    if (!inner.data[k]) continue;
    const y = g.x0 + (i + 0.5) * res, z = g.y0 + (j + 0.5) * res;
    const onRib = Math.abs(((y + p.depth / 2) % cell) - cell / 2) > cell / 2 - rib / 2 || Math.abs((z % cell) - cell / 2) > cell / 2 - rib / 2;
    if (!onRib) shell.data[k] = 0;
  }
  // Built lying on its side: profile in (x, y), the width up z. Solid ends, ribbed between.
  const mesh = new Mesh();
  const solid = traced(g, res), ribbed = traced(shell, res);
  for (const q of solid) mesh.append(extrudePolygon(q.outer, q.holes, 0, cap));
  for (const q of ribbed) mesh.append(extrudePolygon(q.outer, q.holes, cap - 0.01, W - cap + 0.01));
  for (const q of solid) mesh.append(extrudePolygon(q.outer, q.holes, W - cap, W));
  // Standing the way it's used, for the preview: (x, y, z) → (z, x, y), a rotation.
  const upright = new Mesh();
  upright.append(mesh);
  const u = upright.positions;
  for (let i = 0; i < u.length; i += 3) { const a = u[i], b = u[i + 1], c = u[i + 2]; u[i] = c - W / 2; u[i + 1] = a; u[i + 2] = b; }
  const per = Math.max(1, Math.floor((W + 2) / (p.jar + 2)));
  const notes = p.o.style === 'drawer'
    ? [`${p.n} rows of ${per} jars lying down, lids to the front: ${p.n * per} jars in a drawer ${Math.round(p.depth)} mm deep and ${Math.round(p.height)} mm tall.`]
    : [`${p.n} tiers of ${per} jars: ${p.n * per} jars, ${Math.round(p.depth)} mm deep and ${Math.round(p.height)} mm tall at the back.`];
  notes.push(`It prints on its side, ${Math.round(W)} mm tall, hollow with ribs inside: no supports and little filament.`);
  return { parts: [{ mesh, name: `spice-rack-${p.o.style}-${p.n}x${per}` }], notes, plan: p, upright };
}
