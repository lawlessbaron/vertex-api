// Screw-top containers: a jar with a real printed thread and its cap. The jar
// prints standing, the cap prints top down, so every overhang is 45° or less:
// the thread's flanks are 45°, the jar narrows to its neck inside at 45°, and
// the thread fades in and out so it never starts with a sharp step.
//
// The thread is a right-hand one (the cap tightens clockwise). The cap's groove
// is the jar's thread moved out by the clearance, everywhere, so it turns on
// freely at any point. Every part is a closed solid, centred on the origin.
import { Mesh } from './mesh.js';
import { circlePolygon, extrudePolygon } from './polygon.js';

export const JAR_DEFAULTS = {
  diameter: 50, // outside, jar and cap
  height: 60, // the jar, without its cap
  wall: 1.6,
  pitch: 3,
  threadLength: 10,
  clearance: 0.4,
  segments: 96,
};

// The thread's radial height across one pitch (u in 0..1): a flat crest, 45°
// flanks (rising `depth` over 0.4 of a pitch, and `depth` = 0.4 × pitch).
export function threadProfile(u, depth) {
  u -= Math.floor(u);
  if (u < 0.4) return depth * (u / 0.4);
  if (u < 0.5) return depth;
  if (u < 0.9) return depth * (1 - (u - 0.5) / 0.4);
  return 0;
}

/**
 * A closed tube through `levels` [{ z, outer: r(θ), inner: r(θ) }], bottom to
 * top: the outer and inner walls, joined by rings at both ends. Two levels at
 * the same height make a flat step.
 */
export function loftTube(levels, n) {
  const mesh = new Mesh(), rings = [];
  for (const L of levels) {
    const o = [], i = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const ro = L.outer(a), ri = L.inner(a);
      o.push(mesh.addVertex(ro * c, ro * s, L.z));
      i.push(mesh.addVertex(ri * c, ri * s, L.z));
    }
    rings.push({ o, i });
  }
  for (let l = 0; l + 1 < rings.length; l++) {
    const b = rings[l], t = rings[l + 1];
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n;
      mesh.addQuad(b.o[k], b.o[k1], t.o[k1], t.o[k]);
      mesh.addQuad(b.i[k], t.i[k], t.i[k1], b.i[k1]);
    }
  }
  const first = rings[0], last = rings[rings.length - 1];
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    mesh.addQuad(first.o[k], first.i[k], first.i[k1], first.o[k1]);
    mesh.addQuad(last.o[k], last.o[k1], last.i[k1], last.i[k]);
  }
  return mesh;
}

/** The sizes the jar and cap share. */
export function jarPlan(options = {}) {
  const o = { ...JAR_DEFAULTS, ...options };
  const R = Math.max(12, o.diameter) / 2, w = Math.max(1.2, o.wall), c = Math.max(0.15, o.clearance);
  const P = Math.max(1.5, Math.min(6, o.pitch)), d = 0.4 * P;
  const capWall = Math.max(1.6, w);
  const major = R - capWall - c; // the jar thread's crests
  const core = major - d; // and its roots
  const bore = core - w; // the jar's opening
  const Ht = Math.max(2 * P, Math.min(o.threadLength, Math.max(10, o.height) * 0.5));
  const H = Math.max(Ht + (R - w - bore) + 6, o.height);
  return { o, R, w, c, P, d, capWall, major, core, bore, Ht, H, n: Math.max(48, Math.round(o.segments)) };
}

export function generateJar(options = {}) {
  const p = jarPlan(options);
  const { R, w, c, P, d, core, bore, Ht, H, n } = p;
  const floor = Math.max(1.2, w), neck0 = H - Ht, step = R - w - bore; // inside, it narrows at 45° over `step`
  const ramp = Math.min(1.5, Ht / 4);
  const amp = (z) => Math.max(0, Math.min(1, (z - neck0) / ramp, (H - z) / ramp));
  const phase = (a, z) => a / (Math.PI * 2) - z / P;
  const k = (r) => () => r;
  // The jar.
  const levels = [
    { z: floor - 0.01, outer: k(R), inner: k(R - w) },
    { z: neck0 - step, outer: k(R), inner: k(R - w) },
    { z: neck0, outer: k(R), inner: k(bore) },
    { z: neck0, outer: k(core), inner: k(bore) }, // the shoulder, a flat step up
  ];
  const dz = P / 10;
  for (let z = neck0 + dz; z < H - 1e-9; z += dz) levels.push({ z, outer: (a) => core + amp(z) * threadProfile(phase(a, z), d), inner: k(bore) });
  levels.push({ z: H, outer: k(core), inner: k(bore) });
  const jar = loftTube(levels, n);
  jar.append(extrudePolygon(circlePolygon(0, 0, R, n), [], 0, floor));
  // The cap, built where it sits screwed on, then turned over to print top down.
  const top = Math.max(1.6, w), skirt0 = neck0 + c; // the cap stops just above the shoulder
  const capLevels = [{ z: skirt0, outer: k(R), inner: k(core + d + c) }];
  for (let z = skirt0 + dz; z < H + c - 1e-9; z += dz) capLevels.push({ z, outer: k(R), inner: (a) => core + c + threadProfile(phase(a, z), d) });
  capLevels.push({ z: H + c, outer: k(R), inner: (a) => core + c + threadProfile(phase(a, H + c), d) });
  capLevels.push({ z: H + c + 0.01, outer: k(R), inner: k(core + c + d) }); // tucked under the top, clear of the thread
  const cap = loftTube(capLevels, n);
  cap.append(extrudePolygon(circlePolygon(0, 0, R, n), [], H + c, H + c + top));
  const capTop = H + c + top, q = cap.positions;
  for (let i = 0; i < q.length; i += 3) { q[i + 1] = -q[i + 1]; q[i + 2] = capTop - q[i + 2]; } // a turn about x: still the right way out
  cap.translate(2 * R + 8, 0, 0);
  for (const m of [jar, cap]) m.translate(-(R + 4), 0, 0);
  const ml = Math.round((Math.PI * (R - w) ** 2 * (neck0 - step - floor) + Math.PI * bore ** 2 * (H - neck0 + step)) / 1000);
  const notes = [`Holds about ${ml} ml. Opening ${(2 * bore).toFixed(1)} mm across.`, `The cap turns on ${Math.round(Ht / P * 10) / 10} times with ${c} mm clearance. Print the cap top down, as it lies.`];
  return { parts: [{ mesh: jar, name: `jar-${Math.round(2 * R)}x${Math.round(H)}` }, { mesh: cap, name: `jar-cap-${Math.round(2 * R)}` }], notes, plan: p, ml };
}
