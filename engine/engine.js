// The VERTEX engine: its version, each generator's version, and what changed.
//
// When you change what a generator makes (its shapes, sizes, fit or defaults),
// bump that generator's version here, bump ENGINE.version, and add a line to the
// top of ENGINE_HISTORY saying what changed. Tests check the history and the
// versions agree. Every downloaded file and every saved design is stamped with
// the engine version that made it, so an old design can always be traced back.
//
// Versions are major.minor.patch: patch for a fix that doesn't change a
// finished part's shape much, minor for new options or refined geometry, major
// when a saved design would come out noticeably different.

export const ENGINE_MODULES = {
  gridfinity: { name: 'Gridfinity bins, baseplates and holders', version: '1.2.0' },
  skadis: { name: 'Skådis Studio', version: '1.1.0' },
  morph: { name: 'Deck Foundry (the Tectonic Deck)', version: '1.8.1' },
  enclosure: { name: 'Pi and Arduino cases', version: '1.0.1' },
  simrig: { name: 'Sim rig parts', version: '1.3.0' },
  tslot: { name: 'T-slot parts', version: '1.0.0' },
  buttonbox: { name: 'Button Box Workbench', version: '1.0.0' },
  utilities: { name: 'Test pieces (clearance, kerf)', version: '1.0.0' },
  badge: { name: 'The VERTEX badge', version: '1.0.0' },
  // Storage engines on the shared studio (engines/*.js), and the Honeycomb wall.
  opengrid: { name: 'openGrid', version: '1.5.0' },
  underware: { name: 'Underware (Hands on Katie)', version: '1.0.0' },
  cleat: { name: 'French cleat', version: '1.0.0' },
  pegboard: { name: 'Pegboard', version: '1.0.0' },
  drawers: { name: 'Stacking drawers', version: '1.0.0' },
  inserts: { name: 'Case inserts', version: '1.0.0' },
  cable: { name: 'Cable management', version: '1.4.0' },
  honeycomb: { name: 'Honeycomb wall', version: '1.0.0' },
  swatch: { name: 'Filament swatches', version: '1.0.0' },
  spool: { name: 'Spool and dry-box parts', version: '1.0.0' },
  knob: { name: 'Knobs and handles', version: '1.0.0' },
  dragchain: { name: 'Cable drag chains', version: '1.0.0' },
  hinge: { name: 'Hinges and hinged boxes', version: '1.0.0' },
  jar: { name: 'Screw-top containers', version: '1.0.0' },
  stand: { name: 'Phone and tablet stands', version: '1.0.0' },
  deskhook: { name: 'Desk hooks', version: '1.0.0' },
  planter: { name: 'Plant pots and drip trays', version: '1.0.0' },
  cutter: { name: 'Cookie cutters', version: '1.0.0' },
  keychain: { name: 'Name keychains and tags', version: '1.0.0' },
  bagclip: { name: 'Bag clips', version: '1.0.0' },
  coaster: { name: 'Coasters', version: '1.0.0' },
  cablewrap: { name: 'Cable wraps and winders', version: '1.0.0' },
  battery: { name: 'Battery organisers', version: '1.0.0' },
  shelfbracket: { name: 'Shelf brackets', version: '1.0.0' },
  headphone: { name: 'Headphone stands', version: '1.0.0' },
  keyrack: { name: 'Key racks', version: '1.0.0' },
  plantmarker: { name: 'Plant markers', version: '1.0.0' },
  toothbrush: { name: 'Toothbrush holders', version: '1.0.0' },
  spicerack: { name: 'Spice racks', version: '1.0.0' },
  broomholder: { name: 'Broom and mop holders', version: '1.0.0' },
  bookend: { name: 'Bookends', version: '1.0.0' },
  laptopstand: { name: 'Laptop stands', version: '1.0.0' },
  monitorriser: { name: 'Monitor risers', version: '1.0.0' },
  desktidy: { name: 'Pen pots and desk tidies', version: '1.0.0' },
  cablebox: { name: 'Cable boxes', version: '1.0.1' },
  chargedock: { name: 'Charging docks', version: '1.0.0' },
  deskdrawer: { name: 'Under-desk drawers', version: '1.0.0' },
  deskhanger: { name: 'Under-desk headphone hooks', version: '1.0.0' },
  controllerrack: { name: 'Controller and headset racks', version: '1.0.0' },
  grommet: { name: 'Desk cable grommets', version: '1.0.0' },
  serverrack: { name: 'Modular 10-inch server racks', version: '1.38.1' },
  leadhanger: { name: 'Extension lead and hose hangers', version: '1.0.0' },
  bikehook: { name: 'Bike and helmet wall hooks', version: '1.0.0' },
  shoerack: { name: 'Shoe and boot wall racks', version: '1.0.0' },
  petbowl: { name: 'Raised pet bowl stands', version: '1.0.0' },
  routershelf: { name: 'Router and modem wall shelves', version: '1.0.0' },
  remotecaddy: { name: 'Remote control caddies', version: '1.0.0' },
  tabletholder: { name: 'Wall tablet holders', version: '1.0.0' },
  glassesrack: { name: 'Glasses wall racks', version: '1.0.0' },
  familycharger: { name: 'Family charging stations', version: '1.0.0' },
  hairholder: { name: 'Hair tool holders', version: '1.0.0' },
  lidrack: { name: 'Pot lid racks', version: '1.0.0' },
  mughooks: { name: 'Under-shelf mug hooks', version: '1.0.0' },
  wraprack: { name: 'Wrap and foil dispensers', version: '1.0.0' },
  glassrail: { name: 'Wine glass rails', version: '1.0.0' },
  cutlerytray: { name: 'Cutlery drawer organisers', version: '1.0.0' },
  hallhooks: { name: 'Umbrella and dog lead hooks', version: '1.0.0' },
  toytray: { name: 'Toy sorting trays', version: '1.0.0' },
  shoehorn: { name: 'Shoe horns and boot hooks', version: '1.0.0' },
  bathcaddy: { name: 'Bathroom shelf caddies', version: '1.0.0' },
  spoolrack: { name: 'Thread and ribbon spool racks', version: '1.0.0' },
  propagator: { name: 'Plant propagation stations', version: '1.0.0' },
  gameinsert: { name: 'Board game insert trays', version: '1.0.0' },
  dicetower: { name: 'Dice towers', version: '1.0.0' },
  cardholder: { name: 'Card holders', version: '1.0.0' },
  pillbox: { name: 'Pill organisers', version: '1.0.0' },
  dateclip: { name: 'Bag clips with a date dial', version: '1.0.0' },
  magnetholder: { name: 'Fridge magnet holders', version: '1.0.0' },
  jewellerystand: { name: 'Jewellery stands', version: '1.0.0' },
  tierack: { name: 'Tie and belt racks', version: '1.0.0' },
  capsuleholder: { name: 'Coffee capsule holders', version: '1.0.0' },
  doorstop: { name: 'Door wedges and stops', version: '1.0.0' },
  tubesqueezer: { name: 'Tube squeezers', version: '1.0.0' },
  clothespeg: { name: 'Clothes pegs', version: '1.0.0' },
  towelholder: { name: 'Paper towel holders', version: '1.0.1' },
  sinktidy: { name: 'Sink tidies', version: '1.0.0' },
  dryingrack: { name: 'Bottle drying racks', version: '1.0.0' },
  rackpanel: { name: 'Rack panels', version: '1.1.1' },
  soapdish: { name: 'Soap dishes', version: '1.0.0' },
  eggtray: { name: 'Egg trays', version: '1.0.0' },
  knifeblock: { name: 'Knife blocks', version: '1.0.0' },
};

// Newest first.
// The engine's release notes, newest first, are in engine-history.js (loaded only where they're shown).
// The version here is the newest entry's; test/engine.test.js keeps the two in step.
export const ENGINE = { name: 'VERTEX engine', version: '1.97.2' };

// "VERTEX engine 1.1.0", for file stamps and the site.
export const engineLabel = () => `${ENGINE.name} ${ENGINE.version}`;

// Compare two versions: negative if a < b, 0 if equal, positive if a > b.
export function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}
