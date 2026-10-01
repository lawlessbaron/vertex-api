// Compression for text responses: brotli when the browser takes it, gzip
// otherwise. Scripts, styles, pages, JSON and SVG shrink to a quarter or less,
// which matters most on phones. Static files (anything with an ETag) are
// compressed once and kept, so repeat requests cost nothing. Pages and JSON
// without an ETag are keyed by a hash of their bytes: the same page for the next
// visitor reuses the compressed copy (under load this was ~16% of the CPU).
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';
import { createHash } from 'node:crypto';

const TEXT = /^(text\/|application\/(json|javascript|xml|rss\+xml|manifest\+json)|image\/svg\+xml)/;
const MIN = 1024;
const cache = new Map(); // "etag|encoding" → Buffer
const CACHE_MAX = 400;
const pageCache = new Map(); // "sha1|encoding" → Buffer, for responses without an ETag
const PAGE_CACHE_MAX = 300;
const PAGE_CACHE_BYTES = 256 * 1024; // bigger one-off bodies are just compressed

/** The encoding to use for this request, or null. */
export function pickEncoding(accept) {
  const a = String(accept || '').toLowerCase();
  if (/\bbr\b/.test(a)) return 'br';
  if (/\bgzip\b/.test(a)) return 'gzip';
  return null;
}

/** Returns { body, headers } compressed, or null when it isn't worth it. */
export function compressFor(req, body, headers = {}) {
  if (!req || req.method === 'HEAD') return null;
  const type = headers['Content-Type'] || headers['content-type'];
  if (!type || !TEXT.test(type) || headers['Content-Encoding']) return null;
  // Never alongside a new cookie: compressing a secret next to text an attacker
  // can influence is how BREACH-style attacks guess it.
  if (headers['Set-Cookie']) return null;
  const enc = pickEncoding(req.headers?.['accept-encoding']);
  if (!enc) return null;
  const buf = Buffer.isBuffer(body) ? body : typeof body === 'string' ? Buffer.from(body) : null;
  if (!buf || buf.length < MIN) return null;
  const etag = headers.ETag;
  const key = etag ? `${etag}|${enc}` : null;
  const pageKey = !etag && buf.length <= PAGE_CACHE_BYTES ? `${createHash('sha1').update(buf).digest('base64')}|${enc}` : null;
  let out = key ? cache.get(key) : pageKey ? pageCache.get(pageKey) : null;
  if (!out) {
    // Static files are compressed once, so they get the best compression; the rest is quick.
    out = enc === 'br'
      ? brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: etag ? 9 : 4, [constants.BROTLI_PARAM_SIZE_HINT]: buf.length } })
      : gzipSync(buf, { level: etag ? 9 : 6 });
    if (key) {
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
      cache.set(key, out);
    } else if (pageKey) {
      if (pageCache.size >= PAGE_CACHE_MAX) pageCache.delete(pageCache.keys().next().value);
      pageCache.set(pageKey, out);
    }
  }
  if (out.length >= buf.length) return null;
  const vary = headers.Vary ? `${headers.Vary}, Accept-Encoding` : 'Accept-Encoding';
  return {
    body: out,
    headers: { ...headers, 'Content-Encoding': enc, Vary: vary, ...(etag ? { ETag: etag.replace(/"$/, `-${enc === 'br' ? 'br' : 'gz'}"`) } : {}) },
  };
}
