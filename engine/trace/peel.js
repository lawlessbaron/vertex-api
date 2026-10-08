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
// paper the outline took in at its edge goes too. A second test learns the
// object's own colour from its inside: a strip plainly not that colour, dimmer
// than the paper and near its tint (or bluer) is shadow too, even when it's darker
// than the object or the photo has a cast; what only that test takes must lie
// along the object by itself (a grey chrome tip on a green key sticks out).
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
  // The second test, learnt from the photo: plainly not the object's own colour (apart, in its spreads),
  // dimmer than the paper but not black (deep), and near the paper's tint (near) or bluer (bluish).
  // It catches what the fixed tint misses: a shadow darker than the object, a warm or strongly blue one.
  apart: 4, deep: 0.12, near: 0.08, bluish: 0.18, sat: 0.55,
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
  if (!win) { if (o.report) o.report.stop = 'outline too small'; return polygon; }
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
  // o.report (an object), when given, is filled with why nothing went and what was measured.
  const R = o.report || {}, stop = (why) => { R.stop = why; return null; };
  const m = g.data, at = (i) => 4 * (((i / w) | 0) + Y0) * W + 4 * ((i % w) + X0);
  // Distances: from each outside pixel to the outline, and from each inside one to the outside.
  const out = distanceToForeground(g);
  const inv = new Grid(w, h); for (let i = 0; i < w * h; i++) inv.data[i] = m[i] ? 0 : 1;
  const depth = distanceToForeground(inv);
  // The paper round it: the lighter half of a ring 2–6 mm out (another tool or shadow there is darker).
  const ring = [];
  for (let i = 0; i < w * h; i++) if (!m[i] && out[i] >= o.ring[0] * k && out[i] <= o.ring[1] * k) ring.push(i);
  if (ring.length < 20) return stop('no paper round it');
  ring.sort((a, b) => lum(d, at(b)) - lum(d, at(a)));
  let pr = 0, pg = 0, pb = 0;
  const top = ring.slice(0, Math.max(10, ring.length >> 1));
  for (const i of top) { const j = at(i); pr += d[j]; pg += d[j + 1]; pb += d[j + 2]; }
  pr /= top.length; pg /= top.length; pb /= top.length;
  const ps = Math.max(1, pr + pg + pb), pL = Math.max(1, 0.299 * pr + 0.587 * pg + 0.114 * pb);
  const cr = pr / ps, cg = pg / ps, cb = pb / ps;
  // Each test reads pixel j of the image, or of another picture `a` (the 3 × 3 averaged window below).
  const colourOf = (j, a = d) => {
    const r = a[j], gg = a[j + 1], b = a[j + 2], s = Math.max(1, r + gg + b), mx = Math.max(r, gg, b);
    const tint = Math.abs(r / s - cr) + Math.abs(gg / s - cg);
    return { L: lum(a, j) / pL, chroma: mx ? (mx - Math.min(r, gg, b)) / mx : 0, tint, bluer: b / s >= cb };
  };
  const shadeOf = (j, a = d) => { const c = colourOf(j, a); return c.L >= o.lo && c.L <= o.hi && c.chroma <= o.chroma && (c.tint < o.tint || (c.tint < o.blue && c.bluer)); };
  const paperOf = (j) => { const c = colourOf(j); return c.L > o.hi && c.chroma <= o.chroma && c.tint < o.tint * 2; };
  // The object: its inside, 3 mm or more from the edge, and how bright it is. A shadow must be lighter
  // than that; and if most of the inside would pass for that shadow, it's a grey thing: leave it.
  const innerL = [];
  for (let i = 0; i < w * h; i++) if (m[i] && depth[i] >= 3 * k) innerL.push(lum(d, at(i)) / pL);
  if (innerL.length < 20) return stop('too thin to read its colour');
  innerL.sort((a, b) => a - b);
  const objL = innerL[innerL.length >> 1];
  // The object's own colour, from the same inside: its middle tint and brightness, and how much
  // they spread (with floors, so a flat-coloured object doesn't make every speck look foreign).
  const chr = (j, a = d) => { const t = Math.max(1, a[j] + a[j + 1] + a[j + 2]); return [a[j] / t, a[j + 1] / t]; };
  const mid = (a) => { a.sort((u, v) => u - v); return a[a.length >> 1]; };
  const ir = [], ig = [], il = [];
  for (let i = 0; i < w * h; i++) if (m[i] && depth[i] >= 3 * k) { const j = at(i), [r1, g1] = chr(j); ir.push(r1); ig.push(g1); il.push(Math.log(Math.max(1, lum(d, j)))); }
  const oR = mid([...ir]), oG = mid([...ig]), oL = mid([...il]);
  const spread = (a, c, floor) => Math.max(floor, 1.4826 * mid(a.map((v) => Math.abs(v - c))));
  const sC = Math.max(0.012, 1.4826 * mid(ir.map((v, n) => Math.hypot(v - oR, ig[n] - oG)))), sL = spread(il, oL, 0.08);
  // By tint alone: a lit face of a grey object is brighter than its middle but the same tint; shadow on the
  // paper is the paper's tint (or bluer), which a coloured or brown object is not.
  const foreign = (j, a = d) => { const [r1, g1] = chr(j, a); return Math.hypot(r1 - oR, g1 - oG) / sC > o.apart; };
  const learnt = (j, a = d) => { const c = colourOf(j, a); return c.L >= o.deep && c.L <= o.hi && c.chroma <= o.sat && (c.tint <= o.near || (c.bluer && c.tint <= o.bluish)) && foreign(j, a); };
  let innerShade = 0;
  for (let i = 0; i < w * h; i++) if (m[i] && depth[i] >= 3 * k) { const j = at(i); if (shadeOf(j) && lum(d, j) / pL >= objL * o.lighter) innerShade++; }
  Object.assign(R, { paper: [pr, pg, pb].map(Math.round), objectL: +objL.toFixed(3), objectTint: [+oR.toFixed(3), +oG.toFixed(3)], spread: [+sC.toFixed(4), +sL.toFixed(3)], innerShade: +(innerShade / innerL.length).toFixed(3) });
  if (innerShade > 0.5 * innerL.length && !o.force) return stop('most of the object looks like shadow (a grey object)');
  const band = o.band * k;
  // 1: shadow by the fixed test, 3: by the learnt one only, 2: plain paper at the edge.
  const peelable = (i) => { const j = at(i); return shadeOf(j) && colourOf(j).L >= objL * o.lighter ? 1 : learnt(j) ? 3 : depth[i] <= band && paperOf(j) ? 2 : 0; };
  const nbrs = (i) => { const x = i % w, y = (i / w) | 0; return [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]; };
  // Seeds: edge pixels that are shadow (or a little paper). Shadow all round the edge is the object's own rim.
  let area = 0, rim = 0;
  const kind = new Uint8Array(w * h), gone = new Uint8Array(w * h), st = [], edge = [];
  for (let i = 0; i < w * h; i++) {
    if (!m[i]) continue;
    area++;
    if (!nbrs(i).some((j) => j < 0 || !m[j])) continue;
    rim++; edge.push(i);
    const p = peelable(i);
    if (p) { kind[i] = p; gone[i] = 1; st.push(i); }
  }
  R.rimSeeds = st.length;
  if (!st.length) return stop('nothing along the edge looks like shadow');
  while (st.length) for (const j of nbrs(st.pop())) if (j >= 0 && m[j] && !gone[j]) { const p = peelable(j); if (p) { kind[j] = p; gone[j] = 1; st.push(j); } }
  // Shade all round the edge is the object's own rim; a shadow lies along a side or two. Only a strip of shade
  // at least 1.5 mm wide counts: the thin blur where a dark object meets white paper is all round every edge.
  {
    // Judged on 3 × 3 averages, so camera noise (on paper, or on a dark object) doesn't read as shade.
    const sm = new Float32Array(w * h * 4), shade = new Grid(w, h);
    for (let i = 0; i < w * h; i++) {
      shade.data[i] = 1;
      if (!gone[i] || kind[i] === 2) continue;
      const x = i % w, y = (i / w) | 0; let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const j = at(yy * w + xx); sm[4 * i] += d[j]; sm[4 * i + 1] += d[j + 1]; sm[4 * i + 2] += d[j + 2]; n++; }
      sm[4 * i] /= n; sm[4 * i + 1] /= n; sm[4 * i + 2] /= n;
      if ((shadeOf(4 * i, sm) && colourOf(4 * i, sm).L >= objL * o.lighter) || learnt(4 * i, sm)) shade.data[i] = 0;
    }
    // shade.data: 0 on shade, 1 elsewhere; each shade pixel's distance to the nearest non-shade is half the strip's width there.
    const across = distanceToForeground(shade), thick = new Grid(w, h);
    for (let i = 0; i < w * h; i++) thick.data[i] = !shade.data[i] && across[i] >= 0.75 * k ? 1 : 0;
    const near = distanceToForeground(thick);
    let rimShade = 0;
    for (const i of edge) if (near[i] <= (o.band + 1.5) * k) rimShade++;
    Object.assign(R, { rim, rimShade });
    if (rimShade > rim * o.side && !o.force) return stop(`shadow-like all round the edge (${Math.round(100 * rimShade / rim)} %), read as the object's own rim`);
  }
  // What only the learnt test took must lie along the rest on its own: a grey chrome tip at the end
  // of a green key, touching the key's shadow, sticks out from the key instead of lying along it.
  if (!o.force) {
    const only = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) only[i] = kind[i] === 3 ? 1 : 0;
    // What the fixed tests alone reach from the edge: a learnt piece may lie against the shadow in that (not
    // the plain paper), or the object.
    const base = new Uint8Array(w * h), bq = [];
    for (let i = 0; i < w * h; i++) if (kind[i] && kind[i] !== 3 && nbrs(i).some((j) => j < 0 || !m[j])) { base[i] = 1; bq.push(i); }
    while (bq.length) for (const j of nbrs(bq.pop())) if (j >= 0 && kind[j] && kind[j] !== 3 && !base[j]) { base[j] = 1; bq.push(j); }
    const lc = components({ width: w, height: h, data: only }), touch = new Int32Array(lc.count + 1), far = new Int32Array(lc.count + 1), dd = new Int32Array(w * h).fill(-1), qq = [];
    for (let i = 0; i < w * h; i++) if (only[i] && nbrs(i).some((j) => j >= 0 && m[j] && (!gone[j] || (base[j] && kind[j] === 1)))) { touch[lc.labels[i]]++; dd[i] = 1; qq.push(i); }
    for (let n = 0; n < qq.length; n++) { const i = qq[n], l = lc.labels[i]; if (dd[i] > far[l]) far[l] = dd[i]; for (const j of nbrs(i)) if (j >= 0 && only[j] && dd[j] < 0) { dd[j] = dd[i] + 1; qq.push(j); } }
    let dropped = false;
    for (let i = 0; i < w * h; i++) if (only[i]) { const l = lc.labels[i]; if (touch[l] < o.hug * Math.max(1, far[l]) || dd[i] < 0) { kind[i] = 0; gone[i] = 0; dropped = true; } }
    // Then only what's still reached from the edge goes (a chrome tip's bright face, inside its rim, stays).
    if (dropped) {
      const seen = new Uint8Array(w * h), sq = [];
      for (let i = 0; i < w * h; i++) if (gone[i] && nbrs(i).some((j) => j < 0 || !m[j])) { seen[i] = 1; sq.push(i); }
      while (sq.length) for (const j of nbrs(sq.pop())) if (j >= 0 && gone[j] && !seen[j]) { seen[j] = 1; sq.push(j); }
      for (let i = 0; i < w * h; i++) if (gone[i] && !seen[i]) { gone[i] = 0; kind[i] = 0; }
    }
  }
  // Each piece: how long it lies along what stays, how deep it goes, and whether it darkens away.
  const cc = components({ width: w, height: h, data: gone }), dist = new Int32Array(w * h).fill(-1), q = [];
  const contact = new Int32Array(cc.count + 1), deep = new Int32Array(cc.count + 1), besideL = new Float64Array(cc.count + 1), beside = new Int32Array(cc.count + 1);
  const bR = new Float64Array(cc.count + 1), bG = new Float64Array(cc.count + 1);
  for (let i = 0; i < w * h; i++) {
    if (!gone[i]) continue;
    const kept = nbrs(i).filter((j) => j >= 0 && m[j] && !gone[j]);
    if (!kept.length) continue;
    const l = cc.labels[i];
    contact[l]++; dist[i] = 1; q.push(i);
    for (const j of kept) { const [r1, g1] = chr(at(j)); besideL[l] += lum(d, at(j)) / pL; bR[l] += r1; bG[l] += g1; beside[l]++; }
  }
  for (let n = 0; n < q.length; n++) {
    const i = q[n], l = cc.labels[i];
    if (dist[i] > deep[l]) deep[l] = dist[i];
    for (const j of nbrs(i)) if (j >= 0 && gone[j] && dist[j] < 0) { dist[j] = dist[i] + 1; q.push(j); }
  }
  const sd = new Float64Array(cc.count + 1), sl = new Float64Array(cc.count + 1), sdd = new Float64Array(cc.count + 1), sdl = new Float64Array(cc.count + 1), cnt = new Int32Array(cc.count + 1);
  const pR = new Float64Array(cc.count + 1), pG = new Float64Array(cc.count + 1);
  for (let i = 0; i < w * h; i++) {
    if (!gone[i] || dist[i] < 0 || kind[i] === 2) continue;
    const l = cc.labels[i], v = lum(d, at(i)) / pL;
    const [r1, g1] = chr(at(i));
    cnt[l]++; sd[l] += dist[i]; sl[l] += v; sdd[l] += dist[i] * dist[i]; sdl[l] += dist[i] * v; pR[l] += r1; pG[l] += g1;
  }
  const fades = (l) => { const n = cnt[l]; if (n < 3) return true; const vd = sdd[l] - (sd[l] * sd[l]) / n; return vd <= 1e-9 || (sdl[l] - (sd[l] * sl[l]) / n) / vd >= -0.01; };
  // What it lies against must be darker than it (a shadow against the object that casts it), or plainly
  // another colour (a deep blue-grey shadow beside a brown tray). A grey line with light plastic inside it
  // (the rim of a clear spool, the same tint as the line) is the object's own edge.
  const against = (l) => {
    const b = besideL[l] / Math.max(1, beside[l]);
    if (cnt[l] < 3) return b < o.hi;
    const hue = Math.hypot(bR[l] / Math.max(1, beside[l]) - pR[l] / cnt[l], bG[l] / Math.max(1, beside[l]) - pG[l] / cnt[l]);
    return b < sl[l] / cnt[l] || hue > Math.max(0.03, 3 * sC);
  };
  let n = 0;
  const why = { hug: 0, fades: 0, against: 0 };
  for (let i = 0; i < w * h; i++) if (gone[i]) {
    const l = cc.labels[i];
    if (o.force ? contact[l] > 0 : contact[l] >= o.hug * deep[l] && fades(l) && against(l)) { n++; continue; }
    gone[i] = 0;
    if (contact[l] < o.hug * deep[l]) why.hug++; else if (!fades(l)) why.fades++; else why.against++;
  }
  Object.assign(R, { taken: n, area, refused: why });
  if (!n) { const top = Object.entries(why).sort((a, b) => b[1] - a[1])[0]; return stop(top[1] ? { hug: 'the shadow-coloured strip doesn’t lie along the object', fades: 'it gets darker away from the object', against: 'it lies against something lighter than itself' }[top[0]] : 'nothing to take'); }
  if (n > area * o.most) return stop(`it would take ${Math.round(100 * n / area)} % of the outline`);
  const keep = new Grid(w, h, 0, 0, res);
  for (let i = 0; i < w * h; i++) keep.data[i] = m[i] && !gone[i] ? 1 : 0;
  // The biggest piece that's left, whole.
  const left = components(keep);
  if (!left.count) return stop('nothing left');
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
export const PEEL_ASKED = { side: 0.85, hug: 2, most: 0.5, band: 3 };
/** Asked again, when the looser checks found nothing: the learnt test with fewer guards (the outline was picked by hand). */
export const PEEL_FORCED = { ...PEEL_ASKED, force: true, apart: 3, most: 0.45 };
