// The fastening rule (Epic 1, rules 5 and 7): every place a screw goes into a part is a
// fastener point, and these tables decide its geometry. One toggle picks how threads are
// held (nut traps or heat-set brass inserts); each point's group picks its thread; and
// every head is counterbored (or countersunk) so it sits 0.2 mm below the surface with
// enough plastic under it. Pure functions of the tables, so every value is tested
// (test/rack-spec.test.js) and shared with other generators later.
//
// Step 1 of Epic 1: these are the numbers and decisions. The rack geometry reads them in
// phase 1H; nothing here draws a mesh.

export const THREADS = ['M3', 'M4', 'M5', 'M6', 'M8'];
export const DIAMETER = { M3: 3, M4: 4, M5: 5, M6: 6, M8: 8 };

// Fits for FDM (mm). Material Memory's hole correction is applied on top, per printer and filament.
export const FIT = {
  headGrow: 0.6, // counterbore Ø = head Ø + 0.6
  below: 0.2, // heads sit 0.2 mm under the surface
  rimWall: 1.2, // plastic kept round a counterbore's rim
  edge: 1.5, // hole centre at least 1.5 × d from a part edge
  insertFloor: 1.2, // plastic left under a blind insert bore
  leadIn: 0.5, // 0.5 mm × 45° chamfer at an insert bore's mouth
  insertTolerance: 0.15, // corrected bore stays within ± this of nominal
  nutAcross: 0.3, // hex pocket: across flats + 0.3
  nutThick: 0.4, // hex pocket: nut thickness + 0.4
  bridge: 0.2, // sacrificial layer over a hole that prints face-down
  engagement: 1.5, // thread engagement: 1.5 × d into a nut or insert
};

// Heads (ISO 7380 button, ISO 4762 socket, ISO 10642 flat): Ø × height (flat: Ø × countersink depth),
// the minimum floor under a head, and the ISO 273 medium clearance hole. Spec rule 7's table.
export const HEADS = {
  M3: { button: [5.7, 1.65], socket: [5.5, 3.0], flat: [6.72, 1.86], floor: 1.2, clearance: 3.4 },
  M4: { button: [7.6, 2.2], socket: [7.0, 4.0], flat: [8.96, 2.48], floor: 1.6, clearance: 4.5 },
  M5: { button: [9.5, 2.75], socket: [8.5, 5.0], flat: [11.2, 3.1], floor: 2.0, clearance: 5.5 },
  M6: { button: [10.5, 3.3], socket: [10.0, 6.0], flat: [13.44, 3.72], floor: 2.4, clearance: 6.6 },
  M8: { button: [14.0, 4.4], socket: [13.0, 8.0], flat: [17.92, 4.96], floor: 3.2, clearance: 9.0 },
};

// Standard-length brass heat-set inserts for 3D printing (spec rule 5's table):
// bore Ø, insert length L, blind depth L + 1, minimum wall round the bore.
export const INSERTS = {
  M3: { bore: 4.0, length: 5.7, depth: 6.7, wall: 1.6 },
  M4: { bore: 5.6, length: 8.1, depth: 9.1, wall: 2.0 },
  M5: { bore: 6.4, length: 9.5, depth: 10.5, wall: 2.4 },
  M6: { bore: 8.0, length: 12.7, depth: 13.7, wall: 2.8 },
  M8: { bore: 9.7, length: 12.7, depth: 13.7, wall: 3.4 },
};

// Hex nuts (ISO 4032): across flats × thickness.
export const NUTS = { M3: [5.5, 2.4], M4: [7.0, 3.2], M5: [8.0, 4.7], M6: [10.0, 5.2], M8: [13.0, 6.8] };

// Screw lengths you can buy everywhere (mm).
export const STOCK_LENGTHS = [6, 8, 10, 12, 14, 16, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80];

// Soldering-iron temperature for setting inserts, by the frame's filament family.
export const IRON_TEMP = { PLA: '210–220 °C', PETG: '230–240 °C', ABS: '240–250 °C', ASA: '240–250 °C', PA: '260–270 °C', CF: '260–270 °C' };

// The groups (rule 7). Each fastener point names one; the group names its thread.
export const GROUPS = {
  structure: { name: 'Structure', allowed: ['M6', 'M8'], byStrength: { standard: 'M6', heavy: 'M6', extreme: 'M8' }, why: (t, s) => `${t}, because ${s} strength` },
  rail: { name: 'Rail grid', allowed: ['M6', 'M5'], byStrength: { standard: 'M6', heavy: 'M6', extreme: 'M6' }, why: (t) => (t === 'M6' ? 'M6, the 10-inch rack standard, so bought gear fits' : 'M5, for M5-tapped gear') },
  trim: { name: 'Trim', allowed: ['M3', 'M4'], byStrength: { standard: 'M4', heavy: 'M4', extreme: 'M4' }, why: (t) => `${t}, for panels that come off often` },
  internal: { name: 'Internal', allowed: ['M3', 'M4'], byStrength: { standard: 'M3', heavy: 'M3', extreme: 'M3' }, why: (t) => `${t}, for sleds, brackets and boards` },
};

const round2 = (x) => Math.round(x * 100) / 100;
const head = (thread, type) => {
  const h = HEADS[thread];
  if (!h) throw new Error(`Unknown thread ${thread}`);
  const [d, k] = h[type];
  return { type, d, k };
};

/** The thread a group uses: the person's choice if the group allows it, else the default for the strength. */
export function groupThread(group, { strength = 'heavy', threads = {} } = {}) {
  const g = GROUPS[group];
  if (!g) throw new Error(`Unknown fastener group ${group}`);
  const want = threads[group];
  return g.allowed.includes(want) ? want : g.byStrength[strength] || g.byStrength.heavy;
}

/** How thick a part must be under a head of this type for it to sit flush with its floor. */
export const seatNeeds = (thread, type = 'button') => {
  const h = head(thread, type);
  return round2(h.k + FIT.below + HEADS[thread].floor);
};

/**
 * Seat a screw head in a part `thickness` thick (the plate the screw passes through).
 * Tries, in order: the preferred head (socket for hidden flanges), a button head, then a
 * flat countersunk head. Returns the cut and the head chosen, or `ok: false` with the
 * thickness it would need (so the caller can derive a thicker plate or report it).
 */
export function seat(thread, thickness, { prefer = 'button', flush = true } = {}) {
  const hs = HEADS[thread];
  if (!hs) throw new Error(`Unknown thread ${thread}`);
  const order = [...new Set([prefer, 'button', 'flat'])];
  if (!flush) return { ok: true, thread, head: 'button', clearance: hs.clearance, counterbore: null, floor: thickness };
  for (const type of order) {
    const h = head(thread, type);
    const depth = round2(h.k + FIT.below);
    const floor = round2(thickness - depth);
    if (floor + 1e-9 < hs.floor) continue;
    return {
      ok: true, thread, head: type, clearance: hs.clearance,
      // Flat heads take a 90° countersink to the head's Ø + fit; the others a cylindrical counterbore.
      counterbore: type === 'flat' ? { kind: 'countersink', d: round2(h.d + FIT.headGrow), depth, angle: 90 } : { kind: 'counterbore', d: round2(h.d + FIT.headGrow), depth },
      floor,
    };
  }
  // The thinnest part any of these heads can sit flush in (with the spec's head table that's
  // the button head: a countersunk head is deeper).
  const need = Math.min(...order.map((t) => seatNeeds(thread, t)));
  return { ok: false, thread, need, reason: `${thickness} mm is too thin to sink an ${thread} head flush (needs ${need} mm)` };
}

/** The derived thickness rule: a plate grows until its group's head sits flush (e.g. flange ff = max(4, k + 0.2 + floor)). */
export const derivedThickness = (base, thread, type = 'button') => round2(Math.max(base, seatNeeds(thread, type)));

/**
 * A heat-set insert in a part `thickness` thick along the bore's axis. Returns the bore,
 * and a boss when the plastic is thinner than the blind depth plus its floor.
 */
export function insert(thread, thickness = Infinity) {
  const t = INSERTS[thread];
  if (!t) throw new Error(`Unknown thread ${thread}`);
  const need = round2(t.depth + FIT.insertFloor);
  return {
    thread, bore: t.bore, length: t.length, depth: t.depth, leadIn: FIT.leadIn, wall: t.wall,
    boss: thickness + 1e-9 < need ? { od: round2(t.bore + 2 * t.wall), depth: need } : null,
  };
}

/** A captive hex nut pocket, with the clearance hole and a bridging layer so it prints without support. */
export function nutTrap(thread) {
  const n = NUTS[thread];
  if (!n) throw new Error(`Unknown thread ${thread}`);
  return { thread, across: round2(n[0] + FIT.nutAcross), thick: round2(n[1] + FIT.nutThick), hole: HEADS[thread].clearance, bridge: FIT.bridge };
}

/** Screw length for a stack: what it passes through plus the thread engagement, rounded up to a stock length. */
export function screwLength(thread, stack) {
  const need = stack + FIT.engagement * DIAMETER[thread];
  return STOCK_LENGTHS.find((l) => l >= need - 1e-9) || Math.ceil(need / 5) * 5;
}

/** Minimum distance from a hole's centre to a part's edge. */
export const edgeDistance = (thread) => round2(FIT.edge * DIAMETER[thread]);
