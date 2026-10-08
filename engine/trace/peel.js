// Cast shadows taken back out of the AI's outlines. The AI often outlines an
// object together with the hard shadow down one side of it (a dark foam tray
// with an 8 mm blue-grey strip along its left edge). Each outline is filled on
// the sheet, and a strip at its edge that looks like the paper in shadow is
// peeled off: dimmer than the paper round it, little colour of its own, the
// paper's tint or bluer (a shadow on white paper goes blue), and lighter than
// the object itself. Guards keep the object's own grey: shading all round the
// edge is the object's rim (a shadow lies along a side), a peeled piece must
// lie along the object (touching it along at least 3 × its own depth: a grey
// tip or handle sticks out instead), it mustn't darken away from the object,
// and nothing goes if it would take 40 % of the outline. A thin band of plain
// paper the outline took in at its edge goes too.
import { Grid, components, distanceToForeground, fillHoles, fillPolygon, offsetMask, traceBinary } from '../geometry/raster.js';
import { signedArea, simplifyClosed } from '../geometry/polygon.js';

export const PEEL = {
  lo: 0.3, hi: 0.94, // a shadow's brightness, as a share of the paper's
  chroma: 0.3,       // its colour spread (max − min) / max, at most
  tint: 0.035,       // how far its red and green shares may sit from the paper's
  blue: 0.14,        // …or this far, when it's bluer than the paper
  lighter: 1.12,     // a shadow is at least this much lighter than the object
  band: 2.5,         // mm of plain paper at the outline's edge that can go
  ring: [2, 6],      // mm out from the outline: where the paper round it is read
  side: 0.6, hug: 3, most: 0.4,
};

const lum = (d, j) => 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];

/**
 * An outline (mm) with any cast shadow along its edge peeled off.
 * @param polygon [[x, y], …] in mm on the straightened sheet
 * @param sheet   { image: { width, height, data }, pxPerMm }
 * @returns the new polygon, or the one given when nothing was peeled
 */
export function peelShadow(polygon, sheet, options = {}) {
  const o = { ...PEEL, ...options };
  const { image: img, pxPerMm: k } = sheet, res = 1 / k;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of polygon) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const win = around(img, k, o, Math.floor(x0 * k), Math.floor(y0 * k), Math.ceil(x1 * k), Math.ceil(y1 * k));
  if (!win) return polygon;
  const g = new Grid(win.w, win.h, win.X0 * res, win.Y0 * res, res);
  fillPolygon(g, polygon, 1);
  const keep = peelGrid(g, win.X0, win.Y0, img, k, o);
  if (!keep) return polygon;
  const loops = traceBinary(keep, win.X0, win.Y0);
  if (!loops.length) return polygon;
  let outer = loops[0];
  for (const l of loops) if (Math.abs(signedArea(l)) > Math.abs(signedArea(outer))) outer = l;
  return simplifyClosed(outer, 0.3);
}

/**
 * The same for a mask (the built-in trace's): `mask` is a Grid whose pixel
 * (0, 0) is the image's (X0, Y0). Peeled in place; true when anything went.
 */
export function peelMask(mask, X0, Y0, image, pxPerMm, options = {}) {
  const o = { ...PEEL, ...options }, k = pxPerMm, mw = mask.width, mh = mask.height;
  let x0 = mw, y0 = mh, x1 = -1, y1 = -1;
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) if (mask.data[y * mw + x] >= 0.5) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return false;
  const win = around(image, k, o, X0 + x0, Y0 + y0, X0 + x1, Y0 + y1);
  if (!win) return false;
  const g = new Grid(win.w, win.h, 0, 0, 1 / k);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (mask.data[y * mw + x] >= 0.5) g.data[(y + Y0 - win.Y0) * win.w + x + X0 - win.X0] = 1;
  const keep = peelGrid(g, win.X0, win.Y0, image, k, o);
  if (!keep) return false;
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    const gx = x + X0 - win.X0, gy = y + Y0 - win.Y0;
    mask.data[y * mw + x] = gx >= 0 && gy >= 0 && gx < win.w && gy < win.h && keep.data[gy * win.w + gx] >= 0.5 && mask.data[y * mw + x] >= 0.5 ? 1 : 0;
  }
  return true;
}

// The window round a box of pixels, wide enough to read the paper round it.
function around(img, k, o, bx0, by0, bx1, by1) {
  const pad = Math.ceil(o.ring[1] * k) + 2;
  const X0 = Math.max(0, bx0 - pad), Y0 = Math.max(0, by0 - pad);
  const X1 = Math.min(img.width - 1, bx1 + pad), Y1 = Math.min(img.height - 1, by1 + pad);
  const w = X1 - X0 + 1, h = Y1 - Y0 + 1;
  return w < 5 || h < 5 ? null : { X0, Y0, w, h };
}

// The peel itself, on a window `g` whose pixel (0, 0) is the image's (X0, Y0). The shape that's
// left (closed over 1 mm), or null when nothing should go.
function peelGrid(g, X0, Y0, img, k, o) {
  const w = g.width, h = g.height, W = img.width, d = img.data, res = 1 / k;
  const m = g.data, at = (i) => 4 * (((i / w) | 0) + Y0) * W + 4 * ((i % w) + X0);
  // Distances: from each outside pixel to the outline, and from each inside one to the outside.
  const out = distanceToForeground(g);
  const inv = new Grid(w, h); for (let i = 0; i < w * h; i++) inv.data[i] = m[i] ? 0 : 1;
  const depth = distanceToForeground(inv);
  // The paper round it: the lighter half of a ring 2–6 mm out (another tool or shadow there is darker).
  const ring = [];
  for (let i = 0; i < w * h; i++) if (!m[i] && out[i] >= o.ring[0] * k && out[i] <= o.ring[1] * k) ring.push(i);
  if (ring.length < 20) return null;
  ring.sort((a, b) => lum(d, at(b)) - lum(d, at(a)));
  let pr = 0, pg = 0, pb = 0;
  const top = ring.slice(0, Math.max(10, ring.length >> 1));
  for (const i of top) { const j = at(i); pr += d[j]; pg += d[j + 1]; pb += d[j + 2]; }
  pr /= top.length; pg /= top.length; pb /= top.length;
  const ps = Math.max(1, pr + pg + pb), pL = Math.max(1, 0.299 * pr + 0.587 * pg + 0.114 * pb);
  const cr = pr / ps, cg = pg / ps, cb = pb / ps;
  const colourOf = (j) => {
    const r = d[j], gg = d[j + 1], b = d[j + 2], s = Math.max(1, r + gg + b), mx = Math.max(r, gg, b);
    const tint = Math.abs(r / s - cr) + Math.abs(gg / s - cg);
    return { L: lum(d, j) / pL, chroma: mx ? (mx - Math.min(r, gg, b)) / mx : 0, tint, bluer: b / s >= cb };
  };
  const shadeOf = (j) => { const c = colourOf(j); return c.L >= o.lo && c.L <= o.hi && c.chroma <= o.chroma && (c.tint < o.tint || (c.tint < o.blue && c.bluer)); };
  const paperOf = (j) => { const c = colourOf(j); return c.L > o.hi && c.chroma <= o.chroma && c.tint < o.tint * 2; };
  // The object: its inside, 3 mm or more from the edge, and how bright it is. A shadow must be lighter
  // than that; and if most of the inside would pass for that shadow, it's a grey thing: leave it.
  const innerL = [];
  for (let i = 0; i < w * h; i++) if (m[i] && depth[i] >= 3 * k) innerL.push(lum(d, at(i)) / pL);
  if (innerL.length < 20) return null;
  innerL.sort((a, b) => a - b);
  const objL = innerL[innerL.length >> 1];
  let innerShade = 0;
  for (let i = 0; i < w * h; i++) if (m[i] && depth[i] >= 3 * k) { const j = at(i); if (shadeOf(j) && lum(d, j) / pL >= objL * o.lighter) innerShade++; }
  if (innerShade > 0.5 * innerL.length) return null;
  const band = o.band * k;
  const peelable = (i) => { const j = at(i); return (shadeOf(j) && colourOf(j).L >= objL * o.lighter) ? 1 : depth[i] <= band && paperOf(j) ? 2 : 0; };
  const nbrs = (i) => { const x = i % w, y = (i / w) | 0; return [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]; };
  // Seeds: edge pixels that are shadow (or a little paper). Shadow all round the edge is the object's own rim.
  let area = 0, rim = 0, rimShade = 0;
  const kind = new Uint8Array(w * h), gone = new Uint8Array(w * h), st = [];
  for (let i = 0; i < w * h; i++) {
    if (!m[i]) continue;
    area++;
    if (!nbrs(i).some((j) => j < 0 || !m[j])) continue;
    rim++;
    const p = peelable(i);
    if (p) { kind[i] = p; gone[i] = 1; st.push(i); if (p === 1) rimShade++; }
  }
  if (!st.length || rimShade > rim * o.side) return null;
  while (st.length) for (const j of nbrs(st.pop())) if (j >= 0 && m[j] && !gone[j]) { const p = peelable(j); if (p) { kind[j] = p; gone[j] = 1; st.push(j); } }
  // Each piece: how long it lies along what stays, how deep it goes, and whether it darkens away.
  const cc = components({ width: w, height: h, data: gone }), dist = new Int32Array(w * h).fill(-1), q = [];
  const contact = new Int32Array(cc.count + 1), deep = new Int32Array(cc.count + 1), besideL = new Float64Array(cc.count + 1), beside = new Int32Array(cc.count + 1);
  for (let i = 0; i < w * h; i++) {
    if (!gone[i]) continue;
    const kept = nbrs(i).filter((j) => j >= 0 && m[j] && !gone[j]);
    if (!kept.length) continue;
    const l = cc.labels[i];
    contact[l]++; dist[i] = 1; q.push(i);
    for (const j of kept) { besideL[l] += lum(d, at(j)) / pL; beside[l]++; }
  }
  for (let n = 0; n < q.length; n++) {
    const i = q[n], l = cc.labels[i];
    if (dist[i] > deep[l]) deep[l] = dist[i];
    for (const j of nbrs(i)) if (j >= 0 && gone[j] && dist[j] < 0) { dist[j] = dist[i] + 1; q.push(j); }
  }
  const sd = new Float64Array(cc.count + 1), sl = new Float64Array(cc.count + 1), sdd = new Float64Array(cc.count + 1), sdl = new Float64Array(cc.count + 1), cnt = new Int32Array(cc.count + 1);
  for (let i = 0; i < w * h; i++) {
    if (!gone[i] || dist[i] < 0 || kind[i] !== 1) continue;
    const l = cc.labels[i], v = lum(d, at(i)) / pL;
    cnt[l]++; sd[l] += dist[i]; sl[l] += v; sdd[l] += dist[i] * dist[i]; sdl[l] += dist[i] * v;
  }
  const fades = (l) => { const n = cnt[l]; if (n < 3) return true; const vd = sdd[l] - (sd[l] * sd[l]) / n; return vd <= 1e-9 || (sdl[l] - (sd[l] * sl[l]) / n) / vd >= -0.01; };
  // What it lies against must be darker than it: a shadow against the object that casts it. A grey
  // line with light plastic inside it (the rim of a clear spool) is the object's own edge.
  const against = (l) => { const b = besideL[l] / Math.max(1, beside[l]); return cnt[l] >= 3 ? b < sl[l] / cnt[l] : b < o.hi; };
  let n = 0;
  for (let i = 0; i < w * h; i++) if (gone[i]) { const l = cc.labels[i]; if (contact[l] >= o.hug * deep[l] && fades(l) && against(l)) n++; else gone[i] = 0; }
  if (!n || n > area * o.most) return null;
  const keep = new Grid(w, h, 0, 0, res);
  for (let i = 0; i < w * h; i++) keep.data[i] = m[i] && !gone[i] ? 1 : 0;
  // The biggest piece that's left, whole.
  const left = components(keep);
  if (!left.count) return null;
  let best = 1;
  for (let c = 2; c <= left.count; c++) if (left.sizes[c] > left.sizes[best]) best = c;
  for (let i = 0; i < w * h; i++) keep.data[i] = left.labels[i] === best ? 1 : 0;
  fillHoles(keep);
  // Closed over 1 mm, so a speck of shadow colour on the object's own edge leaves no notch.
  const r = Math.max(1, Math.round(k));
  return fillHoles(offsetMask(offsetMask(keep, r), -r));
}

const areaOf = (p) => Math.abs(signedArea(p));

/** peelShadow on every outline: [{ polygon, … }] → the same with polygons peeled, and how much went (shadowMm2). */
export function peelShadows(shapes, sheet, options = {}) {
  return shapes.map((s) => {
    try {
      const polygon = peelShadow(s.polygon, sheet, options);
      return polygon === s.polygon ? s : { ...s, polygon, shadowMm2: Math.max(0, areaOf(s.polygon) - areaOf(polygon)) };
    } catch { return s; }
  });
}

/** Looser checks, for when someone asks for a shadow to be trimmed off an outline they picked. */
export const PEEL_ASKED = { side: 0.85, lighter: 1.04, hug: 2, most: 0.5, band: 3 };
