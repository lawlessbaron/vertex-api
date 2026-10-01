// Every engine and tracer API call is written down: request ids, keys,
// accounts, serials and errors; each developer sees their own, staff see all.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { createSession } from '../server/auth.js';

let base, server, db, dir;
before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'mm-apilog-'));
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
    const text = await res.text();
    let data = null; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
  };
  return { id, call };
}
const withKey = (key, path, body) => fetch(base + path, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', 'user-agent': 'my-script/1.0' }, body: JSON.stringify(body) });

test('calls are recorded with a request id, key, account, serial and error; the console shows your own', async () => {
  const boss = await user('al_boss', 'owner'), dev = await user('al_dev'), other = await user('al_other');
  // The API is off, so use a staff key to make files; a member's key is refused (and recorded).
  const staffKey = (await boss.call('/api/engine/v1/keys', { method: 'POST', body: { name: 'Shop' } })).data;
  const devKey = (await dev.call('/api/engine/v1/keys', { method: 'POST', body: { name: 'Bot' } })).data;
  assert.match(devKey.hint, /^vx_.{4}…$/);
  const ok = await withKey(staffKey.key, '/api/engine/v1/generate', { kind: 'bin', format: 'stl', params: { gridX: 1, gridY: 1, heightUnits: 3 } });
  assert.equal(ok.status, 200);
  const rid = ok.headers.get('x-request-id'), serial = ok.headers.get('x-vertex-serial');
  assert.match(rid, /^req_/);
  await ok.arrayBuffer();
  const off = await withKey(devKey.key, '/api/engine/v1/generate', { kind: 'bin' });
  assert.equal(off.status, 503);
  await withKey('vx_doesnotexist', '/api/engine/v1/parts', { kind: 'bin' });
  await new Promise((r) => setTimeout(r, 50));

  // The developer sees only their own calls, with the error they got.
  const con = await dev.call('/api/developer/console');
  assert.equal(con.status, 200);
  assert.equal(con.data.keys[0].name, 'Bot');
  assert.ok(con.data.recent.length >= 1 && con.data.recent.every((r) => r.key?.name === 'Bot' || r.key === null || r.key?.type === 'engine'));
  const mine = await dev.call('/api/developer/requests?status=error');
  assert.ok(mine.data.rows.some((r) => r.status === 503 && /switched on/.test(r.error)));
  assert.ok(!mine.data.rows.some((r) => r.requestId === rid), 'not someone else\'s call');
  assert.equal(mine.data.rows[0].ip, undefined, 'developers don\'t see IPs');
  assert.equal((await other.call(`/api/developer/requests/${rid}`)).status, 404);

  // Staff see everything and can trace a serial back to the call, key and account.
  assert.equal((await dev.call('/api/admin/api/summary')).status, 403);
  const sum = await boss.call('/api/admin/api/summary');
  assert.equal(sum.status, 200);
  assert.ok(sum.data.totals.calls >= 3 && sum.data.totals.errors >= 2 && sum.data.totals.files >= 1);
  assert.ok(sum.data.badKeys.some((b) => b.hint === 'vx_does…'));
  const tr = await boss.call(`/api/admin/api/trace/${serial}`);
  assert.equal(tr.status, 200);
  assert.equal(tr.data.call.requestId, rid);
  assert.equal(tr.data.call.user.handle, 'al_boss');
  assert.equal(tr.data.call.kind, 'bin');
  assert.equal(tr.data.call.format, 'stl');
  assert.deepEqual(tr.data.call.params, { gridX: 1, gridY: 1, heightUnits: 3 });
  assert.equal(tr.data.download.serial, serial);
  assert.equal(tr.data.key.name, 'Shop');
  const csv = await boss.call('/api/admin/api/requests.csv');
  assert.match(csv.data, /^request_id,time_utc,api/);
  assert.ok(csv.data.includes(rid));
  // Revoking keeps the key on record (old calls still name it) and stops it working.
  assert.equal((await boss.call(`/api/admin/api/keys/engine/${devKey.id}/revoke`, { method: 'POST', body: { reason: 'test' } })).status, 200);
  const keys = await boss.call('/api/admin/api/keys');
  assert.ok(keys.data.engine.find((k) => k.id === devKey.id).revokedAt);
  assert.equal((await withKey(devKey.key, '/api/engine/v1/parts', { kind: 'bin' })).status, 401);
  // Renaming a key.
  const renamed = await boss.call(`/api/engine/v1/keys/${staffKey.id}`, { method: 'PATCH', body: { name: 'Shop orders' } });
  assert.equal(renamed.data.name, 'Shop orders');
  assert.ok(db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action = 'api.key.revoke'").get().n >= 1);
});
