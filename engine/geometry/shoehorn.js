// Shoe horns and boot hooks: a long shoe horn, and a plate for the wall by the
// door with a peg it hangs on and a pair of long pegs for each pair of boots
// (upside down, to dry). The horn's cross-section is an arc, the same all
// along but narrowing toward the handle, so it prints standing on its end
// with the arc flat on the bed: it only ever gets smaller as it rises. Its
// hanging hole goes across the print, so it's a diamond. The plate prints flat
// on its back, the pegs rising straight up with their tips turned up at 45°.
import { Mesh } from './mesh.js';
import { rr, sections } from './slabs.js';

export const SHOEHORN_DEFAULTS = {
  length: 220, // the shoe horn
  width: 45, // its mouth, across
  bootPairs: 2,
  thick: 5, // the plate
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const T = 2.6, R = 2.25, HEAD = 4.25, PH = 40; // horn thickness; screws; the plate's height

// An arc of the horn's cross-section, `span` radians wide, centred on +y, at radius rc.
function arc(rc, span) {
  const n = 24, out = [], inn = [];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI / 2 - span / 2 + (span * i) / n;
    out.push([(rc + T / 2) * Math.cos(a), (rc + T / 2) * Math.sin(a)]);
    inn.push([(rc - T / 2) * Math.cos(a), (rc - T / 2) * Math.sin(a)]);
  }
  return [...out, ...inn.reverse()];
}

function horn(L, mouth) {
  const rc = mouth / 1.6; // the arc's radius: a mouth of this width spans about 105°
  const wide = 2 * Math.asin(Math.min(0.99, mouth / 2 / rc)), handle = wide * 0.4;
  const t0 = L * 0.55, t1 = L - 55, zh = L - 14; // the taper, and the hanging hole
  const span = (z) => (z < t0 ? wide : z > t1 ? handle : wide + ((handle - wide) * (z - t0)) / (t1 - t0));
  const cuts = [0, L];
  for (let z = t0; z <= t1; z += 2) cuts.push(z);
  for (let z = zh - 4; z <= zh + 4; z += 0.5) cuts.push(z);
  return sections([-rc - 5, -5, rc + 5, rc + 5], cuts, (z, d) => {
    d.on(arc(rc, span(z)));
    if (Math.abs(z - zh) < 4) { const r = 4 - Math.abs(z - zh); d.off(rr(-r, rc - T, r, rc + T)); } // the diamond hanging hole
  }, 0.08, 0.05);
}

function plate(pairs, t) {
  // Left to right: the horn's peg, then a pair of long pegs for each pair of boots.
  const W = 40 + pairs * 80 + 10;
  const pegs = [{ x: -W / 2 + 20, reach: 28, w: 8, h: 8, tip: 6 }];
  for (let i = 0; i < pairs; i++) { const c = -W / 2 + 40 + 40 + i * 80; for (const s of [-1, 1]) pegs.push({ x: c + s * 18, reach: 110, w: 14, h: 12, tip: 14 }); }
  const screws = [-W / 2 + 9, W / 2 - 9];
  const cuts = [0, 0.4, t, t - 2.5];
  for (const p of pegs) for (let z = t + p.reach - p.tip; z <= t + p.reach; z += 1) cuts.push(z);
  for (let z = t - 2.5; z <= t; z += 0.5) cuts.push(z);
  const mesh = sections([-W / 2 - 1, -PH / 2 - 20, W / 2 + 1, PH / 2 + 20], cuts, (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    if (z < t) {
      d.on(rr(-W / 2 + f, -PH / 2 + f, W / 2 - f, PH / 2 - f, 6));
      const cs = z > t - 2.5 ? R + (HEAD - R) * ((z - (t - 2.5)) / 2.5) : R;
      for (const x of screws) d.disc(x, 0, cs, 0);
      return;
    }
    for (const p of pegs) {
      if (z > t + p.reach) continue;
      const up = Math.max(0, z - (t + p.reach - p.tip));
      d.on(rr(p.x - p.w / 2, -PH / 2 + 5, p.x + p.w / 2, -PH / 2 + 5 + p.h + up, 2));
    }
  }, 0.15, 0.1);
  return { mesh, W };
}

export function generateShoeHorn(options = {}) {
  const o = { ...SHOEHORN_DEFAULTS, ...options };
  const L = num(o.length, 120, 240, 220), mouth = num(o.width, 35, 60, 45), pairs = Math.round(num(o.bootPairs, 0, 2, 2)), t = num(o.thick, 3, 8, 5);
  const h = horn(L, mouth), pl = plate(pairs, t);
  if (pl.W > 250) throw new Error('That plate is wider than a 250 mm bed: fewer pairs of boots.');
  // Preview: the plate on the wall facing the room, the horn hanging from its peg.
  const preview = new Mesh();
  const p = new Mesh(); p.append(pl.mesh);
  for (let i = 0; i < p.positions.length; i += 3) { const y = p.positions[i + 1], z = p.positions[i + 2]; p.positions[i + 1] = -z; p.positions[i + 2] = y; }
  preview.append(p);
  const hm = new Mesh(); hm.append(h);
  // The horn hung from its peg by its hole, mouth down: (x, y, z) → (−x, −y, z) moved into place, a half turn about the vertical.
  const hx = -pl.W / 2 + 20, top = -PH / 2 + 5;
  for (let i = 0; i < hm.positions.length; i += 3) {
    const x = hm.positions[i], y = hm.positions[i + 1], z = hm.positions[i + 2];
    hm.positions[i] = hx - x; hm.positions[i + 1] = -(t + 12) - y; hm.positions[i + 2] = top - (L - 14) + z;
  }
  preview.append(hm);
  const notes = [
    `A shoe horn ${L} mm long with a ${mouth} mm mouth, and a plate ${Math.round(pl.W)} mm wide with a peg for it${pairs ? ` and ${pairs} pair${pairs > 1 ? 's' : ''} of boot pegs (boots upside down, to dry)` : ''}. Two 4 mm countersunk screws.`,
    'Print the horn standing on its end and the plate flat on its back (as they come), no supports. PETG gives the horn a little spring.',
  ];
  return { parts: [{ mesh: h, name: 'shoe-horn' }, { mesh: pl.mesh, name: 'boot-and-horn-hooks' }], notes, preview };
}
