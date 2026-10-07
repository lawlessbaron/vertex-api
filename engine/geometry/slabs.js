// Parts drawn as a stack of slabs: each slab is a 2D drawing (on and off,
// so unions, holes, slots and notches are just drawing), traced and
// extruded. Used where a part's shape changes with height in ways plain
// extrusion can't do: snap tines, spring beams, lead-ins, recesses.
import { Mesh } from './mesh.js';
import { extrudePolygon, groupLoops, orient, signedArea, simplifyClosed, triangulate } from './polygon.js';
import { roundedRect } from './primitives.js';
import { Grid, boxBlur, fillCircle, fillPolygon, traceBits, traceContours } from './raster.js';

// Segments in each rounded corner: 12 keeps a 3 mm round within 0.01 mm of a true arc (6 was a visible polygon).
export const ROUND_SEGS = 12;
export function rr(x0, y0, x1, y1, r = 0) {
  const w = x1 - x0, d = y1 - y0;
  if (w <= 0 || d <= 0) return null;
  return roundedRect({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w, d, r: Math.max(0, Math.min(r, w / 2 - 0.01, d / 2 - 0.01)) }, ROUND_SEGS);
}
// tol: how far a traced outline may be straightened (default 0.3 of a pixel); parts
// with many holes can afford more, for far fewer triangles.
// opts.loft: where two neighbouring slabs have outlines that match one for one
// (a round or chamfer stepping out), join them with sloped walls instead of a
// step, so the curve is a curve in the file too. Each band is its own closed
// shell, like the slabs, so nothing changes for parts that don't use it.
// Draft mode (a quick look while settings change): every slab drawn on a coarser grid, k times the
// pixel size. Only the studio's live preview uses it; downloads are always made at full detail.
let DRAFT = 1;
export const draftScale = () => DRAFT;
export function setSectionsDraft(k = 1) { const was = DRAFT; DRAFT = Number(k) > 1 ? Number(k) : 1; return was; }
// Every part gets the rack's true curves: rounds and chamfers join slab to slab with sloped walls unless a
// caller says loft: false.
export const LOFT_ALL = true;
export const THIN_SLAB = 0.6;
export function sections(bounds, cuts, draw, res = 0.1, tol = res * 0.3, opts = {}) {
  // By default only thin slabs (0.6 mm or less: how rounds and chamfers are sliced) are joined; a real step,
  // sliced thick, stays a step. A caller asking for loft: true gets every match joined, as before.
  opts = { ...opts, loft: opts.loft ?? LOFT_ALL, thin: opts.loft === undefined ? THIN_SLAB : Infinity };
  if (DRAFT > 1) { res *= DRAFT; tol *= DRAFT; }
  const [x0, y0, x1, y1] = bounds;
  const zs = [...new Set(cuts.map((z) => Math.round(z * 1000) / 1000))].sort((a, b) => a - b);
  const mesh = new Mesh();
  const g = Grid.covering(x0 - 1, y0 - 1, x1 + 1, y1 + 1, res);
  // Each slab blurs and traces only the box its drawing reached (plus a margin
  // of empty pixels), not the whole grid: the same outline, point for point,
  // for a fraction of the work when a slab is a small part of the bounds.
  let bx0, by0, bx1, by1, all;
  const reach = (minX, minY, maxX, maxY) => {
    const i0 = Math.floor((minX - g.x0) / res), j0 = Math.floor((minY - g.y0) / res);
    const i1 = Math.ceil((maxX - g.x0) / res), j1 = Math.ceil((maxY - g.y0) / res);
    if (i0 < bx0) bx0 = i0; if (j0 < by0) by0 = j0; if (i1 > bx1) bx1 = i1; if (j1 > by1) by1 = j1;
  };
  const on = (p) => {
    if (!p) return;
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const [x, y] of p) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; }
    reach(a, b, c, d);
    fillPolygon(g, p, 1);
    if (shapes) shapes.poly(p);
  };
  const off = (p) => { if (p) { fillPolygon(g, p, 0); if (shapes) shapes.poly(p); } };
  const disc = (x, y, r, v = 1) => { if (v) reach(x - r, y - r, x + r, y + r); fillCircle(g, x, y, r, v); if (shapes) shapes.circle(x, y, r); };
  // With opts.loft, every shape drawn is kept, and each traced point is moved onto
  // the drawn edge it came from: a pixel's worth of wander between slabs is
  // invisible on a step but shows as bumps on a smooth slope.
  let shapes = null;
  const tools = { on, off, disc, get g() { all = true; return g; } };
  const seen = new Map(); // drawings already traced, by a hash of their pixels
  const slabs = []; // with opts.loft: each slab's z and outlines, joined at the end
  let kept = 0; // bytes of drawings kept in it
  let dirty = null; // the box the last drawing touched: only that needs clearing
  for (let i = 0; i < zs.length - 1; i++) {
    const za = zs[i], zb = zs[i + 1];
    if (zb - za < 1e-6) continue;
    if (!dirty) g.data.fill(0);
    else for (let j = dirty[1]; j < dirty[3]; j++) g.data.fill(0, j * g.width + dirty[0], j * g.width + dirty[2]);
    bx0 = by0 = Infinity; bx1 = by1 = -Infinity; all = false;
    // Only a slab that will be lofted (thin enough) has its outline snapped to the drawn edges and kept to
    // 0.01 mm; a thicker one is a plain step, traced as usual (a third of the points on a tapered part).
    const fine = Boolean(opts.loft) && zb - za <= opts.thin;
    shapes = fine ? edgeIndex(res) : null;
    tools.z = (za + zb) / 2; // the slab's height, for drawings that change through the part (vents.js louvres)
    draw((za + zb) / 2, tools);
    if (all) { dirty = null; } else if (bx1 < bx0) { dirty = [0, 0, 0, 0]; continue; } // nothing drawn
    const M = 4; // empty pixels round the drawing: the blur (radius 1) never reaches the crop's edge
    const i0 = all ? 0 : Math.max(0, bx0 - M), j0 = all ? 0 : Math.max(0, by0 - M);
    const i1 = all ? g.width : Math.min(g.width, bx1 + M), j1 = all ? g.height : Math.min(g.height, by1 + M);
    if (!all) dirty = [i0, j0, i1, j1];
    // A drawing traced before (side profiles repeat: every vent slab, every slab
    // between them) gives the same outlines: they're reused, not traced again.
    // The pixels are compared exactly, so a reuse is never a near miss.
    // One pass reads the drawing out as 0s and 1s, hashes it and notes whether
    // it's a plain drawing (only 0s and 1s, so it can be traced from the bits).
    const cw = i1 - i0, ch = j1 - j0, data = g.data, W = g.width;
    const bits = new Uint8Array(cw * ch);
    let h = 2166136261 ^ i0 ^ (j0 << 8) ^ (i1 << 16) ^ (j1 << 24), plain = true;
    for (let j = j0, o = 0; j < j1; j++) for (let i = i0, r = j * W; i < i1; i++, o++) {
      const v = data[r + i];
      if (v >= 0.5) { bits[o] = 1; h = Math.imul(h ^ o, 16777619); }
      if (v !== 0 && v !== 1) plain = false;
    }
    let groups = null;
    for (const c of seen.get(h) || []) {
      if (c.i0 !== i0 || c.j0 !== j0 || c.i1 !== i1 || c.j1 !== j1 || c.fine !== fine) continue;
      let same = true;
      for (let o = 0; o < bits.length; o++) if (bits[o] !== c.bits[o]) { same = false; break; }
      if (same) { groups = c.groups; break; }
    }
    if (!groups) {
      let raw;
      if (plain && cw >= 3 && ch >= 3) raw = traceBits(bits, cw, ch, g, i0, j0);
      else {
        let crop = g;
        if (i0 > 0 || j0 > 0 || i1 < g.width || j1 < g.height) {
          crop = new Grid(cw, ch, g.x0, g.y0, res);
          for (let j = j0; j < j1; j++) crop.data.set(data.subarray(j * W + i0, j * W + i1), (j - j0) * cw);
        }
        raw = traceContours(boxBlur(crop, 1), 0.5, i0, j0);
      }
      const loops = raw.filter((l) => Math.abs(signedArea(l)) > 6 * res * res).map((l) => (shapes ? simplifyClosed(l.map(shapes.snap), Math.min(tol, 0.01)) : simplifyClosed(l, tol)));
      groups = groupLoops(loops);
      // (Kept to reuse while the cache is under 64 MB: a part whose every slab differs gains nothing from more.)
      if (kept + bits.length <= 1 << 26) {
        kept += bits.length;
        if (!seen.has(h)) seen.set(h, []);
        seen.get(h).push({ i0, j0, i1, j1, bits, groups, fine });
      }
    }
    if (opts.loft) slabs.push({ za, zb, groups });
    else for (const q of groups) mesh.append(extrudePolygon(q.outer, q.holes, za, zb));
  }
  if (opts.loft) loftSlabs(slabs, mesh, opts.thin);
  return mesh;
}

// The edges of the shapes drawn on one slab, bucketed by 1 mm cell, and snap(p):
// p moved onto the nearest of them when one is within a pixel and a half (else
// p as it was: an edge drawn straight onto the grid, or one cut away).
function edgeIndex(res) {
  const cells = new Map(), C = 1, key = (i, j) => i * 73856093 ^ j * 19349663;
  const add = (i0, j0, i1, j1, e) => { for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = key(i, j); let b = cells.get(k); if (!b) cells.set(k, (b = [])); b.push(e); } };
  // An edge goes in the cells it passes through (walked cell by cell), not every cell of its
  // bounding box: a long diagonal or a clip box drawn far past the part would otherwise fill
  // millions of cells. snap() looks one cell round, so it still finds every edge within reach.
  const line = (a, b, e) => {
    let i = Math.floor(a[0] / C), j = Math.floor(a[1] / C);
    const iEnd = Math.floor(b[0] / C), jEnd = Math.floor(b[1] / C), dx = b[0] - a[0], dy = b[1] - a[1];
    const si = Math.sign(dx), sj = Math.sign(dy);
    const tdx = si ? Math.abs(C / dx) : Infinity, tdy = sj ? Math.abs(C / dy) : Infinity;
    let tx = si ? ((si > 0 ? (i + 1) * C : i * C) - a[0]) / dx : Infinity, ty = sj ? ((sj > 0 ? (j + 1) * C : j * C) - a[1]) / dy : Infinity;
    for (let n = Math.abs(iEnd - i) + Math.abs(jEnd - j) + 1; n > 0; n--) {
      add(i, j, i, j, e);
      if (i === iEnd && j === jEnd) break;
      if (tx < ty) { tx += tdx; i += si; } else { ty += tdy; j += sj; }
    }
  };
  const poly = (p) => { for (let k = 0; k < p.length; k++) { const a = p[k], b = p[(k + 1) % p.length]; line(a, b, [a, b]); } };
  const circle = (x, y, r) => {
    const n = Math.max(8, Math.ceil((2 * Math.PI * r) / C));
    for (let k = 0; k < n; k++) {
      const t0 = (2 * Math.PI * k) / n, t1 = (2 * Math.PI * (k + 1)) / n;
      const xs = [x + r * Math.cos(t0), x + r * Math.cos(t1)], ys = [y + r * Math.sin(t0), y + r * Math.sin(t1)];
      add(Math.floor(Math.min(...xs) / C), Math.floor(Math.min(...ys) / C), Math.floor(Math.max(...xs) / C), Math.floor(Math.max(...ys) / C), { x, y, r });
    }
  };
  const lim2 = (1.5 * res) ** 2;
  const snap = (p) => {
    const [x, y] = p, i = Math.floor(x / C), j = Math.floor(y / C);
    let best = lim2, out = p;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const b = cells.get(key(i + di, j + dj));
      if (b) for (const e of b) {
        let q;
        if (e.r !== undefined) { const dx = x - e.x, dy = y - e.y, l = Math.hypot(dx, dy) || 1; q = [e.x + (dx / l) * e.r, e.y + (dy / l) * e.r]; }
        else {
          const [a, c] = e, ex = c[0] - a[0], ey = c[1] - a[1], l2 = ex * ex + ey * ey;
          const t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / l2)) : 0;
          q = [a[0] + t * ex, a[1] + t * ey];
        }
        const d = (q[0] - x) ** 2 + (q[1] - y) ** 2;
        if (d < best) { best = d; out = q; }
      }
    }
    return out;
  };
  return { poly, circle, snap };
}

// Each slab's outline is taken as its shape at mid-height. A run of slabs that
// match one to the next becomes ONE shell: every outline is a ring of the same
// points (the first slab's, carried up from ring to ring along each point's
// outward direction), so the slope is a single surface whose shading runs on
// unbroken, with walls straight up to the run's first and last faces and a cap
// at each end only. A slab that matches neither neighbour stays a plain prism.
function loftSlabs(slabs, mesh, thin = Infinity) {
  const pairs = slabs.map((s, i) => {
    const t = slabs[i + 1];
    if (!t || Math.abs(t.za - s.zb) > 1e-6 || s.groups === t.groups) return null;
    if (s.zb - s.za > thin + 1e-9 || t.zb - t.za > thin + 1e-9) return null; // a real step, not a round
    // A round or chamfer moves the wall about as far as it rises (more only near a
    // flat face, where the steps are thin); anything further is a different shape.
    return matchGroups(s.groups, t.groups, Math.max(1, 2 * ((t.za + t.zb - s.za - s.zb) / 2)));
  });
  for (let i = 0; i < slabs.length; ) {
    if (!pairs[i]) { for (const q of slabs[i].groups) mesh.append(extrudePolygon(q.outer, q.holes, slabs[i].za, slabs[i].zb)); i++; continue; }
    let j = i;
    while (pairs[j]) j++; // slabs i..j are one run
    for (const g of slabs[i].groups) {
      // Follow this outline (and each of its holes) up the run.
      const outer = [g.outer], holes = g.holes.map((h) => [h]);
      for (let k = i; k < j; k++) {
        const pr = pairs[k].find(([qa]) => qa.outer === outer[outer.length - 1]);
        outer.push(pr[1].outer);
        for (const h of holes) h.push(pr[1].holes[pr[0].holes.indexOf(h[h.length - 1])]);
      }
      const zs = [slabs[i].za, ...slabs.slice(i, j + 1).map((s) => (s.za + s.zb) / 2), slabs[j].zb];
      // A run whose ends can't be filled cleanly (crowded holes) is built in plain steps instead: always closed.
      try { mesh.append(loftRun([outer, ...holes], zs)); }
      catch { for (let k = i; k <= j; k++) mesh.append(extrudePolygon(outer[k - i], holes.map((h) => h[k - i]), slabs[k].za, slabs[k].zb)); }
    }
    i = j + 1;
  }
}

// One loop carried onto the next: each point moved along its outward direction
// to where it meets loop b (the nearest spot if that's far), in order along b,
// and b's sharp corners kept by moving the ring point nearest each onto it.
export function carry(ring, b) {
  const B = along(b), n = ring.length;
  const normals = along(ring).normals;
  const s = ring.map((p, k) => B.across(p, normals[k]));
  const eps = B.total * 1e-7;
  for (let k = 1; k < n; k++) {
    let d = s[k] - s[k - 1];
    if (d < -B.total / 2) d += B.total;
    if (d > B.total / 2) d -= B.total;
    s[k] = s[k - 1] + Math.max(eps, d);
  }
  const out = s.map((t) => B.at(t).slice());
  const L = b.length;
  for (let i = 0; i < L; i++) {
    const p = b[(i + L - 1) % L], q = b[i], r = b[(i + 1) % L];
    const u = [q[0] - p[0], q[1] - p[1]], v = [r[0] - q[0], r[1] - q[1]], lu = Math.hypot(...u), lv = Math.hypot(...v);
    if (!lu || !lv || (u[0] * v[0] + u[1] * v[1]) / (lu * lv) > Math.cos((20 * Math.PI) / 180)) continue; // not a corner
    let best = Infinity, at = -1;
    for (let k = 0; k < n; k++) { const d = (out[k][0] - q[0]) ** 2 + (out[k][1] - q[1]) ** 2; if (d < best) { best = d; at = k; } }
    if (at >= 0 && best < 0.25) out[at] = [q[0], q[1]];
  }
  return out;
}

// A run of outlines (loops[0] the outer, then the holes; each a list of the
// loop at each level) lofted through heights zs: zs[0] and the last are the
// run's flat ends, the rest the slabs' mid-heights. One closed shell.
export function loftRun(loops, zs) {
  const mesh = new Mesh();
  // Rings for each loop at each slab's mid.
  const mids = loops.map((seq, li) => {
    let r = orient(seq[0], li === 0);
    const out = [r];
    for (let k = 1; k < seq.length; k++) out.push((r = carry(r, orient(seq[k], li === 0))));
    return out;
  });
  // The ends: where the outline narrows toward a face (a round or chamfer meeting it), the
  // slope carries on to the face, so it meets it at full width and not with a straight
  // half-step. Where it widens to the part's full size, the wall goes straight up as drawn,
  // so nothing stands past the size it was drawn at.
  const n = mids[0].length, area = (r) => Math.abs(signedArea(r));
  const narrows0 = area(mids[0][0]) < area(mids[0][1]) - 1e-9, narrows1 = area(mids[0][n - 1]) < area(mids[0][n - 2]) - 1e-9;
  const t0 = (zs[1] - zs[0]) / (zs[2] - zs[1]), t1 = (zs[n + 1] - zs[n]) / (zs[n] - zs[n - 1]);
  const ext = (r, q, t) => r.map((p, k) => [p[0] + (p[0] - q[k][0]) * t, p[1] + (p[1] - q[k][1]) * t]);
  const rings = mids.map((out) => [narrows0 ? ext(out[0], out[1], t0) : out[0], ...out, narrows1 ? ext(out[n - 1], out[n - 2], t1) : out[n - 1]]);
  const base = [];
  for (let lv = 0; lv < zs.length; lv++) {
    base.push(rings.map((rs) => { const o = mesh.vertexCount ?? mesh.positions.length / 3; for (const [x, y] of rs[lv]) mesh.addVertex(x, y, zs[lv]); return o; }));
  }
  for (let lv = 0; lv + 1 < zs.length; lv++) {
    rings.forEach((rs, li) => {
      const m = rs[0].length, a0 = base[lv][li], b0 = base[lv + 1][li];
      for (let k = 0; k < m; k++) mesh.addQuad(a0 + k, a0 + ((k + 1) % m), b0 + ((k + 1) % m), b0 + k);
    });
  }
  // The two flat ends.
  const cap = (lv, up) => {
    const rs = rings.map((r) => r[lv]);
    const { coords, tris } = triangulate(rs[0], rs.slice(1));
    let n = 0; const map = []; // triangulate's points are the rings' points in the same order
    rs.forEach((r, li) => { for (let k = 0; k < r.length; k++) map[n++] = base[lv][li] + k; });
    if (coords.length !== n) throw new Error('loft cap: ring points changed');
    if (tris.length / 3 !== n + 2 * (rs.length - 1) - 2) throw new Error('loft cap: not filled'); // a fill that missed a corner leaves a hole
    for (let t = 0; t < tris.length; t += 3) { const [a, b, c] = [map[tris[t]], map[tris[t + 1]], map[tris[t + 2]]]; if (up) mesh.addTri(a, b, c); else mesh.addTri(a, c, b); }
  };
  cap(0, false);
  cap(zs.length - 1, true);
  return mesh;
}

// The loop's centre of area (an average of its points would lean toward wherever the points are dense).
const centroid = (l) => {
  let a = 0, x = 0, y = 0;
  for (let i = 0; i < l.length; i++) { const p = l[i], q = l[(i + 1) % l.length], c = p[0] * q[1] - q[0] * p[1]; a += c; x += (p[0] + q[0]) * c; y += (p[1] + q[1]) * c; }
  if (Math.abs(a) < 1e-12) { for (const p of l) { x += p[0]; y += p[1]; } return [x / l.length, y / l.length]; }
  return [x / (3 * a), y / (3 * a)];
};
const span = (l) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, y] of l) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); } return Math.max(c - a, d - b); };
// The furthest any point of loop a is from loop b (a sampled one-way Hausdorff distance).
function reach(a, b) {
  const pts = a.length > 240 ? resample(a, 240) : a, L = b.length;
  let worst = 0;
  for (const [x, y] of pts) {
    let best = Infinity;
    for (let i = 0; i < L && best > worst; i++) {
      const p = b[i], q = b[(i + 1) % L], dx = q[0] - p[0], dy = q[1] - p[1], l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / l2)) : 0;
      best = Math.min(best, (p[0] + t * dx - x) ** 2 + (p[1] + t * dy - y) ** 2);
    }
    worst = Math.max(worst, best);
  }
  return Math.sqrt(worst);
}
// Two loops are the same feature, a little bigger or smaller: close centres, similar
// areas, and no part of either further than lim from the other (a notch or a boss
// that comes and goes between slabs is a step, not a slope).
function sameLoop(a, b, lim = Infinity) {
  const [ax, ay] = centroid(a), [bx, by] = centroid(b), sa = Math.abs(signedArea(a)), sb = Math.abs(signedArea(b));
  if (!(Math.hypot(ax - bx, ay - by) < 0.15 * Math.max(span(a), span(b)) + 0.5 && sb / sa > 0.7 && sb / sa < 1.43)) return false;
  return lim === Infinity || (reach(a, b) <= lim && reach(b, a) <= lim);
}
// Each outline (with its holes) in one slab paired with exactly one in the next, or
// null. lim: how far apart (mm) the two may be anywhere and still count as one shape.
export function matchGroups(ga, gb, lim = Infinity) {
  if (ga.length !== gb.length || !ga.length) return null;
  const used = new Set(), out = [];
  for (const qa of ga) {
    const qb = gb.find((q, k) => !used.has(k) && q.holes.length === qa.holes.length && sameLoop(qa.outer, q.outer, lim));
    if (!qb) return null;
    used.add(gb.indexOf(qb));
    const usedH = new Set(), holes = [];
    for (const h of qa.holes) {
      const k = qb.holes.findIndex((g, j) => !usedH.has(j) && sameLoop(h, g, lim));
      if (k < 0) return null;
      usedH.add(k); holes.push([h, qb.holes[k]]);
    }
    out.push([{ outer: qa.outer, holes: holes.map((x) => x[0]) }, { outer: qb.outer, holes: holes.map((x) => x[1]) }]);
  }
  return out;
}

// A closed loop as n points evenly spaced along it.
export function resample(loop, n) {
  const L = loop.length, seg = [];
  let total = 0;
  for (let i = 0; i < L; i++) { const a = loop[i], b = loop[(i + 1) % L], d = Math.hypot(b[0] - a[0], b[1] - a[1]); seg.push(d); total += d; }
  const out = [];
  let i = 0, acc = 0;
  for (let k = 0; k < n; k++) {
    const t = (k * total) / n;
    while (acc + seg[i] < t && i < L - 1) acc += seg[i++];
    const a = loop[i], b = loop[(i + 1) % L], f = seg[i] ? (t - acc) / seg[i] : 0;
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}
// A closed loop measured along its length: where each corner sits, the spot at
// any length, and the length at the nearest spot to a point.
function along(loop) {
  const L = loop.length, cum = [0];
  for (let i = 0; i < L; i++) { const p = loop[i], q = loop[(i + 1) % L]; cum.push(cum[i] + Math.hypot(q[0] - p[0], q[1] - p[1])); }
  const total = cum[L];
  const nearest = ([x, y]) => {
    let best = Infinity, s = 0;
    for (let i = 0; i < L; i++) {
      const p = loop[i], q = loop[(i + 1) % L], dx = q[0] - p[0], dy = q[1] - p[1], l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / l2)) : 0;
      const d = (p[0] + t * dx - x) ** 2 + (p[1] + t * dy - y) ** 2;
      if (d < best) { best = d; s = t === 1 ? cum[i + 1] % total : cum[i] + t * (cum[i + 1] - cum[i]); }
    }
    return s;
  };
  const at = (t) => {
    t = ((t % total) + total) % total;
    let lo = 0, hi = L;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= t) lo = mid; else hi = mid; }
    const p = loop[lo], q = loop[(lo + 1) % L], f = cum[lo + 1] > cum[lo] ? (t - cum[lo]) / (cum[lo + 1] - cum[lo]) : 0;
    return f === 0 ? p : [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
  };
  // Where the line from p along direction n (either way) first meets the loop, as
  // a length along it; the nearest spot when that's much further than the nearest.
  // For a loop and its offset (a round's steps), this pairs each point with its
  // own place on the other: the same direction out, so corners stay square on.
  const across = (p, n) => {
    const near = nearest(p), q = at(near), dn = Math.hypot(q[0] - p[0], q[1] - p[1]);
    let best = Math.max(0.05, 2.5 * dn), s = near;
    for (let i = 0; i < L; i++) {
      const a = loop[i], b = loop[(i + 1) % L], ex = b[0] - a[0], ey = b[1] - a[1];
      const den = n[0] * ey - n[1] * ex;
      if (Math.abs(den) < 1e-12) continue;
      const wx = a[0] - p[0], wy = a[1] - p[1], t = (wx * ey - wy * ex) / den, u = (wx * n[1] - wy * n[0]) / den;
      if (u < -1e-9 || u > 1 + 1e-9 || Math.abs(t) >= best) continue;
      best = Math.abs(t); s = u >= 1 ? cum[i + 1] % total : cum[i] + Math.max(0, u) * (cum[i + 1] - cum[i]);
    }
    return s;
  };
  // The outward direction at each corner: square to the two sides, averaged (for a loop going round anticlockwise).
  const normals = loop.map((p, i) => {
    const a = loop[(i + L - 1) % L], b = loop[(i + 1) % L];
    const n1 = [p[1] - a[1], a[0] - p[0]], n2 = [b[1] - p[1], p[0] - b[0]];
    const l1 = Math.hypot(...n1) || 1, l2 = Math.hypot(...n2) || 1, n = [n1[0] / l1 + n2[0] / l2, n1[1] / l1 + n2[1] / l2], l = Math.hypot(...n);
    return l > 1e-9 ? [n[0] / l, n[1] / l] : [n1[0] / l1, n1[1] / l1];
  });
  return { cum: cum.slice(0, L), total, nearest, at, across, normals };
}
