// Charging docks: one stand for a phone, a watch and earbuds. A base with a
// slot that holds the phone leaning back, a recess the watch's charging puck
// sits in, and a pocket for the earbuds' case; channels under the base carry
// each cable to the back, and a hole brings it up to its device. Prints on
// its base with no supports: the channels are open below, the recesses open
// above, and the phone's backrest leans back over its own foot.
import { Mesh } from './mesh.js';
import { extrudePolygon } from './polygon.js';
import { rr, sections } from './slabs.js';

export const CHARGEDOCK_DEFAULTS = {
  phoneW: 78, // across the phone (in its case)
  phoneT: 12, // its thickness, case on
  watch: true,
  puckD: 28, // the watch's charging puck
  puckH: 7,
  buds: true,
  budsW: 50, budsD: 25, // the earbuds' case, lying on its back
  angle: 15, // how far the phone leans back
  cable: 8, // the channels and holes: wide enough for the plug
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

export function chargeDockPlan(options = {}) {
  const o = { ...CHARGEDOCK_DEFAULTS, ...options };
  const pw = num(o.phoneW, 50, 110, 78), pt = num(o.phoneT, 6, 20, 12), cable = num(o.cable, 5, 14, 8);
  const watch = o.watch !== false, buds = o.buds !== false;
  const puckD = num(o.puckD, 18, 50, 28), puckH = num(o.puckH, 3, 12, 7), budsW = num(o.budsW, 30, 90, 50), budsD = num(o.budsD, 15, 60, 25);
  const side = Math.max(watch ? puckD + 16 : 0, buds ? budsW + 16 : 0);
  const phoneZone = pw + 14, W = phoneZone + (side ? side : 0), D = Math.max(90, (watch ? puckD + 14 : 0) + (buds ? budsD + 18 : 0) + 10), Hb = 18;
  const px = -W / 2 + phoneZone / 2, sx = W / 2 - side / 2;
  return { o, pw, pt, cable, watch, buds, puckD, puckH, budsW, budsD, W, D, Hb, px, sx, side, phoneZone, lean: (num(o.angle, 5, 30, 15) * Math.PI) / 180 };
}

export function generateChargeDock(options = {}) {
  const p = chargeDockPlan(options), { pw, pt, cable, watch, buds, puckD, puckH, budsW, budsD, W, D, Hb, px, sx, lean } = p;
  const chan = 6; // the channels' height, open below
  // Where each device sits on the base (its cable hole's centre).
  const phoneY = -D / 2 + 14 + pt / 2, watchY = -D / 2 + 7 + puckD / 2, budsY = D / 2 - 9 - budsD / 2;
  const spots = [[px, phoneY]];
  if (watch) spots.push([sx, watchY]);
  if (buds) spots.push([sx, budsY]);
  const cuts = [0, 0.4, chan, Hb - (watch ? puckH : 0), Hb - (buds ? 3 : 0), Hb];
  const base = sections([-W / 2, -D / 2, W / 2, D / 2], cuts, (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    d.on(rr(-W / 2 + f, -D / 2 + f, W / 2 - f, D / 2 - f, 8 - f));
    // Channels under the base, from each device straight back and out.
    if (z < chan) for (const [x, y] of spots) d.off(rr(x - cable / 2, y, x + cable / 2, D / 2 + 1, cable / 2));
    // A hole up from the channel to each device.
    for (const [x, y] of spots) d.disc(x, y, cable / 2, 0);
    if (watch && z > Hb - puckH) d.disc(sx, watchY, puckD / 2 + 0.4, 0); // the puck sits in it
    if (buds && z > Hb - 3) d.off(rr(sx - budsW / 2 - 0.5, budsY - budsD / 2 - 0.5, sx + budsW / 2 + 0.5, budsY + budsD / 2 + 0.5, Math.min(8, budsD / 2)));
  }, 0.2);
  // The phone's stand, as a side profile (u along the depth, v up) run across
  // its width: a front lip, the slot leaning back, a backrest whose back face
  // slopes in over its own foot, so nothing overhangs.
  const run = (h) => h * Math.tan(lean), back = 55, lip = 8;
  const y0 = phoneY - pt / 2 - 4, yA = phoneY - pt / 2, yB = phoneY + pt / 2;
  const profile = [[y0, 0], [yB + run(back) + 10, 0], [yB + run(back) + 4, back], [yB + run(back), back], [yB, 0.01], [yA, 0.01], [yA, lip], [y0, lip]];
  const stand = extrudePolygon(profile, [], -pw / 2 - 5, pw / 2 + 5);
  const q = stand.positions;
  for (let i = 0; i < q.length; i += 3) { const u = q[i], v = q[i + 1], w = q[i + 2]; q[i] = w + px; q[i + 1] = u; q[i + 2] = v + Hb; } // (u, v, w) → (w, u, v): a rotation
  // The slot's floor has the cable hole: the stand's foot is open there.
  const mesh = new Mesh();
  mesh.append(base); mesh.append(stand);
  const notes = [
    `A dock ${Math.round(W)} × ${Math.round(D)} mm for a phone ${pw} mm across and ${pt} mm thick${watch ? `, a watch puck ${puckD} mm across` : ''}${buds ? `, and an earbuds case ${budsW} × ${budsD} mm` : ''}. The phone leans back ${Math.round((lean * 180) / Math.PI)}°.`,
    `Thread each cable through its channel underneath and up through its hole before you stand the dock up. Prints on its base, no supports.`,
  ];
  return { parts: [{ mesh, name: 'charging-dock' }], notes, plan: p };
}
