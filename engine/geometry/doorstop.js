// Door wedges and stops: a wedge sized to the gap under your door, with
// teeth underneath that bite the floor and a hole to hang it up by; and a
// wall stop that screws to the wall or skirting where the handle would hit.
// The wedge prints on its side (its side profile, teeth and all, rising
// straight off the bed); the stop prints upright on the face that meets the
// wall, its screw hole counterbored from the front and its front edge
// chamfered in at 45°. Nothing overhangs in either.
import { Mesh } from './mesh.js';
import { sections } from './slabs.js';

export const DOORSTOP_DEFAULTS = {
  gap: 10, // under the door
  length: 120, // the wedge
  width: 35, // and across
  stop: 30, // how far the wall stop stands off the wall
  stopDia: 30,
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const TIP = 2, TOOTH = 1.2, PERIOD = 4, SCREW = 2.2, HEAD = 4.6, BORE = 6, CH = 2;

export function generateDoorStop(options = {}) {
  const o = { ...DOORSTOP_DEFAULTS, ...options };
  const gap = num(o.gap, 3, 40, 10), L = num(o.length, 70, 200, 120), W = num(o.width, 20, 60, 35);
  const Hs = num(o.stop, 15, 80, 30), Rs = num(o.stopDia, 20, 50, 30) / 2;
  // The wedge's side: from a thin tip up to well past the gap, so it jams wherever the door edge lands.
  const Ht = Math.max(gap + 8, gap * 1.6);
  const profile = [[0, 0], [L, 0], [L, Ht], [0, TIP]];
  const hole = Ht >= 14 ? { x: L - 4 - Ht * 0.35, y: Ht * 0.45, r: Math.min(5, Ht * 0.2) } : null;
  const wedge = sections([-1, -1, L + 1, Ht + 1], [0, 0.4, W], (z, d) => {
    d.on(profile);
    // Teeth along the underside: each a ramp leaning toward the tip, so it slides in and bites when the door pushes.
    for (let x = 8; x + PERIOD < L - 6; x += PERIOD) d.off([[x, -1], [x + PERIOD, -1], [x + PERIOD, TOOTH]]);
    if (hole) d.disc(hole.x, hole.y, hole.r, 0);
  }, 0.08, 0.04);
  // The wall stop: a round boss, its front edge chamfered, a screw hole counterbored deep enough that the door meets plastic, not the screw.
  const cuts = [0, 0.4, Hs - BORE, Hs - CH, Hs];
  for (let z = Hs - CH; z <= Hs; z += 0.25) cuts.push(z);
  const stop = sections([-Rs - 1, -Rs - 1, Rs + 1, Rs + 1], cuts, (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    d.disc(0, 0, Rs - f - Math.max(0, z - (Hs - CH)));
    d.disc(0, 0, z < Hs - BORE ? SCREW : HEAD, 0);
  }, 0.06, 0.03);
  // Together: the wedge lying as it's used (a turn of 90° about its length), the stop beside it.
  const preview = new Mesh();
  const w = new Mesh(); w.append(wedge);
  for (let i = 0, q = w.positions; i < q.length; i += 3) { const y = q[i + 1], zz = q[i + 2]; q[i + 1] = W - zz; q[i + 2] = y; }
  preview.append(w);
  const s = new Mesh(); s.append(stop);
  for (let i = 0, q = s.positions; i < q.length; i += 3) { q[i] += L + Rs + 20; q[i + 1] += W / 2; }
  preview.append(s);
  const notes = [
    `A wedge ${L} mm long and ${W} mm wide, rising from ${TIP} to ${Math.round(Ht)} mm for a ${gap} mm gap under the door, and a wall stop ${Rs * 2} mm across standing ${Hs} mm off the wall.`,
    'Push the wedge under the door thin end first; the teeth underneath bite the floor. Screw the stop to the wall or skirting where the handle would hit (a 4 mm screw, its head sinks into the stop), and stick a felt or rubber pad on its face if you like it quiet.',
    'Print the wedge on its side and the stop face down (both as they come), no supports. TPU makes a grippier wedge.',
  ];
  return { parts: [{ mesh: wedge, name: 'door-wedge' }, { mesh: stop, name: 'wall-stop' }], notes, preview };
}
