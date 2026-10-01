// Marker-based watershed on an 8-bit RGB image, used to find the paper
// (vision.js) and to trace a tool from a tap (pick.js). labels: 0 unknown,
// 1 and 2 are the two kinds of marker. Every unknown pixel ends up with the
// label that reaches it across the gentlest colour step. A bucket queue:
// edge weights are whole numbers and the flood level only rises.
const LEVELS = 256;

// chroma: how much a change of colour (rather than brightness) counts. A
// shadow is the paper's own colour, darker; a grey tool is a different colour
// even when it's as dark as its shadow, so counting colour keeps them apart.
export function watershed(rgb, W, H, labels, { chroma = 0 } = {}) {
  const buckets = Array.from({ length: LEVELS }, () => []);
  const weight = (a, b) => {
    const r1 = rgb[a * 3], g1 = rgb[a * 3 + 1], b1 = rgb[a * 3 + 2], r2 = rgb[b * 3], g2 = rgb[b * 3 + 1], b2 = rgb[b * 3 + 2];
    const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
    let w = Math.sqrt(dr * dr + dg * dg + db * db) * 0.58;
    if (chroma) {
      const s1 = r1 + g1 + b1 + 1, s2 = r2 + g2 + b2 + 1;
      w += chroma * 255 * (Math.abs(r1 / s1 - r2 / s2) + Math.abs(g1 / s1 - g2 / s2) + Math.abs(b1 / s1 - b2 / s2));
    }
    return Math.min(LEVELS - 1, Math.round(w));
  };
  // The lowest level each pixel has been offered so far. A pixel can be offered
  // again at a lower level by a later neighbour (the paper reaching a shadow
  // gently after a tool's edge offered it at a big step), and the lowest wins.
  const offered = new Uint8Array(W * H).fill(LEVELS - 1);
  const push = (from, to, level) => {
    if (labels[to]) return;
    const w = Math.max(level, weight(from, to));
    if (w >= offered[to] && offered[to] !== LEVELS - 1) return;
    offered[to] = w;
    buckets[w].push(to, from);
  };
  const around = (p, level) => {
    const x = p % W, y = (p / W) | 0;
    if (x > 0) push(p, p - 1, level);
    if (x < W - 1) push(p, p + 1, level);
    if (y > 0) push(p, p - W, level);
    if (y < H - 1) push(p, p + W, level);
  };
  for (let p = 0; p < W * H; p++) if (labels[p]) around(p, 0);
  for (let level = 0; level < LEVELS; level++) {
    const b = buckets[level];
    // New neighbours pushed at this level land back in this same bucket.
    for (let i = 0; i < b.length; i += 2) {
      const p = b[i], from = b[i + 1];
      if (labels[p]) continue;
      labels[p] = labels[from];
      around(p, level);
    }
    b.length = 0;
  }
  return labels;
}

