// Plant pots and drip trays. The pot flares out to the top (never more than
// 30°, so it prints without support), smooth, fluted or faceted, with drainage
// holes in its floor; the tray is a shallow dish a little wider than the pot's
// foot, with ribs to lift the pot so it drains. Lofted ring by ring (loftTube).
import { Mesh } from './mesh.js';
import { circlePolygon, extrudePolygon } from './polygon.js';
import { loftTube } from './jar.js';
import { box } from './primitives.js';

export const PLANTER_DEFAULTS = {
  diameter: 100, // outside at the top
  height: 90,
  taper: 8, // the side's lean outward, degrees from upright
  wall: 2,
  style: 'smooth', // smooth | fluted | faceted
  facets: 8,
  holes: 5,
  tray: true,
  segments: 96,
};

/** The pot's outside radius at angle a, for a circle of radius r. */
function outline(style, r, a, facets) {
  if (style === 'fluted') return r - Math.min(3, r * 0.06) * (0.5 - 0.5 * Math.cos(facets * 2 * a));
  if (style === 'faceted') { const s = (Math.PI * 2) / facets, t = ((a % s) + s) % s - s / 2; return (r * Math.cos(s / 2)) / Math.cos(t); }
  return r;
}

export function generatePlanter(options = {}) {
  const o = { ...PLANTER_DEFAULTS, ...options };
  const R = Math.max(20, o.diameter) / 2, H = Math.max(20, o.height), w = Math.max(1.2, o.wall);
  const taper = (Math.max(0, Math.min(30, o.taper)) * Math.PI) / 180;
  const rb = Math.max(R * 0.4, R - H * Math.tan(taper)); // the foot
  const n = Math.max(48, Math.round(o.segments)), facets = Math.max(5, Math.min(24, Math.round(o.facets)));
  const style = ['fluted', 'faceted'].includes(o.style) ? o.style : 'smooth';
  const floor = Math.max(2, w * 1.2);
  // How far in the outline dips at most: the inside stays a circle clear of it.
  const dip = (r) => (style === 'fluted' ? Math.min(3, r * 0.06) : style === 'faceted' ? r * (1 - Math.cos(Math.PI / facets)) : 0);
  const at = (z) => rb + (R - rb) * (z / H);
  const levels = [];
  for (const z of [floor - 0.01, H]) levels.push({ z, outer: (a) => outline(style, at(z), a, facets), inner: () => at(z) - dip(at(z)) - w });
  const pot = loftTube(levels, n);
  // The floor, with drainage holes: one in the middle and the rest round it.
  const holeR = Math.min(5, rb * 0.12), k = Math.max(0, Math.min(12, Math.round(o.holes)));
  const holes = [];
  if (k >= 1) holes.push(circlePolygon(0, 0, holeR, 24).reverse());
  for (let i = 1; i < k; i++) { const a = ((i - 1) / (k - 1)) * Math.PI * 2; holes.push(circlePolygon(Math.cos(a) * rb * 0.55, Math.sin(a) * rb * 0.55, holeR, 24).reverse()); }
  const footOutline = Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2, r = outline(style, rb, a, facets); return [r * Math.cos(a), r * Math.sin(a)]; });
  pot.append(extrudePolygon(footOutline, holes, 0, floor));
  const parts = [{ mesh: pot, name: `plant-pot-${Math.round(2 * R)}x${Math.round(H)}` }];
  const notes = [`About ${Math.round((Math.PI * H * ((at(0) - w) ** 2 + (at(0) - w) * (R - w) + (R - w) ** 2)) / 3 / 1000)} ml of soil. ${k} drainage hole${k === 1 ? '' : 's'}.`];
  if (o.tray) {
    // The tray: a dish a little wider than the foot, with ribs the pot stands on.
    const tr = rb + 6, th = Math.min(18, Math.max(10, H * 0.15)), tw = Math.max(1.6, w * 0.8);
    const tray = loftTube([{ z: 1.2 - 0.01, outer: () => tr + tw, inner: () => tr }, { z: th, outer: () => tr + tw + th * 0.25, inner: () => tr + th * 0.25 }], n);
    tray.append(extrudePolygon(circlePolygon(0, 0, tr + tw, n), [], 0, 1.2));
    for (let i = 0; i < 3; i++) {
      const rib = box(-rb * 0.5, -1.5, 1.19, rb * 0.5, 1.5, 4.2), p = rib.positions, a = (i * Math.PI) / 3;
      for (let j = 0; j < p.length; j += 3) { const x = p[j], y = p[j + 1]; p[j] = x * Math.cos(a) - y * Math.sin(a); p[j + 1] = x * Math.sin(a) + y * Math.cos(a); }
      tray.append(rib);
    }
    tray.translate(R + tr + tw + th * 0.25 + 10, 0, 0);
    parts.push({ mesh: tray, name: `drip-tray-${Math.round(2 * (tr + tw))}` });
    notes.push('The pot stands on the tray’s ribs, so water drains out underneath.');
  }
  const all = new Mesh();
  for (const p of parts) all.append(p.mesh);
  const b = all.bounds();
  for (const p of parts) p.mesh.translate(-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2, 0);
  return { parts, notes, plan: { R, rb, H, taper } };
}
