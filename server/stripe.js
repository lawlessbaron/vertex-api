// Stripe for API plans. The same Stripe account as VERTEX; this site has its
// own webhook (Stripe → Developers → Webhooks → https://<this site>/api/stripe/webhook)
// and acts only on subscriptions marked metadata.kind = "api". VERTEX ignores those.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { HttpError } from './security.js';

function encode(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') encode(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

// Stripe-Signature: t=timestamp,v1=hmac. The signed text is "t.body".
export function verifyStripeSignature(raw, header, secret, { tolerance = 300, now = Date.now() } = {}) {
  if (!secret || !header) return false;
  const items = String(header).split(',').map((p) => { const i = p.indexOf('='); return [p.slice(0, i).trim(), p.slice(i + 1).trim()]; });
  const t = items.find(([k]) => k === 't')?.[1];
  const sigs = items.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !sigs.length || Math.abs(now / 1000 - Number(t)) > tolerance) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${raw}`).digest();
  return sigs.some((s) => {
    const got = Buffer.from(s, 'hex');
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

export function createStripe({ db, config, fetchImpl = fetch }) {
  const stripeReady = () => Boolean(config.stripe.secretKey);
  const currency = () => config.stripe.currency || 'aud';
  // metadata.kind → handler(subscription, userIdHint). api-plans.js adds "api".
  const subscriptionHandlers = {};

  async function stripeCall(method, path, params) {
    if (!stripeReady()) throw new HttpError(503, 'Payments aren’t set up yet.');
    const inQuery = method === 'GET' || method === 'DELETE';
    const r = await fetchImpl(`https://api.stripe.com/v1${path}${params && inQuery ? `?${encode(params)}` : ''}`, {
      method, body: params && !inQuery ? encode(params).toString() : undefined,
      headers: { Authorization: `Bearer ${config.stripe.secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new HttpError(502, j.error?.message || 'The payment service said no.');
    return j;
  }

  const seen = new Set();
  async function webhook(raw, signature) {
    if (!config.stripe.webhookSecret) throw new HttpError(503, 'Webhook secret not set.');
    if (!verifyStripeSignature(raw, signature, config.stripe.webhookSecret)) throw new HttpError(400, 'Bad signature.');
    const event = JSON.parse(raw);
    if (seen.has(event.id)) return { duplicate: true };
    const o = event.data?.object || {};
    if (event.type === 'checkout.session.completed' && o.mode === 'subscription' && o.subscription && subscriptionHandlers[o.metadata?.kind]) {
      const userId = Number(o.client_reference_id || o.metadata?.user_id) || null;
      if (userId && o.customer) db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?').run(o.customer, userId);
      const sub = await stripeCall('GET', `/subscriptions/${o.subscription}`);
      await subscriptionHandlers[o.metadata.kind](sub, userId);
    } else if (/^customer\.subscription\.(created|updated|deleted)$/.test(event.type) && subscriptionHandlers[o.metadata?.kind]) {
      await subscriptionHandlers[o.metadata.kind](o, null);
    }
    seen.add(event.id);
    if (seen.size > 5000) seen.clear();
    return { ok: true };
  }

  async function webhookRoute(req, res, json) {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > 512 * 1024) throw new HttpError(413, 'Too large.');
      chunks.push(c);
    }
    return json(res, 200, await webhook(Buffer.concat(chunks).toString('utf8'), req.headers['stripe-signature']));
  }

  return { stripeReady, stripeCall, currency, subscriptionHandlers, webhook, webhookRoute };
}
