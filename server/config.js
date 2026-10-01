// Runtime configuration from environment variables (Railway → the API service → Variables).
const flag = (v, def = false) => (v === undefined ? def : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));

export function loadConfig(rawEnv = process.env) {
  // Values pasted into a hosting dashboard often pick up spaces or quotes; drop them.
  const env = new Proxy(rawEnv, { get: (o, k) => (typeof o[k] === 'string' ? o[k].trim().replace(/^(["'])(.*)\1$/, '$2').trim() : o[k]) });
  const publicUrl = (env.PUBLIC_URL || 'http://localhost:8090').replace(/\/+$/, '');
  return {
    port: Number(env.PORT || 8090),
    host: env.HOST || '0.0.0.0',
    databasePath: env.DATABASE_PATH || 'data/api.db',
    // PostgreSQL that keeps a full copy of this site's data (Railway: ${{Postgres-API.DATABASE_URL}}).
    databaseUrl: env.DATABASE_URL || '',
    // This site's own address: https://api.mintmotivesolutions.com.au
    publicUrl,
    secureCookies: publicUrl.startsWith('https://'),
    trustProxy: flag(env.TRUST_PROXY),
    // VERTEX, where accounts live, and the secret both sides share (API_LINK_SECRET on both services).
    vertexUrl: (env.VERTEX_URL || 'https://vertex.mintmotive.com.au').replace(/\/+$/, ''),
    linkSecret: env.API_LINK_SECRET || '',
    stripe: { secretKey: env.STRIPE_SECRET_KEY || '', webhookSecret: env.STRIPE_WEBHOOK_SECRET || '', currency: (env.STRIPE_CURRENCY || 'aud').toLowerCase() },
    // The tracer's settings (read by tool-library.js) come straight from the environment.
    env: rawEnv,
    version: env.RAILWAY_GIT_COMMIT_SHA ? env.RAILWAY_GIT_COMMIT_SHA.slice(0, 7) : 'dev',
  };
}
