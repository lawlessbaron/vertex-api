// Poppins from our own address. The first visitor's request makes the server
// fetch it from Google Fonts once and keep it beside the database; from then
// on every page gets it from VERTEX itself, with no second server to reach
// (one less lookup and handshake, which matters most far from Google's edge).
// If Google can't be reached, the page is sent to Google as before.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

// Every weight the CSS uses: without a file for 600 and 700, browsers fake bold
// by smearing the 500, which looks heavy and blurred on desktop screens.
export const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap';
// Google sends woff2 (the smallest) only to browsers it knows.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const FILE = /^\/fonts\/([a-f0-9]{16})\.woff2$/;

/** Google's CSS with every font file pointed at /fonts/<hash>.woff2; files: [[remote url, local name]]. */
export function rewriteFontCss(css) {
  const files = [];
  const out = css.replace(/url\((https:\/\/fonts\.gstatic\.com\/[^)\s'"]+)\)/g, (m, u) => {
    const name = `${createHash('sha1').update(u).digest('hex').slice(0, 16)}.woff2`;
    if (!files.some(([x]) => x === u)) files.push([u, name]);
    return `url(/fonts/${name})`;
  });
  return { css: out, files };
}

export function createFonts({ dir, fetchImpl = fetch }) {
  let pending = null, failedAt = 0;
  // Named for the set asked for, so a change of weights fetches a fresh set instead of the old file.
  const cssPath = () => join(dir(), 'fonts', `poppins-${createHash('sha1').update(FONT_CSS).digest('hex').slice(0, 8)}.css`);

  async function build() {
    const res = await fetchImpl(FONT_CSS, { headers: { 'user-agent': UA } });
    if (!res.ok) throw new Error(`fonts ${res.status}`);
    const { css, files } = rewriteFontCss(await res.text());
    if (!files.length) throw new Error('no font files');
    mkdirSync(join(dir(), 'fonts'), { recursive: true });
    for (const [u, name] of files) {
      const f = await fetchImpl(u);
      if (!f.ok) throw new Error(`font file ${f.status}`);
      writeFileSync(join(dir(), 'fonts', name), Buffer.from(await f.arrayBuffer()));
    }
    writeFileSync(cssPath(), css); // last: only a complete set counts
    return css;
  }

  // The CSS, fetching it the first time (once, however many ask at once). null: use Google.
  async function css() {
    if (existsSync(cssPath())) return readFileSync(cssPath(), 'utf8');
    if (Date.now() - failedAt < 10 * 60e3) return null; // don't hammer Google while it's down
    pending ||= build().catch(() => { failedAt = Date.now(); return null; }).finally(() => { pending = null; });
    return pending;
  }

  async function handle(req, res, pathname) {
    if (pathname === '/fonts/poppins.css') {
      const text = await css();
      if (!text) { res.writeHead(302, { Location: FONT_CSS, 'Cache-Control': 'no-store' }); return res.end(), true; }
      res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
      res.end(text);
      return true;
    }
    const m = FILE.exec(pathname);
    if (!m) return false;
    const p = join(dir(), 'fonts', `${m[1]}.woff2`);
    if (!existsSync(p)) { res.writeHead(404); res.end(); return true; }
    res.writeHead(200, { 'Content-Type': 'font/woff2', 'Cache-Control': 'public, max-age=31536000, immutable', 'Access-Control-Allow-Origin': '*' });
    res.end(readFileSync(p));
    return true;
  }

  return { css, handle };
}
