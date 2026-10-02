// Raised pet bowl stands. A deck with a round hole for each bowl (the bowl
// drops in and hangs by its rim), an apron round the deck and four corner
// legs, at the height that suits the pet. It prints upside down: the deck on
// the bed and the apron and legs standing straight up off it, so nothing
// overhangs. A pet's name can be cut into the deck in front of the bowls.
// Stands too wide for the bed come as one-bowl modules that bolt together
// through slots in their side aprons.
import { Mesh } from './mesh.js';
import { rr, sections } from './slabs.js';
import { textPolygons, textUnits } from './font.js';

export const PETBOWL_DEFAULTS = {
  bowl: 150, // the bowl's outside diameter just under its rim
  bowls: 2,
  height: 100, // floor to the top of the deck
  name: '',
  legs: true, // corner legs under an apron; off for a closed skirt
  bed: 250, // the largest part your printer takes
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const T = 5, WALL = 4, M = 14, LEG = 36, BOLT = 2.25; // deck, walls, margin round each bowl, leg arms, M4 bolts

// A circle as a polygon.
const circle = (cx, cy, r, n = 96) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / n), cy + r * Math.sin((2 * Math.PI * i) / n)]);

// The plan of one piece at print height z (0 is the deck's top face, on the bed).
function piece(o, W, D, holes, bolts, z, d) {
  const { apron, legs, name, mf } = o;
  const f = z < 0.4 ? 0.4 : 0; // the bed face steps in: no elephant's foot
  if (z < T) {
    d.on(rr(f, f, W - f, D - f, 6));
    for (const x of holes) d.off(circle(x, mf + o.r, o.r));
    if (name && z < 0.6) { // cut into the deck's top, reading from the front when it's turned over
      const h = Math.min(11, mf * 0.5), w = (textUnits(name) * h) / 6, s = Math.min(1, (W - 24) / w);
      for (const p of textPolygons(name, (-w * s) / 2, (-h * s) / 2, h * s, Math.max(0.8, h * s * 0.16))) d.off(p.map(([x, y]) => [W / 2 - x, mf / 2 + y]));
    }
    return;
  }
  const ring = () => { d.on(rr(0, 0, W, D, 6)); d.off(rr(WALL, WALL, W - WALL, D - WALL, 3)); };
  if (!legs || z < T + apron) ring();
  else for (const [x, y] of [[0, 0], [W, 0], [0, D], [W, D]]) { // L-shaped corner legs
    const sx = x ? -1 : 1, sy = y ? -1 : 1;
    d.on(rr(Math.min(x, x + sx * LEG), Math.min(y, y + sy * WALL), Math.max(x, x + sx * LEG), Math.max(y, y + sy * WALL)));
    d.on(rr(Math.min(x, x + sx * WALL), Math.min(y, y + sy * LEG), Math.max(x, x + sx * WALL), Math.max(y, y + sy * LEG)));
    d.on(rr(Math.min(x, x + sx * 10), Math.min(y, y + sy * 10), Math.max(x, x + sx * 10), Math.max(y, y + sy * 10), 0)); // a solid corner for a rubber foot
  }
  // Bolt slots up the side aprons from their lower edge (the top of the print): square-ended, so nothing overhangs.
  for (const [side, by, bz] of bolts) if (z > bz - BOLT && z < T + apron) d.off(rr(side ? W - WALL - 1 : -1, by - BOLT, side ? W + 1 : WALL + 1, by + BOLT));
}

export function generatePetBowlStand(options = {}) {
  const o = { ...PETBOWL_DEFAULTS, ...options };
  const bowl = num(o.bowl, 60, 220, 150), n = Math.round(num(o.bowls, 1, 3, 2)), bed = num(o.bed, 150, 400, 250);
  const name = String(o.name || '').slice(0, 16).replace(/[^\x20-\x7e]/g, '').trim();
  const legs = !(o.legs === false || o.legs === 'false');
  const r = (bowl + 1) / 2; // 0.5 mm clear all round
  const mf = name ? Math.max(M, 24) : M; // a wider front margin carries the name
  const D = 2 * r + M + mf;
  const H = num(o.height, 40, bed, 100);
  if (D > bed) throw new Error(`A ${bowl} mm bowl needs a stand ${Math.ceil(D)} mm deep: bigger than your ${bed} mm bed.`);
  const whole = n * 2 * r + (n + 1) * M;
  const modular = whole > bed && n > 1;
  const per = modular ? 1 : n;
  const W = per * 2 * r + (per + 1) * M;
  if (W > bed) throw new Error(`A ${bowl} mm bowl needs a stand ${Math.ceil(W)} mm wide: bigger than your ${bed} mm bed.`);
  const apron = Math.min(30, (H - T) * 0.35);
  const holes = Array.from({ length: per }, (_, i) => M + r + i * (2 * r + M));
  const bz = T + apron / 2;
  const bolts = modular ? [0, 1].flatMap((side) => [D * 0.3, D * 0.7].map((by) => [side, by, bz])) : [];
  const p = { H, apron, legs, name, mf, r };
  const cuts = [0, 0.4, 0.6, T, T + apron, H];
  if (bolts.length) cuts.push(bz - BOLT);
  const mesh = sections([-1, -1, W + 1, D + 1], cuts, (z, d) => piece(p, W, D, holes, bolts, z, d), 0.25, 0.12);
  // Standing: turned over (a half turn about the depth), the front (the name's margin) toward −y.
  const preview = new Mesh();
  const copies = modular ? n : 1;
  for (let c = 0; c < copies; c++) {
    const m = new Mesh(); m.append(mesh);
    const q = m.positions, ox = c * W - (copies * W) / 2;
    for (let i = 0; i < q.length; i += 3) { q[i] = W - q[i] + ox; q[i + 1] -= D / 2; q[i + 2] = H - q[i + 2]; }
    preview.append(m);
  }
  const notes = [
    `${n} bowl${n > 1 ? 's' : ''} of ${bowl} mm in a stand ${H} mm high (the deck top), ${Math.round(modular ? n * W : W)} × ${Math.round(D)} mm.${name ? ` “${name}” is cut into the deck.` : ''}`,
    modular ? `Too wide for one print: make ${n} modules and bolt them side by side with M4 × 12 bolts and nuts through the slots in the side aprons (${2 * (n - 1)} of each).` : 'One piece.',
    'Print it upside down (as it comes), no supports. Stick rubber feet under the corners so it doesn’t slide.',
  ];
  return { parts: [{ mesh, name: modular ? `bowl-module-x${n}` : 'bowl-stand' }], notes, preview, modular, copies };
}
