/**
 * quick-604 — the ledger for "run staging as `app_user` end to end".
 *
 *   npx tsx scripts/audit/604-survey.ts --open
 *   npx tsx scripts/audit/604-survey.ts --close
 *
 * `--open` reads production (READ-ONLY, SELECT statements only, from one frozen
 * array) and staging, and writes evidence/01-open.json + 01-open.md.
 * `--close` re-reads the same production fields plus the two env-file hashes and
 * asserts byte-for-byte equality against 01-open.json. Any mismatch exits 1.
 *
 * STAGING ONLY FOR WRITES — this file never issues a non-SELECT anywhere, on
 * either database.
 *
 * THIS FILE MUST NEVER IMPORT `scripts/_bootstrap-env`.
 * ----------------------------------------------------
 * `_bootstrap-env.ts` runs `process.env.DATABASE_URL = process.env.DIRECT_URL`
 * UNCONDITIONALLY, and every env file points `DIRECT_URL` at PRODUCTION. This
 * file loads `apps/web/.env.staging` explicitly for the staging strings and the
 * repo-root `.env` for the production read, and refuses on a ref mismatch before
 * opening any connection. Modelled on `scripts/audit/601-provisioning-verify.ts`.
 *
 * GROUND RULES
 *   1. Every production statement comes from PRODUCTION_SELECTS, a frozen array
 *      of SELECT-only SQL. There is no other production statement path in this
 *      file, and a runtime assertion refuses any entry not starting `SELECT`.
 *   2. Nothing is swallowed. Every reading records a value or an
 *      `{error:{code,message}}` with the SQLSTATE and the full server message.
 *   3. Connection strings are never printed. Only the project ref is echoed.
 *   4. A failed assertion exits 1 loudly. A recorded-not-asserted reading is
 *      labelled as such in the evidence.
 */

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';

const APP_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(APP_ROOT, '../..');
const EVIDENCE_DIR = resolve(
  REPO_ROOT,
  '.planning/quick/604-run-staging-as-app-user-end-to-end-and-r/evidence',
);

const ROOT_ENV = resolve(REPO_ROOT, '.env');
const APP_ENV_LOCAL = resolve(APP_ROOT, '.env.local');

loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });

function refuse(reason: string): never {
  console.error(`604-survey: REFUSING TO RUN — ${reason}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// The production baseline, captured at task start and asserted at both ends.
// ---------------------------------------------------------------------------

const EXPECTED_PROD_LEDGER_ROWS = 156;
const EXPECTED_PROD_POLICIES = 183;
const EXPECTED_PROD_HEAD_MIGRATION =
  '20260914170000_activation_progress_congrats_shown_at';

/**
 * EVERY statement this file issues against production. Frozen, SELECT-only, and
 * checked at runtime. There is no other production statement path in this file.
 */
const PRODUCTION_SELECTS = Object.freeze({
  ledgerRows: 'SELECT count(*)::int AS n FROM public._prisma_migrations',
  policies:
    "SELECT count(*)::int AS n FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'",
  headMigration:
    'SELECT migration_name FROM public._prisma_migrations ORDER BY finished_at DESC NULLS LAST, started_at DESC LIMIT 1',
  identity:
    'SELECT current_user AS cu, current_database() AS db, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass',
});

for (const [name, sql] of Object.entries(PRODUCTION_SELECTS)) {
  if (!/^SELECT\b/i.test(sql.trim())) {
    refuse(`PRODUCTION_SELECTS.${name} is not a SELECT — this file reads production only`);
  }
}

// ---------------------------------------------------------------------------
// Connection strings
// ---------------------------------------------------------------------------

function readProductionDirectUrl(): string {
  if (!existsSync(ROOT_ENV)) refuse('repo-root .env not found');
  const text = readFileSync(ROOT_ENV, 'utf8').replace(/\r\n/g, '\n');
  const m = text.match(/^DIRECT_URL\s*=\s*"?([^"\n]+)"?\s*$/m);
  if (!m) refuse('DIRECT_URL not found in repo-root .env');
  const url = m[1];
  if (!url.includes(PRODUCTION_REF)) {
    refuse('repo-root .env DIRECT_URL does not name the production project — refusing to guess');
  }
  return url;
}

const STAGING_APP_USER_RAW = process.env.STAGING_DATABASE_URL_APP_USER;
if (!STAGING_APP_USER_RAW) refuse('STAGING_DATABASE_URL_APP_USER is not set in apps/web/.env.staging');
if (STAGING_APP_USER_RAW.includes(PRODUCTION_REF)) refuse('STAGING_DATABASE_URL_APP_USER names PRODUCTION');
if (!STAGING_APP_USER_RAW.includes(STAGING_REF)) refuse('STAGING_DATABASE_URL_APP_USER does not name staging');

/** 6543 is not reachable from this machine; 5432 is the same role on the same db. */
const STAGING_APP_USER_URL = STAGING_APP_USER_RAW.replace(':6543/', ':5432/').replace(
  '?pgbouncer=true',
  '',
);

function refOf(url: string): string {
  const m = url.match(/postgres\.([a-z0-9]+):/);
  return m ? m[1] : 'UNKNOWN';
}

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

type Reading<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } };

function errOf(e: unknown): { code: string; message: string } {
  const any = e as { code?: string; message?: string };
  return { code: any?.code ?? 'SQLSTATE_UNRECOVERED', message: String(any?.message ?? e) };
}

async function withClient<T>(connectionString: string, fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS ?? 30000),
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function read<T>(client: Client, sql: string, pick: (rows: any[]) => T): Promise<Reading<T>> {
  try {
    const r = await client.query(sql);
    return { ok: true, value: pick(r.rows) };
  } catch (e) {
    return { ok: false, error: errOf(e) };
  }
}

function sha256File(path: string): string {
  if (!existsSync(path)) return 'FILE_ABSENT';
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function value<T>(r: Reading<T>, label: string): T {
  if (!r.ok) {
    console.error(`604-survey: ${label} could not be read — ${r.error.code} ${r.error.message}`);
    process.exit(1);
  }
  return r.value;
}

// ---------------------------------------------------------------------------
// Production read — SELECT only, from the frozen array
// ---------------------------------------------------------------------------

async function readProduction() {
  const url = readProductionDirectUrl();
  return withClient(url, async (c) => ({
    ref: refOf(url),
    identity: await read(c, PRODUCTION_SELECTS.identity, (r) => ({
      currentUser: r[0].cu as string,
      database: r[0].db as string,
      rolbypassrls: r[0].bypass as boolean,
    })),
    ledgerRows: await read(c, PRODUCTION_SELECTS.ledgerRows, (r) => r[0].n as number),
    policies: await read(c, PRODUCTION_SELECTS.policies, (r) => r[0].n as number),
    headMigration: await read(
      c,
      PRODUCTION_SELECTS.headMigration,
      (r) => (r[0]?.migration_name ?? null) as string | null,
    ),
  }));
}

// ---------------------------------------------------------------------------
// Staging read — app_user
// ---------------------------------------------------------------------------

async function readStaging() {
  return withClient(STAGING_APP_USER_URL, async (c) => ({
    ref: refOf(STAGING_APP_USER_URL),
    port: STAGING_APP_USER_URL.includes(':5432/') ? 5432 : 6543,
    identity: await read(c, PRODUCTION_SELECTS.identity, (r) => ({
      currentUser: r[0].cu as string,
      database: r[0].db as string,
      rolbypassrls: r[0].bypass as boolean,
    })),
    ledgerRows: await read(c, 'SELECT count(*)::int AS n FROM public._prisma_migrations', (r) => r[0].n as number),
    policies: await read(c, PRODUCTION_SELECTS.policies, (r) => r[0].n as number),
    tenantContextRequiredPresent: await read(
      c,
      "SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND p.proname='tenant_context_required'",
      (r) => (r[0].n as number) > 0,
    ),
    currentTenantIdBody: await read(
      c,
      "SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND p.proname='current_tenant_id' LIMIT 1",
      (r) => (r[0]?.def ?? null) as string | null,
    ),
    bypassPolicies: await read(
      c,
      "SELECT count(*)::int AS n FROM pg_policy WHERE polname = 'bypass_rls_policy'",
      (r) => r[0].n as number,
    ),
    rowCounts: await read(
      c,
      `SELECT
         (SELECT count(*)::int FROM public."Tenant")        AS tenants,
         (SELECT count(*)::int FROM public."User")          AS users,
         (SELECT count(*)::int FROM public.loads)           AS loads,
         (SELECT count(*)::int FROM public.carrier_drivers) AS carrier_drivers`,
      (r) => r[0] as Record<string, number>,
    ),
  }));
}

/** `auth.users` is not readable as `app_user`; read it on the privileged string. */
async function readStagingAuthUsers(): Promise<Reading<number>> {
  const direct = process.env.STAGING_DIRECT_URL;
  if (!direct) return { ok: false, error: { code: 'ENV_MISSING', message: 'STAGING_DIRECT_URL unset' } };
  if (direct.includes(PRODUCTION_REF)) refuse('STAGING_DIRECT_URL names PRODUCTION');
  if (!direct.includes(STAGING_REF)) refuse('STAGING_DIRECT_URL does not name staging');
  try {
    return await withClient(direct, (c) =>
      read(c, 'SELECT count(*)::int AS n FROM auth.users', (r) => r[0].n as number),
    );
  } catch (e) {
    return { ok: false, error: errOf(e) };
  }
}

// ---------------------------------------------------------------------------
// --open
// ---------------------------------------------------------------------------

async function open() {
  if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });

  console.log(`604-survey --open`);
  console.log(`  production ref : ${PRODUCTION_REF} (read-only, SELECT only)`);
  console.log(`  staging ref    : ${STAGING_REF}`);

  const prod = await readProduction();
  const prodLedgerRows = value(prod.ledgerRows, 'production _prisma_migrations count');
  const prodPolicies = value(prod.policies, 'production pg_policy count');
  const prodHead = value(prod.headMigration, 'production head migration');

  const hashes = {
    rootEnv: sha256File(ROOT_ENV),
    appEnvLocal: sha256File(APP_ENV_LOCAL),
  };

  const staging = await readStaging();
  const authUsers = await readStagingAuthUsers();

  const record = {
    task: 'quick-604',
    phase: 'open',
    at: new Date().toISOString(),
    production: {
      ref: prod.ref,
      identity: prod.identity,
      prodLedgerRows,
      prodPolicies,
      prodHeadMigration: prodHead,
      expected: {
        ledgerRows: EXPECTED_PROD_LEDGER_ROWS,
        policies: EXPECTED_PROD_POLICIES,
        headMigration: EXPECTED_PROD_HEAD_MIGRATION,
      },
    },
    envFileHashes: hashes,
    staging,
    stagingAuthUsers: authUsers,
    appUserRoleCheck: staging.identity.ok
      ? `${staging.identity.value.currentUser}/${staging.identity.value.rolbypassrls}`
      : 'UNREADABLE',
  };

  const failures: string[] = [];
  if (prodLedgerRows !== EXPECTED_PROD_LEDGER_ROWS)
    failures.push(`production _prisma_migrations = ${prodLedgerRows}, expected ${EXPECTED_PROD_LEDGER_ROWS}`);
  if (prodPolicies !== EXPECTED_PROD_POLICIES)
    failures.push(`production pg_policy(public) = ${prodPolicies}, expected ${EXPECTED_PROD_POLICIES}`);
  if (prodHead !== EXPECTED_PROD_HEAD_MIGRATION)
    failures.push(`production head migration = ${prodHead}, expected ${EXPECTED_PROD_HEAD_MIGRATION}`);

  const ident = value(staging.identity, 'staging identity');
  if (ident.currentUser !== 'app_user') failures.push(`staging current_user = ${ident.currentUser}, expected app_user`);
  if (ident.rolbypassrls !== false) failures.push(`staging rolbypassrls = ${ident.rolbypassrls}, expected false`);
  const tcr = value(staging.tenantContextRequiredPresent, 'staging tenant_context_required');
  if (tcr !== true) failures.push('public.tenant_context_required is absent on staging');

  writeFileSync(resolve(EVIDENCE_DIR, '01-open.json'), JSON.stringify(record, null, 2) + '\n');
  writeFileSync(resolve(EVIDENCE_DIR, '01-open.md'), renderOpenMd(record, failures));

  for (const f of failures) console.error(`604-survey: ASSERTION FAILED — ${f}`);
  console.log(
    `  production: ledger=${prodLedgerRows} policies=${prodPolicies} head=${prodHead}`,
  );
  console.log(`  staging:    ${record.appUserRoleCheck}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

function renderOpenMd(r: any, failures: string[]): string {
  const s = r.staging;
  const v = (x: any, path?: string) =>
    x?.ok ? (path ? JSON.stringify(x.value[path]) : JSON.stringify(x.value)) : `ERROR ${x?.error?.code}`;
  const tripwireArmed =
    s.currentTenantIdBody?.ok && typeof s.currentTenantIdBody.value === 'string'
      ? s.currentTenantIdBody.value.includes('tenant_context_required')
        ? 'YES — `tenant_context_required` is in the body'
        : 'NO'
      : 'UNREADABLE';
  return `# quick-604 · 01 — the ledger at OPEN

Taken ${r.at}. Production is read **read-only**, with every statement drawn from
one frozen SELECT-only array in \`scripts/audit/604-survey.ts\`. No other
production statement path exists in that file.

## Production — \`${r.production.ref}\`

| reading | value | expected | verdict |
|---|---|---|---|
| \`_prisma_migrations\` rows | **${r.production.prodLedgerRows}** | 156 | ${r.production.prodLedgerRows === 156 ? 'MATCH' : 'MISMATCH'} |
| \`pg_policy\` in \`public\` | **${r.production.prodPolicies}** | 183 | ${r.production.prodPolicies === 183 ? 'MATCH' : 'MISMATCH'} |
| newest \`migration_name\` | \`${r.production.prodHeadMigration}\` | \`20260914170000_activation_progress_congrats_shown_at\` | ${r.production.prodHeadMigration === '20260914170000_activation_progress_congrats_shown_at' ? 'MATCH' : 'MISMATCH'} |
| connection identity | ${v(r.production.identity)} | — | recorded |

## Env-file hashes (compared again at close)

| file | sha256 |
|---|---|
| repo-root \`.env\` | \`${r.envFileHashes.rootEnv}\` |
| \`apps/web/.env.local\` | \`${r.envFileHashes.appEnvLocal}\` |

## Staging — \`${s.ref}\`, port ${s.port}, over \`STAGING_DATABASE_URL_APP_USER\`

| reading | value | asserted? |
|---|---|---|
| \`current_user\` / \`current_database\` / \`rolbypassrls\` | ${v(s.identity)} | **yes** — \`app_user\`, \`rolbypassrls=false\` |
| \`_prisma_migrations\` rows | ${v(s.ledgerRows)} | recorded (156 expected) |
| \`pg_policy\` in \`public\` | ${v(s.policies)} | recorded (183 expected) |
| \`public.tenant_context_required\` present | ${v(s.tenantContextRequiredPresent)} | **yes** |
| tripwire branch inside \`current_tenant_id()\` | ${tripwireArmed} | recorded |
| \`bypass_rls_policy\` count | ${v(s.bypassPolicies)} | recorded — **this task never drops one** |
| \`Tenant\` / \`User\` / \`loads\` / \`carrier_drivers\` | ${v(s.rowCounts)} | recorded |
| \`auth.users\` (read on the privileged string) | ${v(r.stagingAuthUsers)} | recorded |

## Verdict

${failures.length === 0 ? 'All assertions passed. The ledger is open.' : failures.map((f) => `- **FAILED:** ${f}`).join('\n')}
`;
}

// ---------------------------------------------------------------------------
// --close
// ---------------------------------------------------------------------------

async function close() {
  const openPath = resolve(EVIDENCE_DIR, '01-open.json');
  if (!existsSync(openPath)) refuse('evidence/01-open.json not found — run --open first');
  const opened = JSON.parse(readFileSync(openPath, 'utf8'));

  const prod = await readProduction();
  const prodLedgerRows = value(prod.ledgerRows, 'production _prisma_migrations count');
  const prodPolicies = value(prod.policies, 'production pg_policy count');
  const prodHead = value(prod.headMigration, 'production head migration');
  const hashes = { rootEnv: sha256File(ROOT_ENV), appEnvLocal: sha256File(APP_ENV_LOCAL) };

  const checks: { name: string; open: unknown; close: unknown; ok: boolean }[] = [
    {
      name: 'production _prisma_migrations rows',
      open: opened.production.prodLedgerRows,
      close: prodLedgerRows,
      ok: opened.production.prodLedgerRows === prodLedgerRows && prodLedgerRows === EXPECTED_PROD_LEDGER_ROWS,
    },
    {
      name: 'production pg_policy(public)',
      open: opened.production.prodPolicies,
      close: prodPolicies,
      ok: opened.production.prodPolicies === prodPolicies && prodPolicies === EXPECTED_PROD_POLICIES,
    },
    {
      name: 'production newest migration_name',
      open: opened.production.prodHeadMigration,
      close: prodHead,
      ok: opened.production.prodHeadMigration === prodHead && prodHead === EXPECTED_PROD_HEAD_MIGRATION,
    },
    {
      name: 'sha256 repo-root .env',
      open: opened.envFileHashes.rootEnv,
      close: hashes.rootEnv,
      ok: opened.envFileHashes.rootEnv === hashes.rootEnv,
    },
    {
      name: 'sha256 apps/web/.env.local',
      open: opened.envFileHashes.appEnvLocal,
      close: hashes.appEnvLocal,
      ok: opened.envFileHashes.appEnvLocal === hashes.appEnvLocal,
    },
  ];

  // Staging is recorded at close too, but never asserted — this task deliberately
  // changes staging.
  const staging = await readStaging().catch((e) => ({ error: errOf(e) }) as any);
  const authUsers = await readStagingAuthUsers();

  const record = {
    task: 'quick-604',
    phase: 'close',
    at: new Date().toISOString(),
    production: {
      ref: prod.ref,
      prodLedgerRows,
      prodPolicies,
      prodHeadMigration: prodHead,
    },
    envFileHashes: hashes,
    checks,
    stagingAtClose: staging,
    stagingAuthUsersAtClose: authUsers,
  };

  writeFileSync(resolve(EVIDENCE_DIR, '07-close.json'), JSON.stringify(record, null, 2) + '\n');
  writeFileSync(resolve(EVIDENCE_DIR, '07-close.md'), renderCloseMd(record));

  for (const c of checks) {
    console.log(`  ${c.ok ? 'OK  ' : 'FAIL'} ${c.name}: open=${c.open} close=${c.close}`);
  }
  const bad = checks.filter((c) => !c.ok);
  if (bad.length) {
    console.error('604-survey --close: PRODUCTION BASELINE MOVED. This is the headline of the report.');
    process.exit(1);
  }
  console.log('604-survey --close: production untouched, env files byte-identical.');
  process.exit(0);
}

function renderCloseMd(r: any): string {
  const s = r.stagingAtClose;
  const v = (x: any) => (x?.ok ? JSON.stringify(x.value) : `ERROR ${x?.error?.code ?? 'n/a'}`);
  return `# quick-604 · 07 — the ledger at CLOSE

Taken ${r.at}.

## Production — \`${r.production.ref}\`, open vs close

| reading | at open | at close | verdict |
|---|---|---|---|
${r.checks.map((c: any) => `| ${c.name} | \`${c.open}\` | \`${c.close}\` | ${c.ok ? '**identical**' : '**MISMATCH**'} |`).join('\n')}

## Staging at close — recorded, never asserted (this task deliberately changed staging)

| reading | value |
|---|---|
| \`current_user\` / \`rolbypassrls\` | ${v(s?.identity)} |
| \`pg_policy\` in \`public\` | ${v(s?.policies)} |
| \`bypass_rls_policy\` count | ${v(s?.bypassPolicies)} |
| row counts | ${v(s?.rowCounts)} |
| \`auth.users\` | ${v(r.stagingAuthUsersAtClose)} |

## Verdict

${r.checks.every((c: any) => c.ok) ? 'Production was never written. Both env files are byte-identical to their state at open.' : '**PRODUCTION BASELINE MOVED — see the mismatches above.**'}
`;
}

// ---------------------------------------------------------------------------

const phase = process.argv[2];
if (phase === '--open') open();
else if (phase === '--close') close();
else {
  console.error('usage: npx tsx scripts/audit/604-survey.ts --open|--close');
  process.exit(1);
}
