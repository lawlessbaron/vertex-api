// Append-only, hash-chained audit log of staff actions. Each row's hash
// covers the previous row's hash, so editing or deleting any row breaks the
// chain from that point on. A copy of every entry is also appended to a
// JSON-lines file next to the database, as an independent record.
import { appendFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';

const GENESIS = '0'.repeat(64);

function digest(prev, row) {
  return createHash('sha256')
    .update(JSON.stringify([prev, row.ts, row.actor_id ?? null, row.actor_email ?? null, row.action, row.target ?? null, row.detail ?? null, row.ip ?? null]))
    .digest('hex');
}

export function createAudit(db, databasePath) {
  const file = databasePath && databasePath !== ':memory:' ? join(dirname(databasePath), 'audit.log') : null;
  if (file) mkdirSync(dirname(file), { recursive: true });
  const last = db.prepare('SELECT hash FROM audit ORDER BY id DESC LIMIT 1');
  const insert = db.prepare('INSERT INTO audit (ts, actor_id, actor_email, action, target, detail, ip, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');

  function log(actor, action, target = null, detail = null, ip = null) {
    const row = {
      ts: Date.now(),
      actor_id: actor?.id ?? null,
      actor_email: actor?.email ?? null,
      action: String(action).slice(0, 60),
      target: target === null ? null : String(target).slice(0, 200),
      detail: detail === null || detail === undefined ? null : (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 4000),
      ip: ip ?? actor?.ip ?? null,
    };
    const prev = last.get()?.hash || GENESIS;
    const hash = digest(prev, row);
    insert.run(row.ts, row.actor_id, row.actor_email, row.action, row.target, row.detail, row.ip, prev, hash);
    if (file) {
      try {
        appendFileSync(file, JSON.stringify({ ...row, prev_hash: prev, hash }) + '\n');
      } catch (e) {
        console.error('audit file:', e.message);
      }
    }
  }

  function verify() {
    let prev = GENESIS, count = 0;
    for (const row of db.prepare('SELECT * FROM audit ORDER BY id').iterate()) {
      if (row.prev_hash !== prev || digest(prev, row) !== row.hash) return { ok: false, count, brokenAt: row.id };
      prev = row.hash;
      count++;
    }
    return { ok: true, count, head: prev };
  }

  function list({ before, action, actor, limit = 100 } = {}) {
    const where = [], args = [];
    if (before) { where.push('id < ?'); args.push(Number(before)); }
    if (action) { where.push('action LIKE ?'); args.push(`${action}%`); }
    if (actor) { where.push('actor_email LIKE ?'); args.push(`%${actor}%`); }
    return db.prepare(`SELECT * FROM audit ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ${Math.min(500, Number(limit) || 100)}`).all(...args);
  }

  return { log, verify, list };
}
