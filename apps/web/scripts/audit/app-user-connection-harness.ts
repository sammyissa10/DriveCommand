import '../_bootstrap-env';

import { Client } from 'pg';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import {
  ALL_PREDICTED_TABLES,
  CONTROL_TABLE,
  PREDICTED_CLASS_A,
  PREDICTED_CLASS_B,
  PREDICTED_CLASS_C,
  TRANSACTION_ROOT_TABLES,
  TRANSACTION_ROOTS,
} from './app-user-harness-targets';

/**
 * app-user-connection-harness.ts
 *
 * Read-only diagnostic that connects to the database AS the `app_user` role
 * and MEASURES what that role can actually see and do. quick-582 predicted
 * grant/RLS/policy gaps from the catalogue through a BYPASSRLS connection;
 * quick-588 predicted that its five converted transactions fail closed under
 * `app_user`. Neither of those was ever exercised as `app_user`. This file
 * is the instrument that settles it.
 *
 * FOUR GROUND RULES, stated once here and referred to throughout:
 *   1. READ-ONLY against production, except where explicitly noted in rule 2.
 *   2. DML runs ONLY inside BEGIN/ROLLBACK and nothing in this file ever
 *      commits. There is no commit statement anywhere below — grep for it
 *      (lowercase deliberately, so this sentence does not trip its own check).
 *   3. A permission error is reported IN FULL — SQLSTATE and message — and is
 *      never swallowed into a null, an empty array, or a caught-and-ignored
 *      branch.
 *   4. This is a REPORT for suites 2-5: every probe records what actually
 *      happened, never a pass/fail judgement. Suite 6 (cross-tenant
 *      isolation) is the ONE exception — it is pass/fail, and a leak sets a
 *      non-zero exit code.
 *
 * Run from apps/web/:
 *   npm run audit:app-user-harness
 *
 * Exit 0 = ran clean (or "not configured", when no credential is present).
 * Exit 1 = credential/setup problem, OR a real cross-tenant leak was found.
 */

// ---------------------------------------------------------------------------
// Result shapes — every probe returns one of these. `error` and `skipped`
// both carry a reason; neither is ever silently dropped.
// ---------------------------------------------------------------------------

type ReadProbeResult =
  | { kind: 'rows'; count: number }
  | { kind: 'empty' }
  | { kind: 'error'; code: string; message: string };

type WriteProbeResult =
  | { kind: 'rows'; count: number }
  | { kind: 'empty' }
  | { kind: 'error'; code: string; message: string }
  | { kind: 'skipped'; reason: string };

// ---------------------------------------------------------------------------
// Small print helpers
// ---------------------------------------------------------------------------

function section(title: string): void {
  console.log('');
  console.log('='.repeat(78));
  console.log(title);
  console.log('='.repeat(78));
}

function loudBanner(lines: string[]): void {
  console.log('');
  console.log('!'.repeat(78));
  for (const l of lines) console.log('!! ' + l);
  console.log('!'.repeat(78));
}

function fmtReadResult(r: ReadProbeResult): string {
  if (r.kind === 'rows') return `rows (count=${r.count})`;
  if (r.kind === 'empty') return 'empty (0 rows, no error)';
  return `ERROR [${r.code}] ${r.message}`;
}

function fmtWriteResult(r: WriteProbeResult): string {
  if (r.kind === 'skipped') return `SKIPPED — ${r.reason}`;
  if (r.kind === 'rows') return `succeeded (rows=${r.count})`;
  if (r.kind === 'empty') return 'succeeded (0 rows affected)';
  return `ERROR [${r.code}] ${r.message}`;
}

// Local identifier quoting. Every name this harness quotes comes from
// pg_class.relname / information_schema.columns.column_name — i.e. names the
// live catalogue already told us exist — never from user input, so a plain
// double-quote escape is sufficient and avoids a round trip per identifier.
// (The plan permits either `quote_ident` server-side or a parameterised
// local quote of the catalogue-resolved name; this is the second form.)
function q(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"';
}

// ---------------------------------------------------------------------------
// Credential gate
// ---------------------------------------------------------------------------

const APP_USER_URL = process.env.DATABASE_URL_APP_USER;
const ADMIN_URL = process.env.DATABASE_URL;

function printNotConfiguredAndExit(): never {
  console.log('');
  console.log('app-user-connection-harness: NOT CONFIGURED');
  console.log('');
  console.log('DATABASE_URL_APP_USER is not set. This harness refuses to run without it —');
  console.log('it prints no results and writes no report file.');
  console.log('');
  console.log('What is needed:');
  console.log('  Variable : DATABASE_URL_APP_USER');
  console.log('  File     : apps/web/.env.local');
  console.log('');
  console.log('The `app_user` Postgres role already exists and is correctly postured');
  console.log('(rolcanlogin=true, rolbypassrls=false, rolsuper=false, no memberships) —');
  console.log('only its PASSWORD is missing. Do not create the role. Do not fabricate a');
  console.log('credential here; issue the password out of band and set one of the two');
  console.log('connection-string forms below.');
  console.log('');
  console.log('  Session Pooler (port 6543 — what the deployed app actually uses):');
  console.log('    postgresql://app_user.[ref]:[pass]@aws-1-[region].pooler.supabase.com:6543/postgres');
  console.log('    NOTE: Supavisor requires the "<role>.<project_ref>" username form.');
  console.log('    A bare "app_user" username FAILS AUTHENTICATION on the pooler.');
  console.log('');
  console.log('  Direct connection (port 5432 — reachable from a developer machine):');
  console.log('    postgresql://app_user:[pass]@db.[ref].supabase.co:5432/postgres');
  console.log('    NOTE: the direct form uses the BARE role name, no project-ref suffix.');
  console.log('');
  console.log('Port-reachability caveat: port 6543 (the Session Pooler) is generally NOT');
  console.log('reachable from a developer machine — see _bootstrap-env.ts, which repoints');
  console.log('DATABASE_URL at DIRECT_URL (5432) for exactly this reason. A harness run');
  console.log('through 5432 direct does not reproduce pooler connection reuse, which is');
  console.log('the mechanism behind the explicit-GUC-clear requirement below (fact 7).');
  console.log('That is reported as a fidelity caveat every time a real run connects on a');
  console.log('port other than 6543 — see the connection fidelity section.');
  console.log('');
  process.exit(1);
}

if (!APP_USER_URL) {
  printNotConfiguredAndExit();
}
if (!ADMIN_URL) {
  console.log('');
  console.log('app-user-connection-harness: NOT CONFIGURED');
  console.log('');
  console.log('DATABASE_URL (the privileged connection) is required for catalogue');
  console.log('discovery and tenant-id lookup, and is not set. Set DATABASE_URL or');
  console.log('DIRECT_URL in apps/web/.env.local or the repo-root .env.');
  console.log('');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// The GUC setter — mirrors getTenantPrisma()/getTenantPrismaForOrg() EXACTLY.
// ---------------------------------------------------------------------------

/**
 * Session scope (`false`) mirrors `getTenantPrisma()`/`getTenantPrismaForOrg()`
 * in src/lib/context/tenant-context.ts verbatim — a single autocommit
 * `set_config` on the bare client, not inside a `$transaction`. The
 * transaction-scope (`TRUE`) variant in `tenantRawQuery` is for raw queries
 * only and is not what the app's model queries use; mirroring `TRUE` here
 * would test something the app does not do.
 *
 * The explicit `''` clear (rather than just never setting it) exists because
 * the Session Pooler does NOT run DISCARD ALL between client sessions (see
 * verify-app-user-role.ts's header) — a fresh `new Client()` can inherit a
 * stale GUC left by a previous session on the same pooled backend. Clearing
 * to `''` reproduces what a real request does at the top of
 * `getTenantPrisma()` when there is no tenant context.
 */
async function setTenantGuc(client: Client, tenantId: string | null): Promise<void> {
  await client.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [tenantId ?? '']);
}

// ---------------------------------------------------------------------------
// probeRead — the ONE read primitive. Never swallows an error.
// ---------------------------------------------------------------------------

async function probeRead(client: Client, physicalTable: string): Promise<ReadProbeResult> {
  try {
    const { rows } = await client.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM ${q(physicalTable)}`,
    );
    const count = parseInt(rows[0].c, 10);
    return count > 0 ? { kind: 'rows', count } : { kind: 'empty' };
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    return {
      kind: 'error',
      code: e.code ?? 'UNKNOWN',
      message: e.message ?? String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// withRollback — the ONLY place in this file that issues DML.
//
// Nothing here commits. There is no commit statement anywhere in this file.
// Every write is discarded.
// ---------------------------------------------------------------------------

async function withRollback(
  client: Client,
  fn: () => Promise<WriteProbeResult>,
): Promise<WriteProbeResult> {
  await client.query('BEGIN');
  try {
    // In-transaction guard. In autocommit, transaction_timestamp() (`now()`)
    // and statement_timestamp() are equal at query time. Inside a real
    // multi-statement transaction block, now() is pinned to the transaction
    // start while statement_timestamp() advances with each statement, so
    // `now() < statement_timestamp()` reads true once at least one prior
    // statement (the BEGIN itself) has actually opened a block. If this is
    // ever false, refuse to write.
    // Two SEPARATE awaited queries, deliberately — node-postgres's handling
    // of a single multi-statement string via the simple query protocol is
    // not something to depend on for a safety guard. The no-op SELECT 1
    // is the "at least one prior statement inside the block" half of the
    // reasoning above; the timestamp comparison is the actual assertion.
    await client.query('SELECT 1');
    const { rows } = await client.query<{ in_tx: boolean }>(
      `SELECT now() < statement_timestamp() AS in_tx`,
    );
    const inTx = rows[0]?.in_tx === true;
    if (!inTx) {
      return { kind: 'skipped', reason: 'could not confirm transaction block — refused to write' };
    }
    return await fn();
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    return { kind: 'error', code: e.code ?? 'UNKNOWN', message: e.message ?? String(err) };
  } finally {
    // Runs on both the success and the error path. This is the only ROLLBACK
    // in the file, and it is unconditional.
    await client.query('ROLLBACK').catch(() => {
      /* best-effort: if there is truly no transaction open, ROLLBACK itself
         errors "no such transaction" — that is not a fresh failure to report,
         the write attempt above already recorded whatever happened. */
    });
  }
}

// ---------------------------------------------------------------------------
// Runtime discovery (task 1(e)) — resolves every table we care about by
// pg_class.oid, never by casting a string to regclass, and never trusts
// quick-582's lists as anything but a comparison column.
// ---------------------------------------------------------------------------

interface DiscoveredTable {
  oid: number;
  relname: string;
  relrowsecurity: boolean;
  relforcerowsecurity: boolean;
  policyCount: number;
  grants: { select: boolean; insert: boolean; update: boolean; delete: boolean };
  tenantColumn: string | null; // null => NOT_ISOLATION_TESTABLE
}

const TENANT_COLUMN_CANDIDATES = ['tenantId', 'tenant_id', 'orgId', 'org_id'];

async function discoverTables(
  adminClient: Client,
  names: readonly string[],
): Promise<Map<string, DiscoveredTable>> {
  const uniqueNames = Array.from(new Set(names));

  const { rows } = await adminClient.query<{
    oid: number;
    relname: string;
    relrowsecurity: boolean;
    relforcerowsecurity: boolean;
    policy_count: string;
    has_select: boolean;
    has_insert: boolean;
    has_update: boolean;
    has_delete: boolean;
  }>(
    `
    SELECT
      c.oid::int                                                            AS oid,
      c.relname                                                             AS relname,
      c.relrowsecurity                                                      AS relrowsecurity,
      c.relforcerowsecurity                                                 AS relforcerowsecurity,
      (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid)::text     AS policy_count,
      has_table_privilege('app_user', c.oid, 'SELECT')                     AS has_select,
      has_table_privilege('app_user', c.oid, 'INSERT')                     AS has_insert,
      has_table_privilege('app_user', c.oid, 'UPDATE')                     AS has_update,
      has_table_privilege('app_user', c.oid, 'DELETE')                     AS has_delete
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relname = ANY($1::text[])
    `,
    [uniqueNames],
  );

  const { rows: colRows } = await adminClient.query<{
    table_name: string;
    column_name: string;
  }>(
    `
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ANY($1::text[])
      AND column_name = ANY($2::text[])
    `,
    [uniqueNames, TENANT_COLUMN_CANDIDATES],
  );

  const tenantColByTable = new Map<string, string>();
  for (const r of colRows) {
    if (tenantColByTable.has(r.table_name)) continue;
    // Prefer in candidate-list order (tenantId, tenant_id, orgId, org_id).
    const existing = tenantColByTable.get(r.table_name);
    const candidateRank = (c: string) => TENANT_COLUMN_CANDIDATES.indexOf(c);
    if (!existing || candidateRank(r.column_name) < candidateRank(existing)) {
      tenantColByTable.set(r.table_name, r.column_name);
    }
  }

  const result = new Map<string, DiscoveredTable>();
  const found = new Set(rows.map((r) => r.relname));
  for (const name of uniqueNames) {
    if (!found.has(name)) {
      console.log(`  [discovery] WARNING: table not found in pg_class for schema public: ${name}`);
      continue;
    }
  }
  for (const r of rows) {
    result.set(r.relname, {
      oid: r.oid,
      relname: r.relname,
      relrowsecurity: r.relrowsecurity,
      relforcerowsecurity: r.relforcerowsecurity,
      policyCount: parseInt(r.policy_count, 10),
      grants: {
        select: r.has_select,
        insert: r.has_insert,
        update: r.has_update,
        delete: r.has_delete,
      },
      tenantColumn: tenantColByTable.get(r.relname) ?? null,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Write-probe row construction (suite 3, probes 4 & 5).
//
// Never guesses a DB-checked value. A NOT NULL column with no default is
// satisfied by, in order: (a) a real foreign-key row (preferring one scoped
// to tenant A, discovered live — never invented), (b) a CHECK constraint's
// enumerated legal value, parsed from `pg_get_constraintdef` — never
// hardcoded from memory, because CLAUDE.md itself documents these constraints
// drifting from the app's assumed vocabulary, (c) an arbitrary value for an
// otherwise-unconstrained scalar column (text/int/bool/timestamp — supplying
// *some* value to a NOT NULL column with no further constraint is not a
// guess about legality, there is no legality question). Anything else —
// a NOT NULL uuid with no FK, no default, no CHECK, or an unhandled type —
// is refused and reported as a specific, named reason.
// ---------------------------------------------------------------------------

interface RequiredColumn {
  name: string;
  dataType: string;
  udtName: string;
  refTable?: string;
  refColumn?: string;
}

async function getRequiredColumns(
  adminClient: Client,
  tableName: string,
): Promise<RequiredColumn[]> {
  const { rows } = await adminClient.query<{
    column_name: string;
    data_type: string;
    udt_name: string;
  }>(
    `
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
      AND is_nullable = 'NO' AND column_default IS NULL
    ORDER BY ordinal_position
    `,
    [tableName],
  );

  const { rows: fkRows } = await adminClient.query<{
    column_name: string;
    ref_table: string;
    ref_column: string;
  }>(
    `
    SELECT kcu.column_name AS column_name, ccu.table_name AS ref_table, ccu.column_name AS ref_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public' AND tc.table_name = $1
    `,
    [tableName],
  );
  const fkMap = new Map(fkRows.map((r) => [r.column_name, r]));

  return rows.map((r) => ({
    name: r.column_name,
    dataType: r.data_type,
    udtName: r.udt_name,
    refTable: fkMap.get(r.column_name)?.ref_table,
    refColumn: fkMap.get(r.column_name)?.ref_column,
  }));
}

async function getCheckEnumValues(
  adminClient: Client,
  oid: number,
  columnName: string,
): Promise<string[] | null> {
  const { rows } = await adminClient.query<{ def: string }>(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = $1 AND contype = 'c'`,
    [oid],
  );
  const pattern = new RegExp(
    `\\(?${columnName}\\)?\\s*=\\s*ANY\\s*\\(ARRAY\\[(.*?)\\]\\)`,
    'i',
  );
  for (const { def } of rows) {
    const m = def.match(pattern);
    if (m) {
      const items = m[1]
        .split(',')
        .map((s) => s.trim().replace(/::\w+(\[\])?$/, '').replace(/^'(.*)'$/, '$1'))
        .filter((s) => s.length > 0);
      if (items.length > 0) return items;
    }
  }
  return null;
}

async function findRealForeignRowId(
  adminClient: Client,
  refTable: string,
  refColumn: string,
  tenantAId: string | null,
): Promise<{ value: string; scopedToTenantA: boolean } | null> {
  // Prefer a row scoped to tenant A, discovered live from the ref table's own
  // tenant column (if it has one) — never fabricated.
  if (tenantAId) {
    const { rows: tcRows } = await adminClient.query<{ column_name: string }>(
      `
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = ANY($2::text[])
      ORDER BY array_position($2::text[], column_name)
      LIMIT 1
      `,
      [refTable, TENANT_COLUMN_CANDIDATES],
    );
    const tenantCol = tcRows[0]?.column_name;
    if (tenantCol) {
      const { rows } = await adminClient.query<{ v: string }>(
        `SELECT ${q(refColumn)} AS v FROM ${q(refTable)} WHERE ${q(tenantCol)} = $1 LIMIT 1`,
        [tenantAId],
      );
      if (rows[0]?.v) return { value: rows[0].v, scopedToTenantA: true };
    }
  }
  const { rows } = await adminClient.query<{ v: string }>(
    `SELECT ${q(refColumn)} AS v FROM ${q(refTable)} LIMIT 1`,
  );
  if (rows[0]?.v) return { value: rows[0].v, scopedToTenantA: false };
  return null;
}

async function buildMinimalRow(
  adminClient: Client,
  oid: number,
  tableName: string,
  tenantAId: string | null,
): Promise<{ ok: true; row: Record<string, unknown> } | { ok: false; reasons: string[] }> {
  const cols = await getRequiredColumns(adminClient, tableName);
  const row: Record<string, unknown> = {};
  const reasons: string[] = [];

  for (const col of cols) {
    if (col.refTable && col.refColumn) {
      const found = await findRealForeignRowId(adminClient, col.refTable, col.refColumn, tenantAId);
      if (!found) {
        reasons.push(`no row found in ${col.refTable} to satisfy FK column ${col.name}`);
        continue;
      }
      row[col.name] = found.value;
      continue;
    }

    const enumVals = await getCheckEnumValues(adminClient, oid, col.name);
    if (enumVals && enumVals.length > 0) {
      row[col.name] = enumVals[0];
      continue;
    }

    if (col.udtName === 'uuid') {
      reasons.push(
        `column ${col.name} is a NOT NULL uuid with no FK, no default and no readable CHECK enum — cannot construct a value without guessing`,
      );
      continue;
    }
    if (['text', 'character varying', 'varchar'].includes(col.dataType)) {
      row[col.name] = `audit-probe-quick589-${Date.now()}`;
      continue;
    }
    if (['integer', 'smallint', 'bigint'].includes(col.dataType)) {
      row[col.name] = 900000001;
      continue;
    }
    if (col.dataType === 'boolean') {
      row[col.name] = true;
      continue;
    }
    if (col.dataType.startsWith('timestamp')) {
      row[col.name] = new Date().toISOString();
      continue;
    }
    reasons.push(`column ${col.name} has unhandled type ${col.dataType}/${col.udtName} — cannot construct a value without guessing`);
  }

  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true, row };
}

async function pickUpdatableColumn(
  adminClient: Client,
  tableName: string,
): Promise<string | null> {
  const { rows } = await adminClient.query<{ column_name: string }>(
    `
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
      AND is_nullable = 'YES'
      AND data_type IN ('text', 'character varying')
    ORDER BY ordinal_position
    LIMIT 1
    `,
    [tableName],
  );
  return rows[0]?.column_name ?? null;
}

// ---------------------------------------------------------------------------
// Report accumulation
// ---------------------------------------------------------------------------

interface ReportRow {
  table: string;
  predictedClass: string;
  predictedBehaviour: string;
  observedBehaviour: string;
  grants: string;
  rowsecurity: string;
  force: string;
  policyCount: string;
  divergence: string;
}

const reconciliationRows: ReportRow[] = [];
const divergenceNotes: string[] = [];
const couldNotBeTested: string[] = [];
let crossTenantLeakFound = false;
const leakDetails: string[] = [];

function classify(table: string): { predictedClass: string; predictedBehaviour: string } {
  if (PREDICTED_CLASS_A.includes(table) && PREDICTED_CLASS_C.includes(table)) {
    return { predictedClass: '(a)+(c)', predictedBehaviour: 'zero grants; RLS on, not forced, 0 policies' };
  }
  if (PREDICTED_CLASS_A.includes(table)) {
    return { predictedClass: '(a)', predictedBehaviour: 'zero grants -> permission denied on every op' };
  }
  if (PREDICTED_CLASS_B.includes(table)) {
    return { predictedClass: '(b)', predictedBehaviour: 'FORCE RLS, full CRUD grants, 0 policies -> reads return 0 rows silently, writes fail RLS' };
  }
  if (PREDICTED_CLASS_C.includes(table)) {
    return { predictedClass: '(c)', predictedBehaviour: 'RLS on, not forced, 0 policies, no grant -> 0 rows, no error' };
  }
  if (table === CONTROL_TABLE) {
    return { predictedClass: 'control', predictedBehaviour: 'FORCE RLS, full CRUD grants, 2 policies -> correctly gated by tenant' };
  }
  return { predictedClass: 'n/a (transaction-root table)', predictedBehaviour: 'no quick-582 prediction — observed only' };
}

function recordReconciliation(
  table: string,
  observedBehaviour: string,
  discovered: DiscoveredTable | undefined,
): void {
  const { predictedClass, predictedBehaviour } = classify(table);
  const grants = discovered
    ? `S:${discovered.grants.select ? 'Y' : 'N'} I:${discovered.grants.insert ? 'Y' : 'N'} U:${discovered.grants.update ? 'Y' : 'N'} D:${discovered.grants.delete ? 'Y' : 'N'}`
    : 'n/a — not found in pg_class';
  const rowsecurity = discovered ? String(discovered.relrowsecurity) : 'n/a';
  const force = discovered ? String(discovered.relforcerowsecurity) : 'n/a';
  const policyCount = discovered ? String(discovered.policyCount) : 'n/a';

  let divergence = '(none observed)';
  if (discovered) {
    const predictedZeroGrant = PREDICTED_CLASS_A.includes(table);
    const actualZeroGrant = !discovered.grants.select && !discovered.grants.insert && !discovered.grants.update && !discovered.grants.delete;
    const predictedForceNoPolicy = PREDICTED_CLASS_B.includes(table);
    const actualForceNoPolicy = discovered.relforcerowsecurity && discovered.policyCount === 0;

    if (predictedZeroGrant !== actualZeroGrant) {
      divergence = `DIVERGES: predicted zero-grant=${predictedZeroGrant}, observed zero-grant=${actualZeroGrant}`;
      divergenceNotes.push(`${table}: predicted zero-grant class (a) membership=${predictedZeroGrant}, live catalogue shows zero-grant=${actualZeroGrant}.`);
    } else if (predictedForceNoPolicy !== actualForceNoPolicy) {
      divergence = `DIVERGES: predicted FORCE+0-policy=${predictedForceNoPolicy}, observed=${actualForceNoPolicy}`;
      divergenceNotes.push(`${table}: predicted class (b) (FORCE RLS + 0 policies)=${predictedForceNoPolicy}, live catalogue shows=${actualForceNoPolicy}.`);
    }
  }

  reconciliationRows.push({
    table,
    predictedClass,
    predictedBehaviour,
    observedBehaviour,
    grants,
    rowsecurity,
    force,
    policyCount,
    divergence,
  });
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const runStartedAt = new Date().toISOString();
  console.log('app-user-connection-harness.ts');
  console.log(`Started: ${runStartedAt}`);

  const appClient = new Client({ connectionString: APP_USER_URL });
  const adminClient = new Client({ connectionString: ADMIN_URL });

  await appClient.connect();
  await adminClient.connect();

  // ── Connection fidelity report (task 1(c)) ──────────────────────────────
  section('CONNECTION FIDELITY');

  const parsedAppUrl = new URL(APP_USER_URL!.replace(/^postgres(ql)?:\/\//, 'http://'));
  const configuredHost = parsedAppUrl.hostname;
  const configuredPort = parsedAppUrl.port || '5432';

  const { rows: idRows } = await appClient.query<{
    current_user: string;
    addr: string | null;
    port: number | null;
  }>(`SELECT current_user, inet_server_addr()::text AS addr, inet_server_port() AS port`);
  console.log(`  Configured URL host:port : ${configuredHost}:${configuredPort}`);
  console.log(`  current_user             : ${idRows[0].current_user}`);
  console.log(`  inet_server_addr()       : ${idRows[0].addr ?? '(null — local socket)'}`);
  console.log(`  inet_server_port()       : ${idRows[0].port ?? '(null)'}`);

  if (configuredPort !== '6543') {
    loudBanner([
      'FIDELITY CAVEAT: this connection is NOT on port 6543.',
      'The deployed app runs on the Supabase Session Pooler (port 6543).',
      'The session-scope GUC deviation (set_config(..., false)) exists BECAUSE',
      'of the pooler\'s connection-reuse behaviour. A run through 5432 direct',
      'does not reproduce pooler connection reuse — treat everything below as',
      'correct about grants/RLS/policies, but NOT a full reproduction of',
      'pooler-specific GUC-bleed behaviour.',
    ]);
  }

  const { rows: roleRows } = await appClient.query<{
    rolbypassrls: boolean;
    rolsuper: boolean;
  }>(`SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user`);
  console.log(`  rolbypassrls             : ${roleRows[0].rolbypassrls}`);
  console.log(`  rolsuper                 : ${roleRows[0].rolsuper}`);
  if (roleRows[0].rolbypassrls) {
    loudBanner([
      `current_user (${idRows[0].current_user}) has rolbypassrls = true.`,
      'This harness is not testing what it claims to test. Refusing to continue.',
    ]);
    await appClient.end();
    await adminClient.end();
    process.exit(1);
  }

  // ── Suite 1(e): runtime discovery ───────────────────────────────────────
  section('RUNTIME DISCOVERY (catalogue, via adminClient — bypasses RLS by design)');
  const allNames = Array.from(new Set([...ALL_PREDICTED_TABLES, ...TRANSACTION_ROOT_TABLES]));
  const discovered = await discoverTables(adminClient, allNames);
  for (const name of allNames) {
    const d = discovered.get(name);
    if (!d) {
      console.log(`  ${name}: NOT FOUND in pg_class (public schema)`);
      couldNotBeTested.push(`${name}: not found in pg_class — cannot be probed`);
      continue;
    }
    console.log(
      `  ${name.padEnd(28)} rls=${String(d.relrowsecurity).padEnd(5)} force=${String(d.relforcerowsecurity).padEnd(5)} policies=${String(d.policyCount).padEnd(3)} ` +
        `S:${d.grants.select ? 'Y' : 'N'} I:${d.grants.insert ? 'Y' : 'N'} U:${d.grants.update ? 'Y' : 'N'} D:${d.grants.delete ? 'Y' : 'N'} ` +
        `tenantCol=${d.tenantColumn ?? 'NOT_ISOLATION_TESTABLE'}`,
    );
    if (!d.tenantColumn) {
      couldNotBeTested.push(`${name}: no tenantId/tenant_id/orgId/org_id column found — NOT_ISOLATION_TESTABLE for suite 6`);
    }
  }

  // ── Suite 2: tenant fixtures ─────────────────────────────────────────────
  section('SUITE 2 — TENANT FIXTURES');
  const { rows: tenantRows } = await adminClient.query<{ id: string }>(
    `SELECT id FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 2`,
  );
  let tenantA: string | null = null;
  let tenantB: string | null = null;
  if (tenantRows.length >= 2) {
    tenantA = tenantRows[0].id;
    tenantB = tenantRows[1].id;
    console.log(`  Tenant A: ${tenantA}`);
    console.log(`  Tenant B: ${tenantB}`);
  } else if (tenantRows.length === 1) {
    tenantA = tenantRows[0].id;
    console.log(`  Only one tenant exists (${tenantA}) — cross-tenant probes will be skipped.`);
    couldNotBeTested.push('Cross-tenant probes: fewer than two tenants exist in the database');
  } else {
    console.log('  No tenants exist — cross-tenant probes will be skipped.');
    couldNotBeTested.push('Cross-tenant probes: zero tenants exist in the database');
  }

  // ── Suite 3: class (b) targets + control ────────────────────────────────
  section('SUITE 3 — CLASS (b) TARGETS + CONTROL (facilities)');
  const suite3Tables = [...PREDICTED_CLASS_B, CONTROL_TABLE];
  for (const table of suite3Tables) {
    console.log(`\n  --- ${table} ---`);
    const d = discovered.get(table);
    if (!d) {
      console.log(`    table not found in catalogue — skipping all 5 probes`);
      couldNotBeTested.push(`${table}: not found in pg_class — all suite 3 probes skipped`);
      recordReconciliation(table, 'NOT FOUND in catalogue', d);
      continue;
    }

    await setTenantGuc(appClient, tenantA);
    const readA = await probeRead(appClient, table);
    console.log(`    1. read, GUC=tenantA          : ${fmtReadResult(readA)}`);

    let readB: ReadProbeResult | null = null;
    if (tenantB) {
      await setTenantGuc(appClient, tenantB);
      readB = await probeRead(appClient, table);
      console.log(`    2. read, GUC=tenantB          : ${fmtReadResult(readB)}`);
    } else {
      console.log(`    2. read, GUC=tenantB          : SKIPPED — fewer than two tenants`);
    }

    await setTenantGuc(appClient, null);
    const readCleared = await probeRead(appClient, table);
    console.log(`    3. read, GUC cleared ('')     : ${fmtReadResult(readCleared)}`);

    // Reset to tenant A before attempting writes, matching what a real
    // request scoped to tenant A would do.
    await setTenantGuc(appClient, tenantA);

    const oid = d.oid;
    const built = await buildMinimalRow(adminClient, oid, table, tenantA);
    let insertResult: WriteProbeResult;
    let insertedRowForUpdateTest: Record<string, unknown> | null = null;
    if (!built.ok) {
      insertResult = { kind: 'skipped', reason: built.reasons.join('; ') };
    } else {
      const cols = Object.keys(built.row);
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      const sql = `INSERT INTO ${q(table)} (${cols.map(q).join(', ')}) VALUES (${placeholders}) RETURNING *`;
      const values = cols.map((c) => built.row[c]);
      insertResult = await withRollback(appClient, async () => {
        const { rows } = await appClient.query(sql, values);
        insertedRowForUpdateTest = rows[0] ?? null;
        return { kind: 'rows', count: rows.length };
      });
    }
    console.log(`    4. INSERT (rolled back)       : ${fmtWriteResult(insertResult)}`);

    const updateCol = await pickUpdatableColumn(adminClient, table);
    let updateResult: WriteProbeResult;
    if (!updateCol) {
      updateResult = { kind: 'skipped', reason: 'no nullable text/varchar column found to safely target with UPDATE' };
    } else {
      // An UPDATE that matches zero rows is a perfectly good probe — what is
      // measured is whether the statement is PERMITTED, not whether it
      // changed anything. WHERE id = a fresh random uuid guarantees zero
      // matches without needing a legal full row.
      updateResult = await withRollback(appClient, async () => {
        const sql = `UPDATE ${q(table)} SET ${q(updateCol)} = $1 WHERE id = gen_random_uuid()`;
        const res = await appClient.query(sql, ['audit-probe-quick589']);
        return res.rowCount && res.rowCount > 0 ? { kind: 'rows', count: res.rowCount } : { kind: 'empty' };
      });
    }
    console.log(`    5. UPDATE (rolled back, 0-row WHERE) : ${fmtWriteResult(updateResult)}`);

    const observed = `read(A)=${fmtReadResult(readA)}; read(B)=${readB ? fmtReadResult(readB) : 'skipped'}; read(cleared)=${fmtReadResult(readCleared)}; insert=${fmtWriteResult(insertResult)}; update=${fmtWriteResult(updateResult)}`;
    recordReconciliation(table, observed, d);
  }

  // ── Suite 4: all 12 defect-class tables ─────────────────────────────────
  section('SUITE 4 — ALL 12 DEFECT-CLASS TABLES (class a + b + c)');
  const suite4Tables = Array.from(new Set([...PREDICTED_CLASS_A, ...PREDICTED_CLASS_B, ...PREDICTED_CLASS_C]));
  await setTenantGuc(appClient, tenantA);
  for (const table of suite4Tables) {
    const d = discovered.get(table);
    if (suite3Tables.includes(table)) {
      // Already fully probed and recorded in suite 3; do not double-record,
      // but still print for continuity of this suite's section.
      console.log(`  ${table}: (see suite 3 above — already probed)`);
      continue;
    }
    if (!d) {
      console.log(`  ${table}: NOT FOUND in catalogue`);
      couldNotBeTested.push(`${table}: not found in pg_class — suite 4 read skipped`);
      recordReconciliation(table, 'NOT FOUND in catalogue', d);
      continue;
    }
    const r = await probeRead(appClient, table);
    console.log(
      `  ${table.padEnd(28)} read(GUC=A)=${fmtReadResult(r).padEnd(40)} ` +
        `[rls=${d.relrowsecurity} force=${d.relforcerowsecurity} policies=${d.policyCount} ` +
        `S:${d.grants.select ? 'Y' : 'N'} I:${d.grants.insert ? 'Y' : 'N'} U:${d.grants.update ? 'Y' : 'N'} D:${d.grants.delete ? 'Y' : 'N'}]`,
    );
    recordReconciliation(table, `read(GUC=A)=${fmtReadResult(r)}`, d);
  }

  // ── Suite 5: the six quick-588 transaction roots ────────────────────────
  section('SUITE 5 — SIX QUICK-588 TRANSACTION ROOTS');
  console.log(
    '  These are the paths quick-588 predicted NOT to fail closed. Every model they',
  );
  console.log(
    '  touch is in EXEMPT_MODELS, so the tenant-RLS Prisma extension injects nothing —',
  );
  console.log(
    '  isolation here rests ENTIRELY on DB-level grants/policies plus the session GUC.',
  );
  console.log(
    '  A nested stops/carrier_documents count of zero beside a non-zero anchor count is',
  );
  console.log('  the class-(b) prediction coming true; it is reported, never asserted.\n');

  await setTenantGuc(appClient, tenantA);
  for (const root of TRANSACTION_ROOTS) {
    console.log(`  --- Root ${root.id}: ${root.fn} (${root.file}) ---`);
    const anchorTable = root.tables[0];
    const anchorDisc = discovered.get(anchorTable);
    const anchorTenantCol = anchorDisc?.tenantColumn;
    let anchorCount = 0;
    if (anchorTenantCol && tenantA) {
      try {
        const { rows } = await appClient.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM ${q(anchorTable)} WHERE ${q(anchorTenantCol)} = $1`,
          [tenantA],
        );
        anchorCount = parseInt(rows[0].c, 10);
        console.log(`    ${anchorTable} (anchor, WHERE ${anchorTenantCol}=tenantA): count=${anchorCount}`);
      } catch (err: unknown) {
        const e = err as { code?: string; message?: string };
        console.log(`    ${anchorTable} (anchor): ERROR [${e.code ?? 'UNKNOWN'}] ${e.message ?? String(err)}`);
        couldNotBeTested.push(`Root ${root.id} anchor ${anchorTable}: query errored — ${e.message ?? String(err)}`);
        continue;
      }
    } else {
      console.log(`    ${anchorTable} (anchor): SKIPPED — no tenant column discovered or no tenant fixture`);
      couldNotBeTested.push(`Root ${root.id} anchor ${anchorTable}: no tenant column or fixture`);
      continue;
    }

    for (const nested of root.tables.slice(1)) {
      if (nested === anchorTable) continue;
      // Resolve the nested table's FK column referencing "dispatches"
      // (every nested table in every root has one, confirmed against
      // schema.prisma — see the targets file header comment).
      const { rows: fkRows } = await adminClient.query<{ column_name: string }>(
        `
        SELECT kcu.column_name AS column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
          AND tc.table_name = $1 AND ccu.table_name = 'dispatches'
        LIMIT 1
        `,
        [nested],
      );
      const fkCol = fkRows[0]?.column_name;
      if (!fkCol) {
        console.log(`    ${nested}: SKIPPED — no FK column to dispatches found via information_schema`);
        couldNotBeTested.push(`Root ${root.id} nested ${nested}: no resolvable FK to dispatches`);
        continue;
      }
      try {
        const { rows } = await appClient.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM ${q(nested)} n JOIN ${q('dispatches')} d ON n.${q(fkCol)} = d.id WHERE d.${q(anchorTenantCol ?? 'org_id')} = $1`,
          [tenantA],
        );
        console.log(`    ${nested} (joined via ${fkCol} -> dispatches.id): count=${rows[0].c}`);
      } catch (err: unknown) {
        const e = err as { code?: string; message?: string };
        console.log(`    ${nested} (joined via ${fkCol} -> dispatches.id): ERROR [${e.code ?? 'UNKNOWN'}] ${e.message ?? String(err)}`);
      }
    }
  }

  // ── Suite 6: cross-tenant isolation — PASS/FAIL ─────────────────────────
  section('SUITE 6 — CROSS-TENANT ISOLATION (the only pass/fail suite)');
  if (!tenantA) {
    console.log('  SKIPPED — no tenant fixture available at all.');
    couldNotBeTested.push('Suite 6: no tenant fixture available');
  } else {
    for (const [table, d] of discovered) {
      if (d.policyCount === 0) continue; // no policy => not the leak this suite tests for
      if (!d.tenantColumn) {
        console.log(`  ${table}: NOT_ISOLATION_TESTABLE (has policies but no resolvable tenant column) — skipped`);
        continue;
      }
      await setTenantGuc(appClient, tenantA);
      try {
        const { rows: leakRows } = await appClient.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM ${q(table)} WHERE ${q(d.tenantColumn)} IS DISTINCT FROM $1`,
          [tenantA],
        );
        const { rows: ownRows } = await appClient.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM ${q(table)} WHERE ${q(d.tenantColumn)} = $1`,
          [tenantA],
        );
        const leaked = parseInt(leakRows[0].c, 10);
        const own = parseInt(ownRows[0].c, 10);
        console.log(`  ${table.padEnd(28)} own=${own} leaked=${leaked}`);
        if (leaked > 0) {
          crossTenantLeakFound = true;
          const msg = `${table}: ${leaked} row(s) visible under GUC=tenantA whose ${d.tenantColumn} is NOT tenantA`;
          leakDetails.push(msg);
          loudBanner([`LIVE SECURITY FINDING — CROSS-TENANT LEAK`, msg]);
        }
      } catch (err: unknown) {
        const e = err as { code?: string; message?: string };
        console.log(`  ${table.padEnd(28)} ERROR [${e.code ?? 'UNKNOWN'}] ${e.message ?? String(err)}`);
      }
    }
  }

  // ── Suite 7: reconciliation report ──────────────────────────────────────
  section('SUITE 7 — RECONCILIATION REPORT');

  const md: string[] = [];
  md.push('# app_user Connection Harness — Run Report');
  md.push('');
  md.push(`Run timestamp: ${runStartedAt}`);
  md.push(`Connected host:port (configured): ${configuredHost}:${configuredPort}`);
  md.push(`current_user: ${idRows[0].current_user}`);
  md.push(`inet_server_addr/port: ${idRows[0].addr ?? '(null)'}:${idRows[0].port ?? '(null)'}`);
  md.push(`Tenant A: ${tenantA ?? '(none)'}`);
  md.push(`Tenant B: ${tenantB ?? '(none — fewer than two tenants)'}`);
  md.push('');
  if (configuredPort !== '6543') {
    md.push('> **Fidelity caveat:** this run was NOT on port 6543 (the Session Pooler the');
    md.push('> deployed app actually uses). The session-scope GUC-clear behaviour this');
    md.push('> harness mirrors exists because of pooler connection reuse; a 5432-direct run');
    md.push('> does not reproduce that reuse. Grant/RLS/policy findings below are still valid.');
    md.push('');
  }

  md.push('## Reconciliation table');
  md.push('');
  md.push('| table | predicted class | predicted behaviour | observed behaviour | grants (S/I/U/D) | rowsecurity | force | policies | divergence |');
  md.push('|---|---|---|---|---|---|---|---|---|');
  for (const r of reconciliationRows) {
    md.push(
      `| ${r.table} | ${r.predictedClass} | ${r.predictedBehaviour} | ${r.observedBehaviour} | ${r.grants} | ${r.rowsecurity} | ${r.force} | ${r.policyCount} | ${r.divergence} |`,
    );
  }
  md.push('');

  md.push('## Divergences from quick-582');
  md.push('');
  if (divergenceNotes.length === 0) {
    md.push('None observed — live catalogue state matches every quick-582 prediction checked.');
  } else {
    for (const d of divergenceNotes) md.push(`- ${d}`);
  }
  md.push('');

  md.push('## Could not be tested');
  md.push('');
  if (couldNotBeTested.length === 0) {
    md.push('Nothing — every planned probe ran.');
  } else {
    for (const c of couldNotBeTested) md.push(`- ${c}`);
  }
  md.push('');

  md.push('## Suite 6 — cross-tenant isolation result');
  md.push('');
  if (crossTenantLeakFound) {
    md.push('**FAIL — live cross-tenant leak found:**');
    md.push('');
    for (const l of leakDetails) md.push(`- ${l}`);
  } else {
    md.push('PASS — no cross-tenant leak found among policy-bearing, isolation-testable tables.');
  }
  md.push('');

  const reportText = md.join('\n');
  console.log(reportText);

  const reportPath = resolve(__dirname, '../../../../docs/diagnostics/app-user-connection-harness.md');
  writeFileSync(reportPath, reportText, 'utf8');
  console.log(`\nReport written to: ${reportPath}`);

  await appClient.end();
  await adminClient.end();

  if (crossTenantLeakFound) {
    console.error('\napp-user-connection-harness: FAILED — cross-tenant leak found (see suite 6).');
    process.exit(1);
  }
  console.log('\napp-user-connection-harness: completed. See report above / on disk.');
}

main().catch((err: unknown) => {
  console.error('FATAL:', err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
