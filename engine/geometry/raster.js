// Raster helpers used to union, offset and trace 2D shapes.
// A grid maps pixel (i, j) to the point (x0 + (i + 0.5) * res, y0 + (j + 0.5) * res).

export class Grid {
  constructor(width, height, x0 = 0, y0 = 0, res = 1) {
    this.width = width;
    this.height = height;
    this.x0 = x0;
    this.y0 = y0;
    this.res = res;
    this.data = new Float32Array(width * height);
  }

  static covering(minX, minY, maxX, maxY, res, pad = 2) {
    const w = Math.ceil((maxX - minX) / res) + pad * 2;
    const h = Math.ceil((maxY - minY) / res) + pad * 2;
    return new Grid(w, h, minX - pad * res, minY - pad * res, res);
  }

  clone() {
    const g = new Grid(this.width, this.height, this.x0, this.y0, this.res);
    g.data.set(this.data);
    return g;
  }

  // Grid coordinates (pixel centres at integers) to world coordinates.
  toWorld([gx, gy]) {
    return [this.x0 + (gx + 0.5) * this.res, this.y0 + (gy + 0.5) * this.res];
  }
}

// Even-odd scanline fill of a polygon given in world coordinates. Each edge
// adds its crossing to only the rows it spans (not every edge tested on every
// row), so a detailed outline costs what its crossings cost.
export function fillPolygon(grid, poly, value = 1) {
  const data = grid.data;
  polygonSpans(grid, poly, (row, i0, i1) => { for (let i = i0; i <= i1; i++) data[row + i] = value; });
}

/** The pixels fillPolygon would set, as ascending indices, without a grid of their own. */
export function polygonIndices(grid, poly) {
  const out = [];
  polygonSpans(grid, poly, (row, i0, i1) => { for (let i = i0; i <= i1; i++) out.push(row + i); });
  return out;
}

// Each run of pixel centres inside `poly`, row by row (even-odd rule): span(row start, i0, i1).
function polygonSpans(grid, poly, span) {
  const { width, height, x0, y0, res } = grid;
  const n = poly.length;
  if (n < 3) return;
  const px = new Float64Array(n), py = new Float64Array(n);
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) { px[i] = (poly[i][0] - x0) / res - 0.5; py[i] = (poly[i][1] - y0) / res - 0.5; if (py[i] < minY) minY = py[i]; if (py[i] > maxY) maxY = py[i]; }
  const jStart = Math.max(0, Math.ceil(minY));
  const jEnd = Math.min(height - 1, Math.floor(maxY));
  if (jEnd < jStart) return;
  const rows = Array.from({ length: jEnd - jStart + 1 }, () => []);
  for (let a = 0, b = n - 1; a < n; b = a++) {
    const ax = px[a], ay = py[a], bx = px[b], by = py[b];
    if (ay === by) continue;
    // Rows j with min(ay, by) <= j < max(ay, by): the same rule as (ay > j) !== (by > j).
    const lo = Math.min(ay, by), hi = Math.max(ay, by);
    const j0 = Math.max(jStart, Math.ceil(lo)), j1 = Math.min(jEnd, Math.ceil(hi) - 1);
    const k = (bx - ax) / (by - ay);
    for (let j = j0; j <= j1; j++) rows[j - jStart].push(ax + (j - ay) * k);
  }
  for (let r = 0; r < rows.length; r++) {
    const xs = rows[r];
    if (xs.length < 2) continue;
    xs.sort((p, q) => p - q);
    const row = (r + jStart) * width;
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil(xs[k]));
      const i1 = Math.min(width - 1, Math.floor(xs[k + 1]));
      if (i1 >= i0) span(row, i0, i1);
    }
  }
}

export function fillCircle(grid, cx, cy, r, value = 1) {
  const { width, height, x0, y0, res, data } = grid;
  const gx = (cx - x0) / res - 0.5, gy = (cy - y0) / res - 0.5, gr = r / res;
  for (let j = Math.max(0, Math.floor(gy - gr)); j <= Math.min(height - 1, Math.ceil(gy + gr)); j++) {
    for (let i = Math.max(0, Math.floor(gx - gr)); i <= Math.min(width - 1, Math.ceil(gx + gr)); i++) {
      if ((i - gx) ** 2 + (j - gy) ** 2 <= gr * gr) data[j * width + i] = value;
    }
  }
}

// Set every background pixel not connected to the border to 1.
export function fillHoles(grid) {
  const { width: w, height: h, data } = grid;
  const seen = new Uint8Array(w * h);
  // A span fill: each run of background along a row is taken whole, then the
  // rows above and below are looked at once along it.
  const stack = [];
  const open = (i) => !seen[i] && data[i] < 0.5;
  const push = (i) => { stack.push(i); };
  for (let i = 0; i < w; i++) { if (open(i)) push(i); if (open((h - 1) * w + i)) push((h - 1) * w + i); }
  for (let j = 0; j < h; j++) { if (open(j * w)) push(j * w); if (open(j * w + w - 1)) push(j * w + w - 1); }
  while (stack.length) {
    const p = stack.pop();
    if (!open(p)) continue;
    const row = p - (p % w);
    let a = p, b = p;
    while (a > row && open(a - 1)) a--;
    while (b < row + w - 1 && open(b + 1)) b++;
    for (let i = a; i <= b; i++) seen[i] = 1;
    for (const d of [-w, w]) {
      if (row + d < 0 || row + d >= w * h) continue;
      let inRun = false;
      for (let i = a + d; i <= b + d; i++) {
        if (open(i)) { if (!inRun) { push(i); inRun = true; } } else inRun = false;
      }
    }
  }
  for (let i = 0; i < w * h; i++) if (!seen[i]) data[i] = 1;
  return grid;
}

// Label 4-connected foreground components. Returns { labels, count, sizes }.
export function components(grid) {
  const { width: w, height: h, data } = grid;
  const n = w * h, labels = new Int32Array(n);
  const sizes = [0];
  let count = 0;
  const stack = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (data[s] < 0.5 || labels[s]) continue;
    count++;
    let size = 0, top = 0;
    labels[s] = count;
    stack[top++] = s;
    while (top) {
      const p = stack[--top];
      size++;
      const x = p % w;
      // The same neighbours in the same order as ever: left, right, up, down.
      if (x > 0 && data[p - 1] >= 0.5 && !labels[p - 1]) { labels[p - 1] = count; stack[top++] = p - 1; }
      if (x < w - 1 && data[p + 1] >= 0.5 && !labels[p + 1]) { labels[p + 1] = count; stack[top++] = p + 1; }
      if (p >= w && data[p - w] >= 0.5 && !labels[p - w]) { labels[p - w] = count; stack[top++] = p - w; }
      if (p + w < n && data[p + w] >= 0.5 && !labels[p + w]) { labels[p + w] = count; stack[top++] = p + w; }
    }
    sizes.push(size);
  }
  return { labels, count, sizes };
}

// Exact Euclidean distance (in pixels) from each pixel to the nearest
// foreground pixel (Felzenszwalb & Huttenlocher).
export function distanceToForeground(grid) {
  const { width: w, height: h, data } = grid;
  const INF = 1e20;
  const m = Math.max(w, h);
  const f = new Float64Array(m), d = new Float64Array(m), z = new Float64Array(m + 1);
  const v = new Int32Array(m);
  const out = new Float64Array(w * h);
  // One 1-D pass over n values of out, starting at `at`, `step` apart (a column
  // or a row), written in place. Plain loops: no callbacks per pixel.
  const pass = (at, step, n) => {
    let any = false;
    for (let q = 0, i = at; q < n; q++, i += step) { f[q] = out[i]; if (f[q] < INF) any = true; }
    if (!any) return; // nothing to measure from on this line: it stays INF
    let k = 0;
    v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) {
      const fq = f[q] + q * q;
      let s;
      do {
        const p = v[k];
        s = (fq - (f[p] + p * p)) / (2 * q - 2 * p);
      } while (s <= z[k] && --k >= 0);
      k++;
      v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      const dq = q - v[k];
      d[q] = dq * dq + f[v[k]];
    }
    for (let q = 0, i = at; q < n; q++, i += step) out[i] = d[q];
  };
  // Down the columns the input is only "on" or "off", so the squared distance
  // to the nearest "on" pixel in the column is two sweeps (down, then up): the
  // same numbers the general pass gives, a row at a time, in memory order.
  const below = new Float64Array(w); // rows since the last "on" pixel, per column
  below.fill(INF);
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
    if (data[i] >= 0.5) below[x] = 0; else if (below[x] < INF) below[x]++;
    out[i] = below[x] < INF ? below[x] * below[x] : INF;
  }
  below.fill(INF);
  for (let y = h - 1; y >= 0; y--) for (let x = 0, i = y * w; x < w; x++, i++) {
    if (data[i] >= 0.5) below[x] = 0; else if (below[x] < INF) below[x]++;
    if (below[x] < INF && below[x] * below[x] < out[i]) out[i] = below[x] * below[x];
  }
  for (let y = 0; y < h; y++) pass(y * w, 1, w);
  for (let i = 0; i < w * h; i++) out[i] = Math.sqrt(out[i]);
  return out;
}

// Grow (r > 0) or shrink (r < 0) a binary mask by r pixels. Only the box round
// the mask (plus r and a pixel) is measured: nothing further away can change,
// so the answer is the same as measuring the whole grid, and a few small tools
// on a big sheet cost what their own area costs.
// Within r of an "on" pixel (on = true) or further than r from every one
// (on = false), for a small r, written over g. The same answer as measuring the
// whole distance and comparing it with r: only "on" pixels within r rows and r
// columns can be that near, so the nearest one along each row (two sweeps),
// then the best of the 2r + 1 rows round each pixel, is all it takes.
function near(g, r, on) {
  const { width: w, height: h, data } = g, R = Math.floor(r), BIG = 1e9;
  const hd = new Float32Array(w * h); // squared distance along the row (whole numbers, exact in 32 bits), BIG past R
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let last = -BIG;
    for (let x = 0; x < w; x++) { if (data[row + x] >= 0.5) last = x; const d = x - last; hd[row + x] = d <= R ? d * d : BIG; }
    last = BIG;
    for (let x = w - 1; x >= 0; x--) { if (data[row + x] >= 0.5) last = x; const d = last - x; if (d <= R && d * d < hd[row + x]) hd[row + x] = d * d; }
  }
  // Rows down each column to the nearest row with anything within R along it:
  // further than R and the pixel can't be near (most of an empty sheet).
  const gap = new Int32Array(w * h), run = new Int32Array(w).fill(BIG);
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) { run[x] = hd[i] < BIG ? 0 : run[x] + 1; gap[i] = run[x]; }
  run.fill(BIG);
  for (let y = h - 1; y >= 0; y--) for (let x = 0, i = y * w; x < w; x++, i++) { run[x] = hd[i] < BIG ? 0 : run[x] + 1; if (run[x] < gap[i]) gap[i] = run[x]; }
  for (let y = 0; y < h; y++) {
    const ya = Math.max(0, y - R), yb = Math.min(h - 1, y + R);
    for (let x = 0; x < w; x++) {
      if (gap[y * w + x] > R) { data[y * w + x] = on ? 0 : 1; continue; }
      let best = hd[y * w + x];
      for (let yy = ya; yy <= yb && best > 0; yy++) { const v = hd[yy * w + x] + (yy - y) * (yy - y); if (v < best) best = v; }
      const within = best < BIG && Math.sqrt(best) <= r;
      data[y * w + x] = on ? (within ? 1 : 0) : (within ? 0 : 1);
    }
  }
}

export function offsetMask(grid, r) {
  const out = grid.clone();
  if (!r) return out;
  const { width: W, height: H, data } = grid;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0, i = y * W; x < W; x++, i++) if (data[i] >= 0.5) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) { out.data.fill(0); return out; } // empty mask stays empty either way
  const pad = Math.ceil(Math.abs(r)) + 1;
  const bx0 = Math.max(0, x0 - pad), by0 = Math.max(0, y0 - pad), bx1 = Math.min(W - 1, x1 + pad), by1 = Math.min(H - 1, y1 + pad);
  const w = bx1 - bx0 + 1, h = by1 - by0 + 1;
  const sub = new Grid(w, h, 0, 0, 1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const on = data[(y + by0) * W + x + bx0] >= 0.5;
    sub.data[y * w + x] = r > 0 ? (on ? 1 : 0) : (on ? 0 : 1);
  }
  // Shrinking measures from the background; outside the box everything is background
  // already, so a box with no background inside it (the mask fills it) needs no change.
  if (Math.abs(r) <= 16) {
    near(sub, Math.abs(r), r > 0);
    out.data.fill(0);
    for (let y = 0; y < h; y++) out.data.set(sub.data.subarray(y * w, y * w + w), (y + by0) * W + bx0);
    return out;
  }
  const dist = distanceToForeground(sub);
  out.data.fill(0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dv = dist[y * w + x];
    out.data[(y + by0) * W + x + bx0] = r > 0 ? (dv <= r ? 1 : 0) : (dv > -r ? 1 : 0);
  }
  return out;
}

export function boxBlur(grid, radius = 1) {
  if (radius === 1 && grid.width > 1 && grid.height > 1) return boxBlur1(grid);
  const { width: w, height: h } = grid;
  const src = grid.data;
  const tmp = new Float32Array(w * h);
  const out = grid.clone();
  const n = radius * 2 + 1;
  // Across: clamp only near the ends (the same values, added in the same order).
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let s = 0;
      if (x >= radius && x < w - radius) for (let i = row + x - radius, e = i + n; i < e; i++) s += src[i];
      else for (let k = -radius; k <= radius; k++) s += src[row + Math.min(w - 1, Math.max(0, x + k))];
      tmp[row + x] = s / n;
    }
  }
  // Down: a row at a time, so memory is read in order.
  const acc = new Float64Array(w), od = out.data;
  for (let y = 0; y < h; y++) {
    acc.fill(0);
    for (let k = -radius; k <= radius; k++) {
      const r0 = Math.min(h - 1, Math.max(0, y + k)) * w;
      for (let x = 0; x < w; x++) acc[x] += tmp[r0 + x];
    }
    for (let x = 0, o = y * w; x < w; x++) od[o + x] = acc[x] / n;
  }
  return out;
}

// The 3 × 3 blur every slab and trace uses: the same sums in the same order as
// boxBlur's general loops (so the same bits), in two plain passes that the
// engine optimises on a part's first build rather than its tenth.
function boxBlur1(grid) {
  const { width: w, height: h } = grid;
  const src = grid.data, tmp = new Float32Array(w * h);
  const out = new Grid(w, h, grid.x0, grid.y0, grid.res), od = out.data;
  for (let y = 0; y < h; y++) {
    const r = y * w, e = r + w - 1;
    tmp[r] = (src[r] + src[r] + src[r + 1]) / 3;
    for (let i = r + 1; i < e; i++) tmp[i] = (src[i - 1] + src[i] + src[i + 1]) / 3;
    tmp[e] = (src[e - 1] + src[e] + src[e]) / 3;
  }
  for (let y = 0; y < h; y++) {
    const a = (y > 0 ? y - 1 : 0) * w, b = y * w, c = (y < h - 1 ? y + 1 : h - 1) * w;
    for (let x = 0; x < w; x++) od[b + x] = (tmp[a + x] + tmp[b + x] + tmp[c + x]) / 3;
  }
  return out;
}

// Marching squares. Returns closed loops in world coordinates, each wound
// counter-clockwise around regions above `level` (holes come out clockwise).
// Pixels outside the grid count as below the level, so every loop closes.
// (ox, oy): where this grid's first pixel sits in a bigger one it was cut from;
// points then come out exactly as tracing the bigger grid would give them.
export function traceContours(grid, level = 0.5, ox = 0, oy = 0) {
  const { width: w, height: h, data } = grid;
  const val = (i, j) => (i < 0 || j < 0 || i >= w || j >= h ? -Infinity : data[j * w + i] - level);
  // Inside flags with a border of outside all round, so a cell's corners are
  // four plain reads. Cell (i, j) for i, j from -1 has its corner at p = (j + 1) * W + i + 1.
  const W = w + 2;
  const ins = new Uint8Array(W * (h + 2));
  for (let j = 0; j < h; j++) for (let i = 0, r = j * w, o = (j + 1) * W + 1; i < w; i++) if (data[r + i] - level > 0) ins[o + i] = 1;
  // Edge ids: 2p is the horizontal edge from corner p to p + 1, 2p + 1 the vertical
  // one from p to p + W. next[b] = a: the walk goes a → b keeping the inside on the left.
  const next = new Int32Array(2 * W * (h + 2)).fill(-1);
  const order = [];
  const seg = (a, b) => { if (next[b] < 0) order.push(b); next[b] = a; };
  for (let j = -1; j < h; j++) {
    for (let i = -1, p = (j + 1) * W; i < w; i++, p++) {
      const code = ins[p] | (ins[p + 1] << 1) | (ins[p + W + 1] << 2) | (ins[p + W] << 3);
      if (code === 0 || code === 15) continue;
      const B = 2 * p, T = 2 * (p + W), L = 2 * p + 1, R = 2 * (p + 1) + 1;
      // y grows upward; walk with inside on the left.
      switch (code) {
        case 1: seg(L, B); break;
        case 2: seg(B, R); break;
        case 3: seg(L, R); break;
        case 4: seg(R, T); break;
        case 5: seg(L, T); seg(R, B); break; // saddle: keep diagonal corners apart
        case 6: seg(B, T); break;
        case 7: seg(L, T); break;
        case 8: seg(T, L); break;
        case 9: seg(T, B); break;
        case 10: seg(T, R); seg(B, L); break;
        case 11: seg(T, R); break;
        case 12: seg(R, L); break;
        case 13: seg(R, B); break;
        case 14: seg(B, L); break;
      }
    }
  }
  // Where the level crosses edge e, in grid units.
  const point = (e) => {
    const q = e >> 1, horizontal = (e & 1) === 0, i = (q % W) - 1, j = Math.floor(q / W) - 1;
    const a = val(i, j);
    const b = horizontal ? val(i + 1, j) : val(i, j + 1);
    const t = a === -Infinity ? 1 - 1e-3 : b === -Infinity ? 1e-3 : a / (a - b);
    const tc = Math.min(1 - 1e-3, Math.max(1e-3, t));
    return horizontal ? [i + ox + tc, j + oy] : [i + ox, j + oy + tc];
  };
  const loops = [];
  for (const start of order) {
    if (next[start] < 0) continue;
    const loop = [];
    let e = start;
    while (next[e] >= 0) {
      const n = next[e];
      next[e] = -1;
      loop.push(grid.toWorld(point(e)));
      e = n;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}
