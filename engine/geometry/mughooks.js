// Under-shelf mug hooks: a clip that slides onto a cupboard shelf from the
// front, no screws, with hooks hanging under the shelf for mugs and cups.
// The clip is a C over the shelf's edge (an arm on top with a small bump
// that grips, the spine at the front, an arm underneath), and J hooks hang
// from the lower arm one behind another. It's a side profile drawn as slabs
// across its width and printed on its side, so every curve is in the plane
// of the bed and nothing overhangs.
import { Mesh } from './mesh.js';
import { rr, sections } from './slabs.js';

export const MUGHOOKS_DEFAULTS = {
  shelf: 18, // the shelf's thickness
  hooks: 3, // one behind another, into the cupboard
  pitch: 70, // between hooks: a mug's width plus a little
  drop: 30, // how far a hook hangs below the shelf
  opening: 22, // the hook's mouth: a mug handle's thickness, and some
  width: 12, // across the clip
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const T = 3.2, BAR = 4.5, TIP = 9;

export function mugHooksPlan(options = {}) {
  const o = { ...MUGHOOKS_DEFAULTS, ...options };
  const shelf = num(o.shelf, 10, 40, 18), n = Math.round(num(o.hooks, 1, 5, 3)), open = num(o.opening, 10, 40, 22);
  const pitch = Math.max(num(o.pitch, 40, 120, 70), open + BAR + 12); // room for the next hook's mouth
  const drop = num(o.drop, 15, 80, 30), W = num(o.width, 6, 30, 12);
  const gapV = shelf + 0.4; // the slot the shelf slides into, a little loose
  const first = 14 + open; // the first hook behind the front edge, its mouth facing the front
  const L = first + (n - 1) * pitch + 12; // the arms' length into the cupboard
  return { shelf, n, pitch, drop, open, W, gapV, first, L };
}

export function generateMugHooks(options = {}) {
  const p = mugHooksPlan(options), { n, pitch, drop, open, W, gapV, first, L } = p;
  if (L > 240) throw new Error(`${n} hooks ${pitch} mm apart make a clip ${Math.ceil(L)} mm long: more than a 250 mm bed. Fewer hooks, or two clips.`);
  // In the profile: u into the cupboard from the shelf's front edge, v up from the shelf's underside.
  const hookU = Array.from({ length: n }, (_, i) => first + i * pitch); // each hook's stem
  const mesh = sections([-T - 2, -T - drop - BAR - 2, L + 2, gapV + T + 2], [0, 0.4, W - 0.4, W], (w, d) => {
    d.on(rr(-T, gapV, L, gapV + T, 1.5)); // the arm on top
    d.on(rr(L - 10, gapV - 1.2, L, gapV + 0.5, 0.6)); // its bump that grips the shelf
    d.on(rr(-T, -T, 0.01, gapV + T, 1.5)); // the spine over the front edge
    d.on(rr(-T, -T, L, 0, 1.5)); // the arm underneath
    for (const u of hookU) {
      const b = -T - drop; // the hook's bottom bar's top
      d.on(rr(u, b, u + BAR, -T + 0.01, 1)); // the stem down
      d.on(rr(u - open, b - BAR, u + BAR, b, BAR / 2)); // the bar the handle rests on
      d.on(rr(u - open, b - BAR, u - open + BAR, b + TIP, BAR / 2)); // the tip, turned up
      d.on([[u, -T + 0.01], [u - 6, -T + 0.01], [u, -T - 6]]); // a fillet where the stem meets the arm
    }
  }, 0.08, 0.05);
  const notes = [
    `${n} hook${n > 1 ? 's' : ''} ${pitch} mm apart under a shelf ${p.shelf} mm thick. Each hangs ${drop} mm below the shelf with a ${open} mm mouth for a mug's handle.`,
    'Slide it onto the shelf from the front: the bump on the top arm holds it. Two or three clips side by side make a row.',
    'Print it on its side (as it comes), no supports. PETG gives a little more spring than PLA.',
  ];
  // Under the shelf, as it hangs: (u, v, w) → (w, u, v), a rotation (the axes taken round in turn).
  const preview = new Mesh(); preview.append(mesh);
  const q = preview.positions;
  for (let i = 0; i < q.length; i += 3) { const u = q[i], v = q[i + 1], w = q[i + 2]; q[i] = w - W / 2; q[i + 1] = u; q[i + 2] = v; }
  return { parts: [{ mesh, name: 'mug-hooks' }], notes, preview };
}
