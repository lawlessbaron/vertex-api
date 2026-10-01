// The API site's switches. Its own: the engine API on or off (the tracer API
// has its own switch in trace-api.js). From VERTEX, refreshed every few
// minutes: generators paused there, file formats switched off there, and the
// site's size limits, so the API never makes what the site wouldn't.
const KEY = 'api_controls';
const REMOTE_KEY = 'vertex_controls';
const DEFAULT_LIMITS = { maxGrid: 12, maxHeightUnits: 20 };

export function createControls({ db, link }) {
  const get = (key, def) => { try { return JSON.parse(db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value || 'null') ?? def; } catch { return def; } };
  const put = (key, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(v));
  const own = () => ({ engineApi: false, ...get(KEY, {}) });
  const remote = () => ({ limits: DEFAULT_LIMITS, disabled: [], generators: {}, requireStaffMfa: false, at: 0, ...get(REMOTE_KEY, {}) });

  const controls = { get limits() { return { ...DEFAULT_LIMITS, ...remote().limits }; } };
  const isOff = (key) => (key === 'engineApi' ? !own().engineApi : remote().disabled.includes(key));
  const generatorBlock = (kind, staff) => {
    const g = remote().generators?.[kind];
    if (!g || staff) return null;
    return g.state === 'locked' ? 'This generator isn’t available right now.' : `This generator is paused${g.note ? `: ${g.note}` : ' while we improve it. Back soon.'}`;
  };
  function setSwitch(key, on) {
    if (key !== 'engineApi') throw new Error('Unknown switch.');
    put(KEY, { ...own(), [key]: Boolean(on) });
  }
  function saveRemote(r) {
    put(REMOTE_KEY, {
      limits: { ...DEFAULT_LIMITS, ...(r.limits || {}) },
      disabled: Array.isArray(r.disabled) ? r.disabled.map(String) : [],
      generators: r.generators && typeof r.generators === 'object' ? r.generators : {},
      requireStaffMfa: Boolean(r.requireStaffMfa),
      at: Date.now(),
    });
  }
  async function refresh() {
    if (!link?.on()) return false;
    saveRemote(await link.controls());
    return true;
  }
  const status = () => ({ engineApi: own().engineApi, vertex: remote() });

  return { controls, isOff, generatorBlock, setSwitch, saveRemote, refresh, status, requireStaffMfa: () => remote().requireStaffMfa };
}
