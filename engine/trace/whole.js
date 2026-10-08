// One outline around the whole thing. The AI often outlines the parts of an
// object (every key in a hex key set, but not the holder they sit in). A
// pocket in a bin has to fit the whole object, so: the AI's outlines, plus
// the dark silhouette on the paper wherever it touches them, closed over small
// gaps, and outlined once around the outside.
import { Grid, components, distanceToForeground, fillHoles, fillPolygon, offsetMask, polygonIndices, traceBinary } from '../geometry/raster.js';
import { signedArea, simplifyClosed } from '../geometry/polygon.js';
import { peelShadows } from './peel.js';
import { snapAll } from './snap.js';

/**
 * What on the sheet is a thing, not paper or its shadow. A shadow is the
 * paper's own grey, only a little darker, with a soft edge; so a pixel counts
 * when it's coloured (a green handle), much darker than the paper (black
 * plastic, dark steel), or on a sharp edge (the rim of a bright chrome tip,
 * which is as light as the paper). Sharp edges are only used near the AI's
 * outlines (wholeOutlines), so paper creases elsewhere don't count.
 * @returns { solid: Grid, edge: Grid } masks in the sheet's pixels
 */
export function objectPixels(img, pxPerMm, { vivid = 45, dark = 0.55, sharp = 40, shadowFloor = 0.3 } = {}) {
  const W = img.width, H = img.height, d = img.data, n = W * H, res = 1 / pxPerMm;
  const L = new Float32Array(n), C = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = d[4 * i], g = d[4 * i + 1], b = d[4 * i + 2];
    L[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    C[i] = Math.max(r, g, b) - Math.min(r, g, b);
  }
  // The paper: the brightness most of the sheet has (its top 30%), and its tint.
  const sorted = Float32Array.from(L.filter((_, i) => i % 7 === 0)).sort();
  const paperL = sorted[Math.floor(sorted.length * 0.7)] || 255;
  let tint = 0, cnt = 0, pr = 0, pg = 0, pb = 0;
  for (let i = 0; i < n; i += 7) if (L[i] >= paperL - 12) { tint += C[i]; pr += d[4 * i]; pg += d[4 * i + 1]; pb += d[4 * i + 2]; cnt++; }
  tint = cnt ? tint / cnt : 0;
  const paper = cnt ? [pr / cnt, pg / cnt, pb / cnt] : [255, 255, 255];
  // A shadow is the paper's own colour, only darker: every channel scaled by
  // about the same amount, and not very dark. A dark tool (brown steel, a black
  // grip) either changes the colour or is much darker than any shadow.
  const shadowLike = (i) => {
    const a = d[4 * i] / paper[0], b = d[4 * i + 1] / paper[1], c = d[4 * i + 2] / paper[2], m = (a + b + c) / 3;
    return m > shadowFloor && Math.max(Math.abs(a - m), Math.abs(b - m), Math.abs(c - m)) < 0.16 * m;
  };
  const solid = new Grid(W, H, 0, 0, res), edge = new Grid(W, H, 0, 0, res);
  for (let i = 0; i < n; i++) if (C[i] - tint > vivid || (L[i] < paperL * dark && !shadowLike(i))) solid.data[i] = 1;
  // Sobel on the brightness, lightly blurred so paper grain doesn't count.
  const B = new Float32Array(n);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    B[i] = (L[i - W - 1] + 2 * L[i - W] + L[i - W + 1] + 2 * L[i - 1] + 4 * L[i] + 2 * L[i + 1] + L[i + W - 1] + 2 * L[i + W] + L[i + W + 1]) / 16;
  }
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    const i = y * W + x;
    const gx = B[i - W + 1] + 2 * B[i + 1] + B[i + W + 1] - B[i - W - 1] - 2 * B[i - 1] - B[i + W - 1];
    const gy = B[i + W - 1] + 2 * B[i + W] + B[i + W + 1] - B[i - W - 1] - 2 * B[i - W] - B[i - W + 1];
    if (Math.hypot(gx, gy) / 4 > sharp) edge.data[i] = 1;
  }
  return { solid, edge };
}

// A name for a group: one that already says "set", else "<name> set" for three
// or more of the same, else the biggest part's.
function groupLabel(parts) {
  const named = parts.filter((p) => p.label);
  const set = named.find((p) => /\bset\b|\bholder\b|\bkit\b/i.test(p.label));
  if (set) return set.label;
  if (named.length >= 3) {
    const count = new Map();
    for (const p of named) count.set(p.label, (count.get(p.label) || 0) + 1);
    const [top, n] = [...count].sort((a, b) => b[1] - a[1])[0];
    if (n >= 3) return `${top} set`;
  }
  return [...named].sort((a, b) => Math.abs(signedArea(b.polygon)) - Math.abs(signedArea(a.polygon)))[0]?.label || '';
}

/**
 * @param shapes  the AI's outlines, in mm: [{ polygon, label }]
 * @param sheet   the straightened sheet ({ image: { width, height }, pxPerMm })
 * @param options mask: the silhouette (toolMask) to add where it touches the
 *                outlines; gap: close gaps up to about twice this (mm);
 *                minArea: drop specks under this (mm²); separate: when the
 *                AI's outlines cover this share of a piece without overlapping
 *                each other, they're separate tools lying close (kept apart)
 *                peel: false keeps a hard shadow along a side (peel.js) in
 * @returns [{ polygon, label, parts }] in mm
 */
export function wholeOutlines(shapes, sheet, options = {}) {
  const out = joinOutlines(shapes, sheet, options);
  // A hard shadow the AI (or the silhouette) took in along a side comes back off (peel.js), and each
  // outline is fitted to the edge in the photo (snap.js).
  if (!sheet.image?.data) return out;
  const peeled = options.peel === false ? out : peelShadows(out, sheet);
  return options.snap === false ? peeled : snapAll(peeled, sheet).map((s, i) => ({ ...s, shadowMm2: peeled[i].shadowMm2 }));
}

function joinOutlines(shapes, sheet, { mask = null, gap = 2, reach = 8, minArea = 30, smoothing = 0.3, separate = 0.8 } = {}) {
  if (!shapes.length) return [];
  const W = sheet.image.width, H = sheet.image.height, k = sheet.pxPerMm, res = 1 / k;
  // Each outline as pixels, to see which hold which.
  const frame = { width: W, height: H, x0: 0, y0: 0, res };
  const own = shapes.map((sh) => polygonIndices(frame, sh.polygon));
  const sets = own.map((px) => new Set(px));
  // Each outline's box in pixels: two whose boxes don't meet share nothing.
  const boxes = shapes.map((sh) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of sh.polygon) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; });
  const meet = (a, b) => boxes[a][0] <= boxes[b][2] && boxes[b][0] <= boxes[a][2] && boxes[a][1] <= boxes[b][3] && boxes[b][1] <= boxes[a][3];
  const share = (a, b) => { if (!own[a].length || !meet(a, b)) return 0; let n = 0; for (const i of own[a]) if (sets[b].has(i)) n++; return n / own[a].length; }; // how much of a lies in b
  // A group outline: one round several tools (SAM3's "tool" round three crimpers
  // that each have their own outline too). It's dropped when those tools cover
  // nearly all of it; a holder round keys stays, since the holder shows round them.
  const drop = new Set();
  shapes.forEach((_, g) => {
    const inner = shapes.map((__, j) => j).filter((j) => j !== g && share(j, g) >= 0.7);
    if (inner.length < 2) return;
    const covered = new Set(); for (const j of inner) for (const i of own[j]) covered.add(i);
    let n = 0; for (const i of own[g]) if (covered.has(i)) n++;
    if (n >= 0.85 * own[g].length) drop.add(g);
  });
  if (drop.size) return joinOutlines(shapes.filter((_, i) => !drop.has(i)), sheet, { mask, gap, reach, minArea, smoothing, separate });
  const g = new Grid(W, H, 0, 0, res);
  for (const s of shapes) fillPolygon(g, s.polygon, 1);
  // The silhouette adds what the AI missed (the holder), but only pieces that
  // touch an outline: a stray shadow or smudge elsewhere stays out. `mask` is
  // a Grid, or objectPixels' { solid, edge }: then sharp edges count too, but
  // only within `reach` mm of what's found (a bare chrome tip).
  const solid = mask?.solid || mask, edge = mask?.edge || null;
  if (solid && solid.width === W && solid.height === H) {
    const { labels, count, sizes } = components(solid);
    const touch = new Int32Array(count + 1);
    for (let i = 0; i < W * H; i++) if (labels[i] && g.data[i] >= 0.5) touch[labels[i]]++;
    const keep = new Uint8Array(count + 1);
    for (let c = 1; c <= count; c++) keep[c] = touch[c] >= Math.max(20, sizes[c] * 0.05) ? 1 : 0;
    for (let i = 0; i < W * H; i++) if (keep[labels[i]]) g.data[i] = 1;
  }
  // What's there before any edges are added: whether a piece is one thing or
  // several tools side by side is judged on this, so a clear rim (seen only as
  // an edge) shapes an outline without joining two tools into one.
  const solidOnly = g.clone();
  if (edge && edge.width === W && edge.height === H) {
    const near = offsetMask(g, Math.round(reach * k));
    for (let i = 0; i < W * H; i++) if (edge.data[i] && near.data[i] >= 0.5) g.data[i] = 1;
  }
  const r = Math.max(1, Math.round(gap * k));
  const closed = fillHoles(offsetMask(offsetMask(g, r), -r));
  const { labels, count, sizes } = components(closed);
  // Which piece each AI outline belongs to (most of its corners).
  const owner = shapes.map((s) => {
    const votes = new Map();
    for (const [x, y] of s.polygon) {
      const i = Math.min(W - 1, Math.max(0, Math.floor(x * k))), j = Math.min(H - 1, Math.max(0, Math.floor(y * k)));
      const l = labels[j * W + i];
      if (l) votes.set(l, (votes.get(l) || 0) + 1);
    }
    return [...votes].sort((a, b) => b[1] - a[1])[0]?.[0] || 0;
  });
  // How much of each piece the AI's own outlines cover: three crimpers lying
  // close together, or across each other, are three tools (their outlines fill
  // the piece, none inside another); keys in a holder are one (the holder the AI
  // missed fills a good part of it, or the AI outlined the holder round the keys).
  const cover = new Uint8Array(W * H);
  for (const px of own) for (const i of px) cover[i] = 1;
  const base = fillHoles(offsetMask(offsetMask(solidOnly, r), -r));
  const covered = new Int32Array(count + 1), baseSize = new Int32Array(count + 1);
  for (let i = 0; i < W * H; i++) { const l = labels[i]; if (!l) continue; if (cover[i]) covered[l]++; if (base.data[i] >= 0.5) baseSize[l]++; }
  // One outline mostly inside another (a key inside its holder's outline) makes them one thing.
  const nested = (idx) => idx.some((a) => idx.some((b) => a !== b && share(a, b) >= 0.6));
  // Each outline's shape: its size, middle, and long axis (from the spread of its pixels).
  const form = own.map((px) => {
    let sx = 0, sy = 0;
    for (const i of px) { sx += i % W; sy += (i / W) | 0; }
    const n = px.length || 1, mx = sx / n, my = sy / n;
    let xx = 0, yy = 0, xy = 0;
    for (const i of px) { const dx = (i % W) - mx, dy = ((i / W) | 0) - my; xx += dx * dx; yy += dy * dy; xy += dx * dy; }
    xx /= n; yy /= n; xy /= n;
    const t = (xx + yy) / 2, s = Math.sqrt(Math.max(0, ((xx - yy) / 2) ** 2 + xy * xy));
    const a = Math.atan2(2 * xy, xx - yy) / 2; // the long axis
    // Half the length and half the width of a bar with this spread (a bar's variance is length² / 12).
    return { n: px.length, mx, my, ux: Math.cos(a), uy: Math.sin(a), hl: Math.sqrt(3 * (t + s)), hw: Math.sqrt(3 * Math.max(0, t - s)) };
  });
  // How long a stretch of a's edge lies within `t` pixels of b, and how long a's edge is.
  const touching = (a, b) => {
    const t = Math.max(1, Math.round(1.5 * k)), set = sets[a], other = sets[b];
    let edge = 0, met = 0;
    for (const i of own[a]) {
      const x = i % W;
      if (x > 0 && x < W - 1 && set.has(i - 1) && set.has(i + 1) && set.has(i - W) && set.has(i + W)) continue;
      edge++;
      for (let d = 1; d <= t; d++) if (other.has(i + d) || other.has(i - d) || other.has(i + d * W) || other.has(i - d * W)) { met++; break; }
    }
    return { edge, met };
  };
  // The AI often outlines an object's parts as if they were tools of their own:
  // a marker's cap and its body, a device and the black feet under it. Two
  // outlines touching are one object when they lie end to end along a long
  // axis (a cap on a pen, the head on a brush), or when one is a small part
  // stuck on a much bigger one along a good stretch of its edge (a foot, a
  // knob, a plug). Side by side along their length (two knives), or both
  // about as wide as long (two tape measures), they stay two tools.
  const oneObjects = (idx) => {
    const parent = new Map(idx.map((i) => [i, i]));
    const find = (i) => { while (parent.get(i) !== i) i = parent.get(i); return i; };
    for (const p of idx) for (const q of idx) {
      if (p >= q || find(p) === find(q) || !meet(p, q)) continue;
      const [a, b] = form[p].n >= form[q].n ? [p, q] : [q, p], A = form[a], B = form[b];
      const { edge, met } = touching(b, a);
      if (met < 3) continue;
      const small = B.n <= 0.12 * A.n && met >= 0.25 * edge;
      const dx = B.mx - A.mx, dy = B.my - A.my, along = Math.abs(dx * A.ux + dy * A.uy), across = Math.abs(dx * A.uy - dy * A.ux);
      const lined = A.hl >= 2.2 * A.hw && Math.abs(A.ux * B.ux + A.uy * B.uy) > Math.cos(0.45) || B.hl < 1.6 * B.hw;
      const endToEnd = A.hl >= 2.2 * A.hw && lined && across <= 0.8 * Math.max(A.hw, B.hw) && along >= 0.6 * (A.hl + B.hl);
      if (small || endToEnd) parent.set(find(b), find(a));
    }
    const groups = new Map();
    for (const i of idx) { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); }
    return [...groups.values()].map((members) => {
      const big = members.reduce((m, i) => (form[i].n > form[m].n ? i : m), members[0]);
      if (members.length === 1) return { own: own[big], set: sets[big], polygon: shapes[big].polygon, label: shapes[big].label || '', n: 1 };
      const set = new Set(); for (const i of members) for (const j of own[i]) set.add(j);
      return { own: [...set], set, polygon: shapes[big].polygon, label: shapes[big].label || '', n: members.length };
    });
  };
  const out = [];
  for (let c = 1; c <= count; c++) {
    if (sizes[c] * res * res < minArea) continue;
    const idx = shapes.map((_, i) => i).filter((i) => owner[i] === c), parts = idx.map((i) => shapes[i]);
    if (!parts.length) continue; // only silhouette: not something the AI saw
    const units = parts.length > 1 ? oneObjects(idx) : null;
    if (units && units.length > 1 && covered[c] >= separate * (baseSize[c] || sizes[c]) && !nested(idx)) {
      // Each tool on its own, snapped to its real edge: its outline plus the
      // silhouette round it, out to `reach` mm. That takes in what the AI left
      // off, like the clear plastic rim of a spool of wire, which shows only as
      // a crisp edge. A pixel goes to whichever tool's outline is nearest, so
      // two tools touching never take each other's edges. Then the gap between
      // an edge and the outline is closed, and the whole traced.
      // Worked in a window round each tool (its box plus the reach and the
      // closing), not the whole sheet; distances to the others are measured in
      // a window `far` wider still, which is as far as one could be nearer.
      const far = Math.max(1, Math.round(reach * k));
      const close = Math.max(r, Math.round((reach / 2) * k));
      const box = units.map((u) => { let x0 = W, y0 = H, x1 = -1, y1 = -1; for (const i of u.own) { const x = i % W, y = (i / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return [x0, y0, x1, y1]; });
      // Each tool's distance from its own pixels, measured once in its box plus
      // `far` (a pixel further off is further than `far` from it, which is all
      // the tests below need to know): Infinity outside that.
      const dist = box.map(([x0, y0, x1, y1], m) => {
        if (x1 < 0) return null;
        const DX0 = Math.max(0, x0 - far - 1), DY0 = Math.max(0, y0 - far - 1), DX1 = Math.min(W - 1, x1 + far + 1), DY1 = Math.min(H - 1, y1 + far + 1), dw = DX1 - DX0 + 1;
        const g2 = new Grid(dw, DY1 - DY0 + 1, 0, 0, res);
        for (const i of units[m].own) g2.data[(((i / W) | 0) - DY0) * dw + (i % W) - DX0] = 1;
        return { DX0, DY0, DX1, DY1, dw, d: distanceToForeground(g2) };
      });
      const distAt = (m, x, y) => { const t = dist[m]; return t && x >= t.DX0 && x <= t.DX1 && y >= t.DY0 && y <= t.DY1 ? t.d[(y - t.DY0) * t.dw + x - t.DX0] : Infinity; };
      units.forEach((u, m) => {
        const [bx0, by0, bx1, by1] = box[m];
        if (bx1 < 0) { out.push({ polygon: u.polygon, label: u.label, parts: u.n }); return; }
        const pad = far + close + 3;
        const X0 = Math.max(0, bx0 - pad), Y0 = Math.max(0, by0 - pad), X1 = Math.min(W - 1, bx1 + pad), Y1 = Math.min(H - 1, by1 + pad), w = X1 - X0 + 1, h = Y1 - Y0 + 1;
        const QX0 = Math.max(0, X0 - far), QY0 = Math.max(0, Y0 - far), QX1 = Math.min(W - 1, X1 + far), QY1 = Math.min(H - 1, Y1 + far), qw = QX1 - QX0 + 1, qh = QY1 - QY0 + 1;
        const near = [];
        units.forEach((v, n) => { if (n !== m && box[n][0] <= QX1 && box[n][2] >= QX0 && box[n][1] <= QY1 && box[n][3] >= QY0) near.push({ v, n }); });
        const one = new Grid(w, h, 0, 0, res);
        for (const i of u.own) one.data[((i / W) | 0) - Y0 >= 0 ? (((i / W) | 0) - Y0) * w + (i % W) - X0 : 0] = 1;
        let added = false;
        if (solid && solid.width === W) {
          for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
            const i = y * W + x, j = (y - Y0) * w + x - X0, q = (y - QY0) * qw + x - QX0;
            if (one.data[j] || labels[i] !== c) continue;
            const dmq = distAt(m, x, y);
            if (dmq > far) continue;
            if (!(solid.data[i] || (edge && edge.data[i]))) continue;
            if (near.some(({ v, n }) => v.set.has(i) || distAt(n, x, y) < dmq)) continue;
            one.data[j] = 1; added = true;
          }
        }
        const rr = added ? close : r;
        const shape = fillHoles(offsetMask(offsetMask(one, rr), -rr));
        const loops = traceBinary(shape, X0, Y0);
        let outer = loops[0];
        for (const l of loops) if (Math.abs(signedArea(l)) > Math.abs(signedArea(outer))) outer = l;
        out.push({ polygon: outer ? simplifyClosed(outer, smoothing) : u.polygon, label: u.label, parts: u.n });
      });
      continue;
    }
    const one = new Grid(W, H, 0, 0, res);
    for (let i = 0; i < W * H; i++) if (labels[i] === c) one.data[i] = 1;
    const loops = traceBinary(one);
    if (!loops.length) continue;
    let outer = loops[0];
    for (const l of loops) if (Math.abs(signedArea(l)) > Math.abs(signedArea(outer))) outer = l;
    out.push({ polygon: simplifyClosed(outer, smoothing), label: groupLabel(parts), parts: parts.length });
  }
  return out;
}

/** The AI's outlines without group outlines (one round several tools that each have their own). */
export function withoutGroups(shapes, sheet) {
  if (shapes.length < 3) return shapes;
  const W = sheet.image.width, H = sheet.image.height, res = 1 / sheet.pxPerMm;
  const frame = { width: W, height: H, x0: 0, y0: 0, res };
  const own = shapes.map((sh) => polygonIndices(frame, sh.polygon));
  const sets = own.map((px) => new Set(px));
  const boxes = shapes.map((sh) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of sh.polygon) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; });
  const meet = (a, b) => boxes[a][0] <= boxes[b][2] && boxes[b][0] <= boxes[a][2] && boxes[a][1] <= boxes[b][3] && boxes[b][1] <= boxes[a][3];
  const share = (a, b) => { if (!own[a].length || !meet(a, b)) return 0; let n = 0; for (const i of own[a]) if (sets[b].has(i)) n++; return n / own[a].length; };
  return shapes.filter((_, g) => {
    const inner = shapes.map((__, j) => j).filter((j) => j !== g && share(j, g) >= 0.7);
    if (inner.length < 2) return true;
    const covered = new Set(); for (const j of inner) for (const i of own[j]) covered.add(i);
    let n = 0; for (const i of own[g]) if (covered.has(i)) n++;
    return n < 0.85 * own[g].length;
  });
}
