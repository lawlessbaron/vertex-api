// The changelog page: every release from GET /api/changelog, each change tagged by what it touches
// (the API itself, the model engine, or the photo tracer), with filters.
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const AREAS = { api: 'API', engine: 'Model engine', tracer: 'Photo tracer' };
// What a change touches, from its words.
export const areaOf = (t) => /\b(trac(e|er|ing)|outline|shadow|photo|paper)/i.test(t) ? 'tracer'
  : /\b(engine|kinds?|models?|generators?|rack|bin|baseplate|panel|faces?|triangles?|STL|3MF)\b|`[a-z]+`/i.test(t) ? 'engine' : 'api';
// "**Bold lead:** text" → the lead in bold, the rest plain; `code` kept as code.
const rich = (t) => esc(t).replace(/^([^:]{2,80}):\s/, '<b>$1:</b> ').replace(/`([^`]+)`/g, '<code>$1</code>');

let releases = [], show = 'all';
function draw() {
  const list = releases.map((r) => ({ ...r, items: r.items.filter((i) => show === 'all' || i.area === show) })).filter((r) => r.items.length);
  $('[data-releases]').innerHTML = list.map((r, n) => `
    <article class="ax-tile cl-rel${n === 0 && show === 'all' ? ' cl-new' : ''}" id="v${esc(r.version)}">
      <header><h2>${esc(r.version)}</h2><time>${esc(r.date)}</time>${n === 0 && show === 'all' ? '<span class="cl-badge">Latest</span>' : ''}</header>
      <ul>${r.items.map((i) => `<li><span class="cl-tag ${i.area}">${AREAS[i.area]}</span><p>${rich(i.text)}</p></li>`).join('')}</ul>
    </article>`).join('') || '<p class="cx-empty">Nothing here yet.</p>';
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-area]');
  if (!b) return;
  show = b.dataset.area;
  for (const x of document.querySelectorAll('[data-area]')) x.setAttribute('aria-pressed', String(x === b));
  draw();
});
fetch('/api/changelog?limit=100').then((r) => r.json()).then(({ entries }) => {
  releases = entries.map((e) => ({ ...e, items: e.items.map((i) => ({ ...i, area: areaOf(`${i.heading} ${i.text}`) })) }));
  const top = releases[0];
  $('[data-latest]').innerHTML = top ? `Latest: <b>${esc(top.version)}</b> on ${esc(top.date)} · ${releases.length} updates listed` : '';
  draw();
}).catch(() => { $('[data-latest]').textContent = 'Couldn’t load the changelog. It’s also at /changelog.rss.'; });
