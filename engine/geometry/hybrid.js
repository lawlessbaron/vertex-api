// Hybrid laser + FDM parts: a printed part and a laser-cut sheet made to fit
// each other. Two things decide whether they do:
//   - kerf: the laser burns away a little on every cut. A part's outline is
//     drawn half a kerf outside the line, and a hole's half a kerf inside, so
//     both come out at the size they were designed.
//   - shrink: a print comes out a little smaller than its model as it cools
//     (a few tenths of a percent for PLA, more for ABS and ASA). The printed
//     part is made that much bigger, so it cools to the size it was designed.
//
// The light bar: a printed channel for an LED strip (a rev or flag light for
// a sim rig) with a laser-cut diffuser that slides into grooves along its top.
// The snap bezel: a printed frame that holds a laser-cut window against a
// laser-cut panel, with flexible hooks that snap through slots in the panel.
import { Mesh } from './mesh.js';
import { extrudePolygon, circlePolygon } from './polygon.js';
import { rr } from './enclosure.js';
import { extrudeX, extrudeY } from './primitives.js';

const r3 = (n) => Math.round(n * 1000) / 1000;
const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

// LED strips by LEDs per metre: the pitch between LEDs, in mm.
export const STRIP_DENSITY = { 30: 1000 / 30, 60: 1000 / 60, 144: 1000 / 144 };
// Typical shrink, in percent, for the materials people print these in.
export const SHRINK = { PLA: 0.3, PETG: 0.4, ABS: 0.7, ASA: 0.6 };

/** Scale a printed mesh so it shrinks back to size: 1 / (1 − shrink). */
export function shrinkFactor(pct) { return 1 / (1 - clamp(pct, 0, 5, 0) / 100); }
function scaled(mesh, pct) {
  const k = shrinkFactor(pct), p = mesh.positions;
  if (k !== 1) for (let i = 0; i < p.length; i++) p[i] *= k;
  return mesh;
}
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const slab = (x0, y0, x1, y1, z0, z1) => extrudePolygon(rect(x0, y0, x1, y1), [], z0, z1);

/**
 * Laser shapes, then kerf. Each shape: { x0, y0, x1, y1, r, role: 'part' | 'hole' }
 * (rounded rectangles, y down the page), { poly: [[x, y], ...], role } (a
 * rectilinear outline, like a finger-jointed panel) or { line: [[x, y], [x, y]] }
 * to engrave. A part grows by half the kerf all round and a hole shrinks by it.
 */
export function withKerf(shapes, kerf) {
  const h = clamp(kerf, 0, 1, 0) / 2;
  return shapes.map((s) => {
    if (s.line) return s;
    const d = s.role === 'hole' ? -h : h;
    if (s.poly) return { ...s, poly: offsetRectilinear(s.poly, d) };
    return { ...s, x0: s.x0 - d, y0: s.y0 - d, x1: s.x1 + d, y1: s.y1 + d, r: s.r ? Math.max(0, s.r + d) : 0 };
  });
}

/**
 * A rectilinear polygon (every edge horizontal or vertical, no repeated or
 * collinear points) pushed out by d on every edge (in for d < 0). Each
 * corner moves along both its edges' outward normals, so tabs grow wider
 * and notches narrower by 2d, which is what a laser's kerf takes back.
 */
export function offsetRectilinear(poly, d) {
  const n = poly.length;
  if (!d || n < 4) return poly.map(([x, y]) => [x, y]);
  let area = 0;
  for (let i = 0; i < n; i++) { const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % n]; area += x0 * y1 - x1 * y0; }
  const sign = area > 0 ? 1 : -1;
  // The outward unit normal of the edge from p[i] to p[i + 1].
  const normal = (i) => {
    const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % n];
    const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0);
    return [dy * sign, -dx * sign];
  };
  return poly.map(([x, y], i) => {
    const a = normal((i + n - 1) % n), b = normal(i);
    return [r3(x + d * (a[0] + b[0])), r3(y + d * (a[1] + b[1]))];
  });
}

/** The laser file as SVG (red: cut, blue: engrave) and DXF (layers CUT and ENGRAVE), in mm. */
export function drawing(shapes, name) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const pts = (s) => (s.line ? s.line : s.poly ? s.poly : rr(s.x0, s.y0, s.x1, s.y1, s.r || 0, 8));
  for (const s of shapes) for (const [x, y] of pts(s)) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const m = 3, W = maxX - minX + 2 * m, H = maxY - minY + 2 * m;
  const at = ([x, y]) => [r3(x - minX + m), r3(y - minY + m)];
  const svgBody = shapes.map((s) => {
    const p = pts(s).map(at);
    const d = `M${p.map(([x, y]) => `${x} ${y}`).join(' L')}${s.line ? '' : ' Z'}`;
    return `<path d="${d}" fill="none" stroke="${s.line ? '#0000ff' : '#ff0000'}" stroke-width="0.1"/>`;
  });
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<!-- ${name}. Made with VERTEX (vertex.mintmotive.com.au/utilities#hybrid). Red: cut. Blue: engrave or score. Units: mm, import at 100%. -->\n<svg xmlns="http://www.w3.org/2000/svg" width="${r3(W)}mm" height="${r3(H)}mm" viewBox="0 0 ${r3(W)} ${r3(H)}">\n${svgBody.join('\n')}\n</svg>\n`;
  const e = [];
  for (const s of shapes) {
    const layer = s.line ? 'ENGRAVE' : 'CUT';
    e.push('0', 'POLYLINE', '8', layer, '66', '1', '70', s.line ? '0' : '1');
    for (const q of pts(s)) { const [x, y] = at(q); e.push('0', 'VERTEX', '8', layer, '10', String(x), '20', String(r3(H - y)), '30', '0'); }
    e.push('0', 'SEQEND');
  }
  const dxf = ['999', `${name}. Made with VERTEX`, '0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', ...e, '0', 'ENDSEC', '0', 'EOF'].join('\n') + '\n';
  return { svg, dxf, width: r3(W), height: r3(H) };
}

/**
 * The light bar. leds: how many; density: LEDs per metre (30, 60 or 144);
 * strip: the strip's width; depth: from the LEDs to the diffuser (deeper
 * blends the dots more); sheet: the diffuser's thickness; zones: LED counts
 * for engraved zone lines, like [8, 4, 4] for green, amber and red.
 */
export function lightBar(o = {}) {
  const leds = Math.round(clamp(o.leds, 1, 144, 16));
  const pitch = STRIP_DENSITY[o.density] || STRIP_DENSITY[60];
  const strip = clamp(o.strip, 5, 20, 10), depth = clamp(o.depth, 4, 30, 8), sheet = clamp(o.sheet, 1, 6, 3);
  const c = clamp(o.clearance, 0, 1, 0.2), kerf = clamp(o.kerf, 0, 1, 0.1), shrink = clamp(o.shrink, 0, 5, 0.3);
  const w = 2.4, gd = 1.2, f = 2, lipT = 1.2, ear = 9, end = 3;
  const Win = strip + 1, Lin = leds * pitch + 2 * end;
  const Wout = Win + 2 * w, Lout = Lin + 2 * w;
  if (Lout > 1000) throw new Error('That’s over a metre long. Make it in two pieces.');
  // Above the groove, a chamfer back to the wall (steeper than 45°), so the lip prints without supports.
  const g0 = f + depth, g1 = g0 + sheet + c, g2 = g1 + 1.5 * gd, top = g2 + lipT;

  const mesh = new Mesh();
  // Floor, with an ear at each end for an M3 screw, and a slot at the closed end for the wires.
  const screw = (x) => (circlePolygon(x, Wout / 2, 1.7, 24));
  const wires = (rr(w + 1, Wout / 2 - 2.5, w + 7, Wout / 2 + 2.5, 1.5, 4));
  mesh.append(extrudePolygon(rr(-ear, 0, Lout + ear, Wout, 3, 6), [screw(-ear / 2), screw(Lout + ear / 2), wires], 0, f));
  // Walls round the cavity.
  mesh.append(extrudePolygon(rect(0, 0, Lout, Wout), [(rect(w, w, Lout - w, Wout - w))], f, g0));
  // The groove layer: a U, open at the far end, where the diffuser slides in.
  const a = w - gd, b = Wout - w + gd;
  const u = (a, b, z0, z1) => mesh.append(extrudePolygon([[0, 0], [Lout, 0], [Lout, a], [a, a], [a, b], [Lout, b], [Lout, Wout], [0, Wout]], [], z0, z1));
  u(a, b, g0, g2);
  // The chamfers: sloped prisms along each side and across the closed end.
  const e = 0.01;
  mesh.append(extrudeX([[a - e, g1], [w, g2], [a - e, g2]], a - e, Lout));
  mesh.append(extrudeX([[b + e, g1], [b + e, g2], [Wout - w, g2]], a - e, Lout));
  mesh.append(extrudeY([[a - e, g1], [w, g2], [a - e, g2]], a - e, b + e));
  // The lip over the groove, with the window the light shines through.
  mesh.append(extrudePolygon(rect(0, 0, Lout, Wout), [(rect(w, w, Lout - w, Wout - w))], g2, top));
  scaled(mesh, shrink);

  // The diffuser: from the groove's closed end to flush with the open end.
  const dl = Lout - a - c, dw = b - a - 2 * c;
  const shapes = [{ x0: 0, y0: 0, x1: dl, y1: dw, r: 0, role: 'part' }];
  const zones = (Array.isArray(o.zones) ? o.zones : []).map((n) => Math.round(Number(n))).filter((n) => n > 0);
  let k = 0;
  for (const n of zones.slice(0, -1)) {
    k += n;
    if (k >= leds) break;
    const x = gd + end + k * pitch; // between LED k and LED k + 1, measured from the diffuser's closed end
    shapes.push({ line: [[x, 0.8], [x, dw - 0.8]] });
  }
  const laser = drawing(withKerf(shapes, kerf), `Light bar diffuser for ${leds} LEDs, ${r3(sheet)} mm sheet`);
  return {
    mesh, laser,
    size: { length: r3(Lout), overall: r3((Lout + 2 * ear)), width: r3(Wout), height: r3(top) },
    diffuser: { length: r3(dl), width: r3(dw) }, leds, pitch: r3(pitch),
  };
}

/**
 * The snap bezel. w × h: the window you see through; sheet: the window's
 * thickness; panel: the thickness of the panel it clips into; ledge: how far
 * the window reaches under the frame; border: the frame's width.
 */
export function snapBezel(o = {}) {
  const w = clamp(o.w, 20, 400, 80), h = clamp(o.h, 20, 400, 50);
  const sheet = clamp(o.sheet, 1, 6, 3), panel = clamp(o.panel, 1, 10, 3);
  const ledge = clamp(o.ledge, 2, 15, 4), radius = clamp(o.radius, 0, 20, 3);
  const c = clamp(o.clearance, 0, 1, 0.2), kerf = clamp(o.kerf, 0, 1, 0.1), shrink = clamp(o.shrink, 0, 5, 0.3);
  // The hooks: thin so they flex, with a small barb that catches behind the panel.
  // The barb's underside slopes so it prints without supports, so a firm
  // pull unclips the frame and the window can be swapped.
  const ft = 1.4, fw = 8, barb = 0.7, barbH = 2.4, relief = 0.6;
  const F = 2, depth = Math.max(0.5, sheet - 0.1); // a hair shallower than the window, so it's held tight
  const border = Math.max(clamp(o.border, 6, 40, 8), c + 1.4 + ft + barb + 2);
  const pw = w + 2 * ledge, ph = h + 2 * ledge;
  const Bw = pw + 2 * border, Bh = ph + 2 * border;
  // Everything centred on the window; x right, y up (for the print).
  const px = pw / 2 + c, py = ph / 2 + c; // the pocket's half size
  const hooks = [];
  const along = (len) => { const n = Math.max(1, Math.floor(len / 50)); return Array.from({ length: n }, (_, i) => -len / 2 + (len * (i + 0.5)) / n); };
  for (const s of along(pw - 2 * radius)) { hooks.push({ side: 'top', s }); hooks.push({ side: 'bottom', s }); }
  for (const s of along(ph - 2 * radius)) { hooks.push({ side: 'left', s }); hooks.push({ side: 'right', s }); }
  const gap = 1.4; // from the pocket's edge to the hook
  // A hook's footprint as [u0, u1] across (outward from the centre) and [v0, v1] along its side.
  const across = (side) => (side === 'top' || side === 'bottom' ? py : px) + gap;
  const toXY = (side, u0, u1, v0, v1) => {
    if (side === 'right') return [u0, v0, u1, v1];
    if (side === 'left') return [-u1, v0, -u0, v1];
    if (side === 'top') return [v0, u0, v1, u1];
    return [v0, -u1, v1, -u0];
  };

  const mesh = new Mesh();
  const outer = rr(-Bw / 2, -Bh / 2, Bw / 2, Bh / 2, radius + border / 2, 8);
  // The front, face down on the bed, with the window.
  mesh.append(extrudePolygon(outer, [(rr(-w / 2, -h / 2, w / 2, h / 2, Math.max(0, radius - ledge), 8))], 0, F));
  // The pocket the window drops into, with room round each hook to flex.
  const reliefs = hooks.map(({ side, s }) => {
    const u = across(side);
    const [x0, y0, x1, y1] = toXY(side, u - relief, u + ft + 0.4, s - fw / 2 - 0.5, s + fw / 2 + 0.5);
    return (rect(x0, y0, x1, y1));
  });
  mesh.append(extrudePolygon(outer, [(rect(-px, -py, px, py)), ...reliefs], F, F + depth));
  // The hooks, from the front up through the panel, with a barb that tapers to a lead-in.
  const catchZ = F + depth + panel + 0.15;
  // The barb, as a sloped prism along the hook: out to full depth a little
  // steeper than 45° (it starts just clear of the panel's back face, so the
  // panel sits flat), then a long lead-in back to the hook's face at the top.
  const rise = barb * 2, top = catchZ + barbH;
  const barbProfile = (u) => [[u + ft - 0.01, catchZ], [u + ft + barb, catchZ + rise], [u + ft + 0.05, top], [u + ft - 0.01, top]];
  for (const { side, s } of hooks) {
    const u = across(side);
    const [x0, y0, x1, y1] = toXY(side, u, u + ft, s - fw / 2, s + fw / 2);
    mesh.append(slab(x0, y0, x1, y1, F, top));
    // Profiles are [outward, z]; right and left run along y, top and bottom along x.
    const pr = barbProfile(u);
    if (side === 'right') mesh.append(extrudeY(pr, s - fw / 2, s + fw / 2));
    else if (side === 'left') mesh.append(extrudeY(pr.map(([a, z]) => [-a, z]), s - fw / 2, s + fw / 2));
    else if (side === 'top') mesh.append(extrudeX(pr, s - fw / 2, s + fw / 2));
    else mesh.append(extrudeX(pr.map(([a, z]) => [-a, z]), s - fw / 2, s + fw / 2));
  }
  scaled(mesh, shrink);

  // Laser: the window, and the panel's cut-outs (y down the page, so flip).
  const pane = { x0: -pw / 2, y0: -ph / 2, x1: pw / 2, y1: ph / 2, r: Math.max(0, radius), role: 'part' };
  const opening = { x0: -w / 2 - 1, y0: -h / 2 - 1, x1: w / 2 + 1, y1: h / 2 + 1, r: Math.max(0, radius - ledge), role: 'hole' };
  // A slot lets the hook bend inward by the barb's depth as it goes through, then the barb catches its outer edge.
  const slots = hooks.map(({ side, s }) => {
    const u = across(side);
    const [x0, y0, x1, y1] = toXY(side, u - barb - c, u + ft + c, s - fw / 2 - c, s + fw / 2 + c);
    return { x0, y0: -y1, x1, y1: -y0, r: 0, role: 'hole' };
  });
  // The frame's outline, scored on the panel, to line it up.
  const guide = rr(-Bw / 2, -Bh / 2, Bw / 2, Bh / 2, radius + border / 2, 8);
  const guideLines = guide.map((p, i) => ({ line: [p, guide[(i + 1) % guide.length]] }));
  const name = `${r3(w)} × ${r3(h)} mm window`;
  return {
    mesh,
    window: drawing(withKerf([pane], kerf), `Snap bezel: the window for a ${name}, ${r3(sheet)} mm sheet`),
    panel: drawing(withKerf([opening, ...slots, ...guideLines], kerf), `Snap bezel: the panel cut-out for a ${name}, ${r3(panel)} mm panel`),
    size: { width: r3(Bw), height: r3(Bh), depth: r3((catchZ + barbH)) },
    pane: { width: r3(pw), height: r3(ph) }, hooks: hooks.length,
  };
}
