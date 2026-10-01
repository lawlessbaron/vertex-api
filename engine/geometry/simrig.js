// Sim rig parts: housings for VoCore screens, a MAX7219 gear display, WS2812
// flag panels and rev bars, and button boxes; a cup holder; flight-stick and
// throttle plates; and a clamp for aluminium profile.
//
// Everything that hangs on the rig shares one mounting pattern, so any housing
// fits any clamp:
//   - an M5 pivot bolt in the middle, and
//   - two M4 lock bolts 20 mm either side of it.
// Housings have curved slots for the lock bolts, so a screen can be turned up
// to 30° either way (a mirror or a rear view) and locked there. Clamps take
// heat-set inserts for all three bolts.
//
// Every part is built to print without supports:
//   - housings face-down, back covers outside-down, the clamp flat, and
//     the cup holder and stick plates flat;
//   - holes that run sideways are teardrops (pointed at the top), which print
//     cleanly without support.
import { Mesh } from './mesh.js';
import { extrudePolygon, circlePolygon } from './polygon.js';
import { rr, wallSlab } from './enclosure.js';
import { placeBadge, recessedSlab } from './brand.js';

// VoCore screens. Sizes marked `known` come from published specs; the others are
// estimates, so the generator asks people to measure theirs before printing.
export const SCREENS = {
  vc34: { name: 'VoCore 3.4" round (800 × 800)', w: 88, h: 88, t: 6, round: true, known: false },
  vc4: { name: 'VoCore 4" (800 × 480)', w: 95, h: 57, t: 3.6, known: false },
  vc43: { name: 'VoCore 4.3" (800 × 480)', w: 104.25, h: 61.6, t: 3.55, known: true },
  vc5: { name: 'VoCore 5"', w: 119.3, h: 68.7, t: 3.6, known: true },
  vc68: { name: 'VoCore 6.8" (800 × 480)', w: 165, h: 100, t: 7.28, known: true },
  vc785: { name: 'VoCore 7.85" ultrawide (1280 × 400)', w: 200, h: 64, t: 6, known: false },
  vc10: { name: 'VoCore 10"', w: 236, h: 150, t: 6, known: false },
};

// LED displays for gear, flags and revs. Board sizes vary between makers, so
// these are typical sizes to measure against.
export const DISPLAYS = {
  matrix1: { name: 'MAX7219 8 × 8 dot matrix (one module)', w: 32.5, h: 32.5, depth: 16, window: [30, 30] },
  matrix4: { name: 'MAX7219 8 × 8 dot matrix, 4 in a row', w: 128.5, h: 32.5, depth: 16, window: [126, 30] },
  seg8: { name: 'MAX7219 8-digit 7-segment', w: 82, h: 15, depth: 14, window: [62, 14] },
  tm1638: { name: 'TM1638 LED & key board', w: 76, h: 50, depth: 16, window: [62, 16] },
};

export const BUTTONS = { 7: 'Rotary encoder (7 mm)', 12: '12 mm push button or toggle', 16: '16 mm push button', 19: '19 mm push button', 22: '22 mm push button', 24: '24 mm arcade button', 30: '30 mm arcade button' };
export const BOLTS = { m4: { d: 4.5, head: 8, nut: 7 }, m5: { d: 5.5, head: 9.5, nut: 8 }, m6: { d: 6.6, head: 11, nut: 10 }, m8: { d: 8.8, head: 14, nut: 13 } };

export const SIM_DEFAULTS = {
  part: 'screen',
  // screen
  screen: 'vc68', screenW: 165, screenH: 100, screenT: 7.28, bezel: 2.5, cable: 'bottom',
  // LED displays
  display: 'matrix1', displayW: 32.5, displayH: 32.5,
  leds: 12, ledRows: 1, ledPitch: 16.67, stripWidth: 10, pixels: 'each',
  // flag panel
  flagPanel: 'flex8', flagCols: 8, flagRows: 8, flagPitch: 10, flagPanelW: 80, flagPanelH: 80, flagPanelT: 2.5, flagCell: 'round', flagGridDepth: 8, flagWindow: 'acrylic', acrylicT: 3, flagBorder: 9,
  // buttons
  buttonRows: 2, buttonCols: 4, buttonHole: 22,
  // cup
  cupD: 85, cupH: 55, handle: 'right',
  // stick plate
  plateL: 200, plateW: 150, plateT: 8, basePattern: 'rect', baseA: 60, baseB: 60, baseD: 70, baseN: 4, baseBolt: 'm5',
  rails: 'double', railSpacing: 100, railBolt: 'm6',
  // mounting
  mount: 'profile', profile: 40, profileBolt: 'm6', joint: 'swivel', patternRun: 'along',
  brandMark: true, // the VERTEX badge on the outside of each back cover
  // parts with their own mounting (hub sleeve, power brick, wheel hanger, tablet, angle bracket)
  rail: '4040', fixing: 'bolt', slotLip: 0,
  hubW: 110, hubL: 45, hubD: 22, portSide: 'front', cable: 'channel',
  brickL: 170, brickW: 75, brickH: 45, vents: 'hex',
  qrD: 50, qrDepth: 40, tilt: 8, hangOn: 'profile',
  devW: 180, devT: 9, bezelClear: 6,
  legA: 70, legB: 90, angle: 90, bracketW: 50, bracketT: 8, legAFix: 'profile', legBFix: 'device', devA: 60, devB: 30, devBolt: 'm6', devHoles: 4,
  // wheel stands (Next Level Racing Wheel Stand 2.0 and similar): sizes to measure on your own stand
  standPart: 'spacer', tubeShape: 'square', slideTube: 40, fixedTube: 44, spacerH: 25, footTube: 40, deckBolt: 'm8', deckSpan: 60, deckRun: 'across',
};

// Aluminium profile: the face you bolt to, the rows of slots on it, the slot
// opening, and the usual bolt. 4080 is bolted on its 80 mm face (two rows).
export const RAILS = {
  1515: { name: '15 series (1515)', face: 38.1, rows: [0], slot: 8.1, lip: 2.3, bolt: 'm8' },
  2020: { name: '20 series (2020)', face: 20, rows: [0], slot: 6.2, lip: 1.8, bolt: 'm5' },
  3030: { name: '30 series (3030)', face: 30, rows: [0], slot: 8.2, lip: 2.2, bolt: 'm6' },
  4040: { name: '40 series (4040)', face: 40, rows: [0], slot: 8.2, lip: 4.3, bolt: 'm6' },
  4080: { name: '4080 (80 mm face)', face: 80, rows: [-20, 20], slot: 8.2, lip: 4.3, bolt: 'm6' },
};

const PIVOT = 20; // lock bolts, either side of the pivot
const INS = { m3: 4.2, m4: 5.6, m5: 6.4 }; // heat-set insert holes
const FRONT = 2, RIM = 2.4, SIDE = 8, COVER = 2.4, R = 3;

// ---------- small shapes ----------
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const box = (x0, y0, z0, x1, y1, z1) => extrudePolygon(rect(x0, y0, x1, y1), [], z0, z1);
// A teardrop hole in a vertical wall (coordinates along the wall, and z), point up.
function teardrop(a, z, r, seg = 20) {
  const pts = [];
  for (let i = 0; i <= seg; i++) { const t = (135 + (270 * i) / seg) * Math.PI / 180; pts.push([a + r * Math.cos(t), z + r * Math.sin(t)]); }
  pts.push([a, z + r * Math.SQRT2]);
  return pts;
}
// A curved slot around the origin, from angle a0 to a1 (radians), w wide.
function arcSlot(cx, cy, r, a0, a1, w, seg = 16) {
  const hw = w / 2, pts = [];
  const at = (rad, a) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  for (let i = 0; i <= seg; i++) pts.push(at(r + hw, a0 + ((a1 - a0) * i) / seg));
  const c1 = at(r, a1);
  for (let i = 1; i < 8; i++) { const t = a1 + (Math.PI * i) / 8; pts.push([c1[0] + hw * Math.cos(t), c1[1] + hw * Math.sin(t)]); }
  for (let i = seg; i >= 0; i--) pts.push(at(r - hw, a0 + ((a1 - a0) * i) / seg));
  const c0 = at(r, a0);
  for (let i = 1; i < 8; i++) { const t = a0 + Math.PI + (Math.PI * i) / 8; pts.push([c0[0] + hw * Math.cos(t), c0[1] + hw * Math.sin(t)]); }
  return pts;
}
// A plate built in layers, so holes can be blind or counterbored: each hole
// is { poly, z0, z1 }. Holes must not overlap one another.
// A flat slab from z = 0 with the VERTEX badge recessed into its underside (the
// face on the bed), clear of every hole, or a plain slab where it won't fit.
function badgeSlab(o, outline, holes, z1) {
  const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]);
  const badge = o.brandMark !== false && z1 >= 2 ? placeBadge(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), holes, { margin: 4, sizes: [12, 9, 7, 5] }) : null;
  return badge ? recessedSlab(outline, holes, badge.groups, 0, z1, 0.6) : extrudePolygon(outline, holes, 0, z1);
}

function layered(outline, holes, T, brand = false) {
  const m = new Mesh();
  // The VERTEX badge, recessed 0.6 mm into the face on the bed, clear of every hole.
  if (brand && T > 3) {
    const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]);
    const badge = placeBadge(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), holes.map((h) => h.poly), { margin: 4 });
    if (badge) {
      holes = [...holes, ...badge.groups.map((g) => ({ poly: g.outer, z0: 0, z1: 0.6 }))];
      for (const g of badge.groups) for (const c of g.holes) m.append(extrudePolygon([...c].reverse(), [], 0, 0.6));
    }
  }
  const cuts = [...new Set([0, T, ...holes.flatMap((h) => [h.z0, h.z1]).filter((z) => z > 0 && z < T)])].sort((a, b) => a - b);
  for (let i = 0; i < cuts.length - 1; i++) {
    const z0 = cuts[i], z1 = cuts[i + 1], mid = (z0 + z1) / 2;
    m.append(extrudePolygon(outline, holes.filter((h) => h.z0 <= mid && h.z1 >= mid).map((h) => h.poly), z0, z1));
  }
  return m;
}
const rotateZ90 = (mesh) => { const p = mesh.positions; for (let i = 0; i < p.length; i += 3) { const x = p[i]; p[i] = -p[i + 1]; p[i + 1] = x; } return mesh; };

// The mounting pattern, laid along x (horizontal) or y (vertical).
const patternPoints = (alongX) => (alongX ? [[-PIVOT, 0], [PIVOT, 0]] : [[0, -PIVOT], [0, PIVOT]]);

// ---------- the housing: a front with openings, walls, and a back cover ----------
// Built face-down around the origin. cw × ch is the space inside; side walls
// are thick enough for M3 heat-set inserts that hold the back cover on.
function housing({ cw, ch, depth, frontHoles = [], notch = null, inside = [] }) {
  const W = cw + 2 * SIDE, H = ch + 2 * RIM, Zt = FRONT + depth;
  const body = new Mesh();
  body.append(extrudePolygon(rr(-W / 2, -H / 2, W / 2, H / 2, R), frontHoles, 0, FRONT));
  // Side walls, with blind holes from the back for the cover's inserts.
  const screwY = ch >= 34 ? [-(ch / 2 - 6), ch / 2 - 6] : [0];
  const screws = [];
  for (const sx of [-1, 1]) {
    const x0 = sx < 0 ? -W / 2 : cw / 2, x1 = sx < 0 ? -cw / 2 : W / 2, cx = sx * (cw / 2 + SIDE / 2);
    const outline = rr(x0, -H / 2, x1, H / 2, R);
    const hd = Math.min(6, depth - 1);
    body.append(extrudePolygon(outline, [], 0, Zt - hd));
    body.append(extrudePolygon(outline, screwY.map((y) => circlePolygon(cx, y, INS.m3 / 2, 20)), Zt - hd, Zt));
    for (const y of screwY) screws.push([cx, y]);
  }
  // Top and bottom walls, reaching into the side walls; the cable notch is cut from the back rim.
  for (const [side, y0, y1] of [['bottom', -H / 2, -ch / 2], ['top', ch / 2, H / 2]]) {
    const a0 = -cw / 2 - R, a1 = cw / 2 + R;
    const outline = [[a0, 0], [a1, 0], [a1, Zt]];
    if (notch && notch.side === side) {
      const lo = Math.max(a0 + 2, notch.at - notch.width / 2), hi = Math.min(a1 - 2, notch.at + notch.width / 2);
      outline.push([hi, Zt], [hi, Zt - notch.depth], [lo, Zt - notch.depth], [lo, Zt]);
    }
    outline.push([a0, Zt]);
    body.append(wallSlab('x', outline, [], y0, y1));
  }
  for (const m of inside) body.append(m);
  return { body, W, H, Zt, screws, cw, ch };
}

// The back cover: outside-down, with the mounting pattern (slots to swivel, or
// plain holes), four locators that key it into the housing, and optional
// posts or a raised strip on the inside.
function backCover(h, { joint = 'swivel', posts = [], plateau = null, brand = true, extraHoles = [] } = {}) {
  const { W, H, cw, ch, screws } = h;
  const alongX = W >= H;
  const holes = screws.map(([x, y]) => circlePolygon(x, y, 1.75, 20));
  holes.push(circlePolygon(0, 0, 2.8, 24)); // M5 pivot
  for (const [x, y] of patternPoints(alongX)) {
    if (joint === 'swivel') {
      const base = Math.atan2(y, x), sweep = (30 * Math.PI) / 180;
      holes.push(arcSlot(0, 0, PIVOT, base - sweep, base + sweep, 4.5));
    } else holes.push(circlePolygon(x, y, 2.25, 20));
  }
  holes.push(...extraHoles);
  const cover = new Mesh();
  // The outside lies on the bed: the VERTEX badge is recessed into it, clear of the screws and the pattern.
  const badge = brand ? placeBadge(-W / 2, -H / 2, W / 2, H / 2, holes, { margin: 4 }) : null;
  if (badge) cover.append(recessedSlab(rr(-W / 2, -H / 2, W / 2, H / 2, R), holes, badge.groups, 0, COVER, 0.6));
  else cover.append(extrudePolygon(rr(-W / 2, -H / 2, W / 2, H / 2, R), holes, 0, COVER));
  // Locators: an L in each inside corner.
  const i0 = -cw / 2 + 0.3, i1 = cw / 2 - 0.3, j0 = -ch / 2 + 0.3, j1 = ch / 2 - 0.3, L = Math.min(12, cw / 4, ch / 3), t = 1.4;
  for (const [x, y, sx, sy] of [[i0, j0, 1, 1], [i1, j0, -1, 1], [i0, j1, 1, -1], [i1, j1, -1, -1]]) {
    cover.append(box(Math.min(x, x + sx * L), Math.min(y, y + sy * t), COVER, Math.max(x, x + sx * L), Math.max(y, y + sy * t), COVER + 2));
    cover.append(box(Math.min(x, x + sx * t), Math.min(y, y + sy * L), COVER, Math.max(x, x + sx * t), Math.max(y, y + sy * L), COVER + 2));
  }
  for (const [x, y, hgt] of posts) cover.append(extrudePolygon(circlePolygon(x, y, 3, 20), [], COVER, COVER + hgt));
  if (plateau) {
    // Raised pads to stick an LED strip or panel to, either side of the mounting
    // bolts (the strip bridges the gap, so the bolts stay reachable).
    const { w, hgt } = plateau, clear = PIVOT + 8;
    const [len, span] = alongX ? [cw, Math.min(w, ch - 2)] : [ch, Math.min(w, cw - 2)];
    for (const [a0, a1] of [[-len / 2 + 1, -clear], [clear, len / 2 - 1]]) {
      if (a1 - a0 < 6) continue;
      const pad = alongX ? rect(a0, -span / 2, a1, span / 2) : rect(-span / 2, a0, span / 2, a1);
      cover.append(extrudePolygon(pad, [], COVER, COVER + hgt));
    }
  }
  return cover;
}

// ---------- mounts: all carry heat-set inserts for the pattern ----------
function profileMount(o) {
  const bolt = BOLTS[o.profileBolt] || BOLTS.m6;
  const Wp = Math.max(+o.profile, o.patternRun === 'across' ? 60 : 30), L = 110, T = 14;
  const outline = rr(-L / 2, -Wp / 2, L / 2, Wp / 2, 3);
  const holes = [];
  // T-nut bolts at each end, counterbored from the top so the heads sit below the face.
  for (const x of [-(L / 2 - 11), L / 2 - 11]) {
    holes.push({ poly: circlePolygon(x, 0, bolt.d / 2, 24), z0: 0, z1: 5 });
    holes.push({ poly: circlePolygon(x, 0, bolt.head / 2 + 0.5, 28), z0: 5, z1: T });
  }
  holes.push({ poly: circlePolygon(0, 0, INS.m5 / 2, 24), z0: T - 10, z1: T });
  for (const [x, y] of patternPoints(o.patternRun !== 'across')) holes.push({ poly: circlePolygon(x, y, INS.m4 / 2, 24), z0: T - 8, z1: T });
  return { mesh: layered(outline, holes, T, o.brandMark !== false), name: 'profile-clamp', detail: 'Flat side down', hardware: [[2, `${o.profileBolt.toUpperCase()} bolts and T-nuts for ${+o.profile} mm profile`]] };
}

function mountParts(o) {
  if (o.mount === 'profile') return [profileMount(o)];
  return [];
}

// ---------- the parts ----------
function screenParts(o) {
  const sc = SCREENS[o.screen];
  const w = +o.screenW || sc?.w || 120, hgt = +o.screenH || sc?.h || 70, t = +o.screenT || sc?.t || 4, lip = Math.max(1, +o.bezel);
  const round = o.screen === 'vc34';
  const cw = w + 0.6, ch = hgt + 0.6, depth = t + 4.5; // room behind for the pattern bolts' heads
  const win = round ? circlePolygon(0, 0, w / 2 - lip, 64) : rr(-w / 2 + lip, -hgt / 2 + lip, w / 2 - lip, hgt / 2 - lip, 1.5);
  const notch = o.cable === 'none' ? null : { side: o.cable === 'top' ? 'top' : 'bottom', at: o.cable === 'left' ? -cw / 4 : o.cable === 'right' ? cw / 4 : 0, width: 14, depth: Math.min(depth - 1, t + 3) };
  // A shelf the screen rests on, so the glass sits just behind the bezel.
  const h = housing({ cw, ch, depth, frontHoles: [win], notch });
  // Posts press the screen forward; put a strip of foam tape on each.
  const posts = [[-cw / 3, -ch / 4, 2.5], [cw / 3, -ch / 4, 2.5], [-cw / 3, ch / 4, 2.5], [cw / 3, ch / 4, 2.5]];
  const cover = backCover(h, { brand: o.brandMark !== false, joint: o.joint, posts });
  return {
    parts: [
      { mesh: h.body, name: 'screen-housing', detail: 'Face down', group: 'body' },
      { mesh: cover.translate(0, h.H + 12, 0), name: 'screen-back', detail: 'Outside face down', group: 'cover' },
    ],
    h, known: Boolean(sc?.known) && +o.screenW === sc.w && +o.screenH === sc.h,
    hardware: [[h.screws.length, 'M3 heat-set inserts and M3 × 8 screws (back cover)'], [1, 'Foam tape (to press the screen forward)']],
  };
}

function displayParts(o) {
  const d = DISPLAYS[o.display] || DISPLAYS.matrix1;
  const w = +o.displayW || d.w, hgt = +o.displayH || d.h;
  // Room for an Arduino Nano (45 × 18 mm) beside or behind the display.
  const cw = Math.max(w + 1, 50), ch = Math.max(hgt + 1, 36), depth = d.depth + 12;
  const [ww, wh] = [Math.min(d.window[0], w - 1), Math.min(d.window[1], hgt - 1)];
  // Corner guides hold the display square behind the window.
  const g = [], x0 = -w / 2 - 0.2, x1 = w / 2 + 0.2, y0 = -hgt / 2 - 0.2, y1 = hgt / 2 + 0.2, L = Math.min(8, w / 3, hgt / 3);
  for (const [x, y, sx, sy] of [[x0, y0, -1, -1], [x1, y0, 1, -1], [x0, y1, -1, 1], [x1, y1, 1, 1]]) {
    g.push(box(Math.min(x, x + sx * 1.2), Math.min(y, y - sy * L), FRONT, Math.max(x, x + sx * 1.2), Math.max(y, y - sy * L), FRONT + 4));
    g.push(box(Math.min(x, x - sx * L), Math.min(y, y + sy * 1.2), FRONT, Math.max(x, x - sx * L), Math.max(y, y + sy * 1.2), FRONT + 4));
  }
  const h = housing({ cw, ch, depth, frontHoles: [rr(-ww / 2, -wh / 2, ww / 2, wh / 2, 0.8)], notch: { side: 'bottom', at: cw / 4, width: 12, depth: 9 }, inside: g });
  const cover = backCover(h, { brand: o.brandMark !== false, joint: o.joint, posts: [[-w / 2 + 4, 0, depth - d.depth - 0.5], [w / 2 - 4, 0, depth - d.depth - 0.5]].filter(([x]) => Math.abs(x) > 6) });
  return {
    parts: [
      { mesh: h.body, name: `${o.display}-housing`, detail: 'Face down', group: 'body' },
      { mesh: cover.translate(0, h.H + 12, 0), name: `${o.display}-back`, detail: 'Outside face down', group: 'cover' },
    ],
    h, hardware: [[h.screws.length, 'M3 heat-set inserts and M3 × 8 screws (back cover)'], [1, `${d.name} display`], [1, 'Arduino Nano or Pro Micro, and a USB cable']],
  };
}

// WS2812 rev bars (one row) and flag panels (several rows): a window per LED
// with a wall between each, so every LED reads as its own crisp pixel, and a
// diffuser printed into the windows in a second (white or clear) filament.
function ledParts(o) {
  const cols = Math.max(1, Math.round(+o.leds)), rows = Math.max(1, Math.round(+o.ledRows)), p = Math.max(5, +o.ledPitch);
  const cell = p - 1.6; // the window each LED shines through
  const cw = cols * p + 4, ch = Math.max(rows * p + 4, +o.stripWidth + 6, 22), depth = 16;
  const windows = [];
  if (o.pixels === 'each') {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = (c - (cols - 1) / 2) * p, y = (r - (rows - 1) / 2) * p;
      windows.push(rr(x - cell / 2, y - cell / 2, x + cell / 2, y + cell / 2, Math.min(1.2, cell / 4)));
    }
  } else windows.push(rr(-cols * p / 2 + 0.8, -rows * p / 2 + 0.8, cols * p / 2 - 0.8, rows * p / 2 - 0.8, 1.5));
  // Walls between the pixels, up to where the LEDs sit.
  const baffles = [], bh = depth - 7;
  if (o.pixels === 'each') {
    for (let c = 1; c < cols; c++) { const x = (c - cols / 2) * p; baffles.push(box(x - 0.6, -rows * p / 2, FRONT, x + 0.6, rows * p / 2, FRONT + bh)); }
    for (let r = 1; r < rows; r++) { const y = (r - rows / 2) * p; baffles.push(box(-cols * p / 2, y - 0.6, FRONT, cols * p / 2, y + 0.6, FRONT + bh)); }
  }
  const h = housing({ cw, ch, depth, frontHoles: windows, notch: { side: 'bottom', at: cw / 2 - 12, width: 10, depth: 8 }, inside: baffles });
  // The strip or panel sticks to a raised strip on the cover, facing the windows.
  const plateauH = depth - bh - 1.5 - 2;
  const cover = backCover(h, { brand: o.brandMark !== false, joint: o.joint, plateau: { w: Math.max(rows * p, +o.stripWidth + 2), hgt: Math.max(3, plateauH) } });
  const diffuser = new Mesh();
  for (const wpoly of windows) diffuser.append(extrudePolygon(wpoly, [], 0, 0.8));
  const kind = rows > 1 ? 'flag-panel' : 'rev-bar';
  return {
    parts: [
      { mesh: h.body, name: `${kind}-housing`, detail: 'Face down', group: 'body' },
      { mesh: diffuser, name: `${kind}-diffuser`, detail: 'Second colour: white or clear', group: 'diffuser', filament: 2 },
      { mesh: cover.translate(0, h.H + 12, 0), name: `${kind}-back`, detail: 'Outside face down', group: 'cover' },
    ],
    h, pixels: rows * cols,
    hardware: [[h.screws.length, 'M3 heat-set inserts and M3 × 8 screws (back cover)'], [rows * cols, `WS2812B LEDs (${rows > 1 ? `${rows} rows of ${cols}` : `a strip of ${cols}`}, ${+o.stripWidth} mm wide)`], [1, 'Arduino Nano or Pro Micro, and a USB cable']],
  };
}

// Flag panels: an LED matrix behind a smoked window, in a frame held by four
// corner screws. From the front: the bezel, the window (smoked acrylic, or
// printed clear), a light grid with a cell per LED so each one reads as a
// crisp dot, the LED panel, then room for the Arduino and the back cover.
// The body prints back-down, so nothing overhangs; the bezel prints face-down
// for a clean front.
export const FLAG_PANELS = {
  flex8: { name: 'Flexible 8 × 8 panel (10 mm spacing)', cols: 8, rows: 8, pitch: 10, w: 80, h: 80, t: 2.5, known: false },
  flex16: { name: 'Flexible 16 × 16 panel (10 mm spacing)', cols: 16, rows: 16, pitch: 10, w: 160, h: 160, t: 2.5, known: false },
  flex832: { name: 'Flexible 8 × 32 panel (10 mm spacing)', cols: 32, rows: 8, pitch: 10, w: 320, h: 80, t: 2.5, known: false },
  rigid8: { name: 'Rigid 8 × 8 board (8 mm spacing)', cols: 8, rows: 8, pitch: 8, w: 65, h: 65, t: 3.2, known: false },
  strip60: { name: 'Rows of strip, 60 LEDs per metre', cols: 8, rows: 8, pitch: 1000 / 60, strip: true, t: 3, known: true },
  strip144: { name: 'Rows of strip, 144 LEDs per metre', cols: 12, rows: 12, pitch: 1000 / 144, strip: true, t: 3, known: true },
};
const LED_SIZE = 5; // a WS2812B is 5 × 5 mm

export function flagLayout(o) {
  const cols = Math.max(1, Math.round(+o.flagCols)), rows = Math.max(1, Math.round(+o.flagRows)), p = Math.max(5, +o.flagPitch);
  const A = [cols * p, rows * p]; // the lit area
  const G = A.map((v) => v + 3.2); // the light grid, with a 1.6 mm rim
  const panel = [Math.max(+o.flagPanelW || 0, A[0]), Math.max(+o.flagPanelH || 0, A[1])];
  const cav = [Math.max(G[0], panel[0]) + 0.6, Math.max(G[1], panel[1]) + 0.6];
  const lip = 3, border = Math.max(7, +o.flagBorder || 9);
  const Ac = cav.map((v) => v + 2 * lip); // the window
  const W = Ac[0] + 2 * border, H = Ac[1] + 2 * border;
  const aT = o.flagWindow === 'printed' ? 1.2 : Math.max(1, +o.acrylicT || 3);
  const gd = Math.max(3, +o.flagGridDepth || 8), pt = Math.max(1, +o.flagPanelT || 2.5), room = 18, ledge = 1.6;
  const Zt = aT + ledge + Math.max(0, gd - ledge) + pt + room;
  return { cols, rows, p, A, G, panel, cav, Ac, W, H, border, aT, gd, pt, room, ledge, Zt };
}

function flagParts(o) {
  const L = flagLayout(o);
  const { cols, rows, p, A, G, cav, Ac, W, H, border, aT, gd, pt, ledge, Zt } = L;
  const [cw, ch] = cav;
  const rect2 = ([w, h], r = 1) => rr(-w / 2, -h / 2, w / 2, h / 2, r);
  // Corner screws hold the bezel; four more, in the side walls, hold the back cover.
  const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => [sx * (W / 2 - border / 2), sy * (H / 2 - border / 2)]));
  const sideX = cw / 2 + (W - cw) / 4;
  const screws = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => [sx * sideX, sy * ch / 4]));

  // The body, built back rim down: z = 0 is the back, z = Zt the front.
  const zLedge = Zt - aT - ledge;
  const body = layered(rr(-W / 2, -H / 2, W / 2, H / 2, R + 1), [
    { poly: rect2(cav, 1), z0: 0, z1: zLedge },
    { poly: rect2(G.map((v) => v + 0.4), 0.8), z0: zLedge, z1: Zt - aT },
    { poly: rect2(Ac, 1.5), z0: Zt - aT, z1: Zt },
    ...corners.map(([x, y]) => ({ poly: circlePolygon(x, y, INS.m3 / 2, 20), z0: Zt - 6, z1: Zt })),
    ...screws.map(([x, y]) => ({ poly: circlePolygon(x, y, INS.m3 / 2, 20), z0: 0, z1: 6 })),
  ], Zt);

  // The bezel, face down: an opening for the lit area and the four corner screws.
  const bezelT = 3;
  const bezel = extrudePolygon(rr(-W / 2, -H / 2, W / 2, H / 2, R + 1), [rect2(A.map((v) => v + 1), 1.5), ...corners.map(([x, y]) => circlePolygon(x, y, 1.7, 20))], 0, bezelT);

  // The light grid: a cell per LED, deep enough to keep each dot crisp.
  const cell = p - 1.2, cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = (c - (cols - 1) / 2) * p, y = (r - (rows - 1) / 2) * p;
    cells.push(o.flagCell === 'square' ? rr(x - cell / 2, y - cell / 2, x + cell / 2, y + cell / 2, Math.min(1, cell / 5)) : circlePolygon(x, y, cell / 2, 28));
  }
  const grid = extrudePolygon(rect2(G, 0.8), cells, 0, gd);

  const win = extrudePolygon(rect2(Ac.map((v) => v - 0.4), 1.5), [], 0, aT);

  // The back cover: the VERTEX pattern, a slot for the USB cable, and posts that
  // press the LED panel (with a strip of foam tape) against the grid.
  const postH = Zt - (aT + Math.max(gd, ledge) + pt) - 0.5;
  const posts = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => [sx * cw / 3, sy * ch / 3, postH])).filter(([x, y]) => Math.hypot(x, y) > PIVOT + 9);
  const cable = rr(cw / 4 - 6, -ch / 2 + 5, cw / 4 + 6, -ch / 2 + 12, 3);
  const h = { W, H, Zt, cw, ch, screws };
  const cover = backCover(h, { brand: o.brandMark !== false, joint: o.joint, posts, extraHoles: [cable] });

  const n = rows * cols, amps = n * 0.06;
  const warnings = [];
  if (cell < LED_SIZE + 0.6) warnings.push(`The LEDs are ${p.toFixed(1)} mm apart, which leaves cells only ${cell.toFixed(1)} mm across: tight round a 5 mm LED. Use square cells, or check your panel's spacing.`);
  if (amps > 0.5) warnings.push(`${n} LEDs can draw up to ${amps.toFixed(1)} A at full white; USB gives about 0.5 A. Keep SimHub's brightness low (20–30% is plenty behind smoked acrylic), or power the panel from a separate 5 V ${Math.ceil(amps)} A supply and join its ground to the Arduino's.`);
  const gap = 12;
  return {
    parts: [
      { mesh: body, name: 'flag-body', detail: 'Back rim down', group: 'body' },
      { mesh: bezel.translate(W + gap, 0, 0), name: 'flag-bezel', detail: 'Face down', group: 'bezel' },
      { mesh: grid.translate(2 * (W + gap), 0, 0), name: 'flag-light-grid', detail: 'Either way up. Black or dark grey', group: 'grid' },
      { mesh: win.translate(W + gap, H + gap, 0), name: 'flag-window', detail: o.flagWindow === 'printed' ? 'Flat. Clear or white PETG' : `Cut from ${aT} mm smoked acrylic (${Math.round(Ac[0] - 0.4)} × ${Math.round(Ac[1] - 0.4)} mm), or print it in clear PETG`, group: 'window', ...(o.flagWindow === 'printed' ? { filament: 2 } : {}) },
      { mesh: cover.translate(0, H + gap, 0), name: 'flag-back', detail: 'Outside face down', group: 'cover' },
    ],
    h, pixels: n, layout: L, warnings,
    hardware: [
      [4, 'M3 × 10 button-head screws for the bezel (coloured ones look great)'],
      [8, 'M3 heat-set inserts'],
      [4, 'M3 × 8 screws (back cover)'],
      [1, `${FLAG_PANELS[o.flagPanel]?.name || 'LED matrix'}: ${cols} × ${rows} WS2812B, ${+p.toFixed(2)} mm apart`],
      [1, o.flagWindow === 'printed' ? 'Nothing extra: the window is printed' : `${aT} mm smoked (grey) acrylic, ${Math.round(Ac[0] - 0.4)} × ${Math.round(Ac[1] - 0.4)} mm`],
      [1, 'Arduino Nano (or Pro Micro) and a USB cable'],
      [1, '330–470 Ω resistor (data line) and a 1000 µF capacitor (across 5 V and GND)'],
      [1, 'Foam tape, for the posts that press the panel forward'],
    ],
  };
}

function buttonParts(o) {
  const rows = Math.max(1, Math.round(+o.buttonRows)), cols = Math.max(1, Math.round(+o.buttonCols)), d = +o.buttonHole || 22;
  const pitch = Math.max(d + 10, 26);
  const cw = cols * pitch + 6, ch = Math.max(rows * pitch + 6, 40), depth = Math.max(36, d + 16);
  const holes = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) holes.push(circlePolygon((c - (cols - 1) / 2) * pitch, (r - (rows - 1) / 2) * pitch, d / 2 + 0.15, 40));
  const h = housing({ cw, ch, depth, frontHoles: holes, notch: { side: 'bottom', at: cw / 2 - 14, width: 12, depth: 9 } });
  const cover = backCover(h, { brand: o.brandMark !== false, joint: o.joint });
  return {
    parts: [
      { mesh: h.body, name: 'button-box', detail: 'Face down', group: 'body' },
      { mesh: cover.translate(0, h.H + 12, 0), name: 'button-box-back', detail: 'Outside face down', group: 'cover' },
    ],
    h, hardware: [[h.screws.length, 'M3 heat-set inserts and M3 × 8 screws (back cover)'], [rows * cols, BUTTONS[d] || `${d} mm buttons`], [1, 'Arduino Pro Micro or Leonardo (shows up as a game controller)']],
  };
}

function cupParts(o) {
  const ri = +o.cupD / 2 + 1, wall = 3, H = Math.max(62, +o.cupH), ro = ri + wall;
  const m = new Mesh();
  // An annular sector from angle t0 to t1 (t0 < t1).
  const sector = (a, b, t0, t1, z0, z1) => {
    const pts = [], n = Math.max(8, Math.round(((t1 - t0) / (Math.PI * 2)) * 96));
    for (let i = 0; i <= n; i++) { const t = t0 + ((t1 - t0) * i) / n; pts.push([b * Math.cos(t), b * Math.sin(t)]); }
    for (let i = n; i >= 0; i--) { const t = t0 + ((t1 - t0) * i) / n; pts.push([a * Math.cos(t), a * Math.sin(t)]); }
    return extrudePolygon(pts, [], z0, z1);
  };
  // The wall, with a gap at the back where the flat mounting block takes over,
  // and (above a third of the height) a gap for the handle.
  const back = Math.PI / 2, bh = Math.asin(28 / ro), hand = { right: 0, left: Math.PI }[o.handle];
  const gaps = (withHandle) => [[back - bh, back + bh], ...(withHandle && hand !== undefined ? [[hand - Math.asin(16 / ro), hand + Math.asin(16 / ro)]] : [])]
    .map(([a, b]) => [((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), ((b % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)]);
  const walls = (z0, z1, withHandle) => {
    // Walk round from the end of the back gap, skipping each gap.
    const g = gaps(withHandle).map(([a, b]) => (b < a ? [a, b + 2 * Math.PI] : [a, b])).sort((x, y) => x[0] - y[0]);
    for (let i = 0; i < g.length; i++) {
      const from = g[i][1], to = g[(i + 1) % g.length][0] + (i + 1 === g.length ? 2 * Math.PI : 0);
      if (to - from > 0.02) m.append(sector(ri, ro, from, to, z0, z1));
    }
  };
  m.append(extrudePolygon(circlePolygon(0, 0, ro, 96), [circlePolygon(0, 0, ri - 10, 96)], 0, 3)); // the lip the cup stands on
  walls(3, H * 0.4, false);
  walls(H * 0.4, H, true);
  // The flat block at the back. Its inside face touches the cup's circle, so the
  // bolts go in from inside the holder and their heads sit flat against it.
  const holes = [teardrop(0, H / 2, 2.8), teardrop(0, H / 2 - PIVOT, 2.25), teardrop(0, H / 2 + PIVOT, 2.25)];
  m.append(wallSlab('x', [[-28, 0], [28, 0], [28, H], [-28, H]], holes, ri, ro + 8));
  // Fill between the curve and the block, clear of the bolt line.
  for (const sx of [-1, 1]) {
    const pts = [];
    const xs = sx > 0 ? [6, 28] : [-28, -6];
    for (let i = 0; i <= 12; i++) { const x = xs[0] + ((xs[1] - xs[0]) * i) / 12; pts.push([x, Math.sqrt(Math.max(0, ri * ri - x * x))]); }
    pts.push([xs[1], ri + 0.5], [xs[0], ri + 0.5]);
    m.append(extrudePolygon(pts, [], 0, H));
  }
  return { parts: [{ mesh: m, name: 'cup-holder', detail: 'Base down', group: 'body' }], hardware: [], vertical: true };
}

// Stick and throttle plates (VKB, Virpil, Thrustmaster, Winwing or any base):
// the base's screws come up from underneath into counterbores, and the plate
// bolts across one or two aluminium profiles with slots for adjustment.
function stickParts(o) {
  const L = +o.plateL, W = +o.plateW, T = Math.max(6, +o.plateT);
  const bb = BOLTS[o.baseBolt] || BOLTS.m5, rb = BOLTS[o.railBolt] || BOLTS.m6;
  const base = o.basePattern === 'circle'
    ? Array.from({ length: Math.max(3, Math.round(+o.baseN)) }, (_, i) => { const t = (i / Math.max(3, Math.round(+o.baseN))) * Math.PI * 2 + Math.PI / 4; return [(+o.baseD / 2) * Math.cos(t), (+o.baseD / 2) * Math.sin(t)]; })
    : [[-o.baseA / 2, -o.baseB / 2], [o.baseA / 2, -o.baseB / 2], [-o.baseA / 2, o.baseB / 2], [o.baseA / 2, o.baseB / 2]];
  const holes = [];
  for (const [x, y] of base) {
    holes.push({ poly: circlePolygon(x, y, bb.head / 2 + 0.4, 28), z0: 0, z1: 3.5 });
    holes.push({ poly: circlePolygon(x, y, bb.d / 2, 24), z0: 3.5, z1: T });
  }
  const railY = o.rails === 'double' ? [-o.railSpacing / 2, +o.railSpacing / 2] : [0];
  const slots = [];
  for (const y of railY) for (const sx of [-1, 1]) {
    const x = sx * (L / 2 - 16);
    if (base.some(([bx, by]) => Math.hypot(bx - x, by - y) < bb.head / 2 + rb.head / 2 + 8)) continue; // too close to the base's screws
    slots.push([x, y]);
    const slot = (r) => rr(x - 6 - r, y - r, x + 6 + r, y + r, r - 0.01, 6);
    holes.push({ poly: slot(rb.d / 2), z0: 0, z1: T - 4 });
    holes.push({ poly: slot(rb.head / 2 + 0.5), z0: T - 4, z1: T });
  }
  return {
    parts: [{ mesh: layered(rr(-L / 2, -W / 2, L / 2, W / 2, 6), holes, T, o.brandMark !== false), name: 'stick-plate', detail: 'Counterbored side down', group: 'body' }],
    slots: slots.length,
    hardware: [[base.length, `${o.baseBolt.toUpperCase()} countersunk or cap screws for your base (length: plate ${T} mm + the base's thread depth)`], [slots.length, `${o.railBolt.toUpperCase()} bolts and T-nuts for the profile`]],
  };
}

// ---------- parts with their own mounting ----------
const rotZ = (mesh, a) => { const c = Math.cos(a), sn = Math.sin(a), p = mesh.positions; for (let i = 0; i < p.length; i += 3) { const x = p[i], y = p[i + 1]; p[i] = x * c - y * sn; p[i + 1] = x * sn + y * c; } return mesh; };
// A hexagon with flat top and bottom: in a wall its upper sides slope at 60°
// and the flat top is a short bridge, so it prints without support.
const hexFlat = (x, y, r) => Array.from({ length: 6 }, (_, i) => { const t = (i * Math.PI) / 3; return [x + r * Math.cos(t), y + r * Math.sin(t)]; });
// Hexagons packed in a rectangle, keeping a margin.
function hexField(a0, a1, b0, b1, r, gap, make) {
  const out = [], dx = 2 * r * Math.cos(Math.PI / 6) + gap, dy = 1.5 * r + gap * 0.87;
  for (let j = 0, b = b0 + r; b + r <= b1; j++, b += dy) for (let a = a0 + r + (j % 2 ? dx / 2 : 0); a + r <= a1; a += dx) out.push(make(a, b, r));
  return out;
}
// A cone (or cylinder), optionally leaning in y by `shear` per mm of height.
function frustum(r0, r1, z0, z1, { seg = 64, shear = 0, cx = 0, cy = 0 } = {}) {
  const m = new Mesh();
  const ring = (r, z) => { const s0 = m.vertexCount; for (let i = 0; i < seg; i++) { const t = (i / seg) * Math.PI * 2; m.addVertex(cx + r * Math.cos(t), cy + r * Math.sin(t) + shear * z, z); } return s0; };
  const a = ring(r0, z0), b = ring(r1, z1);
  const ca = m.addVertex(cx, cy + shear * z0, z0), cb = m.addVertex(cx, cy + shear * z1, z1);
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    m.addQuad(a + i, a + j, b + j, b + i);
    m.addTri(ca, a + j, a + i);
    m.addTri(cb, b + i, b + j);
  }
  return m;
}
const railOf = (o) => RAILS[o.rail] || RAILS[4040];
const boltOf = (o) => BOLTS[railOf(o).bolt];

// A USB hub sleeve, printed standing: a pocket the hub slides into, a window
// for its ports, and a flange that bolts (or snaps) onto the profile.
function hubParts(o) {
  const w = +o.hubW + 0.6, d = +o.hubD + 0.6, L = Math.max(20, +o.hubL), t = 2.4, F = 2;
  const rail = railOf(o), bolt = boltOf(o);
  const m = new Mesh();
  const X = w / 2 + t, Yf = -d / 2 - t, Yb = d / 2 + t;
  // Walls: a window in the front for the ports (narrower than the hub, so it stays put).
  const lip = Math.min(6, w / 5);
  if (o.portSide === 'front') {
    m.append(extrudePolygon([[-X, Yf], [-w / 2 + lip, Yf], [-w / 2 + lip, -d / 2], [-w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [w / 2, -d / 2], [w / 2 - lip, -d / 2], [w / 2 - lip, Yf], [X, Yf], [X, Yb], [-X, Yb]], [], 0, L + F));
  } else m.append(extrudePolygon(rect(-X, Yf, X, Yb), [rect(-w / 2, -d / 2, w / 2, d / 2)], F, L + F));
  // The floor, with a slot for the hub's cable.
  m.append(badgeSlab(o, rect(-X, Yf, X, Yb), [rr(-8, -d / 4, 8, d / 4, Math.min(3, d / 4 - 0.1))], F));
  // Crush ribs on the side walls grip the hub.
  for (const sx of [-1, 1]) for (const y of [-d / 4, d / 4]) m.append(extrudePolygon(sx < 0 ? [[-w / 2 - 0.01, y - 1], [-w / 2 + 0.5, y], [-w / 2 - 0.01, y + 1]] : [[w / 2 + 0.01, y + 1], [w / 2 - 0.5, y], [w / 2 + 0.01, y - 1]], [], F, L + F));
  // The flange behind, across the profile's face.
  const fw = Math.max(rail.face, 2 * X), ft = 5, H = L + F;
  if (o.fixing === 'snap') {
    m.append(box(-fw / 2, Yb, 0, fw / 2, Yb + ft, H));
    // Two springy prongs with barbs, snapping into each slot row.
    const sw = rail.slot - 0.3, neck = (+o.slotLip || rail.lip) + 0.3, barb = 1.1, gap = 1.4, len = 5;
    for (const cx of rail.rows) {
      const y0 = Yb + ft, y1 = y0 + neck, y2 = y1 + len;
      for (const side of [-1, 1]) {
        const xin = cx + side * gap / 2, xout = cx + side * sw / 2;
        const pts = [[xin, y0], [xout, y0], [xout, y1], [xout + side * barb, y1 + 1.2], [xin + side * 0.8, y2], [xin, y2]];
        m.append(extrudePolygon(side > 0 ? pts : pts.reverse(), [], 0, H));
      }
    }
  } else {
    const holes = [];
    const zs = H >= 50 ? [H * 0.25, H * 0.75] : [H / 2];
    for (const cx of rail.rows) for (const z of zs) holes.push(teardrop(cx, z, bolt.d / 2));
    m.append(wallSlab('x', rect(-fw / 2, 0, fw / 2, H), holes, Yb, Yb + ft));
  }
  // Cable management on the right-hand side.
  if (o.cable === 'channel') m.append(extrudePolygon([[X - 0.01, -5], [X + 10, -5], [X + 10, 5], [X + 7.6, 5], [X + 7.6, -2.6], [X + 2.4, -2.6], [X + 2.4, 5], [X - 0.01, 5]], [], 0, H));
  else if (o.cable === 'tie') m.append(extrudePolygon(rect(X - 0.01, -4.5, X + 8, 4.5), [rect(X + 2, -2.5, X + 5.5, 2.5)], 0, H));
  return {
    parts: [{ mesh: m, name: 'usb-hub-sleeve', detail: 'Stands on its end', group: 'body' }],
    hardware: o.fixing === 'snap' ? [] : [[rail.rows.length * (H >= 50 ? 2 : 1), `${rail.bolt.toUpperCase()} bolts and T-nuts for ${rail.name}`]],
  };
}

// A power brick sling: a vented cradle, posts for a strap over the top, and
// tabs at each end that bolt to the profile.
function brickParts(o) {
  const L = +o.brickL + 1, W = +o.brickW + 1, Hb = +o.brickH + 0.5, t = 3, F = 3, wallH = F + Hb * 0.6, tab = 20;
  const rail = railOf(o), bolt = boltOf(o);
  const m = new Mesh();
  const X = L / 2 + t, Y = W / 2 + t;
  const floorVents = o.vents === 'hex' ? hexField(-L / 2 + 6, L / 2 - 6, -W / 2 + 6, W / 2 - 6, 5, 3, (x, y, r) => hexFlat(x, y, r)) : [];
  const tabHoles = [];
  for (const sx of [-1, 1]) for (const cy of rail.rows.length > 1 ? rail.rows : [0]) tabHoles.push(circlePolygon(sx * (X + tab / 2), cy, bolt.d / 2, 24));
  m.append(badgeSlab(o, rr(-X - tab, -Y, X + tab, Y, 4), [...floorVents, ...tabHoles], F));
  // Side walls with vents, end walls with a cable notch.
  for (const [y0, y1] of [[-Y, -W / 2], [W / 2, Y]]) {
    const vents = o.vents === 'hex' ? hexField(-L / 2 + 8, L / 2 - 8, F + 4, wallH - 3, 4.5, 3, (a, z, r) => hexFlat(a, z, r)) : [];
    m.append(wallSlab('x', rect(-X, 0, X, wallH), vents, y0, y1));
  }
  for (const [x0, x1] of [[-X, -L / 2], [L / 2, X]]) {
    const n = Math.min(W * 0.5, 30);
    m.append(wallSlab('y', [[-W / 2, 0], [W / 2, 0], [W / 2, wallH], [n / 2, wallH], [n / 2, F + 4], [-n / 2, F + 4], [-n / 2, wallH], [-W / 2, wallH]], [], x0, x1));
  }
  // Strap posts: up past the top of the brick, with an M4 insert in each.
  const postH = F + Hb + 2;
  for (const sy of [-1, 1]) {
    const y0 = sy < 0 ? -Y - 10 : Y - 0.01, y1 = sy < 0 ? -Y + 0.01 : Y + 10;
    m.append(extrudePolygon(rect(-7, y0, 7, y1), [], 0, postH - 8));
    m.append(extrudePolygon(rect(-7, y0, 7, y1), [circlePolygon(0, sy * (Y + 5), INS.m4 / 2, 20)], postH - 8, postH));
  }
  // The strap: flat, printed on its own.
  const span = 2 * (Y + 5);
  // The floor is mostly vents, so the badge goes under the strap.
  const strap = badgeSlab(o, rr(-span / 2 - 7, -10, span / 2 + 7, 10, 4), [circlePolygon(-span / 2, 0, 2.25, 20), circlePolygon(span / 2, 0, 2.25, 20)], 4).translate(0, Y + 35, 0);
  return {
    parts: [
      { mesh: m, name: 'power-brick-sling', detail: 'Floor down', group: 'body' },
      { mesh: strap, name: 'power-brick-strap', detail: 'Flat', group: 'body' },
    ],
    hardware: [[2, 'M4 heat-set inserts and M4 × 10 screws (strap)'], [tabHoles.length, `${rail.bolt.toUpperCase()} bolts and T-nuts for ${rail.name}`]],
  };
}

// A quick-release wheel hanger: a peg the wheel's QR slides onto, leaning up
// a few degrees so it can't slide off, on a plate that bolts to the rig or a wall.
function qrParts(o) {
  const r = +o.qrD / 2 - 0.3, depth = Math.max(15, +o.qrDepth), T = 10, tilt = Math.max(0, Math.min(15, +o.tilt)) * Math.PI / 180;
  const Wp = Math.max(2 * r + 30, 70), Hp = Math.max(2 * r + 60, 110);
  const holes = [];
  if (o.hangOn === 'profile') {
    const bolt = boltOf(o);
    for (const y of [-(Hp / 2 - 12), Hp / 2 - 12]) {
      holes.push({ poly: circlePolygon(0, y, bolt.d / 2, 24), z0: 0, z1: T - 5 });
      holes.push({ poly: circlePolygon(0, y, bolt.head / 2 + 0.5, 28), z0: T - 5, z1: T });
    }
  } else {
    // Wall screws: countersunk from the front.
    for (const [x, y] of [[-(Wp / 2 - 10), -(Hp / 2 - 12)], [Wp / 2 - 10, -(Hp / 2 - 12)], [-(Wp / 2 - 10), Hp / 2 - 12], [Wp / 2 - 10, Hp / 2 - 12]]) {
      holes.push({ poly: circlePolygon(x, y, 2.4, 20), z0: 0, z1: T - 3 });
      for (let k = 0; k < 3; k++) holes.push({ poly: circlePolygon(x, y, 2.4 + (k + 1) * 1.1, 24), z0: T - 3 + k, z1: T - 2 + k });
    }
  }
  const m = layered(rr(-Wp / 2, -Hp / 2, Wp / 2, Hp / 2, 6), holes, T, o.brandMark !== false);
  // The peg: a flared root, the shaft, and a chamfered tip.
  const sh = Math.tan(tilt);
  m.append(frustum(r + 5, r, T - 0.01, T + 5, { shear: sh }).translate(0, -sh * 0, 0));
  m.append(frustum(r, r, T + 5, T + depth - 3, { shear: sh }));
  m.append(frustum(r, r - 2.5, T + depth - 3, T + depth, { shear: sh }));
  return {
    parts: [{ mesh: m, name: 'wheel-hanger', detail: 'Plate down, peg up. 5 walls, 40% infill', group: 'body' }],
    hardware: o.hangOn === 'profile' ? [[2, `${railOf(o).bolt.toUpperCase()} bolts and T-nuts for ${railOf(o).name}`]] : [[4, 'Countersunk wall screws and plugs rated for the wheel’s weight']],
  };
}

// A tablet or button-box gripper: a spine with the mounting pattern in the
// middle, and two jaws that slide along it to clamp the device's edges.
function tabletParts(o) {
  const devW = +o.devW, devT = +o.devT, clear = +o.bezelClear, len = devW + 50, T = 6, jawW = 40;
  const holes = [circlePolygon(0, 0, 2.8, 24)];
  for (const [x, y] of patternPoints(false)) {
    const b = Math.atan2(y, x), sw = (30 * Math.PI) / 180;
    holes.push(o.joint === 'fixed' ? circlePolygon(x, y, 2.25, 20) : arcSlot(0, 0, PIVOT, b - sw, b + sw, 4.5));
  }
  // Slots either side of the middle for the jaws' bolts.
  const s0 = 30, s1 = len / 2 - 8;
  if (s1 - s0 > 6) for (const sx of [-1, 1]) holes.push(rr(sx > 0 ? s0 : -s1, -2.75, sx > 0 ? s1 : -s0, 2.75, 2.7, 6));
  const spine = badgeSlab(o, rr(-len / 2, -26, len / 2, 26, 6), holes, T);
  // A jaw, lying on its side: the foot on the spine, and a hook over the device's edge.
  const jaw = () => {
    const m = new Mesh(), stand = T + devT + 1.5; // 1.5 mm for a strip of foam
    m.append(wallSlab('x', rect(0, 0, 22, jawW), [teardrop(11, jawW / 2, 2.75)], 0, 5));
    m.append(extrudePolygon(rect(22, 0, 27, stand + 3), [], 0, jawW));
    m.append(extrudePolygon(rect(Math.max(0, 22 - clear), stand, 27, stand + 3), [], 0, jawW));
    return m;
  };
  return {
    parts: [
      { mesh: spine, name: 'gripper-spine', detail: 'Flat', group: 'body' },
      { mesh: jaw().translate(-40, 40, 0), name: 'gripper-jaw-1', detail: 'On its side', group: 'body' },
      { mesh: jaw().translate(10, 40, 0), name: 'gripper-jaw-2', detail: 'On its side', group: 'body' },
    ],
    hardware: [[2, 'M5 × 16 bolts, washers and nyloc nuts (jaws)'], [1, 'Foam or rubber strip for the jaws']],
  };
}

// An angle bracket, printed on its side: leg A bolts to the rig (T-nut slots
// to slide for height, or the clamp pattern), leg B carries a device (its own
// hole pattern) or any VERTEX part (the pattern, with inserts). For side-mounted
// handbrakes and shifters, and screens turned to face the driver or pilot.
function bracketParts(o) {
  const La = Math.max(40, +o.legA), Lb = Math.max(40, +o.legB), W = Math.max(30, +o.bracketW), T = Math.max(5, +o.bracketT);
  const theta = (Math.max(45, Math.min(180, +o.angle)) * Math.PI) / 180;
  const m = new Mesh();
  const mid = W / 2;
  // Leg A along +x.
  const aHoles = [];
  if (o.legAFix === 'profile') {
    const b = boltOf(o), rows = railOf(o).rows.length > 1 && W >= 70 ? railOf(o).rows : [0];
    // Horizontal slots (flat tops bridge) for sliding up and down the profile.
    for (const dz of rows) aHoles.push(rect(La * 0.62 - 7 - b.d / 2, mid + dz - b.d / 2, La * 0.62 + 7 + b.d / 2, mid + dz + b.d / 2));
  } else {
    aHoles.push(teardrop(La * 0.55, mid, 2.8), teardrop(La * 0.55, mid - PIVOT, 2.25), teardrop(La * 0.55, mid + PIVOT, 2.25));
  }
  m.append(wallSlab('x', rect(0, 0, La, W), aHoles, 0, T));
  // Leg B along +x, then turned by the angle about the corner.
  const bHoles = [];
  const c = Lb * 0.6;
  if (o.legBFix === 'pattern') {
    bHoles.push(teardrop(c, mid, INS.m5 / 2), teardrop(c, mid - PIVOT, INS.m4 / 2), teardrop(c, mid + PIVOT, INS.m4 / 2));
  } else {
    const bd = (BOLTS[o.devBolt] || BOLTS.m6).d / 2, a = +o.devA / 2, bb = +o.devB / 2;
    const pts = +o.devHoles === 2 ? [[c - a, mid], [c + a, mid]] : [[c - a, mid - bb], [c + a, mid - bb], [c - a, mid + bb], [c + a, mid + bb]];
    for (const [x, z] of pts) if (x - bd > T + 2 && x + bd < Lb - 2 && z - bd > 2 && z + bd < W - 2) bHoles.push(teardrop(x, z, bd));
  }
  const legB = wallSlab('x', rect(0, 0, Lb, W), bHoles, -T, 0);
  m.append(rotZ(legB, theta));
  // A fillet in the inside corner.
  const ix = theta < Math.PI - 0.01 ? T / Math.tan(theta / 1) : 0;
  const dirB = [Math.cos(theta), Math.sin(theta)];
  const P = [Math.max(0, Math.abs(ix) < 60 ? (theta > Math.PI / 2 ? 0 : T / Math.tan(theta)) : 0), T];
  const f = Math.min(14, La / 4, Lb / 4);
  if (theta <= (150 * Math.PI) / 180) m.append(extrudePolygon([P, [P[0] + f, P[1]], [P[0] + dirB[0] * f, P[1] + dirB[1] * f]], [], 0, W));
  return {
    parts: [{ mesh: m, name: 'angle-bracket', detail: 'On its side. 5 walls, 40% infill', group: 'body' }],
    hardware: [
      ...(o.legAFix === 'profile' ? [[aHoles.length, `${railOf(o).bolt.toUpperCase()} bolts and T-nuts for ${railOf(o).name}`]] : [[1, 'M5 × 20 bolt (pivot)'], [2, 'M4 × 16 bolts (locks), into a VERTEX clamp']]),
      ...(o.legBFix === 'pattern' ? [[1, 'M5 heat-set insert'], [2, 'M4 heat-set inserts']] : [[bHoles.length, `${String(o.devBolt).toUpperCase()} bolts for your device`]]),
    ],
  };
}

// ---------- wheel stands ----------
// Parts for a wheel stand like the Next Level Racing Wheel Stand 2.0. Tube
// sizes differ between stands and years, and makers don't publish them, so
// every size here is one you measure on your own stand.
//
// spacer: a cup on the bottom of the sliding wheel-deck tube that fills the gap
//   to the frame tube it slides in, so the deck stops wobbling.
// foot: a cap for the end of a tube (print it in TPU for grip).
// deck: a plate that bolts through the wheel deck's slots (M8 on the NLR) and
//   carries the VERTEX mounting pattern, so any screen, display, button box
//   or cup holder mounts on the stand.
const tubeShape = (shape, size, r = 3) => (shape === 'round' ? circlePolygon(0, 0, size / 2, 64) : rr(-size / 2, -size / 2, size / 2, size / 2, Math.min(r, size / 4)));
function stadium(cx, cy, len, w, seg = 12) {
  const r = w / 2, pts = [];
  for (let i = 0; i <= seg; i++) { const a = -Math.PI / 2 + (Math.PI * i) / seg; pts.push([cx + len / 2 + r * Math.cos(a), cy + r * Math.sin(a)]); }
  for (let i = 0; i <= seg; i++) { const a = Math.PI / 2 + (Math.PI * i) / seg; pts.push([cx - len / 2 + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return pts;
}
function standParts(o) {
  const shape = o.tubeShape === 'round' ? 'round' : 'square';
  if (o.standPart === 'foot') {
    const t = Math.max(10, +o.footTube || 40), inner = t + 0.4, wall = 2.4, floor = 3, H = 14;
    const m = extrudePolygon(tubeShape(shape, inner + 2 * wall, 4), [], 0, floor);
    m.append(extrudePolygon(tubeShape(shape, inner + 2 * wall, 4), [tubeShape(shape, inner, 2)], floor, H));
    return { parts: [{ mesh: m, name: 'stand-foot', detail: 'Floor down. TPU grips the floor best', group: 'body' }], hardware: [], warnings: [] };
  }
  if (o.standPart === 'deck') {
    const bolt = BOLTS[o.deckBolt] || BOLTS.m8, span = Math.max(30, +o.deckSpan || 60), T = 14, slot = 16;
    const L = span + slot + bolt.head + 16, Wp = 70;
    const holes = [];
    // A slot for each deck bolt (so it lines up with the deck's own slots), counterbored for the head.
    for (const x of [-span / 2, span / 2]) {
      holes.push({ poly: stadium(x, 0, slot, bolt.d), z0: 0, z1: 5 });
      holes.push({ poly: stadium(x, 0, slot, bolt.head + 1), z0: 5, z1: T });
    }
    // The pattern goes in the middle: the M5 pivot and the two M4 locks.
    const pts = patternPoints(o.deckRun !== 'across');
    const clash = pts.some(([x]) => Math.abs(Math.abs(x) - span / 2) < slot / 2 + bolt.head / 2 + 4);
    if (!clash) {
      holes.push({ poly: circlePolygon(0, 0, INS.m5 / 2, 24), z0: T - 10, z1: T });
      for (const [x, y] of pts) holes.push({ poly: circlePolygon(x, y, INS.m4 / 2, 24), z0: T - 8, z1: T });
    }
    const m = layered(rr(-L / 2, -Wp / 2, L / 2, Wp / 2, 4), holes, T, o.brandMark !== false);
    return {
      parts: [{ mesh: m, name: 'stand-deck-plate', detail: 'Flat side down', group: 'mount' }],
      hardware: [[2, `${String(o.deckBolt || 'm8').toUpperCase()} × 30 bolts, washers and nuts, through the wheel deck`], ...(clash ? [] : [[1, 'M5 heat-set insert'], [2, 'M4 heat-set inserts']])],
      warnings: clash ? ['The deck bolts are too close together to fit the VERTEX mounting pattern between them. Set them further apart, or turn the pattern across the plate.'] : [],
    };
  }
  // The spacer: a cup that sits on the bottom end of the sliding tube.
  const inner = (+o.slideTube || 40) + 0.3, outer = (+o.fixedTube || 44) - 0.3, H = Math.max(10, +o.spacerH || 25), floor = 2;
  const wall = (outer - inner) / 2;
  const warnings = [];
  if (wall < 0.8) warnings.push(`That leaves a wall of only ${wall.toFixed(1)} mm between the tubes, too thin to print well. Check your measurements: there may be no room for a spacer.`);
  const m = extrudePolygon(tubeShape(shape, Math.max(outer, inner + 1.6)), [tubeShape(shape, inner - 8, 2)], 0, floor);
  m.append(extrudePolygon(tubeShape(shape, Math.max(outer, inner + 1.6)), [tubeShape(shape, inner, 2)], floor, floor + H));
  return {
    parts: [{ mesh: m, name: 'stand-tube-spacer', detail: 'Floor down. PETG or TPU', group: 'body' }],
    hardware: [],
    warnings,
    gap: wall,
  };
}

export function generateSimPart(options = {}) {
  const o = { ...SIM_DEFAULTS, ...options };
  // The round and square tube clamps were taken out; designs saved with one get the profile clamp.
  if (o.mount === 'tube' || o.mount === 'square') o.mount = 'profile';
  let r;
  if (o.part === 'screen') r = screenParts(o);
  else if (o.part === 'gear') r = displayParts(o);
  else if (o.part === 'leds') r = ledParts(o);
  else if (o.part === 'flag') r = flagParts(o);
  else if (o.part === 'buttons') r = buttonParts(o);
  else if (o.part === 'cup') r = cupParts(o);
  else if (o.part === 'stick') r = stickParts(o);
  else if (o.part === 'hub') r = hubParts(o);
  else if (o.part === 'brick') r = brickParts(o);
  else if (o.part === 'qr') r = qrParts(o);
  else if (o.part === 'tablet') r = tabletParts(o);
  else if (o.part === 'bracket') r = bracketParts(o);
  else if (o.part === 'stand') r = standParts(o);
  else throw new Error(`Unknown part: ${o.part}`);
  const parts = [...r.parts];
  const hardware = [...r.hardware];
  if (!['stick', 'hub', 'brick', 'qr', 'bracket', 'stand'].includes(o.part)) {
    // Lay the mount parts out beside the rest.
    const extra = mountParts(o);
    let x = 0;
    for (const p of r.parts) { const q = p.mesh.positions; for (let i = 0; i < q.length; i += 3) x = Math.max(x, q[i]); }
    for (const p of extra) {
      let minX = Infinity; const q = p.mesh.positions;
      for (let i = 0; i < q.length; i += 3) minX = Math.min(minX, q[i]);
      p.mesh.translate(x + 15 - minX, 0, 0);
      x = Math.max(...Array.from({ length: q.length / 3 }, (_, i) => q[i * 3]));
      parts.push({ ...p, group: 'mount' });
      hardware.push(...(p.hardware || []));
    }
    if (extra.length) hardware.push([1, 'M5 heat-set insert and M5 × 16 button-head bolt (the pivot)'], [2, 'M4 heat-set inserts and M4 × 12 button-head bolts (the locks)']);
  }
  return { ...r, parts, hardware, options: o };
}

export { rotateZ90 };
