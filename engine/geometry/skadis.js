// Skådis-style pegboard accessories. IKEA SKÅDIS boards have vertical slots
// (about 5 × 15 mm) in a staggered grid: columns 40 mm apart, rows 20 mm
// apart, every other row shifted by 20 mm. Boards vary a little, so every
// number here is a setting, and a fit-test piece checks yours first.
//
// Accessories are modelled against the wall (x along the wall, y out of it,
// z up) and then laid on their side for printing, so the hook tabs are
// printed along their length and don't snap off at the layer lines.
//
// A hook tab goes through a slot, and a lip behind it drops down behind the
// board. Lower pegs (optional) sit in the slot two rows down to stop the
// accessory tipping.
import { Mesh } from './mesh.js';
import { box, extrudeX, loftWithHoles } from './primitives.js';
import { circlePolygon, extrudePolygon, orient } from './polygon.js';
import { placeBadge, recessedSlab } from './brand.js';

export const SKADIS_ITEMS = {
  hook: 'Hook',
  double: 'Double hook',
  shelf: 'Shelf',
  holder: 'Tool holder (shelf with holes)',
  tray: 'Tray',
  gridfinity: 'Gridfinity shelf',
  board: 'Pegboard tile',
  fit: 'Fit test (three sizes)',
};

// How tightly tabs fit the slots. The fit test prints one tag at each, so you can pick.
export const FIT = { snug: 0.2, standard: 0.3, loose: 0.45 };

export const SKADIS_DEFAULTS = {
  item: 'hook',
  style: 'flat', // hooks: 'flat' = one piece printed flat with hooks built in; 'clips' = back plate + push-in clips
  // The board
  slotWidth: 5,
  slotHeight: 15,
  boardThickness: 5,
  pitchX: 40,
  pitchY: 20,
  fit: 'standard', // 'snug' | 'standard' | 'loose' set the clearance; 'custom' uses the number below
  clearance: 0.3,
  holeShape: 'round', // tool holder: 'round' holes, or 'slot' for pliers, scissors and chisels
  slotLength: 26,
  // Hooks that go into the board
  tabHeight: 6,
  lipDrop: 6,
  lipThickness: 2.4,
  pegs: true,
  grip: true, // small bumps on one-piece hooks that press lightly on the slot, so it doesn't rattle
  // The back plate
  plateThickness: 3,
  width: 80,
  height: 50,
  // J-hook
  hookWidth: 12,
  hookLength: 40,
  hookRise: 14,
  hookThickness: 5,
  hookGap: 20, // between the arms of a double hook
  // Shelf and holder
  depth: 60,
  shelfThickness: 3,
  frontLip: 5,
  holeDiameter: 8,
  holeRows: 1,
  holeSpacing: 16,
  braces: true,
  // Tray
  trayHeight: 35,
  wall: 1.6,
  dividers: 0,
  // Gridfinity shelf
  unitsX: 2,
  unitsY: 1,
  // Pegboard tile: columns and rows of 40 mm
  cols: 4,
  rows: 4,
  panelThickness: 5,
  screwHoles: true,
  standoff: 15, // wall spacers (a separate part): 15 mm + a 5 mm board = IKEA's 20 mm off the wall; 0 = none
  joins: true, // hidden channels in the edges for 1.75 mm filament pins, so tiles join into a bigger board
  brandMark: true, // the VERTEX badge, recessed into the underside of shelves and trays
};

const EPS = 0.01;

export function normaliseSkadis(o = {}) {
  const p = { ...SKADIS_DEFAULTS, ...o };
  // Designs saved before there was a fit setting keep the clearance they had.
  if (o.fit === undefined && o.clearance !== undefined && Number(o.clearance) !== FIT.standard) p.fit = 'custom';
  const clamp = (k, lo, hi) => (p[k] = Math.min(hi, Math.max(lo, Number(p[k]) || SKADIS_DEFAULTS[k])));
  clamp('slotWidth', 2, 12); clamp('slotHeight', 6, 40); clamp('boardThickness', 2, 20);
  clamp('pitchX', 10, 120); clamp('pitchY', 5, 120); clamp('clearance', 0, 1);
  clamp('tabHeight', 3, 20); clamp('lipThickness', 1.2, 6); clamp('plateThickness', 1.6, 10);
  p.lipDrop = Math.min(20, Math.max(2, Number(p.lipDrop) || SKADIS_DEFAULTS.lipDrop));
  p.standoff = Math.min(40, Math.max(0, Number(p.standoff ?? SKADIS_DEFAULTS.standoff) || 0));
  p.cols = Math.min(12, Math.max(1, Math.round(Number(p.cols) || SKADIS_DEFAULTS.cols)));
  p.rows = Math.min(12, Math.max(1, Math.round(Number(p.rows) || SKADIS_DEFAULTS.rows)));
  p.hookGap = Math.min(120, Math.max(6, Number(p.hookGap) || SKADIS_DEFAULTS.hookGap));
  p.joins = p.joins !== false && p.joins !== 'false';
  p.style = p.style === 'clips' ? 'clips' : 'flat';
  p.grip = p.grip !== false && p.grip !== 'false';
  if (FIT[p.fit]) p.clearance = FIT[p.fit]; else p.fit = 'custom';
  p.holeShape = p.holeShape === 'slot' ? 'slot' : 'round';
  p.slotLength = Math.min(80, Math.max(Number(p.holeDiameter) || 8, Number(p.slotLength) || SKADIS_DEFAULTS.slotLength));
  // The tab and its lip must pass through the slot together.
  const pass = p.slotHeight - 2 * p.clearance - 0.6;
  if (p.tabHeight + p.lipDrop > pass) p.lipDrop = Math.max(2, pass - p.tabHeight);
  if (p.tabHeight + p.lipDrop > pass) p.tabHeight = Math.max(3, pass - p.lipDrop);
  return p;
}

// Where the hooks go along a plate of width w: on the 40 mm columns, centred.
export function hookColumns(w, p) {
  const tab = p.slotWidth - 2 * p.clearance;
  const n = Math.max(1, Math.floor((w - tab - 4) / p.pitchX) + 1);
  return Array.from({ length: n }, (_, k) => w / 2 + (k - (n - 1) / 2) * p.pitchX);
}

// Back plate from x 0..w, z 0..h, y 0..t, with a clip hole on the top row of
// each 40 mm column and (optionally) another two rows down for an anti-tilt clip.
//
// The hook tabs are separate clips (see clipMesh): a tab and its lip hang
// behind the board, and nothing that hangs down can print attached without
// supports, whichever way the part lies. Printed flat on their own, clips are
// strong along their length, and the part itself only needs a plain hole.
export function clipHole(p) {
  return { w: p.slotWidth - 2 * p.clearance + 0.4, h: p.tabHeight + p.lipDrop + 0.8 };
}
// The least plate height that fits the clip hole and its flange above keepClear.
const clipRoom = (p, keepClear) => clipHole(p).h + 2 + 2 + keepClear + 0.5;
function plateWithHooks(w, h, p, { top = 2, keepClear = 0 } = {}) {
  const t = p.plateThickness;
  const zTop = h - top;
  const hole = clipHole(p);
  const cols = hookColumns(w, p);
  const zPeg = zTop - 2 * p.pitchY;
  const pegs = p.pegs && zPeg - hole.h - 2.5 >= keepClear;
  const rects = [];
  for (const cx of cols) {
    rects.push([cx - hole.w / 2, zTop - hole.h, cx + hole.w / 2, zTop]);
    if (pegs) rects.push([cx - hole.w / 2, zPeg - hole.h, cx + hole.w / 2, zPeg]);
  }
  return { mesh: backPlate(w, h, t, rects), hooks: cols.length, pegs, clips: rects.length, clipAt: rects };
}

// A plate x 0..w, z 0..h, y 0..t with rectangular holes [x0, z0, x1, z1] through it.
// With round = true the holes are slots with round ends, like a real board.
function backPlate(w, h, t, rects, round = false) {
  // Drawn in (z, x) and extruded along y; (u, v, w) -> (v, w, u) keeps the faces pointing out.
  const outer = orient([[0, 0], [0, w], [h, w], [h, 0]], true);
  const stadium = ([x0, z0, x1, z1]) => {
    const r = (x1 - x0) / 2, cx = (x0 + x1) / 2, pts = [];
    for (let i = 0; i <= 8; i++) { const a = (Math.PI * i) / 8; pts.push([z1 - r + r * Math.sin(a), cx + r * Math.cos(a)]); }
    for (let i = 0; i <= 8; i++) { const a = Math.PI + (Math.PI * i) / 8; pts.push([z0 + r + r * Math.sin(a), cx + r * Math.cos(a)]); }
    return pts;
  };
  const holes = rects.map((q) => orient(round ? stadium(q) : [[q[1], q[0]], [q[1], q[2]], [q[3], q[2]], [q[3], q[0]]], false));
  const m = extrudePolygon(outer, holes, 0, t);
  const q = m.positions;
  for (let i = 0; i < q.length; i += 3) {
    const u = q[i], v = q[i + 1], ww = q[i + 2];
    q[i] = v; q[i + 1] = ww; q[i + 2] = u;
  }
  return m;
}

// One clip, from the side (y out from the wall, z up), with its top at z = 0:
// a flange in front of the plate, a shank that fills the plate hole, the tab
// through the board, and the lip that drops behind it.
export function clipProfile(p) {
  const t = p.plateThickness, hole = clipHole(p);
  const reach = p.boardThickness + p.clearance, back = -(reach + p.lipThickness);
  const shank = hole.h - 0.3, flange = 2;
  return [
    [t + flange, 2], [t, 2], [t, 0], [back, 0],
    [back, -(p.tabHeight + p.lipDrop)], [-reach, -(p.tabHeight + p.lipDrop)], [-reach, -p.tabHeight],
    [0, -p.tabHeight], [0, -shank], [t, -shank], [t, -shank - flange], [t + flange, -shank - flange],
  ];
}
// n clips laid flat, side by side, ready to print.
export function clipSheet(p, n) {
  const tab = p.slotWidth - 2 * p.clearance;
  const mesh = new Mesh();
  const prof = clipProfile(p);
  const ys = prof.map((q) => q[0]), zs = prof.map((q) => q[1]);
  const len = Math.max(...ys) - Math.min(...ys), tall = Math.max(...zs) - Math.min(...zs);
  const perRow = Math.max(1, Math.min(n, 5));
  for (let i = 0; i < n; i++) {
    const c = side(prof, 0, tab);
    // Lie it down: the clip's thickness becomes the print height.
    const q = c.positions;
    for (let k = 0; k < q.length; k += 3) {
      const x = q[k], y = q[k + 1], z = q[k + 2];
      q[k] = y; q[k + 1] = z; q[k + 2] = x;
    }
    c.translate((i % perRow) * (len + 4), Math.floor(i / perRow) * (tall + 4), 0);
    mesh.append(c);
  }
  const b = mesh.bounds();
  return mesh.translate(-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2, -b.min[2]);
}

// Stand a wall-oriented part up as it hangs: floors and shelves on the bed.
export function upright(mesh) {
  const b = mesh.bounds();
  return mesh.translate(-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2, -b.min[2]);
}

// Lay a wall-oriented part on its side: wall x becomes print z.
export function toPrint(mesh) {
  const q = mesh.positions;
  for (let i = 0; i < q.length; i += 3) {
    const x = q[i], z = q[i + 2];
    q[i] = -z;
    q[i + 2] = x;
  }
  const b = mesh.bounds();
  return mesh.translate(-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2, -b.min[2]);
}

// A shape drawn from the side (y out from the wall, z up), made x0..x1 wide.
// Unlike extrudeX this takes any simple outline, curves included.
function side(poly, x0, x1) {
  // Drop repeated points (where an arc meets a straight run) so every edge is real.
  const pts = poly.filter((q, i) => { const n = poly[(i + 1) % poly.length]; return Math.hypot(q[0] - n[0], q[1] - n[1]) > 1e-6; });
  const m = extrudePolygon(orient(pts, true), [], x0, x1);
  const q = m.positions;
  for (let i = 0; i < q.length; i += 3) {
    const u = q[i], v = q[i + 1], w = q[i + 2];
    q[i] = w; q[i + 1] = u; q[i + 2] = v; // (u, v, w) -> (w, u, v) keeps the faces pointing out
  }
  return m;
}
const arc = (cy, cz, r, a0, a1, n = 14) => Array.from({ length: n + 1 }, (_, i) => {
  const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
  return [cy + r * Math.cos(a), cz + r * Math.sin(a)];
});

// The hook arm from the side: out from the plate, a smooth curve up to the
// tip (rounded, so nothing snags), and a fillet where it meets the plate.
export function hookProfile(t, L, a, rise) {
  const top = Math.max(rise, a + 2);
  const R = Math.max(a + 1.5, Math.min(top, L * 0.45, a * 2 + 6)); // outside radius of the bend
  const cy = t + L - R;
  const g = Math.min(8, L * 0.3, top); // fillet at the root
  const tip = Math.min(a / 2, 3);
  return [
    [t - EPS, 0],
    // Under the bend: a straight chamfer (never flatter than 40° from vertical) instead of the round.
    [cy + R * Math.cos((-40 * Math.PI) / 180) - 0.8 * (R + R * Math.sin((-40 * Math.PI) / 180)), 0],
    ...arc(cy, R, R, -40, 0, 10),
    [t + L, top - tip],
    ...arc(t + L - tip, top - tip, tip, 0, 90, 6).slice(1, -1),
    [t + L - tip, top],
    [t + L - a + tip, top],
    ...arc(t + L - a + tip, top - tip, tip, 90, 180, 6).slice(1, -1),
    [t + L - a, top - tip],
    ...arc(cy, R, R - a, 0, -90),
    [t + g, a],
    ...arc(t + g, a + g, g, -90, -180, 8).slice(1, -1),
    [t - EPS, a + g],
  ];
}

// The one-piece hook, like the favourite printable SKÅDIS hooks: its outline
// printed flat on the bed, so every part of it is strong and nothing needs
// supports. Two hooks on the back, one slot and the slot two rows below (40 mm):
// push both in, then let it drop and both lips catch behind the board. The
// arm and spine can be wider than the slot; the hooks stay slot-thin, flush
// with the side that lies on the bed.
function flatHook(p) {
  const c = p.clearance, reach = p.boardThickness + c;
  const th = Math.max(2, p.slotWidth - 2 * c);
  const w = Math.max(th, p.hookWidth);
  const S = Math.max(3.5, p.plateThickness + 1); // the spine in front of the board
  const tabH = p.tabHeight, drop = p.lipDrop, L = p.lipThickness, a = p.hookThickness;
  const g = Math.min(8, p.hookLength * 0.3, Math.max(p.hookRise, a + 2));
  const span = 2 * p.pitchY;
  const H = Math.max(p.height, (p.pegs ? span : 0) + tabH + drop + a + g + 4);
  // One hook from the side: the tab through the slot and the lip behind the board,
  // with a small chamfer on the lip so it finds the slot easily.
  const hook = (zTop) => [
    [S / 2, zTop], [-reach - L, zTop], [-reach - L, zTop - tabH - drop + 1.2], [-reach - L + 1.2, zTop - tabH - drop],
    [-reach, zTop - tabH - drop], [-reach, zTop - tabH], [S / 2, zTop - tabH],
  ];
  const mesh = box(0, 0, 0, w, S, H);
  // A grip bump on the tab's top face (as it prints): it presses lightly on the side of the slot.
  const bump = (zTop) => side(circlePolygon(-reach / 2, zTop - tabH / 2, Math.min(1.4, tabH / 3), 20), th - EPS, th + c + 0.15);
  for (const z of p.pegs ? [H, H - span] : [H]) {
    mesh.append(side(hook(z), 0, th));
    if (p.grip) mesh.append(bump(z));
  }
  mesh.append(side(hookProfile(S, p.hookLength, a, p.hookRise), 0, w));
  return { mesh, hooks: p.pegs ? 2 : 1, pegs: p.pegs, clips: 0, clipAt: [], hangAt: [th / 2, H], flat: true, size: [w, S + p.hookLength, H] };
}

// The fit test: three small one-piece tags, printed flat, each with a tab at
// a different clearance (snug, standard, loose), marked with 1, 2 and 3 ridges.
// Try each in your board and pick the one that pushes in with a light press and doesn't wobble.
function fitStrip(p) {
  const reach = (c) => p.boardThickness + c;
  const tabH = p.tabHeight, drop = p.lipDrop, L = p.lipThickness;
  const w = 12, S = Math.max(3.5, p.plateThickness + 1), H = tabH + drop + 14;
  const mesh = new Mesh();
  const sizes = Object.entries(FIT);
  sizes.forEach(([, c], i) => {
    const th = Math.max(2, p.slotWidth - 2 * c), r = reach(c), z0 = i * (H + 6);
    const tag = box(0, 0, 0, w, S, H);
    tag.append(side([[S / 2, H], [-r - L, H], [-r - L, H - tabH - drop + 1.2], [-r - L + 1.2, H - tabH - drop], [-r, H - tabH - drop], [-r, H - tabH], [S / 2, H - tabH]], 0, th));
    // 1, 2 or 3 ridges on the front, so you can tell them apart.
    for (let k = 0; k <= i; k++) tag.append(box(0, S - EPS, 3 + k * 3, w, S + 1, 4.5 + k * 3));
    mesh.append(tag.translate(0, 0, z0));
  });
  return { mesh, hooks: sizes.length, pegs: false, clips: 0, clipAt: [], flat: true, fitTest: sizes.map(([k, c]) => ({ fit: k, clearance: c })), size: [w, S + 1, sizes.length * (H + 6) - 6] };
}

function jHook(p) {
  if (p.style !== 'clips') return flatHook(p);
  const w = Math.max(p.hookWidth, p.slotWidth + 4);
  let h = Math.max(p.height, p.tabHeight + p.lipDrop + p.hookThickness + 6);
  const keep = p.hookThickness + Math.min(8, p.hookLength * 0.3, Math.max(p.hookRise, p.hookThickness + 2)) + 1;
  h = Math.max(h, clipRoom(p, keep));
  const { mesh, hooks, pegs, clips, clipAt } = plateWithHooks(w, h, p, { keepClear: keep });
  mesh.append(side(hookProfile(p.plateThickness, p.hookLength, p.hookThickness, p.hookRise), 0, w));
  return { mesh, hooks, pegs, clips, clipAt, size: [w, p.plateThickness + p.hookLength, h] };
}

// Two arms on one plate, hooked into two columns so it can't turn.
function doubleHook(p) {
  const arm = Math.max(6, p.hookWidth);
  const w = Math.max(2 * arm + p.hookGap, p.pitchX + p.slotWidth + 8);
  let h = Math.max(p.height, p.tabHeight + p.lipDrop + p.hookThickness + 6);
  const keep = p.hookThickness + Math.min(8, p.hookLength * 0.3, Math.max(p.hookRise, p.hookThickness + 2)) + 1;
  h = Math.max(h, clipRoom(p, keep));
  const { mesh, hooks, pegs, clips, clipAt } = plateWithHooks(w, h, p, { keepClear: keep });
  const prof = hookProfile(p.plateThickness, p.hookLength, p.hookThickness, p.hookRise);
  const c = w / 2, off = p.hookGap / 2;
  mesh.append(side(prof, c - off - arm, c - off));
  mesh.append(side(prof, c + off, c + off + arm));
  return { mesh, hooks, pegs, clips, clipAt, size: [w, p.plateThickness + p.hookLength, h] };
}

// A floor slab x0..x1 × y0..y1, z 0..s, with the VERTEX badge recessed into its
// underside (the face on the bed), clear of any holes through it.
function floorSlab(p, x0, y0, x1, y1, s, holes = []) {
  const rect = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const badge = p.brandMark !== false && s >= 1.6 ? placeBadge(x0, y0, x1, y1, holes, { margin: 4, sizes: [12, 9, 7, 5] }) : null;
  return badge ? recessedSlab(rect, holes, badge.groups, 0, s, 0.6) : extrudePolygon(rect, holes, 0, s);
}

function shelf(p, holes = false) {
  const w = p.width;
  let h = Math.max(p.height, p.tabHeight + p.lipDrop + 8);
  const keep = p.shelfThickness + 1;
  h = Math.max(h, clipRoom(p, keep));
  const { mesh, hooks, pegs, clips, clipAt } = plateWithHooks(w, h, p, { keepClear: keep });
  const t = p.plateThickness, s = p.shelfThickness, d = p.depth;
  let count = 0;
  if (holes) {
    // Holes through the shelf, in rows, for screwdrivers, pliers, brushes.
    // Round holes, or long slots (along the depth) for pliers, scissors and chisels.
    const pts = [];
    const r = p.holeDiameter / 2;
    const slot = p.holeShape === 'slot', len = slot ? Math.min(p.slotLength, d - 8) : p.holeDiameter;
    const perRow = Math.max(1, Math.floor((w - 6 - p.holeDiameter) / p.holeSpacing) + 1);
    const rows = Math.max(1, Math.min(p.holeRows, Math.floor((d - 6) / (len + 4))));
    const rowStep = (d - 4) / (rows + 1);
    for (let rI = 0; rI < rows; rI++) {
      const y = t + 2 + rowStep * (rI + 1);
      const off = rI % 2 && perRow > 1 ? p.holeSpacing / 4 : 0;
      for (let k = 0; k < perRow; k++) {
        const x = w / 2 + (k - (perRow - 1) / 2) * p.holeSpacing + off;
        if (x - r < 2 || x + r > w - 2) continue;
        pts.push(slot && len > p.holeDiameter + 0.5 ? obround(x, y, p.holeDiameter, len, 12) : circlePolygon(x, y, r, 32));
      }
    }
    count = pts.length;
    mesh.append(floorSlab(p, 0, t - EPS, w, t + d + EPS, s, pts));
  } else {
    mesh.append(floorSlab(p, 0, t - EPS, w, t + d, s));
  }
  if (p.frontLip > 0) mesh.append(box(0, t + d - 2, s - EPS, w, t + d, s + p.frontLip));
  if (p.braces) {
    // Triangular end braces: they also stop things sliding off the ends.
    const bh = Math.min(h - s, d * 0.8);
    for (const x0 of [0, w - 2.4]) mesh.append(extrudeX([[t - EPS, s - EPS], [t + d * 0.8, s - EPS], [t - EPS, s + bh]], x0, x0 + 2.4));
  }
  return { mesh, hooks, pegs, clips, clipAt, holes: count, size: [w, t + d, h] };
}

function tray(p) {
  const w = p.width, th = p.trayHeight;
  let h = Math.max(p.height, th, p.tabHeight + p.lipDrop + 8);
  const keep = Math.max(1.2, p.wall) + 1;
  h = Math.max(h, clipRoom(p, keep));
  const { mesh, hooks, pegs, clips, clipAt } = plateWithHooks(w, h, p, { keepClear: keep });
  const t = p.plateThickness, d = p.depth, wl = p.wall, f = Math.max(1.2, wl);
  mesh.append(floorSlab(p, 0, t - EPS, w, t + d, f)); // floor
  mesh.append(box(0, t + d - wl, f - EPS, w, t + d, th)); // front
  mesh.append(box(0, t - EPS, f - EPS, wl, t + d, th)); // ends
  mesh.append(box(w - wl, t - EPS, f - EPS, w, t + d, th));
  const n = Math.max(0, Math.min(20, Math.round(p.dividers)));
  for (let k = 1; k <= n; k++) {
    const x = wl + ((w - 2 * wl) * k) / (n + 1);
    mesh.append(box(x - wl / 2, t - EPS, f - EPS, x + wl / 2, t + d - wl + EPS, th));
  }
  return { mesh, hooks, pegs, clips, clipAt, size: [w, t + d, h] };
}

// A shelf with a rim that holds a standard Gridfinity baseplate (made by the
// baseplate generator and printed flat as usual).
function gridfinityShelf(p, pitch = 42) {
  const inner = [p.unitsX * pitch + 0.6, p.unitsY * pitch + 0.6];
  const rim = 2, s = p.shelfThickness, rimH = 4;
  const w = inner[0] + 2 * rim;
  let h = Math.max(p.height, p.tabHeight + p.lipDrop + 8);
  const keep = p.shelfThickness + 5;
  h = Math.max(h, clipRoom(p, keep));
  const { mesh, hooks, pegs, clips, clipAt } = plateWithHooks(w, h, p, { keepClear: keep });
  const t = p.plateThickness, d = inner[1] + rim;
  mesh.append(floorSlab(p, 0, t - EPS, w, t + d, s));
  mesh.append(box(0, t + d - rim, s - EPS, w, t + d, s + rimH));
  mesh.append(box(0, t - EPS, s - EPS, rim, t + d, s + rimH));
  mesh.append(box(w - rim, t - EPS, s - EPS, w, t + d, s + rimH));
  if (p.braces) {
    const bh = Math.min(h - s, d * 0.6);
    for (const x0 of [0, w - rim]) mesh.append(extrudeX([[t - EPS, s + rimH - EPS], [t + d * 0.5, s + rimH - EPS], [t - EPS, s + rimH + bh * 0.6]], x0, x0 + rim));
  }
  return { mesh, hooks, pegs, clips, clipAt, size: [w, t + d, h], baseplate: { gridX: p.unitsX, gridY: p.unitsY } };
}

// A pegboard tile to print, front face up. The SKÅDIS pattern: 5 × 15 mm slots
// with round ends, in columns 20 mm apart, each column's slots 40 mm apart and
// every other column shifted 20 mm, so the rows interleave. Tiles are whole
// multiples of 40 mm, so the pattern carries on unbroken across a join.
//
// The front has a small chamfer all round and rounded corners. Tiles join with
// short lengths of 1.75 mm filament pushed into channels hidden inside the
// edges (nothing shows on the front). Corner screw holes are counterbored so
// the screw heads sit below the surface, and wall spacers (a separate part)
// hold the board 20 mm off the wall like IKEA's, so hooks can hang behind it.
export const PIN = { size: 2.1, depth: 6, z0: 1.5 }; // square channel for 1.75 mm filament (12 mm pins)

// The slot centres for a tile w × h (both multiples of the pitch).
export function slotCentres(w, h, p) {
  // Rows start 10 mm up (30 mm in the shifted columns). That's the one place a
  // seam can run between slots, so a tile above or beside carries the pattern on.
  const out = [];
  const colStep = p.pitchX / 2, rowStep = p.pitchY * 2; // 20 mm and 40 mm on SKÅDIS
  for (let j = 0; ; j++) {
    const x = colStep / 2 + j * colStep;
    if (x + p.slotWidth / 2 > w) break;
    for (let y = rowStep / 4 + (j % 2 ? rowStep / 2 : 0); y + p.slotHeight / 2 <= h - 0.5; y += rowStep) out.push([x, y]);
  }
  return out;
}

// Where the filament pins go: between the slots, one every 40 mm along each edge.
export function pinSpots(w, h, p) {
  const along = (len) => { const o = []; for (let v = p.pitchX / 2; v < len; v += p.pitchX) o.push(v); return o; };
  return { x: along(w), y: along(h) };
}

// A rounded rectangle 0..w × 0..h with square notches cut in from the edges (the pin channels).
function outlineWithNotches(w, h, r, notches) {
  const n = 6, pts = [];
  const arc = (cx, cy, a0) => { for (let i = 0; i <= n; i++) { const a = ((a0 + (90 * i) / n) * Math.PI) / 180; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
  const half = PIN.size / 2, d = PIN.depth;
  // Bottom edge, left to right.
  arc(r, r, 180);
  for (const x of notches.bottom) pts.push([x - half, 0], [x - half, d], [x + half, d], [x + half, 0]);
  arc(w - r, r, 270);
  for (const y of notches.right) pts.push([w, y - half], [w - d, y - half], [w - d, y + half], [w, y + half]);
  arc(w - r, h - r, 0);
  for (const x of [...notches.top].reverse()) pts.push([x + half, h], [x + half, h - d], [x - half, h - d], [x - half, h]);
  arc(r, h - r, 90);
  for (const y of [...notches.left].reverse()) pts.push([0, y + half], [d, y + half], [d, y - half], [0, y - half]);
  return pts;
}

function obround(cx, cy, w, hgt, seg = 14) {
  const r = w / 2, pts = [];
  for (let i = 0; i <= seg; i++) { const a = Math.PI + (i / seg) * Math.PI; pts.push([cx + r * Math.cos(a), cy - hgt / 2 + r + r * Math.sin(a)]); }
  for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI; pts.push([cx + r * Math.cos(a), cy + hgt / 2 - r + r * Math.sin(a)]); }
  return pts;
}

function panel(p) {
  const w = p.cols * p.pitchX, h = p.rows * p.pitchY * 2;
  const t = p.panelThickness, R = 4, ch = Math.min(0.8, t / 4);
  const slots = slotCentres(w, h, p).map(([x, y]) => obround(x, y, p.slotWidth, p.slotHeight));
  // Screw holes sit between slots, 20 mm in from each corner (clear of every slot and pin).
  const screws = p.screwHoles ? [[20, 20], [w - 20, 20], [20, h - 20], [w - 20, h - 20]].filter(([x, y], i, all) => all.findIndex(([x2, y2]) => x2 === x && y2 === y) === i) : [];
  const cw = (poly) => orient(poly, false);
  const holes = (screwR) => [...slots.map(cw), ...screws.map(([x, y]) => cw(circlePolygon(x, y, screwR, 28)))];
  const rect = { cx: w / 2, cy: h / 2, w, d: h, r: R };
  const mesh = new Mesh();
  const pins = pinSpots(w, h, p);
  const z1 = PIN.z0, z2 = PIN.z0 + PIN.size;
  if (p.joins) {
    // Back, middle (with the pin channels) and front layers.
    mesh.append(loftWithHoles([{ z: 0, rect }, { z: z1, rect }], holes(2.2), 6));
    mesh.append(extrudePolygon(orient(outlineWithNotches(w, h, R, { bottom: pins.x, top: pins.x, left: pins.y, right: pins.y }), true), holes(2.2), z1, z2));
  } else {
    mesh.append(loftWithHoles([{ z: 0, rect }, { z: z2, rect }], holes(2.2), 6));
  }
  // The front: counterbores for the screw heads and a chamfer round the edge.
  const cb = t - 1.6 > z2 ? t - 1.6 : z2;
  if (cb > z2) mesh.append(loftWithHoles([{ z: z2, rect }, { z: cb, rect }], holes(2.2), 6));
  mesh.append(loftWithHoles([{ z: cb, rect }, { z: t - ch, rect }, { z: t, rect: { ...rect, w: w - 2 * ch, d: h - 2 * ch, r: R - ch } }], holes(screws.length ? 4 : 2.2), 6));
  mesh.translate(-w / 2, -h / 2, 0);
  return { mesh, slots: slots.length, size: [w, h, t], tile: [w, h], pins: p.joins ? 2 * (pins.x.length + pins.y.length) : 0 };
}

// Wall spacers: round standoffs that sit behind the screw holes, so the board
// hangs off the wall (20 mm in all with a 5 mm board, like IKEA's) and hooks fit behind.
export function wallSpacers(p, count = 4) {
  const mesh = new Mesh();
  const L = p.standoff, gap = 16;
  for (let i = 0; i < count; i++) {
    const cx = (i - (count - 1) / 2) * gap;
    const rect = { cx, cy: 0, w: 12, d: 12, r: 6 };
    mesh.append(loftWithHoles([{ z: 0, rect }, { z: L - 0.6, rect }, { z: L, rect: { ...rect, w: 10.8, d: 10.8, r: 5.4 } }], [orient(circlePolygon(cx, 0, 2.3, 24), false)], 16));
  }
  return mesh;
}

// The part as it hangs (x along the wall, y out of it, z up), before it's laid
// down for printing.
function buildWall(p) {
  if (p.item === 'hook') return jHook(p);
  if (p.item === 'double') return doubleHook(p);
  if (p.item === 'shelf') return shelf(p, false);
  if (p.item === 'holder') return shelf(p, true);
  if (p.item === 'tray') return tray(p);
  if (p.item === 'gridfinity') return gridfinityShelf(p);
  return fitStrip(p);
}

export function generateSkadis(options = {}) {
  const p = normaliseSkadis(options);
  if (p.item === 'board') return { ...panel(p), printed: 'flat', spacers: p.standoff > 0 ? wallSpacers(p) : null };
  const r = buildWall(p);
  // The single hook prints on its side (its arm is the full width, and strongest
  // printed along its length); everything else stands as it hangs, floor down.
  const side = p.item === 'hook' || p.item === 'fit';
  if (side) toPrint(r.mesh);
  else upright(r.mesh);
  return { ...r, printed: side ? 'side' : 'upright', clipSheet: r.clips ? clipSheet(p, r.clips) : null };
}

/**
 * The part hanging on a piece of pegboard, with its clips pushed through: for
 * the preview only, so it's clear how the pieces go together. Returns
 * { board, part, clips } meshes, or null for the pegboard tile itself.
 */
export function skadisOnBoard(options = {}) {
  const p = normaliseSkadis(options);
  if (p.item === 'board' || p.item === 'fit') return null;
  const r = buildWall(p);
  const tab = p.slotWidth - 2 * p.clearance;
  const clips = new Mesh();
  const prof = clipProfile(p);
  for (const [x0, , x1, z1] of r.clipAt) {
    const cx = (x0 + x1) / 2;
    clips.append(side(prof, cx - tab / 2, cx + tab / 2).translate(0, 0, z1));
  }
  // Each tab rests on the bottom of its slot; the rest of the board follows the
  // SKÅDIS pattern from there (rows pitchY apart, every other row shifted half a column).
  let cx0, az1;
  if (r.hangAt) [cx0, az1] = r.hangAt;
  else { const [ax0, , ax1, top] = r.clipAt[0]; cx0 = (ax0 + ax1) / 2; az1 = top; }
  const zb0 = az1 - p.tabHeight - p.clearance;
  const b = r.mesh.bounds();
  const m = 26;
  const X0 = Math.min(b.min[0], 0) - m, X1 = Math.max(b.max[0], 0) + m;
  const Z0 = b.min[2] - m, Z1 = b.max[2] + m;
  const rects = [];
  const half = p.pitchX / 2;
  for (let row = Math.floor((Z0 - zb0) / p.pitchY) - 1; row <= Math.ceil((Z1 - zb0) / p.pitchY) + 1; row++) {
    const z = zb0 + row * p.pitchY;
    const shift = Math.abs(row) % 2 ? half : 0;
    for (let k = Math.floor((X0 - cx0) / p.pitchX) - 1; k <= Math.ceil((X1 - cx0) / p.pitchX) + 1; k++) {
      const x = cx0 + shift + k * p.pitchX;
      if (x - p.slotWidth / 2 < X0 + 3 || x + p.slotWidth / 2 > X1 - 3 || z < Z0 + 3 || z + p.slotHeight > Z1 - 3) continue;
      rects.push([x - p.slotWidth / 2 - X0, z - Z0, x + p.slotWidth / 2 - X0, z + p.slotHeight - Z0]);
    }
  }
  const board = backPlate(X1 - X0, Z1 - Z0, p.boardThickness, rects, true).translate(X0, -p.boardThickness, Z0);
  // Turn it round (a half turn about z), so the viewer's front view looks at the front of the board.
  for (const m of [board, r.mesh, clips]) {
    const q = m.positions;
    for (let i = 0; i < q.length; i += 3) { q[i] = -q[i]; q[i + 1] = -q[i + 1]; }
  }
  return { board, part: r.mesh, clips };
}
