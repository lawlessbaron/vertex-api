// Guarding the APIs: alerts from the call log, blocked addresses, keys locked
// to addresses, developers' signed webhooks, the API site's admin and its
// read-only "view as", and wiping a deleted account from the log.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../server/db.js';
import { createApiGuard, ipAllowed, parseAllow } from '../server/api-guard.js';
import { createApiWebhooks, privateAddress, sign } from '../server/api-webhooks.js';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { createSession } from '../server/auth.js';

const H = 3600e3;
let dir;
before(() => { dir = mkdtempSync(join(tmpdir(), 'mm-apiguard-')); });
after(() => rmSync(dir, { recursive: true, force: true }));

test('allowlists take addresses and IPv4 ranges, and nothing else', () => {
  assert.equal(parseAllow(''), null);
  assert.equal(parseAllow('203.0.113.4, 198.51.100.0/24\n2001:db8::1'), '203.0.113.4, 198.51.100.0/24, 2001:db8::1');
  assert.throws(() => parseAllow('example.com'), /isn't an IP/);
  assert.throws(() => parseAllow('10.0.0.0/4'), /\/8 to \/32/);
  assert.throws(() => parseAllow(Array.from({ length: 21 }, (_, i) => `10.0.0.${i}`).join(',')), /20/);
  assert.equal(ipAllowed('1.2.3.4', null), true);
  assert.equal(ipAllowed('198.51.100.77', '203.0.113.4, 198.51.100.0/24'), true);
  assert.equal(ipAllowed('::ffff:203.0.113.4', '203.0.113.4'), true);
  assert.equal(ipAllowed('198.51.101.1', '198.51.100.0/24'), false);
  assert.equal(ipAllowed('2001:db8::2', '2001:db8::1'), false);
});

test('the guard raises each kind of alert once, and they reach staff', () => {
  const db = openDatabase(join(dir, 'guard.db'));
  const sent = [];
  const T = Date.UTC(2026, 9, 1, 12);
  const guard = createApiGuard({ db, alerts: { send: (kind, a) => sent.push({ kind, ...a }) }, now: () => T });
  const uid = Number(db.prepare("INSERT INTO users (email, name, handle, role, created_at, synced_at) VALUES ('g@t.io', 'g', 'gdev', 'user', 0, 0)").run().lastInsertRowid);
  const key = (name, at = T - 30 * 24 * H) => Number(db.prepare('INSERT INTO engine_keys (user_id, name, key_hash, key_hint, created_at) VALUES (?, ?, ?, ?, ?)').run(uid, name, `h-${name}`, `vx_${name.slice(0, 4)}…`, at).lastInsertRowid);
  const ins = db.prepare("INSERT INTO api_requests (request_id, at, api, method, path, status, ms, bytes, key_type, key_id, key_hint, user_id, ip, params) VALUES (?, ?, 'engine', 'POST', ?, ?, 10, 0, ?, ?, ?, ?, ?, ?)");
  let n = 0;
  const call = (at, { keyId = null, status = 200, ip = '198.51.100.9', path = '/api/engine/v1/generate', params = null, hint = 'vx_x…' } = {}) => ins.run(`req_${n++}`, at, path, status, keyId ? 'engine' : null, keyId, hint, keyId ? uid : null, ip, params);

  const spike = key('spiky');
  for (let i = 0; i < 7 * 24; i++) call(T - 2 * H - i * H, { keyId: spike }); // one an hour, for a week
  for (let i = 0; i < 60; i++) call(T - i * 1000, { keyId: spike }); // then 60 this hour
  const failing = key('failing');
  for (let i = 0; i < 25; i++) call(T - i * 1000, { keyId: failing, status: i % 4 ? 400 : 200 });
  const quiet = key('quiet');
  for (let i = 0; i < 150; i++) call(T - 2 * 24 * H - i * 60e3, { keyId: quiet });
  for (let i = 0; i < 22; i++) call(T - i * 1000, { status: 401, ip: '203.0.113.66', hint: `vx_g${i}…` });
  const many = Array.from({ length: 5 }, (_, i) => key(`cyc${i}`, T - H));
  for (const k of many) call(T - 1000, { keyId: k, ip: '203.0.113.77' });
  const scrape = key('scraper');
  for (let i = 0; i < 300; i++) call(T - i * 1000, { keyId: scrape, ip: '192.0.2.10', params: JSON.stringify({ gridX: i }) });

  guard.scan();
  const kinds = (sub) => db.prepare('SELECT kind FROM api_alerts WHERE subject = ?').all(sub).map((r) => r.kind).sort();
  assert.deepEqual(kinds(`engine:${spike}`), ['spike']);
  assert.deepEqual(kinds(`engine:${failing}`), ['errors']);
  assert.deepEqual(kinds(`engine:${quiet}`), ['quiet']);
  assert.deepEqual(kinds('ip:203.0.113.66'), ['guessing']);
  assert.deepEqual(kinds('ip:203.0.113.77'), ['cycling']);
  assert.deepEqual(kinds(`user:${uid}`), ['cycling']);
  assert.ok(kinds(`engine:${scrape}`).includes('scraping'));
  assert.ok(sent.length >= 7 && sent.every((a) => a.kind === 'api' && a.link === '/admin#alerts'));
  // Not raised again within six hours.
  const before_ = sent.length;
  guard.scan();
  assert.equal(sent.length, before_);
  // Acknowledging, and the open list.
  const open = guard.listAlerts({ open: true });
  assert.ok(guard.ack(open[0].id, uid));
  assert.equal(guard.listAlerts({ open: true }).length, open.length - 1);
  // Speed by endpoint.
  const lat = guard.latency(30);
  assert.ok(lat.find((r) => r.path === '/api/engine/v1/generate' && r.p50 === 10 && r.p99 === 10));
  // Blocks, for a while or for good.
  guard.block('203.0.113.66', { reason: 'guessing', hours: 1 });
  assert.equal(guard.blocked('::ffff:203.0.113.66').reason, 'guessing');
  assert.throws(() => guard.block('nope'), /IP address/);
  assert.ok(guard.unblock('203.0.113.66'));
  assert.equal(guard.blocked('203.0.113.66'), null);
  db.close();
});

test('usage events fire once a day per key', () => {
  const db = openDatabase(join(dir, 'usage.db'));
  const events = [];
  const T = Date.UTC(2026, 9, 1, 12);
  const guard = createApiGuard({ db, onEvent: (u, e, d) => events.push([u, e, d]), now: () => T });
  const uid = Number(db.prepare("INSERT INTO users (email, name, handle, role, created_at, synced_at) VALUES ('u@t.io', 'u', 'udev', 'user', 0, 0)").run().lastInsertRowid);
  const kid = Number(db.prepare("INSERT INTO engine_keys (user_id, name, key_hash, key_hint, created_at) VALUES (?, 'Shop', 'h', 'vx_ab…', 0)").run(uid).lastInsertRowid);
  const ins = db.prepare("INSERT INTO api_requests (request_id, at, api, method, path, status, ms, bytes, key_type, key_id, user_id) VALUES (?, ?, 'engine', 'POST', '/api/engine/v1/generate', 200, 1, 0, 'engine', ?, ?)");
  for (let i = 0; i < 800; i++) ins.run(`r${i}`, T - i * 1000, kid, uid);
  const row = { at: T, path: '/api/engine/v1/generate', status: 200, key_type: 'engine', key_id: kid, key_hint: 'vx_ab…', user_id: uid };
  guard.afterCall(row);
  guard.afterCall(row);
  guard.afterCall({ ...row, status: 429, error: 'That key has made 1000 models today. Tomorrow, then.' });
  guard.afterCall({ ...row, status: 429, error: 'That key has made 1000 models today. Tomorrow, then.' });
  assert.deepEqual(events.map((e) => e[1]), ['usage.80', 'usage.limit']);
  assert.equal(events[0][2].key.name, 'Shop');
  assert.equal(events[0][2].used, 800);
  db.close();
});

test('webhooks are signed, retried with backoff, and kept off private networks', async () => {
  const db = openDatabase(join(dir, 'hooks.db'));
  let t = Date.UTC(2026, 9, 1);
  const uid = Number(db.prepare("INSERT INTO users (email, name, handle, role, created_at, synced_at) VALUES ('w@t.io', 'w', 'wdev', 'user', 0, 0)").run().lastInsertRowid);
  // A receiver that fails the first time.
  const got = [];
  let fail = true;
  const rx = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => { got.push({ headers: req.headers, body }); res.writeHead(fail ? 500 : 204); res.end(); fail = false; });
  });
  await new Promise((r) => rx.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${rx.address().port}/hooks`;
  const hooks = createApiWebhooks({ db, now: () => t, allowPrivate: true });
  const h = await hooks.create(uid, { url, events: ['usage.80', 'key.revoked'] });
  assert.match(h.secret, /^whsec_/);
  assert.deepEqual(h.events, ['usage.80', 'key.revoked']);
  assert.equal(hooks.emit(uid, 'key.created', {}).length, 0, 'not subscribed');
  assert.equal(hooks.emit(uid, 'usage.80', { used: 800 }).length, 1);
  await hooks.process();
  let d = hooks.deliveries(uid, h.id)[0];
  assert.equal(d.status, 'pending');
  assert.equal(d.code, 500);
  assert.equal(d.attempts, 1);
  assert.equal(d.nextAt, t + 60e3);
  assert.equal(await hooks.process(), 0, 'not due yet');
  t += 61e3;
  await hooks.process();
  d = hooks.deliveries(uid, h.id)[0];
  assert.equal(d.status, 'delivered');
  assert.equal(got.length, 2);
  // The signature checks out against the secret, and both tries carry the same event id.
  const { headers, body } = got[1];
  const [, ts, v1] = headers['mint-signature'].match(/^t=(\d+),v1=([0-9a-f]{64})$/);
  assert.equal(v1, createHmac('sha256', h.secret).update(`${ts}.${body}`).digest('hex'));
  assert.equal(headers['mint-signature'], sign(h.secret, Number(ts), body));
  assert.equal(headers['mint-event'], 'usage.80');
  assert.equal(headers['mint-delivery'], got[0].headers['mint-delivery']);
  assert.equal(JSON.parse(body).data.used, 800);
  // A test goes to that webhook only, whatever its events.
  assert.equal(hooks.test(uid, h.id).length, 1);
  // Always failing: five retries, then failed.
  fail = true;
  const failing = createApiWebhooks({ db, now: () => t, allowPrivate: true, fetchImpl: async () => ({ status: 503 }) });
  failing.emit(uid, 'key.revoked', {});
  for (let i = 0; i < 6; i++) { await failing.process(); t += 7 * H; }
  const last = failing.deliveries(uid, h.id).find((x) => x.event === 'key.revoked');
  assert.equal(last.status, 'failed');
  assert.equal(last.attempts, 6);
  // Removing; then it gets nothing.
  hooks.remove(uid, h.id);
  assert.equal(hooks.emit(uid, 'usage.80', {}).length, 0);
  assert.throws(() => hooks.remove(uid, h.id), /No webhook/);
  // Addresses: https only, and never into a private network.
  const strict = createApiWebhooks({ db, resolve: async (host) => [{ address: host === 'inside.example' ? '10.1.2.3' : '93.184.216.34' }] });
  await assert.rejects(strict.create(uid, { url: 'http://outside.example/x' }), /https/);
  await assert.rejects(strict.create(uid, { url: 'https://inside.example/x' }), /private network/);
  await assert.rejects(strict.create(uid, { url: 'https://127.0.0.1/x' }), /private network/);
  await assert.rejects(strict.create(uid, { url: 'https://localhost/x' }), /private network/);
  assert.match((await strict.create(uid, { url: 'https://outside.example/x' })).url, /^https:\/\/outside\.example/);
  for (const ip of ['10.0.0.1', '172.20.1.1', '192.168.0.1', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1', '::ffff:127.0.0.1']) assert.ok(privateAddress(ip), ip);
  assert.ok(!privateAddress('93.184.216.34'));
  [hooks, failing, strict].forEach((x) => x.close());
  rx.close();
  db.close();
});

test('the API site: locks, blocks, alerts, view-as, webhooks, and forgetting a deleted account', async () => {
  const config = loadConfig({ DATABASE_PATH: join(dir, 'app.db'), PUBLIC_URL: 'http://localhost' });
  config.webhooksAllowPrivate = true;
  // VERTEX's side of the link: alerts land in its staff alerts.
  const toVertex = [];
  config.link = { on: () => true, alert: async (a) => toVertex.push(a), controls: async () => ({}), exportData: async () => ({ tables: {} }), user: async () => ({ gone: false, user: null }) };
  const { server, db } = createApp(config);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const user = async (handle, role = 'user') => {
    const id = Number(db.prepare('INSERT INTO users (email, name, handle, role, created_at, synced_at) VALUES (?, ?, ?, ?, ?, ?)').run(`${handle}@t.io`, handle, handle, role, Date.now(), Date.now()).lastInsertRowid);
    const cookie = `mm_api=${createSession(db, id, 'test')}`;
    return { id, call: async (path, { method = 'GET', body } = {}) => {
      const res = await fetch(base + path, { method, headers: { cookie, ...(method !== 'GET' ? { origin: base, 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
      const text = await res.text();
      let data = null; try { data = JSON.parse(text); } catch { data = text; }
      return { status: res.status, data };
    } };
  };
  const withKey = (key, body = { kind: 'bin' }) => fetch(`${base}/api/engine/v1/parts`, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let rx;
  try {
    const boss = await user('ag_boss', 'owner'), dev = await user('ag_dev');
    const sk = (await boss.call('/api/engine/v1/keys', { method: 'POST', body: { name: 'Staff' } })).data;
    assert.equal((await withKey(sk.key)).status, 200);

    // Lock a key to an address that isn't ours: refused, even with the right key.
    assert.equal((await boss.call(`/api/engine/v1/keys/${sk.id}`, { method: 'PATCH', body: { allowIps: 'not an ip' } })).status, 400);
    const locked = await boss.call(`/api/engine/v1/keys/${sk.id}`, { method: 'PATCH', body: { allowIps: '203.0.113.5' } });
    assert.equal(locked.data.allowIps, '203.0.113.5');
    assert.equal(locked.data.name, 'Staff', 'a lock leaves the name alone');
    const refused = await withKey(sk.key);
    assert.equal(refused.status, 403);
    assert.match((await refused.json()).error, /allowed addresses/);
    await boss.call(`/api/engine/v1/keys/${sk.id}`, { method: 'PATCH', body: { allowIps: '127.0.0.0/8' } });
    assert.equal((await withKey(sk.key)).status, 200);
    // Staff can lock (and unlock) any key from the API admin.
    assert.equal((await boss.call(`/api/admin/api/keys/engine/${sk.id}/allow`, { method: 'POST', body: { allowIps: '' } })).data.allowIps, '');

    // Blocking an address stops both APIs for it.
    assert.equal((await dev.call('/api/admin/api/blocks', { method: 'POST', body: { ip: '127.0.0.1' } })).status, 403);
    assert.equal((await boss.call('/api/admin/api/blocks', { method: 'POST', body: { ip: '127.0.0.1', reason: 'test', hours: 1 } })).status, 201);
    const blocked = await withKey(sk.key);
    assert.equal(blocked.status, 403);
    assert.match((await blocked.json()).error, /blocked/);
    assert.equal((await boss.call('/api/admin/api/blocks')).data.blocks[0].reason, 'test');
    assert.equal((await boss.call('/api/admin/api/blocks/127.0.0.1', { method: 'DELETE' })).status, 200);
    assert.equal((await withKey(sk.key)).status, 200);

    // Webhooks from the console: made (secret once), told about new and revoked keys.
    const got = [];
    rx = createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { got.push({ event: req.headers['mint-event'], body: JSON.parse(b) }); res.writeHead(200); res.end(); }); });
    await new Promise((r) => rx.listen(0, '127.0.0.1', r));
    const hook = await dev.call('/api/developer/webhooks', { method: 'POST', body: { url: `http://127.0.0.1:${rx.address().port}/h`, events: ['key.created', 'key.revoked'] } });
    assert.equal(hook.status, 201);
    assert.match(hook.data.secret, /^whsec_/);
    assert.equal((await dev.call('/api/developer/webhooks')).data.webhooks[0].secret, undefined, 'the secret is shown once');
    const dk = (await dev.call('/api/engine/v1/keys', { method: 'POST', body: { name: 'Bot' } })).data;
    assert.equal((await boss.call(`/api/admin/api/keys/engine/${dk.id}/revoke`, { method: 'POST', body: { reason: 'leaked' } })).status, 200);
    for (let i = 0; i < 40 && got.length < 2; i++) await new Promise((r) => setTimeout(r, 25));
    assert.deepEqual(got.map((g) => g.event), ['key.created', 'key.revoked']);
    assert.equal(got[1].body.data.reason, 'leaked');
    assert.equal((await dev.call(`/api/developer/webhooks/${hook.data.id}/deliveries`)).data.deliveries.length, 2);
    assert.equal((await dev.call(`/api/developer/webhooks/${hook.data.id}/test`, { method: 'POST' })).status, 202);

    // Staff open a developer's console as they see it: read only, and audited.
    assert.equal((await dev.call(`/api/developer/console?as=${boss.id}`)).status, 403);
    const as = await boss.call(`/api/developer/console?as=${dev.id}`);
    assert.equal(as.status, 200);
    assert.equal(as.data.me.handle, 'ag_dev');
    assert.equal(as.data.viewingAs, true);
    assert.equal(as.data.webhooks.length, 1);
    assert.equal((await boss.call(`/api/developer/webhooks?as=${dev.id}`, { method: 'POST', body: {} })).status, 403);
    assert.ok(db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action = 'api.viewas'").get().n >= 1);
    assert.ok((await boss.call('/api/admin/api/developers?q=ag_dev')).data.developers.some((d) => d.id === dev.id));
    assert.ok((await boss.call('/api/admin/api/webhooks')).data.webhooks.length >= 1);
    assert.ok((await boss.call('/api/admin/api/latency')).data.rows.some((r) => r.path === '/api/engine/v1/parts'));

    // Alerts the guard raised, listed and acknowledged in the API admin.
    for (let i = 0; i < 21; i++) await withKey(`vx_guess${i}`);
    await new Promise((r) => setTimeout(r, 50));
    assert.ok((await boss.call('/api/admin/api/scan', { method: 'POST' })).data.raised >= 1);
    const al = (await boss.call('/api/admin/api/alerts?open=1')).data.alerts;
    assert.ok(al.some((a) => a.kind === 'guessing'));
    assert.ok(toVertex.some((a) => a.kind === 'api' && a.link === 'http://localhost/admin#alerts'), 'reaches staff on VERTEX too, linking back here');
    assert.equal((await boss.call(`/api/admin/api/alerts/${al[0].id}/ack`, { method: 'POST' })).status, 200);

    // Deleting an account wipes it from the call log; the counts stay.
    const before_ = db.prepare('SELECT COUNT(*) AS n FROM api_requests').get().n;
    db.prepare('DELETE FROM users WHERE id = ?').run(boss.id);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM api_requests WHERE user_id = ?').get(boss.id).n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM api_requests').get().n, before_);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM api_requests WHERE key_id = ? AND key_type = 'engine' AND ip IS NOT NULL").get(sk.id).n, 0);
  } finally { rx?.closeAllConnections?.(); rx?.close(); server.closeAllConnections?.(); server.close(); }
});
