// Paper towel holders: two brackets and a rod for a kitchen roll, on the wall
// or under a cupboard. The brackets print on their sides (their side profile
// rising off the bed): an arm braced by a gusset, a slot the rod drops
// into (on the wall) or a hole it slides through (under a cupboard), and
// screw holes through the plate cut as diamonds so they bridge nothing. The
// rod is an octagon printed lying on a flat face, so its sloping faces are
// all at 45°; a rod longer than the bed comes in two halves joined by a
// diamond peg. Nothing overhangs.
import { Mesh } from './mesh.js';
import { rr, sections } from './slabs.js';

export const TOWELHOLDER_DEFAULTS = {
  mount: 'wall', // or 'under' (a cupboard)
  roll: 280, // the roll's width
  rollDia: 150, // across, when new
  rod: 22, // across the rod's flats
  rodPrinted: true, // false: use your own dowel this size
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const T = 6, BW = 20, SCREW = 2.4, PEG = 15, BED = 240;
const C8 = Math.cos(Math.PI / 8);

// An octagon rod along x, lying on a flat face: at height z (0..D) it's this wide.
const octWidth = (D, z) => { const s = D * (1 - Math.tan(Math.PI / 8)) / 2; return D - 2 * Math.max(0, s - z, z - (D - s)); };

function rodPiece(len, D, end) {
  // end: 'peg' (a diamond peg past x = len), 'socket' (a diamond hole into x = len), or null.
  const p = D * 0.3, cuts = [0, D];
  for (let z = 0; z <= D; z += 0.25) cuts.push(z);
  const top = end === 'peg' ? len + PEG : len;
  return sections([-1, -D / 2 - 1, top + 1, D / 2 + 1], cuts, (z, d) => {
    const w = octWidth(D, z) / 2, f = z < 0.4 ? 0.4 : 0;
    d.on(rr(0, -w + f, len, w - f, 0));
    const hw = p - Math.abs(z - D / 2); // a diamond across the rod, its point up
    if (end === 'peg' && hw > 0.05) d.on(rr(len - 1, -hw, len + PEG, hw, 0));
    if (end === 'socket' && hw + 0.2 > 0.05) d.off(rr(len - PEG - 1, -hw - 0.2, len + 1, hw + 0.2, 0));
  }, 0.2, 0.06); // straight edges only, and each outline snaps onto them: a coarse grid loses nothing and builds twice as fast
}

export function generateTowelHolder(options = {}) {
  const o = { ...TOWELHOLDER_DEFAULTS, ...options };
  const under = o.mount === 'under', roll = num(o.roll, 150, 350, 280), dia = num(o.rollDia, 80, 220, 150), D = num(o.rod, 12, 32, 22);
  const printed = o.rodPrinted !== false && o.rodPrinted !== 'false';
  const R = dia / 2 + 12; // the rod's centre, out from the wall (or down from the cupboard)
  const rh = D / 2 / C8 + 0.4; // a hole the octagon turns in
  // The bracket's side profile: x out from the wall (or along the cupboard), y up; BW thick as it prints.
  const Hp = 70; // the plate
  let draw, ymin = 0, ymax = Hp, xmax = R + rh + 8;
  const screws = []; // [x, y, axis]: a screw hole through the plate
  if (!under) {
    const yr = Hp - rh - 8; // the rod's height on the bracket
    screws.push([T / 2, 15, 'x'], [T / 2, Hp - 15, 'x']);
    draw = (d) => {
      d.on(rr(0, 0, T, Hp, 1)); // the plate on the wall
      d.on(rr(0, yr - rh - 6, R + rh + 6, yr, 2)); // the arm, up to the rod's middle
      d.on([[T - 0.01, yr - rh - 6.01], [T - 0.01, Math.max(2, yr - rh - 6 - (R * 0.6))], [T + R * 0.6, yr - rh - 6.01]]); // the gusset under it
      d.on(rr(R + rh, yr - 1, R + rh + 6, yr + rh, 2)); // a lip in front, so the rod can't roll off
      d.disc(R, yr, rh, 0); // the slot: round at the bottom…
      d.off(rr(R - rh, yr, R + rh, Hp + 2, 0)); // …open at the top, so the rod lifts in and out
    };
    ymin = Math.min(0, yr - rh - 6 - R * 0.6); ymax = Math.max(Hp, yr + rh);
  } else {
    // Under a cupboard: the plate along the top (y = 0 its face), the arm hanging down, a hole the rod slides through.
    const L = R + rh + 10, yr = -R;
    screws.push([12, -T / 2, 'y'], [L - 12, -T / 2, 'y']);
    const ax = L / 2;
    draw = (d) => {
      d.on(rr(0, -T, L, 0, 1)); // the plate
      d.on(rr(ax - rh - 6, yr - rh - 6, ax + rh + 6, -T + 0.01, 3)); // the arm
      for (const s of [-1, 1]) d.on([[ax + s * (rh + 6), -T + 0.01], [ax + s * (rh + 20), -T + 0.01], [ax + s * (rh + 6), -T - 14]]); // gussets
      d.disc(ax, yr, rh, 0);
    };
    ymin = yr - rh - 7; ymax = 0; xmax = L;
  }
  const cuts = [0, 0.4, BW];
  for (let z = BW / 2 - SCREW - 0.5; z <= BW / 2 + SCREW + 0.5; z += 0.25) cuts.push(z);
  const bracket = sections([-1, ymin - 1, xmax + 1, ymax + 1], cuts, (z, d) => {
    draw(d);
    // Screw holes through the plate, diamonds (the plate's face stands upright as it prints).
    const hw = SCREW - Math.abs(z - BW / 2);
    if (hw > 0.05) for (const [x, y, axis] of screws) d.off(axis === 'x' ? rr(-1, y - hw, T + 1, y + hw, 0) : rr(x - hw, -T - 1, x + hw, 1, 0));
  }, 0.08, 0.04);
  // Two brackets, side by side on the plate.
  const pair = new Mesh(); pair.append(bracket);
  const two = new Mesh(); two.append(bracket);
  const shift = xmax + 8;
  for (let i = 0, q = two.positions; i < q.length; i += 3) q[i] += shift;
  pair.append(two);
  // The rod: through both brackets with 5 mm to spare at each end.
  const rodLen = roll + 2 * BW + 10;
  const parts = [{ mesh: pair, name: 'towel-brackets' }];
  if (printed) {
    if (rodLen <= BED) parts.push({ mesh: rodPiece(rodLen, D, null), name: 'towel-rod' });
    else {
      const half = rodLen / 2;
      if (half + PEG > BED) throw new Error(`A ${roll} mm roll needs a rod ${Math.round(rodLen)} mm long: even in halves, more than the bed.`);
      parts.push({ mesh: rodPiece(half, D, 'peg'), name: 'towel-rod-a' }, { mesh: rodPiece(half, D, 'socket'), name: 'towel-rod-b' });
    }
  }
  // Put together: X along the roll, Y out from the wall, Z up. A bracket's (x, y, z) → (z, x, y), turned about.
  const preview = new Mesh();
  const yRod = under ? -R : Hp - rh - 8;
  for (const at of [0, roll + BW + 4]) {
    const b = new Mesh(); b.append(bracket);
    for (let i = 0, q = b.positions; i < q.length; i += 3) { const x = q[i], y = q[i + 1], z = q[i + 2]; q[i] = z + at; q[i + 1] = x; q[i + 2] = y; }
    preview.append(b);
  }
  if (printed) {
    const r = new Mesh(); r.append(rodPiece(Math.min(rodLen, roll + 2 * BW + 10), D, null));
    const yAt = under ? (R + rh + 10) / 2 : R; // the hole: halfway along an under-cupboard bracket, R out on a wall one
    for (let i = 0, q = r.positions; i < q.length; i += 3) { q[i] -= 5; q[i + 1] += yAt; q[i + 2] += yRod - D / 2; }
    preview.append(r);
  }
  const notes = [
    `Two brackets ${under ? 'for under a cupboard' : 'for the wall'} and ${printed ? `a ${D} mm rod ${Math.round(rodLen)} mm long${rodLen > BED ? ' in two halves' : ''}` : `room for your own ${D} mm dowel, ${Math.round(rodLen)} mm long`}, for rolls up to ${roll} mm wide and ${dia} mm across.`,
    under ? 'Screw the brackets under the cupboard with the roll\'s width between them (pan-head screws, the holes take 4 mm). Slide the rod through one bracket, the roll and the other.' : 'Screw the brackets to the wall with the roll\'s width between them (pan-head screws, the holes take 4 mm). Drop the rod, through the roll, into the slots.',
    `Print the brackets on their sides and the rod lying flat (as they come), no supports.${rodLen > BED && printed ? ' Push the two rod halves together on the peg; a drop of glue keeps them.' : ''}`,
  ];
  return { parts, notes, preview };
}
