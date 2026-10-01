import { Mesh } from './mesh.js';
import { extrudePolygon } from './polygon.js';

// A single-stroke font on a 4 × 6 grid (y up), sized for printed labels.
// Each glyph is a list of polylines. Lowercase maps to uppercase, except x.
const O = [[1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0]];
const P = [[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]];
const GLYPHS = {
  A: [[[0, 0], [0, 4], [2, 6], [4, 4], [4, 0]], [[0, 3], [4, 3]]],
  B: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [0, 0]]],
  C: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1]]],
  D: [[[0, 0], [0, 6], [2.5, 6], [4, 4.5], [4, 1.5], [2.5, 0], [0, 0]]],
  E: [[[4, 6], [0, 6], [0, 0], [4, 0]], [[0, 3], [3, 3]]],
  F: [[[4, 6], [0, 6], [0, 0]], [[0, 3], [3, 3]]],
  G: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 3], [2, 3]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  I: [[[1, 6], [3, 6]], [[2, 6], [2, 0]], [[1, 0], [3, 0]]],
  J: [[[4, 6], [4, 1], [3, 0], [1, 0], [0, 1]]],
  K: [[[0, 0], [0, 6]], [[4, 6], [0, 2]], [[1.5, 3.5], [4, 0]]],
  L: [[[0, 6], [0, 0], [4, 0]]],
  M: [[[0, 0], [0, 6], [2, 3], [4, 6], [4, 0]]],
  N: [[[0, 0], [0, 6], [4, 0], [4, 6]]],
  O: [O],
  P: [P],
  Q: [O, [[2.5, 1.5], [4, 0]]],
  R: [P, [[2, 3], [4, 0]]],
  S: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 4], [1, 3], [3, 3], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]]],
  T: [[[0, 6], [4, 6]], [[2, 6], [2, 0]]],
  U: [[[0, 6], [0, 1], [1, 0], [3, 0], [4, 1], [4, 6]]],
  V: [[[0, 6], [2, 0], [4, 6]]],
  W: [[[0, 6], [1, 0], [2, 3], [3, 0], [4, 6]]],
  X: [[[0, 0], [4, 6]], [[0, 6], [4, 0]]],
  Y: [[[0, 6], [2, 3], [4, 6]], [[2, 3], [2, 0]]],
  Z: [[[0, 6], [4, 6], [0, 0], [4, 0]]],
  0: [O, [[1, 1.5], [3, 4.5]]],
  1: [[[1, 5], [2, 6], [2, 0]], [[1, 0], [3, 0]]],
  2: [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [0, 0], [4, 0]]],
  3: [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]], [[1.5, 3], [3, 3]]],
  4: [[[3, 0], [3, 6], [0, 2], [4, 2]]],
  5: [[[4, 6], [0, 6], [0, 3.5], [3, 3.5], [4, 2.5], [4, 1], [3, 0], [1, 0], [0, 1]]],
  6: [[[3.5, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2.5], [3, 3.5], [0, 3.5]]],
  7: [[[0, 6], [4, 6], [1.5, 0]]],
  8: [[[1, 3], [0, 4], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [1, 3], [0, 2], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3]]],
  9: [[[0.5, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 3.5], [1, 2.5], [4, 2.5]]],
  x: [[[0.5, 0], [3.5, 4]], [[0.5, 4], [3.5, 0]]],
  '.': [[[1.6, 0], [2.4, 0]]],
  ',': [[[2.4, 0.6], [1.6, -1]]],
  ':': [[[1.6, 1], [2.4, 1]], [[1.6, 4], [2.4, 4]]],
  '-': [[[1, 3], [3, 3]]],
  '+': [[[1, 3], [3, 3]], [[2, 2], [2, 4]]],
  '/': [[[0, 0], [4, 6]]],
  '(': [[[3, 6], [1.5, 4.5], [1.5, 1.5], [3, 0]]],
  ')': [[[1, 6], [2.5, 4.5], [2.5, 1.5], [1, 0]]],
  '#': [[[1.3, 0], [1.8, 6]], [[2.7, 0], [3.2, 6]], [[0.3, 2], [4, 2]], [[0.3, 4], [4, 4]]],
  '%': [[[0, 0], [4, 6]], [[0.5, 5], [1.5, 5]], [[2.5, 1], [3.5, 1]]],
  "'": [[[2, 6], [2, 4.5]]],
  '"': [[[1.4, 6], [1.4, 4.5]], [[2.6, 6], [2.6, 4.5]]],
  '*': [[[2, 1.5], [2, 4.5]], [[0.7, 2.2], [3.3, 3.8]], [[0.7, 3.8], [3.3, 2.2]]],
  '=': [[[1, 2], [3, 2]], [[1, 4], [3, 4]]],
  '°': [[[1.5, 5], [2, 5.5], [2.5, 5], [2, 4.5], [1.5, 5]]],
  'Ø': [O, [[0, 0], [4, 6]]],
  'Ω': [[[0, 0], [1.3, 0], [1.3, 1], [0, 3], [0, 5], [1, 6], [3, 6], [4, 5], [4, 3], [2.7, 1], [2.7, 0], [4, 0]]],
  'µ': [[[0, -1.5], [0, 4]], [[0, 1], [1, 0], [3, 0], [4, 1], [4, 4]]],
};
const ADVANCE = 5.2;

function glyph(ch) {
  if (ch === 'x' || ch === '×') return GLYPHS.x;
  return GLYPHS[ch] || GLYPHS[ch.toUpperCase()] || null;
}

// Width of `text` in grid units.
export function textUnits(text) {
  return Math.max(0, text.length * ADVANCE - (ADVANCE - 4));
}

// Polygons for each stroke of `text`, `height` mm tall, starting at (x, y).
export function textPolygons(text, x, y, height, stroke = Math.max(0.6, height * 0.15)) {
  const k = height / 6;
  const polys = [];
  const half = stroke / 2;
  let cx = x;
  for (const ch of text) {
    const g = glyph(ch);
    if (g) {
      for (const line of g) {
        const pts = line.map(([gx, gy]) => [cx + gx * k, y + gy * k]);
        for (let i = 0; i < pts.length - 1; i++) {
          const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
          const len = Math.hypot(x1 - x0, y1 - y0) || 1e-9;
          const nx = (-(y1 - y0) / len) * half, ny = ((x1 - x0) / len) * half;
          const ex = ((x1 - x0) / len) * half * 0.9, ey = ((y1 - y0) / len) * half * 0.9;
          // Slightly extended so joints overlap cleanly.
          polys.push([[x0 - ex + nx, y0 - ey + ny], [x0 - ex - nx, y0 - ey - ny], [x1 + ex - nx, y1 + ey - ny], [x1 + ex + nx, y1 + ey + ny]]);
        }
      }
    }
    cx += ADVANCE * k;
  }
  return polys;
}

// Raised text as closed shells between z0 and z1.
export function textMesh(text, x, y, height, z0, z1, stroke) {
  const mesh = new Mesh();
  for (const p of textPolygons(text, x, y, height, stroke)) mesh.append(extrudePolygon(p, [], z0, z1));
  return mesh;
}

// Fit text into a box: returns { height, x, y } centred, or null if it cannot be read.
export function fitText(text, boxX, boxY, boxW, boxH, maxHeight = 6, minHeight = 2.5) {
  const units = textUnits(text);
  if (!units) return null;
  const height = Math.min(maxHeight, boxH, (boxW / units) * 6);
  if (height < minHeight) return null;
  const w = (units * height) / 6;
  return { height, x: boxX + (boxW - w) / 2, y: boxY + (boxH - height) / 2 };
}

export const SUPPORTED_CHARS = Object.keys(GLYPHS).join('') + ' ';
