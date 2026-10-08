// /education: apply for the Education plan, and see where your application is up to.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}
const STATE = { pending: 'Waiting for review', 'more-info': 'We need a bit more', approved: 'Approved', declined: 'Not approved' };
const fileData = (f) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok({ name: f.name, data: r.result }); r.onerror = () => no(new Error(`Couldn’t read ${f.name}.`)); r.readAsDataURL(f); });

function showStatus(a) {
  const el = $('[data-status]');
  if (!a) { el.hidden = true; return; }
  el.hidden = false;
  const again = a.status === 'declined' || a.status === 'more-info';
  el.innerHTML = `<p class="ax-label">Your application</p>
    <h2>${esc(a.institution)} <span class="ed-state ${esc(a.status)}">${esc(STATE[a.status] || a.status)}</span></h2>
    <p class="ax-tile-s">Sent ${new Date(a.createdAt).toLocaleDateString()}. ${a.status === 'approved' ? `You can take the plan from your <a href="/console">console</a>.` : a.status === 'pending' ? 'We read every application by hand and will let you know here.' : ''}</p>
    ${a.decisionNote ? `<p>${esc(a.decisionNote)}</p>` : ''}
    ${again ? '<p class="ax-tile-s">You can send a new application below.</p>' : ''}`;
  $('[data-form]').hidden = !again;
}

async function init() {
  let r;
  try {
    // A signed-out visitor sees the sign-in card without a refused call behind it.
    if (!(await call('/api/me').catch(() => ({ user: true }))).user) throw Object.assign(new Error('Sign in'), { status: 401 });
    r = await call('/api/developer/education');
  } catch (e) {
    if (e.status === 401) { $('[data-signin]').hidden = false; return; }
    throw e;
  }
  $('[data-kinds]').innerHTML = '<option value="">Choose…</option>' + Object.entries(r.kinds).map(([k, v]) => `<option value="${esc(k)}">${esc(v)}</option>`).join('');
  if (r.application) showStatus(r.application); else $('[data-form]').hidden = false;
}

$('[data-form]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, err = $('[data-err]'), btn = f.querySelector('button');
  err.hidden = true;
  if (!f.reportValidity()) return;
  const files = [...f.files.files];
  if (files.length > 4) { err.textContent = 'At most 4 documents.'; err.hidden = false; return; }
  if (files.some((x) => x.size > 8 * 1048576)) { err.textContent = 'Each document can be up to 8 MB.'; err.hidden = false; return; }
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const body = Object.fromEntries(['institution', 'kind', 'country', 'region', 'website', 'address', 'contactName', 'contactRole', 'contactEmail', 'contactPhone', 'students', 'levels', 'use', 'proof'].map((k) => [k, f[k].value]));
    body.agree = f.agree.checked;
    body.replace = true;
    body.files = await Promise.all(files.map(fileData));
    const out = await call('/api/developer/education', { method: 'POST', body });
    f.reset();
    showStatus(out.application);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e2) { err.textContent = e2.message; err.hidden = false; } finally { btn.disabled = false; btn.textContent = 'Send application'; }
});
init().catch(() => { $('[data-signin]').hidden = false; });
