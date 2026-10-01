// The steps around the AI that decide what is on the paper, shared by Admin →
// Trace a photo and the API site's tracer (copied there by its sync-engine
// script), so both see the same things:
//  - findPaper: both paper finders, keep the one whose sheet is most paper;
//  - dropPaper: AI outlines that are the paper itself, not a thing on it;
//  - addMissed: what the built-in trace finds that the AI didn't outline.
// Outlines are { polygon: [[x, y] mm], bbox: [x0, y0, x1, y1], areaMm2, label }.
import { detectPaper, detectPaperSimple, rectify, traceTools, TRACE_DEFAULTS } from './vision.js';

export function inside(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export function withBox(sh) {
  if (sh.bbox && sh.areaMm2 !== undefined) return sh;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, a = 0;
  sh.polygon.forEach(([x, y], i) => { const [u, v] = sh.polygon[(i + 1) % sh.polygon.length]; a += x * v - u * y; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
  return { ...sh, bbox: [x0, y0, x1, y1], areaMm2: Math.abs(a) / 2 };
}

/** The paper's colour: the brighter half of a coarse sample of the image. */
export function paperColour(img) {
  const { width: w, height: h, data: d } = img, sample = [];
  for (let y = 2; y < h; y += 7) for (let x = 2; x < w; x += 7) { const i = (y * w + x) * 4; sample.push([d[i], d[i + 1], d[i + 2], d[i] + d[i + 1] + d[i + 2]]); }
  sample.sort((a, b) => b[3] - a[3]);
  const top = sample.slice(0, Math.max(1, sample.length >> 1));
  return [0, 1, 2].map((c) => top.reduce((t, p) => t + p[c], 0) / top.length);
}

/** How much of a straightened sheet is paper-coloured (0–1). */
export function paperShare(sheet, step = 3) {
  const { width: w, height: h, data: d } = sheet.image, pc = paperColour(sheet.image);
  let n = 0, same = 0;
  for (let y = 1; y < h; y += step) for (let x = 1; x < w; x += step) { const i = (y * w + x) * 4; n++; if (Math.hypot(d[i] - pc[0], d[i + 1] - pc[1], d[i + 2] - pc[2]) < 45) same++; }
  return n ? same / n : 0;
}

/**
 * Both paper finders, each straightened small and scored by paperShare; the
 * best wins. The first finder alone sometimes took a desk mat or the table
 * edge in with the sheet (a huge zoom, the sheet traced as one "tool").
 * → { corners, score } or null.
 */
export function findPaper(photo, paper) {
  const tries = [];
  for (const find of [detectPaper, detectPaperSimple]) {
    let c = null;
    try { c = find(photo); } catch { /* the other finder */ }
    if (c && !tries.some((t) => t.corners.every(([x, y], i) => Math.hypot(x - c[i][0], y - c[i][1]) < 4))) tries.push({ corners: c, score: paperShare(rectify(photo, c, paper, 1)) });
  }
  return tries.sort((a, b) => b.score - a.score)[0] || null;
}

/** An outline mostly paper-coloured inside: the sheet (or a patch of it). */
export function mostlyPaper(sh, sheet, paper = paperColour(sheet.image)) {
  const { image: img, pxPerMm: k } = sheet, d = img.data, w = img.width, h = img.height;
  const [x0, y0, x1, y1] = withBox(sh).bbox, step = Math.max(1, Math.min(x1 - x0, y1 - y0) / 24);
  let n = 0, same = 0;
  for (let y = y0 + step / 2; y < y1; y += step) for (let x = x0 + step / 2; x < x1; x += step) {
    if (!inside(sh.polygon, x, y)) continue;
    const px = Math.min(w - 1, Math.round(x * k)), py = Math.min(h - 1, Math.round(y * k)), i = (py * w + px) * 4;
    n++;
    if (Math.hypot(d[i] - paper[0], d[i + 1] - paper[1], d[i + 2] - paper[2]) < 38) same++;
  }
  return n > 8 && same / n > 0.55;
}

const GENERIC = /^(object|container|tool)?$/i;
/**
 * The AI's outlines without the paper itself: generic answers (object,
 * container, tool, none) and sheet-sized ones are dropped when mostly paper.
 * A white thing the AI named ("screwdriver") is never tested.
 */
export function dropPaper(shapes, sheet) {
  const area = (sheet.image.width / sheet.pxPerMm) * (sheet.image.height / sheet.pxPerMm), paper = paperColour(sheet.image);
  return shapes.map(withBox).filter((sh) => !((GENERIC.test(String(sh.label || '').trim()) || sh.areaMm2 > 0.25 * area) && mostlyPaper(sh, sheet, paper)));
}

/**
 * Two detectors, one answer: the AI names what it recognises; the built-in
 * trace finds whatever stands out from the paper. Every built-in find the AI
 * covers less than 30% of is added (over 60 mm², under half the sheet, not
 * paper). → { shapes, added }.
 */
export function addMissed(ai, sheet, options = {}, found = null) {
  // found: the built-in trace already run (the page starts it while the AI is working).
  if (!found) { try { found = traceTools(sheet, { ...TRACE_DEFAULTS, ...options, clearance: 0 }); } catch { return { shapes: ai, added: 0 }; } }
  const area = (sheet.image.width / sheet.pxPerMm) * (sheet.image.height / sheet.pxPerMm), paper = paperColour(sheet.image);
  const out = [...ai];
  let added = 0;
  for (const c of found) {
    if (c.areaMm2 < 60 || c.areaMm2 > 0.5 * area || mostlyPaper(c, sheet, paper)) continue;
    const [x0, y0, x1, y1] = c.bbox, step = Math.max(1, Math.min(x1 - x0, y1 - y0) / 14);
    let n = 0, covered = 0;
    for (let y = y0 + step / 2; y < y1; y += step) for (let x = x0 + step / 2; x < x1; x += step) {
      if (!inside(c.polygon, x, y)) continue;
      n++;
      if (out.some((a) => inside(a.polygon, x, y))) covered++;
    }
    if (n && covered / n < 0.3) { out.push({ ...c, label: c.label || '', found: 'contrast' }); added++; }
  }
  return { shapes: out, added };
}
