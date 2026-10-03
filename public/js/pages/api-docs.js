// The API docs: code coloured like the portal, the quick start in three
// languages, every kind's settings straight from the engine, the engine's
// recent changes, and a table of contents that follows the reading.
import { highlight } from '/js/pages/api-portal.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const BASE = 'https://api.mintmotive.com.au';

// Static examples, coloured.
for (const el of $$('pre[data-lang] code')) el.innerHTML = highlight(el.textContent, el.parentElement.dataset.lang);
for (const el of $$('code[data-hl]')) el.innerHTML = highlight(el.textContent, el.dataset.hl);

// The quick start.
const QUICK = {
  curl: `curl -X POST ${BASE}/engine/v1/generate \\
  -H "Authorization: Bearer $MINT_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "kind": "bin",
    "format": "3mf",
    "params": { "gridX": 3, "gridY": 2, "heightUnits": 6, "divisionsX": 3 }
  }' \\
  -o bin.3mf`,
  js: `// Node 18+: fetch is built in
const res = await fetch("${BASE}/engine/v1/generate", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${process.env.MINT_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    kind: "bin",
    format: "3mf",
    params: { gridX: 3, gridY: 2, heightUnits: 6, divisionsX: 3 },
  }),
});
if (!res.ok) throw new Error((await res.json()).error);
const file = Buffer.from(await res.arrayBuffer());
console.log(res.headers.get("x-vertex-serial"), res.headers.get("x-request-id"));`,
  py: `import os, requests

key = os.environ["MINT_KEY"]
r = requests.post(
    "${BASE}/engine/v1/generate",
    headers={"Authorization": f"Bearer {key}"},
    json={
        "kind": "bin",
        "format": "3mf",
        "params": {"gridX": 3, "gridY": 2, "heightUnits": 6, "divisionsX": 3},
    },
)
r.raise_for_status()
open("bin.3mf", "wb").write(r.content)
print(r.headers["X-Vertex-Serial"], r.headers["X-Request-Id"])`,
};
let lang = 'curl';
const quick = () => { $('[data-quick]').innerHTML = highlight(QUICK[lang], lang); $$('[data-qs]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.qs === lang))); };
$$('[data-qs]').forEach((b) => b.addEventListener('click', () => { lang = b.dataset.qs; quick(); }));
$('[data-copycode]')?.addEventListener('click', async (e) => { try { await navigator.clipboard.writeText(QUICK[lang]); e.target.textContent = 'Copied ✓'; } catch { e.target.textContent = 'Select to copy'; } setTimeout(() => { e.target.textContent = 'Copy'; }, 1500); });
quick();

// Every kind's settings, from the engine.
const NAMES = { bin: 'Bin', baseplate: 'Baseplate', holder: 'Holder', labels: 'Label clips', skadis: 'Skådis', morph: 'Deck Foundry' };
const typeOf = (v) => (Array.isArray(v) ? 'array' : v === null ? '—' : typeof v === 'object' ? 'object' : typeof v);
const show = (v) => (typeof v === 'string' ? `"${v}"` : JSON.stringify(v));
function renderKinds({ kinds }) {
  const tabs = $('[data-kindtabs]'), box = $('[data-kindtable]');
  const pick = (k) => {
    const d = kinds[k], rows = Object.entries(d.defaults || {});
    $$('button', tabs).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === k)));
    box.innerHTML = `<div class="dx-kindhead"><h3>${esc(d.name)}</h3><a href="${esc(d.generator)}">Open its generator →</a></div>
      <p class="ax-tile-s">${rows.length} settings. Send any of them in <code>params</code>; leave the rest out.</p>
      <div class="cx-table-wrap"><table class="dx-table dx-settings"><thead><tr><th>Setting</th><th>Type</th><th>Default</th></tr></thead><tbody>${rows.map(([n, v]) => `<tr><td><code>${esc(n)}</code></td><td>${typeOf(v)}</td><td class="ax-mono">${esc(show(v)).slice(0, 80)}</td></tr>`).join('')}</tbody></table></div>`;
  };
  tabs.innerHTML = Object.keys(kinds).map((k) => `<button type="button" data-kind="${k}">${esc(NAMES[k] || kinds[k].name || k)}</button>`).join('');
  // Keep the kind that's open when the list refreshes.
  const open = tabs.dataset.open && kinds[tabs.dataset.open] ? tabs.dataset.open : Object.keys(kinds)[0];
  tabs.onclick = (e) => { const b = e.target.closest('[data-kind]'); if (b) { tabs.dataset.open = b.dataset.kind; pick(b.dataset.kind); } };
  pick(open);
  const count = $('[data-docs-kinds]'); if (count) count.textContent = String(Object.keys(kinds).length);
}
// Straight from the engine, and refreshed in place when it changes (api-portal.js's live updater).
document.addEventListener('ax-kinds', (e) => renderKinds(e.detail));
fetch('/api/changelog?limit=5').then((r) => r.json()).then(({ entries }) => {
  $('[data-apichanges]').innerHTML = entries.map((e) => `<details class="ax-tile"><summary><b class="ax-mono">${esc(e.version)}</b><span>${esc(e.date)}</span></summary><ul>${e.items.map((i) => `<li>${esc(i.text)}</li>`).join('')}</ul></details>`).join('') || '<p class="cx-empty">Nothing yet.</p>';
}).catch(() => { $('[data-apichanges]').innerHTML = '<p class="cx-empty">Couldn’t load the changelog. It’s at /changelog.rss.</p>'; });
fetch('/api/engine/v1/kinds').then((r) => r.json()).then(renderKinds).catch(() => { $('[data-kindtable]').innerHTML = '<p class="cx-empty">Couldn’t reach the engine. GET /engine/v1/kinds lists them.</p>'; });

// Recent engine changes.
import('/js/engine.js').then(({ ENGINE_HISTORY }) => {
  $('[data-history]').innerHTML = ENGINE_HISTORY.slice(0, 6).map((h) => `<details class="ax-tile"><summary><b class="ax-mono">${esc(h.version)}</b><span>${esc(h.date)}</span></summary><ul>${h.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></details>`).join('');
}).catch(() => {});

// The contents follow the reading.
const links = new Map($$('[data-toc] a').map((a) => [a.getAttribute('href').slice(1), a]));
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { links.forEach((a) => a.classList.remove('is-on')); links.get(e.target.id)?.classList.add('is-on'); }
}, { rootMargin: '-20% 0px -70% 0px' });
$$('.dx-sec').forEach((s) => io.observe(s));
