// The public engine API: keys, the switch, generating files with serials,
// limits and errors.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { createSession } from '../server/auth.js';

let base, server, db, dir, app;
before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'mm-eapi-'));
  const config = loadConfig({ DATABASE_PATH: join(dir, 'app.db'), PUBLIC_URL: 'http://localhost' });
  app = createApp(config);
  ({ server, db } = app);
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
const withKey = (key, path, body) => fetch(base + path, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('the API starts switched off, keys are made on the site and shown once, and staff can try it early', async () => {
  const info = await (await fetch(`${base}/api/engine/v1`)).json();
  assert.equal(info.enabled, false);
  assert.deepEqual(info.kinds, ['bin', 'baseplate', 'holder', 'labels', 'skadis', 'morph', 'enclosure', 'simrig', 'tslot', 'swatch', 'spool', 'knob', 'dragchain', 'hinge', 'jar', 'stand', 'deskhook', 'planter', 'cutter', 'keychain', 'bagclip', 'coaster', 'cablewrap', 'battery', 'shelfbracket', 'headphone', 'keyrack', 'plantmarker', 'toothbrush', 'spicerack', 'broomholder', 'bookend', 'laptopstand', 'monitorriser', 'desktidy', 'cablebox', 'chargedock', 'deskdrawer', 'deskhanger', 'controllerrack', 'grommet', 'serverrack', 'leadhanger', 'bikehook', 'shoerack', 'petbowl', 'routershelf', 'remotecaddy', 'tabletholder', 'glassesrack', 'familycharger', 'hairholder', 'lidrack', 'mughooks', 'wraprack', 'glassrail', 'cutlerytray', 'hallhooks', 'toytray', 'shoehorn', 'bathcaddy', 'spoolrack', 'propagator', 'gameinsert', 'dicetower', 'cardholder', 'pillbox', 'dateclip', 'magnetholder', 'jewellerystand', 'tierack', 'capsuleholder', 'doorstop', 'tubesqueezer', 'clothespeg']);
  const kinds = await (await fetch(`${base}/api/engine/v1/kinds`)).json();
  assert.equal(typeof kinds.kinds.bin.defaults.gridX, 'number');
  assert.equal((await fetch(`${base}/api/engine/v1/keys`)).status, 401);
  const ana = await user('ea_ana'), mod = await user('ea_mod', 'admin');
  const made = await ana.call('/api/engine/v1/keys', { method: 'POST', body: { name: 'Home Assistant' } });
  assert.equal(made.status, 201);
  assert.match(made.data.key, /^vx_[A-Za-z0-9_-]{32}$/);
  const list = await ana.call('/api/engine/v1/keys');
  assert.deepEqual(list.data.keys.map((k) => [k.name, k.calls]), [['Home Assistant', 0]]);
  assert.equal(list.data.keys[0].key, undefined, 'the key itself is never listed');
  // Off: a member's key gets 503, no key gets 401, a staff key works.
  assert.equal((await withKey(made.data.key, '/api/engine/v1/generate', { kind: 'bin' })).status, 503);
  assert.equal((await withKey('vx_nope', '/api/engine/v1/generate', { kind: 'bin' })).status, 401);
  const staffKey = (await mod.call('/api/engine/v1/keys', { method: 'POST', body: { name: 'test' } })).data.key;
  const r = await withKey(staffKey, '/api/engine/v1/parts', { kind: 'bin', params: { gridX: 2, gridY: 1, heightUnits: 3, labelTab: 10 } });
  assert.equal(r.status, 200);
  const parts = (await r.json()).parts;
  assert.ok(parts.some((p) => p.name === 'bin') && parts[0].triangles > 100 && parts[0].size[0] > 80);
  // Five keys at most; revoking frees a slot and kills the key.
  for (let i = 0; i < 4; i++) assert.equal((await ana.call('/api/engine/v1/keys', { method: 'POST', body: { name: `k${i}` } })).status, 201);
  assert.equal((await ana.call('/api/engine/v1/keys', { method: 'POST', body: { name: 'six' } })).status, 400);
  assert.equal((await ana.call(`/api/engine/v1/keys/${made.data.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await mod.call(`/api/engine/v1/keys/${made.data.id}`, { method: 'DELETE' })).status, 404, 'only your own');
  assert.equal((await withKey(made.data.key, '/api/engine/v1/parts', { kind: 'bin' })).status, 401, 'revoked');
});

test('switched on: files come back with a serial, STL wants one part, bad settings say why', async () => {
  app.controls.setSwitch('engineApi', true);
  const ben = await user('ea_ben');
  const key = (await ben.call('/api/engine/v1/keys', { method: 'POST', body: { name: 'script' } })).data.key;
  const r = await withKey(key, '/api/engine/v1/generate', { kind: 'bin', format: '3mf', name: 'Socket Rail!', params: { gridX: 2, gridY: 2, heightUnits: 3, labelTab: 10 } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'model/3mf');
  assert.equal(r.headers.get('content-disposition'), 'attachment; filename="socket-rail.3mf"');
  const serial = r.headers.get('x-vertex-serial');
  assert.match(serial, /^VX-\d{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  assert.ok(r.headers.get('x-vertex-parts').startsWith('bin'));
  const bytes = new Uint8Array(await r.arrayBuffer());
  assert.equal(bytes[0], 0x50, 'a 3MF is a zip');
  assert.ok(bytes.length > 10000);
  const row = db.prepare('SELECT user_id, kind, format, engine FROM download_serials WHERE serial = ?').get(serial);
  assert.deepEqual({ ...row }, { user_id: ben.id, kind: 'bin', format: '3mf', engine: row.engine });
  assert.equal((await ben.call('/api/engine/v1/keys')).data.keys[0].calls, 1);
  // STL of a many-part model needs "part"; OBJ takes them all.
  const split = { gridX: 8, gridY: 6, bed: 180 };
  const parts = await (await withKey(key, '/api/engine/v1/parts', { kind: 'baseplate', params: split })).json();
  assert.ok(parts.parts.length >= 2, 'a plate split for a 180 mm bed is several tiles');
  const stl = await withKey(key, '/api/engine/v1/generate', { kind: 'baseplate', format: 'stl', params: split });
  assert.equal(stl.status, 400);
  assert.match((await stl.json()).error, /parts; STL takes one/);
  const one = await withKey(key, '/api/engine/v1/generate', { kind: 'baseplate', format: 'stl', part: parts.parts[0].name, params: split });
  assert.equal(one.status, 200);
  assert.equal(one.headers.get('content-type'), 'model/stl');
  const obj = await withKey(key, '/api/engine/v1/generate', { kind: 'baseplate', format: 'obj', params: { gridX: 2, gridY: 2 } });
  assert.equal(obj.status, 200);
  assert.match(new TextDecoder().decode(await obj.arrayBuffer()).slice(0, 200), /^#|^o |^v /m);
  // Refusals.
  assert.equal((await withKey(key, '/api/engine/v1/generate', { kind: 'spaceship' })).status, 400);
  assert.equal((await withKey(key, '/api/engine/v1/generate', { kind: 'bin', format: 'step' })).status, 400);
  assert.equal((await withKey(key, '/api/engine/v1/generate', { kind: 'bin', params: [1, 2] })).status, 400);
  const big = await withKey(key, '/api/engine/v1/generate', { kind: 'bin', params: { gridX: 99 } });
  assert.equal(big.status, 400);
  assert.match((await big.json()).error, /gridX is at most/);
  app.controls.saveRemote({ generators: { bin: { state: 'paused', note: 'new lip' } } }); // paused on VERTEX
  assert.equal((await withKey(key, '/api/engine/v1/generate', { kind: 'bin' })).status, 423);
  app.controls.saveRemote({ generators: {} });
  app.controls.setSwitch('engineApi', false);
});
