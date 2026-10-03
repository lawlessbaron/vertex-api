// Print AI checks: the rules behind /ai/v1/check/*. Pure functions, no I/O, so
// the same rules run in tests, on the server and (as Python) in the slicer plugin
// (VERTEX plugins/vertex-print-ai). Findings always say what to change, by how much,
// and why, in plain words.
//
//   checkSettings(settings, context)  slicer settings (an object, G-code comments or a sliced 3MF)
//   checkModel(tris, context)         a model's triangles (STL, 3MF or an engine mesh)
import { inflateRawSync } from 'node:zlib';

export const SETTINGS_VERSION = 'settings-0.2.0';
export const MODEL_VERSION = 'model-0.1.0';

// Nozzle temperature ranges (°C) per filament family: outside these, prints usually fail.
export const TEMPS = {
  PLA: [190, 230], 'PLA-CF': [200, 240], PETG: [220, 260], 'PETG-CF': [230, 270], PCTG: [230, 265],
  ABS: [230, 270], ASA: [235, 275], TPU: [200, 240], PA: [250, 300], 'PA-CF': [260, 300],
  PC: [260, 310], PVA: [185, 220], HIPS: [220, 250],
};
// Bed temperature ranges (°C).
export const BEDS = {
  PLA: [45, 70], 'PLA-CF': [45, 70], PETG: [65, 90], 'PETG-CF': [65, 90], PCTG: [70, 90],
  ABS: [90, 110], ASA: [90, 110], TPU: [30, 60], PA: [70, 110], 'PA-CF': [70, 110], PC: [100, 120], PVA: [45, 70], HIPS: [90, 110],
};
// Part cooling ceilings (%) for materials that warp or crack with strong cooling.
export const FAN_MAX = { ABS: 40, ASA: 40, PC: 30, PA: 40, 'PA-CF': 40 };
const ABRASIVE = ['CF', 'GF'];

export const filaments = () => Object.keys(TEMPS).map((id) => ({
  id, nozzle: { min: TEMPS[id][0], max: TEMPS[id][1] }, bed: BEDS[id] ? { min: BEDS[id][0], max: BEDS[id][1] } : null,
  fanMax: FAN_MAX[id] ?? 100, abrasive: ABRASIVE.some((a) => id.includes(a)), hardenedNozzle: ABRASIVE.some((a) => id.includes(a)),
}));

// ---------------------------------------------------------------- settings in
const SETTING = /^;?\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/;

/** Every "key = value" line a slicer wrote: "; key = value" in G-code (Orca, Bambu Studio, PrusaSlicer), plain in a PrusaSlicer .ini. */
export function settingsFromText(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const m = SETTING.exec(line.trim());
    if (m && Object.keys(out).length < 5000) out[m[1].toLowerCase()] = m[2].trim();
  }
  return out;
}

/** The files in a ZIP (3MF), as { name: Buffer }; only the names wanted, to keep memory down. */
export function readZip(buf, want = () => true) {
  const out = {};
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20), nameLen = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30), comment = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extra + comment;
    if (!want(name)) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    out[name] = method === 0 ? Buffer.from(data) : method === 8 ? inflateRawSync(data, { maxOutputLength: 256 * 1024 * 1024 }) : null;
  }
  return out;
}

/** Settings out of a sliced 3MF: Bambu/Orca write JSON, PrusaSlicer writes "; key = value". */
export function settingsFrom3mf(buf) {
  const files = readZip(buf, (n) => /(project_settings\.config|Slic3r_PE\.config|PrusaSlicer\.config)$/i.test(n) || /^Metadata\/plate_\d+\.gcode$/i.test(n));
  const out = {};
  for (const [name, data] of Object.entries(files)) {
    if (!data) continue;
    const text = data.toString('utf8');
    if (/project_settings\.config$/i.test(name)) { try { for (const [k, v] of Object.entries(JSON.parse(text))) out[k.toLowerCase()] = Array.isArray(v) ? v.join(';') : String(v); } catch { /* not JSON */ } }
    else Object.assign(out, settingsFromText(text));
  }
  return out;
}

// ---------------------------------------------------------------- settings checks
function first(s, ...keys) {
  for (const k of keys) {
    const v = s[k];
    if (v === undefined || v === null || v === '') continue;
    const list = Array.isArray(v) ? v : String(v).split(/[;,]/);
    const vals = list.map((x) => String(x).trim().replace(/^"|"$/g, '')).filter(Boolean);
    if (vals.length) return vals;
  }
  return [];
}
const num = (v) => { const x = parseFloat(String(v ?? '').replace(/%$/, '')); return Number.isFinite(x) ? x : null; };
const r2 = (v) => Math.round(v * 100) / 100;
export const familyOf = (filament) => Object.keys(TEMPS).sort((a, b) => b.length - a.length).find((f) => String(filament || '').toUpperCase().startsWith(f)) || null;

/**
 * Slicer settings against safe ranges for the filament and nozzle. settings: an object
 * of slicer keys (any slicer's names), context: { filament, nozzle } when the settings
 * don't say. → { findings, model, filament, nozzle, summary }
 */
export function checkSettings(settings = {}, context = {}) {
  const s = Object.fromEntries(Object.entries(settings || {}).map(([k, v]) => [String(k).toLowerCase(), v]));
  const findings = [];
  const add = (code, severity, message, extra = {}) => findings.push({ code, severity, message, ...extra });
  const fix = (setting, from, to, unit, why) => ({ id: `${setting}:${to}`, setting, from, to, ...(unit ? { unit } : {}), ...(why ? { why } : {}) });

  const filament = String((first(s, 'filament_type')[0] || context.filament || '')).toUpperCase();
  const nozzle = num(first(s, 'nozzle_diameter')[0]) ?? num(context.nozzle);
  const temp = num(first(s, 'nozzle_temperature', 'temperature')[0]);
  const temp0 = num(first(s, 'nozzle_temperature_initial_layer', 'first_layer_temperature')[0]);
  const bed = num(first(s, 'hot_plate_temp', 'textured_plate_temp', 'bed_temperature', 'cool_plate_temp')[0]);
  const layer = num(first(s, 'layer_height')[0]);
  const layer0 = num(first(s, 'initial_layer_print_height', 'first_layer_height')[0]);
  const retract = num(first(s, 'retraction_length', 'retract_length')[0]);
  const fan = num(first(s, 'fan_max_speed', 'max_fan_speed')[0]);
  const nozzleType = String(first(s, 'nozzle_type')[0] || context.nozzleType || '').toLowerCase();
  const walls = num(first(s, 'wall_loops', 'perimeters')[0]);
  const infill = num(first(s, 'sparse_infill_density', 'fill_density')[0]);
  const speed = num(first(s, 'outer_wall_speed', 'external_perimeter_speed')[0]);

  const family = familyOf(filament);
  if (family && temp !== null) {
    const [lo, hi] = TEMPS[family];
    if (temp < lo) add('temp-low-for-filament', 'warn', `${temp}° is cool for ${family} (usually ${lo}–${hi}°): expect weak layers or under-extrusion.`, { confidence: 0.85, fixes: [fix('nozzle_temperature', temp, lo + 5, '°C', 'Into the range where layers bond.')], test: 'Print a 20 mm cube and try to snap it along the layers.' });
    else if (temp > hi) add('temp-high-for-filament', 'warn', `${temp}° is hot for ${family} (usually ${lo}–${hi}°): expect stringing and blobs.`, { confidence: 0.8, fixes: [fix('nozzle_temperature', temp, hi - 5, '°C', 'Less ooze between moves.')], test: 'Print a stringing test (two towers) before the real part.' });
  }
  if (family && bed !== null && BEDS[family]) {
    const [lo, hi] = BEDS[family];
    if (bed < lo - 5) add('bed-cool-for-filament', 'warn', `A ${bed}° bed is cool for ${family} (usually ${lo}–${hi}°): the first layer can let go.`, { confidence: 0.75, fixes: [fix('bed_temperature', bed, lo, '°C', 'Warm enough for the first layer to hold.')] });
    else if (bed > hi + 5) add('bed-hot-for-filament', 'info', `A ${bed}° bed is hot for ${family} (usually ${lo}–${hi}°): the bottom edges can sag (elephant's foot).`, { confidence: 0.6, fixes: [fix('bed_temperature', bed, hi, '°C')] });
  }
  if (temp !== null && temp0 !== null && temp0 < temp - 5) add('first-layer-cooler', 'info', `The first layer (${temp0}°) is cooler than the rest (${temp}°); most filaments stick better a little hotter, not cooler.`, { confidence: 0.6, fixes: [fix('nozzle_temperature_initial_layer', temp0, temp + 5, '°C')] });
  if (nozzle && layer) {
    if (layer > nozzle * 0.8) add('layer-too-tall', 'fail', `${layer} mm layers are too tall for a ${nozzle} mm nozzle (keep under ${r2(nozzle * 0.75)} mm).`, { confidence: 0.95, fixes: [fix('layer_height', layer, r2(nozzle * 0.5), 'mm', 'Half the nozzle is the safe default.')] });
    else if (layer < nozzle * 0.2) add('layer-very-thin', 'info', `${layer} mm layers on a ${nozzle} mm nozzle print very slowly for little gain.`, { confidence: 0.7, fixes: [fix('layer_height', layer, r2(nozzle * 0.3), 'mm')] });
  }
  if (nozzle && layer0 && layer0 > nozzle * 0.75) add('first-layer-tall', 'warn', `A ${layer0} mm first layer is tall for a ${nozzle} mm nozzle: it can lift at the corners.`, { confidence: 0.8, fixes: [fix('first_layer_height', layer0, r2(nozzle * 0.5), 'mm')] });
  if (retract !== null && retract > 6) add('retraction-long', 'warn', `${retract} mm of retraction is long: on direct-drive printers it can grind the filament or jam.`, { confidence: 0.7, fixes: [fix('retraction_length', retract, 1, 'mm', '0.5–2 mm suits direct drive; 4–6 mm suits Bowden.')] });
  if (family && FAN_MAX[family] !== undefined && fan !== null && fan > FAN_MAX[family]) add('fan-high-for-filament', 'warn', `${fan}% part cooling is a lot for ${family}: it warps and layers can crack.`, { confidence: 0.8, fixes: [fix('fan_max_speed', fan, FAN_MAX[family], '%')] });
  if (ABRASIVE.some((a) => filament.includes(a)) && ['brass', ''].includes(nozzleType)) add('abrasive-filament', nozzleType === 'brass' ? 'warn' : 'info', `${filament} is abrasive: use a hardened steel nozzle, or a brass one wears out within a few hundred grams.`, { confidence: nozzleType === 'brass' ? 0.95 : 0.5, fixes: [fix('nozzle_type', nozzleType || 'unknown', 'hardened_steel')] });
  if (walls !== null && walls < 2) add('single-wall', 'warn', `${walls} wall${walls === 1 ? '' : 's'} is thin: parts leak, flex and show the infill through.`, { confidence: 0.8, fixes: [fix('wall_loops', walls, 2, null, 'Two walls is the usual minimum; three for strong parts.')] });
  if (infill !== null && infill > 0 && infill < 8) add('infill-very-low', 'info', `${infill}% infill gives tops little to sit on: expect pillowing on flat tops.`, { confidence: 0.6, fixes: [fix('sparse_infill_density', `${infill}%`, '12%')] });
  if (family === 'TPU' && speed !== null && speed > 60) add('tpu-too-fast', 'warn', `${speed} mm/s outer walls is fast for TPU: it buckles in the extruder.`, { confidence: 0.75, fixes: [fix('outer_wall_speed', speed, 30, 'mm/s')] });

  if (!findings.length) add('all-clear', 'info', 'Nothing out of the ordinary in these settings.', { confidence: 0.9 });
  return { findings, model: SETTINGS_VERSION, filament: filament || null, family, nozzle: nozzle ?? null, read: Object.keys(s).length, summary: summarise(findings) };
}

export function summarise(findings) {
  const n = (sev) => findings.filter((f) => f.severity === sev).length;
  if (findings.length === 1 && findings[0].code === 'all-clear') return 'All clear.';
  const parts = [n('fail') && `${n('fail')} to fix`, n('warn') && `${n('warn')} to check`, n('info') && `${n('info')} tip${n('info') === 1 ? '' : 's'}`].filter(Boolean);
  return parts.join(', ') + '.';
}

// ---------------------------------------------------------------- models in
/** Triangles from an STL (binary or ASCII) as a Float32Array, 9 numbers each. */
export function trisFromStl(buf) {
  if (buf.length >= 84) {
    const n = buf.readUInt32LE(80);
    if (84 + n * 50 === buf.length) {
      const out = new Float32Array(n * 9);
      for (let i = 0; i < n; i++) for (let j = 0; j < 9; j++) out[i * 9 + j] = buf.readFloatLE(84 + i * 50 + 12 + j * 4);
      return out;
    }
  }
  const text = buf.toString('latin1');
  if (!/^\s*solid/.test(text)) throw new Error('not an STL');
  const v = [];
  const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
  for (let m; (m = re.exec(text));) v.push(+m[1], +m[2], +m[3]);
  if (!v.length || v.length % 9) throw new Error('not an STL');
  return Float32Array.from(v);
}

/** Triangles from a model 3MF (every object, with build transforms ignored). */
export function trisFrom3mf(buf) {
  const files = readZip(buf, (n) => /\.model$/i.test(n));
  const out = [];
  for (const data of Object.values(files)) {
    if (!data) continue;
    const xml = data.toString('utf8');
    for (const mesh of xml.matchAll(/<(?:\w+:)?mesh>([\s\S]*?)<\/(?:\w+:)?mesh>/g)) {
      const verts = [...mesh[1].matchAll(/<(?:\w+:)?vertex\s+([^>]*)\/?>/g)].map((m) => ['x', 'y', 'z'].map((a) => +(new RegExp(`\\b${a}="([^"]+)"`).exec(m[1])?.[1] ?? 0)));
      for (const t of mesh[1].matchAll(/<(?:\w+:)?triangle\s+([^>]*)\/?>/g)) {
        const ids = ['v1', 'v2', 'v3'].map((a) => +(new RegExp(`\\b${a}="(\\d+)"`).exec(t[1])?.[1] ?? -1));
        if (ids.every((i) => verts[i])) for (const i of ids) out.push(...verts[i]);
      }
    }
  }
  if (!out.length) throw new Error('no mesh in this 3MF');
  return Float32Array.from(out);
}

/** Triangles from engine meshes ({ positions, indices }). */
export function trisFromMeshes(meshes) {
  const total = meshes.reduce((t, m) => t + m.indices.length, 0), out = new Float32Array(total * 3);
  let o = 0;
  for (const { positions: p, indices: ix } of meshes) for (const i of ix) { out[o++] = p[i * 3]; out[o++] = p[i * 3 + 1]; out[o++] = p[i * 3 + 2]; }
  return out;
}

// ---------------------------------------------------------------- model checks
const ORIENTS = [
  { id: '+z', name: 'as it is', up: [0, 0, 1] }, { id: '-z', name: 'upside down', up: [0, 0, -1] },
  { id: '+y', name: 'on its back', up: [0, 1, 0] }, { id: '-y', name: 'on its front', up: [0, -1, 0] },
  { id: '+x', name: 'on its left side', up: [1, 0, 0] }, { id: '-x', name: 'on its right side', up: [-1, 0, 0] },
];

/** Overhangs, bridges and bed contact with "up" as given. */
function lieOf(t, up, angle) {
  const n = t.length / 9, steep = Math.sin((angle * Math.PI) / 180);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < t.length; i += 3) { const h = t[i] * up[0] + t[i + 1] * up[1] + t[i + 2] * up[2]; if (h < lo) lo = h; if (h > hi) hi = h; }
  let overhang = 0, bridge = 0, contact = 0;
  for (let k = 0; k < n; k++) {
    const i = k * 9;
    const ux = t[i + 3] - t[i], uy = t[i + 4] - t[i + 1], uz = t[i + 5] - t[i + 2], vx = t[i + 6] - t[i], vy = t[i + 7] - t[i + 1], vz = t[i + 8] - t[i + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx, len = Math.hypot(cx, cy, cz);
    if (!len) continue;
    const area = len / 2, nUp = (cx * up[0] + cy * up[1] + cz * up[2]) / len;
    if (nUp >= -steep) continue; // faces up, sideways or a gentle slope: prints fine
    const h = Math.max(t[i] * up[0] + t[i + 1] * up[1] + t[i + 2] * up[2], t[i + 3] * up[0] + t[i + 4] * up[1] + t[i + 5] * up[2], t[i + 6] * up[0] + t[i + 7] * up[1] + t[i + 8] * up[2]);
    if (h - lo < 0.2) { if (nUp < -0.99) contact += area; continue; } // on the bed
    if (nUp < -0.99) bridge += area; else overhang += area;
  }
  return { overhang, bridge, contact, height: hi - lo };
}

/**
 * A model before slicing: size, closed or not, overhangs, bridges, bed contact,
 * and the best of the six flat orientations. tris: Float32Array (9 per triangle).
 * context: { bed: [x, y, z] mm, overhangAngle (45) } → { findings, model, stats, orientation }
 */
export function checkModel(tris, context = {}) {
  const n = Math.floor(tris.length / 9);
  if (!n) throw new Error('empty model');
  const findings = [];
  const add = (code, severity, message, extra = {}) => findings.push({ code, severity, message, ...extra });
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tris.length; i += 3) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], tris[i + a]); max[a] = Math.max(max[a], tris[i + a]); }
  const size = max.map((v, a) => v - min[a]);
  let volume = 0, area = 0;
  const edges = new Map(), key = (i) => `${Math.round(tris[i] * 1e3)},${Math.round(tris[i + 1] * 1e3)},${Math.round(tris[i + 2] * 1e3)}`;
  for (let k = 0; k < n; k++) {
    const i = k * 9, [ax, ay, az, bx, by, bz, cx, cy, cz] = tris.subarray(i, i + 9);
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    area += Math.hypot((by - ay) * (cz - az) - (bz - az) * (cy - ay), (bz - az) * (cx - ax) - (bx - ax) * (cz - az), (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) / 2;
    if (n <= 400_000) {
      const v = [key(i), key(i + 3), key(i + 6)];
      for (let e = 0; e < 3; e++) { const a = v[e], b = v[(e + 1) % 3]; if (a === b) continue; const id = a < b ? `${a}|${b}` : `${b}|${a}`; edges.set(id, (edges.get(id) || 0) + 1); }
    }
  }
  let open = 0, nonManifold = 0;
  for (const c of edges.values()) { if (c === 1) open++; else if (c > 2) nonManifold++; }

  const angle = Math.min(80, Math.max(20, Number(context.overhangAngle) || 45));
  const lies = ORIENTS.map((o) => ({ ...o, ...lieOf(tris, o.up, angle) }));
  const score = (l) => l.overhang + 0.5 * l.bridge - 0.2 * l.contact + 0.01 * l.height * Math.sqrt(area);
  const now = lies[0], best = lies.reduce((b, l) => (score(l) < score(b) ? l : b), now);
  const r1 = (v) => Math.round(v * 10) / 10, mm2 = (v) => Math.round(v);
  const stats = {
    triangles: n, sizeMm: size.map(r1), volumeCm3: r1(Math.abs(volume) / 1000), surfaceCm2: r1(area / 100),
    closed: edges.size ? open === 0 && nonManifold === 0 : null, openEdges: open, nonManifoldEdges: nonManifold,
    overhangMm2: mm2(now.overhang), bridgeMm2: mm2(now.bridge), bedContactMm2: mm2(now.contact), overhangAngle: angle,
  };

  const longest = Math.max(...size);
  if (longest < 3) add('model-tiny', 'warn', `The model is only ${r1(longest)} mm across: it was probably saved in centimetres, metres or inches. Scale it up.`, { confidence: 0.7, fixes: [{ id: 'scale:25.4', setting: 'scale', from: '100%', to: '2540%', why: 'From inches to millimetres.' }] });
  if (longest > 2000) add('model-huge', 'warn', `The model is ${r1(longest)} mm across: it was probably saved in micrometres or the wrong unit.`, { confidence: 0.6 });
  if (Array.isArray(context.bed) && context.bed.length >= 2) {
    const bed = context.bed.map(Number), fits = (s) => s[0] <= bed[0] && s[1] <= bed[1] && (!bed[2] || s[2] <= bed[2]);
    const sz = [size[0], size[1], size[2]];
    if (!fits(sz) && !fits([sz[1], sz[0], sz[2]])) add('too-big-for-bed', 'fail', `At ${sz.map(r1).join(' × ')} mm it doesn't fit a ${bed.join(' × ')} mm printer. Split it, scale it or lay it another way.`, { confidence: 0.95 });
  }
  if (stats.closed === false) add('not-watertight', open > 0 ? 'warn' : 'info', `The mesh has ${open ? `${open} open edge${open === 1 ? '' : 's'}` : ''}${open && nonManifold ? ' and ' : ''}${nonManifold ? `${nonManifold} edge${nonManifold === 1 ? '' : 's'} shared by more than two faces` : ''}: slicers can leave gaps or fill it wrongly. Repair it in your slicer (Fix model) first.`, { confidence: 0.85, evidence: { openEdges: open, nonManifoldEdges: nonManifold } });
  if (volume < 0 && stats.closed) add('inside-out', 'warn', 'The faces point inwards (the model is inside out). Most slicers fix this; if yours shows it hollow, flip the normals.', { confidence: 0.8 });

  const ohShare = now.overhang / Math.max(area, 1);
  if (now.overhang > 50 && ohShare > 0.02) add('steep-overhangs', ohShare > 0.12 ? 'warn' : 'info', `About ${mm2(now.overhang)} mm² overhangs steeper than ${angle}° with nothing under it: it needs supports, or it droops.`, { confidence: 0.8, evidence: { overhangMm2: mm2(now.overhang), share: Math.round(ohShare * 1000) / 1000 }, fixes: [{ id: 'support:on', setting: 'enable_support', from: 'off', to: 'on', why: 'Tree supports leave the fewest marks.' }] });
  if (now.bridge > 50) add('bridges', 'info', `About ${mm2(now.bridge)} mm² of flat ceiling prints over air (bridges). Short bridges are fine; long ones sag without supports.`, { confidence: 0.7, evidence: { bridgeMm2: mm2(now.bridge) } });
  if (best.id !== now.id && score(best) < score(now) - Math.max(50, 0.25 * Math.abs(score(now)))) add('better-orientation', 'info', `Laid ${best.name}, it needs about ${mm2(best.overhang + best.bridge)} mm² of support instead of ${mm2(now.overhang + now.bridge)} mm² and sits on ${mm2(best.contact)} mm² of bed.`, { confidence: 0.75, fixes: [{ id: `orient:${best.id}`, setting: 'orientation', from: now.id, to: best.id, why: 'Less support to print and pull off.' }] });

  const footprint = Math.max(now.contact, 1), tall = now.height / Math.sqrt(footprint);
  if (now.contact < 1) add('no-flat-base', 'warn', 'Nothing lies flat on the bed this way up: it will tip or need supports from the plate. Lay a flat face down.', { confidence: 0.8 });
  else if (tall > 8 && now.height > 30) add('tall-on-small-base', 'warn', `It stands ${r1(now.height)} mm tall on ${mm2(now.contact)} mm² of bed: it can rock loose part way up. Add a brim, or lay it down.`, { confidence: 0.7, fixes: [{ id: 'brim:5', setting: 'brim_width', from: 0, to: 5, unit: 'mm', why: 'More grip at the base.' }] });
  else if (now.contact < 0.02 * area && now.contact < 100) add('small-bed-contact', 'info', `Only ${mm2(now.contact)} mm² touches the bed: a brim helps it stay put.`, { confidence: 0.6, fixes: [{ id: 'brim:4', setting: 'brim_width', from: 0, to: 4, unit: 'mm' }] });

  if (!findings.length) add('all-clear', 'info', 'It prints as it is: no steep overhangs, a flat base and a closed mesh.', { confidence: 0.85 });
  return {
    findings, model: MODEL_VERSION, stats, summary: summarise(findings),
    orientation: { current: now.id, best: best.id, options: lies.map((l) => ({ id: l.id, name: l.name, overhangMm2: mm2(l.overhang), bridgeMm2: mm2(l.bridge), bedContactMm2: mm2(l.contact), heightMm: r1(l.height) })) },
  };
}

// ---------- writing fixes into a settings file ----------
// A fix names one setting; each slicer calls it something of its own. Every name it might have in a file.
export const FIX_KEYS = {
  nozzle_temperature: ['nozzle_temperature', 'temperature'],
  nozzle_temperature_initial_layer: ['nozzle_temperature_initial_layer', 'first_layer_temperature'],
  bed_temperature: ['hot_plate_temp', 'textured_plate_temp', 'bed_temperature', 'cool_plate_temp', 'eng_plate_temp'],
  bed_temperature_initial_layer: ['hot_plate_temp_initial_layer', 'textured_plate_temp_initial_layer', 'first_layer_bed_temperature'],
  layer_height: ['layer_height'],
  first_layer_height: ['initial_layer_print_height', 'first_layer_height'],
  retraction_length: ['retraction_length', 'retract_length'],
  fan_max_speed: ['fan_max_speed', 'max_fan_speed'],
  wall_loops: ['wall_loops', 'perimeters'],
  sparse_infill_density: ['sparse_infill_density', 'fill_density'],
  outer_wall_speed: ['outer_wall_speed', 'external_perimeter_speed'],
  nozzle_type: ['nozzle_type'],
};
const cleanFixes = (list) => (Array.isArray(list) ? list : []).filter((f) => FIX_KEYS[f?.setting] && f.to !== undefined && f.to !== null && String(f.to).length < 40).slice(0, 20);
// A value in the file's own shape: "215,215" stays two values; "15%" keeps its %.
const reshape = (old, to) => {
  const v = String(to);
  const one = (o) => (/%$/.test(String(o).trim()) && !/%$/.test(v) ? `${v}%` : v);
  return String(old).includes(',') ? String(old).split(',').map(one).join(',') : one(old);
};
function applyText(text, fixes, done) {
  return String(text).split(/(\r?\n)/).map((line) => {
    const m = /^(;?\s*)([A-Za-z0-9_]+)(\s*=\s*)(.*)$/.exec(line);
    if (!m) return line;
    const f = fixes.find((x) => FIX_KEYS[x.setting].includes(m[2].toLowerCase()));
    if (!f) return line;
    done.add(f.setting);
    return `${m[1]}${m[2]}${m[3]}${reshape(m[4], f.to)}`;
  }).join('');
}
function applyJson(obj, fixes, done) {
  for (const f of fixes) for (const k of FIX_KEYS[f.setting]) {
    if (!(k in obj)) continue;
    obj[k] = Array.isArray(obj[k]) ? obj[k].map((o) => reshape(o, f.to)) : typeof obj[k] === 'number' ? Number(f.to) : reshape(obj[k], f.to);
    done.add(f.setting);
  }
  return obj;
}
// Errors here carry the HTTP status the caller should answer with.
const bad = (message) => Object.assign(new Error(message), { status: 400 });
/** The settings file with the chosen fixes written in, in its own format. Returns { buf, applied, missing }.
 *  zip: a stored-zip writer (entries → bytes), for 3MF projects; each site passes its own. */
export function applyFixes(buf, ext, list, { zip } = {}) {
  const fixes = cleanFixes(list);
  if (!fixes.length) throw bad('Pick at least one fix to apply.');
  const done = new Set();
  let out;
  if (ext === 'ini' || ext === 'cfg' || ext === 'txt') out = Buffer.from(applyText(buf.toString('utf8'), fixes, done));
  else if (ext === 'json') {
    let obj;
    try { obj = JSON.parse(buf.toString('utf8')); } catch { throw bad('That JSON doesn\'t read as slicer settings.'); }
    out = Buffer.from(JSON.stringify(applyJson(obj, fixes, done), null, 4));
  } else if (ext === '3mf') {
    let files;
    try { files = readZip(buf); } catch { throw bad('That 3MF won\'t open.'); }
    for (const [name, data] of Object.entries(files)) {
      if (!data) throw bad('That 3MF packs its files in a way we can\'t rewrite. Apply the fixes in your slicer.');
      if (name === 'Metadata/project_settings.config') files[name] = Buffer.from(JSON.stringify(applyJson(JSON.parse(data.toString('utf8')), fixes, done), null, 4));
      else if (/^Metadata\/.*\.(config|ini)$/i.test(name) && !/\.json$/i.test(name)) { try { JSON.parse(data.toString('utf8')); } catch { files[name] = Buffer.from(applyText(data.toString('utf8'), fixes, done)); } }
    }
    out = Buffer.from(zip(Object.entries(files)));
  } else throw bad(ext === 'gcode' ? 'G-code is already sliced: apply the fixes to your slicer profile (.ini, .json or the 3MF project) and slice again.' : 'Fixes can be written into .ini, .json and 3MF project files.');
  return { buf: out, applied: [...done], missing: fixes.map((f) => f.setting).filter((x) => !done.has(x)) };
}
