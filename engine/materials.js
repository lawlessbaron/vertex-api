// The material table every studio shares (Epic 1, phase 1A). Built on the filament
// catalogue (filaments.js) so there's one list of filaments on the site; this adds what a
// zone needs: can it carry load, does it need a hardened nozzle, which iron temperature
// sets inserts in it, and how it looks in the preview (roughness, metalness, clear-coat,
// and a normal map for carbon weave or wood grain, used by phase 1G).

import { FILAMENT_BY_ID } from './filaments.js';

// Filament family → the insert iron temperature key in fasteners.js IRON_TEMP.
const IRON = { PLA: 'PLA', 'PETG and polyesters': 'PETG', 'ABS, ASA and styrenics': 'ABS', Polycarbonate: 'PA', 'Nylon (PA)': 'PA', 'High-temperature': 'PA' };

const look = (f) => {
  const id = f.id;
  if (/-cf$/.test(id)) return { roughness: 0.75, metalness: 0, clearcoat: 0, normal: 'carbon' };
  if (id === 'pla-wood') return { roughness: 0.85, metalness: 0, clearcoat: 0, normal: 'wood' };
  if (id === 'pla-silk') return { roughness: 0.25, metalness: 0.35, clearcoat: 0.6, normal: null };
  if (id === 'pla-metal') return { roughness: 0.45, metalness: 0.6, clearcoat: 0, normal: null };
  if (id === 'pla-matte' || /-gf$/.test(id)) return { roughness: 0.9, metalness: 0, clearcoat: 0, normal: null };
  if (f.group === 'Flexible') return { roughness: 0.95, metalness: 0, clearcoat: 0, normal: null };
  if (id === 'pmma') return { roughness: 0.05, metalness: 0, clearcoat: 1, normal: null, transmission: 0.85 };
  if (f.group === 'PETG and polyesters') return { roughness: 0.35, metalness: 0, clearcoat: 0.4, normal: null };
  return { roughness: 0.55, metalness: 0, clearcoat: 0.1, normal: null };
};

/** A filament as a zone material, or null when the id isn't in the catalogue. */
export function materialOf(id) {
  const f = FILAMENT_BY_ID[id];
  if (!f) return null;
  return {
    id: f.id, name: f.name, group: f.group, density: f.density,
    abrasive: Boolean(f.abrasive),
    // Load-bearing: not flexible, not a support material, and stiff enough to hold a rack up.
    structural: f.group !== 'Flexible' && f.group !== 'Support and smoothing' && (f.stiffness ?? 1) >= 0.5,
    iron: IRON[f.group] || null,
    look: look(f),
  };
}

/** The default material a rack is printed in. */
export const DEFAULT_MATERIAL = 'petg';
