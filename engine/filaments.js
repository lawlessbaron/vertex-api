// Every FDM filament family and its common variants, in one place: used by
// the Deck Foundry engine (to build each part for its material), printer
// preferences, build logs and the filament guide at /filaments.
//
// Figures are typical values from manufacturers' datasheets, for planning.
// Brands vary; always check the spool. strength and stiffness are relative
// to PLA (1.0). heat is roughly the temperature a printed part starts to
// soften under load, in °C. skeleton marks materials strong and stiff
// enough for Deck Foundry's open lattice.
//
// Fields: id, name, group, density (g/cm³), nozzle [min, max] °C, bed [min, max] °C,
// enclosure (needs one), dry (°C to dry before printing), abrasive (needs a
// hardened nozzle), strength, stiffness, heat, skeleton, note.

const F = (id, name, group, density, nozzle, bed, { enclosure = false, dry = 50, abrasive = false, strength = 1, stiffness = 1, heat = 55, skeleton = false, note = '' } = {}) =>
  ({ id, name, group, density, nozzle, bed, enclosure, dry, abrasive, strength, stiffness, heat, skeleton, note });

export const FILAMENT_GROUPS = ['PLA', 'PETG and polyesters', 'ABS, ASA and styrenics', 'Polycarbonate', 'Nylon (PA)', 'Polypropylene and polyolefins', 'Flexible', 'Support and smoothing', 'High-temperature', 'Specialty'];

export const FILAMENT_CATALOGUE = [
  // PLA
  F('pla', 'PLA', 'PLA', 1.24, [190, 220], [45, 60], { strength: 1.0, stiffness: 1.0, heat: 55, note: 'The easy default. Softens in a hot car.' }),
  F('pla-plus', 'PLA+ / Tough PLA', 'PLA', 1.23, [200, 230], [50, 60], { strength: 1.15, stiffness: 0.9, heat: 55, note: 'Modified PLA: less brittle, a little more flexible.' }),
  F('pla-matte', 'Matte PLA', 'PLA', 1.3, [200, 220], [55, 60], { strength: 0.85, stiffness: 0.95, heat: 55, note: 'Hides layer lines; slightly weaker between layers.' }),
  F('pla-silk', 'Silk PLA', 'PLA', 1.24, [205, 230], [55, 60], { strength: 0.75, stiffness: 0.85, heat: 55, note: 'Shiny finish; weaker layer bonding. Looks, not load.' }),
  F('pla-hs', 'High-speed PLA', 'PLA', 1.24, [200, 230], [55, 65], { strength: 0.95, stiffness: 1.0, heat: 55, note: 'Flows fast for high-speed printers.' }),
  F('pla-ht', 'HT-PLA (annealable)', 'PLA', 1.25, [205, 230], [55, 65], { strength: 1.0, stiffness: 1.05, heat: 90, note: 'Bake after printing for heat resistance; parts shrink a little.' }),
  F('pla-cf', 'PLA-CF', 'PLA', 1.29, [210, 240], [55, 65], { abrasive: true, strength: 1.0, stiffness: 1.45, heat: 57, skeleton: true, note: 'Carbon fibre: stiffer and matte, needs a hardened nozzle.' }),
  F('pla-gf', 'PLA-GF', 'PLA', 1.35, [210, 240], [55, 65], { abrasive: true, strength: 1.05, stiffness: 1.35, heat: 58, skeleton: true, note: 'Glass fibre: stiff, less brittle than CF.' }),
  F('pla-wood', 'Wood PLA', 'PLA', 1.2, [190, 220], [50, 60], { abrasive: true, strength: 0.7, stiffness: 0.85, heat: 55, note: 'Real wood fibres; use a 0.6 mm nozzle to avoid clogs.' }),
  F('pla-marble', 'Marble / stone PLA', 'PLA', 1.3, [200, 220], [55, 60], { strength: 0.8, stiffness: 1.0, heat: 55 }),
  F('pla-metal', 'Metal-filled PLA', 'PLA', 3.5, [195, 220], [55, 60], { abrasive: true, strength: 0.6, stiffness: 1.1, heat: 55, note: 'Copper, bronze or steel powder: heavy, can be polished.' }),
  F('pla-glow', 'Glow-in-the-dark PLA', 'PLA', 1.3, [200, 220], [55, 60], { abrasive: true, strength: 0.85, stiffness: 1.0, heat: 55, note: 'Very abrasive: use a hardened nozzle.' }),
  F('pla-sparkle', 'Sparkle / galaxy PLA', 'PLA', 1.25, [200, 220], [55, 60], { strength: 0.95, stiffness: 1.0, heat: 55 }),
  F('pla-lw', 'Lightweight foaming PLA (LW-PLA)', 'PLA', 0.8, [200, 250], [50, 60], { strength: 0.5, stiffness: 0.5, heat: 55, note: 'Foams as it prints: up to 60% lighter. Density shown is as printed.' }),

  // PETG and other polyesters
  F('petg', 'PETG', 'PETG and polyesters', 1.27, [230, 250], [70, 85], { dry: 65, strength: 0.95, stiffness: 0.8, heat: 70, note: 'Tough and a little flexible; good outdoors in the shade.' }),
  F('petg-hf', 'High-flow PETG', 'PETG and polyesters', 1.27, [230, 260], [70, 85], { dry: 65, strength: 0.95, stiffness: 0.8, heat: 70 }),
  F('petg-cf', 'PETG-CF', 'PETG and polyesters', 1.29, [240, 270], [70, 85], { dry: 65, abrasive: true, strength: 1.2, stiffness: 1.5, heat: 75, skeleton: true }),
  F('petg-gf', 'PETG-GF', 'PETG and polyesters', 1.35, [240, 270], [70, 85], { dry: 65, abrasive: true, strength: 1.15, stiffness: 1.35, heat: 78, skeleton: true }),
  F('pctg', 'PCTG', 'PETG and polyesters', 1.23, [240, 270], [70, 90], { dry: 65, strength: 1.05, stiffness: 0.75, heat: 70, note: 'Tougher, clearer cousin of PETG.' }),
  F('cpe', 'CPE (co-polyester)', 'PETG and polyesters', 1.27, [240, 260], [70, 85], { dry: 65, strength: 1.0, stiffness: 0.8, heat: 72 }),
  F('pet-cf', 'PET-CF', 'PETG and polyesters', 1.29, [260, 290], [70, 90], { enclosure: true, dry: 80, abrasive: true, strength: 1.4, stiffness: 1.9, heat: 150, skeleton: true, note: 'Stiff and heat resistant; dry before printing.' }),

  // ABS, ASA and other styrenics
  F('abs', 'ABS', 'ABS, ASA and styrenics', 1.04, [240, 260], [90, 110], { enclosure: true, dry: 70, strength: 0.95, stiffness: 0.85, heat: 90, skeleton: true, note: 'Heat resistant; needs an enclosure and ventilation.' }),
  F('abs-gf', 'ABS-GF', 'ABS, ASA and styrenics', 1.12, [250, 270], [90, 110], { enclosure: true, dry: 70, abrasive: true, strength: 1.05, stiffness: 1.3, heat: 95, skeleton: true }),
  F('abs-cf', 'ABS-CF', 'ABS, ASA and styrenics', 1.1, [250, 270], [90, 110], { enclosure: true, dry: 70, abrasive: true, strength: 1.0, stiffness: 1.5, heat: 95, skeleton: true }),
  F('abs-fr', 'Flame-retardant ABS', 'ABS, ASA and styrenics', 1.18, [240, 260], [90, 110], { enclosure: true, dry: 70, strength: 0.9, stiffness: 0.9, heat: 90, skeleton: true, note: 'UL94 V-0 grades for electronics enclosures.' }),
  F('asa', 'ASA', 'ABS, ASA and styrenics', 1.07, [240, 260], [90, 110], { enclosure: true, dry: 70, strength: 1.05, stiffness: 0.9, heat: 95, skeleton: true, note: 'Like ABS but UV stable: the outdoor and garage choice.' }),
  F('asa-cf', 'ASA-CF', 'ABS, ASA and styrenics', 1.12, [250, 270], [90, 110], { enclosure: true, dry: 70, abrasive: true, strength: 1.05, stiffness: 1.5, heat: 100, skeleton: true }),
  F('hips', 'HIPS', 'ABS, ASA and styrenics', 1.04, [230, 250], [90, 110], { enclosure: true, dry: 65, strength: 0.8, stiffness: 0.75, heat: 90, note: 'Light and impact resistant; also a limonene-soluble support for ABS.' }),

  // Polycarbonate
  F('pc', 'PC (polycarbonate)', 'Polycarbonate', 1.2, [260, 300], [100, 120], { enclosure: true, dry: 80, strength: 1.4, stiffness: 0.95, heat: 115, skeleton: true, note: 'Very tough and heat resistant; warps without an enclosure.' }),
  F('pc-abs', 'PC-ABS', 'Polycarbonate', 1.15, [250, 280], [100, 110], { enclosure: true, dry: 80, strength: 1.2, stiffness: 0.9, heat: 105, skeleton: true }),
  F('pc-cf', 'PC-CF', 'Polycarbonate', 1.25, [270, 300], [100, 120], { enclosure: true, dry: 80, abrasive: true, strength: 1.4, stiffness: 1.6, heat: 125, skeleton: true }),
  F('pc-fr', 'Flame-retardant PC', 'Polycarbonate', 1.25, [260, 290], [100, 120], { enclosure: true, dry: 80, strength: 1.3, stiffness: 0.95, heat: 110, skeleton: true }),

  // Nylon
  F('pa', 'Nylon (PA6 / PA66)', 'Nylon (PA)', 1.13, [250, 280], [70, 90], { enclosure: true, dry: 80, strength: 1.3, stiffness: 0.6, heat: 70, note: 'Tough and slippery; soaks up moisture, so keep it dry.' }),
  F('pa12', 'Nylon 12 (PA12)', 'Nylon (PA)', 1.01, [250, 270], [70, 90], { enclosure: true, dry: 80, strength: 1.1, stiffness: 0.6, heat: 60, note: 'Absorbs less water than PA6.' }),
  F('pa-cf', 'PA-CF (nylon)', 'Nylon (PA)', 1.15, [260, 300], [80, 100], { enclosure: true, dry: 80, abrasive: true, strength: 1.6, stiffness: 1.8, heat: 120, skeleton: true, note: 'Stiff, strong and heat resistant: the go-to engineering filament.' }),
  F('pa-gf', 'PA-GF', 'Nylon (PA)', 1.25, [260, 300], [80, 100], { enclosure: true, dry: 80, abrasive: true, strength: 1.5, stiffness: 1.6, heat: 130, skeleton: true }),
  F('paht-cf', 'PAHT-CF', 'Nylon (PA)', 1.2, [260, 300], [80, 100], { enclosure: true, dry: 80, abrasive: true, strength: 1.7, stiffness: 2.0, heat: 190, skeleton: true, note: 'High-temperature nylon: engine bays and motor mounts.' }),
  F('ppa-cf', 'PPA-CF', 'Nylon (PA)', 1.25, [290, 320], [100, 120], { enclosure: true, dry: 90, abrasive: true, strength: 1.9, stiffness: 2.4, heat: 220, skeleton: true, note: 'Polyphthalamide: near-metal stiffness; needs a hot chamber.' }),

  // Polypropylene and other polyolefins
  F('pp', 'PP (polypropylene)', 'Polypropylene and polyolefins', 0.9, [220, 250], [80, 100], { dry: 60, strength: 0.6, stiffness: 0.35, heat: 85, note: 'Light, chemical resistant, living hinges. Only sticks to PP tape.' }),
  F('pp-gf', 'PP-GF', 'Polypropylene and polyolefins', 1.05, [230, 260], [80, 100], { dry: 60, abrasive: true, strength: 0.9, stiffness: 1.0, heat: 120, skeleton: true }),
  F('pp-cf', 'PP-CF', 'Polypropylene and polyolefins', 0.98, [230, 260], [80, 100], { dry: 60, abrasive: true, strength: 0.85, stiffness: 1.1, heat: 110, skeleton: true }),
  F('hdpe', 'HDPE', 'Polypropylene and polyolefins', 0.95, [230, 260], [90, 110], { dry: 60, strength: 0.5, stiffness: 0.3, heat: 75, note: 'Hard to print: warps and barely sticks.' }),

  // Flexible
  F('tpu', 'TPU 95A', 'Flexible', 1.21, [210, 240], [30, 60], { dry: 55, strength: 0.5, stiffness: 0.1, heat: 60, note: 'The common flexible: feet, bumpers, gaskets.' }),
  F('tpu-90a', 'TPU 90A', 'Flexible', 1.2, [210, 240], [30, 60], { dry: 55, strength: 0.45, stiffness: 0.07, heat: 60 }),
  F('tpu-85a', 'TPU 85A', 'Flexible', 1.2, [210, 235], [30, 60], { dry: 55, strength: 0.4, stiffness: 0.05, heat: 60, note: 'Soft: print slowly, direct drive helps.' }),
  F('tpu-64d', 'TPU 64D / 68D', 'Flexible', 1.2, [220, 250], [30, 60], { dry: 55, strength: 0.7, stiffness: 0.25, heat: 70, note: 'Firm flexible; can go through an AMS.' }),
  F('tpe', 'TPE', 'Flexible', 1.2, [210, 230], [30, 60], { dry: 55, strength: 0.3, stiffness: 0.04, heat: 55, note: 'Softer and stretchier than TPU.' }),
  F('peba', 'PEBA', 'Flexible', 1.01, [220, 250], [30, 60], { dry: 60, strength: 0.5, stiffness: 0.08, heat: 70, note: 'Very springy and light: shoe midsoles.' }),

  // Support and smoothing
  F('pva', 'PVA (water-soluble support)', 'Support and smoothing', 1.23, [190, 220], [45, 60], { dry: 55, strength: 0.8, stiffness: 0.7, heat: 60, note: 'Dissolves in water; store sealed and dry.' }),
  F('bvoh', 'BVOH (water-soluble support)', 'Support and smoothing', 1.14, [190, 220], [55, 65], { dry: 55, strength: 0.8, stiffness: 0.7, heat: 60, note: 'Dissolves faster than PVA; pairs with PLA and PETG.' }),
  F('support-breakaway', 'Breakaway support', 'Support and smoothing', 1.2, [210, 230], [55, 70], { strength: 0.6, stiffness: 0.7, heat: 60 }),
  F('pvb', 'PVB (alcohol-smoothable)', 'Support and smoothing', 1.08, [190, 215], [60, 75], { dry: 50, strength: 0.8, stiffness: 0.7, heat: 60, note: 'Smooths to a glossy finish with isopropyl alcohol vapour.' }),

  // High-temperature engineering
  F('peek', 'PEEK', 'High-temperature', 1.3, [370, 420], [120, 160], { enclosure: true, dry: 150, strength: 2.3, stiffness: 1.4, heat: 150, skeleton: true, note: 'Needs a 370 °C+ hotend and a heated chamber.' }),
  F('peek-cf', 'PEEK-CF', 'High-temperature', 1.4, [380, 420], [120, 160], { enclosure: true, dry: 150, abrasive: true, strength: 2.6, stiffness: 3.0, heat: 250, skeleton: true }),
  F('pekk', 'PEKK', 'High-temperature', 1.3, [340, 380], [120, 150], { enclosure: true, dry: 150, strength: 2.0, stiffness: 1.3, heat: 160, skeleton: true }),
  F('pei-1010', 'PEI 1010 (ULTEM™ 1010)', 'High-temperature', 1.27, [370, 400], [140, 160], { enclosure: true, dry: 150, strength: 1.9, stiffness: 1.1, heat: 210, skeleton: true }),
  F('pei-9085', 'PEI 9085 (ULTEM™ 9085)', 'High-temperature', 1.34, [360, 390], [130, 160], { enclosure: true, dry: 150, strength: 1.6, stiffness: 0.9, heat: 150, skeleton: true, note: 'Flame retardant; used in aircraft interiors.' }),
  F('pps-cf', 'PPS-CF', 'High-temperature', 1.3, [300, 340], [100, 130], { enclosure: true, dry: 120, abrasive: true, strength: 1.5, stiffness: 2.3, heat: 220, skeleton: true, note: 'Chemical and flame resistant.' }),
  F('ppsu', 'PPSU', 'High-temperature', 1.29, [370, 400], [140, 160], { enclosure: true, dry: 150, strength: 1.3, stiffness: 0.8, heat: 205, skeleton: true }),
  F('psu', 'PSU (polysulfone)', 'High-temperature', 1.24, [340, 380], [130, 150], { enclosure: true, dry: 130, strength: 1.2, stiffness: 0.9, heat: 170, skeleton: true }),
  F('pom', 'POM (acetal)', 'High-temperature', 1.41, [210, 230], [100, 130], { enclosure: true, dry: 80, strength: 1.1, stiffness: 1.0, heat: 100, skeleton: true, note: 'Slippery and wear resistant (gears); very hard to keep on the bed.' }),
  F('pmma', 'PMMA (acrylic)', 'High-temperature', 1.18, [240, 260], [100, 110], { enclosure: true, dry: 80, strength: 1.0, stiffness: 1.1, heat: 90, note: 'Clear and glossy; brittle.' }),

  // Specialty
  F('pla-conductive', 'Conductive PLA', 'Specialty', 1.25, [210, 230], [55, 60], { strength: 0.8, stiffness: 1.0, heat: 55, note: 'Carbon-loaded: low-voltage circuits and touch pads.' }),
  F('petg-esd', 'ESD-safe PETG', 'Specialty', 1.27, [230, 250], [70, 85], { dry: 65, strength: 0.9, stiffness: 0.85, heat: 70, note: 'Static dissipative: electronics trays and jigs.' }),
  F('pla-magnetic', 'Magnetic (iron-filled) PLA', 'Specialty', 2.0, [195, 220], [55, 60], { abrasive: true, strength: 0.6, stiffness: 1.0, heat: 55, note: 'Sticks to magnets; rusts to a patina.' }),
  F('pla-ceramic', 'Ceramic-filled PLA', 'Specialty', 1.6, [200, 220], [55, 60], { abrasive: true, strength: 0.7, stiffness: 1.1, heat: 55 }),
];

export const FILAMENT_BY_ID = Object.fromEntries(FILAMENT_CATALOGUE.map((f) => [f.id, f]));

// The seven profiles the Tectonic Deck specification lists (§9.1).
export const REFERENCE_FILAMENTS = ['pla', 'petg', 'asa', 'abs', 'petg-cf', 'pa-cf', 'tpu'];

// [value, label, group] triples for <select>s, grouped by family.
export const FILAMENT_OPTIONS = FILAMENT_CATALOGUE.map((f) => [f.id, f.name, f.group]);

// Find a catalogue entry from a free-typed name ("petg cf", "PA-CF (nylon)").
export function findFilament(text) {
  const key = String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!key) return null;
  return FILAMENT_CATALOGUE.find((f) => f.id.replace(/[^a-z0-9]/g, '') === key || f.name.toLowerCase().replace(/[^a-z0-9]+/g, '') === key) || null;
}
