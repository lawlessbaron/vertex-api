// Spool and dry-box parts. Each prints flat with no supports:
//  - hub: an adapter that fits a spool's bore onto a rod or a 608 bearing,
//    with a flange that keeps it from pushing through;
//  - pod: a slotted desiccant pod and its lid, to sit in a dry box;
//  - feed: a feed-through for a dry-box wall (PTFE tube or a PC4-M10 fitting),
//    with a ring that clamps it from the inside.
// Every part is a union of closed shells, centred on the origin.
import { Mesh } from './mesh.js';
import { circlePolygon, extrudePolygon } from './polygon.js';

export const SPOOL_DEFAULTS = {
  item: 'hub', // hub | pod | feed
  // hub
  bore: 55, // the spool's centre hole, mm (Bambu 54-56, many cardboard spools 52-53, some 73)
  depth: 10, // how far it goes into the spool
  axle: 'rod', // rod | bearing608
  rod: 8, // rod diameter, mm
  // pod
  podDiameter: 50,
  podHeight: 40,
  slots: 16,
  // feed
  wall: 4, // dry-box wall thickness, mm
  feedFor: 'ptfe', // ptfe (4 mm tube) | pc4 (PC4-M10 push fitting, tapped by the fitting)
  segments: 64,
};

const ring = (r0, r1, z0, z1, n) => extrudePolygon(circlePolygon(0, 0, r1, n), [circlePolygon(0, 0, r0, n).reverse()], z0, z1);
const disc = (r, z0, z1, n) => extrudePolygon(circlePolygon(0, 0, r, n), [], z0, z1);

// An annular sector from angle a0 to a1 (radians), as a polygon.
function sector(r0, r1, a0, a1, n = 8) {
  const pts = [];
  for (let k = 0; k <= n; k++) { const a = a0 + ((a1 - a0) * k) / n; pts.push([r1 * Math.cos(a), r1 * Math.sin(a)]); }
  for (let k = n; k >= 0; k--) { const a = a0 + ((a1 - a0) * k) / n; pts.push([r0 * Math.cos(a), r0 * Math.sin(a)]); }
  return pts;
}

/** Spool hub adapter. → { parts: [{ mesh, name }], notes } */
export function spoolHub(o) {
  const n = o.segments, notes = [];
  const fit = Math.max(20, o.bore) / 2 - 0.25; // a slip fit in the bore
  const flange = fit + 5, flangeH = 2.4, depth = Math.max(4, o.depth);
  const inner = o.axle === 'bearing608' ? 11.05 : Math.max(2, o.rod / 2 + 0.25);
  if (inner > fit - 2) notes.push('The axle is nearly as big as the spool’s bore: the walls are very thin. Check the sizes.');
  const mesh = new Mesh();
  if (o.axle === 'bearing608') {
    // A lip at the bottom stops the bearing; the bearing (22 × 7 mm) sits in the top.
    mesh.append(ring(9.5, flange, 0, flangeH, n));
    mesh.append(ring(inner, flange, flangeH - 0.01, flangeH + 0.6, n));
    mesh.append(ring(inner, fit, flangeH + 0.6 - 0.01, flangeH + depth, n));
    if (depth + 0.6 < 7) notes.push('A 608 bearing is 7 mm deep: make it go at least 7 mm into the spool.');
  } else {
    mesh.append(ring(inner, flange, 0, flangeH, n));
    mesh.append(ring(inner, fit, flangeH - 0.01, flangeH + depth - 1, n));
  }
  // A 1 mm lead-in so it finds the bore.
  mesh.append(ring(inner, fit - 0.8, flangeH + depth - 1 - 0.01, flangeH + depth, n));
  return { parts: [{ mesh, name: `spool-hub-${Math.round(o.bore)}mm-${o.axle === 'bearing608' ? '608' : `rod${o.rod}`}` }], notes };
}

/** Slotted desiccant pod and its lid. */
export function desiccantPod(o) {
  const n = o.segments, R = Math.max(20, o.podDiameter) / 2, H = Math.max(15, o.podHeight), t = 1.6, floor = 1.2;
  const pod = new Mesh();
  pod.append(disc(R, 0, floor, n));
  pod.append(ring(R - t, R, floor - 0.01, floor + 3, n)); // solid band at the bottom
  const slots = Math.max(6, Math.min(48, Math.round(o.slots))), step = (Math.PI * 2) / slots, gap = Math.min(step * 0.45, 2 / R);
  for (let k = 0; k < slots; k++) pod.append(extrudePolygon(sector(R - t, R, k * step + gap / 2, (k + 1) * step - gap / 2), [], floor + 3 - 0.01, H - 3));
  pod.append(ring(R - t, R, H - 3 - 0.01, H, n)); // solid band at the top
  // Lid: a plate with small vent holes and a lip that fits inside the pod.
  const lid = new Mesh();
  const vents = [];
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; vents.push(circlePolygon(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, 1.6, 16).reverse()); }
  vents.push(circlePolygon(0, 0, 1.6, 16).reverse());
  lid.append(extrudePolygon(circlePolygon(0, 0, R, n), vents, 0, 1.6));
  lid.append(ring(R - t - 0.25 - 1.2, R - t - 0.25, 1.6 - 0.01, 1.6 + 4, n));
  lid.translate(R * 2 + 6, 0, 0);
  return { parts: [{ mesh: pod, name: `desiccant-pod-${Math.round(R * 2)}x${Math.round(H)}` }, { mesh: lid, name: 'desiccant-pod-lid' }], notes: ['Fill with silica gel beads; the slots are narrow enough to keep them in.'] };
}

/** Dry-box feed-through and its clamp ring. */
export function feedThrough(o) {
  const n = o.segments, wall = Math.max(1, o.wall);
  const bore = o.feedFor === 'pc4' ? 4.4 : 2.1; // PC4-M10 fittings cut their own thread in 8.8 mm; PTFE 4 mm OD slides through 4.2 mm
  const barrel = o.feedFor === 'pc4' ? 7 : 4.5;
  const bodyBore = o.feedFor === 'pc4' ? 4.4 : bore;
  const sleeve = new Mesh();
  sleeve.append(ring(bodyBore, barrel + 5, 0, 2.4, n)); // flange outside the box
  sleeve.append(ring(bodyBore, barrel, 2.4 - 0.01, 2.4 + wall + 3, n)); // through the wall, 3 mm to spare
  const clamp = ring(barrel + 0.15, barrel + 4.5, 0, 3, n).translate((barrel + 5) * 2 + 6, 0, 0);
  const notes = [`Drill a ${(barrel * 2 + 0.4).toFixed(1)} mm hole in the box wall. Push the sleeve through from outside and press the clamp ring on from inside.`];
  if (o.feedFor === 'pc4') notes.push('Screw a PC4-M10 fitting into the 8.8 mm bore: it cuts its own thread.');
  return { parts: [{ mesh: sleeve, name: `feed-through-${o.feedFor}-${wall}mm-wall` }, { mesh: clamp, name: 'feed-through-clamp' }], notes };
}

export function generateSpoolPart(options = {}) {
  const o = { ...SPOOL_DEFAULTS, ...options };
  const r = o.item === 'pod' ? desiccantPod(o) : o.item === 'feed' ? feedThrough(o) : spoolHub(o);
  // Centre the plate on the origin.
  const all = new Mesh();
  for (const p of r.parts) all.append(p.mesh);
  const b = all.bounds(), cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2;
  for (const p of r.parts) p.mesh.translate(-cx, -cy, 0);
  return r;
}
