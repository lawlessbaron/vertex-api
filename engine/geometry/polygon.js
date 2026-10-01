import { Mesh } from './mesh.js';

// 2D polygon helpers. Polygons are arrays of [x, y].

export function signedArea(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j][0] - poly[i][0]) * (poly[j][1] + poly[i][1]);
  }
  return a / 2;
}

export function orient(poly, ccw = true) {
  return (signedArea(poly) > 0) === ccw ? poly : [...poly].reverse();
}

export function pointInPolygon([x, y], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Group traced loops into polygons with holes: counter-clockwise loops are
// outlines, clockwise loops are holes inside the smallest outline around them.
export function groupLoops(loops) {
  const outers = loops.filter((l) => signedArea(l) > 0).map((l) => ({ outer: l, area: signedArea(l), holes: [] }));
  outers.sort((a, b) => a.area - b.area);
  for (const h of loops.filter((l) => signedArea(l) < 0)) {
    const home = outers.find((o) => pointInPolygon(h[0], o.outer));
    if (home) home.holes.push(h);
  }
  return outers;
}

export function circlePolygon(cx, cy, r, segments = 32) {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

// Ramer-Douglas-Peucker on a closed ring.
export function simplifyClosed(poly, tolerance) {
  if (poly.length < 8) return poly;
  // Split at the two farthest-apart points so both halves are open polylines.
  let far = 0, best = -1;
  for (let i = 1; i < poly.length; i++) {
    const d = (poly[i][0] - poly[0][0]) ** 2 + (poly[i][1] - poly[0][1]) ** 2;
    if (d > best) { best = d; far = i; }
  }
  const a = rdp(poly.slice(0, far + 1), tolerance);
  const b = rdp([...poly.slice(far), poly[0]], tolerance);
  const out = [...a.slice(0, -1), ...b.slice(0, -1)];
  return out.length >= 3 ? out : poly;
}

function rdp(points, tol) {
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const [x1, y1] = points[s];
    const [x2, y2] = points[e];
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1e-12;
    let idx = -1, max = tol;
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs(dy * points[i][0] - dx * points[i][1] + x2 * y1 - y2 * x1) / len;
      if (d > max) { max = d; idx = i; }
    }
    if (idx >= 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

// ---------------------------------------------------------------------------
// Ear-clipping triangulation for a polygon with holes. Holes are bridged into
// the outer ring, then ears are clipped. Returns triangle indices into the
// flattened vertex list [outer..., hole0..., hole1...].

export function triangulate(outer, holes = []) {
  const coords = [];
  const push = (ring) => {
    const start = coords.length;
    for (const p of ring) coords.push(p);
    return start;
  };
  const outerRing = orient(outer, true);
  const holeRings = holes.map((h) => orient(h, false));
  let list = linkedRing(outerRing, push(outerRing));
  const holeLists = holeRings
    .map((h) => {
      const start = push(h);
      const node = linkedRing(h, start);
      return leftmost(node);
    })
    .sort((a, b) => a.x - b.x);
  for (const h of holeLists) list = bridgeHole(h, list);
  const tris = [];
  clipEars(list, tris, coords.length > 80 ? indexZ(list) : null);
  return { coords, tris, rings: [outerRing, ...holeRings] };
}

function node(i, x, y) {
  return { i, x, y, prev: null, next: null, z: 0, prevZ: null, nextZ: null };
}

// Big rings: every vertex also sits in a list sorted by its z-order (Morton)
// code, so the ear test only looks at vertices whose code falls inside the
// triangle's box instead of the whole ring. The codes keep order along each
// axis, so no vertex inside the box is skipped: the same ears, far faster.
function zOrder(x, y, z) {
  let a = Math.floor((x - z.minX) * z.inv), b = Math.floor((y - z.minY) * z.inv);
  a = (a | (a << 8)) & 0x00FF00FF; a = (a | (a << 4)) & 0x0F0F0F0F; a = (a | (a << 2)) & 0x33333333; a = (a | (a << 1)) & 0x55555555;
  b = (b | (b << 8)) & 0x00FF00FF; b = (b | (b << 4)) & 0x0F0F0F0F; b = (b | (b << 2)) & 0x33333333; b = (b | (b << 1)) & 0x55555555;
  return a | (b << 1);
}

function indexZ(start) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, p = start;
  do { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y; p = p.next; } while (p !== start);
  const z = { minX, minY, inv: 32767 / Math.max(maxX - minX, maxY - minY, 1e-9) };
  const nodes = [];
  p = start;
  do { p.z = zOrder(p.x, p.y, z); nodes.push(p); p = p.next; } while (p !== start);
  nodes.sort((a, b) => a.z - b.z);
  for (let k = 0; k < nodes.length; k++) { nodes[k].prevZ = nodes[k - 1] || null; nodes[k].nextZ = nodes[k + 1] || null; }
  return z;
}

function linkedRing(ring, start) {
  let first = null, last = null;
  ring.forEach(([x, y], k) => {
    const n = node(start + k, x, y);
    if (!first) first = n;
    else { last.next = n; n.prev = last; }
    last = n;
  });
  last.next = first;
  first.prev = last;
  return first;
}

function leftmost(start) {
  let p = start, best = start;
  do {
    if (p.x < best.x || (p.x === best.x && p.y < best.y)) best = p;
    p = p.next;
  } while (p !== start);
  return best;
}

const area2 = (p, q, r) => (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
const equals = (a, b) => a.x === b.x && a.y === b.y;

function pointInTriangle(ax, ay, bx, by, cx, cy, px, py) {
  return (
    (cx - px) * (ay - py) >= (ax - px) * (cy - py) &&
    (ax - px) * (by - py) >= (bx - px) * (ay - py) &&
    (bx - px) * (cy - py) >= (cx - px) * (by - py)
  );
}

function intersects(p1, q1, p2, q2) {
  const s = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
  const o1 = s(area2(p1, q1, p2)), o2 = s(area2(p1, q1, q2));
  const o3 = s(area2(p2, q2, p1)), o4 = s(area2(p2, q2, q1));
  return o1 !== o2 && o3 !== o4;
}

// Find a vertex on the outer ring visible from the hole's leftmost vertex
// (ray cast to the left), then splice the hole in with a two-way bridge.
function bridgeHole(hole, outer) {
  let p = outer;
  const hx = hole.x, hy = hole.y;
  let qx = -Infinity, m = null;
  do {
    if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
      const x = p.x + ((hy - p.y) * (p.next.x - p.x)) / (p.next.y - p.y);
      if (x <= hx && x > qx) {
        qx = x;
        m = p.x < p.next.x ? p : p.next;
        if (x === hx) return splitBridge(hole, m, outer);
      }
    }
    p = p.next;
  } while (p !== outer);
  if (!m) return outer;
  // Pick the candidate inside the triangle (hole, ray hit, m) with the
  // smallest angle to the ray so the bridge does not cross the ring.
  const stop = m;
  const mx = m.x, my = m.y;
  let tanMin = Infinity;
  p = m;
  do {
    if (
      hx >= p.x && p.x >= mx && hx !== p.x &&
      pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)
    ) {
      const tan = Math.abs(hy - p.y) / (hx - p.x);
      if (locallyInside(p, hole) && (tan < tanMin || (tan === tanMin && p.x > m.x))) {
        m = p;
        tanMin = tan;
      }
    }
    p = p.next;
  } while (p !== stop);
  return splitBridge(hole, m, outer);
}

function locallyInside(a, b) {
  return area2(a.prev, a, a.next) < 0
    ? area2(a, b, a.next) >= 0 && area2(a, a.prev, b) >= 0
    : area2(a, b, a.prev) < 0 || area2(a, a.next, b) < 0;
}

function splitBridge(hole, m, outer) {
  const a2 = node(m.i, m.x, m.y);
  const b2 = node(hole.i, hole.x, hole.y);
  const an = m.next, bp = hole.prev;
  m.next = hole; hole.prev = m;
  a2.next = an; an.prev = a2;
  b2.next = a2; a2.prev = b2;
  bp.next = b2; b2.prev = bp;
  return outer;
}

function isEar(ear) {
  const a = ear.prev, b = ear, c = ear.next;
  if (area2(a, b, c) >= 0) return false; // reflex (ring is CCW in y-up coordinates)
  // The triangle's box: a point outside it can't be inside the triangle (cheap first test).
  const minX = Math.min(a.x, b.x, c.x), maxX = Math.max(a.x, b.x, c.x), minY = Math.min(a.y, b.y, c.y), maxY = Math.max(a.y, b.y, c.y);
  let p = c.next;
  while (p !== a) {
    if (
      p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY &&
      !equals(p, a) && !equals(p, b) && !equals(p, c) &&
      pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) &&
      area2(p.prev, p, p.next) >= 0
    ) return false;
    p = p.next;
  }
  return true;
}

function remove(n) {
  n.prev.next = n.next;
  n.next.prev = n.prev;
  if (n.prevZ) n.prevZ.nextZ = n.nextZ;
  if (n.nextZ) n.nextZ.prevZ = n.prevZ;
}

// isEar, looking only at vertices whose z-order code lies in the triangle's box.
function isEarHashed(ear, z) {
  const a = ear.prev, b = ear, c = ear.next;
  if (area2(a, b, c) >= 0) return false;
  const minX = Math.min(a.x, b.x, c.x), maxX = Math.max(a.x, b.x, c.x), minY = Math.min(a.y, b.y, c.y), maxY = Math.max(a.y, b.y, c.y);
  const minZ = zOrder(minX, minY, z), maxZ = zOrder(maxX, maxY, z);
  const blocks = (p) => p !== a && p !== c &&
    p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY &&
    !equals(p, a) && !equals(p, b) && !equals(p, c) &&
    pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) &&
    area2(p.prev, p, p.next) >= 0;
  for (let p = ear.prevZ; p && p.z >= minZ; p = p.prevZ) if (blocks(p)) return false;
  for (let p = ear.nextZ; p && p.z <= maxZ; p = p.nextZ) if (blocks(p)) return false;
  return true;
}

function clipEars(start, tris, z = null) {
  const earTest = z ? (e) => isEarHashed(e, z) : isEar;
  let ear = start;
  let stop = ear;
  let pass = 0;
  while (ear.prev !== ear.next) {
    const prev = ear.prev, next = ear.next;
    if (earTest(ear)) {
      tris.push(prev.i, ear.i, next.i);
      remove(ear);
      ear = next.next;
      stop = next.next;
      continue;
    }
    ear = next;
    if (ear === stop) {
      if (pass === 0) {
        // Remove collinear / duplicate points and retry.
        let p = ear, changed = false;
        do {
          if (equals(p, p.next) || area2(p.prev, p, p.next) === 0) {
            remove(p);
            changed = true;
            p = p.next;
            if (p.next === p.prev) return;
          } else p = p.next;
        } while (p !== ear);
        ear = p;
        stop = p;
        pass = changed ? 0 : 1;
      } else if (pass === 1) {
        // Last resort: split off a triangle that at least is not reflex.
        let p = ear;
        do {
          if (area2(p.prev, p, p.next) < 0 && !intersects(p.prev, p.next, p.next, p.next.next)) break;
          p = p.next;
        } while (p !== ear);
        tris.push(p.prev.i, p.i, p.next.i);
        const nx = p.next;
        remove(p);
        ear = nx;
        stop = nx;
      }
    }
  }
}

// Watertight prism from a polygon with holes, between z0 and z1.
export function extrudePolygon(outer, holes, z0, z1) {
  const { coords, tris, rings } = triangulate(outer, holes);
  const mesh = new Mesh();
  const n = coords.length;
  for (const [x, y] of coords) mesh.addVertex(x, y, z0);
  for (const [x, y] of coords) mesh.addVertex(x, y, z1);
  // Walls: outer ring is CCW and holes CW, so "inside on the left" everywhere.
  let start = 0;
  for (const ring of rings) {
    const m = ring.length;
    for (let k = 0; k < m; k++) {
      const a = start + k, b = start + ((k + 1) % m);
      mesh.addQuad(a, b, b + n, a + n);
    }
    start += m;
  }
  for (let t = 0; t < tris.length; t += 3) {
    const [a, b, c] = [tris[t], tris[t + 1], tris[t + 2]];
    // Ear clipping emits counter-clockwise (up-facing) triangles.
    mesh.addTri(a, c, b);
    mesh.addTri(a + n, b + n, c + n);
  }
  return mesh;
}
