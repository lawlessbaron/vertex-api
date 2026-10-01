// Developers' webhooks: we tell their server when something happens to their
// API account. Events: usage.80 (a key has used 80% of its day), usage.limit
// (a key hit its daily limit), key.created, key.revoked, and webhook.test.
// Each delivery is a JSON POST signed with the webhook's secret:
//   Mint-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">
//   Mint-Event: usage.80        Mint-Delivery: evt_…
// A delivery that doesn't get a 2xx is tried again after 1 min, 5 min, 30 min,
// 2 h and 6 h, then marked failed; every try is kept in the delivery log.
// Addresses must be https and can't point into a private network.
import { createHmac, randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { HttpError } from './security.js';

export const WEBHOOK_EVENTS = {
  'usage.80': 'A key has used 80% of its daily calls',
  'usage.limit': 'A key hit its daily limit',
  'key.created': 'A key was made',
  'key.revoked': 'A key was revoked',
  'incident.updated': 'An incident on the status page was opened, updated or resolved',
};
const BACKOFF = [60e3, 5 * 60e3, 30 * 60e3, 2 * 3600e3, 6 * 3600e3];
const MAX_HOOKS = 5;

export function sign(secret, t, body) {
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
}

// Private, loopback, link-local and other addresses a webhook must not reach.
export function privateAddress(ip) {
  const a = String(ip).replace(/^::ffff:/, '');
  if (isIP(a) === 4) {
    const [x, y] = a.split('.').map(Number);
    return x === 10 || x === 127 || x === 0 || (x === 169 && y === 254) || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168) || (x === 100 && y >= 64 && y <= 127) || x >= 224;
  }
  const l = a.toLowerCase();
  return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80');
}

export function createApiWebhooks({ db, fetchImpl = fetch, now = () => Date.now(), resolve = (h) => lookup(h, { all: true }), allowPrivate = false }) {
  const out = (h) => ({ id: h.id, url: h.url, events: h.events.split(','), createdAt: h.created_at, disabled: Boolean(h.disabled_at), ...(h.stats || {}) });
  function list(userId) {
    return db.prepare('SELECT * FROM api_webhooks WHERE user_id = ? ORDER BY id').all(userId).map((h) => {
      const s = db.prepare("SELECT SUM(status = 'delivered') AS ok, SUM(status = 'failed') AS failed, MAX(delivered_at) AS lastOk FROM api_webhook_deliveries WHERE webhook_id = ?").get(h.id);
      return out({ ...h, stats: { delivered: s.ok || 0, failed: s.failed || 0, lastDeliveredAt: s.lastOk || null } });
    });
  }

  async function checkUrl(raw) {
    let u;
    try { u = new URL(String(raw || '').trim()); } catch { throw new HttpError(400, 'That isn\'t a web address.'); }
    if (u.protocol !== 'https:' && !(allowPrivate && u.protocol === 'http:')) throw new HttpError(400, 'Webhook addresses must start with https://');
    if (u.username || u.password) throw new HttpError(400, 'Leave the user name and password out of the address.');
    if (!allowPrivate) {
      if (/^(localhost|.*\.local|.*\.internal)$/i.test(u.hostname)) throw new HttpError(400, 'That address is on a private network.');
      let addrs = [];
      try { addrs = isIP(u.hostname) ? [{ address: u.hostname }] : await resolve(u.hostname); } catch { throw new HttpError(400, 'That address doesn\'t resolve.'); }
      if (!addrs.length || addrs.some((a) => privateAddress(a.address))) throw new HttpError(400, 'That address is on a private network.');
    }
    return u.toString();
  }

  async function create(userId, { url, events } = {}) {
    if (db.prepare('SELECT COUNT(*) AS n FROM api_webhooks WHERE user_id = ? AND disabled_at IS NULL').get(userId).n >= MAX_HOOKS) throw new HttpError(400, `${MAX_HOOKS} webhooks at most.`);
    const ev = (Array.isArray(events) && events.length ? events : Object.keys(WEBHOOK_EVENTS)).filter((e) => WEBHOOK_EVENTS[e]);
    if (!ev.length) throw new HttpError(400, 'Pick at least one event.');
    const clean = await checkUrl(url);
    const secret = `whsec_${randomBytes(24).toString('base64url')}`;
    const id = Number(db.prepare('INSERT INTO api_webhooks (user_id, url, secret, events, created_at) VALUES (?, ?, ?, ?, ?)').run(userId, clean, secret, ev.join(','), now()).lastInsertRowid);
    return { ...out(db.prepare('SELECT * FROM api_webhooks WHERE id = ?').get(id)), secret };
  }
  function remove(userId, id) {
    const r = db.prepare('UPDATE api_webhooks SET disabled_at = ? WHERE id = ? AND user_id = ? AND disabled_at IS NULL').run(now(), id, userId);
    if (!r.changes) throw new HttpError(404, 'No webhook with that id.');
  }
  function deliveries(userId, id, limit = 50) {
    const h = db.prepare('SELECT id FROM api_webhooks WHERE id = ? AND user_id = ?').get(id, userId);
    if (!h) throw new HttpError(404, 'No webhook with that id.');
    return db.prepare('SELECT id, event_id AS eventId, event, status, attempts, response_code AS code, last_error AS error, created_at AS createdAt, delivered_at AS deliveredAt, next_at AS nextAt FROM api_webhook_deliveries WHERE webhook_id = ? ORDER BY id DESC LIMIT ?').all(id, limit);
  }

  // Queue an event for every live webhook on the account that wants it.
  function emit(userId, event, data = {}, { only = null } = {}) {
    const hooks = db.prepare('SELECT * FROM api_webhooks WHERE user_id = ? AND disabled_at IS NULL').all(userId).filter((h) => (only ? h.id === only : h.events.split(',').includes(event)));
    const ids = [];
    for (const h of hooks) {
      const eventId = `evt_${randomBytes(9).toString('base64url')}`;
      const payload = JSON.stringify({ id: eventId, type: event, created: Math.floor(now() / 1000), data });
      ids.push(Number(db.prepare('INSERT INTO api_webhook_deliveries (webhook_id, event_id, event, payload, created_at, next_at) VALUES (?, ?, ?, ?, ?, ?)').run(h.id, eventId, event, payload, now(), now()).lastInsertRowid));
    }
    if (ids.length) setTimeout(() => process().catch(() => {}), 0).unref?.();
    return ids;
  }
  // To everyone who asked for it (status page incidents).
  function broadcast(event, data = {}) {
    const users = db.prepare("SELECT DISTINCT user_id FROM api_webhooks WHERE disabled_at IS NULL AND (',' || events || ',') LIKE ?").all(`%,${event},%`);
    return users.reduce((n, u) => n + emit(u.user_id, event, data).length, 0);
  }
  function test(userId, id) {
    if (!db.prepare('SELECT id FROM api_webhooks WHERE id = ? AND user_id = ? AND disabled_at IS NULL').get(id, userId)) throw new HttpError(404, 'No webhook with that id.');
    return emit(userId, 'webhook.test', { message: 'Hello from the Mint Motive API. Your webhook works.' }, { only: id });
  }

  // Send what's due. Returns how many were tried.
  let busy = false, again = false;
  async function process() {
    // One run at a time; anything queued meanwhile is sent straight after.
    if (busy) { again = true; return 0; }
    busy = true;
    again = false;
    try {
      const due = db.prepare("SELECT d.*, h.url, h.secret FROM api_webhook_deliveries d JOIN api_webhooks h ON h.id = d.webhook_id WHERE d.status = 'pending' AND d.next_at <= ? AND h.disabled_at IS NULL ORDER BY d.id LIMIT 25").all(now());
      for (const d of due) {
        const t = Math.floor(now() / 1000);
        let code = null, error = null;
        try {
          await checkUrl(d.url); // the name may have moved somewhere private since it was saved
          const ctl = new AbortController();
          const timer = setTimeout(() => ctl.abort(), 8000);
          try {
            const res = await fetchImpl(d.url, { method: 'POST', redirect: 'manual', signal: ctl.signal, headers: { 'Content-Type': 'application/json', 'User-Agent': 'MintMotive-Webhooks/1', 'Mint-Signature': sign(d.secret, t, d.payload), 'Mint-Event': d.event, 'Mint-Delivery': d.event_id }, body: d.payload });
            code = res.status;
            if (res.status < 200 || res.status >= 300) error = `HTTP ${res.status}`;
          } finally { clearTimeout(timer); }
        } catch (e) { error = e.name === 'AbortError' ? 'Timed out after 8 s' : e.message; }
        const attempts = d.attempts + 1;
        if (!error) db.prepare("UPDATE api_webhook_deliveries SET status = 'delivered', attempts = ?, response_code = ?, last_error = NULL, delivered_at = ?, next_at = NULL WHERE id = ?").run(attempts, code, now(), d.id);
        else if (attempts > BACKOFF.length) db.prepare("UPDATE api_webhook_deliveries SET status = 'failed', attempts = ?, response_code = ?, last_error = ?, next_at = NULL WHERE id = ?").run(attempts, code, String(error).slice(0, 300), d.id);
        else db.prepare('UPDATE api_webhook_deliveries SET attempts = ?, response_code = ?, last_error = ?, next_at = ? WHERE id = ?').run(attempts, code, String(error).slice(0, 300), now() + BACKOFF[attempts - 1], d.id);
      }
      return due.length;
    } finally {
      busy = false;
      if (again) setTimeout(() => process().catch(() => {}), 0).unref?.();
    }
  }
  // Everything, for staff.
  const all = () => db.prepare(`SELECT h.id, h.url, h.events, h.created_at AS createdAt, h.disabled_at AS disabledAt, u.handle, u.id AS userId,
      (SELECT COUNT(*) FROM api_webhook_deliveries d WHERE d.webhook_id = h.id AND d.status = 'delivered') AS delivered,
      (SELECT COUNT(*) FROM api_webhook_deliveries d WHERE d.webhook_id = h.id AND d.status = 'failed') AS failed,
      (SELECT COUNT(*) FROM api_webhook_deliveries d WHERE d.webhook_id = h.id AND d.status = 'pending') AS pending
    FROM api_webhooks h JOIN users u ON u.id = h.user_id ORDER BY h.id DESC LIMIT 300`).all();

  const timer = setInterval(() => process().catch(() => {}), 30e3);
  timer.unref?.();
  return { list, create, remove, deliveries, emit, broadcast, test, process, all, close: () => clearInterval(timer) };
}
