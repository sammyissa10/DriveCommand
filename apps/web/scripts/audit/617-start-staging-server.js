/**
 * quick-617 — start `next dev` pointed at STAGING as `app_user`, tripwire armed.
 *
 *   node scripts/audit/617-start-staging-server.js <absolute-log-path>
 *
 * Reproduces quick-616's launcher, which was ad-hoc and left only its stderr
 * banner behind in the evidence. Committed this time so the next run does not
 * have to reconstruct it from a log file.
 *
 * REFUSES POSITIVELY on all four target-deciding values — a negative-only check
 * ("not production") passes on a third, unknown database. Every one is printed
 * with the credential MASKED, because an operator must never have to infer the
 * target (quick-607).
 *
 * NEVER imports `scripts/_bootstrap-env`: it does `DATABASE_URL = DIRECT_URL`,
 * and in this repo `DIRECT_URL` points at PRODUCTION.
 *
 * `CRON_SECRET` is not in any env file on this machine and the click-through
 * harness REFUSES without it ("the cron sweep would measure auth, not RLS").
 * A random one is generated per run and exported to this process only — never
 * written to a tracked file. quick-616 hit the same refusal; it is named here so
 * the next person does not have to rediscover it.
 */

const { spawn } = require('child_process');
const { randomBytes } = require('crypto');
const { openSync, mkdirSync, writeSync } = require('fs');
const { resolve, dirname } = require('path');
const dotenv = require('dotenv');

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';
const APP_ROOT = resolve(__dirname, '../..');

const logPath = process.argv[2];
if (!logPath) {
  console.error('usage: 617-start-staging-server.js <absolute-log-path>');
  process.exit(1);
}

const staged = dotenv.config({ path: resolve(APP_ROOT, '.env.staging'), processEnv: {} }).parsed || {};

function refuse(msg) {
  console.error(`617-start-staging-server: REFUSING — ${msg}`);
  process.exit(1);
}

/** POSITIVE refusal, and the masked banner line. */
function requireStaging(name, raw) {
  if (!raw) refuse(`${name} is not set in .env.staging`);
  if (raw.includes(PRODUCTION_REF)) refuse(`${name} names PRODUCTION (${PRODUCTION_REF})`);
  if (!raw.includes(STAGING_REF)) refuse(`${name} does not name staging (${STAGING_REF})`);
  return `[server-target] ${name} -> staging ${STAGING_REF} (credential MASKED)`;
}

const DATABASE_URL = staged.STAGING_DATABASE_URL_APP_USER;
const DIRECT_URL = staged.STAGING_DIRECT_URL;
const DATABASE_URL_ADMIN = staged.STAGING_DATABASE_URL_ADMIN;
const SUPABASE_URL = staged.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = staged.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const banner = [
  requireStaging('DATABASE_URL', DATABASE_URL),
  requireStaging('DIRECT_URL', DIRECT_URL),
  requireStaging('DATABASE_URL_ADMIN', DATABASE_URL_ADMIN),
  requireStaging('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL),
  '[server-target] TENANT_CONTEXT_TRIPWIRE=on',
  `[server-target] DATABASE_URL role : ${new URL(DATABASE_URL).username}`,
  `[server-target] anon key present : ${!!ANON_KEY} | length ${ANON_KEY ? ANON_KEY.length : 0} | MASKED ${
    ANON_KEY ? ANON_KEY.slice(0, 6) + '...' + ANON_KEY.slice(-4) : 'ABSENT'
  }`,
];
if (!ANON_KEY) refuse('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set in .env.staging');

const CRON_SECRET = process.env.CRON_SECRET || randomBytes(24).toString('hex');
banner.push('[server-target] CRON_SECRET generated for this run (MASKED, never written to a tracked file)');

mkdirSync(dirname(logPath), { recursive: true });
const fd = openSync(logPath, 'w');
for (const l of banner) {
  writeSync(fd, l + '\n');
  console.error(l);
}
console.error(`[server-target] CRON_SECRET=${CRON_SECRET}`); // stderr only, for the harness to pick up

const env = {
  ...process.env,
  DATABASE_URL,
  DIRECT_URL,
  DATABASE_URL_ADMIN,
  NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  TENANT_CONTEXT_TRIPWIRE: 'on',
  CRON_SECRET,
  NODE_ENV: 'development',
};

const child = spawn('npx', ['next', 'dev', '--port', '3000'], {
  cwd: APP_ROOT,
  env,
  stdio: ['ignore', fd, fd],
  shell: process.platform === 'win32',
});
child.on('exit', (code) => process.exit(code ?? 0));
