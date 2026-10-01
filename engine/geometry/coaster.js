// Coasters: a round, square or hexagonal base with a raised rim to keep drips
// in, and a raised pattern or initials as their own part, to print in a second
// colour. Prints flat.
import { Mesh } from './mesh.js';
import { circlePolygon, extrudePolygon } from './polygon.js';
import { textMesh, textUnits } from './font.js';
import { cleanName } from './keychain.js';

export const COASTER_DEFAULTS = {
  shape: 'round', // round | square | hexagon
  size: 95,
  thickness: 4,
  rim: 1.5, // how far the rim stands above the face
  pattern: 'rings', // none | rings | grid | initials
  initials: 'MM',
  raise: 0.6,
  segments: 96,
};

function outline(shape, R, n) {
  if (shape === 'hexagon') return Array.from({ length: 6 }, (_, k) => { const a = (k / 6) * Math.PI * 2 + Math.PI / 6; return [R * Math.cos(a), R * Math.sin(a)]; });
  if (shape === 'square') {
    const r = Math.min(R * 0.25, 10), h = R - r, pts = [];
    for (const [cx, cy, a0] of [[h, -h, -90], [h, h, 0], [-h, h, 90], [-h, -h, 180]]) for (let k = 0; k <= 8; k++) { const a = ((a0 + (90 * k) / 8) * Math.PI) / 180; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return pts;
  }
  return circlePolygon(0, 0, R, n);
}

// The outline moved in by `d` (a scaled copy: fine for these convex shapes).
const inset = (pts, d, R) => pts.map(([x, y]) => [x * (R - d) / R, y * (R - d) / R]);

export function generateCoaster(options = {}) {
  const o = { ...COASTER_DEFAULTS, ...options };
  const R = Math.max(30, o.size) / 2, T = Math.max(2, o.thickness), rimH = Math.max(0, o.rim), rimW = 2.5, raise = Math.max(0.3, o.raise);
  const n = Math.max(48, Math.round(o.segments)), shape = ['square', 'hexagon'].includes(o.shape) ? o.shape : 'round';
  const out = outline(shape, R, n);
  const body = extrudePolygon(out, [], 0, T);
  if (rimH > 0) body.append(extrudePolygon(out, [inset(out, rimW, R).reverse()], T - 0.01, T + rimH));
  // Patterns stay inside the circle that fits inside the rim.
  const fit = (shape === 'hexagon' ? R * Math.cos(Math.PI / 6) : R) - rimW - 3;
  const pattern = new Mesh();
  if (o.pattern === 'rings') {
    for (let r = fit; r > 4; r -= 6) pattern.append(extrudePolygon(circlePolygon(0, 0, r, n), [circlePolygon(0, 0, r - 1.2, n).reverse()], T - 0.01, T + raise));
  } else if (o.pattern === 'grid') {
    for (const dir of [0, 1]) for (let c = -fit + 4; c < fit - 2; c += 7) {
      const half = Math.sqrt(Math.max(0, fit * fit - c * c));
      if (half < 2) continue;
      const pts = dir ? [[c - 0.6, -half], [c + 0.6, -half], [c + 0.6, half], [c - 0.6, half]] : [[-half, c - 0.6], [half, c - 0.6], [half, c + 0.6], [-half, c + 0.6]];
      pattern.append(extrudePolygon(pts, [], T - 0.01, T + raise));
    }
  } else if (o.pattern === 'initials') {
    const text = cleanName(o.initials).slice(0, 4) || 'MM';
    const h = Math.min(fit * 0.9, (fit * 1.6 * 6) / Math.max(1, textUnits(text)));
    const w = (textUnits(text) * h) / 6;
    pattern.append(textMesh(text, -w / 2, -h / 2, h, T - 0.01, T + raise));
  }
  const parts = [{ mesh: body, name: `coaster-${shape}-${Math.round(2 * R)}mm` }];
  if (pattern.positions.length) parts.push({ mesh: pattern, name: 'coaster-pattern' });
  const notes = [parts.length > 1 ? `Swap filament at ${T} mm for a two-colour pattern, or print it all in one.` : 'Prints flat in one colour.'];
  return { parts, notes };
}
