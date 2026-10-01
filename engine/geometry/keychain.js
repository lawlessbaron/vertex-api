// Name keychains, bag tags and badges: a rounded plate sized to the name, the
// letters raised on top as their own part (to print in a second colour), and a
// hole for a key ring, a slot for a strap, or nothing. Prints flat.
import { Mesh } from './mesh.js';
import { circlePolygon, extrudePolygon } from './polygon.js';
import { textMesh, textUnits, SUPPORTED_CHARS } from './font.js';

export const KEYCHAIN_DEFAULTS = {
  text: 'VERTEX',
  item: 'keychain', // keychain | bagtag | badge
  letters: 10, // letter height, mm
  thickness: 3,
  raise: 1,
  segments: 8,
};

export const cleanName = (s) => String(s ?? '').toUpperCase().split('').filter((c) => SUPPORTED_CHARS.includes(c)).join('').replace(/\s+/g, ' ').trim().slice(0, 24);

function roundedRect(x0, y0, w, h, r, seg) {
  const pts = [], n = Math.max(2, seg);
  for (const [cx, cy, a0] of [[x0 + w - r, y0 + r, -90], [x0 + w - r, y0 + h - r, 0], [x0 + r, y0 + h - r, 90], [x0 + r, y0 + r, 180]]) {
    for (let k = 0; k <= n; k++) { const a = ((a0 + (90 * k) / n) * Math.PI) / 180; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  }
  return pts;
}

export function generateKeychain(options = {}) {
  const o = { ...KEYCHAIN_DEFAULTS, ...options };
  const text = cleanName(o.text) || 'NAME';
  const h = Math.max(4, Math.min(30, o.letters)), T = Math.max(1.6, o.thickness), raise = Math.max(0.4, o.raise);
  const tw = (textUnits(text) * h) / 6, pad = Math.max(3, h * 0.45);
  const extra = o.item === 'keychain' ? h * 0.6 + 6 : o.item === 'bagtag' ? 10 : 0; // room for the hole or slot
  const W = tw + 2 * pad + extra, H = h + 2 * pad, r = Math.min(H / 2 - 0.5, Math.max(2, h * 0.35));
  const x0 = -W / 2, y0 = -H / 2;
  const holes = [];
  if (o.item === 'keychain') holes.push(circlePolygon(x0 + pad * 0.6 + 3, 0, Math.min(3, H * 0.18), 32).reverse());
  if (o.item === 'bagtag') { const sx = x0 + 3, sw = 4, sh = Math.min(H - 6, 14); holes.push([[sx, -sh / 2], [sx, sh / 2], [sx + sw, sh / 2], [sx + sw, -sh / 2]]); }
  const body = extrudePolygon(roundedRect(x0, y0, W, H, r, o.segments), holes, 0, T);
  const letters = textMesh(text, x0 + extra + pad, -h / 2, h, T - 0.01, T + raise);
  const notes = [`Swap filament at ${T} mm, or give the letters their own colour in a multi-material printer.`];
  return { parts: [{ mesh: body, name: `${o.item}-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` }, { mesh: letters, name: 'letters' }], notes, size: [W, H], text };
}
