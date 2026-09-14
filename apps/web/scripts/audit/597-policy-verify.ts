/**
 * quick-597 — the before/after RLS verification matrix, run AS `app_user` against STAGING.
 *
 *   npx tsx scripts/audit/597-policy-verify.ts --phase before
 *   npx tsx scripts/audit/597-policy-verify.ts --phase after
 *
 * Writes evidence/<phase>.json and evidence/<phase>.md.
 *
 * WHY THIS FILE EXISTS. The four policies quick-597 changes are INERT today: the
 * application connects as `postgres`, which has `rolbypassrls = true`. A green
 * deploy therefore proves nothing about any of them. The only instrument that can
 * say anything is a connection made as a role that RLS actually applies to, with a
 * known `app.current_tenant_id`, against rows whose owning tenant is known in
 * advance. That is this file.
 *
 * STAGING ONLY. THIS FILE MUST NEVER IMPORT `scripts/_bootstrap-env`.
 * ------------------------------------------------------------------
 * `_bootstrap-env.ts:53-55` runs `process.env.DATABASE_URL = process.env.DIRECT_URL`
 * UNCONDITIONALLY, and every env file points `DIRECT_URL` at PRODUCTION. This file
 * loads `apps/web/.env.staging` explicitly and refuses on the production ref.
 *
 * FOUR GROUND RULES
 *   1. Nothing is swallowed. Every probe records `{rows:n}` or `{error:{code,message}}`
 *      with the SQLSTATE and the full server message.
 *   2. Every write probe runs inside `BEGIN … ROLLBACK`. There is no commit statement
 *      in this file.
 *   3. One FRESH `pg.Client` per GUC case, so no session GUC can bleed between cases.
 *      Each case's work additionally runs inside ONE transaction, because
 *      `STAGING_DATABASE_URL_APP_USER` is a Supavisor TRANSACTION-mode pooler string:
 *      outside a transaction consecutive statements may land on different backends and
 *      a session-scope `set_config` would not be observed by the next statement. A
 *      transaction pins the backend. Each individual probe is fenced with a SAVEPOINT
 *      so that an expected raise (22P02) aborts only itself and not the whole case.
 *   4. This is a REPORT, not a gate. An unexpected probe result is recorded, never
 *      thrown. Only a failure to connect or to read the fixture ids exits 1.
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
  '.planning/quick/597-fix-unsatisfiable-and-incorrect-rls-poli/evidence'
);

loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });

function refuse(reason: string): never {
  console.error(`597-policy-verify: REFUSING TO RUN — ${reason}`);
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

// quick-598 follow-up — prefer the gitignored runtime handshake file that
// --seed now writes; fall back to quick-597's frozen evidence copy so this
// harness still reproduces against the record its own conclusions rest on.
const RUNTIME_FIXTURE_IDS_PATH = resolve(APP_ROOT, '.rls-fixture-ids.json');
const FIXTURE_IDS_PATH = existsSync(RUNTIME_FIXTURE_IDS_PATH)
  ? RUNTIME_FIXTURE_IDS_PATH
  : resolve(EVIDENCE_DIR, 'fixture-ids.json');
let fixtures: FixtureIds;
try {
  fixtures = JSON.parse(readFileSync(FIXTURE_IDS_PATH, 'utf8')) as FixtureIds;
} catch (e) {
  refuse(`could not read ${FIXTURE_IDS_PATH} — run --seed first (${(e as Error).message})`);
}
if (fixtures.projectRef !== STAGING_REF) {
  refuse(`fixture-ids.json was captured against project ${fixtures.projectRef}, not ${STAGING_REF}`);
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

/** Physical table name -> the SQL identifier to write in a statement. */
const TARGETS: Array<{ key: string; sql: string }> = [
  { key: 'audit_log', sql: 'audit_log' },
  { key: 'in_app_notifications', sql: 'in_app_notifications' },
  { key: 'PushToken', sql: '"PushToken"' },
  { key: 'SysAdminInvoice', sql: '"SysAdminInvoice"' },
  { key: 'SysAdminInvoiceItem', sql: '"SysAdminInvoiceItem"' },
  { key: 'stops', sql: 'stops' },
  { key: 'carrier_documents', sql: 'carrier_documents' },
  { key: 'route_template_stops', sql: 'route_template_stops' },
];

type GucCase = 'tenantA' | 'tenantB' | 'empty' | 'unset';

// `unset` runs FIRST, deliberately. `STAGING_DATABASE_URL_APP_USER` is a Supavisor
// TRANSACTION-mode pooler string, and a session-scope `set_config` survives on the
// server connection after the client that issued it has gone (quick-413's pool
// leak, empirically confirmed on the Supabase pooler). A `unset` case run after the
// `empty` case therefore stands a good chance of inheriting `''` from it and
// reporting `22P02` for a reason that has nothing to do with this task. Running it
// first minimises that, and `observedGucAtCaseStart` below MEASURES what the case
// actually saw rather than assuming it.
const GUC_CASES: GucCase[] = ['unset', 'tenantA', 'tenantB', 'empty'];

function gucValueFor(c: GucCase): string | null {
  if (c === 'tenantA') return fixtures.tenants.A.id;
  if (c === 'tenantB') return fixtures.tenants.B.id;
  if (c === 'empty') return '';
  return null; // 'unset' — set_config is never issued
}

// ---------------------------------------------------------------------------
// Probe result shape — nothing is ever swallowed
// ---------------------------------------------------------------------------

type Probe = { rows: number } | { error: { code: string; message: string } };

function fmtProbe(p: Probe): string {
  if ('rows' in p) return String(p.rows);
  return `ERROR [${p.error.code}] ${p.error.message}`;
}

/**
 * Run one statement inside a SAVEPOINT so an expected raise aborts only itself.
 * Returns the row count for a SELECT count(*) (first column of the first row) or
 * the affected row count for DML, never null.
 */
async function probe(client: Client, sql: string, params: unknown[] = []): Promise<Probe> {
  await client.query('SAVEPOINT p597');
  try {
    const r = await client.query(sql, params);
    await client.query('RELEASE SAVEPOINT p597');
    if (r.rows.length > 0) {
      const first = r.rows[0] as Record<string, unknown>;
      const v = Object.values(first)[0];
      return { rows: Number(v) };
    }
    return { rows: r.rowCount ?? 0 };
  } catch (e) {
    await client.query('ROLLBACK TO SAVEPOINT p597').catch(() => {});
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

interface ReadCell {
  tenantARows: Probe;
  tenantBRows: Probe;
  totalVisible: Probe;
}

/**
 * What `current_setting('app.current_tenant_id', true)` actually read at the start of
 * this case's transaction, AFTER any `set_config` the case issues. For `unset` this is
 * the only honest statement available: on a transaction-mode pooler a "fresh client"
 * is not a fresh backend, so `null` means genuinely unset and `''` means the backend
 * carried a leaked value.
 */
type ObservedGuc = Record<GucCase, { atConnect: string | null; afterSet: string | null }>;

interface Report {
  phase: 'before' | 'after';
  capturedAt: string;
  projectRef: string;
  connection: {
    appUserRole: string;
    appUserBypassRls: boolean;
    /** What a brand-new app_user connection already carries. Null = genuinely unset. */
    gucOnFreshConnection: string | null;
  };
  currentTenantIdDefinition: string;
  policies: PolicyRow[];
  totalPolicyCount: number;
  bypassPolicies: Array<{ tablename: string; policyname: string }>;
  readMatrix: Record<string, Record<GucCase, ReadCell>>;
  observedGuc: ObservedGuc;
  /** Can an `app_user` connection get `app.current_tenant_id` back to NULL at all? */
  unsetReachability: {
    atConnect: string | null;
    afterSetConfigNull: string | null;
    afterReset: string | null;
  };
  writeProbes: Record<string, Probe>;
  fixtureCounts: Record<string, { A: number; B: number }>;
}

// ---------------------------------------------------------------------------
// 1. Policy snapshot (as postgres, read-only)
// ---------------------------------------------------------------------------

async function snapshot(): Promise<
  Pick<Report, 'policies' | 'totalPolicyCount' | 'bypassPolicies' | 'currentTenantIdDefinition'>
> {
  const admin = new Client({ connectionString: DIRECT_URL });
  await admin.connect();
  try {
    const tables = TARGETS.map((t) => t.key);
    const pol = await admin.query<PolicyRow>(
      `SELECT schemaname, tablename, policyname, permissive,
              COALESCE(array_to_string(roles, ','), '') AS roles,
              cmd, qual, with_check
         FROM pg_policies
        WHERE schemaname = 'public' AND tablename = ANY($1)
        ORDER BY tablename, policyname`,
      [tables]
    );

    const total = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM pg_policy`
    );

    const bypass = await admin.query<{ tablename: string; policyname: string }>(
      `SELECT tablename, policyname FROM pg_policies
        WHERE policyname = 'bypass_rls_policy'
        ORDER BY tablename`
    );

    const fn = await admin.query<{ def: string }>(
      `SELECT pg_get_functiondef(p.oid) AS def
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = 'current_tenant_id' AND n.nspname = 'public'`
    );

    return {
      policies: pol.rows,
      totalPolicyCount: Number(total.rows[0].n),
      bypassPolicies: bypass.rows,
      currentTenantIdDefinition: fn.rows[0]?.def ?? '(function not found)',
    };
  } finally {
    await admin.end().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// 2. Read matrix (as app_user, fresh connection per GUC case)
// ---------------------------------------------------------------------------

async function openAppUser(): Promise<Client> {
  const c = new Client({ connectionString: APP_USER_URL });
  await c.connect();
  return c;
}

async function readMatrix(): Promise<{
  matrix: Report['readMatrix'];
  connection: Report['connection'];
  observedGuc: ObservedGuc;
}> {
  const matrix: Report['readMatrix'] = {};
  for (const t of TARGETS) {
    matrix[t.key] = {} as Record<GucCase, ReadCell>;
  }

  let connection: Report['connection'] | undefined;
  const observedGuc = {} as ObservedGuc;

  for (const gucCase of GUC_CASES) {
    // FRESH physical connection per case.
    const c = await openAppUser();
    try {
      await c.query('BEGIN');

      const who = await c.query<{ u: string; bypass: boolean; guc: string | null }>(
        `SELECT current_user AS u,
                (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass,
                current_setting('app.current_tenant_id', true) AS guc`
      );
      if (!connection) {
        connection = {
          appUserRole: who.rows[0].u,
          appUserBypassRls: who.rows[0].bypass,
          gucOnFreshConnection: who.rows[0].guc,
        };
      }

      const value = gucValueFor(gucCase);
      if (value !== null) {
        await c.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [value]);
      }

      const after = await c.query<{ guc: string | null }>(
        `SELECT current_setting('app.current_tenant_id', true) AS guc`
      );
      observedGuc[gucCase] = { atConnect: who.rows[0].guc, afterSet: after.rows[0].guc };

      for (const t of TARGETS) {
        const aIds = fixtures.rows[t.key]?.A ?? [];
        const bIds = fixtures.rows[t.key]?.B ?? [];
        matrix[t.key][gucCase] = {
          tenantARows: await probe(
            c,
            `SELECT count(*)::int AS n FROM ${t.sql} WHERE id::text = ANY($1::text[])`,
            [aIds]
          ),
          tenantBRows: await probe(
            c,
            `SELECT count(*)::int AS n FROM ${t.sql} WHERE id::text = ANY($1::text[])`,
            [bIds]
          ),
          totalVisible: await probe(c, `SELECT count(*)::int AS n FROM ${t.sql}`),
        };
      }

      await c.query('ROLLBACK');
    } finally {
      await c.end().catch(() => {});
    }
  }

  if (!connection) refuse('never established an app_user connection');
  return { matrix, connection, observedGuc };
}

/**
 * Is a genuinely-unset `app.current_tenant_id` reachable at all on this connection?
 *
 * Measured rather than assumed, because the answer decides what the `unset` row of
 * the read matrix means. Once a placeholder GUC has been SET on a backend, its reset
 * value is `''`, not "absent" — so neither `set_config(name, NULL, false)` (which is
 * documented as equivalent to RESET) nor a literal `RESET` returns
 * `current_setting(name, true)` to NULL. On a transaction-mode pooler that backend is
 * then handed to the next client still carrying `''`.
 */
async function unsetReachability(): Promise<Report['unsetReachability']> {
  const c = await openAppUser();
  try {
    await c.query('BEGIN');
    const read = async () => {
      const r = await c.query<{ g: string | null }>(
        `SELECT current_setting('app.current_tenant_id', true) AS g`
      );
      return r.rows[0].g;
    };
    const atConnect = await read();
    await c.query(`SELECT set_config('app.current_tenant_id', NULL, false)`);
    const afterSetConfigNull = await read();
    await c.query('RESET "app.current_tenant_id"').catch(() => {});
    const afterReset = await read();
    await c.query('ROLLBACK');
    return { atConnect, afterSetConfigNull, afterReset };
  } finally {
    await c.end().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// 3. Write probes (as app_user, every one inside BEGIN … ROLLBACK)
// ---------------------------------------------------------------------------

async function writeProbes(): Promise<Report['writeProbes']> {
  const out: Report['writeProbes'] = {};
  const A = fixtures.tenants.A;
  const B = fixtures.tenants.B;

  // (a) audit_log INSERT under GUC = ''
  //
  // DEC-14: `audit_log_action_check` admits only eight literal actions, so the
  // probe writes 'EXPORT' and marks itself in `resource_type`, which has no CHECK.
  // Using an invented action would make every probe a 23514 and tell us nothing
  // about the policy.
  {
    const c = await openAppUser();
    try {
      await c.query('BEGIN');
      await c.query(`SELECT set_config('app.current_tenant_id', '', false)`);
      out['audit_log.insert@guc-empty'] = await probe(
        c,
        `INSERT INTO audit_log (tenant_id, user_id, action, resource_type, resource_id)
         VALUES ($1, $2, 'EXPORT', 'RLS597_resource', gen_random_uuid())`,
        [A.id, A.ownerUserId]
      );
      await c.query('ROLLBACK');
    } finally {
      await c.end().catch(() => {});
    }
  }

  // (b) audit_log INSERT under GUC = tenantA, naming tenantA — the legitimate path.
  {
    const c = await openAppUser();
    try {
      await c.query('BEGIN');
      await c.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [A.id]);
      out['audit_log.insert-own@guc-A'] = await probe(
        c,
        `INSERT INTO audit_log (tenant_id, user_id, action, resource_type, resource_id)
         VALUES ($1, $2, 'EXPORT', 'RLS597_resource', gen_random_uuid())`,
        [A.id, A.ownerUserId]
      );
      // writeAuditLog's documented contract is to write rows whose tenant differs
      // from the connection. Measure that too — it is REPORTED, not fixed here.
      out['audit_log.insert-cross@guc-A'] = await probe(
        c,
        `INSERT INTO audit_log (tenant_id, user_id, action, resource_type, resource_id)
         VALUES ($1, $2, 'EXPORT', 'RLS597_resource', gen_random_uuid())`,
        [B.id, B.ownerUserId]
      );
      await c.query('ROLLBACK');
    } finally {
      await c.end().catch(() => {});
    }
  }

  // (c) in_app_notifications — cross-tenant INSERT, then own-tenant INSERT.
  {
    const c = await openAppUser();
    try {
      await c.query('BEGIN');
      await c.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [A.id]);
      out['in_app_notifications.insert-cross@guc-A'] = await probe(
        c,
        `INSERT INTO in_app_notifications (org_id, user_id, type, title, message, entity_type, entity_id)
         VALUES ($1, $2, 'compliance_alert'::"InAppNotificationType",
                 'RLS597 cross', 'RLS597 cross', 'RLS597_entity', gen_random_uuid())`,
        [B.id, B.ownerUserId]
      );
      // The counter-assertion. Without it the rejection above passes by saying nothing.
      out['in_app_notifications.insert-own@guc-A'] = await probe(
        c,
        `INSERT INTO in_app_notifications (org_id, user_id, type, title, message, entity_type, entity_id)
         VALUES ($1, $2, 'compliance_alert'::"InAppNotificationType",
                 'RLS597 own', 'RLS597 own', 'RLS597_entity', gen_random_uuid())`,
        [A.id, A.ownerUserId]
      );
      await c.query('ROLLBACK');
    } finally {
      await c.end().catch(() => {});
    }
  }

  // (d) "Promo" UPDATE — provision-tenant.ts:97 issues this raw statement.
  {
    const c = await openAppUser();
    try {
      await c.query('BEGIN');
      out['Promo.select'] = await probe(
        c,
        `SELECT count(*)::int AS n FROM "Promo" WHERE code = $1`,
        [fixtures.promoCode]
      );
      out['Promo.update'] = await probe(
        c,
        `UPDATE "Promo" SET "redemptionCount" = "redemptionCount" + 1 WHERE code = $1`,
        [fixtures.promoCode]
      );
      await c.query('ROLLBACK');
    } finally {
      await c.end().catch(() => {});
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

function renderMd(r: Report): string {
  const L: string[] = [];
  L.push(`# quick-597 — RLS policy verification matrix (${r.phase.toUpperCase()})`);
  L.push('');
  L.push(`- Captured: ${r.capturedAt}`);
  L.push(`- Project: staging \`${r.projectRef}\` (production \`${PRODUCTION_REF}\` was never connected to)`);
  L.push(`- Role: \`${r.connection.appUserRole}\`, \`rolbypassrls = ${r.connection.appUserBypassRls}\``);
  L.push(
    `- \`app.current_tenant_id\` on a brand-new connection: ${
      r.connection.gucOnFreshConnection === null
        ? '`NULL` (genuinely unset — no pool bleed)'
        : `\`'${r.connection.gucOnFreshConnection}'\``
    }`
  );
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
  if (r.policies.length === 0) L.push('_(no policies on the target tables)_\n');

  L.push('## 2. `current_tenant_id()`');
  L.push('');
  L.push('```sql');
  L.push(r.currentTenantIdDefinition);
  L.push('```');
  L.push('');

  L.push('## 3. Read matrix — as `app_user`, fresh connection per GUC case');
  L.push('');
  L.push('Columns are row counts restricted to the seeded fixture ids, except `all` which is');
  L.push('`SELECT count(*)` over the whole table.');
  L.push('');
  L.push('What each case ACTUALLY observed for `app.current_tenant_id` — measured, because');
  L.push('`STAGING_DATABASE_URL_APP_USER` is a Supavisor TRANSACTION-mode pooler string and a');
  L.push('fresh client is not a fresh backend (quick-413 pool leak):');
  L.push('');
  L.push('| case | at connect | after set_config |');
  L.push('| --- | --- | --- |');
  for (const g of GUC_CASES) {
    const o = r.observedGuc[g];
    const fmt = (v: string | null) => (v === null ? '`NULL`' : v === '' ? "`''`" : `\`${v}\``);
    L.push(`| ${g} | ${fmt(o.atConnect)} | ${fmt(o.afterSet)} |`);
  }
  L.push('');
  L.push('Is a genuinely-unset GUC reachable on this connection at all? Measured:');
  L.push('');
  {
    const u = r.unsetReachability;
    const fmt = (v: string | null) => (v === null ? '`NULL`' : v === '' ? "`''`" : `\`${v}\``);
    L.push(`- at connect: ${fmt(u.atConnect)}`);
    L.push(`- after \`set_config('app.current_tenant_id', NULL, false)\`: ${fmt(u.afterSetConfigNull)}`);
    L.push(`- after \`RESET "app.current_tenant_id"\`: ${fmt(u.afterReset)}`);
    L.push('');
    if (u.atConnect === '' && u.afterSetConfigNull === '' && u.afterReset === '') {
      L.push(
        '**No.** Once the placeholder GUC has been set on a backend its reset value is `\'\'`, so the'
      );
      L.push(
        "`unset` row above is in practice a second reading of the `''` case. That is the"
      );
      L.push(
        "production-realistic one either way — `prisma.ts:71` writes `''` on every new physical"
      );
      L.push('connection.');
      L.push('');
    }
  }
  L.push('| table | GUC | A rows | B rows | all |');
  L.push('| --- | --- | --- | --- | --- |');
  for (const t of TARGETS) {
    for (const g of GUC_CASES) {
      const cell = r.readMatrix[t.key][g];
      const label = g === 'empty' ? `''` : g === 'unset' ? 'unset' : g;
      L.push(
        `| \`${t.key}\` | ${label} | ${fmtProbe(cell.tenantARows)} | ${fmtProbe(
          cell.tenantBRows
        )} | ${fmtProbe(cell.totalVisible)} |`
      );
    }
  }
  L.push('');

  L.push('## 4. Write probes — every one inside `BEGIN … ROLLBACK`');
  L.push('');
  L.push('| probe | result |');
  L.push('| --- | --- |');
  for (const [k, v] of Object.entries(r.writeProbes)) {
    L.push(`| \`${k}\` | ${fmtProbe(v)} |`);
  }
  L.push('');

  L.push('## 5. `bypass_rls_policy` inventory');
  L.push('');
  L.push(`${r.bypassPolicies.length} rows:`);
  L.push('');
  L.push('```');
  L.push(r.bypassPolicies.map((b) => b.tablename).join('\n'));
  L.push('```');
  L.push('');

  L.push('## 6. Fixture row counts (from `evidence/fixture-ids.json`)');
  L.push('');
  L.push('| table | A | B |');
  L.push('| --- | --- | --- |');
  for (const [k, v] of Object.entries(r.fixtureCounts)) {
    L.push(`| \`${k}\` | ${v.A} | ${v.B} |`);
  }
  L.push('');

  return L.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * `--diff` — render evidence/diff.md straight out of before.json and after.json.
 *
 * Deliberately NOT hand-written. The claims this task makes are all of the form
 * "N before, M after"; typing those into prose is exactly where a weakened
 * assertion would get in unnoticed. This reads both artefacts and prints what they
 * say, including the rows where nothing changed.
 */
function runDiff(): void {
  const read = (p: string): Report =>
    JSON.parse(readFileSync(resolve(EVIDENCE_DIR, p), 'utf8')) as Report;
  const b = read('before.json');
  const a = read('after.json');

  const L: string[] = [];
  L.push('# quick-597 — BEFORE → AFTER, as `app_user` against staging');
  L.push('');
  L.push(`Generated from \`before.json\` (${b.capturedAt}) and \`after.json\` (${a.capturedAt}) by`);
  L.push('`597-policy-verify.ts --diff`. Nothing here is typed by hand.');
  L.push('');
  L.push(`- \`pg_policy\` total: **${b.totalPolicyCount} -> ${a.totalPolicyCount}**`);
  L.push(
    `- \`bypass_rls_policy\`: **${b.bypassPolicies.length} -> ${a.bypassPolicies.length}** ` +
      `(identical table set: ${
        JSON.stringify(b.bypassPolicies.map((x) => x.tablename).sort()) ===
        JSON.stringify(a.bypassPolicies.map((x) => x.tablename).sort())
          ? 'YES'
          : 'NO'
      })`
  );
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

  L.push('## Read matrix');
  L.push('');
  L.push('| table | GUC | A rows before -> after | B rows before -> after | all before -> after |');
  L.push('| --- | --- | --- | --- | --- |');
  for (const t of TARGETS) {
    for (const g of GUC_CASES) {
      const cb = b.readMatrix[t.key]?.[g];
      const ca = a.readMatrix[t.key]?.[g];
      if (!cb || !ca) continue;
      const label = g === 'empty' ? `''` : g;
      L.push(
        `| \`${t.key}\` | ${label} | ${fmtProbe(cb.tenantARows)} -> ${fmtProbe(ca.tenantARows)} | ` +
          `${fmtProbe(cb.tenantBRows)} -> ${fmtProbe(ca.tenantBRows)} | ` +
          `${fmtProbe(cb.totalVisible)} -> ${fmtProbe(ca.totalVisible)} |`
      );
    }
  }
  L.push('');

  L.push('## Write probes');
  L.push('');
  L.push('| probe | before | after |');
  L.push('| --- | --- | --- |');
  for (const k of Object.keys({ ...b.writeProbes, ...a.writeProbes })) {
    const pb = b.writeProbes[k];
    const pa = a.writeProbes[k];
    L.push(`| \`${k}\` | ${pb ? fmtProbe(pb) : '—'} | ${pa ? fmtProbe(pa) : '—'} |`);
  }
  L.push('');

  const outPath = resolve(EVIDENCE_DIR, 'diff.md');
  writeFileSync(outPath, L.join('\n') + '\n', 'utf8');
  console.log(`Wrote ${outPath}`);
}

async function main(): Promise<void> {
  if (DIFF_MODE) {
    runDiff();
    return;
  }

  console.log(`597-policy-verify — phase=${PHASE}, project=${STAGING_REF}`);

  const snap = await snapshot();
  console.log(`  policies on target tables: ${snap.policies.length}`);
  console.log(`  total pg_policy rows:      ${snap.totalPolicyCount}`);
  console.log(`  bypass_rls_policy rows:    ${snap.bypassPolicies.length}`);

  const reach = await unsetReachability();
  console.log(
    `  unset reachability: atConnect=${JSON.stringify(reach.atConnect)} ` +
      `afterReset=${JSON.stringify(reach.afterReset)}`
  );

  const { matrix, connection, observedGuc } = await readMatrix();
  console.log(`  read matrix captured as role "${connection.appUserRole}"`);

  const writes = await writeProbes();
  console.log(`  ${Object.keys(writes).length} write probes captured`);

  const fixtureCounts: Report['fixtureCounts'] = {};
  for (const [k, v] of Object.entries(fixtures.rows)) {
    fixtureCounts[k] = { A: v.A.length, B: v.B.length };
  }

  const report: Report = {
    phase: PHASE as 'before' | 'after',
    capturedAt: new Date().toISOString(),
    projectRef: STAGING_REF,
    connection,
    currentTenantIdDefinition: snap.currentTenantIdDefinition,
    policies: snap.policies,
    totalPolicyCount: snap.totalPolicyCount,
    bypassPolicies: snap.bypassPolicies,
    readMatrix: matrix,
    observedGuc,
    unsetReachability: reach,
    writeProbes: writes,
    fixtureCounts,
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
  console.error('597-policy-verify FAILED:', e);
  process.exit(1);
});
