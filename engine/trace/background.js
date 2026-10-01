// Tools photographed on something other than white paper: a green cutting
// mat with its grid, a wooden desk, a coloured sheet. The rest of the trace
// expects pale paper with darker tools on it, so the photo is redrawn that way
// first: the background's own colours are learnt from the border of the
// sheet (a few clusters, the blends between them and their shadows, so a mat's
// grid lines, wood grain and a tool's shadow count as background), and every pixel is drawn darker the
// further its colour is from all of them. A photo on paper is returned as it is.

/** Is the border pale and colourless, like paper? */
function looksLikePaper(med) {
  const L = 0.299 * med[0] + 0.587 * med[1] + 0.114 * med[2];
  return L > 165 && Math.max(...med) - Math.min(...med) < 40;
}

function sampleBorder(image, band) {
  const { width: W, height: H, data } = image, out = [];
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
    if (x >= band && x < W - band && y >= band && y < H - band) continue;
    const i = (y * W + x) * 4;
    out.push([data[i], data[i + 1], data[i + 2]]);
  }
  return out;
}

function median3(pts) {
  return [0, 1, 2].map((c) => { const v = pts.map((p) => p[c]).sort((a, b) => a - b); return v[v.length >> 1]; });
}

// k-means in RGB, started from luminance quantiles so it's deterministic.
function clusters(pts, k = 4) {
  const lum = (p) => 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
  const sorted = pts.slice().sort((a, b) => lum(a) - lum(b));
  let cs = Array.from({ length: k }, (_, j) => sorted[Math.floor(((j + 0.5) / k) * (sorted.length - 1))].slice());
  const n = new Float64Array(k);
  for (let it = 0; it < 12; it++) {
    const sum = cs.map(() => [0, 0, 0]); n.fill(0);
    for (const p of pts) {
      let best = 0, bd = Infinity;
      for (let j = 0; j < k; j++) { const d = (p[0] - cs[j][0]) ** 2 + (p[1] - cs[j][1]) ** 2 + (p[2] - cs[j][2]) ** 2; if (d < bd) { bd = d; best = j; } }
      sum[best][0] += p[0]; sum[best][1] += p[1]; sum[best][2] += p[2]; n[best]++;
    }
    cs = cs.map((c, j) => (n[j] ? sum[j].map((v) => v / n[j]) : c));
  }
  return cs.filter((_, j) => n[j] >= pts.length * 0.03);
}

// Distance from colour p to the background: to the nearest cluster, the
// nearest blend between two of them, or a cluster in shadow (the same colour,
// down to 35 % as bright: a shadow dims the background, it doesn't change it).
function distanceTo(cs, segs) {
  const cc = cs.map((c) => c[0] * c[0] + c[1] * c[1] + c[2] * c[2]);
  return (r, g, b) => {
    let best = Infinity;
    for (let j = 0; j < cs.length; j++) {
      const c = cs[j], s = Math.min(1, Math.max(0.35, (r * c[0] + g * c[1] + b * c[2]) / (cc[j] || 1)));
      const d = (r - s * c[0]) ** 2 + (g - s * c[1]) ** 2 + (b - s * c[2]) ** 2;
      if (d < best) best = d;
    }
    for (const [a, v, vv] of segs) {
      const t = ((r - a[0]) * v[0] + (g - a[1]) * v[1] + (b - a[2]) * v[2]) / vv;
      if (t <= 0 || t >= 1) continue;
      const d = (r - a[0] - t * v[0]) ** 2 + (g - a[1] - t * v[1]) ** 2 + (b - a[2] - t * v[2]) ** 2;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  };
}

/**
 * The photo redrawn as dark-on-white if its background isn't paper; the same
 * image object if it is. `margin` is the border (px) the trace ignores anyway.
 */
export function backgroundToPaper(image, margin) {
  const band = Math.max(4, Math.round(margin * 1.6));
  const pts = sampleBorder(image, band);
  if (pts.length < 50 || looksLikePaper(median3(pts))) return image;
  const cs = clusters(pts);
  const segs = [];
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    const v = [cs[j][0] - cs[i][0], cs[j][1] - cs[i][1], cs[j][2] - cs[i][2]];
    const vv = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
    if (vv > 1) segs.push([cs[i], v, vv]);
  }
  const dist = distanceTo(cs, segs);
  // How far the background itself strays (noise, texture): the 95th percentile on the border.
  const bd = pts.map((p) => dist(p[0], p[1], p[2])).sort((a, b) => a - b);
  const spread = bd[Math.floor(bd.length * 0.95)];
  const lo = spread * 1.3 + 4, span = spread * 2.5 + 30;
  const { width: W, height: H, data } = image, out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < W * H; i++) {
    const j = i * 4;
    const v = Math.min(1, Math.max(0, (dist(data[j], data[j + 1], data[j + 2]) - lo) / span));
    const L = 245 - 220 * v;
    out[j] = out[j + 1] = out[j + 2] = L; out[j + 3] = 255;
  }
  return { width: W, height: H, data: out, background: cs };
}
