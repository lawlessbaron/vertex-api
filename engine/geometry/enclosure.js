// Enclosures for electronics: Raspberry Pi, Arduino, ESP32 and custom boards.
// A base (floor, walls with port openings, standoffs or a cradle) and a lid
// (vents, fan, header slot, and your own text or logo as a flush two-colour
// inlay). Everything is built from closed shells that slicers union, and
// both parts print without supports: the base floor-down, the lid face-down.
//
// Board data is in board coordinates: (0, 0) is the board's lower-left
// corner seen from above, with the "front" edge along y = 0. Port openings are
// generous (1 mm all round) so small differences between board revisions still
// fit. Ports marked `open` are cut down from the top of the wall instead of as
// a window, so wide openings never need a long bridge.
import { Mesh } from './mesh.js';
import { extrudePolygon, circlePolygon, groupLoops, simplifyClosed } from './polygon.js';
import { Grid, fillPolygon, traceContours } from './raster.js';
import { textPolygons, textUnits } from './font.js';
import { placeBadge, recessedSlab } from './brand.js';

// side: front (y = 0) | back (y = d) | left (x = 0) | right (x = w)
// at: centre along that side (board mm); width; z0/z1: height relative to the top of the PCB.
export const BOARDS = {
  pi4: {
    name: 'Raspberry Pi 4 Model B', group: 'Raspberry Pi', w: 85, d: 56, pcb: 1.5, under: 3, above: 16.5,
    holes: [[3.5, 3.5], [61.5, 3.5], [3.5, 52.5], [61.5, 52.5]], hole: 'm25',
    ports: [
      { side: 'front', at: 11.2, width: 9.5, z0: 0, z1: 3.6, label: 'USB-C power' },
      { side: 'front', at: 26, width: 7.8, z0: 0, z1: 3.4, label: 'Micro HDMI 0' },
      { side: 'front', at: 39.5, width: 7.8, z0: 0, z1: 3.4, label: 'Micro HDMI 1' },
      { side: 'front', at: 54, width: 7, z0: 0, z1: 6.2, label: 'Audio' },
      { side: 'right', at: 9, width: 15, z0: 0, z1: 16.2, label: 'USB 3' },
      { side: 'right', at: 27, width: 15, z0: 0, z1: 16.2, label: 'USB 2' },
      { side: 'right', at: 45.75, width: 16.2, z0: 0, z1: 13.6, label: 'Ethernet' },
      { side: 'left', at: 28, width: 12, z0: -3, z1: 0.3, label: 'microSD' },
    ],
    gpio: [7, 49.5, 58, 55.6], cpu: [29, 32.5],
  },
  pi5: {
    name: 'Raspberry Pi 5', group: 'Raspberry Pi', w: 85, d: 56, pcb: 1.5, under: 3, above: 17,
    holes: [[3.5, 3.5], [61.5, 3.5], [3.5, 52.5], [61.5, 52.5]], hole: 'm25',
    ports: [
      { side: 'front', at: 26, width: 46, z0: 0, z1: 6, label: 'USB-C, HDMI and power button', open: true },
      { side: 'right', at: 28, width: 54, z0: 0, z1: 16.5, label: 'USB and Ethernet', open: true },
      { side: 'left', at: 28, width: 12, z0: -3, z1: 0.3, label: 'microSD' },
    ],
    gpio: [7, 49.5, 58, 55.6], cpu: [29, 32.5],
  },
  zero2: {
    name: 'Raspberry Pi Zero 2 W', group: 'Raspberry Pi', w: 65, d: 30, pcb: 1.4, under: 2, above: 4.5,
    holes: [[3.5, 3.5], [61.5, 3.5], [3.5, 26.5], [61.5, 26.5]], hole: 'm25',
    ports: [
      { side: 'front', at: 12.4, width: 12.5, z0: 0, z1: 3.8, label: 'Mini HDMI' },
      { side: 'front', at: 41.4, width: 9, z0: 0, z1: 3.2, label: 'USB' },
      { side: 'front', at: 54, width: 9, z0: 0, z1: 3.2, label: 'Power' },
      { side: 'left', at: 16.9, width: 13, z0: -0.5, z1: 1.8, label: 'microSD' },
      { side: 'right', at: 15, width: 18, z0: 0, z1: 2.5, label: 'Camera cable' },
    ],
    gpio: [7, 23.5, 58, 29.6], cpu: [32.5, 15],
  },
  uno: {
    name: 'Arduino Uno R3 / R4', group: 'Arduino', w: 68.6, d: 53.3, pcb: 1.6, under: 2.5, above: 11.5,
    holes: [[13.97, 2.54], [15.24, 50.8], [66.04, 7.62], [66.04, 35.56]], hole: 'm3',
    ports: [
      { side: 'left', at: 38.1, width: 13.5, z0: -0.5, z1: 11.5, label: 'USB' },
      { side: 'left', at: 7.6, width: 10, z0: -0.5, z1: 11.5, label: 'Power jack' },
    ],
    gpio: [17, 47, 66, 53.3], cpu: [40, 20],
  },
  mega: {
    name: 'Arduino Mega 2560', group: 'Arduino', w: 101.6, d: 53.3, pcb: 1.6, under: 2.5, above: 11.5,
    holes: [[13.97, 2.54], [15.24, 50.8], [66.04, 7.62], [66.04, 35.56], [90.17, 50.8], [96.52, 2.54]], hole: 'm3',
    ports: [
      { side: 'left', at: 38.1, width: 13.5, z0: -0.5, z1: 11.5, label: 'USB' },
      { side: 'left', at: 7.6, width: 10, z0: -0.5, z1: 11.5, label: 'Power jack' },
    ],
    gpio: [17, 47, 99, 53.3], cpu: [50, 25],
  },
  nano: {
    name: 'Arduino Nano', group: 'Arduino', w: 45, d: 18, pcb: 1.6, under: 3, above: 5,
    holes: [], ports: [{ side: 'left', at: 9, width: 10, z0: -0.5, z1: 4.5, label: 'USB' }],
    gpio: null, cpu: [22.5, 9],
  },
  esp32: {
    name: 'ESP32 DevKitC', group: 'ESP32', w: 54.4, d: 27.9, pcb: 1.6, under: 3, above: 5,
    holes: [], ports: [{ side: 'left', at: 13.95, width: 10, z0: -0.5, z1: 4.5, label: 'USB' }],
    gpio: null, cpu: [35, 14],
  },
};

export const ENCLOSURE_STYLES = {
  clean: { name: 'Clean', vents: 'slots', radius: 3 },
  retro: { name: 'Retro console', vents: 'grille', radius: 1.5 },
  scifi: { name: 'Sci-fi', vents: 'hex', radius: 4 },
  vertex: { name: 'VERTEX', vents: 'tri', radius: 3 },
  arcade: { name: 'Arcade', vents: 'dots', radius: 5 },
};
const HOLE = { m25: { pilot: 2.2, insert: 3.6, through: 2.8 }, m3: { pilot: 2.6, insert: 4.2, through: 3.3 } };
const INSERT_DEPTH = { m25: 5, m3: 6 };
const FANS = { 25: { open: 23, pitch: 20 }, 30: { open: 28, pitch: 24 }, 40: { open: 38, pitch: 32 } };

export const ENCLOSURE_DEFAULTS = {
  board: 'pi4', style: 'clean', vents: 'auto', wall: 2, floor: 2, gap: 1, standoff: 4, headroom: 1,
  radius: 0, mount: 'insert', ribs: 4, ribLength: 3, postWall: 0, fan: 0, gpioSlot: true, ears: false,
  lidText: '', textSize: 7, logo: null, logoSize: 30, inlay: true,
  brandMark: true, // the VERTEX badge, recessed into the underside
  customW: 70, customD: 50, customAbove: 12, customHoleX: 58, customHoleY: 40,
};

const LIP = 3, TOP = 2, INLAY = 0.6, CLEAR = 0.25;

function boardOf(o) {
  if (o.board !== 'custom') return BOARDS[o.board] || BOARDS.pi4;
  const w = +o.customW, d = +o.customD, hx = +o.customHoleX, hy = +o.customHoleY;
  const ox = (w - hx) / 2, oy = (d - hy) / 2;
  const holes = hx > 0 && hy > 0 && ox >= 2 && oy >= 2 ? [[ox, oy], [ox + hx, oy], [ox, oy + hy], [ox + hx, oy + hy]] : [];
  return { name: 'Custom board', w, d, pcb: 1.6, under: 3, above: +o.customAbove, holes, hole: 'm3', ports: [], gpio: null, cpu: [w / 2, d / 2] };
}

// A rounded rectangle, counter-clockwise.
export function rr(x0, y0, x1, y1, r, seg = 8) {
  r = Math.max(0, Math.min(r, (x1 - x0) / 2 - 0.01, (y1 - y0) / 2 - 0.01));
  if (r < 0.05) return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const pts = [];
  const c = [[x1 - r, y0 + r, -90], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, 90], [x0 + r, y0 + r, 180]];
  for (const [cx, cy, a0] of c) for (let s = 0; s <= seg; s++) {
    const a = ((a0 + (90 * s) / seg) * Math.PI) / 180;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}
// Remap an extrusion made in (u, v, w) into world axes with a cyclic swap, which keeps the winding right.
function remap(mesh, fn) {
  const out = new Mesh();
  const p = mesh.positions;
  for (let i = 0; i < p.length; i += 3) { const [x, y, z] = fn(p[i], p[i + 1], p[i + 2]); out.positions.push(x, y, z); }
  out.indices = mesh.indices.slice();
  return out;
}
// A wall slab: 2D shape in (along, z), extruded across the wall's thickness.
export function wallSlab(axis, outline, holes, t0, t1) {
  if (axis === 'x') { // along x, thickness in y: world (x, y, z) = (v, w, u), so feed [z, along]
    const sw = (poly) => poly.map(([a, z]) => [z, a]);
    return remap(extrudePolygon(sw(outline), holes.map(sw), t0, t1), (u, v, w) => [v, w, u]);
  }
  // along y, thickness in x: world (x, y, z) = (w, u, v), so feed [along, z]
  return remap(extrudePolygon(outline, holes, t0, t1), (u, v, w) => [w, u, v]);
}
function flipZ(mesh, z0) {
  const out = remap(mesh, (x, y, z) => [x, y, z0 - z]);
  const ix = out.indices;
  for (let t = 0; t < ix.length; t += 3) [ix[t + 1], ix[t + 2]] = [ix[t + 2], ix[t + 1]];
  return out;
}
const overlaps = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
const bboxOf = (poly) => poly.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);

// Text and a traced logo, unioned on a fine grid and traced back to clean outlines.
function artwork(o, box) {
  const [x0, y0, x1, y1] = box;
  const res = 0.12;
  const W = Math.ceil((x1 - x0) / res) + 4, H = Math.ceil((y1 - y0) / res) + 4;
  const grid = new Grid(W, H, x0 - 2 * res, y0 - 2 * res, res);
  let any = false;
  const cx = (x0 + x1) / 2;
  const text = String(o.lidText || '').trim().slice(0, 24);
  const logo = Array.isArray(o.logo) && o.logo.length ? o.logo : null;
  let textTop = y0;
  if (text) {
    const units = textUnits(text);
    const h = Math.max(2.5, Math.min(+o.textSize || 7, ((x1 - x0) * 0.92 / units) * 6, y1 - y0));
    const width = (units / 6) * h;
    const ty = logo ? y0 + 1 : (y0 + y1) / 2 - h / 2;
    for (const poly of textPolygons(text.toUpperCase(), cx - width / 2, ty, h, Math.max(0.9, h * 0.18))) { fillPolygon(grid, poly, 1); any = true; }
    textTop = ty + h + 2;
  }
  if (logo) {
    const size = Math.min(+o.logoSize || 30, x1 - x0, y1 - textTop);
    const ly = text ? textTop : (y0 + y1) / 2 - size / 2;
    const place = ([u, v]) => [cx - size / 2 + u * size, ly + v * size];
    const groups = logo.slice(0, 200);
    for (const g of groups) if (Array.isArray(g.outer) && g.outer.length > 2) { fillPolygon(grid, g.outer.map(place), 1); any = true; }
    for (const g of groups) for (const h of g.holes || []) if (h.length > 2) fillPolygon(grid, h.map(place), 0);
  }
  if (!any) return [];
  return groupLoops(traceContours(grid).map((l) => simplifyClosed(l, 0.04)).filter((l) => l.length >= 3))
    .map((g) => ({ outer: g.outer, holes: g.holes }));
}

function ventHoles(kind, region, avoid) {
  const [x0, y0, x1, y1] = region;
  const out = [];
  const keep = (poly) => { const b = bboxOf(poly); if (b[0] < x0 || b[1] < y0 || b[2] > x1 || b[3] > y1) return; if (avoid.some((a) => overlaps(b, a))) return; out.push(poly); };
  if (kind === 'none') return out;
  if (kind === 'slots' || kind === 'grille') {
    const w = kind === 'grille' ? 1.6 : 2.2, gap = kind === 'grille' ? 3.2 : 4.4;
    const len = Math.min(kind === 'grille' ? x1 - x0 : 18, x1 - x0);
    for (let y = y0 + 1; y + w <= y1 - 1; y += gap) {
      if (kind === 'grille') { keep(rr(x0, y, x0 + len, y + w, w / 2 - 0.01, 3)); continue; }
      for (let x = x0; x + len <= x1; x += len + 3) keep(rr(x, y, x + len, y + w, w / 2 - 0.01, 3));
    }
    // Grille lines that hit something are split into shorter runs.
    if (kind === 'grille') {
      for (let y = y0 + 1; y + w <= y1 - 1; y += gap) {
        if (out.some((p) => Math.abs(bboxOf(p)[1] - y) < 0.01)) continue;
        for (let x = x0; x + 10 <= x1; x += 13) keep(rr(x, y, x + 10, y + w, w / 2 - 0.01, 3));
      }
    }
  } else if (kind === 'hex') {
    const r = 3, dx = r * Math.sqrt(3) + 1.4, dy = r * 1.5 + 1.2;
    for (let j = 0, y = y0 + r; y + r <= y1; j++, y += dy) for (let x = x0 + r + (j % 2 ? dx / 2 : 0); x + r <= x1; x += dx) {
      keep(Array.from({ length: 6 }, (_, k) => { const a = (Math.PI / 3) * k + Math.PI / 6; return [x + r * Math.cos(a), y + r * Math.sin(a)]; }));
    }
  } else if (kind === 'tri') {
    const s = 6, h = s * 0.866, gap = 1.6;
    for (let j = 0, y = y0; y + h <= y1; j++, y += h + gap) for (let i = 0, x = x0; x + s <= x1; i++, x += s / 2 + gap) {
      keep((i + j) % 2 ? [[x, y + h], [x + s / 2, y], [x + s, y + h]] : [[x, y], [x + s, y], [x + s / 2, y + h]]);
    }
  } else if (kind === 'dots') {
    for (let y = y0 + 2; y + 2 <= y1; y += 4.6) for (let x = x0 + 2; x + 2 <= x1; x += 4.6) keep(circlePolygon(x, y, 1.5, 16));
  }
  return out;
}

export function generateEnclosure(options = {}) {
  const o = { ...ENCLOSURE_DEFAULTS, ...options };
  const b = boardOf(o);
  const style = ENCLOSURE_STYLES[o.style] || ENCLOSURE_STYLES.clean;
  const t = Math.max(1.2, +o.wall), F = Math.max(1.2, +o.floor), g = Math.max(0.3, +o.gap);
  // Heat-set inserts need a bore a little deeper than the insert (M2.5 ≈ 4 mm, M3 ≈ 5 mm long).
  const S = Math.max(b.under, +o.standoff, b.holes.length && o.mount === 'insert' ? INSERT_DEPTH[b.hole] || 6 : 0);
  const ri = Math.max(1, (+o.radius || style.radius) - t + 1);
  const zB = F + S + b.pcb; // top of the PCB
  const H = zB + b.above + (+o.headroom || 0) + LIP; // top of the walls
  const cav = [-g, -g, b.w + g, b.d + g];
  const out = [cav[0] - t, cav[1] - t, cav[2] + t, cav[3] + t];
  const R = ri + t;
  const base = new Mesh();

  // Floor, and through-holes when the board screws in from below.
  const hole = HOLE[b.hole] || HOLE.m3;
  const floorHoles = o.mount === 'through' ? b.holes.map(([x, y]) => circlePolygon(x, y, hole.through / 2, 20)) : [];
  // The underside lies on the bed: the VERTEX badge is recessed into it, clear of the board's screws.
  const badge = o.brandMark !== false && F >= 1.6 ? placeBadge(out[0], out[1], out[2], out[3], [...floorHoles, ...b.holes.map(([x, y]) => [x, y, 4.5])], { margin: t + 3 }) : null;
  if (badge) base.append(recessedSlab(rr(...out, R), floorHoles, badge.groups, 0, F, 0.6));
  else base.append(extrudePolygon(rr(...out, R), floorHoles, 0, F));

  // Walls, with port openings.
  const walls = [
    { side: 'front', axis: 'x', a0: cav[0] + ri, a1: cav[2] - ri, t0: out[1], t1: cav[1] },
    { side: 'back', axis: 'x', a0: cav[0] + ri, a1: cav[2] - ri, t0: cav[3], t1: out[3] },
    { side: 'left', axis: 'y', a0: cav[1] + ri, a1: cav[3] - ri, t0: out[0], t1: cav[0] },
    { side: 'right', axis: 'y', a0: cav[1] + ri, a1: cav[3] - ri, t0: cav[2], t1: out[2] },
  ];
  const openings = [];
  for (const w of walls) {
    const notches = [], holes = [];
    for (const p of b.ports.filter((q) => q.side === w.side)) {
      let lo = p.at - p.width / 2 - 1, hi = p.at + p.width / 2 + 1;
      lo = Math.max(lo, w.a0 + 0.8); hi = Math.min(hi, w.a1 - 0.8);
      if (hi - lo < 2) continue;
      const zlo = Math.max(F + 0.4, zB + p.z0 - 1), zhi = zB + p.z1 + 1;
      openings.push(p.label);
      if (p.open || zhi > H - 1.2) notches.push([lo, hi, zlo]);
      else holes.push(rr(lo, zlo, hi, zhi, 0)); // flat tops bridge cleanly; rounded corners would overhang
    }
    notches.sort((a, c) => c[0] - a[0]);
    const outline = [[w.a0, 0], [w.a1, 0], [w.a1, H]];
    for (const [lo, hi, zlo] of notches) outline.push([hi, H], [hi, zlo], [lo, zlo], [lo, H]);
    outline.push([w.a0, H]);
    base.append(wallSlab(w.axis, outline, holes, w.t0, w.t1));
  }
  // Rounded corners: quarter rings.
  const corner = (cx, cy, a0) => {
    const pts = [];
    for (let s = 0; s <= 8; s++) { const a = ((a0 + (90 * s) / 8) * Math.PI) / 180; pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
    for (let s = 8; s >= 0; s--) { const a = ((a0 + (90 * s) / 8) * Math.PI) / 180; pts.push([cx + ri * Math.cos(a), cy + ri * Math.sin(a)]); }
    base.append(extrudePolygon(pts, [], 0, H));
  };
  corner(cav[0] + ri, cav[1] + ri, 180); corner(cav[2] - ri, cav[1] + ri, 270); corner(cav[2] - ri, cav[3] - ri, 0); corner(cav[0] + ri, cav[3] - ri, 90);

  // Standoffs (from z = 0, so the floor fills their holes below its top), or a cradle for boards without holes.
  if (b.holes.length) {
    const bore = o.mount === 'insert' ? hole.insert : o.mount === 'through' ? hole.through : hole.pilot;
    // Pressing a hot insert in, or driving a screw, pushes the post sideways, so
    // posts are thick-walled (about twice the bore for inserts) and braced by
    // four ribs into the floor. The ribs taper as they rise: nothing overhangs.
    // postWall 0 = automatic (2 mm round an insert, 1.8 mm round a screw).
    const r = bore / 2 + (+o.postWall > 0 ? Math.max(1.2, +o.postWall) : o.mount === 'insert' ? 2 : 1.8);
    const rib = 0.6, h = F + Math.max(1.5, S * 0.7), r0 = r - 0.4, maxL = Math.max(0, Math.min(8, +o.ribLength));
    const nRibs = [0, 2, 4].includes(+o.ribs) ? +o.ribs : 4;
    // A rib may run into the wall but never out through it.
    const room = (d) => Math.min(maxL, d + t * 0.5 - r0);
    for (const [x, y] of b.holes) {
      base.append(extrudePolygon(circlePolygon(x, y, r, 32), [circlePolygon(x, y, bore / 2, 20)], 0, F + S));
      if (!nRibs || maxL < 0.5) continue;
      const [lx, rx, ly, ry] = [room(x - cav[0]), room(cav[2] - x), room(y - cav[1]), room(cav[3] - y)];
      // Two ribs: the pair pointing along the board's longer side.
      const alongX = b.w >= b.d;
      if ((nRibs === 4 || alongX) && rx > 0.5) base.append(wallSlab('x', [[x + r0, 0], [x + r0 + rx, 0], [x + r0 + rx, F], [x + r0, h]], [], y - rib, y + rib));
      if ((nRibs === 4 || alongX) && lx > 0.5) base.append(wallSlab('x', [[x - r0 - lx, 0], [x - r0, 0], [x - r0, h], [x - r0 - lx, F]], [], y - rib, y + rib));
      if ((nRibs === 4 || !alongX) && ry > 0.5) base.append(wallSlab('y', [[y + r0, 0], [y + r0 + ry, 0], [y + r0 + ry, F], [y + r0, h]], [], x - rib, x + rib));
      if ((nRibs === 4 || !alongX) && ly > 0.5) base.append(wallSlab('y', [[y - r0 - ly, 0], [y - r0, 0], [y - r0, h], [y - r0 - ly, F]], [], x - rib, x + rib));
    }
  } else {
    const pad = (x, y) => base.append(extrudePolygon(rr(x - 2.5, y - 2.5, x + 2.5, y + 2.5, 0.8, 3), [], 0, F + S));
    for (const [x, y] of [[3, 3], [b.w - 3, 3], [3, b.d - 3], [b.w - 3, b.d - 3]]) pad(x, y);
    // Locators just outside each corner, a little above the board.
    const up = zB + 1.5;
    for (const [x, y, sx, sy] of [[0, 0, -1, -1], [b.w, 0, 1, -1], [0, b.d, -1, 1], [b.w, b.d, 1, 1]]) {
      const gx = x + sx * 0.3, gy = y + sy * 0.3;
      base.append(extrudePolygon(rr(Math.min(gx, gx + sx * 1.6), Math.min(gy - sy * 6, gy + sy * 1.6), Math.max(gx, gx + sx * 1.6), Math.max(gy - sy * 6, gy + sy * 1.6), 0.3, 2), [], 0, up));
      base.append(extrudePolygon(rr(Math.min(gx - sx * 6, gx + sx * 1.6), Math.min(gy, gy + sy * 1.6), Math.max(gx - sx * 6, gx + sx * 1.6), Math.max(gy, gy + sy * 1.6), 0.3, 2), [], 0, up));
    }
  }

  // Screw ears, for mounting it to a desk, a wall or a sim rig.
  if (o.ears) {
    const ymid = (out[1] + out[3]) / 2;
    for (const [xa, xb] of [[out[0] - 12, out[0] + 1], [out[2] - 1, out[2] + 12]]) {
      const cx = xa < out[0] ? out[0] - 6 : out[2] + 6;
      base.append(extrudePolygon(rr(xa, ymid - 8, xb, ymid + 8, 3, 4), [rr(cx - 1.8, ymid - 3.5, cx + 1.8, ymid + 3.5, 1.79, 4)], 0, 3));
    }
  }

  // ---- Lid, built face-down: plate z 0..TOP, lip above it.
  const lid = new Mesh();
  const inner = [cav[0] + CLEAR, cav[1] + CLEAR, cav[2] - CLEAR, cav[3] - CLEAR];
  const lipIn = [inner[0] + 1.6, inner[1] + 1.6, inner[2] - 1.6, inner[3] - 1.6];
  const avoid = [];
  const plateHoles = [];
  // The fan over the processor: the size asked for if the lid has room for it (1 mm all round inside the lip),
  // else the biggest that does, else none. A fan wider than the lid tore its plate open (a Nano with a 40 mm fan).
  const room = Math.min(lipIn[2] - lipIn[0], lipIn[3] - lipIn[1]) - 2;
  const fanSize = FANS[o.fan] ? Object.keys(FANS).map(Number).filter((k) => k <= Number(o.fan) && FANS[k].open <= room).pop() || 0 : 0;
  const fanNote = FANS[o.fan] && fanSize !== Number(o.fan) ? (fanSize ? `A ${o.fan} mm fan is wider than this lid (${room.toFixed(0)} mm inside), so it takes a ${fanSize} mm fan.` : `No fan: this lid is ${room.toFixed(0)} mm across inside, too small even for a 25 mm fan.`) : null;
  const fan = FANS[fanSize];
  if (fan) {
    const [fx, fy] = b.cpu;
    const cx = Math.min(Math.max(fx, lipIn[0] + fan.open / 2 + 1), lipIn[2] - fan.open / 2 - 1);
    const cy = Math.min(Math.max(fy, lipIn[1] + fan.open / 2 + 1), lipIn[3] - fan.open / 2 - 1);
    plateHoles.push(circlePolygon(cx, cy, fan.open / 2, 48));
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) plateHoles.push(circlePolygon(cx + (sx * fan.pitch) / 2, cy + (sy * fan.pitch) / 2, 1.6, 16));
    avoid.push([cx - fan.open / 2 - 3, cy - fan.open / 2 - 3, cx + fan.open / 2 + 3, cy + fan.open / 2 + 3]);
  }
  if (o.gpioSlot && b.gpio) {
    const [gx0, gy0, gx1, gy1] = b.gpio;
    const s = [Math.max(gx0, lipIn[0] + 1), Math.max(gy0, lipIn[1] + 1), Math.min(gx1, lipIn[2] - 1), Math.min(gy1, lipIn[3] - 1)];
    if (s[2] - s[0] > 4 && s[3] - s[1] > 2) {
      if (!avoid.some((a) => overlaps(s, a))) { plateHoles.push(rr(...s, 1, 3)); avoid.push([s[0] - 2, s[1] - 2, s[2] + 2, s[3] + 2]); }
    }
  }
  // Artwork in the middle of the lid, clear of the fan.
  const artBox = [lipIn[0] + 3, lipIn[1] + 3, lipIn[2] - 3, lipIn[3] - 3];
  let art = [];
  if (String(o.lidText || '').trim() || (Array.isArray(o.logo) && o.logo.length)) {
    const free = fan ? (avoid[0][0] - artBox[0] > artBox[2] - avoid[0][2] ? [artBox[0], artBox[1], avoid[0][0] - 1, artBox[3]] : [avoid[0][2] + 1, artBox[1], artBox[2], artBox[3]]) : artBox;
    if (free[2] - free[0] > 12) art = artwork(o, free);
    if (art.length) { const bb = art.map((a) => bboxOf(a.outer)).reduce((a, c) => [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[2]), Math.max(a[3], c[3])]); avoid.push([bb[0] - 2, bb[1] - 2, bb[2] + 2, bb[3] + 2]); }
  }
  const ventKind = o.vents === 'auto' ? style.vents : o.vents;
  plateHoles.push(...ventHoles(ventKind, [lipIn[0] + 2, lipIn[1] + 2, lipIn[2] - 2, lipIn[3] - 2], avoid));

  const plateOutline = rr(...out, R);
  if (art.length) {
    lid.append(extrudePolygon(plateOutline, [...plateHoles, ...art.map((a) => a.outer)], 0, INLAY));
    for (const a of art) for (const h of a.holes) lid.append(extrudePolygon(h, [], 0, INLAY)); // islands (the middle of an O)
    lid.append(extrudePolygon(plateOutline, plateHoles, INLAY, TOP));
  } else lid.append(extrudePolygon(plateOutline, plateHoles, 0, TOP));
  lid.append(extrudePolygon(rr(...inner, Math.max(0.3, ri - CLEAR)), [rr(...lipIn, Math.max(0.3, ri - CLEAR - 1.6))], TOP, TOP + LIP));
  let inlay = null;
  if (art.length && o.inlay !== false) {
    inlay = new Mesh();
    for (const a of art) inlay.append(extrudePolygon(a.outer, a.holes, 0, INLAY));
  }

  const size = [out[2] - out[0] + (o.ears ? 22 : 0), out[3] - out[1], H + TOP];
  return {
    base, lid, inlay,
    lidAssembled: flipZ(lid, H + TOP), inlayAssembled: inlay ? flipZ(inlay, H + TOP) : null,
    board: b, openings, size,
    screws: b.holes.length, hole: b.hole, mount: o.mount, fan: fanSize, fanNote, vents: ventKind,
  };
}
