// The API status page: self-checks, day states, incidents with updates (sent
// to developers' webhooks), the public JSON and RSS, and the page on the API site.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { openDatabase } from '../server/db.js';
import { createApiStatus, dayState } from '../server/api-status.js';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { createSession } from '../server/auth.js';

const DAY = 86400e3;

test('day states from the share that worked', () => {
  assert.equal(dayState(0, 0), 'nodata');
  assert.equal(dayState(1000, 1000), 'operational');
  assert.equal(dayState(996, 1000), 'operational');
  assert.equal(dayState(970, 1000), 'degraded');
  assert.equal(dayState(800, 1000), 'partial');
  assert.equal(dayState(100, 1000), 'outage');
});

test('self-checks, real calls and incidents make the 90 days', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mm-status-'));
  const db = openDatabase(join(dir, 'a.db'));
  let T = Date.UTC(2026, 9, 1, 12);
  let off = false;
  const sent = [];
  const s = createApiStatus({ db, controls: { isOff: () => off }, traceOn: () => false, onIncident: (i, u) => sent.push([i.status, u.body]), now: () => T });
  s.probe();
  let sum = s.summary();
  assert.equal(sum.overall, 'operational');
  const eng = sum.components.find((c) => c.key === 'engine');
  assert.equal(eng.state, 'operational');
  assert.equal(eng.days.length, 90);
  assert.equal(eng.days.at(-1).state, 'operational');
  assert.equal(sum.components.find((c) => c.key === 'tracer').state, 'off', 'the tracer is off until it opens');
  // Server errors callers got yesterday darken yesterday.
  const ins = db.prepare("INSERT INTO api_requests (request_id, at, api, method, path, status, ms, bytes) VALUES (?, ?, 'engine', 'POST', '/api/engine/v1/generate', ?, 10, 0)");
  for (let i = 0; i < 40; i++) ins.run(`r${i}`, T - DAY, i < 30 ? 500 : 200);
  for (let i = 0; i < 40; i++) ins.run(`q${i}`, T - 2 * DAY, 400); // the caller's mistakes don't count
  const days = s.days('engine');
  assert.equal(days.at(-2).state, 'outage');
  assert.equal(days.at(-3).state, 'operational');
  // Failing self-checks: degraded, then down.
  s.record('webhooks', false, null, 'stuck');
  assert.equal(s.component('webhooks').state, 'degraded');
  s.record('webhooks', false); s.record('webhooks', false);
  assert.equal(s.component('webhooks').state, 'outage');
  // An incident: opened, updated, resolved; each step goes out.
  assert.throws(() => s.openIncident(null, { title: 'x', components: [], body: 'y' }), /what it affects/);
  const inc = s.openIncident(null, { title: 'Slow files', impact: 'major', components: ['engine', 'nope'], body: 'Files take 30 s.' });
  assert.deepEqual(inc.components, ['engine']);
  sum = s.summary();
  assert.equal(sum.active.length, 1);
  assert.equal(sum.components.find((c) => c.key === 'engine').state, 'partial');
  assert.equal(sum.overall, 'outage', 'webhooks are still down');
  T += 3600e3;
  s.updateIncident(null, inc.id, { status: 'identified', body: 'A slow disk.' });
  T += 3600e3;
  const done = s.updateIncident(null, inc.id, { status: 'resolved', body: 'Fixed.' });
  assert.ok(done.resolvedAt);
  assert.equal(done.updates.length, 3);
  assert.throws(() => s.updateIncident(null, inc.id, { body: 'again' }), /resolved/);
  assert.deepEqual(sent.map((x) => x[0]), ['investigating', 'identified', 'resolved']);
  sum = s.summary();
  assert.equal(sum.active.length, 0);
  assert.equal(sum.history.length, 1);
  assert.equal(sum.components.find((c) => c.key === 'engine').days.at(-1).state, 'partial', 'today carries the incident');
  assert.match(s.rss('https://api.example'), /<item><title>Slow files: resolved<\/title>/);
  // Switched off: the engine is "not open yet", and doesn't count against the whole.
  off = true;
  assert.equal(s.component('engine').state, 'off');
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

test('the status page on the API site, incidents from the admin, and the webhook', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mm-status-app-'));
  const config = loadConfig({ DATABASE_PATH: join(dir, 'app.db'), PUBLIC_URL: 'http://localhost' });
  config.webhooksAllowPrivate = true;
  const { server, db } = createApp(config);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const got = [];
  const rx = createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { got.push({ event: req.headers['mint-event'], body: JSON.parse(b) }); res.writeHead(200); res.end(); }); });
  await new Promise((r) => rx.listen(0, '127.0.0.1', r));
  try {
    const mk = async (handle, role) => {
      const id = Number(db.prepare('INSERT INTO users (email, name, handle, role, created_at, synced_at) VALUES (?, ?, ?, ?, ?, ?)').run(`${handle}@t.io`, handle, handle, role, Date.now(), Date.now()).lastInsertRowid);
      const cookie = `mm_api=${createSession(db, id, 'test')}`;
      return async (path, { method = 'GET', body } = {}) => {
        const res = await fetch(base + path, { method, headers: { cookie, ...(method !== 'GET' ? { origin: base, 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
        return { status: res.status, data: await res.json().catch(() => null) };
      };
    };
    const boss = await mk('st_boss', 'owner'), dev = await mk('st_dev', 'user');
    assert.equal((await dev('/api/developer/webhooks', { method: 'POST', body: { url: `http://127.0.0.1:${rx.address().port}/h`, events: ['incident.updated'] } })).status, 201);
    // Anyone can read the status.
    const pub = await (await fetch(`${base}/api/status`)).json();
    assert.deepEqual(pub.components.map((c) => c.key), ['engine', 'tracer', 'webhooks', 'console']);
    // Only admins post incidents.
    const body = { title: 'Webhooks delayed', impact: 'minor', components: ['webhooks'], body: 'Deliveries are a few minutes late.' };
    assert.equal((await dev('/api/admin/api/incidents', { method: 'POST', body })).status, 403);
    const inc = await boss('/api/admin/api/incidents', { method: 'POST', body });
    assert.equal(inc.status, 201);
    assert.equal((await boss(`/api/admin/api/incidents/${inc.data.id}/updates`, { method: 'POST', body: { status: 'resolved', body: 'All caught up.' } })).status, 200);
    for (let i = 0; i < 40 && got.length < 2; i++) await new Promise((r) => setTimeout(r, 25));
    assert.deepEqual(got.map((g) => [g.event, g.body.data.update.status]), [['incident.updated', 'investigating'], ['incident.updated', 'resolved']]);
    assert.ok(db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action LIKE 'api.incident.%'").get().n >= 2);
    const rss = await (await fetch(`${base}/api/status.rss`)).text();
    assert.match(rss, /Webhooks delayed: resolved/);
    // The page, on the main address and on api.<domain>.
    const page = await fetch(`${base}/status`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /How this page works/);
  } finally { rx.closeAllConnections?.(); rx.close(); server.closeAllConnections?.(); server.close(); rmSync(dir, { recursive: true, force: true }); }
});
