// Teams: a few people sharing API keys. A team's keys run on its owner's plan
// (the owner's limits and bill); owners and admins make, lock and revoke them,
// members see and use them. People join by accepting an invite by handle or email.
import { HttpError, readJson } from './security.js';

export const TEAM_ROLES = ['owner', 'admin', 'member'];
export const TEAM_LIMITS = { owned: 3, members: 10 };

export function createTeams({ db }) {
  const str = (v, n) => String(v ?? '').trim().slice(0, n);
  const roleIn = (teamId, userId) => db.prepare('SELECT role FROM team_members WHERE team_id = ? AND user_id = ?').get(teamId, userId)?.role || null;
  const canManage = (teamId, userId) => ['owner', 'admin'].includes(roleIn(teamId, userId));
  const teamIdsOf = (userId) => db.prepare('SELECT team_id FROM team_members WHERE user_id = ?').all(userId).map((r) => r.team_id);
  const team = (id) => db.prepare('SELECT * FROM teams WHERE id = ?').get(id);

  function teamOut(t, me) {
    const role = roleIn(t.id, me);
    const manage = role === 'owner' || role === 'admin';
    return {
      id: t.id, name: t.name, role, createdAt: t.created_at,
      members: db.prepare('SELECT u.id, u.handle, m.role, m.created_at FROM team_members m JOIN users u ON u.id = m.user_id WHERE m.team_id = ? ORDER BY m.role = \'owner\' DESC, m.role = \'admin\' DESC, u.handle').all(t.id).map((m) => ({ id: m.id, handle: m.handle, role: m.role, joinedAt: m.created_at })),
      invites: manage ? db.prepare('SELECT i.id, u.handle, i.role, i.created_at FROM team_invites i JOIN users u ON u.id = i.user_id WHERE i.team_id = ? ORDER BY i.id').all(t.id).map((i) => ({ id: i.id, handle: i.handle, role: i.role, sentAt: i.created_at })) : [],
    };
  }
  const list = (me) => ({
    teams: db.prepare('SELECT t.* FROM teams t JOIN team_members m ON m.team_id = t.id WHERE m.user_id = ? ORDER BY t.id').all(me).map((t) => teamOut(t, me)),
    invites: db.prepare('SELECT i.id, i.role, i.created_at, t.name, u.handle AS by FROM team_invites i JOIN teams t ON t.id = i.team_id LEFT JOIN users u ON u.id = i.invited_by WHERE i.user_id = ? ORDER BY i.id').all(me).map((i) => ({ id: i.id, team: i.name, role: i.role, by: i.by, sentAt: i.created_at })),
    limits: TEAM_LIMITS,
  });

  function need(teamId, me, manage = true) {
    const t = team(teamId);
    if (!t || !roleIn(t.id, me)) throw new HttpError(404, 'No team with that id.');
    if (manage && !canManage(t.id, me)) throw new HttpError(403, 'Only the team’s owner and admins can do that.');
    return t;
  }
  const memberCount = (teamId) => db.prepare('SELECT (SELECT COUNT(*) FROM team_members WHERE team_id = ?) + (SELECT COUNT(*) FROM team_invites WHERE team_id = ?) AS n').get(teamId, teamId).n;
  // A team's keys stop working when it ends.
  const revokeKeys = (teamId) => db.prepare('UPDATE engine_keys SET revoked_at = ? WHERE team_id = ? AND revoked_at IS NULL').run(Date.now(), teamId);

  async function handle(req, res, path, m, ctx, json, requireUser) {
    if (!path.startsWith('/api/teams')) return false;
    const me = requireUser(ctx, 'Sign in to see your teams.').id;
    if (path === '/api/teams' && m === 'GET') return json(res, 200, list(me)), true;
    if (path === '/api/teams' && m === 'POST') {
      const name = str((await readJson(req, 4 * 1024)).name, 60);
      if (!name) throw new HttpError(400, 'Give the team a name.');
      if (db.prepare('SELECT COUNT(*) AS n FROM teams WHERE owner_id = ?').get(me).n >= TEAM_LIMITS.owned) throw new HttpError(400, `You can own ${TEAM_LIMITS.owned} teams.`);
      const now = Date.now();
      const id = Number(db.prepare('INSERT INTO teams (name, owner_id, created_at) VALUES (?, ?, ?)').run(name, me, now).lastInsertRowid);
      db.prepare('INSERT INTO team_members (team_id, user_id, role, created_at) VALUES (?, ?, \'owner\', ?)').run(id, me, now);
      return json(res, 201, teamOut(team(id), me)), true;
    }
    // Invites sent to you.
    const im = path.match(/^\/api\/teams\/invites\/(\d+)\/(accept|decline)$/);
    if (im && m === 'POST') {
      const inv = db.prepare('SELECT * FROM team_invites WHERE id = ? AND user_id = ?').get(Number(im[1]), me);
      if (!inv) throw new HttpError(404, 'No invite with that id.');
      db.prepare('DELETE FROM team_invites WHERE id = ?').run(inv.id);
      if (im[2] === 'accept') db.prepare('INSERT OR IGNORE INTO team_members (team_id, user_id, role, created_at) VALUES (?, ?, ?, ?)').run(inv.team_id, me, inv.role, Date.now());
      return json(res, 200, list(me)), true;
    }
    const tm = path.match(/^\/api\/teams\/(\d+)(?:\/(invites|members)(?:\/(\d+))?)?$/);
    if (!tm) throw new HttpError(404, 'Not found.');
    const teamId = Number(tm[1]), sub = tm[2], subId = tm[3] ? Number(tm[3]) : null;
    if (!sub && m === 'GET') return json(res, 200, teamOut(need(teamId, me, false), me)), true;
    if (!sub && m === 'PATCH') {
      need(teamId, me);
      const name = str((await readJson(req, 4 * 1024)).name, 60);
      if (!name) throw new HttpError(400, 'Give the team a name.');
      db.prepare('UPDATE teams SET name = ? WHERE id = ?').run(name, teamId);
      return json(res, 200, teamOut(team(teamId), me)), true;
    }
    if (!sub && m === 'DELETE') {
      const t = need(teamId, me, false);
      if (t.owner_id !== me) throw new HttpError(403, 'Only the owner can close the team.');
      revokeKeys(teamId);
      db.prepare('DELETE FROM teams WHERE id = ?').run(teamId);
      return json(res, 200, { ok: true }), true;
    }
    if (sub === 'invites' && !subId && m === 'POST') {
      need(teamId, me);
      const body = await readJson(req, 4 * 1024);
      const who = str(body.handle, 120).replace(/^@/, '');
      const role = body.role === 'admin' ? 'admin' : 'member';
      // Only the owner makes admins.
      if (role === 'admin' && roleIn(teamId, me) !== 'owner') throw new HttpError(403, 'Only the owner can invite admins.');
      const u = who && db.prepare('SELECT id, handle FROM users WHERE (lower(handle) = lower(?) OR lower(email) = lower(?)) AND role != \'banned\'').get(who, who);
      if (!u) throw new HttpError(404, 'No account with that handle or email. They need to sign in here once first.');
      if (roleIn(teamId, u.id)) throw new HttpError(400, `@${u.handle} is already in the team.`);
      if (memberCount(teamId) >= TEAM_LIMITS.members) throw new HttpError(400, `A team has room for ${TEAM_LIMITS.members} people, invites included.`);
      db.prepare('INSERT OR REPLACE INTO team_invites (team_id, user_id, role, invited_by, created_at) VALUES (?, ?, ?, ?, ?)').run(teamId, u.id, role, me, Date.now());
      return json(res, 201, teamOut(team(teamId), me)), true;
    }
    if (sub === 'invites' && subId && m === 'DELETE') {
      need(teamId, me);
      if (!db.prepare('DELETE FROM team_invites WHERE id = ? AND team_id = ?').run(subId, teamId).changes) throw new HttpError(404, 'No invite with that id.');
      return json(res, 200, teamOut(team(teamId), me)), true;
    }
    if (sub === 'members' && subId && m === 'PATCH') {
      const t = need(teamId, me, false);
      if (t.owner_id !== me) throw new HttpError(403, 'Only the owner changes roles.');
      const role = (await readJson(req, 4 * 1024)).role;
      if (!['admin', 'member'].includes(role)) throw new HttpError(400, 'role is admin or member.');
      if (subId === me) throw new HttpError(400, 'The owner stays the owner.');
      if (!db.prepare('UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?').run(role, teamId, subId).changes) throw new HttpError(404, 'They aren’t in the team.');
      return json(res, 200, teamOut(t, me)), true;
    }
    if (sub === 'members' && subId && m === 'DELETE') {
      // Leave yourself, or (owner and admins) take someone out. Admins can't remove admins.
      const t = need(teamId, me, subId !== me);
      const theirs = roleIn(teamId, subId);
      if (!theirs) throw new HttpError(404, 'They aren’t in the team.');
      if (theirs === 'owner') throw new HttpError(400, subId === me ? 'The owner can’t leave. Close the team instead.' : 'The owner can’t be removed.');
      if (subId !== me && theirs === 'admin' && t.owner_id !== me) throw new HttpError(403, 'Only the owner removes admins.');
      db.prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?').run(teamId, subId);
      return json(res, 200, subId === me ? list(me) : teamOut(t, me)), true;
    }
    throw new HttpError(404, 'Not found.');
  }

  return { handle, list, roleIn, canManage, teamIdsOf, team };
}
