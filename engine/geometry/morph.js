// Deck Foundry's engine (it was MotiveMorph's; the `morph` key stays so links,
// saved designs and engine access carry over). It makes the Tectonic Deck and
// nothing else: the parts are built in deck.js. The old MotiveMesh parts (Desk
// Pods, wall tiles, bins, shelves, hooks, pins and clips) were removed; a saved
// design that asks for one opens as a deck.
import { DECK_DEFAULTS, DECK_ITEMS, generateDeck } from './deck.js';
import { FILAMENT_CATALOGUE } from '../filaments.js';

// Every FDM filament the site knows (public/js/filaments.js): its name,
// family and density, for the weight and the print time.
export const FILAMENTS = Object.fromEntries(FILAMENT_CATALOGUE.map((f) => [f.id, { name: f.name, group: f.group, density: f.density, stiffness: f.stiffness }]));

export const MORPH_ITEMS = { ...DECK_ITEMS };

export const MORPH_DEFAULTS = {
  ...DECK_DEFAULTS,
  item: 'deck',
  filament: 'petg',
  clearance: 0.2,
  useFit: false, // the studio adds the Material Memory hole offset to the clearance when on
};

const itemOf = (o) => (DECK_ITEMS[o.item] ? o.item : 'deck');

export function generateMorph(options = {}) {
  const o = { ...MORPH_DEFAULTS, ...options };
  o.item = itemOf(o);
  const d = generateDeck(o);
  return { plan: { filament: FILAMENTS[o.filament] || FILAMENTS.petg }, parts: d.parts, assembly: d.assembly, stats: { ...d.stats, notes: d.notes } };
}

// The parts and what printing them takes: grams (solid, before your slicer's
// infill; each file counted as many times as it's printed) and a rough time.
export function morphReport(options = {}) {
  const g = generateMorph(options);
  const vol = g.parts.reduce((s, p) => s + p.mesh.volume() * (p.copies || 1), 0);
  const prints = g.parts.reduce((s, p) => s + (p.copies || 1), 0);
  return { ...g, report: { grams: Math.round((vol / 1000) * g.plan.filament.density), minutes: Math.max(1, Math.round(vol / 9 / 60 + prints * 2)) } };
}
