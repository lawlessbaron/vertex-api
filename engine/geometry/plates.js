import { Mesh } from './mesh.js';
import { SPEC } from './spec.js';
import { box, loftRing } from './primitives.js';
import { circlePolygon, extrudePolygon } from './polygon.js';

// One engine for every baseplate: a grid (or a drawer to fill), optionally
// split into tiles that fit a print bed, in one of three styles:
//   frame  – pockets only, the classic open baseplate
//   lite   – pockets on a thin lattice (light, and it can take clips)
//   solid  – pockets on a solid bottom (magnets, weights, screws)
// Tiles can be joined with printed bowtie clips. Lite and solid plates take
// them in the bottom layer; frame plates (no bottom) take smaller clips in
// sockets cut into the foot of the walls where two tiles meet.

export const PLATE_DEFAULTS = {
  sizeMode: 'grid', // 'grid' or 'drawer'
  gridX: 4,
  gridY: 3,
  drawerW: 400,
  drawerD: 300,
  border: true, // pad out to the drawer walls
  borderMode: 'attached', // attached to the tiles, or printed as separate spacers
  alignX: 'center', // where the grid sits when there is spare room: start | center | end
  alignY: 'center',
  pitchX: SPEC.pitch,
  pitchY: SPEC.pitch,
  style: 'frame',
  thickness: 2.2, // lite lattice thickness, or solid bottom thickness
  split: false,
  printer: 'bambu-lab-p1s',
  bedX: 256,
  bedY: 256,
  bedMargin: 0,
  splitMode: 'even', // even | largest
  connectors: 'clips', // clips | none
  spareClips: 0,
  magnets: false,
  crushRibs: true,
  weighted: false,
  screws: 'none', // none | countersunk | counterbored | plain
  wall: 'none', // none | screws (countersunk from the front) | keyholes (hang on screws, cut from the back) | tslot (bolts into aluminium profile)
  tslotProfile: '2020', // 2020 | 3030 | 4040: the profile the plate bolts onto
  tslotRails: 2, // how many rails (profile lengths) run under the plate, left to right
  tslotSpacing: 0, // rail centre to rail centre, mm (0: under the first and last rows)
  tslotEvery: 2, // a bolt in every Nth cell along each rail (always the first and last)
  wallLock: 'screws', // on a wall, what holds the bins in: screws (M3 pilot holes under every bin foot) | magnets | both
  latticeInset: 6,
  clipNeck: 2,
  clipEnd: 3.5,
  clipLength: 5,
  clipClearance: 0.15,
  segments: 6,
};

const EPS = 1e-6;
export const FRAME_CLIP = { length: 1.7, neck: 1.4, end: 3, height: 1.8 };

// Normalise old settings (the first "Lite plates" generator) to this engine.
export function normalisePlate(o = {}) {
  const p = { ...PLATE_DEFAULTS, ...o };
  if (o.bed && !o.bedX) {
    p.bedX = p.bedY = o.bed;
    p.split = true;
    if (o.style === undefined) p.style = 'lite';
  }
  if (o.web && !o.thickness) p.thickness = o.web;
  if (o.bottom !== undefined && o.style === undefined) {
    p.style = o.bottom > 0 ? 'solid' : 'frame';
    if (o.bottom > 0) p.thickness = o.bottom;
  }
  if (o.drawerW && o.sizeMode === undefined && (o.gridX === undefined || o.bed)) p.sizeMode = 'drawer';
  // On a wall, magnets (alone or with screws) hold the bins in.
  if (onWall(p) && (p.wallLock === 'magnets' || p.wallLock === 'both')) p.magnets = true;
  return p;
}
// Screwed or hung on a wall (T-slot plates usually lie flat on a bench frame).
const onWall = (p) => p.wall === 'screws' || p.wall === 'keyholes';

// Magnets, weights or screw holes: every style can have them. A frame plate
// that has any of them gets a thin lattice floor to hold them.
export const plateFeatures = (p) => Boolean(p.magnets || p.weighted || (p.screws && p.screws !== 'none') || (p.wall && p.wall !== 'none'));

// Wall mounting. Screws: countersunk from the pocket side, so the head sits
// flush under the bin. Keyholes: a wide channel from the back for the screw
// head, and a narrow slot above it, so the plate drops onto screws in the wall.
export const WALL = { pilot: 2.6, screw: 4.5, sinkD: 9, sinkDepth: 2.4, head: 8.6, slot: 4.4, travel: 8, channel: 2.6, taper: 2.4, roof: 1.2 };
// T-slot: countersunk bolts from the pocket side, down into T-nuts in the
// profile's slot. The bolt suits the slot: M5 for 20 series, M6 for 30 and 40.
// d: clearance, head: countersink diameter, depth: countersink depth (a
// DIN 7991 / ISO 10642 flat head sits flush).
export const TSLOT_BOLTS = {
  2020: { bolt: 'M5', d: 5.5, head: 10.4, depth: 3.0 },
  3030: { bolt: 'M6', d: 6.6, head: 12.4, depth: 3.5 },
  4040: { bolt: 'M6', d: 6.6, head: 12.4, depth: 3.5 },
};
// The bin pocket's flat floor stops this far from a cell edge (the plate's
// profile slopes up from there), so a bolt head must stay inside it.
const POCKET_LIP = 2.85;

/**
 * Where the rails run under the plate (they run left to right, along X), and
 * where the plate has to sit on them so every rail passes under a cell's floor
 * rather than a wall between cells. Rails are centred under the plate; the
 * plate can slide along them freely, and across them by `shift`.
 * Returns { rails: [y in grid coordinates], shift, ok, room, bolt }.
 */
export function tslotPlan(plan) {
  const o = plan, bolt = TSLOT_BOLTS[o.tslotProfile] || TSLOT_BOLTS[2020];
  const rows = o.rows, pitch = o.pitchY, gy0 = -(rows * pitch) / 2;
  const n = Math.max(1, Math.round(o.tslotRails || 1));
  const spacing = o.tslotSpacing > 0 ? o.tslotSpacing : n > 1 ? ((rows - 1) * pitch) / (n - 1) : 0;
  const nominal = Array.from({ length: n }, (_, k) => (k - (n - 1) / 2) * spacing);
  // How far a bolt may sit from a cell's centre and keep its head on the flat floor.
  const room = pitch / 2 - POCKET_LIP - bolt.head / 2 - 0.3;
  const worst = (s) => Math.max(...nominal.map((y) => {
    const v = y + s;
    if (v <= gy0 || v >= gy0 + rows * pitch) return Infinity; // off the plate
    const row = Math.floor((v - gy0) / pitch);
    return Math.abs(v - (gy0 + (row + 0.5) * pitch));
  }));
  // Try sliding the plate across the rails (up to half a cell) for the best fit.
  let shift = 0, best = worst(0);
  for (let s = -pitch / 2; s <= pitch / 2 + EPS; s += 0.25) {
    const w = worst(s);
    if (w < best - 1e-9 || (Math.abs(w - best) < 1e-9 && Math.abs(s) < Math.abs(shift))) { best = w; shift = s; }
  }
  return { rails: nominal.map((y) => y + shift), shift, spacing, ok: best <= room + EPS, room, worst: best, bolt };
}

export function wallCells(tile) {
  const last = tile.cols - 1, top = tile.rows - 1;
  const set = new Map();
  const add = (i, j) => set.set(`${i},${j}`, [i, j]);
  if (tile.wall === 'keyholes') { add(0, top); add(last, top); }
  else { add(0, 0); add(last, 0); add(0, top); add(last, top); }
  return [...set.values()];
}
function keyholeOutline(cx, cy, w = WALL.slot / 2) {
  // Entry circle below the hang point, with a slot of half-width w running up from it.
  const e = cy - WALL.travel / 2, h = cy + WALL.travel / 2, R = WALL.head / 2;
  if (w >= R - 0.05) return channelOutline(cx, cy);
  const dy = Math.sqrt(R * R - w * w), out = [];
  for (let k = 0; k <= 8; k++) { const a = (Math.PI * k) / 8; out.push([cx + w * Math.cos(a), h + w * Math.sin(a)]); }
  const a0 = Math.atan2(dy, -w), a1 = Math.atan2(dy, w) + 2 * Math.PI;
  for (let k = 0; k <= 24; k++) { const a = a0 + ((a1 - a0) * k) / 24; out.push([cx + R * Math.cos(a), e + R * Math.sin(a)]); }
  return out;
}
function channelOutline(cx, cy) {
  // The head's channel: a stadium from the entry circle to the hang point.
  const e = cy - WALL.travel / 2, h = cy + WALL.travel / 2, R = WALL.head / 2, out = [];
  for (let k = 0; k <= 12; k++) { const a = (Math.PI * k) / 12; out.push([cx + R * Math.cos(a), h + R * Math.sin(a)]); }
  for (let k = 0; k <= 12; k++) { const a = Math.PI + (Math.PI * k) / 12; out.push([cx + R * Math.cos(a), e + R * Math.sin(a)]); }
  return out;
}

// Bottom thickness actually used, raised when features need more room.
export function bottomThickness(p) {
  if (p.style === 'frame' && !plateFeatures(p)) return 0;
  if (p.style === 'lite' && !plateFeatures(p)) return Math.max(1.2, p.thickness);
  let need = 1.2;
  if (p.magnets) need = SPEC.magnetDepth + 0.8;
  if (p.weighted) need = SPEC.weightDepth + (p.magnets ? SPEC.magnetDepth + 0.4 : 1.2);
  if (p.screws === 'counterbored') need = Math.max(need, 4);
  if (p.wall === 'screws') need = Math.max(need, WALL.sinkDepth + 1.2);
  if (p.wall === 'keyholes') need = Math.max(need, WALL.channel + WALL.taper + WALL.roof);
  if (p.wall === 'tslot') need = Math.max(need, (TSLOT_BOLTS[p.tslotProfile] || TSLOT_BOLTS[2020]).depth + 1.2);
  return Math.round(Math.max(need, p.style === 'frame' ? 0 : p.thickness) * 1000) / 1000;
}

// Splits `cells` into runs. `fits(runs)` says whether every run fits.
function runsFor(cells, n, mode) {
  if (mode === 'largest') {
    return null; // handled by the caller
  }
  const base = Math.floor(cells / n), extra = cells % n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

export function planPlates(options = {}) {
  const o = normalisePlate(options);
  let cols, rows, spareX = 0, spareY = 0;
  if (o.sizeMode === 'drawer') {
    cols = o.forceCols || Math.max(1, Math.floor((o.drawerW + EPS) / o.pitchX));
    rows = o.forceRows || Math.max(1, Math.floor((o.drawerD + EPS) / o.pitchY));
    spareX = Math.max(0, o.drawerW - cols * o.pitchX);
    spareY = Math.max(0, o.drawerD - rows * o.pitchY);
  } else {
    cols = Math.max(1, Math.round(o.gridX));
    rows = Math.max(1, Math.round(o.gridY));
  }
  const share = (spare, align) => (align === 'start' ? [0, spare] : align === 'end' ? [spare, 0] : [spare / 2, spare / 2]);
  const [padL, padR] = o.border ? share(spareX, o.alignX) : [0, 0];
  const [padB, padT] = o.border ? share(spareY, o.alignY) : [0, 0];

  // Choose the split: fewest tiles, then the most even and square tiles.
  let runsX = [cols], runsY = [rows];
  if (o.split) {
    const bx = Math.max(o.bedX, 20) - 2 * o.bedMargin, by = Math.max(o.bedY, 20) - 2 * o.bedMargin;
    const fits = (w, d) => (w <= bx + EPS && d <= by + EPS) || (w <= by + EPS && d <= bx + EPS);
    const sizes = (runs, pitch, a, b) => runs.map((c, i) => c * pitch + (i === 0 ? a : 0) + (i === runs.length - 1 ? b : 0));
    const largest = (cells, pitch, a, b, limit) => {
      const out = [];
      let left = cells;
      while (left > 0) {
        let take = left;
        while (take > 1 && take * pitch + (out.length === 0 ? a : 0) + (take === left ? b : 0) > limit + EPS) take--;
        out.push(take);
        left -= take;
      }
      return out;
    };
    let best = null;
    for (let nx = 1; nx <= cols; nx++) {
      for (let ny = 1; ny <= rows; ny++) {
        let rx, ry;
        if (o.splitMode === 'largest') {
          rx = largest(cols, o.pitchX, padL, padR, Math.max(bx, by));
          ry = largest(rows, o.pitchY, padB, padT, Math.max(bx, by));
          if (rx.length !== nx || ry.length !== ny) continue;
        } else {
          rx = runsFor(cols, nx, 'even');
          ry = runsFor(rows, ny, 'even');
        }
        const ws = sizes(rx, o.pitchX, padL, padR), ds = sizes(ry, o.pitchY, padB, padT);
        if (!ws.every((w) => ds.every((d) => fits(w, d)))) continue;
        const score = nx * ny * 1000 + Math.abs(Math.max(...ws) - Math.max(...ds));
        if (!best || score < best.score) best = { score, rx, ry };
      }
    }
    if (best) {
      runsX = best.rx;
      runsY = best.ry;
    } else {
      runsX = Array(cols).fill(1);
      runsY = Array(rows).fill(1);
    }
  }

  const gridX0 = -(cols * o.pitchX) / 2, gridY0 = -(rows * o.pitchY) / 2;
  const tiles = [];
  let c0 = 0;
  runsX.forEach((nx, ix) => {
    let r0 = 0;
    runsY.forEach((ny, iy) => {
      tiles.push({
        ix, iy, col: c0, row: r0, cols: nx, rows: ny,
        padL: ix === 0 ? padL : 0, padR: ix === runsX.length - 1 ? padR : 0,
        padB: iy === 0 ? padB : 0, padT: iy === runsY.length - 1 ? padT : 0,
        gx0: gridX0 + c0 * o.pitchX, gy0: gridY0 + r0 * o.pitchY,
      });
      r0 += ny;
    });
    c0 += nx;
  });
  for (const t of tiles) {
    t.w = t.cols * o.pitchX + t.padL + t.padR;
    t.d = t.rows * o.pitchY + t.padB + t.padT;
  }

  const bottom = bottomThickness(o);
  const clipped = o.connectors === 'clips' && tiles.length > 1;
  // Frame plates: the wall foot is only about 2.15 mm thick on each side of a
  // seam, so their clips are shorter and thinner, and sit below z = 1.8.
  const frameClips = clipped && bottom === 0
    ? { clipLength: FRAME_CLIP.length, clipNeck: FRAME_CLIP.neck, clipEnd: FRAME_CLIP.end, clipHeight: FRAME_CLIP.height }
    : { clipHeight: bottom };
  let clips = 0;
  if (clipped) {
    for (const t of tiles) {
      if (t.ix < runsX.length - 1) clips += seamClips(t.rows, o.pitchY).length;
      if (t.iy < runsY.length - 1) clips += seamClips(t.cols, o.pitchX).length;
    }
  }
  return {
    ...o, ...frameClips, cols, rows, padL, padR, padB, padT, bottom, clipped,
    tilesX: runsX.length, tilesY: runsY.length, tiles, clips,
    totalW: cols * o.pitchX + padL + padR, totalD: rows * o.pitchY + padB + padT,
  };
}

// Clip positions along a seam: one per cell boundary, or mid-cell for a one-cell seam.
export function seamClips(cells, pitch) {
  if (cells === 1) return [pitch / 2];
  return Array.from({ length: cells - 1 }, (_, i) => (i + 1) * pitch);
}

function roundedSquare(cx, cy, w, d, r, steps = 4) {
  const pts = [];
  const cs = [[w / 2 - r, d / 2 - r, 0], [-w / 2 + r, d / 2 - r, 90], [-w / 2 + r, -d / 2 + r, 180], [w / 2 - r, -d / 2 + r, 270]];
  for (const [ox, oy, a0] of cs) {
    for (let s = 0; s <= steps; s++) {
      const a = ((a0 + (90 * s) / steps) * Math.PI) / 180;
      pts.push([cx + ox + r * Math.cos(a), cy + oy + r * Math.sin(a)]);
    }
  }
  return pts;
}

function ribbed(cx, cy, r, ribR, ribs = 8, n = 48) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const d = Math.abs((((a / (Math.PI * 2)) * ribs) % 1) - 0.5) * 2;
    const rr = d > 0.75 ? ribR + (r - ribR) * (1 - (d - 0.75) / 0.25) : r;
    pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
  }
  return pts;
}

// Tile geometry in drawer coordinates.
export function generateTile(plan, tile) {
  const o = plan;
  const R = SPEC.plateRadius;
  const x0 = tile.gx0 - tile.padL, y0 = tile.gy0 - tile.padB;
  const x1 = tile.gx0 + tile.cols * o.pitchX + tile.padR, y1 = tile.gy0 + tile.rows * o.pitchY + tile.padT;
  const B = o.bottom;
  const zTop = B + SPEC.plateHeight;
  const mesh = new Mesh();
  const seamL = tile.ix > 0, seamR = tile.ix < o.tilesX - 1;
  const seamB = tile.iy > 0, seamT = tile.iy < o.tilesY - 1;
  const padded = { l: tile.padL > 0.05, r: tile.padR > 0.05, b: tile.padB > 0.05, t: tile.padT > 0.05 };

  // Round the plate's own outer corners.
  const cornerR = {
    bl: !seamL && !seamB ? R : 0,
    br: !seamR && !seamB ? R : 0,
    tr: !seamR && !seamT ? R : 0,
    tl: !seamL && !seamT ? R : 0,
  };

  const caps = [];
  if (B > 0) {
    // Bottom outline, counter-clockwise, with dovetail sockets on seams.
    const outline = [];
    const corner = (cx, cy, r, a0) => {
      if (!r) return outline.push([cx, cy]);
      const ox = cx + (a0 === 90 || a0 === 180 ? r : -r);
      const oy = cy + (a0 === 180 || a0 === 270 ? r : -r);
      for (let s = 0; s <= 6; s++) {
        const a = ((a0 + (90 * s) / 6) * Math.PI) / 180;
        outline.push([ox + r * Math.cos(a), oy + r * Math.sin(a)]);
      }
    };
    const sockets = (from, dir, inward, positions, pitch) => {
      if (!o.clipped) return;
      for (const p of positions) {
        const at = (along, into) => [from[0] + dir[0] * along + inward[0] * into, from[1] + dir[1] * along + inward[1] * into];
        outline.push(at(p - o.clipNeck, 0), at(p - o.clipEnd, o.clipLength), at(p + o.clipEnd, o.clipLength), at(p + o.clipNeck, 0));
        // Sockets sit where two cells meet: cap under the seam wall and under the shared wall between the cells.
        caps.push([at(p - o.clipEnd - 1, 0), at(p + o.clipEnd + 1, 2.8)]);
        if (Math.abs(p / pitch - Math.round(p / pitch)) < 1e-6) caps.push([at(p - 2.8, 0), at(p + 2.8, o.clipLength + 1)]);
      }
    };
    const gridW = tile.cols * o.pitchX, gridD = tile.rows * o.pitchY;
    corner(x0, y0, cornerR.bl, 180);
    if (seamB) sockets([tile.gx0, y0], [1, 0], [0, 1], seamClips(tile.cols, o.pitchX), o.pitchX);
    corner(x1, y0, cornerR.br, 270);
    if (seamR) sockets([x1, tile.gy0], [0, 1], [-1, 0], seamClips(tile.rows, o.pitchY), o.pitchY);
    corner(x1, y1, cornerR.tr, 0);
    if (seamT) sockets([tile.gx0 + gridW, y1], [-1, 0], [0, -1], seamClips(tile.cols, o.pitchX), o.pitchX);
    corner(x0, y1, cornerR.tl, 90);
    if (seamL) sockets([x0, tile.gy0 + gridD], [0, -1], [1, 0], seamClips(tile.rows, o.pitchY), o.pitchY);

    // Per-cell features, by layer.
    const cells = [];
    for (let i = 0; i < tile.cols; i++) for (let j = 0; j < tile.rows; j++) {
      cells.push([tile.gx0 + (i + 0.5) * o.pitchX, tile.gy0 + (j + 0.5) * o.pitchY, i, j]);
    }
    // Next to a clip socket the lattice stays solid, so the pocket frame above
    // the socket has plastic on every side to bridge from (no supports).
    const keep = o.clipped ? o.clipLength + 2 : 0;
    const lattice = [], weights = [], magnets = [], screws = [], sinks = [];
    let ow = o.pitchX - 2 * o.latticeInset, od = o.pitchY - 2 * o.latticeInset;
    const mx = o.pitchX / 2 - SPEC.holeFromEdge, my = o.pitchY / 2 - SPEC.holeFromEdge;
    // Lattice openings (lite plates, and frame plates given a floor) stay clear
    // of magnets; a cell with a weight pocket or screw hole keeps a solid floor.
    const wall = o.wall && o.wall !== 'none' ? o.wall : null;
    const wallAt = new Set(onWall(o) ? wallCells({ ...tile, wall }).map(([i, j]) => `${i},${j}`) : []);
    // T-slot bolts: on each rail, in every Nth cell along it (and the first and last).
    const bolts = [];
    const ts = wall === 'tslot' ? tslotPlan(o) : null;
    const keyholes = [], wallScrews = [], pilots = [];
    const latticed = o.style !== 'solid' && !o.weighted && o.screws === 'none' && !wall;
    if (latticed && o.magnets) {
      const inset = Math.max(o.latticeInset, SPEC.holeFromEdge + SPEC.magnetDiameter / 2 + 1.2);
      ow = o.pitchX - 2 * inset; od = o.pitchY - 2 * inset;
    }
    for (const [cx, cy, i, j] of cells) {
      if (latticed && ow > 4 && od > 4) {
        const l = i === 0 && seamL ? keep : 0, r = i === tile.cols - 1 && seamR ? keep : 0;
        const b = j === 0 && seamB ? keep : 0, t = j === tile.rows - 1 && seamT ? keep : 0;
        const w = ow - Math.max(0, l - o.latticeInset) - Math.max(0, r - o.latticeInset), d = od - Math.max(0, b - o.latticeInset) - Math.max(0, t - o.latticeInset);
        const hx = cx + (Math.max(0, l - o.latticeInset) - Math.max(0, r - o.latticeInset)) / 2, hy = cy + (Math.max(0, b - o.latticeInset) - Math.max(0, t - o.latticeInset)) / 2;
        if (w > 4 && d > 4) lattice.push(roundedSquare(hx, hy, w, d, Math.min(3, w / 2 - 0.5, d / 2 - 0.5)));
      }
      const wp = Math.min(SPEC.weightPocket, o.pitchX - 14, o.pitchY - 14);
      if (o.weighted && wp > 6) weights.push(roundedSquare(cx, cy, wp, wp, 1));
      if (o.magnets && mx > 6 && my > 6) {
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
          const hx = cx + sx * mx, hy = cy + sy * my;
          magnets.push(o.crushRibs ? ribbed(hx, hy, SPEC.magnetDiameter / 2, SPEC.crushRibDiameter / 2) : circlePolygon(hx, hy, SPEC.magnetDiameter / 2, 40));
        }
      }
      // On a wall, bins are screwed in: an M3 pilot under each of their foot screw holes.
      if (ts) {
        const col = tile.col + i, every = Math.max(1, Math.round(o.tslotEvery || 1));
        if (col % every === 0 || col === o.cols - 1) {
          for (const ry of ts.rails) if (Math.abs(ry - cy) <= o.pitchY / 2 && Math.abs(ry - cy) <= ts.room + EPS) bolts.push({ cx, cy: ry });
        }
      }
      if (onWall(o) && o.wallLock !== 'magnets' && mx > 6 && my > 6) for (const sx of [-1, 1]) for (const sy of [-1, 1]) pilots.push(circlePolygon(cx + sx * mx, cy + sy * my, WALL.pilot / 2, 16));
      if (wallAt.has(`${i},${j}`)) {
        if (wall === 'keyholes') keyholes.push([cx, cy]);
        else wallScrews.push({ cx, cy });
        continue;
      }
      if (o.screws !== 'none' && !o.weighted) {
        screws.push(circlePolygon(cx, cy, 3.5 / 2, 24));
        if (o.screws === 'countersunk') sinks.push({ cx, cy });
        if (o.screws === 'counterbored') sinks.push({ cx, cy });
      }
    }

    // Stack the bottom in bands; each band gets the holes active at that height.
    const zWeight = o.weighted && weights.length ? SPEC.weightDepth : 0;
    const zMagnet = magnets.length ? B - SPEC.magnetDepth : B;
    const zSink = sinks.length ? (o.screws === 'counterbored' ? 3 : 2) : 0; // counterbore / countersink from below
    // Keyholes: the head's channel, then the slot narrows at 45° (no ledge to
    // print in mid-air), then the slot itself up to the pocket floor.
    const taperSteps = keyholes.length ? Math.ceil(WALL.taper / 0.4) : 0;
    const zChannel = keyholes.length ? WALL.channel : 0;
    const keyZ = Array.from({ length: taperSteps }, (_, k) => zChannel + (WALL.taper * (k + 1)) / taperSteps);
    const zCs = wallScrews.length ? B - WALL.sinkDepth : B;
    const csSteps = wallScrews.length ? [0, 1, 2].map((k) => zCs + (WALL.sinkDepth * k) / 3) : [];
    const tb = ts?.bolt, zBolt = bolts.length ? B - tb.depth : B;
    const boltSteps = bolts.length ? [0, 1, 2, 3].map((k) => zBolt + (tb.depth * k) / 4) : [];
    const breaks = [...new Set([0, zWeight, zSink, zMagnet, zChannel, ...keyZ, ...csSteps, ...boltSteps, B].map((z) => Math.round(z * 1000) / 1000))]
      .filter((z) => z >= 0 && z <= B)
      .sort((a, b) => a - b);
    for (let k = 0; k < breaks.length - 1; k++) {
      const za = breaks[k], zb = breaks[k + 1];
      if (zb - za < 0.05) continue;
      const holes = [...lattice];
      if (zb <= zWeight + EPS) holes.push(...weights);
      if (za >= zMagnet - EPS) holes.push(...magnets);
      if (!(zb <= zWeight + EPS)) {
        if (zb <= zSink + EPS) {
          // Countersinks are stepped wider near the bottom; counterbores are a wide bore.
          const r = o.screws === 'counterbored' ? 5.5 / 2 : 3.5 / 2 + 2.5 * (1 - za / Math.max(zSink, EPS));
          holes.push(...sinks.map(({ cx, cy }) => circlePolygon(cx, cy, r, 28)));
        } else holes.push(...screws);
      }
      // Pilots go through the floor, except where a magnet pocket is already wider.
      if (pilots.length && !(za >= zMagnet - EPS)) holes.push(...pilots);
      if (keyholes.length) {
        const R = WALL.head / 2, w = WALL.slot / 2;
        // Half-width at this band: full head width in the channel, stepping in to the slot.
        const t = zb <= zChannel + EPS ? 0 : Math.min(1, (zb - zChannel) / WALL.taper);
        holes.push(...keyholes.map(([cx, cy]) => keyholeOutline(cx, cy, R - (R - w) * t)));
      }
      for (const { cx, cy } of bolts) {
        // A countersink for a flat-head bolt, widening towards the pocket (no overhang printed flat).
        const t = za >= zBolt - EPS ? (zb - zBolt) / tb.depth : 0;
        holes.push(circlePolygon(cx, cy, tb.d / 2 + ((tb.head - tb.d) / 2) * Math.min(1, t), 32));
      }
      for (const { cx, cy } of wallScrews) {
        // Countersink widens towards the pocket (no overhang when printed flat).
        const t = za >= zCs - EPS ? (zb - zCs) / WALL.sinkDepth : 0;
        holes.push(circlePolygon(cx, cy, WALL.screw / 2 + (WALL.sinkD - WALL.screw) / 2 * Math.min(1, t), 28));
      }
      mesh.append(extrudePolygon(outline, holes, za, zb));
    }
  }

  // Frame plates with clips: the foot of the walls (up to the top of the
  // vertical section) is built as whole-tile slabs, so bowtie sockets can be
  // cut into it from below where tiles meet. The pocket rings start above.
  const frameFoot = B === 0 && o.clipped;
  let ringFrom = 0;
  if (frameFoot) {
    const prof = SPEC.plateProfile;
    const top = prof[2][0]; // 2.5: top of the vertical section
    ringFrom = prof.findIndex(([z]) => z >= top);
    const gx1 = tile.gx0 + tile.cols * o.pitchX, gy1 = tile.gy0 + tile.rows * o.pitchY;
    const rc = {
      bl: !padded.l && !padded.b ? cornerR.bl : 0, br: !padded.r && !padded.b ? cornerR.br : 0,
      tr: !padded.r && !padded.t ? cornerR.tr : 0, tl: !padded.l && !padded.t ? cornerR.tl : 0,
    };
    const outlineAt = (withSockets) => {
      const out = [];
      const corner = (cx, cy, r, a0) => {
        if (!r) return out.push([cx, cy]);
        const ox = cx + (a0 === 90 || a0 === 180 ? r : -r), oy = cy + (a0 === 180 || a0 === 270 ? r : -r);
        for (let k = 0; k <= 6; k++) { const a = ((a0 + 15 * k) * Math.PI) / 180; out.push([ox + r * Math.cos(a), oy + r * Math.sin(a)]); }
      };
      const sock = (from, dir, inward, positions) => {
        if (!withSockets) return;
        for (const p of positions) {
          const at = (along, into) => [from[0] + dir[0] * along + inward[0] * into, from[1] + dir[1] * along + inward[1] * into];
          out.push(at(p - o.clipNeck, 0), at(p - o.clipEnd, o.clipLength), at(p + o.clipEnd, o.clipLength), at(p + o.clipNeck, 0));
        }
      };
      corner(tile.gx0, tile.gy0, rc.bl, 180);
      if (seamB) sock([tile.gx0, tile.gy0], [1, 0], [0, 1], seamClips(tile.cols, o.pitchX));
      corner(gx1, tile.gy0, rc.br, 270);
      if (seamR) sock([gx1, tile.gy0], [0, 1], [-1, 0], seamClips(tile.rows, o.pitchY));
      corner(gx1, gy1, rc.tr, 0);
      if (seamT) sock([gx1, gy1], [-1, 0], [0, -1], seamClips(tile.cols, o.pitchX));
      corner(tile.gx0, gy1, rc.tl, 90);
      if (seamL) sock([tile.gx0, gy1], [0, -1], [1, 0], seamClips(tile.rows, o.pitchY));
      return out;
    };
    const insetAt = (z) => {
      for (let k = 1; k < prof.length; k++) if (z <= prof[k][0] + EPS) return prof[k - 1][1] + ((prof[k][1] - prof[k - 1][1]) * (z - prof[k - 1][0])) / (prof[k][0] - prof[k - 1][0]);
      return prof.at(-1)[1];
    };
    const holesAt = (inset) => {
      const hs = [];
      for (let i = 0; i < tile.cols; i++) for (let j = 0; j < tile.rows; j++) {
        const w = o.pitchX - 2 * inset, d = o.pitchY - 2 * inset;
        hs.push(roundedSquare(tile.gx0 + (i + 0.5) * o.pitchX, tile.gy0 + (j + 0.5) * o.pitchY, w, d, Math.max(R - inset, 0.3), o.segments));
      }
      return hs;
    };
    // The bottom chamfer in three steps (each takes the wider wall of its step,
    // so bins still drop in), then the vertical section, split at the socket roof.
    const c = prof[1][0], hClip = o.clipHeight;
    const bands = [[0, c / 3], [c / 3, (2 * c) / 3], [(2 * c) / 3, c], [c, hClip], [hClip, top]];
    for (const [za, zb] of bands) mesh.append(extrudePolygon(outlineAt(zb <= hClip + EPS), holesAt(insetAt(za)), za, zb));
  }

  // Pocket rings, one per cell.
  for (let i = 0; i < tile.cols; i++) {
    for (let j = 0; j < tile.rows; j++) {
      const cx = tile.gx0 + (i + 0.5) * o.pitchX;
      const cy = tile.gy0 + (j + 0.5) * o.pitchY;
      const atL = i === 0 && !padded.l, atR = i === tile.cols - 1 && !padded.r;
      const atB = j === 0 && !padded.b, atT = j === tile.rows - 1 && !padded.t;
      const r = [atR && atT ? cornerR.tr : 0, atL && atT ? cornerR.tl : 0, atL && atB ? cornerR.bl : 0, atR && atB ? cornerR.br : 0];
      // Above a frame foot the ring starts just inside the foot's top, so the two overlap.
      const levels = frameFoot ? [[SPEC.plateProfile[ringFrom][0] - 0.05, SPEC.plateProfile[ringFrom][1]], ...SPEC.plateProfile.slice(ringFrom + 1)] : SPEC.plateProfile;
      const outer = levels.map(([z]) => ({ z: B + z, rect: { cx, cy, w: o.pitchX, d: o.pitchY, r } }));
      const inner = levels.map(([z, inset]) => ({
        z: B + z,
        rect: { cx, cy, w: o.pitchX - 2 * inset, d: o.pitchY - 2 * inset, r: Math.max(R - inset, 0.3) },
      }));
      mesh.append(loftRing(outer, inner, o.segments));
    }
  }

  // A thin cap over each clip socket, inside the frame wall: one piece, so its
  // first layer bridges the socket cleanly from solid plate on either side.
  for (const [[ax, ay], [bx, by]] of caps) mesh.append(box(Math.min(ax, bx), Math.min(ay, by), B, Math.max(ax, bx), Math.max(ay, by), B + 0.4));

  // Solid border out to the drawer walls (unless printed as separate spacers).
  if (o.borderMode === 'spacers') return mesh;
  const gx1 = tile.gx0 + tile.cols * o.pitchX, gy1 = tile.gy0 + tile.rows * o.pitchY;
  // Border pieces follow the plate's rounded outer corners, so nothing hangs past the base.
  const piece = (xa, ya, xb, yb) => {
    const rounds = [[xa, ya, cornerR.bl, x0, y0, 180], [xb, ya, cornerR.br, x1, y0, 270], [xb, yb, cornerR.tr, x1, y1, 0], [xa, yb, cornerR.tl, x0, y1, 90]];
    if (!rounds.some(([px, py, r, ox, oy]) => r && Math.abs(px - ox) < EPS && Math.abs(py - oy) < EPS)) return box(xa, ya, B, xb, yb, zTop);
    const poly = [];
    for (const [px, py, r, ox, oy, a0] of rounds) {
      if (!(r && Math.abs(px - ox) < EPS && Math.abs(py - oy) < EPS)) { poly.push([px, py]); continue; }
      const cx = px + (a0 === 90 || a0 === 180 ? r : -r), cy = py + (a0 === 180 || a0 === 270 ? r : -r);
      for (let k = 0; k <= 6; k++) { const a = ((a0 + 15 * k) * Math.PI) / 180; poly.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    }
    return extrudePolygon(poly, [], B, zTop);
  };
  if (padded.l) mesh.append(piece(x0, y0, tile.gx0, y1));
  if (padded.r) mesh.append(piece(gx1, y0, x1, y1));
  if (padded.b) mesh.append(piece(tile.gx0, y0, gx1, tile.gy0));
  if (padded.t) mesh.append(piece(tile.gx0, gy1, gx1, y1));
  return mesh;
}

// The bowtie clip, lying flat, centred on the origin, long axis along x.
export function clipPolygon(plan) {
  const c = plan.clipClearance;
  const n = plan.clipNeck - c, e = plan.clipEnd - c, L = plan.clipLength - c;
  return [[-L, -e], [0, -n], [L, -e], [L, e], [0, n], [-L, e]];
}

export function generateClip(plan) {
  return extrudePolygon(clipPolygon(plan), [], 0, Math.max(0.8, (plan.clipHeight ?? plan.bottom) - 0.2));
}

// A print-ready sheet of clips (needed + spares).
export function generateClipSheet(plan, count = plan.clips + (plan.spareClips || 0)) {
  const mesh = new Mesh();
  const per = Math.max(1, Math.ceil(Math.sqrt(count * 0.6)));
  const sx = plan.clipLength * 2 + 4, sy = plan.clipEnd * 2 + 4;
  for (let k = 0; k < count; k++) mesh.append(generateClip(plan).translate((k % per) * sx, Math.floor(k / per) * sy, 0));
  return mesh;
}

// All tiles in one piece (no split): used for simple plates and thumbnails.
export function generatePlate(options = {}) {
  const plan = planPlates({ ...options, split: false });
  const mesh = new Mesh();
  for (const t of plan.tiles) mesh.append(generateTile(plan, t));
  return mesh;
}

// Whole assembly for preview: tiles pulled apart slightly, clips in place.
export function generateAssembly(plan, gap = 3) {
  const off = (t) => [t.ix * gap - ((plan.tilesX - 1) * gap) / 2, t.iy * gap - ((plan.tilesY - 1) * gap) / 2];
  const tiles = plan.tiles.map((t) => generateTile(plan, t).translate(...off(t), 0));
  const clips = new Mesh();
  if (!plan.clipped) return { tiles, clips };
  for (const t of plan.tiles) {
    const [dx, dy] = off(t);
    if (t.ix < plan.tilesX - 1) {
      const x = t.gx0 + t.cols * plan.pitchX + dx + gap / 2;
      for (const p of seamClips(t.rows, plan.pitchY)) clips.append(generateClip(plan).translate(x, t.gy0 + p + dy, 0));
    }
    if (t.iy < plan.tilesY - 1) {
      const y = t.gy0 + t.rows * plan.pitchY + dy + gap / 2;
      for (const p of seamClips(t.cols, plan.pitchX)) {
        const clip = generateClip(plan);
        for (let i = 0; i < clip.positions.length; i += 3) {
          const [cx, cy] = [clip.positions[i], clip.positions[i + 1]];
          clip.positions[i] = -cy;
          clip.positions[i + 1] = cx;
        }
        clips.append(clip.translate(t.gx0 + p + dx, y, 0));
      }
    }
  }
  return { tiles, clips };
}

// A text map of the layout for the download's read-me.
export function layoutMap(plan) {
  const lines = [];
  for (let iy = plan.tilesY - 1; iy >= 0; iy--) {
    const row = plan.tiles.filter((t) => t.iy === iy).sort((a, b) => a.ix - b.ix);
    lines.push(row.map((t) => `[tile ${t.ix + 1}-${t.iy + 1}: ${t.cols}x${t.rows}]`).join(' '));
  }
  return lines.join('\n');
}

// Separate border spacers: strips that fill the gap to the drawer walls,
// cut to fit the print bed. Returns [{ mesh, name, detail }].
export function generateSpacers(plan) {
  if (plan.borderMode !== 'spacers') return [];
  const h = plan.bottom + SPEC.plateHeight;
  const maxLen = plan.split ? Math.max(plan.bedX, plan.bedY) - 2 * plan.bedMargin : Infinity;
  const strips = [];
  const add = (name, len, width) => {
    if (width < 0.5) return;
    const n = Math.max(1, Math.ceil(len / maxLen));
    const piece = len / n;
    const mesh = new Mesh();
    for (let i = 0; i < n; i++) mesh.append(box(0, i * (width + 5), 0, piece, i * (width + 5) + width, h));
    strips.push({ mesh, name, detail: `${n} × ${piece.toFixed(1)} × ${width.toFixed(1)} mm` });
  };
  // Left/right strips run the full depth; front/back fill between them.
  add('spacer-left', plan.totalD, plan.padL);
  add('spacer-right', plan.totalD, plan.padR);
  add('spacer-front', plan.cols * plan.pitchX, plan.padB);
  add('spacer-back', plan.cols * plan.pitchX, plan.padT);
  return strips;
}

// Everything the baseplate generator builds, in one call, so the studio can run
// it in a background worker (geo-worker.js) and the page never freezes on a
// big plate. Meshes come back as plain objects; restoreMeshes() gives them
// their methods again.
export function plateAssembly(o) {
  const plan = planPlates(o);
  const { tiles, clips } = generateAssembly(plan, plan.tiles.length > 1 ? 4 : 0);
  const tileMeshes = plan.tiles.map((t) => generateTile(plan, t));
  const clipCount = plan.clips + (plan.clipped ? o.spareClips || 0 : 0);
  const clipSheet = plan.clipped ? generateClipSheet(plan, clipCount) : null;
  return { plan, tiles, clips, tileMeshes, clipSheet, clipCount, spacers: generateSpacers(plan) };
}
