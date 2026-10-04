// The AI door: the built-in tracer first, the paid AI only when needed and
// while the owner's allowance lasts, and every trace counted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/db.js';
import { can } from '../server/roles.js';
import { createAiDoor, looksRight } from '../server/ai-door.js';

const PAPER = { name: 'A4', widthMm: 210, heightMm: 297 };
const tool = (l, w) => ({ name: 'tool', lengthMm: l, widthMm: w, areaMm2: l * w * 0.8, outline: [] });
const GOOD = { paper: PAPER, tools: [tool(180, 20), tool(120, 15)] };
const UNSURE = { paper: PAPER, tools: [] };
const AI = { paper: PAPER, tools: [{ ...tool(180, 20), name: 'screwdriver' }] };

function setup({ builtin = GOOD, aiFails = false, aiOn = true } = {}) {
  const db = openDatabase(':memory:');
  let paid = 0;
  const toolLibrary = { aiOn: () => aiOn, outline: async () => { paid++; if (aiFails) throw new Error('down'); return []; } };
  // A stand-in for the real tracer: the built-in pass is the one whose outline() is the door's empty one.
  const traceVia = async ({ outline }) => (outline === toolLibrary.outline || !outline.toString().includes('[]') ? (await outline('img'), structuredClone(AI)) : structuredClone(builtin));
  const door = createAiDoor({ db, can, toolLibrary, trace: traceVia });
  return { db, door, paid: () => paid };
}
const routes = (db) => Object.fromEntries(db.prepare('SELECT route, SUM(count) AS n FROM ai_door_days GROUP BY route').all().map((r) => [r.route, r.n]));

test('what counts as a doubtful built-in answer', () => {
  assert.equal(looksRight(GOOD), true);
  assert.equal(looksRight(UNSURE), false, 'nothing found');
  assert.equal(looksRight({ paper: PAPER, tools: [tool(200, 160)] }), false, 'a shape covering half the paper');
  assert.equal(looksRight({ paper: PAPER, tools: [tool(150, 20), tool(8, 6), tool(9, 5)] }), false, 'crumbs');
  assert.equal(looksRight({ paper: PAPER, tools: Array.from({ length: 21 }, () => tool(40, 10)) }), false, 'too many');
});

test('free first: a good built-in answer never costs an AI call', async () => {
  const { db, door, paid } = setup();
  const r = await door.tracePhoto({ image: {}, jpeg: 'x', paper: 'a4', caller: 'key:1' });
  assert.equal(r.route, 'builtin');
  assert.equal(paid(), 0);
  assert.deepEqual(routes(db), { builtin: 1 });
});

test('free first: a doubtful one goes to the paid AI, until the allowance runs out', async () => {
  const { db, door, paid } = setup({ builtin: UNSURE });
  db.prepare("INSERT INTO settings (key, value) VALUES ('ai_door', ?)").run(JSON.stringify({ mode: 'free-first', monthlyAi: 2, dailyAi: 10 }));
  assert.equal((await door.tracePhoto({ image: {}, jpeg: 'x', caller: 'key:1' })).route, 'ai');
  assert.equal((await door.tracePhoto({ image: {}, jpeg: 'x', caller: 'key:1' })).route, 'ai');
  const third = await door.tracePhoto({ image: {}, jpeg: 'x', caller: 'key:1' });
  assert.equal(third.route, 'builtin', 'over the allowance: the built-in answer');
  assert.equal(paid(), 2);
  assert.deepEqual(routes(db), { ai: 2, capped: 1 });
  assert.equal(door.allowance().left, 0);
});

test('free only never pays; AI first pays straight away; a failed AI call falls back', async () => {
  const off = setup({ builtin: UNSURE });
  off.db.prepare("INSERT INTO settings (key, value) VALUES ('ai_door', ?)").run(JSON.stringify({ mode: 'free-only' }));
  assert.equal((await off.door.tracePhoto({ image: {}, jpeg: 'x' })).route, 'builtin');
  assert.equal(off.paid(), 0);

  const first = setup();
  first.db.prepare("INSERT INTO settings (key, value) VALUES ('ai_door', ?)").run(JSON.stringify({ mode: 'ai-first' }));
  assert.equal((await first.door.tracePhoto({ image: {}, jpeg: 'x' })).route, 'ai');
  assert.equal(first.paid(), 1);

  const down = setup({ builtin: UNSURE, aiFails: true });
  const r = await down.door.tracePhoto({ image: {}, jpeg: 'x' });
  assert.equal(r.route, 'builtin');
  assert.deepEqual(routes(down.db), { 'ai-failed': 1 }, 'counted once, as the failed paid call');
  assert.equal(down.door.allowance().usedMonth, 1, 'a failed call still uses the allowance');
});

test('without an AI key everything is traced free, and nothing says "over allowance"', async () => {
  const { db, door } = setup({ builtin: UNSURE, aiOn: false });
  assert.equal((await door.tracePhoto({ image: {}, jpeg: 'x' })).route, 'builtin');
  assert.deepEqual(routes(db), { builtin: 1 });
});

test('VERTEX’s outlines come through the same allowance', async () => {
  const { db, door, paid } = setup();
  db.prepare("INSERT INTO settings (key, value) VALUES ('ai_door', ?)").run(JSON.stringify({ monthlyAi: 1 }));
  assert.deepEqual(await door.outline('data:image/jpeg;base64,xx', 'sam3', 'vertex'), []);
  await assert.rejects(door.outline('data:image/jpeg;base64,xx', 'sam3', 'vertex'), (e) => e.status === 429 && /allowance/.test(e.message));
  assert.equal(paid(), 1);
  assert.deepEqual(door.usage(30).byCaller.vertex, { builtin: 0, ai: 1, 'ai-failed': 0, capped: 1 });
});

test('admin: owners see and set the allowance; others can’t', async () => {
  const { door } = setup();
  const call = async (user, method, body) => {
    let out = null, status = 200;
    const req = { url: '/api/admin/ai-door', headers: body ? { 'content-type': 'application/json' } : {}, [Symbol.asyncIterator]: async function* () { if (body) yield Buffer.from(JSON.stringify(body)); } };
    try { await door.handle(req, {}, '/api/admin/ai-door', method, { user }, (_r, s, b) => { status = s; out = b; }); } catch (e) { status = e.status; out = { error: e.message }; }
    return { status, out };
  };
  assert.equal((await call({ id: 2, role: 'admin' }, 'GET')).status, 403);
  const owner = { id: 1, role: 'owner' };
  assert.equal((await call(owner, 'GET')).out.allowance.mode, 'free-first');
  const set = await call(owner, 'PUT', { mode: 'ai-first', monthlyAi: 50, dailyAi: 5 });
  assert.deepEqual([set.out.allowance.mode, set.out.allowance.monthlyAi, set.out.allowance.dailyAi], ['ai-first', 50, 5]);
  assert.equal((await call(owner, 'PUT', { mode: 'nonsense', monthlyAi: -4 })).out.allowance.mode, 'ai-first', 'bad values are ignored or clamped');
});
