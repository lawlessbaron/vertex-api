// Knobs and handles. Each prints without supports:
//  - knob: a grip knob printed face down, the shaft hole opening upward. It fits
//    a D-shaft (potentiometers, encoders), a round shaft, or holds a bolt head
//    in a hex pocket so the thread comes out of the face (a clamping knob);
//  - pull: a bar drawer pull printed on its side, so the screw holes run level
//    and are teardrops (they bridge cleanly); the screw spacing is yours.
// Every part is a union of closed shells, centred on the origin.
import { Mesh } from './mesh.js';
import { circlePolygon, extrudePolygon } from './polygon.js';

export const KNOB_DEFAULTS = {
  item: 'knob', // knob | pull
  // knob
  diameter: 30,
  height: 16,
  grip: 'fluted', // fluted | knurled | star | smooth
  flutes: 12,
  shaft: 'd', // d | round | bolt
  shaftD: 6, // shaft diameter, mm
  flat: 4.5, // D-shaft: across the flat, mm
  shaftDepth: 10,
  bolt: 'm6', // for shaft: bolt
  pointer: true,
  // pull
  spacing: 96, // screw hole centres, mm (cabinet pulls come in 64, 96, 128, 160…)
  standoff: 28, // how far it stands off the drawer front
  barWidth: 12,
  barDepth: 9,
  overhang: 16, // how far the bar runs past each screw
  screw: 'm4', // m3 | m4 | insertM3 | insertM4
  segments: 96,
};

// Bolt heads: across flats and head height, with the shank diameter.
export const KNOB_BOLTS = { m4: { hex: 7, head: 2.8, d: 4 }, m5: { hex: 8, head: 3.5, d: 5 }, m6: { hex: 10, head: 4, d: 6 }, m8: { hex: 13, head: 5.3, d: 8 } };
// Pull screw holes: radius and depth.
const PULL_HOLES = { m3: { r: 1.35, depth: 10, says: 'M3 screws (2.7 mm pilot holes)' }, m4: { r: 1.7, depth: 12, says: 'M4 screws (3.4 mm pilot holes)' }, insertM3: { r: 2.0, depth: 6, says: 'M3 heat-set inserts (4.0 mm holes, 6 mm deep)' }, insertM4: { r: 2.8, depth: 8, says: 'M4 heat-set inserts (5.6 mm holes, 8 mm deep)' } };

/** The knob's outline at radius R, with its grip and an optional pointer notch. */
export function knobProfile(o, R, n) {
  const pts = [];
  const flutes = Math.max(3, Math.min(40, Math.round(o.flutes)));
  const teeth = Math.max(12, Math.round((2 * Math.PI * R) / 1.6));
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    let r = R;
    if (o.grip === 'fluted') r = R - Math.min(1.8, R * 0.1) * Math.pow((1 + Math.cos(flutes * a)) / 2, 2);
    else if (o.grip === 'knurled') r = R - 0.6 * Math.abs(((teeth * a) / Math.PI) % 2 - 1);
    else if (o.grip === 'star') r = R - R * 0.28 * (0.5 - 0.5 * Math.cos(Math.max(3, Math.min(8, flutes)) * a));
    if (o.pointer && Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.07) r -= Math.min(1.2, R * 0.08);
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
}

const hexagon = (acrossFlats) => { const r = acrossFlats / Math.sqrt(3); return Array.from({ length: 6 }, (_, k) => [r * Math.cos((k * Math.PI) / 3), r * Math.sin((k * Math.PI) / 3)]); };

// A D-shaft hole: the circle cut by a flat at `flat` from the far side.
function dHole(d, flat, n) {
  const r = d / 2 + 0.1, cut = flat + 0.1 - d / 2; // the flat's distance from the centre
  const half = Math.acos(Math.max(-1, Math.min(1, cut / r))); // angle from +y to where the flat meets the circle
  const a0 = Math.PI / 2 + half, a1 = Math.PI / 2 - half + Math.PI * 2;
  const pts = [];
  for (let k = 0; k <= n; k++) { const a = a0 + ((a1 - a0) * k) / n; pts.push([r * Math.cos(a), r * Math.sin(a)]); }
  return pts; // counter-clockwise; the last point to the first is the flat
}

/** Grip knob. → { parts: [{ mesh, name }], notes } */
export function knob(o) {
  const n = Math.max(48, o.segments), R = Math.max(10, o.diameter) / 2, notes = [];
  const H = Math.max(6, o.height), face = Math.min(1, H * 0.1);
  const mesh = new Mesh();
  // The face prints on the bed: a 1 mm step in makes a crisp chamfer-like edge.
  mesh.append(extrudePolygon(knobProfile(o, R - 0.8, n), [], 0, face));
  let name;
  if (o.shaft === 'bolt') {
    const b = KNOB_BOLTS[o.bolt] || KNOB_BOLTS.m6;
    const shank = circlePolygon(0, 0, b.d / 2 + 0.2, 48).reverse();
    const pocket = hexagon(b.hex + 0.3).reverse();
    const floor = Math.max(face + 2, H - b.head - 0.4);
    if (b.hex / 2 + 2 > R * 0.85) notes.push('The bolt head is nearly as wide as the knob: make the knob bigger.');
    mesh.append(extrudePolygon(knobProfile(o, R, n), [shank], face - 0.01, floor));
    mesh.append(extrudePolygon(knobProfile(o, R, n), [pocket], floor - 0.01, H));
    notes.push(`Drop an ${o.bolt.toUpperCase()} bolt in from the top so its head sits in the hex; a drop of glue keeps it there.`);
    name = `clamp-knob-${o.bolt}-${Math.round(R * 2)}mm`;
  } else {
    const d = Math.max(2, o.shaftD);
    const hole = (o.shaft === 'd' ? dHole(d, Math.min(d - 0.5, Math.max(d * 0.5, o.flat)), 64) : circlePolygon(0, 0, d / 2 + 0.1, 64)).reverse();
    const depth = Math.min(H - face - 1.2, Math.max(3, o.shaftDepth));
    if (depth < o.shaftDepth) notes.push(`The knob is too short for a ${o.shaftDepth} mm deep hole: it is ${depth.toFixed(1)} mm.`);
    if (d / 2 + 2 > R * 0.85) notes.push('The shaft is nearly as wide as the knob: make the knob bigger.');
    mesh.append(extrudePolygon(knobProfile(o, R, n), [], face - 0.01, H - depth));
    mesh.append(extrudePolygon(knobProfile(o, R, n), [hole], H - depth - 0.01, H));
    notes.push(o.shaft === 'd' ? 'A snug push fit on the D-shaft. If it’s tight, warm it with a hair dryer and press it on.' : 'A snug push fit. Add a drop of glue if the shaft is smooth.');
    name = `knob-${o.shaft === 'd' ? 'd' : 'round'}${d}mm-${Math.round(R * 2)}mm`;
  }
  return { parts: [{ mesh, name }], notes };
}

// A teardrop in the x-z plane, tip up (+z), so a level hole prints without support.
function teardrop(cx, cz, r, n = 32) {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = -Math.PI / 4 - (k / (n - 1)) * (Math.PI * 1.5); // from 45° round the bottom to 135°
    pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
  }
  pts.push([cx, cz + r * Math.SQRT2]);
  return pts; // clockwise
}

// Extrude an (x, z) polygon along y from y0 to y1.
function extrudeAlongY(outer, holes, y0, y1) {
  const m = extrudePolygon(outer, holes, y0, y1);
  const p = m.positions;
  for (let i = 0; i < p.length; i += 3) [p[i + 1], p[i + 2]] = [p[i + 2], p[i + 1]];
  const ix = m.indices; // swapping two axes mirrors it: flip each triangle back
  for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
  return m;
}

function roundedBar(x0, x1, y0, y1, n = 12) {
  const r = (y1 - y0) / 2, cy = (y0 + y1) / 2, pts = [];
  for (let k = 0; k <= n; k++) { const a = -Math.PI / 2 + (k / n) * Math.PI; pts.push([x1 - r + r * Math.cos(a), cy + r * Math.sin(a)]); }
  for (let k = 0; k <= n; k++) { const a = Math.PI / 2 + (k / n) * Math.PI; pts.push([x0 + r + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return pts;
}

/** Bar drawer pull, on its side: y is out from the drawer, z is up on the bed. */
export function pull(o) {
  const notes = [];
  const S = Math.max(20, o.spacing), T = Math.max(8, o.barWidth), D = Math.max(6, o.barDepth);
  const H = Math.max(D + 10, o.standoff), over = Math.max(D / 2, o.overhang);
  const hole = PULL_HOLES[o.screw] || PULL_HOLES.m4;
  const post = Math.max(2 * hole.r + 5, Math.min(18, T + 2));
  const depth = Math.min(hole.depth, H - D - 1);
  const mesh = new Mesh();
  // The bar, rounded at both ends.
  mesh.append(extrudePolygon(roundedBar(-S / 2 - over, S / 2 + over, H - D, H), [], 0, T));
  for (const cx of [-S / 2, S / 2]) {
    const rect = [[cx - post / 2, 0], [cx + post / 2, 0], [cx + post / 2, T], [cx - post / 2, T]];
    // From the drawer face in: the screw hole, then solid up to the bar.
    mesh.append(extrudeAlongY(rect, [teardrop(cx, T / 2, hole.r)], 0, depth));
    mesh.append(extrudeAlongY(rect, [], depth - 0.01, H - D + 0.01));
  }
  if (2 * hole.r + 3 > T) notes.push('The bar is thin for that screw: make it wider.');
  notes.push(`Prints on its side. Holes ${S} mm apart for ${hole.says}.`);
  return { parts: [{ mesh, name: `drawer-pull-${S}mm` }], notes };
}

export function generateKnobPart(options = {}) {
  const o = { ...KNOB_DEFAULTS, ...options };
  const r = o.item === 'pull' ? pull(o) : knob(o);
  const all = new Mesh();
  for (const p of r.parts) all.append(p.mesh);
  const b = all.bounds(), cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2;
  for (const p of r.parts) p.mesh.translate(-cx, -cy, 0);
  return r;
}
