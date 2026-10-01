// The developer console: your keys, your usage, and every call your keys made,
// each with its request id, result, timing and serial.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (n) => Number(n || 0).toLocaleString();
const kb = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : b > 1e3 ? `${Math.round(b / 1024)} KB` : `${b || 0} B`);
const when = (t) => (t ? new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');
const ago = (t) => { if (!t) return 'never'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}

let days = 30, data = null, calls = [], next = null, filters = {};
const perDay = () => data?.plan?.plan?.perDay || 1000;
const usedToday = () => (data?.keys || []).reduce((n, k) => n + (k.usedToday || 0), 0);
const money = (cents, cur = 'AUD') => `$${(cents / 100).toFixed(2)}${cur && cur !== 'AUD' ? ` ${cur}` : ''}`;

// Your plan: what you're on, this month's use, extra use and its cap, and the other plans.
function plan(p, list) {
  const el = $('[data-plan]');
  if (!p) { el.hidden = true; return; }
  const cur = p.plan, sub = p.sub, ro = data.viewingAs;
  const paying = sub?.live && sub.provider === 'stripe';
  const extra = cur.overagePer1000 > 0;
  el.innerHTML = `
    <div class="cx-tile-head"><h2>Your plan: ${esc(cur.name)}</h2>${paying && !ro ? '<button type="button" class="ax-btn ax-btn-ghost ax-btn-sm" data-manage>Billing and invoices</button>' : ''}</div>
    <div class="cx-plan-row">
      <div><p class="ax-tile-k">Today</p><p class="cx-big">${num(usedToday())}<small> / ${num(cur.perDay)}</small></p><p class="ax-tile-s">shared by your keys · ${num(cur.perMinute)} a minute per key · ${num(cur.keys)} keys</p></div>
      <div><p class="ax-tile-k">This month</p><p class="cx-big">${num(p.month.calls)}</p><p class="ax-tile-s">files and part lists</p></div>
      <div><p class="ax-tile-k">Extra use</p><p class="cx-big">${extra ? money(p.month.overCents) : '—'}</p><p class="ax-tile-s">${extra ? `${num(p.month.overCalls)} calls past the day's allowance, at ${money(cur.overagePer1000 * 100)} per 1,000` : 'Stops at the day’s allowance'}</p></div>
      <div><p class="ax-tile-k">${sub?.cancelAtPeriodEnd ? 'Ends' : paying ? 'Renews' : sub?.provider === 'manual' ? 'Given by us' : 'Price'}</p><p class="cx-big">${sub?.periodEnd ? new Date(sub.periodEnd).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : cur.monthly ? `$${cur.monthly}` : 'Free'}</p><p class="ax-tile-s">${cur.monthly ? `$${cur.monthly} a month` : 'No card needed'}</p></div>
    </div>
    ${extra && !ro ? `<form class="cx-cap" data-cap><label>Stop extra use at <span>$</span><input name="dollars" type="number" min="0" step="1" value="${p.ownCap != null ? Math.round(p.ownCap / 100) : ''}" placeholder="${Math.round(p.cap / 100)}" aria-label="Monthly limit for extra use, dollars" /> a month</label><button class="ax-btn ax-btn-sm">Save</button><span class="ax-tile-s">Past it, calls stop until the 1st. Empty: the plan's $${Math.round((cur.overageCap || 0))}.</span></form>` : ''}
    <div class="cx-plans">${list.map((x) => `
      <article class="cx-planopt${x.id === cur.id ? ' is-on' : ''}">
        <h3>${esc(x.name)} <span>${x.monthly ? `$${x.monthly}/mo` : 'Free'}</span></h3>
        <p class="ax-tile-s">${esc(x.blurb)}</p>
        <ul>${[`${num(x.perDay)} calls a day`, `${num(x.perMinute)} a minute`, `${num(x.keys)} keys`, ...x.perks].map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        ${ro ? '' : x.id === cur.id ? '<span class="cx-pill ok">Your plan</span>' : x.id === 'free' ? (paying ? '<button type="button" class="cx-link" data-planpick="free">Go back to free at the end of the month</button>' : '') : `<button type="button" class="ax-btn ax-btn-primary ax-btn-sm" data-planpick="${esc(x.id)}" ${p.checkout ? '' : 'disabled'}>${p.checkout ? (paying ? `Switch to ${esc(x.name)}` : `Choose ${esc(x.name)}`) : 'Opening soon'}</button>`}
      </article>`).join('')}</div>`;
  el.hidden = false;
}
// Staff looking at a developer's console (read only): ?as=<account id>.
const as = new URLSearchParams(location.search).get('as');
const asQ = as ? `&as=${encodeURIComponent(as)}` : '';

function stats(s) {
  const t = s.totals, rate = t.calls ? Math.round((t.errors / t.calls) * 1000) / 10 : 0;
  $('[data-stats]').innerHTML = [
    ['Calls', num(t.calls), `last ${s.days} days`],
    ['Files made', num(t.files), 'each with a serial'],
    ['Errors', `${rate}%`, `${num(t.errors)} calls`],
    ['Typical time', `${num(t.p50)} ms`, `95% under ${num(t.p95)} ms`],
    ['Sent', kb(t.bytes), 'files and answers'],
  ].map(([k, v, s2]) => `<div class="ax-tile cx-stat"><p class="ax-tile-k">${k}</p><p class="cx-big">${v}</p><p class="ax-tile-s">${s2}</p></div>`).join('');
}

function chart(s) {
  const map = Object.fromEntries(s.byDay.map((d) => [d.day, d]));
  const daysList = Array.from({ length: s.days }, (_, i) => new Date(Date.now() - (s.days - 1 - i) * 86400e3).toISOString().slice(0, 10));
  const rows = daysList.map((d) => ({ day: d, calls: map[d]?.calls || 0, errors: map[d]?.errors || 0 }));
  const max = Math.max(1, ...rows.map((r) => r.calls));
  const W = 600, H = 170, bw = W / rows.length;
  const bars = rows.map((r, i) => {
    const h = (r.calls / max) * (H - 20), he = (r.errors / max) * (H - 20), x = i * bw + bw * 0.15, w = Math.max(1, bw * 0.7);
    return `<g><title>${r.day}: ${r.calls} calls, ${r.errors} errors</title><rect class="ok" x="${x}" y="${H - h}" width="${w}" height="${h}" rx="2" /><rect class="err" x="${x}" y="${H - he}" width="${w}" height="${he}" rx="2" /></g>`;
  }).join('');
  $('[data-chart]').innerHTML = s.totals.calls
    ? `<svg class="cx-bars" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Calls per day">${bars}</svg><div class="cx-axis ax-mono"><span>${rows[0].day}</span><span>${rows[rows.length - 1].day}</span></div>`
    : '<p class="cx-empty">No calls yet. Make a key below, then try the quick start in the docs.</p>';
}

function breakdown(el, rows) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  el.innerHTML = rows.length ? rows.map((r) => `<div class="cx-hbar"><span>${esc(r.name)}</span><i><b></b></i><em>${num(r.n)}</em></div>`).join('') : '<p class="cx-empty">Nothing yet.</p>';
  // Widths set by script: style attributes are blocked by the page's security rules.
  $$('.cx-hbar b', el).forEach((b, i) => { b.style.width = `${(rows[i].n / max) * 100}%`; });
}

function keys(list) {
  $('[data-keys]').innerHTML = `<thead><tr><th>Name</th><th>Key</th><th>Made</th><th>Last used</th><th>Calls</th><th>Today</th><th></th></tr></thead><tbody>${list.map((k) => `
    <tr class="${k.revoked ? 'is-revoked' : ''}">
      <td><b data-name="${k.id}">${esc(k.name)}</b>${k.revoked ? ' <span class="cx-pill bad">revoked</span>' : ''}</td>
      <td class="ax-mono">${esc(k.hint || 'vx_…')}<br><span class="cx-lock ${k.allowIps ? 'on' : ''}" title="${esc(k.allowIps || 'Works from anywhere')}">${k.allowIps ? `Locked to ${k.allowIps.split(',').length} address${k.allowIps.split(',').length > 1 ? 'es' : ''}` : 'Any address'}</span></td>
      <td>${ago(k.createdAt)}</td><td>${ago(k.lastUsedAt)}</td><td>${num(k.calls)}</td>
      <td>${k.revoked ? '—' : `<span class="cx-quota"><i><b data-q="${Math.min(100, (k.usedToday / perDay()) * 100)}"></b></i>${num(k.usedToday)}</span>`}</td>
      <td class="cx-actions">${k.revoked ? '' : `<button type="button" class="cx-link" data-lock="${k.id}" data-allow="${esc(k.allowIps || '')}">Lock</button><button type="button" class="cx-link" data-rename="${k.id}">Rename</button><button type="button" class="cx-link bad" data-revoke="${k.id}">Revoke</button>`}</td>
    </tr>`).join('') || '<tr><td colspan="7" class="cx-empty">No keys yet.</td></tr>'}</tbody>`;
  $$('[data-q]').forEach((b) => { b.style.width = `${b.dataset.q}%`; });
  const sel = $('[data-filters] [name=key]');
  sel.innerHTML = `<option value="">All keys</option>${list.map((k) => `<option value="${k.id}">${esc(k.name)}${k.revoked ? ' (revoked)' : ''}</option>`).join('')}`;
}

function hooks(list, events) {
  const ev = $('[data-events]');
  if (!ev.dataset.done) {
    ev.innerHTML = Object.entries(events).map(([k, v]) => `<label><input type="checkbox" name="events" value="${esc(k)}" checked /> <span class="ax-mono">${esc(k)}</span> <span>${esc(v)}</span></label>`).join('');
    ev.dataset.done = '1';
  }
  $('[data-hooks]').innerHTML = `<thead><tr><th>Address</th><th>Events</th><th>Delivered</th><th>Failed</th><th>Last delivered</th><th></th></tr></thead><tbody>${list.map((h) => `
    <tr class="${h.disabled ? 'is-revoked' : ''}">
      <td class="ax-mono">${esc(h.url)}${h.disabled ? ' <span class="cx-pill bad">removed</span>' : ''}</td>
      <td class="ax-mono">${h.events.map(esc).join('<br>')}</td>
      <td>${num(h.delivered)}</td><td>${h.failed ? `<span class="cx-pill bad">${num(h.failed)}</span>` : '0'}</td><td>${ago(h.lastDeliveredAt)}</td>
      <td class="cx-actions"><button type="button" class="cx-link" data-deliv="${h.id}">Deliveries</button>${h.disabled ? '' : `<button type="button" class="cx-link" data-hookact data-hooktest="${h.id}">Send a test</button><button type="button" class="cx-link bad" data-hookact data-hookdel="${h.id}">Remove</button>`}</td>
    </tr>
    <tr class="cx-detail" data-delivfor="${h.id}" hidden><td colspan="6"></td></tr>`).join('') || '<tr><td colspan="6" class="cx-empty">No webhooks yet.</td></tr>'}</tbody>`;
}
async function deliveries(id) {
  const row = $(`[data-delivfor="${id}"]`);
  if (!row.hidden) { row.hidden = true; return; }
  const r = await call(`/api/developer/webhooks/${id}/deliveries?x=1${asQ}`);
  row.hidden = false;
  row.firstElementChild.innerHTML = r.deliveries.length ? `<table class="cx-table cx-deliv"><thead><tr><th>When</th><th>Event</th><th>Result</th><th>Tries</th><th>Answer</th><th>Next try</th><th>Delivery id</th></tr></thead><tbody>${r.deliveries.map((d) => `
    <tr><td>${when(d.createdAt)}</td><td class="ax-mono">${esc(d.event)}</td><td><span class="cx-pill ${d.status === 'delivered' ? 'ok' : d.status === 'failed' ? 'bad' : 'warn'}">${esc(d.status)}</span></td><td>${d.attempts}</td><td>${esc(d.code ? `HTTP ${d.code}` : '')} ${d.error ? `<span class="cx-err">${esc(d.error)}</span>` : ''}</td><td>${d.nextAt ? when(d.nextAt) : '—'}</td><td class="ax-mono cx-rid">${esc(d.eventId)}</td></tr>`).join('')}</tbody></table>` : '<p class="cx-empty">Nothing sent yet.</p>';
}

const statusPill = (s) => `<span class="cx-pill ${s >= 500 ? 'bad' : s >= 400 ? 'warn' : 'ok'}">${s}</span>`;
function callRows(append = false) {
  const html = calls.map((r) => `
    <tr class="cx-row" data-row="${r.id}" tabindex="0">
      <td>${when(r.at)}</td>
      <td class="ax-mono"><b class="cx-m ${r.method === 'POST' ? 'post' : 'get'}">${esc(r.method)}</b> ${esc(r.path.replace('/api', ''))}</td>
      <td>${esc([r.kind, r.format].filter(Boolean).join(' · ') || '—')}</td>
      <td>${statusPill(r.status)}</td>
      <td>${num(r.ms)} ms</td>
      <td class="ax-mono">${esc(r.serial || '—')}</td>
      <td class="ax-mono cx-rid">${esc(r.requestId)}</td>
    </tr>
    <tr class="cx-detail" data-detail="${r.id}" hidden><td colspan="7">
      <dl>
        <div><dt>Request id</dt><dd class="ax-mono">${esc(r.requestId)} <button type="button" class="cx-link" data-copy="${esc(r.requestId)}">Copy</button></dd></div>
        <div><dt>Key</dt><dd>${esc(r.key?.name || '—')} <span class="ax-mono">${esc(r.key?.hint || '')}</span></dd></div>
        <div><dt>Size</dt><dd>${kb(r.bytes)}</dd></div>
        ${r.serial ? `<div><dt>Serial</dt><dd class="ax-mono">${esc(r.serial)} <button type="button" class="cx-link" data-copy="${esc(r.serial)}">Copy</button></dd></div>` : ''}
        ${r.error ? `<div class="wide"><dt>Error you got</dt><dd class="cx-err">${esc(r.error)}</dd></div>` : ''}
        ${r.params ? `<div class="wide"><dt>Settings sent</dt><dd><pre class="ax-code">${esc(JSON.stringify(r.params, null, 2))}</pre></dd></div>` : ''}
      </dl>
    </td></tr>`).join('');
  $('[data-calls]').innerHTML = `<thead><tr><th>When</th><th>Call</th><th>What</th><th>Result</th><th>Time</th><th>Serial</th><th>Request id</th></tr></thead><tbody>${html || '<tr><td colspan="7" class="cx-empty">No calls match.</td></tr>'}</tbody>`;
  $('[data-more]').hidden = !next;
}

async function loadCalls(more = false) {
  const q = new URLSearchParams({ ...filters, ...(more && next ? { before: next } : {}) });
  for (const [k, v] of [...q]) if (!v) q.delete(k);
  const r = await call(`/api/developer/requests?${q}${asQ}`);
  calls = more ? [...calls, ...r.rows] : r.rows;
  next = r.next;
  callRows();
}

async function load() {
  try { data = await call(`/api/developer/console?days=${days}${asQ}`); } catch (e) {
    if (e.status === 401) { $('[data-signin]').hidden = false; return; }
    $('[data-signin]').hidden = false; $('[data-signin] h2').textContent = e.message; return;
  }
  $('[data-app]').hidden = false;
  $('[data-who]').textContent = `@${data.me.handle}`;
  if (data.viewingAs) {
    $('[data-app]').dataset.readonly = '';
    const v = $('[data-viewing]');
    v.hidden = false;
    v.innerHTML = `Viewing <b>@${esc(data.me.handle)}</b>’s console as they see it. Read only, and written to the audit log. <a href="/admin">Back to admin</a>`;
  }
  hooks(data.webhooks, data.events);
  plan(data.plan, data.plans || []);
  const kn = $('[data-keynote]');
  if (kn && data.plan) kn.innerHTML = kn.innerHTML.replace(/Each key: [^.]+\./, `On ${esc(data.plan.plan.name)}: ${num(data.plan.plan.perDay)} calls a day for your whole account, shared by all your keys, and ${num(data.plan.plan.perMinute)} a minute per key.`);
  const ps = new URLSearchParams(location.search).get('plan');
  if (ps === 'welcome') { $('[data-plan]').insertAdjacentHTML('afterbegin', '<p class="cx-fresh"><b>Thanks!</b> Your new plan is on. It can take a minute to show here.</p>'); history.replaceState(null, '', location.pathname); }
  stats(data.summary);
  chart(data.summary);
  breakdown($('[data-kinds]'), data.summary.byKind);
  breakdown($('[data-formats]'), data.summary.byFormat);
  keys(data.keys);
  await loadCalls();
}

document.addEventListener('click', async (e) => {
  const t = e.target;
  const d = t.closest('[data-days]');
  if (d) { days = Number(d.dataset.days); $$('[data-days]').forEach((b) => b.setAttribute('aria-pressed', String(b === d))); return load(); }
  if (t.dataset.copy) { try { await navigator.clipboard.writeText(t.dataset.copy); t.textContent = 'Copied'; } catch { t.textContent = 'Select it'; } return; }
  if (t.dataset.revoke) {
    if (!confirm('Revoke this key? Anything using it stops working straight away. Its past calls stay in your log.')) return;
    try { await call(`/api/engine/v1/keys/${t.dataset.revoke}`, { method: 'DELETE' }); load(); } catch (err) { alert(err.message); }
    return;
  }
  if (t.dataset.rename) {
    const name = prompt('New name for this key', $(`[data-name="${t.dataset.rename}"]`)?.textContent || '');
    if (!name) return;
    try { await call(`/api/engine/v1/keys/${t.dataset.rename}`, { method: 'PATCH', body: { name } }); load(); } catch (err) { alert(err.message); }
    return;
  }
  if (t.dataset.lock) {
    const v = prompt('Lock this key to these addresses (IPs, or IPv4 ranges like 203.0.113.0/24), separated by commas. Leave empty to let it work from anywhere.', t.dataset.allow || '');
    if (v === null) return;
    try { await call(`/api/engine/v1/keys/${t.dataset.lock}`, { method: 'PATCH', body: { allowIps: v } }); load(); } catch (err) { alert(err.message); }
    return;
  }
  if (t.dataset.deliv) { try { await deliveries(t.dataset.deliv); } catch (err) { alert(err.message); } return; }
  if (t.dataset.hooktest) { try { await call(`/api/developer/webhooks/${t.dataset.hooktest}/test`, { method: 'POST' }); t.textContent = 'Sent'; setTimeout(load, 2500); } catch (err) { alert(err.message); } return; }
  if (t.dataset.hookdel) {
    if (!confirm('Remove this webhook? Nothing more will be sent to it.')) return;
    try { await call(`/api/developer/webhooks/${t.dataset.hookdel}`, { method: 'DELETE' }); load(); } catch (err) { alert(err.message); }
    return;
  }
  const pick = t.closest('[data-planpick]');
  if (pick) {
    const id = pick.dataset.planpick;
    if (id === 'free' && !confirm('Go back to the free plan at the end of this month? Your keys keep working, with the free limits.')) return;
    pick.disabled = true;
    try { const r = await call('/api/developer/plan/checkout', { method: 'POST', body: { plan: id } }); if (r.url) { location.href = r.url; return; } load(); } catch (err) { alert(err.message); pick.disabled = false; }
    return;
  }
  if (t.closest('[data-manage]')) { try { const r = await call('/api/developer/plan/manage', { method: 'POST' }); location.href = r.url; } catch (err) { alert(err.message); } return; }
  if (t.closest('[data-more]')) return loadCalls(true);
  const row = t.closest('[data-row]');
  if (row) { const det = $(`[data-detail="${row.dataset.row}"]`); det.hidden = !det.hidden; row.classList.toggle('is-open', !det.hidden); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches?.('[data-row]')) e.target.click(); });

$('[data-newkey]').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const k = await call('/api/engine/v1/keys', { method: 'POST', body: { name: e.target.name.value } });
    const box = $('[data-fresh]');
    box.hidden = false;
    box.innerHTML = `<p><b>Your new key.</b> Copy it now: it won't be shown again.</p><code class="ax-mono">${esc(k.key)}</code> <button type="button" class="ax-btn ax-btn-sm" data-copy="${esc(k.key)}">Copy</button>`;
    e.target.reset();
    load();
  } catch (err) { alert(err.message); }
});
$('[data-newhook]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    const h = await call('/api/developer/webhooks', { method: 'POST', body: { url: f.get('url'), events: f.getAll('events') } });
    const box = $('[data-hookfresh]');
    box.hidden = false;
    box.innerHTML = `<p><b>Signing secret.</b> Copy it now: it won't be shown again. Use it to check the Mint-Signature header.</p><code class="ax-mono">${esc(h.secret)}</code> <button type="button" class="ax-btn ax-btn-sm" data-copy="${esc(h.secret)}">Copy</button>`;
    e.target.url.value = '';
    load();
  } catch (err) { alert(err.message); }
});
document.addEventListener('submit', async (e) => {
  if (!e.target.matches('[data-cap]')) return;
  e.preventDefault();
  try { await call('/api/developer/plan/cap', { method: 'PUT', body: { dollars: e.target.dollars.value } }); load(); } catch (err) { alert(err.message); }
});
$('[data-filters]').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  filters = { key: f.get('key'), status: f.get('status'), q: String(f.get('q') || '').trim() };
  loadCalls();
});

load();
