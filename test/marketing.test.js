import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase as openDb } from '../server/db.js';
import { createMarketing, sourceOf, deviceOf } from '../server/marketing.js';

test('where a visit came from', () => {
  assert.equal(sourceOf(null), 'direct');
  assert.equal(sourceOf('https://www.google.com/'), 'google');
  assert.equal(sourceOf('https://makerworld.com/en/models/1'), 'makerworld');
  assert.equal(sourceOf('https://example.org/x', { source: 'Flyer' }), 'flyer');
  assert.equal(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile'), 'phone');
});

test('page views count visitors without cookies, skip bots and staff pages; short links count clicks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mk-'));
  const db = openDb(':memory:');
  const m = createMarketing({ db, dir, config: { publicUrl: 'https://api.example.com' } });
  const who = { ip: '1.2.3.4', ua: 'Mozilla/5.0 Chrome/120', lang: 'en-AU,en' };
  assert.equal(m.view({ path: '/docs', ref: 'https://www.google.com/' }, who), true);
  assert.equal(m.view({ path: '/' }, who), true);
  assert.equal(m.view({ path: '/admin' }, who), false);
  assert.equal(m.view({ path: '/' }, { ...who, ua: 'Googlebot/2.1' }), false);
  const t = m.traffic(30);
  assert.equal(t.totals.views, 2);
  assert.equal(t.totals.visitors, 1);
  assert.equal(t.countries[0].name, 'AU');
  const l = m.addLink({ id: 1 }, { code: 'mw-bins', target: '/education', source: 'makerworld' });
  assert.equal(l.code, 'mw-bins');
  const to = m.follow('mw-bins');
  assert.match(to, /utm_source=makerworld/);
  assert.equal(m.links()[0].clicks, 1);
  assert.throws(() => m.addLink({ id: 1 }, { code: 'mw-bins', target: '/' }), /taken/);
});
