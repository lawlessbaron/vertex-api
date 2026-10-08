// The API site's changelog for developers: CHANGELOG.md read once, served as JSON
// (GET /api/changelog) and as RSS (GET /api/changelog.rss, also /changelog.rss),
// so a team can watch for new features in a feed reader or a chat channel.
import { readFileSync } from 'node:fs';

/** "## 1.8.0 · 3 October 2026" sections → [{ version, date, items: [{ heading, text }] }], newest first. */
export function parseChangelog(md) {
  const out = [];
  let cur = null, heading = '';
  for (const raw of String(md).split(/\r?\n/)) {
    const v = /^##\s+(\d+\.\d+\.\d+)\s*·\s*(.+)$/.exec(raw);
    if (v) { cur = { version: v[1], date: v[2].trim(), items: [] }; out.push(cur); heading = ''; continue; }
    if (!cur) continue;
    const h = /^###\s+(.+)$/.exec(raw);
    if (h) { heading = h[1].trim(); continue; }
    const li = /^-\s+(.+)$/.exec(raw);
    if (li) cur.items.push({ heading, text: li[1].trim() });
    else if (/^\s{2,}-\s+/.test(raw) && cur.items.length) cur.items[cur.items.length - 1].text += ` ${raw.trim().replace(/^-\s+/, '— ')}`;
  }
  return out;
}

const plain = (s) => String(s).replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

export function createChangelog({ path, now = () => Date.now() }) {
  let cache = null, at = 0;
  const entries = () => {
    if (!cache || now() - at > 5 * 60e3) { try { cache = parseChangelog(readFileSync(path, 'utf8')); } catch { cache = []; } at = now(); }
    return cache;
  };
  const json = (limit = 20) => ({ entries: entries().slice(0, Math.max(1, Math.min(100, limit))).map((e) => ({ ...e, items: e.items.map((i) => ({ heading: i.heading, text: plain(i.text) })) })) });
  function rss(origin) {
    const items = entries().slice(0, 30);
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Mint Motive API changelog</title><link>${esc(origin)}/changelog</link><description>New features and fixes on the Mint Motive API, its model engine and its photo tracer.</description>
${items.map((e) => { const d = Date.parse(e.date); return `<item><title>${esc(`API ${e.version}`)}</title><link>${esc(origin)}/changelog#v${esc(e.version)}</link><guid isPermaLink="false">mm-api-${esc(e.version)}</guid>${Number.isFinite(d) ? `<pubDate>${new Date(d).toUTCString()}</pubDate>` : ''}<description>${esc(e.items.map((i) => `${i.heading ? `${i.heading}: ` : ''}${plain(i.text)}`).join('\n'))}</description></item>`; }).join('\n')}
</channel></rss>`;
  }
  return { entries, json, rss };
}
