// Guarding the engine and tracer APIs. Every ten minutes it reads the call log
// (api-log.js) for traffic that needs a person, and raises an alert that
// reaches the team anywhere on VERTEX (the bell, email and the Discord alert
// channel), each kept in Admin on the API site:
//   spike    a key doing five times its usual hourly calls (or a new key bursting)
//   errors   a key whose calls are mostly failing
//   quiet    a busy key that has stopped (a broken integration, or a lost customer)
//   guessing one address trying keys that don't exist
//   cycling  an account making lots of keys, or one address using many keys
//   scraping a key making hundreds of different models an hour (building a catalogue)
// An alert on the same thing isn't raised again for six hours. Staff can block
// an address from the APIs (for a while or for good), and developers can lock
// a key to their own server's addresses.
import { isIP } from 'node:net';
import { HttpError } from './security.js';

const H = 3600e3;
const QUIET_FOR = 6 * H;
const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0);
const bare = (ip) => String(ip || '').replace(/^::ffff:/, '').trim();

// ---------- allowlists: addresses, or IPv4 ranges like 203.0.113.0/24 ----------
const v4 = (ip) => ip.split('.').reduce((n, x) => (n << 8) + Number(x), 0) >>> 0;
export function parseAllow(text) {
  const items = String(text || '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  if (items.length > 20) throw new HttpError(400, 'At most 20 addresses or ranges per key.');
  for (const it of items) {
    const [ip, bits] = it.split('/');
    if (!isIP(ip)) throw new HttpError(400, `${it} isn't an IP address.`);
    if (bits !== undefined && (isIP(ip) !== 4 || !/^\d+$/.test(bits) || Number(bits) > 32 || Number(bits) < 8)) throw new HttpError(400, `${it}: ranges are IPv4, /8 to /32.`);
  }
  return items.length ? items.join(', ') : null;
}
export function ipAllowed(ip, allow) {
  if (!allow) return true;
  const me = bare(ip);
  return String(allow).split(/[\s,]+/).filter(Boolean).some((it) => {
    const [base, bits] = it.split('/');
    if (bits === undefined) return bare(base) === me;
    if (isIP(me) !== 4) return false;
    const mask = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0;
    return (v4(me) & mask) === (v4(base) & mask);
  });
}

export function createApiGuard({ db, alerts, onEvent = () => {}, now = () => Date.now(), link = '/admin', perDayFor = () => 1000 }) {
  // ---------- alerts ----------
  function raise(kind, subject, { title, detail = {}, severity = 'warn', keyType = null, keyId = null, userId = null, ip = null }, t = now()) {
    const recent = db.prepare('SELECT id FROM api_alerts WHERE kind = ? AND subject = ? AND at > ?').get(kind, subject, t - QUIET_FOR);
    if (recent) return null;
    const id = Number(db.prepare('INSERT INTO api_alerts (at, kind, subject, severity, key_type, key_id, user_id, ip, title, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(t, kind, subject, severity, keyType, keyId, userId, ip, title, JSON.stringify(detail)).lastInsertRowid);
    alerts?.send('api', { title, body: Object.entries(detail).map(([k, v]) => `${k}: ${v}`).join('\n'), link: `${link}#alerts`, key: `api:${kind}:${subject}` });
    return id;
  }
  const keyName = (type, id) => (type === 'engine' ? db.prepare('SELECT k.name, u.handle FROM engine_keys k LEFT JOIN users u ON u.id = k.user_id WHERE k.id = ?').get(id) : db.prepare('SELECT name FROM trace_keys WHERE id = ?').get(id)) || {};
  const label = (type, id) => { const k = keyName(type, id); return `${type} key “${k.name || id}”${k.handle ? ` (@${k.handle})` : ''}`; };

  // Read the log and raise what needs a person. t: the time to judge from (tests pass their own).
  function scan(t = now()) {
    const raised = [];
    const add = (id) => id && raised.push(id);
    // spike: this hour vs. the hourly average of the 7 days before it
    for (const r of db.prepare(`SELECT key_type, key_id, MAX(user_id) AS user_id, COUNT(*) AS n FROM api_requests WHERE key_id IS NOT NULL AND at > ? GROUP BY key_type, key_id HAVING n >= 50`).all(t - H)) {
      const prev = db.prepare('SELECT COUNT(*) AS n FROM api_requests WHERE key_type = ? AND key_id = ? AND at > ? AND at <= ?').get(r.key_type, r.key_id, t - 7 * 24 * H - H, t - H).n;
      const avg = prev / (7 * 24);
      if ((avg > 0 && r.n >= 5 * avg) || (avg === 0 && r.n >= 200)) {
        add(raise('spike', `${r.key_type}:${r.key_id}`, { title: `Traffic spike on ${label(r.key_type, r.key_id)}`, detail: { 'calls this hour': r.n, 'usual per hour': Math.round(avg * 10) / 10 }, keyType: r.key_type, keyId: r.key_id, userId: r.user_id }, t));
      }
    }
    // errors: most of a key's calls failing in the last 15 minutes
    for (const r of db.prepare(`SELECT key_type, key_id, MAX(user_id) AS user_id, COUNT(*) AS n, SUM(status >= 400) AS bad FROM api_requests WHERE key_id IS NOT NULL AND at > ? GROUP BY key_type, key_id HAVING n >= 20 AND bad * 2 >= n`).all(t - H / 4)) {
      const top = db.prepare('SELECT error, COUNT(*) AS c FROM api_requests WHERE key_type = ? AND key_id = ? AND at > ? AND status >= 400 GROUP BY error ORDER BY c DESC LIMIT 1').get(r.key_type, r.key_id, t - H / 4);
      add(raise('errors', `${r.key_type}:${r.key_id}`, { title: `Calls failing on ${label(r.key_type, r.key_id)}`, detail: { 'calls (15 min)': r.n, failing: r.bad, 'most common error': top?.error || '—' }, keyType: r.key_type, keyId: r.key_id, userId: r.user_id }, t));
    }
    // quiet: a key that averaged 20+ calls a day over the week before has made none in 24 hours
    for (const r of db.prepare(`SELECT key_type, key_id, MAX(user_id) AS user_id, COUNT(*) AS n FROM api_requests WHERE key_id IS NOT NULL AND at > ? AND at <= ? AND status < 400 GROUP BY key_type, key_id HAVING n >= 140`).all(t - 8 * 24 * H, t - 24 * H)) {
      const live = r.key_type === 'engine' ? db.prepare('SELECT revoked_at FROM engine_keys WHERE id = ?').get(r.key_id) : db.prepare('SELECT revoked_at FROM trace_keys WHERE id = ?').get(r.key_id);
      if (!live || live.revoked_at) continue;
      const last = db.prepare('SELECT COUNT(*) AS n FROM api_requests WHERE key_type = ? AND key_id = ? AND at > ?').get(r.key_type, r.key_id, t - 24 * H).n;
      if (!last) add(raise('quiet', `${r.key_type}:${r.key_id}`, { severity: 'info', title: `${label(r.key_type, r.key_id)} has gone quiet`, detail: { 'calls a day before': Math.round(r.n / 7), 'calls in the last 24 h': 0 }, keyType: r.key_type, keyId: r.key_id, userId: r.user_id }, t));
    }
    // guessing: one address sending keys that don't exist
    for (const r of db.prepare(`SELECT ip, COUNT(*) AS n, COUNT(DISTINCT key_hint) AS hints FROM api_requests WHERE status = 401 AND ip IS NOT NULL AND at > ? GROUP BY ip HAVING n >= 20`).all(t - H / 4)) {
      add(raise('guessing', `ip:${r.ip}`, { severity: 'high', title: `Key guessing from ${r.ip}`, detail: { 'refused calls (15 min)': r.n, 'different keys tried': r.hints }, ip: r.ip }, t));
    }
    // cycling: one address using many real keys in an hour; one account making many keys in a day
    for (const r of db.prepare(`SELECT ip, COUNT(DISTINCT key_type || ':' || key_id) AS k FROM api_requests WHERE key_id IS NOT NULL AND ip IS NOT NULL AND at > ? GROUP BY ip HAVING k >= 5`).all(t - H)) {
      add(raise('cycling', `ip:${r.ip}`, { title: `${r.ip} is using ${r.k} different keys`, detail: { 'keys in the last hour': r.k }, ip: r.ip }, t));
    }
    for (const r of db.prepare(`SELECT k.user_id, u.handle, COUNT(*) AS n FROM engine_keys k JOIN users u ON u.id = k.user_id WHERE k.created_at > ? GROUP BY k.user_id HAVING n >= 5`).all(t - 24 * H)) {
      add(raise('cycling', `user:${r.user_id}`, { title: `@${r.handle} made ${r.n} keys in a day`, detail: { 'keys made (24 h)': r.n }, userId: r.user_id }, t));
    }
    // scraping: hundreds of different models from one key in an hour
    for (const r of db.prepare(`SELECT key_type, key_id, MAX(user_id) AS user_id, COUNT(*) AS n, COUNT(DISTINCT params) AS d FROM api_requests WHERE key_id IS NOT NULL AND path = '/api/engine/v1/generate' AND status < 400 AND at > ? GROUP BY key_type, key_id HAVING n >= 300`).all(t - H)) {
      if (r.d >= 0.95 * r.n) add(raise('scraping', `${r.key_type}:${r.key_id}`, { severity: 'high', title: `${label(r.key_type, r.key_id)} looks like it's building a catalogue`, detail: { 'files this hour': r.n, 'all different': r.d }, keyType: r.key_type, keyId: r.key_id, userId: r.user_id }, t));
    }
    return raised;
  }

  const alertOut = (a) => ({ ...a, detail: (() => { try { return JSON.parse(a.detail || '{}'); } catch { return {}; } })(), acked: Boolean(a.acked_at) });
  const listAlerts = ({ open = false, limit = 100 } = {}) => db.prepare(`SELECT * FROM api_alerts ${open ? 'WHERE acked_at IS NULL' : ''} ORDER BY acked_at IS NOT NULL, id DESC LIMIT ?`).all(Math.min(500, limit)).map(alertOut);
  const ack = (id, by) => db.prepare('UPDATE api_alerts SET acked_at = ?, acked_by = ? WHERE id = ? AND acked_at IS NULL').run(now(), by, id).changes > 0;

  // ---------- blocks ----------
  function blocked(ip) {
    const b = db.prepare('SELECT * FROM api_blocks WHERE ip = ?').get(bare(ip));
    if (b && b.until && b.until < now()) { db.prepare('DELETE FROM api_blocks WHERE ip = ?').run(b.ip); return null; }
    return b || null;
  }
  function block(ip, { reason = '', hours = 0, by = null } = {}) {
    const a = bare(ip);
    if (!isIP(a)) throw new HttpError(400, 'That isn\'t an IP address.');
    db.prepare('INSERT INTO api_blocks (ip, reason, created_at, created_by, until) VALUES (?, ?, ?, ?, ?) ON CONFLICT(ip) DO UPDATE SET reason = excluded.reason, created_at = excluded.created_at, created_by = excluded.created_by, until = excluded.until')
      .run(a, String(reason).slice(0, 300), now(), by, hours > 0 ? now() + hours * H : null);
    return a;
  }
  const unblock = (ip) => db.prepare('DELETE FROM api_blocks WHERE ip = ?').run(bare(ip)).changes > 0;
  const blocks = () => db.prepare('SELECT b.*, u.handle AS by_handle FROM api_blocks b LEFT JOIN users u ON u.id = b.created_by ORDER BY created_at DESC').all();

  // ---------- usage events for webhooks (80% of the day's limit, and the limit) ----------
  const fired = new Map(); // `${account}:${event}` → day (the day's allowance is the account's)
  function afterCall(row) {
    if (row.key_type !== 'engine' || !row.key_id || !row.user_id) return;
    if (!['/api/engine/v1/generate', '/api/engine/v1/parts'].includes(row.path)) return;
    const day = new Date(row.at).toISOString().slice(0, 10);
    const once = (event, data) => {
      const k = `${row.user_id}:${event}`;
      if (fired.get(k) === day) return;
      fired.set(k, day);
      onEvent(row.user_id, event, { key: { id: row.key_id, hint: row.key_hint, name: keyName('engine', row.key_id).name || null }, ...data });
    };
    const limit = perDayFor(row.user_id);
    if (row.status === 429 && /today|a day|tomorrow/i.test(row.error || '')) return once('usage.limit', { limit, window: '24h' });
    if (row.status < 400) {
      const used = db.prepare("SELECT COUNT(*) AS n FROM api_requests WHERE key_type = 'engine' AND user_id = ? AND at > ? AND status NOT IN (401, 429) AND path IN ('/api/engine/v1/generate', '/api/engine/v1/parts')").get(row.user_id, row.at - 24 * H).n;
      if (used >= limit * 0.8) once('usage.80', { used, limit, window: '24h' });
    }
  }

  // ---------- latency: p50, p95 and p99 for each endpoint ----------
  function latency(days = 30, api = '') {
    const rows = db.prepare(`SELECT path, ms FROM api_requests WHERE at > ? ${api ? 'AND api = ?' : ''} ORDER BY path, ms`).all(...[now() - days * 24 * H, ...(api ? [api] : [])]);
    const by = new Map();
    for (const r of rows) { if (!by.has(r.path)) by.set(r.path, []); by.get(r.path).push(r.ms || 0); }
    return [...by].map(([path, ms]) => ({ path, calls: ms.length, p50: pct(ms, 0.5), p95: pct(ms, 0.95), p99: pct(ms, 0.99), max: ms[ms.length - 1] || 0 })).sort((a, b) => b.calls - a.calls);
  }

  return { scan, raise, listAlerts, ack, blocked, block, unblock, blocks, afterCall, latency };
}
