import { Mesh } from './mesh.js';
import { box, extrudeY } from './primitives.js';
import { platesSheet } from './bin.js';

// A parts scoop sized for a Gridfinity compartment: a thin front edge that
// slides under small parts, sides that rise towards the back, and a handle.
export const SCOOP_DEFAULTS = { width: 34, length: 40, height: 12, wall: 1.2, handle: 45 };

export function generateScoop(options = {}) {
  const o = { ...SCOOP_DEFAULTS, ...options };
  const w = o.width, l = o.length, h = Math.max(o.height, o.wall + 3), t = o.wall;
  const m = new Mesh();
  // Floor: a wedge, 0.6 mm at the front edge.
  m.append(extrudeY([[0, 0], [l, 0], [l, t], [0, 0.6]], -w / 2, w / 2));
  // Sides rise from the front to the back wall.
  const side = [[0, 0], [l, 0], [l, h], [0, t + 1.5]];
  m.append(extrudeY(side, -w / 2, -w / 2 + t));
  m.append(extrudeY(side, w / 2 - t, w / 2));
  m.append(box(l - t, -w / 2, 0, l, w / 2, h));
  // Handle, with a thicker grip at the end.
  m.append(box(l - 0.5, -5, 0, l + o.handle, 5, 3));
  m.append(box(l + o.handle - 15, -6, 0, l + o.handle, 6, 4));
  return m;
}

// Loose divider plates for a bin with divider slots (or to cut to size).
export const PLATES_DEFAULTS = { count: 4, length: 80, height: 30, thickness: 1.2 };

export function generatePlates(options = {}) {
  const o = { ...PLATES_DEFAULTS, ...options };
  return platesSheet(Math.max(1, Math.round(o.count)), o.length, o.height, o.thickness);
}
