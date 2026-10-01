// Sessions on the API site. Nobody signs in with a password here: VERTEX
// checks who you are (password, Google, two-factor…) and hands back a one-time
// code; link.js swaps it for your account details and a session starts here.
// The cookie belongs to the API site's address only.
import { createHash, randomBytes } from 'node:crypto';

export const SESSION_COOKIE = 'mm_api';
export const SESSION_DAYS = 14;

export const hashToken = (token) => createHash('sha256').update(token).digest('hex');
export const sessionId = (tokenHash) => tokenHash.slice(0, 16);

export function createSession(db, userId, userAgent = '', { ip = null, mfa = false } = {}) {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent, ip, last_seen_at, mfa) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(hashToken(token), userId, now, now + SESSION_DAYS * 864e5, String(userAgent).slice(0, 200), ip, now, mfa ? 1 : 0);
  return token;
}

// The signed-in person for a session token, or null.
export function sessionUser(db, token, ip = null) {
  if (!token || token.length > 100) return null;
  const hash = hashToken(token);
  const row = db.prepare(
    `SELECT u.id, u.email, u.name, u.handle, u.role, u.created_at, u.synced_at, s.expires_at, s.mfa, s.last_seen_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
  ).get(hash);
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash);
    return null;
  }
  if (!row.last_seen_at || Date.now() - row.last_seen_at > 5 * 60_000) {
    db.prepare('UPDATE sessions SET last_seen_at = ?, ip = COALESCE(?, ip) WHERE token_hash = ?').run(Date.now(), ip, hash);
  }
  row.sessionId = sessionId(hash);
  row.mfa = Boolean(row.mfa);
  delete row.last_seen_at;
  return row;
}

export function destroySession(db, token) {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

export function sessionCookie(token, { secure }) {
  return [`${SESSION_COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${SESSION_DAYS * 86400}`, ...(secure ? ['Secure'] : [])].join('; ');
}

export function clearCookie({ secure }) {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* a cookie we didn't set */ }
    }
  }
  return out;
}
