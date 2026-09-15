import '../_bootstrap-env-readonly';

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
 *
 * NO BASELINE — quick-591 / Phase 0 Prompt 0.5.
 *
 * This script used to load a suppression baseline from
 * rls-policy-baseline.json, which recorded 59 missing and 8 unexpected
 * policies and reported CLEAN while every one of them was outstanding. It was
 * described as a SHRINKING baseline that must be emptied as policies were
 * rebuilt, and it never shrank. A gate that runs and reports success without
 * checking is worse than no gate, because it is trusted.
 *
 * 20260909120000_reconcile_rls_policy_drift reconciled the repository with the
 * live database — recording the 59 inert JWT policies as dropped, and adopting
 * the 8 out-of-band Document Import policies — so the true replay drift is
 * zero. The baseline file is deleted and there is nothing here that can
 * suppress a finding. Any non-zero missing or unexpected count now fails.
 *
 * WHAT GATES AND WHAT DOES NOT, stated rather than left to be discovered:
 *   - GATES (exit 1): missing (expected−live) and unexpected (live−expected).
 *   - DOES NOT GATE: the zero-policy table classification. `stops`,
 *     `route_template_stops` and `carrier_documents` run FORCE RLS with zero
 *     policies, and `_prisma_migrations` has RLS enabled with none. Those are
 *     real and are Prompt 1's work; they are not replay drift, and they are
 *     printed as a standing WARNING every run rather than suppressed. When
 *     Prompt 1 closes them the warning disappears on its own.
 *
 * quick-598 — A SECOND, ADDITIVE LAYER: POLICY BODIES.
 *
 * Everything above is the NAME layer and is unchanged. It diffs
 * `(table, policy_name)` identity, which is the only detector available for a
 * policy that VANISHES — and is completely blind to a policy that is REWRITTEN.
 * `USING (org_id = current_tenant_id())` changed to `USING (true)` under the
 * same name leaves the name diff reporting "MISSING: none / UNEXPECTED: none"
 * while the table is open to every tenant. quick-597 section 6 measured that.
 *
 * The definition layer compares the live body of every policy against the body
 * its migration declares, canonicalised through Postgres by
 * `598-canonicalise-policies.ts` and committed as `rls-policy-canonical.json`.
 * Because the expected side is checked in, THIS run stays a pure SELECT — no
 * transaction, no DDL — and is therefore safe to point at production.
 *
 *   - GATES (exit 1): definition drift, alongside missing/unexpected.
 *   - EXIT 3 (EXIT_DEFINITIONS_NOT_CHECKED): the artefact is absent or stale.
 *     The run prints DEFINITION LAYER DID NOT RUN and never prints CLEAN.
 *     Re-run `npm run audit:rls-canonicalise` whenever a migration changes a
 *     policy body.
 *   - DOES NOT GATE: `notCanonicalised` — a live policy with no canonical
 *     entry. It is "cannot be judged", printed by name every run, the same
 *     discipline as the zero-policy classification.
 *
 * Run from apps/web/:
 *   npm run audit:rls-policy-drift
 *   npm run audit:rls-policy-drift -- --json
 *   npm run audit:rls-canonicalise        (staging only; regenerates the artefact)
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
  classifyZeroPolicyTables,
  assertCorpusIntegrity,
  CorpusIntegrityError,
  policyKey,
  type MigrationFile,
  type TableRlsRow,
} from './rls-policy-replay';

import {
  replayPolicyDefinitions,
  computeDefinitionCorpusHash,
  diffPolicyDefinitions,
  assertDefinitionCorpusIntegrity,
  DefinitionCorpusIntegrityError,
  POLICY_CMD_BY_CATALOGUE_CHAR,
  PUBLIC_ROLE_OID,
  type CanonicalArtefact,
  type DefinitionDriftFinding,
  type LivePolicyShapeRow,
} from './rls-policy-definitions';

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
  // ---- quick-598 definition layer. Additive: the name diff below reads only
  // the two columns above and is byte-unchanged in behaviour. ----
  permissive: boolean;
  cmd: string;
  roles: string[];
  using: string | null;
  with_check: string | null;
}

interface TableMetaRow {
  table_name: string;
  rls_enabled: boolean;
  rls_forced: boolean;
  policy_count: number;
}

// ---------------------------------------------------------------------------
// Exit codes
// ---------------------------------------------------------------------------

const EXIT_CLEAN = 0;
const EXIT_DRIFT = 1;
const EXIT_OPERATIONAL_FAILURE = 2;
/**
 * quick-598. DISTINCT from both CLEAN and DRIFT on purpose: "the definition
 * layer could not run" is a third answer, and collapsing it into either of the
 * other two is the failure this whole task exists to remove. Exit 3 means the
 * canonical artefact is absent or stale, the word CLEAN was NOT printed, and
 * nobody may read the run as evidence about policy bodies.
 */
const EXIT_DEFINITIONS_NOT_CHECKED = 3;

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
// Live queries — read-only, pg_catalog only. Joins go through pg_class.oid;
// never `::regclass` on a literal (this schema mixes PascalCase and
// snake_case table names).
// ---------------------------------------------------------------------------

async function queryLivePolicies(): Promise<LivePolicyRow[]> {
  // quick-598 added the five definition columns. Still a single read-only
  // SELECT against pg_catalog with no transaction and no DDL — which is the
  // property that lets this exact query run against PRODUCTION.
  //
  // `TO public` surfaces as polroles = {0}, a pseudo-oid with NO pg_roles row.
  // Mapping it to the literal 'public' is not cosmetic: without it every
  // TO public policy (which is most of them) reports false role drift.
  return prisma.$queryRawUnsafe<LivePolicyRow[]>(`
    SELECT
      c.relname AS table_name,
      p.polname AS policy_name,
      p.polpermissive AS permissive,
      p.polcmd::text AS cmd,
      COALESCE(
        (
          SELECT array_agg(x ORDER BY x)
            FROM (
              SELECT CASE
                       WHEN ro = ${PUBLIC_ROLE_OID} THEN 'public'
                       ELSE COALESCE(pr.rolname::text, ro::text)
                     END AS x
                FROM unnest(p.polroles) AS ro
                LEFT JOIN pg_roles pr ON pr.oid = ro
            ) s
        ),
        ARRAY[]::text[]
      ) AS roles,
      -- "using" is a reserved word; an unquoted alias here is a syntax error.
      pg_get_expr(p.polqual, p.polrelid) AS "using",
      pg_get_expr(p.polwithcheck, p.polrelid) AS with_check
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
  definitionLayer: DefinitionLayerSummary;
  exitCode: number;
}

// ---------------------------------------------------------------------------
// quick-598 — DEFINITION LAYER
//
// THE SENTENCE THIS SECTION EXISTS FOR:
//   A POLICY REWRITTEN TO `USING (true)` UNDER ITS OWN NAME IS INVISIBLE TO
//   THE NAME DIFF ABOVE, AND IS EXACTLY WHAT THIS LAYER CATCHES.
//
// The name diff compares `(table, policy_name)` identity. It is the only
// detector for quick-584's class of loss (a policy that VANISHES) and it is
// untouched. But identity says nothing about the body: the policy still
// exists, still carries its name, and the name layer still reports
// "MISSING: none / UNEXPECTED: none". quick-597 section 6 measured that, and
// it is the second of the two blind Phase 0 gates.
//
// The expected side cannot be a string comparison against the migration text.
// A migration writes `current_setting('app.bypass_rls', TRUE) = 'on'`;
// Postgres renders the stored tree as
// `(current_setting('app.bypass_rls'::text, true) = 'on'::text)`. Same
// expression, five textual differences, ~20 bypass policies — a regex
// normaliser would report all of them as drift. So the expected bodies are
// canonicalised BY POSTGRES on staging, inside BEGIN...ROLLBACK, by
// `598-canonicalise-policies.ts`, and committed as `rls-policy-canonical.json`.
// That artefact is what makes THIS run a pure SELECT, which is what makes it
// safe against production.
//
// If the artefact is absent or stale, this layer prints DEFINITION LAYER DID
// NOT RUN and exits 3. It never prints CLEAN in that state.
// ---------------------------------------------------------------------------

interface DefinitionLayerSummary {
  ran: boolean;
  reason: string;
  corpusHash: string;
  artefactHash: string | null;
  compared: number;
  drift: DefinitionDriftFinding[];
  notCanonicalised: string[];
  /** Policies the canonicaliser itself could not build on staging. */
  notCanonicalisedAtSource: Array<{ key: string; sqlstate: string; message: string }>;
}

const CANONICAL_ARTEFACT_PATH = join(__dirname, 'rls-policy-canonical.json');

function readCanonicalArtefact(): CanonicalArtefact | null {
  try {
    return JSON.parse(readFileSync(CANONICAL_ARTEFACT_PATH, 'utf8')) as CanonicalArtefact;
  } catch {
    return null;
  }
}

function toLiveShapeRows(rows: LivePolicyRow[]): LivePolicyShapeRow[] {
  return rows.map((r) => {
    const cmd = POLICY_CMD_BY_CATALOGUE_CHAR[r.cmd];
    if (!cmd) {
      throw new OperationalFailure(
        `Unknown pg_policy.polcmd ${JSON.stringify(r.cmd)} on ${r.table_name}.${r.policy_name}. ` +
          `Refusing to guess — an unmapped command would silently compare as a mismatch.`
      );
    }
    return {
      table: r.table_name,
      policy: r.policy_name,
      permissive: r.permissive,
      cmd,
      roles: Array.isArray(r.roles) ? r.roles : [],
      using: r.using,
      withCheck: r.with_check,
    };
  });
}

function printDefinitionSection(d: DefinitionLayerSummary): void {
  console.log('DEFINITION LAYER (quick-598) — policy BODIES, not just names:');

  if (!d.ran) {
    console.log('');
    console.log('  **DEFINITION LAYER DID NOT RUN**');
    console.log(`  Reason: ${d.reason}`);
    console.log('');
    console.log('  The name diff above checked which policies EXIST. Nothing has checked');
    console.log('  what any of them DO. A policy rewritten to USING (true) under its own');
    console.log('  name would not appear anywhere in this report.');
    console.log('');
    console.log('  Fix: run `npm run audit:rls-canonicalise` (staging) and commit');
    console.log('  scripts/audit/rls-policy-canonical.json.');
    console.log('');
    return;
  }

  console.log(`  Canonical artefact hash  : ${d.artefactHash}`);
  console.log(`  Corpus hash (from disk)  : ${d.corpusHash}`);
  console.log(`  Policies compared        : ${d.compared}`);
  console.log(`  Definition drift         : ${d.drift.length}`);
  console.log('');

  if (d.drift.length > 0) {
    console.log('DEFINITION DRIFT (live body differs from the migration-declared body):');
    for (const f of d.drift) {
      console.log(`  - ${f.key} [${f.field}]`);
      console.log(`      expected: ${f.expected}`);
      console.log(`      live    : ${f.live}`);
    }
    console.log('');
  }

  // Reported every run, NOT gating — same discipline as the zero-policy
  // classification above. "Cannot be judged" is a third answer and is printed
  // by name rather than folded into clean or drift.
  console.log(
    `  NOT CANONICALISED (live, no canonical entry — body unchecked): ${d.notCanonicalised.length || 'none'}`
  );
  for (const key of d.notCanonicalised) console.log(`    - ${key}`);
  if (d.notCanonicalisedAtSource.length > 0) {
    console.log(
      `  NOT CANONICALISED AT SOURCE (the canonicaliser could not build these): ${d.notCanonicalisedAtSource.length}`
    );
    for (const e of d.notCanonicalisedAtSource) {
      console.log(`    - ${e.key} [${e.sqlstate}] ${e.message}`);
    }
  }
  console.log('');
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

function printHumanReport(summary: JsonSummary): void {
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

  // Reported every run, NOT gating. These are Prompt 1's work, not replay
  // drift — no migration claims to create a policy on them, so they cannot
  // appear as `missing`. Printing them unconditionally is deliberate: the old
  // baseline suppressed exactly this and called the result CLEAN.
  console.log('ZERO-POLICY TABLES (reported, not gating — Prompt 1 owns these):');
  console.log(
    `  FORCE RLS + zero policies (severe)     : ${summary.zeroPolicyForced.join(', ') || 'none'}`
  );
  console.log(
    `  RLS enabled, not forced, zero policies : ${summary.zeroPolicyEnabled.join(', ') || 'none'}`
  );
  if (summary.zeroPolicyForced.length > 0) {
    console.log('');
    console.log(
      `  WARNING: ${summary.zeroPolicyForced.length} table(s) enforce RLS with no policy at all.`
    );
    console.log('           Every row is denied to any role without BYPASSRLS.');
  }
  console.log('');

  console.log('BASELINE: none — this check has no suppression list.');
  console.log('  Any missing or unexpected policy fails the run.');
  console.log('');

  printDefinitionSection(summary.definitionLayer);

  console.log('='.repeat(72));
  if (summary.exitCode === EXIT_DEFINITIONS_NOT_CHECKED) {
    // Deliberately NOT the word CLEAN, and deliberately not DRIFT either.
    console.log(
      `RESULT: DEFINITION LAYER DID NOT RUN (exit ${EXIT_DEFINITIONS_NOT_CHECKED}) — policy bodies were NOT checked.`
    );
    console.log('');
    console.log('  The name-level diff above is reported for what it is worth, but this');
    console.log('  run is NOT evidence that the policies do what they say. Run');
    console.log('  `npm run audit:rls-canonicalise` against staging and commit the artefact.');
  } else if (summary.exitCode === EXIT_CLEAN) {
    console.log(
      `RESULT: CLEAN (exit ${EXIT_CLEAN}) — repo and database agree on policy NAMES and BODIES.`
    );
  } else {
    console.log(`RESULT: DRIFT DETECTED (exit ${EXIT_DRIFT})`);
    console.log('');
    console.log('  The repository and the database disagree about the RLS policies:');
    console.log('  a policy is missing, unexpected, or its live body differs from the');
    console.log('  body its migration declares. Do not add a suppression list —');
    console.log('  reconcile with a new forward migration.');
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

  const rlsMetaRows: TableRlsRow[] = metaRows.map((r) => ({
    table: r.table_name,
    rlsEnabled: r.rls_enabled,
    rlsForced: r.rls_forced,
    policyCount: r.policy_count,
  }));

  const zeroClassification = classifyZeroPolicyTables(rlsMetaRows);

  // -------------------------------------------------------------------------
  // quick-598 — DEFINITION LAYER. Additive: everything above is unchanged.
  // -------------------------------------------------------------------------
  const { definitions, expected: expectedDefinitions } = replayPolicyDefinitions(files);
  assertDefinitionCorpusIntegrity({
    definitionsParsed: definitions.length,
    expectedDefinitions: expectedDefinitions.size,
  });
  const corpusHash = computeDefinitionCorpusHash(expectedDefinitions);

  const artefact = readCanonicalArtefact();
  let definitionLayer: DefinitionLayerSummary;

  if (!artefact) {
    definitionLayer = {
      ran: false,
      reason:
        `the canonical artefact is ABSENT at ${CANONICAL_ARTEFACT_PATH}. ` +
        `Nothing has been compared and no body has been checked.`,
      corpusHash,
      artefactHash: null,
      compared: 0,
      drift: [],
      notCanonicalised: [],
      notCanonicalisedAtSource: [],
    };
  } else if (artefact.corpusHash !== corpusHash) {
    definitionLayer = {
      ran: false,
      reason:
        `the canonical artefact is STALE. A migration on disk changed a policy BODY ` +
        `since it was generated (artefact ${artefact.corpusHash.slice(0, 16)}..., ` +
        `corpus ${corpusHash.slice(0, 16)}...) and ` +
        `\`npm run audit:rls-canonicalise\` was not re-run.`,
      corpusHash,
      artefactHash: artefact.corpusHash,
      compared: 0,
      drift: [],
      notCanonicalised: [],
      notCanonicalisedAtSource: artefact.notCanonicalised ?? [],
    };
  } else {
    const defDiff = diffPolicyDefinitions(artefact.policies, toLiveShapeRows(liveRows));
    assertDefinitionCorpusIntegrity({
      definitionsParsed: definitions.length,
      expectedDefinitions: expectedDefinitions.size,
      canonicalised: artefact.canonicalisedCount,
      compared: defDiff.compared,
    });
    definitionLayer = {
      ran: true,
      reason: 'canonical artefact present and current',
      corpusHash,
      artefactHash: artefact.corpusHash,
      compared: defDiff.compared,
      drift: defDiff.definitionDrift,
      notCanonicalised: defDiff.notCanonicalised,
      notCanonicalisedAtSource: artefact.notCanonicalised ?? [],
    };
  }

  // The whole gate, with nothing between the diff and the verdict.
  const hasDrift = diff.missing.length > 0 || diff.unexpected.length > 0;
  const hasDefinitionDrift = definitionLayer.drift.length > 0;

  // "Did not run" outranks "clean" and is reported ahead of name drift only
  // when there is no name drift to report — a real missing policy is still the
  // more urgent finding.
  const exitCode = hasDrift || hasDefinitionDrift
    ? EXIT_DRIFT
    : definitionLayer.ran
      ? EXIT_CLEAN
      : EXIT_DEFINITIONS_NOT_CHECKED;

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
    definitionLayer,
    exitCode,
  };

  if (jsonMode) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    printHumanReport(summary);
  }

  return exitCode;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    if (
      err instanceof OperationalFailure ||
      err instanceof CorpusIntegrityError ||
      err instanceof DefinitionCorpusIntegrityError
    ) {
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
