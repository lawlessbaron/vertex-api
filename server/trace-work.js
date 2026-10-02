// The heavy, CPU-only steps of a trace, kept apart from the request handling
// so they can run on a worker thread (trace-pool.js): finding and straightening
// the paper, and turning the AI's outlines into whole tools.
import { rectify, homography, PAPER_SIZES } from '../engine/trace/vision.js';
import { findPaper, dropPaper, addMissed } from '../engine/trace/detect.js';
import { wholeOutlines, objectPixels } from '../engine/trace/whole.js';

// The paper in the photo, straightened at 3 px/mm, and the photo → mm map.
export function prepSheet({ image, paper = 'a4' }) {
  const size = PAPER_SIZES[paper] || PAPER_SIZES.a4;
  const corners = findPaper(image, size)?.corners;
  if (!corners) return { error: 'paper' };
  const sheet = rectify(image, corners, size, 3);
  const W = sheet.widthMm, H = sheet.heightMm;
  return { size: { name: size.name }, sheet, W, H, toMm: homography(corners, [[0, 0], [W, 0], [W, H], [0, H]]) };
}

// The AI's outlines (mm, on the paper) → one outline per whole tool, plus
// anything that stands out from the paper the AI had no word for.
export function finishSheet({ raw, sheet }) {
  let mask = null;
  try { mask = objectPixels(sheet.image, sheet.pxPerMm); } catch { /* the AI's outlines alone */ }
  const ai = dropPaper(raw, sheet);
  const joined = ai.length ? wholeOutlines(ai, sheet, { mask }).map((w) => ({ polygon: w.polygon, label: w.label })) : [];
  return { joined, sheet };
}

export function addMissedOn({ joined, sheet }) {
  return addMissed(joined, sheet).shapes.map((s) => ({ polygon: s.polygon, label: s.label }));
}

export const OPS = { prepSheet, finishSheet, addMissedOn, ping: () => true };
