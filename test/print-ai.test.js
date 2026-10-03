// Print AI: settings and model checks give exact fixes; the API takes developer
// keys, has its own switch, reads G-code, 3MF and STL, and never names the AI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { openDatabase } from '../server/db.js';
import { isStaff } from '../server/roles.js';
import { hashToken } from '../server/auth.js';
import { checkSettings, checkModel, settingsFromText, settingsFrom3mf, trisFromStl, trisFrom3mf } from '../server/print-ai-checks.js';
import { createPrintAi, cleanReport } from '../server/print-ai.js';

const codes = (r) => r.findings.map((f) => f.code);

test('settings: the same rules as the slicer plugin, with exact fixes', () => {
  const r = checkSettings({ filament_type: 'PETG', nozzle_diameter: '0.4', nozzle_temperature: '275', layer_height: '0.36', retraction_length: '8', bed_temperature: '40' });
  assert.deepEqual(codes(r).sort(), ['bed-cool-for-filament', 'layer-too-tall', 'retraction-long', 'temp-high-for-filament']);
  const hot = r.findings.find((f) => f.code === 'temp-high-for-filament');
  assert.equal(hot.fixes[0].to, 255);
  assert.equal(r.findings.find((f) => f.code === 'layer-too-tall').severity, 'fail');
  assert.equal(r.findings.find((f) => f.code === 'layer-too-tall').fixes[0].to, 0.2);
  // Bambu's JSON arrays and multi-extruder lists, and ABS fan limits.
  const abs = checkSettings({ filament_type: ['ABS', 'PLA'], nozzle_diameter: ['0.4'], fan_max_speed: ['80'], nozzle_temperature: ['250'] });
  assert.deepEqual(codes(abs), ['fan-high-for-filament']);
  assert.equal(abs.family, 'ABS');
  // CF on brass, with the filament from context when the settings don't say.
  assert.ok(codes(checkSettings({ nozzle_type: 'brass' }, { filament: 'PLA-CF' })).includes('abrasive-filament'));
  assert.deepEqual(codes(checkSettings({ filament_type: 'PLA', nozzle_temperature: '210', layer_height: '0.2', nozzle_diameter: '0.4' })), ['all-clear']);
});

test('settings come out of G-code comments and sliced 3MFs', () => {
  const s = settingsFromText('G28\n; filament_type = PLA\n; nozzle_temperature = 180\n;layer_height=0.2\nG1 X1\n');
  assert.deepEqual(s, { filament_type: 'PLA', nozzle_temperature: '180', layer_height: '0.2' });
  const zip = makeZip({ 'Metadata/project_settings.config': JSON.stringify({ filament_type: ['TPU'], nozzle_temperature: ['250'] }) });
  const z = settingsFrom3mf(zip);
  assert.equal(z.filament_type, 'TPU');
  assert.ok(codes(checkSettings(z)).includes('temp-high-for-filament'));
});

// A box as triangles (two per face, outward).
function box(x0, y0, z0, x1, y1, z1) {
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  return f.flatMap((t) => t.flatMap((i) => v[i]));
}
const stl = (tris) => {
  const n = tris.length / 9, b = Buffer.alloc(84 + n * 50);
  b.writeUInt32LE(n, 80);
  for (let i = 0; i < n; i++) for (let j = 0; j < 9; j++) b.writeFloatLE(tris[i * 9 + j], 84 + i * 50 + 12 + j * 4);
  return b;
};

test('model: a plain block is all clear; a T upside down needs supports and is better flipped', () => {
  const block = checkModel(Float32Array.from(box(0, 0, 0, 20, 20, 10)));
  assert.deepEqual(codes(block), ['all-clear']);
  assert.equal(block.stats.closed, true);
  assert.deepEqual(block.stats.sizeMm, [20, 20, 10]);
  assert.equal(block.stats.volumeCm3, 4);
  // A stem 10 × 10 × 30 with a 60 × 60 × 5 cap on top: the cap's underside is a big bridge.
  const tee = Float32Array.from([...box(25, 25, 0, 35, 35, 30), ...box(0, 0, 30, 60, 60, 35)]);
  const r = checkModel(tee);
  assert.ok(codes(r).includes('bridges'), codes(r).join());
  assert.ok(codes(r).includes('better-orientation'), codes(r).join());
  assert.equal(r.orientation.best, '-z');
  // Binary STL round trip, and the bed size check.
  assert.equal(trisFromStl(stl(box(0, 0, 0, 300, 20, 10))).length, 108);
  assert.ok(codes(checkModel(trisFromStl(stl(box(0, 0, 0, 300, 20, 10))), { bed: [256, 256, 256] })).includes('too-big-for-bed'));
  // Tiny: saved in inches or cm.
  assert.ok(codes(checkModel(Float32Array.from(box(0, 0, 0, 1, 1, 1)))).includes('model-tiny'));
  // A box with a face missing is not watertight.
  assert.ok(codes(checkModel(Float32Array.from(box(0, 0, 0, 20, 20, 10).slice(0, -18)))).includes('not-watertight'));
  // 3MF models.
  const model = '<model><resources><object id="1"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="10" y="0" z="0"/><vertex x="0" y="10" z="0"/></vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh></object></resources></model>';
  assert.equal(trisFrom3mf(makeZip({ '3D/3dmodel.model': model })).length, 9);
});

test('photo reports are cleaned: known codes, boxes inside the image, no stray fields', () => {
  const r = cleanReport({ isPrint: true, summary: 'Stringing.', findings: [{ code: 'stringing', severity: 'warn', message: 'Hairs between towers.', confidence: 1.4, box: [0.1, 0.2, 1.5, -1], fixes: [{ setting: 'nozzle_temperature', from: 240, to: 225, unit: '°C' }], secret: 'x' }, { code: 'made-up', severity: 'bad', message: '', confidence: 0.3 }] });
  assert.equal(r.findings[0].confidence, 1);
  assert.deepEqual(r.findings[0].box, [0.1, 0.2, 1, 0]);
  assert.equal(r.findings[0].fixes[0].id, 'nozzle_temperature:225');
  assert.equal(r.findings[0].secret, undefined);
  assert.equal(r.findings[1].code, 'other');
  assert.equal(r.findings[1].severity, 'warn');
  assert.equal(cleanReport({ isPrint: false, findings: [] }).findings[0].code, 'not-a-print');
});

const call = async (svc, path, method = 'GET', { user = null, key = null, body = null, raw = null, type = null } = {}) => {
  let out = null, status = 200;
  const headers = { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...(type ? { 'content-type': type } : {}) };
  const req = { url: path, headers, [Symbol.asyncIterator]: async function* () { if (body) yield Buffer.from(JSON.stringify(body)); if (raw) yield raw; } };
  try { await svc.handle(req, {}, new URL(path, 'http://x').pathname, method, { user, ip: '1.2.3.4' }, (_r, s, b) => { status = s; out = b; }); } catch (e) { status = e.status; out = { error: e.message }; }
  return { status, out };
};

test('the API: developer keys, its own switch, every check, outcomes, and no AI names', async () => {
  const db = openDatabase(':memory:');
  db.prepare("INSERT INTO users (id, email, name, handle, role, created_at, synced_at) VALUES (1, 'd@x.y', 'D', 'dev', 'user', 1, 1), (2, 's@x.y', 'S', 'staff', 'admin', 1, 1)").run();
  db.prepare("INSERT INTO engine_keys (user_id, name, key_hash, key_hint, created_at) VALUES (1, 'k', ?, 'vx_d…', 1), (2, 'k', ?, 'vx_s…', 1)").run(hashToken('vx_dev'), hashToken('vx_staff'));
  let asked = null;
  const fetchImpl = async (url, opts) => {
    asked = JSON.parse(opts.body);
    return { ok: true, json: async () => ({ content: [{ type: 'tool_use', name: 'report', input: { isPrint: true, summary: 'Warped corners.', findings: [{ code: 'warping', severity: 'warn', message: 'The corners lifted.', confidence: 0.8, box: [0, 0.7, 0.2, 0.3], fixes: [{ setting: 'bed_temperature', from: 90, to: 105, unit: '°C' }] }] } }] }) };
  };
  const ai = createPrintAi({ db, isStaff, env: { ANTHROPIC_API_KEY: 'k' }, fetchImpl });

  const info = await call(ai, '/api/ai/v1');
  assert.equal(info.status, 200);
  assert.equal(info.out.enabled, false);
  assert.ok((await call(ai, '/api/ai/v1/filaments')).out.filaments.some((f) => f.id === 'PETG'));
  assert.equal((await call(ai, '/api/ai/v1/check/settings', 'POST', { body: { settings: {} } })).status, 401);
  assert.equal((await call(ai, '/api/ai/v1/check/settings', 'POST', { key: 'vx_dev', body: { settings: {} } })).status, 503, 'off by default');
  assert.equal((await call(ai, '/api/ai/v1/check/settings', 'POST', { key: 'vx_staff', body: { settings: { filament_type: 'PLA', nozzle_temperature: 250 } } })).out.findings[0].code, 'temp-high-for-filament', 'staff keys work while off');
  await call(ai, '/api/admin/print-ai', 'PUT', { user: { id: 2, role: 'admin' }, body: { on: true } });
  assert.equal((await call(ai, '/api/admin/print-ai', 'GET', { user: { id: 2, role: 'admin' } })).out.on, true);

  // G-code as the body, streamed, with the context on the query string.
  const gcode = Buffer.from(`; generated\nG28\n${'G1 X1 Y1\n'.repeat(5000)}; nozzle_temperature = 205\n; layer_height = 0.5\n`);
  const g = await call(ai, '/api/ai/v1/check/settings?filament=PLA&nozzle=0.4', 'POST', { key: 'vx_dev', raw: gcode, type: 'text/plain' });
  assert.equal(g.status, 200, JSON.stringify(g.out));
  assert.deepEqual(codes(g.out), ['layer-too-tall']);
  assert.equal((await call(ai, '/api/ai/v1/check/settings', 'POST', { key: 'vx_dev', raw: Buffer.from('G28\n'), type: 'text/plain' })).status, 422);

  // Models: an STL body, and a VERTEX model by kind.
  const m = await call(ai, '/api/ai/v1/check/model', 'POST', { key: 'vx_dev', raw: stl(box(0, 0, 0, 20, 20, 10)), type: 'model/stl' });
  assert.equal(m.status, 200, JSON.stringify(m.out));
  assert.deepEqual(codes(m.out), ['all-clear']);
  assert.equal((await call(ai, '/api/ai/v1/check/model', 'POST', { key: 'vx_dev', raw: Buffer.from('nonsense'), type: 'model/stl' })).status, 400);
  const bin = await call(ai, '/api/ai/v1/check/model', 'POST', { key: 'vx_dev', body: { kind: 'bin', params: { gridX: 1, gridY: 1, heightUnits: 3 } } });
  assert.equal(bin.status, 200, JSON.stringify(bin.out));
  assert.ok(bin.out.parts.length >= 1 && bin.out.parts[0].stats.triangles > 100);

  // A photo: the report comes back cleaned, and the request never names a vendor to the developer.
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
  const p = await call(ai, '/api/ai/v1/diagnose/photo?filament=ABS', 'POST', { key: 'vx_dev', raw: png, type: 'image/png' });
  assert.equal(p.status, 200, JSON.stringify(p.out));
  assert.equal(p.out.findings[0].code, 'warping');
  assert.equal(p.out.model, 'photo-0.1.0');
  assert.equal(asked.tool_choice.name, 'report');
  assert.match(asked.messages[0].content[1].text, /filament ABS/);
  assert.equal((await call(ai, '/api/ai/v1/diagnose/photo', 'POST', { key: 'vx_dev', raw: Buffer.from('not an image'), type: 'image/png' })).status, 415);
  const broken = createPrintAi({ db, isStaff, env: { ANTHROPIC_API_KEY: 'k' }, fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({ error: { message: 'Anthropic overloaded' } }) }) });
  const b = await call(broken, '/api/ai/v1/diagnose/photo', 'POST', { key: 'vx_dev', raw: png, type: 'image/png' });
  assert.equal(b.status, 502);
  assert.doesNotMatch(JSON.stringify(b.out), /anthropic|claude|overloaded/i);
  const noKey = createPrintAi({ db, isStaff, env: {}, fetchImpl });
  assert.equal((await call(noKey, '/api/ai/v1/diagnose/photo', 'POST', { key: 'vx_dev', raw: png, type: 'image/png' })).status, 503);

  // Outcomes, and what's still coming.
  assert.equal((await call(ai, '/api/ai/v1/outcomes', 'POST', { key: 'vx_dev', body: { job: 'j1', result: 'fixed', fixedBy: 'bed_temperature:105', finding: 'warping' } })).status, 202);
  assert.equal((await call(ai, '/api/ai/v1/outcomes', 'POST', { key: 'vx_dev', body: { job: 'j1', result: 'meh' } })).status, 400);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM print_ai_outcomes').get().n, 1);
  // Live failure watch: a job id is needed; one bad frame says check, two in a row say pause.
  assert.equal((await call(ai, '/api/ai/v1/watch/frame', 'POST', { key: 'vx_dev', raw: png, type: 'image/png' })).status, 400);
  const w1 = await call(ai, '/api/ai/v1/watch/frame?job=print-7', 'POST', { key: 'vx_dev', raw: png, type: 'image/png' });
  assert.equal(w1.status, 200, JSON.stringify(w1.out));
  assert.equal(w1.out.action, 'check', 'warping is worth a look, not a stop');
  assert.equal((await call(ai, '/api/ai/v1/watch/frame?job=print-7', 'POST', { key: 'vx_dev', raw: png, type: 'image/png' })).status, 429, 'one frame every 20 seconds per job');
  const spag = createPrintAi({ db, isStaff, env: { ANTHROPIC_API_KEY: 'k' }, fetchImpl: async () => ({ ok: true, json: async () => ({ content: [{ type: 'tool_use', name: 'report', input: { isPrint: true, summary: 'Spaghetti.', findings: [{ code: 'spaghetti', severity: 'fail', message: 'It came off the bed.', confidence: 0.9 }] } }] }) }) });
  const s1 = await call(spag, '/api/ai/v1/watch/frame?job=a', 'POST', { key: 'vx_dev', raw: png, type: 'image/png' });
  const s2 = await call(spag, '/api/ai/v1/watch/frame?job=b', 'POST', { key: 'vx_dev', raw: png, type: 'image/png' });
  assert.deepEqual([s1.out.action, s1.out.streak, s2.out.action], ['check', 1, 'check'], 'each job keeps its own count');
  assert.ok(db.prepare('SELECT calls FROM engine_keys WHERE user_id = 1').get().calls >= 5, 'calls are counted on the key');
  for (const r of [info, g, m]) assert.doesNotMatch(JSON.stringify(r.out), /anthropic|claude|sonnet|opus/i);
});

// A small ZIP (deflated) for 3MF tests.
function makeZip(files) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text), packed = deflateRawSync(data), n = Buffer.from(name);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(8, 8); h.writeUInt32LE(packed.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(packed.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
    locals.push(h, n, packed); centrals.push(c, n);
    offset += 30 + n.length + packed.length;
  }
  const cd = Buffer.concat(centrals), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(Object.keys(files).length, 8); e.writeUInt16LE(Object.keys(files).length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, e]);
}

test('apply: fixes written into the settings file, and onto your own VERTEX Recipe', async () => {
  const db = openDatabase(':memory:');
  db.prepare("INSERT INTO users (id, email, name, handle, role, created_at, synced_at) VALUES (1, 'd@x.y', 'D', 'dev', 'user', 1, 1), (2, 's@x.y', 'S', 'staff', 'admin', 1, 1)").run();
  db.prepare("INSERT INTO engine_keys (user_id, name, key_hash, key_hint, created_at, sandbox) VALUES (1, 'k', ?, 'vx_d…', 1, 0), (1, 't', ?, 'vx_t…', 1, 1)").run(hashToken('vx_dev'), hashToken('vx_test'));
  const sent = [];
  const link = {
    on: () => true,
    recipes: async (id) => ({ recipes: [{ id: 'mine-001', title: `Recipe of ${id}`, fileName: 'a.ini', verified: true }] }),
    recipeFile: async (id, rid, name, buf) => { sent.push({ id, rid, name, text: buf.toString() }); return { recipe: { id: rid, title: 'R', url: `/recipes/${rid}`, fileName: name }, held: false }; },
  };
  const ai = createPrintAi({ db, isStaff, link, env: {} });
  await call(ai, '/api/admin/print-ai', 'PUT', { user: { id: 2, role: 'admin' }, body: { on: true } });
  const ini = Buffer.from('layer_height = 0.2\nnozzle_temperature = 260\nperimeters = 2\n');
  const fixes = encodeURIComponent(JSON.stringify([{ setting: 'nozzle_temperature', to: 215 }, { setting: 'wall_loops', to: 3 }, { setting: 'fan_max_speed', to: 100 }]));
  // The file back, with what changed in the headers.
  const send = async (path, key, raw) => {
    let status = 200, head = null, out = null, sentBody = null;
    const req = { url: path, headers: { authorization: `Bearer ${key}`, 'content-type': 'application/octet-stream' }, [Symbol.asyncIterator]: async function* () { if (raw) yield raw; } };
    const res = { writeHead: (s, h) => { status = s; head = h; }, end: (b) => { sentBody = b; } };
    try { await ai.handle(req, res, new URL(path, 'http://x').pathname, 'POST', { ip: '1.2.3.4' }, (_r, s, b) => { status = s; out = b; }); } catch (e) { status = e.status; out = { error: e.message }; }
    return { status, head, out, body: sentBody };
  };
  const f = await send(`/api/ai/v1/apply?name=profile.ini&fixes=${fixes}`, 'vx_dev', ini);
  assert.equal(f.status, 200, JSON.stringify(f.out));
  assert.match(f.body.toString(), /nozzle_temperature = 215/);
  assert.match(f.body.toString(), /perimeters = 3/);
  assert.equal(f.head['X-Fixes-Applied'], 'nozzle_temperature,wall_loops');
  assert.equal(f.head['X-Fixes-Missing'], 'fan_max_speed');
  assert.match(f.head['Content-Disposition'], /profile-fixed\.ini/);
  assert.equal((await send(`/api/ai/v1/apply?name=print.gcode&fixes=${fixes}`, 'vx_dev', Buffer.from('G28'))).status, 400, 'sliced G-code can\'t be fixed');
  assert.equal((await send(`/api/ai/v1/apply?fixes=${fixes}`, 'vx_dev', ini)).status, 400, 'needs a file name');
  assert.ok((await call(ai, '/api/ai/v1')).out.fixable.includes('nozzle_temperature'));
  // Your Recipes, and the fixed file onto one of them.
  const list = await call(ai, '/api/ai/v1/recipes', 'GET', { key: 'vx_dev' });
  assert.equal(list.out.recipes[0].title, 'Recipe of 1');
  const r = await send(`/api/ai/v1/recipes/mine-001/apply?name=profile.ini&fixes=${fixes}`, 'vx_dev', ini);
  assert.equal(r.status, 200, JSON.stringify(r.out));
  assert.deepEqual(r.out.applied, ['nozzle_temperature', 'wall_loops']);
  assert.equal(sent[0].id, 1, 'always the key owner\'s own account');
  assert.equal(sent[0].rid, 'mine-001');
  assert.match(sent[0].text, /nozzle_temperature = 215/);
  // Nothing to change: the Recipe is left alone. Test keys never change Recipes.
  const none = await send(`/api/ai/v1/recipes/mine-001/apply?name=profile.ini&fixes=${encodeURIComponent(JSON.stringify([{ setting: 'fan_max_speed', to: 90 }]))}`, 'vx_dev', ini);
  assert.equal(none.status, 400);
  assert.equal((await send(`/api/ai/v1/recipes/mine-001/apply?name=profile.ini&fixes=${fixes}`, 'vx_test', ini)).status, 403);
  assert.equal(sent.length, 1);
  // Without the link to VERTEX: a plain 503, never a crash.
  const off = createPrintAi({ db, isStaff, link: { on: () => false }, env: {} });
  assert.equal((await call(off, '/api/ai/v1/recipes', 'GET', { key: 'vx_dev' })).status, 503);
});
