// The API status page: what's working now, 90 days of history per part, and incidents.
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const when = (t) => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const dayName = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const LABEL = { operational: 'Working', degraded: 'Slow or some errors', partial: 'Partly down', outage: 'Down', nodata: 'No data', off: 'Not open yet', maintenance: 'Maintenance' };
const HEADLINE = { operational: 'Everything is working', degraded: 'Some things are slow', partial: 'Part of the API is down', outage: 'The API is down', maintenance: 'Maintenance under way' };
const COLOUR = { operational: '#5fe07a', degraded: '#f2cf6a', partial: '#f6a06a', outage: '#ff7b72', maintenance: '#8ab8ff' };
const IMPACT = { minor: 'degraded', major: 'partial', critical: 'outage' };

function incident(i, open) {
  return `<article class="st-inc ${IMPACT[i.impact] || 'degraded'}" id="incident-${i.id}">
    <h2>${esc(i.title)}</h2>
    <p class="st-meta">${esc(i.impact)} impact · affects ${i.components.map(esc).join(', ')} · ${open ? `since ${when(i.createdAt)}` : `${when(i.createdAt)} to ${when(i.resolvedAt)}`}</p>
    <ul class="st-updates">${i.updates.map((u) => `<li><time>${when(u.at)}</time><span><b>${esc(u.status)}</b>: ${esc(u.body)}</span></li>`).join('')}</ul>
  </article>`;
}

let tip;
function showTip(e) {
  const b = e.target.closest('[data-day]');
  if (!b) { tip?.remove(); tip = null; return; }
  if (!tip) { tip = document.createElement('div'); tip.className = 'st-tip'; document.body.append(tip); }
  const [day, state, ok, total] = b.dataset.day.split('|');
  tip.textContent = `${dayName(day)}: ${LABEL[state]}${Number(total) ? ` (${ok} of ${total} checks and calls fine)` : ''}`;
  tip.style.left = `${Math.min(innerWidth - tip.offsetWidth - 8, e.clientX + 12)}px`;
  tip.style.top = `${e.clientY + 16}px`;
}

async function load() {
  let s;
  try { s = await (await fetch('/api/status', { headers: { Accept: 'application/json' } })).json(); } catch { $('[data-headline]').textContent = 'The status page can’t reach the API'; return; }
  const h = $('[data-headline]');
  h.innerHTML = `<i></i>${esc(HEADLINE[s.overall] || HEADLINE.operational)}`;
  h.style.setProperty('--st', COLOUR[s.overall] || COLOUR.operational);
  $('[data-updated]').textContent = `Updated ${when(s.updatedAt)}. This page refreshes itself every minute.`;
  $('[data-active]').innerHTML = s.active.map((i) => incident(i, true)).join('');
  $('[data-components]').innerHTML = s.components.map((c) => `
    <div class="st-comp">
      <div class="st-row">
        <div><h3>${esc(c.name)}</h3><p>${esc(c.about)}${c.p95 != null ? ` · 95% of calls under ${c.p95} ms today` : ''}</p></div>
        <span class="st-state ${c.state}"><i></i>${LABEL[c.state]}${c.uptime != null && c.state !== 'off' ? ` · ${c.uptime}% over 90 days` : ''}</span>
      </div>
      <div class="st-bars" role="img" aria-label="${esc(c.name)}: 90 days">${c.days.map((d) => `<span class="${d.state}" data-day="${d.day}|${d.state}|${d.ok}|${d.total}"></span>`).join('')}</div>
      <div class="st-scale"><span>90 days ago</span><span>Today</span></div>
    </div>`).join('');
  $('[data-history]').innerHTML = s.history.length ? s.history.map((i) => `<details class="st-hist" id="incident-${i.id}"><summary><h3>${esc(i.title)}</h3><span class="st-meta">${dayName(new Date(i.createdAt).toISOString().slice(0, 10))}</span></summary>${incident(i, false)}</details>`).join('') : '<p class="cx-empty">No incidents in the last 90 days.</p>';
}

document.addEventListener('mousemove', showTip);
document.addEventListener('mouseleave', () => { tip?.remove(); tip = null; });
load();
setInterval(load, 60e3);
