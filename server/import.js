// Once: the API's records from when it lived inside VERTEX (keys, the call
// log, alerts, blocks, webhooks, status history, incidents, plans, extra use,
// serials of files the API made, and the switches). VERTEX sends them over the
// link; rows already here are left as they are. Marked done in settings, so it
// never runs twice unless an owner presses the button in Admin → Settings.
export const IMPORT_TABLES = [
  'users', 'engine_keys', 'trace_keys', 'api_requests', 'api_alerts', 'api_blocks', 'api_webhooks', 'api_webhook_deliveries',
  'api_status_samples', 'api_incidents', 'api_incident_updates', 'api_plan_subs', 'api_overage', 'download_serials',
];
const KEEP_SETTINGS = ['api_plans', 'trace_api', 'api_controls'];

export async function importFromVertex({ db, link, force = false }) {
  if (!force && db.prepare("SELECT 1 FROM settings WHERE key = 'vertex_import'").get()) return { skipped: true };
  if (!link?.on()) return { skipped: false, done: false, reason: 'not linked' };
  const data = await link.exportData();
  const counts = {};
  db.exec('BEGIN');
  try {
    for (const table of IMPORT_TABLES) {
      const rows = Array.isArray(data.tables?.[table]) ? data.tables[table] : [];
      const cols = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
      let n = 0;
      for (const row of rows) {
        const keys = Object.keys(row).filter((k) => cols.has(k));
        if (!keys.length) continue;
        if (table === 'users') {
          row.synced_at = 0; // refreshed from VERTEX on first use
          if (!keys.includes('synced_at')) keys.push('synced_at');
          if (!keys.includes('created_at')) { row.created_at = Date.now(); keys.push('created_at'); }
        }
        n += Number(db.prepare(`INSERT OR IGNORE INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...keys.map((k) => row[k] ?? null)).changes);
      }
      counts[table] = n;
    }
    for (const [key, value] of Object.entries(data.settings || {})) {
      if (KEEP_SETTINGS.includes(key) && typeof value === 'string') db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING').run(key, value);
    }
    db.prepare("INSERT INTO settings (key, value) VALUES ('vertex_import', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify({ at: Date.now(), counts }));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { done: true, counts };
}
