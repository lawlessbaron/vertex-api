// Inserts for the framed server rack (Epic 1, phase 1E): real wood, acrylic or aluminium sheet set
// flush into pockets in the printed parts. The engine makes the pockets; the sheets come out as cut
// files (SVG and DXF, through the Hybrid suite's drawing()) and a cut list, never as STLs.
//
//   insertSides   none | wood | acrylic | metal   a sheet over each side panel's face, inside its screw lines
//   insertBlanks  none | wood | acrylic | metal   a sheet in the face of each front blank
//   insertT       the sheet's thickness (0: the material's usual one)
//   insertRound   the sheet's corner radius, 0–12 mm
//
// The fit (rule: pocket = insert + 0.2 mm): the pocket is 0.2 mm wider and taller than the sheet (0.1 a
// side), and 0.2 mm deeper, for the tape or glue under it, so the sheet's face sits flush with the print.
import { withKerf, drawing } from './hybrid.js';

export const INSERT_KINDS = ['none', 'wood', 'acrylic', 'metal'];
export const INSERT_MATERIALS = {
  wood: { name: 'Wood', sheet: 'sapele-faced or birch ply', t: 3, ts: [1.5, 3], fix: 'wood glue, or thin VHB tape', tip: 'Laser or CNC it, sand the face and oil it before it goes in.' },
  acrylic: { name: 'Acrylic', sheet: 'cast acrylic (clear, smoked or a colour)', t: 3, ts: [2, 3], fix: 'clear VHB tape', tip: 'Cast acrylic cuts cleanest; leave the film on until it’s fitted.' },
  metal: { name: 'Aluminium', sheet: 'aluminium sheet (5052 or 1050)', t: 1.5, ts: [1, 1.5], fix: 'VHB tape', tip: 'Laser, waterjet or a fine jigsaw; deburr it and brush the face in one direction.' },
};
export const FIT = 0.2, BED = 0.2; // the pocket over the sheet: across, and under it

/** The settings, cleaned. Framed racks only. */
export function insertOptions(o = {}, framed = true) {
  const kind = (v) => (framed && INSERT_KINDS.includes(v) ? v : 'none');
  const t = Number(o.insertT);
  return {
    insertSides: kind(o.insertSides),
    insertBlanks: kind(o.insertBlanks),
    insertT: Number.isFinite(t) && t > 0 ? Math.min(4, Math.max(0.5, t)) : 0,
    insertRound: Number.isFinite(Number(o.insertRound)) ? Math.min(12, Math.max(0, Number(o.insertRound))) : 4,
  };
}
/** A material's sheet thickness here: the setting, else the usual one. */
export const sheetT = (a, kind) => (kind && kind !== 'none' ? a.insertT || INSERT_MATERIALS[kind].t : 0);
/** The pocket's depth for a sheet t thick. */
export const pocketDepth = (t) => Math.round((t + BED) * 100) / 100;

/**
 * A pocket and its sheet, from the box the pocket may fill ([x0, y0, x1, y1] on the part, its outside up).
 * holes: openings the sheet must have (a fan's, say), as boxes on the part.
 * Returns { pocket: [x0, y0, x1, y1], r, w, h, holes } where w × h is the sheet and holes are in the
 * sheet's own frame, seen from its face (x right, y down the page, as in the cut file).
 */
export function insertFor(box, r, holes = []) {
  const [x0, y0, x1, y1] = box, w = x1 - x0 - FIT, h = y1 - y0 - FIT, k = FIT / 2;
  return {
    pocket: [x0, y0, x1, y1], r: Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2),
    w: r2(w), h: r2(h),
    // The sheet's holes are FIT bigger than the part's (they clear its edges by 0.1 mm a side).
    holes: holes.map(([a, b, c, e, hr = 3]) => ({ x0: r2(a - x0 - k - k), y0: r2(y1 - e - k - k), x1: r2(c - x0 - k + k), y1: r2(y1 - b - k + k), r: hr })),
  };
}
const r2 = (v) => Math.round(v * 100) / 100;

/**
 * The cut files and cut list for a set of sheets: items [{ name, kind, t, w, h, r, holes, count }].
 * Each material and thickness gets its own file, the pieces laid out in rows no wider than `bed`
 * (copies side by side), 4 mm apart. kerf: the laser's (the Hybrid suite's rule: parts grow by half).
 */
export function cutFiles(items, { kerf = 0.15, bed = 400 } = {}) {
  const groups = new Map();
  for (const it of items) {
    const key = `${it.kind}-${it.t}`;
    if (!groups.has(key)) groups.set(key, { kind: it.kind, t: it.t, items: [] });
    groups.get(key).items.push(it);
  }
  const files = [];
  for (const g of groups.values()) {
    const shapes = [], gap = 4;
    let x = 0, y = 0, row = 0;
    for (const it of g.items) for (let c = 0; c < it.count; c++) {
      if (x > 0 && x + it.w > bed) { x = 0; y += row + gap; row = 0; }
      shapes.push({ x0: x, y0: y, x1: x + it.w, y1: y + it.h, r: it.r, role: 'part' });
      for (const hl of it.holes || []) shapes.push({ x0: x + hl.x0, y0: y + hl.y0, x1: x + hl.x1, y1: y + hl.y1, r: hl.r, role: 'hole' });
      x += it.w + gap; row = Math.max(row, it.h);
    }
    const M = INSERT_MATERIALS[g.kind], name = `rack-inserts-${g.kind}-${String(g.t).replace('.', '_')}mm`;
    const dr = drawing(withKerf(shapes, kerf), `${M.name} inserts, ${g.t} mm ${M.sheet}. Kerf ${kerf} mm allowed for`);
    files.push({ name, kind: g.kind, t: g.t, svg: dr.svg, dxf: dr.dxf, width: dr.width, height: dr.height, pieces: g.items.reduce((s, it) => s + it.count, 0) });
  }
  return files;
}

/** The cut list: one line a size, with counts. */
export function cutList(items) {
  return items.map((it) => {
    const M = INSERT_MATERIALS[it.kind];
    return `${it.count} × ${it.name}: ${M.name.toLowerCase()} ${it.t} mm, ${it.w} × ${it.h} mm${it.r ? `, corners R${it.r}` : ''}${it.holes?.length ? `, ${it.holes.length} opening${it.holes.length > 1 ? 's' : ''}` : ''}`;
  });
}

/** The build notes for the inserts in use. */
export function insertNotes(items, kerf = 0.15) {
  if (!items.length) return [];
  const kinds = [...new Set(items.map((it) => it.kind))];
  return [
    `Inserts: ${items.reduce((s, it) => s + it.count, 0)} sheets to cut (the cut files are under Inserts, kerf ${kerf} mm allowed for). Each pocket is 0.2 mm bigger than its sheet and 0.2 mm deeper, so the sheet sits flush on its tape or glue.`,
    ...kinds.map((k) => `${INSERT_MATERIALS[k].name}: ${INSERT_MATERIALS[k].sheet}. ${INSERT_MATERIALS[k].tip} Fix with ${INSERT_MATERIALS[k].fix}.`),
  ];
}
