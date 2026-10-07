// Modular 10-inch server racks. A rack is a stack of boxes, each up to 5U so
// every part fits a 256 mm bed: two side panels (each with the front and back
// rails built in, drilled to the EIA-310 pattern), a bottom and a top plate
// screwed in between them, and pins on each top plate that locate the next
// box up. Gear goes in on shelves and blank panels with 10-inch rack ears.
//
// Ten-inch rack numbers: 254 mm across the ears, rail holes 236.5 mm apart
// (centre to centre), 222.25 mm clear between the rails, 1U = 44.45 mm with
// holes 6.35, 22.225 and 38.1 mm up each unit.
//
// Every part prints without supports: panels and plates lie flat; the rails
// stand up off the panel and their screw holes, which run sideways in the
// print, are teardrops pointing up.
import { zoneOf } from './rack-zones.js';
import { VENT_STYLES, ventOptions, ventPanel, louvreCuts } from './vents.js';
import { armourOptions, rackArmour, drawFootHoles, footCuts } from './rack-armour.js';
import { DIAMETER, HEADS, NUTS, FIT as HW_FIT, GROUPS as HW_GROUPS, derivedThickness, screwLength } from './fasteners.js';
import { chassisOptions, rackChassis } from './rack-chassis.js';
import { tinyTrayParts, installed as trayInstalled, DRIVES25 } from './rack-tiny-tray.js';
import { insertOptions, insertFor, sheetT, pocketDepth, cutFiles, cutList, insertNotes, INSERT_MATERIALS } from './rack-inserts.js';
import { Mesh } from './mesh.js';
import { extrudePolygon, signedArea } from './polygon.js';
import { rr, sections, draftScale } from './slabs.js';
import { textPolygons, textUnits } from './font.js';
import { OG, board as ogBoard } from './opengrid.js';
import { underwareParts, UNDERWARE_LICENCE, UW } from './underware.js';
import { BAY_DRIVES, DOVE, bayDims, bayGeom, bayLayout, bayFloor, bayContents, driveCage, driveSled, powerModule } from './rackbays.js';

// Text cut into a drawing (it reads from the side it's drawn on).
// The badge's letters: cut out (raised plates, engraved) or, with stand = true, standing in a pocket (flush inlays).
function letters(d, text, cx, cy, h, stand = false) {
  const w = (textUnits(text) * h) / 6;
  for (const poly of textPolygons(text, -w / 2, -h / 2, h, Math.max(0.7, h * 0.16))) d[stand ? 'on' : 'off'](poly.map(([x, y]) => [cx + x, cy + y]));
}

export const SERVERRACK_DEFAULTS = {
  height: 0, // framed: the whole rack in U (up to 42), split into sections that fit the bed; 0 to set the sections yourself
  strength: 'heavy', // standard | heavy (the default: thicker rails, end frames, panels and splices) | extreme (thicker again, for NAS drives, UPS batteries and racks that get moved)
  gussets: 'standard', // framed: the webs inside each end frame's corner brackets: none | standard | tall (up the bracket) | double (both ends) | max (tall and double)
  braces: 'auto', // framed: an X-brace on the back rails of each section (auto: racks of 10U and more)
  units: 5, // the first box
  units2: 0, // a second box on top (0 for none)
  units3: 0,
  depth: 200,
  width: 0, // framed: the cabinet's outside width in mm, 256 to 400 (0: the standard 256). The 10-inch rails stay put; the frame widens round them
  enclosure: 'sealed', // the starting point for the faces below: sealed (closed all round) | open (vented, no back)
  // Each face on its own ('auto' follows the starting point):
  faceLeft: 'auto', faceRight: 'auto', // solid | vents | window (a frame for an acrylic sheet) | opengrid (an openGrid board on the outside: snap on hooks, bins, holders) | none
  cableRings: 0, // cable rings that bolt to the back rails
  cableChannels: 0, // Underware-style cable channels (base and snap-on lid) to screw inside the back or along the sides
  channelWidth: 1, channelHeight: 12, // the channels: width in 25 mm units, inside height (mm)
  faceBack: 'auto', // cover | vents | mount (a grid of M3 holes to mount things inside, on the back wall) | fan | brace | none
  faceTop: 'auto', faceBottom: 'auto', // closed | open | vents | fan
  faceFan: 120, // the fan size for a back, top or bottom fan face
  topFans: 0, bottomFans: 0, backFans: 0, // how many fans in each fan face (0: as many as fit)
  fillFront: 'auto', // blank off every empty unit at the front
  blankStyle: 'auto', // solid | vents
  filters: true, // a dust filter frame for every fan
  panelFix: 'screws', // screws | latches (quarter-turn, tool-free: the side panels come off in seconds) | magnets (6 × 2 mm pairs: the side panels pull off by hand)
  screen: 'none', // a screen bay at the front: none | 3.5 | 5 | 7 (inch)
  control: false, // a control unit at the top of the front: power button, status lights, fan knobs, a little screen
  ctrlU: 1, // its height in units (1 or 2)
  ctrlLayout: 'button, led, led, led, gap, encoder, encoder, oled', // what goes on it, left to right: button, led, encoder, oled, switch, usb, gap
  ctrlButton: 19, // the power button's hole: 16, 19 or 22 mm
  knobs: true, // print a knob for each encoder
  glands: 2, // sealed: holes for cable glands in the back cover of the bottom section
  glandSize: 20, // M16, M20 or M25 glands
  railHole: 6.4, // M6 bolts with nuts behind; 5.0 to tap M6 straight into the plastic
  vents: 'auto', // auto (none when sealed, hex when open) | none | squares | mesh | hex | holes | diamond | slots | grille | wave | bubbles | honeycomb | angled | arcade | gradient | voronoi (vents.js)
  ventSize: 0, // the openings' size in mm (0: each part's own)
  ventLength: 0, // squares: each opening's length in mm (0: square; long for long rectangles, past the area for one full-length opening)
  ventRound: 2, // squares: the corners' rounding in mm
  ventUpright: false, // squares: stand the long side up
  ventWeb: 0, // the bars between them in mm (0: each part's own)
  ventArea: 'full', // full | window | bands | ends | top
  ventFade: false, // openings shrink from the front to the back
  ventOpen: 0, // density: how open the vented areas are, 10–70 % (0: the bars as set); vents.js sets the bars to match
  ventAngle: 30, // angled: how far the slots lean from upright, 15–60°
  ventMirror: false, // angled: mirror the two halves into chevrons
  ventCells: 0, // honeycomb: cells up the face (0: from the opening size)
  ventArcade: 'rings', // arcade: rings of holes | burst (a speaker cone of slots)
  ventCx: 0.5, ventCy: 0.5, // arcade: its centre, as a share of the face across and up
  ventDir: 'front', // gradient: where the holes are biggest: front | back | up | down
  ventSeed: 1, // voronoi: which arrangement of cells
  ventRotate: 0, // turn the pattern 0–90°
  ventFadeDir: 'back', // with ventFade: shrink towards the back (as before), front, up, down, or radial (out from the middle)
  ventFadeAmt: 60, // how much smaller the far end gets, 0–100 %
  ventShape: null, // custom: your own shape's outlines (a drawing, traced in the studio), repeated
  ventSide: '', ventTop: '', ventBack: '', ventBlank: '', // each face's own pattern ('' : the rack's)
  edgeRound: 2.4, // the outside edges' round in mm (0 for a chamfer or square edges)
  edgeChamfer: 0, // a 45° chamfer in mm instead (when the round is 0)
  edgeStep: false, // the chamfer as two 45° steps, machined
  bezelDepth: 0, // how far the front frame stands proud of the gear, 0–12 mm
  bezel: 'slim', // the front's style: full (the panels inside a frame) | slim (as set by frontFlush and frontFace: a recessed panel in a slim lip by default) | none (edge to edge, a hairline seam)
  frameProfile: 'square', // the end frames' cross-section: square | chamfered | tapered | waisted
  bumpers: 'none', // none | corner (caps over the 8 corners) | rugged (+ guards down the vertical edges) | full (+ rails along every frame edge): TPU, rack-armour.js
  bumperSize: 24, // how far each corner cap wraps, 12–40 mm
  bumperGrip: 'smooth', // smooth | ribbed | knurled
  feet: 'none', // none | pads | spikes | casters | plinth
  insertSides: 'none', // none | wood | acrylic | metal: a sheet set flush into each side panel (rack-inserts.js; cut files, not prints)
  insertBlanks: 'none', // the same, in each front blank
  insertT: 0, // the sheet's thickness in mm (0: the material's usual one)
  insertRound: 4, // the sheet's corner radius
  matFrame: '', finFrame: '', matPanels: '', finPanels: '', matRails: '', finRails: '', // phase 1G: a material and finish for the frame, panels and rails ('' as the rack)
  coverTop: 'fixed', // fixed | magnets (phase 1I: the top's middle is a lid that lifts off, held by magnets)
  hardware: 'classic', // classic (M3 frame bolts) | mixed (phase 1H: structure M6, M8 at extreme; trim M4 or M3; every head flush; a hardware list)
  chassis: 'none', // none | itx3u | itx4u | matx4u | dock4u (phase 1J: a PC chassis in the bottom units; matx says why it won't fit 10-inch rails; dock4u: a graphics card for a mini PC, in an OCuLink dock)
  gpu: 'standard', // the chassis' card: none | lowprofile | compact | standard | big | huge
  psu: '', // the chassis' supply: sfx | sfxl | flex ('' the chassis' first)
  structureThread: '', // mixed: M6 | M8 ('' by strength)
  trimThread: 'M4', // mixed: M4 | M3
  shelves: 1, // 1U shelves
  shelfDepth: 150, // and the drawers' depth
  blanks: 1, // 1U vented blank panels
  patch: 0, // 1U keystone patch panels
  ports: 12, // keystone jacks on each
  keyW: 14.9, // the keystone hole: check one of your jacks
  keyH: 19.4,
  drawers: 0,
  drawerU: 2,
  handle: true, // carry handles on top
  handleStyle: 'auto', // auto (tab when recessed, else arch) | arch | low | slim | tab | classic
  style: 'frame', // frame: uprights, end frames, side panels | box: stackable boxes
  panels: true, // side panels (framed racks)
  badge: 'VERTEX', // raised on each side panel; empty for none
  fans: 0, // fan panels: blow air through the rack
  fanSize: 80, // 40 mm fans on 1U panels, 80 mm on 2U, 92 and 120 mm on 3U, 140 mm on 4U
  fanCount: 2, // fans across each panel
  fanCounts: '', // or one count per fan panel, top first: '2, 1, 2' (blank: fanCount for all)
  cable: 0, // 1U cable pass-through panels
  device: 'none', // device panels: none | pi | tiny | nuc | macmini | switch8 | flexmini | zima | hdd35 | ssd25 | custom
  devices: 2, // how many across each panel
  devCount: 1, // how many device panels
  device2: 'none', devCount2: 1, devices2: 2, // a second kind of device on panels of its own
  device3: 'none', devCount3: 1, devices3: 1, // and a third
  devW: 120, devH: 38, devD: 120, // a custom device: its front face and depth
  tinyTray: false, // Epic 1 rule 9: each ThinkCentre Tiny (device 'tiny') on its own 1U sliding tray, vents over its intakes
  tinyDrive: 'ssd7', // what's in each Tiny's 2.5-inch bay: 7 mm drives only (DRIVES25)
  bays: 0, // drive bay panels: cages that clip together, sleds that slide in on rails
  bayDrive: 'ssd25', // hdd35 | hdd25 | ssd25 | m2
  bayOrient: 'flat', // flat | side (cages a quarter turn, drives on edge: more 3.5" drives across a bay)
  bayMount: 'clip', // clip: push-in pins into the drive's screw holes | screw
  bayU: 0, // a bay's height (0: the least that holds one row); taller bays stack more rows
  bayPower: true, // 3.5" bays: a power module with a 12 V socket beside each cage row
  jack: 11, // the power socket's hole
  mounts: 0, // 1U mounting plates: a 10 mm grid of M3 holes for housings, power supply boards, hubs
  pdu: 0, // power boards (power strips) held upright up the back rails, like a 0U PDU: 0, 1 (left) or 2
  pduW: 55, pduH: 42, // the power board's width and height (its cross-section)
  pduL: 250, // and its length, end to end
  pduMount: 'auto', // upright: standing up a back rail | across: lying across the back, an end cup on each rail (boards 232–257 mm) | auto: upright if the rack is tall enough
  sideFan: 0, // fans in the side panels: 0 for none, or 40, 60, 80, 92, 120, 140 mm
  sideFanCount: 1, // side by side, along the depth
  sideFanAt: 50, // where along the depth (0 front, 100 back)
  sideFanH: 50, // and how high (0 bottom, 100 top of the section)
  sideFanSides: 'both', // both | left | right
  sideFanWhere: 'all', // all | top | bottom: which sections
  panelStyle: 'solid', // solid | ribbed | isogrid | light
  colFrame: '#9ec4b5', colRails: '#3a3f45', colPanels: '#f1ece0', colGear: '#2c3035', // the colours (preview and the 3MF's filaments)
  material: 'petg', // the filament the rack prints in (a filaments.js id); zones can differ
  zones: '', // material zones (rack-zones.js): JSON { zoneId: { material, colour, finish } }; empty: every zone follows its colour group
  logo: null, // your logo, traced (uploaded in the studio)
  logoSize: 60, logoX: 50, logoY: 45, // its size (mm) and where on the side panels (% along, % up)
  backLayout: 'io, slots, fan:2, vents', // faceBack 'modules': small rear panels from the top down: io, psu, sfx, slots, fan[:count], vents[:U], mount[:U], blank[:U]
  carts: 0, // snap-in cartridge bays (2U each, 8 slots): our own push-to-click, pull-to-release cartridges
  cartLayout: 'pi, pi, pi, pi, pi, pi, vent, light', // what's in each slot, left to right: pi (Raspberry Pi 4 / 5), blank, vent, light, or empty
  frontFace: 'inset', // with the flush front: inset (each upright has a 4 mm lip at its outside edge, level with the panels, so the front and back panels sit recessed in a frame) | overlay (the panels run right to the frame's edge)
  windowFill: 'acrylic', // side windows (fixed panel or door): acrylic (a 3 mm sheet held by clips inside) | print (a clear PETG pane printed in the panel as its own body, keyed into a groove)
  cableTies: true, // framed: zip-tie anchors moulded into the inside of each side panel (a bridge over a hidden tunnel), two columns, every 60 mm
  spliceWrap: 'side', // framed, flush front, 2+ sections: side (inlaid in the side) | half (each splice wraps round its corner onto the front/back panel ear) | full (and a flush belt right across the front and back)
  magnets: 'none', // framed: none | light (blanks, vent, fan, cable and patch panels, back covers and rear panels pull off: two 6 × 2 mm magnet pairs per ear per U) | all (every rail panel)
  railNuts: 'nuts', // framed: none (5 mm pilot holes: M6 thread-forming screws, or tap them) | nuts (round rail holes, an M6 nut behind each) | cage (9.5 mm square holes for M6 cage nuts, the face thinned to 2 mm round each so the clips grip)
  fastening: 'nuts', // framed: nuts (M3 bolts and nuts) | inserts (short M3 heat-set brass inserts in the panels, splice backers and plates, and the corner brackets)
  door: 'none', // framed: side panels that open as doors: none | right | left | both (hinged at the back, a twist lock at the front)
  frontFlush: true, // framed: our front panels, back covers and braces as wide as the frame, so their sides run flush with the uprights (bought 10-inch gear still fits: it sits on the rails as before)
  flush: true, // recessed: the badge and logo inlaid flush, screw heads and latch knobs sunk into the panel, a flush handle
  logoStyle: 'raised', // raised | engraved | cut (through: a stencil, backed with mesh when sealed)
  art: null, // panel art: a picture reduced to 2–4 colours in the studio ({ aspect, layers: [{ colour, shapes: [{ outer, holes }] }] }, 0–1, y up; layer 0 is the background)
  artFit: 'fill', // fill: the art stretches to cover the panel | fit: it keeps its shape, centred
  artSides: 'both', // both | left | right
  artColours: 3, // the studio: how many colours a picture is reduced to (2–4)
};

// Panel art from the studio, checked: 2 to 4 layers, each a colour and its outlines (0–1, y up). Layer 0 is the
// background (it fills whatever the others don't). Capped so a huge picture can't stall the build.
const ART_DEPTH = 0.6;
function cleanArt(a) {
  if (!a || !Array.isArray(a.layers) || a.layers.length < 2) return null;
  let pts = 0;
  const pt = (q) => Array.isArray(q) && q.length === 2 && q.every((v) => Number.isFinite(v) && v >= -0.01 && v <= 1.01);
  const ring = (r) => (Array.isArray(r) && r.length >= 3 && r.every(pt) && (pts += r.length) <= 40000 ? r : null);
  const layers = a.layers.slice(0, 4).map((ly, i) => ({
    colour: /^#[0-9a-f]{6}$/i.test(ly?.colour || '') ? ly.colour.toLowerCase() : ['#1b1f22', '#9ec4b5', '#f1ece0', '#e8891c'][i],
    shapes: i === 0 ? [] : (Array.isArray(ly?.shapes) ? ly.shapes : []).slice(0, 400).map((g) => ({ outer: ring(g?.outer), holes: (Array.isArray(g?.holes) ? g.holes : []).map(ring).filter(Boolean) })).filter((g) => g.outer),
  }));
  if (layers.slice(1).every((ly) => !ly.shapes.length)) return null;
  const aspect = Math.min(8, Math.max(0.125, Number(a.aspect) || 1));
  return { aspect, layers, key: `${layers.length}:${pts}:${layers.map((l) => l.colour).join('')}:${aspect.toFixed(3)}` };
}

// Devices a panel can hold: the window for its front (w × h, lifted off the
// shelf), its depth and whether it sits on a printed sled (a Pi, on standoffs).
// Sizes are the makers' published outside sizes plus 2 mm (the drives: their
// standard form factors, 101.6 and 69.85 mm wide, plus 1 mm).
export const RACK_DEVICES = {
  pi: { name: 'Raspberry Pi 4 / 5', w: 58, h: 20, d: 88, lift: 7, sled: 'pi' },
  uno: { name: 'Arduino Uno / Leonardo', w: 55, h: 22, d: 76, lift: 7, sled: 'uno' },
  mega: { name: 'Arduino Mega 2560', w: 55, h: 22, d: 110, lift: 7, sled: 'mega' },
  // A Pi 5 with a SATA HAT screwed straight onto it (on the HAT's own standoffs, over the Pi's holes): the
  // window takes the stack and its cooler, and a slot behind lets the drive and 12 V leads through.
  pi5hat: { name: 'Raspberry Pi 5 + SATA HAT', w: 58, h: 46, d: 95, lift: 7, sled: 'pi', hat: true },
  // Lenovo's 1-litre PCs lie flat in 1U: the ThinkCentre Tiny (M70q, M720q, M920q, Neo 50q: 179 × 34.5 × 182.9 mm)
  // and the ThinkStation Tiny (P3 Tiny, P360 Tiny: the same footprint, 37 mm tall), with room round each.
  tiny: { name: 'Lenovo ThinkCentre Tiny (M70q, M720q, M920q, Neo 50q)', w: 181, h: 37, d: 185, lift: 0 },
  thinkstation: { name: 'Lenovo ThinkStation Tiny (P3 Tiny, P360 Tiny)', w: 181, h: 37.5, d: 185, lift: 0 },
  nuc: { name: 'Intel NUC (slim)', w: 119, h: 39, d: 114, lift: 0 },
  macmini: { name: 'Mac mini (M4)', w: 129, h: 52, d: 129, lift: 0 },
  switch8: { name: '8-port desktop switch (TP-Link TL-SG108)', w: 160, h: 27, d: 103, lift: 0 },
  switch5: { name: '5-port desktop switch (typical)', w: 100, h: 26, d: 98, lift: 0 },
  indmini: { name: 'Industrial mini switch, lying flat (typical DIN-rail 5-port)', w: 135, h: 32, d: 105, lift: 0 },
  router: { name: 'Travel or mini router (typical)', w: 120, h: 32, d: 90, lift: 0 },
  flexmini: { name: 'UniFi Flex Mini switch', w: 119, h: 23, d: 92, lift: 0 },
  zima: { name: 'ZimaBoard', w: 141, h: 37, d: 84, lift: 0 },
  hdd35: { name: '3.5" hard drive', w: 102.6, h: 28, d: 147, lift: 0 },
  ssd25: { name: '2.5" drive', w: 70.9, h: 16, d: 100, lift: 0 },
  // Portable USB drives in their own cases, lying flat, the USB end to the back: WD My Passport 4 to 6 TB (107.2 × 75 × 19.15 mm).
  mypassport: { name: 'WD My Passport (4–6 TB)', w: 77, h: 21.2, d: 108, lift: 0 },
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
export const RACK10 = { U: 44.45, ears: 254, holes: 236.5, clear: 222.25, unitHoles: [6.35, 22.225, 38.1] };

// A height in U as sections of at most 5U, as even as possible (12U: 4 + 4 + 4).
export function rackSections(total) {
  const n = Math.ceil(total / 5), base = Math.floor(total / n), extra = total % n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}
// Fans: the hole pattern (screw spacing) of each size, and the panel height it needs.
// Screen bays: the screen module's outline (w × h), its viewing area (vw × vh) and the units it takes.
export const SCREENS = {
  '3.5': { name: '3.5-inch', w: 86, h: 56, vw: 74, vh: 50, u: 2 },
  '5': { name: '5-inch', w: 121, h: 77, vw: 109, vh: 66, u: 2 },
  '7': { name: '7-inch', w: 165, h: 101, vw: 155, vh: 88, u: 3 },
  // 10.1-inch panels (235 × 143 mm, active 222.7 × 125.3) are wider than the rail screws are apart, so in landscape
  // the screen sits in a bezel on the front of its panel; on end (portrait) it fits between the rails, flush.
  '10': { name: '10.1-inch, landscape (bezel on the front)', w: 235, h: 143, vw: 222.7, vh: 125.3, u: 4, bezel: 4.8 },
  '10p': { name: '10.1-inch, portrait (flush)', w: 143, h: 235, vw: 125.3, vh: 222.7, u: 6 },
};
export const FANS = { 40: 32, 60: 50, 80: 71.5, 92: 82.5, 120: 105, 140: 124.5 };
export const fanUnits = (size) => (size <= 40 ? 1 : Math.ceil((size + 6) / RACK10.U));

export function serverRackPlan(options = {}) {
  const o = { ...SERVERRACK_DEFAULTS, ...options };
  const style = o.style === 'box' ? 'box' : 'frame', height = Math.round(num(o.height, 0, 42, 0));
  const boxes = style === 'frame' && height > 0 ? rackSections(height) : [Math.round(num(o.units, 1, 5, 5)), Math.round(num(o.units2, 0, 5, 0)), Math.round(num(o.units3, 0, 5, 0))].filter((u) => u > 0);
  const extreme = o.strength === 'extreme', heavy = extreme || o.strength === 'heavy' || o.strength === undefined, total = boxes.reduce((a, u) => a + u, 0);
  const D = num(o.depth, 120, style === 'frame' ? (['itx3u', 'itx4u', 'matx4u', 'dock4u'].includes(o.chassis) ? 450 : 300) : 250, 200), hole = num(o.railHole, 4, 9, 6.4); // a PC chassis needs the card's length plus 40 mm: up to 450 deep
  const t = 4, pt = 8, fe = 5; // panel, plate and rail thickness
  const hx = RACK10.holes / 2, ex = RACK10.clear / 2; // a rail hole's x, the rails' inner edge
  const inner = hx + (hx - ex); // the panels' inner faces: as far outside the hole as the rail edge is inside it
  const base = o.enclosure !== 'open', explicit = VENT_STYLES.includes(o.vents), noVents = o.vents === 'none' || o.vents === false || o.vents === 'false';
  const pick = (v, list, d) => (list.includes(v) ? v : d);
  const sideDefault = base && !explicit ? 'solid' : 'vents';
  const faces = {
    left: pick(o.faceLeft, ['solid', 'vents', 'window', 'opengrid', 'none'], sideDefault), right: pick(o.faceRight, ['solid', 'vents', 'window', 'opengrid', 'none'], sideDefault),
    back: pick(o.faceBack, ['cover', 'vents', 'mount', 'fan', 'modules', 'brace', 'none'], base ? 'cover' : 'none'),
    top: pick(o.faceTop, ['closed', 'open', 'vents', 'fan'], base ? 'closed' : 'open'), bottom: pick(o.faceBottom, ['closed', 'open', 'vents', 'fan'], base ? 'closed' : 'open'),
  };
  if (style === 'box') { faces.top = faces.top === 'fan' ? 'closed' : faces.top; faces.bottom = faces.bottom === 'fan' ? 'closed' : faces.bottom; if (['mount', 'fan', 'modules', 'brace'].includes(faces.back)) faces.back = 'cover'; }
  const fillFront = o.fillFront === 'auto' || o.fillFront === undefined ? base : o.fillFront === true || o.fillFront === 'true';
  const blankStyle = pick(o.blankStyle, ['solid', 'vents'], base && !explicit ? 'solid' : 'vents');
  const anyVents = [faces.left, faces.right, faces.back, faces.top, faces.bottom, blankStyle].includes('vents');
  const covered = !['none', 'brace'].includes(faces.back);
  const sealed = ['solid', 'window', 'opengrid'].includes(faces.left) && ['solid', 'window', 'opengrid'].includes(faces.right) && covered && faces.back !== 'vents' && !['open', 'vents'].includes(faces.top) && !['open', 'vents'].includes(faces.bottom) && fillFront && blankStyle === 'solid';
  return {
    faces, fillFront, blankStyle, covered, base, faceFan: FANS[Number(o.faceFan)] ? Number(o.faceFan) : 120, topFans: Math.round(num(o.topFans, 0, 3, 0)), bottomFans: Math.round(num(o.bottomFans, 0, 3, 0)), backFans: Math.round(num(o.backFans, 0, 2, 0)), filters: o.filters !== false && o.filters !== 'false',
    cableRings: Math.round(num(o.cableRings, 0, 8, 0)), cableChannels: Math.round(num(o.cableChannels, 0, 6, 0)), channelWidth: Math.round(num(o.channelWidth, 1, 4, 1)), channelHeight: num(o.channelHeight, 12, 36, 12),
    panelFix: ['latches', 'magnets'].includes(o.panelFix) ? o.panelFix : 'screws', screen: SCREENS[o.screen] ? o.screen : 'none',
    control: o.control === true || o.control === 'true', ctrlU: Number(o.ctrlU) === 2 ? 2 : 1, ctrl: ctrlItems(o.ctrlLayout ?? SERVERRACK_DEFAULTS.ctrlLayout), ctrlButton: [16, 19, 22].includes(Number(o.ctrlButton)) ? Number(o.ctrlButton) : 19, knobs: o.knobs !== false && o.knobs !== 'false',
    W: style === 'frame' && num(o.width, 0, 400, 0) > 256 ? num(o.width, 256, 400, 256) : 0,
    sealed, glands: covered ? Math.round(num(o.glands, 0, 5, 2)) : 0, glandSize: [16, 20, 25].includes(Number(o.glandSize)) ? Number(o.glandSize) : 20,
    o, boxes, D, hole, t, pt, fe, hx, ex, inner, outer: inner + t, ear: inner - ex, Wi: 2 * inner - 0.4,
    // Vents: auto is none on a sealed rack and a honeycomb on an open one; any style can be picked for either
    // (a sealed rack's vents are backed with filter mesh).
    vents: noVents ? false : explicit ? o.vents : anyVents ? 'hex' : false, ...ventOptions(o),
    frameProfile: ['chamfered', 'tapered', 'waisted'].includes(o.frameProfile) ? o.frameProfile : 'square',
    ...(style === 'frame' ? armourOptions(o, D) : armourOptions({})), // phase 1D: bumpers and feet (framed racks)
    ...insertOptions(o, style === 'frame'), // phase 1E: wood, acrylic and metal inserts (framed racks)
    ...chassisOptions(o, style === 'frame'), // phase 1J: a PC chassis in the bottom units
    coverTop: style === 'frame' && o.coverTop === 'magnets' && faces.top !== 'open' && D - 2 * 24 + 2 * LID.ledge <= LID.bed ? 'magnets' : 'fixed', // phase 1I: the top lifts off
    edge: edgeSpec(o), bezelDepth: Math.round(num(o.bezelDepth, 0, 12, 0) * 2) / 2, // phase 1C: the edges' style and size, the front frame's reach
    ventSize: num(o.ventSize, 0, 80, 0), ventLength: num(o.ventLength, 0, 400, 0), ventRound: num(o.ventRound, 0, 20, 2), ventUpright: o.ventUpright === true || o.ventUpright === 'true', ventWeb: num(o.ventWeb, 0, 8, 0), ventArea: ['window', 'bands', 'ends', 'top'].includes(o.ventArea) ? o.ventArea : 'full', ventFade: o.ventFade === true || o.ventFade === 'true',
    shelves: Math.round(num(o.shelves, 0, 4, 1)), shelfDepth: Math.min(num(o.shelfDepth, 60, 240, 150), D - 15), blanks: Math.round(num(o.blanks, 0, 4, 1)),
    patch: Math.round(num(o.patch, 0, 4, 0)), ports: Math.round(num(o.ports, 1, 12, 12)), keyW: num(o.keyW, 13, 17, 14.9), keyH: num(o.keyH, 15, 22, 19.4),
    device: RACK_DEVICES[o.device] || o.device === 'custom' ? o.device : 'none',
    devCount: Math.round(num(o.devCount, 0, 4, 1)), devices: Math.round(num(o.devices, 1, 4, 2)),
    dev: o.device === 'custom' ? { name: 'your device', w: num(o.devW, 20, 215, 120) + 2, h: num(o.devH, 10, 125, 38) + 2, d: num(o.devD, 30, 240, 120), lift: 0 } : RACK_DEVICES[o.device] || null,
    // More device panels, each for a different device (a Tiny's trays, then a panel of drives, then a switch).
    moreDevs: [2, 3].map((k) => RACK_DEVICES[o[`device${k}`]] ? { device: o[`device${k}`], dev: RACK_DEVICES[o[`device${k}`]], devCount: Math.round(num(o[`devCount${k}`], 0, 4, 1)), devices: Math.round(num(o[`devices${k}`], 1, 4, 2)) } : null).filter((m) => m && m.devCount > 0),
    fans: Math.round(num(o.fans, 0, 4, 0)), fanSize: FANS[Number(o.fanSize)] ? Number(o.fanSize) : 80, fanCount: Math.round(num(o.fanCount, 1, 4, 2)), fanCounts: String(o.fanCounts ?? '').split(/[,;\s]+/).filter(Boolean).slice(0, 4).map((v) => Math.round(num(v, 1, 4, 2))), cable: Math.round(num(o.cable, 0, 4, 0)),
    drawers: Math.round(num(o.drawers, 0, 4, 0)), drawerU: Math.round(num(o.drawerU, 1, 3, 2)), handle: o.handle !== false && o.handle !== 'false', handleStyle: HANDLES[o.handleStyle] ? o.handleStyle : o.flush !== false && o.flush !== 'false' ? 'tab' : 'arch',
    style, heavy, extreme, ...hardwareOptions(o, style, extreme ? 'extreme' : heavy ? 'heavy' : 'standard'),
    fr: o.hardware === 'mixed' && style === 'frame' ? mixedFrame(extreme ? FR_EXTREME : heavy ? FR_HEAVY : FR, hardwareOptions(o, style, extreme ? 'extreme' : heavy ? 'heavy' : 'standard')) : extreme ? FR_EXTREME : heavy ? FR_HEAVY : FR,
    gussets: ['none', 'tall', 'double', 'max'].includes(o.gussets) ? o.gussets : 'standard',
    braces: style === 'frame' && (faces.back === 'brace' || (faces.back === 'none' && (o.braces === true || o.braces === 'true' || ((o.braces === 'auto' || o.braces === undefined) && (total >= 10 || heavy))))),
    bay: rackBay(o, ex),
    // Rule 9: Lenovo Tiny trays, framed racks only (the guides bolt to the back rails). One PC per 1U tray.
    tinyTray: style === 'frame' && o.device === 'tiny' && (o.tinyTray === true || o.tinyTray === 'true' || o.tinyTray === '1'),
    tinyDrive: DRIVES25[o.tinyDrive] ? o.tinyDrive : 'ssd7',
    mounts: Math.round(num(o.mounts, 0, 4, 0)),
    pdu: style === 'frame' ? Math.round(num(o.pdu, 0, 2, 0)) : 0, pduW: num(o.pduW, 30, 80, 55), pduH: num(o.pduH, 25, 60, 42), pduL: num(o.pduL, 80, 900, 250), pduMount: ['upright', 'across'].includes(o.pduMount) ? o.pduMount : 'auto',
    sideFan: style === 'frame' && FANS[Number(o.sideFan)] ? { size: Number(o.sideFan), count: Math.round(num(o.sideFanCount, 1, 4, 1)), at: num(o.sideFanAt, 0, 100, 50) / 100, h: num(o.sideFanH, 0, 100, 50) / 100, sides: ['left', 'right'].includes(o.sideFanSides) ? o.sideFanSides : 'both', where: ['top', 'bottom'].includes(o.sideFanWhere) ? o.sideFanWhere : 'all' } : null,
    // The side panels' look: solid; ribbed (raised ribs, stiffer); isogrid (a raised triangle grid, the stiffest);
    // light (a thinner panel held flat by a taller triangle grid: about a third less plastic).
    panelStyle: ['ribbed', 'isogrid', 'light'].includes(o.panelStyle) ? o.panelStyle : 'solid',
    // Your logo on the side panels: traced outlines in a 0–1 box (y up), raised, engraved or cut through.
    logo: Array.isArray(o.logo) && o.logo.length ? o.logo.slice(0, 200) : null,
    logoKey: Array.isArray(o.logo) && o.logo.length ? o.logo.length + ':' + JSON.stringify(o.logo).length : '',
    logoSize: num(o.logoSize, 15, 160, 60), logoX: num(o.logoX, 0, 100, 50) / 100, logoY: num(o.logoY, 0, 100, 45) / 100,
    logoStyle: ['engraved', 'cut'].includes(o.logoStyle) ? o.logoStyle : 'raised', flush: o.flush !== false && o.flush !== 'false', frontFlush: style === 'frame' && (o.bezel === 'full' ? false : o.bezel === 'none' ? true : o.frontFlush !== false && o.frontFlush !== 'false'), door: style === 'frame' && ['right', 'left', 'both'].includes(o.door) ? o.door : 'none', fastening: style === 'frame' && o.fastening === 'inserts' ? 'inserts' : 'nuts', railNuts: style === 'frame' && ['cage', 'none'].includes(o.railNuts) ? o.railNuts : 'nuts', frontFace: o.bezel === 'none' || (o.bezel !== 'full' && (o.frontFace === 'overlay' || (wrapAsked(o) && Number(o.units2) > 0))) ? 'overlay' : 'inset', carts: style === 'frame' ? Math.round(num(o.carts, 0, 2, 0)) : 0, cartLayout: String(o.cartLayout ?? SERVERRACK_DEFAULTS.cartLayout).toLowerCase().split(/[,;\s]+/).filter(Boolean).slice(0, 8).map((t) => (CART_TYPES[t] ? t : 'empty')), windowFill: o.windowFill === 'print' ? 'print' : 'acrylic', cableTies: style === 'frame' && o.cableTies !== false && o.cableTies !== 'false', spliceWrap: style === 'frame' && ['half', 'full'].includes(o.spliceWrap) ? o.spliceWrap : 'side', magnets: style === 'frame' && o.railNuts !== 'cage' && ['light', 'all'].includes(o.magnets) ? o.magnets : 'none', backMods: backMods(o.backLayout ?? SERVERRACK_DEFAULTS.backLayout),
    art: cleanArt(o.art), artFit: o.artFit === 'fit' ? 'fit' : 'fill', artSides: ['left', 'right'].includes(o.artSides) ? o.artSides : 'both',
    panels: o.panels !== false && o.panels !== 'false', badge: String(o.badge ?? 'VERTEX').toUpperCase().replace(/[^A-Z0-9 .\-]/g, '').slice(0, 14).trim(),
  };
}

function bayNote(B) {
  const d = B.b.dr, how = d.lips ? 'held by lips and a cable tie' : B.mount === 'screw' ? `held by 4 ${d.side.screw} screws${d.bottom ? ' (or 4 from below)' : ''}` : 'held by pins that push into its screw holes (spring the walls apart, drop it in)';
  return `Drive bays: each drive goes on a sled, ${how}. Sleds slide into their cage on rails and click home; pull to take one out. Cages clip together by dovetails${B.rows > 1 ? ` (${B.rows} high)` : ''} and slide onto the bay floor from the back. Print cages${B.power ? ' and power modules' : ''} standing on end, sleds flat.${B.side ? ` On their side: each cage is turned a quarter turn so the drive stands on edge, ${B.rows * B.cols.length} drives in this ${B.u}U bay (flat, the same height holds ${B.other}). Same parts, they just clip together turned.${B.drive === 'hdd35' ? ' Feed 12 V to each drive from a SATA power board behind the bay (no power module on its side).' : ''}` : B.other > B.rows * B.cols.length ? ` Tip: on their side, this height holds ${B.other} drives.` : ''}${B.power ? ` Power module: a ${B.jack} mm hole for a 12 V panel socket (5.5 × 2.1 mm), holes for a 12 V to SATA power board, and a slot for the lead to the drive.` : ''}`;
}

// Drive bays: which drive, how high, how many rows and columns.
function rackBay(o, ex) {
  const drive = BAY_DRIVES[o.bayDrive] ? o.bayDrive : 'ssd25', b = bayDims(drive), st = 5;
  // On their side: each cage a quarter turn, the drive on edge (more 3.5" drives across a bay; no power module then).
  const side = o.bayOrient === 'side', g = bayGeom(drive, side);
  const power = !side && drive === 'hdd35' && o.bayPower !== false && o.bayPower !== 'false';
  const fit = (gg) => { const need = Math.ceil((st + gg.pitchY + 0.5 + 0.8) / RACK10.U), u = Math.max(need, Math.round(num(o.bayU, 0, 4, 0))); return { u, rows: Math.max(1, Math.floor((u * RACK10.U - 0.8 - st - 0.5) / gg.pitchY)) }; };
  const { u, rows } = fit(g);
  const lay = bayLayout(drive, 2 * (ex - 1), power, side);
  // What the other way round would hold in the same height, for the notes.
  const og = bayGeom(drive, !side), oRows = Math.max(0, Math.floor((u * RACK10.U - 0.8 - st - 0.5) / og.pitchY)), other = oRows * bayLayout(drive, 2 * (ex - 1), false, !side).cols.length;
  return { count: Math.round(num(o.bays, 0, 4, 0)), drive, b, g, side, other, st, u, rows, power, cols: lay.cols, powerX: lay.power, total: lay.total, mount: o.bayMount === 'screw' ? 'screw' : 'clip', jack: num(o.jack, 6, 14, 11) };
}

const boxHeight = (p, u) => u * RACK10.U + 2 * p.pt;
// Vents: the patterns, areas, fade and density are the vents engine's (vents.js, Epic 1 phase 1B).
// Everything about the look, for the part cache: change a style and the parts it touches are rebuilt.
const looks = (p) => [JSON.stringify(p.faces), p.faceFan, p.topFans, p.bottomFans, p.backFans, p.blankStyle, p.panelFix, p.vents, p.ventSize, p.ventLength, p.ventRound, p.ventUpright, p.ventWeb, p.ventArea, p.ventFade, p.ventOpen, p.ventAngle, p.ventMirror, p.ventCells, p.ventArcade, p.ventCx, p.ventCy, p.ventDir, p.ventSeed, p.ventRotate, p.ventFadeDir, p.ventFadeAmt, JSON.stringify(p.ventFaces), p.ventShape ? JSON.stringify(p.ventShape).length : 0, p.frameProfile, p.feet, p.coverTop, p.chassis, p.gpu, p.psu, p.insertSides, p.insertBlanks, p.insertT, p.insertRound, p.panelStyle, p.ribH, p.logoKey, p.logoSize, p.logoX, p.logoY, p.logoStyle, p.flush, p.frontFlush, p.fastening, p.railNuts, p.magnets, p.spliceWrap, p.cableTies, p.windowFill, p.frontFace, p.carts, p.cartLayout.join(), JSON.stringify(p.backMods), p.art?.key || '', p.artFit, p.W, p.control, p.ctrlU, p.ctrl.join(','), p.ctrlButton].join('|');
const vents = ventPanel;
// A face's own pattern, if it has one (Vents → Each face), else the rack's.
const at = (p, face, fallback) => { const own = p.ventFaces?.[face]; return own ? { ...p, vents: own } : fallback ? { ...p, vents: p.vents || fallback } : p; };
const screwYs = (D) => [D * 0.2, D * 0.5, D * 0.8];

// The frame parts depend on a handful of numbers and take most of the time:
// keep the last few, so changing the gear doesn't rebuild the rack.
const cache = new Map();
// Sized by what the parts hold, not how many: a whole rack's parts, its quick preview and a few changes
// back all stay (so trying a setting and going back is instant), up to about 100 MB of numbers. The part
// used longest ago goes first.
const MEMO_BUDGET = 12e6;
let memoHeld = 0;
const memoSize = (v) => (v?.positions ? v.positions.length + (v.indices?.length || 0) : Array.isArray(v?.parts) ? v.parts.reduce((a, q) => a + memoSize(q.mesh), 0) : 1000);
const memo = (key0, make) => {
  const key = `${draftScale()}|${key0}`;
  if (cache.has(key)) { const hit = cache.get(key); cache.delete(key); cache.set(key, hit); return hit.v; } // most recent last
  const v = make(), n = memoSize(v);
  cache.set(key, { v, n }); memoHeld += n;
  while (memoHeld > MEMO_BUDGET && cache.size > 1) { const [k0, e] = cache.entries().next().value; cache.delete(k0); memoHeld -= e.n; }
  return v;
};

// A side panel as it prints: x along the depth, y up the box, z off the bed.
function sidePanel(p, u) {
  const { D, t, pt, fe, ear, hole } = p, H = boxHeight(p, u);
  const panel = sections([0, 0, D, H], [0, 0.4, t], (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    d.on(rr(f, f, D - f, H - f, 3));
    if (p.faces.left === 'vents' || p.faces.right === 'vents') vents(at(p, 'side'), d, fe + 14, pt + 12, D - fe - 14, H - pt - 12);
    for (const y of screwYs(D)) { d.disc(y, pt / 2, 1.7, 0); d.disc(y, H - pt / 2, 1.7, 0); } // into the plates' edges (M3)
  }, 0.15, 0.12);
  // The rails: standing up off the panel at both ends, drilled to the EIA pattern.
  const r = hole / 2, b = t + (p.hx - p.ex); // the holes sit as far in from the panel as the rail edge is past them
  const rail = sections([0, 0, H, t + ear], [0, fe], (c, d) => {
    d.on(rr(0, t - 0.5, H, t + ear, 1.5));
    for (let k = 0; k < u; k++) for (const h of RACK10.unitHoles) {
      const y = pt + k * RACK10.U + h;
      d.disc(y, b, r, 0);
      d.off([[y - r * Math.SQRT1_2, b + r * Math.SQRT1_2], [y + r * Math.SQRT1_2, b + r * Math.SQRT1_2], [y, b + r * Math.SQRT2]]); // teardrop: prints without a droop
    }
  }, 0.1, 0.08);
  const mesh = new Mesh(); mesh.append(panel);
  for (const x0 of [0, D - fe]) {
    const m = new Mesh(); m.append(rail);
    const q = m.positions;
    for (let i = 0; i < q.length; i += 3) { const a = q[i], bb = q[i + 1], c = q[i + 2]; q[i] = c + x0; q[i + 1] = a; q[i + 2] = bb; } // (a, b, c) → (c, a, b): a rotation
    mesh.append(m);
  }
  return mesh;
}

// A plate as it prints and as it sits: x across, y back from the front, z up.
function plate(p, kind) {
  const { D, pt, fe, Wi } = p, hw = Wi / 2, sq = 1.2; // the edge holes: 2.4 mm square, for M3 self-tapping screws
  const pins = [[-(hw - 22), 22], [hw - 22, 22], [-(hw - 22), D - 22], [hw - 22, D - 22]];
  const cuts = [0, 0.4, pt / 2 - sq, pt / 2 + sq, pt];
  if (kind === 'bottom') cuts.push(4.4);
  const m = sections([-hw, 0, hw, D], cuts, (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    d.on(rr(-hw + f, f, hw - f, D - f, 2));
    // Notches round the rails at the four corners.
    for (const s of [-1, 1]) { d.off(rr(s > 0 ? p.ex - 0.5 : -hw - 1, -1, s > 0 ? hw + 1 : -p.ex + 0.5, fe + 0.6)); d.off(rr(s > 0 ? p.ex - 0.5 : -hw - 1, D - fe - 0.6, s > 0 ? hw + 1 : -p.ex + 0.5, D + 1)); }
    if (['vents', 'open'].includes(kind === 'bottom' ? p.faces.bottom : p.faces.top)) vents(at(p, 'top', 'hex'), d, -hw + 30, 30, hw - 30, D - 30, 8, 3.5);
    for (const [x, y] of pins) d.disc(x, y, 7); // solid round the pins and their holes
    for (const y of screwYs(D)) d.on(rr(-hw, y - 8, -hw + 20, y + 8)), d.on(rr(hw - 20, y - 8, hw, y + 8)); // and round the edge screws
    if (Math.abs(z - pt / 2) < sq) for (const y of screwYs(D)) { d.off(rr(-hw - 1, y - sq, -hw + 14, y + sq)); d.off(rr(hw - 14, y - sq, hw + 1, y + sq)); }
    if (kind === 'bottom' && z < 4.4) for (const [x, y] of pins) d.disc(x, y, 3.3, 0); // the pins of the box below drop in here
    if (kind === 'cap' && p.handle) for (const s of [-1, 1]) { const x = s * (p.ex - 30 + 11 - 7); d.disc(x, D / 2, 4.5); d.disc(x, D / 2, 1.7, 0); } // bolts up into the handle's feet
  }, 0.15, 0.12);
  if (kind === 'top') for (const [x, y] of pins) {
    m.append(extrudePolygon(Array.from({ length: 24 }, (_, k) => [x + 3 * Math.cos((k * Math.PI) / 12), y + 3 * Math.sin((k * Math.PI) / 12)]), [], pt, pt + 3.4));
    m.append(extrudePolygon(Array.from({ length: 24 }, (_, k) => [x + 2.5 * Math.cos((k * Math.PI) / 12), y + 2.5 * Math.sin((k * Math.PI) / 12)]), [], pt + 3.4, pt + 4));
  }
  return m;
}

// The bezel for a landscape 10.1" screen, as it prints (face down): a thin front over the screen's edges with the
// viewing window, walls round the screen, and a rim with M3 pilot holes that screw it to its panel from behind.
export function screenBezel(p) {
  const S = SCREENS[p.screen], T = S.bezel, skin = 1.2, rim = 6, w2 = S.w / 2 + 0.3 + rim, h2 = S.h / 2 + 0.3 + rim;
  return sections([-w2, -h2, w2, h2], [...new Set([0, 0.4, ...CH.filter((c) => c < T), skin, T])].sort((a, b) => a - b), (z, d) => {
    const e = Math.max(z < 0.4 ? 0.4 : 0, ch(z)); // its face's edge rounded like the rest
    d.on(rr(-w2 + e, -h2 + e, w2 - e, h2 - e, 4));
    if (z < skin) d.off(rr(-S.vw / 2, -S.vh / 2, S.vw / 2, S.vh / 2, 2)); // the viewing window
    else d.off(rr(-S.w / 2 - 0.3, -S.h / 2 - 0.3, S.w / 2 + 0.3, S.h / 2 + 0.3, 1.5)); // the screen's pocket, open at the back
    if (z > skin) for (const x of [-S.w / 4, 0, S.w / 4]) for (const sy of [-1, 1]) d.disc(x, sy * (S.h / 2 + 3.5), 1.25, 0); // M3 pilots (self-tapping)
  }, 0.12, 0.08, { loft: SMOOTH.edges });
}

// A front panel with 10-inch ears, as it prints (face down): x across, y up
// the units, z back from the face. On it, by kind:
//   shelf  — a floor and two side lips standing up off its back;
//   blank  — hex vents;
//   patch  — a row of keystone jack holes, the panel thinned to 2 mm round each so the jacks clip in;
//   drawer — an opening and a sleeve (four walls standing off its back) the drawer slides in;
//   fan    — a guarded opening for each fan, with its four screw holes (40 mm fans: 32 mm apart, M3; 80 mm: 71.5 mm, fan screws);
//   cable  — a long rounded slot for cables to pass through, with tie slots above and below it.
function frontPanel(p, u, kind, mod = null, grooves = []) {
  const h = u * RACK10.U - 0.8, hw = panelHalf(p), bi = kind === 'blank' ? blankInsert(p, h) : null, ft = bi ? Math.max(4, Math.ceil((bi.depth + 1.6) * 10) / 10) : kind === 'brace' ? (p.extreme ? 7 : p.heavy ? 6 : 5) : kind.startsWith('back') ? backT(p) + (kind.includes('mount') ? 1 : 0) : kind === 'screen' ? (SCREENS[p.screen]?.bezel ? 4 : 6) : kind === 'control' && p.ctrl.includes('oled') ? 5 : 4;
  const ks = keystones(p), kw = p.keyW, kh = p.keyH;
  const dw = p.ex - 1.5, dh = h - 2; // the drawer sleeve, outside
  const mag = magnetKind(p, kind) && ft - magPocket().depth >= 1.2 ? magPocket() : null; // a pocket in each ear's back, at least 1.2 mm of face left
  const gd = grooves.filter((g) => Number.isFinite(g.depth)).map((g) => g.depth);
  const m = sections([-hw, 0, hw, h], [...new Set([0, 0.4, ...CH, ...(kind === 'patch' || kind === 'screen' || kind === 'control' ? [2] : []), ...(kind === 'cart' ? [1.9] : []), ...(mag ? [ft - mag.depth] : []), ...(bi ? [bi.depth] : []), ...(p.threads && hwHead(p, 'trim').depth < ft ? [hwHead(p, 'trim').depth] : []), ...gd, ...(kind === 'fanctl' ? fanctlCuts(p, ft) : []), ft])].sort((a, b) => a - b), (z, d) => {
    if (kind === 'fanctl' && z > ft) { fanctlLedges(p, d, h); return; } // behind the face: the ledges the board rests on
    const f = Math.max(z < 0.4 ? 0.4 : 0, ch(z)); // the face's edge chamfered (it prints face down)
    d.on(rr(-hw + f, f, hw - f, h - f, 2));
    if (mag && z > ft - mag.depth) for (let k = 0; k < u; k++) for (const s of [-1, 1]) for (const my of MAG_YS) { const y = k * RACK10.U + my - 0.4; if (!grooves.some((g) => Number.isFinite(g.depth) && s * p.hx > g.x0 - 3.2 && s * p.hx < g.x1 + 3.2 && y > g.y0 - 3.2 && y < g.y1 + 3.2)) d.disc(s * p.hx, y, mag.r, 0); } // no magnet behind a wrap pocket
    for (const g of grooves) if (z < g.depth) d.off(rr(g.x0, g.y0, g.x1, g.y1));
    for (let k = 0; k < u; k++) for (const hy of [RACK10.unitHoles[0], RACK10.unitHoles[2]]) for (const s of [-1, 1]) {
      const y = k * RACK10.U + hy - 0.4;
      const er = hwHole(p, 'trim', 3.3), eh = hwHead(p, 'trim');
      d.off(rr(s * p.hx - er, y - 4, s * p.hx + er, y + 4, er)); // slotted, so a panel lines up with any print
      if (eh && z < eh.depth && ft >= eh.depth + HEADS[p.threads.trim].floor) d.off(rr(s * p.hx - eh.r, y - 4 - eh.r + er, s * p.hx + eh.r, y + 4 + eh.r - er, eh.r)); // mixed: the head sinks flush in the face
    }
    // A back cover also takes the middle hole of each unit, for the power board brackets' bolts.
    if (kind.startsWith('back')) {
      for (let k = 0; k < u; k++) for (const s of [-1, 1]) { const y = k * RACK10.U + RACK10.unitHoles[1] - 0.4; d.off(rr(s * p.hx - 3.3, y - 4, s * p.hx + 3.3, y + 4, 3.3)); }
      const gy = Math.min(h / 2, RACK10.U / 2), gl = kind.includes('glands');
      const y0 = gl ? gy + GLAND[p.glandSize] / 2 + 6 : 8;
      if (kind.includes('vents')) vents(at(p, 'back'), d, -p.ex + 12, y0, p.ex - 12, h - 8, 6, 3);
      // A mounting grid on the back wall, inside: M3 holes every 10 mm (self-tapping, or heat-set inserts).
      if (kind.includes('mount')) for (let y = y0 + 2; y <= h - 8; y += MOUNT_PITCH) for (let x = -Math.floor((p.ex - 14) / MOUNT_PITCH) * MOUNT_PITCH; x <= p.ex - 14; x += MOUNT_PITCH) d.disc(x, y, 1.4, 0);
      if (kind.includes('fan')) { const fs = p.faceFan, pitch = fs + 6, n = Math.max(1, Math.min(p.backFans || 2, 2, Math.floor((2 * p.ex - 10) / pitch))); if (h - y0 >= fs + 4) for (let k = 0; k < n; k++) fanHole(d, (k - (n - 1) / 2) * pitch, y0 + (h - y0) / 2, fs); }
      if (gl) for (const x of glandXs(p)) d.disc(x, gy, GLAND[p.glandSize] / 2, 0);
      if (mod) backModCut(p, d, h, mod);
    }
    // A screen bay: the viewing window through the face, a pocket for the module behind it, and screw holes to hold it.
    if (kind === 'screen' && SCREENS[p.screen].bezel) { // landscape 10.1": an opening for the screen's back and cable; the bezel screws on the front
      const S = SCREENS[p.screen];
      d.off(rr(-Math.min(S.w / 2 - 4, p.ex - 5), h / 2 - S.h / 2 + 4, Math.min(S.w / 2 - 4, p.ex - 5), h / 2 + S.h / 2 - 4, 3));
      for (const x of [-S.w / 4, 0, S.w / 4]) for (const sy of [-1, 1]) d.disc(x, h / 2 + sy * (S.h / 2 + 3.5), 1.7, 0);
    } else if (kind === 'screen') { const S = SCREENS[p.screen]; if (z < 2) d.off(rr(-S.vw / 2, h / 2 - S.vh / 2, S.vw / 2, h / 2 + S.vh / 2, 2)); else d.off(rr(-S.w / 2 - 0.3, h / 2 - S.h / 2 - 0.3, S.w / 2 + 0.3, h / 2 + S.h / 2 + 0.3, 1.5)); for (const sx of [-1, 1]) for (const sy of [-1, 1]) d.disc(sx * (S.w / 2 + 5), h / 2 + sy * (S.h / 2 - 8), 1.2, 0); }
    if (kind === 'control') controlHoles(p, d, h, z > 2);
    if (kind === 'fanctl') fanctlHoles(p, d, h, z, ft);
    if (kind === 'cart') { const g = cartGeom(p); d.off(rr(-g.Wi / 2, 2 + g.zIn[0], g.Wi / 2, 2 + g.zIn[1], 1)); for (const [x, zz] of g.fix) { d.disc(x, 2 + zz, 1.7, 0); if (z < 1.9) d.disc(x, 2 + zz, 3.1, 0); } } // the bay's opening; the cage's screws, heads flush
    if (bi && z < bi.depth) d.off(rr(...bi.pocket, bi.r)); // phase 1E: the sheet's pocket in the face (it prints face down)
    if (kind === 'blank' && p.blankStyle === 'vents' && !bi) vents(at(p, 'blank'), d, -p.ex + 10, 5, p.ex - 10, h - 5, 5, 2.6);
    if (kind === 'brace') for (const tri of braceHoles(p, h)) d.off(tri);
    if (kind === 'shelf' || kind === 'mount') d.off(rr(-30, h - 12, 30, h - 4, 4)); // a finger pull
    if (kind === 'patch') for (const x of ks) {
      d.off(rr(x - kw / 2, h / 2 - kh / 2, x + kw / 2, h / 2 + kh / 2)); // the jack's hole
      if (z > 2) d.off(rr(x - kw / 2 - 2.5, h / 2 - kh / 2 - 3, x + kw / 2 + 2.5, h / 2 + kh / 2 + 3, 1)); // thinned behind, so its latch reaches
    }
    if (kind === 'drawer') d.off(rr(-dw + 2, 3, dw - 2, dh - 1, 2)); // the opening
    if (kind === 'fan') for (const x of fanXs(p)) fanHole(d, x, h / 2, p.fanSize);
    if (kind === 'gland') for (const x of glandXs(p)) d.disc(x, h / 2, GLAND[p.glandSize] / 2, 0); // a gland plate (the rack panels generator)
    if (kind === 'cable') {
      const sw = Math.min(2 * p.ex - 30, 190), sh = Math.min(16, h - 18);
      d.off(rr(-sw / 2, h / 2 - sh / 2, sw / 2, h / 2 + sh / 2, sh / 2));
      for (let x = -sw / 2 + 15; x <= sw / 2 - 15 + 0.01; x += (sw - 30) / 4) for (const y of [h / 2 - sh / 2 - 5, h / 2 + sh / 2 + 5]) d.off(rr(x - 2.5, y - 1.2, x + 2.5, y + 1.2, 1.2));
    }
    if (kind === 'bay') { const B = p.bay; for (const x of B.cols) d.off(rr(x - B.g.half, B.st, x + B.g.half, Math.min(h - 1.5, B.st + B.rows * B.g.pitchY - DOVE.depth), 1.5)); }
    if (kind === 'device') for (const x of devXs(p)) d.off(rr(x - p.dev.w / 2, 3 + p.dev.lift, x + p.dev.w / 2, Math.min(h - 2, 3 + p.dev.lift + p.dev.h), 2)); // a window for each device's front
  }, 0.12, 0.1, { loft: SMOOTH.edges });
  if (kind === 'device') m.append(deviceFloor(p, h, ft));
  if (kind === 'mount') m.append(mountFloor(p, h, ft));
  if (kind === 'bay') {
    // A floor with a dovetail groove under each column, braced to the face at its ends when there's room.
    const B = p.bay, sw = p.ex - 1, L = Math.min(B.b.Lc + 2, p.D - 15), xs = [...B.cols, ...(B.power ? [B.powerX + 20] : [])];
    m.append(bayFloor(xs, sw, B.st, ft - 0.01, ft + L));
    const G = 12, gt = 3, tri = [[B.st - 0.01, ft - 0.01], [B.st + G, ft - 0.01], [B.st - 0.01, ft + G]];
    if (B.total / 2 + 1 < sw - gt - 1) for (const gx of [-sw + 0.5, sw - gt - 0.5]) m.append(turn(extrudePolygon(tri, [], gx, gx + gt), (a, b, c) => [c, a, b]));
  }
  if (kind === 'shelf') {
    // A 4 mm floor and side lips, braced to the panel by gussets: the shelf hangs off its ears, so the
    // floor's joint with the panel takes all the load. Each gusset is a 45° triangle standing on the floor
    // against the panel (it rises straight off the panel as it prints face down, so it needs no support).
    const sw = p.ex - 1, st = 4, lip = Math.min(15, h - 4), G = Math.min(12, h - st - 4), gt = 3;
    m.append(extrudePolygon([[-sw, 0], [sw, 0], [sw, st], [-sw, st]], [], ft - 0.01, ft + p.shelfDepth));
    for (const s of [-1, 1]) { const x0 = s > 0 ? sw - st : -sw, x1 = x0 + st; m.append(extrudePolygon([[x0, st - 0.01], [x1, st - 0.01], [x1, lip], [x0, lip]], [], ft - 0.01, ft + p.shelfDepth)); }
    // In (y, z), stood across x: (a, b, c) → (c, a, b), a rotation.
    const tri = [[st - 0.01, ft - 0.01], [st + G, ft - 0.01], [st - 0.01, ft + G]];
    for (const gx of [-sw + st, -sw / 2, sw / 2 - gt, sw - st - gt]) m.append(turn(extrudePolygon(tri, [], gx, gx + gt), (a, b, c) => [c, a, b]));
  }
  if (kind === 'drawer') {
    const w = 2, ring = [[-dw, 1], [dw, 1], [dw, dh], [-dw, dh]], hole = [[-dw + w, 1 + w], [-dw + w, dh - w], [dw - w, dh - w], [dw - w, 1 + w]];
    m.append(extrudePolygon(ring, [hole], ft - 0.01, ft + p.shelfDepth)); // the sleeve; open at the back
  }
  return m;
}
// The control unit: what's on it, left to right, from words like "button, led, encoder, oled".
const CTRL = {
  button: { w: 30, words: ['button', 'power', 'b', 'btn'] },
  led: { w: 13, words: ['led', 'light', 'l', 'status'] },
  encoder: { w: 28, words: ['encoder', 'knob', 'e', 'rotary', 'dial'] },
  oled: { w: 36, words: ['oled', 'screen', 'o', 'display'] },
  switch: { w: 16, words: ['switch', 'toggle', 's'] },
  usb: { w: 20, words: ['usb', 'usbc', 'usb-c', 'port'] },
  gap: { w: 12, words: ['gap', '-', 'space', 'spacer', '_'] },
};
export function ctrlItems(layout) {
  const out = [];
  for (const w of String(layout || '').toLowerCase().split(/[\s,;|]+/).filter(Boolean)) {
    const t = Object.keys(CTRL).find((k) => CTRL[k].words.includes(w));
    if (t) out.push(t);
    if (out.length >= 14) break;
  }
  return out;
}
// Where each item sits across the face (x from the middle), spread evenly between the rail holes.
export function ctrlXs(p) {
  const span = 2 * (p.hx - 14), items = p.ctrl, need = items.reduce((a, t) => a + CTRL[t].w, 0);
  const extra = items.length > 1 ? Math.max(0, (span - need) / (items.length - 1)) : 0, scale = need > span ? span / need : 1;
  let x = -Math.min(span, need + extra * (items.length - 1)) / 2;
  // The panel prints face down, so its x runs the other way to the front as you look at it: flip, so the first word is on the left.
  return items.map((t) => { const w = CTRL[t].w * scale, c = x + w / 2; x += w + extra; return { t, x: -c }; });
}
// The holes, drawn on the control unit's face (h: the face's height; deep: the cut is behind the face's front 2 mm).
// A fan controller board (the common 4-knob, 8-channel kind on a PCI bracket) mounted flat behind a panel:
// its knob shafts come through a row of holes and the knob caps, pushed back on from the front, hold it to
// the panel. Two ledges behind the face carry the board's short ends. With its bracket left on, the bracket
// sits in a shallow pocket in the panel's back instead. Everything comes from p.fc (the measured board).
const fanctlFit = (p, h) => {
  const f = p.fc, cy = h / 2, top = cy - f.above; // the board's top face, f.above below the shafts
  return { ...f, cy, top, bottom: top - 1.6, xs: Array.from({ length: f.knobs }, (_, i) => (i - (f.knobs - 1) / 2) * f.pitch) };
};
const fanctlCuts = (p, ft) => [ft + p.fc.depth, ...(p.fc.bracket ? [ft - BRACKET_T] : [])];
const BRACKET_T = 1.2, BRACKET_W = 19.4; // a PCI bracket's thickness (with play) and width
function fanctlHoles(p, d, h, z, ft) {
  const f = fanctlFit(p, h);
  for (const x of f.xs) d.disc(x, f.cy, f.hole / 2, 0);
  if (f.bracket && z > ft - BRACKET_T) d.off(rr(-f.len / 2 - 0.5, f.cy - BRACKET_W / 2, f.len / 2 + 0.5, f.cy + BRACKET_W / 2, 0.5));
}
function fanctlLedges(p, d, h) {
  const f = fanctlFit(p, h);
  // Under each short end: 4 mm of shelf, 5 mm thick, and a 2 mm upstand at the outside that keeps the board centred.
  for (const s of [-1, 1]) {
    d.on(rr(Math.min(s * (f.len / 2 - 4), s * (f.len / 2 + 0.6)), f.bottom - 5, Math.max(s * (f.len / 2 - 4), s * (f.len / 2 + 0.6)), f.bottom, 0.5));
    d.on(rr(Math.min(s * (f.len / 2 + 0.6), s * (f.len / 2 + 2.6)), f.bottom - 5, Math.max(s * (f.len / 2 + 0.6), s * (f.len / 2 + 2.6)), f.bottom + 1, 0.5));
  }
}
function controlHoles(p, d, h, deep) {
  const cy = h / 2;
  for (const { t, x } of ctrlXs(p)) {
    if (t === 'button') d.disc(x, cy, p.ctrlButton / 2 + 0.2, 0);
    if (t === 'led') d.disc(x, cy, 2.6, 0); // a 5 mm LED (or a 5 mm addressable one), pushed in from behind
    if (t === 'encoder') { d.disc(x, cy, 3.6, 0); if (deep) d.off(rr(x + 7.8 - 1, cy - 1.6, x + 7.8 + 1, cy + 1.6)); } // M7 bushing, and its anti-turn tab (blind, from behind)
    if (t === 'switch') d.disc(x, cy, 3.1, 0); // a 6 mm toggle switch
    if (t === 'usb') d.off(rr(x - 4.9, cy - 1.9, x + 4.9, cy + 1.9, 1.6)); // a USB-C panel socket
    if (t === 'oled') { // a 0.96" OLED: the window through, the module's pocket behind, and its four M2 holes
      if (!deep) d.off(rr(x - 12.5, cy - 7, x + 12.5, cy + 7, 1));
      else d.off(rr(x - 14, cy - 14, x + 14, cy + 14, 1));
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) d.disc(x + sx * 11.75, cy + sy * 11.9, 1.05, 0);
    }
  }
}
// A knob for an encoder's 6 mm D-shaft: knurled, with a line that shows where it points. Prints top down.
export function encoderKnob() {
  return sections([-10, -10, 10, 10], [0, 0.6, 2, 15], (z, d) => {
    const e = z < 0.6 ? 0.6 : 0;
    d.disc(0, 0, 9 - e);
    for (let k = 0; k < 24; k++) { const a = (k / 24) * 2 * Math.PI; d.disc(9 * Math.cos(a), 9 * Math.sin(a), 0.9, 0); } // grip ridges
    if (z < 0.6) d.off(rr(-0.8, 3, 0.8, 7.5)); // the pointer line
    if (z > 2) { d.disc(0, 0, 3.1, 0); d.on(rr(-3.2, 1.55, 3.2, 3.3)); } // the D-shaft: 6 mm, its flat 1.5 mm in
  }, 0.08, 0.05);
}

// Sealed racks: a solid back cover on each section's back rails (it braces the rack too), with
// holes for cable glands in the bottom one. The holes are the gland's thread plus clearance.
const GLAND = { 16: 16.5, 20: 20.5, 25: 25.5 };
// Half a front panel's width: the 10-inch ears, or (flush front) the frame's own width, so its sides run on from the uprights'.
// Cage nuts (rail nuts: cage): the 9.5 mm square hole of a square-hole rack, in a face thinned to 2 mm (cage nuts
// clip onto 1–2.5 mm), with a pocket behind for the clips: 13 mm along the rail, 11 mm across (clear of the flange).
// Modular back: small rear panels stacked up the back rails, like the back of a PC. Each word is one panel,
// top first; what's left at the bottom is closed with blanks (5U at most each, so they fit the bed).
//   io: an ATX I/O shield opening (159.5 × 45.2); psu / sfx: an ATX (150 × 86) or SFX (125 × 63.5) power supply's
//   opening and its four screw holes, 6 mm in from its corners; slots: three low-profile expansion slots laid flat;
//   fan[:n]: n fans (the back/top fan size); vents[:U], mount[:U] (M3 grid), blank[:U].
export const BACK_MODS = {
  io: { name: 'I/O shield', u: 2 }, psu: { name: 'ATX power supply', u: 3 }, sfx: { name: 'SFX power supply', u: 2 },
  slots: { name: 'expansion slots', u: 2 }, fan: { name: 'fans' }, vents: { name: 'vented' }, mount: { name: 'mounting grid' }, blank: { name: 'blank' },
};
export const PSU = { psu: { w: 150, h: 86 }, sfx: { w: 125, h: 63.5 } };
export function backMods(words) {
  return String(words || '').toLowerCase().split(/[,;\n]+/).map((w) => w.trim()).filter(Boolean).slice(0, 12).map((w) => {
    const [, t, a] = /^([a-z]+)\s*(?:[:×*]|\sx)?\s*(\d+)?$/.exec(w) || [], n = Math.round(Number(a));
    return BACK_MODS[t] ? { t, n: Number.isFinite(n) && n > 0 ? Math.min(n, t === 'fan' ? 4 : 5) : 0 } : null;
  }).filter(Boolean);
}
const RAIL_PILOT = 5; // railNuts none: an M6 thread-forming screw's pilot (or tap M6 into it)
export const backModU = (p, m) => BACK_MODS[m.t].u ?? (m.t === 'fan' ? Math.max(1, fanUnits(p.faceFan)) : m.n || 1);
const backFanN = (p, m) => Math.max(1, Math.min(m.n || 2, Math.floor((2 * p.ex - 10) / (p.faceFan + 6))));
// One rear module's openings, in the panel's face-down coordinates (x across, y up from the panel's bottom edge).
function backModCut(p, d, h, m) {
  const cy = h / 2;
  if (m.t === 'io') d.off(rr(-159.5 / 2, cy - 45.2 / 2, 159.5 / 2, cy + 45.2 / 2, 1));
  if (m.t === 'psu' || m.t === 'sfx') {
    const S = PSU[m.t];
    d.off(rr(-S.w / 2 + 12, cy - S.h / 2 + 12, S.w / 2 - 12, cy + S.h / 2 - 12, 4)); // its fan and plug, the screws keep a rim
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) d.disc(sx * (S.w / 2 - 6), cy + sy * (S.h / 2 - 6), 1.8, 0); // #6-32 screws
  }
  if (m.t === 'slots') for (let k = -1; k <= 1; k++) { const y = cy + k * 20.32; d.off(rr(-48, y - 6, 38, y + 6, 1.5)); d.disc(46, y, 1.6, 0); } // low-profile brackets lie flat; a screw holds each tab
  if (m.t === 'fan') { const fs = p.faceFan, pitch = fs + 6, n = backFanN(p, m); if (h >= fs + 4) for (let k = 0; k < n; k++) fanHole(d, (k - (n - 1) / 2) * pitch, cy, fs); }
  if (m.t === 'vents') vents(p.ventFaces?.back ? at(p, 'back') : { ...p, vents: p.vents && p.vents !== 'none' ? p.vents : 'hex' }, d, -p.ex + 12, 6, p.ex - 12, h - 6, 6, 3);
  if (m.t === 'mount') for (let y = 8; y <= h - 8; y += MOUNT_PITCH) for (let x = -Math.floor((p.ex - 14) / MOUNT_PITCH) * MOUNT_PITCH; x <= p.ex - 14; x += MOUNT_PITCH) d.disc(x, y, 1.4, 0);
}
// The modules in order top first, then blanks (≤ 5U each) for what's left; each { t, n, u }.
export function backPlan(p, total) {
  const out = []; let left = total;
  out.skipped = [];
  for (const m of p.backMods) { const u = backModU(p, m); if (u > left) { out.skipped.push({ ...m, u }); continue; } out.push({ ...m, u }); left -= u; }
  while (left > 0) { const u = Math.min(5, left); out.push({ t: 'blank', n: u, u }); left -= u; }
  return out;
}
// Magnet catches for rail panels: 6 × 2 mm N52 discs, two pairs per ear per U, in the gaps between a unit's rail holes
// (each 15.9 mm gap leaves 1.6 mm walls round a 6.15 mm pocket). The rail's pocket opens on its face, the
// panel's on its back, so the two magnets meet face to face behind the ear: nothing shows from outside.
export const MAGNET = { d: 6, h: 2, fit: 0.15, deep: 0.2 };
const magPocket = () => ({ r: (MAGNET.d + MAGNET.fit) / 2, depth: MAGNET.h + MAGNET.deep });
// Side panels that pull off: a 6 × 2 mm magnet in the flange meets one in the panel's inside face at each screw place.
const SIDE_MAG = () => magPocket();
const MAG_YS = [(RACK10.unitHoles[0] + RACK10.unitHoles[1]) / 2, (RACK10.unitHoles[1] + RACK10.unitHoles[2]) / 2]; // both gaps: the back uprights are the same part end for end
const LIGHT_KINDS = ['blank', 'fan', 'cable', 'patch'];
export const magnetKind = (p, kind) => p.magnets === 'all' || (p.magnets === 'light' && (LIGHT_KINDS.includes(kind) || kind.startsWith('back')));
export const CAGE = { hole: 9.5, face: 2, pocketL: 13, pocketW: 11 };
// Heat-set brass inserts (Fastening: inserts): a short M3 insert (3 mm long) in a 4.0 mm bore, 4 mm deep (or through
// a part that's thinner), pressed in with a soldering iron from the face the screw comes in from.
export const INSERT_M3 = { bore: 4.0, length: 3, depth: 4 };
// Short brass heat-set inserts by thread, for the side panels' screws when the rack's screws are picked (mixed hardware).
export const INSERTS = { M3: INSERT_M3, M4: { bore: 5.6, length: 4, depth: 5 } };
// Mixed hardware with inserts: the frame bolts (structure) keep their nuts; the panel screws (trim) go into inserts.
const bracketInserts = (p) => p.fastening === 'inserts' && !p.threads;
const trimInsert = (p) => (p.threads ? INSERTS[p.threads.trim] || INSERT_M3 : INSERT_M3);
const insertR = (p, nutR = 1.7) => (p.fastening === 'inserts' ? INSERT_M3.bore / 2 : nutR);
// Recessed (inset) front and back: a lip on each upright's outside edge, 4 mm deep, level with the panels' faces; the
// panels stop 0.3 mm short of it, their ears still clear of the rail screws' slots by 2.4 mm.
export const LIP = 4;
export const insetOn = (p) => p.style === 'frame' && p.frontFlush && p.frontFace === 'inset';
const insetHalf = (p) => p.hx + 3.3 + 2.4;
const lipW = (p) => frameXo(p) - insetHalf(p) - 0.3;
const panelHalf = (p) => (insetOn(p) ? insetHalf(p) : p.frontFlush && frameXo(p) <= 128 ? frameXo(p) : RACK10.ears / 2);
const backT = (p) => (insetOn(p) ? LIP : p.extreme ? 6 : p.heavy ? 5 : 4); // inset: the back covers match the lip
function glandXs(p) {
  const pitch = GLAND[p.glandSize] + 18, n = Math.min(p.glands, Math.floor((2 * p.ex - 20) / pitch));
  return Array.from({ length: n }, (_, k) => (k - (n - 1) / 2) * pitch);
}
// A dust filter for a fan, as it prints (grille down): a grille plate with a 3 mm deep pocket behind it
// for a cut piece of filter foam or mesh. It goes on the outside of the panel, the fan inside, and the
// fan's own screws go through all three.
export function fanFilter(size) {
  const S = size + 4, h = S / 2, R = size / 2 - 2, sp = FANS[size] / 2, sr = size <= 40 ? 1.7 : 2.25, rim = 2.5;
  return sections([-h, -h, h, h], [0, 0.4, 2, 5], (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    d.on(rr(-h + f, -h + f, h - f, h - f, 4));
    if (z < 2) {
      d.disc(0, 0, R, 0);
      for (let v = -R + 3; v < R; v += 6) { d.on(rr(v - 0.7, -R, v + 0.7, R)); d.on(rr(-R, v - 0.7, R, v + 0.7)); } // the grille
    } else {
      d.off(rr(-h + rim, -h + rim, h - rim, h - rim, 2)); // the pocket for the pad
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) d.disc(sx * sp, sy * sp, sr + 2.6); // bosses round the screws
    }
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) d.disc(sx * sp, sy * sp, sr, 0);
  }, 0.12, 0.1);
}

// A back brace: a frame with an X across it, bolted to the back rails. It
// stops the rack leaning sideways (the side panels stop it leaning back and
// forth). The holes are the four triangles the X leaves.
function braceHoles(p, h) {
  const x1 = p.ex - 9, x0 = -x1, y0 = 8, y1 = h - 8, yc = h / 2, b = 5; // 10 mm wide diagonals
  const th = Math.atan2(y1 - y0, x1 - x0), a = b / Math.sin(th), e = b / Math.cos(th);
  return [
    [[x0 + a, y1], [0, yc + e], [x1 - a, y1]],
    [[x0 + a, y0], [x1 - a, y0], [0, yc - e]],
    [[x0, y0 + e], [x0, y1 - e], [-a, yc]],
    [[x1, y0 + e], [a, yc], [x1, y1 - e]],
  ].map((t) => t.map(([x, y]) => [x, y]));
}

// A fan's opening, drawn into a panel: the hole, a guard of rings and three spokes, and its four screw holes.
function fanHole(d, x, y, size) {
  const R = size / 2 - 2, sp = FANS[size] / 2, sr = size <= 40 ? 1.7 : 2.25;
  d.disc(x, y, R, 0);
  for (let r = R - 5; r > 7; r -= 7) { d.disc(x, y, r + 0.9); d.disc(x, y, r - 0.9, 0); } // the guard: rings…
  for (const a of [0, 60, 120]) { const c = Math.cos((a * Math.PI) / 180), s = Math.sin((a * Math.PI) / 180), w = 0.9; d.on([[x - R * c - w * s, y - R * s + w * c], [x + R * c - w * s, y + R * s + w * c], [x + R * c + w * s, y + R * s - w * c], [x - R * c + w * s, y - R * s - w * c]]); } // …and spokes
  d.disc(x, y, 7);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) d.disc(x + sx * sp, y + sy * sp, sr, 0);
}
// Fan panels: how many fans fit across, and where.
function fanXs(p) {
  const pitch = p.fanSize + 6, n = Math.max(1, Math.min(p.fanCount, Math.floor((2 * p.ex - 10) / pitch)));
  return Array.from({ length: n }, (_, k) => (k - (n - 1) / 2) * pitch);
}
// Device panels: how many fit across, and where.
// The extra device panels as whole param sets, so every device helper works on them unchanged.
const moreDevs = (p) => (p.dev ? p.moreDevs || [] : []).map((m) => ({ ...p, ...m }));
export const devUnits = (p) => Math.max(1, Math.ceil((3 + p.dev.lift + p.dev.h + 3) / RACK10.U));
function devXs(p) {
  const pitch = p.dev.w + (p.dev.sled ? 8 : 5), n = Math.max(1, Math.min(p.devices, Math.floor((2 * p.ex - 6) / pitch)));
  return Array.from({ length: n }, (_, k) => (k - (n - 1) / 2) * pitch);
}
// A device panel's floor, standing off the back of the face (as it prints):
// drawn flat in (x across, depth) and turned up, so its screw holes (for a Pi's
// sled) are teardrops pointing up. Walls between the devices stand along it.
function deviceFloor(p, h, ft) {
  const sw = p.ex - 1, L = Math.min(p.dev.d + 8, p.D - 15), st = 3, wall = Math.min(14, h - 4), xs = devXs(p);
  const floor = sections([-sw, 0, sw, L], [0, st], (c, d) => {
    d.on(rr(-sw, 0, sw, L));
    if (p.dev.sled) for (const x of xs) for (const [ex, y] of sledEars(p.dev)) {
      const hx = x + ex, r = 1.4;
      d.disc(hx, y, r, 0); d.off([[hx - r * Math.SQRT1_2, y + r * Math.SQRT1_2], [hx + r * Math.SQRT1_2, y + r * Math.SQRT1_2], [hx, y + r * Math.SQRT2]]);
    }
    if (p.dev.hat) for (const x of xs) d.off(rr(x - 20, Math.min(L - 16, 92), x + 20, Math.min(L - 4, 104), 4)); // the HAT's SATA and 12 V leads, down and out the back
  }, 0.12, 0.1);
  const m = new Mesh();
  const f = new Mesh(); f.append(floor); const q = f.positions;
  for (let k = 0; k < q.length; k += 3) { const a = q[k], b = q[k + 1], c = q[k + 2]; q[k] = a; q[k + 1] = st - c; q[k + 2] = b + ft - 0.01; } // (a, b, c) → (a, st − c, b): a rotation
  m.append(f);
  // Walls either side of each device: they keep it straight as it slides in.
  for (const x of xs) for (const s of [-1, 1]) {
    const x0 = x + s * (p.dev.w / 2 + (p.dev.sled ? 4 : 1)) - (s < 0 ? 2 : 0);
    m.append(extrudePolygon([[x0, st - 0.01], [x0 + 2, st - 0.01], [x0 + 2, wall], [x0, wall]], [], ft - 0.01, ft + L));
  }
  return m;
}
// A mounting plate's floor: a grid of M3 holes 10 mm apart (teardrops, as it
// prints) to screw anything to: our Arduino and Pi housings, a power supply
// board, a USB hub. Lips along both sides and gussets at the ends stiffen it.
export const MOUNT_PITCH = 10;
function mountFloor(p, h, ft) {
  const sw = p.ex - 1, L = p.shelfDepth, st = 4, r = 1.4, lip = Math.min(15, h - 4), m = new Mesh();
  const nx = Math.floor((sw - 10) / MOUNT_PITCH);
  const floor = sections([-sw, 0, sw, L], [0, st], (c, d) => {
    d.on(rr(-sw, 0, sw, L));
    for (let i = -nx; i <= nx; i++) for (let y = 10; y <= L - 6; y += MOUNT_PITCH) tear(d, i * MOUNT_PITCH, y, r);
  }, 0.12, 0.1);
  m.append(turn(floor, (a, b, c) => [a, st - c, b + ft - 0.01])); // (a, b, c) → (a, st − c, b): a rotation
  for (const s of [-1, 1]) { const x0 = s > 0 ? sw - st : -sw; m.append(extrudePolygon([[x0, st - 0.01], [x0 + st, st - 0.01], [x0 + st, lip], [x0, lip]], [], ft - 0.01, ft + L)); }
  const G = Math.min(12, h - st - 4), gt = 3, tri = [[st - 0.01, ft - 0.01], [st + G, ft - 0.01], [st - 0.01, ft + G]];
  for (const gx of [-sw + st, sw - st - gt]) m.append(turn(extrudePolygon(tri, [], gx, gx + gt), (a, b, c) => [c, a, b]));
  return m;
}

// Power board (power strip) brackets: a pair holds a power board upright up
// the back of the rack, like a 0U PDU. Each bolts through a back rail hole
// (M6) and cradles the board between two walls with snap lips; the bottom one
// has a floor it stands on. As it prints, standing: drawn in plan (x inward
// from the bolt, y back from the rail), z up.
const PDU_Z = 24, PDU_BOLT = 13.5;
function pduBracket(p, bottom) {
  const W = p.pduW, H = p.pduH, a = 10, b = a + 3 + W + 1, top = 4 + H + 2.5;
  const cuts = [0, 3, PDU_Z, PDU_BOLT - 3.3, PDU_BOLT + 1.5, PDU_BOLT + 3.3];
  return sections([-10, -1, b + 4, top + 1], cuts, (z, d) => {
    d.on(rr(-9, 0, b + 3, 4, 1.5)); // the plate on the rail
    d.on(rr(a, 3.9, a + 3, top, 1)); d.on(rr(b, 3.9, b + 3, top, 1)); // the walls
    d.on(rr(a + 3 - 0.01, top - 2, a + 5, top, 0.6)); d.on(rr(b - 2, top - 2, b + 0.01, top, 0.6)); // snap lips
    if (bottom && z < 3) d.on(rr(a, 3.9, b + 3, top - 2.2)); // the floor it stands on
    if (z >= PDU_BOLT - 3.3 && z < PDU_BOLT + 3.3) { const w = z < PDU_BOLT + 1.5 ? 3.3 : 1.6; d.off(rr(-w, -1, w, 5)); } // the M6 bolt, its top stepped in so it prints
  }, 0.1, 0.05);
}

// Boards that ride on a printed sled: the mounting holes (sled coordinates: x
// across, y back from the front edge, the board's ports at the front), the
// screw they take (hole radius for tapping into the plastic), and the sled's size.
// Arduino holes are the published board drawings' (Uno: 13.97 × 2.54,
// 15.24 × 50.8, 66.04 × 7.62 and 35.56; the Mega adds 90.17 × 50.8 and 96.52 × 2.54).
const ard = (pts) => pts.map(([bx, by]) => [26.67 - by, 4 + bx]);
export const SLED_BOARDS = {
  pi: { name: 'Raspberry Pi', holes: [[-24.5, 8], [24.5, 8], [-24.5, 66], [24.5, 66]], r: 1.1, L: 90, W: 65 },
  uno: { name: 'Arduino Uno', holes: ard([[13.97, 2.54], [15.24, 50.8], [66.04, 7.62], [66.04, 35.56]]), r: 1.3, L: 76, W: 62 },
  mega: { name: 'Arduino Mega', holes: ard([[13.97, 2.54], [15.24, 50.8], [66.04, 7.62], [66.04, 35.56], [90.17, 50.8], [96.52, 2.54]]), r: 1.3, L: 110, W: 62 },
};
// A sled, flat on the bed: a plate with standoffs on the board's holes and
// screw holes where it fixes to the panel's floor (M3, into the floor's).
function boardSled(kind, dev) {
  const B = SLED_BOARDS[kind] || SLED_BOARDS.pi, W = B.W, L = B.L, t = 2.5;
  const ears = sledEars(dev).map(([x, y]) => [x, y]);
  const m = sections([-W / 2 - 1, 0, W / 2 + 1, L], [0, 0.4, t], (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    d.on(rr(-W / 2 + f, f, W / 2 - f, L - f, 3));
    for (const [x, y] of B.holes) d.disc(x, y, B.r, 0);
    for (const [x, y] of ears) d.disc(x, y, 1.7, 0);
    d.off(rr(-12, 24, 12, L - 26, 4)); // light, and room for air
  }, 0.12, 0.1);
  for (const [x, y] of B.holes) {
    const ring = (r) => Array.from({ length: 24 }, (_, k) => [x + r * Math.cos((k * Math.PI) / 12), y + r * Math.sin((k * Math.PI) / 12)]);
    m.append(extrudePolygon(ring(3), [ring(B.r).reverse()], t - 0.01, t + 5));
  }
  return m;
}
// Where a sled screws to its floor: just inside its edges, clear of the standoffs.
const sledEars = (dev) => {
  const B = SLED_BOARDS[dev.sled] || SLED_BOARDS.pi, x = B.W / 2 - 3.5;
  return [-1, 1].flatMap((s) => [[s * x, B.L * 0.4], [s * x, B.L * 0.4 + 30]]);
};

// Where the keystone holes go across a patch panel: centred, as many as asked that fit.
function keystones(p) {
  const pitch = p.keyW + 4, n = Math.min(p.ports, Math.floor((2 * p.ex - 16) / pitch));
  return Array.from({ length: n }, (_, k) => (k - (n - 1) / 2) * pitch);
}
// The drawer for a drawer unit, as it prints: upright, its face at y = 0.
function drawer(p, u) {
  const h = u * RACK10.U - 0.8, dw = p.ex - 1.5, w = 2;
  const W = 2 * (dw - w) - 1, H = h - 2 - 1 - 2 * w - 1.5, L = p.shelfDepth - 4, t = 1.6, fl = 1.6;
  const m = sections([-W / 2 - 4, -4, W / 2 + 4, L], [0, 0.4, fl, H], (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    d.on(rr(-W / 2 + f, f, W / 2 - f, L - f, 3));
    if (z > fl) d.off(rr(-W / 2 + t, t, W / 2 - t, L - t, 2));
    d.on(rr(-W / 2 - 3 + f, -4, W / 2 + 3 - f, 0.2)); // the face, a little wider than the opening
    if (z > H - 14) d.off(rr(-25, -5, 25, 1, 0)); // a finger pull
  }, 0.12, 0.1);
  return m;
}
// A carry handle for the top plate, as it prints (on its side): x across, y up, z through. A low swept
// arch: its outline is a squircle, so the grip flows into the feet with no corners, and every edge is
// rounded off through the thickness (the outline shrinks towards both faces). The bolts are where they
// always were (span/2 + 4 from the middle), so it fits the same frames.
// Styles: arch (the swept default), low (low profile, room for four fingers), slim (thinner, lighter),
// tab (barely there: a fingertip pull), classic (tall and square-shouldered).
const HANDLES = {
  arch: { hgt: 40, bar: 11, T: 14, n: 3.2, ni: 4 },
  low: { hgt: 27, bar: 9, T: 14, n: 4, ni: 5 },
  slim: { hgt: 36, bar: 9, T: 10, n: 3.2, ni: 4 },
  tab: { hgt: 18, bar: 7, T: 12, n: 5, ni: 6 },
  classic: { hgt: 46, bar: 12, T: 14, n: 9, ni: 9 },
};
// Smooth rounds (sloped walls between the round's steps, slabs.js opts.loft): handles since 0.233.3, every other rack round since 0.234.0.
export const SMOOTH = { handles: true, edges: true }; // edges: the 2.4 mm rounds on uprights, frames, panels and bezels
export const rackHandle = (p, len) => handle(p, len);
function handle(p, len = 2 * (p.ex - 30)) {
  const H = HANDLES[p.handleStyle] || HANDLES.arch;
  const span = len, hgt = H.hgt, bar = H.bar, foot = 22, T = H.T, R = 3.4 / 2, W = span / 2 + foot;
  const arch = (hw, h, n, e) => { // the top half of a squircle, half-width hw and height h, shrunk by e
    const pts = [], N = 72, a = hw - e, b = h - e;
    for (let k = 0; k <= N; k++) { const t = Math.PI * (k / N), c = Math.cos(t), si = Math.sin(t); pts.push([a * Math.sign(c) * Math.abs(c) ** (2 / n), b * Math.abs(si) ** (2 / n)]); }
    return pts;
  };
  const round = (z) => { const d = Math.min(z, T - z); return d >= 2 ? 0 : 2 - Math.sqrt(Math.max(0, 4 - (2 - d) ** 2)); }; // a 2 mm round on each face edge
  // The 2 mm round in 10 steps of equal angle each side (4 flat steps showed as bands on the curve).
  const rd = Array.from({ length: 10 }, (_, k) => +(2 - 2 * Math.cos((Math.PI / 2) * (k / 10))).toFixed(3));
  const cuts = [...new Set([...rd, 2, T / 2 - R, T / 2 + R, ...rd.map((v) => +(T - v).toFixed(3)), T - 2])].sort((a, b) => a - b);
  const m = sections([-W, 0, W, hgt], cuts, (z, d) => {
    const e = round(z);
    d.on([...arch(W, hgt, H.n, e), [-W + e, 0], [W - e, 0]].map(([x, y]) => [x, Math.max(0, y)])); // the arch, its feet flat on the frame
    d.off(arch(span / 2 - bar, hgt - bar, H.ni, -e).map(([x, y]) => [x, y - 0.01])); // the hand hole, its edges rounded too
    if (z >= T / 2 - R - 1e-6 && z < T / 2 + R) for (const s of [-1, 1]) { const x = s * (span / 2 + 4); d.off(rr(x - R, -1, x + R, 12)); } // an M3 bolt up into each foot: a hole in the middle of the foot, not a slot through it
  }, 0.15, 0.12, { loft: SMOOTH.handles });
    return { mesh: m, span, foot, bar, T };
}

// ---------------------------------------------------------------------------
// The framed rack (the default): built like a real rack from separate pieces,
// in the VERTEX look. Four identical rail uprights (an L: the rail face with
// the EIA holes, and a side flange), stacked sections joined by splice plates
// so the units run on unbroken, a mint end frame top and bottom, removable
// side panels with a badge, and carry handles. Every piece fits a 256 mm bed.
const FR = { rt: 5, fl: 24, ff: 4, ft: 8, pt: 3, hy: 14, bk: 20, sp: 3, G: 7 }; // rail face, flange depth and thickness, frame, panel; the flange holes' line; bracket height; splice; gusset
// Heavy: everything that bends gets thicker. The flange stays 4 mm, so an M6 nut behind each rail hole still clears it.
const FR_HEAVY = { rt: 7, fl: 30, ff: 4, ft: 11, pt: 4, hy: 17, bk: 26, sp: 5, G: 7 }; // gussets stay 7 mm: any bigger reaches into the gear's width
// Extreme: thicker again everywhere it bends (the flange still 4 mm for the M6 nuts).
const FR_EXTREME = { rt: 9, fl: 34, ff: 4, ft: 14, pt: 5, hy: 19, bk: 30, sp: 6, G: 7 };
// The frame tables by strength, for the spec state (rack-spec.js) to derive from. Read only.
// Phase 1H, mixed hardware (spec rules 5 and 7): the frame bolts (structure) are M6, or M8 at extreme
// strength; the panels' screws (trim) M4 or M3; every head sinks flush. Classic keeps the original M3 frame.
export function hardwareOptions(o = {}, style = 'frame', strength = 'heavy') {
  const mixed = style === 'frame' && o.hardware === 'mixed';
  const structure = HW_GROUPS.structure.allowed.includes(o.structureThread) ? o.structureThread : HW_GROUPS.structure.byStrength[strength];
  const trim = HW_GROUPS.trim.allowed.includes(o.trimThread) ? o.trimThread : 'M4';
  return { hardware: mixed ? 'mixed' : 'classic', threads: mixed ? { structure, trim } : null };
}
/**
 * The frame table grown for mixed hardware: the flange thick enough to sink a structure head (ff), its
 * bolt line far enough back that the bolt keeps 1.5 d of bracket round it (hy, from the bracket's front at
 * 11 mm), the flange deep enough to hold the head's counterbore (fl), the bracket tall enough (bk) and
 * the end frame's side band wide enough (band); the panels thick enough to sink a trim head (pt).
 */
export function mixedFrame(base, { threads }) {
  const s = threads.structure, edge = HW_FIT.edge * DIAMETER[s], headR = (HEADS[s].button[0] + HW_FIT.headGrow) / 2;
  const hy = Math.max(base.hy, Math.ceil(11 + edge)), fl = Math.max(base.fl, Math.ceil(hy + headR + HW_FIT.rimWall));
  return {
    // The bracket's bolt is at half its height: tall enough for 1.5 d above it, and for its nut to clear the gusset below.
    ...base, hy, fl, ff: derivedThickness(base.ff, s), bk: Math.max(base.bk, Math.ceil(2 * edge), Math.ceil(2 * (base.G + 0.5 + NUTS[s][0] / Math.sqrt(3)))),
    band: Math.max(24, Math.ceil(hy + edge)), pt: derivedThickness(base.pt, threads.trim),
  };
}
// Phase 1H: the build sheet's hardware for a mixed-hardware rack, from the fastener points the geometry made.
// points: [{ group, through (the stack the screw passes), count, onRail }]. Lengths: the stack plus 1.5 d into the nut.
export function rackHardware(p, points) {
  if (!p.threads) return null;
  const screws = new Map(), nuts = new Map(), problems = [];
  let washers = 0;
  for (const pt of points) {
    if (!pt.count) continue;
    const t = p.threads[pt.group], h = HEADS[t], need = h.button[1] + HW_FIT.below + h.floor;
    if (p.flush && pt.seat && pt.seat + 1e-9 < need) problems.push(`${HW_GROUPS[pt.group].name} (${pt.what}): ${pt.seat} mm is too thin to sink an ${t} head flush (needs ${Math.round(need * 100) / 100} mm). Pick a stronger setting or ${HW_GROUPS[pt.group].allowed.find((x) => x !== t)}.`);
    const k = `${t} × ${screwLength(t, pt.through)} button head`;
    screws.set(k, (screws.get(k) || 0) + pt.count);
    const nut = p.fastening === 'inserts' && pt.group === 'trim' ? `${t} heat-set insert (short)` : `${t} nut`; // inserts take the panel screws
    nuts.set(nut, (nuts.get(nut) || 0) + pt.count);
    if (pt.onRail) washers += pt.count;
  }
  const list = (m) => [...m].sort(([a], [b]) => DIAMETER[a.slice(0, 2)] - DIAMETER[b.slice(0, 2)] || a.localeCompare(b, 'en', { numeric: true })).map(([what, count]) => ({ what, count }));
  const strength = p.extreme ? 'extreme' : p.heavy ? 'heavy' : 'standard';
  return {
    groups: [{ group: 'Structure', thread: p.threads.structure, why: HW_GROUPS.structure.why(p.threads.structure, strength) }, { group: 'Rail grid', thread: 'M6', why: HW_GROUPS.rail.why('M6') }, { group: 'Trim', thread: p.threads.trim, why: HW_GROUPS.trim.why(p.threads.trim) }, { group: 'Internal', thread: 'M3', why: HW_GROUPS.internal.why('M3') }],
    screws: list(screws), nuts: list(nuts), washers, problems,
  };
}
const hwHole = (p, group, classic) => (p.threads ? HEADS[p.threads[group]].clearance / 2 : classic); // a clearance hole's radius
const hwHead = (p, group) => (p.threads ? { r: (HEADS[p.threads[group]].button[0] + HW_FIT.headGrow) / 2, depth: HEADS[p.threads[group]].button[1] + HW_FIT.below } : null); // its flush counterbore

export const RACK_FRAME = Object.freeze({ standard: Object.freeze({ ...FR }), heavy: Object.freeze({ ...FR_HEAVY }), extreme: Object.freeze({ ...FR_EXTREME }) });
const handleSpan = (p) => Math.min(p.D - 52, 256 - 44 - 2); // the handle's hand hole: the whole handle (span + two 22 mm feet) stops 4 mm inside the frame's ends, and fits the bed
const frameXo = (p) => Math.max(p.hx + 9.65, (p.W || 0) / 2); // the uprights' outside face: 127.9 mm out (an end frame 255.8 mm wide), or half the cabinet width picked
const flangeXs = (L) => [...new Set([10, L - 10, ...(L >= 80 ? [30, L - 30] : []), ...(L >= 140 || L < 80 ? [L / 2] : [])])].sort((a, b) => a - b);
const tearDown = (d, x, y, r) => { d.disc(x, y, r, 0); d.off([[x - r * Math.SQRT1_2, y - r * Math.SQRT1_2], [x, y - r * Math.SQRT2], [x + r * Math.SQRT1_2, y - r * Math.SQRT1_2]]); }; // its point toward −y (up, for an upright printed on its flange)
const tear = (d, x, y, r) => { d.disc(x, y, r, 0); d.off([[x - r * Math.SQRT1_2, y + r * Math.SQRT1_2], [x + r * Math.SQRT1_2, y + r * Math.SQRT1_2], [x, y + r * Math.SQRT2]]); };
// A mirrored copy's faces point inward: flip them back by reversing each triangle.
const flip = (m) => { const ix = m.indices; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } return m; };
const turn = (mesh, f) => { const m = new Mesh(); m.append(mesh); const q = m.positions; for (let i = 0; i < q.length; i += 3) { const [a, b, c] = f(q[i], q[i + 1], q[i + 2]); q[i] = a; q[i + 1] = b; q[i + 2] = c; } return m; };

// An upright as it prints, rail face down: x along it (0..L), y across the
// face from the rail's inner edge, z off the bed (the flange stands up). The
// flange is far enough out that an M6 nut behind each rail hole clears it.
// ends: [joint at x = 0, joint at x = L]: a joint end has a pocket in the flange's outside face for the splice plate's inlay.
function upright(p, u, ends = [false, false]) {
  const L = u * RACK10.U, w = frameXo(p) - p.ex, { rt, fl, ff, hy } = p.fr, m = new Mesh();
  const [b0, b1] = inlayBand(p), pd = INLAY_D, sj = jointS(L) + 0.25, cornerR = p.frontFlush ? 0 : CORNER_R;
  const cage = p.railNuts === 'cage';
  const mag = p.magnets !== 'none' && magPocket();
  // Inset front: the lip stands LIP in front of the rail face at the outside edge (built above z = 0 here, then moved forward).
  const lip = insetOn(p) ? LIP : 0, lw = lip ? lipW(p) : 0;
  const lipCuts = lip ? [0, 0.4, ...CH.filter((c) => c < lip), lip] : [];
  m.append(sections([0, 0, L, w], [...new Set([...lipCuts, ...[0, 0.4, ...CORNER_CH, ...(cage ? [CAGE.face] : []), ...(mag ? [mag.depth] : []), rt].map((c) => c + lip)])].sort((a, b) => a - b), (zl, d) => {
    if (zl < lip) { const e = zl < 0.4 ? 0.4 : 0; d.on(rr(0, w - lw + e, L, w - Math.max(e, chR(zl, EDGE_R)), 0.5)); return; } // the lip: its front's inner edge eased (a V reveal by the panel), the outside corner on the 2.4 mm round
    const z = zl - lip, f = z < 0.4 ? 0.4 : 0;
    d.on(rr(0, f, L, w - Math.max(f, chR(z, cornerR)), 1)); // the outside corner rounded (square behind a flush front: the panels' edge is the corner)
    for (let k = 0; k < u; k++) for (const h of RACK10.unitHoles) {
      const x = k * RACK10.U + h, y = p.hx - p.ex;
      if (!cage) (lip ? tearDown : (dd, a, b, r) => dd.disc(a, b, r, 0))(d, x, y, p.railNuts === 'none' ? Math.min(p.hole, RAIL_PILOT) / 2 : p.hole / 2);
      else if (z < CAGE.face) d.off(rr(x - CAGE.hole / 2, y - CAGE.hole / 2, x + CAGE.hole / 2, y + CAGE.hole / 2, 0.5)); // the square hole
      else d.off(rr(x - CAGE.pocketL / 2, y - CAGE.pocketW / 2, x + CAGE.pocketL / 2, y + CAGE.pocketW / 2, 1)); // room behind for the cage's clips
      if (mag && h === RACK10.unitHoles[0] && z < mag.depth) for (const my of MAG_YS) (lip ? tearDown : (dd, a, b, r) => dd.disc(a, b, r, 0))(d, k * RACK10.U + my, y, mag.r); // the rail's magnets, its face level with the rail face
    }
  }, 0.1, 0.06, { loft: SMOOTH.edges }).translate(0, 0, -lip));
  // The flange, drawn in (x, z) and stood up at the face's outer edge; its holes are teardrops.
  const sh = hwHead(p, 'structure'), isEnd = (x) => x <= p.fr.bk + 2 || x >= L - p.fr.bk - 2; // mixed: the bracket bolts' heads sink flush in the flange's outside face
  const fl2 = sections([0, 0, L, fl], [...new Set([0, ...CH, ...CORNER_CH.filter((c) => c < ff), ...(ends[0] || ends[1] ? [pd] : []), ...(sh ? [sh.depth] : []), ...(p.panelFix === 'magnets' ? [SIDE_MAG().depth] : []), ff])].sort((a, b) => a - b), (c, d) => {
    d.on(rr(0, 0, L, fl, 1));
    // Chamfers on the outside face: the corner with the rail face (b = 0) and the back edge beside the side panel (b = fl).
    if (chR(c, cornerR)) d.off(rr(-1, -1, L + 1, chR(c, cornerR))); if (ch(c)) d.off(rr(-1, fl - ch(c), L + 1, fl + 1));
    // The splice inlay's pocket at a joint end (c = 0 is the outside face).
    if (c < pd) { const bl = wrapOn(p) ? -1 : b0 - 0.2; if (ends[0]) d.off(rr(-1, bl, sj, b1 + 0.2)); if (ends[1]) d.off(rr(L - sj, bl, L + 1, b1 + 0.2)); } // wrapped: open to the corner
    // Latches: where the side panel's latches sit, a slot the cam passes through upright (its top a 45° roof, so it
    // prints standing); the bracket bolts at the ends stay round.
    for (const x of flangeXs(L).map((v) => (v === 10 ? p.fr.bk / 2 : v === L - 10 ? L - p.fr.bk / 2 : v))) { // the end holes level with the brackets' bolts (bk / 2)
      if (p.panelFix === 'latches' && x > p.fr.bk + 2 && x < L - p.fr.bk - 2) d.off([[x - 12.8, hy - 4.8], [x + 12.8, hy - 4.8], [x + 12.8, hy + 4.8], [x + 8, hy + 9.6], [x - 8, hy + 9.6], [x - 12.8, hy + 4.8]]);
      else if (p.panelFix === 'magnets' && !isEnd(x)) { if (c < SIDE_MAG().depth) d.disc(x, hy, SIDE_MAG().r, 0); } // a magnet in the flange's outside face, under the side panel's
      else if (sh && isEnd(x)) tear(d, x, hy, c < sh.depth ? sh.r : hwHole(p, 'structure', 1.7));
      else tear(d, x, hy, hwHole(p, 'trim', 1.7));
    }
  }, 0.1, 0.06, { loft: SMOOTH.edges });
  m.append(turn(fl2, (a, b, c) => [a, w - c, b])); // (a, b, c) → (a, w − c, b): a rotation
  return m;
}

// An end frame, flat: a ring with a bracket standing in each corner that
// bolts through the upright's flange (its end hole). The top frame is the
// same part turned over; its outside carries MINT MOTIVE across the front.
// Deeper than a bed (over 250 mm), it prints in two halves, front and back, bolted together under the
// side bands by splice plates (part: 'front' | 'back'; null for the whole frame).
const endCut = (p) => p.D / 2;
// The rack's edge: every outside edge is rounded over, a 2.4 mm fillet drawn as twelve 0.2 mm steps (the
// Tectonic edge technique, about a layer each), so no corner is a sharp square edge. ch(z): how far in the
// face is at depth z from the edge (each step takes the curve at its middle).
const EDGE_STEP = 0.2;
// Epic 1 phase 1C: the edge's style and size are settings (edgeRound, edgeChamfer, edgeStep). These are set for
// each build by setEdges(p); the default (a 2.4 mm round) is the rack's original edge, step for step.
//   round    a fillet, the curve taken at the middle of each 0.2 mm step
//   chamfer  a 45° chamfer
//   stepped  a "machined" chamfer: 45°, a short land, 45° again (about 1.25 × the size deep)
//   square   no edge at all (only the first layer's 0.4 mm ease)
// End frames take the full size (up to 40 % of their thickness); the uprights' outside corner scales with it
// (as much as the 4 mm flange allows); panels, faceplates and bezels follow the same style, up to 2.4 mm.
let EDGE_KIND = 'round', EDGE_R = 2.4, FRAME_R = 2.4, CORNER_R = 3.5;
const depthOf = (R) => (EDGE_KIND === 'stepped' ? 1.25 * R : R);
const stepsTo = (R) => Array.from({ length: Math.round(depthOf(R) / EDGE_STEP) }, (_, k) => Math.round((k + 1) * EDGE_STEP * 10) / 10);
let CH = stepsTo(EDGE_R), FRAME_CH = stepsTo(FRAME_R), CORNER_CH = stepsTo(CORNER_R);
const chR = (z, R) => {
  if (!(R > 0) || z >= depthOf(R) - 1e-9) return 0;
  const m = (Math.floor((z + 1e-9) / EDGE_STEP) + 0.5) * EDGE_STEP;
  if (EDGE_KIND === 'chamfer') return Math.round(Math.max(0, R - m) * 1000) / 1000;
  if (EDGE_KIND === 'stepped') return Math.round((m < R / 4 ? R - m : m < R / 2 ? 0.75 * R : Math.max(0, 0.75 * R - (m - R / 2))) * 1000) / 1000;
  return Math.round((R - Math.sqrt(R ** 2 - (R - m) ** 2)) * 1000) / 1000;
};
const ch = (z) => chR(z, EDGE_R);
const chF = (z) => chR(z, FRAME_R);
/** The edge settings, cleaned: { kind, size, note } (round wins over a chamfer, as the spec says). */
export function edgeSpec(o = {}) {
  const r = Math.min(6, Math.max(0, Number(o.edgeRound ?? 2.4) || 0)), c = Math.min(6, Math.max(0, Number(o.edgeChamfer) || 0));
  const step = o.edgeStep === true || o.edgeStep === 'true';
  if (r > 0) return { kind: 'round', size: r, note: c > 0 ? 'Both a round and a chamfer are set: the round wins. Set the round to 0 for the chamfer.' : '' };
  if (c > 0) return { kind: step ? 'stepped' : 'chamfer', size: c, note: '' };
  return { kind: 'square', size: 0, note: '' };
}
let edgeKey = '';
function setEdges(p) {
  const e = p.edge, key = `${e.kind}|${e.size}|${p.fr.ft}`;
  if (key === edgeKey) return;
  edgeKey = key;
  cache.clear(); memoHeld = 0; // parts drawn with the old edge
  EDGE_KIND = e.kind;
  FRAME_R = e.size === 2.4 ? 2.4 : Math.min(e.size, Math.max(2.4, 0.4 * p.fr.ft));
  EDGE_R = Math.min(e.size, 2.4);
  CORNER_R = e.size === 2.4 ? 3.5 : Math.min(3.5, (e.size * 3.5) / 2.4);
  CH = stepsTo(EDGE_R); FRAME_CH = stepsTo(FRAME_R); CORNER_CH = stepsTo(CORNER_R);
}
// The end frames' cross-section (frameProfile, phase 1C part 2): how far each edge of the frame's plan is
// drawn in at height z (z = 0 is its outside face), on top of the edge setting.
//   square     just the edge setting (the original)
//   chamfered  a deep 45° chamfer all round, 60 % of the frame's thickness (at most 6 mm): a faceted block
//   tapered    the front edge slopes back at 45° through most of the thickness: the rack leans like a wedge
//   waisted    a deep concave cove all round: the frame flares out, the cabinet reads as waisted
// Kept clear of the handle feet (12 mm in), the splice bolts and the name on the top frame.
const profileDepth = (p) => (p.frameProfile === 'tapered' ? Math.min(p.fr.ft - 1.2, 10) : Math.min(0.6 * p.fr.ft, 6));
function frameInsets(p, z) {
  const fp = p.frameProfile;
  if (!fp || fp === 'square') return [0, 0];
  const D = profileDepth(p);
  if (z >= D - 1e-9) return [0, 0];
  const m = (Math.floor((z + 1e-9) / EDGE_STEP) + 0.5) * EDGE_STEP, r3 = (v) => Math.round(v * 1000) / 1000;
  if (fp === 'chamfered') { const k = r3(Math.max(0, D - m)); return [k, k]; } // [all round, front]
  if (fp === 'waisted') { const k = r3(Math.sqrt(Math.max(0, D * D - m * m))); return [k, k]; }
  return [0, r3(Math.max(0, D - m))]; // tapered: the front only
}
const profileCuts = (p) => (!p.frameProfile || p.frameProfile === 'square' ? [] : Array.from({ length: Math.round(profileDepth(p) / EDGE_STEP) }, (_, k) => Math.round((k + 1) * EDGE_STEP * 10) / 10));
// The end frames reach out to the front panels' faces (4 mm in front of the rails) and to the back cover's or
// brace's face, so the front and back of the rack are each one plane. [front, back] in mm.
const frameExt = (p) => [4 + (p.bezelDepth || 0), Math.max(p.covered ? backT(p) : 0, p.braces ? 4 : 0)]; // bezelDepth: the front frame stands proud of the gear
// Deeper than this (with its reach front and back) an end frame prints in two halves.
const splitFrame = (p) => p.D + frameExt(p)[0] + frameExt(p)[1] > 254;
function endFrame(p, top, part = null) {
  const xo = frameXo(p), { ft, ff, bk, hy, G } = p.fr, D = p.D, band = p.fr.band || 24, x0 = xo - ff - 5, x1 = xo - ff - 0.2; // 4.8 mm brackets
  const cut = endCut(p), fb = /front|back/.exec(part || '')?.[0], lr = /left|right/.exec(part || '')?.[0];
  const inHalf = (y) => !fb || (fb === 'front' ? y < cut : y > cut), right = lr !== 'left', left = lr !== 'right';
  const hh = []; if (top && p.handle) for (const sx of [-1, 1]) for (const y of [D / 2 - handleSpan(p) / 2 - 4, D / 2 + handleSpan(p) / 2 + 4]) hh.push([sx * (xo - 12), y]); // under the handle's feet
  const sk = 2.4; // sealed: the middle stays as a skin this thick on the outside face
  // Its reach past the rails: the top frame is used turned end for end, so its ends swap.
  const [ef, eb] = top ? [...frameExt(p)].reverse() : frameExt(p), Y0 = -ef, Y1 = D + eb;
  // Its face: open in the middle (air and cables), or a skin, plain, vented or with fans.
  const lid = top && p.coverTop === 'magnets', mp = lid ? magPocket() : null; // phase 1I: the top's field is a lid that lifts off; the ring holds it on a ledge
  const face = top ? p.faces.top : p.faces.bottom, skin = face !== 'open' && !lid;
  const fs = p.faceFan, fpitch = fs + 6, nf = Math.max(1, Math.min((top ? p.topFans : p.bottomFans) || 3, 3, Math.floor((2 * (xo - band) - 8) / fpitch))), fanFits = face === 'fan' && D - 2 * band >= fs + 4;
  const pocketed = Boolean(fb) || 2 * xo > 256;
  const feetHoles = !top && p.feet && p.feet !== 'none';
  // A front or back half draws only its own half of the frame's area (the other half was drawn and then cut
  // away: twice the work for the same part). The back half starts a whole number of pixels along, so its
  // pixels sit where the whole frame's would.
  const px = 0.15 * draftScale(), yA = fb === 'back' ? Y0 + Math.floor((cut - 2 - Y0) / px) * px : Y0, yB = fb === 'front' ? Math.min(Y1, cut + 2) : Y1;
  const m = sections([-xo, yA, xo, yB], [...new Set([...(top ? [0, 0.6] : [0, 0.4]), ...FRAME_CH, ...profileCuts(p), ...(feetHoles ? footCuts(ft) : []), ...(skin ? [sk] : []), ...(lid ? [LID.t, LID.t + mp.depth] : []), ...(pocketed ? [p.fr.sp] : []), ft])].sort((a, b) => a - b), (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    const e = Math.max(f, chF(z)); // the outside face's edge chamfered all round
    // The cross-section on top: all round, and the front (Y0 on the bottom frame; Y1 on the top one, turned end for end).
    const [ka, kf] = frameInsets(p, z), es = Math.max(e, ka), ef2 = Math.max(e, ka, kf);
    const [eLo, eHi] = top ? [es, ef2] : [ef2, es];
    d.on(rr(-xo + es, Y0 + eLo, xo - es, Y1 - eHi, Math.max(0.5, FRAME_R - e))); // its corners turn on the same 2.4 mm round as the panels' edges, so nothing sticks out past it
    if (lid) {
      const L7 = LID.ledge;
      if (z < LID.t) { d.off(rr(-xo + band - L7, band - L7, xo - band + L7, D - band + L7, 8 + L7)); d.off(rr(xo - band + L7 - 2, D / 2 - 12, xo - band + L7 + 5, D / 2 + 12, 3)); } // the rebate the lid sits in, and a finger notch at its side
      else if (z < LID.t + mp.depth) for (const [x, y] of lidMagnets(p, band)) d.disc(x, y, mp.r, 0); // the ledge's magnets (glue them in, all the same way up)
    }
    if (!skin || z >= sk) d.off(rr(-xo + band, band, xo - band, D - band, 8));
    else if (face === 'vents') vents(at(p, 'top'), d, -xo + band + 6, band + 6, xo - band - 6, D - band - 6, 6, 3);
    else if (fanFits) for (let k = 0; k < nf; k++) fanHole(d, (k - (nf - 1) / 2) * fpitch, D / 2, fs);
    for (const [x, y] of hh) d.disc(x, y, 1.7, 0);
    if (feetHoles) drawFootHoles(d, z, ft, xo, D); // the feet's bolts, heads sunk flush inside the rack
    // On the bed face, which is the outside once it's turned over: mirrored here so it reads from above.
    // Split left and right (a wide cabinet), the name moves to the right half, clear of the seam.
    const tx = p.W > 256 ? -xo / 2 : 0; // (the top frame is turned over, so its right is x < 0 here)
    if (top && z < 0.6) { const h = 8, w = (textUnits('MINT MOTIVE') * h) / 6; for (const poly of textPolygons('MINT MOTIVE', -w / 2, -h / 2, h, 1.3)) d.off(poly.map(([x, y]) => [x + tx, D - 12 - y])); }
    if (fb) for (const sx of [-1, 1]) for (const dy of [-10, 10]) d.disc(sx * (xo - 12), cut + dy, 1.7, 0); // the front/back splice plates' bolts
    // The splice plates sit in pockets in the outside face, flush with it.
    if (z < p.fr.sp && fb) for (const sx of [-1, 1]) d.off(rr(sx * (xo - 12) - 10.25, cut - 20.25, sx * (xo - 12) + 10.25, cut + 20.25, 3));
    if (z < p.fr.sp && 2 * xo > 256) for (const y of [12, D - 12]) d.off(rr(-20.25, y - 10.25, 20.25, y + 10.25, 3));
    if (2 * xo > 256) for (const y of [12, D - 12]) for (const dx of [-10, 10]) d.disc(dx, y, 1.7, 0); // the left/right ones
    if (fb) d.off(fb === 'front' ? rr(-xo - 1, cut, xo + 1, Y1 + 1) : rr(-xo - 1, Y0 - 1, xo + 1, cut));
    if (lr) d.off(lr === 'left' ? rr(0, Y0 - 1, xo + 1, Y1 + 1) : rr(-xo - 1, Y0 - 1, 0, Y1 + 1));
  }, 0.15, 0.1, { loft: SMOOTH.edges });
  // The corner brackets, drawn in (y, height) and stood at x0..x1, mirrored for the far side.
  const pairs = [[11, band], [D - band, D - 11]];
  const ins = bracketInserts(p), xb = x1 - INSERT_M3.depth; // inserts: a blind bore from the face against the flange, 0.8 mm floor
  const brOf = (ps) => sections([0, 0, D, bk], ins ? [x0, xb, x1] : [x0, x1], (x, d) => {
    for (const [y0, y1] of ps) { d.on(rr(y0, 0, y1, bk, 1)); if (!ins) tear(d, y0 < D / 2 ? hy : D - hy, bk / 2, hwHole(p, 'structure', 1.7)); else if (x > xb) d.disc(y0 < D / 2 ? hy : D - hy, bk / 2, INSERT_M3.bore / 2, 0); }
  }, 0.1, 0.06);
  const direct = pairs.filter(([y0]) => inHalf(y0)), rotated = pairs.filter(([y0]) => inHalf(D - y0));
  if (direct.length && right) m.append(turn(brOf(direct), (a, b, c) => [c, a, ft - 0.01 + b])); // (a, b, c) → (c, a, b): a rotation
  if (rotated.length && left) m.append(turn(brOf(rotated), (a, b, c) => [-c, D - a, ft - 0.01 + b])); // and half a turn about z
  // A gusset inside each bracket, so it can't fold over when the rack is pushed sideways. Kept within
  // 7 mm of the bracket, clear of a shelf or drawer in the bottom unit. Drawn in (x, height), stood across y.
  // Tall: it climbs most of the bracket's height (a steeper, stiffer web); double: one at each end of the bracket.
  if (p.gussets === 'none') return m;
  const gt = 3, gh = p.gussets === 'tall' || p.gussets === 'max' ? bk - 2 : G;
  const gus = extrudePolygon([[x0 - G, 0], [x0 + 0.01, 0], [x0 + 0.01, gh]], [], 0, gt);
  const along = p.gussets === 'double' || p.gussets === 'max' ? [11 + gt / 2 + 0.5, band - gt / 2 - 0.5] : [(11 + band) / 2];
  for (const yc of [...along, ...along.map((y) => D - y)]) {
    if (inHalf(yc) && right) m.append(flip(turn(gus, (a, b, c) => [a, yc - gt / 2 + c, ft - 0.01 + b]))); // (a, b, c) → (a, c, b) is a mirror: so turn, then flip the faces back
    if (inHalf(D - yc) && left) m.append(flip(turn(gus, (a, b, c) => [-a, D - (yc - gt / 2 + c), ft - 0.01 + b])));
  }
  return m;
}

// A side panel, flat, its outside up: x along the depth, y up the section.
// Its corners are cut back round the end frames' brackets.
// Longer than a bed, a side panel prints in two halves joined by a strip behind the seam (part: 'front' | 'back').
const panelSplit = (p) => p.D - 10.4 > 252;
const panelJoinYs = (p, L) => (L >= 2 * p.fr.bk + 40 ? [p.fr.bk + 14, L / 2, L - p.fr.bk - 14] : [L * 0.3, L * 0.7]); // short (1U) sections: two bolts
// Snap-in cartridge bay (our own design). A 2U front panel with one wide opening; behind it a cage, open at the back,
// with a pair of guide grooves per slot, top and bottom; cartridges stand on edge in them: a front face flush with the
// panel and a carrier plate whose top and bottom edges ride in the grooves. Push one in and a sprung bump on its top
// edge (a short beam over a relief slot) clicks into a notch in the top groove; pull the face to release. Coordinates:
// x across (slot 0 at the left, seen from the front), y depth from the cage's front (the panel's back), z up from the
// cage's bottom. sections() slices along its third axis, so the meshes come out as (x, z up, y depth): they print
// standing on their front, and the placement turns them into the rack.
export const CART = { u: 2, pitch: 26, plate: 2.5, groove: 3, bar: 5.5, wall: 4, depth: 100, face: 3, standoff: 3, board: 1.6, bump: 0.7, notch: [10, 16] };
export const CART_TYPES = { pi: 'Raspberry Pi 4 / 5', ssd: '2.5" SSD or drive', usb: 'USB hub (3 USB keystone ports)', keystone: 'keystone jacks (3)', blank: 'blank', vent: 'vented', light: 'light bar', fan: '40 mm fan (two slots wide)', switch: 'mini 5-port switch (two slots wide)', empty: 'empty' };
// Cartridges two slots wide: the carrier runs in the right-hand slot of the pair, the face covers both.
export const CART_DOUBLE = ['fan', 'switch'];
// A mini switch on edge (TP-Link LS1005 class): its port end up to 56 × 24 mm, up to 100 mm long.
const MINISW = { h: 56, t: 24, L: 100 };
// Which cartridge sits where: a double takes its slot and the next, and the next word is skipped.
export function cartSlots(p) {
  const n = cartGeom(p).n, out = [];
  for (let k = 0; k < Math.min(n, p.cartLayout.length); k++) {
    const t = p.cartLayout[k];
    if (CART_DOUBLE.includes(t)) { if (k + 1 < n) { out.push({ t, k, slot: k + 1 }); k++; } continue; }
    if (t !== 'empty') out.push({ t, k, slot: k });
  }
  return out;
}
// A 2.5" drive in an SSD cartridge: 69.85 mm tall, up to 9.5 mm thick, 100 long; it slides into a C-channel from the back.
const SSD = { h: 69.85, t: 9.9, L: 100, ledge: 0.9, lip: 1.6 };
export function cartGeom(p) {
  const h = CART.u * RACK10.U - 0.8, Ho = h - 4, Wc = 2 * p.ex - 1, Wi = Wc - 2 * CART.wall;
  const n = Math.floor(Wi / CART.pitch), xs = Array.from({ length: n }, (_, k) => -n * CART.pitch / 2 + k * CART.pitch + 0.5);
  const zIn = [CART.bar, Ho - CART.bar], zRun = [CART.bar - CART.groove + 0.4, Ho - CART.bar + CART.groove - 0.4];
  const zb0 = (zIn[0] + zIn[1]) / 2 - 28; // a Pi board (85 × 56) stands centred in the opening
  return { h, Ho, Wc, Wi, n, xs, zIn, zRun, zb0, fix: [-1, 1].flatMap((sx) => [[sx * (Wi / 2 - 20), CART.bar / 2], [sx * (Wi / 2 - 20), Ho - CART.bar / 2]]) };
}
export function cartCage(p) {
  const g = cartGeom(p), { Ho, Wc, Wi, xs, zIn } = g, gw = CART.plate / 2 + 0.2;
  return sections([-Wc / 2, 0, Wc / 2, Ho], [0, 1.5, CART.notch[0], CART.notch[1], 12, CART.depth], (y, d) => {
    d.on(rr(-Wc / 2, 0, Wc / 2, Ho, 2));
    d.off(rr(-Wi / 2, zIn[0], Wi / 2, zIn[1], 1));
    const lead = y < 1.5 ? 0.6 : 0, deep = y > CART.notch[0] && y < CART.notch[1] ? CART.bump + 0.3 : 0;
    for (const x of xs) {
      const c = x + CART.plate / 2;
      d.off(rr(c - gw - lead, zIn[0] - CART.groove, c + gw + lead, zIn[0] + 0.01)); // the bottom groove
      d.off(rr(c - gw - lead, zIn[1] - 0.01, c + gw + lead, zIn[1] + CART.groove + deep)); // the top groove, deeper at the notch
    }
    if (y < 12) for (const [x, z] of g.fix) d.disc(x, z, 1.25, 0); // M3 self-tapping, through the panel into the bars
  }, 0.15, 0.1);
}
export function cartridge(p, type) {
  const g = cartGeom(p), { zIn, zRun, zb0 } = g, dbl = CART_DOUBLE.includes(type), w = (dbl ? 2 : 1) * CART.pitch - 1, y0 = -4, yf = y0 + CART.face;
  const zm = (zIn[0] + zIn[1]) / 2, fan = type === 'fan', sw = type === 'switch', fx = CART.plate + 1.5 + 20; // a 40 mm fan's centre, clear of the carrier
  const pi = type === 'pi', jacks = type === 'usb' || type === 'keystone', L = pi ? 2 + 85 + 3 : type === 'ssd' ? SSD.L + 2 : type === 'usb' ? 70 : sw ? MINISW.L + 2 : 40, yb0 = 2, holes = pi ? [[yb0 + 23.5, zb0 + 3.5], [yb0 + 23.5, zb0 + 52.5], [yb0 + 81.5, zb0 + 3.5], [yb0 + 81.5, zb0 + 52.5]] : [];
  const sx = CART.plate + CART.standoff + CART.board, [n0, n1] = CART.notch;
  const ks = jacks ? [-23, 0, 23].map((dz) => (zIn[0] + zIn[1]) / 2 + dz) : [], ties = type === 'usb' ? [[30, 34], [52, 56]] : [];
  const cuts = [...new Set([y0, y0 + 0.4, ...(jacks ? [y0 + 2] : []), yf, 0.5, n0 - 4, n0, n1, n1 + 4, L, ...(type === 'ssd' ? [L - 6, L - 3] : []), ...ties.flat(), ...holes.flatMap(([yh]) => [...circleCuts(yh, 3, yf, L), ...circleCuts(yh, 1.1, yf, L)])])].sort((a, b) => a - b);
  return sections([0, zRun[0] - 1, w, zRun[1] + CART.bump + 1], cuts, (y, d) => {
    if (y < yf) { // the face, flush with the panel, its outer edge eased
      const e = y < y0 + 0.4 ? 0.4 : 0;
      d.on(rr(0.5 + e, zIn[0] + 0.5 + e, w - 0.5 - e, zIn[1] - 0.5 - e, 1.5));
      if (pi) d.off(rr(sx + 0.5, zb0 + 1, Math.min(w - 1.5, sx + 17), zb0 + 55, 1.5)); // USB and Ethernet
      else if (jacks) for (const zc of ks) { // keystone jacks (USB couplers, HDMI, Ethernet): the hole, thinned behind so the latch reaches
        d.off(rr(w / 2 - p.keyW / 2, zc - p.keyH / 2, w / 2 + p.keyW / 2, zc + p.keyH / 2));
        if (y > y0 + 2) d.off(rr(w / 2 - p.keyW / 2 - 2.5, zc - p.keyH / 2 - 1.5, w / 2 + p.keyW / 2 + 2.5, zc + p.keyH / 2 + 1.5, 1));
      } else d.off(rr(w * 0.25, zIn[1] - 12, w * 0.75, zIn[1] - 6, 2)); // a finger grip
      if (type === 'ssd') d.disc(w / 2, (zIn[0] + zIn[1]) / 2, 1.6, 0); // a 3 mm light pipe for the activity light
      if (type === 'vent') for (let z = zIn[0] + 8; z < zIn[1] - 16; z += 6) d.off(rr(4, z, w - 4, z + 3, 1.5));
      if (type === 'light') d.off(rr(w / 2 - 2, zIn[0] + 6, w / 2 + 2, zIn[1] - 16, 2));
      if (fan) { // a 40 mm fan screwed to the back of the face: a guarded opening and four M3 holes on 32 mm
        d.disc(fx, zm, 19, 0);
        if (y < y0 + 1.6) for (const dz of [-9, 0, 9]) d.on(rr(fx - 19, zm + dz - 0.8, fx + 19, zm + dz + 0.8)); // the guard, in the outer face
        for (const sx of [-16, 16]) for (const sz of [-16, 16]) d.disc(fx + sx, zm + sz, 1.7, 0);
      }
      if (sw) d.off(rr(CART.plate + 0.6, zm - MINISW.h / 2 - 0.4, CART.plate + MINISW.t + 0.8, zm + MINISW.h / 2 + 0.4, 1)); // the ports show through
      return;
    }
    const z0 = y < 0.5 ? zIn[0] + 0.3 : zRun[0], z1 = y < 0.5 ? zIn[1] - 0.3 : zRun[1];
    d.on(rr(0, z0, CART.plate, z1)); // the carrier plate: its edges are the runners
    if (y > n0 && y < n1) d.on(rr(0, z1 - 0.01, CART.plate, z1 + CART.bump)); // the detent bump
    if (y > n0 - 4 && y < n1 + 4) d.off(rr(-1, z1 - 2.8, CART.plate + 1, z1 - 1.8)); // relief under it: a short spring beam
    if (type === 'ssd' && y > yf) { // the drive's C-channel: a ledge top and bottom with a lip over the drive's face
      const a = CART.plate - 0.01, b = CART.plate + SSD.t, lo = zIn[0] + 0.1, hi = zIn[1] - 0.1;
      d.on(rr(a, lo, b + SSD.lip, lo + SSD.ledge)); d.on(rr(b, lo, b + SSD.lip, lo + 2.5));
      d.on(rr(a, hi - SSD.ledge, b + SSD.lip, hi)); d.on(rr(b, hi - 2.5, b + SSD.lip, hi));
      if (y > L - 6 && y < L - 3) d.on(rr(CART.plate + 2, lo + SSD.ledge - 0.01, CART.plate + 6, lo + SSD.ledge + 0.4)); // a click at the back keeps it in
    }
    if (sw && y > yf) { // a mini switch on edge: a ledge under and over it, a lip on its far side, a click at the back
      const a = CART.plate - 0.01, b = CART.plate + MINISW.t + 0.6, lo = zm - MINISW.h / 2 - 0.4, hi = zm + MINISW.h / 2 + 0.4;
      d.on(rr(a, lo - 1.6, b + 1.6, lo)); d.on(rr(b, lo - 1.6, b + 1.6, lo + 3));
      d.on(rr(a, hi, b + 1.6, hi + 1.6)); d.on(rr(b, hi - 3, b + 1.6, hi + 1.6));
      if (y > L - 6 && y < L - 3) d.on(rr(CART.plate + 2, lo - 0.01, CART.plate + 8, lo + 0.5));
    }
    for (const [t0, t1] of ties) if (y > t0 && y < t1) for (const zt of [zIn[0] + 12, zIn[1] - 15]) d.off(rr(-1, zt, CART.plate + 1, zt + 3)); // tie slots for a small hub
    for (const [yh, zh] of holes) { // standoffs for the board, M2.5 self-tapping
      const c = halfChord(3, y - yh), hh = halfChord(1.1, y - yh);
      if (c) d.on(rr(CART.plate - 0.01, zh - c, CART.plate + CART.standoff, zh + c));
      if (hh) d.off(rr(-1, zh - hh, CART.plate + CART.standoff + 1, zh + hh));
    }
  }, 0.15, 0.1);
}
// Built-in cable management: zip-tie anchors on the inside of a side panel. Each is two 3.2 × 5.5 mm slots 10 mm
// apart, 2 mm deep, joined underneath by a 2 mm tunnel (a tie threads down one, under the bridge, up the other); the
// outside face is never broken. Two columns (near the front and back uprights) every 60 mm, clear of the brackets,
// the joint notches and any opening. Returns the slot pairs' left x and y.
export const TIE = { w: 3.2, h: 5.5, gap: 10, slot: 2, tunnel: 2 };
function tieAnchors(p, L, e0, Dp, joints, keep = []) {
  if (!p.cableTies) return [];
  const { bk } = p.fr, jh = jointS(L) + 0.4, out = [];
  for (const ax of [e0 + 6, Dp - e0 - 6 - TIE.gap]) for (let y = bk + 20; y <= L - bk - 20; y += 60) {
    if ((joints[0] && y < jh + 8) || (joints[1] && y > L - jh - 8)) continue;
    if (keep.some(([x0, y0, x1, y1]) => ax + TIE.gap + TIE.w > x0 - 4 && ax - TIE.w < x1 + 4 && y + TIE.h > y0 - 4 && y - TIE.h < y1 + 4)) continue;
    out.push([ax, y]);
  }
  return out;
}
function tieCut(d, z, anchors) {
  const hw = TIE.w / 2, hh = TIE.h / 2;
  for (const [ax, y] of anchors) {
    if (z < TIE.slot) { d.off(rr(ax - hw, y - hh, ax + hw, y + hh, 0.6)); d.off(rr(ax + TIE.gap - hw, y - hh, ax + TIE.gap + hw, y + hh, 0.6)); }
    else if (z < TIE.slot + TIE.tunnel) d.off(rr(ax - hw, y - hh, ax + TIE.gap + hw, y + hh, 0.6));
  }
}
function sidePanel2(p, u, fan = null, part = null, face = 'solid', withArt = false, joints = [false, false]) {
  const L = u * RACK10.U, Dp = p.D - 10.4, { pt, bk } = p.fr, inset = p.fr.hy - 5.2, nb = (p.fr.band || 24) - 5.2 + 0.4, cut = Dp / 2;
  // Panel art: it takes over the face (no badge, logo or ribs there), inlaid flush in its own colours.
  const ins = sideInsert(p, L, fan, face); // phase 1E: a sheet over the face takes it over too (no art, badge, logo, ribs or vents)
  const ab = withArt && !ins ? artBox(p, L, face) : null;
  // Split: the badge goes in the middle of the front half, clear of the seam.
  const bx = panelSplit(p) ? cut / 2 : Dp / 2, bw = Math.min(150, (panelSplit(p) ? cut : Dp) - 50), bh = Math.min(24, L * 0.3), by = L - 24 - bh / 2;
  const win = face === 'window' && windowBox(p, L);
  const og = face === 'opengrid' && ogBox(p, L);
  const f = !win && fan && sideFanPlace(p, L, fan);
  const badge = !win && !ab && !ins && p.badge && L >= 80 && !(f && Math.abs(by - f.cy) < bh / 2 + f.th / 2 + 4 && Math.abs(bx - f.cx) < bw / 2 + f.total / 2 + 4);
  // Round a joint's splice plates (inside the flanges, behind them): notched front and back at a joint end.
  const jw = spliceBand(p)[1] - 5.2 + 0.4, jh = jointS(L) + 0.4;
  const joint = (d) => { for (const [on, y0, y1] of [[joints[0], -1, jh], [joints[1], L - jh, L + 1]]) if (on) { d.off(rr(-1, y0, jw, y1)); d.off(rr(Dp - jw, y0, Dp + 1, y1)); } };
  const clip = (d, z = 0) => { joint(d); if (z > tb) { const k = z > t0 ? 0 : ch(t0 - z); d.off(rr(-1, -1, e0 + k, L + 1)); d.off(rr(Dp - e0 - k, -1, Dp + 1, L + 1)); if (k) { d.off(rr(-1, -1, Dp + 1, k)); d.off(rr(-1, L - k, Dp + 1, L + 1)); } } if (part) { for (const y of panelJoinYs(p, L)) for (const dx of [-8, 8]) d.disc(cut + dx, y, 1.7, 0); d.off(part === 'front' ? rr(cut, -1, Dp + 1, L + 1) : rr(-1, -1, cut, L + 1)); } };
  // The panel's style: a thinner sheet under taller ribs for light, ribs or a triangle grid standing off the outside.
  const st = og || ab || ins ? 'solid' : p.panelStyle, ribH = st === 'light' ? 3 : st === 'isogrid' ? 2 : st === 'ribbed' ? 1.6 : 0, t0base = og ? Math.max(pt, OG.lite) : st === 'light' ? Math.max(1.8, pt * 0.6) : pt;
  // Flush with the uprights: between the flanges the panel stands out by the flange's thickness, so its face is level
  // with theirs; behind the flanges (the edges, e0 from each end) it stays tb thick, a rebate the flanges lap over.
  const tb = t0base, t0 = tb + p.fr.ff, e0 = p.fr.fl - 5.2 + 0.3;
  const ties = (ins ? t0 - ins.depth - 0.8 : t0) >= TIE.slot + TIE.tunnel + (ins ? 0 : 1.5) ? tieAnchors(p, L, e0, Dp, joints, [...(win ? [win] : []), ...(f ? [[f.cx - f.total / 2, f.cy - f.th / 2, f.cx + f.total / 2, f.cy + f.th / 2]] : []), ...(og ? [[og.x0, og.y0, og.x0 + og.cols * OG.pitch, og.y0 + og.rows * OG.pitch]] : [])]) : [];
  // The logo: where it goes (kept to one half on a split panel), how big.
  const lg = !win && !og && !ab && !ins && p.logo && (() => {
    const sz = Math.min(p.logoSize, Dp - 40, L - 2 * bk - 12);
    if (sz < 12) return null;
    let cx = Math.min(Dp - 20 - sz / 2, Math.max(20 + sz / 2, p.logoX * Dp)), cy = Math.min(L - bk - 6 - sz / 2, Math.max(bk + 6 + sz / 2, p.logoY * L));
    if (panelSplit(p) && Math.abs(cx - cut) < sz / 2 + 10) cx = Math.min(cut - sz / 2 - 10, Math.max(20 + sz / 2, cut / 2));
    const at = ([u, v]) => [cx - sz / 2 + u * sz, cy - sz / 2 + v * sz];
    return { box: [cx - sz / 2, cy - sz / 2, cx + sz / 2, cy + sz / 2], outers: p.logo.filter((g) => g.outer?.length > 2).map((g) => g.outer.map(at)), holes: p.logo.flatMap((g) => (g.holes || []).filter((h) => h.length > 2).map((h) => h.map(at))) };
  })();
  const solidUnder = (d) => { // no vents under the badge or a raised or engraved logo
    if (badge) d.on(rr(bx - bw / 2 - 3, by - bh / 2 - 3, bx + bw / 2 + 3, by + bh / 2 + 3, 5));
    if (lg && p.logoStyle !== 'cut') d.on(rr(lg.box[0] - 3, lg.box[1] - 3, lg.box[2] + 3, lg.box[3] + 3, 5));
    if (ab) d.on(rr(...ab));
  };
  const ventBox = [26, bk + 6, Dp - 26, badge ? by - bh / 2 - 6 : L - bk - 6], vented = face === 'vents' && !ins;
  // Latches: a round hole for each quarter-turn latch's shaft (instead of a screw hole).
  const fixR = p.panelFix === 'latches' ? 4.3 : p.fastening === 'inserts' ? trimInsert(p).bore / 2 : p.threads ? hwHole(p, 'trim') : insertR(p);
  const ribs = (d) => {
    const m = 7, X0 = m, Y0 = bk + 3, X1 = Dp - m, Y1 = L - bk - 3, w = st === 'light' ? 2 : 1.6;
    if (st === 'ribbed') { for (let x = X0 + ((X1 - X0) % 28) / 2; x <= X1; x += 28) d.on(rr(x - w / 2, Y0, x + w / 2, Y1, w / 2)); }
    else {
      const S = st === 'light' ? 34 : 28, mx = (X0 + X1) / 2, my = (Y0 + Y1) / 2, R = Math.hypot(X1 - X0, Y1 - Y0), W = X1 - X0, H = Y1 - Y0;
      d.on(rr(X0, Y0, X1, Y1, 4)); d.off(rr(X0 + w, Y0 + w, X1 - w, Y1 - w, 3)); // a rim round the grid
      for (const deg of [0, 60, 120]) {
        const a = (deg * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux, hw = w / 2;
        // Only the strips that cross the grid's box, each just long enough to reach past it (cut back to the box below).
        const reachN = (Math.abs(nx) * W + Math.abs(ny) * H) / 2 + w, T = (Math.abs(ux) * W + Math.abs(uy) * H) / 2 + 2;
        for (let c = -R; c <= R; c += S) {
          if (Math.abs(c) > reachN) continue;
          const px = mx + nx * c, py = my + ny * c;
          d.on([[px - ux * T + nx * hw, py - uy * T + ny * hw], [px + ux * T + nx * hw, py + uy * T + ny * hw], [px + ux * T - nx * hw, py + uy * T - ny * hw], [px - ux * T - nx * hw, py - uy * T - ny * hw]]);
        }
      }
    }
    // Ribs stop short of the edges, the bracket corners, the screw heads, the openings and the fans.
    // (Cut back to just past the panel: the drawing only covers the panel, and a far-off box costs time.)
    const F0 = -2, Fx = Dp + 2, Fy = L + 2; d.off(rr(F0, F0, Fx, Y0)); d.off(rr(F0, Y1, Fx, Fy)); d.off(rr(F0, F0, X0, Fy)); d.off(rr(X1, F0, Fx, Fy));
    for (const x of [inset, Dp - inset]) for (const y of flangeXs(L)) d.disc(x, y, p.panelFix === 'latches' ? 11 : 5, 0);
    if (vented) vents(at(p, 'side'), d, ...ventBox, 6, 3);
    if (win) d.off(rr(win[0] - 4, win[1] - 4, win[2] + 4, win[3] + 4, 8));
    if (f) d.off(rr(f.cx - f.total / 2, f.cy - f.th / 2, f.cx + f.total / 2, f.cy + f.th / 2, 3));
    if (lg && p.logoStyle === 'cut') for (const o of lg.outers) d.off(o);
    if (lg && p.logoStyle !== 'cut') d.off(rr(lg.box[0] - 2, lg.box[1] - 2, lg.box[2] + 2, lg.box[3] + 2, 4));
    if (badge) d.off(rr(bx - bw / 2 - 2, by - bh / 2 - 2, bx + bw / 2 + 2, by + bh / 2 + 2, 5));
  };
  // Recessed (flush): the badge and a raised logo sink into the face as inlays, the screw heads and latch knobs into counterbores.
  const th = hwHead(p, 'trim'), fl = p.flush, rd = Math.min(1, t0 - 1.2), cb = th ? Math.min(th.depth, tb - HEADS[p.threads.trim].floor) : Math.min(2, tb - 1.6), cbR = th ? th.r : 3.3;
  const top = Math.max(ribH, !fl && (badge || (lg && p.logoStyle === 'raised')) ? 1.2 : 0);
  const cuts = [...new Set([0, 0.4, ...(win && p.windowFill === 'print' ? winBand(t0) : []), ...(ties.length ? [TIE.slot, TIE.slot + TIE.tunnel] : []), ...(p.panelFix === 'magnets' ? [SIDE_MAG().depth] : []), ...(ab ? [t0 - ART_DEPTH] : []), ...(ins ? [t0 - ins.depth] : []), ...(lg && p.logoStyle === 'engraved' ? [t0 - 0.8] : []), ...(fl && rd > 0.3 ? [t0 - rd] : []), ...(fl && cb > 0.3 ? [tb - cb] : []), tb, ...CH.map((c) => t0 - c), t0, ...(top ? [t0 + 1.2, t0 + top] : []), ...(vented ? louvreCuts(p, 0.4, tb, ['side']) : [])])].filter((c) => c <= t0 + top).sort((x, y) => x - y);
  // A front or back half draws only its own half (it drew the whole panel and cut the other half away);
  // the back half starts a whole number of pixels along, so its pixels sit where the whole panel's would.
  const px = 0.15 * draftScale(), xA = part === 'back' ? Math.floor((cut - 2) / px) * px : 0, xB = part === 'front' ? cut + 2 : Dp;
  const panel = sections([xA, 0, xB, L], cuts, (z, d) => {
    const e = z < 0.4 ? 0.4 : 0;
    if (z > t0) {
      if (ribH && z < t0 + ribH) ribs(d);
      if (!fl && z < t0 + 1.2) {
        if (badge) { d.on(rr(bx - bw / 2, by - bh / 2, bx + bw / 2, by + bh / 2, 4)); letters(d, p.badge, bx, by, Math.min(10, bh * 0.45)); }
        if (lg && p.logoStyle === 'raised') { for (const o of lg.outers) d.on(o); for (const h of lg.holes) d.off(h); }
      }
      clip(d, z); return;
    }
    d.on(rr(e, e, Dp - e, L - e, 2));
    for (const [cx, cy] of [[0, 0], [Dp, 0], [0, L], [Dp, L]]) d.off(rr(cx - nb, cy - bk - 0.4, cx + nb, cy + bk + 0.4)); // round the brackets
    if (vented) vents(at(p, 'side'), d, ...ventBox, 6, 3);
    solidUnder(d);
    if (ab && z > t0 - ART_DEPTH) d.off(rr(...ab)); // the pocket the art fills (a side fan's block is put back below)
    if (ins && z > t0 - ins.depth) d.off(rr(...ins.pocket, ins.r)); // the pocket the sheet sits in (likewise)
    if (win) windowCut(p, d, z, win, t0); // the window: holes for the sheet's clips, or a groove for a printed pane
    if (og) d.off(rr(og.x0 + 1, og.y0 + 1, og.x0 + og.cols * OG.pitch - 1, og.y0 + og.rows * OG.pitch - 1)); // the openGrid board fills this (1 mm into the frame all round)
    if (f) { d.on(rr(f.cx - f.total / 2, f.cy - f.th / 2, f.cx + f.total / 2, f.cy + f.th / 2, 3)); for (const [x, y] of f.pts) fanHole(d, x, y, fan.size); }
    // The logo cut through (a stencil: its outlines only, so nothing is left floating), or engraved into the outside.
    if (lg && p.logoStyle === 'cut') for (const o of lg.outers) d.off(o);
    if (lg && p.logoStyle === 'engraved' && z >= t0 - 0.8) { for (const o of lg.outers) d.off(o); for (const h of lg.holes) d.on(h); }
    if (fl && rd > 0.3 && z > t0 - rd) { // inlays: a pocket with the letters (or the logo) standing in it, flush with the face
      if (badge) { d.off(rr(bx - bw / 2, by - bh / 2, bx + bw / 2, by + bh / 2, 4)); letters(d, p.badge, bx, by, Math.min(10, bh * 0.45), true); }
      if (lg && p.logoStyle === 'raised') { d.off(rr(lg.box[0] - 1.5, lg.box[1] - 1.5, lg.box[2] + 1.5, lg.box[3] + 1.5, 3)); for (const o of lg.outers) d.on(o); for (const h of lg.holes) d.off(h); }
    }
    if (fl && cb > 0.3 && z > tb - cb && p.panelFix !== 'magnets' && !(p.fastening === 'inserts' && p.panelFix !== 'latches')) for (const x of [inset, Dp - inset]) for (const y of flangeXs(L)) if (y > bk + 2 && y < L - bk - 2) d.disc(x, y, p.panelFix === 'latches' ? 10.2 : cbR, 0); // counterbores: heads and knobs sit in the panel
    if (p.panelFix !== 'magnets') for (const x of [inset, Dp - inset]) for (const y of flangeXs(L)) if (y > bk + 2 && y < L - bk - 2) d.disc(x, y, fixR, 0);
    else if (z < SIDE_MAG().depth) for (const x of [inset, Dp - inset]) for (const y of flangeXs(L)) if (y > bk + 2 && y < L - bk - 2) d.disc(x, y, SIDE_MAG().r, 0); // the panel's magnets, in its inside face
    tieCut(d, z, ties);
    clip(d, z);
  }, 0.15, 0.1, { loft: SMOOTH.edges });
  if (!og || (part && (part === 'front' ? og.x0 >= cut : og.x0 + og.cols * OG.pitch <= cut))) return panel;
  // The openGrid board (Lite, its face outside), in the panel's opening: the panel prints outside up, the board face down,
  // so it's turned over into place. Split panels: each half takes the cells on its side of the seam.
  const cols = part ? Math.max(1, Math.floor(((part === 'front' ? cut - og.x0 : og.x0 + og.cols * OG.pitch - cut)) / OG.pitch)) : og.cols;
  const gx = part === 'back' ? og.x0 + og.cols * OG.pitch - cols * OG.pitch : og.x0;
  const b = ogBoard({ variant: 'lite', cols, rows: og.rows, screws: 'none', connectors: false });
  panel.append(flip(turn(b, (x, y, z) => [gx + x, og.y0 + y, t0 - z])));
  return panel;
}
// Where an openGrid board fits on a side panel: whole 28 mm cells, clear of the bracket corners and the badge.
function ogBox(p, L) {
  const Dp = p.D - 10.4, { bk } = p.fr, x0 = 24, x1 = Dp - 24, y0 = bk + 8, y1 = L - bk - (p.badge && L >= 80 ? 52 : 8);
  const cols = Math.floor((x1 - x0) / OG.pitch), rows = Math.floor((y1 - y0) / OG.pitch);
  if (cols < 1 || rows < 1) return null;
  return { cols, rows, x0: (x0 + x1) / 2 - (cols * OG.pitch) / 2, y0: (y0 + y1) / 2 - (rows * OG.pitch) / 2 };
}
// A cable ring for the back rails: a tab that bolts through a rail hole (M6) and a ring with a gap to slip cables in.
function cableRing() {
  const cx = 10, cy = 16 + 17;
  return sections([-12, 0, 32, 52], [0, 0.4, 7.6, 8], (z, d) => {
    const f = z < 0.4 || z > 7.6 ? 0.5 : 0;
    d.on(rr(f, f, 20 - f, 18, 3)); d.disc(10, 8, 3.25, 0); // the tab and its bolt hole
    d.disc(cx, cy, 17 - f); d.disc(cx, cy, 11 + f, 0); // the ring
    d.off([[cx + 4, cy + 4], [cx + 30, cy + 10], [cx + 30, cy + 22]]); // the gap cables go in by
  }, 0.1, 0.06);
}
// A window side panel: the opening (x0, y0, x1, y1 on the panel), a frame round it that a 3 mm acrylic
// sheet sits behind, held by printed clips screwed into the frame. Null if the section is too short.
// Where panel art goes on a side panel: inside the screw lines and the corner brackets, the whole face
// (fill) or the picture's own shape, centred (fit). None on a window or openGrid face.
function artBox(p, L, face) {
  if (!p.art || face === 'window' || face === 'opengrid' || face === 'none') return null;
  const Dp = p.D - 10.4, { bk } = p.fr;
  let x0 = 26, y0 = bk + 6, x1 = Dp - 26, y1 = L - bk - 6;
  if (x1 - x0 < 30 || y1 - y0 < 20) return null;
  if (p.artFit === 'fit') {
    const w = x1 - x0, h = y1 - y0, a = p.art.aspect;
    if (w / h > a) { const nw = h * a; x0 += (w - nw) / 2; x1 = x0 + nw; } else { const nh = w / a; y0 += (h - nh) / 2; y1 = y0 + nh; }
  }
  return [x0, y0, x1, y1];
}

// Phase 1E: a side panel's insert (rack-inserts.js), or null: on a solid or vented face, between the screw
// lines (clear of the corner brackets' notches), 6 mm in from the top and bottom, a fan's block left standing
// through it. At least 1.6 mm of panel under it: a thicker sheet than that allows is cut thinner (the cut list says).
function sideInsert(p, L, fan, face) {
  if (!p.insertSides || p.insertSides === 'none' || !['solid', 'vents'].includes(face)) return null;
  const Dp = p.D - 10.4, t0 = p.fr.pt + p.fr.ff, t = Math.min(sheetT(p, p.insertSides), Math.floor((t0 - 1.8) * 10) / 10), depth = pocketDepth(t);
  const box = [26, 6, Dp - 26, L - 6];
  if (box[2] - box[0] < 30 || box[3] - box[1] < 20) return null;
  const f = fan && sideFanPlace(p, L, fan);
  const holes = f ? [[f.cx - f.total / 2, f.cy - f.th / 2, f.cx + f.total / 2, f.cy + f.th / 2, 3]] : [];
  return { ...insertFor(box, p.insertRound, holes), kind: p.insertSides, t, depth, t0, f };
}
// A front blank's insert, or null: inside the rail screws, 4 mm in from the top and bottom (the blank thickens to keep 1.6 mm behind it).
function blankInsert(p, h) {
  if (!p.insertBlanks || p.insertBlanks === 'none') return null;
  const t = sheetT(p, p.insertBlanks);
  return { ...insertFor([-(p.ex - 6), 4, p.ex - 6, h - 4], Math.min(p.insertRound, 6)), kind: p.insertBlanks, t, depth: pocketDepth(t) };
}
// The sheet itself, for the preview: in the part's frame, its face at zTop.
function insertSheet(ins, zTop) {
  const [x0, y0, x1, y1] = ins.pocket, k = 0.1;
  return sections([x0, y0, x1, y1], [zTop - ins.t, zTop], (z, d) => {
    d.on(rr(x0 + k, y0 + k, x1 - k, y1 - k, Math.max(0, ins.r - k)));
    if (ins.f) d.off(rr(ins.f.cx - ins.f.total / 2 - k, ins.f.cy - ins.f.th / 2 - k, ins.f.cx + ins.f.total / 2 + k, ins.f.cy + ins.f.th / 2 + k, 3));
  }, 0.15, 0.1);
}
// Phase 1I: a lid for the top (coverTop: magnets). It drops into a rebate round the top frame's opening, LID.t deep
// and LID.ledge wide, flush with the top, and magnets in the ledge and the lid's corners hold it (more along any side
// over 150 mm). It carries the top's face: solid, vents or fans. Off by lifting at the finger notch; nothing to undo.
export const LID = { t: 3, ledge: 7, gap: 0.3, bed: 250 };
function lidMagnets(p, band) {
  const xo = frameXo(p), D = p.D, c = LID.ledge / 2, xs = [-(xo - band + c), xo - band + c], ys = [band - c, D - band + c];
  const out = [];
  for (const x of xs) for (const y of ys) out.push([x, y]);
  if (ys[1] - ys[0] > 150) for (const x of xs) out.push([x, D / 2 + (x > 0 ? 20 : 0)]); // (clear of the finger notch on the right)
  if (xs[1] - xs[0] > 150) for (const y of ys) out.push([0, y]);
  return out;
}
function topLid(p) {
  const xo = frameXo(p), D = p.D, band = p.fr.band || 24, L7 = LID.ledge, g = LID.gap, mp = magPocket(), face = p.faces.top;
  const box = [-xo + band - L7 + g, band - L7 + g, xo - band + L7 - g, D - band + L7 - g];
  const fs = p.faceFan, fpitch = fs + 6, nf = Math.max(1, Math.min(p.topFans || 3, 3, Math.floor((2 * (xo - band) - 8) / fpitch)));
  return sections(box, [0, 0.4, LID.t - mp.depth, LID.t], (z, d) => {
    const e = z < 0.4 ? 0.4 : 0;
    d.on(rr(box[0] + e, box[1] + e, box[2] - e, box[3] - e, 8 + L7 - g - e));
    if (face === 'vents') vents(at(p, 'top'), d, -xo + band + 6, band + 6, xo - band - 6, D - band - 6, 6, 3);
    else if (face === 'fan' && D - 2 * band >= fs + 4) for (let k = 0; k < nf; k++) fanHole(d, (k - (nf - 1) / 2) * fpitch, D / 2, fs);
    if (z > LID.t - mp.depth) for (const [x, y] of lidMagnets(p, band)) d.disc(x, y, mp.r, 0); // its magnets, facing the ledge's
  }, 0.15, 0.1);
}
// A rail washer plate (mixed hardware): an M4 nut sits on it behind the rail, so the clamp spreads over the rail's
// back instead of an M4 nut in a 6.4 mm hole. 16 × 12 × 2 mm, an M4 clearance hole, printed flat.
function railWasher(p) {
  const r = HEADS[p.threads.trim].clearance / 2;
  return sections([-8, -6, 8, 6], [0, 2], (z, d) => { d.on(rr(-8, -6, 8, 6, 2)); d.disc(0, 0, r, 0); }, 0.1, 0.06);
}
// The front blanks' sheets, one item a size.
function blankItems(p, fill) {
  const n = fill.filter((f) => f[5] === 'blank').length, bi = n && p.style === 'frame' ? blankInsert(p, RACK10.U - 0.8) : null;
  return bi ? [{ name: 'front blank (1U)', kind: bi.kind, t: bi.t, w: bi.w, h: bi.h, r: bi.r, holes: [], count: n }] : [];
}
const INSERT_TINT = { wood: '#8a4f2c', acrylic: '#9fc6d8', metal: '#b9bec4' };

// The art's colours as separate bodies, in the side panel's own frame (outside up), filling its 0.6 mm
// pocket exactly. Painted largest shape first: a shape inside another's hole comes later and wins, so
// the bodies meet without gaps or overlaps. Layer 0, the background, is whatever the others don't cover.
function panelArt(p, u, fan, part, face) {
  const L = u * RACK10.U, Dp = p.D - 10.4, ab = artBox(p, L, face), t0 = p.fr.pt + p.fr.ff, cut = Dp / 2; // the panel's face, level with the flanges
  if (!ab || sideInsert(p, L, fan, face)) return [];
  const map = ([x, y]) => [ab[0] + x * (ab[2] - ab[0]), ab[1] + y * (ab[3] - ab[1])];
  const all = p.art.layers.flatMap((ly, li) => ly.shapes.map((g) => ({ li, area: Math.abs(signedArea(g.outer)), outer: g.outer.map(map), holes: g.holes.map((h) => h.map(map)) }))).sort((a, b) => b.area - a.area);
  const f = fan && sideFanPlace(p, L, fan);
  const out = [];
  p.art.layers.forEach((ly, li) => {
    const m = sections([ab[0] - 1, ab[1] - 1, ab[2] + 1, ab[3] + 1], [t0 - ART_DEPTH, t0], (z, d) => {
      if (li === 0) { d.on(rr(...ab)); for (const g of all) { d.off(g.outer); for (const h of g.holes) d.on(h); } }
      else for (const g of all) { if (g.li === li) { d.on(g.outer); for (const h of g.holes) d.off(h); } else d.off(g.outer); }
      const F = 1e4; d.off(rr(-F, -F, ab[0], F)); d.off(rr(ab[2], -F, F, F)); d.off(rr(-F, -F, F, ab[1])); d.off(rr(-F, ab[3], F, F));
      if (f) d.off(rr(f.cx - f.total / 2, f.cy - f.th / 2, f.cx + f.total / 2, f.cy + f.th / 2, 3));
      if (part) { for (const y of panelJoinYs(p, L)) for (const dx of [-8, 8]) d.disc(cut + dx, y, 1.7, 0); d.off(part === 'front' ? rr(cut, -F, F, F) : rr(-F, -F, cut, F)); }
    }, 0.15, 0.08);
    if (m.indices.length) out.push({ mesh: m, colour: ly.colour });
  });
  return out;
}

function windowBox(p, L) {
  const Dp = p.D - 10.4, { bk } = p.fr, m = 24, y0 = bk + 12, y1 = L - bk - 12;
  return y1 - y0 >= 30 ? [m, y0, Dp - m, y1] : null;
}
const windowClips = ([x0, y0, x1, y1]) => {
  const out = [], n = Math.max(2, Math.round((x1 - x0) / 70));
  for (let k = 0; k <= n; k++) { const x = x0 + ((x1 - x0) * k) / n; out.push([x, y0 - 7], [x, y1 + 7]); }
  if (y1 - y0 > 90) for (const x of [x0 - 7, x1 + 7]) out.push([x, (y0 + y1) / 2]);
  return out;
};
// A clip that holds the acrylic sheet: a plate, with a 3 mm step under the screw end that stands on the frame beside the sheet.
// The window's cut in a panel or door (field thickness t0): the opening, then either the acrylic clips' holes or, for
// a printed pane, a 2.5 mm groove round it through the middle third so the clear body keys in.
const WIN_KEY = 2.5, winBand = (t0) => [Math.round(t0 * 0.35 * 10) / 10, Math.round(t0 * 0.65 * 10) / 10];
function windowCut(p, d, z, box, t0) {
  d.off(rr(...box, 8));
  const [b0, b1] = winBand(t0);
  if (p.windowFill === 'print') { if (z > b0 && z < b1) d.off(rr(box[0] - WIN_KEY, box[1] - WIN_KEY, box[2] + WIN_KEY, box[3] + WIN_KEY, 8 + WIN_KEY)); }
  else for (const [x, y] of windowClips(box)) d.disc(x, y, 1.4, 0);
}
// The printed pane: fills the opening flush both sides, with the key in the groove. xr: keep only x0..x1 (a split panel's half).
export function windowPane(box, t0, xr = null) {
  const [b0, b1] = winBand(t0), k = WIN_KEY;
  return sections([box[0] - k, box[1] - k, box[2] + k, box[3] + k], [0, b0, b1, t0], (z, d) => {
    d.on(rr(...box, 8));
    if (z > b0 && z < b1) d.on(rr(box[0] - k, box[1] - k, box[2] + k, box[3] + k, 8 + k));
    if (xr) { d.off(rr(box[0] - 10, box[1] - 10, xr[0], box[3] + 10)); d.off(rr(xr[1], box[1] - 10, box[2] + 10, box[3] + 10)); }
  }, 0.15, 0.1);
}
// A door's window: behind the lock, in front of the hinge.
export function doorWinBox(p, g) {
  const { bk } = p.fr, b = [g.lockX + 18, bk + 12, g.xa - DOOR.rK - 14, g.L - bk - 12];
  return b[2] - b[0] >= 40 && b[3] - b[1] >= 30 ? b : null;
}
function windowClip() {
  return sections([0, 0, 12, 22], [0, 0.4, 2.5, 5.5], (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    if (z < 2.5) d.on(rr(f, f, 12 - f, 22 - f, 3)); else d.on(rr(0, 0, 12, 10, 3));
    d.disc(6, 5, 1.7, 0);
  }, 0.1, 0.06);
}
// A quarter-turn latch: a knob with a D-shaft through the panel and the upright's flange, and a cam bar that
// slips onto the shaft behind the flange (one M3 screw holds it). Cam upright: it passes the flange's slot and
// the panel lifts off; a quarter turn and it's locked.
function latchKnob(p) {
  // Flush: the knob sits in a counterbore (so the shaft is that much shorter) and is slimmer, standing about 1 mm proud.
  const cb = p.flush ? Math.min(2, p.fr.pt - 1.6) : 0, H = p.flush ? 3 : 4;
  const T = p.fr.pt + p.fr.ff + 1 - cb;
  const knob = sections([-10, -10, 10, 10], [0, 0.4, H], (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    d.disc(0, 0, 9.5 - f); d.off(rr(-12, -12, 12, -7)); d.off(rr(-12, 7, 12, 12)); // a disc with two flats to grip
    d.on(rr(-1.2, -8.5, 1.2, 8.5, 1.2)); // a ridge that shows which way the cam points
  }, 0.08, 0.05);
  const shaft = sections([-4.2, -4.2, 4.2, 4.2], [H - 0.01, H + T], (z, d) => { d.disc(0, 0, 3.95); d.off(rr(3.1, -5, 6, 5)); d.disc(0, 0, 1.25, 0); }, 0.06, 0.04);
  const m = new Mesh(); m.append(knob); m.append(shaft); return m;
}
function latchCam() {
  return sections([-12.5, -4.5, 12.5, 4.5], [0, 0.4, 3], (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    d.on(rr(-12 + f, -4.3 + f, 12 - f, 4.3 - f, 4.3)); d.disc(0, 0, 4.15, 0); d.on(rr(3.3, -5, 6, 5)); d.disc(0, 0, 4.15, 0); d.on(rr(3.3, -5, 6, 5));
    d.off(rr(-13, 4.3, 13, 6)); d.off(rr(-13, -6, 13, -4.3));
  }, 0.08, 0.05);
}
// A side door, as it prints (outside up, in the side panel's own frame: x along the depth from the front, y up
// the section, z out). It fills the opening between the front and back flanges, its face level with theirs, with
// the same rounded edges. Hinged at the back (x high here; the left door is built mirrored): knuckles inside its
// thickness, alternating with the hinge strip's, on a 1.75 mm filament pin. At the front a quarter-turn twist
// lock: the knob sits flush in a counterbore, its cam turns under the front flange and holds the door shut.
const DOOR = { rK: 3.2, pin: 1.05, gap: 0.4, segs: 5, cam: 13, camT: 3.2 };
const doorGeom = (p, u, joints) => {
  const L = u * RACK10.U, Dp = p.D - 10.4, tb = p.fr.pt, t0 = tb + p.fr.ff, e0 = p.fr.fl - 5.2 + 0.3;
  const xa = Dp - e0 - DOOR.rK - 0.5, za = t0 - DOOR.rK - 0.3; // the hinge axis: just in front of the back flange, inside the face
  const lo = (joints[0] ? jointS(L) : p.fr.bk) + 1, hi = L - (joints[1] ? jointS(L) : p.fr.bk) - 1, sl = (hi - lo) / DOOR.segs;
  const segs = Array.from({ length: DOOR.segs }, (_, k) => [lo + k * sl + (k ? DOOR.gap / 2 : 0), lo + (k + 1) * sl - (k < DOOR.segs - 1 ? DOOR.gap / 2 : 0)]);
  const lockYs = L > 8 * RACK10.U ? [L / 3, (2 * L) / 3] : [L / 2], lockX = e0 + DOOR.gap + 10.6; // the knob's counterbore (10.2) stays on the door; the cam (13) still reaches 2 mm under the front flange
  return { L, Dp, tb, t0, e0, xa, za, segs, lockYs, lockX };
};
const circleCuts = (zc, r, from, to) => { const out = []; for (let z = zc - r; z <= zc + r + 1e-9; z += 0.25) if (z > from && z < to) out.push(Math.round(z * 100) / 100); return out; };
const halfChord = (r, dz) => (Math.abs(dz) < r ? Math.sqrt(r * r - dz * dz) : 0);
function sideDoor(p, u, joints, hingeHigh, face) {
  const g = doorGeom(p, u, joints), { L, Dp, t0, e0, xa, za, segs, lockYs, lockX } = g, { rK, pin, gap, cam, camT } = DOOR;
  const cb = p.flush ? 2 : 0, x0 = e0 + gap, wb = face === 'window' && doorWinBox(p, g);
  const cuts = [...new Set([0, 0.4, camT, ...(wb && p.windowFill === 'print' ? winBand(t0) : []), ...circleCuts(za, rK, 0, t0), ...CH.map((c) => t0 - c).filter((z) => z > 0), ...(cb ? [t0 - cb] : []), t0])].sort((a, b) => a - b);
  const m = sections([0, 0, Dp, L], cuts, (z, d) => {
    const k = z > t0 - depthOf(EDGE_R) ? ch(t0 - z) : 0; // its face's edges rounded like the panels'
    d.on(rr(x0 + k, Math.max(k, z < 0.4 ? 0.4 : 0), xa - rK - gap, L - Math.max(k, z < 0.4 ? 0.4 : 0), 2));
    const hw = halfChord(rK, z - za);
    segs.forEach(([y0, y1], i) => { if (i % 2 === 0) { d.on(rr(xa - rK - gap - 0.01, y0, xa, y1)); if (hw) d.on(rr(xa - hw, y0, xa + hw, y1)); } }); // its knuckles
    const hp = halfChord(pin, z - za); if (hp) d.off(rr(xa - hp, -1, xa + hp, L + 1)); // the pin's hole, all the way through
    if (face === 'vents') vents(at(p, 'side'), d, x0 + 14, p.fr.bk + 8, xa - rK - 14, L - p.fr.bk - 8, 6, 3);
    if (wb) windowCut(p, d, z, wb, t0);
    for (const y of lockYs) {
      d.disc(lockX, y, 13.5, 1); // solid round the lock (no vents there)
      d.disc(lockX, y, 4.3, 0); // the knob's shaft
      if (cb && z > t0 - cb) d.disc(lockX, y, 10.2, 0); // the knob's counterbore: it sits flush
      if (z < camT) d.disc(lockX, y, cam, 0); // room underneath for the cam to turn
    }
    d.off(rr(-1, -1, x0, L + 1)); // nothing past the door's front edge: it would run into the upright
  }, 0.15, 0.1, { loft: SMOOTH.edges });
  return hingeHigh ? m : flip(turn(m, (x, y, zz) => [Dp - x, y, zz]));
}
// The hinge strip: under the back flange (bolted through its holes), with the knuckles between the door's.
function doorHinge(p, u, joints, hingeHigh) {
  const g = doorGeom(p, u, joints), { L, Dp, tb, t0, e0, xa, za, segs } = g, { rK, pin } = DOOR, inset = p.fr.hy - 5.2;
  const ylo = segs[0][0], yhi = segs[segs.length - 1][1];
  const cuts = [...new Set([0, 0.4, tb, ...circleCuts(za, rK, 0, t0), za + rK])].sort((a, b) => a - b);
  const m = sections([xa - rK - 1, ylo - 1, Dp, yhi + 1], cuts, (z, d) => {
    if (z < tb) d.on(rr(Dp - e0 + 0.3, ylo, Dp - 2, yhi, 2)); // the plate, under the flange
    const hw = halfChord(rK, z - za);
    segs.forEach(([y0, y1], i) => { if (i % 2) { if (z < tb) d.on(rr(xa, y0, Dp - e0 + 0.31, y1)); if (hw) d.on(rr(xa - hw, y0, xa + hw, y1)); if (z >= tb && z < za) d.on(rr(xa, y0, xa + hw, y1)); } });
    const hp = halfChord(pin, z - za); if (hp) d.off(rr(xa - hp, ylo - 2, xa + hp, yhi + 2));
    if (z < tb) for (const y of flangeXs(L)) if (y > ylo + 4 && y < yhi - 4) d.disc(Dp - inset, y, insertR(p), 0);
  }, 0.12, 0.08, { loft: SMOOTH.edges });
  return hingeHigh ? m : flip(turn(m, (x, y, zz) => [Dp - x, y, zz]));
}

// The strip behind a split side panel's seam, flat: 30 mm wide, bolted to both halves.
function panelJoin(p, u) {
  const L = u * RACK10.U, ys = panelJoinYs(p, L), y0 = Math.max(0.5, ys[0] - 10), y1 = Math.min(L - 0.5, ys[ys.length - 1] + 10);
  return sections([0, y0, 30, y1], [0, 0.4, 3], (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    d.on(rr(f, y0 + f, 30 - f, y1 - f, 3));
    for (const y of ys) for (const x of [7, 23]) d.disc(x, y, 1.7, 0);
  }, 0.1, 0.06);
}
// Where side fans go on a panel (x from the front of the panel, y up), kept
// clear of the corner brackets and the screw lines; null if they don't fit.
function sideFanPlace(p, L, fan) {
  const Dp = p.D - 10.4, { bk } = p.fr, s = fan.size + 6;
  const x0 = 26, x1 = Dp - 26, y0 = bk + 6, y1 = L - bk - 6;
  // As many across the depth as fit; the rest wrap into more rows up the panel. Asked for more than the
  // panel holds, it takes as many as fit (n), and the notes say so.
  const across = Math.floor((x1 - x0) / s), up = Math.floor((y1 - y0) / s), n = Math.min(fan.count, across * up);
  if (n < 1) return null;
  const cols = Math.min(n, across), rows = Math.ceil(n / cols);
  const total = cols * s, th = rows * s;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const cx = clamp(fan.at * Dp, x0 + total / 2, x1 - total / 2), cy = clamp(fan.h * L, y0 + th / 2, y1 - th / 2);
  const pts = [];
  for (let r = 0; r < rows; r++) { const m = Math.min(cols, n - r * cols); for (let k = 0; k < m; k++) pts.push([cx - m * s / 2 + s / 2 + k * s, cy - th / 2 + s / 2 + r * s]); }
  return { s, total, th, cx, cy, pts, n };
}

// Where a section joint's splice plate sits, across the depth: inside the flange, behind it (clear of
// the rail's nuts), so from outside the flange runs on unbroken and nothing stands proud.
const spliceBand = (p) => [p.fr.rt + 5.5, p.fr.fl - 1.5];
const spliceT = (p) => Math.max(3, p.fr.pt);
// The splice you see: a plate inlaid flush in a pocket in the flanges' outside face, across the joint,
// over the hidden backing plate (the bolts clamp plate, flange and backer together).
const INLAY_D = 2;
const inlayBand = (p) => [Math.max(1.5, p.fr.hy - 9), Math.min(p.fr.fl - 1.5, p.fr.hy + 9)];
// Wrapped splices: the splice plate you see runs forward to the corner, turns it on the panels' 2.4 mm round and
// carries on flush onto the front (and back): half, a leg over each panel ear (clear of the rail screws); full, a
// 22 mm belt right across, the rail screws through it. The panels are pocketed 2 mm where it lies, notched at the corner.
const BELT_H = 11;
// A splice wrap runs across the front panels, so asking for one puts the panels over the frame (overlay), not inset in it.
const wrapAsked = (o) => o.style !== 'box' && ['half', 'full'].includes(o.spliceWrap);
export const wrapOn = (p) => p.spliceWrap !== 'side' && p.style === 'frame' && p.frontFlush && !insetOn(p) && p.boxes.length > 1;
const wrapLeg = (p) => frameXo(p) - p.hx - 3.3 - 0.8; // the ear leg, from the outside face: stops short of the screw slots
export function rackJoints(p) {
  const out = []; let z = p.fr.ft;
  p.boxes.forEach((u, i) => { z += u * RACK10.U; if (i < p.boxes.length - 1) out.push({ z, s: Math.min(u * RACK10.U, p.boxes[i + 1] * RACK10.U) >= 80 ? 40 : 20 }); });
  return out;
}
// Pockets in a front or back panel (local x across, y up from its bottom edge at world height z0w) for the joints it crosses.
function wrapGrooves(p, z0w, h, covered = () => true) {
  if (!wrapOn(p)) return [];
  const hw = panelHalf(p), C1 = wrapLeg(p), g = [];
  rackJoints(p).forEach(({ z, s }, j) => {
    if (!covered(j)) return;
    const y0 = z - s - 0.2 - z0w, y1 = z + s + 0.2 - z0w;
    if (y1 <= 0 || y0 >= h) return;
    g.push({ x0: hw - 2.2, x1: hw + 1, y0, y1, depth: Infinity }, { x0: -hw - 1, x1: -hw + 2.2, y0, y1, depth: Infinity }); // the corner: the side piece runs over the panel's edge
    if (p.spliceWrap === 'half') g.push({ x0: hw - C1 - 0.2, x1: hw + 1, y0, y1, depth: INLAY_D }, { x0: -hw - 1, x1: -hw + C1 + 0.2, y0, y1, depth: INLAY_D });
    else { const b0 = z - BELT_H - 0.2 - z0w, b1 = z + BELT_H + 0.2 - z0w; if (b1 > 0 && b0 < h) g.push({ x0: -hw - 1, x1: hw + 1, y0: b0, y1: b1, depth: INLAY_D }); }
  });
  return g;
}
// The side piece: the inlay run forward by T (the panel's thickness in front of the rail; 0 where no panel covers the
// joint), its front edge on the 2.4 mm round. Local x across the depth from the front face, y up, z: 0 inside, 2 outside.
function wrapSide(p, s, T) {
  const [, b1] = inlayBand(p), A1 = T + b1, hx = T + p.fr.hy;
  const cuts = [...new Set([0, 0.4, INLAY_D - 0.6, INLAY_D, ...CH.filter((c) => c < INLAY_D).map((c) => INLAY_D - c)])].sort((a, b) => a - b);
  return sections([0, 0, A1, 2 * s], cuts, (z, d) => {
    const zo = INLAY_D - z, f = z < 0.4 ? 0.4 : zo < 0.6 ? 0.6 : 0;
    d.on(rr(Math.max(f, chR(zo, EDGE_R)), f, A1 - f, 2 * s - f, 1));
    for (const y of s > 25 ? [s - 30, s - 10, s + 10, s + 30] : [s - 10, s + 10]) d.disc(hx, y, 1.7, 0);
  }, 0.1, 0.06, { loft: SMOOTH.edges });
}
// A flat 2 mm strip on the front or back: the half wrap's ear leg (w = leg − 2) or the full belt (holes for the rail
// screws). seam: which ends butt a side piece (left, right), left square.
function wrapStrip(w, h, holes = [], seam = [false, true]) {
  return sections([0, 0, w, h], [0, 0.4, INLAY_D - 0.6, INLAY_D], (z, d) => {
    const zo = INLAY_D - z, f = z < 0.4 ? 0.4 : zo < 0.6 ? 0.6 : 0;
    d.on(rr(seam[0] ? 0 : f, f, seam[1] ? w : w - f, h - f, 0.5));
    for (const [x, y] of holes) d.disc(x, y, 3.3, 0);
  }, 0.1, 0.06);
}
function inlaySplice(p, s) {
  const [b0, b1] = inlayBand(p), w = b1 - b0, hx = p.fr.hy - b0;
  return sections([0, 0, w, 2 * s], [0, 0.4, INLAY_D - 0.6, INLAY_D], (z, d) => {
    const f = z < 0.4 ? 0.4 : z > INLAY_D - 0.6 ? 0.6 : 0; // its face's edge eased
    d.on(rr(f, f, w - f, 2 * s - f, 2));
    for (const y of s > 25 ? [s - 30, s - 10, s + 10, s + 30] : [s - 10, s + 10]) d.disc(hx, y, 1.7, 0);
  }, 0.1, 0.06);
}
// Between sections, the backer: a plate inside the flange, in the side panel's plane (the panels are notched round it).
function railSplice(p, s) {
  const [y0, y1] = spliceBand(p), w = y1 - y0, hx = p.fr.hy - y0;
  return sections([0, 0, w, 2 * s], [0, 0.4, spliceT(p)], (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    d.on(rr(f, f, w - f, 2 * s - f, 2));
    for (const y of s > 25 ? [s - 30, s - 10, s + 10, s + 30] : [s - 10, s + 10]) d.disc(hx, y, insertR(p), 0);
  }, 0.1, 0.06);
}
// The joint's splice height for a section of L mm (at least the plate's half length either side of the joint).
const jointS = (L) => (L >= 80 ? 40 : 20);
// A splice plate across a split end frame's seam, flat: it sits in a pocket in the frame's outside face, flush.
function splice(p, s) {
  return sections([0, 0, 20, 2 * s], [0, 0.4, p.fr.sp], (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    d.on(rr(f, f, 20 - f, 2 * s - f, 3));
    for (const y of s > 25 ? [s - 30, s - 10, s + 10, s + 30] : [s - 10, s + 10]) d.disc(10, y, insertR(p), 0);
  }, 0.1, 0.06);
}

function framedRack(p, place, roles) {
  const xo = frameXo(p), { ft, hy } = p.fr, D = p.D, total = p.boxes.reduce((a, u) => a + u, 0);
  const k = `${D}|${p.hole}|${looks(p)}|${p.badge}|${p.heavy}${p.extreme ? 'x' : ''}|${p.gussets}|${frameExt(p).join(',')}`;
  const kf = `${D}|${p.hole}|${looks(p)}|${p.heavy}${p.extreme ? 'x' : ''}|${p.gussets}|${frameExt(p).join(',')}`; // end frames and uprights don't carry the badge: typing one rebuilds only the side panels
  const split = splitFrame(p), wide = 2 * xo > 256, topSplices = new Mesh();
  const halves = (split ? ['front', 'back'] : ['']).flatMap((a) => (wide ? ['left', 'right'].map((b) => [a, b].filter(Boolean).join('-')) : [a])).map((h) => h || null);
  const bottoms = halves.map((h) => memo(`fb|${kf}|${h}`, () => endFrame(p, false, h))), tops = halves.map((h) => memo(`ft|${kf}|${p.handle}|${h}`, () => endFrame(p, true, h)));
  halves.forEach((h, i) => place(bottoms[i], `end-frame-bottom${h ? `-${h}` : ''}`));
  halves.forEach((h, i) => place(tops[i], `end-frame-top${h ? `-${h}` : ''}`));
  const topUse = new Mesh(); for (const t of tops) topUse.append(turn(t, (x, y, zz) => [x, p.D - y, -zz])); // turned over: brackets down, MINT MOTIVE up
  for (const b of bottoms) roles.accent.append(b);
  if (split || wide) {
    // Splice plates across the seams, set into pockets in the frames' outside faces: flush, under the bottom one and on top of the top one.
    const sp = memo(`spl|20|${p.heavy}${p.extreme ? 'x' : ''}|${p.fastening}`, () => splice(p, 20)), cy = endCut(p), t = p.fr.sp;
    const n = (split ? 4 : 0) + (wide ? 4 : 0);
    for (let j = 1; j <= n; j++) place(sp, `end-frame-splice-${j}`);
    if (wide) for (const y of [12, D - 12]) { // across the middle seam: the plate turned a quarter (its holes at x ±10)
      const q = turn(sp, (x, yy, zz) => [yy - 20, y - 10 + x, zz]);
      roles.accent.append(new Mesh().append(q)); topSplices.append(new Mesh().append(q).translate(0, 0, -t));
    }
  }
  if (split) {
    const sp = memo(`spl|20|${p.heavy}${p.extreme ? 'x' : ''}|${p.fastening}`, () => splice(p, 20)), cy = endCut(p), t = p.fr.sp;
    for (const sx of [-1, 1]) {
      roles.accent.append(new Mesh().append(sp).translate(sx * (xo - 12) - 10, cy - 20, 0)); // in the bottom frame's pockets, flush underneath
      topSplices.append(new Mesh().append(sp).translate(sx * (xo - 12) - 10, cy - 20, -t)); // and the top one's, flush on top
    }
  }
  let z = ft; const zBack = ft;
  const slots = [], sideFanSkipped = [], sideFanShort = [];
  let sideFans = 0, latches = 0, doors = 0;
  const windows = [], inserts = [];
  p.boxes.forEach((u, i) => {
    const L = u * RACK10.U, jl = i > 0, jh = i < p.boxes.length - 1;
    const upA = memo(`up|${kf}|${u}|${jl}|${jh}`, () => upright(p, u, [jl, jh])), upB = memo(`up|${kf}|${u}|${jh}|${jl}`, () => upright(p, u, [jh, jl])); // B is used upside down
    // Side panels: right (a) and left (b), each with its fans if asked for. The left one is the same part
    // turned round, so its fan position is mirrored front to back to land in the same place.
    const sf = p.sideFan, here = sf && (sf.where === 'all' || (sf.where === 'top' ? i === p.boxes.length - 1 : i === 0));
    const fanA = here && sf.sides !== 'left' ? sf : null, fanB = here && sf.sides !== 'right' ? { ...sf, at: 1 - sf.at } : null;
    const artA = Boolean(p.art) && p.artSides !== 'left', artB = Boolean(p.art) && p.artSides !== 'right';
    const joints = [i > 0, i < p.boxes.length - 1];
    const sideKey = (f, face, art) => `sp|${p.door}|${k}|${u}|${face}|${art ? 'art' : ''}|${f ? `${f.size}|${f.count}|${f.at}|${f.h}` : ''}|${joints.join()}`;
    // Split side panels: each side is a front and a back half (the Mesh of both, for the picture), plus a join strip.
    // Panel a is the right side, b the left; each side's face is its own (none: no panel there).
    const pSplit = panelSplit(p), sideOf = (f, face, art) => { if (!pSplit) return [memo(sideKey(f, face, art), () => sidePanel2(p, u, f, null, face, art, joints))]; return ['front', 'back'].map((h) => memo(`${sideKey(f, face, art)}|${h}`, () => sidePanel2(p, u, f, h, face, art, joints))); };
    // Doors: a side that opens is one door per section (in the opening between the flanges), not a panel.
    const doorA = p.panels && p.faces.right !== 'none' && ['right', 'both'].includes(p.door), doorB = p.panels && p.faces.left !== 'none' && ['left', 'both'].includes(p.door);
    const doorOf = (high, face) => [memo(`door|${k}|${u}|${joints}|${high}|${face}`, () => sideDoor(p, u, joints, high, face))];
    const piecesA = p.panels && p.faces.right !== 'none' ? (doorA ? doorOf(true, p.faces.right) : sideOf(fanA, p.faces.right, artA)) : null, piecesB = p.panels && p.faces.left !== 'none' ? (doorB ? doorOf(false, p.faces.left) : sideOf(fanB, p.faces.left, artB)) : null;
    // Panel art: its colours as their own parts (one filament each), laid in the side panels' pockets.
    const artOf = (f, face, art) => (art ? (pSplit ? ['front', 'back'] : [null]).map((h) => memo(`art|${sideKey(f, face, art)}|${h}`, () => panelArt(p, u, f, h, face))) : []);
    const artSets = { a: p.panels && p.faces.right !== 'none' ? artOf(fanA, p.faces.right, artA) : [], b: p.panels && p.faces.left !== 'none' ? artOf(fanB, p.faces.left, artB) : [] };
    const both = (ps) => { const m = new Mesh(); for (const q of ps) m.append(q); return m; };
    const panelA = piecesA && both(piecesA), panelB = piecesB && both(piecesB);
    const fp = sf && (fanA || fanB) ? sideFanPlace(p, L, sf) : null;
    if (sf && (fanA || fanB) && !fp) sideFanSkipped.push(u);
    else if (fp && fp.n < sf.count) sideFanShort.push([u, fp.n]);
    if (p.panels && fp) sideFans += ((fanA && !doorA ? 1 : 0) + (fanB && !doorB ? 1 : 0)) * fp.n;
    const tag = p.boxes.length > 1 ? `-s${i + 1}` : '';
    const wUp = frameXo(p) - p.ex, printUp = (m) => (insetOn(p) ? turn(m, (x, y, zz) => [x, zz, wUp - y]) : m); // inset: printed on its flange, so the lip lies on the bed
    for (let j = 0; j < 4; j++) place(printUp(j < 2 ? upA : upB), `upright${tag}-${j + 1}`);
    // A window (fixed panel or door; box in the part's own x, y): the acrylic sheet and its clips, or the printed clear pane.
    const toSide = (m, sx) => (sx > 0 ? turn(m, (x, y, zz) => [xo - p.fr.ff - p.fr.pt + zz, 5.2 + x, z + y]) : turn(m, (x, y, zz) => [-(xo - p.fr.ff - p.fr.pt + zz), D - 5.2 - x, z + y]));
    const addWindow = (wb, side, sx, art, t0door) => {
      if (!wb) return;
      if (p.windowFill === 'print') {
        const t0 = t0door ?? ((p.panelStyle === 'light' && !art ? Math.max(1.8, p.fr.pt * 0.6) : p.fr.pt) + p.fr.ff), cut = (p.D - 10.4) / 2;
        const halves = !t0door && panelSplit(p) && wb[0] < cut && wb[2] > cut ? [['-front', [-1e4, cut]], ['-back', [cut, 1e4]]] : [['', null]];
        for (const [h, xr] of halves) {
          const pane = memo(`pane|${wb.join(',')}|${t0}|${xr ? xr[0] : ''}`, () => windowPane(wb, t0, xr));
          place(pane, `window-pane${tag}-${side}${h}`);
          roles.glass.append(toSide(pane, sx));
        }
        windows.push({ print: true, w: Math.round(wb[2] - wb[0]), h: Math.round(wb[3] - wb[1]) });
        return;
      }
      const cl = memo('wclip', () => windowClip()), n = windowClips(wb).length;
      for (let j = 1; j <= n; j++) place(cl, `window-clip${tag}-${side}-${j}`);
      const xin = xo - p.fr.ff - p.fr.pt - 3, y0 = 5.2 + wb[0] - 8, y1 = 5.2 + wb[2] + 8;
      const sheet = extrudePolygon([[y0, z + wb[1] - 8], [y1, z + wb[1] - 8], [y1, z + wb[3] + 8], [y0, z + wb[3] + 8]], [], 0, 3);
      roles.glass.append(sx > 0 ? turn(sheet, (a, b, c) => [xin + c, a, b]) : flip(turn(sheet, (a, b, c) => [-(xin + c), D - a, b])));
      windows.push([Math.round(wb[2] - wb[0] + 16), Math.round(wb[3] - wb[1] + 16)]);
    };
    for (const [side, pieces, face, sx] of [['a', piecesA, p.faces.right, 1], ['b', piecesB, p.faces.left, -1]]) {
      if (!pieces) continue;
      if (side === 'a' ? doorA : doorB) {
        place(pieces[0], `side-door${tag}-${side}`);
        const hg = memo(`dhinge|${k}|${u}|${joints}|${side === 'a'}`, () => doorHinge(p, u, joints, side === 'a'));
        place(hg, `door-hinge${tag}-${side}`);
        roles.rail.append(sx > 0 ? turn(hg, (x, y, zz) => [xo - p.fr.ff - p.fr.pt + zz, 5.2 + x, z + y]) : turn(hg, (x, y, zz) => [-(xo - p.fr.ff - p.fr.pt + zz), D - 5.2 - x, z + y]));
        latches += doorGeom(p, u, joints).lockYs.length; doors++;
        if (face === 'window') { const g = doorGeom(p, u, joints), b = doorWinBox(p, g); if (b) addWindow(side === 'a' ? b : [g.Dp - b[2], b[1], g.Dp - b[0], b[3]], side, sx, false, g.t0); }
        continue;
      }
      if (pSplit) {
        pieces.forEach((q, j) => place(q, `side-panel${tag}-${side}-${j ? 'back' : 'front'}`));
        const jn = memo(`pjoin|${u}|${p.heavy}${p.extreme ? 'x' : ''}`, () => panelJoin(p, u)); place(jn, `side-panel-join${tag}-${side}`);
        const cut = (p.D - 10.4) / 2, xi = xo - p.fr.ff - p.fr.pt; // the strip sits just inside the panel, over the seam
        roles.panel.append(sx > 0 ? turn(jn, (x, y, zz) => [xi - zz, 5.2 + cut - 15 + x, z + y]) : turn(jn, (x, y, zz) => [-(xi - zz), D - 5.2 - cut + 15 - x, z + y]));
      } else place(pieces[0], `side-panel${tag}-${side}`);
      const si = sideInsert(p, L, side === 'a' ? fanA : fanB, face); // phase 1E: its sheet, cut not printed (shown in place)
      if (si) {
        inserts.push({ name: `side panel (${u}U)`, kind: si.kind, t: si.t, w: si.w, h: si.h, r: si.r, holes: si.holes, count: 1 });
        const key = `art:${INSERT_TINT[si.kind]}`; roles[key] ||= new Mesh();
        roles[key].append(toSide(memo(`isheet|${k}|${u}|${si.pocket.join()}|${si.f ? si.f.cx : ''}`, () => insertSheet(si, si.t0)), sx));
      }
      addWindow(face === 'window' && windowBox(p, L), side, sx, side === 'a' ? artA : artB, null);
      if (p.panelFix === 'latches') for (const y of flangeXs(L)) if (y > p.fr.bk + 2 && y < L - p.fr.bk - 2 && !(joints[0] && y < jointS(L) + 2) && !(joints[1] && y > L - jointS(L) - 2)) latches += 2; // front and back flange, clear of the joints' splices
    }
    // Uprights: front right, back left, front left, back right (all the same part, turned).
    roles.rail.append(turn(upA, (x, y, zz) => [p.ex + y, zz, z + x]));
    roles.rail.append(turn(upA, (x, y, zz) => [-(p.ex + y), D - zz, z + x]));
    roles.rail.append(turn(upB, (x, y, zz) => [-(p.ex + y), zz, z + L - x]));
    roles.rail.append(turn(upB, (x, y, zz) => [p.ex + y, D - zz, z + L - x]));
    if (panelA) roles.panel.append(turn(panelA, (x, y, zz) => [xo - p.fr.ff - p.fr.pt + zz, 5.2 + x, z + y]));
    if (panelB) roles.panel.append(turn(panelB, (x, y, zz) => [-(xo - p.fr.ff - p.fr.pt + zz), D - 5.2 - x, z + y]));
    for (const [side, sets, sx] of [['a', artSets.a, 1], ['b', artSets.b, -1]]) sets.forEach((bodies, h) => bodies.forEach((b, n) => {
      place(b.mesh, `panel-art${tag}-${side}${sets.length > 1 ? (h ? '-back' : '-front') : ''}-${n + 1}-c${b.colour.slice(1)}`);
      const key = `art:${b.colour}`; roles[key] ||= new Mesh();
      roles[key].append(sx > 0 ? turn(b.mesh, (x, y, zz) => [xo - p.fr.ff - p.fr.pt + zz, 5.2 + x, z + y]) : turn(b.mesh, (x, y, zz) => [-(xo - p.fr.ff - p.fr.pt + zz), D - 5.2 - x, z + y]));
    }));
    slots.push([z, u]);
    if (p.braces) {
      const bu = Math.min(u, 2), br = memo(`brace|${looks(p)}|${bu}|${p.heavy}${p.extreme ? 'x' : ''}`, () => frontPanel(p, bu, 'brace'));
      place(br, `back-brace${tag}`);
      const z0 = z + Math.floor((u - bu) / 2) * RACK10.U + 0.4;
      // Face down → on the back rails, facing out: (x, y, z) → (x, D + 4 − z, y + z0), half a turn from the front panels.
      roles.accent.append(turn(br, (x, y, zz) => [x, D + 4 - zz, y + z0]));
    }
    if (p.covered && p.faces.back !== 'modules') {
      // The back: a cover on the back rails, facing out (half a turn from the front panels): solid, vented, a mounting grid or fans.
      const fb = p.faces.back, kind = `back${fb === 'cover' ? '' : `-${fb}`}${i === 0 && p.glands ? '-glands' : ''}`, gr = wrapGrooves(p, z + 0.4, u * RACK10.U - 0.8), bc = memo(`bc|${kind}|${u}|${p.heavy}${p.extreme ? 'x' : ''}|${p.glands}|${p.glandSize}|${looks(p)}|${JSON.stringify(gr)}`, () => frontPanel(p, u, kind, null, gr));
      place(bc, `back-${fb === 'cover' ? 'cover' : fb === 'mount' ? 'mount-wall' : fb}${tag}`);
      roles.panel.append(turn(bc, (x, y, zz) => [x, D + backT(p) - zz, y + z + 0.4]));
    }
    z += L;
    if (i < p.boxes.length - 1) {
      const s = Math.min(L, p.boxes[i + 1] * RACK10.U) >= 80 ? 40 : 20, sp = memo(`rspl|${s}|${p.heavy}${p.extreme ? 'x' : ''}|${p.D}|${p.fastening}`, () => railSplice(p, s));
      const inl = memo(`ispl|${s}|${p.heavy}${p.extreme ? 'x' : ''}`, () => inlaySplice(p, s));
      for (let j = 0; j < 4; j++) { if (!wrapOn(p)) place(inl, `splice-${i + 1}-${j + 1}`); place(sp, `splice-backer-${i + 1}-${j + 1}`); } // wrapped: the pieces go on once the front is laid out
      // The splice you see: inlaid flush in the flanges' outside face. The backer: inside the flange, in the side
      // panels' plane, hidden. (x, y, z) → (out, along the depth, up); the turns that come out mirrored get their faces flipped back.
      const [y0] = spliceBand(p), xi = xo - p.fr.ff - spliceT(p), [b0] = inlayBand(p), xs = xo - INLAY_D;
      for (const [sx, front] of [[1, true], [-1, true], [1, false], [-1, false]]) {
        const keep = sx > 0 === front;
        const t = turn(sp, (x, y, zz) => [sx * (xi + zz), front ? y0 + x : D - y0 - x, z - s + y]);
        roles.accent.append(keep ? t : flip(t));
        if (wrapOn(p)) continue;
        const v = turn(inl, (x, y, zz) => [sx * (xs + zz), front ? b0 + x : D - b0 - x, z - s + y]);
        roles.accent.append(keep ? v : flip(v));
      }
    }
  });
  roles.accent.append(new Mesh().append(topUse).translate(0, 0, z + ft));
  if (p.coverTop === 'magnets') { // the lid: printed outside down, like the frame; in the rack its outside is level with the frame's
    const lidM = memo(`lid|${looks(p)}|${p.D}|${xo}`, () => topLid(p));
    place(lidM, 'top-lid');
    roles.panel.append(turn(lidM, (x, y, zz) => [x, p.D - y, z + ft - zz]));
  }
  if (topSplices.indices.length) roles.accent.append(topSplices.translate(0, 0, z + ft));
  if (p.handle) {
    const hd = handle(p, handleSpan(p));
    place(hd.mesh, 'handle-a'); place(hd.mesh, 'handle-b');
    for (const sx of [-1, 1]) roles.accent.append(turn(hd.mesh, (x, y, zz) => [sx * (xo - 12) - hd.T / 2 + zz, D / 2 + x, z + ft + y]));
  }
  // Modular back: small rear panels on the back rails, top first (one run of units: the splices keep the hole spacing).
  const backMods = p.covered && p.faces.back === 'modules' ? backPlan(p, p.boxes.reduce((a, u) => a + u, 0)) : [];
  { let zt = z; backMods.forEach((m, j) => {
    zt -= m.u * RACK10.U;
    const gr = wrapGrooves(p, zt + 0.4, m.u * RACK10.U - 0.8), bm = memo(`bm|${m.t}|${m.n}|${m.u}|${p.heavy}${p.extreme ? 'x' : ''}|${looks(p)}|${JSON.stringify(gr)}`, () => frontPanel(p, m.u, `back-mod`, m, gr));
    place(bm, `rear-${m.t}-${m.u}u-${j + 1}`);
    roles.panel.append(turn(bm, (x, y, zz) => [x, D + backT(p) - zz, y + zt + 0.4]));
  }); }
  const holes = flangeXs(RACK10.U * Math.max(...p.boxes)).length;
  // Power boards on the back. Upright: standing in a bottom bracket up a back rail, a top bracket gripping it
  // near its top end (on whichever rail hole is nearest). Across: lying across the back, its ends in a cup
  // bolted to each back rail; that suits boards about as long as the rack is wide (232–257 mm).
  const pdus = [], off = p.covered ? backT(p) + (p.faces.back === 'mount' ? 1 : 0) : 0; // outside the back cover
  const railHoles = []; for (let k = 0; k < total; k++) for (const h of RACK10.unitHoles) railHoles.push(ft + k * RACK10.U + h);
  const zb = ft + RACK10.unitHoles[1] - PDU_BOLT, boardTop = zb + 3 + p.pduL;
  const topHole = railHoles.filter((h) => { const zt = h - PDU_BOLT; return zt <= boardTop - 10 && zt >= boardTop - PDU_Z && zt + PDU_Z <= z + 0.01; }).pop();
  const crossIn = p.hx - (PDU_Z - PDU_BOLT) + 8, crossOut = p.hx + PDU_BOLT - 3; // the board's half length must land between these
  const across = p.pduL / 2 >= crossIn && p.pduL / 2 <= crossOut;
  const mount = p.pduMount === 'auto' ? (topHole !== undefined ? 'upright' : across ? 'across' : 'upright') : p.pduMount;
  const fits = mount === 'upright' ? topHole !== undefined : across;
  const lo = memo(`pdub|${p.pduW}|${p.pduH}`, () => pduBracket(p, true)), hi = memo(`pdut|${p.pduW}|${p.pduH}`, () => pduBracket(p, false));
  const board = (x0, x1, y0, y1, z0, z1) => roles.gear.append(extrudePolygon([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], [], z0, z1));
  let nextAcross = 0;
  for (let n = 0; n < p.pdu && fits; n++) {
    if (mount === 'upright') {
      // Left first, then right (mirrored).
      const sx = n === 0 ? -1 : 1, zt = topHole - PDU_BOLT;
      place(lo, `pdu-bracket-bottom-${n + 1}`); place(hi, `pdu-bracket-top-${n + 1}`);
      const at = (m, z0) => { const t = turn(m, (x, y, zz) => [sx * (p.hx - x), D + off + y, z0 + zz]); return sx > 0 ? flip(t) : t; };
      roles.accent.append(at(lo, zb)); roles.accent.append(at(hi, zt));
      const x0 = sx * (p.hx - 13), x1 = sx * (p.hx - 13 - p.pduW);
      board(Math.min(x0, x1), Math.max(x0, x1), D + off + 4.5, D + off + 4 + p.pduH, zb + 3, zb + 3 + p.pduL);
    } else {
      // Two end cups (bottom brackets: their floor is the end stop), one on each back rail, the board lying between.
      const hz = railHoles.find((h) => h >= nextAcross && h - PDU_BOLT >= 0);
      if (hz === undefined || hz + 14 + p.pduW > z) break;
      nextAcross = hz + p.pduW + 30;
      place(lo, `pdu-cup-left-${n + 1}`); place(lo, `pdu-cup-right-${n + 1}`);
      for (const sx of [-1, 1]) { const t = turn(lo, (x, y, zz) => [sx * (p.hx + PDU_BOLT - zz), D + off + y, hz + x]); roles.accent.append(sx < 0 ? flip(t) : t); }
      board(-p.pduL / 2, p.pduL / 2, D + off + 4.5, D + off + 4 + p.pduH, hz + 13, hz + 13 + p.pduW);
    }
    pdus.push(n);
  }
  const pdu = p.pdu ? { mount, fits, n: pdus.length } : null;
  if (latches) { const kn = memo(`latchk|${p.fr.pt}|${p.flush}`, () => latchKnob(p)), cm = memo('latchc', () => latchCam()); for (let j = 1; j <= latches; j++) { place(kn, `latch-knob-${j}`); place(cm, `latch-cam-${j}`); } }
  return { slots, backMods, sideFanSkipped, sideFanShort, sideFans, latches, doors, windows, inserts, pdus, pdu, height: z + ft, screws: p.threads ? `${p.threads.structure} bolts through the flanges into the end frames' brackets (8) and ${p.threads.trim} screws for the side panels: the counts and lengths are in the hardware list` : `M3 × 12 bolts and nuts through the flanges into the end frames' brackets (8), the side panels (${Math.max(0, holes - 2)} a side per section)${p.boxes.length > 1 ? ' and the splice plates' : ''}` };
}

export function generateServerRack(options = {}) {
  const p = serverRackPlan(options);
  setEdges(p);
  const parts = [], preview = new Mesh();
  let z = 0, lay = 0, framed = null;
  const place = (mesh, name) => { const m = new Mesh(); m.append(mesh); const b = m.bounds(); m.translate(lay - b.min[0], -b.min[1], -b.min[2]); lay += b.size[0] + 10; parts.push({ mesh: m, name }); };
  const roles = { accent: new Mesh(), rail: new Mesh(), panel: new Mesh(), gear: new Mesh(), glass: new Mesh() };
  let armourNotes = [];
  if (p.style === 'frame') {
    framed = framedRack(p, place, roles); z = framed.height;
    if (p.bumpers !== 'none' || p.feet !== 'none') { // phase 1D: bumpers and feet, each printed on its own
      const [ef, eb] = frameExt(p), ar = rackArmour(p, { xo: frameXo(p), Y0: -ef, Y1: p.D + eb, D: p.D, ft: p.fr.ft, height: z, handle: Boolean(p.handle) });
      for (const q of ar.parts) place(q.mesh, q.name);
      roles.gear.append(ar.preview);
      armourNotes = ar.notes;
    }
  } else p.boxes.forEach((u, i) => {
    const H = boxHeight(p, u), k = `${p.D}|${p.hole}|${looks(p)}`, topKind = i === p.boxes.length - 1 ? 'cap' : 'top';
    const side = memo(`side|${k}|${u}`, () => sidePanel(p, u)), bottom = memo(`bottom|${k}`, () => plate(p, 'bottom')), top = memo(`${topKind}|${k}|${p.handle}`, () => plate(p, topKind));
    const tag = p.boxes.length > 1 ? `-box${i + 1}` : '';
    place(side, `side-panel${tag}-a`); place(side, `side-panel${tag}-b`); place(bottom, `bottom-plate${tag}`); place(top, `top-plate${tag}`);
    if (p.covered) {
      const fb = p.faces.back, kind = `back${fb === 'cover' ? '' : `-${fb}`}${i === 0 && p.glands ? '-glands' : ''}`, bc = memo(`bc|${kind}|${u}|${p.heavy}${p.extreme ? 'x' : ''}|${p.glands}|${p.glandSize}|${looks(p)}`, () => frontPanel(p, u, kind));
      place(bc, `back-cover${tag}`);
      preview.append(turn(bc, (x, y, zz) => [x, p.D + backT(p) - zz, y + z + p.pt + 0.4]));
    }
    // Put together: panels either side, plates between them.
    for (const s of [-1, 1]) {
      const m = new Mesh(); m.append(side); const q = m.positions;
      // Left (s −1): (x, y, z) → (−outer + z, x, y); right: (outer − z, D − x, y). Both rotations.
      for (let k = 0; k < q.length; k += 3) { const x = q[k], y = q[k + 1], zz = q[k + 2]; q[k] = s < 0 ? -p.outer + zz : p.outer - zz; q[k + 1] = s < 0 ? x : p.D - x; q[k + 2] = y + z; }
      preview.append(m);
    }
    preview.append(new Mesh().append(bottom).translate(0, 0, z));
    preview.append(new Mesh().append(top).translate(0, 0, z + H - p.pt));
    z += H;
  });
  // Gear, filled into the boxes from the bottom: shelves, drawers, patch panels, blanks. Sealed: every
  // empty unit gets a solid blank, so the front is closed too.
  // Phase 1J: the PC chassis takes the bottom units (or, if it won't fit, says why in the notes).
  const chassis = framed && p.chassis !== 'none' ? rackChassis({ chassis: p.chassis, gpu: p.gpu, psu: p.psu, strength: p.extreme ? 'extreme' : p.heavy ? 'heavy' : 'standard' }, { ex: p.ex, hx: p.hx, hw: panelHalf(p), D: p.D, rt: p.fr.rt }, { fastening: p.fastening }) : null;
  const chU = chassis?.parts.length ? chassis.L.U : 0;
  // Rule 9: each Tiny on its own 1U sliding tray (rack-tiny-tray.js). If it won't fit, the device panels stay and the notes say why.
  const tray = p.tinyTray && p.dev && p.devCount ? memo(`tray|${p.D}|${p.fr.rt}|${p.tinyDrive}`, () => tinyTrayParts({ depth: p.D, railBack: p.fr.rt, drive: p.tinyDrive })) : null;
  const trayOn = Boolean(tray?.parts.length);
  const more = moreDevs(p), moreU = more.reduce((a, m) => a + m.devCount * devUnits(m), 0);
  const roomU = p.boxes.reduce((a, u) => a + u, 0), gearU = chU + p.shelves + (p.dev ? p.devCount * devUnits(p) : 0) + moreU + p.bay.count * p.bay.u + p.mounts + p.drawers * p.drawerU + p.patch + p.cable + p.fans * fanUnits(p.fanSize) + p.carts * CART.u + (p.control ? p.ctrlU : 0);
  const blanks = p.fillFront ? Math.max(p.blanks, roomU - gearU - (p.screen !== 'none' ? SCREENS[p.screen].u : 0)) : p.blanks;
  const kinds = [...(chU ? [['chassis', chU, 1]] : []), ['shelf', 1, p.shelves], ...(p.dev ? [['device', devUnits(p), p.devCount]] : []), ...more.map((m) => ['device', devUnits(m), m.devCount, m]), ['bay', p.bay.u, p.bay.count], ['mount', 1, p.mounts], ['drawer', p.drawerU, p.drawers], ['patch', 1, p.patch], ['cable', 1, p.cable], ['fan', fanUnits(p.fanSize), p.fans], ['cart', CART.u, p.carts], ['screen', p.screen !== 'none' ? SCREENS[p.screen].u : 1, p.screen !== 'none' ? 1 : 0], ['blank', 1, blanks], ['control', p.ctrlU, p.control ? 1 : 0]]; // the control unit last, so it's at the top
  // Where each front panel lands (the same order and rule as the fill below), so a wrapped splice knows what it crosses.
  const runBase = framed ? framed.slots[0][0] : 0, runCap = p.boxes.reduce((a, u) => a + u, 0), at = [];
  { let usedU = 0; for (const [, u, n] of kinds) for (let i = 0; i < n; i++) { if (framed && usedU + u <= runCap) { at.push([runBase + usedU * RACK10.U + 0.4, u]); usedU += u; } else at.push(null); } }
  const joints = framed && wrapOn(p) ? rackJoints(p) : [];
  const frontCovered = joints.map(({ z, s }) => { // panels (0.8 mm apart) right across the splice's height
    let reach = z - s;
    for (const [a, u] of at.filter(Boolean).sort((m, n) => m[0] - n[0])) { if (a > reach + 1) break; reach = Math.max(reach, a + u * RACK10.U - 0.8); }
    return reach >= z + s;
  });
  let q = 0;
  const fill = [];
  for (const [kind, u, n, sub] of kinds) {
    if (!n) continue;
    const P = sub || p; // an extra device panel brings its own device
    if (kind === 'chassis') { q++; for (const part of chassis.parts) place(part.mesh, part.name); fill.push([null, u, null, null, null, 'chassis']); continue; } // its own parts, placed below
    if (kind === 'device' && trayOn && !sub) { for (let i = 0; i < n; i++) { q++; for (const part of tray.parts) place(part.mesh, `${part.name}-${i + 1}`); fill.push([null, u, null, null, null, 'tray']); } continue; } // a tray per PC, placed below
    const panelOf = (i) => {
      const pp = kind === 'fan' && p.fanCounts[i] && p.fanCounts[i] !== p.fanCount ? { ...p, fanCount: p.fanCounts[i] } : P, spot = at[q++];
      const gr = spot && joints.length ? wrapGrooves(p, spot[0], u * RACK10.U - 0.8, (j) => frontCovered[j]) : [];
      if (gr.length) return memo(`fg|${kind}|${kind === 'device' ? P.device : ''}|${u}|${pp.fanCount}|${looks(p)}|${JSON.stringify(gr)}`, () => frontPanel(pp, u, kind, null, gr));
      return pp === P ? basePanel : memo(`fanp|${u}|${pp.fanCount}|${looks(p)}`, () => frontPanel(pp, u, kind));
    };
    const basePanel = frontPanel(P, u, kind), dr = kind === 'drawer' ? drawer(p, u) : null;
    const B = p.bay, inside = kind === 'bay' ? bayContents({ ...B, floorTop: B.st, ft: 4 }) : null;
    for (let i = 0; i < n; i++) {
      const panel = panelOf(i);
      place(panel, `${kind === 'drawer' ? 'drawer-unit' : kind === 'device' ? `${P.device}-panel` : kind === 'bay' ? `drive-bay-${B.drive}` : kind === 'mount' ? 'mount-plate' : kind}-${u}u-${i + 1}`);
      if (dr) place(dr, `drawer-${u}u-${i + 1}`);
      if (kind === 'cart') {
        place(memo('cartcage', () => cartCage(p)), `cart-cage-${i + 1}`);
        cartSlots(p).forEach(({ t, k }) => place(memo(`cart|${t}`, () => cartridge(p, t)), `cart-${t}-${i + 1}-${k + 1}`));
      }
      if (kind === 'screen' && SCREENS[p.screen].bezel) place(memo(`bezel|${p.screen}`, () => screenBezel(p)), 'screen-bezel');
      if (kind === 'device' && P.dev.sled) devXs(P).forEach((_, j) => place(memo(`sled|${P.dev.sled}`, () => boardSled(P.dev.sled, P.dev)), `${P.dev.sled === 'pi' ? 'pi' : P.dev.sled}-sled-${sub ? `${P.device}-` : ''}${i + 1}-${j + 1}`));
      if (kind === 'bay') {
        const cage = memo(`cage|${B.drive}`, () => driveCage(B.drive)), sled = memo(`dsled|${B.drive}|${B.mount}`, () => driveSled(B.drive, B.mount));
        for (let j = 1; j <= B.rows * B.cols.length; j++) { place(cage, `cage-${B.drive}-${i + 1}-${j}`); place(sled, `sled-${B.drive}-${i + 1}-${j}`); }
        if (B.power) for (let k = 1; k <= B.rows; k++) place(memo(`pm|${B.jack}`, () => powerModule(B.drive, B.jack)), `power-module-${i + 1}-${k}`);
      }
      // The gear itself, for the picture: each device's body on its floor, behind the face.
      const bodies = kind === 'device' ? devXs(P).map((x) => extrudePolygon([[x - P.dev.w / 2, 3 + P.dev.lift + 2], [x + P.dev.w / 2, 3 + P.dev.lift + 2], [x + P.dev.w / 2, 3 + P.dev.lift + 2 + P.dev.h], [x - P.dev.w / 2, 3 + P.dev.lift + 2 + P.dev.h]], [], 5, 5 + P.dev.d)) : null;
      fill.push([panel, u, dr, inside, bodies, kind]);
    }
  }
  // The wrapped splices: a side piece at every upright, then the half wrap's ear legs or the full belt on each face it covers.
  if (joints.length) {
    const xo = frameXo(p), C1 = wrapLeg(p), BT = backT(p), D = p.D, xs = xo - INLAY_D;
    joints.forEach(({ z, s }, j) => {
      for (const front of [true, false]) {
        const cov = front ? frontCovered[j] : p.covered, T = cov ? (front ? 4 : BT) : 0, face = front ? 'front' : 'back';
        const side = memo(`wside|${s}|${T}|${p.heavy}${p.extreme ? 'x' : ''}`, () => wrapSide(p, s, T));
        const yOf = front ? (zz) => -INLAY_D - zz : (zz) => D + BT - INLAY_D + zz;
        for (const sx of [1, -1]) {
          const keep = sx > 0 === front, lr = sx > 0 ? 'right' : 'left';
          place(side, `splice-${j + 1}-${face}-${lr}`);
          const v = turn(side, (x, y, zz) => [sx * (xs + zz), front ? -T + x : D + T - x, z - s + y]);
          roles.accent.append(keep ? v : flip(v));
          if (!cov || p.spliceWrap !== 'half') continue;
          const leg = memo(`wleg|${s}|${C1}`, () => wrapStrip(C1 - INLAY_D, 2 * s));
          place(leg, `splice-wrap-${j + 1}-${face}-${lr}`);
          const w = turn(leg, (x, y, zz) => [sx * (xo - C1 + x), yOf(zz), z - s + y]);
          roles.accent.append(keep ? w : flip(w));
        }
        if (cov && p.spliceWrap === 'full') {
          const W = 2 * xs, holes = [-1, 1].flatMap((k) => [[xs + k * p.hx, BELT_H - 6.35], [xs + k * p.hx, BELT_H + 6.35]]);
          const belt = memo(`wbelt|${W}|${p.hx}`, () => wrapStrip(W, 2 * BELT_H, holes, [true, true]));
          place(belt, `splice-belt-${j + 1}-${face}`);
          const v = turn(belt, (x, y, zz) => [-xs + x, yOf(zz), z - BELT_H + y]);
          roles.accent.append(front ? v : flip(v));
        }
      }
    });
  }
  const knob = p.control && p.knobs ? memo('encknob', () => encoderKnob()) : null;
  if (knob) p.ctrl.forEach((t, j) => { if (t === 'encoder') place(knob, `encoder-knob-${p.ctrl.slice(0, j + 1).filter((q) => q === 'encoder').length}`); });
  const slots = []; let zb = 0;
  if (framed) slots.push([framed.slots[0][0], p.boxes.reduce((a, u) => a + u, 0)]); // one run of units: the splices keep the spacing
  else for (const u of p.boxes) { slots.push([zb + p.pt, u]); zb += boxHeight(p, u); }
  const used = slots.map(() => 0);
  for (const [panel, u, dr, inside, bodies, kind] of fill) {
    const bi = slots.findIndex(([, cap], i) => cap - used[i] >= u);
    if (bi < 0) continue;
    const z0 = slots[bi][0] + used[bi] * RACK10.U + 0.4; used[bi] += u;
    if (kind === 'chassis') { (framed ? roles.gear : preview).append(new Mesh().append(chassis.preview).translate(0, -4, z0)); continue; } // built floor-down in rack axes: its face 4 mm in front of the rails
    if (kind === 'tray') { // the sleeve (faceplate 4 mm in front of the rails), its guides on the back rails, and the PC in it
      const L = tray.L, dz = z0 - (L.yU + 0.4), to = framed ? roles.gear : preview;
      to.append(trayInstalled(tray.parts[0].mesh).translate(0, -4, dz));
      for (const g of tray.parts.slice(2)) to.append(turn(g.mesh, (a, b, c) => [a, L.guide.z1 - c - 4, b + dz])); // a rotation: plate on the rail, the groove reaching forward
      (framed ? roles.glass : preview).append(extrudePolygon([[-L.pc.w / 2, L.pcZ0 - 4], [L.pc.w / 2, L.pcZ0 - 4], [L.pc.w / 2, L.pcZ1 - 4], [-L.pc.w / 2, L.pcZ1 - 4]], [], dz + L.spec.floor, dz + L.spec.floor + L.pc.h));
      continue;
    }
    const c = new Mesh(); c.append(panel); const q = c.positions;
    // Face down → in the rack: (x, y, z) → (−x, z − 4, y + the unit's bottom + 0.4), a rotation; the face sits in front of the rails.
    for (let k = 0; k < q.length; k += 3) { const x = q[k], y = q[k + 1], zz = q[k + 2]; q[k] = -x; q[k + 1] = zz - 4; q[k + 2] = y + z0; }
    (framed ? roles.gear : preview).append(c);
    if (dr) (framed ? roles.gear : preview).append(new Mesh().append(dr).translate(0, -4 + 0.2, z0 + 1 + 2 + 0.5)); // in its sleeve, pushed home
    const face = (src) => turn(src, (x, y, zz) => [-x, zz - 4, y + z0]); // the face's own turn into the rack
    if (kind === 'screen' && SCREENS[p.screen].bezel) { const S = SCREENS[p.screen], h = u * RACK10.U - 0.8; (framed ? roles.gear : preview).append(turn(memo(`bezel|${p.screen}`, () => screenBezel(p)), (x, y, zz) => [-x, zz - 4 - S.bezel, y + z0 + h / 2])); }
    if (bodies) for (const b of bodies) (framed ? roles.glass : preview).append(face(b));
    const bIns = kind === 'blank' && framed ? blankInsert(p, u * RACK10.U - 0.8) : null; // phase 1E: a blank's sheet, in its pocket
    if (bIns) { const key = `art:${INSERT_TINT[bIns.kind]}`; roles[key] ||= new Mesh(); roles[key].append(face(memo(`bsheet|${u}|${looks(p)}`, () => insertSheet(bIns, bIns.t)))); }
    // A cartridge bay: the cage behind the panel and each cartridge in its slot (meshes are x, z up, y depth).
    if (kind === 'cart') {
      const g = cartGeom(p), into = (m, dx = 0) => flip(turn(m, (a, b, c) => [-(a + dx), c, b + 2 + z0]));
      (framed ? roles.gear : preview).append(into(memo('cartcage', () => cartCage(p))));
      cartSlots(p).forEach(({ t, slot: k }) => {
        const xk = g.xs[g.n - 1 - k]; // slot 1 on the left as you face the rack (the face's turn mirrors x); a double runs in its right-hand slot
        (framed ? roles.panel : preview).append(into(memo(`cart|${t}`, () => cartridge(p, t)), xk));
        if (t === 'ssd') (framed ? roles.glass : preview).append(into(extrudePolygon([[CART.plate + 0.2, g.zIn[0] + 1.1], [CART.plate + 9.4, g.zIn[0] + 1.1], [CART.plate + 9.4, g.zIn[0] + 1.1 + SSD.h], [CART.plate + 0.2, g.zIn[0] + 1.1 + SSD.h]], [], 0, SSD.L), xk));
        if (t === 'pi') { // the board and its port stack, for the picture
          const sx = CART.plate + CART.standoff + CART.board, box = (a0, a1, b0, b1, c0, c1) => extrudePolygon([[a0, b0], [a1, b0], [a1, b1], [a0, b1]], [], c0, c1);
          (framed ? roles.glass : preview).append(into(box(sx - CART.board, sx, g.zb0, g.zb0 + 56, 2, 87), xk));
          (framed ? roles.glass : preview).append(into(box(sx, sx + 15.5, g.zb0 + 2, g.zb0 + 54, 0, 20), xk));
        }
      });
    }
    // The screen itself, dark glass in its window (shown, not printed).
    if (kind === 'screen') { const S = SCREENS[p.screen], h = u * RACK10.U - 0.8, y0 = S.bezel ? -S.bezel + 1.4 : 1.4; const g = extrudePolygon([[-S.vw / 2, h / 2 - S.vh / 2], [S.vw / 2, h / 2 - S.vh / 2], [S.vw / 2, h / 2 + S.vh / 2], [-S.vw / 2, h / 2 + S.vh / 2]], [], y0, y0 + 1.2); (framed ? roles.glass : preview).append(face(g)); }
    // The control unit's knobs, on their shafts in front of the face.
    if (kind === 'control' && knob) { const h = u * RACK10.U - 0.8; for (const { t, x } of ctrlXs(p)) if (t === 'encoder') (framed ? roles.accent : preview).append(turn(knob, (a, b, c) => [-(x + a), c - 4 - 15 - 2, z0 + h / 2 + b])); }
    if (inside) {
      const toRack = (src) => turn(src, (x, y, zz) => [-x, zz - 4, y + z0]); // the same turn as the face
      (framed ? roles.gear : preview).append(toRack(inside.cages));
      (framed ? roles.accent : preview).append(toRack(inside.sleds));
    }
  }
  // Every fan in the rack, by size: for the dust filters and the power budget.
  const fans = [];
  if (p.fans) fans.push([p.fanSize, Array.from({ length: p.fans }, (_, i) => fanXs({ ...p, fanCount: p.fanCounts[i] || p.fanCount }).length).reduce((a, b) => a + b, 0)]);
  if (framed?.sideFans) fans.push([p.sideFan.size, framed.sideFans]);
  // Fans in the fan faces, each face's own count (0: as many as fit).
  const fitEnd = Math.max(1, Math.min(3, Math.floor((2 * (frameXo(p) - 24) - 8) / (p.faceFan + 6)))), fitBack = Math.max(1, Math.min(2, Math.floor((2 * p.ex - 10) / (p.faceFan + 6))));
  const faceFans = (framed && p.faces.top === 'fan' ? Math.min(p.topFans || 3, fitEnd) : 0) + (framed && p.faces.bottom === 'fan' ? Math.min(p.bottomFans || 3, fitEnd) : 0) + (framed && p.faces.back === 'fan' ? p.boxes.length * Math.min(p.backFans || 2, fitBack) : 0) + (framed?.backMods || []).filter((m) => m.t === 'fan').reduce((a, m) => a + backFanN(p, m), 0);
  if (faceFans) fans.push([p.faceFan, faceFans]);
  // Sealed: a dust filter for every fan, so air only comes in clean.
  const filters = p.filters ? fans : [];
  if (filters.length) {
    const bySize = new Map(); for (const [size, n] of filters) bySize.set(size, (bySize.get(size) || 0) + n); // one numbering per size
    for (const [size, n] of bySize) { const fm = memo(`filter|${size}`, () => fanFilter(size)); for (let i = 1; i <= n; i++) place(fm, `fan-filter-${size}-${i}`); }
  }
  // Cable management: rings that bolt to the back rails, and Underware channels to screw inside the back or along a side.
  if (p.cableRings) { const cr = memo('cablering', () => cableRing()); for (let j = 1; j <= p.cableRings; j++) place(cr, `cable-ring-${j}`); }
  const chLen = Math.max(1, Math.floor(Math.min(p.D - 20, 250) / UW.grid));
  if (p.cableChannels) {
    const ch = memo(`uwch|${p.channelWidth}|${chLen}|${p.channelHeight}`, () => underwareParts({ item: 'channel', widthUnits: p.channelWidth, lengthUnits: chLen, height: p.channelHeight, mount: 'wood' }).parts[0].mesh);
    for (let j = 1; j <= p.cableChannels; j++) place(ch, `underware-channel-${j}`);
  }
  if (p.handle && !framed) {
    const hd = handle(p);
    place(hd.mesh, 'handle');
    const c = new Mesh(); c.append(hd.mesh); const q = c.positions;
    // On its side → on top: (x, y, z) → (x, z − T/2 + D/2, y + the top), a mirror-free turn: (x, y, z) → (x, −z, y) then moved.
    for (let k = 0; k < q.length; k += 3) { const x = q[k], y = q[k + 1], zz = q[k + 2]; q[k] = x; q[k + 1] = p.D / 2 + hd.T / 2 - zz; q[k + 2] = y + z; }
    preview.append(c);
  }
  const total = p.boxes.reduce((a, u) => a + u, 0);
  const gear = [chU ? (p.chassis === 'dock4u' ? `a ${chU}U GPU dock bay` : `a ${chU}U PC chassis`) : '', p.dev && p.devCount ? (trayOn ? `${p.devCount} 1U sliding tray${p.devCount > 1 ? 's' : ''} for a ${tray.L.pc.name.replace('Lenovo ThinkCentre ', 'ThinkCentre ')} each` : `${p.devCount} panel${p.devCount > 1 ? 's' : ''} for ${devXs(p).length} × ${p.dev.name} (${devUnits(p)}U)`) : '', ...more.map((m) => `${m.devCount} panel${m.devCount > 1 ? 's' : ''} for ${devXs(m).length} × ${m.dev.name} (${devUnits(m)}U)`), p.shelves ? `${p.shelves} shel${p.shelves > 1 ? 'ves' : 'f'}` : '', p.bay.count ? `${p.bay.count} ${p.bay.u}U drive bay${p.bay.count > 1 ? 's' : ''} (${p.bay.rows * p.bay.cols.length} × ${p.bay.b.dr.name} each)` : '', p.mounts ? `${p.mounts} mounting plate${p.mounts > 1 ? 's' : ''}` : '', p.drawers ? `${p.drawers} ${p.drawerU}U drawer${p.drawers > 1 ? 's' : ''}` : '', p.patch ? `${p.patch} patch panel${p.patch > 1 ? 's' : ''} (${keystones(p).length} jacks each)` : '', p.cable ? `${p.cable} cable panel${p.cable > 1 ? 's' : ''}` : '', p.fans ? `${p.fans} fan panel${p.fans > 1 ? 's' : ''} (${fanXs(p).length} × ${p.fanSize} mm fans each)` : '', blanks ? `${blanks} ${p.blankStyle === 'solid' ? 'solid ' : 'vented '}blank${blanks > 1 ? 's' : ''}` : '', p.covered ? `${p.boxes.length} back ${p.faces.back === 'mount' ? 'mounting wall' : p.faces.back === 'fan' ? 'fan cover' : p.faces.back === 'vents' ? 'vented cover' : 'cover'}${p.boxes.length > 1 ? 's' : ''}` : '', filters.length ? `${filters.reduce((a, [, n]) => a + n, 0)} fan filter${filters.reduce((a, [, n]) => a + n, 0) > 1 ? 's' : ''}` : '', p.handle && !framed ? 'a handle (2 M3 × 16)' : ''].filter(Boolean).join(', ');
  const room = p.boxes.reduce((a, u) => a + u, 0), want = p.shelves + p.blanks + p.patch + p.mounts + p.bay.count * p.bay.u + p.drawers * p.drawerU + (p.dev ? p.devCount * devUnits(p) : 0) + moreU - (blanks - p.blanks);
  const notes = [
    `10-inch rack, ${total}U${p.boxes.length > 1 ? ` (${p.boxes.map((u) => `${u}U`).join(' + ')})` : ''}: ${p.D} × ${Math.round(2 * (framed ? frameXo(p) : p.outer))} × ${Math.round(z)} mm. Rail holes ${framed && p.railNuts === 'cage' ? `${CAGE.hole} mm square (M6 cage nuts)` : framed && p.railNuts === 'none' ? `${Math.min(p.hole, RAIL_PILOT)} mm (M6 thread-forming screws, no nuts)` : `${p.hole} mm (${p.hole >= 6 ? 'M6 bolts and nuts' : 'tap M6 in'})`}.`,
    framed
      ? `${p.boxes.length * 4} uprights${p.boxes.length > 1 ? `, ${(p.boxes.length - 1) * 4} splice plates (inlaid flush in the uprights) and ${(p.boxes.length - 1) * 4} backers` : ''}, 2 end frames${p.panels ? `, ${p.boxes.length * 2} side panels` : ''}${p.braces ? `, ${p.boxes.length} back brace${p.boxes.length > 1 ? 's' : ''}` : ''}${p.handle ? ', 2 handles' : ''}${gear ? `; plus ${gear}` : ''}. ${p.threads ? `${p.threads.structure} and ${p.threads.trim} bolts and nuts (the hardware list is below)` : 'M3 bolts and nuts'}. All flat, no supports, 256 mm bed.`
      : `Per box: 2 side panels, 2 plates, 12 M3 × 12 self-tapping screws${gear ? `; plus ${gear}` : ''}. All flat, no supports, 256 mm bed.`,
    'For a rack that carries real gear: print the uprights, end frames and shelves in PETG or ASA with 4 walls and 25% infill (gyroid or cubic), and tighten the bolts snug, not hard. Keep the heaviest gear low.',
    ...(framed && splitFrame(p) ? [`Deep rack (${p.D} mm): the end frames print in a front and a back half, bolted together by splice plates across the seam, set flush into pockets underneath the bottom frame and on top of the top one${panelSplit(p) ? ', and each side panel is a front and a back half with a join strip behind the seam' : ''}. M3 × 12 bolts and nuts; foam tape over the seams if it's sealed.`] : []),
    ...(framed ? [
      `Putting it together: bottom frame, uprights${p.boxes.length > 1 ? ', splices (at each joint a backer inside the flange and the plate in the flange\'s pocket outside, flush; M3 × 16 through both)' : ''}, top frame${p.braces ? ', back braces' : ''}, side panels, then the gear. Every part is named.`,
      ...(p.boxes.reduce((a, u) => a + u, 0) >= 20 ? ['A tall rack: fix the top frame to the wall.'] : []),
    ] : []),
    ...(p.sealed ? [
      `Sealed: closed all round. Solid side panels, ${framed ? 'closed end frames' : 'unvented plates'}, a back cover on every ${framed ? 'section' : 'box'}${p.glands ? ` (the bottom one with ${glandXs(p).length} holes for M${p.glandSize} cable glands, nut inside)` : ''} and every empty unit at the front blanked off. Stick 3 mm closed-cell foam tape round the inside edge of each side panel and back cover, and behind each blank, before you bolt them up.`,
      p.fans || p.sideFan
        ? 'Air: every fan gets a filter (cut filter foam or mesh to fit its pocket; the fan screws go through the filter, the panel and the fan). Blow in low at the front and out high at the back or side, with at least as much in as out, so the rack stays at a slight positive pressure and dust stays out.'
        : 'No fans: a sealed rack keeps its heat in. Fine for a switch and a Pi or two; for drives, mini PCs or power supplies add a fan panel or side fans (each gets a filter).',
      ...(p.cable ? ['Cable panels are an open slot: fit a brush strip, or use the cable glands in the back cover instead.'] : []),
    ] : []),
    ...(p.vents ? [`Vents (${p.vents}): to keep dust out, glue a sheet of filter foam or fine mesh behind each vented panel (inside); air still gets through.`] : []),
    `Faces: left ${p.faces.left}, right ${p.faces.right}, back ${p.faces.back === 'mount' ? 'mounting wall' : p.faces.back}, top ${p.faces.top}, bottom ${p.faces.bottom}; front ${p.fillFront ? `every empty unit blanked (${p.blankStyle})` : 'gaps left open'}.`,
    ...(framed?.windows?.length ? [p.windowFill === 'print'
      ? `Window${framed.windows.length > 1 ? 's' : ''}: a clear pane (window-pane parts), ${framed.windows[0].w} × ${framed.windows[0].h} mm, printed in the same job as its panel or door as a second body: clear PETG for the pane, your panel colour for the rest (dual-material, or a filament change). It fills the opening flush both sides and keys into a 2.5 mm groove round it, so it can't push out. Print the panel face down, 100% infill for the pane, and slow, hot layers (about 250 °C) for the clearest result.`
      : `Window${framed.windows.length > 1 ? 's' : ''}: cut a 3 mm acrylic or perspex sheet ${framed.windows[0][0]} × ${framed.windows[0][1]} mm for each (smoked looks great), lay it on the inside of the panel${framed.doors ? ' or door' : ''} and screw the clips into the frame round it (M3 × 8 self-tapping).`] : []),
    ...(p.carts ? [(() => { const g = cartGeom(p), used = cartSlots(p).map((c) => c.t); return `Snap-in bay${p.carts > 1 ? 's' : ''}: ${p.carts} × ${CART.u}U, ${g.n} slots each (${CART.pitch} mm apart). The cage screws to the back of its panel (4 × M3 × 10 self-tapping, heads flush). Cartridges stand on edge: slide one into its top and bottom grooves and push until the bump on its top edge clicks into the notch; pull the face to release. In this bay: ${used.length ? used.map((t) => CART_TYPES[t]).join(', ') : 'empty'}. A Pi 4 / 5 screws to its cartridge's standoffs (4 × M2.5 × 6 self-tapping), USB and Ethernet at the front. A 2.5\" SSD or drive (up to 9.5 mm thick) slides into its cartridge's channel from the back until it clicks, SATA end out the back; a 3 mm light pipe hole sits in the face. USB hub: three USB keystone couplers (A or C) clip into the face, their cables to a small hub tied to the carrier through its slots; the keystone cartridge takes any three keystone jacks (HDMI, Ethernet, USB). ${used.includes('fan') ? ' The fan cartridge (two slots wide) takes a 40 × 40 × 10 mm fan screwed to the back of its face (4 × M3 × 12), blowing out or in as you fit it.' : ''}${used.includes('switch') ? ' The switch cartridge (two slots wide) holds a mini 5-port switch on edge (up to 56 × 24 mm across its port end and 100 mm long, TP-Link LS1005 class), ports to the front; it slides in from the back until it clicks.' : ''} Run power and network out of the open back. Print the cage and cartridges standing on their fronts.`; })()] : []),
    ...(framed && p.cableTies ? ['Cable management built in: zip-tie anchors moulded into the inside of every side panel, two columns near the uprights every 60 mm. Thread a tie down one slot, under the bridge and up the other; nothing shows outside. Also here for cables: the cable pass-through panels, back-cover glands, cable rings on the back rails and the Underware channels.'] : []),
    ...(p.style === 'frame' && p.panelFix === 'magnets' && p.panels ? [`Side panels that pull off: at each place a screw would hold a side panel, a 6 × 2 mm magnet sits in the upright's flange and another in the panel's inside face (glue them with the poles attracting, test each pair before the glue sets). Pull the panel's back edge to lift it off; the bracket bolts at the ends stay put.`] : []),
    ...(framed?.latches ? [`Latches (${framed.latches}): push each knob through the panel and the upright's slot, press the cam onto the shaft behind the flange and fix it with an M3 × 8 screw and washer. Knob ridge upright: the panel lifts off. A quarter turn: it's locked. No tools.`] : []),
    ...(p.covered && p.faces.back === 'mount' ? [`Back mounting wall: M3 holes every ${MOUNT_PITCH} mm on the inside of the back, for power supplies, hubs, a switch or our housings. Self-tapping screws, or heat-set inserts.`] : []),
    ...(p.screen !== 'none' ? [`Screen bay: a ${SCREENS[p.screen].name} screen module (${SCREENS[p.screen].w} × ${SCREENS[p.screen].h} mm, viewing ${SCREENS[p.screen].vw} × ${SCREENS[p.screen].vh}) ${SCREENS[p.screen].bezel ? ' sits in a bezel on the front of its 4U panel: the bezel stands ' + SCREENS[p.screen].bezel + ' mm proud (a 10.1-inch screen is wider than the rail screws are apart, so it can\'t go behind the panel); its driver board and cable go through the opening behind, and 6 M3 × 10 self-tapping screws hold the bezel from behind. For a flush front, pick portrait.' : ' drops into the pocket behind the window; four M2.5 screws with washers hold its edges.'} Measure yours first: modules vary.`] : []),
    ...(framed && p.panelStyle !== 'solid' && p.panels ? [{ ribbed: 'Ribbed side panels: raised ribs on the outside, stiffer than plain.', isogrid: 'Isogrid side panels: a raised triangle grid on the outside, the stiffest of all.', light: 'Lightweight side panels: a thin sheet held flat by a tall triangle grid, about a third less plastic.' }[p.panelStyle]] : []),
    ...(framed && p.flush && p.panels ? [`Recessed: the badge${p.logo && p.logoStyle === 'raised' ? ' and logo' : ''} sit${p.logo && p.logoStyle === 'raised' ? '' : 's'} flush in a 1 mm pocket (change filament at that layer for a two-tone inlay), the ${p.panelFix === 'latches' ? 'latch knobs' : 'M3 screw heads'} sink into counterbores, and the panels stay behind the uprights' faces.`] : []),
    ...(framed && p.logo && p.panels ? [`Your logo is ${p.logoStyle === 'cut' ? 'cut through each side panel (a stencil: parts inside letters are left out so nothing floats)' : p.logoStyle === 'engraved' ? 'engraved into each side panel' : p.flush ? 'inlaid flush in each side panel (print it in a second colour: change filament at the layer where its pocket starts)' : 'raised on each side panel (print it in a second colour: change filament at the layer where it starts)'}.`] : []),
    ...(framed && p.fastening === 'inserts' && p.threads ? [`Heat-set inserts: short ${p.threads.trim} brass inserts (${trimInsert(p).length} mm long, ${trimInsert(p).bore} mm bore) in the side panels' screw holes, pressed in from the inside with a soldering iron (PLA 210–220 °C, PETG 230–240 °C, ABS/ASA 240–250 °C), flush. The ${p.threads.trim} panel screws come in through the uprights' flanges from inside and go straight into them: no nuts, and the panels come off and go back on for ever. The frame bolts (${p.threads.structure}) keep their nuts, where the load is.`] : []),
    ...(framed && p.fastening === 'inserts' && !p.threads ? [`Heat-set inserts: short M3 brass inserts (3 mm long, ${INSERT_M3.bore} mm bore) in the side panels' screw holes, the corner brackets${p.boxes.length > 1 ? ', the splice backers' : ''}${splitFrame(p) || 2 * frameXo(p) > 256 ? ' and the end-frame splice plates' : ''}. Press each in from the face the screw comes in from with a soldering iron (PLA 210–220 °C, PETG 230–240 °C, ABS/ASA 240–250 °C), flush. Then M3 screws go straight in: no nuts, and panels can come off and go back on for ever. ${p.railNuts === 'cage' ? 'The rails take M6 cage nuts.' : 'The rail holes take M6 nuts behind them, or switch Rail nuts to cage nuts.'}`] : []),
    ...(framed && framed.doors ? [`Doors: ${p.door === 'both' ? 'both sides open' : `the ${p.door} side opens`} (${framed.doors} door${framed.doors > 1 ? 's' : ''}, one a section). Each sits in the opening between the uprights, flush with them, hinged at the back on a strip bolted under the back flange: thread a length of 1.75 mm filament down through the knuckles as the pin. A quarter-turn twist lock at the front: the knob drops into its hole from outside, the cam slips on behind and is held by one M3 screw; turn it a quarter to lock (the cam goes under the front flange), back to open.`] : []),
    ...(framed?.backMods.length ? [`Back: rear panels, top to bottom: ${framed.backMods.map((m) => `${m.t === 'fan' ? `${backFanN(p, m)} × ${p.faceFan} mm fan${backFanN(p, m) > 1 ? 's' : ''}` : BACK_MODS[m.t].name} (${m.u}U)`).join(', ')}. Each screws to the back rails on its own, so you can swap one for another later.${framed.backMods.skipped.length ? ` Left out, no room: ${framed.backMods.skipped.map((m) => `${BACK_MODS[m.t].name} (${m.u}U)`).join(', ')}; make the rack taller or take something out.` : ''}${framed.backMods.some((m) => PSU[m.t]) ? ' Power supply holes are 6 mm in from its corners (#6-32 screws); check them against yours.' : ''}`] : []),
    ...(framed && p.spliceWrap !== 'side' ? [wrapOn(p) ? `Splice wrap (${p.spliceWrap}): each splice plate you see runs forward to its corner, turns it on the same 2.4 mm round as the panels and carries on flush ${p.spliceWrap === 'half' ? 'over the panel ears (front and back, clear of the rail screws)' : 'into a 22 mm belt right across the front and back; the rail screws either side of the joint go through the belt and hold it'}. The panels it crosses are pocketed 2 mm to take it, so it all sits level. Print the pieces flat, face down; fit the panels, then the wrap, then the bolts.` : 'Splice wrap: needs two or more sections and the flush front, so these splices stay inlaid in the sides.'] : []),
    ...(framed && p.magnets !== 'none' ? (() => {
      const railU = p.boxes.reduce((a, u) => a + u, 0), inRails = 4 * railU * 2;
      return [`Magnets: ${p.magnets === 'all' ? 'every rail panel' : 'blanks, vent, fan, cable and patch panels, back covers and rear panels'} pull straight off: two 6 × 2 mm N52 disc magnets in each ear per U, meeting a pair let into the rail faces (${inRails} in the rails; pockets ${(MAGNET.d + MAGNET.fit).toFixed(2)} mm across, ${MAGNET.h + MAGNET.deep} mm deep). Press them in (a drop of CA glue if loose): every rail magnet north side out, every panel magnet south side out, so any panel sticks in any place. Check one pair pulls before you fit the rest. Nothing shows: they meet behind the ears. Panels carrying gear${p.magnets === 'all' ? ' should still take their screws' : ' keep their screws'}; magnets alone suit light panels.`];
    })() : []),
    ...(framed && p.railNuts === 'none' ? [`Rail holes: ${RAIL_PILOT} mm pilots, no nuts. Use M6 thread-forming screws, or tap them M6.`] : []),
    ...(framed && p.railNuts === 'cage' ? [`Cage nuts: the rails have 9.5 mm square holes, ${p.boxes.reduce((a, u) => a + u, 0) * 3 * 4} of them, for standard M6 cage nuts (the clip-in kind sold for server racks). The face is 2 mm thick round each hole so the clips grip; squeeze a nut's clips and push it in from behind, ears up and down. M6 × 12 screws.`] : []),
    ...(framed && p.frontFlush ? [`Flush front and back: the front panels, back covers and braces are ${(2 * panelHalf(p)).toFixed(1)} mm wide, as wide as the frame, so their sides run on flush from the uprights. Bought 10-inch gear (254 mm ears) still fits: it bolts to the rails as before, just 1 mm narrower than the frame.`] : []),
    ...(framed && 2 * frameXo(p) > 256 ? [`Wide cabinet (${Math.round(2 * frameXo(p))} mm): the 10-inch rails stay in the middle, the uprights' faces widen to the sides, and the top and bottom frames print in left and right halves joined by splice plates.`] : []),
    ...(framed && p.panels && ['left', 'right'].some((k) => p.faces[k] === 'opengrid') ? [`openGrid side${p.faces.left === 'opengrid' && p.faces.right === 'opengrid' ? 's' : ''}: a Lite openGrid board is built into the panel (28 mm grid, its face outside), so any openGrid part snaps straight on: hooks, cable clips, bins, a spool of velcro. openGrid by David D, CC BY 4.0.`] : []),
    ...(p.cableRings ? [`Cable rings (${p.cableRings}): bolt each through a back rail hole (M6, like the gear) with the ring standing out behind; slip the cables in through the gap.`] : []),
    ...(p.cableChannels ? [`Cable channels (${p.cableChannels}): ${p.channelWidth * UW.grid} mm wide, ${chLen * UW.grid} mm long, base and snap-on lid. Screw the base inside the back cover or along a side (wood screws or M3 self-tapping), lay the cables in, snap the lid on. ${UNDERWARE_LICENCE.name} by ${UNDERWARE_LICENCE.designers}, ${UNDERWARE_LICENCE.licenceName} (${UNDERWARE_LICENCE.url}). ${UNDERWARE_LICENCE.note}`] : []),
    ...(p.control ? [`Control unit (${p.ctrlU}U, at the top): ${p.ctrl.length ? p.ctrl.join(', ') : 'blank so far: add words to its layout'}. Fit the parts from behind (encoders' nuts and the button's ring nut on the front), then wire them to an Arduino Uno or Nano as the wiring table under these notes says, and upload the sketch made for this layout. Fans set their own speed from the temperature; each knob trims its zone, push it for automatic.${p.knobs && p.ctrl.includes('encoder') ? ' The knobs print top down, no supports.' : ''}`] : []),
    ...(p.bay.count ? [bayNote(p.bay)] : []),
    ...(p.mounts ? [`Mounting plates: M3 holes every ${MOUNT_PITCH} mm across the floor, for our Arduino and Pi housings, a power supply board or a USB hub. Self-tapping M3 screws, or heat-set inserts in the holes you use.`] : []),
    ...(framed?.pdu ? [!framed.pdu.fits
      ? `Power board: a ${p.pduL} mm board doesn’t fit ${framed.pdu.mount === 'upright' ? `upright in a ${total}U rack (that needs about ${Math.ceil((p.pduL + 20) / RACK10.U)}U)` : 'across the back (that takes boards 232 to 257 mm long)'}${framed.pdu.mount === 'upright' && p.pduL >= 232 && p.pduL <= 257 ? '. Lay it across the back instead' : ''}, so no brackets were made.`
      : framed.pdu.mount === 'upright'
        ? `Power boards: ${framed.pdu.n === 2 ? 'two, one up each back rail' : 'one, up the left back rail'}, standing in a bottom bracket with a top one gripping it near its top end (for boards ${p.pduL} mm long, ${p.pduW} × ${p.pduH} mm across; measure yours). Each bracket bolts through a rail hole with an M6 bolt and nut. Print them standing.`
        : `Power board${framed.pdu.n > 1 ? 's' : ''}: lying across the back${framed.pdu.n > 1 ? `, ${framed.pdu.n} one above the other` : ''}, each end in a cup bolted through a back rail hole (M6 bolt and nut). For boards ${p.pduL} mm long, ${p.pduW} × ${p.pduH} mm across; measure yours. Slide one end into a cup, then fit the other cup over the far end and bolt it. Print the cups standing.`] : []),
    ...(p.sideFan ? [`Side fans: ${p.sideFan.count} × ${p.sideFan.size} mm in ${p.sideFan.sides === 'both' ? 'each side panel' : `the ${p.sideFan.sides} side panel`}${p.sideFan.where === 'all' ? '' : ` of the ${p.sideFan.where} section`}, with guards and screw holes.${framed?.sideFanSkipped.length ? ` They don't fit a ${framed.sideFanSkipped.join(' or ')}U panel, so that one has none.` : ''}${framed?.sideFanShort.length ? ` Only ${framed.sideFanShort.map(([u, n], k) => (k ? `${n} in the ${u}U panel` : `${n} fit${n === 1 ? 's' : ''} in the ${u}U panel`)).join(' and ')}; a deeper rack takes more.` : ''}`] : []),
    ...(p.dev?.sled && p.dev.sled !== 'pi' && p.devCount ? [`${SLED_BOARDS[p.dev.sled].name} sleds: the board screws to its standoffs with M3 × 6 screws (self-tapping, or heat-set inserts), the sled to the panel's floor with 4 M3 × 8. USB and power face the front window.`] : []),
    ...(p.dev?.hat && p.devCount ? ['Pi 5 + SATA HAT: the Pi screws to its sled (M2.5), and the HAT screws straight onto the Pi on the standoffs it comes with. Power the HAT with 12 V (it feeds the Pi too); its leads go out through the slot behind.'] : []),
    ...(want > room ? [`That’s ${want}U of gear for ${room}U of rack: the preview shows what fits.`] : []),
  ];
  // The framed rack in its colours: mint frames, splices and handles; charcoal rails and gear; eggshell panels.
  const accentParts = /^(end-frame|splice|handle|sled-|pdu-bracket)/;
  for (const q of parts) q.role = /^panel-art/.test(q.name) ? 'art' : accentParts.test(q.name) ? 'accent' : /^(side-panel|back-cover)/.test(q.name) && framed ? 'panel' : 'body';
  for (const q of parts) q.zone = zoneOf(q.name, q.role); // material zones (phase 1A): metadata only, the meshes don't change
  let assembly = null;
  if (framed) {
    assembly = Object.entries(roles).filter(([, m]) => m.indices.length).map(([role, mesh]) => ({ role, mesh }));
    for (const a of assembly) preview.append(a.mesh);
  }
  for (const q of parts) if (q.role === 'art') q.colour = `#${/-c([0-9a-f]{6})$/.exec(q.name)?.[1] || '1b1f22'}`;
  // What's in the rack, for the power budget (rack-power.js) and anything else that needs counts.
  const counts = {
    device: p.dev ? (p.device === 'custom' ? 'custom' : p.device) : null, devices: p.dev && p.devCount ? p.devCount * devXs(p).length : 0, // the first kind; the others are in moreDevices
    moreDevices: more.map((m) => ({ device: m.device, name: m.dev.name, panels: m.devCount, each: devXs(m).length, units: devUnits(m) })),
    drive: p.bay.count ? p.bay.drive : null, drives: p.bay.count * p.bay.rows * p.bay.cols.length,
    fans: fans.map(([size, n]) => ({ size, count: n })), control: Boolean(p.control),
    patch: p.patch, jacks: p.patch ? p.patch * keystones(p).length : 0, deviceName: p.dev?.name || null,
  };
  notes.push(...armourNotes); // bumpers and feet, last
  if (chassis) notes.push(...chassis.notes);
  if (tray) notes.push(...tray.notes);
  // Phase 1E: the inserts' sheets (the same size merged), their cut files and the cut list.
  const items = [];
  for (const it of [...(framed?.inserts || []), ...(blankItems(p, fill) || [])]) {
    const same = items.find((q) => q.name === it.name && q.kind === it.kind && q.w === it.w && q.h === it.h && JSON.stringify(q.holes) === JSON.stringify(it.holes));
    if (same) same.count += it.count; else items.push({ ...it });
  }
  const inserts = items.length ? { items, list: cutList(items), files: cutFiles(items) } : null;
  if (inserts) notes.push(...insertNotes(items));
  // Phase 1H: mixed hardware's build sheet, from the points the parts were cut for.
  let hardware = null;
  if (framed && p.threads) {
    const tb = p.panelStyle === 'light' ? Math.max(1.8, p.fr.pt * 0.6) : p.fr.pt, rails = fill.reduce((a, f) => a + 4 * f[1], 0) + (p.covered ? 6 * p.boxes.reduce((a, u) => a + u, 0) : 0);
    const sides = (p.panels ? [p.faces.left, p.faces.right].filter((f) => f !== 'none').length : 0);
    const sideScrews = sides * 2 * p.boxes.reduce((a, u) => a + flangeXs(u * RACK10.U).filter((y) => y > p.fr.bk + 2 && y < u * RACK10.U - p.fr.bk - 2).length, 0);
    hardware = rackHardware(p, [
      { group: 'structure', what: 'corner brackets', through: p.fr.ff + 4.8, seat: p.fr.ff, count: 8 },
      { group: 'trim', what: 'side panels', through: tb + p.fr.ff, seat: tb, count: p.panelFix === 'screws' ? sideScrews : 0 },
      { group: 'trim', what: 'front and back panels', through: 4 + p.fr.rt + 2, seat: 4, count: rails, onRail: true },
    ]);
    if (hardware.washers) { const w = memo(`rwash|${p.threads.trim}`, () => railWasher(p)); place(w, `rail-washer-x${hardware.washers}`); }
    notes.push(
      `Mixed hardware: ${hardware.groups.map((g) => `${g.group} ${g.why}`).join('; ')}. Every head sinks flush in a counterbore; nuts go behind.`,
      `Hardware to buy: ${[...hardware.screws, ...hardware.nuts].map((x) => `${x.what} × ${x.count}`).join(', ')}${hardware.washers ? `; print ${hardware.washers} rail washer plates (an ${p.threads.trim} nut on each, behind the rail)` : ''}.`,
      ...hardware.problems,
    );
  }
  // Phase 1I: the lid's magnets.
  const covers = framed && p.coverTop === 'magnets' ? { top: lidMagnets(p, p.fr.band || 24).length } : null;
  if (covers) notes.push(`Top lid: it drops into the top frame and lifts off at the finger notch, no tools. ${covers.top} pairs of ${MAGNET.d} × ${MAGNET.h} mm magnets (${2 * covers.top} in all) glue into the ledge and the lid's corners: fit every one in a part the same way up, and test each pair before the glue sets. Gravity holds the lid down; the magnets keep it from sliding or lifting in a knock.`);
  return { parts, notes, plan: p, preview, assembly, gear: counts, inserts, hardware, covers };
}

// ---------------------------------------------------------------------------
// Rack panels on their own (/rack-panels): one front panel of any kind, for any 10-inch rack or for a
// VERTEX rack you already printed. "Any 10-inch rack" makes the standard 254 mm wide panel with ear
// slots on the 236.5 mm hole spacing; "VERTEX rack" makes it the way the rack studio does (flush, inset).
export const RACKPANEL_DEFAULTS = {
  panel: 'patch', // patch | device | fan | vented | blank | cable | gland | control
  u: 1, // its height in rack units
  fit: 'standard', // standard (any 10-inch rack, 254 mm ears) | vertex (matches a VERTEX rack's front)
  ports: 6, keyW: 14.9, keyH: 19.4, // patch: keystone jacks
  device: 'mypassport', devices: 2, devW: 120, devH: 38, devD: 120, // device: what it holds
  fanSize: 80, fanCount: 2, // fan
  glands: 3, glandSize: 25, // gland plate
  ctrlLayout: 'button, led, led, led, gap, encoder, encoder, oled', ctrlButton: 19, knobs: true, // control panel
  // fan controller: a 4-knob, 8-channel board on a PCI bracket (12 × 6.5 cm). Measure yours: these are the usual sizes.
  fcKnobs: 4, fcPitch: 25, fcHole: 7, fcAbove: 6.5, fcLen: 120, fcDepth: 60, fcBracket: false,
  badge: '',
};
export const RACK_PANEL_KINDS = {
  patch: 'Keystone patch panel', device: 'Device panel', fan: 'Fan panel', vented: 'Vented blank', blank: 'Solid blank',
  cable: 'Cable pass-through', gland: 'Cable gland plate', control: 'Control panel (buttons, LEDs, knobs, screen)',
  fanctl: 'Fan controller (4-knob, 8-channel board)',
};

// The panel as it stands in a rack, seen from the front: printed face down (front at z = 0), so a half
// turn about the vertical keeps it reading right (a rotation, so the faces stay outward). Preview only.
export const rackPanelUpright = (mesh) => turn(mesh, (x, y, z) => [-x, z, y]);

export function generateRackPanel(options = {}) {
  const o = { ...RACKPANEL_DEFAULTS, ...options };
  const panel = RACK_PANEL_KINDS[o.panel] ? o.panel : 'patch';
  const kind = panel === 'vented' || panel === 'blank' ? 'blank' : panel;
  const std = o.fit !== 'vertex';
  const p = serverRackPlan({
    ...o, style: 'frame', units: 5, units2: 0, units3: 0, height: 0,
    ...(std ? { bezel: 'full', frontFlush: false } : {}),
    blankStyle: panel === 'vented' ? 'vents' : 'solid', blanks: 0, shelves: 0,
    device: panel === 'device' ? o.device : 'none', devCount: panel === 'device' ? 1 : 0,
    patch: panel === 'patch' ? 1 : 0, fans: panel === 'fan' ? 1 : 0, cable: panel === 'cable' ? 1 : 0,
    control: panel === 'control', glands: o.glands, glandSize: o.glandSize,
  });
  p.fc = { knobs: Math.round(num(o.fcKnobs, 1, 8, 4)), pitch: num(o.fcPitch, 12, 40, 25), hole: num(o.fcHole, 4, 14, 7), above: num(o.fcAbove, 2, 15, 6.5), len: num(o.fcLen, 60, 200, 120), depth: num(o.fcDepth, 10, 120, 60), bracket: o.fcBracket === true || o.fcBracket === 'true' };
  if (panel === 'fanctl' && (p.fc.knobs - 1) * p.fc.pitch + p.fc.hole > p.fc.len) throw new Error(`${p.fc.knobs} knobs ${p.fc.pitch} mm apart don't fit on a board ${p.fc.len} mm long: check the spacing.`);
  p.glands = Math.round(num(o.glands, 1, 5, 3)); p.glandSize = [16, 20, 25].includes(Number(o.glandSize)) ? Number(o.glandSize) : 25;
  setEdges(p);
  const need = kind === 'device' && p.dev ? devUnits(p) : kind === 'fan' ? fanUnits(p.fanSize) : kind === 'control' ? p.ctrlU : 1;
  const u = Math.max(need, Math.round(num(o.u, 1, 4, 1)));
  const parts = [], notes = [];
  const place = (mesh, name) => { const m = new Mesh(); m.append(mesh); const b = m.bounds(); const x = parts.reduce((a, q) => a + q.mesh.bounds().size[0] + 10, 0); m.translate(x - b.min[0], -b.min[1], -b.min[2]); parts.push({ mesh: m, name }); };
  place(frontPanel(p, u, kind), `${panel === 'device' ? `${p.device}-panel` : `${panel}-panel`}-${u}u`);
  if (kind === 'device' && p.dev?.sled) devXs(p).forEach((_, j) => place(boardSled(p.dev.sled, p.dev), `${p.dev.sled}-sled-${j + 1}`));
  const wide = std ? RACK10.ears : 2 * panelHalf(p);
  notes.push(`${RACK_PANEL_KINDS[panel]}, ${u}U: ${Math.round(wide * 10) / 10} × ${Math.round((u * RACK10.U - 0.8) * 10) / 10} mm, ${std ? 'for any 10-inch rack (ear slots on the 236.5 mm hole spacing, M6 cage nuts or M5/M6 screws)' : 'to match a VERTEX rack\'s front'}. Prints face down, no supports.`);
  if (panel === 'patch') notes.push(`${keystones(p).length} keystone holes, ${p.keyW} × ${p.keyH} mm: standard snap-in jacks and couplers (RJ45, HDMI, USB) clip in from the front.`);
  if (panel === 'device' && p.dev) notes.push(`${devXs(p).length} × ${p.dev.name}: a window for each one's front and a floor with walls behind that keeps it straight. Needs ${Math.ceil(p.dev.d + 20)} mm of rack depth.`);
  if (panel === 'fan') notes.push(`${fanXs(p).length} × ${p.fanSize} mm fans, guarded, with their four screw holes.`);
  if (panel === 'gland') notes.push(`${glandXs(p).length} × M${p.glandSize} cable glands: the thread goes through and the gland's locknut tightens from behind.`);
  if (panel === 'fanctl') notes.push(`Fan controller: ${p.fc.knobs} knob holes ${p.fc.hole} mm across, ${p.fc.pitch} mm apart, and two ledges ${p.fc.depth} mm deep behind for a board ${p.fc.len} mm long. ${p.fc.bracket ? 'Its bracket sits in the pocket in the panel\'s back, the knob shafts through the bracket and the panel.' : 'Unscrew the bracket, pull the knob caps off, push the shafts through from behind and push the caps back on: they hold the board to the panel.'} Measure your board's knob spacing and the height of the shafts above it before printing; the defaults are the usual sizes, not a guarantee. The SATA power plug and the fan headers stay reachable at the back.`);
  if (panel === 'control') notes.push('The holes for your buttons, LEDs, knobs and screen. The wiring and the sketch are in the rack studio\'s control unit.');
  return { parts, notes, plan: { ...p, panel, u }, gear: { panel, u, fit: std ? 'standard' : 'vertex' } };
}
