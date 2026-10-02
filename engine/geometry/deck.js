// The Tectonic Deck (v2): a desk surface of printed tiles, and a quick-release
// receiver that any tool locks into.
//
// Tiles sit on a 150 mm grid: every tile is nx × ny cells, so any tile mates
// with any other and every trench lines up. Tiles join edge to edge with
// vertical dovetails, two per cell edge: the tails on a tile's right and back
// edges drop straight down into the sockets on its neighbours' left and front
// edges. A cable trench runs under the middle of every cell, both ways, with a
// 45° peaked roof so no bridge is over 10 mm. Tile tops: flat, crater (four
// bowls per cell), hardpoint (a pocket for a receiver), or the electronics tile
// (a soldering station cradle, a cable trough, iron yokes, a tip-cleaner cup).
//
// The receiver comes in three sizes (S, M, L). A shoe made for one device
// drops into its pocket; a lever swings a cam lobe through a window in the
// frame into a notch in the shoe and holds it. Nothing metal in the mechanism:
// the lever turns on a printed snap post (two tines with a barb), and a
// printed spring beam inside its hub clicks a bump into notches on the post at
// SHUT and OPEN. A snap-on hood covers it all. An "inserts" variant swaps the
// snap post and snap hood for an M3 screw and two screwed bosses.
//
// Every part prints with no supports: tiles, receiver and shoe base down, the
// lever flat, the hood and the link bar upside down.
import { Mesh } from './mesh.js';
import { circlePolygon, extrudePolygon, groupLoops, orient, pointInPolygon, signedArea, simplifyClosed, triangulate } from './polygon.js';
import { extrudeX, extrudeY, roundedRect } from './primitives.js';
import { rr, sections } from './slabs.js';
import { textPolygons, textUnits } from './font.js';

export const DECK = {
  grid: 150, // every tile is a whole number of these cells
  height: 15,
  foot: 0.4, // the bottom 0.4 mm steps in 0.4 mm: no elephant's foot
  edge: 0.6, // the top 0.6 mm steps in 0.6 mm: a crisp seam line between tiles
  skin: 5, // solid top over the cable trench
  trenchW: 22, trenchD: 10, trenchRoof: 10, // 22 × 10 trench; its roof narrows at 45° to a 10 mm bridge
  neck: 12, tip: 18, tail: 8, // dovetail: width at the edge, width at the tip, depth
  passD: 26, // cable pass-up hole
  insertD: 4.0, insertDepth: 5.7, // M3 heat-set insert
  screwD: 3.4, // M3 clearance
  // Receiver (z = 0 on the base's underside)
  base: 3, wall: 5, frameH: 13, // frame top at z = 16
  railX: [-16, -8], railDepth: 3, // alignment rails, off-centre so a shoe only goes in one way round
  window: 26, // the lever's window in the frame
  pivotY: -12, pivotTop: 6.5, lever: 5, hubR: 10, // the lever rides on the pad, 6.5 to 11.5
  lobeOffset: 17.5, lobeR: 5.5, shut: 138, swing: 60, handle: 45, handleW: 9,
  postR: 5.5, postTop: 13, barb: 0.6, slotW: 1.6, slotDeg: 26, // the printed snap pivot
  detent: 182.5, notchD: 0.5, // where the spring's bump sits on the lever, and the notches it clicks into
  flexT: 1.0, flexGap: 0.8, flexArc: 90, bumpH: 0.55, // the printed spring beam
  pocketChamfer: 1, leadIn: 2, // 45° lead-ins: the frame's pocket and the hood's opening
  hoodT: 2.5, skirt: 2.7, clipW: 12, clipT: 1.6, clipZ0: 9, clipGroove: 10.6, clipDepth: 0.6, clipX: [-20, 15],
  linkX: -20, linkDepth: 7, // receiver-to-receiver link bar dovetails
  // Shoe (z = 0 on its underside, which sits on the receiver's base)
  shoeClear: 0.25, shoeH: 12, shoeNeck: 4, notchW: 12, notchZ: [3.3, 8.7], notchDepth: 5.45,
  plateT: 4, plateW: 88, plateD: 140,
  // Electronics tile
  lipH: 6, troughW: 22, troughH: 18, cupD: 44, cupH: 30, ironAngle: 30, yokeSpacing: 40, yokeW: 30, yokeT: 4.05, yokeBase: 15,
};
// Back-compatible names the Tectonic page and older code read.
DECK.pivot = [50, DECK.pivotY];
DECK.bossTop = DECK.pivotTop;

export const RECEIVER_SIZES = { S: { pocket: 56.4, screw: 38 }, M: { pocket: 70.4, screw: 44 }, L: { pocket: 90.4, screw: 54 } };
export const RECEIVER_SIZE_NAMES = { S: 'S: 56 mm pocket', M: 'M: 70 mm pocket (most gear)', L: 'L: 90 mm pocket (big kit)' };

export const DECK_ITEMS = {
  deck: 'Tectonic Deck (a whole desk of tiles)',
  deckTile: 'Deck tile',
  electronics: 'Electronics tile (soldering bench)',
  receiver: 'Quick-release receiver',
  shoe: 'Adapter shoe and mount plate',
  extras: 'Trough lid, link bar and pivot washer',
};
export const DECK_TILES = { flat: 'Flat', crater: 'Crater (four bowls a cell)', hardpoint: 'Hardpoint (for a receiver)' };
export const SHOE_TOPS = {
  cradle: 'Round cradle (SpaceMouse and other pucks)',
  tray: 'Tray (soldering station, a box, a dock)',
  bolts: 'Bolt pattern (VESA 75, a shifter, a stick)',
  solder: 'Soldering iron yokes',
  grid: 'Hole grid (M3, 20 mm): build your own',
  blank: 'Blank plate',
};
export const HARDWARE = { printed: 'Printed (snap pivot, snap-on hood)', inserts: 'Inserts (M3 pivot screw, screwed hood)' };

export const DECK_DEFAULTS = {
  deckCols: 4, deckRows: 3,
  deckLayout: 'B2 hardpoint, C2 crater', // cells by letter (column) and number (row)
  tileType: 'flat',
  tileCols: 1, tileRows: 1, // a single tile: 1 × 1, 2 × 1 or 2 × 2 cells
  edges: 'all', // all | none: which edges get dovetails
  trench: 'both', // both | x | y | none
  passHole: true, // a hole up from the trench crossing on flat tiles
  ribs: true, // hollow the underside into pockets between ribs
  bowlDepth: 8,
  receiverSize: 'M',
  hardware: 'printed',
  withLever: true, // off: a parking dock (no lever, no pivot)
  flexT: 1.0, // the printed spring: 0.8 soft click, 1.0, 1.2 firm
  shoeTop: 'cradle',
  cradleD: 76, cradleH: 8,
  trayW: 80, trayD: 100, trayH: 10,
  boltSize: 'm4', boltW: 75, boltD: 75,
  ironD: 14, // the iron's handle where it rests in the yokes
  electronicsCells: 2, // 2: the station and the tool cell (300 × 150); 1: the station alone
  unitW: 130, unitD: 110, unitFeetX: 50, unitFeetY: 40, unitFootD: 12, // the station's footprint and feet (measure yours)
  spindleD: 16, // the solder spool's bore
};

const BOLTS = { m3: { d: 3.4, head: 6.2, headH: 3.2 }, m4: { d: 4.5, head: 7.8, headH: 4.2 }, m5: { d: 5.5, head: 9.4, headH: 5.2 }, m6: { d: 6.6, head: 11, headH: 6.2 } };
const num = (v, lo, hi, dflt) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };
const circle = (x, y, r, seg = 32) => circlePolygon(x, y, r, seg);
const rad = (d) => (d * Math.PI) / 180;
const sizeOf = (o) => (RECEIVER_SIZES[o?.receiverSize] ? o.receiverSize : 'M');

/** Pocket, half-width of the base, its +x reach (the cam side) and the screw pattern, for a size. */
export function receiverDims(size = 'M') {
  const s = RECEIVER_SIZES[size] || RECEIVER_SIZES.M;
  const P = s.pocket, half = P / 2 + DECK.wall + 9.8;
  return { P, half, xr: half + 10, sp: s.screw, o: P / 2 + DECK.wall };
}
// Lever angles (degrees, world): the same for every size, since the pivot sits
// a fixed distance from the pocket wall.
export const camAngles = () => ({ shut: DECK.shut, open: DECK.shut - DECK.swing, handle: DECK.shut + 180 });

/**
 * Sweep the lobe from SHUT to OPEN: it may only ever be inside the shoe's notch
 * or the frame's window. Returns the engagement when shut (mm), or null on a clash.
 */
export function camSweepCheck(size = 'M', steps = 120, pts = 72) {
  const { P, half, o } = receiverDims(size), c = DECK.shoeClear;
  const face = P / 2 - c, back = face - DECK.notchDepth;
  const { shut } = camAngles();
  let eng = null;
  for (let k = 0; k <= steps; k++) {
    const a = rad(shut - (DECK.swing * k) / steps), cx = half + DECK.lobeOffset * Math.cos(a), cy = DECK.pivotY + DECK.lobeOffset * Math.sin(a);
    for (let j = 0; j < pts; j++) {
      const t = (2 * Math.PI * j) / pts, x = cx + DECK.lobeR * Math.cos(t), y = cy + DECK.lobeR * Math.sin(t);
      if (x < face + c && !(-DECK.notchW / 2 + c <= y && y <= DECK.notchW / 2 - c && x >= back + c)) return null;
      if (face <= x && x <= o + c && !(-DECK.window / 2 + c <= y && y <= DECK.window / 2 - c)) return null;
    }
    if (k === 0) eng = face - (cx - DECK.lobeR);
  }
  return eng;
}

// Sections and rounded rectangles come from slabs.js.
// Lettering drawn off (debossed) into a slab: centred on (cx, cy), h mm tall,
// mirrored to read right from below when the face is a part's underside.
function letters(d, text, cx, cy, h, mirror = false) {
  const w = (textUnits(text) * h) / 6;
  for (const poly of textPolygons(text, -w / 2, -h / 2, h, Math.max(0.7, h * 0.16))) d.off(poly.map(([x, y]) => [cx + (mirror ? -x : x), cy + y]));
}
const turned = (mesh, deg) => {
  const c = Math.cos(rad(deg)), s = Math.sin(rad(deg)), p = mesh.positions;
  for (let i = 0; i < p.length; i += 3) { const x = p[i], y = p[i + 1]; p[i] = x * c - y * s; p[i + 1] = x * s + y * c; }
  return mesh;
};
// Upside down for printing: half a turn about x (a rotation, so it still faces out).
const flipped = (mesh) => { const p = mesh.positions; for (let i = 0; i < p.length; i += 3) { p[i + 1] = -p[i + 1]; p[i + 2] = -p[i + 2]; } return mesh; };
const copy = (mesh) => { const m = new Mesh(); m.append(mesh); return m; };
const memo = new Map();
const cached = (key, make) => { if (!memo.has(key)) { if (memo.size > 40) memo.clear(); memo.set(key, make()); } return copy(memo.get(key)); };

// ---------------------------------------------------------------------------
// Tiles

// A dovetail on an edge, as points along it in order. axis 'x': the edge is
// x = edge; dir +1 sticks out (a tail), −1 reaches in (a socket); c grows it.
function tailPts(axis, edge, along, dir, c, rev = false) {
  const he = DECK.neck / 2 + c, ht = DECK.tip / 2 + c, d = DECK.tail + c;
  let uv = [[edge, along - he], [edge + dir * d, along - ht], [edge + dir * d, along + ht], [edge, along + he]];
  if (rev) uv = uv.reverse();
  return axis === 'x' ? uv : uv.map(([u, v]) => [v, u]);
}

// A tile's outline, counter-clockwise: nx × ny cells. edges: { right, back,
// left, front } true = joins a neighbour there (tails on the right and back,
// sockets on the left and front), false = a plain edge (the deck's border).
export function tileOutline(S, edges, clearance = 0.2, nx = 1, ny = 1) {
  const X = (S * nx) / 2, Y = (S * ny) / 2, c = clearance / 2;
  const along = (n, L) => Array.from({ length: n }, (_, i) => -L + S * (i + 0.5)).flatMap((m) => [m - S / 4, m + S / 4]);
  const ax = along(nx, X), ay = along(ny, Y);
  const pts = [[-X, -Y]];
  if (edges.front) for (const x of ax) pts.push(...tailPts('y', -Y, x, 1, c));
  pts.push([X, -Y]);
  if (edges.right) for (const y of ay) pts.push(...tailPts('x', X, y, 1, 0));
  pts.push([X, Y]);
  if (edges.back) for (const x of [...ax].reverse()) pts.push(...tailPts('y', Y, x, 1, 0, true));
  pts.push([-X, Y]);
  if (edges.left) for (const y of [...ay].reverse()) pts.push(...tailPts('x', -X, y, 1, c, true));
  return pts;
}

// Clip a polygon to an axis-aligned box (Sutherland–Hodgman).
function clipBox(poly, x0, y0, x1, y1) {
  const planes = [[(p) => p[0] >= x0, (a, b) => lerpAt(a, b, 0, x0)], [(p) => p[0] <= x1, (a, b) => lerpAt(a, b, 0, x1)], [(p) => p[1] >= y0, (a, b) => lerpAt(a, b, 1, y0)], [(p) => p[1] <= y1, (a, b) => lerpAt(a, b, 1, y1)]];
  let out = poly;
  for (const [inside, cut] of planes) {
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i++) {
      const a = src[i], b = src[(i + 1) % src.length];
      if (inside(a)) { out.push(a); if (!inside(b)) out.push(cut(a, b)); } else if (inside(b)) out.push(cut(a, b));
    }
    if (!out.length) return [];
  }
  return out;
}
function lerpAt(a, b, k, v) {
  const t = (v - a[k]) / (b[k] - a[k]);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

// A polygon moved `d` mm inwards (a counter-clockwise outline), corner by
// corner with mitred joins: same points, so small edge breaks stay exact.
export function insetPolygon(poly, d) {
  const n = poly.length;
  const inward = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
  return poly.map((c, i) => {
    const n1 = inward(poly[(i + n - 1) % n], c), n2 = inward(c, poly[(i + 1) % n]);
    const k = d / Math.max(0.2, 1 + n1[0] * n2[0] + n1[1] * n2[1]);
    return [c[0] + (n1[0] + n2[0]) * k, c[1] + (n1[1] + n2[1]) * k];
  });
}

const inside = (ring, poly) => ring.every((q) => pointInPolygon(q, poly));
const cellCentres = (n, L) => Array.from({ length: n }, (_, i) => -L / 2 + DECK.grid * (i + 0.5));

// The tile body: pieces split by the trenches below the skin, the skin above,
// cut by `cuts` ({ ring, from, to }) wherever they're active, and the trench
// roofs' 45° wedges. → { mesh, pockets }
function tileBody({ nx, ny, edges, clr, trench, cuts, ribs }) {
  const S = DECK.grid, H = DECK.height, lowTop = H - DECK.skin, X = S * nx, Y = S * ny, tw = DECK.trenchW / 2;
  const outline = tileOutline(S, edges, clr * 2, nx, ny);
  const foot = insetPolygon(outline, DECK.foot), top = insetPolygon(outline, DECK.edge);
  const cxs = cellCentres(nx, X), cys = cellCentres(ny, Y);
  const xT = trench === 'both' || trench === 'x', yT = trench === 'both' || trench === 'y';
  const split = (cs, L, on) => {
    if (!on) return [[-L, L]];
    const out = [];
    let a = -L;
    for (const c of cs) { out.push([a, c - tw]); a = c + tw; }
    out.push([a, L]);
    return out;
  };
  const xs = split(cxs, X, yT), ys = split(cys, Y, xT);
  const pieces = [];
  for (const [x0, x1] of xs) for (const [y0, y1] of ys) {
    const piece = clipBox(outline, x0, y0, x1, y1), footPiece = clipBox(foot, x0, y0, x1, y1);
    if (piece.length >= 3) pieces.push({ piece, footPiece, box: [x0, y0, x1, y1] });
  }
  const all = [...cuts];
  let pockets = 0;
  if (ribs) for (const p of pieces) {
    const cells = ribPockets(p.piece, p.box, cuts, X, Y);
    pockets += cells.length;
    for (const ring of cells) all.push({ ring, from: -1, to: lowTop });
  }
  const zs = new Set([0, DECK.foot, lowTop, H - DECK.edge, H]);
  for (const c of all) for (const z of [c.from, c.to]) if (z > 0 && z < H) zs.add(Math.round(z * 1000) / 1000);
  const levels = [...zs].sort((a, b) => a - b);
  const mesh = new Mesh();
  for (let i = 0; i < levels.length - 1; i++) {
    const za = levels[i], zb = levels[i + 1], m = (za + zb) / 2;
    const live = all.filter((c) => c.from < m && c.to > m);
    const polys = zb <= lowTop + 1e-9 ? pieces.map((p) => (m < DECK.foot ? p.footPiece : p.piece)) : [m > H - DECK.edge ? top : outline];
    for (const poly of polys) {
      if (poly.length < 3) continue;
      const mine = live.filter((c) => inside(c.ring, poly));
      const bowls = mine.filter((c) => c.bowl).map((c) => c.bowl), plain = mine.filter((c) => !c.bowl).map((c) => c.ring);
      mesh.append(bowls.length ? slabWithBowls(poly, plain, bowls, za, zb) : extrudePolygon(poly, plain, za, zb));
    }
  }
  // The trench roofs: a 45° wedge each side, from 22 mm wide at z 4 to 10 mm at the skin.
  const slope = DECK.trenchD - (DECK.trenchW - DECK.trenchRoof) / 2, inner = DECK.trenchRoof / 2;
  const passAt = cuts.filter((c) => c.pass).map((c) => c.at);
  const runs = (from, to, at, along) => {
    // Gaps where a pass-up hole is, so its hole stays clear.
    const stops = passAt.filter(([px, py]) => Math.abs((along === 'x' ? py : px) - at) < 1).map(([px, py]) => (along === 'x' ? px : py)).sort((a, b) => a - b);
    const out = [];
    let a = from;
    for (const s of stops) { out.push([a, s - DECK.passD / 2 - 0.5]); a = s + DECK.passD / 2 + 0.5; }
    out.push([a, to]);
    return out.filter(([p, q]) => q - p > 1);
  };
  if (xT) for (const cy of cys) for (const s of [-1, 1]) for (const [a, b] of runs(-X / 2, X / 2, cy, 'x')) mesh.append(extrudeX([[cy + s * tw, slope], [cy + s * tw, lowTop], [cy + s * inner, lowTop]], a, b));
  if (yT) for (const cx of cxs) for (const s of [-1, 1]) for (const [a, b] of runs(-Y / 2, Y / 2, cx, 'y')) mesh.append(extrudeY([[cx + s * tw, slope], [cx + s * tw, lowTop], [cx + s * inner, lowTop]], a, b));
  return { mesh, pockets, outline, cxs, cys, X, Y };
}

// Pockets under a piece, between 4 mm ribs on a grid, kept clear of the
// sockets (8 mm in), the trench and its roof (7 mm), and every cut.
function ribPockets(piece, [bx0, by0, bx1, by1], cuts, X, Y) {
  const rib = 4, target = 25, edge = DECK.tail + 0.5 + 4, roof = 7;
  const xs = piece.map((q) => q[0]), ys = piece.map((q) => q[1]);
  const lo = (v, L) => (v <= -L / 2 + 0.01 ? -L / 2 + edge : v + roof), hi = (v, L) => (v >= L / 2 - 0.01 ? L / 2 - edge : v - roof);
  const x0 = lo(Math.max(Math.min(...xs), bx0, -X / 2), X), x1 = hi(Math.min(Math.max(...xs), bx1, X / 2), X);
  const y0 = lo(Math.max(Math.min(...ys), by0, -Y / 2), Y), y1 = hi(Math.min(Math.max(...ys), by1, Y / 2), Y);
  const nx = Math.max(0, Math.round((x1 - x0 + rib) / target)), ny = Math.max(0, Math.round((y1 - y0 + rib) / target));
  if (!nx || !ny) return [];
  const cw_ = (x1 - x0 - (nx - 1) * rib) / nx, cd_ = (y1 - y0 - (ny - 1) * rib) / ny;
  if (cw_ < 8 || cd_ < 8) return [];
  const out = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const cx = x0 + cw_ / 2 + i * (cw_ + rib), cy = y0 + cd_ / 2 + j * (cd_ + rib), hx = cw_ / 2, hy = cd_ / 2;
    if (![[cx - hx, cy - hy], [cx + hx, cy - hy], [cx + hx, cy + hy], [cx - hx, cy + hy]].every((q) => pointInPolygon(q, piece))) continue;
    if (piece.some(([x, y]) => Math.abs(x - cx) < hx + 4 && Math.abs(y - cy) < hy + 4)) continue;
    if (cuts.some((c) => c.ring.some(([x, y]) => Math.abs(x - cx) < hx + 4 && Math.abs(y - cy) < hy + 4))) continue;
    out.push(roundedRect({ cx, cy, w: cw_, d: cd_, r: 2 }, 3));
  }
  return out;
}

// A spherical bowl dished `depth` into the top. Its surface is built smooth
// (rings 0.25 mm apart, one continuous wall), not as stacked slabs.
const BOWL_SEG = 64;
function bowlCut(cx, cy, dia, depth, top = DECK.height) {
  const R = (dia * dia / 4 + depth * depth) / (2 * depth), zc = top - depth + R;
  return { bowl: { cx, cy, R, zc, rimAt: top - DECK.edge }, ring: circle(cx, cy, dia / 2 + DECK.edge, 40), from: top - depth, to: top + 1 };
}
// The rim's top 0.6 mm opens out at 45°, like the tile's own edge.
const bowlR = (b, z) => Math.sqrt(Math.max(0, b.R * b.R - (b.zc - z) ** 2)) + (b.rimAt != null ? Math.max(0, z - b.rimAt) : 0);
// A clockwise ring (as a hole runs), n points, starting at angle 0: every
// level of one bowl lines up point for point.
const cwRing = (cx, cy, r, n = BOWL_SEG) => Array.from({ length: n }, (_, k) => { const a = (-2 * Math.PI * k) / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });

// A slab z0..z1 of `outer` with plain holes (straight through it) and bowls
// (smooth walls; a bowl whose floor is in the slab ends in a rounded cap).
function slabWithBowls(outer, holes, bowls, z0, z1) {
  const mesh = new Mesh();
  const lift = (b) => bowlR(b, z0) > 0.05; // open at the slab's bottom too
  const topHoles = [...holes.map((h) => orient(h, false)), ...bowls.map((b) => cwRing(b.cx, b.cy, bowlR(b, z1)))];
  const botHoles = [...holes.map((h) => orient(h, false)), ...bowls.filter(lift).map((b) => cwRing(b.cx, b.cy, bowlR(b, z0)))];
  const top = triangulate(outer, topHoles), bot = triangulate(outer, botHoles);
  const t0 = mesh.vertexCount;
  for (const [x, y] of top.coords) mesh.addVertex(x, y, z1);
  for (let k = 0; k < top.tris.length; k += 3) mesh.addTri(t0 + top.tris[k], t0 + top.tris[k + 1], t0 + top.tris[k + 2]);
  const b0 = mesh.vertexCount;
  for (const [x, y] of bot.coords) mesh.addVertex(x, y, z0);
  for (let k = 0; k < bot.tris.length; k += 3) mesh.addTri(b0 + bot.tris[k], b0 + bot.tris[k + 2], b0 + bot.tris[k + 1]);
  const m = top.rings[0].length;
  for (let k = 0; k < m; k++) { const k1 = (k + 1) % m; mesh.addQuad(b0 + k, b0 + k1, t0 + k1, t0 + k); }
  const wall = (rings) => { for (let r = 0; r < rings.length - 1; r++) { const n = BOWL_SEG; for (let k = 0; k < n; k++) { const k1 = (k + 1) % n; mesh.addQuad(rings[r] + k, rings[r] + k1, rings[r + 1] + k1, rings[r + 1] + k); } } };
  // Plain holes: straight walls from the bottom ring to the top one.
  let offT = m, offB = m;
  for (const h of holes) {
    const n = h.length;
    for (let k = 0; k < n; k++) { const k1 = (k + 1) % n; mesh.addQuad(b0 + offB + k, b0 + offB + k1, t0 + offT + k1, t0 + offT + k); }
    offT += n; offB += n;
  }
  for (const b of bowls) {
    const rings = [];
    const floor = b.zc - b.R, start = Math.max(z0, floor);
    if (lift(b)) { rings.push(b0 + offB); offB += BOWL_SEG; }
    // Levels up the wall, finer near the floor where it curves most.
    const steps = Math.max(2, Math.ceil((z1 - start) / 0.25));
    for (let i = lift(b) ? 1 : 0; i < steps; i++) {
      const z = start + ((z1 - start) * i) / steps, r = bowlR(b, z);
      if (!lift(b) && i === 0) continue; // the cap's pole comes below
      const s0 = mesh.vertexCount;
      for (const [x, y] of cwRing(b.cx, b.cy, Math.max(0.05, r))) mesh.addVertex(x, y, z);
      rings.push(s0);
    }
    rings.push(t0 + offT); offT += BOWL_SEG;
    if (!lift(b)) {
      // The floor: a fan from the bowl's lowest point to the first ring.
      const pole = mesh.vertexCount;
      mesh.addVertex(b.cx, b.cy, start);
      for (let k = 0; k < BOWL_SEG; k++) { const k1 = (k + 1) % BOWL_SEG; mesh.addTri(pole, rings[0] + k1, rings[0] + k); }
    }
    wall(rings);
  }
  return mesh;
}

// One tile. o: { tileType, tileCols, tileRows, trench, passHole, ribs, bowlDepth, receiverSize, clearance }.
export function deckTile(o, edges = { right: true, back: true, left: true, front: true }) {
  const nx = Math.round(num(o.tileCols, 1, 2, 1)), ny = Math.round(num(o.tileRows, 1, 2, 1)), clr = num(o.clearance, 0, 0.6, 0.2);
  const type = DECK_TILES[o.tileType] ? o.tileType : 'flat';
  const H = DECK.height, S = DECK.grid, notes = [];
  const cxs = cellCentres(nx, S * nx), cys = cellCentres(ny, S * ny);
  const trench = ['both', 'x', 'y', 'none'].includes(o.trench) ? o.trench : 'both';
  const cuts = [];
  if (type === 'flat' && o.passHole !== false && trench === 'both') for (const cx of cxs) for (const cy of cys) cuts.push({ ring: circle(cx, cy, DECK.passD / 2, 40), from: -1, to: H + 1, pass: true, at: [cx, cy] });
  if (type === 'crater') {
    const depth = num(o.bowlDepth, 3, 8, 8), dia = Math.min(48, 2 * (S / 4 - (DECK.trenchW / 2 + 2)));
    for (const cx of cxs) for (const cy of cys) for (const sx of [-1, 1]) for (const sy of [-1, 1]) cuts.push(bowlCut(cx + (sx * S) / 4, cy + (sy * S) / 4, dia, depth));
    notes.push(`${4 * nx * ny} bowls, ${Math.round(dia)} mm across and ${depth} mm deep, with the trench still running underneath.`);
  }
  const size = sizeOf(o);
  if (type === 'hardpoint') {
    const { half, xr, sp } = receiverDims(size), floor = H - DECK.base, c = DECK.shoeClear;
    cuts.push({ ring: rr(-half - c, -half - c, xr + c, half + c, 3 + c), from: floor, to: H + 1 });
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) cuts.push({ ring: circle(sx * sp, sy * sp, DECK.insertD / 2, 24), from: floor - DECK.insertDepth, to: floor + 0.01 });
    notes.push(`Melt four M3 heat-set inserts into the pocket’s corners (±${sp} mm), then screw the size ${size} receiver in flush.`);
  }
  const body = tileBody({ nx, ny, edges, clr, trench, cuts, ribs: o.ribs !== false && type !== 'crater' });
  if (body.pockets) notes.push(`The underside is ${body.pockets} pockets between 4 mm ribs, open below: lighter and quicker to print.`);
  if (cuts.some((c) => c.pass)) notes.push('The round hole over the trench crossing brings a cable up.');
  if (nx * ny > 1) notes.push(`${nx * S} × ${ny * S} mm: it needs a bed that big (plus the 8 mm tails).`);
  return { mesh: body.mesh, notes, size };
}

// Which edges of cell (i, j) in a cols × rows deck join a neighbour.
export const cellEdges = (i, j, cols, rows) => ({ left: i > 0, right: i < cols - 1, front: j > 0, back: j < rows - 1 });

// "B2 hardpoint, C2 crater" → { 'B2': 'hardpoint', ... }
export function parseLayout(text, cols, rows) {
  const out = {};
  for (const m of String(text || '').toUpperCase().matchAll(/([A-Z])\s*(\d{1,2})\s*[:=]?\s*(FLAT|CRATER|HARDPOINT|BOWL|BOWLS|RECEIVER|MOUNT)/g)) {
    const i = m[1].charCodeAt(0) - 65, j = Number(m[2]) - 1;
    if (i < cols && j >= 0 && j < rows) out[`${m[1]}${m[2]}`] = { BOWL: 'crater', BOWLS: 'crater', RECEIVER: 'hardpoint', MOUNT: 'hardpoint' }[m[3]] || m[3].toLowerCase();
  }
  return out;
}

// ---------------------------------------------------------------------------
// The electronics tile: a cradle for a soldering station, a cable trough along
// the back with a snap lid and pass-downs to the trench, and (on 2 cells) a
// tool cell with iron yokes, a tip-cleaner cup, a solder spindle and bowls.

// Two V-yokes holding an iron at 30°, handle low at the front. On plate or tile top z0.
function ironYokes(ox, yFront, z0, ironD) {
  const mesh = new Mesh(), rise = DECK.yokeSpacing * Math.tan(rad(DECK.ironAngle)), vDepth = ironD / 2 + 2, hw = DECK.yokeW / 2, t = DECK.yokeT / 2;
  for (const [y, zv] of [[yFront, z0 + DECK.yokeBase], [yFront + DECK.yokeSpacing, z0 + DECK.yokeBase + rise]]) {
    const top = zv + vDepth, v = top - zv;
    mesh.append(extrudePolygon(rr(ox - hw, y - 6, ox + hw, y + 6, 2), [], z0, z0 + 3));
    // The yoke's face in (x, z), a V cut into its top, stood up through y.
    mesh.append(extrudeY([[ox - hw, z0], [ox + hw, z0], [ox + hw, top], [ox + v, top], [ox, zv], [ox - v, top], [ox - hw, top]], y - t, y + t));
  }
  return mesh;
}

export function electronicsTile(o = {}, edges = { right: true, back: true, left: true, front: true }) {
  const nx = Math.round(num(o.electronicsCells, 1, 2, 2)), clr = num(o.clearance, 0, 0.6, 0.2), H = DECK.height, S = DECK.grid;
  const X2 = (S * nx) / 2, Y2 = S / 2, W = DECK.skirt, cxs = cellCentres(nx, S * nx);
  const unitW = num(o.unitW, 60, 140, 130), unitD = num(o.unitD, 60, 120, 110), footD = num(o.unitFootD, 4, 30, 12);
  const fx = num(o.unitFeetX, 5, unitW / 2 - 2, 50), fy = num(o.unitFeetY, 5, unitD / 2 - 2, 40);
  const troughFront = Y2 - DECK.troughW, ux = cxs[0], lipY = -Y2 + (edges.front ? DECK.tail + 1.5 : 1), front = lipY + W + 0.5, ucy = front + unitD / 2;
  const cuts = [];
  // The station's feet sit in 1.5 mm recesses.
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) cuts.push({ ring: circle(ux + sx * fx, ucy + sy * fy, footD / 2 + 0.5, 32), from: H - 1.5, to: H + 1 });
  // Pass-downs: a slot from the trough down into the trench under each cell.
  for (const cx of cxs) cuts.push({ ring: rr(cx - 5, troughFront + W + 2, cx + 5, Y2 - W - 2, 1), from: DECK.trenchD - 0.1, to: H + 1 });
  const bowls = nx >= 2 ? [-55, -31, 35].map((bx) => [cxs[1] + bx, -52]) : [];
  for (const [bx, by] of bowls) cuts.push(bowlCut(bx, by, 20, 4.5));
  const body = tileBody({ nx, ny: 1, edges, clr, trench: 'both', cuts, ribs: o.ribs !== false });
  const mesh = body.mesh, notes = [];
  // The station's cradle: a lip at the front and a rail each side.
  mesh.append(extrudePolygon(rr(ux - unitW / 2, lipY, ux + unitW / 2, lipY + W, 1), [], H, H + DECK.lipH)); // clear of the front sockets
  for (const sx of [-1, 1]) { const a = ux + sx * (unitW / 2 + 0.5), b = ux + sx * (unitW / 2 + 0.5 + W); mesh.append(extrudePolygon(rr(Math.min(a, b), front, Math.max(a, b), front + unitD, 1), [], H, H + 4)); }
  if (front + unitD > troughFront - 1) notes.push('The station is deeper than the space in front of the trough: check its depth.');
  // The trough: two walls the length of the tile, with a groove inside each for the lid's snap.
  const gz = H + DECK.troughH - 3;
  for (const [y0, y1, inner] of [[troughFront, troughFront + W, 1], [Y2 - W, Y2, -1]]) {
    for (const [za, zb, d] of [[H, gz - 0.6, 0], [gz - 0.6, gz - 0.3, 0.3], [gz - 0.3, gz + 0.3, 0.6], [gz + 0.3, gz + 0.6, 0.3], [gz + 0.6, H + DECK.troughH, 0]]) {
      const a = inner > 0 ? y0 : y0 + d, b = inner > 0 ? y1 - d : y1;
      mesh.append(extrudePolygon(rr(-X2, a, X2, b), [], za, zb));
    }
  }
  if (nx >= 2) {
    const ox = cxs[1], ironD = num(o.ironD, 8, 24, 14), sd = num(o.spindleD, 8, 30, 16);
    mesh.append(ironYokes(ox + 45, -25, H, ironD));
    mesh.append(extrudePolygon(circle(ox - 47, 5, DECK.cupD / 2, 64), [circle(ox - 47, 5, DECK.cupD / 2 - W, 64)], H, H + DECK.cupH));
    mesh.append(extrudePolygon(circle(ox + 5, 30, sd / 2, 40), [], H, H + 34));
    mesh.append(extrudePolygon(circle(ox + 5, 30, sd / 2 - 0.5, 40), [], H + 34, H + 34.5));
    mesh.append(extrudePolygon(circle(ox + 5, 30, sd / 2 - 1, 40), [], H + 34.5, H + 35));
    notes.push(`The tool cell: two yokes hold the iron at 30° with its tip over open air (a ${ironD} mm handle), a cup for brass wool, a spindle for a ${sd} mm spool bore and three parts bowls.`);
    notes.push('Keep the iron’s metal sleeve or holder in the yokes: PETG and PLA+ soften near a hot tip.');
  }
  notes.push(`The cradle takes a station ${unitW} × ${unitD} mm with feet ${2 * fx} × ${2 * fy} mm apart: measure yours and set them.`);
  notes.push('Cables drop from the trough into the trench through the slots; the lid snaps on top.');
  return { mesh, notes, length: S * nx };
}

// ---------------------------------------------------------------------------
// Receiver, hood, lever, shoe, mount plate

// The receiver's base plate, as it sits in a hardpoint's pocket.
export function receiverBaseOutline(grow = 0, size = 'M') {
  const { half, xr } = receiverDims(size);
  return rr(-half - grow, -half - grow, xr + grow, half + grow, 3 + grow);
}

// The pivot post's section: a disc with the two detent notches, split by the snap slot.
function drawPost(d, px, py, r, split, hw) {
  d.disc(px, py, r);
  const { shut, open } = camAngles();
  for (const a of [shut + DECK.detent, open + DECK.detent]) {
    const R = DECK.postR + DECK.barb, depth = DECK.notchD + DECK.barb, h = depth, t = rad(a);
    const ux = Math.cos(t), uy = Math.sin(t), tx = -uy, ty = ux, oo = R + 0.3;
    d.off([[px + ux * (R - depth), py + uy * (R - depth)], [px + ux * oo + tx * (h + 0.3), py + uy * oo + ty * (h + 0.3)], [px + ux * oo - tx * (h + 0.3), py + uy * oo - ty * (h + 0.3)]]);
  }
  if (split) {
    const a = rad(DECK.slotDeg), L = DECK.postR + DECK.barb + 1, dx = Math.cos(a) * L, dy = Math.sin(a) * L, nx = -Math.sin(a) * DECK.slotW / 2, ny = Math.cos(a) * DECK.slotW / 2;
    d.off([[px - dx + nx, py - dy + ny], [px + dx + nx, py + dy + ny], [px + dx - nx, py + dy - ny], [px - dx - nx, py - dy - ny]]);
  }
  if (hw) d.disc(px, py, DECK.insertD / 2, 0);
}

export function deckReceiver(o = {}) {
  const size = sizeOf(o), printed = o.hardware !== 'inserts', lever = o.withLever !== false;
  return cached(`recv-${size}-${printed}-${lever}`, () => {
    const { P, half, xr, sp, o: ow } = receiverDims(size), { base, frameH, railX: [r0, r1], railDepth: rd, pivotTop, postTop, barb } = DECK;
    const px = half, py = DECK.pivotY, zft = base + frameH, zb = pivotTop + DECK.lever + 0.1, c = DECK.shoeClear;
    const he = DECK.neck / 2 + c, ht = DECK.tip / 2 + c;
    const cuts = [0, DECK.foot, 0.6, base, 6, pivotTop, pivotTop + 1.5, zb, DECK.clipGroove - 0.6, DECK.clipGroove - 0.3, DECK.clipGroove + 0.3, DECK.clipGroove + 0.6, zft - DECK.pocketChamfer, zft - DECK.pocketChamfer / 2, zft];
    if (lever && printed) cuts.push(zb + 0.3, zb + barb, postTop - 0.3, postTop - barb, postTop);
    if (lever && !printed) cuts.push(zb + 0.1, zb + 0.1 - DECK.insertDepth);
    if (!printed) cuts.push(zft - DECK.insertDepth);
    return sections([-half - 1, -half - 1, xr + 1, half + 1], cuts, (z, d) => {
      if (z < base) {
        const f = z < DECK.foot ? DECK.foot : 0;
        d.on(rr(-half + f, -half + f, xr - f, half - f, 3 - f));
        // Link sockets: a dovetail into the base on the front and back edges.
        for (const s of [-1, 1]) { const e = s * half, k = DECK.linkDepth + c + f, x = DECK.linkX; d.off([[x - he - f, e + s], [x - he - f, e], [x - ht - f, e - s * k], [x + ht + f, e - s * k], [x + he + f, e], [x + he + f, e + s]]); }
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) d.disc(sx * sp, sy * sp, DECK.screwD / 2, 0);
        if (z < 0.6) letters(d, 'MINT MOTIVE', 0, 0, Math.min(6, P / 12), true); // reads right from below
        return;
      }
      if (z < zft) {
        // The frame: a ring round the pocket, the rails, and the lever's window above z 6.
        d.on(rr(-ow, -ow, ow, ow, 7));
        const g = z > zft - DECK.pocketChamfer ? (z > zft - DECK.pocketChamfer / 2 ? 0.75 : 0.25) : 0;
        d.off(rr(-P / 2 - g, -P / 2 - g, P / 2 + g, P / 2 + g, 2 + g));
        for (const sy of [-1, 1]) { const a = sy * P / 2, b = sy * (P / 2 - rd); d.on(rr(r0, Math.min(a, b), r1, Math.max(a, b))); }
        if (z > 6) d.off(rr(P / 2 - 0.5, -DECK.window / 2, ow + 0.5, DECK.window / 2));
        // Grooves the hood's snap tabs click into.
        if (printed && Math.abs(z - DECK.clipGroove) < 0.6) {
          const dd = Math.abs(z - DECK.clipGroove) < 0.3 ? 0.6 : 0.3, hw = DECK.clipW / 2 + 0.5;
          for (const cx of DECK.clipX) { d.off(rr(cx - hw, ow - dd, cx + hw, ow + 0.5)); d.off(rr(cx - hw, -ow - 0.5, cx + hw, -ow + dd)); }
          d.off(rr(-ow - 0.5, -hw, -ow + dd, hw));
        }
        if (!printed) for (const sy of [-1, 1]) { d.disc(-(half - 5), sy * 25, 4); if (z > zft - DECK.insertDepth) d.disc(-(half - 5), sy * 25, DECK.insertD / 2, 0); }
      }
      if (lever) {
        if (z < pivotTop) d.disc(px, py, DECK.hubR); // the cam pad
        else if (z < zb) drawPost(d, px, py, DECK.postR, printed && z > pivotTop + 1.5, !printed && z > zb + 0.1 - DECK.insertDepth);
        else if (printed && z < postTop) drawPost(d, px, py, DECK.postR + Math.max(0.02, Math.min(z - zb, barb, postTop - z)), true, false);
        else if (!printed && z < zb + 0.1) drawPost(d, px, py, DECK.postR, false, true);
      }
    }, 0.12);
  });
}

// The lever, lying flat, pivot at the origin and the lobe along +x. The
// printed spring: a beam inside the hub's bore, freed by a slot behind it,
// carries a bump that clicks into the post's SHUT and OPEN notches.
export function deckLever(o = {}) {
  const flex = num(o.flexT, 0.6, 1.4, DECK.flexT);
  const mesh = cached(`lever-${flex}`, () => {
    const { hubR, lobeOffset: L, lobeR: R, handle, handleW, lever: T, flexGap, flexArc, bumpH, detent } = DECK, bore = DECK.postR + DECK.shoeClear;
    const sector = (r0, r1, a0, a1, n = 48) => { const pts = []; for (let k = 0; k <= n; k++) { const a = rad(a0 + ((a1 - a0) * k) / n); pts.push([r1 * Math.cos(a), r1 * Math.sin(a)]); } for (let k = n; k >= 0; k--) { const a = rad(a0 + ((a1 - a0) * k) / n); pts.push([r0 * Math.cos(a), r0 * Math.sin(a)]); } return pts; };
    const free = detent - 2.5;
    return sections([-handle - 1, -hubR - 1, L + R + 1, hubR + 1], [0, DECK.foot, T - 0.4, T], (z, d) => {
      const g = z < DECK.foot ? DECK.foot : 0;
      d.disc(0, 0, hubR - g);
      d.on(rr(0, -R + g, L, R - g));
      d.disc(L, 0, R - g);
      d.on(rr(-handle + g, -handleW / 2 + g, 0, handleW / 2 - g, 3));
      d.disc(0, 0, bore, 0);
      d.off(sector(bore + flex, bore + flex + flexGap, free - 7, free + flexArc));
      d.off(sector(bore - 0.1, bore + flex + 0.05, free - 7, free));
      d.disc(bore * Math.cos(rad(detent)), bore * Math.sin(rad(detent)), bumpH);
      // A light diamond knurl on the handle's top, where the thumb goes.
      if (z > T - 0.4) for (let k = 0; k < 12; k++) { const a = -42 + k * 1.5; for (const sg of [1, -1]) d.off([[a, -sg * 6], [a + 0.5, -sg * 6], [a + 12.5, sg * 6], [a + 12, sg * 6]]); }
    }, 0.04);
  });
  return { mesh, shut: camAngles().shut };
}

// The lever where it sits on a receiver: turned to SHUT, on the pad.
export function leverPlaced(o = {}) {
  const { half } = receiverDims(sizeOf(o));
  return turned(deckLever(o).mesh, camAngles().shut).translate(half, DECK.pivotY, DECK.pivotTop);
}

// The hood, in receiver coordinates (z 3 to 18.5): a plate with the shoe's
// opening (45° lead-in), a skirt with the lever's slots, cable channels and
// the link bar's gap, and five snap tabs that click into the frame's grooves.
export function deckHood(o = {}) {
  const size = sizeOf(o), printed = o.hardware !== 'inserts';
  return cached(`hood-${size}-${printed}`, () => {
    const { P, half, xr, o: ow } = receiverDims(size), { base, frameH, hoodT, skirt: W, leadIn, pivotTop, linkX } = DECK;
    const z0 = base + frameH, zt = z0 + hoodT, px = half, py = DECK.pivotY, gap = 0.1, g0 = DECK.clipGroove;
    const cuts = [base, base + 3.2, pivotTop + 0.2, DECK.clipZ0, 11, 12.5, g0 - 0.5, g0 - 0.2, g0 + 0.2, g0 + 0.5, z0, zt - leadIn, zt - leadIn / 2, zt - 0.5, zt - DECK.foot, zt];
    return sections([-half - 1, -half - 1, xr + 1, half + 1], cuts, (z, d) => {
      if (z > z0) {
        const f = z > zt - DECK.foot ? DECK.foot : 0;
        d.on(rr(-half + f, -half + f, xr - f, half - f, 3 - f));
        const l = z > zt - leadIn ? (z > zt - leadIn / 2 ? 1.5 : 0.5) : 0;
        d.off(rr(-P / 2 - l, -P / 2 - l, P / 2 + l, P / 2 + l, 2 + l));
        if (!printed) for (const sy of [-1, 1]) d.disc(-(half - 5), sy * 25, z > zt - 1 ? 3.5 : DECK.screwD / 2, 0);
        // The name along the front band, 0.5 mm deep (on the bed as it prints).
        if (z > zt - 0.5) letters(d, 'TECTONIC', (xr - half) / 2 - 4, -(P / 2 + half) / 2 - 0.5, Math.min(5, (half - P / 2) * 0.42));
        return;
      }
      d.on(rr(-half, -half, xr, half, 3));
      d.off(rr(-half + W, -half + W, xr - W, half - W, Math.max(0.5, 3 - W)));
      // The lever's sweep and the pad: open at the skirt's edge, so nothing bridges.
      if (z < 12.5) { d.off(rr(xr - W - 1, -half - 1, xr + 1, py)); d.off(rr(px - 16, -half - 1, xr + 1, -half + W + 1)); }
      if (z < pivotTop + 0.2) d.off(rr(xr - W - 1, py - 11, xr + 1, py + 11));
      for (const sy of [-1, 1]) {
        const a = sy * half, b = sy * (half - W - 1), y0 = Math.min(a, b) - 1, y1 = Math.max(a, b) + 1;
        if (z < 11) d.off(rr(10, y0, 22, y1)); // cable channels
        if (z < base + 3.2) d.off(rr(linkX - 10, y0, linkX + 10, y1)); // the link bar
      }
      if (printed && z > DECK.clipZ0) {
        const hw = DECK.clipW / 2, t = DECK.clipT, bump = Math.abs(z - g0) < 0.5 ? (Math.abs(z - g0) < 0.2 ? 0.5 : 0.2) : 0;
        for (const cx of DECK.clipX) {
          d.on(rr(cx - hw, ow + gap - bump, cx + hw, ow + gap + t));
          d.on(rr(cx - hw, -ow - gap - t, cx + hw, -ow - gap + bump));
        }
        d.on(rr(-ow - gap - t, -hw, -ow - gap + bump, hw));
      }
    }, 0.12);
  });
}

// The shoe's outline at a height: the pocket less the fit, the rail slots, and
// in its middle band the notch the cam swings into.
export function deckShoeBody(o = {}) {
  const size = sizeOf(o);
  return cached(`shoe-${size}`, () => {
    const { P } = receiverDims(size), c = DECK.shoeClear, w = P - 2 * c, { shoeH, shoeNeck, notchW, notchZ: [n0, n1], railX: [r0, r1], railDepth: rd } = DECK;
    const top = shoeH + shoeNeck, nx = P / 2 - c - DECK.notchDepth, s = w / 2 - 6, relief = (notchW - 10) / 2;
    const cuts = [0, 0.25, 0.5, 0.75, 1, n0, n1, n1 + relief / 2, n1 + relief, top - DECK.insertDepth, top - 0.6, top - 0.3, top];
    return sections([-w / 2, -w / 2, w / 2, w / 2], cuts, (z, d) => {
      const g = z < 1 ? 1 - z : z > top - 0.6 ? (z > top - 0.3 ? 0.45 : 0.15) : 0;
      d.on(rr(-w / 2 + g, -w / 2 + g, w / 2 - g, w / 2 - g, Math.max(0.2, 2 - c - g)));
      const f = z < DECK.foot ? DECK.foot : 0;
      for (const sy of [-1, 1]) { const a = sy * (w / 2 + 1), b = sy * (P / 2 - rd - c); d.off(rr(r0 - c - f, Math.min(a, b), r1 + c + f, Math.max(a, b))); }
      if (z > n0 && z < n1) d.off(rr(nx, -notchW / 2, w / 2 + 1, notchW / 2));
      if (z > n1 && z < n1 + relief) { const k = z - n1; d.off(rr(nx, -notchW / 2 + k, w / 2 + 1, notchW / 2 - k)); }
      if (z > top - DECK.insertDepth) for (const sx of [-1, 1]) for (const sy of [-1, 1]) d.disc(sx * s, sy * s, DECK.insertD / 2, 0);
    }, 0.1);
  });
}

// The mount plate: screwed to the shoe's top with four M3s (heads counterbored),
// carrying whatever the device needs.
export function deckPlate(o = {}) {
  const size = sizeOf(o), top = SHOE_TOPS[o.shoeTop] ? o.shoeTop : 'cradle';
  const { P } = receiverDims(size), w = P - 2 * DECK.shoeClear, s = w / 2 - 6, notes = [];
  // Sized to what it carries: a cradle or a tray gets a plate just round it;
  // bolts, iron yokes, a grid or a blank plate start from 88 × 140.
  let W, D, T = DECK.plateT;
  if (top === 'cradle') { const Dd = num(o.cradleD, 30, 130, 76); W = D = Math.max(w, Dd + 2 * DECK.skirt + 8); }
  else if (top === 'tray') { W = Math.max(w, num(o.trayW, 30, 130, 80) + 14.6); D = Math.max(w, num(o.trayD, 30, 180, 100) + 14.6); }
  else if (top === 'bolts') { W = w; D = w; }
  else { W = Math.max(DECK.plateW, w); D = Math.max(DECK.plateD, w); }
  const holes = [];
  if (top === 'bolts') {
    const b = BOLTS[o.boltSize] || BOLTS.m4, bw = num(o.boltW, 10, 160, 75) / 2, bd = num(o.boltD, 10, 200, 75) / 2;
    W = Math.max(W, 2 * bw + b.head + 8); D = Math.max(D, 2 * bd + b.head + 8); T = Math.max(T, b.headH + 2.4);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      if (Math.hypot(sx * bw - sx * s, sy * bd - sy * s) < b.head / 2 + 3.5) { notes.push('A bolt lands on one of the plate’s own screws: move the pattern a little.'); continue; }
      holes.push({ x: sx * bw, y: sy * bd, r: b.d / 2, bore: b.head / 2 + 0.3, boreTo: b.headH + 0.2 });
    }
    notes.push(`${(o.boltSize || 'm4').toUpperCase()} bolts go up through the plate into your device; their heads sit in counterbores underneath.`);
  }
  if (top === 'grid') { for (let x = -40; x <= 40; x += 20) for (let y = -60; y <= 60; y += 20) if (Math.abs(x) < W / 2 - 5 && Math.abs(y) < D / 2 - 5 && !(Math.abs(Math.abs(x) - s) < 6 && Math.abs(Math.abs(y) - s) < 6)) holes.push({ x, y, r: DECK.screwD / 2 }); notes.push('M3 holes on a 20 mm grid: bolt anything you make to it.'); }
  const mesh = sections([-W / 2, -D / 2, W / 2, D / 2], [0, DECK.foot, 0.8, ...holes.filter((h) => h.bore).map((h) => h.boreTo), T - 0.6, T - 0.3, T], (z, d) => {
    const g = z < DECK.foot ? DECK.foot : z > T - 0.6 ? (z > T - 0.3 ? 0.45 : 0.15) : 0;
    d.on(rr(-W / 2 + g, -D / 2 + g, W / 2 - g, D / 2 - g, (top === 'cradle' ? Math.min(W, D) / 2 - 4 : 6) - g));
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) d.disc(sx * s, sy * s, z > 0.8 ? 3 : DECK.screwD / 2, 0);
    for (const h of holes) d.disc(h.x, h.y, h.bore && z < h.boreTo ? h.bore : h.r, 0);
  }, 0.15);
  if (top === 'cradle') {
    const Dd = num(o.cradleD, 30, 130, 76), h = num(o.cradleH, 3, 30, 8), rIn = Dd / 2 + DECK.shoeClear, rOut = rIn + DECK.skirt;
    // A ring, open at the back for the cable and notched wherever it would
    // cover one of the plate's own screws (so they can still go in).
    const notched = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) if (Math.abs(Math.hypot(s, s) - (rIn + rOut) / 2) < DECK.skirt / 2 + 3.6) notched.push([sx * s, sy * s]);
    mesh.append(sections([-rOut, -rOut, rOut, rOut], [T, T + h], (z, d) => {
      d.disc(0, 0, rOut); d.disc(0, 0, rIn, 0);
      d.off(rr(-7, rIn - 1, 7, rOut + 1));
      for (const [x, y] of notched) d.disc(x, y, 3.6, 0);
    }, 0.1));
    notes.push(`The cradle takes a base ${Dd} mm across (measure your puck), with a gap at the back for the cable${notched.length ? ' and notches over the plate’s screws' : ''}.`);
  }
  if (top === 'tray') {
    const tw = num(o.trayW, 30, 130, 80) / 2 + 0.3, td = num(o.trayD, 30, 180, 100) / 2 + 0.3, h = num(o.trayH, 3, 40, 10), ow = tw + 3, od = td + 3, sl = 8;
    mesh.append(extrudePolygon([[sl, od], [ow, od], [ow, -od], [-ow, -od], [-ow, od], [-sl, od], [-sl, td], [-tw, td], [-tw, -td], [tw, -td], [tw, td], [sl, td]], [], T, T + h));
    notes.push(`The tray takes a base ${Math.round(2 * tw - 0.6)} × ${Math.round(2 * td - 0.6)} mm, with a cable slot at the back.`);
  }
  if (top === 'solder') { const ironD = num(o.ironD, 8, 24, 14); mesh.append(ironYokes(0, -D / 2 + 20, T, ironD)); notes.push(`Two yokes hold the iron at 30° (a ${ironD} mm handle). Keep its metal sleeve in the yokes.`); }
  return { mesh, notes, size: [W, D, T] };
}

// The shoe and its plate, for a device. (deckShoe kept its name: it's both.)
export function deckShoe(o = {}) {
  const body = deckShoeBody(o), plate = deckPlate(o), top = DECK.shoeH + DECK.shoeNeck;
  const mesh = copy(body);
  mesh.append(copy(plate.mesh).translate(0, 0, top));
  return { mesh, body, plate: plate.mesh, notes: plate.notes, plateSize: plate.size };
}

// The trough's snap-on lid: prints plate down, lips up.
export function troughLid(length = 300) {
  const L = length - 1, hw = DECK.troughW / 2, inner = hw - DECK.skirt - DECK.shoeClear, lipT = 1.8, lipH = 6, bz = 2.4 + 3;
  return sections([-L / 2, -hw, L / 2, hw], [0, DECK.foot, 2.4, bz - 0.5, bz - 0.2, bz + 0.2, bz + 0.5, 2.4 + lipH], (z, d) => {
    if (z < 2.4) { const f = z < DECK.foot ? DECK.foot : 0; d.on(rr(-L / 2 + f, -hw + f, L / 2 - f, hw - f, 1)); return; }
    const b = Math.abs(z - bz) < 0.5 ? (Math.abs(z - bz) < 0.2 ? 0.5 : 0.2) : 0;
    for (const s of [-1, 1]) { const a = s * (inner + b), c = s * (inner - lipT); d.on(rr(-L / 2 + 5, Math.min(a, c), L / 2 - 5, Math.max(a, c))); }
  }, 0.1);
}

// Joins two receivers on neighbouring tiles; prints upside down.
export function linkBar(size = 'M') {
  const { half } = receiverDims(size), g2 = (DECK.grid - 2 * half) / 2, { neck, tip } = DECK, k = DECK.linkDepth, zt = DECK.base + 3;
  return sections([-tip, -g2 - k - 1, tip, g2 + k + 1], [0, DECK.base, zt], (z, d) => {
    if (z > DECK.base) d.on(rr(-neck / 2, -g2 - 1, neck / 2, g2 + 1, 1));
    for (const s of [-1, 1]) d.on([[-neck / 2, s * (g2 - 1)], [-neck / 2, s * g2], [-tip / 2, s * (g2 + k)], [tip / 2, s * (g2 + k)], [neck / 2, s * g2], [neck / 2, s * (g2 - 1)]]);
  }, 0.08);
}

// The "inserts" variant's printed washer under the pivot screw.
export function pivotWasher() {
  return sections([-8, -8, 8, 8], [0, DECK.foot, 1.2], (z, d) => { d.disc(0, 0, z < DECK.foot ? 7.6 : 8); d.disc(0, 0, DECK.screwD / 2, 0); }, 0.05);
}

// The whole receiver stack in receiver coordinates (z 0 = the base's underside),
// with lift spreading it out for an exploded view.
export function receiverStack(o = {}, lift = 0) {
  const out = [{ mesh: deckReceiver(o), role: 'body' }];
  if (o.withLever !== false) out.push({ mesh: leverPlaced(o).translate(0, 0, lift * 22), role: 'accent' });
  out.push({ mesh: deckHood(o).translate(0, 0, lift * 44), role: 'body' });
  const s = deckShoe(o);
  out.push({ mesh: copy(s.body).translate(0, 0, DECK.base + lift * 66), role: 'shoe' });
  out.push({ mesh: copy(s.plate).translate(0, 0, DECK.base + DECK.shoeH + DECK.shoeNeck + lift * 88), role: 'accent' });
  return out;
}

// ---------------------------------------------------------------------------
// The studio's entry point: parts to print, and the assembled preview.
export function generateDeck(options = {}) {
  const o = { ...DECK_DEFAULTS, ...options };
  const S = DECK.grid, size = sizeOf(o), printed = o.hardware !== 'inserts';
  const parts = [], assembly = [], notes = [], stats = {};
  const seat = DECK.height - DECK.base;
  const hardwareNotes = () => {
    const { sp } = receiverDims(size);
    notes.push(`Hardware for each hardpoint: 4 M3 heat-set inserts in the tile (±${sp} mm), 4 M3 × 8 screws for the receiver, 4 inserts in the shoe’s neck and 4 M3 × 6 screws for the plate.`);
    if (printed) notes.push('The lever snaps onto its post and the hood snaps onto the frame: no hardware in the mechanism. Print the lever, receiver and hood in PETG; PLA+ creeps and loses the click.');
    else notes.push('Inserts variant: 1 insert in the pivot post and 2 in the hood bosses, an M3 × 6 screw through the printed washer as the pivot, and 2 M3 × 6 for the hood.');
  };
  if (o.item === 'deck') {
    const cols = Math.round(num(o.deckCols, 1, 8, 4)), rows = Math.round(num(o.deckRows, 1, 6, 3));
    const cells = parseLayout(o.deckLayout, cols, rows);
    const kinds = new Map();
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const type = cells[`${String.fromCharCode(65 + i)}${j + 1}`] || 'flat';
      const e = cellEdges(i, j, cols, rows);
      const key = `${type}-${['left', 'right', 'front', 'back'].filter((k) => e[k]).join('') || 'alone'}`;
      if (!kinds.has(key)) kinds.set(key, { type, e, count: 0, cells: [], mesh: deckTile({ ...o, tileType: type, tileCols: 1, tileRows: 1 }, e).mesh });
      const k = kinds.get(key);
      k.count++; k.cells.push(`${String.fromCharCode(65 + i)}${j + 1}`);
      assembly.push({ mesh: copy(k.mesh).translate(i * S, j * S, 0) });
      if (type === 'hardpoint') for (const p of receiverStack(o)) assembly.push({ mesh: p.mesh.translate(i * S, j * S, seat), accent: p.role === 'accent' });
    }
    for (const [key, k] of kinds) parts.push({ mesh: k.mesh, name: `tectonic-${k.type}-tile-${key.split('-')[1]}${k.count > 1 ? `-x${k.count}` : ''}`, detail: `Cells ${k.cells.join(', ')}`, copies: k.count });
    stats.tiles = cols * rows; stats.kinds = kinds.size; stats.size = [cols * S, rows * S, DECK.height];
    stats.hardpoints = Object.values(cells).filter((t) => t === 'hardpoint').length;
    notes.push('Print each file as many times as its name says (×n): tiles with the same joins are the same part. Lay the front-left tile (A1) first, then lower each next tile straight down so its tails drop into the sockets beside it.');
    if (stats.hardpoints) { notes.push(`Make a receiver, hood, lever, shoe and plate for each hardpoint (${stats.hardpoints}), from “Quick-release receiver” and “Adapter shoe”.`); hardwareNotes(); }
  } else if (o.item === 'deckTile') {
    const edgeSet = o.edges === 'none' ? {} : { left: true, right: true, front: true, back: true };
    const t = deckTile(o, edgeSet);
    parts.push({ mesh: t.mesh, name: `tectonic-${o.tileType}-tile-${Math.round(num(o.tileCols, 1, 2, 1))}x${Math.round(num(o.tileRows, 1, 2, 1))}${o.tileType === 'hardpoint' ? `-${size}` : ''}` });
    notes.push(...t.notes);
    if (o.tileType === 'hardpoint') for (const p of receiverStack(o)) assembly.push({ mesh: p.mesh.translate(0, 0, seat), accent: p.role === 'accent', example: true });
    if (assembly.length) assembly.unshift({ mesh: copy(t.mesh) });
    stats.size = t.mesh.bounds().size;
  } else if (o.item === 'electronics') {
    const edgeSet = o.edges === 'none' ? {} : { left: true, right: true, front: true, back: true };
    const t = electronicsTile(o, edgeSet);
    parts.push({ mesh: t.mesh, name: `tectonic-electronics-tile-${t.length}x150` });
    parts.push({ mesh: troughLid(t.length), name: `tectonic-trough-lid-${t.length}`, accent: true, detail: 'Accent filament; prints plate down' });
    notes.push(...t.notes);
    assembly.push({ mesh: copy(t.mesh) }, { mesh: flipped(troughLid(t.length)).translate(0, DECK.grid / 2 - DECK.troughW / 2, DECK.height + DECK.troughH + 2.4), accent: true });
    stats.size = t.mesh.bounds().size;
  } else if (o.item === 'receiver') {
    parts.push({ mesh: deckReceiver(o), name: `tectonic-receiver-${size}${printed ? '' : '-inserts'}${o.withLever === false ? '-dock' : ''}` });
    parts.push({ mesh: flipped(deckHood(o)), name: `tectonic-hood-${size}${printed ? '' : '-inserts'}`, detail: 'Prints upside down' });
    if (o.withLever !== false) {
      parts.push({ mesh: deckLever(o).mesh, name: 'tectonic-cam-lever', accent: true, detail: 'Accent filament, PETG' });
      if (!printed) parts.push({ mesh: pivotWasher(), name: 'tectonic-pivot-washer' });
      notes.push(`Swing the lever towards the frame to lock (${DECK.shut}°), away to release: the printed spring clicks it into each place. Engagement when shut: ${(camSweepCheck(size) || 0).toFixed(1)} mm.`);
      notes.push(`The click: the spring beam is ${num(o.flexT, 0.6, 1.4, DECK.flexT)} mm thick. 0.8 is soft, 1.2 firm: print a few and keep the one you like.`);
    } else notes.push('A parking dock: no lever. Screw it to a tile and park shoes you aren’t using.');
    hardwareNotes();
    for (const p of receiverStack(o)) assembly.push({ mesh: p.mesh, accent: p.role === 'accent', example: p.role === 'shoe' });
    stats.size = parts[0].mesh.bounds().size;
  } else if (o.item === 'shoe') {
    const s = deckShoe(o);
    parts.push({ mesh: copy(s.body), name: `tectonic-shoe-${size}` });
    parts.push({ mesh: copy(s.plate), name: `tectonic-plate-${o.shoeTop}`, accent: true, detail: 'Accent filament' });
    notes.push(...s.notes, 'The shoe drops into a receiver with its notch towards the lever: the rails only let it in one way round. Melt 4 M3 inserts into its neck and screw the plate on.');
    for (const p of receiverStack(o).slice(0, -2)) assembly.push({ mesh: p.mesh, example: true }); // the receiver, lever and hood round it
    assembly.push({ mesh: copy(s.body).translate(0, 0, DECK.base) }, { mesh: copy(s.plate).translate(0, 0, DECK.base + DECK.shoeH + DECK.shoeNeck), accent: true });
    stats.size = s.mesh.bounds().size;
  } else if (o.item === 'extras') {
    parts.push({ mesh: troughLid(300), name: 'tectonic-trough-lid-300', accent: true, detail: 'Prints plate down' });
    parts.push({ mesh: troughLid(150), name: 'tectonic-trough-lid-150', accent: true, detail: 'Prints plate down' });
    parts.push({ mesh: flipped(linkBar(size)), name: `tectonic-link-bar-${size}`, detail: 'Joins two receivers on neighbouring tiles; prints upside down' });
    parts.push({ mesh: pivotWasher(), name: 'tectonic-pivot-washer', detail: 'Inserts variant only' });
    notes.push('The link bar drops into the sockets in two receivers’ bases, under the hoods, so a pair of receivers on neighbouring tiles can’t creep apart.');
  }
  if (!assembly.length) for (const p of parts) assembly.push({ mesh: copy(p.mesh), accent: p.accent });
  // Lay the parts out side by side, flat on the plate.
  let y = 0;
  for (const p of parts) { const b = p.mesh.bounds(); p.mesh.translate(-(b.min[0] + b.max[0]) / 2, y - b.min[1], -b.min[2]); y += b.size[1] + 10; }
  // Centre the preview.
  const all = new Mesh();
  for (const p of assembly) all.append(p.mesh);
  const ab = all.bounds();
  for (const p of assembly) p.mesh.translate(-(ab.min[0] + ab.max[0]) / 2, -(ab.min[1] + ab.max[1]) / 2, -ab.min[2]);
  return { parts, assembly, notes, stats };
}
