// Desk cable grommets: a plug for the cable hole in a desk. A sleeve that
// pushes into the hole (crush ribs grip the sides, a flange sits on the desk)
// and a cap that drops into it, with a slot the cables come up through. The
// sleeve prints flange down and the cap top down, so neither needs supports.
import { Mesh } from './mesh.js';
import { rr, sections } from './slabs.js';

export const GROMMET_DEFAULTS = {
  hole: 60, // the desk's hole (mm)
  desk: 25, // how thick the desk is
  flange: 6, // how far the rim lies on the desk
  wall: 2,
  slot: 20, // the cables' slot in the cap
  slots: 1, // 1 or 2 (opposite each other)
  fit: 0.3, // round the cap in the sleeve
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

export function generateGrommet(options = {}) {
  const o = { ...GROMMET_DEFAULTS, ...options };
  const D = num(o.hole, 30, 100, 60), desk = num(o.desk, 10, 50, 25), fl = num(o.flange, 3, 15, 6), t = num(o.wall, 1.2, 4, 2);
  const fit = num(o.fit, 0.1, 0.8, 0.3), slots = Math.round(num(o.slots, 1, 2, 1)), slot = Math.min(num(o.slot, 8, 40, 20), D - 2 * t - 8);
  const R = D / 2, Ro = R + fl, Ri = R - 0.3 - t, ft = 2.4; // Ri: the sleeve's bore
  const tube = Math.max(6, desk - 2);
  // The sleeve: the flange on the bed, the tube standing up from it; six
  // crush ribs on the tube, 0.5 mm proud of the hole, so it pushes in tight.
  const sleeve = sections([-Ro, -Ro, Ro, Ro], [0, 0.4, ft, ft + tube - 2, ft + tube], (z, d) => {
    if (z < ft) d.disc(0, 0, z < 0.4 ? Ro - 0.4 : Ro); // the flange (its bed face steps in)
    else {
      const lead = z > ft + tube - 2 ? 0.6 : 0; // the last 2 mm steps in, so it starts into the hole easily
      d.disc(0, 0, R - 0.3 - lead);
      if (!lead) for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3; d.disc((R - 0.3) * Math.cos(a), (R - 0.3) * Math.sin(a), 0.8); }
    }
    d.disc(0, 0, Ri, 0); // the bore
  }, 0.1);
  // The cap, top down: a disc that sits on the flange, and a ring under it
  // that drops into the bore. The slot runs from its edge to past the middle.
  const Rc = Ri - fit, capT = 2;
  const slotted = (d) => {
    for (let k = 0; k < slots; k++) {
      // One slot runs past the middle; two stop short of it, so the cap stays one piece.
      const inner = slots === 2 ? Math.max(4, Ri * 0.3) : -slot / 2;
      d.off(k ? rr(-slot / 2, -Ro - 1, slot / 2, -inner, slot / 2) : rr(-slot / 2, inner, slot / 2, Ro + 1, slot / 2));
    }
  };
  const cap = sections([-Ro, -Ro, Ro, Ro], [0, 0.4, capT, capT + 6], (z, d) => {
    if (z < capT) d.disc(0, 0, z < 0.4 ? Ro - 0.4 : Ro);
    else { d.disc(0, 0, Rc); d.disc(0, 0, Rc - 1.6, 0); }
    slotted(d);
  }, 0.1);
  const parts = [{ mesh: sleeve, name: 'grommet-sleeve' }, { mesh: new Mesh().append(cap).translate(2 * Ro + 8, 0, 0), name: 'grommet-cap' }];
  // In the desk: the sleeve flange up, the cap in it.
  const preview = new Mesh();
  const flip = (m, dz) => { const c = new Mesh(); c.append(m); const q = c.positions; for (let i = 0; i < q.length; i += 3) { q[i + 1] = -q[i + 1]; q[i + 2] = dz - q[i + 2]; } return c; }; // half a turn about x
  preview.append(flip(sleeve, ft)); preview.append(flip(cap, ft + capT));
  const notes = [
    `A grommet for a ${D} mm hole in a desk ${desk} mm thick: the rim is ${Math.round(2 * Ro)} mm across, with ${slots === 2 ? 'two' : 'a'} ${Math.round(slot)} mm cable slot${slots === 2 ? 's' : ''} in the cap.`,
    'Print the sleeve rim down and the cap top down; no supports. Push the sleeve into the hole (the ribs grip), thread the cables, drop the cap in.',
  ];
  return { parts, notes, preview };
}
