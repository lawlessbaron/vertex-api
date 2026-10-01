// A small PostgreSQL client on Node's own net/tls/crypto, so the site keeps no
// dependencies. It speaks the v3 wire protocol: SCRAM-SHA-256 (Railway's
// default), md5 or plain passwords, optional TLS, and parameterised queries
// ($1, $2 …) run one at a time on a single connection.
//
//   const pg = await connectPg(process.env.DATABASE_URL);
//   const { rows } = await pg.query('SELECT $1::int + 1 AS n', [41]);   // rows: [{ n: 42 }]
//   await pg.close();
import net from 'node:net';
import tls from 'node:tls';
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';

export class PgError extends Error {
  constructor(fields) {
    super(fields.M || 'PostgreSQL error');
    this.code = fields.C;
    this.detail = fields.D;
    this.severity = fields.S;
  }
}

/** Reads postgres://user:pass@host:port/db?sslmode=… into its parts. */
export function parsePgUrl(url) {
  const u = new URL(url);
  if (!/^postgres(ql)?:$/.test(u.protocol)) throw new Error('DATABASE_URL must start with postgres:// or postgresql://');
  return {
    host: u.hostname.replace(/^\[|\]$/g, '') || 'localhost',
    port: Number(u.port) || 5432,
    user: decodeURIComponent(u.username) || 'postgres',
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.slice(1)) || decodeURIComponent(u.username) || 'postgres',
    sslmode: u.searchParams.get('sslmode') || 'prefer',
  };
}

const cstr = (s) => Buffer.concat([Buffer.from(String(s), 'utf8'), Buffer.from([0])]);
const int16 = (n) => { const b = Buffer.alloc(2); b.writeInt16BE(n); return b; };
const int32 = (n) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
// A frontend message: one type byte, then a length that counts itself.
const msg = (type, ...parts) => {
  const body = Buffer.concat(parts);
  return Buffer.concat([Buffer.from(type), int32(body.length + 4), body]);
};

// Text-format values back into JavaScript, by column type.
function decode(oid, text) {
  switch (oid) {
    case 16: return text === 't';
    case 20: case 21: case 23: case 26: {
      const n = Number(text);
      return Number.isSafeInteger(n) ? n : BigInt(text);
    }
    case 700: case 701: return Number(text);
    case 1700: {
      const n = Number(text);
      return /^-?\d+$/.test(text) && !Number.isSafeInteger(n) ? BigInt(text) : n;
    }
    case 17: return text.startsWith('\\x') ? Buffer.from(text.slice(2), 'hex') : Buffer.from(text, 'binary');
    default: return text;
  }
}

// JavaScript values into text-format parameters (null stays SQL NULL).
function encode(v) {
  if (v === null || v === undefined) return null;
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return Buffer.from(`\\x${Buffer.from(v).toString('hex')}`, 'utf8');
  if (typeof v === 'boolean') return Buffer.from(v ? 't' : 'f');
  if (Array.isArray(v)) return Buffer.from(`{${v.map((x) => (x === null ? 'NULL' : `"${String(x).replace(/["\\]/g, '\\$&')}"`)).join(',')}}`, 'utf8');
  return Buffer.from(String(v), 'utf8');
}

function readFields(buf) {
  const out = {};
  let i = 0;
  while (i < buf.length && buf[i] !== 0) {
    const code = String.fromCharCode(buf[i]);
    const end = buf.indexOf(0, i + 1);
    out[code] = buf.toString('utf8', i + 1, end);
    i = end + 1;
  }
  return out;
}

export async function connectPg(url, { connectTimeoutMs = 10000 } = {}) {
  const cfg = typeof url === 'string' ? parsePgUrl(url) : url;
  let socket = await new Promise((resolve, reject) => {
    const s = net.connect({ host: cfg.host, port: cfg.port });
    const t = setTimeout(() => { s.destroy(); reject(new Error(`Could not reach PostgreSQL at ${cfg.host}:${cfg.port} (timed out)`)); }, connectTimeoutMs);
    s.once('connect', () => { clearTimeout(t); resolve(s); });
    s.once('error', (e) => { clearTimeout(t); reject(e); });
  });
  socket.setNoDelay(true);
  socket.setKeepAlive(true, 30000);

  // TLS when the server offers it (sslmode=disable skips asking).
  if (cfg.sslmode !== 'disable') {
    socket.write(Buffer.concat([int32(8), int32(80877103)]));
    const answer = await new Promise((resolve, reject) => {
      socket.once('data', (d) => resolve(String.fromCharCode(d[0])));
      socket.once('error', reject);
    });
    if (answer === 'S') {
      socket = await new Promise((resolve, reject) => {
        const s = tls.connect({ socket, servername: net.isIP(cfg.host) ? undefined : cfg.host, rejectUnauthorized: cfg.sslmode === 'verify-full' || cfg.sslmode === 'verify-ca' });
        s.once('secureConnect', () => resolve(s));
        s.once('error', reject);
      });
    } else if (cfg.sslmode === 'require' || cfg.sslmode.startsWith('verify')) {
      socket.destroy();
      throw new Error('PostgreSQL does not offer TLS, but sslmode requires it');
    }
  }

  // Incoming bytes into whole messages.
  let pending = Buffer.alloc(0);
  let waiter = null; // resolves with the next message
  const inbox = [];
  let dead = null;
  const push = (m) => { if (waiter) { const w = waiter; waiter = null; w.resolve(m); } else inbox.push(m); };
  socket.on('data', (chunk) => {
    pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    while (pending.length >= 5) {
      const len = pending.readInt32BE(1);
      if (pending.length < len + 1) break;
      push({ type: String.fromCharCode(pending[0]), body: pending.subarray(5, len + 1) });
      pending = pending.subarray(len + 1);
    }
  });
  const fail = (e) => {
    dead = e || new Error('PostgreSQL connection closed');
    if (waiter) { const w = waiter; waiter = null; w.reject(dead); }
  };
  socket.on('error', fail);
  socket.on('close', () => fail(dead));
  const next = () => {
    if (inbox.length) return Promise.resolve(inbox.shift());
    if (dead) return Promise.reject(dead);
    return new Promise((resolve, reject) => { waiter = { resolve, reject }; });
  };

  // Start up and sign in.
  {
    const body = Buffer.concat([int32(196608), cstr('user'), cstr(cfg.user), cstr('database'), cstr(cfg.database), cstr('client_encoding'), cstr('UTF8'), cstr('application_name'), cstr('vertex'), Buffer.from([0])]);
    socket.write(Buffer.concat([int32(body.length + 4), body]));
  }
  let scram = null;
  const params = {};
  for (;;) {
    const m = await next();
    if (m.type === 'E') { socket.destroy(); throw new PgError(readFields(m.body)); }
    if (m.type === 'S') { const [k, v] = m.body.toString('utf8').split('\0'); params[k] = v; continue; }
    if (m.type === 'Z') break;
    if (m.type !== 'R') continue;
    const code = m.body.readInt32BE(0);
    if (code === 0) continue;
    if (code === 3) { socket.write(msg('p', cstr(cfg.password))); continue; }
    if (code === 5) {
      const inner = createHash('md5').update(cfg.password + cfg.user).digest('hex');
      const outer = createHash('md5').update(Buffer.concat([Buffer.from(inner), m.body.subarray(4, 8)])).digest('hex');
      socket.write(msg('p', cstr(`md5${outer}`)));
      continue;
    }
    if (code === 10) {
      const mechs = m.body.subarray(4).toString('utf8').split('\0').filter(Boolean);
      if (!mechs.includes('SCRAM-SHA-256')) throw new Error(`PostgreSQL asked for an unsupported sign-in method (${mechs.join(', ')})`);
      const nonce = randomBytes(18).toString('base64');
      scram = { nonce, bare: `n=*,r=${nonce}` };
      const first = Buffer.from(`n,,${scram.bare}`, 'utf8');
      socket.write(msg('p', cstr('SCRAM-SHA-256'), int32(first.length), first));
      continue;
    }
    if (code === 11) {
      const serverFirst = m.body.subarray(4).toString('utf8');
      const attrs = Object.fromEntries(serverFirst.split(',').map((kv) => [kv[0], kv.slice(2)]));
      if (!attrs.r?.startsWith(scram.nonce)) throw new Error('PostgreSQL sign-in failed (bad server nonce)');
      const salted = pbkdf2Sync(cfg.password.normalize('NFKC'), Buffer.from(attrs.s, 'base64'), Number(attrs.i), 32, 'sha256');
      const clientKey = createHmac('sha256', salted).update('Client Key').digest();
      const storedKey = createHash('sha256').update(clientKey).digest();
      const withoutProof = `c=biws,r=${attrs.r}`;
      const authMessage = `${scram.bare},${serverFirst},${withoutProof}`;
      const signature = createHmac('sha256', storedKey).update(authMessage).digest();
      const proof = Buffer.from(clientKey.map((b, i) => b ^ signature[i]));
      scram.serverSignature = createHmac('sha256', createHmac('sha256', salted).update('Server Key').digest()).update(authMessage).digest('base64');
      socket.write(msg('p', Buffer.from(`${withoutProof},p=${proof.toString('base64')}`, 'utf8')));
      continue;
    }
    if (code === 12) {
      const v = m.body.subarray(4).toString('utf8').split(',').find((x) => x.startsWith('v='))?.slice(2);
      if (v !== scram.serverSignature) { socket.destroy(); throw new Error('PostgreSQL sign-in failed (server signature did not match)'); }
      continue;
    }
    socket.destroy();
    throw new Error(`PostgreSQL asked for an unsupported sign-in method (${code})`);
  }

  // Queries run one at a time, in the order they were asked for.
  let chain = Promise.resolve();
  async function run(text, values) {
    const vals = (values || []).map(encode);
    socket.write(Buffer.concat([
      msg('P', cstr(''), cstr(text), int16(0)),
      msg('B', cstr(''), cstr(''), int16(0), int16(vals.length), ...vals.flatMap((v) => (v === null ? [int32(-1)] : [int32(v.length), v])), int16(0)),
      msg('D', Buffer.from('P'), cstr('')),
      msg('E', cstr(''), int32(0)),
      msg('S'),
    ]));
    let fields = [];
    const rows = [];
    let command = '';
    let error = null;
    for (;;) {
      const m = await next();
      if (m.type === 'T') {
        const n = m.body.readInt16BE(0);
        let i = 2;
        fields = [];
        for (let f = 0; f < n; f++) {
          const end = m.body.indexOf(0, i);
          const name = m.body.toString('utf8', i, end);
          i = end + 1;
          const oid = m.body.readInt32BE(i + 6);
          i += 18;
          fields.push({ name, oid });
        }
      } else if (m.type === 'D') {
        const n = m.body.readInt16BE(0);
        let i = 2;
        const row = {};
        for (let c = 0; c < n; c++) {
          const len = m.body.readInt32BE(i);
          i += 4;
          if (len === -1) { row[fields[c].name] = null; continue; }
          row[fields[c].name] = decode(fields[c].oid, m.body.toString('utf8', i, i + len));
          i += len;
        }
        rows.push(row);
      } else if (m.type === 'C') command = m.body.toString('utf8', 0, m.body.length - 1);
      else if (m.type === 'E') error = new PgError(readFields(m.body));
      else if (m.type === 'Z') break;
    }
    if (error) throw error;
    const count = Number(command.split(' ').pop());
    return { rows, fields: fields.map((f) => f.name), command, rowCount: Number.isFinite(count) ? count : rows.length };
  }
  // Several statements at once (schema changes); no parameters.
  async function runSimple(text) {
    socket.write(msg('Q', cstr(text)));
    let error = null;
    for (;;) {
      const m = await next();
      if (m.type === 'E') error = new PgError(readFields(m.body));
      else if (m.type === 'Z') break;
    }
    if (error) throw error;
  }
  const queue = (fn) => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };

  return {
    params,
    get closed() { return Boolean(dead); },
    query: (text, values) => queue(() => run(text, values)),
    exec: (text) => queue(() => runSimple(text)),
    async close() {
      await chain;
      try { socket.write(msg('X')); } catch {}
      socket.end();
      dead = new Error('PostgreSQL connection closed');
    },
  };
}
