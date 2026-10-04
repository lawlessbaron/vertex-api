// The one door every AI outline goes through, from the tracer API, Print
// Doctor's helpers and VERTEX itself (over the link). It decides who traces:
//
//   free-first (default)  our built-in tracer first; the paid AI only when that
//                         result looks doubtful (nothing found, a giant shape,
//                         lots of crumbs), and only while the allowance lasts
//   ai-first              the paid AI while the allowance lasts, built-in after
//   free-only             never the paid AI
//
// The allowance is a number of paid AI calls a month and a day, set by the
// owner (Admin → Data → AI door). Every trace is counted by day, caller and
// route, so the admin card shows what the AI costs and what it saved.
// Callers are never told which AI ran: only "outlines".
import { HttpError, readJson } from './security.js';
import { traceSheet } from './trace-api.js';

const KEY = 'ai_door';
export const DOOR_MODES = ['free-first', 'ai-first', 'free-only'];
export const DOOR_DEFAULTS = { mode: 'free-first', monthlyAi: 300, dailyAi: 40 };
const ROUTES = ['builtin', 'ai', 'ai-failed', 'capped'];
const day = (t) => new Date(t).toISOString().slice(0, 10);
const intIn = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

/**
 * Is the built-in tracer's answer good enough to skip the paid AI?
 * Doubtful: nothing found, too many shapes, a shape covering a big part of the
 * paper (a shadow or the paper's edge), or several crumbs (a shiny tool broken
 * into bits).
 */
export function looksRight({ paper, tools }) {
  if (!tools?.length || tools.length > 20) return false;
  const sheet = (paper?.widthMm || 210) * (paper?.heightMm || 297);
  if (tools.some((t) => t.areaMm2 > 0.35 * sheet)) return false;
  const crumbs = tools.filter((t) => t.areaMm2 < 150 || Math.max(t.lengthMm, t.widthMm) < 12).length;
  return crumbs <= 1 && crumbs < tools.length;
}

export function createAiDoor({ db, can, toolLibrary, audit = null, now = () => Date.now(), trace = traceSheet }) {
  const policy = () => {
    let saved = {};
    try { saved = JSON.parse(db.prepare('SELECT value FROM settings WHERE key = ?').get(KEY)?.value || '{}'); } catch { /* defaults */ }
    return {
      mode: DOOR_MODES.includes(saved.mode) ? saved.mode : DOOR_DEFAULTS.mode,
      monthlyAi: intIn(saved.monthlyAi, 0, 100000, DOOR_DEFAULTS.monthlyAi),
      dailyAi: intIn(saved.dailyAi, 0, 10000, DOOR_DEFAULTS.dailyAi),
    };
  };
  const savePolicy = (p) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(KEY, JSON.stringify(p));

  function count(caller, route, ms = 0) {
    db.prepare(`INSERT INTO ai_door_days (day, caller, route, count, ms) VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(day, caller, route) DO UPDATE SET count = count + 1, ms = ms + excluded.ms`).run(day(now()), String(caller || 'other').slice(0, 40), route, Math.round(ms));
  }
  // Paid calls so far: tried ones count too (a failed call is still billed).
  const paidSince = (from) => Number(db.prepare("SELECT COALESCE(SUM(count), 0) AS n FROM ai_door_days WHERE day >= ? AND route IN ('ai', 'ai-failed')").get(from).n);
  function allowance() {
    const p = policy(), today = day(now()), month = `${today.slice(0, 7)}-01`;
    const usedMonth = paidSince(month), usedToday = paidSince(today);
    const left = Math.max(0, Math.min(p.monthlyAi - usedMonth, p.dailyAi - usedToday));
    return { ...p, usedMonth, usedToday, left, aiReady: Boolean(toolLibrary?.aiOn?.()) };
  }
  const canPay = () => { const a = allowance(); return a.aiReady && a.mode !== 'free-only' && a.left > 0; };

  // A whole photo of tools on paper (the tracer API): outlines in mm.
  async function tracePhoto({ image, jpeg, paper, caller = 'trace-api', want = 'auto' }) {
    const mode = policy().mode;
    let free = null;
    const builtin = async () => {
      if (free) return free;
      const t0 = now();
      free = await trace({ image, jpeg, paper, outline: async () => [] });
      free.ms = now() - t0;
      return free;
    };
    if (want !== 'ai' && (mode !== 'ai-first' || !canPay())) {
      const r = await builtin();
      if (looksRight(r) || mode === 'free-only' || want === 'builtin') return done(caller, 'builtin', r);
    }
    if (!canPay()) return done(caller, toolLibrary?.aiOn?.() && policy().mode !== 'free-only' ? 'capped' : 'builtin', await builtin());
    const t0 = now();
    try {
      const r = await trace({ image, jpeg, paper, outline: (img) => toolLibrary.outline(img) });
      return done(caller, 'ai', r, now() - t0);
    } catch (e) {
      if (e.say === 'paper') throw e; // no paper is no paper, whoever looks
      console.warn(`ai door: paid outline failed for ${caller}: ${e.message}`);
      // Counted once, as the failed paid call; the built-in answer goes back instead.
      const r = await builtin();
      count(caller, 'ai-failed', now() - t0);
      return strip(r, 'builtin');
    }
  }
  const strip = ({ ms: _ms, ...r }, route) => ({ ...r, route });
  function done(caller, route, r, ms = r.ms || 0) {
    count(caller, route, ms);
    return strip(r, route === 'ai' ? 'ai' : 'builtin');
  }

  // A straightened sheet from a page that runs the built-in tracer itself
  // (VERTEX's Trace a photo): the paid AI's outlines, if the allowance allows.
  async function outline(image, engine, caller = 'vertex') {
    const a = allowance();
    if (!a.aiReady) throw new HttpError(503, 'AI outlines are off on the API.');
    if (a.mode === 'free-only' || a.left <= 0) {
      count(caller, 'capped');
      throw new HttpError(429, a.mode === 'free-only' ? 'AI outlines are switched off for now. The built-in tracer still works.' : 'This month’s AI allowance is used up. The built-in tracer still works.');
    }
    const t0 = now();
    try {
      const tools = await toolLibrary.outline(image, engine);
      count(caller, 'ai', now() - t0);
      return tools;
    } catch (e) { count(caller, 'ai-failed', now() - t0); throw e; }
  }

  function usage(days = 30) {
    const from = day(now() - (days - 1) * 86400e3);
    const rows = db.prepare('SELECT day, caller, route, count, ms FROM ai_door_days WHERE day >= ? ORDER BY day').all(from);
    const total = Object.fromEntries(ROUTES.map((r) => [r, 0]));
    const byCaller = {};
    for (const r of rows) {
      total[r.route] = (total[r.route] || 0) + r.count;
      (byCaller[r.caller] ||= Object.fromEntries(ROUTES.map((x) => [x, 0])))[r.route] += r.count;
    }
    const byDay = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = day(now() - i * 86400e3);
      const here = rows.filter((r) => r.day === d);
      byDay.push({ day: d, ...Object.fromEntries(ROUTES.map((x) => [x, here.filter((r) => r.route === x).reduce((s, r) => s + r.count, 0)])) });
    }
    return { days, total, byCaller, byDay };
  }

  // Admin → Data → AI door (owners only, like the tracer API's keys).
  async function handle(req, res, path, method, ctx, json) {
    if (!path.startsWith('/api/admin/ai-door')) return false;
    if (!can(ctx.user, 'tracer.private')) throw new HttpError(403, 'Only owners can open this.');
    if (path === '/api/admin/ai-door' && method === 'GET') return json(res, 200, { allowance: allowance(), usage: usage(30), modes: DOOR_MODES }), true;
    if (path === '/api/admin/ai-door' && method === 'PUT') {
      const body = await readJson(req, 2048), p = policy();
      const next = {
        mode: DOOR_MODES.includes(body.mode) ? body.mode : p.mode,
        monthlyAi: body.monthlyAi !== undefined ? intIn(body.monthlyAi, 0, 100000, p.monthlyAi) : p.monthlyAi,
        dailyAi: body.dailyAi !== undefined ? intIn(body.dailyAi, 0, 10000, p.dailyAi) : p.dailyAi,
      };
      savePolicy(next);
      audit?.log(ctx.user, 'aidoor.policy', KEY, next, ctx.ip);
      return json(res, 200, { allowance: allowance() }), true;
    }
    return false;
  }

  return { tracePhoto, outline, allowance, usage, policy, handle, canPay };
}
