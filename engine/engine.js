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
  gridfinity: { name: 'Gridfinity bins, baseplates and holders', version: '1.1.0' },
  skadis: { name: 'Skådis Studio', version: '1.1.0' },
  morph: { name: 'Deck Foundry (the Tectonic Deck)', version: '1.5.0' },
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
};

// Newest first.
export const ENGINE_HISTORY = [
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
