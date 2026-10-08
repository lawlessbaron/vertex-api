// The last step of every trace: each outline is fitted to the edge that's actually in the photo.
// The outline is walked every half millimetre; at each point the brightness across the edge (along
// the outline's normal) is read finely, to a tenth of a millimetre, and the point moves to where it
// changes fastest, in the direction this object's edge runs (dark inside to light outside, or the
// other way for a pale object). Moves stay within `reach`, and one that disagrees with its
// neighbours (a speck, a pocket's rim just inside) is smoothed back to theirs.
import { signedArea, simplifyClosed } from '../geometry/polygon.js';

export const SNAP = { step: 0.5, reach: 1.2, fine: 0.1, smooth: 3, min: 6 };

const lumAt = (img, x, y) => {
  // Bilinear, in pixels; outside the picture reads as its nearest edge.
  const w = img.width, h = img.height, d = img.data;
  const fx = Math.min(w - 1.001, Math.max(0, x - 0.5)), fy = Math.min(h - 1.001, Math.max(0, y - 0.5));
  const x0 = fx | 0, y0 = fy | 0, ax = fx - x0, ay = fy - y0;
  const L = (xx, yy) => { const j = 4 * (yy * w + xx); return 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]; };
  return (L(x0, y0) * (1 - ax) + L(x0 + 1, y0) * ax) * (1 - ay) + (L(x0, y0 + 1) * (1 - ax) + L(x0 + 1, y0 + 1) * ax) * ay;
};

// Points every `step` mm round a closed polygon.
function resample(poly, step) {
  const out = [];
  let carry = 0;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length], len = Math.hypot(bx - ax, by - ay);
    let t = carry;
    while (t < len) { out.push([ax + ((bx - ax) * t) / len, ay + ((by - ay) * t) / len]); t += step; }
    carry = t - len;
  }
  return out;
}

/**
 * The outline moved onto the photo's edge.
 * @param polygon [[x, y], …] in mm on the straightened sheet
 * @param sheet   { image: { width, height, data }, pxPerMm }
 * @returns the fitted polygon (or the one given, when there's too little to go on)
 */
export function snapOutline(polygon, sheet, options = {}) {
  const o = { ...SNAP, ...options };
  const { image: img, pxPerMm: k } = sheet;
  if (!img?.data || polygon.length < 3) return polygon;
  const pts = resample(polygon, o.step), n = pts.length;
  if (n < o.min) return polygon;
  const ccw = signedArea(polygon) > 0; // which side the normal points out of
  const steps = Math.round(o.reach / o.fine);
  // The brightness across the edge at each point, inside (−reach) to outside (+reach).
  const normals = [], profiles = [];
  for (let i = 0; i < n; i++) {
    const [px, py] = pts[(i - 1 + n) % n], [nx, ny] = pts[(i + 1) % n];
    let tx = nx - px, ty = ny - py; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    // Outward normal: right of the direction for a counter-clockwise (y-down) outline, left otherwise.
    const ox = ccw ? -ty : ty, oy = ccw ? tx : -tx;
    normals.push([ox, oy]);
    const prof = [];
    for (let s = -steps; s <= steps; s++) { const t = s * o.fine; prof.push(lumAt(img, (pts[i][0] + ox * t) * k, (pts[i][1] + oy * t) * k)); }
    profiles.push(prof);
  }
  // Which way this object's edge runs: brighter outside (a dark object) or darker outside (a pale one).
  let sign = 0;
  for (const p of profiles) sign += p[p.length - 1] - p[0];
  sign = sign >= 0 ? 1 : -1;
  // Each point's move: where the brightness changes fastest (the right way), refined to between samples.
  const moves = profiles.map((p) => {
    let best = -Infinity, at = steps;
    for (let s = 1; s < p.length - 1; s++) { const g = sign * (p[s + 1] - p[s - 1]); if (g > best) { best = g; at = s; } }
    if (!(best > 0)) return { t: 0, g: 0 };
    const gm = sign * (p[at] - p[at - 2 < 0 ? 0 : at - 2]), gp = sign * (p[Math.min(p.length - 1, at + 2)] - p[at]);
    const den = gm - 2 * best + gp, frac = den < 0 ? Math.max(-0.5, Math.min(0.5, (gm - gp) / (2 * den))) : 0;
    return { t: (at + frac - steps) * o.fine, g: best };
  });
  // Smoothed: each move is the median of its neighbours', so a lone jump (a speck, a pocket's rim) doesn't pull the line.
  const r = o.smooth, out = [];
  for (let i = 0; i < n; i++) {
    const win = [];
    for (let j = -r; j <= r; j++) win.push(moves[(i + j + n) % n].t);
    win.sort((a, b) => a - b);
    const t = win[r];
    out.push([pts[i][0] + normals[i][0] * t, pts[i][1] + normals[i][1] * t]);
  }
  return simplifyClosed(out, 0.05);
}

/** snapOutline on every shape: [{ polygon, … }] → the same with fitted polygons. */
export function snapAll(shapes, sheet, options = {}) {
  return shapes.map((s) => { try { return { ...s, polygon: snapOutline(s.polygon, sheet, options) }; } catch { return s; } });
}
