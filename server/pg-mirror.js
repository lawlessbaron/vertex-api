// Keeps every table of the site's database copied into PostgreSQL.
//
// The site still reads and writes its built-in SQLite database (in-process, so
// pages stay fast); this module makes PostgreSQL hold all of the same data:
//   - The first time it connects, it copies every table across.
//   - After that, triggers note each changed row and the changes are sent
//     across about once a second.
//   - If the site starts on an empty volume, restoreFromPostgres() rebuilds the
//     SQLite database from PostgreSQL before anything else runs.
// It never lets an empty site database overwrite PostgreSQL data.
//
// Postgres tables have the same names and columns, plus "_rowid" (the SQLite
// rowid) as the primary key.
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { connectPg } from './pg.js';
import { openDatabase } from './db.js';

const META = '_api_meta';
const SYNC = '_api_sync';
const MAX_PARAMS = 30000; // Postgres allows 65535 per statement
const MAX_BATCH_BYTES = 8 * 1024 * 1024;
const BACKLOG_LIMIT = 2_000_000; // past this, forget the list and copy everything again

const q = (name) => `"${String(name).replace(/"/g, '""')}"`;
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

// Postgres column type for a SQLite declared type (SQLite's affinity rules).
function pgType(decl) {
  const d = String(decl || '').toUpperCase();
  if (d.includes('INT')) return 'bigint';
  if (/CHAR|CLOB|TEXT/.test(d)) return 'text';
  if (d.includes('BLOB') || !d) return d ? 'bytea' : 'text';
  if (/REAL|FLOA|DOUB/.test(d)) return 'double precision';
  return 'text';
}

// Does this value fit the Postgres column as it stands? If not, the column is
// widened (bigint → double → text) so nothing is ever dropped.
function widenFor(type, v) {
  if (v === null || v === undefined) return null;
  if (type === 'text') return null;
  if (type === 'bigint') {
    if (typeof v === 'bigint' || (typeof v === 'number' && Number.isSafeInteger(v))) return null;
    return typeof v === 'number' ? 'double precision' : 'text';
  }
  if (type === 'double precision') return typeof v === 'number' || typeof v === 'bigint' ? null : 'text';
  if (type === 'bytea') return Buffer.isBuffer(v) || v instanceof Uint8Array ? null : 'text';
  return 'text';
}

// A value as Postgres will take it for a column of this type.
function toPg(type, v) {
  if (v === null || v === undefined) return null;
  if (type === 'text') {
    if (Buffer.isBuffer(v) || v instanceof Uint8Array) return `\\x${Buffer.from(v).toString('hex')}`;
    return String(v).replace(/\0/g, ''); // Postgres text can't hold NUL
  }
  return v;
}

function sqliteTables(db) {
  return db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE '\\_pg\\_%' ESCAPE '\\' ORDER BY name").all()
    .map(({ name }) => {
      const cols = db.prepare(`PRAGMA table_info(${q(name)})`).all().map((c) => ({ name: c.name, decl: c.type }));
      return { name, cols, signature: JSON.stringify(cols.map((c) => [c.name, c.decl])) };
    });
}

function ensureLocal(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS _pg_changes (id INTEGER PRIMARY KEY, tbl TEXT NOT NULL, rid INTEGER NOT NULL, op TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS _pg_state (key TEXT PRIMARY KEY, value TEXT);`);
}
const getState = (db, key) => db.prepare('SELECT value FROM _pg_state WHERE key = ?').get(key)?.value ?? null;
const setState = (db, key, value) => db.prepare('INSERT INTO _pg_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);

// Triggers that note every insert, update and delete.
function ensureTriggers(db, tables) {
  for (const { name } of tables) {
    const n = lit(name);
    const tag = name.replace(/[^A-Za-z0-9_]/g, '_');
    db.exec(`CREATE TRIGGER IF NOT EXISTS ${q(`_pgm_${tag}_i`)} AFTER INSERT ON ${q(name)} BEGIN INSERT INTO _pg_changes (tbl, rid, op) VALUES (${n}, NEW.rowid, 'u'); END;
      CREATE TRIGGER IF NOT EXISTS ${q(`_pgm_${tag}_u`)} AFTER UPDATE ON ${q(name)} BEGIN
        INSERT INTO _pg_changes (tbl, rid, op) SELECT ${n}, OLD.rowid, 'd' WHERE OLD.rowid <> NEW.rowid;
        INSERT INTO _pg_changes (tbl, rid, op) VALUES (${n}, NEW.rowid, 'u'); END;
      CREATE TRIGGER IF NOT EXISTS ${q(`_pgm_${tag}_d`)} AFTER DELETE ON ${q(name)} BEGIN INSERT INTO _pg_changes (tbl, rid, op) VALUES (${n}, OLD.rowid, 'd'); END;`);
  }
}

async function ensureRemoteMeta(pg) {
  await pg.exec(`CREATE TABLE IF NOT EXISTS ${META} (key text PRIMARY KEY, value text);
    CREATE TABLE IF NOT EXISTS ${SYNC} (tbl text PRIMARY KEY, signature text NOT NULL, types text NOT NULL, rows bigint NOT NULL DEFAULT 0, synced_at timestamptz NOT NULL DEFAULT now());`);
}
const remoteMeta = async (pg, key) => (await pg.query(`SELECT value FROM ${META} WHERE key = $1`, [key])).rows[0]?.value ?? null;
const setRemoteMeta = (pg, key, value) => pg.query(`INSERT INTO ${META} (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [key, value]);

// Rows as INSERT … ON CONFLICT batches that stay under the parameter and size limits.
function* batches(rows, width) {
  let batch = [];
  let bytes = 0;
  for (const r of rows) {
    const size = r.reduce((s, v) => s + (typeof v === 'string' ? v.length : Buffer.isBuffer(v) ? v.length : 8), 0);
    if (batch.length && ((batch.length + 1) * width > MAX_PARAMS || bytes + size > MAX_BATCH_BYTES)) { yield batch; batch = []; bytes = 0; }
    batch.push(r);
    bytes += size;
  }
  if (batch.length) yield batch;
}

async function upsert(pg, table, cols, types, rows, into = table) {
  if (!rows.length) return;
  // Widen any column a value doesn't fit, once, before sending.
  for (const r of rows) {
    cols.forEach((c, i) => {
      const wider = widenFor(types[c], r[i + 1]);
      if (wider) types[c] = wider;
    });
  }
  for (const c of cols) {
    if (types[c] !== types.__remote[c]) {
      await pg.query(`ALTER TABLE ${q(into)} ALTER COLUMN ${q(c)} TYPE ${types[c]} USING ${q(c)}::${types[c] === 'double precision' ? 'double precision' : 'text'}`);
      types.__remote[c] = types[c];
      types.__changed = true;
    }
  }
  const names = ['_rowid', ...cols];
  const width = names.length;
  const update = cols.length ? `DO UPDATE SET ${cols.map((c) => `${q(c)} = EXCLUDED.${q(c)}`).join(', ')}` : 'DO NOTHING';
  for (const batch of batches(rows, width)) {
    const values = [];
    const tuples = batch.map((r, bi) => `(${names.map((_, ci) => { values.push(ci === 0 ? r[0] : toPg(types[cols[ci - 1]], r[ci])); return `$${bi * width + ci + 1}`; }).join(', ')})`);
    await pg.query(`INSERT INTO ${q(into)} (${names.map(q).join(', ')}) VALUES ${tuples.join(', ')} ON CONFLICT (_rowid) ${update}`, values);
  }
}

const rowArray = (row, cols) => [row._rowid, ...cols.map((c) => row[c])];

// Copy one whole table into a fresh Postgres table, then swap it in.
async function copyTable(db, pg, t, onRows) {
  const cols = t.cols.map((c) => c.name);
  const types = Object.fromEntries(t.cols.map((c) => [c.name, pgType(c.decl)]));
  types.__remote = { ...types };
  const tmp = `${t.name}__vx_new`.slice(0, 63);
  await pg.exec(`DROP TABLE IF EXISTS ${q(tmp)}; CREATE TABLE ${q(tmp)} (_rowid bigint PRIMARY KEY${t.cols.map((c) => `, ${q(c.name)} ${types[c.name]}`).join('')});`);
  const read = db.prepare(`SELECT rowid AS _rowid, * FROM ${q(t.name)} WHERE rowid > ? ORDER BY rowid LIMIT 1000`);
  let last = Number.MIN_SAFE_INTEGER;
  let count = 0;
  for (;;) {
    const rows = read.all(last);
    if (!rows.length) break;
    last = rows[rows.length - 1]._rowid;
    await upsert(pg, t.name, cols, types, rows.map((r) => rowArray(r, cols)), tmp);
    count += rows.length;
    onRows?.(rows.length);
    await new Promise((r) => setImmediate(r)); // let the site serve requests between batches
  }
  delete types.__remote; delete types.__changed;
  await pg.exec(`BEGIN; DROP TABLE IF EXISTS ${q(t.name)}; ALTER TABLE ${q(tmp)} RENAME TO ${q(t.name)};
    INSERT INTO ${SYNC} (tbl, signature, types, rows, synced_at) VALUES (${lit(t.name)}, ${lit(t.signature)}, ${lit(JSON.stringify(types))}, ${count}, now())
      ON CONFLICT (tbl) DO UPDATE SET signature = EXCLUDED.signature, types = EXCLUDED.types, rows = EXCLUDED.rows, synced_at = now(); COMMIT;`);
  return { types, count };
}

/**
 * Starts the mirror. Returns { status(), flush(), stop() }. Everything runs in
 * the background; failures are logged and retried, never thrown at the site.
 */
export function startMirror({ db, url, log = console.log, forceFull = false, intervalMs = 1000 }) {
  ensureLocal(db);
  if (forceFull) db.prepare("DELETE FROM _pg_state WHERE key = 'generation'").run();
  const tables = sqliteTables(db);
  ensureTriggers(db, tables);
  const byName = new Map(tables.map((t) => [t.name, t]));
  const typesOf = new Map();
  const state = { enabled: true, connected: false, phase: 'starting', copied: 0, totalRows: 0, tables: tables.length, lastSyncAt: null, lastError: null, sent: 0, blocked: null };
  let pg = null;
  let timer = null;
  let stopped = false;
  let busy = null;
  let lastLoggedError = '';

  const backlog = () => db.prepare('SELECT COUNT(*) AS n FROM _pg_changes').get().n;
  const noteError = (e) => {
    state.lastError = { at: Date.now(), message: e.message };
    state.connected = Boolean(pg && !pg.closed);
    if (e.message !== lastLoggedError) { log(`PostgreSQL sync: ${e.message}`); lastLoggedError = e.message; }
  };

  async function connect() {
    if (pg && !pg.closed) return pg;
    pg = await connectPg(url);
    state.connected = true;
    await ensureRemoteMeta(pg);
    return pg;
  }

  // First connection (or after a change of schema/backup): copy what needs copying.
  async function initialSync() {
    await connect();
    const localGen = getState(db, 'generation');
    const remoteGen = await remoteMeta(pg, 'generation');
    const synced = new Map((await pg.query(`SELECT tbl, signature, types FROM ${SYNC}`)).rows.map((r) => [r.tbl, r]));
    const full = !localGen || localGen !== remoteGen;
    if (full && remoteGen) {
      // Postgres already holds a site's data. Never overwrite it with an empty site.
      const localUsers = byName.has('users') ? db.prepare('SELECT COUNT(*) AS n FROM users').get().n : 0;
      const remoteUsers = synced.has('users') ? Number((await pg.query('SELECT COUNT(*) AS n FROM users')).rows[0].n) : 0;
      if (remoteUsers > 0 && localUsers === 0) {
        state.blocked = `PostgreSQL has ${remoteUsers} accounts but this site's database has none, so nothing was copied over them. Restart on an empty volume to restore from PostgreSQL, or clear the PostgreSQL tables to start again.`;
        throw new Error(state.blocked);
      }
    }
    const todo = tables.filter((t) => full || synced.get(t.name)?.signature !== t.signature);
    // A table whose row count no longer matches (and has nothing waiting to send)
    // drifted somehow, e.g. a schema change that rebuilt it: copy it again.
    if (!full) {
      for (const t of tables) {
        if (todo.includes(t)) continue;
        const waiting = db.prepare('SELECT 1 FROM _pg_changes WHERE tbl = ? LIMIT 1').get(t.name);
        if (waiting) continue;
        const localN = db.prepare(`SELECT COUNT(*) AS n FROM ${q(t.name)}`).get().n;
        const remoteN = Number((await pg.query(`SELECT COUNT(*) AS n FROM ${q(t.name)}`)).rows[0].n);
        if (localN !== remoteN) todo.push(t);
      }
    }
    state.totalRows = todo.reduce((n, t) => n + db.prepare(`SELECT COUNT(*) AS n FROM ${q(t.name)}`).get().n, 0);
    state.phase = todo.length ? 'copying' : 'syncing';
    if (todo.length) log(`PostgreSQL sync: copying ${todo.length} table${todo.length === 1 ? '' : 's'} (${state.totalRows.toLocaleString()} rows)…`);
    for (const t of tables) {
      if (todo.includes(t)) continue;
      const types = JSON.parse(synced.get(t.name).types);
      types.__remote = { ...types };
      typesOf.set(t.name, types);
    }
    for (const t of todo) {
      const upTo = db.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM _pg_changes').get().m;
      const { types } = await copyTable(db, pg, t, (n) => { state.copied += n; });
      types.__remote = { ...types };
      typesOf.set(t.name, types);
      db.prepare('DELETE FROM _pg_changes WHERE tbl = ? AND id <= ?').run(t.name, upTo);
    }
    // Tables the site no longer has are dropped from the mirror too.
    for (const name of synced.keys()) {
      if (!byName.has(name)) await pg.exec(`DROP TABLE IF EXISTS ${q(name)}; DELETE FROM ${SYNC} WHERE tbl = ${lit(name)};`);
    }
    if (full) {
      const gen = randomUUID();
      await setRemoteMeta(pg, 'generation', gen);
      setState(db, 'generation', gen);
    }
    await setRemoteMeta(pg, 'complete', '1');
    await setRemoteMeta(pg, 'site_updated_at', new Date().toISOString());
    if (todo.length) log(`PostgreSQL sync: copy finished (${state.copied.toLocaleString()} rows). Changes now go across as they happen.`);
    state.phase = 'syncing';
  }

  // Send the next batch of noted changes. Returns how many were handled.
  async function pushChanges() {
    const changes = db.prepare('SELECT id, tbl, rid, op FROM _pg_changes ORDER BY id LIMIT 2000').all();
    if (!changes.length) return 0;
    const maxId = changes[changes.length - 1].id;
    const latest = new Map(); // "tbl|rid" → op (the last one wins)
    for (const c of changes) latest.set(`${c.tbl}|${c.rid}`, c);
    const perTable = new Map();
    for (const c of latest.values()) {
      if (!byName.has(c.tbl)) continue;
      if (!perTable.has(c.tbl)) perTable.set(c.tbl, { up: [], del: [] });
      perTable.get(c.tbl)[c.op === 'd' ? 'del' : 'up'].push(c.rid);
    }
    await pg.query('BEGIN');
    try {
      for (const [name, { up, del }] of perTable) {
        const t = byName.get(name);
        const cols = t.cols.map((c) => c.name);
        const types = typesOf.get(name);
        const rows = [];
        for (let i = 0; i < up.length; i += 500) {
          const ids = up.slice(i, i + 500);
          const found = db.prepare(`SELECT rowid AS _rowid, * FROM ${q(name)} WHERE rowid IN (${ids.map(() => '?').join(',')})`).all(...ids);
          const seen = new Set(found.map((r) => Number(r._rowid)));
          for (const id of ids) if (!seen.has(Number(id))) del.push(id); // gone again already
          rows.push(...found.map((r) => rowArray(r, cols)));
        }
        await upsert(pg, name, cols, types, rows);
        for (let i = 0; i < del.length; i += 5000) {
          await pg.query(`DELETE FROM ${q(name)} WHERE _rowid = ANY($1::bigint[])`, [del.slice(i, i + 5000)]);
        }
        if (types.__changed) {
          const plain = { ...types }; delete plain.__remote; delete plain.__changed;
          await pg.query(`UPDATE ${SYNC} SET types = $2 WHERE tbl = $1`, [name, JSON.stringify(plain)]);
          types.__changed = false;
        }
      }
      await pg.query('COMMIT');
    } catch (e) {
      await pg.query('ROLLBACK').catch(() => {});
      throw e;
    }
    db.prepare('DELETE FROM _pg_changes WHERE id <= ?').run(maxId);
    state.sent += changes.length;
    return changes.length;
  }

  let initialised = false;
  let delay = intervalMs;
  async function tick() {
    timer = null;
    if (stopped) return;
    try {
      if (!initialised) {
        if (backlog() > BACKLOG_LIMIT) { db.exec('DELETE FROM _pg_changes'); db.prepare("DELETE FROM _pg_state WHERE key = 'generation'").run(); }
        await initialSync();
        initialised = true;
      } else await connect();
      let n;
      do { n = await pushChanges(); } while (n === 2000 && !stopped);
      state.lastSyncAt = Date.now();
      state.lastError = null;
      lastLoggedError = '';
      delay = intervalMs;
    } catch (e) {
      noteError(e);
      if (pg?.closed) pg = null;
      delay = Math.min(delay * 2, 60000); // back off while Postgres is away
      if (state.blocked) { state.enabled = false; return; } // needs a person, not a retry
    }
    if (!stopped) { timer = setTimeout(() => { busy = tick(); }, delay); timer.unref?.(); }
  }
  busy = tick();

  return {
    status: () => ({ ...state, backlog: backlog() }),
    /** Push what's waiting now (tests, shutdown). */
    async flush() {
      await busy;
      if (!initialised || state.blocked) return;
      await connect();
      let n;
      do { n = await pushChanges(); } while (n > 0);
      state.lastSyncAt = Date.now();
    },
    /** Send what's left (up to timeoutMs), then close the connection. */
    async stop(timeoutMs = 4000) {
      stopped = true;
      if (timer) clearTimeout(timer);
      await Promise.race([
        (async () => { try { await busy; if (initialised && !state.blocked) { let n; do { n = await pushChanges(); } while (n > 0); } } catch (e) { noteError(e); } })(),
        new Promise((r) => setTimeout(r, timeoutMs).unref?.()),
      ]);
      try { await pg?.close(); } catch {}
    },
  };
}

/**
 * On an empty volume: rebuild the SQLite database from PostgreSQL, before the
 * site opens it. Returns { restored, tables, rows } (restored false when there
 * is nothing to restore, or the database file already exists).
 */
export async function restoreFromPostgres({ databasePath, url, log = console.log, attempts = 6 }) {
  if (existsSync(databasePath)) return { restored: false, reason: 'the site already has a database' };
  // Railway's private network can take a few seconds to come up after a start.
  let pg;
  for (let i = 1; ; i++) {
    try { pg = await connectPg(url); break; } catch (e) {
      if (i >= attempts) throw e;
      log(`PostgreSQL not reachable yet (${e.message}); trying again…`);
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
  try {
    const hasMeta = (await pg.query("SELECT to_regclass($1) AS m, to_regclass($2) AS s", [META, SYNC])).rows[0];
    if (!hasMeta.m || !hasMeta.s) return { restored: false, reason: 'PostgreSQL is empty' };
    const complete = await remoteMeta(pg, 'complete');
    const generation = await remoteMeta(pg, 'generation');
    if (complete !== '1' || !generation) return { restored: false, reason: 'PostgreSQL never finished a full copy' };
    const synced = (await pg.query(`SELECT tbl FROM ${SYNC} ORDER BY tbl`)).rows.map((r) => r.tbl);
    log(`Restoring the site database from PostgreSQL (${synced.length} tables)…`);
    const db = openDatabase(databasePath); // creates today's schema
    ensureLocal(db);
    const local = new Map(sqliteTables(db).map((t) => [t.name, t]));
    let rows = 0;
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      for (const name of synced) {
        const t = local.get(name);
        if (!t) continue; // a table the site no longer has
        const remoteCols = new Set((await pg.query('SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1', [name])).rows.map((r) => r.column_name));
        const cols = t.cols.map((c) => c.name).filter((c) => remoteCols.has(c));
        db.exec(`DELETE FROM ${q(name)}`); // seed rows the schema added are replaced by the real ones
        const ins = db.prepare(`INSERT OR REPLACE INTO ${q(name)} (rowid${cols.map((c) => `, ${q(c)}`).join('')}) VALUES (?${', ?'.repeat(cols.length)})`);
        let last = null;
        for (;;) {
          const page = (await pg.query(`SELECT _rowid${cols.map((c) => `, ${q(c)}`).join('')} FROM ${q(name)}${last === null ? '' : ' WHERE _rowid > $1'} ORDER BY _rowid LIMIT 2000`, last === null ? [] : [last])).rows;
          if (!page.length) break;
          for (const r of page) ins.run(r._rowid, ...cols.map((c) => (typeof r[c] === 'boolean' ? Number(r[c]) : r[c])));
          last = page[page.length - 1]._rowid;
          rows += page.length;
        }
      }
      db.exec('DELETE FROM _pg_changes');
      setState(db, 'generation', generation);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      db.close();
      throw e;
    }
    db.exec('PRAGMA foreign_keys = ON');
    db.close();
    log(`Restored ${rows.toLocaleString()} rows from PostgreSQL.`);
    return { restored: true, tables: synced.length, rows };
  } finally {
    await pg.close();
  }
}
