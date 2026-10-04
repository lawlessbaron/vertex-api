// The API site's staff backend, kept apart from VERTEX's admin: every call to
// the engine and tracer APIs, alerts the guard raised, speed by endpoint, a
// trace from any serial or request id, keys (revoke, lock to addresses),
// addresses (block, unblock), developers (open their console read only),
// webhooks, plans and money, the status page, education applications,
// marketing (traffic, search, links, media) and settings. Alerts also reach
// staff anywhere on VERTEX: the bell, email and the Discord alert channel.
import { $, $$, esc, num, compact, bytes, bytesText, when, whenFull, ago, pct, icon, avatar, kpi, lineChart, donut, hbars, ask, toast, commandPalette, shell } from '/js/app-ui.js';

async function call(path, { method = 'GET', body, raw } = {}) {
  const res = await fetch(path, { method, credentials: 'same-origin', headers: raw ? { 'Content-Type': 'application/octet-stream' } : body ? { 'Content-Type': 'application/json' } : {}, body: raw || (body ? JSON.stringify(body) : undefined) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}
const act = async (fn, ok) => { try { const r = await fn(); if (ok) toast(ok); return r; } catch (e) { toast(e.message, { bad: true }); return null; } };

let days = 30, apiName = '', tab = 'overview', filters = {}, rows = [], next = null, me = null;
const pane = () => $('[data-pane]');
const apiQ = () => (apiName ? `&api=${apiName}` : '');
const card = (title, inner, { note = '', right = '', cls = '' } = {}) => `<section class="card ${cls}"><div class="card-h"><h2>${title}</h2>${note ? `<span class="note">${note}</span>` : ''}${right ? `<div class="right">${right}</div>` : ''}</div>${inner}</section>`;
const table = (head, body, empty = 'Nothing yet.') => (body ? `<div class="tw"><table class="t"><thead><tr>${head.map((h) => (typeof h === 'string' ? `<th>${h}</th>` : `<th class="${h.c || ''}">${h.t}</th>`)).join('')}</tr></thead><tbody>${body}</tbody></table></div>` : `<div class="empty">${icon('inbox')}${empty}</div>`);
const status = (s) => `<span class="pill ${s >= 500 ? 'bad' : s >= 400 ? 'warn' : 'ok'}">${s}</span>`;
const SEV = { high: 'bad', warn: 'warn', info: 'info' };
// Against the period before; nothing when there was too little before to compare with.
const delta = (a, b) => (b >= 20 && b * 20 > a ? (a - b) / b : null);
const userCell = (handle, sub = '') => `<div class="who-cell">${avatar(handle, 'sm')}<div><b>@${esc(handle)}</b>${sub ? `<span class="sub">${sub}</span>` : ''}</div></div>`;
const iconBtn = (name, label, attrs, cls = '') => `<button type="button" class="icon-btn ${cls}" title="${esc(label)}" aria-label="${esc(label)}" ${attrs}>${icon(name)}</button>`;

const TITLES = {
  overview: ['Overview', 'Everything the APIs did, at a glance.'],
  alerts: ['Alerts', 'What the guard noticed. Checked every ten minutes.'],
  calls: ['Calls', 'Every keyed call, kept for two years.'],
  latency: ['Speed', 'How long calls take on the server.'],
  trace: ['Trace a file', 'From a serial or request id to everything about it.'],
  developers: ['Developers', 'Everyone with a key. Open their console as they see it.'],
  keys: ['Keys', 'Every engine and tracer key.'],
  plans: ['Plans and money', 'Prices, limits, who pays and what they owe.'],
  education: ['Education', 'Schools, colleges and universities applying for the Education plan.'],
  addresses: ['Addresses', 'Who calls from where, and who is blocked.'],
  webhooks: ['Webhooks', 'Where developers asked to be told about events.'],
  status: ['Status page', 'What developers see at /status, and incidents.'],
  marketing: ['Marketing', 'Visitors, search, links you post and the media library.'],
  settings: ['Settings', 'Switches, payments, the link to VERTEX and tracer keys.'],
};
const RANGED = new Set(['overview', 'latency', 'addresses', 'marketing']);

// ---------- overview ----------
function daySeries(byDay, n) {
  const map = Object.fromEntries(byDay.map((d) => [d.day, d]));
  return Array.from({ length: n }, (_, i) => new Date(Date.now() - (n - 1 - i) * 86400e3).toISOString().slice(0, 10)).map((d) => ({ day: d, calls: map[d]?.calls || 0, errors: map[d]?.errors || 0 }));
}
async function overview() {
  const [s, al] = await Promise.all([call(`/api/admin/api/summary?days=${days}${apiQ()}`), call('/api/admin/api/alerts?open=1&limit=6')]);
  const t = s.totals, p = s.prev || {}, rate = pct(t.errors, t.calls), prevRate = pct(p.errors, p.calls);
  const series = daySeries(s.byDay, Math.max(2, Math.min(s.days, 365)));
  const [bv, bu] = bytes(t.bytes);
  pane().innerHTML = `
    <div class="kpis">
      ${kpi({ k: 'Calls', v: compact(t.calls), x: `vs ${compact(p.calls || 0)} before`, delta: delta(t.calls, p.calls), spark: series.map((r) => r.calls) })}
      ${kpi({ k: 'Error rate', v: rate, unit: '%', x: `${num(t.errors)} failed`, delta: prevRate ? (rate - prevRate) / prevRate : null, good: 'down', spark: series.map((r) => r.errors), bad: rate > 5 })}
      ${kpi({ k: 'Files made', v: compact(t.files), x: 'each with a serial', delta: delta(t.files, p.files), spark: series.map((r) => r.calls - r.errors) })}
      ${kpi({ k: 'Typical time', v: num(t.p50), unit: 'ms', x: `95% under ${num(t.p95)} ms`, delta: delta(t.avgMs, p.avgMs), good: 'down' })}
      ${kpi({ k: 'Data sent', v: bv, unit: bu, x: 'files and answers', delta: delta(t.bytes, p.bytes) })}
      ${kpi({ k: 'Bad-key tries', v: num(s.badKeys.reduce((n, b) => n + b.n, 0)), x: '401s from wrong keys', bad: s.badKeys.length > 0 })}
    </div>
    ${al.alerts.length ? card(`Open alerts <span class="pill warn">${al.alerts.length}</span>`, alertRows(al.alerts), { cls: 'alert flush', right: '<a class="btn sm ghost" href="#alerts">All alerts</a>' }) : ''}
    <div class="grid g-main">
      ${card('Calls per day', '<div data-chart></div>', { right: '<span class="legend"><span><i></i>Calls</span><span><i class="err"></i>Errors</span></span>' })}
      ${card('Results', donut(s.byStatus.map((r) => ({ name: String(r.name), n: r.n })), { centre: `${Math.round(100 - rate)}%`, sub: 'worked' }))}
    </div>
    <div class="grid g3">
      ${card('What was made', hbars(s.byKind))}
      ${card('Formats', donut(s.byFormat, { sub: 'files' }))}
      ${card('Endpoints', hbars(s.byPath.map((r) => ({ ...r, name: r.name.replace('/api', '') }))))}
    </div>
    <div class="grid g2">
      ${card('Busiest keys', table(['Key', { t: 'Calls', c: 'n' }, { t: 'Errors', c: 'n' }, ''], s.topKeys.map((k) => `<tr><td><b>${esc(k.name || '(no such key)')}</b> <span class="hint">${esc(k.hint)}</span><span class="sub">${esc(k.type)}</span></td><td class="n">${num(k.n)}</td><td class="n">${k.errors ? `<span class="pill ${pct(k.errors, k.n) > 5 ? 'bad' : 'plain'}">${num(k.errors)}</span>` : '0'}</td><td class="n">${k.id ? iconBtn('list', 'Calls', `data-fkey="${k.type}:${k.id}"`) : ''}</td></tr>`).join('')), { cls: 'flush' })}
      ${card('Busiest accounts', table(['Account', { t: 'Calls', c: 'n' }, ''], s.topUsers.map((u) => `<tr><td>${userCell(u.handle, `#${u.id}`)}</td><td class="n">${num(u.n)}</td><td class="n"><span class="acts">${iconBtn('list', 'Calls', `data-fuser="${u.id}"`)}<a class="icon-btn" title="Open their console" href="/console?as=${u.id}">${icon('eye')}</a></span></td></tr>`).join('')), { cls: 'flush' })}
    </div>`;
  if (s.byHour && s.days <= 2) lineChart($('[data-chart]'), s.byHour.map((h) => ({ day: h.hour.slice(0, 10), calls: h.calls, errors: h.errors })));
  else lineChart($('[data-chart]'), series);
}

// ---------- alerts ----------
function alertRows(list) {
  return table(['When', 'Alert', 'Details', ''], list.map((a) => `
    <tr class="${a.acked ? 'off' : ''}">
      <td style="white-space:nowrap">${when(a.at)}<span class="sub">${ago(a.at)}</span></td>
      <td><span class="pill ${SEV[a.severity] || 'warn'}">${esc(a.kind)}</span> <b style="margin-left:6px">${esc(a.title)}</b></td>
      <td class="mute" style="font-size:12.5px">${Object.entries(a.detail || {}).map(([k, v]) => `${esc(k)}: <b>${esc(v)}</b>`).join(' · ')}</td>
      <td class="n"><span class="acts">${a.ip ? `${iconBtn('list', `Calls from ${a.ip}`, `data-fip="${esc(a.ip)}"`)}${iconBtn('ban', `Block ${a.ip}`, `data-block="${esc(a.ip)}"`, 'bad')}` : ''}${a.key_id ? iconBtn('key', 'Calls with this key', `data-fkey="${a.key_type}:${a.key_id}"`) : ''}${a.acked ? '<span class="pill plain">done</span>' : iconBtn('check', 'Mark done', `data-ack="${a.id}"`)}</span></td>
    </tr>`).join(''), 'No alerts. Quiet is good.');
}
async function alertsTab() {
  const r = await call('/api/admin/api/alerts?limit=200');
  const open = r.alerts.filter((a) => !a.acked).length;
  pane().innerHTML = `<div class="kpis">${kpi({ k: 'Open', v: num(open), x: 'need a look', bad: open > 0 })}${kpi({ k: 'Last 24 h', v: num(r.alerts.filter((a) => a.at > Date.now() - 864e5).length), x: 'raised' })}${kpi({ k: 'High', v: num(r.alerts.filter((a) => a.severity === 'high' && !a.acked).length), x: 'open and serious' })}</div>`
    + card('Every alert', `<p class="lede">Checked every ten minutes: traffic spikes, keys that keep failing, busy keys that go quiet, key guessing, one address cycling keys or one account making many, and catalogue scraping. Each also reaches staff on VERTEX (bell, email, Discord) and isn't raised again for six hours.</p>${alertRows(r.alerts)}`, { right: `<button type="button" class="btn sm" data-scan>${icon('refresh')}Check now</button>` });
}

// ---------- calls ----------
const qs = (more) => { const q = new URLSearchParams({ ...filters, ...(apiName ? { api: apiName } : {}), ...(more && next ? { before: next } : {}) }); for (const [k, v] of [...q]) if (!v) q.delete(k); return q; };
async function callsTab() {
  pane().innerHTML = card('Every call', `
    <form class="toolbar" data-filter>
      <label class="search-in">${icon('trace')}<input name="q" placeholder="Request id, serial, path, error or key start" aria-label="Search" value="${esc(filters.q || '')}" /></label>
      <select name="status" aria-label="Result"><option value="">Any result</option><option value="ok">Worked</option><option value="error">Errors</option><option value="401">401 bad key</option><option value="403">403 refused</option><option value="429">429 over limit</option><option value="503">503 switched off</option></select>
      <input name="ip" placeholder="IP" aria-label="IP" value="${esc(filters.ip || '')}" style="width:150px" />
      <input name="userId" placeholder="Account #" inputmode="numeric" aria-label="Account id" value="${esc(filters.userId || '')}" style="width:110px" />
      <button class="btn primary sm">Find</button>
      <a class="btn sm ghost" data-csv href="#">${icon('download')}CSV</a>
    </form>
    <p class="lede" data-note style="margin:12px 0 0"></p>
    <div class="tw" style="margin-top:12px"><table class="t" data-rows></table></div>
    <div style="padding:14px 0 0;text-align:center"><button type="button" class="btn sm" data-more hidden>Older calls</button></div>`);
  if (filters.status) $('[data-filter] [name=status]').value = filters.status;
  await search();
}
async function search(more = false) {
  const r = await call(`/api/admin/api/requests?${qs(more)}`);
  rows = more ? [...rows, ...r.rows] : r.rows;
  next = r.next;
  const note = Object.entries(filters).filter(([, v]) => v).map(([k, v]) => `${k}: <b>${esc(v)}</b>`).join(' · ');
  $('[data-note]').innerHTML = note ? `Filtered by ${note} <button type="button" class="btn sm ghost" data-clear>Clear</button>` : 'Click a row for the settings sent, the client, and the file it made.';
  $('[data-csv]').href = `/api/admin/api/requests.csv?${qs(false)}`;
  $('[data-rows]').innerHTML = `<thead><tr><th>When</th><th>Call</th><th>Result</th><th>Key</th><th>Account</th><th>IP</th><th>Made</th><th class="n">Time</th><th>Serial</th></tr></thead><tbody>${rows.map((c) => `
    <tr class="row" data-row="${c.id}" tabindex="0">
      <td style="white-space:nowrap">${when(c.at)}</td><td class="mono" style="font-size:12.5px"><b>${esc(c.method)}</b> ${esc(c.path.replace('/api', ''))}</td><td>${status(c.status)}</td>
      <td>${c.key ? `${esc(c.key.name || '(no such key)')} <span class="hint">${esc(c.key.hint || '')}</span>` : '<span class="mute">none</span>'}</td>
      <td>${c.user ? `@${esc(c.user.handle)}` : '—'}</td><td class="mono" style="font-size:12.5px">${esc(c.ip || '')}</td>
      <td>${esc([c.kind, c.format].filter(Boolean).join(' · ') || '—')}</td><td class="n">${num(c.ms)} ms</td>
      <td class="mono" style="font-size:12px">${esc(c.serial || '—')}</td>
    </tr>
    <tr class="det" data-detail="${c.id}" hidden><td colspan="9"><div class="grid g2" style="gap:14px"><dl class="kv">
      <dt>Request id</dt><dd class="mono">${esc(c.requestId)}</dd>
      <dt>When</dt><dd>${whenFull(c.at)}</dd>
      <dt>Account</dt><dd>${c.user ? `@${esc(c.user.handle)} #${c.user.id} · ${esc(c.user.email || '')}` : '—'}</dd>
      <dt>Size</dt><dd>${bytesText(c.bytes)}</dd>
      <dt>Address</dt><dd class="mono">${esc(c.ip || '—')} ${c.ip ? `<button type="button" class="btn sm danger" data-block="${esc(c.ip)}">${icon('ban')}Block</button>` : ''}</dd>
      <dt>Client</dt><dd>${esc(c.ua || '—')}</dd>
      ${c.error ? `<dt>Error they saw</dt><dd style="color:#ffb3c0">${esc(c.error)}</dd>` : ''}
      ${c.serial ? `<dt></dt><dd><button type="button" class="btn sm" data-traceid="${esc(c.serial)}">${icon('trace')}Trace this file</button></dd>` : ''}
    </dl>${c.params ? `<pre class="code">${esc(JSON.stringify(c.params, null, 2))}</pre>` : ''}</div></td></tr>`).join('') || '<tr><td colspan="9"><div class="empty">No calls match.</div></td></tr>'}</tbody>`;
  $('[data-more]').hidden = !next;
}

// ---------- trace ----------
async function traceTab(id = '') {
  pane().innerHTML = card('Trace a file or call', `
    <p class="lede">Paste a serial from a file (VX-…) or a request id a developer quoted (req_…). You get the call, the key, the account and the download record. Each trace is written to the audit log.</p>
    <form class="toolbar" data-trace><label class="search-in">${icon('trace')}<input name="id" placeholder="VX-2609-7K3M-Q9TD or req_…" value="${esc(id)}" required aria-label="Serial or request id" /></label><button class="btn primary">Trace</button></form>
    <div data-traceout style="margin-top:16px"></div>`);
  if (id) await trace(id);
}
async function trace(id) {
  const out = $('[data-traceout]');
  out.innerHTML = '<div class="skel" style="height:180px"></div>';
  try {
    const t = await call(`/api/admin/api/trace/${encodeURIComponent(id.trim())}`);
    const c = t.call, d = t.download, k = t.key;
    const kv = (pairs) => `<dl class="kv">${pairs.filter(Boolean).map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>`;
    out.innerHTML = `<div class="grid g3">
      ${card('The call', c ? kv([['Request id', `<span class="mono">${esc(c.requestId)}</span>`], ['When', whenFull(c.at)], ['Call', `<span class="mono">${esc(c.method)} ${esc(c.path)}</span>`], ['Result', `${status(c.status)} in ${num(c.ms)} ms`], ['Made', esc([c.kind, c.format].filter(Boolean).join(' · ') || '—')], ['From', `<span class="mono">${esc(c.ip || '')}</span>`], ['Client', esc(c.ua || '—')], c.error && ['Error', `<span style="color:#ffb3c0">${esc(c.error)}</span>`]]) : '<div class="empty">Not an API call: made on VERTEX, or before calls were recorded.</div>')}
      ${card('Who', kv([['Account', c?.user ? `@${esc(c.user.handle)} #${c.user.id}<br>${esc(c.user.email || '')}` : d?.handle ? `@${esc(d.handle)}` : '—'], k && ['Key', `${esc(k.name)} <span class="hint">${esc(k.key_hint || '')}</span><br>${num(k.calls)} calls${k.revoked_at ? ' <span class="pill bad">revoked</span>' : ''}`], c?.user && ['Console', `<a class="btn sm" href="/console?as=${c.user.id}">${icon('eye')}Open as them</a>`]]))}
      ${d ? card('The file', kv([['Serial', `<span class="mono">${esc(d.serial)}</span>`], ['Made', whenFull(d.created_at)], ['Engine', esc(d.engine)], ['Kind', `${esc(d.kind)} · ${esc(d.format)}`]])) : ''}
    </div>${(c?.params || d?.params) ? card('Settings sent', `<pre class="code">${esc(JSON.stringify(c?.params || d?.params, null, 2))}</pre>`) : ''}`;
  } catch (e) { out.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}

// ---------- speed ----------
async function latencyTab() {
  const r = await call(`/api/admin/api/latency?days=${days}${apiQ()}`);
  const max = Math.max(1, ...r.rows.map((x) => x.p99));
  const all = r.rows.reduce((a, x) => ({ calls: a.calls + x.calls, p50: Math.max(a.p50, x.p50), p95: Math.max(a.p95, x.p95), max: Math.max(a.max, x.max) }), { calls: 0, p50: 0, p95: 0, max: 0 });
  pane().innerHTML = `<div class="kpis">${kpi({ k: 'Typical', v: num(all.p50), unit: 'ms', x: 'p50, slowest endpoint' })}${kpi({ k: 'Most calls under', v: num(all.p95), unit: 'ms', x: 'p95' })}${kpi({ k: 'Slowest call', v: num(all.max), unit: 'ms', x: `of ${compact(all.calls)} calls` })}</div>`
    + card(`Speed by endpoint`, `<p class="lede">End to end on the server. p50: half are faster. p95 and p99: all but the slowest 5% and 1%.</p>${table(['Endpoint', { t: 'Calls', c: 'n' }, { t: 'p50', c: 'n' }, { t: 'p95', c: 'n' }, { t: 'p99', c: 'n' }, { t: 'Slowest', c: 'n' }, 'Spread'], r.rows.map((x) => `<tr><td class="mono" style="font-size:12.5px">${esc(x.path.replace('/api', ''))}</td><td class="n">${num(x.calls)}</td><td class="n">${num(x.p50)} ms</td><td class="n">${num(x.p95)} ms</td><td class="n">${num(x.p99)} ms</td><td class="n">${num(x.max)} ms</td><td style="min-width:160px"><div class="hbar ${x.p95 > 500 ? 'warn' : ''}" style="grid-template-columns:1fr"><i><b style="width:${((x.p95 / max) * 100).toFixed(1)}%"></b></i></div></td></tr>`).join(''), 'No calls in this period.')}`, { note: `last ${r.days} days`, cls: 'flush' });
}

// ---------- keys ----------
const lock = (k) => (k.allowIps ? `<span class="pill info" title="${esc(k.allowIps)}">${icon('lock').replace('<svg', '<svg width="11" height="11"')} ${esc(k.allowIps)}</span>` : '<span class="pill plain">any address</span>');
async function keysTab() {
  const k = await call('/api/admin/api/keys');
  const live = k.engine.filter((x) => !x.revokedAt);
  pane().innerHTML = `<div class="kpis">${kpi({ k: 'Live engine keys', v: num(live.length), x: `${num(k.engine.length - live.length)} revoked` })}${kpi({ k: 'Locked to addresses', v: num(live.filter((x) => x.allowIps).length), x: 'of the live keys' })}${kpi({ k: 'Used this week', v: num(live.filter((x) => x.lastUsedAt > Date.now() - 7 * 864e5).length), x: 'live keys' })}${kpi({ k: 'Tracer keys', v: num(k.trace.filter((x) => !x.revokedAt).length), x: 'issued by the owner' })}</div>`
    + card('Engine keys', table(['Key', 'Account', { t: 'Calls', c: 'n' }, 'Made', 'Last used', ''], k.engine.map((x) => `
      <tr class="${x.revokedAt ? 'off' : ''}"><td><b>${esc(x.name)}</b> <span class="hint">${esc(x.hint || '')}</span>${x.revokedAt ? ` <span class="pill bad">revoked ${ago(x.revokedAt)}</span>` : ''}<div style="margin-top:5px">${lock(x)}</div></td>
      <td>${userCell(x.handle, esc(x.email))}</td><td class="n">${num(x.calls)}</td><td>${ago(x.createdAt)}</td><td>${ago(x.lastUsedAt)}</td>
      <td class="n"><span class="acts">${iconBtn('list', 'Calls', `data-fkey="engine:${x.id}"`)}<a class="icon-btn" title="Open their console" href="/console?as=${x.userId}">${icon('eye')}</a>${x.revokedAt ? '' : `${iconBtn('lock', 'Lock to addresses', `data-lock="engine:${x.id}" data-allow="${esc(x.allowIps || '')}"`)}${iconBtn('x', 'Revoke', `data-revoke="engine:${x.id}"`, 'bad')}`}</span></td></tr>`).join(''), 'Nobody has made a key yet.'), { cls: 'flush', note: `${live.length} live` })
    + card('Tracer keys', table(['Key', 'This month', { t: 'Calls', c: 'n' }, 'Last used', ''], k.trace.map((x) => `
      <tr class="${x.revokedAt ? 'off' : ''}"><td><b>${esc(x.name)}</b> <span class="hint">${esc(x.hint || '')}</span>${x.test ? ' <span class="pill info">test</span>' : ''}${x.revokedAt ? ' <span class="pill bad">revoked</span>' : ''}<div style="margin-top:5px">${lock(x)}</div></td>
      <td><div class="hbar" style="grid-template-columns:1fr auto"><i><b style="width:${Math.min(100, (x.used / Math.max(1, x.quota)) * 100)}%"></b></i><em>${num(x.used)} / ${num(x.quota)}</em></div></td><td class="n">${num(x.calls)}</td><td>${ago(x.lastUsedAt)}</td>
      <td class="n"><span class="acts">${iconBtn('list', 'Calls', `data-fkey="trace:${x.id}"`)}${x.revokedAt ? '' : `${iconBtn('lock', 'Lock to addresses', `data-lock="trace:${x.id}" data-allow="${esc(x.allowIps || '')}"`)}${iconBtn('x', 'Revoke', `data-revoke="trace:${x.id}"`, 'bad')}`}</span></td></tr>`).join(''), 'No tracer keys issued. Issue one in Settings.'), { cls: 'flush', right: '<a class="btn sm ghost" href="#settings">Issue a key</a>' });
}

// ---------- addresses ----------
async function addressesTab() {
  const [s, b] = await Promise.all([call(`/api/admin/api/summary?days=${days}${apiQ()}`), call('/api/admin/api/blocks')]);
  pane().innerHTML = card('Blocked addresses', `
      <form class="toolbar" data-blockform>
        <input name="ip" placeholder="IP address" required aria-label="IP address" style="width:180px" />
        <input name="reason" placeholder="Why (for the audit log)" aria-label="Reason" style="flex:1 1 220px" />
        <select name="hours" aria-label="For how long"><option value="1">1 hour</option><option value="24" selected>1 day</option><option value="168">1 week</option><option value="0">For good</option></select>
        <button class="btn danger">${icon('ban')}Block</button>
      </form>
      <p class="lede" style="margin:10px 0 0">A blocked address gets a 403 from both APIs. The site itself still works for them.</p>
      <div style="margin-top:12px">${table(['Address', 'Why', 'By', 'Since', 'Until', ''], b.blocks.map((x) => `<tr><td class="mono">${esc(x.ip)}</td><td>${esc(x.reason || '—')}</td><td>${x.by_handle ? `@${esc(x.by_handle)}` : '—'}</td><td>${ago(x.created_at)}</td><td>${x.until ? when(x.until) : '<span class="pill bad">for good</span>'}</td><td class="n"><button type="button" class="btn sm" data-unblock="${esc(x.ip)}">Unblock</button></td></tr>`).join(''), 'Nobody is blocked.')}</div>`)
    + `<div class="grid g2">
      ${card('Busiest addresses', table(['IP', { t: 'Calls', c: 'n' }, { t: 'Errors', c: 'n' }, ''], s.topIps.map((r) => `<tr><td class="mono">${esc(r.ip)}</td><td class="n">${num(r.n)}</td><td class="n">${num(r.errors)}</td><td class="n"><span class="acts">${iconBtn('list', 'Calls', `data-fip="${esc(r.ip)}"`)}${iconBtn('ban', 'Block', `data-block="${esc(r.ip)}"`, 'bad')}</span></td></tr>`).join('')), { cls: 'flush' })}
      ${card('Keys that don’t work', table(['Key sent', 'From', { t: 'Tries', c: 'n' }, 'Last', ''], s.badKeys.map((r) => `<tr><td class="mono">${esc(r.hint || '(none)')}</td><td class="mono">${esc(r.ip || '')}</td><td class="n">${num(r.n)}</td><td>${ago(r.last)}</td><td class="n">${r.ip ? iconBtn('ban', 'Block', `data-block="${esc(r.ip)}"`, 'bad') : ''}</td></tr>`).join(''), 'None. Good.'), { cls: 'flush', note: '401s' })}
    </div>`;
}

// ---------- developers ----------
async function developersTab(q = '') {
  const [r, tm] = await Promise.all([call(`/api/admin/api/developers?q=${encodeURIComponent(q)}`), call('/api/admin/api/teams').catch(() => ({ teams: [] }))]);
  pane().innerHTML = card('Developers', `
    <form class="toolbar" data-devsearch><label class="search-in">${icon('trace')}<input name="q" placeholder="Username or email" value="${esc(q)}" aria-label="Find a developer" /></label><button class="btn primary sm">Find</button></form>
    <p class="lede" style="margin:10px 0 12px">Open a developer's console to see exactly what they see. It's read only, and each look is written to the audit log.</p>
    ${table(['Account', 'Keys', 'Last call', ''], r.developers.map((d) => `<tr><td>${userCell(d.handle, `#${d.id} · ${esc(d.email)}`)}</td><td><b>${num(d.live)}</b> <span class="mute">live of ${num(d.keys)}</span></td><td>${ago(d.lastUsedAt)}</td><td class="n"><span class="acts">${iconBtn('list', 'Calls', `data-fuser="${d.id}"`)}<a class="btn sm" href="/console?as=${d.id}">${icon('eye')}Console</a></span></td></tr>`).join(''), 'Nobody matches.')}`, { note: `${num(r.developers.length)} shown` })
    + card('Teams', table(['Team', 'Owner (pays)', { t: 'People', c: 'n' }, { t: 'Shared keys', c: 'n' }, { t: 'Calls today', c: 'n' }, 'Started', ''], tm.teams.map((t) => `<tr><td><b>${esc(t.name)}</b> <span class="mute">#${t.id}</span></td><td>@${esc(t.owner)}</td><td class="n">${num(t.members)}${t.invites ? ` <span class="pill warn">+${num(t.invites)} invited</span>` : ''}</td><td class="n">${num(t.keys)}</td><td class="n">${num(t.today)}</td><td>${ago(t.createdAt)}</td><td class="n"><a class="btn sm" href="/console?as=${t.ownerId}#team">${icon('eye')}Owner's console</a></td></tr>`).join(''), 'No teams yet.'), { cls: 'flush', note: 'Team keys run on the owner’s plan' });
}

// ---------- webhooks ----------
async function webhooksTab() {
  const r = await call('/api/admin/api/webhooks');
  const failing = r.webhooks.filter((h) => h.failed && !h.disabledAt).length;
  pane().innerHTML = `<div class="kpis">${kpi({ k: 'Webhooks', v: num(r.webhooks.filter((h) => !h.disabledAt).length), x: 'active' })}${kpi({ k: 'Failing', v: num(failing), x: 'with failed deliveries', bad: failing > 0 })}${kpi({ k: 'Delivered', v: compact(r.webhooks.reduce((n, h) => n + (h.delivered || 0), 0)), x: 'all time' })}</div>`
    + card('Developers’ webhooks', table(['Address', 'Account', 'Events', { t: 'Delivered', c: 'n' }, { t: 'Failed', c: 'n' }, { t: 'Waiting', c: 'n' }, 'Added'], r.webhooks.map((h) => `
    <tr class="${h.disabledAt ? 'off' : ''}"><td class="mono" style="font-size:12.5px">${esc(h.url)}${h.disabledAt ? ' <span class="pill bad">removed</span>' : ''}</td><td>@${esc(h.handle)}</td><td>${String(h.events).split(',').map((e) => `<span class="pill plain">${esc(e)}</span>`).join(' ')}</td><td class="n">${num(h.delivered)}</td><td class="n">${h.failed ? `<span class="pill bad">${num(h.failed)}</span>` : '0'}</td><td class="n">${num(h.pending)}</td><td>${ago(h.createdAt)}</td></tr>`).join(''), 'No webhooks yet.'), { cls: 'flush' });
}

// ---------- plans and money ----------
async function plansTab() {
  const r = await call('/api/admin/api/plans');
  const cur = r.currency;
  const field = (p, k, type = 'number', extra = '') => `<input data-f="${k}" type="${type}" value="${esc(Array.isArray(p[k]) ? p[k].join('\n') : p[k])}" ${extra} aria-label="${k}" style="width:100%;min-width:${type === 'text' ? 120 : 70}px" />`;
  pane().innerHTML = `<div class="kpis">
      ${kpi({ k: 'Monthly revenue', v: `$${num(r.revenue.mrr)}`, x: `${esc(cur)}, from paying plans` })}
      ${kpi({ k: 'Extra use, this month', v: `$${r.revenue.overThisMonth.toFixed(2)}`, x: 'billed daily' })}
      ${r.revenue.byPlan.map((b) => kpi({ k: b.plan, v: num(b.n), x: 'on this plan' })).join('')}
    </div>`
    + card('Plans', `
      <p class="lede">Prices are monthly, in ${esc(cur)}. A new price only affects new sign-ups and switches; people already paying keep theirs until they change plan. "Extra per 1,000" above $0 means calls keep working past the day's allowance and are billed daily, up to the cap.</p>
      <div class="tw"><table class="t" data-plansform><thead><tr><th>On</th><th>Plan</th><th>Name</th><th>$/month</th><th>/minute</th><th>/day</th><th>Keys</th><th>Extra /1,000</th><th>Extra cap</th><th>Blurb</th><th>Perks (one a line)</th></tr></thead><tbody>
      ${r.plans.map((p) => `<tr data-plan="${esc(p.id)}"><td><label class="switch"><input type="checkbox" data-f="active" ${p.active ? 'checked' : ''} ${p.id === 'free' ? 'disabled' : ''} aria-label="On" /></label></td><td><span class="pill plain">${esc(p.id)}</span>${p.invite ? ' <span class="pill info">apply</span>' : ''}</td><td>${field(p, 'name', 'text')}</td><td>${field(p, 'monthly', 'number', p.id === 'free' ? 'disabled' : 'min="0" step="1"')}</td><td>${field(p, 'perMinute')}</td><td>${field(p, 'perDay')}</td><td>${field(p, 'keys')}</td><td>${field(p, 'overagePer1000', 'number', p.id === 'free' ? 'disabled' : 'min="0" step="0.05"')}</td><td>${field(p, 'overageCap', 'number', p.id === 'free' ? 'disabled' : 'min="0"')}</td><td>${field(p, 'blurb', 'text')}</td><td><textarea data-f="perks" rows="2" aria-label="Perks" style="min-width:200px">${esc((p.perks || []).join('\n'))}</textarea></td></tr>`).join('')}
      </tbody></table></div>
      <div class="toolbar" style="margin-top:16px"><button type="button" class="btn primary" data-saveplans>Save plans</button><button type="button" class="btn" data-billnow>Bill yesterday's extra use now</button></div>`, { note: r.stripe ? '<span class="pill ok">payments ready</span>' : '<span class="pill warn">payments not set up</span>' })
    + `<div class="grid g-main">
      ${card(`On a plan <span class="pill plain">${r.subscribers.length}</span>`, table(['Account', 'Plan', 'Status', 'Paid by', 'Renews or ends', { t: 'Extra', c: 'n' }, ''], r.subscribers.map((x) => `
        <tr class="${['active', 'trialing', 'past_due'].includes(x.status) ? '' : 'off'}"><td>${userCell(x.handle, `#${x.user_id}`)}</td><td><b>${esc(x.plan)}</b></td><td><span class="pill ${x.status === 'active' ? 'ok' : x.status === 'past_due' ? 'warn' : 'bad'}">${esc(x.status)}</span>${x.cancel_at_period_end ? ' <span class="pill plain">ending</span>' : ''}</td><td>${esc(x.provider)}${x.note ? `<span class="sub">${esc(x.note)}</span>` : ''}</td><td>${x.period_end ? when(x.period_end) : '—'}</td><td class="n">$${(x.overCents / 100).toFixed(2)}</td>
        <td class="n"><span class="acts"><a class="icon-btn" title="Open their console" href="/console?as=${x.user_id}">${icon('eye')}</a>${['active', 'trialing', 'past_due'].includes(x.status) ? iconBtn('x', 'Cancel their plan', `data-plancancel="${x.user_id}"`, 'bad') : ''}</span></td></tr>`).join(''), 'Nobody yet.'), { cls: 'flush' })}
      ${card('Give a plan', `
        <form class="grid" style="gap:10px" data-grant>
          <label class="field">Account id<input name="userId" inputmode="numeric" required /></label>
          <label class="field">Plan<select name="plan">${r.plans.filter((p) => p.id !== 'free').map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label>
          <label class="field">For<select name="days"><option value="30">30 days</option><option value="90">90 days</option><option value="365">A year</option><option value="0">For good</option></select></label>
          <label class="field">Why<input name="note" placeholder="Partner, prize, friend" /></label>
          <button class="btn primary">Give the plan</button>
        </form>
        <p class="lede" style="margin:12px 0 0">Given plans aren't charged; their extra use is marked "manual plan" for you to bill by hand.</p>`)}
    </div>`;
}

// ---------- status page incidents ----------
async function statusTab() {
  const [r, live] = await Promise.all([call('/api/admin/api/incidents'), call('/api/status')]);
  const comps = Object.entries(r.components);
  const open = r.incidents.filter((i) => !i.resolvedAt), past = r.incidents.filter((i) => i.resolvedAt);
  const opt = (list, cur) => list.map((x) => `<option value="${x}" ${x === cur ? 'selected' : ''}>${x}</option>`).join('');
  const tone = (s) => (/operational|up|ok/i.test(s) ? 'ok' : /degraded|partial/i.test(s) ? 'warn' : 'bad');
  pane().innerHTML = `<div class="kpis">${live.components.map((c) => kpi({ k: c.name, v: `<span class="pill ${tone(c.state)}" style="font-size:14px">${esc(c.state)}</span>`, x: `${c.uptime != null ? `${c.uptime}% over 90 days` : ''}${c.checkedAt ? ` · ${ago(c.checkedAt)}` : ''}${c.reason ? `<br><b>Why:</b> ${esc(c.reason)}` : ''}` })).join('')}</div>`
    + `<div class="grid g2">
      ${card('Open an incident', `
        <form class="grid" style="gap:12px" data-incident>
          <input name="title" maxlength="160" placeholder="Short title, e.g. Slow file generation" required aria-label="Title" />
          <div class="toolbar"><label class="field">Impact<select name="impact">${opt(r.impacts, 'minor')}</select></label><label class="field">Status<select name="status">${opt(r.statuses.filter((x) => x !== 'resolved'), 'investigating')}</select></label></div>
          <div class="toolbar">${comps.map(([k, c]) => `<label class="switch"><input type="checkbox" name="components" value="${k}" /> ${esc(c.name)}</label>`).join('')}</div>
          <textarea name="body" rows="3" maxlength="4000" placeholder="What people are seeing, and what you're doing about it" required aria-label="First update"></textarea>
          <div><button class="btn primary">Post it</button></div>
        </form>`, { note: 'also sent to incident.updated webhooks' })}
      ${card(`Open incidents <span class="pill ${open.length ? 'warn' : 'ok'}">${open.length}</span>`, open.length ? open.map((i) => `
        <div style="padding:12px 0;border-bottom:1px solid var(--line)">
          <b>${esc(i.title)}</b> <span class="pill warn">${esc(i.impact)}</span> <span class="pill info">${esc(i.status)}</span><span class="sub mute" style="display:block;font-size:12px;margin-top:4px">${i.components.map(esc).join(', ')} · since ${when(i.createdAt)}</span>
          <ul style="margin:10px 0;padding-left:18px;font-size:13px">${i.updates.map((u) => `<li><span class="mute">${when(u.at)} · ${esc(u.status)}</span> ${esc(u.body)}</li>`).join('')}</ul>
          <form class="grid" style="gap:8px" data-incupdate="${i.id}">
            <div class="toolbar"><select name="status">${opt(r.statuses, i.status)}</select><select name="impact">${opt(r.impacts, i.impact)}</select></div>
            <textarea name="body" rows="2" maxlength="4000" placeholder="What changed" required aria-label="Update"></textarea>
            <div><button class="btn sm">Post update</button></div>
          </form>
        </div>`).join('') : `<div class="empty">${icon('check')}Nothing open. All quiet.</div>`)}
    </div>`
    + card('Resolved', table(['Incident', 'Impact', 'From', 'To'], past.map((i) => `<tr><td>${esc(i.title)}</td><td><span class="pill plain">${esc(i.impact)}</span></td><td>${when(i.createdAt)}</td><td>${when(i.resolvedAt)}</td></tr>`).join(''), 'None in the last year.'), { cls: 'flush' });
}

// ---------- marketing ----------
async function marketingTab() {
  const [tr, sr, ln, md] = await Promise.all([call(`/api/admin/api/marketing/traffic?days=${days}`), call(`/api/admin/api/marketing/search?days=${Math.max(7, days)}`).catch((e) => ({ connected: false, error: e.message })), call('/api/admin/api/marketing/links'), call('/api/admin/api/marketing/media')]);
  const t = tr.totals, series = daySeries(tr.byDay, Math.max(2, Math.min(days, 400)));
  const rowsOf = (list, label = (r) => esc(r.name)) => table(['', { t: 'Views', c: 'n' }, { t: 'Visitors', c: 'n' }], list.map((r) => `<tr><td>${label(r)}</td><td class="n">${num(r.n)}</td><td class="n">${num(r.visitors)}</td></tr>`).join(''), 'Nobody yet.');
  pane().innerHTML = `
    <div class="kpis">
      ${kpi({ k: 'Visitors', v: compact(t.visitors), x: 'different people a day, added up', delta: delta(t.visitors, tr.prev.visitors), spark: series.map((r) => r.errors) })}
      ${kpi({ k: 'Page views', v: compact(t.views), x: `${t.visitors ? (t.views / t.visitors).toFixed(1) : 0} a visitor`, delta: delta(t.views, tr.prev.views), spark: series.map((r) => r.calls) })}
      ${kpi({ k: 'Page load', v: t.loadP50 != null ? num(t.loadP50) : '—', unit: t.loadP50 != null ? 'ms' : '', x: t.loadP95 != null ? `95% under ${num(t.loadP95)} ms` : 'no loads yet' })}
      ${sr.connected ? kpi({ k: 'Google clicks', v: compact(sr.totals.clicks), x: `${compact(sr.totals.impressions)} times shown` }) + kpi({ k: 'Average position', v: sr.totals.position ? sr.totals.position.toFixed(1) : '—', x: `${(sr.totals.ctr * 100).toFixed(1)}% clicked` }) : ''}
    </div>
    <div class="grid g-main">
      ${card('Visitors and views', '<div data-tchart></div>', { right: '<span class="legend"><span><i></i>Views</span><span><i class="b2"></i>Visitors</span></span>' })}
      ${card('Where they came from', donut(tr.sources, { sub: 'views' }))}
    </div>
    <div class="grid g3">
      ${card('Top pages', rowsOf(tr.pages, (r) => `<span class="mono" style="font-size:12.5px">${esc(r.name)}</span>`), { cls: 'flush' })}
      ${card('Referring sites', rowsOf(tr.referrers, (r) => `<a href="${esc(r.name)}" target="_blank" rel="noopener noreferrer" style="font-size:12.5px">${esc(r.name.replace(/^https?:\/\//, ''))}</a>`), { cls: 'flush' })}
      ${card('Campaigns', rowsOf(tr.campaigns), { cls: 'flush', note: 'utm_campaign' })}
    </div>
    <div class="grid g3">
      ${card('Devices', donut(tr.devices, { sub: 'views' }))}
      ${card('Browsers', hbars(tr.browsers))}
      ${card('Countries', hbars(tr.countries), { note: 'from the browser’s language' })}
    </div>
    ${card('Google search', sr.connected ? `<div class="grid g2">
        ${table(['Search', { t: 'Clicks', c: 'n' }, { t: 'Shown', c: 'n' }, { t: 'Position', c: 'n' }], sr.queries.map((q) => `<tr><td>${esc(q.keys[0])}</td><td class="n">${num(q.clicks)}</td><td class="n">${num(q.impressions)}</td><td class="n">${q.position.toFixed(1)}</td></tr>`).join(''), 'No searches yet.')}
        ${table(['Page', { t: 'Clicks', c: 'n' }, { t: 'Position', c: 'n' }], sr.pages.map((q) => `<tr><td class="mono" style="font-size:12px">${esc(q.keys[0].replace(/^https?:\/\/[^/]+/, '') || '/')}</td><td class="n">${num(q.clicks)}</td><td class="n">${q.position.toFixed(1)}</td></tr>`).join(''), 'No pages yet.')}
      </div>` : `<div class="empty" style="text-align:left">${sr.error ? `<p style="color:#ffb3c0">${esc(sr.error)}</p>` : ''}<b style="color:var(--ink)">Connect Google Search Console</b> to see searches, clicks and your average position here.<ol style="margin:10px 0 0;padding-left:18px;line-height:1.8">
        <li>In Google Cloud, make a service account and a JSON key for it.</li>
        <li>In Search Console → Settings → Users, add the service account's email as a user (Restricted is enough).</li>
        <li>In Railway → vertex-api → Variables, set <span class="hint">GSC_CLIENT_EMAIL</span>, <span class="hint">GSC_PRIVATE_KEY</span> and <span class="hint">GSC_SITE</span> (e.g. sc-domain:mintmotive.com.au).</li></ol></div>`, { note: sr.connected ? `${esc(sr.site)} · ${esc(sr.start)} to ${esc(sr.end)}` : '', cls: sr.connected ? 'flush' : '' })}
    <div class="grid g2">
      ${card('Short links', `
        <form class="toolbar" data-linkform>
          <input name="target" placeholder="Where it goes, e.g. /education or https://…" required style="flex:2 1 220px" />
          <input name="code" placeholder="code (optional)" style="flex:1 1 120px" />
          <select name="source"><option value="">Posted on…</option><option>makerworld</option><option>printables</option><option>youtube</option><option>instagram</option><option>facebook</option><option>reddit</option><option>discord</option><option>email</option><option>flyer</option></select>
          <input name="label" placeholder="Label" style="flex:1 1 140px" />
          <button class="btn primary sm">${icon('plus')}Make link</button>
        </form>
        <div style="margin-top:14px">${table(['Link', 'Goes to', { t: 'Clicks', c: 'n' }, ''], ln.links.map((l) => `<tr><td><b class="mono" style="font-size:12.5px">/l/${esc(l.code)}</b>${l.label ? `<span class="sub">${esc(l.label)}</span>` : ''}${l.source ? ` <span class="pill plain">${esc(l.source)}</span>` : ''}</td><td class="mono" style="font-size:12px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.target)}</td><td class="n">${num(l.clicks)}<span class="sub">${l.last_click_at ? ago(l.last_click_at) : ''}</span></td><td class="n"><span class="acts">${iconBtn('copy', 'Copy link', `data-copy="${esc(ln.base + l.code)}"`)}${iconBtn('x', 'Delete', `data-dellink="${esc(l.code)}"`, 'bad')}</span></td></tr>`).join(''), 'No links yet. Make one for each place you post, so you can see which one works.')}</div>`, { note: 'clicks are counted, and the visit is tagged with where you posted it' })}
      ${card('Media library', `
        <div class="toolbar"><label class="btn primary sm" style="cursor:pointer">${icon('plus')}Upload<input type="file" data-upload hidden accept="video/*,image/*,application/pdf" multiple /></label><span class="mute" style="font-size:12.5px">Videos, images and PDFs, up to 300 MB each. Each gets a public link to post or embed.</span></div>
        <div style="margin-top:14px;display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px">${md.media.map((m) => `
          <figure style="margin:0;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--surface-2)">
            ${m.type.startsWith('video/') ? `<video src="${esc(m.url)}" muted preload="metadata" style="display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:#000" controls></video>` : m.type.startsWith('image/') ? `<img src="${esc(m.url)}" alt="" style="display:block;width:100%;aspect-ratio:16/9;object-fit:cover" />` : `<div class="empty" style="aspect-ratio:16/9;padding:20px">${icon('book')}PDF</div>`}
            <figcaption style="padding:9px 10px;font-size:12.5px"><b style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(m.name)}</b><span class="mute">${bytesText(m.bytes)} · ${ago(m.created_at)}</span>
              <span class="acts" style="float:right">${iconBtn('copy', 'Copy link', `data-copy="${esc(location.origin + m.url)}"`)}<a class="icon-btn" href="${esc(m.url)}" download="${esc(m.name)}" title="Download">${icon('download')}</a>${iconBtn('x', 'Delete', `data-delmedia="${esc(m.id)}"`, 'bad')}</span></figcaption>
          </figure>`).join('') || `<div class="empty" style="grid-column:1/-1">${icon('play')}No media yet. Upload the demo videos and images here.</div>`}</div>`)}
    </div>`;
  lineChart($('[data-tchart]'), series, { label: 'Views', errLabel: 'Visitors', second: 'line' });
}

// ---------- settings ----------
const yes = (on, okText, offText) => `<span class="pill ${on ? 'ok' : 'bad'}">${on ? okText : offText}</span>`;
async function settingsTab() {
  const [s, t, a, d] = await Promise.all([call('/api/admin/api/settings'), call('/api/admin/trace-api').catch(() => null), call('/api/admin/print-ai').catch(() => null), call('/api/admin/ai-door').catch(() => null)]);
  const v = s.vertex;
  pane().innerHTML = `<div class="grid g2">
    ${card('Switches', `<div class="grid" style="gap:16px">
        <label class="switch"><input type="checkbox" data-sw="engine" ${s.engineApi ? 'checked' : ''} /><span><b>Engine API</b><span class="sub mute" style="display:block;font-size:12.5px">${s.engineApi ? 'On: anyone with a key' : 'Off: staff keys only'}</span></span></label>
        ${t ? `<label class="switch"><input type="checkbox" data-sw="tracer" ${t.on ? 'checked' : ''} /><span><b>Tracer API</b> ${yes(t.ready, 'ready', 'not set up')}<span class="sub mute" style="display:block;font-size:12.5px">${t.on ? 'On' : 'Off: test keys only'}</span></span></label>` : '<p class="mute">Tracer switches: owners only.</p>'}
        ${a ? `<label class="switch"><input type="checkbox" data-sw="printai" ${a.on ? 'checked' : ''} /><span><b>Print AI API</b><span class="sub mute" style="display:block;font-size:12.5px">${a.on ? 'On: anyone with a key' : 'Off: staff keys only'}</span></span></label>
        <label class="switch"><input type="checkbox" data-sw="printai-photos" ${a.photos !== false ? 'checked' : ''} /><span><b>Print Doctor photos</b> ${yes(a.visionKey, 'ready', 'no vision key set')}<span class="sub mute" style="display:block;font-size:12.5px">${num((a.last30Days || []).reduce((n, r) => n + r.n, 0))} outcomes and shared photos in 30 days</span></span></label>` : ''}
      </div>
      <dl class="kv" style="margin-top:18px">
        <dt>Engine</dt><dd class="mono">${esc(s.engine)}</dd>
        <dt>Payments</dt><dd>${yes(s.stripe.ready, 'Stripe connected', 'no Stripe key')} ${yes(s.stripe.webhook, 'webhook secret set', 'no webhook secret')}</dd>
        <dt>Audit log</dt><dd>${yes(s.audit.ok, `${num(s.audit.count)} entries, chain intact`, `broken at #${s.audit.brokenAt}`)}</dd>
      </dl>`)}
    ${card('VERTEX', `<dl class="kv">
        <dt>Address</dt><dd class="mono">${esc(v.url)}</dd>
        <dt>Link</dt><dd>${yes(v.linked, 'linked', 'not set up (API_LINK_SECRET)')}</dd>
        <dt>Size limits</dt><dd>grid up to ${num(v.controls.limits?.maxGrid)}, ${num(v.controls.limits?.maxHeightUnits)} units tall</dd>
        <dt>Paused on VERTEX</dt><dd>${Object.keys(v.controls.generators || {}).map(esc).join(', ') || 'nothing'}${(v.controls.disabled || []).length ? ` · off: ${v.controls.disabled.map(esc).join(', ')}` : ''}</dd>
        <dt>Checked</dt><dd>${v.controls.at ? ago(v.controls.at) : 'never'} <button type="button" class="btn sm ghost" data-vref>${icon('refresh')}Check now</button></dd>
        <dt>Brought over</dt><dd>${v.imported ? `${when(v.imported.at)}: ${Object.entries(v.imported.counts).filter(([, n]) => n).map(([k, n]) => `${num(n)} ${esc(k.replace(/_/g, ' '))}`).join(', ') || 'nothing new'}` : 'not yet'} <button type="button" class="btn sm ghost" data-vimport>Bring over again</button></dd>
      </dl><p class="lede" style="margin:14px 0 0">Accounts, bans and roles live on VERTEX. People sign in there; alerts from here reach VERTEX staff.</p>`)}
  </div>
  ${t ? card('Issue a tracer key', `<form class="toolbar" data-tkform>
      <input name="name" placeholder="Who it’s for" required aria-label="Who it’s for" style="flex:1 1 200px" />
      <label class="field" style="flex-direction:row;align-items:center;display:flex;gap:8px">Photos a month <input name="quota" type="number" min="1" max="100000" value="${t.limits?.defaultQuota || 500}" style="width:100px" /></label>
      <label class="switch"><input type="checkbox" name="test" /> test key</label>
      <label class="field" style="flex-direction:row;align-items:center;display:flex;gap:8px">Cents a photo <input name="cents" type="number" min="0" max="100000" value="0" style="width:80px" /></label>
      <label class="field" style="flex-direction:row;align-items:center;display:flex;gap:8px">Free a month <input name="free" type="number" min="0" value="0" style="width:90px" /></label>
      <input name="billTo" placeholder="@account that pays" aria-label="Account that pays" style="flex:0 1 170px" />
      <button class="btn primary sm">${icon('key')}Issue key</button>
    </form><div data-tknew></div><p class="lede" style="margin:12px 0 0">Keys are shown once. Revoke or lock them under Keys. A test key works while the API is off and is never billed. Leave cents at 0 for a key that isn’t billed.</p>`) : ''}
  ${d ? aiDoorCard(d) : ''}
  ${t ? tracerBilling(t) : ''}`;
}

// The AI door: who traces (our built-in tracer or the paid AI), the allowance, and 30 days of use.
const DOOR_MODE = { 'free-first': 'Free first: the paid AI only when the built-in tracer looks unsure', 'ai-first': 'AI first: the paid AI while the allowance lasts', 'free-only': 'Free only: never the paid AI' };
const DOOR_ROUTE = { builtin: 'Built-in', ai: 'Paid AI', 'ai-failed': 'Paid AI failed', capped: 'Over allowance' };
function aiDoorCard(d) {
  const a = d.allowance, u = d.usage, paid = (r) => (r.ai || 0) + (r['ai-failed'] || 0);
  const saved = (u.total.builtin || 0) + (u.total.capped || 0), all = saved + paid(u.total);
  return card('AI door', `<div class="kpis">
      ${kpi({ k: 'Paid AI this month', v: num(a.usedMonth), unit: `/ ${num(a.monthlyAi)}`, x: `${num(a.left)} left today or this month`, spark: u.byDay.map(paid), bad: a.left <= 0 && a.mode !== 'free-only' })}
      ${kpi({ k: 'Paid AI today', v: num(a.usedToday), unit: `/ ${num(a.dailyAi)}` })}
      ${kpi({ k: 'Traced free, 30 days', v: num(saved), x: all ? `${Math.round((100 * saved) / all)}% of all traces` : 'no traces yet', spark: u.byDay.map((r) => (r.builtin || 0) + (r.capped || 0)) })}
    </div>
    <form class="toolbar" data-doorform>
      <select name="mode" aria-label="Who traces">${d.modes.map((m) => `<option value="${m}" ${m === a.mode ? 'selected' : ''}>${esc(DOOR_MODE[m] || m)}</option>`).join('')}</select>
      <label class="field">Paid AI a month <input name="monthly" type="number" min="0" max="100000" value="${a.monthlyAi}" /></label>
      <label class="field">a day <input name="daily" type="number" min="0" max="10000" value="${a.dailyAi}" /></label>
      <button class="btn primary sm">Save</button>
    </form>
    ${table(['Caller', ...Object.values(DOOR_ROUTE).map((t) => ({ t, c: 'n' }))], Object.entries(u.byCaller).map(([c, r]) => `<tr><td>${esc(c === 'vertex' ? 'VERTEX (Trace a photo)' : c.startsWith('key:') ? `Tracer key #${esc(c.slice(4))}` : c)}</td>${Object.keys(DOOR_ROUTE).map((k) => `<td class="n">${num(r[k] || 0)}</td>`).join('')}</tr>`).join(''), 'No traces in the last 30 days.')}`,
  { note: a.aiReady ? 'Every outline, from the tracer API and VERTEX, comes through here.' : 'No AI key is set up, so everything is traced by the built-in tracer.' });
}

// Tracer API billing: each key's price, what it owes this month, and each month's bill.
const money = (c) => `$${(c / 100).toFixed(2)}`;
function tracerBilling(t) {
  const live = (t.keys || []).filter((k) => !k.revoked && !k.test);
  return card('Tracer billing', table(['Key', 'Price', 'Pays', { t: 'This month', c: 'n' }], live.map((k) => `
      <tr><td><b>${esc(k.name)}</b> <span class="hint">${esc(k.hint || '')}</span></td>
      <td>${k.centsPerPhoto ? `${money(k.centsPerPhoto)} a photo${k.freePhotos ? `, first ${num(k.freePhotos)} free` : ''}` : '<span class="pill plain">not billed</span>'}</td>
      <td>${k.billHandle ? `@${esc(k.billHandle)}` : '—'}</td><td class="n">${num(k.used)} photos · ${money(k.owedThisMonth || 0)}</td></tr>`).join(''), 'No live tracer keys.')
    + (live.length ? `<form class="toolbar" data-tkprice style="margin-top:14px">
      <select name="id" aria-label="Key">${live.map((k) => `<option value="${k.id}" data-c="${k.centsPerPhoto}" data-f="${k.freePhotos}" data-b="${esc(k.billHandle || '')}">${esc(k.name)}</option>`).join('')}</select>
      <label class="field" style="flex-direction:row;align-items:center;display:flex;gap:8px">Cents a photo <input name="cents" type="number" min="0" max="100000" value="${live[0].centsPerPhoto}" style="width:80px" /></label>
      <label class="field" style="flex-direction:row;align-items:center;display:flex;gap:8px">Free a month <input name="free" type="number" min="0" value="${live[0].freePhotos}" style="width:90px" /></label>
      <input name="billTo" placeholder="@account that pays" value="${esc(live[0].billHandle ? `@${live[0].billHandle}` : '')}" aria-label="Account that pays" style="flex:0 1 170px" />
      <button class="btn sm">Save price</button></form>` : '')
    + `<h3 style="margin:20px 0 8px;font-size:14px">Monthly bills</h3>`
    + table(['Month', 'Key', { t: 'Photos', c: 'n' }, { t: 'Amount', c: 'n' }, 'Invoice'], (t.bills || []).map((b) => `
      <tr><td>${esc(b.month)}</td><td>${esc(b.name)}</td><td class="n">${num(b.photos)}</td><td class="n">${money(b.cents)}</td>
      <td>${b.billedAt ? (b.invoiceItem === 'invoice by hand' ? '<span class="pill warn">invoice by hand</span>' : `<span class="pill ok">on invoice</span> <span class="hint">${esc(b.invoiceItem || '')}</span>`) : '<span class="pill info">this month</span>'}</td></tr>`).join(''), 'Nothing billed yet.'),
  { right: `<button type="button" class="btn sm ghost" data-tkbill>Bill finished months now</button>`, note: t.payments ? 'Finished months go on the payer’s next invoice.' : 'Payments aren’t set up: bills are marked for invoicing by hand.' });
}

// ---------- education ----------
const EDU_STATE = { pending: 'waiting', 'more-info': 'asked for more', approved: 'approved', declined: 'declined' };
const EDU_PILL = { pending: 'warn', 'more-info': 'info', approved: 'ok', declined: 'bad' };
let eduPlans = [];
async function educationTab(openId) {
  const r = await call('/api/admin/api/education');
  eduPlans = r.plans;
  const c = $('[data-educount]'); if (c) { c.textContent = r.counts.pending || ''; c.hidden = !r.counts.pending; }
  pane().innerHTML = `<div class="kpis">${['pending', 'more-info', 'approved', 'declined'].map((k) => kpi({ k: EDU_STATE[k], v: num(r.counts[k] || 0), x: k === 'pending' ? 'to review' : '' })).join('')}</div>`
    + card('Applications', table(['Institution', 'Kind', 'Country', 'From', 'Sent', 'State', ''], r.applications.map((a) => `
      <tr class="row" data-eduopen="${a.id}"><td><b>${esc(a.institution)}</b></td><td>${esc(a.kindName)}</td><td>${esc(a.country)}${a.region ? `<span class="sub">${esc(a.region)}</span>` : ''}</td><td>@${esc(a.handle || a.userId)}</td><td>${ago(a.createdAt)}</td>
      <td><span class="pill ${EDU_PILL[a.status] || 'info'}">${esc(EDU_STATE[a.status] || a.status)}</span></td>
      <td class="n"><button type="button" class="btn sm" data-eduopen="${a.id}">Review</button></td></tr>`).join(''), 'No applications yet.'), { cls: 'flush' })
    + '<div data-edudetail></div>'
    + `<p class="lede">Public schools get the Education plan at its near-cost price (set it in Plans). Approve other institutions onto Education or a usual plan, or give a plan free for a while. Documents are deleted 30 days after you decide.</p>`;
  if (openId) eduOpen(openId);
}
async function eduOpen(id) {
  const a = await call(`/api/admin/api/education/${id}`);
  const row = (k, v) => (v ? `<dt>${k}</dt><dd>${v}</dd>` : '');
  $('[data-edudetail]').innerHTML = card(`${esc(a.institution)} <span class="pill ${EDU_PILL[a.status] || 'info'}">${esc(EDU_STATE[a.status] || a.status)}</span>`, `
    <div class="grid g2">
      <dl class="kv">
        ${row('Kind', esc(a.kindName))}${row('Country', esc([a.country, a.region].filter(Boolean).join(', ')))}${row('Website', a.website ? `<a href="${esc(a.website)}" target="_blank" rel="noopener noreferrer">${esc(a.website)}</a>` : '')}
        ${row('Address', esc(a.address))}${row('Contact', `${esc(a.contactName)}, ${esc(a.contactRole)}`)}${row('Email', esc(a.contactEmail))}${row('Phone', esc(a.contactPhone))}
        ${row('Students', a.students ? num(a.students) : '')}${row('Levels', esc(a.levels))}${row('Account', `@${esc(a.handle || a.userId)} ${esc(a.email || '')}`)}
      </dl>
      <div>
        <p class="side-group" style="padding:0">What for</p><p style="margin:6px 0 14px">${esc(a.use)}</p>
        <p class="side-group" style="padding:0">Their proof</p><p style="margin:6px 0 14px">${esc(a.proof)}</p>
        <p class="side-group" style="padding:0">Documents</p>
        ${a.filesDeleted ? '<p class="mute">Deleted after the decision.</p>' : `<div class="toolbar" style="margin-top:8px">${a.files.map((f) => `<a class="btn sm" href="/api/admin/api/education/${a.id}/files/${f.id}" target="_blank" rel="noopener">${icon('book')}${esc(f.name)} <span class="mute">${bytesText(f.bytes)}</span></a>`).join('') || '<span class="mute">None</span>'}</div>`}
      </div>
    </div>
    ${a.decisionNote || a.reviewedAt ? `<p class="lede" style="margin:14px 0 0">Decided ${when(a.reviewedAt)}${a.reviewedBy ? ` by @${esc(a.reviewedBy)}` : ''}${a.decisionPlan ? `: ${esc(a.decisionPlan)} plan` : ''}. ${esc(a.decisionNote || '')}</p>` : ''}
    <form class="grid" style="gap:12px;margin-top:18px;padding-top:18px;border-top:1px solid var(--line)" data-eduform="${a.id}">
      <div class="toolbar">
        <label class="field">Decision<select name="status"><option value="approved">Approve</option><option value="more-info">Ask for more</option><option value="declined">Decline</option></select></label>
        <label class="field">Plan<select name="plan">${eduPlans.filter((p) => p.id !== 'free').map((p) => `<option value="${esc(p.id)}" ${p.id === 'education' ? 'selected' : ''}>${esc(p.name)} ($${p.monthly}/mo)</option>`).join('')}</select></label>
        <label class="field">Give it free for<select name="giveDays"><option value="">no, they pay</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">a year</option></select></label>
      </div>
      <textarea name="note" rows="2" maxlength="1500" placeholder="A note they'll see (needed when asking for more or declining)"></textarea>
      <div><button class="btn primary">Save decision</button></div>
    </form>`);
  $('[data-edudetail]').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- tabs ----------
const TABS = { overview, alerts: alertsTab, calls: callsTab, trace: () => traceTab(), latency: latencyTab, keys: keysTab, addresses: addressesTab, developers: () => developersTab(), webhooks: webhooksTab, plans: plansTab, status: statusTab, education: () => educationTab(), marketing: marketingTab, settings: settingsTab };
async function show(name = tab) {
  tab = TABS[name] ? name : 'overview';
  $$('[data-tabs] a').forEach((a) => a.setAttribute('aria-current', String(a.getAttribute('href') === `#${tab}`)));
  const [t, sub] = TITLES[tab];
  $('[data-title]').textContent = t; $('[data-sub]').textContent = sub;
  $('[data-periods]').hidden = !RANGED.has(tab);
  $('[data-apis]').hidden = !['overview', 'latency', 'addresses', 'calls'].includes(tab);
  document.title = `${t} · API admin`;
  try { await TABS[tab](); } catch (e) { pane().innerHTML = `<div class="card"><div class="empty">${esc(e.message)}</div></div>`; }
  refreshCounts();
}
async function refreshCounts() {
  try {
    const r = await call('/api/admin/api/alerts?open=1&limit=500');
    const b = $('[data-alertcount]');
    b.hidden = !r.alerts.length; b.textContent = r.alerts.length;
  } catch { /* the badge can wait */ }
}
const goCalls = (f) => { filters = f; rows = []; next = null; if (location.hash === '#calls') show('calls'); else location.hash = 'calls'; };

document.addEventListener('change', async (e) => {
  // Picking a key in the price form shows its current price.
  if (e.target.matches?.('[data-tkprice] [name=id]')) {
    const o = e.target.selectedOptions[0], f = e.target.form;
    f.cents.value = o.dataset.c; f.free.value = o.dataset.f; f.billTo.value = o.dataset.b ? `@${o.dataset.b}` : '';
    return;
  }
  const sw = e.target.dataset?.sw;
  if (sw) {
    const put = { engine: () => call('/api/admin/api/settings', { method: 'PUT', body: { engineApi: e.target.checked } }), tracer: () => call('/api/admin/trace-api', { method: 'PUT', body: { on: e.target.checked } }), printai: () => call('/api/admin/print-ai', { method: 'PUT', body: { on: e.target.checked } }), 'printai-photos': () => call('/api/admin/print-ai', { method: 'PUT', body: { photos: e.target.checked } }) }[sw];
    await act(put, 'Saved');
    return show('settings');
  }
  if (e.target.matches?.('[data-upload]')) {
    for (const f of e.target.files) {
      toast(`Uploading ${f.name}…`);
      await act(() => call(`/api/admin/api/marketing/media?name=${encodeURIComponent(f.name)}`, { method: 'POST', raw: f }), `${f.name} uploaded`);
    }
    show('marketing');
  }
});
document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, a, tr') || e.target;
  if (t.closest?.('[data-reload]')) return show();
  const eo = e.target.closest('[data-eduopen]');
  if (eo) return act(() => eduOpen(eo.dataset.eduopen));
  if (t.closest?.('[data-tkbill]')) { const r = await act(() => call('/api/admin/trace-api/bill', { method: 'POST' })); if (r) toast(`${r.billed} billed`); return show('settings'); }
  if (t.closest?.('[data-vref]')) { await act(() => call('/api/admin/api/vertex/refresh', { method: 'POST' }), 'Checked VERTEX'); return show('settings'); }
  if (t.closest?.('[data-vimport]')) { if (!(await ask({ title: 'Bring the records over again?', body: 'Rows already here stay as they are.', ok: 'Bring over' }))) return; await act(() => call('/api/admin/api/vertex/import', { method: 'POST' }), 'Done'); return show('settings'); }
  const d = e.target.closest('[data-days]');
  if (d) { days = Number(d.dataset.days); $$('[data-days]').forEach((b) => b.setAttribute('aria-pressed', String(b === d))); return show(); }
  const a = e.target.closest('[data-api]');
  if (a) { apiName = a.dataset.api; $$('[data-api]').forEach((b) => b.setAttribute('aria-pressed', String(b === a))); return show(); }
  const el = e.target.closest('[data-fkey],[data-fuser],[data-fip],[data-clear],[data-more],[data-traceid],[data-scan],[data-ack],[data-block],[data-unblock],[data-revoke],[data-lock],[data-saveplans],[data-billnow],[data-plancancel],[data-copy],[data-dellink],[data-delmedia]');
  if (el) {
    const ds = el.dataset;
    if (ds.fkey) { const [keyType, keyId] = ds.fkey.split(':'); return goCalls({ keyType, keyId }); }
    if (ds.fuser) return goCalls({ userId: ds.fuser });
    if (ds.fip) return goCalls({ ip: ds.fip });
    if ('clear' in ds) { filters = {}; return search(); }
    if ('more' in ds) return search(true);
    if (ds.traceid) { history.replaceState(null, '', '#trace'); tab = 'trace'; return show('trace').then(() => { $('[data-trace] [name=id]').value = ds.traceid; trace(ds.traceid); }); }
    if ('scan' in ds) { el.disabled = true; const r = await act(() => call('/api/admin/api/scan', { method: 'POST' })); toast(r?.raised ? `${r.raised} new alerts` : 'Nothing new'); return alertsTab(); }
    if (ds.ack) { await act(() => call(`/api/admin/api/alerts/${ds.ack}/ack`, { method: 'POST' }), 'Marked done'); return show(); }
    if (ds.block) {
      const reason = await ask({ title: `Block ${ds.block}?`, body: 'Both APIs answer 403 for a day. Use Addresses to block for longer. Say why: it goes in the audit log.', input: { placeholder: 'Why' }, ok: 'Block', danger: true });
      if (reason === null) return;
      await act(() => call('/api/admin/api/blocks', { method: 'POST', body: { ip: ds.block, reason, hours: 24 } }), `${ds.block} blocked`); return show();
    }
    if (ds.unblock) { await act(() => call(`/api/admin/api/blocks/${encodeURIComponent(ds.unblock)}`, { method: 'DELETE' }), 'Unblocked'); return show(); }
    if (ds.revoke) {
      const reason = await ask({ title: 'Revoke this key?', body: 'Anything using it stops straight away, and the developer’s webhooks are told. Why? (Kept in the audit log.)', input: { placeholder: 'Why' }, ok: 'Revoke', danger: true });
      if (reason === null) return;
      const [type, id] = ds.revoke.split(':');
      await act(() => call(`/api/admin/api/keys/${type}/${id}/revoke`, { method: 'POST', body: { reason } }), 'Key revoked'); return show();
    }
    if (ds.lock) {
      const v = await ask({ title: 'Lock to addresses', body: 'Only allow this key from these addresses (IPs, or IPv4 ranges like 203.0.113.0/24), separated by commas. Empty: any address.', input: { value: ds.allow || '', placeholder: '203.0.113.7, 198.51.100.0/24' }, ok: 'Save' });
      if (v === null) return;
      const [type, id] = ds.lock.split(':');
      await act(() => call(`/api/admin/api/keys/${type}/${id}/allow`, { method: 'POST', body: { allowIps: v } }), 'Saved'); return show();
    }
    if ('saveplans' in ds) {
      const plans = $$('[data-plansform] [data-plan]').map((tr) => {
        const o = { id: tr.dataset.plan };
        $$('[data-f]', tr).forEach((i) => { o[i.dataset.f] = i.type === 'checkbox' ? i.checked : i.dataset.f === 'perks' ? i.value.split('\n') : i.type === 'number' ? Number(i.value) : i.value; });
        return o;
      });
      if (await act(() => call('/api/admin/api/plans', { method: 'PUT', body: { plans } }), 'Plans saved')) show();
      return;
    }
    if ('billnow' in ds) { const r = await act(() => call('/api/admin/api/plans/bill', { method: 'POST' })); if (r) toast(`${r.billed} billed`); return; }
    if (ds.plancancel) {
      if (!(await ask({ title: 'Cancel their plan now?', body: 'A paid plan is cancelled in Stripe straight away, with no refund for the rest of the month.', ok: 'Cancel plan', danger: true, cancel: 'Keep it' }))) return;
      await act(() => call('/api/admin/api/plans/cancel', { method: 'POST', body: { userId: Number(ds.plancancel) } }), 'Plan cancelled'); return show();
    }
    if (ds.copy) { try { await navigator.clipboard.writeText(ds.copy); toast('Copied'); } catch { toast(ds.copy); } return; }
    if (ds.dellink) { if (!(await ask({ title: `Delete /l/${ds.dellink}?`, body: 'Anyone who follows it afterwards gets a not-found page.', ok: 'Delete', danger: true }))) return; await act(() => call(`/api/admin/api/marketing/links/${ds.dellink}`, { method: 'DELETE' }), 'Deleted'); return show(); }
    if (ds.delmedia) { if (!(await ask({ title: 'Delete this file?', body: 'Links to it stop working.', ok: 'Delete', danger: true }))) return; await act(() => call(`/api/admin/api/marketing/media/${ds.delmedia}`, { method: 'DELETE' }), 'Deleted'); return show(); }
  }
  const row = e.target.closest('[data-row]');
  if (row && !e.target.closest('button, a')) { const det = $(`[data-detail="${row.dataset.row}"]`); det.hidden = !det.hidden; row.classList.toggle('open', !det.hidden); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches?.('[data-row]')) e.target.click(); });
document.addEventListener('submit', async (e) => {
  const f = e.target;
  if (f.method === 'dialog') return;
  e.preventDefault();
  if (f.matches('[data-eduform]')) {
    const id = f.dataset.eduform;
    if (await act(() => call(`/api/admin/api/education/${id}/decide`, { method: 'POST', body: { status: f.status.value, plan: f.plan.value, giveDays: f.giveDays.value ? Number(f.giveDays.value) : null, note: f.note.value } }), 'Decision saved')) educationTab(id);
    return;
  }
  if (f.matches('[data-tkform]')) {
    const k = await act(() => call('/api/admin/trace-api/keys', { method: 'POST', body: { name: f.name.value, quota: Number(f.quota.value), test: f.test.checked, centsPerPhoto: Number(f.cents.value), freePhotos: Number(f.free.value), billTo: f.billTo.value } }));
    if (k) { $('[data-tknew]').innerHTML = `<div class="card" style="margin-top:14px;border-color:var(--mint)"><p style="margin:0 0 8px">Key for <b>${esc(k.name)}</b>. Copy it now: it isn't shown again.</p><pre class="code">${esc(k.key)}</pre></div>`; f.reset(); }
    return;
  }
  if (f.matches('[data-doorform]')) {
    if (await act(() => call('/api/admin/ai-door', { method: 'PUT', body: { mode: f.mode.value, monthlyAi: Number(f.monthly.value), dailyAi: Number(f.daily.value) } }), 'AI allowance saved')) show('settings');
    return;
  }
  if (f.matches('[data-tkprice]')) {
    if (await act(() => call(`/api/admin/trace-api/keys/${f.id.value}`, { method: 'PUT', body: { centsPerPhoto: Number(f.cents.value), freePhotos: Number(f.free.value), billTo: f.billTo.value } }), 'Price saved')) show('settings');
    return;
  }
  if (f.matches('[data-filter]')) { const d = new FormData(f); filters = { ...filters, status: d.get('status'), q: String(d.get('q') || '').trim(), ip: String(d.get('ip') || '').trim(), userId: String(d.get('userId') || '').trim() }; return search(); }
  if (f.matches('[data-trace]')) return trace(f.id.value);
  if (f.matches('[data-devsearch]')) return developersTab(f.q.value);
  if (f.matches('[data-linkform]')) {
    const d = new FormData(f);
    if (await act(() => call('/api/admin/api/marketing/links', { method: 'POST', body: Object.fromEntries(d) }), 'Link made')) show();
    return;
  }
  if (f.matches('[data-grant]')) {
    const d = new FormData(f);
    if (await act(() => call('/api/admin/api/plans/grant', { method: 'POST', body: { userId: Number(d.get('userId')), plan: d.get('plan'), days: Number(d.get('days')), note: d.get('note') } }), 'Plan given')) show();
    return;
  }
  if (f.matches('[data-incident]')) {
    const d = new FormData(f);
    if (await act(() => call('/api/admin/api/incidents', { method: 'POST', body: { title: d.get('title'), impact: d.get('impact'), status: d.get('status'), components: d.getAll('components'), body: d.get('body') } }), 'Incident posted')) statusTab();
    return;
  }
  if (f.matches('[data-incupdate]')) {
    const d = new FormData(f);
    if (await act(() => call(`/api/admin/api/incidents/${f.dataset.incupdate}/updates`, { method: 'POST', body: { status: d.get('status'), impact: d.get('impact'), body: d.get('body') } }), 'Update posted')) statusTab();
    return;
  }
  if (f.matches('[data-blockform]')) {
    const d = new FormData(f);
    if (await act(() => call('/api/admin/api/blocks', { method: 'POST', body: { ip: d.get('ip'), reason: d.get('reason'), hours: Number(d.get('hours')) } }), 'Blocked')) show();
  }
});
window.addEventListener('hashchange', () => show(location.hash.slice(1)));

// The engine's state in the top bar.
async function liveState() {
  try {
    const s = await call('/api/status');
    const el = $('[data-live]');
    el.className = `live ${s.overall === 'operational' ? '' : /degraded|partial/.test(s.overall) ? 'warn' : 'bad'}`;
    $('[data-state]').textContent = s.overall === 'operational' ? 'All systems normal' : s.overall;
  } catch { $('[data-state]').textContent = 'Status unknown'; }
}

(async () => {
  shell();
  try { await call('/api/admin/api/alerts?open=1&limit=1'); } catch (e) {
    document.body.classList.add('gated');
    $('[data-signin]').hidden = false;
    if (e.status === 403) { $('[data-signin] h1').textContent = 'Admins only'; $('[data-signin] p').textContent = e.message; $('[data-signin] .btn.primary').hidden = true; }
    return;
  }
  me = (await call('/api/me').catch(() => ({}))).user;
  if (me) $('[data-me]').innerHTML = `${avatar(me.handle)}<div class="who"><b>${esc(me.name || me.handle)}</b><span>@${esc(me.handle)} · ${esc(me.role)}</span></div>`;
  const open = commandPalette([
    ...Object.entries(TITLES).map(([k, [t, sub]]) => ({ group: 'Go to', label: t, hint: sub, icon: { overview: 'overview', alerts: 'alert', calls: 'calls', latency: 'speed', trace: 'trace', developers: 'users', keys: 'key', plans: 'card', education: 'school', addresses: 'globe', webhooks: 'hook', status: 'pulse', marketing: 'megaphone', settings: 'cog' }[k], run: () => { location.hash = k; } })),
    { group: 'Do', label: 'Check for alerts now', icon: 'refresh', run: async () => { const r = await act(() => call('/api/admin/api/scan', { method: 'POST' })); toast(r?.raised ? `${r.raised} new alerts` : 'Nothing new'); } },
    { group: 'Do', label: 'Download every call (CSV)', icon: 'download', run: () => { location.href = '/api/admin/api/requests.csv'; } },
    { group: 'Do', label: 'Open the status page', icon: 'ext', run: () => window.open('/status', '_blank') },
    { group: 'Do', label: 'Open the docs', icon: 'book', run: () => window.open('/docs', '_blank') },
  ], (q) => {
    if (!q) return [];
    const out = [];
    if (/^(VX|T)-?[A-Z0-9-]{4,}$/i.test(q) || /^req_/i.test(q)) out.push({ group: 'Found', label: `Trace ${q}`, icon: 'trace', run: () => { location.hash = 'trace'; setTimeout(() => { $('[data-trace] [name=id]').value = q; trace(q); }, 200); } });
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(q) || /:/.test(q)) out.push({ group: 'Found', label: `Calls from ${q}`, icon: 'globe', run: () => goCalls({ ip: q }) });
    if (/^#?\d+$/.test(q)) out.push({ group: 'Found', label: `Calls by account #${q.replace('#', '')}`, icon: 'users', run: () => goCalls({ userId: q.replace('#', '') }) });
    if (q.length > 2) out.push({ group: 'Found', label: `Search calls for “${q}”`, icon: 'calls', run: () => goCalls({ q }) }, { group: 'Found', label: `Find developer “${q}”`, icon: 'users', run: () => { location.hash = 'developers'; setTimeout(() => developersTab(q), 100); } });
    return out;
  });
  $('[data-cmdk]').addEventListener('click', open);
  liveState(); setInterval(liveState, 60e3);
  show(location.hash.slice(1) || 'overview');
})();
