// Marketing for the API site: who visits and where they came from (counted
// here, no cookies, no third-party script), how the site does in Google search
// (Search Console, once connected), short links to post elsewhere (MakerWorld,
// socials, emails) that count their clicks, and a media library for the demo
// videos and images.
//
// Visitors are counted with a hash of their address, browser and the day,
// salted with a secret that changes daily, so one person is one visitor for a
// day and can't be followed from one day to the next.
import { createHash, createSign, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, rmSync, existsSync, createReadStream, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { HttpError } from './security.js';

const DAY = 864e5;
const KEEP_VIEWS = 400 * DAY;
const MEDIA_TYPES = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.pdf': 'application/pdf', '.svg': 'image/svg+xml' };
const MAX_MEDIA = 300 * 1024 * 1024;

const BOTS = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|pingdom|uptime/i;
export function deviceOf(ua = '') { return /ipad|tablet/i.test(ua) ? 'tablet' : /mobi|iphone|android/i.test(ua) ? 'phone' : 'desktop'; }
export function browserOf(ua = '') { return /edg\//i.test(ua) ? 'Edge' : /opr\/|opera/i.test(ua) ? 'Opera' : /firefox/i.test(ua) ? 'Firefox' : /chrome|crios/i.test(ua) ? 'Chrome' : /safari/i.test(ua) ? 'Safari' : 'Other'; }
// Where a visit came from: a tagged link first, then the referring site.
export function sourceOf(ref, utm = {}) {
  if (utm.source) return String(utm.source).toLowerCase().slice(0, 60);
  if (!ref) return 'direct';
  let host = '';
  try { host = new URL(ref).hostname.replace(/^www\./, ''); } catch { return 'direct'; }
  const known = [[/google\./, 'google'], [/bing\.com/, 'bing'], [/duckduckgo/, 'duckduckgo'], [/makerworld/, 'makerworld'], [/printables/, 'printables'], [/thingiverse/, 'thingiverse'], [/reddit/, 'reddit'], [/youtube|youtu\.be/, 'youtube'], [/facebook|fb\.com/, 'facebook'], [/instagram/, 'instagram'], [/t\.co$|twitter|x\.com/, 'x'], [/discord/, 'discord'], [/linkedin/, 'linkedin'], [/github/, 'github'], [/mintmotive/, 'mint motive']];
  for (const [re, name] of known) if (re.test(host)) return name;
  return host.slice(0, 60);
}

export function createMarketing({ db, dir, config, audit, now = () => Date.now() }) {
  const mediaDir = join(dir, 'media');
  mkdirSync(mediaDir, { recursive: true });
  let salt = { day: '', value: '' };
  const daySalt = () => {
    const d = new Date(now()).toISOString().slice(0, 10);
    if (salt.day !== d) salt = { day: d, value: randomBytes(16).toString('hex') };
    return salt.value;
  };

  // ---------- page views ----------
  function view({ path, ref, utm = {}, ms }, { ip, ua, lang }) {
    if (!path || BOTS.test(ua || '')) return false;
    const p = String(path).split('?')[0].slice(0, 200);
    if (/^\/(admin|api|auth)/.test(p)) return false; // staff pages and the API itself aren't traffic
    let refHost = null;
    try { if (ref) { const u = new URL(ref); if (!u.hostname.endsWith(new URL(config.publicUrl).hostname)) refHost = u.origin + u.pathname.slice(0, 120); } } catch { /* not a URL */ }
    const country = (String(lang || '').match(/^[a-z]{2}-([A-Z]{2})/) || [])[1] || null;
    db.prepare('INSERT INTO page_views (at, path, ref, source, medium, campaign, device, browser, country, visitor, ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      now(), p, refHost, sourceOf(refHost, utm), utm.medium ? String(utm.medium).slice(0, 40) : null, utm.campaign ? String(utm.campaign).slice(0, 80) : null,
      deviceOf(ua), browserOf(ua), country, createHash('sha256').update(`${daySalt()}|${ip}|${ua}`).digest('hex').slice(0, 20), Number.isFinite(ms) ? Math.max(0, Math.min(60000, Math.round(ms))) : null);
    return true;
  }
  function traffic(days = 30) {
    const since = now() - days * DAY, prevSince = since - days * DAY;
    const tot = db.prepare('SELECT COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors FROM page_views WHERE at >= ?').get(since);
    const prev = db.prepare('SELECT COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors FROM page_views WHERE at >= ? AND at < ?').get(prevSince, since);
    const group = (col, n = 12) => db.prepare(`SELECT ${col} AS name, COUNT(*) AS n, COUNT(DISTINCT visitor) AS visitors FROM page_views WHERE at >= ? AND ${col} IS NOT NULL GROUP BY ${col} ORDER BY n DESC LIMIT ${n}`).all(since);
    const load = db.prepare('SELECT ms FROM page_views WHERE at >= ? AND ms IS NOT NULL ORDER BY ms').all(since).map((r) => r.ms);
    return {
      days,
      totals: { views: tot.views, visitors: tot.visitors, loadP50: load.length ? load[Math.floor(load.length / 2)] : null, loadP95: load.length ? load[Math.min(load.length - 1, Math.floor(load.length * 0.95))] : null },
      prev,
      byDay: db.prepare("SELECT date(at / 1000, 'unixepoch') AS day, COUNT(*) AS calls, COUNT(DISTINCT visitor) AS errors FROM page_views WHERE at >= ? GROUP BY day ORDER BY day").all(since),
      pages: group('path', 15), sources: group('source'), referrers: group('ref', 10), campaigns: group('campaign', 10), devices: group('device', 4), browsers: group('browser', 6), countries: group('country', 10),
    };
  }

  // ---------- short links ----------
  const CODE = /^[a-z0-9-]{2,40}$/;
  function links() { return db.prepare('SELECT * FROM short_links ORDER BY created_at DESC LIMIT 200').all(); }
  function addLink(me, { code, target, label, source, campaign }, ip) {
    code = String(code || '').trim().toLowerCase() || randomBytes(3).toString('hex');
    if (!CODE.test(code)) throw new HttpError(400, 'Codes are 2–40 letters, numbers or dashes.');
    let url;
    try { url = new URL(String(target || ''), config.publicUrl); } catch { throw new HttpError(400, 'That address doesn’t look right.'); }
    if (!/^https?:$/.test(url.protocol)) throw new HttpError(400, 'Links go to web pages only.');
    if (db.prepare('SELECT 1 FROM short_links WHERE code = ?').get(code)) throw new HttpError(409, 'That code is taken.');
    db.prepare('INSERT INTO short_links (code, target, label, source, campaign, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(code, url.toString(), String(label || '').slice(0, 120) || null, String(source || '').slice(0, 40) || null, String(campaign || '').slice(0, 80) || null, me.id, now());
    audit?.log(me, 'marketing.link', code, { target: url.toString() }, ip);
    return db.prepare('SELECT * FROM short_links WHERE code = ?').get(code);
  }
  function removeLink(me, code, ip) { db.prepare('DELETE FROM short_links WHERE code = ?').run(String(code)); audit?.log(me, 'marketing.link.remove', String(code), {}, ip); }
  // GET /l/:code → the target, tagged so the visit counts against the link.
  function follow(code) {
    const l = db.prepare('SELECT * FROM short_links WHERE code = ?').get(String(code).toLowerCase());
    if (!l) return null;
    db.prepare('UPDATE short_links SET clicks = clicks + 1, last_click_at = ? WHERE code = ?').run(now(), l.code);
    const u = new URL(l.target);
    if (u.origin === new URL(config.publicUrl).origin || /mintmotive\.com\.au$/.test(u.hostname)) {
      if (l.source && !u.searchParams.has('utm_source')) u.searchParams.set('utm_source', l.source);
      if (!u.searchParams.has('utm_medium')) u.searchParams.set('utm_medium', 'link');
      if (!u.searchParams.has('utm_campaign')) u.searchParams.set('utm_campaign', l.campaign || l.code);
    }
    return u.toString();
  }

  // ---------- media library ----------
  function mediaList() { return db.prepare('SELECT * FROM media ORDER BY created_at DESC').all().map((m) => ({ ...m, url: `/media/${m.id}${extname(m.name).toLowerCase()}` })); }
  async function upload(me, req, name, ip) {
    const ext = extname(String(name || '')).toLowerCase();
    if (!MEDIA_TYPES[ext]) throw new HttpError(415, 'Videos (MP4, WebM, MOV), images (PNG, JPEG, WebP, GIF, SVG) or PDFs.');
    const id = randomBytes(8).toString('hex');
    const file = join(mediaDir, id + ext);
    let size = 0;
    const chunks = [];
    for await (const c of req) { size += c.length; if (size > MAX_MEDIA) throw new HttpError(413, 'Up to 300 MB a file.'); chunks.push(c); }
    if (!size) throw new HttpError(400, 'The file is empty.');
    writeFileSync(file, Buffer.concat(chunks));
    db.prepare('INSERT INTO media (id, name, type, bytes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, String(name).slice(0, 160), MEDIA_TYPES[ext], size, me.id, now());
    audit?.log(me, 'marketing.media', id, { name, bytes: size }, ip);
    return mediaList().find((m) => m.id === id);
  }
  function removeMedia(me, id, ip) {
    const m = db.prepare('SELECT * FROM media WHERE id = ?').get(String(id));
    if (!m) throw new HttpError(404, 'No such file.');
    rmSync(join(mediaDir, m.id + extname(m.name).toLowerCase()), { force: true });
    db.prepare('DELETE FROM media WHERE id = ?').run(m.id);
    audit?.log(me, 'marketing.media.remove', m.id, { name: m.name }, ip);
  }
  // GET /media/<id>.<ext>: public, so a video can be linked or embedded; byte ranges for video scrubbing.
  function serveMedia(req, res, file) {
    const m = file.match(/^([0-9a-f]{16})(\.[a-z0-9]+)$/);
    if (!m) return false;
    const path = join(mediaDir, m[1] + m[2]);
    if (!existsSync(path)) return false;
    const size = statSync(path).size, type = MEDIA_TYPES[m[2]] || 'application/octet-stream';
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (range) {
      const start = range[1] ? Number(range[1]) : 0, end = range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Cache-Control': 'public, max-age=86400' });
      createReadStream(path, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=86400' });
      createReadStream(path).pipe(res);
    }
    return true;
  }

  // ---------- Google Search Console ----------
  // Set GSC_CLIENT_EMAIL and GSC_PRIVATE_KEY (a Google Cloud service account that's
  // been added as a user on the Search Console property) and GSC_SITE
  // (sc-domain:mintmotive.com.au, or the URL-prefix property).
  const gsc = { token: null, exp: 0, cache: new Map() };
  const gscReady = () => Boolean(process.env.GSC_CLIENT_EMAIL && process.env.GSC_PRIVATE_KEY && process.env.GSC_SITE);
  async function gscToken() {
    if (gsc.token && gsc.exp > now() + 60e3) return gsc.token;
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const iat = Math.floor(now() / 1000);
    const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: process.env.GSC_CLIENT_EMAIL, scope: 'https://www.googleapis.com/auth/webmasters.readonly', aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 })}`;
    const sig = createSign('RSA-SHA256').update(unsigned).sign(process.env.GSC_PRIVATE_KEY.replace(/\\n/g, '\n'), 'base64url');
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }) });
    const j = await r.json();
    if (!r.ok) throw new HttpError(502, `Google sign-in failed: ${j.error_description || j.error || r.status}`);
    gsc.token = j.access_token; gsc.exp = now() + (j.expires_in || 3600) * 1000;
    return gsc.token;
  }
  async function search(days = 28) {
    if (!gscReady()) return { connected: false };
    const key = String(days);
    const hit = gsc.cache.get(key);
    if (hit && hit.at > now() - 3600e3) return hit.data;
    const token = await gscToken();
    const end = new Date(now() - 2 * DAY).toISOString().slice(0, 10), start = new Date(now() - (days + 2) * DAY).toISOString().slice(0, 10);
    const q = async (dimensions, rowLimit = 25) => {
      const r = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(process.env.GSC_SITE)}/searchAnalytics/query`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ startDate: start, endDate: end, dimensions, rowLimit }) });
      const j = await r.json();
      if (!r.ok) throw new HttpError(502, `Search Console: ${j.error?.message || r.status}`);
      return (j.rows || []).map((x) => ({ keys: x.keys, clicks: x.clicks, impressions: x.impressions, ctr: x.ctr, position: x.position }));
    };
    const [byDate, queries, pages, countries] = await Promise.all([q(['date'], 500), q(['query']), q(['page']), q(['country'], 10)]);
    const sum = byDate.reduce((a, r) => ({ clicks: a.clicks + r.clicks, impressions: a.impressions + r.impressions, pos: a.pos + r.position * r.impressions }), { clicks: 0, impressions: 0, pos: 0 });
    const data = { connected: true, site: process.env.GSC_SITE, start, end, totals: { clicks: sum.clicks, impressions: sum.impressions, ctr: sum.impressions ? sum.clicks / sum.impressions : 0, position: sum.impressions ? sum.pos / sum.impressions : null }, byDate: byDate.map((r) => ({ day: r.keys[0], calls: r.impressions, errors: r.clicks })), queries, pages, countries };
    gsc.cache.set(key, { at: now(), data });
    return data;
  }

  const prune = () => db.prepare('DELETE FROM page_views WHERE at < ?').run(now() - KEEP_VIEWS).changes;
  return { view, traffic, links, addLink, removeLink, follow, mediaList, upload, removeMedia, serveMedia, search, gscReady, prune };
}
