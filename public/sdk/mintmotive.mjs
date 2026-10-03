// Mint Motive API client for JavaScript (Node 18+, Deno, Bun and browsers). No dependencies.
//
//   import { MintMotive } from 'https://api.mintmotive.com.au/sdk/mintmotive.mjs';
//   const mm = new MintMotive({ key: process.env.MINT_KEY });
//   const file = await mm.engine.generate({ kind: 'bin', format: 'stl', params: { gridX: 2, gridY: 1 } });
//   await fs.writeFile(file.name, file.bytes);
//
// Every call throws a MintMotiveError (status, message, requestId) when the API says no.
export class MintMotiveError extends Error {
  constructor(status, message, requestId) { super(message); this.name = 'MintMotiveError'; this.status = status; this.requestId = requestId; }
}

export class MintMotive {
  constructor({ key, base = 'https://api.mintmotive.com.au', fetch: f = globalThis.fetch } = {}) {
    this.key = key; this.base = base.replace(/\/$/, ''); this.fetch = f;
    const self = this;
    this.engine = {
      info: () => self.get('/engine/v1'),
      kinds: () => self.get('/engine/v1/kinds'),
      parts: (spec) => self.post('/engine/v1/parts', spec),
      /** → { bytes: Uint8Array, name, serial, parts } */
      generate: async (spec) => { const r = await self.raw('POST', '/engine/v1/generate', JSON.stringify(spec), 'application/json'); return { bytes: new Uint8Array(await r.arrayBuffer()), name: /filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '')?.[1] || `${spec.kind}.${spec.format || '3mf'}`, serial: r.headers.get('x-vertex-serial'), parts: (r.headers.get('x-vertex-parts') || '').split(',').filter(Boolean) }; },
    };
    this.trace = {
      info: () => self.get('/trace/v1'),
      /** A photo (bytes) → the finished job, polling until it's done. */
      photo: async (bytes, { paper = 'a4', every = 2000, timeout = 180000 } = {}) => {
        const job = await self.json(await self.raw('POST', `/trace/v1/jobs?paper=${encodeURIComponent(paper)}`, bytes, 'application/octet-stream'));
        const t0 = Date.now();
        for (;;) { const j = await self.get(job.check); if (j.status !== 'running') { if (j.status === 'failed') throw new MintMotiveError(422, j.error); return j; } if (Date.now() - t0 > timeout) throw new MintMotiveError(408, 'The trace took too long.'); await new Promise((ok) => setTimeout(ok, every)); }
      },
      bin: async (jobId, { format = 'stl', clearance = 1, depth = 20, finger = 22 } = {}) => { const r = await self.raw('GET', `/trace/v1/jobs/${jobId}/bin?format=${format}&clearance=${clearance}&depth=${depth}&finger=${finger}`); return { bytes: new Uint8Array(await r.arrayBuffer()), serial: r.headers.get('x-vertex-serial') }; },
    };
    this.ai = {
      info: () => self.get('/ai/v1'),
      filaments: () => self.get('/ai/v1/filaments'),
      /** settings: an object of slicer settings, or G-code text */
      checkSettings: (settings, context = {}) => (typeof settings === 'string' ? self.json(self.raw('POST', `/ai/v1/check/settings?${qs(context)}`, settings, 'text/plain')) : self.post('/ai/v1/check/settings', { settings, context })),
      /** model: STL or 3MF bytes, or { kind, params } for an engine model */
      checkModel: (model, context = {}) => (model instanceof Uint8Array || model instanceof ArrayBuffer ? self.json(self.raw('POST', `/ai/v1/check/model?${qs(context)}`, model, 'application/octet-stream')) : self.post('/ai/v1/check/model', { ...model, context })),
      diagnosePhoto: (bytes, context = {}) => self.json(self.raw('POST', `/ai/v1/diagnose/photo?${qs(context)}`, bytes, 'application/octet-stream')),
      outcome: (o) => self.post('/ai/v1/outcomes', o),
    };
  }
  async raw(method, path, body, type) {
    const r = await this.fetch(this.base + path, { method, headers: { ...(this.key ? { Authorization: `Bearer ${this.key}` } : {}), ...(type ? { 'Content-Type': type } : {}) }, body });
    if (!r.ok) { let msg = `HTTP ${r.status}`; try { msg = (await r.json()).error || msg; } catch { /* not JSON */ } throw new MintMotiveError(r.status, msg, r.headers.get('x-request-id')); }
    return r;
  }
  async json(r) { return (await r).json(); }
  get(path) { return this.json(this.raw('GET', path)); }
  post(path, body) { return this.json(this.raw('POST', path, JSON.stringify(body), 'application/json')); }
}
const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : String(v)])).toString();
