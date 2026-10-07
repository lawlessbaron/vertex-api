// Epic 1, rule 9: a 1U sliding tray for Lenovo's 1-litre PCs (ThinkCentre M920q, M90q), 179 × 183 × 37 mm.
//
// The tray is a sleeve: floor, sides and a top, with a faceplate that bolts to the front rails like any 1U
// panel. The PC slides in from the back until its front meets a 2 mm lip round the faceplate's window (its
// front ports and grille stay open), and a stop bar screws across the back of the floor. Ribs along both sides
// ride in two guides that bolt to the back rails, so the sleeve is held at both ends and slides out the front.
//
// Air: the slots in the sides and top sit over the PC's own intake zones (VENT ZONES below, measured from the
// PC's front left bottom corner), and the back is open where it blows out (its exhaust, rear left). Nothing
// solid of the tray covers an intake or the exhaust.
//
// State first (this file's top half): the settings, cleaned (normalizeTinyTray), and the layout, derived and
// checked (tinyTrayLayout). Geometry (tinyTrayParts) only ever draws a layout that passed.
//
// Print orientation: the sleeve stands on its faceplate (254 × 44 mm on the bed, 198 mm tall), so the walls,
// slots and ribs are all vertical: no supports, and the slot tops are 3.5 mm bridges. The guides stand on their
// rail plates, the stop bar on its foot.
import { Mesh } from './mesh.js';
import { rr, sections } from './slabs.js';

// The rack's rails: the holes' x (hx), the flange's inner edge (ex) and its upright leg (leg, x), each side; the panel's half width.
export const RAIL = { U: 44.45, hx: 118.25, ex: 111.125, leg: 123.9, hw: 123.95, holes: [6.35, 22.225, 38.1], m6: 3.25 };
const BED = 250;

/**
 * The PCs, outside sizes (w across, d deep, h tall, mm) and where their air goes, from the front left bottom
 * corner looking at the front: side intake (each side, from/to mm back from the front, lo/hi mm up), top
 * intake (x0/x1 mm from the left, from/to back from the front) and the rear exhaust (x0/x1 from the left,
 * lo/hi up). Lenovo's own drawings give the sizes; the zones are its grilles, with a few mm spare.
 */
export const TINY_PCS = {
  m920q: {
    name: 'Lenovo ThinkCentre M920q', w: 179, d: 183, h: 37, bay25: 7, // bay25: its 2.5-inch SATA bay's thickest drive (mm)
    vents: { side: { from: 15, to: 100, lo: 6, hi: 31 }, top: { x0: 15, x1: 115, from: 20, to: 130 }, exhaust: { x0: 4, x1: 90, lo: 8, hi: 33 } },
  },
  m90q: {
    name: 'Lenovo ThinkCentre M90q', w: 179, d: 183, h: 37, bay25: 7,
    vents: { side: { from: 15, to: 100, lo: 6, hi: 31 }, top: { x0: 15, x1: 115, from: 20, to: 130 }, exhaust: { x0: 4, x1: 90, lo: 8, hi: 33 } },
  },
};

/** 2.5-inch drives by thickness: the PC's own SATA bay takes 7 mm drives only (the cloud node's storage). */
export const DRIVES25 = {
  none: { name: 'No 2.5-inch drive', t: 0 },
  ssd7: { name: '2.5-inch SATA SSD, 7 mm', t: 7 },
  hdd7: { name: '2.5-inch laptop hard drive, 7 mm', t: 7 },
  hdd95: { name: '2.5-inch hard drive, 9.5 mm', t: 9.5 },
  hdd15: { name: '2.5-inch hard drive, 15 mm (4–5 TB)', t: 15 },
};

export const TINY_TRAY_DEFAULTS = {
  pc: 'm920q', // which PC (TINY_PCS)
  drive: 'ssd7', // what goes in its 2.5-inch bay (DRIVES25): 7 mm at most
  clearance: 0.6, // room each side of the PC and above it
  wall: 2.4, // side wall
  floor: 2.4,
  top: 2.0,
  face: 4, // faceplate thickness
  lip: 2, // the faceplate's lip round the PC's front: what it stops against
  sideVents: true,
  topVents: true,
  slot: 3.5, // slot width
  bar: 3, // bar between slots
  run: 30, // a slot's longest run before a cross bar (stiffness)
  depth: 300, // the rack's depth (front rail face to back face)
  railBack: 7, // the back rails' depth: they sit just inside the back
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

/** The settings, cleaned: every number in its safe range, the PC one we know. */
export function normalizeTinyTray(o = {}) {
  const d = TINY_TRAY_DEFAULTS;
  return {
    pc: TINY_PCS[o.pc] ? o.pc : d.pc,
    drive: DRIVES25[o.drive] ? o.drive : d.drive,
    clearance: num(o.clearance, 0.3, 1.5, d.clearance),
    wall: num(o.wall, 1.6, 4, d.wall),
    floor: num(o.floor, 1.6, 4, d.floor),
    top: num(o.top, 1.2, 3, d.top),
    face: num(o.face, 3, 6, d.face),
    lip: num(o.lip, 1.5, 4, d.lip),
    sideVents: o.sideVents !== undefined ? Boolean(o.sideVents) : d.sideVents,
    topVents: o.topVents !== undefined ? Boolean(o.topVents) : d.topVents,
    slot: num(o.slot, 2, 6, d.slot),
    bar: num(o.bar, 2, 6, d.bar),
    run: num(o.run, 15, 60, d.run),
    depth: num(o.depth, 150, 600, d.depth),
    railBack: num(o.railBack, 3, 20, d.railBack),
  };
}

// Slot runs along a span: pieces of at most `run`, a bar between.
function runs(a, b, run, bar) {
  const n = Math.max(1, Math.ceil((b - a + bar) / (run + bar))), len = (b - a - (n - 1) * bar) / n;
  return Array.from({ length: n }, (_, k) => [a + k * (len + bar), a + k * (len + bar) + len]);
}
// Slots across a span: as many as fit, centred.
function across(a, b, slot, bar) {
  const n = Math.max(0, Math.floor((b - a + bar) / (slot + bar))), used = n * slot + (n - 1) * bar, s = a + (b - a - used) / 2;
  return Array.from({ length: n }, (_, k) => [s + k * (slot + bar), s + k * (slot + bar) + slot]);
}

/**
 * The tray's layout, in the tray's own frame: x across (centred on the rack), y up from the sleeve's
 * underside, z back from the faceplate's front face. Every size derived from the PC and the settings, and
 * checked: it fits 1U, between the rails, on a 256 bed and in the rack's depth. { ok, problems, ... }.
 */
export function tinyTrayLayout(o = {}) {
  const s = normalizeTinyTray(o), pc = TINY_PCS[s.pc], V = pc.vents, c = s.clearance;
  const Wi = pc.w + 2 * c, Wo = Wi + 2 * s.wall, Hi = pc.h + c, Ho = s.floor + Hi + s.top;
  const yU = -1; // the unit's bottom, below the sleeve's underside
  const pcZ0 = s.face, pcZ1 = s.face + pc.d; // the PC, front against the lip
  const stop = { z0: pcZ1 + 0.5, foot: 10, t: 2.4, h: 7 }; // the stop bar's foot, behind the PC
  const Ls = stop.z0 + stop.foot; // the sleeve's length
  const rib = { y: s.floor + Hi - 4, h: 4, out: 3 }; // above the side slots, below the top
  const xl = -pc.w / 2; // the PC's left side
  const vents = { side: [], top: [], exhaust: { x0: xl + V.exhaust.x0, x1: xl + V.exhaust.x1, y0: s.floor + V.exhaust.lo, y1: s.floor + V.exhaust.hi } };
  if (s.sideVents) {
    const rows = across(s.floor + V.side.lo, Math.min(s.floor + V.side.hi, rib.y - rib.h / 2 - 2), s.slot, s.bar);
    for (const [z0, z1] of runs(pcZ0 + V.side.from, pcZ0 + V.side.to, s.run, s.bar)) for (const [y0, y1] of rows) vents.side.push({ z0, z1, y0, y1 });
  }
  if (s.topVents) {
    const cols = across(xl + V.top.x0, xl + V.top.x1, s.slot, s.bar);
    for (const [z0, z1] of runs(pcZ0 + V.top.from, pcZ0 + V.top.to, s.run, s.bar)) for (const [x0, x1] of cols) vents.top.push({ x0, x1, z0, z1 });
  }
  // The guides: their plates flat on the back rails' flange (its front face railBack in from the back, which is
  // depth behind the front rails; the faceplate sits 4 mm in front of those), reaching forward over the ribs by 25 mm.
  const Db = s.depth - s.railBack + s.face;
  const guide = { plate: 4, z1: Db, Lg: Math.max(30, Db - 4 - (Ls - 25)), x0: Wo / 2 + 0.4 };
  guide.z0 = Db - guide.plate - guide.Lg;
  const window = { x0: -pc.w / 2 + s.lip, x1: pc.w / 2 - s.lip, y0: s.floor + s.lip, y1: s.floor + pc.h - s.lip };
  const problems = [];
  if (Ho > RAIL.U - 0.8) problems.push({ code: 'too-tall', reason: `The sleeve is ${Ho.toFixed(1)} mm tall; 1U holds ${(RAIL.U - 0.8).toFixed(2)} mm.`, fix: 'Thinner floor or top, or less clearance.' });
  if (Wo / 2 + rib.out > RAIL.ex - 1) problems.push({ code: 'too-wide', reason: `With its ribs the sleeve is ${(Wo + 2 * rib.out).toFixed(1)} mm wide; the rails are ${(2 * RAIL.ex).toFixed(2)} mm apart.`, fix: 'Thinner walls or less clearance.' });
  const needD = Math.ceil(Ls + 1 + guide.plate + s.railBack - s.face);
  if (Db - guide.plate < Ls + 1) problems.push({ code: 'too-shallow', reason: `The tray is ${Ls.toFixed(0)} mm deep and needs the back rails at least ${needD} mm behind the front ones.`, fix: `A rack at least ${needD} mm deep.` });
  if (guide.plate + guide.Lg > BED) problems.push({ code: 'guide-too-long', reason: `The guides would be ${(guide.plate + guide.Lg).toFixed(0)} mm long, more than a bed.`, fix: 'A shallower rack, or a spacer behind the back rails.' });
  if (Ls > BED || 2 * RAIL.hw > 256) problems.push({ code: 'bed', reason: `The sleeve stands ${Ls.toFixed(0)} mm tall on a ${(2 * RAIL.hw).toFixed(0)} mm faceplate.`, fix: 'A bed of at least 256 × 256 × 200 mm.' });
  // The PC's 2.5-inch bay: 7 mm drives only. A thicker one won't go in, so no tray is drawn for it.
  const drive = DRIVES25[s.drive];
  if (drive.t > pc.bay25) problems.push({ code: 'drive-too-thick', reason: `The ${pc.name}'s 2.5-inch bay takes drives up to ${pc.bay25} mm thick; a ${drive.t} mm drive won't go in.`, fix: `A ${pc.bay25} mm SATA SSD (2–4 TB), or put bigger drives in the rack's drive bays.` });
  // Nothing solid over an intake or the exhaust: the stop bar stays under the exhaust.
  if (s.floor + stop.h > vents.exhaust.y0) problems.push({ code: 'exhaust', reason: 'The stop bar would cover the PC\'s exhaust.', fix: 'A lower stop bar.' });
  return {
    ok: problems.length === 0, problems, spec: s, pc, drive, Wi, Wo, Hi, Ho, Ls, yU, pcZ0, pcZ1, stop, rib, vents, guide, window,
    face: { x0: -RAIL.hw, x1: RAIL.hw, y0: yU + 0.4, y1: yU + RAIL.U - 0.4, holes: RAIL.holes.map((h) => yU + h) },
    hardware: [
      { item: 'M6 × 12 screw + cage nut (or rail nut)', qty: 4, for: 'the faceplate to the front rails (2) and the guides to the back rails (2)' },
      { item: 'M3 × 8 self-tapping screw', qty: 2, for: 'the stop bar to the floor' },
    ],
  };
}

// ------------------------------------------------------------------ geometry

const tear = (d, x, y, r) => { d.disc(x, y, r); };

/** The sleeve, as it prints (standing on its faceplate): plan x across, y up; print z = depth. */
function sleeve(L) {
  const { Wi, Wo, Hi, Ho, Ls, rib, vents, window: w, face, spec: s, stop } = L;
  const screw = { z: stop.z0 + 6.2, r: 1.6, x: 60 }; // the stop bar's screws, down into the floor
  const cuts = [0, s.face, Ls];
  for (const v of [...vents.side, ...vents.top]) cuts.push(v.z0, v.z1);
  for (let k = -4; k <= 4; k++) cuts.push(screw.z + (k * screw.r) / 4);
  return sections([face.x0, Math.min(face.y0, 0), face.x1, Math.max(face.y1, Ho)], cuts, (z, d) => {
    if (z < s.face) {
      d.on(rr(face.x0, face.y0, face.x1, face.y1, 2));
      d.off(rr(w.x0, w.y0, w.x1, w.y1, 1.5));
      for (const y of face.holes) for (const sx of [-1, 1]) tear(d, sx * RAIL.hx, y, RAIL.m6);
      return;
    }
    d.on(rr(-Wo / 2, 0, Wo / 2, Ho, 1.5));
    d.off(rr(-Wi / 2, s.floor, Wi / 2, s.floor + Hi, 0.6));
    for (const sx of [-1, 1]) d.on(sx > 0 ? rr(Wo / 2 - 0.5, rib.y - rib.h / 2, Wo / 2 + rib.out, rib.y + rib.h / 2, 0.8) : rr(-Wo / 2 - rib.out, rib.y - rib.h / 2, -Wo / 2 + 0.5, rib.y + rib.h / 2, 0.8));
    for (const v of vents.side) if (z > v.z0 && z < v.z1) { d.off(rr(Wo / 2 - s.wall - 0.5, v.y0, Wo / 2 + 0.5, v.y1)); d.off(rr(-Wo / 2 - 0.5, v.y0, -Wo / 2 + s.wall + 0.5, v.y1)); }
    for (const v of vents.top) if (z > v.z0 && z < v.z1) d.off(rr(v.x0, s.floor + Hi - 0.5, v.x1, Ho + 0.5));
    // The stop bar's screw holes, through the floor: a diamond, so the hole's top prints without support.
    const k = 1 - Math.abs(z - screw.z) / screw.r;
    if (k > 0) for (const sx of [-1, 1]) d.off(rr(sx * screw.x - screw.r * k, -0.5, sx * screw.x + screw.r * k, s.floor + 0.5));
  }, 0.12, 0.08);
}

/** The stop bar, as it prints (foot down): plan x across, y back from its upright. */
function stopBar(L) {
  const { Wi, stop } = L, w = Wi / 2 - 0.3;
  return sections([-w, 0, w, stop.foot], [0, stop.t, stop.h], (z, d) => {
    if (z < stop.t) {
      d.on(rr(-w, 0, w, stop.foot, 1));
      for (const sx of [-1, 1]) d.disc(sx * 60, 6.2, 1.7, 0);
    } else d.on(rr(-w, 0, w, stop.t, 0.6));
  }, 0.12, 0.08);
}

/** One guide (side +1 right, -1 left), as it prints (standing on its rail plate): plan x across, y up. */
function guide(L, side) {
  const { guide: G, rib, yU } = L, lead = 6;
  const span = (a, b) => (side > 0 ? [a, b] : [-b, -a]);
  const [px0, px1] = span(RAIL.ex + 0.5, RAIL.leg - 0.5), [bx0, bx1] = span(G.x0, RAIL.ex + 1); // the plate between the flange's edge and the upright's leg
  return sections([Math.min(px0, bx0) - 1, yU, Math.max(px1, bx1) + 1, yU + RAIL.U], [0, G.plate, G.plate + G.Lg - lead, G.plate + G.Lg], (z, d) => {
    if (z < G.plate) {
      d.on(rr(px0, yU + 1, px1, yU + RAIL.U - 1, 1));
      for (const h of [RAIL.holes[0], RAIL.holes[2]]) d.disc(side * RAIL.hx, yU + h, RAIL.m6, 0);
    }
    d.on(rr(bx0, rib.y - 7, bx1, rib.y + 7, 1));
    const gh = rib.h / 2 + (z > G.plate + G.Lg - lead ? 1.4 : 0.4); // the groove, its mouth flared
    const [gx0, gx1] = span(G.x0 - 1, L.Wo / 2 + rib.out + 0.5);
    d.off(rr(gx0, rib.y - gh, gx1, rib.y + gh));
  }, 0.12, 0.08);
}

/** The parts, in print orientation, plus the notes and the hardware. Nothing if the layout didn't pass. */
export function tinyTrayParts(o = {}) {
  const L = tinyTrayLayout(o);
  if (!L.ok) return { L, parts: [], notes: L.problems.map((q) => `Lenovo Tiny tray: ${q.reason} ${q.fix}`) };
  const parts = [
    { name: `tiny-tray-${L.spec.pc}`, mesh: sleeve(L) },
    { name: 'tiny-stop-bar', mesh: stopBar(L) },
    { name: 'tiny-guide-right', mesh: guide(L, 1) },
    { name: 'tiny-guide-left', mesh: guide(L, -1) },
  ];
  const vents = `${L.vents.side.length / 2 > 0 ? `${L.vents.side.length} side slots over its intakes` : 'no side slots'}, ${L.vents.top.length ? `${L.vents.top.length} top slots over its CPU` : 'no top slots'}, the back open for its exhaust`;
  return {
    L, parts,
    notes: [
      `Lenovo Tiny tray (${L.pc.name}, 1U): the PC slides in from the back until it meets the faceplate's lip, and the stop bar screws to the floor behind it (2 × M3 × 8). ${vents}.`,
      `Fitting: bolt the guides to the back rails (M6), slide the tray in so its ribs ride in them, and bolt the faceplate to the front rails (M6). Pull the faceplate to slide the PC out.`,
      'Print the tray standing on its faceplate, the guides on their plates and the stop bar on its foot: no supports.',
      L.drive.t ? `Storage: the PC's own 2.5-inch bay takes a ${L.pc.bay25} mm SATA drive (${L.drive.name}); it slides in under the top cover, so the tray needs no room for it.` : `Storage: the PC's 2.5-inch bay is empty; it takes ${L.pc.bay25} mm SATA drives only.`,
    ],
    hardware: L.hardware,
  };
}

/** A print-oriented tray part turned to how it sits in the rack: x across, y back, z up. */
export const installed = (mesh) => {
  const m = new Mesh(); m.append(mesh);
  const q = m.positions;
  for (let k = 0; k < q.length; k += 3) { const a = q[k], b = q[k + 1], c = q[k + 2]; q[k] = a; q[k + 1] = c; q[k + 2] = b; }
  // (a, b, c) → (a, c, b) is a mirror: flip each triangle back.
  const t = m.indices; for (let k = 0; k < t.length; k += 3) { const s = t[k + 1]; t[k + 1] = t[k + 2]; t[k + 2] = s; }
  return m;
};
