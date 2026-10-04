// AI outlines and the tool library (Admin → Learning → Trace a photo).
//
// AI outlines: the straightened sheet goes to Roboflow's Serverless API
// (ROBOFLOW_API_KEY; ROBOFLOW_URL to use another endpoint): SAM3, which outlines
// any tool by name, or an instance-segmentation model of your own
// (ROBOFLOW_MODEL, e.g. "tools-ngl33/1"). The page picks which; SAM3 is the default. Each tool's
// outline comes back. The key goes in the Authorization header, never the
// address, and stays here; the page never sees it. Without the variables it's off, and
// the page uses its own trace.
//
// The tool library: every tool traced from a real photo is kept, with its
// outline in mm and its size measured along its own length (so a spanner
// matches itself at any angle). A tool that matches one already kept is
// counted again instead of added, and any name a person gives it comes back
// on every later trace of the same tool. It grows by itself as photos are
// traced; nothing needs training.
import { randomBytes } from 'node:crypto';
import { HttpError, readJson } from './security.js';
import { photoKind } from './photo.js';
import { runTrace } from './trace-pool.js';

const MAX_IMAGE = 6 * 1024 * 1024;
const MAX_PHOTO = 40 * 1024 * 1024; // a phone's HEIC, sent as it is to be converted

// The request body as bytes, refused past `max`.
async function readRaw(req, max) {
  const chunks = [];
  let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > max) throw new HttpError(413, 'That photo is too big.');
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}
const MAX_TOOLS = 60;
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };

// Same tool if its length and width agree within 3% (or 2 mm) and its area within 7%.
export function sameTool(a, b) {
  const near = (x, y, pct, mm) => Math.abs(x - y) <= Math.max(mm, (pct / 100) * Math.max(x, y));
  return near(a.length, b.length, 3, 2) && near(a.width, b.width, 4, 1.5) && near(a.area, b.area, 7, 20);
}

// The model sometimes outlines one tool twice under two names; keep the surer one.
export function dedupe(preds) {
  const box = (p) => [p.x - p.width / 2, p.y - p.height / 2, p.x + p.width / 2, p.y + p.height / 2];
  const iou = (a, b) => {
    const [a0, a1, a2, a3] = box(a), [b0, b1, b2, b3] = box(b);
    const w = Math.min(a2, b2) - Math.max(a0, b0), h = Math.min(a3, b3) - Math.max(a1, b1);
    if (!(w > 0 && h > 0)) return 0;
    return (w * h) / (a.width * a.height + b.width * b.height - w * h);
  };
  // How much of b lies inside a.
  const inside = (a, b) => {
    const [a0, a1, a2, a3] = box(a), [b0, b1, b2, b3] = box(b);
    const w = Math.min(a2, b2) - Math.max(a0, b0), h = Math.min(a3, b3) - Math.max(a1, b1);
    return w > 0 && h > 0 ? (w * h) / (b.width * b.height) : 0;
  };
  const sized = (p) => [p.x, p.y, p.width, p.height].every(Number.isFinite);
  const area = (p) => p.width * p.height;
  const kept = [];
  // "tool" is SAM3's catch-all, and some names are a kind of another (KINDS_OF):
  // for the same outline, the more exact name wins.
  const cls = (p) => String(p.class || '').toLowerCase();
  const vaguer = (a, b) => !cls(a) || cls(a) === 'tool' || (KINDS_OF[cls(a)] || []).includes(cls(b));
  const conf = (p) => Number(p.confidence) || 0;
  for (const p of [...preds].sort((a, b) => conf(b) - conf(a))) {
    // A twin overlaps and is about as big; a whole tool over one of its parts isn't one.
    const twin = sized(p) ? kept.find((k) => sized(k) && iou(k, p) > 0.6 && Math.min(area(k), area(p)) >= 0.8 * Math.max(area(k), area(p))) : null;
    if (!twin) kept.push({ ...p });
    // Only a name SAM3 was nearly as sure of: a weak "wire strippers" on combination pliers stays "pliers".
    else if (cls(p) && cls(p) !== 'tool' && vaguer(twin, p) && conf(p) >= 0.6 * (twin.named ?? conf(twin))) {
      twin.named ??= conf(twin);
      twin.class = p.class;
    }
  }
  // An outline around tools already found: if those pieces touch, they're one
  // tool found in parts (needle-nose handles + nose), so keep the whole and drop
  // the pieces; if they're apart and it hugs just them, it's a group of tools,
  // so drop the outline.
  const gone = new Set();
  for (const p of kept.filter(sized).sort((a, b) => b.width * b.height - a.width * a.height)) {
    if (gone.has(p)) continue;
    const inner = kept.filter((k) => k !== p && !gone.has(k) && sized(k) && inside(p, k) > 0.85);
    // One piece found inside a whole tool, and much smaller: the tool found again in part
    // (a long-nose pliers' tip as "side cutters"). The whole is the pocket; the piece goes.
    if (inner.length === 1) {
      const [k] = inner;
      if (within(p, k) && polyArea(k) < 0.6 * polyArea(p)) gone.add(k);
      continue;
    }
    if (inner.length < 2) continue;
    // A set (keys in a holder) is one object too: its outline covers far more than the pieces found in it.
    // Touching pieces are one tool in parts (pliers' handles and nose), unless they're alike: two tape
    // measures or two knives side by side are two tools, whatever SAM3 calls them.
    const whole = (joined(inner, Math.max(3, 0.015 * Math.max(p.width, p.height))) && !alike(inner))
      || ([p, ...inner].every(outlined) && polyArea(p) > 1.5 * inner.reduce((t, k) => t + polyArea(k), 0));
    if (!whole) { gone.add(p); continue; }
    inner.forEach((k) => gone.add(k));
    if (!cls(p) || cls(p) === 'tool') p.class = inner.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b)).class;
  }
  return kept.filter((p) => !gone.has(p)).map(({ named, ...p }) => p);
}

const outlined = (p) => Array.isArray(p.points) && p.points.length >= 3;
// Pieces of a kind: all about the same size and shape (a tool's parts never are).
function alike(parts) {
  const size = (p) => polyArea(p), long = (p) => Math.max(p.width, p.height) / Math.max(1e-6, Math.min(p.width, p.height));
  const a = parts.map(size), r = parts.map(long);
  return Math.min(...a) >= 0.6 * Math.max(...a) && Math.min(...r) >= 0.75 * Math.max(...r);
}
// Whether piece b lies inside a's outline: 85% of its corners in it (boxes only, when either has no outline).
function within(a, b) {
  if (!outlined(a) || !outlined(b)) return true; // the box test that found it already said so
  const poly = a.points.map((q) => [Number(q.x), Number(q.y)]);
  const hit = ([x, y]) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const pts = b.points.map((q) => [Number(q.x), Number(q.y)]);
  return pts.filter(hit).length >= 0.85 * pts.length;
}
// An outline's area (its box's when it has none).
function polyArea(p) {
  const q = outlined(p) ? p.points : null;
  if (!q) return p.width * p.height;
  let a = 0;
  q.forEach((u, i) => { const v = q[(i + 1) % q.length]; a += Number(u.x) * Number(v.y) - Number(v.x) * Number(u.y); });
  return Math.abs(a) / 2;
}

// Some names are a kind of another (crimpers are pliers to SAM3).
const KINDS_OF = {
  pliers: ['crimpers', 'wire strippers', 'combination pliers', 'needle-nose pliers', 'side cutters'],
  knife: ['utility knife', 'stanley knife', 'box cutter'], wrench: ['spanner', 'adjustable wrench'],
};

// Do these outlines make one connected piece? Two touch when an outline's
// corner lies within gap px of the other's edge, or inside it. Without
// outlines, overlapping boxes count as touching.
function joined(parts, gap) {
  const pts = (p) => (Array.isArray(p.points) && p.points.length >= 3 ? p.points.map((q) => [Number(q.x), Number(q.y)]) : null);
  const segDist = ([px, py], [ax, ay], [bx, by]) => {
    const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
    const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  };
  const within = ([x, y], poly) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const near = (a, b) => a.some((q) => within(q, b) || b.some((r, i) => segDist(q, r, b[(i + 1) % b.length]) <= gap));
  const touch = (a, b) => {
    const pa = pts(a), pb = pts(b);
    if (pa && pb) return near(pa, pb) || near(pb, pa);
    return Math.abs(a.x - b.x) * 2 <= a.width + b.width + gap && Math.abs(a.y - b.y) * 2 <= a.height + b.height + gap;
  };
  const seen = new Set([0]), todo = [0];
  while (todo.length) {
    const i = todo.pop();
    parts.forEach((q, j) => { if (!seen.has(j) && touch(parts[i], q)) { seen.add(j); todo.push(j); } });
  }
  return seen.size === parts.length;
}

// SAM3 finds any object it's told the name of, so nothing needs training.
// Its sureness runs low on tools (about 20% in Roboflow's own labeller), so the bar is 20%.
// The broad "tool" catches what the names miss; dedupe() drops the repeats.
// Roboflow takes at most 16 names in one call.
export const SAM3_NAMES = ['tool', 'screwdriver', 'wrench', 'pliers', 'hammer', 'tape measure', 'scissors', 'knife', 'chisel', 'allen key', 'socket', 'drill bit', 'caliper', 'crimpers', 'wire strippers', 'multimeter'];
// A second call, at the same time, for everyday things that aren't tools: with
// tool words only, a marker, a cable or a tin had no word and wasn't found.
export const SAM3_EVERYDAY = ['marker', 'pen', 'pencil', 'cable', 'charger', 'battery', 'tin', 'jar', 'bottle', 'sponge', 'box', 'case', 'tape', 'brush', 'phone', 'container'];
// Meta's SAM3 on your own server takes up to 32, so it gets the exact kinds too.
export const SAM3_META_NAMES = [...SAM3_NAMES, 'combination pliers', 'needle-nose pliers', 'side cutters', 'adjustable wrench', 'utility knife', 'stanley knife', 'box cutter', 'file', 'soldering iron', 'hex key set', 'marker', 'pen', 'cable', 'battery', 'tin', 'container'];
export const sam3Spec = (names = SAM3_NAMES) => ({
  version: '1.0',
  inputs: [{ type: 'InferenceImage', name: 'image' }],
  steps: [{ type: 'roboflow_core/sam3@v3', name: 'sam', images: '$inputs.image', class_names: names, confidence: 0.2, nms_iou_threshold: 0.5, output_format: 'polygons' }],
  outputs: [{ type: 'JsonField', name: 'preds', selector: '$steps.sam.predictions' }],
});

// A folder's name: short, one line. '' is no folder.
export const folderName = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);

// How long our GPU gets before Roboflow traces too, and how long a trace may take at all.
export const FALLBACK_AFTER = 3000; // a warm GPU answers in 2–3 s; asleep it takes 20–40 s, Roboflow about 1.5 s
const JOB_LIMIT = 90000;

export function createToolLibrary({ db, can, audit, env = process.env, fetchImpl = fetch, fallbackAfter = FALLBACK_AFTER, onOutcome = () => {} }) {
  const key = () => String(env.ROBOFLOW_API_KEY || '').trim();
  const model = () => String(env.ROBOFLOW_MODEL || '').trim().replace(/^\/+|\/+$/g, '');
  const base = () => String(env.ROBOFLOW_URL || 'https://serverless.roboflow.com').replace(/\/+$/, '');
  const trained = () => (/^[\w.-]+\/\d+$/.test(model()) ? model() : null);
  // Meta's SAM3 on your own server (the private vertex-sam3 repo): SAM3_URL and SAM3_KEY.
  const metaUrl = () => String(env.SAM3_URL || '').trim().replace(/\/+$/, '');
  const metaKey = () => String(env.SAM3_KEY || '').trim();
  const metaOn = () => Boolean(/^https?:\/\/\S+$/.test(metaUrl()) && metaKey());
  // Phone photos (HEIC) are converted by the SAM3 server's /convert: SAM3_CONVERT_URL when
  // set (the always-on one on Railway), else SAM3_URL. Without either, the browser converts.
  const convertUrl = () => String(env.SAM3_CONVERT_URL || '').trim().replace(/\/+$/, '') || metaUrl();
  const convertOn = () => Boolean(/^https?:\/\/\S+$/.test(convertUrl()) && metaKey());
  // With a Roboflow key, its SAM3 is always on offer, plus ROBOFLOW_MODEL if set; Meta's SAM3 with its server.
  const engines = () => [...(key() ? ['sam3', ...(trained() ? [trained()] : [])] : []), ...(metaOn() ? ['sam3-meta'] : [])];
  const aiOn = () => engines().length > 0;
  // SAM3 unless the page asks for another: it did far better on tools it had never seen.
  const pick = (engine) => (engines().includes(engine) ? engine : engines()[0]);

  // The model's outlines for one sheet, in the sheet's pixels. Our own GPU sleeps
  // when idle and can be slow to wake (or down), so when it hasn't answered in
  // FALLBACK_AFTER, or fails, Roboflow's SAM3 (always on) traces the same sheet
  // and whichever answers first wins.
  async function outline(image, engine) {
    if (!aiOn()) throw new HttpError(503, 'AI outlines are off. Add ROBOFLOW_API_KEY (or SAM3_URL and SAM3_KEY) in Railway.');
    const use = pick(engine);
    const m = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(String(image || ''));
    if (!m) throw new HttpError(400, 'Send the straightened sheet as a JPEG.');
    if (m[2].length * 0.75 > MAX_IMAGE) throw new HttpError(413, 'That picture is too big.');
    const backup = use === 'sam3-meta' && key() ? 'sam3' : null;
    const t0 = Date.now();
    // Each trace's outcome also feeds the API status page.
    const done = (who, r) => { console.log(`trace: ${who} answered in ${((Date.now() - t0) / 1000).toFixed(1)} s, ${r.length} outlines`); onOutcome(true, Date.now() - t0); return r; };
    if (!backup) {
      try { return done(use, await outlineWith(use, m[2])); } catch (e) { console.warn(`trace: ${use} failed after ${((Date.now() - t0) / 1000).toFixed(1)} s: ${e.message}`); onOutcome(false, Date.now() - t0, e.message); throw e; }
    }
    return new Promise((resolve, reject) => {
      let failed = 0, settled = false, backupStarted = false;
      const errors = [];
      const win = (who) => (r) => { if (!settled) { settled = true; clearTimeout(timer); resolve(done(who, r)); } };
      const lose = (who) => (e) => {
        console.warn(`trace: ${who} failed after ${((Date.now() - t0) / 1000).toFixed(1)} s: ${e.message}`);
        errors.push(e);
        if (who === use) startBackup();
        if (++failed === 2 && !settled) { settled = true; onOutcome(false, Date.now() - t0, e.message); reject(errors[errors.length - 1]); }
      };
      const startBackup = () => {
        if (backupStarted || settled) return;
        backupStarted = true;
        clearTimeout(timer);
        console.log(`trace: ${use} slow or down, Roboflow tracing too`);
        outlineWith(backup, m[2]).then(win(backup), lose(backup));
      };
      const timer = setTimeout(startBackup, fallbackAfter);
      outlineWith(use, m[2]).then(win(use), lose(use));
    });
  }

  // Roboflow's SAM3: the tool words and the everyday words, asked at the same
  // time and put together. One failing still gives the other's answer.
  async function outlineWith(use, b64) {
    if (use !== 'sam3') return outlineOnce(use, b64);
    const asks = await Promise.allSettled([outlineOnce(use, b64, SAM3_NAMES), outlineOnce(use, b64, SAM3_EVERYDAY)]);
    const ok = asks.filter((a) => a.status === 'fulfilled').map((a) => a.value);
    if (!ok.length) throw asks[0].reason;
    if (ok.length === 1) return ok[0];
    const boxed = ok.flat().map((t) => {
      const xs = t.points.map((q) => q[0]), ys = t.points.map((q) => q[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      return { points: t.points.map(([x, y]) => ({ x, y })), class: t.label, confidence: t.confidence, x: (x0 + x1) / 2, y: (y0 + y1) / 2, width: x1 - x0, height: y1 - y0 };
    });
    return dedupe(boxed)
      .slice(0, MAX_TOOLS)
      .map((p) => ({ points: p.points.map((q) => [q.x, q.y]), label: p.class, confidence: p.confidence }));
  }

  async function outlineOnce(use, b64, names = SAM3_NAMES) {
    const sam3 = use === 'sam3', meta = use === 'sam3-meta';
    const who = meta ? 'Your SAM3 server' : 'Roboflow';
    const t0 = Date.now();
    let r;
    try {
      r = meta
        ? await fetchImpl(`${metaUrl()}/segment`, {
          // On CPU it can take minutes; a GPU answers in seconds.
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${metaKey()}` }, signal: AbortSignal.timeout(300000),
          body: JSON.stringify({ image: b64, prompts: SAM3_META_NAMES, confidence: 0.2 }),
        })
        : sam3
        ? await fetchImpl(`${base()}/workflows/run`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60000),
          body: JSON.stringify({ api_key: key(), specification: sam3Spec(names), inputs: { image: { type: 'base64', value: b64 } } }),
        })
        : await fetchImpl(`${base()}/${use}?format=json`, {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Bearer ${key()}` }, body: b64, signal: AbortSignal.timeout(45000),
        });
    } catch (e) { throw new HttpError(502, `${who} didn’t answer (${e.name === 'TimeoutError' ? 'timed out' : e.cause?.code || e.message}).`); }
    const body = await r.json().catch(() => null);
    if (!r.ok) throw new HttpError(502, `${who} said no (${r.status}${body?.message ? `: ${String(body.message).slice(0, 300)}` : ''}).`);
    // Where a slow trace spent its time: the GPU's own seconds against the whole round trip (Railway logs).
    if (meta) console.log(`trace: SAM3 GPU ${body?.time ?? '?'} s of ${((Date.now() - t0) / 1000).toFixed(1)} s, ${body?.predictions?.length ?? 0} outlines`);
    const found = sam3 ? body?.outputs?.[0]?.preds : body;
    const preds = Array.isArray(found?.predictions) ? found.predictions : [];
    return dedupe(preds.filter((p) => Array.isArray(p.points) && p.points.length >= 3))
      .slice(0, MAX_TOOLS)
      .map((p) => ({ points: p.points.map((q) => [Number(q.x), Number(q.y)]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)), label: String(p.class || '').slice(0, 60), confidence: Number(p.confidence) || 0 }));
  }

  // A photo (JPEG, PNG or a phone's HEIC) as an upright JPEG plus its pixels (RGB), at most
  // 1600 px a side: the converter decodes it, so the server can find the paper itself.
  // JPEG and PNG are read here (on a worker thread); only HEIC needs the converter.
  async function convertRaw(data) {
    const kind = photoKind(data);
    if (kind === 'jpeg' || kind === 'png') {
      const out = await runTrace('readPhoto', { buf: data });
      if (out.error) throw new HttpError(415, 'That photo couldn’t be read. Send a JPEG or PNG.');
      return { jpeg: out.jpeg, image: { width: out.width, height: out.height, data: out.data } };
    }
    if (!convertOn()) throw new HttpError(415, kind === 'heic' ? 'Send a JPEG or PNG (HEIC photos need the photo converter, which isn’t set up).' : 'Send a JPEG or PNG photo.');
    let r;
    try { r = await fetchImpl(`${convertUrl()}/convert?raw=1`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', Authorization: `Bearer ${metaKey()}` }, body: data, signal: AbortSignal.timeout(60000) }); } catch (e) { throw new HttpError(502, `The photo converter didn’t answer (${e.message}).`); }
    const out = await r.json().catch(() => ({}));
    if (!r.ok || !out.image || !out.rgb) throw new HttpError(r.status === 415 ? 415 : 502, out.message || `The photo converter said ${r.status}.`);
    const rgb = Buffer.from(out.rgb, 'base64'), n = out.width * out.height;
    if (rgb.length !== n * 3) throw new HttpError(502, 'The photo converter sent the wrong number of pixels.');
    const data4 = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) { data4[i * 4] = rgb[i * 3]; data4[i * 4 + 1] = rgb[i * 3 + 1]; data4[i * 4 + 2] = rgb[i * 3 + 2]; data4[i * 4 + 3] = 255; }
    return { jpeg: out.image, image: { width: out.width, height: out.height, data: data4 } };
  }

  // Wake the GPU (Modal sleeps it when idle, and loading SAM3 takes most of a
  // minute): the trace page asks as it opens and when a photo is picked, so the
  // model is loading while the photo is taken. Background only; nobody waits.
  let warmAt = 0;
  function warm() {
    if (!metaOn() || Date.now() - warmAt < 60e3) return false;
    warmAt = Date.now();
    fetchImpl(`${metaUrl()}/health`, { signal: AbortSignal.timeout(180000) }).then((r) => r.body?.cancel?.()).catch(() => {});
    return true;
  }
  // A trace runs as a job the page checks on every couple of seconds: a phone
  // drops a request that sits silent for a minute (a GPU waking up).
  const jobs = new Map();
  function startJob(image, engine) {
    for (const [id, j] of jobs) if (Date.now() - j.at > 10 * 60e3) jobs.delete(id);
    const id = randomBytes(9).toString('base64url'), job = { at: Date.now(), status: 'running' };
    jobs.set(id, job);
    outline(image, engine).then((tools) => { if (job.status === 'running') Object.assign(job, { status: 'done', tools }); }, (e) => { if (job.status === 'running') Object.assign(job, { status: 'error', error: e.message, code: e.status || 500 }); });
    // Never leave the page waiting for ever.
    setTimeout(() => { if (job.status === 'running') { console.warn('trace: gave up after 90 s'); Object.assign(job, { status: 'error', error: 'The AI took too long. Try again, or trace by hand.', code: 504 }); } }, JOB_LIMIT).unref?.();
    return id;
  }

  const rowOut = (r) => ({ id: r.id, name: r.name || '', folder: r.folder || '', aiLabel: r.ai_label || '', length: r.length_mm, width: r.width_mm, area: r.area_mm2, seen: r.seen, polygon: JSON.parse(r.polygon), createdAt: r.created_at, lastSeenAt: r.last_seen_at });
  const list = () => db.prepare('SELECT * FROM tool_library ORDER BY seen DESC, last_seen_at DESC LIMIT 500').all().map(rowOut);

  // Keep what a photo traced: match each tool to the library, count it, or add it.
  function record(user, tools) {
    if (!Array.isArray(tools)) throw new HttpError(400, 'Send the traced tools.');
    const all = db.prepare('SELECT * FROM tool_library').all().map(rowOut);
    const now = Date.now();
    return tools.slice(0, MAX_TOOLS).map((t) => {
      const length = num(t.length, 1, 2000), width = num(t.width, 0.5, 2000), area = num(t.area, 1, 4e6);
      const poly = Array.isArray(t.polygon) ? t.polygon.slice(0, 2000).map(([x, y]) => [Math.round(Number(x) * 100) / 100, Math.round(Number(y) * 100) / 100]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)) : [];
      if (!length || !width || !area || poly.length < 3) return null;
      const me = { length, width, area };
      const hit = all.find((k) => sameTool(k, me));
      const label = String(t.label || '').slice(0, 60);
      if (hit) {
        db.prepare('UPDATE tool_library SET seen = seen + 1, last_seen_at = ?, ai_label = COALESCE(NULLIF(ai_label, \'\'), ?) WHERE id = ?').run(now, label, hit.id);
        hit.seen += 1;
        return { id: hit.id, name: hit.name, aiLabel: hit.aiLabel || label, seen: hit.seen, known: true };
      }
      const id = Number(db.prepare('INSERT INTO tool_library (name, ai_label, length_mm, width_mm, area_mm2, polygon, seen, created_by, created_at, last_seen_at) VALUES (\'\', ?, ?, ?, ?, ?, 1, ?, ?, ?)').run(label, length, width, area, JSON.stringify(poly), user?.id || null, now, now).lastInsertRowid);
      all.push({ id, name: '', aiLabel: label, ...me, seen: 1 });
      return { id, name: '', aiLabel: label, seen: 1, known: false };
    });
  }

  async function handle(req, res, path, method, ctx, json) {
    if (!path.startsWith('/api/admin/tools')) return false;
    if (!can(ctx.user, 'settings.manage')) throw new HttpError(403, 'Your role does not allow that.');
    if (path === '/api/admin/tools/ai' && method === 'GET') return json(res, 200, { available: aiOn(), model: aiOn() ? pick() : null, engines: engines(), convert: convertOn() }), true;
    if (path === '/api/admin/tools/warm' && method === 'POST') return json(res, 200, { waking: warm() }), true;
    if (path === '/api/admin/tools/ai/jobs' && method === 'POST') {
      const body = await readJson(req, MAX_IMAGE * 1.4 + 1024);
      return json(res, 202, { job: startJob(body.image, body.engine) }), true;
    }
    const jm = path.match(/^\/api\/admin\/tools\/ai\/jobs\/([\w-]{8,20})$/);
    if (jm && method === 'GET') {
      const j = jobs.get(jm[1]);
      if (!j) throw new HttpError(404, 'That trace has expired. Try the photo again.');
      if (j.status === 'error') { jobs.delete(jm[1]); throw new HttpError(j.code, j.error); }
      if (j.status === 'done') jobs.delete(jm[1]);
      return json(res, 200, { status: j.status, tools: j.tools, seconds: Math.round((Date.now() - j.at) / 1000) }), true;
    }
    if (path === '/api/admin/tools/photo' && method === 'POST') {
      if (!convertOn()) throw new HttpError(503, 'No photo converter is set up (SAM3_CONVERT_URL or SAM3_URL).');
      const data = await readRaw(req, MAX_PHOTO);
      if (!data.length) throw new HttpError(400, 'Send the photo.');
      let r;
      const began = Date.now();
      try {
        r = await fetchImpl(`${convertUrl()}/convert`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', Authorization: `Bearer ${metaKey()}` }, body: data, signal: AbortSignal.timeout(60000) });
      } catch (e) {
        throw new HttpError(502, `The photo converter didn’t answer (${e.name === 'TimeoutError' ? 'timed out' : e.message}).`);
      }
      const out = await r.json().catch(() => ({}));
      if (!r.ok || !out.image) throw new HttpError(r.status === 415 ? 415 : 502, out.message || `The photo converter said ${r.status}.`);
      // ?trace=<engine>: start tracing the converted photo now, while the phone finds the paper.
      const want = new URL(req.url || '/', 'http://x').searchParams.get('trace');
      const job = want && aiOn() ? startJob(`data:image/jpeg;base64,${out.image}`, want) : null;
      return json(res, 200, { image: `data:image/jpeg;base64,${out.image}`, width: out.width, height: out.height, ms: Date.now() - began, job }), true;
    }
    if (path === '/api/admin/tools/ai' && method === 'POST') {
      const body = await readJson(req, MAX_IMAGE * 1.4 + 1024);
      return json(res, 200, { tools: await outline(body.image, body.engine) }), true;
    }
    if (path === '/api/admin/tools' && method === 'GET') return json(res, 200, { tools: list() }), true;
    // Several at once: delete them, or move them to a folder ('' takes them out of any).
    if (path === '/api/admin/tools/bulk' && method === 'POST') {
      const body = await readJson(req, 64 * 1024);
      const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 1000);
      if (!ids.length) throw new HttpError(400, 'Pick some tools first.');
      const q = ids.map(() => '?').join(',');
      if (body.action === 'delete') {
        const n = Number(db.prepare(`DELETE FROM tool_library WHERE id IN (${q})`).run(...ids).changes);
        audit?.log(ctx.user, 'tools.delete', 'tool_library', { ids: ids.slice(0, 50), count: n }, ctx.ip);
        return json(res, 200, { ok: true, count: n }), true;
      }
      if (body.action === 'move') return json(res, 200, { ok: true, count: Number(db.prepare(`UPDATE tool_library SET folder = ? WHERE id IN (${q})`).run(folderName(body.folder), ...ids).changes) }), true;
      throw new HttpError(400, 'Delete or move?');
    }
    if (path === '/api/admin/tools/record' && method === 'POST') {
      const body = await readJson(req, 2 * 1024 * 1024);
      return json(res, 200, { matches: record(ctx.user, body.tools) }), true;
    }
    const m = path.match(/^\/api\/admin\/tools\/(\d+)$/);
    if (m && method === 'PUT') {
      const body = await readJson(req, 4096);
      const row = db.prepare('SELECT name, folder FROM tool_library WHERE id = ?').get(Number(m[1]));
      if (!row) throw new HttpError(404, 'That tool is gone.');
      const name = body.name !== undefined ? String(body.name || '').trim().slice(0, 60) : row.name;
      const folder = body.folder !== undefined ? folderName(body.folder) : row.folder;
      db.prepare('UPDATE tool_library SET name = ?, folder = ? WHERE id = ?').run(name, folder, Number(m[1]));
      return json(res, 200, { ok: true }), true;
    }
    if (m && method === 'DELETE') {
      db.prepare('DELETE FROM tool_library WHERE id = ?').run(Number(m[1]));
      audit?.log(ctx.user, 'tools.delete', 'tool_library', { id: Number(m[1]) }, ctx.ip);
      return json(res, 200, { ok: true }), true;
    }
    return false;
  }

  // Photos are always readable now (JPEG and PNG here); convertOn() is only about HEIC.
  return { handle, aiOn, record, list, outline, convertRaw, convertOn, readOn: () => true };
}
