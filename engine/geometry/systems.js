// Storage systems beyond Gridfinity and Skådis, all parametric: French cleat,
// pegboard, stacking drawers, inserts for tool cases, and Mint Motive's own
// cable management. Each is an engine in engines/storage.js (openGrid has its
// own geometry in opengrid.js). Boards vary, so every board dimension is a
// setting and each wall system has a fit test to print first. Nothing here is
// affiliated with the people behind those systems.
//
// Wall parts are modelled against the wall (x along it, y out of it towards
// the room, z up) and then laid on their side for printing, so pegs and hook
// tabs print along their length.
import { Mesh } from './mesh.js';
import { box, extrudeX, loftSolid, loftWithHoles } from './primitives.js';
import { circlePolygon, extrudePolygon } from './polygon.js';
import { rr } from './enclosure.js';

const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

export const SYSTEMS = {
  insert: { name: 'Case insert', blurb: 'A tray of pockets sized to the inside of a tool case or drawer.' },
  cable: { name: 'Cable management', blurb: 'Mint Motive’s own: a snap-together channel that screws under the desk or onto openGrid, plus clips and a corner junction.' },
  cleat: { name: 'French cleat', blurb: 'A 45° rail screwed to the wall, and hooks, shelves and racks that drop onto it anywhere along its length.' },
  pegboard: { name: 'Pegboard', blurb: 'Parts for standard pegboard (1 inch holes of 1/4 inch, or metric 25 mm), and a printable board.' },
  drawers: { name: 'Stacking drawers', blurb: 'A drawer cabinet with one or more bays and drawers to fit, printed without supports.' },
};
export const ITEMS = {
  insert: { tray: 'Pocket tray' },
  cable: { snap: 'Snap channel (base and cover)', snapBase: 'Snap channel: base only', snapCover: 'Snap channel: cover only', snapFit: 'Snap channel fit test', snapCorner: 'Snap channel corner', snapTee: 'Snap channel tee', snapCross: 'Snap channel cross', snapEnd: 'Snap channel end cap', channel: 'Open channel', clip: 'Clip strip', armClip: 'Monitor arm clip', junction: 'Corner junction' },
  cleat: { rail: 'Wall rail', hook: 'Hook', cradle: 'Cradle (hoses and cables)', shelf: 'Shelf', rack: 'Tool rack', fit: 'Fit test' },
  pegboard: { hook: 'Hook', cradle: 'Cradle', bin: 'Bin', rack: 'Tool rack', board: 'Board', fit: 'Fit test' },
  drawers: { cabinet: 'Cabinet', drawer: 'Drawer' },
};
// Common pegboard: 1 inch pitch with 1/4 inch holes (US hardboard), and the metric boards sold in Europe and Australia.
export const PEGBOARD_PRESETS = { imperial: { pegPitch: 25.4, pegHole: 6.35, boardThickness: 5 }, metric: { pegPitch: 25, pegHole: 5.5, boardThickness: 4 } };
export const FIT_CLEARANCES = [0.15, 0.25, 0.4];

export const SYSTEM_DEFAULTS = {
  system: 'cleat', item: 'rail',
  // Accessories
  plateThickness: 3, hookLength: 40, hookRise: 14, hookWidth: 12, hookThickness: 5,
  shelfDepth: 60, shelfWidth: 80, shelfLip: 8, cupDiameter: 40, cupHeight: 50,
  // Case insert: inside sizes of the case, then the pockets.
  insideW: 180, insideD: 120, insideH: 40, pocketCols: 3, pocketRows: 2, wall: 1.6, floor: 1.6, corner: 4,
  // Cable management
  length: 200, width: 40, height: 30, cableWall: 2, exits: 3, clipDiameter: 12, clips: 3, armDiameter: 32, snapMount: 'opengrid', snapClearance: 0.2, holeStart: 14,
  // French cleat: the rail's section, and the gap between an accessory and the rail.
  cleatThickness: 12, cleatHeight: 40, railLength: 300, cleatGap: 0.5, cleatWidth: 80, backHeight: 70,
  // Pegboard
  pegPitch: 25.4, pegHole: 6.35, boardThickness: 5, pegClearance: 0.3, boardCols: 8, boardRows: 8, standoff: 12,
  // Bins and racks (pegboard and cleat)
  binW: 75, binD: 45, binH: 45, slots: 5, slotWidth: 12, rackDepth: 45,
  // Stacking drawers: the inside of one bay, the bays in a cabinet, the wall.
  drawerW: 110, drawerD: 130, drawerH: 45, bays: 2, shellWall: 2, drawerClearance: 0.5,
};

export function normaliseSystem(o = {}) {
  const p = { ...SYSTEM_DEFAULTS, ...o };
  p.system = SYSTEMS[p.system] ? p.system : 'cleat';
  p.item = ITEMS[p.system][p.item] ? p.item : Object.keys(ITEMS[p.system])[0];
  p.plateThickness = clamp(p.plateThickness, 2, 6, 3);
  p.hookLength = clamp(p.hookLength, 15, 120, 40); p.hookRise = clamp(p.hookRise, 6, 40, 14); p.hookWidth = clamp(p.hookWidth, 6, 40, 12); p.hookThickness = clamp(p.hookThickness, 3, 10, 5);
  p.shelfDepth = clamp(p.shelfDepth, 20, 150, 60); p.shelfWidth = clamp(p.shelfWidth, 30, 250, 80); p.shelfLip = clamp(p.shelfLip, 0, 30, 8);
  p.cupDiameter = clamp(p.cupDiameter, 20, 90, 40); p.cupHeight = clamp(p.cupHeight, 20, 120, 50);
  p.insideW = clamp(p.insideW, 40, 400, 180); p.insideD = clamp(p.insideD, 40, 400, 120); p.insideH = clamp(p.insideH, 10, 150, 40);
  p.pocketCols = Math.round(clamp(p.pocketCols, 1, 12, 3)); p.pocketRows = Math.round(clamp(p.pocketRows, 1, 12, 2));
  p.wall = clamp(p.wall, 1, 4, 1.6); p.floor = clamp(p.floor, 1, 5, 1.6); p.corner = clamp(p.corner, 0, 15, 4);
  p.length = clamp(p.length, p.system === 'cable' && /^snap/.test(p.item) ? 10 : 40, 400, 200); p.width = clamp(p.width, 15, 120, 40); p.height = clamp(p.height, 10, 80, 30); p.cableWall = clamp(p.cableWall, 1.2, 4, 2);
  p.snapMount = ['opengrid', 'desk', 'tape'].includes(p.snapMount) ? p.snapMount : 'opengrid'; p.snapClearance = clamp(p.snapClearance, 0.05, 0.5, 0.2); p.holeStart = clamp(p.holeStart, 2, 40, 14);
  p.exits = Math.round(clamp(p.exits, 0, 8, 3)); p.clipDiameter = clamp(p.clipDiameter, 4, 30, 12); p.clips = Math.round(clamp(p.clips, 1, 8, 3)); p.armDiameter = clamp(p.armDiameter, 15, 60, 32);
  p.cleatThickness = clamp(p.cleatThickness, 8, 25, 12); p.cleatHeight = clamp(p.cleatHeight, p.cleatThickness + 10, 80, 40); p.railLength = clamp(p.railLength, 60, 400, 300);
  p.cleatGap = clamp(p.cleatGap, 0.1, 2, 0.5); p.cleatWidth = clamp(p.cleatWidth, 30, 250, 80); p.backHeight = clamp(p.backHeight, p.cleatThickness + 25, 200, 70);
  p.pegPitch = clamp(p.pegPitch, 15, 50, 25.4); p.pegHole = clamp(p.pegHole, 3, 12, 6.35); p.boardThickness = clamp(p.boardThickness, 2, 12, 5);
  p.pegClearance = clamp(p.pegClearance, 0, 1, 0.3); p.boardCols = Math.round(clamp(p.boardCols, 2, 16, 8)); p.boardRows = Math.round(clamp(p.boardRows, 2, 16, 8)); p.standoff = clamp(p.standoff, 0, 30, 12);
  p.binW = clamp(p.binW, 20, 200, 75); p.binD = clamp(p.binD, 15, 150, 45); p.binH = clamp(p.binH, 15, 150, 45);
  p.slots = Math.round(clamp(p.slots, 1, 16, 5)); p.slotWidth = clamp(p.slotWidth, 3, 40, 12); p.rackDepth = clamp(p.rackDepth, 15, 100, 45);
  p.drawerW = clamp(p.drawerW, 30, 300, 110); p.drawerD = clamp(p.drawerD, 30, 300, 130); p.drawerH = clamp(p.drawerH, 15, 150, 45);
  p.bays = Math.round(clamp(p.bays, 1, 6, 2)); p.shellWall = clamp(p.shellWall, 1.2, 5, 2); p.drawerClearance = clamp(p.drawerClearance, 0.1, 2, 0.5);
  return p;
}

// ---------- helpers ----------
const slab = (poly, holes, z0, z1) => extrudePolygon(poly, holes, z0, z1);
// Vertices mapped; flip reverses winding when the map mirrors.
function mapped(mesh, map, flip = false) {
  const p = mesh.positions;
  for (let i = 0; i < p.length; i += 3) { const [x, y, z] = map(p[i], p[i + 1], p[i + 2]); p[i] = x; p[i + 1] = y; p[i + 2] = z; }
  if (flip) for (let t = 0; t < mesh.indices.length; t += 3) { const b = mesh.indices[t + 1]; mesh.indices[t + 1] = mesh.indices[t + 2]; mesh.indices[t + 2] = b; }
  return mesh;
}
// Wall frame (x along, y out, z up) laid on its side for printing: x becomes up. A rotation, so nothing mirrors.
function onSide(mesh) {
  mapped(mesh, (x, y, z) => [z, y, -x]);
  const b = mesh.bounds();
  return mesh.translate(-b.min[0], -b.min[1], -b.min[2]);
}
const SCREW = 4.3; // wall anchors and case screws

// ---------- case inserts ----------
export function caseInsert(p) {
  const W = p.insideW - 0.6, D = p.insideD - 0.6, H = p.insideH; // a little under the inside size so it drops in
  const m = new Mesh();
  const outer = { cx: W / 2, cy: D / 2, w: W, d: D, r: p.corner };
  m.append(loftSolid([{ z: 0, rect: outer }, { z: p.floor, rect: outer }], 8));
  const cw = (W - p.wall * (p.pocketCols + 1)) / p.pocketCols, cd = (D - p.wall * (p.pocketRows + 1)) / p.pocketRows;
  const pockets = [];
  for (let i = 0; i < p.pocketCols; i++) for (let j = 0; j < p.pocketRows; j++) {
    const x0 = p.wall + i * (cw + p.wall), y0 = p.wall + j * (cd + p.wall);
    pockets.push(rr(x0, y0, x0 + cw, y0 + cd, Math.max(0, p.corner - p.wall), 6));
  }
  m.append(loftWithHoles([{ z: p.floor - 0.01, rect: outer }, { z: H, rect: outer }], pockets, 8));
  return m;
}

// ---------- cable management ----------
export function cableChannel(p) {
  const L = p.length, W = p.width, H = p.height, t = p.cableWall;
  const m = new Mesh();
  m.append(box(0, 0, 0, L, W, t)); // floor
  // Side walls with cable exits: gaps every so often.
  const exits = p.exits, seg = L / (exits + 1);
  for (const y0 of [0, W - t]) {
    let x = 0;
    for (let k = 0; k <= exits; k++) {
      const x1 = k === exits ? L : (k + 1) * seg - 8;
      m.append(box(x, y0, 0, x1, y0 + t, H));
      x = (k + 1) * seg + 8;
    }
  }
  // Screw ears at each end.
  for (const x of [-12, L]) m.append(loftWithHoles([{ z: 0, rect: { cx: x + 6, cy: W / 2, w: 12, d: Math.min(W, 20), r: 3 } }, { z: t, rect: { cx: x + 6, cy: W / 2, w: 12, d: Math.min(W, 20), r: 3 } }], [circlePolygon(x + 6, W / 2, SCREW / 2, 20)], 6));
  return m.translate(12, 0, 0);
}
export function cableClip(p) {
  const d = p.clipDiameter, t = 1.8, r = d / 2 + t, step = d + 2 * t + 4, base = 3;
  const m = new Mesh();
  const L = p.clips * step + 8;
  m.append(loftWithHoles([{ z: 0, rect: { cx: L / 2, cy: r, w: L, d: 2 * r, r: 3 } }, { z: base, rect: { cx: L / 2, cy: r, w: L, d: 2 * r, r: 3 } }], [circlePolygon(4, r, SCREW / 2, 20), circlePolygon(L - 4, r, SCREW / 2, 20)], 6));
  for (let i = 0; i < p.clips; i++) {
    const cx = 4 + step * (i + 0.5), cy = r;
    // A C-clip: a ring with an opening at the top, 220° round.
    const pts = [];
    const a0 = Math.PI / 2 + 0.55, a1 = Math.PI / 2 - 0.55 + 2 * Math.PI;
    for (let k = 0; k <= 24; k++) { const a = a0 + ((a1 - a0) * k) / 24; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    for (let k = 24; k >= 0; k--) { const a = a0 + ((a1 - a0) * k) / 24; pts.push([cx + (d / 2) * Math.cos(a), cy + (d / 2) * Math.sin(a)]); }
    m.append(mapped(extrudePolygon(pts, [], 0, d), (x, y, z) => [x, z, y], true).translate(0, 0, base - 0.01 + r));
  }
  // Stand the clips up: the flat base is the print bed, clips rise from it. The clip rings are built with their axis along y (cables run along y).
  return m;
}
// ---------- snap channel ----------
// Mint Motive's own two-piece under-desk channel. The base screws up under the
// desk (or into openGrid screw snaps, 28 mm apart), cables lie between its two
// rails, and the cover clicks over: a 45° diamond barb on each rail drops into a
// V-groove inside each cover leg. Both print flat with no supports: the base
// floor down, the cover roof down.
export const SNAP = { floor: 2.4, roof: 2, barb: 0.7, groove: 0.6, grooveHalf: 0.8, railMax: 8 };
export function snapDims(p) {
  const W = p.width, H = p.height, t = p.cableWall, g = p.snapClearance, tl = t + SNAP.groove + 0.4;
  const zR = SNAP.floor + Math.min(SNAP.railMax, H - 1), zb = zR - 1.2;
  return { W, H, t, g, tl, zR, zb, Bo: W / 2 + t + g + tl };
}
/** Where the base's screw holes go along the channel. */
export function snapHoles(p) {
  if (p.snapMount === 'tape') return [];
  // On openGrid the first hole can move (holeStart) so a length that starts off a cell centre still lands on the screw snaps.
  const pitch = p.snapMount === 'opengrid' ? 28 : 100, start = p.snapMount === 'opengrid' ? (p.holeStart ?? 14) : Math.min(20, p.length / 2);
  const xs = [];
  for (let x = start; x <= p.length - Math.min(start, 8) + 1e-9; x += pitch) xs.push(x);
  return xs;
}
export function snapBase(p) {
  const { W, t, zR, zb, Bo } = snapDims(p), L = p.length, b = SNAP.barb;
  const r = p.snapMount === 'opengrid' ? 1.7 : 2.25; // M3 into a screw snap, or a 4 mm wood screw
  const m = extrudePolygon([[0, -Bo], [L, -Bo], [L, Bo], [0, Bo]], snapHoles(p).map((x) => circlePolygon(x, 0, r, 20)), 0, SNAP.floor);
  // One rail: straight inside, a diamond barb outside near the top.
  const rail = [[W / 2, SNAP.floor - 0.01], [W / 2 + t, SNAP.floor - 0.01], [W / 2 + t, zb - b], [W / 2 + t + b, zb], [W / 2 + t, zb + b], [W / 2 + t, zR], [W / 2, zR]];
  m.append(prismYZ(rail, 0, L));
  m.append(prismYZ(rail.map(([y, z]) => [-y, z]).reverse(), 0, L));
  return m;
}
/** The cover, built the way it sits on the base (legs down), then turned roof-down to print. */
export function snapCover(p, printed = true) {
  const { W, H, t, g, zb, Bo } = snapDims(p), L = p.length;
  const inner = W / 2 + t + g, zTop = SNAP.floor + H, zRoof = zTop + SNAP.roof, gh = SNAP.grooveHalf;
  // The whole section, anticlockwise: right leg (with its groove), roof, left leg.
  const right = [[inner, SNAP.floor], [Bo, SNAP.floor], [Bo, zRoof], [-Bo, zRoof], [-Bo, SNAP.floor], [-inner, SNAP.floor], [-inner, zb - gh], [-(inner + SNAP.groove), zb], [-inner, zb + gh], [-inner, zTop], [inner, zTop], [inner, zb + gh], [inner + SNAP.groove, zb], [inner, zb - gh]];
  const m = prismYZ(right, 0, L);
  if (!printed) return m;
  return mapped(m, (x, y, z) => [x, -y, zRoof - z]);
}
export function snapFit(p) {
  const q = { ...p, length: 30, snapMount: 'tape' };
  const m = new Mesh();
  m.append(snapBase(q));
  m.append(snapCover(q).translate(0, 2 * snapDims(q).Bo + 6, 0));
  return m;
}
// Fittings: an end cap, a corner, a tee and a cross, each a base and a cover.
// Every arm has the channel's section and reaches 20 mm past the middle
// square, so straight lengths butt against it. The sides with no arm are
// walled. Barbs and grooves run only along the arms, clear of the middle,
// so a cover's legs never meet a barb from the side. One screw in the middle.
export const SNAP_FITTINGS = { snapEnd: [0], snapCorner: [0, 1], snapTee: [0, 1, 2], snapCross: [0, 1, 2, 3] }; // arm directions, quarter turns from +x
const ARM = 20;
// A [v, z] section extruded along u from u0 to u1, on one side (v mirrored for side −1), turned q quarter turns.
function armPrism(section, u0, u1, q, side = 1) {
  const sec = side > 0 ? section : section.map(([v, z]) => [-v, z]).reverse();
  const m = prismYZ(sec, u0, u1);
  const [c, sn] = [[1, 0], [0, 1], [-1, 0], [0, -1]][q];
  return mapped(m, (x, y, z) => [x * c - y * sn, x * sn + y * c, z]);
}
const box2 = (v0, v1, z0, z1) => [[v0, z0], [v1, z0], [v1, z1], [v0, z1]];
export function snapFittingBase(p, arms) {
  const { W, t, zR, zb, Bo } = snapDims(p), b = SNAP.barb, A = Bo + ARM, F = SNAP.floor;
  const r = p.snapMount === 'opengrid' ? 1.7 : 2.25;
  const m = extrudePolygon([[-Bo, -Bo], [Bo, -Bo], [Bo, Bo], [-Bo, Bo]], p.snapMount === 'tape' ? [] : [circlePolygon(0, 0, r, 20)], 0, F);
  for (let q = 0; q < 4; q++) {
    if (arms.includes(q)) {
      m.append(armPrism(box2(-Bo, Bo, 0, F), Bo - 0.01, A, q));
      for (const side of [1, -1]) {
        m.append(armPrism(box2(W / 2, W / 2 + t, F - 0.01, zR), W / 2, A, q, side));
        m.append(armPrism([[W / 2 + t - 0.01, zb - b], [W / 2 + t + b, zb], [W / 2 + t - 0.01, zb + b]], Bo + 1, A, q, side));
      }
    } else m.append(armPrism(box2(-(W / 2 + t), W / 2 + t, F - 0.01, zR), W / 2, W / 2 + t, q)); // a wall across this side
  }
  return m;
}
/** The fitting's cover, built as it sits (legs down), then turned roof-down to print. */
export function snapFittingCover(p, arms, printed = true) {
  const { W, H, t, g, zb, Bo } = snapDims(p), A = Bo + ARM, F = SNAP.floor, gh = SNAP.grooveHalf;
  const inner = W / 2 + t + g, zTop = F + H, zRoof = zTop + SNAP.roof, gIn = inner + SNAP.groove + 0.2;
  const m = extrudePolygon([[-Bo, -Bo], [Bo, -Bo], [Bo, Bo], [-Bo, Bo]], [], zTop, zRoof);
  const grooved = [[inner, F], [gIn, F], [gIn, zTop + 0.01], [inner, zTop + 0.01], [inner, zb + gh], [inner + SNAP.groove, zb], [inner, zb - gh]];
  for (let q = 0; q < 4; q++) {
    if (arms.includes(q)) {
      m.append(armPrism(box2(-Bo, Bo, zTop, zRoof), Bo - 0.01, A, q));
      for (const side of [1, -1]) {
        // The side toward a neighbouring arm is an inside corner: the leg starts where that arm's leg is.
        const next = (q + (side > 0 ? 1 : 3)) % 4, u0 = arms.includes(next) ? inner : -Bo;
        m.append(armPrism(box2(gIn - 0.01, Bo, F, zTop + 0.01), u0, A, q, side));
        m.append(armPrism(box2(inner, gIn, F, zTop + 0.01), u0, Bo + 1, q, side));
        m.append(armPrism(grooved, Bo + 1 - 0.01, A, q, side));
      }
    } else m.append(armPrism(box2(-Bo, Bo, F, zTop + 0.01), inner, Bo, q)); // a plain leg across this side
  }
  if (!printed) return m;
  return mapped(m, (x, y, z) => [x, -y, zRoof - z]);
}
export function snapFitting(p, arms) {
  const m = new Mesh(), base = snapFittingBase(p, arms), cover = snapFittingCover(p, arms);
  const bb = base.bounds(), cb = cover.bounds();
  m.append(base.translate(-bb.min[0], -bb.min[1], -bb.min[2]));
  m.append(cover.translate(-cb.min[0], bb.size[1] + 6 - cb.min[1], -cb.min[2]));
  return m;
}
export function snapPair(p) {
  const m = new Mesh();
  m.append(snapBase(p));
  m.append(snapCover(p).translate(0, 2 * snapDims(p).Bo + 6, 0));
  return m;
}

export function cableJunction(p) {
  // A corner: two channel legs meeting at 90°, open at both ends, with the inside corner walled.
  const W = p.width, H = p.height, t = p.cableWall, L = W * 2;
  const m = new Mesh();
  m.append(box(0, 0, 0, L, W, t)); m.append(box(0, W, 0, W, L, t)); // the floor, an L
  m.append(box(0, 0, 0, L, t, H)); // outer wall along x
  m.append(box(0, 0, 0, t, L, H)); // outer wall along y
  m.append(box(W - t, W - t, 0, L, W, H)); // inner wall along x
  m.append(box(W - t, W - t, 0, W, L, H)); // inner wall along y
  return m;
}

// ---------- prisms ----------
// A 2D profile of [y, z] points extruded along x (any shape, holes allowed).
function prismYZ(profile, x0, x1, holes = []) {
  return mapped(extrudePolygon(profile, holes, x0, x1), (a, b, c) => [c, a, b]);
}
// A 2D profile of [x, z] points extruded along y.
function prismXZ(profile, y0, y1, holes = []) {
  return mapped(extrudePolygon(profile, holes, y0, y1), (a, b, c) => [a, c, b], true);
}
// A hole that prints without support when its axis lies flat: round below, a 45° point on top.
function teardrop(cx, cz, r, segs = 16) {
  const pts = [];
  for (let k = 0; k <= segs; k++) { const a = Math.PI / 4 - (k / segs) * (Math.PI * 1.5); pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]); } // from upper right, round the bottom, to upper left
  pts.push([cx, cz + r * Math.SQRT2]);
  return pts.reverse();
}
// Upright (z up, wall behind at y = 0): lay the part on the bed.
function onBed(mesh) { const b = mesh.bounds(); return mesh.translate(-b.min[0], -b.min[1], -b.min[2]); }
// Upside down, for parts whose flat top is the best face to print on.
function flipped(mesh) { return onBed(mapped(mesh, (x, y, z) => [x, -y, -z])); }

// ---------- French cleat ----------
// Wall frame: x along the wall, y out of it, z up. The rail's top slopes down
// towards the wall at 45°; an accessory's cleat hooks into that pocket.
export function cleatRail(p) {
  const T = p.cleatThickness, H = p.cleatHeight, L = p.railLength, body = H - T;
  // The rail stands on its bottom face: the slope is a top face and the screw holes are teardrops.
  const n = Math.max(2, Math.round(L / 150) + 1), holes = [];
  for (let i = 0; i < n; i++) holes.push(teardrop(20 + ((L - 40) * i) / (n - 1), body / 2, SCREW / 2));
  const m = new Mesh();
  m.append(prismXZ([[0, 0], [L, 0], [L, body], [0, body]], 0, T, holes));
  m.append(prismYZ([[0, body - 0.01], [T, body - 0.01], [T, H], [0, H - T]], 0, L));
  return onBed(m);
}
// An accessory's cleat and back plate in profile ([y, z]): the plate's back at y = 0, the cleat behind it (y < 0).
function cleatBack(p, height) {
  const T = p.cleatThickness, g = p.cleatGap, P = p.plateThickness + 1, top = height;
  const depth = T - g, drop = Math.min(T, height - 6);
  // The cleat: a block behind the top of the plate with its underside at 45°, matching the rail.
  return [[P, 0], [P, top], [-depth, top], [-depth, top - drop], [0, top - drop + depth], [0, 0]];
}
export function cleatHook(p, cradle = false) {
  const P = p.plateThickness + 1, t = p.hookThickness, L = cradle ? Math.max(p.hookLength, 60) : p.hookLength, R = cradle ? Math.max(p.hookRise, 30) : p.hookRise;
  const back = cleatBack(p, p.backHeight);
  // One outline: the back and cleat, then the arm out from the bottom of the plate with its rise.
  const prof = [[0, 0], [P + L, 0], [P + L, R], [P + L - t, R], [P + L - t, t], [P, t], ...back.slice(1, -1)];
  return onSide(prismYZ(prof, -p.hookWidth / 2, p.hookWidth / 2));
}
export function cleatShelf(p) {
  const P = p.plateThickness + 1, H = p.backHeight, D = p.shelfDepth, t = 4, lip = p.shelfLip;
  const [, , ...cleat] = cleatBack(p, H); // [-depth, H], [-depth, H - drop], [0, …], [0, 0]
  // Shelf on top, a lip at the front, and a solid 45° bracket under the whole width.
  const zb = Math.max(0, H - t - D), e = H - t - zb;
  const prof = [[0, 0], [P, 0], ...(zb > 0 ? [[P, zb]] : []), [P + e, H - t], [P + D, H - t],
    ...(lip ? [[P + D, H + lip], [P + D - t, H + lip], [P + D - t, H]] : [[P + D, H]]), ...cleat.slice(0, -1)];
  return onSide(prismYZ(prof, 0, p.cleatWidth));
}
// A rack of fingers with slots between them, open at the front. Each finger has a 45° underside.
function rackFingers(p, y0, top, width) {
  const D = p.rackDepth, t = 8, n = p.slots, sw = p.slotWidth;
  const fw = Math.max(4, (width - n * sw) / (n + 1));
  const m = new Mesh();
  const prof = [[y0 - 0.01, top - t - D], [y0 + D, top - t], [y0 + D, top], [y0 - 0.01, top]];
  for (let i = 0; i <= n; i++) { const x0 = -width / 2 + i * (fw + sw); m.append(prismYZ(prof, x0, x0 + fw)); }
  // A bar across the front, so the fingers can't spread.
  m.append(prismYZ([[y0 + D - 4, top - 6], [y0 + D, top - 6], [y0 + D, top], [y0 + D - 4, top]], -width / 2, width / 2));
  return m;
}
export function cleatRack(p) {
  const P = p.plateThickness + 1, H = Math.max(p.backHeight, p.rackDepth + 20), W = p.cleatWidth;
  const m = new Mesh();
  m.append(prismYZ(cleatBack(p, H), -W / 2, W / 2));
  m.append(rackFingers(p, P, H, W));
  // Printed upside down: the tops of the plate, cleat and rack go on the bed; every slope then faces up.
  return flipped(m);
}
export function cleatFit(p) {
  // A short piece of rail and a short accessory cleat, to check the drop-in before printing a wall's worth.
  const rail = cleatRail({ ...p, railLength: 40 });
  const back = onSide(prismYZ(cleatBack(p, p.cleatThickness + 25), 0, 30));
  rail.append(back.translate(rail.bounds().size[0] + 6, 0, 0));
  return rail;
}

// ---------- pegboard ----------
// Board frame: the board's front at y = 0, its back at y = -boardThickness; round holes on a square grid.
const pegSize = (p) => p.pegHole - 2 * p.pegClearance;
// The classic hook, printed on its side so the pegs run along the layers. A
// square 0.7 of the hole across fits the round hole corner to corner.
export function pegHook(p, cradle = false) {
  const D = pegSize(p), w = 0.7 * D, h = 0.7 * D, bt = p.boardThickness, P = p.plateThickness, t = Math.max(p.hookThickness, h);
  const L = cradle ? Math.max(p.hookLength, 60) : p.hookLength, R = cradle ? Math.max(p.hookRise, 30) : p.hookRise;
  const hi = p.pegPitch, top = hi + h; // the lower peg at the bottom, the upper one a pitch above
  const behind = bt + 1.5, tab = Math.min(8, p.pegPitch - h - 2), tt = 3;
  const prof = [
    [0, 0], [P + L, 0], [P + L, R], [P + L - t, R], [P + L - t, t], [P, t], [P, top],
    // The upper peg: back through the board, then up behind it (tilt the hook in, then swing it down).
    [-behind, top], [-behind, top + tab], [-behind - tt, top + tab], [-behind - tt, hi], [0, hi],
    // The lower peg, straight in.
    [0, h], [-bt - 1, h], [-bt - 1, 0],
  ];
  return onSide(prismYZ(prof, -w / 2, w / 2));
}
// Upright parts (bins and racks) hang on separate pins, printed lying flat so
// nothing overhangs: a square bar that fits the round hole corner to corner,
// with a head that stops it in the part's socket. Upper pins have a barb that
// rises behind the board, so a loaded part can't lever out.
const pinSide = (p) => pegSize(p) / Math.SQRT2;
function pinMesh(p, barb) {
  const s = pinSide(p), hw = s / 2 + 2, P = p.plateThickness, head = 2;
  const end = head + P + p.boardThickness + 1.5 + (barb ? s : 0);
  const prof = barb
    ? [[0, -hw], [head, -hw], [head, -s / 2], [end, -s / 2], [end, s / 2 + 4], [end - s, s / 2 + 4], [end - s, s / 2], [head, s / 2], [head, hw], [0, hw]]
    : [[0, -hw], [head, -hw], [head, -s / 2], [end, -s / 2], [end, s / 2], [head, s / 2], [head, hw], [0, hw]];
  return extrudePolygon(prof, [], 0, s);
}
// The pins, laid out in a row beside a part.
function withPins(part, p, pins) {
  const b = part.bounds();
  pins.forEach((barb, i) => part.append(pinMesh(p, barb).translate(b.max[0] + 6, b.min[1] + pinSide(p) / 2 + 2 + i * (pinSide(p) + 10), b.min[2])));
  return onBed(part);
}
// A back plate with square sockets at both ends, two heights a pitch apart. Returns the plate and which pins it needs.
function pegBack(p, width, height) {
  const P = p.plateThickness, pitch = p.pegPitch, s = pinSide(p) + 0.2, D = pegSize(p);
  const across = Math.max(1, Math.floor((width - D - 6) / pitch) + 1);
  const zHigh = height - D / 2 - 5, zLow = zHigh - pitch;
  const sockets = [], pins = [];
  for (const i of across > 1 ? [0, across - 1] : [0]) {
    const cx = (i - (across - 1) / 2) * pitch;
    for (const [cz, barb] of [[zHigh, true], [zLow, false]]) {
      if (cz - s / 2 < 2) continue;
      sockets.push([[cx - s / 2, cz - s / 2], [cx + s / 2, cz - s / 2], [cx + s / 2, cz + s / 2], [cx - s / 2, cz + s / 2]]);
      pins.push(barb);
    }
  }
  const mesh = prismXZ([[-width / 2, 0], [width / 2, 0], [width / 2, height], [-width / 2, height]], 0, P, sockets);
  return { mesh, pins };
}
export function pegBin(p) {
  const P = p.plateThickness, W = Math.max(p.binW, 20), D = p.binD, wall = 1.8;
  const H = Math.max(p.binH, p.pegPitch + pegSize(p) + 12);
  const { mesh: m, pins } = pegBack(p, W, H);
  const outer = { cx: 0, cy: P + D / 2 - 0.01, w: W, d: D, r: 3 };
  m.append(loftSolid([{ z: 0, rect: outer }, { z: 1.6, rect: outer }], 6));
  m.append(loftWithHoles([{ z: 1.59, rect: outer }, { z: p.binH, rect: outer }], [rr(-W / 2 + wall, P + wall - 0.01, W / 2 - wall, P + D - wall, 1.5, 6)], 6));
  return withPins(onBed(m), p, pins);
}
export function pegRack(p) {
  const P = p.plateThickness, W = Math.max(p.binW, p.slots * (p.slotWidth + 5) + 5), H = Math.max(p.rackDepth + 16, p.pegPitch + pegSize(p) + 12);
  const { mesh: m, pins } = pegBack(p, W, H);
  m.append(rackFingers(p, P, H, W));
  return withPins(onBed(m), p, pins);
}
export function pegBoard(p) {
  const pitch = p.pegPitch, W = p.boardCols * pitch, H = p.boardRows * pitch, t = p.boardThickness;
  const holes = [];
  for (let i = 0; i < p.boardCols; i++) for (let j = 0; j < p.boardRows; j++) holes.push(circlePolygon((i + 0.5) * pitch, (j + 0.5) * pitch, p.pegHole / 2, 20));
  // Screws where four holes meet, one near each corner.
  const posts = [[pitch, pitch], [W - pitch, pitch], [pitch, H - pitch], [W - pitch, H - pitch]];
  for (const [cx, cy] of posts) holes.push(circlePolygon(cx, cy, SCREW / 2, 16));
  const m = new Mesh();
  // Printed face down. A rim and posts on the back hold it off the wall, so pegs and barbs have room.
  m.append(extrudePolygon(rr(0, 0, W, H, 2, 6), holes, 0, t));
  if (p.standoff) {
    const rim = 5;
    m.append(extrudePolygon(rr(0, 0, W, H, 2, 6), [rr(rim, rim, W - rim, H - rim, 0, 1)], t - 0.01, t + p.standoff));
    for (const [cx, cy] of posts) m.append(extrudePolygon(circlePolygon(cx, cy, 5, 24), [circlePolygon(cx, cy, SCREW / 2, 16)], t - 0.01, t + p.standoff));
  }
  return m;
}
export function pegFit(p) {
  // A straight pin at each of three clearances, loosest on the right: the one that slides into your board snugly is yours.
  const m = new Mesh();
  FIT_CLEARANCES.forEach((c, i) => m.append(pinMesh({ ...p, pegClearance: c }, false).translate(0, i * 12, 0)));
  return onBed(m);
}

// ---------- stacking drawers ----------
// Drawers slide into bays. The cabinet prints on its back with the open front
// up, so every wall and divider stands upright; the drawer prints as it's used.
export function drawerCabinet(p) {
  const w = p.shellWall, W = p.drawerW + 2 * w, H = p.bays * p.drawerH + (p.bays + 1) * w, D = p.drawerD + w;
  // Printing frame: x across, y up the cabinet (bays stack along y), z from the back (on the bed) to the open front.
  const bays = [], screws = [];
  for (let k = 0; k < p.bays; k++) {
    const y0 = w + k * (p.drawerH + w);
    bays.push(rr(w, y0, w + p.drawerW, y0 + p.drawerH, 0, 1));
    if (k === p.bays - 1) for (const fx of [0.25, 0.75]) screws.push(circlePolygon(fx * W, y0 + p.drawerH / 2, SCREW / 2, 16));
  }
  const m = new Mesh();
  m.append(extrudePolygon(rr(0, 0, W, H, 1.5, 4), screws, 0, w)); // the back, with two holes to screw it to a wall
  m.append(extrudePolygon(rr(0, 0, W, H, 1.5, 4), bays, w - 0.01, D));
  return m;
}
export function drawerBox(p) {
  const c = p.drawerClearance, ow = p.drawerW - 2 * c, oh = p.drawerH - c, od = p.drawerD - 0.5, wall = 1.6, floor = 1.6, front = 3;
  const m = new Mesh();
  const body = { cx: ow / 2, cy: od / 2, w: ow, d: od, r: 0 };
  m.append(loftSolid([{ z: 0, rect: body }, { z: floor, rect: body }], 6));
  // Sides and back; the front plate is the fourth wall, so the finger pull goes right through.
  const top = oh - 1;
  m.append(box(0, 0, floor - 0.01, wall, od, top));
  m.append(box(ow - wall, 0, floor - 0.01, ow, od, top));
  m.append(box(0, 0, floor - 0.01, ow, wall, top));
  // The front: flush at the bottom, a little proud at the sides and top to cover the cabinet's edge, with a finger pull cut from the top.
  const lip = Math.min(p.shellWall, 2), fh = oh + lip, r = Math.min(15, ow * 0.2, oh * 0.4), cx = ow / 2;
  const outline = [[-lip, 0], [ow + lip, 0], [ow + lip, fh]];
  for (let k = 0; k <= 12; k++) { const a = (k / 12) * Math.PI; outline.push([cx + r * Math.cos(a), fh - r * Math.sin(a)]); }
  outline.push([-lip, fh]);
  m.append(prismXZ(outline, od - 0.01, od + front));
  return onBed(m);
}

export function systemParts(o = {}) {
  const p = normaliseSystem(o);
  const one = (mesh, name) => ({ plan: p, parts: [{ mesh, name }] });
  if (p.system === 'insert') return one(caseInsert(p), `case-insert-${p.pocketCols}x${p.pocketRows}`);
  if (p.system === 'cleat') return one({ rail: cleatRail, hook: (q) => cleatHook(q), cradle: (q) => cleatHook(q, true), shelf: cleatShelf, rack: cleatRack, fit: cleatFit }[p.item](p), `cleat-${p.item}`);
  if (p.system === 'pegboard') return one({ hook: (q) => pegHook(q), cradle: (q) => pegHook(q, true), bin: pegBin, rack: pegRack, board: pegBoard, fit: pegFit }[p.item](p), `pegboard-${p.item}`);
  if (p.system === 'drawers') return one(p.item === 'drawer' ? drawerBox(p) : drawerCabinet(p), p.item === 'drawer' ? `drawer-${Math.round(p.drawerW)}x${Math.round(p.drawerD)}` : `drawer-cabinet-${p.bays}-bay`);
  const snaps = { snap: snapPair, snapBase, snapCover: (q) => snapCover(q), snapFit };
  if (snaps[p.item]) return one(onBed(snaps[p.item](p)), `cable-${p.item}-${Math.round(p.length)}`);
  if (SNAP_FITTINGS[p.item]) return one(onBed(snapFitting(p, SNAP_FITTINGS[p.item])), `cable-${p.item.replace('snap', 'snap-').toLowerCase()}-${Math.round(p.width)}x${Math.round(p.height)}`);
  if (p.item === 'armClip') return one(armClip(p), `cable-arm-clip-${Math.round(p.armDiameter)}-${Math.round(p.clipDiameter)}`);
  return one({ channel: cableChannel, clip: cableClip, junction: cableJunction }[p.item](p), `cable-${p.item}`);
}

/**
 * A C-shaped band: radius r inside, `wall` thick, open over a gap `open` wide
 * (measured at the inside) facing angle `face`. Rounded ends. As an outline.
 */
export function cBand(cx, cy, r, wall, open, face, seg = 48) {
  const half = Math.asin(Math.min(0.95, open / 2 / r)), R = r + wall, pts = [];
  const a0 = face + half, a1 = face + 2 * Math.PI - half;
  for (let k = 0; k <= seg; k++) { const a = a0 + ((a1 - a0) * k) / seg; pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
  // A rounded cap at each end: half a circle across the band's thickness.
  const cap = (a, dir) => {
    const mx = cx + (r + wall / 2) * Math.cos(a), my = cy + (r + wall / 2) * Math.sin(a), u = [Math.cos(a), Math.sin(a)], t = [-Math.sin(a) * dir, Math.cos(a) * dir];
    for (let k = 1; k < 8; k++) { const f = (Math.PI * k) / 8, su = dir > 0 ? Math.cos(f) : -Math.cos(f); pts.push([mx + (wall / 2) * (u[0] * su + t[0] * Math.sin(f)), my + (wall / 2) * (u[1] * su + t[1] * Math.sin(f))]); }
  };
  cap(a1, 1);
  for (let k = seg; k >= 0; k--) { const a = a0 + ((a1 - a0) * k) / seg; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  cap(a0, -1);
  return pts;
}
/**
 * A clip that snaps round a monitor arm's pole, with a smaller clip on its
 * back for the cables. Prints flat, 14 mm tall, no supports.
 */
export function armClip(p) {
  const R = p.armDiameter / 2 + 0.2, wA = 3, rc = p.clipDiameter / 2 + 0.2, wC = 2.4, h = 14;
  const m = new Mesh();
  m.append(extrudePolygon(cBand(0, 0, R, wA, 0.72 * 2 * R, -Math.PI / 2), [], 0, h));
  const yc = R + wA + rc + wC - 0.6;
  m.append(extrudePolygon(cBand(0, yc, rc, wC, 0.72 * 2 * rc, 0), [], 0, h));
  m.append(extrudePolygon([[-4, R + wA / 2], [4, R + wA / 2], [4, yc - rc - wC / 2], [-4, yc - rc - wC / 2]], [], 0, h));
  const b = m.bounds();
  return m.translate(-b.min[0], -b.min[1], 0);
}
