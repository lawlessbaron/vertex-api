// Simple one-piece baseplates (kept for existing links and thumbnails).
import { SPEC } from './spec.js';
import { generatePlate } from './plates.js';

export const BASEPLATE_DEFAULTS = {
  gridX: 4,
  gridY: 3,
  pitchX: SPEC.pitch,
  pitchY: SPEC.pitch,
  bottom: 0,
  drawerW: 0,
  drawerD: 0,
  segments: 6,
};

export function generateBaseplate(options = {}) {
  const o = { ...BASEPLATE_DEFAULTS, ...options };
  const drawer = o.drawerW > 0 && o.drawerD > 0;
  return generatePlate({
    ...o,
    sizeMode: 'grid',
    style: o.bottom > 0 ? 'solid' : 'frame',
    thickness: o.bottom,
    border: drawer,
    ...(drawer ? padFor(o) : {}),
  });
}

// Grid mode with a drawer: pad out to the drawer, centred.
function padFor(o) {
  const cols = Math.max(1, Math.round(o.gridX)), rows = Math.max(1, Math.round(o.gridY));
  if (o.drawerW < cols * o.pitchX || o.drawerD < rows * o.pitchY) return {};
  return { sizeMode: 'drawer', drawerW: o.drawerW, drawerD: o.drawerD, forceCols: cols, forceRows: rows };
}

// How many whole cells fit in a drawer.
export function fitGrid(drawerW, drawerD, pitchX = SPEC.pitch, pitchY = SPEC.pitch) {
  return {
    gridX: Math.max(1, Math.floor(drawerW / pitchX)),
    gridY: Math.max(1, Math.floor(drawerD / pitchY)),
  };
}
