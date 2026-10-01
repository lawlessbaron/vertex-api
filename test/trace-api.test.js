// The tracer API: the server finds the paper and moves the AI's outlines onto it
// in mm; keys are the owner's to issue, with a switch, an allowance and no leaks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/db.js';
import { can } from '../server/roles.js';
import { createTraceApi, traceSheet } from '../server/trace-api.js';

// A photo: dark desk, an A4 sheet (500 × 707 px, so 2.38 px/mm) and a dark bar on it, 100 × 20 mm.
const PX = 500 / 210;
function photo() {
  const W = 800, H = 1000, data = new Uint8ClampedArray(W * H * 4);
  const bar = { x0: 150 + 60 * PX, y0: 150 + 100 * PX, x1: 150 + 160 * PX, y1: 150 + 120 * PX };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const onPaper = x >= 150 && x < 650 && y >= 150 && y < 857;
    const onBar = x >= bar.x0 && x < bar.x1 && y >= bar.y0 && y < bar.y1;
    const v = onBar ? 35 : onPaper ? 240 : 70, i = (y * W + x) * 4;
    data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
  }
  return { image: { width: W, height: H, data }, bar };
}
const outlineOf = (bar) => async () => [{ label: 'screwdriver', confidence: 0.8, points: [[bar.x0, bar.y0], [bar.x1, bar.y0], [bar.x1, bar.y1], [bar.x0, bar.y1]] }];

test('the server finds the paper and gives each tool in mm', async () => {
  const { image, bar } = photo();
  const r = await traceSheet({ image, jpeg: 'x', paper: 'a4', outline: outlineOf(bar) });
  assert.equal(r.paper.name, 'A4');
  assert.equal(r.tools.length, 1);
  const [t] = r.tools;
  assert.equal(t.name, 'screwdriver');
  assert.ok(Math.abs(t.lengthMm - 100) < 4, `length ${t.lengthMm}`);
  assert.ok(Math.abs(t.widthMm - 20) < 4, `width ${t.widthMm}`);
  assert.ok(t.outline.length >= 4 && t.outline.every(([x, y]) => x >= 0 && y >= 0 && x <= 210 && y <= 297));
});

const call = async (svc, path, method = 'GET', { user = null, key = null, body = null } = {}) => {
  let out = null, status = 200;
  const headers = { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) };
  const req = { url: path, headers, [Symbol.asyncIterator]: async function* () { if (body) yield Buffer.from(JSON.stringify(body)); } };
  let sent = null, raw = null;
  const res = { writeHead: (s, h) => { status = s; sent = h; }, end: (b) => { raw = b; } };
  try { await svc.handle(req, res, new URL(path, 'http://x').pathname, method, { user }, (_r, s, b) => { status = s; out = b; }); } catch (e) { status = e.status; out = { error: e.message }; }
  if (raw) return { status, out, headers: sent, raw };
  return { status, out };
};

test('keys: owner-issued, switch, test keys, allowance, revoke, and no engine names in answers', async () => {
  const db = openDatabase(':memory:');
  const OWNER = { id: 1, role: 'owner' }, ADMIN = { id: 2, role: 'admin' };
  db.prepare("INSERT INTO users (id, email, name, role, created_at, synced_at) VALUES (1, 'o@x.y', 'O', 'owner', 1, 1)").run();
  const { image, bar } = photo();
  let fail = false;
  const toolLibrary = {
    aiOn: () => true, convertOn: () => true,
    convertRaw: async () => ({ jpeg: 'x', image }),
    outline: async (...a) => { if (fail) throw new Error('Roboflow said no (500: SAM3 exploded)'); return outlineOf(bar)(...a); },
  };
  const api = createTraceApi({ db, can, toolLibrary });
  assert.equal((await call(api, '/api/admin/trace-api', 'GET', { user: ADMIN })).status, 403, 'owners only');
  const live = (await call(api, '/api/admin/trace-api/keys', 'POST', { user: OWNER, body: { name: 'Acme', quota: 2 } })).out;
  const tkey = (await call(api, '/api/admin/trace-api/keys', 'POST', { user: OWNER, body: { name: 'Tester', test: true } })).out;
  assert.match(live.key, /^tk_/);
  assert.equal((await call(api, '/api/trace/v1')).status, 401, 'a key is needed');
  assert.equal((await call(api, '/api/trace/v1', 'GET', { key: live.key })).status, 503, 'off by default');
  assert.equal((await call(api, '/api/trace/v1', 'GET', { key: tkey.key })).status, 200, 'test keys work while off');
  await call(api, '/api/admin/trace-api', 'PUT', { user: OWNER, body: { on: true } });

  const run = async (key) => {
    const s = await call(api, '/api/trace/v1/jobs', 'POST', { key, body: { image: 'AAAA', paper: 'a4' } });
    if (s.status !== 202) return s;
    for (let i = 0; i < 50; i++) { const r = await call(api, s.out.check, 'GET', { key }); if (r.out.status !== 'running') return r; await new Promise((ok) => setTimeout(ok, 20)); }
    throw new Error('never finished');
  };
  const done = await run(live.key);
  // The ready bin: an STL with a serial number, sized to fit the 100 × 20 mm tool (one cell is 42 mm, so 3 × 1 at least).
  assert.equal(done.out.bin, `/api/trace/v1/jobs/${done.out.id}/bin`);
  const bin = await call(api, `${done.out.bin}?format=stl&clearance=1`, 'GET', { key: live.key });
  assert.equal(bin.status, 200, JSON.stringify(bin.out));
  assert.equal(bin.headers['Content-Type'], 'model/stl');
  assert.match(bin.headers['X-Vertex-Bin'], /^\d+x\d+$/);
  const [bx, by] = bin.headers['X-Vertex-Bin'].split('x').map(Number);
  assert.ok(Math.max(bx, by) >= 3 && bx * by <= 6, `bin ${bx}x${by}`);
  assert.ok(bin.raw.length > 84 + 50 * 100, 'a real mesh');
  assert.ok(db.prepare("SELECT 1 FROM download_serials WHERE serial = ? AND kind = 'trace-bin'").get(bin.headers['X-Vertex-Serial']), 'serial recorded');
  assert.equal((await call(api, `${done.out.bin}?format=obj`, 'GET', { key: live.key })).status, 400);
  assert.equal(done.out.status, 'done');
  assert.equal(done.out.tools[0].name, 'screwdriver');
  // Someone else's key can't see the job.
  assert.equal((await call(api, `/api/trace/v1/jobs/${done.out.id}`, 'GET', { key: tkey.key })).status, 404);
  // A failure says nothing about the engine, and costs nothing.
  fail = true;
  const bad = await run(live.key);
  assert.equal(bad.out.status, 'failed');
  assert.doesNotMatch(JSON.stringify(bad.out), /roboflow|sam3|gpu|modal/i);
  fail = false;
  // A photo the converter can't read gets the plain "couldn't read" answer.
  const convertRaw = toolLibrary.convertRaw;
  toolLibrary.convertRaw = async () => { throw Object.assign(new Error('PIL: cannot identify image'), { status: 415 }); };
  const unreadable = await run(live.key);
  assert.match(unreadable.out.error, /Couldn’t read that photo/);
  toolLibrary.convertRaw = convertRaw;
  assert.equal((await call(api, '/api/trace/v1', 'GET', { key: live.key })).out.key.usedThisMonth, 1, 'only the photo that worked counts');
  await run(live.key);
  assert.equal((await run(live.key)).status, 429, 'the allowance of 2 is used up');
  await call(api, `/api/admin/trace-api/keys/${live.id}`, 'DELETE', { user: OWNER });
  assert.equal((await call(api, '/api/trace/v1', 'GET', { key: live.key })).status, 403, 'revoked');
  assert.doesNotMatch(JSON.stringify((await call(api, '/api/trace/v1', 'GET', { key: tkey.key })).out), /roboflow|sam3|gpu|modal/i);
});
