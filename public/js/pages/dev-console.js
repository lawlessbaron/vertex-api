// The developer console: your keys, your usage, your plan, your webhooks, and
// every call your keys made, each with its request id, result, timing and serial.
import { $, $$, esc, num, compact, bytes, bytesText, when, whenFull, ago, pct, icon, avatar, kpi, lineChart, donut, hbars, ask, toast, commandPalette, shell } from '/js/app-ui.js';

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}
const act = async (fn, ok) => { try { const r = await fn(); if (ok) toast(ok); return r; } catch (e) { toast(e.message, { bad: true }); return null; } };

// Staff looking at a developer's console (read only): ?as=<account id>.
const as = new URLSearchParams(location.search).get('as');
const asQ = as ? `&as=${encodeURIComponent(as)}` : '';
let days = 30, data = null, calls = [], next = null, filters = {}, tab = 'overview';
const ro = () => Boolean(data?.viewingAs);
const pane = () => $('[data-pane]');
const BASE = 'https://api.mintmotive.com.au';
const money = (cents) => `$${(cents / 100).toFixed(2)}`;
const card = (title, inner, { note = '', right = '', cls = '' } = {}) => `<section class="card ${cls}"><div class="card-h"><h2>${title}</h2>${note ? `<span class="note">${note}</span>` : ''}${right ? `<div class="right">${right}</div>` : ''}</div>${inner}</section>`;
const table = (head, body, empty = 'Nothing yet.') => (body ? `<div class="tw"><table class="t"><thead><tr>${head.map((h) => (typeof h === 'string' ? `<th>${h}</th>` : `<th class="${h.c || ''}">${h.t}</th>`)).join('')}</tr></thead><tbody>${body}</tbody></table></div>` : `<div class="empty">${icon('inbox')}${empty}</div>`);
const status = (s) => `<span class="pill ${s >= 500 ? 'bad' : s >= 400 ? 'warn' : 'ok'}">${s}</span>`;
const iconBtn = (name, label, attrs, cls = '') => `<button type="button" class="icon-btn ${cls}" title="${esc(label)}" aria-label="${esc(label)}" ${attrs}>${icon(name)}</button>`;
const usedToday = () => (data?.keys || []).reduce((n, k) => n + (k.usedToday || 0), 0);
const TITLES = {
  overview: ['Overview', 'Your API, at a glance.'],
  keys: ['Keys', 'Make, name, lock and revoke your keys.'],
  calls: ['Calls', 'Every call your keys made, kept two years.'],
  webhooks: ['Webhooks', 'We tell your server when something happens.'],
  plan: ['Plan and billing', 'Your limits, this month’s use, and other plans.'],
};

function daySeries(byDay, n) {
  const map = Object.fromEntries(byDay.map((d) => [d.day, d]));
  return Array.from({ length: n }, (_, i) => new Date(Date.now() - (n - 1 - i) * 86400e3).toISOString().slice(0, 10)).map((d) => ({ day: d, calls: map[d]?.calls || 0, errors: map[d]?.errors || 0 }));
}
function meter(used, total) {
  const p = Math.min(100, total ? (used / total) * 100 : 0);
  return `<div class="hbar ${p > 90 ? 'bad' : p > 70 ? 'warn' : ''}" style="grid-template-columns:1fr"><i style="height:10px"><b style="width:${p.toFixed(1)}%"></b></i></div>`;
}

// ---------- overview ----------
function overview() {
  const s = data.summary, t = s.totals, cur = data.plan?.plan;
  const series = daySeries(s.byDay, s.days);
  const [bv, bu] = bytes(t.bytes);
  const liveKeys = data.keys.filter((k) => !k.revoked);
  const hint = liveKeys[0]?.hint || 'vx_…';
  pane().innerHTML = `
    ${cur ? card(`Today on <b>${esc(cur.name)}</b>`, `
      <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:10px"><span style="font:700 30px/1 var(--font-ui);letter-spacing:-.02em">${num(usedToday())}</span><span class="mute">of ${num(cur.perDay)} calls today, shared by your keys</span><span class="mute" style="margin-left:auto;font-size:12.5px">Resets at midnight UTC · ${num(cur.perMinute)} a minute per key</span></div>
      ${meter(usedToday(), cur.perDay)}`, { right: ro() ? '' : '<a class="btn sm ghost" href="#plan">Plan and billing</a>' }) : ''}
    <div class="kpis">
      ${kpi({ k: 'Calls', v: compact(t.calls), x: `last ${s.days} days`, spark: series.map((r) => r.calls) })}
      ${kpi({ k: 'Files made', v: compact(t.files), x: 'each with a serial', spark: series.map((r) => r.calls - r.errors) })}
      ${kpi({ k: 'Errors', v: pct(t.errors, t.calls), unit: '%', x: `${num(t.errors)} calls`, spark: series.map((r) => r.errors), bad: pct(t.errors, t.calls) > 5 })}
      ${kpi({ k: 'Typical time', v: num(t.p50), unit: 'ms', x: `95% under ${num(t.p95)} ms` })}
      ${kpi({ k: 'Downloaded', v: bv, unit: bu, x: 'files and answers' })}
    </div>
    <div class="grid g-main">
      ${card('Calls per day', '<div data-chart></div>', { right: '<span class="legend"><span><i></i>Calls</span><span><i class="err"></i>Errors</span></span>' })}
      ${card('Results', donut(s.byStatus ? s.byStatus.map((r) => ({ name: String(r.name), n: r.n })) : [{ name: 'worked', n: t.calls - t.errors }, { name: 'errors', n: t.errors }], { centre: t.calls ? `${Math.round(100 - pct(t.errors, t.calls))}%` : '—', sub: 'worked' }))}
    </div>
    <div class="grid g3">
      ${card('What you made', hbars(s.byKind))}
      ${card('Formats', donut(s.byFormat, { sub: 'files' }))}
      ${card('Quick start', `<p class="lede">Your first model in one call. Put your key where it says <span class="hint">$MINT_KEY</span>.</p><pre class="code">curl -X POST ${BASE}/engine/v1/generate \\
  -H "Authorization: Bearer $MINT_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"kind":"bin","params":{"gridX":2,"gridY":2}}' \\
  -o bin.3mf</pre><div class="toolbar" style="margin-top:12px"><a class="btn sm" href="/docs">${icon('book')}Docs</a><a class="btn sm" href="/#playground">${icon('play')}Playground</a>${liveKeys.length ? `<span class="mute" style="font-size:12.5px">Your key starts <span class="hint">${esc(hint)}</span></span>` : '<a class="btn sm primary" href="#keys">Make a key</a>'}</div>`)}
    </div>`;
  lineChart($('[data-chart]'), series);
}

// ---------- keys ----------
function keysTab() {
  const live = data.keys.filter((k) => !k.revoked), cur = data.plan?.plan;
  pane().innerHTML = (ro() ? '' : card('Make a key', `
      <form class="toolbar" data-newkey><input name="name" maxlength="60" placeholder="What it's for, e.g. Shop orders" aria-label="Key name" required style="flex:1 1 260px" /><button class="btn primary">${icon('plus')}Make a key</button></form>
      <div data-fresh></div>
      <p class="lede" style="margin:12px 0 0">${cur ? `On ${esc(cur.name)}: up to ${num(cur.keys)} keys, ${num(cur.perDay)} calls a day for your whole account, and ${num(cur.perMinute)} a minute per key.` : ''} <b>Lock</b> a key to your server's addresses and it won't work from anywhere else.</p>`))
    + card('Your keys', table(['Key', 'Made', 'Last used', { t: 'Calls', c: 'n' }, 'Today', ''], data.keys.map((k) => `
      <tr class="${k.revoked ? 'off' : ''}">
        <td><b data-name="${k.id}">${esc(k.name)}</b> <span class="hint">${esc(k.hint || 'vx_…')}</span>${k.revoked ? ' <span class="pill bad">revoked</span>' : ''}<div style="margin-top:5px">${k.allowIps ? `<span class="pill info" title="${esc(k.allowIps)}">locked to ${k.allowIps.split(',').length} address${k.allowIps.split(',').length > 1 ? 'es' : ''}</span>` : '<span class="pill plain">any address</span>'}${k.dayCap || k.monthCap ? ` <span class="pill info">${[k.dayCap ? `${k.dayCap.toLocaleString()} a day` : '', k.monthCap ? `$${k.monthCap} extra a month` : ''].filter(Boolean).join(' · ')}</span>` : ''}</div></td>
        <td>${ago(k.createdAt)}</td><td>${ago(k.lastUsedAt)}</td><td class="n">${num(k.calls)}</td>
        <td style="min-width:140px">${k.revoked ? '—' : `<div class="hbar" style="grid-template-columns:1fr auto"><i><b style="width:${Math.min(100, (k.usedToday / Math.max(1, cur?.perDay || 1000)) * 100).toFixed(1)}%"></b></i><em>${num(k.usedToday)}</em></div>`}</td>
        <td class="n">${k.revoked || ro() ? '' : `<span class="acts">${iconBtn('list', 'Calls', `data-fkey="${k.id}"`)}${iconBtn('lock', 'Lock to addresses', `data-lock="${k.id}" data-allow="${esc(k.allowIps || '')}"`)}${iconBtn('gauge', 'Limits', `data-limits="${k.id}" data-day="${k.dayCap ?? ''}" data-month="${k.monthCap ?? ''}"`)}${iconBtn('cog', 'Rename', `data-rename="${k.id}"`)}${iconBtn('x', 'Revoke', `data-revoke="${k.id}"`, 'bad')}</span>`}</td>
      </tr>`).join(''), 'No keys yet. Make one above.'), { cls: 'flush', note: `${live.length} live · revoked keys stay listed so old calls still show which key made them` });
}

// ---------- calls ----------
function callsTab() {
  pane().innerHTML = card('Every call', `
    <form class="toolbar" data-filters>
      <label class="search-in">${icon('trace')}<input name="q" placeholder="Request id, serial or path" aria-label="Search" value="${esc(filters.q || '')}" /></label>
      <select name="key" aria-label="Key"><option value="">All keys</option>${data.keys.map((k) => `<option value="${k.id}" ${String(filters.key) === String(k.id) ? 'selected' : ''}>${esc(k.name)}${k.revoked ? ' (revoked)' : ''}</option>`).join('')}</select>
      <select name="status" aria-label="Result"><option value="">Any result</option><option value="ok">Worked</option><option value="error">Errors</option></select>
      <button class="btn primary sm">Find</button>
    </form>
    <div class="tw" style="margin-top:14px"><table class="t" data-calls></table></div>
    <div style="padding:14px 0 0;text-align:center"><button type="button" class="btn sm" data-more hidden>Older calls</button></div>`);
  if (filters.status) $('[data-filters] [name=status]').value = filters.status;
  loadCalls();
}
function callRows() {
  $('[data-calls]').innerHTML = `<thead><tr><th>When</th><th>Call</th><th>Made</th><th>Result</th><th class="n">Time</th><th>Serial</th><th>Request id</th></tr></thead><tbody>${calls.map((r) => `
    <tr class="row" data-row="${r.id}" tabindex="0">
      <td style="white-space:nowrap">${when(r.at)}</td>
      <td class="mono" style="font-size:12.5px"><b>${esc(r.method)}</b> ${esc(r.path.replace('/api', ''))}</td>
      <td>${esc([r.kind, r.format].filter(Boolean).join(' · ') || '—')}</td>
      <td>${status(r.status)}</td><td class="n">${num(r.ms)} ms</td>
      <td class="mono" style="font-size:12px">${esc(r.serial || '—')}</td><td class="mono mute" style="font-size:12px">${esc(r.requestId)}</td>
    </tr>
    <tr class="det" data-detail="${r.id}" hidden><td colspan="7"><div class="grid g2" style="gap:14px"><dl class="kv">
      <dt>Request id</dt><dd class="mono">${esc(r.requestId)} ${iconBtn('copy', 'Copy', `data-copy="${esc(r.requestId)}"`)}</dd>
      <dt>When</dt><dd>${whenFull(r.at)}</dd>
      <dt>Key</dt><dd>${esc(r.key?.name || '—')} <span class="hint">${esc(r.key?.hint || '')}</span></dd>
      <dt>Size</dt><dd>${bytesText(r.bytes)}</dd>
      ${r.serial ? `<dt>Serial</dt><dd class="mono">${esc(r.serial)} ${iconBtn('copy', 'Copy', `data-copy="${esc(r.serial)}"`)}</dd>` : ''}
      ${r.error ? `<dt>Error you got</dt><dd style="color:#ffb3c0">${esc(r.error)}</dd>` : ''}
    </dl>${r.params ? `<pre class="code">${esc(JSON.stringify(r.params, null, 2))}</pre>` : ''}</div></td></tr>`).join('') || '<tr><td colspan="7"><div class="empty">No calls match.</div></td></tr>'}</tbody>`;
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

// ---------- webhooks ----------
function webhooksTab() {
  pane().innerHTML = (ro() ? '' : card('Add a webhook', `
      <form class="grid" style="gap:12px" data-newhook>
        <div class="toolbar"><input name="url" type="url" placeholder="https://your-server.example/mint-hooks" aria-label="Webhook address" required style="flex:1 1 320px" /><button class="btn primary">${icon('plus')}Add webhook</button></div>
        <div class="toolbar">${Object.entries(data.events).map(([k, v]) => `<label class="switch" title="${esc(v)}"><input type="checkbox" name="events" value="${esc(k)}" checked /> <span class="mono" style="font-size:12.5px">${esc(k)}</span></label>`).join('')}</div>
      </form>
      <div data-hookfresh></div>
      <p class="lede" style="margin:12px 0 0">We POST signed JSON when a key nears or hits its daily limit, or a key is made or revoked. Anything but a 2xx is tried again for about 9 hours. <a href="/docs#webhooks">How to check the signature</a></p>`))
    + card('Your webhooks', table(['Address', 'Events', { t: 'Delivered', c: 'n' }, { t: 'Failed', c: 'n' }, 'Last delivered', ''], data.webhooks.map((h) => `
      <tr class="${h.disabled ? 'off' : ''}"><td class="mono" style="font-size:12.5px">${esc(h.url)}${h.disabled ? ' <span class="pill bad">removed</span>' : ''}</td>
      <td>${h.events.map((e) => `<span class="pill plain">${esc(e)}</span>`).join(' ')}</td><td class="n">${num(h.delivered)}</td><td class="n">${h.failed ? `<span class="pill bad">${num(h.failed)}</span>` : '0'}</td><td>${ago(h.lastDeliveredAt)}</td>
      <td class="n"><span class="acts">${iconBtn('list', 'Deliveries', `data-deliv="${h.id}"`)}${h.disabled || ro() ? '' : `${iconBtn('play', 'Send a test', `data-hooktest="${h.id}"`)}${iconBtn('x', 'Remove', `data-hookdel="${h.id}"`, 'bad')}`}</span></td></tr>
      <tr class="det" data-delivfor="${h.id}" hidden><td colspan="6"></td></tr>`).join(''), 'No webhooks yet.'), { cls: 'flush' });
}
async function deliveries(id) {
  const row = $(`[data-delivfor="${id}"]`);
  if (!row.hidden) { row.hidden = true; return; }
  const r = await call(`/api/developer/webhooks/${id}/deliveries?x=1${asQ}`);
  row.hidden = false;
  row.firstElementChild.innerHTML = r.deliveries.length ? `<table class="t"><thead><tr><th>When</th><th>Event</th><th>Result</th><th class="n">Tries</th><th>Answer</th><th>Next try</th></tr></thead><tbody>${r.deliveries.map((d) => `
    <tr><td>${when(d.createdAt)}</td><td class="mono" style="font-size:12.5px">${esc(d.event)}</td><td><span class="pill ${d.status === 'delivered' ? 'ok' : d.status === 'failed' ? 'bad' : 'warn'}">${esc(d.status)}</span></td><td class="n">${d.attempts}</td><td>${esc(d.code ? `HTTP ${d.code}` : '')} ${d.error ? `<span style="color:#ffb3c0">${esc(d.error)}</span>` : ''}</td><td>${d.nextAt ? when(d.nextAt) : '—'}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Nothing sent yet.</div>';
}

// ---------- plan ----------
function planTab() {
  const p = data.plan, list = data.plans || [];
  if (!p) { pane().innerHTML = card('Plan', '<div class="empty">Plans aren’t open yet.</div>'); return; }
  const cur = p.plan, sub = p.sub;
  const paying = sub?.live && sub.provider === 'stripe', extra = cur.overagePer1000 > 0;
  pane().innerHTML = `
    <div class="kpis">
      ${kpi({ k: 'Your plan', v: esc(cur.name), x: cur.monthly ? `$${cur.monthly} a month` : 'Free, no card needed' })}
      ${kpi({ k: 'Today', v: num(usedToday()), unit: ` / ${compact(cur.perDay)}`, x: 'calls, shared by your keys' })}
      ${kpi({ k: 'This month', v: compact(p.month.calls), x: 'files and part lists' })}
      ${kpi({ k: 'Extra use', v: extra ? money(p.month.overCents) : '—', x: extra ? `${num(p.month.overCalls)} calls past the allowance` : 'Stops at the day’s allowance' })}
      ${kpi({ k: sub?.cancelAtPeriodEnd ? 'Ends' : paying ? 'Renews' : sub?.provider === 'manual' ? 'Given by us until' : 'Billing', v: sub?.periodEnd ? new Date(sub.periodEnd).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '—', x: paying ? 'by card' : '' })}
    </div>
    ${extra && !ro() ? card('Cap your extra use', `<form class="toolbar" data-cap><span>Stop extra use at $</span><input name="dollars" type="number" min="0" step="1" value="${p.ownCap != null ? Math.round(p.ownCap / 100) : ''}" placeholder="${Math.round(p.cap / 100)}" aria-label="Monthly limit for extra use, dollars" style="width:110px" /><span>a month</span><button class="btn sm primary">Save</button></form><p class="lede" style="margin:10px 0 0">Past it, calls stop until the 1st. Empty: the plan's $${Math.round(cur.overageCap || 0)}.</p>`, { right: paying ? '<button type="button" class="btn sm" data-manage>Billing and invoices</button>' : '' }) : paying && !ro() ? card('Billing', '<p class="lede" style="margin:0">Invoices, your card and receipts are in the billing portal.</p>', { right: '<button type="button" class="btn sm" data-manage>Billing and invoices</button>' }) : ''}
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(230px,1fr))">${list.map((x) => `
      <article class="card" style="${x.id === cur.id ? 'border-color:var(--mint);box-shadow:0 0 0 1px var(--mint) inset' : ''}">
        <div class="card-h"><h2>${esc(x.name)}</h2>${x.id === cur.id ? '<span class="pill ok">your plan</span>' : x.invite ? '<span class="pill info">apply</span>' : ''}</div>
        <p style="margin:0 0 6px;font:700 28px/1 var(--font-ui);letter-spacing:-.02em">${x.monthly ? `$${x.monthly}<small class="mute" style="font-size:14px;font-weight:500"> /month</small>` : 'Free'}</p>
        <p class="lede" style="margin:8px 0 12px">${esc(x.blurb)}</p>
        <ul style="margin:0 0 16px;padding:0;list-style:none;display:grid;gap:7px;font-size:13.5px">${[`${num(x.perDay)} calls a day`, `${num(x.perMinute)} a minute per key`, `${num(x.keys)} keys`, ...x.perks].map((t) => `<li style="display:flex;gap:8px"><span style="color:var(--mint);width:16px;flex:none">${icon('check')}</span>${esc(t)}</li>`).join('')}</ul>
        ${ro() ? '' : x.id === cur.id ? '' : x.id === 'free' ? (paying ? '<button type="button" class="btn sm ghost" data-planpick="free">Back to free at month end</button>' : '') : x.invite && !(p.invited || []).includes(x.id) ? '<a class="btn sm" href="/education">Apply</a>' : `<button type="button" class="btn sm primary" data-planpick="${esc(x.id)}" ${p.checkout ? '' : 'disabled'}>${p.checkout ? (paying ? `Switch to ${esc(x.name)}` : `Choose ${esc(x.name)}`) : 'Opening soon'}</button>`}
      </article>`).join('')}</div>`;
}

// ---------- routing ----------
const TABS = { overview, keys: keysTab, calls: callsTab, webhooks: webhooksTab, plan: planTab };
function show(name = tab) {
  tab = TABS[name] ? name : 'overview';
  $$('[data-tabs] a').forEach((a) => a.setAttribute('aria-current', String(a.getAttribute('href') === `#${tab}`)));
  const [t, sub] = TITLES[tab];
  $('[data-title]').textContent = t; $('[data-sub]').textContent = sub;
  $('[data-periods]').hidden = tab !== 'overview';
  $('[data-newkeybtn]').hidden = ro() || tab === 'keys';
  document.title = `${t} · Console · Mint Motive API`;
  try { TABS[tab](); } catch (e) { pane().innerHTML = `<div class="card"><div class="empty">${esc(e.message)}</div></div>`; }
}
async function load(keepTab = true) {
  try { data = await call(`/api/developer/console?days=${days}${asQ}`); } catch (e) {
    document.body.classList.add('gated');
    $('[data-signin]').hidden = false;
    if (e.status !== 401) $('[data-signin] h1').textContent = e.message;
    return false;
  }
  $('[data-me]').innerHTML = `${avatar(data.me.handle)}<div class="who"><b>@${esc(data.me.handle)}</b><span>${esc(data.plan?.plan?.name || 'Maker')} plan</span></div>`;
  const kc = $('[data-keycount]'), live = data.keys.filter((k) => !k.revoked).length;
  kc.hidden = !live; kc.textContent = live;
  if (data.viewingAs) {
    const v = $('[data-viewing]');
    v.hidden = false;
    v.innerHTML = `<div class="card alert" style="display:flex;align-items:center;gap:12px">${icon('eye')}<span>Viewing <b>@${esc(data.me.handle)}</b>’s console as they see it. Read only, and written to the audit log.</span><a class="btn sm" href="/admin" style="margin-left:auto">Back to admin</a></div>`;
  }
  if (new URLSearchParams(location.search).get('plan') === 'welcome') { toast('Thanks! Your new plan is on. It can take a minute to show.'); history.replaceState(null, '', location.pathname + location.hash); }
  if (keepTab) show();
  return true;
}

document.addEventListener('click', async (e) => {
  const d = e.target.closest('[data-days]');
  if (d) { days = Number(d.dataset.days); $$('[data-days]').forEach((b) => b.setAttribute('aria-pressed', String(b === d))); return load(); }
  const el = e.target.closest('[data-copy],[data-revoke],[data-rename],[data-lock],[data-deliv],[data-hooktest],[data-hookdel],[data-planpick],[data-manage],[data-more],[data-fkey]');
  if (el) {
    const ds = el.dataset;
    if (ds.copy) { try { await navigator.clipboard.writeText(ds.copy); toast('Copied'); } catch { toast('Select it and copy'); } return; }
    if (ds.fkey) { filters = { key: ds.fkey }; location.hash = 'calls'; return; }
    if (ds.revoke) {
      if (!(await ask({ title: 'Revoke this key?', body: 'Anything using it stops working straight away. Its past calls stay in your log.', ok: 'Revoke', danger: true }))) return;
      if (await act(() => call(`/api/engine/v1/keys/${ds.revoke}`, { method: 'DELETE' }), 'Key revoked')) load();
      return;
    }
    if (ds.rename) {
      const name = await ask({ title: 'Rename this key', input: { value: $(`[data-name="${ds.rename}"]`)?.textContent || '', required: true }, ok: 'Save' });
      if (!name) return;
      if (await act(() => call(`/api/engine/v1/keys/${ds.rename}`, { method: 'PATCH', body: { name } }), 'Renamed')) load();
      return;
    }
    if (ds.limits) {
      const day = await ask({ title: 'This key\'s limits (1 of 2)', body: 'Most calls this key may make in a day. Empty: only your plan\'s limit.', input: { value: ds.day || '', placeholder: 'e.g. 500' }, ok: 'Next' });
      if (day === null) return;
      const month = await ask({ title: 'This key\'s limits (2 of 2)', body: 'Most this key may spend on extra use (past your plan\'s daily allowance) in a month, in dollars. Empty: only your account\'s limit.', input: { value: ds.month || '', placeholder: 'e.g. 20' }, ok: 'Save' });
      if (month === null) return;
      if (await act(() => call(`/api/engine/v1/keys/${ds.limits}`, { method: 'PATCH', body: { dayCap: day, monthCap: month } }), 'Saved')) load();
      return;
    }
    if (ds.lock) {
      const v = await ask({ title: 'Lock to your addresses', body: 'Only allow this key from these addresses (IPs, or IPv4 ranges like 203.0.113.0/24), separated by commas. Empty: it works from anywhere.', input: { value: ds.allow || '', placeholder: '203.0.113.7, 198.51.100.0/24' }, ok: 'Save' });
      if (v === null) return;
      if (await act(() => call(`/api/engine/v1/keys/${ds.lock}`, { method: 'PATCH', body: { allowIps: v } }), 'Saved')) load();
      return;
    }
    if (ds.deliv) return act(() => deliveries(ds.deliv));
    if (ds.hooktest) { if (await act(() => call(`/api/developer/webhooks/${ds.hooktest}/test`, { method: 'POST' }), 'Test sent')) setTimeout(load, 2500); return; }
    if (ds.hookdel) {
      if (!(await ask({ title: 'Remove this webhook?', body: 'Nothing more will be sent to it.', ok: 'Remove', danger: true }))) return;
      if (await act(() => call(`/api/developer/webhooks/${ds.hookdel}`, { method: 'DELETE' }), 'Removed')) load();
      return;
    }
    if (ds.planpick) {
      const id = ds.planpick;
      if (id === 'free' && !(await ask({ title: 'Back to free?', body: 'At the end of this month. Your keys keep working, with the free limits.', ok: 'Go back to free' }))) return;
      el.disabled = true;
      const r = await act(() => call('/api/developer/plan/checkout', { method: 'POST', body: { plan: id } }));
      if (r?.url) { location.href = r.url; return; }
      el.disabled = false; if (r) load();
      return;
    }
    if ('manage' in ds) { const r = await act(() => call('/api/developer/plan/manage', { method: 'POST' })); if (r?.url) location.href = r.url; return; }
    if ('more' in ds) return loadCalls(true);
  }
  const row = e.target.closest('[data-row]');
  if (row && !e.target.closest('button, a')) { const det = $(`[data-detail="${row.dataset.row}"]`); det.hidden = !det.hidden; row.classList.toggle('open', !det.hidden); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches?.('[data-row]')) e.target.click(); });
document.addEventListener('submit', async (e) => {
  const f = e.target;
  if (f.method === 'dialog') return;
  e.preventDefault();
  if (f.matches('[data-newkey]')) {
    const k = await act(() => call('/api/engine/v1/keys', { method: 'POST', body: { name: f.name.value } }));
    if (!k) return;
    await load(false); keysTab();
    $('[data-fresh]').innerHTML = `<div class="card" style="margin-top:14px;border-color:var(--mint)"><p style="margin:0 0 8px"><b>Your new key.</b> Copy it now: it won't be shown again.</p><div class="toolbar"><pre class="code" style="flex:1">${esc(k.key)}</pre><button type="button" class="btn primary" data-copy="${esc(k.key)}">${icon('copy')}Copy</button></div></div>`;
    return;
  }
  if (f.matches('[data-newhook]')) {
    const d = new FormData(f);
    const h = await act(() => call('/api/developer/webhooks', { method: 'POST', body: { url: d.get('url'), events: d.getAll('events') } }));
    if (!h) return;
    await load(false); webhooksTab();
    $('[data-hookfresh]').innerHTML = `<div class="card" style="margin-top:14px;border-color:var(--mint)"><p style="margin:0 0 8px"><b>Signing secret.</b> Copy it now: it won't be shown again. Use it to check the Mint-Signature header.</p><div class="toolbar"><pre class="code" style="flex:1">${esc(h.secret)}</pre><button type="button" class="btn primary" data-copy="${esc(h.secret)}">${icon('copy')}Copy</button></div></div>`;
    return;
  }
  if (f.matches('[data-cap]')) { if (await act(() => call('/api/developer/plan/cap', { method: 'PUT', body: { dollars: f.dollars.value } }), 'Saved')) load(); return; }
  if (f.matches('[data-filters]')) { const d = new FormData(f); filters = { key: d.get('key'), status: d.get('status'), q: String(d.get('q') || '').trim() }; loadCalls(); }
});
window.addEventListener('hashchange', () => show(location.hash.slice(1)));

async function liveState() {
  try {
    const s = await call('/api/status');
    $('[data-live]').className = `live ${s.overall === 'operational' ? '' : /degraded|partial/.test(s.overall) ? 'warn' : 'bad'}`;
    $('[data-state]').textContent = s.overall === 'operational' ? 'All systems normal' : s.overall;
  } catch { $('[data-state]').textContent = 'Status unknown'; }
}

(async () => {
  shell();
  tab = location.hash.slice(1) || 'overview';
  if (!(await load())) return;
  const open = commandPalette([
    ...Object.entries(TITLES).map(([k, [t, sub]]) => ({ group: 'Go to', label: t, hint: sub, icon: { overview: 'overview', keys: 'key', calls: 'calls', webhooks: 'hook', plan: 'card' }[k], run: () => { location.hash = k; } })),
    { group: 'Build', label: 'Docs', icon: 'book', run: () => { location.href = '/docs'; } },
    { group: 'Build', label: 'Playground', icon: 'play', run: () => { location.href = '/#playground'; } },
    { group: 'Build', label: 'Status', icon: 'pulse', run: () => { location.href = '/status'; } },
  ], (q) => (q.length > 2 ? [{ group: 'Find', label: `Search your calls for “${q}”`, icon: 'calls', run: () => { filters = { q }; location.hash = 'calls'; if (tab === 'calls') callsTab(); } }] : []));
  $('[data-cmdk]').addEventListener('click', open);
  liveState(); setInterval(liveState, 60e3);
})();
