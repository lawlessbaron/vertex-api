// Custom generators: recipes of engine parts with inputs and safe formulas,
// checked against the reference engine (broken, off-spec, changes nothing, a
// score and Verified), saved in the console, and built with a key.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { createSession } from '../server/auth.js';
import { evalFormula, resolveValue, cleanSpec, sampleInputs } from '../server/custom-generators.js';
import { API_KINDS } from '../server/engine-api.js';

test('formulas: numbers, inputs and a few functions; nothing else runs', () => {
  assert.equal(evalFormula('$w * 42 - 0.5', { w: 2 }), 83.5);
  assert.equal(evalFormula('clamp(round($n / 3), 1, 4) + -(2)', { n: 10 }), 1);
  assert.equal(evalFormula('max(1, 2, 3) * (1 + $on)', { on: true }), 6);
  assert.throws(() => evalFormula('process.exit()', {}), /doesn’t know/);
  assert.throws(() => evalFormula('constructor', {}), /doesn’t know/);
  assert.throws(() => evalFormula('1 / 0', {}), /doesn’t give a number/);
  assert.throws(() => evalFormula('$style', { style: 'tall' }), /isn’t a number/);
  assert.equal(resolveValue('$style', { style: 'tall' }), 'tall');
  assert.equal(resolveValue('plain text', {}), 'plain text');
  assert.throws(() => resolveValue('$nope', {}), /no input called/);
});

const TRAY = {
  name: 'Bin row',
  description: 'A row of Gridfinity bins on a baseplate.',
  inputs: [
    { id: 'count', type: 'number', min: 1, max: 3, default: 2, step: 1 },
    { id: 'tall', type: 'bool', default: false },
  ],
  parts: [
    { kind: 'baseplate', name: 'plate', params: { gridX: '$count', gridY: 1 } },
    { kind: 'bin', name: 'bin', params: { gridX: 1, gridY: 1, heightUnits: '=3 + $tall * 3' }, at: [0, 0, 5], repeat: { count: '$count', step: [42, 0, 0] } },
  ],
};

test('recipes: cleaned, and the check samples every input', () => {
  const s = cleanSpec(TRAY, API_KINDS);
  assert.equal(s.parts[1].repeat.count, '$count');
  assert.deepEqual(sampleInputs(s).map((x) => x.label), ['defaults', 'count at 1', 'count at 3', 'tall on']);
  assert.throws(() => cleanSpec({ name: 'x', parts: [{ kind: 'rocket' }] }, API_KINDS), /kind must be one of/);
  assert.throws(() => cleanSpec({ name: 'x', inputs: [{ id: '1bad' }], parts: [{ kind: 'bin' }] }, API_KINDS), /id must be/);
  assert.throws(() => cleanSpec({ name: '', parts: [] }, API_KINDS), /name/);
});

let base, server, db, dir;
before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'mm-custom-'));
  ({ server, db } = createApp(loadConfig({ DATABASE_PATH: join(dir, 'app.db'), PUBLIC_URL: 'http://localhost' })));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); rmSync(dir, { recursive: true, force: true }); });

async function user(handle, role = 'user') {
  const id = Number(db.prepare('INSERT INTO users (email, name, handle, role, created_at, synced_at) VALUES (?, ?, ?, ?, ?, ?)').run(`${handle}@t.io`, handle, handle, role, Date.now(), Date.now()).lastInsertRowid);
  const cookie = `mm_api=${createSession(db, id, 'test')}`;
  const call = async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(base + path, { method, headers: { cookie, ...(method !== 'GET' ? { origin: base, 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  return { id, call };
}

test('the check, saving, publishing and building with a key', { timeout: 120000 }, async () => {
  const ana = await user('cg_ana', 'admin'), ben = await user('cg_ben');
  // A good recipe passes and is Verified.
  const good = await ana.call('/api/engine/v1/custom/check', { method: 'POST', body: { spec: TRAY } });
  assert.equal(good.status, 200, JSON.stringify(good.data));
  assert.equal(good.data.check.verified, true, JSON.stringify(good.data.check));
  assert.ok(good.data.check.score >= 0.95);
  // Broken, off-spec and no-effect parts are all found.
  const bad = await ana.call('/api/engine/v1/custom/check', { method: 'POST', body: { spec: {
    name: 'Messy', inputs: [{ id: 'size', type: 'number', min: 1, max: 99, default: 2 }, { id: 'unused', type: 'bool' }],
    parts: [
      { kind: 'bin', name: 'big', params: { gridX: '$size', gridY: 1, sparkle: 3, heightUnits: 6 } },
      { kind: 'bin', name: 'sunk', params: { gridX: 1 }, at: [0, 0, -10] },
      { kind: 'bin', name: 'twin', params: { gridX: 1 }, at: [0, 0, -10] },
    ] } } });
  const levels = (lv) => bad.data.check.findings.filter((f) => f.level === lv).map((f) => `${f.part}: ${f.text}`);
  assert.equal(bad.data.check.verified, false);
  assert.ok(levels('broken').some((t) => /^big: size at 99/.test(t)), JSON.stringify(bad.data.check.findings));
  assert.ok(levels('off-spec').some((t) => /below the bed/.test(t)));
  assert.ok(levels('no-effect').some((t) => /"sparkle" isn’t a bin setting/.test(t)));
  assert.ok(levels('no-effect').some((t) => /"heightUnits" is always 6/.test(t)));
  assert.ok(levels('no-effect').some((t) => /^twin: The same as sunk/.test(t)));
  assert.ok(levels('no-effect').some((t) => /unused isn’t used/.test(t)));
  assert.ok(bad.data.check.score < good.data.check.score);
  // Saved: private until published.
  const saved = await ana.call('/api/engine/v1/custom', { method: 'POST', body: { spec: TRAY } });
  assert.equal(saved.status, 201);
  assert.match(saved.data.id, /^cg_/);
  assert.equal(saved.data.verified, true);
  assert.equal((await ben.call(`/api/engine/v1/custom/${saved.data.id}`)).status, 404, 'not published yet');
  assert.equal((await ben.call(`/api/engine/v1/custom/${saved.data.id}`, { method: 'PUT', body: { spec: TRAY } })).status, 404, 'only the author edits');
  assert.equal((await ana.call(`/api/engine/v1/custom/${saved.data.id}`, { method: 'PUT', body: { spec: TRAY, public: true } })).data.public, true);
  assert.equal((await ben.call('/api/engine/v1/custom')).data.published[0].author, '@cg_ana');
  // Built with a key (staff keys work while the engine API is off): a 3MF with every part, and a serial.
  const key = (await ana.call('/api/engine/v1/keys', { method: 'POST', body: { name: 'k' } })).data.key;
  const res = await fetch(`${base}/api/engine/v1/custom/${saved.data.id}/generate`, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ inputs: { count: 3, tall: true }, format: '3mf' }) });
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(res.headers.get('x-vertex-verified'), '1');
  assert.ok(res.headers.get('x-vertex-serial'));
  assert.deepEqual(res.headers.get('x-vertex-parts').split(',').filter((p) => /^bin-/.test(p)), ['bin-1', 'bin-2', 'bin-3']);
  assert.ok((await res.arrayBuffer()).byteLength > 10000);
  assert.equal(db.prepare('SELECT uses FROM custom_generators WHERE id = ?').get(saved.data.id).uses, 1);
  // Inputs stay inside their ranges; STL needs one part.
  const stl = await fetch(`${base}/api/engine/v1/custom/${saved.data.id}/generate`, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ inputs: { count: 99 }, format: 'stl' }) });
  assert.equal(stl.status, 400);
  assert.match((await stl.json()).error, /bin-3/);
  assert.equal((await ana.call(`/api/engine/v1/custom/${saved.data.id}`, { method: 'DELETE' })).status, 200);
});
