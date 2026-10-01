// Cable drag chains: links that snap together on pins, sized to the cables
// inside, with a bracket for each end. Printed standing up, no supports.
//
// Each link runs along +y. Its rear has the outer plates, with a hole at y = 0;
// its front has the inner plates, with a pin at y = pitch that snaps into the
// next link's holes. A short joggle in the middle joins them. Plate ends are
// rounded about the pins so links turn freely.
//  - The floors butt together when the chain is straight, so it can't bend the
//    wrong way and sag.
//  - The gap between the top bars sets how far it can bend: the minimum radius.
// Parts are unions of closed shells, centred on the origin.
import { Mesh } from './mesh.js';
import { circlePolygon, extrudePolygon } from './polygon.js';
import { box } from './primitives.js';

export const DRAGCHAIN_DEFAULTS = {
  width: 15, // clear width inside, mm
  height: 10, // clear height inside, mm
  links: 12,
  bend: 40, // smallest bend radius, mm
  wall: 2,
  segments: 32,
};

const GAP = 0.3; // between the inner and outer plates, and the narrowed floor

// Extrude a (y, z) polygon along x. (u, v, w) → (w, u, v) is a rotation, so the
// winding stays right.
function alongX(outer, holes, x0, x1) {
  const m = extrudePolygon(outer, holes, x0, x1);
  const p = m.positions;
  for (let i = 0; i < p.length; i += 3) { const u = p[i], v = p[i + 1], w = p[i + 2]; p[i] = w; p[i + 1] = u; p[i + 2] = v; }
  return m;
}

// A teardrop in the (y, z) plane, tip up, counter-clockwise.
function teardrop(cy, cz, r, n = 24) {
  const pts = [];
  for (let k = 0; k < n; k++) { const a = Math.PI * 0.75 + (k / (n - 1)) * Math.PI * 1.5; pts.push([cy + r * Math.cos(a), cz + r * Math.sin(a)]); }
  pts.push([cy, cz + r * Math.SQRT2]);
  return pts;
}

// A plate's side outline from y0 to y1, height H, rounded about (yr, H/2) at
// one end: `round` is 'front' (round at y1) or 'rear' (round at y0).
function plateOutline(y0, y1, H, round, n) {
  const r = H / 2, pts = [];
  if (round === 'front') {
    pts.push([y0, 0]);
    for (let k = 0; k <= n; k++) { const a = -Math.PI / 2 + (k / n) * Math.PI; pts.push([y1 + r * Math.cos(a), r + r * Math.sin(a)]); }
    pts.push([y0, H]);
  } else {
    pts.push([y1, 0], [y1, H]);
    for (let k = 0; k <= n; k++) { const a = Math.PI / 2 + (k / n) * Math.PI; pts.push([y0 + r * Math.cos(a), r + r * Math.sin(a)]); }
  }
  return pts;
}

/** The sizes every piece shares. */
export function chainPlan(options = {}) {
  const o = { ...DRAGCHAIN_DEFAULTS, ...options };
  const t = Math.max(1.2, o.wall);
  const Wi = Math.max(4, o.width) + 2 * GAP + 0.2; // the narrowed rear floor still clears the cables' width
  const Hp = Math.max(4, o.height) + 2 * t;
  const pitch = Math.ceil(Hp + 2 * t + 1);
  const pin = Math.max(1.2, Math.min(3, Hp * 0.16));
  const xi = Wi / 2, xo = Wi / 2 + t + GAP; // inner faces of the inner and outer plates
  // Top bars: the gap between neighbours closes at the bend angle the radius asks for.
  const theta = pitch / Math.max(pitch, o.bend);
  const topGap = Math.min(pitch - 2 * t, Math.max(0.6, (theta * Hp) / 2));
  return { o, t, Wi, Hp, pitch, pin, xi, xo, outerW: 2 * (xo + t), topGap };
}

// The front half: inner plates with pins at y = front, floor and top bar.
function frontHalf(c, from, front, mesh) {
  const { t, Hp, xi, pin, o } = c;
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? xi : -xi - t;
    mesh.append(alongX(plateOutline(from, front, Hp, 'front', 12), [], x0, x0 + t));
    // The pin, out through the gap into the next link's outer plate.
    const px0 = s > 0 ? xi + t - 0.01 : -xi - 2 * t - GAP + 0.3, px1 = s > 0 ? xi + 2 * t + GAP - 0.3 : -xi - t + 0.01;
    mesh.append(alongX(teardrop(front, Hp / 2, pin, Math.max(16, o.segments)), [], px0, px1));
  }
}

function rearHalf(c, rear, to, mesh) {
  const { t, Hp, xo, pin, o } = c;
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? xo : -xo - t;
    mesh.append(alongX(plateOutline(rear, to, Hp, 'rear', 12), [teardrop(rear, Hp / 2, pin + 0.25, Math.max(16, o.segments)).reverse()], x0, x0 + t));
  }
}

/** One link, pin hole at y = 0 and pin at y = pitch. */
export function chainLink(c) {
  const { t, Hp, pitch, xi, xo, topGap } = c;
  const mid = pitch / 2, mesh = new Mesh();
  rearHalf(c, 0, mid + t / 2, mesh);
  frontHalf(c, mid - t / 2, pitch, mesh);
  // The joggle joining inner and outer plates.
  for (const s of [-1, 1]) mesh.append(s > 0 ? box(xi + t - 0.01, mid - t / 2, 0, xo + 0.01, mid + t / 2, Hp) : box(-xo - 0.01, mid - t / 2, 0, -xi - t + 0.01, mid + t / 2, Hp));
  // Floor: narrowed in the rear half (it sits between the last link's inner plates).
  mesh.append(box(-xi + GAP, 0.15, 0, xi - GAP, mid + 0.01, t));
  mesh.append(box(-xi - 0.01, mid, 0, xi + 0.01, pitch - 0.15, t));
  // Top bar, shorter so the links can bend up to the radius asked for.
  const half = (pitch - topGap) / 2;
  mesh.append(box(-xi + GAP, mid - half, Hp - t, xi - GAP, mid + 0.01, Hp));
  mesh.append(box(-xi - 0.01, mid, Hp - t, xi + 0.01, mid + half, Hp));
  return mesh;
}

// A mounting plate with two M3 holes, either side of the chain.
function mountPlate(c, y0, y1) {
  const w = c.outerW / 2 + 9, cy = (y0 + y1) / 2, th = Math.max(3, c.t);
  const outer = [[-w, y0], [w, y0], [w, y1], [-w, y1]];
  const holes = [-1, 1].map((s) => circlePolygon(s * (w - 4.5), cy, 1.7, 24).reverse());
  return extrudePolygon(outer, holes, 0, th);
}

/** The bracket at the start (it holds the first link's rear) and at the end. */
export function chainMounts(c) {
  const { t, Hp, xi } = c, L = 16;
  const start = new Mesh();
  frontHalf(c, -Hp / 2 - L, 0, start);
  start.append(box(-xi - 0.01, -Hp / 2 - 1.01, 0, xi + 0.01, -0.15, t));
  start.append(mountPlate(c, -Hp / 2 - L, -Hp / 2 - 1));
  const end = new Mesh();
  rearHalf(c, 0, Hp / 2 + L, end);
  end.append(box(-xi + GAP, 0.15, 0, xi - GAP, Hp / 2 + 1.01, t));
  end.append(mountPlate(c, Hp / 2 + 1, Hp / 2 + L));
  return { start, end };
}

export function generateDragChain(options = {}) {
  const c = chainPlan(options);
  const n = Math.max(1, Math.min(80, Math.round(c.o.links)));
  const per = Math.max(1, Math.ceil(Math.sqrt(n * 1.5)));
  const one = chainLink(c);
  const links = new Mesh();
  const dx = c.outerW + 3, dy = c.pitch + c.Hp + 3;
  for (let k = 0; k < n; k++) {
    const m = new Mesh(); m.append(one);
    links.append(m.translate((k % per) * dx, -Math.floor(k / per) * dy, 0));
  }
  const { start, end } = chainMounts(c);
  const mounts = new Mesh();
  mounts.append(start);
  mounts.append(end.translate(c.outerW + 30, 0, 0));
  // The brackets beside the links, the whole plate centred.
  const bl = links.bounds(), bm = mounts.bounds();
  mounts.translate(bl.max[0] + 8 - bm.min[0], (bl.min[1] + bl.max[1]) / 2 - (bm.min[1] + bm.max[1]) / 2, 0);
  const all = new Mesh(); all.append(links); all.append(mounts);
  const b = all.bounds();
  for (const m of [links, mounts]) m.translate(-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2, 0);
  const length = n * c.pitch;
  const notes = [
    `${n} links make ${length} mm of chain. Press each link's pins into the next link's holes.`,
    `Fits cables up to ${c.o.width} × ${c.o.height} mm. Bends one way, to about a ${Math.round(c.o.bend)} mm radius.`,
  ];
  return { parts: [{ mesh: links, name: `drag-chain-${c.o.width}x${c.o.height}-x${n}` }, { mesh: mounts, name: 'drag-chain-mounts' }], notes, plan: c, length };
}
