// Rebuild a model from its saved settings (used by the admin panel and design pages).
import { generateBinParts } from './geometry/bin.js';
import { normalisePlate, planPlates, generateTile, generateClipSheet, generateSpacers } from './geometry/plates.js';
import { generateHolder } from './geometry/holders.js';
import { generateLabelClips } from './geometry/labelclip.js';
import { generatePlates, generateScoop } from './geometry/extras.js';
import { generateSkadis } from './geometry/skadis.js';
import { generateMorph } from './geometry/morph.js';

export function buildParts(kind, params = {}) {
  if (kind === 'bin') {
    const { body, labels, plates } = generateBinParts(params);
    return [{ mesh: body, name: 'bin' }, ...(labels ? [{ mesh: labels, name: 'labels' }] : []), ...plates.map((p) => ({ mesh: p.mesh, name: p.name }))];
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
