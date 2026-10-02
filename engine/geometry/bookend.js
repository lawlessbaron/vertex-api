// Bookends. A foot that slides under the books, an upright they lean on, and
// a brace behind the upright on a second foot. The brace is a straight one or
// an arch, and the arch can carry your initials, standing inside it on a bar.
// The whole profile is extruded across the bookend's width and prints on its
// side, so the letters are clean through-cuts and nothing needs support.
// Profile in (x, y): the upright's face against the books at x = t, books at
// x > t, the brace at x < 0, y up.
import { Mesh } from './mesh.js';
import { extrudePolygon, groupLoops, signedArea, simplifyClosed } from './polygon.js';
import { Grid, fillCircle, fillPolygon, traceBinary } from './raster.js';
import { textPolygons, textUnits } from './font.js';
import { cleanName } from './keychain.js';

export const BOOKEND_DEFAULTS = {
  style: 'arch', // brace | arch | initials
  initials: 'MM',
  height: 150,
  depth: 100, // the foot under the books
  width: 110, // across, as it stands (how tall it prints)
  thickness: 5,
  pair: true,
};

const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

export function bookendPlan(options = {}) {
  const o = { ...BOOKEND_DEFAULTS, ...options };
  const H = Math.max(60, o.height), D = Math.max(40, o.depth), t = Math.max(3, o.thickness), W = Math.max(40, o.width);
  const B = Math.round(H * 0.45); // the back foot, under the brace
  const text = o.style === 'initials' ? cleanName(o.initials).replace(/\s+/g, '').slice(0, 3) || 'MM' : '';
  return { o, H, D, t, W, B, text };
}

export function bookendProfile(p, res = 0.25) {
  const { H, D, t, B } = p;
  const g = Grid.covering(-B - 2, -2, D + 2, H + 2, res);
  fillPolygon(g, rect(-B, 0, D, t)); // both feet
  fillPolygon(g, rect(-0.01, 0, t, H)); // the upright
  fillCircle(g, D - t / 2, t / 2, t / 2); // a round end on the foot
  const reach = H * 0.85;
  if (p.o.style === 'brace') {
    const w = t * 1.2, len = Math.hypot(B, reach), dx = (w * len) / reach, dy = (w * len) / B;
    fillPolygon(g, [[-B, t - 0.01], [-B + dx, t - 0.01], [0.01, reach - dy], [0.01, reach]]);
    fillPolygon(g, rect(-B, 0, -B + Math.max(dx, 8), t + 6)); // a stop at the end of the back foot
  } else {
    // A quarter round behind the upright.
    const web = [[0.01, t - 0.01], [0.01, reach]];
    for (let k = 0; k <= 48; k++) { const a = Math.PI / 2 + (k / 48) * (Math.PI / 2); web.push([B * Math.cos(a), t + (reach - t) * Math.sin(a)]); }
    fillPolygon(g, signedArea(web) < 0 ? web.reverse() : web);
    // The arch: the quarter round hollowed out, leaving a curved band.
    const hx = -t * 0.6, hy = t * 1.6, rx = B - t * 1.6, ry = reach - t * 2.6, hole = [];
    for (let k = 0; k <= 48; k++) { const a = Math.PI / 2 + (k / 48) * (Math.PI / 2); hole.push([hx + rx * Math.cos(a) * 0.999, hy + ry * Math.sin(a)]); }
    hole.push([hx, hy]);
    const cut = new Grid(g.width, g.height, g.x0, g.y0, res);
    fillPolygon(cut, hole);
    for (let i = 0; i < g.data.length; i++) if (cut.data[i]) g.data[i] = 0;
    if (p.text) {
      // The initials stand inside the arch on a bar from the band to the upright,
      // as big as fits where the arch is that wide.
      const units = textUnits(p.text), bar = Math.max(2.4, t * 0.7), y0 = hy + ry * 0.08;
      const room = (y) => rx * Math.sqrt(Math.max(0, 1 - ((y - hy) / ry) ** 2)) - 4; // clear width at height y
      let h = ry * 0.45;
      while (h > 6 && (units * h) / 6 > room(y0 + bar + h)) h *= 0.95;
      const tw = (units * h) / 6, cx = hx - room(y0 + bar + h) / 2 - 2;
      fillPolygon(g, rect(hx - rx - 1, y0, hx + 1, y0 + bar));
      for (const poly of textPolygons(p.text, cx - tw / 2, y0 + bar - 0.3, h, Math.max(2.4, h * 0.16))) fillPolygon(g, poly);
    }
  }
  return g;
}

export function generateBookend(options = {}) {
  const p = bookendPlan(options);
  const res = 0.25, g = bookendProfile(p, res);
  const loops = traceBinary(g).filter((l) => Math.abs(signedArea(l)) > 4 * res * res).map((l) => simplifyClosed(l, res * 0.25));
  const one = new Mesh();
  for (const q of groupLoops(loops)) one.append(extrudePolygon(q.outer, q.holes, 0, p.W));
  const parts = [{ mesh: one, name: `bookend-${p.o.style}${p.text ? '-' + p.text.toLowerCase() : ''}` }];
  if (p.o.pair) {
    const two = new Mesh();
    two.append(one);
    two.translate(0, p.H + 10, 0);
    parts.push({ mesh: two, name: 'bookend-2' });
  }
  // Standing the way it's used, for the preview: the profile upright, the width across.
  const upright = new Mesh();
  upright.append(one);
  const u = upright.positions;
  for (let i = 0; i < u.length; i += 3) { const x = u[i], y = u[i + 1], z = u[i + 2]; u[i] = z - p.W / 2; u[i + 1] = x; u[i + 2] = y; } // (x, y, z) → (z, x, y): a rotation
  const notes = [
    `${p.o.pair ? 'A pair, each' : 'One'} ${Math.round(p.H)} mm tall and ${Math.round(p.W)} mm wide, with a ${Math.round(p.D)} mm foot that slides under the books.`,
    `Prints on its side, ${Math.round(p.W)} mm tall${p.text ? ', the initials standing in the arch' : ''}. Felt pads underneath stop it sliding on a smooth shelf.`,
  ];
  return { parts, notes, plan: p, upright };
}
