import { SPEC } from './spec.js';
import { BIN_DEFAULTS, binFrame, generateBin } from './bin.js';
import { extrudePolygon, groupLoops, signedArea, simplifyClosed } from './polygon.js';
import { roundedRect } from './primitives.js';
import { markAt, MARK_HEIGHT, MARK_WIDTH } from './brand.js';
import { Grid, boxBlur, fillCircle, fillHoles, fillPolygon, offsetMask, traceContours } from './raster.js';

export const CUTOUT_DEFAULTS = {
  ...BIN_DEFAULTS,
  gridX: 3,
  gridY: 2,
  heightUnits: 0, // 0 = pick the shortest bin that fits the deepest pocket
  lip: true,
  edgeMargin: 1.2, // minimum solid between a pocket and the bin wall
  underFloor: 1.2, // minimum solid under the deepest pocket
  pocketStyle: 'solid', // 'solid' insert, or 'walls': thin walls around each pocket (very light)
  pocketWall: 1.2,
  chamfer: 0, // mm: a bevel round the top of every pocket, so tools drop in (0 = sharp)
  resolution: 0.25,
};

// Height units needed for pockets of the given depth.
export function unitsForDepth(depth, options = {}) {
  const o = { ...CUTOUT_DEFAULTS, ...options, heightUnits: 1 };
  const { floorTop } = binFrame(o);
  return Math.max(2, Math.ceil((floorTop + depth + o.underFloor) / o.heightUnit));
}

// Smallest grid that holds every shape (bin-centred coordinates, mm).
export function gridForShapes(shapes, options = {}) {
  const o = { ...CUTOUT_DEFAULTS, ...options };
  let maxX = 0, maxY = 0;
  for (const s of shapes) {
    for (const [x, y] of s.polygon) {
      maxX = Math.max(maxX, Math.abs(x));
      maxY = Math.max(maxY, Math.abs(y));
    }
  }
  const need = (half, pitch) => Math.max(1, Math.ceil((2 * (half + o.edgeMargin + o.wall) + SPEC.clearance) / pitch));
  return { gridX: need(maxX, o.pitchX), gridY: need(maxY, o.pitchY) };
}

// A bin whose cavity is filled solid, with pockets cut to each shape.
// shapes: [{ polygon: [[x, y], ...] | circle: [cx, cy, r], depth }], centred on the bin.
export function generateCutoutBin(options = {}) {
  const o = { ...CUTOUT_DEFAULTS, ...options, divisionsX: 1, divisionsY: 1, scoop: 0, labelTab: 0 };
  const shapes = (o.shapes || []).filter((s) => s.depth > 0);
  const brand = o.brandMark;
  o.brandMark = false; // the floor is filled, so the mark is engraved on top instead
  const maxDepth = Math.max(0, ...shapes.map((s) => s.depth));
  // low: cut down to just what the pockets need: the feet, then a block (or the
  // walls round each tool) as tall as the deepest pocket plus the floor under it,
  // with no outer wall or lip.
  if (o.low) {
    Object.assign(o, { outerWall: false, lip: false, heightMode: 'mm' });
    o.heightMm = binFrame({ ...o, heightMode: 'units', heightUnits: 6 }).floorTop + maxDepth + o.underFloor;
  }
  if (!o.heightUnits) o.heightUnits = unitsForDepth(maxDepth + (o.lip ? STACK_CLEAR : 0), o);
  const walls = o.pocketStyle === 'walls';
  if (walls) o.brandMark = brand; // the floor stays visible
  const mesh = generateBin(o);
  const { W, D, H: wallTop, t, floorTop } = binFrame(o);
  // Keep the top below the feet of a bin stacked on this one.
  const H = o.lip ? wallTop - STACK_CLEAR : wallTop;

  // The insert overlaps the walls slightly so the parts fuse.
  const insetWall = o.outerWall === false ? 0 : Math.max(t - 0.2, 0.2); // no outer wall: the block is the edge
  const insert = roundedRect(
    { w: W - 2 * insetWall, d: D - 2 * insetWall, r: Math.max(SPEC.binRadius - insetWall, 0.3) },
    o.segments,
  );
  const allowed = roundedRect(
    { w: W - 2 * (t + o.edgeMargin), d: D - 2 * (t + o.edgeMargin), r: Math.max(SPEC.binRadius - t - o.edgeMargin, 0.3) },
    o.segments,
  );

  if (walls) {
    const marks = shapes.filter((q) => q.mark), pockets = shapes.filter((q) => !q.mark);
    for (const { outer, holes } of wallOutlines(pockets, insert, o.pocketWall, W, D, o.resolution)) {
      mesh.append(extrudePolygon(outer, holes, floorTop, H));
    }
    // Names stand up from the open floor, where the walls leave it showing.
    for (const q of marks) mesh.append(extrudePolygon(signedArea(q.polygon) < 0 ? [...q.polygon].reverse() : q.polygon, [], floorTop - 0.01, floorTop + (o.raise ?? 0.8)));
    return mesh;
  }

  if (brand) {
    const mark = engravedMark(shapes, W, D, t + o.edgeMargin);
    if (mark) shapes.push(...mark);
  }

  const limit = H - floorTop - o.underFloor;
  const depths = [...new Set(shapes.map((s) => Math.min(s.depth, limit)))].filter((d) => d > 0.2).sort((a, b) => a - b);
  const deepest = depths.at(-1) || 0;
  mesh.insertTop = H; // where pockets start, for picking them in the 3D view
  if (H - deepest - floorTop > 0.01) mesh.append(extrudePolygon(insert, [], floorTop, H - deepest));

  const res = o.resolution;
  // The chamfer: the top of each pocket widens in small steps (each no more
  // than 45°, so it prints without supports), never deeper than the
  // shallowest pocket.
  const toolDepths = shapes.filter((q) => !q.mark).map((q) => Math.min(q.depth, limit));
  const chamfer = Math.max(0, Math.min(o.chamfer || 0, 3, Math.min(...toolDepths, Infinity) - 0.4));
  const cz = chamfer > 0 ? H - chamfer : H;
  for (let k = depths.length - 1; k >= 0; k--) {
    const zBottom = H - depths[k];
    const zTop = Math.min(H - (k > 0 ? depths[k - 1] : 0), cz);
    if (zTop - zBottom < 0.01) continue;
    const holes = pocketOutlines(
      shapes.filter((s) => Math.min(s.depth, limit) >= depths[k]),
      allowed,
      W,
      D,
      res,
    );
    mesh.append(extrudePolygon(insert, holes, zBottom, zTop));
  }
  if (chamfer > 0) {
    const steps = Math.max(2, Math.ceil(chamfer / 0.4));
    for (let j = 0; j < steps; j++) {
      const z0 = cz + (chamfer * j) / steps, z1 = cz + (chamfer * (j + 1)) / steps;
      // Tools widen; the engraved mark (shallower) is cut only where it reaches, as it is.
      const marks = shapes.filter((q) => q.mark && H - Math.min(q.depth, limit) < z1 - 1e-6);
      const holes = pocketOutlines(shapes.filter((q) => !q.mark), allowed, W, D, res, (chamfer * (j + 1)) / steps, marks);
      mesh.append(extrudePolygon(insert, holes, z0, z1));
    }
  }
  return mesh;
}

// How far below the wall top anything inside must stop, so a bin stacked on
// top (its feet sit 0.35 mm below the wall top) never touches it.
export const STACK_CLEAR = 0.8;

function shapeMask(shapes, W, D, res) {
  const grid = Grid.covering(-W / 2, -D / 2, W / 2, D / 2, res);
  for (const s of shapes) {
    if (s.circle) fillCircle(grid, ...s.circle);
    else fillPolygon(grid, s.polygon);
  }
  return fillHoles(grid);
}

// Thin walls around every pocket, clipped to the insert area.
export function wallOutlines(shapes, insert, wall, W, D, res) {
  const pockets = shapeMask(shapes, W, D, res);
  const grown = offsetMask(pockets, wall / res);
  const inside = new Grid(pockets.width, pockets.height, pockets.x0, pockets.y0, res);
  fillPolygon(inside, insert);
  const region = grown.clone();
  for (let i = 0; i < region.data.length; i++) region.data[i] = grown.data[i] && !pockets.data[i] && inside.data[i] ? 1 : 0;
  const loops = traceContours(boxBlur(region, 1), 0.5)
    .filter((l) => Math.abs(signedArea(l)) > 4 * res * res)
    .map((l) => simplifyClosed(l, res * 0.15));
  return groupLoops(loops);
}

// Union of shapes, clipped to the allowed area, as simple non-overlapping loops.
export function pocketOutlines(shapes, allowed, W, D, res, grow = 0, plain = []) {
  let grid = shapeMask(shapes, W, D, res);
  if (grow > 0) grid = offsetMask(grid, grow / res);
  if (plain.length) { const p = shapeMask(plain, W, D, res); for (let i = 0; i < grid.data.length; i++) grid.data[i] = Math.max(grid.data[i], p.data[i]); }
  const inside = new Grid(grid.width, grid.height, grid.x0, grid.y0, res);
  fillPolygon(inside, allowed);
  for (let i = 0; i < grid.data.length; i++) grid.data[i] *= inside.data[i];
  const loops = traceContours(boxBlur(grid, 1), 0.5)
    .filter((l) => signedArea(l) > 4 * res * res)
    .map((l) => simplifyClosed(l, res * 0.2));
  return loops;
}

// Engrave the mark in the first free corner of the top surface.
function engravedMark(shapes, W, D, inset, size = 12) {
  const h = (size * MARK_HEIGHT) / MARK_WIDTH;
  const pad = 2;
  const boxes = shapes.map((s) => {
    const xs = s.polygon.map((p) => p[0]), ys = s.polygon.map((p) => p[1]);
    return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
  });
  const hx = W / 2 - inset - size / 2 - 1, hy = D / 2 - inset - h / 2 - 1;
  if (hx < 0 || hy < 0) return null;
  for (const [cx, cy] of [[hx, -hy], [-hx, -hy], [hx, hy], [-hx, hy]]) {
    const free = boxes.every(([x0, y0, x1, y1]) => cx + size / 2 < x0 || cx - size / 2 > x1 || cy + h / 2 < y0 || cy - h / 2 > y1);
    if (free) return markAt(cx, cy, size).map((polygon) => ({ polygon, depth: 0.6, mark: true }));
  }
  return null;
}


// A flat tray, like a shadow board or drawer liner: a plate with every tool's
// shape sunk into it and no Gridfinity feet. As big as the bin would be
// (width/depth override it), as thick as the deepest pocket plus `trayFloor`.
// Pockets step down by depth, bevel at the top and take engraved names,
// exactly as in the solid bin.
export function generateFlatTray(options = {}) {
  const o = { ...CUTOUT_DEFAULTS, trayFloor: 1.2, ...options };
  const W = o.width || o.gridX * SPEC.pitch - 0.5, D = o.depth || o.gridY * SPEC.pitch - 0.5;
  const shapes = (o.shapes || []).filter((s) => s.depth > 0);
  const tools = shapes.filter((q) => !q.mark);
  const H = o.trayFloor + Math.max(0.6, ...tools.map((s) => s.depth));
  const outline = roundedRect({ w: W, d: D, r: SPEC.binRadius }, o.segments);
  const allowed = roundedRect({ w: W - 2 * o.edgeMargin, d: D - 2 * o.edgeMargin, r: Math.max(SPEC.binRadius - o.edgeMargin, 0.3) }, o.segments);
  if (o.brandMark) { const mark = engravedMark(shapes, W, D, o.edgeMargin); if (mark) shapes.push(...mark); }
  const limit = H - o.trayFloor;
  const depths = [...new Set(shapes.map((s) => Math.min(s.depth, limit)))].filter((d) => d > 0.2).sort((a, b) => a - b);
  const mesh = extrudePolygon(outline, [], 0, H - (depths.at(-1) || 0));
  mesh.insertTop = H;
  const chamfer = Math.max(0, Math.min(o.chamfer || 0, 3, Math.min(...tools.map((q) => Math.min(q.depth, limit)), Infinity) - 0.4));
  const cz = chamfer > 0 ? H - chamfer : H;
  for (let k = depths.length - 1; k >= 0; k--) {
    const zBottom = H - depths[k], zTop = Math.min(H - (k > 0 ? depths[k - 1] : 0), cz);
    if (zTop - zBottom < 0.01) continue;
    mesh.append(extrudePolygon(outline, pocketOutlines(shapes.filter((s) => Math.min(s.depth, limit) >= depths[k]), allowed, W, D, o.resolution), zBottom, zTop));
  }
  if (chamfer > 0) {
    const steps = Math.max(2, Math.ceil(chamfer / 0.4));
    for (let j = 0; j < steps; j++) {
      const z0 = cz + (chamfer * j) / steps, z1 = cz + (chamfer * (j + 1)) / steps;
      const marks = shapes.filter((q) => q.mark && H - Math.min(q.depth, limit) < z1 - 1e-6);
      mesh.append(extrudePolygon(outline, pocketOutlines(tools, allowed, W, D, o.resolution, (chamfer * (j + 1)) / steps, marks), z0, z1));
    }
  }
  return mesh;
}
