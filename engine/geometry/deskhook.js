// Desk hooks for headphones and bags. The side profile is extruded across the
// hook's width and it prints on its side, so nothing needs support:
//  - clamp: a C that slides over the desk's edge (its thickness plus a little),
//    with the hook hanging below;
//  - screw: a plate screwed to the underside of the desk, the hook hanging
//    from its front edge. The screw holes print as teardrops.
// Use frame: the desk edge at y = 0 (desk at y < 0), its underside at z = 0.
import { Mesh } from './mesh.js';
import { extrudePolygon } from './polygon.js';

export const DESKHOOK_DEFAULTS = {
  item: 'clamp', // clamp | screw
  desk: 25, // the desk's thickness, mm
  reach: 40, // how far it reaches in over and under the desk
  drop: 30, // how far below the desk the hook hangs
  hook: 30, // the hook's depth, out from the desk
  lip: 12,
  width: 25,
  wall: 5,
  clearance: 0.6,
};

function alongX(outer, holes, x0, x1) {
  const m = extrudePolygon(outer, holes, x0, x1);
  const p = m.positions;
  for (let i = 0; i < p.length; i += 3) { const u = p[i], v = p[i + 1], w = p[i + 2]; p[i] = w; p[i + 1] = u; p[i + 2] = v; }
  return m;
}

/** The side profile, counter-clockwise in (y, z). */
export function hookProfile(options = {}) {
  const o = { ...DESKHOOK_DEFAULTS, ...options };
  const w = Math.max(3, o.wall), c = Math.max(0.2, o.clearance), T = Math.max(5, o.desk);
  const reach = Math.max(2 * w, o.reach), drop = Math.max(w + 5, o.drop), L = Math.max(2 * w, o.hook), lip = Math.max(w, o.lip);
  const clamp = o.item !== 'screw';
  const s0 = clamp ? c : 0, s1 = s0 + w; // the spine, outside the desk's edge
  const top = clamp ? -c - w : 0; // where the hook's spine starts
  const zb = top - drop; // the hook's bar
  const hookPart = [[s1, zb + w], [s1 + L - w, zb + w], [s1 + L - w, zb + lip], [s1 + L, zb + lip], [s1 + L, zb], [s0, zb]];
  let cw;
  if (clamp) cw = [[-reach, T + c + w], [s1, T + c + w], ...hookPart, [s0, -c - w], [-reach, -c - w], [-reach, -c], [s0, -c], [s0, T + c], [-reach, T + c]];
  else cw = [[s0, 0.01], [s1, 0.01], ...hookPart];
  return { o, w, c, T, reach, drop, profile: cw.reverse(), zb, s1, L };
}

export function generateDeskHook(options = {}) {
  const pr = hookProfile(options), { o, w, reach } = pr;
  const W = Math.max(10, o.width), mesh = new Mesh();
  mesh.append(alongX(pr.profile, [], -W / 2, W / 2));
  const notes = [];
  if (o.item === 'screw') {
    // The plate under the desk, with screw holes as teardrops pointing the way
    // it prints (−x becomes up).
    const plateD = Math.max(reach, 3 * w), y0 = -plateD, y1 = w;
    const holes = (W >= 30 ? [-W / 4, W / 4] : [0]).map((x) => {
      const r = 2.1, pts = [], cy = y0 / 2;
      for (let k = 0; k < 24; k++) { const a = Math.PI * 1.25 + (k / 23) * Math.PI * 1.5; pts.push([x + r * Math.cos(a), cy + r * Math.sin(a)]); }
      pts.push([x - r * Math.SQRT2, cy]); // the tip, towards −x
      return pts.reverse(); // clockwise: a hole
    });
    mesh.append(extrudePolygon([[-W / 2, y0], [W / 2, y0], [W / 2, y1], [-W / 2, y1]], holes, -w, 0));
    notes.push(`Screw it under the desk with ${holes.length} wood screws up to 4 mm.`);
  } else {
    notes.push(`Slides over a desk up to ${pr.T} mm thick. A strip of rubber or felt inside stops it sliding.`);
  }
  // On its side to print: (x, y, z) → (z, y, −x), a rotation.
  const p = mesh.positions;
  for (let i = 0; i < p.length; i += 3) { const x = p[i], z = p[i + 2]; p[i] = z; p[i + 2] = -x; }
  const b = mesh.bounds();
  mesh.translate(-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2, -b.min[2]);
  notes.push(`Prints on its side, ${Math.round(W)} mm tall.`);
  return { parts: [{ mesh, name: `desk-hook-${o.item}-${Math.round(o.desk)}mm` }], notes, plan: pr };
}
