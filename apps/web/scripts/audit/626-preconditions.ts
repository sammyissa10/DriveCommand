/**
 * quick-626 — staging preconditions (copy of 625's; evidence path changed only), measured before anything is changed.
 *
 *   npx tsx scripts/audit/618-preconditions.ts
 *
 * Asserts the four things this task's proof depends on:
 *   1. the connection under test is `app_user` on STAGING (positive refusal —
 *      proceed only when the ref IS staging; a negative-only check passes on a
 *      third, unknown database);
 *   2. the tripwire is armed — an UNSCOPED tenant-table read raises TC001, and
 *      the same read SUCCEEDS once the GUC is set. The pair is what shows the
 *      raise is caused by the arming and not by the statement (quick-617 §7);
 *   3. `bypass_rls_policy` is at 86 on 86 tables;
 *   4. staging's sorted `bypass_rls_policy` table list is IDENTICAL to
 *      production's. Production is opened READ-ONLY, for `pg_policies` only,
 *      and is never written.
 *
 * Rules carried from 616/617: `[db-target]` to STDERR with the credential
 * masked; SQLSTATE off the CAUSE CHAIN, never `err.code`; one transaction per
 * probe, because a TC001 aborts its transaction and every later statement
 * returns 25P02 — which makes one raise look like several.
 */
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { createHash } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';
const EXPECTED_POLICY_COUNT = 86;
const TENANT_A = 'b5623cdd-dc19-4900-b75d-0ecfcaf191b8';

const APP_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(APP_ROOT, '../..');
const EVIDENCE_DIR = resolve(
  REPO_ROOT,
  '.planning/quick/626-adopt-checkout-time-guc-re-assertion/evidence',
);

loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });
loadEnv({ path: resolve(APP_ROOT, '.env.local'), quiet: true });

function refuse(reason: string): never {
  console.error(`618-preconditions: REFUSING TO RUN — ${reason}`);
  process.exit(1);
}

function staging(raw: string | undefined, name: string): string {
  if (!raw) refuse(`${name} is not set`);
  if (raw.includes(PRODUCTION_REF)) refuse(`${name} names PRODUCTION (${PRODUCTION_REF})`);
  if (!raw.includes(STAGING_REF)) refuse(`${name} does not name staging (${STAGING_REF})`);
  return raw.replace(':6543/', ':5432/').replace('?pgbouncer=true', '');
}

function banner(url: string, label: string) {
  const u = new URL(url);
  console.error(
    `[db-target] project : ${label}  host : ${u.host}  role : ${u.username}  (credential MASKED, never printed)`,
  );
}

function sqlstateOf(e: unknown): string {
  const seen = new Set<unknown>();
  let cur: unknown = e;
  while (cur && typeof cur === 'object' && !seen.has(cur)) {
    seen.add(cur);
    const code = (cur as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return 'UNKNOWN';
}

const APP_USER_URL = staging(
  process.env.STAGING_DATABASE_URL_APP_USER,
  'STAGING_DATABASE_URL_APP_USER',
);
const DIRECT_URL = staging(process.env.STAGING_DIRECT_URL, 'STAGING_DIRECT_URL');

async function bypassTables(url: string): Promise<string[]> {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    const r = await c.query(
      `SELECT tablename FROM pg_policies
        WHERE schemaname = 'public' AND policyname = 'bypass_rls_policy'
        ORDER BY tablename`,
    );
    return r.rows.map((x) => x.tablename as string);
  } finally {
    await c.end();
  }
}

async function main() {
  const out: Record<string, unknown> = { generatedAt: new Date().toISOString() };

  /* ── 1. role + ref ─────────────────────────────────────────────────────── */
  banner(APP_USER_URL, `${STAGING_REF} (staging) RUN`);
  const c = new Client({ connectionString: APP_USER_URL });
  await c.connect();
  const who = await c.query(
    `SELECT current_user, current_database(),
            (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypassrls`,
  );
  out.role = who.rows[0];
  console.log('PRECONDITION 1 — role');
  console.log(`  current_user : ${who.rows[0].current_user}`);
  console.log(`  rolbypassrls : ${who.rows[0].bypassrls}`);
  const roleOk = who.rows[0].current_user === 'app_user' && who.rows[0].bypassrls === false;
  console.log(`  VERDICT      : ${roleOk ? 'PASS' : 'FAIL'}`);

  /* ── 2. tripwire, BOTH directions ──────────────────────────────────────── */
  console.log('\nPRECONDITION 2 — tripwire (armed => raises; scoped => succeeds)');
  /**
   * ARMING IS A PER-CONNECTION `SET`, and there is no other mechanism (quick-602):
   * `ALTER ROLE` / `ALTER DATABASE … SET` of a placeholder GUC is 42501 on this
   * Supabase instance for `postgres` AND for `app_user`, and Supavisor silently
   * drops the connection-string `options` parameter. `src/lib/db/prisma.ts:94`
   * arms the app's own pool the same way. A probe that only READS the flag
   * measures its own failure to arm, which is what the first run of this script
   * did — it reported `null` and no raise, and that is indistinguishable from a
   * disarmed environment.
   */
  const before = await c.query(`SELECT current_setting('app.tenant_context_tripwire', TRUE) AS f`);
  await c.query(`SET app.tenant_context_tripwire = 'on'`);
  const flag = await c.query(`SELECT current_setting('app.tenant_context_tripwire', TRUE) AS f`);
  out.tripwireFlagBeforeArming = before.rows[0].f;
  out.tripwireFlag = flag.rows[0].f;
  console.log(`  flag before SET : ${JSON.stringify(before.rows[0].f)} (a fresh backend carries nothing)`);
  console.log(`  flag after  SET : ${JSON.stringify(flag.rows[0].f)}`);

  // UNSCOPED — its own transaction; a TC001 aborts it.
  let unscoped: { raised: boolean; sqlstate: string };
  try {
    await c.query('BEGIN');
    await c.query(`SELECT count(*)::int AS n FROM "Truck"`);
    await c.query('ROLLBACK');
    unscoped = { raised: false, sqlstate: 'none' };
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    unscoped = { raised: true, sqlstate: sqlstateOf(e) };
  }
  out.unscoped = unscoped;
  console.log(`  unscoped read  : ${JSON.stringify(unscoped)}`);

  // SCOPED — the counter-assertion. Without it, "raises" could be any error.
  let scoped: { ok: boolean; own: number | null; sqlstate?: string };
  try {
    await c.query('BEGIN');
    await c.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [TENANT_A]);
    const r = await c.query(`SELECT count(*)::int AS n FROM "Truck"`);
    await c.query('ROLLBACK');
    scoped = { ok: true, own: r.rows[0].n };
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    scoped = { ok: false, own: null, sqlstate: sqlstateOf(e) };
  }
  out.scoped = scoped;
  console.log(`  scoped read    : ${JSON.stringify(scoped)}`);
  // DISARMED counter-assertion: the same unscoped read must go SILENT with the
  // flag off. Without this the raise could be caused by the statement rather
  // than by the arming, and "it raised" would prove nothing about the tripwire.
  await c.query(`SET app.tenant_context_tripwire = 'off'`);
  let disarmed: { raised: boolean; sqlstate: string; rows: number | null };
  try {
    await c.query('BEGIN');
    const r = await c.query(`SELECT count(*)::int AS n FROM "Truck"`);
    await c.query('ROLLBACK');
    disarmed = { raised: false, sqlstate: 'none', rows: r.rows[0].n };
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    disarmed = { raised: true, sqlstate: sqlstateOf(e), rows: null };
  }
  await c.query(`SET app.tenant_context_tripwire = 'on'`);
  out.disarmed = disarmed;
  console.log(`  disarmed read  : ${JSON.stringify(disarmed)}  <- silent 0 is the bug the tripwire exists to catch`);

  const tripwireOk =
    unscoped.raised && unscoped.sqlstate === 'TC001' && scoped.ok && !disarmed.raised;
  console.log(`  VERDICT        : ${tripwireOk ? 'PASS' : 'FAIL'}`);

  await c.end();

  /* ── 3 + 4. bypass_rls_policy population, staging vs production ────────── */
  console.log('\nPRECONDITION 3/4 — bypass_rls_policy population and parity');
  const stagingTables = await bypassTables(DIRECT_URL);
  console.log(`  staging    : ${stagingTables.length} policies on ${new Set(stagingTables).size} tables`);

  const prodUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  let prodTables: string[] | null = null;
  if (prodUrl && prodUrl.includes(PRODUCTION_REF)) {
    banner(prodUrl, 'PRODUCTION (READ-ONLY, pg_policies only)');
    prodTables = await bypassTables(prodUrl.replace(':6543/', ':5432/').replace('?pgbouncer=true', ''));
    console.log(`  production : ${prodTables.length} policies`);
  } else {
    console.log('  production : NOT REACHABLE from this env — parity REPORTED UNPROVEN, never as a pass');
  }

  const sha = (xs: string[]) => createHash('sha256').update(xs.join('\n')).digest('hex');
  out.staging = { count: stagingTables.length, sha256: sha(stagingTables) };
  if (prodTables) out.production = { count: prodTables.length, sha256: sha(prodTables) };

  const countOk = stagingTables.length === EXPECTED_POLICY_COUNT;
  const parity = prodTables
    ? sha(stagingTables) === sha(prodTables)
      ? 'IDENTICAL'
      : 'DIFFERENT'
    : 'UNPROVEN';
  console.log(`  expected ${EXPECTED_POLICY_COUNT} : ${countOk ? 'PASS' : 'FAIL'}`);
  console.log(`  sorted-list parity staging vs production : ${parity}`);
  console.log(`  staging sha256    : ${sha(stagingTables)}`);
  if (prodTables) console.log(`  production sha256 : ${sha(prodTables)}`);
  if (prodTables && parity === 'DIFFERENT') {
    const s = new Set(stagingTables);
    const p = new Set(prodTables);
    console.log(`  only-in-staging   : ${stagingTables.filter((t) => !p.has(t)).join(', ') || '(none)'}`);
    console.log(`  only-in-production: ${prodTables.filter((t) => !s.has(t)).join(', ') || '(none)'}`);
  }

  out.verdicts = { roleOk, tripwireOk, countOk, parity };
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(resolve(EVIDENCE_DIR, '00-preconditions.json'), JSON.stringify(out, null, 2));

  const allOk = roleOk && tripwireOk && countOk && parity === 'IDENTICAL';
  console.log(`\nOVERALL: ${allOk ? 'PASS' : 'SEE ABOVE'}`);
  process.exit(allOk ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
