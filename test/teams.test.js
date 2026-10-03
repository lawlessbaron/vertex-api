// Teams: shared keys on the owner's plan, invites by handle, roles that decide who manages keys.
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
  dir = mkdtempSync(join(tmpdir(), 'mm-team-'));
  ({ server, db } = createApp(loadConfig({ DATABASE_PATH: join(dir, 'app.db'), PUBLIC_URL: 'http://localhost' })));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); rmSync(dir, { recursive: true, force: true }); });

function user(handle, role = 'user') {
  const id = Number(db.prepare('INSERT INTO users (email, name, handle, role, created_at, synced_at) VALUES (?, ?, ?, ?, ?, ?)').run(`${handle}@t.io`, handle, handle, role, Date.now(), Date.now()).lastInsertRowid);
  const cookie = `mm_api=${createSession(db, id, 'test')}`;
  const call = async (path, method = 'GET', body) => {
    const res = await fetch(base + path, { method, headers: { cookie, ...(method !== 'GET' ? { origin: base, 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  call.id = id;
  return call;
}

test('a team shares keys: owner and admins manage them, members see them, the owner’s plan pays', async () => {
  assert.equal((await fetch(`${base}/api/teams`)).status, 401);
  const own = user('tm_own'), adm = user('tm_adm'), mem = user('tm_mem'), out = user('tm_out');
  const t = await own('/api/teams', 'POST', { name: 'Print farm' });
  assert.equal(t.status, 201);
  const id = t.data.id;
  assert.equal(t.data.role, 'owner');

  // Invites by handle or email; only the owner invites admins.
  assert.equal((await own(`/api/teams/${id}/invites`, 'POST', { handle: 'nobody_here' })).status, 404);
  assert.equal((await own(`/api/teams/${id}/invites`, 'POST', { handle: '@tm_adm', role: 'admin' })).status, 201);
  assert.equal((await own(`/api/teams/${id}/invites`, 'POST', { handle: 'tm_mem@t.io' })).status, 201);
  assert.equal((await out(`/api/teams/${id}`)).status, 404, 'outsiders can’t see it');
  const mine = (await adm('/api/teams')).data;
  assert.equal(mine.teams.length, 0);
  assert.equal(mine.invites[0].team, 'Print farm');
  assert.equal((await out(`/api/teams/invites/${mine.invites[0].id}/accept`, 'POST')).status, 404, 'not your invite');
  await adm(`/api/teams/invites/${mine.invites[0].id}/accept`, 'POST');
  const inv = (await mem('/api/teams')).data.invites[0];
  assert.equal((await mem(`/api/teams/invites/${inv.id}/accept`, 'POST')).data.teams[0].role, 'member');
  assert.deepEqual((await own(`/api/teams/${id}`)).data.members.map((m) => [m.handle, m.role]), [['tm_own', 'owner'], ['tm_adm', 'admin'], ['tm_mem', 'member']]);
  assert.equal((await adm(`/api/teams/${id}/invites`, 'POST', { handle: 'tm_out', role: 'admin' })).status, 403, 'admins invite members only');

  // Team keys: admins make them, they belong to the owner (plan, bill, key count).
  assert.equal((await mem('/api/engine/v1/keys', 'POST', { name: 'nope', team: id })).status, 403);
  assert.equal((await out('/api/engine/v1/keys', 'POST', { name: 'nope', team: id })).status, 404);
  const k = await adm('/api/engine/v1/keys', 'POST', { name: 'Farm queue', team: id });
  assert.equal(k.status, 201);
  assert.equal(k.data.team.name, 'Print farm');
  assert.equal(db.prepare('SELECT user_id FROM engine_keys WHERE id = ?').get(k.data.id).user_id, own.id);
  const seen = (await mem('/api/engine/v1/keys')).data.keys;
  assert.deepEqual(seen.map((x) => [x.name, x.team?.name, x.canManage]), [['Farm queue', 'Print farm', false]]);
  assert.equal((await mem(`/api/engine/v1/keys/${k.data.id}`, 'PATCH', { name: 'mine' })).status, 404, 'members can’t change it');
  assert.equal((await mem(`/api/engine/v1/keys/${k.data.id}`, 'DELETE')).status, 404);
  assert.equal((await adm(`/api/engine/v1/keys/${k.data.id}`, 'PATCH', { name: 'Farm jobs' })).data.name, 'Farm jobs');
  assert.equal((await out(`/api/engine/v1/keys/${k.data.id}`, 'PATCH', { name: 'x' })).status, 404);
  // The console lists it for every member.
  assert.equal((await mem('/api/developer/console')).data.keys[0].name, 'Farm jobs');
  assert.equal((await mem('/api/developer/console')).data.teams.teams[0].name, 'Print farm');

  // Roles: only the owner changes them; members can leave; admins can't remove admins.
  assert.equal((await adm(`/api/teams/${id}/members/${mem.id}`, 'PATCH', { role: 'admin' })).status, 403);
  assert.equal((await own(`/api/teams/${id}/members/${adm.id}`, 'PATCH', { role: 'member' })).status, 200);
  assert.equal((await adm(`/api/engine/v1/keys/${k.data.id}`, 'DELETE')).status, 404, 'no longer an admin');
  assert.equal((await own(`/api/teams/${id}/members/${own.id}`, 'DELETE')).status, 400, 'the owner can’t leave');
  assert.equal((await mem(`/api/teams/${id}/members/${mem.id}`, 'DELETE')).data.teams.length, 0);
  assert.equal((await mem('/api/engine/v1/keys')).data.keys.length, 0, 'gone with the team');

  // Closing the team revokes its keys.
  assert.equal((await adm(`/api/teams/${id}`, 'DELETE')).status, 403);
  assert.equal((await own(`/api/teams/${id}`, 'DELETE')).status, 200);
  assert.ok(db.prepare('SELECT revoked_at FROM engine_keys WHERE id = ?').get(k.data.id).revoked_at);
  assert.equal((await adm('/api/teams')).data.teams.length, 0);
});
