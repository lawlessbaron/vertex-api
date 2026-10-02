// Rebuild a model from its saved settings (used by the admin panel and design pages).
import { binWithLid } from './geometry/lid.js';
import { normalisePlate, planPlates, generateTile, generateClipSheet, generateSpacers } from './geometry/plates.js';
import { generateHolder } from './geometry/holders.js';
import { generateLabelClips } from './geometry/labelclip.js';
import { generatePlates, generateScoop } from './geometry/extras.js';
import { generateSkadis } from './geometry/skadis.js';
import { generateMorph } from './geometry/morph.js';

// Generators that load only when a saved design of that kind is shown, so the
// pages that list models don't download them. Await loadKind(kind) first.
const LAZY = {
  enclosure: () => import('./geometry/enclosure.js').then((m) => (p) => {
    const r = m.generateEnclosure(p);
    return [{ mesh: r.base, name: 'enclosure-base' }, { mesh: r.lid, name: 'enclosure-lid' }, ...(r.inlay ? [{ mesh: r.inlay, name: 'enclosure-inlay' }] : [])];
  }),
  simrig: () => import('./geometry/simrig.js').then((m) => (p) => m.generateSimPart(p).parts.map((x) => ({ mesh: x.mesh, name: `sim-${x.name}` }))),
  tslot: () => import('./geometry/tslot.js').then((m) => (p) => m.generateTslotPart(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  swatch: () => import('./geometry/swatch.js').then((m) => (p) => {
    const r = m.generateSwatches(p);
    return [{ mesh: r.body, name: `swatches-${r.count}` }, ...(r.text.positions.length ? [{ mesh: r.text, name: 'swatch-text' }] : [])];
  }),
  knob: () => import('./geometry/knob.js').then((m) => (p) => m.generateKnobPart(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  dragchain: () => import('./geometry/dragchain.js').then((m) => (p) => m.generateDragChain(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  hinge: () => import('./geometry/hinge.js').then((m) => (p) => m.generateHingePart(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  jar: () => import('./geometry/jar.js').then((m) => (p) => m.generateJar(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  stand: () => import('./geometry/stand.js').then((m) => (p) => m.generateStand(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  deskhook: () => import('./geometry/deskhook.js').then((m) => (p) => m.generateDeskHook(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  planter: () => import('./geometry/planter.js').then((m) => (p) => m.generatePlanter(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  cutter: () => import('./geometry/cutter.js').then((m) => (p) => m.generateCutter(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  keychain: () => import('./geometry/keychain.js').then((m) => (p) => m.generateKeychain(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  bagclip: () => import('./geometry/bagclip.js').then((m) => (p) => m.generateBagclip(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  coaster: () => import('./geometry/coaster.js').then((m) => (p) => m.generateCoaster(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  laptopstand: () => import('./geometry/laptopstand.js').then((m) => (p) => m.generateLaptopStand(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  deskdrawer: () => import('./geometry/deskdrawer.js').then((m) => (p) => m.generateDeskDrawer(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  deskhanger: () => import('./geometry/deskhanger.js').then((m) => (p) => m.generateDeskHanger(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  controllerrack: () => import('./geometry/controllerrack.js').then((m) => (p) => m.generateControllerRack(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  grommet: () => import('./geometry/grommet.js').then((m) => (p) => m.generateGrommet(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  serverrack: () => import('./geometry/serverrack.js').then((m) => (p) => m.generateServerRack(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  leadhanger: () => import('./geometry/leadhanger.js').then((m) => (p) => m.generateLeadHanger(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  bikehook: () => import('./geometry/bikehook.js').then((m) => (p) => m.generateBikeHook(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  shoerack: () => import('./geometry/shoerack.js').then((m) => (p) => m.generateShoeRack(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  petbowl: () => import('./geometry/petbowl.js').then((m) => (p) => m.generatePetBowlStand(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  routershelf: () => import('./geometry/routershelf.js').then((m) => (p) => m.generateRouterShelf(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  remotecaddy: () => import('./geometry/remotecaddy.js').then((m) => (p) => m.generateRemoteCaddy(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  tabletholder: () => import('./geometry/tabletholder.js').then((m) => (p) => m.generateTabletHolder(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  mughooks: () => import('./geometry/mughooks.js').then((m) => (p) => m.generateMugHooks(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  lidrack: () => import('./geometry/lidrack.js').then((m) => (p) => m.generateLidRack(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  hairholder: () => import('./geometry/hairholder.js').then((m) => (p) => m.generateHairHolder(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  familycharger: () => import('./geometry/familycharger.js').then((m) => (p) => m.generateFamilyCharger(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  glassesrack: () => import('./geometry/glassesrack.js').then((m) => (p) => m.generateGlassesRack(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  chargedock: () => import('./geometry/chargedock.js').then((m) => (p) => m.generateChargeDock(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  cablebox: () => import('./geometry/cablebox.js').then((m) => (p) => m.generateCableBox(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  desktidy: () => import('./geometry/desktidy.js').then((m) => (p) => m.generateDeskTidy(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  monitorriser: () => import('./geometry/monitorriser.js').then((m) => (p) => m.generateMonitorRiser(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  bookend: () => import('./geometry/bookend.js').then((m) => (p) => m.generateBookend(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  broomholder: () => import('./geometry/broomholder.js').then((m) => (p) => m.generateBroomHolder(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  spicerack: () => import('./geometry/spicerack.js').then((m) => (p) => m.generateSpiceRack(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  toothbrush: () => import('./geometry/toothbrush.js').then((m) => (p) => m.generateToothbrushHolder(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  plantmarker: () => import('./geometry/plantmarker.js').then((m) => (p) => m.generatePlantMarkers(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  keyrack: () => import('./geometry/keyrack.js').then((m) => (p) => m.generateKeyrack(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  headphone: () => import('./geometry/headphone.js').then((m) => (p) => m.generateHeadphoneStand(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  shelfbracket: () => import('./geometry/shelfbracket.js').then((m) => (p) => m.generateShelfBracket(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  battery: () => import('./geometry/battery.js').then((m) => (p) => m.generateBattery(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  cablewrap: () => import('./geometry/cablewrap.js').then((m) => (p) => m.generateCableWrap(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
  spool: () => import('./geometry/spool.js').then((m) => (p) => m.generateSpoolPart(p).parts.map((x) => ({ mesh: x.mesh, name: x.name }))),
};
const loaded = {};
export const LAZY_KINDS = Object.keys(LAZY);

/** Load a lazily built generator (a no-op for the rest). */
export async function loadKind(kind) {
  if (Object.hasOwn(LAZY, kind) && !loaded[kind]) loaded[kind] = await LAZY[kind]();
}

export function buildParts(kind, params = {}) {
  if (Object.hasOwn(loaded, kind)) return loaded[kind](params);
  if (kind === 'bin') {
    const { body, labels, plates, lid } = binWithLid(params);
    return [{ mesh: body, name: 'bin' }, ...(labels ? [{ mesh: labels, name: 'labels' }] : []), ...plates.map((p) => ({ mesh: p.mesh, name: p.name })), ...(lid ? [{ mesh: lid, name: 'lid' }] : [])];
  }
  if (kind === 'baseplate' || kind === 'modular') {
    const plan = planPlates(normalisePlate(params));
    const parts = plan.tiles.map((t) => ({ mesh: generateTile(plan, t), name: `tile-${t.ix + 1}-${t.iy + 1}` }));
    if (plan.clipped) parts.push({ mesh: generateClipSheet(plan), name: `clips-x${plan.clips + (plan.spareClips || 0)}` });
    parts.push(...generateSpacers(plan).map((s) => ({ mesh: s.mesh, name: s.name })));
    return parts;
  }
  if (kind === 'holder') {
    const { mesh, labels } = generateHolder(params);
    return [{ mesh, name: 'holder' }, ...(labels ? [{ mesh: labels, name: 'size-labels' }] : [])];
  }
  if (kind === 'labels') {
    const o = params;
    if (o.extra === 'scoop') return [{ mesh: generateScoop({ width: o.scoopWidth, length: o.scoopLength, height: o.scoopHeight, handle: o.handle }), name: 'parts-scoop' }];
    if (o.extra === 'plates') return [{ mesh: generatePlates({ count: o.plateCount, length: o.plateLength, height: o.plateHeight, thickness: o.plateThickness }), name: 'divider-plates' }];
    return [{ mesh: generateLabelClips(o).mesh, name: 'label-clips' }];
  }
  if (kind === 'morph') return generateMorph(params).parts.map((p) => ({ mesh: p.mesh, name: p.name }));
  if (kind === 'skadis') {
    const r = generateSkadis(params);
    const parts = [{ mesh: r.mesh, name: `skadis-${params.item || 'hook'}` }];
    if (r.clipSheet) parts.push({ mesh: r.clipSheet, name: `skadis-clips-x${r.clips}` });
    if (r.baseplate) {
      const plan = planPlates(normalisePlate({ ...r.baseplate, sizeMode: 'grid', style: 'frame', border: false }));
      parts.push(...plan.tiles.map((t) => ({ mesh: generateTile(plan, t), name: 'baseplate' })));
    }
    return parts;
  }
  return null;
}

// A link that opens the settings in the generator.
export function openUrl(kind, params = {}) {
  if (kind === 'skadis' || kind === 'morph') {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== null && typeof v !== 'object') q.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
    return `/${kind}?${q}`;
  }
  const q = new URLSearchParams({ type: kind === 'modular' ? 'baseplate' : kind });
  for (const [k, v] of Object.entries(params)) {
    if (v === null || typeof v === 'object') continue;
    q.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
  }
  return `/create?${q}`;
}
