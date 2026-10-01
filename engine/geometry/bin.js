import { Mesh } from './mesh.js';
import { SPEC } from './spec.js';
import { box, extrudeX, extrudeY, loftPolygons, loftRing, loftSolid, loftWithHoles, notchedRing, ribbedCircle } from './primitives.js';
import { circlePolygon, extrudePolygon } from './polygon.js';
import { markAt, MARK_HEIGHT, MARK_WIDTH } from './brand.js';
import { fitText, textMesh } from './font.js';

export const BIN_DEFAULTS = {
  gridX: 2, // may be a half unit, e.g. 1.5
  gridY: 1,
  heightMode: 'units', // 'units' (7 mm steps) or 'mm' (outside height, without the lip)
  heightUnits: 6,
  heightMm: 42,
  pitchX: SPEC.pitch,
  pitchY: SPEC.pitch,
  heightUnit: SPEC.heightUnit,
  halfGrid: false, // feet on a 21 mm grid
  outerWall: true, // false: feet and floor only, no outer wall or lip (a base for things that stand on it)
  wall: 1.2,
  floor: 2.25, // above the feet; 2.25 puts the floor at the spec's 7 mm
  lip: true,
  lite: false,
  liteShell: 1.2,
  solid: false, // fill the cavity (a blank to cut into)
  divisionsX: 1,
  divisionsY: 1,
  // Compartment sizes, left to right (widthsX) and front to back (depthsY), as
  // proportions ("1,2,1") of the inside. Empty = equal. Set, they win over divisions.
  widthsX: '',
  depthsY: '',
  divider: 1.2,
  dividerHeight: 100, // % of the inside height
  scoop: 0,
  scoopSides: 'front', // front | both (front and back) | all (every side): a fillet to slide parts out
  notch: 0, // finger notch in the front wall, width in mm; 0 = none
  notchDepth: 15, // how far the notch reaches down from the top
  labelTab: 0, // shelf depth (mm); 0 = none
  labelStyle: 'full', // full | left | center | right
  labelWidth: 0, // mm for left/center/right shelves; 0 = automatic
  labelSide: 'back', // back | front of each row
  labelAngle: 40, // support angle from vertical: up to 42 prints without supports, lower is steeper
  labelWhere: 'all', // all | row (back row only) | first (back-left compartment only)
  labels: '', // one label per compartment, one per line (back row first, left to right)
  labelTextHeight: 4, // mm; 0 = as big as fits
  slotsX: 0, // movable divider slots along the width
  slotsY: 0, // movable divider slots along the depth
  slotPlate: 1.2, // divider plate thickness
  platesX: 0, // plates to print for the width slots; 0 = one per slot
  platesY: 0,
  holes: 'none', // none | magnet | screw | both
  crushRibs: true,
  onlyCorners: false,
  brandMark: true, // raised Mint Motive mark on the floor
  segments: 6,
};

// Inset of the foot outline at height z (0 at the top of the profile).
function footInset(z) {
  const p = SPEC.footProfile;
  if (z <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) {
    if (z <= p[i][0]) {
      const [z0, i0] = p[i - 1], [z1, i1] = p[i];
      return i0 + ((i1 - i0) * (z - z0)) / (z1 - z0);
    }
  }
  return 0;
}

// Foot levels between za and zb, including every profile corner in between.
export function footLevels(cx, cy, w, d, za = 0, zb = SPEC.baseHeight, inset = 0) {
  const zs = [za, ...SPEC.footProfile.map(([z]) => z).filter((z) => z > za + 1e-6 && z < zb - 1e-6), zb];
  return zs.map((z) => {
    const i = footInset(z) + inset;
    return { z, rect: { cx, cy, w: w - 2 * i, d: d - 2 * i, r: Math.max(SPEC.binRadius - i, 0.3) } };
  });
}

// Key dimensions shared by the bin generators.
export function binFrame(options = {}) {
  const o = { ...BIN_DEFAULTS, ...options };
  const W = o.gridX * o.pitchX - SPEC.clearance;
  const D = o.gridY * o.pitchY - SPEC.clearance;
  const H = o.heightMode === 'mm' ? Math.max(o.heightMm, SPEC.baseHeight + 4) : o.heightUnits * o.heightUnit;
  const t = Math.min(o.wall, 2.5);
  const floorTop = Math.min(SPEC.baseHeight + (o.lite ? Math.min(o.floor, 1) : o.floor), H - 1);
  return { W, D, H, t, floorTop };
}

// Foot cells: whole units, half units at the edges, or a full half-grid.
export function footCells(o) {
  const cells = [];
  const along = (n, pitch) => {
    const out = [];
    if (o.halfGrid) {
      const k = Math.round(n * 2);
      for (let i = 0; i < k; i++) out.push([(i + 0.5) * (pitch / 2), pitch / 2]);
    } else {
      for (let i = 0; i < Math.ceil(n - 1e-6); i++) {
        const w = Math.min(1, n - i) * pitch;
        out.push([i * pitch + w / 2, w]);
      }
    }
    return out;
  };
  const xs = along(o.gridX, o.pitchX), ys = along(o.gridY, o.pitchY);
  const ox = (o.gridX * o.pitchX) / 2, oy = (o.gridY * o.pitchY) / 2;
  xs.forEach(([x, w], i) => ys.forEach(([y, d], j) => {
    cells.push({ cx: x - ox, cy: y - oy, w: w - SPEC.clearance, d: d - SPEC.clearance, first: [i === 0, j === 0], last: [i === xs.length - 1, j === ys.length - 1] });
  }));
  return cells;
}

// Magnet/screw hole centres for one foot, 13 mm from the centre on a 42 mm foot.
function holeCentres(cell, o) {
  if (cell.w < 30 || cell.d < 30) return [];
  const ox = (cell.w + SPEC.clearance) / 2 - SPEC.holeFromEdge;
  const oy = (cell.d + SPEC.clearance) / 2 - SPEC.holeFromEdge;
  const out = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    if (o.onlyCorners && !((sx < 0 ? cell.first[0] : cell.last[0]) && (sy < 0 ? cell.first[1] : cell.last[1]))) continue;
    out.push([cell.cx + sx * ox, cell.cy + sy * oy]);
  }
  return out;
}

// A Gridfinity bin built as a union of closed shells: feet, floor, walls,
// stacking lip, dividers, scoops, label tabs and the brand mark.
export function generateBin(options = {}) {
  const o = { ...BIN_DEFAULTS, ...options };
  const seg = o.segments;
  const { W, D, H, t, floorTop } = binFrame(o);
  const outline = (inset = 0) => ({ cx: 0, cy: 0, w: W - 2 * inset, d: D - 2 * inset, r: Math.max(SPEC.binRadius - inset, 0.3) });
  const mesh = new Mesh();
  const holes = o.lite ? 'none' : o.holes;
  const magnet = holes === 'magnet' || holes === 'both';
  const screw = holes === 'screw' || holes === 'both';
  const screwTop = Math.min(SPEC.screwDepth, floorTop - 0.6);
  const magnetHole = (x, y) => (o.crushRibs ? ribbedCircle(x, y, SPEC.magnetDiameter / 2, SPEC.crushRibDiameter / 2) : circlePolygon(x, y, SPEC.magnetDiameter / 2, 40));
  const screwHole = (x, y) => circlePolygon(x, y, SPEC.screwDiameter / 2, 20);
  const allScrews = [];

  // Feet: solid (optionally with holes), or hollow shells open underneath in lite mode.
  for (const cell of footCells(o)) {
    const { cx, cy, w, d } = cell;
    if (o.lite) {
      mesh.append(loftRing(footLevels(cx, cy, w, d), footLevels(cx, cy, w, d, 0, SPEC.baseHeight, o.liteShell), seg));
      // A thin cross rib from the plate up, so the floor above never bridges
      // more than half a foot (about 20 mm): no supports, a few grams at most.
      const bi = footInset(0) + o.liteShell * 0.5, rt = o.liteShell / 2;
      if (w > 24) mesh.append(box(cx - w / 2 + bi, cy - rt, 0, cx + w / 2 - bi, cy + rt, SPEC.baseHeight));
      if (d > 24) mesh.append(box(cx - rt, cy - d / 2 + bi, 0, cx + rt, cy + d / 2 - bi, SPEC.baseHeight));
      continue;
    }
    const centres = holes === 'none' ? [] : holeCentres(cell, o);
    if (!centres.length) {
      mesh.append(loftSolid(footLevels(cx, cy, w, d), seg));
      continue;
    }
    if (screw) allScrews.push(...centres);
    const breaks = [0, magnet ? SPEC.magnetDepth : null, screw ? Math.min(screwTop, SPEC.baseHeight) : null, SPEC.baseHeight]
      .filter((z) => z !== null)
      .sort((a, b) => a - b)
      .filter((z, i, a) => i === 0 || z - a[i - 1] > 0.05);
    for (let k = 0; k < breaks.length - 1; k++) {
      const za = breaks[k], zb = breaks[k + 1];
      let bandHoles = [];
      if (magnet && zb <= SPEC.magnetDepth + 1e-6) bandHoles = centres.map(([x, y]) => magnetHole(x, y));
      else if (screw && zb <= screwTop + 1e-6) bandHoles = centres.map(([x, y]) => screwHole(x, y));
      mesh.append(loftWithHoles(footLevels(cx, cy, w, d, za, zb), bandHoles, seg));
    }
  }

  // Floor spans every foot so the cells become one bin. Screw holes may reach into it.
  const floorLevels = (za, zb) => [{ z: za, rect: outline() }, { z: zb, rect: outline() }];
  if (screw && allScrews.length && screwTop > SPEC.baseHeight + 0.05) {
    mesh.append(loftWithHoles(floorLevels(SPEC.baseHeight, screwTop), allScrews.map(([x, y]) => screwHole(x, y)), seg));
    mesh.append(loftSolid(floorLevels(screwTop, floorTop), seg));
  } else {
    mesh.append(loftSolid(floorLevels(SPEC.baseHeight, floorTop), seg));
  }

  // Walls stop where the lip's support chamfer starts.
  const [lipBaseZ, lipBaseInset] = SPEC.lipProfile[0];
  const support = Math.max(lipBaseInset - t, 0);
  const wallTop = o.lip ? H - support : H;
  // A finger notch cuts the front wall (and lip) from notchZ up.
  const topZ = o.lip ? H + SPEC.lipProfile.at(-1)[0] - lipBaseZ : H;
  const notchHalf = o.notch > 0 && !o.solid ? Math.min(o.notch, W - 2 * SPEC.binRadius - 4) / 2 : 0;
  const notchZ = notchHalf >= 2 ? Math.max(floorTop + 1, topZ - o.notchDepth) : Infinity;
  const ring = (outer, inner) => {
    if (notchZ >= outer.at(-1).z - 1e-6) return mesh.append(loftRing(outer, inner, seg));
    const [ob, oa] = splitLevels(outer, notchZ);
    const [ib, ia] = splitLevels(inner, notchZ);
    if (ob.length > 1) mesh.append(loftRing(ob, ib, seg));
    mesh.append(loftPolygons(oa.map((l, k) => ({ z: l.z, pts: notchedRing(l.rect, ia[k].rect, notchHalf, seg) }))));
  };
  if (wallTop > floorTop && o.outerWall !== false) {
    const lv = (z, inset) => ({ z, rect: outline(inset) });
    ring([lv(floorTop, 0), lv(wallTop, 0)], [lv(floorTop, t), lv(wallTop, t)]);
  }

  if (o.lip && o.outerWall !== false) {
    const zs = [wallTop, ...SPEC.lipProfile.map(([z]) => H + z - lipBaseZ)];
    const insets = [t, ...SPEC.lipProfile.map(([, i]) => Math.max(i, 0.3))];
    const outer = zs.map((z) => ({ z, rect: outline() }));
    const inner = zs.map((z, k) => ({ z, rect: outline(insets[k]) }));
    if (support === 0) {
      outer.shift();
      inner.shift();
    }
    ring(outer, inner);
  }

  if (o.solid) {
    const inset = Math.max(t - 0.2, 0.2);
    mesh.append(loftSolid([{ z: floorTop, rect: outline(inset) }, { z: H, rect: outline(inset) }], seg));
    return mesh;
  }

  // Compartments.
  const x0 = -W / 2 + t, x1 = W / 2 - t;
  const y0 = -D / 2 + t, y1 = D / 2 - t;
  const dt = o.divider;
  const bx = splitBounds(x0, x1, o.divisionsX, o.widthsX), by = splitBounds(y0, y1, o.divisionsY, o.depthsY);
  const nx = bx.length - 1, ny = by.length - 1;
  // Inside parts stop just below the stacking zone so a bin on top never hits them.
  const innerTop = o.lip ? H - 0.8 : H;
  const divTop = floorTop + (innerTop - floorTop) * Math.min(1, Math.max(0.1, o.dividerHeight / 100));
  for (let i = 1; i < nx; i++) mesh.append(box(bx[i] - dt / 2, y0, floorTop, bx[i] + dt / 2, y1, divTop));
  for (let j = 1; j < ny; j++) mesh.append(box(x0, by[j] - dt / 2, floorTop, x1, by[j] + dt / 2, divTop));

  const scoopRoom = (nx > 1 || ny > 1 ? divTop : innerTop) - floorTop - 0.5;
  if (o.scoopSides === 'all' && o.scoop > 0.5) {
    for (let i = 0; i < nx; i++) {
      const c0 = bx[i] + (i > 0 ? dt / 2 : 0);
      const c1 = bx[i + 1] - (i < nx - 1 ? dt / 2 : 0);
      const R = Math.min(o.scoop, (c1 - c0) / 2, scoopRoom);
      if (R <= 0.5) continue;
      mesh.append(extrudeY(fillet(c0, 1, R, floorTop), y0, y1));
      mesh.append(extrudeY(fillet(c1, -1, R, floorTop), y0, y1));
    }
  }

  const labelSpots = [];
  for (let j = 0; j < ny; j++) {
    const rowFront = by[j] + (j > 0 ? dt / 2 : 0);
    const rowBack = by[j + 1] - (j < ny - 1 ? dt / 2 : 0);
    const rowDepth = rowBack - rowFront;

    const R = Math.min(o.scoop, rowDepth / 2, scoopRoom);
    if (R > 0.5) {
      // Concave fillet between the floor and the row's front (and back) face.
      mesh.append(extrudeX(fillet(rowFront, 1, R, floorTop), x0, x1));
      if (o.scoopSides === 'both' || o.scoopSides === 'all') mesh.append(extrudeX(fillet(rowBack, -1, R, floorTop), x0, x1));
    }

    const L = Math.min(o.labelTab, rowDepth / 2);
    if (L > 0.5 && (o.labelWhere === 'all' || j === ny - 1)) {
      // Overhanging label shelf; its underside is angled so it prints without supports.
      const front = o.labelSide === 'front';
      const edge = front ? rowFront : rowBack;
      const dir = front ? 1 : -1;
      const top = (front ? j > 0 : j < ny - 1) ? Math.min(divTop, innerTop) : innerTop;
      // Never flatter than 42° from vertical (exactly 45° leaves specks in mid-air),
      // and if a shallow bin has no room for the drop, the shelf gets shallower instead.
      const angle = (Math.min(42, Math.max(20, o.labelAngle)) * Math.PI) / 180;
      const drop = Math.min(L / Math.tan(angle) + 0.8, top - floorTop - 0.5);
      const Ls = Math.max(0.5, Math.min(L, (drop - 0.8) * Math.tan(angle)));
      const shelf = [[edge, top], [edge + dir * Ls, top], [edge + dir * Ls, top - 0.8], [edge, top - drop]];
      const spans = [];
      for (let i = 0; i < (o.labelWhere === 'first' ? 1 : nx); i++) {
        const c0 = bx[i] + (i > 0 ? dt / 2 : 0);
        const c1 = bx[i + 1] - (i < nx - 1 ? dt / 2 : 0);
        const w = o.labelStyle === 'full' ? c1 - c0 : Math.min(c1 - c0, o.labelWidth > 0 ? o.labelWidth : SPEC.labelWidth);
        const start = o.labelStyle === 'left' || o.labelStyle === 'full' ? c0 : o.labelStyle === 'right' ? c1 - w : (c0 + c1 - w) / 2;
        spans.push([start, start + w]);
      }
      if (o.labelStyle === 'full') mesh.append(extrudeX(shelf, x0, o.labelWhere === 'first' ? spans[0][1] : x1));
      else for (const [a, b] of spans) mesh.append(extrudeX(shelf, a, b));
      labelSpots.push(...spans.map(([a, b], i) => ({ row: j, col: i, x0: a, x1: b, y0: Math.min(edge, edge + dir * Ls), y1: Math.max(edge, edge + dir * Ls), z: top })));
    }
  }

  // Movable dividers: pairs of ribs on opposite walls hold printed plates.
  const gap = o.slotPlate + 0.4, rib = 1.2;
  if (o.slotsX > 0) {
    for (const x of slotPositions(x0, x1, o.slotsX)) {
      for (const [ya, yb] of [[y0 - 0.2, y0 + rib], [y1 - rib, y1 + 0.2]]) {
        mesh.append(box(x - gap / 2 - rib, ya, floorTop, x - gap / 2, yb, divTop));
        mesh.append(box(x + gap / 2, ya, floorTop, x + gap / 2 + rib, yb, divTop));
      }
    }
  }
  if (o.slotsY > 0) {
    for (const y of slotPositions(y0, y1, o.slotsY)) {
      for (const [xa, xb] of [[x0 - 0.2, x0 + rib], [x1 - rib, x1 + 0.2]]) {
        mesh.append(box(xa, y - gap / 2 - rib, floorTop, xb, y - gap / 2, divTop));
        mesh.append(box(xa, y + gap / 2, floorTop, xb, y + gap / 2 + rib, divTop));
      }
    }
  }

  if (o.brandMark) {
    // Raised mark on the floor of the back-left compartment.
    const w0 = bx[1] - bx[0], d0 = by[ny] - by[ny - 1];
    const size = Math.min(14, w0 * 0.5, (d0 * 0.45 * MARK_WIDTH) / MARK_HEIGHT);
    if (size >= 6) {
      const h = (size * MARK_HEIGHT) / MARK_WIDTH;
      const cx = (bx[0] + bx[1]) / 2;
      const cy = Math.min(y1 - h / 2 - 3, (by[ny - 1] + by[ny]) / 2);
      for (const poly of markAt(cx, cy, size)) mesh.append(extrudePolygon(poly, [], floorTop - 0.05, floorTop + 0.6));
    }
  }

  mesh.labelSpots = labelSpots;
  mesh.slotInfo = { x0, x1, y0, y1, floorTop, divTop, rib };
  // Every compartment's inside, for the dimensions overlay.
  mesh.cells = { xs: bx, ys: by, divider: dt, floorTop, innerTop: divTop, width: W, depth: D, height: H };
  return mesh;
}

// Split label text into compartments: one entry per line (or "|"), back row first, left to right.
export function labelList(text) {
  return String(text || '').split(/\r?\n|\|/).map((s) => s.trim());
}

// The bin plus its extra printable parts: raised label text (a separate part,
// so it can be printed in another colour) and movable divider plates.
export function generateBinParts(options = {}) {
  const o = { ...BIN_DEFAULTS, ...options };
  const body = generateBin(o);
  const parts = { body, labels: null, plates: [] };
  const texts = labelList(o.labels);
  if (texts.some(Boolean) && body.labelSpots?.length) {
    const nx = body.cells.xs.length - 1, ny = body.cells.ys.length - 1;
    const labels = new Mesh();
    let k = 0;
    for (let row = ny - 1; row >= 0; row--) {
      for (let col = 0; col < nx; col++, k++) {
        const text = texts[k];
        const spot = body.labelSpots.find((s) => s.row === row && s.col === col);
        if (!text || !spot) continue;
        const fit = fitText(text, spot.x0 + 0.8, spot.y0 + 0.6, spot.x1 - spot.x0 - 1.6, spot.y1 - spot.y0 - 1.2, o.labelTextHeight || 6, Math.min(2.5, o.labelTextHeight || 2.5));
        if (fit) labels.append(textMesh(text, fit.x, fit.y, fit.height, spot.z - 0.05, spot.z + 0.6));
      }
    }
    if (labels.triangleCount) parts.labels = labels;
  }
  // A solid bin (a blank to cut into) has no inside, so no divider plates.
  if (!body.slotInfo) return parts;
  const { x0, x1, y0, y1, floorTop, divTop } = body.slotInfo;
  const plateH = divTop - floorTop - 0.4;
  // Where the two sets of plates cross they interlock: width plates are
  // notched from the top, depth plates from the bottom.
  const xs = slotPositions(x0, x1, o.slotsX), ys = slotPositions(y0, y1, o.slotsY);
  const lenX = y1 - y0 - 0.6, lenY = x1 - x0 - 0.6;
  const nX = Math.round(o.platesX) || o.slotsX, nY = Math.round(o.platesY) || o.slotsY;
  if (o.slotsX > 0 && nX > 0) parts.plates.push({ count: nX, mesh: platesSheet(nX, lenX, plateH, o.slotPlate, ys.map((y) => y - y0 - 0.3), true), name: `dividers-${nX}x-${Math.round(lenX)}mm` });
  if (o.slotsY > 0 && nY > 0) parts.plates.push({ count: nY, mesh: platesSheet(nY, lenY, plateH, o.slotPlate, xs.map((x) => x - x0 - 0.3), false), name: `dividers-${nY}x-${Math.round(lenY)}mm` });
  return parts;
}

// Where the compartments start and end between a and b: equal splits, or the
// proportions in `sizes` ("1,2,1" or "30 60 30"). Each is at least 5 mm.
export function parseSizes(sizes) {
  return String(sizes || '').split(/[,;\s]+/).map(Number).filter((v) => Number.isFinite(v) && v > 0).slice(0, 24);
}
export function splitBounds(a, b, divisions = 1, sizes = '') {
  let w = parseSizes(sizes);
  if (w.length < 2) w = Array(Math.max(1, Math.min(24, Math.round(divisions) || 1))).fill(1);
  const span = b - a, min = Math.min(5, span / w.length);
  const sum = w.reduce((s, v) => s + v, 0);
  // Scale to fit, then lift anything thinner than the minimum and take it from the rest.
  let mm = w.map((v) => (v / sum) * span);
  const small = mm.filter((v) => v < min).length;
  if (small && small < mm.length) {
    const rest = mm.filter((v) => v >= min).reduce((s, v) => s + v, 0);
    const k = (span - small * min) / rest;
    mm = mm.map((v) => (v < min ? min : v * k));
  }
  const out = [a];
  for (const v of mm) out.push(out[out.length - 1] + v);
  out[out.length - 1] = b;
  return out;
}

export function slotPositions(a, b, n) {
  return Array.from({ length: Math.max(0, n) }, (_, i) => a + ((i + 1) * (b - a)) / (n + 1));
}

// Divider plates laid flat, side by side, with half-depth notches where they cross others.
export function platesSheet(count, length, height, thick, notches = [], fromTop = true) {
  const m = new Mesh();
  const w = thick + 0.4;
  const cuts = notches.filter((p) => p - w / 2 > 1 && p + w / 2 < length - 1).sort((a, b) => a - b);
  const h2 = height / 2;
  let outline;
  if (!cuts.length) outline = [[0, 0], [length, 0], [length, height], [0, height]];
  else if (fromTop) {
    outline = [[0, 0], [length, 0], [length, height]];
    for (const p of [...cuts].reverse()) outline.push([p + w / 2, height], [p + w / 2, h2], [p - w / 2, h2], [p - w / 2, height]);
    outline.push([0, height]);
  } else {
    outline = [[0, 0]];
    for (const p of cuts) outline.push([p - w / 2, 0], [p - w / 2, h2], [p + w / 2, h2], [p + w / 2, 0]);
    outline.push([length, 0], [length, height], [0, height]);
  }
  for (let i = 0; i < count; i++) m.append(extrudePolygon(outline.map(([x, y]) => [x, y + i * (height + 4)]), [], 0, thick));
  return m;
}

// Concave fillet profile at `edge`, curving away in direction dir, radius R.
function fillet(edge, dir, R, z0, n = 12) {
  const profile = [[edge, z0], [edge + dir * R, z0]];
  for (let s = 1; s < n; s++) {
    const a = Math.PI * 1.5 - (Math.PI / 2) * (s / n);
    profile.push([edge + dir * (R + R * Math.cos(a)), z0 + R + R * Math.sin(a)]);
  }
  profile.push([edge, z0 + R]);
  return profile;
}

// Split lofted rect levels at height z, adding an interpolated level there.
function splitLevels(levels, z) {
  const below = levels.filter((l) => l.z <= z + 1e-6);
  const above = levels.filter((l) => l.z >= z - 1e-6);
  const a = below.at(-1), b = above[0];
  if (a && b && a !== b) {
    const f = (z - a.z) / (b.z - a.z);
    const mix = (k) => a.rect[k] + (b.rect[k] - a.rect[k]) * f;
    const mid = { z, rect: { cx: a.rect.cx ?? 0, cy: a.rect.cy ?? 0, w: mix('w'), d: mix('d'), r: mix('r') } };
    below.push(mid);
    above.unshift(mid);
  }
  return [below, above];
}

// Outside height of a bin in mm, without the lip.
export function binHeight(options = {}) {
  return binFrame(options).H;
}

// How many magnet or screw holes a bin has (for parts lists).
export function binHoleCount(options = {}) {
  const o = { ...BIN_DEFAULTS, ...options };
  return footCells(o).reduce((n, c) => n + holeCentres(c, o).length, 0);
}
