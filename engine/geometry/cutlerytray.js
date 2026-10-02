// Cutlery drawer organisers: trays that fill a drawer exactly, a column for
// each kind of cutlery, split into pieces that fit the bed and simply butt
// together in the drawer. Where two pieces meet, each has a half-thickness
// wall, so together they make one. Every compartment's floor curves up into
// its walls, so a spoon slides out instead of catching in a corner. Drawn in
// plan as slabs and printed upright: the walls go straight up and the curve
// is cut away as it rises, so nothing overhangs.
import { Mesh } from './mesh.js';
import { rr, sections } from './slabs.js';

export const CUTLERYTRAY_DEFAULTS = {
  drawerW: 380, // the drawer inside, across
  drawerD: 450, // and front to back
  height: 50,
  columns: 'knives:1,forks:1.1,spoons:1.1,teaspoons:0.8,utensils:1.4', // kind:share, left to right
  bed: 240, // the biggest piece your printer takes
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const FLOOR = 1.6, WALL = 2, SEAM = 1.2, DIV = 2, SCOOP = 10, PLAY = 1.5;

export function cutleryPlan(options = {}) {
  const o = { ...CUTLERYTRAY_DEFAULTS, ...options };
  const W = num(o.drawerW, 100, 1000, 380) - 2 * PLAY, D = num(o.drawerD, 100, 1000, 450) - 2 * PLAY, H = num(o.height, 20, 100, 50), bed = num(o.bed, 120, 400, 240);
  let cols = String(o.columns || '').split(',').map((c) => { const [k, s] = c.split(':'); return { kind: (k || '').trim().slice(0, 16), share: Number(s) > 0 ? Math.min(5, Number(s)) : 1 }; }).filter((c) => c.kind);
  if (!cols.length) cols = [{ kind: 'cutlery', share: 1 }];
  cols = cols.slice(0, 10);
  const total = cols.reduce((a, c) => a + c.share, 0);
  let x = 0;
  for (const c of cols) { c.x0 = x; x += (W * c.share) / total; c.x1 = x; }
  // Pieces across: break at column edges so no piece is wider than the bed (a column wider than the bed is split in its middle).
  const xs = [0];
  for (const c of cols) {
    if (c.x1 - xs[xs.length - 1] <= bed) continue;
    if (c.x0 > xs[xs.length - 1]) xs.push(c.x0);
    while (c.x1 - xs[xs.length - 1] > bed) xs.push(xs[xs.length - 1] + Math.min(bed, (c.x1 - xs[xs.length - 1]) / 2));
  }
  xs.push(W);
  const rows = Math.ceil(D / bed), ys = Array.from({ length: rows + 1 }, (_, i) => (D * i) / rows);
  return { W, D, H, bed, cols, xs, ys };
}

function piece(p, x0, x1, y0, y1) {
  const { W, D, H, cols } = p;
  const wl = x0 <= 0.01 ? WALL : SEAM, wr = x1 >= W - 0.01 ? WALL : SEAM, wf = y0 <= 0.01 ? WALL : SEAM, wb = y1 >= D - 0.01 ? WALL : SEAM;
  // Compartments: each column's span inside this piece, between dividers (a divider straddles a column edge; at a seam the seam walls stand in).
  const cells = [];
  for (const c of cols) {
    const a = Math.max(c.x0, x0), b = Math.min(c.x1, x1);
    if (b - a < 1) continue;
    const l = a <= x0 + 0.01 ? x0 + wl : a + DIV / 2, r = b >= x1 - 0.01 ? x1 - wr : b - DIV / 2;
    cells.push([l, y0 + wf, r, y1 - wb]);
  }
  const cuts = [0, 0.4, FLOOR, H];
  for (let i = 1; i <= 6; i++) cuts.push(FLOOR + (SCOOP * i) / 6);
  return sections([x0 - 1, y0 - 1, x1 + 1, y1 + 1], cuts, (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    d.on(rr(x0 + f, y0 + f, x1 - f, y1 - f, Math.min(3, (x1 - x0) / 4)));
    if (z < FLOOR) return;
    // The curve from floor to wall: at height h above the floor a circle of radius SCOOP has come in by this much.
    const h = Math.min(SCOOP, z - FLOOR), inset = SCOOP - Math.sqrt(Math.max(0, SCOOP * SCOOP - (SCOOP - h) * (SCOOP - h)));
    for (const [l, b, r, t] of cells) {
      const k = Math.min(inset, (r - l) / 2 - 1, (t - b) / 2 - 1);
      d.off(rr(l + k, b + k, r - k, t - k, Math.max(1, Math.min(SCOOP, (r - l) / 2 - k - 0.5))));
    }
  }, 0.25, 0.15);
}

export function generateCutleryTray(options = {}) {
  const p = cutleryPlan(options), { W, D, H, cols, xs, ys } = p;
  if (H > 250) throw new Error('Taller than a 250 mm bed.');
  const parts = [], preview = new Mesh();
  for (let j = 0; j < ys.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) {
    const m = piece(p, xs[i], xs[i + 1], ys[j], ys[j + 1]);
    parts.push({ mesh: m, name: `cutlery-tray-${String.fromCharCode(65 + j)}${i + 1}` });
    preview.append(m);
  }
  const n = parts.length;
  const notes = [
    `${cols.map((c) => `${c.kind} ${Math.round(c.x1 - c.x0 - DIV)} mm`).join(', ')}, left to right, ${Math.round(D)} mm deep and ${H} mm tall: filling the drawer with ${PLAY} mm to spare all round.`,
    n > 1 ? `${n} pieces (A1 at the front left): put them in the drawer side by side and they make one tray.` : 'One piece.',
    'Print upright (as they come), no supports.',
  ];
  return { parts, notes, preview };
}
