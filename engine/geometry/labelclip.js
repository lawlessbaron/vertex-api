import { Mesh } from './mesh.js';
import { extrudePolygon } from './polygon.js';

// A clip-on label: an inverted U that grips a bin wall or divider, with a
// label plate angled up towards you. The profile lies flat on the bed and is
// extruded upwards by the label width, so it prints without supports.
export const LABEL_CLIP_DEFAULTS = {
  width: 36, // along the wall
  grip: 1.2, // thickness of the wall or divider it clips onto
  clearance: 0.25,
  gripDepth: 7,
  plate: 12, // label face height
  angle: 45, // label face angle from horizontal
  thickness: 1.2,
  count: 1,
};

export function labelClipProfile(o) {
  const g = o.grip + o.clearance, d = o.gripDepth, t = o.thickness;
  const a = (Math.min(80, Math.max(15, o.angle)) * Math.PI) / 180;
  const top = [-t, t]; // top-front corner
  const p8 = [top[0] - o.plate * Math.cos(a), top[1] + o.plate * Math.sin(a)];
  const p9 = [p8[0] - 1.6 * Math.sin(a), p8[1] - 1.6 * Math.cos(a)];
  const s = (-t - p9[0]) / Math.cos(a);
  const p10 = [-t, p9[1] - s * Math.sin(a)];
  return [[0, -d], [0, 0], [g, 0], [g, -d], [g + t, -d], [g + t, t], top, p8, p9, [-t, Math.max(p10[1], -d + 1)], [-t, -d]];
}

// Returns { mesh, text } with the clips laid out for printing, and the label
// face geometry so text can sit on it.
export function generateLabelClips(options = {}) {
  const o = { ...LABEL_CLIP_DEFAULTS, ...options };
  const profile = labelClipProfile(o);
  const mesh = new Mesh();
  const count = Math.max(1, Math.round(o.count));
  let minX = Infinity, maxX = -Infinity;
  for (const [x] of profile) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
  const pitch = maxX - minX + 4;
  for (let i = 0; i < count; i++) {
    const shifted = profile.map(([x, y]) => [x + i * pitch, y]);
    // Profile in XY (flat on the bed), width along Z.
    mesh.append(extrudePolygon(shifted, [], 0, o.width));
  }
  return { mesh, pitch };
}
