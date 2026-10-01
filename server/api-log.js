// Every call to the engine and tracer APIs, written down for tracing. Each call
// gets a request id (sent back as X-Request-Id, so a developer can quote it),
// and a row: when, which API and path, the key and its account, the result,
// how long it took, the bytes sent, the file's serial, the error the caller
// saw, and what was asked for (kind, format, settings). Rows are kept two
// years. Developers see their own calls in the console; staff see everything
// in the API site’s admin.
import { randomBytes } from 'node:crypto';
import { hashToken } from './auth.js';

const KEEP = 730 * 86400e3;
const str = (v, n) => (v == null ? null : String(v).slice(0, n));
export const requestId = () => `req_${randomBytes(9).toString('base64url')}`;
// A key's first characters: enough to tell keys apart, useless as a key.
export const keyHint = (key) => (key ? `${String(key).slice(0, 7)}…` : null);
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export function createApiLog({ db, now = () => Date.now(), onRecord = null }) {
  const insert = db.prepare(`INSERT INTO api_requests (request_id, at, api, method, path, status, ms, bytes, key_type, key_id, key_hint, user_id, ip, ua, kind, format, serial, error, params)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  // Which key a request carries, without trusting it (a wrong key is logged as a hint only).
  function keyOf(req) {
    const auth = String(req.headers?.authorization || '');
    const m = auth.match(/^Bearer\s+((vx|tk)_[\w-]+)/);
    if (!m) return { type: null, id: null, hint: null, userId: null };
    const hash = hashToken(m[1]);
    if (m[2] === 'vx') {
      const k = db.prepare('SELECT id, user_id FROM engine_keys WHERE key_hash = ?').get(hash);
      return { type: 'engine', id: k?.id ?? null, hint: keyHint(m[1]), userId: k?.user_id ?? null };
    }
    const k = db.prepare('SELECT id, created_by FROM trace_keys WHERE key_hash = ?').get(hash);
    return { type: 'trace', id: k?.id ?? null, hint: keyHint(m[1]), userId: null };
  }

  // Start recording one call: gives it a request id, watches the response, and
  // writes the row when it's finished. ctx.apiMeta (set by the API) adds what
  // was asked for.
  function track(req, res, ctx, path) {
    const id = requestId(), t0 = now(), key = keyOf(req);
    ctx.requestId = id;
    ctx.apiMeta = {};
    res.setHeader('X-Request-Id', id);
    let status = null, headers = {}, bytes = 0, error = null;
    const writeHead = res.writeHead.bind(res), end = res.end.bind(res);
    res.writeHead = (code, ...rest) => {
      status = code;
      const h = rest.find((x) => x && typeof x === 'object');
      if (h) headers = h;
      return writeHead(code, ...rest);
    };
    res.end = (chunk, ...rest) => {
      if (chunk && typeof chunk !== 'function') {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
        bytes += buf.length;
        // The message the caller saw.
        if ((status || res.statusCode) >= 400 && buf.length < 4096) { try { error = JSON.parse(buf.toString()).error || null; } catch { error = buf.toString().slice(0, 300); } }
      }
      return end(chunk, ...rest);
    };
    res.once('finish', () => {
      const m = ctx.apiMeta || {};
      const serial = headers['X-Vertex-Serial'] || res.getHeader?.('X-Vertex-Serial') || m.serial || null;
      try {
        const row = [id, t0, path.startsWith('/api/trace') ? 'trace' : 'engine', req.method, str(path, 200), status || res.statusCode, now() - t0, bytes,
          key.type, key.id, key.hint, key.userId ?? ctx.user?.id ?? null, str(ctx.ip, 64), str(ctx.ua || req.headers?.['user-agent'], 200),
          str(m.kind, 40), str(m.format, 10), str(serial, 40), str(error, 300), m.params ? str(JSON.stringify(m.params), 4000) : null];
        insert.run(...row);
        onRecord?.({ request_id: id, at: t0, path: row[4], status: row[5], key_type: key.type, key_id: key.id, key_hint: key.hint, user_id: row[11], ip: row[12], error: row[17] });
      } catch (e) { console.warn(`api log: ${e.message}`); }
    });
    return id;
  }

  // ---------- reading it back ----------
  const COLS = 'r.*, u.handle AS user_handle, u.email AS user_email, ek.name AS engine_key_name, tk.name AS trace_key_name';
  const JOIN = 'FROM api_requests r LEFT JOIN users u ON u.id = r.user_id LEFT JOIN engine_keys ek ON r.key_type = \'engine\' AND ek.id = r.key_id LEFT JOIN trace_keys tk ON r.key_type = \'trace\' AND tk.id = r.key_id';
  const out = (r, staff) => ({
    id: r.id, requestId: r.request_id, at: r.at, api: r.api, method: r.method, path: r.path, status: r.status, ms: r.ms, bytes: r.bytes,
    key: r.key_type ? { type: r.key_type, id: r.key_id, hint: r.key_hint, name: r.engine_key_name || r.trace_key_name || null } : null,
    kind: r.kind, format: r.format, serial: r.serial, error: r.error, params: r.params ? JSON.parse(r.params) : null,
    ...(staff ? { user: r.user_id ? { id: r.user_id, handle: r.user_handle, email: r.user_email } : null, ip: r.ip, ua: r.ua } : {}),
  });

  // Filters: api, keyType, keyId, userId, status ('ok' | 'error' | a code), q (request id, serial, path or error), since, before (row id for paging).
  function where(f = {}) {
    const w = [], a = [];
    if (f.api) { w.push('r.api = ?'); a.push(f.api); }
    if (f.keyType) { w.push('r.key_type = ?'); a.push(f.keyType); }
    if (f.keyId) { w.push('r.key_id = ?'); a.push(Number(f.keyId)); }
    if (f.userId) { w.push('r.user_id = ?'); a.push(Number(f.userId)); }
    if (f.ip) { w.push('r.ip = ?'); a.push(String(f.ip)); }
    if (f.status === 'ok') w.push('r.status < 400');
    else if (f.status === 'error') w.push('r.status >= 400');
    else if (/^\d{3}$/.test(String(f.status || ''))) { w.push('r.status = ?'); a.push(Number(f.status)); }
    if (f.q) { w.push('(r.request_id = ? OR r.serial = ? OR r.path LIKE ? OR r.error LIKE ? OR r.key_hint LIKE ?)'); a.push(f.q, f.q, `%${f.q}%`, `%${f.q}%`, `${f.q}%`); }
    if (f.since) { w.push('r.at >= ?'); a.push(Number(f.since)); }
    if (f.before) { w.push('r.id < ?'); a.push(Number(f.before)); }
    return { sql: w.length ? `WHERE ${w.join(' AND ')}` : '', args: a };
  }
  function list(f = {}, { staff = false, limit = 100 } = {}) {
    const { sql, args } = where(f);
    const n = Math.max(1, Math.min(500, Number(limit) || 100));
    const rows = db.prepare(`SELECT ${COLS} ${JOIN} ${sql} ORDER BY r.id DESC LIMIT ?`).all(...args, n).map((r) => out(r, staff));
    return { rows, next: rows.length === n ? rows[rows.length - 1].id : null };
  }
  function one(requestIdOrSerial, f = {}, { staff = false } = {}) {
    const { sql, args } = where(f);
    const r = db.prepare(`SELECT ${COLS} ${JOIN} ${sql ? `${sql} AND` : 'WHERE'} (r.request_id = ? OR r.serial = ?) ORDER BY r.id DESC LIMIT 1`).get(...args, requestIdOrSerial, requestIdOrSerial);
    return r ? out(r, staff) : null;
  }

  // Totals, by day, by kind and format, the slowest, the errors and the busiest keys and accounts.
  function summary(f = {}, days = 30) {
    const since = now() - days * 86400e3;
    const { sql, args } = where({ ...f, since });
    const totals = db.prepare(`SELECT COUNT(*) AS calls, SUM(r.status < 400) AS ok, SUM(r.status >= 400) AS errors, SUM(r.serial IS NOT NULL) AS files, SUM(r.bytes) AS bytes, AVG(r.ms) AS avgMs FROM api_requests r ${sql}`).get(...args);
    const ms = db.prepare(`SELECT r.ms FROM api_requests r ${sql} ORDER BY r.ms`).all(...args).map((x) => x.ms || 0);
    const pct = (p) => (ms.length ? ms[Math.min(ms.length - 1, Math.floor(ms.length * p))] : 0);
    const byDay = db.prepare(`SELECT date(r.at / 1000, 'unixepoch') AS day, COUNT(*) AS calls, SUM(r.status >= 400) AS errors FROM api_requests r ${sql} GROUP BY day ORDER BY day`).all(...args);
    const group = (col) => db.prepare(`SELECT ${col} AS name, COUNT(*) AS n FROM api_requests r ${sql} ${sql ? 'AND' : 'WHERE'} ${col} IS NOT NULL GROUP BY ${col} ORDER BY n DESC LIMIT 12`).all(...args);
    return {
      days, totals: { calls: totals.calls || 0, ok: totals.ok || 0, errors: totals.errors || 0, files: totals.files || 0, bytes: totals.bytes || 0, avgMs: Math.round(totals.avgMs || 0), p50: pct(0.5), p95: pct(0.95) },
      byDay, byKind: group('r.kind'), byFormat: group('r.format'), byStatus: group('r.status'), byPath: group('r.path'),
      topKeys: db.prepare(`SELECT r.key_type AS type, r.key_id AS id, MAX(r.key_hint) AS hint, COALESCE(MAX(ek.name), MAX(tk.name)) AS name, COUNT(*) AS n, SUM(r.status >= 400) AS errors ${JOIN} ${sql} ${sql ? 'AND' : 'WHERE'} r.key_hint IS NOT NULL GROUP BY r.key_type, r.key_id, r.key_hint ORDER BY n DESC LIMIT 12`).all(...args),
      topUsers: db.prepare(`SELECT r.user_id AS id, MAX(u.handle) AS handle, COUNT(*) AS n FROM api_requests r LEFT JOIN users u ON u.id = r.user_id ${sql} ${sql ? 'AND' : 'WHERE'} r.user_id IS NOT NULL GROUP BY r.user_id ORDER BY n DESC LIMIT 12`).all(...args),
      topIps: db.prepare(`SELECT r.ip AS ip, COUNT(*) AS n, SUM(r.status >= 400) AS errors FROM api_requests r ${sql} ${sql ? 'AND' : 'WHERE'} r.ip IS NOT NULL GROUP BY r.ip ORDER BY n DESC LIMIT 12`).all(...args),
      // Calls with a key that doesn't exist (or none): someone guessing, or a client misconfigured.
      badKeys: db.prepare(`SELECT r.key_hint AS hint, r.ip AS ip, COUNT(*) AS n, MAX(r.at) AS last FROM api_requests r ${sql} ${sql ? 'AND' : 'WHERE'} r.status = 401 GROUP BY r.key_hint, r.ip ORDER BY n DESC LIMIT 12`).all(...args),
    };
  }

  function csv(f = {}) {
    const { sql, args } = where(f);
    const rows = db.prepare(`SELECT ${COLS} ${JOIN} ${sql} ORDER BY r.id DESC LIMIT 50000`).all(...args);
    const head = ['request_id', 'time_utc', 'api', 'method', 'path', 'status', 'ms', 'bytes', 'key_type', 'key_id', 'key_hint', 'key_name', 'user_id', 'user_handle', 'ip', 'user_agent', 'kind', 'format', 'serial', 'error', 'params'];
    const lines = rows.map((r) => [r.request_id, new Date(r.at).toISOString(), r.api, r.method, r.path, r.status, r.ms, r.bytes, r.key_type, r.key_id, r.key_hint, r.engine_key_name || r.trace_key_name, r.user_id, r.user_handle, r.ip, r.ua, r.kind, r.format, r.serial, r.error, r.params].map(csvCell).join(','));
    return `${head.join(',')}\n${lines.join('\n')}\n`;
  }

  // From a serial (or request id) to everything known about it: the call, the
  // key, the account, and the download record the file was stamped with.
  function trace(id) {
    const call = one(id, {}, { staff: true });
    const serial = call?.serial || (/^(VX|T)/.test(id) ? id : null);
    const download = serial ? db.prepare('SELECT d.*, u.handle FROM download_serials d LEFT JOIN users u ON u.id = d.user_id WHERE d.serial = ?').get(serial) : null;
    let key = null;
    if (call?.key?.type === 'engine' && call.key.id) key = db.prepare('SELECT id, name, user_id, calls, created_at, last_used_at, revoked_at, key_hint FROM engine_keys WHERE id = ?').get(call.key.id);
    if (call?.key?.type === 'trace' && call.key.id) key = db.prepare('SELECT id, name, test, quota, calls, created_at, last_used_at, revoked_at, key_hint FROM trace_keys WHERE id = ?').get(call.key.id);
    return { call, key, download: download ? { ...download, params: (() => { try { return JSON.parse(download.params || 'null'); } catch { return download.params; } })() } : null };
  }

  const prune = () => db.prepare('DELETE FROM api_requests WHERE at < ?').run(now() - KEEP).changes;
  prune();
  const timer = setInterval(prune, 86400e3);
  timer.unref?.();

  return { track, list, one, summary, csv, trace, prune, keyOf, close: () => clearInterval(timer) };
}
