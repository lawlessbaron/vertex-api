// Custom generators on the engine ("like OpenSCAD", but nothing of yours is
// ever run): a generator is a recipe of engine parts. It has inputs (numbers,
// choices, on/off), and a list of parts, each one of our kinds with its
// settings, a place and a turn. Settings can name an input ("$width") or be a
// small formula ("=$width * 42 - 0.5") that we read ourselves (numbers, + - * /,
// brackets, min max round floor ceil abs clamp) and never hand to JavaScript.
//
// The check runs a recipe on our reference engine with its defaults, its
// smallest and largest numbers and every choice, and reports parts that are
// broken or off-spec, settings that change nothing, and a match score. A
// recipe that scores 95% or better with nothing broken or off-spec is Verified.
import { randomBytes } from 'node:crypto';
import { HttpError, RateLimiter } from './security.js';
import { Mesh } from '../engine/geometry/mesh.js';

export const CUSTOM_LIMITS = { inputs: 24, parts: 24, built: 48, triangles: 2_000_000, specBytes: 32 * 1024, perUser: 50 };
const ID = /^[a-z][a-zA-Z0-9_]{0,23}$/;

// ---------- formulas ----------
const FNS = { min: Math.min, max: Math.max, round: Math.round, floor: Math.floor, ceil: Math.ceil, abs: Math.abs, clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)) };
/** Reads "=…" (without the =) with the given inputs. Throws a plain Error on anything it doesn't know. */
export function evalFormula(src, vars) {
  const toks = String(src).match(/\$?[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|\.\d+|[-+*/(),]|\S/g) || [];
  if (toks.length > 200) throw new Error('That formula is too long.');
  let i = 0;
  const peek = () => toks[i], take = (t) => { if (toks[i] !== t) throw new Error(`Expected "${t}" in the formula.`); i++; };
  function primary() {
    const t = toks[i++];
    if (t === undefined) throw new Error('The formula ends too soon.');
    if (t === '(') { const v = sum(); take(')'); return v; }
    if (t === '-') return -primary();
    if (t === '+') return primary();
    if (/^(\d|\.)/.test(t)) return Number(t);
    if (t[0] === '$') {
      const v = vars[t.slice(1)];
      if (typeof v === 'boolean') return v ? 1 : 0;
      if (typeof v !== 'number') throw new Error(`${t} isn’t a number input.`);
      return v;
    }
    if (Object.hasOwn(FNS, t)) {
      take('(');
      const args = [];
      if (peek() !== ')') { args.push(sum()); while (peek() === ',') { i++; args.push(sum()); } }
      take(')');
      return FNS[t](...args);
    }
    throw new Error(`The formula doesn’t know "${t}".`);
  }
  function product() { let v = primary(); while (peek() === '*' || peek() === '/') { const op = toks[i++]; const r = primary(); v = op === '*' ? v * r : v / r; } return v; }
  function sum() { let v = product(); while (peek() === '+' || peek() === '-') { const op = toks[i++]; const r = product(); v = op === '+' ? v + r : v - r; } return v; }
  const v = sum();
  if (i < toks.length) throw new Error(`The formula has extra "${toks[i]}".`);
  if (!Number.isFinite(v)) throw new Error('The formula doesn’t give a number (dividing by zero?).');
  return Math.round(v * 1e6) / 1e6;
}
/** A setting's value with these inputs: "$id" is the input itself, "=…" a formula, anything else as written. */
export function resolveValue(v, vars) {
  if (typeof v === 'string' && v.startsWith('=')) return evalFormula(v.slice(1), vars);
  if (typeof v === 'string' && /^\$[A-Za-z_]\w*$/.test(v)) { const k = v.slice(1); if (!Object.hasOwn(vars, k)) throw new Error(`There’s no input called ${v}.`); return vars[k]; }
  return v;
}

// ---------- the recipe ----------
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
/** A recipe, cleaned and checked for shape (not yet built). Throws HttpError 400 with what's wrong. */
export function cleanSpec(raw, kinds) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpError(400, 'Send the generator as an object: { name, inputs, parts }.');
  if (JSON.stringify(raw).length > CUSTOM_LIMITS.specBytes) throw new HttpError(413, 'That generator is too big (32 KB at most).');
  const name = String(raw.name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!name) throw new HttpError(400, 'Give the generator a name.');
  const inputs = (Array.isArray(raw.inputs) ? raw.inputs : []).slice(0, CUSTOM_LIMITS.inputs + 1);
  if (inputs.length > CUSTOM_LIMITS.inputs) throw new HttpError(400, `${CUSTOM_LIMITS.inputs} inputs at most.`);
  const seen = new Set();
  const cleanInputs = inputs.map((x, n) => {
    const id = String(x?.id || '');
    if (!ID.test(id)) throw new HttpError(400, `Input ${n + 1}: its id must be a short word starting with a letter (like "width").`);
    if (seen.has(id)) throw new HttpError(400, `Two inputs are called ${id}.`);
    seen.add(id);
    const label = String(x.label || id).slice(0, 60), type = x.type || 'number';
    if (type === 'number') {
      const min = num(x.min, 0), max = num(x.max, 100);
      if (!(max > min)) throw new HttpError(400, `${id}: max must be more than min.`);
      const def = Math.min(max, Math.max(min, num(x.default, min)));
      return { id, label, type, min, max, step: Math.max(0, num(x.step, 0)) || undefined, default: def, unit: String(x.unit || '').slice(0, 8) || undefined };
    }
    if (type === 'choice') {
      const options = (Array.isArray(x.options) ? x.options : []).map((o) => String(o).slice(0, 40)).filter(Boolean).slice(0, 20);
      if (options.length < 2) throw new HttpError(400, `${id}: a choice needs at least 2 options.`);
      return { id, label, type, options, default: options.includes(String(x.default)) ? String(x.default) : options[0] };
    }
    if (type === 'bool') return { id, label, type, default: Boolean(x.default) };
    throw new HttpError(400, `${id}: type must be number, choice or bool.`);
  });
  const parts = Array.isArray(raw.parts) ? raw.parts : [];
  if (!parts.length) throw new HttpError(400, 'Add at least one part.');
  if (parts.length > CUSTOM_LIMITS.parts) throw new HttpError(400, `${CUSTOM_LIMITS.parts} parts at most.`);
  const cleanParts = parts.map((p, n) => {
    const kind = String(p?.kind || '');
    if (!kinds[kind]) throw new HttpError(400, `Part ${n + 1}: kind must be one of ${Object.keys(kinds).join(', ')}.`);
    if (p.params !== undefined && (typeof p.params !== 'object' || Array.isArray(p.params) || p.params === null)) throw new HttpError(400, `Part ${n + 1}: params must be an object.`);
    const vec = (v, what) => { if (v === undefined) return [0, 0, 0]; if (!Array.isArray(v) || v.length !== 3) throw new HttpError(400, `Part ${n + 1}: ${what} is [x, y, z].`); return v.map((x) => (typeof x === 'string' ? x : num(x, 0))); };
    const repeat = p.repeat ? { count: p.repeat.count ?? 1, step: vec(p.repeat.step, 'repeat.step') } : null;
    return { kind, name: String(p.name || `${kind}-${n + 1}`).replace(/[^\w-]+/g, '-').slice(0, 40), params: { ...(p.params || {}) }, at: vec(p.at, 'at'), rotate: vec(p.rotate, 'rotate'), when: p.when ?? true, repeat, merge: p.merge !== false };
  });
  return { name, description: String(raw.description || '').slice(0, 500), inputs: cleanInputs, parts: cleanParts };
}

/** The inputs to build with: the defaults, overridden by what's sent (kept inside each input's range). */
export function inputsFor(spec, sent = {}) {
  const out = {};
  for (const x of spec.inputs) {
    const v = sent?.[x.id];
    if (x.type === 'number') out[x.id] = v === undefined ? x.default : Math.min(x.max, Math.max(x.min, num(v, x.default)));
    else if (x.type === 'choice') out[x.id] = x.options.includes(String(v)) ? String(v) : x.default;
    else out[x.id] = v === undefined ? x.default : Boolean(v);
  }
  return out;
}

// A turn about x, then y, then z (degrees), and a move, applied to a copy.
function placed(mesh, rot, at) {
  const m = new Mesh();
  m.positions = Array.from(mesh.positions);
  m.indices = Array.from(mesh.indices);
  const [ax, ay, az] = rot.map((d) => (d * Math.PI) / 180);
  if (ax || ay || az) {
    const [cx, sx, cy, sy, cz, sz] = [Math.cos(ax), Math.sin(ax), Math.cos(ay), Math.sin(ay), Math.cos(az), Math.sin(az)];
    const p = m.positions;
    for (let i = 0; i < p.length; i += 3) {
      let [x, y, z] = [p[i], p[i + 1], p[i + 2]];
      [y, z] = [y * cx - z * sx, y * sx + z * cx];
      [x, z] = [x * cy + z * sy, -x * sy + z * cy];
      [x, y] = [x * cz - y * sz, x * sz + y * cz];
      p[i] = x; p[i + 1] = y; p[i + 2] = z;
    }
  }
  return m.translate(...at);
}

/**
 * Builds a recipe with these inputs on the engine. buildKind(kind, params) → [{ mesh, name }]
 * (the engine API's own, with its limits). Returns { parts: [{ mesh, name }], log: [{ part, kind, params }] }.
 */
export function buildCustom(spec, sent, buildKind) {
  const vars = inputsFor(spec, sent);
  const out = [], log = [];
  let tris = 0;
  for (const p of spec.parts) {
    const val = (v, what) => { try { return resolveValue(v, vars); } catch (e) { throw new HttpError(400, `${p.name}: ${what}: ${e.message}`); } };
    const on = val(p.when, 'when');
    if (!on || on === 'false' || on === 0) continue;
    const count = p.repeat ? Math.round(Number(val(p.repeat.count, 'repeat.count'))) : 1;
    if (!(count >= 1)) continue;
    const params = Object.fromEntries(Object.entries(p.params).map(([k, v]) => [k, val(v, k)]));
    const at = p.at.map((v, i) => Number(val(v, `at[${i}]`)) || 0), rot = p.rotate.map((v, i) => Number(val(v, `rotate[${i}]`)) || 0);
    const step = p.repeat ? p.repeat.step.map((v, i) => Number(val(v, `repeat.step[${i}]`)) || 0) : [0, 0, 0];
    if (out.length + count > CUSTOM_LIMITS.built) throw new HttpError(400, `That makes more than ${CUSTOM_LIMITS.built} parts.`);
    let built;
    try { built = buildKind(p.kind, params); } catch (e) { throw new HttpError(e.status || 400, `${p.name}: ${e.message}`); }
    log.push({ part: p.name, kind: p.kind, params, count });
    for (let r = 0; r < count; r++) {
      const pos = at.map((v, i) => v + step[i] * r);
      const pieces = built.map((b) => ({ mesh: placed(b.mesh, rot, pos), name: built.length > 1 ? `${p.name}${count > 1 ? `-${r + 1}` : ''}-${b.name}` : `${p.name}${count > 1 ? `-${r + 1}` : ''}` }));
      for (const x of pieces) { tris += x.mesh.triangleCount; if (tris > CUSTOM_LIMITS.triangles) throw new HttpError(400, 'That model is too detailed (2 million triangles at most).'); }
      out.push(...pieces);
    }
  }
  if (!out.length) throw new HttpError(400, 'With these inputs, every part is switched off.');
  return { parts: out, log };
}

// ---------- the check, against our reference engine ----------
/** The input sets the check tries: the defaults, every number at its smallest and largest, every choice and switch. */
export function sampleInputs(spec) {
  const base = inputsFor(spec);
  const sets = [{ label: 'defaults', inputs: base }];
  for (const x of spec.inputs) {
    if (x.type === 'number') { sets.push({ label: `${x.id} at ${x.min}`, inputs: { ...base, [x.id]: x.min } }, { label: `${x.id} at ${x.max}`, inputs: { ...base, [x.id]: x.max } }); }
    else if (x.type === 'choice') for (const o of x.options) { if (o !== x.default) sets.push({ label: `${x.id} = ${o}`, inputs: { ...base, [x.id]: o } }); }
    else sets.push({ label: `${x.id} ${x.default ? 'off' : 'on'}`, inputs: { ...base, [x.id]: !x.default } });
  }
  return sets.slice(0, 40);
}

/**
 * Runs the recipe on the reference engine. kinds: API_KINDS (with defaults); buildKind as for buildCustom.
 * → { score, verified, runs, findings: [{ level: 'broken'|'off-spec'|'no-effect'|'note', part, text }] }
 */
export function checkCustom(spec, kinds, buildKind, { budgetMs = 5000 } = {}) {
  const findings = [], add = (level, part, text) => { if (!findings.some((f) => f.level === level && f.part === part && f.text === text)) findings.push({ level, part, text }); };
  let ok = 0, total = 0;
  const sets = sampleInputs(spec);
  const used = new Map(); // part → param → values seen
  const t0 = Date.now();
  let runs = 0;
  for (const s of sets) {
    // A time budget (the engine runs on the server thread): heavy recipes are checked on as many sets as fit, and can't be Verified until they fit.
    if (Date.now() - t0 > budgetMs) { add('note', null, `Checked ${runs} of ${sets.length} input sets before the time ran out; a lighter recipe can be checked in full.`); break; }
    runs++;
    let r;
    for (const p of spec.parts) total++;
    try { r = buildCustom(spec, s.inputs, (kind, params) => {
      try { return buildKind(kind, params); } catch (e) { throw Object.assign(new Error(e.message), { kindFailed: true }); }
    }); } catch (e) {
      const part = (/^([\w-]+):/.exec(e.message) || [])[1] || null;
      add('broken', part, `${s.label}: ${e.message.replace(/^[\w-]+:\s*/, '')}`);
      continue;
    }
    const built = new Set(r.log.map((l) => l.part));
    ok += r.log.length + spec.parts.filter((p) => !built.has(p.name)).length; // switched off on purpose counts as fine
    for (const l of r.log) {
      const m = used.get(l.part) || new Map();
      for (const [k, v] of Object.entries(l.params)) m.set(k, (m.get(k) || new Set()).add(JSON.stringify(v)));
      used.set(l.part, m);
    }
    // Off-spec: below the bed, or nothing there at all.
    for (const x of r.parts) {
      const b = x.mesh.bounds();
      if (!x.mesh.triangleCount) add('broken', x.name, `${s.label}: makes nothing.`);
      else if (b.min[2] < -0.05) add('off-spec', x.name, `${s.label}: goes ${(-b.min[2]).toFixed(1)} mm below the bed. Raise it with "at".`);
    }
    // Two parts exactly the same in the same place: one changes nothing.
    const sig = new Map();
    for (const l of r.log) {
      const p = spec.parts.find((q) => q.name === l.part);
      const key = JSON.stringify([l.kind, l.params, p.at, p.rotate, l.count]);
      if (sig.has(key)) add('no-effect', l.part, `The same as ${sig.get(key)}, in the same place.`);
      else sig.set(key, l.part);
    }
  }
  // Settings that change nothing: not a setting of that kind, or always the kind's own default.
  for (const p of spec.parts) {
    const defs = kinds[p.kind]?.defaults || {};
    for (const k of Object.keys(p.params)) {
      if (!Object.hasOwn(defs, k)) { add('no-effect', p.name, `"${k}" isn’t a ${p.kind} setting, so it changes nothing. See GET /engine/v1/kinds.`); continue; }
      const vals = used.get(p.name)?.get(k);
      if (vals && vals.size === 1 && [...vals][0] === JSON.stringify(defs[k])) add('no-effect', p.name, `"${k}" is always ${JSON.stringify(defs[k])}, the ${p.kind} default, so it can go.`);
    }
  }
  // Inputs nothing uses.
  const text = JSON.stringify(spec.parts);
  for (const x of spec.inputs) if (!new RegExp(`\\$${x.id}\\b`).test(text)) add('no-effect', null, `The input ${x.id} isn’t used by any part.`);
  const clean = total ? ok / total : 0;
  const penalty = findings.filter((f) => f.level === 'no-effect').length * 0.02;
  const score = Math.max(0, Math.round((clean - penalty) * 1000) / 1000);
  const verified = score >= 0.95 && runs === sets.length && !findings.some((f) => f.level === 'broken' || f.level === 'off-spec');
  return { score, verified, runs, of: sets.length, findings };
}

// ---------- saved generators ----------
export function createCustomGenerators({ db, kinds, buildKind, audit = null, now = () => Date.now() }) {
  const out = (r, mine = false) => r && ({
    id: r.id, name: r.name, description: r.description, author: r.handle ? `@${r.handle}` : null, verified: Boolean(r.verified), score: r.score, public: Boolean(r.public), uses: r.uses,
    inputs: JSON.parse(r.spec).inputs, createdAt: r.created_at, updatedAt: r.updated_at, ...(mine ? { spec: JSON.parse(r.spec), check: JSON.parse(r.check_json || 'null') } : {}),
  });
  const row = (id) => db.prepare('SELECT g.*, u.handle FROM custom_generators g LEFT JOIN users u ON u.id = g.user_id WHERE g.id = ?').get(String(id));
  const check = (raw) => { const spec = cleanSpec(raw, kinds); return { spec, check: checkCustom(spec, kinds, buildKind) }; };
  function save(userId, raw, id = null, { public: pub } = {}) {
    const { spec, check: c } = check(raw);
    if (id) {
      const r = row(id);
      if (!r || r.user_id !== userId) throw new HttpError(404, 'No generator of yours with that id.');
      db.prepare('UPDATE custom_generators SET name = ?, description = ?, spec = ?, check_json = ?, score = ?, verified = ?, public = ?, updated_at = ? WHERE id = ?')
        .run(spec.name, spec.description, JSON.stringify(spec), JSON.stringify(c), c.score, c.verified ? 1 : 0, pub === undefined ? r.public : pub ? 1 : 0, now(), id);
    } else {
      if (db.prepare('SELECT COUNT(*) AS n FROM custom_generators WHERE user_id = ?').get(userId).n >= CUSTOM_LIMITS.perUser) throw new HttpError(400, `${CUSTOM_LIMITS.perUser} generators at most. Delete one first.`);
      id = `cg_${randomBytes(6).toString('base64url')}`;
      db.prepare('INSERT INTO custom_generators (id, user_id, name, description, spec, check_json, score, verified, public, uses, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)')
        .run(id, userId, spec.name, spec.description, JSON.stringify(spec), JSON.stringify(c), c.score, c.verified ? 1 : 0, pub ? 1 : 0, now(), now());
    }
    audit?.log({ id: userId }, 'custom.save', id, { score: c.score, verified: c.verified }, null);
    return out(row(id), true);
  }
  function remove(userId, id) {
    const r = row(id);
    if (!r || r.user_id !== userId) throw new HttpError(404, 'No generator of yours with that id.');
    db.prepare('DELETE FROM custom_generators WHERE id = ?').run(id);
    return true;
  }
  const mine = (userId) => db.prepare('SELECT g.*, u.handle FROM custom_generators g LEFT JOIN users u ON u.id = g.user_id WHERE g.user_id = ? ORDER BY g.updated_at DESC').all(userId).map((r) => out(r, true));
  const published = () => db.prepare('SELECT g.*, u.handle FROM custom_generators g LEFT JOIN users u ON u.id = g.user_id WHERE g.public = 1 ORDER BY g.verified DESC, g.uses DESC LIMIT 200').all().map((r) => out(r));
  // Yours, or anyone's published one.
  function usable(userId, id) {
    const r = row(id);
    if (!r || (!r.public && r.user_id !== userId)) throw new HttpError(404, 'No generator with that id (or it isn’t published).');
    return r;
  }
  function build(userId, id, inputs) {
    const r = usable(userId, id);
    const spec = JSON.parse(r.spec);
    const b = buildCustom(spec, inputs, buildKind);
    db.prepare('UPDATE custom_generators SET uses = uses + 1 WHERE id = ?').run(id);
    return { ...b, spec, row: r };
  }
  return { check, save, remove, mine, published, usable, build, get: (userId, id) => { const r = usable(userId, id); return out(r, r.user_id === userId); } };
}

// ---------- routes ----------
// Session (the console): check, save, list and delete your own.
//   POST   /api/engine/v1/custom/check   { spec }        → { spec, check }
//   GET    /api/engine/v1/custom         yours, and the published ones
//   POST   /api/engine/v1/custom         { spec, public } → saved, checked
//   PUT    /api/engine/v1/custom/:id     { spec, public }
//   DELETE /api/engine/v1/custom/:id
// With a key: GET /api/engine/v1/custom/:id, and POST /api/engine/v1/custom/:id/generate
//   { inputs, format, part, name } → the file, on your plan like /generate.
export function customRoutes({ custom, engine, readJson, keyUser }) {
  // Checking and saving run the recipe up to 40 times on the server: a few a minute each.
  const checks = new RateLimiter(10, 60e3);
  const slow = (who) => { if (!checks.take(`c:${who.id}`)) throw new HttpError(429, 'Ten checks a minute: give it a moment.'); };
  return async function handle(req, res, path, m, ctx, json, requireUser) {
    if (!path.startsWith('/api/engine/v1/custom')) return false;
    const signedIn = () => requireUser(ctx, 'Sign in to the console first.');
    if (path === '/api/engine/v1/custom/check' && m === 'POST') {
      // A key or a session: checking makes no file, so it never counts.
      const who = keyUser(req) || signedIn();
      slow(who);
      const body = await readJson(req, CUSTOM_LIMITS.specBytes + 1024);
      return json(res, 200, custom.check(body.spec ?? body), { 'Cache-Control': 'no-store' }), true;
    }
    if (path === '/api/engine/v1/custom' && m === 'GET') {
      const me = keyUser(req) || ctx.user;
      return json(res, 200, { mine: me ? custom.mine(me.id) : [], published: custom.published() }, { 'Cache-Control': 'no-store' }), true;
    }
    if (path === '/api/engine/v1/custom' && m === 'POST') {
      const me = signedIn();
      slow(me);
      const body = await readJson(req, CUSTOM_LIMITS.specBytes + 1024);
      return json(res, 201, custom.save(me.id, body.spec, null, { public: Boolean(body.public) })), true;
    }
    const cm = path.match(/^\/api\/engine\/v1\/custom\/(cg_[\w-]{6,12})(\/generate)?$/);
    if (!cm) throw new HttpError(404, 'Not here. See /docs#custom.');
    const [, id, gen] = cm;
    if (!gen && m === 'PUT') { const me = signedIn(); slow(me); const body = await readJson(req, CUSTOM_LIMITS.specBytes + 1024); return json(res, 200, custom.save(me.id, body.spec, id, 'public' in body ? { public: Boolean(body.public) } : {})), true; }
    if (!gen && m === 'DELETE') { const me = signedIn(); custom.remove(me.id, id); return json(res, 200, { ok: true }), true; }
    if (!gen && m === 'GET') { const me = keyUser(req) || ctx.user; return json(res, 200, custom.get(me?.id ?? null, id), { 'Cache-Control': 'no-store' }), true; }
    if (gen && m === 'POST') {
      const k = engine.requireKey(req, ctx);
      const body = await readJson(req, 16 * 1024);
      const format = engine.formatOf(body);
      const b = custom.build(k.id, id, body.inputs || {});
      if (ctx.apiMeta) Object.assign(ctx.apiMeta, { kind: `custom:${id}`, format, params: body.inputs || {} });
      const file = engine.deliver(k, b.parts, { kind: `custom:${id}`, format, name: body.name || b.spec.name, part: body.part, params: { custom: id, inputs: body.inputs || {} } }, ctx);
      res.writeHead(200, {
        'Content-Type': file.type, 'Content-Length': file.bytes.length, 'Content-Disposition': `attachment; filename="${file.name}"`,
        'X-Vertex-Serial': file.serial, 'X-Vertex-Parts': file.parts.join(','), 'X-Vertex-Verified': b.row.verified ? '1' : '0', 'Cache-Control': 'no-store', ...(file.test ? { 'X-Mint-Test': '1' } : {}),
        ...(k.plan ? { 'X-Mint-Plan': k.plan.plan.id, ...(k.plan.over ? { 'X-Mint-Extra-Use': '1' } : {}) } : {}),
      });
      res.end(file.bytes);
      return true;
    }
    throw new HttpError(405, 'That method isn’t used here.');
  };
}
