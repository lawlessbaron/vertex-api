// A worker thread that runs the trace's heavy steps (trace-work.js), so a big
// photo never holds up the server's other requests.
import { parentPort } from 'node:worker_threads';
import { OPS } from './trace-work.js';

parentPort.on('message', ({ id, op, args }) => {
  try { parentPort.postMessage({ id, result: OPS[op](args) }); } catch (e) { parentPort.postMessage({ id, error: e.message }); }
});
