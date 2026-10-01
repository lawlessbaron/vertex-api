// The Tectonic Deck: a desk surface of printed tiles, and a quick-release
// receiver that any tool locks into.
//
// Tiles join edge to edge with vertical dovetails: the tails on a tile's right
// and back edges drop straight down into the sockets on its neighbours' left and
// front edges, so the deck locks flat with no clips. A cable trench runs under
// the middle of every tile, both ways, and lines up from tile to tile. Tile
// tops: flat, crater (smooth bowls for tools), or hardpoint (a flush pocket and
// four heat-set inserts for a receiver).
//
// The receiver is a printed frame with two alignment rails and a cam lever.
// An adapter shoe, made for one device (a puck like a SpaceMouse, a soldering
// station, a shifter, or a bolt pattern), drops into it; the lever's cam swings
// through a window in the frame into a notch in the shoe and holds it down. A
// spring and a 5 mm ball under the lever click it into its open and shut
// places. Hardware: M3 screws into brass heat-set inserts, nothing else.
//
// Every part prints flat on its base with no supports.
import { Mesh } from './mesh.js';
import { circlePolygon, extrudePolygon, orient, pointInPolygon, triangulate } from './polygon.js';
import { loftSolid, roundedRect } from './primitives.js';

export const DECK = {
  height: 15, // tile height: a 15 mm raised deck
  foot: 0.4, // the bottom 0.4 mm steps in 0.4 mm: no elephant's foot, and the tails find their sockets
  edge: 0.6, // the top 0.6 mm steps in 0.6 mm: a crisp seam line between tiles
  skin: 5, // solid top over the cable trench
  trenchW: 22, trenchD: 10, // cable trench under each tile (22 × 10 mm)
  neck: 12, tip: 18, tail: 8, // dovetail: width at the edge, width at the tip, depth
  passD: 26, // cable pass-up hole
  insertD: 4.0, // M3 heat-set insert hole
  screwD: 3.4, // M3 clearance
  // Receiver (z = 0 on the base plate's underside)
  base: 3, // base plate thickness
  baseX: [-50, 60], baseY: 50, // base plate extent (the lever side is +x)
  screwAt: 44, // the four M3 screws, ±44 mm
  pocket: 35.2, // half the pocket (70.4 mm square)
  wall: 5, // frame wall
  frameTop: 13, // top of the frame walls
  railX: [-16, -8], railDepth: 3, // alignment rails on the front and back walls (off-centre, so a shoe only goes in one way round)
  window: 13, // half the lever window in the right wall
  pivot: [50, -12], // the lever's pivot (an M3 screw into an insert)
  bossTop: 6.5, lever: 5, // the lever rides on the boss, 5 mm thick
  lobeTip: [34, -1], lobeR: 3.5, hubR: 9.5,
  ballAt: 6.5, ballPocket: 5.3, // spring and 5 mm ball, 6.5 mm from the pivot
  swing: 60, // degrees from shut to open
  handle: 45, handleW: 9,
  // Shoe (z = 0 on its underside, which sits on the base plate)
  shoeClear: 0.25,
  shoeH: 12, notchZ: [3.3, 8.7], notchX: 29.5, notchY: 12,
  plateT: 4, plateMaxX: 44, plateMaxY: 70,
};

export const DECK_ITEMS = {
  deck: 'Tectonic Deck (a whole desk of tiles)',
  deckTile: 'Deck tile',
  receiver: 'Quick-release receiver',
  shoe: 'Adapter shoe',
};
export const DECK_TILES = { flat: 'Flat', crater: 'Crater (bowls for tools)', hardpoint: 'Hardpoint (for a receiver)' };
export const SHOE_TOPS = {
  cradle: 'Round cradle (SpaceMouse and other pucks)',
  tray: 'Tray (soldering station, a box, a dock)',
  bolts: 'Bolt pattern (shifter, handbrake, stick, a plate)',
  grid: 'Insert grid (M3, 20 mm): build your own',
};

export const DECK_DEFAULTS = {
  tileSize: 150, // mm, square
  deckCols: 4, deckRows: 3,
  deckLayout: 'B2 hardpoint, C2 crater', // cells by letter (column) and number (row)
  tileType: 'flat',
  edges: 'all', // all | none | a single tile's joins: which edges get dovetails
  trench: 'both', // both | x | y | none
  passHole: true, // a hole up from the trench on flat tiles
  ribs: true, // hollow the underside into pockets between ribs
  bowlsX: 2, bowlsY: 1, bowlDepth: 10, bowlRim: 12,
  withLever: true, // receiver: the lever, or a plain parking dock without one
  shoeTop: 'cradle',
  cradleD: 78, cradleH: 8,
  trayW: 80, trayD: 100, trayH: 10,
  boltSize: 'm6', boltW: 60, boltD: 60,
};

const BOLTS = { m3: { d: 3.4, head: 6.2, headH: 3.2 }, m4: { d: 4.5, head: 7.8, headH: 4.2 }, m5: { d: 5.5, head: 9.4, headH: 5.2 }, m6: { d: 6.6, head: 11, headH: 6.2 } };
const num = (v, lo, hi, dflt) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };
const cw = (poly) => orient(poly, false);
const circle = (x, y, r, seg = 32) => circlePolygon(x, y, r, seg);

// ---------------------------------------------------------------------------
// Tiles

// Dovetail positions along an edge: two, a quarter of the way in from each
// end, so the trench can pass through the middle.
const tailsAt = (S) => [-S / 4, S / 4];

// A tile's outline, counter-clockwise. edges: { right, back, left, front }
// true = joins a neighbour there (tails on the right and back, sockets on the
// left and front), false = a plain edge (the deck's border).
export function tileOutline(S, edges, clearance = 0.2) {
  const h = S / 2, { neck, tip, tail } = DECK, c = clearance / 2;
  const n = neck / 2, t = tip / 2;
  const pts = [[-h, -h]];
  // Front (−y), left to right: sockets.
  if (edges.front) for (const x of tailsAt(S)) pts.push([x - n - c, -h], [x - t - c, -h + tail + c], [x + t + c, -h + tail + c], [x + n + c, -h]);
  pts.push([h, -h]);
  // Right (+x), front to back: tails.
  if (edges.right) for (const y of tailsAt(S)) pts.push([h, y - n], [h + tail, y - t], [h + tail, y + t], [h, y + n]);
  pts.push([h, h]);
  // Back (+y), right to left: tails.
  if (edges.back) for (const x of [...tailsAt(S)].reverse()) pts.push([x + n, h], [x + t, h + tail], [x - t, h + tail], [x - n, h]);
  pts.push([-h, h]);
  // Left (−x), back to front: sockets.
  if (edges.left) for (const y of [...tailsAt(S)].reverse()) pts.push([-h, y + n + c], [-h + tail + c, y + t + c], [-h + tail + c, y - t - c], [-h, y - n - c]);
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

const holesIn = (poly, holes) => holes.filter((h) => pointInPolygon(h.at, poly)).map((h) => h.ring);

// One tile. o: { tileSize, tileType, trench, passHole, bowls..., edges }.
export function deckTile(o, edges = { right: true, back: true, left: true, front: true }) {
  const S = num(o.tileSize, 90, 250, 150), H = DECK.height, clr = num(o.clearance, 0, 0.6, 0.2);
  const type = DECK_TILES[o.tileType] ? o.tileType : 'flat';
  const outline = tileOutline(S, edges, clr * 2);
  const mesh = new Mesh();
  const notes = [];
  if (type === 'crater') {
    appendCrater(mesh, outline, S, o);
    return { mesh, notes: [`${bowlCount(o)} bowl${bowlCount(o) > 1 ? 's' : ''}, ${Math.round(bowlDepthOf(o))} mm deep. No trench under a crater tile: route cables round it.`] };
  }
  const trench = type === 'hardpoint' && o.trench === 'both' ? 'both' : o.trench || 'both';
  const tw = DECK.trenchW / 2, lowTop = H - DECK.skin;
  // Holes that run through the whole tile.
  const through = [];
  if (type === 'hardpoint') {
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) through.push({ at: [sx * DECK.screwAt, sy * DECK.screwAt], ring: circle(sx * DECK.screwAt, sy * DECK.screwAt, DECK.insertD / 2, 24) });
    through.push({ at: DECK.pivot, ring: circle(...DECK.pivot, DECK.insertD / 2, 24) });
    if (S < 125) notes.push('A hardpoint needs a tile of 125 mm or more for the receiver.');
  }
  // The trench: the solid below the skin is split into pieces with gaps between.
  const xs = trench === 'both' || trench === 'y' ? [[-S, -tw], [tw, S]] : [[-S, S]];
  const ys = trench === 'both' || trench === 'x' ? [[-S, -tw], [tw, S]] : [[-S, S]];
  let pockets = 0;
  const foot = insetPolygon(outline, DECK.foot), top = insetPolygon(outline, DECK.edge);
  for (const [x0, x1] of xs) for (const [y0, y1] of ys) {
    const piece = clipBox(outline, x0, y0, x1, y1);
    if (piece.length < 3) continue;
    const cells = o.ribs === false ? [] : ribPockets(piece, through, S);
    pockets += cells.length;
    const holes = [...holesIn(piece, through), ...cells];
    const footPiece = clipBox(foot, x0, y0, x1, y1);
    if (footPiece.length >= 3) mesh.append(extrudePolygon(footPiece, holes.filter((h) => h.every((q) => pointInPolygon(q, footPiece))), 0, DECK.foot));
    mesh.append(extrudePolygon(piece, holes, DECK.foot, lowTop));
  }
  if (pockets) notes.push(`The underside is ${pockets} pockets between 4 mm ribs, open below: lighter and quicker to print, and the ribs carry the load.`);
  // The skin, with the receiver's pocket in its top 3 mm on a hardpoint.
  const pass = [];
  if (type === 'flat' && o.passHole !== false && trench !== 'none') {
    const at = trench === 'x' ? [S / 4, 0] : [0, S / 4];
    pass.push({ at, ring: circle(...at, DECK.passD / 2, 40) });
    notes.push('The round hole brings a cable up from the trench.');
  }
  if (type === 'hardpoint') {
    const pocket = receiverBaseOutline(0.3);
    mesh.append(extrudePolygon(outline, holesIn(outline, through), lowTop, H - DECK.base));
    mesh.append(extrudePolygon(outline, [pocket], H - DECK.base, H - DECK.edge));
    mesh.append(extrudePolygon(top, [pocket], H - DECK.edge, H));
    notes.push('Melt four M3 heat-set inserts into the pocket’s corners, and one by the lever side for the pivot, then screw the receiver in flush.');
  } else {
    mesh.append(extrudePolygon(outline, holesIn(outline, pass), lowTop, H - DECK.edge));
    mesh.append(extrudePolygon(top, holesIn(top, pass), H - DECK.edge, H));
  }
  return { mesh, notes };
}

// Pockets under a tile, between 4 mm ribs on a grid, kept 4 mm clear of the
// piece's edges (and so of the dovetails and the trench) and of any hole.
function ribPockets(piece, through, S) {
  const rib = 4, keep = 4, target = 25;
  const inside = (x, y) => pointInPolygon([x, y], piece);
  // The piece's own square part (the tails stick out past ±S/2), filled evenly.
  const xs = piece.map((q) => q[0]), ys = piece.map((q) => q[1]);
  // Outer edges keep clear of the sockets (which reach in 8 mm); edges on the trench, just the rib.
  const edge = DECK.tail + 0.5 + keep, h = S / 2;
  const lo = (v) => (v <= -h + 0.01 ? -h + edge : v + keep), hi = (v) => (v >= h - 0.01 ? h - edge : v - keep);
  const x0 = lo(Math.max(Math.min(...xs), -h)), x1 = hi(Math.min(Math.max(...xs), h));
  const y0 = lo(Math.max(Math.min(...ys), -h)), y1 = hi(Math.min(Math.max(...ys), h));
  const nx = Math.max(0, Math.round((x1 - x0 + rib) / target)), ny = Math.max(0, Math.round((y1 - y0 + rib) / target));
  if (!nx || !ny) return [];
  const cw_ = (x1 - x0 - (nx - 1) * rib) / nx, cd_ = (y1 - y0 - (ny - 1) * rib) / ny;
  if (cw_ < 8 || cd_ < 8) return [];
  const out = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const cx = x0 + cw_ / 2 + i * (cw_ + rib), cy = y0 + cd_ / 2 + j * (cd_ + rib);
    const hx = cw_ / 2, hy = cd_ / 2, gx = hx + keep, gy = hy + keep;
    if (![[cx - hx, cy - hy], [cx + hx, cy - hy], [cx + hx, cy + hy], [cx - hx, cy + hy]].every(([x, y]) => inside(x, y))) continue;
    // Clear of the sockets: no outline corner within the grown cell.
    if (piece.some(([x, y]) => Math.abs(x - cx) < gx && Math.abs(y - cy) < gy)) continue;
    if (through.some((t) => Math.abs(t.at[0] - cx) < hx + 5 && Math.abs(t.at[1] - cy) < hy + 5)) continue;
    out.push(roundedRect({ cx, cy, w: cw_, d: cd_, r: 2 }, 3));
  }
  return out;
}

const bowlCount = (o) => Math.round(num(o.bowlsX, 1, 4, 2)) * Math.round(num(o.bowlsY, 1, 4, 1));
const bowlDepthOf = (o) => num(o.bowlDepth, 3, DECK.height - 3, 10);

// A crater tile: a solid floor, then a shell with smooth bowls dished into it.
function appendCrater(mesh, outline, S, o) {
  const H = DECK.height, depth = bowlDepthOf(o), floor = H - depth;
  const nx = Math.round(num(o.bowlsX, 1, 4, 2)), ny = Math.round(num(o.bowlsY, 1, 4, 1));
  // The rim stays clear of the dovetail sockets, which reach 8 mm in.
  const rim = num(o.bowlRim, DECK.tail + 4, 30, 12), gap = Math.max(6, rim - 4);
  const bw = (S - 2 * rim - (nx - 1) * gap) / nx, bd = (S - 2 * rim - (ny - 1) * gap) / ny;
  // Each bowl's wall curves from straight down at the top to flat at the floor (a quarter ellipse).
  const fillet = Math.min(depth, Math.min(bw, bd) / 2 - 2);
  const seg = 8, steps = 8;
  const bowls = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const cx = -S / 2 + rim + bw / 2 + i * (bw + gap), cy = -S / 2 + rim + bd / 2 + j * (bd + gap);
    const r0 = Math.min(bw, bd) / 2 - 0.5;
    // Levels from the top (t = 0) down to the floor (t = 1).
    const levels = Array.from({ length: steps + 1 }, (_, k) => {
      const t = k / steps, inset = fillet * (1 - Math.sqrt(Math.max(0, 1 - t * t)));
      const w = bw - 2 * inset, d = bd - 2 * inset;
      return { z: H - t * depth, ring: roundedRect({ cx, cy, w, d, r: Math.max(1, Math.min(r0 - inset, Math.min(w, d) / 2 - 0.01)) }, seg) };
    });
    bowls.push(levels);
  }
  // The solid floor under the bowls.
  mesh.append(extrudePolygon(insetPolygon(outline, DECK.foot), [], 0, DECK.foot));
  mesh.append(extrudePolygon(outline, [], DECK.foot, floor));
  // The shell: top face (holes = bowl tops), outer wall, bottom face (holes = bowl floors), bowl walls.
  const top = triangulate(outline, bowls.map((b) => b[0].ring));
  const bottom = triangulate(outline, bowls.map((b) => b.at(-1).ring));
  const t0 = mesh.vertexCount;
  for (const [x, y] of top.coords) mesh.addVertex(x, y, H);
  for (let k = 0; k < top.tris.length; k += 3) mesh.addTri(t0 + top.tris[k], t0 + top.tris[k + 1], t0 + top.tris[k + 2]);
  const b0 = mesh.vertexCount;
  for (const [x, y] of bottom.coords) mesh.addVertex(x, y, floor);
  for (let k = 0; k < bottom.tris.length; k += 3) mesh.addTri(b0 + bottom.tris[k], b0 + bottom.tris[k + 2], b0 + bottom.tris[k + 1]);
  // Outer wall: the first ring of each face is the outline, counter-clockwise.
  const m = top.rings[0].length;
  for (let k = 0; k < m; k++) { const k1 = (k + 1) % m; mesh.addQuad(b0 + k, b0 + k1, t0 + k1, t0 + k); }
  // Bowl walls, ring by ring from the floor up (the rings run clockwise, like the holes).
  let offTop = m, offBot = m;
  bowls.forEach((levels) => {
    const n = levels[0].ring.length;
    const rings = [b0 + offBot];
    for (let k = levels.length - 2; k >= 1; k--) {
      const s = mesh.vertexCount;
      for (const [x, y] of cw(levels[k].ring)) mesh.addVertex(x, y, levels[k].z);
      rings.push(s);
    }
    rings.push(t0 + offTop);
    for (let r = 0; r < rings.length - 1; r++) for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n;
      mesh.addQuad(rings[r] + k, rings[r] + k1, rings[r + 1] + k1, rings[r + 1] + k);
    }
    offTop += n; offBot += n;
  });
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
// Receiver, lever and shoe

// The receiver's base plate, as it sits in a hardpoint's pocket.
export function receiverBaseOutline(grow = 0) {
  const [x0, x1] = DECK.baseX, y = DECK.baseY;
  return roundedRect({ cx: (x0 + x1) / 2, cy: 0, w: x1 - x0 + 2 * grow, d: 2 * y + 2 * grow, r: 4 + grow }, 6);
}

// The frame: a C round the pocket, open at the lever's window, with rails.
function frameOutline() {
  const { pocket: p, wall, window: w, railX: [r0, r1], railDepth: rd } = DECK, o = p + wall;
  return [
    [o, w], [o, o], [-o, o], [-o, -o], [o, -o], [o, -w],
    [p, -w], [p, -p], [r1, -p], [r1, -p + rd], [r0, -p + rd], [r0, -p], [-p, -p],
    [-p, p], [r0, p], [r0, p - rd], [r1, p - rd], [r1, p], [p, p], [p, w],
  ];
}

// Convex hull (for the lever's cam and the pivot boss).
function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q); }
  for (const q of [...p].reverse()) { while (up.length >= 2 && cross(up.at(-2), up.at(-1), q) <= 0) up.pop(); up.push(q); }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}

const cam = () => {
  const [px, py] = DECK.pivot, [tx, ty] = DECK.lobeTip;
  const shut = Math.atan2(ty - py, tx - px);
  return { shut, ball: shut - Math.PI / 2, handle: shut + (150 * Math.PI) / 180 };
};

export function deckReceiver(o = {}) {
  const lever = o.withLever !== false;
  const { base, frameTop, pivot: [px, py], bossTop, ballAt, ballPocket } = DECK;
  const { ball } = cam();
  const bx = px + ballAt * Math.cos(ball), by = py + ballAt * Math.sin(ball);
  const mesh = new Mesh();
  const screws = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) screws.push(circle(sx * DECK.screwAt, sy * DECK.screwAt, DECK.screwD / 2, 24));
  const baseHoles = [...screws, ...(lever ? [circle(px, py, DECK.insertD / 2, 24), circle(bx, by, ballPocket / 2, 24)] : [])];
  mesh.append(extrudePolygon(receiverBaseOutline(), baseHoles, 0, base));
  // The top 0.8 mm steps back 0.6 mm: a lead-in that guides a shoe into the pocket.
  mesh.append(extrudePolygon(frameOutline(), [], base, frameTop - 0.8));
  mesh.append(extrudePolygon(insetPolygon(frameOutline(), 0.6), [], frameTop - 0.8, frameTop));
  if (lever) {
    const boss = hull([...circle(px, py, 5.5, 32), ...circle(bx, by, 4.5, 32)]);
    mesh.append(extrudePolygon(boss, [circle(px, py, DECK.insertD / 2, 24), circle(bx, by, ballPocket / 2, 24)], base, bossTop));
  }
  return mesh;
}

// The cam lever, lying as it sits when shut, pivot at the origin.
export function deckLever() {
  const { hubR, lobeR, lobeTip, pivot, handle, handleW, lever: T, ballAt, swing } = DECK;
  const { shut, ball, handle: ha } = cam();
  const tip = [lobeTip[0] - pivot[0], lobeTip[1] - pivot[1]];
  const body = hull([...circle(0, 0, hubR, 40), ...circle(tip[0], tip[1], lobeR, 24)]);
  const sw = (swing * Math.PI) / 180;
  // Two dimples for the ball: one where it sits shut, one open.
  const holes = [circle(0, 0, DECK.screwD / 2, 24), circle(ballAt * Math.cos(ball), ballAt * Math.sin(ball), 1.75, 16), circle(ballAt * Math.cos(ball + sw), ballAt * Math.sin(ball + sw), 1.75, 16)];
  const mesh = extrudePolygon(body, holes, 0, T);
  // The handle, from just outside the hub's holes to a rounded grip.
  const ux = Math.cos(ha), uy = Math.sin(ha), vx = -uy, vy = ux, w = handleW / 2, r0 = hubR - 0.5;
  const grip = [];
  for (let k = 0; k <= 12; k++) { const a = -Math.PI / 2 + (Math.PI * k) / 12; grip.push([ux * handle + (ux * Math.cos(a) + vx * Math.sin(a)) * w, uy * handle + (uy * Math.cos(a) + vy * Math.sin(a)) * w]); }
  const arm = [[ux * r0 - vx * w, uy * r0 - vy * w], ...grip, [ux * r0 + vx * w, uy * r0 + vy * w]];
  mesh.append(extrudePolygon(arm, [], 0, T));
  return { mesh, shut };
}

// The shoe's outline: the pocket less the fit, with slots for the rails and,
// in its middle band, the notch the cam swings into.
function shoeOutline(notch) {
  const { pocket, shoeClear: c, railX: [r0, r1], railDepth: rd, notchX, notchY } = DECK;
  const a = pocket - c, g = c;
  const pts = [[-a, -a], [r0 - g, -a], [r0 - g, -a + rd + g], [r1 + g, -a + rd + g], [r1 + g, -a], [a, -a]];
  if (notch) pts.push([a, -notchY], [notchX, -notchY], [notchX, notchY], [a, notchY]);
  pts.push([a, a], [r1 + g, a], [r1 + g, a - rd - g], [r0 - g, a - rd - g], [r0 - g, a], [-a, a]);
  return pts;
}

export function deckShoe(o = {}) {
  const top = SHOE_TOPS[o.shoeTop] ? o.shoeTop : 'cradle';
  const { shoeH, notchZ: [z0, z1], plateT, plateMaxX, plateMaxY, pocket, shoeClear } = DECK;
  const a = pocket - shoeClear;
  const mesh = new Mesh();
  const notes = [];
  // Holes through the body: inserts in a grid, or bolts counterbored from below.
  const through = [], bores = [];
  let plateW = 2 * a, plateD = 2 * a;
  if (top === 'grid') {
    for (let x = -20; x <= 20; x += 20) for (let y = -20; y <= 20; y += 20) through.push(circle(x, y, DECK.insertD / 2, 24));
    notes.push('Melt M3 heat-set inserts into the nine holes from the top, then screw anything you make to them.');
  }
  if (top === 'bolts') {
    const b = BOLTS[o.boltSize] || BOLTS.m6;
    const bw = num(o.boltW, 10, 2 * plateMaxX - 2 * b.head, 60) / 2, bd = num(o.boltD, 10, 2 * plateMaxY - 2 * b.head, 60) / 2;
    plateW = Math.max(plateW, 2 * bw + 2 * b.head + 6); plateD = Math.max(plateD, 2 * bd + 2 * b.head + 6);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const inside = Math.abs(sx * bw) < a - b.head / 2 - 2 && Math.abs(sy * bd) < a - b.head / 2 - 2 && !(sx * bw > DECK.notchX - b.head / 2 - 1 && Math.abs(sy * bd) < DECK.notchY + b.head / 2 + 1);
      if (inside) { through.push(circle(sx * bw, sy * bd, b.d / 2, 24)); bores.push(circle(sx * bw, sy * bd, b.head / 2 + 0.3, 32)); } else through.push({ plateOnly: circle(sx * bw, sy * bd, b.d / 2, 24) });
    }
    notes.push(`${(o.boltSize || 'm6').toUpperCase()} bolts go up from under the shoe into your device; their heads sit in the counterbores.`);
    if (through.some((h) => h.plateOnly)) notes.push('Some bolts land outside the shoe: those go down through the plate from the top, with nuts or into the device from below.');
  }
  const bodyHoles = through.filter((h) => Array.isArray(h));
  const notchFree = (h) => !h.some(([x, y]) => x > DECK.notchX - 0.5 && Math.abs(y) < DECK.notchY + 0.5);
  // The bottom 0.5 mm steps in 0.4 mm, so the shoe finds the pocket and the rails.
  const shoeFoot = insetPolygon(shoeOutline(false), 0.4);
  mesh.append(extrudePolygon(shoeFoot, [...bodyHoles, ...bores].filter((h) => h.every((q) => pointInPolygon(q, shoeFoot))), 0, 0.5));
  mesh.append(extrudePolygon(shoeOutline(false), [...bodyHoles, ...bores], 0.5, z0));
  mesh.append(extrudePolygon(shoeOutline(true), [...bodyHoles.filter(notchFree), ...bores.filter(notchFree)], z0, z1));
  mesh.append(extrudePolygon(shoeOutline(false), bodyHoles, z1, shoeH));
  // The device plate above the frame: flares out at 45° so it prints without supports.
  let pw = 2 * a, pd = 2 * a;
  if (top === 'cradle') { const D = num(o.cradleD, 30, 2 * plateMaxX - 6, 78) + 0.6; pw = Math.max(pw, D + 6); pd = Math.max(pd, D + 6); }
  if (top === 'tray') { pw = Math.max(pw, num(o.trayW, 30, 2 * plateMaxX - 6, 80) + 6.6); pd = Math.max(pd, num(o.trayD, 30, 2 * plateMaxY - 6, 100) + 6.6); }
  if (top === 'bolts') { pw = plateW; pd = plateD; }
  pw = Math.min(pw, 2 * plateMaxX); pd = Math.min(pd, 2 * plateMaxY);
  const flare = Math.max(Math.max(pw, pd) - 2 * a, 0) / 2;
  let z = shoeH;
  if (flare > 0.01) {
    mesh.append(loftSolid([{ z, rect: { w: 2 * a, d: 2 * a, r: 3 } }, { z: z + flare, rect: { w: Math.min(pw, 2 * a + 2 * flare), d: Math.min(pd, 2 * a + 2 * flare), r: 3 + flare } }], 6));
    z += flare;
  }
  const plateOnly = through.filter((h) => h.plateOnly).map((h) => h.plateOnly);
  const plateHoles = [...bodyHoles, ...plateOnly].filter((h) => h.every(([x, y]) => Math.abs(x) < pw / 2 - 1 && Math.abs(y) < pd / 2 - 1));
  const plateRect = roundedRect({ w: pw, d: pd, r: 4 }, 6);
  mesh.append(extrudePolygon(plateRect, plateHoles, z, z + plateT));
  z += plateT;
  // What sits on the plate.
  if (top === 'cradle') {
    const D = num(o.cradleD, 30, 2 * plateMaxX - 6, 78) + 0.6, h = num(o.cradleH, 3, 30, 8);
    // A gap at the back for the cable.
    const gapHalf = 7, rOut = D / 2 + 3, rIn = D / 2;
    const arc = (r, a0, a1, n) => Array.from({ length: n + 1 }, (_, k) => { const t = a0 + ((a1 - a0) * k) / n; return [r * Math.cos(t), r * Math.sin(t)]; });
    const g0 = Math.PI / 2 + Math.asin(gapHalf / rIn), g1 = Math.PI / 2 - Math.asin(gapHalf / rIn) + 2 * Math.PI;
    const go0 = Math.PI / 2 + Math.asin(gapHalf / rOut), go1 = Math.PI / 2 - Math.asin(gapHalf / rOut) + 2 * Math.PI;
    const c = [...arc(rOut, go0, go1, 64), ...arc(rIn, g1, g0, 64)];
    mesh.append(extrudePolygon(c, [], z, z + h));
    notes.push(`The cradle takes a base ${Math.round(D - 0.6)} mm across (measure yours), with a gap at the back for the cable.`);
  }
  if (top === 'tray') {
    const W = num(o.trayW, 30, 2 * plateMaxX - 6, 80) + 0.6, Dd = num(o.trayD, 30, 2 * plateMaxY - 6, 100) + 0.6, h = num(o.trayH, 3, 40, 10);
    // A rim with a cable slot in the back wall.
    const hw = W / 2, hd = Dd / 2, ow = hw + 3, od = hd + 3, s = 8;
    const rim = [[s, od], [ow, od], [ow, -od], [-ow, -od], [-ow, od], [-s, od], [-s, hd], [-hw, hd], [-hw, -hd], [hw, -hd], [hw, hd], [s, hd]];
    mesh.append(extrudePolygon(rim, [], z, z + h));
    notes.push(`The tray takes a base ${Math.round(W - 0.6)} × ${Math.round(Dd - 0.6)} mm, with a cable slot at the back.`);
  }
  return { mesh, notes, plate: [pw, pd] };
}

// ---------------------------------------------------------------------------
// The studio's entry point: parts to print, and the assembled preview.
export function generateDeck(options = {}) {
  const o = { ...DECK_DEFAULTS, ...options };
  const S = num(o.tileSize, 90, 250, 150);
  const parts = [], assembly = [], notes = [];
  const stats = {};
  if (o.item === 'deck') {
    const cols = Math.round(num(o.deckCols, 1, 8, 4)), rows = Math.round(num(o.deckRows, 1, 6, 3));
    const cells = parseLayout(o.deckLayout, cols, rows);
    const kinds = new Map();
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const type = cells[`${String.fromCharCode(65 + i)}${j + 1}`] || 'flat';
      const e = cellEdges(i, j, cols, rows);
      const key = `${type}-${['left', 'right', 'front', 'back'].filter((k) => e[k]).join('') || 'alone'}`;
      if (!kinds.has(key)) kinds.set(key, { type, e, count: 0, cells: [] });
      const k = kinds.get(key);
      k.count++; k.cells.push(`${String.fromCharCode(65 + i)}${j + 1}`);
      const t = deckTile({ ...o, tileType: type }, e).mesh.translate(i * S, j * S, 0);
      assembly.push({ mesh: t });
      if (type === 'hardpoint') {
        assembly.push({ mesh: deckReceiver(o).translate(i * S, j * S, DECK.height - DECK.base), accent: true });
        const lv = deckLever().mesh.translate(DECK.pivot[0] + i * S, DECK.pivot[1] + j * S, DECK.height - DECK.base + DECK.bossTop);
        assembly.push({ mesh: lv, accent: true });
      }
    }
    for (const [key, k] of kinds) {
      const t = deckTile({ ...o, tileType: k.type }, k.e);
      parts.push({ mesh: t.mesh, name: `tectonic-${k.type}-tile-${key.split('-')[1]}${k.count > 1 ? `-x${k.count}` : ''}`, detail: `Cells ${k.cells.join(', ')}`, copies: k.count });
    }
    stats.tiles = cols * rows; stats.kinds = kinds.size; stats.size = [cols * S, rows * S, DECK.height];
    stats.hardpoints = Object.values(cells).filter((t) => t === 'hardpoint').length;
    notes.push(`Print each file as many times as its name says (×n): tiles with the same joins are the same part. Lay the front-left tile (A1) first, then lower each next tile straight down so its tails drop into the sockets beside it.`);
    if (stats.hardpoints) notes.push(`Make a receiver and lever for each hardpoint (${stats.hardpoints}).`);
  } else if (o.item === 'deckTile') {
    const edgeSet = { all: { left: true, right: true, front: true, back: true }, none: {} }[o.edges] || { left: true, right: true, front: true, back: true };
    const t = deckTile(o, edgeSet);
    parts.push({ mesh: t.mesh, name: `tectonic-${o.tileType}-tile-${Math.round(S)}` });
    notes.push(...t.notes);
    stats.size = t.mesh.bounds().size;
  } else if (o.item === 'receiver') {
    const r = deckReceiver(o);
    parts.push({ mesh: r, name: o.withLever === false ? 'tectonic-parking-dock' : 'tectonic-receiver' });
    assembly.push({ mesh: deckReceiver(o) });
    if (o.withLever !== false) {
      const lv = deckLever();
      parts.push({ mesh: deckLever().mesh, name: 'tectonic-cam-lever', accent: true, detail: 'Accent filament' });
      assembly.push({ mesh: lv.mesh.translate(DECK.pivot[0], DECK.pivot[1], DECK.bossTop), accent: true });
      notes.push('Hardware: 4 × M3 × 8 screws into the hardpoint’s inserts, 1 M3 heat-set insert in the pivot boss, 1 M3 × 12 screw as the pivot, and a 5 mm OD × 8 mm spring with a 5 mm steel ball in the pocket beside it.');
      notes.push('Swing the lever towards the frame to lock, away to release; the ball clicks it into each place.');
    } else notes.push('A parking dock: no lever. Screw it to a shelf or tile and park shoes you aren’t using.');
    const shoe = deckShoe(o);
    assembly.push({ mesh: shoe.mesh.translate(0, 0, DECK.base), example: true });
    stats.size = r.bounds().size;
  } else if (o.item === 'shoe') {
    const s = deckShoe(o);
    parts.push({ mesh: s.mesh, name: `tectonic-shoe-${o.shoeTop}` });
    notes.push(...s.notes, 'It drops into any receiver with its notch towards the lever: the rails only let it in one way round.');
    const r = deckReceiver({ withLever: true });
    assembly.push({ mesh: r, example: true }, { mesh: deckShoe(o).mesh.translate(0, 0, DECK.base) });
    stats.size = s.mesh.bounds().size;
  }
  if (!assembly.length) for (const p of parts) assembly.push({ mesh: p.mesh, accent: p.accent });
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
