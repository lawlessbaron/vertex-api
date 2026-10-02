// Broom and mop holders. A wall strip with one or more C-clips that a handle
// snaps into: each clip wraps about 260° of the handle, with flared lips that
// guide it in, so the arms spring apart and close round it. Printed lying on
// its side (the clip profile on the bed), so nothing needs support; the screw
// holes run sideways through the strip and print as teardrops.
// Frame: the wall is y = 0 (holder at y > 0), the clip profile in (x, y), its
// height up z.
import { Mesh } from './mesh.js';
import { extrudePolygon, groupLoops, signedArea, simplifyClosed } from './polygon.js';
import { Grid, fillCircle, fillPolygon, traceBinary } from './raster.js';

export const BROOMHOLDER_DEFAULTS = {
  handle: 25, // the handle's diameter, mm
  clips: 3,
  height: 25, // how tall each clip is (the strip too)
  wall: 3.5, // the clip's arms
  plate: 4, // the strip's thickness
  screw: 4.5,
};

const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

// A teardrop in (u, v) round (cu, cv), its point towards +u, counter-clockwise.
function teardrop(cu, cv, r, n = 24) {
  const pts = [[cu + r * Math.SQRT2, cv]];
  for (let k = 0; k <= n; k++) { const a = Math.PI / 4 + (k / n) * 1.5 * Math.PI; pts.push([cu + r * Math.cos(a), cv + r * Math.sin(a)]); }
  return pts;
}

export function broomPlan(options = {}) {
  const o = { ...BROOMHOLDER_DEFAULTS, ...options };
  const r = Math.max(5, o.handle / 2), w = Math.max(2, o.wall), t = Math.max(3, o.plate), n = Math.max(1, Math.min(8, Math.round(o.clips)));
  const gapHalf = (50 * Math.PI) / 180; // the opening: ±50° about straight out
  const spacing = 2 * (r + w) + 16, span = (n - 1) * spacing;
  const centres = Array.from({ length: n }, (_, i) => -span / 2 + i * spacing);
  const cy = t + r + w - 1; // each clip's centre, its back sunk 1 mm into the strip
  const holes = [-span / 2 - spacing / 2, ...centres.slice(1).map((x) => x - spacing / 2), span / 2 + spacing / 2];
  return { o, r, w, t, n, gapHalf, spacing, centres, cy, holes, W: span + spacing + 20, H: Math.max(12, o.height) }; // the end holes sit 10 mm in from each end
}

export function generateBroomHolder(options = {}) {
  const p = broomPlan(options);
  const { r, w, t, cy, H } = p;
  const res = 0.1, R = r + w;
  // The clips' profile, unioned on a raster: an arc of ring with a round lip at each end.
  const g = Grid.covering(-p.W / 2 - 2, t - 2, p.W / 2 + 2, cy + R + w + 2, res);
  for (const cx of p.centres) {
    const ring = [], a0 = Math.PI / 2 + p.gapHalf, a1 = Math.PI / 2 - p.gapHalf + 2 * Math.PI, m = 96;
    for (let k = 0; k <= m; k++) { const a = a0 + ((a1 - a0) * k) / m; ring.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
    for (let k = m; k >= 0; k--) { const a = a0 + ((a1 - a0) * k) / m; ring.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    fillPolygon(g, ring);
    for (const a of [a0, a1]) fillCircle(g, cx + (r + w / 2) * Math.cos(a), cy + (r + w / 2) * Math.sin(a), w * 0.75);
    fillPolygon(g, rect(cx - R * 0.6, t - 1, cx + R * 0.6, cy - r * 0.6)); // a web to the strip
  }
  // Keep the handle's space clear of the web.
  for (let j = 0; j < g.height; j++) for (let i = 0; i < g.width; i++) {
    const x = g.x0 + (i + 0.5) * res, y = g.y0 + (j + 0.5) * res;
    for (const cx of p.centres) if (Math.hypot(x - cx, y - cy) < r) g.data[j * g.width + i] = 0;
  }
  const loops = traceBinary(g).filter((l) => Math.abs(signedArea(l)) > 4 * res * res).map((l) => simplifyClosed(l, res * 0.25));
  const mesh = new Mesh();
  for (const q of groupLoops(loops)) mesh.append(extrudePolygon(q.outer, q.holes, 0, H));
  // The strip: an outline in (z, x) extruded along y through its thickness, with
  // teardrop screw holes pointing up z (a rotation of extrudePolygon's frame).
  const hr = Math.max(1.5, p.o.screw / 2 + 0.2);
  const strip = extrudePolygon(rect(0, -p.W / 2, H, p.W / 2), p.holes.map((x) => teardrop(H / 2, x, hr).reverse()), 0, t);
  const s = strip.positions;
  for (let i = 0; i < s.length; i += 3) { const u = s[i], v = s[i + 1], z = s[i + 2]; s[i] = v; s[i + 1] = z; s[i + 2] = u; }
  mesh.append(strip);
  const notes = [
    `${p.n} clip${p.n > 1 ? 's' : ''} for handles ${Math.round(2 * r * 0.9)}–${Math.round(2 * r)} mm across, ${Math.round(p.W)} mm long with ${p.holes.length} screw holes. Push the handle in: the arms spring round it.`,
    'Print it lying on its side, as it comes. PETG springs best; PLA works but can crack if forced.',
  ];
  return { parts: [{ mesh, name: `broom-holder-${p.n}x${Math.round(2 * r)}mm` }], notes, plan: p };
}
