// Shared pieces for API admin and the developer console: formatting, icons,
// KPI cards with sparklines, a line chart with a hover readout, donuts, bars,
// a styled confirm/prompt dialog, toasts and the ⌘K command palette.
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- formatting (Australian English, everywhere) ----------
const LOC = 'en-AU';
export const num = (n) => Number(n || 0).toLocaleString(LOC);
export const compact = (n) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : Math.abs(n) >= 1e4 ? `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}k` : num(n));
export function bytes(b) {
  b = Number(b) || 0;
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return [b >= 100 || i === 0 ? Math.round(b) : b.toFixed(1), u[i]];
}
export const bytesText = (b) => bytes(b).join(' ');
export const when = (t) => (t ? new Date(t).toLocaleString(LOC, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');
export const whenFull = (t) => (t ? new Date(t).toLocaleString(LOC, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '—');
export const day = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(LOC, { day: 'numeric', month: 'short' });
export function ago(t) {
  if (!t) return 'never';
  const s = (Date.now() - t) / 1000;
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString(LOC, { day: 'numeric', month: 'short', year: 'numeric' });
}
export const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

// ---------- icons (one stroke set, 24×24) ----------
const P = {
  overview: '<path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z"/>',
  alert: '<path d="M12 3 2 20h20L12 3zM12 10v4M12 17h.01"/>',
  calls: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  trace: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.3-4.3"/>',
  speed: '<path d="M12 14 16 9M4 18a9 9 0 1 1 16 0"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l3 3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 21a6 6 0 0 0-4-5.6"/>',
  hook: '<path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2M6 17l3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06M12 6l3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  school: '<path d="m2 9 10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1zM16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM20 17v4H6.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  download: '<path d="M12 3v12m0 0-4-4m4 4 4-4M4 21h16"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  play: '<path d="m7 4 13 8-13 8z"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
  chart: '<path d="M3 3v18h18M7 15l4-4 3 3 6-6"/>',
  gauge: '<path d="M12 14l4-4M3.5 17a9 9 0 1 1 17 0"/><circle cx="12" cy="14" r="1.5"/>',
};
export const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;

// ---------- avatar: the same colour for the same person ----------
const AV = ['#9ec4b5', '#d9c09a', '#8aa4ff', '#f0a3c3', '#b6e08f', '#f2c36b', '#7fd6e8', '#c7a6ff'];
export function avatar(name, cls = '') {
  const s = String(name || '?');
  let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `<span class="avatar ${cls}" style="--av:${AV[h % AV.length]}">${esc(s.replace(/^@/, '').slice(0, 1).toUpperCase())}</span>`;
}

// ---------- KPI card ----------
// delta: change against the period before, as a fraction (0.12 = 12% up). good: which direction is good.
export function kpi({ k, v, unit = '', x = '', delta = null, good = 'up', spark = null, bad = false }) {
  let d = '';
  if (delta != null && Number.isFinite(delta)) {
    const p = Math.round(delta * 1000) / 10, dir = p > 0.4 ? 'up' : p < -0.4 ? 'down' : 'flat';
    const tone = dir === 'flat' ? 'flat' : (dir === good ? 'up' : 'down');
    d = `<span class="delta ${tone}">${dir === 'up' ? '▲' : dir === 'down' ? '▼' : '•'} ${Math.abs(p)}%</span>`;
  }
  return `<div class="kpi ${bad ? 'bad' : ''}"><p class="k">${esc(k)}</p><p class="v">${v}${unit ? `<small>${esc(unit)}</small>` : ''}</p><div class="x">${d}<span>${x}</span></div>${spark ? sparkline(spark) : ''}</div>`;
}
export function sparkline(values) {
  const v = values.length > 1 ? values : [0, ...values, 0];
  const max = Math.max(1, ...v), W = 100, H = 30;
  const pts = v.map((y, i) => [(i / (v.length - 1)) * W, H - 2 - (y / max) * (H - 4)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join('');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="sparkfill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--mint)" stop-opacity=".28"/><stop offset="1" stop-color="var(--mint)" stop-opacity="0"/></linearGradient></defs><path class="a" d="${d}L${W},${H}L0,${H}Z"/><path class="l" d="${d}"/></svg>`;
}

// ---------- line chart with a hover readout ----------
// series: [{ day: 'YYYY-MM-DD', calls, errors }]
export function lineChart(el, series, { label = 'Calls', errLabel = 'Errors', second = 'bars' } = {}) {
  if (!series.length || !series.some((r) => r.calls)) { el.innerHTML = `<div class="empty">${icon('chart')}No calls in this period.</div>`; return; }
  const W = 1000, H = 260, L = 44, R = 10, T = 12, B = 26;
  const max = niceMax(Math.max(...series.map((r) => r.calls)));
  const x = (i) => L + (i / Math.max(1, series.length - 1)) * (W - L - R);
  const y = (v) => T + (1 - v / max) * (H - T - B);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  const line = series.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(r.calls).toFixed(1)}`).join('');
  const bw = Math.max(2, Math.min(10, ((W - L - R) / series.length) * 0.5));
  const labelsEvery = Math.ceil(series.length / 7);
  el.innerHTML = `<div class="chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(label)} per day">
      ${ticks.map((t) => `<line class="gl" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="yl" x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${compact(t)}</text>`).join('')}
      <path class="area" d="${line}L${x(series.length - 1)},${y(0)}L${x(0)},${y(0)}Z"/>
      ${second === 'line' ? `<path class="line2" d="${series.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(r.errors).toFixed(1)}`).join('')}"/>` : series.map((r, i) => (r.errors ? `<rect class="eb" x="${x(i) - bw / 2}" y="${y(r.errors)}" width="${bw}" height="${Math.max(1.5, y(0) - y(r.errors))}" rx="1.5"/>` : '')).join('')}
      <path class="line" d="${line}"/>
      ${series.map((r, i) => (i % labelsEvery === 0 || i === series.length - 1 ? `<text class="xl" x="${x(i)}" y="${H - 6}" text-anchor="middle">${day(r.day)}</text>` : '')).join('')}
      <line class="cross" data-cross x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
      <circle class="dot" data-dotp r="4.5" visibility="hidden"/>
    </svg><div class="tip" data-tip hidden></div></div>`;
  const svg = $('svg', el), tip = $('[data-tip]', el), cross = $('[data-cross]', el), dot = $('[data-dotp]', el);
  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const sx = ((ev.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(series.length - 1, Math.round(((sx - L) / (W - L - R)) * (series.length - 1))));
    const s = series[i];
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(s.calls)); dot.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.style.left = `${(x(i) / W) * r.width}px`; tip.style.top = `${(y(s.calls) / H) * r.height}px`;
    tip.innerHTML = `<b>${new Date(`${s.day}T00:00:00`).toLocaleDateString(LOC, { weekday: 'short', day: 'numeric', month: 'short' })}</b><span><i></i>${esc(label)}<em>${num(s.calls)}</em></span><span><i class="${second === 'line' ? 'b2' : 'err'}"></i>${esc(errLabel)}<em>${num(s.errors)}${second === 'line' ? '' : ` · ${pct(s.errors, s.calls)}%`}</em></span>`;
  };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); });
}
function niceMax(v) {
  if (v <= 5) return 5;
  const p = 10 ** Math.floor(Math.log10(v)), m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

// ---------- donut + key ----------
const DONUT = ['var(--mint)', 'var(--accent-3)', '#8aa4ff', '#f2c36b', '#f0a3c3', '#7fd6e8'];
export function donut(list, { centre = '', sub = '' } = {}) {
  const total = list.reduce((s, r) => s + r.n, 0);
  if (!total) return `<div class="empty">Nothing yet.</div>`;
  const R = 50, C = 2 * Math.PI * R;
  let at = 0;
  const arcs = list.slice(0, 6).map((r, i) => {
    const len = (r.n / total) * C, gap = list.length > 1 ? 2 : 0;
    const s = `<circle r="${R}" cx="66" cy="66" stroke="${DONUT[i]}" stroke-dasharray="${Math.max(0, len - gap)} ${C}" stroke-dashoffset="${-at}" transform="rotate(-90 66 66)"/>`;
    at += len; return s;
  }).join('');
  return `<div class="donut-wrap"><svg class="donut" viewBox="0 0 132 132" role="img" aria-label="${esc(sub)}"><circle r="${R}" cx="66" cy="66" stroke="color-mix(in srgb, var(--ink) 6%, transparent)"/>${arcs}<text x="66" y="68">${esc(centre || compact(total))}</text><text class="s" x="66" y="84">${esc(sub)}</text></svg>
    <div class="keys-list">${list.slice(0, 6).map((r, i) => `<div><i style="background:${DONUT[i]}"></i>${esc(r.name)}<em>${pct(r.n, total)}%</em></div>`).join('')}</div></div>`;
}
export function hbars(list, { tone = () => '' } = {}) {
  if (!list.length) return '<div class="empty">Nothing yet.</div>';
  const max = Math.max(1, ...list.map((r) => r.n));
  return `<div class="hbars">${list.map((r) => `<div class="hbar ${tone(r)}"><span title="${esc(r.name)}">${esc(r.name)}</span><i><b style="width:${((r.n / max) * 100).toFixed(1)}%"></b></i><em>${num(r.n)}</em></div>`).join('')}</div>`;
}

// ---------- dialogs and toasts ----------
let dlg;
function dialog() {
  if (dlg) return dlg;
  dlg = document.createElement('dialog');
  dlg.className = 'dlg';
  document.body.append(dlg);
  return dlg;
}
// ask({ title, body, input: { placeholder, value } | null, ok: 'Revoke', danger: true }) → string | true | null
export function ask({ title, body = '', input = null, ok = 'OK', danger = false, cancel = 'Cancel' }) {
  const d = dialog();
  d.innerHTML = `<form method="dialog"><h3>${esc(title)}</h3>${body ? `<p>${body}</p>` : ''}${input ? `<input name="v" value="${esc(input.value || '')}" placeholder="${esc(input.placeholder || '')}" ${input.required ? 'required' : ''} autocomplete="off" />` : ''}
    <div class="acts" style="justify-content:flex-end"><button class="btn ghost" value="cancel" formnovalidate>${esc(cancel)}</button><button class="btn ${danger ? 'danger' : 'primary'}" value="ok">${esc(ok)}</button></div></form>`;
  return new Promise((resolve) => {
    d.onclose = () => resolve(d.returnValue === 'ok' ? (input ? d.querySelector('[name=v]').value : true) : null);
    d.showModal();
    (d.querySelector('[name=v]') || d.querySelector('.btn:not(.ghost)')).focus();
  });
}
let toastBox;
export function toast(text, { bad = false } = {}) {
  if (!toastBox) { toastBox = document.createElement('div'); toastBox.className = 'toasts'; toastBox.setAttribute('aria-live', 'polite'); document.body.append(toastBox); }
  const t = document.createElement('div');
  t.className = `toast ${bad ? 'bad' : ''}`;
  t.innerHTML = `<i></i>${esc(text)}`;
  toastBox.append(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3200);
}

// ---------- command palette ----------
// items: [{ group, label, hint, icon, run }]; dynamic(q) → more items for what was typed.
export function commandPalette(items, dynamic = () => []) {
  const d = document.createElement('dialog');
  d.className = 'cmdk';
  d.innerHTML = '<input type="search" placeholder="Jump to a page, or paste a serial, request id or IP…" aria-label="Command" autocomplete="off" /><ul role="listbox"></ul>';
  document.body.append(d);
  const input = $('input', d), ul = $('ul', d);
  let list = [], sel = 0;
  const render = () => {
    const q = input.value.trim().toLowerCase();
    list = [...dynamic(input.value.trim()), ...items.filter((i) => !q || `${i.label} ${i.hint || ''} ${i.group}`.toLowerCase().includes(q))];
    sel = Math.min(sel, Math.max(0, list.length - 1));
    let g = '';
    ul.innerHTML = list.map((i, n) => `${i.group !== g ? `<li class="grp">${esc((g = i.group))}</li>` : ''}<li role="option" data-n="${n}" aria-selected="${n === sel}">${icon(i.icon || 'list')}${esc(i.label)}${i.hint ? `<small>${esc(i.hint)}</small>` : ''}</li>`).join('') || '<li class="grp">Nothing matches</li>';
  };
  const go = (n) => { const i = list[n]; if (!i) return; d.close(); i.run(); };
  input.addEventListener('input', () => { sel = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { sel = Math.min(list.length - 1, sel + 1); render(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); render(); e.preventDefault(); }
    if (e.key === 'Enter') { go(sel); e.preventDefault(); }
  });
  ul.addEventListener('click', (e) => { const li = e.target.closest('[data-n]'); if (li) go(Number(li.dataset.n)); });
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  const open = () => { input.value = ''; sel = 0; render(); d.showModal(); input.focus(); };
  document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); d.open ? d.close() : open(); } });
  return open;
}

// ---------- the shell: sidebar on small screens ----------
export function shell() {
  const app = $('.app');
  $('[data-menu]')?.addEventListener('click', () => app.classList.toggle('nav-open'));
  $('.side')?.addEventListener('click', (e) => { if (e.target.closest('a')) app.classList.remove('nav-open'); });
  $$('[data-icon]').forEach((el) => { el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)); });
}
