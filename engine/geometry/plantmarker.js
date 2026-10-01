// Plant markers. A label on a pointed stake, one for each name in the list,
// laid out on the bed together. The name is raised as its own part so it can
// print in a second colour. Prints flat.
import { Mesh } from './mesh.js';
import { circlePolygon, extrudePolygon } from './polygon.js';
import { textMesh, textUnits } from './font.js';
import { cleanName } from './keychain.js';

export const PLANTMARKER_DEFAULTS = {
  names: 'BASIL, MINT, THYME',
  shape: 'tag', // tag | round
  letters: 9, // letter height, mm
  stake: 90, // the stake's length below the label
  thickness: 3,
  raise: 0.8,
};

export function markerNames(text) {
  return String(text ?? '').split(/[,\n]/).map(cleanName).filter(Boolean).slice(0, 24);
}

function roundedRect(x0, y0, x1, y1, r, n = 6) {
  const pts = [];
  for (const [cx, cy, a0] of [[x1 - r, y0 + r, -90], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, 90], [x0 + r, y0 + r, 180]]) {
    for (let k = 0; k <= n; k++) { const a = ((a0 + (90 * k) / n) * Math.PI) / 180; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  }
  return pts;
}

/** One marker, its label centred on x = 0 with the stake's tip at y = 0. */
export function marker(name, o) {
  const h = Math.max(4, Math.min(20, o.letters)), T = Math.max(1.6, o.thickness), raise = Math.max(0.4, o.raise);
  const stake = Math.max(30, o.stake), sw = Math.max(6, Math.min(14, h * 1.1)), tip = sw * 1.4;
  const tw = (textUnits(name) * h) / 6, pad = Math.max(3, h * 0.45);
  const body = new Mesh();
  // The stake: a strip with a pointed end, reaching a little into the label.
  body.append(extrudePolygon([[0, 0], [sw / 2, tip], [sw / 2, stake + 2], [-sw / 2, stake + 2], [-sw / 2, tip]], [], 0, T));
  let W, H;
  if (o.shape === 'round') {
    const R = Math.max(Math.hypot(tw / 2, h / 2) + pad, h + pad); // the name's corners stay inside the circle
    W = H = 2 * R;
    body.append(extrudePolygon(circlePolygon(0, stake + R, R, 64), [], 0, T));
  } else {
    W = Math.max(tw + 2 * pad, sw + 10); H = h + 2 * pad;
    body.append(extrudePolygon(roundedRect(-W / 2, stake, W / 2, stake + H, Math.min(4, H / 3)), [], 0, T));
  }
  const cy = stake + H / 2;
  const letters = textMesh(name, -tw / 2, cy - h / 2, h, T - 0.01, T + raise);
  return { body, letters, width: W, height: stake + H };
}

export function generatePlantMarkers(options = {}) {
  const o = { ...PLANTMARKER_DEFAULTS, ...options };
  const names = markerNames(o.names);
  if (!names.length) names.push('PLANT');
  const body = new Mesh(), letters = new Mesh();
  let x = 0, tall = 0;
  for (const name of names) {
    const m = marker(name, o);
    const dx = x + m.width / 2;
    m.body.translate(dx, 0, 0);
    m.letters.translate(dx, 0, 0);
    body.append(m.body);
    letters.append(m.letters);
    x += m.width + 4;
    tall = Math.max(tall, m.height);
  }
  const shift = -(x - 4) / 2;
  body.translate(shift, -tall / 2, 0);
  letters.translate(shift, -tall / 2, 0);
  const T = Math.max(1.6, o.thickness);
  const notes = [`${names.length} marker${names.length > 1 ? 's' : ''}, ${Math.round(x - 4)} × ${Math.round(tall)} mm on the bed. Swap filament at ${T} mm for the names, or print it all in one colour. PETG or ASA last longest outdoors.`];
  return { parts: [{ mesh: body, name: `plant-markers-${names.length}` }, { mesh: letters, name: 'names' }], notes, names, size: [x - 4, tall] };
}
