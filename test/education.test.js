// The Education plan: apply with proof, staff decide, the plan opens only to
// approved institutions, and documents go 30 days after the decision.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { createSession } from '../server/auth.js';

const PDF = `data:application/pdf;base64,${Buffer.from('%PDF-1.4\n% letterhead\n').toString('base64')}`;

test('education: apply with proof, review, approve, the plan opens, documents swept', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mm-edu-'));
  const alerts = [];
  const cfg = { ...loadConfig({ DATABASE_PATH: join(dir, 'api.db'), PUBLIC_URL: 'http://localhost' }), link: { on: () => true, alert: async (a) => alerts.push(a), controls: async () => ({}), user: async () => ({ gone: false, user: null }), exportData: async () => ({ tables: {} }) } };
  const app = createApp(cfg);
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const mk = (id, handle, role) => {
    app.db.prepare('INSERT INTO users (id, email, name, handle, role, created_at, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, `${handle}@t.io`, handle, handle, role, Date.now(), Date.now());
    const cookie = `mm_api=${createSession(app.db, id, 'test', { mfa: true })}`;
    return async (path, { method = 'GET', body } = {}) => {
      const res = await fetch(base + path, { method, headers: { cookie, ...(body ? { origin: base, 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
      return { status: res.status, data: await res.json().catch(() => null), res };
    };
  };
  const teacher = mk(5, 'teacher', 'user'), boss = mk(6, 'boss', 'owner');
  const form = { institution: 'Example State High School', kind: 'public-school', country: 'Australia', region: 'QLD', website: 'https://example.eq.edu.au', contactName: 'Sam Lee', contactRole: 'D&T teacher', contactEmail: 'slee@example.eq.edu.au', students: 120, levels: 'Years 9–12', use: 'Design and technology classes printing their own organisers.', proof: 'Letter from the principal on letterhead, and my staff ID.', agree: true };
  try {
    assert.equal((await fetch(`${base}/education`)).status, 200);
    // Proof is required, and only real PDFs and images count.
    assert.equal((await teacher('/api/developer/education', { method: 'POST', body: { ...form, files: [] } })).status, 400);
    assert.equal((await teacher('/api/developer/education', { method: 'POST', body: { ...form, files: [{ name: 'x.pdf', data: 'data:application/pdf;base64,' + Buffer.from('not a pdf').toString('base64') }] } })).status, 415);
    const sent = await teacher('/api/developer/education', { method: 'POST', body: { ...form, files: [{ name: 'letter.pdf', data: PDF }] } });
    assert.equal(sent.status, 201);
    assert.equal(sent.data.application.status, 'pending');
    assert.ok(alerts.some((a) => /Example State High School/.test(a.title)), 'staff on VERTEX hear about it');
    assert.equal((await teacher('/api/developer/education', { method: 'POST', body: { ...form, files: [{ name: 'letter.pdf', data: PDF }] } })).status, 409, 'one waiting application at a time');
    // Not approved yet: the plan can't be taken.
    assert.ok(!(await teacher('/api/developer/plan')).data.invited.includes('education'));
    // Staff only; staff can read the documents and decide.
    assert.equal((await teacher('/api/admin/api/education')).status, 403);
    const list = (await boss('/api/admin/api/education')).data;
    const id = list.applications[0].id;
    const app1 = (await boss(`/api/admin/api/education/${id}`)).data;
    const doc = await boss(`/api/admin/api/education/${id}/files/${app1.files[0].id}`);
    assert.equal(doc.res.headers.get('content-type'), 'application/pdf');
    assert.equal((await boss(`/api/admin/api/education/${id}/decide`, { method: 'POST', body: { status: 'declined' } })).status, 400, 'say why when declining');
    const ok = await boss(`/api/admin/api/education/${id}/decide`, { method: 'POST', body: { status: 'approved', plan: 'education', note: 'Welcome aboard.' } });
    assert.equal(ok.data.status, 'approved');
    assert.ok((await teacher('/api/developer/plan')).data.invited.includes('education'));
    assert.equal((await teacher('/api/developer/education')).data.application.decisionNote, 'Welcome aboard.');
    // Documents are gone 30 days after the decision.
    app.db.prepare('UPDATE edu_applications SET reviewed_at = ? WHERE id = ?').run(Date.now() - 31 * 86400e3, id);
    assert.equal(app.education.sweep(), 1);
    assert.equal(existsSync(join(dir, 'education', String(id))), false);
    assert.equal((await boss(`/api/admin/api/education/${id}/files/${app1.files[0].id}`)).status, 404);
  } finally { app.close(); app.server.closeAllConnections?.(); app.server.close(); rmSync(dir, { recursive: true, force: true }); }
});
