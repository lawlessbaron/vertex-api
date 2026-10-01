// Shared by every page except admin.
//
// Scripts and styles come straight from the browser's cache and refresh in the
// background (stale-while-revalidate), which saves a round trip per file, and
// a round trip from overseas is the slow part. After a release, a returning
// visitor's first page still runs the old files, so it fetches every script
// and style fresh once and reloads; from then on it runs only the new ones.
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
