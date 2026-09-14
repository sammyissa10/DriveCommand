/**
 * quick-599 — the before/after RLS verification matrix for the three dark-command
 * gaps ("Tenant", audit_log, "AutomationRule"), run AS `app_user` against STAGING.
 *
 *   npx tsx scripts/audit/599-policy-verify.ts --phase before
 *   npx tsx scripts/audit/599-policy-verify.ts --phase after
 *   npx tsx scripts/audit/599-policy-verify.ts --diff
 *
 * Writes evidence/<phase>.json and evidence/<phase>.md.
 *
 * WHY THIS FILE EXISTS. The five statements quick-599 ships are INERT today:
 * the application connects as `postgres`, which has `rolbypassrls = true`. A
 * green deploy therefore proves nothing about any of them. The only instrument
 * that can say anything is a connection made as a role RLS actually applies to,
 * with a known `app.current_tenant_id`, against rows whose owning tenant is
 * known in advance. That is this file. Modelled on
 * `scripts/audit/597-policy-verify.ts` — same four ground rules, same
 * environment discipline, same evidence shape.
 *
 * STAGING ONLY. THIS FILE MUST NEVER IMPORT `scripts/_bootstrap-env`.
 * ------------------------------------------------------------------
 * `_bootstrap-env.ts:53-55` runs `process.env.DATABASE_URL = process.env.DIRECT_URL`
 * UNCONDITIONALLY, and every env file points `DIRECT_URL` at PRODUCTION. This
 * file loads `apps/web/.env.staging` explicitly and refuses on the production
 * ref.
 *
 * FOUR GROUND RULES
 *   1. Nothing is swallowed. Every probe records `{rows:n}` or `{error:{code,message}}`
 *      with the SQLSTATE and the full server message.
 *   2. Every write probe runs inside `BEGIN … ROLLBACK`. There is no COMMIT
 *      statement anywhere in this file.
 *   3. One FRESH `pg.Client` per GUC case, each case's work inside ONE
 *      transaction (Supavisor is transaction-mode: outside a transaction,
 *      consecutive statements may land on different backends and a
 *      session-scope `set_config` would not be observed by the next
 *      statement). Each individual probe is fenced with a SAVEPOINT so an
 *      expected raise aborts only itself.
 *   4. This is a REPORT, not a gate. Only a failure to connect or to read the
 *      fixture ids exits 1. Every probe result — expected or not — is
 *      recorded, never thrown, except the post-run `"AutomationRule"`
 *      integrity re-read, which is a hard exit 1 on failure because a loss
 *      there is unrecoverable staging data (D4).
 */

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';

const APP_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(APP_ROOT, '../..');
const EVIDENCE_DIR = resolve(
  REPO_ROOT,
  '.planning/quick/599-close-the-three-dark-command-rls-policy-/evidence'
);

loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });

function refuse(reason: string): never {
  console.error(`599-policy-verify: REFUSING TO RUN — ${reason}`);
  process.exit(1);
}

const DIRECT_URL = process.env.STAGING_DIRECT_URL;
const APP_USER_URL = process.env.STAGING_DATABASE_URL_APP_USER;

for (const [name, url] of [
  ['STAGING_DIRECT_URL', DIRECT_URL],
  ['STAGING_DATABASE_URL_APP_USER', APP_USER_URL],
] as const) {
  if (!url) refuse(`${name} is not set in apps/web/.env.staging`);
  if (url.includes(PRODUCTION_REF)) refuse(`${name} names the PRODUCTION project (${PRODUCTION_REF})`);
  if (!url.includes(STAGING_REF)) refuse(`${name} does not name the staging project (${STAGING_REF})`);
}

process.env.PG_CONNECT_TIMEOUT_MS ??= '30000';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const phaseArg = process.argv.indexOf('--phase');
const PHASE = phaseArg !== -1 ? process.argv[phaseArg + 1] : undefined;
const DIFF_MODE = process.argv.includes('--diff');
if (!DIFF_MODE && PHASE !== 'before' && PHASE !== 'after') {
  refuse('--phase before | after  (or --diff) is required');
}

interface FixtureTenant {
  key: 'A' | 'B';
  slug: string;
  id: string;
  ownerUserId: string;
}
interface FixtureIds {
  capturedAt: string;
  projectRef: string;
  promoCode: string;
  tenants: Record<'A' | 'B', FixtureTenant>;
  rows: Record<string, Record<'A' | 'B', string[]>>;
}

// Gitignored runtime handshake written by 597-staging-fixtures.ts --seed.
// Never quick-597's committed evidence copy — re-seeding mints fresh ids.
const RUNTIME_FIXTURE_IDS_PATH = resolve(APP_ROOT, '.rls-fixture-ids.json');
if (!existsSync(RUNTIME_FIXTURE_IDS_PATH)) {
  refuse(
    `${RUNTIME_FIXTURE_IDS_PATH} does not exist — run ` +
      '`npx tsx scripts/audit/597-staging-fixtures.ts --seed` first'
  );
}
let fixtures: FixtureIds;
try {
  fixtures = JSON.parse(readFileSync(RUNTIME_FIXTURE_IDS_PATH, 'utf8')) as FixtureIds;
} catch (e) {
  refuse(`could not read ${RUNTIME_FIXTURE_IDS_PATH} (${(e as Error).message})`);
}
if (fixtures.projectRef !== STAGING_REF) {
  refuse(`fixture-ids.json was captured against project ${fixtures.projectRef}, not ${STAGING_REF}`);
}
if (!fixtures.rows.audit_log?.A?.length || !fixtures.rows.audit_log?.B?.length) {
  refuse('fixture-ids.json carries no audit_log rows for one or both tenants — re-seed');
}

const RUN_TAG = `rls599_${PHASE ?? 'diff'}_${Date.now()}`;

// ---------------------------------------------------------------------------
// Probe result shape — nothing is ever swallowed
// ---------------------------------------------------------------------------

type Probe = { rows: number } | { error: { code: string; message: string } };

function fmtProbe(p: Probe): string {
  if ('rows' in p) return String(p.rows);
  return `ERROR [${p.error.code}] ${p.error.message}`;
}

let savepointCounter = 0;

/** One statement inside a SAVEPOINT, so an expected raise aborts only itself. */
async function probe(client: Client, sql: string, params: unknown[] = []): Promise<Probe> {
  const sp = `p599_${savepointCounter++}`;
  await client.query(`SAVEPOINT ${sp}`);
  try {
    const r = await client.query(sql, params);
    await client.query(`RELEASE SAVEPOINT ${sp}`);
    if (r.rows.length > 0) {
      const first = r.rows[0] as Record<string, unknown>;
      const v = Object.values(first)[0];
      return { rows: Number(v) };
    }
    return { rows: r.rowCount ?? 0 };
  } catch (e) {
    await client.query(`ROLLBACK TO SAVEPOINT ${sp}`).catch(() => {});
    const err = e as { code?: string; message?: string };
    return { error: { code: err.code ?? 'UNKNOWN', message: err.message ?? String(e) } };
  }
}

// ---------------------------------------------------------------------------
// Report shape
// ---------------------------------------------------------------------------

interface PolicyRow {
  schemaname: string;
  tablename: string;
  policyname: string;
  permissive: string;
  roles: string;
  cmd: string;
  qual: string | null;
  with_check: string | null;
}

interface AutomationRuleCensus {
  total: number;
  system: number;
  nullTenant: number;
}

interface Report {
  phase: 'before' | 'after';
  capturedAt: string;
  projectRef: string;
  policies: PolicyRow[];
  totalPolicyCount: number;
  bypassPolicies: string[]; // sorted table list
  appUserGrants: Record<string, string[]>; // table -> sorted privilege_type[]
  automationRuleCensusBefore: AutomationRuleCensus;
  probes: Record<string, Probe>;
  automationRuleCensusAfterRun: AutomationRuleCensus;
}

const TARGET_TABLES = ['Tenant', 'audit_log', 'AutomationRule'];

// ---------------------------------------------------------------------------
// Snapshot (as postgres, read-only)
// ---------------------------------------------------------------------------

async function automationRuleCensus(admin: Client): Promise<AutomationRuleCensus> {
  const r = await admin.query<{ total: string; system: string; nulltenant: string }>(
    `SELECT count(*)::text AS total,
            count(*) FILTER (WHERE scope = 'SYSTEM')::text AS system,
            count(*) FILTER (WHERE "tenantId" IS NULL)::text AS nulltenant
       FROM "AutomationRule"`
  );
  return {
    total: Number(r.rows[0].total),
    system: Number(r.rows[0].system),
    nullTenant: Number(r.rows[0].nulltenant),
  };
}

async function snapshot(admin: Client): Promise<
  Pick<Report, 'policies' | 'totalPolicyCount' | 'bypassPolicies' | 'appUserGrants'>
> {
  const pol = await admin.query<PolicyRow>(
    `SELECT schemaname, tablename, policyname, permissive,
            COALESCE(array_to_string(roles, ','), '') AS roles,
            cmd, qual, with_check
       FROM pg_policies
      WHERE schemaname = 'public' AND tablename = ANY($1)
      ORDER BY tablename, policyname`,
    [TARGET_TABLES]
  );

  const total = await admin.query<{ n: string }>(`SELECT count(*)::text AS n FROM pg_policy`);

  const bypass = await admin.query<{ tablename: string }>(
    `SELECT tablename FROM pg_policies WHERE policyname = 'bypass_rls_policy' ORDER BY tablename`
  );

  const grants = await admin.query<{ table_name: string; privilege_type: string }>(
    `SELECT table_name, privilege_type
       FROM information_schema.role_table_grants
      WHERE grantee = 'app_user' AND table_schema = 'public' AND table_name = ANY($1)
      ORDER BY table_name, privilege_type`,
    [TARGET_TABLES]
  );
  const appUserGrants: Record<string, string[]> = {};
  for (const t of TARGET_TABLES) appUserGrants[t] = [];
  for (const g of grants.rows) appUserGrants[g.table_name]?.push(g.privilege_type);

  return {
    policies: pol.rows,
    totalPolicyCount: Number(total.rows[0].n),
    bypassPolicies: bypass.rows.map((b) => b.tablename).sort(),
    appUserGrants,
  };
}

// ---------------------------------------------------------------------------
// Write probes (as app_user)
// ---------------------------------------------------------------------------

async function openAppUser(): Promise<Client> {
  const c = new Client({ connectionString: APP_USER_URL });
  await c.connect();
  return c;
}

async function openDirect(): Promise<Client> {
  const c = new Client({ connectionString: DIRECT_URL });
  await c.connect();
  return c;
}

async function runGucEmptyCase(out: Report['probes']): Promise<void> {
  const c = await openAppUser();
  try {
    await c.query('BEGIN');
    await c.query(`SELECT set_config('app.current_tenant_id', '', false)`);

    out['Tenant.insert@guc-empty'] = await probe(
      c,
      `INSERT INTO "Tenant" (name, slug, "updatedAt") VALUES ($1, $2, now())`,
      ['RLS599 bootstrap', `${RUN_TAG}-tenant-bootstrap`]
    );

    out['audit_log.insert@guc-empty'] = await probe(
      c,
      `INSERT INTO audit_log (tenant_id, user_id, action, resource_type, resource_id)
       VALUES ($1, $2, 'EXPORT', 'RLS599_resource', gen_random_uuid())`,
      [fixtures.tenants.A.id, fixtures.tenants.A.ownerUserId]
    );

    out['AutomationRule.update-system@guc-empty'] = await probe(
      c,
      `UPDATE "AutomationRule" SET "isActive" = NOT "isActive" WHERE scope = 'SYSTEM'`
    );

    await c.query('ROLLBACK');
  } finally {
    await c.end().catch(() => {});
  }
}

async function runGucACase(out: Report['probes']): Promise<void> {
  const A = fixtures.tenants.A;
  const B = fixtures.tenants.B;
  const c = await openAppUser();
  try {
    await c.query('BEGIN');
    await c.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [A.id]);

    // --- "Tenant" ------------------------------------------------------
    out['Tenant.insert@guc-A'] = await probe(
      c,
      `INSERT INTO "Tenant" (name, slug, "updatedAt") VALUES ($1, $2, now())`,
      ['RLS599 bootstrap A', `${RUN_TAG}-tenant-bootstrap-a`]
    );

    out['Tenant.update-own@guc-A'] = await probe(
      c,
      `UPDATE "Tenant" SET "requirePreTripInspection" = NOT "requirePreTripInspection" WHERE id = $1`,
      [A.id]
    );
    out['Tenant.update-own.counter-read@guc-A'] = await probe(
      c,
      `SELECT count(*)::int AS n FROM "Tenant" WHERE id = $1`,
      [A.id]
    );

    out['Tenant.update-cross@guc-A'] = await probe(
      c,
      `UPDATE "Tenant" SET "requirePreTripInspection" = NOT "requirePreTripInspection" WHERE id = $1`,
      [B.id]
    );

    out['Tenant.delete-own@guc-A'] = await probe(c, `DELETE FROM "Tenant" WHERE id = $1`, [A.id]);

    // --- audit_log -------------------------------------------------------
    out['audit_log.insert-own@guc-A'] = await probe(
      c,
      `INSERT INTO audit_log (tenant_id, user_id, action, resource_type, resource_id)
       VALUES ($1, $2, 'EXPORT', 'RLS599_resource', gen_random_uuid())`,
      [A.id, A.ownerUserId]
    );
    out['audit_log.insert-cross@guc-A'] = await probe(
      c,
      `INSERT INTO audit_log (tenant_id, user_id, action, resource_type, resource_id)
       VALUES ($1, $2, 'EXPORT', 'RLS599_resource', gen_random_uuid())`,
      [B.id, B.ownerUserId]
    );

    out['audit_log.select-own@guc-A'] = await probe(
      c,
      `SELECT count(*)::int AS n FROM audit_log WHERE id::text = ANY($1::text[])`,
      [fixtures.rows.audit_log.A]
    );
    out['audit_log.select-cross@guc-A'] = await probe(
      c,
      `SELECT count(*)::int AS n FROM audit_log WHERE id::text = ANY($1::text[])`,
      [fixtures.rows.audit_log.B]
    );

    out['audit_log.update-own@guc-A'] = await probe(
      c,
      `UPDATE audit_log SET user_agent = 'RLS599' WHERE id::text = ANY($1::text[])`,
      [fixtures.rows.audit_log.A]
    );

    out['audit_log.delete-own@guc-A'] = await probe(
      c,
      `DELETE FROM audit_log WHERE id::text = ANY($1::text[])`,
      [fixtures.rows.audit_log.A]
    );
    out['audit_log.delete-cross@guc-A'] = await probe(
      c,
      `DELETE FROM audit_log WHERE id::text = ANY($1::text[])`,
      [fixtures.rows.audit_log.B]
    );

    // --- "AutomationRule" ------------------------------------------------
    out['AutomationRule.select-system@guc-A'] = await probe(
      c,
      `SELECT count(*)::int AS n FROM "AutomationRule" WHERE scope = 'SYSTEM'`
    );
    out['AutomationRule.update-system@guc-A'] = await probe(
      c,
      `UPDATE "AutomationRule" SET "isActive" = NOT "isActive" WHERE scope = 'SYSTEM'`
    );
    // D2 — delete-system is measured BEFORE any of the three insert probes below.
    // insert-system inserts a 7th scope='SYSTEM' row inside this same
    // transaction (rolled back only at the very end), so running delete-system
    // after it would count that extra row too and report 7 instead of the true
    // residue of 6 pre-existing SYSTEM rows. Ordering here is load-bearing for
    // the D2 measurement, not cosmetic.
    out['AutomationRule.delete-system@guc-A'] = await probe(
      c,
      `DELETE FROM "AutomationRule" WHERE scope = 'SYSTEM'`
    );
    out['AutomationRule.insert-own@guc-A'] = await probe(
      c,
      `INSERT INTO "AutomationRule" (key, name, "triggerEvent", "actionsJson", scope, "tenantId")
       VALUES ($1, $2, $3, $4::jsonb, 'TENANT'::"AutomationScope", $5)`,
      [`${RUN_TAG}-own`, 'RLS599 probe (own)', 'RLS599_TRIGGER', '[]', A.id]
    );
    out['AutomationRule.insert-system@guc-A'] = await probe(
      c,
      `INSERT INTO "AutomationRule" (key, name, "triggerEvent", "actionsJson", scope, "tenantId")
       VALUES ($1, $2, $3, $4::jsonb, 'SYSTEM'::"AutomationScope", NULL)`,
      [`${RUN_TAG}-system`, 'RLS599 probe (system)', 'RLS599_TRIGGER', '[]']
    );
    out['AutomationRule.insert-cross@guc-A'] = await probe(
      c,
      `INSERT INTO "AutomationRule" (key, name, "triggerEvent", "actionsJson", scope, "tenantId")
       VALUES ($1, $2, $3, $4::jsonb, 'TENANT'::"AutomationScope", $5)`,
      [`${RUN_TAG}-cross`, 'RLS599 probe (cross)', 'RLS599_TRIGGER', '[]', B.id]
    );

    await c.query('ROLLBACK');
  } finally {
    await c.end().catch(() => {});
  }
}

/**
 * Read-only, as `postgres` (no transaction needed — a plain SELECT, not a
 * probe fenced by a SAVEPOINT, because this connection is never inside a
 * transaction block).
 */
async function tenantBCounterRead(admin: Client): Promise<Probe> {
  try {
    const r = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "Tenant" WHERE id = $1`,
      [fixtures.tenants.B.id]
    );
    return { rows: r.rows[0].n };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { error: { code: err.code ?? 'UNKNOWN', message: err.message ?? String(e) } };
  }
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

function renderMd(r: Report): string {
  const L: string[] = [];
  L.push(`# quick-599 — RLS policy verification matrix (${r.phase.toUpperCase()})`);
  L.push('');
  L.push(`- Captured: ${r.capturedAt}`);
  L.push(`- Project: staging \`${r.projectRef}\` (production \`${PRODUCTION_REF}\` was never connected to)`);
  L.push(`- Total \`pg_policy\` rows: **${r.totalPolicyCount}**`);
  L.push(`- \`bypass_rls_policy\` rows: **${r.bypassPolicies.length}**`);
  L.push('');

  L.push('## 1. Policy snapshot (verbatim from `pg_policies`)');
  L.push('');
  for (const p of r.policies) {
    L.push(`### \`${p.tablename}\` — \`${p.policyname}\``);
    L.push('');
    L.push(`- permissive: \`${p.permissive}\`  cmd: \`${p.cmd}\`  roles: \`${p.roles}\``);
    L.push('');
    L.push('```sql');
    L.push(`USING      ${p.qual ?? '(none)'}`);
    L.push(`WITH CHECK ${p.with_check ?? '(none)'}`);
    L.push('```');
    L.push('');
  }

  L.push('## 2. `app_user` grants on the three tables');
  L.push('');
  L.push('| table | privileges |');
  L.push('| --- | --- |');
  for (const t of TARGET_TABLES) {
    L.push(`| \`${t}\` | ${r.appUserGrants[t].join(', ') || '(none)'} |`);
  }
  L.push('');

  L.push('## 3. `bypass_rls_policy` inventory (sorted table list)');
  L.push('');
  L.push(`${r.bypassPolicies.length} rows:`);
  L.push('');
  L.push('```');
  L.push(r.bypassPolicies.join('\n'));
  L.push('```');
  L.push('');

  L.push('## 4. `"AutomationRule"` census');
  L.push('');
  L.push('| when | total | scope=SYSTEM | tenantId IS NULL |');
  L.push('| --- | --- | --- | --- |');
  L.push(
    `| before probes | ${r.automationRuleCensusBefore.total} | ${r.automationRuleCensusBefore.system} | ${r.automationRuleCensusBefore.nullTenant} |`
  );
  L.push(
    `| after probes (rolled back) | ${r.automationRuleCensusAfterRun.total} | ${r.automationRuleCensusAfterRun.system} | ${r.automationRuleCensusAfterRun.nullTenant} |`
  );
  L.push('');

  L.push('## 5. Probe matrix — every write probe inside `BEGIN … ROLLBACK`');
  L.push('');
  L.push('| probe | result |');
  L.push('| --- | --- |');
  for (const [k, v] of Object.entries(r.probes)) {
    L.push(`| \`${k}\` | ${fmtProbe(v)} |`);
  }
  L.push('');

  return L.join('\n');
}

// ---------------------------------------------------------------------------
// --diff
// ---------------------------------------------------------------------------

function runDiff(): void {
  const read = (p: string): Report =>
    JSON.parse(readFileSync(resolve(EVIDENCE_DIR, p), 'utf8')) as Report;
  const b = read('before.json');
  const a = read('after.json');

  const L: string[] = [];
  L.push('# quick-599 — BEFORE → AFTER, as `app_user` against staging');
  L.push('');
  L.push(`Generated from \`before.json\` (${b.capturedAt}) and \`after.json\` (${a.capturedAt}) by`);
  L.push('`599-policy-verify.ts --diff`. Nothing here is typed by hand.');
  L.push('');
  L.push(`- \`pg_policy\` total: **${b.totalPolicyCount} -> ${a.totalPolicyCount}**`);
  L.push(
    `- \`bypass_rls_policy\`: **${b.bypassPolicies.length} -> ${a.bypassPolicies.length}** ` +
      `(identical table set: ${
        JSON.stringify(b.bypassPolicies) === JSON.stringify(a.bypassPolicies) ? 'YES' : 'NO'
      })`
  );
  L.push('');

  L.push('## `app_user` grants');
  L.push('');
  L.push('| table | before | after |');
  L.push('| --- | --- | --- |');
  for (const t of TARGET_TABLES) {
    L.push(`| \`${t}\` | ${b.appUserGrants[t].join(', ')} | ${a.appUserGrants[t].join(', ')} |`);
  }
  L.push('');

  L.push('## Policies present on the target tables');
  L.push('');
  L.push('| table | policy | before | after |');
  L.push('| --- | --- | --- | --- |');
  const names = new Set<string>();
  for (const p of [...b.policies, ...a.policies]) names.add(`${p.tablename}|${p.policyname}`);
  for (const n of [...names].sort()) {
    const [tbl, pol] = n.split('|');
    const inB = b.policies.some((p) => p.tablename === tbl && p.policyname === pol);
    const inA = a.policies.some((p) => p.tablename === tbl && p.policyname === pol);
    L.push(`| \`${tbl}\` | \`${pol}\` | ${inB ? 'present' : '—'} | ${inA ? 'present' : '—'} |`);
  }
  L.push('');

  L.push('## Probe matrix');
  L.push('');
  L.push('| probe | before | after |');
  L.push('| --- | --- | --- |');
  for (const k of Object.keys({ ...b.probes, ...a.probes })) {
    const pb = b.probes[k];
    const pa = a.probes[k];
    L.push(`| \`${k}\` | ${pb ? fmtProbe(pb) : '—'} | ${pa ? fmtProbe(pa) : '—'} |`);
  }
  L.push('');

  const outPath = resolve(EVIDENCE_DIR, 'diff.md');
  writeFileSync(outPath, L.join('\n') + '\n', 'utf8');
  console.log(`Wrote ${outPath}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (DIFF_MODE) {
    runDiff();
    return;
  }

  console.log(`599-policy-verify — phase=${PHASE}, project=${STAGING_REF}`);

  const admin = await openDirect();
  let snap: Awaited<ReturnType<typeof snapshot>>;
  let censusBefore: AutomationRuleCensus;
  let tenantBRead: Probe;
  try {
    snap = await snapshot(admin);
    censusBefore = await automationRuleCensus(admin);
    tenantBRead = await tenantBCounterRead(admin);
  } finally {
    await admin.end().catch(() => {});
  }
  console.log(`  policies on target tables: ${snap.policies.length}`);
  console.log(`  total pg_policy rows:      ${snap.totalPolicyCount}`);
  console.log(`  bypass_rls_policy rows:    ${snap.bypassPolicies.length}`);
  console.log(
    `  AutomationRule census: total=${censusBefore.total} system=${censusBefore.system} nullTenant=${censusBefore.nullTenant}`
  );

  const probes: Report['probes'] = {};
  probes['Tenant.update-cross.counter-read@postgres'] = tenantBRead;

  await runGucEmptyCase(probes);
  await runGucACase(probes);

  console.log(`  ${Object.keys(probes).length} probes captured`);

  // Post-run integrity re-read — hard exit 1 on failure (D4). Everything above
  // is rolled back, but a staging-data loss is unrecoverable without a
  // re-seed, so it is verified rather than trusted.
  const admin2 = await openDirect();
  let censusAfterRun: AutomationRuleCensus;
  try {
    censusAfterRun = await automationRuleCensus(admin2);
  } finally {
    await admin2.end().catch(() => {});
  }
  if (censusAfterRun.total !== 6 || censusAfterRun.system !== 6 || censusAfterRun.nullTenant !== 6) {
    console.error(
      `599-policy-verify: AutomationRule INTEGRITY FAILURE — expected 6/6/6, got ` +
        `total=${censusAfterRun.total} system=${censusAfterRun.system} nullTenant=${censusAfterRun.nullTenant}`
    );
    process.exit(1);
  }
  console.log(
    `  AutomationRule integrity re-read OK: total=${censusAfterRun.total} system=${censusAfterRun.system} nullTenant=${censusAfterRun.nullTenant}`
  );

  const report: Report = {
    phase: PHASE as 'before' | 'after',
    capturedAt: new Date().toISOString(),
    projectRef: STAGING_REF,
    policies: snap.policies,
    totalPolicyCount: snap.totalPolicyCount,
    bypassPolicies: snap.bypassPolicies,
    appUserGrants: snap.appUserGrants,
    automationRuleCensusBefore: censusBefore,
    probes,
    automationRuleCensusAfterRun: censusAfterRun,
  };

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const jsonPath = resolve(EVIDENCE_DIR, `${PHASE}.json`);
  const mdPath = resolve(EVIDENCE_DIR, `${PHASE}.md`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  writeFileSync(mdPath, renderMd(report) + '\n', 'utf8');

  console.log(`\nWrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
}

main().catch((e) => {
  console.error('599-policy-verify FAILED:', e);
  process.exit(1);
});
