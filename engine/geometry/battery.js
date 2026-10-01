// Battery organisers. A tray of pockets sized to the cell, any number across and
// deep, with the cell type raised on a strip at the front (its own part, for a
// second colour) and a slip-on lid that clears the cells' tops. Or the same
// pockets as a Gridfinity bin, through the holder engine.
// Cells stand upright, sunk about 60 % of their length so they're easy to pick
// out; coin cells stand on edge in slots.
import { Mesh } from './mesh.js';
import { circlePolygon, extrudePolygon } from './polygon.js';
import { textMesh, textUnits } from './font.js';
import { cleanName } from './keychain.js';
import { generateHolder } from './holders.js';

// d: diameter, len: length (coin cells: d is the face, t the thickness). w × t: 9 V.
export const BATTERY_CELLS = {
  aa: { name: 'AA', d: 14.5, len: 50.5 },
  aaa: { name: 'AAA', d: 10.5, len: 44.5 },
  c: { name: 'C', d: 26.2, len: 50 },
  d: { name: 'D', d: 34.2, len: 61.5 },
  '9v': { name: '9V', w: 26.5, t: 17.5, len: 48.5 },
  '18650': { name: '18650', d: 18.4, len: 65.2 },
  '21700': { name: '21700', d: 21.2, len: 70.2 },
  cr2032: { name: 'CR2032', coin: true, d: 20, t: 3.2 },
  cr2025: { name: 'CR2025', coin: true, d: 20, t: 2.5 },
  cr2016: { name: 'CR2016', coin: true, d: 20, t: 1.6 },
  lr44: { name: 'LR44', coin: true, d: 11.6, t: 5.4 },
};

export const BATTERY_DEFAULTS = {
  cell: 'aa',
  cols: 4,
  rows: 2,
  style: 'tray', // tray | gridfinity
  lid: true,
  label: true,
  text: '', // '' = the cell's name
  clearance: 0.4, // round each cell
  fit: 0.25, // between the lid and the tray
  wall: 2,
  floor: 1.2,
  segments: 48,
};

function roundedRect(W, D, r, n = 6) {
  const pts = [], hx = W / 2 - r, hy = D / 2 - r;
  for (const [cx, cy, a0] of [[hx, -hy, -90], [hx, hy, 0], [-hx, hy, 90], [-hx, -hy, 180]]) {
    for (let k = 0; k <= n; k++) { const a = ((a0 + (90 * k) / n) * Math.PI) / 180; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  }
  return pts;
}

/** Pocket size across (x) and deep (y), how deep it's sunk, and how tall the cell stands. */
export function cellPocket(cell, clearance = 0.4) {
  const c = BATTERY_CELLS[cell] || BATTERY_CELLS.aa, k = 2 * clearance;
  if (c.coin) return { shape: 'rect', fw: c.d + k, fd: c.t + k, depth: Math.round(c.d * 0.55 * 10) / 10, tall: c.d };
  if (c.w) return { shape: 'rect', fw: c.w + k, fd: c.t + k, depth: Math.round(c.len * 0.6), tall: c.len };
  return { shape: 'circle', fw: c.d + k, fd: c.d + k, depth: Math.round(c.len * 0.6), tall: c.len };
}

export function batteryTray(o) {
  const cell = BATTERY_CELLS[o.cell] ? o.cell : 'aa', c = BATTERY_CELLS[cell];
  const p = cellPocket(cell, Math.max(0.1, o.clearance));
  const cols = Math.max(1, Math.min(20, Math.round(o.cols))), rows = Math.max(1, Math.min(20, Math.round(o.rows)));
  const gap = 1.6, wall = Math.max(1.2, o.wall), floor = Math.max(0.8, o.floor), n = Math.max(24, o.segments);
  const text = o.label ? cleanName(o.text || c.name) || c.name : '';
  const textH = 5, band = text ? textH + 3 : 0;
  const gw = cols * p.fw + (cols - 1) * gap, gd = rows * p.fd + (rows - 1) * gap;
  const W = Math.max(gw + 2 * wall, text ? (textUnits(text) * textH) / 6 + 2 * wall + 4 : 0), D = gd + 2 * wall + band;
  const H = floor + p.depth, r = Math.min(4, W / 4, D / 4);
  const outer = roundedRect(W, D, r);
  const holes = [], y0 = -D / 2 + wall + band; // the front row starts behind the label strip
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = -gw / 2 + i * (p.fw + gap) + p.fw / 2, y = y0 + j * (p.fd + gap) + p.fd / 2;
    if (p.shape === 'circle') holes.push(circlePolygon(x, y, p.fw / 2, n).reverse());
    else holes.push([[x - p.fw / 2, y - p.fd / 2], [x - p.fw / 2, y + p.fd / 2], [x + p.fw / 2, y + p.fd / 2], [x + p.fw / 2, y - p.fd / 2]]);
  }
  const body = extrudePolygon(outer, [], 0, floor);
  body.append(extrudePolygon(outer, holes, floor - 0.01, H));
  const parts = [{ mesh: body, name: `battery-tray-${cols * rows}x-${cell}` }];
  const raise = 0.6;
  if (text) {
    const tw = (textUnits(text) * textH) / 6;
    parts.push({ mesh: textMesh(text, -tw / 2, -D / 2 + wall + (band - textH) / 2 - 0.5, textH, H - 0.01, H + raise), name: 'label' });
  }
  const notes = [`Holds ${cols * rows} × ${c.name}${c.coin ? ', on edge' : ''}, each sunk ${p.depth} mm.`];
  if (o.lid) {
    // A cap that slips over the tray's top, printed top down beside it.
    const fit = Math.max(0.1, o.fit), lw = 1.6, top = 1.6;
    const stick = p.tall - p.depth + (text ? raise : 0); // how far the cells stand above the tray
    const overlap = Math.min(8, H - 2), cavity = stick + 1 + overlap;
    const inner = roundedRect(W + 2 * fit, D + 2 * fit, r + fit), out = roundedRect(W + 2 * fit + 2 * lw, D + 2 * fit + 2 * lw, r + fit + lw);
    const lid = extrudePolygon(out, [], 0, top);
    lid.append(extrudePolygon(out, [inner.slice().reverse()], top - 0.01, top + cavity));
    lid.translate(W + 2 * lw + 10, 0, 0);
    parts.push({ mesh: lid, name: 'lid' });
    notes.push(`The lid prints top down and slides ${Math.round(overlap)} mm over the tray. Too tight or too loose? Change the lid fit.`);
  }
  return { parts, notes, size: [W, D, H], count: cols * rows };
}

export function generateBattery(options = {}) {
  const o = { ...BATTERY_DEFAULTS, ...options };
  if (o.style === 'gridfinity') {
    const cell = BATTERY_CELLS[o.cell] ? o.cell : 'aa', c = BATTERY_CELLS[cell], p = cellPocket(cell, 0);
    const pocket = p.shape === 'circle' ? { shape: 'circle', a: p.fw } : { shape: 'rect', a: p.fw, b: p.fd };
    const r = generateHolder({ item: 'custom', ...pocket, depth: p.depth, clearance: Math.max(0.1, o.clearance), countMode: 'exact', cols: Math.max(1, Math.round(o.cols)), rows: Math.max(1, Math.round(o.rows)), pattern: 'grid' });
    const parts = [{ mesh: r.mesh, name: `battery-bin-${r.gridX}x${r.gridY}-${cell}` }];
    return { parts, notes: [`A ${r.gridX} × ${r.gridY} Gridfinity bin holding ${r.count} × ${c.name}. Bins stack, so there's no lid.`], count: r.count, grid: [r.gridX, r.gridY] };
  }
  return batteryTray(o);
}
