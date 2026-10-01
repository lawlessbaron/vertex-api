// Photo → tool outlines. Works on plain {width, height, data: RGBA} images so it
// runs in the browser (ImageData) and in tests.
import { Grid, boxBlur, components, distanceToForeground, fillHoles, offsetMask, traceContours } from '../geometry/raster.js';
import { partByNecks } from './split.js';
import { backgroundToPaper } from './background.js';
import { boxMean, canny, gaussian, greyscale, paperLevel, preprocess, PREP_DEFAULTS } from './prep.js';
import { watershed } from './watershed.js';
import { signedArea, simplifyClosed } from '../geometry/polygon.js';

export const PAPER_SIZES = {
  a4: { name: 'A4', w: 210, h: 297 },
  letter: { name: 'US Letter', w: 215.9, h: 279.4 },
  a5: { name: 'A5', w: 148, h: 210 },
  a3: { name: 'A3', w: 297, h: 420 },
};

const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

export function otsu(values) {
  const hist = new Float64Array(256);
  for (let i = 0, n = values.length; i < n; i++) { const v = values[i] | 0; hist[v < 0 ? 0 : v > 255 ? 255 : v]++; }
  const total = values.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; threshold = t; }
  }
  return threshold;
}

// Find the sheet of paper. Returns corners [topLeft, topRight, bottomRight,
// bottomLeft] in image pixels, or null.
//
// A paper-like patch near the middle of the photo (bright, and nearly
// colourless) and the photo's own border are flooded outwards together
// (watershed.js), each crossing the gentlest colour change first. They meet
// at the paper's edge, the sharpest step around it, so glare, a vignette, a
// hand's shadow or a light desk don't move it. Then a straight line is
// fitted to each side (ignoring a tool that hangs over the edge) and the
// corners are where the lines cross.
export function detectPaper(img) {
  const scale = Math.min(1, 480 / Math.max(img.width, img.height));
  const w = Math.max(8, Math.round(img.width * scale)), h = Math.max(8, Math.round(img.height * scale));
  // Average each block of the photo (not just one pixel), which also calms noise.
  const rgb = new Uint8ClampedArray(w * h * 3), lums = new Float32Array(w * h), sat = new Float32Array(w * h);
  const step = 1 / scale;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx0 = Math.floor(x * step), sy0 = Math.floor(y * step);
    const sx1 = Math.min(img.width, Math.max(sx0 + 1, Math.floor((x + 1) * step))), sy1 = Math.min(img.height, Math.max(sy0 + 1, Math.floor((y + 1) * step)));
    let r = 0, g = 0, b = 0, n = 0;
    for (let yy = sy0; yy < sy1; yy += 1) for (let xx = sx0; xx < sx1; xx += 1) { const i = (yy * img.width + xx) * 4; r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++; }
    r /= n; g /= n; b /= n;
    const p = y * w + x;
    rgb[p * 3] = r; rgb[p * 3 + 1] = g; rgb[p * 3 + 2] = b;
    lums[p] = 0.299 * r + 0.587 * g + 0.114 * b;
    const mx = Math.max(r, g, b);
    sat[p] = mx > 0 ? (mx - Math.min(r, g, b)) / mx : 0;
  }
  // Paper markers: the brightest, least colourful quarter of the middle of the photo.
  const mid = [];
  for (let y = Math.floor(h * 0.3); y < h * 0.7; y++) for (let x = Math.floor(w * 0.25); x < w * 0.75; x++) mid.push(y * w + x);
  const bright = mid.map((p) => lums[p]).sort((a, c) => a - c)[Math.floor(mid.length * 0.75)];
  const labels = new Uint8Array(w * h);
  let seeds = 0;
  for (const p of mid) if (lums[p] >= bright * 0.96 && sat[p] < 0.3) { labels[p] = 1; seeds++; }
  if (seeds < 20) return detectPaperSimple(img);
  // Not-paper markers: the photo's border, except where it looks like paper (a sheet cut off by the frame).
  const band = Math.max(2, Math.round(Math.min(w, h) * 0.015));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x >= band && y >= band && x < w - band && y < h - band) continue;
    const p = y * w + x;
    if (!(lums[p] >= bright * 0.85 && sat[p] < 0.3)) labels[p] = 2;
  }
  watershed(rgb, w, h, labels);
  const g = new Grid(w, h);
  for (let i = 0; i < w * h; i++) g.data[i] = labels[i] === 1 ? 1 : 0;
  fillHoles(g);
  const { labels: comp, count, sizes } = components(g);
  if (!count) return null;
  let best = 1;
  for (let k = 2; k <= count; k++) if (sizes[k] > sizes[best]) best = k;
  if (sizes[best] < w * h * 0.05) return null;
  // Rough corners from the extremes, then straight sides fitted to the edge.
  let tl = null, br = null, tr = null, bl = null;
  const edge = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (comp[p] !== best) continue;
    const s = x + y, d = x - y;
    if (!tl || s < tl.s) tl = { s, x, y };
    if (!br || s > br.s) br = { s, x, y };
    if (!tr || d > tr.d) tr = { d, x, y };
    if (!bl || d < bl.d) bl = { d, x, y };
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || comp[p - 1] !== best || comp[p + 1] !== best || comp[p - w] !== best || comp[p + w] !== best) edge.push([x + 0.5, y + 0.5]);
  }
  let quad = quadFromLines(edge, Math.hypot(w, h), sizes[best]);
  if (!quad) {
    quad = [tl, tr, br, bl].map((q) => [q.x + 0.5, q.y + 0.5]);
    const refined = fitSides(quad, edge, Math.hypot(w, h));
    if (refined) quad = refined;
  }
  return quad.map(([x, y]) => [x / scale, y / scale]);
}

// The paper's four sides are the four strongest straight lines around it:
// found one at a time (RANSAC: try lines through pairs of edge points, keep
// the one most points lie on), so a tool hanging over one side only adds a
// short line of its own and can't drag a corner. Returns the corners
// [tl, tr, br, bl], or null if four sensible sides aren't there.
function quadFromLines(edge, diag, area) {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let pts = edge.slice();
  const found = [];
  for (let k = 0; k < 7 && pts.length > 20; k++) {
    let best = null, bestN = 0;
    for (let it = 0; it < 300; it++) {
      const a = pts[Math.floor(rnd() * pts.length)], b = pts[Math.floor(rnd() * pts.length)];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < diag * 0.1) continue;
      const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
      let n = 0;
      for (const p of pts) if (Math.abs((p[0] - a[0]) * nx + (p[1] - a[1]) * ny) < 1.5) n++;
      if (n > bestN) { bestN = n; best = { a, nx, ny }; }
    }
    if (!best || bestN < diag * 0.08) break;
    const inl = pts.filter((p) => Math.abs((p[0] - best.a[0]) * best.nx + (p[1] - best.a[1]) * best.ny) < 1.5);
    pts = pts.filter((p) => Math.abs((p[0] - best.a[0]) * best.nx + (p[1] - best.a[1]) * best.ny) >= 2.5);
    // Least squares through the inliers.
    const mx = inl.reduce((t, p) => t + p[0], 0) / inl.length, my = inl.reduce((t, p) => t + p[1], 0) / inl.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const [x, y] of inl) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    found.push({ mx, my, dx: Math.cos(ang), dy: Math.sin(ang), n: inl.length, ang: ((ang % Math.PI) + Math.PI) % Math.PI });
  }
  if (found.length < 4) return null;
  // Two families of sides (roughly across and roughly up the photo); in each, the two best-supported lines well apart.
  const across = found.filter((l) => Math.min(l.ang, Math.PI - l.ang) < Math.PI / 4).sort((a, b) => b.n - a.n);
  const down = found.filter((l) => Math.min(l.ang, Math.PI - l.ang) >= Math.PI / 4).sort((a, b) => b.n - a.n);
  const pair = (ls, dist) => {
    for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) if (dist(ls[i], ls[j]) > diag * 0.15) return [ls[i], ls[j]];
    return null;
  };
  const h2 = pair(across, (a, b) => Math.abs(a.my - b.my)), v2 = pair(down, (a, b) => Math.abs(a.mx - b.mx));
  if (!h2 || !v2) return null;
  const cross = (l1, l2) => {
    const det = l1.dx * l2.dy - l1.dy * l2.dx;
    if (Math.abs(det) < 1e-6) return null;
    const t = ((l2.mx - l1.mx) * l2.dy - (l2.my - l1.my) * l2.dx) / det;
    return [l1.mx + l1.dx * t, l1.my + l1.dy * t];
  };
  const [top, bottom] = h2[0].my < h2[1].my ? h2 : [h2[1], h2[0]];
  const [left, right] = v2[0].mx < v2[1].mx ? v2 : [v2[1], v2[0]];
  const q = [cross(top, left), cross(top, right), cross(bottom, right), cross(bottom, left)];
  if (q.some((c) => !c)) return null;
  // The quad should be about as big as the paper region found.
  let qa = 0;
  for (let i = 0; i < 4; i++) { const [x1, y1] = q[i], [x2, y2] = q[(i + 1) % 4]; qa += x1 * y2 - x2 * y1; }
  qa = Math.abs(qa) / 2;
  return qa > area * 0.8 && qa < area * 1.25 ? q : null;
}

// Fit a straight line to the edge points along each side of a rough quad
// (least squares, twice, dropping points that stray, like a tool over the
// edge), and return where neighbouring lines cross. Null if a side has too
// few points or a corner would move implausibly far.
function fitSides(quad, edge, diag) {
  const lines = [];
  for (let k = 0; k < 4; k++) {
    const a = quad[k], b = quad[(k + 1) % 4];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
    let pts = edge.filter(([x, y]) => {
      const t = ((x - a[0]) * (b[0] - a[0]) + (y - a[1]) * (b[1] - a[1])) / (len * len);
      return t > 0.08 && t < 0.92 && Math.abs((x - a[0]) * nx + (y - a[1]) * ny) < Math.max(4, diag * 0.02);
    });
    let line = null;
    for (let pass = 0; pass < 3; pass++) {
      if (pts.length < 8) return null;
      const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      let sxx = 0, syy = 0, sxy = 0;
      for (const [x, y] of pts) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
      const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
      line = { mx, my, dx: Math.cos(ang), dy: Math.sin(ang) };
      const dist = ([x, y]) => Math.abs((x - mx) * line.dy - (y - my) * line.dx);
      const keep = pts.filter((p) => dist(p) < 1.5);
      if (keep.length === pts.length) break;
      pts = keep;
    }
    lines.push(line);
  }
  const out = [];
  for (let k = 0; k < 4; k++) {
    const l1 = lines[(k + 3) % 4], l2 = lines[k];
    const det = l1.dx * l2.dy - l1.dy * l2.dx;
    if (Math.abs(det) < 1e-6) return null;
    const t = ((l2.mx - l1.mx) * l2.dy - (l2.my - l1.my) * l2.dx) / det;
    const c = [l1.mx + l1.dx * t, l1.my + l1.dy * t];
    if (Math.hypot(c[0] - quad[k][0], c[1] - quad[k][1]) > diag * 0.08) return null;
    out.push(c);
  }
  return out;
}

// The first way of finding the paper: the largest bright region. Kept as the
// fallback when the flood below can't find a paper-like patch to start from.
export function detectPaperSimple(img) {
  const scale = Math.min(1, 400 / Math.max(img.width, img.height));
  const w = Math.max(8, Math.round(img.width * scale));
  const h = Math.max(8, Math.round(img.height * scale));
  const g = new Grid(w, h);
  const lums = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, Math.floor((x + 0.5) / scale));
      const sy = Math.min(img.height - 1, Math.floor((y + 0.5) / scale));
      lums[y * w + x] = lum(img.data, (sy * img.width + sx) * 4);
    }
  }
  const t = otsu(lums);
  for (let i = 0; i < w * h; i++) g.data[i] = lums[i] > t ? 1 : 0;
  const { labels, count, sizes } = components(g);
  if (!count) return null;
  let best = 1;
  for (let k = 2; k <= count; k++) if (sizes[k] > sizes[best]) best = k;
  if (sizes[best] < w * h * 0.05) return null;
  // Extreme points of x+y and x-y give the four corners of a convex quad.
  let tl = null, br = null, tr = null, bl = null;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (labels[y * w + x] !== best) continue;
      const s = x + y, d = x - y;
      if (!tl || s < tl.s) tl = { s, x, y };
      if (!br || s > br.s) br = { s, x, y };
      if (!tr || d > tr.d) tr = { d, x, y };
      if (!bl || d < bl.d) bl = { d, x, y };
    }
  }
  const back = (p) => [(p.x + 0.5) / scale, (p.y + 0.5) / scale];
  return [back(tl), back(tr), back(br), back(bl)];
}

// Solve the 3x3 homography mapping src[i] -> dst[i] (4 point pairs).
export function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const h = solve(A, b);
  return [...h, 1];
}

function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const pivot = M[c][c] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / pivot;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / (row[i] || 1e-12));
}

export function applyH(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

// Rectify the paper to a top-down image at `pxPerMm`. Portrait or landscape
// is chosen to match the quad. Returns { image, widthMm, heightMm, pxPerMm }.
export function rectify(img, corners, paper = PAPER_SIZES.a4, pxPerMm = 4) {
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const top = (d(corners[0], corners[1]) + d(corners[3], corners[2])) / 2;
  const side = (d(corners[0], corners[3]) + d(corners[1], corners[2])) / 2;
  const landscape = top > side;
  const widthMm = landscape ? Math.max(paper.w, paper.h) : Math.min(paper.w, paper.h);
  const heightMm = landscape ? Math.min(paper.w, paper.h) : Math.max(paper.w, paper.h);
  const W = Math.round(widthMm * pxPerMm), Hh = Math.round(heightMm * pxPerMm);
  // Map output pixels back into the photo.
  const H = homography([[0, 0], [W, 0], [W, Hh], [0, Hh]], corners);
  const out = { width: W, height: Hh, data: new Uint8ClampedArray(W * Hh * 4) };
  const src = img.data, sw = img.width, sh = img.height;
  for (let y = 0; y < Hh; y++) {
    for (let x = 0; x < W; x++) {
      const [sx, sy] = applyH(H, x + 0.5, y + 0.5);
      const x0 = Math.floor(sx - 0.5), y0 = Math.floor(sy - 0.5);
      const fx = sx - 0.5 - x0, fy = sy - 0.5 - y0;
      const o = (y * W + x) * 4;
      for (let c = 0; c < 4; c++) {
        const at = (xx, yy) => src[(Math.min(sh - 1, Math.max(0, yy)) * sw + Math.min(sw - 1, Math.max(0, xx))) * 4 + c];
        out.data[o + c] =
          at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy) +
          at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy;
      }
    }
  }
  return { image: out, widthMm, heightMm, pxPerMm };
}

// Light is rarely even across a sheet: a lamp on one side leaves the far edge
// darker, and with a few tools on the page that darker paper starts to look
// like a tool. So the paper's own brightness is measured in a grid of patches
// (the brightest few percent of each patch, which is paper unless a tool
// covers all of it), patches covered by a tool are filled in from the paper
// around them, and the photo is evened out so the paper reads the same all over.
// The same photo is evened out more than once in a trace (the shadow test and
// the cast-shadow test): keep the answer per photo.
const evenCache = new WeakMap();
export function evenLight(img, cells = 24) {
  const hit = evenCache.get(img);
  if (hit && hit.cells === cells && hit.data === img.data) return hit.out;
  const out = evenLightRaw(img, cells);
  evenCache.set(img, { cells, data: img.data, out });
  return out;
}

function evenLightRaw(img, cells) {
  const W = img.width, H = img.height, d = img.data;
  const cs = Math.max(4, Math.ceil(Math.max(W, H) / cells));
  const cw = Math.ceil(W / cs), ch = Math.ceil(H / cs);
  const hists = Array.from({ length: cw * ch }, () => new Uint32Array(64));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    hists[((y / cs) | 0) * cw + ((x / cs) | 0)][lum(d, (y * W + x) * 4) >> 2]++;
  }
  const bright = hists.map((h) => {
    let total = 0;
    for (const c of h) total += c;
    let acc = 0;
    for (let v = 63; v >= 0; v--) if ((acc += h[v]) >= total * 0.08) return v * 4 + 2;
    return 0;
  });
  // A patch is paper if it's nearly as bright as the brightest patch near it.
  const ok = bright.map((b, k) => {
    const cx = k % cw, cy = (k / cw) | 0;
    let best = 0;
    for (let y = Math.max(0, cy - 2); y <= Math.min(ch - 1, cy + 2); y++)
      for (let x = Math.max(0, cx - 2); x <= Math.min(cw - 1, cx + 2); x++) best = Math.max(best, bright[y * cw + x]);
    return b >= best * 0.9 && b > 40;
  });
  if (!ok.some(Boolean)) return img;
  // Fill tool-covered patches from their paper neighbours, spreading outward.
  const level = bright.map((b, k) => (ok[k] ? b : 0));
  let known = ok.slice();
  for (let pass = 0; pass < cw + ch && known.some((k) => !k); pass++) {
    const next = known.slice();
    for (let k = 0; k < level.length; k++) {
      if (known[k]) continue;
      const cx = k % cw, cy = (k / cw) | 0;
      let sum = 0, cnt = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= cw || y >= ch || !known[y * cw + x]) continue;
        sum += level[y * cw + x]; cnt++;
      }
      if (cnt) { level[k] = sum / cnt; next[k] = true; }
    }
    known = next;
  }
  const ref = Math.max(...level);
  // Smooth the patch levels a little so no patch edge shows, then even the photo
  // out, blending between patch centres.
  const smooth = level.map((_, k) => {
    const cx = k % cw, cy = (k / cw) | 0;
    let sum = 0, cnt = 0;
    for (let y = Math.max(0, cy - 1); y <= Math.min(ch - 1, cy + 1); y++)
      for (let x = Math.max(0, cx - 1); x <= Math.min(cw - 1, cx + 1); x++) { sum += level[y * cw + x]; cnt++; }
    return sum / cnt;
  });
  const out = new Uint8ClampedArray(d.length);
  for (let y = 0; y < H; y++) {
    const fy = Math.min(ch - 1, Math.max(0, (y + 0.5) / cs - 0.5)), y0 = Math.floor(fy), y1 = Math.min(ch - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(cw - 1, Math.max(0, (x + 0.5) / cs - 0.5)), x0 = Math.floor(fx), x1 = Math.min(cw - 1, x0 + 1), tx = fx - x0;
      const l = (smooth[y0 * cw + x0] * (1 - tx) + smooth[y0 * cw + x1] * tx) * (1 - ty) + (smooth[y1 * cw + x0] * (1 - tx) + smooth[y1 * cw + x1] * tx) * ty;
      const g = ref / Math.max(8, l), i = (y * W + x) * 4;
      out[i] = d[i] * g; out[i + 1] = d[i + 1] * g; out[i + 2] = d[i + 2] * g; out[i + 3] = 255;
    }
  }
  return { width: W, height: H, data: out };
}

// The paper's colour: the middle colour of the brightest part of the sheet, so
// it stays right even when tools cover most of the page.
export function paperColour(img) {
  const n = img.width * img.height, d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i += 3) hist[lum(d, i * 4) | 0]++;
  let acc = 0, cut = 255;
  const sampled = Math.ceil(n / 3);
  for (let v = 255; v >= 0; v--) if ((acc += hist[v]) >= sampled * 0.3) { cut = v; break; }
  const cutoff = Math.max(0, cut - 12);
  return [0, 1, 2].map((c) => {
    const h = new Uint32Array(256);
    let total = 0;
    for (let i = 0; i < n; i += 3) if (lum(d, i * 4) >= cutoff) { h[d[i * 4 + c]]++; total++; }
    let a = 0;
    for (let v = 0; v < 256; v++) if ((a += h[v]) >= total / 2) return v;
    return 255;
  });
}

// "Not paper" score per pixel: colour distance from the paper, whose colour is
// the per-channel median (paper covers most of the rectified sheet).
//
// Shadows fool a plain colour distance: they're darker than the paper, so they
// look like part of the tool. But a shadow is the paper's own colour, only
// dimmer, and smooth, with a soft edge. So a patch that keeps the paper's hue,
// is 30% to 97% as bright, is smooth, and fades softly into the paper is treated
// as shadow and its score is cut by `shadows` (0 = off, 1 = ignore completely).
// Tools stay: dark ones are darker than any soft shadow, coloured ones change
// the hue, bare metal has texture, and even a flat grey tool has a sharp edge.
// `raw`, when given, is this image's score with shadows off (it's reused, not changed).
export function objectScore(img, shadows = 0, pxPerMm = 4, raw = null) {
  const n = img.width * img.height;
  const d = img.data;
  const paper = paperColour(img);
  let s;
  if (raw) s = raw.slice();
  else {
    s = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const dr = d[i * 4] - paper[0], dg = d[i * 4 + 1] - paper[1], db = d[i * 4 + 2] - paper[2];
      s[i] = Math.min(255, Math.sqrt(dr * dr + dg * dg + db * db));
    }
  }
  if (!(shadows > 0)) return s;
  const paperL = Math.max(1, 0.299 * paper[0] + 0.587 * paper[1] + 0.114 * paper[2]);
  const pSum = Math.max(1, paper[0] + paper[1] + paper[2]);
  const pc = paper.map((v) => v / pSum);
  // Local smoothness: the standard deviation of brightness over about 1 mm.
  const L = new Grid(img.width, img.height), L2 = new Grid(img.width, img.height);
  for (let i = 0; i < n; i++) { const l = lum(d, i * 4); L.data[i] = l; L2.data[i] = l * l; }
  const mean = boxBlur(L, 2), mean2 = boxBlur(L2, 2);
  const keep = 1 - Math.min(1, shadows);
  // Shadow-like pixels: the paper's hue, dimmer, and smooth.
  const like = new Grid(img.width, img.height);
  const objectish = Math.min(otsu(s), PALE_CUT) * 0.5; // anything the trace could pick up
  const paperYellow = (paper[1] - paper[2]) / paperL;
  for (let i = 0; i < n; i++) {
    if (s[i] < objectish) continue;
    const ratio = L.data[i] / paperL;
    if (ratio < 0.3 || ratio > 0.97) continue;
    const sum = Math.max(1, d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]);
    const hue = (Math.abs(d[i * 4] / sum - pc[0]) + Math.abs(d[i * 4 + 1] / sum - pc[1]) + Math.abs(d[i * 4 + 2] / sum - pc[2])) * 255;
    const sd = Math.sqrt(Math.max(0, mean2.data[i] - mean.data[i] ** 2));
    // Darker shadows pick up more of a tint (sky, light bounced off a red
    // handle next to them, JPEG), so allow more the darker it is. A coloured
    // tool is still far off: a red handle is 100 or more. But a shadow never
    // turns yellower than the paper it falls on, whatever the light (the paper
    // is lit by the same light), while cream grips, wood and brass do: so
    // yellow keeps the old, tight allowance, and clearly yellow isn't shadow.
    const yellow = (d[i * 4 + 1] - d[i * 4 + 2]) / Math.max(1, L.data[i]) - paperYellow;
    if (yellow > 0.06) continue;
    if (hue < 12 + (yellow < 0.04 ? 30 : 8) * (1 - ratio) && sd < 10) like.data[i] = 1;
  }
  // The most tinted bits of a shadow (right beside a red handle) still fall
  // out, leaving holes that break the shadow up and look like edges inside it.
  fillHoles(like);
  // A flat grey tool looks just like that inside, but it has a sharp outline,
  // and right on a sharp edge the brightness varies a lot, so those pixels
  // aren't shadow-like. A tool's smooth inside is ringed by that busy edge; a
  // shadow fades into bare paper. So each smooth patch is kept when most of the
  // pixels just outside it are busy edge (not paper, and not a dark tool: a
  // shadow beside a black tool is still a shadow).
  const W = img.width, H = img.height;
  const { labels, count } = components(like);
  // soft: how much of its edge fades straight into bare paper. A shadow's
  // outer edge does; a grey tool (even one the paper's own tint, like steel
  // in warm light) meets the paper at a sharp edge, never softly.
  const ringed = new Float64Array(count + 1), border = new Uint32Array(count + 1), soft = new Uint32Array(count + 1);
  // For hard shadows (sunlight, a bare bulb): how flat the patch is, how much
  // of its edge meets the darker or coloured tool casting it, and how much
  // meets bright paper straight away.
  const flat = new Float64Array(count + 1), size = new Uint32Array(count + 1), caster = new Uint32Array(count + 1), bright = new Uint32Array(count + 1);
  // How bright each patch is, and which way its caster lies (for the light's direction).
  const shade = new Float64Array(count + 1), towardX = new Float64Array(count + 1), towardY = new Float64Array(count + 1);
  const hueOf = (q) => { const sum = Math.max(1, d[q * 4] + d[q * 4 + 1] + d[q * 4 + 2]); return (Math.abs(d[q * 4] / sum - pc[0]) + Math.abs(d[q * 4 + 1] / sum - pc[1]) + Math.abs(d[q * 4 + 2] / sum - pc[2])) * 255; };
  for (let i = 0; i < n; i++) {
    const k = labels[i];
    if (!k) continue;
    size[k]++;
    shade[k] += L.data[i] / paperL;
    flat[k] += Math.sqrt(Math.max(0, mean2.data[i] - mean.data[i] ** 2));
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x1 = x + dx, y1 = y + dy;
      if (x1 < 0 || y1 < 0 || x1 >= W || y1 >= H) continue;
      const j = y1 * W + x1;
      if (labels[j] === k) continue;
      border[k]++;
      // Soft: bare paper, or a small step up with bare paper just beyond (a shadow's last edge).
      // The fade can be a millimetre or more wide, so look 3 and 6 pixels on.
      const at = (t) => { const x2 = x1 + dx * t, y2 = y1 + dy * t; return x2 >= 0 && y2 >= 0 && x2 < W && y2 < H ? y2 * W + x2 : j; };
      const j2 = at(3), j3 = at(6);
      const paperish = (q) => s[q] < objectish || L.data[q] / paperL > 0.97;
      const rising = L.data[j] - L.data[i] < 25 && L.data[j] >= L.data[i];
      if (paperish(j) || (rising && (paperish(j2) || (paperish(j3) && L.data[j2] >= L.data[j])))) soft[k]++;
      const sdj = Math.sqrt(Math.max(0, mean2.data[j] - mean.data[j] ** 2));
      if (s[j] >= objectish && L.data[j] / paperL >= 0.3 && sdj >= 14) ringed[k]++; // a real edge, busier than any shadow's fade
      if (L.data[j] / paperL > 0.9) bright[k]++;
      else if (L.data[j] < L.data[i] - 25 || hueOf(j) > 25) { caster[k]++; towardX[k] += dx; towardY[k] += dy; }
    }
  }
  const isShadow = new Uint8Array(count + 1);
  for (let k = 1; k <= count; k++) {
    // It fades into the paper: a shadow.
    const fades = soft[k] >= border[k] * 0.2 && ringed[k] < border[k] * 0.6;
    // Or a hard-edged shadow: flatter than any tool's surface, cast by the
    // darker or coloured tool along one side, bright paper along the rest.
    const hard = size[k] > 40 && flat[k] / size[k] < 6 && caster[k] >= border[k] * 0.08 && bright[k] >= border[k] * 0.25 && ringed[k] < border[k] * 0.75;
    if (fades || hard) isShadow[k] = 1;
  }
  betweenTools(s, { labels, count, isShadow, like, size, shade, flat, border, ringed, towardX, towardY, caster, objectish, W, H, pxPerMm });
  for (let i = 0; i < n; i++) {
    // Discounting by a share alone leaves a near-black sunlit shadow standing
    // out, so the discounted score is also capped: at the default setting
    // (0.75) any shadow ends up under the cut-off; at 0.5 or less, dark ones
    // start to count again.
    if (isShadow[labels[i]] && labels[i]) s[i] = Math.min(s[i] * keep, 4 * objectish * keep);
  }
  return s;
}

// A shadow that falls in the gap between two tools lying close never reaches
// bare paper, so it can't be told by how it fades, and the two tools merge
// through it. But every shadow in one photo comes from the same light: they're
// about as bright as each other, as flat, and on the same side of the tool
// casting them. So the shadows already found teach what this photo's shadows
// look like, and a patch between tools that matches all three is one too.
// With no clear shadows to learn from (or light from everywhere), nothing changes.
function betweenTools(s, c) {
  const { labels, count, isShadow, like, size, shade, flat, border, ringed, towardX, towardY, caster, objectish, W, H, pxPerMm } = c;
  const big = 50 * pxPerMm * pxPerMm; // 50 mm²: big enough to go by
  let sure = 0, dimmest = Infinity, flattest = 0, vx = 0, vy = 0, cast = 0;
  for (let k = 1; k <= count; k++) {
    if (!isShadow[k] || size[k] < big) continue;
    sure++;
    dimmest = Math.min(dimmest, shade[k] / size[k]);
    flattest = Math.max(flattest, flat[k] / size[k]);
    vx += towardX[k]; vy += towardY[k]; cast += caster[k];
  }
  const len = Math.hypot(vx, vy);
  // The casters have to lie mostly one way: light from one side.
  if (!sure || !cast || len < cast * 0.2) return;
  const ux = vx / len, uy = vy / len, reach = Math.round(12 * pxPerMm);
  const tool = (q, k) => labels[q] !== k && !like.data[q] && s[q] >= objectish;
  for (let k = 1; k <= count; k++) {
    if (isShadow[k] || size[k] < big) continue;
    if (shade[k] / size[k] < dimmest - 0.08 || flat[k] / size[k] > flattest + 0.5 || ringed[k] >= border[k] * 0.6) continue;
    isShadow[k] = 2; // for now: kept only if its caster is on the light's side
  }
  const hits = new Uint32Array(count + 1), tried = new Uint32Array(count + 1);
  for (let i = 0; i < W * H; i += 3) {
    const k = labels[i];
    if (isShadow[k] !== 2) continue;
    tried[k]++;
    const x = i % W, y = (i / W) | 0;
    for (let t = 1; t <= reach; t++) {
      const x1 = Math.round(x + ux * t), y1 = Math.round(y + uy * t);
      if (x1 < 0 || y1 < 0 || x1 >= W || y1 >= H) break;
      const q = y1 * W + x1;
      if (labels[q] === k) continue;
      if (tool(q, k)) hits[k]++;
      break;
    }
  }
  for (let k = 1; k <= count; k++) if (isShadow[k] === 2) isShadow[k] = hits[k] >= tried[k] * 0.6 ? 1 : 0;
}

// The highest the cut-off goes: well clear of paper grain and photo noise, and
// under the colour step of a pale wooden or beige tool.
const PALE_CUT = 48;


/** The most Smoothing (mm of blur) the trace uses: more wipes out the edges. */
export const MAX_BLUR = 1.5;

export const TRACE_DEFAULTS = {
  sensitivity: 0, // shifts the automatic threshold, -50..50
  clearance: 1, // mm added around each tool
  margin: 6, // mm of paper edge ignored
  minArea: 150, // mm²; smaller blobs are dust or shadows
  shadows: 0.75, // how hard to ignore shadows (0 = off, 1 = ignore them completely)
  smoothing: 0.35, // mm simplification tolerance
  // The pre-processing (prep.js): what the three trace sliders set.
  shadowTolerance: 80,
  edgeSensitivity: 65,
  blur: PREP_DEFAULTS.smoothing, // mm, "Smoothing" on the page
};

/**
 * What the built-in trace takes for tools (prep.js): pixels darker than the
 * light around them, and everything inside a crisp outline, with small gaps
 * closed, the insides filled and thin slivers (a shadow's edge) opened away.
 * Returns a Grid (1 = tool) in mm, one pixel per 1/pxPerMm.
 */
export function toolMask(sheet, options = {}) {
  const o = { ...TRACE_DEFAULTS, ...options };
  const k = sheet.pxPerMm;
  // On a cutting mat, a desk or coloured card, the photo is first redrawn as dark tools on white.
  const image = o.background === false ? sheet.image : backgroundToPaper(sheet.image, o.margin * k);
  if (image !== sheet.image) sheet = { ...sheet, image };
  // Over 1.5 mm, blur wipes out the edges and greys the steel (MAX_BLUR).
  const p = preprocess(image, k, { shadowTolerance: o.shadowTolerance, edgeSensitivity: o.edgeSensitivity, smoothing: Math.min(MAX_BLUR, o.blur) });
  const { W, H } = p;
  const g = new Grid(W, H, 0, 0, 1 / k);
  const m = Math.round(o.margin * k);
  const vivid = vividPixels(image, k);
  for (let y = m; y < H - m; y++) for (let x = m; x < W - m; x++) { const i = y * W + x; g.data[i] = p.dark[i] || p.edges[i] || vivid[i] || p.depth[i] < 0.5 ? 1 : 0; }
  const close = Math.round((o.close ?? 1.5) * k), open = Math.round(1 * k);
  const c = offsetMask(offsetMask(g, close), -close);
  fillHoles(c);
  // White, silver and pale tools on white paper: their outline is too faint
  // to survive the blur above, so it's found again on the barely-smoothed photo.
  const pale = o.pale === false ? null : paleOutlines(image, k, m, close, open, o.minArea * k * k);
  if (pale) for (let i = 0; i < c.data.length; i++) if (pale[i]) c.data[i] = 1;
  // Faintly tinted tools: a shadow keeps the paper's tint, these don't.
  let tint = o.tint === false ? null : tintRegions(image, k, m, o.minArea * k * k);
  if (tint) {
    // Only where it finds something the other passes mostly missed, and pulled in
    // by the half-resolution blur it was found at, so it adds no fat to an outline.
    const tg = new Grid(W, H, 0, 0, 1 / k);
    for (let i = 0; i < tint.length; i++) tg.data[i] = tint[i];
    const { labels: tl, count: tc, sizes: ts } = components(tg);
    const hit = new Float64Array(tc + 1);
    for (let i = 0; i < tint.length; i++) if (tl[i] && c.data[i] > 0.5) hit[tl[i]]++;
    const keep = new Uint8Array(tc + 1);
    for (let l = 1; l <= tc; l++) keep[l] = hit[l] < ts[l] * 0.75 ? 1 : 0;
    // All of it (pulled in) still shields the tool from the shadow test below.
    const shrunk = offsetMask(tg, -Math.max(1, Math.round(0.7 * k)));
    tint = new Uint8Array(tint.length);
    for (let i = 0; i < tint.length; i++) if (shrunk.data[i] > 0.5) { tint[i] = 1; if (keep[tl[i]]) c.data[i] = 1; }
  }
  // A shadow with a crisp edge (hard sunlight) gets past the steps above.
  // What gives it away is colour: it's the paper's own colour, only dimmer
  // (shadowPixels). That can only take pixels away, never add them.
  const finish = (m) => offsetMask(offsetMask(m, -open), open);
  if (o.veto === false) return finish(c);
  // Always some: with none, a hard shadow joins the tool and breaks it up.
  const shadow = shadowPixels(sheet, { ...o, shadows: Math.max(0.3, Math.min(1, o.shadowTolerance / 100)) });
  // A pixel under half as bright as the paper around it is tool whatever its
  // colour: a shadow is rarely that deep.
  // A strongly coloured pixel (vivid) is never shadow either: a shadow keeps the paper's colour,
  // and a flat copper tin or plastic case is smooth enough to pass for one otherwise.
  // Inside a pale outline, anything as bright as the paper or brighter is the tool: a shadow is always dimmer.
  const isShadow = (i) => shadow[i] === 1 && p.depth[i] > 0.5 && !vivid[i] && !(tint && tint[i]);
  // In polished metal (pale 2) the dark reflections look just like shadow, but
  // they lie inside the tool; a shadow cast by it runs along bare paper. So a
  // shadow-like patch there is kept as tool unless a third of its edge is paper.
  const metalShadow = pale ? shadowAlongPaper(pale, isShadow, W, H) : null;
  const trimmed = trimShadow(c, (i) => isShadow(i) && !(pale && ((pale[i] === 2 && !metalShadow[i]) || (pale[i] && p.depth[i] >= 0.97))), o.minArea * k * k, k, finish);
  const joined = joinSlivers(edgeBounded(trimmed, c, p.edges, k, finish), o.minArea * k * k, k);
  return o.castShadows === false ? joined : dropCastShadows(joined, image, k, o.minArea * k * k, finish);
}

// Shadow-like pixels inside metal regions (pale 2), grouped; a group counts as
// a real shadow when at least a third of its edge touches the paper outside.
function shadowAlongPaper(pale, isShadow, W, H) {
  const g = new Grid(W, H);
  for (let i = 0; i < W * H; i++) if (pale[i] === 2 && isShadow(i)) g.data[i] = 1;
  const { labels, count } = components(g);
  const edge = new Uint32Array(count + 1), paper = new Uint32Array(count + 1);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x, l = labels[i];
    if (!l) continue;
    for (const j of [i - 1, i + 1, i - W, i + W]) if (labels[j] !== l) { edge[l]++; if (!pale[j]) paper[l]++; }
  }
  const out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { const l = labels[i]; if (l && paper[l] >= edge[l] / 3) out[i] = 1; }
  return out;
}

/**
 * Tools tinted ever so slightly unlike the paper (cool grey steel on warm
 * paper, a pale blue grip): too faint to show in brightness, but a shadow never
 * changes the paper's tint, only its brightness. So, with brightness divided
 * out, anything whose tint stands clear of the paper's is the tool, and a
 * shadow vanishes into the paper. → W*H Uint8Array (1 = tinted), or null.
 */
export function tintRegions(image, k, margin, minPx) {
  // At half resolution: tint changes slowly, and the outline is refined by the other passes.
  const q = 2, W0 = image.width, H0 = image.height, d = image.data;
  const W = Math.floor(W0 / q), H = Math.floor(H0 / q), n = W * H, kq = k / q;
  const c1 = new Grid(W, H), c2 = new Grid(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0;
    for (let dy = 0; dy < q; dy++) for (let dx = 0; dx < q; dx++) { const i = ((y * q + dy) * W0 + x * q + dx) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    const L = Math.max(20 * q * q, (r + g + b) / 3), j = y * W + x;
    c1.data[j] = ((b - r) / L) * 100;
    c2.data[j] = ((2 * g - r - b) / L) * 100;
  }
  const b1 = boxBlur(c1, 1), b2 = boxBlur(c2, 1);
  // The paper's own tint nearby, so a gradual colour cast across the sheet
  // (window light, a warm lamp) counts as paper. Pixels already clearly off the
  // sheet's overall tint are left out of it, so a tool doesn't hide itself.
  const med = (a) => { const v = []; for (let i = 0; i < n; i += 5) v.push(a[i]); v.sort((x, y) => x - y); return v[v.length >> 1]; };
  const g1 = med(b1.data), g2 = med(b2.data);
  const gd = new Float32Array(n);
  for (let j = 0; j < n; j++) gd[j] = Math.hypot(b1.data[j] - g1, b2.data[j] - g2);
  const gs = []; for (let i = 0; i < n; i += 5) gs.push(gd[i]); gs.sort((a, b) => a - b);
  const gt = Math.max(3, gs[gs.length >> 1] * 6);
  const Q = 4, Wc = Math.ceil(W / Q), Hc = Math.ceil(H / Q);
  const w = new Grid(Wc, Hc), v1 = new Grid(Wc, Hc), v2 = new Grid(Wc, Hc);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const j = y * W + x; if (gd[j] > gt) continue;
    const cj = ((y / Q) | 0) * Wc + ((x / Q) | 0);
    w.data[cj]++; v1.data[cj] += b1.data[j]; v2.data[cj] += b2.data[j];
  }
  const R = Math.max(2, Math.round((25 * kq) / Q));
  const sw = boxBlur(boxBlur(w, R), R), s1 = boxBlur(boxBlur(v1, R), R), s2 = boxBlur(boxBlur(v2, R), R);
  const dist = new Float32Array(n);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const j = y * W + x, cj = Math.min(Hc - 1, (y / Q) | 0) * Wc + Math.min(Wc - 1, (x / Q) | 0), ww = sw.data[cj];
    dist[j] = ww > 1e-6 ? Math.hypot(b1.data[j] - s1.data[cj] / ww, b2.data[j] - s2.data[cj] / ww) : gd[j];
  }
  const sample = []; for (let i = 0; i < n; i += 5) sample.push(dist[i]); sample.sort((a, b) => a - b);
  const t = Math.max(3, sample[sample.length >> 1] * 6);
  const mg = Math.ceil(margin / q), m = new Grid(W, H, 0, 0, 1);
  for (let y = mg; y < H - mg; y++) for (let x = mg; x < W - mg; x++) { const j = y * W + x; if (dist[j] > t) m.data[j] = 1; }
  const step = Math.max(1, Math.round(kq));
  const g = offsetMask(offsetMask(m, step), -step);
  fillHoles(g);
  const op = offsetMask(offsetMask(g, -step), step);
  const { labels, sizes } = components(op);
  const minQ = minPx / (q * q);
  let any = false;
  const out = new Uint8Array(W0 * H0);
  for (let y = 0; y < H0; y++) for (let x = 0; x < W0; x++) {
    const l = labels[Math.min(H - 1, (y / q) | 0) * W + Math.min(W - 1, (x / q) | 0)];
    if (l && sizes[l] >= minQ && sizes[l] < n / 2) { out[y * W0 + x] = 1; any = true; }
  }
  return any ? out : null;
}

/**
 * Closed outlines on the barely-smoothed photo, filled: a white or silver tool
 * on white paper is only a few levels brighter or cooler than it, so its edge
 * goes in the main blur. The edge thresholds follow this photo's own noise
 * (the median gradient, mostly bare paper), so grain, creases, printed lines
 * and uneven light don't close into shapes. A soft shadow has no edge to
 * follow; a hard one that joins the outline is trimmed later with the rest.
 * Shapes over half the sheet are dropped (the paper's own edge). → Uint8Array
 */
export function paleOutlines(img, k, margin, close, open, minPx) {
  const W = img.width, H = img.height;
  const sm = gaussian(greyscale(img), W, H, 0.35 * k * 0.5);
  const hist = new Uint32Array(256);
  let n = 0;
  for (let y = 1; y < H - 1; y += 2) for (let x = 1; x < W - 1; x += 2) {
    const p = y * W + x, gx = sm[p + 1] - sm[p - 1], gy = sm[p + W] - sm[p - W];
    hist[Math.min(255, Math.round(Math.hypot(gx, gy) * 2))]++; n++;
  }
  let acc = 0, median = 0;
  for (let v = 0; v < 256; v++) if ((acc += hist[v]) >= n / 2) { median = v / 4; break; }
  const high = Math.max(4, 4 * median);
  const e = canny(sm, W, H, high * 0.45, high);
  const g = new Grid(W, H, 0, 0, 1 / k);
  for (let y = margin; y < H - margin; y++) for (let x = margin; x < W - margin; x++) g.data[y * W + x] = e[y * W + x];
  const c = offsetMask(offsetMask(g, close), -close);
  fillHoles(c);
  const o = offsetMask(offsetMask(c, -open), open);
  const { labels, count, sizes } = components(o);
  // Crisp or soft: across the outline, a tool's edge is a step (most of the
  // change happens within 2 px), a shadow's a ramp over millimetres. Measured
  // on boundary pixels, along the brightness gradient: the change across ±2 px
  // over the change across ±7 px. A step scores near 1; a 4 mm fade about 0.3.
  const near = new Float64Array(count + 1), far = new Float64Array(count + 1), steps = new Uint32Array(count + 1), seen = new Uint32Array(count + 1);
  const at = (x, y) => sm[Math.max(0, Math.min(H - 1, Math.round(y))) * W + Math.max(0, Math.min(W - 1, Math.round(x)))];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x, l = labels[i];
    if (!l || sizes[l] < minPx || sizes[l] >= 0.5 * W * H) continue;
    if (labels[i - 1] === l && labels[i + 1] === l && labels[i - W] === l && labels[i + W] === l) continue;
    if (++seen[l] % 2) continue; // every other boundary pixel is plenty
    // The strongest gradient within 2 px: the closing can leave the boundary a little off the edge.
    let bx = x, by = y, best = -1;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const q = (y + dy) * W + x + dx;
      if (q < W || q >= W * (H - 1)) continue;
      const g = Math.abs(sm[q + 1] - sm[q - 1]) + Math.abs(sm[q + W] - sm[q - W]);
      if (g > best) { best = g; bx = x + dx; by = y + dy; }
    }
    const q = by * W + bx, gx = sm[q + 1] - sm[q - 1], gy = sm[q + W] - sm[q - W], len = Math.hypot(gx, gy);
    if (len < 1e-3) continue;
    const ux = gx / len, uy = gy / len;
    const d2 = Math.abs(at(bx + ux * 2, by + uy * 2) - at(bx - ux * 2, by - uy * 2));
    const d7 = Math.abs(at(bx + ux * 7, by + uy * 7) - at(bx - ux * 7, by - uy * 7));
    if (d7 < 2) continue; // nothing either side: grain
    near[l] += d2; far[l] += d7; steps[l]++;
  }
  // Polished metal: crisp nearly all round, with highlights brighter than the
  // paper around it. A shadow is never brighter than the paper it falls on,
  // so such a region is all tool (2), and the shadow veto leaves it whole.
  const paper = paperLevel(sm, W, H, Math.round(25 * k));
  const shine = new Uint32Array(count + 1);
  for (let i = 0; i < W * H; i++) if (labels[i] && sm[i] > paper[i] + 4) shine[labels[i]]++;
  const out = new Uint8Array(W * H);
  const keep = new Uint8Array(count + 1);
  for (let l = 1; l <= count; l++) {
    if (!(sizes[l] >= minPx && sizes[l] < 0.5 * W * H && steps[l] >= 12 && near[l] / far[l] >= 0.55)) continue;
    keep[l] = near[l] / far[l] >= 0.75 && shine[l] >= sizes[l] * 0.08 ? 2 : 1;
  }
  for (let i = 0; i < W * H; i++) if (keep[labels[i]]) out[i] = keep[labels[i]];
  return out;
}

/**
 * Pixels far more colourful than the paper (over about 1 mm): a bright
 * plastic handle that's as light as the paper around it, so it isn't dark,
 * and whose soft side gives no crisp outline to fill. A shadow keeps the
 * paper's grey; even the pink one beside a red handle is only about 35 more
 * colourful than the paper, and a coloured handle is 70 or more.
 */
export function vividPixels(img, pxPerMm = 4, cut = 50) {
  const n = img.width * img.height, d = img.data;
  const paper = paperColour(img);
  const base = Math.max(...paper) - Math.min(...paper);
  const chroma = new Float32Array(n);
  for (let i = 0; i < n; i++) { const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2]; chroma[i] = Math.max(r, g, b) - Math.min(r, g, b); }
  const mean = boxMean(chroma, img.width, img.height, Math.round(pxPerMm) | 1);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = mean[i] - base > cut ? 1 : 0;
  return out;
}

/**
 * A glint running along a shiny handle can cut a sliver of it off the rest.
 * A piece under a fifth the size of a piece it lies within 4 mm of is part
 * of it: the gap between them is filled in.
 */
export function joinSlivers(mask, minPx, pxPerMm) {
  const { width: W, height: H } = mask;
  const { labels, count, sizes } = components(mask);
  const reach = 4 * pxPerMm;
  for (let c = 1; c <= count; c++) {
    if (sizes[c] < minPx) continue;
    const one = new Grid(W, H, 0, 0, mask.res), rest = new Grid(W, H, 0, 0, mask.res);
    for (let i = 0; i < W * H; i++) { if (labels[i] === c) one.data[i] = 1; else if (labels[i] && sizes[labels[i]] * 0.2 > sizes[c]) rest.data[i] = 1; }
    const near = offsetMask(one, reach);
    let touches = false;
    for (let i = 0; i < W * H; i++) if (near.data[i] >= 0.5 && rest.data[i] >= 0.5) { touches = true; break; }
    if (!touches) continue;
    const nearRest = offsetMask(rest, reach);
    for (let i = 0; i < W * H; i++) if (near.data[i] >= 0.5 && nearRest.data[i] >= 0.5) mask.data[i] = 1;
  }
  return mask;
}

/**
 * `mask` (then `finish`ed) with the pixels `isShadow` marks taken off, but
 * never cutting a tool in two: a shadow one part of a tool casts on another
 * (a grip on its handle) is what joins them in the photo. Where taking it
 * off would leave a region in two good-sized pieces (of at least `minPx`),
 * and one is much smaller than the other, the shadow near both of them
 * (within 3 mm) goes back.
 */
/**
 * Put back what the shadow veto took off a pale object's own sides. The
 * shaded flank of a white marker is the paper's colour, only dimmer, just like
 * a shadow; the difference is the outside: an object ends in a crisp outline,
 * a shadow fades out. A trimmed pixel within 4 mm of what was kept comes back
 * when a crisp edge lies just beyond it (within 1.5 mm, further from the kept
 * part than the pixel itself).
 */
export function edgeBounded(kept, before, edges, pxPerMm, finish = (m) => m) {
  const { width: W, height: H } = kept;
  // Nothing was trimmed (the usual case): nothing to put back, and no need for the distance map.
  let trimmed = false;
  for (let i = 0; i < W * H && !trimmed; i++) if (before.data[i] >= 0.5 && kept.data[i] < 0.5) trimmed = true;
  if (!trimmed) return kept;
  const dist = distanceToForeground(kept);
  const reach = 4 * pxPerMm, r = Math.max(1, Math.round(1.5 * pxPerMm));
  const out = kept.clone();
  let back = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (kept.data[i] >= 0.5 || before.data[i] < 0.5 || dist[i] > reach) continue;
    let crisp = false;
    for (let dy = -r; dy <= r && !crisp; dy++) for (let dx = -r; dx <= r; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H || dx * dx + dy * dy > r * r) continue;
      const j = yy * W + xx;
      if (edges[j] && kept.data[j] < 0.5 && dist[j] > dist[i]) { crisp = true; break; }
    }
    if (crisp) { out.data[i] = 1; back++; }
  }
  // A handful of pixels (under 2 mm²) isn't worth another smoothing pass.
  if (back < 2 * pxPerMm * pxPerMm) return kept;
  fillHoles(out);
  return finish(out);
}

/**
 * A hard shadow (sunlight, a bare bulb) has a crisp edge, so nothing about its
 * edge gives it away, and a flat grey tool the paper's own tint looks the same
 * up close. What does give it away is its shape: a shadow is the object's own
 * outline, swept a little way in one direction. So in each found shape, the
 * flat, paper-coloured, dimmer part is tested against the rest swept along every
 * offset up to 10 mm; if one sweep covers it (and hardly spills outside the
 * shape), that part is the object's cast shadow and goes.
 */
export function dropCastShadows(mask, image, k, minPx, finish = (m) => m) {
  const W = mask.width, H = mask.height;
  if (image.width !== W || image.height !== H) return mask;
  const even = evenLight(image), d = even.data;
  const paper = paperColour(even), paperL = Math.max(1, 0.299 * paper[0] + 0.587 * paper[1] + 0.114 * paper[2]);
  const pSum = Math.max(1, paper[0] + paper[1] + paper[2]), pc = paper.map((v) => v / pSum);
  const { labels, count, sizes } = components(mask);
  const q = 2, R = Math.max(2, Math.round((10 * k) / q));
  let out = null;
  for (let c = 1; c <= count; c++) {
    if (sizes[c] < 2 * minPx) continue;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let i = 0; i < W * H; i++) if (labels[i] === c) { const x = i % W, y = (i / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    // Flat, paper-coloured and dimmer: what a shadow looks like.
    const shade = new Uint8Array(W * H); // 1: shadow-coloured, 2: and flat (shadow-like)
    let nS = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      if (labels[i] !== c) continue;
      const L = lum(d, i * 4), ratio = L / paperL;
      const sum = Math.max(1, d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]);
      const hue = (Math.abs(d[i * 4] / sum - pc[0]) + Math.abs(d[i * 4 + 1] / sum - pc[1]) + Math.abs(d[i * 4 + 2] / sum - pc[2])) * 255;
      // Bare paper caught at the shape's edge (3) is neither object nor shadow.
      if (hue <= 12 && ratio > 0.93 && ratio < 1.015) { shade[i] = 3; continue; }
      if (ratio < 0.3 || ratio > 0.93 || hue > 18) continue;
      shade[i] = 1;
      let lo = 255, hi = 0;
      for (let yy = Math.max(0, y - 2); yy <= Math.min(H - 1, y + 2); yy++) for (let xx = Math.max(0, x - 2); xx <= Math.min(W - 1, x + 2); xx++) { const v = lum(d, (yy * W + xx) * 4); if (labels[yy * W + xx] === c) { if (v < lo) lo = v; if (v > hi) hi = v; } }
      if (hi - lo > 24) continue; // not flat: an edge or texture
      shade[i] = 2; nS++;
    }
    if (nS < sizes[c] * 0.12 || sizes[c] - nS < sizes[c] * 0.15) continue;
    // Coarse grids over the shape's box (plus the search reach) for the sweep test.
    const bx0 = Math.floor(x0 / q) - R, by0 = Math.floor(y0 / q) - R, bw = Math.floor(x1 / q) - bx0 + R + 1, bh = Math.floor(y1 / q) - by0 + R + 1;
    const inC = new Uint8Array(bw * bh), inS = new Uint8Array(bw * bh), inO = new Uint8Array(bw * bh);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      if (labels[i] !== c) continue;
      const j = (((y / q) | 0) - by0) * bw + (((x / q) | 0) - bx0);
      inC[j] = 1;
      // The object is what isn't shadow-coloured at all; a shadow's own soft or
      // noisy rim is neither, and only has to lie inside the shape.
      if (shade[i] === 2) inS[j] = 1; else if (!shade[i]) inO[j] = 1;
    }
    for (let j = 0; j < inC.length; j++) if (inO[j]) inS[j] = 0; // mixed cells count as object
    const O = [], Sn = inS.reduce((a, v) => a + v, 0);
    for (let j = 0; j < inO.length; j++) if (inO[j]) O.push(j);
    if (!Sn || !O.length) continue;
    // A plain shift first, to find the likely directions; then the sweep.
    const cands = [];
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 1) continue;
      let cov = 0, spill = 0;
      for (const j of O) { const x = (j % bw) + dx, y = ((j / bw) | 0) + dy; if (x < 0 || y < 0 || x >= bw || y >= bh) { spill++; continue; } const t = y * bw + x; if (inS[t]) cov++; else if (!inC[t]) spill++; }
      cands.push([cov - spill, dx, dy]);
    }
    cands.sort((a, b) => b[0] - a[0]);
    let best = null;
    for (const [, dx, dy] of cands.slice(0, 6)) {
      const steps = Math.max(Math.abs(dx), Math.abs(dy)), swept = new Uint8Array(bw * bh);
      for (const j of O) { const ox = j % bw, oy = (j / bw) | 0; for (let s = 1; s <= steps; s++) { const x = ox + Math.round((dx * s) / steps), y = oy + Math.round((dy * s) / steps); if (x >= 0 && y >= 0 && x < bw && y < bh) swept[y * bw + x] = 1; } }
      let cov = 0, spill = 0, area = 0;
      for (let j = 0; j < swept.length; j++) { if (!swept[j] || inO[j]) continue; area++; if (inS[j]) cov++; else if (!inC[j]) spill++; }
      if (cov >= Sn * 0.85 && spill <= area * 0.2 && (!best || cov - spill > best.score)) best = { score: cov - spill, swept };
    }
    if (!best) continue;
    out = out || mask.clone();
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      if (labels[i] === c && (shade[i] === 1 || shade[i] === 2) && best.swept[(((y / q) | 0) - by0) * bw + (((x / q) | 0) - bx0)]) out.data[i] = 0;
    }
  }
  if (!out) return mask;
  const done = finish(out), cc = components(done);
  for (let i = 0; i < W * H; i++) if (cc.labels[i] && cc.sizes[cc.labels[i]] < minPx) done.data[i] = 0;
  return done;
}

export function trimShadow(mask, isShadow, minPx, pxPerMm, finish = (m) => m) {
  const { width: W, height: H } = mask;
  const whole = finish(mask);
  const before = components(whole);
  const cutMask = mask.clone(), cut = [];
  for (let i = 0; i < W * H; i++) if (mask.data[i] >= 0.5 && isShadow(i)) { cutMask.data[i] = 0; cut.push(i); }
  if (!cut.length) return whole;
  let out = finish(cutMask);
  const after = components(out);
  // The good-sized pieces left of each region.
  const pieces = new Map();
  for (let i = 0; i < W * H; i++) {
    const a = after.labels[i], b = before.labels[i];
    if (!a || !b || after.sizes[a] < minPx) continue;
    if (!pieces.has(b)) pieces.set(b, new Set());
    pieces.get(b).add(a);
  }
  const reach = 3 * pxPerMm;
  let restored = false;
  for (const set of pieces.values()) {
    if (set.size < 2) continue;
    // Two pieces of much the same size are two tools the shadow joined; a
    // small piece cut off a big one (a handle off its grip) is part of it.
    const sizes = [...set].map((a) => after.sizes[a]).sort((x, y) => y - x);
    if (sizes[1] > sizes[0] * 0.35) continue;
    const near = new Uint8Array(W * H);
    for (const a of set) {
      const one = new Grid(W, H, 0, 0, mask.res);
      for (let i = 0; i < W * H; i++) if (after.labels[i] === a) one.data[i] = 1;
      const d = offsetMask(one, reach);
      for (const i of cut) if (d.data[i] >= 0.5) near[i]++;
    }
    for (const i of cut) if (near[i] >= 2) { cutMask.data[i] = 1; restored = true; }
  }
  if (restored) out = finish(cutMask);
  return out;
}

// How far each pixel is from the paper's colour: as it is (raw), and with
// shadow-like patches discounted (score). The shadow veto compares the two.
function found(sheet, o) {
  const { image, pxPerMm } = sheet;
  // The light evened out first, so the paper sits close to zero everywhere.
  const even = evenLight(image);
  const raw = objectScore(even, 0);
  const score = o.shadows > 0 ? objectScore(even, o.shadows, pxPerMm, raw) : raw;
  return { raw, score };
}

/**
 * Pixels the built-in trace takes for shadow (W*H: 1 = shadow, 2 = barely
 * off the paper at all, like a shadow's faint outer fringe): they stand out
 * from the paper, but only because they're the paper's own colour, dimmer,
 * smooth and fading softly (see objectScore). The AI's outlines are trimmed
 * by these (ai.js), with the same Shadow removal setting.
 */
export function shadowPixels(sheet, options = {}) {
  const o = { ...TRACE_DEFAULTS, ...options };
  const out = new Uint8Array(sheet.image.width * sheet.image.height);
  if (!(o.shadows > 0)) return out;
  const { raw, score } = found(sheet, o);
  // Shadow: it stands out from the paper (even faintly, at half the trace's
  // cut-off), but not once shadows are discounted.
  const t = Math.max(10, Math.min(245, Math.min(otsu(raw), PALE_CUT) - o.sensitivity));
  for (let i = 0; i < out.length; i++) out[i] = raw[i] > t * 0.5 ? (score[i] <= t ? 1 : 0) : 2;
  return out;
}

// Tools lying so they touch are found as one: part them where they meet
// (split.js), each with its own bounding box in pixels. One tool comes back
// as it is. Only the tool's own box is looked at, to keep it quick.
function touching(one, [minX, minY, maxX, maxY], o) {
  const whole = [{ mask: one, bbox: [minX, minY, maxX, maxY] }];
  if (o.part === false) return whole;
  const { width: W, res } = one;
  const pad = 2, x0 = Math.max(0, minX - pad), y0 = Math.max(0, minY - pad);
  const w = Math.min(W, maxX + pad + 1) - x0, h = Math.min(one.height, maxY + pad + 1) - y0;
  const sub = new Grid(w, h, one.x0 + x0 * res, one.y0 + y0 * res, res);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) sub.data[j * w + i] = one.data[(y0 + j) * W + x0 + i];
  const parted = partByNecks(sub);
  if (!parted) return whole;
  const parts = [];
  for (let c = 1; c <= parted.count; c++) {
    const mask = new Grid(W, one.height, one.x0, one.y0, res);
    let a = W, b = one.height, cx = 0, cy = 0, n = 0;
    for (let k = 0; k < w * h; k++) {
      if (parted.labels[k] !== c) continue;
      const x = x0 + (k % w), y = y0 + ((k / w) | 0);
      mask.data[y * W + x] = 1; n++;
      if (x < a) a = x; if (x > cx) cx = x; if (y < b) b = y; if (y > cy) cy = y;
    }
    if (n * res * res >= o.minArea) parts.push({ mask, bbox: [a, b, cx, cy] });
  }
  return parts.length > 1 ? parts : whole;
}

// Find tool outlines on a rectified sheet. Returns shapes in mm, with the
// origin at the sheet's top-left and y pointing down the page.
export function traceTools(sheet, options = {}) {
  const o = { ...TRACE_DEFAULTS, ...options };
  const W = sheet.image.width, H = sheet.image.height, pxPerMm = sheet.pxPerMm, res = 1 / pxPerMm;
  const { labels, count, sizes } = components(toolMask(sheet, o));
  // Every shape's box in one pass; each is then worked on in its own box (plus
  // room to grow by the clearance and blur), not the whole sheet.
  const bx0 = new Int32Array(count + 1).fill(W), by0 = new Int32Array(count + 1).fill(H), bx1 = new Int32Array(count + 1), by1 = new Int32Array(count + 1);
  for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
    const l = labels[i];
    if (!l) continue;
    if (x < bx0[l]) bx0[l] = x; if (x > bx1[l]) bx1[l] = x;
    if (y < by0[l]) by0[l] = y; if (y > by1[l]) by1[l] = y;
  }
  const pad = Math.ceil(Math.max(0, o.clearance) * pxPerMm) + 3;
  const shapes = [];
  for (let k = 1; k <= count; k++) {
    if (sizes[k] * res * res < o.minArea) continue;
    const X0 = Math.max(0, bx0[k] - pad), Y0 = Math.max(0, by0[k] - pad), w = Math.min(W - 1, bx1[k] + pad) - X0 + 1, h = Math.min(H - 1, by1[k] + pad) - Y0 + 1;
    const one = new Grid(w, h, 0, 0, res);
    for (let y = by0[k]; y <= by1[k]; y++) for (let x = bx0[k]; x <= bx1[k]; x++) if (labels[y * W + x] === k) one.data[(y - Y0) * w + x - X0] = 1;
    fillHoles(one);
    for (const part of touching(one, [bx0[k] - X0, by0[k] - Y0, bx1[k] - X0, by1[k] - Y0], o)) {
      const grown = o.clearance > 0 ? offsetMask(part.mask, o.clearance * pxPerMm) : part.mask;
      const loops = traceContours(boxBlur(grown, 1), 0.5, X0, Y0);
      if (!loops.length) continue;
      // Keep the outer outline (largest area).
      let outline = loops[0];
      for (const l of loops) if (Math.abs(signedArea(l)) > Math.abs(signedArea(outline))) outline = l;
      outline = simplifyClosed(outline, o.smoothing);
      shapes.push({
        id: shapes.length + 1,
        polygon: outline,
        bbox: part.bbox.map((v, i) => (v + (i % 2 ? Y0 : X0) + (i < 2 ? 0 : 1)) * res),
        areaMm2: Math.abs(signedArea(outline)),
      });
    }
  }
  return shapes;
}
