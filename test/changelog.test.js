// The developers' changelog: CHANGELOG.md as JSON and RSS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChangelog, createChangelog } from '../server/changelog.js';

test('the changelog parses into versions with their items', () => {
  const md = '# Changelog\n\n## 1.2.0 · 3 October 2026\n\n### Added\n- **The thing.** It does stuff.\n  - one detail\n\n## 1.1.0 · 2 October 2026\n\n### Fixed\n- A bug.\n';
  const e = parseChangelog(md);
  assert.equal(e.length, 2);
  assert.equal(e[0].version, '1.2.0');
  assert.equal(e[0].items[0].heading, 'Added');
  assert.match(e[0].items[0].text, /one detail/);
});

test('the real changelog gives JSON and a valid RSS feed', () => {
  const c = createChangelog({ path: new URL('../CHANGELOG.md', import.meta.url).pathname });
  const j = c.json(3);
  assert.ok(j.entries.length >= 1 && j.entries.length <= 3);
  assert.match(j.entries[0].version, /^\d+\.\d+\.\d+$/);
  assert.ok(!/\*\*/.test(JSON.stringify(j)), 'markdown stripped');
  const x = c.rss('https://api.example');
  assert.match(x, /^<\?xml/);
  assert.match(x, /<item><title>API \d+\.\d+\.\d+<\/title>/);
});
