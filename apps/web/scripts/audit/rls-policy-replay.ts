/**
 * RLS Policy Replay — pure parse/replay/diff library (no database, no I/O)
 *
 * WHAT THIS EXISTS TO CATCH
 * -------------------------
 * quick-584 found that 59 RLS policies across 13 carrier tables silently
 * vanished from production sometime between 2026-05-28 and 2026-08-24. The
 * mechanism could not be determined from surviving evidence: the one surface
 * that would have recorded it (`log_statement = 'ddl'`) was enabled and DID
 * capture the statements, but Supabase's log retention is ~24 hours and the
 * event was discovered roughly three months later. Ten of the thirteen
 * tables carry `org_id` and were re-covered by a later standardization
 * migration, so the loss was invisible on those; three were left with
 * **zero** live policies (`stops`, `carrier_documents`, `route_template_stops`).
 *
 * Postgres stores no policy creation timestamp. `pg_policy` has no
 * timestamp column and there is no `pg_stat_last_ddl`. A diff between what
 * the repo's migrations say should exist and what live `pg_policy` actually
 * holds — replayed in migration order — is therefore the ONLY available
 * detector for this class of loss. See
 * docs/diagnostics/rls-policy-drop-forensics.md §5 and §6.
 *
 * GUARD-RAILS — read-only:
 *   This module never touches a database, the filesystem, or the network.
 *   It takes migration file contents as plain strings (the caller does the
 *   disk read) and returns plain data. There is no `console.log`, no
 *   `process.exit`, nothing side-effecting anywhere in this file.
 *
 * Consumed by apps/web/scripts/audit/rls-policy-drift.ts (the runner, which
 * does read migrations from disk and does query live `pg_policy`) and by
 * apps/web/tests/security/rls-policy-replay.test.ts.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PolicyRef {
  table: string;
  policy: string;
}

/** `${table}.${policy}`, both unquoted and un-lowercased (identifiers here are case-sensitive). */
export type PolicyKey = string;

export interface PolicyStatement {
  kind: 'CREATE' | 'DROP';
  migration: string; // migration directory name
  table: string;
  policy: string;
  ifExists: boolean;
}

export function policyKey(ref: PolicyRef): PolicyKey {
  return `${ref.table}.${ref.policy}`;
}

// ---------------------------------------------------------------------------
// 1. Parser
// ---------------------------------------------------------------------------

/**
 * The parser anchor is LOAD-BEARING and produces the reproduction number
 * (328 statements against quick-584's 230 expected-policy count).
 *
 * A raw, unanchored `grep -E '(CREATE|DROP)\s+POLICY'` across the migration
 * corpus returns 330 hits. The two extras live inside a
 * `DO $$ … EXECUTE format('CREATE POLICY …')` block in
 * `20260802120000_document_import_phase1/migration.sql` (source lines 336
 * and 344) — those lines begin with a single-quote (the string literal
 * passed to `format()`), not with the keyword `CREATE`/`DROP` itself.
 *
 * Anchoring the match to the START of a line (optional leading whitespace,
 * then the keyword) excludes exactly those two dynamic-SQL lines and yields
 * 328. That exclusion is also *why* four document_import* policies show up
 * as "unexpected" against live `pg_policy` in the diff step: the DO block
 * really did create them at runtime, this replay does not (and structurally
 * cannot, without evaluating dynamic SQL) see them, and quick-584 counted
 * them as unexpected/live-but-not-expected. "Improving" the parser to
 * evaluate dynamic SQL changes every downstream number and breaks the
 * reproduction — do not do it.
 *
 * `ALTER POLICY` is deliberately not recorded. No migration in this corpus
 * uses it as of quick-584/quick-585; if one is added later this parser will
 * silently ignore it (a rename), which is a known, accepted gap rather than
 * an oversight — flagged here so it is not "fixed" without updating the
 * floors and the 328/230 reproduction numbers deliberately, together.
 */
const POLICY_STATEMENT_RE =
  /^[ \t]*(CREATE|DROP)\s+POLICY\s+(?:IF\s+EXISTS\s+)?("(?:[^"]+)"|[A-Za-z_][A-Za-z0-9_]*)\s+ON\s+(?:public\.)?("(?:[^"]+)"|[A-Za-z_][A-Za-z0-9_]*)/gim;

function stripQuotes(identifier: string): string {
  if (identifier.startsWith('"') && identifier.endsWith('"')) {
    return identifier.slice(1, -1);
  }
  return identifier;
}

/**
 * Detects whether a matched `DROP POLICY` clause carries `IF EXISTS`. The
 * main regex already consumes the `IF EXISTS` token (optionally) as part of
 * matching the policy name, so we re-check the raw matched text rather than
 * re-deriving it from a second regex pass.
 */
const IF_EXISTS_RE = /^[ \t]*DROP\s+POLICY\s+IF\s+EXISTS\s+/i;

export function parsePolicyStatements(migration: string, sql: string): PolicyStatement[] {
  // Normalise CRLF first. This repo has core.autocrlf=true and no
  // .gitattributes, so migration.sql is CRLF in the working tree and LF in
  // the index. Without this, captured policy/table names carry a trailing
  // \r and every downstream key mismatches against live pg_policy (which
  // has none).
  const normalised = sql.replace(/\r\n/g, '\n');

  const statements: PolicyStatement[] = [];
  let match: RegExpExecArray | null;
  POLICY_STATEMENT_RE.lastIndex = 0;

  while ((match = POLICY_STATEMENT_RE.exec(normalised)) !== null) {
    const [full, kindRaw, policyRaw, tableRaw] = match;
    const kind = kindRaw.toUpperCase() as 'CREATE' | 'DROP';
    const ifExists = kind === 'DROP' && IF_EXISTS_RE.test(full);

    statements.push({
      kind,
      migration,
      table: stripQuotes(tableRaw),
      policy: stripQuotes(policyRaw),
      ifExists,
    });
  }

  return statements;
}

// ---------------------------------------------------------------------------
// 2. Replay
// ---------------------------------------------------------------------------

export interface MigrationFile {
  migration: string;
  sql: string;
}

export interface ReplayResult {
  statements: PolicyStatement[];
  expected: Set<PolicyKey>;
}

/**
 * Replays CREATE/DROP POLICY statements in migration order to compute the
 * set of policies the repo's migrations expect to exist live.
 *
 * Ordering is the whole point. `20260515000001_db_security_standardization`
 * contains a balanced 46 DROP / 46 CREATE (drop the old per-command policy,
 * create the new standardized pair, for 23 tables) — a naive raw CREATE
 * count would report 46 phantom discrepancies against that single
 * migration alone. Replaying DROP-then-CREATE in file order and keeping
 * only the net set the migrations leave behind is what makes the 230
 * "expected" number correct.
 *
 * The caller (the disk-reading runner) is responsible for sorting files by
 * migration directory name ascending before calling this function. This
 * function asserts that ordering and throws rather than silently replaying
 * out of order, because an out-of-order replay produces a set that looks
 * plausible and is wrong.
 */
export function replayPolicyStatements(files: MigrationFile[]): ReplayResult {
  for (let i = 1; i < files.length; i++) {
    if (files[i].migration < files[i - 1].migration) {
      throw new Error(
        `replayPolicyStatements: migration files are not sorted ascending by directory name ` +
          `(found "${files[i].migration}" after "${files[i - 1].migration}"). ` +
          `Sort by directory name before calling replay — order is load-bearing.`
      );
    }
  }

  const allStatements: PolicyStatement[] = [];
  const live = new Set<PolicyKey>();

  for (const file of files) {
    const statements = parsePolicyStatements(file.migration, file.sql);
    allStatements.push(...statements);

    for (const stmt of statements) {
      const key = policyKey(stmt);
      if (stmt.kind === 'CREATE') {
        live.add(key);
      } else {
        // DROP ... IF EXISTS on an absent key is a no-op, not an error.
        // A plain DROP (no IF EXISTS) on an absent key is also treated as a
        // no-op here — the migration corpus is historical fact, and this
        // replay's job is to compute the net set, not to re-validate that
        // every migration would have applied cleanly against some earlier
        // hypothetical state.
        live.delete(key);
      }
    }
  }

  return { statements: allStatements, expected: live };
}

// ---------------------------------------------------------------------------
// 3. Diff
// ---------------------------------------------------------------------------

export interface PolicyDiff {
  missing: PolicyKey[]; // expected - live: a migration creates it, the DB does not have it
  unexpected: PolicyKey[]; // live - expected: the DB has it, no migration creates it
}

export function diffPolicySets(expected: Set<PolicyKey>, live: Set<PolicyKey>): PolicyDiff {
  const missing: PolicyKey[] = [];
  const unexpected: PolicyKey[] = [];

  for (const key of expected) {
    if (!live.has(key)) missing.push(key);
  }
  for (const key of live) {
    if (!expected.has(key)) unexpected.push(key);
  }

  missing.sort();
  unexpected.sort();

  return { missing, unexpected };
}

// ---------------------------------------------------------------------------
// 4. Baseline application
// ---------------------------------------------------------------------------

export interface SetDiffResult {
  /** In the candidate set but not baselined — a genuinely new finding. Failure. */
  newEntries: string[];
  /** In the baseline but not in the candidate set any more — stale. Failure. */
  staleEntries: string[];
}

/**
 * Generic set-diff-against-a-shrinking-baseline helper. Shared by
 * applyBaseline (policy keys) and classifyZeroPolicyTables (table names) so
 * the stale-entry rule is written once, not four times.
 */
export function diffAgainstBaseline(candidates: string[], baseline: string[]): SetDiffResult {
  const candidateSet = new Set(candidates);
  const baselineSet = new Set(baseline);

  const newEntries = candidates.filter((c) => !baselineSet.has(c)).sort();
  const staleEntries = baseline.filter((b) => !candidateSet.has(b)).sort();

  return { newEntries, staleEntries };
}

export interface PolicyBaseline {
  missing: string[];
  unexpected: string[];
}

export interface BaselineApplication {
  newMissing: PolicyKey[];
  newUnexpected: PolicyKey[];
  staleMissing: PolicyKey[];
  staleUnexpected: PolicyKey[];
}

/**
 * Subtracts an explicit, named baseline from a diff.
 *
 * This is what makes the baseline a SHRINKING list rather than a tolerance
 * number or a suppression flag:
 *   - newMissing / newUnexpected: anything NOT already named in the
 *     baseline is a genuinely new finding and fails the check.
 *   - staleMissing / staleUnexpected: anything named in the baseline that
 *     is no longer actually missing/unexpected live is a STALE baseline
 *     entry and *also* fails the check, naming exactly which line to
 *     delete. As policies are rebuilt, the check keeps failing — loudly —
 *     until someone deletes the corresponding baseline line. There is no
 *     code path that lets a baseline entry sit unused forever without
 *     failing the build.
 */
export function applyBaseline(diff: PolicyDiff, baseline: PolicyBaseline): BaselineApplication {
  const missingDiff = diffAgainstBaseline(diff.missing, baseline.missing);
  const unexpectedDiff = diffAgainstBaseline(diff.unexpected, baseline.unexpected);

  return {
    newMissing: missingDiff.newEntries,
    staleMissing: missingDiff.staleEntries,
    newUnexpected: unexpectedDiff.newEntries,
    staleUnexpected: unexpectedDiff.staleEntries,
  };
}

// ---------------------------------------------------------------------------
// 5. Zero-policy classification
// ---------------------------------------------------------------------------

export interface TableRlsRow {
  table: string;
  rlsEnabled: boolean;
  rlsForced: boolean;
  policyCount: number;
}

export interface ZeroPolicyClassification {
  /** FORCE RLS = true AND zero live policies. The severe class: quick-582
   *  established this is how `carrier_documents` was invisible to a
   *  grant-only audit — forced RLS with no policies denies every row to
   *  every role, including the app's own connection. */
  forcedZero: string[];
  /** RLS enabled, NOT forced, zero live policies. Less severe (a
   *  superuser/table-owner connection still bypasses RLS entirely when it
   *  is not forced) but still a real gap for every other role. */
  enabledZero: string[];
}

/**
 * A table appears in exactly one class. FORCE implies enabled, so a table
 * that is both forced and enabled with zero policies lands only in
 * `forcedZero` (the more severe class wins) — never in both.
 */
export function classifyZeroPolicyTables(rows: TableRlsRow[]): ZeroPolicyClassification {
  const forcedZero: string[] = [];
  const enabledZero: string[] = [];

  for (const row of rows) {
    if (row.policyCount > 0) continue;
    if (row.rlsForced) {
      forcedZero.push(row.table);
    } else if (row.rlsEnabled) {
      enabledZero.push(row.table);
    }
  }

  forcedZero.sort();
  enabledZero.sort();

  return { forcedZero, enabledZero };
}

// ---------------------------------------------------------------------------
// 6. Integrity floors
// ---------------------------------------------------------------------------

/**
 * A parser that silently matches nothing reports "everything is missing"
 * (expected set is empty, live set is non-empty → every live policy is
 * "unexpected" and every real migration-created policy looks droppable) —
 * or, symmetrically, if the live query itself returns nothing, "everything
 * is fine" (empty diff both ways). Both failure modes look like a working,
 * green check. These floors exist so a parser regression, an accidentally
 * emptied migrations directory, or a broken live query fails LOUD instead
 * of fails QUIET.
 *
 * Values are calibrated against quick-584's reproduction numbers (328
 * statements / 230 expected / 141 migration files) with headroom for the
 * corpus growing, never shrinking below a floor meant to catch it going to
 * (near) zero.
 */
export const INTEGRITY_FLOORS = {
  MIN_STATEMENTS: 300,
  MIN_EXPECTED_POLICIES: 200,
  MIN_MIGRATION_FILES: 130,
} as const;

export class CorpusIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CorpusIntegrityError';
  }
}

export interface CorpusIntegrityInput {
  migrationFileCount: number;
  statementCount: number;
  expectedPolicyCount: number;
}

export function assertCorpusIntegrity(input: CorpusIntegrityInput): void {
  const problems: string[] = [];

  if (input.migrationFileCount < INTEGRITY_FLOORS.MIN_MIGRATION_FILES) {
    problems.push(
      `migration files read = ${input.migrationFileCount}, floor = ${INTEGRITY_FLOORS.MIN_MIGRATION_FILES}`
    );
  }
  if (input.statementCount < INTEGRITY_FLOORS.MIN_STATEMENTS) {
    problems.push(
      `statements parsed = ${input.statementCount}, floor = ${INTEGRITY_FLOORS.MIN_STATEMENTS}`
    );
  }
  if (input.expectedPolicyCount < INTEGRITY_FLOORS.MIN_EXPECTED_POLICIES) {
    problems.push(
      `expected policies = ${input.expectedPolicyCount}, floor = ${INTEGRITY_FLOORS.MIN_EXPECTED_POLICIES}`
    );
  }

  if (problems.length > 0) {
    throw new CorpusIntegrityError(
      `RLS policy corpus integrity floor breached — the parser or the migration ` +
        `corpus read may be broken, which would make every other number in this ` +
        `report meaningless (a silent parse failure looks like either "everything ` +
        `is missing" or "everything is fine"). Problems:\n  - ${problems.join('\n  - ')}`
    );
  }
}
