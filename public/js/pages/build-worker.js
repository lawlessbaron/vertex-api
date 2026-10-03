// Builds the portal's demo models off the page, so the typing, the scrolling and the 3D view never
// stall while a model is made. The page asks for a kind and its settings; each part comes back as
// typed arrays, handed over without copying.
import { buildParts, loadKind } from '/js/models.js';

self.onmessage = async ({ data: { id, kind, params } }) => {
  try {
    if (loadKind) await loadKind(kind);
    const t0 = performance.now();
    const list = buildParts(kind, params) || [];
    const ms = performance.now() - t0;
    const parts = list.map((p) => ({ name: p.name, positions: Float32Array.from(p.mesh.positions), indices: Uint32Array.from(p.mesh.indices) }));
    self.postMessage({ id, ms, parts }, parts.flatMap((p) => [p.positions.buffer, p.indices.buffer]));
  } catch (e) { self.postMessage({ id, error: e.message || String(e) }); }
};
