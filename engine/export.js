// STL and 3MF writers with no dependencies. Every file names the engine version that made it.
import { engineLabel } from './engine.js';
import { currentSerial } from './serial.js';
import { activeExportMeta } from './licences.js';

// `meta` is the file's credit and licence: { designer, licence, licenceName, credit, url, note, own }.
// Without one, the licence of the studio in use (licences.js: CC BY-NC-SA 4.0, with
// the credit for the system it's built on). It goes first in the STL header and
// into the 3MF's metadata, with a LICENSE.txt inside the 3MF.
export function toSTL(mesh, name = 'gridfinity', meta = null) {
  meta = meta || activeExportMeta();
  const p = mesh.positions;
  const ix = mesh.indices;
  const n = ix.length / 3;
  const buf = new ArrayBuffer(84 + 50 * n);
  const view = new DataView(buf);
  // The serial and engine first, so a long name is what gets cut at 80 characters.
  // Cut in bytes, not characters: '·' and accented letters take two.
  // VERTEX's own files: the serial first, then the licence. Others' parts: their credit first.
  const header = new TextEncoder().encode((meta.own ? [currentSerial(), meta.short, engineLabel(), name] : [meta.credit, 'made with VERTEX', currentSerial()]).filter(Boolean).join(' · ')).subarray(0, 80);
  new Uint8Array(buf, 0, 80).set(header);
  view.setUint32(80, n, true);
  let off = 84;
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (const v of [nx, ny, nz]) { view.setFloat32(off, v, true); off += 4; }
    for (const i of [a, b, c]) {
      for (let k = 0; k < 3; k++) { view.setFloat32(off, p[i + k], true); off += 4; }
    }
    view.setUint16(off, 0, true);
    off += 2;
  }
  return new Uint8Array(buf);
}

// One printable object per entry; pass a mesh or [{ mesh, name, group, filament, color }, ...].
// Parts with the same `group` become one object made of several parts (label
// text stays locked to its bin). `filament` (1-based) picks the AMS slot in
// Bambu Studio and OrcaSlicer; `color` is shown by other 3MF viewers.
// A coordinate to 4 decimal places, written as String(+v.toFixed(4)) would
// (no trailing zeros, no "-0"), without toFixed's cost. Values within a hair of
// a rounding halfway point go through toFixed itself, so the text is the same.
const P10 = 10000;
export function num4(v) {
  const a = Math.abs(v) * P10, f = a - Math.floor(a);
  if (!(a < 9e15) || Math.abs(f - 0.5) < 1e-6) return String(+v.toFixed(4));
  const n = Math.round(a);
  if (n === 0) return '0';
  const whole = Math.floor(n / P10), frac = n - whole * P10;
  let out = (v < 0 ? '-' : '') + whole;
  if (frac) { let d = String(frac).padStart(4, '0'); while (d.endsWith('0')) d = d.slice(0, -1); out += '.' + d; }
  return out;
}

export function to3MF(input, name = 'gridfinity', meta = null) {
  meta = meta || activeExportMeta();
  const parts = (Array.isArray(input) ? input : [{ mesh: input, name }]).map((p, k) => ({ ...p, id: k + 1 }));
  const clean = (s) => String(s).replace(/[<>&"]/g, '');
  const colors = [...new Set(parts.map((p) => (p.color || '#9EC4B5').toUpperCase()))];
  const meshObject = ({ mesh, name: partName, id, color }) => {
    const p = mesh.positions;
    const ix = mesh.indices;
    const verts = [];
    for (let i = 0; i < p.length; i += 3) {
      verts.push(`<vertex x="${num4(p[i])}" y="${num4(p[i + 1])}" z="${num4(p[i + 2])}"/>`);
    }
    const tris = [];
    for (let t = 0; t < ix.length; t += 3) tris.push(`<triangle v1="${ix[t]}" v2="${ix[t + 1]}" v3="${ix[t + 2]}"/>`);
    const pindex = colors.indexOf((color || '#9EC4B5').toUpperCase());
    return `<object id="${id}" name="${clean(partName || `${name}-${id}`)}" type="model" pid="1" pindex="${pindex}"><mesh><vertices>${verts.join('')}</vertices><triangles>${tris.join('')}</triangles></mesh></object>`;
  };
  // Group parts into printable objects.
  const groups = [];
  for (const p of parts) {
    const g = p.group && groups.find((x) => x.key === p.group);
    if (g) g.parts.push(p);
    else groups.push({ key: p.group || `solo-${p.id}`, parts: [p] });
  }
  let nextId = parts.length + 1;
  const assemblies = [];
  const build = [];
  for (const g of groups) {
    if (g.parts.length === 1) {
      build.push(g.parts[0].id);
      continue;
    }
    g.id = nextId++;
    assemblies.push(`<object id="${g.id}" name="${clean(g.parts[0].name || name)}" type="model"><components>${g.parts.map((p) => `<component objectid="${p.id}"/>`).join('')}</components></object>`);
    build.push(g.id);
  }
  const model =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n' +
    `<metadata name="Title">${clean(name)}</metadata>\n` +
    `<metadata name="Designer">${clean(meta.designer)}</metadata>\n` +
    `<metadata name="Application">VERTEX by Mint Motive · ${engineLabel()}</metadata>\n` +
    (currentSerial() ? `<metadata name="vertex:serial">${currentSerial()}</metadata>\n` : '') +
    `<metadata name="License">${clean(meta.licence)}</metadata>\n` +
    (meta ? `<metadata name="Copyright">${clean(`${meta.name || ''} by ${meta.designer}. ${meta.licenceName || meta.licence}.`)}</metadata>\n<metadata name="Description">${clean(meta.note || '')}</metadata>\n<metadata name="vertex:attribution">${clean(`${meta.designer} · ${meta.licence} · ${meta.url || ''} · generated free by VERTEX`)}</metadata>\n` : '') +
    `<resources><basematerials id="1">${colors.map((c, i) => `<base name="Filament ${i + 1}" displaycolor="${c}FF"/>`).join('')}</basematerials>${parts.map(meshObject).join('')}${assemblies.join('')}</resources>\n` +
    `<build>${build.map((id) => `<item objectid="${id}"/>`).join('')}</build>\n</model>\n`;
  // Per-object and per-part filament for Bambu Studio and OrcaSlicer.
  const byId = new Map(parts.map((p) => [p.id, p]));
  const settings =
    '<?xml version="1.0" encoding="UTF-8"?>\n<config>\n' +
    groups.map((g) => {
      const oid = g.id || g.parts[0].id;
      const first = g.parts[0];
      return `  <object id="${oid}">\n    <metadata key="name" value="${clean(first.name || name)}"/>\n    <metadata key="extruder" value="${first.filament || 1}"/>\n` +
        g.parts.map((p) => `    <part id="${p.id}" subtype="normal_part">\n      <metadata key="name" value="${clean(byId.get(p.id).name || '')}"/>\n      <metadata key="extruder" value="${p.filament || 1}"/>\n    </part>\n`).join('') +
        '  </object>\n';
    }).join('') + '</config>\n';
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>' +
    '<Default Extension="config" ContentType="text/xml"/>' +
    '<Default Extension="txt" ContentType="text/plain"/>' +
    '</Types>\n';
  const rels =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>' +
    '</Relationships>\n';
  return zipStore([
    ['[Content_Types].xml', contentTypes],
    ['_rels/.rels', rels],
    ['3D/3dmodel.model', model],
    ['Metadata/model_settings.config', settings],
    // Every file carries its credit and licence inside it too.
    ...(meta ? [['Metadata/LICENSE.txt', [`${meta.name || name}`, `Designed by ${meta.designer}.`, `Licence: ${meta.licenceName || meta.licence} (${meta.licence}).`, meta.url ? `More: ${meta.url}` : '', meta.site ? `Designers: ${meta.site}` : '', '', meta.note || '', '', `Made with ${engineLabel()} by Mint Motive${currentSerial() ? `, serial ${currentSerial()}` : ''}.`].filter((l, i, a) => l || a[i - 1]).join('\n') + '\n']] : []),
  ]);
}

// Wavefront OBJ (Blender, Fusion, Inventor, SolidWorks and most CAD tools import it).
export function toOBJ(input, name = 'gridfinity') {
  const parts = Array.isArray(input) ? input : [{ mesh: input, name }];
  const lic = activeExportMeta();
  const out = [`# ${name}`, `# Made with VERTEX by Mint Motive · ${engineLabel()}`, `# ${lic.designer} · ${lic.licenceName} (${lic.licence}) · ${lic.url}`, `# ${lic.note}`, ...(currentSerial() ? [`# Serial ${currentSerial()}`] : []), '# Units: millimetres'];
  let base = 1;
  for (const { mesh, name: partName } of parts) {
    out.push(`o ${String(partName || name).replace(/\s+/g, '_')}`);
    const p = mesh.positions;
    for (let i = 0; i < p.length; i += 3) out.push(`v ${num4(p[i])} ${num4(p[i + 1])} ${num4(p[i + 2])}`);
    const ix = mesh.indices;
    for (let t = 0; t < ix.length; t += 3) out.push(`f ${ix[t] + base} ${ix[t + 1] + base} ${ix[t + 2] + base}`);
    base += p.length / 3;
  }
  return new TextEncoder().encode(out.join('\n') + '\n');
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
// Slicing-by-4: four tables, four bytes a step (same answer, about 3× quicker).
const CRC4 = (() => {
  const t = [CRC_TABLE, new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  for (let n = 0; n < 256; n++) for (let k = 1; k < 4; k++) t[k][n] = (t[k - 1][n] >>> 8) ^ CRC_TABLE[t[k - 1][n] & 0xff];
  return t;
})();

export function crc32(bytes) {
  const [t0, t1, t2, t3] = CRC4;
  let c = 0xffffffff, i = 0;
  const n4 = bytes.length & ~3;
  for (; i < n4; i += 4) {
    c ^= bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24);
    c = t3[c & 0xff] ^ t2[(c >>> 8) & 0xff] ^ t1[(c >>> 16) & 0xff] ^ t0[c >>> 24];
  }
  for (; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Minimal ZIP writer using the "stored" (uncompressed) method.
export function zipStore(entries) {
  const enc = new TextEncoder();
  const files = entries.map(([name, data]) => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    return { name: enc.encode(name), bytes, crc: crc32(bytes) };
  });
  let size = 22;
  for (const f of files) size += 30 + f.name.length + f.bytes.length + 46 + f.name.length;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let off = 0;
  const offsets = [];
  for (const f of files) {
    offsets.push(off);
    view.setUint32(off, 0x04034b50, true);
    view.setUint16(off + 4, 20, true);
    view.setUint32(off + 14, f.crc, true);
    view.setUint32(off + 18, f.bytes.length, true);
    view.setUint32(off + 22, f.bytes.length, true);
    view.setUint16(off + 26, f.name.length, true);
    out.set(f.name, off + 30);
    out.set(f.bytes, off + 30 + f.name.length);
    off += 30 + f.name.length + f.bytes.length;
  }
  const cdStart = off;
  files.forEach((f, i) => {
    view.setUint32(off, 0x02014b50, true);
    view.setUint16(off + 4, 20, true);
    view.setUint16(off + 6, 20, true);
    view.setUint32(off + 16, f.crc, true);
    view.setUint32(off + 20, f.bytes.length, true);
    view.setUint32(off + 24, f.bytes.length, true);
    view.setUint16(off + 28, f.name.length, true);
    view.setUint32(off + 42, offsets[i], true);
    out.set(f.name, off + 46);
    off += 46 + f.name.length;
  });
  view.setUint32(off, 0x06054b50, true);
  view.setUint16(off + 8, files.length, true);
  view.setUint16(off + 10, files.length, true);
  view.setUint32(off + 12, off - cdStart, true);
  view.setUint32(off + 16, cdStart, true);
  return out;
}

async function deflateRaw(bytes) {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

// ZIP with deflate where the browser supports it (every modern one), stored otherwise.
export async function zipFiles(entries) {
  const enc = new TextEncoder();
  const files = [];
  for (const [name, data] of entries) {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    const packed = bytes.length > 256 ? await deflateRaw(bytes) : null;
    const use = packed && packed.length < bytes.length;
    files.push({ name: enc.encode(name), raw: bytes.length, body: use ? packed : bytes, method: use ? 8 : 0, crc: crc32(bytes) });
  }
  let size = 22;
  for (const f of files) size += 30 + f.name.length + f.body.length + 46 + f.name.length;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let off = 0;
  const offsets = [];
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    offsets.push(off);
    view.setUint32(off, 0x04034b50, true);
    view.setUint16(off + 4, 20, true);
    view.setUint16(off + 6, 0x0800, true); // UTF-8 names
    view.setUint16(off + 8, f.method, true);
    view.setUint16(off + 10, dosTime, true);
    view.setUint16(off + 12, dosDate, true);
    view.setUint32(off + 14, f.crc, true);
    view.setUint32(off + 18, f.body.length, true);
    view.setUint32(off + 22, f.raw, true);
    view.setUint16(off + 26, f.name.length, true);
    out.set(f.name, off + 30);
    out.set(f.body, off + 30 + f.name.length);
    off += 30 + f.name.length + f.body.length;
  }
  const cdStart = off;
  files.forEach((f, i) => {
    view.setUint32(off, 0x02014b50, true);
    view.setUint16(off + 4, 20, true);
    view.setUint16(off + 6, 20, true);
    view.setUint16(off + 8, 0x0800, true);
    view.setUint16(off + 10, f.method, true);
    view.setUint16(off + 12, dosTime, true);
    view.setUint16(off + 14, dosDate, true);
    view.setUint32(off + 16, f.crc, true);
    view.setUint32(off + 20, f.body.length, true);
    view.setUint32(off + 24, f.raw, true);
    view.setUint16(off + 28, f.name.length, true);
    view.setUint32(off + 42, offsets[i], true);
    out.set(f.name, off + 46);
    off += 46 + f.name.length;
  });
  view.setUint32(off, 0x06054b50, true);
  view.setUint16(off + 8, files.length, true);
  view.setUint16(off + 10, files.length, true);
  view.setUint32(off + 12, off - cdStart, true);
  view.setUint32(off + 16, cdStart, true);
  return out;
}

/**
 * A stored (uncompressed) ZIP, such as to3MF makes, deflated: the same files, often a fifth of the size.
 * Used before a model is sent to a slicer, so big multi-part builds (a whole rack) fit the upload.
 */
export async function packZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), dec = new TextDecoder();
  const entries = [];
  let off = 0;
  while (off + 30 <= bytes.length && view.getUint32(off, true) === 0x04034b50) {
    const method = view.getUint16(off + 8, true), size = view.getUint32(off + 18, true);
    const nameLen = view.getUint16(off + 26, true), extra = view.getUint16(off + 28, true);
    if (method !== 0) return bytes; // already packed
    const start = off + 30 + nameLen + extra;
    entries.push([dec.decode(bytes.subarray(off + 30, off + 30 + nameLen)), bytes.subarray(start, start + size)]);
    off = start + size;
  }
  return entries.length ? zipFiles(entries) : bytes;
}
