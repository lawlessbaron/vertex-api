// Wall racks for game controllers and a headset. The rack comes as modules
// that screw up side by side: a controller cradle (two prongs that hold the
// pad between its grips, each turned up at the tip), a headset hook (a wide
// rounded arm with a lip) and a cable shelf (a ledge with a lip for the
// charging lead or a dongle). Every module is a side profile drawn as slabs
// across its width and prints lying on its side, so nothing overhangs and the
// prongs are strong the way they're loaded. Screw slots are square (they run
// sideways through the print) and sit where the pad or the arm hides them.
import { Mesh } from './mesh.js';
import { rr, sections } from './slabs.js';

export const CONTROLLERRACK_DEFAULTS = {
  controllers: 2, // cradles, one module each
  gap: 44, // between the prongs (inside to inside): the pad sits on them between its grips
  prongW: 12,
  reach: 42, // how far the prongs come out
  tip: 8, // how far each tip turns up
  headset: true,
  headsetW: 40, // the arm the headband rests on
  headsetReach: 60,
  shelf: false,
  shelfD: 30,
  height: 60, // each module's wall plate
  thick: 5,
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

export function controllerRackPlan(options = {}) {
  const o = { ...CONTROLLERRACK_DEFAULTS, ...options };
  const p = {
    o, n: Math.round(num(o.controllers, 0, 4, 2)), gap: num(o.gap, 25, 90, 44), pw: num(o.prongW, 8, 20, 12), reach: num(o.reach, 25, 80, 42), tip: num(o.tip, 3, 20, 8),
    headset: o.headset !== false && o.headset !== 'false', hw: num(o.headsetW, 20, 70, 40), hr: num(o.headsetReach, 35, 100, 60),
    shelf: o.shelf === true || o.shelf === 'true', sd: num(o.shelfD, 15, 60, 30), H: num(o.height, 40, 120, 60), t: num(o.thick, 3, 8, 5),
  };
  if (!p.n && !p.headset && !p.shelf) p.n = 1; // always something to print
  p.cw = Math.max(p.gap + 2 * p.pw + 30, 80); // a cradle module's width
  return p;
}

const R = 2.25; // the screw slots' half width: 4 mm wood screws
const AT = 7; // the arms' thickness

// One module in (u out from the wall, v up, w across), w = 0 on the bed.
function moduleMesh(kind, p) {
  const { t, H } = p;
  const W = kind === 'cradle' ? p.cw : kind === 'headset' ? p.hw + 24 : 80;
  const mid = W / 2, vA = H - AT; // the arms sit at the top of the plate
  // Where the screws go (w, v), and the zones across the width that hold an arm.
  let screws, arms;
  if (kind === 'cradle') {
    const a = mid - p.gap / 2 - p.pw, b = mid + p.gap / 2;
    arms = [[a, a + p.pw], [b, b + p.pw]];
    screws = [[mid, 12], [mid, H - 14]]; // between the prongs: the pad hides them
  } else if (kind === 'headset') {
    arms = [[12, 12 + p.hw]];
    screws = [[6, H / 2], [W - 6, H / 2]];
  } else {
    arms = [];
    screws = [[W / 4, H - 12], [(3 * W) / 4, H - 12]];
  }
  const cuts = [0, 0.4, W - 0.4, W];
  for (const [x0, x1] of arms) cuts.push(x0, x1);
  for (const [w] of screws) cuts.push(w - R, w + R);
  const reach = kind === 'headset' ? p.hr : p.reach;
  const mesh = sections([-1, -1, Math.max(reach, p.sd) + 2, H + p.tip + 6], cuts, (w, d) => {
    const f = w < 0.4 || w > W - 0.4 ? 0.4 : 0; // the bed face steps in: no elephant's foot
    d.on(rr(0, f, t, H - f, 3)); // the wall plate
    for (const [x0, x1] of arms) {
      if (w < x0 || w > x1) continue;
      const lip = kind === 'headset' ? 12 : p.tip;
      d.on(rr(0, vA + f, reach, H - f, AT / 2)); // the arm
      d.on(rr(reach - AT, vA + f, reach - f, H + lip - AT + f, AT / 2)); // the tip, turned up
      d.on([[t - 0.1, vA - 16], [t + 16, vA + 0.1], [t - 0.1, vA + 0.1]]); // a 45° brace under it
      if (kind === 'headset') d.on(rr(0, vA - 3, reach - AT, H - f, AT)); // a thicker, rounder rest for the headband
    }
    if (kind === 'shelf') {
      d.on(rr(0, f, p.sd, 4 - f, 2)); // the ledge
      d.on(rr(p.sd - 3, f, p.sd - f, 14, 1.5)); // its lip
      d.on([[t - 0.1, 4 + 10], [t + 10, 3.9], [t - 0.1, 3.9]]); // a brace under the plate's foot, inside
    }
    for (const [sw, sv] of screws) if (Math.abs(w - sw) < R) d.off(rr(-1, sv - R, t + 1, sv + R));
  }, 0.12);
  return { mesh, W };
}

export function generateControllerRack(options = {}) {
  const p = controllerRackPlan(options);
  const kinds = [...Array(p.n).fill('cradle'), ...(p.headset ? ['headset'] : []), ...(p.shelf ? ['shelf'] : [])];
  const parts = [], preview = new Mesh();
  let x = 0, px = 0;
  kinds.forEach((k, i) => {
    const { mesh, W } = moduleMesh(k, p);
    const name = k === 'cradle' ? `controller-cradle-${kinds.slice(0, i + 1).filter((q) => q === 'cradle').length}` : k === 'headset' ? 'headset-hook' : 'cable-shelf';
    // As it prints: on its side, laid out in a row on the bed.
    const m = new Mesh(); m.append(mesh); m.translate(x, 0, 0);
    parts.push({ mesh: m, name });
    x += Math.max(p.reach, p.hr, p.sd) + 12;
    // On the wall: (u, v, w) → (W − w, −u, v), a rotation; the wall is y = 0, the rack in front (−y), side by side along x.
    const v = new Mesh(); v.append(mesh);
    const q = v.positions;
    for (let j = 0; j < q.length; j += 3) { const u = q[j], vv = q[j + 1], w = q[j + 2]; q[j] = px + W - w; q[j + 1] = -u; q[j + 2] = vv; }
    preview.append(v);
    px += W + 4;
  });
  const total = Math.round(px - 4);
  const notes = [
    `${kinds.length} module${kinds.length > 1 ? 's' : ''}${p.n ? `: ${p.n} controller cradle${p.n > 1 ? 's' : ''} (prongs ${p.gap} mm apart)` : ''}${p.headset ? `${p.n ? ',' : ':'} a headset hook` : ''}${p.shelf ? ', a cable shelf' : ''}. ${total} mm along the wall, 2 screws each (4 mm, with wall plugs on plasterboard).`,
    'Print each on its side (as they come), no supports. Screw them up in a row about 4 mm apart.',
  ];
  return { parts, notes, plan: p, preview };
}
