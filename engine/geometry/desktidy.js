// Pen pots and desk tidies. A pen pot (round, hex or square, one to three
// cups side by side at stepped heights, dividers inside if you like), a stand
// for business cards (leaning back so they read), or a little tray for clips
// and keys. Every part prints upright with no supports: walls straight up, a
// 0.6 mm chamfer round each rim, and the bottom 0.4 mm stepped in so it
// doesn't flare.
import { Mesh } from './mesh.js';
import { circlePolygon, extrudePolygon, orient } from './polygon.js';

export const DESKTIDY_DEFAULTS = {
  item: 'pot', // pot | cards | tray
  shape: 'round', // round | hex | square
  size: 70, // a pot's width (mm)
  height: 100,
  cups: 1, // 1 to 3, side by side
  step: 20, // each next cup is this much lower
  dividers: 'none', // none | half | cross
  wall: 2,
  floor: 2.4,
  cardW: 90, cardD: 55, cardCount: 40, // business cards
  trayW: 120, trayD: 80, trayH: 25,
};

export const DESKTIDY_ITEMS = { pot: 'Pen pot', cards: 'Business card stand', tray: 'Desk tray' };
export const DESKTIDY_SHAPES = { round: 'Round', hex: 'Hexagon', square: 'Square' };

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

// The outline of a cup of width w centred at (cx, cy), counter-clockwise.
function cupOutline(shape, cx, cy, w, inset = 0) {
  const r = w / 2 - inset;
  // A hexagon's flats face left and right, so cups in a row share a flat wall.
  if (shape === 'hex') { const R = r / Math.cos(Math.PI / 6); return Array.from({ length: 6 }, (_, k) => { const a = Math.PI / 6 + (Math.PI / 3) * k; return [cx + R * Math.cos(a), cy + R * Math.sin(a)]; }); }
  if (shape === 'square') { const rr = Math.max(0.5, Math.min(6, r / 3)), seg = 6, pts = []; for (const [qx, qy, a0] of [[1, -1, -90], [1, 1, 0], [-1, 1, 90], [-1, -1, 180]]) for (let k = 0; k <= seg; k++) { const a = ((a0 + (90 * k) / seg) * Math.PI) / 180; pts.push([cx + qx * (r - rr) + rr * Math.cos(a), cy + qy * (r - rr) + rr * Math.sin(a)]); } return pts; }
  return circlePolygon(cx, cy, r, 64);
}

// A cup: floor, wall, a chamfered rim and an inset foot. Its walls are one
// ring, its floor solid.
function cup(shape, cx, cy, w, h, wall, floor) {
  const m = new Mesh(), foot = 0.4, rim = 0.6;
  m.append(extrudePolygon(cupOutline(shape, cx, cy, w, foot), [], 0, foot));
  m.append(extrudePolygon(cupOutline(shape, cx, cy, w), [], foot, floor));
  m.append(extrudePolygon(cupOutline(shape, cx, cy, w), [orient(cupOutline(shape, cx, cy, w, wall), false)], floor, h - rim));
  // The rim's chamfer: the outside steps in, so the top edge isn't sharp.
  m.append(extrudePolygon(cupOutline(shape, cx, cy, w, rim / 2), [orient(cupOutline(shape, cx, cy, w, wall), false)], h - rim, h));
  return m;
}

export function generateDeskTidy(options = {}) {
  const o = { ...DESKTIDY_DEFAULTS, ...options };
  const item = DESKTIDY_ITEMS[o.item] ? o.item : 'pot';
  const wall = num(o.wall, 1.2, 4, 2), floor = num(o.floor, 1.2, 5, 2.4);
  const mesh = new Mesh(), notes = [];
  if (item === 'pot') {
    const shape = DESKTIDY_SHAPES[o.shape] ? o.shape : 'round', w = num(o.size, 30, 120, 70), H = num(o.height, 30, 180, 100), n = Math.round(num(o.cups, 1, 3, 1)), step = num(o.step, 0, 60, 20);
    // Cups side by side, sharing a wall: each one wall-width closer than its width.
    const pitch = w - wall;
    for (let i = 0; i < n; i++) {
      const cx = (i - (n - 1) / 2) * pitch, h = Math.max(30, H - i * step);
      mesh.append(cup(shape, cx, 0, w, h, wall, floor));
      if (o.dividers !== 'none') {
        // Thin walls inside, a little lower than the rim, so pens sort themselves.
        const r = w / 2 - wall + 0.2, dh = h - 15, t = Math.max(1.2, wall * 0.8);
        mesh.append(extrudePolygon([[cx - r, -t / 2], [cx + r, -t / 2], [cx + r, t / 2], [cx - r, t / 2]], [], floor - 0.01, dh));
        if (o.dividers === 'cross') mesh.append(extrudePolygon([[cx - t / 2, -r], [cx + t / 2, -r], [cx + t / 2, r], [cx - t / 2, r]], [], floor - 0.01, dh));
      }
    }
    notes.push(`${n > 1 ? `${n} cups` : 'A pot'} ${w} mm across, ${H} mm tall${n > 1 && step ? `, each next one ${step} mm lower` : ''}. Prints upright, no supports; vase mode won't do the floor, so print it normally with ${Math.round(wall / 0.45)} walls.`);
  } else if (item === 'cards') {
    // A side profile in (u along the depth, v up), stood up and run across
    // the width: a front lip, a slot leaning 15° back so the top card reads,
    // and a back wedge whose face slopes in, so nothing overhangs.
    const cw = num(o.cardW, 50, 120, 90), cd = num(o.cardD, 30, 100, 55), count = Math.round(num(o.cardCount, 5, 120, 40));
    const t = Math.max(4, count * 0.35 + 1), lean = Math.tan((15 * Math.PI) / 180), W = cw + 2 * wall + 1;
    const base = 4, ledge = base + 2, lip = ledge + 8, top = ledge + Math.min(cd * 0.55, 35);
    const yA = wall + 3, yB = yA + t, run = (top - ledge) * lean, back = yB + run + 4, y1 = back + 12;
    const profile = [[0, 0], [y1, 0], [y1, base], [back, top], [yB + run, top], [yB, ledge], [yA, ledge], [yA, lip], [0, lip]];
    const side = extrudePolygon(profile, [], -W / 2, W / 2);
    const q = side.positions;
    for (let i = 0; i < q.length; i += 3) { const u = q[i], v = q[i + 1], w = q[i + 2]; q[i] = w; q[i + 1] = u - y1 / 2; q[i + 2] = v; } // (u, v, w) → (w, u, v): a rotation
    mesh.append(side);
    notes.push(`Holds about ${count} cards ${cw} × ${cd} mm in a ${t.toFixed(1)} mm slot, leaning back 15° so the front one reads. Prints on its base, no supports.`);
  } else {
    const W = num(o.trayW, 40, 250, 120), D = num(o.trayD, 30, 250, 80), H = num(o.trayH, 8, 60, 25), rr = Math.min(8, Math.min(W, D) / 4);
    const outline = (inset) => { const pts = [], seg = 8, w = W / 2 - inset, d = D / 2 - inset, r = Math.max(0.5, rr - inset); for (const [qx, qy, a0] of [[1, -1, -90], [1, 1, 0], [-1, 1, 90], [-1, -1, 180]]) for (let k = 0; k <= seg; k++) { const a = ((a0 + (90 * k) / seg) * Math.PI) / 180; pts.push([qx * (w - r) + r * Math.cos(a), qy * (d - r) + r * Math.sin(a)]); } return pts; };
    const inner = orient(outline(wall), false);
    mesh.append(extrudePolygon(outline(0.4), [], 0, 0.4));
    mesh.append(extrudePolygon(outline(0), [], 0.4, floor));
    mesh.append(extrudePolygon(outline(0), [inner], floor, H - 0.6));
    mesh.append(extrudePolygon(outline(0.3), [inner], H - 0.6, H));
    notes.push(`A tray ${W} × ${D} mm, ${H} mm deep, for clips, keys and SD cards.`);
  }
  return { parts: [{ mesh, name: `desk-${item}` }], notes };
}
