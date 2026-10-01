// Bag clips. Two arms joined by a springy loop at one end and a hook at the
// other, printed flat and already latched: the hook's lip sits under the lower
// arm's tip with the clearance asked for, and its underside is a ramp so the
// arm snaps up past it when you squeeze the clip shut. Every edge is upright as
// printed, so there's nothing to support.
// Profile in (x, y), extruded up through the clip's width.
import { Mesh } from './mesh.js';
import { extrudePolygon } from './polygon.js';

export const BAGCLIP_DEFAULTS = {
  length: 100, // how wide a bag it closes, mm
  width: 12, // how tall it prints
  thickness: 4, // each arm
  gap: 0.6, // between the arms, for the folded bag
  clearance: 0.4, // round the latch
  ridges: true,
};

const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

export function bagclipProfile(options = {}) {
  const o = { ...BAGCLIP_DEFAULTS, ...options };
  const L = Math.max(30, o.length), t = Math.max(2.4, o.thickness), g = Math.max(0.2, o.gap), c = Math.max(0.2, o.clearance);
  const lipT = Math.max(1.2, t * 0.4), lipLen = Math.max(2.5, t * 0.9);
  const cy = t + g / 2, R = t + g / 2, r = g / 2;
  const polys = [];
  polys.push(rect(-0.01, 0, L, t)); // lower arm
  polys.push(rect(-0.01, t + g, L + c + t, 2 * t + g)); // upper arm, reaching past the lower one's tip
  // The loop: half a ring round the arms' joined end.
  const ring = [], n = 24;
  for (let k = 0; k <= n; k++) { const a = Math.PI / 2 + (k / n) * Math.PI; ring.push([R * Math.cos(a), cy + R * Math.sin(a)]); }
  for (let k = n; k >= 0; k--) { const a = Math.PI / 2 + (k / n) * Math.PI; ring.push([r * Math.cos(a), cy + r * Math.sin(a)]); }
  polys.push(ring);
  polys.push(rect(L + c, -c - lipT, L + c + t, 2 * t + g + 0.01)); // the hook, down past the lower arm
  polys.push([[L - lipLen, -c], [L + c + 0.01, -c - lipT], [L + c + 0.01, -c]]); // its lip, ramped underneath
  // Ridges along the jaws so the bag doesn't slide out.
  if (o.ridges) for (let x = 8; x < L - 6; x += 5) polys.push([[x - 1, t - 0.01], [x + 1, t - 0.01], [x, t + Math.min(0.5, g * 0.8)]]);
  return { o, L, t, g, c, polys, lipT };
}

export function generateBagclip(options = {}) {
  const p = bagclipProfile(options);
  const W = Math.max(6, p.o.width), mesh = new Mesh();
  for (const poly of p.polys) mesh.append(extrudePolygon(poly, [], 0, W));
  const b = mesh.bounds();
  mesh.translate(-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2, 0);
  const notes = [`Closes a bag up to ${Math.round(p.L)} mm wide. It prints latched: squeeze the hook outward to open it, and press the arms together to snap it shut.`];
  return { parts: [{ mesh, name: `bag-clip-${Math.round(p.L)}mm` }], notes, plan: p };
}
