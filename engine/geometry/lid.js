// Bin lids, kept apart from bin.js so pages that only show a bin don't load
// the baseplate code a stacking lid is built from.
import { Mesh } from './mesh.js';
import { SPEC } from './spec.js';
import { loftSolid } from './primitives.js';
import { BIN_DEFAULTS, binFrame, footLevels, generateBinParts } from './bin.js';
import { generateBaseplate } from './baseplate.js';

/**
 * A lid for a bin with a stacking lip. Underneath, a plug shaped like the
 * bin's feet seats in the lip exactly as a bin stacked on top would. On top,
 * either a flat cap or (stacking) a solid baseplate, so bins stand on the lid.
 * Prints plug-down without supports. Stacking needs whole grid units; half
 * units get a flat top.
 */
export function generateLid(options = {}) {
  const o = { ...BIN_DEFAULTS, ...options };
  const { W, D } = binFrame(o);
  const seg = o.segments, top = Math.max(0.8, Math.min(o.lidTop, 5));
  const mesh = new Mesh();
  mesh.append(loftSolid(footLevels(0, 0, W, D), seg));
  const whole = Number.isInteger(o.gridX) && Number.isInteger(o.gridY);
  if (o.lid === 'stacking' && whole) {
    mesh.append(generateBaseplate({ gridX: o.gridX, gridY: o.gridY, pitchX: o.pitchX, pitchY: o.pitchY, bottom: top }).translate(0, 0, SPEC.baseHeight - 0.01));
  } else {
    const r = { cx: 0, cy: 0, w: W, d: D, r: SPEC.binRadius };
    mesh.append(loftSolid([{ z: SPEC.baseHeight - 0.01, rect: r }, { z: SPEC.baseHeight + top, rect: r }], seg));
  }
  return mesh;
}

/** generateBinParts plus the lid, when one is asked for and the bin has a lip to take it. */
export function binWithLid(options = {}) {
  const o = { ...BIN_DEFAULTS, ...options };
  return { ...generateBinParts(o), lid: o.lid !== 'none' && o.lip && !o.vase ? generateLid(o) : null };
}
