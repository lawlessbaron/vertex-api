// One outline around the whole thing. The AI often outlines the parts of an
// object (every key in a hex key set, but not the holder they sit in). A
// pocket in a bin has to fit the whole object, so: the AI's outlines, plus
// the dark silhouette on the paper wherever it touches them, closed over small
// gaps, and outlined once around the outside.
import { Grid, boxBlur, components, fillHoles, fillPolygon, offsetMask, traceContours } from '../geometry/raster.js';
import { signedArea, simplifyClosed } from '../geometry/polygon.js';

/**
 * What on the sheet is a thing, not paper or its shadow. A shadow is the
 * paper's own grey, only a little darker, with a soft edge; so a pixel counts
 * when it's coloured (a green handle), much darker than the paper (black
 * plastic, dark steel), or on a sharp edge (the rim of a bright chrome tip,
 * which is as light as the paper). Sharp edges are only used near the AI's
 * outlines (wholeOutlines), so paper creases elsewhere don't count.
 * @returns { solid: Grid, edge: Grid } masks in the sheet's pixels
 */
export function objectPixels(img, pxPerMm, { vivid = 45, dark = 0.55, sharp = 70, shadowFloor = 0.3 } = {}) {
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
 * @returns [{ polygon, label, parts }] in mm
 */
export function wholeOutlines(shapes, sheet, { mask = null, gap = 2, reach = 8, minArea = 30, smoothing = 0.3, separate = 0.8 } = {}) {
  if (!shapes.length) return [];
  const W = sheet.image.width, H = sheet.image.height, k = sheet.pxPerMm, res = 1 / k;
  // Each outline as pixels, to see which hold which.
  const own = shapes.map((sh) => { const one = new Grid(W, H, 0, 0, res); fillPolygon(one, sh.polygon, 1); const px = []; for (let i = 0; i < W * H; i++) if (one.data[i] >= 0.5) px.push(i); return px; });
  const sets = own.map((px) => new Set(px));
  const share = (a, b) => { if (!own[a].length) return 0; let n = 0; for (const i of own[a]) if (sets[b].has(i)) n++; return n / own[a].length; }; // how much of a lies in b
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
  if (drop.size) return wholeOutlines(shapes.filter((_, i) => !drop.has(i)), sheet, { mask, gap, reach, minArea, smoothing, separate });
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
  const covered = new Int32Array(count + 1);
  for (let i = 0; i < W * H; i++) { const l = labels[i]; if (l && cover[i]) covered[l]++; }
  // One outline mostly inside another (a key inside its holder's outline) makes them one thing.
  const nested = (idx) => idx.some((a) => idx.some((b) => a !== b && share(a, b) >= 0.6));
  const out = [];
  for (let c = 1; c <= count; c++) {
    if (sizes[c] * res * res < minArea) continue;
    const idx = shapes.map((_, i) => i).filter((i) => owner[i] === c), parts = idx.map((i) => shapes[i]);
    if (!parts.length) continue; // only silhouette: not something the AI saw
    if (parts.length > 1 && covered[c] >= separate * sizes[c] && !nested(idx)) {
      // Each tool on its own, snapped to its real edge: its outline plus the
      // silhouette just round it (not inside another tool's outline), closed and traced.
      const near = Math.max(1, Math.round(3 * k));
      idx.forEach((pi) => {
        const one = new Grid(W, H, 0, 0, res);
        for (const i of own[pi]) one.data[i] = 1;
        if (solid && solid.width === W) {
          const band = offsetMask(one, near);
          for (let i = 0; i < W * H; i++) if (!one.data[i] && band.data[i] >= 0.5 && labels[i] === c && solid.data[i] && !idx.some((o) => o !== pi && sets[o].has(i))) one.data[i] = 1;
        }
        const shape = fillHoles(offsetMask(offsetMask(one, r), -r));
        const loops = traceContours(boxBlur(shape, 1), 0.5);
        let outer = loops[0];
        for (const l of loops) if (Math.abs(signedArea(l)) > Math.abs(signedArea(outer))) outer = l;
        out.push({ polygon: outer ? simplifyClosed(outer, smoothing) : shapes[pi].polygon, label: shapes[pi].label || '', parts: 1 });
      });
      continue;
    }
    const one = new Grid(W, H, 0, 0, res);
    for (let i = 0; i < W * H; i++) if (labels[i] === c) one.data[i] = 1;
    const loops = traceContours(boxBlur(one, 1), 0.5);
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
  const own = shapes.map((sh) => { const one = new Grid(W, H, 0, 0, res); fillPolygon(one, sh.polygon, 1); const px = []; for (let i = 0; i < W * H; i++) if (one.data[i] >= 0.5) px.push(i); return px; });
  const sets = own.map((px) => new Set(px));
  const share = (a, b) => { if (!own[a].length) return 0; let n = 0; for (const i of own[a]) if (sets[b].has(i)) n++; return n / own[a].length; };
  return shapes.filter((_, g) => {
    const inner = shapes.map((__, j) => j).filter((j) => j !== g && share(j, g) >= 0.7);
    if (inner.length < 2) return true;
    const covered = new Set(); for (const j of inner) for (const i of own[j]) covered.add(i);
    let n = 0; for (const i of own[g]) if (covered.has(i)) n++;
    return n < 0.85 * own[g].length;
  });
}
