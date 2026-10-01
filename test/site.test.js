// The API site on its own: its pages and old addresses, signing in with
// VERTEX (a one-time code swapped over the link), accounts kept in step with
// VERTEX (bans, deletes), alerts sent to VERTEX, and the one-time import.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { importFromVertex } from '../server/import.js';
import { openDatabase } from '../server/db.js';

// VERTEX, as the link sees it.
function fakeVertex() {
  const users = { 7: { id: 7, email: 'dev@t.io', name: 'Dev', handle: 'dev', role: 'user', createdAt: 1 }, 9: { id: 9, email: 'boss@t.io', name: 'Boss', handle: 'boss', role: 'owner', createdAt: 1 } };
  const codes = new Map([['code-for-dev-1234567890', 7], ['code-for-boss-123456789', 9]]);
  const alerts = [];
  return {
    users, alerts,
    on: () => true,
    authorizeUrl: (state, back) => `https://vertex.test/api-link/authorize?state=${state}&return=${encodeURIComponent(back)}`,
    async exchange(code) {
      const id = codes.get(code);
      codes.delete(code);
      if (!id) throw Object.assign(new Error('bad code'), { status: 400 });
      return { user: users[id], mfa: id === 9, controls: { limits: { maxGrid: 10 } } };
    },
    async user(id) { return users[id] ? { user: users[id] } : { gone: true }; },
    async controls() { return { limits: { maxGrid: 10, maxHeightUnits: 20 }, disabled: [], generators: {}, requireStaffMfa: true }; },
    async alert(a) { alerts.push(a); return { ok: true }; },
    async exportData() {
      return {
        tables: {
          users: [{ id: 7, email: 'dev@t.io', name: 'Dev', handle: 'dev', role: 'user', created_at: 1 }],
          engine_keys: [{ id: 3, user_id: 7, name: 'old key', key_hash: 'abc', key_hint: 'vx_ab…yz', calls: 12, created_at: 5 }],
          api_requests: [{ id: 1, request_id: 'r1', at: 6, api: 'engine', method: 'POST', path: '/api/engine/v1/generate', status: 200, key_type: 'engine', key_id: 3, user_id: 7 }],
          nonsense: [{ x: 1 }],
        },
        settings: { api_plans: '[{"id":"free","name":"Maker","perMinute":30,"perDay":500,"keys":5}]', secret_stuff: 'no' },
      };
    },
  };
}

async function start(link) {
  const dir = mkdtempSync(join(tmpdir(), 'mm-api-site-'));
  const app = createApp({ ...loadConfig({ DATABASE_PATH: join(dir, 'api.db'), PUBLIC_URL: 'http://localhost' }), link });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const stop = () => { app.close(); app.server.closeAllConnections?.(); app.server.close(); rmSync(dir, { recursive: true, force: true }); };
  return { app, base, stop };
}

test('pages, short API paths, old addresses and VERTEX pages', async () => {
  const { base, stop } = await start(fakeVertex());
  const get = (p) => fetch(base + p, { redirect: 'manual' });
  try {
    for (const p of ['/', '/docs', '/console', '/admin', '/signin', '/status']) {
      const r = await get(p);
      assert.equal(r.status, 200, p);
      const html = await r.text();
      assert.doesNotMatch(html, /\{\{|api-portal\//, `${p} has no template marks or old paths`);
    }
    assert.equal((await get('/api-portal/console')).headers.get('location'), '/console');
    assert.equal((await get('/api-portal')).headers.get('location'), '/');
    assert.equal((await get('/developers')).headers.get('location'), '/');
    assert.equal((await get('/signup')).headers.get('location'), 'https://vertex.mintmotive.com.au/signup');
    assert.equal((await get('/nope')).status, 404);
    assert.equal((await get('/js/models.js')).status, 200, 'the engine, from engine/');
    assert.equal((await get('/js/%2e%2e/server/app.js')).status, 404, 'nothing outside public/ or engine/');
    const info = await (await get('/engine/v1')).json();
    assert.equal(info.docs, '/docs');
    assert.equal((await get('/healthz')).status, 200);
  } finally { stop(); }
});

test('sign in with VERTEX: state checked, code swapped once, session here only, staff MFA from VERTEX', async () => {
  const vx = fakeVertex();
  const { app, base, stop } = await start(vx);
  try {
    const go = await fetch(`${base}/auth/vertex?next=/admin`, { redirect: 'manual' });
    assert.equal(go.status, 302);
    const to = new URL(go.headers.get('location'));
    assert.equal(to.host, 'vertex.test');
    const state = to.searchParams.get('state');
    const stateCookie = go.headers.get('set-cookie').split(';')[0];
    assert.match(stateCookie, /^mm_api_state=/);
    // Wrong state: refused.
    const forged = await fetch(`${base}/auth/vertex/callback?code=code-for-dev-1234567890&state=nope`, { redirect: 'manual', headers: { cookie: stateCookie } });
    assert.match(forged.headers.get('location'), /error=expired/);
    // Right state: signed in, sent on.
    const back = await fetch(`${base}/auth/vertex/callback?code=code-for-boss-123456789&state=${state}`, { redirect: 'manual', headers: { cookie: stateCookie } });
    assert.equal(back.headers.get('location'), '/admin');
    const session = back.headers.getSetCookie().find((c) => c.startsWith('mm_api=')).split(';')[0];
    const me = await (await fetch(`${base}/api/me`, { headers: { cookie: session } })).json();
    assert.equal(me.user.handle, 'boss');
    assert.equal(me.user.admin, true);
    assert.equal(app.db.prepare('SELECT role FROM users WHERE id = 9').get().role, 'owner');
    // The code works once.
    const again = await fetch(`${base}/auth/vertex/callback?code=code-for-boss-123456789&state=${state}`, { redirect: 'manual', headers: { cookie: stateCookie } });
    assert.match(again.headers.get('location'), /error=vertex/);
    // Staff two-factor rule comes from VERTEX: boss signed in with a code, so admin opens.
    await app.controls.refresh();
    assert.equal((await fetch(`${base}/api/admin/api/settings`, { headers: { cookie: session } })).status, 200);
    // Sign out.
    await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { cookie: session, origin: base, 'content-type': 'application/json' }, body: '{}' });
    assert.equal((await (await fetch(`${base}/api/me`, { headers: { cookie: session } })).json()).user, null);
  } finally { stop(); }
});

test('accounts follow VERTEX: banned there is out here, deleted there is gone here; alerts go to VERTEX', async () => {
  const vx = fakeVertex();
  const { app, base, stop } = await start(vx);
  try {
    const go = await fetch(`${base}/auth/vertex`, { redirect: 'manual' });
    const state = new URL(go.headers.get('location')).searchParams.get('state');
    const back = await fetch(`${base}/auth/vertex/callback?code=code-for-dev-1234567890&state=${state}`, { redirect: 'manual', headers: { cookie: go.headers.get('set-cookie').split(';')[0] } });
    const session = back.headers.getSetCookie().find((c) => c.startsWith('mm_api=')).split(';')[0];
    const call = (p, o = {}) => fetch(base + p, { ...o, headers: { cookie: session, origin: base, 'content-type': 'application/json', ...(o.headers || {}) } });
    const made = await (await call('/api/engine/v1/keys', { method: 'POST', body: JSON.stringify({ name: 'mine' }) })).json();
    assert.match(made.key, /^vx_/);
    assert.equal((await call('/api/admin/api/settings')).status, 403, 'not staff');
    // Banned on VERTEX: the next look-up signs them out and their keys stop.
    vx.users[7] = { ...vx.users[7], banned: true };
    app.db.prepare('UPDATE users SET synced_at = 0 WHERE id = 7').run();
    await call('/api/me');
    await new Promise((r) => setTimeout(r, 50));
    assert.equal((await (await call('/api/me')).json()).user, null);
    const k = await fetch(`${base}/engine/v1/parts`, { method: 'POST', headers: { authorization: `Bearer ${made.key}`, 'content-type': 'application/json' }, body: '{"kind":"bin"}' });
    assert.equal(k.status, 401, 'a banned account’s key stops');
    // Deleted on VERTEX: gone here, keys with it; their call records stay, anonymous.
    delete vx.users[7];
    await app.syncUser(7);
    assert.equal(app.db.prepare('SELECT 1 FROM users WHERE id = 7').get(), undefined);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM engine_keys WHERE user_id = 7').get().n, 0);
  } finally { stop(); }
});

test('the one-time import from VERTEX: known tables only, safe settings only, once', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mm-api-import-'));
  const db = openDatabase(join(dir, 'a.db'));
  try {
    const vx = fakeVertex();
    const r = await importFromVertex({ db, link: vx });
    assert.equal(r.done, true);
    assert.equal(r.counts.engine_keys, 1);
    assert.equal(r.counts.api_requests, 1);
    assert.equal(r.counts.nonsense, undefined);
    assert.equal(db.prepare('SELECT handle FROM users WHERE id = 7').get().handle, 'dev');
    assert.equal(db.prepare('SELECT synced_at FROM users WHERE id = 7').get().synced_at, 0, 'checked with VERTEX on first use');
    assert.ok(db.prepare("SELECT value FROM settings WHERE key = 'api_plans'").get());
    assert.equal(db.prepare("SELECT value FROM settings WHERE key = 'secret_stuff'").get(), undefined);
    assert.deepEqual(await importFromVertex({ db, link: vx }), { skipped: true });
    const again = await importFromVertex({ db, link: vx, force: true });
    assert.equal(again.counts.engine_keys, 0, 'rows already here stay as they are');
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});
