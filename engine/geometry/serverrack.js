// Modular 10-inch server racks. A rack is a stack of boxes, each up to 5U so
// every part fits a 256 mm bed: two side panels (each with the front and back
// rails built in, drilled to the EIA-310 pattern), a bottom and a top plate
// screwed in between them, and pins on each top plate that locate the next
// box up. Gear goes in on shelves and blank panels with 10-inch rack ears.
//
// Ten-inch rack numbers: 254 mm across the ears, rail holes 236.5 mm apart
// (centre to centre), 222.25 mm clear between the rails, 1U = 44.45 mm with
// holes 6.35, 22.225 and 38.1 mm up each unit.
//
// Every part prints without supports: panels and plates lie flat; the rails
// stand up off the panel and their screw holes, which run sideways in the
// print, are teardrops pointing up.
import { Mesh } from './mesh.js';
import { extrudePolygon } from './polygon.js';
import { rr, sections } from './slabs.js';
import { textPolygons, textUnits } from './font.js';

// Text cut into a drawing (it reads from the side it's drawn on).
function letters(d, text, cx, cy, h) {
  const w = (textUnits(text) * h) / 6;
  for (const poly of textPolygons(text, -w / 2, -h / 2, h, Math.max(0.7, h * 0.16))) d.off(poly.map(([x, y]) => [cx + x, cy + y]));
}

export const SERVERRACK_DEFAULTS = {
  units: 5, // the first box
  units2: 0, // a second box on top (0 for none)
  units3: 0,
  depth: 200,
  railHole: 6.4, // M6 bolts with nuts behind; 5.0 to tap M6 straight into the plastic
  vents: 'hex', // hex | slots | holes | none
  shelves: 1, // 1U shelves
  shelfDepth: 150, // and the drawers' depth
  blanks: 1, // 1U vented blank panels
  patch: 0, // 1U keystone patch panels
  ports: 12, // keystone jacks on each
  keyW: 14.9, // the keystone hole: check one of your jacks
  keyH: 19.4,
  drawers: 0,
  drawerU: 2,
  handle: true, // carry handles on top
  style: 'frame', // frame: uprights, end frames, side panels | box: stackable boxes
  panels: true, // side panels (framed racks)
  badge: 'VERTEX', // raised on each side panel; empty for none
  fans: 0, // fan panels: blow air through the rack
  fanSize: 80, // 40 mm fans on 1U panels, 80 mm on 2U
  fanCount: 2, // fans across each panel
  cable: 0, // 1U cable pass-through panels
  device: 'none', // device panels: none | pi | tiny | nuc | macmini | switch8 | flexmini | zima | hdd35 | ssd25 | custom
  devices: 2, // how many across each panel
  devCount: 1, // how many device panels
  devW: 120, devH: 38, devD: 120, // a custom device: its front face and depth
};

// Devices a panel can hold: the window for its front (w × h, lifted off the
// shelf), its depth and whether it sits on a printed sled (a Pi, on standoffs).
// Sizes are the makers' published outside sizes plus 2 mm (the drives: their
// standard form factors, 101.6 and 69.85 mm wide, plus 1 mm).
export const RACK_DEVICES = {
  pi: { name: 'Raspberry Pi 4 / 5', w: 58, h: 20, d: 88, lift: 7, sled: true },
  tiny: { name: 'Lenovo ThinkCentre Tiny', w: 181, h: 37, d: 185, lift: 0 },
  nuc: { name: 'Intel NUC (slim)', w: 119, h: 39, d: 114, lift: 0 },
  macmini: { name: 'Mac mini (M4)', w: 129, h: 52, d: 129, lift: 0 },
  switch8: { name: '8-port desktop switch (TP-Link TL-SG108)', w: 160, h: 27, d: 103, lift: 0 },
  flexmini: { name: 'UniFi Flex Mini switch', w: 119, h: 23, d: 92, lift: 0 },
  zima: { name: 'ZimaBoard', w: 141, h: 37, d: 84, lift: 0 },
  hdd35: { name: '3.5" hard drive', w: 102.6, h: 28, d: 147, lift: 0 },
  ssd25: { name: '2.5" drive', w: 70.9, h: 16, d: 100, lift: 0 },
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
export const RACK10 = { U: 44.45, ears: 254, holes: 236.5, clear: 222.25, unitHoles: [6.35, 22.225, 38.1] };

export function serverRackPlan(options = {}) {
  const o = { ...SERVERRACK_DEFAULTS, ...options };
  const boxes = [Math.round(num(o.units, 1, 5, 5)), Math.round(num(o.units2, 0, 5, 0)), Math.round(num(o.units3, 0, 5, 0))].filter((u) => u > 0);
  const D = num(o.depth, 120, 250, 200), hole = num(o.railHole, 4, 9, 6.4);
  const t = 4, pt = 8, fe = 5; // panel, plate and rail thickness
  const hx = RACK10.holes / 2, ex = RACK10.clear / 2; // a rail hole's x, the rails' inner edge
  const inner = hx + (hx - ex); // the panels' inner faces: as far outside the hole as the rail edge is inside it
  return {
    o, boxes, D, hole, t, pt, fe, hx, ex, inner, outer: inner + t, ear: inner - ex, Wi: 2 * inner - 0.4,
    vents: o.vents === false || o.vents === 'false' || o.vents === 'none' ? false : ['slots', 'holes'].includes(o.vents) ? o.vents : 'hex',
    shelves: Math.round(num(o.shelves, 0, 4, 1)), shelfDepth: Math.min(num(o.shelfDepth, 60, 240, 150), D - 15), blanks: Math.round(num(o.blanks, 0, 4, 1)),
    patch: Math.round(num(o.patch, 0, 4, 0)), ports: Math.round(num(o.ports, 1, 12, 12)), keyW: num(o.keyW, 13, 17, 14.9), keyH: num(o.keyH, 15, 22, 19.4),
    device: RACK_DEVICES[o.device] || o.device === 'custom' ? o.device : 'none',
    devCount: Math.round(num(o.devCount, 0, 4, 1)), devices: Math.round(num(o.devices, 1, 4, 2)),
    dev: o.device === 'custom' ? { name: 'your device', w: num(o.devW, 20, 215, 120) + 2, h: num(o.devH, 10, 125, 38) + 2, d: num(o.devD, 30, 240, 120), lift: 0 } : RACK_DEVICES[o.device] || null,
    fans: Math.round(num(o.fans, 0, 4, 0)), fanSize: Number(o.fanSize) === 40 ? 40 : 80, fanCount: Math.round(num(o.fanCount, 1, 4, 2)), cable: Math.round(num(o.cable, 0, 4, 0)),
    drawers: Math.round(num(o.drawers, 0, 4, 0)), drawerU: Math.round(num(o.drawerU, 1, 3, 2)), handle: o.handle !== false && o.handle !== 'false',
    style: o.style === 'box' ? 'box' : 'frame', panels: o.panels !== false && o.panels !== 'false', badge: String(o.badge ?? 'VERTEX').toUpperCase().replace(/[^A-Z0-9 .\-]/g, '').slice(0, 14).trim(),
  };
}

const boxHeight = (p, u) => u * RACK10.U + 2 * p.pt;
// Vents in the style picked: a honeycomb, slots or round holes, whole ones only.
const vents = (p, d, x0, y0, x1, y1, R = 6, web = 3) => {
  if (p.vents === 'slots') {
    const sw = R, pitch = R + web * 1.6, rows = Math.max(1, Math.floor((y1 - y0 + web) / (Math.min(y1 - y0, 60) + web)));
    const rl = (y1 - y0 - (rows - 1) * web) / rows;
    for (let r = 0; r < rows; r++) for (let x = x0 + sw / 2 + ((x1 - x0 - sw) % pitch) / 2; x + sw / 2 <= x1; x += pitch) d.off(rr(x - sw / 2, y0 + r * (rl + web), x + sw / 2, y0 + r * (rl + web) + rl, sw / 2));
  } else if (p.vents === 'holes') {
    const pitch = 2 * R + web;
    for (let y = y0 + R; y + R <= y1; y += pitch) for (let x = x0 + R + ((x1 - x0 - 2 * R) % pitch) / 2; x + R <= x1; x += pitch) d.disc(x, y, R, 0);
  } else if (p.vents) hexes(d, x0, y0, x1, y1, R, web);
};
const hexes = (d, x0, y0, x1, y1, R = 6, web = 3) => {
  // A honeycomb of holes filling the box given, whole hexagons only.
  const w = Math.sqrt(3) * R, pitchX = w + web, pitchY = 1.5 * R + web * 0.87;
  for (let j = 0, y = y0 + R; y + R <= y1; j++, y += pitchY)
    for (let x = x0 + w / 2 + (j % 2 ? pitchX / 2 : 0); x + w / 2 <= x1; x += pitchX)
      d.off(Array.from({ length: 6 }, (_, k) => { const a = Math.PI / 6 + (k * Math.PI) / 3; return [x + R * Math.cos(a), y + R * Math.sin(a)]; }));
};
const screwYs = (D) => [D * 0.2, D * 0.5, D * 0.8];

// The frame parts depend on a handful of numbers and take most of the time:
// keep the last few, so changing the gear doesn't rebuild the rack.
const cache = new Map();
const memo = (key, make) => { if (!cache.has(key)) { if (cache.size > 24) cache.delete(cache.keys().next().value); cache.set(key, make()); } return cache.get(key); };

// A side panel as it prints: x along the depth, y up the box, z off the bed.
function sidePanel(p, u) {
  const { D, t, pt, fe, ear, hole } = p, H = boxHeight(p, u);
  const panel = sections([0, 0, D, H], [0, 0.4, t], (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    d.on(rr(f, f, D - f, H - f, 3));
    vents(p, d, fe + 14, pt + 12, D - fe - 14, H - pt - 12);
    for (const y of screwYs(D)) { d.disc(y, pt / 2, 1.7, 0); d.disc(y, H - pt / 2, 1.7, 0); } // into the plates' edges (M3)
  }, 0.15, 0.12);
  // The rails: standing up off the panel at both ends, drilled to the EIA pattern.
  const r = hole / 2, b = t + (p.hx - p.ex); // the holes sit as far in from the panel as the rail edge is past them
  const rail = sections([0, 0, H, t + ear], [0, fe], (c, d) => {
    d.on(rr(0, t - 0.5, H, t + ear, 1.5));
    for (let k = 0; k < u; k++) for (const h of RACK10.unitHoles) {
      const y = pt + k * RACK10.U + h;
      d.disc(y, b, r, 0);
      d.off([[y - r * Math.SQRT1_2, b + r * Math.SQRT1_2], [y + r * Math.SQRT1_2, b + r * Math.SQRT1_2], [y, b + r * Math.SQRT2]]); // teardrop: prints without a droop
    }
  }, 0.1, 0.08);
  const mesh = new Mesh(); mesh.append(panel);
  for (const x0 of [0, D - fe]) {
    const m = new Mesh(); m.append(rail);
    const q = m.positions;
    for (let i = 0; i < q.length; i += 3) { const a = q[i], bb = q[i + 1], c = q[i + 2]; q[i] = c + x0; q[i + 1] = a; q[i + 2] = bb; } // (a, b, c) → (c, a, b): a rotation
    mesh.append(m);
  }
  return mesh;
}

// A plate as it prints and as it sits: x across, y back from the front, z up.
function plate(p, kind) {
  const { D, pt, fe, Wi } = p, hw = Wi / 2, sq = 1.2; // the edge holes: 2.4 mm square, for M3 self-tapping screws
  const pins = [[-(hw - 22), 22], [hw - 22, 22], [-(hw - 22), D - 22], [hw - 22, D - 22]];
  const cuts = [0, 0.4, pt / 2 - sq, pt / 2 + sq, pt];
  if (kind === 'bottom') cuts.push(4.4);
  const m = sections([-hw, 0, hw, D], cuts, (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    d.on(rr(-hw + f, f, hw - f, D - f, 2));
    // Notches round the rails at the four corners.
    for (const s of [-1, 1]) { d.off(rr(s > 0 ? p.ex - 0.5 : -hw - 1, -1, s > 0 ? hw + 1 : -p.ex + 0.5, fe + 0.6)); d.off(rr(s > 0 ? p.ex - 0.5 : -hw - 1, D - fe - 0.6, s > 0 ? hw + 1 : -p.ex + 0.5, D + 1)); }
    vents(p, d, -hw + 30, 30, hw - 30, D - 30, 8, 3.5);
    for (const [x, y] of pins) d.disc(x, y, 7); // solid round the pins and their holes
    for (const y of screwYs(D)) d.on(rr(-hw, y - 8, -hw + 20, y + 8)), d.on(rr(hw - 20, y - 8, hw, y + 8)); // and round the edge screws
    if (Math.abs(z - pt / 2) < sq) for (const y of screwYs(D)) { d.off(rr(-hw - 1, y - sq, -hw + 14, y + sq)); d.off(rr(hw - 14, y - sq, hw + 1, y + sq)); }
    if (kind === 'bottom' && z < 4.4) for (const [x, y] of pins) d.disc(x, y, 3.3, 0); // the pins of the box below drop in here
    if (kind === 'cap' && p.handle) for (const s of [-1, 1]) { const x = s * (p.ex - 30 + 11 - 7); d.disc(x, D / 2, 4.5); d.disc(x, D / 2, 1.7, 0); } // bolts up into the handle's feet
  }, 0.15, 0.12);
  if (kind === 'top') for (const [x, y] of pins) {
    m.append(extrudePolygon(Array.from({ length: 24 }, (_, k) => [x + 3 * Math.cos((k * Math.PI) / 12), y + 3 * Math.sin((k * Math.PI) / 12)]), [], pt, pt + 3.4));
    m.append(extrudePolygon(Array.from({ length: 24 }, (_, k) => [x + 2.5 * Math.cos((k * Math.PI) / 12), y + 2.5 * Math.sin((k * Math.PI) / 12)]), [], pt + 3.4, pt + 4));
  }
  return m;
}

// A front panel with 10-inch ears, as it prints (face down): x across, y up
// the units, z back from the face. On it, by kind:
//   shelf  — a floor and two side lips standing up off its back;
//   blank  — hex vents;
//   patch  — a row of keystone jack holes, the panel thinned to 2 mm round each so the jacks clip in;
//   drawer — an opening and a sleeve (four walls standing off its back) the drawer slides in;
//   fan    — a guarded opening for each fan, with its four screw holes (40 mm fans: 32 mm apart, M3; 80 mm: 71.5 mm, fan screws);
//   cable  — a long rounded slot for cables to pass through, with tie slots above and below it.
function frontPanel(p, u, kind) {
  const h = u * RACK10.U - 0.8, hw = RACK10.ears / 2, ft = 4;
  const ks = keystones(p), kw = p.keyW, kh = p.keyH;
  const dw = p.ex - 1.5, dh = h - 2; // the drawer sleeve, outside
  const m = sections([-hw, 0, hw, h], kind === 'patch' ? [0, 0.4, 2, ft] : [0, 0.4, ft], (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    d.on(rr(-hw + f, f, hw - f, h - f, 2));
    for (let k = 0; k < u; k++) for (const hy of [RACK10.unitHoles[0], RACK10.unitHoles[2]]) for (const s of [-1, 1]) {
      const y = k * RACK10.U + hy - 0.4;
      d.off(rr(s * p.hx - 3.3, y - 4, s * p.hx + 3.3, y + 4, 3.3)); // slotted, so a panel lines up with any print
    }
    if (kind === 'blank') vents(p, d, -p.ex + 10, 5, p.ex - 10, h - 5, 5, 2.6);
    if (kind === 'shelf') d.off(rr(-30, h - 12, 30, h - 4, 4)); // a finger pull
    if (kind === 'patch') for (const x of ks) {
      d.off(rr(x - kw / 2, h / 2 - kh / 2, x + kw / 2, h / 2 + kh / 2)); // the jack's hole
      if (z > 2) d.off(rr(x - kw / 2 - 2.5, h / 2 - kh / 2 - 3, x + kw / 2 + 2.5, h / 2 + kh / 2 + 3, 1)); // thinned behind, so its latch reaches
    }
    if (kind === 'drawer') d.off(rr(-dw + 2, 3, dw - 2, dh - 1, 2)); // the opening
    if (kind === 'fan') for (const x of fanXs(p)) {
      const R = p.fanSize / 2 - 2, y = h / 2, sp = p.fanSize === 40 ? 16 : 35.75, sr = p.fanSize === 40 ? 1.7 : 2.25;
      d.disc(x, y, R, 0);
      for (let r = R - 5; r > 7; r -= 7) { d.disc(x, y, r + 0.9); d.disc(x, y, r - 0.9, 0); } // the guard: rings…
      for (const a of [0, 60, 120]) { const c = Math.cos((a * Math.PI) / 180), s = Math.sin((a * Math.PI) / 180), w = 0.9; d.on([[x - R * c - w * s, y - R * s + w * c], [x + R * c - w * s, y + R * s + w * c], [x + R * c + w * s, y + R * s - w * c], [x - R * c + w * s, y - R * s - w * c]]); } // …and spokes
      d.disc(x, y, 7);
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) d.disc(x + sx * sp, y + sy * sp, sr, 0);
    }
    if (kind === 'cable') {
      const sw = Math.min(2 * p.ex - 30, 190), sh = Math.min(16, h - 18);
      d.off(rr(-sw / 2, h / 2 - sh / 2, sw / 2, h / 2 + sh / 2, sh / 2));
      for (let x = -sw / 2 + 15; x <= sw / 2 - 15 + 0.01; x += (sw - 30) / 4) for (const y of [h / 2 - sh / 2 - 5, h / 2 + sh / 2 + 5]) d.off(rr(x - 2.5, y - 1.2, x + 2.5, y + 1.2, 1.2));
    }
    if (kind === 'device') for (const x of devXs(p)) d.off(rr(x - p.dev.w / 2, 3 + p.dev.lift, x + p.dev.w / 2, Math.min(h - 2, 3 + p.dev.lift + p.dev.h), 2)); // a window for each device's front
  }, 0.12, 0.1);
  if (kind === 'device') m.append(deviceFloor(p, h, ft));
  if (kind === 'shelf') {
    const sw = p.ex - 1, st = 3, lip = Math.min(15, h - 4);
    m.append(extrudePolygon([[-sw, 0], [sw, 0], [sw, st], [-sw, st]], [], ft - 0.01, ft + p.shelfDepth));
    for (const s of [-1, 1]) { const x0 = s > 0 ? sw - st : -sw, x1 = x0 + st; m.append(extrudePolygon([[x0, st - 0.01], [x1, st - 0.01], [x1, lip], [x0, lip]], [], ft - 0.01, ft + p.shelfDepth)); }
  }
  if (kind === 'drawer') {
    const w = 2, ring = [[-dw, 1], [dw, 1], [dw, dh], [-dw, dh]], hole = [[-dw + w, 1 + w], [-dw + w, dh - w], [dw - w, dh - w], [dw - w, 1 + w]];
    m.append(extrudePolygon(ring, [hole], ft - 0.01, ft + p.shelfDepth)); // the sleeve; open at the back
  }
  return m;
}
// Fan panels: how many fans fit across, and where.
function fanXs(p) {
  const pitch = p.fanSize + 6, n = Math.max(1, Math.min(p.fanCount, Math.floor((2 * p.ex - 10) / pitch)));
  return Array.from({ length: n }, (_, k) => (k - (n - 1) / 2) * pitch);
}
// Device panels: how many fit across, and where.
export const devUnits = (p) => Math.max(1, Math.ceil((3 + p.dev.lift + p.dev.h + 3) / RACK10.U));
function devXs(p) {
  const pitch = p.dev.w + (p.dev.sled ? 8 : 5), n = Math.max(1, Math.min(p.devices, Math.floor((2 * p.ex - 6) / pitch)));
  return Array.from({ length: n }, (_, k) => (k - (n - 1) / 2) * pitch);
}
// A device panel's floor, standing off the back of the face (as it prints):
// drawn flat in (x across, depth) and turned up, so its screw holes (for a Pi's
// sled) are teardrops pointing up. Walls between the devices stand along it.
function deviceFloor(p, h, ft) {
  const sw = p.ex - 1, L = Math.min(p.dev.d + 8, p.D - 15), st = 3, wall = Math.min(14, h - 4), xs = devXs(p);
  const floor = sections([-sw, 0, sw, L], [0, st], (c, d) => {
    d.on(rr(-sw, 0, sw, L));
    if (p.dev.sled) for (const x of xs) for (const s of [-1, 1]) for (const y of [20, 70]) {
      const hx = x + s * (p.dev.w / 2 + 1), r = 1.4;
      d.disc(hx, y, r, 0); d.off([[hx - r * Math.SQRT1_2, y + r * Math.SQRT1_2], [hx + r * Math.SQRT1_2, y + r * Math.SQRT1_2], [hx, y + r * Math.SQRT2]]);
    }
  }, 0.12, 0.1);
  const m = new Mesh();
  const f = new Mesh(); f.append(floor); const q = f.positions;
  for (let k = 0; k < q.length; k += 3) { const a = q[k], b = q[k + 1], c = q[k + 2]; q[k] = a; q[k + 1] = st - c; q[k + 2] = b + ft - 0.01; } // (a, b, c) → (a, st − c, b): a rotation
  m.append(f);
  // Walls either side of each device: they keep it straight as it slides in.
  for (const x of xs) for (const s of [-1, 1]) {
    const x0 = x + s * (p.dev.w / 2 + (p.dev.sled ? 4 : 1)) - (s < 0 ? 2 : 0);
    m.append(extrudePolygon([[x0, st - 0.01], [x0 + 2, st - 0.01], [x0 + 2, wall], [x0, wall]], [], ft - 0.01, ft + L));
  }
  return m;
}
// A Raspberry Pi sled, flat on the bed: a plate with four standoffs on the
// Pi's 58 × 49 mm holes (M2.5, tapped into the plastic) and two ears that
// screw down to the panel's floor. Its long edge runs back from the face.
function piSled() {
  const W = 58 + 2 + 6, L = 90, t = 2.5, sx = [-24.5, 24.5], sy = [8, 66]; // board 56 × 85: holes 3.5 in, 58 apart along it, 49 across
  const m = sections([-W / 2 - 1, 0, W / 2 + 1, L], [0, 0.4, t], (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    d.on(rr(-W / 2 + f, f, W / 2 - f, L - f, 3));
    for (const x of sx) for (const y of sy) d.disc(x, y, 1.1, 0);
    d.off(rr(-15, 20, 15, 55, 4)); // light, and room for air
  }, 0.12, 0.1);
  for (const x of sx) for (const y of sy) {
    const ring = (r) => Array.from({ length: 24 }, (_, k) => [x + r * Math.cos((k * Math.PI) / 12), y + r * Math.sin((k * Math.PI) / 12)]);
    m.append(extrudePolygon(ring(3), [ring(1.1).reverse()], t - 0.01, t + 5));
  }
  return m;
}

// Where the keystone holes go across a patch panel: centred, as many as asked that fit.
function keystones(p) {
  const pitch = p.keyW + 4, n = Math.min(p.ports, Math.floor((2 * p.ex - 16) / pitch));
  return Array.from({ length: n }, (_, k) => (k - (n - 1) / 2) * pitch);
}
// The drawer for a drawer unit, as it prints: upright, its face at y = 0.
function drawer(p, u) {
  const h = u * RACK10.U - 0.8, dw = p.ex - 1.5, w = 2;
  const W = 2 * (dw - w) - 1, H = h - 2 - 1 - 2 * w - 1.5, L = p.shelfDepth - 4, t = 1.6, fl = 1.6;
  const m = sections([-W / 2 - 4, -4, W / 2 + 4, L], [0, 0.4, fl, H], (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    d.on(rr(-W / 2 + f, f, W / 2 - f, L - f, 3));
    if (z > fl) d.off(rr(-W / 2 + t, t, W / 2 - t, L - t, 2));
    d.on(rr(-W / 2 - 3 + f, -4, W / 2 + 3 - f, 0.2)); // the face, a little wider than the opening
    if (z > H - 14) d.off(rr(-25, -5, 25, 1, 0)); // a finger pull
  }, 0.12, 0.1);
  return m;
}
// A carry handle for the top plate, as it prints (on its side): x across, y up, z through.
function handle(p, len = 2 * (p.ex - 30)) {
  const span = len, hgt = 45, bar = 14, foot = 22, T = 14, R = 3.4 / 2;
  const m = sections([-span / 2 - foot, 0, span / 2 + foot, hgt], [0, 0.4, T - 0.4, T], (z, d) => {
    const f = z < 0.4 || z > T - 0.4 ? 0.6 : 0;
    d.on(rr(-span / 2 - foot + f, f, span / 2 + foot - f, hgt - f, 10)); // the whole arch
    d.off(rr(-span / 2 + bar, -1, span / 2 - bar, hgt - bar, 10)); // the hand hole
    for (const s of [-1, 1]) { const x = s * (span / 2 + foot / 2 - bar / 2); d.off(rr(x - R, -1, x + R, 12)); } // an M3 bolt up into each foot
  }, 0.15, 0.12);
  return { mesh: m, span, foot, bar, T };
}

// ---------------------------------------------------------------------------
// The framed rack (the default): built like a real rack from separate pieces,
// in the VERTEX look. Four identical rail uprights (an L: the rail face with
// the EIA holes, and a side flange), stacked sections joined by splice plates
// so the units run on unbroken, a mint end frame top and bottom, removable
// side panels with a badge, and carry handles. Every piece fits a 256 mm bed.
const FR = { rt: 5, fl: 24, ff: 4, ft: 8, pt: 3, hy: 14, bk: 20 }; // rail face, flange depth and thickness, frame, panel; the flange holes' line; bracket height
const handleSpan = (p) => Math.min(p.D - 32, 256 - 44 - 2); // the handle's hand hole, so the whole handle fits the bed
const frameXo = (p) => p.hx + 9.65; // the uprights' outside face: 127.9 mm out, so an end frame is 255.8 mm wide
const flangeXs = (L) => [...new Set([10, L - 10, ...(L >= 80 ? [30, L - 30] : []), ...(L >= 140 || L < 80 ? [L / 2] : [])])].sort((a, b) => a - b);
const tear = (d, x, y, r) => { d.disc(x, y, r, 0); d.off([[x - r * Math.SQRT1_2, y + r * Math.SQRT1_2], [x + r * Math.SQRT1_2, y + r * Math.SQRT1_2], [x, y + r * Math.SQRT2]]); };
const turn = (mesh, f) => { const m = new Mesh(); m.append(mesh); const q = m.positions; for (let i = 0; i < q.length; i += 3) { const [a, b, c] = f(q[i], q[i + 1], q[i + 2]); q[i] = a; q[i + 1] = b; q[i + 2] = c; } return m; };

// An upright as it prints, rail face down: x along it (0..L), y across the
// face from the rail's inner edge, z off the bed (the flange stands up). The
// flange is far enough out that an M6 nut behind each rail hole clears it.
function upright(p, u) {
  const L = u * RACK10.U, w = frameXo(p) - p.ex, { rt, fl, ff, hy } = FR, m = new Mesh();
  m.append(sections([0, 0, L, w], [0, 0.4, rt], (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    d.on(rr(0, f, L, w - f, 1));
    for (let k = 0; k < u; k++) for (const h of RACK10.unitHoles) d.disc(k * RACK10.U + h, p.hx - p.ex, p.hole / 2, 0);
  }, 0.1, 0.06));
  // The flange, drawn in (x, z) and stood up at the face's outer edge; its holes are teardrops.
  const fl2 = sections([0, 0, L, fl], [0, ff], (c, d) => {
    d.on(rr(0, 0, L, fl, 1));
    for (const x of flangeXs(L)) tear(d, x, hy, 1.7);
  }, 0.1, 0.06);
  m.append(turn(fl2, (a, b, c) => [a, w - c, b])); // (a, b, c) → (a, w − c, b): a rotation
  return m;
}

// An end frame, flat: a ring with a bracket standing in each corner that
// bolts through the upright's flange (its end hole). The top frame is the
// same part turned over; its outside carries MINT MOTIVE across the front.
function endFrame(p, top) {
  const xo = frameXo(p), { ft, ff, bk, hy } = FR, D = p.D, band = 24, x0 = xo - ff - 4, x1 = xo - ff - 0.2;
  const hh = []; if (top && p.handle) for (const sx of [-1, 1]) for (const y of [D / 2 - handleSpan(p) / 2 - 4, D / 2 + handleSpan(p) / 2 + 4]) hh.push([sx * (xo - 12), y]); // under the handle's feet
  const m = sections([-xo, 0, xo, D], top ? [0, 0.6, ft] : [0, 0.4, ft], (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    d.on(rr(-xo + f, f, xo - f, D - f, 6));
    d.off(rr(-xo + band, band, xo - band, D - band, 8)); // open in the middle: air, and cables
    for (const [x, y] of hh) d.disc(x, y, 1.7, 0);
    // On the bed face, which is the outside once it's turned over: mirrored here so it reads from above.
    if (top && z < 0.6) { const h = 8, w = (textUnits('MINT MOTIVE') * h) / 6; for (const poly of textPolygons('MINT MOTIVE', -w / 2, -h / 2, h, 1.3)) d.off(poly.map(([x, y]) => [x, D - 12 - y])); }
  }, 0.15, 0.1);
  // The corner brackets, drawn in (y, height) and stood at x0..x1, mirrored for the far side.
  const br = sections([0, 0, D, bk], [x0, x1], (x, d) => {
    for (const [y0, y1] of [[11, band], [D - band, D - 11]]) { d.on(rr(y0, 0, y1, bk, 1)); tear(d, y0 < D / 2 ? hy : D - hy, 10, 1.7); }
  }, 0.1, 0.06);
  m.append(turn(br, (a, b, c) => [c, a, ft - 0.01 + b])); // (a, b, c) → (c, a, b): a rotation
  m.append(turn(br, (a, b, c) => [-c, D - a, ft - 0.01 + b])); // and half a turn about z
  return m;
}

// A side panel, flat, its outside up: x along the depth, y up the section.
// Its corners are cut back round the end frames' brackets.
function sidePanel2(p, u) {
  const L = u * RACK10.U, Dp = p.D - 10.4, { pt, bk } = FR, inset = FR.hy - 5.2, nb = 24 - 5.2 + 0.4;
  const bw = Math.min(150, Dp - 50), bh = Math.min(24, L * 0.3), by = L - 24 - bh / 2, badge = p.badge && L >= 80;
  return sections([0, 0, Dp, L], badge ? [0, 0.4, pt, pt + 1.2] : [0, 0.4, pt], (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    if (z > pt) { d.on(rr(Dp / 2 - bw / 2, by - bh / 2, Dp / 2 + bw / 2, by + bh / 2, 4)); letters(d, p.badge, Dp / 2, by, Math.min(10, bh * 0.45)); return; }
    d.on(rr(f, f, Dp - f, L - f, 2));
    for (const [cx, cy] of [[0, 0], [Dp, 0], [0, L], [Dp, L]]) d.off(rr(cx - nb, cy - bk - 0.4, cx + nb, cy + bk + 0.4)); // round the brackets
    vents(p, d, 26, bk + 6, Dp - 26, badge ? by - bh / 2 - 6 : L - bk - 6, 6, 3);
    for (const x of [inset, Dp - inset]) for (const y of flangeXs(L)) if (y > bk + 2 && y < L - bk - 2) d.disc(x, y, 1.7, 0);
  }, 0.15, 0.1);
}

// A splice plate across a joint, flat: holes on the flanges' line.
function splice(p, s) {
  return sections([0, 0, 20, 2 * s], [0, 0.4, 3], (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    d.on(rr(f, f, 20 - f, 2 * s - f, 3));
    for (const y of s > 25 ? [s - 30, s - 10, s + 10, s + 30] : [s - 10, s + 10]) d.disc(10, y, 1.7, 0);
  }, 0.1, 0.06);
}

function framedRack(p, place, roles) {
  const xo = frameXo(p), { ft, fl } = FR, D = p.D, total = p.boxes.reduce((a, u) => a + u, 0);
  const k = `${D}|${p.hole}|${p.vents}|${p.badge}`;
  const bottom = memo(`fb|${k}`, () => endFrame(p, false)), top = memo(`ft|${k}|${p.handle}`, () => endFrame(p, true));
  place(bottom, 'end-frame-bottom'); place(top, 'end-frame-top');
  const topUse = turn(top, (x, y, zz) => [x, p.D - y, -zz]); // turned over: brackets down, MINT MOTIVE up
  roles.accent.append(bottom);
  let z = ft;
  const slots = [];
  p.boxes.forEach((u, i) => {
    const L = u * RACK10.U, up = memo(`up|${k}|${u}`, () => upright(p, u)), panel = p.panels ? memo(`sp|${k}|${u}`, () => sidePanel2(p, u)) : null;
    const tag = p.boxes.length > 1 ? `-s${i + 1}` : '';
    for (let j = 0; j < 4; j++) place(up, `upright${tag}-${j + 1}`);
    if (panel) { place(panel, `side-panel${tag}-a`); place(panel, `side-panel${tag}-b`); }
    // Uprights: front right, back left, front left, back right (all the same part, turned).
    roles.rail.append(turn(up, (x, y, zz) => [p.ex + y, zz, z + x]));
    roles.rail.append(turn(up, (x, y, zz) => [-(p.ex + y), D - zz, z + x]));
    roles.rail.append(turn(up, (x, y, zz) => [-(p.ex + y), zz, z + L - x]));
    roles.rail.append(turn(up, (x, y, zz) => [p.ex + y, D - zz, z + L - x]));
    if (panel) {
      roles.panel.append(turn(panel, (x, y, zz) => [xo - FR.ff - FR.pt + zz, 5.2 + x, z + y]));
      roles.panel.append(turn(panel, (x, y, zz) => [-(xo - FR.ff - FR.pt + zz), D - 5.2 - x, z + y]));
    }
    slots.push([z, u]);
    z += L;
    if (i < p.boxes.length - 1) {
      const s = Math.min(L, p.boxes[i + 1] * RACK10.U) >= 80 ? 40 : 20, sp = memo(`spl|${s}`, () => splice(p, s));
      for (let j = 0; j < 4; j++) place(sp, `splice-${i + 1}-${j + 1}`);
      for (const [sx, front] of [[1, true], [-1, true], [1, false], [-1, false]]) roles.accent.append(turn(sp, (x, y, zz) => [sx * (xo + zz), sx > 0 ? (front ? 4 + x : D - 24 + x) : (front ? 24 - x : D - 4 - x), z - s + y])); // the far side half-turned, so none is mirrored
    }
  });
  roles.accent.append(new Mesh().append(topUse).translate(0, 0, z + ft));
  if (p.handle) {
    const hd = handle(p, handleSpan(p));
    place(hd.mesh, 'handle-a'); place(hd.mesh, 'handle-b');
    for (const sx of [-1, 1]) roles.accent.append(turn(hd.mesh, (x, y, zz) => [sx * (xo - 12) - hd.T / 2 + zz, D / 2 + x, z + ft + y]));
  }
  const holes = flangeXs(RACK10.U * Math.max(...p.boxes)).length;
  return { slots, height: z + ft, screws: `M3 × 12 bolts and nuts through the flanges into the end frames' brackets (8), the side panels (${Math.max(0, holes - 2)} a side per section)${p.boxes.length > 1 ? ' and the splice plates' : ''}` };
}

export function generateServerRack(options = {}) {
  const p = serverRackPlan(options);
  const parts = [], preview = new Mesh();
  let z = 0, lay = 0, framed = null;
  const place = (mesh, name) => { const m = new Mesh(); m.append(mesh); const b = m.bounds(); m.translate(lay - b.min[0], -b.min[1], 0); lay += b.size[0] + 10; parts.push({ mesh: m, name }); };
  const roles = { accent: new Mesh(), rail: new Mesh(), panel: new Mesh(), gear: new Mesh() };
  if (p.style === 'frame') { framed = framedRack(p, place, roles); z = framed.height; } else p.boxes.forEach((u, i) => {
    const H = boxHeight(p, u), k = `${p.D}|${p.hole}|${p.vents}`, topKind = i === p.boxes.length - 1 ? 'cap' : 'top';
    const side = memo(`side|${k}|${u}`, () => sidePanel(p, u)), bottom = memo(`bottom|${k}`, () => plate(p, 'bottom')), top = memo(`${topKind}|${k}|${p.handle}`, () => plate(p, topKind));
    const tag = p.boxes.length > 1 ? `-box${i + 1}` : '';
    place(side, `side-panel${tag}-a`); place(side, `side-panel${tag}-b`); place(bottom, `bottom-plate${tag}`); place(top, `top-plate${tag}`);
    // Put together: panels either side, plates between them.
    for (const s of [-1, 1]) {
      const m = new Mesh(); m.append(side); const q = m.positions;
      // Left (s −1): (x, y, z) → (−outer + z, x, y); right: (outer − z, D − x, y). Both rotations.
      for (let k = 0; k < q.length; k += 3) { const x = q[k], y = q[k + 1], zz = q[k + 2]; q[k] = s < 0 ? -p.outer + zz : p.outer - zz; q[k + 1] = s < 0 ? x : p.D - x; q[k + 2] = y + z; }
      preview.append(m);
    }
    preview.append(new Mesh().append(bottom).translate(0, 0, z));
    preview.append(new Mesh().append(top).translate(0, 0, z + H - p.pt));
    z += H;
  });
  // Gear, filled into the boxes from the bottom: shelves, drawers, patch panels, blanks.
  const kinds = [['shelf', 1, p.shelves], ...(p.dev ? [['device', devUnits(p), p.devCount]] : []), ['drawer', p.drawerU, p.drawers], ['patch', 1, p.patch], ['cable', 1, p.cable], ['fan', p.fanSize === 40 ? 1 : 2, p.fans], ['blank', 1, p.blanks]];
  const fill = [];
  for (const [kind, u, n] of kinds) {
    if (!n) continue;
    const panel = frontPanel(p, u, kind), dr = kind === 'drawer' ? drawer(p, u) : null;
    for (let i = 0; i < n; i++) {
      place(panel, `${kind === 'drawer' ? 'drawer-unit' : kind === 'device' ? `${p.device}-panel` : kind}-${u}u-${i + 1}`);
      if (dr) place(dr, `drawer-${u}u-${i + 1}`);
      if (kind === 'device' && p.dev.sled) devXs(p).forEach((_, j) => place(memo('sled', piSled), `pi-sled-${i + 1}-${j + 1}`));
      fill.push([panel, u, dr]);
    }
  }
  const slots = []; let zb = 0;
  if (framed) slots.push([framed.slots[0][0], p.boxes.reduce((a, u) => a + u, 0)]); // one run of units: the splices keep the spacing
  else for (const u of p.boxes) { slots.push([zb + p.pt, u]); zb += boxHeight(p, u); }
  const used = slots.map(() => 0);
  for (const [panel, u, dr] of fill) {
    const bi = slots.findIndex(([, cap], i) => cap - used[i] >= u);
    if (bi < 0) continue;
    const z0 = slots[bi][0] + used[bi] * RACK10.U + 0.4; used[bi] += u;
    const c = new Mesh(); c.append(panel); const q = c.positions;
    // Face down → in the rack: (x, y, z) → (−x, z − 4, y + the unit's bottom + 0.4), a rotation; the face sits in front of the rails.
    for (let k = 0; k < q.length; k += 3) { const x = q[k], y = q[k + 1], zz = q[k + 2]; q[k] = -x; q[k + 1] = zz - 4; q[k + 2] = y + z0; }
    (framed ? roles.gear : preview).append(c);
    if (dr) (framed ? roles.gear : preview).append(new Mesh().append(dr).translate(0, -4 + 0.2, z0 + 1 + 2 + 0.5)); // in its sleeve, pushed home
  }
  if (p.handle && !framed) {
    const hd = handle(p);
    place(hd.mesh, 'handle');
    const c = new Mesh(); c.append(hd.mesh); const q = c.positions;
    // On its side → on top: (x, y, z) → (x, z − T/2 + D/2, y + the top), a mirror-free turn: (x, y, z) → (x, −z, y) then moved.
    for (let k = 0; k < q.length; k += 3) { const x = q[k], y = q[k + 1], zz = q[k + 2]; q[k] = x; q[k + 1] = p.D / 2 + hd.T / 2 - zz; q[k + 2] = y + z; }
    preview.append(c);
  }
  const total = p.boxes.reduce((a, u) => a + u, 0);
  const gear = [p.dev && p.devCount ? `${p.devCount} panel${p.devCount > 1 ? 's' : ''} for ${devXs(p).length} × ${p.dev.name} (${devUnits(p)}U)` : '', p.shelves ? `${p.shelves} shel${p.shelves > 1 ? 'ves' : 'f'}` : '', p.drawers ? `${p.drawers} ${p.drawerU}U drawer${p.drawers > 1 ? 's' : ''}` : '', p.patch ? `${p.patch} patch panel${p.patch > 1 ? 's' : ''} (${keystones(p).length} jacks each)` : '', p.cable ? `${p.cable} cable panel${p.cable > 1 ? 's' : ''}` : '', p.fans ? `${p.fans} fan panel${p.fans > 1 ? 's' : ''} (${fanXs(p).length} × ${p.fanSize} mm fans each)` : '', p.blanks ? `${p.blanks} blank${p.blanks > 1 ? 's' : ''}` : '', p.handle && !framed ? 'a handle (2 M3 × 16)' : ''].filter(Boolean).join(', ');
  const room = p.boxes.reduce((a, u) => a + u, 0), want = p.shelves + p.blanks + p.patch + p.drawers * p.drawerU + (p.dev ? p.devCount * devUnits(p) : 0);
  const notes = [
    `10-inch rack, ${total}U${p.boxes.length > 1 ? ` (${p.boxes.map((u) => `${u}U`).join(' + ')})` : ''}: ${p.D} × ${Math.round(2 * (framed ? frameXo(p) : p.outer))} × ${Math.round(z)} mm. Rail holes ${p.hole} mm (${p.hole >= 6 ? 'M6 bolts and nuts' : 'tap M6 in'}).`,
    framed
      ? `${p.boxes.length * 4} uprights${p.boxes.length > 1 ? `, ${(p.boxes.length - 1) * 4} splice plates` : ''}, 2 end frames${p.panels ? `, ${p.boxes.length * 2} side panels` : ''}${p.handle ? ', 2 handles' : ''}${gear ? `; plus ${gear}` : ''}. M3 bolts and nuts. All flat, no supports, 256 mm bed.`
      : `Per box: 2 side panels, 2 plates, 12 M3 × 12 self-tapping screws${gear ? `; plus ${gear}` : ''}. All flat, no supports, 256 mm bed.`,
    ...(want > room ? [`That’s ${want}U of gear for ${room}U of rack: the preview shows what fits.`] : []),
  ];
  // The framed rack in its colours: mint frames, splices and handles; charcoal rails and gear; eggshell panels.
  const accentParts = /^(end-frame|splice|handle)/;
  for (const q of parts) q.role = accentParts.test(q.name) ? 'accent' : /^side-panel/.test(q.name) && framed ? 'panel' : 'body';
  let assembly = null;
  if (framed) {
    assembly = Object.entries(roles).filter(([, m]) => m.indices.length).map(([role, mesh]) => ({ role, mesh }));
    for (const a of assembly) preview.append(a.mesh);
  }
  return { parts, notes, plan: p, preview, assembly };
}
