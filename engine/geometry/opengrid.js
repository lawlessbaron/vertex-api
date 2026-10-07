// openGrid: the wall and desk mounting grid by David D (CC BY 4.0,
// opengrid.world). Boards, snaps and accessories built to the published
// interface: a 28 mm grid of octagonal cells with a face chamfer, a 25.0 mm
// land and a 26.4 mm groove the snaps' nubs click into. Full boards are
// 6.8 mm and symmetric front to back; Lite boards are the front 4.0 mm, with
// screw holes, and take 3.4 mm Lite snaps. Dimensions follow the MIT-licensed
// openscad-opengrid library by Morgan Prior, an implementation of the
// published interface. VERTEX's parts are openGrid compatible, not official.
//
// Frames: boards and snaps are built face down (the board's front face on the
// bed, z = 0, depth into the board as +z). Accessories are built against the
// wall (x along it, y out from it, z up) and laid out to print without supports.
import { Mesh } from './mesh.js';
import { orient, triangulate, circlePolygon, extrudePolygon } from './polygon.js';
import { box, loftSolid, loftWithHoles } from './primitives.js';
import { cBand } from './systems.js';

export const OG = {
  pitch: 28, full: 6.8, lite: 4.0, liteSnap: 3.4,
  faceFlat: 25.8, landFlat: 25.0, grooveFlat: 26.4,
  chamferD: 0.4, landEndD: 1.4, grooveD: 2.4,
  corner: 28 / Math.SQRT2 - (4.2 / Math.SQRT2 + 2.6), // 14.229…: centre to the 45° corner faces
  cornerLead: 1.4,
  snapFlat: 24.8, snapFaceD: 0.4, snapCaptureD: 1.5,
  nubOut: 0.4, nubTopD: 1.4, nubBotD: 3.2, nubWedge: 0.6, nubRootW: 11.0, nubTipW: 7.1,
  skin: 0.7, slotW: 0.6, slotLen: 12.4, slitW: 0.4, anchorD: 0.6,
  // Tile-to-tile connectors: a two-lobed clip that sits half in each board, in
  // a pocket at every node along a joining edge. Lobes r 2.6 either side of the
  // seam, a slight waist at the seam (a 2.7 mm notch centred 5.1 mm off the axis)
  // to hold it, 2.4 mm tall: mid-thickness on Full boards, 1 mm behind the face on Lite.
  connLobe: 2.6, connNotchR: 2.7, connNotchOff: 5.1, connNotchV: 0.1, connH: 2.4, connLiteFromFace: 1.0,
  // Multiconnect (the slot standard on the back of many accessories): a round
  // head 20.3 mm across and 1.21 mm thick, a 45° cone down to a 15.3 mm neck, 5 mm proud in all.
  mcHeadR: 10.15, mcHeadT: 1.2121, mcNeckR: 7.65, mcProud: 5.0,
};
OG.faceCorner = OG.corner + OG.cornerLead;
OG.snapCorner = OG.corner - 0.1;
OG.snapFaceCorner = OG.faceCorner - OG.snapFaceD;

// Screws for accessories: a thread-forming screw into the snap's hole, or a heat-set insert.
export const SCREWS = {
  m3: { name: 'M3 screw (thread-forming into the snap)', snapHole: 2.7, clear: 3.4, head: 6.0 },
  m4: { name: 'M4 screw (thread-forming into the snap)', snapHole: 3.6, clear: 4.5, head: 8.0 },
  insert: { name: 'M3 heat-set insert in the snap', snapHole: 4.0, clear: 3.4, head: 6.0 },
};

// ---------- shapes ----------
/** The openGrid octagon: `flat` across the straight faces, `corner` from the centre to the 45° faces. */
export function octagon(flat, corner, cx = 0, cy = 0) {
  const a = flat / 2, b = Math.SQRT2 * corner - a;
  return [[a, -b], [a, b], [b, a], [-b, a], [-a, b], [-a, -b], [-b, -a], [b, -a]].map(([x, y]) => [cx + x, cy + y]);
}
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * A closed solid lofted through levels [{ z, outer, holes }], every level with
 * the same rings and point counts. Holes go straight through; the shape of
 * every ring may change from level to level (chamfers, grooves, countersinks).
 */
export function loftShell(levels) {
  const L = levels.map((l) => ({ z: l.z, rings: [orient(l.outer, true), ...(l.holes || []).map((h) => orient(h, false))] }));
  const lens = L[0].rings.map((r) => r.length);
  const mesh = new Mesh();
  const starts = L.map((l) => {
    const s = mesh.vertexCount;
    l.rings.forEach((r, k) => { if (r.length !== lens[k]) throw new Error('loftShell: rings change size'); for (const [x, y] of r) mesh.addVertex(x, y, l.z); });
    return s;
  });
  let off = 0;
  for (const n of lens) {
    for (let i = 0; i < L.length - 1; i++) for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n;
      mesh.addQuad(starts[i] + off + k, starts[i] + off + k1, starts[i + 1] + off + k1, starts[i + 1] + off + k);
    }
    off += n;
  }
  const cap = (l) => triangulate(l.rings[0], l.rings.slice(1)).tris;
  const bottom = cap(L[0]), top = cap(L.at(-1));
  for (let t = 0; t < bottom.length; t += 3) mesh.addTri(starts[0] + bottom[t], starts[0] + bottom[t + 2], starts[0] + bottom[t + 1]);
  const s = starts.at(-1);
  for (let t = 0; t < top.length; t += 3) mesh.addTri(s + top[t], s + top[t + 1], s + top[t + 2]);
  return mesh;
}

// ---------- the board ----------
// The cell opening as [depth, flat, corner] from the face; a Full board mirrors it at the back.
function cellProfile(t, lite) {
  const front = [[0, OG.faceFlat, OG.faceCorner], [OG.chamferD, OG.landFlat, OG.faceCorner - OG.chamferD], [OG.landEndD, OG.landFlat, OG.corner], [OG.grooveD, OG.grooveFlat, OG.corner]];
  if (lite) return [...front, [t, OG.grooveFlat, OG.corner]];
  return [...front, ...[...front].reverse().map(([d, f, c]) => [t - d, f, c])];
}

export const BOARD_DEFAULTS = { variant: 'lite', cols: 6, rows: 6, screws: 'corners', countersink: true, screwSize: 4.0, connectors: true };

/** Which interior nodes (where four cells meet) get a screw hole. */
export function screwNodes(p) {
  const nodes = [];
  if (p.variant !== 'lite' || p.screws === 'none' || p.cols < 2 || p.rows < 2) return nodes;
  for (let i = 1; i < p.cols; i++) for (let j = 1; j < p.rows; j++) {
    const corner = (i === 1 || i === p.cols - 1) && (j === 1 || j === p.rows - 1);
    if (p.screws === 'all' || (p.screws === 'corners' && corner) || (p.screws === 'every2' && i % 2 === 1 && j % 2 === 1)) nodes.push([i * OG.pitch, j * OG.pitch]);
  }
  return nodes;
}

export function board(o = {}) {
  const p = { ...BOARD_DEFAULTS, ...o };
  const lite = p.variant === 'lite', t = lite ? OG.lite : OG.full;
  const W = p.cols * OG.pitch, H = p.rows * OG.pitch;
  const outer = [[0, 0], [W, 0], [W, H], [0, H]];
  const centres = [];
  for (let i = 0; i < p.cols; i++) for (let j = 0; j < p.rows; j++) centres.push([(i + 0.5) * OG.pitch, (j + 0.5) * OG.pitch]);
  const nodes = screwNodes(p);
  // Screw holes: a countersink at the face (45°, face down on the bed, so it prints), straight after.
  const r = p.screwSize / 2, headR = Math.min(4.0, r + 1.8);
  const holeAt = (d) => (p.countersink && d < headR - r ? headR - d : r);
  const levels = cellProfile(t, lite).map(([d, flat, corner]) => ({
    z: d, outer,
    holes: [...centres.map(([cx, cy]) => octagon(flat, corner, cx, cy)), ...nodes.map(([x, y]) => circlePolygon(x, y, holeAt(d), 24))],
  }));
  // Countersink levels: make sure its end depth is a level of its own.
  if (nodes.length && p.countersink) {
    const dEnd = headR - r;
    if (!levels.some((l) => Math.abs(l.z - dEnd) < 1e-6)) {
      const prof = cellProfile(t, lite);
      const k = prof.findIndex(([d]) => d > dEnd);
      const [d0, f0, c0] = prof[k - 1], [d1, f1, c1] = prof[k];
      const u = (dEnd - d0) / (d1 - d0);
      levels.splice(k, 0, { z: dEnd, outer, holes: [...centres.map(([cx, cy]) => octagon(lerp(f0, f1, u), lerp(c0, c1, u), cx, cy)), ...nodes.map(([x, y]) => circlePolygon(x, y, r, 24))] });
    }
  }
  const pockets = p.connectors ? connectorPockets(p) : [];
  if (!pockets.length) return loftShell(levels);
  // Connector pockets: the board's outline gains a notch at each pocket between two depths.
  const [zA, zB] = lite ? [OG.connLiteFromFace, OG.connLiteFromFace + OG.connH] : [(t - OG.connH) / 2, (t + OG.connH) / 2];
  for (const z of [zA, zB]) insertLevel(levels, z, t, lite, centres, nodes, holeAt);
  return pocketedShell(levels, W, H, pockets, zA, zB);
}

/** Where the connector pockets go: every node along each edge (not the board's corners). */
export function connectorPockets(p) {
  const W = p.cols * OG.pitch, H = p.rows * OG.pitch, out = [];
  // Edge by edge, walking the outline anticlockwise: [start, direction]; the pocket goes in on the left.
  if (p.rows > 1 || p.cols > 1) {
    for (let i = 1; i < p.cols; i++) out.push({ edge: 0, x: i * OG.pitch, y: 0, dir: [1, 0] });
    for (let j = 1; j < p.rows; j++) out.push({ edge: 1, x: W, y: j * OG.pitch, dir: [0, 1] });
    for (let i = p.cols - 1; i >= 1; i--) out.push({ edge: 2, x: i * OG.pitch, y: H, dir: [-1, 0] });
    for (let j = p.rows - 1; j >= 1; j--) out.push({ edge: 3, x: 0, y: j * OG.pitch, dir: [0, -1] });
  }
  return out;
}

/**
 * Half the connector's outline, as (u, v): u along the edge, v in from it.
 * `c` shrinks it (the clip's clearance): lobe radius less, notch radius more.
 * Runs from the edge on one side, round the lobe, back to the edge on the other.
 */
export function connectorHalf(c = 0, seg = 10) {
  const L = OG.connLobe - c, R = OG.connNotchR + c, C = OG.connNotchOff, v0 = OG.connNotchV;
  const vN = v0 + Math.sqrt(R * R - (C - L) ** 2); // where the waist meets the straight side
  const side = [];
  for (let k = 0; k <= 4; k++) { const v = (vN * k) / 4; side.push([-(C - Math.sqrt(R * R - (v - v0) ** 2)), v]); }
  const lobe = [];
  for (let k = 0; k <= seg; k++) { const a = Math.PI - (Math.PI * k) / seg; lobe.push([L * Math.cos(a), OG.connLobe + L * Math.sin(a)]); }
  const left = [...side, ...lobe.slice(0, 1)];
  return [...left, ...lobe.slice(1, -1), ...[...left].reverse().map(([u, v]) => [-u, v])];
}

// Add a level at depth z, with the cells (and screw holes) interpolated to it.
function insertLevel(levels, z, t, lite, centres, nodes, holeAt) {
  if (levels.some((l) => Math.abs(l.z - z) < 1e-6)) return;
  const k = levels.findIndex((l) => l.z > z);
  const prof = cellProfile(t, lite);
  const pk = prof.findIndex(([d]) => d > z);
  const [d0, f0, c0] = prof[pk - 1], [d1, f1, c1] = prof[pk];
  const u = (z - d0) / (d1 - d0);
  const r = holeAt(z);
  levels.splice(k, 0, { z, outer: levels[0].outer, holes: [...centres.map(([cx, cy]) => octagon(lerp(f0, f1, u), lerp(c0, c1, u), cx, cy)), ...nodes.map(([x, y]) => circlePolygon(x, y, r, 24))] });
}

// The board lofted in three parts (below, through and above the pockets), sharing
// every vertex, with each pocket's floor and ceiling filled in: closed and watertight.
function pocketedShell(levels, W, H, pockets, zA, zB) {
  const mesh = new Mesh();
  const ids = new Map();
  const vid = (x, y, z) => {
    const key = `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;
    let i = ids.get(key);
    if (i === undefined) { i = mesh.addVertex(x, y, z); ids.set(key, i); }
    return i;
  };
  const half = connectorHalf(0);
  const place = (pk, [u, v]) => [pk.x + pk.dir[0] * u - pk.dir[1] * v, pk.y + pk.dir[1] * u + pk.dir[0] * v];
  // The outline, anticlockwise from (0, 0), with each pocket's two edge points (plain) or its whole notch (notched).
  const ring = (notched) => {
    const corners = [[0, 0], [W, 0], [W, H], [0, H]], out = [];
    for (let e = 0; e < 4; e++) {
      out.push(corners[e]);
      for (const pk of pockets.filter((q) => q.edge === e)) {
        const pts = notched ? half : [half[0], half.at(-1)];
        for (const q of pts) out.push(place(pk, q));
      }
    }
    return out;
  };
  const plain = ring(false), notched = ring(true);
  const loft = (lvls, outerOf) => {
    for (let i = 0; i < lvls.length - 1; i++) {
      const a = lvls[i], b = lvls[i + 1];
      const rings = [[outerOf(a), outerOf(b), true], ...a.holes.map((h, k) => [h, b.holes[k], false])];
      for (const [ra, rb, isOuter] of rings) {
        const A = orient(ra, isOuter), B = orient(rb, isOuter);
        for (let k = 0; k < A.length; k++) {
          const k1 = (k + 1) % A.length;
          const q = [vid(...A[k], a.z), vid(...A[k1], a.z), vid(...B[k1], b.z), vid(...B[k], b.z)];
          mesh.addQuad(...q);
        }
      }
    }
  };
  const below = levels.filter((l) => l.z <= zA + 1e-9), mid = levels.filter((l) => l.z >= zA - 1e-9 && l.z <= zB + 1e-9), above = levels.filter((l) => l.z >= zB - 1e-9);
  loft(below, () => plain);
  loft(mid, () => notched);
  loft(above, () => plain);
  const cap = (l, outer, up) => {
    const { coords, tris } = triangulate(outer, l.holes);
    for (let t = 0; t < tris.length; t += 3) {
      const [a, b, c] = [tris[t], tris[t + 1], tris[t + 2]].map((i) => vid(coords[i][0], coords[i][1], l.z));
      if (up) mesh.addTri(a, b, c); else mesh.addTri(a, c, b);
    }
  };
  cap(levels[0], plain, false);
  cap(levels.at(-1), plain, true);
  // Pocket floors (facing up into the pocket) and ceilings (facing down).
  for (const pk of pockets) {
    const poly = orient(half.map((q) => place(pk, q)), true);
    const tris = triangulate(poly).tris;
    for (const [z, up] of [[zA, true], [zB, false]]) {
      for (let t = 0; t < tris.length; t += 3) {
        const [a, b, c] = [tris[t], tris[t + 1], tris[t + 2]].map((i) => vid(poly[i][0], poly[i][1], z));
        if (up) mesh.addTri(a, b, c); else mesh.addTri(a, c, b);
      }
    }
  }
  return mesh;
}

export const MULTICONNECT_DEFAULTS = { count: 4, screw: 'm3', clearance: 0.15 };
/**
 * Multiconnect adapters: a Multiconnect head that screws into a screw snap, so
 * accessories with Multiconnect slots on their back hang on openGrid. Printed
 * neck down: the 45° cone widens upward and the screw's counterbore opens at the top.
 */
export function multiconnect(o = {}) {
  const p = { ...MULTICONNECT_DEFAULTS, ...o };
  const c = Math.max(0, Math.min(0.5, Number(p.clearance) || 0));
  const sc = SCREWS[p.screw] || SCREWS.m3;
  const headR = OG.mcHeadR - c, neckR = OG.mcNeckR - c;
  const zCone = OG.mcProud - OG.mcHeadT - (headR - neckR), zHead = OG.mcProud - OG.mcHeadT, zTop = OG.mcProud;
  const holeR = sc.clear / 2, boreR = sc.head / 2 + 0.3, zBore = zTop - 2.2;
  const circ = (r) => circlePolygon(0, 0, r, 48);
  const hole = (r) => circlePolygon(0, 0, r, 24);
  const levels = [
    { z: 0, outer: circ(neckR), holes: [hole(holeR)] },
    { z: zCone, outer: circ(neckR), holes: [hole(holeR)] },
    ...(zBore < zHead ? [{ z: zBore, outer: circ(neckR + (zBore - zCone)), holes: [hole(holeR)] }, { z: zBore, outer: circ(neckR + (zBore - zCone)), holes: [hole(boreR)] }] : []),
    { z: zHead, outer: circ(headR), holes: [hole(zBore < zHead ? boreR : holeR)] },
    ...(zBore >= zHead ? [{ z: zBore, outer: circ(headR), holes: [hole(holeR)] }, { z: zBore, outer: circ(headR), holes: [hole(boreR)] }] : []),
    { z: zTop, outer: circ(headR), holes: [hole(boreR)] },
  ];
  const one = loftShell(levels);
  const n = Math.max(1, Math.min(16, Math.round(Number(p.count) || 1)));
  const mesh = new Mesh();
  const pitch = 2 * headR + 4;
  for (let i = 0; i < n; i++) { const m = new Mesh(); m.append(one); mesh.append(m.translate(headR + (i % 4) * pitch, headR + Math.floor(i / 4) * pitch, 0)); }
  return mesh;
}

export const CONNECTOR_DEFAULTS = { count: 8, clearance: 0.15, heightClearance: 0.2 };
/** Tile-to-tile connectors, laid flat in a row: `count` of them, `clearance` smaller all round. */
export function connectors(o = {}) {
  const p = { ...CONNECTOR_DEFAULTS, ...o };
  const c = Math.max(0, Math.min(0.5, Number(p.clearance) || 0));
  const h = OG.connH - 2 * Math.max(0, Math.min(0.5, Number(p.heightClearance) || 0));
  const halfPts = connectorHalf(c);
  // The whole clip: this half (v up from the seam) and its mirror (v down).
  const whole = [...halfPts.map(([u, v]) => [u, v]), ...halfPts.slice(1, -1).reverse().map(([u, v]) => [u, -v])];
  const mesh = new Mesh();
  const n = Math.max(1, Math.min(40, Math.round(Number(p.count) || 1)));
  const perRow = Math.min(n, 10), pitchX = 2 * OG.connLobe + 3, pitchY = 4 * OG.connLobe + 3;
  for (let i = 0; i < n; i++) {
    const cx = (i % perRow) * pitchX, cy = Math.floor(i / perRow) * pitchY;
    mesh.append(extrudePolygon(whole.map(([u, v]) => [cx + u, cy + v]), [], 0, h));
  }
  const b = mesh.bounds();
  return mesh.translate(-b.min[0], -b.min[1], 0);
}

// ---------- snaps ----------
export const SNAP_DEFAULTS = { variant: 'full', nubs: true, cornerClearance: 0, kind: 'plain', screw: 'm3', woodScrew: 4.0 };

// The snap's outline at a depth: the octagon, with the four relief cuts once past the front anchor.
function snapOutline(corner, relieved) {
  const a = OG.snapFlat / 2, b = Math.SQRT2 * corner - a;
  if (!relieved) return octagon(OG.snapFlat, corner);
  const xin = a - OG.skin - OG.slotW, yEdge = OG.slotLen / 2 + OG.slitW / 2; // the slits' outer edges, 6.4 mm from the middle
  // One flat's run: along +x flat from y = -b to +b, with the U cut in the middle. Rotated for the other three.
  const flatRun = [[a, -b], [a, -yEdge], [xin, -yEdge], [xin, yEdge], [a, yEdge], [a, b]];
  const rot = (pts, q) => pts.map(([x, y]) => (q === 0 ? [x, y] : q === 1 ? [-y, x] : q === 2 ? [-x, -y] : [y, -x]));
  return [0, 1, 2, 3].flatMap((q) => rot(flatRun, q));
}

/** One snap, face down: front plate at z = 0, body to the snap's depth. */
export function snap(o = {}) {
  const p = { ...SNAP_DEFAULTS, ...o };
  const t = p.variant === 'lite' ? OG.liteSnap : OG.full;
  const fc = OG.snapFaceCorner - p.cornerClearance, bc = OG.snapCorner - p.cornerClearance;
  const cornerAt = (d) => (d <= OG.snapFaceD ? fc : d >= OG.snapCaptureD ? bc : lerp(fc, bc, (d - OG.snapFaceD) / (OG.snapCaptureD - OG.snapFaceD)));
  const nubs = p.nubs !== false;
  // A hole through the middle: for a screw (plain hole), to fix the board to the wall (countersunk at the face),
  // or `holeR` across (the Tectonic Deck adapter's lug pocket).
  const hole = p.holeR ? { r: p.holeR, head: 0 } : p.kind === 'screw' ? { r: SCREWS[p.screw]?.snapHole / 2 || 1.35, head: 0 } : p.kind === 'mount' ? { r: p.woodScrew / 2, head: Math.min(4.6, p.woodScrew / 2 + 2) } : null;
  const holeRing = (d) => (hole ? [circlePolygon(0, 0, hole.head && d < hole.head - hole.r ? hole.head - d : hole.r, 24)] : []);
  const depths = [0, OG.snapFaceD];
  if (hole?.head) depths.push(hole.head - hole.r);
  depths.push(nubs ? OG.anchorD : 0.6, OG.snapCaptureD, t);
  const ds = [...new Set(depths.map((d) => Math.round(d * 1000) / 1000))].filter((d) => d <= t).sort((a, b) => a - b);
  const m = new Mesh();
  // In front of the relief cuts: solid octagon. Behind: the notched outline, plus four flexing tabs.
  const front = ds.filter((d) => d <= OG.anchorD || !nubs);
  m.append(loftShell(front.map((d) => ({ z: d, outer: octagon(OG.snapFlat, cornerAt(d)), holes: holeRing(d) }))));
  if (nubs) {
    const back = ds.filter((d) => d >= OG.anchorD);
    m.append(loftShell(back.map((d) => ({ z: d, outer: snapOutline(cornerAt(d), true), holes: holeRing(d) }))));
    const a = OG.snapFlat / 2, tabIn = a - OG.skin, half = OG.slotLen / 2 - OG.slitW / 2; // the tab between the slits: 0.7 mm skin, 12 mm long
    for (let q = 0; q < 4; q++) {
      const tab = new Mesh();
      tab.append(box(tabIn, -half, OG.anchorD - 0.01, a, half, t));
      // The nub: a lens that cams in and wedges in the groove. Built along +x, then turned.
      const zMid = (OG.nubTopD + OG.nubBotD) / 2, hRoot = OG.nubBotD - OG.nubTopD, hTip = hRoot - 2 * OG.nubWedge;
      tab.append(nubSolid(a - 0.01, a + OG.nubOut, OG.nubRootW, OG.nubTipW, zMid, hRoot, hTip));
      const P = tab.positions;
      for (let k = 0; k < P.length; k += 3) {
        const [x, y] = [P[k], P[k + 1]];
        const [nx, ny] = q === 0 ? [x, y] : q === 1 ? [-y, x] : q === 2 ? [-x, -y] : [y, -x];
        P[k] = nx; P[k + 1] = ny;
      }
      m.append(tab);
    }
  }
  return m;
}
// A frustum from a rectangle at x0 (width w0, height h0) to one at x1 (w1, h1), centred on y = 0, z = zMid.
function nubSolid(x0, x1, w0, w1, zMid, h0, h1) {
  const m = new Mesh();
  const r0 = [[x0, -w0 / 2, zMid - h0 / 2], [x0, w0 / 2, zMid - h0 / 2], [x0, w0 / 2, zMid + h0 / 2], [x0, -w0 / 2, zMid + h0 / 2]];
  const r1 = [[x1, -w1 / 2, zMid - h1 / 2], [x1, w1 / 2, zMid - h1 / 2], [x1, w1 / 2, zMid + h1 / 2], [x1, -w1 / 2, zMid + h1 / 2]];
  const v0 = r0.map((p) => m.addVertex(...p)), v1 = r1.map((p) => m.addVertex(...p));
  m.addQuad(v0[0], v0[3], v0[2], v0[1]); // back (faces -x)
  m.addQuad(v1[0], v1[1], v1[2], v1[3]); // tip (faces +x)
  for (let k = 0; k < 4; k++) { const k1 = (k + 1) % 4; m.addQuad(v0[k], v0[k1], v1[k1], v1[k]); }
  return m;
}

/** Snaps in a row, ready to print: `count` of them, 3 mm apart. */
export function snapSheet(o = {}, count = 4) {
  const m = new Mesh(), step = OG.snapFlat + 3;
  const per = Math.ceil(Math.sqrt(count));
  for (let i = 0; i < count; i++) m.append(snap(o).translate((i % per) * step, Math.floor(i / per) * step, 0));
  const b = m.bounds();
  return m.translate(-b.min[0], -b.min[1], -b.min[2]);
}

// ---------- accessories ----------
// Each has a back plate that sits flat on the board, screwed through into snaps
// at cell centres. Built against the wall: x along it, y out, z up.
export const ACC_DEFAULTS = { clipDrop: 15, bundle: 16, trayCells: 16, trayHeight: 45, trayPieces: 2, hangDrop: 45, hangReach: 60, railCells: 6, drawerCells: 4, drawerHeight: 60, item: 'hook', mount: 'screw', screw: 'm3', cells: 2, plate: 3, hookLength: 45, hookRise: 14, hookThickness: 5, shelfDepth: 70, shelfLip: 8, binDepth: 45, binHeight: 56, rackDepth: 45, slots: 5, slotWidth: 12 };
const teardropXZ = (cx, cz, r, n = 16) => {
  // A round hole with a 45° point at the top (+z), so a flat-lying hole prints without support.
  const pts = [];
  for (let k = 0; k <= n; k++) { const a = Math.PI / 4 - (k / n) * (Math.PI * 1.5); pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]); } // from upper right, round the bottom, to upper left
  pts.push([cx, cz + r * Math.SQRT2]);
  return pts.reverse();
};
// A back plate `cols` cells wide and `rows` tall with a screw hole at each cell centre, as an outline in x-z.
function plate(p, cols, rows, holePoint = 'z') {
  const W = cols * OG.pitch - 0.5, H = rows * OG.pitch - 0.5, r = SCREWS[p.screw].clear / 2;
  const holes = [];
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const cx = (i + 0.5) * OG.pitch - W / 2 - 0.25, cz = (j + 0.5) * OG.pitch - 0.25;
    holes.push(holePoint === 'x' ? teardropXZ(cz, cx, r).map(([z, x]) => [x, z]) : teardropXZ(cx, cz, r));
  }
  return { W, H, outer: [[-W / 2, 0], [W / 2, 0], [W / 2, H], [-W / 2, H]], holes };
}
// A plate as a solid, from y = 0 (against the board) to y = thickness.
const plateSolid = (pl, t) => {
  const m = extrudePolygon(pl.outer, pl.holes, 0, t);
  const P = m.positions;
  for (let k = 0; k < P.length; k += 3) { const [x, y, z] = [P[k], P[k + 1], P[k + 2]]; P[k] = x; P[k + 1] = z; P[k + 2] = y; }
  for (let t2 = 0; t2 < m.indices.length; t2 += 3) { const b = m.indices[t2 + 1]; m.indices[t2 + 1] = m.indices[t2 + 2]; m.indices[t2 + 2] = b; }
  return m;
};
// A profile [y, z] extruded along x.
function prism(profile, x0, x1) {
  const m = extrudePolygon(profile, [], x0, x1);
  const P = m.positions;
  for (let k = 0; k < P.length; k += 3) { const [a, b, c] = [P[k], P[k + 1], P[k + 2]]; P[k] = c; P[k + 1] = a; P[k + 2] = b; }
  return m;
}
// The Multiconnect slot, as a notch in the plate's back face (x across, y into the plate):
// 18.0 mm at the face, widening at 45° to 20.3 mm 1.14 mm in, 2.35 mm deep.
export const MC_SLOT = { faceHalf: 10.15 - (2.35 - 1.2121), innerHalf: 10.15, undercut: 2.35 - 1.2121, depth: 2.35 };
export const MC_PLATE = 5; // back plate thickness with slots: 2.35 of slot and the rest behind it
// A back plate with a Multiconnect slot up each column, open at the bottom and stopping so a
// head at a cell centre sits against the stop. Built from stacked prisms (wall frame).
function mcPlateSolid(pl, cols, t) {
  const S = MC_SLOT, W = pl.W, H = pl.H;
  const xs = Array.from({ length: cols }, (_, i) => (i + 0.5) * OG.pitch - W / 2 - 0.25);
  const topCell = (Math.floor(H / OG.pitch) - 0.5) * OG.pitch - 0.25;
  const zStop = Math.min(H - 1.5, topCell + S.innerHalf);
  const section = [[-W / 2, 0]];
  for (const xc of xs) section.push([xc - S.faceHalf, 0], [xc - S.innerHalf, S.undercut], [xc - S.innerHalf, S.depth], [xc + S.innerHalf, S.depth], [xc + S.innerHalf, S.undercut], [xc + S.faceHalf, 0]);
  section.push([W / 2, 0], [W / 2, t], [-W / 2, t]);
  const lower = extrudePolygon(section, [], 0, zStop); // x-y section, z up: already the wall frame
  const upper = extrudePolygon([[-W / 2, 0], [W / 2, 0], [W / 2, t], [-W / 2, t]], [], zStop, H);
  const m = new Mesh();
  m.append(lower); m.append(upper);
  return m;
}
const bed = (m) => { const b = m.bounds(); return m.translate(-b.min[0], -b.min[1], -b.min[2]); };
// Wall frame laid on its side: x (along the wall) becomes up. Holes in the plate were made with their point towards +x.
const onSide = (m) => {
  const P = m.positions;
  for (let k = 0; k < P.length; k += 3) { const [x, y, z] = [P[k], P[k + 1], P[k + 2]]; P[k] = -z; P[k + 1] = y; P[k + 2] = x; }
  return bed(m);
};

export function accessory(o = {}) {
  const p = { ...ACC_DEFAULTS, ...o };
  const mc = p.mount === 'multiconnect';
  const t = mc ? Math.max(p.plate, MC_PLATE) : p.plate;
  const back = (pl, cols) => (mc ? mcPlateSolid(pl, cols, t) : plateSolid(pl, t));
  if (p.item === 'hook' || p.item === 'shelf') {
    // Printed on its side: the arm runs along the layers. One cell wide (hook) or `cells` wide (shelf), two cells tall.
    const cols = p.item === 'hook' ? 1 : Math.max(1, p.cells);
    // Printed upright (Multiconnect), a shelf's 45° bracket needs the plate as tall as the shelf is deep.
    const rows = mc && p.item === 'shelf' ? Math.max(2, Math.ceil((p.shelfDepth + 4.5) / OG.pitch)) : 2;
    const pl = plate(p, cols, rows, 'x');
    const m = back(pl, cols);
    const W = pl.W, H = pl.H;
    if (p.item === 'hook') {
      const L = p.hookLength, R = p.hookRise, th = p.hookThickness;
      m.append(prism([[t - 0.01, 0], [t + L, 0], [t + L, R], [t + L - th, R], [t + L - th, th], [t - 0.01, th]], -W / 2, W / 2));
    } else {
      const D = p.shelfDepth, th = 4, lip = p.shelfLip, zb = Math.max(0, H - th - D), e = H - th - zb;
      const prof = [[t - 0.01, zb], [t - 0.01 + e, H - th], [t + D, H - th], ...(lip ? [[t + D, H + lip], [t + D - th, H + lip], [t + D - th, H]] : [[t + D, H]]), [t - 0.01, H]];
      m.append(prism(prof.filter((q, i) => i === 0 || Math.hypot(q[0] - prof[i - 1][0], q[1] - prof[i - 1][1]) > 1e-6), -W / 2, W / 2));
    }
    // With Multiconnect slots it prints upright (the slots' undercut would need support on its side).
    return mc ? bed(m) : onSide(m);
  }
  if (p.item === 'headphone') return headphoneHanger(p);
  if (p.item === 'rails') return drawerRails(p);
  if (p.item === 'drawer') return underDrawer(p);
  if (p.item === 'keyboard') return keyboardTray(p);
  if (p.item === 'cableClip') return underClip(p);
  if (p.item === 'bin') {
    // Upright: the floor on the bed, the plate standing at the back with pointed-top screw holes.
    const cols = Math.max(1, p.cells), rows = Math.max(1, Math.round(p.binHeight / OG.pitch));
    const pl = plate(p, cols, rows, 'z');
    const m = back(pl, cols);
    const W = pl.W, D = p.binDepth, Hb = Math.min(pl.H, p.binHeight), wall = 1.8;
    const outer = { cx: 0, cy: t + D / 2 - 0.01, w: W, d: D, r: 3 };
    m.append(loftSolid([{ z: 0, rect: outer }, { z: 1.6, rect: outer }], 6));
    m.append(loftWithHoles([{ z: 1.59, rect: outer }, { z: Hb, rect: outer }], [rrect(-W / 2 + wall, t + wall - 0.01, W / 2 - wall, t + D - wall, 1.5)], 6));
    return bed(m);
  }
  // Tool rack: fingers with 45° undersides, slots open to the front. Upright.
  const need = Math.ceil((p.slots * p.slotWidth + (p.slots + 1) * 5) / OG.pitch);
  const cols = Math.max(2, p.cells, need), pl = plate(p, cols, 2, 'z');
  const m = back(pl, cols);
  const W = pl.W, H = pl.H, D = p.rackDepth, n = p.slots, sw = p.slotWidth, th = 8;
  const fw = Math.max(4, (W - n * sw) / (n + 1));
  for (let i = 0; i <= n; i++) {
    const x0 = -W / 2 + i * (fw + sw);
    m.append(prism([[t - 0.01, H - th - D], [t + D, H - th], [t + D, H], [t - 0.01, H]], x0, Math.min(W / 2, x0 + fw)));
  }
  return bed(m);
}
const rrect = (x0, y0, x1, y1, r, seg = 4) => {
  const pts = [];
  const c = [[x1 - r, y1 - r, 0], [x0 + r, y1 - r, Math.PI / 2], [x0 + r, y0 + r, Math.PI], [x1 - r, y0 + r, 1.5 * Math.PI]];
  for (const [cx, cy, a0] of c) for (let k = 0; k <= seg; k++) { const a = a0 + (k / seg) * (Math.PI / 2); pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return pts;
};

// ---------------------------------------------------------------------------
// Under the desk. A Lite board screwed to the underside of a desk is a wall
// facing the floor: in the wall frame, y (out from the board) is down and z
// (along the board) runs towards the front of the desk.

// Mirrors a mesh across one axis (0, 1 or 2), keeping it inside out the right way.
const mirror = (m, axis) => {
  const P = m.positions;
  for (let k = axis; k < P.length; k += 3) P[k] = -P[k];
  for (let t = 0; t < m.indices.length; t += 3) { const b = m.indices[t + 1]; m.indices[t + 1] = m.indices[t + 2]; m.indices[t + 2] = b; }
  return m;
};

/**
 * A headphone hanger: a plate two cells long, a stem dropping `hangDrop` mm
 * below the board, and an arm reaching `hangReach` mm towards the front with
 * a lip at its end so the headband can't slide off. Braced at both corners.
 * Printed on its side, so the stem and arm run along the layers.
 */
function headphoneHanger(p) {
  const cols = Math.max(1, Math.min(2, p.cells)), pl = plate(p, cols, 2, 'x'), t = p.plate;
  const m = plateSolid(pl, t), W = pl.W;
  const D = p.hangDrop, R = Math.max(p.hangReach, 30), th = 6, lip = 8;
  m.append(prism([[t - 0.01, 0], [t + D, 0], [t + D, R], [t + D - th - lip, R], [t + D - th - lip, R - th], [t + D - th, R - th], [t + D - th, th], [t - 0.01, th]], -W / 2, W / 2));
  m.append(prism([[t - 0.01, th - 0.01], [t + 10, th - 0.01], [t - 0.01, th + 10]], -W / 2, W / 2));
  const g = t + D - th + 0.01;
  m.append(prism([[g, th - 0.01], [g, th + 8], [g - 8, th - 0.01]], -W / 2, W / 2));
  return onSide(m);
}

// The drawer slide: a dovetail. Each rail is one cell wide and `railCells`
// long, with a stem at its outer edge and a flange with a 45° top that the
// drawer's lip rides on. Numbers are from the rail cell's outer edge (x0).
export const DRAWER_SLIDE = { stem: 3, lipGap: 0.6, lip: 3, lipW: 10, side: 0.6, below: 0.8, flangeT: 3, stop: 3 };
const slide = () => {
  const S = DRAWER_SLIDE, lipTip = S.stem + S.side, wall = lipTip + S.lipW, tip = wall - S.below;
  return { ...S, lipTip, wall, tip };
};
/** How wide the drawer is (outside its walls) when the rails are `cells` cells apart, centre to centre. */
export const drawerWidth = (cells) => cells * OG.pitch + 2 * (OG.pitch / 2 - 0.25 - slide().wall);

function oneRail(p) {
  const S = slide(), t = p.plate, rows = Math.max(2, p.railCells);
  const pl = plate(p, 1, rows, 'x'), W = pl.W, L = pl.H, x0 = -W / 2;
  const m = plateSolid(pl, t);
  const top = t + S.lipGap + S.lip; // the underside of the drawer's lip at its tip
  const yF = (x) => top + S.below + (x - (x0 + S.lipTip)); // the flange's 45° top
  const yb = yF(x0 + S.tip) + S.flangeT;
  m.append(extrudePolygon([[x0, t - 0.01], [x0 + S.stem, t - 0.01], [x0 + S.stem, yF(x0 + S.stem)], [x0 + S.tip, yF(x0 + S.tip)], [x0 + S.tip, yb], [x0, yb]], [], 0, L));
  // A stop across the channel at the back, so the drawer can't slide through.
  m.append(extrudePolygon([[x0 + S.stem - 0.01, t - 0.01], [x0 + S.tip, t - 0.01], [x0 + S.tip, yb - 0.01], [x0 + S.stem - 0.01, yb - 0.01]], [], L - S.stop, L));
  return m;
}
/** A pair of rails, left and right (mirror images), laid out to print on their sides without supports. */
function drawerRails(p) {
  const left = onSide(oneRail(p)), right = bed(mirror(onSide(oneRail(p)), 0));
  const b = left.bounds().size;
  const m = new Mesh();
  m.append(left); m.append(right.translate(0, b[1] + 6, 0));
  return bed(m);
}

/**
 * The drawer that slides into the rails: open-topped, a dovetail lip down
 * each side with a 45° underside, and a pull on the front. Upright, no supports.
 */
function underDrawer(p) {
  const S = slide(), n = Math.max(2, p.drawerCells), Wd = drawerWidth(n);
  const Dd = Math.max(2, p.railCells) * OG.pitch - 0.5 - S.stop - 1, Hd = Math.max(30, p.drawerHeight), wall = 1.8, fl = 1.6;
  const outer = { cx: 0, cy: Dd / 2, w: Wd, d: Dd, r: 1 };
  const m = new Mesh();
  m.append(loftSolid([{ z: 0, rect: outer }, { z: fl, rect: outer }], 4));
  m.append(loftWithHoles([{ z: fl - 0.01, rect: outer }, { z: Hd, rect: outer }], [rrect(-Wd / 2 + wall, wall, Wd / 2 - wall, Dd - wall, 1)], 4));
  // Lips: a section in x-z run along y (front to back).
  const along = (sec) => { const e = extrudePolygon(sec, [], 0, Dd); const P = e.positions; for (let k = 0; k < P.length; k += 3) { const y = P[k + 1]; P[k + 1] = P[k + 2]; P[k + 2] = y; } return mirror(e, 1).translate(0, Dd, 0); };
  const x = -Wd / 2 + 0.01;
  const lipSec = [[x, Hd - S.lip - S.lipW], [x - S.lipW - 0.01, Hd - S.lip], [x - S.lipW - 0.01, Hd], [x, Hd]];
  m.append(along(lipSec));
  m.append(along(lipSec.map(([a, z]) => [-a, z]).reverse()));
  // A pull under the front edge's middle: 45° underneath, flat on top.
  const pw = Math.min(70, Wd - 20), zh = Hd * 0.55;
  m.append(prism([[0.01, zh - 12], [0.01, zh + 3], [-12, zh + 3], [-12, zh]], -pw / 2, pw / 2));
  return bed(m);
}

/**
 * A keyboard tray on the same rails: wider than any bed, so it comes in
 * `trayPieces` pieces that drop together on dovetail tabs in the floor (glue
 * them). The outer pieces have the side walls with the drawer's dovetail lip;
 * a lip along the front and a taller back edge run across every piece and
 * stiffen it. Each piece prints floor down with no supports.
 */
export const TRAY = { floor: 4, front: 10, back: 14, edge: 3, side: 3, tabNeck: 10, tabHead: 16, tabLen: 8, fit: 0.2 };
export function trayCuts(p) {
  const n = Math.max(6, p.trayCells), Wd = drawerWidth(n), k = Math.max(1, Math.min(4, Math.round(p.trayPieces)));
  return Array.from({ length: k + 1 }, (_, i) => -Wd / 2 + (i * Wd) / k);
}
function keyboardTray(p) {
  const S = slide(), T = TRAY, n = Math.max(6, p.trayCells), Wd = drawerWidth(n);
  const Dd = Math.max(4, p.railCells) * OG.pitch - 0.5 - S.stop - 1, Hd = Math.max(25, p.trayHeight);
  const xs = trayCuts(p), k = xs.length - 1;
  const m = Math.max(2, Math.round(Dd / 60)), ys = Array.from({ length: m }, (_, j) => (Dd * (j + 0.5)) / m);
  const nh = T.tabNeck / 2, hh = T.tabHead / 2, c = T.fit;
  const out = new Mesh();
  let offset = 0;
  for (let i = 0; i < k; i++) {
    const xl = xs[i], xr = xs[i + 1], piece = new Mesh();
    // The floor: tabs out of the right edge, sockets into the left.
    const outline = [[xl, 0], [xr, 0]];
    if (i < k - 1) for (const yc of ys) outline.push([xr, yc - nh], [xr + T.tabLen, yc - hh], [xr + T.tabLen, yc + hh], [xr, yc + nh]);
    outline.push([xr, Dd], [xl, Dd]);
    if (i > 0) for (const yc of [...ys].reverse()) outline.push([xl, yc + nh + c], [xl + T.tabLen + c, yc + hh + c], [xl + T.tabLen + c, yc - hh - c], [xl, yc - nh - c]);
    // Windows through the floor, in a grid clear of the joints, walls and edges: half the plastic.
    const win = [], cell = 30, rib = 7, x0 = xl + (i > 0 ? T.tabLen + 6 : T.side + 6), x1 = xr - 6 - (i === k - 1 ? T.side : 0);
    const y0 = T.edge + 8, y1 = Dd - T.edge - 8, nx = Math.floor((x1 - x0 + rib) / cell), ny = Math.floor((y1 - y0 + rib) / cell);
    const sx = x0 + (x1 - x0 - (nx * cell - rib)) / 2, sy = y0 + (y1 - y0 - (ny * cell - rib)) / 2;
    for (let a = 0; a < nx; a++) for (let b = 0; b < ny; b++) {
      const wx = sx + a * cell, wy = sy + b * cell;
      if (ys.some((yc) => Math.abs(wy + (cell - rib) / 2 - yc) < hh + (cell - rib) / 2 + 3) && (wx < xl + T.tabLen + 10 || wx + cell - rib > xr - 4)) continue;
      win.push(rrect(wx, wy, wx + cell - rib, wy + cell - rib, 3).reverse());
    }
    piece.append(extrudePolygon(outline, win, 0, T.floor));
    // Front lip and back edge, across the piece.
    piece.append(extrudePolygon([[xl, 0], [xr, 0], [xr, T.edge], [xl, T.edge]], [], T.floor - 0.01, T.front));
    piece.append(extrudePolygon([[xl, Dd - T.edge], [xr, Dd - T.edge], [xr, Dd], [xl, Dd]], [], T.floor - 0.01, T.back));
    // Side walls with the dovetail lip on the outer pieces.
    for (const [edge, s] of [[i === 0, -1], [i === k - 1, 1]]) {
      if (!edge) continue;
      const xw = (s * Wd) / 2, xin = xw - s * T.side;
      piece.append(extrudePolygon(s < 0 ? [[xw, 0], [xin, 0], [xin, Dd], [xw, Dd]] : [[xin, 0], [xw, 0], [xw, Dd], [xin, Dd]], [], T.floor - 0.01, Hd));
      const x = xw - s * 0.01;
      const lip = [[x, Hd - S.lip - S.lipW], [x + s * (S.lipW + 0.01), Hd - S.lip], [x + s * (S.lipW + 0.01), Hd], [x, Hd]];
      const sec = s < 0 ? lip : lip.map((q) => q).reverse();
      const e = extrudePolygon(sec, [], 0, Dd), P = e.positions;
      for (let q = 0; q < P.length; q += 3) { const y = P[q + 1]; P[q + 1] = P[q + 2]; P[q + 2] = y; }
      piece.append(mirror(e, 1).translate(0, Dd, 0));
    }
    // Lay the pieces out one behind the other, each at the origin.
    const b = piece.bounds();
    out.append(piece.translate(-b.min[0], offset - b.min[1], -b.min[2]));
    offset += b.size[1] + 8;
  }
  return out;
}

/**
 * A cable clip for under the desk: a one-cell plate, a short stem, and a ring
 * open towards the front, so cables push in sideways and their weight keeps
 * them in. For the run from the desk to a monitor arm or the floor. On its side.
 */
function underClip(p) {
  const pl = plate(p, 1, 1, 'x'), t = p.plate, W = pl.W, zc = pl.H / 2;
  const m = plateSolid(pl, t), rc = p.bundle / 2 + 0.3, wall = 2.6, yc = t + p.clipDrop + rc + wall - 0.6;
  m.append(prism([[t - 0.01, zc - 3.5], [yc - rc - wall / 2, zc - 3.5], [yc - rc - wall / 2, zc + 3.5], [t - 0.01, zc + 3.5]], -W / 2, W / 2));
  m.append(prism(cBand(yc, zc, rc, wall, 0.7 * 2 * rc, Math.PI / 2), -W / 2, W / 2));
  return onSide(m);
}
