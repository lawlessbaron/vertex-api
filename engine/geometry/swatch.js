// Filament swatches: a sample card for each spool. A rounded card with a hole
// for a ring, a stepped strip (0.4, 0.8, 1.2 and 1.6 mm) to judge colour and
// how much light gets through, and the brand, material, colour and print
// temperatures raised on top as their own part, so they can print in a second
// colour. Several swatches are laid out on one plate. Prints flat, no supports.
import { Mesh } from './mesh.js';
import { box } from './primitives.js';
import { circlePolygon, extrudePolygon } from './polygon.js';
import { fitText, textMesh, SUPPORTED_CHARS } from './font.js';

export const SWATCH_DEFAULTS = {
  list: 'Polymaker | PLA | Teal | 200-220C\nBambu Lab | PETG HF | Black | 230-260C',
  width: 75,
  height: 40,
  thickness: 2,
  steps: true,
  hole: true,
  textHeight: 0.6,
  gap: 4,
  perRow: 2,
  segments: 6,
};

export const STEP_THICKNESS = [0.4, 0.8, 1.2, 1.6];

const clean = (s) => String(s ?? '').toUpperCase().replace(/°/g, '').replace(/[–—]/g, '-').split('').filter((c) => SUPPORTED_CHARS.includes(c)).join('').replace(/\s+/g, ' ').trim();

/** "Brand | Material | Colour | Temps" lines → [{ brand, material, colour, temps }] (at most 24). */
export function parseSwatches(list) {
  return String(list ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 24).map((l) => {
    const [brand = '', material = '', colour = '', temps = ''] = l.split('|').map(clean);
    return { brand, material, colour, temps };
  });
}

function roundedRect(x0, y0, w, h, r, seg) {
  const pts = [], n = Math.max(2, seg);
  const corners = [[x0 + w - r, y0 + r, -90], [x0 + w - r, y0 + h - r, 0], [x0 + r, y0 + h - r, 90], [x0 + r, y0 + r, 180]];
  for (const [cx, cy, a0] of corners) for (let k = 0; k <= n; k++) { const a = ((a0 + (90 * k) / n) * Math.PI) / 180; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return pts;
}

/** One card at (x0, y0). → { body: Mesh, text: Mesh } */
export function swatchCard(s, o, x0 = 0, y0 = 0) {
  const W = Math.max(40, o.width), H = Math.max(25, o.height), T = Math.max(1.2, o.thickness);
  const holes = [];
  const holeR = 2.6, holeX = x0 + 6, holeY = y0 + H - 6;
  if (o.hole) holes.push(circlePolygon(holeX, holeY, holeR, 32).reverse());
  // The stepped strip along the bottom, as a window in the card filled by the steps.
  const sx0 = x0 + 4, sx1 = x0 + W - 4, sy0 = y0 + 3, sy1 = y0 + 3 + Math.min(10, H * 0.28);
  if (o.steps) holes.push([[sx0, sy0], [sx0, sy1], [sx1, sy1], [sx1, sy0]]);
  const body = extrudePolygon(roundedRect(x0, y0, W, H, 3, o.segments), holes, 0, T);
  if (o.steps) {
    const n = STEP_THICKNESS.length, dx = (sx1 - sx0) / n;
    STEP_THICKNESS.forEach((t, k) => body.append(box(sx0 + k * dx, sy0, 0, sx0 + (k + 1) * dx, sy1, Math.min(t, T))));
  }
  // Text: brand and material on the first line, then colour, then temperatures.
  const text = new Mesh();
  const lines = [[s.brand, s.material].filter(Boolean).join(' '), s.colour, s.temps].filter(Boolean);
  const tx0 = x0 + (o.hole ? 12 : 4), tx1 = x0 + W - 4, ty1 = y0 + H - 3, ty0 = (o.steps ? sy1 : y0 + 3) + 2;
  if (lines.length) {
    const rowH = (ty1 - ty0) / lines.length;
    lines.forEach((line, k) => {
      const fit = fitText(line, tx0, ty1 - (k + 1) * rowH + rowH * 0.15, tx1 - tx0, rowH * 0.7, k === 0 ? 6 : 5, 2.2);
      if (fit) text.append(textMesh(line, fit.x, fit.y, fit.height, T - 0.01, T + Math.max(0.2, o.textHeight)));
    });
  }
  return { body, text };
}

/** Every swatch in the list, laid out perRow across. → { body, text, count, notes } */
export function generateSwatches(options = {}) {
  const o = { ...SWATCH_DEFAULTS, ...options };
  const cards = parseSwatches(o.list);
  const list = cards.length ? cards : [{ brand: 'VERTEX', material: 'PLA', colour: '', temps: '' }];
  const per = Math.max(1, Math.min(6, Math.round(o.perRow))), W = Math.max(40, o.width), H = Math.max(25, o.height);
  const body = new Mesh(), text = new Mesh(), notes = [];
  list.forEach((s, k) => {
    const c = swatchCard(s, o, (k % per) * (W + o.gap), -Math.floor(k / per) * (H + o.gap));
    body.append(c.body);
    if (c.text.positions.length) text.append(c.text);
    else notes.push(`Swatch ${k + 1} has no text that fits; shorten it or make the card bigger.`);
  });
  if (!cards.length) notes.push('No swatches listed yet: one line per spool, “Brand | Material | Colour | Temps”.');
  // Centred on the origin, like every other part.
  const b = body.bounds(), cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2;
  body.translate(-cx, -cy, 0);
  if (text.positions.length) text.translate(-cx, -cy, 0);
  return { body, text, count: list.length, notes };
}
