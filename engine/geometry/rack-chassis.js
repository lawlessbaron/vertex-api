// A PC inside the rack (Epic 1, phase 1J, spec rule 8): a horizontal Mini-ITX chassis at the bottom of a framed
// rack, 3U or 4U. The board lies flat at the back (its I/O through the back wall), the power supply in front of
// it (its face through the front wall), and the graphics card lies flat above them both, its bracket through the
// back wall and its far end on support posts. An 80 mm intake fan in the front wall beside the supply.
//
// One part in print orientation (floor down): the front wall, which bolts to the front rails like a panel; the
// floor, which rests on the bottom end frame; and the back wall, inside the back rails. Deeper than a bed, it
// prints as a front and a back half that bolt together at a lap joint in the floor.
//
// Sizes and fit come from rack-spec.js (BOARDS, PSUS, GPUS, CHASSIS, chassisFit): it never draws a chassis that
// can't hold its parts with 2 mm all round. Mini-ITX holes: the ATX pattern's ITX subset, from the board's rear
// left corner (I/O edge at the back), 6.35 mm standoffs.
import { Mesh } from './mesh.js';
import { rr, sections } from './slabs.js';
import { BOARDS, PSUS, GPUS, CHASSIS, chassisFit, normalizeRackSpec } from './rack-spec.js';

export const ITX_HOLES = [[6.35, 10.16], [163.83, 33.02], [6.35, 165.1], [163.83, 165.1]];
const T = 4, IO = { w: 158.75, h: 44.45 }, FAN = 80, LAP = 15, BED = 250;
const SFX_SCREWS = (w, h) => [[6, 6], [w - 6, 6], [6, h - 6], [w - 6, h - 6]]; // the supply's face screws (#6-32), from its lower left

/** The chassis settings, cleaned: none unless framed and asked for. */
export function chassisOptions(o = {}, framed = true) {
  const chassis = framed && CHASSIS[o.chassis] ? o.chassis : 'none';
  if (chassis === 'none') return { chassis: 'none', gpu: 'none', psu: null };
  const c = CHASSIS[chassis];
  return { chassis, gpu: GPUS[o.gpu] !== undefined ? o.gpu : 'standard', psu: c.psu.includes(o.psu) ? o.psu : c.psu[0] };
}

/**
 * The chassis' layout for a rack: where the board, supply, card, fan and posts go, in the part's own frame
 * (x across, centred; y depth from the front wall's face; z up from the floor's underside). Null if it won't fit.
 * g: { ex (half the rails' clear opening), hx (rail holes' x), hw (a front panel's half width), D, rt (rail face) }.
 */
export function chassisLayout(o, g) {
  const spec = normalizeRackSpec({ chassis: o.chassis, gpu: o.gpu, psu: o.psu, depth: g.D, units: CHASSIS[o.chassis]?.units, strength: o.strength, filament: o.filament });
  const fit = chassisFit(spec);
  if (!fit.ok) return { ok: false, problems: fit.problems };
  const c = CHASSIS[o.chassis], board = BOARDS[c.board], psu = PSUS[spec.psu], gpu = GPUS[spec.gpu];
  const U = c.units, H = U * 44.45 - 0.8, xi = g.ex - 1, Dc = g.D - g.rt + 3; // inside half width; the back wall's back face
  if (c.dock) {
    // The GPU dock: its board flat on a pad at the back right, the card standing in it with its bracket through
    // the back wall, the supply at the front left beside the card, the fan in front of the card.
    const bx1 = xi - 2, by1 = Dc - T - 2, bx0 = bx1 - board.w, by0 = by1 - board.d;
    const card = { x1: xi - 8, x0: xi - 8 - gpu.t, y1: Dc - T, y0: Dc - T - gpu.l, z0: T + board.standoff + board.pcb + board.slot, z1: T + board.standoff + board.pcb + board.slot + gpu.h };
    const px0 = -xi + 2, py0 = T + 1;
    const fanX = (px0 + psu.w + 4 + xi - 2) / 2; // between the supply and the side, blowing along the card
    // Slots for the dock's screws (any hole pattern over the pad), along the front and back of its footprint.
    const slots = [by0 + 10, by1 - 10].flatMap((y) => [[bx0 + 10, bx0 + 70, y], [bx1 - 70, bx1 - 10, y]]);
    return {
      ok: true, dock: true, spec, fit, U, H, xi, Dc, board: { x0: bx0, y0: by0, x1: bx1, y1: by1, holes: [], slots },
      psu: { x0: px0, y0: py0, x1: px0 + psu.w, y1: py0 + psu.d, h: psu.h, name: psu.name }, card, gpu,
      posts: [[(card.x0 + card.x1) / 2, card.y0 + 20]], postTop: card.z0 + 8,
      fan: fanX + FAN / 2 + 2 <= xi && fanX - FAN / 2 - 2 >= px0 + psu.w ? { x: fanX, z: T + 2 + FAN / 2 + 8 } : null,
      io: { x0: bx0 + 12, x1: bx0 + 62, z0: T + 2, z1: T + 30 }, // the OCuLink cable (and the dock's power) out the back
      split: Dc > BED, cut: Dc / 2,
    };
  }
  const bx0 = -xi + 2, by1 = Dc - T - 2, by0 = by1 - board.d; // the board: left, against the back
  const px0 = -xi + 2, py0 = T + 1; // the supply: left, its face in the front wall
  const card = gpu ? { x0: xi - 2 - gpu.h, x1: xi - 2, y0: Dc - T - gpu.l, y1: Dc - T, z0: H - 2 - gpu.t, z1: H - 2 } : null;
  const fanX = (px0 + psu.w + 4 + xi - 2) / 2;
  const posts = card ? [card.y0 + 15, ...(gpu.l > 220 ? [(card.y0 + card.y1) / 2] : [])].flatMap((y) => [[card.x0 + 8, y], [card.x1 - 8, y]]) : [];
  return {
    ok: true, spec, fit, U, H, xi, Dc, board: { x0: bx0, y0: by0, x1: bx0 + board.w, y1: by1, holes: ITX_HOLES.map(([hx, hy]) => [bx0 + hx, by1 - hy]) },
    psu: { x0: px0, y0: py0, x1: px0 + psu.w, y1: py0 + psu.d, h: psu.h, name: psu.name }, card, gpu, posts,
    fan: fanX + FAN / 2 + 2 <= xi && fanX - FAN / 2 - 2 >= px0 + psu.w ? { x: fanX, z: Math.min(H / 2, T + 2 + FAN / 2 + 6) } : null,
    io: { x0: bx0 + 6, x1: bx0 + 6 + IO.w, z0: T + 6.35 + 1.6 - 2, z1: T + 6.35 + 1.6 - 2 + IO.h },
    split: Dc > BED, cut: Dc / 2,
  };
}

/**
 * The chassis' parts and preview. fastening: 'nuts' | 'inserts' (the standoffs follow it). Returns { parts: [{ mesh, name }], preview, notes, L }.
 */
export function rackChassis(o, g, { fastening = 'nuts' } = {}) {
  const L = chassisLayout(o, g);
  if (!L.ok) return { parts: [], preview: new Mesh(), notes: L.problems.map((q) => `PC chassis: ${q.reason} ${q.fix}`), L };
  const { H, xi, Dc, board, psu, card, posts, fan, io } = L, hw = g.hw;
  const halves = L.split ? [['front', -1, L.cut + LAP], ['back', L.cut - LAP, Dc + 1]] : [['', -1, Dc + 1]];
  const parts = [], preview = new Mesh();
  const postTop = L.dock ? L.postTop : card ? card.z0 : 0;
  for (const [name, ya, yb] of halves) {
    const inHalf = (y) => !L.split || (name === 'front' ? y < L.cut - LAP : y >= L.cut - LAP); // across the lap, the back half's (upper) layer carries it
    const cuts = [0, 2, T, T + 6.35, ...(card ? [postTop - 3, postTop] : []), H - 2, H];
    const m = sections([-hw, Math.max(0, ya), hw, Math.min(Dc, yb)], [...new Set(cuts)].filter((z) => z <= H).sort((a, b) => a - b), (z, d) => {
      // The floor (with the lap: the front half's lower layer, the back half's upper, across the seam).
      if (z < T) {
        const lo = z < 2;
        let y0 = T, y1 = Dc - T;
        if (L.split) { if (name === 'front') y1 = lo ? L.cut + LAP : L.cut - LAP; else y0 = lo ? L.cut + LAP : L.cut - LAP; }
        d.on(rr(-xi, y0, xi, y1, 2));
        if (L.split) for (const x of [-xi + 20, -xi / 3, xi / 3, xi - 20]) d.disc(x, L.cut, 1.7, 0); // the lap's M3 bolts
        if (fastening !== 'inserts') for (const [x, y] of board.holes) { d.disc(x, y, 1.7, 0); if (z < 2.8) d.disc(x, y, 3.2, 0); } // nuts: the screw's hole, and a trap from below
        if (L.dock) for (const [x0, x1, y] of board.slots) if (inHalf(y)) { d.off(rr(x0, y - 1.7, x1, y + 1.7, 1.7)); if (z < 2.8) d.off(rr(x0 - 1.5, y - 3.2, x1 + 1.5, y + 3.2, 3)); } // slotted M3, the nut slides in the slot from below
      }
      // The standoffs: 7 mm posts, 6.35 tall; a heat-set insert's bore, or the screw's hole to its nut.
      if (z >= T && z < T + 6.35) for (const [x, y] of board.holes) if (inHalf(y)) { d.disc(x, y, 3.5); d.disc(x, y, fastening === 'inserts' ? 2 : 1.7, 0); }
      // The card's support posts, with a lip to keep it from walking.
      if (card && !L.dock && z >= T && z < postTop) for (const [x, y] of posts) if (inHalf(y)) { d.on(rr(x - 5, y - 5, x + 5, y + 5, 1.5)); if (z > postTop - 3) d.off(rr(x - 5.5 + (x < 0 ? 3 : 0), y - 6, x + 5.5 - (x > 0 ? 3 : 0), y + 6)); }
      // The dock's card stand: a post under the card's far end with a U the card's lower edge drops into, so it can't sag or lean.
      if (L.dock && z >= T && z < postTop) for (const [x, y] of posts) if (inHalf(y)) { d.on(rr(card.x0 - 6, y - 6, card.x1 + 6, y + 6, 2)); if (z > postTop - 8) d.off(rr(card.x0 - 0.75, y - 7, card.x1 + 0.75, y + 7)); }
      // The front wall: ears to the rails (slotted M6, like a panel), the supply's face and its screws, the fan.
      if (name !== 'back') {
        d.on(rr(-hw, 0, hw, T, 1));
        for (let k = 0; k < L.U; k++) for (const hy of [6.35, 38.1]) { const zz = k * 44.45 + hy - 0.4; if (Math.abs(z - zz) < 4) for (const s of [-1, 1]) d.off(rr(s * g.hx - 3.3, -1, s * g.hx + 3.3, T + 1, 1)); }
        if (z > T + 12 && z < T + psu.h - 10) d.off(rr(psu.x0 + 12, -1, psu.x1 - 12, T + 1)); // a window for its plug, switch and fan, inside its screws
        for (const [sx, sz] of SFX_SCREWS(psu.x1 - psu.x0, psu.h)) if (Math.abs(z - (T + 0.5 + sz)) < 1.8) d.off(rr(psu.x0 + sx - 1.8, -1, psu.x0 + sx + 1.8, T + 1));
        if (fan && Math.abs(z - fan.z) < FAN / 2 - 2) { const r = FAN / 2 - 2, w = Math.sqrt(Math.max(0, r * r - (z - fan.z) ** 2)); d.off(rr(fan.x - w, -1, fan.x + w, T + 1)); }
        if (fan) for (const sx of [-1, 1]) for (const sz of [-1, 1]) if (Math.abs(z - (fan.z + sz * 35.75)) < 1.7) d.off(rr(fan.x + sx * 35.75 - 1.7, -1, fan.x + sx * 35.75 + 1.7, T + 1)); // its four screws (71.5 mm apart)
        // Gussets: the wall to the floor, at both sides.
        if (z >= T && z < T + 12) for (const x of [-xi, xi - 3]) d.on([[x, T - 0.01], [x + 3, T - 0.01], [x + 3, T + 12 - (z - T)], [x, T + 12 - (z - T)]]);
      }
      // The back wall: inside the back rails; the board's I/O shield and the card's bracket open through it.
      if (name !== 'front' && z < H - 2) {
        d.on(rr(-xi, Dc - T, xi, Dc, 1));
        if (z > io.z0 && z < io.z1) d.off(rr(io.x0, Dc - T - 1, io.x1, Dc + 1));
        if (card && !L.dock && z > card.z0 - 1 && z < card.z1) d.off(rr(card.x0 + 4, Dc - T - 1, card.x1 - 4, Dc + 1));
        if (card && L.dock && z > card.z0 - 2 && z < card.z1 + 1) d.off(rr(card.x0 - 4, Dc - T - 1, card.x1 + 4, Dc + 1)); // the upright card's bracket and ports
        if (z >= T && z < T + 12) for (const x of [-xi, xi - 3]) d.on([[x, Dc - T + 0.01], [x + 3, Dc - T + 0.01], [x + 3, Dc - T - 12 + (z - T)], [x, Dc - T - 12 + (z - T)]]);
      }
    }, 0.2, 0.12);
    parts.push({ mesh: m, name: `pc-chassis${name ? `-${name}` : ''}` });
    preview.append(m);
  }
  const g2 = L.gpu;
  if (L.dock) return { parts, preview, L, notes: [
    `GPU dock bay (${CHASSIS[o.chassis].name}): an OCuLink dock's board on a slotted pad at the back (M3 screws anywhere over ${BOARDS.dock.w} × ${BOARDS.dock.d} mm), a ${g2.name.toLowerCase()} card (${g2.l} mm) standing upright in it with its bracket and ports through the back wall and its far end in a stand, ${/^[AEFHILMNORSX]/.test(psu.name) ? 'an' : 'a'} ${psu.name} supply beside it with its face and plug through the front wall${fan ? ', and an 80 mm intake fan in front of the card' : ''}.`,
    `Wiring: the OCuLink cable leaves through the slot in the back wall to the mini PC (an M.2-to-OCuLink adapter in its NVMe slot), and the supply's PCIe leads run to the card and the dock. Screw the card's bracket to the back wall (it's where a case's bracket would be).${L.split ? ' Too deep for one print: a front and a back half, bolted at the lap in the floor (4 × M3 × 8).' : ''}`,
    `GPU dock checks: the card stands ${Math.round(L.fit.tall)} mm tall in ${Math.round(L.fit.inside)} mm inside; needs ${L.fit.needDepth} mm of depth.`,
  ] };
  const notes = [
    `PC chassis (${CHASSIS[o.chassis].name}): a Mini-ITX board flat at the back (its I/O shield through the back wall), ${/^[AEFHILMNORSX]/.test(psu.name) ? 'an' : 'a'} ${psu.name} supply in front of it (its face and plug through the front wall), ${g2 ? `a ${g2.name.toLowerCase()} card (${g2.l} mm) lying flat above them on a riser cable, its bracket through the back wall and its far end on ${posts.length} posts` : 'no graphics card'}${fan ? ', and an 80 mm intake fan in the front' : ''}.`,
    `It sits on the bottom end frame and bolts to the front rails (M6, ${4 * L.U}); the board on 4 × M3 × 6 ${fastening === 'inserts' ? 'into heat-set inserts' : 'into nuts trapped under the floor'}; the supply by its own 4 × #6-32 screws through the front wall.${L.split ? ' Too deep for one print: a front and a back half, bolted at the lap in the floor (4 × M3 × 8).' : ''} Leave the back open (or the back cover off this section) for the I/O and the card's ports.`,
    `PC chassis checks: ${Math.round(L.fit.tall)} mm of board, cooler${g2 ? ' and card' : ''} in ${Math.round(L.fit.inside)} mm inside; needs ${L.fit.needDepth} mm of depth.`,
  ];
  return { parts, preview, notes, L };
}
