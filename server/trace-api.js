// The tracer API: partners send a photo of tools on a sheet of paper and get
// each tool's outline back in millimetres. Invitation only: the owner issues
// every key (Admin → Data → Tracer API), it has its own switch (off until
// turned on; test keys work while it's off), and every key has a monthly
// photo allowance. Answers never say which AI ran, the names it was asked or
// the clean-up rules: only "outlines". Photos are traced and thrown away.
//
// POST /api/trace/v1/jobs?paper=a4   the photo as the body (JPEG, PNG or HEIC)
//                                    → 202 { id, status: 'running' }
// GET  /api/trace/v1/jobs/:id        → { status, paper, tools: [{ name, lengthMm, widthMm, areaMm2, outline }] }
// GET  /api/trace/v1/jobs/:id/bin    → a ready Gridfinity bin with a pocket for every tool
//                                    (?format=stl|3mf&clearance=1&depth=20&finger=22), with a serial number
// GET  /api/trace/v1                 → what the API is, and this key's allowance
import { randomBytes } from 'node:crypto';
import { HttpError, RateLimiter, readJson } from './security.js';
import { hashToken } from './auth.js';
import { keyHint } from './api-log.js';
import { ipAllowed } from './api-guard.js';
import { detectPaper, detectPaperSimple, rectify, homography, applyH, PAPER_SIZES } from '../engine/trace/vision.js';
import { wholeOutlines, objectPixels } from '../engine/trace/whole.js';
import { centred, ccw, placed, growPocket, smallestBin, fingerSpot } from '../engine/trace/layout.js';
import { generateCutoutBin } from '../engine/geometry/cutout.js';
import { toSTL, to3MF } from '../engine/export.js';
import { setSerial } from '../engine/serial.js';
import { ENGINE } from '../engine/engine.js';

const KEY = 'trace_api';
const MAX_PHOTO = 20 * 1024 * 1024;
const JOB_LIFE = 15 * 60e3;
export const TRACE_LIMITS = { perMinute: 6, running: 2, defaultQuota: 500 };
const month = (t = Date.now()) => new Date(t).toISOString().slice(0, 7);
const str = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// What a partner is told when something goes wrong: never which engine or why inside.
const SAY = {
  off: 'The tracer API isn’t available.',
  paper: 'Couldn’t find the sheet of paper. Photograph it from straight above, with the whole sheet in view on a darker surface.',
  photo: 'Couldn’t read that photo. Send a JPEG, PNG or HEIC.',
  trace: 'Couldn’t trace this photo. Try again in a minute.',
};

const shapeOf = (polygon, label = '') => {
  let a = 0;
  polygon.forEach(([x, y], i) => { const [u, v] = polygon[(i + 1) % polygon.length]; a += x * v - u * y; });
  return { polygon, areaMm2: Math.abs(a) / 2, label };
};
// Length and width along the tool's own axis, so the numbers don't change with how it lay.
export function measure(poly) {
  const n = poly.length, cx = poly.reduce((t, p) => t + p[0], 0) / n, cy = poly.reduce((t, p) => t + p[1], 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of poly) { sxx += (x - cx) ** 2; syy += (y - cy) ** 2; sxy += (x - cx) * (y - cy); }
  const t = 0.5 * Math.atan2(2 * sxy, sxx - syy), c = Math.cos(t), s = Math.sin(t);
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  for (const [x, y] of poly) { const u = (x - cx) * c + (y - cy) * s, v = -(x - cx) * s + (y - cy) * c; a0 = Math.min(a0, u); a1 = Math.max(a1, u); b0 = Math.min(b0, v); b1 = Math.max(b1, v); }
  return { length: Math.max(a1 - a0, b1 - b0), width: Math.min(a1 - a0, b1 - b0) };
}

/**
 * The same steps as Admin → Trace a photo, on the server: find the paper, have the
 * AI outline the whole photo, move the outlines onto the paper in mm, and join each
 * whole thing into one outline. image: { width, height, data (RGBA) }; jpeg: base64.
 */
export async function traceSheet({ image, jpeg, paper = 'a4', outline }) {
  const size = PAPER_SIZES[paper] || PAPER_SIZES.a4;
  const corners = detectPaper(image) || detectPaperSimple(image);
  if (!corners) throw Object.assign(new Error('no paper'), { say: 'paper' });
  const sheet = rectify(image, corners, size, 3);
  const W = sheet.widthMm, H = sheet.heightMm;
  const toMm = homography(corners, [[0, 0], [W, 0], [W, H], [0, H]]);
  const found = await outline(`data:image/jpeg;base64,${jpeg}`);
  const raw = [];
  for (const t of found) {
    const pts = t.points.map(([x, y]) => applyH(toMm, x, y));
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    if (cx < 0 || cy < 0 || cx > W || cy > H) continue; // off the paper
    const sh = shapeOf(pts.map(([x, y]) => [Math.min(W, Math.max(0, x)), Math.min(H, Math.max(0, y))]), t.label);
    if (sh.areaMm2 > 30 && sh.areaMm2 < 0.7 * W * H) raw.push(sh); // not dust, not the paper itself
  }
  let mask = null;
  try { mask = objectPixels(sheet.image, sheet.pxPerMm); } catch { /* the AI's outlines alone */ }
  const tools = (raw.length ? wholeOutlines(raw, sheet, { mask }) : []).map((w) => shapeOf(w.polygon, w.label)).filter((sh) => sh.areaMm2 > 30);
  const r1 = (v) => Math.round(v * 10) / 10;
  return {
    paper: { name: size.name, widthMm: r1(W), heightMm: r1(H) },
    tools: tools.map((sh) => { const m = measure(sh.polygon); return { name: sh.label || 'tool', lengthMm: r1(m.length), widthMm: r1(m.width), areaMm2: Math.round(sh.areaMm2), outline: sh.polygon.map(([x, y]) => [r1(x), r1(y)]) }; }),
  };
}

/**
 * A Gridfinity bin with a pocket for every traced tool: each outline grown by
 * clearance (mm), packed in rows into the smallest bin up to 8 × 8, cut depth mm
 * deep, with a finger hole where each tool is widest. → { mesh, gx, gy } or throws.
 */
export function binFor(tools, { clearance = 1, depth = 20, finger = 22 } = {}) {
  if (!tools.length) throw new HttpError(422, 'No tools were found in this photo, so there is nothing to make a bin for.');
  const laidOut = tools.map((t, i) => ({ id: i, name: t.name, x: 0, y: 0, rot: 0, poly: centred(ccw(growPocket(t.outline.map(([x, y]) => [x, -y]), clearance))) }));
  const fit = smallestBin(laidOut);
  if (!fit) throw new HttpError(422, 'These tools don’t fit in one bin (8 × 8 at most). Trace fewer at a time.');
  const circle = (cx, cy, d) => Array.from({ length: 36 }, (_, k) => [cx + (d / 2) * Math.cos((k / 36) * 2 * Math.PI), cy + (d / 2) * Math.sin((k / 36) * 2 * Math.PI)]);
  const shapes = fit.tools.flatMap((t) => {
    const polygon = ccw(placed(t)), spot = finger > 0 ? fingerSpot(polygon, finger) : null;
    return [{ polygon, depth }, ...(spot ? [{ polygon: circle(spot[0], spot[1], finger), depth }] : [])];
  });
  return { mesh: generateCutoutBin({ gridX: fit.gx, gridY: fit.gy, shapes, chamfer: 0.8 }), gx: fit.gx, gy: fit.gy };
}

export function createTraceApi({ db, can, audit, toolLibrary, newSerial = () => `T${Date.now().toString(36).toUpperCase()}` }) {
  const minute = new RateLimiter(TRACE_LIMITS.perMinute, 60e3);
  const jobs = new Map();
  const state = () => { try { return { on: false, ...JSON.parse(db.prepare('SELECT value FROM settings WHERE key = ?').get(KEY)?.value || '{}') }; } catch { return { on: false }; } };
  const save = (v) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(KEY, JSON.stringify(v));

  // ---------- keys (the owner issues them)
  const keyOut = (k) => ({ id: k.id, name: k.name, hint: k.key_hint || null, allowIps: k.allow_ips || '', test: Boolean(k.test), quota: k.quota, used: k.month === month() ? k.used : 0, calls: k.calls, createdAt: k.created_at, lastUsedAt: k.last_used_at, revoked: Boolean(k.revoked_at) });
  const keys = () => db.prepare('SELECT * FROM trace_keys ORDER BY revoked_at IS NOT NULL, id DESC').all().map(keyOut);
  function issue(user, body = {}, ip) {
    const name = str(body.name, 60);
    if (!name) throw new HttpError(400, 'Who is the key for?');
    const quota = Math.max(1, Math.min(100000, Math.round(Number(body.quota) || TRACE_LIMITS.defaultQuota)));
    const key = `tk_${randomBytes(24).toString('base64url')}`;
    const id = Number(db.prepare('INSERT INTO trace_keys (name, key_hash, key_hint, test, quota, month, used, calls, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)').run(name, hashToken(key), keyHint(key), body.test ? 1 : 0, quota, month(), user?.id || null, Date.now()).lastInsertRowid);
    audit?.log(user, 'traceapi.key', String(id), { name, quota, test: Boolean(body.test) }, ip);
    return { key, ...keyOut(db.prepare('SELECT * FROM trace_keys WHERE id = ?').get(id)) };
  }

  // The key on a request, or a 401/403/503 that says only what the caller needs.
  function keyFor(req, ip) {
    const auth = String(req.headers?.authorization || '');
    const k = auth.startsWith('Bearer tk_') ? db.prepare('SELECT * FROM trace_keys WHERE key_hash = ?').get(hashToken(auth.slice(7).trim())) : null;
    if (!k) throw new HttpError(401, 'Send your key as “Authorization: Bearer tk_…”.');
    if (k.revoked_at) throw new HttpError(403, 'That key has been revoked.');
    if (!ipAllowed(ip, k.allow_ips)) throw new HttpError(403, `That key only works from its allowed addresses, and ${ip || 'this address'} isn’t one of them.`);
    if (!state().on && !k.test) throw new HttpError(503, SAY.off);
    return k;
  }
  const usedNow = (k) => (k.month === month() ? k.used : 0);

  function start(k, photo, paper) {
    for (const [id, j] of jobs) if (Date.now() - j.at > JOB_LIFE) jobs.delete(id);
    if (!minute.take(`t:${k.id}`)) throw new HttpError(429, `Slow down: ${TRACE_LIMITS.perMinute} photos a minute per key.`);
    const running = [...jobs.values()].filter((j) => j.key === k.id && j.status === 'running').length;
    if (running >= TRACE_LIMITS.running) throw new HttpError(429, `At most ${TRACE_LIMITS.running} photos at once per key.`);
    if (usedNow(k) + running >= k.quota) throw new HttpError(429, `This key has used its ${k.quota} photos this month.`);
    const id = randomBytes(9).toString('base64url'), job = { key: k.id, at: Date.now(), status: 'running' };
    jobs.set(id, job);
    db.prepare('UPDATE trace_keys SET calls = calls + 1, last_used_at = ? WHERE id = ?').run(Date.now(), k.id);
    (async () => {
      const { jpeg, image } = await toolLibrary.convertRaw(photo).catch((e) => { throw Object.assign(e, { say: e.status === 415 ? 'photo' : 'trace' }); });
      return traceSheet({ image, jpeg, paper, outline: (img) => toolLibrary.outline(img) });
    })().then((result) => {
      Object.assign(job, { status: 'done', result });
      // Counted once it worked: a failed photo costs the partner nothing.
      const now = db.prepare('SELECT month, used FROM trace_keys WHERE id = ?').get(k.id);
      db.prepare('UPDATE trace_keys SET month = ?, used = ? WHERE id = ?').run(month(), (now?.month === month() ? now.used : 0) + 1, k.id);
    }, (e) => {
      console.warn(`trace api: key ${k.id} job failed: ${e.message}`); // the real reason stays in our logs
      Object.assign(job, { status: 'failed', error: SAY[e.say] || SAY.trace });
    });
    return id;
  }

  async function readPhoto(req) {
    const type = String(req.headers?.['content-type'] || '');
    if (/^application\/json/.test(type)) {
      const body = await readJson(req, MAX_PHOTO * 1.4);
      const b64 = String(body.image || '').replace(/^data:[^,]*,/, '');
      if (!b64) throw new HttpError(400, 'Send the photo as the body, or as { "image": base64 }.');
      return { photo: Buffer.from(b64, 'base64'), paper: body.paper };
    }
    const chunks = [];
    let n = 0;
    for await (const c of req) { n += c.length; if (n > MAX_PHOTO) throw new HttpError(413, 'That photo is too big (20 MB at most).'); chunks.push(c); }
    if (!n) throw new HttpError(400, 'Send the photo as the body.');
    return { photo: Buffer.concat(chunks), paper: null };
  }

  async function handle(req, res, path, method, ctx, json) {
    // ---------- the owner's side
    if (path.startsWith('/api/admin/trace-api')) {
      if (!can(ctx.user, 'tracer.private')) throw new HttpError(403, 'Only owners can open this.');
      if (path === '/api/admin/trace-api' && method === 'GET') return json(res, 200, { ...state(), keys: keys(), limits: TRACE_LIMITS, ready: toolLibrary.aiOn() && toolLibrary.convertOn() }), true;
      if (path === '/api/admin/trace-api' && method === 'PUT') {
        const body = await readJson(req, 4096);
        save({ ...state(), on: Boolean(body.on) });
        audit?.log(ctx.user, 'traceapi.switch', KEY, { on: Boolean(body.on) }, ctx.ip);
        return json(res, 200, state()), true;
      }
      if (path === '/api/admin/trace-api/keys' && method === 'POST') return json(res, 201, issue(ctx.user, await readJson(req, 4096), ctx.ip)), true;
      const km = path.match(/^\/api\/admin\/trace-api\/keys\/(\d+)$/);
      if (km && method === 'PUT') {
        const body = await readJson(req, 4096);
        const q = Math.max(1, Math.min(100000, Math.round(Number(body.quota) || 0)));
        if (!q) throw new HttpError(400, 'How many photos a month?');
        db.prepare('UPDATE trace_keys SET quota = ? WHERE id = ?').run(q, Number(km[1]));
        return json(res, 200, { ok: true }), true;
      }
      if (km && method === 'DELETE') {
        db.prepare('UPDATE trace_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(Date.now(), Number(km[1]));
        audit?.log(ctx.user, 'traceapi.revoke', km[1], {}, ctx.ip);
        return json(res, 200, { ok: true }), true;
      }
      return false;
    }
    // ---------- the partner's side
    if (!path.startsWith('/api/trace/v1')) return false;
    const k = keyFor(req, ctx.ip);
    const nocache = { 'Cache-Control': 'no-store' };
    if (path === '/api/trace/v1' && method === 'GET') {
      return json(res, 200, { name: 'VERTEX tracer API', version: 1, papers: Object.keys(PAPER_SIZES), key: { name: k.name, test: Boolean(k.test), quota: k.quota, usedThisMonth: usedNow(k) }, limits: { perMinute: TRACE_LIMITS.perMinute, atOnce: TRACE_LIMITS.running, maxPhotoMb: MAX_PHOTO / 1048576 } }, nocache), true;
    }
    if (path === '/api/trace/v1/jobs' && method === 'POST') {
      if (!toolLibrary.aiOn() || !toolLibrary.convertOn()) throw new HttpError(503, SAY.off);
      const { photo, paper: bodyPaper } = await readPhoto(req);
      const paper = String(new URL(req.url || '/', 'http://x').searchParams.get('paper') || bodyPaper || 'a4').toLowerCase();
      if (!PAPER_SIZES[paper]) throw new HttpError(400, `paper must be one of ${Object.keys(PAPER_SIZES).join(', ')}.`);
      const id = start(k, photo, paper);
      if (ctx.apiMeta) Object.assign(ctx.apiMeta, { kind: 'trace', params: { paper, job: id, bytes: photo.length } });
      return json(res, 202, { id, status: 'running', check: `/api/trace/v1/jobs/${id}` }, nocache), true;
    }
    // The bin for a finished job: made on request, so a partner only pays the time when they want it.
    const bm = path.match(/^\/api\/trace\/v1\/jobs\/([\w-]{8,20})\/bin$/);
    if (bm && method === 'GET') {
      const j = jobs.get(bm[1]);
      if (!j || j.key !== k.id) throw new HttpError(404, 'No such job (they’re kept for 15 minutes).');
      if (j.status !== 'done') throw new HttpError(409, 'That photo hasn’t finished tracing.');
      if (!minute.take(`t:${k.id}`)) throw new HttpError(429, `Slow down: ${TRACE_LIMITS.perMinute} calls a minute per key.`);
      const q = new URL(req.url || '/', 'http://x').searchParams, n = (v, lo, hi, d) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
      const format = (q.get('format') || 'stl').toLowerCase();
      if (!['stl', '3mf'].includes(format)) throw new HttpError(400, 'format must be stl or 3mf.');
      const opts = { clearance: n(q.get('clearance'), 0, 5, 1), depth: n(q.get('depth'), 5, 60, 20), finger: n(q.get('finger'), 0, 35, 22) };
      if (ctx.apiMeta) Object.assign(ctx.apiMeta, { kind: 'trace-bin', format, params: { job: bm[1], ...opts } });
      const { mesh, gx, gy } = binFor(j.result.tools, opts);
      const serial = newSerial(), name = `vertex-traced-bin-${gx}x${gy}`;
      setSerial(serial);
      let bytes;
      try { bytes = format === 'stl' ? toSTL(mesh, name) : to3MF([{ mesh, name }], name); } finally { setSerial(''); }
      db.prepare('INSERT INTO download_serials (serial, user_id, device, ip, kind, format, design, engine, params, created_at) VALUES (?, NULL, NULL, ?, ?, ?, NULL, ?, ?, ?)')
        .run(serial, ctx.ip || null, 'trace-bin', format, ENGINE.version, JSON.stringify({ traceKey: k.id, gx, gy, tools: j.result.tools.length, ...opts }), Date.now());
      const buf = Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes);
      res.writeHead(200, { 'Content-Type': format === 'stl' ? 'model/stl' : 'model/3mf', 'Content-Length': buf.length, 'Content-Disposition': `attachment; filename="${name}.${format}"`, 'X-Vertex-Serial': serial, 'X-Vertex-Bin': `${gx}x${gy}`, 'Cache-Control': 'no-store' });
      res.end(buf);
      return true;
    }
    const jm = path.match(/^\/api\/trace\/v1\/jobs\/([\w-]{8,20})$/);
    if (jm && method === 'GET') {
      const j = jobs.get(jm[1]);
      if (!j || j.key !== k.id) throw new HttpError(404, 'No such job (they’re kept for 15 minutes).');
      if (j.status === 'running') return json(res, 200, { id: jm[1], status: 'running', seconds: Math.round((Date.now() - j.at) / 1000) }, nocache), true;
      if (j.status === 'failed') return json(res, 200, { id: jm[1], status: 'failed', error: j.error }, nocache), true;
      return json(res, 200, { id: jm[1], status: 'done', ...j.result, bin: `/api/trace/v1/jobs/${jm[1]}/bin` }, nocache), true;
    }
    throw new HttpError(404, 'Not here. See GET /api/trace/v1.');
  }

  return { handle, keys, issue, traceSheet, isOn: () => Boolean(state().on) };
}
