// Bottle drying racks: bottles, cups and beakers hang upside down on prongs to drain, and an
// optional front row of short pegs takes the lids, teats and straws. The base is a grate (a
// frame with ribs and no floor), so the water runs straight through onto a tea towel, a drip
// tray or the draining board instead of pooling round the prongs. Drawn in plan as slabs and
// printed as it stands: the ribs on the bed, the prongs going straight up, their feet and tips
// narrowing as they rise, so nothing overhangs.
import { rr, sections } from './slabs.js';

export const DRYINGRACK_DEFAULTS = {
  rows: 2, // rows of prongs, front to back
  cols: 3, // prongs in a row
  pitch: 65, // between prongs: a bottle's width, plus room to get a hand round it
  height: 120, // the prongs, above the grate
  dia: 14, // the prongs (a bottle neck slides over it)
  lids: 4, // short pegs along the front for lids and teats (0 for none)
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const BASE = 3, FRAME = 6, RIB_W = 2, RIB_GAP = 4, FOOT_H = 8, LID_ROW = 34, LID_H = 45, LID_D = 8;

export function generateDryingRack(options = {}) {
  const o = { ...DRYINGRACK_DEFAULTS, ...options };
  const rows = Math.round(num(o.rows, 1, 4, 2)), cols = Math.round(num(o.cols, 1, 6, 3)), pitch = num(o.pitch, 35, 110, 65);
  const H = num(o.height, 40, 200, 120), d = num(o.dia, 8, 25, 14), lids = Math.round(num(o.lids, 0, 10, 4));
  const W = cols * pitch, Dp = rows * pitch, D = Dp + (lids ? LID_ROW : 0);
  if (W > 250 || D > 250) throw new Error(`That rack is ${Math.ceil(W)} × ${Math.ceil(D)} mm: bigger than a 250 mm bed. Fewer prongs, less space between them, or two racks.`);
  if (BASE + H > 250) throw new Error('The prongs are taller than a 250 mm printer can print.');
  const r = d / 2, foot = r + 4, tip = Math.min(r * 2.2, H * 0.3), lidPitch = lids ? (W - 2 * FRAME) / lids : 0;
  const prongs = [];
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) prongs.push([-W / 2 + pitch * (i + 0.5), -D / 2 + (lids ? LID_ROW : 0) + pitch * (j + 0.5)]);
  const pegs = Array.from({ length: lids }, (_, i) => [-W / 2 + FRAME + lidPitch * (i + 0.5), -D / 2 + LID_ROW / 2]);
  // A prong's radius at height z: a foot that narrows into the shaft, the shaft, then a rounded tip.
  const prongR = (z, R, top, footR) => {
    if (z >= top) return 0;
    const t = top - Math.min(tip, (top - BASE) * 0.3);
    if (z < BASE + FOOT_H) return R + (footR - R) * (1 - (z - BASE) / FOOT_H);
    if (z > t) { const k = (z - t) / (top - t); return Math.max(1.2, R * Math.sqrt(1 - k * k)); }
    return R;
  };
  const cuts = [0, 0.4, BASE, BASE + LID_H, BASE + H];
  for (let z = BASE; z <= BASE + FOOT_H; z += 1) cuts.push(z);
  for (const top of [BASE + H, ...(lids ? [BASE + LID_H] : [])]) for (let z = top - tip; z < top; z += 1) cuts.push(z);
  const mesh = sections([-W / 2 - 1, -D / 2 - 1, W / 2 + 1, D / 2 + 1], cuts, (z, dr) => {
    if (z < BASE) {
      const f = z < 0.4 ? 0.4 : 0;
      // The grate: a frame, ribs running front to back, and a solid pad under each prong and peg.
      dr.on(rr(-W / 2 + f, -D / 2 + f, W / 2 - f, D / 2 - f, 6));
      dr.off(rr(-W / 2 + FRAME, -D / 2 + FRAME, W / 2 - FRAME, D / 2 - FRAME, 2));
      for (let x = -W / 2 + FRAME + RIB_GAP; x + RIB_W < W / 2 - FRAME; x += RIB_W + RIB_GAP) dr.on(rr(x, -D / 2 + FRAME - 0.01, x + RIB_W, D / 2 - FRAME + 0.01, 0));
      if (lids) dr.on(rr(-W / 2 + FRAME - 0.01, -D / 2 + LID_ROW - 3, W / 2 - FRAME + 0.01, -D / 2 + LID_ROW + 3, 0)); // a cross bar behind the lid row
      for (const [x, y] of prongs) dr.disc(x, y, foot + 2 - f);
      for (const [x, y] of pegs) dr.disc(x, y, LID_D / 2 + 4 - f);
      return;
    }
    for (const [x, y] of prongs) { const pr = prongR(z, r, BASE + H, foot); if (pr > 0) dr.disc(x, y, pr); }
    for (const [x, y] of pegs) { const pr = prongR(z, LID_D / 2, BASE + LID_H, LID_D / 2 + 3); if (pr > 0) dr.disc(x, y, pr); }
  }, 0.25, 0.1);
  const n = rows * cols;
  const notes = [
    `${n} prong${n > 1 ? 's' : ''} ${H} mm tall and ${d} mm thick, ${pitch} mm apart, on a grate ${Math.round(W)} × ${Math.round(D)} mm${lids ? `, with ${lids} short peg${lids > 1 ? 's' : ''} along the front for lids and teats` : ''}.`,
    'Hang bottles and cups upside down over the prongs. The grate has no floor, so stand it on a tea towel, a drip tray or the draining board.',
    'Print it as it comes, grate down, with no supports. PETG or PP takes hot water better than PLA.',
  ];
  return { parts: [{ mesh, name: 'drying-rack' }], notes, preview: mesh };
}
