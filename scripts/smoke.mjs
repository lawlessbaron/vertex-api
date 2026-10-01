#!/usr/bin/env node
// Smoke test: start the site on a throwaway database, load the main pages in a
// real browser, and fail on any page that doesn't answer 200 or throws a
// script error. Used by the /qa command.
//
//   node scripts/smoke.mjs                 # the usual pages
//   node scripts/smoke.mjs /create /skadis # just these
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright')); } catch {
  const { execSync } = await import('node:child_process');
  ({ chromium } = require(join(execSync('npm root -g').toString().trim(), 'playwright')));
}

const PAGES = process.argv.slice(2).length ? process.argv.slice(2) : ['/', '/docs', '/status', '/education', '/signin', '/console', '/admin'];
const port = 8600 + Math.floor(Math.random() * 300);
const dir = mkdtempSync(join(tmpdir(), 'api-smoke-'));
const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], { env: { ...process.env, PORT: String(port), DATABASE_PATH: join(dir, 'api.db'), NODE_ENV: 'development', DATABASE_URL: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
server.stdout.on('data', (d) => { log += d; });
server.stderr.on('data', (d) => { log += d; });
const base = `http://localhost:${port}`;
for (let i = 0; i < 60; i++) { try { await fetch(base + '/healthz'); break; } catch { await new Promise((r) => setTimeout(r, 250)); } }

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const problems = [];
for (const path of PAGES) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  page.on('pageerror', (e) => problems.push(`${path}: script error: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource|favicon/.test(m.text())) problems.push(`${path}: console: ${m.text().slice(0, 200)}`); });
  const t = Date.now();
  const res = await page.goto(base + path, { waitUntil: 'load' }).catch((e) => ({ status: () => 0, e }));
  await page.waitForTimeout(1200);
  const code = res.status();
  console.log(`${code === 200 ? 'PASS' : 'FAIL'}  ${String(code).padEnd(4)} ${String(Date.now() - t).padStart(5)} ms  ${path}`);
  if (code !== 200) problems.push(`${path}: HTTP ${code}`);
  await page.close();
}
await browser.close();
server.kill();
rmSync(dir, { recursive: true, force: true });
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n${problems.join('\n')}`);
  if (/Error/.test(log)) console.log(`\nServer log:\n${log.split('\n').filter((l) => /error/i.test(l)).slice(-20).join('\n')}`);
  process.exit(1);
}
console.log(`\nALL PASS  (${PAGES.length} pages)`);
