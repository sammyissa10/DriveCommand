/**
 * quick-604 — give every seeded staging `public."User"` a real Supabase Auth
 * login, so the click-through can drive a real session over real HTTP.
 *
 *   npx tsx scripts/seed-staging-auth.ts --seed
 *   npx tsx scripts/seed-staging-auth.ts --verify
 *   npx tsx scripts/seed-staging-auth.ts --teardown
 *
 * STAGING ONLY. THIS FILE MUST NEVER IMPORT `scripts/_bootstrap-env` — it
 * assigns `DATABASE_URL = DIRECT_URL` unconditionally and every env file points
 * `DIRECT_URL` at PRODUCTION. This file loads `apps/web/.env.staging`
 * explicitly and refuses on the production ref before opening a connection.
 *
 * ─── WHY THE ROWS ARE WRITTEN DIRECTLY ─────────────────────────────────────
 *
 * `docs/audits/staging-environment.md` §9 records the auth gap as needing the
 * staging service-role key. **It does not.** Staging's `/auth/v1/settings` has
 * `disable_signup: false` but `mailer_autoconfirm: false`, and the built-in
 * mailer 429s after ~3 sends — so the app's own signup can never yield a
 * session. Writing `auth.users` + `auth.identities` as `postgres` and then
 * calling `POST /auth/v1/token?grant_type=password` with the ANON key does,
 * and `raw_app_meta_data` flows straight into the JWT's `app_metadata`, which
 * is where `lib/auth/supabase.ts:getSession` reads `role` and `tenantId`.
 *
 * ─── THE GOTCHA THAT COST THREE ATTEMPTS ───────────────────────────────────
 *
 * GoTrue answers `500 "Database error querying schema"` when the token columns
 * are NULL — its Go structs scan them into non-nullable strings. ALL EIGHT of
 * `confirmation_token`, `recovery_token`, `email_change_token_new`,
 * `email_change`, `email_change_token_current`, `phone_change`,
 * `phone_change_token`, `reauthentication_token` must be `''`, never NULL.
 * This is measured, not guessed. Do not "tidy" them back to NULL.
 *
 * ─── THE ID IS READ BACK, NEVER MINTED ─────────────────────────────────────
 *
 * `getCurrentUser()` does `prisma.user.findUnique({ where: { id:
 * session.userId } })` against the SUPABASE AUTH user id. So
 * `auth.users.id` MUST equal `public."User".id`. A mismatch makes every surface
 * fail on "Account setup incomplete" instead of on the thing quick-604 measures
 * — a false-positive failure list, which is worse than no list.
 *
 * ─── THE PASSWORD ──────────────────────────────────────────────────────────
 *
 * Generated on first `--seed` and written to the GITIGNORED
 * `apps/web/.env.staging` as `STAGING_SEED_PASSWORD`. Never a literal in this
 * file, never printed.
 */

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { randomBytes } from 'crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';
const STAGING_SUPABASE_URL = `https://${STAGING_REF}.supabase.co`;
/** Staging ANON key — a public key by design. Not a credential. */
const STAGING_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5aXhwZ3Vubmptemd1aGdnb2N6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5OTE1MzQsImV4cCI6MjEwNDU2NzUzNH0.KmTrJZtcJNIXwKlJ65-TZ2X7hVjrRG9EHNADBKCd7Zs';

const APP_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(APP_ROOT, '../..');
const ENV_STAGING = resolve(APP_ROOT, '.env.staging');
const EVIDENCE_DIR = resolve(
  REPO_ROOT,
  '.planning/quick/604-run-staging-as-app-user-end-to-end-and-r/evidence',
);

loadEnv({ path: ENV_STAGING, quiet: true });

function refuse(reason: string): never {
  console.error(`seed-staging-auth: REFUSING TO RUN — ${reason}`);
  process.exit(1);
}

const DIRECT_URL = process.env.STAGING_DIRECT_URL;
if (!DIRECT_URL) refuse('STAGING_DIRECT_URL is not set in apps/web/.env.staging');
if (DIRECT_URL.includes(PRODUCTION_REF)) refuse('STAGING_DIRECT_URL names the PRODUCTION project');
if (!DIRECT_URL.includes(STAGING_REF)) refuse('STAGING_DIRECT_URL does not name the staging project');

/** The eight columns GoTrue scans into non-nullable Go strings. */
const TOKEN_COLUMNS = [
  'confirmation_token',
  'recovery_token',
  'email_change_token_new',
  'email_change',
  'email_change_token_current',
  'phone_change',
  'phone_change_token',
  'reauthentication_token',
] as const;

// ---------------------------------------------------------------------------

type UserRow = {
  id: string;
  email: string;
  role: string;
  tenantId: string;
  firstName: string | null;
  lastName: string | null;
};

async function withClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({
    connectionString: DIRECT_URL,
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS ?? 30000),
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function ensurePassword(): string {
  const existing = process.env.STAGING_SEED_PASSWORD;
  if (existing && existing.length >= 12) return existing;
  const pw = randomBytes(18).toString('base64url');
  const text = existsSync(ENV_STAGING) ? readFileSync(ENV_STAGING, 'utf8') : '';
  const sep = text.endsWith('\n') || text === '' ? '' : '\n';
  appendFileSync(
    ENV_STAGING,
    `${sep}\n# quick-604 — password for the seeded staging auth.users fixtures. Gitignored.\nSTAGING_SEED_PASSWORD=${pw}\n`,
  );
  process.env.STAGING_SEED_PASSWORD = pw;
  console.log('  generated STAGING_SEED_PASSWORD and appended it to apps/web/.env.staging');
  return pw;
}

// ---------------------------------------------------------------------------
// --seed
// ---------------------------------------------------------------------------

async function seed() {
  const password = ensurePassword();

  const result = await withClient(async (c) => {
    const users = (
      await c.query<UserRow>(
        'SELECT id, email, role, "tenantId", "firstName", "lastName" FROM public."User" ORDER BY email',
      )
    ).rows;

    if (users.length === 0) {
      refuse('public."User" is empty on staging — run scripts/seed-staging.ts first');
    }

    const tokenCols = TOKEN_COLUMNS.join(', ');
    const tokenVals = TOKEN_COLUMNS.map(() => "''").join(', ');

    for (const u of users) {
      const appMeta = {
        provider: 'email',
        providers: ['email'],
        role: u.role,
        tenantId: u.tenantId,
      };
      const userMeta = { firstName: u.firstName ?? '', lastName: u.lastName ?? '' };

      await c.query(
        `INSERT INTO auth.users (
           instance_id, id, aud, role, email, encrypted_password,
           email_confirmed_at, created_at, updated_at,
           raw_app_meta_data, raw_user_meta_data,
           ${tokenCols}
         ) VALUES (
           '00000000-0000-0000-0000-000000000000'::uuid, $1::uuid, 'authenticated', 'authenticated',
           $2, crypt($3, gen_salt('bf')),
           now(), now(), now(),
           $4::jsonb, $5::jsonb,
           ${tokenVals}
         )
         ON CONFLICT (id) DO UPDATE SET
           email              = EXCLUDED.email,
           encrypted_password = EXCLUDED.encrypted_password,
           email_confirmed_at = now(),
           updated_at         = now(),
           raw_app_meta_data  = EXCLUDED.raw_app_meta_data,
           raw_user_meta_data = EXCLUDED.raw_user_meta_data,
           ${TOKEN_COLUMNS.map((k) => `${k} = ''`).join(', ')}`,
        [u.id, u.email, password, JSON.stringify(appMeta), JSON.stringify(userMeta)],
      );

      await c.query(
        `INSERT INTO auth.identities (
           provider_id, user_id, identity_data, provider,
           last_sign_in_at, created_at, updated_at
         ) VALUES ($1, $2::uuid, $3::jsonb, 'email', now(), now(), now())
         ON CONFLICT (provider, provider_id) DO UPDATE SET
           identity_data = EXCLUDED.identity_data,
           updated_at    = now()`,
        [u.id, u.id, JSON.stringify({ sub: u.id, email: u.email })],
      );
    }

    const authCount = (await c.query<{ n: number }>('SELECT count(*)::int AS n FROM auth.users')).rows[0].n;
    const identCount = (
      await c.query<{ n: number }>('SELECT count(*)::int AS n FROM auth.identities')
    ).rows[0].n;
    const nullTokens = (
      await c.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM auth.users WHERE ${TOKEN_COLUMNS.map((k) => `${k} IS NULL`).join(' OR ')}`,
      )
    ).rows[0].n;

    return { users, authCount, identCount, nullTokens };
  });

  console.log(`  public."User" rows        : ${result.users.length}`);
  console.log(`  auth.users rows           : ${result.authCount}`);
  console.log(`  auth.identities rows      : ${result.identCount}`);
  console.log(`  rows with a NULL token col: ${result.nullTokens}  (must be 0)`);

  const ok = result.users.length === result.authCount && result.nullTokens === 0;
  if (!ok) {
    console.error('seed-staging-auth: ASSERTION FAILED — counts differ or a token column is NULL');
    process.exit(1);
  }
  console.log('seed-staging-auth --seed: OK');
}

// ---------------------------------------------------------------------------
// --verify — four real logins against GoTrue
// ---------------------------------------------------------------------------

function decodeJwtPayload(token: string): any {
  const part = token.split('.')[1];
  return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
}

async function verify() {
  const password = process.env.STAGING_SEED_PASSWORD;
  if (!password) refuse('STAGING_SEED_PASSWORD is not set — run --seed first');

  const targets = await withClient(async (c) => {
    // One OWNER and one DRIVER on EACH tenant.
    const rows = (
      await c.query<UserRow>(
        `SELECT DISTINCT ON ("tenantId", role) id, email, role, "tenantId", "firstName", "lastName"
           FROM public."User"
          WHERE role IN ('OWNER', 'DRIVER')
          ORDER BY "tenantId", role, email`,
      )
    ).rows;
    return rows;
  });

  const results: any[] = [];
  for (const t of targets) {
    const res = await fetch(`${STAGING_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: STAGING_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: t.email, password }),
    });
    const status = res.status;
    const body: any = await res.json().catch(() => ({}));
    const token = body?.access_token as string | undefined;
    const claims = token ? decodeJwtPayload(token) : null;
    const entry = {
      email: t.email,
      expectedRole: t.role,
      expectedTenantId: t.tenantId,
      status,
      hasAccessToken: Boolean(token),
      jwtSub: claims?.sub ?? null,
      jwtRole: claims?.app_metadata?.role ?? null,
      jwtTenantId: claims?.app_metadata?.tenantId ?? null,
      roleMatches: claims?.app_metadata?.role === t.role,
      tenantMatches: claims?.app_metadata?.tenantId === t.tenantId,
      subMatchesUserId: claims?.sub === t.id,
      error: token ? null : (body?.error_description ?? body?.msg ?? body?.error ?? 'NO_TOKEN'),
    };
    results.push(entry);
    console.log(
      `  ${status} ${t.email.padEnd(32)} role=${entry.jwtRole} tenant=${entry.tenantMatches ? 'MATCH' : 'MISMATCH'} sub=${entry.subMatchesUserId ? 'MATCH' : 'MISMATCH'}`,
    );
  }

  if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
  const counts = await withClient(async (c) => ({
    users: (await c.query<{ n: number }>('SELECT count(*)::int AS n FROM public."User"')).rows[0].n,
    authUsers: (await c.query<{ n: number }>('SELECT count(*)::int AS n FROM auth.users')).rows[0].n,
    identities: (await c.query<{ n: number }>('SELECT count(*)::int AS n FROM auth.identities')).rows[0].n,
  }));

  writeFileSync(
    resolve(EVIDENCE_DIR, '03-seed.json'),
    JSON.stringify({ task: 'quick-604', at: new Date().toISOString(), counts, logins: results }, null, 2) + '\n',
  );

  const bad = results.filter((r) => r.status !== 200 || !r.roleMatches || !r.tenantMatches || !r.subMatchesUserId);
  if (results.length < 4) {
    console.error(`seed-staging-auth --verify: expected at least 4 logins, got ${results.length}`);
    process.exit(1);
  }
  if (bad.length) {
    console.error(`seed-staging-auth --verify: ${bad.length} login(s) failed`);
    process.exit(1);
  }
  if (counts.users !== counts.authUsers) {
    console.error(`seed-staging-auth --verify: User=${counts.users} but auth.users=${counts.authUsers}`);
    process.exit(1);
  }
  console.log('seed-staging-auth --verify: OK');
}

// ---------------------------------------------------------------------------
// --teardown
// ---------------------------------------------------------------------------

async function teardown() {
  const n = await withClient(async (c) => {
    await c.query('DELETE FROM auth.identities');
    await c.query('DELETE FROM auth.users');
    return (await c.query<{ n: number }>('SELECT count(*)::int AS n FROM auth.users')).rows[0].n;
  });
  console.log(`  auth.users after teardown: ${n}`);
  if (n !== 0) {
    console.error('seed-staging-auth --teardown: ASSERTION FAILED — auth.users is not 0');
    process.exit(1);
  }
  console.log('seed-staging-auth --teardown: OK');
}

// ---------------------------------------------------------------------------

const phase = process.argv[2];
if (phase === '--seed') seed();
else if (phase === '--verify') verify();
else if (phase === '--teardown') teardown();
else {
  console.error('usage: npx tsx scripts/seed-staging-auth.ts --seed|--verify|--teardown');
  process.exit(1);
}
