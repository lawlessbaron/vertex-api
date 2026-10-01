// The API status page: is each part of the API working, how has it been over
// the last 90 days, and what's gone wrong. Every five minutes the site checks
// itself (it builds a small model, reads the database, looks at the webhook
// queue); the tracer's real outcomes count too, and so do the server errors
// real callers got. Incidents are written by staff in the API admin, with a
// trail of updates, and go out to developers' webhooks.
import { HttpError } from './security.js';
import { buildParts } from '../engine/models.js';

const DAY = 86400e3;
const KEEP = 120 * DAY;
export const STATUS_COMPONENTS = {
  engine: { name: 'Engine API', about: 'Models from settings: bins, baseplates, holders and more.' },
  tracer: { name: 'Tracer API', about: 'Tool outlines from photos, for partners.' },
  webhooks: { name: 'Webhooks', about: 'Signed messages to your server.' },
  console: { name: 'Console and docs', about: 'This site: keys, the call log and the docs.' },
};
export const INCIDENT_STATUSES = ['investigating', 'identified', 'monitoring', 'resolved'];
export const IMPACTS = ['minor', 'major', 'critical'];
const RANK = { operational: 0, nodata: 0, off: 0, maintenance: 1, degraded: 2, partial: 3, outage: 4 };

// A day's state from the share of checks (and calls) that worked.
export function dayState(ok, total) {
  if (!total) return 'nodata';
  const r = ok / total;
  return r >= 0.995 ? 'operational' : r >= 0.95 ? 'degraded' : r >= 0.75 ? 'partial' : 'outage';
}

export function createApiStatus({ db, controls, traceOn = () => false, onIncident = () => {}, now = () => Date.now() }) {
  const insert = db.prepare('INSERT INTO api_status_samples (at, component, ok, ms, note) VALUES (?, ?, ?, ?, ?)');
  const record = (component, ok, ms = null, note = null) => insert.run(now(), component, ok ? 1 : 0, ms == null ? null : Math.round(ms), note ? String(note).slice(0, 200) : null);

  // ---------- checking ourselves ----------
  function probe() {
    // The engine: build the smallest bin there is, the same way a call does.
    if (!controls.isOff('engineApi')) {
      const t0 = performance.now();
      try {
        const parts = buildParts('bin', { gridX: 1, gridY: 1, heightUnits: 2 });
        record('engine', parts?.length > 0, performance.now() - t0, parts?.length ? null : 'made nothing');
      } catch (e) { record('engine', false, performance.now() - t0, e.message); }
    }
    // The site: the database answers.
    const t1 = performance.now();
    try { db.prepare('SELECT 1').get(); record('console', true, performance.now() - t1); } catch (e) { record('console', false, null, e.message); }
    // Webhooks: nothing has been waiting more than ten minutes past its time.
    const stuck = db.prepare("SELECT COUNT(*) AS n FROM api_webhook_deliveries WHERE status = 'pending' AND next_at < ?").get(now() - 10 * 60e3).n;
    record('webhooks', stuck === 0, null, stuck ? `${stuck} deliveries waiting` : null);
    db.prepare('DELETE FROM api_status_samples WHERE at < ?').run(now() - KEEP);
  }

  // ---------- reading it back ----------
  const isOff = (key) => (key === 'engine' ? controls.isOff('engineApi') : key === 'tracer' ? !traceOn() : false);
  function days(key, n = 90) {
    const since = now() - n * DAY;
    const map = new Map();
    const add = (day, ok, total) => { const d = map.get(day) || { ok: 0, total: 0 }; d.ok += ok; d.total += total; map.set(day, d); };
    for (const r of db.prepare("SELECT date(at / 1000, 'unixepoch') AS day, SUM(ok) AS ok, COUNT(*) AS total FROM api_status_samples WHERE component = ? AND at >= ? GROUP BY day").all(key, since)) add(r.day, r.ok, r.total);
    // Real callers: a 5xx counts against the day (their own mistakes, 4xx, don't).
    if (key === 'engine' || key === 'tracer') {
      for (const r of db.prepare("SELECT date(at / 1000, 'unixepoch') AS day, SUM(status < 500 OR status = 503) AS ok, COUNT(*) AS total FROM api_requests WHERE api = ? AND at >= ? GROUP BY day").all(key, since)) add(r.day, r.ok, r.total);
    }
    // Incidents that touched this part darken their days.
    const inc = db.prepare("SELECT impact, created_at, COALESCE(resolved_at, ?) AS end FROM api_incidents WHERE (',' || components || ',') LIKE ? AND COALESCE(resolved_at, ?) >= ?").all(now(), `%,${key},%`, now(), since);
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const day = new Date(now() - i * DAY).toISOString().slice(0, 10);
      const d = map.get(day) || { ok: 0, total: 0 };
      let state = dayState(d.ok, d.total);
      const start = Date.parse(`${day}T00:00:00Z`), end = start + DAY;
      for (const x of inc) if (x.created_at < end && x.end >= start) {
        const s = x.impact === 'critical' ? 'outage' : x.impact === 'major' ? 'partial' : 'degraded';
        if (RANK[s] > RANK[state]) state = s;
      }
      out.push({ day, state, ok: d.ok, total: d.total });
    }
    return out;
  }
  function component(key) {
    const list = days(key);
    const counted = list.reduce((a, d) => ({ ok: a.ok + d.ok, total: a.total + d.total }), { ok: 0, total: 0 });
    const last = db.prepare('SELECT ok, at, note FROM api_status_samples WHERE component = ? ORDER BY at DESC, id DESC LIMIT 3').all(key);
    const open = db.prepare("SELECT impact FROM api_incidents WHERE resolved_at IS NULL AND (',' || components || ',') LIKE ?").all(`%,${key},%`);
    const recent = db.prepare("SELECT ms FROM api_requests WHERE api = ? AND at > ? AND status < 400 ORDER BY ms").all(key === 'tracer' ? 'trace' : key, now() - DAY).map((r) => r.ms || 0);
    let state = 'operational';
    if (isOff(key)) state = 'off';
    else if (last.length && last.every((s) => !s.ok)) state = 'outage';
    else if (last.length && !last[0].ok) state = 'degraded';
    for (const o of open) { const s = o.impact === 'critical' ? 'outage' : o.impact === 'major' ? 'partial' : 'degraded'; if (RANK[s] > RANK[state]) state = s; }
    return {
      key, ...STATUS_COMPONENTS[key], state,
      uptime: counted.total ? Math.round((counted.ok / counted.total) * 100000) / 1000 : null,
      p95: recent.length ? recent[Math.min(recent.length - 1, Math.floor(recent.length * 0.95))] : null,
      checkedAt: last[0]?.at || null,
      days: list,
    };
  }

  const incidentOut = (i) => ({
    id: i.id, title: i.title, impact: i.impact, status: i.status, components: i.components ? i.components.split(',') : [], createdAt: i.created_at, resolvedAt: i.resolved_at,
    updates: db.prepare('SELECT id, at, status, body FROM api_incident_updates WHERE incident_id = ? ORDER BY at DESC, id DESC').all(i.id),
  });
  const incidents = ({ days: n = 90 } = {}) => db.prepare('SELECT * FROM api_incidents WHERE resolved_at IS NULL OR resolved_at >= ? ORDER BY resolved_at IS NOT NULL, created_at DESC LIMIT 100').all(now() - n * DAY).map(incidentOut);

  function summary() {
    const comps = Object.keys(STATUS_COMPONENTS).map(component);
    const live = comps.filter((c) => c.state !== 'off');
    const worst = live.reduce((w, c) => (RANK[c.state] > RANK[w] ? c.state : w), 'operational');
    const list = incidents();
    return {
      overall: worst, updatedAt: now(),
      components: comps,
      active: list.filter((i) => !i.resolvedAt),
      history: list.filter((i) => i.resolvedAt),
    };
  }

  // ---------- incidents (staff) ----------
  const clean = (v, n) => String(v ?? '').trim().slice(0, n);
  function openIncident(user, body = {}) {
    const title = clean(body.title, 160);
    if (!title) throw new HttpError(400, 'Give the incident a title.');
    const impact = IMPACTS.includes(body.impact) ? body.impact : 'minor';
    const status = INCIDENT_STATUSES.includes(body.status) && body.status !== 'resolved' ? body.status : 'investigating';
    const comps = (Array.isArray(body.components) ? body.components : []).filter((c) => STATUS_COMPONENTS[c]);
    if (!comps.length) throw new HttpError(400, 'Pick what it affects.');
    const text = clean(body.body, 4000);
    if (!text) throw new HttpError(400, 'Say what people are seeing.');
    const id = Number(db.prepare('INSERT INTO api_incidents (title, impact, status, components, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)').run(title, impact, status, comps.join(','), now(), user?.id ?? null).lastInsertRowid);
    db.prepare('INSERT INTO api_incident_updates (incident_id, at, status, body, created_by) VALUES (?, ?, ?, ?, ?)').run(id, now(), status, text, user?.id ?? null);
    const out = incidentOut(db.prepare('SELECT * FROM api_incidents WHERE id = ?').get(id));
    onIncident(out, out.updates[0]);
    return out;
  }
  function updateIncident(user, id, body = {}) {
    const i = db.prepare('SELECT * FROM api_incidents WHERE id = ?').get(Number(id));
    if (!i) throw new HttpError(404, 'No incident with that id.');
    if (i.resolved_at) throw new HttpError(409, 'That incident is resolved. Open a new one.');
    const status = INCIDENT_STATUSES.includes(body.status) ? body.status : i.status;
    const text = clean(body.body, 4000);
    if (!text) throw new HttpError(400, 'Say what changed.');
    const impact = IMPACTS.includes(body.impact) ? body.impact : i.impact;
    db.prepare('UPDATE api_incidents SET status = ?, impact = ?, resolved_at = ? WHERE id = ?').run(status, impact, status === 'resolved' ? now() : null, i.id);
    db.prepare('INSERT INTO api_incident_updates (incident_id, at, status, body, created_by) VALUES (?, ?, ?, ?, ?)').run(i.id, now(), status, text, user?.id ?? null);
    const out = incidentOut(db.prepare('SELECT * FROM api_incidents WHERE id = ?').get(i.id));
    onIncident(out, out.updates[0]);
    return out;
  }

  // ---------- RSS, for readers and chat integrations ----------
  function rss(origin) {
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
    const items = db.prepare('SELECT u.*, i.title FROM api_incident_updates u JOIN api_incidents i ON i.id = u.incident_id ORDER BY u.at DESC LIMIT 50').all();
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Mint Motive API status</title><link>${esc(origin)}/status</link><description>Incidents and updates for the Mint Motive API.</description>
${items.map((u) => `<item><title>${esc(`${u.title}: ${u.status}`)}</title><link>${esc(origin)}/status#incident-${u.incident_id}</link><guid isPermaLink="false">mm-incident-${u.incident_id}-${u.id}</guid><pubDate>${new Date(u.at).toUTCString()}</pubDate><description>${esc(u.body)}</description></item>`).join('\n')}
</channel></rss>`;
  }

  return { probe, record, summary, component, days, incidents, openIncident, updateIncident, rss };
}
