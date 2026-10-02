// Pill organisers: a box with a compartment for every day (or morning and
// evening), each compartment's floor curving up into its walls so pills scoop
// out, and a lid for each that pushes in, its day's letter on top. The box
// prints upright. The lids print top down: a plate on the bed with a plug
// rising off it that pushes into its compartment, and the day's letter cut
// into the bed face, mirrored so it reads the right way round on top. Nothing
// overhangs in either.
import { textPolygons, textUnits } from './font.js';
import { rr, sections } from './slabs.js';

export const PILLBOX_DEFAULTS = {
  days: 7,
  rows: 1, // 2 for morning and evening
  cell: 28, // each compartment, across
  depth: 22, // and how deep
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const WALL = 1.8, FLOOR = 1.6, LID = 1.6, PLUG = 3, PLAY = 0.25, SCOOP = 6, ETCH = 0.6;
const DAY = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function generatePillBox(options = {}) {
  const o = { ...PILLBOX_DEFAULTS, ...options };
  const days = Math.round(num(o.days, 1, 7, 7)), rows = Math.round(num(o.rows, 1, 2, 1)), c = num(o.cell, 15, 45, 28), h = num(o.depth, 10, 40, 22);
  const W = days * c + (days + 1) * WALL, D = rows * c + (rows + 1) * WALL, H = FLOOR + h;
  if (W > 250) throw new Error(`${days} compartments ${c} mm wide make a box ${Math.ceil(W)} mm long: more than a 250 mm bed.`);
  const cells = [];
  for (let i = 0; i < days; i++) for (let j = 0; j < rows; j++) cells.push({ x0: -W / 2 + WALL + i * (c + WALL), y0: -D / 2 + WALL + j * (c + WALL), day: DAY[(i + 7) % 7], row: j });
  const cuts = [0, 0.4, FLOOR, H];
  for (let k = 1; k <= 6; k++) cuts.push(FLOOR + (SCOOP * k) / 6);
  const box = sections([-W / 2 - 1, -D / 2 - 1, W / 2 + 1, D / 2 + 1], cuts, (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    d.on(rr(-W / 2 + f, -D / 2 + f, W / 2 - f, D / 2 - f, 4));
    if (z < FLOOR) return;
    const s = Math.min(SCOOP, z - FLOOR), k = SCOOP - Math.sqrt(Math.max(0, SCOOP * SCOOP - (SCOOP - s) * (SCOOP - s)));
    for (const { x0, y0 } of cells) d.off(rr(x0 + k, y0 + k, x0 + c - k, y0 + c - k, Math.max(1, Math.min(SCOOP, c / 2 - k - 0.5))));
  }, 0.12, 0.06);
  // The lids, laid out in a row (or two) on the bed, a little apart.
  const pitch = c + WALL + 4, LW = days * pitch, LD = rows * pitch;
  const lids = cells.map((cl, n) => ({ ...cl, cx: -LW / 2 + pitch * (Math.floor(n / rows) + 0.5), cy: -LD / 2 + pitch * ((n % rows) + 0.5) }));
  const letter = (t, cx, cy, size) => {
    const u = textUnits(t), w = (u * size) / 6;
    // Mirrored left to right (x → 2cx − x) so it reads right way round with the lid turned over; the order reversed keeps each outline the right way round.
    return textPolygons(t, cx - w / 2, cy - size / 2, size, Math.max(0.8, size * 0.16)).map((p) => p.map(([x, y]) => [2 * cx - x, y]).reverse());
  };
  const lidMesh = sections([-LW / 2 - 1, -LD / 2 - 1, LW / 2 + 1, LD / 2 + 1], [0, ETCH, LID, LID + PLUG], (z, d) => {
    for (const l of lids) {
      if (z < LID) d.on(rr(l.cx - (c + WALL) / 2, l.cy - (c + WALL) / 2, l.cx + (c + WALL) / 2, l.cy + (c + WALL) / 2, 2)); // the cap, a wall's width bigger than the hole
      else d.on(rr(l.cx - c / 2 + PLAY, l.cy - c / 2 + PLAY, l.cx + c / 2 - PLAY, l.cy + c / 2 - PLAY, 1.5)); // the plug
      if (z >= LID) d.off(rr(l.cx - c / 2 + PLAY + 1.4, l.cy - c / 2 + PLAY + 1.4, l.cx + c / 2 - PLAY - 1.4, l.cy + c / 2 - PLAY - 1.4, 1)); // hollow, so it springs in
      if (z < ETCH) for (const q of letter(l.day, l.cx, l.cy, Math.min(12, c * 0.45))) d.off(q);
    }
  }, 0.08, 0.04);
  const notes = [
    `${days * rows} compartments ${c} × ${c} mm, ${h} mm deep${rows > 1 ? ', morning (front row) and evening (back)' : ''}, in a box ${Math.round(W)} × ${Math.round(D)} mm, and a lid for each with its day on top.`,
    'Push each lid in by its plug. The day letters go on the side of the lid that faces the bed: they read the right way round once it\'s turned over.',
    'Print the box upright and the lids as they come (top down), no supports.',
  ];
  return { parts: [{ mesh: box, name: 'pill-box' }, { mesh: lidMesh, name: 'pill-box-lids' }], notes, preview: box };
}
