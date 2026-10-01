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

// Even-odd scanline fill of a polygon given in world coordinates.
export function fillPolygon(grid, poly, value = 1) {
  const { width, height, x0, y0, res, data } = grid;
  const pts = poly.map(([x, y]) => [(x - x0) / res - 0.5, (y - y0) / res - 0.5]);
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const jStart = Math.max(0, Math.ceil(minY));
  const jEnd = Math.min(height - 1, Math.floor(maxY));
  const xs = [];
  for (let j = jStart; j <= jEnd; j++) {
    xs.length = 0;
    for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
      const [ax, ay] = pts[a];
      const [bx, by] = pts[b];
      if ((ay > j) !== (by > j)) xs.push(ax + ((j - ay) * (bx - ax)) / (by - ay));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil(xs[k]));
      const i1 = Math.min(width - 1, Math.floor(xs[k + 1]));
      for (let i = i0; i <= i1; i++) data[j * width + i] = value;
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
  const stack = [];
  const seed = (i) => { if (!seen[i] && data[i] < 0.5) { seen[i] = 1; stack.push(i); } };
  for (let i = 0; i < w; i++) { seed(i); seed((h - 1) * w + i); }
  for (let j = 0; j < h; j++) { seed(j * w); seed(j * w + w - 1); }
  while (stack.length) {
    const p = stack.pop();
    const x = p % w, y = (p / w) | 0;
    if (x > 0) seed(p - 1);
    if (x < w - 1) seed(p + 1);
    if (y > 0) seed(p - w);
    if (y < h - 1) seed(p + w);
  }
  for (let i = 0; i < w * h; i++) if (!seen[i]) data[i] = 1;
  return grid;
}

// Label 4-connected foreground components. Returns { labels, count, sizes }.
export function components(grid) {
  const { width: w, height: h, data } = grid;
  const labels = new Int32Array(w * h);
  const sizes = [0];
  let count = 0;
  const stack = [];
  for (let s = 0; s < w * h; s++) {
    if (data[s] < 0.5 || labels[s]) continue;
    count++;
    let size = 0;
    labels[s] = count;
    stack.push(s);
    while (stack.length) {
      const p = stack.pop();
      size++;
      const x = p % w, y = (p / w) | 0;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q >= 0 && data[q] >= 0.5 && !labels[q]) { labels[q] = count; stack.push(q); }
      }
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
  const f = new Float64Array(Math.max(w, h));
  const d = new Float64Array(Math.max(w, h));
  const v = new Int32Array(Math.max(w, h));
  const z = new Float64Array(Math.max(w, h) + 1);
  const out = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = data[i] >= 0.5 ? 0 : INF;
  const pass = (n, get, set) => {
    for (let q = 0; q < n; q++) f[q] = get(q);
    let k = 0;
    v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s;
      do {
        const p = v[k];
        s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p);
      } while (s <= z[k] && --k >= 0);
      k++;
      v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) ** 2 + f[v[k]];
    }
    for (let q = 0; q < n; q++) set(q, d[q]);
  };
  for (let x = 0; x < w; x++) pass(h, (q) => out[q * w + x], (q, val) => { out[q * w + x] = val; });
  for (let y = 0; y < h; y++) pass(w, (q) => out[y * w + q], (q, val) => { out[y * w + q] = val; });
  for (let i = 0; i < w * h; i++) out[i] = Math.sqrt(out[i]);
  return out;
}

// Grow (r > 0) or shrink (r < 0) a binary mask by r pixels.
export function offsetMask(grid, r) {
  const out = grid.clone();
  if (r > 0) {
    const dist = distanceToForeground(grid);
    for (let i = 0; i < dist.length; i++) out.data[i] = dist[i] <= r ? 1 : 0;
  } else if (r < 0) {
    const inv = grid.clone();
    for (let i = 0; i < inv.data.length; i++) inv.data[i] = grid.data[i] >= 0.5 ? 0 : 1;
    const dist = distanceToForeground(inv);
    for (let i = 0; i < dist.length; i++) out.data[i] = dist[i] > -r ? 1 : 0;
  }
  return out;
}

export function boxBlur(grid, radius = 1) {
  const { width: w, height: h } = grid;
  const src = grid.data;
  const tmp = new Float32Array(w * h);
  const out = grid.clone();
  const n = radius * 2 + 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -radius; k <= radius; k++) s += src[y * w + Math.min(w - 1, Math.max(0, x + k))];
      tmp[y * w + x] = s / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -radius; k <= radius; k++) s += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x];
      out.data[y * w + x] = s / n;
    }
  }
  return out;
}

// Marching squares. Returns closed loops in world coordinates, each wound
// counter-clockwise around regions above `level` (holes come out clockwise).
// Pixels outside the grid count as below the level, so every loop closes.
export function traceContours(grid, level = 0.5) {
  const { width: w, height: h, data } = grid;
  const val = (i, j) => (i < 0 || j < 0 || i >= w || j >= h ? -Infinity : data[j * w + i] - level);
  // Edge ids: horizontal edge between (i,j)-(i+1,j) and vertical (i,j)-(i,j+1).
  const W = w + 2;
  const hId = (i, j) => ((j + 1) * W + (i + 1)) * 2;
  const vId = (i, j) => ((j + 1) * W + (i + 1)) * 2 + 1;
  const point = new Map();
  const edgePoint = (id, i, j, horizontal) => {
    if (point.has(id)) return;
    const a = val(i, j);
    const b = horizontal ? val(i + 1, j) : val(i, j + 1);
    const t = a === -Infinity ? 1 - 1e-3 : b === -Infinity ? 1e-3 : a / (a - b);
    const tc = Math.min(1 - 1e-3, Math.max(1e-3, t));
    point.set(id, horizontal ? [i + tc, j] : [i, j + tc]);
  };
  const next = new Map();
  // Segment from edge a to edge b keeps the inside (value > 0) on the left.
  const seg = (a, b) => next.set(b, a);
  for (let j = -1; j < h; j++) {
    for (let i = -1; i < w; i++) {
      const v00 = val(i, j) > 0, v10 = val(i + 1, j) > 0, v11 = val(i + 1, j + 1) > 0, v01 = val(i, j + 1) > 0;
      const code = (v00 ? 1 : 0) | (v10 ? 2 : 0) | (v11 ? 4 : 0) | (v01 ? 8 : 0);
      if (code === 0 || code === 15) continue;
      const B = hId(i, j), T = hId(i, j + 1), L = vId(i, j), R = vId(i + 1, j);
      const need = { B: [B, i, j, true], T: [T, i, j + 1, true], L: [L, i, j, false], R: [R, i + 1, j, false] };
      const S = (x, y) => {
        edgePoint(...need[x]);
        edgePoint(...need[y]);
        seg(need[x][0], need[y][0]);
      };
      // y grows upward; walk with inside on the left.
      switch (code) {
        case 1: S('L', 'B'); break;
        case 2: S('B', 'R'); break;
        case 3: S('L', 'R'); break;
        case 4: S('R', 'T'); break;
        case 5: S('L', 'T'); S('R', 'B'); break; // saddle: keep diagonal corners apart
        case 6: S('B', 'T'); break;
        case 7: S('L', 'T'); break;
        case 8: S('T', 'L'); break;
        case 9: S('T', 'B'); break;
        case 10: S('T', 'R'); S('B', 'L'); break;
        case 11: S('T', 'R'); break;
        case 12: S('R', 'L'); break;
        case 13: S('R', 'B'); break;
        case 14: S('B', 'L'); break;
      }
    }
  }
  const loops = [];
  for (const start of [...next.keys()]) {
    if (!next.has(start)) continue;
    const loop = [];
    let e = start;
    while (next.has(e)) {
      const n = next.get(e);
      next.delete(e);
      loop.push(grid.toWorld(point.get(e)));
      e = n;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}
