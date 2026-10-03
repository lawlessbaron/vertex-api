// The SDKs: the JavaScript client talks to the API as documented; the Python one compiles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { MintMotive, MintMotiveError } from '../public/sdk/mintmotive.mjs';

test('the JavaScript SDK sends the key, parses files and raises errors', async () => {
  const calls = [];
  const fetch = async (url, opts) => {
    calls.push({ url, opts });
    if (url.endsWith('/engine/v1/generate')) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-disposition': 'attachment; filename="bin.stl"', 'x-vertex-serial': 'S1', 'x-vertex-parts': 'bin' } });
    if (url.endsWith('/ai/v1/check/settings')) return Response.json({ findings: [{ code: 'all-clear' }] });
    return new Response(JSON.stringify({ error: 'No.' }), { status: 401, headers: { 'x-request-id': 'r1' } });
  };
  const mm = new MintMotive({ key: 'vx_test', base: 'https://x', fetch });
  const f = await mm.engine.generate({ kind: 'bin', format: 'stl' });
  assert.deepEqual([...f.bytes], [1, 2, 3]);
  assert.equal(f.name, 'bin.stl'); assert.equal(f.serial, 'S1');
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer vx_test');
  assert.equal((await mm.ai.checkSettings({ filament_type: 'PLA' })).findings[0].code, 'all-clear');
  await assert.rejects(mm.engine.info(), (e) => e instanceof MintMotiveError && e.status === 401 && e.requestId === 'r1');
});

test('the Python SDK compiles', { skip: (() => { try { execFileSync('python3', ['--version']); return false; } catch { return 'no python3'; } })() }, () => {
  execFileSync('python3', ['-m', 'py_compile', new URL('../public/sdk/mintmotive.py', import.meta.url).pathname]);
});
