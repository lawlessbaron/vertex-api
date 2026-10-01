import { SPEC } from './spec.js';
import { binFrame } from './bin.js';
import { circlePolygon } from './polygon.js';
import { CUTOUT_DEFAULTS, STACK_CLEAR, generateCutoutBin, unitsForDepth } from './cutout.js';
import { Mesh } from './mesh.js';
import { fitText, textMesh } from './font.js';

// Bins with a pattern of identical pockets: batteries, bits, cards, pens.
// Sizes are the item's nominal size; clearance is added on top.
export const HOLDER_ITEMS = {
  aa: { name: 'AA batteries', shape: 'circle', a: 14.5, depth: 25 },
  aaa: { name: 'AAA batteries', shape: 'circle', a: 10.5, depth: 22 },
  c: { name: 'C batteries', shape: 'circle', a: 26.2, depth: 25 },
  d: { name: 'D batteries', shape: 'circle', a: 34.2, depth: 30 },
  '9v': { name: '9 V batteries', shape: 'rect', a: 26.5, b: 17.5, depth: 25 },
  '18650': { name: '18650 cells', shape: 'circle', a: 18.4, depth: 32 },
  '21700': { name: '21700 cells', shape: 'circle', a: 21.2, depth: 35 },
  cr2032: { name: 'CR2032 coin cells (upright)', shape: 'rect', a: 20.2, b: 3.2, depth: 12 },
  hexbit: { name: '¼" hex bits', shape: 'hex', a: 6.35, depth: 12 },
  sd: { name: 'SD cards (upright)', shape: 'rect', a: 24, b: 2.1, depth: 20 },
  microsd: { name: 'microSD cards (upright)', shape: 'rect', a: 11, b: 1, depth: 10 },
  pen: { name: 'Pens and markers', shape: 'circle', a: 10, depth: 30 },
  pencil: { name: 'Pencils (hex)', shape: 'hex', a: 7, depth: 30 },
  allen: { name: 'Hex keys (sorted)', shape: 'hex', a: 6, depth: 30 },
  drill: { name: 'Drill bits (6 mm)', shape: 'circle', a: 6, depth: 30 },
  // Soldering
  wick: { name: 'Solder wick spools (lying flat)', shape: 'circle', a: 36, depth: 10, group: 'Soldering' },
  flux10: { name: 'Flux syringes, 10 ml (upright)', shape: 'circle', a: 17, depth: 30, group: 'Soldering' },
  flux5: { name: 'Flux syringes, 5 ml (upright)', shape: 'circle', a: 13, depth: 25, group: 'Soldering' },
  fluxpen: { name: 'Flux pens', shape: 'circle', a: 14, depth: 30, group: 'Soldering' },
  solderTube: { name: 'Solder tube dispensers', shape: 'circle', a: 20, depth: 30, group: 'Soldering' },
  tipT12: { name: 'Soldering tips, T12 cartridges', shape: 'circle', a: 7, depth: 35, group: 'Soldering' },
  jumper: { name: 'Jumper wires (comb slots)', shape: 'rect', a: 40, b: 2.5, depth: 20, group: 'Electronics' },
  jumperBundle: { name: 'Jumper wire bundles (40-wire strips)', shape: 'rect', a: 22, b: 12, depth: 35, group: 'Electronics' },
  headers: { name: 'Pin headers (40-pin strips, upright)', shape: 'rect', a: 52, b: 3, depth: 8, group: 'Electronics' },
  magnet6x2: { name: '6 × 2 mm magnets (stacked)', shape: 'circle', a: 6.2, depth: 30, group: 'Magnets and hardware' },
  magnet8x3: { name: '8 × 3 mm magnets (stacked)', shape: 'circle', a: 8.2, depth: 30, group: 'Magnets and hardware' },
  magnet10x3: { name: '10 × 3 mm magnets (stacked)', shape: 'circle', a: 10.2, depth: 30, group: 'Magnets and hardware' },
  heatset: { name: 'Heat-set inserts, M3', shape: 'circle', a: 5, depth: 6, group: 'Magnets and hardware' },
  // Hand tools, standing up
  precision: { name: 'Precision screwdrivers (shaft down)', shape: 'circle', a: 5, depth: 35, group: 'Tools' },
  screwdriver: { name: 'Screwdrivers (shaft down)', shape: 'circle', a: 8.5, depth: 45, group: 'Tools' },
  tweezers: { name: 'Tweezers', shape: 'rect', a: 14, b: 5, depth: 45, group: 'Tools' },
  knife: { name: 'Craft knives and scalpels', shape: 'circle', a: 12, depth: 40, group: 'Tools' },
  pliers: { name: 'Pliers and cutters (handles down)', shape: 'rect', a: 50, b: 18, depth: 45, group: 'Tools' },
  files: { name: 'Needle files', shape: 'rect', a: 9, b: 4, depth: 40, group: 'Tools' },
  router14: { name: 'Router bits, ¼" shank', shape: 'circle', a: 6.35, depth: 25, group: 'Tools' },
  router12: { name: 'Router bits, ½" shank', shape: 'circle', a: 12.7, depth: 30, group: 'Tools' },
  marker: { name: 'Permanent markers', shape: 'circle', a: 13, depth: 35, group: 'Tools' },
  brush: { name: 'Paint brushes', shape: 'circle', a: 9, depth: 35, group: 'Tools' },
  gluestick: { name: 'Glue sticks', shape: 'circle', a: 22, depth: 35, group: 'Tools' },
  // Sets: every pocket its own size, with the size printed beside it.
  setDrill: { name: 'Drill bits 1–10 mm', set: { shape: 'circle', depth: 30, sizes: '1,1.5,2,2.5,3,3.5,4,4.5,5,5.5,6,6.5,7,8,9,10' }, group: 'Sets (labelled)' },
  setHex: { name: 'Hex keys, metric 1.5–10', set: { shape: 'hex', depth: 25, sizes: '1.5,2,2.5,3,4,5,6,8,10' }, group: 'Sets (labelled)' },
  setHexSae: { name: 'Hex keys, SAE 1/16–3/8', set: { shape: 'hex', depth: 25, sizes: '1/16:1.59,5/64:1.98,3/32:2.38,7/64:2.78,1/8:3.18,9/64:3.57,5/32:3.97,3/16:4.76,7/32:5.56,1/4:6.35,5/16:7.94,3/8:9.53' }, group: 'Sets (labelled)' },
  setSocket14: { name: 'Sockets, ¼" drive 4–14 mm', set: { shape: 'circle', depth: 18, sizes: '4:11.6,5:11.6,5.5:11.6,6:11.6,7:11.6,8:12.2,9:13.2,10:14.5,11:15.6,12:16.8,13:17.8,14:19' }, group: 'Sets (labelled)' },
  setSocket38: { name: 'Sockets, ⅜" drive 8–19 mm', set: { shape: 'circle', depth: 20, sizes: '8:17,9:17,10:17,11:17.8,12:18.8,13:19.8,14:21,15:22,16:23.5,17:24,18:25.5,19:26.5' }, group: 'Sets (labelled)' },
  setCustom: { name: 'My own set', set: { shape: 'circle', depth: 20, sizes: '3,4,5,6,8,10' }, group: 'Sets (labelled)' },
  // Boards and breadboards: size is length × width × tallest part (on edge uses the last).
  uno: { name: 'Arduino Uno', board: [68.6, 53.4, 16], group: 'Boards' },
  mega: { name: 'Arduino Mega 2560', board: [101.6, 53.3, 16], group: 'Boards' },
  nano: { name: 'Arduino Nano', board: [43.2, 18.5, 10], group: 'Boards' },
  esp32: { name: 'ESP32 DevKit (check yours)', board: [52, 28.5, 12], group: 'Boards' },
  pi: { name: 'Raspberry Pi 4 / 5', board: [85, 56, 17], group: 'Boards' },
  picoBoard: { name: 'Raspberry Pi Pico', board: [51, 21, 8], group: 'Boards' },
  bbFull: { name: 'Breadboard, full (830)', board: [165.1, 54.6, 8.5], group: 'Boards' },
  bbHalf: { name: 'Breadboard, half (400)', board: [82.5, 54.6, 8.5], group: 'Boards' },
  bbMini: { name: 'Breadboard, mini (170)', board: [47, 35, 8.5], group: 'Boards' },
  custom: { name: 'Custom', shape: 'circle', a: 12, depth: 15 },
};

// Pocket settings for an item. Boards stand on edge in slots, or lie flat in trays.
export function itemPocket(key, orientation = 'edge') {
  const it = HOLDER_ITEMS[key];
  if (!it) return null;
  if (it.set) return { shape: it.set.shape, depth: it.set.depth, sizes: it.set.sizes };
  if (!it.board) return { shape: it.shape, a: it.a, b: it.b ?? 10, depth: it.depth, sizes: '' };
  const [L, W, T] = it.board;
  return orientation === 'flat'
    ? { shape: 'rect', a: L, b: W, depth: Math.max(6, T), sizes: '' }
    : { shape: 'rect', a: L, b: T, depth: Math.round(Math.min(W * 0.6, 35)), sizes: '' };
}

export const HOLDER_DEFAULTS = {
  ...CUTOUT_DEFAULTS,
  gridX: 2,
  gridY: 2,
  heightUnits: 0, // 0 = shortest that fits
  item: 'aa',
  shape: 'circle', // circle | hex | rect
  a: 14.5, // diameter, across-flats, or length
  b: 10, // rect width
  depth: 25,
  clearance: 0.4,
  spacing: 1.6, // solid between pockets
  pattern: 'grid', // grid | staggered
  rotate: false, // turn rectangular pockets 90 degrees
  countMode: 'fill', // fill | exact
  cols: 4,
  rows: 3,
  orientation: 'edge', // boards: edge (slots) | flat (stackable trays)
  sizes: '', // a set: "size" or "label:size" entries, comma or newline separated
  sizeText: 3, // height of the size labels on a set (mm); 0 = none
  leadIn: 0.8, // chamfer around the top of each pocket so items drop in (mm)
  groove: 'none', // none | rows | cols: a finger channel across the pockets
  grooveWidth: 10,
  grooveDepth: 0, // 0 = two thirds of the pocket depth
};

// Parse a set: "1.5, 2, 1/4:6.35" → [{ label, size }].
export function parseSizes(text) {
  return String(text || '')
    .split(/[,\n;]+/)
    .map((e) => e.trim())
    .filter(Boolean)
    .map((e) => {
      const [a, b] = e.split(':').map((x) => x.trim());
      const size = Number(b ?? a);
      return { label: b === undefined ? a : a, size };
    })
    .filter((e) => e.size > 0 && e.size < 200)
    .slice(0, 80);
}

function pocket(o, x, y, grow = 0) {
  const c = o.clearance + 2 * grow;
  if (o.shape === 'circle') return circlePolygon(x, y, (o.a + c) / 2, 40);
  if (o.shape === 'hex') {
    const r = (o.a + c) / Math.sqrt(3); // across-flats to corner radius
    return Array.from({ length: 6 }, (_, i) => [x + r * Math.cos((i * Math.PI) / 3), y + r * Math.sin((i * Math.PI) / 3)]);
  }
  const w = (o.rotate ? o.b : o.a) + c, d = (o.rotate ? o.a : o.b) + c;
  return [[x - w / 2, y - d / 2], [x + w / 2, y - d / 2], [x + w / 2, y + d / 2], [x - w / 2, y + d / 2]];
}

function footprint(o) {
  const c = o.clearance;
  if (o.shape === 'circle') return [o.a + c, o.a + c];
  if (o.shape === 'hex') return [(2 * (o.a + c)) / Math.sqrt(3), o.a + c];
  return o.rotate ? [o.b + c, o.a + c] : [o.a + c, o.b + c];
}

// Pocket centres for a given area, centred.
function layout(o, areaW, areaD) {
  const [fw, fd] = footprint(o);
  const px = fw + o.spacing;
  const stagger = o.pattern === 'staggered';
  const py = stagger && o.shape !== 'rect' ? (fd + o.spacing) * (Math.sqrt(3) / 2) + (o.shape === 'hex' ? 0 : 0) : fd + o.spacing;
  const maxCols = Math.max(0, Math.floor((areaW - fw) / px + 1e-9) + 1);
  const maxRows = Math.max(0, Math.floor((areaD - fd) / py + 1e-9) + 1);
  let cols = maxCols, rows = maxRows;
  if (o.countMode === 'exact') {
    cols = Math.min(o.cols, maxCols);
    rows = Math.min(o.rows, maxRows);
  }
  const pts = [];
  for (let j = 0; j < rows; j++) {
    const shift = stagger && j % 2 === 1 ? px / 2 : 0;
    const n = stagger && j % 2 === 1 && shift + (cols - 1) * px + fw > areaW + 1e-9 ? cols - 1 : cols;
    for (let i = 0; i < n; i++) pts.push([i * px + shift, j * py]);
  }
  if (!pts.length) return [];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return pts.map(([x, y]) => [x - cx, y - cy]);
}

// Smallest bin that holds cols x rows pockets.
export function holderGridFor(options = {}) {
  const o = { ...HOLDER_DEFAULTS, ...options };
  const [fw, fd] = footprint(o);
  const stagger = o.pattern === 'staggered';
  const py = stagger && o.shape !== 'rect' ? (fd + o.spacing) * (Math.sqrt(3) / 2) : fd + o.spacing;
  const w = (o.cols - 1) * (fw + o.spacing) + fw + (stagger ? (fw + o.spacing) / 2 : 0);
  const d = (o.rows - 1) * py + fd;
  const edge = 2 * (o.wall + o.edgeMargin) + SPEC.clearance + 0.5;
  return {
    gridX: Math.max(1, Math.ceil((w + edge) / o.pitchX)),
    gridY: Math.max(1, Math.ceil((d + edge) / o.pitchY)),
  };
}

export function holderPockets(options = {}) {
  const o = { ...HOLDER_DEFAULTS, ...options };
  const { W, D, t } = binFrame({ ...o, heightUnits: o.heightUnits || 6 });
  const areaW = W - 2 * (t + o.edgeMargin) - 0.5, areaD = D - 2 * (t + o.edgeMargin) - 0.5;
  return layout(o, areaW, areaD).map(([x, y]) => ({ polygon: pocket(o, x, y), depth: o.depth }));
}

// Pocket shapes plus lead-in steps and finger grooves.
function withExtras(o, centres, sizeOf = () => o) {
  const shapes = [];
  const steps = 3;
  const lead = o.pocketStyle === 'walls' ? 0 : Math.min(o.leadIn, o.depth / 3, Math.max(0, o.spacing / 2 - 0.4));
  for (const [x, y, item] of centres) {
    const p = sizeOf(item);
    shapes.push({ polygon: pocket(p, x, y), depth: p.depth });
    // A stepped chamfer: each step is a layer or two, so it prints as a smooth lead-in.
    if (lead >= 0.2) for (let j = 1; j <= steps; j++) shapes.push({ polygon: pocket(p, x, y, (lead * (steps + 1 - j)) / steps), depth: (lead * j) / steps });
  }
  if (o.groove !== 'none' && o.pocketStyle !== 'walls' && centres.length) {
    const depth = o.grooveDepth > 0 ? Math.min(o.grooveDepth, o.depth) : Math.round(o.depth * 0.66 * 10) / 10;
    const hw = o.grooveWidth / 2;
    const key = o.groove === 'rows' ? 1 : 0; // group by y for rows, x for columns
    const lines = new Map();
    for (const [x, y, item] of centres) {
      const k = Math.round((key ? y : x) * 10) / 10;
      const [fw, fd] = footprint(sizeOf(item));
      const reach = (key ? fw : fd) / 2;
      const l = lines.get(k) || { min: Infinity, max: -Infinity };
      l.min = Math.min(l.min, (key ? x : y) - reach);
      l.max = Math.max(l.max, (key ? x : y) + reach);
      lines.set(k, l);
    }
    for (const [k, { min, max }] of lines) {
      const poly = key ? [[min, k - hw], [max, k - hw], [max, k + hw], [min, k + hw]] : [[k - hw, min], [k + hw, min], [k + hw, max], [k - hw, max]];
      shapes.push({ polygon: poly, depth });
    }
  }
  return shapes;
}

// Rows of different-size pockets with room for a size label under each.
function setLayout(o, items, areaW) {
  const textBand = o.sizeText > 0 ? o.sizeText + 1.6 : 0;
  const rows = [];
  let row = { items: [], w: 0, d: 0 };
  for (const it of items) {
    const p = { ...o, a: it.size };
    const [fw, fd] = footprint(p);
    const cw = Math.max(fw, o.sizeText > 0 ? (it.label.length * 5.2 - 1.2) * (o.sizeText / 6) + 1 : 0);
    const add = (row.items.length ? o.spacing : 0) + cw;
    if (row.items.length && row.w + add > areaW) {
      rows.push(row);
      row = { items: [], w: 0, d: 0 };
    }
    row.items.push({ ...it, p, cw, fd });
    row.w += (row.items.length > 1 ? o.spacing : 0) + cw;
    row.d = Math.max(row.d, fd);
  }
  if (row.items.length) rows.push(row);
  const total = rows.reduce((s, r) => s + r.d + textBand, 0) + o.spacing * Math.max(0, rows.length - 1);
  const out = [];
  let y = total / 2; // back row first
  for (const r of rows) {
    let x = -r.w / 2;
    const cy = y - r.d / 2;
    for (const it of r.items) {
      out.push({ x: x + it.cw / 2, y: cy, textY: y - r.d - textBand + 0.6, ...it });
      x += it.cw + o.spacing;
    }
    y -= r.d + textBand + o.spacing;
  }
  return { placed: out, width: Math.max(0, ...rows.map((r) => r.w)), depth: total };
}

export function generateHolder(options = {}) {
  const o = { ...HOLDER_DEFAULTS, ...options };
  const named = HOLDER_ITEMS[o.item];
  if (named?.board || (named?.set && !o.sizes)) Object.assign(o, itemPocket(o.item, o.orientation));
  const set = parseSizes(o.sizes);
  if (set.length && (named?.set || o.item === 'custom' || !named)) return generateSet(o, set);
  if (o.countMode === 'exact') Object.assign(o, holderGridFor(o), { gridX: Math.max(o.gridX, holderGridFor(o).gridX) });
  const centres = holderPockets(o).map((s) => {
    const xs = s.polygon.map((q) => q[0]), ys = s.polygon.map((q) => q[1]);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  });
  const shapes = withExtras(o, centres);
  return { mesh: generateCutoutBin({ ...o, shapes }), labels: null, count: centres.length, gridX: o.gridX, gridY: o.gridY };
}

function generateSet(o, set) {
  const edge = 2 * (o.wall + o.edgeMargin) + SPEC.clearance + 0.5;
  // Grow the bin until the set fits (widen first, up to the chosen width).
  let layout;
  for (let tries = 0; tries < 40; tries++) {
    const { W, D, t } = binFrame({ ...o, heightUnits: 6 });
    const areaW = W - 2 * (t + o.edgeMargin) - 0.5, areaD = D - 2 * (t + o.edgeMargin) - 0.5;
    layout = setLayout(o, set, areaW);
    if (layout.depth <= areaD) break;
    if (o.countMode === 'fill' && tries === 0) o.gridY = Math.max(o.gridY, Math.ceil((layout.depth + edge) / o.pitchY));
    else o.gridY += 1;
  }
  const centres = layout.placed.map((it) => [it.x, it.y, it]);
  const maxDepth = o.depth;
  const shapes = withExtras(o, centres, (it) => ({ ...it.p, depth: maxDepth }));
  if (!o.heightUnits) o.heightUnits = unitsForDepth(maxDepth + (o.lip ? STACK_CLEAR : 0), o);
  const mesh = generateCutoutBin({ ...o, shapes });
  let labels = null;
  if (o.sizeText > 0) {
    const { H: wallTop, floorTop } = binFrame(o);
    const top = o.pocketStyle === 'walls' ? floorTop : o.lip ? wallTop - STACK_CLEAR : wallTop;
    const raise = o.lip && o.pocketStyle !== 'walls' ? 0.4 : 0.6; // stays under a stacked bin's feet
    labels = new Mesh();
    for (const it of layout.placed) {
      const fit = fitText(it.label, it.x - it.cw / 2 - 0.5, it.textY, it.cw + 1, o.sizeText, o.sizeText, Math.min(2, o.sizeText));
      if (fit) labels.append(textMesh(it.label, fit.x, fit.y, fit.height, top - 0.05, top + raise));
    }
    if (!labels.triangleCount) labels = null;
  }
  return { mesh, labels, count: set.length, gridX: o.gridX, gridY: o.gridY };
}
