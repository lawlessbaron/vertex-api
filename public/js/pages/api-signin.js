// Sign in to the API site with your VERTEX account. The button goes to
// /auth/vertex, which sends you to VERTEX and back with a one-time code; the
// session belongs to this address only.
const $ = (s) => document.querySelector(s);
const q = new URLSearchParams(location.search);
const next = (() => { const n = q.get('next') || '/console'; return /^\/(?!\/)/.test(n) ? n : '/console'; })();
$('[data-go]').href = `/auth/vertex?next=${encodeURIComponent(next)}`;
const ERRORS = {
  expired: 'That sign-in took too long or was opened in another browser. Try again.',
  vertex: 'Couldn’t reach VERTEX to check your sign-in. Try again in a minute.',
  suspended: 'This account is suspended on VERTEX.',
  denied: 'Sign-in was cancelled.',
};
const err = q.get('error');
if (err) { const e = $('[data-err]'); e.textContent = ERRORS[err] || 'Couldn’t sign you in. Try again.'; e.hidden = false; }
// Already signed in here? Straight on.
fetch('/api/me', { credentials: 'same-origin' }).then((r) => r.json()).then((d) => { if (d?.user) location.replace(next); }).catch(() => {});
