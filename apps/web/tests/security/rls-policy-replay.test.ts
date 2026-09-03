import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import {
  parsePolicyStatements,
  replayPolicyStatements,
  diffPolicySets,
  applyBaseline,
  classifyZeroPolicyTables,
  assertCorpusIntegrity,
  CorpusIntegrityError,
  policyKey,
  type MigrationFile,
} from '../../scripts/audit/rls-policy-replay';

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

describe('parsePolicyStatements', () => {
  it('parses identically whether the source is CRLF or LF', () => {
    const lf = `CREATE POLICY tenant_isolation_policy ON "Truck" USING (true);\n`;
    const crlf = lf.replace(/\n/g, '\r\n');

    const fromLf = parsePolicyStatements('20260101000000_test', lf);
    const fromCrlf = parsePolicyStatements('20260101000000_test', crlf);

    expect(fromLf).toHaveLength(1);
    expect(fromCrlf).toHaveLength(1);
    expect(fromCrlf[0].table).toBe('Truck');
    expect(fromCrlf[0].policy).toBe('tenant_isolation_policy');
    // No trailing \r leaking into either captured identifier.
    expect(fromCrlf[0].table).not.toMatch(/\r/);
    expect(fromCrlf[0].policy).not.toMatch(/\r/);
  });

  it('does NOT match a CREATE POLICY inside a quoted dynamic-SQL string (the 330-vs-328 boundary)', () => {
    // Mirrors the shape in 20260802120000_document_import_phase1/migration.sql
    // lines 336/344: a DO $$ ... EXECUTE format('CREATE POLICY ...') block,
    // where the line begins with a single-quote, not the keyword.
    const dynamic = `DO $$\nBEGIN\n        'CREATE POLICY tenant_isolation_policy ON %I USING (true)';\nEND $$;\n`;
    const literal = `CREATE POLICY tenant_isolation_policy ON document_imports USING (true);\n`;

    expect(parsePolicyStatements('x', dynamic)).toHaveLength(0);
    expect(parsePolicyStatements('x', literal)).toHaveLength(1);
  });

  it('parses both quoted and bare identifiers, stripping quotes', () => {
    const sql = [
      `CREATE POLICY "Tag" ON "Truck" USING (true);`,
      `CREATE POLICY carrier_drivers_org_select ON carrier_drivers USING (true);`,
    ].join('\n');

    const stmts = parsePolicyStatements('x', sql);
    expect(stmts).toHaveLength(2);

    expect(stmts[0].policy).toBe('Tag');
    expect(stmts[0].table).toBe('Truck');
    expect(stmts[0].policy).not.toMatch(/"/);
    expect(stmts[0].table).not.toMatch(/"/);

    expect(stmts[1].policy).toBe('carrier_drivers_org_select');
    expect(stmts[1].table).toBe('carrier_drivers');
  });

  it('records DROP POLICY IF EXISTS with ifExists=true, and a plain DROP with ifExists=false', () => {
    const sql = [
      `DROP POLICY IF EXISTS foo ON bar;`,
      `DROP POLICY baz ON qux;`,
    ].join('\n');

    const stmts = parsePolicyStatements('x', sql);
    expect(stmts[0].ifExists).toBe(true);
    expect(stmts[1].ifExists).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

describe('replayPolicyStatements', () => {
  it('leaves a balanced DROP-then-CREATE pair across two migrations present exactly once', () => {
    const files: MigrationFile[] = [
      { migration: '20260101000000_a', sql: `DROP POLICY IF EXISTS p ON t;` },
      { migration: '20260102000000_b', sql: `CREATE POLICY p ON t USING (true);` },
    ];
    const { expected } = replayPolicyStatements(files);
    expect(expected.has('t.p')).toBe(true);
    expect(expected.size).toBe(1);
  });

  it('CREATE in migration A followed by DROP in migration B leaves the key absent', () => {
    const files: MigrationFile[] = [
      { migration: '20260101000000_a', sql: `CREATE POLICY p ON t USING (true);` },
      { migration: '20260102000000_b', sql: `DROP POLICY p ON t;` },
    ];
    const { expected } = replayPolicyStatements(files);
    expect(expected.has('t.p')).toBe(false);
  });

  it('the reverse order (DROP then CREATE) leaves the key present', () => {
    const files: MigrationFile[] = [
      { migration: '20260101000000_a', sql: `DROP POLICY IF EXISTS p ON t;` },
      { migration: '20260102000000_b', sql: `CREATE POLICY p ON t USING (true);` },
    ];
    const { expected } = replayPolicyStatements(files);
    expect(expected.has('t.p')).toBe(true);
  });

  it('throws on unsorted input rather than silently replaying out of order', () => {
    const files: MigrationFile[] = [
      { migration: '20260102000000_b', sql: `CREATE POLICY p ON t USING (true);` },
      { migration: '20260101000000_a', sql: `DROP POLICY p ON t;` },
    ];
    expect(() => replayPolicyStatements(files)).toThrow(/not sorted ascending/);
  });

  it('a balanced 46 DROP / 46 CREATE within one migration leaves the net set unchanged', () => {
    const sql = Array.from({ length: 46 }, (_, i) => [
      `DROP POLICY IF EXISTS old_${i} ON t_${i};`,
      `CREATE POLICY old_${i} ON t_${i} USING (true);`,
    ].join('\n')).join('\n');

    const { expected, statements } = replayPolicyStatements([{ migration: 'x', sql }]);
    expect(statements).toHaveLength(92); // 46 DROP + 46 CREATE parsed
    expect(expected.size).toBe(46); // net: each pair leaves exactly one live
  });
});

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

describe('diffPolicySets', () => {
  it('reports both directions when each is non-empty', () => {
    const expected = new Set(['t.a', 't.b', 't.c']);
    const live = new Set(['t.b', 't.d']);

    const diff = diffPolicySets(expected, live);
    expect(diff.missing).toEqual(['t.a', 't.c']);
    expect(diff.unexpected).toEqual(['t.d']);
  });

  it('reports nothing when the sets match exactly', () => {
    const s = new Set(['t.a']);
    const diff = diffPolicySets(s, new Set(s));
    expect(diff.missing).toEqual([]);
    expect(diff.unexpected).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Baseline
// ---------------------------------------------------------------------------

describe('applyBaseline', () => {
  it('suppresses a missing entry that is present in the baseline', () => {
    const diff = { missing: ['t.a'], unexpected: [] };
    const result = applyBaseline(diff, { missing: ['t.a'], unexpected: [] });
    expect(result.newMissing).toEqual([]);
    expect(result.staleMissing).toEqual([]);
  });

  it('surfaces a baseline entry that is no longer missing as staleMissing', () => {
    const diff = { missing: [], unexpected: [] }; // t.a has been rebuilt live
    const result = applyBaseline(diff, { missing: ['t.a'], unexpected: [] });
    expect(result.staleMissing).toEqual(['t.a']);
    expect(result.newMissing).toEqual([]);
  });

  it('surfaces a missing policy absent from the baseline as newMissing', () => {
    const diff = { missing: ['t.a', 't.z'], unexpected: [] };
    const result = applyBaseline(diff, { missing: ['t.a'], unexpected: [] });
    expect(result.newMissing).toEqual(['t.z']);
    expect(result.staleMissing).toEqual([]);
  });

  it('applies the same rule to the unexpected direction', () => {
    const diff = { missing: [], unexpected: ['u.x'] };
    const suppressed = applyBaseline(diff, { missing: [], unexpected: ['u.x'] });
    expect(suppressed.newUnexpected).toEqual([]);

    const stale = applyBaseline({ missing: [], unexpected: [] }, { missing: [], unexpected: ['u.x'] });
    expect(stale.staleUnexpected).toEqual(['u.x']);
  });
});

// ---------------------------------------------------------------------------
// Zero-policy classification
// ---------------------------------------------------------------------------

describe('classifyZeroPolicyTables', () => {
  it('places a forced+zero table only in forcedZero', () => {
    const result = classifyZeroPolicyTables([
      { table: 'stops', rlsEnabled: true, rlsForced: true, policyCount: 0 },
    ]);
    expect(result.forcedZero).toEqual(['stops']);
    expect(result.enabledZero).toEqual([]);
  });

  it('places an enabled-not-forced+zero table only in enabledZero', () => {
    const result = classifyZeroPolicyTables([
      { table: '_prisma_migrations', rlsEnabled: true, rlsForced: false, policyCount: 0 },
    ]);
    expect(result.enabledZero).toEqual(['_prisma_migrations']);
    expect(result.forcedZero).toEqual([]);
  });

  it('places a table with live policies in neither class', () => {
    const result = classifyZeroPolicyTables([
      { table: 'facilities', rlsEnabled: true, rlsForced: true, policyCount: 2 },
    ]);
    expect(result.forcedZero).toEqual([]);
    expect(result.enabledZero).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Integrity floors
// ---------------------------------------------------------------------------

describe('assertCorpusIntegrity', () => {
  it('throws CorpusIntegrityError when a floor is breached', () => {
    expect(() =>
      assertCorpusIntegrity({ migrationFileCount: 1, statementCount: 1, expectedPolicyCount: 1 })
    ).toThrow(CorpusIntegrityError);
  });

  it('does not throw when all floors are met', () => {
    expect(() =>
      assertCorpusIntegrity({
        migrationFileCount: 141,
        statementCount: 328,
        expectedPolicyCount: 230,
      })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Real corpus — the guard that actually protects the reproduction numbers.
//
// Per this repo's rule for any test reading source/fixture files off disk: a
// "was it actually found" assertion AND a length floor, with CRLF
// normalised (core.autocrlf=true, no .gitattributes — migration.sql is CRLF
// in the working tree).
//
// 328 statements parsed and 230 expected policies are quick-584's numbers,
// hard-coded here on purpose. If a future migration legitimately changes
// them, THIS TEST FAILING is the intended prompt to update both these
// numbers and the committed baseline together — not to loosen this
// assertion.
// ---------------------------------------------------------------------------

describe('real migration corpus (quick-584 reproduction)', () => {
  const migrationsDir = join(__dirname, '../../prisma/migrations');

  function loadCorpus(): MigrationFile[] {
    const entries = readdirSync(migrationsDir).filter((name) => {
      const full = join(migrationsDir, name);
      if (!statSync(full).isDirectory()) return false;
      try {
        statSync(join(full, 'migration.sql'));
        return true;
      } catch {
        return false;
      }
    });
    entries.sort();

    return entries.map((migration) => ({
      migration,
      sql: readFileSync(join(migrationsDir, migration, 'migration.sql'), 'utf8').replace(
        /\r\n/g,
        '\n'
      ),
    }));
  }

  it('reads at least 130 real migration files from disk', () => {
    const files = loadCorpus();
    expect(files.length).toBeGreaterThanOrEqual(130);
  });

  it('parses exactly 328 statements and computes exactly 230 expected policies', () => {
    const files = loadCorpus();
    expect(files.length).toBeGreaterThan(0); // "was it actually found"

    const { statements, expected } = replayPolicyStatements(files);

    // quick-584 reproduction numbers — see docs/diagnostics/rls-policy-drop-forensics.md §5
    expect(statements.length).toBe(328);
    expect(expected.size).toBe(230);

    // The integrity floors must also hold against the real corpus.
    expect(() =>
      assertCorpusIntegrity({
        migrationFileCount: files.length,
        statementCount: statements.length,
        expectedPolicyCount: expected.size,
      })
    ).not.toThrow();
  });

  it('policyKey helper matches what the parser/replay produce', () => {
    expect(policyKey({ table: 'stops', policy: 'stops_org_select' })).toBe(
      'stops.stops_org_select'
    );
  });
});
