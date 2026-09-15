/**
 * quick-613 — the five sysadmin `AutomationRule` statements, measured in BOTH
 * directions on STAGING.
 *
 *   npx tsx scripts/audit/613-routing-verify.ts --before
 *   npx tsx scripts/audit/613-routing-verify.ts --apply
 *   npx tsx scripts/audit/613-routing-verify.ts --after
 *
 * STAGING ONLY. MUST NEVER IMPORT `scripts/_bootstrap-env` (quick-607) — that
 * file used to repoint `DATABASE_URL` at `DIRECT_URL`, and every env file in
 * this repo points `DIRECT_URL` at PRODUCTION. `apps/web/.env.staging` is loaded
 * explicitly and every connection string is refused POSITIVELY: it must contain
 * the staging ref, and naming the production ref is a hard stop before any
 * statement is issued. The resolved project ref goes to STDERR (quick-585/607),
 * never stdout.
 *
 * ─── WHAT IS BEING MEASURED ────────────────────────────────────────────────
 *
 * quick-613 routed five statements in `app/(admin)/actions/automations.ts` off
 * the bare (tenant) client and onto `getAdminDb` (`app_admin`). A routing claim
 * is only worth anything if BOTH halves are measured: the statement must
 * SUCCEED on the admin connection, and it must be REFUSED — or silently
 * under-read — on the tenant connection. A one-directional matrix is satisfied
 * by a connection that can do nothing at all (quick-600 rule 3).
 *
 * Three lanes per site:
 *   ADMIN         `app_admin`, no tenant GUC, BYPASSRLS — grants are the only
 *                 control left, which is what `--before` vs `--after` measures.
 *   TENANT (A)    `app_user` under a REAL tenant GUC.
 *   TENANT (∅)    `app_user` under the EMPTY GUC a sysadmin request actually
 *                 carries — a sysadmin has no tenant. Whether that raises
 *                 `TC001` or silently under-reads is MEASURED here, not assumed.
 *
 * ─── D3: EVERY ZERO NEEDS A COUNTER-READ ───────────────────────────────────
 *
 * An RLS-refused UPDATE/DELETE is a SILENT 0 ROWS, not a 42501 (quick-599 D3),
 * so "0 rows" alone cannot distinguish REFUSED from ALREADY GONE. Every refusal
 * probe therefore takes a PRIVILEGED counter-read on a SEPARATE connection while
 * the probe's transaction is still open, proving the target rows still exist
 * unchanged. And quick-610's inverse: every cross-tenant `foreign === 0` is
 * paired with an `own > 0` read on the SAME connection in the SAME transaction,
 * or the assertion is vacuous — a zero over an empty set proves nothing.
 *
 * For a `count(*)` probe the SCALAR is the answer, never `rowCount`: `rowCount`
 * is 1 for every count query, so a refused read reads exactly like a successful
 * one (612's `Probe.value` note).
 *
 * ─── FIXTURES ARE COMMITTED, PROBES ARE NOT ────────────────────────────────
 *
 * The brief asked for fixtures "inside its transaction". That is impossible
 * here and 612's shape is the correct one: the probe runs on a DIFFERENT
 * CONNECTION from the fixture creator, so an uncommitted fixture is invisible to
 * it. Fixtures are therefore created COMMITTED on the privileged connection,
 * every probe runs inside `BEGIN … ROLLBACK`, and teardown runs in a `finally`
 * with an asserted `left === 0`. Staging holds ZERO `AutomationRun` rows, so
 * without fixtures the admin direction's must-SUCCEED half would be vacuous.
 *
 * The SYSTEM rule count is asserted 6 at entry and 6 at exit. This task must
 * never destroy a platform rule.
 */

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { createHash, randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';

const APP_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(APP_ROOT, '../..');
const EVIDENCE_DIR = resolve(
  REPO_ROOT,
  '.planning/quick/613-route-the-automationrule-admin-paths-to-/evidence',
);
const MIGRATION_NAME = '20260915150000_grant_automation_rule_to_app_admin';
const MIGRATION = resolve(APP_ROOT, 'prisma/migrations', MIGRATION_NAME, 'migration.sql');

/** A ledger row that certainly exists on staging. An empty read-back means nothing until this is seen. */
const LEDGER_SENTINEL = '20260915140000_automation_rule_per_command_policy_split';

loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });

function refuse(reason: string): never {
  console.error(`613-routing-verify: REFUSING TO RUN — ${reason}`);
  process.exit(1);
}

/** Positive refusal: the string must NAME staging, and naming production is a hard stop. */
function staging(raw: string | undefined, name: string): string {
  if (!raw) refuse(`${name} is not set`);
  if (raw.includes(PRODUCTION_REF)) refuse(`${name} names PRODUCTION (${PRODUCTION_REF})`);
  if (!raw.includes(STAGING_REF)) refuse(`${name} does not name staging (${STAGING_REF})`);
  return raw.replace(':6543/', ':5432/').replace('?pgbouncer=true', '');
}

const ADMIN_URL = staging(process.env.STAGING_DATABASE_URL_ADMIN, 'STAGING_DATABASE_URL_ADMIN');
const APP_USER_URL = staging(process.env.STAGING_DATABASE_URL_APP_USER, 'STAGING_DATABASE_URL_APP_USER');
const DIRECT_URL = staging(process.env.STAGING_DIRECT_URL, 'STAGING_DIRECT_URL');

/**
 * SQLSTATE lives on the CAUSE CHAIN, never on `err.code` alone (quick-610).
 * Prisma surfaces a `DriverAdapterError` whose own `code`, `errorCode` and
 * `meta` are all `undefined`; a raw `pg` error carries `code` at the top level.
 * One walker serves both, so this script's verdicts stay comparable with a
 * Prisma-side probe. Recognition is by CODE, never by message prose (quick-602).
 */
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

type Lane = 'ADMIN' | 'TENANT_A' | 'TENANT_EMPTY';

const LANE_LABEL: Record<Lane, string> = {
  ADMIN: 'ADMIN — app_admin, no GUC',
  TENANT_A: 'TENANT — app_user, GUC = tenant A',
  TENANT_EMPTY: 'TENANT — app_user, GUC EMPTY (what a sysadmin request carries)',
};

interface Probe {
  site: string;
  siteLabel: string;
  lane: Lane;
  expectation: string;
  label: string;
  rows: number | null;
  /** The SCALARS the query returned. For a count query this is the answer; rowCount is not. */
  values: Record<string, string | number | null> | null;
  error: { sqlstate: string; message: string } | null;
  gucSeen: string | null;
  counterRead?: { label: string; value: number };
  pairedOwn?: { label: string; value: number | null; error: string | null };
}

interface OwnPair {
  label: string;
  sql: string;
  params?: unknown[];
}

async function main() {
  const mode = process.argv.includes('--apply')
    ? 'apply'
    : process.argv.includes('--after')
      ? 'after'
      : 'before';

  console.error('[db-target] script   : 613-routing-verify.ts');
  console.error(`[db-target] project  : ${STAGING_REF} (staging)`);
  console.error('[db-target] roles    : app_admin (routed lane) + app_user (tenant lane) + postgres (fixtures, counter-reads, DDL)');
  console.error(`[db-target] mode     : ${mode}`);
  console.error(`[db-target] intent   : ${mode === 'apply' ? 'writes (staging DDL + ledger row)' : 'probes inside BEGIN…ROLLBACK; fixtures committed then torn down'}`);

  const priv = new Client({ connectionString: DIRECT_URL, connectionTimeoutMillis: 30000 });
  await priv.connect();

  const privWho = (await priv.query<{ cu: string; db: string }>('select current_user as cu, current_database() as db')).rows[0];
  if (privWho.cu === 'app_user') refuse('the privileged connection resolved as app_user — it cannot read _prisma_migrations at all');
  console.error(`[db-target] priv     : ${privWho.cu}@${privWho.db}`);

  const grantsOf = async () =>
    (
      await priv.query<{ grantee: string; privilege_type: string }>(
        `select grantee, privilege_type from information_schema.role_table_grants
          where table_name = 'AutomationRule' and grantee in ('app_user','app_admin')
          order by grantee, privilege_type`,
      )
    ).rows.map((r) => `${r.grantee}: ${r.privilege_type}`);

  // ── APPLY ────────────────────────────────────────────────────────────────
  if (mode === 'apply') {
    const raw = readFileSync(MIGRATION, 'utf8');

    /**
     * STRIP `--` COMMENTS BEFORE EVERY CHECK. This is load-bearing here, not
     * belt-and-braces: this migration's own header explains WHY INSERT and
     * DELETE are excluded, and quotes the `role_table_grants` row that reads
     * "DELETE, INSERT, SELECT, UPDATE". A raw-text guard would refuse the
     * migration on the prose describing the invariant it exists to protect —
     * quick-612 (`AS RESTRICTIVE`) and quick-600 (`pool.on('connect'`) both hit
     * exactly this. The CODE is what must be checked.
     */
    const code = raw.replace(/^\s*--.*$/gm, '');

    if (/\b(CREATE|DROP|ALTER)\s+POLICY\b/i.test(code)) {
      refuse('migration contains policy DDL — this is a GRANT migration; a policy change here is a second change smuggled in beside the one being measured');
    }
    if (/GRANT\s+ALL\b/i.test(code)) refuse('migration contains GRANT ALL');
    if (/ALL\s+TABLES\s+IN\s+SCHEMA/i.test(code)) refuse('migration contains ALL TABLES IN SCHEMA');
    if (/ALTER\s+DEFAULT\s+PRIVILEGES/i.test(code)) refuse('migration contains ALTER DEFAULT PRIVILEGES');
    if (/bypass_rls_policy/i.test(code)) refuse('migration touches bypass_rls_policy');
    // Least privilege on the routed table: SELECT and UPDATE, never INSERT or DELETE.
    for (const stmt of code.split(';')) {
      if (!/\bGRANT\b/i.test(stmt) || !/"AutomationRule"/.test(stmt)) continue;
      const verbs = stmt.slice(stmt.search(/\bGRANT\b/i), stmt.search(/\bON\b/i) + 1);
      if (/\bINSERT\b/i.test(verbs)) refuse('migration grants INSERT on "AutomationRule" — no routed path creates a rule');
      if (/\bDELETE\b/i.test(verbs)) refuse('migration grants DELETE on "AutomationRule" — no routed path removes a rule');
    }

    console.error('[613] apply guards passed (checked against comment-stripped SQL)');
    const grantsBefore = await grantsOf();
    console.error(`[613] grants BEFORE : ${grantsBefore.join(' · ')}`);

    const lf = raw.replace(/\r\n/g, '\n');
    await priv.query('BEGIN');
    await priv.query(lf);
    await priv.query('COMMIT');
    console.log('migration APPLIED to staging (single transaction, committed)');

    const grantsAfter = await grantsOf();
    console.log(`grants AFTER  : ${grantsAfter.join(' · ')}`);

    // ── DEC-17: the ledger row, by hand, behind a sentinel ─────────────────
    //
    // Neither MCP tool writes Prisma's `_prisma_migrations` ledger:
    // `apply_migration` records into SUPABASE's own ledger, a DIFFERENT table
    // (quick-581 disproved "it does both" directly). The row is written by hand
    // every time and READ BACK — and the read-back is only meaningful behind a
    // sentinel, because `_prisma_migrations` has RLS enabled with ZERO policies
    // and no `app_user` grant, so an empty read from a non-owner role is
    // indistinguishable from absence and the natural response to that is a
    // DUPLICATE WRITE.
    const checksum = createHash('sha256').update(lf, 'utf8').digest('hex');
    const out: string[] = [];
    const say = (s: string) => {
      out.push(s);
      console.log(s);
    };

    say(`# quick-613 — DEC-17 ledger read-back`);
    say('');
    say(`migration : ${MIGRATION_NAME}`);
    say(`database  : ${STAGING_REF} (staging), connected as ${privWho.cu}`);
    say(`sha256 over LF bytes : ${checksum}`);
    say('');
    say(`grants BEFORE : ${grantsBefore.join(' · ') || '(none for either role)'}`);
    say(`grants AFTER  : ${grantsAfter.join(' · ')}`);
    say('');

    const sentinel = await priv.query('select migration_name from _prisma_migrations where migration_name = $1', [
      LEDGER_SENTINEL,
    ]);
    say(`SENTINEL ${LEDGER_SENTINEL}`);
    say(`  visible: ${sentinel.rowCount === 1 ? 'YES' : 'NO — an empty read here means NOTHING about absence'}`);
    if (sentinel.rowCount !== 1) {
      console.error('ABORT: sentinel not visible, so an empty read-back cannot be trusted.');
      process.exit(1);
    }

    const newest3Before = await priv.query(
      `select migration_name from _prisma_migrations order by finished_at desc nulls last limit 3`,
    );
    say('');
    say('newest 3 ledger rows BEFORE the write:');
    for (const r of newest3Before.rows) say(`  ${r.migration_name}`);

    const already = await priv.query('select migration_name from _prisma_migrations where migration_name = $1', [
      MIGRATION_NAME,
    ]);
    say('');
    if (already.rowCount === 0) {
      await priv.query(
        `insert into _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
         select $1::uuid, $2::varchar, now(), $3::varchar, '', NULL, now(), 0
          where not exists (select 1 from _prisma_migrations where migration_name = $3::varchar)`,
        [randomUUID(), checksum, MIGRATION_NAME],
      );
      say('ledger row INSERTed BY HAND — no MCP tool and no DDL writes this (DEC-17)');
    } else {
      const upd = await priv.query(
        `update _prisma_migrations set checksum = $1::varchar where migration_name = $2::varchar and checksum <> $1::varchar`,
        [checksum, MIGRATION_NAME],
      );
      say(`ledger row already present — checksum ${upd.rowCount ? 'REFRESHED (file changed)' : 'unchanged'}`);
    }

    const back = await priv.query(
      `select migration_name, checksum, applied_steps_count, logs, (started_at = finished_at) as same_ts
         from _prisma_migrations order by finished_at desc nulls last limit 3`,
    );
    say('');
    say('READ BACK — newest 3 ledger rows:');
    for (const r of back.rows) {
      say(
        `  ${r.migration_name} | steps=${r.applied_steps_count} | logs=${JSON.stringify(r.logs)} | started=finished:${r.same_ts} | checksum=${r.checksum}`,
      );
    }
    const head = back.rows[0];
    say('');
    say(`HEAD IS OURS: ${head.migration_name === MIGRATION_NAME} (expected ${MIGRATION_NAME})`);
    say(`checksum is a real SHA-256, not 'manual': ${head.checksum === checksum}`);
    say(`applied_steps_count is 0 (mirrored, not executed by migrate.mjs): ${head.applied_steps_count === 0}`);
    say(`logs = '' : ${head.logs === ''}`);
    say(`started_at = finished_at : ${head.same_ts === true}`);
    const total = (await priv.query('select count(*)::int as n from _prisma_migrations')).rows[0].n;
    say(`staging _prisma_migrations rows AFTER: ${total}`);

    if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(resolve(EVIDENCE_DIR, '02-ledger-readback.md'), out.join('\n') + '\n', 'utf8');
    await priv.end();

    if (head.migration_name !== MIGRATION_NAME || head.checksum !== checksum || head.applied_steps_count !== 0) {
      console.error('READ-BACK DISAGREES WITH WHAT WAS WRITTEN.');
      process.exit(1);
    }
    return;
  }

  // ── context ──────────────────────────────────────────────────────────────
  const tenants = await priv.query<{ id: string; name: string }>('select id, name from "Tenant" order by "createdAt"');
  if (tenants.rows.length < 2) refuse('need two staging tenants');
  const A = tenants.rows[0].id;
  const B = tenants.rows[1].id;
  console.error(`[db-target] tenantA  : ${A}`);
  console.error(`[db-target] tenantB  : ${B}`);

  const systemAtEntry = (await priv.query(`select count(*)::int n from "AutomationRule" where scope='SYSTEM'`)).rows[0].n;
  if (systemAtEntry !== 6) refuse(`expected 6 SYSTEM platform rules at entry, found ${systemAtEntry}`);

  const systemRule = (
    await priv.query<{ id: string; key: string; isActive: boolean }>(
      `select id, key, "isActive" from "AutomationRule" where scope='SYSTEM' order by key limit 1`,
    )
  ).rows[0];

  const policyCount = (await priv.query('select count(*)::int n from pg_policy')).rows[0].n;
  const bypassCount = (
    await priv.query("select count(*)::int n from pg_policy where polname='bypass_rls_policy'")
  ).rows[0].n;
  const bypassTables: string[] = (
    await priv.query(
      "select c.relname from pg_policy p join pg_class c on c.oid=p.polrelid where p.polname='bypass_rls_policy' order by 1",
    )
  ).rows.map((r) => r.relname);

  const livePolicies = (
    await priv.query(`select c.relname as tbl, p.polname,
        case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE' when 'd' then 'DELETE' when '*' then 'ALL' end cmd,
        pg_get_expr(p.polqual,p.polrelid) qual,
        pg_get_expr(p.polwithcheck,p.polrelid) with_check
      from pg_policy p join pg_class c on c.oid = p.polrelid
      where c.relname in ('AutomationRule','AutomationRun','Tenant') order by tbl, cmd, polname`)
  ).rows;

  const grantsNow = await grantsOf();
  console.error(`[613] grants on "AutomationRule" : ${grantsNow.join(' · ')}`);

  // ── fixtures — committed, because the probes run on OTHER connections ─────
  const OWN_A = randomUUID();
  const OWN_B = randomUUID();
  const RUN_A = randomUUID();
  const RUN_B = randomUUID();
  const mkRule = async (id: string, tenantId: string, tag: string) =>
    priv.query(
      `insert into "AutomationRule" (id, key, name, description, "triggerEvent", "isActive", scope, "tenantId", "actionsJson", "updatedAt")
       values ($1,$2,$3,'quick-613 disposable fixture','TENANT_CREATED', true, 'TENANT'::"AutomationScope", $4, '[]'::jsonb, now())`,
      [id, `quick613_${tag}_${id.slice(0, 8)}`, `quick-613 ${tag}`, tenantId],
    );
  await mkRule(OWN_A, A, 'ownA');
  await mkRule(OWN_B, B, 'ownB');
  const mkRun = async (id: string, tenantId: string) =>
    priv.query(
      `insert into "AutomationRun" (id, "ruleId", "tenantId", "triggeredBy", status, "firedAt")
       values ($1,$2,$3,'quick613:fixture','FIRED'::"AutomationRunStatus", now())`,
      [id, systemRule.id, tenantId],
    );
  await mkRun(RUN_A, A);
  await mkRun(RUN_B, B);
  console.error(`[613] fixtures   : 2 TENANT rules (A,B) + 2 AutomationRun rows (A,B) on SYSTEM rule ${systemRule.key}`);

  const adminC = new Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 30000 });
  await adminC.connect();
  const adminWho = (await adminC.query<{ cu: string }>('select current_user as cu')).rows[0].cu;
  if (adminWho !== 'app_admin') refuse(`the ADMIN lane resolved as ${adminWho}, not app_admin`);

  const appC = new Client({ connectionString: APP_USER_URL, connectionTimeoutMillis: 30000 });
  await appC.connect();
  const appWho = (await appC.query<{ cu: string }>('select current_user as cu')).rows[0].cu;
  if (appWho !== 'app_user') refuse(`the TENANT lane resolved as ${appWho}, not app_user`);
  // Session-level SET is the ONLY arming mechanism there is (quick-602 — ALTER
  // ROLE/DATABASE of a placeholder GUC is 42501 on this instance, and Supavisor
  // silently drops the connection-string `options` parameter).
  await appC.query(`select set_config('app.tenant_context_tripwire','on',false)`);
  const tripwire = (
    await appC.query<{ v: string | null }>(`select current_setting('app.tenant_context_tripwire', true) as v`)
  ).rows[0].v;
  console.error(`[613] lanes      : app_admin=${adminWho} · app_user=${appWho} · tripwire=${tripwire}`);

  const probes: Probe[] = [];

  const run = async (
    site: string,
    siteLabel: string,
    lane: Lane,
    expectation: string,
    label: string,
    sql: string,
    params: unknown[] = [],
    opts: { counter?: { label: string; sql: string }; own?: OwnPair } = {},
  ) => {
    const c = lane === 'ADMIN' ? adminC : appC;
    const p: Probe = { site, siteLabel, lane, expectation, label, rows: null, values: null, error: null, gucSeen: null };
    await c.query('BEGIN');
    try {
      if (lane === 'TENANT_A') await c.query(`select set_config('app.current_tenant_id',$1,true)`, [A]);
      // Read the GUC BEFORE the probe: if the probe raises, the transaction is
      // aborted and nothing else can be asked of it.
      if (lane !== 'ADMIN') {
        p.gucSeen = (
          await c.query<{ v: string | null }>(`select current_setting('app.current_tenant_id', true) as v`)
        ).rows[0].v;
      }
      const r = await c.query(sql, params as never[]);
      p.rows = r.rowCount;
      if (r.rows.length) {
        p.values = {};
        for (const [k, v] of Object.entries(r.rows[0] as Record<string, unknown>)) {
          p.values[k] = typeof v === 'number' || typeof v === 'string' ? v : v === null ? null : String(v);
        }
      }
      // quick-610's inverse of D3: a cross-tenant zero is vacuous unless the
      // SAME connection, in the SAME transaction, can still read its OWN rows.
      if (opts.own) {
        try {
          const o = await c.query(opts.own.sql, (opts.own.params ?? []) as never[]);
          p.pairedOwn = { label: opts.own.label, value: Number((o.rows[0] as { n: number }).n), error: null };
        } catch (e) {
          p.pairedOwn = { label: opts.own.label, value: null, error: `${sqlstateOf(e)}` };
        }
      }
    } catch (e) {
      p.error = { sqlstate: sqlstateOf(e), message: String((e as Error).message ?? e).split('\n')[0] };
      if (opts.own) {
        // The probe's transaction is aborted; the own-read has to be taken on a
        // fresh transaction or it fails with 25P02 and says nothing.
        await c.query('ROLLBACK');
        await c.query('BEGIN');
        if (lane === 'TENANT_A') await c.query(`select set_config('app.current_tenant_id',$1,true)`, [A]);
        try {
          const o = await c.query(opts.own.sql, (opts.own.params ?? []) as never[]);
          p.pairedOwn = { label: opts.own.label, value: Number((o.rows[0] as { n: number }).n), error: null };
        } catch (e2) {
          p.pairedOwn = { label: opts.own.label, value: null, error: `${sqlstateOf(e2)}` };
        }
      }
    } finally {
      // The counter-read runs on the PRIVILEGED connection while the probe's
      // transaction is still open, so it sees COMMITTED state and cannot be
      // fooled by the probe's own uncommitted work.
      if (opts.counter) {
        const cr = await priv.query(opts.counter.sql);
        p.counterRead = { label: opts.counter.label, value: Number((cr.rows[0] as { n: number }).n) };
      }
      await c.query('ROLLBACK');
    }
    probes.push(p);
  };

  try {
    // ── SITE 1 — getAutomationRules: findMany + _count.runs ────────────────
    const SITE1 = `select count(*)::int as rules_visible,
        coalesce(sum((select count(*) from "AutomationRun" ar where ar."ruleId" = r.id)),0)::int as runs_counted
      from "AutomationRule" r`;
    await run('1', 'getAutomationRules — findMany + _count.runs', 'ADMIN', 'must SUCCEED',
      'every rule, and a run count spanning BOTH tenants', SITE1);
    await run('1', 'getAutomationRules — findMany + _count.runs', 'TENANT_A', 'must UNDER-READ',
      'run count drops every run the GUC does not name', SITE1);
    await run('1', 'getAutomationRules — findMany + _count.runs', 'TENANT_EMPTY', 'MEASURE',
      'the GUC a sysadmin request actually carries', SITE1);

    // ── SITE 2 — getRuleWithRuns: findUnique + include runs.tenant.name ────
    const SITE2 = `select count(ar.id)::int as runs_visible, count(t.name)::int as tenant_names_visible
      from "AutomationRule" r
      left join "AutomationRun" ar on ar."ruleId" = r.id
      left join "Tenant" t on t.id = ar."tenantId"
      where r.id = $1`;
    await run('2', 'getRuleWithRuns — last 10 runs joined to Tenant.name', 'ADMIN', 'must SUCCEED',
      'both runs and both tenant names', SITE2, [systemRule.id]);
    await run('2', 'getRuleWithRuns — last 10 runs joined to Tenant.name', 'TENANT_A', 'must UNDER-READ',
      "tenant B's run and its tenant name are invisible", SITE2, [systemRule.id]);
    await run('2', 'getRuleWithRuns — last 10 runs joined to Tenant.name', 'TENANT_EMPTY', 'MEASURE',
      'the GUC a sysadmin request actually carries', SITE2, [systemRule.id]);

    // ── SITE 3 — toggleRuleActive: UPDATE a SYSTEM rule ────────────────────
    const SITE3 = `update "AutomationRule" set "isActive" = not "isActive" where id = $1`;
    const UNCHANGED = {
      label: 'the SYSTEM rule still carries its original isActive',
      sql: `select count(*)::int n from "AutomationRule" where id = '${systemRule.id}' and "isActive" = ${systemRule.isActive}`,
    };
    await run('3', 'toggleRuleActive — UPDATE a SYSTEM platform rule', 'ADMIN',
      mode === 'before' ? 'must be 42501 — NO GRANT YET' : 'must SUCCEED — the grant is live',
      'flip isActive on a platform rule', SITE3, [systemRule.id], { counter: UNCHANGED });
    await run('3', 'toggleRuleActive — UPDATE a SYSTEM platform rule', 'TENANT_A', 'must be REFUSED',
      'post-612 this is a SILENT 0 rows, not a 42501', SITE3, [systemRule.id], { counter: UNCHANGED });
    await run('3', 'toggleRuleActive — UPDATE a SYSTEM platform rule', 'TENANT_EMPTY', 'MEASURE',
      'the GUC a sysadmin request actually carries', SITE3, [systemRule.id], { counter: UNCHANGED });

    // ── SITE 4 — manualTriggerRule's tenant.findUnique ─────────────────────
    const SITE4 = `select count(*)::int as n from "Tenant" where id = $1`;
    const OWN_TENANT: OwnPair = { label: 'own tenant A still readable on the SAME connection', sql: SITE4, params: [A] };
    await run('4', 'manualTriggerRule — tenant.findUnique (an ARBITRARY operator-supplied tenant)', 'ADMIN', 'must SUCCEED',
      'reads tenant B, which the operator is not', SITE4, [B]);
    await run('4', 'manualTriggerRule — tenant.findUnique (an ARBITRARY operator-supplied tenant)', 'TENANT_A', 'must be REFUSED',
      'tenant B is invisible — paired with an own > 0', SITE4, [B], { own: OWN_TENANT });
    await run('4', 'manualTriggerRule — tenant.findUnique (an ARBITRARY operator-supplied tenant)', 'TENANT_EMPTY', 'MEASURE',
      'the GUC a sysadmin request actually carries', SITE4, [B], { own: OWN_TENANT });

    // ── SITE 5 — manualTriggerRule's automationRule.findUnique ─────────────
    const SITE5 = `select count(*)::int as n from "AutomationRule" where id = $1`;
    await run('5a', 'manualTriggerRule — automationRule.findUnique, a SYSTEM rule', 'ADMIN', 'must SUCCEED',
      'reads the platform rule', SITE5, [systemRule.id]);
    await run('5a', 'manualTriggerRule — automationRule.findUnique, a SYSTEM rule', 'TENANT_A',
      'HONEST FINDING — visible today', "612's SELECT half deliberately keeps the SYSTEM branch", SITE5, [systemRule.id]);
    await run('5a', 'manualTriggerRule — automationRule.findUnique, a SYSTEM rule', 'TENANT_EMPTY', 'MEASURE',
      'the GUC a sysadmin request actually carries', SITE5, [systemRule.id]);

    const OWN_RULE: OwnPair = { label: "own tenant A's rule still readable on the SAME connection", sql: SITE5, params: [OWN_A] };
    await run('5b', "manualTriggerRule — automationRule.findUnique, another TENANT's rule", 'ADMIN', 'must SUCCEED',
      "reads tenant B's TENANT-scoped rule", SITE5, [OWN_B]);
    await run('5b', "manualTriggerRule — automationRule.findUnique, another TENANT's rule", 'TENANT_A', 'must be REFUSED',
      'the structural cross-tenant case — paired with an own > 0', SITE5, [OWN_B], { own: OWN_RULE });
    await run('5b', "manualTriggerRule — automationRule.findUnique, another TENANT's rule", 'TENANT_EMPTY', 'MEASURE',
      'the GUC a sysadmin request actually carries', SITE5, [OWN_B], { own: OWN_RULE });

    // ── report ────────────────────────────────────────────────────────────
    const systemAtExit = (await priv.query(`select count(*)::int n from "AutomationRule" where scope='SYSTEM'`)).rows[0].n;

    const fmt = (p: Probe) => {
      if (p.error) return `ERROR [${p.error.sqlstate}] ${p.error.message}`;
      if (p.values && Object.keys(p.values).length) {
        return Object.entries(p.values)
          .map(([k, v]) => `${k} = **${v}**`)
          .join(' · ');
      }
      return `${p.rows} row(s) affected`;
    };

    const lines: string[] = [];
    lines.push(`# quick-613 — routed \`AutomationRule\` sites, both directions (${mode.toUpperCase()})`);
    lines.push('');
    lines.push(
      `project \`${STAGING_REF}\` (staging) · ADMIN lane \`${adminWho}\` · TENANT lane \`${appWho}\` (tripwire \`${tripwire}\`) · counter-reads as \`${privWho.cu}\``,
    );
    lines.push('');
    lines.push(`Every probe runs inside \`BEGIN … ROLLBACK\`. Fixtures are COMMITTED (the probes run on other connections) and torn down in a \`finally\`.`);
    lines.push('');
    lines.push(`grants on \`"AutomationRule"\`: ${grantsNow.map((g) => `\`${g}\``).join(' · ')}`);
    lines.push('');
    lines.push(`pg_policy total = **${policyCount}** · \`bypass_rls_policy\` = **${bypassCount}**`);
    lines.push(`SYSTEM platform rules: **${systemAtEntry}** at entry, **${systemAtExit}** at close`);
    lines.push(`SYSTEM rule under test: \`${systemRule.key}\` (\`${systemRule.id}\`, isActive = ${systemRule.isActive})`);
    lines.push(`tenant A = \`${A}\` · tenant B = \`${B}\``);
    lines.push('');
    lines.push('## the matrix');
    lines.push('');
    lines.push('| site | lane | expectation | probe | result | counter-read | paired own-read |');
    lines.push('|---|---|---|---|---|---|---|');
    for (const p of probes) {
      const cr = p.counterRead ? `${p.counterRead.label} = **${p.counterRead.value}**` : '—';
      const own = p.pairedOwn
        ? p.pairedOwn.error
          ? `${p.pairedOwn.label} → ERROR [${p.pairedOwn.error}]`
          : `${p.pairedOwn.label} = **${p.pairedOwn.value}**`
        : '—';
      lines.push(
        `| ${p.site} | ${LANE_LABEL[p.lane]} | ${p.expectation} | ${p.label} | ${fmt(p)} | ${cr} | ${own} |`,
      );
    }
    lines.push('');
    lines.push('## the five sites');
    lines.push('');
    for (const s of [...new Set(probes.map((p) => p.site))]) {
      lines.push(`- **${s}** — ${probes.find((p) => p.site === s)!.siteLabel}`);
    }
    lines.push('');
    lines.push('## live policies consulted by these statements');
    lines.push('');
    for (const p of livePolicies) {
      lines.push(`- **${p.tbl}** [${p.cmd}] \`${p.polname}\``);
      lines.push(`  - USING      : \`${p.qual ?? '(none)'}\``);
      lines.push(`  - WITH CHECK : \`${p.with_check ?? '(none)'}\``);
    }
    const md = lines.join('\n') + '\n';

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const stem = mode === 'before' ? '01-before' : '03-after';
    writeFileSync(resolve(EVIDENCE_DIR, `${stem}.md`), md);
    writeFileSync(
      resolve(EVIDENCE_DIR, `${stem}.json`),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          project: STAGING_REF,
          mode,
          roles: { admin: adminWho, tenant: appWho, privileged: privWho.cu },
          tripwire,
          grants: grantsNow,
          policyCount,
          bypassCount,
          bypassTables,
          livePolicies,
          systemAtEntry,
          systemAtExit,
          systemRule,
          tenantA: A,
          tenantB: B,
          probes,
        },
        null,
        2,
      ),
    );
    console.log(md);
  } finally {
    const delRuns = await priv.query(`delete from "AutomationRun" where "triggeredBy" = 'quick613:fixture'`);
    const delRules = await priv.query(`delete from "AutomationRule" where key like 'quick613\\_%'`);
    const leftRuns = (
      await priv.query(`select count(*)::int n from "AutomationRun" where "triggeredBy" = 'quick613:fixture'`)
    ).rows[0].n;
    const leftRules = (
      await priv.query(`select count(*)::int n from "AutomationRule" where key like 'quick613\\_%'`)
    ).rows[0].n;
    console.error(`[613] teardown : runs deleted ${delRuns.rowCount}, left ${leftRuns} · rules deleted ${delRules.rowCount}, left ${leftRules}`);
    if (leftRuns !== 0 || leftRules !== 0) {
      console.error('[613] *** TEARDOWN DID NOT LAND — fixture rows remain on staging. ***');
      process.exitCode = 1;
    }
    const sysFinal = (await priv.query(`select count(*)::int n from "AutomationRule" where scope='SYSTEM'`)).rows[0].n;
    console.error(`[613] SYSTEM rows at exit: ${sysFinal}`);
    if (sysFinal !== 6) {
      console.error('[613] *** SYSTEM ROW COUNT CHANGED — this task must never destroy a platform rule. ***');
      process.exitCode = 1;
    }
    await appC.end();
    await adminC.end();
    await priv.end();
  }
}

main().catch((e) => {
  console.error('613-routing-verify FAILED:', e);
  process.exit(1);
});
