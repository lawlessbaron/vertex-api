// Runs trace steps on worker threads (two by default, TRACE_WORKERS to change),
// started on first use. If a worker can't start or dies, the step runs here
// instead: slower for everyone else, but the trace still comes back.
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { OPS } from './trace-work.js';

const size = Math.max(0, Math.min(4, Number(process.env.TRACE_WORKERS ?? Math.min(2, Math.max(1, availableParallelism() - 1)))));
const workers = [];
let seq = 0, broken = size === 0, next = 0;
const waiting = new Map();

function start() {
  for (let i = workers.length; i < size; i++) {
    const w = new Worker(new URL('./trace-worker.js', import.meta.url));
    w.on('message', ({ id, result, error }) => { const p = waiting.get(id); if (!p) return; waiting.delete(id); idle(w); error ? p.reject(new Error(error)) : p.resolve(result); });
    w.on('error', () => fail(w));
    w.on('exit', (code) => { if (code) fail(w); });
    w.unref(); // held open only while it has a job (below)
    workers.push(w);
  }
}
// A worker with nothing to do mustn't keep the process alive.
function idle(w) { if (![...waiting.values()].some((p) => p.worker === w)) w.unref(); }
function fail(w) {
  const i = workers.indexOf(w);
  if (i >= 0) workers.splice(i, 1);
  // Anything that worker had in hand runs here instead.
  for (const [id, p] of waiting) if (p.worker === w) { waiting.delete(id); try { p.resolve(OPS[p.op](p.args)); } catch (e) { p.reject(e); } }
  if (!workers.length) broken = true;
}

export function runTrace(op, args) {
  if (!broken) { try { start(); } catch { broken = true; } }
  if (broken || !workers.length) return Promise.resolve().then(() => OPS[op](args));
  const w = workers[next++ % workers.length], id = ++seq;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject, worker: w, op, args });
    w.ref();
    w.postMessage({ id, op, args });
  });
}

// Start the workers (and load the engine in them) before the first photo arrives.
export function warmTrace() {
  if (broken) return;
  try { start(); } catch { broken = true; return; }
  for (const w of workers) { const id = ++seq; waiting.set(id, { resolve() {}, reject() {}, worker: w, op: 'ping', args: {} }); w.ref(); w.postMessage({ id, op: 'ping', args: {} }); }
}
