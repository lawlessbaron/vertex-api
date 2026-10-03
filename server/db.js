// The API site's own database (SQLite, node:sqlite). Accounts stay on VERTEX:
// `users` here is a copy of the few account details the API needs, written when
// someone signs in with VERTEX and kept fresh from it. Ids match VERTEX's, so
// keys, logs and plans brought over from VERTEX still point at the right person.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const MIGRATIONS = [
  `CREATE TABLE users (
     id INTEGER PRIMARY KEY,
     email TEXT NOT NULL,
     name TEXT NOT NULL DEFAULT '',
     handle TEXT,
     role TEXT NOT NULL DEFAULT 'user',
     stripe_customer_id TEXT,
     api_overage_cap INTEGER,
     created_at INTEGER NOT NULL,
     synced_at INTEGER NOT NULL
   );
   CREATE INDEX users_email ON users (email);
   CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        user_agent TEXT NOT NULL DEFAULT ''
      , ip TEXT, last_seen_at INTEGER, mfa INTEGER NOT NULL DEFAULT 0);
   CREATE INDEX sessions_user ON sessions(user_id);
   CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE TABLE audit (
        id INTEGER PRIMARY KEY,
        ts INTEGER NOT NULL,
        actor_id INTEGER,
        actor_email TEXT,
        action TEXT NOT NULL,
        target TEXT,
        detail TEXT,
        ip TEXT,
        prev_hash TEXT NOT NULL,
        hash TEXT NOT NULL
      );
   CREATE TABLE download_serials (
        serial TEXT PRIMARY KEY,
        user_id INTEGER,
        device TEXT,
        ip TEXT,
        kind TEXT,
        format TEXT,
        design TEXT,
        engine TEXT,
        params TEXT,
        created_at INTEGER NOT NULL
      );
   CREATE INDEX download_serials_user ON download_serials (user_id, created_at);
   CREATE TABLE engine_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        calls INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER
      , revoked_at INTEGER, key_hint TEXT, allow_ips TEXT);
   CREATE INDEX engine_keys_user ON engine_keys (user_id);
   CREATE TABLE tool_library (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL DEFAULT '',
        ai_label TEXT NOT NULL DEFAULT '',
        length_mm REAL NOT NULL,
        width_mm REAL NOT NULL,
        area_mm2 REAL NOT NULL,
        polygon TEXT NOT NULL,
        seen INTEGER NOT NULL DEFAULT 1,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL
      , folder TEXT NOT NULL DEFAULT '');
   CREATE INDEX tool_library_size ON tool_library (length_mm, width_mm);
   CREATE TABLE trace_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        test INTEGER NOT NULL DEFAULT 0,
        quota INTEGER NOT NULL DEFAULT 500,
        month TEXT NOT NULL DEFAULT '',
        used INTEGER NOT NULL DEFAULT 0,
        calls INTEGER NOT NULL DEFAULT 0,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER,
        revoked_at INTEGER
      , key_hint TEXT, allow_ips TEXT);
   CREATE TABLE api_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id TEXT NOT NULL,
        at INTEGER NOT NULL,
        api TEXT NOT NULL,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        status INTEGER,
        ms INTEGER,
        bytes INTEGER,
        key_type TEXT,
        key_id INTEGER,
        key_hint TEXT,
        user_id INTEGER,
        ip TEXT,
        ua TEXT,
        kind TEXT,
        format TEXT,
        serial TEXT,
        error TEXT,
        params TEXT
      );
   CREATE INDEX api_requests_at ON api_requests (at);
   CREATE INDEX api_requests_key ON api_requests (key_type, key_id, at);
   CREATE INDEX api_requests_user ON api_requests (user_id, at);
   CREATE INDEX api_requests_serial ON api_requests (serial);
   CREATE INDEX api_requests_rid ON api_requests (request_id);
   CREATE TABLE api_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at INTEGER NOT NULL,
        kind TEXT NOT NULL,
        subject TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'warn',
        key_type TEXT,
        key_id INTEGER,
        user_id INTEGER,
        ip TEXT,
        title TEXT NOT NULL,
        detail TEXT,
        acked_at INTEGER,
        acked_by INTEGER
      );
   CREATE INDEX api_alerts_at ON api_alerts (at);
   CREATE INDEX api_alerts_subject ON api_alerts (kind, subject, at);
   CREATE TABLE api_blocks (
        ip TEXT PRIMARY KEY,
        reason TEXT,
        created_at INTEGER NOT NULL,
        created_by INTEGER,
        until INTEGER
      );
   CREATE TABLE api_webhooks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        secret TEXT NOT NULL,
        events TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        disabled_at INTEGER
      );
   CREATE INDEX api_webhooks_user ON api_webhooks (user_id);
   CREATE TABLE api_webhook_deliveries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        webhook_id INTEGER NOT NULL REFERENCES api_webhooks(id) ON DELETE CASCADE,
        event_id TEXT NOT NULL,
        event TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        next_at INTEGER,
        response_code INTEGER,
        last_error TEXT,
        created_at INTEGER NOT NULL,
        delivered_at INTEGER
      );
   CREATE INDEX api_webhook_deliveries_due ON api_webhook_deliveries (status, next_at);
   CREATE INDEX api_webhook_deliveries_hook ON api_webhook_deliveries (webhook_id, id);
   CREATE TRIGGER api_forget_user AFTER DELETE ON users BEGIN
        UPDATE api_requests SET user_id = NULL, ip = NULL, ua = NULL, params = NULL WHERE user_id = old.id;
        UPDATE api_alerts SET user_id = NULL, ip = NULL WHERE user_id = old.id;
      END;
   CREATE TABLE api_status_samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at INTEGER NOT NULL,
        component TEXT NOT NULL,
        ok INTEGER NOT NULL,
        ms INTEGER,
        note TEXT
      );
   CREATE INDEX api_status_samples_at ON api_status_samples (component, at);
   CREATE TABLE api_incidents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        impact TEXT NOT NULL DEFAULT 'minor',
        status TEXT NOT NULL DEFAULT 'investigating',
        components TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        resolved_at INTEGER,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
      );
   CREATE TABLE api_incident_updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        incident_id INTEGER NOT NULL REFERENCES api_incidents(id) ON DELETE CASCADE,
        at INTEGER NOT NULL,
        status TEXT NOT NULL,
        body TEXT NOT NULL,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
      );
   CREATE INDEX api_incident_updates_incident ON api_incident_updates (incident_id, at);
   CREATE TABLE api_plan_subs (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        plan TEXT NOT NULL,
        status TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_id TEXT,
        customer TEXT,
        period_end INTEGER,
        cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
        note TEXT,
        started_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
   CREATE TABLE api_overage (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day TEXT NOT NULL,
        plan TEXT NOT NULL,
        calls INTEGER NOT NULL DEFAULT 0,
        cents INTEGER NOT NULL DEFAULT 0,
        billed_at INTEGER,
        invoice_item TEXT,
        PRIMARY KEY (user_id, day)
      );
`,
  // Education plan applications: a school, college or university asks, staff check the proof and decide.
  `CREATE TABLE edu_applications (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     institution TEXT NOT NULL,
     kind TEXT NOT NULL,
     country TEXT NOT NULL,
     region TEXT,
     website TEXT,
     address TEXT,
     contact_name TEXT NOT NULL,
     contact_role TEXT NOT NULL,
     contact_email TEXT NOT NULL,
     contact_phone TEXT,
     students INTEGER,
     levels TEXT,
     use TEXT NOT NULL,
     proof TEXT NOT NULL,
     files TEXT NOT NULL DEFAULT '[]',
     status TEXT NOT NULL DEFAULT 'pending',
     decision_plan TEXT,
     decision_note TEXT,
     reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
     reviewed_at INTEGER,
     files_deleted_at INTEGER,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE INDEX edu_applications_user ON edu_applications (user_id, created_at);
   CREATE INDEX edu_applications_status ON edu_applications (status, created_at);`,
  // Marketing: page views (no cookies; a daily-salted visitor hash for unique counts),
  // short links you post elsewhere (MakerWorld, socials) and the media library.
  `CREATE TABLE page_views (
     id INTEGER PRIMARY KEY,
     at INTEGER NOT NULL,
     path TEXT NOT NULL,
     ref TEXT,
     source TEXT,
     medium TEXT,
     campaign TEXT,
     device TEXT,
     browser TEXT,
     country TEXT,
     visitor TEXT,
     ms INTEGER
   );
   CREATE INDEX page_views_at ON page_views (at);
   CREATE TABLE short_links (
     code TEXT PRIMARY KEY,
     target TEXT NOT NULL,
     label TEXT,
     source TEXT,
     campaign TEXT,
     clicks INTEGER NOT NULL DEFAULT 0,
     created_by INTEGER,
     created_at INTEGER NOT NULL,
     last_click_at INTEGER
   );
   CREATE TABLE media (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     type TEXT NOT NULL,
     bytes INTEGER NOT NULL,
     note TEXT,
     created_by INTEGER,
     created_at INTEGER NOT NULL
   );`,
  // Print AI: how prints went after a check (so the checks learn), and photos members chose to share.
  `CREATE TABLE print_ai_outcomes (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
     key_id INTEGER,
     kind TEXT NOT NULL,
     job TEXT,
     result TEXT NOT NULL,
     finding TEXT,
     fixed_by TEXT,
     context TEXT,
     note TEXT,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX print_ai_outcomes_at ON print_ai_outcomes (created_at);`,
  // Per-key limits: calls a day, and a monthly limit on extra (billed) use; each key's use by day.
  `ALTER TABLE engine_keys ADD COLUMN day_cap INTEGER;
   ALTER TABLE engine_keys ADD COLUMN month_cap_cents INTEGER;
   CREATE TABLE api_key_days (
     key_id INTEGER NOT NULL,
     day TEXT NOT NULL,
     calls INTEGER NOT NULL DEFAULT 0,
     over_calls INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (key_id, day)
   );`,
  // Test keys (vx_test_…): checked like real calls, answered with test files, never counted.
  `ALTER TABLE engine_keys ADD COLUMN sandbox INTEGER NOT NULL DEFAULT 0;`,
  // Teams: shared keys on the owner's plan; owners and admins manage them, members use them.
  `CREATE TABLE teams (
     id INTEGER PRIMARY KEY,
     name TEXT NOT NULL,
     owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE team_members (
     team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     role TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     PRIMARY KEY (team_id, user_id)
   );
   CREATE INDEX team_members_user ON team_members (user_id);
   CREATE TABLE team_invites (
     id INTEGER PRIMARY KEY,
     team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     role TEXT NOT NULL,
     invited_by INTEGER,
     created_at INTEGER NOT NULL,
     UNIQUE (team_id, user_id)
   );
   ALTER TABLE engine_keys ADD COLUMN team_id INTEGER;`,
  // Tracer API billing per photo: a price, free photos a month, and the account billed.
  `ALTER TABLE trace_keys ADD COLUMN cents_per_photo INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE trace_keys ADD COLUMN free_photos INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE trace_keys ADD COLUMN bill_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
   CREATE TABLE trace_bills (
     key_id INTEGER NOT NULL,
     month TEXT NOT NULL,
     photos INTEGER NOT NULL DEFAULT 0,
     cents INTEGER NOT NULL DEFAULT 0,
     billed_at INTEGER,
     invoice_item TEXT,
     PRIMARY KEY (key_id, month)
   );`,
  // Custom generators: recipes of engine parts, checked against the reference engine.
  `CREATE TABLE custom_generators (
     id TEXT PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     spec TEXT NOT NULL,
     check_json TEXT,
     score REAL NOT NULL DEFAULT 0,
     verified INTEGER NOT NULL DEFAULT 0,
     public INTEGER NOT NULL DEFAULT 0,
     uses INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE INDEX custom_generators_user ON custom_generators (user_id);`
];

export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const row = db.prepare('SELECT version FROM schema_version').get();
  let version = row ? row.version : 0;
  if (!row) db.prepare('INSERT INTO schema_version (version) VALUES (0)').run();
  for (; version < MIGRATIONS.length; version++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[version]);
      db.prepare('UPDATE schema_version SET version = ?').run(version + 1);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  return db;
}
