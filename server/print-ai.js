// Print AI API: checks a 3D print before slicing, after slicing and after it's
// printed, and says exactly what to change. Developer keys (vx_…) from the
// console work here too, on the same plan allowance as the engine API. It has
// its own switch (Admin → Print AI; off until turned on, staff keys work while
// it's off). Answers never say which AI looked at a photo: only "Print Doctor".
//
// GET  /api/ai/v1                    what the API is, and what's ready
// GET  /api/ai/v1/filaments          filament families and their safe ranges
// POST /api/ai/v1/check/settings     { settings, context } JSON, G-code (text) or a sliced 3MF as the body
// POST /api/ai/v1/check/model        an STL or 3MF as the body, or { kind, params, context } to check a VERTEX model
// POST /api/ai/v1/diagnose/photo     a photo of the print as the body (JPEG, PNG, WebP or HEIC), or { image, context, share }
// POST /api/ai/v1/outcomes           { job, result: good|failed|fixed, fixedBy, finding, note, context } → 202
// POST /api/ai/v1/watch/frame        live failure watch: a camera frame mid-print → continue, check or pause
// POST /api/ai/v1/apply              a settings file (.ini, .json or a 3MF project) as the body, ?name= &fixes=[{setting,to}]
//                                    → the same file with the fixes written in
// GET  /api/ai/v1/recipes            your own VERTEX Recipes (id, title, file)
// POST /api/ai/v1/recipes/:id/apply  as /apply, and the fixed file replaces that Recipe's profile on VERTEX
import { HttpError, RateLimiter, readJson } from './security.js';
import { hashToken } from './auth.js';
import { ipAllowed } from './api-guard.js';
import { buildParts } from '../engine/models.js';
import { API_KINDS } from './engine-api.js';
import {
  checkSettings, checkModel, filaments, settingsFromText, settingsFrom3mf, trisFromStl, trisFrom3mf, trisFromMeshes,
  summarise, SETTINGS_VERSION, MODEL_VERSION, FIX_KEYS, applyFixes,
} from './print-ai-checks.js';
import { zipStore } from '../engine/export.js';

const KEY = 'print_ai';
export const PHOTO_VERSION = 'photo-0.1.0';
export const AI_LIMITS = { photosPerMinute: 6, photosPerDay: 200, maxModelMb: 50, maxGcodeMb: 200, maxPhotoMb: 12 };
const SEND_PHOTO_MAX = 4.5 * 1024 * 1024; // bigger photos go through the converter first
const str = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

const SAY = {
  off: 'The Print AI API isn’t switched on yet. Watch the roadmap.',
  photoOff: 'Photo diagnosis isn’t available right now.',
  photo: 'Couldn’t read that photo. Send a JPEG, PNG, WebP or HEIC.',
  diagnose: 'Couldn’t look at this photo. Try again in a minute.',
  model: 'Couldn’t read that model. Send a binary or ASCII STL, or a 3MF.',
};

// The faults Print Doctor knows, with what usually causes each and the settings that fix it.
export const FAULTS = {
  'spaghetti': 'The print came off the bed or lost its support part way up, and the nozzle kept extruding into the air.',
  'warping': 'Corners lifted off the bed as the plastic cooled.',
  'stringing': 'Thin hairs between parts of the print, from ooze during travel moves.',
  'under-extrusion': 'Gaps, thin walls or missing lines: not enough plastic came out.',
  'over-extrusion': 'Blobby, rough or bulging walls: too much plastic came out.',
  'layer-shift': 'Layers slid sideways part way up.',
  'poor-first-layer': 'The first layer is patchy, rough or not stuck down.',
  'elephant-foot': 'The bottom layers bulge out wider than the rest.',
  'blobs-zits': 'Small bumps on the outer wall, usually where layers start and end.',
  'ringing': 'Ripples on the walls after corners and holes (vibration).',
  'layer-separation': 'Layers split apart or crack.',
  'drooping-overhang': 'Overhangs or bridges sagged or curled.',
  'pillowing': 'Bumpy or holey top surfaces.',
  'z-banding': 'Regular horizontal lines up the walls.',
  'clog': 'The print stops extruding part way through.',
  'support-scarring': 'Rough marks where supports touched the part.',
  'other': 'Something else.',
};

// The fault report the vision model fills in. Plain words; the member sees messages as they are.
const REPORT_TOOL = {
  name: 'report',
  description: 'Report what is wrong with this 3D print and exactly how to fix it.',
  input_schema: {
    type: 'object',
    required: ['isPrint', 'findings', 'summary'],
    properties: {
      isPrint: { type: 'boolean', description: 'False if the photo does not show an FDM 3D print or print in progress.' },
      summary: { type: 'string', description: 'One plain sentence for the maker.' },
      findings: {
        type: 'array', maxItems: 6,
        items: {
          type: 'object', required: ['code', 'severity', 'message', 'confidence'],
          properties: {
            code: { type: 'string', enum: Object.keys(FAULTS) },
            severity: { type: 'string', enum: ['info', 'warn', 'fail'] },
            message: { type: 'string', description: 'What is wrong and the most likely cause, in one or two plain sentences.' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            box: { type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4, description: 'x, y, w, h of the fault as fractions (0–1) of the image.' },
            fixes: {
              type: 'array', maxItems: 4,
              items: { type: 'object', required: ['setting', 'to'], properties: { setting: { type: 'string', description: 'Slicer setting key, e.g. nozzle_temperature, retraction_length, bed_temperature, outer_wall_speed, fan_max_speed, z_offset.' }, from: { type: ['number', 'string'] }, to: { type: ['number', 'string'] }, unit: { type: 'string' }, why: { type: 'string' } } },
            },
            test: { type: 'string', description: 'A quick test print or check that confirms the cause.' },
          },
        },
      },
    },
  },
};
const PROMPT = (ctx) => `You are Print Doctor, an expert in FDM 3D printing. Look at this photo of a 3D print and find what went wrong.
Known fault codes: ${Object.entries(FAULTS).map(([k, v]) => `${k} (${v})`).join('; ')}.
${ctx.printer || ctx.filament || ctx.nozzle ? `The maker says: printer ${ctx.printer || 'unknown'}, filament ${ctx.filament || 'unknown'}, nozzle ${ctx.nozzle || 'unknown'} mm.` : ''}
${ctx.settings ? `Their slicer settings that matter: ${JSON.stringify(ctx.settings).slice(0, 1500)}` : ''}
Rules: only report faults you can see. Give each fix as a slicer setting with a concrete new value (and the old one when known). Be specific to the filament. Never mention what AI or model you are. If the print looks good, return no findings and say so in the summary. Call the report tool.`;

/** One request to the vision model; returns the report tool's input. */
export async function askVision({ fetchImpl, key, model, mediaType, b64, context }) {
  const r = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      model, max_tokens: 2000,
      tools: [REPORT_TOOL], tool_choice: { type: 'tool', name: 'report' },
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } }, { type: 'text', text: PROMPT(context) }] }],
    }),
  });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`vision ${r.status}: ${String(body?.error?.message || '').slice(0, 200)}`);
  const use = body?.content?.find((c) => c.type === 'tool_use' && c.name === 'report');
  if (!use?.input) throw new Error('vision: no report');
  return use.input;
}

// Clean what came back: known codes, numbers in range, boxes inside the image.
export function cleanReport(raw) {
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || 0));
  const val = (v) => (typeof v === 'number' ? v : str(v, 40));
  const findings = (Array.isArray(raw?.findings) ? raw.findings : []).slice(0, 6).map((f) => {
    const code = FAULTS[f.code] ? f.code : 'other';
    const box = Array.isArray(f.box) && f.box.length === 4 ? f.box.map((v) => Math.round(clamp(v, 0, 1) * 1000) / 1000) : undefined;
    const fixes = (Array.isArray(f.fixes) ? f.fixes : []).slice(0, 4).filter((x) => x && x.setting && x.to !== undefined)
      .map((x) => ({ id: `${str(x.setting, 60)}:${val(x.to)}`, setting: str(x.setting, 60), ...(x.from !== undefined ? { from: val(x.from) } : {}), to: val(x.to), ...(x.unit ? { unit: str(x.unit, 10) } : {}), ...(x.why ? { why: str(x.why, 200) } : {}) }));
    return { code, severity: ['info', 'warn', 'fail'].includes(f.severity) ? f.severity : 'warn', message: str(f.message, 400) || FAULTS[code], confidence: Math.round(clamp(f.confidence, 0, 1) * 100) / 100, ...(box ? { box } : {}), ...(fixes.length ? { fixes } : {}), ...(f.test ? { test: str(f.test, 300) } : {}) };
  });
  if (raw?.isPrint === false) return { findings: [{ code: 'not-a-print', severity: 'info', message: 'This doesn’t look like a 3D print. Photograph the print up close, in good light.', confidence: 0.8 }], summary: 'No print found in the photo.' };
  if (!findings.length) return { findings: [{ code: 'all-clear', severity: 'info', message: str(raw?.summary, 300) || 'This print looks good.', confidence: 0.7 }], summary: 'All clear.' };
  return { findings, summary: str(raw?.summary, 300) || summarise(findings) };
}

// What a photo is, from its first bytes.
export function imageType(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47) return 'image/png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.length > 12 && buf.toString('ascii', 4, 8) === 'ftyp') return 'image/heic';
  return null;
}

export function createPrintAi({ db, isStaff, plans = null, audit = null, toolLibrary = null, link = null, env = process.env, fetchImpl = globalThis.fetch }) {
  const photoMinute = new RateLimiter(AI_LIMITS.photosPerMinute, 60e3);
  const photoDay = new RateLimiter(AI_LIMITS.photosPerDay, 86400e3);
  // Live watch: one frame every 20 seconds per job is plenty to catch a failure.
  const watchJob = new RateLimiter(1, 20e3);
  const streaks = new Map(); // key:job → { code, count, at }
  const minute = new RateLimiter(60, 60e3);
  const state = () => { try { return { on: false, photos: true, ...JSON.parse(db.prepare('SELECT value FROM settings WHERE key = ?').get(KEY)?.value || '{}') }; } catch { return { on: false, photos: true }; } };
  const save = (v) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(KEY, JSON.stringify(v));
  const visionKey = () => env.ANTHROPIC_API_KEY || '';
  const visionModel = () => env.PRINT_AI_VISION_MODEL || 'claude-sonnet-5-5';
  const photosReady = () => Boolean(visionKey()) && state().photos !== false;

  function requireKey(req, ctx) {
    const auth = String(req.headers?.authorization || '');
    const k = auth.startsWith('Bearer vx_') ? db.prepare('SELECT k.id AS key_id, k.allow_ips, k.sandbox, u.id, u.handle, u.role FROM engine_keys k JOIN users u ON u.id = k.user_id WHERE k.key_hash = ? AND k.revoked_at IS NULL AND u.role != \'banned\'').get(hashToken(auth.slice(7).trim())) : null;
    if (!k) throw new HttpError(401, 'Send your key as “Authorization: Bearer vx_…”. Make one in your console.');
    if (!ipAllowed(ctx.ip, k.allow_ips)) throw new HttpError(403, `That key only works from its allowed addresses, and ${ctx.ip || 'this address'} isn’t one of them.`);
    if (k.sandbox) { if (!minute.take(`t:${k.key_id}`)) throw new HttpError(429, 'Slow down: 60 calls a minute per key.'); return k; } // test keys: checks run, nothing counted
    if (!state().on && !isStaff(k)) throw new HttpError(503, SAY.off);
    if (plans) k.plan = plans.take(k.id, k.key_id);
    else if (!minute.take(`a:${k.key_id}`)) throw new HttpError(429, 'Slow down: 60 calls a minute per key.');
    db.prepare('UPDATE engine_keys SET calls = calls + 1, last_used_at = ? WHERE id = ?').run(Date.now(), k.key_id);
    return k;
  }

  async function readBody(req, maxMb) {
    const chunks = [];
    let n = 0;
    for await (const c of req) { n += c.length; if (n > maxMb * 1048576) throw new HttpError(413, `That file is too big (${maxMb} MB at most).`); chunks.push(c); }
    if (!n) throw new HttpError(400, 'Send the file as the body.');
    return Buffer.concat(chunks);
  }
  // Writing chosen fixes into a settings file: the same code Print Doctor on VERTEX runs.
  async function applyTo(req) {
    const q = new URL(req.url || '/', 'http://x').searchParams;
    const name = str(q.get('name'), 200), ext = (name.toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
    if (!ext) throw new HttpError(400, 'Name the file with ?name= (for example profile.ini), so we know its format.');
    let fixes;
    try { fixes = JSON.parse(String(q.get('fixes') || '[]')); } catch { throw new HttpError(400, 'fixes is a JSON list of { setting, to }.'); }
    const buf = await readBody(req, ext === '3mf' ? AI_LIMITS.maxModelMb : 4);
    let r;
    try { r = applyFixes(buf, ext, fixes, { zip: zipStore }); } catch (e) { throw e.status ? new HttpError(e.status, e.message) : e; }
    const outName = name.replace(/(\.[a-z0-9]+)$/i, '-fixed$1').replace(/[^\w. -]+/g, '_');
    return { ...r, ext, name: outName };
  }
  const recipesReady = () => Boolean(link?.on?.());

  // G-code can be hundreds of MB; only the "; key = value" comment lines matter, so read it as it streams.
  async function readGcode(req) {
    const out = {};
    let n = 0, rest = '';
    for await (const c of req) {
      n += c.length;
      if (n > AI_LIMITS.maxGcodeMb * 1048576) throw new HttpError(413, `That file is too big (${AI_LIMITS.maxGcodeMb} MB at most).`);
      const lines = (rest + c.toString('utf8')).split('\n');
      rest = lines.pop();
      for (const l of lines) if (l.charCodeAt(0) === 59 /* ; */ && l.includes('=')) Object.assign(out, settingsFromText(l));
      if (rest.length > 1e6) rest = '';
    }
    if (rest.startsWith(';')) Object.assign(out, settingsFromText(rest));
    return out;
  }
  const typeOf = (req) => String(req.headers?.['content-type'] || '').split(';')[0].trim().toLowerCase();
  const contextOf = (raw = {}) => {
    const c = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const out = { printer: str(c.printer, 80) || undefined, filament: str(c.filament, 30).toUpperCase() || undefined, nozzle: Number(c.nozzle) > 0 ? Number(c.nozzle) : undefined, nozzleType: str(c.nozzleType, 30) || undefined, recipe: str(c.recipe, 60) || undefined, job: str(c.job, 80) || undefined, overhangAngle: Number(c.overhangAngle) || undefined };
    if (Array.isArray(c.bed) && c.bed.length >= 2 && c.bed.every((v) => Number(v) > 0)) out.bed = c.bed.slice(0, 3).map(Number);
    return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined));
  };
  // Context can ride on the query string when the body is a file: ?filament=PETG&nozzle=0.4&bed=256,256,256
  const queryContext = (req) => {
    const q = new URL(req.url || '/', 'http://x').searchParams;
    return contextOf({ printer: q.get('printer'), filament: q.get('filament'), nozzle: q.get('nozzle'), nozzleType: q.get('nozzleType'), job: q.get('job'), overhangAngle: q.get('overhangAngle'), bed: q.get('bed') ? q.get('bed').split(',') : undefined });
  };

  // ---------- checks
  async function settingsCheck(req) {
    const type = typeOf(req);
    if (type === 'application/json') {
      const body = await readJson(req, 512 * 1024);
      const context = contextOf(body.context);
      if (typeof body.gcode === 'string') return checkSettings(settingsFromText(body.gcode), context);
      if (body.settings && (typeof body.settings !== 'object' || Array.isArray(body.settings))) throw new HttpError(400, 'settings must be an object of slicer settings.');
      return checkSettings(body.settings || {}, context);
    }
    const context = queryContext(req);
    if (/3mf|zip/.test(type)) {
      const buf = await readBody(req, AI_LIMITS.maxModelMb * 4);
      let s;
      try { s = settingsFrom3mf(buf); } catch { throw new HttpError(400, 'Couldn’t read that 3MF.'); }
      if (!Object.keys(s).length) throw new HttpError(422, 'That 3MF has no slicer settings in it. Send a sliced 3MF (File → Export plate sliced file), or the G-code.');
      return checkSettings(s, context);
    }
    const s = await readGcode(req);
    if (!Object.keys(s).length) throw new HttpError(422, 'No slicer settings found. Send G-code with its settings comments (OrcaSlicer, Bambu Studio and PrusaSlicer write them), a sliced 3MF, or { "settings": { … } } as JSON.');
    return checkSettings(s, context);
  }

  async function modelCheck(req, ctx) {
    const type = typeOf(req);
    if (type === 'application/json') {
      const body = await readJson(req, 64 * 1024);
      const kind = str(body.kind, 20);
      if (!API_KINDS[kind]) throw new HttpError(400, `Send an STL or 3MF as the body, or { "kind", "params" } with kind one of ${Object.keys(API_KINDS).join(', ')}.`);
      if (body.params !== undefined && (typeof body.params !== 'object' || body.params === null || Array.isArray(body.params))) throw new HttpError(400, 'params must be an object of settings.');
      let parts;
      try { parts = buildParts(kind, { ...(body.params || {}) }); } catch (e) { throw new HttpError(400, `The ${kind} generator refused those settings: ${e.message}`); }
      if (!parts?.length) throw new HttpError(400, 'Those settings make nothing.');
      if (ctx.apiMeta) Object.assign(ctx.apiMeta, { kind: `ai-model:${kind}`, params: body.params || {} });
      const context = contextOf(body.context);
      return { parts: parts.map((p) => ({ name: p.name, ...checkModel(trisFromMeshes([p.mesh]), context) })), model: MODEL_VERSION };
    }
    const buf = await readBody(req, AI_LIMITS.maxModelMb);
    let tris;
    try { tris = buf[0] === 0x50 && buf[1] === 0x4b ? trisFrom3mf(buf) : trisFromStl(buf); } catch { throw new HttpError(400, SAY.model); }
    if (tris.length / 9 > 3_000_000) throw new HttpError(413, 'That model has too many triangles (3 million at most).');
    if (ctx.apiMeta) Object.assign(ctx.apiMeta, { kind: 'ai-model', params: { bytes: buf.length, triangles: tris.length / 9 } });
    return checkModel(tris, queryContext(req));
  }

  async function diagnose(req, k, ctx) {
    if (k.sandbox) { // a test key: a fixed sample report, so integrations can be built without a vision key or a bill
      for await (const _ of req) { /* drain */ }
      return { findings: [{ code: 'stringing', severity: 'warn', message: 'Sample: thin hairs between the towers, from ooze while travelling.', confidence: 0.9, box: [0.3, 0.2, 0.4, 0.3], fixes: [{ id: 'nozzle_temperature:215', setting: 'nozzle_temperature', from: 230, to: 215, unit: '°C', why: 'Less ooze.' }], test: 'Print a two-tower stringing test.' }], summary: 'Sample report from a test key.', model: PHOTO_VERSION, test: true };
    }
    if (!photosReady()) throw new HttpError(503, SAY.photoOff);
    if (!photoMinute.take(`p:${k.key_id}`)) throw new HttpError(429, `Slow down: ${AI_LIMITS.photosPerMinute} photos a minute per key.`);
    if (!photoDay.take(`p:${k.key_id}`)) throw new HttpError(429, `That key has sent ${AI_LIMITS.photosPerDay} photos today. Tomorrow, then.`);
    let photo, context, share = false;
    if (typeOf(req) === 'application/json') {
      const body = await readJson(req, AI_LIMITS.maxPhotoMb * 1048576 * 1.4);
      const b64 = String(body.image || '').replace(/^data:[^,]*,/, '');
      if (!b64) throw new HttpError(400, 'Send the photo as the body, or as { "image": base64 }.');
      photo = Buffer.from(b64, 'base64');
      context = contextOf(body.context);
      if (body.settings && typeof body.settings === 'object') context.settings = Object.fromEntries(Object.entries(body.settings).slice(0, 40).map(([a, b]) => [str(a, 60), str(b, 60)]));
      share = Boolean(body.share);
    } else {
      photo = await readBody(req, AI_LIMITS.maxPhotoMb);
      context = queryContext(req);
    }
    let mediaType = imageType(photo);
    if (!mediaType) throw new HttpError(415, SAY.photo);
    let b64 = photo.toString('base64');
    // HEIC and very big photos go through the photo converter: an upright JPEG, 1600 px a side.
    if (mediaType === 'image/heic' || photo.length > SEND_PHOTO_MAX) {
      // JPEG and PNG are shrunk here; only HEIC needs the photo converter.
      if (mediaType === 'image/heic' ? !toolLibrary?.convertOn?.() : !toolLibrary?.convertRaw) throw new HttpError(mediaType === 'image/heic' ? 415 : 413, mediaType === 'image/heic' ? 'Send a JPEG or PNG (HEIC needs the photo converter, which isn’t set up).' : 'That photo is too big. Send one under 4.5 MB.');
      try { b64 = (await toolLibrary.convertRaw(photo)).jpeg; mediaType = 'image/jpeg'; } catch { throw new HttpError(415, SAY.photo); }
    }
    if (ctx.apiMeta) Object.assign(ctx.apiMeta, { kind: 'ai-photo', params: { bytes: photo.length, ...context, settings: undefined } });
    let raw;
    try { raw = await askVision({ fetchImpl, key: visionKey(), model: visionModel(), mediaType, b64, context }); } catch (e) {
      console.warn(`print ai: key ${k.key_id} photo failed: ${e.message}`); // the real reason stays in our logs
      throw new HttpError(502, SAY.diagnose);
    }
    const out = cleanReport(raw);
    if (share) db.prepare('INSERT INTO print_ai_outcomes (user_id, key_id, kind, job, result, finding, context, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(k.id, k.key_id, 'photo', context.job || null, 'diagnosed', out.findings.map((f) => f.code).join(','), JSON.stringify(context).slice(0, 4000), null, Date.now());
    return { ...out, model: PHOTO_VERSION };
  }

  // Live failure watch. Faults that waste a whole spool if left: pause, but only
  // when two frames in a row agree (one blurry frame never stops a print).
  const STOP = new Set(['spaghetti', 'layer-shift', 'clog', 'layer-separation']);
  async function watchFrame(req, k, ctx) {
    const job = str(new URL(req.url, 'http://x').searchParams.get('job') || '', 80);
    if (!job) throw new HttpError(400, 'Which print? Send ?job= with your own id for it, the same on every frame.');
    if (!k.sandbox && !watchJob.take(`w:${k.key_id}:${job}`)) throw new HttpError(429, 'One frame every 20 seconds per job is enough to catch a failure.');
    const report = await diagnose(req, k, ctx);
    const id = `${k.key_id}:${job}`;
    const worst = report.findings.filter((f) => STOP.has(f.code) && (f.confidence ?? 0.5) >= 0.6).sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
    const prev = streaks.get(id);
    const streak = worst ? (prev?.code === worst.code ? prev.count + 1 : 1) : 0;
    if (worst) streaks.set(id, { code: worst.code, count: streak, at: Date.now() }); else streaks.delete(id);
    if (streaks.size > 5000) for (const [key, v] of streaks) if (Date.now() - v.at > 6 * 3600e3) streaks.delete(key);
    const warn = report.findings.some((f) => f.severity === 'warn' || f.severity === 'fail');
    const action = worst && streak >= 2 ? 'pause' : worst || warn ? 'check' : 'continue';
    const say = { pause: `Pause it: ${FAULTS[worst?.code] || 'a failure'} Seen on ${streak} frames in a row.`, check: worst ? `Keep an eye on it: this frame looks like ${worst.code.replace(/-/g, ' ')}. One more frame like it and we’ll say pause.` : 'Something’s not quite right. Have a look when you can.', continue: 'Looks fine. Carry on.' }[action];
    return { action, message: say, job, streak, fault: worst?.code || null, findings: report.findings, model: report.model, ...(report.test ? { test: true } : {}) };
  }

  function outcome(k, body) {
    const result = str(body.result, 10);
    if (!['good', 'failed', 'fixed'].includes(result)) throw new HttpError(400, 'result must be good, failed or fixed.');
    const job = str(body.job, 80);
    if (!job) throw new HttpError(400, 'Which job? Send "job" (your own id for the print is fine).');
    const id = Number(db.prepare('INSERT INTO print_ai_outcomes (user_id, key_id, kind, job, result, finding, fixed_by, context, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(k.id, k.key_id, 'outcome', job, result, str(body.finding, 60) || null, str(body.fixedBy, 80) || null, JSON.stringify(contextOf(body.context)), str(body.note, 500) || null, Date.now()).lastInsertRowid);
    return { id, recorded: true };
  }

  const info = () => ({
    name: 'VERTEX Print AI API', version: 1, enabled: Boolean(state().on), docs: '/docs#print-ai',
    checkers: { settings: SETTINGS_VERSION, model: MODEL_VERSION, photo: PHOTO_VERSION },
    ready: { settings: true, model: true, photo: photosReady(), watch: photosReady() },
    limits: { photosPerMinute: AI_LIMITS.photosPerMinute, photosPerDay: AI_LIMITS.photosPerDay, maxModelMb: AI_LIMITS.maxModelMb, maxGcodeMb: AI_LIMITS.maxGcodeMb, maxPhotoMb: AI_LIMITS.maxPhotoMb },
    faults: Object.keys(FAULTS),
    fixable: Object.keys(FIX_KEYS),
  });

  function stats() {
    const since = Date.now() - 30 * 86400e3;
    const by = db.prepare('SELECT kind, result, COUNT(*) AS n FROM print_ai_outcomes WHERE created_at > ? GROUP BY kind, result').all(since);
    const recent = db.prepare('SELECT o.id, o.kind, o.job, o.result, o.finding, o.fixed_by, o.note, o.created_at, u.handle FROM print_ai_outcomes o LEFT JOIN users u ON u.id = o.user_id ORDER BY o.id DESC LIMIT 25').all();
    return { last30Days: by, recent };
  }

  async function handle(req, res, path, method, ctx, json) {
    // ---------- staff
    if (path === '/api/admin/print-ai') {
      if (method === 'GET') return json(res, 200, { ...state(), visionKey: Boolean(visionKey()), visionModel: visionModel(), ...stats() }), true;
      if (method === 'PUT') {
        const body = await readJson(req, 4096);
        const next = { ...state(), ...('on' in body ? { on: Boolean(body.on) } : {}), ...('photos' in body ? { photos: Boolean(body.photos) } : {}) };
        save(next);
        audit?.log(ctx.user, 'printai.switch', KEY, next, ctx.ip);
        return json(res, 200, state()), true;
      }
      return false;
    }
    if (!path.startsWith('/api/ai/v1')) return false;
    // ---------- open
    if (path === '/api/ai/v1' && method === 'GET' && !req.headers?.authorization) return json(res, 200, info(), { 'Cache-Control': 'public, max-age=60' }), true;
    if (path === '/api/ai/v1/filaments' && method === 'GET') return json(res, 200, { filaments: filaments() }, { 'Cache-Control': 'public, max-age=3600' }), true;
    // ---------- with a key
    const k = requireKey(req, ctx);
    const planHeaders = k.plan ? { 'X-Mint-Plan': k.plan.plan.id, ...(k.plan.over ? { 'X-Mint-Extra-Use': '1' } : {}) } : {};
    if (path === '/api/ai/v1' && method === 'GET') return json(res, 200, { ...info(), key: { user: k.handle || null, staff: isStaff(k) } }, planHeaders), true;
    if (path === '/api/ai/v1/check/settings' && method === 'POST') {
      const r = await settingsCheck(req);
      if (ctx.apiMeta && !ctx.apiMeta.kind) Object.assign(ctx.apiMeta, { kind: 'ai-settings', params: { filament: r.filament, nozzle: r.nozzle, read: r.read } });
      return json(res, 200, r, planHeaders), true;
    }
    if (path === '/api/ai/v1/check/model' && method === 'POST') return json(res, 200, await modelCheck(req, ctx), planHeaders), true;
    if (path === '/api/ai/v1/diagnose/photo' && method === 'POST') return json(res, 200, await diagnose(req, k, ctx), planHeaders), true;
    if (path === '/api/ai/v1/outcomes' && method === 'POST') return json(res, 202, outcome(k, await readJson(req, 8192)), planHeaders), true;
    if (path === '/api/ai/v1/watch/frame' && method === 'POST') return json(res, 200, await watchFrame(req, k, ctx), planHeaders), true;
    if (path === '/api/ai/v1/apply' && method === 'POST') {
      const r = await applyTo(req);
      if (ctx.apiMeta && !ctx.apiMeta.kind) Object.assign(ctx.apiMeta, { kind: 'ai-apply', params: { file: r.ext, applied: r.applied } });
      res.writeHead(200, { ...planHeaders, 'Content-Type': r.ext === 'json' ? 'application/json' : r.ext === '3mf' ? 'model/3mf' : 'text/plain; charset=utf-8', 'Content-Length': r.buf.length, 'Content-Disposition': `attachment; filename="${r.name}"`, 'X-Fixes-Applied': r.applied.join(','), 'X-Fixes-Missing': r.missing.join(','), 'Cache-Control': 'no-store' });
      res.end(r.buf);
      return true;
    }
    if (path === '/api/ai/v1/recipes' && method === 'GET') {
      if (!recipesReady()) throw new HttpError(503, 'Recipes aren’t reachable right now. Try again soon.');
      return json(res, 200, { recipes: (await link.recipes(k.id)).recipes }, { ...planHeaders, 'Cache-Control': 'no-store' }), true;
    }
    const ra = path.match(/^\/api\/ai\/v1\/recipes\/([\w-]{6,20})\/apply$/);
    if (ra && method === 'POST') {
      if (k.sandbox) throw new HttpError(403, 'Test keys can’t change Recipes. Use /api/ai/v1/apply to get the fixed file back.');
      if (!recipesReady()) throw new HttpError(503, 'Recipes aren’t reachable right now. Try again soon.');
      const r = await applyTo(req);
      if (!r.applied.length) throw new HttpError(400, `None of those settings are in this file (${r.missing.join(', ')}), so the Recipe is unchanged.`);
      if (r.buf.length > 20 * 1048576) throw new HttpError(413, 'Recipe profiles can be up to 20 MB. Use /api/ai/v1/apply for the file, and trim the project before sharing it.');
      const saved = await link.recipeFile(k.id, ra[1], r.name, r.buf);
      audit?.log({ id: k.id, handle: k.handle }, 'printai.recipe', ra[1], { applied: r.applied }, ctx.ip);
      if (ctx.apiMeta && !ctx.apiMeta.kind) Object.assign(ctx.apiMeta, { kind: 'ai-recipe', params: { recipe: ra[1], applied: r.applied } });
      return json(res, 200, { applied: r.applied, missing: r.missing, recipe: saved.recipe, held: Boolean(saved.held), note: 'A new file means the Recipe is checked again before it shows as verified.' }, planHeaders), true;
    }
    throw new HttpError(404, 'Not here. See GET /api/ai/v1.');
  }

  return { handle, info, isOn: () => Boolean(state().on), photosReady };
}
