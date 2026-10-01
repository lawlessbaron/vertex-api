// Request hardening: security headers, rate limits, same-origin checks, body parsing.

// `cdn` adds a CDN origin for scripts, styles and images; `connect` widens
// fetch() targets (the studio can upload to a printer's own https address).
export function securityHeaders(res, { secure, cdn = '', connect = '' }) {
  const c = cdn ? ` ${cdn}` : '';
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      `script-src 'self'${c}`,
      `style-src 'self' https://fonts.googleapis.com${c}`,
      // Build videos on custom printers: a YouTube thumbnail, then the player only when pressed.
      `img-src 'self' data: blob: https://i.ytimg.com${c}`,
      // The site's own pages (Admin → Site status previews the page it shows), and YouTube build videos.
      "frame-src 'self' https://www.youtube-nocookie.com",
      // Videos made in the browser (Admin → Social's promo reels and post videos) play from blob: URLs.
      "media-src 'self' blob:",
      `connect-src 'self'${c}${connect ? ` ${connect}` : ''}`,
      "font-src 'self' https://fonts.gstatic.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

// Fixed-window counter per key.
export class RateLimiter {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.hits = new Map();
  }

  take(key) {
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || entry.reset < now) {
      this.hits.set(key, { count: 1, reset: now + this.windowMs });
      if (this.hits.size > 50_000) this.#sweep(now);
      return true;
    }
    entry.count++;
    return entry.count <= this.limit;
  }

  #sweep(now) {
    for (const [k, v] of this.hits) if (v.reset < now) this.hits.delete(k);
  }
}

export function clientIp(req, trustProxy) {
  if (trustProxy) {
    const fwd = req.headers['x-forwarded-for'];
    if (fwd) return String(fwd).split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

// State-changing API calls must come from our own pages: same Origin and a JSON body
// (cross-site forms cannot send application/json without a CORS preflight we never grant).
export function sameOrigin(req, publicUrl) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (origin) {
    try {
      const o = new URL(origin);
      return o.host === host || o.origin === new URL(publicUrl).origin;
    } catch {
      return false;
    }
  }
  const site = req.headers['sec-fetch-site'];
  return !site || site === 'same-origin' || site === 'none';
}

export class HttpError extends Error {
  constructor(status, message, data = null) {
    super(message);
    this.status = status;
    this.data = data; // extra fields sent with the error, e.g. { code: 'no_password' }
  }
}

export async function readJson(req, limit = 64 * 1024) {
  const type = String(req.headers['content-type'] || '');
  if (!type.startsWith('application/json')) throw new HttpError(415, 'Expected JSON.');
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'Request is too large.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new HttpError(400, 'Invalid JSON.');
  }
}
