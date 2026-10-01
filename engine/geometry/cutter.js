// Cookie cutters. Any outline (a built-in shape, or the biggest shape in a
// photo of a drawing) is scaled so its longest side is the size asked for, then
// grown outward into a thin blade and a wider, lower flange to press on. The
// cookie comes out the size and shape of the outline. Printed flange down.
import { Mesh } from './mesh.js';
import { extrudePolygon, groupLoops, signedArea, simplifyClosed } from './polygon.js';
import { Grid, boxBlur, fillHoles, fillPolygon, offsetMask, traceContours } from './raster.js';

export const CUTTER_DEFAULTS = {
  shape: 'heart', // circle | heart | star | square | hexagon | cloud | drawing
  drawing: null, // outlines from a picture: [{ outer, holes }] in a 0–1 box
  size: 70, // the cookie's longest side, mm
  height: 15,
  blade: 0.9,
  flange: 4,
  flangeHeight: 1.6,
};

// Built-in outlines, roughly unit size, counter-clockwise.
export function builtinShape(name, n = 120) {
  const pts = [];
  const polar = (f) => { for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2, r = f(a); pts.push([r * Math.cos(a), r * Math.sin(a)]); } };
  if (name === 'circle') polar(() => 1);
  else if (name === 'star') polar((a) => { const t = ((a / (Math.PI * 2)) * 5 + 0.25) % 1; return 0.45 + 0.55 * Math.abs(1 - 2 * t) ** 1.4; });
  else if (name === 'hexagon') polar((a) => { const s = Math.PI / 3, t = ((a % s) + s) % s - s / 2; return Math.cos(s / 2) / Math.cos(t); });
  else if (name === 'square') polar((a) => { const p = 6, c = Math.abs(Math.cos(a)) ** p, s = Math.abs(Math.sin(a)) ** p; return (c + s) ** (-1 / p); });
  else if (name === 'cloud') polar((a) => 0.82 + 0.18 * Math.abs(Math.sin(3.5 * a)) ** 0.5 * (a > Math.PI ? 0.4 : 1));
  else for (let k = 0; k < n; k++) { const t = (k / n) * Math.PI * 2; pts.push([16 * Math.sin(t) ** 3 / 16, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16]); } // heart
  return signedArea(pts) < 0 ? pts.reverse() : pts;
}

/** The outline in mm, centred, its longest side `size`. Null when there's none. */
export function cutterOutline(o) {
  let pts = null;
  if (o.shape === 'drawing') {
    const groups = Array.isArray(o.drawing) ? o.drawing.filter((g) => g && Array.isArray(g.outer) && g.outer.length >= 3) : [];
    if (!groups.length) return null;
    // The biggest outline in the picture; whatever's inside it is filled in.
    pts = groups.map((g) => g.outer).sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)))[0].map(([x, y]) => [x, y]);
    if (signedArea(pts) < 0) pts.reverse();
  } else pts = builtinShape(o.shape);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const k = Math.max(10, o.size) / Math.max(1e-9, x1 - x0, y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return pts.map(([x, y]) => [(x - cx) * k, (y - cy) * k]);
}

export function generateCutter(options = {}) {
  const o = { ...CUTTER_DEFAULTS, ...options };
  const outline = cutterOutline(o);
  if (!outline) return { parts: [], notes: ['Add a photo of your drawing: a dark outline on white paper works best.'] };
  const blade = Math.max(0.6, o.blade), flange = Math.max(blade, o.flange), H = Math.max(6, o.height), fh = Math.min(H - 2, Math.max(1, o.flangeHeight));
  const res = Math.max(0.1, Math.min(0.25, o.size / 500));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of outline) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const pad = flange + 3;
  const shape = Grid.covering(x0 - pad, y0 - pad, x1 + pad, y1 + pad, res);
  fillPolygon(shape, outline);
  fillHoles(shape);
  // A ring from the outline out by `r`: grown minus the shape itself.
  const ring = (r) => {
    const grown = offsetMask(shape, r / res), g = grown.clone();
    for (let i = 0; i < g.data.length; i++) g.data[i] = grown.data[i] && !shape.data[i] ? 1 : 0;
    const loops = traceContours(boxBlur(g, 1), 0.5).filter((l) => Math.abs(signedArea(l)) > 4 * res * res).map((l) => simplifyClosed(l, res * 0.25));
    return groupLoops(loops);
  };
  const mesh = new Mesh();
  for (const p of ring(blade)) mesh.append(extrudePolygon(p.outer, p.holes, 0, H));
  for (const p of ring(flange)) mesh.append(extrudePolygon(p.outer, p.holes, 0, fh));
  const notes = [`The cookie comes out ${Math.round(x1 - x0)} × ${Math.round(y1 - y0)} mm. Print it flange down; press the thin edge into the dough.`];
  if (o.shape === 'drawing') notes.push('Thin necks in a drawing make a weak cutter: keep parts at least 5 mm wide.');
  return { parts: [{ mesh, name: `cookie-cutter-${o.shape}-${Math.round(o.size)}mm` }], notes, outline };
}
