// Hallway hooks for umbrellas and dog leads: a strip for the wall by the door
// with hooks along it (big ones for umbrellas, smaller ones for leads and
// keys) and, if you like, a peg a roll of dog-poo bags slides onto. It prints
// flat on its back: each hook rises straight up from the strip, and its tip
// turns up (on the wall) at 45°, so nothing needs support. The screw holes go
// straight down through the strip, countersunk.
import { Mesh } from './mesh.js';
import { rr, sections } from './slabs.js';

export const HALLHOOKS_DEFAULTS = {
  umbrellas: 2,
  leads: 2,
  bagRoll: true,
  length: 220, // the strip, along the wall
  thick: 5,
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const H = 50, R = 2.25, HEAD = 4.25; // the strip's height on the wall; 4 mm screws and their heads
const KINDS = { umbrella: { w: 14, h: 12, reach: 55, tip: 16 }, lead: { w: 12, h: 10, reach: 38, tip: 12 } };

export function hallHooksPlan(options = {}) {
  const o = { ...HALLHOOKS_DEFAULTS, ...options };
  const nu = Math.round(num(o.umbrellas, 0, 6, 2)), nl = Math.round(num(o.leads, 0, 8, 2)), bag = o.bagRoll === true || o.bagRoll === 'true' || o.bagRoll === undefined;
  const L = num(o.length, 80, 240, 220), t = num(o.thick, 3, 8, 5);
  const items = [...Array(nu).fill('umbrella'), ...Array(nl).fill('lead'), ...(bag ? ['bag'] : [])];
  if (!items.length) items.push('lead');
  const pitch = L / items.length;
  return { L, t, items, pitch, at: items.map((k, i) => ({ kind: k, x: -L / 2 + pitch * (i + 0.5) })) };
}

export function generateHallHooks(options = {}) {
  const p = hallHooksPlan(options), { L, t, at, pitch } = p;
  const narrow = at.find((a) => a.kind !== 'bag' && pitch < KINDS[a.kind].w + 6) || (at.some((a) => a.kind === 'bag') && pitch < 30);
  if (narrow) throw new Error(`${at.length} hooks don't fit along ${L} mm: fewer hooks, or a longer strip.`);
  // Plan: x along the wall, y up the wall (0 at the strip's middle); z out from the wall, the way it prints.
  const screws = [-L / 2 + 10, L / 2 - 10].map((x) => [x, 0]);
  const bagZ = t + 62, reachMax = Math.max(...at.map((a) => (a.kind === 'bag' ? bagZ + 6 : t + KINDS[a.kind].reach)));
  const cuts = [0, 0.4, t, t - 2.5, bagZ, bagZ + 6, reachMax];
  for (const a of at) if (a.kind !== 'bag') { const k = KINDS[a.kind]; for (let z = t + k.reach - k.tip; z <= t + k.reach; z += 1) cuts.push(z); }
  for (let z = bagZ; z <= bagZ + 6; z += 1) cuts.push(z);
  for (let z = t - 2.5; z <= t; z += 0.5) cuts.push(z);
  const mesh = sections([-L / 2 - 1, -H / 2 - 30, L / 2 + 1, H / 2 + 30], cuts, (z, d) => {
    const f = z < 0.4 ? 0.4 : 0; // the bed face steps in
    if (z < t) {
      d.on(rr(-L / 2 + f, -H / 2 + f, L / 2 - f, H / 2 - f, 6)); // the strip
      // Screw holes: straight through, then countersunk (wider as it rises: no overhang).
      const cs = z > t - 2.5 ? R + (HEAD - R) * ((z - (t - 2.5)) / 2.5) : R;
      for (const [x, y] of screws) d.disc(x, y, cs, 0);
      return;
    }
    for (const a of at) {
      if (a.kind === 'bag') {
        // A round peg for the roll, ending in a lip that grows at 45° so the roll stays on.
        if (z < bagZ) d.disc(a.x, 4, 7);
        else if (z < bagZ + 6) d.disc(a.x, 4, 7 + (z - bagZ));
        continue;
      }
      const k = KINDS[a.kind];
      if (z > t + k.reach) continue;
      const up = Math.max(0, z - (t + k.reach - k.tip)); // the tip turning up, 1 mm for every 1 mm out
      d.on(rr(a.x - k.w / 2, -H / 2 + 6, a.x + k.w / 2, -H / 2 + 6 + k.h + up, 2));
    }
  }, 0.15, 0.1);
  const n = (kind) => at.filter((a) => a.kind === kind).length;
  const notes = [
    `${n('umbrella')} umbrella hook${n('umbrella') === 1 ? '' : 's'}, ${n('lead')} for leads${n('bag') ? ' and a peg for a roll of poo bags' : ''} on a strip ${L} mm long. Two 4 mm countersunk screws.`,
    'Hang an umbrella by its handle, a lead by its loop. The bag roll slides onto its peg over the lip.',
    'Print it flat on its back (as it comes), no supports.',
  ];
  // On the wall, facing the room: (x, y, z) → (x, −z, y), a rotation.
  const preview = new Mesh(); preview.append(mesh);
  const q = preview.positions;
  for (let i = 0; i < q.length; i += 3) { const y = q[i + 1], z = q[i + 2]; q[i + 1] = -z; q[i + 2] = y; }
  return { parts: [{ mesh, name: 'hall-hooks' }], notes, preview };
}
