// Material zones (Epic 1, phase 1A). Every rack part belongs to a zone, every zone to a
// colour group (the rack's existing roles: accent, panel, body, art), and each zone can
// have its own material, colour and finish. A zone with nothing set inherits its group:
// the rack's colour settings (colFrame, colPanels, colGear) and the default material.
// So a rack with no zones comes out exactly as before, filament for filament.
//
// The geometry tags parts with their zone (serverrack.js); the studio's export and the
// build sheet read `rackFilaments()`. Picking zones in the 3D view is phase 1F; showing
// each zone's material in the preview is 1G.

import { DEFAULT_MATERIAL, materialOf } from '../materials.js';

// Zones in the order the studio lists them. `match` runs on the part's name; the first wins.
// `structural` zones carry load, so a flexible material there gets a warning (never a refusal).
export const ZONES = [
  { id: 'end-frames', name: 'End frames', group: 'accent', structural: true, match: /^end-frame/ },
  { id: 'splices', name: 'Splices', group: 'accent', structural: true, match: /^splice/ },
  { id: 'handles', name: 'Handles', group: 'accent', structural: true, match: /^handle/ },
  { id: 'sleds', name: 'Sleds and PDU brackets', group: 'accent', structural: false, match: /^(sled-|pdu-bracket)/ },
  { id: 'boards', name: 'Pi and Arduino sleds', group: 'body', structural: false, match: /^(pi-sled|uno-sled|mega-sled|nano-sled|\w+-sled)/ },
  { id: 'side-panels', name: 'Side panels', group: 'panel', structural: false, match: /^side-panel/ },
  { id: 'back-covers', name: 'Back covers', group: 'panel', structural: false, match: /^back-cover/ },
  { id: 'panel-art', name: 'Panel art', group: 'art', structural: false, match: /^panel-art/ },
  { id: 'uprights', name: 'Uprights and rails', group: 'body', structural: true, match: /^upright/ },
  { id: 'doors', name: 'Doors and hinges', group: 'body', structural: false, match: /^(side-door|door-hinge)/ },
  { id: 'front-panels', name: 'Front panels', group: 'body', structural: false, match: /^(blank|vent|fan|cable|patch|keystone|pi-panel|screen|control|rear-|io-)/ },
  { id: 'shelves', name: 'Shelves and plates', group: 'body', structural: true, match: /^(shelf|mount-plate|top-plate|bottom-plate|brace)/ },
  { id: 'bays', name: 'Drive bays and cartridges', group: 'body', structural: false, match: /^(cage-|drive-bay|cart)/ },
  { id: 'fittings', name: 'Small fittings', group: 'body', structural: false, match: /^(latch|encoder-knob|window-clip|pdu-cup|cable-ring|foot|feet|bumper|plinth)/ }, // bumpers and feet: TPU suits them
  { id: 'other', name: 'Everything else', group: 'body', structural: false, match: /./ },
];
export const ZONE_BY_ID = Object.fromEntries(ZONES.map((z) => [z.id, z]));

// The groups' colours: the rack's colour settings, else the Mint Motive defaults.
const HEX = /^#[0-9a-f]{6}$/i;
const hex = (v, d) => (HEX.test(v || '') ? v.toLowerCase() : d);
export function groupColours(o = {}) {
  return { accent: hex(o.colFrame, '#9ec4b5'), panel: hex(o.colPanels, '#f1ece0'), body: hex(o.colGear, '#3a3f45'), rail: hex(o.colRails, '#3a3f45'), gear: hex(o.colGear, '#2c3035'), glass: '#26303a' };
}

/** A part's zone, from its name (and its role for panel art, whose names carry their colour). */
export function zoneOf(name, role) {
  if (role === 'art') return 'panel-art';
  return ZONES.find((z) => z.match.test(String(name)))?.id || 'other';
}

export const FINISHES = ['matte', 'satin', 'gloss'];

/**
 * The `zones` setting, cleaned: { [zoneId]: { material?, colour?, finish? } }. It may come
 * as an object or as JSON text from a share link; anything unknown is dropped.
 */
export function parseZones(input) {
  let raw = input;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [id, v] of Object.entries(raw)) {
    if (!ZONE_BY_ID[id] || id === 'panel-art' || !v || typeof v !== 'object') continue;
    const z = {};
    if (materialOf(v.material)) z.material = v.material;
    if (HEX.test(v.colour || '')) z.colour = v.colour.toLowerCase();
    if (FINISHES.includes(v.finish)) z.finish = v.finish;
    if (Object.keys(z).length) out[id] = z;
  }
  return out;
}

/** Each zone's material, colour and finish: its own setting, else its group's. */
// The studio's Materials controls (phase 1G): a material and a finish for the frame, the panels and the rails,
// each standing for its zones (a zone set in `zones` itself wins).
const FLAT = { Frame: ['end-frames', 'splices', 'handles'], Panels: ['side-panels', 'back-covers'], Rails: ['uprights', 'front-panels', 'doors'] };
function flatZones(o) {
  const out = {};
  for (const [k, ids] of Object.entries(FLAT)) {
    const m = materialOf(o[`mat${k}`]) ? o[`mat${k}`] : null, f = FINISHES.includes(o[`fin${k}`]) ? o[`fin${k}`] : null;
    if (m || f) for (const id of ids) out[id] = { ...(m ? { material: m } : {}), ...(f ? { finish: f } : {}) };
  }
  return out;
}
export function resolveZones(o = {}) {
  const set = { ...flatZones(o), ...parseZones(o.zones) }, cols = groupColours(o);
  const base = materialOf(o.material) ? o.material : DEFAULT_MATERIAL;
  return Object.fromEntries(ZONES.map((z) => {
    const s = set[z.id] || {};
    return [z.id, { zone: z.id, name: z.name, group: z.group, structural: z.structural, material: s.material || base, colour: s.colour || cols[z.group] || cols.body, finish: s.finish || 'matte', custom: Boolean(set[z.id]) }];
  }));
}

/**
 * The export plan: each part's filament slot, colour and label. The slots keep the rack's
 * long-standing order, so a rack with no zones is unchanged:
 *   1 body (charcoal), 2 accent (mint), 3 panels (eggshell),
 * then one slot per zone that differs from its group, then each panel-art colour.
 * Parts: [{ name, role, colour?, zone? }] as generateServerRack returns them.
 */
export function rackFilaments(parts, o = {}) {
  const zones = resolveZones(o), cols = groupColours(o);
  const base = materialOf(o.material) ? o.material : DEFAULT_MATERIAL;
  const slots = new Map(); // key → slot
  const key = (material, colour) => `${material}|${colour}`;
  slots.set(key(base, cols.body), 1);
  if (!slots.has(key(base, cols.accent))) slots.set(key(base, cols.accent), 2);
  if (!slots.has(key(base, cols.panel))) slots.set(key(base, cols.panel), 3);
  let next = 4;
  // Custom zones, in zone order, so the numbering doesn't depend on part order.
  for (const z of ZONES) {
    const r = zones[z.id];
    if (z.id === 'panel-art' || !r.custom) continue;
    const k = key(r.material, r.colour);
    if (!slots.has(k)) slots.set(k, next++);
  }
  const art = [...new Set(parts.filter((p) => p.role === 'art').map((p) => p.colour))];
  const artBase = next;
  const legacySlot = { accent: 2, panel: 3 };
  const out = parts.map((p) => {
    const zone = p.zone || zoneOf(p.name, p.role);
    if (p.role === 'art') {
      const i = art.indexOf(p.colour);
      return { zone, filament: artBase + i, color: p.colour, material: base, detail: `Panel art colour ${i + 1} (${p.colour})` };
    }
    const r = zones[zone];
    // A part whose zone isn't customised keeps its role's slot and colour, exactly as before.
    if (!r.custom) {
      const slot = legacySlot[p.role] || 1, colour = p.role === 'accent' ? cols.accent : p.role === 'panel' ? cols.panel : cols.body;
      return { zone, filament: slot, color: colour, material: base, detail: p.role === 'accent' ? 'Accent filament (mint)' : p.role === 'panel' ? 'Panel filament' : undefined };
    }
    const m = materialOf(r.material);
    return { zone, filament: slots.get(key(r.material, r.colour)), color: r.colour, material: r.material, detail: `${r.name}: ${m.name}, ${r.colour}${r.finish !== 'matte' ? `, ${r.finish}` : ''}` };
  });
  return { parts: out, filaments: next - 1 + art.length, zones };
}

/** Guard rails for zone choices, in plain words. Never a refusal. */
export function zoneNotes(o = {}) {
  const zones = resolveZones(o), notes = [];
  for (const z of Object.values(zones)) {
    if (!z.custom) continue;
    const m = materialOf(z.material);
    if (z.structural && !m.structural) notes.push(`${z.name} carry the rack's load; ${m.name} is flexible or soft, so they'll sag. Use it for bumpers and feet, and a rigid filament here.`);
    if (m.abrasive) notes.push(`${z.name}: ${m.name} wears a brass nozzle out. Use a hardened steel nozzle.`);
  }
  return [...new Set(notes)];
}

// Phase 1G: how each part looks in the preview. A role's group gives its zone material's look (roughness,
// metalness, clear-coat, carbon or wood maps, see-through), and the zone's finish sets the sheen: matte (the
// spec's default: low gloss, a soft highlight), satin, gloss or silk. Glass is clear; insert sheets look
// like what they are (rack-inserts' tints: wood, acrylic, aluminium).
const FINISH = { matte: { roughness: 0.8, clearcoat: 0 }, satin: { roughness: 0.5, clearcoat: 0.15 }, gloss: { roughness: 0.2, clearcoat: 0.5 }, silk: { roughness: 0.25, clearcoat: 0.6, metalness: 0.35 } };
const SHEETS = { '#8a4f2c': { roughness: 0.7, metalness: 0, clearcoat: 0.2, normal: 'wood' }, '#9fc6d8': { roughness: 0.05, metalness: 0, clearcoat: 1, transmission: 0.6 }, '#b9bec4': { roughness: 0.35, metalness: 0.85, clearcoat: 0, normal: 'brushed' } };
const ROLE_GROUP = { accent: 'accent', panel: 'panel', rail: 'body', gear: 'body', body: 'body' };
export function roleLook(role = '', o = {}) {
  if (role === 'glass') return { roughness: 0.08, metalness: 0, clearcoat: 1, transmission: 0.35 };
  if (role.startsWith('art:')) return SHEETS[role.slice(4).toLowerCase()] || { ...FINISH.matte, metalness: 0 };
  const group = ROLE_GROUP[role] || 'body', zones = Object.values(resolveZones(o)).filter((z) => z.group === group);
  const z = zones.find((x) => x.custom) || zones[0];
  const m = materialOf(z?.material) || materialOf(DEFAULT_MATERIAL);
  const f = FINISH[z?.finish] || FINISH.matte, look = m.look;
  // A material with its own character (silk, metal-fill, carbon, wood, clear) keeps it; the finish sets the rest.
  const own = look.normal || look.metalness > 0 || look.transmission;
  return own ? { ...look } : { roughness: f.roughness, metalness: f.metalness || 0, clearcoat: f.clearcoat, normal: null };
}
