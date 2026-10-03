// The line to VERTEX. Accounts, bans and roles live there; the API site asks.
// Every call carries API_LINK_SECRET (set the same on both services), and
// VERTEX only answers calls that carry it.
//
//   sign in    → people go to VERTEX's /api-link/authorize, come back with a
//                one-time code, and exchange() swaps it for their details
//   user(id)   → the account now (role, still there, still allowed in)
//   alert()    → an alert for VERTEX staff: the bell, email and Discord
//   controls() → generators paused on VERTEX, the site's size limits
//   exportData() → the API's records from when it lived inside VERTEX (once)
//   recipes(id), recipeFile(id, recipeId, name, buf) → a member's own Recipes, and a fixed profile onto one
import { HttpError } from './security.js';

export function createLink({ config, fetchImpl = fetch }) {
  const on = () => Boolean(config.vertexUrl && config.linkSecret);

  async function call(method, path, body, { timeout = 10e3 } = {}) {
    if (!on()) throw new HttpError(503, 'The link to VERTEX isn’t set up (VERTEX_URL and API_LINK_SECRET).');
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout);
    try {
      const res = await fetchImpl(`${config.vertexUrl}/api/link${path}`, {
        method, signal: ctl.signal,
        headers: { authorization: `Bearer ${config.linkSecret}`, ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new HttpError(res.status === 404 ? 404 : res.status >= 500 ? 502 : res.status, data.error || `VERTEX said ${res.status}.`);
      return data;
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(502, 'Couldn’t reach VERTEX. Try again in a minute.');
    } finally { clearTimeout(timer); }
  }

  const authorizeUrl = (state, returnTo) => `${config.vertexUrl}/api-link/authorize?state=${encodeURIComponent(state)}&return=${encodeURIComponent(returnTo)}`;
  const exchange = (code) => call('POST', '/exchange', { code });
  const user = (id) => call('GET', `/users/${Number(id)}`);
  const controls = () => call('GET', '/controls');
  const exportData = () => call('GET', '/export', null, { timeout: 120e3 });
  const alert = (a) => call('POST', '/alert', a).catch((e) => { console.warn(`alert to VERTEX failed: ${e.message}`); return null; });

  const recipes = (userId) => call('GET', `/users/${Number(userId)}/recipes`);
  const recipeFile = (userId, recipeId, name, buf) => call('POST', `/users/${Number(userId)}/recipes/${encodeURIComponent(recipeId)}/file`, { name, data: Buffer.from(buf).toString('base64') }, { timeout: 60e3 });

  return { on, authorizeUrl, exchange, user, controls, exportData, alert, recipes, recipeFile };
}
