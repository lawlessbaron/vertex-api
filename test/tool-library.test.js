// AI outlines through Roboflow (faked here), and the tool library that fills itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/db.js';
import { SAM3_META_NAMES, SAM3_NAMES, createToolLibrary, dedupe, sameTool } from '../server/tool-library.js';

test('a tool matches itself at another angle, and not a different tool', () => {
  assert.ok(sameTool({ length: 150, width: 22, area: 3300 }, { length: 152, width: 22.5, area: 3350 }));
  assert.ok(!sameTool({ length: 150, width: 22, area: 3300 }, { length: 170, width: 22, area: 3700 }));
  assert.ok(!sameTool({ length: 150, width: 22, area: 3300 }, { length: 150, width: 30, area: 4500 }));
});

test('one tool outlined twice under two names keeps the surer outline', () => {
  const kept = dedupe([
    { class: 'alicate', confidence: 0.33, x: 578, y: 155, width: 139, height: 310 },
    { class: 'llave', confidence: 0.56, x: 575, y: 154, width: 127, height: 306 },
    { class: 'destornillador', confidence: 0.9, x: 200, y: 300, width: 40, height: 200 },
  ]);
  assert.deepEqual(kept.map((p) => p.class), ['destornillador', 'llave']);
  // SAM3's catch-all "tool" won on confidence, but the same outline was also found as "crimpers": keep the name.
  const named = dedupe([{ class: 'tool', confidence: 0.8, x: 50, y: 50, width: 40, height: 100 }, { class: 'crimpers', confidence: 0.5, x: 51, y: 50, width: 40, height: 98 }]);
  assert.deepEqual(named.map((p) => [p.class, p.confidence]), [['crimpers', 0.8]]);
  // Crimpers look like pliers to SAM3: when it finds both on one outline, crimpers it is.
  const crimp = dedupe([{ class: 'pliers', confidence: 0.7, x: 50, y: 50, width: 40, height: 100 }, { class: 'crimpers', confidence: 0.5, x: 50, y: 51, width: 41, height: 100 }, { class: 'tool', confidence: 0.6, x: 50, y: 50, width: 40, height: 99 }]);
  assert.deepEqual(crimp.map((p) => p.class), ['crimpers']);
  // …unless SAM3 was far less sure of it: combination pliers stay pliers.
  assert.deepEqual(dedupe([{ class: 'pliers', confidence: 0.7, x: 50, y: 50, width: 40, height: 100 }, { class: 'wire strippers', confidence: 0.3, x: 50, y: 51, width: 41, height: 100 }]).map((p) => p.class), ['pliers']);
  // Of two exact names, the surer one.
  assert.deepEqual(dedupe([{ class: 'pliers', confidence: 0.7, x: 50, y: 50, width: 40, height: 100 }, { class: 'combination pliers', confidence: 0.6, x: 50, y: 50, width: 40, height: 100 }, { class: 'wire strippers', confidence: 0.5, x: 50, y: 51, width: 41, height: 100 }]).map((p) => p.class), ['combination pliers']);
  // …but never the other way round.
  assert.deepEqual(dedupe([{ class: 'crimpers', confidence: 0.7, x: 5, y: 5, width: 4, height: 9 }, { class: 'pliers', confidence: 0.6, x: 5, y: 5, width: 4, height: 9 }]).map((p) => p.class), ['crimpers']);
  // A box around two tools already found is a group, not a tool; a long thin tool across the sheet stays.
  const two = [{ class: 'a', confidence: 0.9, x: 50, y: 50, width: 40, height: 40 }, { class: 'b', confidence: 0.9, x: 150, y: 50, width: 40, height: 40 }];
  assert.deepEqual(dedupe([...two, { class: 'tool', confidence: 0.6, x: 100, y: 50, width: 200, height: 100 }]).map((p) => p.class), ['a', 'b']);
  assert.equal(dedupe([...two, { class: 'tape', confidence: 0.97, x: 100, y: 200, width: 300, height: 290 }]).length, 3);
  // Needle-nose pliers found in two touching parts (handles, nose) plus whole: one tool, the whole.
  const sq = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const at = (cls, confidence, x0, y0, x1, y1) => ({ class: cls, confidence, x: (x0 + x1) / 2, y: (y0 + y1) / 2, width: x1 - x0, height: y1 - y0, points: sq(x0, y0, x1, y1) });
  const nose = [at('wire strippers', 0.5, 0, 100, 60, 300), at('drill bit', 0.4, 20, 0, 40, 101), at('pliers', 0.3, 0, 0, 60, 300)];
  assert.deepEqual(dedupe(nose).map((p) => p.class), ['pliers']);
  // The same outline around two tools with a gap between them is still a group.
  const apart = [at('pliers', 0.5, 0, 0, 60, 300), at('pliers', 0.5, 100, 0, 160, 300), at('tool', 0.3, 0, 0, 160, 300)];
  assert.deepEqual(dedupe(apart).map((p) => p.class), ['pliers', 'pliers']);
  // Two tape measures, or two knives, touching side by side: alike, so two tools, not one in parts.
  const tapes = [at('tape measure', 0.8, 0, 0, 94, 90), at('tape measure', 0.7, 2, 90, 92, 181), at('tape measure', 0.6, 0, 0, 94, 181)];
  assert.deepEqual(dedupe(tapes).map((p) => p.class), ['tape measure', 'tape measure']);
  const knives = [at('utility knife', 0.7, 0, 0, 20, 154), at('pliers', 0.6, 20, 2, 42, 152), at('pliers', 0.5, 0, 0, 42, 154)];
  assert.equal(dedupe(knives).length, 2);
  // A key set in its holder: the keys found apart, but the set's outline covers far more (holder, bends): one object.
  const keys = [at('screwdriver', 0.5, 10, 100, 14, 300), at('screwdriver', 0.5, 30, 100, 34, 280), at('allen key', 0.3, 0, 0, 60, 320)];
  assert.deepEqual(dedupe(keys).map((p) => p.class), ['allen key']);
  // One piece inside the whole (a long-nose pliers' tip found again as "side cutters"): one tool, the whole.
  const tip = [at('pliers', 0.6, 0, 0, 60, 300), at('side cutters', 0.4, 22, 0, 38, 60)];
  assert.deepEqual(dedupe(tip).map((p) => p.class), ['pliers']);
  // A tool lying beside a long one, inside its box but not its outline (an L-shaped square's corner): both stay.
  const ell = { class: 'square', confidence: 0.7, x: 100, y: 100, width: 200, height: 200, points: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 170 }, { x: 200, y: 170 }, { x: 200, y: 200 }, { x: 0, y: 200 }] };
  assert.equal(dedupe([ell, at('screwdriver', 0.6, 60, 20, 190, 40)]).length, 2);
  // A whole found only as "tool" takes its biggest part's name.
  assert.deepEqual(dedupe([nose[0], nose[1], { ...nose[2], class: 'tool' }]).map((p) => p.class), ['wire strippers']);
});

test('SAM3 mode sends the sheet to a workflow with the key in the body, never the address', async () => {
  const db = openDatabase(':memory:');
  let asked = null;
  const fetchImpl = async (url, init) => { asked = { url, init }; return new Response(JSON.stringify({ outputs: [{ preds: { predictions: [{ class: 'pliers', confidence: 0.96, x: 5, y: 5, width: 10, height: 10, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] }] } }] }), { status: 200 }); };
  const lib = createToolLibrary({ db, can: () => true, env: { ROBOFLOW_API_KEY: 'k3y', ROBOFLOW_MODEL: 'SAM3' }, fetchImpl });
  assert.equal(lib.aiOn(), true);
  let out = null;
  const res = {};
  await lib.handle({ [Symbol.asyncIterator]: async function* () { yield Buffer.from(JSON.stringify({ image: 'data:image/jpeg;base64,QUJD' })); }, headers: { 'content-type': 'application/json' } }, res, '/api/admin/tools/ai', 'POST', { user: { id: 1 } }, (_r, _s, body) => { out = body; }).catch((e) => { throw e; });
  assert.equal(asked.url, 'https://serverless.roboflow.com/workflows/run');
  assert.ok(!asked.url.includes('k3y'));
  const sent = JSON.parse(asked.init.body);
  assert.equal(sent.api_key, 'k3y');
  assert.equal(sent.inputs.image.value, 'QUJD');
  assert.equal(sent.specification.steps[0].type, 'roboflow_core/sam3@v3');
  assert.ok(SAM3_NAMES.length <= 16, 'Roboflow refuses more than 16 names (SAM3_MAX_PROMPT_BATCH_SIZE)');
  assert.deepEqual(out.tools.map((t) => t.label), ['pliers']);
});

test('with a key, SAM3 is on offer alongside your own model, and the page picks', async () => {
  const db = openDatabase(':memory:');
  const urls = [];
  const fetchImpl = async (url) => { urls.push(url); return new Response(JSON.stringify({ predictions: [], outputs: [{ preds: { predictions: [] } }] }), { status: 200 }); };
  const ask = async (lib, path, method, body) => {
    let out = null;
    const req = { [Symbol.asyncIterator]: async function* () { if (body) yield Buffer.from(JSON.stringify(body)); }, headers: { 'content-type': 'application/json' } };
    await lib.handle(req, {}, path, method, { user: { id: 1 } }, (_r, _s, b) => { out = b; });
    return out;
  };
  const keyOnly = createToolLibrary({ db, can: () => true, env: { ROBOFLOW_API_KEY: 'k' }, fetchImpl });
  assert.deepEqual(await ask(keyOnly, '/api/admin/tools/ai', 'GET'), { available: true, model: 'sam3', engines: ['sam3'], convert: false });
  const both = createToolLibrary({ db, can: () => true, env: { ROBOFLOW_API_KEY: 'k', ROBOFLOW_MODEL: 'tools-ngl33/1' }, fetchImpl });
  assert.deepEqual((await ask(both, '/api/admin/tools/ai', 'GET')).engines, ['sam3', 'tools-ngl33/1']);
  const image = 'data:image/jpeg;base64,QUJD';
  await ask(both, '/api/admin/tools/ai', 'POST', { image, engine: 'sam3' });
  await ask(both, '/api/admin/tools/ai', 'POST', { image });
  await ask(both, '/api/admin/tools/ai', 'POST', { image, engine: 'someone-else/9' });
  await ask(both, '/api/admin/tools/ai', 'POST', { image, engine: 'tools-ngl33/1' });
  // Meta's SAM3 on your own server: a third choice, key in the header, the 16 names plus exact kinds.
  const asks = [];
  const metaFetch = async (url, init) => { asks.push({ url, init }); return new Response(JSON.stringify({ predictions: [{ class: 'pliers', confidence: 0.8, x: 5, y: 5, width: 10, height: 10, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] }] }), { status: 200 }); };
  const three = createToolLibrary({ db, can: () => true, env: { ROBOFLOW_API_KEY: 'k', ROBOFLOW_MODEL: 'tools-ngl33/1', SAM3_URL: 'http://sam3.internal:8080/', SAM3_KEY: 's3cret' }, fetchImpl: metaFetch });
  assert.deepEqual((await ask(three, '/api/admin/tools/ai', 'GET')).engines, ['sam3', 'tools-ngl33/1', 'sam3-meta']);
  const metaOut = await ask(three, '/api/admin/tools/ai', 'POST', { image, engine: 'sam3-meta' });
  assert.equal(asks[0].url, 'http://sam3.internal:8080/segment');
  assert.equal(asks[0].init.headers.Authorization, 'Bearer s3cret');
  assert.deepEqual(JSON.parse(asks[0].init.body).prompts, SAM3_META_NAMES);
  // MAX_PROMPTS in server.py of the private vertex-sam3 repo (the SAM3 server); change both together.
  const maxPrompts = 32;
  assert.ok(SAM3_META_NAMES.length <= maxPrompts, `sam3-server takes at most ${maxPrompts} names (MAX_PROMPTS)`);
  assert.deepEqual(metaOut.tools.map((t) => t.label), ['pliers']);
  const metaOnly = createToolLibrary({ db, can: () => true, env: { SAM3_URL: 'http://sam3.internal:8080', SAM3_KEY: 's3cret' }, fetchImpl: metaFetch });
  assert.deepEqual(await ask(metaOnly, '/api/admin/tools/ai', 'GET'), { available: true, model: 'sam3-meta', engines: ['sam3-meta'], convert: true });
  assert.equal(createToolLibrary({ db, can: () => true, env: { SAM3_URL: 'http://x.y' }, fetchImpl: metaFetch }).aiOn(), false, 'no key, no Meta SAM3');
  assert.deepEqual(urls, ['https://serverless.roboflow.com/workflows/run', 'https://serverless.roboflow.com/workflows/run', 'https://serverless.roboflow.com/workflows/run', 'https://serverless.roboflow.com/tools-ngl33/1?format=json'], 'SAM3 unless your own model is asked for by name');
});

test('the library counts repeats, keeps names, and AI outlines use the key only on the server', async () => {
  const db = openDatabase(':memory:');
  let asked = null;
  const fetchImpl = async (url, init) => { asked = { url, init }; return new Response(JSON.stringify({ predictions: [{ class: 'spanner', confidence: 0.9, points: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 6 }, { x: 0, y: 6 }] }, { points: [{ x: 1, y: 1 }] }] }), { status: 200 }); };
  const off = createToolLibrary({ db, can: () => true, env: {}, fetchImpl });
  assert.equal(off.aiOn(), false);
  const lib = createToolLibrary({ db, can: () => true, env: { ROBOFLOW_API_KEY: 'k3y', ROBOFLOW_MODEL: 'my-tools/2' }, fetchImpl });
  assert.equal(lib.aiOn(), true);

  const tool = { polygon: [[0, 0], [150, 0], [150, 22], [0, 22]], length: 150, width: 22, area: 3300, label: 'spanner' };
  const [a] = lib.record({ id: null }, [tool]);
  assert.equal(a.known, false);
  db.prepare('UPDATE tool_library SET name = ? WHERE id = ?').run('Ring spanner 19 mm', a.id);
  const [b] = lib.record({ id: null }, [{ ...tool, length: 151, area: 3320 }]);
  assert.equal(b.id, a.id); assert.equal(b.known, true); assert.equal(b.seen, 2); assert.equal(b.name, 'Ring spanner 19 mm');
  lib.record({ id: null }, [{ ...tool, polygon: [[0, 0], [60, 0], [60, 60], [0, 60]], length: 60, width: 60, area: 3600 }]);
  assert.equal(lib.list().length, 2, 'a different tool is added, not merged');

  // The AI call: key in the query to Roboflow, the photo as base64, points back.
  let json = null;
  const res = { writeHead() {}, end() {} };
  const req = Object.assign(new (await import('node:stream')).Readable({ read() {} }), { headers: { 'content-type': 'application/json' } });
  req.push(JSON.stringify({ image: `data:image/jpeg;base64,${Buffer.alloc(2000).toString('base64')}`, engine: 'my-tools/2' })); req.push(null);
  await lib.handle(req, res, '/api/admin/tools/ai', 'POST', { user: { id: 1 } }, (r, s, body) => { json = body; });
  assert.match(asked.url, /^https:\/\/serverless\.roboflow\.com\/my-tools\/2\?format=json$/);
  assert.ok(!asked.url.includes('k3y'), 'the key never goes in the address');
  assert.equal(asked.init.headers.Authorization, 'Bearer k3y');
  assert.equal(json.tools.length, 1, 'outlines with fewer than 3 points are dropped');
  assert.equal(json.tools[0].label, 'spanner');
  assert.deepEqual(json.tools[0].points[2], [30, 6]);
});

test('a phone’s HEIC photo goes to the SAM3 server’s /convert and comes back as a JPEG', async () => {
  const db = openDatabase(':memory:');
  const asked = [];
  const fetchImpl = async (url, init) => { asked.push({ url, init }); return new Response(JSON.stringify({ image: 'SlBFRw==', width: 1600, height: 1200 }), { status: 200 }); };
  const send = async (lib, bytes) => {
    let out = null, status = 200;
    const req = { [Symbol.asyncIterator]: async function* () { yield Buffer.from(bytes); }, headers: { 'content-type': 'application/octet-stream' } };
    try { await lib.handle(req, {}, '/api/admin/tools/photo', 'POST', { user: { id: 1 } }, (_r, s, b) => { status = s; out = b; }); } catch (e) { status = e.status; out = { error: e.message }; }
    return { status, out };
  };
  // The always-on Railway copy when it's set, else SAM3_URL.
  const lib = createToolLibrary({ db, can: () => true, env: { SAM3_URL: 'https://gpu.example', SAM3_CONVERT_URL: 'http://sam3.internal:8080/', SAM3_KEY: 's3cret' }, fetchImpl });
  const r = await send(lib, 'ftypheic-bytes');
  assert.equal(r.status, 200);
  assert.equal(r.out.image, 'data:image/jpeg;base64,SlBFRw==');
  assert.equal(asked[0].url, 'http://sam3.internal:8080/convert');
  assert.equal(asked[0].init.headers.Authorization, 'Bearer s3cret');
  assert.equal(Buffer.from(asked[0].init.body).toString(), 'ftypheic-bytes');
  assert.equal(r.out.job, null, 'no trace unless asked');
  // ?trace=<engine>: the converted photo starts tracing straight away, and the page gets the job.
  const traced = await send({ handle: (req, res, path, ...rest) => lib.handle(Object.assign(req, { url: '/api/admin/tools/photo?trace=sam3-meta' }), res, path, ...rest) }, 'ftypheic-bytes');
  assert.match(traced.out.job, /^[\w-]{8,20}$/);
  await new Promise((ok) => setTimeout(ok, 10));
  assert.ok(asked.some((a) => a.url === 'https://gpu.example/segment'), 'the photo went to SAM3');
  // Without a converter the page is told so (and converts in the browser instead).
  const none = createToolLibrary({ db, can: () => true, env: { ROBOFLOW_API_KEY: 'k' }, fetchImpl });
  assert.equal((await send(none, 'x')).status, 503);
});

test('a trace runs as a job the page checks on, and the GPU is woken ahead of it', async () => {
  const db = openDatabase(':memory:');
  const asked = [];
  let answer;
  const gate = new Promise((ok) => { answer = ok; });
  const fetchImpl = async (url, init) => {
    asked.push(url);
    if (url.endsWith('/health')) return new Response('{"ready":true}', { status: 200 });
    await gate; // the GPU is still waking
    return new Response(JSON.stringify({ predictions: [{ class: 'pliers', confidence: 0.9, points: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 20 }] }] }), { status: 200 });
  };
  const lib = createToolLibrary({ db, can: () => true, env: { SAM3_URL: 'https://gpu.example', SAM3_KEY: 'k' }, fetchImpl });
  const call = async (path, method, body) => {
    let out = null, status = 200;
    const req = { [Symbol.asyncIterator]: async function* () { if (body) yield Buffer.from(JSON.stringify(body)); }, headers: { 'content-type': 'application/json' } };
    try { await lib.handle(req, {}, path, method, { user: { id: 1 } }, (_r, s, b) => { status = s; out = b; }); } catch (e) { status = e.status; out = { error: e.message }; }
    return { status, out };
  };
  assert.equal((await call('/api/admin/tools/warm', 'POST', {})).out.waking, true);
  assert.equal(asked[0], 'https://gpu.example/health');
  assert.equal((await call('/api/admin/tools/warm', 'POST', {})).out.waking, false, 'once a minute is enough');

  const started = await call('/api/admin/tools/ai/jobs', 'POST', { image: `data:image/jpeg;base64,${Buffer.alloc(900).toString('base64')}`, engine: 'sam3-meta' });
  assert.equal(started.status, 202);
  const { job } = started.out;
  assert.equal((await call(`/api/admin/tools/ai/jobs/${job}`, 'GET')).out.status, 'running');
  answer();
  await new Promise((ok) => setTimeout(ok, 20));
  const done = await call(`/api/admin/tools/ai/jobs/${job}`, 'GET');
  assert.equal(done.out.status, 'done');
  assert.equal(done.out.tools[0].label, 'pliers');
  assert.equal((await call(`/api/admin/tools/ai/jobs/${job}`, 'GET')).status, 404, 'a finished job is handed over once');
});

test('a GPU that hangs or fails: Roboflow traces the sheet instead', async () => {
  const db = openDatabase(':memory:');
  const env = { ROBOFLOW_API_KEY: 'k', SAM3_URL: 'https://gpu.example', SAM3_KEY: 'k' };
  const image = `data:image/jpeg;base64,${Buffer.alloc(300).toString('base64')}`;
  const rf = () => new Response(JSON.stringify({ outputs: [{ preds: { predictions: [{ class: 'spanner', confidence: 0.9, points: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }] }] } }] }), { status: 200 });
  const ask = async (lib) => {
    let out = null;
    const req = { [Symbol.asyncIterator]: async function* () { yield Buffer.from(JSON.stringify({ image, engine: 'sam3-meta' })); }, headers: { 'content-type': 'application/json' } };
    await lib.handle(req, {}, '/api/admin/tools/ai', 'POST', { user: { id: 1 } }, (_r, _s, b) => { out = b; });
    return out;
  };
  // Hangs: after the wait, Roboflow answers.
  const hang = async (url) => (url.includes('gpu.example') ? new Promise(() => {}) : rf());
  const t0 = Date.now();
  const slow = await ask(createToolLibrary({ db, can: () => true, env, fetchImpl: hang, fallbackAfter: 30 }));
  assert.deepEqual(slow.tools.map((t) => t.label), ['spanner']);
  assert.ok(Date.now() - t0 < 2000);
  // Fails outright: Roboflow straight away.
  const down = async (url) => (url.includes('gpu.example') ? new Response('{"message":"no credit"}', { status: 503 }) : rf());
  assert.deepEqual((await ask(createToolLibrary({ db, can: () => true, env, fetchImpl: down, fallbackAfter: 60000 }))).tools.map((t) => t.label), ['spanner']);
  // Both fail: the error comes back, it doesn't hang.
  const dead = async () => new Response('{}', { status: 500 });
  const lib = createToolLibrary({ db, can: () => true, env, fetchImpl: dead, fallbackAfter: 60000 });
  await assert.rejects(ask(lib), /said no/);
});
