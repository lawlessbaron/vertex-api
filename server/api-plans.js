// API plans and billing by use. Every account starts on the free plan; paid
// plans are monthly Stripe subscriptions (or given by staff), and each sets
// the limits: calls a day for the whole account (shared by all its keys, the
// usual way APIs work), calls a minute per key, and how many keys. Plans
// that allow it keep working past the day's allowance: each call over is
// counted, priced per 1,000, and billed once a day as an item on the next
// invoice. Every account can cap what that extra use may cost in a month.
// Staff set the plans, prices and limits in the API admin.
import { HttpError, RateLimiter } from './security.js';

const DAY = 86400e3;
export const DEFAULT_PLANS = [
  { id: 'free', name: 'Maker', monthly: 0, perMinute: 30, perDay: 1000, keys: 5, overagePer1000: 0, overageCap: 0, blurb: 'Build and try things out.', perks: ['Every kind and format', 'The call log, webhooks and key locks'], active: true },
  { id: 'builder', name: 'Builder', monthly: 19, perMinute: 120, perDay: 10000, keys: 10, overagePer1000: 0.5, overageCap: 50, blurb: 'For a shop or an app that people use every day.', perks: ['Keeps working past the day’s allowance, at $0.50 per 1,000', 'Email support'], active: true },
  { id: 'studio', name: 'Studio', monthly: 79, perMinute: 300, perDay: 50000, keys: 25, overagePer1000: 0.4, overageCap: 250, blurb: 'For busy products and resellers.', perks: ['Keeps working past the day’s allowance, at $0.40 per 1,000', 'Priority support'], active: true },
];
// For schools, colleges and universities, by application only: staff check the proof (see education.js).
// Priced near cost for public schools; the owner sets the real price in API admin → Plans.
export const EDUCATION_PLAN = { id: 'education', name: 'Education', monthly: 5, perMinute: 120, perDay: 10000, keys: 25, overagePer1000: 0, overageCap: 0, blurb: 'For schools, colleges and universities. Apply first; we check every application.', perks: ['Builder limits at a school price', 'A key per class (up to 25)', 'Apply with proof from your institution'], active: true, invite: true };
const LIVE = ['active', 'trialing', 'past_due'];

export function createApiPlans({ db, billing = null, audit = null, config = {}, now = () => Date.now(), invitedTo = () => false }) {
  const getSetting = (k, d) => { try { return JSON.parse(db.prepare('SELECT value FROM settings WHERE key = ?').get(k)?.value) ?? d; } catch { return d; } };
  const put = (k, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v));
  const num = (v, min, max, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
  const currency = () => (billing?.currency?.() || 'aud').toLowerCase();

  // ---------- plans ----------
  function plans() {
    const saved = getSetting('api_plans', null);
    if (!Array.isArray(saved)) return [...DEFAULT_PLANS, EDUCATION_PLAN].map((p) => ({ ...p }));
    const free = saved.find((p) => p.id === 'free') || DEFAULT_PLANS[0];
    const list = [{ ...free, monthly: 0, active: true }, ...saved.filter((p) => p.id !== 'free')];
    // Plans saved before the Education plan existed get it added (the owner can switch it off or reprice it).
    return list.some((p) => p.id === EDUCATION_PLAN.id) ? list : [...list, { ...EDUCATION_PLAN }];
  }
  const planById = (id) => plans().find((p) => p.id === id);
  function savePlans(list, me, ip) {
    if (!Array.isArray(list) || !list.length) throw new HttpError(400, 'Send the plans.');
    const old = plans();
    const clean = list.slice(0, 8).map((p, i) => {
      const id = String(p.id || `plan${i}`).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24) || `plan${i}`;
      return {
        id, name: String(p.name || id).slice(0, 40), monthly: id === 'free' ? 0 : num(p.monthly, 0, 100000, 0),
        perMinute: Math.round(num(p.perMinute, 1, 10000, 30)), perDay: Math.round(num(p.perDay, 1, 10000000, 1000)), keys: Math.round(num(p.keys, 1, 500, 5)),
        overagePer1000: id === 'free' ? 0 : num(p.overagePer1000, 0, 1000, 0), overageCap: id === 'free' ? 0 : num(p.overageCap, 0, 1000000, 0),
        blurb: String(p.blurb || '').slice(0, 160), perks: (Array.isArray(p.perks) ? p.perks : String(p.perks || '').split('\n')).map((x) => String(x).trim().slice(0, 120)).filter(Boolean).slice(0, 8),
        active: id === 'free' ? true : Boolean(p.active), invite: id === 'free' ? false : Boolean(p.invite), product: old.find((o) => o.id === id)?.product || p.product || '',
      };
    });
    if (!clean.some((p) => p.id === 'free')) clean.unshift({ ...plans()[0] });
    put('api_plans', clean);
    audit?.log(me, 'api.plans', 'plans', { plans: clean.map((p) => `${p.id}:${p.monthly}`) }, ip);
    return plans();
  }
  const publicPlans = () => plans().filter((p) => p.active).map(({ product, ...p }) => p);

  // ---------- who is on what ----------
  function subOf(userId) {
    const s = db.prepare('SELECT * FROM api_plan_subs WHERE user_id = ?').get(userId);
    if (!s) return null;
    const live = LIVE.includes(s.status) && (!s.period_end || s.provider !== 'manual' || s.period_end > now());
    return { ...s, live };
  }
  function planFor(userId) {
    const s = userId ? subOf(userId) : null;
    const p = (s?.live && planById(s.plan)) || planById('free');
    return { ...p, sub: s };
  }

  // ---------- limits, and counting use past the day's allowance ----------
  const limiters = new Map();
  const limiter = (kind, n, ms) => { const k = `${kind}:${n}`; if (!limiters.has(k)) limiters.set(k, new RateLimiter(n, ms)); return limiters.get(k); };
  const today = () => new Date(now()).toISOString().slice(0, 10);
  const monthOver = (userId) => db.prepare("SELECT COALESCE(SUM(cents), 0) AS c FROM api_overage WHERE user_id = ? AND day >= ?").get(userId, today().slice(0, 8) + '01').c;
  function capCents(userId, plan) {
    const own = db.prepare('SELECT api_overage_cap FROM users WHERE id = ?').get(userId)?.api_overage_cap;
    const planCap = Math.round((plan.overageCap || 0) * 100);
    return own == null ? planCap : Math.min(own, planCap || own);
  }
  // One call by a key: within the minute and the day, or counted as extra use.
  function take(userId, keyId) {
    const plan = planFor(userId);
    if (!limiter('m', plan.perMinute, 60e3).take(`${plan.id}:${keyId}`)) throw new HttpError(429, `Slow down: ${plan.perMinute} calls a minute per key on the ${plan.name} plan.`);
    // The day's allowance is the account's, shared by all its keys: more keys never means more calls.
    if (limiter('d', plan.perDay, DAY).take(`${plan.id}:u${userId}`)) return { plan, over: false };
    if (!(plan.overagePer1000 > 0)) throw new HttpError(429, `Your account has made ${plan.perDay.toLocaleString('en-AU')} models today on the ${plan.name} plan. Tomorrow, then, or move to a bigger plan.`);
    const day = today();
    const row = db.prepare('SELECT calls FROM api_overage WHERE user_id = ? AND day = ?').get(userId, day);
    const calls = (row?.calls || 0) + 1;
    const cents = Math.ceil((calls * plan.overagePer1000 * 100) / 1000);
    const cap = capCents(userId, plan);
    if (cap && monthOver(userId) - Math.ceil(((calls - 1) * plan.overagePer1000 * 100) / 1000) + cents > cap) {
      throw new HttpError(429, `You've reached your $${(cap / 100).toFixed(2)} limit for extra use this month. Raise it in the console, or wait for the 1st.`);
    }
    db.prepare('INSERT INTO api_overage (user_id, day, plan, calls, cents) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, day) DO UPDATE SET calls = excluded.calls, cents = excluded.cents, plan = excluded.plan').run(userId, day, plan.id, calls, cents);
    return { plan, over: true };
  }
  function setCap(userId, dollars) {
    const v = dollars === null || dollars === '' ? null : Math.round(num(dollars, 0, 1000000, 0) * 100);
    db.prepare('UPDATE users SET api_overage_cap = ? WHERE id = ?').run(v, userId);
    return v;
  }

  // What the console shows: the plan, today's and this month's use, and the extra so far.
  function usage(userId) {
    const plan = planFor(userId);
    const month = today().slice(0, 8) + '01';
    const over = db.prepare('SELECT day, calls, cents, billed_at AS billedAt FROM api_overage WHERE user_id = ? AND day >= ? ORDER BY day').all(userId, month);
    const calls = db.prepare("SELECT COUNT(*) AS n FROM api_requests WHERE user_id = ? AND key_type = 'engine' AND at >= ? AND status < 400 AND path IN ('/api/engine/v1/generate', '/api/engine/v1/parts')").get(userId, Date.parse(`${month}T00:00:00Z`)).n;
    const { sub, product, ...p } = plan;
    return {
      plan: p, sub: sub ? { status: sub.status, provider: sub.provider, periodEnd: sub.period_end, cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end), live: sub.live } : null,
      month: { calls, overCalls: over.reduce((n, r) => n + r.calls, 0), overCents: over.reduce((n, r) => n + r.cents, 0), days: over },
      cap: capCents(userId, plan), ownCap: db.prepare('SELECT api_overage_cap FROM users WHERE id = ?').get(userId)?.api_overage_cap ?? null,
      checkout: Boolean(billing?.stripeReady?.()), currency: currency(),
      // By-application plans this account has been approved for.
      invited: plans().filter((x) => x.invite && invitedTo(userId, x.id)).map((x) => x.id),
    };
  }

  // ---------- paying ----------
  async function ensureProduct(plan) {
    if (plan.product) return plan.product;
    const prod = await billing.stripeCall('POST', '/products', { name: `Mint Motive API: ${plan.name}`, metadata: { kind: 'api', plan: plan.id } });
    put('api_plans', plans().map((p) => (p.id === plan.id ? { ...p, product: prod.id } : p)));
    return prod.id;
  }
  const priceData = (plan, product) => ({ currency: currency(), unit_amount: Math.round(plan.monthly * 100), recurring: { interval: 'month' }, product });
  async function checkout(user, planId, origin) {
    if (!billing?.stripeReady?.()) throw new HttpError(503, 'Paid plans aren’t open yet.');
    // Already paying: switch (or go back to free at the end of the month) instead.
    const cur = subOf(user.id);
    if (cur?.live && cur.provider === 'stripe') return changePlan(user, planId);
    const plan = planById(planId);
    if (!plan || !plan.active || plan.id === 'free' || !plan.monthly) throw new HttpError(404, 'That plan isn’t available.');
    if (plan.invite && !invitedTo(user.id, plan.id)) throw new HttpError(403, `The ${plan.name} plan is by application. Apply first; we’ll let you know when it’s approved.`);
    const product = await ensureProduct(plan);
    const customer = db.prepare('SELECT stripe_customer_id FROM users WHERE id = ?').get(user.id)?.stripe_customer_id;
    const back = `${origin || config.publicUrl}/console`;
    const session = await billing.stripeCall('POST', '/checkout/sessions', {
      mode: 'subscription', success_url: `${back}?plan=welcome`, cancel_url: `${back}?plan=cancelled`, client_reference_id: String(user.id),
      ...(customer ? { customer } : { customer_email: user.email }),
      line_items: [{ quantity: 1, price_data: priceData(plan, product) }],
      subscription_data: { metadata: { kind: 'api', user_id: user.id, plan: plan.id } },
      metadata: { kind: 'api', user_id: user.id, plan: plan.id },
      allow_promotion_codes: 'true',
    });
    return { url: session.url };
  }
  // Already paying: switch the subscription's price, charged or credited for the rest of the month.
  async function changePlan(user, planId) {
    const plan = planById(planId), cur = subOf(user.id);
    if (!plan || !plan.active) throw new HttpError(404, 'That plan isn’t available.');
    if (plan.invite && !invitedTo(user.id, plan.id)) throw new HttpError(403, `The ${plan.name} plan is by application. Apply first.`);
    if (!cur?.live || cur.provider !== 'stripe') throw new HttpError(409, 'There’s no paid plan to change.');
    if (plan.id === 'free') { await billing.stripeCall('POST', `/subscriptions/${cur.provider_id}`, { cancel_at_period_end: 'true' }); db.prepare('UPDATE api_plan_subs SET cancel_at_period_end = 1, updated_at = ? WHERE user_id = ?').run(now(), user.id); return { changed: true, plan: cur.plan, endsAt: cur.period_end }; }
    const sub = await billing.stripeCall('GET', `/subscriptions/${cur.provider_id}`);
    const item = sub.items?.data?.[0]?.id;
    const product = await ensureProduct(plan);
    const next = await billing.stripeCall('POST', `/subscriptions/${cur.provider_id}`, { items: [{ id: item, price_data: priceData(plan, product) }], proration_behavior: 'create_prorations', cancel_at_period_end: 'false', metadata: { kind: 'api', user_id: user.id, plan: plan.id } });
    onSubscription(next, user.id);
    return { changed: true, plan: plan.id };
  }
  async function manage(user, origin) {
    if (!billing?.stripeReady?.()) throw new HttpError(503, 'Paid plans aren’t open yet.');
    const customer = subOf(user.id)?.customer || db.prepare('SELECT stripe_customer_id FROM users WHERE id = ?').get(user.id)?.stripe_customer_id;
    if (!customer) throw new HttpError(404, 'There’s no card on file for your account.');
    const p = await billing.stripeCall('POST', '/billing_portal/sessions', { customer, return_url: `${origin || config.publicUrl}/console` });
    return { url: p.url };
  }
  // Stripe tells us about the subscription (through billing.js's webhook).
  function onSubscription(sub, userIdHint = null) {
    const userId = Number(sub.metadata?.user_id) || userIdHint || db.prepare('SELECT user_id FROM api_plan_subs WHERE provider_id = ?').get(sub.id)?.user_id;
    if (!userId) return;
    const plan = planById(sub.metadata?.plan) ? sub.metadata.plan : 'builder';
    const periodEnd = (sub.current_period_end || sub.items?.data?.[0]?.current_period_end || 0) * 1000 || null;
    db.prepare(`INSERT INTO api_plan_subs (user_id, plan, status, provider, provider_id, customer, period_end, cancel_at_period_end, started_at, updated_at) VALUES (?, ?, ?, 'stripe', ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, status = excluded.status, provider = 'stripe', provider_id = excluded.provider_id, customer = excluded.customer, period_end = excluded.period_end, cancel_at_period_end = excluded.cancel_at_period_end, updated_at = excluded.updated_at`)
      .run(userId, plan, sub.status || 'active', sub.id, sub.customer || null, periodEnd, sub.cancel_at_period_end ? 1 : 0, now(), now());
    if (sub.customer) db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ? AND stripe_customer_id IS NULL').run(sub.customer, userId);
  }
  // Billing is made after the API in app.js, so it's attached once it exists.
  function attachBilling(b) { billing = b; if (b?.subscriptionHandlers) b.subscriptionHandlers.api = onSubscription; }
  attachBilling(billing);

  // Once a day: yesterday's (and any earlier) extra use goes on the next invoice.
  async function billOverage() {
    const due = db.prepare("SELECT o.*, s.provider, s.customer, s.provider_id FROM api_overage o LEFT JOIN api_plan_subs s ON s.user_id = o.user_id WHERE o.billed_at IS NULL AND o.cents > 0 AND o.day < ?").all(today());
    let billed = 0;
    for (const r of due) {
      if (r.provider !== 'stripe' || !r.customer || !billing?.stripeReady?.()) {
        db.prepare("UPDATE api_overage SET billed_at = ?, invoice_item = ? WHERE user_id = ? AND day = ?").run(now(), r.provider === 'manual' ? 'manual plan' : 'no card', r.user_id, r.day);
        continue;
      }
      try {
        const item = await billing.stripeCall('POST', '/invoiceitems', { customer: r.customer, ...(r.provider_id ? { subscription: r.provider_id } : {}), amount: r.cents, currency: currency(), description: `Extra API use on ${r.day}: ${r.calls.toLocaleString('en-AU')} calls` });
        db.prepare('UPDATE api_overage SET billed_at = ?, invoice_item = ? WHERE user_id = ? AND day = ?').run(now(), item.id, r.user_id, r.day);
        billed++;
      } catch (e) { console.warn(`api overage: ${e.message}`); }
    }
    return billed;
  }

  // ---------- staff ----------
  function grant(me, userId, { plan, days = 30, note = '' } = {}, ip = null) {
    const p = planById(plan);
    if (!p) throw new HttpError(400, 'No such plan.');
    if (!db.prepare('SELECT id FROM users WHERE id = ?').get(userId)) throw new HttpError(404, 'No account with that id.');
    const cur = subOf(userId);
    if (cur?.live && cur.provider === 'stripe') throw new HttpError(409, 'They pay through Stripe. Change it in Stripe, or cancel that first.');
    const end = days > 0 ? now() + days * DAY : null;
    db.prepare(`INSERT INTO api_plan_subs (user_id, plan, status, provider, period_end, note, started_at, updated_at) VALUES (?, ?, 'active', 'manual', ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, status = 'active', provider = 'manual', provider_id = NULL, period_end = excluded.period_end, note = excluded.note, updated_at = excluded.updated_at`)
      .run(userId, p.id, end, String(note).slice(0, 200), now(), now());
    audit?.log(me, 'api.plan.grant', String(userId), { plan: p.id, days }, ip);
    return subOf(userId);
  }
  async function cancel(me, userId, ip = null) {
    const cur = subOf(userId);
    if (!cur) throw new HttpError(404, 'They aren’t on a plan.');
    if (cur.provider === 'stripe' && cur.provider_id && billing?.stripeReady?.()) await billing.stripeCall('DELETE', `/subscriptions/${cur.provider_id}`);
    db.prepare("UPDATE api_plan_subs SET status = 'canceled', updated_at = ? WHERE user_id = ?").run(now(), userId);
    audit?.log(me, 'api.plan.cancel', String(userId), { plan: cur.plan }, ip);
    return true;
  }
  const subscribers = () => db.prepare(`SELECT s.*, u.handle, u.email,
      (SELECT COALESCE(SUM(cents), 0) FROM api_overage o WHERE o.user_id = s.user_id AND o.day >= ?) AS overCents
    FROM api_plan_subs s JOIN users u ON u.id = s.user_id ORDER BY s.updated_at DESC LIMIT 500`).all(today().slice(0, 8) + '01');
  function revenue() {
    const live = db.prepare("SELECT plan, COUNT(*) AS n FROM api_plan_subs WHERE status IN ('active', 'trialing', 'past_due') AND provider = 'stripe' GROUP BY plan").all();
    const mrr = live.reduce((n, r) => n + (planById(r.plan)?.monthly || 0) * r.n, 0);
    const over = db.prepare('SELECT COALESCE(SUM(cents), 0) AS c FROM api_overage WHERE day >= ?').get(today().slice(0, 8) + '01').c;
    return { byPlan: live, mrr, overThisMonth: over / 100 };
  }

  return { attachBilling, plans, publicPlans, savePlans, planFor, take, usage, setCap, checkout, changePlan, manage, onSubscription, billOverage, grant, cancel, subscribers, revenue };
}
