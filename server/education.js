// The Education plan: schools, colleges and universities apply like everyone
// else, with proof they are who they say. They send the institution's details,
// a contact person, what they'll use the API for, and documents: a letter on
// official letterhead signed by the head of the institution, or a notarised or
// certified statement (or their country's usual equivalent), plus a staff ID or
// the institution's registration. Staff read every application in API admin →
// Education and decide. An approved public school can take the Education plan,
// priced near cost; any other approved institution gets the decision staff
// choose (Education plan, or the usual plans). Documents are kept only for the
// review: they are deleted 30 days after the decision.
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { HttpError } from './security.js';

export const EDU_KINDS = {
  'public-school': 'Public (government) school',
  'private-school': 'Private or independent school',
  college: 'College, TAFE or vocational',
  university: 'University',
  other: 'Other education provider',
};
export const EDU_STATUSES = ['pending', 'more-info', 'approved', 'declined'];
const MAX_FILES = 4;
const MAX_FILE = 8 * 1024 * 1024;
const KEEP_AFTER = 30 * 86400e3;
// What a file is, from its first bytes (the name and claimed type don't count).
function sniff(buf) {
  if (buf.length > 4 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return { type: 'application/pdf', ext: 'pdf' };
  if (buf.length > 8 && buf[0] === 0x89 && buf.subarray(1, 4).toString('latin1') === 'PNG') return { type: 'image/png', ext: 'png' };
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
  return null;
}

export function createEducation({ db, dir, audit, alerts, plans, now = () => Date.now() }) {
  const str = (v, n, req = false, label = 'That') => {
    const s = String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
    if (req && !s) throw new HttpError(400, `${label} is needed.`);
    return s;
  };
  const text = (v, n) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, n);
  const out = (r, staff = false) => r && ({
    id: r.id, institution: r.institution, kind: r.kind, kindName: EDU_KINDS[r.kind] || r.kind, country: r.country, region: r.region, website: r.website,
    address: r.address, contactName: r.contact_name, contactRole: r.contact_role, contactEmail: r.contact_email, contactPhone: r.contact_phone,
    students: r.students, levels: r.levels, use: r.use, proof: r.proof,
    files: JSON.parse(r.files || '[]').map((f) => ({ id: f.id, name: f.name, type: f.type, bytes: f.bytes })), filesDeleted: Boolean(r.files_deleted_at),
    status: r.status, decisionPlan: r.decision_plan, decisionNote: r.decision_note, reviewedAt: r.reviewed_at, createdAt: r.created_at,
    ...(staff ? { userId: r.user_id, handle: r.handle, email: r.email, reviewedBy: r.reviewer } : {}),
  });

  const latest = (userId) => db.prepare('SELECT * FROM edu_applications WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId);
  const mine = (userId) => out(latest(userId));
  // Approved for the plan: the latest decision says so.
  function invitedTo(userId, planId) {
    const r = latest(userId);
    return Boolean(r && r.status === 'approved' && r.decision_plan === planId);
  }

  function apply(user, body, ip) {
    const open = latest(user.id);
    if (open && (open.status === 'pending' || open.status === 'more-info') && !body.replace) throw new HttpError(409, 'You already have an application waiting. We’ll be in touch.');
    const kind = Object.hasOwn(EDU_KINDS, body.kind) ? body.kind : null;
    if (!kind) throw new HttpError(400, 'Pick what kind of institution it is.');
    const email = str(body.contactEmail, 200, true, 'A contact email');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'That contact email doesn’t look right.');
    const website = str(body.website, 300);
    if (website && !/^https?:\/\/\S+\.\S+/.test(website)) throw new HttpError(400, 'The website should start with https://');
    const files = Array.isArray(body.files) ? body.files.slice(0, MAX_FILES + 1) : [];
    if (!files.length) throw new HttpError(400, 'Attach your proof: at least one document.');
    if (files.length > MAX_FILES) throw new HttpError(400, `At most ${MAX_FILES} documents.`);
    if (!body.agree) throw new HttpError(400, 'Please confirm the details are true.');
    const saved = [];
    const id = Number(db.prepare(`INSERT INTO edu_applications (user_id, institution, kind, country, region, website, address, contact_name, contact_role, contact_email, contact_phone, students, levels, use, proof, files, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 'pending', ?, ?)`).run(
      user.id, str(body.institution, 160, true, 'The institution’s name'), kind, str(body.country, 80, true, 'The country'), str(body.region, 80), website || null,
      text(body.address, 400) || null, str(body.contactName, 120, true, 'A contact name'), str(body.contactRole, 120, true, 'The contact’s role'), email, str(body.contactPhone, 40) || null,
      Math.max(0, Math.min(1e6, Math.round(Number(body.students) || 0))) || null, str(body.levels, 200) || null,
      text(body.use, 3000) || (() => { throw new HttpError(400, 'Tell us what you’ll use it for.'); })(),
      text(body.proof, 1500) || (() => { throw new HttpError(400, 'Tell us what your documents are.'); })(),
      now(), now()).lastInsertRowid);
    try {
      const folder = join(dir, String(id));
      mkdirSync(folder, { recursive: true });
      for (const f of files) {
        const buf = Buffer.from(String(f.data || '').replace(/^data:[^,]*,/, ''), 'base64');
        if (!buf.length) throw new HttpError(400, 'One of the documents is empty.');
        if (buf.length > MAX_FILE) throw new HttpError(413, `Each document can be up to ${MAX_FILE / 1048576} MB.`);
        const kindOf = sniff(buf);
        if (!kindOf) throw new HttpError(415, 'Documents must be PDF, PNG or JPEG.');
        const fid = randomBytes(8).toString('hex');
        writeFileSync(join(folder, `${fid}.${kindOf.ext}`), buf);
        saved.push({ id: fid, name: str(f.name, 120) || `document.${kindOf.ext}`, type: kindOf.type, ext: kindOf.ext, bytes: buf.length });
      }
    } catch (e) {
      db.prepare('DELETE FROM edu_applications WHERE id = ?').run(id);
      rmSync(join(dir, String(id)), { recursive: true, force: true });
      throw e;
    }
    db.prepare('UPDATE edu_applications SET files = ? WHERE id = ?').run(JSON.stringify(saved), id);
    if (open && body.replace && (open.status === 'pending' || open.status === 'more-info')) db.prepare("UPDATE edu_applications SET status = 'declined', decision_note = 'Replaced by a newer application.', updated_at = ? WHERE id = ?").run(now(), open.id);
    audit?.log(user, 'edu.apply', String(id), { institution: body.institution, kind }, ip);
    alerts?.send('api', { title: `Education plan application: ${str(body.institution, 160)} (${EDU_KINDS[kind]})`, body: `From @${user.handle || user.id}. Review it in API admin → Education.`, link: '/admin#education', key: `edu:${id}` });
    return mine(user.id);
  }

  // ---------- staff ----------
  const STAFF_SELECT = 'SELECT a.*, u.handle, u.email, r.handle AS reviewer FROM edu_applications a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN users r ON r.id = a.reviewed_by';
  const list = (status) => db.prepare(`${STAFF_SELECT} ${status ? 'WHERE a.status = ?' : ''} ORDER BY a.status = 'pending' DESC, a.id DESC LIMIT 300`).all(...(status ? [status] : [])).map((r) => out(r, true));
  const one = (id) => out(db.prepare(`${STAFF_SELECT} WHERE a.id = ?`).get(Number(id)), true);
  function file(id, fid) {
    const r = db.prepare('SELECT files, files_deleted_at FROM edu_applications WHERE id = ?').get(Number(id));
    if (!r || r.files_deleted_at) throw new HttpError(404, 'That document is gone.');
    const f = JSON.parse(r.files).find((x) => x.id === fid);
    const path = f && join(dir, String(Number(id)), `${f.id}.${f.ext}`);
    if (!f || !existsSync(path)) throw new HttpError(404, 'That document is gone.');
    return { ...f, data: readFileSync(path) };
  }
  function decide(me, id, body = {}, ip) {
    const r = db.prepare('SELECT * FROM edu_applications WHERE id = ?').get(Number(id));
    if (!r) throw new HttpError(404, 'No application with that id.');
    const status = EDU_STATUSES.includes(body.status) && body.status !== 'pending' ? body.status : null;
    if (!status) throw new HttpError(400, 'Approve, decline or ask for more information.');
    const note = text(body.note, 1500);
    if ((status === 'declined' || status === 'more-info') && !note) throw new HttpError(400, 'Say why, so they know what to do next.');
    let plan = null;
    if (status === 'approved') {
      plan = String(body.plan || 'education');
      if (!plans.plans().some((p) => p.id === plan)) throw new HttpError(400, 'Pick a plan they can take.');
      // A plan given free (for a set time) instead of paid.
      if (body.giveDays) plans.grant(me, r.user_id, { plan, days: Math.max(1, Math.min(3650, Number(body.giveDays) || 365)), note: `Education: ${r.institution}` }, ip);
    }
    db.prepare('UPDATE edu_applications SET status = ?, decision_plan = ?, decision_note = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?').run(status, plan, note || null, me.id, now(), now(), r.id);
    audit?.log(me, 'edu.decide', String(r.id), { status, plan, giveDays: body.giveDays || null }, ip);
    return one(r.id);
  }
  // Documents are only for the review: gone 30 days after the decision.
  function sweep() {
    const done = db.prepare("SELECT id FROM edu_applications WHERE status IN ('approved', 'declined') AND reviewed_at < ? AND files_deleted_at IS NULL").all(now() - KEEP_AFTER);
    for (const r of done) {
      rmSync(join(dir, String(r.id)), { recursive: true, force: true });
      db.prepare('UPDATE edu_applications SET files_deleted_at = ? WHERE id = ?').run(now(), r.id);
    }
    return done.length;
  }
  const counts = () => Object.fromEntries(db.prepare('SELECT status, COUNT(*) AS n FROM edu_applications GROUP BY status').all().map((r) => [r.status, r.n]));

  return { apply, mine, invitedTo, list, one, file, decide, sweep, counts, kinds: EDU_KINDS };
}
