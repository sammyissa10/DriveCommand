import '../_bootstrap-env';

/**
 * RLS Policy Drift — runner
 *
 * WHAT THIS EXISTS TO CATCH
 * -------------------------
 * quick-584: 59 RLS policies across 13 carrier tables vanished from
 * production sometime between 2026-05-28 and 2026-08-24. The mechanism is
 * undetermined — no repository artefact (migration, script, seed, test,
 * application code path) accounts for it, and the one surface that would
 * have recorded it (`log_statement = 'ddl'`) was enabled and DID capture
 * the statements, but Supabase's log retention is ~24 hours and the loss
 * was found roughly three months later. Ten of the thirteen tables carry
 * `org_id` and were silently re-covered by a later standardization
 * migration, so the loss was invisible on those; three were left with
 * **zero** live policies (`stops`, `carrier_documents`,
 * `route_template_stops`).
 *
 * POSTGRES STORES NO POLICY CREATION TIMESTAMP. `pg_policy` has no
 * timestamp column and there is no `pg_stat_last_ddl`. Replaying the
 * repo's migrations in order and diffing the resulting expected set
 * against live `pg_policy` is therefore the ONLY available detector for
 * this class of loss — not a nice-to-have alongside a timestamp-based one.
 * See docs/diagnostics/rls-policy-drop-forensics.md §5 (the discrepancy)
 * and §6 (why the timestamp question is unanswerable).
 *
 * GUARD-RAILS — read-only:
 *   - Only SELECTs against pg_catalog (via $queryRawUnsafe).
 *   - No CREATE, ALTER, DROP, GRANT, REVOKE, INSERT, UPDATE, DELETE,
 *     TRUNCATE, no migration run — this script cannot and does not modify
 *     the database in any way.
 *   - Never prints a connection string or password.
 *   - There is no `--write-baseline`, `--ignore` or `--allow` flag. The
 *     baseline in rls-policy-baseline.json is loaded read-only; nothing in
 *     this script can write to it. Regenerating the baseline is a manual,
 *     reviewed edit — see the file's own header comment.
 *
 * Run from apps/web/:
 *   npm run audit:rls-policy-drift
 *   npm run audit:rls-policy-drift -- --json
 */

import { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import {
  parsePolicyStatements as _parsePolicyStatements, // re-exported name kept for header doc only
  replayPolicyStatements,
  diffPolicySets,
  applyBaseline,
  classifyZeroPolicyTables,
  assertCorpusIntegrity,
  CorpusIntegrityError,
  policyKey,
  type MigrationFile,
  type PolicyBaseline,
  type TableRlsRow,
} from './rls-policy-replay';

void _parsePolicyStatements; // referenced only in comments above; keep import for doc clarity

// ---------------------------------------------------------------------------
// Connection — mirror app-user-grant-audit.ts / audit-rls-gaps.ts exactly
// ---------------------------------------------------------------------------

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

interface LivePolicyRow {
  table_name: string;
  policy_name: string;
}

interface TableMetaRow {
  table_name: string;
  rls_enabled: boolean;
  rls_forced: boolean;
  policy_count: number;
}

interface RawBaselineFile {
  $comment?: string;
  reference?: string;
  recordedAt?: string;
  missing: { $why?: string; entries: string[] };
  unexpected: { $why?: string; entries: string[] };
  zeroPolicyForced: { $why?: string; entries: string[] };
  zeroPolicyEnabled: { $why?: string; entries: string[] };
}

// ---------------------------------------------------------------------------
// Exit codes
// ---------------------------------------------------------------------------

const EXIT_CLEAN = 0;
const EXIT_DRIFT = 1;
const EXIT_OPERATIONAL_FAILURE = 2;

class OperationalFailure extends Error {}

// ---------------------------------------------------------------------------
// Migration corpus (disk read — resolved relative to this file, not cwd)
// ---------------------------------------------------------------------------

function loadMigrationCorpus(): MigrationFile[] {
  const migrationsDir = join(__dirname, '../../prisma/migrations');

  let dirNames: string[];
  try {
    dirNames = readdirSync(migrationsDir);
  } catch (err) {
    throw new OperationalFailure(
      `Could not read migrations directory at ${migrationsDir}: ${(err as Error).message}`
    );
  }

  const migrationDirs = dirNames.filter((name) => {
    const full = join(migrationsDir, name);
    try {
      if (!statSync(full).isDirectory()) return false;
      statSync(join(full, 'migration.sql'));
      return true;
    } catch {
      return false;
    }
  });

  migrationDirs.sort();

  return migrationDirs.map((migration) => ({
    migration,
    sql: readFileSync(join(migrationsDir, migration, 'migration.sql'), 'utf8'),
  }));
}

// ---------------------------------------------------------------------------
// Baseline (disk read — JSON.parse, never `import`, to avoid depending on
// resolveJsonModule for something loaded at runtime, not compiled in)
// ---------------------------------------------------------------------------

function loadBaseline(): { raw: RawBaselineFile; asPolicyBaselines: { missing: PolicyBaseline['missing']; unexpected: PolicyBaseline['unexpected']; zeroPolicyForced: string[]; zeroPolicyEnabled: string[] } } {
  const baselinePath = join(__dirname, 'rls-policy-baseline.json');

  let text: string;
  try {
    text = readFileSync(baselinePath, 'utf8');
  } catch (err) {
    throw new OperationalFailure(
      `Could not read baseline file at ${baselinePath}: ${(err as Error).message}`
    );
  }

  let raw: RawBaselineFile;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new OperationalFailure(
      `Baseline file at ${baselinePath} is not valid JSON: ${(err as Error).message}`
    );
  }

  for (const key of ['missing', 'unexpected', 'zeroPolicyForced', 'zeroPolicyEnabled'] as const) {
    if (!raw[key] || !Array.isArray(raw[key].entries)) {
      throw new OperationalFailure(
        `Baseline file is malformed: expected raw.${key}.entries to be an array.`
      );
    }
  }

  return {
    raw,
    asPolicyBaselines: {
      missing: raw.missing.entries,
      unexpected: raw.unexpected.entries,
      zeroPolicyForced: raw.zeroPolicyForced.entries,
      zeroPolicyEnabled: raw.zeroPolicyEnabled.entries,
    },
  };
}

// ---------------------------------------------------------------------------
// Live queries — read-only, pg_catalog only. Joins go through pg_class.oid;
// never `::regclass` on a literal (this schema mixes PascalCase and
// snake_case table names).
// ---------------------------------------------------------------------------

async function queryLivePolicies(): Promise<LivePolicyRow[]> {
  return prisma.$queryRawUnsafe<LivePolicyRow[]>(`
    SELECT
      c.relname AS table_name,
      p.polname AS policy_name
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
    ORDER BY 1, 2
  `);
}

async function queryTableRlsMeta(): Promise<TableMetaRow[]> {
  return prisma.$queryRawUnsafe<TableMetaRow[]>(`
    SELECT
      c.relname AS table_name,
      c.relrowsecurity AS rls_enabled,
      c.relforcerowsecurity AS rls_forced,
      COUNT(p.oid)::int AS policy_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_policy p ON p.polrelid = c.oid
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    GROUP BY 1, 2, 3
    ORDER BY 1
  `);
}

// ---------------------------------------------------------------------------
// JSON summary shape
// ---------------------------------------------------------------------------

interface JsonSummary {
  generatedAt: string;
  migrationFiles: number;
  statementsParsed: number;
  expectedCount: number;
  liveCount: number;
  missing: string[];
  unexpected: string[];
  missingByTable: Record<string, { expected: number; live: number; missing: number }>;
  zeroPolicyForced: string[];
  zeroPolicyEnabled: string[];
  baseline: {
    suppressedMissing: number;
    suppressedUnexpected: number;
    staleMissing: string[];
    staleUnexpected: string[];
  };
  newMissing: string[];
  newUnexpected: string[];
  newZeroPolicyForced: string[];
  newZeroPolicyEnabled: string[];
  staleZeroPolicyForced: string[];
  staleZeroPolicyEnabled: string[];
  exitCode: number;
}

function computeMissingByTable(
  expected: Set<string>,
  live: Set<string>
): Record<string, { expected: number; live: number; missing: number }> {
  const tables = new Set<string>();
  for (const key of expected) tables.add(key.split('.')[0]);
  for (const key of live) tables.add(key.split('.')[0]);

  const result: Record<string, { expected: number; live: number; missing: number }> = {};

  for (const table of tables) {
    const expectedForTable = [...expected].filter((k) => k.startsWith(`${table}.`));
    const liveForTable = [...live].filter((k) => k.startsWith(`${table}.`));
    const missingForTable = expectedForTable.filter((k) => !live.has(k));

    if (missingForTable.length > 0) {
      result[table] = {
        expected: expectedForTable.length,
        live: liveForTable.length,
        missing: missingForTable.length,
      };
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Human-readable output
// ---------------------------------------------------------------------------

function printHumanReport(summary: JsonSummary, baselineRaw: RawBaselineFile): void {
  console.log('RLS Policy Drift — replay diff against live pg_policy');
  console.log('='.repeat(72));
  console.log('');
  console.log(`  Migration files read     : ${summary.migrationFiles}`);
  console.log(`  Statements parsed        : ${summary.statementsParsed}`);
  console.log(`  Policies expected (net)  : ${summary.expectedCount}`);
  console.log(`  Policies live            : ${summary.liveCount}`);
  console.log(`  Missing (expected−live)  : ${summary.missing.length}`);
  console.log(`  Unexpected (live−expect) : ${summary.unexpected.length}`);
  console.log('');

  if (Object.keys(summary.missingByTable).length > 0) {
    console.log('MISSING, by table (expected/live/missing):');
    for (const [table, counts] of Object.entries(summary.missingByTable)) {
      console.log(`  ${table.padEnd(28)} ${counts.expected}/${counts.live}/${counts.missing}`);
    }
    console.log('');
    console.log('MISSING policy keys:');
    for (const key of summary.missing) console.log(`  - ${key}`);
    console.log('');
  } else {
    console.log('MISSING: none.');
    console.log('');
  }

  if (summary.unexpected.length > 0) {
    console.log('UNEXPECTED (live, no migration creates it):');
    for (const key of summary.unexpected) console.log(`  - ${key}`);
    console.log('');
  } else {
    console.log('UNEXPECTED: none.');
    console.log('');
  }

  console.log('ZERO-POLICY TABLES:');
  console.log(
    `  FORCE RLS + zero policies (severe)     : ${summary.zeroPolicyForced.join(', ') || 'none'}`
  );
  console.log(
    `  RLS enabled, not forced, zero policies : ${summary.zeroPolicyEnabled.join(', ') || 'none'}`
  );
  console.log('');

  console.log('BASELINE:');
  console.log(`  Reference   : ${baselineRaw.reference ?? '(none)'}`);
  console.log(`  Recorded at : ${baselineRaw.recordedAt ?? '(none)'}`);
  console.log(`  Suppressed missing entries    : ${summary.baseline.suppressedMissing}`);
  console.log(`  Suppressed unexpected entries  : ${summary.baseline.suppressedUnexpected}`);

  const staleTotal =
    summary.baseline.staleMissing.length +
    summary.baseline.staleUnexpected.length +
    summary.staleZeroPolicyForced.length +
    summary.staleZeroPolicyEnabled.length;

  if (staleTotal > 0) {
    console.log('');
    console.log(
      '  STALE baseline entries — these are no longer actually missing/unexpected live.'
    );
    console.log('  Delete each line below from rls-policy-baseline.json:');
    for (const key of summary.baseline.staleMissing) console.log(`    - missing: ${key}`);
    for (const key of summary.baseline.staleUnexpected) console.log(`    - unexpected: ${key}`);
    for (const key of summary.staleZeroPolicyForced) console.log(`    - zeroPolicyForced: ${key}`);
    for (const key of summary.staleZeroPolicyEnabled) console.log(`    - zeroPolicyEnabled: ${key}`);
  }

  const newTotal =
    summary.newMissing.length +
    summary.newUnexpected.length +
    summary.newZeroPolicyForced.length +
    summary.newZeroPolicyEnabled.length;

  if (newTotal > 0) {
    console.log('');
    console.log('  NEW findings — not in the baseline:');
    for (const key of summary.newMissing) console.log(`    - missing: ${key}`);
    for (const key of summary.newUnexpected) console.log(`    - unexpected: ${key}`);
    for (const key of summary.newZeroPolicyForced) console.log(`    - zeroPolicyForced: ${key}`);
    for (const key of summary.newZeroPolicyEnabled) console.log(`    - zeroPolicyEnabled: ${key}`);
  }

  console.log('');
  console.log('='.repeat(72));
  if (summary.exitCode === EXIT_CLEAN) {
    console.log(`RESULT: CLEAN (exit ${EXIT_CLEAN}) — no drift beyond the baseline.`);
  } else {
    console.log(`RESULT: DRIFT DETECTED (exit ${EXIT_DRIFT})`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<number> {
  const jsonMode = process.argv.includes('--json');

  const files = loadMigrationCorpus();
  const { statements, expected } = replayPolicyStatements(files);

  assertCorpusIntegrity({
    migrationFileCount: files.length,
    statementCount: statements.length,
    expectedPolicyCount: expected.size,
  });

  const [liveRows, metaRows] = await Promise.all([queryLivePolicies(), queryTableRlsMeta()]);

  const live = new Set(liveRows.map((r) => policyKey({ table: r.table_name, policy: r.policy_name })));

  const diff = diffPolicySets(expected, live);

  const { raw: baselineRaw, asPolicyBaselines } = loadBaseline();

  const policyBaselineApplication = applyBaseline(diff, {
    missing: asPolicyBaselines.missing,
    unexpected: asPolicyBaselines.unexpected,
  });

  const rlsMetaRows: TableRlsRow[] = metaRows.map((r) => ({
    table: r.table_name,
    rlsEnabled: r.rls_enabled,
    rlsForced: r.rls_forced,
    policyCount: r.policy_count,
  }));

  const zeroClassification = classifyZeroPolicyTables(rlsMetaRows);

  const zeroForcedApplication = applyBaseline(
    { missing: zeroClassification.forcedZero, unexpected: [] },
    { missing: asPolicyBaselines.zeroPolicyForced, unexpected: [] }
  );
  const zeroEnabledApplication = applyBaseline(
    { missing: zeroClassification.enabledZero, unexpected: [] },
    { missing: asPolicyBaselines.zeroPolicyEnabled, unexpected: [] }
  );

  const hasDrift =
    policyBaselineApplication.newMissing.length > 0 ||
    policyBaselineApplication.newUnexpected.length > 0 ||
    policyBaselineApplication.staleMissing.length > 0 ||
    policyBaselineApplication.staleUnexpected.length > 0 ||
    zeroForcedApplication.newMissing.length > 0 ||
    zeroForcedApplication.staleMissing.length > 0 ||
    zeroEnabledApplication.newMissing.length > 0 ||
    zeroEnabledApplication.staleMissing.length > 0;

  const exitCode = hasDrift ? EXIT_DRIFT : EXIT_CLEAN;

  const summary: JsonSummary = {
    generatedAt: new Date().toISOString(),
    migrationFiles: files.length,
    statementsParsed: statements.length,
    expectedCount: expected.size,
    liveCount: live.size,
    missing: diff.missing,
    unexpected: diff.unexpected,
    missingByTable: computeMissingByTable(expected, live),
    zeroPolicyForced: zeroClassification.forcedZero,
    zeroPolicyEnabled: zeroClassification.enabledZero,
    baseline: {
      suppressedMissing: asPolicyBaselines.missing.length - policyBaselineApplication.staleMissing.length,
      suppressedUnexpected:
        asPolicyBaselines.unexpected.length - policyBaselineApplication.staleUnexpected.length,
      staleMissing: policyBaselineApplication.staleMissing,
      staleUnexpected: policyBaselineApplication.staleUnexpected,
    },
    newMissing: policyBaselineApplication.newMissing,
    newUnexpected: policyBaselineApplication.newUnexpected,
    newZeroPolicyForced: zeroForcedApplication.newMissing,
    newZeroPolicyEnabled: zeroEnabledApplication.newMissing,
    staleZeroPolicyForced: zeroForcedApplication.staleMissing,
    staleZeroPolicyEnabled: zeroEnabledApplication.staleMissing,
    exitCode,
  };

  if (jsonMode) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    printHumanReport(summary, baselineRaw);
  }

  return exitCode;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    if (err instanceof OperationalFailure || err instanceof CorpusIntegrityError) {
      console.error('');
      console.error('='.repeat(72));
      console.error('OPERATIONAL FAILURE — this is NOT a clean run and NOT a drift finding.');
      console.error('='.repeat(72));
      console.error(err.message);
      process.exitCode = EXIT_OPERATIONAL_FAILURE;
      return;
    }
    console.error('');
    console.error('='.repeat(72));
    console.error('OPERATIONAL FAILURE — unexpected error.');
    console.error('='.repeat(72));
    console.error(err);
    process.exitCode = EXIT_OPERATIONAL_FAILURE;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
