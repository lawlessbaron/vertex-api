// Underware 2.0 channels, by Hands on Katie and BlackjackDuck (Andy Levesque).
// Underware is shared under Creative Commons BY-NC-SA 4.0: free to use and
// remix with credit, never for commercial use, and remixes keep the same
// licence. VERTEX files use the same licence, but these are the designers’ work: every file
// carries the credit and the licence (see UNDERWARE_LICENCE), VERTEX never
// charges for them, and they are left out of VERTEX's commercial licence.
//
// The profile below follows the published Underware 2.0 "Original" profile
// (the Master Profile coordinates in the QuackWorks Underware files), half a
// 25 mm channel at a time, widened in the middle for wider channels. Straight
// (I) channels only, for now: a base that screws or sticks under the desk, and
// a top that snaps onto it.
import { Mesh } from './mesh.js';
import { circlePolygon, extrudePolygon } from './polygon.js';
import { loftShell } from './opengrid.js';

export const UNDERWARE_LICENCE = {
  name: 'Underware 2.0',
  designers: 'Hands on Katie and BlackjackDuck (Andy Levesque)',
  licence: 'CC-BY-NC-SA-4.0',
  licenceName: 'Creative Commons Attribution-NonCommercial-ShareAlike 4.0',
  url: 'https://handsonkatie.com/underware-2-0-the-made-to-measure-collection/',
  site: 'https://www.handsonkatie.com/',
  note: 'Free for personal, non-commercial use. Not for sale. Remixes must credit the designers and use the same licence. Generated free by VERTEX (vertex.mintmotive.com.au), which never charges for Underware parts.',
};

export const UW = { grid: 25, baseHeight: 9.63, topHeight: 10.968, floor: 3.5, screw: { thread: 3.5, head: 7, headDepth: 1.75 }, m3: { thread: 3.4, head: 6.2, headDepth: 1.5 }, ogPitch: 28 };
export const UNDERWARE_DEFAULTS = { item: 'channel', widthUnits: 1, lengthUnits: 4, height: 12, mount: 'wood' };

// Half the base, x ≤ 0 (the channel's centre line at x = 0), y up from the underside.
const BASE_HALF = [[0, 3.5], [-8.5, 3.5], [-9.5, 4.5], [-9.5, 9.63], [-10.517, 9.63], [-11.459, 9.369], [-11.459, 7.65], [-11.166, 7.355], [-11.166, 6.533], [-11.666, 6.033], [-12.517, 6.033], [-12.517, 3.499], [-10.517, 1.499], [-10.517, 0], [0, 0]];
// Half the top, as it sits on the base (y up from the bottom of its legs), for an inside height h.
const topHalf = (h) => {
  const e = h - 12;
  // From the top's outer corner round to the ceiling's: the mirrored halves join straight across (no points on the middle line,
  // which left a zero-width sliver in the lid and an open edge in the mesh).
  return [[-8.517, 10.968 + e], [-12.517, 6.968 + e], [-12.517, 0], [-11.166, 0], [-11.166, 0.822], [-11.459, 1.117], [-11.459, 2.836], [-10.517, 3.097], [-10.517, 6.139 + e], [-7.688, 8.968 + e]];
};

export function normaliseUnderware(o = {}) {
  const p = { ...UNDERWARE_DEFAULTS, ...o };
  const int = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  p.item = ['channel', 'base', 'top'].includes(p.item) ? p.item : 'channel';
  p.widthUnits = int(p.widthUnits, 1, 4, 1);
  p.lengthUnits = int(p.lengthUnits, 1, 16, 4);
  p.height = Math.min(72, Math.max(12, 12 + 6 * Math.round((Number(p.height) - 12) / 6) || 12));
  p.mount = ['wood', 'opengrid', 'flat'].includes(p.mount) ? p.mount : 'wood';
  return p;
}

// A [x, z] profile extruded along y from 0 to L (the channel runs along y).
function along(profile, L) {
  const m = extrudePolygon(profile, [], 0, L);
  const P = m.positions;
  for (let k = 0; k < P.length; k += 3) { const [x, y, z] = [P[k], P[k + 1], P[k + 2]]; P[k] = x; P[k + 1] = z; P[k + 2] = y; }
  for (let t = 0; t < m.indices.length; t += 3) { const b = m.indices[t + 1]; m.indices[t + 1] = m.indices[t + 2]; m.indices[t + 2] = b; }
  return m;
}
// Mirror a half profile to the right, pulling the halves apart by 2d for a wider channel.
function fullProfile(half, d) {
  const left = half.map(([x, y]) => [x - d, y]);
  const right = [...half].reverse().map(([x, y]) => [-x + d, y]);
  const pts = [...left, ...right];
  return pts.filter((q, i) => { const n = pts[(i + 1) % pts.length]; return Math.hypot(q[0] - n[0], q[1] - n[1]) > 1e-9; });
}

/** Screw holes on the 25 mm grid, inside the channel floor. */
export function underwareHoles(p) {
  const out = [];
  // On openGrid: countersunk M3 holes down the middle, 28 mm apart on the cell centres, into screw snaps.
  if (p.mount === 'opengrid') {
    for (let y = UW.ogPitch / 2; y <= p.lengthUnits * UW.grid - 6; y += UW.ogPitch) out.push([0, y]);
    return out;
  }
  if (p.mount !== 'wood') return out;
  for (let i = 0; i < p.lengthUnits; i++) for (let j = 0; j < p.widthUnits; j++) out.push([(j + 0.5 - p.widthUnits / 2) * UW.grid, (i + 0.5) * UW.grid]);
  return out;
}

/** The base: the floor (with countersunk wood-screw holes) and the two snap walls. Prints floor down. */
export function underwareBase(o = {}) {
  const p = normaliseUnderware(o);
  const W = p.widthUnits * UW.grid, d = (W - UW.grid) / 2, L = p.lengthUnits * UW.grid;
  const holes = underwareHoles(p);
  const S = p.mount === 'opengrid' ? UW.m3 : UW.screw, rT = S.thread / 2, rH = S.head / 2, zC = UW.floor - S.headDepth;
  const r = (z) => (z <= zC ? rT : rT + ((rH - rT) * (z - zC)) / S.headDepth);
  // The floor, lofted up through the outside chamfer, so the screw holes go straight through it.
  const rect = (hw) => [[-hw, 0], [hw, 0], [hw, L], [-hw, L]];
  const lv = (z, hw) => ({ z, outer: rect(hw), holes: holes.map(([x, y]) => circlePolygon(x, y, r(z), 24)) });
  const inner = 10.517 + d, outer = 12.517 + d;
  const floorLevels = [lv(0, inner), lv(1.499, inner)];
  if (holes.length) floorLevels.push(lv(zC, inner + (zC - 1.499)));
  floorLevels.push(lv(UW.floor, outer));
  const m = new Mesh();
  m.append(loftShell(floorLevels));
  // The walls, from the floor up (each side's snap ridge), extruded along the channel.
  const wall = BASE_HALF.slice(1, 12).map(([x, y]) => [x - d, y === 3.5 || y === 3.499 ? UW.floor - 0.01 : y]);
  m.append(along(wall, L));
  m.append(along([...wall].reverse().map(([x, y]) => [-x, y]), L));
  return m;
}

/** The top, built as it sits on the base; turned roof-down to print unless `asFitted`. */
export function underwareTop(o = {}, asFitted = false) {
  const p = normaliseUnderware(o);
  const W = p.widthUnits * UW.grid, d = (W - UW.grid) / 2, L = p.lengthUnits * UW.grid;
  // Wide or tall tops pull in 1% so they grip (as Underware's own generator does).
  const scale = p.widthUnits > 1 || p.height > 18 ? 0.99 : 1;
  const prof = fullProfile(topHalf(p.height), d).map(([x, y]) => [x * scale, y]);
  const m = along(prof, L);
  if (asFitted) return m;
  const top = 10.968 + (p.height - 12);
  const P = m.positions;
  for (let k = 0; k < P.length; k += 3) { P[k] = -P[k]; P[k + 2] = top - P[k + 2]; }
  return m;
}

const onBed = (m) => { const b = m.bounds(); return m.translate(-b.min[0], -b.min[1], -b.min[2]); };
export function underwareParts(o = {}) {
  const p = normaliseUnderware(o);
  const name = `underware-i-channel-${p.widthUnits}u-${p.lengthUnits * UW.grid}mm-h${p.height}`;
  if (p.item === 'base') return { plan: p, parts: [{ mesh: onBed(underwareBase(p)), name: `${name}-base` }] };
  if (p.item === 'top') return { plan: p, parts: [{ mesh: onBed(underwareTop(p)), name: `${name}-top` }] };
  const m = new Mesh();
  const base = onBed(underwareBase(p));
  m.append(base);
  m.append(onBed(underwareTop(p)).translate(base.bounds().size[0] + 8, 0, 0));
  return { plan: p, parts: [{ mesh: m, name }] };
}
