// The Mint Motive API site: the engine and tracer APIs, the developer portal,
// docs, status page, developer console and the staff admin. Its own server,
// database and sessions; accounts stay on VERTEX (link.js), and alerts go
// back to VERTEX staff.
//
//   /            the portal          /docs     the docs        /status  status page
//   /console     your keys and calls /admin    staff backend   /signin  sign in with VERTEX
//   /engine/v1/… and /trace/v1/…     the APIs (also under /api/engine/v1 and /api/trace/v1)
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './db.js';
import { SESSION_COOKIE, clearCookie, createSession, destroySession, parseCookies, sessionCookie, sessionUser } from './auth.js';
import { HttpError, RateLimiter, clientIp, readJson, sameOrigin, securityHeaders } from './security.js';
import { compressFor } from './compress.js';
import { createAudit } from './audit.js';
import { can, isStaff } from './roles.js';
import { createLink } from './link.js';
import { createControls } from './controls.js';
import { createStripe } from './stripe.js';
import { createFonts } from './fonts.js';
import { createToolLibrary } from './tool-library.js';
import { createTraceApi } from './trace-api.js';
import { createApiLog } from './api-log.js';
import { createApiGuard, parseAllow } from './api-guard.js';
import { createApiWebhooks, WEBHOOK_EVENTS } from './api-webhooks.js';
import { createApiStatus, STATUS_COMPONENTS, INCIDENT_STATUSES, IMPACTS } from './api-status.js';
import { createApiPlans } from './api-plans.js';
import { createEngineApi } from './engine-api.js';
import { createTeams } from './teams.js';
import { createPrintAi } from './print-ai.js';
import { createChangelog } from './changelog.js';
import { importFromVertex } from './import.js';
import { createEducation, EDU_KINDS } from './education.js';
import { createMarketing } from './marketing.js';
import { ENGINE } from '../engine/engine.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const ENGINE_DIR = join(ROOT, 'engine');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.py': 'text/x-python; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};
// Pages: clean paths on this site. The old /api-portal paths (from when it lived inside VERTEX) move here.
export const PAGES = { '/': 'api-portal', '/docs': 'api-docs', '/console': 'dev-console', '/admin': 'api-admin', '/signin': 'api-signin', '/status': 'api-status', '/education': 'education' };
// VERTEX pages the portal links to: sent on to VERTEX.
const VERTEX_PAGES = new Set(['/signup', '/login', '/reset', '/account', '/licences', '/privacy', '/terms', '/contact', '/vertex', '/generators', '/create', '/forum']);
const STATE_COOKIE = 'mm_api_state';
const SYNC_EVERY = 15 * 60e3;

// VX-2609-7K3M-Q9TD: year and month, then 40 random bits in Crockford base 32 (the same as VERTEX's).
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function newSerial(now = new Date()) {
  let n = 0n;
  for (const b of randomBytes(5)) n = (n << 8n) | BigInt(b);
  let r = '';
  for (let i = 0; i < 8; i++) { r = CROCKFORD[Number(n & 31n)] + r; n >>= 5n; }
  return `VX-${String(now.getUTCFullYear()).slice(2)}${String(now.getUTCMonth() + 1).padStart(2, '0')}-${r.slice(0, 4)}-${r.slice(4)}`;
}

export function createApp(config) {
  const db = openDatabase(config.databasePath);
  const fetchImpl = config.fetchImpl || fetch;
  const audit = createAudit(db, config.databasePath);
  const link = config.link || createLink({ config, fetchImpl });
  const controls = createControls({ db, link });
  const stripe = createStripe({ db, config, fetchImpl });
  const fonts = createFonts({ dir: () => (config.databasePath === ':memory:' ? join(ROOT, 'data') : dirname(config.databasePath)), fetchImpl });
  const secure = config.secureCookies;
  const apiLimit = new RateLimiter(300, 60e3);
  const timers = [];
  const every = (ms, fn) => { const t = setInterval(() => { try { const p = fn(); p?.catch?.((e) => console.warn(e.message)); } catch (e) { console.warn(e.message); } }, ms); t.unref?.(); timers.push(t); };

  // Alerts reach VERTEX staff (bell, email, Discord), with a link back to this site's admin.
  const recent = new Map();
  const alerts = {
    send(kind, { title, body = '', link: path = '/admin', key = null } = {}) {
      if (key) { const last = recent.get(key); if (last && Date.now() - last < 10 * 60e3) return false; recent.set(key, Date.now()); }
      if (link.on()) link.alert({ kind, title, body, link: /^https?:/.test(path) ? path : `${config.publicUrl}${path}` });
      return true;
    },
  };

  const apiWebhooks = createApiWebhooks({ db, fetchImpl, allowPrivate: Boolean(config.webhooksAllowPrivate) });
  let apiPlans = null;
  const apiGuard = createApiGuard({ db, alerts, link: '/admin', onEvent: (userId, event, data) => apiWebhooks.emit(userId, event, data), perDayFor: (userId) => apiPlans?.planFor(userId).perDay ?? 1000 });
  let education = null, marketing = null;
  apiPlans = createApiPlans({ db, billing: stripe, audit, config, invitedTo: (userId, planId) => Boolean(education?.invitedTo(userId, planId)) });
  // Education plan applications (documents kept beside the database, deleted 30 days after the decision).
  education = createEducation({ db, dir: join(config.databasePath === ':memory:' ? join(ROOT, 'data') : dirname(config.databasePath), 'education'), audit, alerts, plans: apiPlans });
  marketing = createMarketing({ db, dir: config.databasePath === ':memory:' ? join(ROOT, 'data') : dirname(config.databasePath), config, audit });
  const teams = createTeams({ db });
  const engineApi = createEngineApi({ db, controls, analytics: null, isStaff, newSerial, plans: apiPlans, teams, onKey: (userId, event, data) => apiWebhooks.emit(userId, event, data) });
  let apiStatus = null;
  const toolLibrary = createToolLibrary({ db, can, audit, env: config.env || process.env, fetchImpl, onOutcome: (ok, ms, note) => apiStatus?.record('tracer', ok, ms, note) });
  const traceApi = createTraceApi({ db, can, audit, toolLibrary, newSerial });
  const changelog = createChangelog({ path: join(ROOT, 'CHANGELOG.md') });
  const printAi = createPrintAi({ db, isStaff, plans: apiPlans, audit, toolLibrary, env: config.env || process.env, fetchImpl });
  const apiLog = createApiLog({ db, onRecord: (row) => apiGuard.afterCall(row) });
  apiStatus = createApiStatus({
    db, controls, traceOn: () => traceApi.isOn(),
    onIncident: (inc, update) => apiWebhooks.broadcast('incident.updated', { incident: { id: inc.id, title: inc.title, impact: inc.impact, status: inc.status, components: inc.components, url: `${config.publicUrl}/status` }, update: { at: update.at, status: update.status, body: update.body } }),
  });

  // ---------- accounts, from VERTEX ----------
  function saveUser(u) {
    const now = Date.now();
    db.prepare(`INSERT INTO users (id, email, name, handle, role, stripe_customer_id, created_at, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name, handle = excluded.handle, role = excluded.role,
        stripe_customer_id = COALESCE(users.stripe_customer_id, excluded.stripe_customer_id), synced_at = excluded.synced_at`)
      .run(Number(u.id), String(u.email || ''), String(u.name || ''), u.handle || null, u.banned ? 'banned' : String(u.role || 'user'), u.stripeCustomerId || null, Number(u.createdAt) || now, now);
    if (u.banned) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(Number(u.id));
  }
  // An account deleted on VERTEX goes here too: keys, webhooks and sessions with it; call records are kept, anonymous.
  const forget = (id) => db.prepare('DELETE FROM users WHERE id = ?').run(Number(id));
  const syncing = new Set();
  async function sync(id) {
    if (syncing.has(id) || !link.on()) return;
    syncing.add(id);
    try {
      const r = await link.user(id);
      if (r.gone) forget(id); else saveUser(r.user);
    } catch (e) {
      if (e.status === 404) forget(id); else db.prepare('UPDATE users SET synced_at = ? WHERE id = ?').run(Date.now() - SYNC_EVERY + 60e3, id); // try again in a minute
    } finally { syncing.delete(id); }
  }
  // Developers with keys are kept in step even when they never open the console.
  every(60 * 60e3, async () => {
    for (const r of db.prepare('SELECT DISTINCT u.id FROM users u JOIN engine_keys k ON k.user_id = u.id WHERE k.revoked_at IS NULL AND u.synced_at < ? LIMIT 200').all(Date.now() - 6 * 3600e3)) await sync(r.id);
  });

  // ---------- helpers ----------
  function send(res, status, body, headers = {}) {
    if (status === 200 && body != null) {
      const packed = compressFor(res.req, body, headers);
      if (packed) { body = packed.body; headers = packed.headers; }
    }
    res.writeHead(status, headers);
    res.end(body);
  }
  const json = (res, status, data, headers = {}) => send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  const redirect = (res, to, status = 302, headers = {}) => { res.writeHead(status, { Location: to, 'Cache-Control': 'no-store', ...headers }); res.end(); };
  function requireUser(ctx, message = 'Sign in first.') {
    if (!ctx.user) throw new HttpError(401, message);
    return ctx.user;
  }
  function requireAdmin(ctx) {
    const u = requireUser(ctx, 'Sign in to open API admin.');
    if (!can(u, 'settings.manage')) throw new HttpError(403, 'Admins only.');
    if (controls.requireStaffMfa() && !u.mfa) throw new HttpError(403, 'Staff must sign in with two-factor authentication. Sign in to VERTEX with your code, then sign in here again.');
    return u;
  }
  const publicUser = (u) => (u ? { id: u.id, handle: u.handle, name: u.name, role: u.role, staff: isStaff(u), admin: can(u, 'settings.manage') } : null);
  const linkSecretOk = (req) => {
    const got = Buffer.from(String(req.headers.authorization || '').replace(/^Bearer /, ''));
    const want = Buffer.from(config.linkSecret || '');
    return want.length >= 24 && got.length === want.length && timingSafeEqual(got, want);
  };

  // ---------- pages and files ----------
  const pageCache = new Map();
  function page(name) {
    let html = pageCache.get(name);
    if (!html || process.env.NODE_ENV !== 'production') {
      html = readFileSync(join(ROOT, 'pages', `${name}.html`), 'utf8');
      pageCache.set(name, html);
    }
    html = html.replaceAll('{{year}}', String(new Date().getFullYear())).replaceAll('{{vertex}}', config.vertexUrl);
    html = html.replace(/<html\b([^>]*)>/, `<html$1 data-release="${attr(config.version)}">`);
    html = html.replace('</head>', `${headMeta(name, html)}\n${preloads(html)}\n  </head>`);
    return name === 'api-admin' ? html : html.replace('</body>', '  <script type="module" src="/js/site.js"></script>\n  </body>');
  }
  // Every module a page's scripts import, all asked for at once: without this
  // the browser finds them a level at a time (page → models.js → geometry →
  // primitives), one round trip per level, which is what makes the site slow
  // from far away.
  const graphCache = new Map();
  function jsFile(urlPath) {
    const pub = join(PUBLIC, urlPath);
    if (existsSync(pub)) return pub;
    const eng = join(ENGINE_DIR, urlPath.slice(3));
    return urlPath.startsWith('/js/') && existsSync(eng) ? eng : null;
  }
  function moduleGraph(entry, seen = new Set()) {
    if (seen.has(entry)) return seen;
    const file = jsFile(entry);
    if (!file) return seen;
    seen.add(entry);
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/^\s*(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm)) {
      const spec = m[1] || m[2];
      if (!/^(\.{1,2}\/|\/)/.test(spec)) continue;
      moduleGraph(new URL(spec, `http://x${entry}`).pathname, seen);
    }
    return seen;
  }
  function preloads(html) {
    const entries = [...html.matchAll(/<script type="module" src="(\/js\/[^"]+)"/g)].map((m) => m[1]);
    const key = entries.join('|');
    if (!graphCache.has(key) || process.env.NODE_ENV !== 'production') {
      const all = new Set();
      for (const e of entries) for (const f of moduleGraph(e)) all.add(f);
      graphCache.set(key, [...all].map((f) => `    <link rel="modulepreload" href="${attr(f)}" />`).join('\n'));
    }
    return graphCache.get(key);
  }
  // Share previews, search details and icons, from each page's own <title> and description.
  const PATH_OF = Object.fromEntries(Object.entries(PAGES).map(([path, page]) => [page, path]));
  const attr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  function headMeta(name, html) {
    const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || 'Mint Motive API';
    const description = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
    const url = `${config.publicUrl}${PATH_OF[name] || ''}`;
    const image = `${config.publicUrl}/img/og-api.png`;
    const indexed = !/name="robots" content="noindex"/.test(html);
    const tags = [
      ...(indexed && PATH_OF[name] ? [`<link rel="canonical" href="${attr(url)}" />`] : []),
      '<link rel="apple-touch-icon" href="/img/apple-touch-icon.png" />',
      '<meta property="og:site_name" content="Mint Motive API" />',
      '<meta property="og:type" content="website" />',
      `<meta property="og:title" content="${title}" />`,
      `<meta property="og:description" content="${description}" />`,
      `<meta property="og:url" content="${attr(url)}" />`,
      `<meta property="og:image" content="${attr(image)}" />`,
      '<meta property="og:image:width" content="1200" />',
      '<meta property="og:image:height" content="630" />',
      '<meta property="og:image:alt" content="Mint Motive API: print-ready models, from one call." />',
      '<meta property="og:locale" content="en_AU" />',
      '<meta name="twitter:card" content="summary_large_image" />',
      `<meta name="twitter:title" content="${title}" />`,
      `<meta name="twitter:description" content="${description}" />`,
      `<meta name="twitter:image" content="${attr(image)}" />`,
    ];
    // Structured data: who we are, on every page; what the API is, on the home page; the docs as an article.
    const org = { '@type': 'Organization', name: 'Mint Motive', url: 'https://mintmotive.com.au', logo: `${config.publicUrl}/img/icon-192.png`, sameAs: [config.vertexUrl] };
    const ld = [{ '@context': 'https://schema.org', ...org }];
    if (name === 'api-portal') ld.push({ '@context': 'https://schema.org', '@type': 'WebAPI', name: 'Mint Motive API', description, url, documentation: `${config.publicUrl}/docs`, provider: org, termsOfService: `${config.vertexUrl}/licences` });
    if (name === 'api-docs') ld.push({ '@context': 'https://schema.org', '@type': 'TechArticle', headline: 'The Mint Motive API', description, url, publisher: org, about: { '@type': 'WebAPI', name: 'Mint Motive API' } });
    if (indexed) tags.push(`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`);
    return tags.map((t) => `    ${t}`).join('\n');
  }
  async function serveFile(req, res, pathname) {
    let file = normalize(join(PUBLIC, decodeURIComponent(pathname)));
    if (!file.startsWith(PUBLIC + sep)) return false;
    // The engine the browser runs (/js/models.js and the rest) is the same copy the server uses.
    if (!existsSync(file) && pathname.startsWith('/js/') && extname(pathname) === '.js') {
      const e = normalize(join(ENGINE_DIR, decodeURIComponent(pathname.slice(3))));
      if (e.startsWith(ENGINE_DIR + sep)) file = e;
    }
    try {
      const info = await stat(file);
      if (!info.isFile()) return false;
      const etag = `"${info.size.toString(16)}-${info.mtimeMs.toString(16)}"`;
      if (req.headers['if-none-match'] === etag) return send(res, 304, null, { ETag: etag }), true;
      const code = /\.(js|css)$/.test(file);
      send(res, 200, req.method === 'HEAD' ? null : await readFile(file), { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', ETag: etag, 'Cache-Control': code || pathname.startsWith('/sdk/') ? 'no-cache' : 'public, max-age=604800', ...(pathname.startsWith('/sdk/') ? { 'Access-Control-Allow-Origin': '*' } : {}) });
      return true;
    } catch { return false; }
  }

  // ---------- sign in with VERTEX ----------
  function startSignIn(req, res, url) {
    const n = url.searchParams.get('next') || '/console';
    const next = /^\/(?!\/)/.test(n) ? n : '/console';
    if (!link.on()) throw new HttpError(503, 'Signing in isn’t set up yet (VERTEX_URL and API_LINK_SECRET).');
    const state = randomBytes(18).toString('base64url');
    const cookie = `${STATE_COOKIE}=${state}.${encodeURIComponent(next)}; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=600${secure ? '; Secure' : ''}`;
    redirect(res, link.authorizeUrl(state, `${config.publicUrl}/auth/vertex/callback`), 302, { 'Set-Cookie': cookie });
  }
  async function finishSignIn(req, res, url, ctx) {
    const raw = parseCookies(req.headers.cookie)[STATE_COOKIE] || '';
    const [state, nextEnc = ''] = raw.split('.');
    const clear = `${STATE_COOKIE}=; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
    if (url.searchParams.get('error')) return redirect(res, `/signin?error=${encodeURIComponent(url.searchParams.get('error'))}`, 302, { 'Set-Cookie': clear });
    const code = url.searchParams.get('code') || '';
    if (!state || state !== url.searchParams.get('state') || !/^[\w-]{20,100}$/.test(code)) return redirect(res, '/signin?error=expired', 302, { 'Set-Cookie': clear });
    let r;
    try { r = await link.exchange(code); } catch { return redirect(res, '/signin?error=vertex', 302, { 'Set-Cookie': clear }); }
    if (!r?.user?.id) return redirect(res, '/signin?error=vertex', 302, { 'Set-Cookie': clear });
    if (r.user.banned) return redirect(res, '/signin?error=suspended', 302, { 'Set-Cookie': clear });
    saveUser(r.user);
    if (r.controls) controls.saveRemote({ ...controls.status().vertex, ...r.controls });
    const token = createSession(db, Number(r.user.id), req.headers['user-agent'], { ip: ctx.ip, mfa: Boolean(r.mfa) });
    if (isStaff({ role: r.user.role })) audit.log({ ...r.user, ip: ctx.ip }, 'staff.login', `${r.user.id}:${r.user.email}`, { how: 'vertex', mfa: Boolean(r.mfa) }, ctx.ip);
    let next = '/console';
    try { const n = decodeURIComponent(nextEnc); if (/^\/(?!\/)/.test(n)) next = n; } catch { /* default */ }
    redirect(res, next, 302, { 'Set-Cookie': [clear, sessionCookie(token, { secure })] });
  }

  // ---------- the API routes ----------
  async function api(req, res, url, ctx) {
    const path = url.pathname, method = req.method;
    if (/^\/api\/(?:engine|trace|ai)\/v1(?:\/|$)/.test(path) && (req.headers.authorization || method !== 'GET' || path.startsWith('/api/trace/'))) {
      apiLog.track(req, res, ctx, path);
      if (apiGuard.blocked(ctx.ip)) throw new HttpError(403, 'Calls from this address are blocked. Write to support if you think that’s wrong.');
    }
    if (!apiLimit.take(`api:${ctx.ip}`)) throw new HttpError(429, 'Too many requests. Please slow down.');
    // Stripe's webhook and VERTEX's calls carry their own proof; everything else that changes something comes from our own pages.
    if (path === '/api/stripe/webhook' && method === 'POST') return stripe.webhookRoute(req, res, json);
    if (path === '/api/link/ping' && method === 'GET') {
      if (!linkSecretOk(req)) throw new HttpError(401, 'No.');
      return json(res, 200, { ok: true, site: 'api', engine: ENGINE.version });
    }
    const keyed = /^Bearer (vx|tk)_/.test(String(req.headers.authorization || ''));
    if (method !== 'GET' && method !== 'HEAD' && !keyed && !sameOrigin(req, config.publicUrl)) throw new HttpError(403, 'Cross-site request blocked.');

    if (path === '/api/me' && method === 'GET') return json(res, 200, { user: publicUser(ctx.user), vertex: config.vertexUrl });
    if (path === '/api/auth/logout' && method === 'POST') {
      const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      if (token) destroySession(db, token);
      return json(res, 200, { ok: true }, { 'Set-Cookie': clearCookie({ secure }) });
    }
    if (path === '/api/status' && method === 'GET') return json(res, 200, apiStatus.summary(), { 'Cache-Control': 'public, max-age=30' });
    // The developers' changelog: JSON for tools, RSS for feed readers and chat channels.
    if (path === '/api/changelog' && method === 'GET') return json(res, 200, changelog.json(Number(url.searchParams.get('limit')) || 20), { 'Cache-Control': 'public, max-age=300' });
    if (path === '/api/changelog.rss' && method === 'GET') return send(res, 200, changelog.rss(config.publicUrl), { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' });
    if (path === '/api/status.rss' && method === 'GET') return send(res, 200, apiStatus.rss(config.publicUrl), { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=60' });

    // A page view, from site.js (no cookies; see marketing.js).
    if (path === '/api/t' && method === 'POST') {
      const b = await readJson(req, 4096);
      marketing.view(b, { ip: ctx.ip, ua: req.headers['user-agent'], lang: req.headers['accept-language'] });
      res.writeHead(204, { 'Cache-Control': 'no-store' }); return res.end();
    }

    // The tracer API (partners' keys), and its owner-only settings.
    if (path.startsWith('/api/admin/trace-api')) requireAdmin(ctx);
    if ((path.startsWith('/api/trace/v1') || path.startsWith('/api/admin/trace-api')) && (await traceApi.handle(req, res, path, method, ctx, json))) return;

    // ---------- staff ----------
    if (path.startsWith('/api/admin/api/')) {
      const me = requireAdmin(ctx);
      const q = Object.fromEntries(url.searchParams);
      const f = { api: q.api, keyType: q.keyType, keyId: q.keyId, userId: q.userId, ip: q.ip, status: q.status, q: q.q, before: q.before, since: q.since };
      const days = (max) => Math.max(1, Math.min(max, Number(q.days) || 30));
      if (path === '/api/admin/api/marketing/traffic' && method === 'GET') return json(res, 200, marketing.traffic(days(400)));
      if (path === '/api/admin/api/marketing/search' && method === 'GET') return json(res, 200, await marketing.search(days(480)));
      if (path === '/api/admin/api/marketing/links' && method === 'GET') return json(res, 200, { links: marketing.links(), base: `${config.publicUrl}/l/` });
      if (path === '/api/admin/api/marketing/links' && method === 'POST') return json(res, 201, { link: marketing.addLink(me, await readJson(req), ctx.ip) });
      const lm = path.match(/^\/api\/admin\/api\/marketing\/links\/([a-z0-9-]+)$/);
      if (lm && method === 'DELETE') { marketing.removeLink(me, lm[1], ctx.ip); return json(res, 200, { ok: true }); }
      if (path === '/api/admin/api/marketing/media' && method === 'GET') return json(res, 200, { media: marketing.mediaList() });
      if (path === '/api/admin/api/marketing/media' && method === 'POST') return json(res, 201, { media: await marketing.upload(me, req, q.name, ctx.ip) });
      const mm = path.match(/^\/api\/admin\/api\/marketing\/media\/([0-9a-f]{16})$/);
      if (mm && method === 'DELETE') { marketing.removeMedia(me, mm[1], ctx.ip); return json(res, 200, { ok: true }); }
      if (path === '/api/admin/api/summary' && method === 'GET') return json(res, 200, apiLog.summary({ api: q.api }, days(365)));
      if (path === '/api/admin/api/requests' && method === 'GET') return json(res, 200, apiLog.list(f, { staff: true, limit: q.limit || 100 }));
      if (path === '/api/admin/api/requests.csv' && method === 'GET') {
        audit.log(me, 'api.export', 'requests', f, ctx.ip);
        return send(res, 200, apiLog.csv(f), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="mint-motive-api-requests-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' });
      }
      const tm = path.match(/^\/api\/admin\/api\/trace\/([\w-]{4,40})$/);
      if (tm && method === 'GET') {
        const t = apiLog.trace(tm[1]);
        if (!t) throw new HttpError(404, 'Nothing found for that serial or request id.');
        audit.log(me, 'api.trace', tm[1], {}, ctx.ip);
        return json(res, 200, t);
      }
      if (path === '/api/admin/api/keys' && method === 'GET') {
        const engine = db.prepare(`SELECT k.id, k.name, k.key_hint AS hint, k.allow_ips AS allowIps, k.calls, k.created_at AS createdAt, k.last_used_at AS lastUsedAt, k.revoked_at AS revokedAt, u.id AS userId, u.handle, u.email
          FROM engine_keys k JOIN users u ON u.id = k.user_id ORDER BY k.revoked_at IS NOT NULL, k.last_used_at DESC, k.id DESC LIMIT 500`).all();
        const trace = db.prepare('SELECT id, name, key_hint AS hint, allow_ips AS allowIps, test, quota, used, month, calls, created_at AS createdAt, last_used_at AS lastUsedAt, revoked_at AS revokedAt FROM trace_keys ORDER BY revoked_at IS NOT NULL, id DESC').all();
        return json(res, 200, { engine, trace });
      }
      const km = path.match(/^\/api\/admin\/api\/keys\/(engine|trace)\/(\d+)\/(revoke|allow)$/);
      if (km && method === 'POST') {
        const body = await readJson(req, 4096).catch(() => ({}));
        const table = km[1] === 'engine' ? 'engine_keys' : 'trace_keys';
        if (km[3] === 'allow') {
          const allow = parseAllow(body.allowIps);
          if (!db.prepare(`UPDATE ${table} SET allow_ips = ? WHERE id = ?`).run(allow, Number(km[2])).changes) throw new HttpError(404, 'No key with that id.');
          audit.log(me, 'api.key.allow', `${km[1]}:${km[2]}`, { allowIps: allow }, ctx.ip);
          return json(res, 200, { ok: true, allowIps: allow || '' });
        }
        if (!db.prepare(`UPDATE ${table} SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`).run(Date.now(), Number(km[2])).changes) throw new HttpError(404, `No live ${km[1]} key with that id.`);
        const reason = String(body.reason || '').slice(0, 300);
        audit.log(me, 'api.key.revoke', `${km[1]}:${km[2]}`, { reason }, ctx.ip);
        if (km[1] === 'engine') {
          const k = db.prepare('SELECT id, name, key_hint, user_id FROM engine_keys WHERE id = ?').get(Number(km[2]));
          apiWebhooks.emit(k.user_id, 'key.revoked', { key: { id: k.id, name: k.name, hint: k.key_hint }, by: 'Mint Motive', reason });
        }
        return json(res, 200, { ok: true });
      }
      if (path === '/api/admin/api/alerts' && method === 'GET') return json(res, 200, { alerts: apiGuard.listAlerts({ open: q.open === '1', limit: Number(q.limit) || 100 }) });
      const am = path.match(/^\/api\/admin\/api\/alerts\/(\d+)\/ack$/);
      if (am && method === 'POST') {
        if (!apiGuard.ack(Number(am[1]), me.id)) throw new HttpError(404, 'No open alert with that id.');
        audit.log(me, 'api.alert.ack', am[1], {}, ctx.ip);
        return json(res, 200, { ok: true });
      }
      if (path === '/api/admin/api/scan' && method === 'POST') return json(res, 200, { raised: apiGuard.scan().length });
      if (path === '/api/admin/api/blocks' && method === 'GET') return json(res, 200, { blocks: apiGuard.blocks() });
      if (path === '/api/admin/api/blocks' && method === 'POST') {
        const body = await readJson(req, 4096);
        const ipb = apiGuard.block(body.ip, { reason: body.reason, hours: Number(body.hours) || 0, by: me.id });
        audit.log(me, 'api.block', ipb, { reason: String(body.reason || '').slice(0, 300), hours: Number(body.hours) || 0 }, ctx.ip);
        return json(res, 201, { ok: true, ip: ipb });
      }
      const bm = path.match(/^\/api\/admin\/api\/blocks\/([\w.:%]+)$/);
      if (bm && method === 'DELETE') {
        const ipb = decodeURIComponent(bm[1]);
        if (!apiGuard.unblock(ipb)) throw new HttpError(404, 'That address isn’t blocked.');
        audit.log(me, 'api.unblock', ipb, {}, ctx.ip);
        return json(res, 200, { ok: true });
      }
      if (path === '/api/admin/api/latency' && method === 'GET') return json(res, 200, { days: days(365), rows: apiGuard.latency(days(365), q.api || '') });
      if (path === '/api/admin/api/webhooks' && method === 'GET') return json(res, 200, { webhooks: apiWebhooks.all() });
      if (path === '/api/admin/api/plans' && method === 'GET') return json(res, 200, { plans: apiPlans.plans(), subscribers: apiPlans.subscribers(), revenue: apiPlans.revenue(), stripe: stripe.stripeReady(), currency: stripe.currency().toUpperCase() });
      if (path === '/api/admin/api/plans' && method === 'PUT') return json(res, 200, { plans: apiPlans.savePlans((await readJson(req, 32 * 1024)).plans, me, ctx.ip) });
      if (path === '/api/admin/api/plans/grant' && method === 'POST') { const b = await readJson(req, 4096); return json(res, 200, apiPlans.grant(me, Number(b.userId), b, ctx.ip)); }
      if (path === '/api/admin/api/plans/cancel' && method === 'POST') { const b = await readJson(req, 4096); await apiPlans.cancel(me, Number(b.userId), ctx.ip); return json(res, 200, { ok: true }); }
      if (path === '/api/admin/api/plans/bill' && method === 'POST') return json(res, 200, { billed: await apiPlans.billOverage() });
      if (path === '/api/admin/api/incidents' && method === 'GET') return json(res, 200, { incidents: apiStatus.incidents({ days: 365 }), components: STATUS_COMPONENTS, statuses: INCIDENT_STATUSES, impacts: IMPACTS });
      if (path === '/api/admin/api/incidents' && method === 'POST') {
        const inc = apiStatus.openIncident(me, await readJson(req, 16 * 1024));
        audit.log(me, 'api.incident.open', String(inc.id), { title: inc.title, impact: inc.impact }, ctx.ip);
        return json(res, 201, inc);
      }
      const im = path.match(/^\/api\/admin\/api\/incidents\/(\d+)\/updates$/);
      if (im && method === 'POST') {
        const inc = apiStatus.updateIncident(me, im[1], await readJson(req, 16 * 1024));
        audit.log(me, 'api.incident.update', im[1], { status: inc.status }, ctx.ip);
        return json(res, 200, inc);
      }
      if (path === '/api/admin/api/developers' && method === 'GET') {
        const like = `%${String(q.q || '').replace(/^@/, '').slice(0, 60)}%`;
        return json(res, 200, { developers: db.prepare(`SELECT u.id, u.handle, u.email, COUNT(k.id) AS keys, SUM(k.revoked_at IS NULL) AS live, MAX(k.last_used_at) AS lastUsedAt
          FROM users u JOIN engine_keys k ON k.user_id = u.id WHERE u.handle LIKE ? OR u.email LIKE ? GROUP BY u.id ORDER BY lastUsedAt DESC LIMIT 50`).all(like, like) });
      }
      // Teams: who owns them, who's in them, their shared keys and today's calls.
      if (path === '/api/admin/api/teams' && method === 'GET') {
        const day = Date.now() - 86400e3;
        return json(res, 200, { teams: db.prepare(`SELECT t.id, t.name, t.created_at AS createdAt, u.id AS ownerId, u.handle AS owner,
            (SELECT COUNT(*) FROM team_members m WHERE m.team_id = t.id) AS members,
            (SELECT COUNT(*) FROM team_invites i WHERE i.team_id = t.id) AS invites,
            (SELECT COUNT(*) FROM engine_keys k WHERE k.team_id = t.id AND k.revoked_at IS NULL) AS keys,
            (SELECT COUNT(*) FROM api_requests r JOIN engine_keys k ON r.key_type = 'engine' AND k.id = r.key_id WHERE k.team_id = t.id AND r.at >= ?) AS today
          FROM teams t JOIN users u ON u.id = t.owner_id ORDER BY today DESC, t.id DESC LIMIT 200`).all(day) });
      }
      // This site's switches and its line to VERTEX.
      if (path === '/api/admin/api/settings' && method === 'GET') {
        const imported = db.prepare("SELECT value FROM settings WHERE key = 'vertex_import'").get()?.value;
        return json(res, 200, {
          engineApi: controls.status().engineApi, tracer: { on: traceApi.isOn(), ready: toolLibrary.aiOn() && toolLibrary.convertOn() },
          vertex: { url: config.vertexUrl, linked: link.on(), controls: controls.status().vertex, imported: imported ? JSON.parse(imported) : null },
          stripe: { ready: stripe.stripeReady(), webhook: Boolean(config.stripe.webhookSecret) },
          engine: ENGINE.version, audit: audit.verify(),
        });
      }
      if (path === '/api/admin/api/settings' && method === 'PUT') {
        const b = await readJson(req, 4096);
        if ('engineApi' in b) { controls.setSwitch('engineApi', Boolean(b.engineApi)); audit.log(me, 'api.switch', 'engineApi', { on: Boolean(b.engineApi) }, ctx.ip); }
        return json(res, 200, { engineApi: controls.status().engineApi });
      }
      // Education plan applications.
      if (path === '/api/admin/api/education' && method === 'GET') return json(res, 200, { applications: education.list(q.status || ''), counts: education.counts(), kinds: EDU_KINDS, plans: apiPlans.plans().map((p) => ({ id: p.id, name: p.name, monthly: p.monthly })) });
      const em = path.match(/^\/api\/admin\/api\/education\/(\d+)(?:\/(decide|files\/([0-9a-f]{16})))?$/);
      if (em && !em[2] && method === 'GET') { const a = education.one(em[1]); if (!a) throw new HttpError(404, 'No application with that id.'); audit.log(me, 'edu.view', em[1], {}, ctx.ip); return json(res, 200, a); }
      if (em && em[2] === 'decide' && method === 'POST') return json(res, 200, education.decide(me, em[1], await readJson(req, 8 * 1024), ctx.ip));
      if (em && em[3] && method === 'GET') {
        const f = education.file(em[1], em[3]);
        audit.log(me, 'edu.file', `${em[1]}:${em[3]}`, {}, ctx.ip);
        return send(res, 200, f.data, { 'Content-Type': f.type, 'Content-Disposition': `inline; filename="${f.name.replace(/[^\w. -]/g, '_')}"`, 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; plugin-types application/pdf", 'X-Content-Type-Options': 'nosniff' });
      }
      if (path === '/api/admin/api/vertex/refresh' && method === 'POST') { await controls.refresh(); return json(res, 200, controls.status().vertex); }
      if (path === '/api/admin/api/vertex/import' && method === 'POST') {
        if (me.role !== 'owner') throw new HttpError(403, 'Only owners can bring data over.');
        const out = await importFromVertex({ db, link, force: true });
        audit.log(me, 'api.import', 'vertex', out, ctx.ip);
        return json(res, 200, out);
      }
      throw new HttpError(404, 'Not found.');
    }

    // ---------- developers ----------
    if (path === '/api/engine/v1/plans' && method === 'GET') return json(res, 200, { plans: apiPlans.publicPlans(), currency: stripe.currency().toUpperCase(), paid: stripe.stripeReady() }, { 'Cache-Control': 'public, max-age=60' });
    // Print AI: developer keys, its own switch (staff settings at /api/admin/print-ai).
    if (path === '/api/admin/print-ai') requireAdmin(ctx);
    if ((path.startsWith('/api/ai/v1') || path === '/api/admin/print-ai') && (await printAi.handle(req, res, path, method, ctx, json))) return;
    if (path.startsWith('/api/teams') && (await teams.handle(req, res, path, method, ctx, json, requireUser))) return;
    if (path.startsWith('/api/engine/v1') && (await engineApi.handle(req, res, path, method, ctx, json, requireUser))) return;
    if (path.startsWith('/api/developer/')) {
      let me = requireUser(ctx, 'Sign in to open the console.');
      const q = Object.fromEntries(url.searchParams);
      // Staff can look at a developer's console as they see it: read only, and written down.
      if (q.as) {
        requireAdmin(ctx);
        if (method !== 'GET') throw new HttpError(403, 'Viewing as someone else is read only.');
        const who = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(q.as));
        if (!who) throw new HttpError(404, 'No account with that id.');
        if (path === '/api/developer/console') audit.log(me, 'api.viewas', String(who.id), { handle: who.handle }, ctx.ip);
        me = who;
      }
      const mine = { userId: me.id, keyType: 'engine' };
      if (path === '/api/developer/console' && method === 'GET') {
        const day = Date.now() - 86400e3;
        const keys = engineApi.keysOf(me.id), ids = keys.map((k) => k.id);
        // Today's use per key, team keys included (their calls are logged to the team owner).
        const used = ids.length ? Object.fromEntries(db.prepare(`SELECT key_id, COUNT(*) AS n FROM api_requests WHERE key_type = 'engine' AND key_id IN (${ids.map(() => '?').join(',')}) AND at >= ? AND status NOT IN (401, 429) AND path IN ('/api/engine/v1/generate', '/api/engine/v1/parts') GROUP BY key_id`).all(...ids, day).map((r) => [r.key_id, r.n])) : {};
        return json(res, 200, {
          me: { handle: me.handle, id: me.id }, viewingAs: Boolean(q.as), info: engineApi.info(), keys: keys.map((k) => ({ ...k, usedToday: used[k.id] || 0 })), teams: teams.list(me.id),
          plan: apiPlans.usage(me.id), plans: apiPlans.publicPlans(),
          webhooks: apiWebhooks.list(me.id), events: WEBHOOK_EVENTS,
          summary: apiLog.summary(mine, Math.max(1, Math.min(90, Number(q.days) || 30))),
          recent: apiLog.list(mine, { limit: 25 }).rows,
        });
      }
      if (path === '/api/developer/requests' && method === 'GET') return json(res, 200, apiLog.list({ ...mine, keyId: q.key, status: q.status, q: q.q, before: q.before }, { limit: q.limit || 50 }));
      const rm = path.match(/^\/api\/developer\/requests\/([\w-]{4,40})$/);
      if (rm && method === 'GET') {
        const r = apiLog.one(rm[1], mine);
        if (!r) throw new HttpError(404, 'No call of yours with that request id or serial.');
        return json(res, 200, r);
      }
      if (path === '/api/developer/plan' && method === 'GET') return json(res, 200, { ...apiPlans.usage(me.id), plans: apiPlans.publicPlans() });
      if (path === '/api/developer/plan/checkout' && method === 'POST') {
        const body = await readJson(req, 4096);
        const out = await apiPlans.checkout(me, String(body.plan || ''), config.publicUrl);
        audit.log(me, 'api.plan.checkout', String(body.plan || ''), {}, ctx.ip);
        return json(res, 200, out);
      }
      if (path === '/api/developer/plan/manage' && method === 'POST') return json(res, 200, await apiPlans.manage(me, config.publicUrl));
      if (path === '/api/developer/plan/cap' && method === 'PUT') {
        const body = await readJson(req, 1024);
        const cap = apiPlans.setCap(me.id, body.dollars);
        audit.log(me, 'api.plan.cap', String(me.id), { cents: cap }, ctx.ip);
        return json(res, 200, apiPlans.usage(me.id));
      }
      // The Education plan: your application and where it's up to.
      if (path === '/api/developer/education' && method === 'GET') return json(res, 200, { application: education.mine(me.id), kinds: EDU_KINDS });
      if (path === '/api/developer/education' && method === 'POST') return json(res, 201, { application: education.apply(me, await readJson(req, 48 * 1024 * 1024), ctx.ip) });
      if (path === '/api/developer/webhooks' && method === 'GET') return json(res, 200, { webhooks: apiWebhooks.list(me.id), events: WEBHOOK_EVENTS });
      if (path === '/api/developer/webhooks' && method === 'POST') {
        const h = await apiWebhooks.create(me.id, await readJson(req, 4096));
        audit.log(me, 'api.webhook.create', String(h.id), { url: h.url, events: h.events }, ctx.ip);
        return json(res, 201, h);
      }
      const wm = path.match(/^\/api\/developer\/webhooks\/(\d+)(?:\/(test|deliveries))?$/);
      if (wm && !wm[2] && method === 'DELETE') { apiWebhooks.remove(me.id, Number(wm[1])); audit.log(me, 'api.webhook.remove', wm[1], {}, ctx.ip); return json(res, 200, { ok: true }); }
      if (wm && wm[2] === 'test' && method === 'POST') return json(res, 202, { queued: apiWebhooks.test(me.id, Number(wm[1])).length });
      if (wm && wm[2] === 'deliveries' && method === 'GET') return json(res, 200, { deliveries: apiWebhooks.deliveries(me.id, Number(wm[1])) });
      throw new HttpError(404, 'Not found.');
    }
    throw new HttpError(404, 'Not found.');
  }

  // ---------- every request ----------
  async function handle(req, res) {
    const url = new URL(req.url || '/', 'http://x');
    const ctx = { ip: clientIp(req, config.trustProxy), user: null };
    securityHeaders(res, { secure });
    if (url.pathname === '/healthz') {
      try { db.prepare('SELECT 1').get(); } catch { return json(res, 503, { ok: false }); }
      return json(res, 200, { ok: true, version: config.version, engine: ENGINE.version, vertex: link.on() });
    }
    // Short API paths: /engine/v1/…, /trace/v1/… and /ai/v1/… are the APIs.
    if (/^\/(?:engine|trace|ai)\/v1(?:\/|$)/.test(url.pathname) || url.pathname === '/changelog.rss') url.pathname = `/api${url.pathname}`;
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) {
      ctx.user = sessionUser(db, token, ctx.ip);
      if (ctx.user && Date.now() - ctx.user.synced_at > SYNC_EVERY) sync(ctx.user.id);
      if (ctx.user?.role === 'banned') ctx.user = null;
    }
    try {
      if (url.pathname.startsWith('/api/')) return await api(req, res, url, ctx);
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Not here.');
      if (url.pathname === '/auth/vertex') return startSignIn(req, res, url);
      if (url.pathname === '/auth/vertex/callback') return await finishSignIn(req, res, url, ctx);
      if (url.pathname.startsWith('/fonts/') && (await fonts.handle(req, res, url.pathname))) return;
      // Old addresses from when the portal lived inside VERTEX.
      if (url.pathname === '/api-portal' || url.pathname.startsWith('/api-portal/')) return redirect(res, `${url.pathname.slice(11) || '/'}${url.search}`, 301);
      if (url.pathname === '/developers') return redirect(res, '/', 301);
      // Short links posted elsewhere (MakerWorld, socials) and the media library's files.
      const lk = url.pathname.match(/^\/l\/([A-Za-z0-9-]{2,40})$/);
      if (lk) { const to = marketing.follow(lk[1]); if (to) return redirect(res, to, 302); }
      const md = url.pathname.match(/^\/media\/([0-9a-f]{16}\.[a-z0-9]+)$/);
      if (md && marketing.serveMedia(req, res, md[1])) return;
      const clean = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : '/';
      if (PAGES[clean]) return send(res, 200, page(PAGES[clean]), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      if (VERTEX_PAGES.has(clean)) return redirect(res, `${config.vertexUrl}${clean}${url.search}`);
      if (await serveFile(req, res, url.pathname)) return;
      if (url.pathname === '/favicon.ico') return redirect(res, '/img/icon.svg', 301);
      if (url.pathname === '/robots.txt') return send(res, 200, `User-agent: *\nAllow: /\nDisallow: /console\nDisallow: /admin\nDisallow: /signin\nDisallow: /auth/\nDisallow: /api/\nSitemap: ${config.publicUrl}/sitemap.xml\n`, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
      if (url.pathname === '/sitemap.xml') return send(res, 200, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['/', '/docs', '/education', '/status'].map((p) => `  <url><loc>${config.publicUrl}${p}</loc></url>`).join('\n')}\n</urlset>\n`, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
      send(res, 404, page('not-found'), { 'Content-Type': 'text/html; charset=utf-8' });
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      if (res.headersSent) { try { res.end(); } catch { /* gone */ } return; }
      if (url.pathname.startsWith('/api/')) return json(res, status, { error: status === 500 ? 'Something went wrong on our side.' : e.message, ...(e.data || {}) });
      send(res, status, status === 500 ? 'Something went wrong on our side.' : e.message, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
  }

  const server = createServer((req, res) => { handle(req, res); });

  // ---------- background work ----------
  function schedule() {
    every(10 * 60e3, () => apiGuard.scan());
    every(5 * 60e3, () => apiStatus.probe());
    every(6 * 3600e3, () => apiPlans.billOverage());
    every(5 * 60e3, () => controls.refresh());
    every(24 * 3600e3, () => education.sweep());
    setTimeout(() => { try { apiStatus.probe(); } catch { /* next time */ } controls.refresh().catch(() => {}); }, 15e3).unref?.();
    // Once: the keys, logs and plans from when the API lived inside VERTEX. Tried until VERTEX answers.
    const tryImport = () => importFromVertex({ db, link }).then((r) => { if (r.done) console.log(`Brought over from VERTEX: ${JSON.stringify(r.counts)}`); else if (r.skipped) clearInterval(imp); }).catch((e) => console.warn(`import from VERTEX: ${e.message}`));
    const imp = setInterval(() => { if (db.prepare("SELECT 1 FROM settings WHERE key = 'vertex_import'").get()) return clearInterval(imp); tryImport(); }, 10 * 60e3);
    imp.unref?.();
    timers.push(imp);
    setTimeout(tryImport, 5e3).unref?.();
  }
  function close() { for (const t of timers) clearInterval(t); }

  return { server, db, link, controls, stripe, education, syncUser: sync, apiPlans, apiStatus, apiGuard, engineApi, teams, traceApi, schedule, close, handle };
}
