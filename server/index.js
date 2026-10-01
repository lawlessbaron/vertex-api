// Start the API site: node server/index.js
import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { startMirror, restoreFromPostgres } from './pg-mirror.js';
import { ENGINE } from '../engine/engine.js';

const config = loadConfig();
// A new, empty volume with PostgreSQL connected: rebuild the database from PostgreSQL first.
if (config.databaseUrl) {
  try {
    const r = await restoreFromPostgres({ databasePath: config.databasePath, url: config.databaseUrl });
    if (!r.restored && r.reason !== 'the site already has a database') console.log(`PostgreSQL restore skipped: ${r.reason}.`);
  } catch (e) { console.error(`PostgreSQL restore failed: ${e.message}`); }
}
const app = createApp(config);
const mirror = config.databaseUrl ? startMirror({ db: app.db, url: config.databaseUrl }) : null;
app.schedule();
app.server.listen(config.port, config.host, () => {
  console.log(`Mint Motive API running at ${config.publicUrl} (port ${config.port}), engine ${ENGINE.version}`);
  if (!config.linkSecret) console.log('Not linked to VERTEX yet: set VERTEX_URL and API_LINK_SECRET (the same secret on both services).');
});

let stopping = false;
function shutdown(why) {
  if (stopping) return;
  stopping = true;
  console.log(`Shutting down (${why})`);
  app.close();
  app.server.close(async () => {
    try { await mirror?.stop(3000); } catch { /* best effort */ }
    try { app.db.close(); } catch { /* already closed */ }
    process.exit(0);
  });
  app.server.closeIdleConnections?.();
  setTimeout(() => process.exit(0), 10e3).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
