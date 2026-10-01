// Shared by every page except admin.
//
// Scripts and styles are checked with the server on every load (no-cache), so
// a page never mixes old and new modules; the server preloads the whole module
// tree so the checks happen at once. After a release, a returning visitor's
// first page also fetches every script and style fresh once and reloads.
(() => {
  try {
    const rel = document.documentElement.dataset.release;
    if (!rel) return;
    const was = localStorage.getItem('mm-api-release');
    localStorage.setItem('mm-api-release', rel);
    if (!was || was === rel) return;
    const files = performance.getEntriesByType('resource').map((r) => r.name).filter((u) => /\/(js|css)\/[^?#]+\.(js|css)(?:[?#]|$)/.test(u) && u.startsWith(location.origin));
    Promise.all(files.map((u) => fetch(u, { cache: 'no-cache' }).catch(() => null))).then(() => location.reload());
  } catch { /* no storage: always fresh enough */ }
})();

// Staff only: an Admin link in the header once you're signed in as staff.
// Nobody else ever sees it (the admin page checks the role itself anyway).
fetch('/api/me', { credentials: 'same-origin' })
  .then((r) => (r.ok ? r.json() : null))
  .then((d) => {
    const nav = document.querySelector('.ax-nav');
    if (!d?.user?.staff || !nav || nav.querySelector('a[href="/admin"]')) return;
    const a = document.createElement('a');
    a.href = '/admin';
    a.textContent = 'Admin';
    nav.append(a);
  })
  .catch(() => {});

// One page view for the site's own traffic numbers: the page, where you came
// from and how long it took to load. No cookies, nothing sent anywhere else.
(() => {
  try {
    if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return;
    const q = new URLSearchParams(location.search);
    const send = () => {
      const nav = performance.getEntriesByType('navigation')[0];
      fetch('/api/t', { method: 'POST', keepalive: true, credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: location.pathname, ref: document.referrer || null, utm: { source: q.get('utm_source'), medium: q.get('utm_medium'), campaign: q.get('utm_campaign') }, ms: nav ? Math.round(nav.loadEventEnd || nav.domContentLoadedEventEnd) : null }) }).catch(() => {});
    };
    if (document.readyState === 'complete') setTimeout(send, 0); else addEventListener('load', () => setTimeout(send, 0), { once: true });
  } catch { /* counting is never worth an error */ }
})();
