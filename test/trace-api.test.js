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
    for (let i = 0; i < 250; i++) { const r = await call(api, s.out.check, 'GET', { key }); if (r.out.status !== 'running') return r; await new Promise((ok) => setTimeout(ok, 20)); } // the trace runs on a worker thread
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

test('billing per photo: free photos first, only traced photos, test keys never, each month invoiced once', async () => {
  const db = openDatabase(':memory:');
  const OWNER = { id: 1, role: 'owner' };
  db.prepare("INSERT INTO users (id, email, name, role, handle, created_at, synced_at) VALUES (1, 'o@x.y', 'O', 'owner', 'owner', 1, 1)").run();
  db.prepare("INSERT INTO users (id, email, name, role, handle, stripe_customer_id, created_at, synced_at) VALUES (7, 'p@x.y', 'P', 'member', 'acme', 'cus_acme', 1, 1)").run();
  const { image, bar } = photo();
  let fail = false, clock = Date.now();
  const items = [];
  const billing = { stripeReady: () => true, currency: () => 'aud', stripeCall: async (m, p, body) => { items.push({ m, p, body }); return { id: `ii_${items.length}` }; } };
  const toolLibrary = { aiOn: () => true, convertOn: () => true, convertRaw: async () => ({ jpeg: 'x', image }), outline: async (...a) => { if (fail) throw new Error('nope'); return outlineOf(bar)(...a); } };
  const api = createTraceApi({ db, can, toolLibrary, billing, now: () => clock });
  await call(api, '/api/admin/trace-api', 'PUT', { user: OWNER, body: { on: true } });
  // A price needs someone to pay it, and that account has to exist.
  assert.equal((await call(api, '/api/admin/trace-api/keys', 'POST', { user: OWNER, body: { name: 'Acme', centsPerPhoto: 5 } })).status, 400);
  assert.equal((await call(api, '/api/admin/trace-api/keys', 'POST', { user: OWNER, body: { name: 'Acme', centsPerPhoto: 5, billTo: '@nobody' } })).status, 400);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM trace_keys').get().n, 0, 'a refused key leaves nothing behind');
  const live = (await call(api, '/api/admin/trace-api/keys', 'POST', { user: OWNER, body: { name: 'Acme', quota: 50, centsPerPhoto: 5, freePhotos: 1, billTo: '@acme' } })).out;
  assert.equal(live.centsPerPhoto, 5);
  assert.equal(live.billHandle, 'acme');
  const tkey = (await call(api, '/api/admin/trace-api/keys', 'POST', { user: OWNER, body: { name: 'Tester', test: true, centsPerPhoto: 5, billTo: '@acme' } })).out;
  assert.equal(tkey.centsPerPhoto, 0, 'test keys are never priced');
  assert.equal((await call(api, `/api/admin/trace-api/keys/${tkey.id}`, 'PUT', { user: OWNER, body: { centsPerPhoto: 5 } })).status, 400);

  const run = async (key) => {
    const s = await call(api, '/api/trace/v1/jobs', 'POST', { key, body: { image: 'AAAA', paper: 'a4' } });
    for (let i = 0; i < 250; i++) { const r = await call(api, s.out.check, 'GET', { key }); if (r.out.status !== 'running') return r; await new Promise((ok) => setTimeout(ok, 20)); }
    throw new Error('never finished');
  };
  const owed = async () => (await call(api, '/api/trace/v1', 'GET', { key: live.key })).out.key.price.owedThisMonthCents;
  await run(live.key);
  assert.equal(await owed(), 0, 'the first photo is free');
  await run(live.key);
  assert.equal(await owed(), 5);
  fail = true; await run(live.key); fail = false;
  assert.equal(await owed(), 5, 'a failed photo costs nothing');
  // A price change applies from the next photo; earlier photos keep their price.
  await call(api, `/api/admin/trace-api/keys/${live.id}`, 'PUT', { user: OWNER, body: { centsPerPhoto: 10 } });
  await run(live.key);
  assert.equal(await owed(), 15);
  await run(tkey.key);
  assert.equal((await call(api, '/api/trace/v1', 'GET', { key: tkey.key })).out.key.price, undefined, 'a test key has no bill');
  // This month isn't billed yet; next month it goes on Acme's invoice once.
  assert.equal(await api.billPhotos(), 0);
  clock += 40 * 864e5;
  assert.equal(await api.billPhotos(), 1);
  assert.equal(items.length, 1);
  assert.equal(items[0].p, '/invoiceitems');
  assert.equal(items[0].body.customer, 'cus_acme');
  assert.equal(items[0].body.amount, 15);
  assert.match(items[0].body.description, /2 photos/);
  assert.doesNotMatch(items[0].body.description, /roboflow|sam/i);
  assert.equal(await api.billPhotos(), 0, 'billed once');
  const admin = (await call(api, '/api/admin/trace-api', 'GET', { user: OWNER })).out;
  assert.equal(admin.bills[0].invoiceItem, 'ii_1');
  // Without a card on file it's marked for invoicing by hand, never lost.
  db.prepare("INSERT INTO trace_bills (key_id, month, photos, cents) VALUES (?, '2020-01', 3, 30)").run(live.id);
  db.prepare('UPDATE users SET stripe_customer_id = NULL WHERE id = 7').run();
  await api.billPhotos();
  assert.equal(db.prepare("SELECT invoice_item FROM trace_bills WHERE month = '2020-01'").get().invoice_item, 'invoice by hand');
});
