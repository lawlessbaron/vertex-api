// The API site's staff backend, kept apart from VERTEX's admin: every call to
// the engine and tracer APIs, alerts the guard raised, speed by endpoint, a
// trace from any serial or request id, keys (revoke, lock to addresses),
// addresses (block, unblock), developers (open their console read only) and
// webhooks. Alerts also reach staff anywhere on VERTEX: the bell, email and
// the Discord alert channel.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (n) => Number(n || 0).toLocaleString();
const kb = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : b > 1e3 ? `${Math.round(b / 1024)} KB` : `${b || 0} B`);
const when = (t) => (t ? new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');
const ago = (t) => { if (!t) return 'never'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const pill = (s) => `<span class="cx-pill ${s >= 500 ? 'bad' : s >= 400 ? 'warn' : 'ok'}">${s}</span>`;
const SEV = { high: 'bad', warn: 'warn', info: 'info' };

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}

let days = 30, apiName = '', tab = 'overview', filters = {}, rows = [], next = null;
const pane = () => $('[data-pane]');
const tile = (title, inner, cls = '') => `<section class="ax-tile ad-card ${cls}"><div class="cx-tile-head"><h2>${title}</h2></div>${inner}</section>`;
const table = (head, body, empty = 'Nothing yet.') => (body ? `<div class="cx-table-wrap"><table class="cx-table"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>` : `<p class="cx-empty">${empty}</p>`);
const apiQ = () => (apiName ? `&api=${apiName}` : '');

function bars(el, list) {
  const max = Math.max(1, ...list.map((r) => r.n));
  el.innerHTML = list.length ? list.map((r) => `<div class="cx-hbar"><span title="${esc(r.name)}">${esc(r.name)}</span><i><b></b></i><em>${num(r.n)}</em></div>`).join('') : '<p class="cx-empty">Nothing yet.</p>';
  $$('.cx-hbar b', el).forEach((b, i) => { b.style.width = `${(list[i].n / max) * 100}%`; });
}
function chart(s) {
  const map = Object.fromEntries(s.byDay.map((d) => [d.day, d]));
  const list = Array.from({ length: s.days }, (_, i) => new Date(Date.now() - (s.days - 1 - i) * 86400e3).toISOString().slice(0, 10)).map((d) => ({ day: d, calls: map[d]?.calls || 0, errors: map[d]?.errors || 0 }));
  const max = Math.max(1, ...list.map((r) => r.calls)), W = 600, H = 170, bw = W / list.length;
  const g = list.map((r, i) => { const h = (r.calls / max) * (H - 20), he = (r.errors / max) * (H - 20), x = i * bw + bw * 0.15, w = Math.max(1, bw * 0.7); return `<g><title>${r.day}: ${r.calls} calls, ${r.errors} errors</title><rect class="ok" x="${x}" y="${H - h}" width="${w}" height="${h}" rx="2" /><rect class="err" x="${x}" y="${H - he}" width="${w}" height="${he}" rx="2" /></g>`; }).join('');
  return s.totals.calls ? `<svg class="cx-bars" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Calls per day">${g}</svg><div class="cx-axis ax-mono"><span>${list[0].day}</span><span>${list[list.length - 1].day}</span></div>` : '<p class="cx-empty">No calls in this period.</p>';
}

// ---------- overview ----------
async function overview() {
  const [s, al] = await Promise.all([call(`/api/admin/api/summary?days=${days}${apiQ()}`), call('/api/admin/api/alerts?open=1&limit=5')]);
  const t = s.totals, rate = t.calls ? Math.round((t.errors / t.calls) * 1000) / 10 : 0;
  pane().innerHTML = `
    <div class="cx-stats ad-stats">${[
      ['Calls', num(t.calls), `last ${s.days} days`], ['Errors', `${rate}%`, `${num(t.errors)} calls`], ['Files made', num(t.files), 'each with a serial'],
      ['Typical time', `${num(t.p50)} ms`, `95% under ${num(t.p95)} ms`], ['Sent', kb(t.bytes), 'files and answers'], ['Bad-key tries', num(s.badKeys.reduce((n, b) => n + b.n, 0)), '401s'],
    ].map(([k, v, x]) => `<div class="ax-tile cx-stat"><p class="ax-tile-k">${k}</p><p class="cx-big">${v}</p><p class="ax-tile-s">${x}</p></div>`).join('')}</div>
    ${al.alerts.length ? `<section class="ax-tile ad-card ad-open"><div class="cx-tile-head"><h2>Open alerts</h2><a class="cx-link" href="#alerts">All alerts</a></div>${alertRows(al.alerts)}</section>` : ''}
    <div class="cx-grid">
      <section class="ax-tile cx-chart"><div class="cx-tile-head"><h2>Calls per day</h2><span class="cx-legend"><i class="ok"></i>Worked <i class="err"></i>Errors</span></div>${chart(s)}</section>
      <section class="ax-tile cx-break"><h2>What was made</h2><div data-b="kind"></div><h3>Results</h3><div data-b="status"></div></section>
    </div>
    <div class="ad-cols">
      <section class="ax-tile cx-break"><h2>Endpoints</h2><div data-b="path"></div></section>
      <section class="ax-tile cx-break"><h2>Formats</h2><div data-b="format"></div></section>
    </div>
    <div class="ad-cols">
      ${tile('Busiest keys', table(['Key', 'Calls', 'Errors', ''], s.topKeys.map((k) => `<tr><td><b>${esc(k.name || '(no such key)')}</b> <span class="ax-mono cx-rid">${esc(k.hint)}</span> <span class="cx-rid">${esc(k.type)}</span></td><td>${num(k.n)}</td><td>${num(k.errors)}</td><td>${k.id ? `<button type="button" class="cx-link" data-fkey="${k.type}:${k.id}">Calls</button>` : ''}</td></tr>`).join('')))}
      ${tile('Busiest accounts', table(['Account', 'Calls', ''], s.topUsers.map((u) => `<tr><td>@${esc(u.handle)}</td><td>${num(u.n)}</td><td class="cx-actions"><button type="button" class="cx-link" data-fuser="${u.id}">Calls</button><a class="cx-link" href="/console?as=${u.id}">Console</a></td></tr>`).join('')))}
    </div>`;
  bars($('[data-b=kind]'), s.byKind);
  bars($('[data-b=status]'), s.byStatus.map((r) => ({ ...r, name: String(r.name) })));
  bars($('[data-b=path]'), s.byPath.map((r) => ({ ...r, name: r.name.replace('/api', '') })));
  bars($('[data-b=format]'), s.byFormat);
}

// ---------- alerts ----------
function alertRows(list) {
  return table(['When', 'Alert', 'Details', ''], list.map((a) => `
    <tr class="${a.acked ? 'is-revoked' : ''}">
      <td>${when(a.at)}</td>
      <td><span class="cx-pill ${SEV[a.severity] || 'warn'}">${esc(a.kind)}</span> ${esc(a.title)}</td>
      <td class="ad-wrap">${Object.entries(a.detail).map(([k, v]) => `${esc(k)}: <b>${esc(v)}</b>`).join(' · ')}</td>
      <td class="cx-actions">${a.ip ? `<button type="button" class="cx-link" data-fip="${esc(a.ip)}">Calls</button><button type="button" class="cx-link bad" data-block="${esc(a.ip)}">Block</button>` : ''}${a.key_id ? `<button type="button" class="cx-link" data-fkey="${a.key_type}:${a.key_id}">Calls</button>` : ''}${a.acked ? '<span class="cx-rid">done</span>' : `<button type="button" class="cx-link" data-ack="${a.id}">Done</button>`}</td>
    </tr>`).join(''), 'No alerts. Quiet is good.');
}
async function alertsTab() {
  const r = await call('/api/admin/api/alerts?limit=200');
  pane().innerHTML = `<section class="ax-tile ad-card">
    <div class="cx-tile-head"><h2>Alerts</h2><button type="button" class="ax-btn ax-btn-sm" data-scan>Check now</button></div>
    <p class="ax-tile-s ad-note">Checked every ten minutes: traffic spikes, keys that keep failing, busy keys that go quiet, key guessing, one address cycling keys or one account making many, and catalogue scraping. Each alert also reaches staff anywhere on VERTEX (the bell, email and Discord), and isn't raised again for six hours.</p>
    ${alertRows(r.alerts)}</section>`;
}

// ---------- calls ----------
const qs = (more) => { const q = new URLSearchParams({ ...filters, ...(apiName ? { api: apiName } : {}), ...(more && next ? { before: next } : {}) }); for (const [k, v] of [...q]) if (!v) q.delete(k); return q; };
async function callsTab() {
  pane().innerHTML = `<section class="ax-tile ad-card">
    <div class="cx-tile-head"><h2>Every call</h2>
      <form class="cx-filters" data-filter>
        <select name="status" aria-label="Result"><option value="">Any result</option><option value="ok">Worked</option><option value="error">Errors</option><option value="401">401 bad key</option><option value="403">403 refused</option><option value="429">429 over limit</option><option value="503">503 switched off</option></select>
        <input name="q" placeholder="Request id, serial, path, error or key start" aria-label="Search" value="${esc(filters.q || '')}" />
        <input name="ip" placeholder="IP" aria-label="IP" value="${esc(filters.ip || '')}" />
        <input name="userId" placeholder="Account id" inputmode="numeric" aria-label="Account id" value="${esc(filters.userId || '')}" />
        <button class="ax-btn ax-btn-sm">Find</button>
        <a class="ax-btn ax-btn-ghost ax-btn-sm" data-csv href="#">CSV</a>
      </form>
    </div>
    <p class="ax-tile-s" data-note></p>
    <div class="cx-table-wrap"><table class="cx-table cx-calls" data-rows></table></div>
    <button type="button" class="ax-btn ax-btn-ghost ax-btn-sm cx-more" data-more hidden>Older calls</button>
  </section>`;
  if (filters.status) $('[data-filter] [name=status]').value = filters.status;
  await search();
}
async function search(more = false) {
  const r = await call(`/api/admin/api/requests?${qs(more)}`);
  rows = more ? [...rows, ...r.rows] : r.rows;
  next = r.next;
  const note = Object.entries(filters).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ');
  $('[data-note]').innerHTML = note ? `Filtered by ${esc(note)} <button type="button" class="cx-link" data-clear>Clear</button>` : 'Every keyed call and every change, kept two years. Click a row for the details.';
  $('[data-csv]').href = `/api/admin/api/requests.csv?${qs(false)}`;
  $('[data-rows]').innerHTML = `<thead><tr><th>When</th><th>Call</th><th>Result</th><th>Key</th><th>Account</th><th>IP</th><th>What</th><th>Time</th><th>Serial</th><th>Request id</th></tr></thead><tbody>${rows.map((c) => `
    <tr class="cx-row" data-row="${c.id}" tabindex="0">
      <td>${when(c.at)}</td><td class="ax-mono"><b class="cx-m ${c.method === 'POST' ? 'post' : 'get'}">${esc(c.method)}</b> ${esc(c.path.replace('/api', ''))}</td><td>${pill(c.status)}</td>
      <td>${c.key ? `${esc(c.key.name || '(no such key)')} <span class="ax-mono cx-rid">${esc(c.key.hint || '')}</span>` : '<span class="cx-rid">none</span>'}</td>
      <td>${c.user ? `@${esc(c.user.handle)}` : '—'}</td><td class="ax-mono">${esc(c.ip || '')}</td>
      <td>${esc([c.kind, c.format].filter(Boolean).join(' · ') || '—')}</td><td>${num(c.ms)} ms</td>
      <td class="ax-mono">${esc(c.serial || '—')}</td><td class="ax-mono cx-rid">${esc(c.requestId)}</td>
    </tr>
    <tr class="cx-detail" data-detail="${c.id}" hidden><td colspan="10"><dl>
      <div><dt>Request id</dt><dd class="ax-mono">${esc(c.requestId)}</dd></div>
      <div><dt>Account</dt><dd>${c.user ? `@${esc(c.user.handle)} #${c.user.id} · ${esc(c.user.email || '')}` : '—'}</dd></div>
      <div><dt>Size</dt><dd>${kb(c.bytes)}</dd></div>
      <div><dt>Address</dt><dd class="ax-mono">${esc(c.ip || '—')} ${c.ip ? `<button type="button" class="cx-link bad" data-block="${esc(c.ip)}">Block</button>` : ''}</dd></div>
      <div class="wide"><dt>Client</dt><dd>${esc(c.ua || '—')}</dd></div>
      ${c.error ? `<div class="wide"><dt>Error the caller saw</dt><dd class="cx-err">${esc(c.error)}</dd></div>` : ''}
      ${c.params ? `<div class="wide"><dt>Settings sent</dt><dd><pre class="ax-code">${esc(JSON.stringify(c.params, null, 2))}</pre></dd></div>` : ''}
      ${c.serial ? `<div class="wide"><dd><button type="button" class="ax-btn ax-btn-sm" data-traceid="${esc(c.serial)}">Trace this file</button></dd></div>` : ''}
    </dl></td></tr>`).join('') || '<tr><td colspan="10" class="cx-empty">No calls match.</td></tr>'}</tbody>`;
  $('[data-more]').hidden = !next;
}

// ---------- trace ----------
async function traceTab(id = '') {
  pane().innerHTML = `<section class="ax-tile ad-card">
    <div class="cx-tile-head"><h2>Trace a file or call</h2></div>
    <p class="ax-tile-s ad-note">Paste a serial from a file (VX-…) or a request id a developer quoted (req_…). You get the call, the key, the account and the download record. Each trace is written to the audit log.</p>
    <form class="cx-filters" data-trace><input class="ad-wide" name="id" placeholder="VX-2609-7K3M-Q9TD or req_…" value="${esc(id)}" required aria-label="Serial or request id" /><button class="ax-btn ax-btn-primary ax-btn-sm">Trace</button></form>
    <div data-traceout></div></section>`;
  if (id) await trace(id);
}
async function trace(id) {
  const out = $('[data-traceout]');
  out.innerHTML = '<p class="cx-empty">Tracing…</p>';
  try {
    const t = await call(`/api/admin/api/trace/${encodeURIComponent(id.trim())}`);
    const c = t.call, d = t.download, k = t.key;
    const kv = (pairs) => `<dl class="ad-kv">${pairs.filter(Boolean).map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>`;
    out.innerHTML = `<div class="ad-trace">
      <div class="ax-tile"><h3>The call</h3>${c ? kv([['Request id', `<span class="ax-mono">${esc(c.requestId)}</span>`], ['When', when(c.at)], ['Call', `<span class="ax-mono">${esc(c.method)} ${esc(c.path)}</span> ${pill(c.status)} ${num(c.ms)} ms`], ['Made', esc([c.kind, c.format].filter(Boolean).join(' · ') || '—')], ['From', `<span class="ax-mono">${esc(c.ip || '')}</span>`], ['Client', esc(c.ua || '—')], c.error && ['Error', `<span class="cx-err">${esc(c.error)}</span>`]]) : '<p class="cx-empty">Not an API call: made on VERTEX, or before calls were recorded.</p>'}</div>
      <div class="ax-tile"><h3>Who</h3>${kv([['Account', c?.user ? `@${esc(c.user.handle)} #${c.user.id}<br>${esc(c.user.email || '')}` : d?.handle ? `@${esc(d.handle)}` : '—'], k && ['Key', `${esc(k.name)} <span class="ax-mono">${esc(k.key_hint || '')}</span><br>${num(k.calls)} calls${k.revoked_at ? ' · <span class="cx-pill bad">revoked</span>' : ''}`], c?.user && ['Console', `<a class="cx-link" href="/console?as=${c.user.id}">Open as them</a>`]])}</div>
      ${d ? `<div class="ax-tile"><h3>The file</h3>${kv([['Serial', `<span class="ax-mono">${esc(d.serial)}</span>`], ['Made', when(d.created_at)], ['Engine', esc(d.engine)], ['Kind', `${esc(d.kind)} · ${esc(d.format)}`]])}</div>` : ''}
    </div>
    ${(c?.params || d?.params) ? `<h3 class="ad-h3">Settings</h3><pre class="ax-code ad-pre">${esc(JSON.stringify(c?.params || d?.params, null, 2))}</pre>` : ''}`;
  } catch (e) { out.innerHTML = `<p class="cx-err">${esc(e.message)}</p>`; }
}

// ---------- speed ----------
async function latencyTab() {
  const r = await call(`/api/admin/api/latency?days=${days}${apiQ()}`);
  const max = Math.max(1, ...r.rows.map((x) => x.p99));
  pane().innerHTML = tile(`Speed by endpoint <span class="cx-rid">last ${r.days} days</span>`, `<p class="ax-tile-s ad-note">How long calls take, end to end on the server. p50: half are faster. p95 and p99: all but the slowest 5% and 1%.</p>${table(['Endpoint', 'Calls', 'p50', 'p95', 'p99', 'Slowest', ''], r.rows.map((x) => `<tr><td class="ax-mono">${esc(x.path.replace('/api', ''))}</td><td>${num(x.calls)}</td><td>${num(x.p50)} ms</td><td>${num(x.p95)} ms</td><td>${num(x.p99)} ms</td><td>${num(x.max)} ms</td><td class="ad-lat"><span class="cx-quota"><i><b data-w="${(x.p95 / max) * 100}"></b></i></span></td></tr>`).join(''), 'No calls in this period.')}`);
  $$('[data-w]').forEach((b) => { b.style.width = `${b.dataset.w}%`; });
}

// ---------- keys ----------
const lock = (k) => (k.allowIps ? `<span class="cx-lock on" title="${esc(k.allowIps)}">locked: ${esc(k.allowIps)}</span>` : '<span class="cx-lock">any address</span>');
async function keysTab() {
  const k = await call('/api/admin/api/keys');
  pane().innerHTML = tile(`Engine keys <span class="cx-rid">${k.engine.filter((x) => !x.revokedAt).length} live · ${k.engine.filter((x) => x.revokedAt).length} revoked</span>`, table(['Key', 'Account', 'Calls', 'Made', 'Last used', ''], k.engine.map((x) => `
      <tr class="${x.revokedAt ? 'is-revoked' : ''}"><td><b>${esc(x.name)}</b> <span class="ax-mono cx-rid">${esc(x.hint || '')}</span>${x.revokedAt ? ` <span class="cx-pill bad">revoked ${ago(x.revokedAt)}</span>` : ''}<br>${lock(x)}</td>
      <td>@${esc(x.handle)} <span class="cx-rid">${esc(x.email)}</span></td><td>${num(x.calls)}</td><td>${ago(x.createdAt)}</td><td>${ago(x.lastUsedAt)}</td>
      <td class="cx-actions"><button type="button" class="cx-link" data-fkey="engine:${x.id}">Calls</button><a class="cx-link" href="/console?as=${x.userId}">Console</a>${x.revokedAt ? '' : `<button type="button" class="cx-link" data-lock="engine:${x.id}" data-allow="${esc(x.allowIps || '')}">Lock</button><button type="button" class="cx-link bad" data-revoke="engine:${x.id}">Revoke</button>`}</td></tr>`).join(''), 'Nobody has made a key yet.'))
    + tile('Tracer keys <span class="cx-rid">issued by the owner</span>', table(['Key', 'This month', 'Calls', 'Last used', ''], k.trace.map((x) => `
      <tr class="${x.revokedAt ? 'is-revoked' : ''}"><td><b>${esc(x.name)}</b> <span class="ax-mono cx-rid">${esc(x.hint || '')}</span>${x.test ? ' <span class="cx-pill info">test</span>' : ''}${x.revokedAt ? ' <span class="cx-pill bad">revoked</span>' : ''}<br>${lock(x)}</td>
      <td>${num(x.used)} / ${num(x.quota)}</td><td>${num(x.calls)}</td><td>${ago(x.lastUsedAt)}</td>
      <td class="cx-actions"><button type="button" class="cx-link" data-fkey="trace:${x.id}">Calls</button>${x.revokedAt ? '' : `<button type="button" class="cx-link" data-lock="trace:${x.id}" data-allow="${esc(x.allowIps || '')}">Lock</button><button type="button" class="cx-link bad" data-revoke="trace:${x.id}">Revoke</button>`}</td></tr>`).join(''), 'No tracer keys issued.'));
}

// ---------- addresses ----------
async function addressesTab() {
  const [s, b] = await Promise.all([call(`/api/admin/api/summary?days=${days}${apiQ()}`), call('/api/admin/api/blocks')]);
  pane().innerHTML = tile('Blocked addresses', `
      <form class="cx-filters ad-blockform" data-blockform>
        <input name="ip" placeholder="IP address" required aria-label="IP address" />
        <input name="reason" placeholder="Why (for the audit log)" aria-label="Reason" />
        <select name="hours" aria-label="For how long"><option value="1">1 hour</option><option value="24" selected>1 day</option><option value="168">1 week</option><option value="0">For good</option></select>
        <button class="ax-btn ax-btn-sm">Block</button>
      </form>
      ${table(['Address', 'Why', 'By', 'Since', 'Until', ''], b.blocks.map((x) => `<tr><td class="ax-mono">${esc(x.ip)}</td><td class="ad-wrap">${esc(x.reason || '—')}</td><td>${x.by_handle ? `@${esc(x.by_handle)}` : '—'}</td><td>${ago(x.created_at)}</td><td>${x.until ? when(x.until) : 'for good'}</td><td class="cx-actions"><button type="button" class="cx-link" data-unblock="${esc(x.ip)}">Unblock</button></td></tr>`).join(''), 'Nobody is blocked.')}
      <p class="ax-tile-s">A blocked address gets a 403 from both APIs. The site itself still works for them.</p>`)
    + `<div class="ad-cols">
      ${tile('Busiest addresses', table(['IP', 'Calls', 'Errors', ''], s.topIps.map((r) => `<tr><td class="ax-mono">${esc(r.ip)}</td><td>${num(r.n)}</td><td>${num(r.errors)}</td><td class="cx-actions"><button type="button" class="cx-link" data-fip="${esc(r.ip)}">Calls</button><button type="button" class="cx-link bad" data-block="${esc(r.ip)}">Block</button></td></tr>`).join('')))}
      ${tile('Keys that don’t work <span class="cx-rid">401s</span>', table(['Key sent', 'From', 'Tries', 'Last', ''], s.badKeys.map((r) => `<tr><td class="ax-mono">${esc(r.hint || '(none)')}</td><td class="ax-mono">${esc(r.ip || '')}</td><td>${num(r.n)}</td><td>${ago(r.last)}</td><td class="cx-actions">${r.ip ? `<button type="button" class="cx-link bad" data-block="${esc(r.ip)}">Block</button>` : ''}</td></tr>`).join(''), 'None. Good.'))}
    </div>`;
}

// ---------- developers ----------
async function developersTab(q = '') {
  const r = await call(`/api/admin/api/developers?q=${encodeURIComponent(q)}`);
  pane().innerHTML = tile('Developers', `
    <form class="cx-filters" data-devsearch><input name="q" placeholder="Username or email" value="${esc(q)}" aria-label="Find a developer" /><button class="ax-btn ax-btn-sm">Find</button></form>
    <p class="ax-tile-s ad-note">Open a developer's console to see exactly what they see. It's read only, and each look is written to the audit log.</p>
    ${table(['Account', 'Keys', 'Last call', ''], r.developers.map((d) => `<tr><td>@${esc(d.handle)} <span class="cx-rid">#${d.id} · ${esc(d.email)}</span></td><td>${num(d.live)} live of ${num(d.keys)}</td><td>${ago(d.lastUsedAt)}</td><td class="cx-actions"><button type="button" class="cx-link" data-fuser="${d.id}">Calls</button><a class="cx-link" href="/console?as=${d.id}">Open console</a></td></tr>`).join(''), 'Nobody matches.')}`);
}

// ---------- webhooks ----------
async function webhooksTab() {
  const r = await call('/api/admin/api/webhooks');
  pane().innerHTML = tile('Developers’ webhooks', table(['Address', 'Account', 'Events', 'Delivered', 'Failed', 'Waiting', 'Added'], r.webhooks.map((h) => `
    <tr class="${h.disabledAt ? 'is-revoked' : ''}"><td class="ax-mono">${esc(h.url)}${h.disabledAt ? ' <span class="cx-pill bad">removed</span>' : ''}</td><td>@${esc(h.handle)}</td><td class="ax-mono">${esc(h.events).replace(/,/g, '<br>')}</td><td>${num(h.delivered)}</td><td>${h.failed ? `<span class="cx-pill bad">${num(h.failed)}</span>` : '0'}</td><td>${num(h.pending)}</td><td>${ago(h.createdAt)}</td></tr>`).join(''), 'No webhooks yet.'));
}

// ---------- plans and money ----------
async function plansTab() {
  const r = await call('/api/admin/api/plans');
  const cur = r.currency;
  const field = (p, k, type = 'number', extra = '') => `<input class="cx-input ad-pin" data-f="${k}" type="${type}" value="${esc(Array.isArray(p[k]) ? p[k].join('\n') : p[k])}" ${extra} aria-label="${k}" />`;
  pane().innerHTML = `<div class="cx-stats ad-stats">${[
      ['Monthly from plans', `$${num(r.revenue.mrr)}`, `${cur}, paying plans`],
      ['Extra use this month', `$${r.revenue.overThisMonth.toFixed(2)}`, 'billed daily'],
      ...r.revenue.byPlan.map((b) => [b.plan, num(b.n), 'paying']),
    ].map(([k, v, x]) => `<div class="ax-tile cx-stat"><p class="ax-tile-k">${esc(k)}</p><p class="cx-big">${v}</p><p class="ax-tile-s">${esc(x)}</p></div>`).join('')}</div>`
    + tile(`Plans <span class="cx-rid">${r.stripe ? 'payments ready' : 'payments not set up: add the Stripe keys in VERTEX Admin → Memberships'}</span>`, `
      <p class="ax-tile-s ad-note">Prices are monthly, in ${esc(cur)}. Changing a price only affects new sign-ups and switches; people already paying keep their price until they change plan. "Extra per 1,000" above $0 means calls keep working past the day's allowance and are billed daily, up to the cap (the developer can set it lower).</p>
      <div class="cx-table-wrap"><table class="cx-table ad-plans" data-plansform><thead><tr><th>On</th><th>Id</th><th>Name</th><th>$/month</th><th>/minute</th><th>/day</th><th>Keys</th><th>Extra per 1,000</th><th>Extra cap $/month</th><th>Blurb</th><th>Perks (one a line)</th></tr></thead><tbody>
      ${r.plans.map((p) => `<tr data-plan="${esc(p.id)}"><td><input type="checkbox" data-f="active" ${p.active ? 'checked' : ''} ${p.id === 'free' ? 'disabled' : ''} aria-label="On" /></td><td class="ax-mono">${esc(p.id)}</td><td>${field(p, 'name', 'text')}</td><td>${field(p, 'monthly', 'number', p.id === 'free' ? 'disabled' : 'min="0" step="1"')}</td><td>${field(p, 'perMinute')}</td><td>${field(p, 'perDay')}</td><td>${field(p, 'keys')}</td><td>${field(p, 'overagePer1000', 'number', p.id === 'free' ? 'disabled' : 'min="0" step="0.05"')}</td><td>${field(p, 'overageCap', 'number', p.id === 'free' ? 'disabled' : 'min="0"')}</td><td>${field(p, 'blurb', 'text')}</td><td><textarea class="cx-input ad-pin ad-perks" data-f="perks" rows="2" aria-label="Perks">${esc((p.perks || []).join('\n'))}</textarea></td></tr>`).join('')}
      </tbody></table></div>
      <div class="cx-filters ad-gap"><button type="button" class="ax-btn ax-btn-primary ax-btn-sm" data-saveplans>Save plans</button><button type="button" class="ax-btn ax-btn-sm" data-billnow>Bill yesterday's extra use now</button></div>`)
    + tile('Give a plan', `
      <form class="cx-filters" data-grant>
        <input class="cx-input" name="userId" inputmode="numeric" placeholder="Account id" required aria-label="Account id" />
        <select name="plan" aria-label="Plan">${r.plans.filter((p) => p.id !== 'free').map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select>
        <select name="days" aria-label="For how long"><option value="30">30 days</option><option value="90">90 days</option><option value="365">A year</option><option value="0">For good</option></select>
        <input class="cx-input" name="note" placeholder="Why (partner, prize, friend)" aria-label="Note" />
        <button class="ax-btn ax-btn-sm">Give</button>
      </form>
      <p class="ax-tile-s">Find an account id in Developers. Given plans aren't charged, and their extra use is marked "manual plan" for you to bill by hand.</p>`)
    + tile(`On a plan <span class="cx-rid">${r.subscribers.length}</span>`, table(['Account', 'Plan', 'Status', 'Paid by', 'Renews or ends', 'Extra this month', ''], r.subscribers.map((x) => `
      <tr class="${['active', 'trialing', 'past_due'].includes(x.status) ? '' : 'is-revoked'}"><td>@${esc(x.handle)} <span class="cx-rid">#${x.user_id}</span></td><td>${esc(x.plan)}</td><td><span class="cx-pill ${x.status === 'active' ? 'ok' : x.status === 'past_due' ? 'warn' : 'bad'}">${esc(x.status)}</span>${x.cancel_at_period_end ? ' <span class="cx-rid">ending</span>' : ''}</td><td>${esc(x.provider)}${x.note ? ` <span class="cx-rid">${esc(x.note)}</span>` : ''}</td><td>${x.period_end ? when(x.period_end) : '—'}</td><td>$${(x.overCents / 100).toFixed(2)}</td>
      <td class="cx-actions"><a class="cx-link" href="/console?as=${x.user_id}">Console</a>${['active', 'trialing', 'past_due'].includes(x.status) ? `<button type="button" class="cx-link bad" data-plancancel="${x.user_id}">Cancel</button>` : ''}</td></tr>`).join(''), 'Nobody yet.'));
}

// ---------- status page incidents ----------
async function statusTab() {
  const [r, live] = await Promise.all([call('/api/admin/api/incidents'), call('/api/status')]);
  const comps = Object.entries(r.components);
  const open = r.incidents.filter((i) => !i.resolvedAt), past = r.incidents.filter((i) => i.resolvedAt);
  const opt = (list, cur) => list.map((x) => `<option value="${x}" ${x === cur ? 'selected' : ''}>${x}</option>`).join('');
  pane().innerHTML = tile(`Status page <span class="cx-rid">now: ${esc(live.overall)}</span>`, `
      <p class="ax-tile-s ad-note">What developers see at <a class="cx-link" href="/status" target="_blank">/status</a>. The checks run themselves; incidents are yours to write. Each one you open or update also goes to every developer with an incident.updated webhook. Keep it plain: what people see, what you're doing, when you'll update next.</p>
      <div class="ad-cols">${live.components.map((c) => `<div class="ax-tile"><b>${esc(c.name)}</b><p class="ax-tile-s">${esc(c.state)}${c.uptime != null ? ` · ${c.uptime}% over 90 days` : ''}${c.checkedAt ? ` · checked ${ago(c.checkedAt)}` : ''}</p></div>`).join('')}</div>`)
    + tile('Open an incident', `
      <form class="ad-incform" data-incident>
        <input class="cx-input" name="title" maxlength="160" placeholder="Short title, e.g. Slow file generation" required aria-label="Title" />
        <div class="cx-filters"><label>Impact <select name="impact">${opt(r.impacts, 'minor')}</select></label><label>Status <select name="status">${opt(r.statuses.filter((x) => x !== 'resolved'), 'investigating')}</select></label></div>
        <div class="cx-events">${comps.map(([k, c]) => `<label><input type="checkbox" name="components" value="${k}" /> ${esc(c.name)}</label>`).join('')}</div>
        <textarea class="cx-input ad-text" name="body" rows="3" maxlength="4000" placeholder="What people are seeing, and what you're doing about it" required aria-label="First update"></textarea>
        <button class="ax-btn ax-btn-primary ax-btn-sm">Post it</button>
      </form>`)
    + tile(`Open incidents <span class="cx-rid">${open.length}</span>`, open.length ? open.map((i) => `
      <div class="ad-inc">
        <b>${esc(i.title)}</b> <span class="cx-pill warn">${esc(i.impact)}</span> <span class="cx-pill info">${esc(i.status)}</span> <span class="cx-rid">${i.components.map(esc).join(', ')} · since ${when(i.createdAt)}</span>
        <ul>${i.updates.map((u) => `<li><span class="cx-rid">${when(u.at)} · ${esc(u.status)}</span> ${esc(u.body)}</li>`).join('')}</ul>
        <form class="ad-incform" data-incupdate="${i.id}">
          <div class="cx-filters"><label>Status <select name="status">${opt(r.statuses, i.status)}</select></label><label>Impact <select name="impact">${opt(r.impacts, i.impact)}</select></label></div>
          <textarea class="cx-input ad-text" name="body" rows="2" maxlength="4000" placeholder="What changed" required aria-label="Update"></textarea>
          <button class="ax-btn ax-btn-sm">Post update</button>
        </form>
      </div>`).join('') : '<p class="cx-empty">Nothing open.</p>')
    + tile('Resolved', table(['Incident', 'Impact', 'From', 'To'], past.map((i) => `<tr><td class="ad-wrap">${esc(i.title)}</td><td>${esc(i.impact)}</td><td>${when(i.createdAt)}</td><td>${when(i.resolvedAt)}</td></tr>`).join(''), 'None in the last year.'));
}


// ---------- settings: switches, tracer keys, the line to VERTEX ----------
const yes = (on, okText, offText) => `<span class="cx-pill ${on ? 'ok' : 'bad'}">${on ? okText : offText}</span>`;
async function settingsTab() {
  const [s, t] = await Promise.all([call('/api/admin/api/settings'), call('/api/admin/trace-api').catch(() => null)]);
  const v = s.vertex;
  pane().innerHTML = `<div class="ad-cols">
    ${tile('Switches', `<dl class="ad-kv">
        <dt>Engine API</dt><dd><label><input type="checkbox" data-sw="engine" ${s.engineApi ? 'checked' : ''} /> ${s.engineApi ? 'On: anyone with a key' : 'Off: staff keys only'}</label></dd>
        <dt>Tracer API</dt><dd>${t ? `<label><input type="checkbox" data-sw="tracer" ${t.on ? 'checked' : ''} /> ${t.on ? 'On' : 'Off: test keys only'}</label> ${yes(t.ready, 'ready', 'not set up')}` : '<span class="cx-rid">owners only</span>'}</dd>
        <dt>Engine</dt><dd class="ax-mono">${esc(s.engine)}</dd>
        <dt>Payments</dt><dd>${yes(s.stripe.ready, 'Stripe connected', 'no Stripe key')} ${yes(s.stripe.webhook, 'webhook secret set', 'no webhook secret')}</dd>
        <dt>Audit log</dt><dd>${yes(s.audit.ok, `${num(s.audit.count)} entries, chain intact`, `broken at #${s.audit.brokenAt}`)}</dd>
      </dl>`)}
    ${tile('VERTEX', `<dl class="ad-kv">
        <dt>Address</dt><dd class="ax-mono">${esc(v.url)}</dd>
        <dt>Link</dt><dd>${yes(v.linked, 'linked', 'not set up (API_LINK_SECRET)')}</dd>
        <dt>Size limits</dt><dd>grid up to ${num(v.controls.limits?.maxGrid)}, ${num(v.controls.limits?.maxHeightUnits)} units tall</dd>
        <dt>Paused on VERTEX</dt><dd>${Object.keys(v.controls.generators || {}).map(esc).join(', ') || 'nothing'}${(v.controls.disabled || []).length ? ` · off: ${v.controls.disabled.map(esc).join(', ')}` : ''}</dd>
        <dt>Checked</dt><dd>${v.controls.at ? ago(v.controls.at) : 'never'} <button type="button" class="cx-link" data-vref>Check now</button></dd>
        <dt>Brought over</dt><dd>${v.imported ? `${when(v.imported.at)}: ${Object.entries(v.imported.counts).filter(([, n]) => n).map(([k, n]) => `${num(n)} ${esc(k.replace(/_/g, ' '))}`).join(', ') || 'nothing new'}` : 'not yet'} <button type="button" class="cx-link" data-vimport>Bring over again</button></dd>
      </dl><p class="ax-tile-s">Accounts, bans and roles live on VERTEX. People sign in there; alerts from here reach VERTEX staff.</p>`)}
  </div>
  ${t ? tile('Issue a tracer key', `<form class="cx-filters" data-tkform>
      <input name="name" placeholder="Who it’s for" required aria-label="Who it’s for" />
      <input name="quota" type="number" min="1" max="100000" value="${t.limits?.defaultQuota || 500}" aria-label="Photos a month" />
      <label class="cx-rid"><input type="checkbox" name="test" /> test key (works while the API is off)</label>
      <button class="ax-btn ax-btn-sm">Issue key</button>
    </form><div data-tknew></div><p class="ax-tile-s">Keys are shown once. Revoke or lock them under Keys.</p>`) : ''}`;
}

const TABS = { settings: settingsTab, overview, alerts: alertsTab, calls: callsTab, trace: () => traceTab(), latency: latencyTab, keys: keysTab, addresses: addressesTab, developers: () => developersTab(), webhooks: webhooksTab, plans: plansTab, status: statusTab };
async function show(name = tab) {
  tab = TABS[name] ? name : 'overview';
  $$('[data-tabs] a').forEach((a) => a.setAttribute('aria-current', String(a.getAttribute('href') === `#${tab}`)));
  try { await TABS[tab](); } catch (e) { pane().innerHTML = `<p class="cx-err">${esc(e.message)}</p>`; }
  refreshCount();
}
async function refreshCount() {
  try {
    const r = await call('/api/admin/api/alerts?open=1&limit=500');
    const b = $('[data-alertcount]');
    b.hidden = !r.alerts.length;
    b.textContent = r.alerts.length;
  } catch { /* the badge can wait */ }
}
const goCalls = (f) => { filters = f; rows = []; next = null; if (location.hash === '#calls') show('calls'); else location.hash = 'calls'; };

document.addEventListener('change', async (e) => {
  const sw = e.target.dataset?.sw;
  if (!sw) return;
  try {
    if (sw === 'engine') await call('/api/admin/api/settings', { method: 'PUT', body: { engineApi: e.target.checked } });
    else await call('/api/admin/trace-api', { method: 'PUT', body: { on: e.target.checked } });
  } catch (err) { alert(err.message); }
  show('settings');
});
document.addEventListener('click', async (e) => {
  if (e.target.closest?.('[data-vref]')) { try { await call('/api/admin/api/vertex/refresh', { method: 'POST' }); } catch (err) { alert(err.message); } return show('settings'); }
  if (e.target.closest?.('[data-vimport]')) { if (!confirm('Bring the API’s records over from VERTEX again? Rows already here stay as they are.')) return; try { await call('/api/admin/api/vertex/import', { method: 'POST' }); } catch (err) { alert(err.message); } return show('settings'); }
  const t = e.target;
  const d = t.closest('[data-days]');
  if (d) { days = Number(d.dataset.days); $$('[data-days]').forEach((b) => b.setAttribute('aria-pressed', String(b === d))); return show(); }
  const a = t.closest('[data-api]');
  if (a) { apiName = a.dataset.api; $$('[data-api]').forEach((b) => b.setAttribute('aria-pressed', String(b === a))); return show(); }
  if (t.dataset.fkey) { const [keyType, keyId] = t.dataset.fkey.split(':'); return goCalls({ keyType, keyId }); }
  if (t.dataset.fuser) return goCalls({ userId: t.dataset.fuser });
  if (t.dataset.fip) return goCalls({ ip: t.dataset.fip });
  if (t.matches('[data-clear]')) { filters = {}; return search(); }
  if (t.matches('[data-more]')) return search(true);
  if (t.dataset.traceid) { const id = t.dataset.traceid; history.replaceState(null, '', '#trace'); tab = 'trace'; $$('[data-tabs] a').forEach((x) => x.setAttribute('aria-current', String(x.getAttribute('href') === '#trace'))); return traceTab(id); }
  if (t.matches('[data-scan]')) { t.disabled = true; try { const r = await call('/api/admin/api/scan', { method: 'POST' }); t.textContent = r.raised ? `${r.raised} new` : 'Nothing new'; await alertsTab(); } catch (err) { alert(err.message); } return; }
  if (t.dataset.ack) { try { await call(`/api/admin/api/alerts/${t.dataset.ack}/ack`, { method: 'POST' }); show(); } catch (err) { alert(err.message); } return; }
  if (t.dataset.block) {
    const reason = prompt(`Block ${t.dataset.block} from both APIs for a day? Say why (it goes in the audit log). Use Addresses to block for longer.`);
    if (reason === null) return;
    try { await call('/api/admin/api/blocks', { method: 'POST', body: { ip: t.dataset.block, reason, hours: 24 } }); show(); } catch (err) { alert(err.message); }
    return;
  }
  if (t.dataset.unblock) { try { await call(`/api/admin/api/blocks/${encodeURIComponent(t.dataset.unblock)}`, { method: 'DELETE' }); show(); } catch (err) { alert(err.message); } return; }
  if (t.dataset.revoke) {
    const reason = prompt('Revoke this key? Anything using it stops straight away, and the developer’s webhooks are told. Why? (Kept in the audit log.)');
    if (reason === null) return;
    const [type, id] = t.dataset.revoke.split(':');
    try { await call(`/api/admin/api/keys/${type}/${id}/revoke`, { method: 'POST', body: { reason } }); show(); } catch (err) { alert(err.message); }
    return;
  }
  if (t.dataset.lock) {
    const v = prompt('Only allow this key from these addresses (IPs, or IPv4 ranges like 203.0.113.0/24), separated by commas. Empty: any address.', t.dataset.allow || '');
    if (v === null) return;
    const [type, id] = t.dataset.lock.split(':');
    try { await call(`/api/admin/api/keys/${type}/${id}/allow`, { method: 'POST', body: { allowIps: v } }); show(); } catch (err) { alert(err.message); }
    return;
  }
  if (t.matches('[data-saveplans]')) {
    const plans = $$('[data-plansform] [data-plan]').map((tr) => {
      const o = { id: tr.dataset.plan };
      $$('[data-f]', tr).forEach((i) => { o[i.dataset.f] = i.type === 'checkbox' ? i.checked : i.dataset.f === 'perks' ? i.value.split('\n') : i.type === 'number' ? Number(i.value) : i.value; });
      return o;
    });
    try { await call('/api/admin/api/plans', { method: 'PUT', body: { plans } }); t.textContent = 'Saved'; setTimeout(show, 700); } catch (err) { alert(err.message); }
    return;
  }
  if (t.matches('[data-billnow]')) { try { const r = await call('/api/admin/api/plans/bill', { method: 'POST' }); t.textContent = `${r.billed} billed`; } catch (err) { alert(err.message); } return; }
  if (t.dataset.plancancel) {
    if (!confirm('Cancel their plan now? A paid plan is cancelled in Stripe straight away, with no refund for the rest of the month.')) return;
    try { await call('/api/admin/api/plans/cancel', { method: 'POST', body: { userId: Number(t.dataset.plancancel) } }); show(); } catch (err) { alert(err.message); }
    return;
  }
  const row = t.closest('[data-row]');
  if (row && !t.closest('button, a')) { const det = $(`[data-detail="${row.dataset.row}"]`); det.hidden = !det.hidden; row.classList.toggle('is-open', !det.hidden); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches?.('[data-row]')) e.target.click(); });
document.addEventListener('submit', async (e) => {
  if (e.target.matches?.('[data-tkform]')) {
    e.preventDefault();
    const f = e.target;
    try {
      const k = await call('/api/admin/trace-api/keys', { method: 'POST', body: { name: f.name.value, quota: Number(f.quota.value), test: f.test.checked } });
      $('[data-tknew]').innerHTML = `<p class="ax-tile-s">Key for <b>${esc(k.name)}</b> (copy it now, it isn’t shown again):</p><pre class="ad-pre ax-mono">${esc(k.key)}</pre>`;
      f.reset();
    } catch (err) { alert(err.message); }
    return;
  }
  const f = e.target;
  e.preventDefault();
  if (f.matches('[data-filter]')) { const d = new FormData(f); filters = { ...filters, status: d.get('status'), q: String(d.get('q') || '').trim(), ip: String(d.get('ip') || '').trim(), userId: String(d.get('userId') || '').trim() }; return search(); }
  if (f.matches('[data-trace]')) return trace(f.id.value);
  if (f.matches('[data-devsearch]')) return developersTab(f.q.value);
  if (f.matches('[data-grant]')) {
    const d = new FormData(f);
    try { await call('/api/admin/api/plans/grant', { method: 'POST', body: { userId: Number(d.get('userId')), plan: d.get('plan'), days: Number(d.get('days')), note: d.get('note') } }); show(); } catch (err) { alert(err.message); }
    return;
  }
  if (f.matches('[data-incident]')) {
    const d = new FormData(f);
    try { await call('/api/admin/api/incidents', { method: 'POST', body: { title: d.get('title'), impact: d.get('impact'), status: d.get('status'), components: d.getAll('components'), body: d.get('body') } }); statusTab(); } catch (err) { alert(err.message); }
    return;
  }
  if (f.matches('[data-incupdate]')) {
    const d = new FormData(f);
    try { await call(`/api/admin/api/incidents/${f.dataset.incupdate}/updates`, { method: 'POST', body: { status: d.get('status'), impact: d.get('impact'), body: d.get('body') } }); statusTab(); } catch (err) { alert(err.message); }
    return;
  }
  if (f.matches('[data-blockform]')) {
    const d = new FormData(f);
    try { await call('/api/admin/api/blocks', { method: 'POST', body: { ip: d.get('ip'), reason: d.get('reason'), hours: Number(d.get('hours')) } }); show(); } catch (err) { alert(err.message); }
  }
});
window.addEventListener('hashchange', () => show(location.hash.slice(1)));

(async () => {
  try { await call('/api/admin/api/alerts?open=1&limit=1'); } catch (e) {
    $('[data-signin]').hidden = false;
    if (e.status === 403) { $('[data-signin] h2').textContent = 'Admins only'; $('[data-signin] p').textContent = e.message; $('[data-signin] a').hidden = true; }
    return;
  }
  $('[data-app]').hidden = false;
  show(location.hash.slice(1) || 'overview');
})();
