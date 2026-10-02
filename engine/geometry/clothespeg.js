// Clothes pegs in one piece: a C of plastic for a spring at the back, two jaws
// that close to a pinch at the front, a V at their tips that opens them as
// you push the peg onto the line, and a notch just behind the pinch for the
// line to sit in. No metal spring, nothing to assemble. Each peg is one
// outline printed flat, a plate of them at a time, so nothing overhangs.
import { sections } from './slabs.js';

export const CLOTHESPEG_DEFAULTS = {
  length: 60,
  width: 10, // the peg, as it prints (how wide the jaws grip)
  grip: 0.6, // the gap at the pinch: smaller grips harder
  line: 3.5, // the washing line, across
  count: 6,
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const ARM = 3, R_IN = 4.5, FLARE = 8, PITCH = 20;

export function generateClothesPeg(options = {}) {
  const o = { ...CLOTHESPEG_DEFAULTS, ...options };
  const L = num(o.length, 40, 100, 60), T = num(o.width, 6, 20, 10), g = num(o.grip, 0.2, 2, 0.6) / 2, line = num(o.line, 2, 8, 3.5);
  const n = Math.round(num(o.count, 1, 12, 6)), cols = Math.min(n, 3), rows = Math.ceil(n / cols);
  // One peg along x, its spring at x = 0: the inner face of the top jaw runs from the spring (y = R_IN) to the
  // pinch (y = g) and flares out again to the tip; the outer face is ARM above it. The bottom jaw is its mirror.
  const xp = L - FLARE, inner = (x) => (x <= xp ? R_IN + ((g - R_IN) * x) / xp : g + ((2.5 - g) * (x - xp)) / FLARE);
  // The line's notch: a circle on the middle line, behind the pinch where the jaws are far enough apart that it
  // bites no more than 1.8 mm into either (never through a 3 mm jaw).
  const rl = line / 2 + 0.2, xl = Math.min(xp - 6, (xp * (R_IN - Math.max(g, rl - 1.8))) / (R_IN - g));
  const peg = (cx, cy, d) => {
    const jaw = (s) => {
      const pts = [[0, inner(0)], [xp, inner(xp)], [L, inner(L)], [L, inner(L) + ARM], [xp, inner(xp) + ARM], [0, inner(0) + ARM]];
      const q = pts.map(([x, y]) => [cx + x, cy + s * y]);
      return s > 0 ? q : q.reverse();
    };
    d.disc(cx, cy, R_IN + ARM + 0.5); // the spring
    d.on(jaw(1)); d.on(jaw(-1));
    for (const s of [-1, 1]) d.disc(cx + L, cy + s * (inner(L) + ARM / 2), ARM / 2); // round tips
    d.disc(cx, cy, R_IN, 0);
    // The gap between the jaws, from the spring to past the tips.
    d.off([[cx, cy - R_IN], [cx + xp, cy - g], [cx + L + 2, cy - inner(L) - 0.01], [cx + L + 2, cy + inner(L) + 0.01], [cx + xp, cy + g], [cx, cy + R_IN]]);
    d.disc(cx + xl, cy, rl, 0); // the line's notch
  };
  const W = cols * (L + R_IN + ARM + 6), D = rows * PITCH;
  const x0 = -W / 2 + R_IN + ARM + 1, y0 = -D / 2 + PITCH / 2;
  const mesh = sections([-W / 2 - 2, -D / 2 - 2, W / 2 + 2, D / 2 + 2], [0, 0.4, T], (z, d) => {
    for (let i = 0; i < n; i++) peg(x0 + (i % cols) * (L + R_IN + ARM + 6), y0 + Math.floor(i / cols) * PITCH, d);
  }, 0.05, 0.025);
  const notes = [
    `${n} peg${n > 1 ? 's' : ''} ${L} mm long and ${T} mm wide, closing to ${(2 * g).toFixed(1)} mm with a notch for a ${line} mm line.`,
    'Push a peg straight onto the line over the clothes: the V at the tips opens it and the C at the back springs it shut. Pull it off the same way.',
    'Print them flat (as they come), no supports. PETG or PP springs best and lasts outdoors; PLA goes brittle in the sun.',
  ];
  return { parts: [{ mesh, name: 'clothes-pegs' }], notes, preview: mesh };
}
