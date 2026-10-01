// API plans: limits by plan, extra use counted and capped, billed daily to
// Stripe, paid plans through Stripe checkout and its webhook, given plans,
// and the console, portal and admin around them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../server/db.js';
import { createApiPlans } from '../server/api-plans.js';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { createSession } from '../server/auth.js';

function fakeStripe() {
  const calls = [];
  return {
    calls,
    billing: {
      stripeReady: () => true, currency: () => 'aud', subscriptionHandlers: {},
      stripeCall: async (method, path, params) => {
        calls.push({ method, path, params });
        if (path === '/products') return { id: 'prod_1' };
        if (path === '/checkout/sessions') return { url: 'https://checkout.example/s' };
        if (path === '/invoiceitems') return { id: `ii_${calls.length}` };
        if (path.startsWith('/subscriptions/') && method === 'GET') return { id: 'sub_1', items: { data: [{ id: 'si_1' }] } };
        if (path.startsWith('/subscriptions/') && method === 'POST') return { id: 'sub_1', status: 'active', customer: 'cus_1', current_period_end: 2e9, metadata: params.metadata };
        if (path === '/billing_portal/sessions') return { url: 'https://portal.example' };
        return {};
      },
    },
  };
}

test('limits by plan, extra use counted, capped and billed daily', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mm-plans-'));
  const db = openDatabase(join(dir, 'a.db'));
  let T = Date.UTC(2026, 9, 10, 12);
  const { billing, calls } = fakeStripe();
  const plans = createApiPlans({ db, billing, now: () => T });
  const uid = Number(db.prepare("INSERT INTO users (email, name, handle, role, created_at, synced_at) VALUES ('p@t.io', 'p', 'pdev', 'user', 0, 0)").run().lastInsertRowid);
  // Free: stops at the day's allowance (shrunk here so the test is quick).
  plans.savePlans([{ id: 'free', name: 'Maker', perMinute: 1000, perDay: 3, keys: 2 }, { id: 'builder', name: 'Builder', monthly: 19, perMinute: 1000, perDay: 2, keys: 10, overagePer1000: 500, overageCap: 2, active: true }]);
  assert.equal(plans.planFor(uid).id, 'free');
  for (let i = 0; i < 3; i++) assert.equal(plans.take(uid, 1).over, false);
  assert.throws(() => plans.take(uid, 1), /Tomorrow, then/);
  // Staff give Builder: past the day's allowance it keeps going, as extra use.
  plans.grant(null, uid, { plan: 'builder', days: 30 });
  assert.equal(plans.planFor(uid).id, 'builder');
  plans.take(uid, 2); plans.take(uid, 2);
  assert.equal(plans.take(uid, 2).over, true); // $500 per 1,000 → 50¢ a call
  assert.equal(plans.take(uid, 2).over, true);
  assert.equal(plans.usage(uid).month.overCalls, 2);
  assert.equal(plans.usage(uid).month.overCents, 100);
  // The cap: the plan's $2 a month, or lower if they set it.
  plans.take(uid, 2); plans.take(uid, 2);
  assert.throws(() => plans.take(uid, 2), /\$2\.00 limit for extra use/);
  plans.setCap(uid, 1);
  assert.equal(plans.usage(uid).cap, 100);
  // Given plans aren't charged: their extra use is marked for staff.
  T += 86400e3;
  assert.equal(await plans.billOverage(), 0);
  assert.equal(db.prepare('SELECT invoice_item FROM api_overage WHERE user_id = ?').get(uid).invoice_item, 'manual plan');
  // Paying through Stripe: the webhook makes the plan; extra use becomes an invoice item.
  db.prepare('DELETE FROM api_plan_subs').run();
  billing.subscriptionHandlers.api({ id: 'sub_9', status: 'active', customer: 'cus_9', current_period_end: 2e9, metadata: { kind: 'api', user_id: String(uid), plan: 'builder' } });
  assert.equal(plans.planFor(uid).sub.provider, 'stripe');
  plans.setCap(uid, null);
  db.prepare('DELETE FROM api_overage').run(); // a fresh start, so the cap isn't in the way
  for (let i = 0; i < 3; i++) plans.take(uid, 3);
  T += 86400e3;
  assert.equal(await plans.billOverage(), 1);
  const item = calls.find((c) => c.path === '/invoiceitems');
  assert.equal(item.params.customer, 'cus_9');
  assert.equal(item.params.subscription, 'sub_9');
  assert.equal(item.params.amount, 150, 'the account had already used its day, so all three are extra');
  assert.match(item.params.description, /Extra API use/);
  assert.equal(await plans.billOverage(), 0, 'billed once');
  // Checkout on a paid plan, metadata marks it as an API plan; already paying switches instead.
  db.prepare('DELETE FROM api_plan_subs').run();
  const out = await plans.checkout({ id: uid, email: 'p@t.io' }, 'builder', 'https://api.example');
  assert.equal(out.url, 'https://checkout.example/s');
  const session = calls.find((c) => c.path === '/checkout/sessions').params;
  assert.equal(session.metadata.kind, 'api');
  assert.equal(session.subscription_data.metadata.plan, 'builder');
  assert.equal(session.line_items[0].price_data.unit_amount, 1900);
  assert.match(session.success_url, /^https:\/\/api\.example\/console/);
  await assert.rejects(plans.checkout({ id: uid }, 'free'), /isn’t available/);
  billing.subscriptionHandlers.api({ id: 'sub_1', status: 'active', customer: 'cus_1', current_period_end: 2e9, metadata: { kind: 'api', user_id: String(uid), plan: 'builder' } });
  assert.deepEqual(await plans.checkout({ id: uid }, 'free'), { changed: true, plan: 'builder', endsAt: 2e12 });
  assert.equal(plans.planFor(uid).sub.cancel_at_period_end, 1);
  // Revenue for the admin.
  assert.equal(plans.revenue().mrr, 19);
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

test('plans on the API site: pricing, console, admin, and the engine using them', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mm-plans-app-'));
  const { server, db } = createApp(loadConfig({ DATABASE_PATH: join(dir, 'app.db'), PUBLIC_URL: 'http://localhost' }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const mk = async (handle, role) => {
      const id = Number(db.prepare('INSERT INTO users (email, name, handle, role, created_at, synced_at) VALUES (?, ?, ?, ?, ?, ?)').run(`${handle}@t.io`, handle, handle, role, Date.now(), Date.now()).lastInsertRowid);
      const cookie = `mm_api=${createSession(db, id, 'test')}`;
      return { id, call: async (path, { method = 'GET', body } = {}) => {
        const res = await fetch(base + path, { method, headers: { cookie, ...(method !== 'GET' ? { origin: base, 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
        return { status: res.status, data: await res.json().catch(() => null), headers: res.headers };
      } };
    };
    const boss = await mk('pl_boss', 'owner'), dev = await mk('pl_dev', 'user');
    const pub = await (await fetch(`${base}/api/engine/v1/plans`)).json();
    assert.deepEqual(pub.plans.map((p) => p.id), ['free', 'builder', 'studio']);
    assert.equal(pub.plans[0].product, undefined, 'no Stripe ids in public');
    assert.equal(pub.paid, false, 'Stripe isn’t set up in tests');
    // The console shows the plan; paying isn't open without Stripe.
    const con = await dev.call('/api/developer/console');
    assert.equal(con.data.plan.plan.id, 'free');
    assert.equal(con.data.plan.checkout, false);
    assert.equal((await dev.call('/api/developer/plan/checkout', { method: 'POST', body: { plan: 'builder' } })).status, 503);
    // Keys are capped by plan.
    await boss.call('/api/admin/api/plans', { method: 'PUT', body: { plans: [{ id: 'free', name: 'Maker', perMinute: 30, perDay: 1000, keys: 1 }, { id: 'builder', name: 'Builder', monthly: 19, perMinute: 120, perDay: 10000, keys: 3, overagePer1000: 0.5, overageCap: 50, active: true }] } });
    assert.equal((await dev.call('/api/engine/v1/keys', { method: 'POST', body: { name: 'one' } })).status, 201);
    const two = await dev.call('/api/engine/v1/keys', { method: 'POST', body: { name: 'two' } });
    assert.equal(two.status, 400);
    assert.match(two.data.error, /1 keys on your plan/);
    assert.equal((await dev.call('/api/admin/api/plans/grant', { method: 'POST', body: { userId: dev.id, plan: 'builder' } })).status, 403);
    assert.equal((await boss.call('/api/admin/api/plans/grant', { method: 'POST', body: { userId: dev.id, plan: 'builder', days: 30 } })).status, 200);
    assert.equal((await dev.call('/api/engine/v1/keys', { method: 'POST', body: { name: 'two' } })).status, 201);
    const admin = await boss.call('/api/admin/api/plans');
    assert.ok(admin.data.subscribers.some((s) => s.user_id === dev.id && s.plan === 'builder'));
    // The engine carries the plan on its answers (a staff key works while the API is off).
    const bk = (await boss.call('/api/engine/v1/keys', { method: 'POST', body: { name: 'staff' } })).data;
    const res = await fetch(`${base}/api/engine/v1/generate`, { method: 'POST', headers: { authorization: `Bearer ${bk.key}`, 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'bin', format: 'stl', params: { gridX: 1, gridY: 1, heightUnits: 2 } }) });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-mint-plan'), 'free');
    await res.arrayBuffer();
    // A cap of their own.
    assert.equal((await dev.call('/api/developer/plan/cap', { method: 'PUT', body: { dollars: 10 } })).data.ownCap, 1000);
  } finally { server.closeAllConnections?.(); server.close(); rmSync(dir, { recursive: true, force: true }); }
});
