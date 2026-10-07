// The vents engine (Epic 1, phase 1B): a pattern generator for any face a slab drawing makes.
// `ventPanel(p, d, box, R, web)` cuts the openings of the pattern p.vents into the box with the
// slab drawing tools d (off, disc), in the areas, size, bars, fade and density the settings ask for.
//
// The first nine patterns are the rack's originals, moved here unchanged (the same openings,
// point for point: test/vents.test.js checks the meshes against the old ones). Added in 0.253.0:
//   honeycomb  thin-walled hexagons, sized by how many cells fit up the face
//   angled     long slots leaning 15° to 60°, mirrored into chevrons if asked
//   arcade     round holes in rings, or a speaker-cone burst of slots, round a point you pick
//   gradient   holes that grow from one side of the face to the other
//   voronoi    organic cells from a seed, a bar between each
// Density (p.ventOpen, 10–70 % open) sets the bars to give that much open area, unless a bar
// width is set; a bar is never under 0.8 mm (two lines of a 0.4 mm nozzle).
// Added in 0.254.0 (phase 1B part 2):
//   louvre     slats whose openings step up through the panel at 45° (no supports; the slab
//              drawing gives the height as d.z, and the caller adds thin slabs for a smooth slope)
//   custom     your own shape (a drawing's outlines, 0–1 box) repeated across the face
//   rotation   any pattern turned 0–90° (openings cut back at the area's edge, slivers dropped)
//   fade       front to back as before, or back to front, up, down or out from the middle,
//              by any amount; and each face (sides, top, back, blanks) can have its own pattern
import { rr, draftScale } from './slabs.js';

export const VENT_STYLES = ['squares', 'mesh', 'hex', 'holes', 'diamond', 'slots', 'grille', 'wave', 'bubbles', 'honeycomb', 'angled', 'arcade', 'gradient', 'voronoi', 'louvre', 'custom'];
export const VENT_FACES = ['side', 'top', 'back', 'blank'];
export const MIN_BAR = 0.8;

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
/** The new patterns' settings, cleaned (the originals' are cleaned where they always were). */
export function ventOptions(o = {}) {
  return {
    ventAngle: num(o.ventAngle, 15, 60, 30),
    ventMirror: o.ventMirror === true || o.ventMirror === 'true',
    ventCells: Math.round(num(o.ventCells, 0, 40, 0)),
    ventArcade: o.ventArcade === 'burst' ? 'burst' : 'rings',
    ventCx: num(o.ventCx, 0, 1, 0.5), ventCy: num(o.ventCy, 0, 1, 0.5),
    ventDir: ['back', 'up', 'down'].includes(o.ventDir) ? o.ventDir : 'front',
    ventSeed: Math.round(num(o.ventSeed, 1, 9999, 1)),
    ventOpen: Math.round(num(o.ventOpen, 0, 70, 0)) >= 10 ? Math.round(num(o.ventOpen, 10, 70, 0)) : 0,
    ventRotate: Math.round(num(o.ventRotate, 0, 90, 0)),
    ventFadeDir: ['front', 'up', 'down', 'radial'].includes(o.ventFadeDir) ? o.ventFadeDir : 'back',
    ventFadeAmt: Math.round(num(o.ventFadeAmt, 0, 100, 60)),
    ventShape: Array.isArray(o.ventShape) && o.ventShape.length ? o.ventShape.filter((g) => Array.isArray(g?.outer) && g.outer.length > 2).slice(0, 40) : null,
    // Each face's own pattern ('' or missing: the rack's pattern).
    ventFaces: Object.fromEntries(VENT_FACES.map((f) => { const v = o[`vent${f[0].toUpperCase()}${f.slice(1)}`]; return [f, VENT_STYLES.includes(v) ? v : '']; })),
  };
}

export function ventAreas(area, x0, y0, x1, y1) {
  const w = x1 - x0, h = y1 - y0;
  if (area === 'window') return [[x0 + w * 0.15, y0 + h * 0.2, x1 - w * 0.15, y1 - h * 0.2]];
  if (area === 'bands') return [[x0, y0, x1, y0 + h * 0.3], [x0, y1 - h * 0.3, x1, y1]];
  if (area === 'ends') return [[x0, y0, x0 + w * 0.3, y1], [x1 - w * 0.3, y0, x1, y1]];
  if (area === 'top') return [[x0, y1 - h * 0.4, x1, y1]];
  return [[x0, y0, x1, y1]];
}
export const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** Cut the vents of p into the box (x0, y0)–(x1, y1) with the drawing tools d. */
export function ventPanel(p, d, X0, Y0, X1, Y1, R = 6, web = 3) {
  if (!p.vents || X1 - X0 < 4 || Y1 - Y0 < 4) return;
  if (p.ventSize) R = p.ventSize / 2;
  if (p.ventWeb) web = p.ventWeb;
  else if (p.ventOpen) web = webFor(p, X0, Y0, X1, Y1, R, p.ventOpen / 100);
  web = Math.max(MIN_BAR, web);
  for (const [x0, y0, x1, y1] of ventAreas(p.ventArea, X0, Y0, X1, Y1)) {
    const fade = fader(p, x0, y0, x1, y1);
    if (!p.ventRotate) { pattern(p, d, x0, y0, x1, y1, R, web, fade); continue; }
    // Turned: the pattern is drawn over a square that covers the area at any angle, each
    // opening turned about the area's middle and cut back to the area; slivers are dropped
    // (a cut-back piece stays if it keeps most of itself, or is still half an opening's size).
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, h = Math.hypot(x1 - x0, y1 - y0) / 2;
    const a = (p.ventRotate * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
    const turn = ([x, y]) => [cx + (x - cx) * c - (y - cy) * sn, cy + (x - cx) * sn + (y - cy) * c];
    const td = {
      z: d.z,
      off: (poly) => { if (!poly) return; const t = poly.map(turn), k = clipToBox(t, x0, y0, x1, y1), ka = k.length >= 3 ? area(k) : 0; if (ka > 0 && (ka >= 0.6 * area(t) || ka >= 2 * R * R)) d.off(k); }, // most of it, or still a good-sized opening (long bars)
      disc: (x, y, r, v = 1) => { const [tx, ty] = turn([x, y]); if (tx - r >= x0 && tx + r <= x1 && ty - r >= y0 && ty + r <= y1) d.disc(tx, ty, r, v); },
      on: () => {},
    };
    pattern(p, td, cx - h, cy - h, cx + h, cy + h, R, web, (x, y) => fade(...turn([x, y])));
  }
}

// How much an opening shrinks where it sits: 1 is full size. Front to back (the original), or
// back to front, up, down or out from the middle, by p.ventFadeAmt per cent at the far end.
function fader(p, x0, y0, x1, y1) {
  if (!p.ventFade) return () => 1;
  const k = (p.ventFadeAmt ?? 60) / 100, dir = p.ventFadeDir || 'back', cl = (t) => Math.min(1, Math.max(0, t));
  const W = Math.max(1, x1 - x0), H = Math.max(1, y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, half = Math.hypot(W, H) / 2;
  if (dir === 'front') return (x) => 1 - k * cl((x1 - x) / W);
  if (dir === 'up') return (x, y) => 1 - k * cl(((y ?? cy) - y0) / H);
  if (dir === 'down') return (x, y) => 1 - k * cl((y1 - (y ?? cy)) / H);
  if (dir === 'radial') return (x, y) => 1 - k * cl(Math.hypot(x - cx, (y ?? cy) - cy) / half);
  return (x) => 1 - k * cl((x - x0) / W);
}

function pattern(p, d, x0, y0, x1, y1, R, web, fade = () => 1) {
  const style = p.vents;
  if (style === 'slots') {
    const sw = R, pitch = R + web * 1.6, rows = Math.max(1, Math.floor((y1 - y0 + web) / (Math.min(y1 - y0, 60) + web)));
    const rl = (y1 - y0 - (rows - 1) * web) / rows;
    for (let r = 0; r < rows; r++) for (let x = x0 + sw / 2 + ((x1 - x0 - sw) % pitch) / 2; x + sw / 2 <= x1; x += pitch) { const w2 = (sw / 2) * fade(x, y0 + r * (rl + web) + rl / 2); d.off(rr(x - w2, y0 + r * (rl + web), x + w2, y0 + r * (rl + web) + rl, w2)); }
  } else if (style === 'holes') {
    const pitch = 2 * R + web;
    for (let y = y0 + R; y + R <= y1; y += pitch) for (let x = x0 + R + ((x1 - x0 - 2 * R) % pitch) / 2; x + R <= x1; x += pitch) d.disc(x, y, R * fade(x, y), 0);
  } else if (style === 'squares') {
    // One shape, any proportions: small squares, big squares, or long rectangles (a length past the area runs it end to end).
    let a = 2 * R, b = p.ventLength || a;
    if (p.ventUpright) [a, b] = [b, a];
    a = Math.min(a, x1 - x0); b = Math.min(b, y1 - y0);
    const nx = Math.max(1, Math.floor((x1 - x0 + web) / (a + web))), ny = Math.max(1, Math.floor((y1 - y0 + web) / (b + web)));
    const sx = x0 + (x1 - x0 - nx * a - (nx - 1) * web) / 2, sy = y0 + (y1 - y0 - ny * b - (ny - 1) * web) / 2;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = sx + i * (a + web), y = sy + j * (b + web), f = fade(x + a / 2, y + b / 2), ka = (a * (1 - f)) / 2, kb = (b * (1 - f)) / 2;
      if (a - 2 * ka > 0.8 && b - 2 * kb > 0.8) d.off(rr(x + ka, y + kb, x + a - ka, y + b - kb, Math.min(p.ventRound, (a - 2 * ka) / 2 - 0.01, (b - 2 * kb) / 2 - 0.01)));
    }
  } else if (style === 'mesh') {
    let a = Math.max(1.6, R * 0.6), g = Math.max(0.9, web * 0.45);
    // The quick draft (coarse pixels, while settings change) can't draw a bar thinner than about two of its
    // pixels: rows alias into broken bands. Draw the draft's mesh evenly scaled up instead; the full model
    // that follows (and every download) has the exact size.
    const dpx = 0.15 * draftScale();
    if (draftScale() > 1 && g < 2.5 * dpx) { const k = (2.5 * dpx) / g; a *= k; g *= k; }
    const pitch = a + g;
    for (let y = y0 + ((y1 - y0) % pitch) / 2; y + a <= y1; y += pitch) for (let x = x0 + ((x1 - x0) % pitch) / 2; x + a <= x1; x += pitch) { const k = (a * (1 - fade(x, y + a / 2))) / 2; if (a - 2 * k > 0.8) d.off(rr(x + k, y + k, x + a - k, y + a - k)); }
  } else if (style === 'diamond') {
    const pitchX = 2 * R + web * 1.41, pitchY = R + web * 0.71;
    for (let j = 0, y = y0 + R; y + R <= y1; j++, y += pitchY) for (let x = x0 + R + (j % 2 ? pitchX / 2 : 0); x + R <= x1; x += pitchX) { const r = R * fade(x, y); d.off([[x, y - r], [x + r, y], [x, y + r], [x - r, y]]); }
  } else if (style === 'grille') {
    // Wide openings: long rounded slots across the area, a bar between each.
    const sh = Math.max(4, R * 1.5), pitch = sh + Math.max(2.5, web * 1.4);
    for (let y = y0 + ((y1 - y0) % pitch) / 2; y + sh <= y1; y += pitch) d.off(rr(x0, y, x1, y + sh * (!p.ventFadeDir || p.ventFadeDir === 'back' ? fade(x0 + (x1 - x0) * ((y - y0) / Math.max(1, y1 - y0))) : fade((x0 + x1) / 2, y + sh / 2)), sh / 2 - 0.01));
  } else if (style === 'wave') {
    const w = Math.max(2, R * 0.7), A = Math.max(2, R * 0.6), lam = Math.max(24, R * 7), pitch = w + 2 * A * 0.5 + web * 1.4;
    for (let yc = y0 + A + w / 2 + 1; yc + A + w / 2 + 1 <= y1; yc += pitch) {
      const top = [], bot = [];
      for (let x = x0 + w / 2; x <= x1 - w / 2 + 0.01; x += 1.5) {
        const y = yc + A * Math.sin((2 * Math.PI * (x - x0)) / lam), dy = A * (2 * Math.PI / lam) * Math.cos((2 * Math.PI * (x - x0)) / lam), n = Math.hypot(1, dy), hw = (w / 2) * fade(x, y);
        top.push([x - (dy * hw) / n, y + hw / n]); bot.push([x + (dy * hw) / n, y - hw / n]);
      }
      if (top.length > 2) d.off([...bot, ...top.reverse()]);
    }
  } else if (style === 'bubbles') {
    // Free-flowing: circles of mixed sizes packed with a bar between each (the same pattern every time).
    const rand = rng(Math.round(x0 * 7 + y0 * 13 + x1 * 17 + y1 * 19)), placed = [];
    const tries = Math.min(4000, Math.round(((x1 - x0) * (y1 - y0)) / (R * R) * 6));
    for (let t = 0; t < tries; t++) {
      const x = x0 + rand() * (x1 - x0), y = y0 + rand() * (y1 - y0), r = R * (0.45 + 0.8 * rand()) * fade(x, y);
      if (r < 1.2 || x - r < x0 || x + r > x1 || y - r < y0 || y + r > y1) continue;
      if (placed.some(([px, py, pr]) => Math.hypot(px - x, py - y) < pr + r + web)) continue;
      placed.push([x, y, r]); d.disc(x, y, r, 0);
    }
  } else if (style === 'honeycomb') {
    // Thin walls, offset rows; the cell count up the face sets the size (else the opening size does).
    const w = p.ventOpen ? web : Math.max(MIN_BAR, Math.min(web, 1.6)); // thin, unless a density sets the bars
    const cells = p.ventCells || Math.max(2, Math.round((y1 - y0) / (1.5 * R + w * 0.87)));
    const r = Math.max(1.5, ((y1 - y0) / cells - w * 0.87) / 1.5);
    hexes(d, x0, y0, x1, y1, r, w, fade);
  } else if (style === 'angled') angled(p, d, x0, y0, x1, y1, R, web, fade);
  else if (style === 'arcade') arcade(p, d, x0, y0, x1, y1, R, web, fade);
  else if (style === 'gradient') {
    // Holes on a square grid, from a quarter of the size on one side to the full size on the other.
    const pitch = 2 * R + web, nx = Math.max(1, Math.floor((x1 - x0 - 2 * R) / pitch) + 1), ny = Math.max(1, Math.floor((y1 - y0 - 2 * R) / pitch) + 1);
    const sx = x0 + (x1 - x0 - (nx - 1) * pitch) / 2, sy = y0 + (y1 - y0 - (ny - 1) * pitch) / 2;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const u = nx > 1 ? i / (nx - 1) : 1, v = ny > 1 ? j / (ny - 1) : 1;
      const t = p.ventDir === 'back' ? u : p.ventDir === 'up' ? v : p.ventDir === 'down' ? 1 - v : 1 - u;
      const r = R * (0.25 + 0.75 * t) * fade(sx + i * pitch, sy + j * pitch);
      if (r >= 0.8) d.disc(sx + i * pitch, sy + j * pitch, r, 0);
    }
  } else if (style === 'voronoi') voronoi(p, d, x0, y0, x1, y1, R, web, fade);
  else if (style === 'louvre') {
    // Slats across the face: each opening steps up with the height through the panel (d.z), at 45°,
    // so the slope prints without supports and you can't see straight in.
    const sh = Math.max(3, R), pitch = sh + Math.max(web * 1.8, 2.4), lift = Number(d.z) || 0;
    for (let y = y0 + ((y1 - y0 - sh) % pitch) / 2; y + sh <= y1; y += pitch) {
      const top = Math.min(y1, y + sh + lift), bot = Math.max(y0, y + lift), w = (x1 - x0) * fade((x0 + x1) / 2, y + sh / 2);
      if (top - bot > 0.8 && w > 2) d.off(rr((x0 + x1) / 2 - w / 2, bot, (x0 + x1) / 2 + w / 2, top, Math.min(1, (top - bot) / 2 - 0.01)));
    }
  } else if (style === 'custom') custom(p, d, x0, y0, x1, y1, R, web, fade);
  else hexes(d, x0, y0, x1, y1, R, web, fade);
}

export const hexes = (d, x0, y0, x1, y1, R = 6, web = 3, fade = () => 1) => {
  // A honeycomb of holes filling the box given, whole hexagons only.
  const w = Math.sqrt(3) * R, pitchX = w + web, pitchY = 1.5 * R + web * 0.87;
  for (let j = 0, y = y0 + R; y + R <= y1; j++, y += pitchY)
    for (let x = x0 + w / 2 + (j % 2 ? pitchX / 2 : 0); x + w / 2 <= x1; x += pitchX) {
      const r = R * fade(x, y);
      d.off(Array.from({ length: 6 }, (_, k) => { const a = Math.PI / 6 + (k * Math.PI) / 3; return [x + r * Math.cos(a), y + r * Math.sin(a)]; }));
    }
};

// A polygon cut back to a box (Sutherland–Hodgman): openings never reach past their area.
export function clipToBox(poly, x0, y0, x1, y1) {
  let out = poly;
  for (const [axis, lim, keepAbove] of [[0, x0, true], [0, x1, false], [1, y0, true], [1, y1, false]]) {
    const inp = out; out = [];
    if (!inp.length) break;
    const inside = (q) => (keepAbove ? q[axis] >= lim : q[axis] <= lim);
    for (let i = 0; i < inp.length; i++) {
      const a = inp[i], b = inp[(i + 1) % inp.length], ia = inside(a), ib = inside(b);
      if (ia) out.push(a);
      if (ia !== ib) { const t = (lim - a[axis]) / (b[axis] - a[axis]); out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
    }
  }
  return out;
}
const area = (poly) => { let s = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; };

// Long slots leaning at p.ventAngle from upright; mirrored, the two halves lean towards each other (chevrons).
function angled(p, d, x0, y0, x1, y1, R, web, fade) {
  const sw = Math.max(1.2, R), pitch = sw + web * 1.6, a = (p.ventAngle * Math.PI) / 180;
  const halves = p.ventMirror && x1 - x0 > 4 * pitch ? [[x0, (x0 + x1) / 2 - web / 2, 1], [(x0 + x1) / 2 + web / 2, x1, -1]] : [[x0, x1, 1]];
  for (const [hx0, hx1, s] of halves) {
    const ux = Math.sin(a) * s, uy = Math.cos(a), nx = uy, ny = -ux, h = y1 - y0, L = h / Math.cos(a) + 2 * sw;
    const cy = (y0 + y1) / 2, step = pitch / Math.cos(a); // across the slots, measured along x
    const span = (h / 2) * Math.tan(a) + sw;
    for (let cx = hx0 - span + (((hx1 - hx0 + 2 * span) % step) / 2); cx <= hx1 + span; cx += step) {
      const hw = (sw / 2) * fade(cx, (y0 + y1) / 2);
      if (hw < 0.4) continue;
      const strip = [[cx - ux * L / 2 + nx * hw, cy - uy * L / 2 + ny * hw], [cx + ux * L / 2 + nx * hw, cy + uy * L / 2 + ny * hw], [cx + ux * L / 2 - nx * hw, cy + uy * L / 2 - ny * hw], [cx - ux * L / 2 - nx * hw, cy - uy * L / 2 - ny * hw]];
      const c = clipToBox(strip, hx0, y0, hx1, y1);
      if (c.length >= 3 && area(c) > 2) d.off(c);
    }
  }
}

// Retro arcade: rings of round holes round a centre, or a burst of slots like a speaker cone.
function arcade(p, d, x0, y0, x1, y1, R, web, fade) {
  const cx = x0 + p.ventCx * (x1 - x0), cy = y0 + p.ventCy * (y1 - y0);
  const maxR = Math.max(Math.hypot(cx - x0, cy - y0), Math.hypot(cx - x1, cy - y0), Math.hypot(cx - x0, cy - y1), Math.hypot(cx - x1, cy - y1));
  const r = Math.max(1, R * 0.6), pitch = 2 * r + web;
  const fits = (x, y, rr2) => x - rr2 >= x0 && x + rr2 <= x1 && y - rr2 >= y0 && y + rr2 <= y1;
  if (p.ventArcade === 'burst') {
    const sw = Math.max(1.2, r), inner = 2 * r + web, n = Math.max(8, Math.floor((2 * Math.PI * (inner + 4 * sw)) / (sw + web * 1.6)));
    if (fits(cx, cy, r)) d.disc(cx, cy, r, 0);
    for (let k = 0; k < n; k++) {
      const t = (2 * Math.PI * k) / n, ux = Math.cos(t), uy = Math.sin(t), nx = -uy, ny = ux, hw = (sw / 2) * fade(cx + ux * maxR / 2, cy + uy * maxR / 2);
      const slot = [[cx + ux * inner + nx * hw, cy + uy * inner + ny * hw], [cx + ux * maxR + nx * hw * 2.2, cy + uy * maxR + ny * hw * 2.2], [cx + ux * maxR - nx * hw * 2.2, cy + uy * maxR - ny * hw * 2.2], [cx + ux * inner - nx * hw, cy + uy * inner - ny * hw]];
      const c = clipToBox(slot, x0, y0, x1, y1);
      if (c.length >= 3 && area(c) > 2) d.off(c);
    }
    return;
  }
  if (fits(cx, cy, r)) d.disc(cx, cy, r * fade(cx, cy), 0);
  // Rings further apart than the holes round each one, so they read as rings.
  const step = pitch * 1.45;
  for (let ring = 1; ring * step <= maxR; ring++) {
    const rad = ring * step, n = Math.max(6, Math.floor((2 * Math.PI * rad) / pitch));
    for (let k = 0; k < n; k++) {
      const t = (2 * Math.PI * k) / n, x = cx + rad * Math.cos(t), y = cy + rad * Math.sin(t), rk = r * fade(x, y);
      if (rk >= 0.8 && fits(x, y, rk)) d.disc(x, y, rk, 0);
    }
  }
}

// Voronoi: points on a jittered grid (the same for a seed), each one's cell cut back by half a bar
// from each neighbour, so every bar is the same width.
function voronoi(p, d, x0, y0, x1, y1, R, web, fade) {
  const rand = rng(p.ventSeed * 7919 + Math.round(x0 * 3 + y0 * 5 + x1 * 11 + y1 * 13));
  const g = 2 * R + web, nx = Math.max(1, Math.round((x1 - x0) / g)), ny = Math.max(1, Math.round((y1 - y0) / g));
  const sx = (x1 - x0) / nx, sy = (y1 - y0) / ny, pts = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) pts.push([x0 + (i + 0.15 + 0.7 * rand()) * sx, y0 + (j + 0.15 + 0.7 * rand()) * sy]);
  for (let i = 0; i < pts.length; i++) {
    const [px, py] = pts[i];
    let cell = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    for (let k = 0; k < pts.length && cell.length; k++) {
      if (k === i) continue;
      const [qx, qy] = pts[k], dx = qx - px, dy = qy - py, dist = Math.hypot(dx, dy);
      if (dist > 3 * Math.max(sx, sy)) continue;
      // Keep the side nearer p, moved back by half a bar: n·x <= n·m - web/2.
      const ux = dx / dist, uy = dy / dist, lim = ux * (px + qx) / 2 + uy * (py + qy) / 2 - web / 2;
      const next = [];
      for (let e = 0; e < cell.length; e++) {
        const a = cell[e], b = cell[(e + 1) % cell.length], fa = ux * a[0] + uy * a[1] - lim, fb = ux * b[0] + uy * b[1] - lim;
        if (fa <= 0) next.push(a);
        if ((fa <= 0) !== (fb <= 0)) { const t = fa / (fa - fb); next.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
      }
      cell = next;
    }
    if (cell.length < 3) continue;
    // Inside the area's edge by half a bar too, then shrunk toward its middle for the fade.
    cell = clipToBox(cell, x0 + web / 2, y0 + web / 2, x1 - web / 2, y1 - web / 2);
    if (cell.length < 3) continue;
    const mx = cell.reduce((s, q) => s + q[0], 0) / cell.length, my = cell.reduce((s, q) => s + q[1], 0) / cell.length, f = fade(mx, my);
    const out = f < 1 ? cell.map(([x, y]) => [mx + (x - mx) * f, my + (y - my) * f]) : cell;
    if (area(out) > 4) d.off(out);
  }
}

// Your own shape, repeated: each drawing's outer outlines (holes would leave islands that fall
// out) scaled so the shape's longest side is the opening size, on offset rows, whole ones only.
function custom(p, d, x0, y0, x1, y1, R, web, fade) {
  const outers = (p.ventShape || []).map((g) => g.outer).filter((o) => o && o.length > 2);
  if (!outers.length) return;
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const o of outers) for (const [x, y] of o) { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); }
  const s = (2 * R) / Math.max(1e-6, bx1 - bx0, by1 - by0), w = (bx1 - bx0) * s, h = (by1 - by0) * s;
  const px = w + web, py = h + web, nx = Math.max(1, Math.floor((x1 - x0 + web) / px)), ny = Math.max(1, Math.floor((y1 - y0 + web) / py));
  const sx = x0 + (x1 - x0 - (nx * px - web)) / 2, sy = y0 + (y1 - y0 - (ny * py - web)) / 2;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx - (j % 2 && nx > 1 ? 1 : 0); i++) {
    const ox = sx + i * px + (j % 2 && nx > 1 ? px / 2 : 0), oy = sy + j * py, mx = ox + w / 2, my = oy + h / 2, f = fade(mx, my);
    if (f * Math.min(w, h) < 1) continue;
    for (const o of outers) d.off(o.map(([x, y]) => [mx + ((x - bx0) * s - w / 2) * f, my + ((y - by0) * s - h / 2) * f]));
  }
}

/** How open a pattern is (0–1) over the areas it vents, counted from the shapes it cuts (none overlap). */
export function openFraction(p, X0, Y0, X1, Y1, R, web) {
  let open = 0, total = 0;
  const d = { off: (poly) => { if (poly) open += area(poly); }, disc: (x, y, r) => { open += Math.PI * r * r; }, on: () => {} };
  for (const [x0, y0, x1, y1] of ventAreas(p.ventArea, X0, Y0, X1, Y1)) { total += (x1 - x0) * (y1 - y0); pattern(p, d, x0, y0, x1, y1, R, Math.max(MIN_BAR, web), fader(p, x0, y0, x1, y1)); }
  return open / Math.max(1, total);
}

// The bar width that gets closest to the open area asked for (wider bars, less open).
function webFor(p, X0, Y0, X1, Y1, R, target) {
  let lo = MIN_BAR, hi = Math.max(4 * R, 8);
  if (openFraction(p, X0, Y0, X1, Y1, R, lo) <= target) return lo;
  for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (openFraction(p, X0, Y0, X1, Y1, R, mid) > target) lo = mid; else hi = mid; }
  // The open area jumps where a row of openings comes or goes: take whichever side is nearer.
  return Math.abs(openFraction(p, X0, Y0, X1, Y1, R, lo) - target) <= Math.abs(openFraction(p, X0, Y0, X1, Y1, R, hi) - target) ? lo : hi;
}

/** Extra slab heights for a louvred face from z0 to z1, so its openings slope smoothly at 45°. */
export function louvreCuts(p, z0, z1, faces = VENT_FACES) {
  const used = p.vents === 'louvre' || faces.some((f) => p.ventFaces?.[f] === 'louvre');
  if (!used) return [];
  const out = [];
  for (let z = z0 + 0.4; z < z1 - 0.05; z += 0.4) out.push(Math.round(z * 1000) / 1000);
  return out;
}
