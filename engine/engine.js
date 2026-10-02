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
  morph: { name: 'Deck Foundry (the Tectonic Deck)', version: '1.6.0' },
  enclosure: { name: 'Pi and Arduino cases', version: '1.0.0' },
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
  cablebox: { name: 'Cable boxes', version: '1.0.0' },
  chargedock: { name: 'Charging docks', version: '1.0.0' },
  deskdrawer: { name: 'Under-desk drawers', version: '1.0.0' },
  deskhanger: { name: 'Under-desk headphone hooks', version: '1.0.0' },
  controllerrack: { name: 'Controller and headset racks', version: '1.0.0' },
  grommet: { name: 'Desk cable grommets', version: '1.0.0' },
  serverrack: { name: 'Modular 10-inch server racks', version: '1.0.0' },
  leadhanger: { name: 'Extension lead and hose hangers', version: '1.0.0' },
  bikehook: { name: 'Bike and helmet wall hooks', version: '1.0.0' },
};

// Newest first.
export const ENGINE_HISTORY = [
  {
    version: '1.60.0', date: '2026-10-02',
    notes: [
      'bikehook 1.0.0 (Bike and helmet wall hooks): a side profile drawn as slabs across the width, printed on its side: an 8 mm plate, a 14 mm arm with a 45° brace and a lip, a channel the tyre plus 2 mm a side wide between 6 mm walls, a helmet peg with a knob, three 5 mm screw slots.',
      'leadhanger 1.0.0 (Extension lead and hose hangers): a side profile drawn as slabs across the width, printed on its side: a wall plate, an arm that thickens with its reach, a lip, a 45° brace that grows with the reach, strap slots through the arm and brace near the wall and the lip, square screw slots above and below the arm.',
      'serverrack 1.0.0 (Modular 10-inch server racks): 254 mm ears, rail holes 236.5 mm apart, 222.25 mm clear, EIA-310 holes at 6.35, 22.225 and 38.1 mm in each 44.45 mm unit. Boxes of 1–5U: side panels lying flat with hex vents and both rails standing off them (teardrop holes), plates (8 mm) between the panels on M3 self-tapping screws into their edges, notched round the rails; top plates carry four pins and bottom plates the holes they drop into. 1U shelves (a face with slotted ears and a finger pull, a floor and two lips standing off it), vented blanks, keystone patch panels (pocketed to 2 mm behind each jack) and drawer sleeves print face down; drawers print upright; a carry handle prints on its side and bolts to the cap plate; device panels (Pi 4/5 on sleds with M2.5 standoffs, ThinkCentre Tiny, NUC, Mac mini, 3.5" and 2.5" drives or custom) have windows for the device fronts, a floor and guide walls. The default framed build: L-section uprights (EIA holes in the face, teardrop M3 holes in a 4 mm flange) per section of up to 5U, splice plates joining sections so the hole spacing runs on, 255.8 mm end frames with corner brackets, badged side panels and carry handles; the boxes build is still there.',
      'grommet 1.0.0 (Desk cable grommets): a sleeve (a rim on the bed, a tube 0.3 mm under the hole with six 0.8 mm crush ribs and a 0.6 mm lead-in at its end) and a cap (a disc on the bed with a ring that drops into the bore at the fit given, one slot past the middle or two that stop short of it).',
      'controllerrack 1.0.0 (Controller and headset racks): wall modules side by side, each a side profile drawn as slabs across its width and printed on its side: a cradle (two prongs with turned-up tips and 45° braces, two square screw slots between them), a headset hook (a wide, thicker rest with a lip, a slot either side of it) and a cable shelf (a ledge with a lip).',
      'deskhanger 1.0.0 (Under-desk headphone hooks): a side profile (a plate with square screw slots, a drop with two lead notches, an arm and a turned-up lip, filleted inside corners) drawn as slabs across the width, printed on its side; the outer 0.4 mm of each face steps in against elephant’s foot.',
      'deskdrawer 1.0.0 (Under-desk drawers): a drawer whose top edges flare out at 45° into 6 mm flanges, with a front and a finger pull; two rails, each a U (a plate for the desk with counterbored screw holes, a channel at the flange’s thickness plus the clearance, a lip it slides on), printed lying on their side.',
      'chargedock 1.0.0 (Charging docks): a base with a recess for a watch’s charging puck and a pocket for an earbuds case, a phone stand (a front lip, a slot at the phone’s thickness leaning back, a backrest sloping in over its own foot), and channels open below that carry each cable to the back with a hole up to each device. Built from slabs (slabs.js, shared with Deck Foundry).',
      'cablebox 1.0.0 (Cable boxes): a base sized round a power strip (20 mm each end, 25 mm each side for plugs and the cables’ bend) with U-slots open at the top in both ends and optionally the back, and a lid with vent slots and an inner lip at the fit asked. The base prints upright, the lid top down; the preview shows the lid on.',
      'desktidy 1.0.0 (Pen pots and desk tidies): pen pots (round, hexagon or square; one to three cups sharing walls, each next one lower by a step; dividers across or in a cross), a business card stand (a front lip, a slot sized to the stack leaning 15° back, a back wedge whose face slopes in) and rounded trays. Walls straight up, a 0.6 mm chamfer round each rim, the bottom 0.4 mm stepped in.',
      'monitorriser 1.0.0 (Monitor risers): a shelf on two legs. Each leg is a frame with a window (a keyboard slides under) and two tabs that push up through slots in the shelf; a brace runs through both legs’ back posts, its 3 mm shoulders against their inner faces, so the riser can’t rack or the legs slide in. Every piece prints flat; the preview shows it assembled (both rotations with a determinant of +1).',
    ],
  },
  {
    version: '1.59.0', date: '2026-10-02',
    notes: [
      'morph 1.6.0 (Deck Foundry): the Tectonic Deck v2, ported from the parametric CAD. Tiles on a 150 mm grid (1 × 1, 2 × 1, 2 × 2 cells; two dovetails a cell edge), the trench under every cell with a 45° peaked roof (no bridge over 10 mm), crater tiles with four spherical bowls a cell over the trench, hardpoints for an S, M or L receiver (56.4 / 70.4 / 90.4 mm pockets, screws ±38 / ±44 / ±54). The receiver: a 45° lead-in on the pocket, a printed snap pivot (two tines and a 0.6 mm barb) with SHUT and OPEN detent notches, the cam lobe R5.5 at 17.5 mm shut at 138° (3.5 mm engagement, swept clear of the shoe and frame), link-bar sockets in the base; a snap-on hood (five tabs, a 2 mm lead-in for the shoe); the lever with a printed spring beam (0.8 to 1.2 mm) and a bump in its bore; an inserts variant (M3 pivot through a printed washer, a screwed hood). The shoe gains a 4 mm neck, a 1 mm lead-in and inserts on top for a separate mount plate (cradle, tray, any bolt pattern with counterbored heads, iron yokes, a hole grid, blank). New: the electronics tile (a measured cradle for a soldering station, a cable trough with snap grooves and pass-downs to the trench, iron yokes at 30°, a tip-cleaner cup, a solder spindle, parts bowls), the trough lid, the link bar and the pivot washer. Old designs open with the v2 parts.',
    ],
  },
  {
    version: '1.58.0', date: '2026-10-02',
    notes: [
      'laptopstand 1.0.0 (Laptop stands): two side profiles (a slope at the angle asked, a round-topped front lip, a window leaving a 10 mm frame) with two slots each for bars standing on edge; the bars have shoulders between the sides. All printed flat; the preview stands them together.',
      'bin: wall and lip one loft from the top of the feet, floor inside it, so no hidden caps meet the outer wall.',
    ],
  },
  {
    version: '1.57.1', date: '2026-10-02',
    notes: [
      'trace: photos on a cutting mat, a desk or coloured card are redrawn as dark tools on white before tracing (trace/background.js): the background is learnt from the sheet border (k-means colours, blends between them, and the same colours in shadow down to 35 %); paper photos are untouched.',
    ],
  },
  {
    version: '1.57.0', date: '2026-10-02',
    notes: [
      'bookend 1.0.0 (Bookends): a profile (a foot under the books, the upright, a back foot and a straight brace, an arched quarter round, or a solid one with up to three initials cut through) unioned on a 0.25 mm raster and extruded across the width, printed on its side; a pair by default.',
    ],
  },
  {
    version: '1.56.0', date: '2026-10-02',
    notes: [
      'broomholder 1.0.0 (Broom and mop holders): C-clips wrapping 260° of the handle (a 100° opening, so it snaps in) with round lips, unioned on a 0.1 mm raster with a web to the strip, extruded through the clip height; the strip is extruded through its thickness with sideways teardrop screw holes between the clips and 10 mm in from each end.',
      'trace: each shape worked in its own box; traceContours takes an offset so the points are exactly those of the whole sheet.',
    ],
  },
  {
    version: '1.55.0', date: '2026-10-01',
    notes: [
      'spicerack 1.0.0 (Spice racks): one (y, z) profile extruded across the width: tiered steps a jar + 8 mm deep with a front lip, or rows of V cradles (a quarter of the jar deep) for jars lying in a drawer.',
    ],
  },
  {
    version: '1.54.0', date: '2026-10-01',
    notes: [
      'toothbrush 1.0.0 (Toothbrush holders): printed upside down: a 3 mm top with a hole per brush and one for toothpaste, a guide tube under each, an outer wall open at the bottom; an optional drip tray with a rim and 2 mm ribs the holder stands on.',
    ],
  },
  {
    version: '1.53.0', date: '2026-10-01',
    notes: [
      'plantmarker 1.0.0 (Plant markers): one marker per name (comma or newline separated, up to 24): a stake with a pointed tip and a tag or round label sized to the name, the names raised as a second part, laid out in a row.',
    ],
  },
  {
    version: '1.52.0', date: '2026-10-01',
    notes: [
      'keyrack 1.0.0 (Key racks): a rounded plate printed face up with pegs ending in a 45° stepped flare and a flat cap, an optional post trough (a floor and a lip leaning back at 45°, with end walls), a raised name as a second part, and countersunk screw holes or none for tape.',
    ],
  },
  {
    version: '1.51.0', date: '2026-10-01',
    notes: [
      'headphone 1.0.0 (Headphone stands): two flat pieces with a cross-lap joint at half height (front slotted from below, side from above, slot = thickness + 2 × clearance); the front carries a cradle between two concentric arcs and an optional cable hook, the side a short cradle with raised edges; an optional round base with a cross socket 5 mm deep and four 26 mm coin pockets between the arms.',
      'raster traceContours: typed arrays, the same loops, about 3.8× faster.',
    ],
  },
  {
    version: '1.50.0', date: '2026-10-01',
    notes: [
      'shelfbracket 1.0.0 (Shelf brackets): an L of a wall leg and a shelf leg, held by a straight brace from 30 % up the wall to 70 % along the shelf, or a curved web to the same points; printed on its side, with sideways teardrop screw holes placed where a driver reaches them.',
    ],
  },
  {
    version: '1.49.0', date: '2026-10-01',
    notes: [
      'battery 1.0.0 (Battery organisers): a rounded tray with a pocket per cell (round, 9 V or coin cells on edge) sunk 60 % of the cell, the type raised on a front strip as a second part, and a slip-on cap lid printed top down that clears the cells; or the same pockets as a Gridfinity bin through the holder engine.',
    ],
  },
  {
    version: '1.48.0', date: '2026-10-01',
    notes: [
      'cablewrap 1.0.0 (Cable wraps and winders): a dog-bone winder unioned on a raster from two lobes and a waist, with a slit at each end 0.8 × the cable wide ending in a round seat; or a strap with rounded ends, holes from the far end, and a post-and-cap button that snaps through them.',
    ],
  },
  {
    version: '1.47.0', date: '2026-10-01',
    notes: [
      'coaster 1.0.0 (Coasters): a round, square or hexagonal base with a 2.5 mm rim, and rings, a grid or up to four initials raised as a second part, kept inside the circle that fits within the rim.',
    ],
  },
  {
    version: '1.46.0', date: '2026-10-01',
    notes: [
      'bagclip 1.0.0 (Bag clips): a flat profile printed latched: two arms joined by a half-ring loop, the upper arm reaching past the lower one into a hook whose lip sits under the lower arm with the clearance and is ramped underneath so the arm snaps up past it; small grip ridges stay clear of the gap.',
    ],
  },
  {
    version: '1.45.0', date: '2026-10-01',
    notes: [
      'keychain 1.0.0 (Name keychains and tags): a rounded plate as wide as the name plus margins and room for a ring hole (keychain) or strap slot (bag tag), with the letters raised as their own part for a second colour.',
    ],
  },
  {
    version: '1.44.0', date: '2026-10-01',
    notes: [
      'cutter 1.0.0 (Cookie cutters): a built-in outline or the biggest outline in a photo of a drawing, scaled so its longest side is the size asked for, filled, then grown outward on a raster into a blade (0.9 mm, full height) and a flange (4 mm, 1.6 mm high). The inside of the blade is the outline, so the cookie is the size asked for.',
    ],
  },
  {
    version: '1.43.0', date: '2026-10-01',
    notes: [
      'planter 1.0.0 (Plant pots and drip trays): a pot lofted from foot to rim with a flare of at most 30°, smooth, fluted or faceted outside and a round inside clear of the deepest dip, a floor with up to 12 drainage holes, and a drip tray 6 mm wider than the foot with three ribs the pot stands on.',
    ],
  },
  {
    version: '1.42.0', date: '2026-10-01',
    notes: [
      'deskhook 1.0.0 (Desk hooks): a side profile extruded across the width and printed on its side: a clamp whose jaws open to the desk thickness plus the clearance top and bottom, or a plate for the underside with teardrop screw holes pointing up as printed; a spine dropping below the desk to a bar with a lip.',
    ],
  },
  {
    version: '1.41.0', date: '2026-10-01',
    notes: [
      'stand 1.0.0 (Phone and tablet stands): a side profile (base, back plate at the angle asked for, rear leg spread back by a quarter of the height, an open triangle inside) extruded across the width, plus a seat with a front lip whose gap is the device thickness ÷ sin(angle) + 1 mm. Charging raises the seat to 22 mm and leaves it out in the middle for the plug. Printed on its side.',
    ],
  },
  {
    version: '1.40.0', date: '2026-10-01',
    notes: [
      'jar 1.0.0 (Screw-top containers): a jar lofted ring by ring (loftTube) with a right-hand thread of depth 0.4 × pitch (45° flanks, flat crest) that fades in and out over 1.5 mm, an inside that narrows to the neck at 45°, and a cap whose groove is the full thread moved out by the clearance everywhere; the cap is turned over to print top down.',
    ],
  },
  {
    version: '1.39.0', date: '2026-10-01',
    notes: [
      'hinge 1.0.0 (Hinges and hinged boxes): a flat print-in-place hinge (odd knuckle count; knuckle radius = thickness + clearance so it folds flat; a rod joined to leaf A runs through the other leaf’s bores at the clearance; that leaf’s web starts outside the bore) with M3 holes; and a box with a lid that prints upside down beside it and snaps its C-clips (open downward) onto a bar on three 45° brackets along the back.',
    ],
  },
  {
    version: '1.38.0', date: '2026-10-01',
    notes: [
      'dragchain 1.0.0 (Cable drag chains): links printed standing, inner plates with teardrop pins at the front and outer plates with teardrop holes (+0.25 mm) at the rear, ends rounded about the pins, 0.3 mm between plates. The floors butt when straight (no sag); the top-bar gap is the bend angle per link × half the link height, from the radius asked for. Start and end brackets with two M3 holes.',
    ],
  },
  {
    version: '1.37.0', date: '2026-10-01',
    notes: [
      'knob 1.0.0 (Knobs and handles): grip knobs printed face down (fluted, knurled, star or smooth, with a pointer notch) that push onto a D-shaft or round shaft, or hold an M4–M8 bolt head in a hex pocket; and bar drawer pulls printed on their side with teardrop screw holes (M3/M4 pilot or heat-set insert) at any spacing.',
    ],
  },
  {
    version: '1.36.0', date: '2026-10-01',
    notes: [
      'spool 1.0.0 (Spool and dry-box parts): a hub adapter that slip-fits a spool\'s centre hole onto a rod or a 608 bearing, with a flange and a 1 mm lead-in; a slotted desiccant pod with a vented lid; and a PTFE or PC4-M10 feed-through for a dry-box wall with a clamp ring.',
    ],
  },
  {
    version: '1.35.0', date: '2026-10-01',
    notes: [
      'swatch 1.0.0 (Filament swatches): a sample card per spool with a ring hole, a 0.4/0.8/1.2/1.6 mm stepped strip, and brand, material, colour and temperatures raised as a second part. Several cards are laid out on one plate.',
    ],
  },
  {
    version: '1.34.0', date: '2026-10-01',
    notes: [
      'gridfinity 1.2.0: bin lids and vase-mode bins. A lid’s underside is the bin foot profile over the whole outline, so it seats in the stacking lip like a stacked bin; on top a flat cap, or (stacking) a solid baseplate so bins stand on it. Vase mode makes the bin a solid shape with no lip, cavity, labels, slots or lid, for spiral vase printing. The engine API returns the lid as its own part.',
    ],
  },
  {
    version: '1.33.0', date: '2026-10-01',
    notes: [
      'simrig 1.3.0 (Sim rig parts): a flag panel. An LED matrix (flexible 8 × 8, 16 × 16 or 8 × 32 panels, rigid boards, or rows of strip) behind a smoked acrylic or printed window, with a light grid of round or square cells, one per LED. The body prints back-rim down with no overhangs; a bezel held by four corner screws clamps the window; the back cover carries the VERTEX pattern, a cable slot and posts that press the panel to the grid. Warns when the cells are tight round a 5 mm LED and when the LEDs can draw more than USB gives.',
    ],
  },
  {
    version: '1.32.0', date: '2026-10-01',
    notes: [
      'morph 1.5.0 (Deck Foundry): edges for printing. Every tile’s bottom 0.4 mm is inset 0.4 mm (no elephant’s foot, and a lead-in for the tails), and its top 0.6 mm is inset 0.6 mm (an edge break that leaves a seam line between tiles). The receiver frame’s top 0.8 mm steps back 0.6 mm as a lead-in to the pocket; each shoe’s bottom 0.5 mm is inset 0.4 mm.',
    ],
  },
  {
    version: '1.31.0', date: '2026-10-01',
    notes: [
      'morph 1.4.0 (Deck Foundry): only the Tectonic Deck is left. The MotiveMesh parts are removed from the engine: Desk Pods, wall, skeleton and drawer tiles, bins, shelves, hooks, tool trays, twist-lock pins, connector keys, seam clips, and the Gridfinity and openGrid bridges. A saved design that asks for one opens as a 4 × 3 deck. The Workshop Planner loses its MotiveMesh wall and drawer spaces.',
    ],
  },
  {
    version: '1.30.0', date: '2026-10-01',
    notes: [
      'morph 1.3.0 (Deck Foundry, was MotiveMorph): the Tectonic Deck. Tiles 100 to 220 mm square and 15 mm tall join with vertical dovetails (12 mm neck, 18 mm tip, 8 mm deep, two per edge a quarter in, 0.2 mm fit): tails on the right and back, sockets on the left and front, none on a deck’s outer edges. A 22 × 10 mm trench runs under each tile both ways below a 5 mm skin, with a 26 mm pass-up hole on flat tiles; the rest of the underside is pockets between 4 mm ribs. Crater tiles dish 1 to 16 bowls (4 to 12 mm deep, quarter-ellipse walls, 12 mm rim clear of the sockets) with no trench. Hardpoint tiles have a 3 mm pocket for the receiver and five 4.0 mm insert holes. A whole deck (up to 8 × 6) gets each tile’s edges from its place and lists identical tiles once with a count.',
      'morph 1.3.0: the quick-release. The receiver is a 3 mm base with four M3 holes (±44 mm), a C frame (70.4 mm pocket, 5 mm walls, 10 mm tall, a 26 mm window on the lever side) and two 8 × 3 mm rails offset to one side so a shoe goes in one way round, plus a pivot boss with an M3 insert and a 5.3 mm spring pocket. The 5 mm lever’s cam swings 60° from shut (inside the shoe’s notch) to open (clear), checked for collisions through the swing; two 3.5 mm dimples take a 5 mm ball. Shoes are 69.9 mm with rail slots and a notch (z 3.3 to 8.7), then a 45° flare to a 4 mm plate: a round cradle, a tray, a counterbored M3 to M6 bolt pattern, or nine M3 inserts on 20 mm. A parking dock is the receiver without the lever.',
      'morph 1.3.0: the wall parts (tiles, skeleton and drawer tiles, shelf, hook, Gridfinity and openGrid bridges) are no longer offered. They still build, so saved designs open unchanged.',
    ],
  },
  {
    version: '1.29.0', date: '2026-09-30',
    notes: [
      'opengrid 1.5.0 (openGrid): an under-desk cable clip. It has a one-cell plate, a stem 3 to 60 mm long, and a ring for a 4 to 40 mm bundle (0.3 mm clearance, 2.6 mm wall) open towards the front over 70% of its width. It prints on its side.',
      'cable 1.4.0 (cable management): a monitor arm clip. A C ring for a 15 to 60 mm pole (0.2 mm clearance, 3 mm wall, open over 72% of its width) with a C clip for the cable bundle on its back (2.4 mm wall, open sideways), rounded ends, 14 mm tall, printed flat.',
    ],
  },
  {
    version: '1.28.0', date: '2026-09-30',
    notes: [
      'opengrid 1.4.0 (openGrid): a keyboard tray that slides into the under-desk drawer rails. It is 6 to 20 cells between rails, 4 to 12 cells long and drops 25 to 100 mm. It comes in 1 to 4 pieces joined by dovetail tabs in the 4 mm floor (10 mm neck, 16 mm head, 8 mm long, 0.2 mm fit). The outer pieces carry 3 mm side walls with the drawer’s 10 mm dovetail lip. A 10 mm front lip and a 14 mm back edge run across every piece, and 23 mm windows in a 30 mm grid take about half the plastic out of the floor. It prints floor down with no supports.',
    ],
  },
  {
    version: '1.27.0', date: '2026-09-30',
    notes: [
      'cable 1.3.0 (cable management): snap channel straights can be as short as 10 mm (the open channel keeps its 40 mm minimum), and on openGrid the first screw hole can be moved (2 to 40 mm, default 14) so a length that starts off a cell centre still has every hole over a screw snap. The Workshop Planner uses both to cut straights between fittings.',
    ],
  },
  {
    version: '1.26.0', date: '2026-09-30',
    notes: [
      'opengrid 1.3.0 (openGrid): three parts for a Lite board under a desk. A headphone hanger (a two-cell plate, a stem dropping 25 to 120 mm and an arm reaching 30 to 120 mm with an 8 mm lip, braced at both corners, printed on its side). Drawer rails, a mirrored pair each one cell wide and 2 to 12 cells long, with a dovetail flange (45° top, 0.6 mm side and 0.8 mm vertical clearance to the drawer) and a 3 mm stop at the back, printed on their sides. And a drawer, 2 to 10 cells between rails and 30 to 150 mm tall, with a 10 mm dovetail lip down each side and a pull on the front, printed upright.',
    ],
  },
  {
    version: '1.25.0', date: '2026-09-30',
    notes: [
      'cable 1.2.0 (cable management): snap channel fittings. There is an end cap, a corner, a tee and a cross, each as a base and a cover. Each arm has the channel’s own section and reaches 20 mm past the middle square, so straight lengths butt against it. Sides with no arm are walled, with a plain cover leg across them. Barbs and grooves run only along the arms, starting 1 mm past the middle, so no cover leg meets a barb from the side. There is one screw in the middle (M3 for openGrid, 4.5 mm for wood, or none for tape). Both pieces print flat with no supports.',
    ],
  },
  {
    version: '1.24.0', date: '2026-09-30',
    notes: [
      'morph 1.2.0 (MotiveMorph): Normal, flat-back and Skeleton tiles can be cut to fit. The last column and row can each be 10 to 30 mm (in 0.5 mm steps) on tiles more than one node across. A cut column has no sockets. Edge notches stay on the 30 mm grid from the tile’s origin and are left out within 14 mm of a corner, so they never meet the corner screws. File names say the cut (for example 5x4-cut17.5x30). A drawer planner gives the columns, rows, cut sizes and tiles (up to 8 nodes each) for a drawer’s inside size. Leftovers under 10 mm are left as a gap.',
    ],
  },
  {
    version: '1.23.0', date: '2026-09-30',
    notes: [
      'morph 1.1.0 (MotiveMorph): the MotiveMesh Skeleton tile, an open frame with the same dovetail edges, a ring (20 mm across) round every socket and ribs 2 to 3.2 mm wide and 4 mm tall between them. The rings stand 3 mm proud at the back with a lug pocket (16.1 mm across) so the tile lies flat and pins still turn. A flat-back Normal tile for drawers swaps the 6 mm standoff for a 3 mm back layer with the same pockets.',
      'morph 1.1.0 (MotiveMorph): bridges. A 5 × 5 Gridfinity baseplate on a 7 × 7 MotiveMesh floor (210 mm, notched edges, four countersunk screws in the corner cells). A Gridfinity foot adapter (1 to 3 by 1 to 2 cells) with 30 mm-spaced sockets over the feet and lug pockets up through them, printed socket plate down. openGrid adapter snaps (Full or Lite) with a socket in a 5 mm boss on the face and the lug pocket through the snap. openGrid’s snap shape is credited (CC BY 4.0).',
    ],
  },
  {
    version: '1.22.0', date: '2026-09-30',
    notes: [
      'New engine: Underware 1.0.0, straight Underware 2.0 channels (base and top) by Hands on Katie and BlackjackDuck, from the published Original profile. They come 1 to 4 units wide and 25 to 400 mm long, with inside heights of 12 to 72 mm, and wood-screw or flat bases. Files carry the designers’ credit and the CC BY-NC-SA 4.0 licence (STL header, 3MF metadata and a LICENSE.txt inside the 3MF) instead of CC0.',
    ],
  },
  {
    version: '1.21.0', date: '2026-09-30',
    notes: [
      'cable 1.1.0 (cable management): a two-piece snap channel, Mint Motive’s own design. The base has two rails, each with a 45° diamond barb (0.7 mm), and M3 holes 28 mm apart on openGrid cell centres, 4.5 mm holes every 100 mm for the desk, or none for tape. The cover’s legs have a V-groove (0.6 mm deep, 1.6 mm tall) the barbs click into, with a clearance setting. It prints roof down, and there is a short fit test. The snap channel is now the engine’s first part.',
    ],
  },
  {
    version: '1.20.0', date: '2026-09-30',
    notes: [
      'opengrid 1.2.0 (openGrid): hooks, shelves, bins and racks can have Multiconnect slots on the back instead of screw holes. One slot per column, 18.0 mm at the face widening at 45° to 20.3 mm, 2.35 mm deep, in a 5 mm back. Each slot is open at the bottom and stops so the head sits level with a cell centre. With slots, hooks and shelves print upright, and a shelf’s back grows so its 45° bracket reaches the full depth.',
    ],
  },
  {
    version: '1.19.0', date: '2026-09-30',
    notes: [
      'opengrid 1.1.0 (openGrid): boards get a connector pocket at every node along their edges (a two-lobed pocket with a slight waist, 2.4 mm tall: mid-thickness on Full, 1 mm behind the face on Lite), and a new board connector part, printed flat with a clearance setting.',
      'opengrid 1.1.0 (openGrid): Multiconnect adapters, a Multiconnect head (20.3 mm across, a 45° cone to a 15.3 mm neck, 5 mm proud) that screws into a screw snap, printed neck down so it needs no supports.',
    ],
  },
  {
    version: '1.18.0', date: '2026-09-30',
    notes: [
      'Every storage system is now its own engine on one core (engines/core.js): openGrid, French cleat, pegboard, stacking drawers, case inserts and cable management on the shared studio, with Gridfinity, Skådis, the Honeycomb wall and MotiveMorph registered alongside. Each keeps its own version from here.',
      'openGrid 1.0.0 replaces the square grid wall: boards (Full 6.8 mm, Lite 4.0 mm with countersunk screw holes at the nodes), snaps with flexing nubs, screw snaps, mounting snaps, and accessories that screw into them, to the published openGrid interface (octagonal cells: 25.8 mm face, 25.0 mm land, 26.4 mm groove on a 28 mm grid).',
      'Teardrop screw holes (French cleat rail) now point up as intended.',
    ],
  },
  {
    version: '1.17.0', date: '2026-09-29',
    notes: [
      'Maintenance release.',
    ],
  },
  {
    version: '1.16.0', date: '2026-09-29',
    notes: [
      'gridfinity 1.1.0: baseplates bolt onto T-slot profile (wall: tslot). Countersunk M5 (2020) or M6 (3030, 4040) bolt holes on each rail\'s slot centreline, in every Nth cell plus the first and last, kept on the pocket\'s flat floor (within pitch/2 − 2.85 mm lip − head/2 − 0.3 mm of the cell centre) and clear of the magnets. Rails run along X, centred; any spacing works by sliding the plate across the rails (tslotPlan picks the smallest shift that puts every rail on a floor), and the notes give the front rail\'s distance from the plate edge. The bottom is raised to the head depth + 1.2 mm.',
    ],
  },
  {
    version: '1.15.0', date: '2026-09-29',
    notes: [
      'Maintenance release.',
    ],
  },
  {
    version: '1.14.0', date: '2026-09-29',
    notes: [
      'Maintenance release.',
    ],
  },
  {
    version: '1.13.0', date: '2026-09-29',
    notes: [
      'Maintenance release.',
    ],
  },
  {
    version: '1.12.0', date: '2026-09-29',
    notes: [
      'Maintenance release.',
    ],
  },
  {
    version: '1.11.0', date: '2026-09-29',
    notes: [
      'Maintenance release.',
    ],
  },
  {
    version: '1.10.0', date: '2026-09-29',
    notes: [
      'Maintenance release.',
    ],
  },
  {
    version: '1.9.0', date: '2026-09-29',
    notes: [
      'Maintenance release.',
    ],
  },
  {
    version: '1.8.0', date: '2026-09-29',
    notes: [
      'simrig 1.2.0: wheel stand parts for the Next Level Racing Wheel Stand 2.0 and similar: a tube spacer for the bottom of the sliding deck tube (stops the wobble), foot caps, and a deck plate that bolts through the deck with M8 bolts and carries the VERTEX mounting pattern. Sizes are measured on your own stand.',
    ],
  },
  {
    version: '1.7.0', date: '2026-09-29',
    notes: [
      'tslot 1.0.0: T-slot parts for 2020, 3030, 4040 and 4080 profile: drop-in and slide-in T-nuts (nut trap, heat-set insert or pilot hole, whichever fits), end caps, snap-in slot covers and cable clips, corner brackets with gussets, and straight, L, T and cross joining plates. All print without supports.',
    ],
  },
  {
    version: '1.6.0', date: '2026-09-29',
    notes: [
      'Maintenance release.',
    ],
  },
  {
    version: '1.5.0', date: '2026-09-29',
    notes: [
      'Maintenance release.',
    ],
  },
  {
    version: '1.4.0', date: '2026-09-29',
    notes: [
      'Maintenance release.',
    ],
  },
  {
    version: '1.3.0', date: '2026-09-29',
    notes: [
      'Maintenance release.',
    ],
  },
  {
    version: '1.2.0', date: '2026-09-29',
    notes: [
      'Maintenance release.',
    ],
  },
  {
    version: '1.1.0', date: '2026-09-29',
    notes: [
      'skadis 1.1.0: Snug / Standard / Loose fits, a three-tag fit test, long slots in tool holders, the badge under shelves and trays.',
      'simrig 1.1.0: the round and square tube clamps removed (old designs get the profile clamp), the badge on back covers and flat parts.',
    ],
  },
  {
    version: '1.0.0', date: '2026-09-28',
    notes: ['The first versioned engine: every generator as it was before versions were kept.'],
  },
];

export const ENGINE = { name: 'VERTEX engine', version: ENGINE_HISTORY[0].version };

// "VERTEX engine 1.1.0", for file stamps and the site.
export const engineLabel = () => `${ENGINE.name} ${ENGINE.version}`;

// Compare two versions: negative if a < b, 0 if equal, positive if a > b.
export function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}
