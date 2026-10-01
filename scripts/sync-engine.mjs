// Copy the geometry engine from a VERTEX checkout into engine/, so the API
// builds exactly what VERTEX builds. Run after VERTEX's engine changes:
//   node scripts/sync-engine.mjs ../gridfinity-generator
// It follows every import from the entry points, copies only what's used,
// and records the VERTEX commit and engine version in engine/SOURCE.json.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const vertex = resolve(process.argv[2] || '../gridfinity-generator');
const root = join(vertex, 'public/js');
if (!existsSync(join(root, 'models.js'))) { console.error(`No VERTEX engine at ${root}`); process.exit(1); }
const ENTRIES = ['models.js', 'export.js', 'serial.js', 'engine.js', 'geometry/cutout.js', 'trace/vision.js', 'trace/whole.js', 'trace/layout.js', 'trace/detect.js'];
const out = resolve('engine');
const seen = new Set();
function walk(file) {
  const f = resolve(file);
  if (seen.has(f)) return;
  seen.add(f);
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/(?:import|export)[^'"]*?from\s*['"](\.[^'"]+)['"]/g)) walk(resolve(dirname(f), m[1]));
  for (const m of src.matchAll(/import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) walk(resolve(dirname(f), m[1]));
}
ENTRIES.forEach((e) => walk(join(root, e)));
rmSync(out, { recursive: true, force: true });
for (const f of seen) {
  const to = join(out, relative(root, f));
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, readFileSync(f));
}
let commit = 'unknown';
try { commit = execSync('git rev-parse --short HEAD', { cwd: vertex }).toString().trim(); } catch { /* not a git checkout */ }
const { ENGINE } = await import(join(out, 'engine.js'));
writeFileSync(join(out, 'SOURCE.json'), `${JSON.stringify({ from: 'lawlessbaron/gridfinity-generator', commit, engine: ENGINE.version, files: seen.size, syncedAt: new Date().toISOString() }, null, 2)}\n`);
console.log(`engine ${ENGINE.version}: ${seen.size} files from VERTEX ${commit}`);
