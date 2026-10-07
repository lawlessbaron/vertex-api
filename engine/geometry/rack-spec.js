// The rack's spec state (Epic 1, step 1): one normalised object that every phase reads.
// It holds the frame dimensions, the hardware rules (the fastening toggle, each group's
// thread, flush heads) and the PC chassis option, and derives what follows from them: the
// flange, ear and plate thicknesses that let every head sit flush, each fastener point's
// geometry, the hardware list for the build sheet, and the guard-rail messages.
//
// Pure functions, no meshes: serverrack.js reads this in phase 1H (fastening) and 1J
// (chassis bays). Old links keep their exact geometry: a spec without `hw: 2` reads as
// today's hardware (M3 frame brackets, M6 rails, M3 inside, nuts).

import { DIAMETER, GROUPS, HEADS, IRON_TEMP, derivedThickness, groupThread, insert, nutTrap, screwLength, seat } from './fasteners.js';
import { RACK_FRAME } from './serverrack.js';

// The 10-inch rack standard. A rule can't change it, so bought gear always fits.
export const RACK_STANDARD = Object.freeze({
  format: '10-inch', ears: 254, railPitch: 236.5, clear: 222.25, U: 44.45,
  holes: [6.35, 22.225, 38.1], railThread: 'M6', outerMin: 256, outerMax: 400,
});

export const HW_SCHEMA = 2;
// What racks used before the mixed-hardware rule, so old links are unchanged.
export const LEGACY_THREADS = Object.freeze({ structure: 'M3', rail: 'M6', trim: 'M6', internal: 'M3' });

// PC chassis bays (rule 8). Boards and parts in mm.
export const BOARDS = Object.freeze({
  itx: { name: 'Mini-ITX', w: 170, d: 170, standoff: 6.35, pcb: 1.6 },
  matx: { name: 'Micro-ATX', w: 244, d: 244, standoff: 6.35, pcb: 1.6 },
  // An OCuLink (or USB4) GPU dock's open board: the card stands upright in its slot. Sizes vary by
  // make, so the pad takes slotted screws anywhere over this footprint and the slot height is generous.
  dock: { name: 'OCuLink GPU dock', w: 170, d: 120, standoff: 6, pcb: 1.6, slot: 14 },
});
export const PSUS = Object.freeze({
  sfx: { name: 'SFX', w: 125, h: 63.5, d: 100 },
  sfxl: { name: 'SFX-L', w: 125, h: 63.5, d: 130 },
  flex: { name: 'FlexATX', w: 81.5, h: 40.5, d: 150 },
});
// GPU presets: length × height (bracket to edge) × thickness. Lying flat, thickness is vertical.
export const GPUS = Object.freeze({
  none: null,
  lowprofile: { name: 'Low-profile, dual slot', l: 170, h: 69, t: 38 },
  compact: { name: 'Compact, dual slot', l: 200, h: 112, t: 40 },
  standard: { name: 'Full-length, dual slot', l: 267, h: 112, t: 40 },
  big: { name: 'Full-length, 2.5 slot', l: 300, h: 125, t: 52 },
  huge: { name: 'Flagship, 3 slot', l: 336, h: 140, t: 62 },
});
export const CHASSIS = Object.freeze({
  none: null,
  itx3u: { name: '3U PC chassis (Mini-ITX)', units: 3, board: 'itx', cooler: 47, psu: ['sfx', 'sfxl'], minDepth: 300 },
  itx4u: { name: '4U PC chassis (Mini-ITX)', units: 4, board: 'itx', cooler: 70, psu: ['sfx', 'sfxl', 'flex'], minDepth: 340 },
  matx4u: { name: '4U PC chassis (Micro-ATX)', units: 4, board: 'matx', cooler: 70, psu: ['sfx', 'sfxl', 'flex'], minDepth: 340 },
  // A graphics card for a mini PC: the dock flat on the floor at the back, the card standing upright in it,
  // the supply beside the card at the front. The mini PC sits in its own bay and the OCuLink cable runs to it.
  dock4u: { name: '4U GPU dock (OCuLink)', units: 4, board: 'dock', dock: true, cooler: 0, psu: ['sfx', 'sfxl'], minDepth: 300 },
});
const CLEAR = 2; // clearance round boards, cards and supplies
const RISER_GAP = 4; // riser bracket between the cooler's top and the card

const pick = (v, list, d) => (list.includes(v) ? v : d);
const clampNum = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const yes = (v, d = true) => (v === undefined ? d : v !== false && v !== 'false' && v !== 0 && v !== '0');

/** Read any spec (share link, saved design, studio state) into one clean object. */
export function normalizeRackSpec(o = {}) {
  const strength = pick(o.strength, ['standard', 'heavy', 'extreme'], 'heavy');
  const hw = Number(o.hw) >= HW_SCHEMA ? HW_SCHEMA : 1;
  const railNuts = pick(o.railNuts, ['nuts', 'cage', 'none'], 'nuts');
  const given = o.threads && typeof o.threads === 'object' ? o.threads : {};
  const threads = hw >= HW_SCHEMA
    ? Object.fromEntries(Object.keys(GROUPS).map((g) => [g, groupThread(g, { strength, threads: given })]))
    : { ...LEGACY_THREADS };
  // Cage nuts are M6 clips, so trim on the rails uses M6 with them (rule 7).
  if (hw >= HW_SCHEMA && railNuts === 'cage') threads.trim = 'M6';
  const chassis = pick(o.chassis, Object.keys(CHASSIS), 'none');
  const units = Math.round(clampNum(o.units, 1, 42, CHASSIS[chassis]?.units || 5));
  return {
    hw, strength, units,
    depth: Math.round(clampNum(o.depth, 120, 450, 200)),
    width: Number(o.width) ? Math.round(clampNum(o.width, RACK_STANDARD.outerMin, RACK_STANDARD.outerMax, RACK_STANDARD.outerMin)) : 0,
    fastening: o.fastening === 'inserts' ? 'inserts' : 'nuts',
    flush: yes(o.flush),
    railNuts, threads,
    chassis,
    gpu: chassis === 'none' ? 'none' : pick(o.gpu, Object.keys(GPUS), 'standard'),
    psu: chassis === 'none' ? null : pick(o.psu, CHASSIS[chassis].psu, CHASSIS[chassis].psu[0]),
    filament: pick(o.filament, Object.keys(IRON_TEMP), 'PETG'),
  };
}

/**
 * The frame's dimensions, and the thicknesses derived so every group's head sits flush.
 * From the strength's frame table; with hw 2 and flush on, the flange (ff) grows to seat a
 * structure head, and the ears and plates (pt) to seat a trim head.
 */
export function deriveFrame(spec) {
  const base = RACK_FRAME[spec.strength];
  const mixed = spec.hw >= HW_SCHEMA && spec.flush;
  const ff = mixed ? derivedThickness(base.ff, spec.threads.structure) : base.ff;
  const pt = mixed ? derivedThickness(base.pt, spec.threads.trim) : base.pt;
  const outerW = spec.width || RACK_STANDARD.outerMin;
  return {
    ...base, ff, pt,
    outer: { w: outerW, h: Math.round((spec.units * RACK_STANDARD.U + 2 * base.ft) * 100) / 100, d: spec.depth },
    clear: RACK_STANDARD.clear, ears: RACK_STANDARD.ears, railPitch: RACK_STANDARD.railPitch,
    grew: { ff: ff > base.ff ? Math.round((ff - base.ff) * 100) / 100 : 0, pt: pt > base.pt ? Math.round((pt - base.pt) * 100) / 100 : 0 },
  };
}

/**
 * One fastener point's geometry: the thread from its group, what holds the thread (insert
 * or nut trap, following the toggle), and the flush seat in the part the screw passes through.
 */
export function fastenerFor(spec, { group, through, into = Infinity, prefer = 'button' }) {
  if (!GROUPS[group]) throw new Error(`Unknown fastener group ${group}`);
  const thread = spec.threads[group];
  const seated = seat(thread, through, { prefer, flush: spec.flush });
  return {
    group, thread,
    hold: spec.fastening === 'inserts' ? { kind: 'insert', ...insert(thread, into) } : { kind: 'nut', ...nutTrap(thread) },
    seat: seated,
    screw: { thread, head: seated.ok ? seated.head : 'button', length: screwLength(thread, through) },
  };
}

/**
 * The build sheet's hardware, by group: screws (thread × length × head), inserts or nuts,
 * washer plates, the iron temperature, and a one-line reason for each group's size.
 * `points`: [{ group, through, into?, count }], from the geometry once 1H declares them.
 */
export function hardwareList(spec, points) {
  const screws = new Map(), holders = new Map(), problems = [];
  let washers = 0;
  for (const pt of points) {
    const n = Math.max(1, Math.round(pt.count || 1));
    const f = fastenerFor(spec, pt);
    if (!f.seat.ok) problems.push({ group: pt.group, thread: f.thread, reason: f.seat.reason, fix: `make it ${f.seat.need} mm or more (a stronger setting), use ${GROUPS[pt.group].allowed.find((t) => t !== f.thread) || 'the other thread'}, or nut traps` });
    const sk = `${f.thread} × ${f.screw.length} ${f.screw.head}`;
    screws.set(sk, (screws.get(sk) || 0) + n);
    const hk = f.hold.kind === 'insert' ? `${f.thread} × ${f.hold.length} insert` : `${f.thread} nut`;
    holders.set(hk, (holders.get(hk) || 0) + n);
    // Trim on the rails in nuts mode: a printed washer plate behind each rail nut spreads the load.
    if (pt.group === 'trim' && pt.onRail && spec.fastening === 'nuts' && spec.railNuts === 'nuts') washers += n;
  }
  const sorted = (m) => [...m].sort(([a], [b]) => DIAMETER[a.slice(0, 2)] - DIAMETER[b.slice(0, 2)] || a.localeCompare(b, 'en', { numeric: true })).map(([what, count]) => ({ what, count }));
  return {
    screws: sorted(screws),
    [spec.fastening === 'inserts' ? 'inserts' : 'nuts']: sorted(holders),
    washerPlates: washers,
    iron: spec.fastening === 'inserts' ? IRON_TEMP[spec.filament] : null,
    groups: Object.entries(spec.threads).map(([g, t]) => ({ group: GROUPS[g].name, thread: t, why: spec.hw >= HW_SCHEMA ? GROUPS[g].why(t, spec.strength) : `${t}, as racks were built before mixed hardware` })),
    problems,
  };
}

/** Does a chassis option fit, and if not, why and what to do. */
export function chassisFit(spec) {
  const c = CHASSIS[spec.chassis];
  if (!c) return { ok: true, notes: [] };
  const board = BOARDS[c.board], gpu = GPUS[spec.gpu], psu = PSUS[spec.psu];
  const across = RACK_STANDARD.clear - 2 * CLEAR;
  const problems = [];
  if (c.dock) return dockFit(spec, c, board, gpu, psu, across);
  if (board.w > across) {
    problems.push({
      code: 'board-too-wide',
      reason: `A ${board.name} board is ${board.w} mm wide; the 10-inch rails are ${RACK_STANDARD.clear} mm apart.`,
      fix: 'Use a Mini-ITX board, or the 19-inch rack format when it arrives (450 mm clear).',
    });
  }
  const frame = deriveFrame(spec);
  const inside = spec.units * RACK_STANDARD.U - 2 * frame.pt;
  const boardStack = board.standoff + board.pcb + c.cooler;
  const tall = boardStack + (gpu ? RISER_GAP + gpu.t : 0) + 2 * CLEAR;
  if (tall > inside) problems.push({ code: 'too-tall', reason: `The board, cooler and card need ${Math.round(tall)} mm of height; ${spec.units}U gives ${Math.round(inside)} mm inside.`, fix: gpu && spec.units < 4 ? 'Go to 4U, or pick a thinner card.' : 'Pick a lower cooler or a thinner card.' });
  if (gpu && gpu.h > across) problems.push({ code: 'gpu-too-tall', reason: `That card is ${gpu.h} mm from bracket to edge; ${Math.round(across)} mm fits across.`, fix: 'Pick a narrower card.' });
  const needDepth = Math.max(c.minDepth, gpu ? gpu.l + 40 : 0, board.d + 60);
  if (spec.depth < needDepth) problems.push({ code: 'too-shallow', reason: `This chassis needs ${needDepth} mm of depth (the card plus 40 mm for its support arm and cables); the rack is ${spec.depth} mm.`, fix: `Set the depth to ${needDepth} mm or more, or pick a shorter card.` });
  if (psu && psu.w + board.w + 3 * CLEAR > across && gpu && psu.h + 2 * CLEAR > inside - (gpu.t + RISER_GAP)) {
    problems.push({ code: 'psu-crowded', reason: `The ${psu.name} supply doesn't fit beside the board under the card.`, fix: 'The supply goes behind the board (needs more depth), or pick FlexATX.' });
  }
  return { ok: problems.length === 0, needDepth, inside: Math.round(inside * 100) / 100, tall: Math.round(tall * 100) / 100, problems };
}

// The GPU dock: the card stands upright, so its bracket-to-edge height must fit under the lid, its
// thickness and the supply side by side across, and its length (plus the cable at the back) in the depth.
function dockFit(spec, c, board, gpu, psu, across) {
  const problems = [];
  const frame = deriveFrame(spec);
  const inside = spec.units * RACK_STANDARD.U - 2 * frame.pt;
  if (!gpu) problems.push({ code: 'dock-no-card', reason: 'A GPU dock bay is for a graphics card.', fix: 'Pick the card that goes in it.' });
  const tall = board.standoff + board.pcb + board.slot + (gpu ? gpu.h : 0) + 2 * CLEAR;
  if (tall > inside) problems.push({ code: 'too-tall', reason: `Standing in the dock, the card needs ${Math.round(tall)} mm of height; ${spec.units}U gives ${Math.round(inside)} mm inside.`, fix: 'Pick a card with a lower bracket-to-edge height.' });
  const wide = (gpu ? gpu.t + 10 : 0) + psu.w + 3 * CLEAR;
  if (wide > across) problems.push({ code: 'psu-crowded', reason: `The card (${gpu.t} mm thick, with room for its fans) and the ${psu.name} supply need ${Math.round(wide)} mm side by side; ${Math.round(across)} mm fits across.`, fix: 'Pick a thinner card, or put the supply on its own shelf.' });
  const needDepth = Math.max(c.minDepth, gpu ? gpu.l + 50 : 0, board.d + psu.d + 30);
  if (spec.depth < needDepth) problems.push({ code: 'too-shallow', reason: `The dock bay needs ${needDepth} mm of depth (the card plus 50 mm for its power plugs and the cable); the rack is ${spec.depth} mm.`, fix: `Set the depth to ${needDepth} mm or more, or pick a shorter card.` });
  return { ok: problems.length === 0, needDepth, inside: Math.round(inside * 100) / 100, tall: Math.round(tall * 100) / 100, problems };
}

/** Every guard-rail message for a spec, in plain words, each with its fix. Never a refusal. */
export function checkRackSpec(spec) {
  const notes = [];
  const fit = chassisFit(spec);
  for (const p of fit.problems || []) notes.push({ level: 'warn', ...p });
  if (spec.hw >= HW_SCHEMA && spec.threads.rail !== 'M6') notes.push({ level: 'info', code: 'rail-m5', reason: 'The rail grid is set to M5: only for gear with M5-tapped ears.', fix: 'Use M6 unless your gear says otherwise.' });
  if (spec.fastening === 'inserts' && spec.railNuts === 'cage') notes.push({ level: 'info', code: 'cage-inserts', reason: 'Cage nuts hold the rail screws, so the rail grid takes no inserts; the rest of the rack does.', fix: '' });
  return notes;
}

/** Everything step 1 knows about a spec, in one call: the studio and the build sheet start here. */
export function rackState(input) {
  const spec = normalizeRackSpec(input);
  return { spec, frame: deriveFrame(spec), chassis: chassisFit(spec), notes: checkRackSpec(spec), heads: Object.fromEntries(Object.entries(spec.threads).map(([g, t]) => [g, { thread: t, clearance: HEADS[t].clearance }])) };
}
