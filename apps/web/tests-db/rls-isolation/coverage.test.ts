/**
 * quick-598 — per-table coverage, reported BY NAME.
 *
 * A suite that covers 16 of 89 tenant-scoped tables and says nothing about the
 * other 73 is a gate people will over-read. This file enumerates every table
 * carrying a `tenant_isolation_policy` on staging, prints each one as COVERED
 * or NOT COVERED WITH A REASON, and pins the NOT COVERED list against the
 * checked-in `uncovered-tables.json` IN BOTH DIRECTIONS:
 *
 *   - a NEW uncovered table fails    -> coverage silently shrank
 *   - a STALE entry fails            -> a table is covered but still listed
 *
 * That is `diffAgainstBaseline` from `scripts/audit/rls-policy-replay.ts`, the
 * same shrinking-baseline rule the drift detector uses, reused rather than
 * re-implemented. The rule matters because the alternative — a one-directional
 * "is it in the list" check — lets the list grow forever while the suite stays
 * green, which is precisely how `rls-policy-baseline.json` came to record 59
 * missing policies and report CLEAN.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Client } from 'pg';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

import { diffAgainstBaseline } from '../../scripts/audit/rls-policy-replay';
import {
  ISOLATION_TARGETS,
  collectTargetIds,
  loadFixtureIds,
  openDirect,
  type TargetIds,
} from './env';

const UNCOVERED_PATH = resolve(__dirname, 'uncovered-tables.json');
const REPORT_PATH = resolve(__dirname, 'coverage-report.json');

/**
 * Anti-vacuity. An empty enumeration classifies nothing and passes both
 * directions of the baseline diff; a fixture graph that failed to seed makes
 * every target uncovered and the baseline diff would then report 16 NEW
 * entries, which is loud — but the floor is what catches the case where the
 * baseline was "helpfully" regenerated to match.
 */
const MIN_COVERED_TABLES = 12;
const MIN_TENANT_SCOPED_TABLES = 70;

interface UncoveredEntry {
  table: string;
  tenantColumn: string | null;
  reason: string;
}

interface UncoveredFile {
  note: string;
  generatedAgainst: string;
  count: number;
  tables: UncoveredEntry[];
}

interface CoverageRow {
  table: string;
  status: 'COVERED' | 'NOT COVERED';
  tenantRowsA: number | null;
  tenantRowsB: number | null;
  reason: string;
}

let admin: Client;
let ids: TargetIds;
let tenantScopedTables: string[];
let rows: CoverageRow[];
let baseline: UncoveredFile;

beforeAll(async () => {
  baseline = JSON.parse(readFileSync(UNCOVERED_PATH, 'utf8')) as UncoveredFile;
  const fixtures = loadFixtureIds();

  admin = await openDirect();
  ids = await collectTargetIds(admin, fixtures.tenants);

  const live = await admin.query<{ t: string }>(
    `SELECT c.relname AS t
       FROM pg_policy p
       JOIN pg_class c ON c.oid = p.polrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND p.polname = 'tenant_isolation_policy'
      ORDER BY 1`
  );
  tenantScopedTables = live.rows.map((r) => r.t);

  const targetKeys = new Map(ISOLATION_TARGETS.map((t) => [t.key, t]));
  const reasonByTable = new Map(baseline.tables.map((t) => [t.table, t.reason]));

  rows = tenantScopedTables.map((table) => {
    const target = targetKeys.get(table);
    const a = target ? ids[table].A.length : null;
    const b = target ? ids[table].B.length : null;

    if (target && a! > 0 && b! > 0) {
      return {
        table,
        status: 'COVERED',
        tenantRowsA: a,
        tenantRowsB: b,
        reason: `behaviour probe runs against ${a} tenant-A and ${b} tenant-B fixture rows (${target.ownership} ownership)`,
      };
    }

    return {
      table,
      status: 'NOT COVERED',
      tenantRowsA: a,
      tenantRowsB: b,
      reason:
        target && (a === 0 || b === 0)
          ? 'listed as a behaviour target but the fixture graph produced no rows for one or both tenants'
          : (reasonByTable.get(table) ??
            'UNCLASSIFIED - this table is new since uncovered-tables.json was written'),
    };
  });

  // The human-readable report the constraint asks for, by name, every run.
  const covered = rows.filter((r) => r.status === 'COVERED');
  const uncovered = rows.filter((r) => r.status === 'NOT COVERED');
  /* eslint-disable no-console */
  console.log('');
  console.log('RLS ISOLATION COVERAGE — every table carrying tenant_isolation_policy');
  console.log('='.repeat(78));
  console.log(`  tenant-scoped tables : ${tenantScopedTables.length}`);
  console.log(`  COVERED              : ${covered.length}`);
  console.log(`  NOT COVERED          : ${uncovered.length}`);
  console.log('');
  console.log('COVERED:');
  for (const r of covered) console.log(`  ${r.table.padEnd(26)} ${r.reason}`);
  console.log('');
  console.log('NOT COVERED:');
  for (const r of uncovered) console.log(`  ${r.table.padEnd(26)} ${r.reason}`);
  console.log('');
  /* eslint-enable no-console */

  // No timestamp: the artefact is committed, and a field that changes every run
  // would make `git status` dirty after a clean verification run.
  writeFileSync(
    REPORT_PATH,
    JSON.stringify(
      {
        note: 'Regenerated by tests-db/rls-isolation/coverage.test.ts. No timestamp, deliberately: a field that changed every run would dirty the tree after a clean verification.',
        tenantScopedTableCount: tenantScopedTables.length,
        coveredCount: covered.length,
        notCoveredCount: uncovered.length,
        rows,
      },
      null,
      2
    ) + '\n',
    'utf8'
  );
});

afterAll(async () => {
  await admin?.end().catch(() => {});
});

describe('per-table coverage', () => {
  it('enumerated a plausible number of tenant-scoped tables', () => {
    expect(tenantScopedTables.length).toBeGreaterThanOrEqual(MIN_TENANT_SCOPED_TABLES);
  });

  it('covers at least the measured minimum (an empty enumeration cannot pass)', () => {
    const covered = rows.filter((r) => r.status === 'COVERED');
    expect(covered.length).toBeGreaterThanOrEqual(MIN_COVERED_TABLES);
  });

  it('every ISOLATION_TARGETS key appears in the enumeration AT ALL (D1)', () => {
    // `rows` is built by querying pg_policy for the literal policy name
    // `tenant_isolation_policy`. A target whose policy is renamed (or
    // dropped) leaves this enumeration entirely — it does not become
    // NOT COVERED, it stops existing here. Without this assertion, the NEXT
    // test (`'every behaviour target is classified COVERED'`) filters `rows`
    // by target key, gets an EMPTY filter result for the missing target, and
    // passes VACUOUSLY — exactly the trap quick-599's audit_log split
    // narrowly avoided by keeping the SELECT policy's name unchanged. This
    // test is what makes a future rename a loud failure instead of a silent
    // hole in coverage-report.json.
    const enumeratedTables = new Set(rows.map((r) => r.table));
    const missing = ISOLATION_TARGETS.map((t) => t.key).filter((key) => !enumeratedTables.has(key));
    expect(
      missing,
      `these behaviour targets carry no tenant_isolation_policy at all - renamed or dropped: ${missing.join(', ')}`
    ).toEqual([]);
  });

  it('every behaviour target is classified COVERED', () => {
    // Catches the case where a target is listed but its fixture rows vanished.
    const targetKeys = ISOLATION_TARGETS.map((t) => t.key);
    const notCovered = rows
      .filter((r) => targetKeys.includes(r.table) && r.status !== 'COVERED')
      .map((r) => `${r.table} (${r.reason})`);
    expect(notCovered, `behaviour targets that produced no coverage: ${notCovered.join('; ')}`).toEqual([]);
  });

  it('no table is UNCLASSIFIED', () => {
    const unclassified = rows.filter((r) => r.reason.startsWith('UNCLASSIFIED')).map((r) => r.table);
    expect(unclassified).toEqual([]);
  });

  it('the NOT COVERED list matches uncovered-tables.json in BOTH directions', () => {
    const uncovered = rows.filter((r) => r.status === 'NOT COVERED').map((r) => r.table);
    const diff = diffAgainstBaseline(
      uncovered,
      baseline.tables.map((t) => t.table)
    );

    expect(
      diff.newEntries,
      `coverage SHRANK - these tenant-scoped tables are no longer covered and are not ` +
        `listed in uncovered-tables.json: ${diff.newEntries.join(', ')}`
    ).toEqual([]);

    expect(
      diff.staleEntries,
      `uncovered-tables.json is STALE - these tables ARE covered now and must be ` +
        `deleted from it: ${diff.staleEntries.join(', ')}`
    ).toEqual([]);
  });

  it('uncovered-tables.json states a count that matches its own list', () => {
    expect(baseline.count).toBe(baseline.tables.length);
  });

  it('every uncovered entry carries a non-trivial reason', () => {
    const thin = baseline.tables.filter((t) => !t.reason || t.reason.length < 20).map((t) => t.table);
    expect(thin, `entries with no usable reason: ${thin.join(', ')}`).toEqual([]);
  });
});
