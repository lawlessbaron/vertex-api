// Lego and toy sorting trays: stackable trays with a grid of compartments and
// a lid whose top is a building plate (studs on the standard 8 mm pitch). Each
// tray's foot is set in by its wall and chamfered at 45°, so it drops into
// the tray below and stacks without sliding; the lid has the same foot. Every
// compartment's floor curves up into its walls so small bricks scoop out.
// Drawn in plan as slabs and printed upright: the foot widens as it rises,
// the walls go straight up, the curve is cut away as it rises and the studs
// stand on the lid: nothing overhangs.
import { rr, sections } from './slabs.js';

export const TOYTRAY_DEFAULTS = {
  width: 200,
  depth: 150,
  height: 45,
  cols: 3,
  rows: 2,
  lid: true,
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const FLOOR = 1.6, WALL = 2, DIV = 1.6, FOOT = 3, PLAY = 0.4, SCOOP = 8, LID = 3;
const PITCH = 8, STUD_D = 4.8, STUD_H = 1.7; // the studs: the standard brick grid

export function generateToyTray(options = {}) {
  const o = { ...TOYTRAY_DEFAULTS, ...options };
  const W = num(o.width, 60, 240, 200), D = num(o.depth, 60, 240, 150), H = num(o.height, 15, 120, 45);
  const cols = Math.round(num(o.cols, 1, 8, 3)), rows = Math.round(num(o.rows, 1, 8, 2)), lid = !(o.lid === false || o.lid === 'false');
  const inset = WALL + PLAY; // the foot fits inside the walls of the tray below
  const foot = (z, base) => Math.max(0, inset - (z - base)); // at the bottom set in by the wall, 45° out to full width
  const outline = (k) => rr(-W / 2 + k, -D / 2 + k, W / 2 - k, D / 2 - k, Math.max(1, 5 - k));
  // Compartments: equal cells between dividers.
  const cw = (W - 2 * WALL - (cols - 1) * DIV) / cols, cd = (D - 2 * WALL - (rows - 1) * DIV) / rows;
  if (cw < 12 || cd < 12) throw new Error('Compartments that small won\'t take a hand: fewer columns or rows.');
  const cells = [];
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x0 = -W / 2 + WALL + i * (cw + DIV), y0 = -D / 2 + WALL + j * (cd + DIV);
    cells.push([x0, y0, x0 + cw, y0 + cd]);
  }
  const cuts = [0, H];
  for (let z = 0; z <= FOOT; z += 0.5) cuts.push(z);
  for (let i = 0; i <= 6; i++) cuts.push(FOOT + FLOOR + (SCOOP * i) / 6);
  const tray = sections([-W / 2 - 1, -D / 2 - 1, W / 2 + 1, D / 2 + 1], cuts, (z, d) => {
    d.on(outline(Math.max(z < 0.4 ? 0.4 : 0, foot(z, 0))));
    if (z < FOOT + FLOOR) return;
    const h = Math.min(SCOOP, z - FOOT - FLOOR), k = SCOOP - Math.sqrt(Math.max(0, SCOOP * SCOOP - (SCOOP - h) * (SCOOP - h)));
    for (const [l, b, r, t] of cells) { const kk = Math.min(k, (r - l) / 2 - 1, (t - b) / 2 - 1); d.off(rr(l + kk, b + kk, r - kk, t - kk, Math.max(1, Math.min(SCOOP, (r - l) / 2 - kk - 0.5)))); }
  }, 0.25, 0.15);
  const parts = [{ mesh: tray, name: 'toy-tray' }];
  if (lid) {
    // The studs, on the brick grid, centred on the lid and clear of its edge.
    const nx = Math.floor((W - 6) / PITCH), ny = Math.floor((D - 6) / PITCH), sx = -((nx - 1) * PITCH) / 2, sy = -((ny - 1) * PITCH) / 2;
    const lidCuts = [0, FOOT + LID, FOOT + LID + STUD_H];
    for (let z = 0; z <= FOOT; z += 0.5) lidCuts.push(z);
    const lidMesh = sections([-W / 2 - 1, -D / 2 - 1, W / 2 + 1, D / 2 + 1], lidCuts, (z, d) => {
      if (z < FOOT + LID) { d.on(outline(Math.max(z < 0.4 ? 0.4 : 0, foot(z, 0)))); return; }
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) d.disc(sx + i * PITCH, sy + j * PITCH, STUD_D / 2);
    }, 0.2, 0.1);
    parts.push({ mesh: lidMesh, name: 'toy-tray-lid' });
  }
  const notes = [
    `${cols * rows} compartment${cols * rows > 1 ? 's' : ''}, ${Math.round(cw)} × ${Math.round(cd)} mm, in a tray ${W} × ${D} × ${H} mm.${lid ? ' The lid is a building plate: studs on the standard 8 mm grid.' : ''}`,
    'Trays stack: each one\'s foot drops into the tray below. Print a few and stack them, with the lid on top.',
    'Print upright (as they come), no supports.',
  ];
  return { parts, notes, preview: tray };
}
